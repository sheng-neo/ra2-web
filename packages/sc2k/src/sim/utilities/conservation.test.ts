// ===== sim/utilities/conservation.test.ts =====（spec:power-water §2.4 第 4 步 / §4 第 6 条：Energy Conservation = 容量 +1/12 整除，704 → 762）
import { describe, expect, it } from 'vitest';
import { XBit, tileIndex } from '../../contracts/grid';
import { OrdinanceId } from '../../contracts/state';
import type { StubProfile } from '../../contracts/testkit';
import { createTestContext, runDays } from '../../testkit';
import { fakePlacementSystem, paintLot, place } from './fixtures';
import { createUtilitiesSystem } from './index';

const PROFILES = ['optimistic', 'pessimistic'] as const;
const HOUSE = 0x70, COAL = 0xcf, GAS = 0xc9;
const mk = (profile: StubProfile) => createTestContext({ profile, systems: [createUtilitiesSystem(), fakePlacementSystem()] });
const enact = (state: ReturnType<typeof mk>['state']): void => { state.economy.ordinances |= 1 << OrdinanceId.EnergyConservation; };

describe.each(PROFILES)('Energy Conservation（%s 桩）', (profile) => {
  it('煤电 704 → 762；法令撤销后经 requestRescan 回到 704', () => {
    const t = mk(profile);
    enact(t.state);
    expect(t.ctx.q.economy.ordinance(OrdinanceId.EnergyConservation)).toBe(true);
    place(t.host, COAL, 10, 10);
    runDays(t.host, 2);
    expect(t.state.utilities.power.generation).toBe(762);
    t.state.economy.ordinances = 0;
    t.ctx.act.requestRescan('power');
    runDays(t.host, 1);
    expect(t.state.utilities.power.generation).toBe(704);
  });
  it('整除而非乘 11/12：燃气 176 → 190', () => {
    const t = mk(profile);
    enact(t.state);
    place(t.host, GAS, 10, 10);
    runDays(t.host, 2);
    expect(t.state.utilities.power.generation).toBe(190);
  });
  it('1008 座房子：无法令 688 座受电（704 − 16 自耗），有法令 746 座', () => {
    const build = (withOrdinance: boolean) => {
      const t = mk(profile);
      if (withOrdinance) enact(t.state);
      paintLot(t.state, COAL, 0, 0);
      for (let x = 0; x < 4; x++) for (let y = 4; y < 128; y++) paintLot(t.state, HOUSE, x, y);
      for (let x = 4; x < 8; x++) for (let y = 0; y < 128; y++) paintLot(t.state, HOUSE, x, y);
      runDays(t.host, 2);                                                    // 直接画层不置脏：第 1 天 powerScan 阶段扫描
      let lit = 0;
      for (let i = 0; i < t.state.layers.xbld.length; i++) if (t.state.layers.xbld[i] === HOUSE && (t.state.layers.xbit[i]! & XBit.Powered) !== 0) lit++;
      return { lit, report: t.state.utilities.power, xbit: t.state.layers.xbit };
    };
    const off = build(false), on = build(true);
    expect(off.lit).toBe(688); expect(on.lit).toBe(746);
    expect(off.report).toEqual({ generation: 704, consumers: 1008, supplied: 704, usagePct: 100, unpoweredBuildingTiles: 320 });
    expect(on.report).toEqual({ generation: 762, consumers: 1008, supplied: 762, usagePct: 100, unpoweredBuildingTiles: 262 });
    expect((off.xbit[tileIndex(0, 0)]! & XBit.Powered) !== 0).toBe(true);
  });
});

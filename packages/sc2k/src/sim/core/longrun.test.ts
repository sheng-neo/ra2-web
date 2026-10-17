// ===== sim/core/longrun.test.ts =====（ARCHITECTURE §10.4 无头长跑不变量；WORKPLAN WP1 验收：骨架 + 不变量）
// 默认跑 3 年（金城）/ 2 年（空城）的缩短版；SC2K_LONGRUN=1 时 50 年 / 100 年。只断言不变量，不断言精确数值。
// 人口区间断言（第 20 年 normalPop ∈ [3000, 60000]）只在 SC2K_LONGRUN 且 zones 不是桩时启用（桩下人口恒 0）。
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../../data';
import {
  DAYS_PER_YEAR, GOLDEN_LAYOUT, checkInvariants, checkPopulation, createTestContext, flattenTerrain, forEachGoldenRectTile, goldenMiniCity, runDays, runHeadless,
} from '../../testkit';
import type { PopulationSample } from '../../testkit';

const LONG = process.env.SC2K_LONGRUN === '1' || process.env.SC2K_LONGRUN === 'true';
const CITY_YEARS = LONG ? 50 : 3;
const EMPTY_YEARS = LONG ? 100 : 2;
const CONSTRUCTION_IDS = new Set(CATALOGUE.BUILDINGS.filter((b) => b.transition === 'construction').map((b) => b.id));

describe('longrun: 金城脚本', () => {
  it.each(['optimistic', 'pessimistic'] as const)(`[%s] ${CITY_YEARS} 年：不抛错、每年末不变量全通过、哈希逐年变化、无 NaN`, (profile) => {
    const { host } = createTestContext({ profile });
    const zonesIsStub = host.systems.find((s) => s.id === 'zones')?.stub === true;
    const samples: PopulationSample[] = [];
    const records = runHeadless(host, goldenMiniCity('full'), {
      years: CITY_YEARS, afterNewCity: (h) => flattenTerrain(h.state),
      onYear: (r) => { samples.push({ year: r.year, month: 0, normalPop: host.state.census.normalPop }); },
    });
    expect(records).toHaveLength(CITY_YEARS);
    for (const r of records) {
      expect(r.invariants, `year ${r.year}`).toEqual([]);
      expect(Number.isFinite(r.hash) && Number.isFinite(r.pop) && Number.isFinite(r.funds)).toBe(true);
      expect(r.age).toBe(r.year * DAYS_PER_YEAR);
    }
    expect(new Set(records.map((r) => r.hash)).size).toBe(CITY_YEARS);           // prngState / age 逐年不同
    expect(host.state.clock.age).toBe(CITY_YEARS * DAYS_PER_YEAR);
    if (LONG && !zonesIsStub) expect(checkPopulation(samples)).toEqual([]);
    expect(checkInvariants(host.state, host.catalogue)).toEqual([]);
  });
  it('noPower 反例：24 个月内分区内无施工 / 建筑瓦片（桩下平凡成立；真 zones 合入后成为"无电不长"的证据）', () => {
    const { host, state } = createTestContext({ profile: 'realistic' });
    runHeadless(host, goldenMiniCity('noPower'), { years: 2, afterNewCity: (h) => flattenTerrain(h.state), invariants: false });
    let construction = 0, built = 0;
    for (const r of GOLDEN_LAYOUT.zones) forEachGoldenRectTile(r, (i) => { const id = state.layers.xbld[i]!; if (CONSTRUCTION_IDS.has(id)) construction++; else if (id >= 0x70) built++; });
    expect(construction).toBe(0); expect(built).toBe(0);
    expect(checkInvariants(state, host.catalogue)).toEqual([]);
  });
  it('noRoad 变体脚本不含道路命令；full 变体含 2 段道路与 3 段电线', () => {
    const full = goldenMiniCity('full'), noRoad = goldenMiniCity('noRoad'), noPower = goldenMiniCity('noPower');
    const count = (cmds: typeof full.commands, kind: string): number => cmds.filter((c) => c.cmd.type === 'network' && c.cmd.kind === kind).length;
    expect(count(full.commands, 'road')).toBe(2); expect(count(full.commands, 'power')).toBe(3);
    expect(count(noRoad.commands, 'road')).toBe(0); expect(count(noRoad.commands, 'power')).toBe(3);
    expect(count(noPower.commands, 'power')).toBe(0); expect(count(noPower.commands, 'road')).toBe(2);
  });
});

describe('longrun: 空城', () => {
  it(`${EMPTY_YEARS} 年人口恒 0、资金不变（桩下）、不变量全通过、诊断不超封顶`, () => {
    const { host, state, ctx } = createTestContext();
    const samples: PopulationSample[] = [];
    const funds0 = state.economy.funds;
    for (let y = 1; y <= EMPTY_YEARS; y++) {
      runDays(host, DAYS_PER_YEAR);
      samples.push({ year: y, month: 0, normalPop: state.census.normalPop });
      expect(checkInvariants(state, host.catalogue), `year ${y}`).toEqual([]);
      host.drainEvents();
    }
    expect(checkPopulation(samples, { emptyCity: true })).toEqual([]);
    expect(state.economy.funds).toBe(funds0);
    expect(ctx.diag.length).toBeLessThanOrEqual(512);
    expect(state.clock.age).toBe(EMPTY_YEARS * DAYS_PER_YEAR);
  });
  it('事件缓冲不 drain 也不会无限增长（封顶并记一次 warn）', () => {
    const { host, ctx } = createTestContext();
    runDays(host, 9000);                                           // 9000 天 > eventCap 8192 条 dayTick
    expect(ctx.events.length).toBeLessThanOrEqual(8192);
    expect(ctx.diag.filter((d) => d.code === 'core.eventOverflow')).toHaveLength(1);
  });
});

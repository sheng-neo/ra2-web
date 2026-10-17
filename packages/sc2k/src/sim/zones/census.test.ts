// ===== sim/zones/census.test.ts =====（spec:zones §2.7：税基含 arco、断电按 0、workforcePctUsed 来源、tiles 与 counts.zone 同口径）
import { describe, expect, it } from 'vitest';
import { ZoneCode } from '../../contracts/grid';
import { CATALOGUE } from '../../data';
import { createTestContext, runDays } from '../../testkit';
import { zoneTableFor } from './buildings';
import { tallyCensus } from './census';
import { placeLot, zoneRect } from './fixtures';
import { createZonesSystem } from './index';
import { createRuntime } from './lots';
import type { ZonesCtx } from './lots';
import { createZonesPriv } from './priv';
import { DEFAULT_ZONES_TUNING } from './tuning';
import type { ZonesTuning } from './tuning';

const Z = (tuning: Partial<ZonesTuning> = {}): ZonesCtx => ({ T: { ...DEFAULT_ZONES_TUNING, ...tuning }, tbl: zoneTableFor(CATALOGUE), priv: createZonesPriv(), rt: createRuntime() });

describe.each(['optimistic', 'pessimistic'] as const)('普查（%s）', (profile) => {
  it('税基含 arco：arcoPop 60000、resPop 0 → taxed 10000 / 5000 / 5000，normalPop 0，citySize 60000（经第 21 天阶段）', () => {
    const { host, state } = createTestContext({ profile, systems: [createZonesSystem()] });
    state.census.arcoPop = 60000;
    runDays(host, 22);
    const c = state.census;
    expect(c.res).toBe(0); expect(c.normalPop).toBe(0); expect(c.citySize).toBe(60000); expect(c.arcoPop).toBe(60000);
    expect(c.taxableRes).toBe(10000); expect(c.taxableCom).toBe(5000); expect(c.taxableInd).toBe(5000);
    expect(c.workforcePctUsed).toBe(50); expect(c.workforce).toBe(5000); expect(c.jobs).toBe(10000); expect(c.unemployedN).toBe(0); expect(c.unemploymentPct).toBe(0);
  });
  it('建筑人口：乐观桩全部供电计入，悲观桩全部断电按 0；tiles 两者都计', () => {
    const { ctx, state } = createTestContext({ profile, systems: [createZonesSystem()] });
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 20, 20); zoneRect(ctx, ZoneCode.DenseC, 30, 10, 40, 20); zoneRect(ctx, ZoneCode.DenseI, 50, 10, 60, 20);
    placeLot(ctx, 0x70, 10, 10); placeLot(ctx, 0x8c, 12, 12); placeLot(ctx, 0xb2, 30, 10); placeLot(ctx, 0x84, 50, 10); placeLot(ctx, 0xc0, 52, 12);
    placeLot(ctx, 0x88, 16, 16); placeLot(ctx, 0xaa, 18, 18);                       // 施工 / 废弃：不计人口也不计 tiles
    tallyCensus(ctx, Z());
    const c = state.census;
    expect(c.tiles).toEqual({ res: 5, com: 9, ind: 10, total: 24 });
    if (profile === 'optimistic') { expect([c.res, c.com, c.ind]).toEqual([224, 700, 656]); expect(c.normalPop).toBe(1580); }
    else { expect([c.res, c.com, c.ind]).toEqual([0, 0, 0]); }
  });
});

describe('普查细节（现实桩）', () => {
  it('断电按 0：两栋同样的房子，只有通电的那栋计入；countUnpowered 时两栋都计', () => {
    const { ctx, state } = createTestContext({ profile: 'realistic', systems: [createZonesSystem()] });
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 20, 20);
    placeLot(ctx, 0x70, 10, 10, true); placeLot(ctx, 0x70, 12, 12, false);
    tallyCensus(ctx, Z());
    expect(state.census.res).toBe(24); expect(state.census.tiles.res).toBe(2);
    tallyCensus(ctx, Z({ countUnpowered: true }));
    expect(state.census.res).toBe(48);
  });
  it('workforcePctUsed 取 demographics.workforcePct，为 0 时回退 50；劳动力 / 岗位 / 失业率派生', () => {
    const { ctx, state } = createTestContext({ profile: 'realistic', systems: [createZonesSystem()] });
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 20, 20); zoneRect(ctx, ZoneCode.DenseC, 30, 10, 40, 20);
    for (let k = 0; k < 5; k++) placeLot(ctx, 0xae, 10, 10 + k * 3);               // 5 × 900 = 4500 居民
    tallyCensus(ctx, Z());
    expect(state.census.workforcePctUsed).toBe(50); expect(state.census.workforce).toBe(2250); expect(state.census.jobs).toBe(0);
    expect(state.census.unemployedN).toBe(2250); expect(state.census.unemploymentPct).toBe(100);
    state.demographics.workforcePct = 37;
    placeLot(ctx, 0xb2, 30, 10);                                                    // 700 岗位
    tallyCensus(ctx, Z());
    expect(state.census.workforcePctUsed).toBe(37); expect(state.census.workforce).toBe(Math.floor((4500 * 37) / 100));
    expect(state.census.jobs).toBe(700); expect(state.census.unemployedN).toBe(1665 - 700); expect(state.census.unemploymentPct).toBe(Math.round((100 * 965) / 1665));
  });
  it('census.tiles 与 core 的 counts.zone 同口径（已建 R/C/I 建筑格；槽 0 总数、2/4/6 = R/C/I）', () => {
    const { ctx, state } = createTestContext({ profile: 'realistic', systems: [createZonesSystem()] });
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 20, 20); zoneRect(ctx, ZoneCode.DenseC, 30, 10, 40, 20); zoneRect(ctx, ZoneCode.DenseI, 50, 10, 60, 20);
    placeLot(ctx, 0x70, 10, 10); placeLot(ctx, 0x90, 12, 12); placeLot(ctx, 0xb9, 30, 10); placeLot(ctx, 0x9e, 50, 10); placeLot(ctx, 0xa6, 54, 10); placeLot(ctx, 0xc4, 56, 14);
    tallyCensus(ctx, Z());
    const z = state.counts.zone, t = state.census.tiles;
    expect(t.res).toBe(z[2]); expect(t.com).toBe(z[4]); expect(t.ind).toBe(z[6]); expect(t.total).toBe(z[0]);
    expect(t).toEqual({ res: 5, com: 9, ind: 4, total: 18 });
  });
});

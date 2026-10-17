// ===== sim/zones/timers.test.ts =====（spec:zones §3.4 dailyTimers：施工 / 断电 / 废弃计时、日末不消费 PRNG、挂起日延后不重复计数）
import { describe, expect, it } from 'vitest';
import { Corner, ZoneCode, tileIndex } from '../../contracts/grid';
import type { System } from '../../contracts/system';
import { CATALOGUE } from '../../data';
import { createTestContext, nullSystem, runDays } from '../../testkit';
import { zoneTableFor } from './buildings';
import { isAbandonedId, isBuiltZoneId, isRubbleId, placeLot, roadLine, zoneRect } from './fixtures';
import { createZonesSystem } from './index';
import type { ZonesPriv } from './priv';
import { DEFAULT_ZONES_TUNING } from './tuning';

const T = DEFAULT_ZONES_TUNING, TBL = zoneTableFor(CATALOGUE);
const STILL = { zones: { fixedDemand: { r: 0, c: 0, i: 0 } } };
const privOf = (s: { priv: { zones?: unknown } }): ZonesPriv => s.priv.zones as ZonesPriv;

describe.each(['optimistic', 'pessimistic'] as const)('施工计时（%s）', (profile) => {
  it('1x1 恰 constructDays[0] 天后完工，3x3 恰 constructDays[2] 天；完工建筑 level / 占地正确', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createZonesSystem()], tuning: STILL });
    state.demand.r = state.demand.c = state.demand.i = 0;
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 20, 20);
    const a1 = placeLot(ctx, 0x88, 10, 10), a3 = placeLot(ctx, 0xc2, 14, 14);
    const xbld = state.layers.xbld;
    runDays(host, T.constructDays[0] - 1);
    expect(xbld[a1]).toBe(0x88);
    runDays(host, 1);
    expect(isBuiltZoneId(xbld[a1]!)).toBe(true); expect(TBL.level[xbld[a1]!]).toBe(1);
    expect(xbld[a3]).toBe(0xc2);
    runDays(host, T.constructDays[2] - T.constructDays[0] - 1);
    expect(xbld[a3]).toBe(0xc2);
    runDays(host, 1);
    const id = xbld[a3]!;
    expect(isBuiltZoneId(id)).toBe(true); expect(TBL.level[id]).toBe(4); expect(TBL.zoneIdx[id]).toBe(0);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) expect(xbld[tileIndex(14 + dx, 14 + dy)]).toBe(id);
    expect(state.layers.xzon[a3]! & 0xf0).toBe(Corner.TL);
    expect(privOf(state).phaseDays[a3]).toBe(0);
  });
});

describe('断电 / 废弃计时（现实桩：POWERED 位由测试给）', () => {
  it('断电第 61 天衰退一级；废弃 abandonToRubbleDays 天后瓦砾；通电建筑 300 天不变', () => {
    const { ctx, host, state } = createTestContext({ profile: 'realistic', systems: [createZonesSystem()], tuning: STILL });
    state.demand.r = state.demand.c = state.demand.i = 0;
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 20, 20);
    const dark = placeLot(ctx, 0x70, 10, 10, false), lit = placeLot(ctx, 0x71, 14, 14, true);
    roadLine(ctx, 12, 16, 16, 16);                                                 // 通电的那栋要有路，否则出行失败也会（正确地）衰退
    const xbld = state.layers.xbld, p = privOf(state);
    runDays(host, T.unpoweredGraceDays);
    expect(xbld[dark]).toBe(0x70); expect(p.unpoweredDays[dark]).toBe(T.unpoweredGraceDays);
    runDays(host, 1);
    expect(isAbandonedId(xbld[dark]!)).toBe(true); expect(p.phaseDays[dark]).toBe(0);
    runDays(host, T.abandonToRubbleDays - 1);
    expect(isAbandonedId(xbld[dark]!)).toBe(true);
    runDays(host, 1);
    expect(isRubbleId(xbld[dark]!)).toBe(true); expect(state.layers.xzon[dark]! & 0xf0).toBe(Corner.All); expect(state.layers.xzon[dark]! & 0x0f).toBe(ZoneCode.DenseR);
    runDays(host, 300 - T.unpoweredGraceDays - 1 - T.abandonToRubbleDays);
    expect(xbld[lit]).toBe(0x71); expect(p.unpoweredDays[lit]).toBe(0);
  });
  it('endOfDay 前后 prng.state() 相同（到期转换的随机变体来自 hash32）', () => {
    const sys = createZonesSystem();
    const { ctx, state } = createTestContext({ profile: 'realistic', systems: [sys] });
    zoneRect(ctx, ZoneCode.DenseC, 10, 10, 30, 30);
    const c = placeLot(ctx, 0xa6, 10, 10), b = placeLot(ctx, 0x94, 14, 14, false), a = placeLot(ctx, 0xc4, 20, 20);
    const p = privOf(state);
    p.phaseDays[c] = T.constructDays[1] - 1; p.unpoweredDays[b] = T.unpoweredGraceDays; p.phaseDays[a] = T.abandonToRubbleDays - 1;
    const before = ctx.prng.state();
    sys.endOfDay!(ctx);
    expect(ctx.prng.state()).toBe(before);
    const xbld = state.layers.xbld;
    expect(isBuiltZoneId(xbld[c]!)).toBe(true); expect(TBL.level[xbld[c]!]).toBe(2); expect(TBL.zoneIdx[xbld[c]!]).toBe(1);
    expect(isAbandonedId(xbld[b]!)).toBe(true); expect(TBL.level[xbld[b]!]).toBe(2);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) expect(isRubbleId(xbld[tileIndex(20 + dx, 20 + dy)]!)).toBe(true);
  });
  it('挂起日延后：endOfDay 每天恰一次，phaseDays 与不挂起的运行一致', () => {
    const build = (suspend: boolean) => {
      let once = suspend;
      const services: System = { ...nullSystem('services'), phases: { milestones: () => { if (once) { once = false; return 'suspend'; } return 'done'; } } };
      const t = createTestContext({ profile: 'realistic', systems: [createZonesSystem(), services], tuning: STILL });
      zoneRect(t.ctx, ZoneCode.DenseR, 10, 10, 12, 12);
      const a = placeLot(t.ctx, 0xaa, 10, 10);
      runDays(t.host, 40);
      return { days: privOf(t.state).phaseDays[a], hash: t.host.hash('full'), age: t.state.clock.age };
    };
    const plain = build(false), suspended = build(true);
    expect(plain.days).toBe(40); expect(suspended.days).toBe(40);
    expect(suspended.age).toBe(40); expect(suspended.hash).toBe(plain.hash);
  });
});

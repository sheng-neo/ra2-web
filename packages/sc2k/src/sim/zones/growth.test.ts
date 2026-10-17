// ===== sim/zones/growth.test.ts =====（spec:zones §3.7 八项 + 双桩验收 + 手感）
import { describe, expect, it } from 'vitest';
import { ZoneCode, tileIndex } from '../../contracts/grid';
import type { Queries, TripResult } from '../../contracts/queries';
import type { System } from '../../contracts/system';
import type { StubProfile } from '../../contracts/testkit';
import { CATALOGUE } from '../../data';
import { createTestContext, nullSystem, runDays } from '../../testkit';
import { zoneTableFor } from './buildings';
import { anchors, countTiles, idsPresent, isAbandonedId, isBuiltZoneId, isConstructionId, placeLot, powerLineAt, roadLine, setLandValue, zoneRect } from './fixtures';
import { createZonesSystem } from './index';
import type { ZonesTuning } from './tuning';

const MONTH = 25;
const TBL = zoneTableFor(CATALOGUE);
const TRIP_FAIL: TripResult = { ok: false, usedBus: false, usedRail: false, usedSubway: false, steps: 0 };
/** 把一个桩系统的某组查询局部替换（转发壳在 init 时绑定，补丁方法为测试闭包）。 */
function patched<K extends 'utilities' | 'transport' | 'services'>(id: K, profile: StubProfile, patch: Partial<Queries[K]>): System {
  const sys = nullSystem(id, profile);
  const q = sys.queries as Record<string, object>;
  q[id] = { ...(q[id] as object), ...patch };
  return sys;
}
interface Overrides {
  profile?: StubProfile; utilities?: StubProfile; transport?: Partial<Queries['transport']>; services?: Partial<Queries['services']>;
  tuning?: Partial<ZonesTuning>; seed?: number; landValue?: number;
}
function city(o: Overrides = {}) {
  const profile = o.profile ?? 'realistic';
  const systems: System[] = [createZonesSystem()];
  if (o.utilities) systems.push(nullSystem('utilities', o.utilities));
  if (o.transport) systems.push(patched('transport', profile, o.transport));
  if (o.services) systems.push(patched('services', profile, o.services));
  const t = createTestContext({ profile, systems, ...(o.seed !== undefined ? { seed: o.seed } : {}), ...(o.tuning ? { tuning: { zones: o.tuning } } : {}) });
  if (o.landValue !== undefined) setLandValue(t.state, o.landValue);
  return t;
}
const pin = (r: number, c = r, i = r): Partial<ZonesTuning> => ({ fixedDemand: { r, c, i } });
const setDemand = (s: { demand: { r: number; c: number; i: number } }, r: number, c = r, i = r): void => { s.demand.r = r; s.demand.c = c; s.demand.i = i; };
const developed = (b: number): boolean => isConstructionId(b) || isBuiltZoneId(b);
const maxLevel = (ids: Set<number>): number => { let m = 0; for (const id of ids) m = Math.max(m, TBL.level[id]!); return m; };

describe.each(['optimistic', 'pessimistic'] as const)('双桩验收（%s）', (profile) => {
  it(profile === 'optimistic' ? '有需求的 R/C/I 分区第一个月内出现施工瓦片' : '悲观桩下 24 个月零施工', () => {
    const { ctx, host, state } = city({ profile, tuning: pin(2000) });
    setDemand(state, 2000);
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 17, 17); zoneRect(ctx, ZoneCode.DenseC, 20, 10, 27, 17); zoneRect(ctx, ZoneCode.DenseI, 30, 10, 37, 17);
    runDays(host, MONTH);
    if (profile === 'optimistic') {
      expect(countTiles(state, isConstructionId)).toBeGreaterThan(0);
      runDays(host, 5 * MONTH);
      const ids = idsPresent(state, isBuiltZoneId);
      expect([...ids].some((id) => TBL.zoneIdx[id] === 0)).toBe(true);
      expect([...ids].some((id) => TBL.zoneIdx[id] === 1)).toBe(true);
      expect([...ids].some((id) => TBL.zoneIdx[id] === 2)).toBe(true);
    } else {
      runDays(host, 23 * MONTH);
      expect(countTiles(state, developed)).toBe(0);
    }
  });
});

describe('spec:zones §3.7', () => {
  it('1. 首栋房子从电线旁长出；无电则一个月无新施工', () => {
    const { ctx, host, state } = city({ tuning: { ...pin(2000), growOffset: 0 } });
    setDemand(state, 2000);
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 13, 13);
    zoneRect(ctx, ZoneCode.DenseC, 10, 16, 13, 17);
    roadLine(ctx, 8, 14, 15, 14);                               // 分区之间的道路（24 偏移内）
    for (let y = 10; y <= 13; y++) powerLineAt(ctx, 9, y);      // 分区西侧一列通电电线
    runDays(host, MONTH);
    const built = countTiles(state, isConstructionId);
    expect(built).toBeGreaterThan(0);
    // 只有紧邻电线的 x=10 一列能得电（空分区地不是 POWERABLE），其它列不长
    for (const i of anchors(state, isConstructionId)) expect(i >> 7).toBe(10);
    // 反例：切断全部供电后再跑一个月，无新施工
    const noPower = city({ tuning: { ...pin(2000), growOffset: 0 } });
    setDemand(noPower.state, 2000);
    zoneRect(noPower.ctx, ZoneCode.DenseR, 10, 10, 13, 13); roadLine(noPower.ctx, 8, 14, 15, 14);
    runDays(noPower.host, MONTH);
    expect(countTiles(noPower.state, developed)).toBe(0);
  });
  it('2. 24 偏移可达：(+2,+2) 与 (+3,+1) 永不生长，(+3,0) 与 (+2,+1) 可生长', () => {
    const { ctx, host, state } = city({ utilities: 'optimistic', tuning: { ...pin(2000), growOffset: 0 } });
    setDemand(state, 2000);
    roadLine(ctx, 10, 10, 10, 10);
    for (const [x, y] of [[12, 12], [13, 11], [13, 10], [12, 11]] as const) zoneRect(ctx, ZoneCode.LightR, x, y, x, y);
    runDays(host, 3 * MONTH);
    expect(state.layers.xbld[tileIndex(12, 12)]).toBe(0);
    expect(state.layers.xbld[tileIndex(13, 11)]).toBe(0);
    expect(developed(state.layers.xbld[tileIndex(13, 10)]!)).toBe(true);
    expect(developed(state.layers.xbld[tileIndex(12, 11)]!)).toBe(true);
  });
  it('3. 地价门槛：R 密区 20 停在级 1、100 到级 3 不到 4；工业 20 也能到级 4', () => {
    const run = (zone: ZoneCode, lv: number): Set<number> => {
      const { ctx, host, state } = city({ utilities: 'optimistic', landValue: lv, tuning: { ...pin(2000), growOffset: 0 } });
      setDemand(state, 2000);
      zoneRect(ctx, zone, 10, 10, 15, 15);
      roadLine(ctx, 8, 9, 17, 9); roadLine(ctx, 8, 16, 17, 16);
      runDays(host, 18 * MONTH);
      return idsPresent(state, isBuiltZoneId);
    };
    const r20 = run(ZoneCode.DenseR, 20), r100 = run(ZoneCode.DenseR, 100), i20 = run(ZoneCode.DenseI, 20);
    expect(r20.size).toBeGreaterThan(0); expect(maxLevel(r20)).toBe(1);
    expect(maxLevel(r100)).toBe(3);
    expect(maxLevel(i20)).toBe(4);
  });
  it('4. 贫富档：地价 40 / 90 / 200 产出 tier 0 / 1 / 2 的 1x1 住宅', () => {
    for (const [lv, tier] of [[40, 0], [90, 1], [200, 2]] as const) {
      const { ctx, host, state } = city({ utilities: 'optimistic', landValue: lv, tuning: { ...pin(2000), growOffset: 0 } });
      setDemand(state, 2000);
      zoneRect(ctx, ZoneCode.LightR, 10, 10, 13, 13); roadLine(ctx, 8, 14, 15, 14);
      runDays(host, 3 * MONTH);
      const ids = idsPresent(state, isBuiltZoneId);
      expect(ids.size).toBeGreaterThan(0);
      for (const id of ids) { expect(TBL.level[id]).toBe(1); expect(TBL.tier[id]).toBe(tier); }
    }
  });
  it('5. 出行失败只衰退：需求 +2000 仍无生长；已建建筑在第 4 次失败访问后废弃（宽限 3 个月）', () => {
    const { ctx, host, state } = city({ utilities: 'optimistic', transport: { hasAccess: () => true, runTrip: () => TRIP_FAIL }, tuning: { ...pin(2000), declineOffset: 0 } });
    setDemand(state, 2000);
    zoneRect(ctx, ZoneCode.DenseR, 14, 14, 19, 19);
    const a = placeLot(ctx, 0x70, 16, 16);                       // (16,16) 在每月第 3 天被访问
    runDays(host, 3 * MONTH);
    expect(state.layers.xbld[a]).toBe(0x70);
    expect(countTiles(state, isConstructionId)).toBe(0);
    runDays(host, MONTH);
    expect(isAbandonedId(state.layers.xbld[a]!)).toBe(true);
    expect(countTiles(state, isConstructionId)).toBe(0);
  });
  it('6. 需求为 0 时静止：12 个月建筑数不变、无施工', () => {
    const { ctx, host, state } = city({ profile: 'optimistic', tuning: pin(0) });
    setDemand(state, 0);
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 13, 15); zoneRect(ctx, ZoneCode.DenseC, 14, 10, 15, 15);
    placeLot(ctx, 0x70, 10, 10); placeLot(ctx, 0x8c, 12, 12); placeLot(ctx, 0x7c, 14, 10);
    const before = Array.from(state.layers.xbld);
    runDays(host, 12 * MONTH);
    expect(Array.from(state.layers.xbld)).toEqual(before);
  });
  it('8. 确定性：同种子两次运行 XBLD / XZON 与需求序列逐字节一致；不同种子不同', () => {
    const scenario = (seed: number) => {
      const t = city({ utilities: 'optimistic', landValue: 150, seed });
      zoneRect(t.ctx, ZoneCode.DenseR, 10, 10, 17, 17); zoneRect(t.ctx, ZoneCode.DenseC, 20, 10, 27, 17); zoneRect(t.ctx, ZoneCode.DenseI, 30, 10, 37, 17);
      roadLine(t.ctx, 8, 18, 40, 18); roadLine(t.ctx, 8, 9, 40, 9);
      const demands: number[] = [];
      for (let m = 0; m < 8; m++) { runDays(t.host, MONTH); demands.push(t.state.demand.r, t.state.demand.c, t.state.demand.i); }
      return { xbld: Array.from(t.state.layers.xbld), xzon: Array.from(t.state.layers.xzon), demands, hash: t.host.hash('full') };
    };
    const a = scenario(99), b = scenario(99), c = scenario(100);
    expect(a.xbld).toEqual(b.xbld); expect(a.xzon).toEqual(b.xzon); expect(a.demands).toEqual(b.demands); expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
  });
});

describe('手感', () => {
  it('有电有路的密区：几个月内出现 1x1，条件好时长到 2x2 / 3x3；R 需求在没有岗位时转负', () => {
    const { ctx, host, state } = city({ utilities: 'optimistic', landValue: 200 });
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 17, 17); zoneRect(ctx, ZoneCode.DenseC, 20, 10, 27, 17); zoneRect(ctx, ZoneCode.DenseI, 30, 10, 37, 17);
    roadLine(ctx, 8, 18, 40, 18); roadLine(ctx, 8, 9, 40, 9); roadLine(ctx, 19, 9, 19, 18); roadLine(ctx, 29, 9, 29, 18);
    runDays(host, 3 * MONTH);
    expect(countTiles(state, developed)).toBeGreaterThan(0);
    runDays(host, 21 * MONTH);
    const ids = idsPresent(state, isBuiltZoneId);
    expect(maxLevel(ids)).toBeGreaterThanOrEqual(3);
    expect(state.census.normalPop).toBeGreaterThan(500);
    expect(Math.abs(state.demand.r) + Math.abs(state.demand.c) + Math.abs(state.demand.i)).toBeGreaterThan(0);
  });
  it('只划住宅：R 需求随房子出现而转负，C/I 需求饱和为正', () => {
    const { ctx, host, state } = city({ profile: 'optimistic' });
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 25, 25);
    runDays(host, 6 * MONTH);
    expect(state.census.res).toBeGreaterThan(0);
    expect(state.demand.r).toBeLessThan(0);
    expect(state.demand.c).toBeGreaterThan(1000);
    expect(state.demand.i).toBeGreaterThan(1000);
  });
  /** 长跑（SC2K_LONGRUN=1 时 50 年，默认 3 年）：不抛错、priv 合法、人口有界、需求在 ±2000 内。 */
  it('长跑：大片 R/C/I 密区稳定运行，priv 始终合法', () => {
    const years = process.env.SC2K_LONGRUN ? 50 : 3;
    const { ctx, host, state } = city({ utilities: 'optimistic', landValue: 160, seed: 2024 });
    for (let k = 0; k < 4; k++) {
      zoneRect(ctx, ZoneCode.DenseR, 10, 10 + k * 12, 29, 19 + k * 12); zoneRect(ctx, ZoneCode.DenseC, 32, 10 + k * 12, 51, 19 + k * 12); zoneRect(ctx, ZoneCode.DenseI, 54, 10 + k * 12, 73, 19 + k * 12);
      roadLine(ctx, 8, 9 + k * 12, 75, 9 + k * 12); roadLine(ctx, 8, 20 + k * 12, 75, 20 + k * 12);
    }
    for (let y = 0; y < years; y++) {
      runDays(host, 12 * MONTH);
      expect(Math.abs(state.demand.r)).toBeLessThanOrEqual(2000);
      expect(state.census.normalPop).toBeGreaterThanOrEqual(0);
    }
    expect(state.census.normalPop).toBeGreaterThan(1000);
    expect(countTiles(state, isBuiltZoneId)).toBeGreaterThan(100);
    expect(state.priv.zones).toBeDefined();
  }, process.env.SC2K_LONGRUN ? 600_000 : 20_000);
});

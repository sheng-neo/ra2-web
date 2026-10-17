// ===== sim/zones/demand.test.ts =====（spec:zones §2.8 / §3.2：空城特例、税率表插值、cap 惩罚、固定需求、产业税率、邻城市场项、法令乘数、诉求事件）
import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../contracts/grid';
import { NET_BASE } from '../../contracts/net';
import { OrdinanceId } from '../../contracts/state';
import type { CensusSnapshot, CityState } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { CATALOGUE } from '../../data';
import { createTestContext, runDays } from '../../testkit';
import { zoneTableFor } from './buildings';
import { computeDemand, taxModAt } from './demand';
import { createRuntime } from './lots';
import type { ZonesCtx } from './lots';
import { createZonesSystem } from './index';
import { CONNECTION_MARK } from './neighbors';
import { createZonesPriv } from './priv';
import { DEFAULT_ZONES_TUNING, lerpTable } from './tuning';
import type { ZonesTuning } from './tuning';

const T = DEFAULT_ZONES_TUNING;
/** 边缘连接格：网络瓦片（经 TileWriter）+ XTXT 0xFA（transport 的职责，测试直接写层）。 */
function connect(ctx: SimContext, x: number, y: number, id: number): void {
  const i = tileIndex(x, y);
  ctx.act.setXbld(i, id);
  ctx.state.layers.xtxt[i] = CONNECTION_MARK;
}
const Z = (tuning: Partial<ZonesTuning> = {}): ZonesCtx => ({ T: { ...T, ...tuning }, tbl: zoneTableFor(CATALOGUE), priv: createZonesPriv(), rt: createRuntime() });
/** 中性经济：税率 7（修正 0）、trend 1（修正 0）、难度 2（敏感度 1、工业难度修正 0）、无噪声。 */
function neutral(state: CityState): void {
  state.economy.taxRate = { r: 7, c: 7, i: 7 }; state.economy.industryTax.fill(7); state.economy.difficulty = 2; state.national.trend = 1;
  state.demand.r = state.demand.c = state.demand.i = 0;
}
function setCensus(state: CityState, p: Partial<Omit<CensusSnapshot, 'tiles'>>): void { Object.assign(state.census, p); }
const QUIET: Partial<ZonesTuning> = { noise: 0 };
/** 居民 1000（劳动力 500）、无岗位、无 arco 的小城。 */
function smallTown(state: CityState): void {
  setCensus(state, { res: 1000, com: 0, ind: 0, taxableRes: 1000, taxableCom: 0, taxableInd: 0, workforcePctUsed: 50, workforce: 500, jobs: 0 });
}
const once = (ctx: SimContext, z: ZonesCtx): { r: number; c: number; i: number } => { computeDemand(ctx, z); return { ...ctx.state.demand }; };

describe.each(['optimistic', 'pessimistic'] as const)('需求合成（%s）', (profile) => {
  it('空城特例：第一步 = base/4，反复后收敛到 {800, 300, 500}', () => {
    const { ctx, state } = createTestContext({ profile, systems: [createZonesSystem()] });
    neutral(state);
    expect(once(ctx, Z(QUIET))).toEqual({ r: 200, c: 75, i: 125 });
    for (let k = 0; k < 40; k++) computeDemand(ctx, Z(QUIET));
    expect(state.demand).toEqual({ r: 800, c: 300, i: 500 });
  });
  it('固定需求（tuning.fixedDemand）直接写入且不消费 PRNG', () => {
    const { ctx, state } = createTestContext({ profile, systems: [createZonesSystem()] });
    const before = ctx.prng.state();
    computeDemand(ctx, Z({ fixedDemand: { r: 1234, c: -5000, i: 0 } }));
    expect(state.demand).toEqual({ r: 1234, c: -2000, i: 0 });
    expect(ctx.prng.state()).toBe(before);
  });
});

describe('税率修正', () => {
  it('税率表与插值：12 → −360，12.5 → −410，20 / 25 → −1500，负值 → +400', () => {
    expect(taxModAt(T, 7)).toBe(0); expect(taxModAt(T, 12)).toBe(-360); expect(taxModAt(T, 12.5)).toBe(-410);
    expect(taxModAt(T, 20)).toBe(-1500); expect(taxModAt(T, 25)).toBe(-1500); expect(taxModAt(T, -3)).toBe(400);
  });
  it('住宅税 13% 比 7% 需求低（>12% 明显下降），难度敏感度 easy 0.75 / hard 1.25', () => {
    const { ctx, state } = createTestContext({ systems: [createZonesSystem()] });
    neutral(state); smallTown(state);
    const base = once(ctx, Z(QUIET));
    state.demand.r = 0; state.economy.taxRate.r = 13;
    const taxed = once(ctx, Z(QUIET));
    expect(base.r - taxed.r).toBe(460 / 4);
    state.demand.r = 0; state.economy.difficulty = 1;
    expect(Math.abs(base.r - once(ctx, Z(QUIET)).r - (460 * 0.75) / 4)).toBeLessThanOrEqual(1);
    state.demand.r = 0; state.economy.difficulty = 3;
    expect(Math.abs(base.r - once(ctx, Z(QUIET)).r - (460 * 1.25) / 4)).toBeLessThanOrEqual(1);
  });
  it('产业税率读 economy.industryTax：全部 15% 时工业需求下降 680/4；按 ratio 加权（ratio 全在产业 0 时只看 tax[0]）', () => {
    const { ctx, state } = createTestContext({ systems: [createZonesSystem()] });
    neutral(state); smallTown(state);
    const base = once(ctx, Z(QUIET));
    state.demand.i = 0; state.economy.industryTax.fill(15);
    expect(base.i - once(ctx, Z(QUIET)).i).toBe(680 / 4);
    state.demand.i = 0; state.industry.ratio.fill(0); state.industry.ratio[0] = 100; state.economy.industryTax.fill(0); state.economy.industryTax[0] = 20;
    expect(base.i - once(ctx, Z(QUIET)).i).toBe(1500 / 4);
  });
});

describe('cap 与市场项', () => {
  it('cap 惩罚：R 人口 ≥ 2 × cap 时 −800（ratioGain = 0 隔离主干）', () => {
    const { ctx, state } = createTestContext({ systems: [createZonesSystem()] });
    neutral(state);
    setCensus(state, { res: 30000, taxableRes: 30000, workforce: 15000, jobs: 0 });
    expect(once(ctx, Z({ ...QUIET, ratioGain: 0 })).r).toBe(-200);
    state.demand.r = 0; setCensus(state, { res: 15000, taxableRes: 15000 });
    expect(once(ctx, Z({ ...QUIET, ratioGain: 0 })).r).toBe(-100);
    state.demand.r = 0; setCensus(state, { res: 5000, taxableRes: 5000 });
    expect(once(ctx, Z({ ...QUIET, ratioGain: 0 })).r).toBe(0);
    expect(state.caps).toEqual({ r: 10000, c: 10000, i: 10000 });
  });
  it('休闲建筑抬高 R cap；邻城道路连接抬高 C cap，铁路 / 高速抬高 I cap', () => {
    const { ctx, state } = createTestContext({ systems: [createZonesSystem()] });
    neutral(state);
    for (let k = 0; k < 3; k++) ctx.act.setXbld(100 + k, 0x0d);                       // 3 座小公园
    // S 边（邻城 0）：两条道路、一条铁路、一条双车道高速（demand 阶段先按 XTXT 0xFA 重算连接）
    connect(ctx, 20, 127, NET_BASE.road + 1); connect(ctx, 24, 127, NET_BASE.road + 1); connect(ctx, 30, 127, NET_BASE.rail + 1);
    connect(ctx, 40, 127, 0x49); connect(ctx, 41, 127, 0x49);
    computeDemand(ctx, Z(QUIET));
    expect(state.neighbors[0]!.connections).toEqual({ road: 2, rail: 1, highway: 1 });
    expect(state.caps).toEqual({ r: 13000, c: 14000, i: 30000 });
  });
  it('marketC 只计公路连接的邻城人口，marketI 只计铁路 / 高速', () => {
    const { ctx, state } = createTestContext({ systems: [createZonesSystem()] });
    neutral(state);
    setCensus(state, { res: 1000, com: 1000, ind: 1000, taxableRes: 1000, taxableCom: 1000, taxableInd: 1000, workforcePctUsed: 50, workforce: 500, jobs: 2000 });
    state.neighbors[1]!.population = 50000;
    const none = once(ctx, Z(QUIET));
    state.demand.r = state.demand.c = state.demand.i = 0; connect(ctx, 0, 20, NET_BASE.road + 0);            // W 边 → 邻城 1：公路
    const road = once(ctx, Z(QUIET));
    expect(state.neighbors[1]!.connections.road).toBe(1);
    state.demand.r = state.demand.c = state.demand.i = 0; ctx.act.setXbld(tileIndex(0, 20), NET_BASE.rail + 0);   // 同一格改为铁路
    const rail = once(ctx, Z(QUIET));
    expect(state.neighbors[1]!.connections).toEqual({ road: 0, rail: 1, highway: 0 });
    // 1900 年 shareC = 0.30：targetC 150 → 1150（+50000×0.02），targetI 350 → 2350（+50000×0.04）
    expect(road.c).toBeGreaterThan(none.c); expect(road.i).toBe(none.i);
    expect(rail.i).toBeGreaterThan(none.i); expect(rail.c).toBe(none.c);
    expect(road.c - none.c).toBe(Math.round(((1150 / 1000 - 1) * 1500 - (150 / 1000 - 1) * 1500) / 4));
  });
  it('年代转移：commerceShare 1900 0.30 / 1975 0.50 / 2050+ 0.68，中点线性', () => {
    expect(lerpTable(T.commerceShare, 1800)).toBe(0.30); expect(lerpTable(T.commerceShare, 1975)).toBe(0.50);
    expect(lerpTable(T.commerceShare, 2100)).toBe(0.68); expect(lerpTable(T.commerceShare, 1912.5)).toBeCloseTo(0.325, 10);
  });
  it('法令乘数来自 CATALOGUE.ORDINANCES（City Beautification 使 targetR ×1.01）', () => {
    const { ctx, state } = createTestContext({ systems: [createZonesSystem()] });
    neutral(state);
    setCensus(state, { res: 1000, com: 500, ind: 500, taxableRes: 1000, taxableCom: 500, taxableInd: 500, workforcePctUsed: 50, workforce: 500, jobs: 1000 });
    const plain = once(ctx, Z(QUIET));
    state.demand.r = state.demand.c = state.demand.i = 0;
    state.economy.ordinances = 1 << OrdinanceId.CityBeautification;
    const beautified = once(ctx, Z(QUIET));
    // targetR = 1000/0.5 = 2000 → base 1500；×1.01 → 1530；第一步 /4
    expect(plain.r).toBe(375); expect(beautified.r).toBe(Math.round(1530 / 4));
    expect(beautified.c).toBe(plain.c);
  });
});

describe('阶段集成与诉求', () => {
  it('第 21 天 census → demand：空城需求从初值向 base 收敛，caps 写入 state', () => {
    const { host, state } = createTestContext({ profile: 'optimistic', systems: [createZonesSystem()] });
    expect(state.demand).toEqual({ r: 800, c: 300, i: 500 });
    runDays(host, 22);
    expect(state.demand.r).not.toBe(800);
    expect(Math.abs(state.demand.r)).toBeLessThanOrEqual(2000);
    expect(state.caps.r).toBe(10000);
  });
  it('市民诉求 citizenDemand：每种每年最多一次；公园类四选一', () => {
    const { ctx, host, state } = createTestContext({ systems: [createZonesSystem()] });
    neutral(state);
    setCensus(state, { res: 20000, taxableRes: 20000, workforce: 10000, jobs: 0, normalPop: 20000 });
    const z = Z(QUIET);
    computeDemand(ctx, z); computeDemand(ctx, z);
    const first = host.drainEvents().filter((e) => e.type === 'citizenDemand').map((e) => (e as { key: string }).key);
    expect(first.filter((k) => /park|zoo|stadium|marina/.test(k))).toHaveLength(1);
    expect(first).toContain('complaint.school'); expect(first).toContain('complaint.fire');
    state.clock.age += 300;                                                            // 下一年再提示一次
    computeDemand(ctx, z);
    const next = host.drainEvents().filter((e) => e.type === 'citizenDemand');
    expect(next.length).toBeGreaterThan(0);
  });
});

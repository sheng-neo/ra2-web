// ===== sim/zones/neighbors.test.ts =====（spec:zones §2.8.5 / §2.10：natPop 缩放的初始化、连接邻城增长更快、连接重算口径）
import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../contracts/grid';
import { NET_BASE, isHighway, isRail, isRoad } from '../../contracts/net';
import type { CityState } from '../../contracts/state';
import type { System } from '../../contracts/system';
import { createTestContext, nullSystem, runDays } from '../../testkit';
import { createZonesSystem } from './index';
import { CONNECTION_MARK, connectionTotals, edgeOfTile, natPopOf, recountConnections } from './neighbors';
import { DEFAULT_ZONES_TUNING } from './tuning';

const T = DEFAULT_ZONES_TUNING;
const HIGHWAY_ID = 0x49;
/** 边缘连接格：写瓦片 + XTXT 0xFA（transport 的职责，这里直接写层）。 */
function connectAt(state: CityState, x: number, y: number, id: number, mark = true): void {
  const i = tileIndex(x, y);
  state.layers.xbld[i] = id;
  if (mark) state.layers.xtxt[i] = CONNECTION_MARK;
}
/** 与 recountConnections 同口径的 transport.connections() 假实现（高速两格一条）；state 延迟解析（ctx 在 createTestContext 之后才有）。 */
function fakeTransport(getState: () => CityState): System {
  const sys = nullSystem('transport');
  const q = sys.queries as Record<string, object>;
  q.transport = { ...(q.transport as object), connections: () => {
    const state = getState();
    let roads = 0, rails = 0, hwy = 0;
    const edge = (x: number, y: number): void => {
      const i = tileIndex(x, y);
      if (state.layers.xtxt[i] !== CONNECTION_MARK) return;
      const b = state.layers.xbld[i]!;
      if (isHighway(b)) hwy++; else if (isRail(b)) rails++; else if (isRoad(b)) roads++;
    };
    for (let x = 0; x < 128; x++) { edge(x, 0); edge(x, 127); }
    for (let y = 1; y < 127; y++) { edge(0, y); edge(127, y); }
    const industry = rails + ((hwy + 1) >> 1);
    return { commerce: roads, industry, total: roads + industry };
  } };
  return sys;
}

describe('初始化', () => {
  it('natPop 表：1900 → 10000、1925 → 17500、2000 → 60000、2100 → 150000（千人）', () => {
    expect(natPopOf(T, 1900)).toBe(10000); expect(natPopOf(T, 1925)).toBe(17500); expect(natPopOf(T, 2000)).toBe(60000); expect(natPopOf(T, 2100)).toBe(150000);
  });
  it.each(['optimistic', 'pessimistic'] as const)('4 座邻城：名字原创且互异、value = pop × 5..15、fame 0..100、edge = 下标（%s）', (profile) => {
    const { state } = createTestContext({ profile, systems: [createZonesSystem()], params: { startYear: 1950, difficulty: 3 } });
    const names = new Set<string>();
    state.neighbors.forEach((nb, k) => {
      expect(nb.edge).toBe(k);
      expect(nb.name).toBe(T.neighborNames[nb.index]); expect(nb.name.length).toBeGreaterThan(0); names.add(nb.name);
      expect(nb.population).toBeGreaterThanOrEqual(Math.round((T.neighborPopMin * 25000) / 10000));
      expect(nb.population).toBeLessThanOrEqual(Math.round((T.neighborPopMax * 25000) / 10000));
      expect(nb.value % nb.population).toBe(0);
      const mul = nb.value / nb.population;
      expect(mul).toBeGreaterThanOrEqual(T.neighborValueMin); expect(mul).toBeLessThanOrEqual(T.neighborValueMax);
      expect(nb.fame).toBeGreaterThanOrEqual(0); expect(nb.fame).toBeLessThanOrEqual(T.neighborFameMax);
      expect(nb.connections).toEqual({ road: 0, rail: 0, highway: 0 });
    });
    expect(names.size).toBe(4);
    expect(state.national).toEqual({ population: 25000, value: 7500, tax: 1, trend: 2 });
  });
  it('初始人口按 natPop(year) 缩放：同种子 2050 年 ≈ 1900 年的 15 倍', () => {
    const a = createTestContext({ systems: [createZonesSystem()], seed: 7, params: { startYear: 1900 } }).state;
    const b = createTestContext({ systems: [createZonesSystem()], seed: 7, params: { startYear: 2050 } }).state;
    for (let k = 0; k < 4; k++) {
      expect(Math.abs(b.neighbors[k]!.population - 15 * a.neighbors[k]!.population)).toBeLessThanOrEqual(8);
      expect(b.neighbors[k]!.name).toBe(a.neighbors[k]!.name);
    }
  });
});

describe('年度增长与连接', () => {
  it('有公路连接的邻城增长更快（同种子对照），其它邻城不受影响', () => {
    const run = (connected: boolean) => {
      const t = createTestContext({ systems: [createZonesSystem()], seed: 3 });
      if (connected) connectAt(t.state, 64, 127, NET_BASE.road + 1);              // S 边 → edge 0
      runDays(t.host, 301);                                                        // 跨过第二年 1 月第 0 天的 neighborsAnnual
      return t.state;
    };
    const plain = run(false), conn = run(true);
    expect(conn.neighbors[0]!.connections.road).toBe(1);
    expect(conn.neighbors[0]!.population).toBeGreaterThan(plain.neighbors[0]!.population);
    for (let k = 1; k < 4; k++) expect(conn.neighbors[k]!.population).toBe(plain.neighbors[k]!.population);
    for (let k = 0; k < 4; k++) expect(plain.neighbors[k]!.population).toBeGreaterThan(0);
  });
  it('国家经济：每年 1 月 trend 在 0..2 内游走，population 按年份表', () => {
    const { host, state } = createTestContext({ systems: [createZonesSystem()], params: { startYear: 1900, difficulty: 2 } });
    expect(state.national.population).toBe(natPopOf(T, 1900));
    runDays(host, 1);                                                                // 第 0 天的年度阶段（建城当天也算 1 月）
    for (let y = 0; y < 6; y++) {
      runDays(host, 300);                                                            // 停在下一年 1 月第 0 天之后
      expect(state.national.trend).toBeGreaterThanOrEqual(0); expect(state.national.trend).toBeLessThanOrEqual(2);
      expect(state.national.population).toBe(natPopOf(T, 1901 + y));
    }
  });
  it('连接重算：边 → 邻城按 edge 映射，只认 XTXT 0xFA + 道路 / 铁路 / 高速，高速双车道算一条；之和 == q.transport.connections().total', () => {
    const { ctx } = createTestContext({ systems: [createZonesSystem()] });
    let late: CityState | null = null;
    const t2 = createTestContext({ systems: [createZonesSystem(), fakeTransport(() => late!)] });
    const s = t2.state;
    late = s;
    connectAt(s, 10, 0, NET_BASE.road + 1);                 // N → edge 2
    connectAt(s, 11, 0, NET_BASE.road + 1);
    connectAt(s, 0, 20, NET_BASE.rail + 0);                 // W → edge 1
    connectAt(s, 127, 30, HIGHWAY_ID); connectAt(s, 127, 31, HIGHWAY_ID);   // E → edge 3（两格一条）
    connectAt(s, 40, 127, NET_BASE.road + 1);               // S → edge 0
    connectAt(s, 50, 127, NET_BASE.road + 1, false);        // 未标 0xFA：不算
    s.layers.xtxt[tileIndex(60, 0)] = CONNECTION_MARK;      // 标了 0xFA 但不是网络瓦片：不算
    connectAt(s, 64, 64, NET_BASE.road + 1);                // 非边缘：不算
    const tiles = recountConnections(s, T);
    expect(tiles).toBe(6);
    expect(s.neighbors[2]!.connections).toEqual({ road: 2, rail: 0, highway: 0 });
    expect(s.neighbors[1]!.connections).toEqual({ road: 0, rail: 1, highway: 0 });
    expect(s.neighbors[3]!.connections).toEqual({ road: 0, rail: 0, highway: 1 });
    expect(s.neighbors[0]!.connections).toEqual({ road: 1, rail: 0, highway: 0 });
    const sum = connectionTotals(s);
    expect(sum.road + sum.rail + sum.highway).toBe(t2.ctx.q.transport.connections().total);
    expect(edgeOfTile(T, 5, 0)).toBe(2); expect(edgeOfTile(T, 0, 5)).toBe(1); expect(edgeOfTile(T, 127, 5)).toBe(3); expect(edgeOfTile(T, 5, 127)).toBe(0); expect(edgeOfTile(T, 5, 5)).toBe(-1);
    expect(ctx.q.transport.connections().total).toBe(0);
  });
});

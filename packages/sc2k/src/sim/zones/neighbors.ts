// ===== sim/zones/neighbors.ts =====
// 邻城与国家经济（spec:zones §2.8.5 / §2.10 / §3.5）：新城初始化、年度更新（1 月，消费 PRNG）、边缘连接重算（只读 XTXT 0xFA + 瓦片类型，纯函数）。
// PRNG 顺序（固定）：initNeighbors 每城 pop float → value int → fame int → 名字 int；neighborsAnnual 每城 1 次 float；nationalAnnual 1 次 int。
import { MAP, tileIndex } from '../../contracts/grid';
import { isHighway, isRail, isRoad } from '../../contracts/net';
import type { CityState, NeighborCity } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import type { ZonesCtx } from './lots';
import { clampInt, lerpTable } from './tuning';
import type { EdgeSide, ZonesTuning } from './tuning';

/** 邻城连接格的 XTXT 标记（spec:transport §2.13 [高]）。 */
export const CONNECTION_MARK = 0xfa;
const EDGE_MAX = MAP - 1;

/** 国家人口（千人）。 */
export const natPopOf = (T: ZonesTuning, year: number): number => Math.round(lerpTable(T.natPop, year));
const natValueOf = (T: ZonesTuning, pop: number): number => Math.floor((pop * T.natValueNum) / T.natValueDen);

export function initNational(ctx: SimContext, Z: ZonesCtx, year: number, difficulty: number): void {
  const n = ctx.state.national, T = Z.T;
  n.population = natPopOf(T, year);
  n.value = natValueOf(T, n.population);
  n.tax = 1;
  n.trend = clampInt(difficulty - 1, 0, 2) as 0 | 1 | 2;
}

/** 每年 1 月：人口 / 价值按年份表，trend 以 1/4 · 1/2 · 1/4 概率 −1 / 0 / +1 随机游走并夹在 0..2。 */
export function nationalAnnual(ctx: SimContext, Z: ZonesCtx): void {
  const n = ctx.state.national, T = Z.T;
  n.population = natPopOf(T, ctx.q.economy.year());
  n.value = natValueOf(T, n.population);
  const r = ctx.prng.int(4);
  n.trend = clampInt(n.trend + (r === 0 ? -1 : r === 3 ? 1 : 0), 0, 2) as 0 | 1 | 2;
}

/** 新城：4 个邻城（pop0 按 natPop(year) 缩放、value = pop × 5..15、fame 0..100、原创名单不重复抽取）。 */
export function initNeighbors(ctx: SimContext, Z: ZonesCtx, year: number): void {
  const T = Z.T, prng = ctx.prng, names = T.neighborNames;
  const nat = natPopOf(T, year);
  const used = new Set<number>();
  for (let k = 0; k < 4; k++) {
    const nb = ctx.state.neighbors[k];
    if (!nb) continue;
    const popF = T.neighborPopMin + prng.float() * (T.neighborPopMax - T.neighborPopMin);
    nb.population = Math.round((popF * nat) / T.neighborPopScale);
    nb.value = nb.population * prng.range(T.neighborValueMin, T.neighborValueMax);
    nb.fame = prng.range(0, T.neighborFameMax);
    let idx = prng.int(names.length);
    let guard = 0;
    while (used.has(idx) && guard++ < names.length) idx = (idx + 1) % names.length;
    used.add(idx);
    nb.index = idx;
    nb.name = names[idx] ?? '';
    nb.edge = k as 0 | 1 | 2 | 3;
    nb.connections.road = 0; nb.connections.rail = 0; nb.connections.highway = 0;
  }
}

/** 每年 1 月：pop *= 1 + float(0, 0.04) + 0.02 × 已连接的网络种类数（道路 / 铁路 / 高速各 1）。 */
export function neighborsAnnual(ctx: SimContext, Z: ZonesCtx): void {
  const T = Z.T;
  for (const nb of ctx.state.neighbors) {
    const c = nb.connections;
    const types = (c.road > 0 ? 1 : 0) + (c.rail > 0 ? 1 : 0) + (c.highway > 0 ? 1 : 0);
    const g = 1 + ctx.prng.float() * T.neighborGrowthRandom + T.neighborGrowthPerType * types;
    nb.population = Math.round(nb.population * g);
  }
}

/** 边缘格所属的邻城下标（0..3）；非边缘格 −1。角格归 N / S 边。 */
export function edgeOfTile(T: ZonesTuning, x: number, y: number): number {
  let side: EdgeSide | null = null;
  if (y === 0) side = 'N'; else if (y === EDGE_MAX) side = 'S'; else if (x === 0) side = 'W'; else if (x === EDGE_MAX) side = 'E';
  if (side === null) return -1;
  return T.neighborEdgeSides.indexOf(side);
}

/**
 * 重算 4 个邻城的 connections（扫 4 条边 508 格：xtxt == 0xFA 且道路 / 铁路 / 高速）；高速双车道算一条（向上取整）。
 * 返回连接格总数（与 transport 的 connections().total 同口径，供测试对账）。
 */
export function recountConnections(state: CityState, T: ZonesTuning): number {
  const L = state.layers;
  const road = [0, 0, 0, 0], rail = [0, 0, 0, 0], hwy = [0, 0, 0, 0];
  let total = 0;
  const visit = (x: number, y: number): void => {
    const i = tileIndex(x, y);
    if (L.xtxt[i] !== CONNECTION_MARK) return;
    const b = L.xbld[i]!;
    const k = edgeOfTile(T, x, y);
    if (k < 0) return;
    if (isHighway(b)) hwy[k]!++;
    else if (isRail(b)) rail[k]!++;
    else if (isRoad(b)) road[k]!++;
    else return;
    total++;
  };
  for (let x = 0; x < MAP; x++) { visit(x, 0); visit(x, EDGE_MAX); }
  for (let y = 1; y < EDGE_MAX; y++) { visit(0, y); visit(EDGE_MAX, y); }
  for (let k = 0; k < 4; k++) {
    const nb: NeighborCity | undefined = state.neighbors[k];
    if (!nb) continue;
    nb.connections.road = road[k]!; nb.connections.rail = rail[k]!; nb.connections.highway = (hwy[k]! + 1) >> 1;
  }
  return total;
}

export const connectionTotals = (state: CityState): { road: number; rail: number; highway: number } => {
  let road = 0, rail = 0, highway = 0;
  for (const nb of state.neighbors) { road += nb.connections.road; rail += nb.connections.rail; highway += nb.connections.highway; }
  return { road, rail, highway };
};

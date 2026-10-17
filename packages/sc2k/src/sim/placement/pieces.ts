// ===== sim/placement/pieces.ts =====
// 网络片段的本地口径（spec:building-catalogue §2.3 形状序与交叉件键名、spec:transport §3.3、spec:power-water §2.11 地下交叉、spec:terrain §2.11.3 坡面）。
// 只做 placement 自己必须判定的事：族归属、直线 / 坡面片段、两族垂直交叉表、铁路半高件配对；平地同族的选形交给 q.transport.pieceFor。
import { Dir, inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import { NET_BASE, SLOPE_PIECE, isBridge, isHighway, isPowerCarrier, isRail, isRoad } from '../../contracts/net';
import type { NetFamily } from '../../contracts/net';

/** 行进轴：0 = L–R（沿 x），1 = T–B（沿 y）。与片段下标 0 / 1 同义。 */
export type Axis = 0 | 1;
export const AXIS_LR = 0 as const;
export const AXIS_TB = 1 as const;
export const perpendicular = (a: Axis): Axis => (a === AXIS_LR ? AXIS_TB : AXIS_LR);

export type NetKind = NetFamily | 'highway';
export type SurfaceKind = 'power' | 'road' | 'rail' | 'highway';
export type SurfaceFamily = 'power' | 'road' | 'rail';
export type UndFamily = 'pipe' | 'subway';
export const isUndFamily = (k: NetKind): k is UndFamily => k === 'pipe' || k === 'subway';

/** 各网络的工具 id（单价与科技门槛从 CATALOGUE 读，不在本目录复制价格）。 */
export const NET_TOOL: Readonly<Record<NetKind, string>> = {
  power: 'power.wires', road: 'roads.road', rail: 'rail.rail', subway: 'rail.subway', pipe: 'water.pipes', highway: 'roads.highway' };

/** 高速直线段 [LR, TB]（1×1 段，四段组成一块）。 */
export const HIGHWAY_STRAIGHT: readonly [number, number] = [0x49, 0x4a];
export const ELEVATED_WIRE = 0x5c;
export const RADIOACTIVE = 0x05, SMALL_PARK = 0x0d, TREE_LO = 0x06, TREE_HI = 0x0c;
export const XTXT_CONNECTION = 0xfa;

/** 可被网络 / 建筑直接覆盖的地表：空地、瓦砾、树木（spec:building-catalogue §3.4"树木 / 瓦砾 / 空地可覆盖"；放射性 0x05 与小公园 0x0D 不可）。 */
export const isCoverable = (v: number): boolean => v === 0 || (v >= 0x01 && v <= 0x04) || (v >= TREE_LO && v <= TREE_HI);

/** 坡面码 → 轴向（1 / 3 为 T–B 向的坡，2 / 4 为 L–R 向），其他 −1。 */
export function slopeAxis(s: number): Axis | -1 { return s === 1 || s === 3 ? AXIS_TB : s === 2 || s === 4 ? AXIS_LR : -1; }
/** 坡面码的低侧（坡脚）方向：1 = T 高 → B；2 = R 高 → L；3 = B 高 → T；4 = L 高 → R。 */
export const SLOPE_LOW_DIR: Readonly<Record<number, Dir>> = { 1: Dir.B, 2: Dir.L, 3: Dir.T, 4: Dir.R };
/** 平直族片段下标（0..14）；不是本族平直片段 → −1。 */
export function plainIndex(family: NetFamily, v: number): number { const k = v - NET_BASE[family]; return k >= 0 && k <= 14 ? k : -1; }
/** 直线 / 坡面片段的轴向（k = 0, 3, 5 → L–R；1, 2, 4 → T–B），弯 / 叉 / 十字 → −1。 */
export function pieceAxis(k: number): Axis | -1 { return k === 0 || k === 3 || k === 5 ? AXIS_LR : k === 1 || k === 2 || k === 4 ? AXIS_TB : -1; }
export const straightPiece = (family: NetFamily, axis: Axis): number => NET_BASE[family] + axis;
export const slopePiece = (family: NetFamily, s: number): number => NET_BASE[family] + SLOPE_PIECE[s]!;

/** 地表族归属（NET_FLAGS 口径：含交叉件、桥、匝道、车站格）。 */
export function surfaceHas(kind: SurfaceKind, v: number): boolean {
  switch (kind) {
    case 'power': return isPowerCarrier(v);
    case 'road': return isRoad(v);
    case 'rail': return isRail(v);
    case 'highway': return isHighway(v);
  }
}
/** 本族的桥件（BRIDGE_SET 不进 ROAD/RAIL_SET，故按族划分区间）：道路 0x51–0x59、铁路 0x5A/0x5B、电线 0x5C、高速 0x6A/0x6B。 */
export function bridgeOf(kind: SurfaceKind, v: number): boolean {
  if (!isBridge(v)) return false;
  switch (kind) {
    case 'power': return v === ELEVATED_WIRE;
    case 'road': return v >= 0x51 && v <= 0x59;
    case 'rail': return v === 0x5a || v === 0x5b;
    case 'highway': return v === 0x6a || v === 0x6b;
  }
}
/** 地下族归属：地铁 0x01–0x0F、管线 0x10–0x1E，十字口 0x1F/0x20 同属两族；0x22/0x23 不属任何可铺族。 */
export function undHas(kind: UndFamily, u: number): boolean {
  if (u === 0x1f || u === 0x20) return true;
  return kind === 'pipe' ? u >= 0x10 && u <= 0x1e : u >= 0x01 && u <= 0x0f;
}
/** 地表 XBLD 若是某族的平地直线（idx 0 / 1 或高速 0x49/0x4A），给出 (族, 轴)；否则 null。 */
export function flatStraightOf(v: number): { kind: SurfaceKind; axis: Axis } | null {
  if (v === HIGHWAY_STRAIGHT[0]) return { kind: 'highway', axis: AXIS_LR };
  if (v === HIGHWAY_STRAIGHT[1]) return { kind: 'highway', axis: AXIS_TB };
  for (const f of ['power', 'road', 'rail'] as const) {
    const k = plainIndex(f, v);
    if (k === 0 || k === 1) return { kind: f, axis: k as Axis };
  }
  return null;
}
/** 高速段（直线 / 交叉件）的高速轴向：0x49/0x4B/0x4D/0x4F → L–R；0x4A/0x4C/0x4E/0x50 → T–B；其他 −1。 */
export function highwayAxisOf(v: number): Axis | -1 {
  if (v === 0x49 || v === 0x4b || v === 0x4d || v === 0x4f) return AXIS_LR;
  if (v === 0x4a || v === 0x4c || v === 0x4e || v === 0x50) return AXIS_TB;
  return -1;
}

/**
 * 两族平地直线垂直相交的交叉件（spec:building-catalogue §2.3.1 的键名即口径）：
 *  电线×道路 0x43（电 TB / 路 LR）0x44（电 LR / 路 TB）；道路×铁路 0x45（路 LR / 轨 TB）0x46；电线×铁路 0x47（电 TB / 轨 LR）0x48；
 *  高速×道路 0x4B（高 LR / 路 TB）0x4C；高速×铁路 0x4D 0x4E；高速×电线 0x4F 0x50。
 * 同族 / 平行 / 不支持的组合 → −1。
 */
export function crossingPiece(a: SurfaceKind, aAxis: Axis, b: SurfaceKind, bAxis: Axis): number {
  if (a === b || aAxis === bAxis) return -1;
  const has = (k: SurfaceKind): boolean => a === k || b === k;
  const ax = (k: SurfaceKind): Axis => (a === k ? aAxis : bAxis);
  if (has('highway')) {
    const hwyLR = ax('highway') === AXIS_LR;
    if (has('road')) return hwyLR ? 0x4b : 0x4c;
    if (has('rail')) return hwyLR ? 0x4d : 0x4e;
    return hwyLR ? 0x4f : 0x50;                                   // power
  }
  if (has('power') && has('road')) return ax('power') === AXIS_TB ? 0x43 : 0x44;
  if (has('road') && has('rail')) return ax('road') === AXIS_LR ? 0x45 : 0x46;
  if (has('power') && has('rail')) return ax('power') === AXIS_TB ? 0x47 : 0x48;
  return -1;
}
/** 地下交叉（spec:power-water §2.11）：0x1F = 管线 T–B × 地铁 L–R；0x20 = 管线 L–R × 地铁 T–B。不垂直 / 对方不是直线 → −1。 */
export function undCrossingPiece(kind: UndFamily, axis: Axis, other: number): number {
  if (kind === 'pipe') {
    if (other === 0x01 && axis === AXIS_TB) return 0x1f;
    if (other === 0x02 && axis === AXIS_LR) return 0x20;
    return -1;
  }
  if (other === 0x10 && axis === AXIS_TB) return 0x20;
  if (other === 0x11 && axis === AXIS_LR) return 0x1f;
  return -1;
}

/** 铁路坡面件 ↔ 坡脚半高件（spec:building-catalogue §2.3.1）：0x2E↔0x3B 0x2F↔0x3C 0x30↔0x3D 0x31↔0x3E。 */
export const RAIL_HALF_OF_SLOPE: Readonly<Record<number, number>> = { 0x2e: 0x3b, 0x2f: 0x3c, 0x30: 0x3d, 0x31: 0x3e };
export const RAIL_SLOPE_OF_HALF: Readonly<Record<number, number>> = { 0x3b: 0x2e, 0x3c: 0x2f, 0x3d: 0x30, 0x3e: 0x31 };

/** 四邻（越界跳过），顺序 T R B L。 */
export function forEachNeighbor(i: number, fn: (j: number, d: Dir) => void): void {
  const x = tileX(i), y = tileY(i);
  if (inMap(x, y - 1)) fn(tileIndex(x, y - 1), Dir.T);
  if (inMap(x + 1, y)) fn(tileIndex(x + 1, y), Dir.R);
  if (inMap(x, y + 1)) fn(tileIndex(x, y + 1), Dir.B);
  if (inMap(x - 1, y)) fn(tileIndex(x - 1, y), Dir.L);
}
/** 地图边缘格所在边的法线轴（x 边 → L–R，y 边 → T–B；角格两条都给），不在边缘 → []。 */
export function edgeAxesOf(i: number): Axis[] {
  const x = tileX(i), y = tileY(i), out: Axis[] = [];
  if (x === 0 || x === 127) out.push(AXIS_LR);
  if (y === 0 || y === 127) out.push(AXIS_TB);
  return out;
}

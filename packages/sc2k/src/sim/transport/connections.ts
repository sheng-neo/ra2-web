// ===== sim/transport/connections.ts =====（spec:transport §2.13 邻城连接、§3.7 recountConnections、§4.13 / §4.19）
// 连接 = 边缘格（x==0 / x==127 / y==0 / y==127）上 XTXT == 0xFA 且承载"轴向垂直于地图边的直线片段"的道路 / 铁路 / 高速格；
// 0xFA 由 placement 的 neighborConnection 命令写入（本模块不写 0xFA，只在该格不再是任何网络格时清掉陈旧标记）。
// 高速两格宽：沿边连续的两个高速连接格合并为一条（tiles = 2）；commerce = 道路条数、industry = 铁路 + 高速条数、total = Σ tiles（MISC 0x1024 口径）。
import { Dir, tileIndex } from '../../contracts/grid';
import { NET_BASE, isHighway, isRail, isRoad } from '../../contracts/net';
import type { CityState } from '../../contracts/state';
import { MASK_LR, MASK_TB, crossoverAxis, familyPieceIdx, isRailHalf, railHalfIdx, straightAxisOfIdx } from './model';

export const CONNECTION_MARK = 0xfa;
export type ConnectionKind = 'road' | 'rail' | 'highway';
/** edge 按 Dir 编号：0 = T（y == 0）、1 = R（x == 127）、2 = B（y == 127）、3 = L（x == 0）。 */
export interface Connection { edge: Dir; kind: ConnectionKind; x: number; y: number; tiles: number }
export interface ConnectionSummary { commerce: number; industry: number; total: number }

/** 道路族在该格的"直线轴"（只认直线：15 片段的 0/1 与坡面件、交叉件中的道路轴）；非直线 → 0。 */
function roadStraightAxis(id: number): number {
  const k = familyPieceIdx('road', id);
  if (k >= 0) return straightAxisOfIdx(k);
  return crossoverAxis(id, 'road');
}
function railStraightAxis(id: number): number {
  const k = familyPieceIdx('rail', id);
  if (k >= 0) return straightAxisOfIdx(k);
  if (isRailHalf(id)) return straightAxisOfIdx(railHalfIdx(id));
  return crossoverAxis(id, 'rail');
}
function highwayStraightAxis(id: number): number {
  if (id === 0x49) return MASK_LR;
  if (id === 0x4a) return MASK_TB;
  return crossoverAxis(id, 'highway');
}
/** 边缘格 (x, y) 上的连接种类（不看 XTXT）；edgeAxis = 垂直于该边的轴。 */
export function connectionKindAt(id: number, edgeAxis: number): ConnectionKind | null {
  if (roadStraightAxis(id) === edgeAxis) return 'road';
  if (railStraightAxis(id) === edgeAxis) return 'rail';
  if (highwayStraightAxis(id) === edgeAxis) return 'highway';
  return null;
}
export const isEdgeTile = (x: number, y: number): boolean => x === 0 || x === 127 || y === 0 || y === 127;
export const isNetworkTile = (id: number): boolean => isRoad(id) || isRail(id) || isHighway(id);

/** 四条边的扫描定义：沿边 k = 0..127 的格坐标与垂直轴。 */
const EDGES: ReadonlyArray<{ edge: Dir; axis: number; at: (k: number) => [number, number] }> = [
  { edge: Dir.T, axis: MASK_TB, at: (k) => [k, 0] },
  { edge: Dir.R, axis: MASK_LR, at: (k) => [127, k] },
  { edge: Dir.B, axis: MASK_TB, at: (k) => [k, 127] },
  { edge: Dir.L, axis: MASK_LR, at: (k) => [0, k] },
];

/** 全量重算连接列表（O(512)）。 */
export function listConnections(state: CityState): Connection[] {
  const { xbld, xtxt } = state.layers;
  const out: Connection[] = [];
  for (const e of EDGES) {
    let prevHighway: Connection | null = null;
    for (let k = 0; k < 128; k++) {
      const [x, y] = e.at(k);
      const i = tileIndex(x, y);
      let kind: ConnectionKind | null = null;
      if (xtxt[i] === CONNECTION_MARK) kind = connectionKindAt(xbld[i]!, e.axis);
      if (kind === 'highway' && prevHighway && prevHighway.tiles === 1) { prevHighway.tiles = 2; prevHighway = null; continue; }
      if (kind === null) { prevHighway = null; continue; }
      const c: Connection = { edge: e.edge, kind, x, y, tiles: 1 };
      out.push(c);
      prevHighway = kind === 'highway' ? c : null;
    }
  }
  return out;
}
export function summarize(list: readonly Connection[]): ConnectionSummary {
  let commerce = 0, industry = 0, total = 0;
  for (const c of list) {
    if (c.kind === 'road') commerce++; else industry++;
    total += c.tiles;
  }
  return { commerce, industry, total };
}
export const connectionSummary = (state: CityState): ConnectionSummary => summarize(listConnections(state));

/** 该格若带 0xFA 但已不是任何网络格 → 清掉陈旧标记；返回是否改动（调用方负责 layerChanged('xtxt')）。 */
export function clearStaleMark(state: CityState, i: number): boolean {
  const L = state.layers;
  if (L.xtxt[i] !== CONNECTION_MARK || isNetworkTile(L.xbld[i]!)) return false;
  L.xtxt[i] = 0;
  return true;
}
/** 地铁瓦片数（MISC 0x0FE8 口径：XUND 地铁 15 片段 + 与水管的交叉件）。 */
export function subwayTileCount(state: CityState): number {
  const xund = state.layers.xund;
  let n = 0;
  for (let i = 0; i < xund.length; i++) {
    const u = xund[i]!;
    if ((u >= NET_BASE.subway && u <= NET_BASE.subway + 14) || u === 0x1f || u === 0x20) n++;
  }
  return n;
}

// ===== sim/events/common.ts =====（spec:disasters §2.6.1 可燃性表、§2.12.1 八方向、§3.4 公共谓词）
// 运行时对象、瓦片分类与几何小工具；被 fire / flood / actors / quake / destroy / machine 共用。
import { FOOTPRINT } from '../../contracts/footprint';
import { TILES, inMap, quarterOfTile, tileIndex, tileX, tileY } from '../../contracts/grid';
import { isBridge } from '../../contracts/net';
import type { CityState } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { getTuning } from '../../contracts/system';
import { createEventsPriv, isEventsPriv, normalizeEventsPriv } from './priv';
import type { EventsPriv } from './priv';
import { DEFAULT_EVENTS_TUNING } from './tuning';
import type { EventsTuning, FireTuning } from './tuning';

/** 系统闭包里的运行缓存（不入快照）；ctx 在 init / postLoad 绑定，查询与 Actions 经它读 state。 */
export interface EventsRuntime { ctx: SimContext | null }

export const tuningOf = (ctx: SimContext): EventsTuning => getTuning(ctx, 'events', DEFAULT_EVENTS_TUNING);

/** 取 priv（变更路径用）：缺失 / 版本不符时重建为空（ARCHITECTURE §3.3：迁移或丢弃，不得崩溃）。 */
export function privOf(state: CityState): EventsPriv {
  const p = state.priv.events;
  if (isEventsPriv(p)) return normalizeEventsPriv(p);
  const fresh = createEventsPriv();
  state.priv.events = fresh;
  return fresh;
}
/** 只读窥视（查询路径用）：不写 state。 */
export const peekPriv = (state: CityState): EventsPriv | null => (isEventsPriv(state.priv.events) ? state.priv.events : null);

/** 八方向：0 = 北（−y），顺时针。 */
export const DIR8_DX: readonly number[] = [0, 1, 1, 1, 0, -1, -1, -1];
export const DIR8_DY: readonly number[] = [-1, -1, 0, 1, 1, 1, 0, -1];
/** 四方向（T R B L）在八方向表中的下标。 */
export const DIR4_IN_8: readonly number[] = [0, 2, 4, 6];

/** 瓦片分类（spec §2.6.1 可燃性表的行）。 */
export const enum TileClass { Empty = 0, Rubble = 1, Trees = 2, Infra = 3, Building = 4 }
export function classOf(id: number): TileClass {
  if (id >= 0x70) return TileClass.Building;
  if (id >= 0x0e) return TileClass.Infra;
  if (id >= 0x06) return TileClass.Trees;          // 树 0x06..0x0C 与小公园 0x0D
  if (id >= 0x01 && id <= 0x04) return TileClass.Rubble;
  return TileClass.Empty;                           // 清地 0x00 / 放射 0x05
}
export const isPowerPlant = (id: number): boolean => id >= 0xc6 && id <= 0xcf;
export const isWaterFacility = (id: number): boolean => id === 0xdc || id === 0xeb || id === 0xf4 || id === 0xfa;
export const isRubble = (id: number): boolean => id >= 0x01 && id <= 0x04;

/** 可燃：瓦砾 / 树 / 建筑且非水面（道路 / 铁路 / 电线 / 桥不可燃，天然防火带）。 */
export function flammableAt(ctx: SimContext, i: number): boolean {
  const c = classOf(ctx.state.layers.xbld[i]!);
  if (c === TileClass.Empty || c === TileClass.Infra) return false;
  return !ctx.q.terrain.isWater(i);
}
/** 燃料 tick 数（按类别 / 占地边长）。 */
export function fuelFor(t: FireTuning, id: number): number {
  const c = classOf(id);
  if (c === TileClass.Rubble) return t.fuel.rubble;
  if (c === TileClass.Trees) return t.fuel.trees;
  const n = FOOTPRINT[id]!;
  return n >= 4 ? t.fuel.s4 : n === 3 ? t.fuel.s3 : n === 2 ? t.fuel.s2 : t.fuel.s1;
}
export function fuelFactorFor(t: FireTuning, id: number): number {
  const c = classOf(id);
  if (c === TileClass.Rubble) return t.fuelFactor.rubble;
  if (c === TileClass.Trees) return t.fuelFactor.trees;
  const n = FOOTPRINT[id]!;
  return n >= 4 ? t.fuelFactor.s4 : n === 3 ? t.fuelFactor.s3 : n === 2 ? t.fuelFactor.s2 : t.fuelFactor.s1;
}
export const isBridgeId = (id: number): boolean => isBridge(id);

/** 当前风力：飓风 / 火风暴覆盖值优先（windOverride −1 = 无）。 */
export const windOf = (state: CityState): number => (state.disaster.windOverride >= 0 ? state.disaster.windOverride : state.weather.wind);

/** 朝目标的贪心八方向（dx/dy 符号）。 */
export function toward8(fx: number, fy: number, tx: number, ty: number): number {
  const sx = tx > fx ? 1 : tx < fx ? -1 : 0, sy = ty > fy ? 1 : ty < fy ? -1 : 0;
  for (let d = 0; d < 8; d++) if (DIR8_DX[d] === sx && DIR8_DY[d] === sy) return d;
  return 0;                                          // 已在目标格：任意方向
}
export const cheb = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** 地图边缘格总数（周长 4×128 − 4）与第 k 个边缘格的坐标。 */
export const EDGE_TILES = 4 * 128 - 4;
export function edgeTile(k: number): { x: number; y: number } {
  if (k < 128) return { x: k, y: 0 };
  if (k < 256) return { x: k - 128, y: 127 };
  if (k < 256 + 126) return { x: 0, y: k - 256 + 1 };
  return { x: 127, y: k - 382 + 1 };
}
/** 四分格图（XPOP 等）在格 i 处的权重（+1 保证非零）。 */
export const quarterWeight = (map: Uint8Array, i: number): number => map[quarterOfTile(i)]! + 1;
export const tileOf = (x: number, y: number): number => tileIndex(x, y);
export { TILES, inMap, tileX, tileY };

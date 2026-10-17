// ===== sim/transport/runtime.ts =====（spec:transport §3.2 图层与索引、§3.5 可达缓存、§2.9.1 车站占地）
// 系统对象的闭包缓存：绑定的 ctx 引用、XBLD 影子层（增量 diff 用）、车站登记表（station / stationOf / stations）、
// 24 偏移可达缓存、roadTileCounts 增量计数。任一读档路径后由 postLoad 调 rebuildAll 整体重建；绑定前的查询在一份私有空城上作答。
import type { Actions } from '../../contracts/actions';
import { Corner, TILES, XBit, inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import { ACCESS_OFFSETS, StationKind, isBridge, isHighway, isRoad, isStationTile } from '../../contracts/net';
import type { Prng } from '../../contracts/prng';
import type { Queries } from '../../contracts/queries';
import { createCityState } from '../../contracts/state';
import type { CityState } from '../../contracts/state';
import { getTuning } from '../../contracts/system';
import type { SimContext } from '../../contracts/system';
import { stationKindOf } from './model';
import { DEFAULT_TRANSPORT_TUNING } from './tuning';
import type { TransportTuning } from './tuning';

/** 一座车站：anchor = 占地 T-L 锚格，n = 占地边长（§2.9.1）。 */
export interface Station { id: number; kind: StationKind; anchor: number; x0: number; y0: number; n: 1 | 2 }
export interface RoadTileCounts { roadTiles: number; highwayTiles: number; bridgeTiles: number }

export const ACCESS_UNKNOWN = 0, ACCESS_YES = 1, ACCESS_NO = 2;

export interface Runtime {
  state: CityState;
  q: Queries | null; act: Actions | null; prng: Prng | null;
  tune: TransportTuning;
  bound: boolean;
  /** 上次同步时的 XBLD（onTilesChanged 的 old 值来源）。 */
  shadow: Uint8Array;
  /** 车站种类（StationKind）按格；stationOf = 车站 id + 1（0 = 不是车站格）。 */
  station: Uint8Array; stationOf: Uint16Array; stations: Station[]; stationsDirty: boolean;
  /** 24 偏移可达缓存：0 未知 / 1 可达 / 2 不可达。 */
  access: Uint8Array;
  counts: RoadTileCounts;
}

export function createRuntime(): Runtime {
  return {
    state: createCityState(), q: null, act: null, prng: null, tune: DEFAULT_TRANSPORT_TUNING, bound: false,
    shadow: new Uint8Array(TILES), station: new Uint8Array(TILES), stationOf: new Uint16Array(TILES), stations: [], stationsDirty: true,
    access: new Uint8Array(TILES), counts: { roadTiles: 0, highwayTiles: 0, bridgeTiles: 0 },
  };
}

/** 绑定 ctx（init / postLoad / 首次 onTilesChanged）；state 对象换了或首次绑定 → 整体重建。 */
export function bind(rt: Runtime, ctx: SimContext): void {
  if (rt.bound && rt.state === ctx.state && rt.q === ctx.q) return;   // 热路径（growthVisit 每格一次）：已绑定直接返回
  const changed = !rt.bound || rt.state !== ctx.state;
  rt.state = ctx.state; rt.q = ctx.q; rt.act = ctx.act; rt.prng = ctx.prng;
  rt.tune = getTuning(ctx, 'transport', DEFAULT_TRANSPORT_TUNING);
  rt.bound = true;
  if (changed) rebuildAll(rt);
}

/** 从真源层整体重建全部缓存（不消费 PRNG、不写任何层）。 */
export function rebuildAll(rt: Runtime): void {
  rt.shadow.set(rt.state.layers.xbld);
  recountTiles(rt);
  rt.access.fill(ACCESS_UNKNOWN);
  rt.stationsDirty = true;
  rebuildStations(rt);
}

// ---------- roadTileCounts（§2.12.6 分母：roadTiles = ROAD_SET ∖ HIGHWAY_SET，highwayTiles 按格，bridgeTiles = BRIDGE_SET）----------
export const countsRoad = (id: number): boolean => isRoad(id) && !isHighway(id);
export function recountTiles(rt: Runtime): void {
  const xbld = rt.state.layers.xbld;
  let r = 0, h = 0, b = 0;
  for (let i = 0; i < TILES; i++) {
    const id = xbld[i]!;
    if (countsRoad(id)) r++;
    if (isHighway(id)) h++;
    if (isBridge(id)) b++;
  }
  rt.counts.roadTiles = r; rt.counts.highwayTiles = h; rt.counts.bridgeTiles = b;
}
/** 单格 old → nw 的增量计数。 */
export function bumpCounts(rt: Runtime, old: number, nw: number): void {
  const c = rt.counts;
  if (countsRoad(old)) c.roadTiles--;
  if (countsRoad(nw)) c.roadTiles++;
  if (isHighway(old)) c.highwayTiles--;
  if (isHighway(nw)) c.highwayTiles++;
  if (isBridge(old)) c.bridgeTiles--;
  if (isBridge(nw)) c.bridgeTiles++;
}

// ---------- 可达缓存（§3.5）----------
/** 是否"提供可达"的格：ROAD_SET 或车站占地任一格（按 XBLD 判断，不依赖登记表）。 */
export const isAccessTile = (id: number): boolean => isRoad(id) || isStationTile(id);
/** 格 t 的可达性发生变化 → 它的 24 个反向偏移格（偏移集合关于原点对称）与自身标脏。 */
export function invalidateAccessAround(rt: Runtime, t: number): void {
  const x = tileX(t), y = tileY(t);
  rt.access[t] = ACCESS_UNKNOWN;
  for (const [dx, dy] of ACCESS_OFFSETS) {
    const nx = x - dx, ny = y - dy;
    if (inMap(nx, ny)) rt.access[tileIndex(nx, ny)] = ACCESS_UNKNOWN;
  }
}
/** 24 偏移按原版顺序找第一个可达起点格；找不到 −1。 */
export function findAccessStart(rt: Runtime, x: number, y: number): number {
  const xbld = rt.state.layers.xbld;
  for (const [dx, dy] of ACCESS_OFFSETS) {
    const nx = x + dx, ny = y + dy;
    if (!inMap(nx, ny)) continue;
    const j = tileIndex(nx, ny);
    if (isAccessTile(xbld[j]!)) return j;
  }
  return -1;
}
export function hasAccess(rt: Runtime, x: number, y: number): boolean {
  if (!inMap(x, y)) return false;
  const i = tileIndex(x, y);
  const c = rt.access[i]!;
  if (c !== ACCESS_UNKNOWN) return c === ACCESS_YES;
  const ok = findAccessStart(rt, x, y) >= 0;
  rt.access[i] = ok ? ACCESS_YES : ACCESS_NO;
  return ok;
}

// ---------- 车站登记表（§2.9.1 / §3.2 读档重建规则）----------
export function footprintOf(rt: Runtime, kind: StationKind): 1 | 2 {
  const fp = rt.tune.stationFootprint;
  return kind === StationKind.Bus ? fp.bus : kind === StationKind.Rail ? fp.rail : 1;
}
/**
 * 按 (x, y) 升序扫描：车站格且未登记 → 若 n = 2 且右 / 下 / 右下三格同 ID、未登记、角标分别为 T-R / B-L / B-R（或四格角标全缺）⇒ 一座 2×2；
 * 否则（旧存档 / 第三方的 1×1 车站，角标 0xF0）⇒ 建为 n = 1，不改写 XBLD。
 */
export function rebuildStations(rt: Runtime): void {
  if (!rt.stationsDirty) return;
  const L = rt.state.layers;
  const xbld = L.xbld, xzon = L.xzon;
  rt.station.fill(0); rt.stationOf.fill(0); rt.stations = [];
  for (let i = 0; i < TILES; i++) {
    const id = xbld[i]!;
    const kind = stationKindOf(id);
    if (kind === StationKind.None || rt.stationOf[i] !== 0) continue;
    const x = tileX(i), y = tileY(i);
    let n: 1 | 2 = footprintOf(rt, kind);
    if (n === 2) {
      if (x + 1 >= 128 || y + 1 >= 128) n = 1;
      else {
        const tr = tileIndex(x + 1, y), bl = tileIndex(x, y + 1), br = tileIndex(x + 1, y + 1);
        const same = xbld[tr] === id && xbld[bl] === id && xbld[br] === id && rt.stationOf[tr] === 0 && rt.stationOf[bl] === 0 && rt.stationOf[br] === 0;
        const c0 = xzon[i]! & Corner.All, c1 = xzon[tr]! & Corner.All, c2 = xzon[bl]! & Corner.All, c3 = xzon[br]! & Corner.All;
        const cornersOk = (c0 === Corner.TL && c1 === Corner.TR && c2 === Corner.BL && c3 === Corner.BR) || (c0 === 0 && c1 === 0 && c2 === 0 && c3 === 0);
        if (!(same && cornersOk)) n = 1;
      }
    }
    const s: Station = { id: rt.stations.length, kind, anchor: i, x0: x, y0: y, n };
    rt.stations.push(s);
    for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) {
      const t = tileIndex(x + dx, y + dy);
      rt.station[t] = kind; rt.stationOf[t] = s.id + 1;
    }
  }
  rt.stationsDirty = false;
}
export function stationAtTile(rt: Runtime, i: number): Station | null {
  if (rt.stationsDirty) rebuildStations(rt);
  const k = rt.stationOf[i]!;
  return k === 0 ? null : rt.stations[k - 1]!;
}
/** 占地内序号 idx = i + n·j（T-L 0、T-R 1、B-L 2、B-R 3）。 */
export const fpIndex = (s: Station, x: number, y: number): number => (x - s.x0) + s.n * (y - s.y0);

/** 读 terrain 查询（绑定后）或直接读层（绑定前的回退）：坡面码与水面。 */
export function slopeAt(rt: Runtime, i: number): number {
  if (rt.q) return rt.q.terrain.slope(i);
  const xter = rt.state.layers.xter[i]!;
  return xter === 0x3e ? 13 : xter >= 0x40 ? 0 : xter & 0x0f;
}
export function isWaterAt(rt: Runtime, i: number): boolean {
  if (rt.q) return rt.q.terrain.isWater(i);
  return (rt.state.layers.xbit[i]! & XBit.Water) !== 0;
}

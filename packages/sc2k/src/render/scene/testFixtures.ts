// ===== render/scene/testFixtures.ts =====（WP10 验收测试共用夹具；非测试文件以便多个 *.test.ts 复用，不被生产代码 import）
// 只依赖 contracts：裸 CityState + 直接写层（夹具初始化，不经 TileWriter），与 testkit.flattenTerrain 的平地口径一致（alt = waterLevel = 4）。
import { createCityState } from '../../contracts/state';
import type { CityState } from '../../contracts/state';
import { CORNER_SIZE, Corner, MAP, TILES, XBit, tileIndex } from '../../contracts/grid';
import { CORNERS_TO_SLOPE } from '../../contracts/rotation';
import type { Rotation } from '../../contracts/rotation';
import { FOOTPRINT, cornerBits, forEachLotTile } from '../../contracts/footprint';
import type { ViewState, ZoomLevel } from '../../contracts/render';
import { ZOOM_TABLE } from '../../contracts/render';
import type { SceneSnapshot } from './compiler';

export const FIXTURE_FLAT_ALT = 4;

/** 全平地：alt = waterLevel = 4、xter 0、无水位。 */
export function flatState(alt = FIXTURE_FLAT_ALT): CityState {
  const s = createCityState();
  s.layers.alt.fill(alt); s.layers.waterLevel.fill(alt);
  s.terrain.seaLevel = Math.min(alt, 4);
  return s;
}

export interface SnapshotOpts {
  zoom?: ZoomLevel; rotation?: Rotation; underground?: boolean; show?: Partial<ViewState['show']>;
  markers?: Uint8Array; animTick?: number; trafficLight?: number; trafficHeavy?: number;
}
export function snapshotOf(s: CityState, o: SnapshotOpts = {}): SceneSnapshot {
  const zoom = o.zoom ?? 2;
  return {
    layers: s.layers, maps: s.maps, markers: o.markers ?? new Uint8Array(TILES),
    view: {
      zoom, rotation: o.rotation ?? 0, centerX: 64, centerY: 64, underground: o.underground ?? false,
      show: { buildings: true, signs: true, infrastructure: true, zones: true, ...(o.show ?? {}) }, mapLayer: null,
    },
    seaLevel: s.terrain.seaLevel, artScale: ZOOM_TABLE[zoom].scale,
    trafficLight: o.trafficLight ?? 48, trafficHeavy: o.trafficHeavy ?? 160,
    ...(o.animTick !== undefined ? { animTick: o.animTick } : {}),
  };
}

/** 放置建筑 / 多格块：xbld 全占地 + xzon 角标（低 4 位保留分区码）+ 额外 xbit；返回 TL 锚格。 */
export function placeLot(s: CityState, id: number, x0: number, y0: number, xbitExtra = 0): number {
  const n = FOOTPRINT[id]!;
  const a = tileIndex(x0, y0);
  forEachLotTile(a, n, (i, dx, dy) => {
    s.layers.xbld[i] = id;
    s.layers.xzon[i] = (s.layers.xzon[i]! & 0x0f) | cornerBits(n, dx, dy);
    s.layers.xbit[i] = s.layers.xbit[i]! | xbitExtra;
  });
  return a;
}
export const lotTiles = (id: number, x0: number, y0: number): number[] => {
  const out: number[] = [];
  forEachLotTile(tileIndex(x0, y0), FOOTPRINT[id]!, (i) => out.push(i));
  return out;
};

/** 由 129×129 角点高度场写 alt / xter（alt = 最低角；角位 = 高于最低角者；要求相邻角差 ≤ 1 且无鞍形）。 */
export function applyCornerField(s: CityState, hAt: (cx: number, cy: number) => number): void {
  for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) {
    const c00 = hAt(x, y), c10 = hAt(x + 1, y), c01 = hAt(x, y + 1), c11 = hAt(x + 1, y + 1);
    const m = Math.min(c00, c10, c01, c11);
    const bits = ((c00 > m ? 1 : 0) << 3) | ((c10 > m ? 1 : 0) << 2) | ((c01 > m ? 1 : 0) << 1) | (c11 > m ? 1 : 0);
    const slope = CORNERS_TO_SLOPE[bits]!;
    if (slope < 0) throw new Error(`applyCornerField: 鞍形角位 ${bits.toString(2)} @ (${x},${y})`);
    const i = tileIndex(x, y);
    s.layers.alt[i] = m; s.layers.waterLevel[i] = m; s.layers.xter[i] = slope;
  }
}
/** 丘陵地：h = max(floor(cx/9), floor(cy/9), floor((cx+cy)/11))（0..23；三项各自每步 ≤ 1 且沿两轴单调，取 max 后相邻角差 ≤ 1、格内高差 ≤ 1、无鞍形）。 */
export function hillyState(): CityState {
  const s = createCityState();
  applyCornerField(s, (cx, cy) => {
    const a = Math.min(cx, CORNER_SIZE - 1), b = Math.min(cy, CORNER_SIZE - 1);
    return Math.max(Math.floor(a / 9), Math.floor(b / 9), Math.floor((a + b) / 11));
  });
  return s;
}
/** bedrock 悬崖：矩形区域抬成 13 号平台（alt 不变，表面 alt+1，四周垂直壁）。 */
export function addPlateau(s: CityState, x0: number, y0: number, w: number, h: number): void {
  for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) s.layers.xter[tileIndex(x, y)] = 0x0d;
}

/** 在平地上挖一个水下湖：xter 0x10、waterLevel = alt + depth、XBIT.Water。 */
export function addLake(s: CityState, x0: number, y0: number, w: number, h: number, depth = 2): void {
  for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) {
    const i = tileIndex(x, y);
    s.layers.xter[i] = 0x10;
    s.layers.waterLevel[i] = s.layers.alt[i]! + depth;
    s.layers.xbit[i] = s.layers.xbit[i]! | XBit.Water;
  }
}

/** 稠密夹具：住宅 1×1 / 2×2 / 3×3 / 4×4、断电建筑、道路带车流、电线、树、分区、标牌、邻城牌、湖、岸边、溪流、瀑布、管线。 */
export function denseState(): CityState {
  const s = flatState();
  const L = s.layers;
  // 分区（R 轻 / C 密 / I 轻）
  for (let x = 10; x < 20; x++) for (let y = 10; y < 20; y++) L.xzon[tileIndex(x, y)] = 1;
  for (let x = 20; x < 26; x++) for (let y = 10; y < 20; y++) L.xzon[tileIndex(x, y)] = 4;
  for (let x = 26; x < 30; x++) for (let y = 10; y < 20; y++) L.xzon[tileIndex(x, y)] = 5;
  // 建筑：1×1 住宅 0x70、2×2 商业 0x94、3×3 工业 0xBC、4×4 电厂 0xCF、医院 0xD1、学校 0xD6
  placeLot(s, 0x70, 11, 11, XBit.Powerable | XBit.Powered | XBit.Piped | XBit.Watered);
  placeLot(s, 0x71, 13, 11, XBit.Powerable);                                       // 断电 1×1
  placeLot(s, 0x94, 21, 12, XBit.Powerable | XBit.Powered | XBit.Piped);
  placeLot(s, 0xbc, 26, 12, XBit.Powerable);                                       // 断电 3×3
  placeLot(s, 0xcf, 40, 40, XBit.Powerable | XBit.Powered);
  placeLot(s, 0xd1, 50, 40, XBit.Powerable | XBit.Powered | XBit.Piped | XBit.Watered);
  placeLot(s, 0xd6, 60, 40, XBit.Powerable | XBit.Powered);
  // 道路（L-R 直线 0x1D）带车流；电线 0x0E；树；瓦砾
  for (let x = 5; x < 70; x++) { const i = tileIndex(x, 22); L.xbld[i] = 0x1d; L.xzon[i] = Corner.All; }
  for (let x = 5; x < 70; x++) s.maps.xtrf[(x >> 1) * 64 + (22 >> 1)] = x < 30 ? 100 : x < 50 ? 200 : 10;
  for (let y = 5; y < 40; y++) { const i = tileIndex(36, y); L.xbld[i] = 0x0f; L.xzon[i] = Corner.All; }
  for (let x = 70; x < 90; x++) for (let y = 70; y < 90; y++) L.xbld[tileIndex(x, y)] = 0x06 + ((x + y) % 7);
  L.xbld[tileIndex(90, 90)] = 0x01;
  // 标牌 / 邻城牌 / 微模拟标签（不是标牌）
  L.xtxt[tileIndex(11, 11)] = 0x05; L.xtxt[tileIndex(5, 22)] = 0xfa; L.xtxt[tileIndex(13, 11)] = 0x40;
  // 水：湖（水下）、岸边、浅水、瀑布、溪流
  addLake(s, 100, 100, 8, 8, 2);
  L.xter[tileIndex(99, 100)] = 0x21; L.xbit[tileIndex(99, 100)] = L.xbit[tileIndex(99, 100)]! | XBit.Water; L.waterLevel[tileIndex(99, 100)] = FIXTURE_FLAT_ALT + 1;
  L.xter[tileIndex(96, 96)] = 0x35; L.xbit[tileIndex(96, 96)] = L.xbit[tileIndex(96, 96)]! | XBit.Water;
  L.xter[tileIndex(94, 94)] = 0x3e; L.xbit[tileIndex(94, 94)] = L.xbit[tileIndex(94, 94)]! | XBit.Water;
  L.xter[tileIndex(92, 92)] = 0x40; L.xbit[tileIndex(92, 92)] = L.xbit[tileIndex(92, 92)]! | XBit.Water;
  L.xter[tileIndex(92, 93)] = 0x42; L.xbit[tileIndex(92, 93)] = L.xbit[tileIndex(92, 93)]! | XBit.Water;
  // 地下：管线（0x10 L-R 直线）、地铁（0x01）
  for (let x = 10; x < 30; x++) L.xund[tileIndex(x, 15)] = 0x10;
  for (let y = 30; y < 60; y++) L.xund[tileIndex(45, y)] = 0x01;
  // 边缘海拔 > 0 已由 flatState 保证（alt 4）；再加一座高台
  for (let x = 120; x < 128; x++) for (let y = 120; y < 128; y++) { L.alt[tileIndex(x, y)] = 9; L.waterLevel[tileIndex(x, y)] = 9; }
  // 坡面带：T 边高 0x01 一排
  for (let x = 110; x < 118; x++) { L.xter[tileIndex(x, 110)] = 0x01; }
  return s;
}

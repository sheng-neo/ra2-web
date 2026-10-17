// ===== render.ts =====（spec:ui-art §3.1 / §3.4；render-first §4.3–§4.9）
// 视图、精灵来源、场景编译、CPU 合成的纯类型与常量（CONTRACTS §Q）。本文件不含任何 DOM 类型；
// 需要 HTMLElement 的 RendererApi 单独在 ./rendererApi.ts（sim 侧代码不得 import 它）。
import { MAX_ALT, TileMarker } from './grid';
import type { TileLayers, DataMaps, CityState } from './state';
import type { Rotation } from './rotation';
import type { Queries } from './queries';
import type { DirtyChanges } from './dirty';

export type ZoomLevel = 0 | 1 | 2 | 3 | 4; export type ArtScale = 'XS' | 'S' | 'M' | 'L' | 'XL';
export const ZOOM_TABLE = [
  { scale: 'XS', tileW: 8, tileH: 4, levelPx: 3, dat: 'small' }, { scale: 'S', tileW: 16, tileH: 8, levelPx: 6, dat: 'medium' },
  { scale: 'M', tileW: 32, tileH: 16, levelPx: 12, dat: 'large' }, { scale: 'L', tileW: 64, tileH: 32, levelPx: 24, dat: null }, { scale: 'XL', tileW: 128, tileH: 64, levelPx: 48, dat: null } ] as const;
/**
 * 地图像素系原点（旋转后、按当前档原生像素、不含相机）：旋转后地块 (0,0) 在海拔 MAX_ALT 时的顶点 c00' 落在 y = 0；旋转后 (0,127) 的左顶点落在 x = 0。
 * 地图像素画布尺寸 = 128·tileW × (MAX_ALT·levelPx + 128·tileH)。渲染（Pixi 与 CpuCompositor）、pick / screenOf、DOM 标牌、thumbnail 全部共用此原点。
 */
export const mapOrigin = (z: ZoomLevel): { x: number; y: number } => ({ x: 128 * ZOOM_TABLE[z].tileW / 2, y: MAX_ALT * ZOOM_TABLE[z].levelPx });
/** 地图像素画布尺寸（见 mapOrigin 注释）。 */
export const mapCanvasSize = (z: ZoomLevel): { w: number; h: number } => ({ w: 128 * ZOOM_TABLE[z].tileW, h: MAX_ALT * ZOOM_TABLE[z].levelPx + 128 * ZOOM_TABLE[z].tileH });
/**
 * 像素锚点约定（spec:ui-art §3.1；S = tileW/2，LEVEL = levelPx，(rx,ry) = rotateTile(x,y,rot)，(ox,oy) = mapOrigin(zoom)）：
 *  SceneCompiler.worldToScreen(x,y,h) = 旋转后地块**顶点 c00'** = [ox + (rx−ry)·S, oy + (rx+ry)·S/2 − h·LEVEL]
 *  SceneItem.x/y                      = 该项锚格在其基准海拔处的**底顶点 c11'** = worldToScreen(x,y,h) + [0, tileH]；IndexedBitmap 的 (anchorX, anchorY) 贴到此点
 *  地块中心                           = worldToScreen(x,y,h) + [0, tileH/2]（picking.test 的往返用例以此为输入，避免落在共享边上）
 *  RendererApi.screenOf(x,y)          = worldToScreen(x,y,alt[i]) + 相机偏移（worldRoot 的整数位置）；pick(px,py) 先减去同一偏移
 */
export type MapLayerMode = 'structures' | 'zones' | 'transport' | 'power' | 'water' | 'pop' | 'growth' | 'traffic' | 'pollution' | 'crime' | 'landValue' | 'police' | 'fire' | 'health' | 'education';
export interface ViewState { zoom: ZoomLevel; rotation: Rotation; centerX: number; centerY: number; underground: boolean; show: { buildings: boolean; signs: boolean; infrastructure: boolean; zones: boolean }; mapLayer: MapLayerMode | null }

/** 8 bit 索引色位图。procedural：0 = 透明；DAT：索引 0 是合法黑色，用 opaque 掩码（存在时以它为准）。 */
export interface IndexedBitmap { w: number; h: number; data: Uint8Array; anchorX: number; anchorY: number; cycling: boolean; opaque?: Uint8Array }
export type SpriteKind = 'xbld' | 'terrain' | 'water' | 'xund' | 'overlay' | 'actor' | 'ui';
/**
 * overlay 族 id（kind:'overlay'；spec:ui-art §3.9.1 的名字在此落为整数，WP9 生产 / WP10 编译 / WP11 图集 / WP14 DAT 相对号映射共用）。
 *  EdgeWall 项：{ kind:'overlay', id: EdgeWallL | EdgeWallR, variant: levels 1..31 }（SceneLayer.EdgeWall）
 *  ZoneTint 项：{ kind:'overlay', id: zoneOverlayId(zone) }（SceneLayer.ZoneTint）
 *  Marker 项：  { kind:'overlay', id: Fire | Flood | Toxic | Riot, frame }（SceneLayer.Marker）
 *  车流：       { kind:'overlay', id: TrafficLight | TrafficHeavy, frame }；标牌 Sign / 邻城连接 Connection；预览 PreviewOk / PreviewBad；光标 CursorTile
 */
export const enum OverlayId { CursorTile = 0, PreviewOk, PreviewBad, ZoneRLight, ZoneRDense, ZoneCLight, ZoneCDense, ZoneILight, ZoneIDense, ZoneMilitary, ZoneAirport, ZoneSeaport,
  NoPower, NoWater, Fire, Flood, Toxic, Riot, Sign, Connection, TrafficLight, TrafficHeavy, EdgeWallL, EdgeWallR }
export const OVERLAY_COUNT = 24;
/** actor 族 id（kind:'actor'；variant = 朝向 0..7，frame = 动画帧）。 */
export const enum ActorId { Plane = 0, Helicopter, Ship, Sailboat, Nessie, TrainHead, TrainCar, Monster, Tornado, Explosion, DeployPolice, DeployFire, DeployMilitary }
export const ACTOR_COUNT = 13;
/**
 * ui 族 id（kind:'ui'，24×24；spec:ui-art §3.9.2）。固定图标显式枚举；区段：速度 = SpeedBase + (speed−1)；天气 = WeatherBase + 天气类型 0..11；
 * Map 图层 = MapLayerBase + MAP_LAYER_MODES 下标；子工具 = SubToolBase + CATALOGUE.TOOLS 下标（CATALOGUE.TOOLS 为 67 项，SubToolBase 96 + 67 = 163，总数 < 256 以适配 spriteKeyHash 的 8 位 id；data/catalogue.test 断言）。
 */
export const enum UiIconId {
  Bulldozer = 0, Landscape, Emergency, Roads, Power, Water, Rails, Ports, Residential, Commercial, Industrial, Education, Services, Recreation, Signs, Query, Rewards,
  RotateCcw, RotateCw, ZoomOut, ZoomIn, Centering, Help, MapWin, GraphsWin, PopulationWin, IndustriesWin, NeighborsWin, BudgetWin,
  ShowBuildings, ShowSigns, ShowInfra, ShowZones, ShowUnderground, GotoArrow, RciBase, Close, Minimize, Pin,
  SpeedBase = 48, WeatherBase = 56, MapLayerBase = 72, SubToolBase = 96 }
export const MAP_LAYER_MODES: readonly MapLayerMode[] = ['structures', 'zones', 'transport', 'power', 'water', 'pop', 'growth', 'traffic', 'pollution', 'crime', 'landValue', 'police', 'fire', 'health', 'education'];
/** ZoneCode 1..9 → OverlayId.ZoneRLight..ZoneSeaport（与枚举同序）；zone 0 / 越界不是合法输入。 */
export const zoneOverlayId = (zone: number): OverlayId => (OverlayId.ZoneRLight + zone - 1) as OverlayId;
/** TileMarker 字节值 → marker 叠加 id；Rioters / MassRioters 同用 Riot；非标记值（含 None）→ null。 */
export const markerOverlayId = (m: number): OverlayId | null =>
  m === TileMarker.Fire ? OverlayId.Fire : m === TileMarker.Flood ? OverlayId.Flood : m === TileMarker.ToxicCloud ? OverlayId.Toxic
  : m === TileMarker.Rioters || m === TileMarker.MassRioters ? OverlayId.Riot : null;
/** 建筑格在地下视图里的"短管桩"：xund 族借用原版未用的 0x21（variant 1 = 有水）。 */
export const XUND_PIPE_STUB = 0x21;
/** id 语义：xbld = XBLD 号；terrain = 坡面码 0..13（variant: altBand*4 + noise，'underground' 用 variant 0x80 位）；water = 0..20（270+n 的相对号；variant = depthBand）；xund = XUND 号（variant 1 = 有水；0x21 = 短管桩）；overlay / actor / ui = 上面的 OverlayId / ActorId / UiIconId。 */
export interface SpriteKey { kind: SpriteKind; id: number; variant?: number; frame?: number }
/** 七种精灵族的固定顺序；SPRITE_KIND_CODE 为其下标（spriteKeyHash 的高字节 = code + 1，即 1..7）。 */
export const SPRITE_KINDS: readonly SpriteKind[] = ['xbld', 'terrain', 'water', 'xund', 'overlay', 'actor', 'ui'];
export const SPRITE_KIND_CODE: Readonly<Record<SpriteKind, number>> = { xbld: 0, terrain: 1, water: 2, xund: 3, overlay: 4, actor: 5, ui: 6 };
/**
 * 32 位键：(kindCode+1) | id | variant | frame（各 8 位）；id / variant / frame 都必须 < 256；结果恒 > 0。
 * 不用 kind 首字母（蓝本写法）：'xbld' 与 'xund' 同为 'x' 会碰撞（xbld 0x21 与 XUND_PIPE_STUB 0x21 同哈希）。
 */
export const spriteKeyHash = (k: SpriteKey): number => (((SPRITE_KIND_CODE[k.kind] + 1) & 0xff) << 24) | ((k.id & 0xff) << 16) | (((k.variant ?? 0) & 0xff) << 8) | ((k.frame ?? 0) & 0xff);
export interface Palette { rgba: Uint8ClampedArray /*256×4*/; cycles: ReadonlyArray<{ start: number; length: number; periodMs: number; dir: 1 | -1 }> }
export interface SpriteProvider {
  readonly name: 'procedural' | 'dat'; readonly palette: Palette; readonly nativeScales: ReadonlySet<ArtScale>;   // procedural {S,M,L}；dat {XS,S,M}
  has(key: SpriteKey, scale: ArtScale): boolean;                 // 只回答原生档
  bitmap(key: SpriteKey, scale: ArtScale): IndexedBitmap | null; // 同步；非原生档返回 null（回退链在渲染器）
  frameCount(key: SpriteKey): number; fps(key: SpriteKey): number;   // 0 = 静态
}

/** 画家序层键：zKey = depth·4096 + rx·16 + layer。 */
export const enum SceneLayer { Terrain = 0, EdgeWall = 1, Water = 2, ZoneTint = 3, Ground = 4, Structure = 5, Overlay = 6, Marker = 7, Actor = 8, Preview = 9 }
export const zKeyOf = (depth: number, rx: number, layer: SceneLayer): number => depth * 4096 + rx * 16 + layer;
export const bandOf = (depth: number): number => depth >> 4;     // 16 条深度带
export type AnimGroup = 'none' | 'water' | 'blink' | 'traffic' | 'fire' | 'flood' | 'toxic' | 'riot' | 'cycleOnly';
export interface SceneItem {
  tile: number; layer: SceneLayer; key: SpriteKey;
  x: number; y: number;                                           // 锚格底顶点 c11'（基准海拔）的地图像素 = worldToScreen(x,y,h) + [0, tileH]；位图 (anchorX, anchorY) 贴到此点（见 mapOrigin 注释）
  depth: number; rx: number; zKey: number; flip: boolean; anim: AnimGroup; tint?: number; alpha?: number;
}
/** 渲染器需要的只读快照（由 app 构造；不含任何模块私有对象）。 */
export interface RenderSnapshot {
  readonly layers: Readonly<TileLayers>; readonly maps: Readonly<DataMaps>;
  readonly markers: Readonly<Uint8Array>;                        // q.disasters.markers()
  readonly view: Readonly<ViewState>; readonly seaLevel: number; readonly artScale: ArtScale;
  readonly trafficLight: number; readonly trafficHeavy: number;   // 叠加阈值（默认 48 / 160）
}
export interface SceneCompiler {
  compileTile(snap: RenderSnapshot, i: number, out: SceneItem[]): void;    // 只读本格 + anchorOf 探测；每格 ≤ 5 项
  compileAll(snap: RenderSnapshot): SceneItem[];                            // 16384 格，≈3.5 万项
  worldToScreen(snap: RenderSnapshot, x: number, y: number, h: number): [number, number];   // 旋转后地块顶点 c00' 的地图像素（mapOrigin 原点，未含相机）
  pick(snap: RenderSnapshot, px: number, py: number): number | null;        // 31→0 级逆投影 + 四边形测试，只按地面
  edgeOf(snap: RenderSnapshot, i: number): 'L' | 'R' | 'LR' | null;         // 旋转后 rx==127 / ry==127
}
export interface CpuCompositor {
  render(items: readonly SceneItem[], provider: SpriteProvider, scale: ArtScale, rect: { x: number; y: number; w: number; h: number }): IndexedBitmap;
  toRgba(bmp: IndexedBitmap, palette: Palette): Uint8ClampedArray;
  encodePng(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array;    // Node / 浏览器皆可（无 DOM 依赖）
}
export interface ActorSprite { slot: number; key: SpriteKey; x: number; y: number; z: number; px: number; py: number; dir: number; air: boolean }
/** 渲染器输入：由 app 构造，每帧提供脏信息与动画节拍。 */
export interface RenderSource {
  readonly state: Readonly<CityState>;
  readonly q: Pick<Queries, 'disasters' | 'transport' | 'zones' | 'utilities' | 'services'>;
  takeChanges(): DirtyChanges;
  readonly animTick: number;                                      // app 推进的动画节拍（AnimationClock 在渲染器内按 fps 组派生相位）
}
export interface RendererStats { sprites: number; drawCalls: number; bandRebuilds: number; frameMs: number; vramBytes: number }
/** 结构化的 Worker 外形（art 目录在 tsconfig.sim.json 下没有 DOM lib，不能写 Worker 类型）。 */
export interface WorkerLike { postMessage(message: unknown, transfer?: ArrayBuffer[]): void; addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void; terminate(): void }
/** WP11 必须使用的初始化参数（smoke 门禁读 stats()）。 */
export const PIXI_INIT_OPTIONS = { preference: 'webgl', antialias: false, resolution: 1, roundPixels: true, backgroundAlpha: 1, powerPreference: 'high-performance' } as const;
export const backingScaleFor = (dpr: number): number => Math.max(1, Math.floor(dpr));   // 整数舞台缩放，不用小数 resolution
export const RENDER_BUDGET = { maxDrawCallsStatic: 48, maxFullRebuildMs: 60, maxVramBytes: 128 * 1024 * 1024, maxDynamicSprites: 600, maxActors: 39 } as const;

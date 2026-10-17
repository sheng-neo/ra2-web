// ===== render/scene/compiler.ts =====（ARCHITECTURE §6.2 场景编译器；spec:ui-art §2.9.3 / §3.2.4 / §3.9.1；CONTRACTS §Q SceneCompiler）
// 纯函数：RenderSnapshot + 格号 → SceneItem[]。只读本格（+ anchorOf 探测），每格 ≤ 5 项（另加 ≤ 2 个边缘岩壁项）。
// 槽位：Terrain | EdgeWall(L/R) | Water 或 ZoneTint | Ground 或 Structure | 状态槽（Marker > NoPower > Traffic）| Sign/Connection。
// 地下视图：土色地表（terrain variant 0x80）+ xund 项 + PIPED 建筑格短管桩 XUND_PIPE_STUB，不出 Structure / Water / Zone / Marker / Sign。
import type { AnimGroup, RenderSnapshot, SceneCompiler, SceneItem, SceneLayer as SceneLayerT, SpriteKey } from '../../contracts/render';
import { OverlayId, SceneLayer, XUND_PIPE_STUB, markerOverlayId, zKeyOf, zoneOverlayId } from '../../contracts/render';
import { DEVELOPED_FIRST, MAP, TILES, XBit, ZONE_MASK, halfOfTile, tileX, tileY } from '../../contracts/grid';
import { FOOTPRINT, anchorOf } from '../../contracts/footprint';
import type { Footprint } from '../../contracts/footprint';
import { isHighway, isPipeUnd, isRoad } from '../../contracts/net';
import { renderAnchor, rotateTile, rotateXbldFlip, rotateXund } from '../../contracts/rotation';
import { hashNoise } from '../../contracts/prng';
import type { Projection } from './projection';
import { projectionOf, rotatedToScreen, worldToScreen } from './projection';
import { DEFAULT_SCENE_TUNING, OVERLAY_ANIM, frameOf } from './tuning';
import type { SceneTuning } from './tuning';
import { altBandOf, depthBandOf, rotatedSlopeOf, waterHeightOf, waterSpriteOf } from './tileInfo';
import { pick } from './picking';

/** 本地扩展（见 docs/contract-rfc.md）：RenderSnapshot 尚无动画节拍字段，缺省 0 → 所有多帧覆盖物取第 0 帧。 */
export interface SceneSnapshot extends RenderSnapshot { readonly animTick?: number }
export type LabelKind = 'sign' | 'connection';
/** 标牌登记：x/y = 锚格底顶点 c11'（地图像素），DOM 标牌层据此 + 相机偏移定位（spec:ui-art §4 第 13 条）。 */
export interface SceneLabel { tile: number; kind: LabelKind; xtxt: number; x: number; y: number }
export interface CompilerHooks { onLabel?(label: SceneLabel): void; tuning?: Partial<SceneTuning> }

/** 每格上限（不含边缘岩壁）与岩壁上限；WP11 可据此预留句柄。 */
export const MAX_ITEMS_PER_TILE = 5;
export const MAX_EDGE_WALLS_PER_TILE = 2;
/** 电线 0x0E 起为"基础设施"（show.infrastructure 控制）；0x01–0x0D 树 / 瓦砾 / 放射 / 小公园恒显示。 */
export const INFRA_FIRST = 0x0e;
/** 车流覆盖适用的地面件：道路（含隧道口 / 交叉件 / 匝道）、高速、道路桥 0x51–0x59（spec:ui-art §2.9.2 "道路 / 高速 / 堤道 / 匝道 / 立交"）。 */
export const trafficSurface = (id: number): boolean => isRoad(id) || isHighway(id) || (id >= 0x51 && id <= 0x59);

const MARKER_ANIM: Readonly<Partial<Record<number, AnimGroup>>> = { [OverlayId.Fire]: 'fire', [OverlayId.Flood]: 'flood', [OverlayId.Toxic]: 'toxic', [OverlayId.Riot]: 'riot' };

const mergeTuning = (t?: Partial<SceneTuning>): SceneTuning => (t ? { ...DEFAULT_SCENE_TUNING, ...t, anim: { ...DEFAULT_SCENE_TUNING.anim, ...(t.anim ?? {}) } } : DEFAULT_SCENE_TUNING);

/** 单格编译核心：p 为预先派生的投影常量（compileAll 复用）。 */
export function compileTileP(p: Projection, snap: SceneSnapshot, i: number, out: SceneItem[], t: SceneTuning, hooks: CompilerHooks | null): void {
  const L = snap.layers, view = snap.view;
  const x = tileX(i), y = tileY(i);
  const [rx, ry] = rotateTile(x, y, p.rot);
  const depth = rx + ry;
  const alt = L.alt[i]!, xter = L.xter[i]!, xbld = L.xbld[i]!, xbit = L.xbit[i]!;
  const [vx, vy] = rotatedToScreen(p, rx, ry, alt);
  const ax = vx, ay = vy + p.tileH;                                   // 锚格底顶点 c11'@alt
  const push = (layer: SceneLayerT, key: SpriteKey, anim: AnimGroup = 'none', flip = false, h = alt, yShift = 0): void => {
    out.push({ tile: i, layer, key, x: ax, y: ay - (h - alt) * p.level - yShift, depth, rx, zKey: zKeyOf(depth, rx, layer), flip, anim });
  };

  // 1. 地表：旋转后坡面码；variant = 海拔带·4 + 噪点（地下视图 0x80）
  const underground = view.underground;
  const variant = underground
    ? t.undergroundVariant
    : altBandOf(alt, t) * t.terrainVariants + ((hashNoise(t.terrainNoiseSeed, x, y) * t.terrainVariants) | 0);
  push(SceneLayer.Terrain, { kind: 'terrain', id: rotatedSlopeOf(xter, p.rot), variant });

  // 2. 边缘岩壁：旋转后 ry==127 → 左壁、rx==127 → 右壁；variant = 层数 alt（0 级无壁）
  if (alt > 0) {
    if (ry === MAP - 1) push(SceneLayer.EdgeWall, { kind: 'overlay', id: OverlayId.EdgeWallL, variant: alt });
    if (rx === MAP - 1) push(SceneLayer.EdgeWall, { kind: 'overlay', id: OverlayId.EdgeWallR, variant: alt });
  }

  // 3. 地下分支：管线 / 地铁（xund）或建筑格短管桩；其余一律不出
  if (underground) {
    const u = L.xund[i]!;
    const watered = (xbit & XBit.Watered) !== 0 ? 1 : 0;
    if (u !== 0) push(SceneLayer.Ground, { kind: 'xund', id: rotateXund(u, p.rot), variant: isPipeUnd(u) ? watered : 0 });
    else if (xbld >= DEVELOPED_FIRST && (xbit & XBit.Piped) !== 0) push(SceneLayer.Ground, { kind: 'xund', id: XUND_PIPE_STUB, variant: watered });
    return;
  }

  // 4. 水面：水下整块画在 waterLevel；岸边 / 浅水 / 溪流 / 瀑布画在 alt
  const waterId = waterSpriteOf(xter, p.rot);
  const isWater = waterId >= 0;
  if (isWater) {
    const wl = L.waterLevel[i]!;
    push(SceneLayer.Water, { kind: 'water', id: waterId, variant: depthBandOf(alt, wl, t) }, 'water', false, waterHeightOf(xter, alt, wl, t));
  }

  // 5. 分区底色：空分区格（或关闭 Buildings 时的已建分区格）；水面格不画
  const isBuilding = xbld >= DEVELOPED_FIRST;
  const showB = view.show.buildings, showI = view.show.infrastructure;
  const zone = L.xzon[i]! & ZONE_MASK;
  if (view.show.zones && zone !== 0 && !isWater && (!isBuilding || !showB)) push(SceneLayer.ZoneTint, { kind: 'overlay', id: zoneOverlayId(zone) });

  // 6. 地面物 / 建筑：1×1 走 Ground（含 1×1 建筑）；多格只在 renderAnchor 格出 Structure；损坏占地按 1×1
  let lotShown = false;
  let lotSize = 1;
  if (xbld !== 0 && (isBuilding ? showB : xbld < INFRA_FIRST || showI)) {
    const n = FOOTPRINT[xbld]! as Footprint;
    const r = rotateXbldFlip(xbld, xbit, p.rot);
    if (n === 1) { push(SceneLayer.Ground, { kind: 'xbld', id: r.id }, 'none', r.flip); lotShown = true; }
    else {
      const a = anchorOf(L, i);
      if (a < 0) { push(SceneLayer.Ground, { kind: 'xbld', id: r.id }, 'none', r.flip); lotShown = true; }
      else if (renderAnchor(a, n, p.rot) === i) { push(SceneLayer.Structure, { kind: 'xbld', id: r.id }, 'none', r.flip); lotShown = true; lotSize = n; }
    }
  }

  // 7. 状态槽（互斥，优先级 Marker > NoPower > Traffic）
  const tick = snap.animTick ?? 0;
  const m = markerOverlayId(snap.markers[i] ?? 0);
  if (m !== null) {
    push(SceneLayer.Marker, { kind: 'overlay', id: m, frame: frameOf(tick, t.anim[OVERLAY_ANIM[m]!], t.animTickHz) }, MARKER_ANIM[m] ?? 'none');
  } else if (lotShown && isBuilding && (xbit & XBit.Powerable) !== 0 && (xbit & XBit.Powered) === 0) {
    // 断电图标只给可供电建筑（spec:ui-art §4 第 12 条）；多格建筑把锚点抬到占地中心线：y = 锚格 c11'.y − (n−1)·tileH/2
    push(SceneLayer.Overlay, { kind: 'overlay', id: OverlayId.NoPower }, 'blink', false, alt, ((lotSize - 1) * p.tileH) / 2);
  } else if (showI && trafficSurface(xbld)) {
    const tr = snap.maps.xtrf[halfOfTile(i)]!;
    const light = snap.trafficLight > 0 ? snap.trafficLight : t.trafficLightDefault;
    const heavy = snap.trafficHeavy > 0 ? snap.trafficHeavy : t.trafficHeavyDefault;
    if (tr >= light) push(SceneLayer.Overlay, { kind: 'overlay', id: tr >= heavy ? OverlayId.TrafficHeavy : OverlayId.TrafficLight, frame: frameOf(tick, t.anim.traffic, t.animTickHz) }, 'traffic');
  }

  // 8. 标牌 / 邻城连接牌 + DOM 标签登记
  if (view.show.signs) {
    const xt = L.xtxt[i]!;
    const kind: LabelKind | null = xt >= t.signMin && xt <= t.signMax ? 'sign' : xt === t.connectionXtxt ? 'connection' : null;
    if (kind !== null) {
      push(SceneLayer.Overlay, { kind: 'overlay', id: kind === 'sign' ? OverlayId.Sign : OverlayId.Connection });
      hooks?.onLabel?.({ tile: i, kind, xtxt: xt, x: ax, y: ay });
    }
  }
}

/** 全部标牌（不编译场景；DOM 标牌层在旋转 / 缩放 / xtxt 整层脏时重登记用）。 */
export function labelsOf(snap: SceneSnapshot, t: SceneTuning = DEFAULT_SCENE_TUNING): SceneLabel[] {
  const out: SceneLabel[] = [];
  if (!snap.view.show.signs || snap.view.underground) return out;
  const p = projectionOf(snap);
  const L = snap.layers;
  for (let i = 0; i < TILES; i++) {
    const xt = L.xtxt[i]!;
    const kind: LabelKind | null = xt >= t.signMin && xt <= t.signMax ? 'sign' : xt === t.connectionXtxt ? 'connection' : null;
    if (kind === null) continue;
    const [rx, ry] = rotateTile(tileX(i), tileY(i), p.rot);
    const [vx, vy] = rotatedToScreen(p, rx, ry, L.alt[i]!);
    out.push({ tile: i, kind, xtxt: xt, x: vx, y: vy + p.tileH });
  }
  return out;
}

export function edgeOf(snap: Pick<RenderSnapshot, 'view'>, i: number): 'L' | 'R' | 'LR' | null {
  const [rx, ry] = rotateTile(tileX(i), tileY(i), snap.view.rotation);
  const r = rx === MAP - 1, l = ry === MAP - 1;
  return r && l ? 'LR' : r ? 'R' : l ? 'L' : null;
}

/** 带钩子 / 调参的编译器实例（WP11 用 onLabel 登记 DOM 标牌）。 */
export function createSceneCompiler(hooks: CompilerHooks = {}): SceneCompiler {
  const t = mergeTuning(hooks.tuning);
  const h: CompilerHooks | null = hooks.onLabel ? hooks : null;
  return {
    compileTile: (snap, i, out) => compileTileP(projectionOf(snap), snap, i, out, t, h),
    compileAll: (snap) => {
      const out: SceneItem[] = [];
      const p = projectionOf(snap);
      for (let i = 0; i < TILES; i++) compileTileP(p, snap, i, out, t, h);
      return out;
    },
    worldToScreen,
    pick,
    edgeOf,
  };
}

const defaultCompiler = createSceneCompiler();
export const compileTile = defaultCompiler.compileTile;
export const compileAll = defaultCompiler.compileAll;
/** 默认实例（无标牌钩子、默认调参）；render/index.ts 的 sceneCompiler 出口。 */
export const sceneCompiler: SceneCompiler = defaultCompiler satisfies SceneCompiler;

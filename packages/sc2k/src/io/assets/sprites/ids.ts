// ===== io/assets/sprites/ids.ts =====（spec:file-formats §2.6.3 / §3.7、spec:ui-art §2.9.2、§3.2.6）
// 精灵 ID 方案：文件内 ID = ZOOM_BASE[zoom] + 相对号 n。IdLayout 把渲染器的 `${kind}:${id}` 映射到相对号；
// 0–290 固定（H），291 以后只有顺序与数量有把握（M）：按名义表给出候选号，导入时用"条目存在 + 尺寸启发式"校验，
// 不通过的段整段剔除（→ DatSpriteProvider.has 为 false，渲染器走程序化回退链），并出 ID_LAYOUT_UNRESOLVED 诊断。
import type { ArtScale, SpriteKey, SpriteKind } from '../../../contracts/render';
import { ActorId, OverlayId, XUND_PIPE_STUB } from '../../../contracts/render';
import type { Diagnostic } from '../../../contracts/system';

export type DatZoom = 'small' | 'medium' | 'large';
export const DAT_ZOOMS: readonly DatZoom[] = ['small', 'medium', 'large'];
export const ZOOM_BASE: Readonly<Record<DatZoom, number>> = { small: 0, medium: 500, large: 1000 };
export const ZOOM_SPAN = 500;
/** 本项目缩放档 ↔ 原版缩放级（L / XL 无原版美术，由渲染器整数倍放大 M）。 */
export const DAT_ZOOM_OF_SCALE: Readonly<Partial<Record<ArtScale, DatZoom>>> = { XS: 'small', S: 'medium', M: 'large' };
export const SCALE_OF_DAT_ZOOM: Readonly<Record<DatZoom, ArtScale>> = { small: 'XS', medium: 'S', large: 'M' };
/** 1×1 地块精灵尺寸与每海拔级像素（§2.6.3）。 */
export const DAT_TILE: Readonly<Record<DatZoom, { w: number; h: number; level: number }>> = {
  small: { w: 8, h: 5, level: 3 }, medium: { w: 16, h: 9, level: 6 }, large: { w: 32, h: 17, level: 12 },
};
/** 重叠行位置（spec:ui-art §3.2.6）：'bottom' → 锚点 (w/2, h−1)；若实机验证反了改 'top' → (w/2, h)。 */
export const DAT_OVERLAP_ROW: 'bottom' | 'top' = 'bottom';
export const datAnchor = (w: number, h: number): { x: number; y: number } => ({ x: w >> 1, y: DAT_OVERLAP_ROW === 'bottom' ? h - 1 : h });
export const zoomOfAbsoluteId = (abs: number): DatZoom => (abs >= ZOOM_BASE.large ? 'large' : abs >= ZOOM_BASE.medium ? 'medium' : 'small');

/** 相对号基址表（§2.6.3）。291 以后为名义值（M）。 */
export const REL = {
  terrainBase: 256, terrainCount: 14,           // XTER 低 nibble 0..13（269 = bedrock）
  waterBase: 270, waterCount: 21,               // 270–283 形状 0..13、284 瀑布、285–290 溪流 / 水湾（water 0..20）
  zoneTintBase: 291, zoneTintCount: 9,          // 轻/密 R C I、军事、机场、海港
  tintBase: 300, tintCount: 5,                  // 绿 蓝 黄 红 灰
  undergroundTerrainBase: 305, undergroundTerrainCount: 14,
  subwayBase: 319, pipeBase: 334, segmentCount: 15,
  crossPipeTbSubwayLr: 349, crossPipeLrSubwayTb: 350,
  buildingPipe: 351, siloUnderground: 352, subwayEntrance: 353,
  outlineBase: 354, outlineCount: 5,
  planeBase: 359, copterBase: 364, shipBase: 369, trainBase: 374, vehicleDirs: 5,
  nessie: 379, sailboatBase: 380, sailboatDirs: 2,
  deployPolice: 382, deployFire: 383, deployMilitary: 384,
  monsterRay: 385, noPower: 386,
  explosionBase: 387, explosionFrames: 3,
  bulldozerBase: 390, dustBase: 392, dustFrames: 4,
  fireBase: 396, fireFrames: 4,
  max: 499,
} as const;

export type IdLayout = Record<string, number>;
export const layoutKey = (kind: SpriteKind, id: number): string => `${kind}:${id}`;

export interface LayoutKeyRel { key: string; rel: number }
export type SizeOf = (abs: number) => { w: number; h: number } | undefined;
/** 名义分段：H 段逐键按存在性保留；M 段整段校验（任一键缺失或尺寸不符 → 整段剔除）。 */
export interface LayoutSegment { name: string; confidence: 'H' | 'M'; keys: LayoutKeyRel[]; check?: (sizeOf: SizeOf) => string | null }

const range = (n: number): number[] => Array.from({ length: n }, (_, k) => k);
/** large 级 1×1 地块尺寸校验（允许高度 ±1 行的变体）。 */
const isLargeTile = (s: { w: number; h: number } | undefined): boolean => !!s && s.w === DAT_TILE.large.w && Math.abs(s.h - DAT_TILE.large.h) <= 1;

export function nominalSegments(): LayoutSegment[] {
  const seg = (name: string, confidence: 'H' | 'M', keys: LayoutKeyRel[], check?: LayoutSegment['check']): LayoutSegment => (check ? { name, confidence, keys, check } : { name, confidence, keys });
  const tileCheck = (rels: number[]) => (sizeOf: SizeOf): string | null => {
    const bad = rels.filter((rel) => { const s = sizeOf(ZOOM_BASE.large + rel); return s !== undefined && !isLargeTile(s); });
    return bad.length ? `large 尺寸不是 32×17：${bad.map((rel) => { const s = sizeOf(ZOOM_BASE.large + rel)!; return `${ZOOM_BASE.large + rel}=${s.w}×${s.h}`; }).join(' ')}` : null;
  };
  const zoneRels = range(REL.zoneTintCount).map((k) => REL.zoneTintBase + k);
  return [
    seg('xbld', 'H', range(255).map((k) => ({ key: layoutKey('xbld', k + 1), rel: k + 1 }))),
    seg('terrain', 'H', range(REL.terrainCount).map((k) => ({ key: layoutKey('terrain', k), rel: REL.terrainBase + k }))),
    seg('water', 'H', range(REL.waterCount).map((k) => ({ key: layoutKey('water', k), rel: REL.waterBase + k }))),
    // 地下：XUND 0x01–0x0F 地铁 15 段、0x10–0x1E 水管 15 段、0x1F/0x20 交叉、0x21（本项目短管桩 → 建筑下水管）、0x22 导弹井、0x23 地铁入口
    seg('xund.subway', 'M', range(REL.segmentCount).map((k) => ({ key: layoutKey('xund', 0x01 + k), rel: REL.subwayBase + k }))),
    seg('xund.pipe', 'M', range(REL.segmentCount).map((k) => ({ key: layoutKey('xund', 0x10 + k), rel: REL.pipeBase + k }))),
    seg('xund.cross', 'M', [{ key: layoutKey('xund', 0x1f), rel: REL.crossPipeTbSubwayLr }, { key: layoutKey('xund', 0x20), rel: REL.crossPipeLrSubwayTb }]),
    seg('xund.special', 'M', [{ key: layoutKey('xund', XUND_PIPE_STUB), rel: REL.buildingPipe }, { key: layoutKey('xund', 0x22), rel: REL.siloUnderground }, { key: layoutKey('xund', 0x23), rel: REL.subwayEntrance }]),
    seg('overlay.zone', 'M', zoneRels.map((rel, k) => ({ key: layoutKey('overlay', OverlayId.ZoneRLight + k), rel })), tileCheck(zoneRels)),
    seg('overlay.preview', 'M', [{ key: layoutKey('overlay', OverlayId.PreviewOk), rel: REL.tintBase + 0 }, { key: layoutKey('overlay', OverlayId.PreviewBad), rel: REL.tintBase + 3 }], tileCheck([REL.tintBase, REL.tintBase + 3])),
    seg('overlay.noPower', 'M', [{ key: layoutKey('overlay', OverlayId.NoPower), rel: REL.noPower }]),
    seg('overlay.fire', 'M', [{ key: layoutKey('overlay', OverlayId.Fire), rel: REL.fireBase }]),
    // 角色：每种载具独立成段（某一种缺失不应连累其它）
    seg('actor.plane', 'M', [{ key: layoutKey('actor', ActorId.Plane), rel: REL.planeBase }]),
    seg('actor.helicopter', 'M', [{ key: layoutKey('actor', ActorId.Helicopter), rel: REL.copterBase }]),
    seg('actor.ship', 'M', [{ key: layoutKey('actor', ActorId.Ship), rel: REL.shipBase }]),
    seg('actor.train', 'M', [{ key: layoutKey('actor', ActorId.TrainHead), rel: REL.trainBase }]),
    seg('actor.nessie', 'M', [{ key: layoutKey('actor', ActorId.Nessie), rel: REL.nessie }]),
    seg('actor.sailboat', 'M', [{ key: layoutKey('actor', ActorId.Sailboat), rel: REL.sailboatBase }]),
    seg('actor.deploy', 'M', [
      { key: layoutKey('actor', ActorId.DeployPolice), rel: REL.deployPolice }, { key: layoutKey('actor', ActorId.DeployFire), rel: REL.deployFire },
      { key: layoutKey('actor', ActorId.DeployMilitary), rel: REL.deployMilitary },
    ]),
    seg('actor.explosion', 'M', [{ key: layoutKey('actor', ActorId.Explosion), rel: REL.explosionBase }]),
  ];
}

/** 多帧键的名义帧数（v1 的 DatSpriteProvider 仍报 frameCount 1；表留给 v2 动画）。 */
export const NOMINAL_FRAMES: Readonly<Record<string, number>> = {
  [layoutKey('overlay', OverlayId.Fire)]: REL.fireFrames,
  [layoutKey('actor', ActorId.Explosion)]: REL.explosionFrames,
};

/**
 * 由实际索引构造 IdLayout：present(abs) 判断某文件 ID 是否解码成功；sizeOf(abs) 给出尺寸（启发式校验）。
 * H 段：任一缩放级存在即保留该键。M 段：段内每个键至少在一个缩放级存在、且 check 通过，否则整段剔除并记诊断（只含 id / w / h）。
 */
export function buildIdLayout(present: (abs: number) => boolean, sizeOf: SizeOf, diagnostics: Diagnostic[]): IdLayout {
  const layout: IdLayout = {};
  const anyZoom = (rel: number): boolean => DAT_ZOOMS.some((z) => present(ZOOM_BASE[z] + rel));
  for (const seg of nominalSegments()) {
    if (seg.confidence === 'H') {
      for (const { key, rel } of seg.keys) if (anyZoom(rel)) layout[key] = rel;
      continue;
    }
    const missing = seg.keys.filter(({ rel }) => !anyZoom(rel));
    const sizeProblem = seg.check ? seg.check(sizeOf) : null;
    if (missing.length === 0 && sizeProblem === null) {
      for (const { key, rel } of seg.keys) layout[key] = rel;
      continue;
    }
    const why = missing.length ? `缺少相对号 ${missing.map((m) => m.rel).join(',')}` : sizeProblem!;
    diagnostics.push({ level: 'info', code: 'ID_LAYOUT_UNRESOLVED', message: `段 ${seg.name} 未对齐（${why}），该段回退程序化美术`, at: seg.name });
  }
  return layout;
}

export const relativeIdOf = (key: SpriteKey, layout: Readonly<IdLayout>): number | undefined => layout[layoutKey(key.kind, key.id)];
/** 文件内绝对 ID（zoom 基址 + 相对号）；键不在布局里返回 undefined。 */
export const absoluteIdOf = (key: SpriteKey, layout: Readonly<IdLayout>, zoom: DatZoom): number | undefined => {
  const rel = relativeIdOf(key, layout);
  return rel === undefined ? undefined : ZOOM_BASE[zoom] + rel;
};

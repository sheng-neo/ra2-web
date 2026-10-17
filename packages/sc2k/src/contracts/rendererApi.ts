// ===== rendererApi.ts =====（含 DOM 类型 HTMLElement；从 render.ts 拆出）
// 渲染后端 API（CONTRACTS §Q 末段）。只允许 render/pixi、ui、app、app/stubs 与 shell.ts import；
// tsconfig.sim.json 覆盖的目录（sim / art / render/scene / render/cpu / io/* …）不得 import 本文件。
import type { ViewState, RenderSource, SpriteProvider, ActorSprite, MapLayerMode, RendererStats } from './render';
import type { PlacementPreview } from './commands';

export interface RendererApi {
  attach(host: HTMLElement): Promise<void>; destroy(): void; resize(): void;
  setSource(src: RenderSource): void;                             // 新城 / 读档：全量重建
  setProvider(primary: SpriteProvider, fallback: SpriteProvider | null): void;   // 热切换 DAT ↔ procedural
  setView(v: ViewState): void; getView(): ViewState; goto(x: number, y: number, smooth: boolean): void;
  frame(dtMs: number): void;                                      // 消费 dirty、推进动画、提交
  setPreview(p: PlacementPreview | null): void; setActors(a: readonly ActorSprite[]): void; setHeatLayer(layer: MapLayerMode | null): void;
  pick(px: number, py: number): { x: number; y: number } | null; screenOf(x: number, y: number): [number, number];   // 屏幕像素 = worldToScreen(x,y,alt) + 相机偏移；pick 为其逆（减偏移后交给 SceneCompiler.pick）
  minimap(mode: MapLayerMode, out: Uint8ClampedArray /*128×128×4*/): void;
  thumbnail(w: number, h: number): Promise<Uint8Array /*PNG*/>;   // 走 CpuCompositor（XS 全图 → 盒式降采样）
  stats(): RendererStats;
}

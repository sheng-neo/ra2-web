/**
 * 渲染层对外接口（契约）。实现位于 render/index.ts，由 main.ts 与界面层调用。
 * 渲染层对 GameState 只读。
 */
import type { GameEvent, GameState, HeroId, Vec2 } from '../core/types';

export type Quality = 'low' | 'medium' | 'high';

/** 技能瞄准指示器（界面层在按住技能键拖动时设置，松手清除）。全部以玩家英雄为原点。 */
export type AimIndicator = (
  | { kind: 'direction'; dir: Vec2; range: number; width: number }
  | { kind: 'cone'; dir: Vec2; range: number; angle: number }
  | { kind: 'position'; pos: Vec2; range: number; radius: number }
  | { kind: 'target'; targetId: number; range: number }
  | { kind: 'self'; radius: number }
) & {
  /** 拖到取消区时为 true：指示器变红 */
  cancel?: boolean;
};

export interface RendererStats {
  fps: number;
  drawCalls: number;
  triangles: number;
}

export interface GameRenderer {
  /**
   * 画一帧。alpha ∈ [0,1] 为当前渲染时刻在 上一 tick → 当前 tick 之间的插值系数，
   * 单位位置用 lerp(prevPos, pos, alpha)。dtReal 为距上一帧的真实秒数（驱动粒子/动画）。
   */
  render(state: GameState, alpha: number, dtReal: number): void;
  /** 处理本帧模拟层产生的事件（特效、飘字、镜头震动…） */
  handleEvents(events: GameEvent[], state: GameState): void;
  setAim(aim: AimIndicator | null): void;
  setQuality(q: Quality): void;
  /** 容器尺寸变化时调用 */
  resize(): void;
  /** 屏幕坐标(相对视口的 clientX/clientY) → 地面坐标 */
  screenToGround(clientX: number, clientY: number): Vec2 | null;
  /** 世界坐标 → 屏幕坐标(clientX/clientY)。height 为离地高度 */
  worldToScreen(pos: Vec2, height?: number): { x: number; y: number; visible: boolean };
  /** 拾取屏幕点下的单位（点选攻击目标）。无则 -1。只返回对玩家可见、存活的单位 */
  pickUnit(clientX: number, clientY: number, state: GameState): number;
  /** 镜头默认跟随玩家英雄。传入坐标 = 临时观察该处(拖动小地图)；null = 回到跟随 */
  setCameraPeek(pos: Vec2 | null): void;
  getStats(): RendererStats;
  dispose(): void;
}

export interface RendererOptions {
  quality: Quality;
}

/** 英雄展示(选人界面的 3D 立绘)：在给定 canvas 上渲染一个站在展台上、缓慢转动的英雄 */
export interface HeroPreview {
  setHero(heroId: HeroId): void;
  /** 播放一次动作后回到待机 */
  play(anim: 'attack' | 'cast_s1' | 'cast_s2' | 'cast_ult'): void;
  resize(): void;
  dispose(): void;
}

/**
 * render/index.ts 需导出：
 *   export function createGameRenderer(container: HTMLElement, state: GameState, opts: RendererOptions): GameRenderer
 *     —— 在 container 内创建 WebGL canvas(以及需要的血条/飘字叠加层)，铺满 container。
 *   export function createHeroPreview(canvas: HTMLCanvasElement, heroId: HeroId): HeroPreview
 *   export function getHeroPortrait(heroId: HeroId): string
 *     —— 返回英雄头像的 data URL(方形，建议 128px；用 3D 模型离屏渲染半身像并缓存)。
 *   export function detectQuality(): Quality
 *     —— 依据设备(移动端/像素比/GPU 字符串)给出默认画质。
 */
export type CreateGameRenderer = (container: HTMLElement, state: GameState, opts: RendererOptions) => GameRenderer;
export type CreateHeroPreview = (canvas: HTMLCanvasElement, heroId: HeroId) => HeroPreview;

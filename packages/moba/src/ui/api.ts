/**
 * 界面层对外接口（契约）。实现位于 ui/index.ts，由 main.ts 调用。
 * 界面层 = DOM/CSS 的 HUD 与菜单 + 全部输入(键鼠/触控)。它不直接碰模拟层，只通过 HudHost。
 */
import type { AudioEngine } from '../audio/api';
import type { AimIndicator, HeroPreview, Quality } from '../render/api';
import type { Difficulty, GameEvent, GameState, HeroId, PlayerCommand, Vec2 } from '../core/types';

export interface Settings {
  quality: Quality;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  /** 显示帧率 */
  showFps: boolean;
  /** 镜头震动 */
  cameraShake: boolean;
  /**
   * 自动出装(玩家的偏好)：金币够了自动购买推荐出装的下一件。开局时作为 MatchConfig.autoBuy 的初值；
   * 对局中改它，宿主会转成 PlayerCommand 'autoBuy'。本局实际是否生效看 HeroUnit.autoBuy(卖出推荐装会让本局关闭，但不改这个偏好)。
   */
  autoBuy: boolean;
  /**
   * 新手引导：首次游玩默认开。引导走完 / 玩家点「跳过引导」/ 打完一局后由界面或宿主写成 false；
   * 设置面板里可以重新打开(对局中由 false 变 true = 从第一步重看)。「恢复默认」不动它。
   */
  tutorial: boolean;
  /** 屏幕上方的「当前目标」提示行 */
  objectiveHints: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  masterVolume: 0.8,
  sfxVolume: 0.9,
  musicVolume: 0.5,
  showFps: false,
  cameraShake: true,
  autoBuy: true,
  tutorial: true,
  objectiveHints: true,
};

/** HUD 向宿主(main.ts)索取的能力 */
export interface HudHost {
  /** 给玩家英雄下命令 */
  command(cmd: PlayerCommand): void;
  setAim(aim: AimIndicator | null): void;
  screenToGround(clientX: number, clientY: number): Vec2 | null;
  worldToScreen(pos: Vec2, height?: number): { x: number; y: number; visible: boolean };
  pickUnit(clientX: number, clientY: number): number;
  setCameraPeek(pos: Vec2 | null): void;
  setPaused(paused: boolean): void;
  /** 放弃对局返回主菜单 */
  quit(): void;
  /**
   * 当前生效的设置(活对象，随 updateSettings 原地更新，可以每帧读)。
   * HUD 各部件读 .autoBuy / .tutorial / .objectiveHints 都走这里，不另存副本。
   */
  getSettings(): Settings;
  /**
   * 修改并持久化设置（宿主负责应用到渲染/音频/模拟：如 autoBuy 会转成对局命令）。
   * 存储不可用时(沙箱 iframe)至少在本次会话内记住。引导走完后界面用它写 { tutorial: false }。
   */
  updateSettings(patch: Partial<Settings>): void;
  getFps(): number;
  audio: AudioEngine;
  /** 英雄头像 data URL */
  portrait(heroId: HeroId): string;
  /**
   * (可选) HUD 顶部各块界面此刻占用的屏幕矩形(clientX/clientY 坐标系：比分条、右上角数值牌、小地图、引导卡 / 当前目标 / 横幅)。
   * 宿主转给渲染层：史诗野怪与建筑的头顶出屏时，血条与名牌落在这些矩形下面而不是被盖住。布局变了 HUD 会重新调用；null = 不再占用。
   */
  setOverlayAvoid?(rects: { left: number; top: number; right: number; bottom: number }[] | null): void;
}

export interface Hud {
  /** 每帧调用（渲染帧率）。HUD 内部自行节流昂贵的 DOM 更新 */
  update(state: GameState, dtReal: number): void;
  handleEvents(events: GameEvent[], state: GameState): void;
  dispose(): void;
}

/** 菜单向宿主索取的能力 */
export interface MenuHost {
  getSettings(): Settings;
  updateSettings(patch: Partial<Settings>): void;
  audio: AudioEngine;
  portrait(heroId: HeroId): string;
  createHeroPreview(canvas: HTMLCanvasElement, heroId: HeroId): HeroPreview;
}

export interface MatchChoice {
  heroId: HeroId;
  difficulty: Difficulty;
}

export interface LoadingScreen {
  /** p ∈ [0,1] */
  setProgress(p: number, label?: string): void;
  close(): void;
}

/**
 * ui/index.ts 需导出：
 *   export function createHud(root: HTMLElement, host: HudHost, state: GameState): Hud
 *   export function showMainMenu(root: HTMLElement, host: MenuHost): Promise<MatchChoice>
 *     —— 标题页 → 选英雄(含难度) → 点击「开始对战」后 resolve。内部自行清理 DOM。
 *   export function showLoading(root: HTMLElement, choice: MatchChoice, host: MenuHost): LoadingScreen
 *     —— 双方阵容对阵的加载页。
 *   export function showResult(root: HTMLElement, state: GameState, host: MenuHost): Promise<'again' | 'menu'>
 *     —— 胜利/失败结算(战绩表、MVP)。
 *   export function loadSettings(): Settings / saveSettings(s: Settings): void   (localStorage，try/catch 包裹)
 */
export type CreateHud = (root: HTMLElement, host: HudHost, state: GameState) => Hud;

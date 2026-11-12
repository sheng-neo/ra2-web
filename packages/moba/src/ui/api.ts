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
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  masterVolume: 0.8,
  sfxVolume: 0.9,
  musicVolume: 0.5,
  showFps: false,
  cameraShake: true,
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
  getSettings(): Settings;
  /** 修改并持久化设置（宿主负责应用到渲染/音频） */
  updateSettings(patch: Partial<Settings>): void;
  getFps(): number;
  audio: AudioEngine;
  /** 英雄头像 data URL */
  portrait(heroId: HeroId): string;
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

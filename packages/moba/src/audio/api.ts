/**
 * 音频层对外接口（契约）。实现位于 audio/index.ts：`export function createAudio(): AudioEngine`。
 * 全部用 WebAudio 程序合成（无任何外部音频文件）。
 */
import type { GameEvent, GameState } from '../core/types';

export type UiSound = 'click' | 'hover' | 'confirm' | 'back' | 'select' | 'buy' | 'error' | 'ready' | 'countdown';
export type MusicTrack = 'none' | 'menu' | 'battle' | 'victory' | 'defeat';

export interface AudioVolumes {
  master: number;
  sfx: number;
  music: number;
}

export interface AudioEngine {
  /** 必须在用户手势(点击/触摸)回调里调用一次以解锁 AudioContext；重复调用无害 */
  unlock(): void;
  /** 处理模拟事件：按与玩家英雄的距离做音量衰减与左右声像；远处/不可见的事件不发声 */
  handleEvents(events: GameEvent[], state: GameState): void;
  /** 每帧调用：根据战况调整战斗音乐强度等 */
  update(state: GameState | null, dtReal: number): void;
  ui(sound: UiSound): void;
  setMusic(track: MusicTrack): void;
  setVolumes(v: AudioVolumes): void;
  dispose(): void;
}

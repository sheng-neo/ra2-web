/**
 * 音频层入口。全部音效与配乐由 WebAudio 程序合成，无任何外部音频文件。
 *
 *   const audio = createAudio();
 *   // 在任意用户手势回调里：audio.unlock()  (引擎自己也监听了首次手势作为兜底)
 *   audio.setVolumes({ master, sfx, music });
 *   audio.setMusic('menu' | 'battle' | 'victory' | 'defeat' | 'none');
 *   // 每个模拟 tick / 每帧：
 *   audio.handleEvents(world.drainEvents(), world.state);
 *   audio.update(world.state, dtReal);
 */
import type { AudioEngine } from './api';
import { Engine } from './engine';

export type { AudioEngine, AudioVolumes, MusicTrack, UiSound } from './api';
export type { AudioDebug, AudioDebugStats } from './engine';

export function createAudio(): AudioEngine {
  return new Engine();
}

/** 画廊/自检页用：同一个引擎，额外暴露 debug 接口(直接按键试听、读取发声统计、手动指定配乐强度) */
export function createAudioWithDebug(): Engine {
  return new Engine();
}

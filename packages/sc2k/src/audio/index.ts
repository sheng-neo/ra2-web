// ===== audio/index.ts =====（WP12b：AudioSink 实现，CONTRACTS §T / §V AudioEntry；配方在 ./synth.ts）
// v1：WebAudio 原创合成（振荡器 / 噪声 + 包络）；AudioContext 惰性创建（首次 play，避开自动播放策略；每次 play 尝试 resume）；
// setEnabled 可分别静音音效 / 音乐；loop(id, on) 以配方时长为周期重触发；startMusic 为极简序列循环。
// Node / 测试环境无 AudioContext 时全部安全降级为静默（不抛错）。测试可注入 createContext 工厂。
import type { AudioEntry } from '../contracts/entrypoints';
import type { AudioSink, SoundId } from '../contracts/audio';
import type { AudioContextLike } from './synth';
import { MUSIC_TRACKS, SOUND_RECIPES, playRecipe, recipeDuration } from './synth';

export { SOUND_IDS, SOUND_RECIPES, MUSIC_TRACKS, playRecipe, recipeDuration } from './synth';
export type { AudioContextLike, Recipe, Segment } from './synth';

export interface AudioSinkOptions {
  /** 返回 AudioContext（或 null = 不可用）；默认在浏览器用 window.AudioContext / webkitAudioContext。 */
  createContext?: () => AudioContextLike | null;
  /** 主音量（0..1）。 */
  masterVolume?: number;
  /** 定时器（音效循环 / 音乐步进；默认 setInterval / clearInterval）。 */
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

const MUSIC_NOTE_SECONDS_MIN = 0.12, MUSIC_GAIN = 0.05, MASTER_DEFAULT = 0.6;

function defaultContextFactory(): AudioContextLike | null {
  const g = globalThis as unknown as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try { return new Ctor(); } catch { return null; }
}

export const createAudioSink = ((opts: AudioSinkOptions = {}): AudioSink => {
  const makeCtx = opts.createContext ?? defaultContextFactory;
  const master = opts.masterVolume ?? MASTER_DEFAULT;
  const setTimer = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearTimer = opts.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  let ctx: AudioContextLike | null | undefined;          // undefined = 尚未尝试；null = 不可用
  let soundOn = true, musicOn = true;
  const loops = new Map<SoundId, unknown>();
  let music: { handle: unknown; track: keyof typeof MUSIC_TRACKS } | null = null;

  const context = (): AudioContextLike | null => {
    if (ctx === undefined) { try { ctx = makeCtx(); } catch { ctx = null; } }
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') { try { void ctx.resume(); } catch { /* 忽略 */ } }
    return ctx;
  };
  const playNow = (id: SoundId, volume: number, pan: number): void => {
    const c = context();
    if (!c) return;
    const recipe = SOUND_RECIPES[id];
    if (!recipe) return;
    // pan 在 v1 只折算成轻微的音量衰减（不引入 StereoPanner 以保持接口最小）
    const v = volume * (1 - Math.min(1, Math.abs(pan)) * 0.15);
    try { playRecipe(c, recipe, master, { volume: v }); } catch { /* 音频失败不影响游戏 */ }
  };

  const sink: AudioSink = {
    play(id, o) { if (!soundOn) return; playNow(id, o?.volume ?? 1, o?.pan ?? 0); },
    loop(id, on) {
      const cur = loops.get(id);
      if (!on) { if (cur !== undefined) { clearTimer(cur); loops.delete(id); } return; }
      if (cur !== undefined || !soundOn) return;
      const period = Math.max(50, Math.round(recipeDuration(SOUND_RECIPES[id]) * 1000));
      playNow(id, 1, 0);
      loops.set(id, setTimer(() => playNow(id, 1, 0), period));
    },
    setEnabled(sound, m) {
      soundOn = sound; musicOn = m;
      if (!sound) for (const id of [...loops.keys()]) sink.loop(id, false);
      if (!m && music) sink.stopMusic();
    },
    startMusic(track) {
      sink.stopMusic();
      if (!musicOn) return;
      const c = context();
      if (!c) return;
      const def = MUSIC_TRACKS[track];
      const noteSec = Math.max(MUSIC_NOTE_SECONDS_MIN, 60 / def.bpm / 2);
      let k = 0;
      const step = (): void => {
        const f = def.notes[k % def.notes.length]!;
        k++;
        try { playRecipe(c, [{ wave: 'triangle', t0: 0, dur: noteSec * 0.9, f0: f, gain: MUSIC_GAIN, attack: 0.01 }], master); } catch { /* 忽略 */ }
      };
      step();
      music = { handle: setTimer(step, Math.round(noteSec * 1000)), track };
    },
    stopMusic() { if (music) { clearTimer(music.handle); music = null; } },
  };
  return sink;
}) satisfies AudioEntry['createAudioSink'];

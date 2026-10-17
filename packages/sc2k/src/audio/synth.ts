// ===== audio/synth.ts =====（WP12b：WebAudio 极简原创合成音，ARCHITECTURE §7.5）
// 每个 SoundId 一份"配方"：若干段振荡器 / 噪声 + 增益包络（几十到几百毫秒）。不含任何原版音频素材。
// 与真实 AudioContext 解耦：只依赖 AudioContextLike 这组最小接口，测试可注入记录器。
import type { SoundId } from '../contracts/audio';

/** 本模块需要的 AudioContext 子集（真实 AudioContext 满足；测试注入假对象）。 */
export interface GainLike { gain: { value: number; setValueAtTime(v: number, t: number): unknown; linearRampToValueAtTime(v: number, t: number): unknown; exponentialRampToValueAtTime(v: number, t: number): unknown }; connect(dst: unknown): unknown; disconnect?(): void }
export interface OscLike { type: string; frequency: { value: number; setValueAtTime(v: number, t: number): unknown; exponentialRampToValueAtTime(v: number, t: number): unknown; linearRampToValueAtTime(v: number, t: number): unknown }; connect(dst: unknown): unknown; start(t?: number): void; stop(t?: number): void }
export interface BufferLike { getChannelData(ch: number): Float32Array }
export interface BufferSourceLike { buffer: BufferLike | null; loop: boolean; connect(dst: unknown): unknown; start(t?: number): void; stop(t?: number): void }
export interface AudioContextLike {
  readonly currentTime: number; readonly sampleRate: number; readonly destination: unknown; readonly state?: string;
  resume?(): Promise<void> | void;
  createOscillator(): OscLike; createGain(): GainLike;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike; createBufferSource(): BufferSourceLike;
}

export type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';
/** 一段音：t0 起点（秒，相对触发）、dur 时长、f0→f1 频率滑移（noise 忽略）、gain 峰值、attack 起音时间。 */
export interface Segment { wave: Wave; t0: number; dur: number; f0: number; f1?: number; gain: number; attack?: number }
export type Recipe = readonly Segment[];

const seg = (wave: Wave, t0: number, dur: number, f0: number, gain: number, f1?: number, attack?: number): Segment => ({ wave, t0, dur, f0, f1, gain, attack });

/** 全部 SoundId（contracts/audio 只有类型，这里给出可枚举列表；audio.test 与类型对账）。 */
export const SOUND_IDS: readonly SoundId[] = ['click', 'place', 'bulldoze', 'reject', 'zone', 'cash', 'siren', 'explosion', 'thunder', 'monster', 'tornado', 'plane', 'helicopter', 'train', 'ship', 'boo', 'cheer', 'news', 'invention', 'milestone', 'launch', 'quake', 'flood'];

/** 原创配方表（数值为设计值）。 */
export const SOUND_RECIPES: Readonly<Record<SoundId, Recipe>> = {
  click: [seg('square', 0, 0.03, 1800, 0.12, 1200)],
  place: [seg('triangle', 0, 0.06, 520, 0.18, 780), seg('triangle', 0.06, 0.08, 780, 0.14, 1040)],
  bulldoze: [seg('noise', 0, 0.18, 0, 0.22), seg('sawtooth', 0, 0.16, 140, 0.12, 60)],
  reject: [seg('square', 0, 0.09, 330, 0.16, 220), seg('square', 0.11, 0.12, 220, 0.14, 160)],
  zone: [seg('sine', 0, 0.05, 660, 0.12, 660), seg('sine', 0.05, 0.05, 880, 0.12, 880)],
  cash: [seg('sine', 0, 0.05, 1320, 0.14), seg('sine', 0.05, 0.05, 1760, 0.14), seg('sine', 0.1, 0.12, 2640, 0.12)],
  siren: [seg('sawtooth', 0, 0.45, 600, 0.12, 900), seg('sawtooth', 0.45, 0.45, 900, 0.12, 600)],
  explosion: [seg('noise', 0, 0.6, 0, 0.35), seg('sine', 0, 0.5, 90, 0.3, 30)],
  thunder: [seg('noise', 0, 1.2, 0, 0.25, undefined, 0.15), seg('sine', 0.05, 0.9, 60, 0.2, 25)],
  monster: [seg('sawtooth', 0, 0.7, 70, 0.22, 45), seg('square', 0.1, 0.5, 140, 0.1, 95)],
  tornado: [seg('noise', 0, 1.0, 0, 0.18, undefined, 0.3), seg('sine', 0, 1.0, 180, 0.08, 260)],
  plane: [seg('sawtooth', 0, 0.8, 220, 0.08, 160, 0.2)],
  helicopter: [seg('square', 0, 0.08, 55, 0.12), seg('square', 0.1, 0.08, 55, 0.12), seg('square', 0.2, 0.08, 55, 0.12)],
  train: [seg('triangle', 0, 0.25, 440, 0.14, 440), seg('triangle', 0, 0.25, 554, 0.1, 554), seg('noise', 0.25, 0.2, 0, 0.08)],
  ship: [seg('square', 0, 0.6, 110, 0.14, 110, 0.05), seg('square', 0, 0.6, 165, 0.08, 165, 0.05)],
  boo: [seg('sawtooth', 0, 0.35, 260, 0.12, 180), seg('sawtooth', 0.05, 0.35, 250, 0.1, 170)],
  cheer: [seg('triangle', 0, 0.12, 523, 0.12), seg('triangle', 0.1, 0.12, 659, 0.12), seg('triangle', 0.2, 0.2, 784, 0.14)],
  news: [seg('square', 0, 0.06, 988, 0.1), seg('square', 0.08, 0.06, 988, 0.1), seg('square', 0.16, 0.14, 1319, 0.12)],
  invention: [seg('sine', 0, 0.1, 659, 0.12), seg('sine', 0.1, 0.1, 831, 0.12), seg('sine', 0.2, 0.1, 988, 0.12), seg('sine', 0.3, 0.25, 1319, 0.14)],
  milestone: [seg('triangle', 0, 0.15, 392, 0.14), seg('triangle', 0.15, 0.15, 523, 0.14), seg('triangle', 0.3, 0.3, 784, 0.16)],
  launch: [seg('noise', 0, 1.4, 0, 0.2, undefined, 0.4), seg('sawtooth', 0, 1.4, 80, 0.12, 640)],
  quake: [seg('noise', 0, 1.0, 0, 0.3, undefined, 0.1), seg('sine', 0, 1.0, 40, 0.25, 28)],
  flood: [seg('noise', 0, 0.9, 0, 0.2, undefined, 0.25), seg('sine', 0, 0.9, 120, 0.06, 80)],
};

const MIN_GAIN = 0.0001;
let noiseCache: WeakMap<AudioContextLike, BufferLike> | null = null;

/** 1 秒白噪声缓冲（按 ctx 缓存）。UI / audio 层允许 Math.random。 */
export function noiseBuffer(ctx: AudioContextLike): BufferLike {
  noiseCache ??= new WeakMap();
  const hit = noiseCache.get(ctx);
  if (hit) return hit;
  const len = Math.max(1, Math.floor(ctx.sampleRate));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buf);
  return buf;
}

export interface PlayOptions { volume?: number; pan?: number; at?: number }

/** 按配方调度一次播放；返回总时长（秒）。 */
export function playRecipe(ctx: AudioContextLike, recipe: Recipe, master: number, opts: PlayOptions = {}): number {
  const start = (opts.at ?? ctx.currentTime);
  const vol = Math.max(0, Math.min(1, opts.volume ?? 1)) * master;
  let end = 0;
  for (const s of recipe) {
    const t0 = start + s.t0, t1 = t0 + s.dur, attack = Math.min(s.dur / 2, s.attack ?? 0.005);
    const g = ctx.createGain();
    const peak = Math.max(MIN_GAIN, s.gain * vol);
    g.gain.setValueAtTime(MIN_GAIN, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t1);
    g.connect(ctx.destination);
    if (s.wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      src.connect(g);
      src.start(t0);
      src.stop(t1 + 0.01);
    } else {
      const o = ctx.createOscillator();
      o.type = s.wave;
      o.frequency.setValueAtTime(Math.max(1, s.f0), t0);
      if (s.f1 !== undefined && s.f1 !== s.f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, s.f1), t1);
      o.connect(g);
      o.start(t0);
      o.stop(t1 + 0.01);
    }
    end = Math.max(end, s.t0 + s.dur);
  }
  return end;
}

/** 配方总时长（秒）。 */
export const recipeDuration = (r: Recipe): number => r.reduce((m, s) => Math.max(m, s.t0 + s.dur), 0);

/** 三首极简序列（音名频率，原创短句；startMusic 按 track 循环）。 */
export const MUSIC_TRACKS: Readonly<Record<'city' | 'disaster' | 'title', { bpm: number; notes: readonly number[] }>> = {
  city: { bpm: 96, notes: [392, 494, 587, 494, 440, 523, 659, 523, 349, 440, 523, 440, 392, 494, 587, 784] },
  disaster: { bpm: 140, notes: [147, 147, 175, 147, 139, 139, 165, 139, 131, 131, 156, 131, 147, 175, 196, 147] },
  title: { bpm: 72, notes: [262, 330, 392, 523, 494, 392, 330, 294, 349, 440, 523, 440, 392, 330, 262, 196] },
};

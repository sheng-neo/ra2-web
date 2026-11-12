/**
 * 离线渲染自检：听不到声音时用数据自证。
 * 用 OfflineAudioContext 把每个音效 / 每段配乐 / 一场模拟团战渲染成波形，统计峰值、响度、时长、
 * 频段能量占比、是否含 NaN、是否有采样级突变(爆音)，并据目标响度推导配平增益。
 * 走的是与实时引擎完全相同的 Mixer / 配方 / 调度器代码，只是时钟换成了虚拟时钟。
 */
import type { MusicTrack } from './api';
import { Mixer } from './mixer';
import { MusicEngine, SCORE } from './music';
import type { ScorePart } from './music';
import { SFX, SFX_KEYS, trimOf } from './sfx';
import type { SfxKey } from './sfx';

const SR = 44100;
const db = (x: number): number => (x > 1e-9 ? 20 * Math.log10(x) : -180);

export interface Analysis {
  peak: number;
  /** 有效段(>-60dB)的 RMS，dBFS */
  rmsDb: number;
  /** 100ms 窗的最大 RMS，dBFS */
  loudDb: number;
  /** A 计权后的 ~100ms 最大 RMS，dBFS：更接近听感(也更接近手机小喇叭能放出来的部分) */
  loudA: number;
  /** 有效段时长(秒) */
  dur: number;
  nan: boolean;
  dc: number;
  /** 频段能量占比：<250Hz / 250Hz~2.5kHz / >2.5kHz */
  low: number;
  mid: number;
  high: number;
  /** 频谱质心(Hz) */
  centroid: number;
  /** 相邻采样最大差 */
  maxStep: number;
  /** 疑似爆音数：单个采样的跳变既大于 0.2，又远超它前后各 32 个采样的平均变化量(孤立的不连续点) */
  clicks: number;
  /** 峰值包络缩略(画波形用) */
  env: number[];
}

/** 原地基 2 FFT */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const FFT_N = 2048;
const HANN = new Float64Array(FFT_N);
for (let i = 0; i < FFT_N; i++) HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1));

/** A 计权的功率增益(线性) */
function aWeight(f: number): number {
  const f2 = f * f;
  const ra = (148693636 * f2 * f2) / ((f2 + 424.36) * Math.sqrt((f2 + 11599.29) * (f2 + 544496.41)) * (f2 + 148693636));
  const g = ra * 1.2589;
  return g * g;
}
const A_W = new Float64Array(FFT_N / 2);
for (let b = 1; b < FFT_N / 2; b++) A_W[b] = aWeight((b * SR) / FFT_N);

/** 找孤立的采样级不连续点。高频音头/噪声突发的前后变化量同样大，不会被误判 */
function countClicks(x: Float32Array): number {
  const n = x.length;
  if (n < 80) return 0;
  const W = 32;
  // 前缀和：pre[i] = Σ|x[k] - x[k-1]|, k ≤ i
  const pre = new Float64Array(n);
  for (let i = 1; i < n; i++) pre[i] = pre[i - 1] + Math.abs(x[i] - x[i - 1]);
  let clicks = 0;
  for (let i = W + 1; i < n - W - 1; i++) {
    const d = Math.abs(x[i] - x[i - 1]);
    if (d <= 0.2) continue;
    const before = (pre[i - 1] - pre[i - 1 - W]) / W;
    const after = (pre[i + W] - pre[i]) / W;
    if (d > 8 * Math.max(before, after) + 0.02) {
      clicks++;
      i += 256;
    }
  }
  return clicks;
}

export function analyze(buf: AudioBuffer, envPoints = 64, envActiveOnly = false): Analysis {
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = buf.length;
  const sr = buf.sampleRate;
  let peak = 0;
  let nan = false;
  let first = -1;
  let last = -1;
  let maxStep = 0;
  const env = new Array<number>(envPoints).fill(0);
  for (let i = 0; i < n; i++) {
    const l = L[i];
    const r = R[i];
    if (l !== l || r !== r || !Number.isFinite(l) || !Number.isFinite(r)) {
      nan = true;
      continue;
    }
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > peak) peak = a;
    if (a > 0.001) {
      if (first < 0) first = i;
      last = i;
    }
    if (!envActiveOnly) {
      const ei = Math.min(envPoints - 1, Math.floor((i / n) * envPoints));
      if (a > env[ei]) env[ei] = a;
    }
    if (i > 0) {
      const d = Math.abs(l - L[i - 1]);
      if (d > maxStep) maxStep = d;
    }
  }
  if (first < 0) first = last = 0;
  const len = last - first + 1;
  if (envActiveOnly) {
    // 单个音效：包络只画有效段，缩略图才能看清形状
    for (let i = first; i <= last; i++) {
      const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      const ei = Math.min(envPoints - 1, Math.floor(((i - first) / len) * envPoints));
      if (a > env[ei]) env[ei] = a;
    }
  }
  let sq = 0;
  let sum = 0;
  for (let i = first; i <= last; i++) {
    sq += (L[i] * L[i] + R[i] * R[i]) / 2;
    sum += (L[i] + R[i]) / 2;
  }
  // 响度：100ms 窗、50ms 步进的最大 RMS
  const win = Math.floor(sr * 0.1);
  const hop = Math.floor(sr * 0.05);
  let loud = 0;
  for (let s = 0; s < n; s += hop) {
    const e = Math.min(n, s + win);
    let w = 0;
    for (let i = s; i < e; i++) w += (L[i] * L[i] + R[i] * R[i]) / 2;
    // 不足一窗的尾段仍按整窗长度归一，短音效不会被高估
    w = Math.sqrt(w / win);
    if (w > loud) loud = w;
  }
  // 频谱：有效段分帧累加功率谱
  const re = new Float64Array(FFT_N);
  const im = new Float64Array(FFT_N);
  let pl = 0;
  let pm = 0;
  let ph = 0;
  let cn = 0;
  let cd = 0;
  // A 计权帧功率的三帧滑动平均(≈93ms)取最大
  let a1 = 0;
  let a2 = 0;
  let loudA = 0;
  const frameScale = 2 / (FFT_N * FFT_N * 0.375);
  // 第一帧提前半帧：否则音头正好落在汉宁窗的零点上，瞬态会被整个抹掉
  for (let s = first - FFT_N / 2; s <= last + FFT_N / 2; s += FFT_N / 2) {
    for (let i = 0; i < FFT_N; i++) {
      const k = s + i;
      re[i] = k >= 0 && k < n ? ((L[k] + R[k]) / 2) * HANN[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    let pa = 0;
    for (let b = 1; b < FFT_N / 2; b++) {
      const f = (b * sr) / FFT_N;
      const p = re[b] * re[b] + im[b] * im[b];
      if (f < 250) pl += p;
      else if (f < 2500) pm += p;
      else ph += p;
      cn += f * p;
      cd += p;
      pa += p * A_W[b];
    }
    pa *= frameScale;
    const avg = (pa + a1 + a2) / 3;
    if (avg > loudA) loudA = avg;
    a2 = a1;
    a1 = pa;
  }
  const clicks = Math.max(countClicks(L), countClicks(R));
  const tot = pl + pm + ph || 1;
  return {
    peak,
    rmsDb: db(Math.sqrt(sq / len)),
    loudDb: db(loud),
    loudA: db(Math.sqrt(loudA)),
    dur: len / sr,
    nan,
    dc: sum / len,
    low: pl / tot,
    mid: pm / tot,
    high: ph / tot,
    centroid: cd > 0 ? cn / cd : 0,
    maxStep,
    clicks,
    env,
  };
}

/**
 * 渲染单个音效(干声 + 混响，旁路压限，增益 1、居中)。
 * dur 只对跟随时长的键有意义(区域铺底、回城引导、巨龙吐息)。
 */
export async function renderSfx(key: SfxKey, v = 0, dur?: number): Promise<AudioBuffer> {
  const def = SFX[key];
  const seconds = Math.max(def.len, dur ?? 0) + (def.rev > 0 ? 2.2 : 0.4);
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const mixer = new Mixer(ctx, { dynamics: false, clock: () => 0 });
  mixer.play(key, { v, pan: 0, dur });
  return ctx.startRendering();
}

export interface SfxRow extends Analysis {
  key: SfxKey;
  label: string;
  cat: string;
  variant: string;
  /** 目标响度与当前配平增益 */
  target: number;
  trim: number;
  /** 按实测值推导出的新配平增益 */
  suggest: number;
  issues: string[];
}

export async function checkSfx(key: SfxKey, v = 0, variant = ''): Promise<SfxRow> {
  const def = SFX[key];
  const a = analyze(await renderSfx(key, v), 96, true);
  const trim = trimOf(key);
  // 把 A 计权响度拉到目标值；同时不让未计权响度超出目标 7dB(低频为主的声音)、峰值不超过 0.89
  let suggest = trim * Math.pow(10, (def.loud - a.loudA) / 20);
  const rawCap = trim * Math.pow(10, (def.loud + 7 - a.loudDb) / 20);
  if (suggest > rawCap) suggest = rawCap;
  const rawPeak = a.peak / trim;
  if (rawPeak * suggest > 0.89) suggest = 0.89 / rawPeak;
  const issues: string[] = [];
  if (a.nan) issues.push('含 NaN');
  if (a.peak < 0.02) issues.push('近乎静音');
  if (a.peak > 1.0) issues.push('削波');
  if (a.dur < 0.02) issues.push('过短');
  if (a.dur > def.len * 1.4 + 2.6) issues.push('过长');
  if (Math.abs(a.dc) > 0.02) issues.push('直流偏移');
  if (a.clicks > 0) issues.push(`疑似爆音×${a.clicks}`);
  return { ...a, key, label: def.label, cat: def.cat, variant, target: def.loud, trim, suggest, issues };
}

/** 逐键自检(含变体)。onRow 每完成一行回调一次 */
export async function checkAllSfx(onRow?: (row: SfxRow, done: number, total: number) => void): Promise<SfxRow[]> {
  const jobs: { key: SfxKey; v: number; variant: string }[] = [];
  for (const key of SFX_KEYS) {
    const vs = SFX[key].variants;
    if (vs) for (const x of vs) jobs.push({ key, v: x.v, variant: x.label });
    else jobs.push({ key, v: 0, variant: '' });
  }
  const rows: SfxRow[] = [];
  for (const j of jobs) {
    const row = await checkSfx(j.key, j.v, j.variant);
    rows.push(row);
    onRow?.(row, rows.length, jobs.length);
  }
  return rows;
}

export interface MusicRow {
  name: string;
  track: MusicTrack;
  intensity: number;
  tension: number;
  seconds: number;
  peak: number;
  rmsDb: number;
  nan: boolean;
  clicks: number;
  maxStep: number;
  low: number;
  mid: number;
  high: number;
  /** 每秒 RMS(dBFS)及其最小/最大(跳过第一秒的淡入) */
  secDb: number[];
  minSecDb: number;
  maxSecDb: number;
  /** 最长静音段(50ms 窗 RMS < -55dB，秒) */
  silence: number;
  /** 左右声道 RMS 之差(dB，正 = 偏左)；以及左右相加成单声道后相对立体声的电平变化(dB，手机单喇叭兼容性) */
  balance: number;
  monoDb: number;
  /** 对数频率声谱：frames × bands，值 0..1 */
  spec: number[][];
  env: number[];
  issues: string[];
}

function spectrogram(buf: AudioBuffer, bands = 96): number[][] {
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = buf.length;
  const sr = buf.sampleRate;
  const out: number[][] = [];
  const re = new Float64Array(FFT_N);
  const im = new Float64Array(FFT_N);
  const hop = Math.floor(sr * 0.05);
  const fMin = 40;
  const fMax = 14000;
  for (let s = 0; s + FFT_N <= n; s += hop) {
    for (let i = 0; i < FFT_N; i++) {
      re[i] = ((L[s + i] + R[s + i]) / 2) * HANN[i];
      im[i] = 0;
    }
    fft(re, im);
    const row = new Array<number>(bands).fill(0);
    for (let b = 1; b < FFT_N / 2; b++) {
      const f = (b * sr) / FFT_N;
      if (f < fMin || f >= fMax) continue;
      const k = Math.floor((Math.log(f / fMin) / Math.log(fMax / fMin)) * bands);
      row[k] += re[b] * re[b] + im[b] * im[b];
    }
    for (let k = 0; k < bands; k++) row[k] = 10 * Math.log10(row[k] + 1e-9);
    out.push(row);
  }
  // 以全图最强处为 0dB，向下取 50dB 动态范围
  let top = -Infinity;
  for (const row of out) for (const v of row) if (v > top) top = v;
  for (const row of out) for (let k = 0; k < bands; k++) row[k] = Math.max(0, Math.min(1, (row[k] - top + 50) / 50));
  return out;
}

/**
 * 分段离线渲染：每 step 秒暂停一次，推进虚拟时钟、排下一段的音符、回收已结束的节点，再继续。
 * 这样节点数与实时运行时一样保持在很小的规模(一次排完整段会让渲染时间随节点数平方增长)，
 * 同时也让离线自检覆盖到「调度 + 回收」这条实时路径。
 */
function renderChunked(ctx: OfflineAudioContext, seconds: number, step: number, onChunk: (t: number) => void): Promise<AudioBuffer> {
  for (let i = 1; i * step < seconds - 0.01; i++) {
    const t = i * step;
    void ctx.suspend(t).then(() => {
      onChunk(t);
      void ctx.resume();
    });
  }
  onChunk(0);
  return ctx.startRendering();
}

/** 渲染一段配乐(完整总线链：压限 + 软削波，音量全开)并统计 */
export async function checkMusic(name: string, track: MusicTrack, seconds: number, intensity = 0, tension = 0): Promise<MusicRow> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  let now = 0;
  const mixer = new Mixer(ctx, { clock: () => now });
  const music = new MusicEngine(mixer);
  music.setMood(intensity, tension);
  music.setTrack(track);
  const step = 0.25;
  const buf = await renderChunked(ctx, seconds, step, (t) => {
    now = t;
    mixer.sweep();
    music.tick(step + 0.1);
  });
  const a = analyze(buf, 200);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const issues0: string[] = [];
  const secDb: number[] = [];
  for (let s = 0; s + SR <= buf.length; s += SR) {
    let w = 0;
    for (let i = s; i < s + SR; i++) w += (L[i] * L[i] + R[i] * R[i]) / 2;
    secDb.push(db(Math.sqrt(w / SR)));
  }
  let sl = 0;
  let sr = 0;
  let sm = 0;
  for (let i = 0; i < buf.length; i++) {
    sl += L[i] * L[i];
    sr += R[i] * R[i];
    const m = (L[i] + R[i]) / 2;
    sm += m * m;
  }
  const balance = db(Math.sqrt(sl)) - db(Math.sqrt(sr));
  const monoDb = db(Math.sqrt(sm)) - db(Math.sqrt((sl + sr) / 2));
  if (Math.abs(balance) > 2) issues0.push(`左右不平衡 ${balance.toFixed(1)}dB`);
  if (monoDb < -4) issues0.push(`单声道相消 ${monoDb.toFixed(1)}dB`);
  const body = secDb.slice(1);
  const minSecDb = Math.min(...body);
  const maxSecDb = Math.max(...body);
  const win = Math.floor(SR * 0.05);
  let run = 0;
  let silence = 0;
  for (let s = SR; s + win <= buf.length; s += win) {
    let w = 0;
    for (let i = s; i < s + win; i++) w += (L[i] * L[i] + R[i] * R[i]) / 2;
    if (Math.sqrt(w / win) < 0.0018) {
      run += 0.05;
      if (run > silence) silence = run;
    } else run = 0;
  }
  const issues: string[] = issues0;
  if (a.nan) issues.push('含 NaN');
  if (a.peak > 1.0) issues.push('削波');
  if (a.peak < 0.05) issues.push('近乎静音');
  if (a.clicks > 0) issues.push(`疑似爆音×${a.clicks}`);
  if (silence > 1.5) issues.push(`静音段 ${silence.toFixed(1)}s`);
  if (minSecDb < -50) issues.push('电平塌陷');
  return {
    name, track, intensity, tension, seconds,
    peak: a.peak, rmsDb: a.rmsDb, nan: a.nan, clicks: a.clicks, maxStep: a.maxStep, low: a.low, mid: a.mid, high: a.high,
    secDb, minSecDb, maxSecDb, silence, balance, monoDb, spec: spectrogram(buf), env: a.env, issues,
  };
}

export interface MixRow {
  track: MusicTrack;
  chan: string;
  peak: number;
  /** 整段 RMS / 只统计有声的 100ms 窗的 RMS(稀疏声部看这个) */
  rmsDb: number;
  activeDb: number;
  low: number;
  mid: number;
  high: number;
}

/**
 * 混音表：把某首曲子的每个通道单独渲染(旁路压限)，量出各自的电平与频段，
 * 用数据而不是耳朵来平衡各声部。chan = '(全部)' 的一行是未压限的总和。
 */
export async function checkMix(track: MusicTrack, seconds: number, intensity = 0, tension = 0): Promise<MixRow[]> {
  const rows: MixRow[] = [];
  const render = async (solo: string | null): Promise<string[]> => {
    MusicEngine.solo = solo;
    try {
      const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
      let now = 0;
      const mixer = new Mixer(ctx, { dynamics: false, clock: () => now });
      const music = new MusicEngine(mixer);
      music.setMood(intensity, tension);
      music.setTrack(track);
      const names = music.channels;
      const buf = await renderChunked(ctx, seconds, 0.25, (t) => {
        now = t;
        mixer.sweep();
        music.tick(0.35);
      });
      const a = analyze(buf, 8);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const win = Math.floor(SR * 0.1);
      let sq = 0;
      let cnt = 0;
      for (let s0 = 0; s0 + win <= buf.length; s0 += win) {
        let w = 0;
        for (let i = s0; i < s0 + win; i++) w += (L[i] * L[i] + R[i] * R[i]) / 2;
        if (Math.sqrt(w / win) > 0.0018) {
          sq += w;
          cnt += win;
        }
      }
      rows.push({ track, chan: solo ?? '(全部)', peak: a.peak, rmsDb: a.rmsDb, activeDb: cnt ? db(Math.sqrt(sq / cnt)) : -180, low: a.low, mid: a.mid, high: a.high });
      return names;
    } finally {
      MusicEngine.solo = null;
    }
  };
  const names = await render(null);
  for (const n of names) await render(n);
  return rows;
}

export interface GameRow {
  seconds: number;
  peak: number;
  rmsDb: number;
  /** 每秒 RMS(dBFS) */
  secDb: number[];
  nan: boolean;
  clicks: number;
  low: number;
  mid: number;
  high: number;
  played: number;
  throttled: number;
  capped: number;
  stolen: number;
  peakVoices: number;
  endLive: number;
  /** 各键播放次数，降序 */
  byKey: [string, number][];
  env: number[];
  issues: string[];
}

/**
 * 把一段「真实对局」渲染成波形：调用方提供 attach(挂接引擎) 与 tick(推进一个模拟步并把事件喂给引擎)，
 * 这里负责分段渲染、推进虚拟时钟并统计。用完整总线链(压限 + 软削波)。
 */
export async function renderGame(
  seconds: number,
  dt: number,
  attach: (ctx: OfflineAudioContext, clock: () => number) => Mixer,
  tick: (t: number) => void,
): Promise<GameRow> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  let now = 0;
  const mixer = attach(ctx, () => now);
  const buf = await renderChunked(ctx, seconds, dt, (t) => {
    now = t;
    tick(t);
  });
  const a = analyze(buf, 240);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const secDb: number[] = [];
  for (let s0 = 0; s0 + SR <= buf.length; s0 += SR) {
    let w = 0;
    for (let i = s0; i < s0 + SR; i++) w += (L[i] * L[i] + R[i] * R[i]) / 2;
    secDb.push(db(Math.sqrt(w / SR)));
  }
  const issues: string[] = [];
  if (a.nan) issues.push('含 NaN');
  if (a.peak > 1.0) issues.push('削波');
  if (a.clicks > 0) issues.push(`疑似爆音×${a.clicks}`);
  const st = mixer.stats;
  return {
    seconds, peak: a.peak, rmsDb: a.rmsDb, secDb, nan: a.nan, clicks: a.clicks, low: a.low, mid: a.mid, high: a.high,
    played: st.played, throttled: st.throttled, capped: st.capped, stolen: st.stolen, peakVoices: st.peakVoices, endLive: mixer.voiceCount,
    byKey: [...mixer.counts].sort((x, y) => y[1] - x[1]), env: a.env, issues,
  };
}

export interface ScoreRow {
  name: string;
  notes: number;
  /** 检测到的主音高与乐谱一致(同音名，允许八度叠置)的音符数 */
  matched: number;
  /** 不一致的音：[步, 期望 MIDI, 实测 MIDI] */
  misses: [number, number, number][];
}

const MEL_N = 16384;

/** 在 [f1, f2] 内找最强谱峰对应的频率(抛物线插值) */
function dominantFreq(x: Float32Array, at: number, len: number, sr: number, f1: number, f2: number): { freq: number; mags: Float64Array } {
  const re = new Float64Array(MEL_N);
  const im = new Float64Array(MEL_N);
  for (let i = 0; i < len; i++) {
    const k = at + i;
    re[i] = k < x.length ? x[k] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1))) : 0;
  }
  fft(re, im);
  const mags = new Float64Array(MEL_N / 2);
  let best = 0;
  let bi = 0;
  const b1 = Math.floor((f1 * MEL_N) / sr);
  const b2 = Math.ceil((f2 * MEL_N) / sr);
  for (let b = 1; b < MEL_N / 2; b++) {
    mags[b] = Math.hypot(re[b], im[b]);
    if (b >= b1 && b <= b2 && mags[b] > best) {
      best = mags[b];
      bi = b;
    }
  }
  const a = mags[bi - 1] ?? 0;
  const c = mags[bi + 1] ?? 0;
  const off = a + c - 2 * best !== 0 ? (0.5 * (a - c)) / (a - 2 * best + c) : 0;
  return { freq: ((bi + off) * sr) / MEL_N, mags };
}

/**
 * 自动听写：单独渲染旋律通道，在每个音符起音后 ~0.1 秒处取一窗做频谱，
 * 看乐谱上的那个音(或其八度)是不是当时最强的音高成分。
 */
export async function checkScore(part: ScorePart): Promise<ScoreRow> {
  const lastStep = Math.max(...part.events.map((e) => e[0] + e[2]));
  const seconds = part.start + lastStep * part.stepDur + 1.5;
  MusicEngine.solo = part.chan;
  let buf: AudioBuffer;
  try {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
    let now = 0;
    const mixer = new Mixer(ctx, { dynamics: false, clock: () => now });
    const music = new MusicEngine(mixer);
    music.setMood(part.intensity, 0);
    music.setTrack(part.track);
    buf = await renderChunked(ctx, seconds, 0.25, (t) => {
      now = t;
      mixer.sweep();
      music.tick(0.35);
    });
  } finally {
    MusicEngine.solo = null;
  }
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const mono = new Float32Array(buf.length);
  for (let i = 0; i < mono.length; i++) mono[i] = (L[i] + R[i]) / 2;
  const win = 4096;
  const misses: [number, number, number][] = [];
  let matched = 0;
  for (const e of part.events) {
    const want = e[1] + part.transpose;
    const noteLen = e[2] * part.stepDur;
    const at = Math.floor((part.start + e[0] * part.stepDur + Math.min(0.11, noteLen * 0.4)) * SR);
    const { freq, mags } = dominantFreq(mono, at, win, SR, 120, 2600);
    const got = 69 + 12 * Math.log2(freq / 440);
    const near = Math.round(got);
    // 乐谱音(及其上下八度)处的谱峰是否与全场最强峰相当(6dB 以内)
    let top = 0;
    for (let b = Math.floor((120 * MEL_N) / SR); b < (2600 * MEL_N) / SR; b++) if (mags[b] > top) top = mags[b];
    let ok = false;
    for (const oct of [-12, 0, 12]) {
      const f = 440 * Math.pow(2, (want + oct - 69) / 12);
      const b = Math.round((f * MEL_N) / SR);
      let m = 0;
      for (let k = b - 3; k <= b + 3; k++) if (mags[k] > m) m = mags[k];
      if (m >= top * 0.5) ok = true;
    }
    if (ok) matched++;
    else misses.push([e[0], want, near]);
  }
  return { name: part.name, notes: part.events.length, matched, misses };
}

export async function checkAllScores(): Promise<ScoreRow[]> {
  const rows: ScoreRow[] = [];
  for (const p of SCORE) rows.push(await checkScore(p));
  return rows;
}

export interface StressRow {
  seconds: number;
  events: number;
  played: number;
  throttled: number;
  capped: number;
  stolen: number;
  peakVoices: number;
  /** 渲染过程中同时存活的发声 + 配乐音符记录数的最大值 / 结束时残留的音效发声数(应为 0) */
  maxLive: number;
  endLive: number;
  peak: number;
  rmsDb: number;
  nan: boolean;
  clicks: number;
  /** 离线渲染耗时(毫秒)：与音频时长之比粗略反映 DSP 开销(含分段暂停的额外开销，是偏保守的上界) */
  renderMs: number;
  env: number[];
  issues: string[];
}

/**
 * 模拟团战：战斗配乐强度拉满，同时每秒 perSec 个随机音效事件(随机声像与增益)，
 * 检查压限后的输出不削波、无 NaN，并看限流/发声上限的统计。
 */
export async function checkStress(seconds = 8, perSec = 60): Promise<StressRow> {
  const ctx = new OfflineAudioContext(2, Math.ceil((seconds + 2.5) * SR), SR);
  let now = 0;
  const mixer = new Mixer(ctx, { clock: () => now });
  const music = new MusicEngine(mixer);
  music.setMood(1, 0.6);
  music.setTrack('battle');
  const pool = SFX_KEYS.filter((k) => {
    const c = SFX[k].cat;
    return c === '英雄普攻' || c === '小兵与野怪' || c === '防御塔' || c === '通用命中' || c === '技能施放' || c === '技能特效' || c === '技能弹道';
  });
  let s = 12345;
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  let events = 0;
  const dt = 1 / 30;
  let acc = 0;
  let maxNodes = 0;
  const t0 = performance.now();
  const buf = await renderChunked(ctx, seconds + 2.5, dt, (t) => {
    now = t;
    mixer.sweep();
    music.tick(dt + 0.1);
    if (mixer.voiceCount + mixer.noteCount > maxNodes) maxNodes = mixer.voiceCount + mixer.noteCount;
    if (t >= seconds) return;
    acc += perSec * dt;
    while (acc >= 1) {
      acc -= 1;
      events++;
      const key = pool[Math.floor(rnd() * pool.length)];
      mixer.play(key, { gain: 0.4 + rnd() * 0.6, pan: rnd() * 1.6 - 0.8, lp: rnd() < 0.3 ? 4000 : 0 });
    }
    // 偶尔来一个播报 / 金币
    if (rnd() < 0.008) mixer.play('ann_triple_kill', { v: rnd() < 0.5 ? 1 : 0 });
    if (rnd() < 0.04) mixer.play('coin');
  });
  const renderMs = performance.now() - t0;
  const st = { ...mixer.stats };
  const a = analyze(buf, 200);
  const issues: string[] = [];
  if (a.nan) issues.push('含 NaN');
  if (a.peak > 1.0) issues.push('削波');
  if (a.clicks > 0) issues.push(`疑似爆音×${a.clicks}`);
  if (mixer.voiceCount > 0) issues.push(`结束时仍有 ${mixer.voiceCount} 个发声未回收`);
  return { seconds, events, played: st.played, throttled: st.throttled, capped: st.capped, stolen: st.stolen, peakVoices: st.peakVoices, maxLive: maxNodes, endLive: mixer.voiceCount, peak: a.peak, rmsDb: a.rmsDb, nan: a.nan, clicks: a.clicks, renderMs, env: a.env, issues };
}

export interface LimiterRow {
  /** 输入幅度 → 稳态输出幅度 / 瞬态峰值 */
  points: { input: number; steady: number; transient: number }[];
  /** 小信号净增益(应接近 1) */
  smallGain: number;
  maxOut: number;
}

/** 测总线的静态传输特性：不同幅度的正弦脉冲串过完整的压限 + 软削波链 */
export async function checkLimiter(): Promise<LimiterRow> {
  const levels = [0.02, 0.1, 0.25, 0.5, 1, 2, 4];
  const seg = 0.7;
  const ctx = new OfflineAudioContext(2, Math.ceil(levels.length * seg * SR), SR);
  const mixer = new Mixer(ctx, { clock: () => 0 });
  levels.forEach((lv, i) => {
    const o = ctx.createOscillator();
    o.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(lv, i * seg + 0.02);
    g.gain.setValueAtTime(0, i * seg + 0.5);
    o.connect(g);
    g.connect(mixer.musicIn);
    o.start(0);
  });
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  const points = levels.map((input, i) => {
    let steady = 0;
    let transient = 0;
    const a = Math.floor((i * seg + 0.02) * SR);
    const b = Math.floor((i * seg + 0.5) * SR);
    for (let k = a; k < b; k++) {
      const x = Math.abs(d[k]);
      if (x > transient) transient = x;
      if (k > b - SR * 0.15 && x > steady) steady = x;
    }
    return { input, steady, transient };
  });
  return { points, smallGain: points[0].steady / levels[0], maxOut: Math.max(...points.map((p) => p.transient)) };
}

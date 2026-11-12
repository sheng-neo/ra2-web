/**
 * 小型合成库：振荡器 / 噪声 / 滤波 / 包络 / FM / 波形整形 / 音高滑动 / 多层叠加。
 * 全部只依赖 BaseAudioContext，实时播放与离线渲染(自检)共用同一套配方。
 */

export type Ctx = BaseAudioContext;
export type NoiseKind = 'white' | 'pink' | 'brown';
/**
 * 自定义周期波：比原生锯齿/方波更柔和，适合做乐器。
 * string = 靠近码子拨弦的明亮弦音(琵琶)；zhu = 竹尺击弦的偏冷弦音(筑：偶次泛音偏弱，听起来更空)
 */
export type WaveName = 'softsaw' | 'softsq' | 'glass' | 'reed' | 'string' | 'zhu';
export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle' | WaveName;

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** 滤波器/振荡器频率的安全范围(高 Q 滤波器贴近奈奎斯特会发散) */
const clampF = (f: number): number => (f < 16 ? 16 : f > 19000 ? 19000 : f);

const NOISE_RMS = 0.5;
const F_LO = 20;
const F_HI = 20000;
/** 褐噪(漏积分器)的转折频率：以下平坦，以上按 1/f² 衰减 */
const BROWN_CORNER = 140;

/** 某种噪声在 [f1, f2] 频带内的功率占比 */
function bandShare(kind: NoiseKind, f1: number, f2: number): number {
  const a = Math.max(F_LO, Math.min(F_HI, f1));
  const b = Math.max(a * 1.01, Math.min(F_HI, f2));
  if (kind === 'white') return (b - a) / (F_HI - F_LO);
  if (kind === 'pink') return Math.log(b / a) / Math.log(F_HI / F_LO);
  return (Math.atan(b / BROWN_CORNER) - Math.atan(a / BROWN_CORNER)) / (Math.atan(F_HI / BROWN_CORNER) - Math.atan(F_LO / BROWN_CORNER));
}

/**
 * 滤波后的噪声会损失大部分能量(窄带通只剩百分之几)，同样的增益听起来比振荡器小得多。
 * 这里按滤波器通带估算损失并补回来，使配方里噪声层与音调层的 g 大致对应同等的 RMS。
 * 补偿封顶 ×8，避免极窄带噪声被放大成刺耳的啸叫。
 */
function noiseComp(kind: NoiseKind, type: BiquadFilterType | undefined, fc: number, q: number): number {
  let share = 1;
  if (type === 'lowpass') share = bandShare(kind, F_LO, fc * 1.1);
  else if (type === 'highpass') share = bandShare(kind, fc / 1.1, F_HI);
  else if (type === 'bandpass') {
    const k = Math.sqrt(1 + 1 / (4 * q * q));
    const h = 1 / (2 * q);
    // 二阶带通的等效噪声带宽约为 -3dB 带宽的 π/2 倍
    share = bandShare(kind, fc * (k - h), fc * (k + h)) * 1.57;
  }
  return Math.min(8, 1 / Math.sqrt(Math.max(0.0156, Math.min(1, share))));
}

export interface Env {
  /** 相对音效起点的偏移(秒) */
  t?: number;
  /** 起音 / 保持 / 衰减(秒) */
  a?: number;
  h?: number;
  d: number;
  /** 峰值增益 */
  g?: number;
  /** 线性衰减(默认指数) */
  lin?: boolean;
  /** 输出到哪个节点(默认本音效的总输出) */
  to?: AudioNode;
}

export interface OscSpec extends Env {
  w?: Wave;
  f: number;
  /** 滑音终点与滑音时长(默认滑满整个音) */
  f1?: number;
  ft?: number;
  /** 失谐(音分) */
  det?: number;
  /** 颤音：深度(音分) / 频率(Hz) / 延迟(秒) */
  vib?: number;
  vr?: number;
  vd?: number;
}

export interface NoiseSpec extends Env {
  k?: NoiseKind;
  /** 可选滤波：类型 / 截止 / 截止终点 / 扫频时长 / Q */
  flt?: BiquadFilterType;
  fc?: number;
  fc1?: number;
  fct?: number;
  q?: number;
  /** 播放速率(改变噪声颗粒粗细) */
  rate?: number;
}

export interface FmSpec extends OscSpec {
  /** 调制器频率 = 载波 × ratio */
  ratio: number;
  /** 调制指数及其衰减终点/时长 */
  idx: number;
  idx1?: number;
  idt?: number;
}

/**
 * 每个 AudioContext 一份的共享资源：噪声缓冲、整形曲线、周期波、混响冲激响应。
 * 这些生成一次后缓存复用，避免每次发声重新分配。
 */
export class Kit {
  readonly ctx: Ctx;
  readonly canPan: boolean;
  private noises = new Map<NoiseKind, AudioBuffer>();
  private curves = new Map<number, Float32Array<ArrayBuffer>>();
  private waves = new Map<WaveName, PeriodicWave>();
  private seed: number;

  constructor(ctx: Ctx, seed = 0x51f15e) {
    this.ctx = ctx;
    this.seed = seed >>> 0;
    this.canPan = typeof ctx.createStereoPanner === 'function';
  }

  /** mulberry32。不用 Math.random：离线自检需要每次渲染结果可复现 */
  rnd(): number {
    this.seed = (this.seed + 0x6d2b79f5) >>> 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  reseed(seed: number): void {
    this.seed = seed >>> 0;
  }

  noise(kind: NoiseKind): AudioBuffer {
    let buf = this.noises.get(kind);
    if (buf) return buf;
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * 2.5);
    buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    let s = kind === 'white' ? 0x1234567 : kind === 'pink' ? 0x2468ace : 0x13579bd;
    const white = (): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2147483648 - 1;
    };
    if (kind === 'white') {
      for (let i = 0; i < n; i++) d[i] = white();
    } else if (kind === 'pink') {
      // Paul Kellet 的粉噪近似
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = white();
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.16;
        b6 = w * 0.115926;
      }
    } else {
      // 漏积分器得到 1/f² 斜率，再过一个 ~28Hz 的隔直高通，避免低通后残留直流漂移
      let last = 0;
      let hp = 0;
      let prev = 0;
      for (let i = 0; i < n; i++) {
        last = (last + 0.02 * white()) / 1.02;
        hp = 0.996 * (hp + last - prev);
        prev = last;
        d[i] = hp;
      }
    }
    // 首尾各 20ms 交叉淡化，循环播放时接缝处不产生咔哒声
    const xf = Math.floor(sr * 0.02);
    for (let i = 0; i < xf; i++) {
      const k = i / xf;
      d[i] = d[i] * k + d[n - xf + i] * (1 - k);
    }
    // 三种噪声统一到 RMS 0.5：配方里的增益才有可比性
    let e = 0;
    for (let i = 0; i < n; i++) e += d[i] * d[i];
    const norm = NOISE_RMS / Math.sqrt(e / n);
    for (let i = 0; i < n; i++) d[i] *= norm;
    this.noises.set(kind, buf);
    return buf;
  }

  /** tanh 软削波曲线，drive 越大失真越重 */
  curve(drive: number): Float32Array<ArrayBuffer> {
    const key = Math.round(drive * 10);
    let c = this.curves.get(key);
    if (c) return c;
    const n = 1024;
    c = new Float32Array(n);
    const k = Math.max(0.1, key / 10);
    const norm = Math.tanh(k);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(k * x) / norm;
    }
    this.curves.set(key, c);
    return c;
  }

  wave(name: WaveName): PeriodicWave {
    let w = this.waves.get(name);
    if (w) return w;
    const N = 40;
    const re = new Float32Array(N + 1);
    const im = new Float32Array(N + 1);
    const glass = [0, 1, 0.3, 0.09, 0.04, 0.015];
    const reed = [0, 1, 0.12, 0.55, 0.08, 0.3, 0.05, 0.14, 0.03, 0.06];
    for (let n = 1; n <= N; n++) {
      if (name === 'softsaw') im[n] = (n % 2 ? 1 : -1) / Math.pow(n, 1.45);
      else if (name === 'softsq') im[n] = n % 2 ? 1 / Math.pow(n, 1.35) : 0;
      else if (name === 'glass') im[n] = glass[n] ?? 0;
      else if (name === 'reed') im[n] = reed[n] ?? 0;
      // 拨弦点在弦长 13% 处：第 n 次泛音的强度 ∝ sin(nπβ)/n^k，拨弦点的整数倍泛音自然缺失
      else if (name === 'string') im[n] = Math.sin(n * Math.PI * 0.13) / Math.pow(n, 1.1);
      else im[n] = (Math.sin(n * Math.PI * 0.29) / Math.pow(n, 0.85)) * (n % 2 ? 1 : 0.5);
    }
    w = this.ctx.createPeriodicWave(re, im);
    this.waves.set(name, w);
    return w;
  }

  /**
   * 程序生成的混响冲激响应：指数衰减的噪声 + 几个早期反射，高频随时间衰减得更快(像石质大厅)。
   * 每声道能量归一化到 1，这样送入量直接等于干湿比，不依赖 ConvolverNode 的自动归一化。
   */
  impulse(seconds: number, rt60: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let s = ch === 0 ? 0x9e3779b : 0x7f4a7c1;
      const white = (): number => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2147483648 - 1;
      };
      let lp = 0;
      const pre = Math.floor(sr * 0.012);
      for (let i = pre; i < n; i++) {
        const t = i / sr;
        const coef = 0.55 - 0.42 * Math.min(1, t / (seconds * 0.7));
        lp += (white() - lp) * coef;
        const fadeIn = Math.min(1, (i - pre) / (sr * 0.02));
        d[i] = lp * Math.exp((-6.91 * t) / rt60) * fadeIn;
      }
      const taps = ch === 0 ? [0.011, 0.019, 0.027, 0.041, 0.057] : [0.013, 0.021, 0.031, 0.037, 0.061];
      taps.forEach((tt, k) => {
        d[Math.floor(tt * sr)] += (k % 2 ? -0.5 : 0.6) / (1 + k * 0.5);
      });
      let e = 0;
      for (let i = 0; i < n; i++) e += d[i] * d[i];
      const norm = 1 / Math.sqrt(e || 1);
      for (let i = 0; i < n; i++) d[i] *= norm;
    }
    return buf;
  }
}

/**
 * 一次发声(一个音效 / 一个音符)的构建器。配方函数往里叠加若干层(瞬态 + 主体 + 尾音)，
 * 所有声源都排好了起止时间；`end` 记录最晚的结束时刻，混音器据此断开并回收节点。
 */
export class Patch {
  readonly ctx: Ctx;
  readonly kit: Kit;
  readonly out: AudioNode;
  readonly t0: number;
  end: number;
  /** 整体音高倍率(随机微调 / 体型缩放) */
  pm = 1;
  /** 持续类音效(区域铺底、引导)的目标时长 */
  dur = 1;

  constructor(kit: Kit, out: AudioNode, t0: number) {
    this.kit = kit;
    this.ctx = kit.ctx;
    this.out = out;
    this.t0 = t0;
    this.end = t0;
  }

  rnd(): number {
    return this.kit.rnd();
  }

  /** [a, b) 内均匀随机 */
  rr(a: number, b: number): number {
    return a + (b - a) * this.kit.rnd();
  }

  /** AHD 包络，返回结束时刻 */
  private env(p: AudioParam, o: Env, t: number): number {
    const g = o.g ?? 1;
    const a = Math.max(0.001, o.a ?? 0.002);
    const h = o.h !== undefined && o.h > 0 ? o.h : 0;
    const d = Math.max(0.004, o.d);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(g, t + a);
    const td = t + a + h;
    if (h > 0) p.setValueAtTime(g, td);
    if (o.lin) {
      p.linearRampToValueAtTime(0, td + d);
      return td + d;
    }
    // 指数衰减到 -43dB 后用 8ms 线性收尾到真正的 0，避免截断产生咔哒声
    p.setTargetAtTime(0, td, d / 5);
    p.setValueAtTime(g * 0.00674, td + d);
    p.linearRampToValueAtTime(0, td + d + 0.008);
    return td + d + 0.008;
  }

  private setWave(n: OscillatorNode, w: Wave | undefined): void {
    if (!w || w === 'sine') return;
    if (w === 'square' || w === 'sawtooth' || w === 'triangle') n.type = w;
    else n.setPeriodicWave(this.kit.wave(w));
  }

  private total(o: Env): number {
    return Math.max(0.001, o.a ?? 0.002) + (o.h ?? 0) + o.d;
  }

  osc(o: OscSpec): OscillatorNode {
    const c = this.ctx;
    const t = this.t0 + (o.t ?? 0);
    const n = c.createOscillator();
    this.setWave(n, o.w);
    n.frequency.setValueAtTime(clampF(o.f * this.pm), t);
    if (o.f1 !== undefined) n.frequency.exponentialRampToValueAtTime(clampF(o.f1 * this.pm), t + (o.ft ?? this.total(o)));
    if (o.det) n.detune.setValueAtTime(o.det, t);
    const g = c.createGain();
    const end = this.env(g.gain, o, t) + 0.005;
    if (o.vib) {
      const l = c.createOscillator();
      l.frequency.value = o.vr ?? 5.5;
      const lg = c.createGain();
      lg.gain.setValueAtTime(0, t + (o.vd ?? 0.12));
      lg.gain.linearRampToValueAtTime(o.vib, t + (o.vd ?? 0.12) + 0.15);
      l.connect(lg);
      lg.connect(n.detune);
      l.start(t);
      l.stop(end);
    }
    n.connect(g);
    g.connect(o.to ?? this.out);
    n.start(t);
    n.stop(end);
    if (end > this.end) this.end = end;
    return n;
  }

  /** 双算子 FM：金属/钟琴/能量类音色 */
  fm(o: FmSpec): OscillatorNode {
    const c = this.ctx;
    const t = this.t0 + (o.t ?? 0);
    const car = this.osc(o);
    const total = this.total(o);
    const f = clampF(o.f * this.pm);
    const mod = c.createOscillator();
    mod.frequency.setValueAtTime(clampF(f * o.ratio), t);
    if (o.f1 !== undefined) mod.frequency.exponentialRampToValueAtTime(clampF(o.f1 * this.pm * o.ratio), t + (o.ft ?? total));
    const mg = c.createGain();
    const dev = f * o.ratio;
    mg.gain.setValueAtTime(Math.max(0.01, o.idx * dev), t);
    if (o.idx1 !== undefined) mg.gain.exponentialRampToValueAtTime(Math.max(0.01, o.idx1 * dev), t + (o.idt ?? total));
    mod.connect(mg);
    mg.connect(car.frequency);
    mod.start(t);
    mod.stop(t + total + 0.02);
    return car;
  }

  noise(o: NoiseSpec): AudioBufferSourceNode {
    const c = this.ctx;
    const t = this.t0 + (o.t ?? 0);
    const buf = this.kit.noise(o.k ?? 'white');
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    const g = c.createGain();
    const kind = o.k ?? 'white';
    const fc0 = o.fc ?? 1000;
    // 扫频时按起止频率的几何中点估算通带
    const fcMid = o.fc1 !== undefined ? Math.sqrt(fc0 * o.fc1) : fc0;
    const comp = noiseComp(kind, o.flt, fcMid, o.q ?? 0.8);
    const end = this.env(g.gain, { ...o, g: (o.g ?? 1) * comp }, t) + 0.005;
    if (o.flt) {
      const fl = c.createBiquadFilter();
      fl.type = o.flt;
      fl.Q.value = o.q ?? 0.8;
      fl.frequency.setValueAtTime(clampF(fc0 * this.pm), t);
      if (o.fc1 !== undefined) fl.frequency.exponentialRampToValueAtTime(clampF(o.fc1 * this.pm), t + (o.fct ?? this.total(o)));
      src.connect(fl);
      fl.connect(g);
    } else {
      src.connect(g);
    }
    g.connect(o.to ?? this.out);
    src.start(t, this.kit.rnd() * (buf.duration - 0.3));
    src.stop(end);
    if (end > this.end) this.end = end;
    return src;
  }

  /** 一组不成谐波关系的衰减正弦：金属/晶体/钱币的「铃振」 */
  ring(f: number, ratios: readonly number[], o: Env): void {
    const g = o.g ?? 1;
    for (let i = 0; i < ratios.length; i++) {
      this.osc({ ...o, f: f * ratios[i], d: o.d / (1 + i * 0.45), g: g / (1 + i * 0.7) });
    }
  }

  /** 在 [t, t+span) 内随机散布 n 个子事件(碎屑、火星、箭矢…) */
  scatter(n: number, t: number, span: number, fn: (at: number, i: number) => void): void {
    for (let i = 0; i < n; i++) fn(t + this.kit.rnd() * span, i);
  }

  filt(type: BiquadFilterType, f: number, q = 0.8, to?: AudioNode): BiquadFilterNode {
    const n = this.ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = clampF(f * this.pm);
    n.Q.value = q;
    n.connect(to ?? this.out);
    return n;
  }

  gain(g: number, to?: AudioNode): GainNode {
    const n = this.ctx.createGain();
    n.gain.value = g;
    n.connect(to ?? this.out);
    return n;
  }

  /** 软失真(给爆炸/咆哮加粗) */
  drive(amount: number, to?: AudioNode): WaveShaperNode {
    const n = this.ctx.createWaveShaper();
    n.curve = this.kit.curve(amount);
    n.connect(to ?? this.out);
    return n;
  }

  /** 音效内部的声像(非空间化音效做左右展开)；不支持 StereoPanner 时退化为直通 */
  pan(x: number, to?: AudioNode): AudioNode {
    if (!this.kit.canPan) return this.gain(1, to);
    const n = this.ctx.createStereoPanner();
    n.pan.value = x;
    n.connect(to ?? this.out);
    return n;
  }

  /** 参数折线自动化：pts = [相对起点的时刻, 值]，第一个点为初值 */
  ramp(param: AudioParam, pts: readonly (readonly [number, number])[], exp = true): void {
    for (let i = 0; i < pts.length; i++) {
      const t = this.t0 + pts[i][0];
      const v = pts[i][1];
      if (i === 0) param.setValueAtTime(v, t);
      else if (exp && v > 0 && pts[i - 1][1] > 0) param.exponentialRampToValueAtTime(v, t);
      else param.linearRampToValueAtTime(v, t);
    }
  }

  /** 低频振荡器调制任意参数(颤动/旋转感)。rate1 给出时频率线性滑动 */
  lfo(param: AudioParam, rate: number, depth: number, t: number, d: number, rate1?: number): void {
    const c = this.ctx;
    const at = this.t0 + t;
    const l = c.createOscillator();
    l.frequency.setValueAtTime(rate, at);
    if (rate1 !== undefined) l.frequency.linearRampToValueAtTime(rate1, at + d);
    const g = c.createGain();
    g.gain.value = depth;
    l.connect(g);
    g.connect(param);
    l.start(at);
    l.stop(at + d + 0.05);
  }

  /** 反馈延迟(回声)。返回输入节点；fb < 1 */
  echo(time: number, fb: number, wet: number, tail: number, to?: AudioNode): GainNode {
    const c = this.ctx;
    const input = c.createGain();
    const dl = c.createDelay(Math.max(0.05, time * 1.5));
    dl.delayTime.value = time;
    const f = c.createGain();
    f.gain.value = fb;
    const w = c.createGain();
    w.gain.value = wet;
    input.connect(to ?? this.out);
    input.connect(dl);
    dl.connect(f);
    f.connect(dl);
    dl.connect(w);
    w.connect(to ?? this.out);
    // 回声尾巴需要节点多活一会儿
    if (tail > this.tail) this.tail = tail;
    return input;
  }

  /**
   * 以 g 倍增益执行一段子配方：同一个键的各变体(不同野怪、敌我版本)共用一个配平值，
   * 这里把它们的响度对齐到同一水平。子配方里的层都接到这个增益节点上。
   */
  sub(g: number, fn: (q: Patch) => void): void {
    const q = new Patch(this.kit, this.gain(g), this.t0);
    q.pm = this.pm;
    q.dur = this.dur;
    fn(q);
    q.finish();
    if (q.end > this.end) this.end = q.end;
  }

  private tail = 0;

  /** 配方执行完后调用：把回声尾巴计入回收时刻 */
  finish(): void {
    this.end += this.tail;
    this.tail = 0;
  }
}

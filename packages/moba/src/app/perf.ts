/**
 * 帧耗时的滑动统计(调试钩子 window.__moba.perf 与后续性能评审用)。纯逻辑，无 DOM 依赖。
 */

/** 固定容量的环形样本窗：均值 O(1)，分位数按需排序(只在读统计时发生，不在热路径上) */
export class RollingStat {
  private readonly buf: Float64Array;
  private n = 0;
  private head = 0;
  private sum = 0;
  /** 最近一次样本 */
  last = 0;
  /** 自创建/重置以来的最大值(不随窗口滑出) */
  peak = 0;

  constructor(size = 240) {
    this.buf = new Float64Array(Math.max(1, Math.floor(size)));
  }

  push(v: number): void {
    const buf = this.buf;
    if (this.n === buf.length) this.sum -= buf[this.head];
    else this.n++;
    buf[this.head] = v;
    this.sum += v;
    this.head = (this.head + 1) % buf.length;
    this.last = v;
    if (v > this.peak) this.peak = v;
  }

  get count(): number {
    return this.n;
  }

  get avg(): number {
    return this.n > 0 ? this.sum / this.n : 0;
  }

  /** 窗口内最大值 */
  get max(): number {
    let m = 0;
    for (let i = 0; i < this.n; i++) if (this.buf[i] > m) m = this.buf[i];
    return m;
  }

  /** 窗口内分位数，p ∈ [0,1] */
  percentile(p: number): number {
    if (this.n === 0) return 0;
    const sorted = Array.from(this.buf.subarray(0, this.n)).sort((a, b) => a - b);
    const idx = Math.min(this.n - 1, Math.max(0, Math.ceil(p * this.n) - 1));
    return sorted[idx];
  }

  reset(): void {
    this.n = 0;
    this.head = 0;
    this.sum = 0;
    this.last = 0;
    this.peak = 0;
  }
}

export type PerfChannel = 'sim' | 'render' | 'hud' | 'audio' | 'work' | 'interval';

export interface PerfSummary {
  avg: number;
  p95: number;
  max: number;
  peak: number;
  last: number;
}

export interface PerfSnapshot {
  /** 由帧间隔均值换算的帧率 */
  fps: number;
  frames: number;
  /** 每帧平均模拟步数 */
  stepsPerFrame: number;
  /** 各阶段每帧耗时(毫秒)：sim 模拟、render 渲染(含事件特效)、hud 界面、audio 音频、work 整帧脚本、interval 帧间隔 */
  sim: PerfSummary;
  render: PerfSummary;
  hud: PerfSummary;
  audio: PerfSummary;
  work: PerfSummary;
  interval: PerfSummary;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

export class PerfMeter {
  readonly sim: RollingStat;
  readonly render: RollingStat;
  readonly hud: RollingStat;
  readonly audio: RollingStat;
  readonly work: RollingStat;
  readonly interval: RollingStat;
  readonly steps: RollingStat;
  frames = 0;

  constructor(window = 240) {
    this.sim = new RollingStat(window);
    this.render = new RollingStat(window);
    this.hud = new RollingStat(window);
    this.audio = new RollingStat(window);
    this.work = new RollingStat(window);
    this.interval = new RollingStat(window);
    this.steps = new RollingStat(window);
  }

  /** 记一帧。各项单位毫秒；intervalMs ≤ 0(首帧、挂起恢复)不计入帧率 */
  frame(simMs: number, renderMs: number, hudMs: number, audioMs: number, workMs: number, intervalMs: number, steps: number): void {
    this.frames++;
    this.sim.push(simMs);
    this.render.push(renderMs);
    this.hud.push(hudMs);
    this.audio.push(audioMs);
    this.work.push(workMs);
    this.steps.push(steps);
    if (intervalMs > 0) this.interval.push(intervalMs);
  }

  /** 最近窗口内的平均帧率 */
  get fps(): number {
    const avg = this.interval.avg;
    return avg > 0 ? 1000 / avg : 0;
  }

  private static summarize(s: RollingStat): PerfSummary {
    return { avg: round(s.avg), p95: round(s.percentile(0.95)), max: round(s.max), peak: round(s.peak), last: round(s.last) };
  }

  snapshot(): PerfSnapshot {
    return {
      fps: round(this.fps),
      frames: this.frames,
      stepsPerFrame: round(this.steps.avg),
      sim: PerfMeter.summarize(this.sim),
      render: PerfMeter.summarize(this.render),
      hud: PerfMeter.summarize(this.hud),
      audio: PerfMeter.summarize(this.audio),
      work: PerfMeter.summarize(this.work),
      interval: PerfMeter.summarize(this.interval),
    };
  }

  reset(): void {
    this.frames = 0;
    for (const s of [this.sim, this.render, this.hud, this.audio, this.work, this.interval, this.steps]) s.reset();
  }
}

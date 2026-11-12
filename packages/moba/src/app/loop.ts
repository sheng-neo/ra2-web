/**
 * 对局主循环：固定步长累加器 + 帧调度。
 *
 * 纯逻辑——时间源与帧调度器都由外部注入(浏览器里是 performance.now / requestAnimationFrame)，
 * 不碰 DOM、不认识模拟/渲染/界面的具体类型，Node 下可以直接单测。
 *
 * 一帧的顺序：
 *   1. 量出距上一帧的真实时间 dt(上限 maxFrameDt；间隔超过 gapResetSec 视为「页面被挂起过」，整段丢弃)
 *      ——切后台的正路是宿主在 visibilitychange 时调 resetClock()；gapResetSec 只是没收到该事件时的兜底，
 *      阈值不能太小，否则帧率极低的设备(软件渲染、高负载)会被误判成一直在挂起、世界寸步不前
 *   2. 未暂停：累加器 += dt × speed，按固定步长执行 0..N 次 step()，每次之后 drain() 一次事件并入本帧批次
 *      (步数超过上限或模拟耗时超过预算 → 丢掉积压的时间，宁可慢放也不进入「越追越慢」的死亡螺旋)
 *   3. 本帧批次非空 → events(batch, steps, tailStart) 一次
 *   4. frame({ alpha, dt, … })：alpha = 累加器余量 / 步长，供渲染插值
 */

export interface StepperOptions {
  /** 固定步长(秒) */
  stepDt: number;
  /** 单帧真实时间上限(秒)，缺省 0.25 */
  maxFrameDt?: number;
  /** 1 倍速下单帧最多执行的步数，缺省 6 */
  maxSteps?: number;
}

/** 固定步长累加器 */
export class FixedStepper {
  readonly stepDt: number;
  readonly maxFrameDt: number;
  readonly maxSteps: number;
  private acc = 0;
  /** 因步数封顶而丢弃的模拟时间累计(秒)：大于 0 说明设备跑不动实时速度 */
  droppedTime = 0;

  constructor(opts: StepperOptions) {
    if (!(opts.stepDt > 0)) throw new Error('stepDt 必须为正数');
    this.stepDt = opts.stepDt;
    this.maxFrameDt = opts.maxFrameDt ?? 0.25;
    this.maxSteps = Math.max(1, Math.floor(opts.maxSteps ?? 6));
  }

  /** 累加一帧的真实时间，返回这一帧应执行的步数 */
  advance(dtReal: number, speed = 1): number {
    if (!(dtReal > 0) || !(speed > 0)) return 0;
    this.acc += Math.min(dtReal, this.maxFrameDt) * speed;
    // 加一个极小量，避免 3×(1/30) 这类累加因浮点误差少算一步
    let steps = Math.floor(this.acc / this.stepDt + 1e-9);
    const cap = this.maxSteps * Math.max(1, Math.ceil(speed));
    if (steps > cap) {
      this.droppedTime += (steps - cap) * this.stepDt;
      steps = cap;
      this.acc = 0;
    } else {
      this.acc = Math.max(0, this.acc - steps * this.stepDt);
    }
    return steps;
  }

  /** 渲染插值系数：累加器余量 / 步长，恒在 [0, 1) */
  get alpha(): number {
    const a = this.acc / this.stepDt;
    return a < 0 ? 0 : a > 0.999999 ? 0.999999 : a;
  }

  /** 丢弃余量(切后台、暂停恢复、模拟预算超支时) */
  reset(): void {
    this.acc = 0;
  }
}

export interface LoopFrame {
  /** 插值系数 [0,1) */
  alpha: number;
  /** 距上一帧的真实秒数(已封顶；挂起恢复后的第一帧为 0) */
  dt: number;
  /** 本帧执行的模拟步数 */
  steps: number;
  paused: boolean;
  /** 本帧模拟(step + drain)耗时，毫秒 */
  simMs: number;
  /** 本帧开始的时间戳(毫秒，来自注入的时间源) */
  now: number;
}

export interface LoopHooks<E> {
  /** 推进一个固定 tick */
  step(): void;
  /** 取走上一个 tick 产生的事件 */
  drain(): E[];
  /**
   * 本帧累计的全部事件(只在非空时调用，一帧一次)。
   * steps = 本帧执行的步数；tailStart = 最后一步产生的事件在 batch 里的起始下标(最后一步没有事件时等于 batch.length)。
   * 加速调试时一帧会攒下几百步的事件，宿主可以据此只把「最新一步」的一次性表现事件交给渲染 / 音频。
   */
  events(batch: E[], steps: number, tailStart: number): void;
  /** 每帧一次：渲染、界面刷新等 */
  frame(f: LoopFrame): void;
  /** 任一钩子抛错：循环已自行停止，由宿主决定如何提示。不提供则原样抛出 */
  error?(err: unknown): void;
}

export interface LoopEnv {
  /** 毫秒时间戳 */
  now(): number;
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
}

export interface LoopOptions extends StepperOptions {
  /** 时间倍率(调试用，加速跑完整局)，缺省 1 */
  speed?: number;
  /** 两帧间隔超过该秒数视为页面被挂起过：清空累加器并丢弃这段时间，缺省 5；Infinity = 关闭 */
  gapResetSec?: number;
  /** 单帧模拟耗时预算(毫秒)，超出则停止追帧并丢弃余量，缺省 80 */
  simBudgetMs?: number;
}

export class GameLoop<E> {
  readonly stepper: FixedStepper;
  /** 时间倍率；>1 时单帧步数上限同步放大 */
  speed: number;
  /** 已画的帧数 / 已执行的模拟步数 */
  frames = 0;
  ticks = 0;
  /** 因挂起恢复而丢弃时间的次数(测试与诊断用) */
  gapResets = 0;

  private readonly hooks: LoopHooks<E>;
  private readonly env: LoopEnv;
  private readonly gapResetSec: number;
  private readonly simBudgetMs: number;
  private rafId = 0;
  private active = false;
  private isPaused = false;
  private last = -1;
  private readonly info: LoopFrame = { alpha: 0, dt: 0, steps: 0, paused: false, simMs: 0, now: 0 };
  private readonly onRaf = (): void => {
    this.rafId = 0;
    if (!this.active) return;
    // 先登记下一帧再干活：帧回调里调用 stop() 能取消它
    this.rafId = this.env.raf(this.onRaf);
    this.runFrame(this.env.now());
  };

  constructor(hooks: LoopHooks<E>, env: LoopEnv, opts: LoopOptions) {
    this.hooks = hooks;
    this.env = env;
    this.stepper = new FixedStepper(opts);
    this.speed = opts.speed ?? 1;
    this.gapResetSec = opts.gapResetSec ?? 5;
    this.simBudgetMs = opts.simBudgetMs ?? 80;
  }

  get running(): boolean {
    return this.active;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.resetClock();
    this.rafId = this.env.raf(this.onRaf);
  }

  stop(): void {
    this.active = false;
    if (this.rafId) this.env.caf(this.rafId);
    this.rafId = 0;
  }

  /** 暂停：不再步进模拟，frame 钩子照常每帧调用(继续渲染) */
  setPaused(paused: boolean): void {
    if (paused === this.isPaused) return;
    this.isPaused = paused;
    // 恢复时不补暂停期间的时间，也不带着暂停前的余量突进半步
    if (!paused) this.stepper.reset();
  }

  /** 页面切后台 / 恢复时调用：清空累加器，下一帧的 dt 记为 0 */
  resetClock(): void {
    this.stepper.reset();
    this.last = -1;
  }

  /** 执行一帧。正常由 raf 驱动；测试里可直接调用并传入时间戳(毫秒) */
  runFrame(now: number): void {
    const hooks = this.hooks;
    try {
      let dt = this.last < 0 ? 0 : (now - this.last) / 1000;
      this.last = now;
      if (dt < 0) dt = 0;
      if (dt > this.gapResetSec) {
        // 标签页被挂起过(后台不触发 raf)：这段时间不算数
        dt = 0;
        this.stepper.reset();
        this.gapResets++;
      }
      if (dt > this.stepper.maxFrameDt) dt = this.stepper.maxFrameDt;

      let steps = 0;
      let simMs = 0;
      let batch: E[] | null = null;
      let tailStart = 0;
      if (!this.isPaused) {
        const want = this.stepper.advance(dt, this.speed);
        if (want > 0) {
          const env = this.env;
          const t0 = env.now();
          let owned = false;
          for (; steps < want; ) {
            hooks.step();
            steps++;
            const ev = hooks.drain();
            tailStart = batch ? batch.length : 0;
            if (ev.length > 0) {
              if (!batch) batch = ev;
              else {
                // drain() 的返回值可能还被别处引用，合并前先拷一份自己的
                if (!owned) {
                  batch = batch.slice();
                  owned = true;
                }
                for (let i = 0; i < ev.length; i++) batch.push(ev[i]);
              }
            }
            // 每 4 步看一次表：超预算就不追了，余量作废(慢放好过卡死)
            if ((steps & 3) === 0 && steps < want && env.now() - t0 > this.simBudgetMs) {
              this.stepper.droppedTime += (want - steps) * this.stepper.stepDt;
              this.stepper.reset();
              break;
            }
          }
          simMs = env.now() - t0;
          this.ticks += steps;
        }
      }
      if (batch) hooks.events(batch, steps, tailStart);

      const f = this.info;
      f.alpha = this.stepper.alpha;
      f.dt = dt;
      f.steps = steps;
      f.paused = this.isPaused;
      f.simMs = simMs;
      f.now = now;
      this.frames++;
      hooks.frame(f);
    } catch (err) {
      this.stop();
      if (hooks.error) hooks.error(err);
      else throw err;
    }
  }
}

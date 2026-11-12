import { describe, expect, it } from 'vitest';
import { FixedStepper, GameLoop, type LoopEnv, type LoopFrame, type LoopHooks } from './loop';

const STEP = 1 / 30;

describe('FixedStepper', () => {
  it('按固定步长出步，余量换算成插值系数', () => {
    const s = new FixedStepper({ stepDt: STEP });
    expect(s.advance(0.016)).toBe(0);
    expect(s.alpha).toBeCloseTo(0.48, 5);
    expect(s.advance(0.02)).toBe(1);
    expect(s.alpha).toBeCloseTo(0.08, 5);
    expect(s.advance(STEP * 2)).toBe(2);
    expect(s.alpha).toBeCloseTo(0.08, 5);
  });

  it('长时间以 60Hz 推进：总步数与真实时间吻合，alpha 始终在 [0,1)', () => {
    const s = new FixedStepper({ stepDt: STEP });
    let steps = 0;
    for (let i = 0; i < 6000; i++) {
      steps += s.advance(1 / 60);
      expect(s.alpha).toBeGreaterThanOrEqual(0);
      expect(s.alpha).toBeLessThan(1);
    }
    // 100 秒 → 3000 步，浮点误差至多差一步
    expect(Math.abs(steps - 3000)).toBeLessThanOrEqual(1);
  });

  it('刚好一个步长时不会因浮点误差少算一步', () => {
    const s = new FixedStepper({ stepDt: STEP });
    let steps = 0;
    for (let i = 0; i < 300; i++) steps += s.advance(STEP);
    expect(steps).toBe(300);
  });

  it('单帧时间有上限', () => {
    const s = new FixedStepper({ stepDt: STEP, maxFrameDt: 0.1, maxSteps: 10 });
    expect(s.advance(5)).toBe(3);
  });

  it('步数封顶后丢弃积压，不会越追越多(死亡螺旋)', () => {
    const s = new FixedStepper({ stepDt: STEP, maxFrameDt: 0.25, maxSteps: 4 });
    // 每帧 0.25 秒本该 7.5 步
    for (let i = 0; i < 20; i++) {
      expect(s.advance(0.25)).toBe(4);
      expect(s.alpha).toBe(0);
    }
    expect(s.droppedTime).toBeGreaterThan(0);
    // 帧时间恢复正常后立刻回到正常节奏，没有欠账要补
    expect(s.advance(STEP)).toBe(1);
  });

  it('倍率放大时间流速，步数上限同步放大', () => {
    const s = new FixedStepper({ stepDt: STEP, maxSteps: 4 });
    expect(s.advance(STEP, 8)).toBe(8);
    expect(s.advance(0.25, 8)).toBe(32);
  });

  it('非法输入不出步', () => {
    const s = new FixedStepper({ stepDt: STEP });
    expect(s.advance(-1)).toBe(0);
    expect(s.advance(Number.NaN)).toBe(0);
    expect(s.advance(0.1, 0)).toBe(0);
    expect(s.alpha).toBe(0);
    expect(() => new FixedStepper({ stepDt: 0 })).toThrow();
  });

  it('reset 清空余量', () => {
    const s = new FixedStepper({ stepDt: STEP });
    s.advance(0.02);
    expect(s.alpha).toBeGreaterThan(0);
    s.reset();
    expect(s.alpha).toBe(0);
  });
});

/** 假环境：手动拨表、手动触发 raf */
function makeEnv(): { env: LoopEnv; clock: { t: number }; pending: () => number; flush: () => void } {
  const clock = { t: 0 };
  let nextId = 1;
  const queue = new Map<number, (t: number) => void>();
  const env: LoopEnv = {
    now: () => clock.t,
    raf(cb) {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    },
    caf(id) {
      queue.delete(id);
    },
  };
  return {
    env,
    clock,
    pending: () => queue.size,
    flush() {
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) cb(clock.t);
    },
  };
}

interface Rig {
  loop: GameLoop<string>;
  log: string[];
  frames: LoopFrame[];
  hooks: LoopHooks<string>;
  /** 拨表 ms 后跑一帧 */
  tick(ms: number): void;
  world: { tick: number; pending: string[] };
  tails: { steps: number; tailStart: number; size: number }[];
  clock: { t: number };
  pending: () => number;
  flush: () => void;
}

function makeRig(opts: { speed?: number; maxSteps?: number; simBudgetMs?: number; stepCost?: number; eventsPerStep?: number } = {}): Rig {
  const { env, clock, pending, flush } = makeEnv();
  const world = { tick: 0, pending: [] as string[] };
  const log: string[] = [];
  const frames: LoopFrame[] = [];
  const tails: { steps: number; tailStart: number; size: number }[] = [];
  const hooks: LoopHooks<string> = {
    step() {
      world.tick++;
      clock.t += opts.stepCost ?? 0;
      for (let i = 0; i < (opts.eventsPerStep ?? 1); i++) world.pending.push(`e${world.tick}.${i}`);
      log.push('step');
    },
    drain() {
      const out = world.pending;
      world.pending = [];
      log.push('drain');
      return out;
    },
    events(batch, steps, tailStart) {
      log.push(`events:${batch.join(',')}`);
      tails.push({ steps, tailStart, size: batch.length });
    },
    frame(f) {
      frames.push({ ...f });
      log.push('frame');
    },
  };
  const loop = new GameLoop<string>(hooks, env, { stepDt: STEP, maxSteps: opts.maxSteps, speed: opts.speed, simBudgetMs: opts.simBudgetMs });
  return {
    loop, log, frames, hooks, world, clock, pending, flush, tails,
    tick(ms) {
      clock.t += ms;
      loop.runFrame(clock.t);
    },
  };
}

describe('GameLoop', () => {
  it('第一帧 dt 为 0，不出步', () => {
    const r = makeRig();
    r.tick(1000);
    expect(r.frames).toHaveLength(1);
    expect(r.frames[0]).toMatchObject({ dt: 0, steps: 0, alpha: 0, paused: false });
    expect(r.world.tick).toBe(0);
  });

  it('每个 tick 取一次事件；本帧事件合成一批、先于 frame 交付', () => {
    const r = makeRig();
    r.tick(0);
    r.log.length = 0;
    r.tick(70); // 2 步，余 3.33ms
    expect(r.log).toEqual(['step', 'drain', 'step', 'drain', 'events:e1.0,e2.0', 'frame']);
    expect(r.frames[1].steps).toBe(2);
    expect(r.frames[1].alpha).toBeCloseTo(0.1, 3);
    expect(r.loop.ticks).toBe(2);
  });

  it('events 带上本帧步数与「最后一步」事件的起始下标', () => {
    const r = makeRig({ speed: 4, eventsPerStep: 3 });
    r.tick(0);
    r.tick(50); // 0.2 秒模拟时间 → 6 步，每步 3 个事件
    expect(r.tails).toEqual([{ steps: 6, tailStart: 15, size: 18 }]);
    // 单步的帧：整批都是最后一步的
    r.loop.speed = 1;
    r.tick(34);
    expect(r.tails[1]).toEqual({ steps: 1, tailStart: 0, size: 3 });
  });

  it('最后一步没有事件时 tailStart 等于批次长度', () => {
    const { env, clock } = makeEnv();
    const queue = [['a', 'b'], []];
    let seen: [number, number, number] | null = null;
    const loop = new GameLoop<string>({ step() {}, drain: () => queue.shift() ?? [], events: (b, n, t) => (seen = [b.length, n, t]), frame() {} }, env, { stepDt: STEP });
    loop.runFrame(0);
    clock.t = 70;
    loop.runFrame(70);
    expect(seen).toEqual([2, 2, 2]);
  });

  it('没有步进或没有事件的帧不调用 events', () => {
    const r = makeRig({ eventsPerStep: 0 });
    r.tick(0);
    r.tick(10);
    r.tick(40);
    expect(r.log.filter((l) => l.startsWith('events'))).toHaveLength(0);
    expect(r.world.tick).toBe(1);
  });

  it('合并多 tick 的事件时不改动 drain 返回的数组', () => {
    const { env, clock } = makeEnv();
    const first = ['a'];
    const second = ['b', 'c'];
    const queue = [first, second];
    let got: string[] = [];
    const loop = new GameLoop<string>(
      { step() {}, drain: () => queue.shift() ?? [], events: (b) => (got = b), frame() {} },
      env,
      { stepDt: STEP },
    );
    loop.runFrame(0);
    clock.t = 70;
    loop.runFrame(70);
    expect(got).toEqual(['a', 'b', 'c']);
    expect(first).toEqual(['a']);
    expect(second).toEqual(['b', 'c']);
  });

  it('暂停时不步进但继续出帧；恢复后不补时间', () => {
    const r = makeRig();
    r.tick(0);
    r.tick(50);
    expect(r.world.tick).toBe(1);
    r.loop.setPaused(true);
    for (let i = 0; i < 30; i++) r.tick(16);
    expect(r.world.tick).toBe(1);
    expect(r.frames).toHaveLength(32);
    expect(r.frames[31]).toMatchObject({ paused: true, steps: 0 });
    expect(r.frames[31].dt).toBeCloseTo(0.016);
    r.loop.setPaused(false);
    r.tick(16);
    // 恢复后的第一帧：只有这 16ms，不够一步；暂停前的余量也已作废
    expect(r.world.tick).toBe(1);
    expect(r.frames[32].alpha).toBeCloseTo(0.48, 3);
    r.tick(20);
    expect(r.world.tick).toBe(2);
  });

  it('卡顿一帧：dt 封顶、步数封顶', () => {
    const r = makeRig({ maxSteps: 5 });
    r.tick(0);
    r.tick(900);
    expect(r.frames[1].dt).toBe(0.25);
    expect(r.frames[1].steps).toBe(5);
    expect(r.frames[1].alpha).toBe(0);
  });

  it('长时间挂起(切后台)后回来：整段时间作废，不突跳', () => {
    const r = makeRig();
    r.tick(0);
    r.tick(33.4);
    expect(r.world.tick).toBe(1);
    r.tick(60_000);
    expect(r.frames[2]).toMatchObject({ dt: 0, steps: 0, alpha: 0 });
    expect(r.world.tick).toBe(1);
    expect(r.loop.gapResets).toBe(1);
    r.tick(33.4);
    expect(r.world.tick).toBe(2);
  });

  it('resetClock：下一帧 dt 记为 0 且余量清空', () => {
    const r = makeRig();
    r.tick(0);
    r.tick(20);
    expect(r.frames[1].alpha).toBeGreaterThan(0.5);
    r.loop.resetClock();
    r.tick(500);
    expect(r.frames[2]).toMatchObject({ dt: 0, steps: 0, alpha: 0 });
    expect(r.loop.gapResets).toBe(0);
  });

  it('帧率极低(每帧 2 秒)不会被误判成挂起：照常按上限推进', () => {
    const r = makeRig({ maxSteps: 6 });
    r.tick(0);
    for (let i = 0; i < 5; i++) r.tick(2000);
    expect(r.loop.gapResets).toBe(0);
    expect(r.world.tick).toBe(30);
    expect(r.frames[5]).toMatchObject({ dt: 0.25, steps: 6 });
  });

  it('gapResetSec 可以关闭', () => {
    const { env, clock } = makeEnv();
    let steps = 0;
    const loop = new GameLoop<string>({ step: () => void steps++, drain: () => [], events() {}, frame() {} }, env, { stepDt: STEP, gapResetSec: Infinity, speed: 4 });
    loop.runFrame(0);
    clock.t = 3_600_000;
    loop.runFrame(clock.t);
    expect(loop.gapResets).toBe(0);
    expect(steps).toBe(24);
  });

  it('倍率 > 1 时每帧多步', () => {
    const r = makeRig({ speed: 10 });
    r.tick(0);
    r.tick(100); // 1 秒模拟时间
    expect(r.frames[1].steps).toBe(30);
    r.loop.speed = 1;
    r.tick(100);
    expect(r.frames[2].steps).toBe(3);
  });

  it('模拟耗时超出预算就停止追帧并丢弃余量', () => {
    // 每步「耗时」30ms，预算 80ms：第 4 步后查表发现超支
    const r = makeRig({ speed: 10, stepCost: 30, simBudgetMs: 80 });
    r.tick(0);
    r.tick(100);
    expect(r.frames[1].steps).toBe(4);
    expect(r.frames[1].alpha).toBe(0);
    expect(r.frames[1].simMs).toBe(120);
    expect(r.loop.stepper.droppedTime).toBeCloseTo(26 * STEP, 6);
  });

  it('simMs 记录本帧模拟耗时', () => {
    const r = makeRig({ stepCost: 2 });
    r.tick(0);
    r.tick(70);
    expect(r.frames[1].steps).toBe(2);
    expect(r.frames[1].simMs).toBe(4);
  });

  it('start / stop：由 raf 驱动，停止后不再出帧，可重复启动', () => {
    const r = makeRig();
    expect(r.loop.running).toBe(false);
    r.loop.start();
    r.loop.start();
    expect(r.pending()).toBe(1);
    r.flush();
    expect(r.frames).toHaveLength(1);
    expect(r.pending()).toBe(1);
    r.clock.t += 40;
    r.flush();
    expect(r.frames).toHaveLength(2);
    expect(r.world.tick).toBe(1);
    r.loop.stop();
    expect(r.loop.running).toBe(false);
    expect(r.pending()).toBe(0);
    r.flush();
    expect(r.frames).toHaveLength(2);
    // 重新启动：时钟重置，第一帧 dt 为 0
    r.clock.t += 5000;
    r.loop.start();
    r.flush();
    expect(r.frames[2].dt).toBe(0);
    expect(r.loop.gapResets).toBe(0);
  });

  it('帧回调里调用 stop() 能取消已登记的下一帧', () => {
    const { env, clock, pending, flush } = makeEnv();
    let count = 0;
    const loop: GameLoop<string> = new GameLoop<string>(
      {
        step() {},
        drain: () => [],
        events() {},
        frame() {
          count++;
          loop.stop();
        },
      },
      env,
      { stepDt: STEP },
    );
    loop.start();
    flush();
    expect(count).toBe(1);
    expect(pending()).toBe(0);
    clock.t += 16;
    flush();
    expect(count).toBe(1);
  });

  it('钩子抛错：循环停止并把错误交给 error 钩子', () => {
    const { env, clock, pending, flush } = makeEnv();
    const errors: unknown[] = [];
    let frames = 0;
    const loop = new GameLoop<string>(
      {
        step() {
          throw new Error('boom');
        },
        drain: () => [],
        events() {},
        frame() {
          frames++;
        },
        error: (e) => errors.push(e),
      },
      env,
      { stepDt: STEP },
    );
    loop.start();
    flush();
    expect(frames).toBe(1);
    clock.t += 50;
    flush();
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('boom');
    expect(loop.running).toBe(false);
    expect(pending()).toBe(0);
  });

  it('没有 error 钩子时原样抛出', () => {
    const { env, clock } = makeEnv();
    const loop = new GameLoop<string>(
      {
        step() {},
        drain: () => [],
        events() {},
        frame() {
          throw new Error('render failed');
        },
      },
      env,
      { stepDt: STEP },
    );
    expect(() => loop.runFrame(clock.t)).toThrow('render failed');
    expect(loop.running).toBe(false);
  });
});

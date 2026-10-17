// ===== sim/core/advance.test.ts =====（WORKPLAN WP1 验收：预算切片 / 余量带帧 / 硬顶 / 挂起即停 / endOfDay 延后）
import { describe, expect, it } from 'vitest';
import { DISASTER_TICK_MS, MAX_DAYS_PER_FRAME, MS_PER_DAY } from '../../contracts/clock';
import { CityMode } from '../../contracts/grid';
import { createCityState } from '../../contracts/state';
import type { System } from '../../contracts/system';
import { createTestContext, nullSystem, runDays } from '../../testkit';
import { carryBack, planDays, planTicks } from './advance';
import { DEFAULT_CORE_TUNING } from './tuning';

/** 每天耗 4 ms 的假时钟：zones 的 endOfDay 把 t 推进 4（utilities / zones 是 END_OF_DAY_IO 的键）。 */
function clock4ms() {
  let t = 0;
  const zones: System = { ...nullSystem('zones'), endOfDay() { t += 4; } };
  return { now: () => t, zones, elapsed: () => t };
}

describe('advance: 纯算术（planDays / carryBack / planTicks）', () => {
  it('speed 5 → 每帧硬顶，不累计；暂停 → 0；其它档按 MS_PER_DAY 折天并保留余量', () => {
    const c = createCityState().clock;
    c.speed = 5; expect(planDays(c, 12345, 10)).toBe(10); expect(c.accumMs).toBe(0);
    c.speed = 1; expect(planDays(c, 12345, 10)).toBe(0); expect(c.accumMs).toBe(0);
    c.speed = 2; expect(planDays(c, 479, 10)).toBe(0); expect(c.accumMs).toBe(479);
    expect(planDays(c, 1, 10)).toBe(1); expect(c.accumMs).toBe(0);
    expect(planDays(c, MS_PER_DAY[2] * 3 + 100, 10)).toBe(3); expect(c.accumMs).toBe(100);
    expect(planDays(c, -50, 10)).toBe(0); expect(c.accumMs).toBe(100);                 // 负 dt 视为 0
  });
  it('carryBack：未跑完的天数折回余量并封顶 maxDays × msPerDay；speed 5 不折回', () => {
    const c = createCityState().clock;
    c.speed = 4; c.accumMs = 10;
    carryBack(c, 2, 10); expect(c.accumMs).toBe(10 + 2 * 40);
    carryBack(c, 100, 10); expect(c.accumMs).toBe(10 * 40);
    c.speed = 5; c.accumMs = 0; carryBack(c, 5, 10); expect(c.accumMs).toBe(0);
    c.speed = 3; carryBack(c, 0, 10); expect(c.accumMs).toBe(0);
  });
  it('planTicks：按 tickMs 折 tick 数、受 maxTicks 约束、余量封顶一个 tick；Infinity → 0', () => {
    const a = { ms: 0 };
    expect(planTicks(a, 250, 100, 40)).toBe(2); expect(a.ms).toBe(50);
    expect(planTicks(a, 100000, 100, 40)).toBe(40); expect(a.ms).toBe(100);
    expect(planTicks(a, 0, Infinity, 40)).toBe(0); expect(a.ms).toBe(0);
  });
});

describe('advance: 预算切片', () => {
  it('每天耗 4 ms、budget 6 → 每帧恰 2 天（speed 5），连续多帧', () => {
    const { now, zones } = clock4ms();
    const { host, state } = createTestContext({ systems: [zones] });
    state.clock.speed = 5;
    for (let frame = 0; frame < 5; frame++) expect(host.advance(16, now, { budgetMs: 6 })).toEqual({ daysRun: 2, suspended: false });
    expect(state.clock.age).toBe(10);
  });
  it('余量下一帧补回：speed 4 一帧 160 ms 折 4 天，预算只跑 2 天，剩余 2 天折回 accumMs 并在下一帧跑完', () => {
    const { now, zones } = clock4ms();
    const { host, state } = createTestContext({ systems: [zones] });
    state.clock.speed = 4;                                       // 40 ms / 天
    expect(host.advance(160, now, { budgetMs: 6 })).toEqual({ daysRun: 2, suspended: false });
    expect(state.clock.accumMs).toBe(80);
    expect(host.advance(0, now, { budgetMs: 6 })).toEqual({ daysRun: 2, suspended: false });
    expect(state.clock.accumMs).toBe(0);
    expect(host.advance(0, now, { budgetMs: 6 })).toEqual({ daysRun: 0, suspended: false });
    expect(state.clock.age).toBe(4);
  });
  it('硬顶：巨大 dt 每帧最多 MAX_DAYS_PER_FRAME 天，积压封顶一个硬顶（不会螺旋）', () => {
    const { host, state } = createTestContext();
    state.clock.speed = 4;
    expect(host.advance(10 * 60 * 1000, () => 0, { budgetMs: Infinity }).daysRun).toBe(MAX_DAYS_PER_FRAME);
    expect(state.clock.accumMs).toBeLessThanOrEqual(MAX_DAYS_PER_FRAME * MS_PER_DAY[4]);
    expect(host.advance(0, () => 0, { budgetMs: Infinity }).daysRun).toBe(MAX_DAYS_PER_FRAME);
    expect(host.advance(0, () => 0, { budgetMs: Infinity }).daysRun).toBe(0);
    expect(state.clock.age).toBe(20);
    expect(host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 0 }).daysRun).toBe(0);   // maxDays 至少 1，但 speed 4 无余量
    state.clock.speed = 5;
    expect(host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 0 }).daysRun).toBe(1);
  });
  it('暂停不推进也不累计余量；modalPause > 0 时返回 suspended 且不推进', () => {
    const { host, state } = createTestContext();
    expect(host.advance(5000, () => 0)).toEqual({ daysRun: 0, suspended: false });
    expect(state.clock.accumMs).toBe(0);
    state.clock.speed = 3;
    host.modalOpened();
    expect(host.advance(5000, () => 0)).toEqual({ daysRun: 0, suspended: true });
    expect(state.clock.age).toBe(0); expect(state.clock.accumMs).toBe(0);
    host.modalClosed();
    expect(host.advance(MS_PER_DAY[3], () => 0, { budgetMs: Infinity }).daysRun).toBe(1);
  });
  it('预算检查在每天之后：即使首日就超预算也至少跑 1 天', () => {
    let t = 0;
    const { host, state } = createTestContext();
    state.clock.speed = 5;
    expect(host.advance(0, () => (t += 100), { budgetMs: 1 }).daysRun).toBe(1);
  });
});

describe('advance: 挂起与 endOfDay', () => {
  function suspender() {
    const trace: string[] = [];
    const economy: System = { ...nullSystem('economy'), phases: { graphs: (ctx) => { trace.push(`graphs@${ctx.state.clock.age}`); ctx.act.emit({ type: 'modal', id: 'budget', payload: null }); return 'suspend'; } } };
    const utilities: System = { ...nullSystem('utilities'), endOfDay(ctx) { trace.push(`eod.utilities@${ctx.state.clock.age}`); } };
    const zones: System = { ...nullSystem('zones'), endOfDay(ctx) { trace.push(`eod.zones@${ctx.state.clock.age}`); } };
    return { trace, systems: [economy, utilities, zones] };
  }
  it('挂起即停：当帧剩余天数折回余量；挂起当日 endOfDay 未调用；modalClosed 后恰调用一次（utilities 先于 zones），且随后正常续跑', () => {
    const { trace, systems } = suspender();
    const { host, state } = createTestContext({ systems });
    state.clock.speed = 4;
    const r = host.advance(40 * 25, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 25 });   // 第 21 天的 graphs 挂起
    expect(r).toEqual({ daysRun: 21, suspended: true });
    expect(state.clock.age).toBe(21); expect(state.clock.modalPause).toBe(1); expect(state.clock.phaseCursor).toBe(4);
    expect(state.clock.accumMs).toBe(3 * 40);                                                 // 剩余 25 − 21 − 1 = 3 天折回
    expect(trace.filter((t) => t.startsWith('eod.'))).toHaveLength(42);
    expect(trace.filter((t) => t.endsWith('@21'))).toEqual(['graphs@21']);
    expect(host.drainEvents().filter((e) => e.type === 'modal')).toEqual([{ type: 'modal', id: 'budget', payload: null }]);
    host.modalClosed();
    expect(state.clock.age).toBe(22); expect(state.clock.phaseCursor).toBe(0); expect(state.clock.modalPause).toBe(0);
    expect(trace.filter((t) => t.endsWith('@21'))).toEqual(['graphs@21', 'eod.utilities@21', 'eod.zones@21']);
    expect(host.advance(0, () => 0, { budgetMs: Infinity }).daysRun).toBe(3);                // 补回的 3 天
    expect(state.clock.age).toBe(25);
    for (let age = 0; age < 25; age++) expect(trace.filter((t) => t === `eod.zones@${age}`), `age ${age}`).toHaveLength(1);
  });
  it('多层 modalOpened 嵌套：全部关闭才续跑；续跑时再次挂起（同日第二个可挂起阶段）各只调一次 endOfDay', () => {
    const trace: string[] = [];
    const economy: System = { ...nullSystem('economy'), phases: {
      graphs: () => { trace.push('graphs'); return 'suspend'; },
      scenario: () => { trace.push('scenario'); return 'suspend'; },
    } };
    const zones: System = { ...nullSystem('zones'), endOfDay(ctx) { trace.push(`eod@${ctx.state.clock.age}`); } };
    const { host, state } = createTestContext({ systems: [economy, zones] });
    runDays(host, 21);
    state.clock.speed = 5;
    host.advance(0, () => 0, { maxDaysPerFrame: 1, budgetMs: Infinity });
    host.modalOpened();                                                                       // UI 另开一个窗口
    host.modalClosed(); expect(state.clock.age).toBe(21); expect(state.clock.modalPause).toBe(1);
    host.modalClosed(); expect(state.clock.age).toBe(22); expect(state.clock.phaseCursor).toBe(0);
    expect(trace.filter((t) => t === 'eod@21')).toHaveLength(1);
    host.advance(0, () => 0, { maxDaysPerFrame: 1, budgetMs: Infinity });                   // 第 22 天：milestones(桩) → scenario 挂起
    expect(state.clock.phaseCursor).toBe(2); expect(trace.filter((t) => t === 'eod@22')).toHaveLength(0);
    host.modalClosed();
    expect(state.clock.age).toBe(23); expect(trace.filter((t) => t === 'eod@22')).toHaveLength(1);
  });
});

describe('advance: 物件 / 灾害 tick', () => {
  function ticker() {
    const n = { things: 0, disaster: 0 };
    const events: System = { ...nullSystem('events'), thingsTick() { n.things++; }, disasterTick() { n.disaster++; } };
    return { n, events };
  }
  it('城市模式：物件 tick 按 DISASTER_TICK_MS 节奏与日历并行；余量封顶一个 tick', () => {
    const { n, events } = ticker();
    const { host, state } = createTestContext({ systems: [events] });
    state.clock.speed = 3;                                       // tick 100 ms，天 160 ms
    host.advance(250, () => 0, { budgetMs: Infinity });
    expect(n.things).toBe(2); expect(n.disaster).toBe(0); expect(state.clock.age).toBe(1);
    host.advance(100000, () => 0, { budgetMs: Infinity });
    expect(n.things).toBe(2 + DEFAULT_CORE_TUNING.maxTicksPerFrame);
    host.advance(0, () => 0, { budgetMs: Infinity });
    expect(n.things).toBe(3 + DEFAULT_CORE_TUNING.maxTicksPerFrame);   // 余量最多一个 tick
  });
  it('灾害模式：只跑灾害 + 物件 tick、不推进日历、disasterTicks 计数；预算到即停', () => {
    const { n, events } = ticker();
    const { host, state } = createTestContext({ systems: [events] });
    state.clock.mode = CityMode.Disaster; state.clock.speed = 4;
    const tick = DISASTER_TICK_MS[4];
    expect(host.advance(tick * 3, () => 0, { budgetMs: Infinity })).toEqual({ daysRun: 0, suspended: false });
    expect(n.disaster).toBe(3); expect(n.things).toBe(3); expect(state.clock.disasterTicks).toBe(3); expect(state.clock.age).toBe(0);
    let t = 0;
    host.advance(tick * 10, () => (t += 5), { budgetMs: 6 });
    expect(n.disaster).toBeLessThan(13);                          // 预算提前停下
    expect(state.clock.disasterTicks).toBe(n.disaster);
  });
});

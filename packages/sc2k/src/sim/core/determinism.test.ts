// ===== sim/core/determinism.test.ts =====（ARCHITECTURE §10.1 确定性；WORKPLAN WP1 验收）
// 同 seed 双跑逐年相同；快照载入不改 prng.state() 且续跑哈希一致；挂起态快照往返；重放 = 原跑（含 endOfDay 与挂起日延后调用）。
// 用一组消费 PRNG 的假系统制造"有内容"的模拟：zones.growthVisit 掷骰写 xzon / xbld，utilities.endOfDay 掷骰写报告，events.news 隔月挂起、modalAnswer 掷骰。
import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../contracts/grid';
import type { System } from '../../contracts/system';
import type { StubProfile } from '../../contracts/testkit';
import { createTestContext, nullSystem, replayInContext, runDays, simInternalsOf } from '../../testkit';

const YEARS = process.env.SC2K_LONGRUN ? 10 : 3;
const R_BUILT = 0x70;

/** 每次调用返回一套全新的假系统（闭包计数器独立），并返回它们的调用痕迹；profile 决定它们各自桩查询的档位（显式给出的系统不受 createTestContext.profile 影响）。 */
function fakes(profile: StubProfile = 'realistic') {
  const trace: string[] = [];
  const zones: System = {
    ...nullSystem('zones', profile),
    growthVisit(ctx, x, y) {
      const roll = ctx.prng.int(97);
      if (roll === 0) ctx.act.setXzon(tileIndex(x, y), 1 | 0xf0);
      else if (roll === 1 && ctx.q.utilities.hasPower(tileIndex(x, y))) ctx.act.setXbld(tileIndex(x, y), R_BUILT);
    },
    endOfDay(ctx) { trace.push(`eod.zones@${ctx.state.clock.age}`); },
  };
  const utilities: System = {
    ...nullSystem('utilities', profile),
    endOfDay(ctx) { const p = ctx.state.utilities.power; p.generation = (p.generation + ctx.prng.int(100)) & 0xffff; trace.push(`eod.utilities@${ctx.state.clock.age}`); },
  };
  const events: System = {
    ...nullSystem('events', profile),
    phases: { news: (ctx) => { const m = Math.floor(ctx.state.clock.age / 25); if (m % 2 === 1) { trace.push(`suspend@${ctx.state.clock.age}`); ctx.act.emit({ type: 'modal', id: 'newspaper', payload: null }); return 'suspend'; } return 'done'; } },
    onModalAnswer(ctx, _dialog, answer) { ctx.state.weather.heat = ctx.prng.int(answer + 1); trace.push(`answer@${ctx.state.clock.age}:${answer}`); },
  };
  return { systems: [zones, utilities, events], trace };
}

describe('determinism: 双跑与快照', () => {
  it.each(['optimistic', 'pessimistic'] as const)(`[%s] 同 seed 两次独立运行逐年 hash(full) / hash(sc2) 相同（${YEARS} 年）`, (profile) => {
    const a = createTestContext({ profile, seed: 2024, systems: fakes(profile).systems });
    const b = createTestContext({ profile, seed: 2024, systems: fakes(profile).systems });
    for (let y = 1; y <= YEARS; y++) {
      runDays(a.host, 300); runDays(b.host, 300);
      expect(a.host.hash('full'), `year ${y}`).toBe(b.host.hash('full'));
      expect(a.host.hash('sc2'), `year ${y}`).toBe(b.host.hash('sc2'));
    }
    expect(a.ctx.prng.state()).toBe(b.ctx.prng.state());
    expect(a.state.clock.age).toBe(YEARS * 300);
    // 有内容：zones 的掷骰确实写了层（乐观桩下 hasPower 为真 → 有建筑；悲观桩下只有分区码）
    expect(a.state.layers.xzon.some((v) => v !== 0)).toBe(true);
    if (profile === 'optimistic') expect(a.state.counts.tile[0]).toBeLessThan(16384); else expect(a.state.counts.tile[0]).toBe(16384);
    const c = createTestContext({ profile, seed: 2025, systems: fakes(profile).systems });
    runDays(c.host, 300);
    expect(c.host.hash('full')).not.toBe(a.host.hash('full'));
  });
  it('快照载入不改 prng.state()；载入后续跑 N 天哈希与不中断相同；载入方的旧日志清空', () => {
    const a = createTestContext({ seed: 11, systems: fakes().systems });
    runDays(a.host, 130);
    const prng = a.ctx.prng.state(), full = a.host.hash('full');
    const bytes = a.host.saveSnapshot();
    const b = createTestContext({ seed: 99, systems: fakes().systems });
    runDays(b.host, 40); b.host.dispatch({ type: 'setSpeed', speed: 3 });
    const diag = b.host.loadSnapshot(bytes);
    expect(diag.filter((d) => d.level !== 'info')).toEqual([]);
    expect(b.ctx.prng.state()).toBe(prng); expect(b.host.hash('full')).toBe(full); expect(b.host.commandLog()).toEqual([]);
    expect(b.state.clock.accumMs).toBe(0); expect(b.state.clock.modalPause).toBe(0);
    runDays(a.host, 170); runDays(b.host, 170);
    expect(b.host.hash('full')).toBe(a.host.hash('full')); expect(b.host.hash('sc2')).toBe(a.host.hash('sc2'));
    expect(b.ctx.prng.state()).toBe(a.ctx.prng.state());
  });
  it('挂起态快照：保存时 phaseCursor > 0，载入后仍挂起（modalPause 恰为 1），modalClosed 续跑后与原跑一致', () => {
    const a = createTestContext({ seed: 5, systems: fakes().systems });
    const internals = simInternalsOf(a.host);
    while (a.state.clock.modalPause === 0) internals.stepDay();                    // 第 49 天（第 1 月 news）挂起
    expect(a.state.clock.phaseCursor).toBe(3); expect(a.state.clock.age).toBe(49);
    const bytes = a.host.saveSnapshot();
    const b = createTestContext({ seed: 1, systems: fakes().systems });
    runDays(b.host, 3);
    const diag = b.host.loadSnapshot(bytes);
    expect(diag.some((d) => d.code === 'snapshot.suspended')).toBe(true);
    expect(b.state.clock.modalPause).toBe(1); expect(b.state.clock.phaseCursor).toBe(3);
    expect(b.host.advance(0, () => 0)).toEqual({ daysRun: 0, suspended: true });
    expect(() => b.host.exportSc2()).toThrow(/phaseCursor/);
    a.host.dispatch({ type: 'modalAnswer', dialog: 'newspaper', answer: 7 }); a.host.modalClosed();
    b.host.dispatch({ type: 'modalAnswer', dialog: 'newspaper', answer: 7 }); b.host.modalClosed();
    expect(b.state.clock.age).toBe(50); expect(b.host.hash('full')).toBe(a.host.hash('full'));
    runDays(a.host, 60); runDays(b.host, 60);
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
    // 两天之间但 UI 开着窗口（modalPause > 0、phaseCursor 0）时保存：载入后 modalPause 归零
    a.host.modalOpened();
    const c = createTestContext({ seed: 2, systems: fakes().systems });
    c.host.loadSnapshot(a.host.saveSnapshot());
    expect(c.state.clock.modalPause).toBe(0); expect(c.state.clock.phaseCursor).toBe(0);
  });
});

describe('determinism: 重放 = 原跑', () => {
  it('同 seed + 同日志重放：逐年 hash(full) 相同；endOfDay 每天恰一次且挂起日延后到 modalClosed 之后；挂起期间的 modalAnswer 在同一游标重放', () => {
    const orig = fakes();
    const a = createTestContext({ seed: 31, systems: orig.systems });
    const until = 25 * 14;                                                            // 14 个月：含 7 次 news 挂起
    a.state.clock.speed = 5;
    let step = 0;
    const yearHashes: number[] = [];
    while (a.state.clock.age < until) {
      const c = a.state.clock;
      if (c.modalPause > 0) {
        a.host.dispatch({ type: 'modalAnswer', dialog: 'newspaper', answer: step % 5 });
        if (step % 2 === 0) a.host.dispatch({ type: 'setView', x: step, y: 0, zoom: 1, rotation: 0 });   // 挂起期间的其它命令也入日志
        a.host.modalClosed();
      } else {
        if (c.age % 40 === 0) a.host.dispatch({ type: 'setSpeed', speed: 5 });
        a.host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 1 });
      }
      if (a.state.clock.age % 300 === 0 && a.state.clock.modalPause === 0 && yearHashes.length < a.state.clock.age / 300) yearHashes.push(a.host.hash('full'));
      step++;
    }
    a.host.dispatch({ type: 'setView', x: 9, y: 9, zoom: 2, rotation: 1 });           // 最后一天之后的命令
    const log = a.host.commandLog();
    expect(log.filter((l) => l.phaseCursor > 0)).toHaveLength(7 + 4);
    expect(log.filter((l) => l.cmd.type === 'modalAnswer')).toHaveLength(7);
    // 原跑痕迹：每个 age 恰一次 eod.zones；挂起日的 eod 在 suspend / answer 之后
    for (let age = 0; age < until; age++) expect(orig.trace.filter((t) => t === `eod.zones@${age}`), `age ${age}`).toHaveLength(1);
    for (const age of [49, 99, 149]) {
      const i = orig.trace.indexOf(`suspend@${age}`), j = orig.trace.findIndex((t) => t.startsWith(`answer@${age}:`)), k = orig.trace.indexOf(`eod.utilities@${age}`);
      expect(i).toBeGreaterThanOrEqual(0); expect(j).toBeGreaterThan(i); expect(k).toBeGreaterThan(j);
    }
    const again = fakes();
    const b = replayInContext(log, until, { seed: 31, systems: again.systems });
    expect(b.state.clock.age).toBe(until);
    expect(b.host.hash('full')).toBe(a.host.hash('full')); expect(b.host.hash('sc2')).toBe(a.host.hash('sc2'));
    expect(b.state.view).toEqual({ x: 9, y: 9, zoom: 2 });
    expect(again.trace).toEqual(orig.trace);                                             // 调用序列逐条相同（含 eod 与挂起延后）
    expect(b.host.commandLog().map((l) => [l.age, l.phaseCursor, l.cmd.type])).toEqual(log.map((l) => [l.age, l.phaseCursor, l.cmd.type]));
    // 日志打乱顺序也能重放（按 age / phaseCursor / seq 排序）
    const shuffled = log.slice().reverse();
    const c = replayInContext(shuffled, until, { seed: 31, systems: fakes().systems });
    expect(c.host.hash('full')).toBe(a.host.hash('full'));
    // 不同回答 → 不同哈希（证明 modalAnswer 真的进入了 PRNG 流）
    const tweaked = log.map((l) => (l.cmd.type === 'modalAnswer' ? { ...l, cmd: { ...l.cmd, answer: 4 - (l.cmd.answer as number) } } : l));
    const d = replayInContext(tweaked, until, { seed: 31, systems: fakes().systems });
    expect(d.host.hash('full')).not.toBe(a.host.hash('full'));
  });
  it('重放时不可达游标的条目被跳过、不中断；到达 untilAge 后再派发 (untilAge, 0) 的命令', () => {
    const { systems } = fakes();
    const log = [
      { age: 10, phaseCursor: 5, seq: 0, cmd: { type: 'setSpeed', speed: 2 } as const },
      { age: 12, phaseCursor: 0, seq: 1, cmd: { type: 'setView', x: 1, y: 2, zoom: 0, rotation: 0 } as const },
      { age: 20, phaseCursor: 0, seq: 2, cmd: { type: 'setView', x: 5, y: 5, zoom: 1, rotation: 1 } as const },
    ];
    const b = replayInContext(log, 20, { seed: 1, systems });
    expect(b.state.clock.age).toBe(20); expect(b.state.view).toEqual({ x: 5, y: 5, zoom: 1 });
    expect(b.host.commandLog().map((l) => [l.cmd.type, l.age])).toEqual([['setView', 12], ['setView', 20]]);
  });
});

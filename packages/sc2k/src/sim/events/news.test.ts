// WP13 验收：报纸（冷却、衰减、month ∈ {2,6} 订阅版挂起、灾害号外、extraPaper 选项关闭不挂起、currentPaper 头条 = 最高 power）。
import { describe, expect, it } from 'vitest';
import { NewsType } from '../../contracts/events';
import { DisasterKind } from '../../contracts/grid';
import { createTestContext, runDays } from '../../testkit';
import { ofType, placeBuilding, runTicks, runUntil } from './fixtures';
import { createEventsSystem } from './index';
import { EXTRA_PAPER_OFF, PAPER_DELIVERY_OFF } from './news';

/** 桩下 EQ / LE 为 0 会让月检几乎必发 PoorEducation / PoorHealth；内容精确断言的用例把它们设成健康值。 */
const mk = (seed = 1) => {
  const t = createTestContext({ systems: [createEventsSystem()], seed });
  t.state.demographics.workforceEQ = 120; t.state.demographics.workforceLE = 80;
  return t;
};

describe('news', () => {
  it('建城即有 Founding 故事；Founding 一生只发一次', () => {
    const { host, ctx } = mk();
    expect(host.q.news.stories().map((s) => s.type)).toEqual([NewsType.Founding]);
    ctx.act.news(NewsType.Founding, 0);
    expect(host.q.news.stories().filter((s) => s.type === NewsType.Founding)).toHaveLength(1);
  });

  it('冷却：HighCrime（12 个月）同日二次入池被拒；满 12 个月后可再入；newsStory 事件只在入池时发', () => {
    const { host, ctx } = mk();
    host.drainEvents();
    expect(ctx.act.news(NewsType.HighCrime, 40)).toBeUndefined();
    ctx.act.news(NewsType.HighCrime, 41);
    expect(host.q.news.stories().filter((s) => s.type === NewsType.HighCrime)).toEqual([{ type: NewsType.HighCrime, value: 40, power: 50, monthIndex: 0 }]);
    expect(ofType(host.drainEvents(), 'newsStory')).toHaveLength(1);
    runDays(host, 299);
    ctx.act.news(NewsType.HighCrime, 42);
    expect(host.q.news.stories().filter((s) => s.type === NewsType.HighCrime)).toHaveLength(0);   // 第 299 天仍在冷却且原故事已衰减出池
    runDays(host, 1);
    ctx.act.news(NewsType.HighCrime, 43);
    expect(host.q.news.stories().filter((s) => s.type === NewsType.HighCrime)).toHaveLength(1);
  });

  it('衰减：每月第 24 天 score −= decay，≤ 0 出池（Growth 90/15 → 6 个月后消失）', () => {
    const { host, ctx, state } = mk();
    state.rawMisc[PAPER_DELIVERY_OFF] = 0;                                 // 关掉订阅版，免得 4 月号把故事消费掉
    ctx.act.news(NewsType.Growth, 1000);
    const powerOf = () => host.q.news.stories().find((s) => s.type === NewsType.Growth)?.power;
    expect(powerOf()).toBe(90);
    runDays(host, 25); expect(powerOf()).toBe(75);
    runDays(host, 100); expect(powerOf()).toBe(15);                        // 第 5 个月末
    runDays(host, 25); expect(powerOf()).toBeUndefined();                  // 第 6 个月末出池
  });

  it('订阅版：month ∈ {2, 6} 的 news 阶段组版 → paper{extra:false} + modal newspaper + 挂起；头条 = 池中最高 power；刊出的故事被消费', () => {
    const { host, ctx, state } = mk();
    ctx.act.news(NewsType.Growth, 5000); ctx.act.news(NewsType.HighCrime, 30); ctx.act.news(NewsType.DemandPower, 0);
    state.clock.speed = 5;
    while (state.clock.age < 74) host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 1 });
    host.drainEvents();
    const r = host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 1 });
    expect(r.suspended).toBe(true);
    expect(state.clock.modalPause).toBe(1); expect(state.clock.age).toBe(74);
    const ev = host.drainEvents();
    expect(ofType(ev, 'paper')).toEqual([{ type: 'paper', extra: false }]);
    expect(ofType(ev, 'modal').map((m) => m.id)).toEqual(['newspaper']);
    const paper = host.q.news.currentPaper()!;
    expect(paper.extra).toBe(false); expect(paper.year).toBe(1900); expect(paper.month).toBe(2);
    expect(paper.headline).toMatchObject({ type: NewsType.Growth, value: 5000, power: 45 });   // 90 − 3 × 15
    expect(paper.stories.map((s) => s.type)).toEqual([NewsType.Founding, NewsType.DemandPower, NewsType.HighCrime, NewsType.Weather]);
    expect(paper.stories.at(-1)!.value).toBe(state.weather.heat - 100);
    expect(paper.weather).toEqual(state.weather);
    expect(host.q.news.stories()).toEqual([]);                             // 全部刊出
    host.modalClosed();
    expect(state.clock.age).toBe(75); expect(state.clock.modalPause).toBe(0);
    // 8 月号：month 6 的第 24 天 = age 174
    while (state.clock.age < 174) host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 1 });
    host.drainEvents();
    expect(host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 1 }).suspended).toBe(true);
    expect(host.q.news.currentPaper()!.month).toBe(6);
    expect(host.q.news.currentPaper()!.headline!.type).toBe(NewsType.Junk);     // 空池头条
    expect(ofType(host.drainEvents(), 'modal').map((m) => m.id)).toEqual(['newspaper']);
    host.modalClosed();
    // 其它月份不挂起
    runDays(host, 25);
    expect(ofType(host.drainEvents(), 'modal')).toHaveLength(0);
  });

  it('paperDelivery 关闭：订阅日只发 paper 事件不挂起，故事保留在池中', () => {
    const { host, ctx, state } = mk();
    state.rawMisc[PAPER_DELIVERY_OFF] = 0;
    ctx.act.news(NewsType.Growth, 1);
    runDays(host, 75);
    const ev = host.drainEvents();
    expect(ofType(ev, 'paper')).toEqual([{ type: 'paper', extra: false }]);
    expect(ofType(ev, 'modal')).toHaveLength(0);
    expect(host.q.news.currentPaper()?.headline?.type).toBe(NewsType.Growth);
    expect(host.q.news.stories().some((s) => s.type === NewsType.Growth)).toBe(true);
  });

  it('灾害号外：disasterEnded 时组版 → paper{extra:true} + modal extraPaper；extraPaper 关闭时只发事件、不消费池', () => {
    const run = (extraOn: boolean) => {
      const { host, ctx, state } = mk(3);
      state.rawMisc[EXTRA_PAPER_OFF] = extraOn ? 1 : 0;
      placeBuilding(ctx, 0x70, 20, 20, 1);
      host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 20, y: 20 });
      runTicks(host, 1); host.drainEvents();
      runUntil(host, () => !state.disaster.active, 200);
      const ev = host.drainEvents();
      return { ev, paper: host.q.news.currentPaper(), pool: host.q.news.stories(), pause: state.clock.modalPause };
    };
    const on = run(true);
    expect(ofType(on.ev, 'paper')).toEqual([{ type: 'paper', extra: true }]);
    expect(ofType(on.ev, 'modal').map((m) => m.id)).toEqual(['extraPaper']);
    expect(on.paper).toMatchObject({ extra: true, headline: { type: NewsType.DisasterFire } });
    expect(on.pool.some((s) => s.type === NewsType.DisasterFire)).toBe(false);
    const off = run(false);
    expect(ofType(off.ev, 'paper')).toEqual([{ type: 'paper', extra: true }]);
    expect(ofType(off.ev, 'modal')).toHaveLength(0);
    expect(off.pause).toBe(0);
    expect(off.paper).toMatchObject({ extra: true, headline: { type: NewsType.DisasterFire } });
    expect(off.pool.some((s) => s.type === NewsType.DisasterFire)).toBe(true);
  });

  it('非法类型 / 不入池类型被忽略；池满丢最低分', () => {
    const { host, ctx } = mk();
    ctx.act.news(99, 0); ctx.act.news(-1, 0); ctx.act.news(NewsType.Weather, 0); ctx.act.news(NewsType.AdviceColumn, 0);
    expect(host.q.news.stories().map((s) => s.type)).toEqual([NewsType.Founding]);
    for (let k = 0; k < 40; k++) ctx.act.news(NewsType.Ordinance, k);    // cooldown 0，power 50
    const pool = host.q.news.stories();
    expect(pool.length).toBe(32);
    expect(pool[0]!.type).toBe(NewsType.Founding);                         // 100 分保留
  });
});

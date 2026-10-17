// ===== sim/economy/budgetWindow.test.ts =====（WORKPLAN WP8 验收：autoBudget 不挂起但发 yearClosed；挂起后 modalClosed 续跑且不重跑；取消恢复滑块；closeYear 年报；破产 / 弹劾最小版）
import { describe, expect, it } from 'vitest';
import { DAY_PHASES, SYSTEM_ORDER } from '../../contracts/clock';
import type { SimEvent } from '../../contracts/events';
import type { SimHost } from '../../contracts/host';
import type { TestContextOptions } from '../../contracts/testkit';
import { CATALOGUE } from '../../data';
import { snapshotCodec } from '../../io/snapshot';
import { createTestContext, nullSystem, runDays, simContextOf } from '../../testkit';
import { createCoreSystem, createSim } from '../core';
import { BUDGET_ANSWER_CANCEL, BUDGET_ANSWER_CONFIRM, createEconomySystem } from './index';
import { F_TAX_TOTAL, Y_TOTALS, isValidPriv, yearView } from './priv';
import type { EconomyPriv } from './priv';

const mk = (opts: TestContextOptions = {}) => createTestContext({ systems: [createEconomySystem()], ...opts });
const privOf = (state: { priv: { economy?: unknown } }): EconomyPriv => { const p = state.priv.economy; if (!isValidPriv(p)) throw new Error('priv 无效'); return p; };
const ofType = <K extends SimEvent['type']>(evs: SimEvent[], type: K): Extract<SimEvent, { type: K }>[] => evs.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);
const BUDGET_CURSOR = DAY_PHASES[0]!.indexOf('budgetWindow') + 1;
const CLOSE_CURSOR = DAY_PHASES[0]!.indexOf('closeYear') + 1;
/** 不经 runDays 的推进（runDays 会自动关模态）：直到挂起或到达 age。 */
function advanceUntil(host: SimHost, age: number): boolean {
  host.state.clock.speed = 5;
  while (host.state.clock.age < age) {
    const r = host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 10 });
    if (r.suspended) return true;
  }
  return false;
}

describe.each(['optimistic', 'pessimistic'] as const)('budgetWindow（%s 桩）', (profile) => {
  it('autoBudget：1 月第 0 天不挂起，但 yearClosed 始终发出；closeYear 产出年报并重置 ytd', () => {
    const { host, state } = mk({ profile });
    state.census.taxableRes = 750;                                   // 每月 $70
    expect(host.dispatch({ type: 'setOption', key: 'autoBudget', value: true }).ok).toBe(true);
    expect(advanceUntil(host, 310)).toBe(false);
    expect(state.clock.age).toBe(310); expect(state.clock.modalPause).toBe(0);
    const ev = host.drainEvents();
    expect(ofType(ev, 'yearClosed')).toEqual([{ type: 'yearClosed', year: 1900 }]);
    expect(ofType(ev, 'budgetWindow')).toEqual([]);
    expect(ofType(ev, 'modal')).toEqual([]);
    expect(ofType(ev, 'monthSettled')).toHaveLength(12);
    const y = yearView(privOf(state).lastYear)!;
    expect(y).toMatchObject({ year: 1900, openingFunds: 20000, closingFunds: 20000 + 12 * 70, bondsIssued: 0, bondsRepaid: 0, months: 12 });
    expect(y.totals.tax.total).toBe(840);
    expect(privOf(state).ytd).toHaveLength(0);
    expect(state.economy.yearOpeningFunds).toBe(20840);
    expect(host.q.economy.budgetView().openingFunds).toBe(20840);
  });
  it('非自动预算：挂起在 budgetWindow 之后；挂起期间可派发命令；modalClosed 续跑剩余阶段、不重跑 settleMonth', () => {
    const { host, state } = mk({ profile });
    state.census.taxableRes = 750;
    expect(advanceUntil(host, 310)).toBe(true);
    expect(state.clock.age).toBe(300); expect(state.clock.phaseCursor).toBe(BUDGET_CURSOR); expect(state.clock.modalPause).toBe(1);
    const fundsAtOpen = state.economy.funds;
    expect(fundsAtOpen).toBe(20000 + 12 * 70);
    const ev = host.drainEvents();
    expect(ofType(ev, 'yearClosed')).toEqual([{ type: 'yearClosed', year: 1900 }]);
    expect(ofType(ev, 'budgetWindow')).toHaveLength(1);
    const modal = ofType(ev, 'modal');
    expect(modal).toHaveLength(1);
    expect(modal[0]!.id).toBe('budget');
    const payload = modal[0]!.payload as { view: { rows: { key: string; ytd: number; estimate: number }[]; funding: number[] }; lastYear: { year: number } | null };
    expect(payload.lastYear?.year).toBe(1900);
    expect(payload.view.rows.find((r) => r.key === 'budget.taxes')).toMatchObject({ ytd: 0, estimate: 840 });
    expect(Array.isArray(payload.view.funding)).toBe(true);
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);   // 可 JSON 化
    // 挂起期间派发命令：记录 phaseCursor > 0
    expect(host.dispatch({ type: 'setTax', rates: { r: 12, c: 12, i: 12 } }).ok).toBe(true);
    expect(host.commandLog().at(-1)).toMatchObject({ age: 300, phaseCursor: BUDGET_CURSOR, cmd: { type: 'setTax' } });
    expect(host.dispatch({ type: 'modalAnswer', dialog: 'budget', answer: BUDGET_ANSWER_CONFIRM }).ok).toBe(true);
    host.modalClosed();
    expect(state.clock.age).toBe(301); expect(state.clock.phaseCursor).toBe(0); expect(state.clock.modalPause).toBe(0);
    expect(state.economy.funds).toBe(fundsAtOpen);                   // 没有重跑 settleMonth
    expect(state.economy.taxRate).toEqual({ r: 12, c: 12, i: 12 });
    expect(ofType(host.drainEvents(), 'monthSettled')).toHaveLength(0);
    runDays(host, 25);
    expect(ofType(host.drainEvents(), 'monthSettled')).toHaveLength(1);   // 下一次结算在 age 325
    expect(state.economy.funds).toBe(fundsAtOpen + Math.floor((12 * 750) / 75));
  });
  it('取消（answer 1）恢复打开窗口时的税率 / 产业税率 / 资金率；关闭（answer 0）保留', () => {
    const { host, state } = mk({ profile });
    expect(advanceUntil(host, 301)).toBe(true);
    host.dispatch({ type: 'setTax', rates: { r: 15, c: 15, i: 15 } });
    host.dispatch({ type: 'setFunding', line: 0, pct: 10 });
    host.dispatch({ type: 'setIndustryTax', k: 3, rate: 1 });
    expect(state.economy.taxRate.r).toBe(15);
    host.dispatch({ type: 'modalAnswer', dialog: 'budget', answer: BUDGET_ANSWER_CANCEL });
    host.modalClosed();
    expect(state.economy.taxRate).toEqual({ r: 7, c: 7, i: 7 });
    expect(Array.from(state.economy.industryTax)).toEqual(new Array(11).fill(7));
    expect(state.economy.funding[0]).toBe(100);
    expect(state.clock.age).toBe(301);
    // 第二年：关闭（外壳默认 answer 0）保留改动
    expect(advanceUntil(host, 601)).toBe(true);
    host.dispatch({ type: 'setFunding', line: 0, pct: 30 });
    host.dispatch({ type: 'modalAnswer', dialog: 'budget', answer: BUDGET_ANSWER_CONFIRM });
    host.modalClosed();
    expect(state.economy.funding[0]).toBe(30);
    expect(state.clock.age).toBe(601);
  });
  it('budgetView：行键、YTD / 估计列、年末资金估计、滑块；顾问数组可用', () => {
    const { host, state } = mk({ profile });
    state.census.taxableRes = 750;
    state.counts.tile[0xd3] = 9;                                     // 1 座消防局 $100 / 年
    runDays(host, 76);                                               // 3 个月已结
    const v = host.q.economy.budgetView();
    expect(v.rows.map((r) => r.key)).toEqual(['budget.taxes', 'budget.ordinances', 'budget.bonds', 'budget.police', 'budget.fire', 'budget.health', 'budget.schools', 'budget.colleges', 'budget.roads', 'budget.highways', 'budget.bridges', 'budget.rail', 'budget.subway', 'budget.tunnel', 'budget.busFixed', 'budget.cashFlow']);
    const taxes = v.rows[0]!, fire = v.rows[4]!, cash = v.rows.at(-1)!;
    expect(taxes).toMatchObject({ ytd: 210, estimate: 840, slider: { value: 7, min: 0, max: 20 } });
    expect(fire.ytd).toBe(-25); expect(fire.estimate).toBe(-100); expect(fire.slider).toEqual({ value: 100, min: 0, max: 100 });
    expect(cash.ytd).toBe(185); expect(cash.estimate).toBe(740);
    expect(v.endOfYearFunds).toBe(state.economy.funds + (740 - 185));
    expect(v.openingFunds).toBe(20000); expect(v.funds).toBe(20185);
    expect(v.advisors.every((a) => a.key.startsWith('advice.') && a.advisor.length > 0)).toBe(true);
    expect(v.advisors.map((a) => a.advisor)).toContain('fire');
    // 拖动滑块：估计列实时变化，YTD 不变
    host.dispatch({ type: 'setFunding', line: 1, pct: 0 });
    const v2 = host.q.economy.budgetView();
    expect(v2.rows[4]).toMatchObject({ ytd: -25, estimate: -25 });
    expect(privOf(state).ytd[0]![F_TAX_TOTAL]).toBe(70);
  });
});

describe('solvency：破产 / 弹劾最小版', () => {
  it('closeYear 时 funds < impeachFundsThreshold → impeached 事件 + gameOver 模态并挂起；此后 charge / canAfford 拒绝、债券命令锁定', () => {
    const { host, state, ctx } = mk({ tuning: { economy: { impeachFundsThreshold: -1000 } } });
    state.economy.funds = -5000;
    expect(advanceUntil(host, 310)).toBe(true);
    expect(state.clock.age).toBe(300); expect(state.clock.phaseCursor).toBe(CLOSE_CURSOR);
    const ev = host.drainEvents();
    expect(ofType(ev, 'impeached')).toEqual([{ type: 'impeached', funds: -5000 }]);
    expect(ofType(ev, 'modal').map((m) => m.id)).toEqual(['gameOver']);
    expect(state.economy.impeached).toBe(true);
    expect(ctx.act.charge(10)).toBe(false); expect(ctx.act.charge(0)).toBe(true);
    expect(host.q.economy.canAfford(1)).toBe(false);
    expect(host.dispatch({ type: 'issueBond' })).toMatchObject({ ok: false, reason: 'locked' });
    host.dispatch({ type: 'modalAnswer', dialog: 'gameOver', answer: 1 });
    host.modalClosed();                                              // 续跑 → budgetWindow 再次挂起（观察模式仍有预算窗）
    expect(ofType(host.drainEvents(), 'modal').map((m) => m.id)).toEqual(['budget']);
    host.modalClosed();
    expect(state.clock.age).toBe(301);
    runDays(host, 300);
    expect(ofType(host.drainEvents(), 'impeached')).toEqual([]);     // 不重复弹劾
  });
  it('impeachYears：连续 N 年年末负资金才弹劾', () => {
    const { host, state } = mk({ tuning: { economy: { impeachYears: 2 } } });
    state.economy.autoBudget = true;
    state.economy.funds = -10;
    runDays(host, 301);
    expect(state.economy.impeached).toBe(false);
    expect(privOf(state).negYears).toBe(1);
    runDays(host, 300);
    expect(state.economy.impeached).toBe(true);
    expect(ofType(host.drainEvents(), 'impeached')).toHaveLength(1);
  });
  it('impeachMonthly：第 22 天 solvency 阶段判定（core 只在 createSim({ impeachMonthly }) 时调用）', () => {
    const systems = SYSTEM_ORDER.map((id) => (id === 'core' ? createCoreSystem() : id === 'economy' ? createEconomySystem() : nullSystem(id)));
    const host = createSim({ systems, catalogue: CATALOGUE, snapshot: snapshotCodec, stubAllowlist: SYSTEM_ORDER, impeachMonthly: true, tuning: { economy: { impeachCheck: 'monthly' } } });
    host.newCity({ name: 'Ledger Falls', difficulty: 1, startYear: 1900, seed: 3, terrainSeed: 3, terrain: { coast: false, river: false, hills: 0, water: 0, trees: 0 } });
    const state = simContextOf(host).state;
    state.clock.mode = 1;
    state.economy.funds = -60000;
    expect(advanceUntil(host, 25)).toBe(true);
    expect(state.clock.age).toBe(22);
    expect(ofType(host.drainEvents(), 'modal').map((m) => m.id)).toEqual(['gameOver']);
    expect(state.economy.impeached).toBe(true);
    host.modalClosed();
    expect(state.clock.age).toBe(23);
  });
});

describe('budgetWindow 的阶段游标与 closeYear 的年报总额', () => {
  it('年报 totals = 12 个月 flow 之和；lastYear 可经 yearView 读出', () => {
    const { host, state } = mk();
    state.census.taxableRes = 75 * 100;                              // 每月 $700
    state.economy.autoBudget = true;
    runDays(host, 301);
    const y = privOf(state).lastYear;
    expect(y[Y_TOTALS + F_TAX_TOTAL]).toBe(8400);
    expect(yearView(y)?.totals.net).toBe(8400);
    expect(yearView(new Int32Array(0))).toBeNull();
  });
});

// ===== sim/economy/bonds.test.ts =====（WORKPLAN WP8 验收：50 张 25% 无溢出；偿还最早；预览不消费 PRNG；评级 / 下一张利率；作弊码绕过评级）
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../contracts/events';
import { createPrng } from '../../contracts/prng';
import { createTestContext, runDays } from '../../testkit';
import type { TestContextOptions } from '../../contracts/testkit';
import { creditRating, nextBondRateRaw, tierIndex } from './bonds';
import { createEconomySystem } from './index';
import { DEFAULT_ECONOMY_TUNING } from './tuning';

const mk = (opts: TestContextOptions = {}) => createTestContext({ systems: [createEconomySystem()], ...opts });
const ofType = <K extends SimEvent['type']>(evs: SimEvent[], type: K): Extract<SimEvent, { type: K }>[] => evs.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);
const T = DEFAULT_ECONOMY_TUNING;

describe('信用评级与下一张利率（纯函数）', () => {
  it('tierIndex：落在第几档；超过全部上界 → tiers.length（F）', () => {
    expect(tierIndex([0.02, 0.04], 0)).toBe(0); expect(tierIndex([0.02, 0.04], 0.02)).toBe(1); expect(tierIndex([0.02, 0.04], 1)).toBe(2);
  });
  it('无债券 → AAA；债务 / 城市价值 ≥ 1 → F；评级取两档中较差者', () => {
    const { state } = mk();
    const e = state.economy;
    expect(creditRating(e, 0, 0, T)).toBe('AAA');
    e.bonds.push({ rateRaw: 30000, issuedYear: 1900, issuedMonth: 0 });
    expect(creditRating(e, 10000, 100000, T)).toBe('A');            // dsr 0.03 → AA；抵押 0.1 → A；取差
    for (let k = 0; k < 9; k++) e.bonds.push({ rateRaw: 30000, issuedYear: 1900, issuedMonth: 0 });
    expect(creditRating(e, 10000, 100000, T)).toBe('F');            // 100,000 / 100,000 = 1.0
    expect(nextBondRateRaw(e, 'F', 0, T)).toBeNull();
    expect(nextBondRateRaw(e, 'AAA', 0, T)).toBe(30000 + 2500 * 10);
    expect(nextBondRateRaw(e, 'D', 9999, T)).toBe(Math.min(250000, 30000 + 25000 + 70000 + 9999));
    expect(nextBondRateRaw({ ...e, fedRateRaw: 1 }, 'AAA', 0, { ...T, bonds: { ...T.bonds, perBondSpreadRaw: 0 } })).toBe(T.bonds.minRaw);
  });
});

describe.each(['optimistic', 'pessimistic'] as const)('债券命令（%s 桩）', (profile) => {
  it('作弊码发 50 张 25% 债券：年息恰 $125,000、无溢出 / 无负利息；第 51 张拒绝 max', () => {
    const { host, state } = mk({ profile });
    for (let k = 0; k < 50; k++) expect(host.dispatch({ type: 'cheat', code: 'fund' }).ok).toBe(true);
    expect(state.economy.bonds).toHaveLength(50);
    expect(state.economy.funds).toBe(20000 + 500000);
    expect(state.economy.bonds.every((b) => b.rateRaw === 250000)).toBe(true);
    const r = host.dispatch({ type: 'cheat', code: 'fund' });
    expect(r).toMatchObject({ ok: false, reason: 'limit' });
    expect(host.dispatch({ type: 'issueBond' })).toMatchObject({ ok: false, reason: 'limit' });
    expect(ofType(host.drainEvents(), 'bondRefused')).toEqual([{ type: 'bondRefused', reason: 'max' }, { type: 'bondRefused', reason: 'max' }]);
    runDays(host, 301);
    expect(state.economy.funds).toBe(520000 - 125000);
    const settled = ofType(host.drainEvents(), 'monthSettled');
    expect(settled).toHaveLength(12);
    expect(settled.every((e) => Number.isFinite(e.net) && e.net < 0 && e.net >= -50 * Math.ceil(2500 / 12))).toBe(true);   // 每张按月切分 208/209
    const bv = host.q.economy.bondView();
    expect(bv.count).toBe(50); expect(bv.sumRatePctFloor).toBe(1250); expect(bv.avgRatePctFloor).toBe(25); expect(bv.canIssue).toBe(false);
    expect(bv.bonds[0]).toMatchObject({ ratePctFloor: 25, annual: 2500 });
  });
  it('偿还永远是最早一张；资金 < $10,000 拒绝；无债券拒绝', () => {
    const { host, state } = mk({ profile, params: { difficulty: 2 } });
    expect(host.dispatch({ type: 'repayBond' })).toMatchObject({ ok: false, reason: 'noTarget' });
    expect(host.dispatch({ type: 'issueBond' }).ok).toBe(true);
    expect(host.dispatch({ type: 'issueBond' }).ok).toBe(true);
    expect(host.dispatch({ type: 'cheat', code: 'fund' }).ok).toBe(true);
    const [first, second, third] = state.economy.bonds.map((b) => b.rateRaw);
    expect(third).toBe(250000);
    expect(state.economy.funds).toBe(10000 + 30000);
    expect(host.dispatch({ type: 'repayBond' })).toMatchObject({ ok: true, cost: 10000 });
    expect(state.economy.bonds.map((b) => b.rateRaw)).toEqual([second, third]);
    expect(state.economy.funds).toBe(30000);
    expect(first).not.toBe(250000);
    state.economy.funds = 9999;
    expect(host.dispatch({ type: 'repayBond' })).toMatchObject({ ok: false, reason: 'funds' });
    expect(state.economy.bonds).toHaveLength(2);
    const ev = host.drainEvents();
    expect(ofType(ev, 'bondRepaid')).toHaveLength(1);
    expect(ofType(ev, 'bondIssued')).toHaveLength(3);
    expect(ofType(ev, 'insufficientFunds')).toEqual([{ type: 'insufficientFunds', cost: 10000 }]);
  });
  it('预览（bondView / budgetView）不消费 PRNG；issueBond 恰消费一次 next32；作弊码发债不消费', () => {
    const { host, ctx } = mk({ profile, params: { difficulty: 2 } });
    const s0 = ctx.prng.state();
    const bv = host.q.economy.bondView(); host.q.economy.bondView(); host.q.economy.budgetView();
    expect(ctx.prng.state()).toBe(s0);
    expect(bv).toMatchObject({ count: 0, rating: 'AAA', nextRatePctFloor: 4, canIssue: true, canRepay: false });
    const replica = createPrng(s0); replica.next32();
    expect(host.dispatch({ type: 'issueBond' }).ok).toBe(true);
    expect(ctx.prng.state()).toBe(replica.state());
    const issued = ofType(host.drainEvents(), 'bondIssued')[0]!.rateRaw;
    expect(issued).toBeGreaterThanOrEqual(40000); expect(issued).toBeLessThan(50000);
    const s1 = ctx.prng.state();
    expect(host.dispatch({ type: 'cheat', code: 'fund' }).ok).toBe(true);
    expect(ctx.prng.state()).toBe(s1);
    // 1 张 4.x% + 1 张 25%：偿债率 (4xx + 2500) / 10,000 ≈ 0.29 → CCC（spread 3%）；抵押率 0.2 → BBB；取差 CCC → 下一张 = 4% + 2 × 0.25% + 3% = 7.5% → 显示 7
    expect(host.q.economy.bondView()).toMatchObject({ rating: 'CCC', nextRatePctFloor: 7 });
    expect(host.commandLog().map((l) => l.cmd.type)).toEqual(['issueBond', 'cheat']);
  });
  it('评级 F 时 issueBond 拒绝（rating），作弊码仍可发到 50 张上限', () => {
    const { host, state } = mk({ profile });
    for (let k = 0; k < 10; k++) host.dispatch({ type: 'cheat', code: 'fund' });   // 债务 $100,000 / 价值下限 $100,000 = 1.0 → F
    host.drainEvents();
    expect(host.q.economy.bondView()).toMatchObject({ rating: 'F', nextRatePctFloor: null, canIssue: false });
    expect(host.dispatch({ type: 'issueBond' })).toMatchObject({ ok: false, reason: 'locked' });
    expect(ofType(host.drainEvents(), 'bondRefused')).toEqual([{ type: 'bondRefused', reason: 'rating' }]);
    expect(host.dispatch({ type: 'cheat', code: 'fund' }).ok).toBe(true);
    expect(state.economy.bonds).toHaveLength(11);
  });
});

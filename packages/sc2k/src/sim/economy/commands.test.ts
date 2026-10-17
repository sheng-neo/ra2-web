// ===== sim/economy/commands.test.ts =====（CONTRACTS §K 归 economy 的 8 条命令、§I EconomyQuery、§J charge；绑定前回退；作弊码）
import { describe, expect, it } from 'vitest';
import { COMMAND_OWNER } from '../../contracts/commands';
import type { Command } from '../../contracts/commands';
import type { SimEvent } from '../../contracts/events';
import { DisasterKind } from '../../contracts/grid';
import { MISC, miscGet } from '../../contracts/io';
import { OrdinanceId } from '../../contracts/state';
import type { TestContextOptions } from '../../contracts/testkit';
import { createTestContext, runDays } from '../../testkit';
import { createEconomySystem } from './index';

const mk = (opts: TestContextOptions = {}) => createTestContext({ systems: [createEconomySystem()], ...opts });
const ofType = <K extends SimEvent['type']>(evs: SimEvent[], type: K): Extract<SimEvent, { type: K }>[] => evs.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

describe('注册面', () => {
  it('commands 键集合恰为 COMMAND_OWNER 归 economy 者；phases / queries / actions 只填自己的键；声明 priv 者有 postLoad', () => {
    const sys = createEconomySystem();
    const mine = (Object.keys(COMMAND_OWNER) as Command['type'][]).filter((k) => COMMAND_OWNER[k] === 'economy').sort();
    expect(Object.keys(sys.commands ?? {}).sort()).toEqual(mine);
    expect(Object.keys(sys.queries ?? {})).toEqual(['economy']);
    expect(Object.keys(sys.actions ?? {})).toEqual(['charge']);
    expect(Object.keys(sys.phases ?? {}).sort()).toEqual(['budgetWindow', 'closeYear', 'graphs', 'nationalAnnual.economy', 'scenario', 'settleMonth', 'solvency']);
    expect(sys.privVersion).toBe(1); expect(typeof sys.postLoad).toBe('function'); expect(sys.stub).toBeUndefined();
  });
  it('绑定 ctx 之前的查询 / 动作回退到空城作答，不抛错', () => {
    const sys = createEconomySystem();
    const q = sys.queries!.economy!;
    expect(q.canAfford(0)).toBe(true); expect(q.canAfford(1)).toBe(false); expect(q.funding(0)).toBe(0); expect(q.ordinance(OrdinanceId.SalesTax)).toBe(false);
    expect(q.budgetView().rows).toEqual([]); expect(q.bondView().count).toBe(0); expect(q.costOf('roads.road', 3)).toBe(0);
    expect(sys.actions!.charge!(5)).toBe(false); expect(sys.actions!.charge!(0)).toBe(true);
  });
});

describe.each(['optimistic', 'pessimistic'] as const)('命令（%s 桩）', (profile) => {
  it('setTax 夹到 0..20 并同步 11 条产业税率；setIndustryTax 只改一条并反推 taxRate.i；越界目标 noTarget', () => {
    const { host, state } = mk({ profile });
    expect(host.dispatch({ type: 'setTax', rates: { r: 25, c: -3, i: 11 } }).ok).toBe(true);
    expect(state.economy.taxRate).toEqual({ r: 20, c: 0, i: 11 });
    expect(Array.from(state.economy.industryTax)).toEqual(new Array(11).fill(11));
    expect(host.dispatch({ type: 'setIndustryTax', k: 11, rate: 5 })).toMatchObject({ ok: false, reason: 'noTarget' });
    expect(host.dispatch({ type: 'setIndustryTax', k: 10, rate: 0 }).ok).toBe(true);
    expect(state.economy.industryTax[10]).toBe(0);
    expect(state.economy.taxRate.i).toBe(10);                     // ratio 全零 → 均值 (10 × 11 + 0) / 11 = 10
    expect(host.dispatch({ type: 'setFunding', line: 11 as never, pct: 50 })).toMatchObject({ ok: false, reason: 'noTarget' });
    expect(host.dispatch({ type: 'setFunding', line: 3, pct: 150 }).ok).toBe(true);
    expect(state.economy.funding[3]).toBe(100);
    expect(host.q.economy.funding(3)).toBe(100);
    expect(host.commandLog().map((l) => l.cmd.type)).toEqual(['setTax', 'setIndustryTax', 'setFunding']);
  });
  it('setOrdinance：位掩码、ordinance 事件、重复设置无事件、无核区触发 toolbar、非法 id noTarget、年份门控', () => {
    const { host, state } = mk({ profile });
    expect(host.dispatch({ type: 'setOrdinance', id: OrdinanceId.LegalizedGambling, on: true }).ok).toBe(true);
    expect(host.dispatch({ type: 'setOrdinance', id: OrdinanceId.LegalizedGambling, on: true }).ok).toBe(true);
    expect(host.dispatch({ type: 'setOrdinance', id: OrdinanceId.NuclearFreeZone, on: true }).ok).toBe(true);
    expect(host.dispatch({ type: 'setOrdinance', id: 20 as OrdinanceId, on: true })).toMatchObject({ ok: false, reason: 'noTarget' });
    expect(state.economy.ordinances).toBe((1 << OrdinanceId.LegalizedGambling) | (1 << OrdinanceId.NuclearFreeZone));
    expect(host.q.economy.ordinance(OrdinanceId.NuclearFreeZone)).toBe(true); expect(host.q.economy.ordinance(OrdinanceId.SalesTax)).toBe(false);
    const ev = host.drainEvents();
    expect(ofType(ev, 'ordinance')).toEqual([{ type: 'ordinance', id: OrdinanceId.LegalizedGambling, enacted: true }, { type: 'ordinance', id: OrdinanceId.NuclearFreeZone, enacted: true }]);
    expect(ofType(ev, 'toolbar')).toEqual([{ type: 'toolbar', reason: 'ordinance' }]);
    expect(host.dispatch({ type: 'setOrdinance', id: OrdinanceId.LegalizedGambling, on: false }).ok).toBe(true);
    expect(state.economy.ordinances).toBe(1 << OrdinanceId.NuclearFreeZone);
    const gated = mk({ profile, tuning: { economy: { ordinanceYearGate: true } } });
    const def = gated.host.catalogue.ORDINANCES[0]!;
    (def as { availableYear: number }).availableYear = 2500;
    try { expect(gated.host.dispatch({ type: 'setOrdinance', id: def.id, on: true })).toMatchObject({ ok: false, reason: 'notInvented' }); }
    finally { (def as { availableYear: number }).availableYear = 0; }
  });
  it('setOption：autoBudget / autoGoto / noDisasters 写字段；sound / music / paperDelivery / extraPaper 写 rawMisc', () => {
    const { host, state } = mk({ profile });
    for (const key of ['autoBudget', 'autoGoto', 'noDisasters', 'sound', 'music', 'paperDelivery', 'extraPaper'] as const) expect(host.dispatch({ type: 'setOption', key, value: true }).ok).toBe(true);
    expect(state.economy.autoBudget).toBe(true); expect(state.disaster.autoGoto).toBe(true); expect(state.disaster.noDisasters).toBe(true);
    expect(miscGet(state.rawMisc, MISC.sound)).toBe(1); expect(miscGet(state.rawMisc, MISC.music)).toBe(1); expect(miscGet(state.rawMisc, MISC.paperDelivery)).toBe(1); expect(miscGet(state.rawMisc, MISC.extraPaper)).toBe(1);
    expect(host.dispatch({ type: 'setOption', key: 'music', value: false }).ok).toBe(true);
    expect(miscGet(state.rawMisc, MISC.music)).toBe(0);
    expect(miscGet(host.exportSc2().misc, MISC.sound)).toBe(1);
  });
  it('cheat：加钱码 +$250 并恰消费一次 PRNG、按千分比写 disaster.pending = Fire；未知码 noTarget 且不入日志', () => {
    const always = mk({ profile, tuning: { economy: { cheatFirePermille: 1000 } } });
    const s0 = always.ctx.prng.state();
    expect(always.host.dispatch({ type: 'cheat', code: 'cass' }).ok).toBe(true);
    expect(always.state.economy.funds).toBe(20250);
    expect(always.ctx.prng.state()).not.toBe(s0);
    expect(always.state.disaster.pending).toBe(DisasterKind.Fire);
    const never = mk({ profile, tuning: { economy: { cheatFirePermille: 0 } } });
    expect(never.host.dispatch({ type: 'cheat', code: ' CASS ' }).ok).toBe(true);
    expect(never.state.disaster.pending).toBe(DisasterKind.None);
    expect(never.host.dispatch({ type: 'cheat', code: 'porntipsguzzardo' })).toMatchObject({ ok: false, reason: 'noTarget' });
    expect(never.host.commandLog().map((l) => l.cmd.type)).toEqual(['cheat']);
  });
  it('charge / canAfford / costOf：cost ≤ 0 恒真；资金不足 → insufficientFunds 事件并拒绝；负资金时任何正费用都拒绝', () => {
    const { host, state, ctx } = mk({ profile, params: { difficulty: 2 } });
    expect(host.q.economy.canAfford(0)).toBe(true); expect(host.q.economy.canAfford(10000)).toBe(true); expect(host.q.economy.canAfford(10001)).toBe(false);
    expect(ctx.act.charge(-5)).toBe(true); expect(state.economy.funds).toBe(10000);
    expect(ctx.act.charge(4000)).toBe(true); expect(state.economy.funds).toBe(6000);
    expect(ctx.act.charge(6001)).toBe(false); expect(state.economy.funds).toBe(6000);
    expect(ofType(host.drainEvents(), 'insufficientFunds')).toEqual([{ type: 'insufficientFunds', cost: 6001 }]);
    state.economy.funds = -1;
    expect(host.q.economy.canAfford(1)).toBe(false); expect(ctx.act.charge(1)).toBe(false); expect(ctx.act.charge(0)).toBe(true);
    expect(host.q.economy.costOf('roads.road', 5)).toBe(50); expect(host.q.economy.costOf('power.coal', 3)).toBe(4000);
    expect(host.q.economy.costOf('roads.highway', 2)).toBe(200); expect(host.q.economy.costOf('bulldozer.level', 4)).toBe(100);
    expect(host.q.economy.costOf('nature.trees', 9)).toBe(3); expect(host.q.economy.costOf('query', 9)).toBe(0); expect(host.q.economy.costOf('no.such.tool', 1)).toBe(0);
    expect(host.q.economy.year()).toBe(1900);
    runDays(host, 300);
    expect(host.q.economy.year()).toBe(1901);
  });
});

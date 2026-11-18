// ===== sim/economy/runtime.ts =====（系统对象的闭包运行态：绑定的 ctx；预算窗口"取消"用的滑块快照存 priv（见 priv.ts budgetOpenOf，fix-B））
// ctx 由 init / importFrom / postLoad 重新绑定。滑块快照曾放闭包，挂起态快照载入后"取消"失效 —— 现随 priv 进快照。
import type { SimContext } from '../../contracts/system';
import { getTuning } from '../../contracts/system';
import { DEFAULT_ECONOMY_TUNING } from './tuning';
import type { EconomyTuning } from './tuning';
import type { BudgetOpenRec } from './priv';

export interface EconomyRuntime { bound: SimContext | null }

export const createRuntime = (): EconomyRuntime => ({ bound: null });
export const tuningOf = (ctx: SimContext): EconomyTuning => getTuning(ctx, 'economy', DEFAULT_ECONOMY_TUNING);

export function takeBudgetSnapshot(ctx: SimContext): BudgetOpenRec {
  const e = ctx.state.economy;
  return { tax: Int32Array.of(e.taxRate.r, e.taxRate.c, e.taxRate.i), industryTax: Int32Array.from(e.industryTax), funding: Uint8Array.from(e.funding), autoBudget: e.autoBudget };
}
export function restoreBudgetSnapshot(ctx: SimContext, snap: BudgetOpenRec): void {
  const e = ctx.state.economy;
  e.taxRate.r = snap.tax[0]!; e.taxRate.c = snap.tax[1]!; e.taxRate.i = snap.tax[2]!;
  e.industryTax.set(snap.industryTax); e.funding.set(snap.funding); e.autoBudget = snap.autoBudget;
}

// ===== sim/economy/runtime.ts =====（系统对象的闭包运行态：绑定的 ctx、预算窗口"取消"用的滑块快照）
// 这些都不入 priv：ctx 由 init / importFrom / postLoad 重新绑定；滑块快照只在一次挂起期间有意义（重放会重新进入阶段再取一次）。
import type { TaxRates } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { getTuning } from '../../contracts/system';
import { DEFAULT_ECONOMY_TUNING } from './tuning';
import type { EconomyTuning } from './tuning';

export interface BudgetSnapshot { taxRate: TaxRates; industryTax: Int32Array; funding: Uint8Array; autoBudget: boolean }
export interface EconomyRuntime { bound: SimContext | null; snapshot: BudgetSnapshot | null }

export const createRuntime = (): EconomyRuntime => ({ bound: null, snapshot: null });
export const tuningOf = (ctx: SimContext): EconomyTuning => getTuning(ctx, 'economy', DEFAULT_ECONOMY_TUNING);

export function takeBudgetSnapshot(ctx: SimContext): BudgetSnapshot {
  const e = ctx.state.economy;
  return { taxRate: { ...e.taxRate }, industryTax: Int32Array.from(e.industryTax), funding: Uint8Array.from(e.funding), autoBudget: e.autoBudget };
}
export function restoreBudgetSnapshot(ctx: SimContext, snap: BudgetSnapshot): void {
  const e = ctx.state.economy;
  e.taxRate.r = snap.taxRate.r; e.taxRate.c = snap.taxRate.c; e.taxRate.i = snap.taxRate.i;
  e.industryTax.set(snap.industryTax); e.funding.set(snap.funding); e.autoBudget = snap.autoBudget;
}

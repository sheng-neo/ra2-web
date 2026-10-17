// ===== sim/economy/queries.ts =====（CONTRACTS §I EconomyQuery：canAfford / funding / ordinance / year / budgetView / bondView / costOf）
// 全部纯函数、不消费 PRNG。绑定 ctx 之前（app 在新城之前就渲染工具栏）回退到一份私有空城作答，不抛错（与 nullSystem 同口径）。
import type { ToolId } from '../../contracts/catalogue';
import type { BondView, BudgetView, EconomyQuery } from '../../contracts/queries';
import { createCityState, dateOf } from '../../contracts/state';
import type { CityState } from '../../contracts/state';
import { makeBondView } from './bonds';
import { budgetMath, makeBudgetView } from './budget';
import { F_TAX_TOTAL, ensurePriv } from './priv';
import { tuningOf } from './runtime';
import type { EconomyRuntime } from './runtime';

const EMPTY_ADVISORS: ReadonlyArray<{ advisor: string; key: string }> = Object.freeze([]);

function emptyBudgetView(s: CityState): BudgetView {
  const e = s.economy;
  return { rows: [], taxRate: { ...e.taxRate }, funding: Uint8Array.from(e.funding), autoBudget: e.autoBudget, funds: e.funds, openingFunds: e.yearOpeningFunds, endOfYearFunds: e.funds, advisors: EMPTY_ADVISORS };
}
function emptyBondView(s: CityState): BondView {
  const e = s.economy;
  return { bonds: e.bonds.map((b) => ({ ...b, ratePctFloor: Math.floor(b.rateRaw / 10000), annual: Math.floor(b.rateRaw / 100) })), count: e.bonds.length, avgRatePctFloor: 0, sumRatePctFloor: 0, nextRatePctFloor: null, rating: '', cityValueDollars: 0, canIssue: false, canRepay: false };
}

/** 工具费用：按 ToolDef.costUnit —— none → 0；building / click → 单价；tile / segment2x2 / changedTile → 单价 × 单位数。 */
export function costOfTool(catalogue: { toolById(id: ToolId): { cost: number; costUnit: string } | undefined }, tool: ToolId, units: number): number {
  const def = catalogue.toolById(tool);
  if (!def || def.costUnit === 'none') return 0;
  if (def.costUnit === 'building' || def.costUnit === 'click') return def.cost;
  return def.cost * Math.max(0, Math.trunc(units));
}

export function makeQueries(rt: EconomyRuntime): EconomyQuery {
  let fallback: CityState | null = null;
  const stateOf = (): CityState => rt.bound?.state ?? (fallback ??= createCityState());
  return {
    canAfford(cost) { const e = stateOf().economy; return cost <= 0 || (!e.impeached && e.funds >= cost); },
    funding(line) { return stateOf().economy.funding[line as number] ?? 0; },
    ordinance(id) { return ((stateOf().economy.ordinances >>> (id as number)) & 1) === 1; },
    year() { return dateOf(stateOf().clock).year; },
    budgetView() {
      const ctx = rt.bound;
      if (!ctx) return emptyBudgetView(stateOf());
      return makeBudgetView(ctx, ensurePriv(ctx.state), tuningOf(ctx));
    },
    bondView() {
      const ctx = rt.bound;
      if (!ctx) return emptyBondView(stateOf());
      const priv = ensurePriv(ctx.state), tune = tuningOf(ctx);
      return makeBondView(ctx, priv, tune, budgetMath(ctx, priv, tune).next[F_TAX_TOTAL]!);
    },
    costOf(tool, units) { const ctx = rt.bound; return ctx ? costOfTool(ctx.catalogue, tool, units) : 0; },
  };
}

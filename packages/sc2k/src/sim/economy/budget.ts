// ===== sim/economy/budget.ts =====（spec:economy-budget §2.10 预算窗口字段、§3.4 budgetWindowModel；顾问条件 spec:disasters-events §2.11）
// 预算窗口视图模型（纯函数、不写状态、不消费 PRNG）：YTD 列 = 已结月份之和；估计列 = YTD + 剩余月份按当前滑块逐月预览之和。
// 行金额有符号：收入为正、支出为负（债券 / 经费 / 公交固定支出显示为负），cashFlow 行 = 各行之和。
import type { BudgetRow, BudgetView } from '../../contracts/queries';
import { OrdinanceId } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { F_BOND, F_EXPENSE, F_FIXED, F_INCOME, F_LINES, F_NET, F_ORD_NET, F_TAX_TOTAL, LINE_COUNT, MONTHS_PER_YEAR, sumFlows } from './priv';
import type { EconomyPriv } from './priv';
import { bondStats, collectInputs, computeFlow } from './settle';
import type { EconomyInputs } from './settle';
import { BUDGET_LINE_KEYS } from './tuning';
import type { EconomyTuning } from './tuning';

export const ROW_TAXES = 'budget.taxes', ROW_ORDINANCES = 'budget.ordinances', ROW_BONDS = 'budget.bonds', ROW_BUS = 'budget.busFixed', ROW_CASH = 'budget.cashFlow';
export const ADVICE_PREFIX = 'advice.';

export interface BudgetMath {
  inputs: EconomyInputs;
  ytdSum: Int32Array;              // 已结月份之和
  remaining: Int32Array[];         // 剩余月份逐月预览
  remainingSum: Int32Array;
  next: Int32Array;                // 下一个待结月份的预览（评级 / 债券窗口用）
}

/** 一次收集输入并算出 YTD 与剩余估计（预算窗口、债券窗口、发行债券共用）。 */
export function budgetMath(ctx: SimContext, priv: EconomyPriv, tune: EconomyTuning): BudgetMath {
  const e = ctx.state.economy;
  const inputs = collectInputs(ctx, tune);
  const elapsed = Math.min(MONTHS_PER_YEAR, priv.ytd.length);
  const remaining: Int32Array[] = [];
  for (let m = elapsed; m < MONTHS_PER_YEAR; m++) remaining.push(computeFlow(e, inputs, m, tune, ctx.catalogue.ORDINANCES));
  const next = remaining[0] ?? computeFlow(e, inputs, 0, tune, ctx.catalogue.ORDINANCES);
  return { inputs, ytdSum: sumFlows(priv.ytd), remaining, remainingSum: sumFlows(remaining), next };
}

const row = (key: string, ytd: number, estimate: number, slider?: BudgetRow['slider']): BudgetRow => (slider ? { key, ytd, estimate, slider } : { key, ytd, estimate });
/** 支出行取负（避免产生 −0：JSON / 深比较都把它当成另一个值）。 */
const neg = (v: number): number => (v === 0 ? 0 : -v);

/** 预算窗口视图（spec §2.10 表）。 */
export function makeBudgetView(ctx: SimContext, priv: EconomyPriv, tune: EconomyTuning): BudgetView {
  const e = ctx.state.economy;
  const bm = budgetMath(ctx, priv, tune);
  const y = bm.ytdSum, r = bm.remainingSum;
  const rows: BudgetRow[] = [];
  rows.push(row(ROW_TAXES, y[F_TAX_TOTAL]!, y[F_TAX_TOTAL]! + r[F_TAX_TOTAL]!, { value: e.taxRate.r, min: 0, max: tune.maxTaxRate }));
  rows.push(row(ROW_ORDINANCES, y[F_ORD_NET]!, y[F_ORD_NET]! + r[F_ORD_NET]!));
  rows.push(row(ROW_BONDS, neg(y[F_BOND]!), neg(y[F_BOND]! + r[F_BOND]!)));
  for (let line = 0; line < LINE_COUNT; line++) {
    const k = F_LINES + line;
    rows.push(row(`budget.${BUDGET_LINE_KEYS[line]!}`, neg(y[k]!), neg(y[k]! + r[k]!), { value: e.funding[line]!, min: 0, max: 100 }));
  }
  rows.push(row(ROW_BUS, neg(y[F_FIXED]!), neg(y[F_FIXED]! + r[F_FIXED]!)));
  rows.push(row(ROW_CASH, y[F_NET]!, y[F_NET]! + r[F_NET]!));
  return {
    rows,
    taxRate: { ...e.taxRate },
    funding: Uint8Array.from(e.funding),
    autoBudget: e.autoBudget,
    funds: e.funds,
    openingFunds: e.yearOpeningFunds,
    endOfYearFunds: e.funds + r[F_NET]!,
    advisors: selectAdvisors(ctx, tune, bm),
  };
}

/**
 * 8 位顾问各给第一条命中的建议（spec:disasters §2.11 的条件子集：只用本模块与契约查询能拿到的量；污染一条省略）。
 * 返回的 key 为 strings 键 advice.<id>（WP0 文案表无此族键，缺键时 UI 回退显示键名；见 contract-rfc）。
 */
export function selectAdvisors(ctx: SimContext, tune: EconomyTuning, bm: BudgetMath): ReadonlyArray<{ advisor: string; key: string }> {
  const s = ctx.state, e = s.economy, out: { advisor: string; key: string }[] = [];
  const on = (id: OrdinanceId): boolean => ((e.ordinances >>> id) & 1) === 1;
  const add = (advisor: string, id: string): void => { out.push({ advisor, key: ADVICE_PREFIX + id }); };
  const est = new Int32Array(bm.ytdSum.length);
  for (let k = 0; k < est.length; k++) est[k] = bm.ytdSum[k]! + bm.remainingSum[k]!;
  const pop = s.census.normalPop;
  const st = bondStats(e);
  const fedPct = e.fedRateRaw / 10000, avgPct = st.avgRaw / 10000;
  const crime = Math.ceil(ctx.q.services.graphCurrent('crime') / tune.graphCrimeScale);
  const le = s.demographics.workforceLE;
  const sc = bm.inputs.structures;
  // Bonds
  if (st.count > 0 && avgPct > fedPct + 3) add('bonds', 'bondsCostly');
  else if (st.count >= 10) add('bonds', 'bondsCutBack');
  else if (fedPct <= 4 && e.funds < 5000) add('bonds', 'bondsGoodRates');
  else if (e.funds < 2000 && st.count < 3) add('bonds', 'bondsExpand');
  // Police
  if (crime > 60) add('police', 'policeOutOfControl');
  else if (crime > 40 && !on(OrdinanceId.NeighborhoodWatch)) add('police', 'policeNeighborhoodWatch');
  else if (crime >= 20) add('police', 'policeAverage');
  else add('police', 'policeLow');
  // Fire
  if (sc.fire < pop / 20000) add('fire', 'fireNeedMore');
  else if (sc.fire < pop / 15000 + 1) add('fire', 'fireAdequate');
  else add('fire', 'fireExcellent');
  // Taxes
  const maxRate = Math.max(e.taxRate.r, e.taxRate.c, e.taxRate.i), minRate = Math.min(e.taxRate.r, e.taxRate.c, e.taxRate.i);
  if (est[F_EXPENSE]! > est[F_INCOME]! && e.funds < 0) add('taxes', 'taxesCutSpending');
  else if (minRate < 5 && e.funds < 0) add('taxes', 'taxesRaise');
  else if (maxRate > 9) add('taxes', 'taxesLower');
  // Ordinances
  if (ctx.q.utilities.lastPower().usagePct > 90 && !on(OrdinanceId.EnergyConservation)) add('ordinances', 'ordinanceEnergyConservation');
  else if (crime > 40 && !on(OrdinanceId.AntiDrug)) add('ordinances', 'ordinanceAntiDrug');
  else if (crime > 60 && on(OrdinanceId.LegalizedGambling)) add('ordinances', 'ordinanceDropGambling');
  else if (s.demand.r < -500 && on(OrdinanceId.IncomeTax)) add('ordinances', 'ordinanceDropIncomeTax');
  else if (s.demand.c < -500 && on(OrdinanceId.SalesTax)) add('ordinances', 'ordinanceDropSalesTax');
  // Health
  if (sc.hospital < pop / 25000 || le < 60) add('health', 'healthNeedMore');
  else if (le < 70 && !on(OrdinanceId.FreeClinics)) add('health', 'healthFreeClinics');
  else if (le < 70 && !on(OrdinanceId.CprTraining)) add('health', 'healthCprTraining');
  else if (le < 70 && !on(OrdinanceId.SmokingBan)) add('health', 'healthSmokingBan');
  else if (le < 75) add('health', 'healthAdequate');
  else add('health', 'healthExcellent');
  // Education
  if (sc.school < pop / 20000) add('education', 'educationNeedSchools');
  else if (sc.college < pop / 50000) add('education', 'educationNeedColleges');
  else add('education', 'educationAdequate');
  // Transit
  const developed = s.totals.developedTiles;
  if (developed > 0 && bm.inputs.transit.roadTiles > developed / 2) add('transit', 'transitTooManyRoads');
  else if (s.traffic.graph > 60 && e.funds < 10000) add('transit', 'transitFloatBond');
  else add('transit', 'transitFine');
  return out;
}

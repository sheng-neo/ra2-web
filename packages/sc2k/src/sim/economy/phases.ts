// ===== sim/economy/phases.ts =====（spec:economy-budget §2.3.1 第 0 / 21 / 22 天的 economy 阶段、§3.3 settleMonth、§3.4 closeYear / nationalAnnual / budgetWindow、§2.11 破产）
// 归 economy 的阶段：settleMonth → closeYear → nationalAnnual.economy → budgetWindow（第 0 天）、graphs（第 21 天）、scenario / solvency（第 22 天）。
// PRNG：只有 nationalAnnual.economy 消费一次 prng.int(Σ权重)；其余阶段不消费。可挂起：closeYear / solvency（gameOver）、budgetWindow（budget）。
import type { BudgetLine } from '../../contracts/state';
import { dateOf } from '../../contracts/state';
import type { PhaseResult, SimContext, System } from '../../contracts/system';
import { makeBudgetView } from './budget';
import { pushGraphs } from './graphs';
import {
  F_NET, F_ORD_NET, FLOW_LEN, LINE_COUNT, MONTHS_PER_YEAR, Y_CLOSING, Y_ISSUED, Y_MONTHS, Y_OPENING, Y_REPAID, Y_TOTALS, Y_YEAR, YEAR_LEN,
  ensurePriv, histBond, histLine, histOrd, histTax, sumFlows, yearView,
} from './priv';
import type { EconomyPriv } from './priv';
import { takeBudgetSnapshot, tuningOf } from './runtime';
import type { EconomyRuntime } from './runtime';
import { bondStats, collectInputs, computeFlow, enactedCount, weightedIndustryTax } from './settle';
import { FIRST_TRANSIT_LINE, clampInt, clampInt32 } from './tuning';
import type { EconomyTuning } from './tuning';

/** 弹劾：置观察模式标志、发 impeached 事件并打开 gameOver 模态（挂起）。已弹劾则不重复。 */
export function impeach(ctx: SimContext, priv: EconomyPriv): PhaseResult {
  const e = ctx.state.economy;
  if (e.impeached) return 'done';
  e.impeached = true;
  priv.negYears = 0;
  ctx.act.emit({ type: 'impeached', funds: e.funds });
  ctx.act.emit({ type: 'modal', id: 'gameOver', payload: { funds: e.funds, year: dateOf(ctx.state.clock).year } });
  return 'suspend';
}

/** 破产判定（spec §2.11）：funds < 阈值 → 弹劾；yearEnd 时另按连续负资金年数判定。 */
export function checkSolvency(ctx: SimContext, priv: EconomyPriv, tune: EconomyTuning, yearEnd: boolean): PhaseResult {
  const e = ctx.state.economy;
  if (e.impeached) return 'done';
  if (e.funds < tune.impeachFundsThreshold) return impeach(ctx, priv);
  if (yearEnd && tune.impeachYears > 0) {
    priv.negYears = e.funds < 0 ? priv.negYears + 1 : 0;
    if (priv.negYears >= tune.impeachYears) return impeach(ctx, priv);
  }
  return 'done';
}

/** 第 0 天 settleMonth（spec §3.3）：结算上个月；1 月第 0 天结算去年 12 月。 */
export function settleMonth(ctx: SimContext): PhaseResult {
  const s = ctx.state, e = s.economy;
  if (s.clock.age === 0) return 'done';
  const tune = tuningOf(ctx), priv = ensurePriv(s);
  const m = (dateOf(s.clock).month + 11) % 12;
  const inp = collectInputs(ctx, tune);
  const flow = computeFlow(e, inp, m, tune, ctx.catalogue.ORDINANCES);
  e.taxRate.i = weightedIndustryTax(e.industryTax, inp.ratio);
  const anyAd = ctx.catalogue.ORDINANCES.some((d) => d.advertising === true && ((e.ordinances >>> d.id) & 1) === 1);
  e.counters.advertising = clampInt(e.counters.advertising + (anyAd ? 1 : -1), 0, tune.advertisingCounterMax);
  e.funds = clampInt32(e.funds + flow[F_NET]!);
  // 账本（环形，索引 m）
  const h = priv.hist;
  h[histTax(0, m)] = inp.taxable.r; h[histTax(0, m) + 1] = e.taxRate.r;
  h[histTax(1, m)] = inp.taxable.c; h[histTax(1, m) + 1] = e.taxRate.c;
  h[histTax(2, m)] = inp.taxable.i; h[histTax(2, m) + 1] = e.taxRate.i;
  for (let line = 0; line < LINE_COUNT; line++) { h[histLine(line, m)] = inp.lineCount[line]!; h[histLine(line, m) + 1] = e.funding[line]!; }
  const bs = bondStats(e);
  h[histBond(m)] = bs.count; h[histBond(m) + 1] = bs.avgRaw;
  h[histOrd(m)] = enactedCount(e.ordinances); h[histOrd(m) + 1] = flow[F_ORD_NET]!;
  if (priv.ytd.length >= MONTHS_PER_YEAR) priv.ytd.shift();
  priv.ytd.push(flow);
  // 事件（只有两类是本模块自判的）
  for (let line: number = FIRST_TRANSIT_LINE; line < LINE_COUNT; line++) {
    const bit = 1 << line;
    if (e.funding[line]! < tune.underfundedThreshold && inp.lineCount[line]! > 0 && (priv.underfunded & bit) === 0) {
      priv.underfunded |= bit;
      ctx.act.emit({ type: 'underfunded', line: line as BudgetLine });
    }
  }
  const r = Math.max(e.taxRate.r, e.taxRate.c, e.taxRate.i);
  if (r >= tune.taxGripeRate && !priv.taxGripe) { priv.taxGripe = true; ctx.act.emit({ type: 'taxGripe', rate: r, severe: r >= tune.taxGripeSevereRate }); }
  ctx.act.emit({ type: 'monthSettled', funds: e.funds, net: flow[F_NET]! });
  return 'done';
}

/** 1 月第 0 天 closeYear（spec §3.4）：生成年报摘要、清 ytd 与年内计数、弹劾判定。 */
export function closeYear(ctx: SimContext): PhaseResult {
  const s = ctx.state, e = s.economy, tune = tuningOf(ctx), priv = ensurePriv(s);
  const report = new Int32Array(YEAR_LEN);
  report[Y_YEAR] = dateOf(s.clock).year - 1; report[Y_OPENING] = e.yearOpeningFunds; report[Y_CLOSING] = e.funds;
  report[Y_ISSUED] = priv.issued; report[Y_REPAID] = priv.repaid; report[Y_MONTHS] = priv.ytd.length;
  report.set(sumFlows(priv.ytd).subarray(0, FLOW_LEN), Y_TOTALS);
  priv.lastYear = report;
  priv.ytd = [];
  e.yearOpeningFunds = e.funds;
  priv.issued = 0; priv.repaid = 0; priv.underfunded = 0; priv.taxGripe = false;
  if (tune.impeachCheck === 'yearEnd') return checkSolvency(ctx, priv, tune, true);
  return 'done';
}

/** 1 月第 0 天 nationalAnnual.economy（spec §2.6 / §3.4）：联邦基准利率随机游走（恰消费一次 PRNG）。 */
export function nationalAnnualEconomy(ctx: SimContext): PhaseResult {
  const s = ctx.state, e = s.economy, tune = tuningOf(ctx), B = tune.bonds;
  let total = 0;
  for (const w of B.fedStepWeights) total += w;
  const r = ctx.prng.int(total);
  let acc = 0, step = 0;
  for (let k = 0; k < B.fedSteps.length; k++) { acc += B.fedStepWeights[k] ?? 0; if (r < acc) { step = B.fedSteps[k]!; break; } }
  const trend = s.national.trend;
  const adj = trend === 2 ? B.fedTrendAdjRaw : trend === 0 ? -B.fedTrendAdjRaw : 0;
  const next = clampInt(e.fedRateRaw + step + adj, B.fedMinRaw, B.fedMaxRaw);
  if (next !== e.fedRateRaw) ctx.act.emit({ type: 'fedRate', direction: next > e.fedRateRaw ? 'up' : 'down', rateRaw: next });
  e.fedRateRaw = next;
  return 'done';
}

/** 1 月第 0 天 budgetWindow（spec §3.4）：yearClosed 始终发出；非自动预算时打开模态窗并挂起。 */
export function budgetWindow(ctx: SimContext, rt: EconomyRuntime): PhaseResult {
  const s = ctx.state, e = s.economy, priv = ensurePriv(s), tune = tuningOf(ctx);
  ctx.act.emit({ type: 'yearClosed', year: dateOf(s.clock).year - 1 });
  if (e.autoBudget) return 'done';
  rt.snapshot = takeBudgetSnapshot(ctx);
  const view = makeBudgetView(ctx, priv, tune);
  ctx.act.emit({ type: 'budgetWindow' });
  ctx.act.emit({ type: 'modal', id: 'budget', payload: { view: { ...view, funding: Array.from(view.funding) }, lastYear: yearView(priv.lastYear) } });
  return 'suspend';
}

export function makePhases(rt: EconomyRuntime): NonNullable<System['phases']> {
  return {
    settleMonth: (ctx) => settleMonth(ctx),
    closeYear: (ctx) => closeYear(ctx),
    'nationalAnnual.economy': (ctx) => nationalAnnualEconomy(ctx),
    budgetWindow: (ctx) => budgetWindow(ctx, rt),
    graphs: (ctx) => { pushGraphs(ctx, tuningOf(ctx)); return 'done'; },
    /** [v2] 情景评估（spec §2.16）：v1 无情景状态，空转。 */
    scenario: () => 'done',
    /** 第 22 天破产月检（core 只在 impeachMonthly 时调用）。 */
    solvency: (ctx) => checkSolvency(ctx, ensurePriv(ctx.state), tuningOf(ctx), false),
  };
}

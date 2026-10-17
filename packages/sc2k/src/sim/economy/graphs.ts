// ===== sim/economy/graphs.ts =====（spec:economy-budget §2.14 统计量、spec:file-formats §2.4.2 XGRP 16 × 52 × i32）
// 第 21 天 graphs 阶段：16 条序列各推一个月值；6 月 / 12 月推半年值；year % 5 == 0 的 12 月推五年值。
// 每段按时间顺序存放（最旧在前、最新在末，推入 = 左移一格后写末尾）。值由各所有者提供，本模块只缩放与推送。不消费 PRNG。
import type { SimContext } from '../../contracts/system';
import { dateOf } from '../../contracts/state';
import type { EconomyTuning } from './tuning';

export const GRAPH_SERIES = 16, GRAPH_LEN = 52;
export const SEG_MONTH = 0, SEG_MONTH_LEN = 12;       // 12 个月
export const SEG_HALF = 12, SEG_HALF_LEN = 20;        // 20 个半年
export const SEG_FIVE = 32, SEG_FIVE_LEN = 20;        // 20 个五年
/** 序列顺序（spec:file-formats §2.4.2）。 */
export const enum GraphSeries { CitySize = 0, Residents, Commerce, Industry, Traffic, Pollution, Value, Crime, PowerPct, WaterPct, Health, Education, Unemployment, Gnp, NatPop, FedRate }
export const HALF_YEAR_MONTHS: ReadonlySet<number> = new Set([5, 11]);
export const FIVE_YEAR_MONTH = 11, FIVE_YEAR_PERIOD = 5;

/** 序列 s、段起点 seg、段长 len 的第 k 个槽（k = len − 1 为最新）。 */
export const graphSlot = (s: number, seg: number, k: number): number => s * GRAPH_LEN + seg + k;
/** 某段最新值。 */
export const graphLatest = (xgrp: Int32Array, s: number, seg: number, len: number): number => xgrp[graphSlot(s, seg, len - 1)]!;

const ceilDiv = (a: number, b: number): number => Math.ceil(a / b);

/** 16 条序列的当前值（缩放后整数）。 */
export function currentGraphValues(ctx: SimContext, tune: EconomyTuning): Int32Array {
  const s = ctx.state, out = new Int32Array(GRAPH_SERIES);
  out[GraphSeries.CitySize] = s.census.citySize;
  out[GraphSeries.Residents] = s.census.res;
  out[GraphSeries.Commerce] = s.census.com;
  out[GraphSeries.Industry] = s.census.ind;
  out[GraphSeries.Traffic] = ctx.q.services.trafficReport().total;
  out[GraphSeries.Pollution] = ctx.q.services.graphCurrent('pollution');
  out[GraphSeries.Value] = ceilDiv(ctx.q.services.graphCurrent('landValue'), tune.graphValueScale);
  out[GraphSeries.Crime] = ceilDiv(ctx.q.services.graphCurrent('crime'), tune.graphCrimeScale);
  out[GraphSeries.PowerPct] = ctx.q.utilities.lastPower().usagePct;
  out[GraphSeries.WaterPct] = ctx.q.utilities.lastWater().usagePct;
  out[GraphSeries.Health] = s.demographics.workforceLE;
  out[GraphSeries.Education] = s.demographics.workforceEQ;
  out[GraphSeries.Unemployment] = s.census.unemploymentPct;
  out[GraphSeries.Gnp] = s.national.value;
  out[GraphSeries.NatPop] = s.national.population;
  out[GraphSeries.FedRate] = Math.floor(s.economy.fedRateRaw / 10000);
  return out;
}

/** 推入一段：左移一格、末尾写新值。 */
export function pushSegment(xgrp: Int32Array, series: number, seg: number, len: number, v: number): void {
  const base = series * GRAPH_LEN + seg;
  for (let k = 0; k < len - 1; k++) xgrp[base + k] = xgrp[base + k + 1]!;
  xgrp[base + len - 1] = v | 0;
}

/** graphs 阶段本体。 */
export function pushGraphs(ctx: SimContext, tune: EconomyTuning): void {
  const xgrp = ctx.state.xgrp;
  const v = currentGraphValues(ctx, tune);
  const { month, year } = dateOf(ctx.state.clock);
  const half = HALF_YEAR_MONTHS.has(month);
  const five = month === FIVE_YEAR_MONTH && year % FIVE_YEAR_PERIOD === 0;
  for (let s = 0; s < GRAPH_SERIES; s++) {
    pushSegment(xgrp, s, SEG_MONTH, SEG_MONTH_LEN, v[s]!);
    if (half) pushSegment(xgrp, s, SEG_HALF, SEG_HALF_LEN, v[s]!);
    if (five) pushSegment(xgrp, s, SEG_FIVE, SEG_FIVE_LEN, v[s]!);
  }
}

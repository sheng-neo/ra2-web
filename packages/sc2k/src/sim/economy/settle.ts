// ===== sim/economy/settle.ts =====（spec:economy-budget §2.4 税收、§2.5 法令金额、§2.7–§2.8 经费与维护费、§3.3 月结算伪代码）
// 纯计算：从 ctx 收集只读输入（census.taxable*、industry.ratio、counts.tile 推出的设施数、交通格数）→ 一个月的现金流 MonthlyFlow。
// 不消费 PRNG、不写状态；settleMonth 阶段（phases.ts）与预算窗口估计列（budget.ts）共用同一函数，保证"账本与估计同一口径"。
import type { OrdinanceDef } from '../../contracts/catalogue';
import { FOOTPRINT } from '../../contracts/footprint';
import { isBridge, isHighway, isPortal, isRail, isSubwayUnd } from '../../contracts/net';
import type { CityState, EconomyState } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { F_BOND, F_EXPENSE, F_FIXED, F_INCOME, F_LINES, F_NET, F_ORD, F_ORD_NET, F_TAX_C, F_TAX_I, F_TAX_R, F_TAX_TOTAL, FLOW_LEN, LINE_COUNT, ORDINANCE_COUNT } from './priv';
import type { EconomyTuning } from './tuning';

/** 年额按月切分：12 份之和恰等于 annual，无状态（spec §3.3）。 */
export const splitMonthly = (annual: number, m: number): number => Math.floor((annual * (m + 1)) / 12) - Math.floor((annual * m) / 12);
/** 每张债券的年息 = ⌊rateRaw / 100⌋（= 10,000 × rateRaw / 1,000,000）。 */
export const annualInterest = (rateRaw: number): number => Math.floor(rateRaw / 100);

/** 有经费线 / 固定支出的设施 XBLD（spec §2.7 / §2.8）。 */
export const XBLD_ID = { police: 0xd2, prison: 0xd8, fire: 0xd3, hospital: 0xd1, school: 0xd6, college: 0xd9, busDepot: 0xec, railDepot: 0xed, subStation: 0xe9, subRailLo: 0x6c, subRailHi: 0x6f, portalLo: 0x3f, portalHi: 0x42 } as const;

export interface StructureCounts { police: number; prison: number; fire: number; hospital: number; school: number; college: number; busDepot: number }
export interface TransitCounts { roadTiles: number; highwayTiles: number; bridgeTiles: number; railTiles: number; railDepots: number; subwayTiles: number; subwayStations: number; tunnelTiles: number }
export interface EconomyInputs {
  taxable: { r: number; c: number; i: number };   // census.taxable*（含巨型住区份额，zones 第 21 天定稿）
  ratio: Int32Array;                              // 11 产业占比（Σ = 100；全零时视为均匀）
  structures: StructureCounts;
  transit: TransitCounts;
  lineCount: Int32Array;                          // 11：各线"当前数量"（账本 / MISC 块首字）
  lineCentsAt100: Int32Array;                     // 11：100% 资金率时的年费用（分）
  fixedCentsAnnual: number;                       // 公交站固定支出（分 / 年）
}

/** 按座数：格计数 ÷ 占地面积（以 counts.tile 为准，spec §4.13"不等时以 tileCounts 为准"）。 */
export const seatsOf = (state: CityState, id: number): number => {
  const n = FOOTPRINT[id] ?? 1;
  return Math.floor(state.counts.tile[id]! / (n * n));
};

/** 由 counts.tile 推出的设施数（services 的 structureCounts 只在导出时用于对账）。 */
export function structureCountsFromTiles(state: CityState): StructureCounts {
  return {
    police: seatsOf(state, XBLD_ID.police), prison: seatsOf(state, XBLD_ID.prison), fire: seatsOf(state, XBLD_ID.fire), hospital: seatsOf(state, XBLD_ID.hospital),
    school: seatsOf(state, XBLD_ID.school), college: seatsOf(state, XBLD_ID.college), busDepot: seatsOf(state, XBLD_ID.busDepot),
  };
}

/** 地下层一次扫描：地铁格数（XUND）与隧道内部格数（tunnelLevels ≠ 0）。 */
export function countUnderground(state: CityState): { subwayTiles: number; tunnelInterior: number } {
  const xund = state.layers.xund, tl = state.layers.tunnelLevels;
  let subwayTiles = 0, tunnelInterior = 0;
  for (let i = 0; i < xund.length; i++) {
    if (isSubwayUnd(xund[i]!)) subwayTiles++;
    if (tl[i] !== 0) tunnelInterior++;
  }
  return { subwayTiles, tunnelInterior };
}

/** 交通六线的计数口径（spec:transport §2.4 / §2.15；道路 / 高速 / 桥由 transport 的 roadTileCounts 给出）。 */
export function transitCounts(ctx: SimContext): TransitCounts {
  const s = ctx.state, tile = s.counts.tile;
  const rc = ctx.q.transport.roadTileCounts();
  let railTiles = 0, subwayStations = tile[XBLD_ID.subStation]!, portalTiles = 0;
  for (let id = 0; id < 256; id++) {
    const n = tile[id]!;
    if (n === 0) continue;
    if (id >= XBLD_ID.subRailLo && id <= XBLD_ID.subRailHi) { subwayStations += n; continue; }
    if (isRail(id) && !isHighway(id) && !isBridge(id)) railTiles += n;
    if (isPortal(id)) portalTiles += n;
  }
  const ug = countUnderground(s);
  return {
    roadTiles: rc.roadTiles, highwayTiles: rc.highwayTiles, bridgeTiles: rc.bridgeTiles,
    railTiles, railDepots: seatsOf(s, XBLD_ID.railDepot),
    subwayTiles: ug.subwayTiles, subwayStations,
    tunnelTiles: portalTiles + ug.tunnelInterior,
  };
}

/** 收集一次结算 / 估计所需的全部只读输入。 */
export function collectInputs(ctx: SimContext, tune: EconomyTuning): EconomyInputs {
  const s = ctx.state;
  const structures = structureCountsFromTiles(s);
  const transit = transitCounts(ctx);
  const U = tune.serviceUnitCents, T = tune.transitUnitCents, k = tune.transitCostScale;
  const lineCount = new Int32Array(LINE_COUNT), lineCentsAt100 = new Int32Array(LINE_COUNT);
  const set = (line: number, count: number, cents: number): void => { lineCount[line] = count; lineCentsAt100[line] = Math.floor(cents); };
  set(0, structures.police + structures.prison, structures.police * U.police + structures.prison * U.prison);
  set(1, structures.fire, structures.fire * U.fire);
  set(2, structures.hospital, structures.hospital * U.hospital);
  set(3, structures.school, structures.school * U.school);
  set(4, structures.college, structures.college * U.college);
  set(5, transit.roadTiles, transit.roadTiles * T.roadTile * k);
  set(6, transit.highwayTiles, transit.highwayTiles * T.highwayTile * k);
  set(7, transit.bridgeTiles, transit.bridgeTiles * T.bridgeTile * k);
  set(8, transit.railTiles, (transit.railTiles * T.railTile + transit.railDepots * T.railDepot) * k);
  set(9, transit.subwayTiles, (transit.subwayTiles * T.subwayTile + transit.subwayStations * T.subwayStation) * k);
  set(10, transit.tunnelTiles, transit.tunnelTiles * T.tunnelTile * k);
  return {
    taxable: { r: s.census.taxableRes, c: s.census.taxableCom, i: s.census.taxableInd },
    ratio: s.industry.ratio,
    structures, transit, lineCount, lineCentsAt100,
    fixedCentsAnnual: structures.busDepot * U.busDepot,
  };
}

/** 加权工业税率 × 100（0..2000）：Σ ratio_k × tax_k（Σ ratio = 100）；ratio 全零时按 11 产业均值。 */
export function weightedIndustryTaxX100(industryTax: Int32Array, ratio: Int32Array): number {
  let sumRatio = 0, acc = 0, sumTax = 0;
  for (let k = 0; k < LINE_COUNT; k++) { sumRatio += ratio[k]!; acc += ratio[k]! * industryTax[k]!; sumTax += industryTax[k]!; }
  return sumRatio > 0 ? Math.floor((acc * 100) / sumRatio) : Math.floor((sumTax * 100) / LINE_COUNT);
}
/** 存档 / 显示用的加权工业税率（MISC 0x0854 首字旁的"当前税率"）。 */
export const weightedIndustryTax = (industryTax: Int32Array, ratio: Int32Array): number => Math.round(weightedIndustryTaxX100(industryTax, ratio) / 100);

/** 某线的年费用（美元）= ⌊分 × 资金率 / 100 / 100⌋。 */
export const annualLineCost = (centsAt100: number, funding: number): number => Math.floor((centsAt100 * funding) / 10000);

/**
 * 一个月的现金流（spec §3.3 第 1–5 步）：m = 被结算的月份 0..11（决定 splitMonthly 的份额）。
 * 税收按月、按人头；法令逐条向下取整；经费 = 数量 × 单价 × 资金率 按月切分；债券按各自利率付息。
 */
export function computeFlow(e: EconomyState, inp: EconomyInputs, m: number, tune: EconomyTuning, ordinances: readonly OrdinanceDef[]): Int32Array {
  const f = new Int32Array(FLOW_LEN);
  const D = tune.taxDivisor;
  const taxR = Math.floor((e.taxRate.r * inp.taxable.r) / D);
  const taxC = Math.floor((e.taxRate.c * inp.taxable.c) / D);
  const taxI = Math.floor((inp.taxable.i * weightedIndustryTaxX100(e.industryTax, inp.ratio)) / (100 * D));
  const taxTotal = taxR + taxC + taxI;
  f[F_TAX_R] = taxR; f[F_TAX_C] = taxC; f[F_TAX_I] = taxI; f[F_TAX_TOTAL] = taxTotal;
  let ordNet = 0;
  for (const def of ordinances) {
    if (def.id < 0 || def.id >= ORDINANCE_COUNT || def.money === null || ((e.ordinances >>> def.id) & 1) === 0) continue;
    const base = def.money.base === 'All' ? taxTotal : def.money.base === 'R' ? taxR : def.money.base === 'C' ? taxC : taxI;
    const amount = def.money.sign * Math.floor((base * def.money.pct.num) / (def.money.pct.den * 100));
    f[F_ORD + def.id] = amount; ordNet += amount;
  }
  f[F_ORD_NET] = ordNet;
  let linesTotal = 0;
  for (let line = 0; line < LINE_COUNT; line++) {
    const v = splitMonthly(annualLineCost(inp.lineCentsAt100[line]!, e.funding[line]!), m);
    f[F_LINES + line] = v; linesTotal += v;
  }
  const fixed = splitMonthly(Math.floor(inp.fixedCentsAnnual / 100), m);
  let bondInterest = 0;
  for (const b of e.bonds) bondInterest += splitMonthly(annualInterest(b.rateRaw), m);
  f[F_FIXED] = fixed; f[F_BOND] = bondInterest;
  const income = taxTotal + Math.max(ordNet, 0);
  const expense = linesTotal + fixed + bondInterest + Math.max(-ordNet, 0);
  f[F_INCOME] = income; f[F_EXPENSE] = expense; f[F_NET] = income - expense;
  return f;
}

/** 当前生效法令数（popcount 低 20 位）。 */
export function enactedCount(mask: number): number {
  let n = 0;
  for (let k = 0; k < ORDINANCE_COUNT; k++) if (((mask >>> k) & 1) === 1) n++;
  return n;
}
/** 债券平均利率（raw，向下取整）与总和。 */
export function bondStats(e: EconomyState): { count: number; sumRaw: number; avgRaw: number } {
  let sumRaw = 0;
  for (const b of e.bonds) sumRaw += b.rateRaw;
  const count = e.bonds.length;
  return { count, sumRaw, avgRaw: count > 0 ? Math.floor(sumRaw / count) : 0 };
}

// ===== sim/economy/bonds.ts =====（spec:economy-budget §2.6 债券、§3.5 债券操作伪代码、spec:services §2.10.2 城市价值公式）
// 信用评级 / 下一张利率 / 发行 / 偿还 / 债券窗口视图。预览（bondView、nextBondRateRaw(jitter = 0)）不消费 PRNG；只有真正发行时抽一次 prng.int(jitterRaw)。
import type { CatalogueApi } from '../../contracts/catalogue';
import { FOOTPRINT } from '../../contracts/footprint';
import { isBridge, isHighway, isPortal, isPowerCarrier, isRail, isRoad } from '../../contracts/net';
import type { BondView } from '../../contracts/queries';
import type { CityState, EconomyState } from '../../contracts/state';
import { dateOf } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { F_TAX_TOTAL, Y_TOTALS } from './priv';
import type { EconomyPriv } from './priv';
import { annualInterest, bondStats, countUnderground, XBLD_ID } from './settle';
import { CREDIT_RATINGS, clampInt, clampInt32 } from './tuning';
import type { CreditRating, EconomyTuning } from './tuning';

/** 城市价值估算（spec:services §2.10.2 的公式，按 counts.tile 逐 id 累加；services 若日后提供查询可替换）。 */
export function cityValueEstimate(state: CityState, catalogue: CatalogueApi): number {
  const tile = state.counts.tile;
  let dollars = 0;
  for (let id = 1; id < 256; id++) {
    const n = tile[id]!;
    if (n === 0) continue;
    if (id === XBLD_ID.subStation || (id >= XBLD_ID.subRailLo && id <= XBLD_ID.subRailHi)) { dollars += n * 250; continue; }
    if (isBridge(id) || isHighway(id)) { dollars += n * 100; continue; }
    if (isPortal(id)) { dollars += n * 15; continue; }
    if (isRoad(id)) { dollars += n * 10; continue; }
    if (isRail(id)) { dollars += n * 25; continue; }
    if (isPowerCarrier(id)) { dollars += n * 2; continue; }
    const def = catalogue.BUILDINGS[id];
    if (!def || def.cost <= 0 || def.zone !== undefined || def.category === 'tree' || def.transition !== undefined) continue;
    const s = FOOTPRINT[id] ?? 1;
    dollars += Math.floor((n * def.cost) / (s * s));
  }
  dollars += countUnderground(state).subwayTiles * 100;
  return dollars;
}

export function cityValueDollars(ctx: SimContext, tune: EconomyTuning): number {
  if (tune.bonds.cityValueMode === 'landValue') return Math.floor(ctx.q.services.graphCurrent('landValue') / 2) * 1000;
  return cityValueEstimate(ctx.state, ctx.catalogue);
}

/** 分档：x 落在第几档（0 = 最好；tiers.length = 最差 F）。 */
export function tierIndex(tiers: readonly number[], x: number): number {
  for (let k = 0; k < tiers.length; k++) if (x < tiers[k]!) return k;
  return tiers.length;
}

/** 信用评级 = worse(偿债率档, 抵押率档)（spec §2.6 建议式 [低]）。 */
export function creditRating(e: EconomyState, annualTax: number, cityValue: number, tune: EconomyTuning): CreditRating {
  const debt = tune.bonds.face * e.bonds.length;
  let debtService = 0;
  for (const b of e.bonds) debtService += annualInterest(b.rateRaw);
  const i1 = tierIndex(tune.bonds.dsrTiers, debtService / Math.max(annualTax, tune.bonds.ratingTaxFloor, 1));
  const i2 = tierIndex(tune.bonds.collateralTiers, debt / Math.max(cityValue, tune.bonds.ratingValueFloor, 1));
  return CREDIT_RATINGS[Math.min(CREDIT_RATINGS.length - 1, Math.max(i1, i2))]!;
}

/** 下一张债券利率（raw）；评级 F → null。预览 jitter = 0，发行时 jitter = prng.int(jitterRaw)。 */
export function nextBondRateRaw(e: EconomyState, rating: CreditRating, jitter: number, tune: EconomyTuning): number | null {
  const spread = tune.bonds.spreadRaw[rating];
  if (!Number.isFinite(spread)) return null;
  return clampInt(e.fedRateRaw + tune.bonds.perBondSpreadRaw * e.bonds.length + spread + jitter, tune.bonds.minRaw, tune.bonds.maxRaw);
}

/** 评级用的"年税收"：有去年年报用其实际，否则用本月预览 × 12。 */
export function annualTaxForRating(priv: EconomyPriv, previewTaxTotal: number): number {
  return priv.lastYear.length > 0 ? priv.lastYear[Y_TOTALS + F_TAX_TOTAL]! : previewTaxTotal * 12;
}

export type IssueRefusal = 'max' | 'rating';
export interface IssueOptions { rateRaw?: number; bypassRating?: boolean }
/**
 * 发行一张（可重放命令）：先查张数上限（不消费 PRNG），再查评级（F 拒发），只有真正发行才抽一次 jitter。
 * 返回利率 raw 或拒绝原因；调用方负责 funds / priv.issued / 事件。
 */
export function pickIssueRate(ctx: SimContext, priv: EconomyPriv, tune: EconomyTuning, previewTaxTotal: number, opt?: IssueOptions): { ok: true; rateRaw: number } | { ok: false; reason: IssueRefusal } {
  const e = ctx.state.economy;
  if (e.bonds.length >= tune.bonds.max) return { ok: false, reason: 'max' };
  if (opt?.rateRaw !== undefined) return { ok: true, rateRaw: clampInt(opt.rateRaw, tune.bonds.minRaw, tune.bonds.maxRaw) };
  const rating = creditRating(e, annualTaxForRating(priv, previewTaxTotal), cityValueDollars(ctx, tune), tune);
  if (!Number.isFinite(tune.bonds.spreadRaw[rating])) {
    if (!opt?.bypassRating) return { ok: false, reason: 'rating' };
    return { ok: true, rateRaw: tune.bonds.maxRaw };
  }
  const raw = nextBondRateRaw(e, rating, ctx.prng.int(tune.bonds.jitterRaw), tune);
  return { ok: true, rateRaw: raw ?? tune.bonds.maxRaw };
}

/** 入账：bonds.push、funds += 面额（夹 int32）、本年发行数 +1。 */
export function applyIssue(ctx: SimContext, priv: EconomyPriv, rateRaw: number, tune: EconomyTuning): void {
  const e = ctx.state.economy, d = dateOf(ctx.state.clock);
  e.bonds.push({ rateRaw, issuedYear: d.year, issuedMonth: d.month });
  e.funds = clampInt32(e.funds + tune.bonds.face);
  priv.issued++;
}

/** 偿还最早一张：无债券 / 资金不足面额 → null；否则 shift 并扣款。 */
export function repayEarliest(ctx: SimContext, priv: EconomyPriv, tune: EconomyTuning): 'none' | 'funds' | 'ok' {
  const e = ctx.state.economy;
  if (e.bonds.length === 0) return 'none';
  if (e.funds < tune.bonds.face) return 'funds';
  e.bonds.shift();
  e.funds = clampInt32(e.funds - tune.bonds.face);
  priv.repaid++;
  return 'ok';
}

/** 债券窗口视图（纯函数；下一张利率预览 jitter = 0）。 */
export function makeBondView(ctx: SimContext, priv: EconomyPriv, tune: EconomyTuning, previewTaxTotal: number): BondView {
  const e = ctx.state.economy;
  const cityValue = cityValueDollars(ctx, tune);
  const rating = creditRating(e, annualTaxForRating(priv, previewTaxTotal), cityValue, tune);
  const next = nextBondRateRaw(e, rating, 0, tune);
  const st = bondStats(e);
  return {
    bonds: e.bonds.map((b) => ({ rateRaw: b.rateRaw, issuedYear: b.issuedYear, issuedMonth: b.issuedMonth, ratePctFloor: Math.floor(b.rateRaw / 10000), annual: annualInterest(b.rateRaw) })),
    count: st.count,
    avgRatePctFloor: Math.floor(st.avgRaw / 10000),
    sumRatePctFloor: Math.floor(st.sumRaw / 10000),
    nextRatePctFloor: next === null ? null : Math.floor(next / 10000),
    rating,
    cityValueDollars: cityValue,
    canIssue: !e.impeached && e.bonds.length < tune.bonds.max && next !== null,
    canRepay: !e.impeached && e.bonds.length > 0 && e.funds >= tune.bonds.face,
  };
}

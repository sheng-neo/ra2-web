// ===== sim/zones/demand.ts =====
// RCI 需求（spec:zones §2.8 / §3.2）：主干供需比（年代转移、邻城市场项、法令乘数）+ 税率修正（工业按 economy.industryTax 的比例加权平均、线性插值）
// + 国家经济 / 难度修正 + cap 惩罚 + 噪声 → 1/4 平滑。PRNG：每月恰 3 次 range（R、C、I 噪声），诉求抽取时再 +1。
// 同时产出 state.caps 与"市民诉求" citizenDemand 事件（每种每年最多一次，spec §2.8.6）。
import { ZONE_MASK, tileIndex, zoneTypeOf } from '../../contracts/grid';
import type { RciDemand } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { avgIndustryTax } from './industry';
import { isRubble, isTree } from './buildings';
import type { ZonesCtx } from './lots';
import { connectionTotals, recountConnections } from './neighbors';
import { REQUEST_KEYS } from './priv';
import type { RequestKey } from './priv';
import { recreationCounts } from './queries';
import { clampInt, lerpTable } from './tuning';
import type { Difficulty, ZonesTuning } from './tuning';

export const DEMAND_MIN = -2000, DEMAND_MAX = 2000, TAX_MAX = 20;
const PARK_KEYS: readonly RequestKey[] = ['complaint.park', 'complaint.zoo', 'complaint.stadium', 'complaint.marina'];
const difficultyOf = (d: number): Difficulty => (d === 2 ? 2 : d === 3 ? 3 : 1);

/** 税率（可为小数，例如比例加权的工业税）→ 修正值，表间线性插值。 */
export function taxModAt(T: ZonesTuning, rate: number): number {
  const t = clampInt(rate, 0, TAX_MAX);
  const lo = Math.floor(t), hi = Math.min(TAX_MAX, lo + 1);
  const a = T.taxMod[lo] ?? 0, b = T.taxMod[hi] ?? a;
  return a + (b - a) * (t - lo);
}

/** 容量上限（§2.8.6，人口单位不含 arco）。 */
export function computeCaps(ctx: SimContext, Z: ZonesCtx): RciDemand {
  const T = Z.T, s = ctx.state, svc = ctx.q.services;
  const rec = recreationCounts(s, ctx.catalogue), rc = T.recreationCapR;
  const conn = connectionTotals(s);
  const airport = T.airportCapMode === 'tiles' ? T.airportTileC * svc.airportTiles() : T.airportGroupC * svc.airportRunwayGroups();
  return {
    r: T.capBase.r + rec.smallPark * rc.smallPark + rec.bigPark * rc.bigPark + rec.marina * rc.marina + rec.zoo * rc.zoo + rec.stadium * rc.stadium,
    c: T.capBase.c + T.roadConnC * conn.road + airport,
    i: T.capBase.i + T.craneI * svc.seaportCranes() + T.railConnI * conn.rail + T.hwyConnI * conn.highway,
  };
}

/** 已划区（1..6）、未开发（空地 / 树 / 瓦砾）且不可达的格数，达到 limit 即停。 */
function unreachableZoned(ctx: SimContext, limit: number): number {
  const L = ctx.state.layers, tr = ctx.q.transport;
  let n = 0;
  for (let x = 0; x < 128 && n < limit; x++) for (let y = 0; y < 128; y++) {
    const i = tileIndex(x, y);
    if (zoneTypeOf(L.xzon[i]! & ZONE_MASK) === null) continue;
    const b = L.xbld[i]!;
    if (!(b === 0 || isTree(b) || isRubble(b))) continue;
    if (!tr.hasAccess(x, y) && ++n >= limit) break;
  }
  return n;
}

/** 市民诉求（§2.8.6）：每种每年最多一次；公园 / 动物园 / 体育场 / 码头四选一（消费 1 次 PRNG）。 */
function citizenRequests(ctx: SimContext, Z: ZonesCtx, caps: RciDemand, year: number): void {
  const { T, priv } = Z, P = ctx.state.census, svc = ctx.q.services;
  const idx = (k: RequestKey): number => REQUEST_KEYS.indexOf(k);
  const emit = (k: RequestKey): void => {
    const j = idx(k);
    if (priv.reqYear[j] === year) return;
    priv.reqYear[j] = year;
    ctx.act.emit({ type: 'citizenDemand', key: k });
  };
  if (P.res >= T.needParkMinRes && P.res > caps.r && !PARK_KEYS.some((k) => priv.reqYear[idx(k)] === year)) emit(ctx.prng.pick(PARK_KEYS));
  if (P.com > caps.c) emit('complaint.airport');
  const cranes = svc.seaportCranes();
  if (P.ind > caps.i && cranes === 0) emit('complaint.seaport');
  const conn = connectionTotals(ctx.state);
  if ((P.com > caps.c || P.ind > caps.i) && conn.road + conn.rail + conn.highway === 0) emit('complaint.connection');
  const sc = svc.structureCounts();
  if (Math.floor(P.normalPop / T.needSchoolPer) > sc.school) emit('complaint.school');
  if (Math.floor(P.normalPop / T.needFirePer) > sc.fire) emit('complaint.fire');
  if (Math.floor(P.normalPop / T.needHospitalPer) > sc.hospital) emit('complaint.hospital');
  if (unreachableZoned(ctx, T.needRoadTiles) >= T.needRoadTiles) emit('complaint.road');
}

/** demand 阶段（第 21 天，census 之后）：先重算邻城连接，再按 §3.2 合成；T.fixedDemand 非 null 时直接写入（测试 / 调试）。 */
export function computeDemand(ctx: SimContext, Z: ZonesCtx): void {
  const T = Z.T, s = ctx.state, P = s.census, prng = ctx.prng;
  recountConnections(s, T);
  const year = ctx.q.economy.year();
  const caps = computeCaps(ctx, Z);
  s.caps.r = caps.r; s.caps.c = caps.c; s.caps.i = caps.i;
  if (T.fixedDemand) {
    s.demand.r = clampInt(T.fixedDemand.r, DEMAND_MIN, DEMAND_MAX); s.demand.c = clampInt(T.fixedDemand.c, DEMAND_MIN, DEMAND_MAX); s.demand.i = clampInt(T.fixedDemand.i, DEMAND_MIN, DEMAND_MAX);
    return;
  }
  const pct = Math.max(1, P.workforcePctUsed || T.workforcePctFallback) / 100;
  const shareC = lerpTable(T.commerceShare, year);
  let marketC = 0, marketI = 0;
  for (const nb of s.neighbors) {
    if (nb.connections.road > 0) marketC += nb.population * T.marketC;
    if (nb.connections.rail + nb.connections.highway > 0) marketI += nb.population * T.marketI;
  }
  let base: RciDemand;
  if (P.taxableRes === 0 && P.taxableCom === 0 && P.taxableInd === 0) {
    base = { r: T.emptyCityBase.r, c: T.emptyCityBase.c, i: T.emptyCityBase.i };
  } else {
    let tR = P.jobs / pct, tC = P.workforce * shareC + marketC, tI = P.workforce * (1 - shareC) + marketI;
    for (const o of ctx.catalogue.ORDINANCES) {
      if (!ctx.q.economy.ordinance(o.id)) continue;
      if (o.demand.r !== undefined) tR *= o.demand.r;
      if (o.demand.c !== undefined) tC *= o.demand.c;
      if (o.demand.i !== undefined) tI *= o.demand.i;
    }
    base = {
      r: clampInt((tR / Math.max(P.taxableRes, 1) - 1) * T.ratioGain, DEMAND_MIN, DEMAND_MAX),
      c: clampInt((tC / Math.max(P.taxableCom, 1) - 1) * T.ratioGain, DEMAND_MIN, DEMAND_MAX),
      i: clampInt((tI / Math.max(P.taxableInd, 1) - 1) * T.ratioGain, DEMAND_MIN, DEMAND_MAX),
    };
  }
  const diff = difficultyOf(s.economy.difficulty), sens = T.taxSens[diff];
  const taxMod: RciDemand = {
    r: taxModAt(T, s.economy.taxRate.r) * sens,
    c: taxModAt(T, s.economy.taxRate.c) * sens,
    i: taxModAt(T, avgIndustryTax(s.industry.ratio, s.economy.industryTax)) * sens,
  };
  const econ = T.econMod[clampInt(s.national.trend, 0, 2)] ?? 0;
  const pops: RciDemand = { r: P.res, c: P.com, i: P.ind };
  for (const z of ['r', 'c', 'i'] as const) {
    const over = Math.max(0, pops[z] - caps[z]) / Math.max(1, caps[z]);
    const capMod = -Math.min(1, over) * T.capPenaltyMax;
    const noise = prng.range(-T.noise, T.noise);
    const raw = base[z] + taxMod[z] + econ + capMod + noise + (z === 'i' ? T.diffIndMod[diff] : 0);
    const prev = s.demand[z];
    let step = (raw - prev) * T.smoothing;
    if (step !== 0 && Math.abs(step) < 1) step = step > 0 ? 1 : -1;          // 至少走 1 点，避免差 1 时停滞在 raw 之下
    s.demand[z] = clampInt(Math.round(prev + step), DEMAND_MIN, DEMAND_MAX);
  }
  citizenRequests(ctx, Z, caps, year);
}

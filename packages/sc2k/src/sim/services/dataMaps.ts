// ===== sim/services/dataMaps.ts =====
// 八张低分辨率图层中七张的月度重算（spec:services §2.3 / §3.2）：污染 → 城市中心 → 地形宜居度 → 地价 → 警 / 消覆盖 + 人口密度 → 增长率 → 犯罪。
// 整体替换（先算到草稿缓冲再 set 回 state.maps，引用不变），不消费 PRNG。索引主次序与 XBLD 相同：半格 h = (x>>1)*64 + (y>>1)，
// 四分格 q = (x>>2)*32 + (y>>2)（contracts/grid 的 halfIndex / quarterIndex）。全部除法向零截断。
import { Corner, MAP, ZONE_MASK, tileIndex } from '../../contracts/grid';
import { BudgetLine, OrdinanceId } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { POLLUTION, POP_WEIGHT, Xbld, isAbandoned } from './tables';
import type { ServicesTuning } from './tuning';
import { clamp255, idiv } from './runtime';
import type { ServicesRuntime } from './runtime';

const HALF_W = 64, QUARTER_W = 32;

/** 城市中心（§2.3.2）：建筑格（XBLD ≥ 0x70）坐标和 / (2·(n+1))，半格坐标；n = 0 → (0,0)。 */
export function computeCityCenter(xbld: Uint8Array): { hx: number; hy: number } {
  let n = 0, sx = 0, sy = 0;
  for (let x = 0; x < MAP; x++) {
    const row = x * MAP;
    for (let y = 0; y < MAP; y++) if (xbld[row + y]! >= 0x70) { sx += x; sy += y; n++; }
  }
  return { hx: idiv(sx, 2 * (n + 1)), hy: idiv(sy, 2 * (n + 1)) };
}

/** 五点均值（自身 + 界内四邻，分母 = 1 + 界内邻居数），w = 方阵边长。 */
function mean5(a: Int32Array, w: number, idx: number): number {
  const gx = (idx / w) | 0, gy = idx % w;
  let num = a[idx]!, den = 1;
  if (gx > 0) { num += a[idx - w]!; den++; }
  if (gx < w - 1) { num += a[idx + w]!; den++; }
  if (gy > 0) { num += a[idx - 1]!; den++; }
  if (gy < w - 1) { num += a[idx + 1]!; den++; }
  return idiv(num, den);
}

/** 站点覆盖图案（§2.3.5）：中心 S、四邻 A、对角 B、第二环 12 格 C、第三环 12 格 + (±2,±2) 四格 D；每次叠加 clamp 0..255，越界跳过。 */
export function addPattern(grid: Uint8Array, qx: number, qy: number, s: number, t: ServicesTuning): void {
  const put = (x: number, y: number, v: number): void => {
    if (x < 0 || y < 0 || x >= QUARTER_W || y >= QUARTER_W) return;
    const k = x * QUARTER_W + y;
    grid[k] = clamp255(grid[k]! + v);
  };
  const r = t.patternRatios;
  const a = idiv(s * r.cardinal[0], r.cardinal[1]);
  const b = idiv(a * r.diagonal[0], r.diagonal[1]);
  const c = idiv(b * r.ring2[0], r.ring2[1]);
  const d = idiv(c * r.ring3[0], r.ring3[1]);
  put(qx, qy, s);
  put(qx + 1, qy, a); put(qx - 1, qy, a); put(qx, qy + 1, a); put(qx, qy - 1, a);
  put(qx + 1, qy + 1, b); put(qx - 1, qy + 1, b); put(qx + 1, qy - 1, b); put(qx - 1, qy - 1, b);
  for (const m of [-2, 2]) for (let k = -1; k <= 1; k++) { put(qx + m, qy + k, c); put(qx + k, qy + m, c); }
  for (const m of [-3, 3]) for (let k = -1; k <= 1; k++) { put(qx + m, qy + k, d); put(qx + k, qy + m, d); }
  put(qx + 2, qy + 2, d); put(qx - 2, qy + 2, d); put(qx + 2, qy - 2, d); put(qx - 2, qy - 2, d);
}

/** 站点强度（§2.3.5）。 */
export function stationStrengths(ctx: SimContext, t: ServicesTuning): { police: number; fire: number } {
  const q = ctx.q.economy;
  const police = idiv((t.policeStrengthBase + (ctx.state.rewards.prisonBonus ? t.policeStrengthPrisonBonus : 0)) * q.funding(BudgetLine.Police), t.strengthFundingDivisor);
  const fire = idiv(q.funding(BudgetLine.Fire) * t.fireStrengthMul, t.strengthFundingDivisor);
  return { police, fire };
}

/** 每月第 2 天：整体重算七张图并更新 totals（traffic 不动）。 */
export function runDataMaps(ctx: SimContext, rt: ServicesRuntime, t: ServicesTuning): void {
  const s = ctx.state, L = s.layers, M = s.maps, S = rt.scratch;
  const xbld = L.xbld, xzon = L.xzon, xter = L.xter;
  const ord = (id: OrdinanceId): boolean => ctx.q.economy.ordinance(id);

  // ---- 1) 污染：源项 + 扩散 ----
  const src = S.src; src.fill(0);
  for (let x = 0; x < MAP; x++) {
    const hxBase = (x >> 1) * HALF_W;
    for (let y = 0; y < MAP; y++) {
      const b = xbld[x * MAP + y]!;
      if (b >= 0x70) { const k = hxBase + (y >> 1); src[k] = src[k]! + POLLUTION[b]!; }
      else if (b === Xbld.Radioactive) { const k = hxBase + (y >> 1); src[k] = src[k]! + t.radioactivePollution; }
    }
  }
  for (let h = 0; h < src.length; h++) src[h] = src[h]! + idiv(M.xtrf[h]!, t.trafficPollutionDivisor) + M.xplt[h]!;
  const treatment = ctx.q.utilities.lastWater().treatmentSufficient ? 1 : 0;
  const divisor = Math.max(1, t.pollutionBaseDivisor + treatment - s.industry.pollutionBonus + (ord(OrdinanceId.PollutionControls) ? 1 : 0));
  const newPlt = S.newPlt;
  let pollutionTotal = 0;
  for (let hx = 0; hx < HALF_W; hx++) for (let hy = 0; hy < HALF_W; hy++) {
    const h = hx * HALF_W + hy;
    let num = 2 * src[h]!, den = divisor;
    if (hx > 0) { num += src[h - HALF_W]!; den++; }
    if (hx < HALF_W - 1) { num += src[h + HALF_W]!; den++; }
    if (hy > 0) { num += src[h - 1]!; den++; }
    if (hy < HALF_W - 1) { num += src[h + 1]!; den++; }
    const v = Math.min(255, idiv(num, den));
    newPlt[h] = v; pollutionTotal += v;
  }

  // ---- 2) 城市中心 ----
  const center = computeCityCenter(xbld);
  rt.centerHx = center.hx; rt.centerHy = center.hy;

  // ---- 3) 地形宜居度 + 已开发半格 ----
  const habR = S.habR, habI = S.habI, dev = S.developedHalf;
  habR.fill(0); habI.fill(0); dev.fill(0);
  let developedTiles = 0;
  const util = ctx.q.utilities, terr = ctx.q.terrain;
  for (let x = 0; x < MAP; x++) {
    const qxBase = (x >> 2) * QUARTER_W, hxBase = (x >> 1) * HALF_W;
    for (let y = 0; y < MAP; y++) {
      const i = x * MAP + y, b = xbld[i]!, q = qxBase + (y >> 2);
      if (b === 0) { if (terr.isWater(i)) { habR[q] = habR[q]! + 12; habI[q] = habI[q]! + 12; } else habR[q] = habR[q]! + 4; }
      else if (b === Xbld.BigPark) habR[q] = habR[q]! + 40;
      else if (b >= 0x06 && b <= Xbld.SmallPark) habR[q] = habR[q]! + 20;
      else if (b >= 0x01 && b <= Xbld.Radioactive) habR[q] = habR[q]! - 20;
      if (util.watered(i)) { habR[q] = habR[q]! + 4; habI[q] = habI[q]! + 4; }
      const tc = xter[i]!;
      if (tc >= 0x01 && tc <= 0x0f) habR[q] = habR[q]! + 12;
      if (b >= 0x1d || (xzon[i]! & ZONE_MASK) !== 0) { dev[hxBase + (y >> 1)] = 1; developedTiles++; }
    }
  }

  // ---- 4) 地价（只算已开发半格；用本月污染、上月犯罪 / 密度） ----
  const newVal = S.newVal; newVal.fill(0);
  const lv = t.landValue;
  const cx = center.hx, cy = center.hy;
  let landTotal = 0;
  for (let hx = 0; hx < HALF_W; hx++) for (let hy = 0; hy < HALF_W; hy++) {
    const h = hx * HALF_W + hy;
    if (dev[h] === 0) continue;
    const tl = tileIndex(hx << 1, hy << 1), br = tileIndex((hx << 1) + 1, (hy << 1) + 1);
    const zone = (xzon[tl]! & ZONE_MASK) || (xzon[br]! & ZONE_MASK);
    const q = (hx >> 1) * QUARTER_W + (hy >> 1);
    const dist = lv.distSpan - Math.abs(cx - hx) - Math.abs(cy - hy);
    const p = newPlt[h]!, c = M.xcrm[h]!, pop = M.xpop[q]!;
    let v: number;
    if (zone === 3 || zone === 4) v = mean5(habR, QUARTER_W, q) + Math.max(0, dist) - idiv(p, 4) - idiv(c, 3) + idiv(pop, 3);
    else if (zone === 5 || zone === 6) v = mean5(habI, QUARTER_W, q) + (zone === 6 ? lv.denseIndustryBonus : 0) + Math.max(0, idiv(dist, 4)) - idiv(p, 16) - idiv(c, 4);
    else v = mean5(habR, QUARTER_W, q) + (pop < lv.lowDensityPopThreshold ? lv.lowDensityBonus : 0) + Math.max(0, idiv(dist, 2)) - idiv(p, 5) - idiv(c, 3);
    v += t.landValueBase;
    if (isAbandoned(xbld[tl]!)) v -= idiv(v, 2);
    const cv = clamp255(v);
    newVal[h] = cv; landTotal += cv;
  }

  // ---- 5) 警 / 消覆盖 + 人口源（只扫 1..126） ----
  const popW = S.popW, plc = S.plc, fir = S.fir;
  popW.fill(0); plc.fill(0); fir.fill(0);
  const { police: sP, fire: sF } = stationStrengths(ctx, t);
  const watch = ord(OrdinanceId.NeighborhoodWatch), volunteer = ord(OrdinanceId.VolunteerFire);
  const lo = t.coverageScanSkipsBorder ? 1 : 0, hi = t.coverageScanSkipsBorder ? MAP - 2 : MAP - 1;
  for (let x = lo; x <= hi; x++) {
    const qx = x >> 2;
    for (let y = lo; y <= hi; y++) {
      const i = x * MAP + y, b = xbld[i]!, qy = y >> 2, q = qx * QUARTER_W + qy;
      if (b >= 0x70 && b < 0xc6) {
        popW[q] = popW[q]! + POP_WEIGHT[b]!;
        if (watch && plc[q]! < t.ordinanceCoverageCap) plc[q] = plc[q]! + t.ordinanceCoverageStep;
        if (volunteer && fir[q]! < t.ordinanceCoverageCap) fir[q] = fir[q]! + t.ordinanceCoverageStep;
      } else if (b >= 0xc6) {
        popW[q] = popW[q]! + (b >= Xbld.ArcoFirst && b <= Xbld.ArcoLast ? 12 : 2);
        if ((xzon[i]! & Corner.TR) === 0) continue;
        if (b === Xbld.Police) addPattern(plc, qx, qy, util.poweredSelf(i) ? sP : idiv(sP, 2), t);
        else if (b === Xbld.Fire) addPattern(fir, qx, qy, util.poweredSelf(i) ? sF : idiv(sF, 2), t);
      }
    }
  }

  // ---- 6) 人口密度与增长率 ----
  const newPop = S.newPop, newRog = S.newRog;
  for (let q = 0; q < newPop.length; q++) {
    const np = Math.min(255, 4 * popW[q]!);
    newPop[q] = np;
    newRog[q] = clamp255(idiv(7 * M.xrog[q]! + 8 * (np - M.xpop[q]!) + t.xrogCenter, 8));
  }

  // ---- 7) 犯罪 ----
  const cs = S.crimeSrc, newCrm = S.newCrm;
  const gambling = ord(OrdinanceId.LegalizedGambling) ? t.gamblingCrime : 0;
  for (let hx = 0; hx < HALF_W; hx++) for (let hy = 0; hy < HALF_W; hy++) {
    const h = hx * HALF_W + hy;
    const q = (hx >> 1) * QUARTER_W + (hy >> 1);
    cs[h] = dev[h] ? newPop[q]! - idiv(newVal[h]!, 4) - idiv(plc[q]!, 2) + gambling : 0;
  }
  let crimeTotal = 0;
  for (let h = 0; h < cs.length; h++) { const v = clamp255(mean5(cs, HALF_W, h)); newCrm[h] = v; crimeTotal += v; }

  // ---- 提交（整体替换，引用不变） ----
  M.xplt.set(newPlt); M.xval.set(newVal); M.xplc.set(plc); M.xfir.set(fir); M.xpop.set(newPop); M.xrog.set(newRog); M.xcrm.set(newCrm);
  s.totals.pollution = pollutionTotal; s.totals.landValue = landTotal; s.totals.crime = crimeTotal;
  s.totals.developedTiles = developedTiles; s.totals.centerX = center.hx * 2; s.totals.centerY = center.hy * 2;
  ctx.act.layerChanged('maps');
}


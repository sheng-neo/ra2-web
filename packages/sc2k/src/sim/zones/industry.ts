// ===== sim/zones/industry.ts =====
// 11 产业的 v1 子集（spec:zones §2.9）：按年份权重表给出 ratio 初值（Σ = 100）、按比例加权的平均工业税率（税率真源 economy.industryTax）、
// 重污染份额 → industrialPollutionBonus（MISC 0x1034）。月度收敛 / 产业需求 / 税率因子为 [v2]。
import { INDUSTRY_COUNT, clampInt } from './tuning';
import type { ZonesTuning } from './tuning';

/** 年份 → 11 个产业的目标比例（百分比整数，最大余数法保证 Σ = 100）。 */
export function industryRatioTarget(T: ZonesTuning, year: number): number[] {
  const ys = T.industryWeightYears;
  const w: number[] = [];
  let sum = 0;
  for (let k = 0; k < INDUSTRY_COUNT; k++) {
    const row = T.industryWeights[k] ?? [1, 1, 1, 1];
    const table: (readonly [number, number])[] = [[ys[0], row[0]], [ys[1], row[1]], [ys[2], row[2]], [ys[3], row[3]]];
    let v = 0;
    if (year <= ys[0]) v = row[0]; else if (year >= ys[3]) v = row[3];
    else for (let s = 1; s < 4; s++) { const a = table[s - 1]!, b = table[s]!; if (year <= b[0]) { v = a[1] + ((b[1] - a[1]) * (year - a[0])) / (b[0] - a[0]); break; } }
    w.push(v); sum += v;
  }
  const out = new Array<number>(INDUSTRY_COUNT).fill(0);
  if (sum <= 0) { out[0] = 100; return out; }
  const frac: { k: number; f: number }[] = [];
  let used = 0;
  for (let k = 0; k < INDUSTRY_COUNT; k++) {
    const exact = (100 * w[k]!) / sum, fl = Math.floor(exact);
    out[k] = fl; used += fl; frac.push({ k, f: exact - fl });
  }
  frac.sort((a, b) => b.f - a.f || a.k - b.k);
  for (let r = 0; r < 100 - used; r++) out[frac[r % INDUSTRY_COUNT]!.k]!++;
  return out;
}

/** 按 ratio 加权的平均工业税率（ratio Σ 为 0 时取 11 项算术平均）；结果夹在 0..20，可为小数。 */
export function avgIndustryTax(ratio: ArrayLike<number>, tax: ArrayLike<number>): number {
  let sumR = 0, acc = 0, plain = 0;
  for (let k = 0; k < INDUSTRY_COUNT; k++) {
    const r = Math.max(0, ratio[k] ?? 0), t = clampInt(tax[k] ?? 0, 0, 20);
    sumR += r; acc += r * t; plain += t;
  }
  return sumR > 0 ? clampInt(acc / sumR, 0, 20) : clampInt(plain / INDUSTRY_COUNT, 0, 20);
}

/** heavyShare < 20 → −1；否则 clamp(floor((heavyShare − 20) / 30), 0, 2)。 */
export function industrialPollutionBonus(T: ZonesTuning, ratio: ArrayLike<number>): number {
  let heavy = 0;
  for (const k of T.heavyPollutionIndustries) heavy += Math.max(0, ratio[k] ?? 0);
  return heavy < 20 ? -1 : clampInt(Math.floor((heavy - 20) / 30), 0, 2);
}

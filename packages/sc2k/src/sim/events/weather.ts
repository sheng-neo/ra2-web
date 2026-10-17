// ===== sim/events/weather.ts =====（spec:disasters §2.4.3 / §3.5 天气生成）
// 每月第 24 天为下月生成 { heat, wind, humid, trend, season }；非海岸图把 Hurricane 权重并入 Windy。恰消费 4 次 PRNG。
import type { Prng } from '../../contracts/prng';
import type { WeatherState } from '../../contracts/state';
import { TREND_COUNT, Trend } from './tuning';
import type { WeatherTuning } from './tuning';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** 按权重行抽样（行合计 100；合计为 0 时退回 Clear）。 */
export function weightedTrend(row: readonly number[], prng: Prng): number {
  let total = 0;
  for (let k = 0; k < TREND_COUNT; k++) total += row[k] ?? 0;
  const r = prng.int(total);
  if (total <= 0) return Trend.Clear;
  let acc = 0;
  for (let k = 0; k < TREND_COUNT; k++) { acc += row[k] ?? 0; if (r < acc) return k; }
  return Trend.Clear;
}

/** 生成 month（0..11）的天气；hasOcean = 海岸图（spec §2.4.3 第 2 步）。 */
export function generateWeather(t: WeatherTuning, prng: Prng, month: number, hasOcean: boolean): WeatherState {
  const season = (t.seasonOfMonth[month] ?? 0) as 0 | 1 | 2 | 3;
  const base = t.weights[season] ?? t.weights[0]!;
  const row = base.slice();
  if (!hasOcean) { row[Trend.Windy] = (row[Trend.Windy] ?? 0) + (row[Trend.Hurricane] ?? 0); row[Trend.Hurricane] = 0; }
  const trend = weightedTrend(row, prng);
  const f = (t.baseF[month] ?? 60) + prng.range(-t.heatJitter, t.heatJitter) + (t.trendDelta[trend] ?? 0);
  const heat = 100 + clamp(f, 0, 120);
  const wj = t.windJitter[trend] ?? 0, hj = t.humidJitter[trend] ?? 0;
  const wind = clamp((t.windBase[trend] ?? 10) + prng.range(-wj, wj), 0, 255);
  const humid = clamp((t.humidBase[trend] ?? 2) + prng.range(-hj, hj), 0, 255);
  return { heat, wind, humid, trend, season };
}

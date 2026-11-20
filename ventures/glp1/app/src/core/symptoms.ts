/**
 * 个人高症状日（PRD v2.0 第 5.3 节）：记满 3 个用药周期后，
 * 按"打针后第几天"（0–6）分组，某一天平均症状分 ≥ 个人整体平均的 1.5 倍、
 * 且至少出现过 2 次，就标为高症状日。
 */
import { dayDiff, dayKey } from './tz';

export interface SymptomPoint {
  atMs: number;
  grade: number; // 0–3
}

export interface HighDayResult {
  enoughData: boolean;
  cycles: number;
  /** 打针后第几天（0 = 打针当天）。 */
  highDays: number[];
  meanByOffset: number[];
}

export function highSymptomDays(doseTimes: number[], symptoms: SymptomPoint[], nowMs: number, tz: string, dayStartHour = 4, period = 7): HighDayResult {
  const doseDays = [...new Set(doseTimes.map((t) => dayKey(t, tz, dayStartHour)))].sort();
  const today = dayKey(nowMs, tz, dayStartHour);
  // 完整周期：从某次用药日到下一次用药日之前；最后一个周期需要已经过完。
  const cycles: string[][] = [];
  for (let i = 0; i < doseDays.length; i++) {
    const start = doseDays[i];
    const end = doseDays[i + 1];
    const len = end ? Math.min(dayDiff(start, end), period) : dayDiff(start, today) >= period ? period : 0;
    if (len < period) continue;
    const days: string[] = [];
    for (let k = 0; k < period; k++) days.push(shift(start, k));
    cycles.push(days);
  }
  const meanByOffset = new Array(period).fill(0);
  if (cycles.length < 3) return { enoughData: false, cycles: cycles.length, highDays: [], meanByOffset };

  const maxByDay = new Map<string, number>();
  for (const s of symptoms) {
    const k = dayKey(s.atMs, tz, dayStartHour);
    maxByDay.set(k, Math.max(maxByDay.get(k) ?? 0, s.grade));
  }
  const counts = new Array(period).fill(0);
  let total = 0;
  for (const days of cycles) {
    days.forEach((d, k) => {
      const g = maxByDay.get(d) ?? 0;
      meanByOffset[k] += g / cycles.length;
      if (g >= 1) counts[k]++;
      total += g;
    });
  }
  const overall = total / (cycles.length * period);
  const highDays = overall > 0 ? meanByOffset.map((m, k) => (m >= 1.5 * overall && counts[k] >= 2 ? k : -1)).filter((k) => k >= 0) : [];
  return { enoughData: true, cycles: cycles.length, highDays, meanByOffset };
}

function shift(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

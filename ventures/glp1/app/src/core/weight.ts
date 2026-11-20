/**
 * 体重趋势：7 天滑动平均（窗口内至少 3 次称重）、最低点、停药后回升分级。
 * 阈值（3% / 5%、每周 1.5%）是产品设计选择，【待医生确认】。
 */
import { dayDiff, dayKey, shiftDayKey } from './tz';

export interface WeighIn {
  atMs: number;
  kg: number;
}

export interface DailyAvg {
  day: string;
  avgKg: number;
}

/** 以每一个有称重的日子为窗口终点，算 7 天平均。窗口内不足 3 次称重的日子不出值。 */
export function rollingAverages(logs: WeighIn[], tz: string, dayStartHour = 4, windowDays = 7, minCount = 3): DailyAvg[] {
  const byDay = new Map<string, number[]>();
  for (const l of logs) {
    const k = dayKey(l.atMs, tz, dayStartHour);
    const arr = byDay.get(k) ?? [];
    arr.push(l.kg);
    byDay.set(k, arr);
  }
  const days = [...byDay.keys()].sort();
  const out: DailyAvg[] = [];
  for (const end of days) {
    const start = shiftDayKey(end, -(windowDays - 1));
    const vals: number[] = [];
    for (const d of days) if (d >= start && d <= end) vals.push(...byDay.get(d)!);
    if (vals.length >= minCount) out.push({ day: end, avgKg: vals.reduce((a, b) => a + b, 0) / vals.length });
  }
  return out;
}

export type RegainBand = 'green' | 'yellow' | 'orange';

export interface RegainStatus {
  band: RegainBand;
  nadirKg: number;
  nadirDay: string;
  currentKg: number;
  regainPct: number;
}

export function regainStatus(avgs: DailyAvg[]): RegainStatus | null {
  if (avgs.length < 2) return null;
  let nadir = avgs[0];
  for (const a of avgs) if (a.avgKg < nadir.avgKg) nadir = a;
  const current = avgs[avgs.length - 1];
  const pct = ((current.avgKg - nadir.avgKg) / nadir.avgKg) * 100;
  const band: RegainBand = pct > 5 ? 'orange' : pct >= 3 ? 'yellow' : 'green';
  return { band, nadirKg: nadir.avgKg, nadirDay: nadir.day, currentKg: current.avgKg, regainPct: pct };
}

/** 连续两周每周下降超过 1.5%：提示"减得偏快，注意蛋白"。 */
export function fastLoss(avgs: DailyAvg[]): boolean {
  if (avgs.length < 3) return false;
  const last = avgs[avgs.length - 1];
  const at = (daysBack: number) => {
    const target = shiftDayKey(last.day, -daysBack);
    let best: DailyAvg | null = null;
    for (const a of avgs) {
      const d = Math.abs(dayDiff(a.day, target));
      if (d <= 2 && (!best || d < Math.abs(dayDiff(best.day, target)))) best = a;
    }
    return best;
  };
  const w1 = at(7);
  const w2 = at(14);
  if (!w1 || !w2) return false;
  const drop1 = (w1.avgKg - last.avgKg) / w1.avgKg;
  const drop2 = (w2.avgKg - w1.avgKg) / w2.avgKg;
  return drop1 > 0.015 && drop2 > 0.015;
}

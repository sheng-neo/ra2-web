/**
 * 药物水平估算（PRD v2.0 第 5.3 节）：一级吸收 + 一级消除（Bateman 函数）。
 * 只输出相对指数：以"当前剂量、当前间隔长期使用后的最高点"为 100。
 * 这是人群平均模型，不是测量值，不能用来调整剂量。
 */
import type { PkParams } from './catalog';
import { HOUR, DAY } from './tz';

export interface MgDose {
  atMs: number;
  mg: number;
}

export interface PkModel {
  ka: number; // 每小时
  ke: number; // 每小时
}

/** 由达峰时间反推吸收速率：解 ln(ka/ke)/(ka−ke) = tmax。 */
export function kaFromTmax(ke: number, tmaxH: number): number {
  let lo = ke * 1.000001;
  let hi = 10;
  const f = (ka: number) => Math.log(ka / ke) / (ka - ke) - tmaxH;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function modelFor(p: PkParams): PkModel {
  const ke = Math.LN2 / p.halfLifeH;
  return { ke, ka: kaFromTmax(ke, p.tmaxH) };
}

/** 单次单位剂量在注射后 dtH 小时的相对浓度。 */
export function bateman(dtH: number, m: PkModel): number {
  if (dtH < 0) return 0;
  return (m.ka / (m.ka - m.ke)) * (Math.exp(-m.ke * dtH) - Math.exp(-m.ka * dtH));
}

export function concentration(tMs: number, doses: MgDose[], m: PkModel): number {
  let c = 0;
  for (const d of doses) c += d.mg * bateman((tMs - d.atMs) / HOUR, m);
  return c;
}

/** 按 doseMg、每 intervalH 小时一次连续用 20 次后，最后一个周期里的最高浓度。 */
export function steadyStatePeak(doseMg: number, intervalH: number, m: PkModel): number {
  const doses: MgDose[] = [];
  for (let i = 0; i < 20; i++) doses.push({ atMs: i * intervalH * HOUR, mg: doseMg });
  const start = 19 * intervalH * HOUR;
  let peak = 0;
  for (let h = 0; h <= intervalH; h += 0.5) peak = Math.max(peak, concentration(start + h * HOUR, doses, m));
  return peak;
}

export interface CurvePoint {
  tMs: number;
  index: number;
  projected: boolean;
}

export interface CurveInput {
  doses: MgDose[];
  params: PkParams;
  intervalH: number;
  nowMs: number;
  /** 下一次计划用药时间；停药状态传 null，曲线只画衰减。 */
  nextDueMs: number | null;
  fromMs?: number;
  toMs?: number;
  stepH?: number;
}

export function referenceDose(doses: MgDose[]): number | null {
  if (!doses.length) return null;
  return [...doses].sort((a, b) => a.atMs - b.atMs)[doses.length - 1].mg;
}

/**
 * 过去 14 天 + 未来 7 天的指数曲线。未来部分假设按计划继续用同样的剂量（projected = true）。
 */
export function exposureCurve(inp: CurveInput): CurvePoint[] {
  const m = modelFor(inp.params);
  const ref = referenceDose(inp.doses);
  if (ref === null) return [];
  const peak = steadyStatePeak(ref, inp.intervalH, m);
  const from = inp.fromMs ?? inp.nowMs - 14 * DAY;
  const to = inp.toMs ?? inp.nowMs + 7 * DAY;
  const step = (inp.stepH ?? 3) * HOUR;
  const future: MgDose[] = [];
  if (inp.nextDueMs !== null) {
    for (let t = inp.nextDueMs; t <= to; t += inp.intervalH * HOUR) future.push({ atMs: t, mg: ref });
  }
  const all = [...inp.doses, ...future];
  const out: CurvePoint[] = [];
  for (let t = from; t <= to; t += step) {
    const doses = t <= inp.nowMs ? inp.doses : all;
    out.push({ tMs: t, index: (100 * concentration(t, doses, m)) / peak, projected: t > inp.nowMs });
  }
  return out;
}

export function exposureIndexAt(tMs: number, doses: MgDose[], params: PkParams, intervalH: number): number | null {
  const ref = referenceDose(doses);
  if (ref === null) return null;
  const m = modelFor(params);
  return (100 * concentration(tMs, doses, m)) / steadyStatePeak(ref, intervalH, m);
}

export interface EscalationInfo {
  currentMg: number;
  /** 当前剂量第一次使用的时间。 */
  sinceMs: number;
  weeksOnDose: number;
  /** 是否在加量后 14 天内（"加量周"）。第一次用药也算。 */
  escalationActive: boolean;
  previousMg: number | null;
}

export function escalationInfo(doses: MgDose[], nowMs: number): EscalationInfo | null {
  if (!doses.length) return null;
  const sorted = [...doses].sort((a, b) => a.atMs - b.atMs);
  const current = sorted[sorted.length - 1].mg;
  let i = sorted.length - 1;
  while (i > 0 && Math.abs(sorted[i - 1].mg - current) < 1e-9) i--;
  const since = sorted[i].atMs;
  const previousMg = i > 0 ? sorted[i - 1].mg : null;
  const increased = previousMg === null || current > previousMg + 1e-9;
  return {
    currentMg: current,
    sinceMs: since,
    weeksOnDose: (nowMs - since) / (7 * DAY),
    escalationActive: increased && nowMs - since < 14 * DAY,
    previousMg,
  };
}

/** 最后一针之后，指数降到 threshold（默认 5）以下需要多少天。 */
export function daysUntilBelow(doses: MgDose[], params: PkParams, intervalH: number, threshold = 5): number | null {
  const sorted = [...doses].sort((a, b) => a.atMs - b.atMs);
  if (!sorted.length) return null;
  const last = sorted[sorted.length - 1].atMs;
  for (let h = 0; h < 24 * 365; h += 1) {
    const idx = exposureIndexAt(last + h * HOUR, sorted, params, intervalH);
    if (idx !== null && h > 24 && idx < threshold) return h / 24;
  }
  return null;
}

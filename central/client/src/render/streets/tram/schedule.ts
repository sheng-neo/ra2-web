/**
 * 电车行车时刻（R2 TRAMS T8 运行）：纯函数，位置只取决于时刻 t（SIM_CLOCK.t），可复现。
 *
 * - 速度曲线（每条路线一份，1 m 网格）：巡航 7 m/s；弯道限速 √(0.9 R)（≥ 2.5 m/s）；进站减速 1.2 m/s²、
 *   出站加速 1.0 m/s²；在站岛处速度为 0（车身中心停在站岛中心 ±0.5 m）。网格上相邻两点之间按匀加速运动，
 *   位置、速度都是连续的解析式。
 * - 每辆车一张时刻表：停站时间 = 站的基础停站（18.5–24.5 s，按站种子）+ 每车每站的抖动（±1.5 s，同一车的抖动总和为 0，
 *   所以每辆车跑完一趟用时相同）。同一路线上的 N 辆车在一趟周期 T 里等时间间隔错开：车 k 的相位 = k·T/N + 路线相位。
 * - 路线两端在数据范围边缘：跑到终点就回到起点（雾里出入，与 R1 相同）。
 * - 开门铃（「叮叮」）：每次离站前 BELL_LEAD_S 秒。
 */
import { radiusAt, type TramRoute } from './route';

export const CRUISE_MS = 7;
export const ACCEL_MS2 = 1.0;
export const BRAKE_MS2 = 1.2;
const LAT_ACC = 0.9;
const MIN_CURVE_MS = 2.5;
/** 网格步长（m）。 */
const DS = 1;
/** 离站前多少秒打铃。 */
export const BELL_LEAD_S = 1.0;
/** 每方向的目标车距（m）。 */
export const HEADWAY_M = 175;
/**
 * 同一路线相邻两车的最小时间间隔（s）：前车停站最长 ~25 s，后车要在 ≥ 40 m 外停下，
 * 进出站的慢行段约需 12 s → 间隔 ≥ 25 + 12 + 抖动余量。
 */
export const MIN_HEADWAY_S = 41;

export interface SpeedProfile {
  /** 网格点数（每 DS 一点）。 */
  n: number;
  /** 各网格点速度（m/s）与到达时刻（s，不含停站）。 */
  v: Float64Array;
  t: Float64Array;
  /** 各站所在网格下标（升序）。 */
  stopIdx: Int32Array;
  len: number;
}

/** 由路线与站位（沿线 m）求速度曲线（前后两遍：加速度、减速度约束）。 */
export function speedProfile(len: number, stops: readonly number[], vcapAt: (s: number) => number): SpeedProfile {
  const n = Math.max(2, Math.floor(len / DS) + 1);
  const cap = new Float64Array(n);
  for (let i = 0; i < n; i++) cap[i] = Math.min(CRUISE_MS, vcapAt(i * DS));
  const stopIdx = Int32Array.from(
    [...new Set(stops.map((s) => Math.min(Math.max(Math.round(s / DS), 1), n - 2)))].sort((a, b) => a - b),
  );
  for (const i of stopIdx) cap[i] = 0;
  const v = new Float64Array(n);
  v[0] = cap[0]!;
  for (let i = 1; i < n; i++) v[i] = Math.min(cap[i]!, Math.sqrt(v[i - 1]! * v[i - 1]! + 2 * ACCEL_MS2 * DS));
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i]!, Math.sqrt(v[i + 1]! * v[i + 1]! + 2 * BRAKE_MS2 * DS));
  const t = new Float64Array(n);
  for (let i = 1; i < n; i++) t[i] = t[i - 1]! + (2 * DS) / Math.max(v[i - 1]! + v[i]!, 1e-3);
  return { n, v, t, stopIdx, len: (n - 1) * DS };
}

/** 路线的限速（弯道）。 */
export function curveCap(r: TramRoute): (s: number) => number {
  return (s) => {
    const R = radiusAt(r, s);
    return R === Infinity ? CRUISE_MS : Math.max(MIN_CURVE_MS, Math.sqrt(LAT_ACC * R));
  };
}

/** 运动时刻 m（不含停站）→ 沿线位置与速度（匀加速段解析插值）。 */
export function motionAt(p: SpeedProfile, m: number, out: { s: number; v: number }): void {
  const t = p.t;
  if (m <= 0) {
    out.s = 0;
    out.v = p.v[0]!;
    return;
  }
  if (m >= t[p.n - 1]!) {
    out.s = p.len;
    out.v = p.v[p.n - 1]!;
    return;
  }
  let lo = 0;
  let hi = p.n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid]! <= m) lo = mid;
    else hi = mid;
  }
  const v0 = p.v[lo]!;
  const v1 = p.v[hi]!;
  const dt = t[hi]! - t[lo]!;
  const a = dt > 0 ? (v1 - v0) / dt : 0;
  const u = m - t[lo]!;
  out.s = Math.min(lo * DS + v0 * u + 0.5 * a * u * u, hi * DS);
  out.v = v0 + a * u;
}

const hash01 = (n: number): number => {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** 站的基础停站时间（s）：19.5–23.5，加上每车 ±1.5 s 抖动后在 18–25 s 内。 */
export function baseDwell(stopSeed: number): number {
  return 19.5 + 4 * stopSeed;
}

export interface CarTimetable {
  /** 到站、离站时刻（一趟之内，s）。 */
  arrive: Float64Array;
  depart: Float64Array;
  /** 第 j 站之前的停站时间总和（s）。 */
  before: Float64Array;
  /** 一趟周期（s）。 */
  period: number;
  /** 相位（s）：τ = (t + phase) mod period。 */
  phase: number;
}

/** 一辆车的时刻表：dwells 为各站基础停站（s），seed 定抖动。 */
export function carTimetable(p: SpeedProfile, dwells: readonly number[], seed: number, phase: number): CarTimetable {
  const m = p.stopIdx.length;
  // 抖动成对正负（第 2i 站 +r、第 2i+1 站 −r）：部分和始终 ≤ 1.5 s，跑完一趟总和为 0
  const jit = Array.from({ length: m }, (_, j) => {
    const r = (hash01(seed * 977 + (j >> 1) * 131 + 7) - 0.5) * 3;
    return j === m - 1 && m % 2 === 1 ? 0 : j % 2 === 0 ? r : -r;
  });
  const arrive = new Float64Array(m);
  const depart = new Float64Array(m);
  const before = new Float64Array(m + 1);
  let acc = 0;
  for (let j = 0; j < m; j++) {
    const d = Math.max(dwells[j]! + jit[j]!, 12);
    before[j] = acc;
    arrive[j] = p.t[p.stopIdx[j]!]! + acc;
    depart[j] = arrive[j]! + d;
    acc += d;
  }
  before[m] = acc;
  return { arrive, depart, before, period: p.t[p.n - 1]! + acc, phase };
}

export interface CarState {
  /** 沿线位置（m）、速度（m/s）。 */
  s: number;
  v: number;
  /** 停在第几站（−1 = 在走）。 */
  atStop: number;
  /** 一趟之内的时刻 τ（s）。 */
  tau: number;
}

/** 时刻 t 的车辆状态（纯函数）。 */
export function carState(p: SpeedProfile, c: CarTimetable, t: number, out: CarState): CarState {
  const T = c.period;
  const tau = (((t + c.phase) % T) + T) % T;
  out.tau = tau;
  // 第一个「离站时刻 > τ」的站
  let lo = 0;
  let hi = c.depart.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c.depart[mid]! <= tau) lo = mid + 1;
    else hi = mid;
  }
  const j = lo;
  if (j < c.arrive.length && tau >= c.arrive[j]!) {
    out.s = p.stopIdx[j]! * DS;
    out.v = 0;
    out.atStop = j;
    return out;
  }
  const mv = { s: 0, v: 0 };
  motionAt(p, tau - c.before[j]!, mv);
  out.s = mv.s;
  out.v = mv.v;
  out.atStop = -1;
  return out;
}

/**
 * (t0, t1] 之间这辆车有没有打铃（离站前 BELL_LEAD_S 秒）：返回站下标，没有返回 −1。
 * 只看 t1 时停着的那一站（每帧时间很短）。
 */
export function bellBetween(c: CarTimetable, t0: number, t1: number, state: CarState): number {
  if (state.atStop < 0 || t1 <= t0) return -1;
  const ring = c.depart[state.atStop]! - BELL_LEAD_S;
  const tau1 = state.tau;
  const tau0 = tau1 - (t1 - t0);
  return tau0 < ring && tau1 >= ring ? state.atStop : -1;
}

/** 一条路线上的车数：按目标车距，且相邻两车时间间隔 ≥ MIN_HEADWAY_S（period 为一趟周期）。 */
export function carCount(len: number, period: number): number {
  return Math.max(2, Math.min(Math.round(len / HEADWAY_M), Math.floor(period / MIN_HEADWAY_S)));
}

/**
 * 一条路线上全部车的时刻表：车 k 的相位 = k·T/N + lead，lead 让第 0 号车在开场后 arriveAt 秒到第 firstStop 站
 * （「電車」机位开场就有车进站、停站、打铃开走）。
 */
export function routeTimetables(p: SpeedProfile, dwells: readonly number[], routeSeed: number, firstStop: number, arriveAt: number): CarTimetable[] {
  const probe = carTimetable(p, dwells, routeSeed, 0);
  const T = probe.period;
  const N = carCount(p.len, T);
  const lead = firstStop >= 0 && firstStop < probe.arrive.length ? probe.arrive[firstStop]! - arriveAt : 0;
  return Array.from({ length: N }, (_, k) => carTimetable(p, dwells, k === 0 ? routeSeed : routeSeed + k * 7919, lead + (k * T) / N));
}

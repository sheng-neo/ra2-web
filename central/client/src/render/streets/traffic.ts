/**
 * 车流模拟（realism C5）：车辆沿车道行驶，路口随机接续，跟车用简化 IDM（最小车距 ≥ 8 m 车头间距）；
 * 车道终点有交通灯时，红灯（及来得及停的黄灯）当作停在停车线上的虚拟前车，车会排队等灯；
 * 卡住（> 45 s 不动）或驶入死路就在别处重生。固定步长 0.1 s，从 0 推进到 SHARED.uTime：
 * 同一 uTime 的状态完全相同（与帧率无关），截图可复现。
 * 密度（20:00，照片 09 的中环晚高峰）：主干道每车道每 18–20 m 一辆（核心区），次干道 20 m，支路 80 m，街坊路 120 m；
 * 核心区外 × outside（默认 0.15，车尽量集中在看得见的核心区）；总数封顶，超出时整体按比例减。
 * 车型：主干道约 10 %、次干道 5 % 巴士，出租车约 18 %，其余私家车。
 */
import type { RoadClass } from '@central/data';
import { hash32 } from './lamp-placement';
import type { Lane } from './lanes';
import { SIGNAL_CYCLE_S, signalState } from './signals';

/** 每车道多少米一辆（核心区）。 */
export const SPACING_M: Partial<Record<RoadClass, number>> = {
  motorway: 22,
  trunk: 20,
  primary: 18,
  secondary: 20,
  tertiary: 80,
  residential: 120,
  unclassified: 120,
  living_street: 150,
  unknown: 150,
};
const BUS_CLASSES: ReadonlySet<RoadClass> = new Set(['trunk', 'primary', 'secondary', 'tertiary']);

export const VehicleKind = { Car: 0, Taxi: 1, Bus: 2 } as const;
export const CAR_LEN_M = 4.5;
export const BUS_LEN_M = 12;

export interface TrafficOptions {
  /** 车辆上限。 */
  cap: number;
  seed: number;
  /** 核心区（模拟坐标，米）：[minX, minY, maxX, maxY]。 */
  core: readonly [number, number, number, number];
  /** 核心区外的密度系数。 */
  outside?: number;
}

/** 模拟步长（s）。 */
export const SIM_DT = 0.1;
/** IDM 参数。 */
const ACC = 1.6;
const DEC = 2.8;
const HEADWAY_S = 1.1;
const GAP_M = 2.5;
// 红灯最长 30 s：等灯的车不能当成卡死重生
const STUCK_S = 45;

const u32 = (seed: number, a: number, b: number) => hash32(seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca77));
const unitOf = (seed: number, a: number, b: number) => u32(seed, a, b) / 4294967296;

export class Traffic {
  readonly n: number;
  readonly lane: Int32Array;
  readonly s: Float32Array;
  readonly v: Float32Array;
  readonly v0: Float32Array;
  readonly len: Float32Array;
  readonly kind: Uint8Array;
  readonly next: Int32Array;
  /** 本车已经过的路口数（用作随机流）。 */
  readonly hops: Int32Array;
  readonly stuck: Float32Array;
  /** 上一步加速度（m/s²），刹车灯用。 */
  readonly acc: Float32Array;
  /** 换车道后的位置过渡（three 坐标偏移，剩余米数）。 */
  readonly off: Float32Array;
  readonly offLeft: Float32Array;
  simTime = 0;
  private readonly spawn: { lane: number; w: number }[] = [];
  private readonly spawnTotal: number;
  private readonly initial: { lane: number; s: number; kind: number; v0: number }[] = [];
  private readonly byLane = new Map<number, number[]>();
  /** 各车道终点的信号相位（NaN = 无灯），见 signals.laneSignalPhases。 */
  private signalPhase: Float32Array | null = null;

  constructor(
    readonly lanes: readonly Lane[],
    readonly opts: TrafficOptions,
  ) {
    const [cx0, cy0, cx1, cy1] = opts.core;
    const outside = opts.outside ?? 0.15;
    // 各车道期望车数
    let total = 0;
    const want: number[] = [];
    for (const l of lanes) {
      const sp = SPACING_M[l.cls];
      const core = l.mid[0] >= cx0 && l.mid[0] <= cx1 && l.mid[1] >= cy0 && l.mid[1] <= cy1;
      const w = sp && l.next.length > 0 ? (l.len / sp) * (core ? 1 : outside) : 0;
      want.push(w);
      total += w;
      if (w > 0) this.spawn.push({ lane: l.id, w });
    }
    this.spawnTotal = this.spawn.reduce((a, b) => a + b.w, 0);
    const scale = total > opts.cap ? opts.cap / total : 1;
    for (const l of lanes) {
      const w = want[l.id]! * scale;
      let count = Math.floor(w + unitOf(opts.seed, l.id, 1));
      count = Math.min(count, Math.floor(l.len / 9));
      for (let k = 0; k < count && this.initial.length < opts.cap; k++) {
        const u = unitOf(opts.seed, l.id, 10 + k);
        const s = ((k + 0.5 + 0.5 * (u - 0.5)) * l.len) / count;
        const kr = unitOf(opts.seed, l.id, 100 + k);
        const busShare = l.cls === 'trunk' || l.cls === 'primary' ? 0.1 : 0.05;
        const kind = kr < busShare && BUS_CLASSES.has(l.cls) ? VehicleKind.Bus : kr < busShare + 0.18 ? VehicleKind.Taxi : VehicleKind.Car;
        this.initial.push({ lane: l.id, s, kind, v0: l.speed * (0.8 + 0.4 * unitOf(opts.seed, l.id, 200 + k)) });
      }
    }
    this.n = this.initial.length;
    const n = this.n;
    this.lane = new Int32Array(n);
    this.s = new Float32Array(n);
    this.v = new Float32Array(n);
    this.v0 = new Float32Array(n);
    this.len = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.next = new Int32Array(n);
    this.hops = new Int32Array(n);
    this.stuck = new Float32Array(n);
    this.acc = new Float32Array(n);
    this.off = new Float32Array(n * 3);
    this.offLeft = new Float32Array(n);
    this.reset();
  }

  /** 回到 t = 0 的初始状态。 */
  reset(): void {
    this.simTime = 0;
    this.initial.forEach((v, i) => {
      this.lane[i] = v.lane;
      this.s[i] = v.s;
      this.v0[i] = v.v0;
      this.v[i] = v.v0 * 0.8;
      this.kind[i] = v.kind;
      this.len[i] = v.kind === VehicleKind.Bus ? BUS_LEN_M : CAR_LEN_M;
      this.hops[i] = 0;
      this.stuck[i] = 0;
      this.acc[i] = 0;
      this.offLeft[i] = 0;
      this.next[i] = this.pickNext(i);
    });
  }

  private pickNext(i: number): number {
    const l = this.lanes[this.lane[i]!]!;
    if (l.next.length === 0) return -1;
    const k = u32(this.opts.seed + i * 7919, this.hops[i]!, 3) % l.next.length;
    return l.next[k]!;
  }

  private respawn(i: number): void {
    this.hops[i]!++;
    let r = unitOf(this.opts.seed + i * 104729, this.hops[i]!, 5) * this.spawnTotal;
    let lane = this.spawn[0]?.lane ?? 0;
    for (const sp of this.spawn) {
      r -= sp.w;
      if (r <= 0) {
        lane = sp.lane;
        break;
      }
    }
    this.lane[i] = lane;
    this.s[i] = unitOf(this.opts.seed + i, this.hops[i]!, 6) * this.lanes[lane]!.len;
    this.v[i] = this.v0[i]! * 0.5;
    this.stuck[i] = 0;
    this.offLeft[i] = 0;
    this.next[i] = this.pickNext(i);
  }

  /** 设置各车道终点的信号相位（NaN = 无灯）。 */
  setSignals(phases: Float32Array): void {
    this.signalPhase = phases;
  }

  /** 第 lane 条车道终点此刻是否要停（红灯；黄灯且离停车线还远）。 */
  private mustStop(lane: number, distToEnd: number): boolean {
    const ph = this.signalPhase?.[lane];
    if (ph === undefined || Number.isNaN(ph)) return false;
    const st = signalState(this.simTime / SIGNAL_CYCLE_S + ph);
    return st === 2 || (st === 1 && distToEnd > 18);
  }

  /** 推进一步（dt 秒）。 */
  step(dt: number): void {
    const by = this.byLane;
    for (const list of by.values()) list.length = 0;
    for (let i = 0; i < this.n; i++) {
      const k = this.lane[i]!;
      const list = by.get(k);
      if (list) list.push(i);
      else by.set(k, [i]);
    }
    for (const list of by.values()) if (list.length > 1) list.sort((a, b) => this.s[b]! - this.s[a]!);
    const rearOf = (lane: number): number => {
      const list = by.get(lane);
      return list && list.length > 0 ? list[list.length - 1]! : -1;
    };
    for (const list of by.values()) {
      for (let r = 0; r < list.length; r++) {
        const i = list[r]!;
        const lane = this.lanes[this.lane[i]!]!;
        let gap = Infinity;
        let dv = 0;
        if (r > 0) {
          const j = list[r - 1]!;
          gap = this.s[j]! - this.s[i]! - (this.len[i]! + this.len[j]!) / 2;
          dv = this.v[i]! - this.v[j]!;
        } else if (this.next[i]! >= 0) {
          const j = rearOf(this.next[i]!);
          if (j >= 0 && j !== i) {
            gap = lane.len - this.s[i]! + this.s[j]! - (this.len[i]! + this.len[j]!) / 2;
            dv = this.v[i]! - this.v[j]!;
          }
        }
        // 红灯：停车线（车道终点前 1.5 m）当作静止的前车
        const toEnd = lane.len - this.s[i]! - this.len[i]! / 2 - 1.5;
        if (toEnd > -0.5 && toEnd < gap && this.mustStop(this.lane[i]!, toEnd)) {
          gap = Math.max(toEnd, 0.05);
          dv = this.v[i]!;
        }
        const v = this.v[i]!;
        const v0 = this.v0[i]!;
        let a = ACC * (1 - Math.pow(v / v0, 4));
        if (gap < Infinity) {
          const sStar = GAP_M + v * HEADWAY_S + (v * dv) / (2 * Math.sqrt(ACC * DEC));
          const g = Math.max(gap, 0.1);
          a -= ACC * (sStar / g) * (sStar / g);
        }
        a = Math.max(a, -9);
        this.acc[i] = a;
        const nv = Math.max(0, v + a * dt);
        this.v[i] = gap <= 0 ? 0 : nv;
        this.s[i]! += this.v[i]! * dt;
        if (this.offLeft[i]! > 0) this.offLeft[i] = Math.max(0, this.offLeft[i]! - this.v[i]! * dt);
        this.stuck[i] = this.v[i]! < 0.3 ? this.stuck[i]! + dt : 0;
      }
    }
    for (let i = 0; i < this.n; i++) {
      if (this.stuck[i]! > STUCK_S) {
        this.respawn(i);
        continue;
      }
      let lane = this.lanes[this.lane[i]!]!;
      while (this.s[i]! > lane.len) {
        const nx = this.next[i]!;
        if (nx < 0) {
          this.respawn(i);
          break;
        }
        this.s[i]! -= lane.len;
        // 换车道：记下旧车道终点与新车道起点的错位，前 10 m 内渐变消掉
        const ox = lane.pts[lane.pts.length - 3]!;
        const oy = lane.pts[lane.pts.length - 2]!;
        const oz = lane.pts[lane.pts.length - 1]!;
        const nl = this.lanes[nx]!;
        this.off[i * 3] = ox - nl.pts[0]!;
        this.off[i * 3 + 1] = oy - nl.pts[1]!;
        this.off[i * 3 + 2] = oz - nl.pts[2]!;
        this.offLeft[i] = Math.hypot(this.off[i * 3]!, this.off[i * 3 + 2]!) > 0.3 ? TRANSITION_M : 0;
        this.lane[i] = nx;
        this.hops[i]!++;
        this.next[i] = this.pickNext(i);
        lane = nl;
      }
    }
    this.simTime += dt;
  }

  /** 推进到时刻 t（秒）；t 回退（uTime 回绕）时从头再来。每次最多 maxSteps 步，追不上就分几帧追。 */
  advanceTo(t: number, maxSteps = 400): void {
    if (t < this.simTime - 1) this.reset();
    let k = 0;
    while (this.simTime + SIM_DT <= t && k++ < maxSteps) this.step(SIM_DT);
  }
}

/** 换车道错位的渐变距离（m）。 */
export const TRANSITION_M = 10;

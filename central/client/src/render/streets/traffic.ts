/**
 * 车流模拟（realism C5，R2 STREETLIFE S3/S5 扩充）：车辆沿车道行驶，路口随机接续，跟车用简化 IDM（最小车距 ≥ 8 m 车头间距）；
 * 车道终点有交通灯时，红灯（及来得及停的黄灯）当作停在停车线上的虚拟前车，车会排队等灯；
 * 卡住（> 45 s 不动）或驶入死路就在别处重生。固定步长 0.1 s，从 0 推进到 SHARED.uTime：
 * 同一 uTime 的状态完全相同（与帧率无关），截图可复现。
 * 密度（20:00，照片 09 的中环晚高峰）：主干道每车道每 18–20 m 一辆（核心区），次干道 20 m，支路 80 m，街坊路 120 m；
 * 核心区外 × outside（默认 0.15，车尽量集中在看得见的核心区）；总数封顶，超出时整体按比例减。
 * 车型（R2 S5）：核心区德辅道中 / 干诺道中 / 皇后大道中 / 毕打街约 15 %、其余主次干道 10 % 双层巴士；
 * 核心区约 7 % 小巴、28 % 出租车（核心区外 20 %）、5 % 白色客货车、12 % MPV，其余私家车。
 *
 * 行人过路（R2 S3 红线）：setCrossings 给出各过路处的车行道矩形与信号相位。车辆在 crossingClosed（黄灯起到行人闪灯结束）
 * 时段不得驶入：过路处入口前 0.3 m 当作静止的前车；开放时段也「不堵过路处」——过路处之后到前车车尾（前车慢行时）
 * 或红灯停车线放不下整辆车，就在过路处前等。行人只在 [PED_GREEN, PED_FLASH) 内踏上车行道，所以人车不会同时在过路处上。
 */
import type { RoadClass } from '@central/data';
import { hash32 } from './lamp-placement';
import { lanePose, type Lane } from './lanes';
import { laneSweepSamples, quadsOverlap, sweptInterval, type SweepSample } from './sweep';
import { GREEN_END, PED_BLOCK_START, PED_GREEN, SIGNAL_CYCLE_S, crossingClosed, signalState } from './signals';

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

export const VehicleKind = { Car: 0, Taxi: 1, Bus: 2, Minibus: 3, Mpv: 4, Van: 5 } as const;
export const CAR_LEN_M = 4.5;
export const BUS_LEN_M = 12.4;
export const MINIBUS_LEN_M = 7.2;
/** 各车型车长（m）。 */
export const KIND_LEN_M = [4.6, 4.6, BUS_LEN_M, MINIBUS_LEN_M, 4.9, 5.0] as const;
/** 用巴士网格（双层巴士 / 小巴）的车型。 */
export const isBusKind = (k: number): boolean => k === VehicleKind.Bus || k === VehicleKind.Minibus;

/** 车型抽签（纯函数）：r 为 0–1 随机数；busy = 核心区的巴士走廊（德辅道中、干诺道中、皇后大道中、毕打街）。 */
export function pickKind(r: number, cls: RoadClass, core: boolean, busy: boolean): number {
  const bus = BUS_CLASSES.has(cls) ? (busy ? 0.15 : cls === 'tertiary' ? 0.03 : 0.1) : 0;
  const mini = core && cls !== 'residential' && cls !== 'living_street' ? 0.07 : 0.03;
  const taxi = core ? 0.28 : 0.2;
  const van = 0.05;
  const mpv = 0.12;
  let c = bus;
  if (r < c) return VehicleKind.Bus;
  if (r < (c += mini)) return VehicleKind.Minibus;
  if (r < (c += taxi)) return VehicleKind.Taxi;
  if (r < (c += van)) return VehicleKind.Van;
  if (r < (c += mpv)) return VehicleKind.Mpv;
  return VehicleKind.Car;
}

/** 过路处（three 坐标）：车行道矩形四角（xz 逆时针，已按车宽放宽）与信号相位。 */
export interface TrafficCrossing {
  /** [x0, z0, x1, z1, x2, z2, x3, z3]。 */
  corners: readonly number[];
  phase: number;
  /** 穿轨区（R2 修复轮）：电车沿线范围；有它时「开放」取决于电车预测，不看信号相位。 */
  tram?: { route: number; ra: number; rb: number };
  /** 不放宽的斑马线四角（xz）：车流按车身盒子登记过路处时用；没有就用 corners。 */
  zebra?: readonly number[];
}

/** 穿轨区占用预测（tram-traffic.ts TramOccupancy）。 */
export interface TramOracle {
  openLeft(t: number, route: number, ra: number, rb: number): number;
  /** 电车数与时刻 t 的车身盒子（three xz：x, z, hx, hz）——最后一道保险用。 */
  readonly count: number;
  poses(t: number, out: Float64Array): void;
}

/** 电车车身半长、半宽（m，tram/body.ts）+ 余量。 */
const TRAM_BOX_HL = 4.35 + 0.15;
const TRAM_BOX_HW = 1.175 + 0.15;

/** 过路处按车身盒子登记时盒子四周再放宽（m）。 */
const SWEEP_PAD_M = 0.15;

/** 穿轨区：车辆整车开出去要比电车到达早这么多秒。 */
export const TRAM_MARGIN_S = 2;

/** 某车道穿过某过路处的区间（沿车道 m）。 */
export interface LaneCrossing {
  c: number;
  e0: number;
  e1: number;
}

/**
 * 车道折线（three xz）穿过凸四边形的区间（纯函数，Cyrus–Beck 裁剪），返回 [进, 出]（沿车道 m）或 null。
 * 四边形顶点顺序任意（顺 / 逆时针都行）。
 */
export function laneThrough(l: Pick<Lane, 'pts' | 'cum'>, quad: readonly number[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const n = l.cum.length;
  // 四边形中心：用来把每条边的法线朝外
  const qcx = (quad[0]! + quad[2]! + quad[4]! + quad[6]!) / 4;
  const qcz = (quad[1]! + quad[3]! + quad[5]! + quad[7]!) / 4;
  for (let i = 1; i < n; i++) {
    const ax = l.pts[i * 3 - 3]!;
    const az = l.pts[i * 3 - 1]!;
    const bx = l.pts[i * 3]!;
    const bz = l.pts[i * 3 + 2]!;
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (let k = 0; k < 4 && ok; k++) {
      const px = quad[k * 2]!;
      const pz = quad[k * 2 + 1]!;
      const qx = quad[((k + 1) % 4) * 2]!;
      const qz = quad[((k + 1) % 4) * 2 + 1]!;
      let nx = qz - pz;
      let nz = -(qx - px);
      if (nx * (qcx - px) + nz * (qcz - pz) > 0) {
        nx = -nx;
        nz = -nz;
      }
      const num = nx * (ax - px) + nz * (az - pz);
      const den = nx * (bx - ax) + nz * (bz - az);
      if (Math.abs(den) < 1e-9) {
        if (num > 0) ok = false;
        continue;
      }
      const t = -num / den;
      if (den < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) ok = false;
    }
    if (!ok) continue;
    const seg = l.cum[i]! - l.cum[i - 1]!;
    lo = Math.min(lo, l.cum[i - 1]! + seg * t0);
    hi = Math.max(hi, l.cum[i - 1]! + seg * t1);
  }
  return lo <= hi ? [lo, hi] : null;
}

export interface TrafficOptions {
  /** 车辆上限。 */
  cap: number;
  seed: number;
  /** 核心区（模拟坐标，米）：[minX, minY, maxX, maxY]。 */
  core: readonly [number, number, number, number];
  /** 核心区外的密度系数。 */
  outside?: number;
  /** 车道是否属于巴士走廊（双层巴士比例 15 %）。 */
  busy?: (lane: Lane) => boolean;
  /** 车身中心轨迹采样（sweep.ts laneSweepSamples）；不给就自己算。 */
  sweeps?: SweepSample[][][];
}

/** 行人绿灯亮起后最多等多久（s）放行：再晚就整个周期不过马路（保证 PED_FLASH 前走完）。 */
export const RELEASE_MAX_S = 4;

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
  /** 巴士在站剩余停靠时间（s）与上一个已停过的站（车道、沿线位置），防止重复停。 */
  readonly dwell: Float32Array;
  readonly servedLane: Int32Array;
  readonly servedS: Float32Array;
  /** 换车道前的车道（车尾还在上面时算占用过路处）。 */
  readonly prevLane: Int32Array;
  /**
   * 各过路处本周期的行人放行时刻（s，Infinity = 还没放行）与周期编号：行人绿灯亮起后，
   * 过路处（按车宽放宽的范围）上没有车身才放行；绿灯亮起 RELEASE_MAX_S 内放不了就整个周期不放。
   */
  private release = new Float64Array(0);
  private releaseCycle = new Int32Array(0);
  /** 各车道上的巴士站（车头停靠位置，沿车道 m，升序）。 */
  private stops: number[][] = [];
  simTime = 0;
  private readonly spawn: { lane: number; w: number }[] = [];
  private readonly spawnTotal: number;
  private readonly initial: { lane: number; s: number; kind: number; v0: number; dwell?: number; served?: number }[] = [];
  private readonly byLane = new Map<number, number[]>();
  /** 各车道是不是路边车道（同一路同方向 slot 最大）。 */
  private readonly kerb: Uint8Array;
  /** 各车道终点的信号相位（NaN = 无灯），见 signals.laneSignalPhases。 */
  private signalPhase: Float32Array | null = null;
  /** 过路处与各车道穿过的过路处（按进入位置排序）：先是行人过路处（下标与 setCrossings 相同），后接穿轨区。 */
  private crossings: readonly TrafficCrossing[] = [];
  private pedCrossings: readonly TrafficCrossing[] = [];
  private tramZones: readonly { lane: number; e0: number; e1: number; route: number; ra: number; rb: number }[] = [];
  private tramOracle: TramOracle | null = null;
  /** crossingStop 的合并表（本车道 + 下一车道）。 */
  private readonly mergeC = new Int32Array(64);
  private readonly mergeE0 = new Float64Array(64);
  private readonly mergeE1 = new Float64Array(64);
  /** crossingStop 的副产品：本车车身此刻压在穿轨区上。 */
  private inTram = false;
  readonly laneCross: LaneCrossing[][] = [];

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
        const core = l.mid[0] >= cx0 && l.mid[0] <= cx1 && l.mid[1] >= cy0 && l.mid[1] <= cy1;
        const kind = pickKind(kr, l.cls, core, core && (opts.busy?.(l) ?? false));
        this.initial.push({ lane: l.id, s, kind, v0: l.speed * (0.8 + 0.4 * unitOf(opts.seed, l.id, 200 + k)) });
      }
    }
    // 路边车道：同一路同方向里 slot 最大的那条（靠左行驶，巴士站都在它旁边）
    const maxSlot = new Map<string, number>();
    for (const l of lanes) maxSlot.set(`${l.plan}:${l.dir}`, Math.max(maxSlot.get(`${l.plan}:${l.dir}`) ?? 0, l.slot));
    this.kerb = Uint8Array.from(lanes, (l) => (l.slot === maxSlot.get(`${l.plan}:${l.dir}`) ? 1 : 0));
    // 巴士 / 小巴开在路边车道上才会进站：同一路同方向非路边车道上的巴士，与路边车道上的小汽车换车型（确定性）
    const kerbCars = new Map<string, number[]>();
    this.initial.forEach((v, k) => {
      const l = lanes[v.lane]!;
      if (!this.kerb[l.id] || isBusKind(v.kind)) return;
      const key = `${l.plan}:${l.dir}`;
      const list = kerbCars.get(key);
      if (list) list.push(k);
      else kerbCars.set(key, [k]);
    });
    for (const v of this.initial) {
      const l = lanes[v.lane]!;
      if (this.kerb[l.id] || !isBusKind(v.kind)) continue;
      const j = kerbCars.get(`${l.plan}:${l.dir}`)?.pop();
      if (j === undefined) continue;
      const w = this.initial[j]!;
      [w.kind, v.kind] = [v.kind, w.kind];
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
    this.dwell = new Float32Array(n);
    this.servedLane = new Int32Array(n).fill(-1);
    this.servedS = new Float32Array(n);
    this.prevLane = new Int32Array(n).fill(-1);
    this.reset();
  }

  /** 回到 t = 0 的初始状态。 */
  reset(): void {
    this.simTime = 0;
    this.release.fill(Infinity);
    this.releaseCycle.fill(-2147483648);
    this.prevLane.fill(-1);
    this.initial.forEach((v, i) => {
      this.lane[i] = v.lane;
      this.s[i] = v.s;
      this.v0[i] = v.v0;
      this.v[i] = this.safeStartSpeed(v.lane, v.s, KIND_LEN_M[v.kind] ?? CAR_LEN_M, v.v0 * 0.8);
      this.kind[i] = v.kind;
      this.len[i] = KIND_LEN_M[v.kind] ?? CAR_LEN_M;
      this.hops[i] = 0;
      this.stuck[i] = 0;
      this.acc[i] = 0;
      this.offLeft[i] = 0;
      this.dwell[i] = v.dwell ?? 0;
      this.servedLane[i] = v.dwell ? v.lane : -1;
      this.servedS[i] = v.served ?? 0;
      this.next[i] = this.pickNext(i);
    });
  }

  private pickNext(i: number): number {
    return this.chooseNext(i, this.lane[i]!, this.hops[i]!);
  }

  /**
   * 车 i 在车道 from 尽头接哪条车道（hops = 随机流序号）。巴士 / 小巴（R2 修复轮）优先接路边车道，
   * 这样才会经过路边的巴士站、停站上落客；没有路边车道可接时照常随机。
   */
  private chooseNext(i: number, from: number, hops: number): number {
    const l = this.lanes[from]!;
    if (l.next.length === 0) return -1;
    const r = u32(this.opts.seed + i * 7919, hops, 3);
    if (isBusKind(this.kind[i]!)) {
      let kerb = 0;
      for (const n of l.next) if (this.kerb[n]) kerb++;
      if (kerb > 0) {
        let k = r % kerb;
        for (const n of l.next) if (this.kerb[n] && k-- === 0) return n;
      }
    }
    return l.next[r % l.next.length]!;
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
    this.s[i] = this.clearOfCrossings(lane, unitOf(this.opts.seed + i, this.hops[i]!, 6) * this.lanes[lane]!.len, this.len[i]!);
    this.v[i] = this.safeStartSpeed(lane, this.s[i]!, this.len[i]!, this.v0[i]! * 0.5);
    this.stuck[i] = 0;
    this.offLeft[i] = 0;
    this.dwell[i] = 0;
    this.prevLane[i] = -1;
    this.next[i] = this.pickNext(i);
  }

  /** 刷出来的车：前方过路处 / 穿轨区在刹车距离（4 m/s²）+ 跟车间距之内就从静止起步，不冲进去。 */
  private safeStartSpeed(lane: number, s: number, len: number, v: number): number {
    const front = s + len / 2;
    for (const x of this.laneCross[lane] ?? []) {
      if (x.e0 < front) continue;
      return x.e0 - front < (v * v) / 8 + GAP_M + 1 ? 0 : v;
    }
    return v;
  }

  /** 车身 [s − len/2, s + len/2] 若压在过路处 / 穿轨区上，挪到连成一片的这些区之后（放不下就挪到之前）。 */
  private clearOfCrossings(lane: number, s: number, len: number): number {
    const l = this.lanes[lane]!;
    const list = this.laneCross[lane] ?? [];
    // 车身中心不能落的区间（按 e0 排好序，相互重叠的连成一片）
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of list) {
      const a = x.e0 - 0.5 - len / 2;
      const b = x.e1 + 0.5 + len / 2;
      if (a > hi) {
        if (s > lo && s < hi) break;
        lo = a;
        hi = b;
      } else hi = Math.max(hi, b);
    }
    if (!(s > lo && s < hi)) return s;
    if (hi + 0.5 < l.len - len / 2) return hi + 0.5;
    return Math.max(lo - 0.5, 0);
  }

  /**
   * 设置过路处（three 坐标的车行道矩形，已按车宽放宽）：算出每条车道穿过哪些过路处，并把压在过路处上的初始车挪开。
   * 之后 reset() 回到 t = 0。
   */
  setCrossings(list: readonly TrafficCrossing[]): void {
    this.pedCrossings = list;
    this.rebuildCrossings();
  }

  /**
   * 穿轨区（R2 修复轮）：车道上压进电车车身范围的区间，与电车占用预测。车辆不在电车将到时驶入、也不停在区内。
   * 之后 reset() 回到 t = 0。
   */
  setTramZones(zones: readonly { lane: number; e0: number; e1: number; route: number; ra: number; rb: number }[], oracle: TramOracle): void {
    this.tramZones = zones;
    this.tramOracle = oracle;
    this.rebuildCrossings();
  }

  /** 车身中心轨迹采样（laneSweepSamples），只算一次。 */
  private sweepCache: SweepSample[][][] | null = null;

  private rebuildCrossings(): void {
    const ped = this.pedCrossings;
    const list: TrafficCrossing[] = [...ped];
    for (const z of this.tramZones) list.push({ corners: [], phase: NaN, tram: { route: z.route, ra: z.ra, rb: z.rb } });
    this.crossings = list;
    this.release = new Float64Array(list.length);
    this.releaseCycle = new Int32Array(list.length);
    this.laneCross.length = 0;
    // 车道段网格（30 m）粗筛
    const cell = 30;
    const grid = new Map<number, number[]>();
    this.lanes.forEach((l) => {
      this.laneCross[l.id] = [];
      const seen = new Set<number>();
      for (let i = 0; i < l.cum.length; i++) {
        const k = Math.floor(l.pts[i * 3]! / cell) * 65536 + Math.floor(l.pts[i * 3 + 2]! / cell);
        if (seen.has(k)) continue;
        seen.add(k);
        const cellList = grid.get(k);
        if (cellList) cellList.push(l.id);
        else grid.set(k, [l.id]);
      }
    });
    // 车身盒子（按车道位姿画的刚体盒子，含换道错位渐变）真的碰到斑马线的范围，按车头口径登记
    const samples: SweepSample[][][] = ped.length > 0 ? (this.sweepCache ??= this.opts.sweeps ?? laneSweepSamples(this.lanes)) : [];
    ped.forEach((c, ci) => {
      const quad = c.zebra ?? c.corners;
      const cand = new Set<number>();
      let x0 = Infinity;
      let z0 = Infinity;
      let x1 = -Infinity;
      let z1 = -Infinity;
      for (let k = 0; k < 4; k++) {
        x0 = Math.min(x0, c.corners[k * 2]!);
        x1 = Math.max(x1, c.corners[k * 2]!);
        z0 = Math.min(z0, c.corners[k * 2 + 1]!);
        z1 = Math.max(z1, c.corners[k * 2 + 1]!);
      }
      // 车道点距可达 16 m：多看一圈
      for (let gx = Math.floor(x0 / cell) - 1; gx <= Math.floor(x1 / cell) + 1; gx++)
        for (let gz = Math.floor(z0 / cell) - 1; gz <= Math.floor(z1 / cell) + 1; gz++) for (const id of grid.get(gx * 65536 + gz) ?? []) cand.add(id);
      const near = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 + 8 };
      for (const id of cand) {
        const hit = sweptInterval(samples[id]!, (q) => quadsOverlap(q, quad), SWEEP_PAD_M, near);
        if (hit) this.laneCross[id]!.push({ c: ci, e0: hit[0], e1: hit[1] });
      }
    });
    this.tramZones.forEach((z, k) => this.laneCross[z.lane]?.push({ c: ped.length + k, e0: z.e0, e1: z.e1 }));
    for (const l of this.laneCross) l?.sort((a, b) => a.e0 - b.e0);
    this.initial.forEach((v) => {
      v.s = this.clearOfCrossings(v.lane, v.s, KIND_LEN_M[v.kind] ?? CAR_LEN_M);
    });
    this.reset();
  }

  /**
   * 车 i（车头在本车道 front 处）前方最近一个此刻不能驶入的过路处：返回车头到停车点的距离（m），没有返回 Infinity。
   * leaderGap：车头到前车车尾的距离；leaderV：前车车速（无前车 Infinity，< 4 m/s 算慢行）；stopLine：车头到红灯停车线的距离（无则 Infinity）。
   */
  private crossingStop(i: number, lane: Lane, front: number, leaderGap: number, leaderV: number, stopLine: number): number {
    const t = this.simTime;
    const len = this.len[i]!;
    const leaderSlow = leaderV < 4;
    // 开过 d 米要多久（s）：前车慢行时按前车速度，否则按起步加速（1.6 m/s²）
    const v0 = this.v[i]!;
    // 起步加速到期望车速后匀速（不低估：穿轨区要靠它算电车来之前开不开得出去）
    const vMax = Math.max(this.v0[i]!, v0, 0.5);
    const da = (vMax * vMax - v0 * v0) / (2 * ACC);
    const eta = (d: number) => {
      if (leaderSlow) return d / Math.max(leaderV, 0.3);
      const dd = Math.max(d, 0);
      return dd <= da ? (-v0 + Math.sqrt(v0 * v0 + 2 * ACC * dd)) / ACC : (vMax - v0) / ACC + (dd - da) / vMax;
    };
    // 车道终点的停车线：绿灯剩下的时间不够车头开过停车线（再留 2 s），就当作会停的地方
    const endRisk = (laneId: number, endS: number): number => {
      const ph = this.signalPhase?.[laneId];
      if (ph === undefined || Number.isNaN(ph)) return Infinity;
      const f = (((t / SIGNAL_CYCLE_S + ph) % 1) + 1) % 1;
      const greenLeft = f < GREEN_END ? (GREEN_END - f) * SIGNAL_CYCLE_S : 0;
      return greenLeft < eta(endS - front) + 2 ? endS : Infinity;
    };
    // 某过路处还开多久（s）：已封闭为 0；穿轨区 = 离电车到达还有多久（减去余量）
    const openLeft = (c: TrafficCrossing): number => {
      if (c.tram) return this.tramOracle ? Math.max(0, this.tramOracle.openLeft(t, c.tram.route, c.tram.ra, c.tram.rb) - TRAM_MARGIN_S) : Infinity;
      if (crossingClosed(t, c.phase)) return 0;
      const f = (((t / SIGNAL_CYCLE_S + c.phase) % 1) + 1) % 1;
      return ((((PED_BLOCK_START - f) % 1) + 1) % 1) * SIGNAL_CYCLE_S;
    };
    // 本车道与下一条车道上的过路处 / 穿轨区合成一张表（沿本车道 m，下一条车道的加上本车道长）：
    // 路口节点常常就在路轨中间，一个穿轨区会被车道接缝切成两段，要当作一个整体
    const mc = this.mergeC;
    const m0 = this.mergeE0;
    const m1 = this.mergeE1;
    let mn = 0;
    for (const x of this.laneCross[lane.id] ?? []) {
      if (mn >= mc.length) break;
      mc[mn] = x.c;
      m0[mn] = x.e0;
      m1[mn++] = x.e1;
    }
    const nx = this.next[i]!;
    const nextLen = nx >= 0 ? this.lanes[nx]!.len : 0;
    if (nx >= 0 && lane.len - front < 60)
      for (const x of this.laneCross[nx] ?? []) {
        if (mn >= mc.length) break;
        mc[mn] = x.c;
        m0[mn] = x.e0 + lane.len;
        m1[mn++] = x.e1 + lane.len;
      }
    // 再下一条车道（路口里的短车道常常整条在路轨上）：它的过路处、它上面最后一辆车（前车）
    const nnx = nx >= 0 && lane.len + nextLen - front < 80 ? this.peekNext(i, nx) : -1;
    const off2 = lane.len + nextLen;
    if (nnx >= 0) {
      for (const x of this.laneCross[nnx] ?? []) {
        if (mn >= mc.length) break;
        mc[mn] = x.c;
        m0[mn] = x.e0 + off2;
        m1[mn++] = x.e1 + off2;
      }
      if (leaderV === Infinity) {
        const list = this.byLane.get(nnx);
        const j = list && list.length > 0 ? list[list.length - 1]! : -1;
        if (j >= 0 && j !== i) {
          leaderGap = off2 + this.s[j]! - this.len[j]! / 2 - front;
          leaderV = this.v[j]!;
        }
      }
    }
    if (mn === 0) return Infinity;
    // 驶入一个过路处之前：此后连着的几个过路处（间隔放不下整辆车）当作一个整体
    const blocked = (k: number): boolean => {
      let end = m1[k]!;
      const c0 = this.crossings[mc[k]!]!;
      let minOpen = openLeft(c0);
      let slack = c0.tram ? 0 : 6;
      let anyTram = !!c0.tram;
      if (minOpen <= 0) return true;
      for (let j = k + 1; j < mn; j++) {
        if (m0[j]! - end >= len + GAP_M + 0.5) break;
        const cy = this.crossings[mc[j]!]!;
        const o = openLeft(cy);
        anyTram ||= !!cy.tram;
        if (o + (cy.tram ? 0 : 6) < minOpen + slack) {
          minOpen = o;
          slack = cy.tram ? 0 : 6;
        }
        if (o <= 0) return true;
        end = Math.max(end, m1[j]!);
      }
      // 连着穿轨区的：整串都要在任何一处封闭之前开出去（不能开到一半停在路轨上等行人过路处）
      if (anyTram) slack = 0;
      // 不堵过路处：出口之后到前车车尾、到会停的停车线，要放得下整辆车
      // （前车只会往前开，用它此刻的车尾就保守；IDM 跟车留 GAP_M，再加 0.5 m）
      let room = Infinity;
      if (leaderV < Infinity) room = Math.min(room, front + leaderGap - end);
      if (stopLine < Infinity) room = Math.min(room, front + stopLine - end);
      const endHere = lane.len - 1.5;
      // 本车道停车线在过路处之后或之中才算（整个过路处都在下一条车道上时，红灯会先停在停车线）
      if (endHere >= m0[k]! - 0.5) room = Math.min(room, endRisk(lane.id, endHere) - end);
      if (nx >= 0) room = Math.min(room, endRisk(nx, lane.len + nextLen - 1.5) - end);
      if (nnx >= 0) room = Math.min(room, endRisk(nnx, off2 + this.lanes[nnx]!.len - 1.5) - end);
      if (room < len + GAP_M + 0.5) return true;
      // 来得及开出去：前车慢行时按前车速度，否则按起步加速（1.6 m/s²）估计整车离开的时间；
      // 要在封闭（之后还有 ≥ 8.4 s 行人才起步）前后的余量内；穿轨区没有余量（openLeft 已减去 TRAM_MARGIN_S）
      return eta(end + len + 0.5 - front) > minOpen + slack;
    };
    // 已经驶入的（车头过了入口）继续开出去；与它连着、停下来车尾还压在区里的也算已驶入
    let inEnd = -Infinity;
    for (let k = 0; k < mn; k++) {
      const e0 = m0[k]!;
      // （只对穿轨区这样连；行人过路处一定要在入口前停得住）
      if (front >= e0 + 0.2 || (e0 - inEnd < len + 0.5 && this.crossings[mc[k]!]!.tram)) {
        if (front - len < m1[k]! + 0.2) {
          inEnd = Math.max(inEnd, m1[k]!);
          // 车身压在穿轨区上：红灯也要先开出去（不停在路轨上）
          if (this.crossings[mc[k]!]!.tram && front > e0 - 0.2) this.inTram = true;
        }
        continue;
      }
      if (e0 - front > 60) return Infinity;
      // 车身还压在穿轨区上：前面的行人过路处只要此刻没封闭就开上去（行人等过路处上没有车身才放行），先离开路轨
      if (this.inTram && !this.crossings[mc[k]!]!.tram) return openLeft(this.crossings[mc[k]!]!) <= 0 ? e0 - 0.3 - front : Infinity;
      return blocked(k) ? e0 - 0.3 - front : Infinity;
    }
    return Infinity;
  }

  /**
   * 巴士站（R2 S4/S5）：lanes[车道 id] = 该车道上巴士车头停靠的位置（沿车道 m）。双层巴士与小巴到站停 12–22 s 再开。
   */
  setBusStops(stops: readonly (readonly number[])[]): void {
    // 停靠时车身不能压在过路处上：这样的站不停
    this.stops = stops.map((l, lane) =>
      [...l]
        .filter((s) => !(this.laneCross[lane] ?? []).some((x) => s > x.e0 - 1 && s - BUS_LEN_M - 1 < x.e1))
        .sort((a, b) => a - b),
    );
    // 开场时约四成巴士站已经有一辆双层巴士在上落客（R2 修复轮：巴士站一眼就是巴士站）：
    // 把这条车道上离站最近、身后放得下整辆巴士的那辆车换成双层巴士，车头对准停靠点，再停 10–40 s
    const byLane = new Map<number, number[]>();
    this.initial.forEach((v, k) => {
      const list = byLane.get(v.lane);
      if (list) list.push(k);
      else byLane.set(v.lane, [k]);
    });
    this.stops.forEach((list, lane) => {
      for (const stop of list) {
        if (unitOf(this.opts.seed, lane, 900 + Math.round(stop)) > 0.42) continue;
        const ids = byLane.get(lane) ?? [];
        const c = stop - BUS_LEN_M / 2;
        // 站后一辆巴士的位置上不能有别的车
        const clash = ids.filter((k) => Math.abs(this.initial[k]!.s - c) < BUS_LEN_M / 2 + 5);
        if (clash.length !== 1) continue;
        const v = this.initial[clash[0]!]!;
        v.kind = VehicleKind.Bus;
        v.s = c;
        v.dwell = 10 + 30 * unitOf(this.opts.seed, lane, 950 + Math.round(stop));
        v.served = stop;
      }
    });
    this.reset();
  }

  /**
   * 开场就停在站上的车（setBusStops 安排的）：车辆下标、车道、停靠点（沿车道 m）。
   * R3 LIVERIES 用它让这辆车挂该站真实停靠的路线（liveries/fleet.ts busStopHints）。
   */
  initialDwellers(): { i: number; lane: number; s: number }[] {
    const out: { i: number; lane: number; s: number }[] = [];
    this.initial.forEach((v, i) => {
      if (v.dwell && v.served !== undefined) out.push({ i, lane: v.lane, s: v.served });
    });
    return out;
  }

  /** 巴士 i 前方 60 m 内未停过的站：车头到停靠点的距离（m），没有返回 Infinity。 */
  private busStopAhead(i: number, lane: number, front: number): number {
    const list = this.stops[lane];
    if (!list) return Infinity;
    for (const s of list) {
      if (s < front - 1.0) continue;
      if (this.servedLane[i] === lane && Math.abs(this.servedS[i]! - s) < 0.5) continue;
      return s - front <= 60 ? s - front : Infinity;
    }
    return Infinity;
  }

  /** 设置各车道终点的信号相位（NaN = 无灯）。 */
  setSignals(phases: Float32Array): void {
    this.signalPhase = phases;
  }

  /** 车 i 驶入 nx 之后会接的车道（与 pickNext 同一随机流：换道时 hops + 1）。 */
  private peekNext(i: number, nx: number): number {
    return this.chooseNext(i, nx, this.hops[i]! + 1);
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
        const red = toEnd > -0.5 && this.mustStop(this.lane[i]!, toEnd);
        // 行人过路处（R2 S3）：不得驶入 / 会堵住过路处时，入口前当作静止的前车
        this.inTram = false;
        if (this.crossings.length > 0) {
          let leaderV = Infinity;
          if (r > 0) leaderV = this.v[list[r - 1]!]!;
          else if (this.next[i]! >= 0) {
            const j = rearOf(this.next[i]!);
            if (j >= 0 && j !== i) leaderV = this.v[j]!;
          }
          const toX = this.crossingStop(i, lane, this.s[i]! + this.len[i]! / 2, gap, leaderV, red ? toEnd : Infinity);
          if (toX < gap) {
            gap = toX <= 0 ? 0 : toX;
            dv = this.v[i]!;
          }
        }
        if (red && toEnd < gap && !this.inTram) {
          gap = Math.max(toEnd, 0.05);
          dv = this.v[i]!;
        }
        // 巴士进站：停靠点当作静止的前车；停稳后停 12–22 s
        const k = this.kind[i]!;
        if ((k === VehicleKind.Bus || k === VehicleKind.Minibus) && this.stops.length > 0) {
          if (this.dwell[i]! > 0) {
            this.dwell[i] = Math.max(0, this.dwell[i]! - dt);
            gap = 0;
            dv = this.v[i]!;
          } else {
            const front = this.s[i]! + this.len[i]! / 2;
            const toStop = this.busStopAhead(i, this.lane[i]!, front);
            if (toStop < Infinity) {
              if (this.v[i]! < 0.4 && toStop < 1.0) {
                this.dwell[i] = 12 + 10 * unitOf(this.opts.seed + i, this.hops[i]!, 77);
                this.servedLane[i] = this.lane[i]!;
                this.servedS[i] = front + toStop;
                gap = 0;
                dv = this.v[i]!;
              } else if (toStop + GAP_M - 0.3 < gap) {
                // IDM 会在虚拟前车后留 GAP_M：把虚拟前车放在站点之后 GAP_M，车头正好停在站点
                gap = Math.max(toStop + GAP_M - 0.3, 0.05);
                dv = this.v[i]!;
              }
            }
          }
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
        this.stuck[i] = this.v[i]! < 0.3 && this.dwell[i]! <= 0 ? this.stuck[i]! + dt : 0;
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
        this.prevLane[i] = this.lane[i]!;
        this.lane[i] = nx;
        this.hops[i]!++;
        this.next[i] = this.pickNext(i);
        lane = nl;
      }
    }
    this.simTime += dt;
    if (this.tramOracle) this.tramGuard();
    if (this.crossings.length > 0) this.updateRelease();
  }

  /**
   * 最后一道保险（R2 修复轮）：车身盒子（与渲染同一位姿）此刻与电车车身相交，或停着（< 1 m/s）而电车 0.6 s 后会压到，
   * 就把这辆车挪去别处重生。正常情况下穿轨区规则已让车不进电车的路（测试里 600 s 内触发 ≤ 数次）。
   */
  private tramGuard(): void {
    const o = this.tramOracle!;
    const n = o.count;
    if (this.tramNow.length < n * 4) {
      this.tramNow = new Float64Array(n * 4);
      this.tramSoon = new Float64Array(n * 4);
    }
    o.poses(this.simTime, this.tramNow);
    o.poses(this.simTime + 0.6, this.tramSoon);
    const p = this.guardPose;
    const a = this.guardA;
    const b = this.guardB;
    for (let i = 0; i < this.n; i++) {
      const lane = this.lanes[this.lane[i]!]!;
      lanePose(lane, this.s[i]!, p);
      const k = this.offLeft[i]! / TRANSITION_M;
      const cx = p.x + this.off[i * 3]! * k;
      const cz = p.z + this.off[i * 3 + 2]! * k;
      const hw = this.kind[i] === VehicleKind.Bus || this.kind[i] === VehicleKind.Minibus ? 1.25 : 0.92;
      obbInto(cx, cz, p.hx, p.hz, this.len[i]! / 2, hw, a);
      const slow = this.v[i]! < 1;
      for (let j = 0; j < n; j++) {
        for (let m = 0; m < (slow ? 2 : 1); m++) {
          const T = m === 0 ? this.tramNow : this.tramSoon;
          const tx = T[j * 4]!;
          const tz = T[j * 4 + 1]!;
          if (Math.abs(tx - cx) > 14 || Math.abs(tz - cz) > 14) continue;
          obbInto(tx, tz, T[j * 4 + 2]!, T[j * 4 + 3]!, TRAM_BOX_HL, TRAM_BOX_HW, b);
          if (quadsOverlap(a, b)) {
            this.guardRespawns++;
            this.respawn(i);
            j = n;
            break;
          }
        }
      }
    }
  }

  /** 保险触发次数（测试 / 调试）。 */
  guardRespawns = 0;
  private tramNow = new Float64Array(0);
  private tramSoon = new Float64Array(0);
  private readonly guardPose = { x: 0, y: 0, z: 0, hx: 1, hz: 0 };
  private readonly guardA: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  private readonly guardB: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

  /** 车身（按车道、含换车道后的错位）是否压在过路处（放宽范围）上：逐车标记。 */
  private occupied(): Uint8Array {
    const occ = new Uint8Array(this.crossings.length);
    for (let i = 0; i < this.n; i++) {
      const k = this.offLeft[i]! / TRANSITION_M;
      const slack = k > 0 ? Math.hypot(this.off[i * 3]!, this.off[i * 3 + 2]!) * k : 0;
      const front = this.s[i]! + this.len[i]! / 2 + slack;
      const rear = this.s[i]! - this.len[i]! / 2 - slack;
      for (const x of this.laneCross[this.lane[i]!] ?? []) if (front > x.e0 - 0.2 && rear < x.e1 + 0.2) occ[x.c] = 1;
      const pl = this.prevLane[i]!;
      if (rear < 0 && pl >= 0) {
        const L = this.lanes[pl]!.len;
        for (const x of this.laneCross[pl] ?? []) if (L + rear < x.e1 + 0.2 && L > x.e0) occ[x.c] = 1;
      }
    }
    return occ;
  }

  /** 每步：行人绿灯亮起后（RELEASE_MAX_S 内），过路处上没有车就放行。 */
  private updateRelease(): void {
    const t = this.simTime;
    let occ: Uint8Array | null = null;
    for (let c = 0; c < this.pedCrossings.length; c++) {
      const ph = this.crossings[c]!.phase;
      const k = Math.floor(t / SIGNAL_CYCLE_S + ph - PED_GREEN);
      if (this.releaseCycle[c] !== k) {
        this.releaseCycle[c] = k;
        this.release[c] = Infinity;
      }
      if (this.release[c]! < Infinity) continue;
      const g = (k + PED_GREEN - ph) * SIGNAL_CYCLE_S;
      if (t < g - 1e-6 || t > g + RELEASE_MAX_S) continue;
      occ ??= this.occupied();
      if (!occ[c]) this.release[c] = t;
    }
  }

  /**
   * 过路处 c 在绿色行人灯起点 g（s）那个周期的放行延迟（s）：0–RELEASE_MAX_S；
   * 还没放行返回 Infinity；该周期没能放行（超过 RELEASE_MAX_S）或还没模拟到返回 NaN。
   */
  releaseDelay(c: number, g: number): number {
    const ph = this.crossings[c]?.phase;
    if (ph === undefined) return 0;
    const k = Math.round(g / SIGNAL_CYCLE_S + ph - PED_GREEN);
    if (this.releaseCycle[c] !== k) return this.simTime < g ? Infinity : NaN;
    const r = this.release[c]!;
    if (r < Infinity) return r - g;
    return this.simTime > g + RELEASE_MAX_S ? NaN : Infinity;
  }

  /** 推进到时刻 t（秒）；t 回退（uTime 回绕）时从头再来。每次最多 maxSteps 步，追不上就分几帧追。 */
  advanceTo(t: number, maxSteps = 400): void {
    if (t < this.simTime - 1) this.reset();
    let k = 0;
    while (this.simTime + SIM_DT <= t && k++ < maxSteps) this.step(SIM_DT);
  }
}

/** 有向矩形四角（xz 平铺）。 */
function obbInto(cx: number, cz: number, hx: number, hz: number, hl: number, hw: number, out: number[]): void {
  const sx = -hz;
  const sz = hx;
  out[0] = cx + hx * hl + sx * hw;
  out[1] = cz + hz * hl + sz * hw;
  out[2] = cx - hx * hl + sx * hw;
  out[3] = cz - hz * hl + sz * hw;
  out[4] = cx - hx * hl - sx * hw;
  out[5] = cz - hz * hl - sz * hw;
  out[6] = cx + hx * hl - sx * hw;
  out[7] = cz + hz * hl - sz * hw;
}

/** 换车道错位的渐变距离（m）。 */
export const TRANSITION_M = 10;

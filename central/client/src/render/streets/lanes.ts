/**
 * 车道（realism C5）：由可驾驶道路的 RoadPlan 生成有向车道折线（three 坐标，米）与路口连接。
 * 香港靠左行驶：车辆的横向偏移在其行驶方向的左侧（PLAN §7.4：北行车道 x 小于中心线 x）。
 * 单行路按 Road.oneway：1 = 沿 pts 方向，−1 = 逆 pts 方向。
 * 路口连接：车道终点所在节点（道路端点，≤ 1 m）上所有从该节点出发的车道；不掉头（除非是死路）。
 */
import type { Road, RoadClass } from '@central/data';
import { simToThree } from '../../coords';
import { centreZ, type RoadPlan } from '../roads';

/** 有车流的道路等级与基础车速（m/s）。服务道路、行人街没有车流。 */
export const LANE_SPEED: Partial<Record<RoadClass, number>> = {
  motorway: 16,
  trunk: 14,
  primary: 11,
  secondary: 9,
  tertiary: 7,
  residential: 6,
  unclassified: 6,
  living_street: 5,
  unknown: 6,
};

/** 一条路上的车道：dir = 1 沿 pts，−1 逆 pts；across = 车道中心的横向偏移（m，pts 前进方向左正）。 */
export interface LaneSlot {
  dir: 1 | -1;
  across: number;
}

/**
 * 车道横向位置（纯函数，可测）。hw：车行道半宽（m）。
 * 单行：全部车道同向、铺满路宽；双向：中线左侧（across > 0）是沿 pts 方向的车道，右侧是逆向车道——
 * 对两个方向的司机来说，自己的车道都在中线的左边（靠左行驶）。
 */
export function laneSlots(lanes: number, oneway: Road['oneway'], hw: number): LaneSlot[] {
  const out: LaneSlot[] = [];
  if (oneway !== 0) {
    const n = Math.max(lanes, 1);
    const lw = (2 * hw) / n;
    for (let i = 0; i < n; i++) out.push({ dir: oneway, across: -hw + (i + 0.5) * lw });
    return out;
  }
  const n = Math.max(lanes, 2);
  if (n <= 2) return [
    { dir: 1, across: hw / 2 },
    { dir: -1, across: -hw / 2 },
  ];
  const lw = (2 * hw) / n;
  for (let i = 0; i < n; i++) {
    const c = -hw + (i + 0.5) * lw;
    if (Math.abs(c) < 0.25 * lw) continue;
    out.push({ dir: c > 0 ? 1 : -1, across: c });
  }
  return out;
}

export interface Lane {
  id: number;
  cls: RoadClass;
  /** 折线（three 坐标，米）xyz 平铺；cum 为各点累计长度（m）。 */
  pts: Float32Array;
  cum: Float32Array;
  len: number;
  speed: number;
  /** 起终点节点键。 */
  from: string;
  to: string;
  /** 可接续的车道 id。 */
  next: number[];
  /** 同一路（RoadPlan 下标）、方向。 */
  plan: number;
  dir: 1 | -1;
  /** 车道在同向车道中的序号（0 = 最左 / 路边）。 */
  slot: number;
  /** 模拟坐标（米）的中点，用于判断是否在核心区。 */
  mid: [number, number];
}

const nodeKey = (x: number, y: number) => `${Math.round(x / 10)},${Math.round(y / 10)}`;

/** 车道折线：中线各点向左偏 across（m），高度取中线路面高（水平横截面）+ 0。 */
function laneLine(p: RoadPlan, across: number, dir: 1 | -1): { pts: Float32Array; cum: Float32Array; len: number } {
  const n = p.pts.length >> 1;
  const xyz: number[] = [];
  const v = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = Math.max(i - 1, 0);
    const b = Math.min(i + 1, n - 1);
    const dx = p.pts[b * 2]! - p.pts[a * 2]!;
    const dy = p.pts[b * 2 + 1]! - p.pts[a * 2 + 1]!;
    const l = Math.hypot(dx, dy) || 1;
    const x = p.pts[i * 2]! - (dy / l) * across * 10;
    const y = p.pts[i * 2 + 1]! + (dx / l) * across * 10;
    const z = p.level ? centreZ(p, p.along[i]!) : p.height(x, y, p.along[i]!);
    simToThree(x, y, z, v);
    xyz.push(v[0]!, v[1]!, v[2]!);
  }
  if (dir < 0) {
    const rev: number[] = [];
    for (let i = n - 1; i >= 0; i--) rev.push(xyz[i * 3]!, xyz[i * 3 + 1]!, xyz[i * 3 + 2]!);
    xyz.splice(0, xyz.length, ...rev);
  }
  const pts = new Float32Array(xyz);
  const cum = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1]! + Math.hypot(pts[i * 3]! - pts[i * 3 - 3]!, pts[i * 3 + 1]! - pts[i * 3 - 2]!, pts[i * 3 + 2]! - pts[i * 3 - 1]!);
  }
  return { pts, cum, len: cum[n - 1]! };
}

export function buildLanes(plans: readonly RoadPlan[]): Lane[] {
  const lanes: Lane[] = [];
  plans.forEach((p, pi) => {
    const speed = LANE_SPEED[p.road.cls];
    if (speed === undefined) return;
    const n = p.pts.length >> 1;
    const a = nodeKey(p.road.pts[0]!, p.road.pts[1]!);
    const rn = p.road.pts.length >> 1;
    const b = nodeKey(p.road.pts[rn * 2 - 2]!, p.road.pts[rn * 2 - 1]!);
    const slots = laneSlots(p.road.lanes, p.road.oneway, p.hw / 10);
    const counters = { 1: 0, [-1]: 0 } as Record<number, number>;
    for (const s of slots) {
      const line = laneLine(p, s.across, s.dir);
      if (line.len < 1) continue;
      lanes.push({
        id: lanes.length,
        cls: p.road.cls,
        ...line,
        speed,
        from: s.dir > 0 ? a : b,
        to: s.dir > 0 ? b : a,
        next: [],
        plan: pi,
        dir: s.dir,
        slot: counters[s.dir]!++,
        mid: [p.pts[(n >> 1) * 2]! / 10, p.pts[(n >> 1) * 2 + 1]! / 10],
      });
    }
  });
  const byFrom = new Map<string, Lane[]>();
  for (const l of lanes) {
    const list = byFrom.get(l.from);
    if (list) list.push(l);
    else byFrom.set(l.from, [l]);
  }
  for (const l of lanes) {
    const out = (byFrom.get(l.to) ?? []).filter((o) => o.plan !== l.plan);
    // 只能掉头时才掉头
    const pool = out.length > 0 ? out : (byFrom.get(l.to) ?? []).filter((o) => o.id !== l.id);
    l.next = pool.map((o) => o.id);
  }
  return lanes;
}

/** 车道上沿线 s（m）处的位置与水平朝向（three 坐标）。 */
export function lanePose(l: Pick<Lane, 'pts' | 'cum' | 'len'>, s: number, out: { x: number; y: number; z: number; hx: number; hz: number }): void {
  const n = l.cum.length;
  const t = Math.min(Math.max(s, 0), l.len);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (l.cum[mid]! <= t) lo = mid;
    else hi = mid;
  }
  const seg = l.cum[hi]! - l.cum[lo]! || 1;
  const f = (t - l.cum[lo]!) / seg;
  const p = l.pts;
  const ax = p[lo * 3]!;
  const ay = p[lo * 3 + 1]!;
  const az = p[lo * 3 + 2]!;
  const bx = p[hi * 3]!;
  const by = p[hi * 3 + 1]!;
  const bz = p[hi * 3 + 2]!;
  out.x = ax + (bx - ax) * f;
  out.y = ay + (by - ay) * f;
  out.z = az + (bz - az) * f;
  const hl = Math.hypot(bx - ax, bz - az) || 1;
  out.hx = (bx - ax) / hl;
  out.hz = (bz - az) / hl;
}

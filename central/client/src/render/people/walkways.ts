/**
 * 行人走道（R2 STREETLIFE S1，纯函数，可测）：由道路规划（RoadPlan）推出行人可以走的地方。
 * 全部用模拟坐标「米」（x 东、y 北、z mPD）；换算到 three 只在渲染层经 coords.ts。
 *
 * - 行人路：地面可驾驶道路两侧有人行道（pavL / pavR ≥ 1.6 m）的连续段，人行道中线左右各一条「靠左走」的走线，
 *   两条走线在段两端接成环（走到尽头转身走回来，不会凭空消失）；
 * - 行人街（cls = pedestrian）：中线左右 ±1 m 两条走线；
 * - 行人天桥 / 高架行人通道（footway 且 level 1–2 或 bridge）：桥面上 ±0.7 m 两条走线（桥面高 = 地面 + 层数 × 6 m）；
 * - 过路处：每个过路处两侧路缘的候车区（一群人等灯）与横过车行道的直线路径。
 *
 * 红线：走线上每 1 m 取样检查——不进任何地面车行道（含服务道路）、不进楼宇轮廓、不进敏感区、离电车轨道中线 ≥ 2.3 m；
 * 不合格的取样点把走线切断（短于 10 m 的段丢掉）。过路处的横路路径只允许在「本路车行道」与合格人行道上，
 * 横路路径离电车轨道太近（电车不会让人）或另一侧没有合格人行道时，该过路处不放人。
 */
import type { FlatXY, Rail, Road, SensitiveZone } from '@central/data';
import { pointInRing } from '../../geom/ring';
import { cleanRing } from '../../geom/ring';
import type { HeightFn } from '../../data/terrain';
import { centreZ, elevationTiers, pointAt, type RoadPlan } from '../roads';
import { drapeResample } from '../ribbon';

/** 走道类别：决定密度与 LOD。 */
export type WalkClass = 'main' | 'side' | 'street' | 'bridge';

/** 一条（闭合）走线：点列 x, y, z（模拟米）平铺，cum 为累计长度。 */
export interface WalkPath {
  id: number;
  cls: WalkClass;
  /** 是否在核心区（密度系数）。 */
  core: boolean;
  pts: Float64Array;
  cum: Float64Array;
  len: number;
  /** 往返两条走线接成的环（len 为环长）；false 时为单程（不会出现）。 */
  loop: boolean;
  /** 单侧行人路的长度（m）：人数 = 密度 × side。 */
  side: number;
  /** 包围盒（模拟米）。 */
  box: [number, number, number, number];
}

/** 过路处的一侧路缘。 */
export interface Kerb {
  /** 路缘候车区中心（模拟米）。 */
  x: number;
  y: number;
  z: number;
  /** 候车区可用的行人路深度（离路缘，m）。 */
  depth: number;
}

export interface CrossingSite {
  id: number;
  /** 所在道路规划下标与沿线位置（m）。 */
  plan: number;
  s: number;
  signal: boolean;
  /** 过路处中心（模拟米）与道路方向（单位向量）。 */
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  /** 车行道半宽（m）。 */
  hw: number;
  /** 左（+n）右（−n）两侧路缘；null = 该侧没有合格的候车区（整个过路处不放人）。 */
  kerbs: [Kerb, Kerb] | null;
  /** 信号相位（与 signals.laneSignalPhases 同一套：路口相位 + 本路方向相位，0–1）。NaN = 未定。 */
  phase: number;
  core: boolean;
  main: boolean;
}

/** 斑马线（过路处）沿路方向的半宽（m）：与 ribbon.ts CROSSING_HALF_DM 一致。 */
export const CROSSING_HALF_M = 2;
/** 行人离电车轨道中线的最小距离（m）：车身半宽 1.18 m + 余量。 */
export const TRAM_CLEAR_M = 2.3;
/** 核心区大街（密度高）的道路等级。 */
const MAIN: ReadonlySet<string> = new Set(['trunk', 'primary', 'secondary']);
/** 有人行道、可以放行人的地面道路等级。 */
const WALKABLE: ReadonlySet<string> = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'unknown']);

/** 线段网格（模拟米）：判点离线段的最近距离 ≤ 半宽 + margin。 */
export class SegGrid {
  private readonly cells = new Map<number, number[]>();
  /** [ax, ay, bx, by, 半宽, owner] 逐段 */
  readonly segs: number[] = [];
  constructor(private readonly cell = 40) {}

  add(ax: number, ay: number, bx: number, by: number, hw: number, owner: number): void {
    const id = this.segs.length / 6;
    this.segs.push(ax, ay, bx, by, hw, owner);
    const c = this.cell;
    for (let gx = Math.floor((Math.min(ax, bx) - hw) / c); gx <= Math.floor((Math.max(ax, bx) + hw) / c); gx++)
      for (let gy = Math.floor((Math.min(ay, by) - hw) / c); gy <= Math.floor((Math.max(ay, by) + hw) / c); gy++) {
        const k = gx * 65536 + gy;
        const list = this.cells.get(k);
        if (list) list.push(id);
        else this.cells.set(k, [id]);
      }
  }

  /** 点是否在某段（owner ≠ skip）半宽 + margin 内。 */
  hit(x: number, y: number, margin = 0, skip = -1): boolean {
    const list = this.cells.get(Math.floor(x / this.cell) * 65536 + Math.floor(y / this.cell));
    if (!list) return false;
    for (const id of list) {
      const o = id * 6;
      if (this.segs[o + 5] === skip) continue;
      const ax = this.segs[o]!;
      const ay = this.segs[o + 1]!;
      const dx = this.segs[o + 2]! - ax;
      const dy = this.segs[o + 3]! - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / l2, 0), 1) : 0;
      if (Math.hypot(ax + t * dx - x, ay + t * dy - y) < this.segs[o + 4]! + margin) return true;
    }
    return false;
  }
}

export interface WalkContext {
  /** 地面车行道（含服务道路）网格：owner = 规划下标。 */
  carriage: SegGrid;
  /** 电车轨道中线网格（半宽 0）。 */
  trams: SegGrid;
  /** 楼宇轮廓测试（模拟 dm，与 road-corridor.footprintTest 一致）。 */
  inBuilding: (xDm: number, yDm: number) => boolean;
  zones: readonly SensitiveZone[];
  /** 核心区 [minX, minY, maxX, maxY]（模拟米）。 */
  core: readonly [number, number, number, number];
}

/** 由道路规划建车行道 / 电车轨道网格。 */
export function walkContext(
  plans: readonly RoadPlan[],
  rails: readonly Rail[],
  inBuilding: (xDm: number, yDm: number) => boolean,
  zones: readonly SensitiveZone[],
  core: readonly [number, number, number, number],
): WalkContext {
  const carriage = new SegGrid(40);
  plans.forEach((p, k) => {
    if (p.elev > 0 || p.road.cls === 'pedestrian') return;
    for (let i = 1; i < p.along.length; i++) {
      carriage.add(p.pts[i * 2 - 2]! / 10, p.pts[i * 2 - 1]! / 10, p.pts[i * 2]! / 10, p.pts[i * 2 + 1]! / 10, p.hw / 10, k);
    }
  });
  const trams = new SegGrid(40);
  rails.forEach((r, k) => {
    if (r.kind !== 'tram') return;
    for (let i = 2; i < r.pts.length; i += 2) trams.add(r.pts[i - 2]! / 10, r.pts[i - 1]! / 10, r.pts[i]! / 10, r.pts[i + 1]! / 10, 0, k);
  });
  return { carriage, trams, inBuilding, zones, core };
}

const inZone = (zones: readonly SensitiveZone[], x: number, y: number) => zones.some((z) => pointInRing(z.area, x * 10, y * 10));

/** 行人能不能站在 (x, y)（模拟米）：不在车行道（除 skip 号路外，再放宽 margin）、楼里、敏感区，离电车轨道够远。 */
export function footOk(ctx: WalkContext, x: number, y: number, skipPlan = -1, margin = 0.3): boolean {
  if (ctx.carriage.hit(x, y, margin, skipPlan)) return false;
  if (ctx.trams.hit(x, y, TRAM_CLEAR_M)) return false;
  if (ctx.inBuilding(x * 10, y * 10)) return false;
  return !inZone(ctx.zones, x, y);
}

/**
 * 半径 r 内都能站人（走线两条线各离中线 r）：中线点按 footOk（车行道放宽 margin + r），
 * 四周 r 处再查楼、敏感区、电车轨道（不再查车行道）。
 */
export function areaOk(ctx: WalkContext, x: number, y: number, r: number, skipPlan = -1, margin = 0.3): boolean {
  if (!footOk(ctx, x, y, skipPlan, margin + r)) return false;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    if (!footOk(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, skipPlan, -1000)) return false;
  }
  return true;
}

export const inCore = (core: readonly [number, number, number, number], x: number, y: number): boolean =>
  x >= core[0] && x <= core[2] && y >= core[1] && y <= core[3];

/**
 * 单条走线（往返两条接成环）：line 为单侧人行道中线点（模拟米）x, y, z, half 平铺，
 * half 为该点两条走线离中线的横距（巴士站处收窄、外移，见 buildWalkPaths 的 squeeze）。
 */
function loopOf(line: number[]): { pts: Float64Array; cum: Float64Array; len: number } {
  const n = line.length / 4;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(i - 1, 0);
    const b = Math.min(i + 1, n - 1);
    const dx = line[b * 4]! - line[a * 4]!;
    const dy = line[b * 4 + 1]! - line[a * 4 + 1]!;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const x = line[i * 4]!;
    const y = line[i * 4 + 1]!;
    const z = line[i * 4 + 2]!;
    const half = line[i * 4 + 3]!;
    // 靠左走：沿线前进的人走在左边（+n），回程的人走在另一条（−n，对他来说也是左边）
    left.push(x + nx * half, y + ny * half, z);
    right.push(x - nx * half, y - ny * half, z);
  }
  const pts: number[] = [...left];
  for (let i = n - 1; i >= 0; i--) pts.push(right[i * 3]!, right[i * 3 + 1]!, right[i * 3 + 2]!);
  // 闭合：回到起点
  pts.push(left[0]!, left[1]!, left[2]!);
  const m = pts.length / 3;
  const cum = new Float64Array(m);
  for (let i = 1; i < m; i++) cum[i] = cum[i - 1]! + Math.hypot(pts[i * 3]! - pts[i * 3 - 3]!, pts[i * 3 + 1]! - pts[i * 3 - 2]!);
  return { pts: new Float64Array(pts), cum, len: cum[m - 1]! };
}

function boxOf(pts: Float64Array): [number, number, number, number] {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    a = Math.min(a, pts[i]!);
    b = Math.min(b, pts[i + 1]!);
    c = Math.max(c, pts[i]!);
    d = Math.max(d, pts[i + 1]!);
  }
  return [a, b, c, d];
}

/** 取样步长（m）与最短走线（m）。 */
const STEP_M = 1;
const MIN_RUN_M = 10;

/**
 * 沿一条中线（单侧人行道中线）每 STEP_M 取样，ok(x, y, half) 不合格处切断，返回各段点列（x, y, z, half）。
 * at(s)：沿线 s（m）处的 [x, y, z, half]。
 */
function validRuns(len: number, at: (s: number) => [number, number, number, number], ok: (x: number, y: number, half: number) => boolean): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  const steps = Math.max(1, Math.ceil(len / STEP_M));
  for (let k = 0; k <= steps; k++) {
    const p = at((len * k) / steps);
    if (ok(p[0], p[1], p[3])) cur.push(p[0], p[1], p[2], p[3]);
    else {
      if (cur.length >= 8) out.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 8) out.push(cur);
  return out.filter((r) => runLen(r) >= MIN_RUN_M);
}

function runLen(r: readonly number[]): number {
  let l = 0;
  for (let i = 4; i < r.length; i += 4) l += Math.hypot(r[i]! - r[i - 4]!, r[i + 1]! - r[i - 3]!);
  return l;
}

/**
 * 由一条中线（模拟米 x, y, z 平铺）建一条走线环（广场里绕水池的步道等），两条走线各离中线 half。
 * id 由调用方给（接在 buildWalkPaths 结果之后）。
 */
export function makeWalkPath(id: number, line: readonly number[], half: number, cls: WalkClass, core: boolean): WalkPath {
  const l4: number[] = [];
  for (let i = 0; i + 2 < line.length; i += 3) l4.push(line[i]!, line[i + 1]!, line[i + 2]!, half);
  const l = loopOf(l4);
  return { id, cls, core, ...l, loop: true, side: runLen(l4), box: boxOf(l.pts) };
}

/** 走线要让开的东西（巴士站候车亭）：所在道路、哪一侧、沿线位置与半长（m）、亭子外缘离路缘（m）。 */
export interface WalkObstacle {
  plan: number;
  side: 1 | -1;
  s: number;
  halfLen: number;
  /** 亭子外缘离车行道边（m）：走线要在这之外。 */
  outer: number;
}

/**
 * 全部走线。surface(x, y)：看得见的地面高度（模拟 dm 进出，streets/surface.ts 的 RenderedSurface.heightAt）。
 * ground：原始地形（dm），天桥桥面高度用（与 footbridges.ts 相同）。
 * obstacles：人行道上的候车亭——走线在亭子前后 3 m 内渐渐收窄并外移到亭子后面。
 */
export function buildWalkPaths(
  plans: readonly RoadPlan[],
  roads: readonly Road[],
  ctx: WalkContext,
  surface: HeightFn,
  ground: HeightFn,
  obstacles: readonly WalkObstacle[] = [],
): WalkPath[] {
  const out: WalkPath[] = [];
  const push = (line: number[], cls: WalkClass) => {
    let l = loopOf(line);
    // 最后再逐点查一遍（走线点不在楼、敏感区里，离电车轨道够远）：不合格就收窄到 ±0.2 m，再不行整段不要
    const bad = (pts: Float64Array) => {
      for (let i = 0; i < pts.length; i += 3) {
        // 天桥两端接进裙楼：只查敏感区
        if (cls === 'bridge' ? inZone(ctx.zones, pts[i]!, pts[i + 1]!) : !footOk(ctx, pts[i]!, pts[i + 1]!, -1, 0.05)) return true;
      }
      return false;
    };
    if (bad(l.pts)) {
      for (let i = 3; i < line.length; i += 4) line[i] = Math.min(line[i]!, 0.2);
      l = loopOf(line);
      if (bad(l.pts)) return;
    }
    const side = runLen(line);
    const mid = Math.floor(line.length / 8) * 4;
    out.push({ id: out.length, cls, core: inCore(ctx.core, line[mid]!, line[mid + 1]!), ...l, loop: true, side, box: boxOf(l.pts) });
  };
  plans.forEach((p, k) => {
    if (p.elev > 0) return;
    const cls = p.road.cls;
    if (cls === 'pedestrian') {
      // 行人街：中线两侧 ±1 m（整条街宽 4 m）
      const len = p.len / 10;
      const at = (s: number): [number, number, number, number] => {
        const c = pointAt(p.pts, p.along, s * 10);
        return [c.x / 10, c.y / 10, surface(c.x, c.y) / 10, 1.0];
      };
      const ok = (x: number, y: number) => areaOk(ctx, x, y, 1.0, -1, 0.3);
      for (const r of validRuns(len, at, ok)) push(r, 'street');
      return;
    }
    // 核心区的服务道路（德辅道中电车 / 巴士专线、后巷）没有画人行道：路缘外 0.4 m 起当作 2.2 m 宽的行人路（逐点检查）
    const service = cls === 'service' && inCore(ctx.core, p.pts[(p.pts.length >> 2) * 2]! / 10, p.pts[(p.pts.length >> 2) * 2 + 1]! / 10);
    if (!WALKABLE.has(cls) && !service) return;
    const hw = p.hw / 10 + (service ? 0.4 : 0);
    const virtual = service ? p.along.map(() => 22) : null;
    for (const side of [1, -1] as const) {
      const pav = virtual ?? (side > 0 ? p.pavL : p.pavR);
      const obs = obstacles.filter((o) => o.plan === k && o.side === side);
      // 人行道宽 ≥ 1.6 m 的连续站点段
      let i = 0;
      const n = p.along.length;
      while (i < n) {
        while (i < n && (pav[i] ?? 0) < 16) i++;
        const a = i;
        while (i < n && (pav[i] ?? 0) >= 16) i++;
        const b = i - 1;
        if (b <= a) continue;
        const s0 = p.along[a]! / 10;
        const s1 = p.along[b]! / 10;
        const w = Math.min(...pav.slice(a, b + 1)) / 10;
        const half0 = Math.min(Math.max(w * 0.2, 0.3), 0.7);
        const at = (s: number): [number, number, number, number] => {
          const c = pointAt(p.pts, p.along, (s0 + s) * 10);
          // 候车亭：亭子前后 3 m 渐变，走线收窄到 ±0.35 m、整体外移到亭子外缘之外
          let off = hw + w / 2;
          let half = half0;
          for (const o of obs) {
            const d = Math.abs(s0 + s - o.s) - o.halfLen;
            const wgt = d <= 0.5 ? 1 : d >= 3.5 ? 0 : 1 - (d - 0.5) / 3;
            if (wgt <= 0) continue;
            const want = Math.min(hw + o.outer + 0.2 + 0.35, hw + w - 0.4);
            off += (Math.max(want, off) - off) * wgt;
            half += (0.35 - half) * wgt;
          }
          const x = c.x / 10 - c.ty * off * side;
          const y = c.y / 10 + c.tx * off * side;
          return [x, y, surface(x * 10, y * 10) / 10, half];
        };
        // 两条走线都要合格：取样点向两侧各 half 也检查
        const ok = (x: number, y: number, half: number) => areaOk(ctx, x, y, half, k, 0.3);
        for (const r of validRuns(s1 - s0, at, ok)) push(r, MAIN.has(cls) ? 'main' : 'side');
      }
    }
  });
  // 行人天桥 / 高架通道（与 footbridges.ts 同一规则、同一桥面高度）
  for (const r of roads) {
    if (r.tunnel || (r.cls !== 'footway' && r.cls !== 'pedestrian')) continue;
    const tiers = Math.max(elevationTiers(r), r.bridge ? 1 : 0);
    if (tiers <= 0) continue;
    const pts = drapeResample(cleanRing(r.pts), ground, 300, 8);
    const n = pts.length >> 1;
    if (n < 2) continue;
    // 只查敏感区（桥面在车行道上方）
    const runs: number[][] = [];
    let cur: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2]! / 10;
      const y = pts[i * 2 + 1]! / 10;
      const clear = [0, 0.8, -0.8].every((d) => !inZone(ctx.zones, x + d, y) && !inZone(ctx.zones, x, y + d));
      if (clear) cur.push(x, y, ground(pts[i * 2]!, pts[i * 2 + 1]!) / 10 + tiers * 6, 0.7);
      else {
        if (cur.length >= 8) runs.push(cur);
        cur = [];
      }
    }
    if (cur.length >= 8) runs.push(cur);
    for (const run of runs) if (runLen(run) >= 8) push(run, 'bridge');
  }
  return out;
}

/** 走线上 s（m，自动取模）处的位置与朝向（模拟米）。 */
export function pathPose(p: Pick<WalkPath, 'pts' | 'cum' | 'len'>, s: number, out: { x: number; y: number; z: number; hx: number; hy: number }): void {
  const n = p.cum.length;
  let t = s % p.len;
  if (t < 0) t += p.len;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p.cum[mid]! <= t) lo = mid;
    else hi = mid;
  }
  const seg = p.cum[hi]! - p.cum[lo]! || 1;
  const f = Math.min(Math.max((t - p.cum[lo]!) / seg, 0), 1);
  const ax = p.pts[lo * 3]!;
  const ay = p.pts[lo * 3 + 1]!;
  const bx = p.pts[hi * 3]!;
  const by = p.pts[hi * 3 + 1]!;
  out.x = ax + (bx - ax) * f;
  out.y = ay + (by - ay) * f;
  out.z = p.pts[lo * 3 + 2]! + (p.pts[hi * 3 + 2]! - p.pts[lo * 3 + 2]!) * f;
  const l = Math.hypot(bx - ax, by - ay) || 1;
  out.hx = (bx - ax) / l;
  out.hy = (by - ay) / l;
}

/**
 * 过路处（plans[].crossings）→ 行人过路地点。phaseAt(x, y, tx, ty)：该处车辆信号相位（signals.ts 的路口相位 + 方向相位），
 * 没有交通灯时返回 NaN（由调用方按种子给相位）。
 */
export function buildCrossingSites(
  plans: readonly RoadPlan[],
  ctx: WalkContext,
  surface: HeightFn,
  phaseAt: (x: number, y: number, tx: number, ty: number) => number,
): CrossingSite[] {
  const out: CrossingSite[] = [];
  plans.forEach((p, k) => {
    for (const c of p.crossings) {
      const s = c.s / 10;
      const at = pointAt(p.pts, p.along, c.s);
      const x = at.x / 10;
      const y = at.y / 10;
      const hw = p.hw / 10;
      const nx = -at.ty;
      const ny = at.tx;
      const z = centreZ(p, c.s) / 10;
      // 两侧候车区：路缘外 0.5 m 起，向外找合格的行人路深度（≥ 1.2 m）
      const kerbs: Kerb[] = [];
      for (const side of [1, -1]) {
        let depth = 0;
        for (let d = 0.5; d <= 4.0; d += 0.25) {
          let ok = true;
          for (const u of [-CROSSING_HALF_M + 0.3, 0, CROSSING_HALF_M - 0.3]) {
            const px = x + nx * side * (hw + d) + at.tx * u;
            const py = y + ny * side * (hw + d) + at.ty * u;
            if (!footOk(ctx, px, py, k, 0.25)) ok = false;
          }
          if (!ok) break;
          depth = d;
        }
        const kx = x + nx * side * (hw + 0.5);
        const ky = y + ny * side * (hw + 0.5);
        kerbs.push({ x: kx, y: ky, z: surface(kx * 10, ky * 10) / 10, depth: depth - 0.5 });
      }
      // 横路路径：只能是本路车行道（不能横过别的路），离电车轨道够远
      let path = kerbs.every((kb) => kb.depth >= 1.0);
      for (let d = -hw; d <= hw && path; d += 0.5) {
        for (const u of [-CROSSING_HALF_M + 0.3, CROSSING_HALF_M - 0.3]) {
          const px = x + nx * d + at.tx * u;
          const py = y + ny * d + at.ty * u;
          if (ctx.carriage.hit(px, py, 0.3, k) || ctx.trams.hit(px, py, TRAM_CLEAR_M) || inZone(ctx.zones, px, py)) path = false;
        }
      }
      out.push({
        id: out.length,
        plan: k,
        s,
        signal: c.signal,
        x,
        y,
        z,
        tx: at.tx,
        ty: at.ty,
        hw,
        kerbs: path ? [kerbs[0]!, kerbs[1]!] : null,
        phase: phaseAt(x, y, at.tx, at.ty),
        core: inCore(ctx.core, x, y),
        main: MAIN.has(p.road.cls),
      });
    }
  });
  return out;
}

/** 过路处的车行道矩形（模拟米）四角：沿路 ±CROSSING_HALF_M，横向 ±hw（再放宽 grow）。逆时针。 */
export function crossingRect(c: Pick<CrossingSite, 'x' | 'y' | 'tx' | 'ty' | 'hw'>, grow = 0): FlatXY {
  const a = CROSSING_HALF_M + grow;
  const b = c.hw + grow;
  const nx = -c.ty;
  const ny = c.tx;
  return [
    c.x - c.tx * a - nx * b,
    c.y - c.ty * a - ny * b,
    c.x + c.tx * a - nx * b,
    c.y + c.ty * a - ny * b,
    c.x + c.tx * a + nx * b,
    c.y + c.ty * a + ny * b,
    c.x - c.tx * a + nx * b,
    c.y - c.ty * a + ny * b,
  ];
}

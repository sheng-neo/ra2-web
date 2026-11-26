/**
 * 电车 × 机动车（R2 修复轮）：电车按时刻表行驶（位置只取决于 SIM_CLOCK.t），车流要给电车让路，两者不能互相穿过。
 *
 * - 共用车道：与电车行车线平行、车身会压进电车车身范围（中心距 < clearM）连续 ≥ sharedRunM 米的车道
 *   （德辅道中等单向两车道路面的靠轨那条），整条不开车（与敏感区车道同样处理：不刷车、不接进去）。
 *   同一路面的另一条车道照常行车。
 * - 穿轨区：其余车道上压进电车车身范围的区间（路口横过路轨、斜穿路轨），沿车道 [e0, e1] 与沿线范围 [ra, rb]。
 *   车流把它当作过路处：此刻或车辆开出去之前会有电车经过（沿线位置可精确预测，时刻表是纯函数）就停在区外等；
 *   区后放不下整辆车也不进（不堵路轨）。见 Traffic.setTramZones。
 * 全部是纯函数 / 确定性计算（模拟坐标米；车道折线是 three 坐标，经 coords.ts 换算）。
 */
import { threeToSim, threeToSimInto } from '../../coords';
import type { Lane } from './lanes';
import { SWEEP_HALF_WIDTH, laneSweepSamples, sweptInterval, type SweepSample } from './sweep';
import type { TramRoute } from './tram/route';
import { TRAM_HW_M, TRAM_LEN_M } from './tram/body';

/** 车辆半宽上限（巴士 1.25 m）+ 余量：车道中心离路轨中心线小于这个就算压进电车车身范围。 */
export const TRAM_CLEAR_M = TRAM_HW_M + 1.25 + 0.9;
/** 平行重叠连续这么长（m）以上就整条车道不开车。 */
export const SHARED_RUN_M = 15;
/** 穿轨区沿车道前后的余量（m）。 */
const ZONE_PAD_IN_M = 1;
const ZONE_PAD_OUT_M = 0.5;
/** 车身盒子离电车车身边缘至少这么远（m）才算没碰到。 */
const TRAM_SIDE_PAD_M = 0.35;

export interface TramZone {
  lane: number;
  /** 沿车道区间（m）。 */
  e0: number;
  e1: number;
  route: number;
  /** 沿线范围（m，未加车长）。 */
  ra: number;
  rb: number;
}

export interface TramLaneConflicts {
  /** 整条不开车的车道 id。 */
  shared: Set<number>;
  /** 穿轨区（按车道、e0 升序）。 */
  zones: TramZone[];
}

/** 路线线段网格（模拟坐标米）：找最近的线段。 */
class RouteGrid {
  private readonly cells = new Map<number, number[]>();
  constructor(
    private readonly r: TramRoute,
    private readonly cell: number,
  ) {
    for (let i = 1; i < r.x.length; i++) {
      const x0 = Math.min(r.x[i - 1]!, r.x[i]!) - cell;
      const x1 = Math.max(r.x[i - 1]!, r.x[i]!) + cell;
      const y0 = Math.min(r.y[i - 1]!, r.y[i]!) - cell;
      const y1 = Math.max(r.y[i - 1]!, r.y[i]!) + cell;
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++)
        for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
          const k = gx * 100003 + gy;
          const l = this.cells.get(k);
          if (l) l.push(i);
          else this.cells.set(k, [i]);
        }
    }
  }
  /**
   * 盒子（模拟坐标米，四角 x0 y0 … x3 y3）离行车线中心线 < w 的线段：把它们的沿线范围并进 out（[ra, rb]），返回是否有。
   * 只查盒子中心所在格子（cell 要 ≥ 盒子半对角 + w）。
   */
  boxTouch(q: readonly number[], w: number, out: [number, number]): boolean {
    const cx = (q[0]! + q[4]!) / 2;
    const cy = (q[1]! + q[5]!) / 2;
    const list = this.cells.get(Math.floor(cx / this.cell) * 100003 + Math.floor(cy / this.cell));
    if (!list) return false;
    const r = this.r;
    const step = r.len / Math.max(r.x.length - 1, 1);
    let any = false;
    for (const i of list) {
      if (segBoxDist(r.x[i - 1]!, r.y[i - 1]!, r.x[i]!, r.y[i]!, q) >= w) continue;
      any = true;
      out[0] = Math.min(out[0], (i - 1) * step);
      out[1] = Math.max(out[1], i * step);
    }
    return any;
  }

  /** 最近点：d（m）、s（沿线 m）、线段方向（单位向量）；网格外返回 d = Infinity。 */
  nearest(x: number, y: number, out: { d: number; s: number; dx: number; dy: number }): void {
    out.d = Infinity;
    const list = this.cells.get(Math.floor(x / this.cell) * 100003 + Math.floor(y / this.cell));
    if (!list) return;
    const r = this.r;
    for (const i of list) {
      const ax = r.x[i - 1]!;
      const ay = r.y[i - 1]!;
      const dx = r.x[i]! - ax;
      const dy = r.y[i]! - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / l2, 0), 1) : 0;
      const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
      if (d < out.d) {
        const l = Math.sqrt(l2) || 1;
        out.d = d;
        out.s = (i - 1 + t) * (r.len / Math.max(r.x.length - 1, 1));
        out.dx = dx / l;
        out.dy = dy / l;
      }
    }
  }
}

/** 两线段距离。 */
function segSegDist(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  const cross = (px: number, py: number, qx: number, qy: number) => px * qy - py * qx;
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = cross(rx, ry, sx, sy);
  if (Math.abs(den) > 1e-12) {
    const t = cross(cx - ax, cy - ay, sx, sy) / den;
    const u = cross(cx - ax, cy - ay, rx, ry) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  const pt = (px: number, py: number, ux: number, uy: number, vx: number, vy: number) => {
    const ex = vx - ux;
    const ey = vy - uy;
    const l2 = ex * ex + ey * ey;
    const t = l2 > 0 ? Math.min(Math.max(((px - ux) * ex + (py - uy) * ey) / l2, 0), 1) : 0;
    return Math.hypot(ux + ex * t - px, uy + ey * t - py);
  };
  return Math.min(pt(ax, ay, cx, cy, dx, dy), pt(bx, by, cx, cy, dx, dy), pt(cx, cy, ax, ay, bx, by), pt(dx, dy, ax, ay, bx, by));
}

/** 线段到凸四边形（四角平铺）的距离（线段端点在四边形内为 0）。 */
export function segBoxDist(ax: number, ay: number, bx: number, by: number, q: readonly number[]): number {
  let inside = true;
  for (let k = 0; k < 4; k++) {
    const x0 = q[k * 2]!;
    const y0 = q[k * 2 + 1]!;
    const x1 = q[((k + 1) % 4) * 2]!;
    const y1 = q[((k + 1) % 4) * 2 + 1]!;
    // 四角顺序一致（顺 / 逆时针都行）：看端点是否总在每条边的同一侧
    const sgn = (x1 - x0) * (ay - y0) - (y1 - y0) * (ax - x0);
    const ref = (x1 - x0) * (q[((k + 2) % 4) * 2 + 1]! - y0) - (y1 - y0) * (q[((k + 2) % 4) * 2]! - x0);
    if (sgn * ref < 0) inside = false;
  }
  if (inside) return 0;
  let d = Infinity;
  for (let k = 0; k < 4; k++) d = Math.min(d, segSegDist(ax, ay, bx, by, q[k * 2]!, q[k * 2 + 1]!, q[((k + 1) % 4) * 2]!, q[((k + 1) % 4) * 2 + 1]!));
  return d;
}

/** 车道 vs 电车行车线（纯函数）：共用车道与穿轨区。step = 车道上的采样步长（m）。 */
export function tramLaneConflicts(
  lanes: readonly Lane[],
  routes: readonly TramRoute[],
  opts: { clearM?: number; sharedRunM?: number; step?: number; samples?: SweepSample[][][] } = {},
): TramLaneConflicts {
  const clear = opts.clearM ?? TRAM_CLEAR_M;
  const sharedRun = opts.sharedRunM ?? SHARED_RUN_M;
  const step = opts.step ?? 0.5;
  // 细网格（中心线 4 m 内）、粗网格（10 m 内）、更粗的（16 m 内，只用来挑出附近的车道）
  const grids = routes.map((r) => new RouteGrid(r, 4));
  const mid = routes.map((r) => new RouteGrid(r, 10));
  const far = routes.map((r) => new RouteGrid(r, 16));
  const shared = new Set<number>();
  const hit = { d: 0, s: 0, dx: 0, dy: 0 };
  const nearAny = new Set<number>();
  // 1) 共用车道：车道中心离行车线 < clear、且与行车线平行（|cos| > 0.9）连续 ≥ sharedRun 米
  for (const l of lanes) {
    const n = l.cum.length;
    const run = routes.map(() => 0);
    const best = routes.map(() => 0);
    let lastE = 0;
    let tick = 0;
    for (let i = 1; i < n; i++) {
      const [ax, ay] = threeToSim(l.pts[i * 3 - 3]!, 0, l.pts[i * 3 - 1]!);
      const [bx, by] = threeToSim(l.pts[i * 3]!, 0, l.pts[i * 3 + 2]!);
      const ux = (bx - ax) / 10;
      const uy = (by - ay) / 10;
      const ul = Math.hypot(ux, uy) || 1;
      const k = Math.max(1, Math.ceil(ul / Math.max(step, 1)));
      for (let j = i === 1 ? 0 : 1; j <= k; j++) {
        const f = j / k;
        const x = ax / 10 + ux * f;
        const y = ay / 10 + uy * f;
        const e = l.cum[i - 1]! + (l.cum[i]! - l.cum[i - 1]!) * f;
        const probe = tick++ % 4 === 0 && !nearAny.has(l.id);
        for (let ri = 0; ri < routes.length; ri++) {
          if (probe) {
            far[ri]!.nearest(x, y, hit);
            if (hit.d < 16) nearAny.add(l.id);
          }
          grids[ri]!.nearest(x, y, hit);
          if (hit.d < clear && Math.abs((ux * hit.dx + uy * hit.dy) / ul) > 0.9) {
            run[ri]! += e - lastE;
            best[ri] = Math.max(best[ri]!, run[ri]!);
          } else run[ri] = 0;
        }
        lastE = e;
      }
    }
    if (best.some((b) => b >= sharedRun)) shared.add(l.id);
  }
  // 2) 穿轨区：车身盒子（按车道位姿画的刚体盒子，含换道错位渐变）碰到电车车身范围（中心线 ± 半宽 + 余量）的区间
  const samples = opts.samples ?? laneSweepSamples(lanes, step);
  const zones: TramZone[] = [];
  const sim = [0, 0, 0];
  for (const l of lanes) {
    if (shared.has(l.id) || !nearAny.has(l.id)) continue;
    for (let ri = 0; ri < routes.length; ri++) {
      const rs: [number, number] = [Infinity, -Infinity];
      const touch = (q: number[]) => {
        // 先按这个盒子的半长看中心够不够近
        const hl = Math.hypot(q[0]! - q[2]!, q[1]! - q[3]!) / 2;
        threeToSimInto((q[0]! + q[4]!) / 2, 0, (q[1]! + q[5]!) / 2, sim);
        mid[ri]!.nearest(sim[0]! / 10, sim[1]! / 10, hit);
        if (hit.d > hl + SWEEP_HALF_WIDTH + TRAM_HW_M + TRAM_SIDE_PAD_M) return false;
        // 盒子四边上每 ≤ 2.4 m 取一点（电车车身范围宽 3 m，中心线穿过盒子的边时必有一点离它 ≤ 1.2 m）+ 中心
        let any = false;
        const test = (x3: number, z3: number) => {
          threeToSimInto(x3, 0, z3, sim);
          grids[ri]!.nearest(sim[0]! / 10, sim[1]! / 10, hit);
          if (hit.d < TRAM_HW_M + TRAM_SIDE_PAD_M) {
            any = true;
            rs[0] = Math.min(rs[0], hit.s);
            rs[1] = Math.max(rs[1], hit.s);
          }
        };
        for (let k = 0; k < 4; k++) {
          const ax = q[k * 2]!;
          const az = q[k * 2 + 1]!;
          const bx = q[((k + 1) % 4) * 2]!;
          const bz = q[((k + 1) % 4) * 2 + 1]!;
          const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2.4));
          for (let j = 0; j < m; j++) test(ax + ((bx - ax) * j) / m, az + ((bz - az) * j) / m);
        }
        test((q[0]! + q[4]!) / 2, (q[1]! + q[5]!) / 2);
        return any;
      };
      // 只看中心离行车线 ≤ 巴士半对角 + 电车半宽 + 余量的采样
      const reach = 6.5 + SWEEP_HALF_WIDTH + TRAM_HW_M + TRAM_SIDE_PAD_M;
      // 隔一个取一个（1 m 一点就够：区间两头另有余量）
      const groups = samples[l.id]!.map((g) =>
        g.filter((c, i) => {
          if (i % 2 === 1 && i !== g.length - 1) return false;
          threeToSimInto(c.x, 0, c.z, sim);
          mid[ri]!.nearest(sim[0]! / 10, sim[1]! / 10, hit);
          return hit.d <= reach;
        }),
      );
      if (groups.every((g) => g.length === 0)) continue;
      const iv = sweptInterval(groups, touch, 0, undefined, false);
      if (!iv) continue;
      zones.push({ lane: l.id, e0: iv[0] - ZONE_PAD_IN_M, e1: iv[1] + ZONE_PAD_OUT_M, route: routes[ri]!.id, ra: rs[0], rb: rs[1] });
    }
  }
  zones.sort((a, b) => a.lane - b.lane || a.e0 - b.e0);
  return { shared, zones };
}

/** 电车沿线位置的来源（TramSystem.routeS）。 */
export interface TramPositions {
  /** 车数。 */
  readonly count: number;
  /** 第 i 辆车所在路线 id。 */
  routeOf(i: number): number;
  /** 时刻 t 各车沿线位置（m），写进 out[i]。 */
  positions(t: number, out: Float64Array): void;
  /** 时刻 t 各车车身中心与朝向（three xz）：out[i·4 ..] = x, z, hx, hz。 */
  poses(t: number, out: Float64Array): void;
}

/** 预测窗口（s）与采样间隔（s）。 */
export const TRAM_HORIZON_S = 20;
const SAMPLE_S = 0.5;

/**
 * 穿轨区占用预测：时刻 t 起 TRAM_HORIZON_S 秒内各车沿线位置（每 0.5 s 一采样，同一时刻只算一次）。
 * openLeft = 离电车车身（加 pad）进入沿线范围 [ra, rb] 还有多少秒（此刻就在区内为 0；窗口内不会来为 Infinity）。
 */
export class TramOccupancy {
  private readonly k = Math.round(TRAM_HORIZON_S / SAMPLE_S) + 1;
  private readonly table: Float64Array;
  private readonly tmp: Float64Array;
  private readonly routes: Int32Array;
  private at = NaN;
  constructor(
    private readonly src: TramPositions,
    /** 沿线余量（m）：半车长 + 采样间距内车走的距离 + 安全距。 */
    private readonly pad = TRAM_LEN_M / 2 + 3.5,
  ) {
    this.table = new Float64Array(src.count * this.k);
    this.tmp = new Float64Array(src.count);
    this.routes = Int32Array.from({ length: src.count }, (_, i) => src.routeOf(i));
  }
  private fill(t: number): void {
    if (this.at === t) return;
    this.at = t;
    const n = this.src.count;
    for (let j = 0; j < this.k; j++) {
      this.src.positions(t + j * SAMPLE_S, this.tmp);
      for (let i = 0; i < n; i++) this.table[i * this.k + j] = this.tmp[i]!;
    }
  }
  /** 时刻 t 各车车身盒子（three xz：x, z, hx, hz）。 */
  poses(t: number, out: Float64Array): void {
    this.src.poses(t, out);
  }

  get count(): number {
    return this.src.count;
  }

  openLeft(t: number, route: number, ra: number, rb: number): number {
    this.fill(t);
    const lo = ra - this.pad;
    const hi = rb + this.pad;
    let best = Infinity;
    for (let i = 0; i < this.src.count; i++) {
      if (this.routes[i] !== route) continue;
      const row = i * this.k;
      for (let j = 0; j < this.k && j * SAMPLE_S < best; j++) {
        const s = this.table[row + j]!;
        if (s >= lo && s <= hi) {
          best = Math.max(0, (j - 1) * SAMPLE_S);
          break;
        }
      }
    }
    return best;
  }
}

/** 灯杆、交通灯杆离电车行车线中心至少这么远（m）：车身半宽 + 0.9 m。 */
export const POLE_CLEAR_M = TRAM_HW_M + 0.9;

/** 离任一条行车线中心 < d 米（模拟坐标米）的判定（d ≤ 4 m）。 */
export function tramRouteProximity(routes: readonly TramRoute[]): (x: number, y: number, d: number) => boolean {
  const grids = routes.map((r) => new RouteGrid(r, 4));
  const hit = { d: 0, s: 0, dx: 0, dy: 0 };
  return (x, y, d) => {
    for (const g of grids) {
      g.nearest(x, y, hit);
      if (hit.d < d) return true;
    }
    return false;
  };
}

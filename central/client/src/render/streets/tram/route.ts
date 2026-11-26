/**
 * 电车路线（R2 TRAMS T2 / T6）：由数据里的 tram 路轨拼出两条行车线，全部是纯函数（模拟坐标，米；高程 mPD 米）。
 *
 * - 主线：两条最长（≥ 1000 m）的 tram 路轨。行驶方向按「靠左行驶」定：对向轨道总在右手边（R1 tramDirection）。
 *   西行线（A）在南、东行线（B）在北。
 * - 延伸：主线两端接上首尾相连（≤ 1.5 m）的路轨段，一直接到数据范围边上（上环西端的电车绕西港城回头处），
 *   每次选转角最小、最长的一段（转角 ≤ 100°），不与另一条行车线交叉；电车在路线两端（数据范围边缘、雾里）出入。
 * - 等距采样 2 m。两条轨道中心距在数据里只有 2.5–2.9 m（真实约 3.0–3.3 m），两车交会会贴在一起：
 *   并行段各向外推，使中心距 ≥ 3.1 m（推移量沿线平滑）。
 * - 轨顶高程 = 看得见的路面（RenderedSurface.heightAt，轨道中心与左右 1.3 m 取高者）平滑后再抬 3 cm（轨道混凝土板顶）。
 * - 接触线高度：轨顶上 5.8 m；天桥 / 高架桥底不够高处压低到桥底下 0.35 m（≥ 4.8 m），坡度 ≤ 6 %。
 */
import type { FlatXY, Rail } from '@central/data';

/** 采样步长（m）。 */
export const ROUTE_STEP_M = 2;
/** 接触线离轨顶的标准高度（m）。 */
export const WIRE_H_M = 5.8;
/** 接触线最低（m）：车顶 4.6 m，再低集电杆就压平了。 */
export const WIRE_MIN_M = 4.8;
/** 两轨中心距下限（m）。 */
export const TRACK_GAP_M = 3.1;
/** 轨道混凝土板顶高出路面（m）。 */
export const BED_LIFT_M = 0.03;
const MIN_MAIN_M = 1000;
const NODE_M = 1.5;
const MAX_TURN_DEG = 100;

type P = [number, number];

export interface RouteContext {
  /** 看得见的地面高程（dm 坐标 → dm），见 streets/surface.ts。 */
  surface: (x: number, y: number) => number;
  /** 模拟坐标（m）处上方最低的桥底高程（mPD 米），没有桥返回 null。 */
  soffit?: (x: number, y: number) => number | null;
}

export interface TramRoute {
  /** 0 = 西行（A），1 = 东行（B）。 */
  id: number;
  westbound: boolean;
  /** 等距采样点（模拟坐标，米）。 */
  x: Float64Array;
  y: Float64Array;
  /** 轨顶高程（mPD，米）。 */
  z: Float64Array;
  /** 接触线离轨顶高度（m）。 */
  wire: Float64Array;
  /** 全长（m）= (n − 1) × ROUTE_STEP_M。 */
  len: number;
  /** 路线上的路轨接驳点（另一段路轨的端点落在线上 3 m 内、或延伸段的接头），沿线位置（m）。 */
  junctions: number[];
}

// ---------------------------------------------------------------------------------------------
// 几何小工具
// ---------------------------------------------------------------------------------------------

function toPts(flat: FlatXY): P[] {
  const out: P[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = flat[i]! / 10;
    const y = flat[i + 1]! / 10;
    const last = out[out.length - 1];
    if (last && last[0] === x && last[1] === y) continue;
    out.push([x, y]);
  }
  return out;
}

export function polyLength(pts: readonly P[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return s;
}

/** 从 pts[0] 出发沿线 reach 米处的点（不足时取末点）。 */
function pointAlong(pts: readonly P[], reach: number): P {
  let left = reach;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l >= left && l > 0) return [a[0] + ((b[0] - a[0]) * left) / l, a[1] + ((b[1] - a[1]) * left) / l];
    left -= l;
  }
  return pts[pts.length - 1]!;
}

/** 点到折线的最近距离（m）。 */
export function distToPoly(pts: readonly P[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.min(Math.max(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0), 1) : 0;
    best = Math.min(best, Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y));
  }
  return best;
}

const angleBetween = (ax: number, ay: number, bx: number, by: number): number => {
  const c = (ax * bx + ay * by) / ((Math.hypot(ax, ay) || 1) * (Math.hypot(bx, by) || 1));
  return (Math.acos(Math.min(Math.max(c, -1), 1)) * 180) / Math.PI;
};

/**
 * 行驶方向（纯函数）：1 = 沿 pts，−1 = 逆 pts。取本轨道中点的前进方向，另一条轨道上最近点若在左侧，
 * 就逆 pts 行驶（让它落到右侧）：靠左行驶时，对向轨道总在右手边。
 */
export function tramDirection(track: FlatXY, other: FlatXY): 1 | -1 {
  const n = track.length >> 1;
  const i = Math.max(1, n >> 1);
  const ax = track[(i - 1) * 2]!;
  const ay = track[(i - 1) * 2 + 1]!;
  const bx = track[i * 2]!;
  const by = track[i * 2 + 1]!;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  let best = Infinity;
  let px = 0;
  let py = 0;
  for (let k = 0; k < other.length; k += 2) {
    const d = Math.hypot(other[k]! - mx, other[k + 1]! - my);
    if (d < best) {
      best = d;
      px = other[k]!;
      py = other[k + 1]!;
    }
  }
  const cross = (bx - ax) * (py - my) - (by - ay) * (px - mx);
  return cross > 0 ? -1 : 1;
}

// ---------------------------------------------------------------------------------------------
// 路轨拼接
// ---------------------------------------------------------------------------------------------

interface Extension {
  pts: P[];
  score: number;
  joints: P[];
}

/**
 * 从 chain 末端往前接路轨段（深度优先，选得分最高的一串）：得分 = 长度 − 2 × 转角（度）；
 * 转角 > MAX_TURN_DEG、或新段离 forbid 折线 < 1.2 m（会与另一条行车线交叉 / 重叠）的不接。
 */
function extendForward(chain: readonly P[], pool: readonly P[][], used: Set<number>, forbid: readonly P[], depth = 0): Extension {
  const best: Extension = { pts: [], score: 0, joints: [] };
  if (depth >= 6) return best;
  const end = chain[chain.length - 1]!;
  const back = pointAlong([...chain].reverse(), 8);
  const dir: P = [end[0] - back[0], end[1] - back[1]];
  pool.forEach((seg, k) => {
    if (used.has(k)) return;
    const a = seg[0]!;
    const b = seg[seg.length - 1]!;
    let oriented: P[] | null = null;
    if (Math.hypot(a[0] - end[0], a[1] - end[1]) <= NODE_M) oriented = seg;
    else if (Math.hypot(b[0] - end[0], b[1] - end[1]) <= NODE_M) oriented = [...seg].reverse();
    if (!oriented) return;
    const ahead = pointAlong(oriented, 8);
    const turn = angleBetween(dir[0], dir[1], ahead[0] - end[0], ahead[1] - end[1]);
    if (turn > MAX_TURN_DEG) return;
    // 离接头 6 m 以外的点不得贴近另一条行车线
    const len = polyLength(oriented);
    for (let s = 6; s < len; s += 2) {
      const p = pointAlong(oriented, s);
      if (forbid.length > 1 && distToPoly(forbid, p[0], p[1]) < 1.2) return;
    }
    used.add(k);
    const next = extendForward([...chain, ...oriented.slice(1)], pool, used, forbid, depth + 1);
    used.delete(k);
    const score = len - 2 * turn + next.score;
    if (score > best.score) {
      best.pts = [...oriented.slice(1), ...next.pts];
      best.score = score;
      best.joints = [end, ...next.joints];
    }
  });
  return best;
}

export interface ChainedTrack {
  pts: P[];
  westbound: boolean;
  /** 延伸段接头（模拟坐标，米）。 */
  joints: P[];
}

/** 拼出两条行车线（按行驶方向排列）：[西行, 东行]。少于两条主线时返回 []。 */
export function chainTracks(rails: readonly Rail[]): ChainedTrack[] {
  const tram = rails.filter((r) => r.kind === 'tram').map((r) => toPts(r.pts)).filter((p) => p.length >= 2);
  const lens = tram.map(polyLength);
  const order = tram.map((_, i) => i).sort((a, b) => lens[b]! - lens[a]!);
  const mains = order.filter((i) => lens[i]! >= MIN_MAIN_M).slice(0, 2);
  if (mains.length < 2) return [];
  const flat = (p: readonly P[]): FlatXY => p.flatMap((q) => [q[0] * 10, q[1] * 10]);
  const oriented = mains.map((i, k) => {
    const other = tram[mains[1 - k]!]!;
    const dir = tramDirection(flat(tram[i]!), flat(other));
    return dir > 0 ? tram[i]! : [...tram[i]!].reverse();
  });
  const pool = tram.map((p, i) => (mains.includes(i) ? [] : p));
  const used = new Set<number>(mains);
  const out: ChainedTrack[] = [];
  for (let k = 0; k < 2; k++) {
    const forbid = k === 0 ? oriented[1]! : out[0]!.pts;
    let pts = oriented[k]!;
    const joints: P[] = [];
    const fwd = extendForward(pts, pool, used, forbid);
    pts = [...pts, ...fwd.pts];
    joints.push(...fwd.joints);
    const rev = [...pts].reverse();
    const bwd = extendForward(rev, pool, used, forbid);
    pts = [...rev, ...bwd.pts].reverse();
    joints.push(...bwd.joints);
    // 用掉的段不再给另一条线
    for (let i = 0; i < pool.length; i++) {
      const seg = pool[i]!;
      if (seg.length < 2) continue;
      const mid = pointAlong(seg, polyLength(seg) / 2);
      if (distToPoly(pts, mid[0], mid[1]) < 0.2) used.add(i);
    }
    const dx = pts[pts.length - 1]![0] - pts[0]![0];
    out.push({ pts, westbound: dx < 0, joints });
  }
  // 西行在前
  return out[0]!.westbound ? out : [out[1]!, out[0]!];
}

// ---------------------------------------------------------------------------------------------
// 采样、拉开轨距、高程、接触线
// ---------------------------------------------------------------------------------------------

/** 等距重采样（首末点保留）。 */
export function resampleEven(pts: readonly P[], step: number): P[] {
  const len = polyLength(pts);
  const n = Math.max(2, Math.round(len / step) + 1);
  const out: P[] = [];
  const d = len / (n - 1);
  let i = 1;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = k * d;
    while (i < pts.length - 1) {
      const l = Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
      if (acc + l >= target) break;
      acc += l;
      i++;
    }
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = Math.min(Math.max((target - acc) / l, 0), 1);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** 折线的粗网格索引：最近点查询（m）。 */
class PolyIndex {
  private readonly cells = new Map<number, number[]>();
  constructor(
    private readonly pts: readonly P[],
    private readonly cell = 10,
  ) {
    pts.forEach((p, i) => {
      const k = this.key(Math.floor(p[0] / cell), Math.floor(p[1] / cell));
      const list = this.cells.get(k);
      if (list) list.push(i);
      else this.cells.set(k, [i]);
    });
  }
  private key(i: number, j: number): number {
    return (i + 5000) * 10000 + (j + 5000);
  }
  /** 最近的采样点（半径 reach 内），没有返回 −1。 */
  nearest(x: number, y: number, reach: number): number {
    const r = Math.ceil(reach / this.cell);
    const ci = Math.floor(x / this.cell);
    const cj = Math.floor(y / this.cell);
    let best = -1;
    let bd = reach;
    for (let i = ci - r; i <= ci + r; i++)
      for (let j = cj - r; j <= cj + r; j++)
        for (const k of this.cells.get(this.key(i, j)) ?? []) {
          const d = Math.hypot(this.pts[k]![0] - x, this.pts[k]![1] - y);
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
    return best;
  }
}

/** 采样点 i 的单位切向（中心差分）。 */
function tangent(pts: readonly P[], i: number): P {
  const a = pts[Math.max(i - 1, 0)]!;
  const b = pts[Math.min(i + 1, pts.length - 1)]!;
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
}

/** 点到另一折线（采样点 + 相邻段）的最近点。 */
function nearestOn(pts: readonly P[], idx: PolyIndex, x: number, y: number, reach: number): { d: number; px: number; py: number } | null {
  const k = idx.nearest(x, y, reach);
  if (k < 0) return null;
  let best = { d: Infinity, px: 0, py: 0 };
  for (const i of [k - 1, k]) {
    if (i < 0 || i + 1 >= pts.length) continue;
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.min(Math.max(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0), 1) : 0;
    const px = a[0] + t * dx;
    const py = a[1] + t * dy;
    const d = Math.hypot(px - x, py - y);
    if (d < best.d) best = { d, px, py };
  }
  return best;
}

/**
 * 并行段拉开轨距：两线都已等距采样。返回两线各点的横向位移（m，模拟坐标向量），
 * 位移方向 = 远离另一条线；量 = (gap − d) / 2，沿线 ±8 m 平滑。
 */
export function spreadOffsets(a: readonly P[], b: readonly P[], gap = TRACK_GAP_M): [P[], P[]] {
  const one = (self: readonly P[], other: readonly P[]): P[] => {
    const idx = new PolyIndex(other);
    const raw = self.map(([x, y]): P => {
      const hit = nearestOn(other, idx, x, y, 6);
      if (!hit || hit.d < 0.5 || hit.d >= gap + 0.6) return [0, 0];
      const k = Math.max(0, (gap - hit.d) / 2) * Math.min(1, (gap + 0.6 - hit.d) / 0.6);
      return [((x - hit.px) / hit.d) * k, ((y - hit.py) / hit.d) * k];
    });
    const R = 4;
    return raw.map((_, i) => {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let j = Math.max(0, i - R); j <= Math.min(raw.length - 1, i + R); j++) {
        sx += raw[j]![0];
        sy += raw[j]![1];
        n++;
      }
      return [sx / n, sy / n];
    });
  };
  return [one(a, b), one(b, a)];
}

/**
 * 轨顶高程：中心与左右 0.6 m（两根钢轨处）取高、高斯平滑（σ 1 m），且不低于原始值；再抬 BED_LIFT_M。
 * 数据里不少路段两条单向车行道之间的电车专用带没有路面覆盖（看得见的是压低的地形，比两边路面低 0.3 m 左右）：
 * 钢轨按两侧路面的高度铺，混凝土板盖住这条缝。
 */
export function railHeights(pts: readonly P[], surfaceM: (x: number, y: number) => number): Float64Array {
  const n = pts.length;
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i]!;
    const [tx, ty] = tangent(pts, i);
    raw[i] = Math.max(surfaceM(x, y), surfaceM(x - ty * 0.6, y + tx * 0.6), surfaceM(x + ty * 0.6, y - tx * 0.6));
  }
  const wide = raw;
  const out = new Float64Array(n);
  const sigma = 1 / ROUTE_STEP_M;
  const R = Math.ceil(sigma * 2);
  for (let i = 0; i < n; i++) {
    let sw = 0;
    let sz = 0;
    for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) {
      const w = Math.exp(-((j - i) * (j - i)) / (2 * sigma * sigma));
      sw += w;
      sz += w * wide[j]!;
    }
    out[i] = Math.max(sz / sw, raw[i]!) + BED_LIFT_M;
  }
  return out;
}

/** 接触线高度：桥底下压低，坡度 ≤ slope（两遍距离变换）。 */
export function wireHeights(pts: readonly P[], z: Float64Array, soffit?: (x: number, y: number) => number | null, slope = 0.06): Float64Array {
  const n = pts.length;
  const w = new Float64Array(n).fill(WIRE_H_M);
  if (soffit) {
    for (let i = 0; i < n; i++) {
      const s = soffit(pts[i]![0], pts[i]![1]);
      if (s !== null) w[i] = Math.max(WIRE_MIN_M, Math.min(WIRE_H_M, s - z[i]! - 0.35));
    }
  }
  const d = slope * ROUTE_STEP_M;
  for (let i = 1; i < n; i++) w[i] = Math.min(w[i]!, w[i - 1]! + d);
  for (let i = n - 2; i >= 0; i--) w[i] = Math.min(w[i]!, w[i + 1]! + d);
  return w;
}

/** 由路轨数据建两条行车线（[西行, 东行]）。 */
export function buildRoutes(rails: readonly Rail[], ctx: RouteContext): TramRoute[] {
  const chained = chainTracks(rails);
  if (chained.length < 2) return [];
  const sampled = chained.map((c) => resampleEven(c.pts, ROUTE_STEP_M));
  const [offA, offB] = spreadOffsets(sampled[0]!, sampled[1]!);
  const moved = sampled.map((pts, k) => pts.map(([x, y], i): P => [x + (k === 0 ? offA : offB)[i]![0], y + (k === 0 ? offA : offB)[i]![1]]));
  // 接驳点：其他路轨段的端点落在线上 3 m 内 + 延伸段接头
  const tram = rails.filter((r) => r.kind === 'tram').map((r) => toPts(r.pts));
  const surfaceM = (x: number, y: number) => ctx.surface(x * 10, y * 10) / 10;
  return moved.map((pts, k) => {
    const n = pts.length;
    const idx = new PolyIndex(pts);
    const junctions: number[] = [];
    const ends: P[] = [...chained[k]!.joints];
    for (const seg of tram) if (seg.length >= 2) ends.push(seg[0]!, seg[seg.length - 1]!);
    for (const [x, y] of ends) {
      const i = idx.nearest(x, y, 3);
      if (i <= 0 || i >= n - 1) continue;
      const s = i * ROUTE_STEP_M;
      if (!junctions.some((q) => Math.abs(q - s) < 4)) junctions.push(s);
    }
    junctions.sort((a, b) => a - b);
    const z = railHeights(pts, surfaceM);
    const x = Float64Array.from(pts, (p) => p[0]);
    const y = Float64Array.from(pts, (p) => p[1]);
    return {
      id: k,
      westbound: chained[k]!.westbound,
      x,
      y,
      z,
      wire: wireHeights(pts, z, ctx.soffit),
      len: (n - 1) * ROUTE_STEP_M,
      junctions,
    };
  });
}

export interface RoutePose {
  x: number;
  y: number;
  z: number;
  /** 水平单位切向（模拟坐标）。 */
  hx: number;
  hy: number;
}

/** 沿线 s（m）处的位置（线性插值）。 */
export function routePoint(r: TramRoute, s: number, out: { x: number; y: number; z: number }): void {
  const n = r.x.length;
  const f = Math.min(Math.max(s / ROUTE_STEP_M, 0), n - 1);
  const i = Math.min(Math.floor(f), n - 2);
  const t = f - i;
  out.x = r.x[i]! + (r.x[i + 1]! - r.x[i]!) * t;
  out.y = r.y[i]! + (r.y[i + 1]! - r.y[i]!) * t;
  out.z = r.z[i]! + (r.z[i + 1]! - r.z[i]!) * t;
}

const tmpA = { x: 0, y: 0, z: 0 };
const tmpB = { x: 0, y: 0, z: 0 };

/** 沿线 s 处的位置与朝向（朝向取 s ± span 两点连线：车身单转向架，弯道上平顺转向）。 */
export function routePose(r: TramRoute, s: number, out: RoutePose, span = 3): void {
  routePoint(r, s, out);
  routePoint(r, s - span, tmpA);
  routePoint(r, s + span, tmpB);
  const dx = tmpB.x - tmpA.x;
  const dy = tmpB.y - tmpA.y;
  const l = Math.hypot(dx, dy) || 1;
  out.hx = dx / l;
  out.hy = dy / l;
}

/** 沿线 s 处的插值（接触线高度等逐点数组）。 */
export function sampleAt(arr: Float64Array, s: number): number {
  const n = arr.length;
  const f = Math.min(Math.max(s / ROUTE_STEP_M, 0), n - 1);
  const i = Math.min(Math.floor(f), n - 2);
  const t = f - i;
  return arr[i]! + (arr[i + 1]! - arr[i]!) * t;
}

/** 点（模拟坐标，米）在路线上的投影：沿线位置 s、距离 d、在行驶方向左（+1）还是右（−1）。 */
export function projectOnRoute(r: TramRoute, x: number, y: number): { s: number; d: number; side: 1 | -1 } {
  let best = { s: 0, d: Infinity, side: 1 as 1 | -1 };
  const n = r.x.length;
  for (let i = 1; i < n; i++) {
    const ax = r.x[i - 1]!;
    const ay = r.y[i - 1]!;
    const dx = r.x[i]! - ax;
    const dy = r.y[i]! - ay;
    // 粗筛
    if (Math.abs(x - ax) > best.d + 4 && Math.abs(x - ax) > 30) continue;
    if (Math.abs(y - ay) > best.d + 4 && Math.abs(y - ay) > 30) continue;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / l2, 0), 1) : 0;
    const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
    if (d < best.d) {
      const cross = dx * (y - ay) - dy * (x - ax);
      best = { s: (i - 1 + t) * ROUTE_STEP_M, d, side: cross >= 0 ? 1 : -1 };
    }
  }
  return best;
}

/** 曲率半径（m）：s ± 6 m 弦线的转角。直线返回 Infinity。 */
export function radiusAt(r: TramRoute, s: number): number {
  const a = { x: 0, y: 0, z: 0, hx: 0, hy: 0 };
  const b = { x: 0, y: 0, z: 0, hx: 0, hy: 0 };
  routePose(r, s - 6, a, 2);
  routePose(r, s + 6, b, 2);
  const turn = Math.acos(Math.min(Math.max(a.hx * b.hx + a.hy * b.hy, -1), 1));
  return turn < 1e-4 ? Infinity : 12 / turn;
}

/**
 * 建筑墙面规划：楼脚埋深 + 共面墙去重。
 *
 * 楼脚：墙底要低于整圈墙脚下的地面。只看轮廓顶点会漏掉两顶点之间的地形凹陷（10 m 地形三角面），
 * 楼脚就悬空露缝；所以沿外环和洞的每条边每 STEP_DM 采样一次地面。
 *
 * 共面墙：地政总署的塔楼轮廓常与裙楼共用外边，两面墙朝向相同、位置重合、高度区间重叠，
 * 深度缓冲分不出前后，街上看是闪烁的竖条纹。对每对这样的边：楼顶较高的一方保留整面墙，
 * 另一方在重合段上不画被它覆盖的那段高度。按楼顶高低排定先后，被去掉的部分总有一面更高的墙补上。
 */
import type { FlatXY } from '@central/data';
import type { HeightFn } from '../data/terrain';

/** 墙脚地面的采样间距（dm）。 */
const STEP_DM = 5;
/** 共面判定：两边方向夹角 ≤ 约 1°，端点离对方直线 ≤ 1 dm，沿边重合 ≥ 1 dm。 */
const COS_TOL = Math.cos((1 * Math.PI) / 180);
const DIST_TOL_DM = 1;
const MIN_OVERLAP_DM = 1;
/** 空间哈希格边长（dm）。 */
const CELL_DM = 200;

/** 一栋楼的墙：rings[0] 为外环（CCW），其余为洞（CW），与 extrudePrism 收到的环完全相同。 */
export interface WallBody {
  rings: readonly FlatXY[];
  bottom: number;
  top: number;
}

/** 一条边上不画的部分：沿边距离 [s0, s1]（dm，从边起点量），高程 [z0, z1]（dm）。 */
export interface WallCut {
  s0: number;
  s1: number;
  z0: number;
  z1: number;
}

/** 要画的一块墙面：沿边 [s0, s1]，高程 [z0, z1]。 */
export type WallSpan = WallCut;

/** 楼的墙面去重结果：cutsOf(楼序号, 环序号, 边序号)。 */
export type WallCutsFn = (body: number, ring: number, edge: number) => readonly WallCut[] | undefined;

/** 环上（含每条边上每 STEP_DM 一点）最低的地面高程（dm）。 */
export function lowestAlongRings(rings: readonly FlatXY[], ground: HeightFn): number {
  let low = Infinity;
  for (const r of rings) {
    const n = r.length >> 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = r[i * 2]!;
      const y0 = r[i * 2 + 1]!;
      const dx = r[j * 2]! - x0;
      const dy = r[j * 2 + 1]! - y0;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / STEP_DM));
      // 每条边取 [0, 1)：终点由下一条边的起点覆盖
      for (let k = 0; k < steps; k++) low = Math.min(low, ground(x0 + (dx * k) / steps, y0 + (dy * k) / steps));
    }
  }
  return low;
}

interface Edge {
  body: number;
  ring: number;
  index: number;
  x0: number;
  y0: number;
  ux: number;
  uy: number;
  len: number;
}

function collectEdges(bodies: readonly WallBody[]): Edge[] {
  const edges: Edge[] = [];
  bodies.forEach((b, body) =>
    b.rings.forEach((r, ring) => {
      const n = r.length >> 1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x0 = r[i * 2]!;
        const y0 = r[i * 2 + 1]!;
        const dx = r[j * 2]! - x0;
        const dy = r[j * 2 + 1]! - y0;
        const len = Math.hypot(dx, dy);
        if (len < MIN_OVERLAP_DM) continue;
        edges.push({ body, ring, index: i, x0, y0, ux: dx / len, uy: dy / len, len });
      }
    }),
  );
  return edges;
}

/**
 * e 上与 f 共面重合的区间（沿 e 的距离，dm）；不共面或重合太短返回 null。
 * 距离只在重合段两端量：f 可能远长于 e，微小夹角在 f 的远端会放大，但那里与 e 并不重合。
 */
function overlapOn(e: Edge, f: Edge): [number, number] | null {
  if (e.ux * f.ux + e.uy * f.uy < COS_TOL) return null;
  const x1 = f.x0 + f.ux * f.len;
  const y1 = f.y0 + f.uy * f.len;
  // f 两端在 e 上的投影 t 与到 e 所在直线的距离 d（e 的法向 = (uy, −ux)）
  const t0 = (f.x0 - e.x0) * e.ux + (f.y0 - e.y0) * e.uy;
  const t1 = (x1 - e.x0) * e.ux + (y1 - e.y0) * e.uy;
  const d0 = (f.x0 - e.x0) * e.uy - (f.y0 - e.y0) * e.ux;
  const d1 = (x1 - e.x0) * e.uy - (y1 - e.y0) * e.ux;
  const s0 = Math.max(0, Math.min(t0, t1));
  const s1 = Math.min(e.len, Math.max(t0, t1));
  if (s1 - s0 < MIN_OVERLAP_DM) return null;
  const distAt = (s: number) => Math.abs(d0 + ((d1 - d0) * (s - t0)) / (t1 - t0));
  return distAt(s0) <= DIST_TOL_DM && distAt(s1) <= DIST_TOL_DM ? [s0, s1] : null;
}

/** b 是否压过 a（楼顶高者优先；同高时墙更高者优先；再同则序号小者优先）。 */
function outranks(bodies: readonly WallBody[], b: number, a: number): boolean {
  const A = bodies[a]!;
  const B = bodies[b]!;
  if (B.top !== A.top) return B.top > A.top;
  if (B.bottom !== A.bottom) return B.bottom < A.bottom;
  return b < a;
}

/** 找出所有共面重合的墙，返回各边要去掉的部分。 */
export function planWallCuts(bodies: readonly WallBody[]): WallCutsFn {
  const edges = collectEdges(bodies);
  const grid = new Map<number, number[]>();
  edges.forEach((e, k) => {
    const xa = Math.min(e.x0, e.x0 + e.ux * e.len) - DIST_TOL_DM;
    const xb = Math.max(e.x0, e.x0 + e.ux * e.len) + DIST_TOL_DM;
    const ya = Math.min(e.y0, e.y0 + e.uy * e.len) - DIST_TOL_DM;
    const yb = Math.max(e.y0, e.y0 + e.uy * e.len) + DIST_TOL_DM;
    for (let gx = Math.floor(xa / CELL_DM); gx <= Math.floor(xb / CELL_DM); gx++) {
      for (let gy = Math.floor(ya / CELL_DM); gy <= Math.floor(yb / CELL_DM); gy++) {
        const key = gx * 4096 + gy;
        const cell = grid.get(key);
        if (cell) cell.push(k);
        else grid.set(key, [k]);
      }
    }
  });
  const cuts = new Map<string, WallCut[]>();
  const seen = new Set<number>();
  for (const cell of grid.values()) {
    for (let p = 0; p < cell.length; p++) {
      for (let q = p + 1; q < cell.length; q++) {
        const ka = Math.min(cell[p]!, cell[q]!);
        const kb = Math.max(cell[p]!, cell[q]!);
        const a = edges[ka]!;
        const b = edges[kb]!;
        // 先用最便宜的条件筛：同一栋楼、方向不同的直接跳过
        if (a.body === b.body || a.ux * b.ux + a.uy * b.uy < COS_TOL) continue;
        const pair = ka * edges.length + kb;
        if (seen.has(pair)) continue;
        seen.add(pair);
        const [lose, win] = outranks(bodies, b.body, a.body) ? [a, b] : [b, a];
        const span = overlapOn(lose, win);
        if (!span) continue;
        const L = bodies[lose.body]!;
        const W = bodies[win.body]!;
        const z0 = Math.max(L.bottom, W.bottom);
        const z1 = Math.min(L.top, W.top);
        if (z1 <= z0) continue;
        const key = `${lose.body}:${lose.ring}:${lose.index}`;
        const list = cuts.get(key);
        const cut = { s0: span[0], s1: span[1], z0, z1 };
        if (list) list.push(cut);
        else cuts.set(key, [cut]);
      }
    }
  }
  return (body, ring, edge) => cuts.get(`${body}:${ring}:${edge}`);
}

/**
 * 一条长 len 的边、高程 [bottom, top] 的墙，扣掉 cuts 后实际要画的块。
 * 沿边按各 cut 的端点切段，每段扣掉覆盖它的 cut 的高程区间。
 */
export function visibleSpans(len: number, bottom: number, top: number, cuts: readonly WallCut[]): WallSpan[] {
  const stops = [0, len];
  for (const c of cuts) stops.push(Math.min(Math.max(c.s0, 0), len), Math.min(Math.max(c.s1, 0), len));
  stops.sort((a, b) => a - b);
  const out: WallSpan[] = [];
  for (let i = 1; i < stops.length; i++) {
    const s0 = stops[i - 1]!;
    const s1 = stops[i]!;
    if (s1 - s0 < 1e-6) continue;
    const mid = (s0 + s1) / 2;
    const holes = cuts.filter((c) => c.s0 <= mid && mid <= c.s1).sort((a, b) => a.z0 - b.z0);
    let z = bottom;
    for (const c of holes) {
      if (c.z0 > z) out.push({ s0, s1, z0: z, z1: Math.min(c.z0, top) });
      z = Math.max(z, c.z1);
      if (z >= top) break;
    }
    if (z < top) out.push({ s0, s1, z0: z, z1: top });
  }
  return out;
}

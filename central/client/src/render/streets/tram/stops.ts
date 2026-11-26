/**
 * 电车站岛（R2 TRAMS T8）：纯函数，模拟坐标（米）。
 * - 站岛 24 × 2.0 m，高出路面 0.18 m；在各自轨道的车门一侧（行驶方向左侧 = 轨道外侧，夹在轨道与一般车道之间），
 *   内缘离轨道中心 1.45 m。
 * - 沿两条行车线每 220–280 m 一个，固定包含四个锚点（±5 m）：W1、W2（西行）、E1、E2（东行），
 *   让「電車」机位与天桥机位前面一定有站。锚点之外的站：站岛中线离过路处 / 交通灯点 ≥ 6 m、两端离路轨接驳点 ≥ 8 m
 *   （规格原写 15 m；中环、上环的德辅道中几乎每 40–60 m 就有过路处，15 m 下整段找不到站位。真实的电车站也多半紧贴路口过路处），
 *   不在敏感区、不压楼、不压任何电车线的车身包络、外缘离一般车道中心线 ≥ 1.4 m，离路线两端 ≥ 80 m。
 * - 站岛是直的：取 s ± 12 m 两点的弦向为轴；弯道上把站岛向外推，保证内缘离轨道最近处仍 ≥ 1.45 m（±12 m 内转角 ≤ 9°）。
 * - 站名牌留白：站名不是目的地，不写任何地名。
 */
import { projectOnRoute, routePoint, routePose, type TramRoute } from './route';

export const ISLAND_LEN_M = 24;
export const ISLAND_W_M = 2.0;
export const ISLAND_H_M = 0.18;
/** 站岛内缘离轨道中心（m）。 */
export const ISLAND_EDGE_M = 1.45;
export const STOP_SPACING_M = 250;
const STOP_SLACK_M = 30;
const END_CLEAR_M = 80;
const POINT_CLEAR_M = 6;
const JUNCTION_CLEAR_M = 8;
const LANE_CLEAR_M = 1.4;
const MAX_BEND_DEG = 9;

/** 固定站（锚点，模拟坐标米）：与 SCR 视点约定一致。 */
export const STOP_ANCHORS: readonly { name: string; x: number; y: number; westbound: boolean }[] = [
  { name: 'W1', x: 238.5, y: -17.8, westbound: true },
  { name: 'W2', x: 339.9, y: -153.9, westbound: true },
  { name: 'E1', x: 269.5, y: -50.7, westbound: false },
  { name: 'E2', x: 373.0, y: -185.3, westbound: false },
];

export interface TramStop {
  id: string;
  /** 路线下标（0 西行 / 1 东行）与站在路线上的沿线位置（m，车身中心停在这里）。 */
  route: number;
  s: number;
  /** 站岛中心（模拟坐标，米）、轴向（行驶方向单位向量）。 */
  centre: [number, number];
  axis: [number, number];
  length: number;
  width: number;
  /** 站岛底面（路面）高程 mPD（米）。 */
  z: number;
  /** 0–1 稳定种子（遮篷颜色、灯箱、候车人）。 */
  seed: number;
  anchor: string | null;
}

/** 一般车道中心线（模拟坐标，米）：给站岛离车道的检查。 */
export interface LaneLine {
  /** 折线（米）平铺。 */
  pts: number[];
}

export interface StopContext {
  /** 过路处、交通灯点（模拟坐标，米）。 */
  points: readonly [number, number][];
  /** 敏感区内？（模拟坐标，米） */
  inZone: (x: number, y: number) => boolean;
  /** 在楼宇轮廓内？（模拟坐标，米） */
  inBuilding: (x: number, y: number) => boolean;
  /** 一般车道中心线。 */
  lanes: readonly LaneLine[];
  /** 路面高程（模拟坐标米 → mPD 米）。 */
  surfaceM: (x: number, y: number) => number;
}

function hash01(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(Math.max(((px - ax) * dx + (py - ay) * dy) / l2, 0), 1) : 0;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}

/**
 * 站岛几何（中心、轴向）：轴向 = s ± 12 m 两点的弦；中心在 s 处轨道点的左侧，
 * 横距 = 轨道在站岛范围内向左最远的偏移 + ISLAND_EDGE + 半宽（弯道上站岛整体外推，内缘不压车）。
 */
export function islandFrame(r: TramRoute, s: number): { centre: [number, number]; axis: [number, number] } {
  const half = ISLAND_LEN_M / 2;
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 0, y: 0, z: 0 };
  const p = { x: 0, y: 0, z: 0 };
  routePoint(r, s - half, a);
  routePoint(r, s + half, b);
  routePoint(r, s, p);
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ax = (b.x - a.x) / l;
  const ay = (b.y - a.y) / l;
  // 左法线（模拟坐标）= (−ay, ax)
  const nx = -ay;
  const ny = ax;
  let maxLat = 0;
  const q = { x: 0, y: 0, z: 0 };
  for (let u = -half; u <= half + 1e-6; u += 2) {
    routePoint(r, s + u, q);
    maxLat = Math.max(maxLat, (q.x - p.x) * nx + (q.y - p.y) * ny);
  }
  const off = maxLat + ISLAND_EDGE_M + ISLAND_W_M / 2;
  return { centre: [p.x + nx * off, p.y + ny * off], axis: [ax, ay] };
}

/** 站岛轮廓上的采样点（四角、长边每 6 m）。 */
export function islandSamples(c: readonly [number, number], a: readonly [number, number]): [number, number][] {
  const out: [number, number][] = [];
  const nx = -a[1];
  const ny = a[0];
  for (let u = -ISLAND_LEN_M / 2; u <= ISLAND_LEN_M / 2 + 1e-6; u += 6) {
    for (const v of [-ISLAND_W_M / 2, 0, ISLAND_W_M / 2]) out.push([c[0] + a[0] * u + nx * v, c[1] + a[1] * u + ny * v]);
  }
  return out;
}

/** 点 (x, y)（模拟米）是否在某个站岛矩形（外扩 margin m）里。整合（R2）：架空线杆、路边设施都要让开站岛。 */
export function inIsland(
  islands: readonly { centre: readonly [number, number]; axis: readonly [number, number]; length: number; width: number }[],
  x: number,
  y: number,
  margin = 0,
): boolean {
  for (const s of islands) {
    const dx = x - s.centre[0];
    const dy = y - s.centre[1];
    if (Math.abs(dx) > 20 || Math.abs(dy) > 20) continue;
    const u = dx * s.axis[0] + dy * s.axis[1];
    const v = -dx * s.axis[1] + dy * s.axis[0];
    if (Math.abs(u) <= s.length / 2 + margin && Math.abs(v) <= s.width / 2 + margin) return true;
  }
  return false;
}

/** s 处能不能设站（锚点不查）。 */
export function stopValid(routes: readonly TramRoute[], r: TramRoute, s: number, ctx: StopContext, why?: (r: string) => void): boolean {
  const no = (k: string) => (why?.(k), false);
  if (s < END_CLEAR_M || s > r.len - END_CLEAR_M) return no('end');
  const half = ISLAND_LEN_M / 2;
  const a = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };
  const b = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };
  routePose(r, s - half, a, 2);
  routePose(r, s + half, b, 2);
  if (Math.acos(Math.min(Math.max(a.hx * b.hx + a.hy * b.hy, -1), 1)) > (MAX_BEND_DEG * Math.PI) / 180) return no('curve');
  for (const j of r.junctions) if (Math.abs(j - s) < half + JUNCTION_CLEAR_M) return no('junction');
  const { centre, axis } = islandFrame(r, s);
  const e0x = centre[0] - axis[0] * half;
  const e0y = centre[1] - axis[1] * half;
  const e1x = centre[0] + axis[0] * half;
  const e1y = centre[1] + axis[1] * half;
  for (const [px, py] of ctx.points) {
    if (Math.abs(px - centre[0]) > 60 || Math.abs(py - centre[1]) > 60) continue;
    if (segDist(px, py, e0x, e0y, e1x, e1y) < POINT_CLEAR_M) return no('crossing');
  }
  const samples = islandSamples(centre, axis);
  for (const [x, y] of samples) {
    if (ctx.inZone(x, y) || ctx.inBuilding(x, y)) return no('building');
    // 不压任何一条电车线（交会车辆宽 2.35 m）
    for (const o of routes) if (projectOnRoute(o, x, y).d < 1.4) return no('track');
  }
  for (const lane of ctx.lanes) {
    const p = lane.pts;
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2]!;
      const ay = p[i - 1]!;
      const bx = p[i]!;
      const by = p[i + 1]!;
      if (Math.min(ax, bx) > centre[0] + 20 || Math.max(ax, bx) < centre[0] - 20) continue;
      if (Math.min(ay, by) > centre[1] + 20 || Math.max(ay, by) < centre[1] - 20) continue;
      for (const [x, y] of samples) if (segDist(x, y, ax, ay, bx, by) < LANE_CLEAR_M) return no('lane');
    }
  }
  return true;
}

/** 在 target ± STOP_SLACK 内找最近的可用位置（5 m 步），找不到返回 null。 */
function search(routes: readonly TramRoute[], r: TramRoute, target: number, ctx: StopContext): number | null {
  for (let d = 0; d <= STOP_SLACK_M; d += 5) {
    for (const s of d === 0 ? [target] : [target + d, target - d]) if (stopValid(routes, r, s, ctx)) return s;
  }
  return null;
}

/** 全部站岛（确定性）：先放锚点，再从锚点向两头每 ~250 m 补站。 */
export function placeStops(routes: readonly TramRoute[], ctx: StopContext): TramStop[] {
  const out: TramStop[] = [];
  for (const r of routes) {
    const fixed: { s: number; name: string }[] = [];
    for (const a of STOP_ANCHORS) {
      if (a.westbound !== r.westbound) continue;
      const hit = projectOnRoute(r, a.x, a.y);
      if (hit.d > 8) continue;
      fixed.push({ s: hit.s, name: a.name });
    }
    fixed.sort((p, q) => p.s - q.s);
    const list: { s: number; name: string | null }[] = fixed.map((f) => ({ s: f.s, name: f.name }));
    const seeds = fixed.length ? fixed.map((f) => f.s) : [r.len / 2];
    // 向前
    let last = Math.max(...seeds);
    for (let t = last + STOP_SPACING_M; t < r.len - END_CLEAR_M; ) {
      const s = search(routes, r, t, ctx);
      if (s !== null) {
        list.push({ s, name: null });
        last = s;
        t = s + STOP_SPACING_M;
      } else t += STOP_SPACING_M / 2;
    }
    // 向后
    last = Math.min(...seeds);
    for (let t = last - STOP_SPACING_M; t > END_CLEAR_M; ) {
      const s = search(routes, r, t, ctx);
      if (s !== null) {
        list.push({ s, name: null });
        last = s;
        t = s - STOP_SPACING_M;
      } else t -= STOP_SPACING_M / 2;
    }
    if (!fixed.length) {
      const s = search(routes, r, r.len / 2, ctx);
      if (s !== null) list.push({ s, name: null });
    }
    list.sort((p, q) => p.s - q.s);
    list.forEach((st, k) => {
      const { centre, axis } = islandFrame(r, st.s);
      out.push({
        id: st.name ?? `${r.westbound ? 'w' : 'e'}${k}`,
        route: r.id,
        s: st.s,
        centre,
        axis,
        length: ISLAND_LEN_M,
        width: ISLAND_W_M,
        z: ctx.surfaceM(centre[0], centre[1]),
        seed: hash01(Math.round(st.s * 10) * 31 + r.id * 7919 + 17),
        anchor: st.name,
      });
    });
  }
  return out;
}

/**
 * 电车架空线（R2 TRAMS T6）布置：纯函数，模拟坐标（米，高程 mPD）。
 * - 接触线：每条行车线一根，沿轨道中心线、轨顶上 route.wire（5.8 m；桥下压低）。
 * - 横跨线（span wire）：每 30 ± 5 m（按种子）一道，横跨两条并行轨道；两端各挂在：
 *   - 楼面锚（距最近轨道中心 ≤ 14 m 有楼墙时，挂在墙上 8.5 m），或
 *   - 路边钢杆（9 m 高、Ø 0.2 m，立在路缘外 0.6 m 的人行道上；不进楼、不进敏感区、不在过路处 2.5 m 内）。
 *   只有一侧有支撑时改成悬臂（从杆 / 墙伸出的横臂越过远侧接触线 0.5 m，另加一根斜拉线）。
 *   德辅道中没有中间杆（照片 07、08、09）。天桥 / 高架下与过路处附近不设跨线。
 * - 跨线从支撑点 8.5 m 斜下到接触线上方 0.12 m，长跨略垂。
 */
import { projectOnRoute, routePoint, routePose, sampleAt, type TramRoute } from './route';

export const SPAN_EVERY_M = 30;
export const POLE_H_M = 9;
export const SPAN_TOP_M = 8.5;
const FACADE_REACH_M = 14;
const MAX_POLE_M = 22;
const PAIR_M = 6;

export type V3 = [number, number, number];

export interface Support {
  kind: 'pole' | 'anchor';
  /** 底部（杆）或挂点（锚）位置：模拟坐标米 + 高程 mPD。 */
  x: number;
  y: number;
  z: number;
  /** 杆朝向轨道的水平单位向量（模拟坐标）。 */
  dx: number;
  dy: number;
}

export interface OverheadPlan {
  supports: Support[];
  /** 跨线 / 悬臂 / 斜拉线折线（模拟坐标米，mPD）。 */
  spans: V3[][];
  /** 接触线折线（每条行车线一条或几段）。 */
  contact: V3[][];
}

export interface OverheadContext {
  inBuilding: (x: number, y: number) => boolean;
  inZone: (x: number, y: number) => boolean;
  /** 在某条可驾驶道路的车行道内（模拟坐标米）。 */
  inCarriageway: (x: number, y: number) => boolean;
  /** 过路处点（模拟坐标米）。 */
  crossings: readonly [number, number][];
  /** 头顶有桥（模拟坐标米）→ 桥底 mPD，否则 null。 */
  soffit: (x: number, y: number) => number | null;
  surfaceM: (x: number, y: number) => number;
  /** 整合（R2）：杆不能立的地方（站岛等，模拟坐标米）；碰到就沿法线继续往外找。 */
  blocked?: (x: number, y: number) => boolean;
}

const hash01 = (n: number): number => {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** 3D 折线 Douglas–Peucker 简化（tol 米）。 */
export function simplify3(pts: readonly V3[], tol: number): V3[] {
  if (pts.length <= 2) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const a = pts[i]!;
    const b = pts[j]!;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l2 = ab[0]! * ab[0]! + ab[1]! * ab[1]! + ab[2]! * ab[2]!;
    let worst = -1;
    let wd = tol;
    for (let k = i + 1; k < j; k++) {
      const p = pts[k]!;
      const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
      const t = l2 > 0 ? Math.min(Math.max((ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / l2, 0), 1) : 0;
      const d = Math.hypot(ap[0]! - ab[0]! * t, ap[1]! - ab[1]! * t, ap[2]! - ab[2]! * t);
      if (d > wd) {
        wd = d;
        worst = k;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([i, worst], [worst, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/** 接触线（每条行车线一条折线，简化到 5 cm）。 */
export function contactWires(routes: readonly TramRoute[]): V3[][] {
  return routes.map((r) => {
    const pts: V3[] = [];
    for (let i = 0; i < r.x.length; i++) pts.push([r.x[i]!, r.y[i]!, r.z[i]! + r.wire[i]!]);
    return simplify3(pts, 0.05);
  });
}

/** 从 (ox, oy) 沿 (nx, ny) 找一侧的支撑：楼面锚优先（≤ reach），否则路缘外的杆。 */
function findSupport(ox: number, oy: number, nx: number, ny: number, ctx: OverheadContext, routes: readonly TramRoute[], from: number): Support | null {
  for (let d = from; d <= FACADE_REACH_M; d += 0.5) {
    const x = ox + nx * d;
    const y = oy + ny * d;
    if (ctx.inBuilding(x, y)) {
      if (ctx.inZone(x, y)) return null;
      const ax = ox + nx * (d - 0.25);
      const ay = oy + ny * (d - 0.25);
      if (ctx.blocked?.(ax, ay)) return null;
      return { kind: 'anchor', x: ax, y: ay, z: ctx.surfaceM(ax, ay) + SPAN_TOP_M, dx: -nx, dy: -ny };
    }
  }
  // 路缘：离开车行道的第一个点（连续 0.6 m 不在车行道里）
  for (let d = Math.max(from, 1.8); d <= MAX_POLE_M; d += 0.5) {
    const x = ox + nx * d;
    const y = oy + ny * d;
    if (ctx.inBuilding(x, y)) return null;
    if (ctx.inCarriageway(x, y) || ctx.inCarriageway(x + nx * 0.6, y + ny * 0.6)) continue;
    const px = ox + nx * (d + 0.6);
    const py = oy + ny * (d + 0.6);
    if (ctx.blocked?.(px, py)) continue;
    if (ctx.inBuilding(px, py) || ctx.inZone(px, py)) return null;
    for (const [cx, cy] of ctx.crossings) if (Math.hypot(cx - px, cy - py) < 2.5) return null;
    for (const r of routes) if (projectOnRoute(r, px, py).d < 1.6) return null;
    return { kind: 'pole', x: px, y: py, z: ctx.surfaceM(px, py), dx: -nx, dy: -ny };
  }
  return null;
}

/** 跨线挂点高度（支撑点）。 */
const topOf = (s: Support): number => (s.kind === 'pole' ? s.z + SPAN_TOP_M : s.z);

/** 两点之间加一点下垂（长跨中点下垂 0.15 m）。 */
function sagged(a: V3, b: V3): V3[] {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (l < 6) return [a, b];
  return [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 - 0.15], b];
}

/** 折线（跨线、悬臂、斜拉线）是否穿过头顶的桥：桥底下 0.2 m 到桥顶（桥底 + 5 m，含玻璃廊与顶棚）之间算穿过。整合（R2）加。 */
export function crossesBridge(pts: readonly V3[], ctx: Pick<OverheadContext, 'soffit'>): boolean {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const so = ctx.soffit(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      const z = a[2] + (b[2] - a[2]) * t;
      if (so !== null && z > so - 0.2 && z < so + 5) return true;
    }
  }
  return false;
}

/** 全部支撑与跨线（确定性）。routes = [西行, 东行]。 */
export function placeOverhead(routes: readonly TramRoute[], ctx: OverheadContext): OverheadPlan {
  const supports: Support[] = [];
  const spans: V3[][] = [];
  const pose = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };
  const q = { x: 0, y: 0, z: 0 };
  routes.forEach((r, ri) => {
    const other = routes[1 - ri];
    let k = 0;
    for (let s = 12 + hash01(ri * 101 + 3) * 10; s < r.len - 12; k++) {
      const station = s;
      s += SPAN_EVERY_M - 5 + 10 * hash01(ri * 7919 + k * 31 + 5);
      routePose(r, station, pose, 3);
      const px = pose.x;
      const py = pose.y;
      // 左法线
      const nx = -pose.hy;
      const ny = pose.hx;
      const paired = other ? projectOnRoute(other, px, py) : null;
      const isPaired = !!paired && paired.d < PAIR_M;
      // 并行段只由西行线（0）布置；东行线只管自己单独走的段
      if (ri === 1 && isPaired) continue;
      if (ctx.soffit(px, py) !== null) continue;
      let crossingNear = false;
      for (const [cx, cy] of ctx.crossings) if (Math.hypot(cx - px, cy - py) < 4) crossingNear = true;
      if (crossingNear) continue;
      // 挂点：本线 + 并行的另一线
      const hangs: { x: number; y: number; z: number; lat: number }[] = [{ x: px, y: py, z: pose.z + sampleAt(r.wire, station) + 0.12, lat: 0 }];
      if (isPaired && other) {
        routePoint(other, paired.s, q);
        const lat = (q.x - px) * nx + (q.y - py) * ny;
        hangs.push({ x: q.x, y: q.y, z: q.z + sampleAt(other.wire, paired.s) + 0.12, lat });
      }
      hangs.sort((a, b) => b.lat - a.lat);
      const outer = hangs[0]!;
      const inner = hangs[hangs.length - 1]!;
      const left = findSupport(outer.x, outer.y, nx, ny, ctx, routes, 1.6);
      const right = findSupport(inner.x, inner.y, -nx, -ny, ctx, routes, 1.6);
      if (!left && !right) continue;
      const wirePts: V3[] = hangs.map((h) => [h.x, h.y, h.z]);
      if (left && right) {
        const chain: V3[] = [[left.x, left.y, topOf(left)], ...wirePts, [right.x, right.y, topOf(right)]];
        const out: V3[] = [chain[0]!];
        for (let i = 1; i < chain.length; i++) out.push(...sagged(chain[i - 1]!, chain[i]!).slice(1));
        // 跨线穿过行人天桥 / 高架路：这一档不挂
        if (crossesBridge(out, ctx)) continue;
        supports.push(left, right);
        spans.push(out);
      } else {
        // 悬臂：横臂 6.9 m 高越过远侧挂点 0.5 m，另一根斜拉线从 8.5 m 拉到横臂端
        const sup = (left ?? right)!;
        const far = left ? inner : outer;
        const dir = left ? -1 : 1;
        const tipX = far.x + nx * dir * 0.5;
        const tipY = far.y + ny * dir * 0.5;
        const armZ = Math.max(...hangs.map((h) => h.z)) + 0.9;
        const armBase: V3 = [sup.x, sup.y, Math.min(armZ, topOf(sup) - 0.6)];
        if (crossesBridge([armBase, [tipX, tipY, armBase[2]]], ctx) || crossesBridge([[sup.x, sup.y, topOf(sup)], [tipX, tipY, armBase[2]]], ctx)) continue;
        supports.push(sup);
        spans.push([armBase, [tipX, tipY, armBase[2]]]);
        spans.push([[sup.x, sup.y, topOf(sup)], [tipX, tipY, armBase[2]]]);
        for (const h of hangs) spans.push([[h.x, h.y, armBase[2]], [h.x, h.y, h.z - 0.1]]);
      }
    }
  });
  return { supports, spans, contact: contactWires(routes) };
}

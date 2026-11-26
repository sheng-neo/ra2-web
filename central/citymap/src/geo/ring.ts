/**
 * 扁平环（[x0, y0, x1, y1, ...]，首尾不重复）的几何工具。坐标为本地 dm。
 */

/** 2 倍有向面积：> 0 为逆时针（CCW）。 */
export function signedArea2(r: readonly number[]): number {
  let s = 0;
  const n = r.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    s += r[i]! * r[j + 1]! - r[j]! * r[i + 1]!;
  }
  return s;
}

/** 面积（dm²，非负）。 */
export function ringArea(r: readonly number[]): number {
  return Math.abs(signedArea2(r)) / 2;
}

/** 去掉连续重复点与首尾闭合重复点。 */
export function dedupeRing(r: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < r.length; i += 2) {
    const x = r[i]!;
    const y = r[i + 1]!;
    const n = out.length;
    if (n >= 2 && out[n - 2] === x && out[n - 1] === y) continue;
    out.push(x, y);
  }
  while (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) {
    out.length -= 2;
  }
  return out;
}

/** 反转点序。 */
function reverseRing(r: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = r.length - 2; i >= 0; i -= 2) out.push(r[i]!, r[i + 1]!);
  return out;
}

/** 统一绕向：ccw=true 时输出逆时针，否则顺时针。 */
export function orientRing(r: readonly number[], ccw: boolean): number[] {
  const isCcw = signedArea2(r) > 0;
  return isCcw === ccw ? r.slice() : reverseRing(r);
}

/** 点 (px, py) 到线段 (ax, ay)-(bx, by) 的距离平方。 */
function pointSegDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx - px;
  const qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

/** Douglas–Peucker：折线 pts（扁平）在 tol 内简化，保留首尾。 */
export function simplifyLine(pts: readonly number[], tol: number): number[] {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const tol2 = tol * tol;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = pointSegDist2(pts[2 * i]!, pts[2 * i + 1]!, pts[2 * a]!, pts[2 * a + 1]!, pts[2 * b]!, pts[2 * b + 1]!);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i]!, pts[2 * i + 1]!);
  return out;
}

/**
 * 闭合环的 Douglas–Peucker：以 0 号点和离它最远的点为锚，两段分别简化。
 * 结果不足 3 点时返回原环。
 */
export function simplifyRing(r: readonly number[], tol: number): number[] {
  const n = r.length / 2;
  if (n <= 3) return r.slice();
  let far = 1;
  let farD = -1;
  for (let i = 1; i < n; i++) {
    const dx = r[2 * i]! - r[0]!;
    const dy = r[2 * i + 1]! - r[1]!;
    const d = dx * dx + dy * dy;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = simplifyLine(r.slice(0, 2 * far + 2), tol);
  const b = simplifyLine([...r.slice(2 * far), r[0]!, r[1]!], tol);
  // a 以 far 点结尾，b 以 far 点开头、0 号点结尾：拼接时去掉重复的锚点
  const out = [...a, ...b.slice(2, b.length - 2)];
  return out.length >= 6 ? out : r.slice();
}

/** 面积加权质心；退化环退回顶点平均。 */
export function ringCentroid(r: readonly number[]): [number, number] {
  const a2 = signedArea2(r);
  const n = r.length;
  if (a2 === 0) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i += 2) {
      sx += r[i]!;
      sy += r[i + 1]!;
    }
    return [sx / (n / 2), sy / (n / 2)];
  }
  // 以首点为参考减小大数相乘误差
  const ox = r[0]!;
  const oy = r[1]!;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const xi = r[i]! - ox;
    const yi = r[i + 1]! - oy;
    const xj = r[j]! - ox;
    const yj = r[j + 1]! - oy;
    const f = xi * yj - xj * yi;
    cx += (xi + xj) * f;
    cy += (yi + yj) * f;
  }
  return [ox + cx / (3 * a2), oy + cy / (3 * a2)];
}

/** 射线法点在环内（边界上的点结果不定）。 */
export function pointInRing(x: number, y: number, r: readonly number[]): boolean {
  let inside = false;
  const n = r.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = r[i]!;
    const yi = r[i + 1]!;
    const xj = r[j]!;
    const yj = r[j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 两线段是否严格交叉（端点接触、共线重叠不算：这些情况点到线段距离已经是 0）。 */
function segmentsCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number =>
    Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 &&
    o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0;
}

/** 两个环之间的最短距离（dm）；相交或包含时为 0。 */
export function ringDistance(a: readonly number[], b: readonly number[]): number {
  if (pointInRing(a[0]!, a[1]!, b) || pointInRing(b[0]!, b[1]!, a)) return 0;
  let best = Infinity;
  const na = a.length;
  const nb = b.length;
  for (let i = 0; i < na; i += 2) {
    const i2 = (i + 2) % na;
    for (let j = 0; j < nb; j += 2) {
      const j2 = (j + 2) % nb;
      if (segmentsCross(a[i]!, a[i + 1]!, a[i2]!, a[i2 + 1]!, b[j]!, b[j + 1]!, b[j2]!, b[j2 + 1]!)) return 0;
      best = Math.min(
        best,
        pointSegDist2(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!, b[j2]!, b[j2 + 1]!),
        pointSegDist2(b[j]!, b[j + 1]!, a[i]!, a[i + 1]!, a[i2]!, a[i2 + 1]!),
      );
    }
  }
  return Math.sqrt(best);
}

/**
 * 最小面积外接矩形的长边方向（弧度，[-π/2, π/2)）及长、短边长。
 * 旋转卡壳的简化版：逐条凸包边试一遍。
 */
export function minAreaRect(r: readonly number[]): { angle: number; long: number; short: number } {
  const hull = convexHull(r);
  let best = { area: Infinity, angle: 0, long: 0, short: 0 };
  const n = hull.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const ex = hull[j]! - hull[i]!;
    const ey = hull[j + 1]! - hull[i + 1]!;
    const len = Math.hypot(ex, ey);
    if (len === 0) continue;
    const ux = ex / len;
    const uy = ey / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (let k = 0; k < n; k += 2) {
      const u = hull[k]! * ux + hull[k + 1]! * uy;
      const v = -hull[k]! * uy + hull[k + 1]! * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const w = maxU - minU;
    const h = maxV - minV;
    if (w * h < best.area) {
      const angle = w >= h ? Math.atan2(uy, ux) : Math.atan2(ux, -uy);
      best = { area: w * h, angle, long: Math.max(w, h), short: Math.min(w, h) };
    }
  }
  let a = best.angle;
  while (a >= Math.PI / 2) a -= Math.PI;
  while (a < -Math.PI / 2) a += Math.PI;
  return { angle: a, long: best.long, short: best.short };
}

/** Andrew 单调链凸包（CCW，扁平）。 */
function convexHull(r: readonly number[]): number[] {
  const pts: [number, number][] = [];
  for (let i = 0; i < r.length; i += 2) pts.push([r[i]!, r[i + 1]!]);
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].flat();
}

/** 两线段是否有公共点（含端点接触、共线重叠）。 */
function segmentsTouch(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const on = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): boolean =>
    Math.min(px, qx) <= rx && rx <= Math.max(px, qx) && Math.min(py, qy) <= ry && ry <= Math.max(py, qy);
  const o1 = o(ax, ay, bx, by, cx, cy);
  const o2 = o(ax, ay, bx, by, dx, dy);
  const o3 = o(cx, cy, dx, dy, ax, ay);
  const o4 = o(cx, cy, dx, dy, bx, by);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (o1 === 0 && on(ax, ay, bx, by, cx, cy)) return true;
  if (o2 === 0 && on(ax, ay, bx, by, dx, dy)) return true;
  if (o3 === 0 && on(cx, cy, dx, dy, ax, ay)) return true;
  if (o4 === 0 && on(cx, cy, dx, dy, bx, by)) return true;
  return false;
}

/**
 * 环是不是简单多边形（R2 修复轮：LoD2 分层环在客户端用 earcut 三角化，自交 / 重复点会让屋顶三角形重叠或盖出墙外）：
 * 至少 3 个点、没有重复点、不相邻的边没有任何公共点。O(n²)，环不长。
 */
export function ringSimple(r: readonly number[]): boolean {
  const n = r.length >> 1;
  if (n < 3) return false;
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const k = `${r[i * 2]},${r[i * 2 + 1]}`;
    if (seen.has(k)) return false;
    seen.add(k);
  }
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n;
    for (let j = i + 1; j < n; j++) {
      const j1 = (j + 1) % n;
      if (j === i1 || j1 === i) continue; // 相邻边
      if (segmentsTouch(r[i * 2]!, r[i * 2 + 1]!, r[i1 * 2]!, r[i1 * 2 + 1]!, r[j * 2]!, r[j * 2 + 1]!, r[j1 * 2]!, r[j1 * 2 + 1]!)) return false;
    }
  }
  return true;
}

/** 两个环的边有没有任何公共点。 */
export function ringsTouch(a: readonly number[], b: readonly number[]): boolean {
  const na = a.length >> 1;
  const nb = b.length >> 1;
  for (let i = 0; i < na; i++) {
    const i1 = (i + 1) % na;
    for (let j = 0; j < nb; j++) {
      const j1 = (j + 1) % nb;
      if (segmentsTouch(a[i * 2]!, a[i * 2 + 1]!, a[i1 * 2]!, a[i1 * 2 + 1]!, b[j * 2]!, b[j * 2 + 1]!, b[j1 * 2]!, b[j1 * 2 + 1]!)) return true;
    }
  }
  return false;
}

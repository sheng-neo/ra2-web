/**
 * 扁平多边形环工具：[x0, y0, x1, y1, ...]，模拟坐标（dm）。
 * 只做客户端渲染需要的几样：面积、质心、绕向归一、点在多边形内。
 */
import type { FlatXY, Ring } from '@central/data';

/** 有向面积（鞋带公式）：逆时针为正。 */
export function signedArea(pts: FlatXY): number {
  const n = pts.length >> 1;
  let a = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    a += (pts[j * 2]! * pts[i * 2 + 1]!) - (pts[i * 2]! * pts[j * 2 + 1]!);
  }
  return a / 2;
}

/** 面积加权质心；退化（面积≈0）时退回顶点平均。 */
export function ringCentroid(pts: FlatXY): [number, number] {
  const n = pts.length >> 1;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const x0 = pts[j * 2]!;
    const y0 = pts[j * 2 + 1]!;
    const x1 = pts[i * 2]!;
    const y1 = pts[i * 2 + 1]!;
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      sx += pts[i * 2]!;
      sy += pts[i * 2 + 1]!;
    }
    return n > 0 ? [sx / n, sy / n] : [0, 0];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** 反转环的点序（返回新数组）。 */
export function reverseRing(pts: FlatXY): FlatXY {
  const out: FlatXY = new Array(pts.length);
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++) {
    out[i * 2] = pts[(n - 1 - i) * 2]!;
    out[i * 2 + 1] = pts[(n - 1 - i) * 2 + 1]!;
  }
  return out;
}

/** 去掉相邻重复点和首尾重复点（返回新数组）。 */
export function cleanRing(pts: FlatXY): FlatXY {
  const out: FlatXY = [];
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2]!;
    const y = pts[i * 2 + 1]!;
    const m = out.length;
    if (m >= 2 && out[m - 2] === x && out[m - 1] === y) continue;
    out.push(x, y);
  }
  while (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) {
    out.length -= 2;
  }
  return out;
}

/** 按契约归一绕向：外环逆时针、洞顺时针；不足 3 点的环丢弃。 */
export function normalizeRing(ring: Ring): { outer: FlatXY; holes: FlatXY[] } | null {
  let outer = cleanRing(ring.outer);
  if (outer.length < 6) return null;
  if (signedArea(outer) < 0) outer = reverseRing(outer);
  const holes: FlatXY[] = [];
  for (const h of ring.holes ?? []) {
    let hole = cleanRing(h);
    if (hole.length < 6) continue;
    if (signedArea(hole) > 0) hole = reverseRing(hole);
    holes.push(hole);
  }
  return { outer, holes };
}

/** 射线法点在环内（不区分绕向）。 */
export function pointInFlat(pts: FlatXY, x: number, y: number): boolean {
  const n = pts.length >> 1;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2]!;
    const yi = pts[i * 2 + 1]!;
    const xj = pts[j * 2]!;
    const yj = pts[j * 2 + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 点在带洞多边形内。 */
export function pointInRing(ring: Ring, x: number, y: number): boolean {
  if (!pointInFlat(ring.outer, x, y)) return false;
  for (const h of ring.holes ?? []) if (pointInFlat(h, x, y)) return false;
  return true;
}

/** 折线总长与中点（按弧长一半处的点）。 */
export function polylineMidpoint(pts: FlatXY): { length: number; x: number; y: number } {
  const n = pts.length >> 1;
  let len = 0;
  for (let i = 1; i < n; i++) {
    len += Math.hypot(pts[i * 2]! - pts[i * 2 - 2]!, pts[i * 2 + 1]! - pts[i * 2 - 1]!);
  }
  if (n === 0) return { length: 0, x: 0, y: 0 };
  let rest = len / 2;
  for (let i = 1; i < n; i++) {
    const x0 = pts[i * 2 - 2]!;
    const y0 = pts[i * 2 - 1]!;
    const seg = Math.hypot(pts[i * 2]! - x0, pts[i * 2 + 1]! - y0);
    if (seg >= rest && seg > 0) {
      const t = rest / seg;
      return { length: len, x: x0 + (pts[i * 2]! - x0) * t, y: y0 + (pts[i * 2 + 1]! - y0) * t };
    }
    rest -= seg;
  }
  return { length: len, x: pts[0]!, y: pts[1]! };
}

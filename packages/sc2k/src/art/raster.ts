// ===== art/raster.ts =====（spec:ui-art §3.2.1 菱形像素规则、§3.6 绘制原语；WP9）
// 索引色光栅原语：所有生成器只依赖本文件。坐标为画布像素；多边形用"像素中心采样 + 半开区间（上-左规则）"扫描线，
// 共享边只被一侧填充，相邻地块无缝不重叠。无 Math.random / 三角 / sqrt（ESLint 确定性规则）。
import type { ArtScale, IndexedBitmap } from '../contracts/render';
import { ZOOM_TABLE } from '../contracts/render';

export type NativeScale = 'S' | 'M' | 'L';
/** 一档的几何常量：W 格宽、H 格高（= W/2）、LEVEL 每级海拔像素、k = W/64（配方以 L 档像素书写）、lw 线宽。 */
export interface ScaleSpec { readonly scale: NativeScale; readonly W: number; readonly H: number; readonly LEVEL: number; readonly k: number; readonly lw: number }
const mk = (scale: NativeScale): ScaleSpec => {
  const z = ZOOM_TABLE.find((r) => r.scale === scale)!;
  return { scale, W: z.tileW, H: z.tileH, LEVEL: z.levelPx, k: z.tileW / 64, lw: Math.max(1, Math.round(z.tileW / 64)) };
};
export const SCALES: Readonly<Record<NativeScale, ScaleSpec>> = { S: mk('S'), M: mk('M'), L: mk('L') };
export const NATIVE_SCALES: ReadonlySet<ArtScale> = new Set<ArtScale>(['S', 'M', 'L']);
export const isNativeScale = (s: ArtScale): s is NativeScale => s === 'S' || s === 'M' || s === 'L';

/** L 档像素 → 本档像素（最小 1 px）。 */
export const px = (sp: ScaleSpec, n: number): number => Math.max(1, Math.round(n * sp.k));
/** L 档像素 → 本档像素（允许 0）。 */
export const px0 = (sp: ScaleSpec, n: number): number => Math.round(n * sp.k);

export function newBitmap(w: number, h: number, anchorX: number, anchorY: number): IndexedBitmap {
  return { w: w | 0, h: h | 0, data: new Uint8Array((w | 0) * (h | 0)), anchorX: anchorX | 0, anchorY: anchorY | 0, cycling: false };
}
export function cloneBitmap(b: IndexedBitmap): IndexedBitmap {
  return { w: b.w, h: b.h, data: new Uint8Array(b.data), anchorX: b.anchorX, anchorY: b.anchorY, cycling: b.cycling };
}

export function setPx(b: IndexedBitmap, x: number, y: number, idx: number): void {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  b.data[y * b.w + x] = idx;
}
export function getPx(b: IndexedBitmap, x: number, y: number): number {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return 0;
  return b.data[y * b.w + x]!;
}
/** 水平段 [x0, x1]（含端点）。 */
export function hline(b: IndexedBitmap, x0: number, x1: number, y: number, idx: number): void {
  y |= 0; if (y < 0 || y >= b.h) return;
  let a = Math.min(x0, x1) | 0, c = Math.max(x0, x1) | 0;
  if (a < 0) a = 0; if (c >= b.w) c = b.w - 1;
  const row = y * b.w;
  for (let x = a; x <= c; x++) b.data[row + x] = idx;
}
export function vline(b: IndexedBitmap, x: number, y0: number, y1: number, idx: number): void {
  x |= 0; if (x < 0 || x >= b.w) return;
  let a = Math.min(y0, y1) | 0, c = Math.max(y0, y1) | 0;
  if (a < 0) a = 0; if (c >= b.h) c = b.h - 1;
  for (let y = a; y <= c; y++) b.data[y * b.w + x] = idx;
}
export function fillRect(b: IndexedBitmap, x: number, y: number, w: number, h: number, idx: number): void {
  for (let yy = y | 0; yy < (y | 0) + (h | 0); yy++) hline(b, x | 0, (x | 0) + (w | 0) - 1, yy, idx);
}
export function strokeRect(b: IndexedBitmap, x: number, y: number, w: number, h: number, idx: number): void {
  hline(b, x, x + w - 1, y, idx); hline(b, x, x + w - 1, y + h - 1, idx); vline(b, x, y, y + h - 1, idx); vline(b, x + w - 1, y, y + h - 1, idx);
}

/** 顶点列表：平铺 [x0,y0,x1,y1,…]。 */
export type Pts = readonly number[];

/** 多边形区域的像素行区间：对每行 y 取中心 yc = y+0.5 与各边的交点，排序成对，像素 x 属于区间当 xa ≤ x+0.5 < xb。 */
function scanPoly(pts: Pts, w: number, h: number, visit: (x0: number, x1: number, y: number) => void): void {
  const n = pts.length >> 1;
  if (n < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (let k = 0; k < n; k++) { const y = pts[k * 2 + 1]!; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(h - 1, Math.ceil(maxY));
  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let k = 0; k < n; k++) {
      let ax = pts[k * 2]!, ay = pts[k * 2 + 1]!, bx = pts[((k + 1) % n) * 2]!, by = pts[((k + 1) % n) * 2 + 1]!;
      if (ay === by) continue;
      if (ay > by || (ay === by && ax > bx)) { const tx = ax, ty = ay; ax = bx; ay = by; bx = tx; by = ty; }   // 规范化边方向，使共享边两侧算出同一交点
      if (yc < ay || yc >= by) continue;
      xs.push(ax + (yc - ay) * (bx - ax) / (by - ay));
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]! - 0.5)), xb = Math.min(w, Math.ceil(xs[k + 1]! - 0.5));
      if (xb > xa) visit(xa, xb - 1, y);
    }
  }
}
/** 像素中心采样 + 半开区间：相邻多边形的共享边只被一侧填充。 */
export function fillPoly(b: IndexedBitmap, pts: Pts, idx: number): void {
  scanPoly(pts, b.w, b.h, (x0, x1, y) => { const row = y * b.w; for (let x = x0; x <= x1; x++) b.data[row + x] = idx; });
}
/** 50% 抖动填充：'checker' 棋盘、'rows' 隔行；idxB 为 0 时该像素不写（保留底色）。 */
export function ditherFill(b: IndexedBitmap, pts: Pts, idxA: number, idxB: number, pattern: 'checker' | 'rows' | 'sparse' = 'checker'): void {
  scanPoly(pts, b.w, b.h, (x0, x1, y) => {
    const row = y * b.w;
    for (let x = x0; x <= x1; x++) {
      const a = pattern === 'checker' ? ((x + y) & 1) === 0 : pattern === 'rows' ? (y & 1) === 0 : ((x + 2 * y) & 3) === 0;
      const v = a ? idxA : idxB;
      if (v !== 0) b.data[row + x] = v;
    }
  });
}
/** Bresenham 线段（含端点），lw > 1 时向右下加粗。 */
export function line(b: IndexedBitmap, x0: number, y0: number, x1: number, y1: number, idx: number, lw = 1): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (let guard = 0; guard < 100000; guard++) {
    if (lw <= 1) setPx(b, x, y, idx); else fillRect(b, x, y, lw, lw, idx);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
/** 2:1 等轴方向的线（路边、窗列）：与 line 同算法，保留名字以对应规格。 */
export const isoLine = line;
export function strokePoly(b: IndexedBitmap, pts: Pts, idx: number, lw = 1): void {
  const n = pts.length >> 1;
  for (let k = 0; k < n; k++) line(b, pts[k * 2]!, pts[k * 2 + 1]!, pts[((k + 1) % n) * 2]!, pts[((k + 1) % n) * 2 + 1]!, idx, lw);
}
/** 开放折线。 */
export function polyline(b: IndexedBitmap, pts: Pts, idx: number, lw = 1): void {
  const n = pts.length >> 1;
  for (let k = 0; k + 1 < n; k++) line(b, pts[k * 2]!, pts[k * 2 + 1]!, pts[k * 2 + 2]!, pts[k * 2 + 3]!, idx, lw);
}

/** 菱形各行宽度（W 偶数，H = W/2）：2, 6, 10, …, W−2, W−2, …, 6, 2。 */
export function diamondRowWidth(W: number, row: number): number {
  const H = W >> 1;
  const r = row < H / 2 ? row : H - 1 - row;
  return r < 0 ? 0 : 2 + 4 * r;
}
/** 整数规则菱形：包围盒左上 (x0, y0)，宽 W、高 H = W/2。与 fillPoly(顶点 上/右/下/左) 逐像素一致（raster.test 校验）。 */
export function fillDiamond(b: IndexedBitmap, x0: number, y0: number, W: number, H: number, idx: number): void {
  for (let row = 0; row < H; row++) {
    const w = diamondRowWidth(W, row);
    const xa = x0 + (W >> 1) - (w >> 1);
    hline(b, xa, xa + w - 1, y0 + row, idx);
  }
}
/** 菱形四顶点（上 右 下 左），供 fillPoly / strokePoly。 */
export const diamondPts = (x0: number, y0: number, W: number, H: number): number[] => [x0 + W / 2, y0, x0 + W, y0 + H / 2, x0 + W / 2, y0 + H, x0, y0 + H / 2];

/** 实心椭圆（中心 cx,cy，半径 rx,ry；像素中心采样，纯整数比较）。 */
export function fillEllipse(b: IndexedBitmap, cx: number, cy: number, rx: number, ry: number, idx: number): void {
  if (rx <= 0 || ry <= 0) return;
  const rx2 = rx * rx, ry2 = ry * ry, lim = rx2 * ry2;
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(b.h - 1, Math.ceil(cy + ry));
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(b.w - 1, Math.ceil(cx + rx));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    const row = y * b.w;
    for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx; if (dx * dx * ry2 + dy * dy * rx2 <= lim) b.data[row + x] = idx; }
  }
}
/** 半椭圆（上半 'top' / 下半 'bottom'）。 */
export function fillHalfEllipse(b: IndexedBitmap, cx: number, cy: number, rx: number, ry: number, idx: number, half: 'top' | 'bottom'): void {
  if (rx <= 0 || ry <= 0) return;
  const rx2 = rx * rx, ry2 = ry * ry, lim = rx2 * ry2;
  const y0 = Math.max(0, Math.floor(half === 'top' ? cy - ry : cy)), y1 = Math.min(b.h - 1, Math.ceil(half === 'top' ? cy : cy + ry));
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(b.w - 1, Math.ceil(cx + rx));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    if (half === 'top' ? dy > 0 : dy < 0) continue;
    const row = y * b.w;
    for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx; if (dx * dx * ry2 + dy * dy * rx2 <= lim) b.data[row + x] = idx; }
  }
}
/** 椭圆描边（1 px，内侧）。 */
export function strokeEllipse(b: IndexedBitmap, cx: number, cy: number, rx: number, ry: number, idx: number): void {
  if (rx <= 0 || ry <= 0) return;
  const inside = (x: number, y: number): boolean => { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; return dx * dx * ry * ry + dy * dy * rx * rx <= rx * rx * ry * ry; };
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(b.h - 1, Math.ceil(cy + ry));
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(b.w - 1, Math.ceil(cx + rx));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) b.data[y * b.w + x] = idx;
  }
}

/** 贴图：索引 0 透明；flip 为水平镜像（镜像后锚点 x 不变的语义由调用方保证）。 */
export function blit(dst: IndexedBitmap, src: IndexedBitmap, dx: number, dy: number, flip = false): void {
  dx |= 0; dy |= 0;
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y; if (ty < 0 || ty >= dst.h) continue;
    const srow = y * src.w, drow = ty * dst.w;
    for (let x = 0; x < src.w; x++) {
      const v = src.data[srow + (flip ? src.w - 1 - x : x)]!; if (v === 0) continue;
      const tx = dx + x; if (tx < 0 || tx >= dst.w) continue;
      dst.data[drow + tx] = v;
    }
  }
  if (src.cycling) dst.cycling = true;
}
/** 以锚点对齐贴图：src 的 (anchorX, anchorY) 落到 dst 的 (ax, ay)。 */
export function blitAnchored(dst: IndexedBitmap, src: IndexedBitmap, ax: number, ay: number, flip = false): void {
  blit(dst, src, ax - src.anchorX, ay - src.anchorY, flip);
}
/** 水平镜像副本（锚点 x 取镜像）。 */
export function mirrored(src: IndexedBitmap): IndexedBitmap {
  const out = newBitmap(src.w, src.h, src.w - 1 - src.anchorX, src.anchorY);
  out.cycling = src.cycling;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) out.data[y * src.w + (src.w - 1 - x)] = src.data[y * src.w + x]!;
  return out;
}
/** 位图是否全透明。 */
export const isBlank = (b: IndexedBitmap): boolean => b.data.every((v) => v === 0);

/** 最近邻整数倍放大（XS←S÷2 / XL←L×2 的派生由渲染器做；此处供工具与测试）。 */
export function upscale(src: IndexedBitmap, k: number): IndexedBitmap {
  const out = newBitmap(src.w * k, src.h * k, src.anchorX * k, src.anchorY * k);
  out.cycling = src.cycling;
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.data[y * out.w + x] = src.data[((y / k) | 0) * src.w + ((x / k) | 0)]!;
  return out;
}

/** FNV-1a 32 位图哈希（尺寸 + 锚点 + 像素），快照测试用。 */
export function bitmapHash(b: IndexedBitmap): number {
  let h = 0x811c9dc5;
  const mix = (v: number): void => { h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0; };
  for (const v of [b.w, b.h, b.anchorX, b.anchorY, b.cycling ? 1 : 0]) { mix(v); mix(v >>> 8); }
  for (let k = 0; k < b.data.length; k++) mix(b.data[k]!);
  return h >>> 0;
}

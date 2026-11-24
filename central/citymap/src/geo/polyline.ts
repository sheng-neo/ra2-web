/**
 * 扁平折线工具：长度、按长度比例截取、裁剪到矩形、等距采样。坐标为本地 dm。
 */
import { simplifyLine } from './ring';

/** [minX, minY, maxX, maxY] */
export type Rect = readonly [number, number, number, number];

/** 各顶点的累计长度。 */
function cumulative(p: readonly number[]): number[] {
  const c = [0];
  for (let i = 2; i < p.length; i += 2) c.push(c[c.length - 1]! + Math.hypot(p[i]! - p[i - 2]!, p[i + 1]! - p[i - 1]!));
  return c;
}

/** 按长度比例 [f0, f1]（0–1）截取子折线，插值点取整。 */
export function slicePolyline(p: readonly number[], f0: number, f1: number): number[] {
  const c = cumulative(p);
  const total = c[c.length - 1]!;
  const d0 = f0 * total;
  const d1 = f1 * total;
  const at = (d: number): [number, number] => {
    for (let i = 1; i < c.length; i++) {
      if (d <= c[i]! || i === c.length - 1) {
        const seg = c[i]! - c[i - 1]!;
        const t = seg > 0 ? Math.min(1, Math.max(0, (d - c[i - 1]!) / seg)) : 0;
        return [
          Math.round(p[2 * i - 2]! + t * (p[2 * i]! - p[2 * i - 2]!)),
          Math.round(p[2 * i - 1]! + t * (p[2 * i + 1]! - p[2 * i - 1]!)),
        ];
      }
    }
    return [p[0]!, p[1]!];
  };
  const out = [...at(d0)];
  for (let i = 1; i < c.length - 1; i++) if (c[i]! > d0 && c[i]! < d1) out.push(p[2 * i]!, p[2 * i + 1]!);
  out.push(...at(d1));
  return dedupeLine(out);
}

/** 去掉连续重复点。 */
function dedupeLine(p: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.length; i += 2) {
    const n = out.length;
    if (n >= 2 && out[n - 2] === p[i] && out[n - 1] === p[i + 1]) continue;
    out.push(p[i]!, p[i + 1]!);
  }
  return out;
}

/** Liang–Barsky 裁剪单条线段；返回参数区间或 null。 */
function clipSegment(x0: number, y0: number, x1: number, y1: number, r: Rect): [number, number] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const tests: [number, number][] = [
    [-dx, x0 - r[0]],
    [dx, r[2] - x0],
    [-dy, y0 - r[1]],
    [dy, r[3] - y0],
  ];
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

/** 把折线裁剪到矩形内，可能断成多段；每段 ≥2 点。 */
export function clipPolyline(p: readonly number[], r: Rect): number[][] {
  const pieces: number[][] = [];
  let cur: number[] = [];
  const flush = (): void => {
    const d = dedupeLine(cur);
    if (d.length >= 4) pieces.push(d);
    cur = [];
  };
  for (let i = 2; i < p.length; i += 2) {
    const x0 = p[i - 2]!;
    const y0 = p[i - 1]!;
    const x1 = p[i]!;
    const y1 = p[i + 1]!;
    const t = clipSegment(x0, y0, x1, y1, r);
    if (!t) {
      flush();
      continue;
    }
    const ax = Math.round(x0 + t[0] * (x1 - x0));
    const ay = Math.round(y0 + t[0] * (y1 - y0));
    const bx = Math.round(x0 + t[1] * (x1 - x0));
    const by = Math.round(y0 + t[1] * (y1 - y0));
    if (t[0] > 0) flush();
    if (cur.length === 0) cur.push(ax, ay);
    cur.push(bx, by);
    if (t[1] < 1) flush();
  }
  flush();
  return pieces;
}

/** 沿折线每隔 step 取一个点（含起点），取整。 */
export function samplePolyline(p: readonly number[], step: number): number[] {
  const out = [p[0]!, p[1]!];
  let next = step;
  let acc = 0;
  for (let i = 2; i < p.length; i += 2) {
    const dx = p[i]! - p[i - 2]!;
    const dy = p[i + 1]! - p[i - 1]!;
    const seg = Math.hypot(dx, dy);
    for (; next <= acc + seg; next += step) {
      const t = (next - acc) / seg;
      out.push(Math.round(p[i - 2]! + t * dx), Math.round(p[i - 1]! + t * dy));
    }
    acc += seg;
  }
  return out;
}

/** 裁剪到矩形后逐段 Douglas–Peucker 简化。 */
export function clipAndSimplify(p: readonly number[], r: Rect, tol: number): number[][] {
  return clipPolyline(p, r).map((piece) => simplifyLine(piece, tol));
}

export function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
}

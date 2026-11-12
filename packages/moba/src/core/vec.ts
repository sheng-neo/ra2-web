/**
 * 二维向量小工具。热路径上尽量用标量版本(dist/distSq)与就地写入(out 参数)，避免每 tick 分配对象。
 */
import type { Vec2 } from './types';

export const v2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const clone = (p: Vec2): Vec2 => ({ x: p.x, y: p.y });

export function set(out: Vec2, x: number, y: number): Vec2 {
  out.x = x;
  out.y = y;
  return out;
}

export function copy(out: Vec2, p: Vec2): Vec2 {
  out.x = p.x;
  out.y = p.y;
  return out;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function len(p: Vec2): number {
  return Math.hypot(p.x, p.y);
}

/** 归一化（新对象）。零向量返回 fallback（默认 {1,0}） */
export function norm(p: Vec2, fallback?: Vec2): Vec2 {
  const l = Math.hypot(p.x, p.y);
  if (l < 1e-9) return fallback ? { x: fallback.x, y: fallback.y } : { x: 1, y: 0 };
  return { x: p.x / l, y: p.y / l };
}

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
/** a + dir × k */
export const addScaled = (a: Vec2, dir: Vec2, k: number): Vec2 => ({ x: a.x + dir.x * k, y: a.y + dir.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export const angleOf = (p: Vec2): number => Math.atan2(p.y, p.x);
export const fromAngle = (a: number): Vec2 => ({ x: Math.cos(a), y: Math.sin(a) });

/** 逆时针(模拟平面里 x→y 方向)旋转 rad 弧度 */
export function rotate(p: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** 两个角度的最小夹角差，范围 (-π, π] */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** 点 p 到线段 ab 的最近点参数 t∈[0,1] */
export function projectT(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return 0;
  const t = ((px - ax) * dx + (py - ay) * dy) / l2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** 点到线段距离的平方 */
export function distSqToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const t = projectT(px, py, ax, ay, bx, by);
  const cx = ax + (bx - ax) * t - px;
  const cy = ay + (by - ay) * t - py;
  return cx * cx + cy * cy;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

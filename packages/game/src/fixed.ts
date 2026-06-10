/**
 * 确定性整数数学。
 * 角度用 8 位二进制角（0–255，0 = +x 方向，逆时针），
 * 三角函数查表（定点 65536），距离用整数平方根。
 */
import { FP_ONE, SIN_TABLE } from './fixed-tables';

export { FP_ONE };

/** sin（输入二进制角 0–255，输出定点 ×65536）。 */
export function fpSin(bangle: number): number {
  return SIN_TABLE[bangle & 0xff]!;
}

export function fpCos(bangle: number): number {
  return SIN_TABLE[(bangle + 64) & 0xff]!;
}

/** 整数平方根（牛顿法，floor）。 */
export function isqrt(n: number): number {
  if (n < 0) throw new Error('isqrt 负数');
  if (n < 2) return n;
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

/** 两点整数距离（lepton）。 */
export function dist(dx: number, dy: number): number {
  return isqrt(dx * dx + dy * dy);
}

/**
 * dx/dy → 二进制角（0–255），整数运算避免浮点 atan2。
 * 八分圆内用线性比值近似（最大误差约 2°；移动朝向最终量化到
 * 32 个渲染朝向 = 每 8 个二进制角一档，足够）。
 */
export function dirToBangle(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  // 第一象限角 0..64：ax≥ay 时 ≈ ay/ax 映射 0..32，否则取补
  const angle = ax >= ay ? Math.floor((ay * 32) / ax) : 64 - Math.floor((ax * 32) / ay);
  if (dx >= 0 && dy >= 0) return angle & 0xff;
  if (dx < 0 && dy >= 0) return (128 - angle) & 0xff;
  if (dx < 0 && dy < 0) return (128 + angle) & 0xff;
  return (256 - angle) & 0xff;
}

/** 朝目标角转动，每 tick 最多 rot 个二进制角；返回新朝向。 */
export function turnToward(current: number, target: number, rot: number): number {
  const diff = ((target - current + 128) & 0xff) - 128; // [-128, 127]
  if (Math.abs(diff) <= rot) return target & 0xff;
  return (current + (diff > 0 ? rot : -rot)) & 0xff;
}

/** 沿二进制角方向前进 distance（lepton），返回位移。 */
export function velocity(bangle: number, distance: number): { dx: number; dy: number } {
  return {
    dx: Math.round((fpCos(bangle) * distance) / FP_ONE),
    dy: Math.round((fpSin(bangle) * distance) / FP_ONE),
  };
}

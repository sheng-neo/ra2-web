import { describe, expect, it } from 'vitest';
import {
  dedupeRing,
  minAreaRect,
  orientRing,
  pointInRing,
  ringArea,
  ringCentroid,
  ringDistance,
  signedArea2,
  simplifyRing,
} from './ring';

const SQUARE_CCW = [0, 0, 10, 0, 10, 10, 0, 10];
const SQUARE_CW = [0, 0, 0, 10, 10, 10, 10, 0];

describe('环绕向', () => {
  it('有向面积：CCW 为正、CW 为负', () => {
    expect(signedArea2(SQUARE_CCW)).toBe(200);
    expect(signedArea2(SQUARE_CW)).toBe(-200);
    expect(ringArea(SQUARE_CW)).toBe(100);
  });

  it('orientRing 统一为指定绕向且不改形状', () => {
    expect(signedArea2(orientRing(SQUARE_CW, true))).toBeGreaterThan(0);
    expect(signedArea2(orientRing(SQUARE_CCW, false))).toBeLessThan(0);
    expect(orientRing(SQUARE_CCW, true)).toEqual(SQUARE_CCW);
  });

  it('去掉连续重复点和首尾闭合点', () => {
    expect(dedupeRing([0, 0, 10, 0, 10, 0, 10, 10, 0, 10, 0, 0])).toEqual(SQUARE_CCW);
  });
});

describe('简化', () => {
  it('去掉容差内的共线/微抖点，保留角点', () => {
    const r = [0, 0, 50, 1, 100, 0, 100, 100, 0, 100];
    expect(simplifyRing(r, 3)).toEqual([0, 0, 100, 0, 100, 100, 0, 100]);
  });

  it('结果至少 3 点', () => {
    const tri = [0, 0, 10, 0, 5, 1];
    expect(simplifyRing(tri, 50).length).toBeGreaterThanOrEqual(6);
  });
});

describe('度量', () => {
  it('质心与点在环内', () => {
    expect(ringCentroid([100, 100, 110, 100, 110, 110, 100, 110])).toEqual([105, 105]);
    expect(pointInRing(5, 5, SQUARE_CCW)).toBe(true);
    expect(pointInRing(15, 5, SQUARE_CCW)).toBe(false);
  });

  it('环间距离：分离、相交、包含', () => {
    const far = [20, 0, 30, 0, 30, 10, 20, 10];
    expect(ringDistance(SQUARE_CCW, far)).toBe(10);
    expect(ringDistance(SQUARE_CCW, [5, 5, 15, 5, 15, 15, 5, 15])).toBe(0);
    expect(ringDistance(SQUARE_CCW, [2, 2, 3, 2, 3, 3, 2, 3])).toBe(0);
  });

  it('最小外接矩形给出长边方向', () => {
    // 长 40、宽 10，长边朝东北 45°
    const c = Math.SQRT1_2;
    const r = [0, 0, 40 * c, 40 * c, 40 * c - 10 * c, 40 * c + 10 * c, -10 * c, 10 * c];
    const m = minAreaRect(r);
    expect(m.angle).toBeCloseTo(Math.PI / 4, 6);
    expect(m.long).toBeCloseTo(40, 6);
    expect(m.short).toBeCloseTo(10, 6);
  });
});

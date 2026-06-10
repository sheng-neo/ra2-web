import { describe, expect, it } from 'vitest';
import { FP_ONE, dirToBangle, dist, fpCos, fpSin, isqrt, turnToward, velocity } from './fixed';

describe('定点三角', () => {
  it('基准角', () => {
    expect(fpSin(0)).toBe(0);
    expect(fpSin(64)).toBe(FP_ONE);
    expect(fpSin(128)).toBe(0);
    expect(fpSin(192)).toBe(-FP_ONE);
    expect(fpCos(0)).toBe(FP_ONE);
    expect(fpCos(64)).toBe(0);
  });

  it('角度回绕', () => {
    expect(fpSin(256)).toBe(fpSin(0));
    expect(fpSin(300)).toBe(fpSin(44));
  });
});

describe('isqrt / dist', () => {
  it('整数平方根', () => {
    expect(isqrt(0)).toBe(0);
    expect(isqrt(1)).toBe(1);
    expect(isqrt(15)).toBe(3);
    expect(isqrt(16)).toBe(4);
    expect(isqrt(1_000_000)).toBe(1000);
    expect(isqrt(999_999)).toBe(999);
  });

  it('距离', () => {
    expect(dist(3, 4)).toBe(5);
    expect(dist(-3, 4)).toBe(5);
    expect(dist(256, 0)).toBe(256);
  });
});

describe('dirToBangle', () => {
  it('八方向', () => {
    expect(dirToBangle(100, 0)).toBe(0);
    expect(dirToBangle(100, 100)).toBe(32);
    expect(dirToBangle(0, 100)).toBe(64);
    expect(dirToBangle(-100, 100)).toBe(96);
    expect(dirToBangle(-100, 0)).toBe(128);
    expect(dirToBangle(-100, -100)).toBe(160);
    expect(dirToBangle(0, -100)).toBe(192);
    expect(dirToBangle(100, -100)).toBe(224);
  });
});

describe('turnToward', () => {
  it('最短弧转向', () => {
    expect(turnToward(0, 10, 4)).toBe(4);
    expect(turnToward(10, 0, 4)).toBe(6);
    expect(turnToward(0, 10, 100)).toBe(10);
    // 跨 0 回绕：250 → 6 顺时针 12 步
    expect(turnToward(250, 6, 4)).toBe(254);
    expect(turnToward(254, 6, 4)).toBe(2);
  });
});

describe('velocity', () => {
  it('沿轴移动', () => {
    expect(velocity(0, 100)).toEqual({ dx: 100, dy: 0 });
    expect(velocity(64, 100)).toEqual({ dx: 0, dy: 100 });
    expect(velocity(128, 100)).toEqual({ dx: -100, dy: 0 });
  });

  it('45° 移动各分量 ≈ d/√2', () => {
    const v = velocity(32, 100);
    expect(v.dx).toBeGreaterThan(69);
    expect(v.dx).toBeLessThan(72);
    expect(v.dx).toBe(v.dy);
  });
});

import { describe, expect, it } from 'vitest';
import { boxCorners, quadsOverlap, sweptInterval, type SweepSample } from './sweep';

/** 沿 +x 的直车道中心采样（three xz），s = x。 */
const straight = (len: number): SweepSample[] => Array.from({ length: len * 2 + 1 }, (_, i) => ({ s: i / 2, x: i / 2, z: 0, hx: 1, hz: 0 }));

describe('车身扫过的范围（sweep）', () => {
  it('盒子相交：分离轴', () => {
    const a = boxCorners({ s: 0, x: 0, z: 0, hx: 1, hz: 0 }, 2, 1, []);
    const b = boxCorners({ s: 0, x: 3.5, z: 0, hx: 0, hz: 1 }, 1, 1, []);
    const c = boxCorners({ s: 0, x: 2.9, z: 0, hx: 0, hz: 1 }, 1, 1, []);
    expect(quadsOverlap(a, b)).toBe(false);
    expect(quadsOverlap(a, c)).toBe(true);
  });

  it('直路上横着一条 4 m 宽的斑马线（x 20–24）：车头口径区间约为 [20, 24]（各种车长都一样）', () => {
    const zebra = [20, -5, 24, -5, 24, 5, 20, 5];
    const iv = sweptInterval([straight(60)], (q) => quadsOverlap(q, zebra));
    expect(iv).not.toBeNull();
    expect(iv![0]).toBeGreaterThan(19.3);
    expect(iv![0]).toBeLessThanOrEqual(20.01);
    expect(iv![1]).toBeGreaterThanOrEqual(23.99);
    expect(iv![1]).toBeLessThan(24.7);
  });

  it('碰不到返回 null；near 过滤掉远处的采样', () => {
    const far = [100, 10, 104, 10, 104, 20, 100, 20];
    expect(sweptInterval([straight(60)], (q) => quadsOverlap(q, far))).toBeNull();
    const zebra = [20, -5, 24, -5, 24, 5, 20, 5];
    expect(sweptInterval([straight(60)], (q) => quadsOverlap(q, zebra), 0, { x: 50, z: 0, r: 5 })).toBeNull();
  });
});

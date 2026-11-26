import { describe, expect, it } from 'vitest';
import { planAcUnits } from './ac-units';
import type { FrontageSpan } from './signs/placement';

const span = (typology: FrontageSpan['typology'], topM = 40): FrontageSpan => ({
  key: 12345,
  typology,
  core: 0.2,
  groundM: 10,
  topM,
  x0: 0,
  y0: 0,
  x1: 30,
  y1: 0,
  u0: 4,
  nx: 0,
  ny: -1,
});

describe('窗口冷气机（S9）', () => {
  it('只挂住宅 / 唐楼；铺面以上 3–6 层；离墙 0.3 m、在墙段范围内；确定性', () => {
    expect(planAcUnits(span('office'))).toEqual([]);
    expect(planAcUnits(span('podium'))).toEqual([]);
    const a = planAcUnits(span('tenement'));
    expect(a.length).toBeGreaterThan(5);
    expect(planAcUnits(span('tenement'))).toEqual(a);
    const floors = new Set(a.map((u) => Math.round((u.z - 10 - 5.2) / 2.9)));
    expect(floors.size).toBeGreaterThanOrEqual(3);
    expect(floors.size).toBeLessThanOrEqual(6);
    for (const u of a) {
      expect(u.z).toBeGreaterThan(10 + 5);
      expect(u.y).toBeCloseTo(-0.3, 6);
      expect(u.x).toBeGreaterThanOrEqual(0);
      expect(u.x).toBeLessThanOrEqual(30);
    }
  });
  it('矮楼不超出楼顶', () => {
    for (const u of planAcUnits(span('residential', 22))) expect(u.z).toBeLessThan(22);
  });
});

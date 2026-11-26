import { describe, expect, it } from 'vitest';
import { simToThreeVec } from '../../coords';
import type { Lane } from './lanes';
import { POLE_CLEAR_M, TramOccupancy, tramLaneConflicts, tramRouteProximity, type TramPositions } from './tram-traffic';
import { ROUTE_STEP_M, type TramRoute } from './tram/route';

/** 沿 x 轴（模拟坐标，y = 0）的直路线。 */
function straightRoute(id: number, x0: number, x1: number, y = 0): TramRoute {
  const n = Math.round((x1 - x0) / ROUTE_STEP_M) + 1;
  const xs = Float64Array.from({ length: n }, (_, i) => x0 + i * ROUTE_STEP_M);
  return { id, westbound: false, x: xs, y: new Float64Array(n).fill(y), z: new Float64Array(n), wire: new Float64Array(n).fill(5.8), len: (n - 1) * ROUTE_STEP_M, junctions: [] };
}

/** 模拟坐标（米）折线 → 车道（three 坐标）。 */
function lane(id: number, pts: [number, number][]): Lane {
  const flat: number[] = [];
  for (const [x, y] of pts) flat.push(...simToThreeVec(x, y, 0, 1));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return {
    id,
    cls: 'primary',
    pts: Float32Array.from(flat),
    cum: Float32Array.from(cum),
    len: cum[cum.length - 1]!,
    speed: 11,
    from: 'a',
    to: 'b',
    next: [],
    plan: 0,
    dir: 1,
    slot: 0,
    mid: [pts[0]![0], pts[0]![1]],
  };
}

describe('电车 × 车流（tram-traffic）', () => {
  const route = straightRoute(0, -200, 200);

  it('与路轨平行重叠的车道整条不开车；横过路轨的车道得到穿轨区（车头口径，含车长余量）', () => {
    const along = lane(0, [
      [-100, 1],
      [100, 1],
    ]);
    const parallelFar = lane(1, [
      [-100, 6],
      [100, 6],
    ]);
    const across = lane(2, [
      [0, -50],
      [0, 50],
    ]);
    const c = tramLaneConflicts([along, parallelFar, across], [route]);
    expect(c.shared.has(0)).toBe(true);
    expect(c.shared.has(1)).toBe(false);
    expect(c.shared.has(2)).toBe(false);
    expect(c.zones.filter((z) => z.lane === 1)).toEqual([]);
    const z = c.zones.filter((q) => q.lane === 2);
    expect(z.length).toBe(1);
    // 路轨在车道 50 m 处、与车道垂直：电车车身范围（中心线 ± 半宽 1.175 + 余量 0.35）沿车道是 50 ± 1.525；
    // 车头 > e0 且车尾 < e1 时压着，区前再留 1 m、区后 0.5 m
    expect(z[0]!.e0).toBeGreaterThan(50 - 1.525 - 1.6);
    expect(z[0]!.e0).toBeLessThan(50 - 1.525 - 0.9);
    expect(z[0]!.e1).toBeGreaterThan(50 + 1.525 + 0.4);
    expect(z[0]!.e1).toBeLessThan(50 + 1.525 + 1.1);
    expect(z[0]!.ra).toBeLessThanOrEqual(200);
    expect(z[0]!.rb).toBeGreaterThanOrEqual(200);
  });

  it('占用预测：电车离区还有多久到（窗口外为 Infinity）', () => {
    // 一辆车 8 m/s 从 s = 0 开出
    const src: TramPositions = {
      count: 1,
      routeOf: () => 0,
      positions: (t, out) => {
        out[0] = 8 * t;
      },
      poses: (t, out) => {
        out.set([8 * t, 0, 1, 0], 0);
      },
    };
    const occ = new TramOccupancy(src);
    const open = occ.openLeft(0, 0, 100, 104);
    // 车头进区（加车长与余量）约在 (100 − 7.85) / 8 ≈ 11.5 s
    expect(open).toBeGreaterThan(10);
    expect(open).toBeLessThan(12);
    expect(occ.openLeft(0, 0, 1000, 1004)).toBe(Infinity);
    expect(occ.openLeft(12.5, 0, 100, 104)).toBe(0);
  });

  it('杆离行车线判定：车身半宽 + 0.9 m', () => {
    const near = tramRouteProximity([route]);
    expect(near(10, POLE_CLEAR_M - 0.05, POLE_CLEAR_M)).toBe(true);
    expect(near(10, POLE_CLEAR_M + 0.05, POLE_CLEAR_M)).toBe(false);
  });
});

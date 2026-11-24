import { describe, expect, it } from 'vitest';
import { ROUTES, boatAt } from './boats';

describe('船只航线', () => {
  it('位置只由时间决定，且始终在航线段上', () => {
    for (const r of ROUTES) {
      for (let t = 0; t < 2000; t += 37) {
        const a = boatAt(r, t);
        const b = boatAt(r, t);
        expect(a).toEqual(b);
        const dx = r.b[0] - r.a[0];
        const dy = r.b[1] - r.a[1];
        const k = ((a.x - r.a[0]) * dx + (a.y - r.a[1]) * dy) / (dx * dx + dy * dy);
        expect(k).toBeGreaterThanOrEqual(-1e-6);
        expect(k).toBeLessThanOrEqual(1 + 1e-6);
        // 离航线的横向距离为 0
        expect(Math.abs((a.x - r.a[0]) * dy - (a.y - r.a[1]) * dx) / Math.hypot(dx, dy)).toBeLessThan(1e-6);
      }
    }
  });

  it('去程船头朝 b、回程朝 a，靠岸时停着', () => {
    const r = ROUTES[0]!;
    const len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
    const run = len / r.speed;
    const out = boatAt(r, run * 0.5 - r.phase);
    expect(Math.cos(out.heading - Math.atan2(r.b[1] - r.a[1], r.b[0] - r.a[0]))).toBeCloseTo(1, 6);
    expect(out.moving).toBe(1);
    const dwell = boatAt(r, run + r.dwell * 0.5 - r.phase);
    expect(dwell.moving).toBe(0);
    expect(dwell.x).toBeCloseTo(r.b[0], 6);
    const back = boatAt(r, run * 1.5 + r.dwell - r.phase);
    expect(Math.cos(back.heading - Math.atan2(r.a[1] - r.b[1], r.a[0] - r.b[0]))).toBeCloseTo(1, 6);
  });

  it('航速不超过设定航速的 1.6 倍（首尾缓加减速）', () => {
    for (const r of ROUTES) {
      let prev = boatAt(r, 0);
      for (let t = 0.5; t < 1500; t += 0.5) {
        const cur = boatAt(r, t);
        expect(Math.hypot(cur.x - prev.x, cur.y - prev.y) / 0.5).toBeLessThan(r.speed * 1.6);
        prev = cur;
      }
    }
  });
});

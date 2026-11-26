import { describe, expect, it } from 'vitest';
import { Boats, ROUTES, STAR_CENTRAL_BERTH, STAR_FERRIES, STAR_PIER_AXIS_DEG, boatAt, routeTiming, smoothPath, starFerryGeometry, starPlan } from './boats';
import { SIM_CLOCK, setQuality } from './materials/lighting';
import { STAR_FERRY_NAMES } from './streets/transit-data';

const near = (r: (typeof ROUTES)[number], t: number, p: readonly [number, number], m: number) => {
  const b = boatAt(r, t);
  return Math.hypot(b.x - p[0], b.y - p[1]) <= m;
};

describe('船只航线（R3：天星小轮、新渡輪）', () => {
  it('位置只由时间决定（确定性）；航速不超过平均航速的 1.8 倍（首尾缓加减速峰值 1.5 倍 + 会船横移）', () => {
    for (const r of ROUTES) {
      let prev = boatAt(r, 0);
      for (let t = 0.5; t < 1600; t += 0.5) {
        const cur = boatAt(r, t);
        expect(boatAt(r, t)).toEqual(cur);
        expect(Math.hypot(cur.x - prev.x, cur.y - prev.y) / 0.5).toBeLessThan(r.speed * 1.8);
        prev = cur;
      }
    }
  });

  it('天星小轮：3 艘、船名来自 transit-data；开场 0–15 s 有一艘停在 7 号码头西侧泊位，船身沿码头轴线', () => {
    const star = ROUTES.filter((r) => r.operator === 'star');
    expect(star).toHaveLength(STAR_FERRIES);
    for (const r of star) expect(STAR_FERRY_NAMES[r.name!]).toBeDefined();
    for (let t = 0; t <= 15; t += 1) {
      const docked = star.filter((r) => near(r, t, STAR_CENTRAL_BERTH, 0.5) && boatAt(r, t).moving === 0);
      expect(docked.length).toBe(1);
      const b = boatAt(docked[0]!, t);
      const axis = (STAR_PIER_AXIS_DEG * Math.PI) / 180;
      // 双头船：船身轴线与码头轴线平行（同向或反向）
      expect(Math.abs(Math.sin(b.heading - axis))).toBeLessThan(0.02);
    }
  });

  it('天星小轮：一个周期里中环泊位有船停着 ≥ 35 % 的时间，任何时刻最多一艘；对开的船错开 ≥ 25 m（不互穿）', () => {
    const star = ROUTES.filter((r) => r.operator === 'star');
    const { period } = routeTiming(star[0]!);
    let occupied = 0;
    let n = 0;
    let minGap = Infinity;
    for (let t = 0; t < period; t += 1) {
      const at = star.filter((r) => near(r, t, STAR_CENTRAL_BERTH, 0.5) && boatAt(r, t).moving === 0).length;
      expect(at).toBeLessThanOrEqual(1);
      if (at) occupied++;
      n++;
      const bs = star.map((r) => boatAt(r, t));
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) {
          // 都在开、而且都离开泊位 150 m 以上时才算（泊位附近排队靠岸由停留时间错开保证）
          const a = bs[i]!;
          const b = bs[j]!;
          if (!a.moving || !b.moving) continue;
          minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.y - b.y));
        }
    }
    expect(occupied / n).toBeGreaterThanOrEqual(0.35);
    expect(minGap).toBeGreaterThan(25);
  });

  it('单头船回程掉头（船头朝行进方向），双头船不掉头', () => {
    const sun = ROUTES.find((r) => r.operator === 'sun')!;
    const { run } = routeTiming(sun);
    const out = boatAt(sun, sun.dwellA + run * 0.5 - sun.phase);
    const back = boatAt(sun, sun.dwellA + run + sun.dwellB + run * 0.5 - sun.phase);
    expect(out.moving).toBe(1);
    expect(back.moving).toBe(1);
    expect(Math.cos(out.heading - back.heading)).toBeLessThan(-0.5);
    const star = ROUTES.find((r) => r.operator === 'star')!;
    const st = routeTiming(star);
    const s1 = boatAt(star, star.dwellA + st.run * 0.5 - star.phase);
    const s2 = boatAt(star, star.dwellA + st.run + star.dwellB + st.run * 0.5 - star.phase);
    expect(Math.cos(s1.heading - s2.heading)).toBeGreaterThan(0.5);
  });

  it('平滑航线保留首尾点与第一段方向；天星小轮几何约 40 × 9.5 m、≤ 320 三角形', () => {
    const p = smoothPath([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(p[0]).toEqual([0, 0]);
    expect(p[p.length - 1]).toEqual([10, 10]);
    expect(p[1]![1]).toBeCloseTo(0, 9);
    const plan = starPlan();
    const xs = plan.map((q) => q[0]);
    const zs = plan.map((q) => q[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(40.2, 1);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(9.5, 1);
    const g = starFerryGeometry();
    expect(g.getAttribute('position').count / 3).toBeLessThanOrEqual(320);
  });

  it('调试钩子 boats()：开场停在 7 号码头西侧的是天星小轮（有船名），新渡輪与小汽艇的营运商', () => {
    setQuality({ tier: 'high', bloom: true, reflection: true });
    const boats = new Boats();
    const t0 = SIM_CLOCK.t;
    SIM_CLOCK.t = 5;
    const list = boats.debug();
    SIM_CLOCK.t = t0;
    expect(list).toHaveLength(ROUTES.length);
    const docked = list.filter((b) => b.operator === 'star' && !b.moving && Math.hypot(b.x - STAR_CENTRAL_BERTH[0], b.y - STAR_CENTRAL_BERTH[1]) < 0.5);
    expect(docked).toHaveLength(1);
    expect(docked[0]!.name).toBe('Northern Star');
    expect(list.filter((b) => b.operator === 'sun')).toHaveLength(1);
    expect(list.filter((b) => b.operator === 'generic').length).toBeGreaterThan(0);
  });
});

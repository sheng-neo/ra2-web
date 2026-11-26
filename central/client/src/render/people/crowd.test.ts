import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, type CityFile } from '@central/data';
import { simToThreeVec } from '../../coords';
import { reliefGrid, reliefHeight } from '../../data/terrain';
import { footprintTest, renderedTerrain } from '../road-corridor';
import { planRoads } from '../roads';
import { buildLanes, lanePose } from '../streets/lanes';
import { busStopLanes } from '../streets/kerbside';
import { PED_FLASH, PED_GREEN, crossingPhase, laneSignalPhases, pedCycle, signalHeads } from '../streets/signals';
import { CORE_RECT_M } from '../streets';
import { buildStreetLife } from '../streets/streetlife';
import { RenderedSurface, dropZoneLamps, inZones, outsideZones } from '../streets/surface';
import { SIM_DT, Traffic, isBusKind } from '../streets/traffic';
import { Crowd, DENSITY, PALETTE, greenStart, lookOf, type AgentPose } from './crowd';
import { CROSSING_HALF_M, TRAM_CLEAR_M, buildCrossingSites, buildWalkPaths, crossingRect, walkContext } from './walkways';
import { linearRGB } from '../streets/prop-geometry';

describe('外形（纯函数）', () => {
  const looks = Array.from({ length: 4000 }, (_, i) => lookOf(i * 7919 + 3));
  it('上衣色调比例：约一半深色、约三成中灰卡其、10–20 % 浅色衬衫、≤ 5 % 鲜色', () => {
    const share = (t: string) => looks.filter((l) => l.topTone === t).length / looks.length;
    expect(share('dark')).toBeGreaterThan(0.45);
    expect(share('dark')).toBeLessThan(0.56);
    expect(share('mid')).toBeGreaterThan(0.25);
    expect(share('mid')).toBeLessThan(0.36);
    expect(share('light')).toBeGreaterThan(0.1);
    expect(share('light')).toBeLessThan(0.2);
    expect(share('accent')).toBeLessThanOrEqual(0.06);
    // 颜色确实来自色板
    const all = new Set(Object.values(PALETTE).flat().map((h) => linearRGB(h).join(',')));
    for (const l of looks.slice(0, 200)) expect(all.has(l.top.join(','))).toBe(true);
  });

  it('身高 1.55–1.85 m（平均约 1.68），约 10 % 拿着亮屏手机；同一种子外形相同', () => {
    let sum = 0;
    for (const l of looks) {
      expect(l.height).toBeGreaterThanOrEqual(1.55);
      expect(l.height).toBeLessThanOrEqual(1.85);
      sum += l.height;
    }
    expect(sum / looks.length).toBeGreaterThan(1.64);
    expect(sum / looks.length).toBeLessThan(1.72);
    const phones = looks.filter((l) => l.phone).length / looks.length;
    expect(phones).toBeGreaterThan(0.07);
    expect(phones).toBeLessThan(0.13);
    expect(lookOf(42)).toEqual(lookOf(42));
  });

  it('绿灯周期起点：greenStart ≤ t < greenStart + 60，且那一刻正好是行人绿灯开始', () => {
    for (const ph of [0, 0.3, 0.77]) {
      for (const t of [0, 12.3, 59.9, 61, 333.3]) {
        const g = greenStart(t, ph);
        expect(g).toBeLessThanOrEqual(t + 1e-9);
        expect(t - g).toBeLessThan(60);
        expect(pedCycle(g, ph)).toBeCloseTo(PED_GREEN, 6);
      }
    }
  });
});

describe('真实数据：行人只在人行道 / 行人街 / 天桥上，横过马路只在斑马线、只在绿色行人灯时', () => {
  const read = (n: string) => readFileSync(new URL(`../../../public/city/${n}`, import.meta.url));
  const city = JSON.parse(read('central.json').toString('utf8')) as CityFile;
  const relief = reliefGrid(decodeTerrain(read('terrain.bin')));
  const ground = reliefHeight(relief);
  const plans = planRoads(city.roads, ground, city.props);
  const zones = city.zones.sensitive;
  dropZoneLamps(plans, zones);
  const surface = new RenderedSurface(plans, renderedTerrain(relief, plans, city.buildings).fn);
  const at = (x: number, y: number) => surface.heightAt(x, y);
  const inBuilding = footprintTest(city.buildings);
  const ctx = walkContext(plans, city.rails, inBuilding, zones, CORE_RECT_M);
  const paths = buildWalkPaths(plans, city.roads, ctx, at, ground);
  const heads = outsideZones(signalHeads(city.props.signals, plans, ground, at), zones, (s) => s.base);
  const sites = buildCrossingSites(plans, ctx, at, (x, y, tx, ty) => crossingPhase(heads, x, y, tx, ty));

  it('走线：每个点都不在地面车行道、楼、敏感区里，离电车轨道 ≥ 2.3 m', { timeout: 60000 }, () => {
    expect(paths.length).toBeGreaterThan(500);
    let n = 0;
    for (const p of paths) {
      if (p.cls === 'bridge') {
        for (let i = 0; i < p.pts.length; i += 3) expect(inZones(zones, p.pts[i]! * 10, p.pts[i + 1]! * 10)).toBe(false);
        continue;
      }
      for (let i = 0; i < p.pts.length; i += 3) {
        const x = p.pts[i]!;
        const y = p.pts[i + 1]!;
        expect(ctx.carriage.hit(x, y, 0)).toBe(false);
        expect(inBuilding(x * 10, y * 10)).toBe(false);
        expect(inZones(zones, x * 10, y * 10)).toBe(false);
        expect(ctx.trams.hit(x, y, TRAM_CLEAR_M - 0.05)).toBe(false);
        n++;
      }
    }
    expect(n).toBeGreaterThan(50000);
  });

  it('密度：核心区大街 0.4–0.6 人/米（单侧），横街 0.15–0.25，天桥 0.3–0.5，核心区外 × 0.3', () => {
    const crowd = new Crowd(paths, sites, ctx);
    const by = new Map<string, { m: number; n: number }>();
    const count = new Map<number, number>();
    for (const w of crowd.walkers) count.set(w.path, (count.get(w.path) ?? 0) + 1);
    for (const p of paths) {
      const k = `${p.cls}${p.core ? '+core' : ''}`;
      const o = by.get(k) ?? { m: 0, n: 0 };
      o.m += p.side;
      o.n += count.get(p.id) ?? 0;
      by.set(k, o);
    }
    const d = (k: string) => by.get(k)!.n / by.get(k)!.m;
    expect(d('main+core')).toBeGreaterThan(0.4);
    expect(d('main+core')).toBeLessThan(0.6);
    expect(d('side+core')).toBeGreaterThan(0.15);
    expect(d('side+core')).toBeLessThan(0.25);
    expect(d('bridge+core')).toBeGreaterThan(0.3);
    expect(d('bridge+core')).toBeLessThan(0.5);
    expect(d('main')).toBeCloseTo(DENSITY.main * 0.3, 1);
  });

  it('过路的人：踏上车行道只在斑马线 ±2 m 内、只在 [PED_GREEN, PED_FLASH) 内；t ∈ [0, 120] s', { timeout: 60000 }, () => {
    const crowd = new Crowd(paths, sites, ctx);
    expect(sites.filter((s) => s.kerbs).length).toBeGreaterThan(100);
    expect(crowd.crossers.length).toBeGreaterThan(400);
    const o: AgentPose = { x: 0, y: 0, z: 0, hx: 1, hy: 0, walk: 0, phase: 0, scale: 0, seed: 0 };
    let onRoad = 0;
    for (let t = 0; t <= 120; t += 0.25) {
      for (const a of crowd.crossers) {
        if (!crowd.crosserPose(a, t, o)) continue;
        const c = sites[a.site]!;
        const along = (o.x - c.x) * c.tx + (o.y - c.y) * c.ty;
        const across = (o.x - c.x) * -c.ty + (o.y - c.y) * c.tx;
        if (Math.abs(across) < c.hw) {
          onRoad++;
          expect(Math.abs(along)).toBeLessThanOrEqual(CROSSING_HALF_M);
          const f = pedCycle(t, crowd.sitePhase[a.site]!);
          expect(f).toBeGreaterThanOrEqual(PED_GREEN - 1e-6);
          expect(f).toBeLessThan(PED_FLASH);
        } else {
          // 不在车行道上的时候：不在任何别的车行道里（只许在本路车行道上过马路）
          expect(ctx.carriage.hit(o.x, o.y, -0.05, c.plan)).toBe(false);
        }
      }
    }
    expect(onRoad).toBeGreaterThan(1000);
  });

  it('确定性：同一时刻两次 gather 结果相同', () => {
    const a = new Crowd(paths, sites, ctx);
    const b = new Crowd(paths, sites, ctx);
    const pool = () => Array.from({ length: 2000 }, () => ({ x: 0, y: 0, z: 0, hx: 1, hy: 0, walk: 0, phase: 0, scale: 0, seed: 0 }));
    const pa = pool();
    const pb = pool();
    const na = a.gather(224, -168.5, 8, 150, 77.7, pa);
    const nb = b.gather(224, -168.5, 8, 150, 77.7, pb);
    expect(na).toBe(nb);
    expect(na).toBeGreaterThan(200);
    expect(pa.slice(0, na)).toEqual(pb.slice(0, nb));
  });

  it('红线：t ∈ [0, 600] s（0.1 s 步长），有人在车行道上的过路处，任何车身都不压在斑马线上', () => {
    const life = buildStreetLife(city, plans, ground, at, heads, { high: true, core: CORE_RECT_M });
    const lanes = buildLanes(plans);
    const blocked = lanes.map((l) => inZones(zones, l.mid[0] * 10, l.mid[1] * 10));
    for (const l of lanes) l.next = blocked[l.id] ? [] : l.next.filter((n) => !blocked[n]);
    const traffic = new Traffic(lanes, { cap: 900, seed: 20261124, core: CORE_RECT_M });
    traffic.setSignals(
      laneSignalPhases(
        lanes.map((l) => {
          const n = l.pts.length / 3;
          const x = l.pts[(n - 1) * 3]!;
          const z = l.pts[(n - 1) * 3 + 2]!;
          return { x, z, dx: x - l.pts[(n - 2) * 3]!, dz: z - l.pts[(n - 2) * 3 + 2]! };
        }),
        heads,
      ),
    );
    traffic.setCrossings(life.trafficCrossings);
    traffic.setBusStops(busStopLanes(life.stops, lanes));
    life.bindTraffic(traffic);
    const crowd = life.crowd;
    // 过路处斑马线矩形（three xz）
    const rects = life.sites.map((c) => {
      const r = crossingRect(c, 0);
      const out: number[] = [];
      for (let k = 0; k < 4; k++) {
        const p = simToThreeVec(r[k * 2]!, r[k * 2 + 1]!, 0, 1);
        out.push(p[0], p[2]);
      }
      return out;
    });
    const withPeds = life.sites.filter((s) => s.kerbs).map((s) => s.id);
    const pose = { x: 0, y: 0, z: 0, hx: 1, hz: 0 };
    let checks = 0;
    let violations = 0;
    const sep = (a: number[], b: number[]): boolean => {
      // 两个凸四边形的分离轴测试
      for (const poly of [a, b]) {
        for (let k = 0; k < 4; k++) {
          const ex = poly[((k + 1) % 4) * 2]! - poly[k * 2]!;
          const ez = poly[((k + 1) % 4) * 2 + 1]! - poly[k * 2 + 1]!;
          const nx = -ez;
          const nz = ex;
          let a0 = Infinity;
          let a1 = -Infinity;
          let b0 = Infinity;
          let b1 = -Infinity;
          for (let j = 0; j < 4; j++) {
            const pa = a[j * 2]! * nx + a[j * 2 + 1]! * nz;
            const pb = b[j * 2]! * nx + b[j * 2 + 1]! * nz;
            a0 = Math.min(a0, pa);
            a1 = Math.max(a1, pa);
            b0 = Math.min(b0, pb);
            b1 = Math.max(b1, pb);
          }
          if (a1 < b0 || b1 < a0) return true;
        }
      }
      return false;
    };
    for (let step = 0; step < 6000; step++) {
      traffic.step(SIM_DT);
      const t = traffic.simTime;
      const active = withPeds.filter((id) => crowd.onCarriageway(id, t) > 0);
      if (active.length === 0) continue;
      for (let i = 0; i < traffic.n; i++) {
        const lane = lanes[traffic.lane[i]!]!;
        lanePose(lane, traffic.s[i]!, pose);
        const k = traffic.offLeft[i]! / 10;
        const cx = pose.x + traffic.off[i * 3]! * k;
        const cz = pose.z + traffic.off[i * 3 + 2]! * k;
        const hl = traffic.len[i]! / 2;
        const hw = isBusKind(traffic.kind[i]!) ? 1.25 : 0.92;
        for (const id of active) {
          const r = rects[id]!;
          const dx = cx - r[0]!;
          const dz = cz - r[1]!;
          if (dx * dx + dz * dz > 40 * 40) continue;
          checks++;
          const sx = -pose.hz;
          const sz = pose.hx;
          const car = [
            cx + pose.hx * hl + sx * hw,
            cz + pose.hz * hl + sz * hw,
            cx + pose.hx * hl - sx * hw,
            cz + pose.hz * hl - sz * hw,
            cx - pose.hx * hl - sx * hw,
            cz - pose.hz * hl - sz * hw,
            cx - pose.hx * hl + sx * hw,
            cz - pose.hz * hl + sz * hw,
          ];
          if (!sep(car, r)) violations++;
        }
      }
    }
    expect(checks).toBeGreaterThan(1000);
    expect(violations).toBe(0);
  }, 120000);
});

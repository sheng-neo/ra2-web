import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, type CityFile } from '@central/data';
import { threeToSim } from '../../coords';
import { reliefGrid, reliefHeight } from '../../data/terrain';
import { footprintTest, renderedTerrain } from '../road-corridor';
import { planRoads, projectOnto } from '../roads';
import { CROSSING_HALF_M, buildCrossingSites, footOk, walkContext } from '../people/walkways';
import { CORE_RECT_M } from '.';
import {
  BUS_DEDUPE_M,
  RAIL_CROSSING_CLEAR_M,
  RAIL_INSET_M,
  bollardSpots,
  busStops,
  busWaitingAreas,
  pedPoleSpots,
  railPanels,
  streetBits,
} from './kerbside';
import { crossingPhase, signalHeads } from './signals';
import { buildStatueSquare, ZONE_CLEAR_M } from './statue-square';
import { RenderedSurface, dropZoneLamps, inZones, outsideZones } from './surface';
import { pointInRing } from '../../geom/ring';

describe('真实数据：路边设施（栏杆、护柱、行人灯、巴士站、杂项、皇后像广场）', () => {
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
  const heads = outsideZones(signalHeads(city.props.signals, plans, ground, at), zones, (s) => s.base);
  const sites = buildCrossingSites(plans, ctx, at, (x, y, tx, ty) => crossingPhase(heads, x, y, tx, ty));
  const stops = busStops(city.props.busStops, plans, ctx, at);
  const rails = railPanels(plans, ctx, sites, stops, at);
  const inZ = (x: number, y: number) => inZones(zones, x * 10, y * 10);

  it('巴士站：6 m 内去重、候车亭四角都在人行道上（不进车行道、楼、敏感区），候车区 3–8 人（只有站牌的站 1–3 人）', () => {
    expect(stops.length).toBeGreaterThan(30);
    // R3：放不下候车亭的站只立站牌（length 0），只是少数
    expect(stops.filter((b) => b.length === 0).length).toBeLessThanOrEqual(5);
    for (let i = 0; i < stops.length; i++) {
      for (let j = i + 1; j < stops.length; j++) expect(Math.hypot(stops[i]!.x - stops[j]!.x, stops[i]!.y - stops[j]!.y)).toBeGreaterThan(BUS_DEDUPE_M - 1e-6);
      const b = stops[i]!;
      if (b.length > 0) expect(b.length).toBeGreaterThanOrEqual(5.7 - 1e-6);
      expect(b.length).toBeLessThanOrEqual(12);
      for (const a of [-0.5, 0.5])
        for (const c of [-0.5, 0.5]) {
          const x = b.x + b.tx * a * b.length + b.nx * c;
          const y = b.y + b.ty * a * b.length + b.ny * c;
          expect(footOk(ctx, x, y, b.plan, 0.15)).toBe(true);
        }
    }
    busWaitingAreas(stops, plans).forEach((w, i) => {
      expect(w.count).toBeGreaterThanOrEqual(stops[i]!.length > 0 ? 3 : 1);
      expect(w.count).toBeLessThanOrEqual(8);
    });
  });

  it('栏杆：路缘外 0.4 m、片长 ≤ 2.4 m；斑马线两侧各让 2.5 m、巴士站上落客段不装；不进敏感区、楼', () => {
    expect(rails.length).toBeGreaterThan(2000);
    for (const r of rails) {
      expect(Math.hypot(r.bx - r.ax, r.by - r.ay)).toBeLessThanOrEqual(2.4 + 1e-6);
      for (const [x, y] of [
        [r.ax, r.ay],
        [r.bx, r.by],
      ] as const) {
        expect(inZ(x, y)).toBe(false);
        expect(inBuilding(x * 10, y * 10)).toBe(false);
      }
    }
    // 弯道内侧的路缘点投影回中线会比造的时候短一点：留 0.7 m 余量
    const clear = CROSSING_HALF_M + RAIL_CROSSING_CLEAR_M - 0.7;
    for (const c of sites) {
      const nx = -c.ty;
      const ny = c.tx;
      for (const r of rails) {
        if (r.plan !== c.plan) continue;
        for (const [x, y] of [
          [r.ax, r.ay],
          [r.bx, r.by],
        ] as const) {
          const across = (x - c.x) * nx + (y - c.y) * ny;
          // 沿路距离按道路中线量（弯道上不能用切线投影）
          const p = plans[c.plan]!;
          const hit = projectOnto(p.pts, p.along, x * 10, y * 10);
          if (Math.abs(across) < c.hw + RAIL_INSET_M + 1) expect(Math.abs(hit.s / 10 - c.s)).toBeGreaterThanOrEqual(clear);
        }
      }
    }
    for (const b of stops) {
      for (const r of rails) {
        if (r.plan !== b.plan) continue;
        const mx = (r.ax + r.bx) / 2;
        const my = (r.ay + r.by) / 2;
        const along = (mx - b.x) * b.tx + (my - b.y) * b.ty;
        const across = (mx - b.x) * b.nx + (my - b.y) * b.ny;
        if (Math.abs(across) < 3) expect(Math.abs(along)).toBeGreaterThan(b.length / 2 + 1.5);
      }
    }
  });

  it('护柱、行人灯杆、垃圾桶 / 消防栓：都在人行道上、不进敏感区；行人灯朝对面路缘、带该过路处相位', () => {
    const bol = bollardSpots(sites, ctx, at);
    expect(bol.length).toBeGreaterThan(300);
    for (const b of bol) {
      expect(inZ(b.x, b.y)).toBe(false);
      expect(ctx.carriage.hit(b.x, b.y, 0)).toBe(false);
    }
    const poles = heads.map((s) => {
      const [x, y] = threeToSim(s.base[0], s.base[1], s.base[2]);
      return [x / 10, y / 10] as const;
    });
    const phases = sites.map((c, i) => (Number.isNaN(c.phase) ? i / sites.length : c.phase));
    const pp = pedPoleSpots(sites, phases, poles, ctx, at);
    expect(pp.length).toBeGreaterThan(80);
    for (const p of pp) {
      expect(inZ(p.x, p.y)).toBe(false);
      expect(ctx.carriage.hit(p.x, p.y, 0)).toBe(false);
      expect(Math.hypot(p.dx, p.dy)).toBeCloseTo(1, 5);
      expect(phases).toContain(p.aux);
    }
    const bits = streetBits(plans, ctx, at);
    expect(bits.length).toBeGreaterThan(500);
    for (const b of bits) expect(inZ(b.x, b.y)).toBe(false);
  });

  it('皇后像广场：水池、喷泉墙、灯柱、有盖走廊都放得下；所有顶点离敏感区（旧法院大楼）≥ 2 m、不进车行道', () => {
    const sq = buildStatueSquare(ctx, at, 0, true);
    expect(sq.placed).toBeGreaterThan(25);
    expect(sq.lights.length).toBeGreaterThan(20);
    expect(sq.paths.length).toBeGreaterThanOrEqual(2);
    const pos = sq.mesh!.geometry.getAttribute('position');
    let near = 0;
    for (let i = 0; i < pos.count; i++) {
      const [x, y] = threeToSim(pos.getX(i), pos.getY(i), pos.getZ(i));
      for (const [dx, dy] of [
        [0, 0],
        [ZONE_CLEAR_M - 0.1, 0],
        [-(ZONE_CLEAR_M - 0.1), 0],
        [0, ZONE_CLEAR_M - 0.1],
        [0, -(ZONE_CLEAR_M - 0.1)],
      ] as const) {
        if (zones.some((z) => pointInRing(z.area, x + dx * 10, y + dy * 10))) near++;
      }
      expect(ctx.carriage.hit(x / 10, y / 10, 0)).toBe(false);
    }
    expect(near).toBe(0);
    for (const l of sq.lights) {
      const [x, y] = threeToSim(l.p[0], l.p[1], l.p[2]);
      expect(inZones(zones, x, y)).toBe(false);
    }
  });
});

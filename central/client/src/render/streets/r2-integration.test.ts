/**
 * R2 整合测试（真实数据）：三个细节包（LOD2 楼宇分层、电车、街头生活）合在一起之后互不打架。
 * - 行人走线、路边设施（栏杆、护柱、行人灯杆、杂项、候车亭）离实际电车路线（TRAMS 拉开后的行车线）够远、不压站岛；
 * - 架空线杆不与上述设施、交通灯杆、路灯杆重叠，不立在站岛上、候车亭里；
 * - 架空线杆、楼面锚不在行人天桥 / 高架路底下，跨线不穿过桥身；
 * - 楼面锚挂在 LoD2 分层后仍然存在的墙上；电车站岛上有候车的人（统一用行人系统）；
 * - 招牌只挂在 LoD2 底座墙的高度范围内。
 * - 修复轮：路灯杆、交通灯杆离电车行车线 ≥ 车身半宽 + 0.9 m；600 s 内车流车身与电车车身（刚体盒）不相交。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, type CityFile } from '@central/data';
import { simToThreeVec, threeToSim } from '../../coords';
import { flatGround, reliefGrid, reliefHeight } from '../../data/terrain';
import { pointInFlat, pointInRing } from '../../geom/ring';
import { chunksFromPlans, frontageOf, planBuildings } from '../buildings';
import { footprintTest, renderedTerrain } from '../road-corridor';
import { planRoads } from '../roads';
import { RoadIndex, facesStreet, placeSigns } from '../signs/placement';
import { SegGrid, crossingRect } from '../people/walkways';
import { CORE_RECT_M, buildTraffic, keepOffTramRoutes } from '.';
import { buildLanes, lanePose } from './lanes';
import { SIM_DT, isBusKind } from './traffic';
import { POLE_CLEAR_M, tramLaneConflicts, tramRouteProximity } from './tram-traffic';
import { TRAM_HW_M, TRAM_LEN_M } from './tram/body';
import { streetLamps } from './lamps';
import { signalHeads } from './signals';
import { buildStreetLife } from './streetlife';
import { RenderedSurface, dropZoneLamps, inZones, outsideZones } from './surface';
import { footbridgeChunks } from './footbridges';
import { tramContext } from './tram/context';
import { crossesBridge } from './tram/overhead';
import { ISLAND_H_M, inIsland } from './tram/stops';
import { TramSystem, tramStopIslands } from './trams';

describe('R2 整合：电车 × 街头生活 × LoD2（真实数据）', () => {
  const read = (n: string) => readFileSync(new URL(`../../../public/city/${n}`, import.meta.url));
  const city = JSON.parse(read('central.json').toString('utf8')) as CityFile;
  const relief = reliefGrid(decodeTerrain(read('terrain.bin')));
  const ground = reliefHeight(relief);
  const plans = planRoads(city.roads, ground, city.props);
  const zones = city.zones.sensitive;
  dropZoneLamps(plans, zones);
  const surface = new RenderedSurface(plans, renderedTerrain(relief, plans, city.buildings).fn);
  const at = (x: number, y: number) => surface.heightAt(x, y);
  const lamps = outsideZones(streetLamps(plans), zones, (l) => l.pole, (l) => l.head);
  const heads = outsideZones(signalHeads(city.props.signals, plans, ground, at), zones, (s) => s.base);
  // 与 streets/index.ts 同一顺序与参数
  const trams = new TramSystem({ city, plans, ground, surface: at, lamps, high: true });
  const islands = tramStopIslands();
  const poles = trams.overhead.supports.filter((s) => s.kind === 'pole');
  const life = buildStreetLife(city, plans, ground, at, heads, { high: true, core: CORE_RECT_M, tram: { islands, poles: poles.map((s) => [s.x, s.y] as const) } });
  const route = new SegGrid(20);
  for (const r of trams.routes) for (let i = 1; i < r.x.length; i++) route.add(r.x[i - 1]!, r.y[i - 1]!, r.x[i]!, r.y[i]!, 0, r.id);
  const nearRoute = (x: number, y: number, d: number) => route.hit(x, y, d);

  it('行人走线（地面）离实际电车行车线 ≥ 1.9 m', { timeout: 60000 }, () => {
    let n = 0;
    for (const p of life.paths) {
      if (p.cls === 'bridge') continue;
      for (let i = 0; i < p.pts.length; i += 3) {
        expect(nearRoute(p.pts[i]!, p.pts[i + 1]!, 1.9), `${p.pts[i]}, ${p.pts[i + 1]}`).toBe(false);
        n++;
      }
    }
    expect(n).toBeGreaterThan(50000);
  });

  it('路边设施与候车亭：离行车线 ≥ 1.8 m、不压站岛；栏杆在站岛处断开', { timeout: 60000 }, () => {
    const { rails, spots } = life.kerb;
    expect(rails.length).toBeGreaterThan(3000);
    for (const r of rails)
      for (let k = 0; k <= 4; k++) {
        const x = r.ax + ((r.bx - r.ax) * k) / 4;
        const y = r.ay + ((r.by - r.ay) * k) / 4;
        expect(nearRoute(x, y, 1.8)).toBe(false);
        expect(inIsland(islands, x, y, 0.5)).toBe(false);
      }
    for (const s of spots) {
      expect(nearRoute(s.x, s.y, 1.8)).toBe(false);
      expect(inIsland(islands, s.x, s.y, 0.3)).toBe(false);
    }
    expect(life.stops.length).toBeGreaterThanOrEqual(55);
    for (const b of life.stops)
      for (const a of [-0.5, 0, 0.5]) {
        const x = b.x + b.tx * a * b.length;
        const y = b.y + b.ty * a * b.length;
        expect(nearRoute(x, y, 1.8)).toBe(false);
        expect(inIsland(islands, x, y, 0.3)).toBe(false);
      }
  });

  it('架空线杆：不立在站岛、候车亭里，不与栏杆、护柱、行人灯杆、交通灯杆、路灯杆重叠', { timeout: 60000 }, () => {
    expect(poles.length).toBeGreaterThan(80);
    const others: [number, number][] = [...life.kerb.spots.map((s) => [s.x, s.y] as [number, number])];
    for (const h of heads) {
      const [x, y] = threeToSim(h.base[0], h.base[1], h.base[2]);
      others.push([x / 10, y / 10]);
    }
    for (const l of lamps) {
      const [x, y] = threeToSim(l.pole[0], l.pole[1], l.pole[2]);
      others.push([x / 10, y / 10]);
    }
    const railGrid = new SegGrid(20);
    for (const r of life.kerb.rails) railGrid.add(r.ax, r.ay, r.bx, r.by, 0, 0);
    const shelters = new SegGrid(20);
    for (const b of life.stops) shelters.add(b.x - (b.tx * b.length) / 2, b.y - (b.ty * b.length) / 2, b.x + (b.tx * b.length) / 2, b.y + (b.ty * b.length) / 2, 0.9, 0);
    for (const p of poles) {
      expect(inIsland(islands, p.x, p.y, 0.4), `杆 ${p.x}, ${p.y}`).toBe(false);
      expect(railGrid.hit(p.x, p.y, 0.25)).toBe(false);
      expect(shelters.hit(p.x, p.y, 0.1)).toBe(false);
      for (const [x, y] of others) expect(Math.hypot(x - p.x, y - p.y), `杆 ${p.x}, ${p.y}`).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('架空线杆、楼面锚不在天桥 / 高架路底下（桥底低于杆顶）；跨线不穿过桥身', { timeout: 60000 }, () => {
    const o = tramContext(city, plans, ground, at).overhead;
    for (const s of trams.overhead.supports) {
      const so = o.soffit(s.x, s.y);
      if (so === null) continue;
      expect(so, `${s.kind} ${s.x}, ${s.y}`).toBeGreaterThan(s.kind === 'pole' ? s.z + 9.2 : s.z + 0.5);
    }
    for (const sp of trams.overhead.spans) expect(crossesBridge(sp, o)).toBe(false);
  });

  it('楼面锚：LoD2 分层后锚点高度上仍有墙', { timeout: 60000 }, () => {
    const inBuilding = footprintTest(city.buildings);
    let checked = 0;
    for (const s of trams.overhead.supports) {
      if (s.kind !== 'anchor') continue;
      const ix = (s.x - s.dx * 0.5) * 10;
      const iy = (s.y - s.dy * 0.5) * 10;
      if (!inBuilding(ix, iy)) continue;
      const b = city.buildings.find((b) => pointInRing(b.footprint, ix, iy));
      if (!b?.parts) continue;
      let wallTop = b.parts[0]!.top / 10;
      for (const p of b.parts) if (p.ring && pointInFlat(p.ring, ix, iy)) wallTop = Math.max(wallTop, p.top / 10);
      expect(wallTop, b.id).toBeGreaterThanOrEqual(s.z + 0.3);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('站岛上的候车的人：每个站岛 2–5 人，站在台面上、遮篷下', { timeout: 60000 }, () => {
    expect(islands.length).toBeGreaterThanOrEqual(8);
    for (const s of islands) {
      const on = life.crowd.waiters.filter((w) => inIsland([s], w.x, w.y, 0));
      expect(on.length, s.id).toBeGreaterThanOrEqual(2);
      expect(on.length, s.id).toBeLessThanOrEqual(5);
      for (const w of on) {
        expect(w.z).toBeCloseTo(s.z + ISLAND_H_M, 5);
        const u = (w.x - s.centre[0]) * s.axis[0] + (w.y - s.centre[1]) * s.axis[1];
        expect(Math.abs(u)).toBeLessThanOrEqual(7);
      }
    }
  });

  it('招牌只挂在 LoD2 底座墙的高度范围内（退台以上不伸出去）', { timeout: 60000 }, () => {
    const { plans: bp, cutsOf } = planBuildings(city.buildings, flatGround, city.zones.sensitive);
    const roads = new RoadIndex(city.roads);
    let n = 0;
    chunksFromPlans(bp, cutsOf, {
      rooftops: false,
      onSpan: (pl, s) => {
        const f = frontageOf(pl, s);
        if (!f || !facesStreet(f, roads)) return;
        for (const q of placeSigns(f)) {
          for (const c of q.corners) expect(c[2]).toBeLessThanOrEqual(s.z1 / 10 + 0.01);
          n++;
        }
      },
    });
    expect(n).toBeGreaterThan(15000);
  });

  it('路灯杆、交通灯杆不立在电车路轨上：离实际行车线 ≥ 车身半宽 + 0.9 m（0 支）', { timeout: 60000 }, () => {
    const near = tramRouteProximity(trams.routes);
    const on = (p: readonly number[]) => {
      const [x, y] = threeToSim(p[0]!, p[1]!, p[2]!);
      return near(x / 10, y / 10, POLE_CLEAR_M);
    };
    // 过滤前确实有压在路轨上的（不然这个测试没意义）
    expect(lamps.filter((l) => on(l.pole)).length).toBeGreaterThan(10);
    expect(heads.filter((h) => on(h.base)).length).toBeGreaterThan(5);
    const shownLamps = keepOffTramRoutes(lamps, trams, (l) => l.pole);
    const shownHeads = keepOffTramRoutes(heads, trams, (h) => h.base);
    expect(shownLamps.filter((l) => on(l.pole)).length).toBe(0);
    expect(shownHeads.filter((h) => on(h.base)).length).toBe(0);
    expect(POLE_CLEAR_M).toBeGreaterThanOrEqual(2.05);
  });

  it('600 s 内机动车车身不与电车车身相交（车让电车：共用车道不开车、穿轨区按电车时刻预测）', { timeout: 240000 }, () => {
    const lanes = buildLanes(plans);
    const conf = tramLaneConflicts(lanes, trams.routes);
    expect(conf.shared.size).toBeGreaterThan(10);
    expect(conf.zones.length).toBeGreaterThan(40);
    const traffic = buildTraffic(lanes, plans, zones, heads, life, trams, 900);
    // 车身 / 电车车身：模拟坐标的有向矩形（与渲染同一位姿：lanePose + 换道错位）
    const obb = (cx: number, cy: number, hx: number, hy: number, hl: number, hw: number) => {
      const sx = -hy;
      const sy = hx;
      return [cx + hx * hl + sx * hw, cy + hy * hl + sy * hw, cx - hx * hl + sx * hw, cy - hy * hl + sy * hw, cx - hx * hl - sx * hw, cy - hy * hl - sy * hw, cx + hx * hl - sx * hw, cy + hy * hl - sy * hw];
    };
    const separated = (a: number[], b: number[]) => {
      for (const p of [a, b])
        for (let k = 0; k < 4; k++) {
          const nx = -(p[((k + 1) % 4) * 2 + 1]! - p[k * 2 + 1]!);
          const ny = p[((k + 1) % 4) * 2]! - p[k * 2]!;
          let a0 = Infinity;
          let a1 = -Infinity;
          let b0 = Infinity;
          let b1 = -Infinity;
          for (let j = 0; j < 4; j++) {
            const pa = a[j * 2]! * nx + a[j * 2 + 1]! * ny;
            const pb = b[j * 2]! * nx + b[j * 2 + 1]! * ny;
            a0 = Math.min(a0, pa);
            a1 = Math.max(a1, pa);
            b0 = Math.min(b0, pb);
            b1 = Math.max(b1, pb);
          }
          if (a1 < b0 || b1 < a0) return true;
        }
      return false;
    };
    const pose = { x: 0, y: 0, z: 0, hx: 1, hz: 0 };
    const hits: string[] = [];
    let checked = 0;
    // 同时复查行人红线（让电车的规则不能把车逼上有人的斑马线）：有人在车行道上的过路处，车身不压斑马线
    const rects = life.sites.map((c) => {
      const r = crossingRect(c, 0);
      const out: number[] = [];
      for (let k = 0; k < 4; k++) {
        const p = simToThreeVec(r[k * 2]!, r[k * 2 + 1]!, 0, 1);
        out.push(p[0], p[2]);
      }
      return out;
    });
    const withPeds = life.sites.filter((c) => c.kerbs).map((c) => c.id);
    let pedChecks = 0;
    let pedViolations = 0;
    for (let step = 1; step <= 6000; step++) {
      traffic.step(SIM_DT);
      const active = withPeds.filter((id) => life.crowd.onCarriageway(id, traffic.simTime) > 0);
      if (active.length > 0)
        for (let i = 0; i < traffic.n; i++) {
          lanePose(lanes[traffic.lane[i]!]!, traffic.s[i]!, pose);
          const k = traffic.offLeft[i]! / 10;
          const cx = pose.x + traffic.off[i * 3]! * k;
          const cz = pose.z + traffic.off[i * 3 + 2]! * k;
          for (const id of active) {
            const r = rects[id]!;
            if ((cx - r[0]!) ** 2 + (cz - r[1]!) ** 2 > 1600) continue;
            pedChecks++;
            // three xz 当平面坐标用（只看相交，手性无所谓）
            const car = obb(cx, cz, pose.hx, pose.hz, traffic.len[i]! / 2, isBusKind(traffic.kind[i]!) ? 1.25 : 0.92);
            if (!separated(car, r)) pedViolations++;
          }
        }
      if (step % 5) continue;
      const cars = trams.debugCars(traffic.simTime);
      const boxes = cars.map((c) => obb(c.x, c.y, Math.cos(c.heading), Math.sin(c.heading), TRAM_LEN_M / 2, TRAM_HW_M));
      for (let i = 0; i < traffic.n; i++) {
        lanePose(lanes[traffic.lane[i]!]!, traffic.s[i]!, pose);
        const k = traffic.offLeft[i]! / 10;
        const [x, y] = threeToSim(pose.x + traffic.off[i * 3]! * k, 0, pose.z + traffic.off[i * 3 + 2]! * k);
        const [hx, hy] = threeToSim(pose.hx, 0, pose.hz);
        const sx = x / 10;
        const sy = y / 10;
        const hl = Math.hypot(hx, hy) || 1;
        let vb: number[] | null = null;
        for (let j = 0; j < cars.length; j++) {
          const c = cars[j]!;
          if (Math.abs(c.x - sx) > 15 || Math.abs(c.y - sy) > 15) continue;
          vb ??= obb(sx, sy, hx / hl, hy / hl, traffic.len[i]! / 2, isBusKind(traffic.kind[i]!) ? 1.25 : 0.9);
          checked++;
          if (!separated(vb, boxes[j]!) && hits.length < 10) hits.push(`t=${traffic.simTime.toFixed(1)} 车 ${i} 电车 ${j} @ ${sx.toFixed(1)}, ${sy.toFixed(1)}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
    expect(hits).toEqual([]);
    // 最后一道保险（相交前把车挪走）只是兜底：600 s 内全城最多触发几次
    expect(traffic.guardRespawns).toBeLessThanOrEqual(4);
    expect(pedChecks).toBeGreaterThan(1000);
    expect(pedViolations).toBe(0);
  });

  it('行人天桥：敏感区内不画（PLAN §1 只做背景）——没有一个顶点落在区内', { timeout: 60000 }, () => {
    const verts = (chunks: ReturnType<typeof footbridgeChunks>) => {
      let inside = 0;
      let total = 0;
      for (const b of chunks.values())
        for (let i = 0; i < b.pos.length; i += 3) {
          const [x, y] = threeToSim(b.pos[i]!, b.pos[i + 1]!, b.pos[i + 2]!);
          total++;
          if (inZones(zones, x, y)) inside++;
        }
      return { inside, total };
    };
    const over = (x: number, y: number) => life.overRoad(x, y);
    const before = verts(footbridgeChunks(city.roads, ground, over));
    expect(before.inside).toBeGreaterThan(0);
    const after = verts(footbridgeChunks(city.roads, ground, over, (x, y) => inZones(zones, x, y)));
    expect(after.inside).toBe(0);
    expect(after.total).toBeGreaterThan(before.total * 0.85);
  });
});

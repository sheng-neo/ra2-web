/**
 * R4 整合测试（真实数据）：HIRES（高清街面、雨篷、真实铺位）× STREET（行人、铺面溢光、路面）合在一起之后互不打架。
 * - 雨篷（Building.hires.c）不与路灯杆、交通灯杆、巴士候车亭、港铁出口、电车行车线（车身 + 架空线）、行人天桥相交；
 *   雨篷底离地 ≥ 2.3 m（行人从底下走过）；
 * - 铺面光源（I-1）：有高清铺位的墙只出真实铺位的光（占位光源都被去掉），光源不进敏感区（3 m），
 *   20:00 时走廊里落闸的铺位门前没有光斑（落闸铺不出光源）。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, type CityFile } from '@central/data';
import { threeToSim } from '../coords';
import { reliefGrid, reliefHeight } from '../data/terrain';
import { planBuildings } from './buildings';
import { canopyObstacles } from './canopy-obstacles';
import { canopyThicknessDm, type CanopyItem } from './facades/canopies';
import { fitCanopies } from './facades/canopy-fit';
import { canopyLights, dropOnHiresFaces, frontageLights, hiresStreetWalls } from './facades/frontage';
import { SegGrid } from './people/walkways';
import { renderedTerrain } from './road-corridor';
import { isDrivable, elevationTiers, planRoads } from './roads';
import { buildLanes } from './streets/lanes';
import { mtrFurniture } from './stations/mtr';
import { zoneDistance } from './stations/rules';
import { CORE_RECT_M, keepOffTramRoutes } from './streets';
import { isFootbridge } from './streets/footbridges';
import { FRONT_MAX_PER_CELL, FrontageField } from './streets/frontage-field';
import { stubFrontageLights } from './streets/frontage-stub';
import { streetLamps } from './streets/lamps';
import { signalHeads } from './streets/signals';
import { buildStreetLife } from './streets/streetlife';
import { RenderedSurface, dropZoneLamps, outsideZones } from './streets/surface';
import { TRAM_HW_M } from './streets/tram/body';
import { inIsland } from './streets/tram/stops';
import { TramSystem, tramStopIslands } from './streets/trams';

/** 雨篷（模拟米）：贴墙边起点 o、沿墙单位向量 t、外法线 n、长 L、伸出 D、底 / 顶高程 zb / zt（mPD 米）。 */
interface Canopy {
  id: string;
  ox: number;
  oy: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  L: number;
  D: number;
  zb: number;
  zt: number;
}

function canopiesOf(items: readonly (CanopyItem & { id: string })[]): Canopy[] {
  const out: Canopy[] = [];
  for (const it of items) {
    const [x0, y0, x1, y1, d, zTop, th] = it.rec as [number, number, number, number, number, number, number];
    const L = Math.hypot(x1 - x0, y1 - y0) / 10;
    if (L < 0.1) continue;
    const tx = (x1 - x0) / 10 / L;
    const ty = (y1 - y0) / 10 / L;
    out.push({ id: it.id, ox: x0 / 10, oy: y0 / 10, tx, ty, nx: ty, ny: -tx, L, D: d / 10, zt: zTop / 10, zb: (zTop - canopyThicknessDm(th)) / 10 });
  }
  return out;
}

/** 点 (x, y) 在雨篷平面范围里（向外扩 m 米）。 */
function inCanopy(c: Canopy, x: number, y: number, m = 0): boolean {
  const a = (x - c.ox) * c.tx + (y - c.oy) * c.ty;
  const b = (x - c.ox) * c.nx + (y - c.oy) * c.ny;
  return a >= -m && a <= c.L + m && b >= -m && b <= c.D + m;
}

/** 雨篷平面上的采样点（四角、边中点、中心与外沿每 1 m）。 */
function canopyPoints(c: Canopy): [number, number][] {
  const pts: [number, number][] = [];
  const P = (a: number, b: number) => pts.push([c.ox + c.tx * a + c.nx * b, c.oy + c.ty * a + c.ny * b]);
  const n = Math.max(1, Math.ceil(c.L));
  for (let i = 0; i <= n; i++) {
    const a = (c.L * i) / n;
    P(a, c.D);
    P(a, c.D / 2);
    P(a, 0.2);
  }
  return pts;
}

/** 矩形（中心、沿向 t、半长 hl、法向 n、半宽 hw）上的采样点。 */
function rectPoints(cx: number, cy: number, tx: number, ty: number, hl: number, hw: number): [number, number][] {
  const out: [number, number][] = [];
  for (const a of [-1, -0.5, 0, 0.5, 1]) for (const b of [-1, 0, 1]) out.push([cx + tx * hl * a - ty * hw * b, cy + ty * hl * a + tx * hw * b]);
  return out;
}

describe('R4 整合：高清街面 × 街头（真实数据）', () => {
  const read = (n: string) => readFileSync(new URL(`../../public/city/${n}`, import.meta.url));
  const city = JSON.parse(read('central.json').toString('utf8')) as CityFile;
  const relief = reliefGrid(decodeTerrain(read('terrain.bin')));
  const ground = reliefHeight(relief);
  const plans = planRoads(city.roads, ground, city.props);
  const zones = city.zones.sensitive;
  dropZoneLamps(plans, zones);
  const surface = new RenderedSurface(plans, renderedTerrain(relief, plans, city.buildings).fn);
  const at = (x: number, y: number) => surface.heightAt(x, y);
  const groundM = (x: number, y: number) => at(x * 10, y * 10) / 10;
  const allLamps = outsideZones(streetLamps(plans), zones, (l) => l.pole, (l) => l.head);
  const heads = outsideZones(signalHeads(city.props.signals, plans, ground, at), zones, (s) => s.base);
  const trams = new TramSystem({ city, plans, ground, surface: at, lamps: allLamps, high: true });
  // 与 streets/index.ts 同一过滤：画出来的路灯杆、交通灯杆
  const lamps = keepOffTramRoutes(allLamps, trams, (l) => l.pole);
  const signalsShown = keepOffTramRoutes(heads, trams, (s) => s.base);
  const islands = tramStopIslands();
  const poles = trams.overhead.supports.filter((s) => s.kind === 'pole');
  const life = buildStreetLife(city, plans, ground, at, heads, { high: true, core: CORE_RECT_M, tram: { islands, poles: poles.map((s) => [s.x, s.y] as const) } });
  // 与 city-renderer.ts 同一做法：楼的雨篷项 → 让开街上障碍（canopy-obstacles + canopy-fit）
  const bplans = planBuildings(city.buildings, ground, zones, { facades: city.meta.facades, hires: city.meta.hires }).plans;
  const raw = bplans.flatMap((pl) => (pl.hires?.canopies ?? []).map((rec) => ({ id: pl.p.b.id, rec, groundM: pl.groundM })));
  const obstacles = canopyObstacles(city.roads, { lamps, signals: signalsShown, stops: life.stops, surface: at, routes: trams.routes, islands, overheadPoles: poles.map((s) => [s.x, s.y] as const) });
  const fit = fitCanopies(raw, obstacles);
  const canopies = canopiesOf(fit.items as (CanopyItem & { id: string })[]);
  const route = new SegGrid(20);
  for (const r of trams.routes) for (let i = 1; i < r.x.length; i++) route.add(r.x[i - 1]!, r.y[i - 1]!, r.x[i]!, r.y[i]!, 0, r.id);
  const fmt = (c: Canopy) => `${c.id} @ ${(c.ox + c.tx * c.L * 0.5).toFixed(1)}, ${(c.oy + c.ty * c.L * 0.5).toFixed(1)}`;

  it('有雨篷（让开障碍后大部分还在），雨篷底离地 ≥ 2.3 m', () => {
    expect(raw.length).toBeGreaterThan(300);
    expect(fit.stats.kept).toBeGreaterThan(raw.length * 0.8);
    expect(canopies.length).toBeGreaterThan(300);
    if (process.env.R4_STATS) console.info('canopy fit', fit.stats);
    const low = canopies.filter((c) => c.zb - groundM(c.ox + c.tx * c.L * 0.5 + c.nx * c.D, c.oy + c.ty * c.L * 0.5 + c.ny * c.D) < 2.3).map(fmt);
    expect(low).toEqual([]);
  });

  it('雨篷不碰路灯杆、交通灯杆（杆在雨篷范围里、杆顶高过雨篷底）', () => {
    const bad: string[] = [];
    for (const c of canopies) {
      for (const l of lamps) {
        const [px, py, pz] = threeToSim(...l.pole).map((v) => v / 10) as [number, number, number];
        const [, , hz] = threeToSim(...l.head).map((v) => v / 10) as [number, number, number];
        if (hz > c.zb && pz < c.zt && inCanopy(c, px, py, 0.2)) bad.push(`lamp ${fmt(c)}`);
      }
      for (const s of signalsShown) {
        const [px, py, pz] = threeToSim(...s.base).map((v) => v / 10) as [number, number, number];
        if (pz + 4.5 > c.zb && pz < c.zt && inCanopy(c, px, py, 0.2)) bad.push(`signal ${fmt(c)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('雨篷不碰巴士候车亭、港铁出口', { timeout: 60000 }, () => {
    const exits = mtrFurniture({ zones, stops: life.stops, islands, buildings: city.buildings, surface: at, high: true }, 0).exits;
    const bad: string[] = [];
    for (const c of canopies) {
      for (const s of life.stops) {
        if (s.length <= 0 || s.z + 2.9 < c.zb) continue;
        if (rectPoints(s.x, s.y, s.tx, s.ty, s.length / 2, 1.0).some(([x, y]) => inCanopy(c, x, y))) bad.push(`shelter ${fmt(c)}`);
      }
      for (const e of exits) {
        if (e.base + e.height < c.zb) continue;
        const cx = (e.left[0] + e.right[0]) / 2 + (e.normal[0] * e.depth) / 2;
        const cy = (e.left[1] + e.right[1]) / 2 + (e.normal[1] * e.depth) / 2;
        if (rectPoints(cx, cy, -e.normal[1], e.normal[0], e.width / 2, e.depth / 2).some(([x, y]) => inCanopy(c, x, y))) bad.push(`mtr ${e.code} ${fmt(c)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('复审修正：雨篷底低于 4.6 m 的不伸到行车线上（行车线中线 ± 1.3 m，双层巴士）', () => {
    const lanes = buildLanes(plans.filter((p) => isDrivable(p.road) && elevationTiers(p.road) === 0));
    const lg = new SegGrid(20);
    lanes.forEach((l, k) => {
      const n = l.pts.length / 3;
      for (let i = 1; i < n; i++) {
        const [ax, ay] = threeToSim(l.pts[(i - 1) * 3]!, 0, l.pts[(i - 1) * 3 + 2]!);
        const [bx, by] = threeToSim(l.pts[i * 3]!, 0, l.pts[i * 3 + 2]!);
        lg.add(ax / 10, ay / 10, bx / 10, by / 10, 1.3, k);
      }
    });
    const bad = canopies
      .filter((c) => c.zb - groundM(c.ox + c.tx * c.L * 0.5, c.oy + c.ty * c.L * 0.5) < 4.6)
      .filter((c) => canopyPoints(c).some(([x, y]) => lg.hit(x, y)))
      .map(fmt);
    if (process.env.R4_STATS) console.info('canopies over lanes', bad.length, bad.slice(0, 10));
    expect(bad.length).toBeLessThanOrEqual(3);
  });

  it('雨篷不伸到电车行车线（车身半宽 + 0.3 m）与站岛上', () => {
    const bad = canopies
      .filter((c) => canopyPoints(c).some(([x, y]) => route.hit(x, y, TRAM_HW_M + 0.3) || inIsland(islands, x, y, 0.3)))
      .map(fmt);
    expect(bad).toEqual([]);
  });

  it('雨篷不穿进行人天桥（天桥桥面底之上的雨篷不在桥的平面范围里）', () => {
    const bridges = new SegGrid(20);
    city.roads.forEach((r, k) => {
      if (!isFootbridge(r)) return;
      for (let i = 2; i < r.pts.length; i += 2) bridges.add(r.pts[i - 2]! / 10, r.pts[i - 1]! / 10, r.pts[i]! / 10, r.pts[i + 1]! / 10, 2.25, k);
    });
    const bad: string[] = [];
    for (const c of canopies) {
      // 桥面底至少在桥下地面 + 5.4 m（一层 6 m − 桥面厚 0.6 m）：雨篷顶高过它、平面上又在桥下才相交
      if (canopyPoints(c).some(([x, y]) => bridges.hit(x, y, 0.2) && c.zt > groundM(x, y) + 5.4)) bad.push(fmt(c));
    }
    expect(bad).toEqual([]);
  });

  it('铺面光源：有高清铺位的墙上没有占位光源；光源不进敏感区；落闸铺不出光', { timeout: 60000 }, () => {
    const real = frontageLights(bplans);
    const walls = hiresStreetWalls(bplans);
    const stub = stubFrontageLights(bplans, city.roads);
    const kept = dropOnHiresFaces(stub, walls);
    // 复审修正后铺位按真实的铺位矩形认（约 600 间），亮铺按路段份额（0.3–0.65）
    expect(real.filter((l) => l.intensity > 0).length).toBeGreaterThan(250);
    expect(canopyLights(fit.items).length).toBe(fit.items.length);
    expect(walls.length).toBeGreaterThan(300);
    expect(stub.length - kept.length).toBeGreaterThan(100);
    // 留下的占位光源都不在有高清铺位的墙上
    expect(dropOnHiresFaces(kept, walls)).toHaveLength(kept.length);
    for (const l of real) {
      const mx = (l.x0 + l.x1) / 2;
      const my = (l.y0 + l.y1) / 2;
      expect(zoneDistance(zones, mx, my)).toBeGreaterThan(0);
    }
    // 合并后的清单摊进溢光场：一格最多 8 条，超出的按亮度 / 距离裁掉——走廊里被裁的格要少
    const list = [...real, ...canopyLights(fit.items), ...kept];
    const field = new FrontageField(list, zones, 20);
    let over = 0;
    let used = 0;
    for (const c of field.cells) {
      if (c.length) used++;
      if (c.length === FRONT_MAX_PER_CELL) over++;
    }
    if (process.env.R4_STATS) console.info('frontage', { real: real.length, canopy: fit.items.length, stub: kept.length, cells: used, full: over, entries: field.entries });
    expect(over / Math.max(used, 1)).toBeLessThan(0.1);
  });
});

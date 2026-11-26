/**
 * R3 STATIONS 真实数据测试：车站设施摆在哪里、写什么字（与 streets/index.ts、streetlife.ts 同一套设置）。
 * - 站牌、站岛灯箱与站名牌、港铁出口、码头正面都不进敏感区、离区 ≥ 3 m；
 * - 港铁出口只包 mtr-exits.ts 表里的结构（J3 一定在）；
 * - 电车站岛的站名是同方向最近的真实站（W1 砵典乍街 72W …）；
 * - 灯控过路处（studs）的贴片在有人行道的路缘都有触觉警示砖（人行道 ≥ 1.4 m）；
 * - 全部字牌放进图集，没有退成纯色的。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, type CityFile } from '@central/data';
import { reliefGrid, reliefHeight } from '../../data/terrain';
import { renderedTerrain } from '../road-corridor';
import { planRoads, pointAt, projectOnto } from '../roads';
import { YELLOW_BOXES } from '../materials/road';
import { CORE_RECT_M } from '../streets';
import { streetLamps } from '../streets/lamps';
import { signalHeads } from '../streets/signals';
import { buildStreetLife } from '../streets/streetlife';
import { RenderedSurface, dropZoneLamps, outsideZones } from '../streets/surface';
import { STOP_ANCHORS } from '../streets/tram/stops';
import { TramSystem, tramStopIslands } from '../streets/trams';
import { threeToSim } from '../../coords';
import { stationsAtlas } from './atlas';
import { stationsFurniture } from './index';
import { mtrFurniture } from './mtr';
import { MTR_EXITS } from './mtr-exits';
import { pierFurniture } from './piers';
import { zoneDistance } from './rules';

describe('R3 车站设施（真实数据）', () => {
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
  const trams = new TramSystem({ city, plans, ground, surface: at, lamps, high: true });
  const islands = tramStopIslands();
  const poles = trams.overhead.supports.filter((s) => s.kind === 'pole');
  const life = buildStreetLife(city, plans, ground, at, heads, { high: true, core: CORE_RECT_M, tram: { islands, poles: poles.map((s) => [s.x, s.y] as const) } });
  const st = stationsFurniture({ zones, stops: life.stops, islands, buildings: city.buildings, surface: at, high: true }, 0);

  it('每个巴士站一支站牌、每个站岛一面灯箱墙与站名牌、≥ 3 个港铁出口、3–7 号码头正面', { timeout: 60000 }, () => {
    // 每个巴士站一支，另加单独立的小巴站牌
    expect(st.counts.flags).toBeGreaterThanOrEqual(life.stops.length);
    expect(st.counts.flags).toBeLessThanOrEqual(life.stops.length + 4);
    expect(st.counts.walls).toBe(islands.length);
    expect(st.counts.plates).toBe(islands.length);
    expect(st.counts.mtr).toBeGreaterThanOrEqual(3);
    expect(st.counts.piers).toBe(5);
    expect(st.counts.atlasOverflow).toBe(0);
    expect(stationsAtlas().overflow).toBe(0);
  });

  it('车站设施不进敏感区，离区 ≥ 3 m', () => {
    let worst = Infinity;
    for (const it of st.items) {
      const [x, y] = threeToSim(it.x, it.y, it.z);
      worst = Math.min(worst, zoneDistance(zones, x / 10, y / 10));
    }
    expect(worst).toBeGreaterThanOrEqual(3);
  });

  it('路面标记（灯控过路处、望右、触觉砖）不在敏感区里或区边 3 m 内', () => {
    let n = 0;
    for (const p of plans)
      for (const c of p.crossings) {
        const a = pointAt(p.pts, p.along, c.s);
        const d = zoneDistance(zones, a.x / 10, a.y / 10);
        // 触觉砖、望右字最远伸到路缘外 1.8 m：近敏感区的过路处标 quiet（不画），其余离区 ≥ 3 m；车行道本身不进区
        if (!c.quiet) expect(d).toBeGreaterThanOrEqual(p.hw / 10 + 1.8 + 3);
        expect(d).toBeGreaterThan(p.hw / 10);
        n++;
      }
    expect(n).toBeGreaterThan(100);
    // 灯控（路钉）过路处在核心区占多数
    const core = plans.flatMap((p) => p.crossings.map((c) => ({ p, c }))).filter(({ p, c }) => {
      const a = pointAt(p.pts, p.along, c.s);
      return a.x / 10 > CORE_RECT_M[0] && a.x / 10 < CORE_RECT_M[2] && a.y / 10 > CORE_RECT_M[1] && a.y / 10 < CORE_RECT_M[3];
    });
    expect(core.filter(({ c }) => c.studs).length / core.length).toBeGreaterThan(0.6);
  });

  it('黄色方格路口：都在德辅道中上，不压电车站岛，离敏感区远', () => {
    expect(YELLOW_BOXES.length).toBeGreaterThanOrEqual(4);
    const dv = plans.filter((p) => p.road.name?.en === 'Des Voeux Road Central');
    for (const b of YELLOW_BOXES) {
      const d = Math.min(...dv.map((p) => projectOnto(p.pts, p.along, b.c[0] * 10, b.c[1] * 10).d / 10));
      expect(d).toBeLessThan(8);
      expect(zoneDistance(zones, b.c[0], b.c[1])).toBeGreaterThan(30);
      for (const s of islands) {
        const dx = s.centre[0] - b.c[0];
        const dy = s.centre[1] - b.c[1];
        const la = Math.abs(dx * b.along[0] + dy * b.along[1]);
        expect(la).toBeGreaterThan(b.ha + s.length / 2);
      }
    }
  });

  it('港铁出口只包表里的结构，J3 在内；码头找到朝岸立面', () => {
    const m = mtrFurniture({ zones, stops: [], islands: [], buildings: city.buildings, surface: at, high: true }, 0);
    expect(m.exits.map((e) => e.code)).toContain('J3');
    for (const e of m.exits) expect(MTR_EXITS).toContain(e);
    for (const e of MTR_EXITS) expect(city.buildings.some((b) => b.id === e.id)).toBe(true);
    const p = pierFurniture({ zones, stops: [], islands: [], buildings: city.buildings, surface: at, high: true }, 0);
    expect(p.fronts.map((f) => f.pier).sort()).toEqual([3, 4, 5, 6, 7]);
    for (const f of p.fronts) expect(f.normal[1]).toBeLessThan(-0.5);
  });

  it('站岛站名：锚点站岛是同方向最近的真实站', () => {
    const want: Record<string, string> = { W1: '72W', W2: '70W', E1: '27E', E2: '29E' };
    for (const a of STOP_ANCHORS) {
      const i = islands.findIndex((s) => Math.hypot(s.centre[0] - a.x, s.centre[1] - a.y) < 8);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(st.plates[i]!.ref).toBe(want[a.name]);
    }
    expect(st.plates.find((p) => p.ref === '72W')!.zh).toBe('砵典乍街');
  });

  it('核心区灯控过路处：有人过路的路缘都有触觉警示砖（人行道 ≥ 1.4 m）', () => {
    let kerbs = 0;
    let padded = 0;
    for (const c of life.sites) {
      if (!c.kerbs || !c.core) continue;
      const p = plans[c.plan]!;
      const x = p.crossings.find((q) => Math.abs(q.s / 10 - c.s) < 0.5);
      if (!x?.studs) continue;
      let i = 0;
      while (i < p.along.length - 2 && p.along[i + 1]! < c.s * 10) i++;
      for (const pav of [p.pavL, p.pavR]) {
        kerbs++;
        if (Math.min(pav[i] ?? 0, pav[i + 1] ?? 0) >= 14) padded++;
      }
    }
    expect(kerbs).toBeGreaterThan(20);
    expect(padded / kerbs).toBeGreaterThanOrEqual(0.9);
  });
});

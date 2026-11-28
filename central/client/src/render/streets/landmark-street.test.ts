/**
 * R4 + R5 整合复审（真实数据）：地标网格在行人高度的实心范围（管线 landmarkStreetSections → LandmarkMesh.street）。
 * - 六座地标都有；行人走线（天桥除外：天桥两端照旧接进裙楼，只查敏感区）一个点也不落在里面；
 * - 路灯杆不在里面、离它 ≥ 0.3 m（原来滙豐總行大廈西侧巷子里有一支埋在网格墙里）。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, type CityFile } from '@central/data';
import { threeToSim } from '../../coords';
import { reliefGrid, reliefHeight } from '../../data/terrain';
import { pointInFlat } from '../../geom/ring';
import { footprintTest, landmarkStreetRings, renderedTerrain } from '../road-corridor';
import { planRoads } from '../roads';
import { CORE_RECT_M } from '.';
import { streetLamps } from './lamps';
import { signalHeads } from './signals';
import { buildStreetLife } from './streetlife';
import { RenderedSurface, dropZoneLamps, outsideLandmarkStreet, outsideZones } from './surface';
import { TramSystem, tramStopIslands } from './trams';

describe('地标网格在行人高度的实心范围（真实数据）', () => {
  const read = (n: string) => readFileSync(new URL(`../../../public/city/${n}`, import.meta.url));
  const city = JSON.parse(read('central.json').toString('utf8')) as CityFile;
  const relief = reliefGrid(decodeTerrain(read('terrain.bin')));
  const ground = reliefHeight(relief);
  const plans = planRoads(city.roads, ground, city.props);
  const zones = city.zones.sensitive;
  dropZoneLamps(plans, zones);
  const rings = landmarkStreetRings(city.landmarks);
  const inside = footprintTest([], rings);

  it('六座地标都有实心范围（逆时针外环）', () => {
    expect(city.landmarks.filter((l) => l.mesh).length).toBe(6);
    for (const l of city.landmarks) expect(l.mesh?.street?.length, l.id).toBeGreaterThan(0);
  });

  it('路灯杆不在里面、离它 ≥ 0.3 m；滙豐總行大廈西侧巷子那支（原来埋在墙里）去掉了', () => {
    const all = outsideZones(streetLamps(plans), zones, (l) => l.pole, (l) => l.head);
    const kept = outsideLandmarkStreet(all, city.landmarks, (l) => l.pole);
    const sim = (p: readonly [number, number, number]) => threeToSim(p[0], p[1], p[2]);
    const near = (x: number, y: number) => Math.hypot(x - 4506.8, y + 2722.7) < 5;
    expect(all.some((l) => near(...(sim(l.pole).slice(0, 2) as [number, number])))).toBe(true);
    expect(kept.some((l) => near(...(sim(l.pole).slice(0, 2) as [number, number])))).toBe(false);
    expect(all.length - kept.length).toBeLessThanOrEqual(5);
    for (const l of kept) {
      const [x, y] = sim(l.pole);
      for (let k = 0; k < 8; k++) expect(inside(x + Math.cos((k * Math.PI) / 4) * 3, y + Math.sin((k * Math.PI) / 4) * 3)).toBe(false);
    }
  });

  it('行人走线（天桥除外）一个点也不落在里面', { timeout: 120000 }, () => {
    const surface = new RenderedSurface(plans, renderedTerrain(relief, plans, city.buildings).fn);
    const at = (x: number, y: number) => surface.heightAt(x, y);
    const lamps = outsideZones(streetLamps(plans), zones, (l) => l.pole, (l) => l.head);
    const heads = outsideZones(signalHeads(city.props.signals, plans, ground, at), zones, (s) => s.base);
    const trams = new TramSystem({ city, plans, ground, surface: at, lamps, high: true });
    const poles = trams.overhead.supports.filter((s) => s.kind === 'pole');
    const life = buildStreetLife(city, plans, ground, at, heads, { high: true, core: CORE_RECT_M, tram: { islands: tramStopIslands(), poles: poles.map((s) => [s.x, s.y] as const) } });
    let checked = 0;
    const bad: string[] = [];
    for (const w of life.paths) {
      if (w.cls === 'bridge') continue;
      for (let i = 0; i < w.pts.length; i += 3) {
        if (inside(w.pts[i]! * 10, w.pts[i + 1]! * 10)) bad.push(`走线 ${w.id} (${w.pts[i]}, ${w.pts[i + 1]})`);
        checked++;
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThan(10000);
    // 点测试与逐环奇偶一致（抽查）
    const r0 = rings[0]!;
    expect(inside(r0[0]! + 1, r0[1]! + 1)).toBe(pointInFlat(r0, r0[0]! + 1, r0[1]! + 1));
  });
});

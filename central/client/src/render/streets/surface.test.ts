import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, type CityFile } from '@central/data';
import { threeToSim } from '../../coords';
import { reliefGrid, reliefHeight } from '../../data/terrain';
import { renderedTerrain } from '../road-corridor';
import { centreZ, planRoads, projectOnto } from '../roads';

import { hillLights } from './hill-lights';
import { streetLamps } from './lamps';
import { SIGNAL_CYCLE_S, signalHeads, signalState } from './signals';
import { RenderedSurface, dropZoneLamps, inZones, outsideZones } from './surface';
import { treeItems } from './trees';

describe('RenderedSurface（合成数据）', () => {
  it('路面（含人行道）上取水平路面高度，路外取地形', () => {
    const plan = {
      pts: [0, 0, 1000, 0],
      along: [0, 1000],
      len: 1000,
      hw: 50,
      pavL: [30, 30],
      pavR: [30, 30],
      zc: [200, 300],
      elev: 0,
    } as unknown as Parameters<typeof centreZ>[0];
    const s = new RenderedSurface([plan], () => 7);
    expect(s.heightAt(500, 0)).toBeCloseTo(250);
    expect(s.heightAt(500, 75)).toBeCloseTo(250); // 人行道上
    expect(s.heightAt(500, 90)).toBe(7); // 路外
  });
});

describe('真实数据：客户端生成的道具不进敏感区、立在看得见的地面上', () => {
  const read = (n: string) => readFileSync(new URL(`../../../public/city/${n}`, import.meta.url));
  const city = JSON.parse(read('central.json').toString('utf8')) as CityFile;
  const relief = reliefGrid(decodeTerrain(read('terrain.bin')));
  const ground = reliefHeight(relief);
  const plans = planRoads(city.roads, ground, city.props);
  const zones = city.zones.sensitive;
  dropZoneLamps(plans, zones);
  const surface = new RenderedSurface(plans, renderedTerrain(relief, plans, city.buildings).fn);
  const inZ = (p: readonly [number, number, number]) => {
    const [x, y] = threeToSim(p[0], p[1], p[2]);
    return inZones(zones, x, y);
  };

  it('有敏感区；路灯、交通灯、山上灯点、树一个都不在区内', () => {
    expect(zones.length).toBeGreaterThan(3);
    const lamps = outsideZones(streetLamps(plans), zones, (l) => l.pole, (l) => l.head);
    expect(lamps.length).toBeGreaterThan(1500);
    for (const l of lamps) {
      expect(inZ(l.pole)).toBe(false);
      expect(inZ(l.head)).toBe(false);
    }
    const signals = outsideZones(signalHeads(city.props.signals, plans, ground), zones, (s) => s.base);
    expect(signals.length).toBeGreaterThan(100);
    for (const s of signals) expect(inZ(s.base)).toBe(false);
    const hills = outsideZones(hillLights(relief, () => 0, () => 1), zones, (h) => h.p);
    for (const h of hills) expect(inZ(h.p)).toBe(false);
    const trees = treeItems(city.props.trees, ground, null, null, 0, (x, y) => surface.heightAt(x, y), (x, y) => inZones(zones, x, y));
    expect(trees.length).toBeGreaterThan(200);
    for (const t of trees) expect(inZ(t.p)).toBe(false);
  });

  it('交通灯杆底与路树树干底贴着看得见的地面（|差| < 0.3 m）', () => {
    const at = (x: number, y: number) => surface.heightAt(x, y);
    for (const s of signalHeads(city.props.signals, plans, ground, at)) {
      const [x, y, z] = threeToSim(s.base[0], s.base[1], s.base[2]);
      expect(Math.abs(z - surface.heightAt(x, y)) / 10).toBeLessThan(0.3);
    }
    const trees = treeItems(city.props.trees, ground, null, null, 0, (x, y) => surface.heightAt(x, y));
    for (const t of trees) {
      const [x, y, z] = threeToSim(t.p[0], t.p[1], t.p[2]);
      expect(Math.abs(z - surface.heightAt(x, y)) / 10).toBeLessThan(0.5);
    }
  });

  it('交通灯：60 s 周期 绿 → 黄 → 红；灯杆在最近道路的路缘外、路面高度上', () => {
    expect(signalState(0)).toBe(0);
    expect(signalState(0.47)).toBe(1);
    expect(signalState(0.9)).toBe(2);
    expect(signalState(1.2)).toBe(0);
    expect(SIGNAL_CYCLE_S).toBe(60);
    // 灯杆在最近道路路缘外 0.6 m 的人行道上：离那条路的中线不超过 半宽 + 人行道 + 1 m
    const near = plans.filter((p) => p.elev === 0 && p.road.cls !== 'pedestrian');
    for (const s of signalHeads(city.props.signals, plans, ground).slice(0, 60)) {
      const [x, y] = threeToSim(s.base[0], s.base[1], s.base[2]);
      let best = Infinity;
      for (const p of near) best = Math.min(best, projectOnto(p.pts, p.along, x, y).d - p.hw);
      expect(best).toBeLessThan(80);
    }
  });
});

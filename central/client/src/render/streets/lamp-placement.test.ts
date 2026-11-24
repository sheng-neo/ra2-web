import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, type CityFile } from '@central/data';
import { reliefGrid, reliefHeight } from '../../data/terrain';
import { planRoads, pointAt } from '../roads';
import { LampPattern, lampRule, lampSides, lampsAlong, snapToReal, sodiumProbability } from './lamp-placement';
import { streetLamps } from './lamps';

describe('lampRule', () => {
  it('间距与排布按道路等级', () => {
    expect(lampRule('trunk', 4, 1, false)).toMatchObject({ spacing: 28, pattern: LampPattern.Opposite });
    expect(lampRule('primary', 2, 1, false)).toMatchObject({ spacing: 28, pattern: LampPattern.StaggerLeft });
    expect(lampRule('secondary', 2, -1, false)).toMatchObject({ spacing: 30, pattern: LampPattern.StaggerRight });
    expect(lampRule('tertiary', 2, 1, false)).toMatchObject({ spacing: 35, pattern: LampPattern.Left });
    expect(lampRule('residential', 1, -1, true)).toMatchObject({ spacing: 35, pattern: LampPattern.Right, headH: 8 });
    expect(lampRule('pedestrian', 0, 1, false)).toMatchObject({ spacing: 20, headH: 4, postTop: true });
    expect(lampRule('footway', 0, 1, false)).toBeNull();
    // 主路灯头 10–12 m，支路 / 山路 8 m
    expect(lampRule('primary', 2, 1, false)!.headH).toBeGreaterThanOrEqual(10);
    expect(lampRule('tertiary', 2, 1, false)!.headH).toBe(8);
  });

  it('lampsAlong：等间距、两端留空、交错左右交替、对置成对', () => {
    const stag = lampsAlong(30, 5, LampPattern.StaggerLeft, 200);
    for (let i = 1; i < stag.length; i++) {
      expect(stag[i]!.s - stag[i - 1]!.s).toBeCloseTo(30);
      expect(stag[i]!.side).toBe(-stag[i - 1]!.side as 1 | -1);
    }
    expect(stag[0]!.s).toBeGreaterThanOrEqual(2);
    expect(stag[stag.length - 1]!.s).toBeLessThanOrEqual(198);
    const one = lampsAlong(35, 10, LampPattern.Right, 300);
    expect(new Set(one.map((l) => l.side))).toEqual(new Set([-1]));
    const opp = lampsAlong(28, 0, LampPattern.Opposite, 100);
    expect(opp.filter((l) => l.side > 0)).toHaveLength(opp.length / 2);
    expect(lampsAlong(30, 5, LampPattern.None, 200)).toHaveLength(0);
  });

  it('lampSides 对负 k 与正 k 规则一致', () => {
    expect(lampSides(LampPattern.StaggerLeft, -2)).toEqual([1]);
    expect(lampSides(LampPattern.StaggerLeft, -1)).toEqual([-1]);
    expect(lampSides(LampPattern.StaggerRight, 4)).toEqual([-1]);
  });

  it('snapToReal：真实灯落在序列上、在它那一侧', () => {
    for (const [s, side] of [
      [47, 1],
      [47, -1],
      [113, 1],
    ] as const) {
      const snapped = snapToReal(30, LampPattern.StaggerLeft, s, side);
      const hit = lampsAlong(30, snapped.phase, snapped.pattern, 400).find((l) => Math.abs(l.s - s) < 1e-6);
      expect(hit?.side).toBe(side);
      const one = snapToReal(35, LampPattern.Left, s, side);
      expect(lampsAlong(35, one.phase, one.pattern, 400).find((l) => Math.abs(l.s - s) < 1e-6)?.side).toBe(side);
    }
  });

  it('钠灯概率：主路低、支路高、封顶 1', () => {
    expect(sodiumProbability('primary', 0.4)).toBeCloseTo(0.2);
    expect(sodiumProbability('secondary', 0.4)).toBeCloseTo(0.24);
    expect(sodiumProbability('tertiary', 0.9)).toBe(1);
  });
});

describe('真实数据上的路灯', () => {
  const read = (n: string) => readFileSync(new URL(`../../../public/city/${n}`, import.meta.url));
  const city = JSON.parse(read('central.json').toString('utf8')) as CityFile;
  const ground = reliefHeight(reliefGrid(decodeTerrain(read('terrain.bin'))));
  const plans = planRoads(city.roads, ground, city.props);
  const lamps = streetLamps(plans);

  it('确定性：同一输入两次结果相同', () => {
    const again = streetLamps(planRoads(city.roads, ground, city.props));
    expect(again).toHaveLength(lamps.length);
    expect(again[123]).toEqual(lamps[123]);
  });

  it('数量合理、灯头互相不近于 12 m（不同道路去重）', () => {
    expect(lamps.length).toBeGreaterThan(1500);
    expect(lamps.length).toBeLessThan(6000);
    let close = 0;
    const grid = new Map<string, number[]>();
    lamps.forEach((l, i) => {
      const k = `${Math.floor(l.head[0] / 12)},${Math.floor(l.head[2] / 12)}`;
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (const j of grid.get(`${Math.floor(l.head[0] / 12) + a},${Math.floor(l.head[2] / 12) + b}`) ?? []) {
            if (Math.hypot(lamps[j]!.head[0] - l.head[0], lamps[j]!.head[2] - l.head[2]) < 11.9) close++;
          }
      grid.set(k, [...(grid.get(k) ?? []), i]);
    });
    expect(close).toBe(0);
  });

  it('颜色比例：核心区 60–80 % 白光 LED（2026 年主路、次干道多已换 LED），半山（地面 > 60 mPD）≥ 60 % 钠灯', () => {
    let core = 0;
    let coreLed = 0;
    let hill = 0;
    let hillSodium = 0;
    for (const p of plans) {
      const l = p.lamps;
      if (!l) continue;
      const n = Math.max(0, Math.floor(p.len / 10 / l.spacing));
      if (n === 0) continue;
      const mid = pointAt(p.pts, p.along, p.len / 2);
      const x = mid.x / 10;
      const y = mid.y / 10;
      const g = ground(mid.x, mid.y) / 10;
      if (x >= 14 && x <= 652 && y >= -485 && y <= 512) {
        core += n;
        if (!l.sodium) coreLed += n;
      }
      if (g > 60) {
        hill += n;
        if (l.sodium) hillSodium += n;
      }
    }
    expect(core).toBeGreaterThan(200);
    expect(hill).toBeGreaterThan(100);
    expect(coreLed / core).toBeGreaterThanOrEqual(0.6);
    expect(coreLed / core).toBeLessThanOrEqual(0.8);
    expect(hillSodium / hill).toBeGreaterThanOrEqual(0.6);
  });
});

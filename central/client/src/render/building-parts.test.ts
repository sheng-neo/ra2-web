import { readFileSync } from 'node:fs';
import { ShapeUtils, Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Building, FlatXY } from '@central/data';
import { makeFixtureCity } from '../dev/fixture';
import { flatGround } from '../data/terrain';
import { crestPart, isPlantPart, lowTierPartBuildings, mainPart, partTriangles, peakPart, prepareParts } from './building-parts';
import { buildBuildingChunks, prepareBuildings } from './buildings';
import { DM_TO_M } from '../coords';

const box = (x0: number, y0: number, x1: number, y1: number): FlatXY => [x0, y0, x1, y0, x1, y1, x0, y1];
const FOOT = { outer: box(0, 0, 400, 400), holes: [] };

function tower(parts: Building['parts']): Building {
  return { id: 't', src: 'landsd', footprint: { outer: FOOT.outer }, base: 50, height: 800, heightSource: 'landsd', kind: 'tower', style: 3, parts };
}

describe('prepareParts', () => {
  const parts = prepareParts(
    tower([
      { top: 500 },
      { ring: box(50, 50, 350, 350), top: 800 },
      { ring: box(100, 100, 200, 200), top: 860 },
      { ring: box(250, 250, 300, 300), top: 860 },
      { ring: box(140, 140, 150, 150), top: 1100 },
    ]),
    FOOT,
    40,
    50,
  )!;

  it('底座的墙从楼脚起，其余块从下一层的顶起', () => {
    expect(parts.map((p) => [p.bottom, p.top])).toEqual([
      [40, 500],
      [500, 800],
      [800, 860],
      [800, 860],
      [860, 1100],
    ]);
    expect(parts[0]!.ring).toBe(FOOT);
  });

  it('主体 = 面积 ≥ 底座 40 % 的最高块；最高块；主体之上的小块按机房画', () => {
    const main = mainPart(parts);
    expect(main.top).toBe(800);
    expect(peakPart(parts).top).toBe(1100);
    expect(isPlantPart(parts[2]!, main)).toBe(true);
    expect(isPlantPart(parts[4]!, main)).toBe(true);
    expect(isPlantPart(parts[1]!, main)).toBe(false);
  });

  it('顶块 = 面积 ≥ 底座 15 % 的最高块：裙楼与塔楼同在一个轮廓时是塔楼', () => {
    const podiumTower = prepareParts(
      tower([{ top: 200 }, { ring: box(0, 0, 160, 160), top: 1500 }, { ring: box(60, 60, 80, 80), top: 1560 }]),
      FOOT,
      40,
      50,
    )!;
    expect(mainPart(podiumTower).top).toBe(200);
    expect(crestPart(podiumTower).top).toBe(1500);
    expect(isPlantPart(podiumTower[2]!, crestPart(podiumTower))).toBe(true);
  });

  it('没有 parts、只有底座、或块顶不高于楼底 2.5 m 时退回平顶', () => {
    expect(prepareParts(tower(undefined), FOOT, 40, 50)).toBeNull();
    expect(prepareParts(tower([{ top: 500 }]), FOOT, 40, 50)).toBeNull();
    const low = prepareParts(tower([{ top: 40 }, { ring: box(0, 0, 100, 100), top: 60 }]), FOOT, 40, 50)!;
    expect(low[0]!.top).toBe(75);
    expect(low[1]!.bottom).toBe(40);
  });

  it('三角形数：每边一个四边形 + 屋顶', () => {
    expect(partTriangles([box(0, 0, 10, 10)])).toBe(8 + 2);
  });
});

describe('LOW 档挑楼', () => {
  it('按最高点从高到低，累计多出的三角形不超过预算', () => {
    const mk = (id: string, top: number): Building => ({ ...tower([{ top: 500 }, { ring: box(0, 0, 100, 100), top }]), id });
    const pick = lowTierPartBuildings([mk('a', 900), mk('b', 1200), mk('c', 1000)], 25);
    expect([...pick].sort()).toEqual(['b', 'c']);
  });
});

describe('fixture 城市的分层体块', () => {
  const city = makeFixtureCity();
  const layered = city.buildings.filter((b) => b.parts);

  it('有四栋分层楼，parts 合法（升序、底座不带环、其余逆时针）', () => {
    expect(layered).toHaveLength(4);
    for (const b of layered) {
      expect(b.parts![0]!.ring).toBeUndefined();
      for (let i = 1; i < b.parts!.length; i++) expect(b.parts![i]!.top).toBeGreaterThanOrEqual(b.parts![i - 1]!.top);
    }
  });

  it('上层块的墙不从地面起；最高点 = 最高块', () => {
    const { items } = prepareBuildings(layered, flatGround);
    for (const p of items) {
      expect(p.parts).not.toBeNull();
      for (const pt of p.parts!.slice(1)) expect(pt.bottom).toBeGreaterThan(p.base);
      expect(p.peak.top).toBe(Math.max(...p.b.parts!.map((x) => x.top)));
    }
  });

  it('网格：顶点最高处到达最高块的顶', () => {
    const chunks = buildBuildingChunks(layered, flatGround, [], { rooftops: false });
    let maxY = 0;
    for (const c of chunks.values()) maxY = Math.max(maxY, ...c.arrays.data[0]!.filter((_, i) => i % 3 === 1));
    expect(maxY).toBeCloseTo(Math.max(...layered.flatMap((b) => b.parts!.map((x) => x.top))) * DM_TO_M, 3);
  });
});

describe('真实数据的分层环（R2 修复轮）', () => {
  it('earcut 三角化后的面积 = 外环面积 − 洞面积（误差 ≤ 0.1 %）：屋顶不重叠、不盖出墙外', () => {
    const city = JSON.parse(readFileSync(new URL('../../public/city/central.json', import.meta.url), 'utf8')) as { buildings: Building[] };
    const area = (pts: Vector2[]) => Math.abs(ShapeUtils.area(pts));
    const toV = (r: FlatXY) => {
      const out: Vector2[] = [];
      for (let i = 0; i < r.length; i += 2) out.push(new Vector2(r[i]!, r[i + 1]!));
      return out;
    };
    let n = 0;
    for (const b of city.buildings)
      for (const p of b.parts?.slice(1) ?? []) {
        const outer = toV(p.ring!);
        const holes = (p.holes ?? []).map(toV);
        const want = area(outer) - holes.reduce((s, h) => s + area(h), 0);
        const all = [...outer, ...holes.flat()];
        let got = 0;
        for (const [a, c, d] of ShapeUtils.triangulateShape(outer, holes)) got += area([all[a!]!, all[c!]!, all[d!]!]);
        expect(Math.abs(got - want), `${b.id} 顶 ${p.top}`).toBeLessThanOrEqual(Math.max(want * 1e-3, 4));
        n++;
      }
    expect(n).toBeGreaterThan(2000);
  });
});


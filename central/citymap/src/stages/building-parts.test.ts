import type { Building, FlatXY, LandmarkPlacement, SensitiveZone } from '@central/data';
import { describe, expect, it } from 'vitest';
import { ringArea, signedArea2 } from '../geo/ring';
import {
  addBuildingParts,
  clusterLevels,
  deriveParts,
  matchModels,
  mainTop,
  matchScore,
  overlapOf,
  parseModels,
  PARTS,
  snapRing,
  squareCorners,
  type Model3d,
} from './building-parts';

/** 轴对齐矩形，逆时针，dm。 */
const box = (x0: number, y0: number, x1: number, y1: number): FlatXY => [x0, y0, x1, y0, x1, y1, x0, y1];

function building(id: string, outer: FlatXY, base = 50, height = 800): Building {
  return { id, src: 'landsd', footprint: { outer }, base, height, heightSource: 'landsd', kind: 'tower', style: 7 };
}

/** 一个模型：levels 为 [top, 轮廓...]，每层一个无洞多边形。 */
function model(id: string, base: number, levels: [number, ...FlatXY[]][]): Model3d {
  return { id, base, levels: levels.map(([top, ...rings]) => ({ top, polys: rings.map((r) => [r]) })) };
}

// 40 m × 40 m 的塔楼：底座 50 m 顶（全覆盖），中间 20 m × 20 m 升到 80 m，另有 1 m × 1 m 的桅杆到 100 m
const TOWER = box(0, 0, 400, 400);
const tower = model('B1', 50, [
  [500, TOWER],
  [800, box(100, 100, 300, 300)],
  [1000, box(190, 190, 200, 200)],
]);

describe('clusterLevels', () => {
  it('相差 < 1.5 m 的屋面并成一层（女儿墙、机房小台阶），代表高度取面积大的一方', () => {
    const { levelOf, tops } = clusterLevels([
      [1000, 900],
      [1010, 50],
    ]);
    expect(tops).toEqual([1000]);
    expect(levelOf).toEqual([0, 0]);
  });

  it('相差 ≥ 1.5 m 的是两层', () => {
    expect(clusterLevels([
      [1000, 900],
      [1300, 100],
    ]).tops).toEqual([1000, 1300]);
  });

  it('坡屋顶（每 1 m 一档、面积相同）切成 2–3 m 的台阶，相邻台阶差 ≥ 1.5 m', () => {
    const hist = Array.from({ length: 11 }, (_, i) => [1000 + i * 10, 100] as const);
    const { tops } = clusterLevels(hist);
    expect(tops.length).toBeGreaterThanOrEqual(3);
    expect(tops.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < tops.length; i++) expect(tops[i]! - tops[i - 1]!).toBeGreaterThanOrEqual(PARTS.minRise);
  });
});

describe('匹配', () => {
  it('塔楼模型从裙楼顶起：靠楼底分给塔楼，裙楼模型分给裙楼', () => {
    const podium = building('pod', box(0, 0, 600, 600), 50, 150);
    const tw = building('tow', box(100, 100, 400, 400), 200, 900);
    const towerModel = model('T', 205, [[1100, box(100, 100, 400, 400)]]);
    const podiumModel = model('P', 52, [[200, box(0, 0, 600, 600)]]);
    expect(matchModels([towerModel, podiumModel], [podium, tw])).toEqual([1, 0]);
  });

  it('IoU < 0.5 且互不包含的不算', () => {
    const b = building('b', box(60, 0, 160, 100), 50, 450);
    const o = overlapOf(model('M', 50, [[500, box(0, 0, 100, 100)]]), b);
    expect(matchScore(o, { base: 50, mainTop: 500 }, b)).toBeNull();
  });

  it('模型被 2D 楼包含（≥ 80 %）也算', () => {
    const b = building('b', box(0, 0, 400, 400), 50, 450);
    const o = overlapOf(model('M', 50, [[500, box(100, 100, 200, 200)]]), b);
    expect(matchScore(o, { base: 50, mainTop: 500 }, b)).not.toBeNull();
  });

  it('高度不符的不算：裙楼不拿塔楼模型，塔楼不拿裙楼模型', () => {
    const podium = building('pod', box(0, 0, 400, 400), 50, 150);
    const o = overlapOf(model('M', 50, [[900, box(0, 0, 400, 400)]]), podium);
    expect(matchScore(o, { base: 50, mainTop: 900 }, podium)).toBeNull();
    const tw = building('tow', box(0, 0, 400, 400), 50, 1800);
    expect(matchScore(o, { base: 50, mainTop: 300 }, tw)).toBeNull();
    expect(mainTop(model('M', 50, [[500, box(0, 0, 400, 400)], [800, box(0, 0, 200, 200)], [1500, box(0, 0, 20, 20)]]))).toBe(800);
  });

  it('塔楼立在裙楼上：裙楼在塔楼轮廓里最高只到塔楼楼底（caps）', () => {
    const podium = building('pod', box(0, 0, 400, 400), 50, 300);
    const m = model('P', 50, [[350, box(0, 0, 400, 400)], [1200, box(100, 100, 300, 300)]]);
    expect(deriveParts(podium, [m])!.map((p) => p.top)).toEqual([350, 1200]);
    expect(deriveParts(podium, [m], { caps: [{ rings: [box(100, 100, 300, 300)], z: 350 }] })).toBeUndefined();
  });
});

describe('deriveParts', () => {
  const parts = deriveParts(building('t', TOWER), [tower])!;

  it('底座 + 退台 + 桅杆：parts[0] 不带环，顶 = 最低层', () => {
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ top: 500 });
    expect(parts[1]!.top).toBe(800);
    expect(parts[2]!.top).toBe(1000);
  });

  it('退台轮廓：逆时针整数环，面积在栅格误差内', () => {
    const r = parts[1]!.ring!;
    expect(signedArea2(r)).toBeGreaterThan(0);
    expect(r.every(Number.isInteger)).toBe(true);
    expect(Math.abs(ringArea(r) - 200 * 200)).toBeLessThan(200 * 4 * 2);
  });

  it('桅杆（1 m²、高出 20 m）保留', () => {
    expect(ringArea(parts[2]!.ring!)).toBeGreaterThanOrEqual(PARTS.spireArea);
  });

  it('只有一层屋面时不出 parts', () => {
    expect(deriveParts(building('t', TOWER), [model('B', 50, [[500, TOWER]])])).toBeUndefined();
  });

  it('< 4 m² 的矮小凸起、露出墙面 < 80 m² 的小机房降掉；女儿墙那样的 1.1 m 台阶并进屋面', () => {
    const m = model('B', 50, [
      [500, TOWER],
      [511, box(0, 0, 400, 5)],
      [540, box(10, 10, 25, 25)],
    ]);
    expect(deriveParts(building('t', TOWER), [m])).toBeUndefined();
  });

  it('模型盖不到 footprint 的 60 % 时不出 parts', () => {
    const m = model('B', 50, [
      [500, box(0, 0, 400, 200)],
      [800, box(0, 0, 100, 100)],
    ]);
    expect(deriveParts(building('t', TOWER), [m])).toBeUndefined();
  });

  it('退台贴着 footprint 的边（差 0.2 m）时吸到边上：共面墙严丝合缝', () => {
    const m = model('B', 50, [
      [500, TOWER],
      [800, box(2, 2, 200, 398)],
    ]);
    const r = deriveParts(building('t', TOWER), [m])![1]!.ring!;
    const xs = r.filter((_, i) => i % 2 === 0);
    const ys = r.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(400);
  });

  it('块数不超过上限', () => {
    // 16 个分开的 5 m × 5 m 机房，各高 6 m（露出墙面 120 m²，不会被当成碎块）
    const rooms: FlatXY[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) rooms.push(box(20 + i * 90, 20 + j * 90, 70 + i * 90, 70 + j * 90));
    const m: Model3d = { id: 'B', base: 50, levels: [{ top: 500, polys: [[TOWER]] }, { top: 560, polys: rooms.map((r) => [r]) }] };
    const p = deriveParts(building('t', TOWER), [m])!;
    expect(p.length).toBe(PARTS.maxParts);
  });

  it('排除区（地标轮廓）里不长体块', () => {
    const p = deriveParts(building('t', TOWER), [tower], { exclude: [[box(0, 0, 400, 400)]] });
    expect(p).toBeUndefined();
  });
});

describe('squareCorners', () => {
  it('栅格切出的 0.4 m 小斜边还原成直角，长斜边不动', () => {
    // 20 m × 20 m 的方形，四角各被切掉 0.4 m
    const chamfered = [4, 0, 196, 0, 200, 4, 200, 196, 196, 200, 4, 200, 0, 196, 0, 4];
    const sq = squareCorners(chamfered);
    expect(sq).toHaveLength(8);
    expect(ringArea(sq)).toBe(200 * 200);
    const octagon = [50, 0, 150, 0, 200, 50, 200, 150, 150, 200, 50, 200, 0, 150, 0, 50];
    expect(squareCorners(octagon)).toEqual(octagon);
  });
});

describe('snapRing', () => {
  it('离 footprint 顶点 ≤ 0.4 m 吸到顶点，离边 ≤ 0.4 m 投到边上，远的不动', () => {
    expect(snapRing([3, 2, 200, 3, 200, 200, 60, 150], [TOWER], 4)).toEqual([0, 0, 200, 0, 200, 200, 60, 150]);
  });
});

describe('addBuildingParts（遮罩与确定性）', () => {
  const zone: SensitiveZone = { id: 'z', kind: 'government', area: { outer: box(1000, 0, 1600, 600) } };
  const lmFoot = box(2000, 0, 2400, 400);
  const landmark: LandmarkPlacement = {
    id: 'harbour-spire',
    name: { zh: '海港塔', en: 'Harbour Spire' },
    x: 2200,
    y: 200,
    rot: 0,
    base: 50,
    height: 4000,
    footprint: { outer: lmFoot },
    replaces: ['real'],
  };
  const shift = (r: FlatXY, dx: number) => r.map((v, i) => (i % 2 === 0 ? v + dx : v));
  const shiftModel = (m: Model3d, id: string, dx: number): Model3d => ({
    id,
    base: m.base,
    levels: m.levels.map((lv) => ({ top: lv.top, polys: lv.polys.map((p) => p.map((r) => shift(r, dx))) })),
  });
  const ok = building('a', TOWER);
  const sens = building('s', shift(TOWER, 1100));
  const real = building('real', lmFoot, 50, 800);
  // 裙楼包住地标原型（高度也对得上：只能靠覆盖分开）
  const podium = building('p', box(1900, -100, 2500, 500), 50, 750);
  const all = [ok, sens, real, podium];
  const kept = [ok, sens, podium];
  const models = [tower, shiftModel(tower, 'S', 1100), shiftModel(tower, 'R', 2000)];

  it('敏感区里的楼没有 parts；匹配到地标原型的模型丢掉，不转嫁给裙楼', () => {
    const { buildings, stats } = addBuildingParts(all, kept, models, { landmarks: [landmark], sensitive: [zone] });
    expect(buildings.find((b) => b.id === 'a')!.parts).toBeDefined();
    expect(buildings.find((b) => b.id === 's')!.parts).toBeUndefined();
    expect(buildings.find((b) => b.id === 'p')!.parts).toBeUndefined();
    expect(stats.toLandmarks).toBe(1);
    expect(stats.buildingsWithParts).toBe(1);
  });

  it('确定性：重跑、打乱模型顺序结果逐字节相同；不改输入对象', () => {
    const a = addBuildingParts(all, kept, models, { landmarks: [landmark], sensitive: [zone] });
    const b = addBuildingParts(all, kept, [...models].reverse(), { landmarks: [landmark], sensitive: [zone] });
    expect(JSON.stringify(a.buildings)).toBe(JSON.stringify(b.buildings));
    expect(ok.parts).toBeUndefined();
  });
});

describe('parseModels', () => {
  it('HK1980 米 → 本地 dm（只经 gridToLocal），格式不符时报错', () => {
    const ms = parseModels({
      format: 'central-3dvm-parts',
      version: 1,
      models: [{ id: 'B', sheet: 's', base: 52, levels: [{ top: 500, polys: [[[834010.25, 816000, 834020, 816000, 834020, 816010]]] }] }],
    });
    expect(ms[0]!.levels[0]!.polys[0]![0]).toEqual([103, 0, 200, 0, 200, 100]);
    expect(() => parseModels({ format: 'x', version: 1, models: [] })).toThrow();
  });
});

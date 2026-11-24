import { gunzipSync } from 'node:zlib';
import type { TerrainGrid } from '@central/data';
import { describe, expect, it } from 'vitest';
import { ORIGIN } from '../config';
import { loadSnapshot } from './snapshot';
import { LANDSD_DIR } from '../config';
import {
  baseResiduals,
  buildingCentroid,
  LANDSD_BUILDINGS_FILE,
  landsdBuildingsFromGeoJson,
  readLandsdBuildings,
} from './terrain-buildings';

const square = (e: number, n: number, s: number) => [[[e, n], [e + s, n], [e + s, n + s], [e, n + s], [e, n]]];
const props = (id: string, base: number | null, top: number | null) => ({
  BuildingCSUID: id,
  BuildingBlockType: 'Tower',
  BaseHeight: base,
  TopHeight: top,
  Storeys: 10,
});

describe('landsdBuildingsFromGeoJson', () => {
  it('HK1980 米 → 本地 dm，高程 → dm，缺失为 null', () => {
    const out = landsdBuildingsFromGeoJson({
      features: [
        { geometry: { type: 'Polygon', coordinates: square(ORIGIN.e + 10, ORIGIN.n - 20, 5) }, properties: props('A', 3.74, 84.1) },
        { geometry: { type: 'MultiPolygon', coordinates: [square(ORIGIN.e, ORIGIN.n, 1), square(ORIGIN.e + 2, ORIGIN.n, 1)] }, properties: props('B', null, null) },
        { geometry: null, properties: props('C', 1, 2) },
      ],
    });
    expect(out.map((b) => b.id)).toEqual(['A', 'B']);
    expect(out[0]).toMatchObject({ blockType: 'Tower', base: 37, top: 841, storeys: 10 });
    expect(out[0]!.polygons).toEqual([[[100, -200, 150, -200, 150, -150, 100, -150, 100, -200]]]);
    expect(buildingCentroid(out[0]!)).toEqual([125, -175]);
    expect(out[1]).toMatchObject({ base: null, top: null });
    expect(out[1]!.polygons).toHaveLength(2);
  });
});

describe('baseResiduals', () => {
  it('平地 5 mPD 上比较楼底高程', () => {
    const grid: TerrainGrid = { x0: 0, y0: 0, cell: 50, nx: 5, ny: 5, heights: new Int16Array(25).fill(50) };
    const mk = (id: string, x: number, base: number | null) => ({
      id, blockType: 'Tower', base, top: 500, storeys: null, polygons: [[[x, 50, x + 20, 50, x + 20, 70, x, 70]]],
    });
    const r = baseResiduals(grid, [mk('a', 50, 50), mk('b', 100, 20), mk('c', 150, 100), mk('d', 50, null), mk('out', 900, 50)]);
    expect(r.n).toBe(3);
    expect(r.medianAbsDm).toBe(30);
    expect(r.within3m).toBeCloseTo(1 / 3, 9);
  });
});

describe('仓库快照：地政总署 Building', () => {
  const files = loadSnapshot(LANDSD_DIR).files;
  const buildings = readLandsdBuildings(files);

  it('ID 唯一，楼顶高于楼底', () => {
    expect(buildings.length).toBeGreaterThan(3000);
    expect(new Set(buildings.map((b) => b.id)).size).toBe(buildings.length);
    for (const b of buildings) if (b.base !== null && b.top !== null) expect(b.top).toBeGreaterThan(b.base);
  });

  it('塔楼与裙楼都有楼底/楼顶高程', () => {
    const main = buildings.filter((b) => b.blockType === 'Tower' || b.blockType === 'Podium');
    const covered = main.filter((b) => b.base !== null && b.top !== null).length;
    expect(covered / main.length).toBeGreaterThan(0.99);
  });

  it('快照不含楼名字段（红线：不出现真实企业名）', () => {
    const fc = JSON.parse(gunzipSync(files.get(LANDSD_BUILDINGS_FILE)!).toString('utf8')) as {
      features: { properties: Record<string, unknown> }[];
    };
    const keys = new Set(fc.features.flatMap((f) => Object.keys(f.properties)));
    expect([...keys].filter((k) => /name/i.test(k))).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { buildBuildings } from '../stages/buildings';
import type { LandsdBuilding } from '../stages/terrain-buildings';
import { REF_LANDSD_BUILDINGS } from '../stages/terrain-refs';
import { landsdBuildingSource } from './landsd-buildings';

const EXTENT = [-100000, -100000, 100000, 100000] as const;
const SQUARE = [[[0, 0, 200, 0, 200, 200, 0, 200, 0, 0]]];

function block(partial: Partial<LandsdBuilding>): LandsdBuilding {
  return { id: 'X1', blockType: 'Tower', base: 52, top: 1052, storeys: 30, polygons: SQUARE, ...partial };
}

describe('landsdBuildingSource', () => {
  it('楼底 = BaseHeight，总高 = TopHeight − BaseHeight，类别取 BuildingBlockType，署名为 LandsD', async () => {
    const src = landsdBuildingSource([block({}), block({ id: 'P1', blockType: 'Podium', base: 40, top: 160 })]);
    expect(src.src).toBe('landsd');
    const raws = await src.load();
    expect(raws.map((r) => r.ref)).toEqual([REF_LANDSD_BUILDINGS, REF_LANDSD_BUILDINGS]);
    const { buildings, refs } = buildBuildings(raws, src.src, EXTENT, () => 999);
    const byKind = new Map(buildings.map((b) => [b.kind, b]));
    expect(byKind.get('tower')).toMatchObject({ base: 52, height: 1000, heightSource: 'landsd', src: 'landsd' });
    expect(byKind.get('podium')).toMatchObject({ base: 40, height: 120, heightSource: 'landsd' });
    expect(refs).toEqual([REF_LANDSD_BUILDINGS]);
  });

  it('有盖构筑物不输出；缺高程的临时构筑物按小屋估高，楼底取地形', async () => {
    const src = landsdBuildingSource([
      block({ id: 'O1', blockType: 'Open-sided Structure' }),
      block({ id: 'T1', blockType: 'Temporary Structure', base: null, top: null, storeys: null }),
    ]);
    const { buildings } = buildBuildings(await src.load(), src.src, EXTENT, (x) => 30 + x / 100);
    expect(buildings).toHaveLength(1);
    const [t] = buildings;
    expect(t).toMatchObject({ kind: 'other', heightSource: 'heuristic', base: 30 });
    expect(t!.height).toBeLessThanOrEqual(50);
  });
});

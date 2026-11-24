import { describe, expect, it } from 'vitest';
import { REF_OSM } from '../sources/refs';
import { signedArea2 } from '../geo/ring';
import { buildBuildings, cleanPolygon, heuristicHeightM, kindOf, resolveHeight, storeysOf, type RawBuilding } from './buildings';

const EXTENT = [-100000, -100000, 100000, 100000] as const;

function raw(partial: Partial<RawBuilding> = {}): RawBuilding {
  return {
    rawId: 'b1',
    // 20 m × 10 m，顺时针、带闭合点
    polygons: [[[0, 0, 0, 100, 200, 100, 200, 0, 0, 0]]],
    ref: REF_OSM,
    ...partial,
  };
}

describe('cleanPolygon', () => {
  it('外环 CCW、洞 CW、去掉闭合点', () => {
    const ring = cleanPolygon([
      [0, 0, 0, 1000, 1000, 1000, 1000, 0, 0, 0],
      [100, 100, 500, 100, 500, 500, 100, 500],
    ])!;
    expect(signedArea2(ring.outer)).toBeGreaterThan(0);
    expect(ring.outer.length).toBe(8);
    expect(signedArea2(ring.holes![0]!)).toBeLessThan(0);
  });

  it('丢掉 < 4 m² 的碎片和小洞', () => {
    expect(cleanPolygon([[0, 0, 19, 0, 19, 19, 0, 19]])).toBeNull(); // 3.6 m²
    const ring = cleanPolygon([
      [0, 0, 1000, 0, 1000, 1000, 0, 1000],
      [100, 100, 110, 100, 110, 110, 100, 110],
    ])!;
    expect(ring.holes).toBeUndefined();
  });
});

describe('高度', () => {
  it('优先级：标注高度 → 层数 → 启发式', () => {
    expect(resolveHeight(raw({ heightM: 50, floors: 3 }), 200)).toEqual({ m: 50, source: 'tag' });
    expect(resolveHeight(raw({ floors: 10 }), 200)).toEqual({ m: 10 * 3.2 + 1.3, source: 'levels' });
    expect(resolveHeight(raw(), 200).source).toBe('heuristic');
  });

  it('启发式确定性：同一 ID 永远同一结果，不同 ID 有差异', () => {
    const a = heuristicHeightM(raw({ rawId: 'x' }), 300);
    expect(heuristicHeightM(raw({ rawId: 'x' }), 300)).toBe(a);
    const hs = new Set(Array.from({ length: 20 }, (_, i) => heuristicHeightM(raw({ rawId: `id${i}` }), 300)));
    expect(hs.size).toBeGreaterThan(3);
  });

  it('棚/顶盖类很矮', () => {
    expect(heuristicHeightM(raw({ cls: 'roof' }), 300)).toBeLessThanOrEqual(5);
  });
});

describe('kindOf', () => {
  it('按用途与高度归类', () => {
    expect(kindOf('religious', 'church', 20, 300)).toBe('civic');
    expect(kindOf('transportation', undefined, 12, 3000)).toBe('industrial');
    expect(kindOf('commercial', 'office', 120, 900)).toBe('tower');
    expect(kindOf('residential', 'house', 9, 100)).toBe('house');
    expect(kindOf(undefined, undefined, 20, 2000)).toBe('podium');
    expect(kindOf(undefined, undefined, 20, 200)).toBe('other');
  });
});

describe('buildBuildings', () => {
  it('稳定短 ID、整数高度、风格种子 0–255，不输出任何名称', () => {
    const { buildings, refs } = buildBuildings([raw({ floors: 5 })], 'ovt', EXTENT);
    const [b] = buildings;
    expect(b).toBeDefined();
    expect(b!.id).toMatch(/^[0-9a-f]{10}$/);
    expect(b!.height).toBe(173);
    expect(b!.style).toBeGreaterThanOrEqual(0);
    expect(b!.style).toBeLessThanOrEqual(255);
    expect(Object.keys(b!)).toEqual(['id', 'src', 'footprint', 'base', 'height', 'heightSource', 'kind', 'style', 'storeys']);
    expect(b!.storeys).toBe(5);
    expect(refs).toEqual([REF_OSM]);
    expect(buildBuildings([raw({ floors: 5 })], 'ovt', EXTENT).buildings).toEqual(buildings);
  });

  it('层数未知时省略 storeys 键（可选字段，旧客户端照常读取）', () => {
    const [b] = buildBuildings([raw({ heightM: 30 })], 'ovt', EXTENT).buildings;
    expect(b).toBeDefined();
    expect('storeys' in b!).toBe(false);
  });

  it('质心在范围外的楼被丢弃', () => {
    expect(buildBuildings([raw()], 'ovt', [1000, 1000, 2000, 2000]).buildings).toHaveLength(0);
  });
});

describe('storeysOf', () => {
  it('取整的正整数层数；缺失、非有限、≤ 0 时为 undefined', () => {
    expect(storeysOf({ floors: 30 })).toBe(30);
    expect(storeysOf({ floors: 12.4 })).toBe(12);
    expect(storeysOf({})).toBeUndefined();
    expect(storeysOf({ floors: 0 })).toBeUndefined();
    expect(storeysOf({ floors: -2 })).toBeUndefined();
    expect(storeysOf({ floors: Number.NaN })).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { CHUNK_DM, buildingChunk, chunkBounds, chunkOf, groupByChunk, polylineChunk, regionOf } from './chunks';

describe('chunks', () => {
  it('128 m 网格，向下取整（含负坐标）', () => {
    expect(CHUNK_DM).toBe(1280);
    expect(chunkOf(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(chunkOf(1279, 1279)).toEqual({ cx: 0, cy: 0 });
    expect(chunkOf(1280, 0)).toEqual({ cx: 1, cy: 0 });
    expect(chunkOf(-1, -1280)).toEqual({ cx: -1, cy: -1 });
    expect(chunkOf(-1281, 2560)).toEqual({ cx: -2, cy: 2 });
  });

  it('建筑按轮廓面积质心归块，跨界的楼只进一块', () => {
    // 质心在 (1300, 100) → 块 (1, 0)，虽然轮廓左端伸进块 (0, 0)
    const b = { footprint: { outer: [1200, 0, 1400, 0, 1400, 200, 1200, 200] } };
    expect(buildingChunk(b)).toEqual({ cx: 1, cy: 0 });
    // L 形：面积质心而非顶点平均
    const l = { footprint: { outer: [0, 0, 3000, 0, 3000, 200, 200, 200, 200, 3000, 0, 3000] } };
    const c = buildingChunk(l);
    expect(c).toEqual({ cx: 0, cy: 0 });
  });

  it('道路按弧长中点归块', () => {
    // 折线 0→2000（东）→ 再北 600：总长 2600，中点在 x = 1300 → 块 (1, 0)
    expect(polylineChunk([0, 10, 2000, 10, 2000, 610])).toEqual({ cx: 1, cy: 0 });
  });

  it('区 = 4×4 块', () => {
    expect(regionOf({ cx: 3, cy: -1 })).toEqual({ cx: 0, cy: -1 });
    expect(regionOf({ cx: 4, cy: -4 })).toEqual({ cx: 1, cy: -1 });
    expect(regionOf({ cx: -5, cy: 7 })).toEqual({ cx: -2, cy: 1 });
  });

  it('分组保持输入顺序，范围正确', () => {
    const pts = [
      [10, 10],
      [1500, 10],
      [20, 20],
    ] as const;
    const g = groupByChunk(pts, (p) => chunkOf(p[0], p[1]));
    expect([...g.keys()]).toEqual(['0,0', '1,0']);
    expect(g.get('0,0')!.items).toEqual([pts[0], pts[2]]);
    expect(chunkBounds({ cx: -1, cy: 2 })).toEqual([-1280, 2560, 0, 3840]);
  });
});

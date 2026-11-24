import { describe, expect, it } from 'vitest';
import type { TerrainGrid } from '@central/data';
import { PEAK_EYE, SUMMITS, gridEdgeHeight, gridRect, makeOuterHeight, ridgeField } from './ridge';

/** 合成网格：x −800…1600 m、y −1000…900 m，10 m 一格，高度 = 南面高、北面 0 的斜坡（dm）。 */
function grid(): TerrainGrid {
  const nx = 241;
  const ny = 191;
  const heights = new Int16Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) heights[j * nx + i] = Math.max(0, Math.round((900 - (-1000 + j * 10)) * 2.5 - 1000));
  return { x0: -8000, y0: -10000, cell: 100, nx, ny, heights };
}

describe('网格外山体', () => {
  it('网格边上正好等于地形网格高度（无缝）', () => {
    const g = grid();
    const [x0, y0, x1, y1] = gridRect(g);
    const h = makeOuterHeight(g, [x0, y0, x1, y1]);
    for (const x of [x0, -300, 0, 455, x1]) {
      expect(h(x, y0)).toBeCloseTo(gridEdgeHeight(g, x, y0), 6);
    }
    for (const y of [y0, -500, 0, y1]) {
      expect(h(x0, y)).toBeCloseTo(gridEdgeHeight(g, x0, y), 6);
      expect(h(x1, y)).toBeCloseTo(gridEdgeHeight(g, x1, y), 6);
    }
    // 网格节点上的边高度就是节点值
    expect(gridEdgeHeight(g, -800, -1000)).toBeCloseTo(g.heights[0]! * 0.1, 6);
  });

  it('离开网格 500 m 以后就是山脊场', () => {
    const g = grid();
    const [x0, y0, x1, y1] = gridRect(g);
    const h = makeOuterHeight(g, [x0, y0, x1, y1]);
    expect(h(300, y0 - 600)).toBeCloseTo(ridgeField(300, y0 - 600), 6);
  });

  it('Peak 观景台眼点下方 ≤ 405 m（相机在 430 mPD）', () => {
    expect(ridgeField(PEAK_EYE.x, PEAK_EYE.y)).toBeLessThanOrEqual(PEAK_EYE.maxGround);
    for (let a = 0; a < 6.28; a += 0.5) expect(ridgeField(PEAK_EYE.x + Math.cos(a) * 30, PEAK_EYE.y + Math.sin(a) * 30)).toBeLessThan(430);
  });

  it('山峰处接近给定高度，海旁是平地', () => {
    for (const s of SUMMITS) {
      const v = ridgeField(s.x, s.y);
      expect(v).toBeGreaterThan(s.h * 0.85);
      expect(v).toBeLessThan(s.h * 1.15);
    }
    expect(ridgeField(3000, 600)).toBeLessThan(10);
  });
});

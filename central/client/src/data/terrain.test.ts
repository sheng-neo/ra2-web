import { describe, expect, it } from 'vitest';
import { APRON_DM, apronFalloff, reliefGrid, reliefHeight } from './terrain';

describe('reliefGrid', () => {
  it('每 2 个节点取 1 个，保留原值；末行越界时取原网格边上的值', () => {
    // 5 × 4 节点、5 m：高度 = 10 × i + j
    const heights = Int16Array.from({ length: 20 }, (_, k) => 10 * (k % 5) + Math.floor(k / 5));
    const r = reliefGrid({ x0: -100, y0: 50, cell: 50, nx: 5, ny: 4, heights });
    expect([r.x0, r.y0, r.cell, r.nx, r.ny]).toEqual([-100, 50, 100, 3, 3]);
    expect([...r.heights]).toEqual([0, 20, 40, 2, 22, 42, 3, 23, 43]);
  });
});

describe('reliefHeight', () => {
  const grid = { x0: 0, y0: 0, cell: 100, nx: 2, ny: 2, heights: Int16Array.from([0, 10, 20, 50]) };
  const h = reliefHeight(grid);

  it('节点取原值，两个三角形内各自线性', () => {
    expect([h(0, 0), h(100, 0), h(0, 100), h(100, 100)]).toEqual([0, 10, 20, 50]);
    // 对角线下方三角形 (00, 10, 11)：(75, 25) → 0 + 0.75 × 10 + 0.25 × 40
    expect(h(75, 25)).toBeCloseTo(17.5);
    // 上方三角形 (00, 11, 01)：(25, 75) → 0 + 0.75 × 20 + 0.25 × 30
    expect(h(25, 75)).toBeCloseTo(22.5);
  });

  it('网格外：最近网格边的高度乘裙坡衰减，裙坡宽度外为 0', () => {
    expect(h(100 + APRON_DM / 2, 100)).toBeCloseTo(50 * apronFalloff(0.5));
    expect(h(50, -APRON_DM / 4)).toBeCloseTo(5 * apronFalloff(0.25));
    expect(h(-APRON_DM, 0)).toBe(0);
    expect(apronFalloff(0)).toBe(1);
    expect(apronFalloff(0.5)).toBeCloseTo(0.5);
  });
});

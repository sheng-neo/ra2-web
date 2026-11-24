import type { TerrainGrid } from '@central/data';
import { describe, expect, it } from 'vitest';
import { findElevated } from './terrain-elevated';

const CELL = 50;

function grid(nx: number, ny: number, f: (i: number, j: number) => number): { g: TerrainGrid; land: Uint8Array } {
  const heights = new Int16Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) heights[j * nx + i] = f(i, j);
  return { g: { x0: 0, y0: 0, cell: CELL, nx, ny, heights }, land: new Uint8Array(nx * ny).fill(1) };
}

/** 全陆地网格直接跑检查。 */
function onLand(nx: number, ny: number, f: (i: number, j: number) => number) {
  const { g, land } = grid(nx, ny, f);
  return findElevated(g, land);
}

describe('findElevated', () => {
  it('平地上一条 100 m 长、10 m 宽、高 6 m 的高架被找出来', () => {
    // 地面 4.5 mPD；高架沿东西向，j = 20–21，i = 10–29
    const r = onLand(40, 40, (i, j) => (j >= 20 && j <= 21 && i >= 10 && i < 30 ? 105 : 45));
    expect(r.clusters).toHaveLength(1);
    const c = r.clusters[0]!;
    expect(c.maxRiseDm).toBe(60);
    expect(c.lengthDm).toBeGreaterThanOrEqual(1000);
    expect(c.cells).toBe(40);
    expect(c.x).toBeCloseTo(19.5 * CELL, -1);
    expect(c.y).toBeCloseTo(20.5 * CELL, -1);
    expect(r.cells).toBe(40);
  });

  it('均匀山坡、挡土墙台阶都不算', () => {
    expect(onLand(40, 40, (_i, j) => 20 + j * 8).candidates).toBe(0);
    expect(onLand(40, 40, (i) => (i < 20 ? 40 : 140)).candidates).toBe(0);
  });

  it('短小的凸台只计 candidates，不报告', () => {
    // 15 m × 15 m 的平台高出 5 m
    const r = onLand(40, 40, (i, j) => (i >= 18 && i < 21 && j >= 18 && j < 21 ? 95 : 45));
    expect(r.candidates).toBeGreaterThan(0);
    expect(r.clusters).toHaveLength(0);
    expect(r.cells).toBe(0);
  });

  it('高地（两侧地面高于 30 mPD）不检查', () => {
    expect(onLand(40, 40, (i, j) => (j >= 20 && j <= 21 && i >= 10 && i < 30 ? 1060 : 1000)).candidates).toBe(0);
  });

  it('海面格既不检查也不当两侧地面', () => {
    // 码头伸进海里：两侧是海（高程 0、land=0），不能当“高出地面”
    const { g, land } = grid(40, 40, (i, j) => (i >= 19 && i <= 20 && j >= 10 ? 45 : 0));
    for (let k = 0; k < land.length; k++) land[k] = g.heights[k] ? 1 : 0;
    expect(findElevated(g, land).candidates).toBe(0);
  });
});

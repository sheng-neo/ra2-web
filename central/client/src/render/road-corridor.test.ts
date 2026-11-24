import { describe, expect, it } from 'vitest';
import type { Building, Road, TerrainGrid } from '@central/data';
import { reliefHeight } from '../data/terrain';
import { MAX_PUSH_DM, corridorHeights, footprintTest } from './road-corridor';
import { planRoads } from './roads';

/** 10 m 网格、向北每 10 m 升 1 m 的坡（横坡），一条向东的路横过坡面。 */
function slope(): TerrainGrid {
  const nx = 21;
  const ny = 21;
  const heights = new Int16Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) heights[j * nx + i] = 100 + j * 10;
  return { x0: 0, y0: 0, cell: 100, nx, ny, heights };
}

describe('corridorHeights（路廊下地形只压不抬，≤ 3 m）', () => {
  const grid = slope();
  const ground = reliefHeight(grid);
  const roads: Road[] = [{ id: 'r', cls: 'secondary', pts: [100, 1000, 1900, 1000], oneway: 0, lanes: 2 }];
  const plans = planRoads(roads, ground);
  const house: Building = {
    id: 'b',
    src: 'test',
    footprint: { outer: [900, 1050, 1100, 1050, 1100, 1150, 900, 1150] },
    base: 0,
    height: 100,
    heightSource: 'heuristic',
    kind: 'other',
    style: 0,
  };
  const out = corridorHeights(grid, plans, [house]);

  it('只往下压；楼外的节点最多 3 m', () => {
    for (let k = 0; k < out.length; k++) {
      expect(out[k]!).toBeLessThanOrEqual(grid.heights[k]!);
      if (k !== 11 * grid.nx + 10) expect(grid.heights[k]! - out[k]!).toBeLessThanOrEqual(MAX_PUSH_DM);
    }
  });

  it('路面横向水平后，路中线两侧路廊内的地形不高于路面', () => {
    const p = plans[0]!;
    expect(p.level).toBe(true);
    const i = 10; // x = 100 m
    const zc = p.zc[Math.floor(p.zc.length / 2)]!;
    // 中线所在行（y = 100 m）及上坡一侧路缘内的节点
    expect(out[10 * grid.nx + i]!).toBeLessThan(zc);
  });

  it('楼宇轮廓下的节点压到墙底（墙脚最低地面 − 0.5 m），跨轮廓的格子不再从楼内斜插出来盖住地铺', () => {
    // 楼南缘 y = 105 m 处地面 100 + 105 = 205 dm → 墙底 200 dm；楼内节点 (100 m, 110 m) 原高 210 dm
    expect(grid.heights[11 * grid.nx + 10]).toBe(210);
    expect(out[11 * grid.nx + 10]).toBe(200);
  });

  it('远离道路的节点不动', () => {
    expect(out[20 * grid.nx + 10]).toBe(grid.heights[20 * grid.nx + 10]);
    expect(out[0]).toBe(grid.heights[0]);
  });
});

describe('footprintTest（挡土墙取高遇楼即停）', () => {
  const b = (id: string, outer: number[]): Building => ({
    id,
    src: 'test',
    footprint: { outer },
    base: 0,
    height: 100,
    heightSource: 'heuristic',
    kind: 'other',
    style: 0,
  });
  // 一栋跨两个 50 m 分桶的 L 形楼 + 一栋远处的方楼
  const inside = footprintTest([b('l', [400, 0, 700, 0, 700, 100, 500, 100, 500, 300, 400, 300]), b('far', [-2000, -2000, -1900, -2000, -1900, -1900, -2000, -1900])]);
  it('轮廓内为真、凹口与外面为假', () => {
    expect(inside(450, 250)).toBe(true);
    expect(inside(650, 50)).toBe(true);
    expect(inside(600, 200)).toBe(false);
    expect(inside(800, 50)).toBe(false);
    expect(inside(-1950, -1950)).toBe(true);
    expect(inside(0, 0)).toBe(false);
  });
});

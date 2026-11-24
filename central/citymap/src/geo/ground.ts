/**
 * 地面高程查询（本地 dm → mPD dm）。管线里由 terrain.bin 的同一网格提供，
 * 楼和地标的「楼底」在源数据没有时取轮廓最低顶点处的地面。
 */
import { sampleTerrain, type TerrainGrid } from '@central/data';

export type GroundFn = (x: number, y: number) => number;

/** 网格上的双线性采样；网格外的点钳到最近的网格边（sampleTerrain 在网格外返回 0，会把边缘的楼底拉到海面）。 */
export function groundOf(grid: TerrainGrid): GroundFn {
  const maxX = grid.x0 + (grid.nx - 1) * grid.cell;
  const maxY = grid.y0 + (grid.ny - 1) * grid.cell;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  return (x, y) => sampleTerrain(grid, clamp(x, grid.x0, maxX), clamp(y, grid.y0, maxY));
}

/** 扁平环各顶点处地面高程的最小值（dm，取整）。 */
export function lowestGround(ring: readonly number[], ground: GroundFn): number {
  let low = Infinity;
  for (let i = 0; i + 1 < ring.length; i += 2) low = Math.min(low, ground(ring[i]!, ring[i + 1]!));
  return Number.isFinite(low) ? Math.round(low) : 0;
}

/**
 * 地形网格以外的山体与平地（纯函数，可测）：
 * - 在地形网格边上正好等于网格边的高度（与 STREETS 的地形网格无缝），往外 500 m 内平滑过渡到「山脊场」；
 * - 山脊场 = max(海旁平地 4 m, 南面整体坡, 各山峰圆锥) + 低频起伏；山峰位置为近似值（±300 m，只求剪影）；
 * - Peak 观景台眼点 (−492, −1260) 附近压到 ≤ 405 m（相机在 430 mPD）。
 * 坐标一律模拟米（x 东、y 北），高度 mPD 米。
 */
import type { TerrainGrid } from '@central/data';

export interface Summit {
  x: number;
  y: number;
  h: number;
}

/** 港岛山峰（近似）。 */
export const SUMMITS: readonly Summit[] = [
  { x: -966, y: -773, h: 552 }, // 太平山
  { x: -2254, y: -1426, h: 494 }, // 西高山
  { x: -471, y: -1969, h: 500 }, // 奇力山
  { x: 148, y: -1614, h: 479 }, // 歌赋山
  { x: 2240, y: -2246, h: 439 }, // 金马伦山
  { x: 3300, y: -2550, h: 430 }, // 聂高信山
  { x: 4700, y: -2650, h: 433 }, // 渣甸山
  { x: 5700, y: -2900, h: 436 }, // 毕拿山
  { x: -3600, y: 150, h: 269 }, // 摩星岭
  { x: -3300, y: -1700, h: 300 },
];

/** Peak 视点（模拟米）与该处地面上限（米）。 */
export const PEAK_EYE = { x: -491.5, y: -1259.9, maxGround: 405 } as const;

/** 山坡圆锥坡度（高 / 水平距离）。 */
const CONE_SLOPE = 0.42;
/** 网格边外过渡带宽度（米）。 */
const BLEND_M = 500;
/** 海旁平地高度（mPD）。 */
export const LOWLAND_M = 4;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** 山脊场（不含网格边过渡）。 */
export function ridgeField(x: number, y: number): number {
  let h = LOWLAND_M;
  // 南面整体坡：海旁 → 半山 → 山脊，东西两端（远离港岛中段）略低
  const along = smooth(-7000, -3500, x) * (1 - smooth(6500, 9000, x));
  h = Math.max(h, along * 330 * smooth(-150, -1900, y));
  for (const s of SUMMITS) {
    const r = Math.hypot(x - s.x, y - s.y);
    h = Math.max(h, s.h - CONE_SLOPE * r);
  }
  // 低频起伏（只在山上）
  if (h > 30) {
    const bump = Math.sin(x * 0.0041 + 1.3) * Math.sin(y * 0.0053 + 0.7) * 18 + Math.sin(x * 0.011 + y * 0.007) * 7;
    h += bump * smooth(30, 120, h);
  }
  // Peak 观景台附近压低（鞍部），保证眼点下方地面 ≤ 405 m
  const re = Math.hypot(x - PEAK_EYE.x, y - PEAK_EYE.y);
  if (re < 700) h = Math.min(h, PEAK_EYE.maxGround - 25 + re * 0.3);
  return h;
}

/** 网格边上的高度（米）：先把 (x, y) 夹到网格范围内，再在 relief 三角网上线性插值（与 data/terrain.reliefHeight 同一剖分）。 */
export function gridEdgeHeight(grid: TerrainGrid, x: number, y: number): number {
  const { x0, y0, cell, nx, ny, heights: hs } = grid;
  const gx0 = x0 * 0.1;
  const gy0 = y0 * 0.1;
  const c = cell * 0.1;
  const cx = Math.min(Math.max(x, gx0), gx0 + (nx - 1) * c);
  const cy = Math.min(Math.max(y, gy0), gy0 + (ny - 1) * c);
  const fx = (cx - gx0) / c;
  const fy = (cy - gy0) / c;
  const i = Math.min(Math.floor(fx), nx - 2);
  const j = Math.min(Math.floor(fy), ny - 2);
  const u = fx - i;
  const v = fy - j;
  const a = j * nx + i;
  const h00 = hs[a]!;
  const h11 = hs[a + nx + 1]!;
  const dm = u >= v ? h00 + u * (hs[a + 1]! - h00) + v * (h11 - hs[a + 1]!) : h00 + v * (hs[a + nx]! - h00) + u * (h11 - hs[a + nx]!);
  return dm * 0.1;
}

/** 网格范围（模拟米）：[x0, y0, x1, y1]。 */
export function gridRect(grid: TerrainGrid): [number, number, number, number] {
  return [grid.x0 * 0.1, grid.y0 * 0.1, (grid.x0 + (grid.nx - 1) * grid.cell) * 0.1, (grid.y0 + (grid.ny - 1) * grid.cell) * 0.1];
}

/**
 * 网格外地面高度函数（米）：洞（地形网格范围；没有网格时为数据 bbox）边上 = 网格高度（没有网格时 0），
 * 向外 BLEND_M 内过渡到山脊场。
 */
export function makeOuterHeight(grid: TerrainGrid | null, hole: readonly [number, number, number, number]): (x: number, y: number) => number {
  const [x0, y0, x1, y1] = hole;
  return (x, y) => {
    const dx = Math.max(x0 - x, 0, x - x1);
    const dy = Math.max(y0 - y, 0, y - y1);
    const d = Math.hypot(dx, dy);
    const edge = grid ? gridEdgeHeight(grid, x, y) : 0;
    const t = smooth(0, BLEND_M, d);
    return edge + (ridgeField(x, y) - edge) * t;
  };
}

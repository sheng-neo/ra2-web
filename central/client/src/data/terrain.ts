/**
 * 地面高程：全客户端只通过一个 HeightFn 取地面高度。
 * terrain.bin（5 m 网格）存在时，抽稀成 10 m 的渲染网格（relief）：地形网格按它三角化，
 * HeightFn 也在同一套三角形上线性插值——路面、电车轨、楼脚取到的高度与画出来的地面完全一致。
 * 数据不带地形来源（或 ?terrain=0）时用 0 mPD 平地。
 */
import { decodeTerrain, type CityMeta, type TerrainGrid } from '@central/data';
import { fetchData, type Progress } from './load-city';

/** 输入模拟坐标 (x, y)（dm），返回地面高程（dm，mPD）。 */
export type HeightFn = (x: number, y: number) => number;

export const flatGround: HeightFn = () => 0;

/** 渲染网格相对 terrain.bin 的抽稀倍数（5 m → 10 m）。 */
export const RELIEF_STEP = 2;

/** 网格外的裙坡宽度（dm）：从网格边上的高度平滑降到 0，避免数据范围边缘出现断崖。 */
export const APRON_DM = 8000;

/** 裙坡衰减：t = 离网格边距离 / APRON_DM，0 → 1，1 → 0，两端斜率为 0。 */
export function apronFalloff(t: number): number {
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * terrain.bin 网格 → 渲染网格：每 step 个节点取一个（保留原值，不平均）；
 * 最后一行/列若越过原网格，取原网格边上的值，保证覆盖范围不缩小。
 */
export function reliefGrid(grid: TerrainGrid, step = RELIEF_STEP): TerrainGrid {
  const nx = Math.ceil((grid.nx - 1) / step) + 1;
  const ny = Math.ceil((grid.ny - 1) / step) + 1;
  const heights = new Int16Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const sj = Math.min(j * step, grid.ny - 1);
    for (let i = 0; i < nx; i++) heights[j * nx + i] = grid.heights[sj * grid.nx + Math.min(i * step, grid.nx - 1)]!;
  }
  return { x0: grid.x0, y0: grid.y0, cell: grid.cell * step, nx, ny, heights };
}

/**
 * 在网格三角剖分上线性插值。每格沿 (i, j)–(i+1, j+1) 对角线分成两个三角形，
 * 与 render/ground.ts 的 reliefGeometry 一致。
 * 网格外：取最近网格边上的高度，按离网格的距离乘裙坡衰减（与 reliefGeometry 的裙坡同一规则）。
 */
export function reliefHeight(grid: TerrainGrid): HeightFn {
  const { x0, y0, cell, nx, ny, heights: h } = grid;
  const x1 = x0 + (nx - 1) * cell;
  const y1 = y0 + (ny - 1) * cell;
  const inside: HeightFn = (x, y) => {
    const fx = (x - x0) / cell;
    const fy = (y - y0) / cell;
    const i = Math.min(Math.floor(fx), nx - 2);
    const j = Math.min(Math.floor(fy), ny - 2);
    const u = fx - i;
    const v = fy - j;
    const a = j * nx + i;
    const h00 = h[a]!;
    const h11 = h[a + nx + 1]!;
    return u >= v ? h00 + u * (h[a + 1]! - h00) + v * (h11 - h[a + 1]!) : h00 + v * (h[a + nx]! - h00) + u * (h11 - h[a + nx]!);
  };
  return (x, y) => {
    const cx = Math.min(Math.max(x, x0), x1);
    const cy = Math.min(Math.max(y, y0), y1);
    if (cx === x && cy === y) return inside(x, y);
    return inside(cx, cy) * apronFalloff(Math.hypot(x - cx, y - cy) / APRON_DM);
  };
}

/**
 * 是否尝试下载 terrain.bin：URL ?terrain=1/0 优先；否则看 meta.sources 有没有高程数据源。
 * （不盲目请求，避免文件不存在时浏览器控制台报 404。）
 */
export function wantsTerrain(meta: CityMeta, params: URLSearchParams): boolean {
  const flag = params.get('terrain');
  if (flag === '1') return true;
  if (flag === '0') return false;
  return meta.sources.some((s) => /dtm|terrain|dem/i.test(s.id));
}

/**
 * 下载并解码 terrain.bin。失败直接抛错、不退回平地：地政总署楼底是绝对 mPD（山上可达近 500 m），
 * 没有地形时山坡上的楼会变成从海平面立起的柱子。真要看平地版请用 ?terrain=0。
 */
export async function loadTerrain(url: string, onProgress: Progress): Promise<TerrainGrid> {
  return decodeTerrain(await fetchData(url, onProgress));
}

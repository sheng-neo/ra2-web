/**
 * 山坡上的零星住宅 / 村屋灯点（realism C7）：树冠坡地上约 1–3 % 的面积有暖色灯点，靠近路的更密。
 * 用 GlowBatch 画（有最小像素尺寸），远看是稀疏的暖色小点，近看是单个光点。纯函数挑点，可测。
 */
import type { TerrainGrid } from '@central/data';
import { simToThree } from '../../coords';
import { hash32 } from './lamp-placement';

export interface HillLight {
  /** three 坐标（米）。 */
  p: [number, number, number];
  warm: boolean;
  intensity: number;
}

/** 基础概率（每 10 m 网格节点）与近路概率。 */
const P_BASE = 0.008;
const P_ROAD = 0.05;

/**
 * built(x, y) / lit(x, y)：模拟坐标（米）处的建成区 / 路灯照度遮罩（0–1）。
 * 只在树冠坡地（坡度 > ~6° 或海拔 > 60 m）且非建成区的节点上挑点。
 */
export function hillLights(
  grid: TerrainGrid,
  built: (x: number, y: number) => number,
  lit: (x: number, y: number) => number,
  limit = 1500,
): HillLight[] {
  const { x0, y0, cell, nx, ny, heights: h } = grid;
  const out: HillLight[] = [];
  const v = [0, 0, 0];
  for (let j = 1; j + 1 < ny && out.length < limit; j++) {
    for (let i = 1; i + 1 < nx && out.length < limit; i++) {
      const k = j * nx + i;
      const z = h[k]!;
      if (z <= 0) continue;
      const gx = (h[k + 1]! - h[k - 1]!) / (2 * cell);
      const gy = (h[k + nx]! - h[k - nx]!) / (2 * cell);
      const slope = Math.hypot(gx, gy);
      if (slope < 0.1 && z < 600) continue;
      const xm = (x0 + i * cell) / 10;
      const ym = (y0 + j * cell) / 10;
      if (built(xm, ym) > 0.3) continue;
      const r = hash32(k * 7919 + 17) / 4294967296;
      const near = lit(xm, ym) > 0.15;
      if (r >= (near ? P_ROAD : P_BASE)) continue;
      const jx = (hash32(k * 31 + 5) / 4294967296 - 0.5) * cell;
      const jy = (hash32(k * 37 + 9) / 4294967296 - 0.5) * cell;
      simToThree(x0 + i * cell + jx, y0 + j * cell + jy, z + 25, v);
      out.push({ p: [v[0]!, v[1]!, v[2]!], warm: hash32(k * 13 + 3) % 10 < 7, intensity: 2 + 3 * (hash32(k * 17 + 1) / 4294967296) });
    }
  }
  return out;
}

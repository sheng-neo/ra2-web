/**
 * R4 复审修正：电车走廊的临街墙（纯函数，有单元测试）。
 * 沿电车轨道的街墙在没有高清照片时（红线排除的面、没有照片的楼、LOW 档）不再挂程序招牌与直招牌：
 * 搭电车时一路看过去全是同一套白名单行业字灯箱（燒臘、找換、牙科……）与一排排直招牌「梳子」，比暗一点的铺面更假。
 */
import type { Rail } from '@central/data';

/** 墙离电车轨道中线多近算走廊墙（米）。 */
export const CORRIDOR_WALL_M = 30;

export interface TrackIndex {
  /** 线段 [x0, y0, x1, y1]（模拟坐标米）。 */
  segs: Float64Array;
  cell: number;
  grid: Map<number, number[]>;
}

const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);

/** 电车轨道（kind = 'tram'）→ 线段网格索引。Rail.pts 为 dm。 */
export function trackIndex(rails: readonly Rail[], cell = 40): TrackIndex {
  const s: number[] = [];
  for (const r of rails) {
    if (r.kind !== 'tram') continue;
    const p = r.pts;
    for (let i = 0; i + 3 < p.length; i += 2) s.push(p[i]! / 10, p[i + 1]! / 10, p[i + 2]! / 10, p[i + 3]! / 10);
  }
  const segs = Float64Array.from(s);
  const grid = new Map<number, number[]>();
  for (let k = 0; k < segs.length / 4; k++) {
    const x0 = Math.min(segs[k * 4]!, segs[k * 4 + 2]!);
    const x1 = Math.max(segs[k * 4]!, segs[k * 4 + 2]!);
    const y0 = Math.min(segs[k * 4 + 1]!, segs[k * 4 + 3]!);
    const y1 = Math.max(segs[k * 4 + 1]!, segs[k * 4 + 3]!);
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
      for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) {
        const kk = key(i, j);
        const l = grid.get(kk);
        if (l) l.push(k);
        else grid.set(kk, [k]);
      }
    }
  }
  return { segs, cell, grid };
}

/** 点 (x, y) 到最近轨道线段的距离与方向（单位向量，从点指向轨道）；maxM 内没有轨道返回 null。 */
export function nearestTrack(ix: TrackIndex, x: number, y: number, maxM: number): { d: number; dx: number; dy: number } | null {
  let best = Infinity;
  let bx = 0;
  let by = 0;
  const c = ix.cell;
  for (let i = Math.floor((x - maxM) / c); i <= Math.floor((x + maxM) / c); i++) {
    for (let j = Math.floor((y - maxM) / c); j <= Math.floor((y + maxM) / c); j++) {
      for (const k of ix.grid.get(key(i, j)) ?? []) {
        const ax = ix.segs[k * 4]!;
        const ay = ix.segs[k * 4 + 1]!;
        const ex = ix.segs[k * 4 + 2]! - ax;
        const ey = ix.segs[k * 4 + 3]! - ay;
        const L2 = ex * ex + ey * ey;
        const t = L2 > 1e-9 ? Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / L2)) : 0;
        const px = ax + ex * t;
        const py = ay + ey * t;
        const d = Math.hypot(px - x, py - y);
        if (d < best) {
          best = d;
          bx = px;
          by = py;
        }
      }
    }
  }
  if (best > maxM) return null;
  return best > 1e-6 ? { d: best, dx: (bx - x) / best, dy: (by - y) / best } : { d: 0, dx: 0, dy: 0 };
}

/** 墙段（模拟坐标米，外法线 nx, ny）是不是面向电车轨道的走廊墙：中点离轨道 ≤ maxM、外法线与「墙 → 轨道」夹角 ≤ 约 70°。 */
export function isCorridorWall(ix: TrackIndex, x0: number, y0: number, x1: number, y1: number, nx: number, ny: number, maxM = CORRIDOR_WALL_M): boolean {
  const n = nearestTrack(ix, (x0 + x1) / 2, (y0 + y1) / 2, maxM);
  if (!n) return false;
  return n.d < 1 || n.dx * nx + n.dy * ny > 0.34;
}

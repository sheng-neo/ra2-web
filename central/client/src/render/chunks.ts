/**
 * 渲染分块：128 m 网格（PLAN §5）。每个对象按一个代表点归入唯一一块：
 * 建筑用轮廓面积质心，道路/轨道用折线弧长中点。
 * 块再按 REGION_CHUNKS × REGION_CHUNKS 合成「区」：远处整区一次绘制，近处拆回逐块剔除。
 */
import type { Building, FlatXY } from '@central/data';
import { polylineMidpoint, ringCentroid } from '../geom/ring';

/** 块边长（dm）。 */
export const CHUNK_DM = 1280;
/** 每区边长包含的块数。 */
export const REGION_CHUNKS = 4;

export interface ChunkCoord {
  cx: number;
  cy: number;
}

export function chunkOf(x: number, y: number): ChunkCoord {
  return { cx: Math.floor(x / CHUNK_DM), cy: Math.floor(y / CHUNK_DM) };
}

export function chunkKey(c: ChunkCoord): string {
  return `${c.cx},${c.cy}`;
}

export function regionOf(c: ChunkCoord): ChunkCoord {
  return { cx: Math.floor(c.cx / REGION_CHUNKS), cy: Math.floor(c.cy / REGION_CHUNKS) };
}

export function buildingChunk(b: Pick<Building, 'footprint'>): ChunkCoord {
  const [x, y] = ringCentroid(b.footprint.outer);
  return chunkOf(x, y);
}

export function polylineChunk(pts: FlatXY): ChunkCoord {
  const m = polylineMidpoint(pts);
  return chunkOf(m.x, m.y);
}

/** 块的模拟坐标范围（dm）：[minX, minY, maxX, maxY]。 */
export function chunkBounds(c: ChunkCoord, size = CHUNK_DM): [number, number, number, number] {
  return [c.cx * size, c.cy * size, (c.cx + 1) * size, (c.cy + 1) * size];
}

/** 按块分组，保持输入顺序；返回的 Map 键为 chunkKey。 */
export function groupByChunk<T>(items: readonly T[], chunk: (item: T) => ChunkCoord): Map<string, { coord: ChunkCoord; items: T[] }> {
  const out = new Map<string, { coord: ChunkCoord; items: T[] }>();
  for (const it of items) {
    const c = chunk(it);
    const k = chunkKey(c);
    let g = out.get(k);
    if (!g) {
      g = { coord: c, items: [] };
      out.set(k, g);
    }
    g.items.push(it);
  }
  return out;
}

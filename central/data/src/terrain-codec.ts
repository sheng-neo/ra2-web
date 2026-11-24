/**
 * terrain.bin 编解码与采样（格式见 schema.ts 的 TERRAIN_* 注释）。
 * 管线写、客户端读，两边共用这一份实现。
 * TODO(M0-terrain)：由地形任务实现并补测试。
 */
import type { TerrainGrid } from './schema';

export function encodeTerrain(_grid: TerrainGrid): Uint8Array {
  throw new Error('encodeTerrain: not implemented');
}

export function decodeTerrain(_bytes: ArrayBuffer | Uint8Array): TerrainGrid {
  throw new Error('decodeTerrain: not implemented');
}

/** 双线性采样，返回高程 dm；网格外返回 0（海面）。x/y 为本地 dm。 */
export function sampleTerrain(_grid: TerrainGrid, _x: number, _y: number): number {
  throw new Error('sampleTerrain: not implemented');
}

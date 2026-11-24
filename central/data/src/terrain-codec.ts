/**
 * terrain.bin 编解码与采样（格式见 schema.ts 的 TERRAIN_* 注释）。
 * 管线写、客户端读，两边共用这一份实现。一律经 DataView 读写，与宿主字节序无关。
 */
import { TERRAIN_HEADER_BYTES, TERRAIN_MAGIC, TERRAIN_VERSION, type TerrainGrid } from './schema';

const U16_MAX = 0xffff;

function assertU16(name: string, v: number, min: number): void {
  if (!Number.isInteger(v) || v < min || v > U16_MAX) throw new Error(`terrain: ${name}=${v} 超出 uint16 [${min}, ${U16_MAX}]`);
}

function assertI32(name: string, v: number): void {
  if (!Number.isInteger(v) || v < -0x80000000 || v > 0x7fffffff) throw new Error(`terrain: ${name}=${v} 不是 int32`);
}

/** TerrainGrid → terrain.bin 字节。网格参数越界或高程长度不符时抛错。 */
export function encodeTerrain(grid: TerrainGrid): Uint8Array {
  const { x0, y0, cell, nx, ny, heights } = grid;
  assertI32('x0', x0);
  assertI32('y0', y0);
  assertU16('cell', cell, 1);
  assertU16('nx', nx, 1);
  assertU16('ny', ny, 1);
  const n = nx * ny;
  if (heights.length !== n) throw new Error(`terrain: heights 长度 ${heights.length}，应为 nx*ny=${n}`);

  const out = new Uint8Array(TERRAIN_HEADER_BYTES + 2 * n);
  const dv = new DataView(out.buffer);
  for (let k = 0; k < 4; k++) out[k] = TERRAIN_MAGIC.charCodeAt(k);
  dv.setUint16(4, TERRAIN_VERSION, true);
  dv.setUint16(6, 0, true);
  dv.setInt32(8, x0, true);
  dv.setInt32(12, y0, true);
  dv.setUint16(16, cell, true);
  dv.setUint16(18, nx, true);
  dv.setUint16(20, ny, true);
  dv.setUint16(22, 0, true);
  for (let k = 0; k < n; k++) dv.setInt16(TERRAIN_HEADER_BYTES + 2 * k, heights[k]!, true);
  return out;
}

/** terrain.bin 字节 → TerrainGrid（heights 是独立拷贝）。魔数、版本、长度不对时抛错。 */
export function decodeTerrain(bytes: ArrayBuffer | Uint8Array): TerrainGrid {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.byteLength < TERRAIN_HEADER_BYTES) throw new Error(`terrain: 只有 ${u8.byteLength} 字节，不足文件头`);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const magic = String.fromCharCode(u8[0]!, u8[1]!, u8[2]!, u8[3]!);
  if (magic !== TERRAIN_MAGIC) throw new Error(`terrain: 魔数 '${magic}' 不是 '${TERRAIN_MAGIC}'`);
  const version = dv.getUint16(4, true);
  if (version !== TERRAIN_VERSION) throw new Error(`terrain: 不支持的版本 ${version}`);

  const x0 = dv.getInt32(8, true);
  const y0 = dv.getInt32(12, true);
  const cell = dv.getUint16(16, true);
  const nx = dv.getUint16(18, true);
  const ny = dv.getUint16(20, true);
  if (cell === 0 || nx === 0 || ny === 0) throw new Error(`terrain: 网格参数为 0（cell=${cell} nx=${nx} ny=${ny}）`);
  const n = nx * ny;
  const expected = TERRAIN_HEADER_BYTES + 2 * n;
  if (u8.byteLength !== expected) throw new Error(`terrain: 长度 ${u8.byteLength} 字节，应为 ${expected}`);

  const heights = new Int16Array(n);
  for (let k = 0; k < n; k++) heights[k] = dv.getInt16(TERRAIN_HEADER_BYTES + 2 * k, true);
  return { x0, y0, cell, nx, ny, heights };
}

/**
 * 双线性采样，返回高程 dm（浮点，不取整）；网格外（含 NaN）返回 0（海面）。x/y 为本地 dm。
 * 网格覆盖 [x0, x0 + (nx-1)*cell] × [y0, y0 + (ny-1)*cell]，边界上的点算网格内。
 */
export function sampleTerrain(grid: TerrainGrid, x: number, y: number): number {
  const { x0, y0, cell, nx, ny, heights } = grid;
  const fx = (x - x0) / cell;
  const fy = (y - y0) / cell;
  // 写成取反比较，NaN 也落到“网格外”
  if (!(fx >= 0 && fy >= 0 && fx <= nx - 1 && fy <= ny - 1)) return 0;
  const i = Math.min(Math.floor(fx), Math.max(nx - 2, 0));
  const j = Math.min(Math.floor(fy), Math.max(ny - 2, 0));
  const i1 = Math.min(i + 1, nx - 1);
  const j1 = Math.min(j + 1, ny - 1);
  const tx = fx - i;
  const ty = fy - j;
  const r0 = j * nx;
  const r1 = j1 * nx;
  const h00 = heights[r0 + i]!;
  const h10 = heights[r0 + i1]!;
  const h01 = heights[r1 + i]!;
  const h11 = heights[r1 + i1]!;
  const a = h00 + (h10 - h00) * tx;
  const b = h01 + (h11 - h01) * tx;
  return a + (b - a) * ty;
}

import { describe, expect, it } from 'vitest';
import { TERRAIN_HEADER_BYTES, type TerrainGrid } from './schema';
import { decodeTerrain, encodeTerrain, sampleTerrain } from './terrain-codec';

/** nx×ny 网格，高程由 f(i, j) 给出。 */
function makeGrid(x0: number, y0: number, cell: number, nx: number, ny: number, f: (i: number, j: number) => number): TerrainGrid {
  const heights = new Int16Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) heights[j * nx + i] = f(i, j);
  return { x0, y0, cell, nx, ny, heights };
}

describe('terrain.bin 编解码', () => {
  const grid = makeGrid(-8150, -9850, 50, 5, 3, (i, j) => (j * 5 + i) * 37 - 200);

  it('往返一致', () => {
    const back = decodeTerrain(encodeTerrain(grid));
    expect(back).toEqual({ ...grid, heights: back.heights });
    expect(Array.from(back.heights)).toEqual(Array.from(grid.heights));
  });

  it('文件头逐字节符合 schema（小端）', () => {
    const b = encodeTerrain(grid);
    expect(b.byteLength).toBe(TERRAIN_HEADER_BYTES + 2 * 5 * 3);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    expect(String.fromCharCode(...b.subarray(0, 4))).toBe('CTER');
    expect(dv.getUint16(4, true)).toBe(1);
    expect(dv.getUint16(6, true)).toBe(0);
    expect(dv.getInt32(8, true)).toBe(-8150);
    expect(dv.getInt32(12, true)).toBe(-9850);
    expect(dv.getUint16(16, true)).toBe(50);
    expect(dv.getUint16(18, true)).toBe(5);
    expect(dv.getUint16(20, true)).toBe(3);
    expect(dv.getUint16(22, true)).toBe(0);
    // 第一个高程 -200 = 0xFF38，小端先低字节
    expect([b[24], b[25]]).toEqual([0x38, 0xff]);
    // index = j*nx + i：(i=1, j=2) → 第 11 个样本
    expect(dv.getInt16(TERRAIN_HEADER_BYTES + 2 * 11, true)).toBe(11 * 37 - 200);
  });

  it('x0 负数按 int32 补码写入', () => {
    const b = encodeTerrain(makeGrid(-1, 0, 1, 1, 1, () => 0));
    expect(Array.from(b.subarray(8, 12))).toEqual([0xff, 0xff, 0xff, 0xff]);
  });

  it('手写的小端字节能解码', () => {
    const b = new Uint8Array(TERRAIN_HEADER_BYTES + 4);
    b.set([0x43, 0x54, 0x45, 0x52, 1, 0, 0, 0]); // 'CTER' v1
    b.set([0x10, 0x27, 0, 0], 8); // x0 = 10000
    b.set([0xf0, 0xd8, 0xff, 0xff], 12); // y0 = -10000
    b.set([20, 0, 2, 0, 1, 0, 0, 0], 16); // cell=20 nx=2 ny=1
    b.set([0x02, 0x01, 0xfe, 0xff], 24); // 0x0102=258, -2
    const g = decodeTerrain(b);
    expect([g.x0, g.y0, g.cell, g.nx, g.ny]).toEqual([10000, -10000, 20, 2, 1]);
    expect(Array.from(g.heights)).toEqual([258, -2]);
  });

  it('接受 ArrayBuffer 与带奇数偏移的 Uint8Array 视图', () => {
    const b = encodeTerrain(grid);
    const ab = new Uint8Array(b).buffer;
    expect(ab).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(decodeTerrain(ab).heights)).toEqual(Array.from(grid.heights));
    const padded = new Uint8Array(b.byteLength + 3);
    padded.set(b, 1);
    expect(Array.from(decodeTerrain(padded.subarray(1, 1 + b.byteLength)).heights)).toEqual(Array.from(grid.heights));
  });

  it('解码得到独立拷贝，不与输入共享内存', () => {
    const b = encodeTerrain(grid);
    const g = decodeTerrain(b);
    b[TERRAIN_HEADER_BYTES] = 0x7f;
    expect(g.heights[0]).toBe(-200);
  });

  it('坏输入抛错', () => {
    const b = encodeTerrain(grid);
    expect(() => decodeTerrain(b.subarray(0, 10))).toThrow(/文件头/);
    expect(() => decodeTerrain(b.subarray(0, b.byteLength - 2))).toThrow(/长度/);
    expect(() => decodeTerrain(new Uint8Array([...b, 0, 0]))).toThrow(/长度/);
    const badMagic = b.slice();
    badMagic[0] = 0x58;
    expect(() => decodeTerrain(badMagic)).toThrow(/魔数/);
    const badVersion = b.slice();
    badVersion[4] = 2;
    expect(() => decodeTerrain(badVersion)).toThrow(/版本/);
    const zeroCell = b.slice();
    zeroCell[16] = 0;
    expect(() => decodeTerrain(zeroCell)).toThrow(/为 0/);
  });

  it('编码前校验参数', () => {
    expect(() => encodeTerrain({ ...grid, heights: new Int16Array(4) })).toThrow(/长度/);
    expect(() => encodeTerrain({ ...grid, nx: 70000, heights: new Int16Array(70000 * 3) })).toThrow(/nx/);
    expect(() => encodeTerrain({ ...grid, cell: 0 })).toThrow(/cell/);
    expect(() => encodeTerrain({ ...grid, x0: 1.5 })).toThrow(/x0/);
    expect(() => encodeTerrain({ ...grid, y0: 2 ** 31 })).toThrow(/y0/);
  });
});

describe('sampleTerrain 双线性采样', () => {
  // 平面 h = 3i + 5j（整数），双线性对平面精确
  const plane = makeGrid(1000, -2000, 50, 4, 3, (i, j) => 30 * i + 50 * j);
  const planeAt = (x: number, y: number) => (30 * (x - 1000)) / 50 + (50 * (y + 2000)) / 50;

  it('四个角点与网格点取原值', () => {
    expect(sampleTerrain(plane, 1000, -2000)).toBe(0);
    expect(sampleTerrain(plane, 1150, -2000)).toBe(90);
    expect(sampleTerrain(plane, 1000, -1900)).toBe(100);
    expect(sampleTerrain(plane, 1150, -1900)).toBe(190);
    expect(sampleTerrain(plane, 1050, -1950)).toBe(80);
  });

  it('格内与中心点线性插值', () => {
    for (const [x, y] of [[1075, -1950], [1012.5, -1987.5], [1149, -1901], [1001, -1999]] as const) {
      expect(sampleTerrain(plane, x, y)).toBeCloseTo(planeAt(x, y), 9);
    }
  });

  it('单元内是真正的双线性（非平面）', () => {
    const g = makeGrid(0, 0, 10, 2, 2, (i, j) => (i === 1 && j === 1 ? 100 : 0));
    expect(sampleTerrain(g, 5, 5)).toBe(25);
    expect(sampleTerrain(g, 10, 5)).toBe(50);
    expect(sampleTerrain(g, 2.5, 7.5)).toBeCloseTo(100 * 0.25 * 0.75, 9);
  });

  it('网格外（含刚越界与 NaN）返回 0', () => {
    expect(sampleTerrain(plane, 999.9, -1950)).toBe(0);
    expect(sampleTerrain(plane, 1150.1, -1950)).toBe(0);
    expect(sampleTerrain(plane, 1050, -2000.1)).toBe(0);
    expect(sampleTerrain(plane, 1050, -1899.9)).toBe(0);
    expect(sampleTerrain(plane, -1e9, 1e9)).toBe(0);
    expect(sampleTerrain(plane, Number.NaN, -1950)).toBe(0);
  });

  it('单行/单列网格退化为线性插值', () => {
    const row = makeGrid(0, 0, 10, 3, 1, (i) => i * 100);
    expect(sampleTerrain(row, 15, 0)).toBe(150);
    expect(sampleTerrain(row, 15, 1)).toBe(0);
    const one = makeGrid(0, 0, 10, 1, 1, () => 42);
    expect(sampleTerrain(one, 0, 0)).toBe(42);
    expect(sampleTerrain(one, 0.1, 0)).toBe(0);
  });

  it('负高程照常插值', () => {
    const g = makeGrid(0, 0, 10, 2, 1, (i) => (i === 0 ? -24 : 0));
    expect(sampleTerrain(g, 5, 0)).toBe(-12);
  });
});

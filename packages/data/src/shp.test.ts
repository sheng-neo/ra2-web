import { describe, expect, it } from 'vitest';
import { parseShp } from './shp';

/** 手工构造 2 帧 SHP：帧0 原始格式 2×2；帧1 RLE-zero 4×2；帧2 空帧。 */
function buildShp(): Uint8Array {
  const frame0 = [1, 2, 3, 4];
  // RLE 行：行1 = [05 00] 即 5,然后 0×? 错——构造： 像素行 [5,0,0,6]: 字节 05 00 02 06；行2 [0,0,0,0]: 字节 00 04
  const line1 = [5, 0, 2, 6];
  const line2 = [0, 4];
  const headerSize = 8 + 3 * 24;
  const f0Off = headerSize;
  const f1Off = f0Off + frame0.length;
  const total = f1Off + (2 + line1.length) + (2 + line2.length);
  const buf = new Uint8Array(total);
  const v = new DataView(buf.buffer);
  // 文件头
  v.setUint16(0, 0, true);
  v.setUint16(2, 4, true); // 画布宽
  v.setUint16(4, 2, true); // 画布高
  v.setUint16(6, 3, true); // 帧数
  // 帧0：raw（compression 0）
  let o = 8;
  v.setInt16(o, 1, true); v.setInt16(o + 2, 0, true);
  v.setInt16(o + 4, 2, true); v.setInt16(o + 6, 2, true);
  v.setInt32(o + 8, 0, true);
  v.setInt32(o + 20, f0Off, true);
  // 帧1：RLE-zero（compression 3），4×2
  o = 8 + 24;
  v.setInt16(o, 0, true); v.setInt16(o + 2, 1, true);
  v.setInt16(o + 4, 4, true); v.setInt16(o + 6, 2, true);
  v.setInt32(o + 8, 3, true);
  v.setInt32(o + 20, f1Off, true);
  // 帧2：空帧（offset 0）
  o = 8 + 48;
  v.setInt16(o + 4, 0, true); v.setInt16(o + 6, 0, true);
  // 数据
  buf.set(frame0, f0Off);
  let p = f1Off;
  v.setUint16(p, 2 + line1.length, true);
  buf.set(line1, p + 2);
  p += 2 + line1.length;
  v.setUint16(p, 2 + line2.length, true);
  buf.set(line2, p + 2);
  return buf;
}

describe('parseShp', () => {
  const shp = parseShp(buildShp());

  it('文件头', () => {
    expect(shp.width).toBe(4);
    expect(shp.height).toBe(2);
    expect(shp.frames.length).toBe(3);
  });

  it('原始帧像素', () => {
    expect(Array.from(shp.frames[0]!.pixels)).toEqual([1, 2, 3, 4]);
    expect(shp.frames[0]!.x).toBe(1);
  });

  it('RLE-zero 帧解码', () => {
    // 行1: 5, [0×2], 6 → [5,0,0,6]；行2: [0×4]
    expect(Array.from(shp.frames[1]!.pixels)).toEqual([5, 0, 0, 6, 0, 0, 0, 0]);
  });

  it('空帧', () => {
    expect(shp.frames[2]!.pixels.length).toBe(0);
  });

  it('拒绝非 SHP', () => {
    const bad = new Uint8Array(8);
    bad[0] = 7;
    expect(() => parseShp(bad)).toThrow();
  });
});

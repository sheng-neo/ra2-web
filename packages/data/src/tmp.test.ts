import { describe, expect, it } from 'vitest';
import { parseTmp } from './tmp';

/** 构造单块 8×4 TMP：菱形行宽 4,8 / 4,0，共 16 像素。 */
function buildTmp(): Uint8Array {
  const cx = 8;
  const cy = 4;
  const diamond = cx * cy / 2; // 16
  const blockOff = 16 + 4; // 头 + 1 个偏移
  const buf = new Uint8Array(blockOff + 52 + diamond);
  const v = new DataView(buf.buffer);
  v.setInt32(0, 1, true);
  v.setInt32(4, 1, true);
  v.setInt32(8, cx, true);
  v.setInt32(12, cy, true);
  v.setInt32(16, blockOff, true);
  // 块头
  v.setInt32(blockOff, -30, true); // x
  v.setInt32(blockOff + 4, 15, true); // y
  v.setUint32(blockOff + 36, 0, true); // flags
  v.setInt8(blockOff + 40, 2); // height
  v.setInt8(blockOff + 41, 1); // terrain
  v.setInt8(blockOff + 42, 0); // ramp
  buf[blockOff + 43] = 10; buf[blockOff + 44] = 20; buf[blockOff + 45] = 30;
  buf[blockOff + 46] = 40; buf[blockOff + 47] = 50; buf[blockOff + 48] = 60;
  // 菱形数据：行宽 4, 8, 4, 0，填 1..16
  for (let i = 0; i < diamond; i++) buf[blockOff + 52 + i] = i + 1;
  return buf;
}

describe('parseTmp', () => {
  const tmp = parseTmp(buildTmp());

  it('文件头与块头', () => {
    expect(tmp.blocksX).toBe(1);
    expect(tmp.blockWidth).toBe(8);
    expect(tmp.blockHeight).toBe(4);
    const b = tmp.blocks[0]!;
    expect(b.x).toBe(-30);
    expect(b.y).toBe(15);
    expect(b.height).toBe(2);
    expect(b.terrainType).toBe(1);
    expect(b.radarLeft).toEqual([10, 20, 30]);
    expect(b.radarRight).toEqual([40, 50, 60]);
  });

  it('菱形像素展开到矩形（行宽 4,8,4,0，行起点 2,0,2,4）', () => {
    const p = tmp.blocks[0]!.pixels;
    // 行0：x=2 起 4 像素 = 1,2,3,4
    expect(Array.from(p.subarray(0, 8))).toEqual([0, 0, 1, 2, 3, 4, 0, 0]);
    // 行1：x=0 起 8 像素 = 5..12
    expect(Array.from(p.subarray(8, 16))).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    // 行2：x=2 起 4 像素 = 13..16
    expect(Array.from(p.subarray(16, 24))).toEqual([0, 0, 13, 14, 15, 16, 0, 0]);
    // 行3：空
    expect(Array.from(p.subarray(24, 32))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('空块（偏移 0）为 null', () => {
    const cx = 8, cy = 4;
    const buf = new Uint8Array(16 + 8);
    const v = new DataView(buf.buffer);
    v.setInt32(0, 2, true);
    v.setInt32(4, 1, true);
    v.setInt32(8, cx, true);
    v.setInt32(12, cy, true);
    v.setInt32(16, 0, true);
    v.setInt32(20, 0, true);
    const t = parseTmp(buf);
    expect(t.blocks).toEqual([null, null]);
  });

  it('拒绝非 TMP', () => {
    expect(() => parseTmp(new Uint8Array(16))).toThrow();
  });
});

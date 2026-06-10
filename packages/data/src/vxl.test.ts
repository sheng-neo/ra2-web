import { describe, expect, it } from 'vitest';
import { parseVxl } from './vxl';

/** 构造最小合法 VXL：1 节、2×2×2、几个体素。 */
function buildVxl(): Uint8Array {
  const limbCount = 1;
  const sizeX = 2;
  const sizeY = 2;
  const sizeZ = 1;
  const baseSize = sizeX * sizeY;

  // body：每列 colStart(i32)[baseSize] + colEnd(i32)[baseSize] + span 数据
  // 给列 0 一个体素（z=0），其余列空
  const spanCol0 = [0, 1, 5, 2, 0]; // skip0, count1, color5 normal2, end0
  const colStart = new Int32Array(baseSize).fill(-1);
  colStart[0] = 0;
  const colEnd = new Int32Array(baseSize).fill(-1);
  colEnd[0] = spanCol0.length;
  const bodyArr = [
    ...new Uint8Array(colStart.buffer),
    ...new Uint8Array(colEnd.buffer),
    ...spanCol0,
  ];
  const bodySize = bodyArr.length;

  const HEADER = 802;
  const total = HEADER + 28 * limbCount + bodySize + 92 * limbCount;
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  const enc = new TextEncoder();
  buf.set(enc.encode('Voxel Animation\0'), 0);
  dv.setUint32(16, 0, true);
  dv.setUint32(20, limbCount, true);
  dv.setUint32(24, 0, true);
  dv.setUint32(28, bodySize, true);
  // 调色板：索引5 = (10,20,30)*? 6bit → 设原始 6bit 值
  buf[32 + 5 * 3] = 10;
  buf[32 + 5 * 3 + 1] = 20;
  buf[32 + 5 * 3 + 2] = 30;
  // 节头名
  buf.set(enc.encode('BODY'), HEADER);
  // body
  buf.set(bodyArr, HEADER + 28 * limbCount);
  // 节尾
  const fo = HEADER + 28 * limbCount + bodySize;
  dv.setUint32(fo, 0, true); // dataOffset
  dv.setFloat32(fo + 12, 0.1, true); // scale
  // 变换矩阵 12 float（fo+16..），包围盒 6 float（fo+64..）
  for (let i = 0; i < 6; i++) dv.setFloat32(fo + 64 + i * 4, i, true);
  buf[fo + 88] = sizeX;
  buf[fo + 89] = sizeY;
  buf[fo + 90] = sizeZ;
  buf[fo + 91] = 2; // normalType TS
  return buf;
}

describe('parseVxl', () => {
  const vxl = parseVxl(buildVxl());

  it('解析头与节', () => {
    expect(vxl.sections.length).toBe(1);
    const s = vxl.sections[0]!;
    expect(s.name).toBe('BODY');
    expect([s.sizeX, s.sizeY, s.sizeZ]).toEqual([2, 2, 1]);
    expect(s.normalType).toBe(2);
    expect(s.scale).toBeCloseTo(0.1, 3);
  });

  it('解出体素与颜色索引', () => {
    const s = vxl.sections[0]!;
    expect(s.voxels.length).toBe(1);
    expect(s.voxels[0]).toMatchObject({ x: 0, y: 0, z: 0, color: 5, normal: 2 });
  });

  it('调色板 6bit→8bit', () => {
    expect(vxl.palette[5 * 4]).toBe(40); // 10<<2
    expect(vxl.palette[5 * 4 + 1]).toBe(80); // 20<<2
    expect(vxl.palette[5 * 4 + 2]).toBe(120); // 30<<2
  });

  it('拒绝坏魔数', () => {
    expect(() => parseVxl(new Uint8Array(900))).toThrow();
  });
});

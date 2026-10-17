// sim/terrain/slope.test.ts —— spec:terrain §2.5.4 数据级四条验收 + 角点编解码 + 与契约 rotation 同源（WORKPLAN WP2）。
import { describe, expect, it } from 'vitest';
import { CORNER_SIZE, Dir } from '../../contracts/grid';
import * as rot from '../../contracts/rotation';
import {
  CORNERS_TO_SLOPE, DIR_ROT_CCW, SLOPE_CORNERS, SLOPE_ROT_CCW, SLOPE_ROT_CW, XTER_STREAM_ROT_CCW,
  cornerIndex, cornersOf, isUndefinedXter, rotateXter, shapeFromLandBits, slopeCodeOf, tileFromCorners,
} from './slope';

describe('terrain slope：spec §2.5.4 数据级验收', () => {
  it('(1) 置换表 = 角点重命名：rot = (b<<3)|(y<<2)|(a<<1)|x，CORNERS_TO_SLOPE[rot] === SLOPE_ROT_CCW[code]', () => {
    for (let code = 0; code <= 13; code++) {
      const bits = SLOPE_CORNERS[code]!;
      const a = (bits >> 3) & 1, b = (bits >> 2) & 1, x = (bits >> 1) & 1, y = bits & 1;
      const rotBits = (b << 3) | (y << 2) | (a << 1) | x;
      expect(CORNERS_TO_SLOPE[rotBits], `code ${code}`).toBe(SLOPE_ROT_CCW[code]);
    }
  });
  it('(2) 周期 4 与逆：连续 4 次恒等；SLOPE_ROT_CW[SLOPE_ROT_CCW[c]] === c；rotateXter 对全部已定义码 4 次恒等', () => {
    for (let c = 0; c <= 13; c++) {
      let v = c;
      for (let k = 0; k < 4; k++) v = SLOPE_ROT_CCW[v]!;
      expect(v).toBe(c);
      expect(SLOPE_ROT_CW[SLOPE_ROT_CCW[c]!]).toBe(c);
      expect(SLOPE_ROT_CCW[SLOPE_ROT_CW[c]!]).toBe(c);
    }
    for (let code = 0; code <= 0x45; code++) {
      if (isUndefinedXter(code)) continue;
      expect(rotateXter(code, 0)).toBe(code);
      expect(rotateXter(rotateXter(code, 1), 3)).toBe(code);
      let v = code;
      for (let k = 0; k < 4; k++) v = rotateXter(v, 1);
      expect(v).toBe(code);
    }
    expect(rotateXter(0x3e, 1)).toBe(0x3e);
    expect(rotateXter(0x0d, 1)).toBe(0x0d);
  });
  it('(3) 溪流 / 水湾：BAY_CODE[DIR_ROT_CCW[BAY_DIR[c]]] === XTER_STREAM_ROT_CCW[c]；0x40 ↔ 0x41', () => {
    const BAY_DIR: Record<number, Dir> = { 0x42: Dir.B, 0x43: Dir.L, 0x44: Dir.T, 0x45: Dir.R };
    const BAY_CODE: Record<number, number> = { [Dir.B]: 0x42, [Dir.L]: 0x43, [Dir.T]: 0x44, [Dir.R]: 0x45 };
    for (const c of [0x42, 0x43, 0x44, 0x45]) expect(XTER_STREAM_ROT_CCW[c]).toBe(BAY_CODE[DIR_ROT_CCW[BAY_DIR[c]!]!]);
    expect(XTER_STREAM_ROT_CCW[0x40]).toBe(0x41);
    expect(XTER_STREAM_ROT_CCW[0x41]).toBe(0x40);
  });
  it('(4) 与路网坡件一致：道路 / 电线 / 铁路 / 铁路半高 / 高速坡件在旋转后保持 nibble ↔ 片段对应', () => {
    const edgeNibbles = [1, 2, 3, 4] as const;
    const netFamilies = [0x1d, 0x0e, 0x2c];                      // 道路 / 电线 / 铁路：坡件 = base + {1:2, 2:3, 3:4, 4:5}
    for (const base of netFamilies) {
      const piece = (n: number): number => base + 1 + n;
      for (const n of edgeNibbles) expect(piece(SLOPE_ROT_CCW[n]!), `base 0x${base.toString(16)} n=${n}`).toBe(rot.XBLD_ROT_CCW[piece(n)]);
    }
    const highway = (n: number): number => 0x60 + n;             // 0x61..0x64
    const railHalf = (n: number): number => 0x3a + n;            // 0x3B..0x3E
    for (const n of edgeNibbles) {
      expect(highway(SLOPE_ROT_CCW[n]!)).toBe(rot.XBLD_ROT_CCW[highway(n)]);
      expect(railHalf(SLOPE_ROT_CCW[n]!)).toBe(rot.XBLD_ROT_CCW[railHalf(n)]);
    }
  });
  it('re-export 与契约为同一对象（全仓库唯一一份表）', () => {
    expect(SLOPE_CORNERS).toBe(rot.SLOPE_CORNERS); expect(CORNERS_TO_SLOPE).toBe(rot.CORNERS_TO_SLOPE);
    expect(SLOPE_ROT_CCW).toBe(rot.SLOPE_ROT_CCW); expect(SLOPE_ROT_CW).toBe(rot.SLOPE_ROT_CW);
    expect(XTER_STREAM_ROT_CCW).toBe(rot.XTER_STREAM_ROT_CCW); expect(rotateXter).toBe(rot.rotateXter);
  });
});

describe('terrain slope：角点编解码', () => {
  it('cornersOf → tileFromCorners 对 13 种坡面互逆；bedrock 按 forBedrock 分别给 alt+1 / alt', () => {
    const h = new Uint8Array(CORNER_SIZE * CORNER_SIZE);
    for (let code = 0; code <= 12; code++) {
      const [a, b, c, d] = cornersOf(7, code, 'flat');
      h[cornerIndex(5, 5)] = a; h[cornerIndex(6, 5)] = b; h[cornerIndex(5, 6)] = c; h[cornerIndex(6, 6)] = d;
      expect(tileFromCorners(h, 5, 5)).toEqual({ alt: 7, slope: code, min: 7, max: code === 0 ? 7 : 8 });
    }
    expect(cornersOf(7, 0x0d, 'surface')).toEqual([8, 8, 8, 8]);
    expect(cornersOf(7, 0x0d, 'flat')).toEqual([7, 7, 7, 7]);
    expect(cornersOf(7, 0x3e, 'surface')).toEqual([8, 8, 8, 8]);
    expect(cornersOf(3, 0x31, 'surface')).toEqual([3, 3, 3, 3]);  // 浅水形状码不是高度
    expect(cornersOf(3, 0x21, 'surface')).toEqual([4, 4, 3, 3]);  // 岸边 T 高
    h.fill(0); h[cornerIndex(1, 1)] = 2;
    expect(tileFromCorners(h, 1, 1)).toBeNull();                 // 违反 ≤1
    h.fill(9); expect(tileFromCorners(h, 3, 3)).toEqual({ alt: 9, slope: 0, min: 9, max: 9 });
  });
  it('slopeCodeOf：0x3E → 13；0x3X / 0x4X → 0；其余低 nibble', () => {
    expect(slopeCodeOf(0x3e)).toBe(13); expect(slopeCodeOf(0x0d)).toBe(13);
    expect(slopeCodeOf(0x35)).toBe(0); expect(slopeCodeOf(0x42)).toBe(0);
    expect(slopeCodeOf(0x05)).toBe(5); expect(slopeCodeOf(0x1a)).toBe(10); expect(slopeCodeOf(0x24)).toBe(4);
  });
  it('isUndefinedXter 恰为 0x0E/0x0F/0x1E/0x1F/0x2E/0x2F/0x3F/0x46–0xFF', () => {
    const undef: number[] = [];
    for (let c = 0; c < 256; c++) if (isUndefinedXter(c)) undef.push(c);
    const expected = [0x0e, 0x0f, 0x1e, 0x1f, 0x2e, 0x2f, 0x3f, ...Array.from({ length: 256 - 0x46 }, (_, k) => 0x46 + k)];
    expect(undef).toEqual(expected);
  });
  it('shapeFromLandBits：14 种角位 → 码；对角线组合退化为 0', () => {
    expect(shapeFromLandBits(0b1111)).toBe(13); expect(shapeFromLandBits(0b0000)).toBe(0);
    expect(shapeFromLandBits(0b1100)).toBe(1); expect(shapeFromLandBits(0b0100)).toBe(9);
    expect(shapeFromLandBits(0b1001)).toBe(0); expect(shapeFromLandBits(0b0110)).toBe(0);
  });
});

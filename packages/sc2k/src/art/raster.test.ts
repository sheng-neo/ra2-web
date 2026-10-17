// ===== art/raster.test.ts =====（WORKPLAN WP9 验收：菱形行宽规则 2,6,…,W−2；上-左边规则无缝）
import { describe, expect, it } from 'vitest';
import { blit, diamondPts, diamondRowWidth, fillDiamond, fillPoly, mirrored, newBitmap, upscale } from './raster';

const count = (b: { data: Uint8Array }, idx: number): number => b.data.reduce((s, v) => s + (v === idx ? 1 : 0), 0);
const rowWidth = (b: { w: number; h: number; data: Uint8Array }, y: number): number => { let n = 0; for (let x = 0; x < b.w; x++) if (b.data[y * b.w + x] !== 0) n++; return n; };

describe('raster: 菱形像素规则（spec:ui-art §3.2.1）', () => {
  it.each([16, 32, 64])('W=%i：各行宽度 2, 6, …, W−2, W−2, …, 6, 2', (W) => {
    const H = W / 2;
    const b = newBitmap(W, H, W / 2, H);
    fillDiamond(b, 0, 0, W, H, 7);
    const widths = Array.from({ length: H }, (_, y) => rowWidth(b, y));
    const expected = Array.from({ length: H }, (_, y) => (y < H / 2 ? 2 + 4 * y : 2 + 4 * (H - 1 - y)));
    expect(widths).toEqual(expected);
    expect(widths[0]).toBe(2); expect(widths[H / 2 - 1]).toBe(W - 2); expect(widths[H / 2]).toBe(W - 2);
    expect(widths.every((w, y) => w === diamondRowWidth(W, y))).toBe(true);
    // 每行居中
    for (let y = 0; y < H; y++) { const xs: number[] = []; for (let x = 0; x < W; x++) if (b.data[y * W + x]) xs.push(x); expect(xs[0]! + xs[xs.length - 1]!).toBe(W - 1); }
  });
  it('fillDiamond 与 fillPoly(上/右/下/左顶点) 逐像素一致', () => {
    for (const W of [16, 32, 64]) {
      const H = W / 2;
      const a = newBitmap(W, H, 0, 0), c = newBitmap(W, H, 0, 0);
      fillDiamond(a, 0, 0, W, H, 3);
      fillPoly(c, diamondPts(0, 0, W, H), 3);
      expect(Array.from(c.data)).toEqual(Array.from(a.data));
    }
  });
  it('相邻地块无缝不重叠：四邻菱形用 fillPoly 拼接，像素恰好分区', () => {
    for (const W of [16, 32, 64]) {
      const H = W / 2;
      const b = newBitmap(W * 3, H * 3, 0, 0);
      // 中心 + 四个相邻格（偏移 ±W/2, ±H/2）
      const offs: Array<[number, number, number]> = [[W, H, 1], [W + W / 2, H + H / 2, 2], [W - W / 2, H + H / 2, 3], [W + W / 2, H - H / 2, 4], [W - W / 2, H - H / 2, 5]];
      let total = 0;
      for (const [x, y, idx] of offs) {
        const before = count(b, 0);
        fillPoly(b, diamondPts(x, y, W, H), idx);
        const painted = before - count(b, 0);
        expect(painted).toBe(W * H / 2);        // 每个菱形都画满自己的面积，没有被邻格覆盖的像素
        total += painted;
      }
      expect(b.data.length - count(b, 0)).toBe(total);
      // 共享边上没有缝：中心菱形与右下邻格之间的像素行连续
      for (let y = H; y < H * 2; y++) { let last = -1, gaps = 0; for (let x = 0; x < b.w; x++) { if (b.data[y * b.w + x]) { if (last >= 0 && x !== last + 1) gaps++; last = x; } } expect(gaps).toBe(0); }
    }
  });
  it('上-左边规则：共享竖边 / 对角线的两个多边形像素总数 = 面积之和', () => {
    const b = newBitmap(20, 20, 0, 0);
    fillPoly(b, [0, 0, 10, 0, 10, 20, 0, 20], 1);
    fillPoly(b, [10, 0, 20, 0, 20, 20, 10, 20], 2);
    expect(count(b, 1)).toBe(200); expect(count(b, 2)).toBe(200);
    const c = newBitmap(16, 16, 0, 0);
    fillPoly(c, [0, 0, 16, 0, 16, 16], 1);
    fillPoly(c, [0, 0, 16, 16, 0, 16], 2);
    expect(count(c, 1) + count(c, 2)).toBe(256);
    expect(count(c, 0)).toBe(0);
  });
});

describe('raster: blit / mirrored / upscale', () => {
  it('blit 把索引 0 当透明；mirrored 镜像锚点；upscale 最近邻 ×k 且锚点 ×k', () => {
    const src = newBitmap(4, 2, 1, 2);
    src.data.set([0, 5, 6, 0, 7, 0, 0, 8]);
    const dst = newBitmap(6, 4, 0, 0); dst.data.fill(9);
    blit(dst, src, 1, 1);
    expect(dst.data[1 * 6 + 1]).toBe(9); expect(dst.data[1 * 6 + 2]).toBe(5); expect(dst.data[2 * 6 + 1]).toBe(7); expect(dst.data[2 * 6 + 4]).toBe(8);
    const m = mirrored(src);
    expect(m.anchorX).toBe(2); expect(Array.from(m.data)).toEqual([0, 6, 5, 0, 8, 0, 0, 7]);
    const u = upscale(src, 2);
    expect([u.w, u.h, u.anchorX, u.anchorY]).toEqual([8, 4, 2, 4]);
    expect(u.data[0 * 8 + 2]).toBe(5); expect(u.data[1 * 8 + 3]).toBe(5); expect(u.data[3 * 8 + 7]).toBe(8);
  });
});

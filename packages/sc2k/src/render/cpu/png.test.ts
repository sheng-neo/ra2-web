// WP10 验收：png —— 无依赖编码器的解码器往返（Node zlib.inflateSync 校验 zlib store 与 LZ77 + 固定 Huffman 两种流）、chunk / CRC 结构、滤波、确定性。
import { describe, expect, it } from 'vitest';
import { inflateSync, inflateRawSync } from 'node:zlib';
import { PNG_SIGNATURE, adler32, crc32, deflateFixed, encodePng, filterRows, zlibDeflate, zlibStore } from './png';
import type { PngFilter } from './png';

const be32 = (b: Uint8Array, at: number): number => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
/** 简易 PNG 解析：返回 IHDR 尺寸与解滤波后的 RGBA。 */
function decodePng(png: Uint8Array): { w: number; h: number; rgba: Uint8ClampedArray; filters: number[] } {
  expect(Array.from(png.subarray(0, 8))).toEqual(PNG_SIGNATURE);
  let o = 8; let w = 0, h = 0; const idat: Uint8Array[] = [];
  while (o < png.length) {
    const len = be32(png, o), type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    expect(be32(png, o + 8 + len)).toBe(crc32(png, o + 4, o + 8 + len));
    const body = png.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = be32(body, 0); h = be32(body, 4); expect(Array.from(body.subarray(8))).toEqual([8, 6, 0, 0, 0]); }
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') expect(o + 12).toBe(png.length);
    o += 12 + len;
  }
  const raw = new Uint8Array(inflateSync(Buffer.concat(idat.map((b) => Buffer.from(b)))));
  const stride = w * 4;
  expect(raw.length).toBe((stride + 1) * h);
  const rgba = new Uint8ClampedArray(stride * h);
  const filters: number[] = [];
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]!; filters.push(ft);
    for (let k = 0; k < stride; k++) {
      const v = raw[y * (stride + 1) + 1 + k]!;
      const left = ft === 1 && k >= 4 ? rgba[y * stride + k - 4]! : 0;
      const up = ft === 2 && y > 0 ? rgba[(y - 1) * stride + k]! : 0;
      rgba[y * stride + k] = (v + left + up) & 0xff;
    }
  }
  return { w, h, rgba, filters };
}
/** 确定性伪随机字节（测试内，不是 sim 代码）。 */
function noise(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n); let s = seed >>> 0;
  for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; out[i] = s >>> 24; }
  return out;
}
const pattern = (n: number): Uint8Array => { const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = (i % 37) < 20 ? 7 : (i * 13) & 0xff; return out; };

describe('png: zlib 流', () => {
  it('zlibStore：inflateSync 还原（空 / 短 / 跨多块 > 65535）', () => {
    for (const raw of [new Uint8Array(0), noise(10, 1), noise(65535, 2), noise(200_000, 3)]) {
      const z = zlibStore(raw);
      expect(z[0]).toBe(0x78); expect(((z[0]! << 8) | z[1]!) % 31).toBe(0);
      expect(new Uint8Array(inflateSync(Buffer.from(z)))).toEqual(raw);
    }
  });
  it('deflateFixed / zlibDeflate：inflateRawSync / inflateSync 还原随机、重复、长匹配、全同字节数据；重复数据显著压缩', () => {
    const cases: Array<[string, Uint8Array]> = [
      ['empty', new Uint8Array(0)], ['one', new Uint8Array([42])], ['tiny', new Uint8Array([1, 2, 3])],
      ['random', noise(50_000, 7)], ['pattern', pattern(120_000)], ['zeros', new Uint8Array(300_000)],
      ['longrun', (() => { const a = new Uint8Array(70_000); a.fill(9, 0, 40_000); a.fill(200, 40_000); return a; })()],
      ['mixed', (() => { const a = new Uint8Array(90_000); a.set(noise(30_000, 9), 0); a.set(pattern(30_000), 30_000); a.set(noise(30_000, 9), 60_000); return a; })()],
    ];
    for (const [name, raw] of cases) {
      const d = deflateFixed(raw);
      expect(new Uint8Array(inflateRawSync(Buffer.from(d))), name).toEqual(raw);
      const z = zlibDeflate(raw);
      expect(((z[0]! << 8) | z[1]!) % 31).toBe(0);
      expect(new Uint8Array(inflateSync(Buffer.from(z))), name).toEqual(raw);
      expect(be32(z, z.length - 4)).toBe(adler32(raw));
      if (name === 'random') expect(d.length).toBeLessThan(raw.length * 1.2);
    }
    expect(deflateFixed(pattern(120_000)).length).toBeLessThan(120_000 / 4);
    expect(deflateFixed(new Uint8Array(300_000)).length).toBeLessThan(2_000);
    const a = deflateFixed(noise(5000, 11)), b = deflateFixed(noise(5000, 11));
    expect(a).toEqual(b);
  });
  it('crc32 / adler32 与已知向量一致', () => {
    const bytes = new TextEncoder().encode('123456789');
    expect(crc32(bytes)).toBe(0xcbf43926);
    expect(adler32(bytes)).toBe(0x091e01de);
    expect(adler32(new Uint8Array(0))).toBe(1);
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(adler32(noise(100_000, 5))).toBe(adler32(noise(100_000, 5)));
  });
});

describe('png: encodePng 往返', () => {
  const sizes: Array<[number, number]> = [[1, 1], [3, 2], [32, 16], [100, 37], [256, 128]];
  for (const compress of [true, false]) for (const filter of ['none', 'sub', 'up'] as PngFilter[]) {
    it(`compress=${compress} filter=${filter}：合法 PNG，解码后像素逐字节相等`, () => {
      for (const [w, h] of sizes) {
        const rgba = new Uint8ClampedArray(noise(w * h * 4, w * 131 + h));
        for (let i = 0; i < rgba.length; i += 4) if (((i >> 2) % 5) === 0) rgba[i + 3] = 0;   // 一些透明像素
        const png = encodePng(rgba, w, h, { compress, filter });
        const dec = decodePng(png);
        expect([dec.w, dec.h]).toEqual([w, h]);
        expect(dec.rgba).toEqual(rgba);
        expect(new Set(dec.filters)).toEqual(new Set([filter === 'sub' ? 1 : filter === 'up' ? 2 : 0]));
      }
    });
  }
  it('默认（压缩、无滤波）：重复像素的图比 stored 小得多；两次编码字节一致；长度不足抛错', () => {
    const w = 128, h = 64;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 20; rgba[i + 1] = 120; rgba[i + 2] = 220; rgba[i + 3] = 255; }
    const c = encodePng(rgba, w, h), s = encodePng(rgba, w, h, { compress: false });
    expect(c.length).toBeLessThan(s.length / 10);
    expect(encodePng(rgba, w, h)).toEqual(c);
    expect(decodePng(c).rgba).toEqual(rgba);
    expect(() => encodePng(new Uint8ClampedArray(10), 4, 4)).toThrow();
    expect(filterRows(rgba, w, h, 'none').length).toBe((w * 4 + 1) * h);
  });
});

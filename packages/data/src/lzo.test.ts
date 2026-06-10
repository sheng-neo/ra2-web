import { describe, expect, it } from 'vitest';
import { lzo1xCompressLiteral, lzo1xDecompress } from './lzo';

function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// 夹具 A：lzop -9 压缩的 2000 字节周期数据（i%7==0 ? 0 : i%23）
const A_HEX =
  '28000102030405060008090a0b0c0d000f101112131400169b020006077b02000d0e7b020014157902005405590200540559020054055902009208070092080e0092081500ad0b0092080c00920813009208030092080a0092081100920801009208080093080f0011ac0b2000000000000000148002110000';
// 夹具 B：lzop -9 压缩的 2920 字节重复文本
const B_HEX =
  '2b49736f4d61705061636b3520636f6e7461696e73204c5a4f3158580100096d707265737365642074696c65207265636f72647320666f72205250020b416c6572742032206d6170732e202000000000000000e6200120000000012001110000';

describe('lzo1xDecompress（官方 lzop 产物交叉验证）', () => {
  it('夹具 A：周期二进制数据', () => {
    const expected = new Uint8Array(2000);
    for (let i = 0; i < expected.length; i++) expected[i] = i % 7 === 0 ? 0 : i % 23;
    expect(lzo1xDecompress(fromHex(A_HEX), 2000)).toEqual(expected);
  });

  it('夹具 B：重复文本', () => {
    const expected = new TextEncoder().encode(
      'IsoMapPack5 contains LZO1X compressed tile records for Red Alert 2 maps. '.repeat(40),
    );
    expect(expected.length).toBe(2920);
    expect(lzo1xDecompress(fromHex(B_HEX), 2920)).toEqual(expected);
  });
});

describe('lzo1xCompressLiteral 往返', () => {
  const cases = [0, 1, 3, 4, 17, 18, 200, 238, 239, 500, 8192];
  for (const n of cases) {
    it(`长度 ${n}`, () => {
      const data = new Uint8Array(n);
      for (let i = 0; i < n; i++) data[i] = (i * 31 + 7) & 0xff;
      expect(lzo1xDecompress(lzo1xCompressLiteral(data), n)).toEqual(data);
    });
  }
});

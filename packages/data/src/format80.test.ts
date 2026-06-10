import { describe, expect, it } from 'vitest';
import { format80CompressLiteral, format80Decompress } from './format80';

describe('format80Decompress', () => {
  it('字面量 + 结束', () => {
    const src = new Uint8Array([0x83, 1, 2, 3, 0x80]);
    expect(format80Decompress(src, 3)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('相对复制（重叠 RLE 式）', () => {
    // 字面量 [7]，然后相对复制 dist=1 长度 4 → 7,7,7,7,7
    const src = new Uint8Array([0x81, 7, 0x10 | 0x00, 0x01, 0x80]);
    expect(format80Decompress(src, 5)).toEqual(new Uint8Array([7, 7, 7, 7, 7]));
  });

  it('0xFE 填充', () => {
    const src = new Uint8Array([0xfe, 6, 0, 9, 0x80]);
    expect(format80Decompress(src, 6)).toEqual(new Uint8Array([9, 9, 9, 9, 9, 9]));
  });

  it('绝对复制（11cccccc）', () => {
    // 字面量 [1,2,3,4]，绝对复制 pos=1 len=3 → 2,3,4
    const src = new Uint8Array([0x84, 1, 2, 3, 4, 0xc0, 1, 0, 0x80]);
    expect(format80Decompress(src, 7)).toEqual(new Uint8Array([1, 2, 3, 4, 2, 3, 4]));
  });

  it('0xFF 大块绝对复制', () => {
    const src = new Uint8Array([0x82, 5, 6, 0xff, 4, 0, 0, 0, 0x80]);
    expect(format80Decompress(src, 6)).toEqual(new Uint8Array([5, 6, 5, 6, 5, 6]));
  });
});

describe('format80CompressLiteral 往返', () => {
  for (const n of [0, 1, 62, 63, 64, 200, 1000]) {
    it(`长度 ${n}`, () => {
      const data = new Uint8Array(n);
      for (let i = 0; i < n; i++) data[i] = (i * 13 + 5) & 0xff;
      expect(format80Decompress(format80CompressLiteral(data), n)).toEqual(data);
    });
  }
});

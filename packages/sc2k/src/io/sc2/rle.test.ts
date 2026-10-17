// io/sc2/rle.test.ts —— RLE 往返属性测试（随机 / 全同 / 交替三类输入）+ 控制字节约束 + 容错（WORKPLAN WP2 验收）。
import { describe, expect, it } from 'vitest';
import { createPrng } from '../../contracts/prng';
import type { Diagnostic } from '../../contracts/system';
import { RLE_MAX_LITERAL, RLE_MAX_RUN, rleDecode, rleEncode } from './rle';

const prng = createPrng(0x5c2b);
const randomBytes = (n: number): Uint8Array => { const a = new Uint8Array(n); for (let k = 0; k < n; k++) a[k] = prng.int(256); return a; };
const sameBytes = (n: number, v: number): Uint8Array => new Uint8Array(n).fill(v);
const altBytes = (n: number): Uint8Array => { const a = new Uint8Array(n); for (let k = 0; k < n; k++) a[k] = k & 1 ? 0xaa : 0x55; return a; };
/** 混合：随机段 + 重复段交错（模拟真实图层）。 */
const mixedBytes = (n: number): Uint8Array => {
  const a = new Uint8Array(n);
  let k = 0;
  while (k < n) {
    const len = 1 + prng.int(300), v = prng.int(256), rep = prng.bit();
    for (let j = 0; j < len && k < n; j++, k++) a[k] = rep ? v : prng.int(256);
  }
  return a;
};

describe('io/sc2 rle：往返', () => {
  it.each([0, 1, 2, 3, 127, 128, 129, 255, 256, 1000, 16384])('随机输入 n=%i 往返相等', (n) => {
    const src = randomBytes(n);
    expect(rleDecode(rleEncode(src))).toEqual(src);
  });
  it.each([1, 2, 127, 128, 129, 256, 257, 16384])('全同输入 n=%i 往返相等，且重复段 ≤128 一段', (n) => {
    const src = sameBytes(n, 0x42);
    const enc = rleEncode(src);
    expect(rleDecode(enc)).toEqual(src);
    if (n >= 2) expect(enc.length).toBeLessThanOrEqual(2 * Math.ceil(n / RLE_MAX_RUN) + 2);
  });
  it.each([1, 2, 3, 128, 254, 255, 4096])('交替输入 n=%i 往返相等，且字面量段 ≤127', (n) => {
    const src = altBytes(n);
    const enc = rleEncode(src);
    expect(rleDecode(enc)).toEqual(src);
    // 全是字面量：每 127 字节一个控制字节
    expect(enc.length).toBe(n + Math.ceil(n / RLE_MAX_LITERAL));
  });
  it('混合输入 ×20 往返相等；编码永不产生 0x00 / 0x80 控制字节', () => {
    for (let t = 0; t < 20; t++) {
      const src = mixedBytes(2000 + prng.int(3000));
      const enc = rleEncode(src);
      expect(rleDecode(enc, src.length)).toEqual(src);
      // 遍历控制字节
      let i = 0;
      while (i < enc.length) {
        const c = enc[i++]!;
        expect(c === 0 || c === 0x80).toBe(false);
        if (c <= RLE_MAX_LITERAL) i += c; else i += 1;
      }
      expect(i).toBe(enc.length);
    }
  });
});

describe('io/sc2 rle：容错', () => {
  it('0x00 / 0x80 控制字节被跳过并告警', () => {
    const diag: Diagnostic[] = [];
    const out = rleDecode(Uint8Array.from([0x00, 0x02, 0x11, 0x22, 0x80, 0x81, 0x33]), undefined, diag, 'XTER');
    expect(Array.from(out)).toEqual([0x11, 0x22, 0x33, 0x33]);
    expect(diag.filter((d) => d.code === 'sc2.badRleControl')).toHaveLength(2);
    expect(diag[0]!.at).toBe('XTER');
  });
  it('截断的字面量 / 重复码告警且不抛', () => {
    const d1: Diagnostic[] = [];
    expect(Array.from(rleDecode(Uint8Array.from([0x05, 0x01, 0x02]), undefined, d1))).toEqual([1, 2]);
    expect(d1.some((d) => d.code === 'sc2.truncatedRun')).toBe(true);
    const d2: Diagnostic[] = [];
    expect(Array.from(rleDecode(Uint8Array.from([0x01, 0x09, 0x85]), undefined, d2))).toEqual([9]);
    expect(d2.some((d) => d.code === 'sc2.truncatedRun')).toBe(true);
  });
  it('expected 给出时输出恰为 expected 字节（补零 / 截断并告警）', () => {
    const d: Diagnostic[] = [];
    const short = rleDecode(Uint8Array.from([0x81, 0x07]), 5, d);
    expect(Array.from(short)).toEqual([7, 7, 0, 0, 0]);
    const long = rleDecode(Uint8Array.from([0x84, 0x07]), 2, d);
    expect(Array.from(long)).toEqual([7, 7]);
    expect(d.filter((x) => x.code === 'sc2.rleLength')).toHaveLength(2);
    expect(rleDecode(new Uint8Array(0), 3, d)).toEqual(new Uint8Array(3));
  });
  it('空输入编码为空', () => { expect(rleEncode(new Uint8Array(0))).toEqual(new Uint8Array(0)); });
});

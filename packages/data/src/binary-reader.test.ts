import { describe, expect, it } from 'vitest';
import { BinaryReader } from './binary-reader';

function readerOf(bytes: number[]): BinaryReader {
  return new BinaryReader(new Uint8Array(bytes).buffer);
}

describe('BinaryReader', () => {
  it('按小端读取各类整数', () => {
    const r = readerOf([0x01, 0x02, 0x03, 0x04, 0xff, 0xfe, 0xff, 0xff]);
    expect(r.u32()).toBe(0x04030201);
    expect(r.u8()).toBe(0xff);
    expect(r.i8()).toBe(-2);
    expect(r.u16()).toBe(0xffff);
    expect(r.remaining).toBe(0);
  });

  it('seek/skip 与越界保护', () => {
    const r = readerOf([1, 2, 3, 4]);
    r.skip(2);
    expect(r.u8()).toBe(3);
    r.seek(0);
    expect(r.u8()).toBe(1);
    expect(() => r.seek(5)).toThrow(RangeError);
    expect(() => r.bytes(10)).toThrow(RangeError);
  });

  it('ascii 在 NUL 处截断', () => {
    const r = readerOf([0x52, 0x41, 0x32, 0x00, 0x58, 0x58]);
    expect(r.ascii(6)).toBe('RA2');
    expect(r.remaining).toBe(0);
  });

  it('bytes 返回零拷贝视图', () => {
    const src = new Uint8Array([9, 8, 7, 6]);
    const r = new BinaryReader(src.buffer);
    const view = r.bytes(2);
    expect(Array.from(view)).toEqual([9, 8]);
    src[0] = 1;
    expect(view[0]).toBe(1);
  });
});

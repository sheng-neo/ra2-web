import { describe, expect, it } from 'vitest';
import { Palette } from './pal';

describe('Palette', () => {
  it('6 位 → 8 位（左移 2）', () => {
    const raw = new Uint8Array(768);
    raw[0] = 63; raw[1] = 0; raw[2] = 32; // 索引 0: (252, 0, 128)
    raw[3] = 1; raw[4] = 2; raw[5] = 3;   // 索引 1: (4, 8, 12)
    const pal = Palette.parse(raw);
    expect(pal.color(0)).toEqual([252, 0, 128]);
    expect(pal.color(1)).toEqual([4, 8, 12]);
    expect(pal.rgba[3]).toBe(255);
    expect(pal.rgba.length).toBe(1024);
  });

  it('拒绝过短文件', () => {
    expect(() => Palette.parse(new Uint8Array(100))).toThrow();
  });
});

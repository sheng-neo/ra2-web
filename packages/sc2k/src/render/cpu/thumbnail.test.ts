// WP10：thumbnail 纯函数 —— 最小原生档全图 + 盒式降采样 → RGBA / PNG。
import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import type { ArtScale } from '../../contracts/render';
import { BUILTIN_PROCEDURAL_STUB } from '../../testkit';
import { denseState, snapshotOf } from '../scene/testFixtures';
import { boxDownsample, thumbnailPng, thumbnailRgba, thumbnailScaleOf } from './thumbnail';

describe('thumbnail', () => {
  it('thumbnailScaleOf：取 provider 最小原生档（桩 S；DAT 风格 XS；无原生档回退 XS）', () => {
    expect(thumbnailScaleOf(BUILTIN_PROCEDURAL_STUB)).toBe('S');
    expect(thumbnailScaleOf({ nativeScales: new Set<ArtScale>(['XS', 'S', 'M']) })).toBe('XS');
    expect(thumbnailScaleOf({ nativeScales: new Set<ArtScale>() })).toBe('XS');
  });
  it('boxDownsample：均匀色不变、alpha 加权（透明像素不拉暗）、尺寸正确', () => {
    const src = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) { const o = i * 4; const opaque = i % 2 === 0; src[o] = 200; src[o + 1] = 100; src[o + 2] = 50; src[o + 3] = opaque ? 255 : 0; }
    const out = boxDownsample(src, 4, 4, 2, 2);
    expect(out.length).toBe(16);
    expect(Array.from(out.subarray(0, 4))).toEqual([200, 100, 50, 128]);
    expect(boxDownsample(new Uint8ClampedArray(0), 0, 0, 3, 3).length).toBe(36);
  });
  it('稠密城市 → 256×128 缩略图：中部不透明、四角透明；PNG 合法且可 inflate；全图 S 档一致', () => {
    const s = denseState();
    const snap = snapshotOf(s, { zoom: 3, rotation: 1, underground: true });
    const rgba = thumbnailRgba(snap, BUILTIN_PROCEDURAL_STUB, 256, 128);
    expect(rgba.length).toBe(256 * 128 * 4);
    const a = (x: number, y: number): number => rgba[(y * 256 + x) * 4 + 3]!;
    expect(a(128, 80)).toBe(255);
    expect(a(0, 0)).toBe(0); expect(a(255, 0)).toBe(0);
    const png = thumbnailPng(snap, BUILTIN_PROCEDURAL_STUB, 64, 32);
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const idatLen = ((png[33]! << 24) | (png[34]! << 16) | (png[35]! << 8) | png[36]!) >>> 0;
    const raw = inflateSync(Buffer.from(png.subarray(41, 41 + idatLen)));
    expect(raw.length).toBe((64 * 4 + 1) * 32);
    expect(thumbnailRgba(snap, BUILTIN_PROCEDURAL_STUB, 64, 32)).toEqual(thumbnailRgba(snap, BUILTIN_PROCEDURAL_STUB, 64, 32));
  });
});

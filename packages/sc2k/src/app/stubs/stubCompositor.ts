// ===== app/stubs/stubCompositor.ts =====（CONTRACTS §V RenderEntry.cpuCompositor 的 WP0 实现；WP10 的 render/cpu 接手）
// CpuCompositor：按 zKey 稳定排序后把 IndexedBitmap 以 (anchorX, anchorY) 贴到 SceneItem.(x,y)，输出 rect 大小的索引位图（0 = 透明）；
// toRgba 查调色板；encodePng 为无依赖实现（zlib store 块 + CRC32 + Adler32），Node / 浏览器皆可。无 DOM 依赖。
import type { ArtScale, CpuCompositor, IndexedBitmap, Palette, SceneItem, SpriteProvider } from '../../contracts/render';

function render(items: readonly SceneItem[], provider: SpriteProvider, scale: ArtScale, rect: { x: number; y: number; w: number; h: number }): IndexedBitmap {
  const w = Math.max(0, rect.w | 0), h = Math.max(0, rect.h | 0);
  const data = new Uint8Array(w * h);
  const sorted = items.slice().sort((a, b) => a.zKey - b.zKey);
  for (const it of sorted) {
    const bmp = provider.bitmap(it.key, scale);
    if (!bmp) continue;
    const x0 = (it.x - rect.x - bmp.anchorX) | 0, y0 = (it.y - rect.y - bmp.anchorY) | 0;
    if (x0 >= w || y0 >= h || x0 + bmp.w <= 0 || y0 + bmp.h <= 0) continue;
    const sx0 = Math.max(0, -x0), sy0 = Math.max(0, -y0);
    const sx1 = Math.min(bmp.w, w - x0), sy1 = Math.min(bmp.h, h - y0);
    for (let sy = sy0; sy < sy1; sy++) {
      const srow = sy * bmp.w, drow = (y0 + sy) * w + x0;
      for (let sx = sx0; sx < sx1; sx++) {
        const sxx = it.flip ? bmp.w - 1 - sx : sx;
        const si = srow + sxx;
        if (bmp.opaque ? bmp.opaque[si] === 0 : bmp.data[si] === 0) continue;
        data[drow + sx] = bmp.data[si]!;
      }
    }
  }
  return { w, h, data, anchorX: 0, anchorY: 0, cycling: false };
}

function toRgba(bmp: IndexedBitmap, palette: Palette): Uint8ClampedArray {
  const out = new Uint8ClampedArray(bmp.w * bmp.h * 4);
  const pal = palette.rgba;
  for (let i = 0, n = bmp.w * bmp.h; i < n; i++) {
    const k = bmp.data[i]!;
    if (bmp.opaque ? bmp.opaque[i] === 0 : k === 0) continue;   // 透明：保持 0,0,0,0
    const p = k * 4, o = i * 4;
    out[o] = pal[p]!; out[o + 1] = pal[p + 1]!; out[o + 2] = pal[p + 2]!; out[o + 3] = pal[p + 3]!;
  }
  return out;
}

// ---- PNG：无依赖编码（IHDR + 单个 IDAT（zlib stored blocks）+ IEND） ----
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function adler32(bytes: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]!) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
/** zlib 流（CMF/FLG 0x78 0x01，stored 块 ≤ 65535 字节，Adler32 大端尾）。 */
export function zlibStore(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  let o = 0;
  out[o++] = 0x78; out[o++] = 0x01;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535, len = Math.min(65535, raw.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0;
    out[o++] = len & 0xff; out[o++] = (len >>> 8) & 0xff;
    out[o++] = ~len & 0xff; out[o++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, start + len), o); o += len;
  }
  const ad = adler32(raw);
  out[o++] = (ad >>> 24) & 0xff; out[o++] = (ad >>> 16) & 0xff; out[o++] = (ad >>> 8) & 0xff; out[o++] = ad & 0xff;
  return out.subarray(0, o);
}
const writeU32 = (buf: Uint8Array, at: number, v: number): void => { buf[at] = (v >>> 24) & 0xff; buf[at + 1] = (v >>> 16) & 0xff; buf[at + 2] = (v >>> 8) & 0xff; buf[at + 3] = v & 0xff; };
function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  writeU32(out, 0, body.length);
  for (let k = 0; k < 4; k++) out[4 + k] = type.charCodeAt(k);
  out.set(body, 8);
  writeU32(out, 8 + body.length, crc32(out, 4, 8 + body.length));
  return out;
}
function encodePng(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const stride = w * 4;
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;   // filter: None
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, w); writeU32(ihdr, 4, h);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8 bit, RGBA, deflate, no filter, no interlace
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', zlibStore(raw)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const stubCpuCompositor: CpuCompositor = { render, toRgba, encodePng };

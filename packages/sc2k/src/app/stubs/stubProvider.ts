// ===== app/stubs/stubProvider.ts =====（CONTRACTS §V ArtEntry.createProceduralProvider 的 WP0 桩；testkit.BUILTIN_PROCEDURAL_STUB 同此）
// 洋红菱形 SpriteProvider：任何 key 都返回同一张 tileW×tileH 的菱形 IndexedBitmap（填充 255 = 洋红，描边 254 = 暗洋红，0 = 透明）；
// 调色板 256 色含洋红；nativeScales = {S, M, L}（与真 procedural 一致）；frameCount 1、fps 0（静态）。无 DOM 依赖，可在 Node 测试中使用。
import type { ArtScale, IndexedBitmap, Palette, SpriteKey, SpriteProvider } from '../../contracts/render';
import { ZOOM_TABLE } from '../../contracts/render';

export const STUB_MAGENTA_INDEX = 255;
export const STUB_MAGENTA_EDGE_INDEX = 254;
const NATIVE: ReadonlySet<ArtScale> = new Set<ArtScale>(['S', 'M', 'L']);

/** 原创占位调色板：0 透明；1..15 灰阶；16..253 按 (r,g,b) 分量线性铺开的 6×6×6 色立方 + 补齐；254/255 洋红。 */
export function buildStubPalette(): Palette {
  const rgba = new Uint8ClampedArray(256 * 4);
  const set = (k: number, r: number, g: number, b: number, a = 255): void => { rgba[k * 4] = r; rgba[k * 4 + 1] = g; rgba[k * 4 + 2] = b; rgba[k * 4 + 3] = a; };
  set(0, 0, 0, 0, 0);
  for (let k = 1; k <= 15; k++) { const v = Math.round((k / 15) * 255); set(k, v, v, v); }
  let k = 16;
  for (let r = 0; r < 6 && k < 254; r++) for (let g = 0; g < 6 && k < 254; g++) for (let b = 0; b < 6 && k < 254; b++) set(k++, r * 51, g * 51, b * 51);
  while (k < 254) { set(k, 32, 32, 32); k++; }
  set(STUB_MAGENTA_EDGE_INDEX, 160, 0, 160);
  set(STUB_MAGENTA_INDEX, 255, 0, 255);
  return { rgba, cycles: [] };
}

/** tileW×tileH 菱形：点 (x+0.5, y+0.5) 满足 |dx|/(W/2) + |dy|/(H/2) ≤ 1 为内部；内部点若 4 邻有外部点则为描边。锚点 (W/2, H)。 */
export function buildDiamond(w: number, h: number): IndexedBitmap {
  const data = new Uint8Array(w * h);
  const inside = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const dx = Math.abs(x + 0.5 - w / 2) / (w / 2), dy = Math.abs(y + 0.5 - h / 2) / (h / 2);
    return dx + dy <= 1;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    data[y * w + x] = edge ? STUB_MAGENTA_EDGE_INDEX : STUB_MAGENTA_INDEX;
  }
  return { w, h, data, anchorX: w >> 1, anchorY: h, cycling: false };
}

const scaleIndex = (s: ArtScale): number => ZOOM_TABLE.findIndex((z) => z.scale === s);

export function createStubProvider(): SpriteProvider {
  const palette = buildStubPalette();
  const cache = new Map<ArtScale, IndexedBitmap>();
  const bitmap = (_key: SpriteKey, scale: ArtScale): IndexedBitmap | null => {
    if (!NATIVE.has(scale)) return null;
    let b = cache.get(scale);
    if (!b) { const z = ZOOM_TABLE[scaleIndex(scale)]!; b = buildDiamond(z.tileW, z.tileH); cache.set(scale, b); }
    return b;
  };
  return {
    name: 'procedural',
    palette,
    nativeScales: NATIVE,
    has: (_key, scale) => NATIVE.has(scale),
    bitmap,
    frameCount: () => 1,
    fps: () => 0,
  };
}

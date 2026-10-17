// ===== render/pixi/resolve.ts =====（spec:ui-art §3.4 回退链；ARCHITECTURE §6.7）
// 纯函数：SpriteProvider → 目标档 IndexedBitmap 的回退序：primary 原生 → primary 整数放大 → primary 取样缩小 → fallback 同序 → 洋红占位。
// 另提供调色板 LUT 烘焙（索引色 → RGBA，procedural 与 DAT 同一路径）与给 CpuCompositor 用的"已解析 provider"门面。无 Pixi、无 DOM 依赖。
import type { ArtScale, IndexedBitmap, Palette, SpriteKey, SpriteProvider } from '../../contracts/render';
import { ZOOM_TABLE } from '../../contracts/render';

export const SCALE_ORDER: readonly ArtScale[] = ['XS', 'S', 'M', 'L', 'XL'];
export const scaleIndexOf = (s: ArtScale): number => SCALE_ORDER.indexOf(s);
export const tileWidthOf = (s: ArtScale): number => ZOOM_TABLE[scaleIndexOf(s)]!.tileW;
/** DAT 已导入时 procedural 回退项的源档上限（M 再 ×2/×4，同屏像素密度一致；spec:ui-art §3.4 [设计]）。 */
const DAT_FALLBACK_MAX_SRC = scaleIndexOf('M');

export type ResolvedSource = 'primary' | 'fallback' | 'placeholder';
export interface ResolvedBitmap { bmp: IndexedBitmap; palette: Palette; source: ResolvedSource }
export interface ResolveOptions { mixedDensity: boolean }
export const DEFAULT_RESOLVE_OPTIONS: ResolveOptions = { mixedDensity: false };

/** 最近邻整数放大：每个索引像素复制成 k×k；anchor ×= k；opaque 掩码同步放大。 */
export function nearestUpscale(src: IndexedBitmap, k: number): IndexedBitmap {
  if (k === 1) return src;
  const w = src.w * k, h = src.h * k;
  const data = new Uint8Array(w * h);
  const opaque = src.opaque ? new Uint8Array(w * h) : undefined;
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const si = y * src.w + x, v = src.data[si]!, o = src.opaque ? src.opaque[si]! : 0;
      for (let dy = 0; dy < k; dy++) {
        const row = (y * k + dy) * w + x * k;
        for (let dx = 0; dx < k; dx++) { data[row + dx] = v; if (opaque) opaque[row + dx] = o; }
      }
    }
  }
  return { w, h, data, anchorX: src.anchorX * k, anchorY: src.anchorY * k, cycling: src.cycling, ...(opaque ? { opaque } : {}) };
}

/** 取样缩小：取每个 k×k 块左上角像素；anchor = floor(anchor / k)。 */
export function sampleDownscale(src: IndexedBitmap, k: number): IndexedBitmap {
  if (k === 1) return src;
  const w = Math.max(1, Math.floor(src.w / k)), h = Math.max(1, Math.floor(src.h / k));
  const data = new Uint8Array(w * h);
  const opaque = src.opaque ? new Uint8Array(w * h) : undefined;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = y * k * src.w + x * k, di = y * w + x;
    data[di] = src.data[si]!;
    if (opaque) opaque[di] = src.opaque![si]!;
  }
  return { w, h, data, anchorX: Math.floor(src.anchorX / k), anchorY: Math.floor(src.anchorY / k), cycling: src.cycling, ...(opaque ? { opaque } : {}) };
}

/** 单个 provider 内的解析：原生 → 放大（取 ≤ 目标的最大原生档）→ 缩小（取 ≥ 目标的最小原生档）；maxSrcIdx 限制可用的源档。 */
function fromProvider(p: SpriteProvider, key: SpriteKey, scale: ArtScale, maxSrcIdx: number): IndexedBitmap | null {
  const t = scaleIndexOf(scale);
  if (t <= maxSrcIdx && p.nativeScales.has(scale) && p.has(key, scale)) {
    const b = p.bitmap(key, scale);
    if (b) return b;
  }
  const tw = tileWidthOf(scale);
  for (let s = Math.min(t - 1, maxSrcIdx); s >= 0; s--) {
    const sc = SCALE_ORDER[s]!;
    if (!p.nativeScales.has(sc) || !p.has(key, sc)) continue;
    const b = p.bitmap(key, sc);
    if (b) return nearestUpscale(b, tw / tileWidthOf(sc));
  }
  for (let s = t + 1; s < SCALE_ORDER.length && s <= maxSrcIdx; s++) {
    const sc = SCALE_ORDER[s]!;
    if (!p.nativeScales.has(sc) || !p.has(key, sc)) continue;
    const b = p.bitmap(key, sc);
    if (b) return sampleDownscale(b, tileWidthOf(sc) / tw);
  }
  return null;
}

/** 回退链主入口（见文件头）。primary 为 null 时直接走 fallback；都没有 → 洋红占位。 */
export function resolveBitmap(primary: SpriteProvider | null, fallback: SpriteProvider | null, key: SpriteKey, scale: ArtScale, opts: ResolveOptions = DEFAULT_RESOLVE_OPTIONS): ResolvedBitmap {
  if (primary) {
    const b = fromProvider(primary, key, scale, SCALE_ORDER.length - 1);
    if (b) return { bmp: b, palette: primary.palette, source: 'primary' };
  }
  if (fallback) {
    const cap = !opts.mixedDensity && primary && primary.name === 'dat' ? DAT_FALLBACK_MAX_SRC : SCALE_ORDER.length - 1;
    const b = fromProvider(fallback, key, scale, cap);
    if (b) return { bmp: b, palette: fallback.palette, source: 'fallback' };
  }
  return { bmp: placeholderBitmap(scale), palette: PLACEHOLDER_PALETTE, source: 'placeholder' };
}

// ---- 洋红占位（原创取值）：0 透明、1 洋红、2 暗洋红 ----
export const PLACEHOLDER_FILL = 1, PLACEHOLDER_EDGE = 2;
export const PLACEHOLDER_PALETTE: Palette = (() => {
  const rgba = new Uint8ClampedArray(256 * 4);
  rgba.set([255, 0, 255, 255], PLACEHOLDER_FILL * 4);
  rgba.set([150, 0, 150, 255], PLACEHOLDER_EDGE * 4);
  return { rgba, cycles: [] };
})();
const placeholderCache = new Map<ArtScale, IndexedBitmap>();
/** tileW×tileH 菱形占位，锚点 (W/2, H)。 */
export function placeholderBitmap(scale: ArtScale): IndexedBitmap {
  let b = placeholderCache.get(scale);
  if (b) return b;
  const z = ZOOM_TABLE[scaleIndexOf(scale)]!;
  const w = z.tileW, h = z.tileH;
  const data = new Uint8Array(w * h);
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && Math.abs(x + 0.5 - w / 2) / (w / 2) + Math.abs(y + 0.5 - h / 2) / (h / 2) <= 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    data[y * w + x] = edge ? PLACEHOLDER_EDGE : PLACEHOLDER_FILL;
  }
  b = { w, h, data, anchorX: w >> 1, anchorY: h, cycling: false };
  placeholderCache.set(scale, b);
  return b;
}

/** 透明判定：有 opaque 掩码以掩码为准（DAT 索引 0 是合法黑），否则索引 0 透明（procedural）。 */
export const isTransparent = (bmp: IndexedBitmap, i: number): boolean => (bmp.opaque ? bmp.opaque[i] === 0 : bmp.data[i] === 0);

/** 调色板 LUT 烘焙：把索引位图写进 RGBA 目标缓冲 (dx, dy) 处（dstStride = 目标宽度像素数）；透明像素写 0,0,0,0。 */
export function bakeRgba(bmp: IndexedBitmap, palette: Palette, dst: Uint8Array, dstStride: number, dx: number, dy: number): void {
  const pal = palette.rgba;
  for (let y = 0; y < bmp.h; y++) {
    const srow = y * bmp.w, drow = ((dy + y) * dstStride + dx) * 4;
    for (let x = 0; x < bmp.w; x++) {
      const si = srow + x, o = drow + x * 4;
      if (isTransparent(bmp, si)) { dst[o] = 0; dst[o + 1] = 0; dst[o + 2] = 0; dst[o + 3] = 0; continue; }
      const p = bmp.data[si]! * 4;
      dst[o] = pal[p]!; dst[o + 1] = pal[p + 1]!; dst[o + 2] = pal[p + 2]!; dst[o + 3] = pal[p + 3]!;
    }
  }
}

/**
 * "已解析 provider"门面：bitmap() 对任何档都经回退链给出位图（CpuCompositor 只认一个 provider / 一张调色板）。
 * 调色板取 primary 的（没有则 fallback / 占位）；fallback 来源的位图索引按其自身调色板理解会有偏差——thumbnail 以 primary 为准（已知限制）。
 */
export function createResolvingProvider(primary: SpriteProvider | null, fallback: SpriteProvider | null, opts: ResolveOptions = DEFAULT_RESOLVE_OPTIONS): SpriteProvider {
  const base = primary ?? fallback;
  const all = new Set<ArtScale>(SCALE_ORDER);
  return {
    name: base?.name ?? 'procedural',
    palette: base?.palette ?? PLACEHOLDER_PALETTE,
    nativeScales: all,
    has: () => true,
    bitmap: (key, scale) => resolveBitmap(primary, fallback, key, scale, opts).bmp,
    frameCount: (key) => base?.frameCount(key) ?? 1,
    fps: (key) => base?.fps(key) ?? 0,
  };
}

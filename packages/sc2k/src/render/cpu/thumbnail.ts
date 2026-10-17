// ===== render/cpu/thumbnail.ts =====（ARCHITECTURE §6.4 (b)：saves.thumbnail = 最小原生档全图 → 盒式降采样 → PNG）
// 纯函数部分（WP10）；RendererApi.thumbnail（WP11）调用 thumbnailPng 并包成 Promise。
import type { ArtScale, CpuCompositor, RenderSnapshot, SceneCompiler, SpriteProvider } from '../../contracts/render';
import { ZOOM_TABLE, mapCanvasSize } from '../../contracts/render';
import { sceneCompiler, zoomOfScale } from '../scene';
import { cpuCompositor } from './compositor';
import { encodePng } from './png';

/** 缩略图用档：provider 原生档中最小者（DAT → XS，procedural → S）。 */
export function thumbnailScaleOf(provider: Pick<SpriteProvider, 'nativeScales'>): ArtScale {
  for (const row of ZOOM_TABLE) if (provider.nativeScales.has(row.scale)) return row.scale;
  return 'XS';
}

/** 盒式降采样（alpha 加权平均，避免透明边缘发黑）。 */
export function boxDownsample(rgba: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  if (sw <= 0 || sh <= 0) return out;
  for (let oy = 0; oy < dh; oy++) {
    const y0 = Math.floor((oy * sh) / dh), y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * sh) / dh));
    for (let ox = 0; ox < dw; ox++) {
      const x0 = Math.floor((ox * sw) / dw), x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * sw) / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1 && y < sh; y++) for (let x = x0; x < x1 && x < sw; x++) {
        const p = (y * sw + x) * 4, pa = rgba[p + 3]!;
        r += rgba[p]! * pa; g += rgba[p + 1]! * pa; b += rgba[p + 2]! * pa; a += pa; n++;
      }
      const o = (oy * dw + ox) * 4;
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = n > 0 ? a / n : 0; }
    }
  }
  return out;
}

export interface ThumbnailDeps { compiler?: SceneCompiler; compositor?: CpuCompositor }

/** 全图缩略图 RGBA（w×h）：地面视图、当前旋转、provider 最小原生档。 */
export function thumbnailRgba(snap: RenderSnapshot, provider: SpriteProvider, w: number, h: number, deps: ThumbnailDeps = {}): Uint8ClampedArray {
  const compiler = deps.compiler ?? sceneCompiler, compositor = deps.compositor ?? cpuCompositor;
  const scale = thumbnailScaleOf(provider);
  const zoom = zoomOfScale(scale);
  const small: RenderSnapshot = { ...snap, view: { ...snap.view, zoom, underground: false }, artScale: scale };
  const size = mapCanvasSize(zoom);
  const bmp = compositor.render(compiler.compileAll(small), provider, scale, { x: 0, y: 0, w: size.w, h: size.h });
  return boxDownsample(compositor.toRgba(bmp, provider.palette), size.w, size.h, w, h);
}

export function thumbnailPng(snap: RenderSnapshot, provider: SpriteProvider, w: number, h: number, deps: ThumbnailDeps = {}): Uint8Array {
  return encodePng(thumbnailRgba(snap, provider, w, h, deps), w, h);
}

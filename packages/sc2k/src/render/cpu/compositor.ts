// ===== render/cpu/compositor.ts =====（CONTRACTS §Q CpuCompositor；ARCHITECTURE §6.4 像素验收 / 缩略图 / 调试渲染）
// 纯函数合成器：SceneItem[] 按 zKey 稳定排序，IndexedBitmap 以 (anchorX, anchorY) 贴到 (item.x, item.y)（地图像素系，rect 为输出窗口），
// flip 为水平镜像（锚点 x 不变）。输出索引位图附 opaque 掩码（DAT 索引 0 是合法黑色）；toRgba 查调色板，透明像素保持 0,0,0,0。
import type { ArtScale, CpuCompositor, IndexedBitmap, Palette, SceneItem, SpriteProvider } from '../../contracts/render';
import { spriteKeyHash } from '../../contracts/render';
import { encodePng } from './png';

export interface Rect { x: number; y: number; w: number; h: number }

/** 稳定排序：zKey 升序，相同 zKey 保持输入顺序（例如同格的两面岩壁）。 */
export function sortByZ(items: readonly SceneItem[]): SceneItem[] {
  const idx = new Array<number>(items.length);
  for (let k = 0; k < idx.length; k++) idx[k] = k;
  idx.sort((a, b) => items[a]!.zKey - items[b]!.zKey || a - b);
  return idx.map((k) => items[k]!);
}

/** 把 bmp 贴到目标索引缓冲（左上角 (x0, y0)，可越界裁剪）；dstOpaque 可选。 */
export function blit(dst: Uint8Array, dstW: number, dstH: number, dstOpaque: Uint8Array | null, bmp: IndexedBitmap, x0: number, y0: number, flip: boolean): void {
  if (x0 >= dstW || y0 >= dstH || x0 + bmp.w <= 0 || y0 + bmp.h <= 0) return;
  const sx0 = Math.max(0, -x0), sy0 = Math.max(0, -y0);
  const sx1 = Math.min(bmp.w, dstW - x0), sy1 = Math.min(bmp.h, dstH - y0);
  const op = bmp.opaque;
  for (let sy = sy0; sy < sy1; sy++) {
    const srow = sy * bmp.w, drow = (y0 + sy) * dstW + x0;
    for (let sx = sx0; sx < sx1; sx++) {
      const si = srow + (flip ? bmp.w - 1 - sx : sx);
      if (op ? op[si] === 0 : bmp.data[si] === 0) continue;
      dst[drow + sx] = bmp.data[si]!;
      if (dstOpaque) dstOpaque[drow + sx] = 1;
    }
  }
}

/** 合成：返回 rect 大小的索引位图（anchor 0,0；opaque 掩码标出被任何精灵覆盖的像素；cycling = 任一精灵含循环色）。 */
export function render(items: readonly SceneItem[], provider: SpriteProvider, scale: ArtScale, rect: Rect): IndexedBitmap {
  const w = Math.max(0, rect.w | 0), h = Math.max(0, rect.h | 0);
  const data = new Uint8Array(w * h);
  const opaque = new Uint8Array(w * h);
  let cycling = false;
  const cache = new Map<number, IndexedBitmap | null>();
  for (const it of sortByZ(items)) {
    const hk = spriteKeyHash(it.key);
    let bmp = cache.get(hk);
    if (bmp === undefined) { bmp = provider.bitmap(it.key, scale); cache.set(hk, bmp); }
    if (!bmp) continue;
    cycling = cycling || bmp.cycling;
    blit(data, w, h, opaque, bmp, (it.x - rect.x - bmp.anchorX) | 0, (it.y - rect.y - bmp.anchorY) | 0, it.flip);
  }
  return { w, h, data, anchorX: 0, anchorY: 0, cycling, opaque };
}

export function toRgba(bmp: IndexedBitmap, palette: Palette): Uint8ClampedArray {
  const n = bmp.w * bmp.h;
  const out = new Uint8ClampedArray(n * 4);
  const pal = palette.rgba;
  const op = bmp.opaque;
  for (let i = 0; i < n; i++) {
    const k = bmp.data[i]!;
    if (op ? op[i] === 0 : k === 0) continue;
    const p = k * 4, o = i * 4;
    out[o] = pal[p]!; out[o + 1] = pal[p + 1]!; out[o + 2] = pal[p + 2]!; out[o + 3] = pal[p + 3]!;
  }
  return out;
}

/** 一步到 RGBA（可选底色填充透明处）。 */
export function renderRgba(items: readonly SceneItem[], provider: SpriteProvider, scale: ArtScale, rect: Rect, bg?: readonly [number, number, number]): Uint8ClampedArray {
  const rgba = toRgba(render(items, provider, scale, rect), provider.palette);
  if (bg) for (let o = 0; o < rgba.length; o += 4) if (rgba[o + 3] === 0) { rgba[o] = bg[0]; rgba[o + 1] = bg[1]; rgba[o + 2] = bg[2]; rgba[o + 3] = 255; }
  return rgba;
}

export const cpuCompositor: CpuCompositor = { render, toRgba, encodePng: (rgba, w, h) => encodePng(rgba, w, h) } satisfies CpuCompositor;

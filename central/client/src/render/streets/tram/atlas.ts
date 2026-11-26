/**
 * 电车目的地牌图集（R2 TRAMS T5）：运行时用 canvas 画字，转成单通道 R8 纹理（192 × 480，带 mipmap ≈ 123 KB，
 * 登记为 'trams:dest-atlas'）。8 格竖排，每格 192 × 60：上行中文地名、下行英文地名，白字黑底（颜色在着色器里给）。
 * 文字只取 livery.ts 的 DESTINATIONS（全部在允许地名名单里，单元测试检查）。
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RedFormat, UnsignedByteType, type Texture } from 'three';
import { registerTextureBytes } from '../../materials/lighting';
import { DESTINATIONS } from './livery';

export const DEST_ROWS = 8;
export const DEST_TILE = { w: 192, h: 60 } as const;
const FONT = "'PingFang HK','Noto Sans CJK TC','Noto Sans HK','WenQuanYi Zen Hei',sans-serif";

/** 图集各格的文字（格下标 = DESTINATIONS 下标；其余格留空）。纯函数，测试用。 */
export function destAtlasLayout(): { row: number; zh: string; en: string }[] {
  return DESTINATIONS.map((d, row) => ({ row, zh: d.zh, en: d.en }));
}

let cached: Texture | null = null;

/** 画图集并建纹理（只建一次）；没有 DOM（单元测试）时返回 null。 */
export function destAtlasTexture(): Texture | null {
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const W = DEST_TILE.w;
  const H = DEST_TILE.h * DEST_ROWS;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const c of destAtlasLayout()) {
    const y0 = c.row * DEST_TILE.h;
    g.font = `bold 30px ${FONT}`;
    // 中文字距稍开（港式目的地牌）
    const chars = [...c.zh];
    const step = Math.min(38, (W - 24) / chars.length);
    chars.forEach((ch, i) => g.fillText(ch, W / 2 + (i - (chars.length - 1) / 2) * step, y0 + 21));
    g.font = `bold 15px ${FONT}`;
    g.fillText(c.en, W / 2, y0 + 47, W - 12);
  }
  const rgba = g.getImageData(0, 0, W, H).data;
  // R8，行序翻转：纹理第 0 行 = 画布最底一行（v = 0 在下）
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[(H - 1 - y) * W + x] = rgba[(y * W + x) * 4]!;
  const tex = new DataTexture(data, W, H, RedFormat, UnsignedByteType);
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  tex.name = 'trams:dest-atlas';
  registerTextureBytes('trams:dest-atlas', Math.round(W * H * (4 / 3)));
  cached = tex;
  return tex;
}

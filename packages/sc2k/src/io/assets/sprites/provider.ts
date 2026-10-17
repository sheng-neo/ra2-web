// ===== io/assets/sprites/provider.ts =====（CONTRACTS §Q SpriteProvider；spec:ui-art §2.9 / §3.2.6；ARCHITECTURE §9.3）
// DatSpriteProvider：玩家导入的真实精灵。静态（frameCount 1、fps 0）、无色循环、nativeScales = {XS, S, M}（small / medium / large），
// 锚点 (w/2, h−1)，索引 0 是合法黑色（透明由 opaque 掩码表达）。key 不在 IdLayout 或该缩放级无此 ID → has 为 false / bitmap 为 null，
// 渲染器据此走回退链（DAT 整数放大 → procedural → 占位）。无 DOM，可在 Node 测试与 Worker 中使用。
import type { ArtScale, IndexedBitmap, Palette, SpriteKey, SpriteProvider } from '../../../contracts/render';
import type { AtlasFrame, AtlasPage } from './atlas';
import { extractFrame } from './atlas';
import type { IdLayout } from './ids';
import { DAT_ZOOM_OF_SCALE, ZOOM_BASE, layoutKey } from './ids';

export interface DatProviderSource { pages: readonly AtlasPage[]; frames: ReadonlyMap<number, AtlasFrame>; idLayout: Readonly<IdLayout> }
export const DAT_NATIVE_SCALES: ReadonlySet<ArtScale> = new Set<ArtScale>(['XS', 'S', 'M']);
export interface DatSpriteProvider extends SpriteProvider {
  readonly name: 'dat';
  /** 调试 / 测试：key 在某缩放级对应的文件绝对 ID（无则 null）。 */
  absoluteId(key: SpriteKey, scale: ArtScale): number | null;
  readonly spriteCount: number;
}

export function createDatSpriteProvider(src: DatProviderSource, palette: Palette): DatSpriteProvider {
  const cache = new Map<number, IndexedBitmap>();
  const absoluteId = (key: SpriteKey, scale: ArtScale): number | null => {
    const zoom = DAT_ZOOM_OF_SCALE[scale];
    if (!zoom) return null;
    const rel = src.idLayout[layoutKey(key.kind, key.id)];
    if (rel === undefined) return null;
    const abs = ZOOM_BASE[zoom] + rel;
    return src.frames.has(abs) ? abs : null;
  };
  const bitmap = (key: SpriteKey, scale: ArtScale): IndexedBitmap | null => {
    const abs = absoluteId(key, scale);
    if (abs === null) return null;
    let b = cache.get(abs);
    if (!b) {
      const f = src.frames.get(abs)!;
      const px = extractFrame(src.pages, f);
      b = { w: f.w, h: f.h, data: px.index, anchorX: f.anchorX, anchorY: f.anchorY, cycling: false, opaque: px.opaque };
      cache.set(abs, b);
    }
    return b;
  };
  return {
    name: 'dat',
    palette,
    nativeScales: DAT_NATIVE_SCALES,
    has: (key, scale) => absoluteId(key, scale) !== null,
    bitmap,
    frameCount: () => 1,
    fps: () => 0,
    absoluteId,
    spriteCount: src.frames.size,
  };
}

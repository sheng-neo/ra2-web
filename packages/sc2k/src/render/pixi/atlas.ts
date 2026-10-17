// ===== render/pixi/atlas.ts =====（ARCHITECTURE §6.7 纹理管线；spec:ui-art §3.12 图集预算）
// AtlasManager：2048² RGBA 静态页（按 scale 分组、shelf 打包、调色板 LUT 烘焙后 BufferImageSource 上传）、
// (key, scale) → Texture 句柄缓存（稳定：同一对永远同一 Texture，直到 setProviders / release）、回退链（resolve.ts）、
// 页数上限与跨档驱逐、vramBytes 统计。Pixi 对象只在无 GPU 的 Node 环境里也能构造（单元测试用 mock 之外的真对象）。
import { BufferImageSource, Rectangle, Texture } from 'pixi.js';
import type { ArtScale, SpriteKey, SpriteProvider } from '../../contracts/render';
import { spriteKeyHash } from '../../contracts/render';
import { DEFAULT_RESOLVE_OPTIONS, SCALE_ORDER, bakeRgba, createResolvingProvider, resolveBitmap, scaleIndexOf } from './resolve';
import type { ResolveOptions, ResolvedBitmap, ResolvedSource } from './resolve';

export const ATLAS_PAGE_SIZE = 2048;
export const ATLAS_MAX_PAGES = 6;          // ≤ 6 页驻留（§11：6 × 16 MB = 96 MB < 128 MB）
export const ATLAS_PADDING = 1;            // 精灵间 1 px 空隙（最近邻采样下防渗色）

export interface AtlasEntry {
  readonly texture: Texture; readonly w: number; readonly h: number; readonly anchorX: number; readonly anchorY: number;
  readonly page: number; readonly scale: ArtScale; readonly source: ResolvedSource; readonly generation: number;
}
export interface AtlasRect { page: number; x: number; y: number; w: number; h: number }
export interface AtlasPageInfo { id: number; scale: ArtScale; size: number; rects: readonly AtlasRect[]; usedPx: number }
export interface AtlasStats { pages: number; entries: number; vramBytes: number; uploads: number; evictions: number; placeholders: number; generation: number }
export interface AtlasOptions { pageSize?: number; maxPages?: number; padding?: number; mixedDensity?: boolean }

export interface Atlas {
  readonly primary: SpriteProvider | null; readonly fallback: SpriteProvider | null;
  /** 热切换：释放全部页 + 清句柄缓存 + generation++（调用方随后做全量重建）。 */
  setProviders(primary: SpriteProvider | null, fallback: SpriteProvider | null): void;
  /** 句柄：首次经回退链解析、烘焙进页；之后同 (key, scale) 恒返回同一 Entry（直到 setProviders / release）。 */
  get(key: SpriteKey, scale: ArtScale): AtlasEntry;
  peek(key: SpriteKey, scale: ArtScale): AtlasEntry | undefined;
  resolve(key: SpriteKey, scale: ArtScale): ResolvedBitmap;
  /** 本帧有新烘焙的页 → source.update() 重上传；返回上传页数。 */
  flush(): number;
  /** 释放全部页与句柄（generation++）。 */
  release(): void;
  isValid(e: AtlasEntry): boolean;
  readonly generation: number; readonly vramBytes: number; readonly pageCount: number; readonly entryCount: number;
  /** 当前档已烘焙精灵的最大高度（带可见区间的保守余量）。 */
  maxSpriteHeight(scale: ArtScale): number;
  pages(): readonly AtlasPageInfo[];
  stats(): AtlasStats;
  /** 给 CpuCompositor 的"已解析 provider"门面（thumbnail）。 */
  facade(): SpriteProvider;
  destroy(): void;
}

interface Shelf { y: number; h: number; x: number }
interface Page {
  id: number; scale: ArtScale; size: number; buf: Uint8Array; source: BufferImageSource;
  shelves: Shelf[]; nextY: number; dirty: boolean; rects: AtlasRect[]; usedPx: number; alive: boolean;
}

export function createAtlas(options: AtlasOptions = {}): Atlas {
  const pageSize = options.pageSize ?? ATLAS_PAGE_SIZE;
  const maxPages = options.maxPages ?? ATLAS_MAX_PAGES;
  const pad = options.padding ?? ATLAS_PADDING;
  const resolveOpts: ResolveOptions = { mixedDensity: options.mixedDensity ?? DEFAULT_RESOLVE_OPTIONS.mixedDensity };

  let primary: SpriteProvider | null = null, fallback: SpriteProvider | null = null;
  let generation = 1, nextPageId = 1;
  let uploads = 0, evictions = 0, placeholders = 0;
  const pages: Page[] = [];
  /** 每档一张缓存：cacheKey = spriteKeyHash（32 位正数）。 */
  const caches: Map<number, AtlasEntry>[] = SCALE_ORDER.map(() => new Map<number, AtlasEntry>());
  const maxH: number[] = SCALE_ORDER.map(() => 0);

  const newPage = (scale: ArtScale, minW: number, minH: number): Page => {
    const size = Math.max(pageSize, minW, minH);
    const buf = new Uint8Array(size * size * 4);
    const source = new BufferImageSource({ resource: buf, width: size, height: size, scaleMode: 'nearest', autoGarbageCollect: false, label: `sc2k-atlas-${nextPageId}-${scale}` });
    const p: Page = { id: nextPageId++, scale, size, buf, source, shelves: [], nextY: 0, dirty: false, rects: [], usedPx: 0, alive: true };
    pages.push(p);
    return p;
  };
  const destroyPage = (p: Page): void => {
    if (!p.alive) return;
    p.alive = false;
    p.source.destroy();
  };
  /** shelf 打包：先找"高度合适（≤ 2×）"的货架，再开新货架，最后退而求其次任何放得下的货架。 */
  const placeIn = (p: Page, w: number, h: number): { x: number; y: number } | null => {
    const pw = w + pad, ph = h + pad;
    for (const s of p.shelves) if (ph <= s.h && ph * 2 >= s.h && s.x + pw <= p.size) { const x = s.x; s.x += pw; return { x, y: s.y }; }
    if (p.nextY + ph <= p.size) { const s: Shelf = { y: p.nextY, h: ph, x: pw }; p.shelves.push(s); p.nextY += ph; return { x: 0, y: s.y }; }
    for (const s of p.shelves) if (ph <= s.h && s.x + pw <= p.size) { const x = s.x; s.x += pw; return { x, y: s.y }; }
    return null;
  };
  const evictOtherScales = (keep: ArtScale): void => {
    for (let k = pages.length - 1; k >= 0; k--) {
      const p = pages[k]!;
      if (p.scale === keep) continue;
      destroyPage(p); pages.splice(k, 1); evictions++;
      caches[scaleIndexOf(p.scale)]!.clear();
      maxH[scaleIndexOf(p.scale)] = 0;
    }
  };
  const allocate = (scale: ArtScale, w: number, h: number): { page: Page; x: number; y: number } => {
    for (const p of pages) {
      if (p.scale !== scale) continue;
      const at = placeIn(p, w, h);
      if (at) return { page: p, ...at };
    }
    if (pages.length >= maxPages) evictOtherScales(scale);
    const p = newPage(scale, w + pad, h + pad);
    const at = placeIn(p, w, h)!;
    return { page: p, ...at };
  };

  const get = (key: SpriteKey, scale: ArtScale): AtlasEntry => {
    const sIdx = scaleIndexOf(scale);
    const cache = caches[sIdx]!;
    const ck = spriteKeyHash(key);
    const hit = cache.get(ck);
    if (hit) return hit;
    const r = resolveBitmap(primary, fallback, key, scale, resolveOpts);
    if (r.source === 'placeholder') placeholders++;
    const bmp = r.bmp;
    const w = Math.max(1, bmp.w), h = Math.max(1, bmp.h);
    const { page, x, y } = allocate(scale, w, h);
    if (bmp.w > 0 && bmp.h > 0) bakeRgba(bmp, r.palette, page.buf, page.size, x, y);
    page.dirty = true;
    page.rects.push({ page: page.id, x, y, w, h });
    page.usedPx += w * h;
    const texture = new Texture({ source: page.source, frame: new Rectangle(x, y, w, h), label: `sc2k-${key.kind}-${key.id}` });
    const e: AtlasEntry = { texture, w, h, anchorX: bmp.anchorX, anchorY: bmp.anchorY, page: page.id, scale, source: r.source, generation };
    cache.set(ck, e);
    if (h > maxH[sIdx]!) maxH[sIdx] = h;
    return e;
  };

  const release = (): void => {
    for (const p of pages) destroyPage(p);
    pages.length = 0;
    for (const c of caches) c.clear();
    maxH.fill(0);
    generation++;
  };

  return {
    get primary() { return primary; },
    get fallback() { return fallback; },
    setProviders(p, f) { primary = p; fallback = f; release(); },
    get,
    peek: (key, scale) => caches[scaleIndexOf(scale)]!.get(spriteKeyHash(key)),
    resolve: (key, scale) => resolveBitmap(primary, fallback, key, scale, resolveOpts),
    flush() {
      let n = 0;
      for (const p of pages) if (p.dirty && p.alive) { p.source.update(); p.dirty = false; n++; uploads++; }
      return n;
    },
    release,
    isValid: (e) => e.generation === generation && !e.texture.source.destroyed,
    get generation() { return generation; },
    get vramBytes() { let b = 0; for (const p of pages) if (p.alive) b += p.size * p.size * 4; return b; },
    get pageCount() { return pages.length; },
    get entryCount() { let n = 0; for (const c of caches) n += c.size; return n; },
    maxSpriteHeight: (scale) => maxH[scaleIndexOf(scale)]!,
    pages: () => pages.map((p) => ({ id: p.id, scale: p.scale, size: p.size, rects: p.rects, usedPx: p.usedPx })),
    stats: () => ({ pages: pages.length, entries: caches.reduce((n, c) => n + c.size, 0), vramBytes: pages.reduce((b, p) => b + (p.alive ? p.size * p.size * 4 : 0), 0), uploads, evictions, placeholders, generation }),
    facade: () => createResolvingProvider(primary, fallback, resolveOpts),
    destroy() { release(); },
  };
}

// ===== io/assets/sprites/atlas.ts =====（spec:file-formats §3.6.3、ARCHITECTURE §6.7）
// 把解码后的索引位图装进"索引图集"页：每像素 2 通道 [索引, 不透明]，与调色板无关，可直接缓存进 IndexedDB。
// 货架（shelf）装箱：页宽固定 ATLAS_PAGE_W、高度按需增长到 ATLAS_PAGE_MAX_H；超大精灵独占一页。帧表按文件绝对 ID 索引。
// 锚点按 spec:ui-art §3.2.6：(w/2, h−1)（datAnchor；DAT_OVERLAP_ROW 可调）。
import type { DecodedSprite } from './archive';
import { datAnchor } from './ids';

export const ATLAS_PAGE_W = 1024, ATLAS_PAGE_MAX_H = 1024, ATLAS_CHANNELS = 2;
export interface AtlasFrame { page: number; x: number; y: number; w: number; h: number; anchorX: number; anchorY: number }
/** 一页：data 长度 = w × h × ATLAS_CHANNELS，像素 (x,y) 的索引在 (y·w + x)·2、不透明在 +1。 */
export interface AtlasPage { w: number; h: number; data: Uint8Array }
export interface PackedAtlas { pages: AtlasPage[]; frames: Map<number, AtlasFrame> }

interface Shelf { y: number; h: number; x: number }
interface PageBuilder { w: number; used: number; maxH: number; shelves: Shelf[]; placed: { s: DecodedSprite; x: number; y: number }[] }

export function packSprites(sprites: Iterable<DecodedSprite>): PackedAtlas {
  const list = [...sprites].filter((s) => s.w > 0 && s.h > 0);
  // 高→宽→id 排序：货架装箱的经典顺序，且输入顺序无关（同输入同布局）。
  list.sort((a, b) => b.h - a.h || b.w - a.w || a.id - b.id);
  const pages: PageBuilder[] = [];
  const frames = new Map<number, AtlasFrame>();
  const newPage = (w: number, maxH: number): PageBuilder => { const p: PageBuilder = { w, used: 0, maxH, shelves: [], placed: [] }; pages.push(p); return p; };
  let current: PageBuilder | null = null;
  const placements: { s: DecodedSprite; page: number; x: number; y: number }[] = [];
  for (const s of list) {
    if (s.w > ATLAS_PAGE_W || s.h > ATLAS_PAGE_MAX_H) {               // 超大精灵独占一页（页尺寸即精灵尺寸）
      const p = newPage(s.w, s.h); p.used = s.h; p.placed.push({ s, x: 0, y: 0 });
      placements.push({ s, page: pages.length - 1, x: 0, y: 0 });
      continue;
    }
    if (!current) current = newPage(ATLAS_PAGE_W, ATLAS_PAGE_MAX_H);
    let placed = false;
    for (const sh of current.shelves) {
      if (sh.h >= s.h && sh.x + s.w <= current.w) {
        placements.push({ s, page: pages.indexOf(current), x: sh.x, y: sh.y }); current.placed.push({ s, x: sh.x, y: sh.y });
        sh.x += s.w; placed = true; break;
      }
    }
    if (placed) continue;
    if (current.used + s.h > current.maxH) current = newPage(ATLAS_PAGE_W, ATLAS_PAGE_MAX_H);
    const sh: Shelf = { y: current.used, h: s.h, x: s.w };
    current.shelves.push(sh); current.used += s.h;
    placements.push({ s, page: pages.indexOf(current), x: 0, y: sh.y }); current.placed.push({ s, x: 0, y: sh.y });
  }
  const out: AtlasPage[] = pages.map((p) => ({ w: p.w, h: Math.max(1, p.used), data: new Uint8Array(p.w * Math.max(1, p.used) * ATLAS_CHANNELS) }));
  for (const { s, page, x, y } of placements) {
    const pg = out[page]!;
    blitInto(pg, s, x, y);
    const a = datAnchor(s.w, s.h);
    frames.set(s.id, { page, x, y, w: s.w, h: s.h, anchorX: a.x, anchorY: a.y });
  }
  return { pages: out, frames };
}

function blitInto(pg: AtlasPage, s: DecodedSprite, x0: number, y0: number): void {
  for (let y = 0; y < s.h; y++) {
    const srcRow = y * s.w, dstRow = ((y0 + y) * pg.w + x0) * ATLAS_CHANNELS;
    for (let x = 0; x < s.w; x++) {
      pg.data[dstRow + x * ATLAS_CHANNELS] = s.index[srcRow + x]!;
      pg.data[dstRow + x * ATLAS_CHANNELS + 1] = s.opaque[srcRow + x]!;
    }
  }
}

/** 从页中取回一帧（独立拷贝）。 */
export function extractFrame(pages: readonly AtlasPage[], f: AtlasFrame): { index: Uint8Array; opaque: Uint8Array } {
  const pg = pages[f.page];
  const index = new Uint8Array(f.w * f.h), opaque = new Uint8Array(f.w * f.h);
  if (!pg) return { index, opaque };
  for (let y = 0; y < f.h; y++) {
    const src = ((f.y + y) * pg.w + f.x) * ATLAS_CHANNELS, dst = y * f.w;
    for (let x = 0; x < f.w; x++) { index[dst + x] = pg.data[src + x * ATLAS_CHANNELS]!; opaque[dst + x] = pg.data[src + x * ATLAS_CHANNELS + 1]!; }
  }
  return { index, opaque };
}

/** 页的自描述二进制：8 字节头 [u32 LE w][u32 LE h] + 像素数据；缓存到 IndexedDB 的 Blob 即此格式。 */
export const ATLAS_PAGE_HEADER_BYTES = 8;
export function encodeAtlasPage(p: AtlasPage): Uint8Array {
  const out = new Uint8Array(ATLAS_PAGE_HEADER_BYTES + p.data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, p.w, true); dv.setUint32(4, p.h, true);
  out.set(p.data, ATLAS_PAGE_HEADER_BYTES);
  return out;
}
export function decodeAtlasPage(bytes: Uint8Array): AtlasPage {
  if (bytes.length < ATLAS_PAGE_HEADER_BYTES) throw new RangeError('atlas page: 头部截断');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = dv.getUint32(0, true), h = dv.getUint32(4, true);
  const need = w * h * ATLAS_CHANNELS;
  if (bytes.length < ATLAS_PAGE_HEADER_BYTES + need) throw new RangeError(`atlas page: 数据长度 ${bytes.length - ATLAS_PAGE_HEADER_BYTES} < ${need}`);
  return { w, h, data: bytes.slice(ATLAS_PAGE_HEADER_BYTES, ATLAS_PAGE_HEADER_BYTES + need) };
}

// ===== io/assets/sprites/__fixtures__/synth.ts =====（spec:file-formats §3.5.4："夹具用代码生成，不提交二进制、禁止原版字节"）
// 用本项目自己的编码器把**原创**像素图案写成 Win95 精灵文件格式（头 + 索引 + 行块），供 decode / provider / store / panel 测试使用。
// 这里的一切（图案、调色板、ID 选择）都是合成的，与任何原版文件内容无关；只有"格式"来自公开的社区格式说明。
import type { DatZoom } from '../ids';
import { DAT_TILE, DAT_ZOOMS, REL, ZOOM_BASE } from '../ids';
import { writePaletteBmp } from '../../palette/bmp';
import { ByteWriter } from '../bytes';

export const TRANSPARENT = -1;
/** 像素网格：px[y*w+x] = 调色板索引 0..255，或 -1 = 透明。 */
export interface PixelGrid { w: number; h: number; px: Int16Array }
export const gridOf = (w: number, h: number, fn: (x: number, y: number) => number): PixelGrid => {
  const px = new Int16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = fn(x, y);
  return { w, h, px };
};

export interface EncodeRowsOptions {
  /** 奇数长度 mode 4 不写填充字节（模拟 SCURK 导出的 MIF）。 */
  unpadded?: boolean;
  /** 结束标志写成 MIF 风格整行 `02 01 02 02`（默认 .DAT 风格 `00 02`）。 */
  mifEnd?: boolean;
  /** 不写结束标志（靠行数 = height 结束）。 */
  noEnd?: boolean;
  /** 在结束标志后追加 n 字节垃圾（测试"结束块后还有填充"）。 */
  trailingJunk?: number;
}

/** 把网格编码成精灵数据（行块序列）。行内块总长必须 ≤ 255（u8 rowLen），否则抛错——夹具请用足够长的色块。 */
export function encodeSpriteRows(g: PixelGrid, opts: EncodeRowsOptions = {}): Uint8Array {
  const out = new ByteWriter(g.w * g.h + 16);
  for (let y = 0; y < g.h; y++) {
    const row = new ByteWriter(g.w * 2 + 8);
    // 去掉行尾透明
    let last = g.w - 1;
    while (last >= 0 && g.px[y * g.w + last] === TRANSPARENT) last--;
    let x = 0;
    while (x <= last) {
      if (g.px[y * g.w + x] === TRANSPARENT) {
        let n = 0; while (x + n <= last && g.px[y * g.w + x + n] === TRANSPARENT && n < 255) n++;
        row.u8(n).u8(3); x += n;
      } else {
        let n = 0; while (x + n <= last && g.px[y * g.w + x + n] !== TRANSPARENT && n < 255) n++;
        row.u8(n).u8(4);
        for (let k = 0; k < n; k++) row.u8(g.px[y * g.w + x + k]!);
        if ((n & 1) && !opts.unpadded) row.u8(0);
        x += n;
      }
    }
    const body = row.toUint8Array();
    if (body.length > 255) throw new RangeError(`encodeSpriteRows: 第 ${y} 行块长 ${body.length} > 255`);
    out.u8(body.length).u8(1).bytes(body);
  }
  if (!opts.noEnd) { if (opts.mifEnd) out.u8(2).u8(1).u8(2).u8(2); else out.u8(0).u8(2); }
  for (let k = 0; k < (opts.trailingJunk ?? 0); k++) out.u8(0xa5);
  return out.toUint8Array();
}

export interface ArchiveEntryInput { id: number; w: number; h: number; data: Uint8Array }
export interface BuildArchiveOptions {
  /** 索引条目顺序：'file' = 与数据顺序一致；'reverse' = 倒序（测试解析器不依赖索引按偏移排序）。 */
  indexOrder?: 'file' | 'reverse';
  /** 相邻精灵数据之间插入的填充字节数。 */
  gap?: number;
}
/** 写出完整精灵文件：u16 BE count + 10 B 索引 × n + 数据。 */
export function buildArchiveBytes(entries: readonly ArchiveEntryInput[], opts: BuildArchiveOptions = {}): ArrayBuffer {
  const gap = opts.gap ?? 0;
  const headerLen = 2 + 10 * entries.length;
  const offsets: number[] = [];
  let cursor = headerLen;
  for (const e of entries) { offsets.push(cursor); cursor += e.data.length + gap; }
  const w = new ByteWriter(cursor);
  w.u16be(entries.length);
  const order = entries.map((_, k) => k);
  if (opts.indexOrder === 'reverse') order.reverse();
  for (const k of order) { const e = entries[k]!; w.u16be(e.id).u32be(offsets[k]!).u16be(e.h).u16be(e.w); }
  for (const e of entries) { w.bytes(e.data); for (let k = 0; k < gap; k++) w.u8(0); }
  return w.toArrayBuffer();
}

export const entryOf = (id: number, g: PixelGrid, opts: EncodeRowsOptions = {}): ArchiveEntryInput => ({ id, w: g.w, h: g.h, data: encodeSpriteRows(g, opts) });

// ---------------- 原创图案 ----------------
/** 小整数哈希（夹具用，确定性）。 */
export const mix = (a: number, b: number, c: number): number => {
  let h = (a * 0x9e3779b1 ^ b * 0x85ebca77 ^ c * 0xc2b2ae3d) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return h >>> 0;
};
/** 菱形行宽：顶 / 底行 2 px、每行 +4，直到画布宽（large 32×17：2,6,…,30,32,30,…,2）。 */
export const diamondRowWidth = (w: number, h: number, y: number): number => Math.min(w, 2 + 4 * Math.min(y, h - 1 - y));

/** 1×1 地块菱形（zoom 决定尺寸）：内部 fill、边缘 edge，带轻微哈希抖动。 */
export function tileDiamond(zoom: DatZoom, fill: number, edge: number, seed = 0): PixelGrid {
  const { w, h } = DAT_TILE[zoom];
  return gridOf(w, h, (x, y) => {
    const rw = diamondRowWidth(w, h, y), x0 = (w - rw) >> 1;
    if (x < x0 || x >= x0 + rw) return TRANSPARENT;
    const isEdge = x === x0 || x === x0 + rw - 1 || y === 0 || y === h - 1;
    if (isEdge) return edge;
    return (mix(x, y, seed) & 7) === 0 ? (fill + 1) & 0xff : fill;
  });
}

/** 建筑盒体：宽 tiles 格、高 = 地面菱形 + body 行；底部是地面菱形，上面是带窗格的墙体（原创、纯合成）。 */
export function buildingBox(zoom: DatZoom, tiles: number, bodyRows: number, wall: number, window: number, ground: number, seed = 0): PixelGrid {
  const t = DAT_TILE[zoom];
  const w = t.w * tiles, hGround = (t.h - 1) * tiles + 1, h = hGround + bodyRows;
  return gridOf(w, h, (x, y) => {
    const gy = y - bodyRows;                                       // 地面菱形行（0..hGround-1）
    if (gy >= 0) {
      const rw = Math.min(w, 2 + 4 * Math.min(gy, hGround - 1 - gy)), x0 = (w - rw) >> 1;
      if (x < x0 || x >= x0 + rw) return TRANSPARENT;
      // 墙体向下延伸到菱形的下半部分中线之前
      if (gy < (hGround >> 1) && x >= (w >> 2) && x < w - (w >> 2)) return ((x + y) & 3) === 0 ? window : wall;
      return ground;
    }
    const inset = (w >> 2);
    if (x < inset || x >= w - inset) return TRANSPARENT;
    const win = ((x - inset) % 4 === 1) && (y % 3 === 1) && (mix(x, y, seed) & 3) !== 0;
    return win ? window : wall;
  });
}

/** 图标 / 角色用小图形：椭圆盘 + 对角线，尺寸任意。 */
export function glyph(w: number, h: number, body: number, accent: number, seed = 0): PixelGrid {
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  return gridOf(w, h, (x, y) => {
    const dx = (x - cx) / Math.max(1, cx), dy = (y - cy) / Math.max(1, cy);
    if (dx * dx + dy * dy > 1) return TRANSPARENT;
    if (Math.abs(x - y * (w / h)) < 1 || (mix(x, y, seed) & 15) === 0) return accent;
    return body;
  });
}

/** 原创调色板：0 黑；其余按三条不同步的线性斜坡铺开（任何两项都不相同）。 */
export function synthPaletteRgb(): Uint8Array {
  const rgb = new Uint8Array(256 * 3);
  for (let i = 1; i < 256; i++) { rgb[i * 3] = (i * 5) & 0xff; rgb[i * 3 + 1] = (i * 3 + 40) & 0xff; rgb[i * 3 + 2] = (255 - i * 2) & 0xff; }
  return rgb;
}

export interface SynthSet {
  large: ArrayBuffer; smallmed: ArrayBuffer; special: ArrayBuffer; palette: ArrayBuffer;
  /** 期望像素：文件绝对 ID → 网格（SPECIAL 覆盖后的最终期望）。 */
  grids: Map<number, PixelGrid>;
  /** 逐文件的期望像素（SMALLMED 里的 specialOverrideId 仍是被覆盖前的图）。 */
  fileGrids: { large: Map<number, PixelGrid>; smallmed: Map<number, PixelGrid>; special: Map<number, PixelGrid> };
  paletteRgb: Uint8Array;
  /** SPECIAL 覆盖的 medium ID 与其独有 ID。 */
  specialOverrideId: number; specialUniqueId: number;
}

/** 合成一整套三档精灵 + 调色板：地表 / 水 / 几栋建筑 / 分区底色 / 断电图标 / 火 / 爆炸 / 载具 / 调度图标。 */
export function synthSpriteSet(): SynthSet {
  const grids = new Map<number, PixelGrid>();
  const perZoom = new Map<DatZoom, ArchiveEntryInput[]>();
  const XBLD_TILES: ReadonlyArray<{ rel: number; tiles: number; body: number }> = [
    { rel: 0x01, tiles: 1, body: 0 }, { rel: 0x0e, tiles: 1, body: 0 }, { rel: 0x70, tiles: 1, body: 2 },
    { rel: 0x9d, tiles: 2, body: 3 }, { rel: 0xc8, tiles: 3, body: 4 }, { rel: 0xfb, tiles: 4, body: 6 },
  ];
  for (const zoom of DAT_ZOOMS) {
    const base = ZOOM_BASE[zoom], lvl = DAT_TILE[zoom].level;
    const list: ArchiveEntryInput[] = [];
    const add = (rel: number, g: PixelGrid): void => { list.push(entryOf(base + rel, g)); grids.set(base + rel, g); };
    for (const b of XBLD_TILES) add(b.rel, b.body === 0 ? tileDiamond(zoom, 40 + b.rel % 7, 20, b.rel) : buildingBox(zoom, b.tiles, b.body * lvl, 100 + (b.rel & 15), 230, 48, b.rel));
    for (let k = 0; k < REL.terrainCount; k++) add(REL.terrainBase + k, tileDiamond(zoom, 64 + k, 32, k));
    for (let k = 0; k < REL.waterCount; k++) add(REL.waterBase + k, tileDiamond(zoom, 160 + k, 150, k));
    for (let k = 0; k < REL.zoneTintCount; k++) add(REL.zoneTintBase + k, tileDiamond(zoom, 200 + k, 199, k));
    for (let k = 0; k < REL.tintCount; k++) add(REL.tintBase + k, tileDiamond(zoom, 210 + k, 209, k));
    const gw = DAT_TILE[zoom].w, gh = DAT_TILE[zoom].h;
    add(REL.noPower, glyph(gw >> 1, gh + lvl, 250, 0, 1));
    for (let k = 0; k < REL.fireFrames; k++) add(REL.fireBase + k, glyph(gw, gh + lvl, 130 + k, 140, k));
    for (let k = 0; k < REL.explosionFrames; k++) add(REL.explosionBase + k, glyph(gw + 2 * k, gh + k, 90 + k, 95, k));
    for (let k = 0; k < REL.vehicleDirs; k++) add(REL.planeBase + k, glyph(gw, gh, 70, 71, k));
    add(REL.nessie, glyph(gw, gh, 80, 81, 9));
    for (let k = 0; k < REL.sailboatDirs; k++) add(REL.sailboatBase + k, glyph(gw >> 1, gh, 82, 83, k));
    add(REL.deployPolice, glyph(gw, gw, 84, 0, 1)); add(REL.deployFire, glyph(gw, gw, 85, 0, 2)); add(REL.deployMilitary, glyph(gw, gw, 86, 0, 3));
    perZoom.set(zoom, list);
  }
  const specialOverrideId = ZOOM_BASE.medium + 0x70, specialUniqueId = ZOOM_BASE.medium + 0x71;
  const overrideGrid = buildingBox('medium', 1, 3 * DAT_TILE.medium.level, 120, 231, 49, 77);
  const uniqueGrid = buildingBox('medium', 1, 2 * DAT_TILE.medium.level, 121, 232, 50, 78);
  const pick = (zooms: DatZoom[]): Map<number, PixelGrid> => new Map([...grids].filter(([abs]) => zooms.some((z) => abs >= ZOOM_BASE[z] && abs < ZOOM_BASE[z] + 500)));
  const fileGrids = { large: pick(['large']), smallmed: pick(['small', 'medium']), special: new Map([[specialOverrideId, overrideGrid], [specialUniqueId, uniqueGrid]]) };
  grids.set(specialOverrideId, overrideGrid); grids.set(specialUniqueId, uniqueGrid);
  const paletteRgb = synthPaletteRgb();
  return {
    large: buildArchiveBytes(perZoom.get('large')!),
    smallmed: buildArchiveBytes([...perZoom.get('small')!, ...perZoom.get('medium')!]),
    special: buildArchiveBytes([entryOf(specialOverrideId, overrideGrid), entryOf(specialUniqueId, uniqueGrid)]),
    palette: writePaletteBmp(paletteRgb),
    grids, fileGrids, paletteRgb, specialOverrideId, specialUniqueId,
  };
}

/** 网格 ↔ 解码结果比对：返回第一个不一致的像素描述，全部一致返回 null。 */
export function compareGrid(g: PixelGrid, index: Uint8Array, opaque: Uint8Array): string | null {
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const i = y * g.w + x, want = g.px[i]!;
    if (want === TRANSPARENT) { if (opaque[i] !== 0) return `(${x},${y}) 应透明`; }
    else if (opaque[i] !== 1 || index[i] !== want) return `(${x},${y}) 期望 ${want}，得到 ${opaque[i] ? index[i] : '透明'}`;
  }
  return null;
}

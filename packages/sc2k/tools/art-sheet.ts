/// <reference types="node" />
// ===== tools/art-sheet.ts =====（WORKPLAN WP9：contact sheet；spec:ui-art §3.9.3 `art:sheet`）
// 把程序化精灵按类别排成 contact sheet，写成 PNG（自带最小 PNG 编码：zlib store + CRC32 + Adler32，不依赖 render/cpu）。
// 用法：tsx tools/art-sheet.ts [--scale S|M|L|all] [--out docs/art-preview] [--copy <dir>] [--no-demo]
//   输出 art-sheet-<scale>.png（全部精灵）、demo-city-<scale>.png（手工拼的小场景，供目测"像不像一座城"）。
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import type { IndexedBitmap, SpriteKey } from '../src/contracts/render';
import { OverlayId } from '../src/contracts/render';
import { FOOTPRINT } from '../src/contracts/footprint';
import { CORNERS_TO_SLOPE } from '../src/contracts/rotation';
import { buildPalette, generate, requiredKeyGroups } from '../src/art';
import type { NativeScale } from '../src/art';
import { SCALES } from '../src/art/raster';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');

// ---------- PNG ----------
const CRC_TABLE = ((): Uint32Array => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes: Uint8Array): number { let c = 0xffffffff; for (let k = 0; k < bytes.length; k++) c = CRC_TABLE[(c ^ bytes[k]!) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function adler32(bytes: Uint8Array): number { let a = 1, b = 0; for (let k = 0; k < bytes.length; k++) { a = (a + bytes[k]!) % 65521; b = (b + a) % 65521; } return ((b << 16) | a) >>> 0; }
function u32(v: number): number[] { return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]; }
function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type);
  const body = new Uint8Array(t.length + data.length); body.set(t); body.set(data, t.length);
  return new Uint8Array([...u32(data.length), ...body, ...u32(crc32(body))]);
}
function zlibStore(raw: Uint8Array): Uint8Array {
  const blocks: number[] = [0x78, 0x01];
  for (let off = 0; off < raw.length || off === 0; off += 65535) {
    const len = Math.min(65535, raw.length - off);
    const last = off + len >= raw.length ? 1 : 0;
    blocks.push(last, len & 0xff, (len >>> 8) & 0xff, (~len) & 0xff, ((~len) >>> 8) & 0xff);
    for (let k = 0; k < len; k++) blocks.push(raw[off + k]!);
    if (raw.length === 0) break;
  }
  blocks.push(...u32(adler32(raw)));
  return new Uint8Array(blocks);
}
/** PNG 编码：默认 node:zlib 压缩（预览体积小）；--store 时用自带 zlib store（零依赖路径）。 */
export function encodePng(rgba: Uint8ClampedArray, w: number, h: number, store = false): Uint8Array {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1); }
  const ihdr = new Uint8Array([...u32(w), ...u32(h), 8, 6, 0, 0, 0]);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = store ? zlibStore(raw) : new Uint8Array(deflateSync(raw, { level: 6 }));
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---------- 画布 ----------
class Canvas {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number) { this.data = new Uint8Array(w * h); }
  blit(b: IndexedBitmap, x: number, y: number): void {
    for (let yy = 0; yy < b.h; yy++) for (let xx = 0; xx < b.w; xx++) { const v = b.data[yy * b.w + xx]!; if (!v) continue; const tx = x + xx, ty = y + yy; if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue; this.data[ty * this.w + tx] = v; }
  }
  rect(x: number, y: number, w: number, h: number, idx: number): void { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && yy >= 0 && xx < this.w && yy < this.h) this.data[yy * this.w + xx] = idx; }
}
// 3×5 微型字体（十六进制与少量字母）
const FONT: Record<string, number[]> = {
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7], '3': [7, 1, 7, 1, 7], '4': [5, 5, 7, 1, 1], '5': [7, 4, 7, 1, 7], '6': [7, 4, 7, 5, 7], '7': [7, 1, 1, 1, 1], '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7],
  A: [7, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [7, 4, 4, 4, 7], D: [6, 5, 5, 5, 6], E: [7, 4, 7, 4, 7], F: [7, 4, 7, 4, 4], x: [0, 5, 2, 5, 0], v: [0, 5, 5, 5, 2], s: [0, 3, 6, 1, 6], ':': [0, 2, 0, 2, 0], ' ': [0, 0, 0, 0, 0], '-': [0, 0, 7, 0, 0],
  S: [3, 4, 2, 1, 6], M: [5, 7, 7, 5, 5], L: [4, 4, 4, 4, 7], T: [7, 2, 2, 2, 2], W: [5, 5, 7, 7, 5], U: [5, 5, 5, 5, 7], O: [7, 5, 5, 5, 7], I: [7, 2, 2, 2, 7], R: [6, 5, 6, 5, 5], N: [5, 7, 7, 5, 5], a: [0, 3, 5, 5, 3], t: [2, 7, 2, 2, 1], e: [0, 7, 7, 4, 7], r: [0, 6, 5, 4, 4], w: [0, 5, 5, 7, 5], u: [0, 5, 5, 5, 7], n: [0, 6, 5, 5, 5], d: [1, 3, 5, 5, 3], c: [0, 3, 4, 4, 3], o: [0, 7, 5, 5, 7], l: [2, 2, 2, 2, 2], i: [2, 0, 2, 2, 2], y: [0, 5, 5, 3, 6], b: [4, 6, 5, 5, 6],
};
function text(cv: Canvas, x: number, y: number, s: string, idx: number): void {
  for (let k = 0; k < s.length; k++) { const g = FONT[s[k]!] ?? FONT['-']!; for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r]! & (4 >> c)) cv.rect(x + k * 4 + c, y + r, 1, 1, idx); }
}
const hex = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0');
const label = (k: SpriteKey): string => k.kind === 'ui' ? `${k.id}` : `${hex(k.id)}${k.variant ? 'v' + (k.variant & 0x80 ? 'U' : k.variant) : ''}`;

interface Cell { key: SpriteKey; bmp: IndexedBitmap }
/** 把一组 cell 按行排布；返回绘制后的高度。 */
function layoutGroup(cv: Canvas, x0: number, y0: number, title: string, cells: Cell[], maxW: number): number {
  text(cv, x0, y0, title, 2);
  let y = y0 + 8;
  let x = x0, rowH = 0;
  for (const c of cells) {
    const cw = Math.max(c.bmp.w, 4 * label(c.key).length) + 2, ch = c.bmp.h + 8;
    if (x + cw > x0 + maxW && x > x0) { x = x0; y += rowH; rowH = 0; }
    // 背景格 + 锚点标记
    cv.rect(x, y, cw - 1, ch - 1, 4);
    cv.blit(c.bmp, x + 1, y + 1);
    cv.rect(x + 1 + c.bmp.anchorX, y + 1 + c.bmp.anchorY - 1, 1, 1, 12 + 3);   // 热力红点
    text(cv, x + 1, y + c.bmp.h + 2, label(c.key), 3);
    x += cw; rowH = Math.max(rowH, ch);
  }
  return y + rowH - y0 + 6;
}
function groupKeyOf(k: SpriteKey): string {
  if (k.kind === 'xbld') { const id = k.id; if (id <= 0x0d) return 'xbld ground/trees'; if (id <= 0x1c) return 'xbld power'; if (id <= 0x2b) return 'xbld road'; if (id <= 0x3e) return 'xbld rail'; if (id <= 0x6f) return `xbld special ${FOOTPRINT[id] === 2 ? '2x2' : '1x1'}`; return `xbld buildings ${FOOTPRINT[id]}x${FOOTPRINT[id]}`; }
  if (k.kind === 'overlay') return (k.id === OverlayId.EdgeWallL || k.id === OverlayId.EdgeWallR) ? 'overlay edgewall' : 'overlay';
  if (k.kind === 'terrain') return k.variant === 0x80 ? 'terrain underground' : `terrain alt${(k.variant ?? 0) >> 2}`;
  return k.kind;
}

function toRgba(cv: Canvas, rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cv.w * cv.h * 4);
  for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
    const k = y * cv.w + x, v = cv.data[k]!;
    if (v === 0) { const g = ((x >> 3) + (y >> 3)) & 1 ? 46 : 38; out[k * 4] = g; out[k * 4 + 1] = g; out[k * 4 + 2] = g + 6; out[k * 4 + 3] = 255; }
    else { out[k * 4] = rgba[v * 4]!; out[k * 4 + 1] = rgba[v * 4 + 1]!; out[k * 4 + 2] = rgba[v * 4 + 2]!; out[k * 4 + 3] = 255; }
  }
  return out;
}

let ZOOM = 1;
function cropPng(cv: Canvas, h: number, store: boolean, zoom = 1): Uint8Array {
  const cut = new Canvas(cv.w * zoom, Math.min(cv.h, h) * zoom);
  for (let y = 0; y < cut.h; y++) for (let x = 0; x < cut.w; x++) cut.data[y * cut.w + x] = cv.data[((y / zoom) | 0) * cv.w + ((x / zoom) | 0)]!;
  return encodePng(toRgba(cut, buildPalette().rgba), cut.w, cut.h, store);
}
/** 全表 + 每组一张（文件名后缀为组名）。 */
function buildSheet(scale: NativeScale, store: boolean): { all: Uint8Array; groups: Map<string, Uint8Array>; count: number; ms: number } {
  const groups = requiredKeyGroups();
  const buckets = new Map<string, Cell[]>();
  let count = 0;
  const t0 = Date.now();
  for (const g of groups) for (const key of g.keys) {
    const bmp = generate(key, scale);
    if (!bmp) continue;
    count++;
    const gk = groupKeyOf(key);
    if (!buckets.has(gk)) buckets.set(gk, []);
    buckets.get(gk)!.push({ key, bmp });
  }
  const ms = Date.now() - t0;
  const W = scale === 'L' ? 2048 : scale === 'M' ? 1400 : 1000;
  const cv = new Canvas(W, 24000);
  let y = 4;
  text(cv, 4, y, `sc2k art sheet ${scale}  ${count} sprites  ${ms} ms`, 2); y += 10;
  for (let k = 0; k < 256; k++) cv.rect(4 + (k % 64) * 8, y + Math.floor(k / 64) * 8, 8, 8, k);
  y += 40;
  const order = [...buckets.keys()].sort();
  const per = new Map<string, Uint8Array>();
  for (const name of order) {
    y += layoutGroup(cv, 4, y, name, buckets.get(name)!, W - 8);
    const gw = Math.round((scale === 'L' ? 1600 : scale === 'M' ? 1000 : 700) / ZOOM);
    const gcv = new Canvas(gw, 8000);
    const gh = layoutGroup(gcv, 4, 4, `${name} (${scale})`, buckets.get(name)!, gw - 8);
    per.set(name.replace(/[^a-z0-9]+/gi, '-'), cropPng(gcv, gh + 8, store, ZOOM));
  }
  return { all: cropPng(cv, y + 4, store), groups: per, count, ms };
}

// ---------- 演示小城 ----------
interface Placed { x: number; y: number; key: SpriteKey; n?: number }
function buildDemo(scale: NativeScale): Uint8Array {
  const sp = SCALES[scale];
  const N = 14;
  // 右上台地：角点 (cx ≥ 10, cy ≤ 3) 高 1 级；地块基准海拔 = 最低角，坡面码由角位反查
  const cornerHigh = (cx: number, cy: number): number => (cx >= 10 && cy <= 3 ? 1 : 0);
  const alt = (x: number, y: number): number => Math.min(cornerHigh(x, y), cornerHigh(x + 1, y), cornerHigh(x, y + 1), cornerHigh(x + 1, y + 1));
  const xter = (x: number, y: number): number => { const b = alt(x, y); const bits = ((cornerHigh(x, y) - b) << 3) | ((cornerHigh(x + 1, y) - b) << 2) | ((cornerHigh(x, y + 1) - b) << 1) | (cornerHigh(x + 1, y + 1) - b); return Math.max(0, CORNERS_TO_SLOPE[bits] ?? 0); };
  const water = (x: number, y: number): boolean => x <= 1 && y >= 10;
  const items: Placed[] = [];
  const put = (x: number, y: number, key: SpriteKey, n = 1): void => { items.push({ x, y, key, n }); };
  // 道路网格：y=5 与 y=9 横向，x=4 与 x=8 纵向
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    const onH = y === 5 || y === 9, onV = x === 4 || x === 8;
    if (water(x, y)) continue;
    if (onH && onV) put(x, y, { kind: 'xbld', id: 0x2b });
    else if (onH) put(x, y, { kind: 'xbld', id: 0x1d });
    else if (onV) put(x, y, { kind: 'xbld', id: 0x1e });
  }
  // 铁路 y=12 横向 + 电线 x=12 纵向（跨路用交叉件）
  for (let x = 2; x < N; x++) if (x !== 4 && x !== 8) put(x, 12, { kind: 'xbld', id: 0x2c }); else put(x, 12, { kind: 'xbld', id: 0x46 });
  for (let y = 4; y < 12; y++) if (y !== 5 && y !== 9) put(12, y, { kind: 'xbld', id: 0x0f }); else put(12, y, { kind: 'xbld', id: 0x43 });
  // 建筑
  const blds: Array<[number, number, number]> = [
    [0, 0, 0x70], [1, 0, 0x74], [2, 0, 0x78], [3, 0, 0x7d], [0, 1, 0x71], [1, 1, 0x75], [2, 1, 0x79], [3, 1, 0x80], [0, 2, 0x72], [1, 2, 0x76], [2, 2, 0x7a], [3, 2, 0x7e],
    [0, 3, 0x73], [1, 3, 0x77], [2, 3, 0x7b], [3, 3, 0x7c], [0, 4, 0x06], [1, 4, 0x0d], [2, 4, 0x09], [3, 4, 0x0c],
    [5, 0, 0x8c], [5, 2, 0x96], [5, 6, 0xd3], [5, 10, 0xeb], [9, 6, 0xb3], [0, 6, 0xd5], [0, 10, 0x0b], [3, 6, 0x81], [3, 7, 0x83], [3, 8, 0x82],
    [9, 10, 0xa0], [11, 10, 0x9e], [13, 6, 0x85], [13, 7, 0x84], [13, 8, 0x87], [10, 0, 0x8f], [10, 2, 0x07], [11, 2, 0x08], [12, 0, 0x74], [12, 1, 0x72], [12, 2, 0x0a], [13, 0, 0x0a], [13, 1, 0x08], [13, 2, 0x07],
    [2, 13, 0xe9], [5, 13, 0xcf], [9, 13, 0x1d], [3, 10, 0xd0], [3, 13, 0x0d], [7, 0, 0x9a], [7, 2, 0x7f], [7, 3, 0x87], [7, 6, 0xf5], [7, 10, 0xec],
  ];
  for (const [x, y, id] of blds) put(x, y, { kind: 'xbld', id }, FOOTPRINT[id]!);
  put(3, 11, { kind: 'xbld', id: 0x88 }); put(6, 13, { kind: 'xbld', id: 0x8a });
  // 排序：按 (x+y) 再 x；多格建筑按渲染锚格 (x+n−1, y+n−1)
  const anchorOf = (p: Placed): [number, number] => [p.x + (p.n ?? 1) - 1, p.y + (p.n ?? 1) - 1];
  items.sort((a, b) => { const [ax, ay] = anchorOf(a), [bx, by] = anchorOf(b); return (ax + ay) - (bx + by) || ax - bx; });
  const ox = N * sp.W / 2 + sp.W, oy = sp.LEVEL * 2 + sp.H * 4;
  const cw = (N + 2) * sp.W, chh = Math.round((N + 2) * sp.H + sp.LEVEL * 2 + 5 * sp.W);
  const cv = new Canvas(cw, chh);
  const screen = (x: number, y: number, h: number): [number, number] => [ox + (x - y) * sp.W / 2, oy + (x + y) * sp.H / 2 - h * sp.LEVEL];
  // 地形
  for (let s = 0; s < 2 * N; s++) for (let x = 0; x < N; x++) {
    const y = s - x; if (y < 0 || y >= N) continue;
    const [sx, sy] = screen(x, y, alt(x, y));
    if (water(x, y)) {
      const shape = (x === 1 && y === 10) ? 0 : x === 1 ? 2 : y === 10 ? 1 : 0;   // 简化岸形
      const t = generate({ kind: 'terrain', id: 0, variant: 0 }, scale)!; cv.blit(t, sx - t.anchorX, sy + sp.H - t.anchorY);
      const w = generate({ kind: 'water', id: shape, variant: shape === 0 ? 1 : 0 }, scale)!; cv.blit(w, sx - w.anchorX, sy + sp.H - w.anchorY);
      continue;
    }
    const t = generate({ kind: 'terrain', id: xter(x, y), variant: ((x * 7 + y * 3) & 3) + (alt(x, y) ? 0 : 0) }, scale)!;
    cv.blit(t, sx - t.anchorX, sy + sp.H - t.anchorY);
    if (x === N - 1) { const e = generate({ kind: 'overlay', id: OverlayId.EdgeWallR, variant: 2 + alt(x, y) }, scale)!; cv.blit(e, sx - e.anchorX, sy + sp.H - e.anchorY); }
    if (y === N - 1) { const e = generate({ kind: 'overlay', id: OverlayId.EdgeWallL, variant: 2 + alt(x, y) }, scale)!; cv.blit(e, sx - e.anchorX, sy + sp.H - e.anchorY); }
  }
  // 物件（按深度）
  for (const p of items) {
    const [ax, ay] = anchorOf(p);
    const [sx, sy] = screen(ax, ay, alt(ax, ay));
    const b = generate(p.key, scale); if (!b) continue;
    cv.blit(b, sx - b.anchorX, sy + sp.H - b.anchorY);
  }
  // 几个叠加：断电图标、火、光标
  for (const [x, y, id] of [[3, 7, OverlayId.NoPower], [13, 7, OverlayId.Fire], [6, 7, OverlayId.CursorTile], [11, 13, OverlayId.Sign]] as const) { const [sx, sy] = screen(x, y, 0); const b = generate({ kind: 'overlay', id }, scale)!; cv.blit(b, sx - b.anchorX, sy + sp.H - b.anchorY); }
  const tor = generate({ kind: 'actor', id: 8 }, scale)!; { const [sx, sy] = screen(7, 11, 0); cv.blit(tor, sx - tor.anchorX, sy + sp.H - tor.anchorY); }
  return encodePng(toRgba(cv, buildPalette().rgba), cv.w, cv.h);
}

function main(argv: string[]): number {
  const arg = (name: string, def: string): string => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1]! : def; };
  const scaleArg = arg('--scale', 'all');
  const out = resolve(PKG, arg('--out', 'docs/art-preview'));
  const copy = argv.includes('--copy') ? resolve(arg('--copy', '')) : null;
  const demo = !argv.includes('--no-demo');
  const store = argv.includes('--store');
  const split = !argv.includes('--no-split');
  ZOOM = Math.max(1, Math.min(4, parseInt(arg('--zoom', '1'), 10) || 1));
  mkdirSync(out, { recursive: true });
  if (copy) mkdirSync(copy, { recursive: true });
  const scales: NativeScale[] = scaleArg === 'all' ? ['S', 'M', 'L'] : [scaleArg as NativeScale];
  for (const s of scales) {
    const sheet = buildSheet(s, store);
    const f = resolve(out, `art-sheet-${s}.png`);
    writeFileSync(f, sheet.all);
    console.log(`[art-sheet] ${f} (${sheet.all.length} bytes, ${sheet.count} sprites, ${sheet.ms} ms)`);
    if (copy) copyFileSync(f, resolve(copy, `art-sheet-${s}.png`));
    if (split) { const gd = resolve(out, `groups-${s}`); mkdirSync(gd, { recursive: true }); for (const [name, png] of sheet.groups) writeFileSync(resolve(gd, `${name}.png`), png); console.log(`[art-sheet] ${gd}/ (${sheet.groups.size} group sheets)`); }
    if (demo) {
      const d = buildDemo(s); const df = resolve(out, `demo-city-${s}.png`); writeFileSync(df, d);
      console.log(`[art-sheet] ${df} (${d.length} bytes)`);
      if (copy) copyFileSync(df, resolve(copy, `demo-city-${s}.png`));
    }
  }
  return 0;
}
process.exit(main(process.argv.slice(2)));

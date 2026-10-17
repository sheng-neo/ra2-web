// ===== io/assets/sprites/archive.ts =====（spec:file-formats §2.6.1–§2.6.2、§3.5）
// Win95 精灵文件（LARGE / SMALLMED / SPECIAL.DAT）的索引解析与逐精灵像素解码。纯函数、无 DOM；只认字节，不认识 SpriteKey。
//  - 头：u16 BE count + 10 B × n（id u16 / offset u32 / height u16 / width u16，全部大端）；条目长度 = 按 offset 排序后的"下一偏移 − 本偏移"。
//  - 同 ID 重复：默认取先出现者（duplicatePolicy 'first'），重复项记入 duplicates 并出 DUPLICATE_SPRITE_ID 诊断。
//  - 像素行：[rowLen][0x01] + 块序列 [n][mode]；mode 0 空 / 2 结束 / 3 跳过 n 透明 / 4 n 个索引（奇数补 1 字节 0）。索引 0 是合法黑色，透明只来自跳过与行尾。
import type { Diagnostic } from '../../../contracts/system';
import type { ReadResult } from '../../../contracts/io';
import { AssetFormatError, ByteReader } from './bytes';

export type SpriteFileKind = 'LARGE' | 'SMALLMED' | 'SPECIAL';
export interface SpriteEntry { id: number; offset: number; width: number; height: number; length: number; order: number }
export interface DuplicateEntry { id: number; kept: SpriteEntry; dropped: SpriteEntry; identical: boolean }
export interface SpriteArchive {
  file: SpriteFileKind;
  entries: Map<number, SpriteEntry>;     // 去重后
  duplicates: DuplicateEntry[];          // 被丢弃的重复条目
  bytes: Uint8Array;                     // 原始文件
  badEntries: number;                    // 被跳过的坏索引条目数
}
export type DuplicatePolicy = 'first' | 'last';
export interface ParseSpriteOptions { duplicatePolicy?: DuplicatePolicy }
/** 解码出的 8 位索引位图；透明由 opaque 掩码表示（索引 0 是合法颜色）。 */
export interface DecodedSprite { id: number; w: number; h: number; index: Uint8Array; opaque: Uint8Array }
export interface DecodeSpriteOptions { allowUnpaddedOddRuns?: boolean }

export const SPRITE_HEADER_BYTES = 2, SPRITE_INDEX_ENTRY_BYTES = 10, SPRITE_MAX_DIM = 4096;
/** large 平地精灵（1256）的期望尺寸：LARGE_SANITY 与 DAT_ALIGN_SUSPECT 诊断用。 */
export const LARGE_FLAT_ID = 1256, LARGE_FLAT_W = 32, LARGE_FLAT_H = 17;

const diag = (level: Diagnostic['level'], code: string, message: string, at?: string): Diagnostic => (at === undefined ? { level, code, message } : { level, code, message, at });

const bytesEqual = (b: Uint8Array, a: number, c: number, n: number): boolean => {
  if (a + n > b.length || c + n > b.length) return false;
  for (let k = 0; k < n; k++) if (b[a + k] !== b[c + k]) return false;
  return true;
};

/**
 * 解析索引（§3.5.2）。头部截断（2 + 10·count > 文件长）抛 AssetFormatError('SPRITE_HEADER_TRUNCATED')；
 * 单条越界 / 零尺寸 / 超 4096 只记 BAD_ENTRY 并跳过。LARGE 缺 1256 或尺寸不是 32×17 记 LARGE_SANITY（warn）。
 */
export function parseSpriteArchive(buf: ArrayBuffer | Uint8Array, file: SpriteFileKind, opts: ParseSpriteOptions = {}): ReadResult<SpriteArchive> {
  const policy: DuplicatePolicy = opts.duplicatePolicy ?? 'first';
  const diagnostics: Diagnostic[] = [];
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const total = bytes.length;
  if (total < SPRITE_HEADER_BYTES) throw new AssetFormatError('SPRITE_HEADER_TRUNCATED', `${file}: 文件不足 2 字节`);
  const r = new ByteReader(bytes);
  const count = r.u16be();
  if (SPRITE_HEADER_BYTES + SPRITE_INDEX_ENTRY_BYTES * count > total) {
    throw new AssetFormatError('SPRITE_HEADER_TRUNCATED', `${file}: 索引声明 ${count} 条（${SPRITE_HEADER_BYTES + SPRITE_INDEX_ENTRY_BYTES * count} B）超过文件长度 ${total}`);
  }
  const raw: SpriteEntry[] = [];
  let badEntries = 0;
  for (let k = 0; k < count; k++) {
    const id = r.u16be(), offset = r.u32be(), height = r.u16be(), width = r.u16be();
    if (offset >= total || width === 0 || height === 0 || width > SPRITE_MAX_DIM || height > SPRITE_MAX_DIM) {
      badEntries++;
      diagnostics.push(diag('warn', 'BAD_ENTRY', `${file}: 索引 #${k}（id ${id}）越界或尺寸非法（offset ${offset}, ${width}×${height}）`, `${file}:${id}`));
      continue;
    }
    raw.push({ id, offset, width, height, length: 0, order: k });
  }
  // 长度 = 下一个（严格更大的）偏移 − 本偏移；末条到文件尾。不依赖索引已按偏移排序。
  const sorted = raw.slice().sort((a, b) => a.offset - b.offset || a.order - b.order);
  for (let k = 0; k < sorted.length; k++) {
    const e = sorted[k]!;
    let next = total;
    for (let j = k + 1; j < sorted.length; j++) { const o = sorted[j]!.offset; if (o > e.offset) { next = o; break; } }
    e.length = next - e.offset;
  }
  const entries = new Map<number, SpriteEntry>();
  const duplicates: DuplicateEntry[] = [];
  for (const e of raw) {
    const prev = entries.get(e.id);
    if (!prev) { entries.set(e.id, e); continue; }
    const kept = policy === 'first' ? prev : e;
    const dropped = policy === 'first' ? e : prev;
    const identical = prev.width === e.width && prev.height === e.height && prev.length === e.length && bytesEqual(bytes, prev.offset, e.offset, e.length);
    duplicates.push({ id: e.id, kept, dropped, identical });
    entries.set(e.id, kept);
    diagnostics.push(diag(identical ? 'info' : 'warn', 'DUPLICATE_SPRITE_ID', `${file}: id ${e.id} 出现两次（${identical ? '字节相同' : '字节不同'}，采用${policy === 'first' ? '先' : '后'}出现者）`, `${file}:${e.id}`));
  }
  if (file === 'LARGE') {
    const flat = entries.get(LARGE_FLAT_ID);
    if (!flat || flat.width !== LARGE_FLAT_W || flat.height !== LARGE_FLAT_H) {
      diagnostics.push(diag('warn', 'LARGE_SANITY', flat ? `LARGE: 1256 尺寸为 ${flat.width}×${flat.height}，期望 32×17` : 'LARGE: 缺少 1256（large 平地）', 'LARGE:1256'));
    }
  }
  return { value: { file, entries, duplicates, bytes, badEntries }, diagnostics };
}

/**
 * 解码单个精灵（§3.5.3）。容错：坏行标志 / 坏 mode / 行溢出只记诊断；行数达 height、遇 mode 2 或数据用尽即结束，剩余行透明。
 * allowUnpaddedOddRuns：MIF 路径——奇数长度 mode 4 之后仅当下一字节为 0 时才吃掉填充。
 */
export function decodeSprite(a: SpriteArchive, e: SpriteEntry, opts: DecodeSpriteOptions = {}): ReadResult<DecodedSprite> {
  const allowUnpadded = opts.allowUnpaddedOddRuns === true;
  const diagnostics: Diagnostic[] = [];
  const w = e.width, h = e.height;
  const index = new Uint8Array(w * h), opaque = new Uint8Array(w * h);
  const bytes = a.bytes;
  const at = `${a.file}:${e.id}`;
  let p = e.offset;
  const end = Math.min(e.offset + e.length, bytes.length);
  let y = 0;
  let badModeReported = false, overflowReported = false, badFlagReported = false;
  while (p + 2 <= end && y < h) {
    const len = bytes[p]!, flag = bytes[p + 1]!;
    p += 2;
    if (flag === 2) break;                                               // 行头位置的结束标志
    if (flag !== 1 && !badFlagReported) { badFlagReported = true; diagnostics.push(diag('warn', 'BAD_ROW_FLAG', `${at}: 第 ${y} 行行头标志 ${flag}（期望 1）`, at)); }
    const rowEnd = Math.min(p + len, end);
    let x = 0, finished = false;
    while (p + 2 <= rowEnd) {
      const n = bytes[p]!, mode = bytes[p + 1]!;
      p += 2;
      if (mode === 0) continue;
      if (mode === 2) { finished = true; break; }
      if (mode === 3) { x += n; continue; }
      if (mode === 4) {
        const room = Math.max(0, w - x);
        const take = Math.min(n, room, Math.max(0, rowEnd - p));
        const base = y * w + x;
        for (let k = 0; k < take; k++) { index[base + k] = bytes[p + k]!; opaque[base + k] = 1; }
        if (n > room && !overflowReported) { overflowReported = true; diagnostics.push(diag('warn', 'ROW_OVERFLOW', `${at}: 第 ${y} 行像素超出宽度 ${w}`, at)); }
        p += n;
        if (n & 1) { if (!allowUnpadded || (p < rowEnd && bytes[p] === 0)) p += 1; }
        x += n;
        continue;
      }
      if (!badModeReported) { badModeReported = true; diagnostics.push(diag('warn', 'BAD_MODE', `${at}: 第 ${y} 行出现未知块模式 ${mode}`, at)); }
      p = rowEnd;                                                        // 跳过本行其余
    }
    p = Math.max(p, rowEnd);
    y += 1;
    if (finished) break;
  }
  return { value: { id: e.id, w, h, index, opaque }, diagnostics };
}

/** 解码整个档案（跳过失败项，诊断汇总）。 */
export function decodeAll(a: SpriteArchive, opts: DecodeSpriteOptions = {}): ReadResult<Map<number, DecodedSprite>> {
  const out = new Map<number, DecodedSprite>();
  const diagnostics: Diagnostic[] = [];
  for (const e of a.entries.values()) {
    const r = decodeSprite(a, e, opts);
    out.set(e.id, r.value);
    for (const d of r.diagnostics) diagnostics.push(d);
  }
  return { value: out, diagnostics };
}

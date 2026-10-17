// ===== io/assets/sprites/bundle.ts =====（spec:file-formats §3.5–§3.7、§3.9.6；ARCHITECTURE §9.3）
// 一次性把玩家的 LARGE / SMALLMED / SPECIAL.DAT + PAL_MSTR.BMP 解成"索引图集 + 帧表 + IdLayout + 调色板 + 诊断"（DatBundle）。
// 纯函数、无 DOM：Worker 与主线程回退路径共用；import/ 层负责 Blob / IndexedDB 包装。DECODER_VERSION 变更 → 缓存键失效。
import type { Diagnostic } from '../../../contracts/system';
import type { Palette } from '../../../contracts/render';
import type { DecodedSprite, DuplicatePolicy, SpriteFileKind } from './archive';
import { LARGE_FLAT_H, LARGE_FLAT_ID, LARGE_FLAT_W, decodeSprite, parseSpriteArchive } from './archive';
import type { AtlasFrame, AtlasPage } from './atlas';
import { packSprites } from './atlas';
import type { IdLayout } from './ids';
import { buildIdLayout } from './ids';
import { AssetFormatError } from './bytes';
import { readPaletteBmp } from '../palette/bmp';

/** 解码器版本：改变解码 / 装箱 / 锚点 / IdLayout 规则时 +1，使 IndexedDB 中的 decoded 缓存自动失效。 */
export const DECODER_VERSION = 1;

export interface DecodeBundleInput {
  large?: ArrayBuffer | Uint8Array; smallmed?: ArrayBuffer | Uint8Array; special?: ArrayBuffer | Uint8Array; palette?: ArrayBuffer | Uint8Array;
  duplicatePolicy?: DuplicatePolicy; allowUnpaddedOddRuns?: boolean;
}
export interface DatBundle {
  pages: AtlasPage[]; frames: Map<number, AtlasFrame>; idLayout: IdLayout;
  palette: Palette | null; diagnostics: Diagnostic[];
  spriteCount: number; files: SpriteFileKind[];
}

const FILE_ORDER: readonly { key: 'smallmed' | 'special' | 'large'; kind: SpriteFileKind }[] = [
  { key: 'smallmed', kind: 'SMALLMED' }, { key: 'special', kind: 'SPECIAL' }, { key: 'large', kind: 'LARGE' },
];

export function decodeBundle(input: DecodeBundleInput): DatBundle {
  const diagnostics: Diagnostic[] = [];
  const sprites = new Map<number, DecodedSprite>();
  const owner = new Map<number, SpriteFileKind>();
  const files: SpriteFileKind[] = [];
  const decodeOpts = input.allowUnpaddedOddRuns === undefined ? {} : { allowUnpaddedOddRuns: input.allowUnpaddedOddRuns };
  const parseOpts = input.duplicatePolicy === undefined ? {} : { duplicatePolicy: input.duplicatePolicy };
  for (const { key, kind } of FILE_ORDER) {
    const buf = input[key];
    if (!buf) continue;
    let archive;
    try { archive = parseSpriteArchive(buf, kind, parseOpts); }
    catch (e) {
      const code = e instanceof AssetFormatError ? e.code : 'SPRITE_PARSE_FAILED';
      diagnostics.push({ level: 'error', code, message: `${kind}: ${e instanceof Error ? e.message : String(e)}`, at: kind });
      continue;
    }
    files.push(kind);
    for (const d of archive.diagnostics) diagnostics.push(d);
    let overrides = 0;
    for (const e of archive.value.entries.values()) {
      const r = decodeSprite(archive.value, e, decodeOpts);
      for (const d of r.diagnostics) diagnostics.push(d);
      const prevOwner = owner.get(e.id);
      if (prevOwner !== undefined && prevOwner !== kind) overrides++;           // 跨文件同号：后读的文件（SPECIAL 在 SMALLMED 之后）覆盖，§2.6.5
      sprites.set(e.id, r.value);
      owner.set(e.id, kind);
    }
    if (overrides > 0) diagnostics.push({ level: 'info', code: 'SPECIAL_OVERRIDE', message: `${kind} 覆盖了 ${overrides} 个与先前文件同号的精灵`, at: kind });
  }
  // 1256 对齐诊断（spec:ui-art §3.2.6）：首行与末行都应是居中 2 px 的顶点行。
  const flat = sprites.get(LARGE_FLAT_ID);
  if (flat && !flatLooksAligned(flat)) diagnostics.push({ level: 'warn', code: 'DAT_ALIGN_SUSPECT', message: `LARGE 1256 的首 / 末行不是居中 2 px 顶点行（${flat.w}×${flat.h}），仍按默认锚点显示`, at: 'LARGE:1256' });
  const packed = packSprites(sprites.values());
  const idLayout = buildIdLayout((abs) => sprites.has(abs), (abs) => { const s = sprites.get(abs); return s ? { w: s.w, h: s.h } : undefined; }, diagnostics);
  let palette: Palette | null = null;
  if (input.palette) {
    try { const r = readPaletteBmp(input.palette); palette = r.value; for (const d of r.diagnostics) diagnostics.push(d); }
    catch (e) { diagnostics.push({ level: 'error', code: e instanceof AssetFormatError ? e.code : 'PALETTE_FORMAT', message: e instanceof Error ? e.message : String(e), at: 'PAL_MSTR' }); }
  } else if (sprites.size > 0) {
    diagnostics.push({ level: 'warn', code: 'PALETTE_MISSING', message: '有精灵文件但没有调色板（BITMAPS/PAL_MSTR.BMP）', at: 'PAL_MSTR' });
  }
  return { pages: packed.pages, frames: packed.frames, idLayout, palette, diagnostics, spriteCount: sprites.size, files };
}

function flatLooksAligned(s: DecodedSprite): boolean {
  if (s.w !== LARGE_FLAT_W || s.h !== LARGE_FLAT_H) return false;
  const rowOpaque = (y: number): number[] => { const xs: number[] = []; for (let x = 0; x < s.w; x++) if (s.opaque[y * s.w + x]) xs.push(x); return xs; };
  const centered = (xs: number[]): boolean => xs.length === 2 && xs[0] === s.w / 2 - 1 && xs[1] === s.w / 2;
  return centered(rowOpaque(0)) && centered(rowOpaque(s.h - 1));
}

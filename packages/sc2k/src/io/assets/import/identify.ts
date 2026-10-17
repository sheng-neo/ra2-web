// ===== io/assets/import/identify.ts =====（spec:file-formats §3.9.3；ARCHITECTURE §9.1）
// 文件识别：文件名（不分大小写）+ 魔数 / 快速校验。文件名不匹配但魔数匹配时按魔数采信（IDENTIFIED_BY_MAGIC / NAME_MISMATCH）；
// 文件名匹配但魔数失败 → UNKNOWN + BAD_MAGIC。纯函数部分只吃 (name, size, head) 以便在 Node 测试；identifyFile 读 File 的前 HEAD_BYTES 字节。
import type { AssetKind, IdentifiedFile } from '../../../contracts/assets';
import type { Diagnostic } from '../../../contracts/system';
import { peekAscii, peekU16be, peekU32be, peekU32le } from '../sprites/bytes';
import { SPRITE_HEADER_BYTES, SPRITE_INDEX_ENTRY_BYTES, SPRITE_MAX_DIM } from '../sprites/archive';
import { ZOOM_BASE } from '../sprites/ids';
import { PALETTE_BMP_SIDE, looksLikePaletteBmp, readBmpHead } from '../palette/bmp';

/** 读取用于识别的头部字节数（覆盖 Mac 存档 0x80 处的 FORM 头与 BMP 的 54 字节信息头）。 */
export const HEAD_BYTES = 160;
export const SC2_FORM_OFFSETS = [0, 0x80] as const;

const NAME_TABLE: Readonly<Record<string, AssetKind>> = {
  'LARGE.DAT': 'LARGE', 'SMALLMED.DAT': 'SMALLMED', 'SPECIAL.DAT': 'SPECIAL',
  'PAL_MSTR.BMP': 'PAL_MSTR', 'PAL_STTC.BMP': 'PAL_STTC', 'PAL_MAC.BMP': 'PAL_MAC',
  'DATA_USA.DAT': 'DATA_USA_DAT', 'DATA_USA.IDX': 'DATA_USA_IDX', 'TEXT_USA.DAT': 'TEXT_USA_DAT', 'TEXT_USA.IDX': 'TEXT_USA_IDX',
};
const EXT_TABLE: Readonly<Record<string, AssetKind>> = { SC2: 'SC2', SCN: 'SCN', MIF: 'MIF' };

export const baseNameOf = (path: string): string => { const parts = path.split(/[\\/]/); return parts[parts.length - 1] ?? path; };
/** 只按文件名判断（大小写不敏感；取路径末段）。 */
export function kindByName(name: string): AssetKind {
  const base = baseNameOf(name).toUpperCase();
  const byName = NAME_TABLE[base];
  if (byName) return byName;
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 ? base.slice(dot + 1) : '';
  return EXT_TABLE[ext] ?? 'UNKNOWN';
}

export type MagicFamily = 'sprite-large' | 'sprite-small' | 'palette' | 'sc2' | 'mif' | 'data-idx' | 'none';
export interface MagicResult { family: MagicFamily; note?: string }

/** 精灵文件快速校验：count、索引长度、前几条的偏移 / 尺寸、ID 落段。 */
function sniffSpriteArchive(head: Uint8Array, size: number): MagicResult | null {
  const count = peekU16be(head, 0);
  if (count === undefined || count === 0) return null;
  const headerLen = SPRITE_HEADER_BYTES + SPRITE_INDEX_ENTRY_BYTES * count;
  if (headerLen > size) return null;
  const n = Math.min(count, Math.floor((head.length - SPRITE_HEADER_BYTES) / SPRITE_INDEX_ENTRY_BYTES));
  if (n === 0) return null;
  let large = 0, small = 0;
  for (let k = 0; k < n; k++) {
    const at = SPRITE_HEADER_BYTES + k * SPRITE_INDEX_ENTRY_BYTES;
    const id = peekU16be(head, at)!, offset = peekU32be(head, at + 2)!, h = peekU16be(head, at + 6)!, w = peekU16be(head, at + 8)!;
    if (offset < headerLen || offset >= size) return null;
    if (w === 0 || h === 0 || w > SPRITE_MAX_DIM || h > SPRITE_MAX_DIM) return null;
    if (id >= ZOOM_BASE.large && id < ZOOM_BASE.large + 500) large++; else if (id < ZOOM_BASE.large) small++; else return null;
  }
  return large > small ? { family: 'sprite-large' } : { family: 'sprite-small' };
}

function sniffDataIdx(head: Uint8Array, size: number): boolean {
  if (size !== 48 || head.length < 48) return false;
  let prev = -1;
  for (let k = 0; k < 6; k++) { const off = peekU32le(head, k * 8 + 4)!; if (off <= prev) return false; prev = off; }
  return true;
}

/** 按魔数识别文件族（不看文件名）。 */
export function sniffMagic(head: Uint8Array, size: number): MagicResult {
  for (const at of SC2_FORM_OFFSETS) if (peekAscii(head, at, 4) === 'FORM' && peekAscii(head, at + 8, 4) === 'SCDH') return { family: 'sc2', ...(at ? { note: 'mac' } : {}) };
  if (peekAscii(head, 0, 4) === 'MIFF' && peekAscii(head, 8, 4) === 'SC2K') return { family: 'mif' };
  const bmp = readBmpHead(head);
  if (bmp.isBmp) {
    if (!looksLikePaletteBmp(bmp)) return { family: 'none', note: `BMP 位深 ${bmp.bitCount} / 颜色数 ${bmp.clrUsed}` };
    return bmp.width === PALETTE_BMP_SIDE && Math.abs(bmp.height) === PALETTE_BMP_SIDE ? { family: 'palette' } : { family: 'palette', note: `尺寸 ${bmp.width}×${bmp.height}` };
  }
  if (sniffDataIdx(head, size)) return { family: 'data-idx' };
  const sprite = sniffSpriteArchive(head, size);
  if (sprite) return sprite;
  return { family: 'none' };
}

const FAMILY_OF_KIND: Readonly<Record<AssetKind, MagicFamily | 'name-only'>> = {
  LARGE: 'sprite-large', SMALLMED: 'sprite-small', SPECIAL: 'sprite-small',
  PAL_MSTR: 'palette', PAL_STTC: 'palette', PAL_MAC: 'palette',
  SC2: 'sc2', SCN: 'sc2', MIF: 'mif', DATA_USA_IDX: 'data-idx',
  DATA_USA_DAT: 'name-only', TEXT_USA_DAT: 'name-only', TEXT_USA_IDX: 'name-only', UNKNOWN: 'none',
};
const DEFAULT_KIND_OF_FAMILY: Readonly<Record<Exclude<MagicFamily, 'none'>, AssetKind>> = {
  'sprite-large': 'LARGE', 'sprite-small': 'SMALLMED', palette: 'PAL_MSTR', sc2: 'SC2', mif: 'MIF', 'data-idx': 'DATA_USA_IDX',
};

export interface IdentifyResult { kind: AssetKind; nameKind: AssetKind; magic: MagicResult; byMagicOnly: boolean; diagnostics: Diagnostic[] }

/** 名字 + 魔数综合判断（§3.9.3 规则）。 */
export function identifyBytes(name: string, size: number, head: Uint8Array): IdentifyResult {
  const nameKind = kindByName(name);
  const magic = sniffMagic(head, size);
  const diagnostics: Diagnostic[] = [];
  const expected = FAMILY_OF_KIND[nameKind];
  const base = baseNameOf(name);
  if (nameKind !== 'UNKNOWN') {
    if (expected === 'name-only') {
      if (magic.family !== 'none') {                                   // 名字说是文本库，字节却是别的东西：按魔数
        const kind = DEFAULT_KIND_OF_FAMILY[magic.family];
        diagnostics.push({ level: 'info', code: 'NAME_MISMATCH', message: `${base} 的内容是 ${kind}，按内容采信`, at: base });
        return { kind, nameKind, magic, byMagicOnly: true, diagnostics };
      }
      return { kind: nameKind, nameKind, magic, byMagicOnly: false, diagnostics };
    }
    if (magic.family === expected) {
      if (magic.note && expected === 'palette') diagnostics.push({ level: 'info', code: 'PALETTE_DIMS', message: `${base}：${magic.note}（期望 16×16）`, at: base });
      return { kind: nameKind, nameKind, magic, byMagicOnly: false, diagnostics };
    }
    if (magic.family !== 'none') {
      const kind = DEFAULT_KIND_OF_FAMILY[magic.family];
      diagnostics.push({ level: 'warn', code: 'NAME_MISMATCH', message: `${base} 的文件名像 ${nameKind}，内容却是 ${kind}，按内容采信`, at: base });
      return { kind, nameKind, magic, byMagicOnly: true, diagnostics };
    }
    diagnostics.push({ level: 'error', code: 'BAD_MAGIC', message: `${base} 的内容不符合 ${nameKind} 的格式${magic.note ? `（${magic.note}）` : ''}`, at: base });
    return { kind: 'UNKNOWN', nameKind, magic, byMagicOnly: false, diagnostics };
  }
  if (magic.family === 'none') {
    diagnostics.push({ level: 'error', code: 'UNKNOWN_FILE', message: `无法识别 ${base}`, at: base });
    return { kind: 'UNKNOWN', nameKind, magic, byMagicOnly: false, diagnostics };
  }
  const kind = DEFAULT_KIND_OF_FAMILY[magic.family];
  diagnostics.push({ level: 'info', code: 'IDENTIFIED_BY_MAGIC', message: `${base} 按内容识别为 ${kind}`, at: base });
  return { kind, nameKind, magic, byMagicOnly: true, diagnostics };
}

/** 规格签名：identify(file, head) → AssetKind。 */
export const identify = (name: string, size: number, head: Uint8Array): AssetKind => identifyBytes(name, size, head).kind;

/** 读取 File 的前 HEAD_BYTES 字节后识别。 */
export async function identifyFile(file: File): Promise<{ identified: IdentifiedFile; result: IdentifyResult }> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const result = identifyBytes(file.name, file.size, head);
  return { identified: { kind: result.kind, name: file.name, size: file.size, lastModified: file.lastModified, file }, result };
}

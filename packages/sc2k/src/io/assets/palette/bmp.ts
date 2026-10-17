// ===== io/assets/palette/bmp.ts =====（spec:file-formats §2.7.1、§3.6.1）
// PAL_MSTR.BMP 等 8 bpp 16×16 Windows BMP 的颜色表读取：只用 54 字节头后的 256 × [B,G,R,X]，不依赖像素区。
// 产出契约 Palette（rgba 256×4，alpha 恒 255：透明由精灵的 opaque 掩码表达；cycles v1 为空——DAT 静态显示）。
// writePaletteBmp 只给测试夹具 / 工具生成原创调色板文件用。
import type { Palette } from '../../../contracts/render';
import type { Diagnostic } from '../../../contracts/system';
import type { ReadResult } from '../../../contracts/io';
import { AssetFormatError, ByteReader, ByteWriter, peekAscii, peekU16le, peekU32le } from '../sprites/bytes';

export const PALETTE_ENTRIES = 256;
export const BMP_FILE_HEADER_BYTES = 14, BMP_INFO_HEADER_BYTES = 40, BMP_COLOR_TABLE_OFFSET = 54;
export const PALETTE_BMP_SIDE = 16;

export interface BmpHead { isBmp: boolean; fileSize: number; offBits: number; infoSize: number; width: number; height: number; bitCount: number; compression: number; clrUsed: number }
/** 只看头部字段（identify 与 readPaletteBmp 共用；不抛错）。 */
export function readBmpHead(b: Uint8Array): BmpHead {
  return {
    isBmp: peekAscii(b, 0, 2) === 'BM',
    fileSize: peekU32le(b, 2) ?? 0, offBits: peekU32le(b, 10) ?? 0, infoSize: peekU32le(b, 14) ?? 0,
    width: (peekU32le(b, 18) ?? 0) | 0, height: (peekU32le(b, 22) ?? 0) | 0,
    bitCount: peekU16le(b, 28) ?? 0, compression: peekU32le(b, 30) ?? 0, clrUsed: peekU32le(b, 46) ?? 0,
  };
}
/** 是否像一张原版调色板 BMP：8 bpp、未压缩、颜色数 0 / 256（宽高 16×16 另由诊断提示）。 */
export const looksLikePaletteBmp = (h: BmpHead): boolean => h.isBmp && h.bitCount === 8 && h.compression === 0 && (h.clrUsed === 0 || h.clrUsed === PALETTE_ENTRIES);

/** 读取颜色表 → Palette。非 BMP / 非 8 bpp / 颜色数非 0 或 256 / 颜色表截断 → 抛 AssetFormatError('PALETTE_FORMAT')。 */
export function readPaletteBmp(buf: ArrayBuffer | Uint8Array): ReadResult<Palette> {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const diagnostics: Diagnostic[] = [];
  const head = readBmpHead(bytes);
  if (!head.isBmp) throw new AssetFormatError('PALETTE_FORMAT', '不是 BMP 文件（缺少 "BM" 标志）');
  if (head.bitCount !== 8) throw new AssetFormatError('PALETTE_FORMAT', `调色板位深 ${head.bitCount}，期望 8 bpp`);
  if (head.compression !== 0) throw new AssetFormatError('PALETTE_FORMAT', `调色板压缩方式 ${head.compression}，期望 0`);
  if (head.clrUsed !== 0 && head.clrUsed !== PALETTE_ENTRIES) throw new AssetFormatError('PALETTE_FORMAT', `颜色数 ${head.clrUsed}，期望 0 或 256`);
  const tableAt = BMP_FILE_HEADER_BYTES + Math.max(BMP_INFO_HEADER_BYTES, head.infoSize);
  if (tableAt + PALETTE_ENTRIES * 4 > bytes.length) throw new AssetFormatError('PALETTE_FORMAT', `颜色表截断（需要 ${tableAt + PALETTE_ENTRIES * 4} B，文件 ${bytes.length} B）`);
  if (head.infoSize !== BMP_INFO_HEADER_BYTES) diagnostics.push({ level: 'info', code: 'PALETTE_HEADER', message: `BITMAPINFOHEADER 长度 ${head.infoSize}（常见为 40），按其后读取颜色表` });
  if (head.fileSize !== bytes.length) diagnostics.push({ level: 'info', code: 'PALETTE_SIZE', message: `文件头声明长度 ${head.fileSize} 与实际 ${bytes.length} 不一致（只用颜色表，忽略）` });
  if (head.width !== PALETTE_BMP_SIDE || Math.abs(head.height) !== PALETTE_BMP_SIDE) diagnostics.push({ level: 'warn', code: 'PALETTE_DIMS', message: `调色板位图尺寸 ${head.width}×${head.height}，期望 16×16` });
  const r = new ByteReader(bytes);
  r.seek(tableAt);
  const rgba = new Uint8ClampedArray(PALETTE_ENTRIES * 4);
  for (let i = 0; i < PALETTE_ENTRIES; i++) {
    const bl = r.u8(), g = r.u8(), rd = r.u8(); r.u8();
    rgba[i * 4] = rd; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = bl; rgba[i * 4 + 3] = 255;
  }
  return { value: { rgba, cycles: [] }, diagnostics };
}

/**
 * 写出一张合法的 16×16 8 bpp BMP（像素区为恒等索引、自下而上）。rgb 可为 256×3 或 256×4（RGBA，忽略 alpha）。
 * 仅用于合成夹具与开发工具，不参与运行时。
 */
export function writePaletteBmp(rgb: ArrayLike<number>): ArrayBuffer {
  const stride = rgb.length >= PALETTE_ENTRIES * 4 ? 4 : 3;
  const pixelBytes = PALETTE_BMP_SIDE * PALETTE_BMP_SIDE;            // 行宽 16 已是 4 的倍数，无需补齐
  const offBits = BMP_COLOR_TABLE_OFFSET + PALETTE_ENTRIES * 4;
  const w = new ByteWriter(offBits + pixelBytes);
  w.ascii('BM').u32le(offBits + pixelBytes).u16le(0).u16le(0).u32le(offBits);
  w.u32le(BMP_INFO_HEADER_BYTES).u32le(PALETTE_BMP_SIDE).u32le(PALETTE_BMP_SIDE).u16le(1).u16le(8).u32le(0).u32le(pixelBytes).u32le(2835).u32le(2835).u32le(PALETTE_ENTRIES).u32le(PALETTE_ENTRIES);
  for (let i = 0; i < PALETTE_ENTRIES; i++) w.u8(rgb[i * stride + 2] ?? 0).u8(rgb[i * stride + 1] ?? 0).u8(rgb[i * stride] ?? 0).u8(0);
  for (let row = PALETTE_BMP_SIDE - 1; row >= 0; row--) for (let col = 0; col < PALETTE_BMP_SIDE; col++) w.u8(row * PALETTE_BMP_SIDE + col);
  return w.toArrayBuffer();
}

/**
 * SHP(TS) —— TS/RA2 世代精灵（步兵、建筑、动画、UI 图标）。
 * 头 8 字节：i16 zero, i16 cx, i16 cy, i16 帧数。
 * 帧头 24 字节：x, y, cx, cy (i16×4), compression(i32), radar(i32), zero(i32), offset(i32, 文件内绝对偏移)。
 * compression: bit1=0 → 原始字节；bit1=1 → 扫描线（每行 u16 行长含自身），
 * 其中 compression==3 时行内为 RLE-zero（0x00 后跟连零数），其余字节为字面像素。
 * offset==0 表示空帧。像素 0 为透明。
 */
import { BinaryReader } from './binary-reader';

export interface ShpFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 8bpp 调色板索引，width×height，0 = 透明。空帧为空数组。 */
  pixels: Uint8Array;
}

export interface ShpFile {
  /** 画布尺寸（所有帧共享的逻辑边界）。 */
  width: number;
  height: number;
  frames: ShpFrame[];
}

export function parseShp(bytes: Uint8Array): ShpFile {
  const buf = bytes.slice().buffer;
  const r = new BinaryReader(buf);
  const zero = r.u16();
  if (zero !== 0) throw new Error(`不是 SHP(TS) 文件（首字段应为 0，实为 ${zero}）`);
  const width = r.u16();
  const height = r.u16();
  const count = r.u16();
  // 健壮性：拒绝异常巨大的帧数/画布，防止坏数据导致 OOM/卡死
  if (count > 8192 || width > 8192 || height > 8192) {
    throw new Error(`SHP 头数值异常: ${width}x${height} ×${count}`);
  }

  const frames: ShpFrame[] = [];
  for (let i = 0; i < count; i++) {
    r.seek(8 + i * 24);
    const x = r.i16();
    const y = r.i16();
    const cx = r.i16();
    const cy = r.i16();
    const compression = r.i32();
    r.i32(); // radar 颜色
    r.i32(); // zero
    const offset = r.i32();

    if (offset === 0 || cx <= 0 || cy <= 0) {
      frames.push({ x, y, width: Math.max(cx, 0), height: Math.max(cy, 0), pixels: new Uint8Array(0) });
      continue;
    }

    const pixels = new Uint8Array(cx * cy);
    if ((compression & 2) === 0) {
      // 原始 8bpp
      r.seek(offset);
      pixels.set(r.bytes(cx * cy));
    } else {
      // 扫描线格式
      let lineStart = offset;
      for (let row = 0; row < cy; row++) {
        r.seek(lineStart);
        const lineLen = r.u16();
        const dataLen = lineLen - 2;
        let out = row * cx;
        if (compression === 3) {
          const end = r.offset + dataLen;
          while (r.offset < end) {
            const v = r.u8();
            if (v === 0) {
              out += r.u8(); // 连零（透明）跳过
            } else {
              pixels[out++] = v;
            }
          }
        } else {
          pixels.set(r.bytes(Math.min(dataLen, cx)), out);
        }
        lineStart += lineLen;
      }
    }
    frames.push({ x, y, width: cx, height: cy, pixels });
  }

  return { width, height, frames };
}

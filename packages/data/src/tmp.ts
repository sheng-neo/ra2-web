/**
 * TMP(TS) —— RA2 等距地形块文件（.tem/.sno/.urb）。
 * 头 16 字节：i32 横向块数, 纵向块数, 块宽 cx(60), 块高 cy(30)。
 * 随后 块数 个 i32 偏移（0 = 空块）。
 * 每块：52 字节头 + 菱形像素（cx*cy/2 字节）+ 可选 z 数据 + 可选 extra 图。
 * 菱形行宽：上半 4,8,…,cx 递增（行起点 x 自 cx/2-2 每行 -2），
 * 下半 cx-4,…,0 递减（x 每行 +2）。来源：XCC tmp_ts 实现。
 */
import { BinaryReader } from './binary-reader';

export interface TmpBlock {
  /** 世界像素偏移（相对模板原点）。 */
  x: number;
  y: number;
  /** 地形高度（0–14）。 */
  height: number;
  terrainType: number;
  rampType: number;
  hasZData: boolean;
  hasExtraData: boolean;
  /** cx×cy 矩形像素，0 = 透明（菱形外恒 0）。 */
  pixels: Uint8Array;
  /** 雷达色（左/右半，RGB 各 3 字节，6bit）。 */
  radarLeft: [number, number, number];
  radarRight: [number, number, number];
}

export interface TmpFile {
  blocksX: number;
  blocksY: number;
  /** 单块尺寸（RA2 恒 60×30）。 */
  blockWidth: number;
  blockHeight: number;
  blocks: (TmpBlock | null)[];
}

export function parseTmp(bytes: Uint8Array): TmpFile {
  const r = new BinaryReader(bytes.slice().buffer);
  const blocksX = r.i32();
  const blocksY = r.i32();
  const cx = r.i32();
  const cy = r.i32();
  if (blocksX <= 0 || blocksY <= 0 || cx <= 0 || cy !== cx >> 1) {
    throw new Error(`不是 TMP(TS) 文件（头异常: ${blocksX}×${blocksY}, ${cx}×${cy}）`);
  }

  const count = blocksX * blocksY;
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) offsets.push(r.i32());

  const blocks: (TmpBlock | null)[] = [];
  for (const off of offsets) {
    if (off === 0) {
      blocks.push(null);
      continue;
    }
    r.seek(off);
    const x = r.i32();
    const y = r.i32();
    r.i32(); // extra_ofs
    r.i32(); // z_ofs
    r.i32(); // extra_z_ofs
    r.i32(); // x_extra
    r.i32(); // y_extra
    r.i32(); // cx_extra
    r.i32(); // cy_extra
    const flags = r.u32();
    const height = r.i8();
    const terrainType = r.i8();
    const rampType = r.i8();
    const radarLeft: [number, number, number] = [r.u8(), r.u8(), r.u8()];
    const radarRight: [number, number, number] = [r.u8(), r.u8(), r.u8()];
    r.skip(3); // pad

    // 菱形 → 矩形
    const pixels = new Uint8Array(cx * cy);
    let w = 0;
    let sx = cx / 2;
    for (let row = 0; row < cy; row++) {
      if (row < cy / 2) {
        w += 4;
        sx -= 2;
      } else {
        w -= 4;
        sx += 2;
      }
      if (w > 0) {
        pixels.set(r.bytes(w), row * cx + sx);
      }
    }

    blocks.push({
      x,
      y,
      height,
      terrainType,
      rampType,
      hasExtraData: (flags & 1) !== 0,
      hasZData: (flags & 2) !== 0,
      pixels,
      radarLeft,
      radarRight,
    });
  }

  return { blocksX, blocksY, blockWidth: cx, blockHeight: cy, blocks };
}

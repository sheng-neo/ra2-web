/**
 * VXL 体素模型（泰伯利亚之日 / 红警2 载具）。
 * 结构（小端）：
 *  - 16B 魔数 "Voxel Animation\0"
 *  - u32 未知, u32 节数(limb), u32 未知, u32 body 大小
 *  - 768B 调色板（256×RGB，6bit）+ 2B 余 → 头部共 802B
 *  - 每节头 28B：16B 名 + 12B 余
 *  - body（体素 span 数据）
 *  - 每节尾 92B：u32 数据偏移, 8B余, f32 scale, 48B 变换矩阵(3×4),
 *    f32×6 包围盒(minX..maxZ), u8×3 尺寸(x,y,z), u8 法线类型(TS=2,RA2=4)
 * body 内每节：i32×(sx*sy) 列起点(-1空) + i32×(sx*sy) 列终点(略)，
 *   随后每列 span：z+=skip(u8); count=u8; count×(color u8,normal u8) 逐体素 z++; 末尾 1B。
 */
import { BinaryReader } from './binary-reader';

export interface Voxel {
  x: number;
  y: number;
  z: number;
  color: number;
  normal: number;
}

export interface VxlSection {
  name: string;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  scale: number;
  /** 3×4 变换矩阵（行优先，12 个 float）。 */
  transform: number[];
  /** [minX,minY,minZ,maxX,maxY,maxZ]。 */
  bounds: number[];
  normalType: number;
  voxels: Voxel[];
}

export interface VxlFile {
  /** 嵌入调色板 RGBA（256×4），由 6bit 左移 2。 */
  palette: Uint8Array;
  sections: VxlSection[];
}

const HEADER_SIZE = 802;
const LIMB_HEADER_SIZE = 28;
const LIMB_FOOTER_SIZE = 92;

export function parseVxl(bytes: Uint8Array): VxlFile {
  const r = new BinaryReader(bytes.slice().buffer);
  const magic = r.ascii(16);
  if (!magic.startsWith('Voxel Animation')) throw new Error(`不是 VXL 文件: "${magic}"`);
  r.u32(); // unknown
  const limbCount = r.u32();
  r.u32(); // unknown
  const bodySize = r.u32();
  if (limbCount > 512 || bodySize > bytes.length) {
    throw new Error(`VXL 头数值异常: limbs=${limbCount} body=${bodySize}`);
  }

  // 调色板（6bit→8bit）
  const palette = new Uint8Array(1024);
  const palBytes = r.bytes(768);
  for (let i = 0; i < 256; i++) {
    palette[i * 4] = (palBytes[i * 3]! & 0x3f) << 2;
    palette[i * 4 + 1] = (palBytes[i * 3 + 1]! & 0x3f) << 2;
    palette[i * 4 + 2] = (palBytes[i * 3 + 2]! & 0x3f) << 2;
    palette[i * 4 + 3] = 255;
  }

  // 节头（取名字）
  const names: string[] = [];
  r.seek(HEADER_SIZE);
  for (let i = 0; i < limbCount; i++) {
    names.push(r.ascii(16));
    r.skip(12);
  }

  // 节尾
  const footerBase = HEADER_SIZE + LIMB_HEADER_SIZE * limbCount + bodySize;
  interface Footer {
    dataOffset: number;
    scale: number;
    transform: number[];
    bounds: number[];
    sizeX: number;
    sizeY: number;
    sizeZ: number;
    normalType: number;
  }
  const footers: Footer[] = [];
  for (let i = 0; i < limbCount; i++) {
    r.seek(footerBase + i * LIMB_FOOTER_SIZE);
    const dataOffset = r.u32();
    r.skip(8);
    const scale = r.f32();
    const transform: number[] = [];
    for (let j = 0; j < 12; j++) transform.push(r.f32());
    const bounds: number[] = [];
    for (let j = 0; j < 6; j++) bounds.push(r.f32());
    const sizeX = r.u8();
    const sizeY = r.u8();
    const sizeZ = r.u8();
    const normalType = r.u8();
    footers.push({ dataOffset, scale, transform, bounds, sizeX, sizeY, sizeZ, normalType });
  }

  const bodyBase = HEADER_SIZE + LIMB_HEADER_SIZE * limbCount;
  const sections: VxlSection[] = [];
  for (let i = 0; i < limbCount; i++) {
    const f = footers[i]!;
    const baseSize = f.sizeX * f.sizeY;
    const dataStart = bodyBase + f.dataOffset;
    r.seek(dataStart);
    const colStart: number[] = [];
    for (let c = 0; c < baseSize; c++) colStart.push(r.i32());
    // 跳过列终点表
    const spanDataStart = dataStart + baseSize * 8;

    const voxels: Voxel[] = [];
    for (let c = 0; c < baseSize; c++) {
      if (colStart[c] === -1) continue;
      r.seek(spanDataStart + colStart[c]!);
      const x = c % f.sizeX;
      const y = Math.floor(c / f.sizeX);
      let z = 0;
      while (z < f.sizeZ) {
        z += r.u8(); // skip
        const count = r.u8();
        for (let v = 0; v < count; v++) {
          const color = r.u8();
          const normal = r.u8();
          voxels.push({ x, y, z, color, normal });
          z++;
        }
        r.u8(); // 末尾重复计数
      }
    }

    sections.push({
      name: names[i] ?? `limb${i}`,
      sizeX: f.sizeX,
      sizeY: f.sizeY,
      sizeZ: f.sizeZ,
      scale: f.scale,
      transform: f.transform,
      bounds: f.bounds,
      normalType: f.normalType,
      voxels,
    });
  }

  return { palette, sections };
}

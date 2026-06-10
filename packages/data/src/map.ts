/**
 * 红警2 地图文件（INI 容器）：
 * [Map] Size/Theater；[IsoMapPack5] base64+分块 LZO 的 11 字节地块记录；
 * [OverlayPack]/[OverlayDataPack] base64+分块 Format80 的 512×512 覆盖物表；
 * [Waypoints] 路径点（值 = y*1000 + x）。
 */
import { BinaryReader } from './binary-reader';
import { format80Decompress } from './format80';
import type { IniFile } from './ini';
import { lzo1xDecompress } from './lzo';

export const OVERLAY_NONE = 0xff;
export const OVERLAY_GRID = 512;

export interface MapTileRecord {
  x: number;
  y: number;
  tileIndex: number;
  subTile: number;
  level: number;
  iceGrowth: number;
}

export interface RA2Map {
  /** [Map]Size= 的宽高（菱形对角线格数）。 */
  width: number;
  height: number;
  theater: string;
  localSize: { x: number; y: number; width: number; height: number };
  tiles: MapTileRecord[];
  /** 512×512，按 x + 512*y 索引；0xFF = 无覆盖物。 */
  overlay: Uint8Array;
  overlayData: Uint8Array;
  /** 编号 → 格坐标。 */
  waypoints: Map<number, { x: number; y: number }>;
}

/** 把 [SectionName] 里 1=、2=… 的 base64 串接解码。 */
export function readPackSection(ini: IniFile, sectionName: string): Uint8Array | undefined {
  const section = ini.getSection(sectionName);
  if (!section) return undefined;
  const keys = [...section.keys].sort((a, b) => Number(a) - Number(b));
  let b64 = '';
  for (const k of keys) b64 += section.getString(k);
  if (b64 === '') return new Uint8Array(0);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 分块解压：每块 u16 压缩长 + u16 解压长 + 数据。 */
export function decompressChunked(
  packed: Uint8Array,
  algo: 'lzo' | 'format80',
): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  const r = new BinaryReader(packed.slice().buffer);
  while (r.remaining >= 4) {
    const inSize = r.u16();
    const outSize = r.u16();
    if (inSize === 0 || r.remaining < inSize) break;
    const chunk = r.bytes(inSize);
    const out =
      algo === 'lzo' ? lzo1xDecompress(chunk, outSize) : format80Decompress(chunk, outSize);
    parts.push(out);
    total += out.length;
  }
  const joined = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    joined.set(p, o);
    o += p.length;
  }
  return joined;
}

export function parseMap(ini: IniFile): RA2Map {
  const mapSection = ini.getSection('Map');
  if (!mapSection) throw new Error('缺少 [Map] 节，不是有效地图');
  const size = mapSection.getList('Size').map(Number);
  const local = mapSection.getList('LocalSize').map(Number);
  const width = size[2] ?? 0;
  const height = size[3] ?? 0;
  if (width <= 0 || height <= 0) throw new Error(`地图尺寸异常: ${mapSection.getString('Size')}`);

  // 地块
  const tiles: MapTileRecord[] = [];
  const isoPack = readPackSection(ini, 'IsoMapPack5');
  if (isoPack && isoPack.length > 0) {
    const data = decompressChunked(isoPack, 'lzo');
    const r = new BinaryReader(data.buffer, data.byteOffset, data.byteLength);
    while (r.remaining >= 11) {
      const x = r.i16();
      const y = r.i16();
      const tileIndex = r.i32();
      const subTile = r.u8();
      const level = r.u8();
      const iceGrowth = r.u8();
      if (x === 0 && y === 0) continue; // (0,0) 为终止/填充记录
      tiles.push({
        x,
        y,
        // 0xFFFF / -1 表示空位，归一为 0（清地）
        tileIndex: tileIndex === 0xffff || tileIndex < 0 ? 0 : tileIndex,
        subTile,
        level,
        iceGrowth,
      });
    }
  }

  // 覆盖物
  const overlay = new Uint8Array(OVERLAY_GRID * OVERLAY_GRID).fill(OVERLAY_NONE);
  const overlayData = new Uint8Array(OVERLAY_GRID * OVERLAY_GRID);
  const op = readPackSection(ini, 'OverlayPack');
  if (op && op.length > 0) {
    overlay.set(decompressChunked(op, 'format80').subarray(0, overlay.length));
  }
  const odp = readPackSection(ini, 'OverlayDataPack');
  if (odp && odp.length > 0) {
    overlayData.set(decompressChunked(odp, 'format80').subarray(0, overlayData.length));
  }

  // 路径点
  const waypoints = new Map<number, { x: number; y: number }>();
  const wpSection = ini.getSection('Waypoints');
  if (wpSection) {
    for (const k of wpSection.keys) {
      const v = wpSection.getNumber(k, -1);
      if (v >= 0) waypoints.set(Number(k), { x: v % 1000, y: Math.floor(v / 1000) });
    }
  }

  return {
    width,
    height,
    theater: mapSection.getString('Theater', 'TEMPERATE').toUpperCase(),
    localSize: {
      x: local[0] ?? 0,
      y: local[1] ?? 0,
      width: local[2] ?? width,
      height: local[3] ?? height,
    },
    tiles,
    overlay,
    overlayData,
    waypoints,
  };
}

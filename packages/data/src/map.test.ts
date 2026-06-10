import { describe, expect, it } from 'vitest';
import { IniFile } from './ini';
import { format80CompressLiteral } from './format80';
import { lzo1xCompressLiteral } from './lzo';
import { OVERLAY_NONE, parseMap } from './map';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** 组装分块：u16 压缩长 + u16 解压长 + 数据。 */
function chunk(compressed: Uint8Array, rawLen: number): Uint8Array {
  const out = new Uint8Array(4 + compressed.length);
  new DataView(out.buffer).setUint16(0, compressed.length, true);
  new DataView(out.buffer).setUint16(2, rawLen, true);
  out.set(compressed, 4);
  return out;
}

function buildTileRecords(
  records: { x: number; y: number; tile: number; sub: number; level: number }[],
): Uint8Array {
  const out = new Uint8Array(records.length * 11);
  const v = new DataView(out.buffer);
  records.forEach((t, i) => {
    const o = i * 11;
    v.setInt16(o, t.x, true);
    v.setInt16(o + 2, t.y, true);
    v.setInt32(o + 4, t.tile, true);
    out[o + 8] = t.sub;
    out[o + 9] = t.level;
    out[o + 10] = 0;
  });
  return out;
}

function sectionLines(name: string, b64: string): string {
  const lines = [`[${name}]`];
  for (let i = 0, n = 1; i < b64.length; i += 70, n++) {
    lines.push(`${n}=${b64.slice(i, i + 70)}`);
  }
  return lines.join('\n');
}

describe('parseMap', () => {
  // 两块 LZO 分块，验证跨块拼接
  const recordsA = buildTileRecords([
    { x: 5, y: 4, tile: 0, sub: 0, level: 0 },
    { x: 6, y: 4, tile: 15, sub: 3, level: 2 },
  ]);
  const recordsB = buildTileRecords([
    { x: 7, y: 4, tile: 0xffff, sub: 0, level: 0 }, // 0xFFFF → 清地
    { x: 0, y: 0, tile: 0, sub: 0, level: 0 }, // 终止记录，应被忽略
  ]);
  const isoPack = new Uint8Array([
    ...chunk(lzo1xCompressLiteral(recordsA), recordsA.length),
    ...chunk(lzo1xCompressLiteral(recordsB), recordsB.length),
  ]);

  // 真实地图按 ≤8192 原始字节分块（分块头压缩长是 u16，整包塞一块会溢出）
  const overlayRaw = new Uint8Array(512 * 512).fill(OVERLAY_NONE);
  overlayRaw[7 + 512 * 4] = 102; // (7,4) 放矿石
  const overlayChunks: number[] = [];
  for (let o = 0; o < overlayRaw.length; o += 8192) {
    const piece = overlayRaw.subarray(o, o + 8192);
    overlayChunks.push(...chunk(format80CompressLiteral(piece), piece.length));
  }
  const overlayPack = new Uint8Array(overlayChunks);

  const mapIni = `
[Map]
Size=0,0,50,40
Theater=temperate
LocalSize=2,4,46,32

${sectionLines('IsoMapPack5', toBase64(isoPack))}

${sectionLines('OverlayPack', toBase64(overlayPack))}

[Waypoints]
0=4005
98=37044
`;

  const map = parseMap(new IniFile(mapIni));

  it('地图头', () => {
    expect(map.width).toBe(50);
    expect(map.height).toBe(40);
    expect(map.theater).toBe('TEMPERATE');
    expect(map.localSize).toEqual({ x: 2, y: 4, width: 46, height: 32 });
  });

  it('地块记录（跨块拼接 + 0xFFFF 归一 + 终止记录忽略）', () => {
    expect(map.tiles.length).toBe(3);
    expect(map.tiles[0]).toEqual({ x: 5, y: 4, tileIndex: 0, subTile: 0, level: 0, iceGrowth: 0 });
    expect(map.tiles[1]).toEqual({ x: 6, y: 4, tileIndex: 15, subTile: 3, level: 2, iceGrowth: 0 });
    expect(map.tiles[2]!.tileIndex).toBe(0);
  });

  it('OverlayPack（Format80 解压 + 512 网格寻址）', () => {
    expect(map.overlay[7 + 512 * 4]).toBe(102);
    expect(map.overlay[0]).toBe(OVERLAY_NONE);
    expect(map.overlayData[0]).toBe(0);
  });

  it('路径点（v = y*1000 + x）', () => {
    expect(map.waypoints.get(0)).toEqual({ x: 5, y: 4 });
    expect(map.waypoints.get(98)).toEqual({ x: 44, y: 37 });
  });

  it('缺 [Map] 抛错', () => {
    expect(() => parseMap(new IniFile('[Basic]\n'))).toThrow();
  });
});

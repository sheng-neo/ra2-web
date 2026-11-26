/**
 * 电车目的地牌（R3 LIVERIES）：字形在共用的营运商图集里（liveries/atlas.ts 的 tramDest 块，取代 R2 的 'trams:dest-atlas'）。
 * 每个目的地两格：第 2d 格中文、第 2d + 1 格英文（transit-data.ts TRAM_DESTINATIONS，原样）；牌上一行字，着色器每 4 s 轮换。
 */
import { atlasTexts, liveryAtlasTexture } from '../liveries/atlas';
import { TRAM_DESTINATIONS } from '../transit-data';

/** 目的地牌轮换周期（s）：中文、英文各显示这么久。 */
export const DEST_SWAP_S = 4;

/** 第 dest 个目的地、lang（0 = 中文，1 = 英文）在 tramDest 块里的格下标。 */
export function destTile(dest: number, lang: 0 | 1): number {
  return dest * 2 + lang;
}

/** 目的地牌各格的文字（纯函数，测试用）。 */
export function destAtlasLayout(): { tile: number; text: string }[] {
  return atlasTexts()
    .filter((t) => t.block === 'tramDest')
    .map((t) => ({ tile: t.i, text: t.text }));
}

/** 目的地个数。 */
export const DEST_COUNT = TRAM_DESTINATIONS.length;

/** 共用图集纹理（没有 DOM 时为 null）。 */
export function destAtlasTexture() {
  return liveryAtlasTexture();
}

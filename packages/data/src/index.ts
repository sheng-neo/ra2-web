/**
 * @ra2web/data —— 红警2 文件格式解析器。
 * 纯 TS、零依赖，浏览器与 Node 通用。
 */
export { BinaryReader } from './binary-reader';
export { crc32, mixIdRA2, padMixName } from './crc32';
export { Blowfish } from './blowfish';
export {
  decryptKeySource,
  westwoodModulus,
  modPow,
  derIntegerToBigInt,
  bytesLEToBigInt,
  bigIntToBytesLE,
  WESTWOOD_PUBLIC_MODULUS_B64,
  WESTWOOD_PUBLIC_EXPONENT,
} from './mix-crypto';
export { BufferSource, SliceSource, UrlSource, type RandomAccessSource } from './source';
export { MixFile, type MixEntry } from './mix';
export { IniFile, IniSection } from './ini';
export { Palette, REMAP_START, REMAP_END } from './pal';
export { parseShp, type ShpFile, type ShpFrame } from './shp';
export { parseCsf, type CsfFile } from './csf';
export { lzo1xDecompress, lzo1xCompressLiteral } from './lzo';
export { format80Decompress, format80CompressLiteral } from './format80';
export { parseTmp, type TmpFile, type TmpBlock } from './tmp';
export {
  THEATERS,
  theaterByName,
  TheaterTileTable,
  type TheaterInfo,
  type TileSetEntry,
  type ResolvedTile,
} from './theater';
export {
  parseMap,
  readPackSection,
  decompressChunked,
  OVERLAY_NONE,
  OVERLAY_GRID,
  type RA2Map,
  type MapTileRecord,
} from './map';

// ===== io/sc2/index.ts =====（CONTRACTS §V Sc2Entry；WP2 真实现）
// 纯编解码层：readSc2 / writeSc2 / newDocument（不认识 CityState）。另导出字节工具、RLE、IFF、MISC 访问器供 io/assets（WP14）与测试使用。
import type { Sc2Entry } from '../../contracts/entrypoints';
import type { Sc2Codec } from '../../contracts/io';
import { newDocument } from './newDocument';
import { readSc2 } from './sc2Read';
import { writeSc2 } from './sc2Write';

export { newDocument } from './newDocument';
export { readSc2, cityNameFromFileName } from './sc2Read';
export { writeSc2 } from './sc2Write';
export { ByteReader, ByteWriter, encodeUtf8, decodeUtf8, decodeLatin1 } from './bytes';
export { rleDecode, rleEncode, RLE_MAX_LITERAL, RLE_MAX_RUN } from './rle';
export { parseIff, buildIff, Sc2FormatError } from './iff';
export type { IffChunk, IffParseResult, Sc2ErrorCode } from './iff';
export * from './misc';

export const sc2Codec = { readSc2, writeSc2, newDocument } satisfies Sc2Codec satisfies Sc2Entry['sc2Codec'];

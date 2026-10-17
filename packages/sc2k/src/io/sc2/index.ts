// ===== io/sc2/index.ts =====（WP0 转发桩 → WP2 接手（T+3 第一切片）；导出名与签名按 CONTRACTS §V Sc2Entry）
// readSc2 / writeSc2 抛 Error('notImplemented')；newDocument() 返回全零文档（各 chunk 按 CHUNK_SIZES 分配）。纯编解码层，不认识 CityState。
import type { Sc2Entry } from '../../contracts/entrypoints';
import type { Sc2Codec, Sc2Document } from '../../contracts/io';
import { CHUNK_SIZES } from '../../contracts/io';

const u8 = (n: number): Uint8Array => new Uint8Array(n);

export function newDocument(): Sc2Document {
  const C = CHUNK_SIZES;
  return {
    cityName: '',
    misc: new Int32Array(C.MISC / 4),
    altm: new Uint16Array(C.ALTM / 2),
    xter: u8(C.XTER), xbld: u8(C.XBLD), xzon: u8(C.XZON), xund: u8(C.XUND), xtxt: u8(C.XTXT), xbit: u8(C.XBIT),
    xlab: u8(C.XLAB), xmic: u8(C.XMIC), xthg: u8(C.XTHG),
    xtrf: u8(C.XTRF), xplt: u8(C.XPLT), xval: u8(C.XVAL), xcrm: u8(C.XCRM), xplc: u8(C.XPLC), xfir: u8(C.XFIR), xpop: u8(C.XPOP), xrog: u8(C.XROG),
    xgrp: new Int32Array(C.XGRP / 4),
    unknownChunks: [],
  };
}

export const sc2Codec = {
  readSc2: (): never => { throw new Error('notImplemented'); },
  writeSc2: (): never => { throw new Error('notImplemented'); },
  newDocument,
} satisfies Sc2Codec satisfies Sc2Entry['sc2Codec'];

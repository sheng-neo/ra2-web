// ===== io/sc2/newDocument.ts =====（spec:file-formats §3.2）
// 全零 Sc2Document（各 chunk 按 CHUNK_SIZES 分配）；唯一非零项是 MISC 头 0x122（文件格式不变量，原版读档校验它）。
import type { Sc2Document } from '../../contracts/io';
import { CHUNK_SIZES, MISC, miscSet } from '../../contracts/io';
import { MISC_HEADER_VALUE } from './misc';

const u8 = (n: number): Uint8Array => new Uint8Array(n);

export function newDocument(): Sc2Document {
  const C = CHUNK_SIZES;
  const misc = new Int32Array(C.MISC / 4);
  miscSet(misc, MISC.header, MISC_HEADER_VALUE);
  return {
    cityName: '',
    misc,
    altm: new Uint16Array(C.ALTM / 2),
    xter: u8(C.XTER), xbld: u8(C.XBLD), xzon: u8(C.XZON), xund: u8(C.XUND), xtxt: u8(C.XTXT), xbit: u8(C.XBIT),
    xlab: u8(C.XLAB), xmic: u8(C.XMIC), xthg: u8(C.XTHG),
    xtrf: u8(C.XTRF), xplt: u8(C.XPLT), xval: u8(C.XVAL), xcrm: u8(C.XCRM), xplc: u8(C.XPLC), xfir: u8(C.XFIR), xpop: u8(C.XPOP), xrog: u8(C.XROG),
    xgrp: new Int32Array(C.XGRP / 4),
    unknownChunks: [],
  };
}

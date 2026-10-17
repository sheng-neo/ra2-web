// ===== io/sc2/sc2Write.ts =====（spec:file-formats §3.3.4）
// writeSc2：按 WRITE_ORDER 序列化（情景 chunk 仅在 scenario 存在时），RLE 压缩非 UNCOMPRESSED 者，未知 chunk 原样追加在末尾。
// MISC 头为 0 时补 0x122（文件格式不变量）；其余字节一律按文档原样写出，保证 readSc2(writeSc2(doc)) 深相等。
import type { ChunkId, Sc2Document } from '../../contracts/io';
import { CHUNK_SIZES, MISC, UNCOMPRESSED, WRITE_ORDER, miscGet } from '../../contracts/io';
import { ByteWriter, encodeUtf8 } from './bytes';
import { buildIff } from './iff';
import type { IffChunk } from './iff';
import { MISC_HEADER_VALUE, writeCName } from './misc';
import { rleEncode } from './rle';

function i32Bytes(a: Int32Array, count: number): Uint8Array {
  const w = new ByteWriter(count * 4);
  for (let k = 0; k < count; k++) w.i32be(a[k] ?? 0);
  return w.toUint8Array();
}
function u16Bytes(a: Uint16Array, count: number): Uint8Array {
  const w = new ByteWriter(count * 2);
  for (let k = 0; k < count; k++) w.u16be(a[k] ?? 0);
  return w.toUint8Array();
}
/** 定长 u8 层：多截断、少补零。 */
function fitU8(a: Uint8Array, size: number): Uint8Array {
  if (a.length === size) return a;
  const out = new Uint8Array(size); out.set(a.subarray(0, Math.min(size, a.length)));
  return out;
}
function textChunk(kind: number, text: string): Uint8Array {
  const body = encodeUtf8(text.replace(/\n/g, '\r'));
  const w = new ByteWriter(4 + body.length);
  w.u32be(kind); w.bytes(body);
  return w.toUint8Array();
}

/** 单个 chunk 的解压原文；null = 本文档不写该 chunk（TEXT 可能返回多段）。 */
function serializeChunk(doc: Sc2Document, id: ChunkId): Uint8Array[] | null {
  switch (id) {
    case 'CNAM': return [writeCName(doc.cityName)];
    case 'MISC': {
      const misc = doc.misc.length === CHUNK_SIZES.MISC / 4 && miscGet(doc.misc, MISC.header) !== 0 ? doc.misc : (() => {
        const m = new Int32Array(CHUNK_SIZES.MISC / 4); m.set(doc.misc.subarray(0, Math.min(m.length, doc.misc.length)));
        if (m[MISC.header >> 2] === 0) m[MISC.header >> 2] = MISC_HEADER_VALUE;
        return m;
      })();
      return [i32Bytes(misc, CHUNK_SIZES.MISC / 4)];
    }
    case 'ALTM': return [u16Bytes(doc.altm, CHUNK_SIZES.ALTM / 2)];
    case 'XGRP': return [i32Bytes(doc.xgrp, CHUNK_SIZES.XGRP / 4)];
    case 'TEXT': return doc.scenario && doc.scenario.texts.length > 0 ? doc.scenario.texts.map((t) => textChunk(t.kind, t.text)) : null;
    case 'SCEN': return doc.scenario ? [doc.scenario.scen] : null;
    case 'PICT': return doc.scenario?.pict ? [doc.scenario.pict] : null;
    case 'TMPL': return doc.scenario?.tmpl ? [doc.scenario.tmpl] : null;
    default: {
      const layer = (doc as unknown as Record<string, Uint8Array>)[id.toLowerCase()];
      return layer ? [fitU8(layer, CHUNK_SIZES[id])] : null;
    }
  }
}

export function writeSc2(doc: Sc2Document): ArrayBuffer {
  const chunks: IffChunk[] = [];
  for (const id of WRITE_ORDER) {
    const raws = serializeChunk(doc, id);
    if (!raws) continue;
    for (const raw of raws) chunks.push({ id, data: UNCOMPRESSED.has(id) ? raw : rleEncode(raw) });
  }
  for (const u of doc.unknownChunks) chunks.push({ id: u.id, data: u.data });
  return buildIff(chunks);
}

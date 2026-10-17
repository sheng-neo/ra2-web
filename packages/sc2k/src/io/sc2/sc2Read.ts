// ===== io/sc2/sc2Read.ts =====（spec:file-formats §3.3.3）
// readSc2：容器 → 按 id 分发（不假设顺序）→ RLE 解压到 CHUNK_SIZES 定长 → Sc2Document + 诊断。
// 缺 MISC / ALTM / XTER / XBLD 抛 Sc2FormatError('MISSING_CHUNK')；其它问题只记诊断。不认识 CityState。
import type { ChunkId, ReadResult, Sc2Document } from '../../contracts/io';
import { CHUNK_SIZES, MISC, UNCOMPRESSED, miscGet } from '../../contracts/io';
import type { Diagnostic } from '../../contracts/system';
import { ByteReader } from './bytes';
import { Sc2FormatError, parseIff } from './iff';
import type { IffChunk } from './iff';
import { CNAM_MAX_BYTES, MISC_HEADER_VALUE, bytesToText, readCName, textToBytes } from './misc';
import { newDocument } from './newDocument';
import { rleDecode } from './rle';

type SizedChunkId = keyof typeof CHUNK_SIZES;
const REQUIRED: readonly SizedChunkId[] = ['MISC', 'ALTM', 'XTER', 'XBLD'];
const U8_CHUNKS: readonly SizedChunkId[] = ['XTER', 'XBLD', 'XZON', 'XUND', 'XTXT', 'XLAB', 'XMIC', 'XTHG', 'XBIT', 'XTRF', 'XPLT', 'XVAL', 'XCRM', 'XPLC', 'XFIR', 'XPOP', 'XROG'];
const isSized = (id: string): id is SizedChunkId => Object.prototype.hasOwnProperty.call(CHUNK_SIZES, id);
const isScenarioChunk = (id: string): id is 'TEXT' | 'SCEN' | 'PICT' | 'TMPL' => id === 'TEXT' || id === 'SCEN' || id === 'PICT' || id === 'TMPL';

/** 文件名 → 大写、去扩展名与目录、≤ 31 字节（CNAM 缺失时的城市名）。 */
export function cityNameFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const stem = base.replace(/\.[^.]*$/, '');
  return bytesToText(textToBytes(stem.toUpperCase(), CNAM_MAX_BYTES));
}

function readI32Array(data: Uint8Array, count: number): Int32Array {
  const out = new Int32Array(count);
  const r = new ByteReader(data);
  const n = Math.min(count, data.length >> 2);
  for (let k = 0; k < n; k++) out[k] = r.i32be();
  return out;
}
function readU16Array(data: Uint8Array, count: number): Uint16Array {
  const out = new Uint16Array(count);
  const r = new ByteReader(data);
  const n = Math.min(count, data.length >> 1);
  for (let k = 0; k < n; k++) out[k] = r.u16be();
  return out;
}
/** 对齐到定长：多截断、少补零（不告警：RLE 层已对长度告警；未压缩 chunk 在此告警）。 */
function fit(data: Uint8Array, size: number, id: string, diag: Diagnostic[], compressed: boolean): Uint8Array {
  if (data.length === size) return data;
  if (!compressed) diag.push({ level: 'warn', code: 'sc2.chunkLength', message: `chunk ${id} 长度 ${data.length} ≠ 期望 ${size}（已${data.length > size ? '截断' : '补零'}）`, at: id });
  const out = new Uint8Array(size); out.set(data.subarray(0, Math.min(size, data.length)));
  return out;
}

export function readSc2(buf: ArrayBuffer, fileName?: string): ReadResult<Sc2Document> {
  const parsed = parseIff(buf);
  const diagnostics: Diagnostic[] = parsed.diagnostics;
  const doc = newDocument();
  doc.misc.fill(0);                                           // newDocument 预置了 header；以文件为准
  const seen = new Set<string>();
  const texts: { kind: number; text: string }[] = [];
  let scen: Uint8Array | undefined, pict: Uint8Array | undefined, tmpl: Uint8Array | undefined;
  let hasCName = false;

  const handle = (ch: IffChunk): void => {
    const id = ch.id;
    if (seen.has(id) && id !== 'TEXT') diagnostics.push({ level: 'warn', code: 'sc2.duplicateChunk', message: `chunk ${id} 重复出现，以后者为准`, at: id });
    seen.add(id);
    if (id === 'CNAM') { doc.cityName = readCName(ch.data); hasCName = true; return; }
    if (isSized(id)) {
      const size = CHUNK_SIZES[id];
      const compressed = !UNCOMPRESSED.has(id as ChunkId);
      const data = fit(compressed ? rleDecode(ch.data, size, diagnostics, id) : ch.data, size, id, diagnostics, compressed);
      if (id === 'MISC') doc.misc = readI32Array(data, size >> 2);
      else if (id === 'ALTM') doc.altm = readU16Array(data, size >> 1);
      else if (id === 'XGRP') doc.xgrp = readI32Array(data, size >> 2);
      else if ((U8_CHUNKS as readonly string[]).includes(id)) (doc as unknown as Record<string, Uint8Array>)[id.toLowerCase()] = data.slice();
      return;
    }
    if (isScenarioChunk(id)) {
      const data = ch.data.slice();
      if (id === 'TEXT') {
        const r = new ByteReader(data);
        const kind = data.length >= 4 ? r.u32be() : 0;
        texts.push({ kind, text: bytesToText(data.subarray(Math.min(4, data.length))).replace(/\r/g, '\n') });
      } else if (id === 'SCEN') scen = data;
      else if (id === 'PICT') pict = data;
      else tmpl = data;
      return;
    }
    diagnostics.push({ level: 'info', code: 'sc2.unknownChunk', message: `未知 chunk ${id}（${ch.data.length} 字节）已原样保留`, at: id });
    doc.unknownChunks.push({ id, data: ch.data.slice() });
  };
  for (const ch of parsed.chunks) handle(ch);

  const missing = REQUIRED.filter((id) => !seen.has(id));
  if (missing.length > 0) throw new Sc2FormatError('MISSING_CHUNK', `缺少必需 chunk：${missing.join(', ')}`);
  if (scen !== undefined || texts.length > 0) {
    const s: NonNullable<Sc2Document['scenario']> = { texts, scen: scen ?? new Uint8Array(0) };
    if (pict !== undefined) s.pict = pict;
    if (tmpl !== undefined) s.tmpl = tmpl;
    doc.scenario = s;
    if (scen === undefined) diagnostics.push({ level: 'warn', code: 'sc2.scenarioNoScen', message: '有 TEXT 但无 SCEN，情景目标缺失' });
  }
  if (!hasCName) diagnostics.push({ level: 'info', code: 'sc2.noCName', message: '缺少 CNAM chunk' });
  if (doc.cityName === '') {
    if (parsed.macName) doc.cityName = bytesToText(textToBytes(parsed.macName, CNAM_MAX_BYTES));
    else if (fileName) doc.cityName = cityNameFromFileName(fileName);
    if (doc.cityName !== '') diagnostics.push({ level: 'info', code: 'sc2.nameFromFile', message: `城市名取自文件名：${doc.cityName}` });
  }
  const header = miscGet(doc.misc, MISC.header);
  if (header !== MISC_HEADER_VALUE) diagnostics.push({ level: 'warn', code: 'sc2.miscHeader', message: `MISC 头 0x${(header >>> 0).toString(16)} ≠ 0x122` });
  let sumVal = 0, sumCrm = 0;
  for (let k = 0; k < doc.xval.length; k++) sumVal += doc.xval[k]!;
  for (let k = 0; k < doc.xcrm.length; k++) sumCrm += doc.xcrm[k]!;
  if (sumVal !== miscGet(doc.misc, MISC.landValueSum)) diagnostics.push({ level: 'info', code: 'sc2.checksumXval', message: `Σ XVAL = ${sumVal} ≠ MISC.landValueSum = ${miscGet(doc.misc, MISC.landValueSum)}` });
  if (sumCrm !== miscGet(doc.misc, MISC.crimeSum)) diagnostics.push({ level: 'info', code: 'sc2.checksumXcrm', message: `Σ XCRM = ${sumCrm} ≠ MISC.crimeSum = ${miscGet(doc.misc, MISC.crimeSum)}` });
  return { value: doc, diagnostics };
}

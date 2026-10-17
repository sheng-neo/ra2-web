// ===== io/sc2/iff.ts =====（spec:file-formats §2.1.1 / §3.3.1）
// .SC2 容器：FORM <size> SCDH + [id4][size u32be][data]，无奇数填充。识别 Mac（MacBinary 128 B 头）与 SimCity Classic（拒绝），截断容错。
import type { Diagnostic } from '../../contracts/system';
import { ByteReader, ByteWriter } from './bytes';

export type Sc2ErrorCode = 'NOT_SC2' | 'UNSUPPORTED_CLASSIC' | 'MISSING_CHUNK' | 'BAD_CHUNK_ID';
/** 无法继续解析时抛出（诊断只记录可恢复的问题）。 */
export class Sc2FormatError extends Error {
  readonly code: Sc2ErrorCode;
  constructor(code: Sc2ErrorCode, message: string) { super(message); this.name = 'Sc2FormatError'; this.code = code; }
}

export interface IffChunk { id: string; data: Uint8Array }
export interface IffParseResult { chunks: IffChunk[]; diagnostics: Diagnostic[]; macName?: string }

const MACBINARY_HEADER = 0x80;
const CLASSIC_SIGNATURE_AT = 0x41, CLASSIC_SIGNATURE = 'CITYMCRP';
const isChunkIdChar = (c: number): boolean => c >= 0x20 && c <= 0x7f;

/** 解析容器；Mac 头被剥离并把 MacBinary 的 Pascal 文件名放进 macName（CNAM 缺失时的城市名来源）。 */
export function parseIff(input: ArrayBuffer | Uint8Array): IffParseResult {
  const diagnostics: Diagnostic[] = [];
  let bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let r = new ByteReader(bytes);
  let macName: string | undefined;
  if (r.peekAscii(0, 4) !== 'FORM') {
    if (r.peekAscii(MACBINARY_HEADER, 4) === 'FORM') {
      const nameLen = Math.min(r.peekU8(1), 63);
      if (nameLen > 0) macName = r.peekAscii(2, nameLen);
      bytes = bytes.subarray(MACBINARY_HEADER);
      r = new ByteReader(bytes);
      diagnostics.push({ level: 'info', code: 'sc2.macHeader', message: '检测到 MacBinary 头（128 字节），已跳过' });
    } else if (r.peekU8(0) === 0x00 && r.peekU8(1) === 0x0d && r.peekAscii(CLASSIC_SIGNATURE_AT, CLASSIC_SIGNATURE.length) === CLASSIC_SIGNATURE) {
      throw new Sc2FormatError('UNSUPPORTED_CLASSIC', '这是前代（Classic 版，CITYMCRP 签名）存档，不支持');
    } else {
      throw new Sc2FormatError('NOT_SC2', '不是 .SC2 文件（缺少 FORM 头）');
    }
  }
  if (bytes.length < 12) throw new Sc2FormatError('NOT_SC2', '文件过短');
  const declared = r.peekU32be(4) + 8;
  let end = bytes.length;
  if (declared !== bytes.length) {
    diagnostics.push({ level: 'warn', code: 'sc2.sizeMismatch', message: `FORM 声明长度 ${declared} ≠ 实际 ${bytes.length}，以较小者为准` });
    end = Math.min(declared, bytes.length);
  }
  if (r.peekAscii(8, 4) !== 'SCDH') throw new Sc2FormatError('NOT_SC2', '不是 .SC2 文件（缺少 SCDH 类型）');
  const chunks: IffChunk[] = [];
  let pos = 12;
  while (pos + 8 <= end) {
    const id = r.peekAscii(pos, 4);
    for (let k = 0; k < 4; k++) if (!isChunkIdChar(id.charCodeAt(k))) throw new Sc2FormatError('BAD_CHUNK_ID', `chunk id 非法 @${pos}`);
    let size = r.peekU32be(pos + 4);
    pos += 8;
    if (pos + size > end) {
      diagnostics.push({ level: 'warn', code: 'sc2.truncatedChunk', message: `chunk ${id} 声明 ${size} 字节，文件只剩 ${end - pos}，已截断` });
      size = end - pos;
    }
    chunks.push({ id, data: bytes.subarray(pos, pos + size) });
    pos += size;
  }
  if (pos < end) diagnostics.push({ level: 'info', code: 'sc2.trailingBytes', message: `容器末尾有 ${end - pos} 个无法构成 chunk 的字节，已忽略` });
  return macName !== undefined ? { chunks, diagnostics, macName } : { chunks, diagnostics };
}

/** 组装容器：FORM 长度回填为总长 − 8；chunk 原样、无填充。 */
export function buildIff(chunks: readonly IffChunk[]): ArrayBuffer {
  let total = 12;
  for (const c of chunks) total += 8 + c.data.length;
  const w = new ByteWriter(total);
  w.ascii('FORM'); w.u32be(0); w.ascii('SCDH');
  for (const c of chunks) {
    if (c.id.length !== 4) throw new Sc2FormatError('BAD_CHUNK_ID', `chunk id "${c.id}" 必须恰为 4 字符`);
    w.ascii(c.id); w.u32be(c.data.length); w.bytes(c.data);
  }
  w.patchU32be(4, w.length - 8);
  return w.toArrayBuffer();
}

// ===== io/assets/import/protocol.ts =====（ARCHITECTURE §8.4 / §9.3：Worker 解码 + transfer）
// 主线程 ↔ 解码 Worker 的消息格式与处理函数。处理函数是纯的（decodeBundle 包装），worker.ts 只是几行胶水；
// 测试用假 WorkerLike 直接调用 handleDecodeRequest，不需要真 Worker。
import type { Diagnostic } from '../../../contracts/system';
import type { AtlasFrame, AtlasPage } from '../sprites/atlas';
import type { DatBundle, DecodeBundleInput } from '../sprites/bundle';
import { decodeBundle } from '../sprites/bundle';
import type { SpriteFileKind } from '../sprites/archive';

export const MSG_DECODE = 'sc2k-assets:decode', MSG_DECODED = 'sc2k-assets:decoded', MSG_FAILED = 'sc2k-assets:failed';

export interface DecodeRequestMessage { type: typeof MSG_DECODE; id: number; input: DecodeBundleInput }
/** 可结构化克隆的 DatBundle（Map 以条目数组传输；调色板只传 rgba）。 */
export interface WireBundle {
  pages: AtlasPage[]; frames: [number, AtlasFrame][]; idLayout: Record<string, number>;
  palette: { rgba: Uint8ClampedArray } | null; diagnostics: Diagnostic[]; spriteCount: number; files: SpriteFileKind[];
}
export interface DecodeDoneMessage { type: typeof MSG_DECODED; id: number; bundle: WireBundle }
export interface DecodeFailedMessage { type: typeof MSG_FAILED; id: number; message: string }
export type DecodeResponseMessage = DecodeDoneMessage | DecodeFailedMessage;

const isObj = (m: unknown): m is Record<string, unknown> => typeof m === 'object' && m !== null;
export const isDecodeRequest = (m: unknown): m is DecodeRequestMessage => isObj(m) && m['type'] === MSG_DECODE && typeof m['id'] === 'number' && isObj(m['input']);
export const isDecodeResponse = (m: unknown): m is DecodeResponseMessage => isObj(m) && (m['type'] === MSG_DECODED || m['type'] === MSG_FAILED) && typeof m['id'] === 'number';

export function toWire(b: DatBundle): { bundle: WireBundle; transfer: ArrayBuffer[] } {
  const transfer: ArrayBuffer[] = [];
  for (const p of b.pages) if (p.data.buffer instanceof ArrayBuffer && p.data.byteOffset === 0 && p.data.byteLength === p.data.buffer.byteLength) transfer.push(p.data.buffer);
  const palette = b.palette ? { rgba: b.palette.rgba } : null;
  return { bundle: { pages: b.pages, frames: [...b.frames], idLayout: b.idLayout, palette, diagnostics: b.diagnostics, spriteCount: b.spriteCount, files: b.files }, transfer };
}
export function fromWire(w: WireBundle): DatBundle {
  return { pages: w.pages, frames: new Map(w.frames), idLayout: w.idLayout, palette: w.palette ? { rgba: w.palette.rgba, cycles: [] } : null, diagnostics: w.diagnostics, spriteCount: w.spriteCount, files: w.files };
}

export function handleDecodeRequest(reqMsg: DecodeRequestMessage): { response: DecodeResponseMessage; transfer: ArrayBuffer[] } {
  try {
    const { bundle, transfer } = toWire(decodeBundle(reqMsg.input));
    return { response: { type: MSG_DECODED, id: reqMsg.id, bundle }, transfer };
  } catch (e) {
    return { response: { type: MSG_FAILED, id: reqMsg.id, message: e instanceof Error ? e.message : String(e) }, transfer: [] };
  }
}

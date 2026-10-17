// ===== io/assets/import/decodeClient.ts =====（ARCHITECTURE §8.4 / §9.3）
// 解码客户端：有 Worker 时在 Worker 中解码（输入拷贝后 transfer 过去，图集页 transfer 回来），没有 Worker（Node 测试、受限环境）
// 或 Worker 出错时在主线程内联解码。WorkerLike 来自 contracts/render（结构化外形，便于测试注入假 Worker）。
import type { WorkerLike } from '../../../contracts/render';
import type { DatBundle, DecodeBundleInput } from '../sprites/bundle';
import { decodeBundle } from '../sprites/bundle';
import type { DecodeRequestMessage } from './protocol';
import { MSG_DECODE, MSG_DECODED, fromWire, isDecodeResponse } from './protocol';

export type SpawnWorker = () => WorkerLike | null;

/** Vite 识别 `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` 并单独打包。 */
export function defaultSpawnWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  try { return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike; }
  catch { return null; }
}

export interface DecodeClient {
  decode(input: DecodeBundleInput): Promise<DatBundle>;
  /** 本次调用是否曾用到 Worker（诊断用）。 */
  readonly usingWorker: boolean;
  dispose(): void;
}

const copyBuf = (b: ArrayBuffer | Uint8Array | undefined): ArrayBuffer | undefined => {
  if (!b) return undefined;
  if (b instanceof Uint8Array) return b.slice().buffer as ArrayBuffer;
  return b.slice(0);
};

export function createDecodeClient(spawn: SpawnWorker = defaultSpawnWorker): DecodeClient {
  let worker: WorkerLike | null = null, tried = false, broken = false, usingWorker = false;
  let nextId = 1;
  const pending = new Map<number, { input: DecodeBundleInput; resolve: (b: DatBundle) => void; reject: (e: Error) => void }>();
  const inline = (input: DecodeBundleInput): Promise<DatBundle> => new Promise((resolve, reject) => { try { resolve(decodeBundle(input)); } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); } });
  const failAllToInline = (): void => {
    broken = true;
    const items = [...pending.values()]; pending.clear();
    if (worker) { try { worker.terminate(); } catch { /* 忽略 */ } worker = null; }
    for (const it of items) inline(it.input).then(it.resolve, it.reject);
  };
  const ensureWorker = (): WorkerLike | null => {
    if (worker || tried) return worker;
    tried = true;
    worker = spawn();
    if (!worker) return null;
    worker.addEventListener('message', (e) => {
      const m = e.data;
      if (!isDecodeResponse(m)) return;
      const it = pending.get(m.id);
      if (!it) return;
      pending.delete(m.id);
      if (m.type === MSG_DECODED) it.resolve(fromWire(m.bundle));
      else inline(it.input).then(it.resolve, it.reject);          // Worker 内解码失败：主线程再试一次（同样的输入会得到同样的错误诊断）
    });
    (worker as unknown as { addEventListener?: (t: string, fn: () => void) => void }).addEventListener?.('error', failAllToInline);
    return worker;
  };
  return {
    get usingWorker() { return usingWorker; },
    decode(input) {
      if (!broken) {
        const w = ensureWorker();
        if (w) {
          usingWorker = true;
          const id = nextId++;
          const msg: DecodeRequestMessage = {
            type: MSG_DECODE, id,
            input: {
              ...(input.large ? { large: copyBuf(input.large)! } : {}), ...(input.smallmed ? { smallmed: copyBuf(input.smallmed)! } : {}),
              ...(input.special ? { special: copyBuf(input.special)! } : {}), ...(input.palette ? { palette: copyBuf(input.palette)! } : {}),
              ...(input.duplicatePolicy ? { duplicatePolicy: input.duplicatePolicy } : {}), ...(input.allowUnpaddedOddRuns !== undefined ? { allowUnpaddedOddRuns: input.allowUnpaddedOddRuns } : {}),
            },
          };
          const transfer = [msg.input.large, msg.input.smallmed, msg.input.special, msg.input.palette].filter((b): b is ArrayBuffer => b instanceof ArrayBuffer);
          return new Promise<DatBundle>((resolve, reject) => {
            pending.set(id, { input, resolve, reject });
            try { w.postMessage(msg, transfer); }
            catch { pending.delete(id); failAllToInline(); inline(input).then(resolve, reject); }
          });
        }
      }
      return inline(input);
    },
    dispose() { if (worker) { try { worker.terminate(); } catch { /* 忽略 */ } worker = null; } pending.clear(); },
  };
}

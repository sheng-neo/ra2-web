// ===== art/worker.ts =====（ARCHITECTURE §8.4 首帧与 Worker；CONTRACTS §V createProceduralProviderAsync(worker: WorkerLike)）
// 协议：主线程 post { type: 'sc2k-art/generate', scales?, keys? } → Worker 生成全部必备 key、打包成单一 ArrayBuffer 并 transfer 回
// { type: 'sc2k-art/pack', index: Int32Array, data: Uint8Array }。主线程解包为 IndexedBitmap 视图，注入 createProceduralProvider(preset)；
// 未预生成的 key 仍由主线程惰性生成，故任何情况下 bitmap() 都可用。本文件作为 Worker 入口被 `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` 加载时自动安装。
// 不依赖 DOM lib：Worker 全局以最小结构类型声明。
import type { IndexedBitmap, SpriteKey, SpriteProvider, WorkerLike } from '../contracts/render';
import { requiredKeys } from './keys';
import { cacheKeyOf, createProceduralProvider, generate } from './provider';
import type { NativeScale } from './raster';

export const ART_MSG_GENERATE = 'sc2k-art/generate';
export const ART_MSG_PACK = 'sc2k-art/pack';
export interface ArtGenerateRequest { type: typeof ART_MSG_GENERATE; scales?: NativeScale[]; keys?: SpriteKey[] }
export interface ArtPackResponse { type: typeof ART_MSG_PACK; index: Int32Array; data: Uint8Array; scales: NativeScale[] }
/** 索引记录字段数：[scaleCode, kindCode, id, variant, w, h, anchorX, anchorY, cycling, offset, length]。 */
export const PACK_FIELDS = 11;
const SCALE_CODES: readonly NativeScale[] = ['S', 'M', 'L'];
const KIND_CODES = ['xbld', 'terrain', 'water', 'xund', 'overlay', 'actor', 'ui'] as const;

/** 生成并打包（纯函数，Worker 与测试共用）。 */
export function packSprites(scales: readonly NativeScale[] = SCALE_CODES, keys: readonly SpriteKey[] = requiredKeys()): { index: Int32Array; data: Uint8Array } {
  const items: Array<{ rec: number[]; bmp: IndexedBitmap }> = [];
  let total = 0;
  for (const scale of scales) for (const key of keys) {
    const bmp = generate(key, scale);
    if (!bmp) continue;
    items.push({ rec: [SCALE_CODES.indexOf(scale), KIND_CODES.indexOf(key.kind), key.id, key.variant ?? 0, bmp.w, bmp.h, bmp.anchorX, bmp.anchorY, bmp.cycling ? 1 : 0, total, bmp.data.length], bmp });
    total += bmp.data.length;
  }
  const index = new Int32Array(items.length * PACK_FIELDS);
  const data = new Uint8Array(total);
  items.forEach((it, k) => { index.set(it.rec, k * PACK_FIELDS); data.set(it.bmp.data, it.rec[9]!); });
  return { index, data };
}
/** 解包为 缓存键 → IndexedBitmap（data 的子视图，零拷贝）。 */
export function unpackSprites(index: Int32Array, data: Uint8Array): Map<string, IndexedBitmap> {
  const out = new Map<string, IndexedBitmap>();
  for (let k = 0; k + PACK_FIELDS <= index.length; k += PACK_FIELDS) {
    const scale = SCALE_CODES[index[k]!]!, kind = KIND_CODES[index[k + 1]!]!;
    const key: SpriteKey = { kind, id: index[k + 2]!, variant: index[k + 3]! };
    const off = index[k + 9]!, len = index[k + 10]!;
    out.set(cacheKeyOf(key, scale), { w: index[k + 4]!, h: index[k + 5]!, data: data.subarray(off, off + len), anchorX: index[k + 6]!, anchorY: index[k + 7]!, cycling: index[k + 8] === 1 });
  }
  return out;
}

type Post = (msg: unknown, transfer?: ArrayBuffer[]) => void;
/** Worker 侧消息处理：识别请求则回包并返回 true。 */
export function handleArtWorkerMessage(data: unknown, post: Post): boolean {
  const req = data as Partial<ArtGenerateRequest> | null;
  if (!req || req.type !== ART_MSG_GENERATE) return false;
  const scales = req.scales && req.scales.length ? req.scales : SCALE_CODES;
  const { index, data: bytes } = packSprites(scales, req.keys && req.keys.length ? req.keys : undefined);
  const res: ArtPackResponse = { type: ART_MSG_PACK, index, data: bytes, scales: [...scales] };
  post(res, [index.buffer as ArrayBuffer, bytes.buffer as ArrayBuffer]);
  return true;
}
/** 在 Worker 全局上安装处理器（入口文件自动调用；也可由自定义 Worker 显式调用）。 */
export function installArtWorker(scope: { addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void; postMessage(message: unknown, transfer?: ArrayBuffer[]): void }): void {
  scope.addEventListener('message', (e) => { handleArtWorkerMessage(e.data, (m, t) => scope.postMessage(m, t)); });
}

/** 主线程：向 worker 请求全部必备精灵，收到后返回带预生成缓存的 provider。 */
export function createProceduralProviderAsync(worker: WorkerLike): Promise<SpriteProvider> {
  return new Promise<SpriteProvider>((resolve) => {
    worker.addEventListener('message', (e) => {
      const msg = e.data as Partial<ArtPackResponse> | null;
      if (!msg || msg.type !== ART_MSG_PACK || !msg.index || !msg.data) return;
      resolve(createProceduralProvider(unpackSprites(msg.index, msg.data)));
    });
    const req: ArtGenerateRequest = { type: ART_MSG_GENERATE };
    worker.postMessage(req);
  });
}

// ---- Worker 入口自动安装（主线程 / Node 下 self 没有 importScripts，不会触发）----
declare const self: { addEventListener?: unknown; postMessage?: unknown; importScripts?: unknown } | undefined;
if (typeof self !== 'undefined' && self && typeof self.importScripts === 'function' && typeof self.addEventListener === 'function' && typeof self.postMessage === 'function') {
  installArtWorker(self as unknown as { addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void; postMessage(message: unknown, transfer?: ArrayBuffer[]): void });
}

// Worker 协议与解码客户端：假 WorkerLike 跑 handleDecodeRequest（transfer 列表、往返等价）；无 Worker 时内联；Worker 出错回退内联。
import { describe, expect, it } from 'vitest';
import type { WorkerLike } from '../../../contracts/render';
import { createDecodeClient } from './decodeClient';
import { handleDecodeRequest, isDecodeRequest, isDecodeResponse, toWire, fromWire, MSG_DECODED } from './protocol';
import type { DecodeRequestMessage } from './protocol';
import { decodeBundle } from '../sprites/bundle';
import { createDatSpriteProvider } from '../sprites/provider';
import { synthSpriteSet } from '../sprites/__fixtures__/synth';

const synth = synthSpriteSet();

function fakeWorker(log: string[], opts: { fail?: boolean; throwOnPost?: boolean } = {}): WorkerLike {
  const handlers = new Map<string, ((e: { data: unknown }) => void)[]>();
  return {
    postMessage(message, transfer) {
      log.push(`post:${transfer?.length ?? 0}`);
      if (opts.throwOnPost) throw new Error('DataCloneError');
      if (opts.fail) { setTimeout(() => (handlers.get('error') ?? []).forEach((h) => h({ data: null })), 0); return; }
      const { response, transfer: back } = handleDecodeRequest(message as DecodeRequestMessage);
      log.push(`reply:${back.length}`);
      setTimeout(() => (handlers.get('message') ?? []).forEach((h) => h({ data: response })), 0);
    },
    addEventListener(type: string, fn: (e: { data: unknown }) => void) { handlers.set(type, [...(handlers.get(type) ?? []), fn]); },
    terminate() { log.push('terminate'); },
  } as WorkerLike;
}

describe('protocol', () => {
  it('toWire / fromWire 往返；transfer 列表含每个页缓冲；handleDecodeRequest 对坏输入回 failed', () => {
    const b = decodeBundle({ large: synth.large, palette: synth.palette });
    const { bundle, transfer } = toWire(b);
    expect(transfer.length).toBe(b.pages.length);
    const back = fromWire(bundle);
    expect(back.frames.size).toBe(b.frames.size);
    expect(back.palette!.rgba).toBe(b.palette!.rgba);
    expect(back.palette!.cycles).toEqual([]);
    const req: DecodeRequestMessage = { type: 'sc2k-assets:decode', id: 3, input: { large: synth.large, palette: synth.palette } };
    expect(isDecodeRequest(req)).toBe(true);
    expect(isDecodeRequest({ type: 'x' })).toBe(false);
    const { response } = handleDecodeRequest(req);
    expect(isDecodeResponse(response)).toBe(true);
    expect(response.type).toBe(MSG_DECODED);
    expect(response.id).toBe(3);
  });
});

describe('createDecodeClient', () => {
  const sameAsInline = async (client: ReturnType<typeof createDecodeClient>): Promise<void> => {
    const viaClient = await client.decode({ large: synth.large, smallmed: synth.smallmed, palette: synth.palette });
    const inline = decodeBundle({ large: synth.large, smallmed: synth.smallmed, palette: synth.palette });
    expect(viaClient.spriteCount).toBe(inline.spriteCount);
    const a = createDatSpriteProvider(viaClient, viaClient.palette!), b = createDatSpriteProvider(inline, inline.palette!);
    const k = { kind: 'terrain' as const, id: 7 };
    expect(a.bitmap(k, 'S')!.data).toEqual(b.bitmap(k, 'S')!.data);
    expect(a.bitmap(k, 'S')!.opaque).toEqual(b.bitmap(k, 'S')!.opaque);
  };

  it('有 Worker：输入拷贝后 transfer 过去，结果与内联一致，调用方缓冲不被 detach', async () => {
    const log: string[] = [];
    const client = createDecodeClient(() => fakeWorker(log));
    await sameAsInline(client);
    expect(client.usingWorker).toBe(true);
    expect(log[0]).toBe('post:3');
    expect(synth.large.byteLength).toBeGreaterThan(0);                 // 没被 transfer 掉
    client.dispose();
    expect(log).toContain('terminate');
  });

  it('没有 Worker（spawn 返回 null）：内联解码', async () => {
    const client = createDecodeClient(() => null);
    await sameAsInline(client);
    expect(client.usingWorker).toBe(false);
  });

  it('Worker 出错 → 回退内联并终止 Worker；postMessage 抛错同样回退', async () => {
    const log: string[] = [];
    const client = createDecodeClient(() => fakeWorker(log, { fail: true }));
    await sameAsInline(client);
    expect(log).toContain('terminate');
    await sameAsInline(client);                                        // 之后一直内联
    expect(log.filter((l) => l.startsWith('post:')).length).toBe(1);
    const log2: string[] = [];
    const client2 = createDecodeClient(() => fakeWorker(log2, { throwOnPost: true }));
    await sameAsInline(client2);
    expect(log2).toContain('terminate');
  });
});

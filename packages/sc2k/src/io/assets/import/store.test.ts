// WP14 验收：IndexedDB AssetStore（fake-indexeddb）：缓存命中、DECODER_VERSION 失效、clearAll；saves 接口（接管 savesLite）；
// 内存回退实现跑同一套用例。
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { AssetStore, IdentifiedFile } from '../../../contracts/assets';
import { bundleToDecodedAssets, createAssetStore, createIndexedDbAssetStore, createMemoryAssetStore, decodedAssetsToSource, decodedCacheKey, DB_NAME } from './store';
import type { AssetStoreExt } from './store';
import { sha256Hex } from './sha256';
import { DECODER_VERSION, decodeBundle } from '../sprites/bundle';
import { createDatSpriteProvider } from '../sprites/provider';
import { synthSpriteSet } from '../sprites/__fixtures__/synth';

const synth = synthSpriteSet();
const idf = (kind: IdentifiedFile['kind'], name: string, bytes: ArrayBuffer): IdentifiedFile => ({ kind, name, size: bytes.byteLength, lastModified: 42, file: new File([new Uint8Array(bytes)], name) });
const bytesOf = (...v: number[]): ArrayBuffer => new Uint8Array(v).buffer;

describe('sha256', () => {
  it('已知向量', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
});

describe.each([
  ['indexeddb', (): AssetStoreExt => createIndexedDbAssetStore({ factory: new IDBFactory(), now: () => 1000 })],
  ['memory', (): AssetStoreExt => createMemoryAssetStore(() => 1000)],
] as const)('AssetStore（%s）', (_name, make) => {
  it('putFile / getFile：sha256、覆盖、未知种类 undefined', async () => {
    const s = make();
    expect(await s.getFile('LARGE')).toBeUndefined();
    await s.putFile(idf('LARGE', 'LARGE.DAT', synth.large), synth.large);
    const got = (await s.getFile('LARGE'))!;
    expect(got.sha256).toBe(sha256Hex(synth.large));
    expect(new Uint8Array(got.bytes)).toEqual(new Uint8Array(synth.large));
    await s.putFile(idf('LARGE', 'LARGE.DAT', synth.smallmed), synth.smallmed);
    expect((await s.getFile('LARGE'))!.sha256).toBe(sha256Hex(synth.smallmed));
    expect(await s.getFile('SPECIAL')).toBeUndefined();
    s.close();
  });

  it('decoded 缓存：命中返回等价内容、DECODER_VERSION 变更即失效、clearAll 清空', async () => {
    const s = make();
    const bundle = decodeBundle({ large: synth.large, smallmed: synth.smallmed, palette: synth.palette });
    const parts = [{ kind: 'LARGE' as const, sha256: sha256Hex(synth.large) }, { kind: 'SMALLMED' as const, sha256: sha256Hex(synth.smallmed) }, { kind: 'PAL_MSTR' as const, sha256: sha256Hex(synth.palette) }];
    const key = decodedCacheKey(parts);
    expect(key.endsWith(`;v${DECODER_VERSION}`)).toBe(true);
    expect(decodedCacheKey(parts.slice().reverse())).toBe(key);                       // 顺序无关
    expect(await s.getDecoded(key)).toBeUndefined();
    await s.putDecoded(key, bundleToDecodedAssets(bundle));
    const hit = (await s.getDecoded(key))!;
    expect(hit.atlasPages.length).toBe(bundle.pages.length);
    expect(hit.frames.size).toBe(bundle.frames.size);
    expect(hit.idLayout).toEqual(bundle.idLayout);
    expect(hit.diagnostics.length).toBe(bundle.diagnostics.length);
    const src = await decodedAssetsToSource(hit);
    const a = createDatSpriteProvider(src, bundle.palette!), b = createDatSpriteProvider(bundle, bundle.palette!);
    const k = { kind: 'xbld' as const, id: 0x9d };
    expect(a.bitmap(k, 'M')!.data).toEqual(b.bitmap(k, 'M')!.data);
    expect(a.bitmap(k, 'M')!.opaque).toEqual(b.bitmap(k, 'M')!.opaque);
    expect(a.bitmap(k, 'M')!.anchorY).toBe(b.bitmap(k, 'M')!.anchorY);
    // 版本变更 → 另一个键 → 未命中
    expect(await s.getDecoded(decodedCacheKey(parts, DECODER_VERSION + 1))).toBeUndefined();
    // 文件变化 → 未命中
    expect(await s.getDecoded(decodedCacheKey([...parts.slice(0, 2), { kind: 'PAL_MSTR', sha256: 'deadbeef' }]))).toBeUndefined();
    await s.putFile(idf('PAL_MSTR', 'PAL_MSTR.BMP', synth.palette), synth.palette);
    await s.setPrefs({ useOriginalArt: true });
    await s.clearAll();
    expect(await s.getDecoded(key)).toBeUndefined();
    expect(await s.getFile('PAL_MSTR')).toBeUndefined();
    expect(await s.getPrefs()).toEqual({ useOriginalArt: false, persistGranted: false });
    s.close();
  });

  it('saves：增删查、按 savedAt 倒序、按 id 更新、缩略图 Blob 往返；clearAll 不碰 saves、clearSaves 才清', async () => {
    const s = make();
    expect(await s.listSaves()).toEqual([]);
    const id1 = await s.putSave({ kind: 'sc2', name: 'a.sc2', cityName: 'Alpha', year: 1950, population: 10, savedAt: 100, thumbnail: null, bytes: bytesOf(1, 2, 3) });
    const thumb = new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' });
    const id2 = await s.putSave({ kind: 'sc2kweb', name: 'b.sc2kweb', cityName: 'Beta', year: 1960, population: 20, savedAt: 200, thumbnail: thumb, bytes: bytesOf(4, 5) });
    expect(id1).not.toBe(id2);
    const list = await s.listSaves();
    expect(list.map((m) => m.id)).toEqual([id2, id1]);
    expect(list[0]).toMatchObject({ kind: 'sc2kweb', name: 'b.sc2kweb', cityName: 'Beta', year: 1960, population: 20, savedAt: 200 });
    expect(new Uint8Array(await list[0]!.thumbnail!.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
    const rec = (await s.getSave(id1))!;
    expect(new Uint8Array(rec.bytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(rec.id).toBe(id1);
    const again = await s.putSave({ id: id1, kind: 'sc2', name: 'a2.sc2', cityName: 'Alpha2', year: 1951, population: 11, savedAt: 300, thumbnail: null, bytes: bytesOf(6) });
    expect(again).toBe(id1);
    expect((await s.listSaves()).map((m) => [m.id, m.name])).toEqual([[id1, 'a2.sc2'], [id2, 'b.sc2kweb']]);
    await s.clearAll();
    expect((await s.listSaves()).length).toBe(2);
    await s.deleteSave(id2);
    expect((await s.listSaves()).map((m) => m.id)).toEqual([id1]);
    expect(await s.getSave(id2)).toBeUndefined();
    await s.clearSaves();
    expect(await s.listSaves()).toEqual([]);
    s.close();
  });

  it('prefs 默认值与合并；estimate 返回数字', async () => {
    const s = make();
    expect(await s.getPrefs()).toEqual({ useOriginalArt: false, persistGranted: false });
    await s.setPrefs({ useOriginalArt: true });
    await s.setPrefs({ persistGranted: true });
    expect(await s.getPrefs()).toEqual({ useOriginalArt: true, persistGranted: true });
    const e = await s.estimate();
    expect(typeof e.usage).toBe('number'); expect(typeof e.quota).toBe('number');
    s.close();
  });
});

describe('IndexedDB 特有', () => {
  it('同一 factory 的第二个实例看到已写入的数据（真正落盘）；数据库名与版本', async () => {
    const factory = new IDBFactory();
    const a = createIndexedDbAssetStore({ factory });
    await a.putFile(idf('SMALLMED', 'SMALLMED.DAT', synth.smallmed), synth.smallmed);
    await a.putSave({ kind: 'sc2', name: 'x.sc2', cityName: 'X', year: 1900, population: 0, savedAt: 1, thumbnail: null, bytes: bytesOf(1) });
    a.close();
    const b = createIndexedDbAssetStore({ factory });
    expect((await b.getFile('SMALLMED'))!.sha256).toBe(sha256Hex(synth.smallmed));
    expect((await b.listSaves()).length).toBe(1);
    expect(b.backend).toBe('indexeddb');
    const dbs = await factory.databases();
    expect(dbs.map((d) => d.name)).toContain(DB_NAME);
    b.close();
  });
  it('createAssetStore：有 indexedDB 用 IndexedDB，否则内存', () => {
    const g = globalThis as { indexedDB?: IDBFactory };
    const saved = g.indexedDB;
    try {
      g.indexedDB = new IDBFactory();
      expect((createAssetStore() as AssetStoreExt).backend).toBe('indexeddb');
      delete g.indexedDB;
      const mem: AssetStore = createAssetStore();
      expect((mem as AssetStoreExt).backend).toBe('memory');
    } finally { if (saved) g.indexedDB = saved; else delete g.indexedDB; }
  });
});

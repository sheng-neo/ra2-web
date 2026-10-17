// ===== app/savesLite.test.ts =====（WP12b 验收：IndexedDB SaveStore 最小实现，fake-indexeddb）
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { SaveRecord, SaveStore } from '../contracts/assets';
import { SAVES_DB_NAME, createMemorySaveStore, createSaveStore } from './savesLite';

const rec = (name: string, savedAt: number, extra: Partial<SaveRecord> = {}): SaveRecord => ({
  kind: 'sc2kweb', name, cityName: 'Harborlight', year: 1905, population: 1200, savedAt, thumbnail: null,
  bytes: new Uint8Array([1, 2, 3, savedAt & 0xff]).buffer, ...extra,
});

const suites: Array<[string, () => SaveStore]> = [
  ['IndexedDB（fake-indexeddb）', () => createSaveStore({ indexedDB: new IDBFactory(), dbName: `${SAVES_DB_NAME}-test-${Math.random()}` })],
  ['内存退路', () => createMemorySaveStore()],
];

describe.each(suites)('SaveStore：%s', (_label, make) => {
  it('put → list（按 savedAt 降序，不含 bytes）→ get → delete', async () => {
    const store = make();
    expect(await store.listSaves()).toEqual([]);
    const a = await store.putSave(rec('a', 100));
    const b = await store.putSave(rec('b', 300));
    const c = await store.putSave(rec('c', 200));
    expect(new Set([a, b, c]).size).toBe(3);
    const list = await store.listSaves();
    expect(list.map((m) => m.name)).toEqual(['b', 'c', 'a']);
    expect(list[0]).toMatchObject({ id: b, kind: 'sc2kweb', cityName: 'Harborlight', year: 1905, population: 1200, savedAt: 300, thumbnail: null });
    expect('bytes' in list[0]!).toBe(false);
    const got = await store.getSave(c);
    expect(got?.name).toBe('c');
    expect(Array.from(new Uint8Array(got!.bytes))).toEqual([1, 2, 3, 200]);
    await store.deleteSave(c);
    expect((await store.listSaves()).map((m) => m.name)).toEqual(['b', 'a']);
    expect(await store.getSave(c)).toBeUndefined();
  });
  it('带 id 的 put 覆盖同一条；缩略图 Blob 往返', async () => {
    const store = make();
    const id = await store.putSave(rec('v1', 10));
    const again = await store.putSave(rec('v2', 20, { id, thumbnail: new Blob([new Uint8Array([9, 9])], { type: 'image/png' }) }));
    expect(again).toBe(id);
    const list = await store.listSaves();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('v2');
    expect(list[0]!.thumbnail).toBeInstanceOf(Blob);
    expect(list[0]!.thumbnail!.size).toBe(2);
  });
  it('删除不存在的 id 不抛；bytes 与调用方缓冲隔离', async () => {
    const store = make();
    await expect(store.deleteSave(999)).resolves.toBeUndefined();
    const src = new Uint8Array([5, 6, 7]);
    const id = await store.putSave(rec('iso', 1, { bytes: src.buffer }));
    src[0] = 99;
    expect(new Uint8Array((await store.getSave(id))!.bytes)[0]).toBe(5);
  });
});

describe('createSaveStore 环境探测', () => {
  it('没有 indexedDB（Node）时退化为内存实现且可用', async () => {
    expect(typeof (globalThis as { indexedDB?: unknown }).indexedDB).toBe('undefined');
    const store = createSaveStore();
    const id = await store.putSave(rec('node', 1));
    expect((await store.listSaves())[0]!.id).toBe(id);
    const explicitNull = createSaveStore({ indexedDB: null });
    expect(await explicitNull.listSaves()).toEqual([]);
  });
  it('同一库名的两个实例共享数据（IndexedDB）', async () => {
    const factory = new IDBFactory();
    const name = 'sc2k-saves-shared';
    const s1 = createSaveStore({ indexedDB: factory, dbName: name });
    const s2 = createSaveStore({ indexedDB: factory, dbName: name });
    const id = await s1.putSave(rec('shared', 42));
    expect((await s2.getSave(id))?.name).toBe('shared');
  });
});

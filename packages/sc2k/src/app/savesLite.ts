// ===== app/savesLite.ts =====（WP12b：IndexedDB SaveStore 最小实现，CONTRACTS §S；WP14 合入后由其 AssetStore 接管，接口不变）
// 库 'sc2k-saves'（版本 1）单一对象仓 'saves'（keyPath id 自增，索引 savedAt）。首次操作时惰性打开；
// 没有 IndexedDB（Node / 隐私模式 / 测试）时退化为内存 Map 实现，所有方法永不抛"环境缺失"错。
// 测试用 fake-indexeddb：createSaveStore({ indexedDB: new IDBFactory() })。
import type { SaveMeta, SaveRecord, SaveStore } from '../contracts/assets';

export const SAVES_DB_NAME = 'sc2k-saves', SAVES_DB_VERSION = 1, SAVES_STORE = 'saves';

export interface SaveStoreOptions { dbName?: string; indexedDB?: IDBFactory | null }

const metaOf = (r: SaveRecord & { id: number }): SaveMeta => ({
  id: r.id, kind: r.kind, name: r.name, cityName: r.cityName, year: r.year, population: r.population, savedAt: r.savedAt, thumbnail: r.thumbnail,
});
const byNewest = (a: SaveMeta, b: SaveMeta): number => b.savedAt - a.savedAt || b.id - a.id;

/** 纯内存实现（无 IndexedDB 时的退路；也可直接用于测试）。 */
export function createMemorySaveStore(): SaveStore {
  const rows = new Map<number, SaveRecord & { id: number }>();
  let nextId = 1;
  return {
    listSaves: async () => [...rows.values()].map(metaOf).sort(byNewest),
    putSave: async (s) => {
      const id = s.id ?? nextId++;
      nextId = Math.max(nextId, id + 1);
      rows.set(id, { ...s, id, bytes: s.bytes.slice(0) });
      return id;
    },
    getSave: async (id) => { const r = rows.get(id); return r ? { ...r, bytes: r.bytes.slice(0) } : undefined; },
    deleteSave: async (id) => { rows.delete(id); },
  };
}

/** 把 IDBRequest 包成 Promise。 */
const req = <T>(r: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error ?? new Error('indexedDB request failed'));
});
const done = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
  tx.onabort = () => reject(tx.error ?? new Error('indexedDB transaction aborted'));
});

function openDb(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(name, SAVES_DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(SAVES_STORE)) {
        const store = db.createObjectStore(SAVES_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('indexedDB open failed'));
    r.onblocked = () => reject(new Error('indexedDB open blocked'));
  });
}

/** IndexedDB 实现；factory 缺失时返回内存实现。 */
export function createSaveStore(opts: SaveStoreOptions = {}): SaveStore {
  const factory = opts.indexedDB === undefined ? (typeof indexedDB !== 'undefined' ? indexedDB : null) : opts.indexedDB;
  if (!factory) return createMemorySaveStore();
  const name = opts.dbName ?? SAVES_DB_NAME;
  let dbp: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    if (!dbp) dbp = openDb(factory, name).catch((e: unknown) => { dbp = null; throw e; });
    return dbp;
  };
  const store = async (mode: IDBTransactionMode): Promise<{ os: IDBObjectStore; tx: IDBTransaction }> => {
    const tx = (await db()).transaction(SAVES_STORE, mode);
    return { os: tx.objectStore(SAVES_STORE), tx };
  };
  return {
    async listSaves() {
      const { os } = await store('readonly');
      const all = await req(os.getAll() as IDBRequest<Array<SaveRecord & { id: number }>>);
      return all.map(metaOf).sort(byNewest);
    },
    async putSave(s) {
      const { os, tx } = await store('readwrite');
      const rec: SaveRecord = { ...s };
      if (rec.id === undefined) delete rec.id;          // 让 autoIncrement 发号（显式 undefined 会被当作键值）
      const key = await req(os.put(rec));
      await done(tx);
      return Number(key);
    },
    async getSave(id) {
      const { os } = await store('readonly');
      return (await req(os.get(id) as IDBRequest<SaveRecord | undefined>)) ?? undefined;
    },
    async deleteSave(id) {
      const { os, tx } = await store('readwrite');
      await req(os.delete(id));
      await done(tx);
    },
  };
}

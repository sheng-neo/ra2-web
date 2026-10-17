// ===== io/assets/import/store.ts =====（spec:file-formats §3.9.5；CONTRACTS §S AssetStore；ARCHITECTURE §9.3 / §9.4）
// IndexedDB `sc2k-assets` v1：files（原始字节，key = kind）/ decoded（索引图集缓存，key = sha256 组合 + DECODER_VERSION）/
// handles（v2 目录授权）/ saves（玩家存档，自增 id；接管 WP12 savesLite 的 SaveStore）/ meta（prefs）。
// 没有 indexedDB 的环境（Node 测试、隐私模式失败）回退到同接口的内存实现。字节只在本机：本文件不含任何网络 I/O。
import type { AssetKind, AssetStore, DecodedAssets, IdentifiedFile, SaveMeta, SaveRecord } from '../../../contracts/assets';
import type { Diagnostic } from '../../../contracts/system';
import { sha256Hex } from './sha256';
import { DECODER_VERSION } from '../sprites/bundle';
import type { DatBundle } from '../sprites/bundle';
import type { DatProviderSource } from '../sprites/provider';
import type { AtlasFrame } from '../sprites/atlas';
import { decodeAtlasPage, encodeAtlasPage } from '../sprites/atlas';

export const DB_NAME = 'sc2k-assets', DB_VERSION = 1;
export const STORE_FILES = 'files', STORE_DECODED = 'decoded', STORE_HANDLES = 'handles', STORE_SAVES = 'saves', STORE_META = 'meta';
export interface Prefs { useOriginalArt: boolean; persistGranted: boolean }
export const DEFAULT_PREFS: Readonly<Prefs> = { useOriginalArt: false, persistGranted: false };

export class AssetStoreError extends Error {
  readonly code: 'QUOTA' | 'IDB';
  constructor(code: 'QUOTA' | 'IDB', message: string) { super(message); this.name = 'AssetStoreError'; this.code = code; }
}

export interface FileRecord { kind: AssetKind; name: string; size: number; lastModified: number; sha256: string; bytes: ArrayBuffer; importedAt: number }
interface DecodedRecord { key: string; atlasPages: ArrayBuffer[]; frames: Map<number, AtlasFrame>; idLayout: Record<string, number>; diagnostics: Diagnostic[]; storedAt: number }
interface SaveRow { id?: number; kind: SaveRecord['kind']; name: string; cityName: string; year: number; population: number; savedAt: number; thumbnail: Blob | null; bytes: ArrayBuffer }
interface MetaRow { key: string; value: unknown }

/** 契约之外的便利项（集成者可用、不必须）。 */
export interface AssetStoreExt extends AssetStore {
  readonly backend: 'indexeddb' | 'memory';
  /** 只删玩家存档（clearAll 不碰 saves：那是玩家自己的数据，不是缓存）。 */
  clearSaves(): Promise<void>;
  close(): void;
}

const metaOf = (r: SaveRow & { id: number }): SaveMeta => ({ id: r.id, kind: r.kind, name: r.name, cityName: r.cityName, year: r.year, population: r.population, savedAt: r.savedAt, thumbnail: r.thumbnail });
const sortSaves = (a: SaveMeta, b: SaveMeta): number => b.savedAt - a.savedAt || b.id - a.id;

// ---------------------------------------------------------------------------
// 内存实现（WP0 桩的升级版：带 sha256，与 IndexedDB 版同语义）
// ---------------------------------------------------------------------------
export function createMemoryAssetStore(now: () => number = () => Date.now()): AssetStoreExt {
  const saves = new Map<number, SaveRow & { id: number }>();
  const files = new Map<AssetKind, FileRecord>();
  const decoded = new Map<string, DecodedRecord>();
  let prefs: Prefs = { ...DEFAULT_PREFS };
  let nextId = 1;
  return {
    backend: 'memory',
    listSaves: async () => [...saves.values()].map(metaOf).sort(sortSaves),
    putSave: async (s) => { const id = s.id ?? nextId++; nextId = Math.max(nextId, id + 1); saves.set(id, { ...s, id }); return id; },
    getSave: async (id) => saves.get(id),
    deleteSave: async (id) => { saves.delete(id); },
    putFile: async (f, bytes) => { files.set(f.kind, { kind: f.kind, name: f.name, size: bytes.byteLength, lastModified: f.lastModified, sha256: sha256Hex(bytes), bytes, importedAt: now() }); },
    getFile: async (kind) => { const r = files.get(kind); return r ? { bytes: r.bytes, sha256: r.sha256 } : undefined; },
    putDecoded: async (key, v) => { decoded.set(key, await toDecodedRecord(key, v, now())); },
    getDecoded: async (key) => { const r = decoded.get(key); return r ? fromDecodedRecord(r) : undefined; },
    getPrefs: async () => ({ ...prefs }),
    setPrefs: async (p) => { prefs = { ...prefs, ...p }; },
    clearAll: async () => { files.clear(); decoded.clear(); prefs = { ...DEFAULT_PREFS }; },
    clearSaves: async () => { saves.clear(); },
    estimate: async () => ({ usage: [...files.values()].reduce((n, r) => n + r.bytes.byteLength, 0), quota: 0 }),
    close: () => { /* 无资源 */ },
  };
}

// ---------------------------------------------------------------------------
// IndexedDB 实现
// ---------------------------------------------------------------------------
export interface IndexedDbStoreOptions { dbName?: string; factory?: IDBFactory; now?: () => number }

const req = <T>(r: IDBRequest<T>): Promise<T> => new Promise<T>((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(wrapIdbError(r.error));
});
const done = (tx: IDBTransaction): Promise<void> => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(wrapIdbError(tx.error));
  tx.onabort = () => reject(wrapIdbError(tx.error));
});
function wrapIdbError(e: DOMException | null | undefined): Error {
  if (e && e.name === 'QuotaExceededError') return new AssetStoreError('QUOTA', '浏览器存储空间不足');
  return new AssetStoreError('IDB', e?.message ?? 'IndexedDB 操作失败');
}

export function createIndexedDbAssetStore(opts: IndexedDbStoreOptions = {}): AssetStoreExt {
  const factory = opts.factory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!factory) throw new AssetStoreError('IDB', '当前环境没有 indexedDB');
  const dbName = opts.dbName ?? DB_NAME;
  const now = opts.now ?? (() => Date.now());
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const r = factory.open(dbName, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES, { keyPath: 'kind' });
        if (!db.objectStoreNames.contains(STORE_DECODED)) db.createObjectStore(STORE_DECODED, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(STORE_HANDLES)) db.createObjectStore(STORE_HANDLES, { keyPath: 'name' });
        if (!db.objectStoreNames.contains(STORE_SAVES)) db.createObjectStore(STORE_SAVES, { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
      };
      r.onsuccess = () => {
        const db = r.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      r.onerror = () => { dbPromise = null; reject(wrapIdbError(r.error)); };
      r.onblocked = () => { /* 等待其它标签页关闭旧版本；不报错 */ };
    });
    return dbPromise;
  };
  const read = async <T>(store: string, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    const tx = db.transaction(store, 'readonly');
    const out = await req(fn(tx.objectStore(store)));
    await done(tx);
    return out;
  };
  const write = async <T>(store: string, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
    const db = await open();
    const tx = db.transaction(store, 'readwrite');
    const r = fn(tx.objectStore(store));
    const out = r ? await req(r) : undefined;
    await done(tx);
    return out;
  };
  const getMeta = async <T>(key: string, fallback: T): Promise<T> => {
    const row = await read<MetaRow | undefined>(STORE_META, (s) => s.get(key) as IDBRequest<MetaRow | undefined>);
    return row ? (row.value as T) : fallback;
  };
  return {
    backend: 'indexeddb',
    listSaves: async () => {
      const rows = await read<SaveRow[]>(STORE_SAVES, (s) => s.getAll() as IDBRequest<SaveRow[]>);
      return rows.filter((r): r is SaveRow & { id: number } => typeof r.id === 'number').map(metaOf).sort(sortSaves);
    },
    putSave: async (s) => {
      const row: SaveRow = { kind: s.kind, name: s.name, cityName: s.cityName, year: s.year, population: s.population, savedAt: s.savedAt, thumbnail: s.thumbnail, bytes: s.bytes };
      if (s.id !== undefined) row.id = s.id;
      const key = await write<IDBValidKey>(STORE_SAVES, (st) => st.put(row));
      return Number(key);
    },
    getSave: async (id) => {
      const row = await read<SaveRow | undefined>(STORE_SAVES, (s) => s.get(id) as IDBRequest<SaveRow | undefined>);
      return row ? { ...row, id } : undefined;
    },
    deleteSave: async (id) => { await write(STORE_SAVES, (s) => s.delete(id)); },
    putFile: async (f: IdentifiedFile, bytes: ArrayBuffer) => {
      const rec: FileRecord = { kind: f.kind, name: f.name, size: bytes.byteLength, lastModified: f.lastModified, sha256: sha256Hex(bytes), bytes, importedAt: now() };
      await write(STORE_FILES, (s) => s.put(rec));
    },
    getFile: async (kind) => {
      const r = await read<FileRecord | undefined>(STORE_FILES, (s) => s.get(kind) as IDBRequest<FileRecord | undefined>);
      return r ? { bytes: r.bytes, sha256: r.sha256 } : undefined;
    },
    putDecoded: async (key, v) => { const rec = await toDecodedRecord(key, v, now()); await write(STORE_DECODED, (s) => s.put(rec)); },
    getDecoded: async (key) => {
      const r = await read<DecodedRecord | undefined>(STORE_DECODED, (s) => s.get(key) as IDBRequest<DecodedRecord | undefined>);
      return r ? fromDecodedRecord(r) : undefined;
    },
    getPrefs: async () => ({ ...DEFAULT_PREFS, ...(await getMeta<Partial<Prefs>>('prefs', {})) }),
    setPrefs: async (p) => {
      const cur = await getMeta<Partial<Prefs>>('prefs', {});
      const row: MetaRow = { key: 'prefs', value: { ...DEFAULT_PREFS, ...cur, ...p } };
      await write(STORE_META, (s) => s.put(row));
    },
    clearAll: async () => {
      const db = await open();
      const tx = db.transaction([STORE_FILES, STORE_DECODED, STORE_HANDLES, STORE_META], 'readwrite');
      for (const name of [STORE_FILES, STORE_DECODED, STORE_HANDLES, STORE_META]) tx.objectStore(name).clear();
      await done(tx);
    },
    clearSaves: async () => { await write(STORE_SAVES, (s) => s.clear()); },
    estimate: async () => {
      const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
      if (!storage || typeof storage.estimate !== 'function') return { usage: 0, quota: 0 };
      try { const e = await storage.estimate(); return { usage: e.usage ?? 0, quota: e.quota ?? 0 }; } catch { return { usage: 0, quota: 0 }; }
    },
    close: () => { if (dbPromise) { void dbPromise.then((db) => db.close()).catch(() => undefined); dbPromise = null; } },
  };
}

/** 入口：有 indexedDB 用它，否则内存（Node / 受限环境）。 */
export function createAssetStore(): AssetStore {
  if (typeof indexedDB === 'undefined') return createMemoryAssetStore();
  try { return createIndexedDbAssetStore(); } catch { return createMemoryAssetStore(); }
}

// ---------------------------------------------------------------------------
// decoded 缓存键与 DatBundle ↔ DecodedAssets ↔ 记录 的转换
// ---------------------------------------------------------------------------
/** 缓存键：按 kind 排序的 `kind=sha256` 列表 + 解码器版本（§3.9.6；任一文件变化或 DECODER_VERSION 变化即失效）。 */
export function decodedCacheKey(parts: ReadonlyArray<{ kind: AssetKind; sha256: string }>, version: number = DECODER_VERSION): string {
  return parts.slice().sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)).map((p) => `${p.kind}=${p.sha256}`).join(';') + `;v${version}`;
}

/** DatBundle → 契约 DecodedAssets（页 → 自描述 Blob）。 */
export function bundleToDecodedAssets(b: DatBundle): DecodedAssets {
  return {
    atlasPages: b.pages.map((p) => new Blob([encodeAtlasPage(p) as BlobPart], { type: 'application/octet-stream' })),
    frames: new Map(b.frames),
    idLayout: { ...b.idLayout },
    diagnostics: b.diagnostics.slice(),
  };
}
/** DecodedAssets → DatSpriteProvider 的输入。 */
export async function decodedAssetsToSource(d: DecodedAssets): Promise<DatProviderSource> {
  const pages = [];
  for (const blob of d.atlasPages) pages.push(decodeAtlasPage(new Uint8Array(await blob.arrayBuffer())));
  return { pages, frames: d.frames, idLayout: d.idLayout };
}
/** 记录里存 ArrayBuffer 而不是 Blob：结构化克隆在所有实现（含 fake-indexeddb）下都稳定。 */
async function toDecodedRecord(key: string, v: DecodedAssets, storedAt: number): Promise<DecodedRecord> {
  const atlasPages: ArrayBuffer[] = [];
  for (const b of v.atlasPages) atlasPages.push(await b.arrayBuffer());
  return { key, atlasPages, frames: new Map(v.frames), idLayout: { ...v.idLayout }, diagnostics: v.diagnostics.slice(), storedAt };
}
function fromDecodedRecord(r: DecodedRecord): DecodedAssets {
  return { atlasPages: r.atlasPages.map((buf) => new Blob([buf], { type: 'application/octet-stream' })), frames: new Map(r.frames), idLayout: { ...r.idLayout }, diagnostics: r.diagnostics.slice() };
}

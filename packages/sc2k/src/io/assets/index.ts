// ===== io/assets/index.ts =====（WP0 转发桩 → WP14 接手；导出名与签名按 CONTRACTS §V AssetsEntry（在 contracts/shell.ts））
// 内存 AssetStore（Map；不持久化、不触网）+ 空面板 importer（mount 无操作，onProviderReady 永不回调）。
// 本目录经 ESLint 禁止 import 网络模块（隐私红线，ARCHITECTURE §9.4）。
import type { AssetsEntry } from '../../contracts/shell';
import type { AssetImporter, AssetKind, AssetStore, DecodedAssets, IdentifiedFile, SaveMeta, SaveRecord } from '../../contracts/assets';
import type { Sc2Codec } from '../../contracts/io';

export function createMemoryAssetStore(): AssetStore {
  const saves = new Map<number, SaveRecord & { id: number }>();
  const files = new Map<AssetKind, { bytes: ArrayBuffer; sha256: string }>();
  const decoded = new Map<string, DecodedAssets>();
  let prefs = { useOriginalArt: false, persistGranted: false };
  let nextId = 1;
  const metaOf = (r: SaveRecord & { id: number }): SaveMeta => ({
    id: r.id, kind: r.kind, name: r.name, cityName: r.cityName, year: r.year, population: r.population, savedAt: r.savedAt, thumbnail: r.thumbnail,
  });
  return {
    listSaves: async () => [...saves.values()].map(metaOf).sort((a, b) => b.savedAt - a.savedAt),
    putSave: async (s) => { const id = s.id ?? nextId++; nextId = Math.max(nextId, id + 1); saves.set(id, { ...s, id }); return id; },
    getSave: async (id) => saves.get(id),
    deleteSave: async (id) => { saves.delete(id); },
    putFile: async (f: IdentifiedFile, bytes) => { files.set(f.kind, { bytes, sha256: '' }); },
    getFile: async (kind) => files.get(kind),
    putDecoded: async (key, v) => { decoded.set(key, v); },
    getDecoded: async (key) => decoded.get(key),
    getPrefs: async () => ({ ...prefs }),
    setPrefs: async (p) => { prefs = { ...prefs, ...p }; },
    clearAll: async () => { saves.clear(); files.clear(); decoded.clear(); },
    estimate: async () => ({ usage: 0, quota: 0 }),
  };
}

export const createAssetStore = createMemoryAssetStore satisfies AssetsEntry['createAssetStore'];

export const createAssetImporter = ((_store: AssetStore, _sc2: Sc2Codec): AssetImporter => ({
  mount: () => { /* 桩：空面板 */ },
  unmount: () => { /* 桩 */ },
  onProviderReady: () => () => { /* 桩：永不回调 */ },
})) satisfies AssetsEntry['createAssetImporter'];

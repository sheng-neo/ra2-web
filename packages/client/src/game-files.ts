/**
 * 游戏素材本地存储（IndexedDB）+ 免费素材下载。
 * 真实美术需要泰伯利亚之日（EA 官方免费）的 .mix；浏览器直接从 CnCNet
 * 公开仓库拉取并存进本机 IndexedDB——文件不经过本项目服务器（不分发），
 * 之后任意设备（含公网/手机/流量）本地渲染真实美术。
 */

const DB_NAME = 'ra2web';
const STORE = 'gamefiles';

/** 真实美术所需的 TS mix（含 SHP 建筑步兵 / VXL 体素 / TMP 地形 / 调色板）。
 *  载具体素（harv/ttnk/4tnk/hvr/art2…）在 Local.mix——少了它车辆全无美术。 */
export const REQUIRED_MIXES = ['conquer.mix', 'cache.mix', 'temperat.mix', 'isotemp.mix', 'local.mix'];

/** CnCNet 官方 TS 客户端包（EA 免费素材的公开托管）。 */
const CNCNET_BASE = 'https://raw.githubusercontent.com/CnCNet/cncnet-ts-client-package/master/MIX';
const CNCNET_NAME: Record<string, string> = {
  'conquer.mix': 'Conquer.mix',
  'cache.mix': 'Cache.mix',
  'temperat.mix': 'Temperat.mix',
  'isotemp.mix': 'IsoTemp.mix',
  'local.mix': 'Local.mix',
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function idbGetFile(name: string): Promise<Uint8Array | null> {
  try {
    const buf = await tx<ArrayBuffer | undefined>('readonly', (s) => s.get(name.toLowerCase()));
    return buf ? new Uint8Array(buf) : null;
  } catch {
    return null;
  }
}

export async function idbPutFile(name: string, bytes: Uint8Array): Promise<void> {
  // 存 ArrayBuffer 副本（避免存到 view 的底层超大 buffer）
  const copy = bytes.slice().buffer;
  await tx('readwrite', (s) => s.put(copy, name.toLowerCase()));
}

/** 已导入的素材是否齐全（可渲染真实美术）。 */
export async function hasRealArtFiles(): Promise<boolean> {
  for (const name of REQUIRED_MIXES) {
    const f = await idbGetFile(name);
    if (!f) return false;
  }
  return true;
}

export async function clearGameFiles(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
}

export interface DownloadProgress {
  name: string;
  index: number;
  total: number;
  loaded: number;
  size: number;
}

/** 从 CnCNet 下载免费 TS 素材到本机 IndexedDB。 */
export async function downloadFreeArt(onProgress?: (p: DownloadProgress) => void): Promise<void> {
  const total = REQUIRED_MIXES.length;
  for (let i = 0; i < REQUIRED_MIXES.length; i++) {
    const key = REQUIRED_MIXES[i]!;
    if (await idbGetFile(key)) {
      onProgress?.({ name: key, index: i, total, loaded: 1, size: 1 });
      continue;
    }
    const url = `${CNCNET_BASE}/${CNCNET_NAME[key]}`;
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`下载 ${key} 失败: HTTP ${res.status}`);
    const size = Number(res.headers.get('content-length') ?? 0);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress?.({ name: key, index: i, total, loaded, size });
    }
    const merged = new Uint8Array(loaded);
    let o = 0;
    for (const c of chunks) {
      merged.set(c, o);
      o += c.length;
    }
    await idbPutFile(key, merged);
  }
}

/** 手动导入：把用户选择的 .mix 文件存入本机。 */
export async function importMixFiles(files: FileList | File[]): Promise<number> {
  let n = 0;
  for (const file of Array.from(files)) {
    if (!file.name.toLowerCase().endsWith('.mix')) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await idbPutFile(file.name, bytes);
    n++;
  }
  return n;
}

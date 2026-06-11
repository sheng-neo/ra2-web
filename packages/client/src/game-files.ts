/**
 * 游戏素材本地存储（IndexedDB）+ 免费素材下载。
 * 真实美术需要泰伯利亚之日（EA 官方免费）的 .mix；浏览器直接从 CnCNet
 * 公开仓库拉取并存进本机 IndexedDB——文件不经过本项目服务器（不分发），
 * 之后任意设备（含公网/手机/流量）本地渲染真实美术。
 */

const DB_NAME = 'ra2web';
const STORE = 'gamefiles';

/** 真实素材所需的 TS mix：美术（SHP 建筑步兵 / VXL 体素 / TMP 地形 / 调色板，
 *  载具体素在 Local.mix）+ 音效（Sounds.mix 的真实 AUD 音效）。 */
export const REQUIRED_MIXES = ['conquer.mix', 'cache.mix', 'temperat.mix', 'isotemp.mix', 'local.mix', 'sounds.mix'];

/** CnCNet 官方 TS 客户端包（EA 免费素材的公开托管）的文件名（区分大小写）。 */
const CNCNET_NAME: Record<string, string> = {
  'conquer.mix': 'Conquer.mix',
  'cache.mix': 'Cache.mix',
  'temperat.mix': 'Temperat.mix',
  'isotemp.mix': 'IsoTemp.mix',
  'local.mix': 'Local.mix',
  'sounds.mix': 'Sounds.mix',
};

/** 下载镜像源（按序尝试，先出数据者胜）。国内优先 jsDelivr——它镜像同一
 *  公开 GitHub 仓库、有中国 CDN 节点、且带 CORS；连不上再退 GitHub raw。
 *  文件全程经浏览器直连这些公开 CDN，不经过本项目服务器（不分发）。 */
interface Mirror {
  name: string;
  url: (file: string) => string;
}
const MIRRORS: Mirror[] = [
  { name: 'jsDelivr', url: (f) => `https://cdn.jsdelivr.net/gh/CnCNet/cncnet-ts-client-package@master/MIX/${f}` },
  { name: 'jsDelivr·Fastly', url: (f) => `https://fastly.jsdelivr.net/gh/CnCNet/cncnet-ts-client-package@master/MIX/${f}` },
  { name: 'jsDelivr·Gcore', url: (f) => `https://gcore.jsdelivr.net/gh/CnCNet/cncnet-ts-client-package@master/MIX/${f}` },
  { name: 'GitHub', url: (f) => `https://raw.githubusercontent.com/CnCNet/cncnet-ts-client-package/master/MIX/${f}` },
];

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

/** 取游戏 mix 字节：先本机 IndexedDB（下载/导入），后开发期 /game-data；
 *  公网无 game-data 时 SPA 兜底会返回 index.html（text/html），须排除。 */
export async function loadGameMix(casedName: string): Promise<Uint8Array | null> {
  const local = await idbGetFile(casedName);
  if (local) return local;
  try {
    const res = await fetch(`/game-data/${casedName}`);
    if (!res.ok) return null;
    if ((res.headers.get('content-type') ?? '').includes('text/html')) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
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
  /** 当前命中的镜像名（如 jsDelivr / GitHub / 本机）。 */
  source: string;
}

/** 取单个文件：按镜像顺序尝试，10s 内无响应即换下一个；一旦出数据即认定
 *  该镜像可用，之后慢也不切换（避免误杀慢但能下完的连接）。返回完整字节。 */
async function fetchMixWithFallback(
  fileName: string,
  onChunk: (source: string, loaded: number, size: number) => void,
): Promise<Uint8Array> {
  let lastErr: unknown = null;
  for (const m of MIRRORS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    try {
      const res = await fetch(m.url(fileName), { signal: ctl.signal });
      if (!res.ok || !res.body) {
        clearTimeout(timer);
        lastErr = new Error(`${m.name} HTTP ${res.status}`);
        continue;
      }
      if ((res.headers.get('content-type') ?? '').includes('text/html')) {
        clearTimeout(timer);
        lastErr = new Error(`${m.name} 返回 HTML（非素材）`);
        continue;
      }
      const size = Number(res.headers.get('content-length') ?? 0);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      let gotFirst = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!gotFirst) {
          gotFirst = true;
          clearTimeout(timer); // 已出数据：该镜像可用，慢也不切
        }
        chunks.push(value);
        loaded += value.length;
        onChunk(m.name, loaded, size);
      }
      clearTimeout(timer);
      const merged = new Uint8Array(loaded);
      let o = 0;
      for (const c of chunks) {
        merged.set(c, o);
        o += c.length;
      }
      return merged;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e; // 换下一个镜像
    }
  }
  throw lastErr ?? new Error('所有镜像均不可用');
}

/** 从公开镜像下载免费 TS 素材到本机 IndexedDB（国内优先 jsDelivr，失败退 GitHub）。 */
export async function downloadFreeArt(onProgress?: (p: DownloadProgress) => void): Promise<void> {
  const total = REQUIRED_MIXES.length;
  for (let i = 0; i < REQUIRED_MIXES.length; i++) {
    const key = REQUIRED_MIXES[i]!;
    if (await idbGetFile(key)) {
      onProgress?.({ name: key, index: i, total, loaded: 1, size: 1, source: '本机' });
      continue;
    }
    const merged = await fetchMixWithFallback(CNCNET_NAME[key]!, (source, loaded, size) =>
      onProgress?.({ name: key, index: i, total, loaded, size, source }),
    );
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

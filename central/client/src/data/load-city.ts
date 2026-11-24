/**
 * 下载地图数据（带进度）并做最基本的格式校验。
 *
 * 生产构建另带一份 gzip 版（central.json.gz、terrain.bin.gz，见 vite.config.ts）：红警的静态服务器不做
 * Content-Encoding 压缩，客户端直接下载 .gz、再用 DecompressionStream 自己解压，下载量与宿主无关。
 */
import { CITY_FORMAT, CITY_FORMAT_VERSION, type CityFile } from '@central/data';

export type Progress = (loaded: number, total: number | null) => void;

/** 流式读取响应体并回报进度；服务器没给 Content-Length（或经过压缩）时 total 为 null。 */
export async function fetchWithProgress(url: string, onProgress: Progress): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下載失敗 ${res.status}：${url}`);
  const len = Number(res.headers.get('content-length'));
  const encoded = res.headers.get('content-encoding');
  const total = len > 0 && !encoded ? len : null;
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onProgress(buf.byteLength, buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/** gzip 魔数 1f 8b 开头就解压；否则原样返回（未压缩，或宿主已按 Content-Encoding 解过）。 */
export async function gunzipIfNeeded(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 下载（可能是 .gz 的）数据文件并解压。 */
export async function fetchData(url: string, onProgress: Progress): Promise<Uint8Array<ArrayBuffer>> {
  return gunzipIfNeeded(await fetchWithProgress(url, onProgress));
}

export function parseCity(json: unknown): CityFile {
  const c = json as Partial<CityFile> | null;
  if (!c || c.format !== CITY_FORMAT) throw new Error('地圖數據格式不符（format）');
  if (c.version !== CITY_FORMAT_VERSION) throw new Error(`地圖數據版本不符：${String(c.version)}`);
  for (const k of ['buildings', 'roads', 'rails', 'water', 'landmarks'] as const) {
    if (!Array.isArray(c[k])) throw new Error(`地圖數據缺少 ${k}`);
  }
  if (!c.meta || !c.zones) throw new Error('地圖數據缺少 meta / zones');
  return c as CityFile;
}

export async function loadCity(url: string, onProgress: Progress): Promise<CityFile> {
  const bytes = await fetchData(url, onProgress);
  return parseCity(JSON.parse(new TextDecoder().decode(bytes)));
}

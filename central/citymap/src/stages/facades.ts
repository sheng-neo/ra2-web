/**
 * 02c-facades（R3 真实贴面）：地政总署「可視化三維地圖（個別模型）」的照片纹理 → Building.facade 与 meta.facades。
 *
 * 输入是 fetch/landsd_3d_tex_bake.py 写的 landsd-3dvm-facades.json.gz（在 data-raw/landsd，sources.json 校验 sha256），
 * 它列出的贴图文件放在 client/public/city/facades/（WebP，文件名带内容哈希）。这一阶段不碰图像、不需要 Python：
 * 1. 逐个校验贴图文件的 sha256 与字节数（缺文件或不符直接报错，提示重新烘焙）；
 * 2. 按几何指纹（geometryKey：轮廓、楼底、楼高、分层体块逐个整数拼成文本的 sha256）把每栋楼的引用接回 Building.facade——
 *    几何与烘焙时不同的楼不接（贴图位置会错），记进统计，客户端照旧画程序立面；
 * 3. 敏感区里的楼（质心在区内）一律不接（烘焙时已排除，这里再挡一次）；
 * 4. meta.facades：目录、页参数、页文件名、远景图集、总字节数。
 * 清单里没有任何一栋能接上时整层省略（meta.facades 也省略）。
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import type { Building, BuildingFacade, FacadeMeta, SensitiveZone } from '@central/data';
import { sha256Hex } from '../geo/hash';
import { pointInRing, ringCentroid } from '../geo/ring';

export const LANDSD_FACADES_FILE = 'landsd-3dvm-facades.json.gz';
/** 贴图目录（相对 city/）。 */
export const FACADES_DIR = 'facades';
/** 清单格式版本（2：RGBA 页、墙片带外包框 (page, x, y, c0, r0, w, h)）。 */
export const FACADES_VERSION = 2;
/** 墙片在记录里的长度。 */
const PIECE = 7;

interface FileEntry {
  file: string;
  sha256: string;
  bytes: number;
}

/** 烘焙清单（fetch/landsd_3d_tex_bake.py 的 write_outputs）。 */
export interface FacadesDoc {
  format: string;
  version: number;
  params: { page: number; pad: number; tile: number; densityQ: number };
  pages: FileEntry[];
  far: { cols: number; rows: number; cell: number; full: FileEntry; low: FileEntry };
  buildings: Record<string, { k: string; f?: [number, number]; p: number[][] }>;
  excluded: { scaffold: { id: string; green: number }[]; sensitive: string[] };
}

export interface FacadesStats {
  /** 清单里的楼 / 接上的 / 几何变了没接的 / 在敏感区没接的 / 清单里没有对应楼的。 */
  listed: number;
  attached: number;
  stale: number;
  sensitive: number;
  missing: number;
  /** 疑似脚手架 / 绿网、整栋不用照片的楼（烘焙时排除）。 */
  scaffold: string[];
  pages: number;
  bytes: number;
}

/** 从快照文件表读清单；文件不在快照里时返回 null（管线照旧出程序立面）。 */
export function readFacades(files: ReadonlyMap<string, Uint8Array>): FacadesDoc | null {
  const gz = files.get(LANDSD_FACADES_FILE);
  if (!gz) return null;
  const doc = JSON.parse(gunzipSync(gz).toString('utf8')) as FacadesDoc;
  if (doc.format !== 'central-3dvm-facades' || doc.version !== FACADES_VERSION) throw new Error(`${LANDSD_FACADES_FILE}: 格式不符`);
  return doc;
}

/** 几何指纹：与 landsd_3d_tex_bake.py geometry_key 逐字一致（整数拼成逗号分隔的文本，sha256 取前 12 位）。 */
export function geometryKey(b: Pick<Building, 'id' | 'footprint' | 'base' | 'height' | 'parts'>): string {
  const parts: (string | number)[] = [b.id, 'f', ...b.footprint.outer];
  for (const h of b.footprint.holes ?? []) parts.push('h', ...h);
  parts.push('b', b.base, 't', b.height);
  for (const p of b.parts ?? []) {
    parts.push('p', p.top);
    if (p.ring) parts.push('r', ...p.ring);
    for (const h of p.holes ?? []) parts.push('h', ...h);
  }
  return sha256Hex(parts.join(',')).slice(0, 12);
}

/** 清单里全部贴图文件（页 + 两份远景）。 */
export function facadeFiles(doc: FacadesDoc): FileEntry[] {
  return [...doc.pages, doc.far.full, doc.far.low];
}

/** 校验贴图文件：read(name) 返回文件内容（读不到时抛错或返回 null）。不一致时抛错。 */
export function verifyFacadeFiles(doc: FacadesDoc, read: (name: string) => Uint8Array | null): void {
  for (const f of facadeFiles(doc)) {
    if (!/^[a-z0-9-]+\.webp$/.test(f.file)) throw new Error(`贴图文件名不合规：${f.file}`);
    const bytes = read(f.file);
    if (!bytes) throw new Error(`缺少贴图 ${FACADES_DIR}/${f.file}（重新运行 fetch/landsd_3d_tex_bake.py）`);
    if (bytes.byteLength !== f.bytes || sha256Hex(bytes) !== f.sha256) {
      throw new Error(`贴图 ${FACADES_DIR}/${f.file} 与清单不符（sha256 / 字节数）`);
    }
  }
}

/** 从目录读贴图文件（verifyFacadeFiles 的 read）。 */
export function readFacadeDir(dir: string): (name: string) => Uint8Array | null {
  return (name) => {
    try {
      return readFileSync(path.join(dir, name));
    } catch {
      return null;
    }
  };
}

/** 引用记录是否合规：页号在范围内、坐标与外包框在页内、全是整数。 */
export function validRecord(p: number[][], pages: number, page: number): boolean {
  const inPage = (pg: number, x: number, y: number) => pg === -1 || (pg >= 0 && pg < pages && x >= 0 && y >= 0 && x < page && y < page);
  for (const rec of p) {
    if (rec.length === 0) continue;
    if (rec.length < 6 || !rec.every(Number.isInteger)) return false;
    if (rec[0]! <= 0 || rec[1]! <= 0 || !inPage(rec[2]!, rec[3]!, rec[4]!)) return false;
    let i = 5;
    while (i < rec.length) {
      const n = rec[i]!;
      if (n < 1 || i + 1 + PIECE * n > rec.length) return false;
      for (let k = 0; k < n; k++) {
        const [pg, x, y, c0, r0, w, h] = rec.slice(i + 1 + PIECE * k, i + 1 + PIECE * (k + 1)) as [number, number, number, number, number, number, number];
        if (!inPage(pg, x, y)) return false;
        if (pg >= 0 && (c0 < 0 || r0 < 0 || w <= 0 || h <= 0 || x + w > page || y + h > page)) return false;
      }
      i += 1 + PIECE * n;
    }
  }
  return true;
}

/** 把清单接到楼上（不改输入数组）；返回新楼列表、meta.facades（没有任何一栋接上时为 null）与统计。 */
export function attachFacades(
  buildings: readonly Building[],
  doc: FacadesDoc,
  sensitive: readonly SensitiveZone[],
): { buildings: Building[]; meta: FacadeMeta | null; stats: FacadesStats } {
  const stats: FacadesStats = {
    listed: Object.keys(doc.buildings).length,
    attached: 0,
    stale: 0,
    sensitive: 0,
    missing: 0,
    scaffold: doc.excluded.scaffold.map((s) => s.id),
    pages: doc.pages.length,
    bytes: facadeFiles(doc).reduce((s, f) => s + f.bytes, 0),
  };
  const seen = new Set<string>();
  const out = buildings.map((b): Building => {
    const rec = doc.buildings[b.id];
    if (!rec) return b;
    seen.add(b.id);
    const [cx, cy] = ringCentroid(b.footprint.outer);
    if (sensitive.some((z) => pointInRing(cx, cy, z.area.outer))) {
      stats.sensitive++;
      return b;
    }
    if (rec.k !== geometryKey(b) || !validRecord(rec.p, doc.pages.length, doc.params.page)) {
      stats.stale++;
      return b;
    }
    const facade: BuildingFacade = rec.f ? { f: [rec.f[0], rec.f[1]], p: rec.p } : { p: rec.p };
    stats.attached++;
    return { ...b, facade };
  });
  stats.missing = stats.listed - seen.size;
  if (stats.attached === 0) return { buildings: [...buildings], meta: null, stats };
  const meta: FacadeMeta = {
    dir: FACADES_DIR,
    page: doc.params.page,
    tile: doc.params.tile,
    densityQ: doc.params.densityQ,
    pages: doc.pages.map((p) => p.file),
    far: { file: doc.far.full.file, low: doc.far.low.file, cols: doc.far.cols, rows: doc.far.rows, cell: doc.far.cell },
    bytes: stats.bytes,
    ...(stats.scaffold.length ? { excluded: [...stats.scaffold].sort() } : {}),
  };
  return { buildings: out, meta, stats };
}

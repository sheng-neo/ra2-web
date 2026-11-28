/**
 * 02d-hires（R4 电车走廊高清街面层）：地政总署「可視化三維地圖（個別模型）」照片 → Building.hires 与 meta.hires。
 *
 * 输入是 fetch/landsd_3d_hires_bake.py 写的 landsd-3dvm-hires.json.gz（在 data-raw/landsd，sources.json 校验 sha256），
 * 它列出的页文件与 R3 贴面放在同一目录 client/public/city/facades/（WebP，文件名带内容哈希，h 开头）。这一阶段不碰图像、不需要 Python：
 * 1. 逐个校验页文件的 sha256 与字节数（缺文件或不符直接报错，提示重新烘焙）；
 * 2. 按几何指纹（与 R3 同一个 geometryKey）把每栋楼的引用接回 Building.hires——几何与烘焙时不同的楼不接，记进统计；
 * 3. 敏感区里的楼（质心在区内）一律不接（烘焙时已排除，这里再挡一次）；雨篷落在敏感区里的整块丢掉；
 * 4. meta.hires：目录、页参数、页文件名、总字节数。
 * 4b. 红线（R4 整合）：清单里整栋排除的楼（R3 已排除的 + 人工排除的横幅 / 源数据错误）连 R3 贴面一起不用（Building.facade 删掉，
 *    画程序立面）；整面排除的面（竹棚、棚网、围板样平板、源数据错误）记进 Building.hires.x，客户端这些墙不贴 R3 照片
 *    （R3 的 4 px/m 页是同一批照片，低分辨率下仍看得出竹棚 / 横幅）。
 * 5. 铺位（R4 整合，接口 I-1 的数据）：fetch/landsd_3d_hires_bays.py 从已打包的街面页读出的逐铺开口（landsd-3dvm-hires-bays.json.gz），
 *    清单记着全部页的摘要（pagesDigest），与本清单的页不符时报错（重跑铺位脚本）；接上的楼带 Building.hires.b。
 * 清单里没有任何一栋能接上时整层省略。
 */
import { gunzipSync } from 'node:zlib';
import type { Building, BuildingHires, HiresMeta, SensitiveZone } from '@central/data';
import { sha256Hex } from '../geo/hash';
import { pointInRing, ringCentroid } from '../geo/ring';
import { FACADES_DIR, geometryKey } from './facades';

export const LANDSD_HIRES_FILE = 'landsd-3dvm-hires.json.gz';
/** 铺位清单（fetch/landsd_3d_hires_bays.py 写；可选）。 */
export const LANDSD_HIRES_BAYS_FILE = 'landsd-3dvm-hires-bays.json.gz';
/** 铺位记录的长度：[part, ring, edge, s0 cm, s1 cm, 种子, 开口顶 dm, 开口底 dm, 覆盖率 %]。 */
export const BAY_LEN = 9;
/** 清单格式版本。 */
export const HIRES_VERSION = 1;
/** 段记录头的长度（part, ring, edge, kind, dq, zTop, zBot, n）与每片的长度。 */
const HEAD = 8;
const PIECE = 7;
/** 雨篷记录的长度。 */
export const CANOPY_LEN = 10;

interface FileEntry {
  file: string;
  sha256: string;
  bytes: number;
}

/** 烘焙清单（fetch/landsd_3d_hires_bake.py 的 write_outputs）。 */
export interface HiresDoc {
  format: string;
  version: number;
  params: { page: number; aux: number; tile: number; densityQ: number; reliefMaxM: number };
  pages: FileEntry[];
  streetPages: number;
  buildings: Record<string, { k: string; f: number[][]; c?: number[][] }>;
  excluded: { buildings: Record<string, string>; faces: { id: string; face: string; why: string }[] };
}

/** 铺位清单（fetch/landsd_3d_hires_bays.py）。 */
export interface HiresBaysDoc {
  format: string;
  version: number;
  /** 读铺位时全部高清页（名 + sha256）的组合摘要，见 hiresPagesDigest。 */
  pagesDigest: string;
  buildings: Record<string, number[][]>;
}

export interface HiresStats {
  listed: number;
  /** 因整栋排除而删掉 R3 贴面的楼数；记了整面排除（Building.hires.x）的面数。 */
  r3Dropped: number;
  noPhotoFaces: number;
  /** 接上的铺位数（没有铺位清单时 0）。 */
  bays: number;
  attached: number;
  stale: number;
  sensitive: number;
  missing: number;
  faces: number;
  canopies: number;
  /** 照片里有脚手架 / 绿网 / 围板、整栋或整面不用高清的楼号。 */
  excluded: string[];
  pages: number;
  bytes: number;
}

export function readHires(files: ReadonlyMap<string, Uint8Array>): HiresDoc | null {
  const gz = files.get(LANDSD_HIRES_FILE);
  if (!gz) return null;
  const doc = JSON.parse(gunzipSync(gz).toString('utf8')) as HiresDoc;
  if (doc.format !== 'central-3dvm-hires' || doc.version !== HIRES_VERSION) throw new Error(`${LANDSD_HIRES_FILE}: 格式不符`);
  return doc;
}

/** 读铺位清单（没有时 null）。 */
export function readHiresBays(files: ReadonlyMap<string, Uint8Array>): HiresBaysDoc | null {
  const gz = files.get(LANDSD_HIRES_BAYS_FILE);
  if (!gz) return null;
  const doc = JSON.parse(gunzipSync(gz).toString('utf8')) as HiresBaysDoc;
  if (doc.format !== 'central-3dvm-hires-bays' || doc.version !== 1) throw new Error(`${LANDSD_HIRES_BAYS_FILE}: 格式不符`);
  return doc;
}

/** 全部页文件（名 + sha256，按清单顺序，换行连接）的 sha256，与 landsd_3d_hires_bays.py 的 pages_digest 相同。 */
export function hiresPagesDigest(pages: readonly FileEntry[]): string {
  return sha256Hex(pages.map((p) => `${p.file} ${p.sha256}`).join('\n'));
}

/** 铺位记录合规：整数、长度、s0 < s1、种子 1–255、开口顶 > 底、覆盖率 0–100。 */
export function validBays(rows: readonly number[][]): boolean {
  return rows.every((r) => {
    if (r.length !== BAY_LEN || !r.every(Number.isInteger)) return false;
    const [part, ring, edge, s0, s1, seed, zt, zb, cov] = r as [number, number, number, number, number, number, number, number, number];
    return part >= 0 && ring >= 0 && edge >= 0 && s0 >= 0 && s1 > s0 && seed >= 1 && seed <= 255 && zt > zb && cov >= 0 && cov <= 100;
  });
}

/** 校验页文件：read(name) 返回文件内容（读不到时返回 null）。不一致时抛错。 */
export function verifyHiresFiles(doc: HiresDoc, read: (name: string) => Uint8Array | null): void {
  for (const f of doc.pages) {
    if (!/^h[su][0-9]{3}-[0-9a-f]{8}\.webp$/.test(f.file)) throw new Error(`高清页文件名不合规：${f.file}`);
    const bytes = read(f.file);
    if (!bytes) throw new Error(`缺少高清页 ${FACADES_DIR}/${f.file}（重新运行 fetch/landsd_3d_hires_bake.py）`);
    if (bytes.byteLength !== f.bytes || sha256Hex(bytes) !== f.sha256) {
      throw new Error(`高清页 ${FACADES_DIR}/${f.file} 与清单不符（sha256 / 字节数）`);
    }
  }
}

/** 段记录是否合规：整数、页号与片在页内、密度为正、zTop > zBot。 */
export function validHiresRecord(f: readonly number[][], pages: number, page: number): boolean {
  for (const rec of f) {
    if (rec.length < HEAD || !rec.every(Number.isInteger)) return false;
    const [part, ring, edge, kind, dq, zTop, zBot, n] = rec as [number, number, number, number, number, number, number, number];
    if (part < 0 || ring < 0 || edge < 0 || (kind !== 0 && kind !== 1) || dq <= 0 || zTop <= zBot || n < 1) return false;
    if (rec.length !== HEAD + PIECE * n) return false;
    for (let k = 0; k < n; k++) {
      const [pg, x, y, c0, r0, w, h] = rec.slice(HEAD + PIECE * k, HEAD + PIECE * (k + 1)) as [number, number, number, number, number, number, number];
      if (pg < 0 || pg >= pages || x < 0 || y < 0 || w <= 0 || h <= 0 || c0 < 0 || r0 < 0 || x + w > page || y + h > page) return false;
    }
  }
  return true;
}

/** 雨篷记录合规（整数、长度、伸出 > 0、厚 > 0）且整块不碰敏感区（四个角与中心都在区外）。 */
export function validCanopy(c: readonly number[], sensitive: readonly SensitiveZone[]): boolean {
  if (c.length !== CANOPY_LEN || !c.every(Number.isInteger)) return false;
  const [x0, y0, x1, y1, depth, , th] = c as [number, number, number, number, number, number, number];
  if (depth <= 0 || th <= 0 || (x0 === x1 && y0 === y1)) return false;
  const L = Math.hypot(x1 - x0, y1 - y0);
  const nx = (y1 - y0) / L;
  const ny = -(x1 - x0) / L;
  const pts: [number, number][] = [
    [x0, y0],
    [x1, y1],
    [x1 + nx * depth, y1 + ny * depth],
    [x0 + nx * depth, y0 + ny * depth],
    [(x0 + x1) / 2 + (nx * depth) / 2, (y0 + y1) / 2 + (ny * depth) / 2],
  ];
  return !pts.some(([x, y]) => sensitive.some((z) => pointInRing(x, y, z.area.outer)));
}

/** 把清单接到楼上（不改输入数组）。 */
export function attachHires(
  buildings: readonly Building[],
  doc: HiresDoc,
  sensitive: readonly SensitiveZone[],
  dir = FACADES_DIR,
  bays: HiresBaysDoc | null = null,
): { buildings: Building[]; meta: HiresMeta | null; stats: HiresStats } {
  if (bays && bays.pagesDigest !== hiresPagesDigest(doc.pages)) {
    throw new Error(`${LANDSD_HIRES_BAYS_FILE} 与高清页不符（重新运行 fetch/landsd_3d_hires_bays.py）`);
  }
  const excluded = new Set<string>([...Object.keys(doc.excluded.buildings), ...doc.excluded.faces.map((f) => f.id)]);
  const stats: HiresStats = {
    listed: Object.keys(doc.buildings).length,
    r3Dropped: 0,
    noPhotoFaces: 0,
    bays: 0,
    attached: 0,
    stale: 0,
    sensitive: 0,
    missing: 0,
    faces: 0,
    canopies: 0,
    excluded: [...excluded].sort(),
    pages: doc.pages.length,
    bytes: doc.pages.reduce((s, f) => s + f.bytes, 0),
  };
  const seen = new Set<string>();
  // 整面排除：面串 `${id}_${part}_${ring}_${edge}` → [part, ring, edge]
  const faceX = new Map<string, number[][]>();
  for (const f of doc.excluded.faces) {
    const m = /^(.+)_(\d+)_(\d+)_(\d+)$/.exec(f.face);
    if (!m || m[1] !== f.id) continue;
    (faceX.get(f.id) ?? faceX.set(f.id, []).get(f.id)!).push([Number(m[2]), Number(m[3]), Number(m[4])]);
  }
  const dropBuilding = new Set(Object.keys(doc.excluded.buildings));
  const withRedlines = (b: Building): Building => {
    let o = b;
    if (dropBuilding.has(b.id) && o.facade) {
      const { facade: _drop, ...rest } = o;
      o = rest;
      stats.r3Dropped++;
    }
    const x = faceX.get(b.id);
    if (x?.length) {
      o = { ...o, hires: { ...(o.hires ?? { f: [] }), x: [...x].sort((p, q) => p[0]! - q[0]! || p[1]! - q[1]! || p[2]! - q[2]!) } };
      stats.noPhotoFaces += x.length;
    }
    return o;
  };
  const out = buildings.map((b0): Building => withRedlines(attachOne(b0)));
  function attachOne(b: Building): Building {
    const rec = doc.buildings[b.id];
    if (!rec) return b;
    seen.add(b.id);
    const [cx, cy] = ringCentroid(b.footprint.outer);
    if (sensitive.some((z) => pointInRing(cx, cy, z.area.outer))) {
      stats.sensitive++;
      return b;
    }
    if (rec.k !== geometryKey(b) || !validHiresRecord(rec.f, doc.pages.length, doc.params.page)) {
      stats.stale++;
      return b;
    }
    const c = (rec.c ?? []).filter((x) => validCanopy(x, sensitive));
    const bayRows = bays?.buildings[b.id];
    const hires: BuildingHires = { f: rec.f, ...(c.length ? { c } : {}), ...(bayRows?.length && validBays(bayRows) ? { b: bayRows } : {}) };
    if (hires.b) stats.bays += hires.b.length;
    stats.attached++;
    stats.faces += rec.f.length;
    stats.canopies += c.length;
    return { ...b, hires };
  }
  stats.missing = stats.listed - seen.size;
  if (stats.attached === 0) return { buildings: out, meta: null, stats };
  const meta: HiresMeta = {
    dir,
    page: doc.params.page,
    aux: doc.params.aux,
    tile: doc.params.tile,
    densityQ: doc.params.densityQ,
    pages: doc.pages.map((p) => p.file),
    streetPages: doc.streetPages,
    reliefMaxM: doc.params.reliefMaxM,
    bytes: stats.bytes,
  };
  return { buildings: out, meta, stats };
}

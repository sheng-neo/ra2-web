/**
 * 09b-landmark-meshes（R5 真实地标，负责人 D5，2026-11-27）：六座地标的真实外观 → LandmarkPlacement.mesh 与 meta.landmarkMeshes。
 *
 * 输入是 fetch/landsd_3d_landmark_bake.py 写的 landsd-3dvm-landmarks.json.gz（在 data-raw/landsd，sources.json 校验 sha256），
 * 它列出的网格与图集放在 client/public/city/landmarks/（文件名带内容哈希）。这一阶段不碰网格内容、不需要 Python：
 * 1. 逐个校验文件的 sha256 与字节数（缺文件或不符直接报错，提示重新烘焙）；
 * 2. 按地标 id 把引用接到摆放参数上（名字是覆盖表里的真名，D6；清单里只有 id 与地政总署模型号）；
 *    在敏感区里的地标不接（本轮没有）；
 * 3. 与有真实网格的地标轮廓重叠的城市楼宇（harbour-spire 的裙楼 3696c1687c 的底座整块盖住了塔楼大堂），在 0.2 m 网格上
 *    减去地标轮廓（切口吸附回地标与原楼的轮廓线）：与塔楼共边的那段外墙整段删掉，只留塔楼自己的墙；切口墙朝向塔楼里面，
 *    从外面看是背面（单面材质不画），不会两面墙共面闪烁。有照片贴面 / 高清街面层的楼切了就不再贴（本轮被切的楼两样都没有）。
 */
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Building, BuildingPart, FlatXY, LandmarkMesh, LandmarkMeshMeta, LandmarkPlacement, SensitiveZone } from '@central/data';
import { sha256Hex } from '../geo/hash';
import { components, countMask, gridFor, rasterRings, ringsBounds, traceMask, type Grid } from '../geo/mask';
import { dedupeRing, pointInRing, ringArea, ringSimple, signedArea2, simplifyRing } from '../geo/ring';
import { snapRing } from './building-parts';

export const LANDSD_LANDMARKS_FILE = 'landsd-3dvm-landmarks.json.gz';
/** 网格与图集目录（相对 city/）。 */
export const LANDMARKS_DIR = 'landmarks';
export const LANDMARKS_VERSION = 1;

interface FileEntry {
  file: string;
  sha256: string;
  bytes: number;
}

/** 烘焙清单（fetch/landsd_3d_landmark_bake.py 的 run）。 */
export interface LandmarksDoc {
  format: string;
  version: number;
  params: { atlas: number };
  files: {
    bc3: FileEntry;
    bc3Half: FileEntry;
    etc2Half: FileEntry;
    bc3Quarter: FileEntry;
    etc2Quarter: FileEntry;
    webpHalf: FileEntry;
    webpQuarter: FileEntry;
    low: FileEntry;
  };
  landmarks: Record<
    string,
    { high: FileEntry; tris: [number, number]; floors: [number, number]; bbox: number[]; aviation: number[]; models: string[] }
  >;
}

export interface LandmarkMeshStats {
  attached: string[];
  /** 清单里有、摆放里没有的 id。 */
  missing: string[];
  /** 切掉地标轮廓的城市楼宇。 */
  cut: string[];
  /** R4 + R5 整合：为让开地标网格而变浅 / 删掉的雨篷块数（clearCanopiesOfLandmarks）。 */
  canopiesTrimmed: number;
  canopiesDropped: number;
  /** R4 + R5 整合复审：行人高度实心范围的环数（landmarkStreetSections）。 */
  streetRings: number;
  bytes: number;
}

/** 从快照文件表读清单；文件不在快照里时返回 null（客户端照旧画轮廓白模）。 */
export function readLandmarkMeshes(files: ReadonlyMap<string, Uint8Array>): LandmarksDoc | null {
  const gz = files.get(LANDSD_LANDMARKS_FILE);
  if (!gz) return null;
  const doc = JSON.parse(gunzipSync(gz).toString('utf8')) as LandmarksDoc;
  if (doc.format !== 'central-3dvm-landmarks' || doc.version !== LANDMARKS_VERSION) throw new Error(`${LANDSD_LANDMARKS_FILE}: 格式不符`);
  return doc;
}

/** 清单里的全部文件（图集七份、远景网格、每座的近景网格；按 id 排序）。 */
export function landmarkFiles(doc: LandmarksDoc): FileEntry[] {
  const f = doc.files;
  const ids = Object.keys(doc.landmarks).sort();
  return [f.bc3, f.bc3Half, f.etc2Half, f.bc3Quarter, f.etc2Quarter, f.webpHalf, f.webpQuarter, f.low, ...ids.map((id) => doc.landmarks[id]!.high)];
}

/** 校验文件：read(name) 返回内容（读不到返回 null）。文件名不合规、缺文件、sha256 或字节数不符时抛错。 */
export function verifyLandmarkFiles(doc: LandmarksDoc, read: (name: string) => Uint8Array | null): void {
  for (const f of landmarkFiles(doc)) {
    if (!/^lm[a-z0-9-]+\.(bin|webp)$/.test(f.file)) throw new Error(`地标文件名不合规：${f.file}`);
    const bytes = read(f.file);
    if (!bytes) throw new Error(`缺少地标文件 ${LANDMARKS_DIR}/${f.file}（重新运行 fetch/landsd_3d_landmark_bake.py）`);
    if (bytes.byteLength !== f.bytes || sha256Hex(bytes) !== f.sha256) {
      throw new Error(`地标文件 ${LANDMARKS_DIR}/${f.file} 与清单不符（sha256 / 字节数）`);
    }
  }
}

/** 从目录读文件（verifyLandmarkFiles 的 read）。 */
export function readLandmarkDir(dir: string): (name: string) => Uint8Array | null {
  return (name) => {
    try {
      return readFileSync(path.join(dir, name));
    } catch {
      return null;
    }
  };
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** 一座的记录是否合规（全是整数、长度对）。 */
function validRecord(r: LandmarksDoc['landmarks'][string]): boolean {
  return (
    Array.isArray(r.tris) && r.tris.length === 2 && r.tris.every((t) => isInt(t) && t > 0) &&
    Array.isArray(r.floors) && r.floors.length === 2 && r.floors.every(isInt) && r.floors[0]! > 0 &&
    Array.isArray(r.bbox) && r.bbox.length === 6 && r.bbox.every(isInt) &&
    Array.isArray(r.aviation) && r.aviation.length % 3 === 0 && r.aviation.every(isInt)
  );
}

/** 地标与敏感区沾边：中心、轮廓任一顶点在区里，或区的任一顶点在轮廓里（网格不得伸进敏感区）。 */
function touchesZone(l: LandmarkPlacement, z: SensitiveZone): boolean {
  if (pointInRing(l.x, l.y, z.area.outer)) return true;
  const fp = l.footprint.outer;
  for (let i = 0; i + 1 < fp.length; i += 2) if (pointInRing(fp[i]!, fp[i + 1]!, z.area.outer)) return true;
  const zr = z.area.outer;
  for (let i = 0; i + 1 < zr.length; i += 2) if (pointInRing(zr[i]!, zr[i + 1]!, fp)) return true;
  return false;
}

/** 把清单接到地标上（不改输入）；返回新摆放、meta（一座也没接上时为 null）与统计。 */
export function attachLandmarkMeshes(
  landmarks: readonly LandmarkPlacement[],
  doc: LandmarksDoc,
  sensitive: readonly SensitiveZone[],
): { landmarks: LandmarkPlacement[]; meta: LandmarkMeshMeta | null; stats: LandmarkMeshStats } {
  const stats: LandmarkMeshStats = {
    attached: [],
    missing: [],
    cut: [],
    canopiesTrimmed: 0,
    canopiesDropped: 0,
    streetRings: 0,
    bytes: landmarkFiles(doc).reduce((s, f) => s + f.bytes, 0),
  };
  const ids = new Set(landmarks.map((l) => l.id));
  stats.missing = Object.keys(doc.landmarks).filter((id) => !ids.has(id)).sort();
  const out = landmarks.map((l): LandmarkPlacement => {
    const r = doc.landmarks[l.id];
    if (!r || !validRecord(r)) return l;
    if (sensitive.some((z) => touchesZone(l, z))) return l;
    const mesh: LandmarkMesh = {
      high: r.high.file,
      tris: [r.tris[0], r.tris[1]],
      floors: [r.floors[0], r.floors[1]],
      bbox: r.bbox.slice(0, 6) as LandmarkMesh['bbox'],
      ...(r.aviation.length ? { aviation: [...r.aviation] } : {}),
    };
    stats.attached.push(l.id);
    return { ...l, mesh };
  });
  if (stats.attached.length === 0) return { landmarks: [...landmarks], meta: null, stats };
  const f = doc.files;
  const meta: LandmarkMeshMeta = {
    dir: LANDMARKS_DIR,
    low: f.low.file,
    atlas: {
      size: doc.params.atlas,
      bc3: f.bc3.file,
      bc3Half: f.bc3Half.file,
      etc2Half: f.etc2Half.file,
      bc3Quarter: f.bc3Quarter.file,
      etc2Quarter: f.etc2Quarter.file,
      webpHalf: f.webpHalf.file,
      webpQuarter: f.webpQuarter.file,
    },
    bytes: stats.bytes,
  };
  return { landmarks: out, meta, stats };
}

/** 切口网格（dm）与内缩格数（0 = 按地标轮廓原样减）。 */
const CUT_CELL = 2;
const CUT_ERODE = 0;
/** 重叠小于此面积（dm²）的楼不切。 */
const CUT_MIN_OVERLAP = 10 * 100;

/** 4 邻域腐蚀 k 次。 */
function erode(m: Uint8Array, g: Grid, k: number): Uint8Array {
  let cur = m;
  for (let s = 0; s < k; s++) {
    const nx = new Uint8Array(cur.length);
    for (let j = 0; j < g.ny; j++) {
      for (let i = 0; i < g.nx; i++) {
        const q = j * g.nx + i;
        if (!cur[q]) continue;
        if (i > 0 && i + 1 < g.nx && j > 0 && j + 1 < g.ny && cur[q - 1] && cur[q + 1] && cur[q - g.nx] && cur[q + g.nx]) nx[q] = 1;
      }
    }
    cur = nx;
  }
  return cur;
}

/** 掩膜 → 最大连通块的外环与洞（dm，外环逆时针、洞顺时针），吸附回原轮廓顶点 / 边并化简；空或太小返回 null。 */
function maskToRing(m: Uint8Array, g: Grid, snapTo: readonly FlatXY[]): { outer: FlatXY; holes: FlatXY[] } | null {
  const { labels, sizes } = components(m, g.nx, g.ny);
  let best = 0;
  for (let k = 1; k < sizes.length; k++) if (sizes[k]! > (sizes[best] ?? 0)) best = k;
  if (best === 0 || sizes[best]! * g.cell * g.cell < 4 * 100) return null;
  const one = new Uint8Array(m.length);
  for (let q = 0; q < m.length; q++) one[q] = labels[q] === best ? 1 : 0;
  const loops = traceMask(one, g.nx, g.ny).map((loop) => {
    const r: FlatXY = [];
    for (let i = 0; i < loop.length; i += 2) r.push(g.x0 + loop[i]! * g.cell, g.y0 + loop[i + 1]! * g.cell);
    return r;
  });
  const fix = (raw: FlatXY): FlatXY => {
    const s = snapRing(dedupeRing(simplifyRing(raw, 3)), snapTo, 4);
    return s.length >= 6 && ringSimple(s) ? s : raw;
  };
  const outer = loops.filter((r) => signedArea2(r) > 0).sort((a, b) => ringArea(b) - ringArea(a))[0];
  if (!outer) return null;
  const holes = loops.filter((r) => signedArea2(r) < 0 && ringArea(r) >= 4 * 100).map(fix);
  return { outer: fix(outer), holes };
}

/**
 * 与有真实网格的地标重叠的楼：轮廓与各分层体块都减去地标轮廓。
 * 返回新楼列表（顺序不变）与被切的楼号。体块切完不到 4 m² 的整块删掉；底座（footprint）切完不到 4 m² 的楼不动（不该发生）。
 */
export function cutLandmarkFootprints(
  buildings: readonly Building[],
  landmarks: readonly LandmarkPlacement[],
): { buildings: Building[]; cut: string[] } {
  const cut: string[] = [];
  const meshed = landmarks.filter((l) => l.mesh);
  const out = buildings.map((b): Building => {
    let cur = b;
    for (const l of meshed) {
      const lr = [l.footprint.outer, ...(l.footprint.holes ?? [])];
      const bounds = ringsBounds([cur.footprint.outer, l.footprint.outer]);
      const lb = ringsBounds(lr);
      const bb = ringsBounds([cur.footprint.outer]);
      if (lb[2] < bb[0] || lb[0] > bb[2] || lb[3] < bb[1] || lb[1] > bb[3]) continue;
      const g = gridFor(bounds, CUT_CELL, 2);
      const hole = erode(rasterRings(g, lr), g, CUT_ERODE);
      const diff = (rings: readonly FlatXY[]): { m: Uint8Array; overlap: number } => {
        const m = rasterRings(g, rings);
        let overlap = 0;
        for (let q = 0; q < m.length; q++) {
          if (m[q] && hole[q]) {
            overlap++;
            m[q] = 0;
          }
        }
        return { m, overlap: overlap * CUT_CELL * CUT_CELL };
      };
      const fpRings = [cur.footprint.outer, ...(cur.footprint.holes ?? [])];
      const fp = diff(fpRings);
      const partOverlaps = (cur.parts ?? []).map((p, k) => (k === 0 || !p.ring ? 0 : diff([p.ring, ...(p.holes ?? [])]).overlap));
      if (fp.overlap < CUT_MIN_OVERLAP && partOverlaps.every((o) => o < CUT_MIN_OVERLAP)) continue;
      const snap = [...fpRings, ...lr];
      const footprint = fp.overlap >= CUT_MIN_OVERLAP ? maskToRing(fp.m, g, snap) : { outer: cur.footprint.outer, holes: cur.footprint.holes ?? [] };
      if (!footprint || countMask(fp.m) === 0) continue;
      let parts: BuildingPart[] | undefined;
      if (cur.parts) {
        parts = [];
        for (const [k, p] of cur.parts.entries()) {
          if (k === 0 || !p.ring) {
            parts.push(p);
            continue;
          }
          if (partOverlaps[k]! < CUT_MIN_OVERLAP) {
            parts.push(p);
            continue;
          }
          const d = diff([p.ring, ...(p.holes ?? [])]);
          const r = maskToRing(d.m, g, [p.ring, ...snap]);
          if (r) parts.push({ ring: r.outer, ...(r.holes.length ? { holes: r.holes } : {}), top: p.top });
        }
      }
      // 切过的楼不再带按原轮廓烘的照片贴面：R3 的 facade 与 R4 的高清街面层 hires（面段、雨篷、铺位都按切之前的墙算，
      // 留着会贴到切过的墙上、雨篷伸进地标；build.ts 在 attachHires 之后才切）
      const { facade: _drop, hires: _dropHires, ...rest } = cur;
      void _drop;
      void _dropHires;
      cur = {
        ...rest,
        footprint: footprint.holes.length ? { outer: footprint.outer, holes: footprint.holes } : { outer: footprint.outer },
        ...(parts ? { parts } : {}),
      };
      if (!cut.includes(b.id)) cut.push(b.id);
    }
    return cur;
  });
  return { buildings: out, cut: cut.sort() };
}

/**
 * CLMK v1 网格（格式见 client/src/render/landmarks/format.ts 与烘焙脚本文件头）里的三角形，换成管线坐标：
 * 每个三角形 9 个数（x 东 dm、y 北 dm、z mPD dm）× 3 个顶点。只读位置与索引；格式不对时抛错。
 */
export function meshTriangles(bytes: Uint8Array): Float64Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 48 || dv.getUint32(0, false) !== 0x434c4d4b || dv.getUint16(4, true) !== 1) throw new Error('CLMK：格式不对');
  const big = (dv.getUint16(6, true) & 1) !== 0;
  const nv = dv.getUint32(8, true);
  const ni = dv.getUint32(12, true);
  if (bytes.byteLength < 48 + nv * 36 + ni * (big ? 4 : 2) || ni % 3 !== 0) throw new Error('CLMK：长度不对');
  const off = [dv.getFloat32(16, true), dv.getFloat32(20, true), dv.getFloat32(24, true)] as const;
  const span = [dv.getFloat32(28, true), dv.getFloat32(32, true), dv.getFloat32(36, true)] as const;
  const at = (k: number, c: number): number => off[c]! + (dv.getUint16(48 + k * 8 + c * 2, true) / 65535) * span[c]!;
  const io = 48 + nv * 36;
  const out = new Float64Array((ni / 3) * 9);
  for (let i = 0; i < ni; i++) {
    const k = big ? dv.getUint32(io + i * 4, true) : dv.getUint16(io + i * 2, true);
    if (k >= nv) throw new Error('CLMK：索引越界');
    // three 坐标 (x, y 上, z = −北)，米 → 管线 dm
    out[i * 3] = at(k, 0) * 10;
    out[i * 3 + 1] = -at(k, 2) * 10;
    out[i * 3 + 2] = at(k, 1) * 10;
  }
  return out;
}

/** 雨篷离地标网格的净距（dm）与最浅的雨篷（dm，同客户端 facades/canopy-fit.ts 的 MIN_DEPTH_M）。 */
export const CANOPY_LANDMARK_CLEAR_DM = 3;
export const CANOPY_MIN_DEPTH_DM = 10;

/** 多边形（[a, b, z] 点列）按 v·k ≥ lo 裁剪（Sutherland–Hodgman，k = 0/1/2 选坐标、sign = ±1 选方向）。 */
function clip(poly: number[][], k: number, sign: number, lo: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const dp = sign * p[k]! - lo;
    const dq = sign * q[k]! - lo;
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) {
      const t = dp / (dp - dq);
      out.push([p[0]! + (q[0]! - p[0]!) * t, p[1]! + (q[1]! - p[1]!) * t, p[2]! + (q[2]! - p[2]!) * t]);
    }
  }
  return out;
}

/**
 * R4 + R5 整合：R4 的雨篷（Building.hires.c，照片模型里伸出外墙的近水平板）按地标的旧轮廓烘，地标换成真实网格后，网格可能伸出轮廓
 * （steel-frame 的西侧在街面高度伸出轮廓约 1.6–3 m），邻楼的雨篷就会伸进地标里。这里逐块雨篷求「最多能伸多深」：
 * 雨篷板（沿墙 [−净距, 长 + 净距]、高程 [底 − 净距, 顶 + 净距]）里只要有地标网格的三角形，就把伸出量减到那个三角形离墙最近处之前
 * CANOPY_LANDMARK_CLEAR_DM；剩下不到 CANOPY_MIN_DEPTH_DM 的整块删掉（客户端照样不画 1 m 以下的雨篷）。不碰没有雨篷的楼。
 * meshes：地标 id → meshTriangles 的结果（只给有真实网格的地标）。确定性：只看输入，按原顺序输出。
 */
export function clearCanopiesOfLandmarks(
  buildings: readonly Building[],
  landmarks: readonly LandmarkPlacement[],
  meshes: ReadonlyMap<string, Float64Array>,
): { buildings: Building[]; trimmed: number; dropped: number } {
  let trimmed = 0;
  let dropped = 0;
  const C = CANOPY_LANDMARK_CLEAR_DM;
  const lms = landmarks.filter((l) => l.mesh && meshes.has(l.id));
  const out = buildings.map((b): Building => {
    const cs = b.hires?.c;
    if (!cs?.length) return b;
    let changed = false;
    const next: number[][] = [];
    for (const rec of cs) {
      const [x0, y0, x1, y1, D, top, thCm] = rec as [number, number, number, number, number, number, number];
      const L = Math.hypot(x1 - x0, y1 - y0);
      if (L < 1e-6) {
        next.push(rec);
        continue;
      }
      const tx = (x1 - x0) / L;
      const ty = (y1 - y0) / L;
      // 外法线 = 沿墙方向的右手侧（与 schema 的 BuildingHires.c 一致）
      const nx = ty;
      const ny = -tx;
      const zLo = top - Math.max(2.5, Math.min(14, thCm / 10)) - C;
      const zHi = top + C;
      let lim = D;
      const reach = D + C;
      const bx0 = Math.min(x0, x1, x0 + nx * reach, x1 + nx * reach) - C;
      const bx1 = Math.max(x0, x1, x0 + nx * reach, x1 + nx * reach) + C;
      const by0 = Math.min(y0, y1, y0 + ny * reach, y1 + ny * reach) - C;
      const by1 = Math.max(y0, y1, y0 + ny * reach, y1 + ny * reach) + C;
      for (const l of lms) {
        const bb = l.mesh!.bbox;
        if (bb[3] < bx0 || bb[0] > bx1 || bb[4] < by0 || bb[1] > by1 || bb[5] < zLo || bb[2] > zHi) continue;
        const tri = meshes.get(l.id)!;
        for (let i = 0; i < tri.length; i += 9) {
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          let minZ = Infinity;
          let maxZ = -Infinity;
          for (let v = 0; v < 9; v += 3) {
            minX = Math.min(minX, tri[i + v]!);
            maxX = Math.max(maxX, tri[i + v]!);
            minY = Math.min(minY, tri[i + v + 1]!);
            maxY = Math.max(maxY, tri[i + v + 1]!);
            minZ = Math.min(minZ, tri[i + v + 2]!);
            maxZ = Math.max(maxZ, tri[i + v + 2]!);
          }
          if (maxX < bx0 || minX > bx1 || maxY < by0 || minY > by1 || maxZ < zLo || minZ > zHi) continue;
          let poly: number[][] = [0, 3, 6].map((v) => {
            const dx = tri[i + v]! - x0;
            const dy = tri[i + v + 1]! - y0;
            return [dx * tx + dy * ty, dx * nx + dy * ny, tri[i + v + 2]!];
          });
          poly = clip(poly, 0, 1, -C);
          if (poly.length) poly = clip(poly, 0, -1, -(L + C));
          if (poly.length) poly = clip(poly, 2, 1, zLo);
          if (poly.length) poly = clip(poly, 2, -1, -zHi);
          if (poly.length) poly = clip(poly, 1, 1, 0); // 墙后面（邻楼自己里面）的不算
          if (!poly.length) continue;
          const bMin = Math.min(...poly.map((p) => p[1]!));
          if (bMin > lim + C) continue;
          lim = Math.min(lim, bMin - C);
        }
      }
      if (lim >= D) {
        next.push(rec);
        continue;
      }
      changed = true;
      const d = Math.floor(lim);
      if (d < CANOPY_MIN_DEPTH_DM) {
        dropped++;
        continue;
      }
      trimmed++;
      next.push([x0, y0, x1, y1, d, ...rec.slice(5)]);
    }
    if (!changed) return b;
    const { c: _c, ...rest } = b.hires!;
    void _c;
    return { ...b, hires: next.length ? { ...rest, c: next } : rest };
  });
  return { buildings: out, trimmed, dropped };
}

/** 行人高度的地标实心范围（landmarkStreetSections）：网格边长、离地高度带（dm）与取截面的高程间隔。 */
export const STREET_CELL_DM = 2;
export const STREET_BAND_DM: readonly [number, number] = [3, 20];
const STREET_STEP_DM = 5;
/** 小于此面积（dm²）的实心块不要（零星的源网格碎片）。 */
const STREET_MIN_AREA_DM2 = 25;

/**
 * R4 + R5 整合复审修正：地标网格在行人高度（离地 STREET_BAND_DM，0.3–2.0 m）的实心范围 → LandmarkMesh.street（dm 外环，逆时针）。
 * 客户端的行人走线、街上设施（walkways.footOk）、路灯杆把它与楼宇轮廓一起当成「楼里」：真实网格在街面高度会伸出旧轮廓
 * （steel-frame 西侧约 1.6–3 m），原来走线与一支路灯落在网格的墙里。做法：从轮廓外接地面最低处 + 0.3 m 到最高处 + 2.0 m，
 * 每 0.5 m 取一个水平截面；截面线段在 0.2 m 网格上描成墙（外扩一格），从网格边沿四连通漫水，漫不到的是墙里面；某格的地面
 * （地形 ground，dm）+ 高度带里任何一个截面在那里是实心，这格就算实心。墙有缺口（源网格不封闭）时只把墙本身算实心，开敞的
 * 地方（steel-frame 的地面广场）漫水进得去，照旧能走。只留外环（洞当实心：围死的院子本来也走不进去），每环化简 2 dm。
 * 确定性：只看输入。meshes：同 clearCanopiesOfLandmarks。
 */
export function landmarkStreetSections(
  landmarks: readonly LandmarkPlacement[],
  meshes: ReadonlyMap<string, Float64Array>,
  ground: (x: number, y: number) => number,
): { landmarks: LandmarkPlacement[]; rings: number } {
  let total = 0;
  const C = STREET_CELL_DM;
  const out = landmarks.map((l): LandmarkPlacement => {
    const tri = l.mesh ? meshes.get(l.id) : undefined;
    if (!l.mesh || !tri) return l;
    const bb = l.mesh.bbox;
    const g = gridFor([bb[0], bb[1], bb[3], bb[4]], C, 3);
    const n = g.nx * g.ny;
    const gz = new Float64Array(n);
    let gMin = Infinity;
    let gMax = -Infinity;
    for (let j = 0; j < g.ny; j++)
      for (let i = 0; i < g.nx; i++) {
        const z = ground(g.x0 + (i + 0.5) * C, g.y0 + (j + 0.5) * C);
        gz[j * g.nx + i] = z;
        gMin = Math.min(gMin, z);
        gMax = Math.max(gMax, z);
      }
    const solid = new Uint8Array(n);
    const wall = new Uint8Array(n);
    const thick = new Uint8Array(n);
    const outside = new Uint8Array(n);
    const queue = new Int32Array(n);
    const z0 = Math.ceil((gMin + STREET_BAND_DM[0]) / STREET_STEP_DM) * STREET_STEP_DM;
    for (let z = z0; z <= gMax + STREET_BAND_DM[1]; z += STREET_STEP_DM) {
      wall.fill(0);
      let any = false;
      for (let t = 0; t < tri.length; t += 9) {
        // 截面线段：三条边里跨过 z 的两条的交点
        const pts: number[] = [];
        for (const [a, b] of [[0, 3], [3, 6], [6, 0]] as const) {
          const za = tri[t + a + 2]! - z;
          const zb = tri[t + b + 2]! - z;
          if ((za < 0 && zb > 0) || (za > 0 && zb < 0)) {
            const s = za / (za - zb);
            pts.push(tri[t + a]! + (tri[t + b]! - tri[t + a]!) * s, tri[t + a + 1]! + (tri[t + b + 1]! - tri[t + a + 1]!) * s);
          }
        }
        if (pts.length < 4) continue;
        const [ax, ay, bx, by] = pts as [number, number, number, number];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (C / 2)));
        for (let s = 0; s <= steps; s++) {
          const i = Math.floor((ax + ((bx - ax) * s) / steps - g.x0) / C);
          const j = Math.floor((ay + ((by - ay) * s) / steps - g.y0) / C);
          if (i >= 0 && j >= 0 && i < g.nx && j < g.ny) {
            wall[j * g.nx + i] = 1;
            any = true;
          }
        }
      }
      if (!any) continue;
      // 墙外扩一格（8 邻域），免得斜墙的格子对角相接、漫水从缝里漏进去
      thick.fill(0);
      for (let j = 0; j < g.ny; j++)
        for (let i = 0; i < g.nx; i++) {
          if (!wall[j * g.nx + i]) continue;
          for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++) {
              const ii = i + di;
              const jj = j + dj;
              if (ii >= 0 && jj >= 0 && ii < g.nx && jj < g.ny) thick[jj * g.nx + ii] = 1;
            }
        }
      // 从网格边沿四连通漫水
      outside.fill(0);
      let head = 0;
      let tail = 0;
      const seed = (k: number) => {
        if (!thick[k] && !outside[k]) {
          outside[k] = 1;
          queue[tail++] = k;
        }
      };
      for (let i = 0; i < g.nx; i++) {
        seed(i);
        seed((g.ny - 1) * g.nx + i);
      }
      for (let j = 0; j < g.ny; j++) {
        seed(j * g.nx);
        seed(j * g.nx + g.nx - 1);
      }
      while (head < tail) {
        const k = queue[head++]!;
        const i = k % g.nx;
        if (i > 0) seed(k - 1);
        if (i < g.nx - 1) seed(k + 1);
        if (k >= g.nx) seed(k - g.nx);
        if (k < n - g.nx) seed(k + g.nx);
      }
      for (let k = 0; k < n; k++) {
        if (outside[k] || solid[k]) continue;
        const h = z - gz[k]!;
        if (h >= STREET_BAND_DM[0] && h <= STREET_BAND_DM[1]) solid[k] = 1;
      }
    }
    const rings: FlatXY[] = [];
    for (const loop of traceMask(solid, g.nx, g.ny)) {
      const r: FlatXY = [];
      for (let i = 0; i < loop.length; i += 2) r.push(g.x0 + loop[i]! * C, g.y0 + loop[i + 1]! * C);
      if (signedArea2(r) <= 0 || ringArea(r) < STREET_MIN_AREA_DM2) continue;
      const s = dedupeRing(simplifyRing(r, 2));
      rings.push(s.length >= 6 && ringSimple(s) ? s : r);
    }
    if (!rings.length) return l;
    total += rings.length;
    return { ...l, mesh: { ...l.mesh, street: rings } };
  });
  return { landmarks: out, rings: total };
}

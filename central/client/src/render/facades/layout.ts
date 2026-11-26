/**
 * 真实贴面（R3）的纹理坐标：纯函数，不碰 three。数据约定见 @central/data schema 的 BuildingFacade / FacadeMeta，
 * 与离线烘焙 central/citymap/fetch/landsd_3d_tex_bake.py 逐条对应：
 * - 墙：每块棱柱的每个环展开成一条墙带。列 c = P × d（P 为沿环从第 0 个顶点起累计的米数，与 extrude 的边长累计相同），
 *   行 r = (棱柱顶 − z) × d；墙带按 tile 宽切片，第 k 片的片内列 cl = c − k·tile。每片只存有照片的外包框：
 *   片内列 [c0, c0 + w)、行 [r0, r0 + h) 放在页里 (x, y) 起：纹素 = (x + cl − c0, y + r − r0)；框外没有照片。
 *   墙面要在切片边界与外包框边上切开（extrude 按 wallSegments 切），每块小墙面只取一片、要么全在框内要么全在框外。
 * - 屋顶：外环外包框上的俯视图，纹素 = (x + (X − minX) × dr, y + (maxY − Y) × dr)（X、Y 为米）。
 * - aPhoto = (纹素 / 页边长, 页号, 楼层线相位)；页号 −1 = 没有照片。
 */
import type { Building, FacadeMeta } from '@central/data';
import { NO_PHOTO, type PhotoAttr } from '../facade';

/** 一片（或屋顶）在页里的位置；page = −1 表示没有照片。墙片另有外包框（片内列 c0..c0+w、行 r0..r0+h；屋顶不裁，w = h = 0）。 */
export interface PhotoPiece {
  page: number;
  x: number;
  y: number;
  c0: number;
  r0: number;
  w: number;
  h: number;
}

/** 墙片在记录里的长度（page, x, y, c0, r0, w, h）。 */
export const WALL_PIECE_LEN = 7;

/** 一块棱柱的贴面记录（BuildingFacade.p 的一项解析后）。 */
export interface PrismRecord {
  /** 墙 / 屋顶密度（px/m）。 */
  d: number;
  dr: number;
  roof: PhotoPiece;
  /** 每个环的切片（环序同 extrude：外环、洞……）。 */
  rings: PhotoPiece[][];
}

/** 解析一项记录；空数组或格式不对返回 null。 */
export function parseRecord(rec: readonly number[], densityQ: number): PrismRecord | null {
  if (rec.length < 6) return null;
  const L = WALL_PIECE_LEN;
  const piece = (i: number): PhotoPiece => ({ page: rec[i]!, x: rec[i + 1]!, y: rec[i + 2]!, c0: rec[i + 3]!, r0: rec[i + 4]!, w: rec[i + 5]!, h: rec[i + 6]! });
  const rings: PhotoPiece[][] = [];
  let i = 5;
  while (i < rec.length) {
    const n = rec[i]!;
    if (n < 1 || i + 1 + L * n > rec.length) return null;
    const ring: PhotoPiece[] = [];
    for (let k = 0; k < n; k++) {
      const pc = piece(i + 1 + L * k);
      ring.push(pc.page >= 0 && pc.w > 0 && pc.h > 0 ? pc : { ...pc, page: -1 });
    }
    rings.push(ring);
    i += 1 + L * n;
  }
  return { d: rec[0]! / densityQ, dr: rec[1]! / densityQ, roof: { page: rec[2]!, x: rec[3]!, y: rec[4]!, c0: 0, r0: 0, w: 0, h: 0 }, rings };
}

/** 一块棱柱墙面的贴图参数。 */
export interface WallPhoto {
  rec: PrismRecord;
  /** 墙带第 0 行的高程（dm，记录所属棱柱的顶）。 */
  top: number;
  /** 高于此高程（dm）的墙没有照片（LOW 档把分层楼画成整栋平顶、只有底座的记录时）。 */
  zMax: number;
  /** 页边长、切片宽（px）。 */
  page: number;
  tile: number;
  /** 楼层线相位（米）。 */
  phase: number;
}

/** 一块棱柱屋顶的贴图参数（minX、maxY：外环外包框，dm）。 */
export interface RoofPhoto {
  rec: PrismRecord;
  minX: number;
  maxY: number;
  page: number;
  phase: number;
}

/** 墙带上 [p0, p1]（米）按切片边界（P = k · tile / d）切开；返回各段与所在切片号。 */
export function splitByTiles(d: number, tile: number, p0: number, p1: number): { p0: number; p1: number; k: number }[] {
  const step = tile / d;
  const out: { p0: number; p1: number; k: number }[] = [];
  let a = p0;
  while (a < p1 - 1e-9) {
    const k = Math.max(0, Math.floor((a + 1e-9) / step));
    const b = Math.min(p1, (k + 1) * step);
    out.push({ p0: a, p1: b, k });
    a = b;
  }
  return out;
}

/** 一段墙（沿环米数 p0..p1、切片 k），照片只在 zLo..zHi（dm）之间；piece = null 表示整段没有照片。 */
export interface WallSegment {
  p0: number;
  p1: number;
  k: number;
  piece: PhotoPiece | null;
  zLo: number;
  zHi: number;
}

/**
 * 墙带上 [p0, p1]（米）切成段：先按切片边界，再按该片外包框的左右边（框外的段 piece = null）；
 * 框内的段给出照片的高程范围 [zLo, zHi]（dm，外包框上下边与 zMax 取交）。
 */
export function wallSegments(w: WallPhoto, ring: number, p0: number, p1: number): WallSegment[] {
  const out: WallSegment[] = [];
  const pieces = w.rec.rings[ring];
  const d = w.rec.d;
  for (const t of splitByTiles(d, w.tile, p0, p1)) {
    const pc = pieces?.[Math.min(t.k, (pieces?.length ?? 1) - 1)];
    if (!pc || pc.page < 0) {
      out.push({ ...t, piece: null, zLo: 0, zHi: 0 });
      continue;
    }
    // 外包框左右边（米）
    const a = (t.k * w.tile + pc.c0) / d;
    const b = (t.k * w.tile + pc.c0 + pc.w) / d;
    const zHi = Math.min(w.top - (pc.r0 / d) * 10, w.zMax);
    const zLo = w.top - ((pc.r0 + pc.h) / d) * 10;
    const cuts = [t.p0, Math.min(Math.max(a, t.p0), t.p1), Math.min(Math.max(b, t.p0), t.p1), t.p1];
    for (let i = 0; i < 3; i++) {
      const s0 = cuts[i]!;
      const s1 = cuts[i + 1]!;
      if (s1 - s0 < 1e-6) continue;
      const inside = i === 1 && zHi > zLo;
      out.push({ p0: s0, p1: s1, k: t.k, piece: inside ? pc : null, zLo: inside ? zLo : 0, zHi: inside ? zHi : 0 });
    }
  }
  return out;
}

/** 墙上一点的 aPhoto：所在段的片 pc（外包框内）、切片 k、沿环米数 P、高程 zDm。 */
export function wallPhotoAttr(w: WallPhoto, pc: PhotoPiece | null, k: number, P: number, zDm: number): PhotoAttr {
  if (!pc || pc.page < 0) return [0, 0, -1, w.phase];
  const col = P * w.rec.d - k * w.tile - pc.c0;
  const row = ((w.top - zDm) / 10) * w.rec.d - pc.r0;
  return [(pc.x + col) / w.page, (pc.y + row) / w.page, pc.page, w.phase];
}

/** 屋顶上一点（dm）的 aPhoto。 */
export function roofPhotoAttr(r: RoofPhoto, xDm: number, yDm: number): PhotoAttr {
  const pc = r.rec.roof;
  if (pc.page < 0) return [0, 0, -1, r.phase];
  return [(pc.x + ((xDm - r.minX) / 10) * r.rec.dr) / r.page, (pc.y + ((r.maxY - yDm) / 10) * r.rec.dr) / r.page, pc.page, r.phase];
}

/** 只有相位、没有照片的 aPhoto。 */
export function phaseOnly(phase: number): PhotoAttr {
  return phase === 0 ? NO_PHOTO : [0, 0, -1, phase];
}

/** 一栋楼的贴面：层高与相位、按棱柱取记录。 */
export interface BuildingPhoto {
  /** 照片检测到的层高（米）；没有时为 null。 */
  f2f: number | null;
  /** 楼层线相位（米，楼底起算）。 */
  phase: number;
  /** 记录是否按 parts 分块（否则只有整栋一项）。 */
  parted: boolean;
  records: (PrismRecord | null)[];
}

/** Building.facade → BuildingPhoto；没有贴面或没有贴图集时返回 null。 */
export function buildingPhoto(b: Pick<Building, 'facade' | 'parts'>, meta: FacadeMeta | undefined): BuildingPhoto | null {
  if (!b.facade || !meta) return null;
  const recs = b.facade.p;
  const parted = !!b.parts && b.parts.length >= 2 && recs.length === b.parts.length;
  const f = b.facade.f;
  return {
    f2f: f && f[0] > 0 ? f[0] / 100 : null,
    phase: f && f[0] > 0 ? f[1] / 100 : 0,
    parted,
    records: recs.map((r) => parseRecord(r, meta.densityQ)),
  };
}

/**
 * 客户端的一块棱柱用哪项记录：
 * - 客户端按 parts 分块且记录也按 parts：同序号；
 * - 客户端整栋平顶（没有 parts、或 LOW 档不分层）：记录整栋 → 第 0 项；记录按 parts → 第 0 项（底座）只管到底座顶（zMax），屋顶不用。
 * partIndex：客户端棱柱的 parts 序号（整栋平顶时为 null）；top：客户端棱柱顶（dm）；baseTop：记录按 parts 时底座块的顶（dm）。
 */
export function prismPhoto(
  bp: BuildingPhoto,
  meta: Pick<FacadeMeta, 'page' | 'tile'>,
  partIndex: number | null,
  top: number,
  ring: { minX: number; maxY: number },
  baseTop: number | null,
): { wall: WallPhoto | null; roof: RoofPhoto | null } {
  let rec: PrismRecord | null = null;
  let recTop = top;
  let zMax = Infinity;
  let roofOk = true;
  if (partIndex !== null) {
    if (bp.parted) rec = bp.records[partIndex] ?? null;
    else if (partIndex === 0) rec = null; // 不会出现：烘焙与客户端用同一套 prepareParts
  } else if (!bp.parted) {
    rec = bp.records[0] ?? null;
  } else if (baseTop !== null) {
    rec = bp.records[0] ?? null;
    recTop = baseTop;
    zMax = baseTop;
    roofOk = false;
  }
  if (!rec) return { wall: null, roof: null };
  return {
    wall: { rec, top: recTop, zMax, page: meta.page, tile: meta.tile, phase: bp.phase },
    roof: roofOk && rec.roof.page >= 0 ? { rec, minX: ring.minX, maxY: ring.maxY, page: meta.page, phase: bp.phase } : null,
  };
}

/** 环的外包框（dm）。 */
export function ringBounds(r: readonly number[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    minX = Math.min(minX, r[i]!);
    maxX = Math.max(maxX, r[i]!);
    minY = Math.min(minY, r[i + 1]!);
    maxY = Math.max(maxY, r[i + 1]!);
  }
  return { minX, minY, maxX, maxY };
}

/** 一条记录用到的页号（去重）。 */
export function recordPages(rec: PrismRecord, withRoof = true): number[] {
  const s = new Set<number>();
  if (withRoof && rec.roof.page >= 0) s.add(rec.roof.page);
  for (const r of rec.rings) for (const p of r) if (p.page >= 0) s.add(p.page);
  return [...s];
}

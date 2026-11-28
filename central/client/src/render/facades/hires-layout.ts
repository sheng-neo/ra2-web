/**
 * 电车走廊高清街面层（R4 HIRES）的纹理坐标：纯函数，不碰 three。数据约定见 @central/data schema 的 BuildingHires / HiresMeta，
 * 与离线烘焙 central/citymap/fetch/landsd_3d_hires_bake.py 逐条对应：
 * - 「面」= 某块棱柱（parts 序号）某个环的第 edge 条边；s = 从这条边起点沿边的米数，z = 高程（dm）。
 * - 段（街面段 kind 0 / 上段 kind 1）：段内列 c = s × d、行 r = (zTop − z) / 10 × d；每片 (页, x, y, c0, r0, w, h)，
 *   片内纹素 = (x + c − c0, y + r − r0)，片外没有高清照片。
 * - 墙面在片的左右边、上下边与段的上下沿切开（extrude 按 hiresCutsS / hiresCutsZ 切），每块小墙面只取一片、要么全在片内要么全在片外；
 *   aHires = (纹素 / 页边长, 页号, 密度 d)；页号 −1 = 没有高清照片。
 */
import type { BuildingHires, HiresMeta } from '@central/data';

/** 一片在页里的位置（段内列 c0..c0+w、行 r0..r0+h）。 */
export interface HiresPiece {
  page: number;
  x: number;
  y: number;
  c0: number;
  r0: number;
  w: number;
  h: number;
}

/** 一个面的一段。zTop、zBot 为 dm。 */
export interface HiresSection {
  kind: 0 | 1;
  /** 密度（px/m）。 */
  d: number;
  zTop: number;
  zBot: number;
  pieces: HiresPiece[];
}

/** 逐顶点 aHires 值：(s, t, 页号, 密度)。 */
export type HiresAttr = readonly [s: number, t: number, page: number, d: number];

export const NO_HIRES: HiresAttr = [0, 0, -1, 0];

const HEAD = 8;
const PIECE = 7;

/** 面的键（parts 序号、环、边）。 */
export function hiresFaceKey(part: number, ring: number, edge: number): number {
  return (part * 64 + ring) * 65536 + edge;
}

/** Building.hires → {面键: 段[]}（段按 zTop 降序）；记录格式不对的项跳过。 */
export function parseHires(h: BuildingHires | undefined, densityQ: number): Map<number, HiresSection[]> {
  const out = new Map<number, HiresSection[]>();
  if (!h) return out;
  for (const rec of h.f) {
    if (rec.length < HEAD) continue;
    const [part, ring, edge, kind, dq, zTop, zBot, n] = rec as [number, number, number, number, number, number, number, number];
    if (rec.length !== HEAD + PIECE * n || dq <= 0 || zTop <= zBot) continue;
    const pieces: HiresPiece[] = [];
    for (let k = 0; k < n; k++) {
      const o = HEAD + PIECE * k;
      pieces.push({ page: rec[o]!, x: rec[o + 1]!, y: rec[o + 2]!, c0: rec[o + 3]!, r0: rec[o + 4]!, w: rec[o + 5]!, h: rec[o + 6]! });
    }
    const key = hiresFaceKey(part, ring, edge);
    const list = out.get(key) ?? [];
    list.push({ kind: kind === 1 ? 1 : 0, d: dq / densityQ, zTop, zBot, pieces });
    list.sort((a, b) => b.zTop - a.zTop);
    out.set(key, list);
  }
  return out;
}

/** 面上 (s 米, z dm) 所在的段与片；不在任何片里返回 null。 */
export function hiresPieceAt(secs: readonly HiresSection[], s: number, z: number): { sec: HiresSection; pc: HiresPiece } | null {
  for (const sec of secs) {
    if (z > sec.zTop || z < sec.zBot) continue;
    const c = s * sec.d;
    const r = ((sec.zTop - z) / 10) * sec.d;
    for (const pc of sec.pieces) {
      if (c >= pc.c0 && c <= pc.c0 + pc.w && r >= pc.r0 && r <= pc.r0 + pc.h) return { sec, pc };
    }
  }
  return null;
}

/** 片 pc 上一点 (s 米, z dm) 的 aHires（片外的点按同一仿射关系外推：调用方保证整块墙面在片内）。 */
export function hiresAttr(hit: { sec: HiresSection; pc: HiresPiece } | null, s: number, z: number, page: number): HiresAttr {
  if (!hit) return NO_HIRES;
  const { sec, pc } = hit;
  const c = s * sec.d - pc.c0;
  const r = ((sec.zTop - z) / 10) * sec.d - pc.r0;
  return [(pc.x + c) / page, (pc.y + r) / page, pc.page, sec.d];
}

/** 面上 [s0, s1]（米）里的切点（片的左右边），升序、去重、不含端点。 */
export function hiresCutsS(secs: readonly HiresSection[], s0: number, s1: number): number[] {
  const set = new Set<number>();
  for (const sec of secs) {
    for (const pc of sec.pieces) {
      for (const c of [pc.c0 / sec.d, (pc.c0 + pc.w) / sec.d]) if (c > s0 + 1e-4 && c < s1 - 1e-4) set.add(Math.round(c * 1e4) / 1e4);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** 高程区间 (z0, z1)（dm）里的切点（段的上下沿、片的上下边），升序、去重、不含端点。 */
export function hiresCutsZ(secs: readonly HiresSection[], z0: number, z1: number): number[] {
  const set = new Set<number>();
  const add = (z: number) => {
    if (z > z0 + 1e-3 && z < z1 - 1e-3) set.add(Math.round(z * 1000) / 1000);
  };
  for (const sec of secs) {
    add(sec.zTop);
    add(sec.zBot);
    for (const pc of sec.pieces) {
      add(sec.zTop - (pc.r0 / sec.d) * 10);
      add(sec.zTop - ((pc.r0 + pc.h) / sec.d) * 10);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** 一栋楼的高清层：面键 → 段（没有时为空表）。 */
export interface BuildingHiresPlan {
  faces: Map<number, HiresSection[]>;
  /** 雨篷记录（见 BuildingHires.c）。 */
  canopies: number[][];
  /** 铺位记录（见 BuildingHires.b；R4 整合，路面铺面溢光 I-1 用）。 */
  bays: number[][];
}

export function buildingHires(h: BuildingHires | undefined, meta: HiresMeta | undefined): BuildingHiresPlan | null {
  if (!h || !meta) return null;
  const faces = parseHires(h, meta.densityQ);
  if (faces.size === 0 && !h.c?.length) return null;
  return { faces, canopies: h.c ?? [], bays: h.b ?? [] };
}

/** 一个面用到的页号。 */
export function sectionPages(secs: readonly HiresSection[]): number[] {
  const s = new Set<number>();
  for (const sec of secs) for (const pc of sec.pieces) s.add(pc.page);
  return [...s];
}

/** R4 整合（红线）：不贴照片的面（BuildingHires.x）→ 面键集合；没有时 null。与档位无关（LOW 也不贴 R3 照片）。 */
export function noPhotoFaces(h: BuildingHires | undefined): Set<number> | null {
  if (!h?.x?.length) return null;
  const out = new Set<number>();
  for (const r of h.x) if (r.length === 3 && r.every((v) => Number.isInteger(v) && v >= 0)) out.add(hiresFaceKey(r[0]!, r[1]!, r[2]!));
  return out.size ? out : null;
}

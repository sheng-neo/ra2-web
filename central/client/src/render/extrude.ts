/**
 * 建筑挤出：外环逆时针、洞顺时针（见 geom/ring.normalizeRing），
 * 墙按边生成四边形（每边 4 个顶点，法线朝外），屋顶用 three 的 earcut 三角化。
 *
 * 朝外的判定：沿环前进方向的右手侧 (dy, −dx)。外环 CCW 时右侧在环外；
 * 洞 CW 时右侧指向洞内（即院子一侧），两种情况都是「离开实体」的方向。
 */
import { ShapeUtils, Vector2 } from 'three';
import type { FlatXY } from '@central/data';
import { DM_TO_M } from '../coords';
import { facadeVertex, NO_HIRES_ATTR, type BldgAttr, type HiresVertexAttr, type PhotoAttr } from './facade';
import { hiresAttr, hiresCutsS, hiresCutsZ, hiresPieceAt, type HiresSection } from './facades/hires-layout';
import { phaseOnly, roofPhotoAttr, wallPhotoAttr, wallSegments, type RoofPhoto, type WallPhoto, type WallSegment } from './facades/layout';
import type { MeshArrays } from './mesh-arrays';
import { visibleSpans, type WallCut } from './walls';

export interface ExtrudeSpec {
  /** 外环（CCW）与洞（CW），模拟坐标 dm。 */
  outer: FlatXY;
  holes: FlatXY[];
  /** 墙底（dm）：可低于 base，把楼脚埋进斜坡。 */
  bottom: number;
  /** 立面 v = 0 的基准高程（dm）。 */
  base: number;
  /** 楼顶高程（dm）。 */
  top: number;
  /** 风格码（facade.styleCode）。 */
  style: number;
  /** 立面 u 的起点（米）。 */
  uOffset: number;
  /**
   * u 按世界坐标投影到边的方向（米，再加 uOffset），而不是沿环累计（默认 false）。
   * 分层体块用：上下两块共面的墙在同一点 u 相同，窗格竖线与租户段跨块对齐。
   */
  uProject?: boolean;
  /** 是否封顶（默认 true）。 */
  roof?: boolean;
  /** 各边不画的部分（共面墙去重，见 walls.ts）；ring 0 为外环，1.. 为洞。 */
  cuts?: (ring: number, edge: number) => readonly WallCut[] | undefined;
  /** 逐栋 aBldg（层高、街面冷暖、墙脚地面、特征位，见 facade.ts）；省略为全 0。 */
  bldg?: BldgAttr;
  /** 每画一块墙面回调一次（铺面招牌摆放用）：模拟坐标 dm 的起止点、高程区间与立面 u 起点（米）。 */
  onSpan?: (span: WallSpanInfo) => void;
  /**
   * R3 真实贴面：墙 / 屋顶的照片（facades/layout.ts）；省略或 null 时没有照片。
   * 有墙面照片时，跨切片边界的墙面在边界处切开（每块只取一片），高于 zMax 的部分不用照片。
   */
  wallPhoto?: WallPhoto | null;
  roofPhoto?: RoofPhoto | null;
  /** 楼层线相位（米，写进 aPhoto.w；没有照片的面也带上，窗灯按真楼层排）。 */
  phase?: number;
  /**
   * R4 电车走廊高清街面层：第 ring 个环第 edge 条边的高清段（facades/hires-layout.ts）；没有时 undefined。
   * 有段的墙面在片的边、段的上下沿处切开，每块小墙面写自己的 aHires。
   */
  hires?: (ring: number, edge: number) => readonly HiresSection[] | undefined;
  /** R4 整合（红线）：这面墙不贴照片（R3 贴面也不贴，画程序立面），见 BuildingHires.x。 */
  noPhoto?: (ring: number, edge: number) => boolean;
  /** 高清页边长（px，aHires 的纹理坐标按它归一）。 */
  hiresPage?: number;
}

/** 实际画出的一块墙面（onSpan 回调参数）。 */
export interface WallSpanInfo {
  ring: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 墙面底 / 顶高程（dm）。 */
  z0: number;
  z1: number;
  /** 起点的立面 u（米）。 */
  u0: number;
  /** 外法线（模拟坐标，单位向量）。 */
  nx: number;
  ny: number;
  /** 边序号（环里的第几条边；R4：查这面墙有没有高清照片）。 */
  edge: number;
}

function addWalls(m: MeshArrays, ring: FlatXY, ringIndex: number, s: ExtrudeSpec, u0: number): number {
  const n = ring.length >> 1;
  const h = (s.top - s.base) * DM_TO_M;
  const none = phaseOnly(s.phase ?? 0);
  const ph0 = s.wallPhoto ?? null;
  let u = u0;
  // 沿环累计米数（墙带的列坐标，与烘焙一致：按 dm 的边长累计再 × 0.1）
  let perim = 0;
  const noHi: HiresVertexAttr[] = [NO_HIRES_ATTR, NO_HIRES_ATTR, NO_HIRES_ATTR, NO_HIRES_ATTR];
  const quad = (xa: number, ya: number, xb: number, yb: number, z0: number, z1: number, ua: number, ub: number, nx: number, ny: number, pa: PhotoAttr[], ha: HiresVertexAttr[] = noHi) => {
    const va = (z0 - s.base) * DM_TO_M;
    const vb = (z1 - s.base) * DM_TO_M;
    const a = facadeVertex(m, xa, ya, z0, nx, ny, 0, ua, va, h, s.style, s.bldg, pa[0], ha[0]);
    const b = facadeVertex(m, xb, yb, z0, nx, ny, 0, ub, va, h, s.style, s.bldg, pa[1], ha[1]);
    const c = facadeVertex(m, xb, yb, z1, nx, ny, 0, ub, vb, h, s.style, s.bldg, pa[2], ha[2]);
    const d = facadeVertex(m, xa, ya, z1, nx, ny, 0, ua, vb, h, s.style, s.bldg, pa[3], ha[3]);
    m.tri(a, b, c);
    m.tri(a, c, d);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = ring[i * 2]!;
    const y0 = ring[i * 2 + 1]!;
    const x1 = ring[j * 2]!;
    const y1 = ring[j * 2 + 1]!;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = dy / len;
    const ny = -dx / len;
    const ph = s.noPhoto?.(ringIndex, i) ? null : ph0;
    const cuts = s.cuts?.(ringIndex, i);
    const spans = cuts ? visibleSpans(len, s.bottom, s.top, cuts) : [{ s0: 0, s1: len, z0: s.bottom, z1: s.top }];
    for (const w of spans) {
      const at = (sd: number): [number, number] => [x0 + (dx * sd) / len, y0 + (dy * sd) / len];
      const uAt = (sd: number): number => (s.uProject ? ((x0 + (dx * sd) / len) * dx + (y0 + (dy * sd) / len) * dy) / len * DM_TO_M + s.uOffset : u + sd * DM_TO_M);
      const [xa, ya] = at(w.s0);
      const [xb, yb] = at(w.s1);
      const ua = uAt(w.s0);
      const hs = s.hires?.(ringIndex, i);
      if (!ph && !hs) {
        quad(xa, ya, xb, yb, w.z0, w.z1, ua, s.uProject ? ua + (w.s1 - w.s0) * DM_TO_M : u + w.s1 * DM_TO_M, nx, ny, [none, none, none, none]);
      } else if (hs) {
        // R4：有高清段的墙面——R3 片的切点 × 高清片的切点，逐块写 aPhoto 与 aHires（相同状态的相邻块合并）
        const pStart = perim * DM_TO_M;
        const segs: WallSegment[] = ph
          ? wallSegments(ph, ringIndex, pStart + w.s0 * DM_TO_M, pStart + w.s1 * DM_TO_M)
          : [{ p0: pStart + w.s0 * DM_TO_M, p1: pStart + w.s1 * DM_TO_M, k: 0, piece: null, zLo: 0, zHi: 0 }];
        const page = s.hiresPage ?? 1024;
        for (const seg of segs) {
          const ps = [seg.p0, ...hiresCutsS(hs, seg.p0 - pStart, seg.p1 - pStart).map((c) => pStart + c), seg.p1];
          const lo = seg.piece ? Math.min(Math.max(seg.zLo, w.z0), w.z1) : w.z1;
          const hi = seg.piece ? Math.min(Math.max(seg.zHi, lo), w.z1) : w.z1;
          const zs = [...new Set([w.z0, ...(seg.piece ? [lo, hi] : []), ...hiresCutsZ(hs, w.z0, w.z1), w.z1])]
            .filter((z) => z >= w.z0 && z <= w.z1)
            .sort((a, b) => a - b);
          for (let q = 0; q + 1 < ps.length; q++) {
            const P0 = ps[q]!;
            const P1 = ps[q + 1]!;
            if (P1 - P0 < 1e-6) continue;
            const sa = (P0 - pStart) / DM_TO_M;
            const sb = (P1 - pStart) / DM_TO_M;
            const [qa, ra] = at(sa);
            const [qb, rb] = at(sb);
            const u1 = ua + (sa - w.s0) * DM_TO_M;
            const u2 = ua + (sb - w.s0) * DM_TO_M;
            const sMid = (P0 + P1) / 2 - pStart;
            // 逐段的状态：R3 片在不在、高清片是哪片；状态相同的相邻段合并成一块
            let runZ0 = zs[0]!;
            let runKey = '';
            let runHit: ReturnType<typeof hiresPieceAt> = null;
            let runR3 = false;
            const flush = (z1: number) => {
              if (z1 - runZ0 < 1e-6) return;
              const pa = runR3
                ? [wallPhotoAttr(ph!, seg.piece, seg.k, P0, runZ0), wallPhotoAttr(ph!, seg.piece, seg.k, P1, runZ0), wallPhotoAttr(ph!, seg.piece, seg.k, P1, z1), wallPhotoAttr(ph!, seg.piece, seg.k, P0, z1)]
                : [none, none, none, none];
              const ha = runHit
                ? [hiresAttr(runHit, P0 - pStart, runZ0, page), hiresAttr(runHit, P1 - pStart, runZ0, page), hiresAttr(runHit, P1 - pStart, z1, page), hiresAttr(runHit, P0 - pStart, z1, page)]
                : noHi;
              quad(qa, ra, qb, rb, runZ0, z1, u1, u2, nx, ny, pa, ha);
            };
            for (let k = 0; k + 1 < zs.length; k++) {
              const za = zs[k]!;
              const zb = zs[k + 1]!;
              if (zb - za < 1e-6) continue;
              const zm = (za + zb) / 2;
              const r3 = !!seg.piece && zm >= lo && zm <= hi;
              const hit = hiresPieceAt(hs, sMid, zm);
              const key = `${r3 ? 1 : 0}:${hit ? `${hit.sec.zTop}:${hit.pc.page}:${hit.pc.x}:${hit.pc.y}` : '-'}`;
              if (k === 0) {
                runKey = key;
                runHit = hit;
                runR3 = r3;
                runZ0 = za;
              } else if (key !== runKey) {
                flush(za);
                runKey = key;
                runHit = hit;
                runR3 = r3;
                runZ0 = za;
              }
            }
            flush(zs[zs.length - 1]!);
          }
        }
      } else if (ph) {
        // 按切片边界与外包框切开；框外、照片高程范围以外的部分另画没有照片的块
        const pStart = perim * DM_TO_M;
        for (const seg of wallSegments(ph, ringIndex, pStart + w.s0 * DM_TO_M, pStart + w.s1 * DM_TO_M)) {
          const sa = (seg.p0 - pStart) / DM_TO_M;
          const sb = (seg.p1 - pStart) / DM_TO_M;
          const [qa, ra] = at(sa);
          const [qb, rb] = at(sb);
          const u1 = ua + (sa - w.s0) * DM_TO_M;
          const u2 = ua + (sb - w.s0) * DM_TO_M;
          const lo = seg.piece ? Math.min(Math.max(seg.zLo, w.z0), w.z1) : w.z1;
          const hi = seg.piece ? Math.min(Math.max(seg.zHi, lo), w.z1) : w.z1;
          if (lo > w.z0) quad(qa, ra, qb, rb, w.z0, lo, u1, u2, nx, ny, [none, none, none, none]);
          if (hi > lo) {
            const pa = [
              wallPhotoAttr(ph, seg.piece, seg.k, seg.p0, lo),
              wallPhotoAttr(ph, seg.piece, seg.k, seg.p1, lo),
              wallPhotoAttr(ph, seg.piece, seg.k, seg.p1, hi),
              wallPhotoAttr(ph, seg.piece, seg.k, seg.p0, hi),
            ];
            quad(qa, ra, qb, rb, lo, hi, u1, u2, nx, ny, pa);
          }
          if (seg.piece && hi < w.z1) quad(qa, ra, qb, rb, Math.max(hi, w.z0), w.z1, u1, u2, nx, ny, [none, none, none, none]);
        }
      }
      s.onSpan?.({ ring: ringIndex, x0: xa, y0: ya, x1: xb, y1: yb, z0: w.z0, z1: w.z1, u0: ua, nx, ny, edge: i });
    }
    u += len * DM_TO_M;
    perim += len;
  }
  return u;
}

function addRoof(m: MeshArrays, s: ExtrudeSpec): void {
  const toV2 = (r: FlatXY): Vector2[] => {
    const out: Vector2[] = [];
    for (let i = 0; i < r.length; i += 2) out.push(new Vector2(r[i]!, r[i + 1]!));
    return out;
  };
  const contour = toV2(s.outer);
  const holes = s.holes.map(toV2);
  const faces = ShapeUtils.triangulateShape(contour, holes);
  const pts = [...contour, ...holes.flat()];
  const h = (s.top - s.base) * DM_TO_M;
  const base = m.vertexCount;
  const none = phaseOnly(s.phase ?? 0);
  for (const p of pts) {
    const pa = s.roofPhoto ? roofPhotoAttr(s.roofPhoto, p.x, p.y) : none;
    facadeVertex(m, p.x, p.y, s.top, 0, 0, 1, p.x * DM_TO_M, p.y * DM_TO_M, h, s.style, s.bldg, pa);
  }
  for (const f of faces) {
    const [i, j, k] = f as [number, number, number];
    const a = pts[i]!;
    const b = pts[j]!;
    const c = pts[k]!;
    // 统一成从上往下看逆时针（three 里法线朝 +Y）
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (cross >= 0) m.tri(base + i, base + j, base + k);
    else m.tri(base + i, base + k, base + j);
  }
}

/** 把一个棱柱（墙 + 屋顶）写进 m。 */
export function extrudePrism(m: MeshArrays, s: ExtrudeSpec): void {
  let u = addWalls(m, s.outer, 0, s, s.uOffset);
  for (let k = 0; k < s.holes.length; k++) u = addWalls(m, s.holes[k]!, k + 1, s, u);
  if (s.roof !== false) addRoof(m, s);
}

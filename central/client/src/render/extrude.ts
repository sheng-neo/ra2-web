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
import { facadeVertex } from './facade';
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
  /** 是否封顶（默认 true）。 */
  roof?: boolean;
  /** 各边不画的部分（共面墙去重，见 walls.ts）；ring 0 为外环，1.. 为洞。 */
  cuts?: (ring: number, edge: number) => readonly WallCut[] | undefined;
}

function addWalls(m: MeshArrays, ring: FlatXY, ringIndex: number, s: ExtrudeSpec, u0: number): number {
  const n = ring.length >> 1;
  const h = (s.top - s.base) * DM_TO_M;
  let u = u0;
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
    const cuts = s.cuts?.(ringIndex, i);
    const spans = cuts ? visibleSpans(len, s.bottom, s.top, cuts) : [{ s0: 0, s1: len, z0: s.bottom, z1: s.top }];
    for (const w of spans) {
      const xa = x0 + (dx * w.s0) / len;
      const ya = y0 + (dy * w.s0) / len;
      const xb = x0 + (dx * w.s1) / len;
      const yb = y0 + (dy * w.s1) / len;
      const ua = u + w.s0 * DM_TO_M;
      const ub = u + w.s1 * DM_TO_M;
      const va = (w.z0 - s.base) * DM_TO_M;
      const vb = (w.z1 - s.base) * DM_TO_M;
      const a = facadeVertex(m, xa, ya, w.z0, nx, ny, 0, ua, va, h, s.style);
      const b = facadeVertex(m, xb, yb, w.z0, nx, ny, 0, ub, va, h, s.style);
      const c = facadeVertex(m, xb, yb, w.z1, nx, ny, 0, ub, vb, h, s.style);
      const d = facadeVertex(m, xa, ya, w.z1, nx, ny, 0, ua, vb, h, s.style);
      m.tri(a, b, c);
      m.tri(a, c, d);
    }
    u += len * DM_TO_M;
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
  for (const p of pts) facadeVertex(m, p.x, p.y, s.top, 0, 0, 1, p.x * DM_TO_M, p.y * DM_TO_M, h, s.style);
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

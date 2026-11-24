/**
 * 地标构件工具：局部坐标（米，x 右 / y 前 / z 上，原点在地标中心地面）→ 模拟坐标（dm）。
 * 所有地标的立面、纯色构件、霓虹、线框分别写进四个共享缓冲，最后各合成一个 draw call。
 */
import type { FlatXY, LandmarkPlacement, SensitiveZone } from '@central/data';
import { simToThree } from '../../coords';
import type { HeightFn } from '../../data/terrain';
import { normalizeRing } from '../../geom/ring';
import { inSensitive } from '../buildings';
import { extrudePrism } from '../extrude';
import { FacadeMode, facadeVertex, hash01, styleCode } from '../facade';
import type { MeshArrays } from '../mesh-arrays';
import { lowestAlongRings } from '../walls';
import { neonVertex } from '../materials/neon';
import { solidVertex } from '../materials/solid';

export type Vec3 = readonly [number, number, number];
export type Rgb = readonly [number, number, number];

export interface LandmarkSink {
  facade: MeshArrays;
  solid: MeshArrays;
  neon: MeshArrays;
  /** 线段端点（three 坐标，米）。 */
  lines: number[];
}

export class Placement {
  readonly cx: number;
  readonly cy: number;
  readonly base: number;
  /** 总高（米）。 */
  readonly height: number;
  /** 局部坐标下轮廓的半宽 / 半深（米）。 */
  readonly hx: number;
  readonly hy: number;
  /** 贴地构件要往楼底以下伸多深（米）：轮廓与外包矩形上最低地面再往下 0.5 m，楼脚不悬空。 */
  readonly footing: number;
  readonly sensitive: boolean;
  readonly rnd: number;
  private readonly c: number;
  private readonly s: number;

  constructor(
    readonly p: LandmarkPlacement,
    ground: HeightFn,
    zones: readonly SensitiveZone[],
  ) {
    this.cx = p.x;
    this.cy = p.y;
    this.base = p.base !== 0 ? p.base : ground(p.x, p.y);
    this.height = p.height / 10;
    this.c = Math.cos(p.rot);
    this.s = Math.sin(p.rot);
    let hx = 0;
    let hy = 0;
    const ring = normalizeRing(p.footprint);
    for (let i = 0; ring && i < ring.outer.length; i += 2) {
      const dx = ring.outer[i]! - p.x;
      const dy = ring.outer[i + 1]! - p.y;
      hx = Math.max(hx, Math.abs(dx * this.c + dy * this.s));
      hy = Math.max(hy, Math.abs(-dx * this.s + dy * this.c));
    }
    this.hx = hx > 0 ? hx / 10 : 20;
    this.hy = hy > 0 ? hy / 10 : 20;
    const rings = [this.ringToSim(rectRing(this.hx, this.hy)), ...(ring ? [ring.outer] : [])];
    this.footing = Math.max(0, this.base - lowestAlongRings(rings, ground)) / 10 + 0.5;
    this.sensitive = inSensitive(zones, p.x, p.y);
    this.rnd = hash01(p.id + p.x);
  }

  /** 局部点（米）→ 模拟坐标（dm）。 */
  toSim(lx: number, ly: number, lz: number): Vec3 {
    return [this.cx + (lx * this.c - ly * this.s) * 10, this.cy + (lx * this.s + ly * this.c) * 10, this.base + lz * 10];
  }

  /** 局部方向 → 模拟方向。 */
  dirToSim(nx: number, ny: number, nz: number): Vec3 {
    return [nx * this.c - ny * this.s, nx * this.s + ny * this.c, nz];
  }

  ringToSim(local: readonly number[]): FlatXY {
    const out: FlatXY = [];
    for (let i = 0; i < local.length; i += 2) {
      const [x, y] = this.toSim(local[i]!, local[i + 1]!, 0);
      out.push(x, y);
    }
    return out;
  }

  /** 敏感区内一律退化成灰色无窗。 */
  style(seed: number, mode: FacadeMode): number {
    return styleCode(seed, this.sensitive ? FacadeMode.Plain : mode, this.rnd);
  }
}

/** 局部棱柱：环为局部米坐标（逆时针），z0..z1 米。立面 v 以地标地面为基准，使各段楼层线对齐。 */
export function prism(p: Placement, sink: LandmarkSink, ring: readonly number[], z0: number, z1: number, style: number): void {
  extrudePrism(sink.facade, {
    outer: p.ringToSim(ring),
    holes: [],
    bottom: z0 === 0 ? p.base - p.footing * 10 : p.base + z0 * 10,
    base: p.base,
    top: p.base + z1 * 10,
    style,
    uOffset: p.rnd * 50,
  });
}

/** 凸多边形面（局部米坐标，从外面看逆时针），写进立面缓冲；u 取面内水平坐标，v 取高度。 */
export function facadePoly(p: Placement, sink: LandmarkSink, pts: readonly Vec3[], style: number): void {
  const a = pts[0]!;
  const b = pts[1]!;
  const c = pts[2]!;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
  let ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
  let nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  // 面内水平方向：法线水平分量的左垂线；近水平面退回 x 轴
  const hl = Math.hypot(nx, ny);
  const tx = hl > 1e-3 ? -ny / hl : 1;
  const ty = hl > 1e-3 ? nx / hl : 0;
  const [snx, sny, snz] = p.dirToSim(nx, ny, nz);
  const h = p.height;
  const ids = pts.map((q) => {
    const [x, y, z] = p.toSim(q[0], q[1], q[2]);
    return facadeVertex(sink.facade, x, y, z, snx, sny, snz, q[0] * tx + q[1] * ty + p.rnd * 50, q[2], h, style);
  });
  for (let i = 1; i + 1 < ids.length; i++) sink.facade.tri(ids[0]!, ids[i]!, ids[i + 1]!);
}

/**
 * 有向长方体：中心 c，三根半轴 ax / ay / az（局部米，需两两正交、右手系）。
 */
export function box(p: Placement, sink: LandmarkSink, c: Vec3, ax: Vec3, ay: Vec3, az: Vec3, rgb: Rgb, glow: number): void {
  const faces: [Vec3, Vec3, Vec3][] = [
    [ax, ay, az],
    [[-ax[0], -ax[1], -ax[2]], [-ay[0], -ay[1], -ay[2]], az],
    [ay, [-ax[0], -ax[1], -ax[2]], az],
    [[-ay[0], -ay[1], -ay[2]], ax, az],
    [az, ay, [-ax[0], -ax[1], -ax[2]]],
    [[-az[0], -az[1], -az[2]], ay, ax],
  ];
  for (const [n, t, b] of faces) {
    // 面中心 = c + n；四角 = 中心 ± t ± b，(−t−b) → (+t−b) → (+t+b) → (−t+b) 从外看逆时针（t × b = n 方向）
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    const [snx, sny, snz] = p.dirToSim(n[0] / nl, n[1] / nl, n[2] / nl);
    const ids = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([i, j]) => {
      const [x, y, z] = p.toSim(
        c[0] + n[0] + t[0] * i! + b[0] * j!,
        c[1] + n[1] + t[1] * i! + b[1] * j!,
        c[2] + n[2] + t[2] * i! + b[2] * j!,
      );
      return solidVertex(sink.solid, x, y, z, snx, sny, snz, rgb, glow);
    });
    sink.solid.tri(ids[0]!, ids[1]!, ids[2]!);
    sink.solid.tri(ids[0]!, ids[2]!, ids[3]!);
  }
}

/** 竖直立柱 / 水平梁的便捷版：轴对齐长方体，局部范围 [x0,x1]×[y0,y1]×[z0,z1]。 */
export function aabb(p: Placement, sink: LandmarkSink, min: Vec3, max: Vec3, rgb: Rgb, glow: number): void {
  const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  box(p, sink, c, [(max[0] - min[0]) / 2, 0, 0], [0, (max[1] - min[1]) / 2, 0], [0, 0, (max[2] - min[2]) / 2], rgb, glow);
}

/** 霓虹四边形（双面），phase 取各顶点离地高度。 */
export function neonQuad(p: Placement, sink: LandmarkSink, a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
  const ids = [a, b, c, d].map((q) => {
    const [x, y, z] = p.toSim(q[0], q[1], q[2]);
    return neonVertex(sink.neon, x, y, z, q[2]);
  });
  sink.neon.tri(ids[0]!, ids[1]!, ids[2]!);
  sink.neon.tri(ids[0]!, ids[2]!, ids[3]!);
}

export function line(p: Placement, sink: LandmarkSink, a: Vec3, b: Vec3): void {
  for (const q of [a, b]) {
    const [x, y, z] = p.toSim(q[0], q[1], q[2]);
    const v = [0, 0, 0];
    simToThree(x, y, z, v);
    sink.lines.push(...v);
  }
}

/** 切角正方形（八边形）环，半边长 a、切角 ch，逆时针。 */
export function chamferSquare(a: number, ch: number): number[] {
  return [-a + ch, -a, a - ch, -a, a, -a + ch, a, a - ch, a - ch, a, -a + ch, a, -a, a - ch, -a, -a + ch];
}

/** 四角内凹的正方形（十二边形），半边长 a、凹口 k，逆时针。 */
export function notchedSquare(a: number, k: number): number[] {
  return [
    -a + k, -a, a - k, -a, a - k, -a + k, a, -a + k, a, a - k, a - k, a - k,
    a - k, a, -a + k, a, -a + k, a - k, -a, a - k, -a, -a + k, -a + k, -a + k,
  ];
}

export function rectRing(hx: number, hy: number): number[] {
  return [-hx, -hy, hx, -hy, hx, hy, -hx, hy];
}

/** 环向外平移 d 米后的各边（用于在立面外贴灯带/线框）。返回每条边的端点对。 */
export function ringEdges(ring: readonly number[], d: number): [number, number, number, number][] {
  const n = ring.length >> 1;
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = ring[i * 2]!;
    const y0 = ring[i * 2 + 1]!;
    const x1 = ring[j * 2]!;
    const y1 = ring[j * 2 + 1]!;
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ox = ((y1 - y0) / l) * d;
    const oy = (-(x1 - x0) / l) * d;
    out.push([x0 + ox, y0 + oy, x1 + ox, y1 + oy]);
  }
  return out;
}

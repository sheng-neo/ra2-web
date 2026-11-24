/**
 * 远景几何的顶点布局与构造器：position、normal、aUv（米：墙面沿墙 / 离地高度，地面为平面坐标）、
 * aInfo（种类、种子 0–1、亮灯率、冷暖 0–1）。坐标进来是模拟米，经 coords.ts 换算。
 */
import { simToThree } from '../../coords';
import { MeshArrays, type AttrSpec } from '../mesh-arrays';

export const BACKDROP_LAYOUT: readonly AttrSpec[] = [
  { name: 'position', size: 3 },
  { name: 'normal', size: 3 },
  { name: 'aUv', size: 2 },
  { name: 'aInfo', size: 4 },
];

/** 表面种类（aInfo.x）。 */
export const Kind = {
  /** 山林冠层（近黑橄榄色）。 */
  Canopy: 0,
  /** 远处平地（九龙地台、港岛东西两端）：暗地面 + 街灯网格的漫光。 */
  Ground: 1,
  /** 住宅墙：小窗、暖冷混合、亮灯率低。 */
  WallHome: 2,
  /** 写字楼 / 商业墙：中性白大窗。 */
  WallOffice: 3,
  Roof: 4,
  /** 静态 LED 外墙（白 / 金 / 蓝），极少数海旁楼。 */
  LedWhite: 5,
  LedGold: 6,
  LedBlue: 7,
  /** 海堤立面。 */
  SeaWall: 8,
} as const;

export type KindId = (typeof Kind)[keyof typeof Kind];

export function newBackdropArrays(): MeshArrays {
  return new MeshArrays(BACKDROP_LAYOUT);
}

const v = new Float32Array(12);

/** 写一个顶点（模拟米）；返回下标。 */
export function bdVertex(
  m: MeshArrays,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  u: number,
  w: number,
  kind: number,
  seed: number,
  lit: number,
  warmth: number,
): number {
  simToThree(x, y, z, v, 0, 1);
  simToThree(nx, ny, nz, v, 3, 1);
  v[6] = u;
  v[7] = w;
  v[8] = kind;
  v[9] = seed;
  v[10] = lit;
  v[11] = warmth;
  return m.push(v);
}

export interface BoxSpec {
  /** 中心（模拟米）、宽（沿 rot 方向）、深、朝向（弧度）。 */
  x: number;
  y: number;
  w: number;
  d: number;
  rot: number;
  /** 楼底与楼高（mPD 米）。 */
  base: number;
  height: number;
  kind: KindId;
  seed: number;
  lit: number;
  warmth: number;
}

/** 一栋盒子楼：四面墙 + 屋顶（10 个三角形）。墙面 u 沿墙累加（米），w 为离楼底高度。 */
export function addBox(m: MeshArrays, b: BoxSpec): void {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const hw = b.w / 2;
  const hd = b.d / 2;
  // 逆时针（从上往下看）四角
  const local: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  const pts = local.map(([lx, ly]) => [b.x + lx * c - ly * s, b.y + lx * s + ly * c] as const);
  const top = b.base + b.height;
  let u = b.seed * 97;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[(i + 1) % 4]!;
    const len = Math.hypot(bx - ax, by - ay);
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    const a0 = bdVertex(m, ax, ay, b.base, nx, ny, 0, u, 0, b.kind, b.seed, b.lit, b.warmth);
    const b0 = bdVertex(m, bx, by, b.base, nx, ny, 0, u + len, 0, b.kind, b.seed, b.lit, b.warmth);
    const b1 = bdVertex(m, bx, by, top, nx, ny, 0, u + len, b.height, b.kind, b.seed, b.lit, b.warmth);
    const a1 = bdVertex(m, ax, ay, top, nx, ny, 0, u, b.height, b.kind, b.seed, b.lit, b.warmth);
    m.tri(a0, b0, b1);
    m.tri(a0, b1, a1);
    u += len;
  }
  const r = pts.map(([x, y]) => bdVertex(m, x, y, top, 0, 0, 1, x, y, Kind.Roof, b.seed, b.lit, b.warmth));
  m.tri(r[0]!, r[1]!, r[2]!);
  m.tri(r[0]!, r[2]!, r[3]!);
}

/**
 * 高度场网格：xs、ys 为节点坐标（递增，模拟米），height(x, y) 给高度；skip(i, j) 为 true 的格子不出三角形。
 * 法线由高度场差分估算。kindAt 决定每个顶点的表面种类（山林 / 平地）。
 */
export function addHeightfield(
  m: MeshArrays,
  xs: readonly number[],
  ys: readonly number[],
  height: (x: number, y: number) => number,
  skip: (i: number, j: number) => boolean,
  kindAt: (x: number, y: number, h: number) => number,
): void {
  const ids = new Int32Array(xs.length * ys.length).fill(-1);
  const node = (i: number, j: number): number => {
    const k = j * xs.length + i;
    if (ids[k]! >= 0) return ids[k]!;
    const x = xs[i]!;
    const y = ys[j]!;
    const h = height(x, y);
    const e = 6;
    const gx = (height(x + e, y) - height(x - e, y)) / (2 * e);
    const gy = (height(x, y + e) - height(x, y - e)) / (2 * e);
    const l = Math.hypot(gx, gy, 1);
    const seed = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    ids[k] = bdVertex(m, x, y, h, -gx / l, -gy / l, 1 / l, x, y, kindAt(x, y, h), Math.abs(seed), 0, 0);
    return ids[k]!;
  };
  for (let j = 0; j + 1 < ys.length; j++) {
    for (let i = 0; i + 1 < xs.length; i++) {
      if (skip(i, j)) continue;
      const p00 = node(i, j);
      const p10 = node(i + 1, j);
      const p11 = node(i + 1, j + 1);
      const p01 = node(i, j + 1);
      m.tri(p00, p10, p11);
      m.tri(p00, p11, p01);
    }
  }
}

/** 从 a 到 b（含两端）按大约 step 的间距等分取节点。 */
export function axisNodes(a: number, b: number, step: number): number[] {
  const n = Math.max(1, Math.round((b - a) / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}

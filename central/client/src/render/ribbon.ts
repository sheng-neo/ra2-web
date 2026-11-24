/**
 * 道路带状网格：沿中心折线左右各偏移半宽（斜接，限制斜接长度），从上往下看逆时针。
 * 左右边各自按所在位置取高度（贴地形）。
 * 高架段可加桥面厚度：两侧侧板 + 底面（横向坐标标成超出半宽，shader 画成混凝土）。
 */
import type { FlatXY } from '@central/data';
import { DM_TO_M, simToThree } from '../coords';
import type { HeightFn } from '../data/terrain';
import { MeshArrays, type AttrSpec } from './mesh-arrays';

export const ROAD_LAYOUT: readonly AttrSpec[] = [
  { name: 'position', size: 3 },
  { name: 'aRoad', size: 4 },
  { name: 'aLane', size: 2 },
];

export function newRoadArrays(): MeshArrays {
  return new MeshArrays(ROAD_LAYOUT);
}

export interface RibbonSpec {
  /** 中心线（dm），已去重。 */
  pts: FlatXY;
  /** 半宽（dm）。 */
  halfWidth: number;
  /** 路面高程（dm）：参数为该顶点坐标与沿线距离（dm），左右边分别调用。 */
  height: (x: number, y: number, along: number) => number;
  lanes: number;
  flags: number;
  /** 桥面厚度（dm）；0 表示贴地，不生成侧板。 */
  deck: number;
}

/** 把折线按最大段长重采样（插点，不移动原有点）。 */
export function resample(pts: FlatXY, maxSeg: number): FlatXY {
  const out: FlatXY = [];
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2]!;
    const y = pts[i * 2 + 1]!;
    if (i > 0) {
      const px = pts[i * 2 - 2]!;
      const py = pts[i * 2 - 1]!;
      const steps = Math.ceil(Math.hypot(x - px, y - py) / maxSeg);
      for (let k = 1; k < steps; k++) out.push(px + ((x - px) * k) / steps, py + ((y - py) * k) / steps);
    }
    out.push(x, y);
  }
  return out;
}

/** 贴地加密的最小段长（dm）。 */
const DRAPE_MIN_DM = 25;

/**
 * 贴地重采样：先按 maxSeg 插点，再把中点处地面偏离两端连线超过 tol（dm）的段二分，
 * 直到段长 < 2 × DRAPE_MIN_DM。平地上不加点，坡折处加密，线不会钻进地形。
 */
export function drapeResample(pts: FlatXY, ground: HeightFn, maxSeg: number, tol = 0.5): FlatXY {
  const base = resample(pts, maxSeg);
  const out: FlatXY = [base[0]!, base[1]!];
  const split = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): void => {
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const mz = ground(mx, my);
    if (Math.hypot(bx - ax, by - ay) >= 2 * DRAPE_MIN_DM && Math.abs(mz - (az + bz) / 2) > tol) {
      split(ax, ay, az, mx, my, mz);
      split(mx, my, mz, bx, by, bz);
    } else out.push(bx, by);
  };
  for (let i = 2; i < base.length; i += 2) {
    const ax = base[i - 2]!;
    const ay = base[i - 1]!;
    split(ax, ay, ground(ax, ay), base[i]!, base[i + 1]!, ground(base[i]!, base[i + 1]!));
  }
  return out;
}

const scratch = new Float32Array(9);

function vertex(m: MeshArrays, x: number, y: number, z: number, along: number, across: number, s: RibbonSpec, len: number): number {
  simToThree(x, y, z, scratch, 0);
  scratch[3] = along * DM_TO_M;
  scratch[4] = across;
  scratch[5] = s.halfWidth * DM_TO_M;
  scratch[6] = len * DM_TO_M;
  scratch[7] = s.lanes;
  scratch[8] = s.flags;
  return m.push(scratch);
}

export function addRibbon(m: MeshArrays, s: RibbonSpec): void {
  const p = s.pts;
  const n = p.length >> 1;
  if (n < 2) return;
  const along: number[] = [0];
  for (let i = 1; i < n; i++) {
    along.push(along[i - 1]! + Math.hypot(p[i * 2]! - p[i * 2 - 2]!, p[i * 2 + 1]! - p[i * 2 - 1]!));
  }
  const len = along[n - 1]!;
  if (len <= 0) return;
  const hwM = s.halfWidth * DM_TO_M;
  const skirt = hwM + 0.5;
  const top: { l: number; r: number }[] = [];
  const side: { l: number; r: number; lb: number; rb: number }[] = [];
  for (let i = 0; i < n; i++) {
    const x = p[i * 2]!;
    const y = p[i * 2 + 1]!;
    let px = 0;
    let py = 0;
    let nx = 0;
    let ny = 0;
    if (i > 0) {
      const d = Math.hypot(x - p[i * 2 - 2]!, y - p[i * 2 - 1]!) || 1;
      px = (x - p[i * 2 - 2]!) / d;
      py = (y - p[i * 2 - 1]!) / d;
    }
    if (i < n - 1) {
      const d = Math.hypot(p[i * 2 + 2]! - x, p[i * 2 + 3]! - y) || 1;
      nx = (p[i * 2 + 2]! - x) / d;
      ny = (p[i * 2 + 3]! - y) / d;
    }
    let tx = px + nx;
    let ty = py + ny;
    let tl = Math.hypot(tx, ty);
    if (tl < 1e-6) {
      tx = px || nx;
      ty = py || ny;
      tl = Math.hypot(tx, ty) || 1;
    }
    tx /= tl;
    ty /= tl;
    // 左法线 (−ty, tx)；斜接长度按与前一段左法线的夹角放大，最多约 2.9 倍
    const lx = -ty;
    const ly = tx;
    const ref = i > 0 ? lx * -py + ly * px : 1;
    const off = s.halfWidth / Math.max(ref, 0.35);
    const L = [x + lx * off, y + ly * off] as const;
    const R = [x - lx * off, y - ly * off] as const;
    // 左右边各取所在位置的高度；中线处地面若高出两边连线（路面横跨凸起），整段横截面抬到中线不入地
    const zc = s.height(x, y, along[i]!);
    let zl = s.height(L[0], L[1], along[i]!);
    let zr = s.height(R[0], R[1], along[i]!);
    const bump = Math.max(0, zc - (zl + zr) / 2);
    zl += bump;
    zr += bump;
    top.push({
      r: vertex(m, R[0], R[1], zr, along[i]!, -hwM, s, len),
      l: vertex(m, L[0], L[1], zl, along[i]!, hwM, s, len),
    });
    if (s.deck > 0) {
      side.push({
        r: vertex(m, R[0], R[1], zr, along[i]!, -skirt, s, len),
        l: vertex(m, L[0], L[1], zl, along[i]!, skirt, s, len),
        rb: vertex(m, R[0], R[1], zr - s.deck, along[i]!, -skirt, s, len),
        lb: vertex(m, L[0], L[1], zl - s.deck, along[i]!, skirt, s, len),
      });
    }
  }
  for (let i = 0; i + 1 < n; i++) {
    const a = top[i]!;
    const b = top[i + 1]!;
    m.tri(a.r, b.r, b.l);
    m.tri(a.r, b.l, a.l);
    if (s.deck > 0) {
      const c = side[i]!;
      const d = side[i + 1]!;
      // 左侧板朝左外、右侧板朝右外、底面朝下
      m.tri(d.lb, c.lb, c.l);
      m.tri(d.lb, c.l, d.l);
      m.tri(c.rb, d.rb, d.r);
      m.tri(c.rb, d.r, c.r);
      m.tri(c.rb, d.lb, d.rb);
      m.tri(c.rb, c.lb, d.lb);
    }
  }
}

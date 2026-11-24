/**
 * 小物件几何拼装（three 局部坐标，米，y 向上）：四边形 / 盒子（可收顶）逐面写 position、normal、aAlb、aEm、aPart，
 * 配 prop-material 使用。全部是纯数组运算，可在 Node 里测。
 */
import { BufferAttribute, BufferGeometry } from 'three';

export type V3 = readonly [number, number, number];

export interface FaceStyle {
  /** 反照率（线性 RGB）。 */
  alb?: V3;
  /** 发光（线性 HDR）。 */
  em?: V3;
  /** 0 固定色 / 1 实例主色 / 2 实例副色 / 3 玻璃。 */
  part?: number;
  /** 竖直面发光的上下渐变：底边乘 [0]，顶边乘 [1]（车厢天花灯最亮、窗下沿暗）。 */
  emGrad?: readonly [number, number];
}

const ZERO: V3 = [0, 0, 0];

export class PropBuilder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly alb: number[] = [];
  readonly em: number[] = [];
  readonly part: number[] = [];
  readonly index: number[] = [];

  get triangleCount(): number {
    return this.index.length / 3;
  }

  /** 平面四边形 a→b→c→d（从外面看逆时针）。 */
  quad(a: V3, b: V3, c: V3, d: V3, style: FaceStyle): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const base = this.pos.length / 3;
    const ys = [a[1], b[1], c[1], d[1]];
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    for (const p of [a, b, c, d]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      const al = style.alb ?? [0.1, 0.1, 0.1];
      const e = style.em ?? ZERO;
      const g = style.emGrad && y1 > y0 ? style.emGrad[0] + (style.emGrad[1] - style.emGrad[0]) * ((p[1] - y0) / (y1 - y0)) : 1;
      this.alb.push(al[0], al[1], al[2]);
      this.em.push(e[0] * g, e[1] * g, e[2] * g);
      this.part.push(style.part ?? 0);
    }
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** 单个三角形 a→b→c（从外面看逆时针），平面法线。 */
  tri(a: V3, b: V3, c: V3, style: FaceStyle): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const base = this.pos.length / 3;
    const al = style.alb ?? [0.1, 0.1, 0.1];
    const e = style.em ?? ZERO;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.alb.push(al[0], al[1], al[2]);
      this.em.push(e[0], e[1], e[2]);
      this.part.push(style.part ?? 0);
    }
    this.index.push(base, base + 1, base + 2);
  }

  /**
   * 轴对齐盒子：底面中心 (cx, y0, cz)，尺寸 sx × sy × sz；topScale 收顶（顶面 x、z 按比例缩小，车顶 / 驾驶室）。
   * faces：每个面的样式（缺省用 all）；skip 里的面不画（'bottom' 默认不画）。
   */
  box(
    c: V3,
    s: V3,
    all: FaceStyle,
    faces: Partial<Record<'px' | 'nx' | 'pz' | 'nz' | 'top' | 'bottom', FaceStyle | null>> = { bottom: null },
    topScale: readonly [number, number] = [1, 1],
  ): void {
    const [cx, y0, cz] = c;
    const hx = s[0] / 2;
    const hz = s[2] / 2;
    const y1 = y0 + s[1];
    const tx = hx * topScale[0];
    const tz = hz * topScale[1];
    const b = (x: number, z: number): V3 => [cx + x, y0, cz + z];
    const t = (x: number, z: number): V3 => [cx + x, y1, cz + z];
    const style = (k: keyof typeof faces): FaceStyle | null => (k in faces ? (faces[k] ?? null) : all);
    const f = {
      pz: style('pz'),
      nz: style('nz'),
      px: style('px'),
      nx: style('nx'),
      top: style('top'),
      bottom: style('bottom'),
    };
    if (f.pz) this.quad(b(-hx, hz), b(hx, hz), t(tx, tz), t(-tx, tz), f.pz);
    if (f.nz) this.quad(b(hx, -hz), b(-hx, -hz), t(-tx, -tz), t(tx, -tz), f.nz);
    if (f.px) this.quad(b(hx, hz), b(hx, -hz), t(tx, -tz), t(tx, tz), f.px);
    if (f.nx) this.quad(b(-hx, -hz), b(-hx, hz), t(-tx, tz), t(-tx, -tz), f.nx);
    if (f.top) this.quad(t(-tx, tz), t(tx, tz), t(tx, -tz), t(-tx, -tz), f.top);
    if (f.bottom) this.quad(b(-hx, -hz), b(hx, -hz), b(hx, hz), b(-hx, hz), f.bottom);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('aAlb', new BufferAttribute(new Float32Array(this.alb), 3));
    g.setAttribute('aEm', new BufferAttribute(new Float32Array(this.em), 3));
    g.setAttribute('aPart', new BufferAttribute(new Float32Array(this.part), 1));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

/** sRGB 十六进制 → 线性 RGB（与 three Color 相同的转换），纯函数。 */
export function linearRGB(hex: string): V3 {
  const v = parseInt(hex.replace('#', ''), 16);
  const c = (x: number) => {
    const s = x / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [c((v >> 16) & 255), c((v >> 8) & 255), c(v & 255)];
}

export const scale3 = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];

/** 车身侧面贴片（窗柱）只画朝外的一面：z > 0 一侧画 +z 面，否则画 −z 面。 */
export function outwardOnly(z: number): Partial<Record<'px' | 'nx' | 'pz' | 'nz' | 'top' | 'bottom', FaceStyle | null>> {
  return z > 0 ? { bottom: null, top: null, px: null, nx: null, nz: null } : { bottom: null, top: null, px: null, nx: null, pz: null };
}

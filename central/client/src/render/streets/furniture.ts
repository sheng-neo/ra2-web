/**
 * 街道设施网格（R2 STREETLIFE S2/S3/S4）：栏杆、护柱、行人灯杆、巴士站候车亭、站牌、垃圾桶、消防栓。
 * 全部合并成一个网格（一个 draw call，life-material）：每种设施一个局部模板，相机移动 > 20 m 时
 * 把半径内的设施（各类有各自的最远距离）变换后写进预分配的动态缓冲（drawRange 截断）。
 * 模板局部坐标：米，+x 为设施朝向，y 向上，z 为左右；栏杆模板长 1 m，按片长沿 x 缩放（uv.x 随之按米计）。
 */
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, type Camera, type Material } from 'three';
import { linearRGB, scale3, type V3 } from './prop-geometry';
import { lightColour } from '../materials/lighting';
import type { AtlasRect } from '../stations/atlas';

/** 设施种类（kind，见 life-material）。 */
export const K_PLAIN = 0;
export const K_RAIL = 1;
export const K_PEDHEAD = 2;
export const K_LIGHTBOX = 3;
export const K_WATER = 4;
export const K_SHEET = 5;
export const K_GLAZING = 6;
export const K_GLASS = 7;
export const K_SOFFIT = 8;
export const K_UPLIT = 9;
/** R3 STATIONS 新增（见 life-material）。 */
export const K_ATLAS = 10;
export const K_LOUVRE = 11;
export const K_ADWALL = 12;
export const K_STAIRWELL = 13;
export const K_STAINLESS = 14;
export const K_TILES = 15;
export const K_TACTILE = 16;
export const K_REDBAND = 17;
export const K_LCD = 18;

export interface Face {
  alb?: V3;
  em?: V3;
  kind?: number;
  /** 附加参数（实例可覆盖：useAux）。 */
  aux?: number;
  /** 写顶点时用实例的 aux（行人灯相位、灯箱种子）。 */
  useAux?: boolean;
}

/** 模板 / 静态网格的构建器（顶点属性与 life-material 一致）。 */
export class LifeBuilder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly alb: number[] = [];
  readonly em: number[] = [];
  readonly uv: number[] = [];
  readonly k: number[] = [];
  /** 每个顶点是否取实例 aux。 */
  readonly useAux: number[] = [];
  readonly index: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** 四边形 a→b→c→d（从外面看逆时针）；uv 默认取 (0,0)(1,0)(1,1)(0,1)；lift 为各顶点离地高度（缺省 = y）。 */
  quad(a: V3, b: V3, c: V3, d: V3, f: Face, uv: readonly [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]], lift?: readonly number[]): void {
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
    const base = this.vertexCount;
    [a, b, c, d].forEach((p, i) => {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      const al = f.alb ?? [0.1, 0.1, 0.1];
      const e = f.em ?? [0, 0, 0];
      this.alb.push(al[0], al[1], al[2]);
      this.em.push(e[0], e[1], e[2]);
      this.uv.push(uv[i]![0], uv[i]![1]);
      this.k.push(f.kind ?? K_PLAIN, f.aux ?? 0, lift ? lift[i]! : p[1]);
      this.useAux.push(f.useAux ? 1 : 0);
    });
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  tri(a: V3, b: V3, c: V3, f: Face): void {
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
    const base = this.vertexCount;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      const al = f.alb ?? [0.1, 0.1, 0.1];
      const e = f.em ?? [0, 0, 0];
      this.alb.push(al[0], al[1], al[2]);
      this.em.push(e[0], e[1], e[2]);
      this.uv.push(0, 0);
      this.k.push(f.kind ?? K_PLAIN, f.aux ?? 0, p[1]);
      this.useAux.push(f.useAux ? 1 : 0);
    }
    this.index.push(base, base + 1, base + 2);
  }

  /** 收顶盒子：底中心 c，尺寸 s；faces 里为 null 的面不画（默认不画底面）。 */
  box(c: V3, s: V3, f: Face, skip: Partial<Record<'px' | 'nx' | 'pz' | 'nz' | 'top' | 'bottom', Face | null>> = { bottom: null }, top: readonly [number, number] = [1, 1]): void {
    const [cx, y0, cz] = c;
    const hx = s[0] / 2;
    const hz = s[2] / 2;
    const y1 = y0 + s[1];
    const tx = hx * top[0];
    const tz = hz * top[1];
    const B = (x: number, z: number): V3 => [cx + x, y0, cz + z];
    const T = (x: number, z: number): V3 => [cx + x, y1, cz + z];
    const st = (k: keyof typeof skip): Face | null => (k in skip ? (skip[k] ?? null) : f);
    const pz = st('pz');
    const nz = st('nz');
    const px = st('px');
    const nx = st('nx');
    const tp = st('top');
    const bt = st('bottom');
    if (pz) this.quad(B(-hx, hz), B(hx, hz), T(tx, tz), T(-tx, tz), pz);
    if (nz) this.quad(B(hx, -hz), B(-hx, -hz), T(-tx, -tz), T(tx, -tz), nz);
    if (px) this.quad(B(hx, hz), B(hx, -hz), T(tx, -tz), T(tx, tz), px);
    if (nx) this.quad(B(-hx, -hz), B(-hx, hz), T(-tx, tz), T(-tx, -tz), nx);
    if (tp) this.quad(T(-tx, tz), T(tx, tz), T(tx, -tz), T(-tx, -tz), tp);
    if (bt) this.quad(B(-hx, -hz), B(hx, -hz), B(hx, hz), B(-hx, hz), bt);
  }

  /** 竖直圆柱（n 边），底中心 c、半径 r、高 h；dome > 0 时顶上加一圈收成圆顶。 */
  cylinder(c: V3, r: number, h: number, n: number, f: Face, dome = 0): void {
    const ring = (y: number, rr: number): V3[] => Array.from({ length: n }, (_, i) => [c[0] + Math.cos((i / n) * Math.PI * 2) * rr, c[1] + y, c[2] - Math.sin((i / n) * Math.PI * 2) * rr] as V3);
    const a = ring(0, r);
    const b = ring(h, r);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.quad(a[i]!, a[j]!, b[j]!, b[i]!, f);
    }
    const apex: V3 = [c[0], c[1] + h + dome, c[2]];
    for (let i = 0; i < n; i++) this.tri(b[i]!, b[(i + 1) % n]!, apex, f);
  }

  /** 组成模板（局部坐标）。 */
  template(scaleUvX = false): Template {
    return {
      pos: new Float32Array(this.pos),
      nrm: new Float32Array(this.nrm),
      alb: new Float32Array(this.alb),
      em: new Float32Array(this.em),
      uv: new Float32Array(this.uv),
      k: new Float32Array(this.k),
      useAux: new Uint8Array(this.useAux),
      index: new Uint32Array(this.index),
      scaleUvX,
    };
  }

  /** 直接建成静态网格。 */
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('aAlb', new BufferAttribute(new Float32Array(this.alb), 3));
    g.setAttribute('aEm', new BufferAttribute(new Float32Array(this.em), 3));
    g.setAttribute('aUv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('aK', new BufferAttribute(new Float32Array(this.k), 3));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

export interface Template {
  pos: Float32Array;
  nrm: Float32Array;
  alb: Float32Array;
  em: Float32Array;
  uv: Float32Array;
  k: Float32Array;
  useAux: Uint8Array;
  index: Uint32Array;
  /** uv.x 随实例 sx 缩放（栏杆：uv 以米计）。 */
  scaleUvX: boolean;
}

/**
 * 按种类拆模板（R2 修复轮：候车亭玻璃单独画在半透明网格里）：返回 [不含该种类的面, 只有该种类的面]，下标一一对应。
 */
export function splitTemplates(templates: readonly Template[], kind: number): [Template[], Template[]] {
  const keep: Template[] = [];
  const only: Template[] = [];
  for (const t of templates) {
    const pick = (want: boolean): Template => {
      const map = new Map<number, number>();
      const idx: number[] = [];
      const take = (v: number) => {
        let j = map.get(v);
        if (j === undefined) {
          j = map.size;
          map.set(v, j);
        }
        idx.push(j);
      };
      for (let i = 0; i < t.index.length; i += 3) {
        const a = t.index[i]!;
        if (Math.round(t.k[a * 3]!) === kind !== want) continue;
        take(a);
        take(t.index[i + 1]!);
        take(t.index[i + 2]!);
      }
      const n = map.size;
      const out: Template = {
        pos: new Float32Array(n * 3),
        nrm: new Float32Array(n * 3),
        alb: new Float32Array(n * 3),
        em: new Float32Array(n * 3),
        uv: new Float32Array(n * 2),
        k: new Float32Array(n * 3),
        useAux: new Uint8Array(n),
        index: Uint32Array.from(idx),
        scaleUvX: t.scaleUvX,
      };
      for (const [v, j] of map) {
        for (let c = 0; c < 3; c++) {
          out.pos[j * 3 + c] = t.pos[v * 3 + c]!;
          out.nrm[j * 3 + c] = t.nrm[v * 3 + c]!;
          out.alb[j * 3 + c] = t.alb[v * 3 + c]!;
          out.em[j * 3 + c] = t.em[v * 3 + c]!;
          out.k[j * 3 + c] = t.k[v * 3 + c]!;
        }
        out.uv[j * 2] = t.uv[v * 2]!;
        out.uv[j * 2 + 1] = t.uv[v * 2 + 1]!;
        out.useAux[j] = t.useAux[v]!;
      }
      return out;
    };
    keep.push(pick(false));
    only.push(pick(true));
  }
  return [keep, only];
}

/** 一个设施实例（three 坐标）。 */
export interface FurnitureItem {
  t: number;
  /** 底部位置（three 坐标，米）。 */
  x: number;
  y: number;
  z: number;
  /** 局部 +x 的水平方向（three xz，单位向量）。 */
  dx: number;
  dz: number;
  /** 沿 x 的缩放。 */
  sx: number;
  aux: number;
  /** 这个距离（m，三维）以外不画。 */
  maxD: number;
}

const GALV = linearRGB('#9aa0a3');
const STEEL = linearRGB('#b8bcbf');
const POLE = linearRGB('#5c6166');

/** 栏杆片（长 1 m，沿 x 缩放）：一个双面四边形，片元画立柱 / 横杆 / 竖条。 */
export function railTemplate(): Template {
  const b = new LifeBuilder();
  b.quad([0, 0, 0], [1, 0, 0], [1, 1.05, 0], [0, 1.05, 0], { alb: GALV, kind: K_RAIL }, [
    [0, 0],
    [1, 0],
    [1, 1.05],
    [0, 1.05],
  ]);
  return b.template(true);
}

/** 不锈钢护柱：Ø 0.28 m × 0.95 m，圆顶（6 边，18 个三角形）。 */
export function bollardTemplate(): Template {
  const b = new LifeBuilder();
  b.cylinder([0, 0, 0], 0.14, 0.88, 6, { alb: STEEL }, 0.07);
  return b.template();
}

/**
 * 行人灯杆：3.0 m 灰杆、2.2–2.8 m 黑色双格灯箱（面朝 +x，面上画红色站立人 / 绿色步行人，aux = 相位），
 * 1.05 m 按钮箱（朝 −z：朝候车的人）。
 */
export function pedPoleTemplate(): Template {
  const b = new LifeBuilder();
  b.box([0, 0, 0], [0.1, 3.0, 0.1], { alb: POLE }, { bottom: null });
  b.box([0.12, 2.2, 0], [0.22, 0.62, 0.32], { alb: [0.012, 0.012, 0.013] }, { bottom: null });
  // 灯面（双格），略突出
  b.quad([0.235, 2.23, 0.14], [0.235, 2.23, -0.14], [0.235, 2.79, -0.14], [0.235, 2.79, 0.14], { alb: [0.01, 0.01, 0.01], kind: K_PEDHEAD, useAux: true });
  // 遮光檐
  b.quad([0.23, 2.82, 0.16], [0.23, 2.82, -0.16], [0.36, 2.79, -0.16], [0.36, 2.79, 0.16], { alb: [0.012, 0.012, 0.013] });
  // 按钮 / 响声器箱（黄色）
  b.box([0, 0.98, -0.09], [0.12, 0.22, 0.1], { alb: linearRGB('#c9a227') }, { bottom: null });
  return b.template();
}

/** 垃圾桶（深绿桶身、橙色桶口带）。 */
export function binTemplate(): Template {
  const b = new LifeBuilder();
  b.box([0, 0, 0], [0.42, 0.78, 0.42], { alb: linearRGB('#244232') }, { bottom: null });
  b.box([0, 0.78, 0], [0.46, 0.14, 0.46], { alb: linearRGB('#c8641e') }, { bottom: null });
  return b.template();
}

/** 消防栓（红身黄帽）。 */
export function hydrantTemplate(): Template {
  const b = new LifeBuilder();
  b.cylinder([0, 0, 0], 0.11, 0.55, 6, { alb: linearRGB('#a01c18') }, 0);
  b.cylinder([0, 0.55, 0], 0.08, 0.12, 6, { alb: linearRGB('#d6a521') }, 0.05);
  b.box([0, 0.3, 0], [0.34, 0.08, 0.08], { alb: linearRGB('#a01c18') }, { bottom: null });
  return b.template();
}

/**
 * 候车亭（长 L，沿 +x 居中，+z 朝路；R3 STATIONS 改成中环大会堂一带的款式，照片 14）：
 * 2.2 m 一跨的灰色不锈钢后柱，向路边斜升的百叶玻璃顶棚（后 2.55 m、前 2.85 m，横向金属百叶 + 暗玻璃，棚底一条冷白灯管），
 * 玻璃背板（半透明网格另画）、−x 端（上游）1.25 × 1.85 m 背光广告灯箱（冷色调虚构广告，1.5–2.0，全站最亮）、
 * 木面倚靠长凳、+x 端棚下吊一块实时到站屏。type 只决定跨距的细节（0 = 每跨有横撑、1 = 无），两种长度由 kerbside 给。
 * 站牌（营运商站牌、实时资讯柱）不在这里，见 stopFlagTemplate。约 150 个三角形。
 */
export function shelterTemplate(type: 0 | 1, length: number): Template {
  const b = new LifeBuilder();
  // 只有站牌的站（length 0）：不画候车亭
  if (length <= 0) return b.template();
  const tube = scale3(lightColour('tubeCool').toArray() as unknown as V3, 1.1);
  const glass: Face = { alb: [0.05, 0.06, 0.065], kind: K_GLASS };
  const frame = linearRGB('#8c9196');
  const half = length / 2;
  const bays = Math.max(1, Math.round(length / 2.2));
  const yBack = 2.55;
  const yFront = 2.85;
  const zBack = -0.75;
  const zFront = 0.95;
  for (let i = 0; i <= bays; i++) {
    const x = -half + (i * length) / bays;
    b.box([x, 0, -0.62], [0.1, yBack + 0.05, 0.1], { alb: frame, kind: K_STAINLESS }, { bottom: null, top: null });
    // 悬臂：柱顶斜向路边的扁钢梁
    b.quad([x - 0.04, yBack - 0.05, -0.62], [x - 0.04, yFront - 0.1, zFront - 0.1], [x - 0.04, yFront - 0.02, zFront - 0.1], [x - 0.04, yBack + 0.05, -0.62], { alb: frame });
    if (type === 0 && i < bays) b.box([x + length / bays / 2, 2.32, -0.62], [length / bays - 0.1, 0.05, 0.05], { alb: frame }, { bottom: null });
  }
  // 斜顶棚：上下两面都是百叶（uv 以米计）
  const roof = (y0: number, y1: number, top: boolean) => {
    const f: Face = { alb: linearRGB('#7d8287'), kind: K_LOUVRE, em: top ? [0, 0, 0] : scale3(tube, 0.04) };
    const uv: [number, number][] = [
      [0, 0],
      [length + 0.3, 0],
      [length + 0.3, 1.7],
      [0, 1.7],
    ];
    if (top) b.quad([-half - 0.15, y0, zBack], [half + 0.15, y0, zBack], [half + 0.15, y1, zFront], [-half - 0.15, y1, zFront], f, uv);
    else b.quad([half + 0.15, y0, zBack], [-half - 0.15, y0, zBack], [-half - 0.15, y1, zFront], [half + 0.15, y1, zFront], f, uv);
  };
  roof(yBack + 0.06, yFront + 0.06, true);
  roof(yBack, yFront, false);
  // 前檐（0.12 m 灰色铝板）与后檐
  b.quad([-half - 0.15, yFront - 0.06, zFront], [half + 0.15, yFront - 0.06, zFront], [half + 0.15, yFront + 0.08, zFront], [-half - 0.15, yFront + 0.08, zFront], { alb: linearRGB('#a9adb0') });
  // 棚底冷白灯管
  const zt = 0.1;
  const yt = yBack + ((zt - zBack) / (zFront - zBack)) * (yFront - yBack) - 0.03;
  b.quad([-half + 0.3, yt, zt - 0.05], [half - 0.3, yt, zt - 0.05], [half - 0.3, yt, zt + 0.05], [-half + 0.3, yt, zt + 0.05], { alb: [0.6, 0.6, 0.6], em: tube });
  // 玻璃背板（uv 以米计：着色器画磨砂带与竖框）
  b.quad([half, 0.12, -0.6], [-half, 0.12, -0.6], [-half, 2.4, -0.6], [half, 2.4, -0.6], glass, [
    [0, 0],
    [length, 0],
    [length, 2.28],
    [0, 2.28],
  ]);
  // −x 端广告灯箱（冷色调虚构广告：抽象色块，aux = 种子），不锈钢框
  const lx = -half + 0.12;
  b.box([lx, 0.15, 0.08], [0.26, 2.0, 1.4], { alb: frame, kind: K_STAINLESS }, { bottom: null });
  const lb: Face = { alb: [0.3, 0.3, 0.3], em: scale3(lightColour('#a8e6e4').toArray() as unknown as V3, 1.7), kind: K_LIGHTBOX, useAux: true };
  b.quad([lx - 0.14, 0.25, -0.53], [lx - 0.14, 0.25, 0.7], [lx - 0.14, 2.08, 0.7], [lx - 0.14, 2.08, -0.53], lb);
  b.quad([lx + 0.14, 0.25, 0.7], [lx + 0.14, 0.25, -0.53], [lx + 0.14, 2.08, -0.53], [lx + 0.14, 2.08, 0.7], lb);
  // 木面倚靠长凳（0.75 m 高、略向后倾）+ 两支撑
  const bl = Math.min(length - 1.6, 4.5);
  const wood = linearRGB('#6b4a33');
  b.box([0.3, 0.7, -0.42], [bl, 0.08, 0.26], { alb: wood }, { bottom: { alb: wood } });
  for (const x of [0.3 - bl / 2 + 0.3, 0.3 + bl / 2 - 0.3]) b.box([x, 0, -0.5], [0.06, 0.7, 0.06], { alb: frame }, { bottom: null, top: null });
  // +x 端棚下的实时到站屏（两面）
  const sx = half - 0.9;
  b.box([sx, 2.0, 0.2], [0.07, 0.42, 0.95], { alb: [0.02, 0.02, 0.022] }, { bottom: null });
  b.quad([sx + 0.036, 2.04, 0.62], [sx + 0.036, 2.04, -0.22], [sx + 0.036, 2.38, -0.22], [sx + 0.036, 2.38, 0.62], { alb: [0.01, 0.01, 0.01], kind: K_LCD });
  b.quad([sx - 0.036, 2.04, -0.22], [sx - 0.036, 2.04, 0.62], [sx - 0.036, 2.38, 0.62], [sx - 0.036, 2.38, -0.22], { alb: [0.01, 0.01, 0.01], kind: K_LCD });
  b.box([sx, 2.42, 0.2], [0.03, yBack + 0.25 - 2.42, 0.03], { alb: frame }, { bottom: null, top: null });
  return b.template();
}

/** 图集字牌的四角 uv（从正面看：左下、右下、右上、左上）。 */
function atlasUv(r: AtlasRect): [number, number][] {
  return [
    [r.u0, r.v0],
    [r.u1, r.v0],
    [r.u1, r.v1],
    [r.u0, r.v1],
  ];
}

/**
 * 双面字牌（局部：牌面在 x = x0 的 y–z 平面，宽 z0→z1、高 y0→y1）：+x 面与 −x 面各一块，两面都正着读。
 * rect 为 null 时退成纯色（avg）。em：背光牌的发光倍率（0 = 只反光）。
 */
export function addAtlasSign(b: LifeBuilder, x0: number, y0: number, y1: number, z0: number, z1: number, rect: AtlasRect | null, avg: V3, em = 0, thick = 0.03): void {
  const face: Face = rect ? { alb: avg, em: [em, em, em], kind: K_ATLAS } : { alb: avg, em: scale3(avg, em) };
  const uv = rect ? atlasUv(rect) : undefined;
  const t = thick / 2 + 0.002;
  // +x 面：从 +x 看，左→右 = −z
  b.quad([x0 + t, y0, z1], [x0 + t, y0, z0], [x0 + t, y1, z0], [x0 + t, y1, z1], face, uv);
  // −x 面：从 −x 看，左→右 = +z
  b.quad([x0 - t, y0, z0], [x0 - t, y0, z1], [x0 - t, y1, z1], [x0 - t, y1, z0], face, uv);
  b.box([x0, y0 - 0.01, (z0 + z1) / 2], [thick, y1 - y0 + 0.02, Math.abs(z1 - z0) + 0.02], { alb: linearRGB('#5c6166') }, { bottom: null, px: null, nx: null });
}

/** 站牌绕杆转的角度（弧度，约 35°）。 */
export const FLAG_TURN_RAD = 0.61;

/** 把 src 的面绕竖轴（局部 x = cx、z = cz）转 a 弧度后并进 dst（x' = x cos a + z sin a，z' = −x sin a + z cos a）。 */
export function appendRotated(dst: LifeBuilder, src: LifeBuilder, a: number, cx: number, cz: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const base = dst.vertexCount;
  for (let v = 0; v < src.vertexCount; v++) {
    const x = src.pos[v * 3]! - cx;
    const z = src.pos[v * 3 + 2]! - cz;
    dst.pos.push(cx + x * c + z * s, src.pos[v * 3 + 1]!, cz - x * s + z * c);
    const nx = src.nrm[v * 3]!;
    const nz = src.nrm[v * 3 + 2]!;
    dst.nrm.push(nx * c + nz * s, src.nrm[v * 3 + 1]!, -nx * s + nz * c);
    for (let k = 0; k < 3; k++) {
      dst.alb.push(src.alb[v * 3 + k]!);
      dst.em.push(src.em[v * 3 + k]!);
      dst.k.push(src.k[v * 3 + k]!);
    }
    dst.uv.push(src.uv[v * 2]!, src.uv[v * 2 + 1]!);
    dst.useAux.push(src.useAux[v]!);
  }
  for (const i of src.index) dst.index.push(i + base);
}

/**
 * 巴士 / 小巴站牌（局部：+x 下游 = 车头停的一端，+z 朝路）：灰杆 3.0 m，牌面垂直于路缘（0.6 × 0.45 m，离地 2.3–2.75 m，
 * 两面都印），下面一支实时资讯柱（暗色箱、背光屏）。小巴站牌（gmb）是 1.0 × 0.5 m（方牌 + 路线圆牌）。
 */
export function stopFlagTemplate(rect: AtlasRect | null, gmb: boolean, avg: V3): Template {
  const b = new LifeBuilder();
  const z = 0.55;
  b.box([0, 0, z], [0.08, 3.0, 0.08], { alb: POLE }, { bottom: null });
  // 牌面绕杆转 FLAG_TURN_RAD：迎着来车的一面略朝马路（对面街上看得到字，不是正侧面一条线）
  const f = new LifeBuilder();
  if (gmb) addAtlasSign(f, 0, 2.2, 2.7, z - 1.02, z - 0.02, rect, avg, 0.05);
  else addAtlasSign(f, 0, 2.3, 2.75, z - 0.62, z - 0.02, rect, avg, 0.05);
  appendRotated(b, f, FLAG_TURN_RAD, 0, z);
  // 实时资讯柱
  b.box([0.0, 0, z - 0.5], [0.16, 1.75, 0.32], { alb: [0.04, 0.045, 0.05] }, { bottom: null });
  const tt: Face = { alb: [0.2, 0.2, 0.2], kind: K_LCD };
  b.quad([0.081, 1.0, z - 0.36], [0.081, 1.0, z - 0.64], [0.081, 1.6, z - 0.64], [0.081, 1.6, z - 0.36], tt);
  b.quad([-0.081, 1.0, z - 0.64], [-0.081, 1.0, z - 0.36], [-0.081, 1.6, z - 0.36], [-0.081, 1.6, z - 0.64], tt);
  return b.template();
}

/**
 * 电车站名牌（局部 = 站岛坐标：x 沿行驶方向、z 朝轨道）：站岛两端（xs 列出的位置）各一支杆 + 1.0 × 0.5 m 双面牌
 * （深绿底白字 + 白框站号），背光 0.6。
 */
export function tramPlateTemplate(rect: AtlasRect | null, xs: readonly number[], zPost: number, base: number): Template {
  const b = new LifeBuilder();
  for (const x of xs) {
    b.box([x, base, zPost], [0.08, 2.6, 0.08], { alb: POLE }, { bottom: null });
    addAtlasSign(b, x, base + 1.95, base + 2.45, zPost + 0.04, zPost + 1.04, rect, linearRGB('#2b4f42'), 0.6);
  }
  return b.template();
}

/**
 * 电车站岛灯箱广告墙（照片 13；局部 = 站岛坐标）：车道一侧整条 1.5 m 高的背光灯箱（离台面 0.25 m），
 * 遮篷檐口一条 0.6 m 白色檐板（底边绿带，不发光），中间是透空的玻璃缝。两面各自画（字都正读），虚构广告见 life-material kind 12。
 */
export function islandAdTemplate(len: number, canopyLen: number, hw: number, base: number, canopyY: number, seed: number): Template {
  const b = new LifeBuilder();
  const z = -hw + 0.12;
  const x0 = -len / 2;
  const x1 = len / 2;
  const em = 1.9;
  const wall = (zz: number, sgn: number, sd: number, ya: number, yb: number, xa: number, xb: number) => {
    const f: Face = { alb: [0.2, 0.2, 0.2], em: [em, em, em], kind: K_ADWALL, aux: sd };
    const L = xb - xa;
    const H = yb - ya;
    // sgn = −1：朝 −z（车道）；从 −z 看，左→右 = −x
    if (sgn < 0)
      b.quad([xb, ya, zz], [xa, ya, zz], [xa, yb, zz], [xb, yb, zz], f, [
        [0, 0],
        [L, 0],
        [L, H],
        [0, H],
      ]);
    else
      b.quad([xa, ya, zz], [xb, ya, zz], [xb, yb, zz], [xa, yb, zz], f, [
        [0, 0],
        [L, 0],
        [L, H],
        [0, H],
      ]);
  };
  const steel = linearRGB('#6f7478');
  // 灯箱墙：框（顶、底、两端）+ 两面灯片
  b.box([0, base + 0.2, z], [len + 0.1, 0.05, 0.16], { alb: steel }, { bottom: null });
  b.box([0, base + 1.75, z], [len + 0.1, 0.06, 0.16], { alb: steel }, { bottom: null });
  for (const x of [x0 - 0.03, x1 + 0.03]) b.box([x, base, z], [0.06, 1.81, 0.16], { alb: steel }, { bottom: null });
  wall(z - 0.07, -1, seed, base + 0.25, base + 1.75, x0, x1);
  wall(z + 0.07, 1, (seed + 0.37) % 1, base + 0.25, base + 1.75, x0, x1);
  // 檐口（车道一侧）。复审修正（R2 照片 10）：0.6 m 的白色檐板 + 底边一道绿色细带，不发光（原来是一条亮着的广告灯带，
  // 比灯箱还抢眼）；夜里靠路灯与遮篷下的灯管照着
  const zf = -hw - 0.12;
  const xa = -canopyLen / 2;
  const xb = canopyLen / 2;
  const fasciaW: Face = { alb: linearRGB('#d9dbd8') };
  const fasciaG: Face = { alb: linearRGB('#2f6b4a') };
  b.quad([xb, canopyY + 0.12, zf], [xa, canopyY + 0.12, zf], [xa, canopyY + 0.6, zf], [xb, canopyY + 0.6, zf], fasciaW);
  b.quad([xb, canopyY, zf], [xa, canopyY, zf], [xa, canopyY + 0.12, zf], [xb, canopyY + 0.12, zf], fasciaG);
  return b.template();
}

/** 近处设施合并网格。 */
export class NearFurniture {
  readonly mesh: Mesh;
  private readonly geo = new BufferGeometry();
  private readonly a: Record<'pos' | 'nrm' | 'alb' | 'em' | 'uv' | 'k', BufferAttribute>;
  private readonly idx: BufferAttribute;
  private lastX = Infinity;
  private lastY = 0;
  private lastZ = 0;
  private readonly cells = new Map<number, number[]>();
  private static readonly CELL = 50;
  /** 上次写了多少个设施 / 三角形（调试）。 */
  drawnItems = 0;
  drawnTris = 0;

  constructor(
    private readonly templates: readonly Template[],
    private readonly items: readonly FurnitureItem[],
    material: Material,
    private readonly capVerts: number,
    private readonly capIndex: number,
    name: string,
    private readonly moveM = 20,
  ) {
    const mk = (n: number, k: number) => {
      const b = new BufferAttribute(new Float32Array(n * k), k);
      b.setUsage(DynamicDrawUsage);
      return b;
    };
    this.a = { pos: mk(capVerts, 3), nrm: mk(capVerts, 3), alb: mk(capVerts, 3), em: mk(capVerts, 3), uv: mk(capVerts, 2), k: mk(capVerts, 3) };
    this.geo.setAttribute('position', this.a.pos);
    this.geo.setAttribute('normal', this.a.nrm);
    this.geo.setAttribute('aAlb', this.a.alb);
    this.geo.setAttribute('aEm', this.a.em);
    this.geo.setAttribute('aUv', this.a.uv);
    this.geo.setAttribute('aK', this.a.k);
    this.idx = new BufferAttribute(new Uint32Array(capIndex), 1);
    this.idx.setUsage(DynamicDrawUsage);
    this.geo.setIndex(this.idx);
    this.geo.setDrawRange(0, 0);
    this.mesh = new Mesh(this.geo, material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    const c = NearFurniture.CELL;
    items.forEach((it, i) => {
      const k = Math.floor(it.x / c) * 65536 + Math.floor(it.z / c);
      const list = this.cells.get(k);
      if (list) list.push(i);
      else this.cells.set(k, [i]);
    });
  }

  update(camera: Camera): void {
    const p = camera.position;
    if (Math.hypot(p.x - this.lastX, p.y - this.lastY, p.z - this.lastZ) < this.moveM) return;
    this.lastX = p.x;
    this.lastY = p.y;
    this.lastZ = p.z;
    let maxR = 0;
    for (const it of this.items) maxR = Math.max(maxR, it.maxD);
    const c = NearFurniture.CELL;
    let nv = 0;
    let ni = 0;
    let count = 0;
    const A = this.a;
    const pos = A.pos.array as Float32Array;
    const nrm = A.nrm.array as Float32Array;
    const alb = A.alb.array as Float32Array;
    const em = A.em.array as Float32Array;
    const uv = A.uv.array as Float32Array;
    const kk = A.k.array as Float32Array;
    const idx = this.idx.array as Uint32Array;
    const reach = Math.min(maxR, Math.max(0, maxR - Math.max(0, p.y - 300)));
    for (let gx = Math.floor((p.x - reach) / c); gx <= Math.floor((p.x + reach) / c); gx++) {
      for (let gz = Math.floor((p.z - reach) / c); gz <= Math.floor((p.z + reach) / c); gz++) {
        for (const i of this.cells.get(gx * 65536 + gz) ?? []) {
          const it = this.items[i]!;
          const dx = it.x - p.x;
          const dy = it.y - p.y;
          const dz = it.z - p.z;
          if (dx * dx + dy * dy + dz * dz > it.maxD * it.maxD) continue;
          const t = this.templates[it.t]!;
          const vn = t.pos.length / 3;
          if (nv + vn > this.capVerts || ni + t.index.length > this.capIndex) continue;
          // 局部 x → (dx, dz)，局部 z → (−dz, dx)
          const ax = it.dx;
          const az = it.dz;
          for (let v = 0; v < vn; v++) {
            const lx = t.pos[v * 3]! * it.sx;
            const ly = t.pos[v * 3 + 1]!;
            const lz = t.pos[v * 3 + 2]!;
            const o = (nv + v) * 3;
            pos[o] = it.x + lx * ax - lz * az;
            pos[o + 1] = it.y + ly;
            pos[o + 2] = it.z + lx * az + lz * ax;
            const nx = t.nrm[v * 3]!;
            const nz = t.nrm[v * 3 + 2]!;
            nrm[o] = nx * ax - nz * az;
            nrm[o + 1] = t.nrm[v * 3 + 1]!;
            nrm[o + 2] = nx * az + nz * ax;
            alb[o] = t.alb[v * 3]!;
            alb[o + 1] = t.alb[v * 3 + 1]!;
            alb[o + 2] = t.alb[v * 3 + 2]!;
            em[o] = t.em[v * 3]!;
            em[o + 1] = t.em[v * 3 + 1]!;
            em[o + 2] = t.em[v * 3 + 2]!;
            uv[(nv + v) * 2] = t.uv[v * 2]! * (t.scaleUvX ? it.sx : 1);
            uv[(nv + v) * 2 + 1] = t.uv[v * 2 + 1]!;
            kk[o] = t.k[v * 3]!;
            kk[o + 1] = t.useAux[v] ? it.aux : t.k[v * 3 + 1]!;
            kk[o + 2] = t.k[v * 3 + 2]!;
          }
          for (let j = 0; j < t.index.length; j++) idx[ni + j] = t.index[j]! + nv;
          nv += vn;
          ni += t.index.length;
          count++;
        }
      }
    }
    for (const a of Object.values(A)) {
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, nv * a.itemSize);
    }
    this.idx.needsUpdate = true;
    this.idx.clearUpdateRanges();
    this.idx.addUpdateRange(0, ni);
    this.geo.setDrawRange(0, ni);
    this.mesh.visible = ni > 0;
    this.drawnItems = count;
    this.drawnTris = ni / 3;
  }
}

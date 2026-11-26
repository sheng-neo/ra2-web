/**
 * 街道设施网格（R2 STREETLIFE S2/S3/S4）：栏杆、护柱、行人灯杆、巴士站候车亭、站牌、垃圾桶、消防栓。
 * 全部合并成一个网格（一个 draw call，life-material）：每种设施一个局部模板，相机移动 > 20 m 时
 * 把半径内的设施（各类有各自的最远距离）变换后写进预分配的动态缓冲（drawRange 截断）。
 * 模板局部坐标：米，+x 为设施朝向，y 向上，z 为左右；栏杆模板长 1 m，按片长沿 x 缩放（uv.x 随之按米计）。
 */
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, type Camera, type Material } from 'three';
import { linearRGB, scale3, type V3 } from './prop-geometry';
import { lightColour } from '../materials/lighting';

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
 * 候车亭（长 L，沿 +x 居中，+z 朝路）：
 * type 0 弧顶——1.9 m 一跨的白 / 淡紫拱架、半透明弧形顶（三折）、背板，棚底冷白光带；
 * type 1 平顶——2.6 m 一跨的平顶棚（2.6 m 高）、玻璃背板、一端 1.2 × 1.8 m 抽象色块灯箱。
 * 外加站牌（空白路线牌 + 亮着的空白时间表箱）。≤ 250 个三角形。
 */
export function shelterTemplate(type: 0 | 1, length: number): Template {
  const b = new LifeBuilder();
  const tube = scale3(lightColour('tubeCool').toArray() as unknown as V3, 1.1);
  const glass: Face = { alb: [0.05, 0.06, 0.065], kind: K_GLASS };
  const half = length / 2;
  if (type === 0) {
    const bays = Math.round(length / 1.9);
    const roofY = [2.35, 2.62, 2.7, 2.6];
    const roofZ = [0.75, 0.35, -0.15, -0.6];
    for (let i = 0; i <= bays; i++) {
      const x = -half + (i * length) / bays;
      const col = i % 2 === 0 ? linearRGB('#d8d8d4') : linearRGB('#b9a9c4');
      // 拱架：背柱 + 前柱（细）
      b.box([x, 0, -0.62], [0.08, 2.6, 0.08], { alb: col }, { bottom: null, top: null });
      b.box([x, 0, 0.7], [0.06, 2.33, 0.06], { alb: col }, { bottom: null, top: null });
    }
    // 弧顶三折（双面）
    for (let k = 0; k < 3; k++) {
      b.quad([-half, roofY[k]!, roofZ[k]!], [half, roofY[k]!, roofZ[k]!], [half, roofY[k + 1]!, roofZ[k + 1]!], [-half, roofY[k + 1]!, roofZ[k + 1]!], { alb: linearRGB('#8f9aa3') });
    }
    // 棚底光带
    b.quad([-half + 0.2, 2.6, -0.1], [half - 0.2, 2.6, -0.1], [half - 0.2, 2.62, -0.35], [-half + 0.2, 2.62, -0.35], { alb: [0.6, 0.6, 0.6], em: tube });
    // 背板：一格一块浅米色板（照片 16），离地 0.3–2.0 m，格间留缝
    for (let i = 0; i < bays; i++) {
      const xa = -half + (i * length) / bays + 0.1;
      const xb = -half + ((i + 1) * length) / bays - 0.1;
      b.quad([xb, 0.3, -0.64], [xa, 0.3, -0.64], [xa, 2.0, -0.64], [xb, 2.0, -0.64], { alb: linearRGB('#a08f6c') });
    }
  } else {
    const bays = Math.round(length / 2.6);
    for (let i = 0; i <= bays; i++) {
      const x = -half + (i * length) / bays;
      b.box([x, 0, -0.55], [0.1, 2.6, 0.1], { alb: linearRGB('#3c4247') }, { bottom: null, top: null });
    }
    // 平顶（厚 0.18 m，底面亮）
    b.box([0, 2.6, 0.05], [length + 0.3, 0.18, 1.6], { alb: linearRGB('#c4c7c9') }, { bottom: { alb: [0.5, 0.5, 0.5], em: scale3(tube, 0.55) } });
    // 玻璃背板（uv 以米计：着色器画磨砂带与竖框）
    b.quad([half, 0.12, -0.55], [-half, 0.12, -0.55], [-half, 2.5, -0.55], [half, 2.5, -0.55], glass, [
      [0, 0],
      [length, 0],
      [length, 2.38],
      [0, 2.38],
    ]);
    // 端头灯箱（抽象色块，aux = 种子）
    b.box([half - 0.05, 0.25, 0.05], [0.25, 1.85, 1.25], { alb: [0.05, 0.05, 0.05] }, { bottom: null });
    const lb: Face = { alb: [0.3, 0.3, 0.3], em: scale3(lightColour('lightboxWhite').toArray() as unknown as V3, 1.5), kind: K_LIGHTBOX, useAux: true };
    b.quad([half + 0.08, 0.35, 0.62], [half + 0.08, 0.35, -0.52], [half + 0.08, 2.0, -0.52], [half + 0.08, 2.0, 0.62], lb);
    b.quad([half - 0.18, 0.35, -0.52], [half - 0.18, 0.35, 0.62], [half - 0.18, 2.0, 0.62], [half - 0.18, 2.0, -0.52], lb);
  }
  // 长凳
  b.box([0, 0.42, -0.35], [Math.min(length - 1, 3.5), 0.06, 0.38], { alb: linearRGB('#7a7f84') }, { bottom: null });
  // 站牌：杆 + 空白路线牌（只有一条色带）+ 亮着的空白时间表箱
  const px = -half - 0.6;
  b.box([px, 0, 0.55], [0.08, 3.1, 0.08], { alb: POLE }, { bottom: null });
  b.box([px, 2.45, 0.55], [0.06, 0.6, 0.5], { alb: linearRGB('#e8e8e4') }, { bottom: null });
  b.box([px + 0.04, 2.95, 0.55], [0.03, 0.08, 0.5], { alb: linearRGB('#b0283a') }, { bottom: null, top: null });
  b.box([px, 1.0, 0.55], [0.14, 0.75, 0.55], { alb: [0.04, 0.04, 0.04] }, { bottom: null });
  const tt: Face = { alb: [0.4, 0.4, 0.4], em: scale3(lightColour('lightboxWhite').toArray() as unknown as V3, 1.15) };
  b.quad([px + 0.075, 1.05, 0.8], [px + 0.075, 1.05, 0.3], [px + 0.075, 1.7, 0.3], [px + 0.075, 1.7, 0.8], tt);
  b.quad([px - 0.075, 1.05, 0.3], [px - 0.075, 1.05, 0.8], [px - 0.075, 1.7, 0.8], [px - 0.075, 1.7, 0.3], tt);
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

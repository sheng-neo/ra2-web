/**
 * 程序化建模工具：把回转体 / 路径管 / 倒角盒 / 多面晶体 / 挤出板 / 布片等基本形体写进同一条带蒙皮信息的顶点流。
 *
 * 模型空间约定：+Z 朝前，+Y 朝上，+X 是角色的左手侧；单位米；原点在两脚之间的地面上。
 * 顶点格式：position / normal / color(线性) / aFx(x=高光强度 y=自发光 z=队伍色蒙版 w=AO) / aSkin(骨骼0, 骨骼1, 骨骼0 的权重)
 *   / aMat(x=纹样号/8 y=每米格数/32 z=纹样强度 w=材质类别/8；见 MAT / PATTERN，着色器侧在 shading.ts)。
 * 法线按「折痕角」自动处理：相邻面夹角小于折痕角的平滑过渡，大于的保留硬边——所以倒角盒/晶体自然是切面，
 * 肢体/布料自然是圆润的，不需要每个形体单独操心。
 */
import * as THREE from 'three';

export type RGB = [number, number, number];
export type Col = number | string | RGB;

const DEG = Math.PI / 180;
const _c = new THREE.Color();

/** sRGB 十六进制/字符串 → 线性 RGB */
export function lin(c: Col): RGB {
  if (Array.isArray(c)) return c;
  _c.set(c);
  return [_c.r, _c.g, _c.b];
}

export function mixCol(a: Col, b: Col, t: number): RGB {
  const x = lin(a);
  const y = lin(b);
  return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
}

/** 明度缩放(线性空间) */
export function shade(c: Col, k: number): RGB {
  const x = lin(c);
  return [x[0] * k, x[1] * k, x[2] * k];
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const sat = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 构造一个 TRS 矩阵(角度单位：度；旋转顺序 YXZ，与姿态系统一致) */
export function X(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * DEG, ry * DEG, rz * DEG, 'YXZ'));
  return m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
}

/**
 * 材质类别(写进 aMat.w)：决定着色器里的明暗软硬、高光宽窄、透射等。
 * 不指定时按 gloss / glow 推断(见 ModelBuilder.paint)，所以旧模型不改也能得到大致正确的分类。
 */
export const MAT = { cloth: 0, skin: 1, leather: 2, metal: 3, crystal: 4, fur: 5, rock: 6 } as const;
export type MatClass = (typeof MAT)[keyof typeof MAT];

/** 程序纹样号(写进 aMat.x)：在绑定姿态的物体空间里由着色器计算，不用贴图 */
export const PATTERN = { none: 0, scale: 1, strata: 2, fur: 3, weave: 4, bark: 5, lava: 6, vein: 7, meteor: 8 } as const;
export type PatternId = (typeof PATTERN)[keyof typeof PATTERN];

/** 自定义渐变参数：入参为模型空间位置、形体自带的渐变参数 g、模型空间法线；返回 0..1 */
export type GradFn = (x: number, y: number, z: number, g: number, nx: number, ny: number, nz: number) => number;

/** 柔性蒙皮：按顶点的模型空间位置(与形体自身的渐变参数 g)给出 [骨骼0, 骨骼1, 骨骼0 权重] */
export type SoftBind = (x: number, y: number, z: number, g: number) => [number, number, number];

export interface PaintOpts {
  /** 渐变终点色(沿形体主轴：g=0 用主色，g=1 用 c2) */
  c2?: Col;
  /** 风格化高光强度 0..1 */
  gloss?: number;
  /** 自发光 0..1(渐变终点 glow2) */
  glow?: number;
  glow2?: number;
  /** 队伍色蒙版 0..1 */
  team?: number;
  /** 环境遮蔽 0..1(渐变终点 ao2) */
  ao?: number;
  ao2?: number;
  /** 描边粗细倍率 0..1(默认 1；强发光体默认 0，五官等细节建议 0) */
  line?: number;
  /** 材质类别(MAT.*)。不给时按 gloss / glow 推断：高光强 = 金属(带发光 = 晶体)，中等 = 皮革，否则 = 布 */
  mat?: MatClass;
  /** 程序纹样(PATTERN.*)、每米格数(0..32，默认 4)、强度 0..1(默认 0.5) */
  pattern?: PatternId;
  patternScale?: number;
  patternAmt?: number;
  /** 自定义渐变参数：代替形体自带的 g 去混合 c→c2 / glow→glow2 / ao→ao2(背深腹浅、条纹、斑块等) */
  by?: GradFn;
  /** 逐顶点明度扰动幅度 0..1(毛皮、岩石、树皮的斑驳感；同一位置的顶点扰动相同) */
  grain?: number;
}

export interface LatheOpts {
  /** 周向分段 */
  seg?: number;
  /** 超椭圆指数：2 = 椭圆，越大越方 */
  power?: number;
  /** 起始角(度)：seg=4 时 0 得到菱形截面，45 得到方形截面 */
  phase?: number;
  cap0?: boolean;
  cap1?: boolean;
  /** 截面半径调制(角度弧度, 环序号) → 倍率：褶皱/棱/齿 */
  shape?: (theta: number, ring: number) => number;
  crease?: number;
}

export interface TubeOpts extends LatheOpts {
  /** 截面「左」方向的参考向量(默认 +X；路径与它平行时自动换成 +Z) */
  up?: [number, number, number];
  /** 首尾相接成环 */
  closed?: boolean;
}

interface IcoData {
  v: number[];
  t: number[];
}
const icoCache = new Map<number, IcoData>();

function icosphere(detail: number): IcoData {
  let d = icoCache.get(detail);
  if (d) return d;
  const t = (1 + Math.sqrt(5)) / 2;
  const v: number[] = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  for (let i = 0; i < v.length; i += 3) {
    const l = Math.hypot(v[i], v[i + 1], v[i + 2]);
    v[i] /= l;
    v[i + 1] /= l;
    v[i + 2] /= l;
  }
  let tris = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  for (let s = 0; s < detail; s++) {
    const mid = new Map<number, number>();
    const midpoint = (a: number, b: number): number => {
      const k = a < b ? a * 65536 + b : b * 65536 + a;
      let m = mid.get(k);
      if (m === undefined) {
        const x = v[a * 3] + v[b * 3];
        const y = v[a * 3 + 1] + v[b * 3 + 1];
        const z = v[a * 3 + 2] + v[b * 3 + 2];
        const l = Math.hypot(x, y, z);
        m = v.length / 3;
        v.push(x / l, y / l, z / l);
        mid.set(k, m);
      }
      return m;
    };
    const next: number[] = [];
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i];
      const b = tris[i + 1];
      const c = tris[i + 2];
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    tris = next;
  }
  d = { v, t: tris };
  icoCache.set(detail, d);
  return d;
}

const superCos = (a: number, p: number): number => {
  const c = Math.cos(a);
  return p === 2 ? c : Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
};
const superSin = (a: number, p: number): number => {
  const s = Math.sin(a);
  return p === 2 ? s : Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
};

function posHash(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class ModelBuilder {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];
  readonly fx: number[] = [];
  readonly skin: number[] = [];
  readonly line: number[] = [];
  /** aMat：每顶点 4 个 0..1 的数(纹样号/8, 每米格数/32, 强度, 类别/8) */
  readonly mat: number[] = [];
  readonly idx: number[] = [];

  /** 默认折痕角(度) */
  crease = 40;
  /** 表面粗糙扰动(米)：按位置散列给顶点一个固定偏移，岩石/晶体不再是规整的几何体。同一位置的顶点偏移相同，不会裂缝 */
  rough = 0;

  private c: RGB = [1, 1, 1];
  private c2: RGB | null = null;
  private gloss = 0;
  private glow = 0;
  private glow2 = -1;
  private team = 0;
  private ao = 1;
  private ao2 = -1;
  private lineW = 1;
  private matX = 0;
  private matY = 0;
  private matZ = 0;
  private matW = 0;
  private by: GradFn | null = null;
  private grain = 0;
  private boneId = 0;
  private soft: SoftBind | null = null;
  private m = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }
  get triangleCount(): number {
    return this.idx.length / 3;
  }

  // ───────────── 绘制状态 ─────────────

  /** 设定之后形体的表面属性(每次调用都完整覆盖，不会残留上一次的渐变/发光) */
  paint(c: Col, o: PaintOpts = {}): this {
    this.c = lin(c);
    this.c2 = o.c2 !== undefined ? lin(o.c2) : null;
    this.gloss = o.gloss ?? 0;
    this.glow = o.glow ?? 0;
    this.glow2 = o.glow2 ?? -1;
    this.team = o.team ?? 0;
    this.ao = o.ao ?? 1;
    this.ao2 = o.ao2 ?? -1;
    this.lineW = o.line ?? (this.glow > 0.5 ? 0 : 1);
    const cls = o.mat ?? (this.gloss >= 0.75 ? (this.glow > 0.05 ? MAT.crystal : MAT.metal) : this.gloss >= 0.3 ? MAT.leather : MAT.cloth);
    const pat = o.pattern ?? 0;
    this.matX = pat / 8;
    this.matY = pat > 0 ? sat((o.patternScale ?? 4) / 32) : 0;
    this.matZ = pat > 0 ? sat(o.patternAmt ?? 0.5) : 0;
    this.matW = cls / 8;
    this.by = o.by ?? null;
    this.grain = o.grain ?? 0;
    return this;
  }

  /** 之后的形体刚性绑定到该骨骼 */
  bone(id: number): this {
    this.boneId = id;
    this.soft = null;
    return this;
  }

  /** 之后的形体按函数做双骨骼混合绑定(布料/头发/软关节) */
  bind(fn: SoftBind): this {
    this.soft = fn;
    return this;
  }

  /** 在叠加的局部变换下执行 fn */
  g(xf: THREE.Matrix4, fn: () => void): this {
    this.stack.push(this.m.clone());
    this.m.multiply(xf);
    fn();
    this.m.copy(this.stack.pop() as THREE.Matrix4);
    return this;
  }

  /** 左右对称：fn(1) 画左侧(+X)，fn(-1) 在镜像变换下画右侧 */
  sym(fn: (side: 1 | -1) => void): this {
    fn(1);
    this.g(new THREE.Matrix4().makeScale(-1, 1, 1), () => fn(-1));
    return this;
  }

  // ───────────── 写入核心 ─────────────

  /**
   * 写入一批三角形。P：局部坐标；T：三角形下标(逆时针朝外)；G：每顶点的渐变参数 0..1。
   * 这里统一做变换、镜像翻面、按折痕角拆分法线、上色与蒙皮。
   */
  emit(P: number[], T: number[], G: number[] | null = null, crease = this.crease): void {
    const n = P.length / 3;
    const e = this.m.elements;
    const flip = this.m.determinant() < 0;
    const W = new Float32Array(P.length);
    for (let i = 0; i < n; i++) {
      const x = P[i * 3];
      const y = P[i * 3 + 1];
      const z = P[i * 3 + 2];
      W[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      W[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      W[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (this.rough > 0) {
        const qx = Math.round(W[i * 3] * 400);
        const qy = Math.round(W[i * 3 + 1] * 400);
        const qz = Math.round(W[i * 3 + 2] * 400);
        W[i * 3] += (posHash(qx, qy, qz, 1) - 0.5) * 2 * this.rough;
        W[i * 3 + 1] += (posHash(qx, qy, qz, 2) - 0.5) * 2 * this.rough;
        W[i * 3 + 2] += (posHash(qx, qy, qz, 3) - 0.5) * 2 * this.rough;
      }
    }
    const tc = T.length / 3;
    const tri = new Int32Array(T.length);
    const FN = new Float32Array(T.length);
    const FU = new Float32Array(T.length);
    const ok = new Uint8Array(tc);
    for (let f = 0; f < tc; f++) {
      const a = T[f * 3];
      const b = flip ? T[f * 3 + 2] : T[f * 3 + 1];
      const c = flip ? T[f * 3 + 1] : T[f * 3 + 2];
      tri[f * 3] = a;
      tri[f * 3 + 1] = b;
      tri[f * 3 + 2] = c;
      const ux = W[b * 3] - W[a * 3];
      const uy = W[b * 3 + 1] - W[a * 3 + 1];
      const uz = W[b * 3 + 2] - W[a * 3 + 2];
      const vx = W[c * 3] - W[a * 3];
      const vy = W[c * 3 + 1] - W[a * 3 + 1];
      const vz = W[c * 3 + 2] - W[a * 3 + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-10) continue;
      ok[f] = 1;
      // FN：面积加权法线；FU：单位法线(折痕判断用)
      FN[f * 3] = nx;
      FN[f * 3 + 1] = ny;
      FN[f * 3 + 2] = nz;
      FU[f * 3] = nx / l;
      FU[f * 3 + 1] = ny / l;
      FU[f * 3 + 2] = nz / l;
    }
    // 顶点 → 相邻面
    const start = new Int32Array(n + 1);
    for (let f = 0; f < tc; f++) if (ok[f]) for (let k = 0; k < 3; k++) start[tri[f * 3 + k] + 1]++;
    for (let i = 0; i < n; i++) start[i + 1] += start[i];
    const fill = start.slice(0, n);
    const adj = new Int32Array(start[n]);
    for (let f = 0; f < tc; f++) if (ok[f]) for (let k = 0; k < 3; k++) adj[fill[tri[f * 3 + k]]++] = f;

    const cosT = crease >= 180 ? -2 : Math.cos(crease * DEG);
    // 每个原始顶点已经生成过的(法线, 新下标)，用于合并相同法线的角
    const made: number[][] = new Array(n);
    const base = this.pos.length / 3;
    let out = base;
    for (let f = 0; f < tc; f++) {
      if (!ok[f]) continue;
      const fx = FU[f * 3];
      const fy = FU[f * 3 + 1];
      const fz = FU[f * 3 + 2];
      for (let k = 0; k < 3; k++) {
        const v = tri[f * 3 + k];
        let nx = 0;
        let ny = 0;
        let nz = 0;
        for (let j = start[v]; j < start[v + 1]; j++) {
          const g = adj[j];
          if (g === f || fx * FU[g * 3] + fy * FU[g * 3 + 1] + fz * FU[g * 3 + 2] >= cosT) {
            nx += FN[g * 3];
            ny += FN[g * 3 + 1];
            nz += FN[g * 3 + 2];
          }
        }
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
        let list = made[v];
        if (!list) list = made[v] = [];
        let found = -1;
        for (let j = 0; j < list.length; j += 4) {
          if (list[j] * nx + list[j + 1] * ny + list[j + 2] * nz > 0.9995) {
            found = list[j + 3];
            break;
          }
        }
        if (found < 0) {
          found = out++;
          list.push(nx, ny, nz, found);
          this.writeVertex(W[v * 3], W[v * 3 + 1], W[v * 3 + 2], nx, ny, nz, G ? G[v] : 0);
        }
        this.idx.push(found);
      }
    }
  }

  private writeVertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, g0: number): void {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    const c = this.c;
    const c2 = this.c2;
    const g = this.by ? sat(this.by(x, y, z, g0, nx, ny, nz)) : g0;
    let k = 1;
    if (this.grain > 0) k = 1 + (posHash(Math.round(x * 400), Math.round(y * 400), Math.round(z * 400), 7) - 0.5) * 2 * this.grain;
    if (c2) this.col.push((c[0] + (c2[0] - c[0]) * g) * k, (c[1] + (c2[1] - c[1]) * g) * k, (c[2] + (c2[2] - c[2]) * g) * k);
    else this.col.push(c[0] * k, c[1] * k, c[2] * k);
    this.fx.push(this.gloss, this.glow2 >= 0 ? lerp(this.glow, this.glow2, g) : this.glow, this.team, this.ao2 >= 0 ? lerp(this.ao, this.ao2, g) : this.ao);
    this.line.push(this.lineW);
    this.mat.push(this.matX, this.matY, this.matZ, this.matW);
    if (this.soft) {
      const s = this.soft(x, y, z, g);
      this.skin.push(s[0], s[1], s[2]);
    } else this.skin.push(this.boneId, this.boneId, 1);
  }

  /** 把一串截面环连成蒙皮(环上点按「U→V」方向排列，V×U = 前进方向) */
  private skinRings(P: number[], G: number[], ringCount: number, seg: number, cap0: boolean, cap1: boolean, closed: boolean, crease: number | undefined, g0 = 0, g1 = 1): void {
    const T: number[] = [];
    const links = closed ? ringCount : ringCount - 1;
    for (let k = 0; k < links; k++) {
      const a = k * seg;
      const b = ((k + 1) % ringCount) * seg;
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        T.push(a + i, b + i, a + j, a + j, b + i, b + j);
      }
    }
    if (!closed) {
      if (cap0) {
        const ci = P.length / 3;
        let cx = 0;
        let cy = 0;
        let cz = 0;
        for (let i = 0; i < seg; i++) {
          cx += P[i * 3];
          cy += P[i * 3 + 1];
          cz += P[i * 3 + 2];
        }
        P.push(cx / seg, cy / seg, cz / seg);
        G.push(g0);
        for (let i = 0; i < seg; i++) T.push(ci, i, (i + 1) % seg);
      }
      if (cap1) {
        const o = (ringCount - 1) * seg;
        const ci = P.length / 3;
        let cx = 0;
        let cy = 0;
        let cz = 0;
        for (let i = 0; i < seg; i++) {
          cx += P[(o + i) * 3];
          cy += P[(o + i) * 3 + 1];
          cz += P[(o + i) * 3 + 2];
        }
        P.push(cx / seg, cy / seg, cz / seg);
        G.push(g1);
        for (let i = 0; i < seg; i++) T.push(ci, o + ((i + 1) % seg), o + i);
      }
    }
    this.emit(P, T, G, crease);
  }

  // ───────────── 基本形体 ─────────────

  /**
   * 竖直回转体：profile 每项 [y, rx, rz?, ox?, oz?]（高度、左右半径、前后半径、截面中心偏移）。
   * 躯干/头/腿/袍/罐/柱都用它。渐变参数沿 profile 从 0 到 1。
   */
  lathe(profile: number[][], o: LatheOpts = {}): this {
    const seg = o.seg ?? 10;
    const power = o.power ?? 2;
    const phase = (o.phase ?? 0) * DEG;
    const P: number[] = [];
    const G: number[] = [];
    const n = profile.length;
    for (let k = 0; k < n; k++) {
      const r = profile[k];
      const rx = r[1];
      const rz = r[2] ?? rx;
      const ox = r[3] ?? 0;
      const oz = r[4] ?? 0;
      for (let i = 0; i < seg; i++) {
        const a = phase + (i / seg) * Math.PI * 2;
        const m = o.shape ? o.shape(a, k) : 1;
        P.push(ox + superCos(a, power) * rx * m, r[0], oz + superSin(a, power) * rz * m);
        G.push(k / (n - 1));
      }
    }
    this.skinRings(P, G, n, seg, o.cap0 ?? true, o.cap1 ?? true, false, o.crease);
    return this;
  }

  /**
   * 沿路径的管：path 每项 [x, y, z, r, r2?]（r 为沿「左」参考方向的半径，r2 为另一方向）。
   * seg=4 且 r2 很小时就是带刃的菱形截面(刀/翎/鳍)。
   */
  tube(path: number[][], o: TubeOpts = {}): this {
    const seg = o.seg ?? 8;
    const power = o.power ?? 2;
    const phase = (o.phase ?? 0) * DEG;
    const closed = o.closed ?? false;
    const n = path.length;
    const P: number[] = [];
    const G: number[] = [];
    const hint = o.up ?? [1, 0, 0];
    let pux = 0;
    let puy = 0;
    let puz = 0;
    for (let k = 0; k < n; k++) {
      const p = path[k];
      const a = path[closed ? (k + n - 1) % n : Math.max(0, k - 1)];
      const b = path[closed ? (k + 1) % n : Math.min(n - 1, k + 1)];
      let tx = b[0] - a[0];
      let ty = b[1] - a[1];
      let tz = b[2] - a[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      // U = 参考方向去掉切向分量；退化时沿用上一环的 U，保证不突然翻转
      let d = hint[0] * tx + hint[1] * ty + hint[2] * tz;
      let ux = hint[0] - tx * d;
      let uy = hint[1] - ty * d;
      let uz = hint[2] - tz * d;
      let ul = Math.hypot(ux, uy, uz);
      if (ul < 0.15) {
        if (k > 0) {
          d = pux * tx + puy * ty + puz * tz;
          ux = pux - tx * d;
          uy = puy - ty * d;
          uz = puz - tz * d;
        } else {
          ux = -tz * tx;
          uy = -tz * ty;
          uz = 1 - tz * tz;
        }
        ul = Math.hypot(ux, uy, uz) || 1;
      }
      ux /= ul;
      uy /= ul;
      uz /= ul;
      pux = ux;
      puy = uy;
      puz = uz;
      // V = U × T
      const vx = uy * tz - uz * ty;
      const vy = uz * tx - ux * tz;
      const vz = ux * ty - uy * tx;
      const r1 = p[3];
      const r2 = p[4] ?? r1;
      for (let i = 0; i < seg; i++) {
        const ang = phase + (i / seg) * Math.PI * 2;
        const m = o.shape ? o.shape(ang, k) : 1;
        const cu = superCos(ang, power) * r1 * m;
        const cv = superSin(ang, power) * r2 * m;
        P.push(p[0] + ux * cu + vx * cv, p[1] + uy * cu + vy * cv, p[2] + uz * cu + vz * cv);
        G.push(closed ? k / n : k / (n - 1));
      }
    }
    this.skinRings(P, G, n, seg, o.cap0 ?? true, o.cap1 ?? true, closed, o.crease);
    return this;
  }

  /** 椭球(细分二十面体)。渐变参数自下而上 */
  ball(x: number, y: number, z: number, rx: number, ry = rx, rz = rx, detail = 1, crease?: number): this {
    const ico = icosphere(detail);
    const P: number[] = [];
    const G: number[] = [];
    for (let i = 0; i < ico.v.length; i += 3) {
      P.push(x + ico.v[i] * rx, y + ico.v[i + 1] * ry, z + ico.v[i + 2] * rz);
      G.push(ico.v[i + 1] * 0.5 + 0.5);
    }
    this.emit(P, ico.t, G, crease ?? 180);
    return this;
  }

  /** 倒角盒：中心 + 全尺寸；bevel 为倒角宽度。渐变参数自下而上 */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, bevel = 0, crease?: number): this {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const b = Math.min(bevel, hx * 0.98, hy * 0.98, hz * 0.98);
    const P: number[] = [];
    const G: number[] = [];
    const T: number[] = [];
    const h = [hx, hy, hz];
    // 顶点编号：axis*8 + (面符号)*4 + (u 符号)*2 + (v 符号)，u/v 为另外两个轴(按轴序)
    const vid = (axis: number, s: number, su: number, sv: number): number => axis * 8 + (s > 0 ? 4 : 0) + (su > 0 ? 2 : 0) + (sv > 0 ? 1 : 0);
    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      for (const s of [-1, 1]) {
        for (const su of [-1, 1]) {
          for (const sv of [-1, 1]) {
            const p = [0, 0, 0];
            p[axis] = s * h[axis];
            p[u] = su * (h[u] - b);
            p[v] = sv * (h[v] - b);
            P.push(x + p[0], y + p[1], z + p[2]);
            G.push(hy > 0 ? p[1] / (2 * hy) + 0.5 : 0);
          }
        }
      }
    }
    const c = [x, y, z];
    const poly = (ids: number[]): void => {
      // 以盒心为参考统一朝外
      let mx = 0;
      let my = 0;
      let mz = 0;
      for (const i of ids) {
        mx += P[i * 3] - c[0];
        my += P[i * 3 + 1] - c[1];
        mz += P[i * 3 + 2] - c[2];
      }
      const a = ids[0];
      const b1 = ids[1];
      const c1 = ids[2];
      const ux = P[b1 * 3] - P[a * 3];
      const uy = P[b1 * 3 + 1] - P[a * 3 + 1];
      const uz = P[b1 * 3 + 2] - P[a * 3 + 2];
      const vx = P[c1 * 3] - P[a * 3];
      const vy = P[c1 * 3 + 1] - P[a * 3 + 1];
      const vz = P[c1 * 3 + 2] - P[a * 3 + 2];
      const dot = (uy * vz - uz * vy) * mx + (uz * vx - ux * vz) * my + (ux * vy - uy * vx) * mz;
      const order = dot >= 0 ? ids : [...ids].reverse();
      for (let i = 1; i < order.length - 1; i++) T.push(order[0], order[i], order[i + 1]);
    };
    for (let axis = 0; axis < 3; axis++) for (const s of [-1, 1]) poly([vid(axis, s, -1, -1), vid(axis, s, 1, -1), vid(axis, s, 1, 1), vid(axis, s, -1, 1)]);
    if (b > 0) {
      // 12 条棱的倒角面：棱沿 w 轴，夹在 a 面与 bb 面之间
      for (let w = 0; w < 3; w++) {
        const a = (w + 1) % 3;
        const bb = (w + 2) % 3;
        for (const sa of [-1, 1]) {
          for (const sb of [-1, 1]) {
            // a 面上的顶点：u=(a+1)%3=bb, v=(a+2)%3=w；bb 面上：u=(bb+1)%3=w, v=(bb+2)%3=a
            poly([vid(a, sa, sb, -1), vid(a, sa, sb, 1), vid(bb, sb, 1, sa), vid(bb, sb, -1, sa)]);
          }
        }
      }
      // 8 个角
      for (const s0 of [-1, 1]) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) poly([vid(0, s0, s1, s2), vid(1, s1, s2, s0), vid(2, s2, s0, s1)]);
    }
    this.emit(P, T, G, crease);
    return this;
  }

  /** 多面晶体：n 棱柱两端收尖。底部在 y=0，高 h。tipTop/tipBot 为两端尖部占高度的比例 */
  crystal(r: number, h: number, sides = 6, tipTop = 0.35, tipBot = 0.18, rTop = 0.85): this {
    return this.lathe(
      [
        [0, 0.001],
        [h * tipBot, r],
        [h * (1 - tipTop), r * rTop],
        [h, 0.001],
      ],
      { seg: sides, cap0: false, cap1: false, crease: 0 },
    );
  }

  /**
   * 挤出板：outline 为局部 XY 平面内的轮廓，沿 Z 挤出 depth(居中)。bevel > 0 时正反两面内缩形成倒角。
   * 甲片/盾面/冠饰/纹章用。渐变参数按轮廓的 y 范围自下而上。
   */
  extrude(outline: number[][], depth: number, bevel = 0, crease?: number): this {
    let pts = outline;
    let area = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    if (area < 0) pts = [...pts].reverse();
    const n = pts.length;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    const gy = (y: number): number => (y1 > y0 ? (y - y0) / (y1 - y0) : 0);
    // 内缩轮廓：沿相邻两边内法线的角平分线移动(限制斜接长度)
    const inset: number[][] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[(i + n - 1) % n];
      const p = pts[i];
      const b = pts[(i + 1) % n];
      let e1x = p[0] - a[0];
      let e1y = p[1] - a[1];
      let e2x = b[0] - p[0];
      let e2y = b[1] - p[1];
      const l1 = Math.hypot(e1x, e1y) || 1;
      const l2 = Math.hypot(e2x, e2y) || 1;
      e1x /= l1;
      e1y /= l1;
      e2x /= l2;
      e2y /= l2;
      // 逆时针轮廓的内法线 = (-ey, ex)
      let nx = -e1y - e2y;
      let ny = e1x + e2x;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const cosHalf = Math.max(0.4, nx * -e1y + ny * e1x);
      inset.push([p[0] + (nx * bevel) / cosHalf, p[1] + (ny * bevel) / cosHalf]);
    }
    const P: number[] = [];
    const G: number[] = [];
    const T: number[] = [];
    const hz = depth / 2;
    const bz = Math.min(bevel, hz * 0.95);
    const rings: [number[][], number][] = bevel > 0 ? [[inset, -hz], [pts, -hz + bz], [pts, hz - bz], [inset, hz]] : [[pts, -hz], [pts, hz]];
    for (const [ring, z] of rings) {
      for (const p of ring) {
        P.push(p[0], p[1], z);
        G.push(gy(p[1]));
      }
    }
    // 侧面：轮廓逆时针(从 +Z 看)，外法线朝外
    for (let k = 0; k < rings.length - 1; k++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = k * n + i;
        const b = k * n + j;
        const c = (k + 1) * n + j;
        const d = (k + 1) * n + i;
        T.push(a, b, c, a, c, d);
      }
    }
    const capRing = rings[rings.length - 1][0];
    const faces = THREE.ShapeUtils.triangulateShape(capRing.map((p) => new THREE.Vector2(p[0], p[1])), []);
    const top = (rings.length - 1) * n;
    for (const f of faces) {
      // 三角化结果的绕向不保证：按二维叉积统一成逆时针
      const a = capRing[f[0]];
      const b = capRing[f[1]];
      const c = capRing[f[2]];
      const ccw = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;
      const i1 = ccw ? f[1] : f[2];
      const i2 = ccw ? f[2] : f[1];
      T.push(top + f[0], top + i1, top + i2);
      T.push(f[0], i2, i1);
    }
    this.emit(P, T, G, crease);
    return this;
  }

  /**
   * 参数曲面片：fn(u, v) → [x, y, z]，u、v ∈ [0,1]。double=true 时正反两面都生成(披风/旗/翼膜)。
   * 渐变参数 = v。正面法线方向 = ∂u × ∂v。
   */
  sheet(nu: number, nv: number, fn: (u: number, v: number) => number[], double = true, crease?: number): this {
    const P: number[] = [];
    const G: number[] = [];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const p = fn(i / nu, j / nv);
        P.push(p[0], p[1], p[2]);
        G.push(j / nv);
      }
    }
    const T: number[] = [];
    const B: number[] = [];
    const w = nu + 1;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * w + i;
        const b = a + 1;
        const c = a + w;
        const d = c + 1;
        T.push(a, b, d, a, d, c);
        B.push(a, d, b, a, c, d);
      }
    }
    this.emit(P, T, G, crease ?? 180);
    if (double) this.emit(P, B, G, crease ?? 180);
    return this;
  }

  /** 水平圆环(绕 Y 轴)：R 环半径，r 管的径向半径，ry 管的竖向半径 */
  torus(R: number, r: number, ry = r, seg = 20, tseg = 6, o: { power?: number; phase?: number; crease?: number; y?: number } = {}): this {
    const path: number[][] = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      path.push([Math.cos(a) * R, o.y ?? 0, Math.sin(a) * R, ry, r]);
    }
    // 参考方向取 +Y：截面的 U 轴竖直，V 轴沿径向
    return this.tube(path, { seg: tseg, closed: true, up: [0, 1, 0], power: o.power, phase: o.phase, crease: o.crease });
  }

  /** 两点之间的圆台(肢体/杆)：r0→r1，可在中段鼓起 bulge 倍 */
  limb(a: number[], b: number[], r0: number, r1: number, o: TubeOpts & { bulge?: number; flat?: number } = {}): this {
    const bulge = o.bulge ?? 0;
    const path: number[][] = [];
    const steps = bulge !== 0 ? 4 : 1;
    const fl = o.flat ?? 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = lerp(r0, r1, t) * (1 + bulge * Math.sin(Math.PI * t));
      path.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), r, r * fl]);
    }
    return this.tube(path, o);
  }

  // ───────────── 收尾 ─────────────

  /**
   * 全模型的「落地感」烘焙：朝下的面压暗(自遮蔽)，靠近地面的部分略暗。
   * 发光顶点不参与(发光体应该干净明亮)。
   */
  bakeGrounding(height: number, under = 0.7, feet = 0.86): void {
    const n = this.pos.length / 3;
    for (let i = 0; i < n; i++) {
      if (this.fx[i * 4 + 1] > 0.05) continue;
      const ny = this.nor[i * 3 + 1];
      const y = this.pos[i * 3 + 1];
      const u = lerp(under, 1, smooth(-0.95, 0.25, ny));
      this.fx[i * 4 + 3] *= u;
      const k = lerp(feet, 1, sat(y / (height * 0.45))) * lerp(0.9, 1, smooth(-0.9, 0.1, ny));
      this.col[i * 3] *= k;
      this.col[i * 3 + 1] *= k;
      this.col[i * 3 + 2] *= k;
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const fx = new Uint8Array(this.fx.length);
    for (let i = 0; i < fx.length; i++) fx[i] = Math.round(sat(this.fx[i]) * 255);
    g.setAttribute('aFx', new THREE.BufferAttribute(fx, 4, true));
    g.setAttribute('aSkin', new THREE.Float32BufferAttribute(this.skin, 3));
    const mat = new Uint8Array(this.mat.length);
    for (let i = 0; i < mat.length; i++) mat[i] = Math.round(sat(this.mat[i]) * 255);
    g.setAttribute('aMat', new THREE.BufferAttribute(mat, 4, true));
    const n = this.pos.length / 3;
    // 描边法线：同一位置的所有顶点取平均法线，硬边处外扩后的壳才不会裂开。w = 粗细倍率
    const sum = new Map<string, number[]>();
    const keys: string[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(this.pos[i * 3] * 1500)},${Math.round(this.pos[i * 3 + 1] * 1500)},${Math.round(this.pos[i * 3 + 2] * 1500)}`;
      keys[i] = k;
      let acc = sum.get(k);
      if (!acc) {
        acc = [0, 0, 0];
        sum.set(k, acc);
      }
      acc[0] += this.nor[i * 3];
      acc[1] += this.nor[i * 3 + 1];
      acc[2] += this.nor[i * 3 + 2];
    }
    const ol = new Int8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const acc = sum.get(keys[i]) as number[];
      const l = Math.hypot(acc[0], acc[1], acc[2]);
      // 正反两面重合的薄片：平均法线为零，退回自身法线
      const nx = l > 0.2 ? acc[0] / l : this.nor[i * 3];
      const ny = l > 0.2 ? acc[1] / l : this.nor[i * 3 + 1];
      const nz = l > 0.2 ? acc[2] / l : this.nor[i * 3 + 2];
      ol[i * 4] = Math.round(nx * 127);
      ol[i * 4 + 1] = Math.round(ny * 127);
      ol[i * 4 + 2] = Math.round(nz * 127);
      ol[i * 4 + 3] = Math.round(sat(this.line[i]) * 127);
    }
    g.setAttribute('aOutline', new THREE.BufferAttribute(ol, 4, true));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

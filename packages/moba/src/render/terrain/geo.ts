/**
 * 几何工具：顶点流构建器、按空间分块合并静态几何的批处理器、沿轮廓逐环挤出(崖体/外缘地形)的通用构建。
 * 顶点格式统一为 position / normal / color(线性) / aFx(x=风摆 y=自发光 z=队伍蒙版 w=AO)。
 */
import * as THREE from 'three';
import type { Polygon, Vec2 } from '../../core/types';

export type RGB = [number, number, number];

/** sRGB 十六进制 → 线性 RGB 三元组 */
export function rgb(hex: number): RGB {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scaleRgb(a: RGB, s: number): RGB {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/**
 * 三角形的「档位」：合并网格时按档位把索引排成连续的几段，画质档与阴影通道各取一段前缀/区间(只改 drawRange，不多一个 draw call)。
 *   MAIN_ONLY  只进主通道：朝天的顶面(崖顶、界外林地)——阴影通道画的是背面，它们本来就全被剔掉，白交一遍顶点
 *   CASTER     主要投影者(崖壁、树、建筑、构件)：三档主通道都画，阴影通道 medium / high 都画
 *   LOW        三档主通道都画；阴影通道只有 high 画(灌木、碎石、照不到场内的界外林木)
 *   MEDIUM     medium / high 才画的加密散件
 *   HIGH       只有 high 画的加密散件
 */
export const RANK_MAIN_ONLY = -1;
export const RANK_CASTER = 0;
export const RANK_LOW = 1;
export const RANK_MEDIUM = 2;
export const RANK_HIGH = 3;
const RANK_SLOTS = 5;

/** 按位置散列把一个散件分到 LOW / MEDIUM / HIGH：low 档留 lowShare，medium 档留 lowShare + mediumShare，high 档全留 */
export function densityRank(x: number, z: number, lowShare = 0.45, mediumShare = 0.3): number {
  let h = (Math.imul(Math.round(x * 97) | 0, 374761393) ^ Math.imul(Math.round(z * 89) | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  return r < lowShare ? RANK_LOW : r < lowShare + mediumShare ? RANK_MEDIUM : RANK_HIGH;
}

/**
 * 按画质档设置合并网格的绘制范围：主通道画到 mainRank 为止；投影网格的阴影通道画 CASTER 到 min(mainRank, shadowRank)。
 * 阴影通道的范围靠 onBeforeShadow / onAfterShadow 临时切换(同一份几何，不多占显存)。
 */
export function applyRankRange(mesh: THREE.Mesh, mainRank: number, shadowRank: number): void {
  const geo = mesh.geometry;
  const ends = geo.userData.rankEnds as number[] | undefined;
  if (!ends) return;
  const main = ends[Math.min(RANK_HIGH, Math.max(RANK_CASTER, mainRank)) + 1];
  geo.setDrawRange(0, main);
  if (!mesh.castShadow) return;
  const s0 = ends[0];
  const s1 = Math.max(s0, ends[Math.min(mainRank, shadowRank) + 1]);
  mesh.onBeforeShadow = () => geo.setDrawRange(s0, s1 - s0);
  mesh.onAfterShadow = () => geo.setDrawRange(0, main);
}

export class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  fx: number[] = [];
  indices: number[] = [];
  /** 档位分段：[索引起点, 档位, 索引起点, 档位, …]；空 = 全部是 CASTER */
  private rankRuns: number[] = [];
  private rank = RANK_CASTER;

  /** 之后写入的三角形都记在这一档(见 RANK_*) */
  setRank(rank: number): void {
    if (rank === this.rank) return;
    this.rank = rank;
    this.rankRuns.push(this.indices.length, rank);
  }

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  vertex(x: number, y: number, z: number, c: RGB, nx = 0, ny = 1, nz = 0, sway = 0, glow = 0, team = 0, ao = 1): number {
    const i = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.colors.push(c[0], c[1], c[2]);
    this.fx.push(sway, glow, team, ao);
    return i;
  }

  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  /** a-b-c-d 逆时针(从法线方向看) */
  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }

  /**
   * 追加一份几何体(可带 color / aFx 属性)，应用矩阵与颜色乘数。
   * glow/sway 为该实例的额外倍率(乘到 aFx 对应分量上)。
   * maskedTint=true 时色偏只作用在 aFx.z(蒙版)为 1 的顶点上(旗面/花瓣/伞盖)，其余部件保持原色。
   */
  append(geo: THREE.BufferGeometry, m: THREE.Matrix4, tint?: RGB, glowMul = 1, swayMul = 1, maskedTint = false): void {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const col = geo.attributes.color;
    const fx = geo.attributes.aFx;
    const base = this.positions.length / 3;
    _nm.getNormalMatrix(m);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m);
      this.positions.push(_v.x, _v.y, _v.z);
      if (nor) _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
      else _n.set(0, 1, 0);
      this.normals.push(_n.x, _n.y, _n.z);
      const r = col ? col.getX(i) : 1;
      const g = col ? col.getY(i) : 1;
      const b = col ? col.getZ(i) : 1;
      const k = maskedTint ? (fx ? fx.getZ(i) : 0) : 1;
      if (tint && k > 0) this.colors.push(r * (1 + (tint[0] - 1) * k), g * (1 + (tint[1] - 1) * k), b * (1 + (tint[2] - 1) * k));
      else this.colors.push(r, g, b);
      // 蒙版通道只在合并阶段使用，写入网格时清零(着色器里的队伍色混合留给单位模型)
      if (fx) this.fx.push(fx.getX(i) * swayMul, fx.getY(i) * glowMul, 0, fx.getW(i));
      else this.fx.push(0, 0, 0, 1);
    }
    const index = geo.index;
    if (index) for (let i = 0; i < index.count; i++) this.indices.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.indices.push(base + i);
  }

  /**
   * 重新计算法线(共享顶点处取面积加权平均)。
   * creaseDeg < 180 时带折痕：只有夹角小于它的相邻面才互相平滑，折痕处把顶点拆成几份——
   * 大面是柔和的弧面，转折处是利落的棱(岩块、砌石)，不再是一条条细长的切面。
   */
  computeNormals(creaseDeg = 180): void {
    const p = this.positions;
    const idx = this.indices;
    const triCount = idx.length / 3;
    // 面法线：fa = 面积加权(未归一化)，fu = 单位
    const fa = new Float32Array(triCount * 3);
    const fu = new Float32Array(triCount * 3);
    for (let t = 0; t < triCount; t++) {
      const a = idx[t * 3] * 3;
      const b = idx[t * 3 + 1] * 3;
      const c = idx[t * 3 + 2] * 3;
      const ux = p[b] - p[a];
      const uy = p[b + 1] - p[a + 1];
      const uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a];
      const vy = p[c + 1] - p[a + 1];
      const vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      fa[t * 3] = nx;
      fa[t * 3 + 1] = ny;
      fa[t * 3 + 2] = nz;
      fu[t * 3] = nx / l;
      fu[t * 3 + 1] = ny / l;
      fu[t * 3 + 2] = nz / l;
    }
    const n = this.normals;
    if (creaseDeg >= 180) {
      n.fill(0);
      for (let t = 0; t < triCount; t++) {
        for (let k = 0; k < 3; k++) {
          const v = idx[t * 3 + k] * 3;
          n[v] += fa[t * 3];
          n[v + 1] += fa[t * 3 + 1];
          n[v + 2] += fa[t * 3 + 2];
        }
      }
      for (let i = 0; i < n.length; i += 3) {
        const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
        n[i] /= l;
        n[i + 1] /= l;
        n[i + 2] /= l;
      }
      return;
    }
    // 位置相同的顶点算同一组(挤出时中轴线两侧各有一份顶点：邻接要跨过去，否则接缝两边各算各的法线)
    const vcount = p.length / 3;
    const group = new Uint32Array(vcount);
    const byPos = new Map<string, number>();
    let groups = 0;
    for (let v = 0; v < vcount; v++) {
      const key = `${Math.round(p[v * 3] * 500)},${Math.round(p[v * 3 + 1] * 500)},${Math.round(p[v * 3 + 2] * 500)}`;
      let g = byPos.get(key);
      if (g === undefined) {
        g = groups++;
        byPos.set(key, g);
      }
      group[v] = g;
    }
    // 组 → 相邻三角形(压缩行存储)
    const start = new Uint32Array(groups + 1);
    for (let i = 0; i < idx.length; i++) start[group[idx[i]] + 1]++;
    for (let g = 0; g < groups; g++) start[g + 1] += start[g];
    const fill = start.slice(0, groups);
    const adj = new Uint32Array(idx.length);
    for (let t = 0; t < triCount; t++) for (let k = 0; k < 3; k++) adj[fill[group[idx[t * 3 + k]]]++] = t;
    const cosC = Math.cos((creaseDeg * Math.PI) / 180);
    // 每个原顶点已经分出去的副本：[顶点下标, nx, ny, nz]...
    const copies: number[][] = new Array(vcount);
    const used = new Uint8Array(vcount);
    for (let t = 0; t < triCount; t++) {
      const tx = fu[t * 3];
      const ty = fu[t * 3 + 1];
      const tz = fu[t * 3 + 2];
      for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k];
        let nx = 0;
        let ny = 0;
        let nz = 0;
        const gv = group[v];
        for (let j = start[gv]; j < start[gv + 1]; j++) {
          const t2 = adj[j];
          if (fu[t2 * 3] * tx + fu[t2 * 3 + 1] * ty + fu[t2 * 3 + 2] * tz < cosC) continue;
          nx += fa[t2 * 3];
          ny += fa[t2 * 3 + 1];
          nz += fa[t2 * 3 + 2];
        }
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
        let list = copies[v];
        if (!list) list = copies[v] = [];
        let found = -1;
        for (let c = 0; c < list.length; c += 4) {
          if (list[c + 1] * nx + list[c + 2] * ny + list[c + 3] * nz > 0.9995) {
            found = list[c];
            break;
          }
        }
        if (found < 0) {
          if (!used[v]) {
            used[v] = 1;
            found = v;
          } else {
            // 折痕另一侧：复制一份顶点
            found = this.positions.length / 3;
            this.positions.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
            this.normals.push(0, 0, 0);
            this.colors.push(this.colors[v * 3], this.colors[v * 3 + 1], this.colors[v * 3 + 2]);
            this.fx.push(this.fx[v * 4], this.fx[v * 4 + 1], this.fx[v * 4 + 2], this.fx[v * 4 + 3]);
          }
          n[found * 3] = nx;
          n[found * 3 + 1] = ny;
          n[found * 3 + 2] = nz;
          list.push(found, nx, ny, nz);
        }
        idx[t * 3 + k] = found;
      }
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    const fx = new Uint8Array(this.fx.length);
    for (let i = 0; i < fx.length; i++) fx[i] = Math.round(clamp01(this.fx[i]) * 255);
    g.setAttribute('aFx', new THREE.BufferAttribute(fx, 4, true));
    const n = this.positions.length / 3;
    // 按档位把索引排成连续的几段(段内保持原顺序)，并记下各段的终点
    let indices = this.indices;
    const total = indices.length;
    const ends = [0, total, total, total, total];
    const runs = this.rankRuns;
    if (runs.length > 0) {
      const buckets: number[][] = Array.from({ length: RANK_SLOTS }, () => []);
      let rank = RANK_CASTER;
      let from = 0;
      for (let r = 0; r <= runs.length; r += 2) {
        const to = r < runs.length ? runs[r] : total;
        const dst = buckets[Math.min(RANK_HIGH, Math.max(RANK_MAIN_ONLY, rank)) + 1];
        for (let i = from; i < to; i++) dst.push(indices[i]);
        from = to;
        if (r < runs.length) rank = runs[r + 1];
      }
      indices = [];
      for (let k = 0; k < RANK_SLOTS; k++) {
        for (const v of buckets[k]) indices.push(v);
        ends[k] = indices.length;
      }
    }
    g.userData.rankEnds = ends;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * 静态景物批处理：按 cell×cell 米的格子把成百上千个小物件合并成少量网格，
 * 每格一个 draw call 并能被视锥剔除。分「投射阴影」与「不投射阴影」两组。
 */
export class SceneryBatcher {
  private cells = new Map<string, MeshBuilder>();
  constructor(private cell = 32) {}

  private builder(x: number, z: number, shadow: boolean): MeshBuilder {
    const k = `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)},${shadow ? 1 : 0}`;
    let b = this.cells.get(k);
    if (!b) {
      b = new MeshBuilder();
      this.cells.set(k, b);
    }
    return b;
  }

  /**
   * 按实例矩阵的平移量决定归属格。rank = 档位(见 RANK_*)：投影组缺省 CASTER，不投影组缺省 LOW(三档都画)。
   */
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, opts: { tint?: RGB; shadow?: boolean; glow?: number; sway?: number; maskedTint?: boolean; rank?: number } = {}): void {
    const e = m.elements;
    const shadow = opts.shadow ?? true;
    const b = this.builder(e[12], e[14], shadow);
    b.setRank(opts.rank ?? (shadow ? RANK_CASTER : RANK_LOW));
    b.append(geo, m, opts.tint, opts.glow ?? 1, opts.sway ?? 1, opts.maskedTint ?? false);
  }

  /** 直接取某位置所属的构建器(手工写顶点)。档位复位到该组的缺省值(或给定的 rank) */
  at(x: number, z: number, shadow = true, rank = shadow ? RANK_CASTER : RANK_LOW): MeshBuilder {
    const b = this.builder(x, z, shadow);
    b.setRank(rank);
    return b;
  }

  /** 已登记的三角形总数(统计用) */
  get triangleCount(): number {
    let n = 0;
    for (const b of this.cells.values()) n += b.triangleCount;
    return n;
  }

  /**
   * casterMat 用于投射阴影的实体物件；clutterMat 用于贴地小物(通常双面、不投影)。
   * creaseDeg > 0 时按该折痕角重算法线(崖体这类手工连出来的网格用)。
   */
  build(casterMat: THREE.Material, clutterMat: THREE.Material, parent: THREE.Object3D, name: string, creaseDeg = 0): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [k, b] of this.cells) {
      if (b.vertexCount === 0) continue;
      if (creaseDeg > 0) b.computeNormals(creaseDeg);
      const shadow = k.endsWith(',1');
      const mesh = new THREE.Mesh(b.build(), shadow ? casterMat : clutterMat);
      mesh.name = `${name}:${k}`;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      out.push(mesh);
    }
    this.cells.clear();
    return out;
  }
}

// ───────────────────────────── 轮廓处理 ─────────────────────────────

export function signedArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  return a / 2;
}

export function centroid(poly: Polygon): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

export interface OutlinePoint {
  x: number;
  z: number;
  /** 挤出方向(单位向量)：多边形为朝内 */
  nx: number;
  nz: number;
  /** 沿轮廓的弧长 */
  s: number;
  /** 斜接放大系数(拐角处沿角平分线需要走更远) */
  miter: number;
}

/**
 * 把多边形处理成适合挤出的致密轮廓：凸角向内切圆角(不越出原多边形)，长边按 step 细分。
 * 返回点序保证「挤出方向 = 多边形内侧」。
 */
export function denseOutline(poly: Polygon, step: number, cornerCut: number, jitter: (i: number) => number): OutlinePoint[] {
  // 统一成逆时针(在 x→右, z→下 的平面里 signedArea > 0 为顺时针外观，这里只要求方向一致)
  const pts = signedArea(poly) < 0 ? [...poly].reverse() : [...poly];
  const n = pts.length;
  const raw: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const ax = prev.x - cur.x;
    const ay = prev.y - cur.y;
    const bx = next.x - cur.x;
    const by = next.y - cur.y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    // 叉积判断凸凹：面积为正时，凸角处 cross(prev→cur, cur→next) > 0
    const cross = -ax * by + ay * bx;
    const convex = cross > 1e-6;
    const cut = Math.min(cornerCut, la * 0.3, lb * 0.3);
    if (!convex || cut < 0.05) {
      raw.push({ x: cur.x, y: cur.y });
      continue;
    }
    // 圆角：二次贝塞尔的 3 个采样点，整体位于原角内侧
    const p0 = { x: cur.x + (ax / la) * cut, y: cur.y + (ay / la) * cut };
    const p2 = { x: cur.x + (bx / lb) * cut, y: cur.y + (by / lb) * cut };
    for (const t of [0, 0.5, 1]) {
      const u = 1 - t;
      raw.push({ x: u * u * p0.x + 2 * u * t * cur.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * cur.y + t * t * p2.y });
    }
  }
  // 细分
  const dense: Vec2[] = [];
  let k = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const segs = Math.max(1, Math.round(len / step));
    for (let j = 0; j < segs; j++) {
      // 中间点沿边方向抖动一点，避免等距的机械感(端点不动，保证轮廓不变)
      let t = j / segs;
      if (j > 0) t += (jitter(k) - 0.5) * (0.5 / segs);
      dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      k++;
    }
  }
  return outlineNormals(dense, true);
}

/** 计算轮廓各点的挤出方向(朝左侧法线的平均)、弧长与斜接系数 */
export function outlineNormals(pts: Vec2[], closed: boolean): OutlinePoint[] {
  const n = pts.length;
  const out: OutlinePoint[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const prev = pts[closed ? (i + n - 1) % n : Math.max(0, i - 1)];
    const cur = pts[i];
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let e1x = cur.x - prev.x;
    let e1y = cur.y - prev.y;
    let e2x = next.x - cur.x;
    let e2y = next.y - cur.y;
    const l1 = Math.hypot(e1x, e1y);
    const l2 = Math.hypot(e2x, e2y);
    if (l1 < 1e-6) {
      e1x = e2x;
      e1y = e2y;
    }
    if (l2 < 1e-6) {
      e2x = e1x;
      e2y = e1y;
    }
    const a1 = Math.hypot(e1x, e1y) || 1;
    const a2 = Math.hypot(e2x, e2y) || 1;
    // 面积为正的多边形：内侧法线 = (-ey, ex)
    const n1x = -e1y / a1;
    const n1y = e1x / a1;
    const n2x = -e2y / a2;
    const n2y = e2x / a2;
    let nx = n1x + n2x;
    let ny = n1y + n2y;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const cosHalf = Math.max(0.35, nx * n1x + ny * n1y);
    if (i > 0) s += Math.hypot(cur.x - pts[i - 1].x, cur.y - pts[i - 1].y);
    out.push({ x: cur.x, z: cur.y, nx, nz: ny, s, miter: 1 / cosHalf });
  }
  return out;
}

export interface RingVertex {
  /** 沿挤出方向的实际偏移(米)。调用方自行处理斜接/钳制 */
  t: number;
  /** 高度 */
  y: number;
  color: RGB;
  ao?: number;
  glow?: number;
  /** 写入 aFx.z：配合材质的 mapMask 选项表示「岩石肌理强度」 */
  tex?: number;
}

/**
 * 逐环挤出：对轮廓上每个点 i、每一环 k 调用 ring(p, i, k) 得到偏移/高度/颜色，相邻环之间连成四边形带。
 * 返回每一环的顶点下标。
 */
export function extrudeRings(
  b: MeshBuilder,
  outline: OutlinePoint[],
  closed: boolean,
  ringCount: number,
  ring: (p: OutlinePoint, i: number, k: number) => RingVertex,
  /** 第 k 环到第 k+1 环之间那条带子的档位(缺省全部 CASTER)。写完后档位复位到 CASTER */
  stripRank?: (k: number) => number,
): number[][] {
  const n = outline.length;
  const idx: number[][] = [];
  for (let k = 0; k < ringCount; k++) {
    const row: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = outline[i];
      const rv = ring(p, i, k);
      row.push(b.vertex(p.x + p.nx * rv.t, rv.y, p.z + p.nz * rv.t, rv.color, 0, 1, 0, 0, rv.glow ?? 0, rv.tex ?? 0, rv.ao ?? 1));
    }
    idx.push(row);
  }
  const last = closed ? n : n - 1;
  for (let k = 0; k < ringCount - 1; k++) {
    if (stripRank) b.setRank(stripRank(k));
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      // 轮廓方向 + 挤出方向在左 → 外表面朝外/朝上
      b.quad(idx[k][i], idx[k + 1][i], idx[k + 1][j], idx[k][j]);
    }
  }
  if (stripRank) b.setRank(RANK_CASTER);
  return idx;
}

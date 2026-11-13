/**
 * 场景点缀物的程序化原型：树(分层叶团) / 垂枝树 / 松 / 灌木 / 岩石 / 水晶簇 / 断柱 / 伞菇与层架菌 / 灯果 / 蕨 / 藤 / 草帘 /
 * 芦苇 / 荷叶 / 花丛 / 草簇 / 旗帜 / 火盆 等。
 * 每个原型是带 position/normal/color/aFx 的 BufferGeometry(局部原点在落地点)，由 SceneryBatcher 合并进分块网格。
 * 颜色写进顶点色(线性)，实例再乘一个色偏；发光部件用 aFx.y，随风摆动的部件用 aFx.x。
 */
import * as THREE from 'three';
import { PALETTE, Rng, hash2 } from '../materials';
import { MeshBuilder, type RGB, lerp, mixRgb, rgb, scaleRgb } from './geo';

export { MeshBuilder };

const TAU = Math.PI * 2;

// ───────────── 基础形体 ─────────────

interface IcoData {
  /** 单位球面上的顶点 */
  verts: [number, number, number][];
  tris: [number, number, number][];
}

const icoCache = new Map<number, IcoData>();

/** 细分二十面体(共享顶点) */
function icosphere(detail: number): IcoData {
  let d = icoCache.get(detail);
  if (d) return d;
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: [number, number, number][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  verts = verts.map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  let tris: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let s = 0; s < detail; s++) {
    const mid = new Map<number, number>();
    const midpoint = (a: number, b: number): number => {
      const k = a < b ? a * 100000 + b : b * 100000 + a;
      let m = mid.get(k);
      if (m === undefined) {
        const va = verts[a];
        const vb = verts[b];
        const x = va[0] + vb[0];
        const y = va[1] + vb[1];
        const z = va[2] + vb[2];
        const l = Math.hypot(x, y, z);
        m = verts.length;
        verts.push([x / l, y / l, z / l]);
        mid.set(k, m);
      }
      return m;
    };
    const next: [number, number, number][] = [];
    for (const [a, b, c] of tris) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    tris = next;
  }
  d = { verts, tris };
  icoCache.set(detail, d);
  return d;
}

export interface BlobOpts {
  detail?: number;
  /** 表面起伏幅度(相对半径) */
  bump?: number;
  seed?: number;
  /** 颜色：底部 → 顶部 */
  bottom: RGB;
  top: RGB;
  /** 风摆权重：底部 → 顶部 */
  swayBottom?: number;
  swayTop?: number;
  glow?: number;
  /** 法线朝该点外推的混合(0..1)，让多个团块合成一个大形体的明暗 */
  puffCenter?: [number, number, number];
  puff?: number;
  /** 按面着色(岩石) */
  flat?: boolean;
  ao?: number;
  /** 实例色偏蒙版(1 = 该部件吃实例色偏；配合 SceneryBatcher 的 maskedTint) */
  team?: number;
  /** 丢弃单位球上 y 低于该值的三角形(俯视镜头看不到的底面)，省面数 */
  cutBelow?: number;
}

/** 椭球团块：树冠/灌木/岩石/蘑菇伞的基本形体 */
export function addBlob(b: MeshBuilder, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, o: BlobOpts): void {
  const ico = icosphere(o.detail ?? 1);
  const seed = o.seed ?? 1;
  const bump = o.bump ?? 0;
  const pts: [number, number, number][] = [];
  const nrm: [number, number, number][] = [];
  for (let i = 0; i < ico.verts.length; i++) {
    const v = ico.verts[i];
    const k = 1 + (hash2(i, seed, 71) - 0.5) * 2 * bump;
    const x = cx + v[0] * rx * k;
    const y = cy + v[1] * ry * k;
    const z = cz + v[2] * rz * k;
    pts.push([x, y, z]);
    let nx = v[0] / rx;
    let ny = v[1] / ry;
    let nz = v[2] / rz;
    let l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    if (o.puffCenter && o.puff) {
      let px = x - o.puffCenter[0];
      let py = y - o.puffCenter[1];
      let pz = z - o.puffCenter[2];
      l = Math.hypot(px, py, pz) || 1;
      px /= l;
      py /= l;
      pz /= l;
      nx = lerp(nx, px, o.puff);
      ny = lerp(ny, py, o.puff);
      nz = lerp(nz, pz, o.puff);
      l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
    }
    nrm.push([nx, ny, nz]);
  }
  const colorAt = (i: number): RGB => {
    const t = Math.min(1, Math.max(0, (ico.verts[i][1] + 1) / 2));
    const c = mixRgb(o.bottom, o.top, t * t * (3 - 2 * t));
    return scaleRgb(c, 0.93 + hash2(i, seed, 5) * 0.14);
  };
  const swayAt = (i: number): number => lerp(o.swayBottom ?? 0, o.swayTop ?? 0, (ico.verts[i][1] + 1) / 2);
  if (o.flat) {
    for (const [a, bb, c] of ico.tris) {
      const pa = pts[a];
      const pb = pts[bb];
      const pc = pts[c];
      const ux = pb[0] - pa[0];
      const uy = pb[1] - pa[1];
      const uz = pb[2] - pa[2];
      const vx = pc[0] - pa[0];
      const vy = pc[1] - pa[1];
      const vz = pc[2] - pa[2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      // 每个面一个色调：朝上的面更亮
      const shade = 0.86 + 0.2 * Math.max(0, ny) + (hash2(a + bb * 7, c, seed) - 0.5) * 0.12;
      const ia = b.vertex(pa[0], pa[1], pa[2], scaleRgb(colorAt(a), shade), nx, ny, nz, 0, o.glow ?? 0, o.team ?? 0, o.ao ?? 1);
      const ib = b.vertex(pb[0], pb[1], pb[2], scaleRgb(colorAt(bb), shade), nx, ny, nz, 0, o.glow ?? 0, o.team ?? 0, o.ao ?? 1);
      const ic = b.vertex(pc[0], pc[1], pc[2], scaleRgb(colorAt(c), shade), nx, ny, nz, 0, o.glow ?? 0, o.team ?? 0, o.ao ?? 1);
      b.tri(ia, ib, ic);
    }
  } else {
    const base = b.vertexCount;
    for (let i = 0; i < pts.length; i++) b.vertex(pts[i][0], pts[i][1], pts[i][2], colorAt(i), nrm[i][0], nrm[i][1], nrm[i][2], swayAt(i), o.glow ?? 0, o.team ?? 0, o.ao ?? 1);
    const cut = o.cutBelow ?? -2;
    for (const [a, bb, c] of ico.tris) {
      if (ico.verts[a][1] < cut && ico.verts[bb][1] < cut && ico.verts[c][1] < cut) continue;
      b.tri(base + a, base + bb, base + c);
    }
  }
}

export interface TubeOpts {
  sides?: number;
  /** 颜色：起点 → 终点 */
  c0: RGB;
  c1: RGB;
  sway0?: number;
  sway1?: number;
  glow?: number;
  /** 封顶 */
  cap?: boolean;
  flat?: boolean;
}

/** 沿折线的锥形管：树干/立柱/茎/旗杆。path 每个点带半径 */
export function addTube(b: MeshBuilder, path: [number, number, number, number][], o: TubeOpts): void {
  const sides = o.sides ?? 6;
  const rings: number[][] = [];
  const n = path.length;
  for (let k = 0; k < n; k++) {
    const p = path[k];
    const prev = path[Math.max(0, k - 1)];
    const next = path[Math.min(n - 1, k + 1)];
    // 以路径切线为轴建一个局部正交基
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    let tz = next[2] - prev[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    let ux = 1;
    let uy = 0;
    let uz = 0;
    if (Math.abs(tx) > 0.9) {
      ux = 0;
      uz = 1;
    }
    // u = normalize(u - t(t·u))
    const d = ux * tx + uy * ty + uz * tz;
    ux -= tx * d;
    uy -= ty * d;
    uz -= tz * d;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = ty * uz - tz * uy;
    const vy = tz * ux - tx * uz;
    const vz = tx * uy - ty * ux;
    const t = n > 1 ? k / (n - 1) : 0;
    const c = mixRgb(o.c0, o.c1, t);
    const sway = lerp(o.sway0 ?? 0, o.sway1 ?? 0, t);
    const row: number[] = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nx = ux * ca + vx * sa;
      const ny = uy * ca + vy * sa;
      const nz = uz * ca + vz * sa;
      row.push(b.vertex(p[0] + nx * p[3], p[1] + ny * p[3], p[2] + nz * p[3], c, nx, ny, nz, sway, o.glow ?? 0, 0, 1));
    }
    rings.push(row);
  }
  for (let k = 0; k < n - 1; k++) {
    for (let s = 0; s < sides; s++) {
      const s2 = (s + 1) % sides;
      b.quad(rings[k][s], rings[k + 1][s], rings[k + 1][s2], rings[k][s2]);
    }
  }
  if (o.cap) {
    const p = path[n - 1];
    const c = b.vertex(p[0], p[1], p[2], scaleRgb(o.c1, 1.08), 0, 1, 0, o.sway1 ?? 0, o.glow ?? 0, 0, 1);
    for (let s = 0; s < sides; s++) b.tri(rings[n - 1][s], c, rings[n - 1][(s + 1) % sides]);
  }
}

/** 六棱晶体：底部六边形 → 腰 → 尖顶，按面着色 */
export function addCrystal(b: MeshBuilder, x: number, y: number, z: number, h: number, r: number, tiltX: number, tiltZ: number, c0: RGB, c1: RGB, glow: number, seed: number): void {
  const sides = 6;
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tiltX, hash2(seed, 3, 9) * TAU, tiltZ)).setPosition(x, y, z);
  const v = new THREE.Vector3();
  const P = (px: number, py: number, pz: number): [number, number, number] => {
    v.set(px, py, pz).applyMatrix4(m);
    return [v.x, v.y, v.z];
  };
  const waist = h * 0.72;
  const bot: [number, number, number][] = [];
  const mid: [number, number, number][] = [];
  for (let s = 0; s < sides; s++) {
    const a = (s / sides) * TAU;
    bot.push(P(Math.cos(a) * r * 0.75, -0.15, Math.sin(a) * r * 0.75));
    mid.push(P(Math.cos(a) * r, waist, Math.sin(a) * r));
  }
  const tip = P(0, h, 0);
  const face = (p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], ca: RGB, cb: RGB, cc: RGB, g: number): void => {
    const ux = p1[0] - p0[0];
    const uy = p1[1] - p0[1];
    const uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0];
    const vy = p2[1] - p0[1];
    const vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const i0 = b.vertex(p0[0], p0[1], p0[2], ca, nx, ny, nz, 0, g * 0.55, 0, 1);
    const i1 = b.vertex(p1[0], p1[1], p1[2], cb, nx, ny, nz, 0, g, 0, 1);
    const i2 = b.vertex(p2[0], p2[1], p2[2], cc, nx, ny, nz, 0, g, 0, 1);
    b.tri(i0, i1, i2);
  };
  for (let s = 0; s < sides; s++) {
    const s2 = (s + 1) % sides;
    const shade = 0.8 + hash2(s, seed, 17) * 0.4;
    const cA = scaleRgb(c0, shade);
    const cB = scaleRgb(c1, shade);
    face(bot[s], mid[s], mid[s2], cA, cB, cB, glow);
    face(bot[s], mid[s2], bot[s2], cA, cB, cA, glow);
    face(mid[s], tip, mid[s2], cB, scaleRgb(c1, 1.25), cB, glow);
  }
}

function finish(b: MeshBuilder): THREE.BufferGeometry {
  return b.build();
}

// ───────────── 叶团片 ─────────────

export interface ClumpOpts {
  /** 边缘的圆齿数 */
  lobes: number;
  /** 底沿暗色 / 中间色 / 顶部亮色 */
  dark: RGB;
  mid: RGB;
  light: RGB;
  seed: number;
  /** 风摆权重：底沿 → 顶 */
  sway0?: number;
  sway1?: number;
  /** 法线朝该点外推的混合：让一棵树的几片叶团读成一个整体的明暗 */
  puffCenter?: [number, number, number];
  puff?: number;
  /** 实例色偏蒙版 */
  team?: number;
  /** 厚度(相对半径)，默认 0.42 */
  thick?: number;
}

/**
 * 叶团片：压扁的穹顶，边缘推出一圈圆齿，底下收一道暗色的唇边。
 * 一棵树由几层这样的叶团错落叠成，层与层之间露出暗部和枝干——从俯视镜头看是一层层扇贝边的叶冠，而不是气球。
 */
export function addLeafClump(b: MeshBuilder, cx: number, cy: number, cz: number, r: number, o: ClumpOpts): void {
  const n = o.lobes;
  const rng = new Rng(o.seed * 31 + 7);
  const thick = (o.thick ?? 0.42) * r;
  const rot = rng.range(0, TAU);
  // 每片叶团一点色相偏移(±6%)
  const hue = rng.range(-0.06, 0.06);
  const tintC = (c: RGB, k: number): RGB => [c[0] * k * (1 + hue), c[1] * k, c[2] * k * (1 - hue)];
  const s0 = o.sway0 ?? 0.3;
  const s1 = o.sway1 ?? 0.7;
  const put = (x: number, y: number, z: number, c: RGB, nx: number, ny: number, nz: number, sway: number): number => {
    let ax = nx;
    let ay = ny;
    let az = nz;
    if (o.puffCenter && o.puff) {
      let px = cx + x - o.puffCenter[0];
      let py = cy + y - o.puffCenter[1];
      let pz = cz + z - o.puffCenter[2];
      const pl = Math.hypot(px, py, pz) || 1;
      px /= pl;
      py /= pl;
      pz /= pl;
      ax = lerp(ax, px, o.puff);
      ay = lerp(ay, py, o.puff);
      az = lerp(az, pz, o.puff);
    }
    const l = Math.hypot(ax, ay, az) || 1;
    return b.vertex(cx + x, cy + y, cz + z, c, ax / l, ay / l, az / l, sway, 0, o.team ?? 0, 1);
  };
  // 三角形朝向统一按几何法线校正：穹顶朝上，唇边朝下
  const P = b.positions;
  const tri = (i0: number, i1: number, i2: number, up: boolean): void => {
    const ux = P[i1 * 3] - P[i0 * 3];
    const uz = P[i1 * 3 + 2] - P[i0 * 3 + 2];
    const vx = P[i2 * 3] - P[i0 * 3];
    const vz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
    const ny = uz * vx - ux * vz;
    if (ny > 0 === up) b.tri(i0, i1, i2);
    else b.tri(i0, i2, i1);
  };
  const top = put(rng.range(-0.05, 0.05) * r, thick, rng.range(-0.05, 0.05) * r, tintC(o.light, 1), 0, 1, 0, s1);
  const ringA: number[] = [];
  const ringB: number[] = [];
  const ringC: number[] = [];
  const ringD: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rr = r * 0.42 * rng.range(0.92, 1.08);
    ringA.push(put(ca * rr, thick * rng.range(0.86, 0.94), sa * rr, tintC(mixRgb(o.mid, o.light, 0.62), rng.range(0.96, 1.04)), ca * 0.3, 0.95, sa * 0.3, lerp(s0, s1, 0.8)));
    const ab = a + Math.PI / n;
    const cb = Math.cos(ab);
    const sb = Math.sin(ab);
    const rb = r * 0.78 * rng.range(0.94, 1.06);
    ringB.push(put(cb * rb, thick * rng.range(0.52, 0.64), sb * rb, tintC(o.mid, rng.range(0.94, 1.04)), cb * 0.62, 0.78, sb * 0.62, lerp(s0, s1, 0.45)));
  }
  for (let j = 0; j < n * 2; j++) {
    const a = rot + (j / (n * 2)) * TAU;
    const tip = j % 2 === 0;
    // 浅圆齿：齿尖略外探、略低，齿谷略收、更暗
    const rr = r * (tip ? rng.range(0.97, 1.05) : rng.range(0.86, 0.9));
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const y = thick * (tip ? rng.range(0.06, 0.14) : rng.range(0.16, 0.24));
    ringC.push(put(ca * rr, y, sa * rr, tintC(tip ? mixRgb(o.dark, o.mid, 0.72) : mixRgb(o.dark, o.mid, 0.4), 1), ca * 0.86, 0.5, sa * 0.86, s0));
    ringD.push(put(ca * rr * 0.7, -thick * 0.32, sa * rr * 0.7, tintC(o.dark, 0.7), ca * 0.5, -0.85, sa * 0.5, s0));
  }
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    const im = (i + n - 1) % n;
    tri(top, ringA[i], ringA[i2], true);
    tri(ringA[i], ringB[im], ringB[i], true);
    tri(ringA[i], ringB[i], ringA[i2], true);
    const j0 = i * 2;
    const j1 = i * 2 + 1;
    const j2 = (i * 2 + 2) % (n * 2);
    tri(ringB[i], ringC[j0], ringC[j1], true);
    tri(ringB[i], ringC[j1], ringC[j2], true);
    tri(ringB[i], ringC[j2], ringB[i2], true);
  }
  for (let j = 0; j < n * 2; j++) {
    const j2 = (j + 1) % (n * 2);
    tri(ringC[j], ringC[j2], ringD[j2], false);
    tri(ringC[j], ringD[j2], ringD[j], false);
  }
}

/** 一片带弧度的窄叶(蕨叶/草叶/藤叶)：沿 dir 方向伸出 len，中段拱起 arch，末端下垂 droop */
function addFrond(b: MeshBuilder, x: number, y: number, z: number, dirX: number, dirZ: number, len: number, width: number, arch: number, droop: number, c0: RGB, c1: RGB, sway: number, segs = 3): void {
  const px = -dirZ * width;
  const pz = dirX * width;
  const rows: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const cxp = x + dirX * len * t;
    const czp = z + dirZ * len * t;
    const cyp = y + Math.sin(t * Math.PI * 0.6) * arch - t * t * droop;
    const w = i === segs ? 0 : 1 - t * 0.55;
    const c = mixRgb(c0, c1, t);
    if (i === segs) rows.push(b.vertex(cxp, cyp, czp, c, 0, 1, 0, sway * t));
    else rows.push(b.vertex(cxp - px * w, cyp, czp - pz * w, c, 0, 1, 0, sway * t), b.vertex(cxp + px * w, cyp, czp + pz * w, c, 0, 1, 0, sway * t));
  }
  for (let i = 0; i < segs - 1; i++) b.quad(rows[i * 2], rows[i * 2 + 1], rows[i * 2 + 3], rows[i * 2 + 2]);
  b.tri(rows[(segs - 1) * 2], rows[(segs - 1) * 2 + 1], rows[segs * 2]);
}

// ───────────── 原型库 ─────────────

const E = PALETTE.env;
const TRUNK_DARK = rgb(0x4a3530);
const TRUNK = rgb(E.trunk);

interface CanopyColors {
  dark: number;
  mid: number;
  light: number;
}

/**
 * 阔叶树：树干 + 两根枝杈 + 三层叶团(底层宽而暗、中层、顶层小而亮)。
 * colors 省略为青绿树冠；传入则是点缀用的异色树(花树/金叶树)。缩放 1 时顶高约 3.6 米、树冠半径约 1.6 米。
 */
function makeTree(seed: number, colors?: CanopyColors): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const h = rng.range(1.75, 2.15);
  const lean = rng.range(-0.22, 0.22);
  const lean2 = rng.range(-0.18, 0.18);
  addTube(
    b,
    [
      [0, -0.2, 0, 0.3],
      [lean * 0.3, h * 0.4, lean2 * 0.3, 0.2],
      [lean * 0.8, h * 0.85, lean2 * 0.8, 0.14],
      [lean, h + 0.95, lean2, 0.06],
    ],
    { sides: 5, c0: TRUNK_DARK, c1: TRUNK, sway0: 0, sway1: 0.15 },
  );
  const dark = rgb(colors?.dark ?? E.canopyDark);
  const mid = rgb(colors?.mid ?? E.canopy);
  const light = rgb(colors?.light ?? E.canopyLight);
  const center: [number, number, number] = [lean, h + 0.35, lean2];
  const a0 = rng.range(0, TAU);
  // 底层：三片，宽而暗；各有一根枝杈从树干伸过去
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i / 3) * TAU + rng.range(-0.3, 0.3);
    const d = rng.range(0.56, 0.7);
    const r = rng.range(0.86, 1.0);
    const x = lean + Math.cos(a) * d;
    const z = lean2 + Math.sin(a) * d;
    const y = h + rng.range(-0.05, 0.14);
    if (i < 2) addTube(b, [[lean * 0.7, h * 0.72, lean2 * 0.7, 0.08], [x * 0.75 + lean * 0.25, y - 0.12, z * 0.75 + lean2 * 0.25, 0.04]], { sides: 3, c0: TRUNK_DARK, c1: TRUNK, sway1: 0.2 });
    addLeafClump(b, x, y, z, r, { lobes: 8, dark: scaleRgb(dark, 0.9), mid: mixRgb(dark, mid, 0.55), light: mixRgb(dark, mid, 0.95), seed: seed + i * 13, sway0: 0.3, sway1: 0.55, puffCenter: center, puff: 0.35, thick: 0.5 });
  }
  // 中层：两三片，往里收
  const midN = 2 + rng.int(2);
  for (let i = 0; i < midN; i++) {
    const a = a0 + Math.PI / 3 + (i / midN) * TAU + rng.range(-0.35, 0.35);
    const d = rng.range(0.32, 0.46);
    const r = rng.range(0.72, 0.86);
    addLeafClump(b, lean + Math.cos(a) * d, h + rng.range(0.5, 0.64), lean2 + Math.sin(a) * d, r, { lobes: 8, dark, mid, light: mixRgb(mid, light, 0.28), seed: seed + 50 + i * 17, sway0: 0.4, sway1: 0.7, puffCenter: center, puff: 0.35, thick: 0.52 });
  }
  // 顶层：一片，小而亮(受光的树梢)
  addLeafClump(b, lean + rng.range(-0.12, 0.12), h + rng.range(1.02, 1.14), lean2 + rng.range(-0.12, 0.12), rng.range(0.6, 0.7), { lobes: 7, dark: mixRgb(dark, mid, 0.7), mid: mixRgb(mid, light, 0.3), light: mixRgb(mid, light, 0.62), seed: seed + 99, sway0: 0.55, sway1: 0.85, puffCenter: center, puff: 0.3, thick: 0.6 });
  return finish(b);
}

/** 垂枝树(近河)：两层叶团，冠下垂着一圈随风摆的细枝条 */
function makeWillow(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const h = rng.range(2.0, 2.4);
  const lean = rng.range(-0.3, 0.3);
  addTube(b, [[0, -0.2, 0, 0.28], [lean * 0.4, h * 0.5, 0, 0.19], [lean, h, 0.05, 0.12], [lean * 1.1, h + 0.7, 0.05, 0.05]], { sides: 5, c0: TRUNK_DARK, c1: TRUNK, sway1: 0.15 });
  const dark = rgb(0x2a6a52);
  const mid = rgb(0x5a9c62);
  const light = rgb(0xa9d072);
  const center: [number, number, number] = [lean, h + 0.2, 0];
  const a0 = rng.range(0, TAU);
  const spots: [number, number, number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i / 3) * TAU + rng.range(-0.25, 0.25);
    const d = rng.range(0.55, 0.7);
    const r = rng.range(0.85, 1.0);
    const x = lean + Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = h + rng.range(0, 0.15);
    spots.push([x, y, z, r]);
    addLeafClump(b, x, y, z, r, { lobes: 8, dark, mid: mixRgb(dark, mid, 0.7), light: mid, seed: seed + i * 7, sway0: 0.35, sway1: 0.6, puffCenter: center, puff: 0.35, thick: 0.5 });
  }
  addLeafClump(b, lean, h + 0.68, 0, 0.82, { lobes: 8, dark: mixRgb(dark, mid, 0.5), mid, light, seed: seed + 41, sway0: 0.5, sway1: 0.8, puffCenter: center, puff: 0.25, thick: 0.5 });
  // 垂枝：从底层叶团的边缘挂下来
  const strands = 9;
  for (let i = 0; i < strands; i++) {
    const sp = spots[i % 3];
    const a = rng.range(0, TAU);
    const x = sp[0] + Math.cos(a) * sp[3] * rng.range(0.6, 0.92);
    const z = sp[2] + Math.sin(a) * sp[3] * rng.range(0.6, 0.92);
    const y0 = sp[1] + 0.02;
    const len = rng.range(0.8, 1.35);
    const w = 0.045;
    const dx = Math.cos(a + 1.57) * w;
    const dz = Math.sin(a + 1.57) * w;
    const v0 = b.vertex(x - dx, y0, z - dz, mid, Math.cos(a), 0.3, Math.sin(a), 0.4);
    const v1 = b.vertex(x + dx, y0, z + dz, mid, Math.cos(a), 0.3, Math.sin(a), 0.4);
    const v2 = b.vertex(x - dx * 0.7, y0 - len * 0.55, z - dz * 0.7, mixRgb(mid, light, 0.5), Math.cos(a), 0.3, Math.sin(a), 0.9);
    const v3 = b.vertex(x + dx * 0.7, y0 - len * 0.55, z + dz * 0.7, mixRgb(mid, light, 0.5), Math.cos(a), 0.3, Math.sin(a), 0.9);
    const v4 = b.vertex(x, y0 - len, z, light, Math.cos(a), 0.3, Math.sin(a), 1.4);
    b.quad(v0, v1, v3, v2);
    b.tri(v2, v3, v4);
  }
  return finish(b);
}

/** 远景用的简化阔叶树(装饰带上成片种植)：两片叶团 */
function makeFarTree(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const h = rng.range(1.7, 2.3);
  addTube(b, [[0, -0.2, 0, 0.26], [0, h + 0.5, 0, 0.1]], { sides: 4, c0: TRUNK_DARK, c1: TRUNK });
  const dark = rgb(E.canopyDark);
  const mid = rgb(E.canopy);
  const light = rgb(E.canopyLight);
  const r = rng.range(1.2, 1.5);
  const center: [number, number, number] = [0, h, 0];
  addLeafClump(b, 0, h, 0, r, { lobes: 6, dark, mid: mixRgb(dark, mid, 0.7), light: mid, seed, sway0: 0.25, sway1: 0.55, puffCenter: center, puff: 0.3, thick: 0.6 });
  addLeafClump(b, rng.range(-0.3, 0.3), h + r * 0.5, rng.range(-0.3, 0.3), r * 0.68, { lobes: 6, dark: mixRgb(dark, mid, 0.6), mid: mixRgb(mid, light, 0.4), light, seed: seed + 3, sway0: 0.5, sway1: 0.8, puffCenter: center, puff: 0.3, thick: 0.6 });
  return finish(b);
}

/** 星松：三层伞状枝叶的针叶树 */
function makePine(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const h = rng.range(3.2, 4.4);
  addTube(b, [[0, -0.2, 0, 0.22], [0, h * 0.5, 0, 0.12]], { sides: 5, c0: TRUNK_DARK, c1: TRUNK });
  const tiers = 3;
  const dark = rgb(0x1c5648);
  const light = rgb(0x5ea562);
  for (let t = 0; t < tiers; t++) {
    const y0 = h * (0.22 + t * 0.24);
    const y1 = y0 + h * 0.36;
    const r = (1.25 - t * 0.33) * rng.range(0.9, 1.1);
    const sides = 7;
    const cBot = mixRgb(dark, light, t * 0.18);
    const cTop = mixRgb(dark, light, 0.45 + t * 0.2);
    const tip = b.vertex(0, y1, 0, cTop, 0, 1, 0, 0.5 + t * 0.2);
    const ring: number[] = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * TAU + t * 0.4;
      const rr = r * (0.9 + hash2(s, t, seed) * 0.2);
      const nx = Math.cos(a) * 0.8;
      const nz = Math.sin(a) * 0.8;
      ring.push(b.vertex(Math.cos(a) * rr, y0 - (s % 2) * 0.12, Math.sin(a) * rr, cBot, nx, 0.6, nz, 0.3 + t * 0.15));
    }
    for (let s = 0; s < sides; s++) b.tri(ring[s], tip, ring[(s + 1) % sides]);
  }
  return finish(b);
}

/** 灌木：两三片贴地的小叶团 */
function makeShrub(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const dark = rgb(E.canopyDark);
  const mid = rgb(E.canopy);
  const light = mixRgb(mid, rgb(E.canopyLight), 0.55);
  const n = 2 + rng.int(2);
  const center: [number, number, number] = [0, 0.1, 0];
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU);
    const d = i === 0 ? 0 : rng.range(0.28, 0.5);
    const r = i === 0 ? rng.range(0.52, 0.66) : rng.range(0.34, 0.46);
    addLeafClump(b, Math.cos(a) * d, r * (i === 0 ? 0.42 : 0.22), Math.sin(a) * d, r, { lobes: 6, dark, mid, light, seed: seed + i * 5, sway0: 0.05, sway1: 0.3, puffCenter: center, puff: 0.35, thick: 0.62 });
  }
  return finish(b);
}

/**
 * 一块凿出来的岩石：从球出发，用几刀随机的平面把鼓出去的部分削平(大的平切面 + 削不到的地方保持圆钝)，再压扁、垫平底面。
 * 顶点共用，由调用方统一按折痕角算法线：切面之间是利落的棱，切面内是平的——不再是一个每个面都一样大的正多面体。
 */
function addRockChunk(b: MeshBuilder, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, seed: number, detail: number, bottom: RGB, top: RGB): void {
  const ico = icosphere(detail);
  const rng = new Rng(seed * 31 + 7);
  const cuts: [number, number, number, number][] = [];
  const nCuts = detail > 0 ? 6 : 3;
  for (let i = 0; i < nCuts; i++) {
    // 刀的朝向：第一刀朝上(一块平顶)，其余朝四周略偏上
    const a = rng.range(0, TAU);
    const up = i === 0 ? rng.range(0.75, 0.95) : rng.range(-0.1, 0.55);
    const h = Math.sqrt(Math.max(0, 1 - up * up));
    cuts.push([Math.cos(a) * h, up, Math.sin(a) * h, rng.range(0.52, 0.82)]);
  }
  const base = b.vertexCount;
  for (let i = 0; i < ico.verts.length; i++) {
    let [x, y, z] = ico.verts[i];
    for (const [nx, ny, nz, d] of cuts) {
      const over = x * nx + y * ny + z * nz - d;
      if (over > 0) {
        x -= nx * over;
        y -= ny * over;
        z -= nz * over;
      }
    }
    const k = 1 + (hash2(i, seed, 71) - 0.5) * 0.1;
    // 底面垫平(半埋在地里)
    const yy = Math.max(-0.42, y * k);
    const t = Math.min(1, Math.max(0, (yy + 0.42) / 1.2));
    const c = scaleRgb(mixRgb(bottom, top, t * t * (3 - 2 * t)), 0.94 + hash2(i, seed, 5) * 0.12);
    b.vertex(cx + x * k * rx, cy + yy * ry, cz + z * k * rz, c, 0, 1, 0, 0, 0, 0, 0.68 + 0.32 * t);
  }
  for (const [a, bb, c] of ico.tris) b.tri(base + a, base + bb, base + c);
}

function makeRock(seed: number, big: boolean): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const dark = rgb(E.rockDark);
  const light = rgb(E.rockLight);
  // 大石：一块主体 + 一两块靠在旁边的小块；碎石：单独一小块
  const n = big ? 2 + rng.int(2) : 1;
  for (let i = 0; i < n; i++) {
    const r = i === 0 ? 1 : rng.range(0.42, 0.66);
    const a = rng.range(0, TAU);
    const d = i === 0 ? 0 : rng.range(0.68, 0.95);
    addRockChunk(
      b,
      Math.cos(a) * d,
      r * rng.range(0.28, 0.42),
      Math.sin(a) * d,
      r * rng.range(0.9, 1.2),
      r * rng.range(0.62, 0.9),
      r * rng.range(0.8, 1.1),
      seed + i * 7,
      big && i === 0 ? 1 : 0,
      mixRgb(dark, light, 0.15),
      mixRgb(dark, light, 0.85),
    );
  }
  b.computeNormals(35);
  return finish(b);
}

/** 水晶簇：颜色写成白→浅色渐变，实例色偏决定色相 */
function makeCrystalCluster(seed: number, big: boolean): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const n = big ? 5 + rng.int(3) : 3 + rng.int(2);
  const c0: RGB = [0.5, 0.5, 0.5];
  const c1: RGB = [1, 1, 1];
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const a = rng.range(0, TAU);
    const d = main ? 0 : rng.range(0.22, 0.5) * (big ? 1.5 : 1);
    const h = (main ? rng.range(1.1, 1.5) : rng.range(0.45, 0.95)) * (big ? 1.7 : 1);
    const r = h * rng.range(0.13, 0.18);
    const tilt = main ? rng.range(-0.12, 0.12) : rng.range(0.25, 0.6);
    addCrystal(b, Math.cos(a) * d, 0, Math.sin(a) * d, h, r, Math.sin(a) * tilt, -Math.cos(a) * tilt, c0, c1, main ? 1 : 0.8, seed + i);
  }
  // 基座碎石
  addBlob(b, 0, 0.05, 0, big ? 0.9 : 0.5, 0.22, big ? 0.9 : 0.5, { detail: 0, bump: 0.2, seed, bottom: [0.22, 0.24, 0.3], top: [0.4, 0.43, 0.5], flat: true });
  return finish(b);
}

/** 断柱：鼓形柱身分节，顶端残缺；带一圈发光符文带(aFx.y) */
function makePillar(seed: number, tall: boolean): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const stone = rgb(0xb9b6ac);
  const stoneDark = rgb(0x7d7c82);
  const h = tall ? rng.range(2.3, 3.2) : rng.range(0.9, 1.6);
  const r = 0.34;
  // 方形柱础
  addTube(b, [[0, -0.2, 0, r * 1.75], [0, 0.22, 0, r * 1.75], [0, 0.34, 0, r * 1.25]], { sides: 4, c0: stoneDark, c1: stone, cap: false });
  const drums = Math.max(2, Math.round(h / 0.7));
  let y = 0.34;
  for (let i = 0; i < drums; i++) {
    const dh = (h - 0.34) / drums;
    const off = i === 0 ? 0 : rng.range(-0.03, 0.03);
    addTube(
      b,
      [
        [off, y, off, r * 1.02],
        [off, y + dh * 0.1, off, r],
        [off, y + dh * 0.9, off, r * 0.98],
        [off, y + dh, off, r * 1.02],
      ],
      { sides: 8, c0: mixRgb(stoneDark, stone, 0.3 + i * 0.12), c1: stone, cap: i === drums - 1 },
    );
    y += dh;
  }
  // 发光符文带
  const band = 0.34 + (h - 0.34) * 0.62;
  addTube(b, [[0, band, 0, r * 1.06], [0, band + 0.1, 0, r * 1.06]], { sides: 8, c0: [1, 1, 1], c1: [1, 1, 1], glow: 1 });
  // 顶端的残块
  addBlob(b, rng.range(-0.1, 0.1), h + 0.08, rng.range(-0.1, 0.1), r * 0.9, 0.2, r * 0.8, { detail: 0, bump: 0.25, seed, bottom: stoneDark, top: stone, flat: true });
  return finish(b);
}

/**
 * 伞菇组团(0.5~0.8 米)：伞盖底色用白(实例色偏定色)，伞面带几颗浅斑，伞下是浅色的菌褶。
 * glow = 伞盖的自发光强度(只有约三成的菇丛发光，由实例的 glow 倍率决定)。
 */
function makeMushrooms(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const n = 2 + rng.int(2);
  const stem: RGB = [0.78, 0.74, 0.64];
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU);
    const d = i === 0 ? 0 : rng.range(0.24, 0.42);
    const h = i === 0 ? rng.range(0.42, 0.58) : rng.range(0.2, 0.36);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const lean = rng.range(-0.08, 0.08);
    addTube(b, [[x, -0.05, z, h * 0.15], [x + lean * 0.5, h * 0.6, z + lean * 0.5, h * 0.1], [x + lean, h, z + lean, h * 0.12]], { sides: 5, c0: scaleRgb(stem, 0.7), c1: stem });
    const cr = h * rng.range(0.52, 0.68);
    // 伞下的菌褶：一个浅色的倒锥
    const gill = b.vertex(x + lean, h - cr * 0.1, z + lean, scaleRgb(stem, 0.9), 0, -1, 0);
    const rim: number[] = [];
    for (let s = 0; s < 7; s++) {
      const sa = (s / 7) * TAU;
      rim.push(b.vertex(x + lean + Math.cos(sa) * cr * 0.96, h + cr * 0.1, z + lean + Math.sin(sa) * cr * 0.96, scaleRgb(stem, 1.08), Math.cos(sa) * 0.4, -0.8, Math.sin(sa) * 0.4));
    }
    for (let s = 0; s < 7; s++) b.tri(gill, rim[s], rim[(s + 1) % 7]);
    addBlob(b, x + lean, h + cr * 0.1, z + lean, cr, cr * 0.52, cr, { detail: 1, bump: 0.03, seed: seed + i, bottom: [0.55, 0.55, 0.55], top: [1, 1, 1], glow: 0.35, team: 1, cutBelow: -0.05 });
    // 伞面的浅斑
    for (let k = 0; k < 3; k++) {
      const sa = rng.range(0, TAU);
      const sr = cr * rng.range(0.3, 0.6);
      const sy = h + cr * 0.1 + cr * 0.52 * Math.sqrt(Math.max(0, 1 - (sr * sr) / (cr * cr))) + 0.006;
      const cxp = x + lean + Math.cos(sa) * sr;
      const czp = z + lean + Math.sin(sa) * sr;
      const ss = cr * rng.range(0.1, 0.16);
      const c: RGB = [1, 0.97, 0.86];
      const v0 = b.vertex(cxp - ss, sy, czp, c, 0, 1, 0);
      const v1 = b.vertex(cxp, sy, czp + ss, c, 0, 1, 0);
      const v2 = b.vertex(cxp + ss, sy, czp, c, 0, 1, 0);
      const v3 = b.vertex(cxp, sy, czp - ss, c, 0, 1, 0);
      b.quad(v0, v1, v2, v3);
    }
  }
  return finish(b);
}

/** 层架菌：长在崖壁上的两三层半圆菌盖。局部 +x 朝外(离开岩壁)，原点在岩壁上 */
function makeBracketFungus(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const n = 2 + rng.int(2);
  for (let i = 0; i < n; i++) {
    const y = i * rng.range(0.16, 0.24);
    const r = rng.range(0.2, 0.32) * (1 - i * 0.15);
    const off = rng.range(-0.15, 0.15);
    // 菌盖：靠崖壁的中心暗、不发光(并压一档环境光)，只有外沿一圈带微光——有明有暗才有体积，不是一片平涂的贴纸
    const c0: RGB = [0.45, 0.45, 0.45];
    const c1: RGB = [0.86, 0.86, 0.86];
    const center = b.vertex(-0.03, y + 0.07, off, c0, 0.2, 1, 0, 0, 0, 1, 0.7);
    const ring: number[] = [];
    const segs = 6;
    for (let s = 0; s <= segs; s++) {
      const a = -Math.PI / 2 + (s / segs) * Math.PI;
      ring.push(b.vertex(Math.cos(a) * r, y, off + Math.sin(a) * r * 1.2, c1, Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5, 0, 0.5, 1));
    }
    for (let s = 0; s < segs; s++) b.tri(center, ring[s + 1], ring[s]);
    // 菌盖底面(浅色)
    const under = b.vertex(-0.03, y - 0.07, off, [0.7, 0.66, 0.56], 0, -1, 0);
    for (let s = 0; s < segs; s++) b.tri(under, ring[s], ring[s + 1]);
  }
  return finish(b);
}

/**
 * 灯果 / 星铃草：弯垂的茎上挂着 2~3 颗发光的果实(或铃形小花)。
 * fruit = 果实颜色(底 → 顶)，白色时由实例色偏定色。
 */
function makeLanternPlant(seed: number, fruitA: RGB, fruitB: RGB, glow: number, small = false): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const leafDark = rgb(0x2f6a45);
  const leaf = rgb(0x5a9c56);
  const stems = 2 + rng.int(2);
  const k = small ? 0.6 : 1;
  for (let i = 0; i < stems; i++) {
    const a = (i / stems) * TAU + rng.range(-0.5, 0.5);
    const h = rng.range(0.9, 1.5) * k;
    const reach = rng.range(0.35, 0.6) * k;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const tipX = dx * reach;
    const tipZ = dz * reach;
    addTube(
      b,
      [
        [0, -0.05, 0, 0.05 * k],
        [dx * reach * 0.25, h * 0.6, dz * reach * 0.25, 0.04 * k],
        [dx * reach * 0.7, h, dz * reach * 0.7, 0.03 * k],
        [tipX, h * 0.86, tipZ, 0.02 * k],
      ],
      { sides: 3, c0: leafDark, c1: leaf, sway0: 0, sway1: 0.5 },
    );
    const fr = rng.range(0.13, 0.18) * (small ? 0.75 : 1);
    addBlob(b, tipX, h * 0.86 - fr * 1.1, tipZ, fr, fr * 1.25, fr, { detail: 1, seed: seed + i, bottom: fruitA, top: fruitB, glow, swayBottom: 0.55, swayTop: 0.5, team: small ? 1 : 0 });
  }
  // 基部叶丛：几片向外摊开的叶
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + rng.range(-0.3, 0.3);
    addFrond(b, 0, 0.02, 0, Math.cos(a), Math.sin(a), 0.36 * k, 0.07 * k, 0.14 * k, 0.06, leafDark, leaf, 0.15, 2);
  }
  return finish(b);
}

/** 蕨丛：5~7 片向外拱起再垂下的羽叶 */
function makeFern(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const c0 = rgb(0x2f6a48);
  const c1 = rgb(0x7fb25a);
  const n = 5 + rng.int(3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.35, 0.35);
    const len = rng.range(0.42, 0.7);
    addFrond(b, 0, 0, 0, Math.cos(a), Math.sin(a), len, rng.range(0.07, 0.1), len * rng.range(0.45, 0.7), len * 0.3, c0, mixRgb(c1, [0.7, 0.9, 0.5], rng.next() * 0.4), 0.6);
  }
  return finish(b);
}

/**
 * 藤蔓：从原点垂下 1 米的锥形细带(4 段) + 6 片小叶。局部 +x 朝外(离开岩壁)；长度用 y 向缩放调。
 */
function makeVine(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const stemC = rgb(0x3a6a3e);
  const leafC = rgb(0x6fa850);
  const leafL = rgb(0x9cc866);
  const segs = 4;
  const w = 0.045;
  const rows: number[] = [];
  const wob = rng.range(0, TAU);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const z = Math.sin(wob + t * 4) * 0.07 * t;
    const x = 0.06 + 0.03 * Math.sin(wob * 2 + t * 3);
    const y = -t;
    const ww = w * (1 - t * 0.7);
    rows.push(b.vertex(x, y, z - ww, stemC, 1, 0.2, 0, t * 0.5), b.vertex(x, y, z + ww, stemC, 1, 0.2, 0, t * 0.5));
  }
  for (let i = 0; i < segs; i++) b.quad(rows[i * 2], rows[i * 2 + 1], rows[i * 2 + 3], rows[i * 2 + 2]);
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.6) / 6.4;
    const side = i % 2 === 0 ? 1 : -1;
    const z0 = Math.sin(wob + t * 4) * 0.07 * t;
    const s = rng.range(0.09, 0.14);
    const c = mixRgb(leafC, leafL, rng.next());
    const v0 = b.vertex(0.07, -t, z0, scaleRgb(c, 0.8), 1, 0.3, 0, t * 0.6);
    const v1 = b.vertex(0.1, -t - s * 0.25, z0 + side * s, c, 1, 0.3, 0, t * 0.8);
    const v2 = b.vertex(0.09, -t - s * 1.2, z0 + side * s * 0.35, c, 1, 0.3, 0, t * 0.9);
    b.tri(v0, v1, v2);
  }
  return finish(b);
}

/** 草帘：挂在崖沿上向外下垂的三四片长叶。局部 +x 朝外，原点在崖沿上 */
function makeRimDrape(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const c0 = rgb(E.cliffGrass);
  const c1 = rgb(0xa2c860);
  const n = 3 + rng.int(2);
  for (let i = 0; i < n; i++) {
    const a = rng.range(-0.7, 0.7);
    const len = rng.range(0.34, 0.6);
    addFrond(b, rng.range(-0.1, 0.05), 0.02, rng.range(-0.25, 0.25), Math.cos(a), Math.sin(a), len, rng.range(0.05, 0.075), len * 0.3, len * rng.range(0.7, 1.1), scaleRgb(c0, rng.range(0.85, 1.05)), c1, 1.0, 2);
  }
  return finish(b);
}

/** 芦苇与香蒲：一丛细长叶 + 两根香蒲穗 */
function makeReeds(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const c0 = rgb(0x4a7a3c);
  const c1 = rgb(0xa8bf66);
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, TAU);
    const x = Math.cos(a) * rng.range(0, 0.16);
    const z = Math.sin(a) * rng.range(0, 0.16);
    const h = rng.range(0.7, 1.25);
    const lean = rng.range(0.05, 0.3);
    const w = rng.range(0.03, 0.045);
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const v0 = b.vertex(x - dz * w, 0, z + dx * w, c0, 0, 1, 0, 0);
    const v1 = b.vertex(x + dz * w, 0, z - dx * w, c0, 0, 1, 0, 0);
    const v2 = b.vertex(x + dx * lean * 0.4 - dz * w * 0.7, h * 0.6, z + dz * lean * 0.4 + dx * w * 0.7, mixRgb(c0, c1, 0.6), 0, 1, 0, 0.45);
    const v3 = b.vertex(x + dx * lean * 0.4 + dz * w * 0.7, h * 0.6, z + dz * lean * 0.4 - dx * w * 0.7, mixRgb(c0, c1, 0.6), 0, 1, 0, 0.45);
    const v4 = b.vertex(x + dx * lean, h, z + dz * lean, c1, 0, 1, 0, 1);
    b.quad(v0, v1, v3, v2);
    b.tri(v2, v3, v4);
  }
  const spike = rgb(0x6a4630);
  for (let i = 0; i < 2; i++) {
    const a = rng.range(0, TAU);
    const x = Math.cos(a) * 0.1;
    const z = Math.sin(a) * 0.1;
    const h = rng.range(1.0, 1.4);
    addTube(b, [[x, 0, z, 0.018], [x, h, z, 0.014]], { sides: 3, c0, c1: mixRgb(c0, c1, 0.5), sway0: 0, sway1: 0.6 });
    addTube(b, [[x, h - 0.02, z, 0.045], [x, h + 0.22, z, 0.045], [x, h + 0.3, z, 0.012]], { sides: 4, c0: spike, c1: scaleRgb(spike, 1.25), sway0: 0.6, sway1: 0.75 });
  }
  return finish(b);
}

/** 花丛：三朵成簇的五瓣小花(花瓣为白，实例色偏定色)，花心暖黄 */
function makeFlowers(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const leaf = rgb(0x4f9048);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.4, 0.4);
    const d = rng.range(0.08, 0.2);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = rng.range(0.12, 0.22);
    const s0 = b.vertex(x - 0.012, 0, z, scaleRgb(leaf, 0.7), 0, 1, 0, 0);
    const s1 = b.vertex(x + 0.012, 0, z, scaleRgb(leaf, 0.7), 0, 1, 0, 0);
    const s2 = b.vertex(x, h, z, leaf, 0, 1, 0, 0.5);
    b.tri(s0, s1, s2);
    const r = rng.range(0.1, 0.13);
    const c = b.vertex(x, h + 0.025, z, [1, 0.85, 0.4], 0, 1, 0, 0.5);
    const pa0 = rng.range(0, TAU);
    for (let p = 0; p < 5; p++) {
      const pa = pa0 + (p / 5) * TAU;
      const w = 0.42;
      const t0 = b.vertex(x + Math.cos(pa - w) * r * 0.75, h + 0.012, z + Math.sin(pa - w) * r * 0.75, [0.92, 0.92, 0.92], 0, 1, 0, 0.5, 0, 1);
      const t1 = b.vertex(x + Math.cos(pa) * r, h + 0.004, z + Math.sin(pa) * r, [1, 1, 1], 0, 1, 0, 0.5, 0, 1);
      const t2 = b.vertex(x + Math.cos(pa + w) * r * 0.75, h + 0.012, z + Math.sin(pa + w) * r * 0.75, [0.92, 0.92, 0.92], 0, 1, 0, 0.5, 0, 1);
      b.quad(c, t2, t1, t0);
    }
  }
  return finish(b);
}

/** 矮草簇：三片带明暗渐变的浅色叶片(根暗、尖亮)，每片两段 */
function makeTuft(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const base = rgb(0x4f8a44);
  const mid = rgb(0x7fb04e);
  const tip = rgb(0xb4cf68);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.6, 0.6);
    const h = rng.range(0.2, 0.36);
    const w = rng.range(0.035, 0.05);
    const out = rng.range(0.08, 0.2);
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const v0 = b.vertex(dx * 0.03 + dz * w, 0, dz * 0.03 - dx * w, base, 0, 1, 0, 0);
    const v1 = b.vertex(dx * 0.03 - dz * w, 0, dz * 0.03 + dx * w, base, 0, 1, 0, 0);
    const v2 = b.vertex(dx * out * 0.5 + dz * w * 0.7, h * 0.6, dz * out * 0.5 - dx * w * 0.7, mid, 0, 1, 0, 0.5);
    const v3 = b.vertex(dx * out * 0.5 - dz * w * 0.7, h * 0.6, dz * out * 0.5 + dx * w * 0.7, mid, 0, 1, 0, 0.5);
    const v4 = b.vertex(dx * out, h, dz * out, tip, 0, 1, 0, 1);
    b.quad(v0, v1, v3, v2);
    b.tri(v2, v3, v4);
  }
  return finish(b);
}

/**
 * 旗帜：旗杆 + 垂挂的长幡(白色，实例色偏定队伍色)，幡面朝 +z(镜头方向)，下摆呈燕尾，随风摆动。
 */
function makeBanner(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const wood = rgb(0x5a4336);
  const gold = rgb(0xe8b84a);
  const poleH = 4.2;
  addTube(b, [[0, -0.2, 0, 0.09], [0, poleH, 0, 0.07]], { sides: 6, c0: scaleRgb(wood, 0.7), c1: wood });
  // 横杆与杆顶金饰
  addTube(b, [[-0.62, poleH - 0.35, 0, 0.045], [0.62, poleH - 0.35, 0, 0.045]], { sides: 5, c0: gold, c1: gold });
  addCrystal(b, 0, poleH - 0.05, 0, 0.5, 0.11, 0, 0, gold, scaleRgb(gold, 1.3), 0.25, 5);
  // 幡面：4 列 × 6 行，越往下摆动越大
  const cols = 4;
  const rows = 6;
  const w = 1.1;
  const len = 2.5;
  const top = poleH - 0.38;
  const grid: number[][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: number[] = [];
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const x = (u - 0.5) * w;
      // 燕尾：下摆中间收上去
      const notch = r === rows ? Math.abs(u - 0.5) * 2 * 0.36 - 0.36 : 0;
      const y = top - t * len - notch;
      const edge = Math.abs(u - 0.5) > 0.38;
      const shade = 0.82 + 0.18 * (1 - t) + (edge ? 0.06 : 0);
      const col: RGB = edge || r === 0 ? gold : [shade, shade, shade];
      // 金边不吃队伍色偏：只有幡面(team 蒙版 = 1)被实例色偏染色
      row.push(b.vertex(x, y, 0.06, col, 0, 0.15, 1, t * t * 0.9, 0, edge || r === 0 ? 0 : 1, 1));
    }
    grid.push(row);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) b.quad(grid[r][c], grid[r + 1][c], grid[r + 1][c + 1], grid[r][c + 1]);
  // 幡面上的星徽(菱形)
  const cy = top - len * 0.42;
  const s = 0.2;
  const e0 = b.vertex(0, cy + s * 1.5, 0.075, gold, 0, 0, 1, 0.16, 0.3);
  const e1 = b.vertex(-s, cy, 0.075, gold, 0, 0, 1, 0.2, 0.3);
  const e2 = b.vertex(0, cy - s * 1.5, 0.075, gold, 0, 0, 1, 0.26, 0.3);
  const e3 = b.vertex(s, cy, 0.075, gold, 0, 0, 1, 0.2, 0.3);
  b.quad(e0, e1, e2, e3);
  return finish(b);
}

/** 水晶火盆柱：石柱 + 顶上悬浮的发光晶体(白色，实例色偏定队伍色；晶体部分走 team 蒙版以保持亮度) */
function makeBrazier(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const stone: RGB = [1, 1, 1];
  const stoneDark: RGB = [0.6, 0.62, 0.68];
  addTube(b, [[0, -0.2, 0, 0.5], [0, 0.25, 0, 0.5], [0, 0.4, 0, 0.3], [0, 1.5, 0, 0.24], [0, 1.65, 0, 0.42], [0, 1.85, 0, 0.46]], { sides: 6, c0: stoneDark, c1: stone, cap: true });
  const gold = rgb(0xe8b84a);
  addTube(b, [[0, 1.86, 0, 0.5], [0, 1.96, 0, 0.5]], { sides: 6, c0: gold, c1: gold, cap: true });
  return finish(b);
}

/** 火盆上方的晶体(单独一个原型：整体走队伍色并发光) */
function makeBrazierCrystal(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  addCrystal(b, 0, 2.25, 0, 0.95, 0.2, 0, 0, [0.75, 0.75, 0.75], [1, 1, 1], 1, 3);
  // 下半截倒锥，凑成悬浮的双尖晶体
  addCrystal(b, 0, 2.3, 0, 0.42, 0.2, Math.PI, 0, [0.75, 0.75, 0.75], [1, 1, 1], 1, 4);
  return finish(b);
}

/** 低矮的环形遗迹石：营地周围的残石(高度 ≤ 0.45，不遮挡单位) */
function makeRuinStone(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const stone = rgb(0xa9a6a0);
  const dark = rgb(0x6f6e78);
  const w = rng.range(0.4, 0.7);
  const h = rng.range(0.22, 0.45);
  const d = rng.range(0.28, 0.4);
  addBlob(b, 0, h * 0.45, 0, w, h, d, { detail: 0, bump: 0.12, seed, bottom: dark, top: stone, flat: true });
  return finish(b);
}

/** 荷叶(河面漂浮)：扁圆片 + 缺口，叶缘略翘、带一圈深色叶脉 */
function makeLilyPad(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const c0 = rgb(0x3f8f55);
  const c1 = rgb(0x79b862);
  const c2 = rgb(0x4f9a50);
  const seg = 10;
  const gap = rng.range(0.45, 0.8);
  const center = b.vertex(0, 0.012, 0, c0, 0, 1, 0);
  const mid: number[] = [];
  const ring: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = gap * 0.5 + (i / seg) * (TAU - gap);
    const k = 0.94 + 0.06 * Math.sin(i * 2.1 + seed);
    mid.push(b.vertex(Math.cos(a) * 0.55, 0.014, Math.sin(a) * 0.55, i % 2 === 0 ? c1 : c2, 0, 1, 0));
    ring.push(b.vertex(Math.cos(a) * k, 0.03, Math.sin(a) * k, scaleRgb(c1, 0.92), Math.cos(a) * 0.3, 0.95, Math.sin(a) * 0.3));
  }
  for (let i = 0; i < seg; i++) {
    b.tri(center, mid[i + 1], mid[i]);
    b.quad(mid[i], mid[i + 1], ring[i + 1], ring[i]);
  }
  return finish(b);
}

/** 荷花花苞：立在水面上的一枚尖苞(白色，实例色偏定色) + 短茎 */
function makeLotusBud(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  addTube(b, [[0, -0.1, 0, 0.02], [0, 0.22, 0, 0.018]], { sides: 3, c0: rgb(0x3f7a48), c1: rgb(0x5a9c56), sway1: 0.3 });
  const n = 5;
  const tip = b.vertex(0, 0.5, 0, [1, 1, 1], 0, 1, 0, 0.4, 0.15, 1);
  const base = b.vertex(0, 0.2, 0, [0.75, 0.75, 0.75], 0, -1, 0, 0.3, 0, 1);
  const ring: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    ring.push(b.vertex(Math.cos(a) * 0.1, 0.31, Math.sin(a) * 0.1, [0.9, 0.9, 0.9], Math.cos(a), 0.3, Math.sin(a), 0.35, 0.1, 1));
  }
  for (let i = 0; i < n; i++) {
    b.tri(ring[i], tip, ring[(i + 1) % n]);
    b.tri(base, ring[i], ring[(i + 1) % n]);
  }
  return finish(b);
}

export interface PropLibrary {
  trees: THREE.BufferGeometry[];
  /** 点缀用的异色树：[粉白花树, 金叶树] */
  accentTrees: THREE.BufferGeometry[];
  willows: THREE.BufferGeometry[];
  farTrees: THREE.BufferGeometry[];
  pines: THREE.BufferGeometry[];
  shrubs: THREE.BufferGeometry[];
  rocks: THREE.BufferGeometry[];
  boulders: THREE.BufferGeometry[];
  crystals: THREE.BufferGeometry[];
  bigCrystals: THREE.BufferGeometry[];
  pillars: THREE.BufferGeometry[];
  tallPillars: THREE.BufferGeometry[];
  mushrooms: THREE.BufferGeometry[];
  brackets: THREE.BufferGeometry[];
  /** 琥珀灯果(暖光) */
  lanterns: THREE.BufferGeometry[];
  /** 星铃草(河岸，微光；铃花为白，实例色偏定色) */
  bells: THREE.BufferGeometry[];
  ferns: THREE.BufferGeometry[];
  vines: THREE.BufferGeometry[];
  drapes: THREE.BufferGeometry[];
  reeds: THREE.BufferGeometry[];
  flowers: THREE.BufferGeometry[];
  tufts: THREE.BufferGeometry[];
  ruinStones: THREE.BufferGeometry[];
  lilyPads: THREE.BufferGeometry[];
  lotusBud: THREE.BufferGeometry;
  banner: THREE.BufferGeometry;
  brazier: THREE.BufferGeometry;
  brazierCrystal: THREE.BufferGeometry;
  dispose(): void;
}

/** 树模型在缩放 1 时的大致顶高 / 树冠半径 / 树冠中心高度(摆树时算镜头遮挡用) */
export const TREE_TOP = 3.6;
export const TREE_CANOPY = 1.6;
export const TREE_CROWN_Y = 2.5;

export function createPropLibrary(): PropLibrary {
  const many = (n: number, f: (seed: number) => THREE.BufferGeometry, seed0: number): THREE.BufferGeometry[] => Array.from({ length: n }, (_, i) => f(seed0 + i * 101));
  const amberA = rgb(E.amber);
  const lib = {
    trees: many(4, (sd) => makeTree(sd), 11),
    accentTrees: [makeTree(211, { dark: 0xb86a84, mid: 0xe8a9b8, light: 0xffe3ea }), makeTree(223, { dark: 0x8a6a34, mid: 0xc49a4a, light: 0xe8d08e })],
    willows: many(2, makeWillow, 307),
    farTrees: many(3, makeFarTree, 17),
    pines: many(3, makePine, 23),
    shrubs: many(3, makeShrub, 37),
    rocks: many(4, (s) => makeRock(s, false), 41),
    boulders: many(3, (s) => makeRock(s, true), 53),
    crystals: many(3, (s) => makeCrystalCluster(s, false), 67),
    bigCrystals: many(2, (s) => makeCrystalCluster(s, true), 79),
    pillars: many(2, (s) => makePillar(s, false), 83),
    tallPillars: many(2, (s) => makePillar(s, true), 97),
    mushrooms: many(3, makeMushrooms, 103),
    brackets: many(2, makeBracketFungus, 109),
    lanterns: many(2, (s) => makeLanternPlant(s, scaleRgb(amberA, 1.0), [1, 0.5, 0.18], 1), 113),
    bells: many(2, (s) => makeLanternPlant(s, [0.8, 0.8, 0.8], [1, 1, 1], 0.5, true), 211),
    ferns: many(3, makeFern, 157),
    vines: many(3, makeVine, 163),
    drapes: many(3, makeRimDrape, 167),
    reeds: many(2, makeReeds, 173),
    flowers: many(3, makeFlowers, 127),
    tufts: many(4, makeTuft, 131),
    ruinStones: many(3, makeRuinStone, 139),
    lilyPads: many(2, makeLilyPad, 149),
    lotusBud: makeLotusBud(),
    banner: makeBanner(),
    brazier: makeBrazier(),
    brazierCrystal: makeBrazierCrystal(),
  };
  const all: THREE.BufferGeometry[] = [];
  for (const v of Object.values(lib)) {
    if (Array.isArray(v)) all.push(...v);
    else all.push(v);
  }
  return { ...lib, dispose: () => all.forEach((g) => g.dispose()) };
}

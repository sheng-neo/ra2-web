/**
 * 场景点缀物的程序化原型：树 / 松 / 灌木 / 岩石 / 水晶簇 / 断柱 / 蘑菇 / 灯笼果 / 花丛 / 草簇 / 旗帜 / 火盆 等。
 * 每个原型是带 position/normal/color/aFx 的 BufferGeometry(局部原点在落地点)，由 SceneryBatcher 合并进分块网格。
 * 颜色写进顶点色(线性)，实例再乘一个色偏；发光部件用 aFx.y，随风摆动的部件用 aFx.x。
 */
import * as THREE from 'three';
import { PALETTE, Rng, hash2 } from '../materials';
import { MeshBuilder, type RGB, lerp, mixRgb, rgb, scaleRgb } from './geo';

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

interface BlobOpts {
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
function addBlob(b: MeshBuilder, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, o: BlobOpts): void {
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

interface TubeOpts {
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
function addTube(b: MeshBuilder, path: [number, number, number, number][], o: TubeOpts): void {
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
function addCrystal(b: MeshBuilder, x: number, y: number, z: number, h: number, r: number, tiltX: number, tiltZ: number, c0: RGB, c1: RGB, glow: number, seed: number): void {
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

// ───────────── 原型库 ─────────────

const E = PALETTE.env;

/** 阔叶树。colors 省略为青绿树冠；传入则是点缀用的异色树(花树/金叶树) */
function makeTree(seed: number, colors?: { dark: number; mid: number; light: number }): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const h = rng.range(1.5, 2.1);
  const lean = rng.range(-0.25, 0.25);
  const lean2 = rng.range(-0.2, 0.2);
  const trunkDark = rgb(0x4d3530);
  const trunk = rgb(E.trunk);
  addTube(
    b,
    [
      [0, -0.2, 0, 0.3],
      [lean * 0.3, h * 0.35, lean2 * 0.3, 0.2],
      [lean * 0.8, h * 0.75, lean2 * 0.8, 0.15],
      [lean, h, lean2, 0.11],
    ],
    { sides: 5, c0: trunkDark, c1: trunk, sway0: 0, sway1: 0.15 },
  );
  // 树冠：一个主团 + 几个错落的副团，法线朝树冠中心外推，读成一个蓬松的整体
  const cy = h + 0.55;
  const center: [number, number, number] = [lean, cy - 0.45, lean2];
  const dark = rgb(colors?.dark ?? E.canopyDark);
  const mid = rgb(colors?.mid ?? E.canopy);
  const light = rgb(colors?.light ?? E.canopyLight);
  const mainR = rng.range(1.05, 1.3);
  addBlob(b, lean, cy, lean2, mainR, mainR * 0.8, mainR, { detail: 1, bump: 0.06, seed, bottom: dark, top: mixRgb(mid, light, 0.42), swayBottom: 0.25, swayTop: 0.6, puffCenter: center, puff: 0.4, cutBelow: -0.4 });
  const blobs = 3 + rng.int(2);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * TAU + rng.range(-0.4, 0.4);
    const d = mainR * rng.range(0.6, 0.82);
    const r = mainR * rng.range(0.5, 0.66);
    const y = cy + rng.range(-0.4, 0.2);
    addBlob(b, lean + Math.cos(a) * d, y, lean2 + Math.sin(a) * d, r, r * 0.8, r, {
      detail: 1,
      bump: 0.07,
      seed: seed + i * 13,
      bottom: scaleRgb(dark, 0.9),
      top: mixRgb(mid, light, rng.range(0.1, 0.5)),
      swayBottom: 0.3,
      swayTop: 0.7,
      puffCenter: center,
      puff: 0.55,
      cutBelow: -0.3,
    });
  }
  // 顶部亮团：受光的树梢
  addBlob(b, lean + rng.range(-0.25, 0.1), cy + mainR * 0.5, lean2 + rng.range(-0.1, 0.25), mainR * 0.55, mainR * 0.4, mainR * 0.55, {
    detail: 1,
    bump: 0.07,
    seed: seed + 99,
    bottom: mixRgb(mid, light, 0.25),
    top: mixRgb(mid, light, 0.7),
    swayBottom: 0.5,
    swayTop: 0.8,
    puffCenter: center,
    puff: 0.5,
    cutBelow: -0.2,
  });
  return finish(b);
}

/** 远景用的简化阔叶树(装饰带上成片种植)：低面数的两团树冠 */
function makeFarTree(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const h = rng.range(1.6, 2.3);
  addTube(b, [[0, -0.2, 0, 0.26], [0, h, 0, 0.12]], { sides: 4, c0: rgb(0x4d3530), c1: rgb(E.trunk) });
  const dark = rgb(E.canopyDark);
  const mid = rgb(E.canopy);
  const light = rgb(E.canopyLight);
  const r = rng.range(1.15, 1.45);
  const center: [number, number, number] = [0, h, 0];
  addBlob(b, 0, h + 0.5, 0, r, r * 0.8, r, { detail: 1, bump: 0.1, seed, bottom: dark, top: mixRgb(mid, light, 0.35), swayBottom: 0.25, swayTop: 0.6, puffCenter: center, puff: 0.3, cutBelow: -0.3 });
  addBlob(b, rng.range(-0.5, 0.5), h + 0.5 + r * 0.55, rng.range(-0.5, 0.5), r * 0.6, r * 0.45, r * 0.6, { detail: 0, bump: 0.1, seed: seed + 3, bottom: mid, top: mixRgb(mid, light, 0.8), swayBottom: 0.5, swayTop: 0.8, puffCenter: center, puff: 0.4 });
  return finish(b);
}

function makePine(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const h = rng.range(3.2, 4.4);
  addTube(b, [[0, -0.2, 0, 0.22], [0, h * 0.5, 0, 0.12]], { sides: 5, c0: rgb(0x47332c), c1: rgb(E.trunk) });
  const tiers = 3;
  const dark = rgb(0x1f6a55);
  const light = rgb(0x5fb568);
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

function makeShrub(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const dark = rgb(E.canopyDark);
  const light = mixRgb(rgb(E.canopy), rgb(E.canopyLight), 0.4);
  const n = 2;
  const center: [number, number, number] = [0, 0.1, 0];
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU);
    const d = i === 0 ? 0 : rng.range(0.3, 0.55);
    const r = i === 0 ? rng.range(0.5, 0.68) : rng.range(0.32, 0.48);
    addBlob(b, Math.cos(a) * d, r * 0.62, Math.sin(a) * d, r, r * 0.78, r, { detail: i === 0 ? 1 : 0, bump: 0.08, seed: seed + i, bottom: dark, top: light, swayBottom: 0.05, swayTop: 0.35, puffCenter: center, puff: 0.45, cutBelow: -0.45 });
  }
  return finish(b);
}

function makeRock(seed: number, big: boolean): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const dark = rgb(E.rockDark);
  const light = rgb(E.rockLight);
  const n = big ? 1 + rng.int(2) : 1;
  for (let i = 0; i < n; i++) {
    const r = i === 0 ? 1 : rng.range(0.45, 0.7);
    const a = rng.range(0, TAU);
    const d = i === 0 ? 0 : rng.range(0.7, 1.0);
    addBlob(b, Math.cos(a) * d, r * rng.range(0.25, 0.45), Math.sin(a) * d, r * rng.range(0.85, 1.15), r * rng.range(0.6, 0.95), r * rng.range(0.8, 1.1), {
      detail: big && i === 0 ? 1 : 0,
      bump: big ? 0.16 : 0.22,
      seed: seed + i * 7,
      bottom: mixRgb(dark, light, 0.25),
      top: mixRgb(dark, light, 0.85),
      flat: true,
    });
  }
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
  const stone = rgb(0xcfd3da);
  const stoneDark = rgb(0x8d93a2);
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

/** 蘑菇丛：伞盖底色用白(实例色偏定色)，伞缘微微发光 */
function makeMushrooms(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const n = 2 + rng.int(2);
  const stem: RGB = [0.75, 0.72, 0.62];
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU);
    const d = i === 0 ? 0 : rng.range(0.16, 0.34);
    const h = i === 0 ? rng.range(0.34, 0.5) : rng.range(0.16, 0.3);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const lean = rng.range(-0.06, 0.06);
    addTube(b, [[x, -0.05, z, h * 0.16], [x + lean, h, z + lean, h * 0.12]], { sides: 4, c0: scaleRgb(stem, 0.7), c1: stem });
    const cr = h * rng.range(0.5, 0.7);
    addBlob(b, x + lean, h + cr * 0.12, z + lean, cr, cr * 0.5, cr, { detail: 1, bump: 0.04, seed: seed + i, bottom: [0.5, 0.5, 0.5], top: [1, 1, 1], glow: 0.35, team: 1 });
  }
  return finish(b);
}

/** 灯笼果：弯垂的茎上挂着 2~3 颗发暖光的果实 */
function makeLanternPlant(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const leafDark = rgb(0x2f6a45);
  const leaf = rgb(0x5aa85a);
  const stems = 2 + rng.int(2);
  for (let i = 0; i < stems; i++) {
    const a = (i / stems) * TAU + rng.range(-0.5, 0.5);
    const h = rng.range(0.9, 1.5);
    const reach = rng.range(0.35, 0.6);
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const tipX = dx * reach;
    const tipZ = dz * reach;
    addTube(
      b,
      [
        [0, -0.05, 0, 0.05],
        [dx * reach * 0.25, h * 0.6, dz * reach * 0.25, 0.04],
        [dx * reach * 0.7, h, dz * reach * 0.7, 0.03],
        [tipX, h * 0.86, tipZ, 0.02],
      ],
      { sides: 3, c0: leafDark, c1: leaf, sway0: 0, sway1: 0.5 },
    );
    const fr = rng.range(0.13, 0.18);
    addBlob(b, tipX, h * 0.86 - fr * 1.1, tipZ, fr, fr * 1.25, fr, { detail: 1, seed: seed + i, bottom: [1, 0.66, 0.3], top: [1, 0.42, 0.14], glow: 1, swayBottom: 0.55, swayTop: 0.5 });
  }
  // 基部叶丛
  addBlob(b, 0, 0.14, 0, 0.36, 0.2, 0.36, { detail: 0, bump: 0.12, seed, bottom: leafDark, top: leaf, swayTop: 0.15 });
  return finish(b);
}

/** 花丛：3~4 朵小花(花瓣为白，实例色偏定色)。每朵 = 一根茎 + 一个朝上的四瓣菱形 */
function makeFlowers(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const leaf = rgb(0x4f9a4c);
  const n = 3 + rng.int(2);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU);
    const d = rng.range(0.05, 0.3);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = rng.range(0.16, 0.3);
    const s0 = b.vertex(x - 0.014, 0, z, scaleRgb(leaf, 0.7), 0, 1, 0, 0);
    const s1 = b.vertex(x + 0.014, 0, z, scaleRgb(leaf, 0.7), 0, 1, 0, 0);
    const s2 = b.vertex(x, h, z, leaf, 0, 1, 0, 0.5);
    b.tri(s0, s1, s2);
    const r = rng.range(0.06, 0.085);
    const c = b.vertex(x, h + 0.02, z, [1, 0.9, 0.5], 0, 1, 0, 0.5);
    const ring: number[] = [];
    for (let p = 0; p < 4; p++) {
      const pa = (p / 4) * TAU + a;
      ring.push(b.vertex(x + Math.cos(pa) * r, h, z + Math.sin(pa) * r, [1, 1, 1], 0, 1, 0, 0.5, 0, 1));
    }
    for (let p = 0; p < 4; p++) b.tri(c, ring[(p + 1) % 4], ring[p]);
  }
  return finish(b);
}

/** 矮草簇：4~6 片单三角叶(镜头距离下足够)，叶尖亮、根部暗 */
function makeTuft(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const base = rgb(0x3f8a45);
  const tip = rgb(0xa8d05a);
  const n = 4 + rng.int(3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.5, 0.5);
    const h = rng.range(0.2, 0.4);
    const w = rng.range(0.04, 0.06);
    const out = rng.range(0.08, 0.22);
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const v0 = b.vertex(dx * 0.03 + dz * w, 0, dz * 0.03 - dx * w, base, 0, 1, 0, 0);
    const v1 = b.vertex(dx * 0.03 - dz * w, 0, dz * 0.03 + dx * w, base, 0, 1, 0, 0);
    const v2 = b.vertex(dx * out, h, dz * out, tip, 0, 1, 0, 1);
    b.tri(v0, v1, v2);
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
  const stone = rgb(0xb9bec8);
  const dark = rgb(0x7c8494);
  const w = rng.range(0.4, 0.7);
  const h = rng.range(0.22, 0.45);
  const d = rng.range(0.28, 0.4);
  addBlob(b, 0, h * 0.45, 0, w, h, d, { detail: 0, bump: 0.12, seed, bottom: dark, top: stone, flat: true });
  return finish(b);
}

/** 莲叶(河面漂浮)：扁圆片 + 缺口 */
function makeLilyPad(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const c0 = rgb(0x3f9a58);
  const c1 = rgb(0x7cc66a);
  const seg = 9;
  const gap = rng.range(0.5, 0.9);
  const center = b.vertex(0, 0.012, 0, c0, 0, 1, 0);
  const ring: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = gap * 0.5 + (i / seg) * (TAU - gap);
    ring.push(b.vertex(Math.cos(a), 0, Math.sin(a), c1, 0, 1, 0));
  }
  for (let i = 0; i < seg; i++) b.tri(center, ring[i + 1], ring[i]);
  return finish(b);
}

export interface PropLibrary {
  trees: THREE.BufferGeometry[];
  /** 点缀用的异色树：[粉白花树, 金叶树] */
  accentTrees: THREE.BufferGeometry[];
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
  lanterns: THREE.BufferGeometry[];
  flowers: THREE.BufferGeometry[];
  tufts: THREE.BufferGeometry[];
  ruinStones: THREE.BufferGeometry[];
  lilyPads: THREE.BufferGeometry[];
  banner: THREE.BufferGeometry;
  brazier: THREE.BufferGeometry;
  brazierCrystal: THREE.BufferGeometry;
  dispose(): void;
}

export function createPropLibrary(): PropLibrary {
  const many = (n: number, f: (seed: number) => THREE.BufferGeometry, seed0: number): THREE.BufferGeometry[] => Array.from({ length: n }, (_, i) => f(seed0 + i * 101));
  const lib = {
    trees: many(4, (sd) => makeTree(sd), 11),
    accentTrees: [makeTree(211, { dark: 0xc2608f, mid: 0xf09abc, light: 0xffe0ec }), makeTree(223, { dark: 0xa8742a, mid: 0xe0aa3e, light: 0xffe28a })],
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
    lanterns: many(2, makeLanternPlant, 113),
    flowers: many(3, makeFlowers, 127),
    tufts: many(4, makeTuft, 131),
    ruinStones: many(3, makeRuinStone, 139),
    lilyPads: many(2, makeLilyPad, 149),
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

/**
 * 兵线与野区的装饰构件(原创纹样统一用「八芒星 + 环」与星轨刻线)：
 *   星灯柱   八角座、收分柱身、四面开窗的灯室(内嵌琥珀发光晶)、八角攒尖顶，高 1.5 米；
 *   残碑     斜立的断顶石板，正面星轨刻线微微发光；另有倒卧版(高 ≤ 0.3 米)；
 *   队旗     2.6 米旗杆 + 随风摆的三角旗(队伍色)；
 *   系石桩   渡口四角的矮石桩(≤ 0.45 米)；
 *   守望像   2.4 米的兜帽立像，双手捧一只浑仪环，立在方座上，没有面部；
 *   地面嵌饰 贴地的星轨石环残片(≤ 0.05 米)。
 * 摆放规则：高物(星灯柱、立碑、守望像)只进崖脚壁龛(cliffs.ts 在指定位置把第一级石台加宽)，立在 0.85 米高的台面上；
 * 队旗只插在防御塔的碰撞圈内；开阔路段只放矮物(倒卧残碑、地面嵌饰、系石桩)。全部并进景物分块网格。
 */
import * as THREE from 'three';
import { distToSegment, pointInPolygon } from '../../core/map';
import type { Vec2 } from '../../core/types';
import { PALETTE, Rng, hash2 } from '../materials';
import type { CliffInfo } from './cliffs';
import type { MapField } from './field';
import { MeshBuilder, type RGB, type SceneryBatcher, mixRgb, rgb, scaleRgb } from './geo';
import { addSlab } from './lanes';
import { addBlob, addCrystal, addTube } from './models';
import type { MoteSource } from './motes';
import { type GlowGrid, type ScatterResult, faceDir, trs } from './scatter';

const TAU = Math.PI * 2;
const E = PALETTE.env;
const STONE = rgb(0xb3aca0);
const STONE_DARK = rgb(0x7d7a7c);
const STONE_WARM = rgb(0xc6b99c);
const AMBER = rgb(E.amber);
const GOLD = rgb(0xd9a94a);

const _m = new THREE.Matrix4();

/** 一个轴对齐小方块(局部坐标，按面给法线)：柱、框、台座的基本件 */
function addBox(b: MeshBuilder, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, top: RGB, side: RGB, glow = 0): void {
  _m.makeTranslation(cx, cy - sy / 2 + 0.04, cz);
  addSlab(b, _m, sx, sz, sy, 0, top, side, glow);
}

/** 星灯柱：局部原点在落地点，+x 为正面 */
function makeStarLamp(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  // 八角座(两级)
  addTube(b, [[0, -0.1, 0, 0.36], [0, 0.1, 0, 0.36], [0, 0.14, 0, 0.3], [0, 0.24, 0, 0.3], [0, 0.28, 0, 0.2]], { sides: 8, c0: STONE_DARK, c1: STONE, flat: true });
  // 收分柱身 + 柱颈
  addTube(b, [[0, 0.28, 0, 0.15], [0, 0.82, 0, 0.11], [0, 0.86, 0, 0.17], [0, 0.93, 0, 0.19]], { sides: 8, c0: mixRgb(STONE_DARK, STONE, 0.5), c1: STONE, cap: true });
  // 灯室：四根角柱 + 内嵌的琥珀晶
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const x = Math.cos(a) * 0.16;
    const z = Math.sin(a) * 0.16;
    addTube(b, [[x, 0.93, z, 0.03], [x, 1.2, z, 0.03]], { sides: 4, c0: STONE_DARK, c1: STONE });
  }
  addCrystal(b, 0, 0.95, 0, 0.26, 0.085, 0, 0, scaleRgb(AMBER, 0.85), [1, 0.86, 0.55], 1, 7);
  // 八角攒尖顶：出檐 → 收尖 → 顶珠
  addTube(b, [[0, 1.19, 0, 0.27], [0, 1.23, 0, 0.29], [0, 1.3, 0, 0.17], [0, 1.44, 0, 0.045], [0, 1.52, 0, 0.03]], { sides: 8, c0: STONE_DARK, c1: mixRgb(STONE, STONE_WARM, 0.5), cap: true });
  addBlob(b, 0, 1.55, 0, 0.045, 0.045, 0.045, { detail: 0, seed: 3, bottom: GOLD, top: scaleRgb(GOLD, 1.2), glow: 0.2 });
  return b.build();
}

/** 星轨刻线：石面上一组发微光的同心弧与一颗八芒星(薄片，略浮出石面) */
function addStarTrail(b: MeshBuilder, toWorld: (u: number, v: number, lift: number) => [number, number, number], nx: number, ny: number, nz: number, size: number, glow: number, seed: number): void {
  const col: RGB = [0.62, 0.9, 0.95];
  const strip = (pts: [number, number][], w: number): void => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [u0, v0] = pts[i];
      const [u1, v1] = pts[i + 1];
      const du = u1 - u0;
      const dv = v1 - v0;
      const l = Math.hypot(du, dv) || 1;
      const ou = (-dv / l) * w;
      const ov = (du / l) * w;
      const P = [toWorld(u0 - ou, v0 - ov, 0.012), toWorld(u0 + ou, v0 + ov, 0.012), toWorld(u1 + ou, v1 + ov, 0.012), toWorld(u1 - ou, v1 - ov, 0.012)];
      const idx = P.map((p) => b.vertex(p[0], p[1], p[2], col, nx, ny, nz, 0, glow, 0, 1));
      b.quad(idx[0], idx[1], idx[2], idx[3]);
      b.quad(idx[3], idx[2], idx[1], idx[0]);
    }
  };
  // 三道同心弧(星轨)
  for (let k = 0; k < 3; k++) {
    const r = size * (0.42 + k * 0.22);
    const a0 = 0.5 + hash2(k, seed, 5) * 0.8;
    const span = 1.5 + hash2(k, seed, 9) * 1.2;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (span * i) / 6;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    strip(pts, size * 0.022);
  }
  // 中心的小八芒星
  const star: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * TAU;
    const r = size * (i % 2 === 0 ? 0.2 : 0.09);
    star.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  strip(star, size * 0.02);
}

/** 残碑(立)：斜立的断顶石板，正面(+x)有星轨刻线 */
function makeStele(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const w = 1.1;
  const t = 0.2;
  const h = rng.range(1.35, 1.6);
  // 石板：底宽顶略窄，顶部一道斜向断口
  const cut = rng.range(0.2, 0.45) * (rng.chance(0.5) ? 1 : -1);
  const P = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
  const y0 = -0.15;
  const hz = w / 2;
  const hzT = hz * 0.9;
  const hx = t / 2;
  const yl = h - Math.max(0, cut);
  const yr = h + Math.min(0, cut);
  const V = [P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y0, hz), P(-hx, y0, hz), P(-hx * 0.85, yl, -hzT), P(hx * 0.85, yl, -hzT), P(hx * 0.85, yr, hzT), P(-hx * 0.85, yr, hzT)];
  const face = (ia: number, ib: number, ic: number, id: number, c0: RGB, c1: RGB): void => {
    const a = V[ia];
    const bb = V[ib];
    const c = V[ic];
    const ux = bb[0] - a[0];
    const uy = bb[1] - a[1];
    const uz = bb[2] - a[2];
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
    const idx = [ia, ib, ic, id].map((i, k) => b.vertex(V[i][0], V[i][1], V[i][2], k < 2 ? c0 : c1, nx, ny, nz, 0, 0, 0, k < 2 ? 0.75 : 1));
    b.quad(idx[0], idx[1], idx[2], idx[3]);
  };
  const dark = mixRgb(STONE_DARK, STONE, 0.35);
  face(1, 2, 6, 5, dark, STONE); // 正面 +x
  face(3, 0, 4, 7, dark, scaleRgb(STONE, 0.9)); // 背面
  face(0, 1, 5, 4, dark, STONE);
  face(2, 3, 7, 6, dark, STONE);
  face(4, 5, 6, 7, STONE_WARM, STONE_WARM); // 断口
  addStarTrail(b, (u, v, lift) => [hx * 0.93 + lift, 0.2 + (h - 0.35) * 0.52 + v, u], 1, 0, 0, 0.42, 0.4, seed);
  // 碑座：一圈碎石
  addBlob(b, 0, 0.02, 0.1, 0.34, 0.14, 0.62, { detail: 0, bump: 0.2, seed, bottom: STONE_DARK, top: STONE, flat: true });
  return b.build();
}

/** 残碑(倒卧)：平躺的断碑，高 ≤ 0.3 米，朝上的面有星轨刻线 */
function makeFallenStele(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const len = rng.range(1.1, 1.5);
  _m.makeRotationZ(rng.range(0.03, 0.09)).setPosition(0, 0.02, 0);
  addSlab(b, _m, len, 0.95, 0.16, 0.03, STONE, mixRgb(STONE_DARK, STONE, 0.4));
  addStarTrail(b, (u, v, lift) => [u, 0.185 + lift + u * 0.05, v], 0, 1, 0, 0.36, 0.3, seed);
  // 断下来的一角
  _m.makeRotationY(rng.range(0.3, 0.9)).setPosition(len * 0.5 + 0.32, 0, rng.range(-0.2, 0.2));
  addSlab(b, _m, 0.42, 0.5, 0.13, 0.03, scaleRgb(STONE, 0.94), STONE_DARK);
  return b.build();
}

/** 队旗：2.6 米旗杆 + 三角旗(白色，实例色偏定队伍色)，旗面朝 +z 飘 */
function makeFlag(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const wood = rgb(0x5a4336);
  addTube(b, [[0, -0.1, 0, 0.055], [0, 2.6, 0, 0.04]], { sides: 5, c0: scaleRgb(wood, 0.7), c1: wood });
  addBlob(b, 0, 2.66, 0, 0.07, 0.09, 0.07, { detail: 0, seed: 5, bottom: GOLD, top: scaleRgb(GOLD, 1.25), glow: 0.15 });
  // 三角旗：3 列，越靠外摆动越大
  const cols = 3;
  const top = 2.52;
  const hgt = 0.72;
  const len = 1.05;
  let prev: [number, number] | null = null;
  for (let c = 0; c <= cols; c++) {
    const u = c / cols;
    const half = (hgt / 2) * (1 - u);
    const z = 0.04 + u * len;
    const shade = 0.86 + 0.14 * (1 - u);
    const a = b.vertex(0, top - hgt / 2 + half, z, [shade, shade, shade], 1, 0.1, 0, u * u * 1.1, 0, 1, 1);
    const d = b.vertex(0, top - hgt / 2 - half, z, [shade * 0.9, shade * 0.9, shade * 0.9], 1, 0.1, 0, u * u * 1.1, 0, 1, 1);
    if (prev) {
      b.quad(prev[0], prev[1], d, a);
      b.quad(a, d, prev[1], prev[0]);
    }
    prev = [a, d];
  }
  return b.build();
}

/** 系石桩：渡口四角的矮石桩(≤ 0.45 米)，腰上一道绳槽 */
function makeMooringPost(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const h = rng.range(0.36, 0.44);
  addTube(b, [[0, -0.08, 0, 0.17], [0, h * 0.5, 0, 0.14], [0, h * 0.56, 0, 0.115], [0, h * 0.66, 0, 0.115], [0, h * 0.72, 0, 0.15], [0, h, 0, 0.13]], { sides: 6, c0: STONE_DARK, c1: STONE, cap: true });
  return b.build();
}

/** 守望像：兜帽立像，双手在胸前捧一只浑仪环。局部 +x 为正面，高约 2.4 米 */
function makeWatcher(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const dark = mixRgb(STONE_DARK, STONE, 0.3);
  // 方座
  addBox(b, 0, 0.34, 0, 0.82, 0.38, 0.82, STONE, dark);
  addBox(b, 0, 0.46, 0, 0.66, 0.12, 0.66, STONE_WARM, STONE);
  // 长袍：下摆宽、腰略收、肩部最宽
  addTube(
    b,
    [
      [0, 0.46, 0, 0.3],
      [0, 0.9, 0, 0.25],
      [0, 1.45, 0, 0.23],
      [0.01, 1.82, 0, 0.3],
      [0.02, 1.96, 0, 0.2],
    ],
    { sides: 8, c0: dark, c1: STONE, cap: true },
  );
  // 兜帽：前倾的椭球，正面一片暗影(没有面部)
  addBlob(b, 0.04, 2.12, 0, 0.22, 0.26, 0.21, { detail: 1, bump: 0.03, seed: 11, bottom: mixRgb(dark, STONE, 0.5), top: STONE_WARM, puffCenter: [0, 2.0, 0], puff: 0.3 });
  const shade: RGB = [0.06, 0.06, 0.09];
  const fc = b.vertex(0.2, 2.08, 0, shade, 1, 0, 0);
  const ring: number[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    ring.push(b.vertex(0.215, 2.08 + Math.sin(a) * 0.15, Math.cos(a) * 0.11, scaleRgb(shade, 1.6), 1, 0, 0));
  }
  for (let i = 0; i < 7; i++) b.tri(fc, ring[i], ring[(i + 1) % 7]);
  // 双臂：从肩向前收到胸前
  for (const s of [-1, 1]) {
    addTube(b, [[0.02, 1.8, s * 0.27, 0.085], [0.14, 1.55, s * 0.3, 0.075], [0.3, 1.42, s * 0.14, 0.06]], { sides: 5, c0: STONE, c1: mixRgb(STONE, STONE_WARM, 0.5), cap: true });
  }
  // 浑仪环：两道互相垂直的八边环 + 中心一粒微光
  const hoop = (tiltAxis: 'x' | 'z'): void => {
    const pts: [number, number, number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * TAU;
      const u = Math.cos(a) * 0.2;
      const v = Math.sin(a) * 0.2;
      pts.push(tiltAxis === 'x' ? [0.36, 1.46 + v, u, 0.02] : [0.36 + u, 1.46 + v * 0.35, v * 0.94, 0.02]);
    }
    addTube(b, pts, { sides: 4, c0: GOLD, c1: scaleRgb(GOLD, 1.15), glow: 0.12 });
  };
  hoop('x');
  hoop('z');
  addBlob(b, 0.36, 1.46, 0, 0.055, 0.055, 0.055, { detail: 0, seed: 2, bottom: [0.7, 0.95, 1], top: [0.9, 1, 1], glow: 0.9 });
  return b.build();
}

/** 地面嵌饰：贴地的星轨石环残片(一段带刻度的弧形石条，高 ≤ 0.05 米) */
function makeInlayArc(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const r0 = 0.95;
  const r1 = 1.3;
  const span = rng.range(1.2, 1.9);
  const segs = 7;
  const y = 0.035;
  const up: RGB = STONE;
  const row: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = -span / 2 + (span * i) / segs;
    const tone = 0.9 + hash2(i, seed, 3) * 0.18;
    row.push(b.vertex(Math.cos(a) * r0, y, Math.sin(a) * r0, scaleRgb(up, tone), 0, 1, 0), b.vertex(Math.cos(a) * r1, y, Math.sin(a) * r1, scaleRgb(up, tone * 0.95), 0, 1, 0));
  }
  for (let i = 0; i < segs; i++) b.quad(row[i * 2], row[i * 2 + 2], row[i * 2 + 3], row[i * 2 + 1]);
  // 刻度：每段一道发微光的短线
  const col: RGB = [0.62, 0.9, 0.95];
  for (let i = 0; i < segs; i++) {
    const a = -span / 2 + (span * (i + 0.5)) / segs;
    const w = 0.02;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const q = [
      [ca * (r0 + 0.08) + sa * w, sa * (r0 + 0.08) - ca * w],
      [ca * (r1 - 0.08) + sa * w, sa * (r1 - 0.08) - ca * w],
      [ca * (r1 - 0.08) - sa * w, sa * (r1 - 0.08) + ca * w],
      [ca * (r0 + 0.08) - sa * w, sa * (r0 + 0.08) + ca * w],
    ];
    const idx = q.map((p) => b.vertex(p[0], y + 0.008, p[1], col, 0, 1, 0, 0, 0.3, 0, 1));
    b.quad(idx[0], idx[1], idx[2], idx[3]);
  }
  return b.build();
}

export interface PropKit {
  starLamp: THREE.BufferGeometry;
  steles: THREE.BufferGeometry[];
  fallenSteles: THREE.BufferGeometry[];
  flag: THREE.BufferGeometry;
  mooringPosts: THREE.BufferGeometry[];
  watcher: THREE.BufferGeometry;
  inlayArcs: THREE.BufferGeometry[];
  dispose(): void;
}

export function createPropKit(): PropKit {
  const kit = {
    starLamp: makeStarLamp(),
    steles: [makeStele(61), makeStele(67)],
    fallenSteles: [makeFallenStele(71), makeFallenStele(73)],
    flag: makeFlag(),
    mooringPosts: [makeMooringPost(79), makeMooringPost(83)],
    watcher: makeWatcher(),
    inlayArcs: [makeInlayArc(89), makeInlayArc(97)],
  };
  const all: THREE.BufferGeometry[] = [];
  for (const v of Object.values(kit)) {
    if (Array.isArray(v)) all.push(...v);
    else all.push(v);
  }
  return { ...kit, dispose: () => all.forEach((g) => g.dispose()) };
}

/** 壁龛之间的最小间隔(米) */
const NICHE_SPACING = 9;

/**
 * 选壁龛的位置：墙体上朝镜头可见的那几面(朝南/朝东/朝西)、离兵线 7 米以内或正对营地的崖脚。
 * 返回与 map.walls 一一对应的位置列表，交给 buildCliff 在那里把第一级石台加宽。
 */
export function pickNiches(field: MapField): Vec2[][] {
  const map = field.map;
  const picked: Vec2[] = [];
  const out: Vec2[][] = map.walls.map(() => []);
  map.walls.forEach((poly, wi) => {
    const cands: { p: Vec2; score: number }[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 6.5) continue;
      const ex = (b.x - a.x) / len;
      const ez = (b.y - a.y) / len;
      // 朝外法线
      let nx = ez;
      let nz = -ex;
      if (pointInPolygon({ x: (a.x + b.x) / 2 + nx * 0.2, y: (a.y + b.y) / 2 + nz * 0.2 }, poly)) {
        nx = -nx;
        nz = -nz;
      }
      // 朝北的崖面背对镜头，不放
      if (nz < -0.35) continue;
      for (let d = 2.6; d <= len - 2.6; d += 1.3) {
        const p = { x: a.x + ex * d, y: a.y + ez * d };
        const fx = p.x + nx * 1.2;
        const fz = p.y + nz * 1.2;
        if (field.riverDist(fx, fz) < 1.5 || field.baseDist(fx, fz) < 2 || field.padDist(fx, fz) < 1 || field.bushDist(fx, fz) < 0.5) continue;
        if (field.boundDist(p.x, p.y) < 3) continue;
        const lane = field.laneDist(fx, fz);
        const camp = field.campDist(fx, fz);
        // 路边的最想要；其次是正对营地的；都不沾边的不放
        let score = 0;
        if (lane > -0.5 && lane < 7) score = 2 - lane * 0.15;
        else if (camp < 7) score = 1 - camp * 0.05;
        if (score <= 0) continue;
        // 朝南(正对镜头)的加分
        score += nz * 0.4 + hash2(Math.round(p.x * 3), Math.round(p.y * 3), 17) * 0.3;
        cands.push({ p, score });
      }
    }
    cands.sort((u, v) => v.score - u.score);
    let n = 0;
    for (const c of cands) {
      if (n >= 3) break;
      if (picked.some((q) => Math.hypot(q.x - c.p.x, q.y - c.p.y) < NICHE_SPACING)) continue;
      picked.push(c.p);
      out[wi].push(c.p);
      n++;
    }
  });
  return out;
}

/** 两条线段族的最近点：点到兵线中心线上最近的那个点 */
function nearestOnLanes(field: MapField, p: Vec2): Vec2 {
  let best = Infinity;
  const out = { x: p.x, y: p.y };
  for (const lane of Object.values(field.map.lanes)) {
    for (let i = 1; i < lane.length; i++) {
      const a = lane[i - 1];
      const b = lane[i];
      const d = distToSegment(p, a, b);
      if (d < best) {
        best = d;
        const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
        const t = Math.min(1, Math.max(0, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
        out.x = a.x + (b.x - a.x) * t;
        out.y = a.y + (b.y - a.y) * t;
      }
    }
  }
  return out;
}

export function placeProps(batch: SceneryBatcher, kit: PropKit, field: MapField, cliffs: CliffInfo[], out: ScatterResult, glow: GlowGrid, motes: MoteSource[]): void {
  const map = field.map;
  const rng = new Rng(9091);

  // ── 壁龛里的高物：星灯柱为主，间或立碑与守望像(守望像优先放在正对营地的壁龛) ──
  cliffs.forEach((cliff) => {
    for (const nc of cliff.niches) {
      const rot = faceDir(nc.ox, nc.oz);
      const fx = nc.x + nc.ox * 1.4;
      const fz = nc.z + nc.oz * 1.4;
      const nearCamp = field.campDist(fx, fz) < 6;
      const roll = rng.next();
      const tone = scaleRgb([1, 1, 1], rng.range(0.9, 1.04));
      if ((nearCamp && roll < 0.55) || roll < 0.12) {
        batch.add(kit.watcher, trs(nc.x - nc.ox * 0.08, nc.y - 0.04, nc.z - nc.oz * 0.08, rot + rng.range(-0.12, 0.12), 0.92), { tint: tone });
        out.aoBlobs.push({ x: nc.x, y: nc.y + 0.03, z: nc.z, r: 0.75, strength: 0.42 });
      } else if (roll < 0.36) {
        batch.add(rng.pick(kit.steles), trs(nc.x - nc.ox * 0.12, nc.y, nc.z - nc.oz * 0.12, rot + rng.range(-0.2, 0.2), 0.95, 0.95, 0, rng.range(-0.1, 0.02)), { tint: tone, glow: 1 });
        out.aoBlobs.push({ x: nc.x, y: nc.y + 0.03, z: nc.z, r: 0.8, strength: 0.4 });
      } else {
        batch.add(kit.starLamp, trs(nc.x + nc.ox * 0.08, nc.y - 0.02, nc.z + nc.oz * 0.08, rot + Math.PI / 8, 1.08), { tint: tone, glow: 1 });
        out.aoBlobs.push({ x: nc.x, y: nc.y + 0.03, z: nc.z, r: 0.6, strength: 0.38 });
        glow.reserve(nc.x, nc.z);
        // 灯光落在壁龛前的地面上
        out.glows.push({ x: fx - nc.ox * 0.3, z: fz - nc.oz * 0.3, y: 0.03, r: 1.8, color: AMBER });
        motes.push({ x: nc.x, y: nc.y + 1.2, z: nc.z, radius: 0.5, color: AMBER, count: 2, mode: 0, range: 0.6, size: 0.6 });
      }
    }
  });

  // ── 队旗：插在每座防御塔的碰撞圈里(离塔心 1.4 米，背向兵线中心的一侧) ──
  const teamCloth: RGB[] = [rgb(0x2f6fe0), rgb(0xd8352c)];
  for (const t of map.towers) {
    const c = nearestOnLanes(field, t.pos);
    let dx = t.pos.x - c.x;
    let dz = t.pos.y - c.y;
    const l = Math.hypot(dx, dz);
    if (l < 0.3) {
      dx = 0.7;
      dz = 0.7;
    } else {
      dx /= l;
      dz /= l;
    }
    // 再朝北偏一点：旗在塔的后面，不挡塔身
    const ax = dx * 0.8;
    const az = dz * 0.8 - 0.6;
    const al = Math.hypot(ax, az) || 1;
    batch.add(kit.flag, trs(t.pos.x + (ax / al) * 1.4, 0, t.pos.y + (az / al) * 1.4, rng.range(-0.3, 0.3), 1), { tint: teamCloth[t.team], maskedTint: true });
  }

  // ── 渡口四角的系石桩：兵线边缘与河岸相交的地方 ──
  const posts: Vec2[] = [];
  const bound = map.bound;
  for (let z = -bound + 1; z < bound - 1; z += 0.35) {
    for (let x = -bound + 1; x < bound - 1; x += 0.35) {
      const ld = field.laneDist(x, z);
      if (ld < 0.3 || ld > 0.65) continue;
      const rd = field.riverDist(x, z);
      if (rd < 0.55 || rd > 0.9) continue;
      if (field.solidDist(x, z) < 0.5) continue;
      if (posts.some((p) => Math.hypot(p.x - x, p.y - z) < 2.2)) continue;
      posts.push({ x, y: z });
    }
  }
  for (const p of posts) batch.add(rng.pick(kit.mooringPosts), trs(p.x, 0, p.y, rng.range(0, TAU), rng.range(0.95, 1.1), 1, rng.range(-0.06, 0.06), rng.range(-0.06, 0.06)), { tint: scaleRgb([1, 1, 1], rng.range(0.88, 1.02)) });

  // ── 开阔路段的矮物：路缘石外侧零星的倒卧残碑与地面嵌饰 ──
  for (const lane of Object.values(map.lanes)) {
    let acc = rng.range(4, 9);
    for (let i = 1; i < lane.length; i++) {
      const a = lane[i - 1];
      const b = lane[i];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      const dx = (b.x - a.x) / segLen;
      const dz = (b.y - a.y) / segLen;
      for (; acc < segLen; acc += rng.range(9, 15)) {
        const side = rng.chance(0.5) ? 1 : -1;
        const off = map.laneWidth / 2 + rng.range(0.75, 1.3);
        const x = a.x + dx * acc - dz * side * off;
        const z = a.y + dz * acc + dx * side * off;
        const kind = rng.next();
        const rot = rng.range(0, TAU);
        if (field.laneDist(x, z) < 0.55 || field.riverDist(x, z) < 1.4 || field.baseDist(x, z) < 1 || field.padDist(x, z) < 0.8 || field.solidDist(x, z) < 0.8 || field.bushDist(x, z) < 0.6 || field.campDist(x, z) < 0.5) continue;
        if (kind < 0.45) batch.add(rng.pick(kit.fallenSteles), trs(x, 0, z, rot, rng.range(0.85, 1.0)), { shadow: false, tint: scaleRgb([1, 1, 1], rng.range(0.86, 1.0)), glow: 1 });
        else batch.add(rng.pick(kit.inlayArcs), trs(x, 0, z, rot, rng.range(0.8, 1.05)), { shadow: false, tint: scaleRgb([1, 1, 1], rng.range(0.82, 0.98)), glow: 1 });
      }
      acc -= segLen;
    }
  }
}

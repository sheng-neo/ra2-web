/**
 * 各营地的环境布景(与野怪配套；地面染色在地表着色器里按同一套主题号画)：
 *   1 霜晶洼地(蓝buff)   邻近崖台上的冰晶簇与挂霜枯枝；营地边半圈矮符石；贴地冷雾、蓝白微粒
 *   2 余烬坑(红buff)     崖台上的焦树桩；营地边三个小喷口；上飘的余烬
 *   3 树根巢穴(苔背獾)   崖面上拱下来的粗树根、崖顶的空心倒木；洞口周围的蘑菇、孢子微粒
 *   4 灯花丛(荧翅蛾)     邻近崖沿上三四朵半米大的发光灯花；琥珀花粉微粒
 *   5 沉渊潭(河道巨龙)   潭边崖台上的断裂星轨石环(1.2~2.2 米高)；潭里压低的残石；水面薄雾、紫色气泡
 *   6 坠星潭(远古巨灵)   邻近崖台上半埋的陨铁碎块(金色熔蚀边)；水面蒸汽；缓慢上升的金屑
 * 高于 0.5 米的东西只放在不可走处(崖顶、崖面)；营地空地里只有矮物。
 */
import * as THREE from 'three';
import type { CampDef } from '../../core/types';
import { PALETTE, Rng } from '../materials';
import { ATMOS_COLORS, type AtmosSpec } from './atmos';
import type { CliffInfo, CliffRimPoint } from './cliffs';
import { CAMP_THEME, type MapField, WATER_LEVEL, campRadius } from './field';
import { MeshBuilder, type RGB, type SceneryBatcher, mixRgb, rgb, scaleRgb } from './geo';
import { type PropLibrary, addBlob, addCrystal, addLeafClump, addTube } from './models';
import type { MoteSource } from './motes';
import { type GlowGrid, type ScatterResult, faceDir, trs } from './scatter';

const TAU = Math.PI * 2;
const E = PALETTE.env;

/** 挂霜的枯枝：一根主干分三四个杈，枝梢泛白 */
function makeFrostBranch(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const bark = rgb(0x5a5f72);
  const frost = rgb(0xd8ecff);
  const h = rng.range(1.3, 1.7);
  const lean = rng.range(-0.25, 0.25);
  addTube(b, [[0, -0.15, 0, 0.12], [lean * 0.5, h * 0.55, 0.05, 0.08], [lean, h, 0.1, 0.04]], { sides: 5, c0: scaleRgb(bark, 0.8), c1: mixRgb(bark, frost, 0.5) });
  const n = 3 + rng.int(2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.4, 0.4);
    const y0 = h * rng.range(0.4, 0.8);
    const len = rng.range(0.45, 0.8);
    const x0 = lean * (y0 / h);
    addTube(b, [[x0, y0, 0.05, 0.05], [x0 + Math.cos(a) * len * 0.6, y0 + len * 0.45, Math.sin(a) * len * 0.6, 0.03], [x0 + Math.cos(a) * len, y0 + len * 0.8, Math.sin(a) * len, 0.012]], { sides: 3, c0: bark, c1: frost });
    // 枝梢的一小粒冰晶
    addCrystal(b, x0 + Math.cos(a) * len, y0 + len * 0.72, Math.sin(a) * len, 0.2, 0.035, rng.range(-0.4, 0.4), rng.range(-0.4, 0.4), [0.6, 0.8, 1], [0.9, 0.97, 1], 0.5, seed + i);
  }
  return b.build();
}

/** 焦树桩：烧黑的半截树干，裂口里透着余烬的橙光 */
function makeCharStump(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const char = rgb(0x2a2224);
  const ash = rgb(0x5a4c4a);
  const h = rng.range(0.7, 1.15);
  addTube(b, [[0, -0.15, 0, 0.36], [0.02, h * 0.4, 0, 0.27], [0.05, h * 0.85, 0.02, 0.22], [0.1, h, 0.06, 0.12]], { sides: 7, c0: char, c1: ash, flat: true });
  // 断口里的余烬
  addBlob(b, 0.05, h * 0.86, 0.02, 0.17, 0.07, 0.17, { detail: 0, seed, bottom: [1, 0.35, 0.08], top: [1, 0.62, 0.2], glow: 0.8 });
  // 两条竖向的发光裂口
  for (let i = 0; i < 2; i++) {
    const a = rng.range(0, TAU);
    const r = 0.3;
    const w = 0.03;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const tx = -Math.sin(a) * w;
    const tz = Math.cos(a) * w;
    const c: RGB = [1, 0.42, 0.1];
    const v0 = b.vertex(x - tx, 0.08, z - tz, c, Math.cos(a), 0, Math.sin(a), 0, 0.9);
    const v1 = b.vertex(x + tx, 0.08, z + tz, c, Math.cos(a), 0, Math.sin(a), 0, 0.9);
    const v2 = b.vertex(x * 0.82, h * 0.6, z * 0.82, c, Math.cos(a), 0, Math.sin(a), 0, 0.5);
    b.tri(v0, v1, v2);
    b.tri(v0, v2, v1);
  }
  // 一根烧秃的残枝
  const a = rng.range(0, TAU);
  addTube(b, [[0.05, h * 0.7, 0, 0.07], [Math.cos(a) * 0.4, h * 0.95, Math.sin(a) * 0.4, 0.03]], { sides: 3, c0: char, c1: ash });
  return b.build();
}

/** 小喷口(≤ 0.3 米)：一圈黑曜岩碎块围着发亮的口 */
function makeVent(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const obs = rgb(0x241a1c);
  const edge = rgb(0x5a3a34);
  addTube(b, [[0, -0.06, 0, 0.42], [0, 0.14, 0, 0.3], [0, 0.26, 0, 0.19], [0, 0.2, 0, 0.13]], { sides: 7, c0: obs, c1: edge, flat: true });
  addBlob(b, 0, 0.17, 0, 0.13, 0.04, 0.13, { detail: 0, seed, bottom: [1, 0.4, 0.1], top: [1, 0.75, 0.3], glow: 1 });
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, TAU);
    addBlob(b, Math.cos(a) * 0.4, 0.05, Math.sin(a) * 0.4, 0.13, 0.1, 0.11, { detail: 0, bump: 0.25, seed: seed + i, bottom: obs, top: edge, flat: true });
  }
  return b.build();
}

/** 空心倒木：横躺的一段粗树干(局部 x 为长轴)，两端露出暗色的空心，身上长着苔 */
function makeHollowLog(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const bark = rgb(0x5a4a3a);
  const barkL = rgb(0x7a6a50);
  const len = rng.range(1.9, 2.4);
  const r = 0.36;
  addTube(b, [[-len / 2, r * 0.9, 0, r], [-len * 0.15, r * 0.92, 0.04, r * 0.96], [len * 0.2, r * 0.88, -0.03, r * 0.92], [len / 2, r * 0.86, 0, r * 0.86]], { sides: 8, c0: bark, c1: barkL });
  // 两端的空心(暗色内凹的圆片)
  for (const s of [-1, 1]) {
    const x = (s * len) / 2;
    const rr = (s < 0 ? r : r * 0.86) * 0.78;
    const cy = s < 0 ? r * 0.9 : r * 0.86;
    const c = b.vertex(x - s * 0.12, cy, 0, [0.03, 0.025, 0.02], s, 0, 0);
    const ring: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ring.push(b.vertex(x + s * 0.005, cy + Math.sin(a) * rr, Math.cos(a) * rr, [0.14, 0.11, 0.08], s, 0, 0));
    }
    for (let i = 0; i < 8; i++) {
      if (s > 0) b.tri(c, ring[i], ring[(i + 1) % 8]);
      else b.tri(c, ring[(i + 1) % 8], ring[i]);
    }
  }
  // 苔与一丛小蘑菇
  addBlob(b, rng.range(-0.4, 0.4), r * 1.72, 0, 0.5, 0.09, 0.3, { detail: 0, bump: 0.2, seed, bottom: rgb(0x4f8a48), top: rgb(0x8fbf58) });
  addBlob(b, len * 0.28, r * 1.75, 0.06, 0.12, 0.07, 0.12, { detail: 0, seed: seed + 1, bottom: rgb(0xb8582e), top: rgb(0xe07a48) });
  return b.build();
}

/** 拱起的粗树根：从崖顶翻下来、贴着崖面一路伸到崖脚。局部 +x 朝外，原点在崖脚，top = 崖高 */
function makeRoots(seed: number, top: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const bark = rgb(0x4a3a2c);
  const barkL = rgb(0x7a6248);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const z0 = (i - 1) * rng.range(0.45, 0.7);
    const z1 = z0 + rng.range(-0.35, 0.35);
    const r = rng.range(0.09, 0.14);
    addTube(
      b,
      [
        [-0.75, top + 0.05, z0 * 0.6, r * 0.8],
        [-0.25, top + 0.22, z0 * 0.8, r],
        [-0.02, top - 0.25, z0, r],
        [-0.08, top * 0.5, (z0 + z1) / 2, r * 0.9],
        [-0.05, 0.3, z1, r * 0.8],
        [-0.02, -0.1, z1 + rng.range(-0.15, 0.15), r * 0.55],
      ],
      { sides: 5, c0: barkL, c1: bark },
    );
  }
  return b.build();
}

/** 灯花：短茎托着一朵半米大的五瓣花，花心是发暖光的球(蛾从花里飞出)。局部 +x 朝外倾 */
function makeLampFlower(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const stem = rgb(0x3f7a48);
  const h = rng.range(0.55, 0.8);
  const fx = 0.28;
  addTube(b, [[0, -0.1, 0, 0.06], [0.08, h * 0.6, 0, 0.05], [fx, h, 0, 0.04]], { sides: 4, c0: scaleRgb(stem, 0.7), c1: stem, sway1: 0.3 });
  // 两片基生叶
  for (const s of [-1, 1]) {
    const v0 = b.vertex(0, 0, 0, scaleRgb(stem, 0.8), 0, 1, 0, 0);
    const v1 = b.vertex(0.1, 0.22, s * 0.3, stem, 0, 1, 0, 0.3);
    const v2 = b.vertex(0.3, 0.1, s * 0.42, rgb(0x6fa850), 0, 1, 0, 0.5);
    b.tri(v0, v1, v2);
    b.tri(v0, v2, v1);
  }
  // 花：五片上翘的花瓣(白色，实例色偏定色) + 发光花心
  const pr = 0.3;
  const c0 = b.vertex(fx, h, 0, [0.85, 0.8, 0.7], 0.3, 1, 0, 0.4, 0.2, 1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + seed;
    const w = 0.5;
    const pt = (ang: number, rad: number, up: number): number => b.vertex(fx + Math.cos(ang) * rad, h + up, Math.sin(ang) * rad, [1, 1, 1], Math.cos(ang) * 0.4, 0.9, Math.sin(ang) * 0.4, 0.5, 0.25, 1);
    const l = pt(a - w, pr * 0.62, 0.06);
    const t = pt(a, pr, 0.16);
    const r2 = pt(a + w, pr * 0.62, 0.06);
    b.quad(c0, r2, t, l);
    b.quad(l, t, r2, c0);
  }
  addBlob(b, fx, h + 0.1, 0, 0.11, 0.11, 0.11, { detail: 1, seed, bottom: [1, 0.72, 0.3], top: [1, 0.9, 0.55], glow: 1, swayBottom: 0.4, swayTop: 0.4 });
  return b.build();
}

/** 断裂的星轨石环：立着的一段弧形石拱(约四分之一圈)，内侧一排发紫光的刻度。局部 +x 朝潭心 */
function makeStarArc(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const stone = rgb(0x8a8796);
  const dark = rgb(0x4f4c62);
  const R = rng.range(1.5, 2.1);
  const span = rng.range(1.2, 1.6);
  const segs = 6;
  const pts: [number, number, number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    const a = -0.15 + (span * i) / segs;
    // 弧在 yz 平面里立着：一端落地，另一端悬在空中断掉
    pts.push([0, Math.sin(a) * R, -Math.cos(a) * R + R * 0.75, 0.19 - i * 0.008]);
  }
  addTube(b, pts, { sides: 4, c0: dark, c1: stone, cap: true, flat: true });
  // 内侧刻度
  for (let i = 0; i < segs; i++) {
    const a = -0.15 + (span * (i + 0.5)) / segs;
    const y = Math.sin(a) * R;
    const z = -Math.cos(a) * R + R * 0.75;
    const c: RGB = [0.75, 0.55, 1];
    const v0 = b.vertex(0.2, y - 0.07, z - 0.02, c, 1, 0, 0, 0, 0.7);
    const v1 = b.vertex(0.2, y + 0.07, z + 0.02, c, 1, 0, 0, 0, 0.7);
    const v2 = b.vertex(0.2, y + 0.05, z + 0.09, c, 1, 0, 0, 0, 0.7);
    const v3 = b.vertex(0.2, y - 0.09, z + 0.05, c, 1, 0, 0, 0, 0.7);
    b.quad(v0, v1, v2, v3);
    b.quad(v3, v2, v1, v0);
  }
  // 落地端的碎石
  addBlob(b, 0, 0.06, -R * 0.26, 0.42, 0.2, 0.36, { detail: 0, bump: 0.22, seed, bottom: dark, top: stone, flat: true });
  return b.build();
}

/** 陨铁碎块：半埋的深色多面体，棱边上一圈金色的熔蚀亮线 */
function makeMeteorChunk(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const iron = rgb(0x3a3f66);
  const ironL = rgb(0x6a72a8);
  const s = rng.range(0.55, 0.85);
  addBlob(b, 0, s * 0.35, 0, s, s * 0.8, s * 0.9, { detail: 1, bump: 0.2, seed, bottom: scaleRgb(iron, 0.7), top: ironL, flat: true });
  addBlob(b, s * 0.8, s * 0.12, s * 0.3, s * 0.4, s * 0.3, s * 0.36, { detail: 0, bump: 0.25, seed: seed + 3, bottom: iron, top: ironL, flat: true });
  // 熔蚀边：几枚金色的小晶刺从裂缝里长出来
  const n = 4 + rng.int(3);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU);
    const r = s * rng.range(0.55, 0.9);
    addCrystal(b, Math.cos(a) * r, s * rng.range(0.15, 0.5), Math.sin(a) * r, s * rng.range(0.3, 0.5), s * 0.07, Math.sin(a) * 0.7, -Math.cos(a) * 0.7, [1, 0.72, 0.3], [1, 0.9, 0.6], 0.8, seed + i);
  }
  return b.build();
}

/** 矮符石(≤ 0.4 米)：一块刻着一道发光符线的小立石 */
function makeRuneStone(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  const stone = rgb(0x9aa0b4);
  const dark = rgb(0x606680);
  const h = rng.range(0.28, 0.38);
  addBlob(b, 0, h * 0.42, 0, 0.26, h * 0.62, 0.19, { detail: 0, bump: 0.14, seed, bottom: dark, top: stone, flat: true });
  const c: RGB = [1, 1, 1];
  const v0 = b.vertex(-0.03, 0.06, 0.2, c, 0, 0.2, 1, 0, 0.8, 1);
  const v1 = b.vertex(0.03, 0.06, 0.2, c, 0, 0.2, 1, 0, 0.8, 1);
  const v2 = b.vertex(0.025, h * 0.72, 0.15, c, 0, 0.2, 1, 0, 0.8, 1);
  const v3 = b.vertex(-0.025, h * 0.72, 0.15, c, 0, 0.2, 1, 0, 0.8, 1);
  b.quad(v0, v1, v2, v3);
  return b.build();
}

/** 霜冻的小叶团：盖着白霜的矮灌木(崖顶) */
function makeFrostShrub(seed: number): THREE.BufferGeometry {
  const b = new MeshBuilder();
  addLeafClump(b, 0, 0.22, 0, 0.55, { lobes: 5, dark: rgb(0x3f6a7a), mid: rgb(0x8fb8c8), light: rgb(0xe8f4ff), seed, sway0: 0.05, sway1: 0.2, thick: 0.6 });
  addLeafClump(b, 0.4, 0.14, 0.2, 0.36, { lobes: 5, dark: rgb(0x3f6a7a), mid: rgb(0x9cc4d4), light: rgb(0xf2f9ff), seed: seed + 3, sway0: 0.05, sway1: 0.2, thick: 0.6 });
  return b.build();
}

interface RimSpot {
  rp: CliffRimPoint;
  cliff: CliffInfo;
  dist: number;
}

/** 营地周围朝着它的崖沿点(由近到远) */
function rimSpotsFacing(cliffs: CliffInfo[], cx: number, cz: number, maxDist: number): RimSpot[] {
  const out: RimSpot[] = [];
  for (const cliff of cliffs) {
    for (const rp of cliff.rim) {
      const dx = cx - rp.x;
      const dz = cz - rp.z;
      const d = Math.hypot(dx, dz);
      if (d > maxDist || d < 0.5) continue;
      // 崖面要朝着营地
      if ((dx / d) * rp.ox + (dz / d) * rp.oz < 0.35) continue;
      out.push({ rp, cliff, dist: d });
    }
  }
  out.sort((a, b) => a.dist - b.dist);
  return out;
}

/** 从候选里按最小间隔挑 n 个 */
function pickSpaced(spots: RimSpot[], n: number, spacing: number, rng: Rng): RimSpot[] {
  const out: RimSpot[] = [];
  for (const s of spots) {
    if (out.length >= n) break;
    if (out.some((o) => Math.hypot(o.rp.x - s.rp.x, o.rp.z - s.rp.z) < spacing)) continue;
    if (rng.chance(0.25)) continue;
    out.push(s);
  }
  return out;
}

const CAMP_GLOW: Record<number, RGB> = {
  1: rgb(0x9fe0ff),
  2: rgb(0xff8a3c),
  3: rgb(0xc8e890),
  4: rgb(E.amber),
  5: rgb(0xb48cff),
  6: rgb(0xffd880),
};

export function decorateCamps(
  batch: SceneryBatcher,
  lib: PropLibrary,
  field: MapField,
  cliffs: CliffInfo[],
  out: ScatterResult,
  glow: GlowGrid,
  motes: MoteSource[],
  atmos: AtmosSpec[],
): void {
  const protos = {
    frostBranch: [makeFrostBranch(401), makeFrostBranch(409)],
    frostShrub: makeFrostShrub(419),
    charStump: [makeCharStump(421), makeCharStump(431)],
    vent: makeVent(433),
    log: makeHollowLog(439),
    lampFlower: [makeLampFlower(443), makeLampFlower(449)],
    starArc: [makeStarArc(457), makeStarArc(461)],
    meteor: [makeMeteorChunk(463), makeMeteorChunk(467)],
    rune: [makeRuneStone(479), makeRuneStone(487)],
  };
  const rootProtos = new Map<number, THREE.BufferGeometry>();
  const temp: THREE.BufferGeometry[] = [];

  const onTop = (s: RimSpot, back: number): [number, number, number] => {
    const d = s.rp.inset + back;
    return [s.rp.x - s.rp.ox * d, s.cliff.topY(d) - 0.03, s.rp.z - s.rp.oz * d];
  };

  for (const c of field.map.camps as CampDef[]) {
    const theme = CAMP_THEME[c.monsterType];
    const rng = new Rng(4400 + c.id * 7);
    const R = campRadius(c.monsterType);
    const cx = c.pos.x;
    const cz = c.pos.y;
    const col = CAMP_GLOW[theme];
    const epic = theme >= 5;
    const spots = rimSpotsFacing(cliffs, cx, cz, R + (epic ? 9 : 7));
    // 营地本身是发光区：周围的散件发光物让位
    glow.reserve(cx, cz);

    // 营地边的矮石(≤ 0.45 米)：史诗潭里的残石压低；增益营地换成半圈符石
    const count = Math.round(R * (theme === 1 ? 1.4 : 3.2));
    for (let i = 0; i < count; i++) {
      if (theme !== 1 && rng.chance(0.4)) continue;
      const a = theme === 1 ? Math.PI * (0.15 + (0.7 * i) / Math.max(1, count - 1)) + Math.PI : (i / count) * TAU + rng.range(-0.08, 0.08);
      const rr = R + rng.range(-0.1, 0.25);
      const px = cx + Math.cos(a) * rr;
      const pz = cz + Math.sin(a) * rr;
      if (field.solidDist(px, pz) < 0.25 || field.laneDist(px, pz) < 0.6) continue;
      const y = field.heightAt(px, pz);
      if (theme === 1) {
        batch.add(rng.pick(protos.rune), trs(px, y - 0.03, pz, faceDir(cx - px, cz - pz) - Math.PI / 2, rng.range(0.95, 1.15)), { shadow: false, tint: mixRgb(col, [1, 1, 1], 0.2), maskedTint: true, glow: 1 });
      } else {
        const sc = rng.range(0.8, 1.2) * (epic ? 1.15 : 1);
        batch.add(rng.pick(lib.ruinStones), trs(px, y - 0.05, pz, -a + Math.PI / 2 + rng.range(-0.25, 0.25), sc, sc * (epic ? 1.1 : 1), rng.range(-0.12, 0.12), rng.range(-0.12, 0.12)), {
          shadow: false,
          tint: theme === 2 ? [0.42, 0.36, 0.36] : epic ? [0.78, 0.82, 0.98] : [0.95, 0.95, 0.9],
        });
        if (epic && rng.chance(0.4)) out.ripples.push({ x: px, z: pz, r: 0.9 });
      }
    }

    switch (theme) {
      case 1: {
        // 霜晶洼地：崖台上的冰晶簇、挂霜枯枝、霜灌木
        for (const s of pickSpaced(spots, 4, 2.6, rng)) {
          const [x, y, z] = onTop(s, rng.range(0.5, 1.1));
          const kind = rng.next();
          if (kind < 0.45) {
            const big = rng.chance(0.4);
            const tint = mixRgb(rgb(E.frost), [0.9, 0.97, 1], rng.range(0.1, 0.5));
            batch.add(rng.pick(big ? lib.bigCrystals : lib.crystals), trs(x, y, z, rng.range(0, TAU), rng.range(0.7, 1.0)), { tint, glow: 0.85 });
            glow.reserve(x, z);
            out.glows.push({ x, z, y: y + 0.05, r: big ? 2.6 : 1.8, color: tint });
            out.aoBlobs.push({ x, y: y + 0.06, z, r: big ? 1.3 : 0.9, strength: 0.25 });
          } else if (kind < 0.75) {
            batch.add(rng.pick(protos.frostBranch), trs(x, y, z, rng.range(0, TAU), rng.range(0.9, 1.15)), { glow: 1 });
            out.aoBlobs.push({ x, y: y + 0.06, z, r: 0.8, strength: 0.3 });
          } else {
            batch.add(protos.frostShrub, trs(x, y, z, rng.range(0, TAU), rng.range(0.9, 1.3)));
          }
        }
        atmos.push({ kind: 'fog', x: cx, y: 0.35, z: cz, width: 10, color: ATMOS_COLORS.cold, alpha: 0.11 });
        motes.push({ x: cx, y: 0.15, z: cz, radius: R * 0.95, color: scaleRgb(col, 1.05), count: 14, mode: 1, range: 2.0, size: 0.7 });
        break;
      }
      case 2: {
        // 余烬坑：崖台上的焦树桩；营地边三个小喷口
        for (const s of pickSpaced(spots, 3, 2.8, rng)) {
          const [x, y, z] = onTop(s, rng.range(0.5, 1.0));
          batch.add(rng.pick(protos.charStump), trs(x, y, z, rng.range(0, TAU), rng.range(0.9, 1.2)), { glow: 1 });
          out.aoBlobs.push({ x, y: y + 0.06, z, r: 0.9, strength: 0.34 });
        }
        for (let i = 0; i < 3; i++) {
          const a = rng.range(0, TAU);
          const rr = R * rng.range(0.82, 1.0);
          const px = cx + Math.cos(a) * rr;
          const pz = cz + Math.sin(a) * rr;
          if (field.solidDist(px, pz) < 0.5 || field.laneDist(px, pz) < 0.8) continue;
          batch.add(protos.vent, trs(px, 0, pz, rng.range(0, TAU), rng.range(0.8, 1.0)), { shadow: false, glow: 1 });
          out.glows.push({ x: px, z: pz, y: 0.03, r: 1.2, color: col });
          motes.push({ x: px, y: 0.2, z: pz, radius: 0.25, color: col, count: 3, mode: 1, range: 2.2, size: 0.7 });
        }
        motes.push({ x: cx, y: 0.1, z: cz, radius: R * 0.9, color: scaleRgb(col, 1.1), count: 12, mode: 1, range: 2.6, size: 0.7 });
        break;
      }
      case 3: {
        // 树根巢穴：最近的崖面上拱下来几条粗树根，崖顶一段空心倒木；洞口周围几丛不发光的蘑菇
        const near = spots[0];
        if (near) {
          const h = Math.round(near.rp.y * 10) / 10;
          let g = rootProtos.get(h);
          if (!g) {
            g = makeRoots(491 + h * 10, near.rp.y);
            rootProtos.set(h, g);
            temp.push(g);
          }
          batch.add(g, trs(near.rp.x - near.rp.ox * (near.rp.inset - 0.12), 0, near.rp.z - near.rp.oz * (near.rp.inset - 0.12), faceDir(near.rp.ox, near.rp.oz), 1));
          const far = spots.find((s) => Math.hypot(s.rp.x - near.rp.x, s.rp.z - near.rp.z) > 2.5) ?? near;
          const [x, y, z] = onTop(far, 1.0);
          batch.add(protos.log, trs(x, y, z, faceDir(far.rp.ox, far.rp.oz) + Math.PI / 2 + rng.range(-0.3, 0.3), 0.95));
          out.aoBlobs.push({ x, y: y + 0.06, z, r: 1.3, strength: 0.36 });
        }
        for (let i = 0; i < 4; i++) {
          const a = rng.range(0, TAU);
          const px = cx + Math.cos(a) * R * rng.range(0.85, 1.05);
          const pz = cz + Math.sin(a) * R * rng.range(0.85, 1.05);
          if (field.solidDist(px, pz) < 0.3 || field.laneDist(px, pz) < 0.6) continue;
          batch.add(rng.pick(lib.mushrooms), trs(px, 0, pz, rng.range(0, TAU), rng.range(0.8, 1.2)), { shadow: false, tint: rng.pick([rgb(0xd8683a), rgb(0xe0b070)]), maskedTint: true, glow: 0 });
        }
        motes.push({ x: cx, y: 0.2, z: cz, radius: R * 0.9, color: scaleRgb(col, 0.9), count: 6, mode: 0, range: 1.2, size: 0.6 });
        break;
      }
      case 4: {
        // 灯花丛：邻近崖沿上三四朵发光的大灯花(朝营地倾)
        for (const s of pickSpaced(spots, 4, 1.7, rng)) {
          const [x, y, z] = onTop(s, rng.range(0.1, 0.35));
          const tint = mixRgb(rgb(E.petalPink), rgb(E.petalWhite), rng.next());
          batch.add(rng.pick(protos.lampFlower), trs(x, y, z, faceDir(s.rp.ox, s.rp.oz) + rng.range(-0.4, 0.4), rng.range(0.9, 1.25)), { tint, maskedTint: true, glow: 1 });
          glow.reserve(x, z);
          out.glows.push({ x, z, y: y + 0.05, r: 1.4, color: col });
          motes.push({ x, y: y + 0.8, z, radius: 0.5, color: col, count: 2, mode: 0, range: 0.7, size: 0.6 });
        }
        motes.push({ x: cx, y: 0.5, z: cz, radius: R, color: scaleRgb(col, 0.9), count: 7, mode: 0, range: 1.4, size: 0.6 });
        break;
      }
      case 5: {
        // 沉渊潭：潭边崖台上的断裂星轨石环
        for (const s of pickSpaced(spots, 4, 4.2, rng)) {
          const [x, y, z] = onTop(s, rng.range(0.7, 1.2));
          batch.add(rng.pick(protos.starArc), trs(x, y, z, faceDir(s.rp.ox, s.rp.oz) + rng.range(-0.4, 0.4), rng.range(0.85, 1.1)), { glow: 1 });
          out.aoBlobs.push({ x, y: y + 0.06, z, r: 0.9, strength: 0.32 });
        }
        atmos.push({ kind: 'fog', x: cx, y: WATER_LEVEL + 0.35, z: cz, width: 12, color: mixRgb(ATMOS_COLORS.cold, ATMOS_COLORS.violet, 0.3), alpha: 0.11 });
        atmos.push({ kind: 'beam', x: cx - 1.5, y: WATER_LEVEL, z: cz + 1, width: 3.6, length: 11, color: mixRgb(ATMOS_COLORS.warm, ATMOS_COLORS.violet, 0.35), alpha: 0.06 });
        motes.push({ x: cx, y: WATER_LEVEL + 0.05, z: cz, radius: R * 0.95, color: scaleRgb(col, 1.1), count: 20, mode: 1, range: 2.4, size: 0.9 });
        break;
      }
      default: {
        // 坠星潭：邻近崖台上半埋的陨铁碎块
        for (const s of pickSpaced(spots, 4, 3.6, rng)) {
          const [x, y, z] = onTop(s, rng.range(0.6, 1.2));
          batch.add(rng.pick(protos.meteor), trs(x, y - 0.1, z, rng.range(0, TAU), rng.range(0.9, 1.3), undefined, rng.range(-0.2, 0.2), rng.range(-0.2, 0.2)), { glow: 1 });
          glow.reserve(x, z);
          out.glows.push({ x, z, y: y + 0.05, r: 1.5, color: col });
          out.aoBlobs.push({ x, y: y + 0.06, z, r: 1.1, strength: 0.34 });
        }
        atmos.push({ kind: 'fog', x: cx, y: WATER_LEVEL + 0.3, z: cz, width: 11, color: ATMOS_COLORS.steam, alpha: 0.09 });
        atmos.push({ kind: 'beam', x: cx + 1.2, y: WATER_LEVEL, z: cz - 0.8, width: 3.8, length: 12, color: ATMOS_COLORS.warm, alpha: 0.075 });
        motes.push({ x: cx, y: WATER_LEVEL + 0.05, z: cz, radius: R * 0.9, color: scaleRgb(col, 1.1), count: 20, mode: 1, range: 3.0, size: 0.85 });
      }
    }
  }
  for (const list of Object.values(protos)) {
    if (Array.isArray(list)) list.forEach((g) => g.dispose());
    else list.dispose();
  }
  temp.forEach((g) => g.dispose());
}

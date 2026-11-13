/**
 * 地图边界外的装饰带(bound → half 及更远)：
 * - 北/西/东三面：从边界线拔起的崖壁(与墙体同一语言：一看就不可走)，崖顶是起伏的林地，再往外是高原边缘的断崖；
 * - 南面(靠近镜头)：只砌一道矮石沿，外侧下沉成低一级的台地——这样不会挡住贴着南边界走的单位；
 * - 西/东两面在靠近南端时逐渐降到矮石沿的高度；
 * - 基地外侧的崖壁换成队伍石材(蓝方白石 / 红方玄武岩)；
 * - 河道在西北角有山泉瀑布注入，在东南角越过石沿跌落。
 */
import * as THREE from 'three';
import { SUN_SHADOW_DIR } from '../engine/lighting';
import { GLSL_OUTPUT_FRAGMENT, PALETTE, Rng, SHARED, fbm2, hash2 } from '../materials';
import type { Vec2 } from '../../core/types';
import { TOP_TEX } from './cliffs';
import { type MapField, WATER_LEVEL } from './field';
import { MeshBuilder, type OutlinePoint, type RGB, type SceneryBatcher, extrudeRings, lerp, mixRgb, outlineNormals, rgb, scaleRgb, smoothstep } from './geo';
import type { PropLibrary } from './models';
import { type ScatterResult, trs } from './scatter';

const ROCK_DARK = rgb(PALETTE.env.rockDark);
const ROCK = rgb(PALETTE.env.rock);
const ROCK_LIGHT = rgb(PALETTE.env.rockLight);
const ROCK_WARM = rgb(PALETTE.env.rockWarm);
const MOSS = rgb(PALETTE.env.moss);
const FOREST_FLOOR = rgb(0x2f5f40);
const FOREST_FLOOR_LIGHT = rgb(0x4f8448);
const DEEP = rgb(0x4b5878);
const EARTH = rgb(0x6f6a44);
const FOG = rgb(PALETTE.env.fog);

/** 崖顶基准高度 */
const BAND_H = 2.7;
/** 基地外侧的城垣：墙顶高度(整齐，不随噪声起伏)与墙面相对边界线的后退量(墙脚留一道矮台阶，扶壁立在上面) */
export const BASE_WALL_H = BAND_H + 0.2;
export const BASE_WALL_SETBACK = 0.55;
/** 南侧低台地的高度 */
const LOW_Y = -1.95;

export interface BorderInfo {
  /** 装饰带表面高度(边界外任意点) */
  heightAt(x: number, z: number): number;
  /** 0 = 高崖一侧，1 = 南侧低台 */
  southWeight(x: number, z: number): number;
  /** 高原边缘到边界线的距离(沿外法线) */
  edgeDist(x: number, z: number): number;
}

export function createBorderInfo(field: MapField): BorderInfo {
  const bound = field.map.bound;
  const southWeight = (_x: number, z: number): number => smoothstep(bound - 13, bound - 1.5, z);
  const edgeDist = (x: number, z: number): number => {
    const a = Math.atan2(z, x);
    return 17.5 + fbm2(Math.cos(a) * 2.2 + 5, Math.sin(a) * 2.2 + 5, 3, 91) * 4.5;
  };
  const heightAt = (x: number, z: number): number => {
    const t = Math.max(Math.abs(x), Math.abs(z)) - bound;
    const sw = southWeight(x, z);
    const hills = (fbm2(x * 0.07 + 3.1, z * 0.07 + 1.7, 3, 57) - 0.35) * 3.2 * smoothstep(1.5, 8, t);
    const edge = edgeDist(x, z);
    // 接近高原边缘时地势回落
    const fall = smoothstep(edge - 5, edge, t);
    const high = BAND_H + 0.12 + hills * (1 - fall * 0.7) - fall * 0.5;
    const low = LOW_Y - 0.03 * t + (fbm2(x * 0.11, z * 0.11, 2, 61) - 0.5) * 0.5;
    let y = lerp(high, low, sw);
    // 河水流出的沟槽(只在低台一侧)
    const rd = field.riverDist(x, z);
    if (rd < 2.5) y -= smoothstep(2.5, 0.2, rd) * lerp(0, 0.5, sw);
    return y;
  };
  return { heightAt, southWeight, edgeDist };
}

/** 边界环：西边(北→南) → 南边(西→东) → 东边(南→北) → 北边(东→西)，左手侧为地图外 */
function borderLoop(bound: number, step: number): { pts: Vec2[]; sideStart: number[] } {
  const corners: Vec2[] = [
    { x: -bound, y: -bound },
    { x: -bound, y: bound },
    { x: bound, y: bound },
    { x: bound, y: -bound },
  ];
  const pts: Vec2[] = [];
  const sideStart: number[] = [];
  for (let s = 0; s < 4; s++) {
    const a = corners[s];
    const b = corners[(s + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const segs = Math.round(len / step);
    sideStart.push(pts.length);
    for (let i = 0; i < segs; i++) pts.push({ x: a.x + ((b.x - a.x) * i) / segs, y: a.y + ((b.y - a.y) * i) / segs });
  }
  return { pts, sideStart };
}

const RING_COUNT = 18;

export function buildBorder(field: MapField, info: BorderInfo, root: THREE.Object3D, material: THREE.Material): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const bound = field.map.bound;
  const { pts, sideStart } = borderLoop(bound, 1.25);
  const outline = outlineNormals(pts, true);
  const n = outline.length;
  const blueStone = rgb(PALETTE.blue.stone);
  const blueStoneDark = rgb(PALETTE.blue.stoneDark);
  const redStone = rgb(0x6a5a62);
  const redStoneDark = rgb(PALETTE.red.stoneDark);

  const ring = (p: OutlinePoint, i: number, k: number): { t: number; y: number; color: RGB; ao?: number; tex?: number } => {
    const sw = info.southWeight(p.x, p.z);
    const seedI = i * 13 + 7;
    const j = (hash2(seedI, k, 5) - 0.5) * 0.1;
    const crack = hash2(i, 77, 3) < 0.15 ? 1 : 0;
    // 是否位于基地外侧：换成队伍石材并砌成整齐的城垣
    const inBase = field.baseDist(p.x - p.nx * 0.5, p.z - p.nz * 0.5) < 0.4;
    const H = inBase ? BASE_WALL_H : BAND_H + (fbm2(p.s * 0.2, 3.3, 3, 15) - 0.5) * 0.8;
    const ledge = 0.9 + (fbm2(p.s * 0.45, 8.1, 2, 21) - 0.5) * 0.9;
    const red = p.x - p.z > 0;
    const stone = red ? redStone : blueStone;
    const stoneDark = red ? redStoneDark : blueStoneDark;
    // 河口：东南角让石沿让位给水流；西北角崖沿开一个出水的豁口
    const river = smoothstep(0.6, -0.8, field.riverDist(p.x, p.z));
    const notch = river * sw;
    let t: number;
    let y: number;
    let color: RGB;
    let ao = 1;
    const tone = 0.9 + hash2(i, 31, 9) * 0.2;
    const bareRim = hash2(Math.floor(i / 3), 41, 17) < 0.3;
    if (k <= 5) {
      // 高崖剖面 / 矮石沿剖面，按 sw 混合
      const hi: [number, number][] = inBase
        ? [
            // 城垣：墙脚一道矮台阶，墙面后退、笔直，墙顶收一个小倒角
            [0, -0.05],
            [0.03, 0.13],
            [BASE_WALL_SETBACK - 0.07, 0.15],
            [BASE_WALL_SETBACK, H * 0.5],
            [BASE_WALL_SETBACK + 0.02, H - 0.03],
            [BASE_WALL_SETBACK + 0.12, H],
          ]
        : [
            [0, -0.05],
            [0.08 + j * 0.6 + crack * 0.1, ledge - 0.1],
            [0.28 + j + crack * 0.08, ledge + 0.06],
            [0.36 + j + crack * 0.14, lerp(ledge, H, 0.55)],
            [0.55 + j + crack * 0.1, H - 0.12],
            [0.95, H],
          ];
      const curb = 0.42 * (1 - notch);
      const lo: [number, number][] = [
        [0, -0.05],
        [0.05, curb * 0.9 - notch * 0.3],
        [0.2, curb - notch * 0.32],
        [0.48, curb - notch * 0.34],
        [0.58, curb * 0.5 - notch * 0.5 - 0.1],
        [0.78, lerp(-0.9, LOW_Y, 0.6)],
      ];
      t = lerp(hi[k][0], lo[k][0], sw);
      y = lerp(hi[k][1], lo[k][1], sw);
      // 崖沿不做一圈亮边：每 3 列编一组，约三成的组露出暖石沿，其余由苔与林地草盖过来(同 cliffs.ts 的做法)
      const rimTop = bareRim ? mixRgb(ROCK_LIGHT, ROCK_WARM, 0.55) : mixRgb(MOSS, FOREST_FLOOR_LIGHT, 0.5);
      const rockCols: RGB[] = [mixRgb(ROCK_DARK, ROCK, 0.2), mixRgb(ROCK_DARK, ROCK, 0.65 - crack * 0.3), mixRgb(ROCK_LIGHT, MOSS, hash2(i, 5, 51) * 0.4), ROCK, bareRim ? mixRgb(ROCK, ROCK_LIGHT, 0.45) : mixRgb(ROCK, MOSS, 0.55), rimTop];
      const stoneCols: RGB[] = [scaleRgb(stoneDark, 0.75), mixRgb(stoneDark, stone, 0.5), stone, mixRgb(stoneDark, stone, 0.7), stone, scaleRgb(stone, 1.05)];
      // 南侧矮石沿：沿顶是长苔的暖石，外立面往下迅速压暗(当画框用，不抢对局区)
      const mossN = fbm2(p.s * 0.31, 5.7, 2, 19);
      const lowCols: RGB[] = [scaleRgb(ROCK, 0.8), mixRgb(ROCK_LIGHT, MOSS, mossN * 0.5), mixRgb(mixRgb(ROCK_LIGHT, ROCK_WARM, 0.6), MOSS, smoothstep(0.45, 0.7, mossN) * 0.7), mixRgb(ROCK, MOSS, mossN * 0.4), scaleRgb(ROCK_DARK, 0.9), scaleRgb(ROCK_DARK, 0.62)];
      // 界外高崖是画框：岩面整体压一档(暗面 L* 落到 40 上下)，不和场内受光的岩石抢。
      // 背着主光的那几面(西侧高崖朝场内的立面)只吃天光与阴影偏色，同一个反照率下实测 L* 仍有 47 上下、是一条发浅的蓝紫窄带：
      // 按立面朝向(朝场内的法线 = -n，背光时与影子方向同向)再压一档，落回 40 上下
      const away = smoothstep(0.1, 0.6, -(p.nx * SUN_SHADOW_DIR.x + p.nz * SUN_SHADOW_DIR.y));
      const hiCol = inBase ? stoneCols[k] : k >= 1 && k <= 4 ? scaleRgb(rockCols[k], 0.82 * lerp(1, 0.74, away)) : rockCols[k];
      const loCol = inBase ? stoneCols[Math.min(5, k + 1)] : lowCols[k];
      color = mixRgb(hiCol, loCol, sw);
      if (k === 0) ao = 0.72;
      // 西北角出水口：崖沿压低一点、染成湿石色
      const spring = river * (1 - sw);
      if (spring > 0 && k >= 3) {
        y -= spring * (k === 3 ? 0.1 : 0.5);
        color = mixRgb(color, [0.2, 0.36, 0.5], spring * 0.6);
      }
    } else {
      const edge = info.edgeDist(p.x, p.z) * lerp(1, 0.93, sw);
      const topT = [2.0, 3.6, 5.6, 8, 10.6, 13.2, edge - 2.2, edge];
      if (k <= 13) {
        t = topT[k - 6];
        if (k < 12) t = Math.min(t, edge - 3 - (12 - k) * 0.4);
        const px = p.x + p.nx * t * p.miter;
        const pz = p.z + p.nz * t * p.miter;
        y = info.heightAt(px, pz);
        const g = fbm2(px * 0.16, pz * 0.16, 3, 33);
        const patch = fbm2(px * 0.05 + 4, pz * 0.05, 2, 71);
        // 林地：深浅草色 + 成片的落叶土；南侧低台整体压暗一些，把视线留给对局区
        let c = mixRgb(FOREST_FLOOR, FOREST_FLOOR_LIGHT, g);
        c = mixRgb(c, EARTH, smoothstep(0.55, 0.75, patch) * 0.6);
        c = scaleRgb(c, lerp(1, 0.6, sw));
        // 空气透视：离边界越远越向雾色靠
        c = mixRgb(c, FOG, smoothstep(4, 40, t) * 0.55);
        if (k === 6) c = bareRim ? mixRgb(mixRgb(ROCK_LIGHT, MOSS, 0.6 + sw * 0.3), c, 0.5) : mixRgb(MOSS, c, 0.6);
        if (k === 13) c = mixRgb(ROCK_LIGHT, ROCK_WARM, 0.5);
        if (inBase && k === 6) c = mixRgb(stone, c, 0.3);
        color = c;
      } else {
        // 高原边缘之外的断崖，向下没入云海
        const drop = [
          [0.9, -3.5],
          [2.4, -14],
          [3.2, -30],
          [5.5, -52],
        ][k - 14];
        t = edge + drop[0] + (hash2(seedI, k, 81) - 0.5) * 0.9;
        const topY = info.heightAt(p.x + p.nx * edge * p.miter, p.z + p.nz * edge * p.miter);
        y = topY + drop[1] + (hash2(seedI, k, 83) - 0.5) * 2.5;
        color = [ROCK, mixRgb(ROCK, ROCK_DARK, 0.6), mixRgb(ROCK_DARK, DEEP, 0.5), DEEP][k - 14];
      }
    }
    const tex = k <= 5 || k >= 13 ? 1 : k === 6 ? 0.6 : TOP_TEX;
    return { t: t * p.miter, y, color: scaleRgb(color, tone), ao, tex };
  };

  // 每条边一个网格(含两端的拐角点)，便于视锥剔除
  for (let s = 0; s < 4; s++) {
    const start = sideStart[s];
    const end = s === 3 ? n : sideStart[s + 1];
    const slice: OutlinePoint[] = [];
    const idxMap: number[] = [];
    for (let i = start; i <= end; i++) {
      slice.push(outline[i % n]);
      idxMap.push(i % n);
    }
    const b = new MeshBuilder();
    extrudeRings(b, slice, false, RING_COUNT, (p, i, k) => ring(p, idxMap[i], k));
    b.computeNormals(35);
    const mesh = new THREE.Mesh(b.build(), material);
    mesh.name = `border:${s}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

/** 装饰带上的林木、山石与巨型星晶 */
export function scatterBorder(batch: SceneryBatcher, lib: PropLibrary, field: MapField, info: BorderInfo, out: ScatterResult): void {
  const bound = field.map.bound;
  const rng = new Rng(31415);
  const ext = bound + 26;
  const step = 2.8;
  const placed: [number, number, number][] = [];
  for (let z = -ext; z <= ext; z += step) {
    for (let x = -ext; x <= ext; x += step) {
      const px = x + rng.range(-0.5, 0.5) * step;
      const pz = z + rng.range(-0.5, 0.5) * step;
      const t = Math.max(Math.abs(px), Math.abs(pz)) - bound;
      if (t < 1.4) continue;
      const edge = info.edgeDist(px, pz);
      if (t > edge - 1.6) continue;
      const sw = info.southWeight(px, pz);
      // 河道流经处留空
      if (field.riverDist(px, pz) < 1.6) continue;
      // 南侧低台：树离边界远一点、矮一点，避免树冠探进可走区域的视线
      if (sw > 0.5 && t < 3.6) continue;
      // 基地背后留出旗帜/火盆的位置
      const nearBase = field.baseDist(px, pz, 12) < 4.2;
      if (nearBase && t < 3.4) continue;
      const y = info.heightAt(px, pz);
      const roll = rng.next();
      const dens = 0.5 + fbm2(px * 0.05, pz * 0.05, 2, 12) * 0.5;
      if (roll < (0.62 * dens + 0.16) * (t < 9 ? 1.3 : 1)) {
        let ok = true;
        for (let i = placed.length - 1; i >= Math.max(0, placed.length - 60); i--) {
          const q = placed[i];
          if (Math.hypot(q[0] - px, q[1] - pz) < 1.7) ok = false;
        }
        if (!ok) continue;
        placed.push([px, pz, 1]);
        const pine = rng.chance(0.42 + (pz < 0 ? 0.2 : 0));
        const warm = fbm2(px * 0.04 + 9, pz * 0.04, 2, 88);
        const v = rng.range(0.85, 1.08) * (sw > 0.5 ? 0.72 : 1);
        // 空气透视：越远的树越向雾色靠(乘色近似)
        const haze = smoothstep(4, 34, t) * 0.5;
        const tint: RGB = [v * (0.95 + warm * 0.25) * (1 + haze * 0.5), v * (1 + haze * 0.62), v * (1.0 - warm * 0.25) * (1 + haze * 1.1)];
        if (pine) {
          const sc = rng.range(0.85, 1.35) * (sw > 0.5 ? 0.8 : 1);
          batch.add(rng.pick(lib.pines), trs(px, y - 0.1, pz, rng.range(0, 6.28), sc, sc * rng.range(0.9, 1.2)), { tint });
        } else {
          // 紧邻对局区的第一排用精细树，其余用低面数的远景树
          const sc = rng.range(1.0, 1.55) * (sw > 0.5 ? 0.8 : 1);
          batch.add(rng.pick(t < 3.2 ? lib.trees : lib.farTrees), trs(px, y - 0.1, pz, rng.range(0, 6.28), sc, sc * rng.range(0.95, 1.15)), { tint });
        }
      } else if (roll < 0.74) {
        const sc = rng.range(0.7, 1.9);
        batch.add(rng.pick(lib.boulders), trs(px, y - 0.1, pz, rng.range(0, 6.28), sc, sc * rng.range(0.8, 1.5)), { tint: scaleRgb([1, 1, 1], rng.range(0.9, 1.1)) });
      } else if (roll < 0.8) {
        batch.add(rng.pick(lib.shrubs), trs(px, y - 0.05, pz, rng.range(0, 6.28), rng.range(1.0, 1.7)));
      } else if (roll < 0.815 && t > 4 && sw < 0.5) {
        // 坠星留下的巨型星晶：远处的地标
        const tint = mixRgb(rgb(PALETTE.env.crystal), rgb(0x8f9cff), rng.next());
        const sc = rng.range(1.5, 2.6);
        batch.add(rng.pick(lib.bigCrystals), trs(px, y - 0.2, pz, rng.range(0, 6.28), sc, sc, rng.range(-0.15, 0.15), rng.range(-0.15, 0.15)), { tint, glow: 0.9 });
        out.glows.push({ x: px, z: pz, y: y + 0.1, r: 5.5, color: tint });
      } else if (roll < 0.83 && sw < 0.5) {
        batch.add(rng.pick(lib.tallPillars), trs(px, y - 0.1, pz, rng.range(0, 6.28), rng.range(1.2, 1.7), rng.range(1.2, 1.9), rng.range(-0.08, 0.08), rng.range(-0.08, 0.08)), { tint: [0.95, 0.95, 0.92], glow: 0.9 });
      }
    }
  }
  // 南侧矮石沿：沿顶一排向外(朝镜头)垂下的草帘，间或一丛蕨，把那条石带打碎
  const r3 = new Rng(16180);
  for (let x = -bound + 0.6; x < bound - 0.6; x += r3.range(0.4, 1.3)) {
    const z = bound + 0.34;
    if (field.riverDist(x, z) < 1.2 || field.baseDist(x, bound - 0.6) < 0.3) continue;
    const kind = r3.next();
    if (kind < 0.7) batch.add(r3.pick(lib.drapes), trs(x, 0.4, z + 0.14, -Math.PI / 2 + r3.range(-0.3, 0.3), r3.range(1.0, 1.5)), { shadow: false, tint: scaleRgb([0.86, 0.92, 0.8], r3.range(0.62, 0.9)) });
    else if (kind < 0.85) batch.add(r3.pick(lib.ferns), trs(x, 0.4, z - 0.04, r3.range(0, 6.28), r3.range(0.7, 1.0)), { shadow: false });
    else if (kind < 0.93) batch.add(r3.pick(lib.vines), trs(x, 0.36, z + 0.3, -Math.PI / 2, r3.range(0.9, 1.2), r3.range(0.8, 1.5)), { shadow: false });
  }
  // 林下的矮草与野花：打破大片纯色的林地
  const r2 = new Rng(27182);
  const fine = 1.7;
  const flowerTints: RGB[] = [rgb(0xffffff), rgb(0xffe07a), rgb(0xff9ec4), rgb(0x9fd0ff)];
  for (let z = -ext; z <= ext; z += fine) {
    for (let x = -ext; x <= ext; x += fine) {
      const px = x + r2.range(-0.5, 0.5) * fine;
      const pz = z + r2.range(-0.5, 0.5) * fine;
      const t = Math.max(Math.abs(px), Math.abs(pz)) - bound;
      if (t < 1.2 || t > info.edgeDist(px, pz) - 1.2) continue;
      if (field.riverDist(px, pz) < 1.2) continue;
      if (!r2.chance(0.7)) continue;
      const y = info.heightAt(px, pz) - 0.04;
      if (r2.chance(0.06)) batch.add(r2.pick(lib.flowers), trs(px, y, pz, r2.range(0, 6.28), r2.range(1.6, 2.4)), { tint: r2.pick(flowerTints), shadow: false, maskedTint: true });
      else if (r2.chance(0.55)) batch.add(r2.pick(lib.tufts), trs(px, y, pz, r2.range(0, 6.28), r2.range(1.5, 2.6)), { shadow: false, tint: [0.8, 0.95, 0.75] });
    }
  }
}

// ───────────── 瀑布 ─────────────

const FALL_VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FALL_FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tNoise;
uniform float uTime;
varying vec2 vUv;
void main() {
  // u: 横向 0..1；v: 沿水流方向的米数。几股粗细不一的水柱 + 快速下泻的白沫
  float t = uTime;
  float n1 = texture2D(tNoise, vec2(vUv.x * 0.7, vUv.y * 0.09 - t * 0.5)).g;
  float n2 = texture2D(tNoise, vec2(vUv.x * 1.9 + 0.3, vUv.y * 0.2 - t * 0.85)).b;
  float cols = texture2D(tNoise, vec2(vUv.x * 0.45 + 0.2, 0.37)).g;
  float streak = smoothstep(0.42, 0.72, n1 * 0.55 + n2 * 0.45);
  float body = smoothstep(0.3, 0.55, cols + streak * 0.25);
  float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
  vec3 col = mix(vec3(0.16, 0.56, 0.86), vec3(0.95, 1.0, 1.0), streak);
  float a = edge * mix(0.3, 0.92, body) * (0.55 + 0.45 * streak);
  gl_FragColor = vec4(col, a);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

interface FallStrip {
  /** 顶边两端点与底边两端点(世界坐标) */
  top: [THREE.Vector3, THREE.Vector3];
  bottom: [THREE.Vector3, THREE.Vector3];
  /** 中间的凸出量(让水帘有点弧度) */
  bulge: THREE.Vector3;
}

/** 西北角的山泉瀑布 + 东南角越过石沿的跌水 */
export function createWaterfalls(field: MapField, info: BorderInfo, noise: THREE.Texture, out: ScatterResult): THREE.Mesh {
  const b = field.map.bound;
  const strips: FallStrip[] = [];
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const topY = BAND_H - 1.0;
  // 西北：北崖面(朝南，镜头正对)与西崖面各一道
  strips.push({ top: [V(-b + 1.5, topY, -b - 0.42), V(-b + 4.3, topY, -b - 0.42)], bottom: [V(-b + 1.1, WATER_LEVEL, -b + 0.25), V(-b + 4.7, WATER_LEVEL, -b + 0.25)], bulge: V(0, 0, 0.22) });
  strips.push({ top: [V(-b - 0.42, topY, -b + 4.2), V(-b - 0.42, topY, -b + 1.8)], bottom: [V(-b + 0.25, WATER_LEVEL, -b + 4.6), V(-b + 0.25, WATER_LEVEL, -b + 1.4)], bulge: V(0.22, 0, 0) });
  out.glows.push({ x: -b + 2.9, z: -b + 0.8, y: WATER_LEVEL + 0.03, r: 2.6, color: [0.8, 0.95, 1] });
  out.glows.push({ x: -b + 0.8, z: -b + 3.0, y: WATER_LEVEL + 0.03, r: 2.2, color: [0.8, 0.95, 1] });
  // 东南：越过南侧石沿跌到低台
  const lowY = info.heightAt(b - 3.5, b + 2.2) + 0.12;
  strips.push({ top: [V(b - 6.6, WATER_LEVEL - 0.02, b + 0.45), V(b - 0.2, WATER_LEVEL - 0.02, b + 0.45)], bottom: [V(b - 7.0, lowY, b + 1.5), V(b + 0.4, lowY, b + 1.5)], bulge: V(0, 0.1, 0.25) });
  // 低台上的水潭与流向高原边缘的溪流(平铺的水带)
  strips.push({ top: [V(b - 7.2, lowY, b + 1.2), V(b + 0.8, lowY, b + 1.2)], bottom: [V(b + 4.5, lowY - 0.25, b + 17), V(b + 11.5, lowY - 0.25, b + 12)], bulge: V(0, 0, 0) });
  out.glows.push({ x: b - 3.2, z: b + 1.9, y: lowY + 0.05, r: 3.4, color: [0.8, 0.95, 1] });

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rows = 5;
  const p = new THREE.Vector3();
  const l = new THREE.Vector3();
  const r = new THREE.Vector3();
  for (const s of strips) {
    const base = pos.length / 3;
    const len = s.top[0].distanceTo(s.bottom[0]);
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      l.lerpVectors(s.top[0], s.bottom[0], t);
      r.lerpVectors(s.top[1], s.bottom[1], t);
      const arc = Math.sin(t * Math.PI) * 0.6 + t * 0.4;
      for (const u of [0, 0.5, 1]) {
        p.lerpVectors(l, r, u).addScaledVector(s.bulge, arc * (u === 0.5 ? 1.3 : 1));
        pos.push(p.x, p.y, p.z);
        uv.push(u, t * len * 3.2);
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let c = 0; c < 2; c++) {
        const a = base + i * 3 + c;
        idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), tNoise: { value: noise }, uTime: SHARED.uTime },
    vertexShader: FALL_VERTEX,
    fragmentShader: FALL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'waterfalls';
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return mesh;
}

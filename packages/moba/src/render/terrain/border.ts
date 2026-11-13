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
import { MeshBuilder, type OutlinePoint, RANK_CASTER, RANK_LOW, RANK_MAIN_ONLY, RANK_MEDIUM, type RGB, type SceneryBatcher, densityRank, extrudeRings, lerp, mixRgb, outlineNormals, rgb, scaleRgb, smoothstep } from './geo';
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
/** 西北角出水口：崖面一级石台的高度、崖沿压低的量(瀑布按这两个数走位) */
const SPRING_LEDGE = 0.9;
const SPRING_DROP = 0.5;

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

/** 剖面环数(崖脚 → 崖沿 / 石沿外立面的墙脚) */
const PROFILE_RINGS = 7;
/** 顶面环(林地 / 低台)从第几环开始、共几环；之后 4 环是高原边缘向云海跌落的断崖 */
const TOP_RING0 = PROFILE_RINGS;
const TOP_RINGS = 8;
const RING_COUNT = PROFILE_RINGS + TOP_RINGS + 4;

export function buildBorder(field: MapField, info: BorderInfo, root: THREE.Object3D, material: THREE.Material): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const bound = field.map.bound;
  const { pts, sideStart } = borderLoop(bound, 1.25);
  const outline = outlineNormals(pts, true);
  const n = outline.length;
  // 城垣石：不直接用队伍白石(#c3cde0 朝上的面受光后 L* 86，比站在泉水里的英雄还亮，出生第一屏就是一条白带)。
  // 蓝方墙顶与内立面取暗石与白石之间再压两成(墙顶 L* 落在 70 以下)，外立面与墙脚用暗石；红方玄武岩本来就暗，只做同样的分面
  const blueStone = rgb(PALETTE.blue.stone);
  const blueStoneDark = rgb(PALETTE.blue.stoneDark);
  const redStone = rgb(0x6a5a62);
  const redStoneDark = rgb(PALETTE.red.stoneDark);
  const wallTones = (red: boolean): { top: RGB; face: RGB; outer: RGB; foot: RGB } => {
    const stone = red ? redStone : blueStone;
    const dark = red ? redStoneDark : blueStoneDark;
    const k = red ? 1 : 0.8;
    return { top: scaleRgb(mixRgb(dark, stone, red ? 0.75 : 0.45), k), face: scaleRgb(mixRgb(dark, stone, red ? 0.55 : 0.3), k), outer: scaleRgb(dark, red ? 0.9 : 0.75), foot: scaleRgb(dark, red ? 0.7 : 0.58) };
  };
  const WALL = [wallTones(false), wallTones(true)];

  const ring = (p: OutlinePoint, i: number, k: number): { t: number; y: number; color: RGB; ao?: number; tex?: number } => {
    const sw = info.southWeight(p.x, p.z);
    const seedI = i * 13 + 7;
    const j = (hash2(seedI, k, 5) - 0.5) * 0.1;
    const crack = hash2(i, 77, 3) < 0.15 ? 1 : 0;
    // 是否位于基地外侧：换成队伍石材并砌成整齐的城垣
    const inBase = field.baseDist(p.x - p.nx * 0.5, p.z - p.nz * 0.5) < 0.4;
    // 河口：东南角让石沿让位给水流；西北角崖沿开一个出水的豁口(那里的崖面取规整的高度，瀑布的走位按它写)
    const river = smoothstep(0.6, -0.8, field.riverDist(p.x, p.z));
    const notch = river * sw;
    const spring = river * (1 - sw);
    const H = inBase ? BASE_WALL_H : lerp(BAND_H + (fbm2(p.s * 0.2, 3.3, 3, 15) - 0.5) * 0.8, BAND_H, spring);
    const ledge = lerp(0.9 + (fbm2(p.s * 0.45, 8.1, 2, 21) - 0.5) * 0.9, SPRING_LEDGE, spring);
    const red = p.x - p.z > 0;
    const wall = WALL[red ? 1 : 0];
    let t: number;
    let y: number;
    let color: RGB;
    let ao = 1;
    let tex = 1;
    const tone = 0.9 + hash2(i, 31, 9) * 0.2;
    // 砌块的节奏：轮廓点 1.25 米一个，相邻两块明度一高一低
    const block = i % 2 === 0 ? 1.06 : 0.93;
    const bareRim = hash2(Math.floor(i / 3), 41, 17) < 0.3;
    if (k < PROFILE_RINGS) {
      // 高崖的岩面不是一堵抹平的墙：每个轮廓点沿法线前后错开(±0.3 米)，相邻两段朝向不同、受光不同，折成一面一面的岩块；
      // 每五六个点再压一道更深的竖缝。崖脚那一环不动(与边界线重合)
      const seam = !inBase && hash2(i, 53, 29) < 0.2 ? 1 : 0;
      const fold = inBase ? 0 : ((hash2(i, 19, 77) - 0.5) * 0.6 + seam * 0.3) * (1 - spring);
      // 高崖剖面 / 矮石沿剖面，按 sw 混合
      const hi: [number, number][] = inBase
        ? [
            // 城垣：墙脚一道矮台阶，墙面后退、笔直，墙顶收一个小倒角
            [0, -0.05],
            [0.03, 0.13],
            [BASE_WALL_SETBACK - 0.07, 0.15],
            [BASE_WALL_SETBACK, H * 0.5],
            [BASE_WALL_SETBACK + 0.01, H - 0.2],
            [BASE_WALL_SETBACK + 0.02, H - 0.03],
            [BASE_WALL_SETBACK + 0.12, H],
          ]
        : [
            [0, -0.05 - spring * 0.7],
            [Math.max(0.04, 0.08 + j * 0.6 + crack * 0.1 + fold * 0.25), ledge - 0.1],
            [Math.max(0.2, 0.28 + j + crack * 0.08 + fold * 0.6), ledge + 0.06],
            [Math.max(0.26, 0.36 + j + crack * 0.14 + fold), lerp(ledge, H, 0.5)],
            [Math.max(0.34, 0.46 + j + crack * 0.12 + fold), lerp(ledge, H, 0.82)],
            [Math.max(0.42, 0.56 + j + crack * 0.1 + fold * 0.8), H - 0.12],
            [0.98 + Math.max(0, fold * 0.4), H],
          ];
      const curb = 0.42 * (1 - notch);
      // 矮石沿：沿顶两环之间是平的压顶，外侧一道 0.1 米的受光倒角，再往下是一面直立的暗石墙，墙脚落在低台上
      const lo: [number, number][] = [
        [0, -0.05],
        [0.05, curb * 0.9 - notch * 0.3],
        [0.2, curb - notch * 0.32],
        [0.48, curb - notch * 0.34],
        [0.57, curb - 0.1 - notch * 0.4],
        [0.6, curb - 0.17 - notch * 0.45],
        [0.72, lerp(-0.9, LOW_Y, 0.82)],
      ];
      t = lerp(hi[k][0], lo[k][0], sw);
      y = lerp(hi[k][1], lo[k][1], sw);
      // 崖沿不做一圈亮边：每 3 列编一组，约三成的组露出暖石沿，其余由苔与林地草盖过来(同 cliffs.ts 的做法)
      const rimTop = bareRim ? mixRgb(ROCK_LIGHT, ROCK_WARM, 0.55) : mixRgb(MOSS, FOREST_FLOOR_LIGHT, 0.5);
      const strata = 0.92 + hash2(i >> 1, 7, 63) * 0.16;
      const rockCols: RGB[] = [
        mixRgb(ROCK_DARK, ROCK, 0.2),
        mixRgb(ROCK_DARK, ROCK, 0.65 - crack * 0.3),
        mixRgb(ROCK_LIGHT, MOSS, hash2(i, 5, 51) * 0.4),
        scaleRgb(ROCK, strata),
        scaleRgb(mixRgb(ROCK, ROCK_DARK, 0.25), 2 - strata),
        bareRim ? mixRgb(ROCK, ROCK_LIGHT, 0.45) : mixRgb(ROCK, MOSS, 0.55),
        rimTop,
      ];
      const stoneCols: RGB[] = [wall.foot, scaleRgb(wall.face, block), scaleRgb(wall.face, 0.9), scaleRgb(wall.face, block), scaleRgb(wall.face, block * 1.04), scaleRgb(wall.top, block), wall.top];
      // 南侧矮石沿：压顶是长苔的暖石，倒角受光(一条清楚的亮棱)；外立面是压暗的砌石(当画框用，不抢对局区)
      const mossN = fbm2(p.s * 0.31, 5.7, 2, 19);
      const cap = mixRgb(mixRgb(ROCK_LIGHT, ROCK_WARM, 0.6), MOSS, smoothstep(0.5, 0.75, mossN) * 0.6);
      const lowCols: RGB[] = [
        scaleRgb(ROCK, 0.8),
        mixRgb(ROCK_LIGHT, MOSS, mossN * 0.5),
        cap,
        scaleRgb(cap, 1.04),
        scaleRgb(mixRgb(ROCK_LIGHT, ROCK_WARM, 0.7), 0.8),
        scaleRgb(ROCK_DARK, 0.66 * block),
        scaleRgb(ROCK_DARK, 0.5 * block),
      ];
      const lowStone: RGB[] = [wall.foot, scaleRgb(wall.face, block), scaleRgb(wall.top, block), scaleRgb(wall.top, block), scaleRgb(wall.top, 1.06), scaleRgb(wall.outer, block), scaleRgb(wall.foot, block)];
      // 界外高崖是画框：岩面整体压一档，不和场内受光的岩石抢。
      // 背着主光的那几面(西侧高崖朝场内的立面)只吃天光与阴影偏色：反照率再压只会让受光的崖沿发黑，改成压它吃到的环境光(顶点 AO)，
      // 暗面 L* 从 45 上下落到 38 上下；竖缝里更暗
      const away = smoothstep(0.1, 0.6, -(p.nx * SUN_SHADOW_DIR.x + p.nz * SUN_SHADOW_DIR.y));
      const face = k >= 1 && k <= 5;
      const hiCol = inBase ? stoneCols[k] : face ? scaleRgb(rockCols[k], 0.82 * lerp(1, 0.8, away) * (1 - seam * 0.2)) : rockCols[k];
      const loCol = inBase ? lowStone[k] : lowCols[k];
      color = mixRgb(hiCol, loCol, sw);
      if (k === 0) ao = lerp(inBase ? 0.6 : 0.72, 0.72, sw);
      else if (face && !inBase) ao = lerp(1 - away * 0.27 - seam * 0.2, k >= 5 ? 0.7 : 1, sw);
      else if (inBase && k === 2) ao = 0.75;
      // 南侧外立面的墙脚：压一道接触暗部
      if (k === PROFILE_RINGS - 1) ao = lerp(ao, 0.55, sw);
      // 城垣石面只留三成岩石肌理(白石上叠满强度的岩石贴图是一层发糊的噪点)
      if (inBase) tex = 0.3;
      // 西北角出水口：崖沿压低一点、染成湿石色
      if (spring > 0 && k >= 3) {
        y -= spring * (k === 3 ? 0.1 : SPRING_DROP);
        color = mixRgb(color, [0.2, 0.36, 0.5], spring * 0.6);
      }
      if (spring > 0 && k < 3) color = mixRgb(color, [0.1, 0.2, 0.28], spring * 0.7);
    } else {
      const edge = info.edgeDist(p.x, p.z) * lerp(1, 0.93, sw);
      const topT = [2.0, 3.6, 5.6, 8, 10.6, 13.2, edge - 2.2, edge];
      const ti = k - TOP_RING0;
      if (ti < TOP_RINGS) {
        t = topT[ti];
        if (ti < TOP_RINGS - 2) t = Math.min(t, edge - 3 - (TOP_RINGS - 2 - ti) * 0.4);
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
        if (ti === 0) c = bareRim ? mixRgb(mixRgb(ROCK_LIGHT, MOSS, 0.6 + sw * 0.3), c, 0.5) : mixRgb(MOSS, c, 0.6);
        if (ti === TOP_RINGS - 1) c = mixRgb(ROCK_LIGHT, ROCK_WARM, 0.5);
        // 基地背后：高墙一侧墙顶接一段压暗的石面；南侧墙脚外是低台的草，不再铺白石
        if (inBase && ti === 0) c = mixRgb(mixRgb(wall.top, c, 0.45), c, sw);
        color = c;
        tex = ti === TOP_RINGS - 1 ? 1 : ti === 0 ? 0.6 : TOP_TEX;
      } else {
        // 高原边缘之外的断崖，向下没入云海
        const di = ti - TOP_RINGS;
        const drop = [
          [0.9, -3.5],
          [2.4, -14],
          [3.2, -30],
          [5.5, -52],
        ][di];
        t = edge + drop[0] + (hash2(seedI, k, 81) - 0.5) * 0.9;
        const topY = info.heightAt(p.x + p.nx * edge * p.miter, p.z + p.nz * edge * p.miter);
        y = topY + drop[1] + (hash2(seedI, k, 83) - 0.5) * 2.5;
        color = [ROCK, mixRgb(ROCK, ROCK_DARK, 0.6), mixRgb(ROCK_DARK, DEEP, 0.5), DEEP][di];
      }
    }
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
    // 崖沿以外(林地顶面、高原边缘的断崖)只进主通道：顶面朝天，在画背面的阴影通道里本来就留不下；外侧断崖的影子落不到场内
    extrudeRings(b, slice, false, RING_COUNT, (p, i, k) => ring(p, idxMap[i], k), (k) => (k < PROFILE_RINGS - 1 ? RANK_CASTER : RANK_MAIN_ONLY));
    // 折痕角取 24°：岩面错开的那些折线成为利落的棱(一面一面的岩块)，顶面的缓坡仍然平滑
    b.computeNormals(24);
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
        // 档位：影子能落进场内的只有西侧紧邻边界的那几排(主光自西偏南来，影长约 0.75 倍物高)；其余界外林木 medium 档不进阴影通道。
        // 离边界 9 米以外(对局镜头基本看不到)的再按散列抽稀：low 档留六成
        const rank = px < -bound && t < 7 ? RANK_CASTER : t > 9 && densityRank(px, pz, 0.6, 0.4) !== RANK_LOW ? RANK_MEDIUM : RANK_LOW;
        const pine = rng.chance(0.42 + (pz < 0 ? 0.2 : 0));
        const warm = fbm2(px * 0.04 + 9, pz * 0.04, 2, 88);
        const v = rng.range(0.85, 1.08) * (sw > 0.5 ? 0.72 : 1);
        // 空气透视：越远的树越向雾色靠(乘色近似)
        const haze = smoothstep(4, 34, t) * 0.5;
        const tint: RGB = [v * (0.95 + warm * 0.25) * (1 + haze * 0.5), v * (1 + haze * 0.62), v * (1.0 - warm * 0.25) * (1 + haze * 1.1)];
        if (pine) {
          const sc = rng.range(0.85, 1.35) * (sw > 0.5 ? 0.8 : 1);
          batch.add(rng.pick(lib.pines), trs(px, y - 0.1, pz, rng.range(0, 6.28), sc, sc * rng.range(0.9, 1.2)), { tint, rank });
        } else {
          // 紧邻对局区的第一排用精细树，其余用低面数的远景树
          const sc = rng.range(1.0, 1.55) * (sw > 0.5 ? 0.8 : 1);
          batch.add(rng.pick(t < 3.2 ? lib.trees : lib.farTrees), trs(px, y - 0.1, pz, rng.range(0, 6.28), sc, sc * rng.range(0.95, 1.15)), { tint, rank });
        }
      } else if (roll < 0.74) {
        const sc = rng.range(0.7, 1.9);
        batch.add(rng.pick(lib.boulders), trs(px, y - 0.1, pz, rng.range(0, 6.28), sc, sc * rng.range(0.8, 1.5)), { tint: scaleRgb([1, 1, 1], rng.range(0.9, 1.1)), rank: RANK_LOW });
      } else if (roll < 0.8) {
        batch.add(rng.pick(lib.shrubs), trs(px, y - 0.05, pz, rng.range(0, 6.28), rng.range(1.0, 1.7)), { rank: RANK_LOW });
      } else if (roll < 0.815 && t > 4 && sw < 0.5) {
        // 坠星留下的巨型星晶：远处的地标
        const tint = mixRgb(rgb(PALETTE.env.crystal), rgb(0x8f9cff), rng.next());
        const sc = rng.range(1.5, 2.6);
        batch.add(rng.pick(lib.bigCrystals), trs(px, y - 0.2, pz, rng.range(0, 6.28), sc, sc, rng.range(-0.15, 0.15), rng.range(-0.15, 0.15)), { tint, glow: 0.9, rank: RANK_LOW });
        out.glows.push({ x: px, z: pz, y: y + 0.1, r: 5.5, color: tint });
      } else if (roll < 0.83 && sw < 0.5) {
        batch.add(rng.pick(lib.tallPillars), trs(px, y - 0.1, pz, rng.range(0, 6.28), rng.range(1.2, 1.7), rng.range(1.2, 1.9), rng.range(-0.08, 0.08), rng.range(-0.08, 0.08)), { tint: [0.95, 0.95, 0.92], glow: 0.9, rank: RANK_LOW });
      }
    }
  }
  // 南侧矮石沿：沿顶一排向外(朝镜头)垂下的草帘，间或一丛蕨，把那条石带打碎
  const r3 = new Rng(16180);
  for (let x = -bound + 0.6; x < bound - 0.6; x += r3.range(0.4, 1.3)) {
    const z = bound + 0.34;
    if (field.riverDist(x, z) < 1.2 || field.baseDist(x, bound - 0.6) < 0.3) continue;
    const kind = r3.next();
    if (kind < 0.7) batch.add(r3.pick(lib.drapes), trs(x, 0.4, z + 0.14, -Math.PI / 2 + r3.range(-0.3, 0.3), r3.range(1.0, 1.5)), { shadow: false, tint: scaleRgb([0.86, 0.92, 0.8], r3.range(0.62, 0.9)), rank: densityRank(x, z, 0.5, 0.25) });
    else if (kind < 0.85) batch.add(r3.pick(lib.ferns), trs(x, 0.4, z - 0.04, r3.range(0, 6.28), r3.range(0.7, 1.0)), { shadow: false, rank: densityRank(x, z) });
    else if (kind < 0.93) batch.add(r3.pick(lib.vines), trs(x, 0.36, z + 0.3, -Math.PI / 2, r3.range(0.9, 1.2), r3.range(0.8, 1.5)), { shadow: false });
  }
  // 南侧石沿的墙脚：一排半埋的碎石，把「暗石墙 → 低台」那条折线打碎
  const r4 = new Rng(4409);
  for (let x = -bound + 0.8; x < bound - 0.8; x += r4.range(0.7, 2.1)) {
    const z = bound + 0.78 + r4.range(0, 0.25);
    if (field.riverDist(x, z) < 1.4) continue;
    const sc = r4.range(0.22, 0.48);
    batch.add(r4.pick(lib.rocks), trs(x, info.heightAt(x, z) + 0.02, z, r4.range(0, 6.28), sc, sc * r4.range(0.7, 1.1)), { shadow: false, tint: scaleRgb([0.8, 0.8, 0.86], r4.range(0.6, 0.85)), rank: densityRank(x, z, 0.55, 0.25) });
  }
  // 西北角出水口：水从石缝里出来——崖沿两侧各压一块大石，落点两侧是半浸在水里的石头
  const springRocks: [number, number, number, number][] = [
    [-bound + 1.05, -bound - 1.15, BAND_H - 0.45, 0.95],
    [-bound + 4.75, -bound - 1.2, BAND_H - 0.45, 0.8],
    [-bound - 1.15, -bound + 1.35, BAND_H - 0.45, 0.85],
    [-bound - 1.2, -bound + 4.65, BAND_H - 0.45, 0.9],
    [-bound + 1.0, -bound + 0.3, WATER_LEVEL - 0.1, 0.42],
    [-bound + 4.9, -bound + 0.35, WATER_LEVEL - 0.12, 0.5],
    [-bound + 0.3, -bound + 1.2, WATER_LEVEL - 0.1, 0.4],
    [-bound + 0.35, -bound + 4.9, WATER_LEVEL - 0.12, 0.46],
  ];
  springRocks.forEach(([x, z, y, sc], i) => {
    batch.add(lib.boulders[i % lib.boulders.length], trs(x, y, z, i * 1.7, sc, sc * 0.85), { tint: [0.74, 0.8, 0.88], rank: RANK_LOW });
  });
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
      if (r2.chance(0.06)) batch.add(r2.pick(lib.flowers), trs(px, y, pz, r2.range(0, 6.28), r2.range(1.6, 2.4)), { tint: r2.pick(flowerTints), shadow: false, maskedTint: true, rank: densityRank(px, pz, 0.5, 0.25) });
      else if (r2.chance(0.55)) batch.add(r2.pick(lib.tufts), trs(px, y, pz, r2.range(0, 6.28), r2.range(1.5, 2.6)), { shadow: false, tint: [0.8, 0.95, 0.75], rank: densityRank(px, pz, 0.4, 0.3) });
    }
  }
}

// ───────────── 瀑布 ─────────────

const FALL_VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec2 aFall;
varying vec2 vUv;
varying vec2 vFall;
void main() {
  vUv = uv;
  vFall = aFall;
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
varying vec2 vFall;
void main() {
  // vUv.x：横向 0..1；vUv.y：沿水流方向的米数。vFall.x：沿程 0(源头)..1(落点)；vFall.y：1 = 跌水，0 = 平铺的溪流。
  // 噪声沿下落方向拉长七八倍并向下滚动：读成一股一股的水，而不是一块抖动的白噪点
  float t = uTime;
  float n1 = texture2D(tNoise, vec2(vUv.x * 1.7, vUv.y * 0.034 - t * 0.36)).g;
  float n2 = texture2D(tNoise, vec2(vUv.x * 3.9 + 0.37, vUv.y * 0.058 - t * 0.62)).b;
  // 固定的几股水柱(只随横向变化，极慢地左右游移)
  float strands = texture2D(tNoise, vec2(vUv.x * 2.6 + 0.11 + sin(t * 0.21) * 0.01, 0.37)).g;
  float streak = smoothstep(0.4, 0.74, n1 * 0.6 + n2 * 0.4);
  float body = smoothstep(0.26, 0.6, strands + streak * 0.3);
  // 两侧与源头渐隐：没有一条笔直的边；落点一段翻成白沫
  float side = smoothstep(0.0, 0.26, vUv.x) * smoothstep(1.0, 0.74, vUv.x);
  float head = smoothstep(0.0, 0.16, vFall.x);
  float foam = smoothstep(0.7, 1.0, vFall.x) * vFall.y * (0.55 + 0.45 * n2);
  vec3 col = mix(vec3(0.19, 0.57, 0.83), vec3(0.93, 0.99, 1.0), max(streak * 0.85, foam));
  float a = side * head * max(mix(0.34, 0.9, body) * (0.55 + 0.45 * streak), foam * 0.9);
  gl_FragColor = vec4(col, a);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

interface FallStrip {
  /** 沿水流方向的各排：左端点、右端点(世界坐标) */
  rows: [THREE.Vector3, THREE.Vector3][];
  /** 水帘中间向外鼓出的方向与量 */
  bulge: THREE.Vector3;
  /** 1 = 跌水(落点翻白沫)，0 = 平铺的溪流 */
  fall: number;
}

/** 西北角的山泉瀑布 + 东南角越过石沿的跌水 */
export function createWaterfalls(field: MapField, info: BorderInfo, noise: THREE.Texture, out: ScatterResult): THREE.Mesh {
  const b = field.map.bound;
  const strips: FallStrip[] = [];
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  // 西北：北崖面(朝南，镜头正对)与西崖面各一道。水从崖顶的林地淌下来、翻过压低的崖沿、贴着岩面跌进河里：
  // 各排的 (离边界线的距离, 高度) 跟着 buildBorder 在出水口处的剖面走，只比岩面靠外一拃
  const rim = BAND_H - SPRING_DROP;
  const profile: [number, number][] = [
    [2.15, 0],
    [1.02, rim + 0.05],
    [0.5, rim - 0.06],
    [0.3, 1.72],
    [0.2, SPRING_LEDGE + 0.36],
    [0.1, SPRING_LEDGE - 0.08],
    [-0.06, WATER_LEVEL + 0.02],
  ];
  const widen = [0.0, 0.0, 0.05, 0.12, 0.2, 0.3, 0.42];
  // 北崖：横向 x0..x1；西崖：纵向 z0..z1
  const north = { a: -b + 1.5, c: -b + 4.3 };
  const west = { a: -b + 4.2, c: -b + 1.8 };
  strips.push({
    rows: profile.map(([t, y], i) => {
      const z = -b - t;
      const yy = i === 0 ? info.heightAt((north.a + north.c) / 2, z) + 0.06 : y;
      return [V(north.a - widen[i], yy, z), V(north.c + widen[i], yy, z)];
    }),
    bulge: V(0, 0, 0.16),
    fall: 1,
  });
  strips.push({
    rows: profile.map(([t, y], i) => {
      const x = -b - t;
      const yy = i === 0 ? info.heightAt(x, (west.a + west.c) / 2) + 0.06 : y;
      return [V(x, yy, west.a + widen[i]), V(x, yy, west.c - widen[i])];
    }),
    bulge: V(0.16, 0, 0),
    fall: 1,
  });
  out.glows.push({ x: -b + 2.9, z: -b + 0.8, y: WATER_LEVEL + 0.03, r: 2.6, color: [0.8, 0.95, 1] });
  out.glows.push({ x: -b + 0.8, z: -b + 3.0, y: WATER_LEVEL + 0.03, r: 2.2, color: [0.8, 0.95, 1] });
  // 落点的白沫圈
  for (const [x, z, r] of [
    [-b + 2.2, -b + 0.55, 1.0],
    [-b + 3.6, -b + 0.5, 0.8],
    [-b + 0.55, -b + 2.4, 0.9],
    [-b + 0.5, -b + 3.6, 0.75],
  ]) out.ripples.push({ x, z, r });
  // 东南：越过南侧石沿跌到低台
  const lowY = info.heightAt(b - 3.5, b + 2.2) + 0.12;
  strips.push({
    rows: [
      [V(b - 6.4, WATER_LEVEL, b - 0.5), V(b - 0.2, WATER_LEVEL, b - 0.5)],
      [V(b - 6.6, WATER_LEVEL - 0.02, b + 0.45), V(b - 0.2, WATER_LEVEL - 0.02, b + 0.45)],
      [V(b - 6.8, lerp(WATER_LEVEL, lowY, 0.5), b + 1.0), V(b + 0.1, lerp(WATER_LEVEL, lowY, 0.5), b + 1.0)],
      [V(b - 7.0, lowY, b + 1.5), V(b + 0.4, lowY, b + 1.5)],
    ],
    bulge: V(0, 0.1, 0.22),
    fall: 1,
  });
  // 低台上的水潭与流向高原边缘的溪流(平铺的水带)
  strips.push({
    rows: [
      [V(b - 7.2, lowY, b + 1.2), V(b + 0.8, lowY, b + 1.2)],
      [V(b - 4.4, lowY - 0.08, b + 6.5), V(b + 4.4, lowY - 0.08, b + 4.8)],
      [V(b - 0.2, lowY - 0.16, b + 12), V(b + 8, lowY - 0.16, b + 8.6)],
      [V(b + 4.5, lowY - 0.25, b + 17), V(b + 11.5, lowY - 0.25, b + 12)],
    ],
    bulge: V(0, 0, 0),
    fall: 0,
  });
  out.glows.push({ x: b - 3.2, z: b + 1.9, y: lowY + 0.05, r: 3.4, color: [0.8, 0.95, 1] });

  const pos: number[] = [];
  const uv: number[] = [];
  const fall: number[] = [];
  const idx: number[] = [];
  const cols = 4;
  const p = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const prevMid = new THREE.Vector3();
  for (const s of strips) {
    const base = pos.length / 3;
    const rows = s.rows.length;
    // 沿程长度(按各排中点累加)
    const lens: number[] = [0];
    for (let i = 1; i < rows; i++) {
      mid.addVectors(s.rows[i][0], s.rows[i][1]).multiplyScalar(0.5);
      prevMid.addVectors(s.rows[i - 1][0], s.rows[i - 1][1]).multiplyScalar(0.5);
      lens.push(lens[i - 1] + mid.distanceTo(prevMid));
    }
    const total = lens[rows - 1] || 1;
    for (let i = 0; i < rows; i++) {
      const t = lens[i] / total;
      const arc = Math.sin(t * Math.PI) * 0.6 + t * 0.4;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        // 中间鼓、两边收：水帘有一点弧度
        p.lerpVectors(s.rows[i][0], s.rows[i][1], u).addScaledVector(s.bulge, arc * Math.sin(u * Math.PI) * 1.3);
        pos.push(p.x, p.y, p.z);
        uv.push(u, lens[i]);
        fall.push(t, s.fall);
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      for (let c = 0; c < cols; c++) {
        const a = base + i * (cols + 1) + c;
        idx.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aFall', new THREE.Float32BufferAttribute(fall, 2));
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

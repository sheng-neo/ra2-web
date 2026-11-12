/**
 * 点缀物散布(全部种子随机，结果每次一致)：
 * - 墙体顶上：分层叶团的树、灌木、蕨、水晶簇、岩石、灯果、断柱；窄石脊上只放石块、灌木与矮树；
 * - 崖沿与崖壁：下垂的草帘、藤蔓(优先挂在朝镜头的南面和西面)、层架菌；崖脚：半埋的碎石、蕨丛、伞菇；
 * - 可走地面：只放低矮小物(草簇/花丛/碎石)，并避开兵线、河道、基地、塔座的核心区域——
 *   凡是有体量的东西都只放在不可走的地方，玩家不会被「看着能走其实是装饰」误导；
 * - 河道：成组的荷叶与花苞、水里的碎晶与石头；贴着墙体的河岸长芦苇与香蒲。
 * 发光物统一登记在一张稀疏网格里(间隔 ≥ 8 米)：占用了就不再放，保证每屏发光点少而准。
 * 同时产出：AO 暗斑(树/石/柱脚下的接触暗部)、低画质静态投影的高物、水里涟漪圈的位置。
 */
import * as THREE from 'three';
import { pointInPolygon } from '../../core/map';
import { PALETTE, Rng, fbm2 } from '../materials';
import type { CliffInfo } from './cliffs';
import { type MapField, type StaticCaster, WATER_LEVEL, polygonSignedDist } from './field';
import { type RGB, type SceneryBatcher, mixRgb, rgb, scaleRgb } from './geo';
import { VIEW_OCCLUDE_PER_METER } from '../engine/camera';
import { type PropLibrary, TREE_CANOPY, TREE_CROWN_Y, TREE_TOP } from './models';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** 组一个 TRS 矩阵(绕 y 旋转 + 轻微倾斜) */
export function trs(x: number, y: number, z: number, rotY: number, scale: number, scaleY = scale, tiltX = 0, tiltZ = 0): THREE.Matrix4 {
  _e.set(tiltX, rotY, tiltZ, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(scale, scaleY, scale);
  return _m.compose(_p, _q, _s);
}

/** 让模型的局部 +x 指向水平方向 (dx, dz) 所需的绕 y 转角 */
export const faceDir = (dx: number, dz: number): number => Math.atan2(-dz, dx);

const E = PALETTE.env;
const AMBER = rgb(E.amber);
const GLOW_CYAN = rgb(E.glowCyan);
const VIOLET = rgb(E.violet);
const FROST = rgb(E.frost);
const EMBER = rgb(0xff8a4a);
const GOLD = rgb(E.starGold);
const BLUE_GLOW = rgb(PALETTE.blue.glow);
const RED_GLOW = rgb(PALETTE.red.glow);

/** 某处的「主题色」：靠近哪个营地，水晶与菌就偏向哪种颜色；其余用野区的三种点缀色(荧青 / 紫罗兰 / 琥珀)，不出现队伍色 */
export function themeTint(field: MapField, x: number, z: number, rng: Rng): RGB {
  const map = field.map;
  for (const c of map.camps) {
    const d = Math.hypot(x - c.pos.x, z - c.pos.y);
    if (d > 13) continue;
    if (c.monsterType === 'frost_golem') return mixRgb(FROST, [0.85, 0.95, 1], rng.range(0, 0.4));
    if (c.monsterType === 'ember_golem') return mixRgb(EMBER, GOLD, rng.range(0, 0.4));
    if (c.monsterType === 'abyss_drake' && d < 11) return mixRgb(VIOLET, [0.6, 0.5, 1], rng.range(0, 0.4));
    if (c.monsterType === 'star_colossus' && d < 11) return mixRgb(GOLD, [1, 0.95, 0.8], rng.range(0, 0.4));
  }
  // 基地附近才带一点队伍色；野区里是荧青与紫罗兰
  const baseD = field.baseDist(x, z, 14);
  if (baseD < 9) return x - z < 0 ? mixRgb(GLOW_CYAN, BLUE_GLOW, rng.range(0.4, 0.8)) : mixRgb(AMBER, RED_GLOW, rng.range(0.3, 0.7));
  return rng.chance(0.62) ? mixRgb(GLOW_CYAN, [0.8, 1, 0.95], rng.range(0, 0.35)) : mixRgb(VIOLET, GLOW_CYAN, rng.range(0, 0.3));
}

/** 树冠色偏：整体青绿，带一点冷暖变化；红方一侧略偏暖 */
function canopyTint(x: number, z: number, rng: Rng): RGB {
  const side = (x - z) / 110;
  const n = fbm2(x * 0.06, z * 0.06, 2, 77);
  const warm = Math.max(0, side) * 0.22 + (n - 0.5) * 0.3;
  // 树冠是画面里的暗框：整体压一档
  const v = rng.range(0.78, 0.94);
  return [v * (1 + warm * 0.5), v * (1 + warm * 0.08), v * (1 - warm * 0.35)];
}

/** 高度 h 的东西会挡住它北边 h × cot(镜头俯角) 远的地面(俯角以相机装置为准) */
const OCCLUDE_PER_METER = VIEW_OCCLUDE_PER_METER;
/** 小于这个缩放的树不像树了 */
const MIN_TREE_SCALE = 0.55;
/** 允许树冠压住可走地面边缘的宽度(墙脚本来就有碎石草簇，单位很少贴着走) */
const OCCLUDE_SLACK = 0.7;

/**
 * 种在 (x, z)、根部高度 baseY 的树最大能多大，才不会遮住北侧的可走地面。
 * 沿正北(以及树冠两侧)逐步探出去，找到第一处可走地面的距离，反推树顶高度上限。
 */
function treeScaleLimit(field: MapField, x: number, z: number, baseY: number): number {
  const bound = field.map.bound;
  let room = 14;
  for (const ox of [-1.1, 0, 1.1]) {
    for (let dz = 0.5; dz < room; dz += 0.5) {
      const sx = x + ox;
      const sz = z - dz;
      // 地图边界以外是装饰带，随便挡
      if (Math.abs(sx) > bound || Math.abs(sz) > bound) break;
      if (field.solidDist(sx, sz, 2) > 0.05) {
        room = dz;
        break;
      }
    }
  }
  // 顶高 × 系数 ≤ 可用纵深 + 容差；树冠北缘也要落在里面
  const byTop = ((room + OCCLUDE_SLACK) / OCCLUDE_PER_METER - baseY) / TREE_TOP;
  const byCanopy = (room + OCCLUDE_SLACK - baseY * OCCLUDE_PER_METER) / (TREE_CANOPY * 0.8 + TREE_CROWN_Y * OCCLUDE_PER_METER);
  return Math.min(byTop, byCanopy);
}

/** AO 暗斑：物体脚下一块预乘黑色的软圆(并进地形贴花网格) */
export interface AoBlob {
  x: number;
  y: number;
  z: number;
  r: number;
  strength: number;
}

export interface ScatterResult {
  /** 地面发光点(给贴地光晕与环境染色用)：x, z, 半径, 颜色 */
  glows: { x: number; z: number; y: number; r: number; color: RGB }[];
  aoBlobs: AoBlob[];
  /** 树冠等高物：低画质的静态投影 + 环境染色贴图里的天光遮蔽 */
  casters: StaticCaster[];
  /** 水里的石头/荷叶/残柱：涟漪圈贴花的位置与半径 */
  ripples: { x: number; z: number; r: number }[];
}

export function createScatterResult(): ScatterResult {
  return { glows: [], aoBlobs: [], casters: [], ripples: [] };
}

/** 发光物登记网格：同一格及相邻格里已有发光物、且距离小于 spacing 就拒绝 */
export class GlowGrid {
  private cells = new Map<number, [number, number][]>();
  constructor(private spacing = 8) {}

  private key(ix: number, iz: number): number {
    return (ix + 512) * 4096 + (iz + 512);
  }

  /** 该处能不能再放一个发光物；能就登记并返回 true */
  claim(x: number, z: number, spacing = this.spacing): boolean {
    const s = this.spacing;
    const ix = Math.floor(x / s);
    const iz = Math.floor(z / s);
    const reach = Math.ceil(spacing / s);
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const list = this.cells.get(this.key(ix + dx, iz + dz));
        if (!list) continue;
        for (const p of list) if (Math.hypot(p[0] - x, p[1] - z) < spacing) return false;
      }
    }
    this.reserve(x, z);
    return true;
  }

  /** 无条件登记(营地/基地的主题发光件：它们优先，周围的散件让位) */
  reserve(x: number, z: number): void {
    const k = this.key(Math.floor(x / this.spacing), Math.floor(z / this.spacing));
    const list = this.cells.get(k);
    if (list) list.push([x, z]);
    else this.cells.set(k, [[x, z]]);
  }
}

const FLOWER_COLORS: RGB[] = [rgb(E.petalWhite), rgb(0xffe6a0), rgb(E.petalPink), rgb(0xcfe0ff), rgb(0xe0c8ff), rgb(0xffcfa0)];

export function scatterWallTops(batch: SceneryBatcher, lib: PropLibrary, field: MapField, cliffs: CliffInfo[], out: ScatterResult, glow: GlowGrid): void {
  cliffs.forEach((cliff, wi) => {
    const rng = new Rng(5000 + wi * 31);
    const poly = cliff.poly;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const q = { x: 0, y: 0 };
    const ridge = cliff.kind === 'ridge';
    const big = cliff.inradius > 3.1;
    // 紧邻基地的石台：树更矮更稀，别把高地入口堵成一堵绿墙
    const nearBase = field.baseDist((minX + maxX) / 2, (minY + maxY) / 2, 20) < 10;
    const step = big ? 2.3 : 1.8;
    const treeSpots: [number, number, number][] = [];
    const nicheNear = (x: number, z: number): boolean => cliff.niches.some((nc) => Math.hypot(nc.x - x, nc.z - z) < 1.6);
    for (let y = minY; y <= maxY; y += step) {
      for (let x = minX; x <= maxX; x += step) {
        q.x = x + rng.range(-0.5, 0.5) * step;
        q.y = y + rng.range(-0.5, 0.5) * step;
        if (!pointInPolygon(q, poly)) continue;
        const d = -polygonSignedDist(q, poly);
        if (d < (ridge ? 1.2 : 1.35)) continue;
        const px = q.x;
        const pz = q.y;
        if (nicheNear(px, pz)) continue;
        const ty = cliff.topY(d) - 0.04;
        const roll = rng.next();
        // 树：镜头朝北俯视，树冠会挡住它北边的一条地面(顶高 × cot 俯角)。先量出正北方向到最近可走地面的距离，
        // 按它给树的大小封顶；空间不够长出一棵像样的树就不种，让位给灌木/岩石
        const cap = ridge ? 0.72 : nearBase ? 0.9 : 1.08;
        const wantSc = Math.min(cap, (big ? rng.range(0.82, 1.08) : rng.range(0.62, 0.8)) * Math.min(1.1, 0.7 + d * 0.12));
        const maxSc = d >= (big ? 1.9 : 1.55) ? treeScaleLimit(field, px, pz, ty) : 0;
        if (maxSc >= MIN_TREE_SCALE && roll < (ridge ? 0.22 : big ? (nearBase ? 0.5 : 0.64) : 0.45)) {
          let ok = true;
          for (const t of treeSpots) if (Math.hypot(t[0] - px, t[1] - pz) < (t[2] + 1) * 1.15) ok = false;
          if (ok) {
            const sc = Math.min(wantSc, maxSc);
            const scY = sc * rng.range(0.95, 1.1);
            // 偶尔一株花树/金叶树做色彩点缀；大石台中央偶尔一棵星松；近河的石台上是垂枝树
            const pick = rng.next();
            const nearRiver = field.riverDist(px, pz) < 6;
            if (pick < 0.09) batch.add(lib.accentTrees[pick < 0.05 ? 0 : 1], trs(px, ty, pz, rng.range(0, 6.28), sc, scY), { tint: scaleRgb([1, 1, 1], rng.range(0.92, 1.04)) });
            else if (nearRiver && pick < 0.6) batch.add(rng.pick(lib.willows), trs(px, ty, pz, rng.range(0, 6.28), sc, scY), { tint: canopyTint(px, pz, rng) });
            else if (big && d > 3 && pick > 0.9 && maxSc > 1) batch.add(rng.pick(lib.pines), trs(px, ty, pz, rng.range(0, 6.28), sc * 0.85, scY * 0.85), { tint: canopyTint(px, pz, rng) });
            else batch.add(rng.pick(lib.trees), trs(px, ty, pz, rng.range(0, 6.28), sc, scY), { tint: canopyTint(px, pz, rng) });
            treeSpots.push([px, pz, sc]);
            out.aoBlobs.push({ x: px, y: ty + 0.06, z: pz, r: 2.0 * sc, strength: 0.38 });
            out.casters.push({ x: px, z: pz, height: ty + TREE_CROWN_Y * sc, radius: TREE_CANOPY * sc * 1.05, strength: 0.72 });
            continue;
          }
        }
        if (roll < 0.86) {
          const kind = rng.next();
          if (kind < 0.3) {
            const sc = rng.range(0.75, 1.2);
            batch.add(rng.pick(lib.shrubs), trs(px, ty, pz, rng.range(0, 6.28), sc), { tint: canopyTint(px, pz, rng) });
            out.aoBlobs.push({ x: px, y: ty + 0.06, z: pz, r: 0.95 * sc, strength: 0.3 });
          } else if (kind < (ridge ? 0.62 : 0.46)) {
            const sc = rng.range(0.45, 0.85) * (ridge ? 1.15 : 1);
            batch.add(rng.pick(lib.boulders), trs(px, ty + 0.05, pz, rng.range(0, 6.28), sc, sc * rng.range(0.8, 1.2)), { tint: scaleRgb([1, 1, 1], rng.range(0.9, 1.1)) });
            out.aoBlobs.push({ x: px, y: ty + 0.06, z: pz, r: 1.3 * sc, strength: 0.34 });
          } else if (kind < 0.6 && d > 0.95 && !ridge) {
            // 水晶簇：发光物，要先在网格里占位；占不到就换成蕨丛
            if (glow.claim(px, pz)) {
              const tint = themeTint(field, px, pz, rng);
              const sc = rng.range(0.75, 1.2);
              const bigC = big && d > 2.2 && rng.chance(0.3);
              batch.add(rng.pick(bigC ? lib.bigCrystals : lib.crystals), trs(px, ty, pz, rng.range(0, 6.28), sc), { tint, glow: rng.range(0.75, 1) });
              out.glows.push({ x: px, z: pz, y: ty + 0.05, r: bigC ? 3.2 : 2.0, color: tint });
              out.aoBlobs.push({ x: px, y: ty + 0.06, z: pz, r: bigC ? 1.5 : 0.9, strength: 0.25 });
            } else {
              batch.add(rng.pick(lib.ferns), trs(px, ty, pz, rng.range(0, 6.28), rng.range(1.1, 1.6)), { shadow: false });
            }
          } else if (kind < 0.68) {
            if (glow.claim(px, pz)) {
              const sc = rng.range(0.9, 1.3);
              batch.add(rng.pick(lib.lanterns), trs(px, ty, pz, rng.range(0, 6.28), sc));
              out.glows.push({ x: px, z: pz, y: ty + 0.05, r: 1.6, color: AMBER });
            } else {
              batch.add(rng.pick(lib.ferns), trs(px, ty, pz, rng.range(0, 6.28), rng.range(1.0, 1.5)), { shadow: false });
            }
          } else if (kind < 0.75 && d < 1.9 && !ridge) {
            const tall = rng.chance(0.4);
            batch.add(rng.pick(tall ? lib.tallPillars : lib.pillars), trs(px, ty - 0.05, pz, rng.range(0, 6.28), rng.range(0.9, 1.1), 1, rng.range(-0.05, 0.05), rng.range(-0.05, 0.05)), {
              tint: scaleRgb([1, 0.99, 0.95], rng.range(0.85, 1)),
              glow: 0.5,
            });
            out.aoBlobs.push({ x: px, y: ty + 0.06, z: pz, r: 0.85, strength: 0.34 });
          } else if (kind < 0.8) {
            batch.add(rng.pick(lib.flowers), trs(px, ty + 0.02, pz, rng.range(0, 6.28), rng.range(1.5, 2.2)), { tint: rng.pick(FLOWER_COLORS), shadow: false, maskedTint: true });
          } else if (kind < 0.92) {
            batch.add(rng.pick(lib.ferns), trs(px, ty, pz, rng.range(0, 6.28), rng.range(1.0, 1.6)), { shadow: false });
          } else {
            batch.add(rng.pick(lib.tufts), trs(px, ty, pz, rng.range(0, 6.28), rng.range(1.3, 2.0)), { shadow: false });
          }
        }
      }
    }
    // 台顶的矮草：给顶面一些细碎的起伏(数量比原来减半，顶面的纹理已经由材质给了)
    if (!ridge) {
      for (let y = minY; y <= maxY; y += 0.95) {
        for (let x = minX; x <= maxX; x += 0.95) {
          q.x = x + rng.range(-0.45, 0.45);
          q.y = y + rng.range(-0.45, 0.45);
          if (!pointInPolygon(q, poly)) continue;
          const d = -polygonSignedDist(q, poly);
          if (d < 1.35 || !rng.chance(0.3)) continue;
          batch.add(rng.pick(lib.tufts), trs(q.x, cliff.topY(d) - 0.03, q.y, rng.range(0, 6.28), rng.range(1.2, 1.9)), { shadow: false, tint: [0.95, 1.0, 0.9] });
        }
      }
    }

    // ── 崖沿与崖壁：草帘、藤蔓、层架菌；崖脚：半埋碎石与蕨丛 ──
    for (const rp of cliff.rim) {
      // 朝外方向的 z 分量：> 0 朝南(朝镜头)，< 0 朝北(背对镜头，基本看不见)
      const facing = rp.oz;
      const rot = faceDir(rp.ox, rp.oz);
      const ex = rp.x - rp.ox * rp.inset;
      const ez = rp.z - rp.oz * rp.inset;
      if (!rp.bare && facing > -0.75 && !ridge) {
        const nDr = rng.chance(0.75) ? 2 : 1;
        for (let k = 0; k < nDr; k++) {
          const off = rng.range(-0.45, 0.45);
          batch.add(rng.pick(lib.drapes), trs(ex - rp.oz * off + rp.ox * 0.04, rp.y - 0.05, ez + rp.ox * off + rp.oz * 0.04, rot + rng.range(-0.25, 0.25), rng.range(0.9, 1.35)), { shadow: false, tint: scaleRgb([1, 1, 0.94], rng.range(0.88, 1.06)) });
        }
      }
      // 藤蔓：朝南、朝西的崖面上多
      const vineP = facing > 0.3 || rp.ox < -0.3 ? 0.2 : facing > -0.5 ? 0.06 : 0;
      if (!ridge && rng.chance(vineP)) {
        const back = Math.max(0.02, rp.inset - 0.26);
        batch.add(rng.pick(lib.vines), trs(rp.x - rp.ox * back, rp.y - 0.12, rp.z - rp.oz * back, rot, rng.range(0.9, 1.25), rng.range(0.7, Math.max(0.8, Math.min(1.7, rp.y - 0.9)))), { shadow: false, tint: scaleRgb([1, 1, 1], rng.range(0.85, 1.08)) });
      }
      if (facing > -0.2 && rng.chance(0.07)) {
        const lit = glow.claim(rp.x, rp.z, 10);
        const tint = lit ? themeTint(field, rp.x, rp.z, rng) : rgb(0xd9a070);
        batch.add(rng.pick(lib.brackets), trs(rp.x - rp.ox * 0.06, rng.range(0.25, 0.42), rp.z - rp.oz * 0.06, rot, rng.range(0.9, 1.4)), { shadow: false, tint, maskedTint: true, glow: lit ? 1 : 0 });
        if (lit) out.glows.push({ x: rp.x + rp.ox * 0.4, z: rp.z + rp.oz * 0.4, y: 0.03, r: 1.0, color: tint });
      }
      // 崖脚：半埋的碎石(中心在碰撞轮廓内侧)，把石台和地面的接缝藏起来
      if (rng.chance(0.4)) {
        const sc = rng.range(0.28, 0.5);
        const off = rng.range(-0.4, 0.4);
        const bx = rp.x - rp.ox * 0.22 - rp.oz * off;
        const bz = rp.z - rp.oz * 0.22 + rp.ox * off;
        if (field.riverDist(bx, bz) > 0.2) batch.add(rng.pick(lib.rocks), trs(bx, -0.04, bz, rng.range(0, 6.28), sc, sc * rng.range(0.7, 1.05)), { tint: scaleRgb([1, 1, 1], rng.range(0.82, 1.05)) });
      }
    }
  });
}

export function scatterGround(batch: SceneryBatcher, lib: PropLibrary, field: MapField, density: number, out: ScatterResult, glow: GlowGrid): void {
  const map = field.map;
  const bound = map.bound;
  const rng = new Rng(777);

  // ── 草簇与花丛：抖动网格 + 噪声成片 ──
  const step = 1.05;
  for (let z = -bound; z <= bound; z += step) {
    for (let x = -bound; x <= bound; x += step) {
      const px = x + rng.range(-0.5, 0.5) * step;
      const pz = z + rng.range(-0.5, 0.5) * step;
      const r = rng.next();
      const n = fbm2(px * 0.11, pz * 0.11, 3, 19);
      if (!field.clutterOk(px, pz, 0.9)) continue;
      if (field.bushDist(px, pz) < 0.3) continue;
      if (field.campDist(px, pz) < -0.6) continue;
      const solid = field.solidDist(px, pz, 4);
      // 靠墙的地方草更密；开阔处成片出现
      const p = (solid < 1.6 ? 0.55 : 0.16 + Math.max(0, n - 0.45) * 1.5) * density;
      if (r > p) continue;
      const y = field.heightAt(px, pz) - 0.02;
      const kind = rng.next();
      const fl = fbm2(px * 0.07 + 31, pz * 0.07, 2, 23);
      // 花丛：数量比原来少六成，单朵放大一倍，成片同色
      if (kind < 0.05 + Math.max(0, fl - 0.52) * 0.7) {
        batch.add(rng.pick(lib.flowers), trs(px, y, pz, rng.range(0, 6.28), rng.range(1.3, 1.9)), { tint: FLOWER_COLORS[Math.floor(fl * 5.99 + rng.range(0, 0.8)) % FLOWER_COLORS.length], shadow: false, maskedTint: true });
      } else {
        const g = 0.88 + n * 0.24;
        batch.add(rng.pick(lib.tufts), trs(px, y, pz, rng.range(0, 6.28), rng.range(0.9, 1.6)), { shadow: false, tint: [g * 0.97, g, g * 0.9] });
      }
    }
  }

  // ── 墙脚外侧：碎石、蕨丛、伞菇、灯果(紧贴不可走区域，不占路) ──
  field.walls.forEach((w, wi) => {
    const r2 = new Rng(8800 + wi * 13);
    const poly = w.poly;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const nx = (b.y - a.y) / len;
      const nz = -(b.x - a.x) / len;
      // 朝外的法线：取让点落到多边形外的那一侧
      const mid = { x: (a.x + b.x) / 2 + nx * 0.2, y: (a.y + b.y) / 2 + nz * 0.2 };
      const sign = pointInPolygon(mid, poly) ? -1 : 1;
      for (let s = r2.range(0.3, 1.2); s < len; s += r2.range(0.7, 1.9)) {
        const off = r2.range(0.05, 0.42);
        const px = a.x + ((b.x - a.x) * s) / len + nx * sign * off;
        const pz = a.y + ((b.y - a.y) * s) / len + nz * sign * off;
        if (field.solidDist(px, pz) < 0.02) continue;
        if (field.laneDist(px, pz) < 0.6 || field.riverDist(px, pz) < 0.3 || field.baseDist(px, pz) < 0.3 || field.padDist(px, pz) < 0.3) continue;
        const y = field.heightAt(px, pz);
        const kind = r2.next();
        if (kind < 0.34) {
          const sc = r2.range(0.16, 0.34) * (off < 0.2 ? 1.25 : 1);
          batch.add(r2.pick(lib.rocks), trs(px, y, pz, r2.range(0, 6.28), sc, sc * r2.range(0.7, 1.1)), { shadow: false, tint: scaleRgb([1, 1, 1], r2.range(0.85, 1.08)) });
        } else if (kind < 0.56) {
          batch.add(r2.pick(lib.ferns), trs(px, y - 0.02, pz, r2.range(0, 6.28), r2.range(0.8, 1.25)), { shadow: false, tint: scaleRgb([1, 1, 1], r2.range(0.85, 1.05)) });
        } else if (kind < 0.66) {
          // 伞菇组团：约三成发光(并且要在发光网格里占到位)，其余是不发光的暖色菇
          const lit = r2.chance(0.4) && glow.claim(px, pz);
          const tint = lit ? mixRgb(themeTint(field, px, pz, r2), [1, 1, 1], 0.2) : r2.pick([rgb(0xd8683a), rgb(0xe0b070), rgb(0xc98a6a)]);
          batch.add(r2.pick(lib.mushrooms), trs(px, y, pz, r2.range(0, 6.28), r2.range(1.0, 1.5)), { shadow: false, tint, maskedTint: true, glow: lit ? 1 : 0 });
          if (lit) out.glows.push({ x: px, z: pz, y: y + 0.03, r: 1.1, color: tint });
        } else if (kind < 0.7 && off > 0.15) {
          if (glow.claim(px, pz)) {
            batch.add(r2.pick(lib.lanterns), trs(px, y, pz, r2.range(0, 6.28), r2.range(0.5, 0.68)), { shadow: false });
            out.glows.push({ x: px, z: pz, y: y + 0.03, r: 1.3, color: AMBER });
          }
        } else if (kind < 0.86) {
          batch.add(r2.pick(lib.tufts), trs(px, y - 0.02, pz, r2.range(0, 6.28), r2.range(1.3, 2.0)), { shadow: false });
        }
      }
    }
  });

  // ── 河道：成组的荷叶与花苞、星屑碎晶、石头 ──
  const line = field.riverLine;
  const a = line[0];
  const b = line[line.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const dx = (b.x - a.x) / len;
  const dz = (b.y - a.y) / len;
  const r4 = new Rng(1212);
  const half = map.riverWidth / 2;
  for (let s = 0; s < len; s += 2.6) {
    const across = (r4.chance(0.5) ? 1 : -1) * r4.range(half - 3.2, half - 1.2);
    const px = a.x + dx * s - dz * across;
    const pz = a.y + dz * s + dx * across;
    if (field.boundDist(px, pz) < 0.8) continue;
    if (field.laneDist(px, pz) < 1.6) continue;
    if (field.campDist(px, pz) < 0.8) continue;
    const k = r4.next();
    if (k < 0.42) {
      // 一组荷叶：3~5 片，半径 0.35~0.7 米，带一枚花苞
      const n = 3 + r4.int(3);
      let big = 0;
      for (let i = 0; i < n; i++) {
        const an = r4.range(0, 6.28);
        const d = i === 0 ? 0 : r4.range(0.55, 1.25);
        const lx = px + Math.cos(an) * d;
        const lz = pz + Math.sin(an) * d;
        if (field.heightAt(lx, lz) > WATER_LEVEL - 0.08) continue;
        const sc = i === 0 ? r4.range(0.55, 0.7) : r4.range(0.35, 0.55);
        big = Math.max(big, sc);
        batch.add(r4.pick(lib.lilyPads), trs(lx, WATER_LEVEL + 0.012, lz, r4.range(0, 6.28), sc, 1), { shadow: false, tint: scaleRgb([1, 1, 1], r4.range(0.85, 1.08)) });
        if (i === 1) batch.add(lib.lotusBud, trs(lx, WATER_LEVEL, lz, r4.range(0, 6.28), r4.range(0.9, 1.2)), { shadow: false, tint: rgb(E.petalPink), maskedTint: true });
      }
      if (big > 0 && r4.chance(0.6)) out.ripples.push({ x: px, z: pz, r: 1.3 });
    } else if (k < 0.5) {
      if (glow.claim(px, pz, 10)) {
        const tint = mixRgb(GLOW_CYAN, [1, 1, 1], r4.range(0.1, 0.4));
        const sc = r4.range(0.2, 0.4);
        batch.add(r4.pick(lib.crystals), trs(px, field.heightAt(px, pz) - 0.02, pz, r4.range(0, 6.28), sc, sc, r4.range(-0.3, 0.3), r4.range(-0.3, 0.3)), { shadow: false, tint, glow: 1 });
        out.glows.push({ x: px, z: pz, y: WATER_LEVEL + 0.02, r: 1.5, color: tint });
        out.ripples.push({ x: px, z: pz, r: 0.8 });
      }
    } else if (k < 0.66) {
      // 水里的石头：两三块成组，露出水面一点
      const n = 1 + r4.int(3);
      for (let i = 0; i < n; i++) {
        const sc = r4.range(0.25, 0.5) * (i === 0 ? 1.2 : 0.8);
        const lx = px + r4.range(-0.6, 0.6) * i;
        const lz = pz + r4.range(-0.6, 0.6) * i;
        batch.add(r4.pick(lib.rocks), trs(lx, field.heightAt(lx, lz) + 0.04, lz, r4.range(0, 6.28), sc, sc * 0.8), { shadow: false, tint: [0.8, 0.86, 0.92] });
      }
      if (r4.chance(0.5)) out.ripples.push({ x: px, z: pz, r: 0.9 });
    }
  }

  // ── 河岸上的星铃草：矮小的铃花丛，带一点青色微光(要在发光网格里占到位) ──
  const r6 = new Rng(2323);
  for (let s = 0; s < len; s += 4.5) {
    const side = r6.chance(0.5) ? 1 : -1;
    const across = side * (half + r6.range(0.7, 1.3));
    const px = a.x + dx * s - dz * across;
    const pz = a.y + dz * s + dx * across;
    const sc = r6.range(0.5, 0.62);
    const rot = r6.range(0, 6.28);
    if (field.boundDist(px, pz) < 1 || field.laneDist(px, pz) < 1.5 || field.solidDist(px, pz) < 0.4 || field.bushDist(px, pz) < 0.4 || field.campDist(px, pz) < 0.5) continue;
    if (!glow.claim(px, pz, 9)) continue;
    const tint = mixRgb(GLOW_CYAN, [1, 1, 1], 0.25);
    batch.add(r6.pick(lib.bells), trs(px, field.heightAt(px, pz) - 0.02, pz, rot, sc), { shadow: false, tint, maskedTint: true, glow: 1 });
    out.glows.push({ x: px, z: pz, y: 0.03, r: 1.1, color: tint });
  }

  // ── 贴着墙体的河岸：芦苇与香蒲(种在墙脚的碰撞轮廓里，不占可走水面) ──
  field.walls.forEach((w, wi) => {
    const r5 = new Rng(6100 + wi * 7);
    const poly = w.poly;
    for (let i = 0; i < poly.length; i++) {
      const p0 = poly[i];
      const p1 = poly[(i + 1) % poly.length];
      const l = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const nx = (p1.y - p0.y) / l;
      const nz = -(p1.x - p0.x) / l;
      const mid = { x: (p0.x + p1.x) / 2 + nx * 0.2, y: (p0.y + p1.y) / 2 + nz * 0.2 };
      const inward = pointInPolygon(mid, poly) ? 1 : -1;
      for (let s = r5.range(0.2, 0.7); s < l; s += r5.range(0.45, 0.9)) {
        const px = p0.x + ((p1.x - p0.x) * s) / l + nx * inward * 0.14;
        const pz = p0.y + ((p1.y - p0.y) * s) / l + nz * inward * 0.14;
        if (field.riverDist(px, pz) > 1.0 || field.laneDist(px, pz) < 1.2) continue;
        if (!r5.chance(0.8)) continue;
        batch.add(r5.pick(lib.reeds), trs(px, Math.min(0, field.heightAt(px, pz)) - 0.05, pz, r5.range(0, 6.28), r5.range(0.85, 1.3)), { shadow: false, tint: scaleRgb([1, 1, 1], r5.range(0.85, 1.05)) });
      }
    }
  });
}

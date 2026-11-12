/**
 * 点缀物散布(全部种子随机，结果每次一致)：
 * - 墙体顶上：树、灌木、水晶簇、岩石、灯笼果、断柱；
 * - 可走地面：只放低矮小物(草簇/花丛/蘑菇/碎石/营地残石)，并避开兵线、河道、基地、塔座的核心区域——
 *   凡是有体量的东西都只放在不可走的地方，玩家不会被「看着能走其实是装饰」误导。
 */
import * as THREE from 'three';
import { pointInPolygon } from '../../core/map';
import { PALETTE, Rng, fbm2 } from '../materials';
import type { CliffInfo } from './cliffs';
import { type MapField, WATER_LEVEL, campRadius, polygonSignedDist } from './field';
import { type RGB, type SceneryBatcher, mixRgb, rgb, scaleRgb } from './geo';
import type { PropLibrary } from './models';

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

const CRYSTAL = rgb(PALETTE.env.crystal);
const CRYSTAL_DEEP = rgb(PALETTE.env.crystalDeep);
const FROST = rgb(PALETTE.env.frost);
const EMBER = rgb(0xff8a4a);
const ABYSS = rgb(PALETTE.env.abyss);
const GOLD = rgb(PALETTE.env.starGold);
const BLUE_GLOW = rgb(PALETTE.blue.glow);
const RED_GLOW = rgb(PALETTE.red.glow);

/** 某处的「主题色」：靠近哪个阵营/营地，水晶与花就偏向哪种颜色 */
export function themeTint(field: MapField, x: number, z: number, rng: Rng): RGB {
  const map = field.map;
  for (const c of map.camps) {
    const d = Math.hypot(x - c.pos.x, z - c.pos.y);
    if (d > 13) continue;
    if (c.monsterType === 'frost_golem') return mixRgb(FROST, CRYSTAL, rng.range(0, 0.4));
    if (c.monsterType === 'ember_golem') return mixRgb(EMBER, GOLD, rng.range(0, 0.4));
    if (c.monsterType === 'abyss_drake' && d < 11) return mixRgb(ABYSS, CRYSTAL_DEEP, rng.range(0, 0.4));
    if (c.monsterType === 'star_colossus' && d < 11) return mixRgb(GOLD, [1, 0.95, 0.8], rng.range(0, 0.4));
  }
  // 沿对角线：西南偏蓝，东北偏红(非常轻微)，中间是青色星晶
  const side = (x - z) / 110;
  if (side < -0.45) return mixRgb(CRYSTAL, BLUE_GLOW, rng.range(0.2, 0.7));
  if (side > 0.45) return mixRgb(CRYSTAL_DEEP, RED_GLOW, rng.range(0.3, 0.75));
  return mixRgb(CRYSTAL, CRYSTAL_DEEP, rng.range(0, 0.5));
}

/** 树冠色偏：整体青绿，带一点冷暖变化；红方一侧略偏暖 */
function canopyTint(x: number, z: number, rng: Rng): RGB {
  const side = (x - z) / 110;
  const n = fbm2(x * 0.06, z * 0.06, 2, 77);
  const warm = Math.max(0, side) * 0.25 + (n - 0.5) * 0.3;
  const v = rng.range(0.9, 1.1);
  return [v * (1 + warm * 0.5), v * (1 + warm * 0.08), v * (1 - warm * 0.35)];
}

/** 对局镜头俯角约 52°：高度 h 的东西会挡住它北边 h × cot(52°) 远的地面 */
const OCCLUDE_PER_METER = 0.78;
/** 树模型在缩放 1 时的大致顶高 / 树冠半径 */
const TREE_TOP = 3.6;
const TREE_CANOPY = 1.7;
/** 树冠中心高度(缩放 1) */
const TREE_CROWN_Y = 2.4;
/** 小于这个缩放的树不像树了 */
const MIN_TREE_SCALE = 0.55;
/** 允许树冠压住可走地面边缘的宽度(墙脚本来就有碎石草簇，单位很少贴着走) */
const OCCLUDE_SLACK = 0.9;

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

export interface ScatterResult {
  /** 地面发光点(给贴地光晕用)：x, z, 半径, 颜色 */
  glows: { x: number; z: number; y: number; r: number; color: RGB }[];
}

export function scatterWallTops(batch: SceneryBatcher, lib: PropLibrary, field: MapField, cliffs: CliffInfo[], out: ScatterResult): void {
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
    const big = cliff.inradius > 3.1;
    const step = big ? 2.3 : 1.8;
    const treeSpots: [number, number, number][] = [];
    for (let y = minY; y <= maxY; y += step) {
      for (let x = minX; x <= maxX; x += step) {
        q.x = x + rng.range(-0.5, 0.5) * step;
        q.y = y + rng.range(-0.5, 0.5) * step;
        if (!pointInPolygon(q, poly)) continue;
        const d = -polygonSignedDist(q, poly);
        if (d < 0.75) continue;
        const px = q.x;
        const pz = q.y;
        const ty = cliff.topY(d) - 0.04;
        const roll = rng.next();
        // 树：树干离边至少 1.7m。镜头朝北俯视，树冠会挡住它北边的一条地面(顶高 × cot 俯角)：
        // 先量出正北方向到最近可走地面的距离，按它给树的大小封顶；空间不够长出一棵像样的树就不种，让位给灌木/岩石
        const wantSc = (big ? rng.range(0.92, 1.3) : rng.range(0.62, 0.8)) * Math.min(1.1, 0.7 + d * 0.12);
        const maxSc = d >= (big ? 1.9 : 1.55) ? treeScaleLimit(field, px, pz, ty) : 0;
        if (maxSc >= MIN_TREE_SCALE && roll < (big ? 0.8 : 0.5)) {
          let ok = true;
          for (const t of treeSpots) if (Math.hypot(t[0] - px, t[1] - pz) < t[2] + 1.0) ok = false;
          if (ok) {
            const sc = Math.min(wantSc, maxSc);
            // 偶尔一株花树/金叶树做色彩点缀
            const accent = rng.next();
            if (accent < 0.11) batch.add(lib.accentTrees[accent < 0.06 ? 0 : 1], trs(px, ty, pz, rng.range(0, 6.28), sc, sc * rng.range(0.95, 1.12)), { tint: scaleRgb([1, 1, 1], rng.range(0.92, 1.05)) });
            else batch.add(rng.pick(lib.trees), trs(px, ty, pz, rng.range(0, 6.28), sc, sc * rng.range(0.95, 1.12)), { tint: canopyTint(px, pz, rng) });
            treeSpots.push([px, pz, sc]);
            continue;
          }
        }
        if (roll < 0.86) {
          const kind = rng.next();
          if (kind < 0.34) {
            const sc = rng.range(0.75, 1.25);
            batch.add(rng.pick(lib.shrubs), trs(px, ty, pz, rng.range(0, 6.28), sc), { tint: canopyTint(px, pz, rng) });
          } else if (kind < 0.5) {
            const sc = rng.range(0.45, 0.85);
            batch.add(rng.pick(lib.boulders), trs(px, ty + 0.05, pz, rng.range(0, 6.28), sc, sc * rng.range(0.8, 1.2)), { tint: scaleRgb([1, 1, 1], rng.range(0.9, 1.1)) });
          } else if (kind < 0.63 && d > 0.95) {
            const tint = themeTint(field, px, pz, rng);
            const sc = rng.range(0.75, 1.25);
            const bigC = big && d > 2.2 && rng.chance(0.3);
            batch.add(rng.pick(bigC ? lib.bigCrystals : lib.crystals), trs(px, ty, pz, rng.range(0, 6.28), sc), { tint, glow: rng.range(0.75, 1) });
            out.glows.push({ x: px, z: pz, y: ty + 0.05, r: bigC ? 3.2 : 2.0, color: tint });
          } else if (kind < 0.72) {
            const sc = rng.range(0.9, 1.3);
            batch.add(rng.pick(lib.lanterns), trs(px, ty, pz, rng.range(0, 6.28), sc));
            out.glows.push({ x: px, z: pz, y: ty + 0.05, r: 1.6, color: [1, 0.62, 0.3] });
          } else if (kind < 0.8 && d < 1.7) {
            const tall = rng.chance(0.45);
            batch.add(rng.pick(tall ? lib.tallPillars : lib.pillars), trs(px, ty - 0.05, pz, rng.range(0, 6.28), rng.range(0.9, 1.1), 1, rng.range(-0.05, 0.05), rng.range(-0.05, 0.05)), {
              tint: scaleRgb([1, 0.99, 0.95], rng.range(0.85, 1)),
              glow: 0.9,
            });
          } else if (kind < 0.9) {
            batch.add(rng.pick(lib.flowers), trs(px, ty + 0.02, pz, rng.range(0, 6.28), rng.range(1.2, 1.8)), { tint: flowerTint(rng), shadow: false, maskedTint: true });
          } else {
            batch.add(rng.pick(lib.tufts), trs(px, ty, pz, rng.range(0, 6.28), rng.range(1.2, 1.9)), { shadow: false });
          }
        }
      }
    }
    // 台顶的矮草：给顶面一些细碎的起伏
    for (let y = minY; y <= maxY; y += 0.95) {
      for (let x = minX; x <= maxX; x += 0.95) {
        q.x = x + rng.range(-0.45, 0.45);
        q.y = y + rng.range(-0.45, 0.45);
        if (!pointInPolygon(q, poly)) continue;
        const d = -polygonSignedDist(q, poly);
        if (d < 1.15 || !rng.chance(0.6)) continue;
        batch.add(rng.pick(lib.tufts), trs(q.x, cliff.topY(d) - 0.03, q.y, rng.range(0, 6.28), rng.range(1.1, 1.8)), { shadow: false, tint: [0.9, 1.0, 0.85] });
      }
    }
  });
}

const FLOWER_COLORS: RGB[] = [rgb(0xffffff), rgb(0xffe07a), rgb(0xff9ec4), rgb(0x9fd0ff), rgb(0xd4a8ff), rgb(0xffb070)];

function flowerTint(rng: Rng): RGB {
  return rng.pick(FLOWER_COLORS);
}

export function scatterGround(batch: SceneryBatcher, lib: PropLibrary, field: MapField, density: number, out: ScatterResult): void {
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
      if (!field.clutterOk(px, pz, 0.5)) continue;
      if (field.bushDist(px, pz) < 0.3) continue;
      if (field.campDist(px, pz) < -0.6) continue;
      const solid = field.solidDist(px, pz, 4);
      // 靠墙的地方草更密；开阔处成片出现
      const p = (solid < 1.6 ? 0.62 : 0.2 + Math.max(0, n - 0.45) * 1.6) * density;
      if (r > p) continue;
      const y = field.heightAt(px, pz) - 0.02;
      const kind = rng.next();
      const fl = fbm2(px * 0.07 + 31, pz * 0.07, 2, 23);
      if (kind < 0.16 + Math.max(0, fl - 0.5) * 1.2) {
        batch.add(rng.pick(lib.flowers), trs(px, y, pz, rng.range(0, 6.28), rng.range(1.0, 1.6)), { tint: FLOWER_COLORS[Math.floor(fl * 5.99 + rng.range(0, 1.2)) % FLOWER_COLORS.length], shadow: false, maskedTint: true });
      } else {
        const g = 0.86 + n * 0.3;
        batch.add(rng.pick(lib.tufts), trs(px, y, pz, rng.range(0, 6.28), rng.range(0.9, 1.7)), { shadow: false, tint: [g * 0.95, g, g * 0.85] });
      }
    }
  }

  // ── 墙脚：碎石、蘑菇、灯笼果(紧贴不可走区域，不占路) ──
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
        if (field.laneDist(px, pz) < 0.2 || field.riverDist(px, pz) < 0.3 || field.baseDist(px, pz) < 0.3 || field.padDist(px, pz) < 0.3) continue;
        const y = field.heightAt(px, pz);
        const kind = r2.next();
        if (kind < 0.5) {
          const sc = r2.range(0.16, 0.36) * (off < 0.2 ? 1.25 : 1);
          batch.add(r2.pick(lib.rocks), trs(px, y, pz, r2.range(0, 6.28), sc, sc * r2.range(0.7, 1.1)), { shadow: false, tint: scaleRgb([1, 1, 1], r2.range(0.85, 1.1)) });
        } else if (kind < 0.62) {
          const tint = mixRgb(themeTint(field, px, pz, r2), [1, 1, 1], 0.25);
          batch.add(r2.pick(lib.mushrooms), trs(px, y, pz, r2.range(0, 6.28), r2.range(0.9, 1.5)), { shadow: false, tint, maskedTint: true, glow: 0.8 });
          out.glows.push({ x: px, z: pz, y: y + 0.03, r: 0.9, color: tint });
        } else if (kind < 0.68 && off > 0.15) {
          batch.add(r2.pick(lib.lanterns), trs(px, y, pz, r2.range(0, 6.28), r2.range(0.6, 0.85)), { shadow: false });
          out.glows.push({ x: px, z: pz, y: y + 0.03, r: 1.3, color: [1, 0.62, 0.3] });
        } else if (kind < 0.86) {
          batch.add(r2.pick(lib.tufts), trs(px, y - 0.02, pz, r2.range(0, 6.28), r2.range(1.3, 2.1)), { shadow: false });
        }
      }
    }
  });

  // ── 营地周围的残石环(低矮，不遮挡野怪) ──
  for (const c of map.camps) {
    const r3 = new Rng(4400 + c.id * 7);
    const R = campRadius(c.monsterType);
    const epic = c.monsterType === 'abyss_drake' || c.monsterType === 'star_colossus';
    const count = Math.round(R * 4.2);
    for (let i = 0; i < count; i++) {
      if (r3.chance(0.3)) continue;
      const a = (i / count) * Math.PI * 2 + r3.range(-0.08, 0.08);
      const rr = R + r3.range(-0.1, 0.25);
      const px = c.pos.x + Math.cos(a) * rr;
      const pz = c.pos.y + Math.sin(a) * rr;
      if (field.solidDist(px, pz) < 0.25 || field.laneDist(px, pz) < 0.4) continue;
      const y = field.heightAt(px, pz);
      const sc = r3.range(0.8, 1.3) * (epic ? 1.3 : 1);
      batch.add(r3.pick(lib.ruinStones), trs(px, y - 0.05, pz, -a + Math.PI / 2 + r3.range(-0.25, 0.25), sc, sc * (epic ? 1.5 : 1), r3.range(-0.12, 0.12), r3.range(-0.12, 0.12)), {
        shadow: false,
        tint: epic ? [0.8, 0.86, 1.0] : [1, 1, 1],
      });
    }
  }

  // ── 河道：莲叶与露出水面的星屑碎晶 ──
  const line = field.riverLine;
  const a = line[0];
  const b = line[line.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const dx = (b.x - a.x) / len;
  const dz = (b.y - a.y) / len;
  const r4 = new Rng(1212);
  for (let s = 0; s < len; s += 1.25) {
    const across = r4.range(-1, 1) * (map.riverWidth / 2 - 0.9);
    const px = a.x + dx * s - dz * across;
    const pz = a.y + dz * s + dx * across;
    if (field.boundDist(px, pz) < 0.6) continue;
    if (field.laneDist(px, pz) < 1.2) continue;
    if (field.campDist(px, pz) < 0.5) continue;
    const k = r4.next();
    if (k < 0.3) {
      // 莲叶多靠岸
      if (Math.abs(across) < map.riverWidth / 2 - 2.6 && r4.chance(0.6)) continue;
      const sc = r4.range(0.22, 0.46);
      batch.add(r4.pick(lib.lilyPads), trs(px, WATER_LEVEL + 0.012, pz, r4.range(0, 6.28), sc, 1), { shadow: false, tint: scaleRgb([1, 1, 1], r4.range(0.85, 1.1)) });
      if (r4.chance(0.25)) batch.add(lib.flowers[0], trs(px, WATER_LEVEL - 0.12, pz, r4.range(0, 6.28), 1.1), { shadow: false, tint: rgb(0xffc0dc), maskedTint: true });
    } else if (k < 0.42) {
      const tint = mixRgb(CRYSTAL, [1, 1, 1], r4.range(0.1, 0.5));
      const sc = r4.range(0.2, 0.42);
      batch.add(r4.pick(lib.crystals), trs(px, field.heightAt(px, pz) - 0.02, pz, r4.range(0, 6.28), sc, sc, r4.range(-0.3, 0.3), r4.range(-0.3, 0.3)), { shadow: false, tint, glow: 1 });
      out.glows.push({ x: px, z: pz, y: WATER_LEVEL + 0.02, r: 1.5, color: tint });
    } else if (k < 0.5 && Math.abs(across) > map.riverWidth / 2 - 2.2) {
      const sc = r4.range(0.25, 0.5);
      batch.add(r4.pick(lib.rocks), trs(px, field.heightAt(px, pz) + 0.02, pz, r4.range(0, 6.28), sc, sc * 0.8), { shadow: false, tint: [0.8, 0.88, 0.95] });
    }
  }
}

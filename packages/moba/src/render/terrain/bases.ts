/**
 * 基地与营地的立体装饰：基地外侧城垣上的队伍色旗帜与水晶火盆、泉水背后的巨型队伍水晶、
 * 紧邻基地的山体上的火盆；以及这些发光体对应的地面光晕与环境粒子源。
 * (地台铺装/星纹/泉水法阵是贴地纹样，见 ground.ts 与 decals.ts；塔与水晶本体由单位模型模块负责)
 */
import { PALETTE, Rng } from '../materials';
import type { BorderInfo } from './border';
import type { CliffInfo } from './cliffs';
import { type MapField, campRadius, WATER_LEVEL } from './field';
import { type RGB, type SceneryBatcher, centroid, rgb, scaleRgb } from './geo';
import type { PropLibrary } from './models';
import type { MoteSource } from './motes';
import { type ScatterResult, trs } from './scatter';

interface TeamLook {
  stone: RGB;
  glow: RGB;
  cloth: RGB;
}

const LOOKS: [TeamLook, TeamLook] = [
  { stone: rgb(PALETTE.blue.stone), glow: rgb(PALETTE.blue.glow), cloth: rgb(0x2f6fe0) },
  { stone: rgb(0x6a5a62), glow: rgb(PALETTE.red.glow), cloth: rgb(0xd8352c) },
];

function addBrazier(batch: SceneryBatcher, lib: PropLibrary, look: TeamLook, x: number, y: number, z: number, scale: number, out: ScatterResult, motes: MoteSource[]): void {
  batch.add(lib.brazier, trs(x, y, z, 0.4, scale), { tint: look.stone });
  batch.add(lib.brazierCrystal, trs(x, y, z, 0.9, scale), { tint: look.glow, glow: 1 });
  out.glows.push({ x, z, y: y + 0.06, r: 2.6 * scale, color: look.glow });
  motes.push({ x, y: y + 2.2 * scale, z, radius: 0.5, color: look.glow, count: 4, mode: 1, range: 1.6, size: 0.8 });
}

export function decorateBases(batch: SceneryBatcher, lib: PropLibrary, field: MapField, border: BorderInfo, cliffs: CliffInfo[], out: ScatterResult, motes: MoteSource[]): void {
  const map = field.map;
  const bound = map.bound;

  for (const base of map.bases) {
    const look = LOOKS[base.team];
    const rng = new Rng(600 + base.team);
    // 沿四条边界走一圈，落在基地地台外侧的点位上摆旗帜与火盆
    const sides: { ax: number; az: number; dx: number; dz: number; nx: number; nz: number }[] = [
      { ax: -bound, az: -bound, dx: 0, dz: 1, nx: -1, nz: 0 },
      { ax: -bound, az: bound, dx: 1, dz: 0, nx: 0, nz: 1 },
      { ax: bound, az: bound, dx: 0, dz: -1, nx: 1, nz: 0 },
      { ax: bound, az: -bound, dx: -1, dz: 0, nx: 0, nz: -1 },
    ];
    for (const s of sides) {
      let k = 0;
      for (let d = 2.2; d < bound * 2 - 1; d += 4.4) {
        const px = s.ax + s.dx * d;
        const pz = s.az + s.dz * d;
        if (field.baseDist(px - s.nx * 0.6, pz - s.nz * 0.6) > -0.5) continue;
        // 只装饰属于本方基地的那一段
        const own = base.team === 0 ? px - pz < 0 : px - pz > 0;
        if (!own) continue;
        const sw = border.southWeight(px, pz);
        k++;
        if (sw > 0.55) {
          // 南侧矮石沿：只放小号火盆，不挡视线
          if (k % 2 === 0) addBrazier(batch, lib, look, px + s.nx * 0.3, 0.38, pz + s.nz * 0.3, 0.5, out, motes);
          continue;
        }
        const t = 1.6;
        const x = px + s.nx * t;
        const z = pz + s.nz * t;
        const y = border.heightAt(x, z) - 0.05;
        if (k % 2 === 0) addBrazier(batch, lib, look, x, y, z, 1.0, out, motes);
        else batch.add(lib.banner, trs(x, y, z, rng.range(-0.12, 0.12), 1.05, rng.range(1.0, 1.2)), { tint: look.cloth, maskedTint: true });
      }
    }
    // 泉水背后的地图角：一簇巨型队伍水晶，远远就能认出己方/敌方基地
    const cx = Math.sign(base.fountain.x) * (bound + 3.4);
    const cz = Math.sign(base.fountain.y) * (bound + 3.4);
    const sw = border.southWeight(cx, cz);
    const y = border.heightAt(cx, cz) - 0.3;
    const sc = sw > 0.5 ? 1.5 : 2.3;
    batch.add(lib.bigCrystals[base.team % lib.bigCrystals.length], trs(cx, y, cz, 0.7, sc), { tint: look.glow, glow: 1 });
    out.glows.push({ x: cx, z: cz, y: y + 0.4, r: 7, color: look.glow });
    motes.push({ x: cx, y: y + 1, z: cz, radius: 2.4, color: look.glow, count: 14, mode: 1, range: 5, size: 1.1 });
    // 泉水上升的光点
    motes.push({ x: base.fountain.x, y: 0.1, z: base.fountain.y, radius: base.fountainRadius * 0.82, color: look.glow, count: 46, mode: 1, range: 3.4, size: 1.0 });
    motes.push({ x: base.core.x, y: 0.2, z: base.core.y, radius: 5.5, color: look.glow, count: 18, mode: 1, range: 2.6, size: 0.8 });
  }

  // 紧邻基地的山体：在朝向基地的拐角顶上立火盆
  cliffs.forEach((cliff, i) => {
    const c = centroid(cliff.poly);
    const team = c.x - c.y < 0 ? 0 : 1;
    const look = LOOKS[team];
    const rng = new Rng(900 + i);
    for (const v of cliff.poly) {
      if (field.baseDist(v.x, v.y, 12) > 6.5) continue;
      const dx = c.x - v.x;
      const dz = c.y - v.y;
      const l = Math.hypot(dx, dz) || 1;
      const inset = 1.55;
      const x = v.x + (dx / l) * inset;
      const z = v.y + (dz / l) * inset;
      addBrazier(batch, lib, look, x, cliff.topY(0.9) - 0.05, z, rng.range(0.85, 1.0), out, motes);
    }
  });

  // 营地的环境粒子
  for (const c of map.camps) {
    const R = campRadius(c.monsterType);
    const col: RGB =
      c.monsterType === 'frost_golem' ? rgb(0x9fe0ff)
      : c.monsterType === 'ember_golem' ? rgb(0xff8a3c)
      : c.monsterType === 'abyss_drake' ? rgb(0xb48cff)
      : c.monsterType === 'star_colossus' ? rgb(0xffd880)
      : c.monsterType === 'glimwing' ? rgb(0x8ff0e0)
      : rgb(0xc8e890);
    const epic = c.monsterType === 'abyss_drake' || c.monsterType === 'star_colossus';
    const buff = c.monsterType === 'frost_golem' || c.monsterType === 'ember_golem';
    motes.push({ x: c.pos.x, y: epic ? WATER_LEVEL + 0.05 : 0.1, z: c.pos.y, radius: R * 0.95, color: scaleRgb(col, 1.1), count: epic ? 34 : buff ? 18 : 7, mode: 1, range: epic ? 3.2 : 2.2, size: epic ? 1.0 : 0.8 });
  }
}

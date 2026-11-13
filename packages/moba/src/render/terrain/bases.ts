/**
 * 基地与高地的立体装饰(地面高度不能动，「高地感」靠门与边界构件给出)：
 *   城垣   基地外侧的界外高崖(北/西/东)顶上一排垛口、每 6 米一道扶壁、内壁上的队徽浮雕；队伍色旗帜与水晶火盆；
 *          南侧矮石沿保持低矮，只放小号火盆，不挡视线；
 *   门阙   紧邻基地的山体转角处的高方柱(蓝方白石 + 蓝晶 + 金箍，红方玄武岩 + 绯晶 + 余烬金)，柱侧挂队旗；
 *   泉水   池沿一圈矮石环(≤ 0.12 米，可走)、池边四座矮灯台(≤ 0.4 米)、一道极淡的队伍色光柱；背后的界外高处立两座守望像；
 *   角晶   泉水背后的地图角上一簇巨型队伍水晶，远远就能认出己方/敌方基地。
 * (地台铺装/门槛线在 ground.ts；泉水池面与塔座/水晶座在 decals.ts；塔与水晶本体由单位模型模块负责)
 */
import { Rng } from '../materials';
import { type ArchitectureKit, TEAM_LOOKS, type TeamLook, createArchitectureKit } from './architecture';
import type { AtmosSpec } from './atmos';
import { BASE_WALL_H, BASE_WALL_SETBACK, type BorderInfo } from './border';
import type { CliffInfo } from './cliffs';
import type { MapField } from './field';
import { type RGB, type SceneryBatcher, centroid, mixRgb, scaleRgb } from './geo';
import type { PropLibrary } from './models';
import type { MoteSource } from './motes';
import type { PropKit } from './props';
import { type GlowGrid, type ScatterResult, faceDir, trs } from './scatter';

function addBrazier(batch: SceneryBatcher, lib: PropLibrary, look: TeamLook, x: number, y: number, z: number, scale: number, out: ScatterResult, motes: MoteSource[]): void {
  batch.add(lib.brazier, trs(x, y, z, 0.4, scale), { tint: look.stone });
  batch.add(lib.brazierCrystal, trs(x, y, z, 0.9, scale), { tint: look.crystalTint, glow: look.crystalGlow });
  out.glows.push({ x, z, y: y + 0.06, r: 2.6 * scale, color: look.glow });
  motes.push({ x, y: y + 2.2 * scale, z, radius: 0.5, color: look.glow, count: 3, mode: 1, range: 1.6, size: 0.8 });
}

/** 泉水池沿：一圈贴地的矮石环(外半径 = 泉水半径，高 0.1 米)，按面给法线，直接写进分块网格 */
function addFountainRim(batch: SceneryBatcher, cx: number, cz: number, radius: number, look: TeamLook, bound: number): void {
  const b = batch.at(cx, cz, false);
  const segs = 40;
  const r0 = radius * 0.875;
  const r1 = radius * 0.985;
  const h = 0.1;
  const top = mixRgb(look.stone, [1, 1, 1], 0.06);
  const side = look.stoneDark;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    // 界外是城垣：越界的那一段不砌
    if (Math.max(Math.abs(cx + Math.cos(am) * r1), Math.abs(cz + Math.sin(am) * r1)) > bound - 0.05) continue;
    const tone = 0.92 + ((i * 7) % 5) * 0.03;
    const t = scaleRgb(top, tone);
    const gap = 0.012;
    const v = (r: number, c: number, s: number, y: number, col: RGB, nx: number, ny: number, nz: number): number => b.vertex(cx + c * r, y, cz + s * r, col, nx, ny, nz);
    // 顶面(每块之间留一道细缝)
    const ca = Math.cos(a0 + gap);
    const sa = Math.sin(a0 + gap);
    const cb = Math.cos(a1 - gap);
    const sb = Math.sin(a1 - gap);
    b.quad(v(r0 + 0.02, ca, sa, h, t, 0, 1, 0), v(r0 + 0.02, cb, sb, h, t, 0, 1, 0), v(r1 - 0.02, cb, sb, h, t, 0, 1, 0), v(r1 - 0.02, ca, sa, h, t, 0, 1, 0));
    // 外侧面与内侧面
    const cm = Math.cos(am);
    const sm = Math.sin(am);
    b.quad(v(r1, c0, s0, -0.02, side, cm, 0.3, sm), v(r1 - 0.02, c0, s0, h, t, cm, 0.3, sm), v(r1 - 0.02, c1, s1, h, t, cm, 0.3, sm), v(r1, c1, s1, -0.02, side, cm, 0.3, sm));
    b.quad(v(r0, c1, s1, -0.02, side, -cm, 0.3, -sm), v(r0 + 0.02, c1, s1, h, t, -cm, 0.3, -sm), v(r0 + 0.02, c0, s0, h, t, -cm, 0.3, -sm), v(r0, c0, s0, -0.02, side, -cm, 0.3, -sm));
  }
}

export function decorateBases(
  batch: SceneryBatcher,
  lib: PropLibrary,
  kit: PropKit,
  field: MapField,
  border: BorderInfo,
  cliffs: CliffInfo[],
  out: ScatterResult,
  glow: GlowGrid,
  motes: MoteSource[],
  atmos: AtmosSpec[],
): void {
  const map = field.map;
  const bound = map.bound;
  const arch: [ArchitectureKit, ArchitectureKit] = [createArchitectureKit(0), createArchitectureKit(1)];

  for (const base of map.bases) {
    const look = TEAM_LOOKS[base.team];
    const ak = arch[base.team];
    const rng = new Rng(600 + base.team);
    // 沿四条边界走一圈，落在基地地台外侧的那几段就是城垣
    const sides: { ax: number; az: number; dx: number; dz: number; nx: number; nz: number }[] = [
      { ax: -bound, az: -bound, dx: 0, dz: 1, nx: -1, nz: 0 },
      { ax: -bound, az: bound, dx: 1, dz: 0, nx: 0, nz: 1 },
      { ax: bound, az: bound, dx: 0, dz: -1, nx: 1, nz: 0 },
      { ax: bound, az: -bound, dx: -1, dz: 0, nx: 0, nz: -1 },
    ];
    for (const s of sides) {
      const own = (px: number, pz: number): boolean => field.baseDist(px - s.nx * 0.6, pz - s.nz * 0.6) < -0.5 && (base.team === 0 ? px - pz < 0 : px - pz > 0);
      const wallRot = faceDir(-s.nx, -s.nz);
      // ── 垛口：沿城垣顶每 1.45 米一块(南侧矮石沿不砌) ──
      for (let d = 0.9; d < bound * 2 - 0.5; d += 1.45) {
        const px = s.ax + s.dx * d;
        const pz = s.az + s.dz * d;
        if (!own(px, pz) || border.southWeight(px, pz) > 0.3) continue;
        const t = BASE_WALL_SETBACK + 0.42;
        batch.add(ak.merlon, trs(px + s.nx * t, BASE_WALL_H - 0.04, pz + s.nz * t, wallRot + Math.PI / 2, 1, rng.range(0.92, 1.08)), { tint: scaleRgb([1, 1, 1], rng.range(0.92, 1.04)) });
      }
      // ── 扶壁(每 6 米)与两道扶壁之间的队徽浮雕；旗帜与火盆立在墙顶 ──
      let k = 0;
      for (let d = 2.2; d < bound * 2 - 1; d += 3) {
        const px = s.ax + s.dx * d;
        const pz = s.az + s.dz * d;
        if (!own(px, pz)) continue;
        const sw = border.southWeight(px, pz);
        k++;
        if (sw > 0.55) {
          // 南侧矮石沿：只放小号火盆，不挡视线
          if (k % 3 === 0) addBrazier(batch, lib, look, px + s.nx * 0.3, 0.38, pz + s.nz * 0.3, 0.5, out, motes);
          continue;
        }
        if (sw > 0.3) continue;
        const wx = px + s.nx * BASE_WALL_SETBACK;
        const wz = pz + s.nz * BASE_WALL_SETBACK;
        if (k % 2 === 0) {
          batch.add(ak.buttress, trs(wx, 0.1, wz, wallRot, 1, (BASE_WALL_H - 0.25) / 2.4), {});
        } else if (k % 4 === 1) {
          batch.add(ak.emblem, trs(wx - s.nx * 0.02, BASE_WALL_H * 0.56, wz - s.nz * 0.02, wallRot, 1), { glow: 1 });
        }
        const tx = px + s.nx * 1.9;
        const tz = pz + s.nz * 1.9;
        const ty = border.heightAt(tx, tz) - 0.05;
        if (k % 4 === 2) addBrazier(batch, lib, look, tx, ty, tz, 1.0, out, motes);
        else if (k % 4 === 0) batch.add(lib.banner, trs(tx, ty, tz, wallRot + Math.PI / 2 + rng.range(-0.12, 0.12), 1.05, rng.range(1.0, 1.2)), { tint: look.cloth, maskedTint: true });
      }
    }

    // ── 泉水：池沿石环、四座矮灯台、极淡的队伍色光柱；背后界外立两座守望像 ──
    const fx = base.fountain.x;
    const fz = base.fountain.y;
    const fr = base.fountainRadius;
    addFountainRim(batch, fx, fz, fr, look, bound);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      const lx = fx + Math.cos(a) * fr * 0.93;
      const lz = fz + Math.sin(a) * fr * 0.93;
      if (Math.max(Math.abs(lx), Math.abs(lz)) > bound - 0.3) continue;
      batch.add(ak.lowLamp, trs(lx, 0.08, lz, a, 1), { shadow: false, glow: 1 });
    }
    atmos.push({ kind: 'pillar', x: fx, y: 0.05, z: fz, width: 2.6, length: 6, color: look.glow, alpha: 0.08 });
    glow.reserve(fx, fz);
    const sgnX = Math.sign(fx);
    const sgnZ = Math.sign(fz);
    for (const off of [-1, 1]) {
      // 两座守望像：分立在泉水背后的角晶两侧(界外高处，面朝泉水)
      const sx = sgnX * (bound + 2.1) - (off < 0 ? sgnX * 5.2 : 0);
      const sz = sgnZ * (bound + 2.1) - (off > 0 ? sgnZ * 5.2 : 0);
      if (border.southWeight(sx, sz) > 0.3) continue;
      const sy = border.heightAt(sx, sz) - 0.05;
      batch.add(kit.watcher, trs(sx, sy, sz, faceDir(fx - sx, fz - sz), 1.25), { tint: mixRgb(look.stone, [1, 1, 1], 0.3) });
    }
    // 泉水背后的地图角：一簇巨型队伍水晶
    const cx = sgnX * (bound + 3.4);
    const cz = sgnZ * (bound + 3.4);
    const sw = border.southWeight(cx, cz);
    const y = border.heightAt(cx, cz) - 0.3;
    const sc = sw > 0.5 ? 1.5 : 2.3;
    batch.add(lib.bigCrystals[base.team % lib.bigCrystals.length], trs(cx, y, cz, 0.7, sc), { tint: look.crystalTint, glow: look.crystalGlow });
    out.glows.push({ x: cx, z: cz, y: y + 0.4, r: 7, color: look.glow });
    motes.push({ x: cx, y: y + 1, z: cz, radius: 2.4, color: look.glow, count: 12, mode: 1, range: 5, size: 1.1 });
    // 泉水上升的光点、水晶周围的微粒
    motes.push({ x: fx, y: 0.1, z: fz, radius: fr * 0.82, color: look.glow, count: 40, mode: 1, range: 3.4, size: 1.0 });
    motes.push({ x: base.core.x, y: 0.2, z: base.core.y, radius: 5.5, color: look.glow, count: 16, mode: 1, range: 2.6, size: 0.8 });
  }

  // ── 门阙：紧邻基地的山体，在朝向基地的拐角里立高方柱(和岩体长在一起，落在不可走区)，柱侧挂队旗 ──
  cliffs.forEach((cliff, i) => {
    const c = centroid(cliff.poly);
    const team = c.x - c.y < 0 ? 0 : 1;
    const look = TEAM_LOOKS[team];
    const ak = arch[team];
    const rng = new Rng(900 + i);
    for (const v of cliff.poly) {
      if (field.baseDist(v.x, v.y, 12) > 6.5) continue;
      const dx = c.x - v.x;
      const dz = c.y - v.y;
      const l = Math.hypot(dx, dz) || 1;
      const inset = 1.55;
      const x = v.x + (dx / l) * inset;
      const z = v.y + (dz / l) * inset;
      // 柱高 3.6~4.4 米：比崖顶高出一米多
      const h = cliff.height + rng.range(1.0, 1.5);
      const sy = h / 3.6;
      const rot = rng.range(-0.1, 0.1) + Math.PI / 4;
      batch.add(ak.gatePillar, trs(x, 0, z, rot, 1.0, sy), { tint: scaleRgb([1, 1, 1], rng.range(0.94, 1.03)), glow: 1 });
      // (晶体原型悬在 4 米高处：缩放 0.9 后平移到柱顶上方 0.35 米)
      batch.add(ak.gateCrystal, trs(x, h + 0.35 - 3.6, z, rot, 0.9), { glow: 1 });
      // 队旗：插在柱顶朝外(朝基地)的一角
      batch.add(kit.flag, trs(x - (dx / l) * 0.5, h - 1.9, z - (dz / l) * 0.5, rng.range(-0.3, 0.3), 1.05), { tint: look.cloth, maskedTint: true });
      glow.reserve(x, z);
      out.glows.push({ x, z, y: cliff.topY(1.2) + 0.05, r: 2.4, color: look.glow });
      out.aoBlobs.push({ x, y: cliff.topY(1.2) + 0.06, z, r: 1.4, strength: 0.4 });
      motes.push({ x, y: h + 0.6, z, radius: 0.5, color: look.glow, count: 3, mode: 1, range: 1.6, size: 0.8 });
    }
  });
  arch[0].dispose();
  arch[1].dispose();
}

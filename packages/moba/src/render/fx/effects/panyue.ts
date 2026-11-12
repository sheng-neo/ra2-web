/**
 * 樊哙 · 琥珀金：盾形冲击弧、盾影、夯土尘浪、震裂的地面。
 * 形状语言只有「盾」与「土」：不出现岩刺、晶簇、光壳和光柱。
 */
import { HEROES } from '../../../core/data/heroes';
import { FX_RULES, P, R, boulders, clods, dustPuff, dustRing, hitBurst, ring, shieldPlate, slashArc, sparks } from '../common';
import { DECAL } from '../decals';
import type { FxKit } from '../kit';
import { C, TAU, THEME } from '../util';
import { type FxHandler, castRange, castWidth, fixedValue, involvesPlayer } from './types';

const T = THEME.panyue;
const S1 = HEROES.panyue.skills.s1;
const ULT = HEROES.panyue.skills.ult;

/** 施放者当前的朝向(拿不到就用 fallback) */
function facingOf(k: FxKit, id: number | undefined, fallback = 0): number {
  return k.anchor(id) && k.a.unit ? k.a.unit.facing : fallback;
}

/**
 * 一圈向外倒伏的冲击弧：count 道月牙立在半径 dist 处、弧顶朝外并向外掀起，像被盾震起来的一圈气浪。
 * 斩弧网格本身是水平的：绕 z 抬头(pitch)就成了外沿翘起的一片。
 */
function shockArcs(k: FxKit, x: number, z: number, count: number, dist: number, radius: number, life: number, a0: number, push = 4, delay = 0): void {
  for (let i = 0; i < count; i++) {
    const a = a0 + (i * TAU) / count;
    const cx = Math.cos(a);
    const sz = Math.sin(a);
    const m = slashArc(k, x + cx * (dist - radius * 0.7), 0.25, z + sz * (dist - radius * 0.7), a, radius, life, i % 2 === 0 ? T.hot : T.glow, 2, 0, false, 0.9);
    m.rot(0, -a, 0.5).vel(cx * push, 0.6, sz * push).scale(radius * 0.7, radius * 1.15).fade(0.05, 0.35);
    m.k = 0.62;
    if (delay > 0) m.delay(delay);
  }
}

/** 第三击·覆盾震地 @target：盾沿砸在目标脚下 —— 小盾印 + 贴地的铜光弧 + 短尘环 + 铜铁火星 */
const passiveHit: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  let dx = 1;
  let dz = 0;
  if (k.anchor(e.unitId)) {
    const l = Math.hypot(x - k.a.x, z - k.a.z) || 1;
    dx = (x - k.a.x) / l;
    dz = (z - k.a.z) / l;
  }
  const facing = Math.atan2(dz, dx);
  k.decals.add(DECAL.cracks, x, z, 1.5, 1.1).params(0, 0.2).color(T.glow, 1.5).under(C.shadow, 0.8);
  // 盾下缘砸出的印子：盾顶朝攻击方向
  k.decals.add(DECAL.shieldMark, x - dx * 0.25, z - dz * 0.25, 1.15, 0.7).rot(facing, 0.72).params(0.6, 0.3).color(T.hot, 1.8).under(C.shadow, 0.6);
  // 贴地扫出去的一道铜光弧
  const arc = slashArc(k, x - dx * 1.15, 0.18, z - dz * 1.15, facing, 1.9, 0.2, T.hot, 2.3, 0, false);
  arc.scale(1.3, 2.1).k = 0.55;
  ring(k, x, z, 1.9, 0.28, T.glow, 1.4, 0.3, 0.25);
  hitBurst(k, x, 0.5, z, 1.3, T.hot, T.deep, dx, dz, 6, FX_RULES.flashSkill, 8);
  sparks(k, x, 0.3, z, 5, 6, C.bronze, T.deep, dx, dz, 0.4, 0.3, 0.11);
  dustRing(k, x, z, 5, 0.4, 3, C.dust, C.dustDark, 0.9, 0.5);
  clods(k, x, z, 4, 3.5, 5, 0.3, 0.22);
  k.shake(involvesPlayer(e, env) ? FX_RULES.shakeSkill : 0.06, x, z);
  k.light(x, z, 1, T.glow, 4, 5, 0.25);
};

/** 侧盾闯帐·起步 @pos, dir：蹬地的尘土 + 沿途尘迹与琥珀光尾 + 顶在身前、偏转一个角度的盾影 */
const s1Dash: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const dx = e.dir?.x ?? 1;
  const dz = e.dir?.y ?? 0;
  const facing = Math.atan2(dz, dx);
  const range = castRange(S1);
  const dur = range / fixedValue(S1, 'dashSpeed');
  const r = k.rnd;
  // 向后蹬出的尘土
  const p = k.particles.use(P.dust);
  const n = k.n(7);
  for (let i = 0; i < n; i++) {
    const s = r.range(3, 7);
    p.spawn(x + r.signed() * 0.5, r.range(0.1, 0.6), z + r.signed() * 0.5, -dx * s + r.signed() * 1.5, r.range(0.5, 2), -dz * s + r.signed() * 1.5, r.range(0.5, 0.9), 0.7, 1.6);
  }
  clods(k, x, z, 4, 3.5, 4.5, 0.4, 0.24);
  k.decals
    .add(DECAL.streak, x + dx * range * 0.5, z + dz * range * 0.5, range * 0.5, 0.55)
    .rot(facing, (castWidth(S1) * 0.5) / (range * 0.5))
    .params(0.5, 1 / (dur / 0.55))
    .color(T.glow, 1.2, 0.8)
    .under(T.dark, 0.4);
  const id = e.unitId ?? -1;
  if (!k.anchor(id)) return;
  k.trail(id, R.dust, dur + 0.05, 0.5);
  k.trail(id, R.energy, dur + 0.05, 1.2, T.hot, T.deep);
  // 「侧其盾以撞」：盾影顶在身前，偏转约 25°，略向后仰
  const plate = shieldPlate(k, dx * 0.95, 0.05, dz * 0.95, facing, 2.5, dur + 0.1, T.hot, 1.9, 0.95, 0.2, 0.44, 0.1).follow(id);
  plate.fade(0.12, 0.75);
  let acc = 0;
  k.track(id, dur, (a, _t, dt) => {
    acc += dt;
    while (acc > 0.04) {
      acc -= 0.04;
      k.particles.use(P.dust).spawn(a.x + r.signed() * 0.5, 0.25, a.z + r.signed() * 0.5, -dx * 2 + r.signed(), r.range(0.4, 1.4), -dz * 2 + r.signed(), r.range(0.4, 0.7), 0.7, 1.5);
      // 盾沿两侧被劈开的气流
      const side = r.chance(0.5) ? 1 : -1;
      k.particles
        .use(P.streak)
        .tint(T.hot, T.glow)
        .spawn(a.x + dx * 0.9 - dz * side * 0.7, r.range(0.4, 2), a.z + dz * 0.9 + dx * side * 0.7, -dx * 9 - dz * side * 2, r.signed() * 0.5, -dz * 9 + dx * side * 2, 0.16, 0.1, 0.03);
    }
  });
};

/** 侧盾闯帐·震击 @pos, radius：冲击环(精确半径) + 身前一面撞实的盾影 + 四道向外倒伏的冲击弧 + 尘浪与碎土 */
const s1Impact: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? fixedValue(S1, 'impactRadius');
  const r = k.rnd;
  const facing = facingOf(k, e.unitId, r.next() * TAU);
  const dx = Math.cos(facing);
  const dz = Math.sin(facing);
  hitBurst(k, x + dx * 0.9, 1.0, z + dz * 0.9, 2.2, T.hot, T.deep, dx, dz, 8, FX_RULES.flashSkill, 10);
  // 撞实的一瞬：盾影放大后迅速隐去
  shieldPlate(k, x + dx * 1.0, 0.05, z + dz * 1.0, facing, 2.9, 0.26, T.hot, 2.3, 1, 0.3, 0, 0.06).vel(dx * 2.5, 0, dz * 2.5).fade(0.04, 0.3);
  ring(k, x, z, R0, 0.4, T.glow, 1.9, 0.15, 0.4);
  k.decals.add(DECAL.cracks, x, z, R0 * 0.95, 1.4).params(0, 0.25).color(T.glow, 1.7).under(C.shadow, 0.85);
  shockArcs(k, x, z, 4, R0 * 0.72, 1.25, 0.3, facing + Math.PI / 4, 5);
  dustRing(k, x, z, 10, R0 * 0.5, 5, C.dust, C.dustDark, 1.4, 0.85);
  clods(k, x, z, 10, 5.5, 7.5, R0 * 0.4);
  sparks(k, x + dx * 0.9, 0.8, z + dz * 0.9, 6, 8, C.bronze, T.deep, dx, dz, 0.5, 0.3, 0.12);
  k.light(x, z, 1.5, T.glow, FX_RULES.lightMax, 8, 0.35);
  k.shake(involvesPlayer(e, env) ? FX_RULES.shakeSkill : 0.07, x, z);
};

/** 拥盾怒目 @unit, radius：五面铜金盾影围身一闪即隐 + 双层震慑环(一声喝) + 头顶几道向上的短气浪 */
const s2Cast: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? 4.5;
  const r = k.rnd;
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  const head = has ? k.a.height : 2.4;
  const facing = facingOf(k, id, 0);
  for (let i = 0; i < 5; i++) {
    const a = facing + (i * TAU) / 5;
    const m = shieldPlate(k, (has ? 0 : x) + Math.cos(a) * 1.3, 0.05, (has ? 0 : z) + Math.sin(a) * 1.3, a, 2.3, 0.5, i === 0 ? T.hot : T.accent, 1.8, 0.9, 0.18).delay(i * 0.015);
    m.vel(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
    if (has) m.follow(id);
  }
  // 震慑环：粗的一道精确到减速半径，细的一道紧随其后
  ring(k, x, z, R0, 0.48, T.glow, 1.8, 0.25, 0.4);
  ring(k, x, z, R0, 0.52, T.hot, 1.0, 0.1, 0.2, 0.12);
  // 怒喝：头顶向上的短气浪线
  const p = k.particles.use(P.streak).tint(C.white, T.hot);
  const n = k.n(6);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const d = r.range(0.15, 0.55);
    p.spawn(x + Math.cos(a) * d, head * 0.92 + r.range(0, 0.3), z + Math.sin(a) * d, Math.cos(a) * 1.6, r.range(6, 10), Math.sin(a) * 1.6, r.range(0.18, 0.26), 0.13, 0.04, r.next() * 0.06);
  }
  k.particles.use(P.hitFlash).tint(C.white, T.hot).spawn(x, head * 0.6, z, 0, 0, 0, FX_RULES.flashSkill, 1.2, 2);
  dustRing(k, x, z, 10, 1.2, 4.2, C.dust, C.dustDark, 1.2, 0.75);
  clods(k, x, z, 5, 4, 5.5, 1.1, 0.24);
  k.light(x, z, 1.6, T.glow, 6, 8, 0.35);
  k.shake(involvesPlayer(e, env) ? FX_RULES.shakeSkill : 0.06, x, z);
};

/** 死且不避·起跳 from → to：蹬裂地面、尘环、几块碎土，身后一道琥珀光尾 */
const ultLeap: FxHandler = (k, e, env) => {
  const from = e.from ?? e.pos;
  const x = from.x;
  const z = from.y;
  const id = e.unitId ?? -1;
  const leap = fixedValue(ULT, 'leapTime');
  k.particles.use(P.hitFlash).tint(C.white, T.hot).spawn(x, 0.5, z, 0, 0, 0, FX_RULES.flashSkill, 1.2, 1.9);
  ring(k, x, z, 2.5, 0.36, T.glow, 1.5, 0.15, 0.35);
  k.decals.add(DECAL.cracks, x, z, 2.0, 1.1).params(0, 0.15).color(T.glow, 1.5).under(C.shadow, 0.85);
  dustRing(k, x, z, 11, 0.5, 5.2, C.dust, C.dustDark, 1.4, 0.85);
  clods(k, x, z, 6, 4.5, 8, 0.5);
  boulders(k, x, z, 2, 3.5, 6.5, 0.28);
  if (k.anchor(id)) {
    k.trail(id, R.energy, leap, 1.3, T.hot, T.deep);
    k.trail(id, R.dust, leap * 0.55, 0.4);
  }
  k.shake(e.unitId === env.playerId ? 0.15 : 0.08, x, z);
};

/**
 * 死且不避·落地 @pos, radius：白闪 → 一枚砸进地面的大盾印 + 三道由内向外的同心冲击弧(最外一道精确到伤害半径)
 * → 厚尘浪与碎土块。裂纹贴花留到减速区结束，是之后「震裂地面」的底图。
 */
const ultLand: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? 4.5;
  const r = k.rnd;
  const facing = facingOf(k, e.unitId, r.next() * TAU);
  k.particles.use(P.hitFlash).tint(T.hot, T.glow).spawn(x, 0.8, z, 0, 0, 0, FX_RULES.flashBig, R0 * 0.4, R0 * 0.7);
  k.particles.use(P.burst).tint(T.hot).spawn(x, 0.8, z, 0, 0, 0, 0.18, R0 * 0.5, R0 * 1.1);
  // 大盾印：连人带盾砸出来的印子，盾顶朝跃击方向
  k.decals.add(DECAL.shieldMark, x, z, R0 * 0.6, 1.9).rot(facing, 0.72).params(1, 0.55).color(T.hot, 2).under(C.shadow, 0.85);
  // 三道同心冲击弧
  ring(k, x, z, R0 * 0.5, 0.34, T.hot, 1.7, 0.15, 0.3);
  ring(k, x, z, R0 * 0.78, 0.42, T.glow, 1.8, 0.2, 0.35, 0.06);
  ring(k, x, z, R0, 0.5, T.glow, 2.1, 0.3, 0.45, 0.12);
  shockArcs(k, x, z, 6, R0 * 0.55, 1.7, 0.34, r.next() * TAU, 7);
  shockArcs(k, x, z, 6, R0 * 0.9, 1.5, 0.3, r.next() * TAU, 5, 0.1);
  k.decals.add(DECAL.cracks, x, z, R0 * 1.04, fixedValue(ULT, 'zoneDur') + 0.4).params(0, 0.3).color(T.glow, 1.8).under(C.shadow, 0.9);
  boulders(k, x, z, 4, 7, 9.5, 0.42);
  clods(k, x, z, 22, 8.5, 11, R0 * 0.5, 0.34);
  dustRing(k, x, z, 16, R0 * 0.55, 6.5, C.dust, C.dustDark, 2.1, 1.2);
  dustPuff(k, x, 0.5, z, 6, R0 * 0.35, 2, C.dust, C.dustDark, 1.0);
  sparks(k, x, 0.5, z, 8, 9, C.bronze, T.deep, 0, 0, 0, 0.4, 0.14);
  k.light(x, z, 2.2, T.glow, FX_RULES.lightMax, 14, 0.35);
  k.shake(involvesPlayer(e, env) ? 0.45 : 0.3, x, z);
};

export const PANYUE = {
  panyue_passive_hit: passiveHit,
  panyue_s1_dash: s1Dash,
  panyue_s1_impact: s1Impact,
  panyue_s2_cast: s2Cast,
  panyue_ult_leap: ultLeap,
  panyue_ult_land: ultLand,
} satisfies Record<string, FxHandler>;

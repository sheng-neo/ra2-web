/**
 * 磐岳 · 岩石 / 琥珀金：地裂、破土的岩刺、翻滚的尘浪、琥珀色的晶光。
 */
import { HEROES } from '../../../core/data/heroes';
import { P, R, boulders, debris, dustPuff, dustRing, embers, flash, hoop, orb, pillar, ring, rockSpike, scorch, shards, shockShell, sparks } from '../common';
import { DECAL } from '../decals';
import { MODE, SHAPE } from '../glow';
import { C, TAU, THEME } from '../util';
import { type FxHandler, castRange, castWidth, fixedValue, involvesPlayer } from './types';

const T = THEME.panyue;
const S1 = HEROES.panyue.skills.s1;
const ULT = HEROES.panyue.skills.ult;

/** 第三击震地 @target */
const passiveHit: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const r = k.rnd;
  k.decals.add(DECAL.cracks, x, z, 2.0, 1.3).params(0, 0.3).color(T.glow, 1.8).under(C.shadow, 0.85);
  ring(k, x, z, 2.1, 0.32, T.glow, 1.6, 0.2);
  const a0 = r.next() * TAU;
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i * TAU) / 3 + r.signed() * 0.3;
    rockSpike(k, x + Math.cos(a) * 0.95, z + Math.sin(a) * 0.95, 0.55, r.range(0.9, 1.3), 0.7, a, 0.4);
  }
  flash(k, x, 0.5, z, 1.5, T.hot, 0.18, true);
  dustRing(k, x, z, 6, 0.4, 3.4, C.dust, C.dustDark, 1.0, 0.6);
  debris(k, x, z, 6, 4, 6);
  sparks(k, x, 0.4, z, 6, 6, T.hot, T.deep);
  k.shake(involvesPlayer(e, env) ? 0.18 : 0.08, x, z);
  k.light(x, z, 1, T.glow, 4, 5, 0.25);
};

/** 冲撞起步 @pos, dir：蹬地的尘土 + 沿途尘迹与琥珀光尾 */
const s1Dash: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const dx = e.dir?.x ?? 1;
  const dz = e.dir?.y ?? 0;
  const facing = Math.atan2(dz, dx);
  const range = castRange(S1);
  const dur = range / fixedValue(S1, 'dashSpeed');
  const r = k.rnd;
  // 向后喷的尘土
  const p = k.particles.use(P.dust);
  const n = k.n(8);
  for (let i = 0; i < n; i++) {
    const s = r.range(3, 7);
    p.spawn(x + r.signed() * 0.5, r.range(0.1, 0.6), z + r.signed() * 0.5, -dx * s + r.signed() * 1.5, r.range(0.5, 2), -dz * s + r.signed() * 1.5, r.range(0.5, 0.9), 0.7, 1.7);
  }
  debris(k, x, z, 6, 4, 5, 0.4);
  ring(k, x, z, 1.6, 0.3, T.glow, 1.3, 0.2, 0.25);
  k.decals
    .add(DECAL.streak, x + dx * range * 0.5, z + dz * range * 0.5, range * 0.5, 0.6)
    .rot(facing, (castWidth(S1) * 0.5) / (range * 0.5))
    .params(0.5, 1 / (dur / 0.6))
    .color(T.glow, 1.5)
    .under(T.dark, 0.5);
  const id = e.unitId ?? -1;
  if (!k.anchor(id)) return;
  k.trail(id, R.dust, dur + 0.05, 0.5);
  k.trail(id, R.energy, dur + 0.05, 1.3, T.hot, T.deep);
  // 顶在身前的琥珀冲击罩
  k.glow.spawn(SHAPE.sphere, MODE.rim, dur + 0.08).follow(id).at(dx * 0.6, 1.2, dz * 0.6).scale(1.3, 1.6).color(T.glow, 1.7, 0.8).fade(0.15, 0.7).opt(0.35, 2.4, 1);
  let acc = 0;
  k.track(id, dur, (a, _t, dt) => {
    acc += dt;
    while (acc > 0.035) {
      acc -= 0.035;
      k.particles.use(P.dust).spawn(a.x + r.signed() * 0.5, 0.25, a.z + r.signed() * 0.5, -dx * 2 + r.signed(), r.range(0.4, 1.4), -dz * 2 + r.signed(), r.range(0.4, 0.7), 0.7, 1.5);
      k.particles.use(P.spark).tint(T.hot, T.deep).spawn(a.x + r.signed() * 0.4, 0.2, a.z + r.signed() * 0.4, -dx * 3 + r.signed() * 3, r.range(2, 5), -dz * 3 + r.signed() * 3, 0.3, 0.12, 0.05);
    }
  });
};

/** 冲撞终点震击 @pos, radius */
const s1Impact: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? fixedValue(S1, 'impactRadius');
  const r = k.rnd;
  flash(k, x, 0.7, z, R0 * 1.7, T.hot, 0.24, true);
  shockShell(k, x, 0.4, z, 0.5, R0, 0.3, T.glow, 1.8);
  ring(k, x, z, R0, 0.42, T.glow, 2, 0.15, 0.4);
  k.decals.add(DECAL.cracks, x, z, R0 * 1.05, 1.7).params(0, 0.3).color(T.glow, 1.9).under(C.shadow, 0.9);
  const a0 = r.next() * TAU;
  for (let i = 0; i < 7; i++) {
    const a = a0 + (i * TAU) / 7 + r.signed() * 0.2;
    const d = R0 * r.range(0.5, 0.72);
    rockSpike(k, x + Math.cos(a) * d, z + Math.sin(a) * d, r.range(0.55, 0.8), r.range(1.2, 1.9), 0.85, a, 0.45, C.white, r.next() * 0.05);
  }
  dustRing(k, x, z, 10, R0 * 0.5, 5, C.dust, C.dustDark, 1.5, 0.9);
  debris(k, x, z, 12, 6, 8, R0 * 0.4);
  shards(k, x, 0.5, z, 8, 5, 6, T.hot, T.glow);
  sparks(k, x, 0.4, z, 8, 8, T.hot, T.deep);
  k.light(x, z, 1.5, T.glow, 8, 9, 0.4);
  k.shake(involvesPlayer(e, env) ? 0.35 : 0.2, x, z);
};

/** 壁垒升起 @unit, radius：贴身一圈岩板拔地而起 + 震慑环扩到减速半径 */
const s2Cast: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? 4.5;
  const r = k.rnd;
  const id = e.unitId ?? -1;
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6 + 0.3;
    rockSpike(k, x + Math.cos(a) * 1.35, z + Math.sin(a) * 1.35, 0.95, r.range(1.7, 2.3), 1.0, a, -0.1, C.white, i * 0.02);
  }
  ring(k, x, z, R0, 0.5, T.glow, 1.9, 0.25, 0.4);
  ring(k, x, z, R0, 0.55, T.hot, 1.1, 0.1, 0.2, 0.12);
  k.decals.add(DECAL.cracks, x, z, 2.4, 1.3).params(0, 0.2).color(T.glow, 1.6).under(C.shadow, 0.8);
  const h = hoop(k, 0, 0.3, 0, 1.6, 1.3, 2.6, 0.6, T.glow, 1.8, 0.85);
  if (k.anchor(id)) h.follow(id);
  else h.at(x, 0.3, z);
  flash(k, x, 1, z, 2.2, T.hot, 0.22);
  dustRing(k, x, z, 12, 1.3, 4.2, C.dust, C.dustDark, 1.3, 0.8);
  debris(k, x, z, 8, 4.5, 7, 1.2);
  sparks(k, x, 0.6, z, 8, 6, T.hot, T.deep);
  k.light(x, z, 1.6, T.glow, 6, 8, 0.4);
  k.shake(involvesPlayer(e, env) ? 0.25 : 0.12, x, z);
};

/** 起跳 from → to */
const ultLeap: FxHandler = (k, e, env) => {
  const from = e.from ?? e.pos;
  const x = from.x;
  const z = from.y;
  const id = e.unitId ?? -1;
  const leap = fixedValue(ULT, 'leapTime');
  flash(k, x, 0.6, z, 2, T.hot, 0.2);
  ring(k, x, z, 2.8, 0.4, T.glow, 1.6, 0.15, 0.35);
  k.decals.add(DECAL.cracks, x, z, 2.2, 1.2).params(0, 0.2).color(T.glow, 1.6).under(C.shadow, 0.85);
  dustRing(k, x, z, 12, 0.5, 5.5, C.dust, C.dustDark, 1.5, 0.9);
  debris(k, x, z, 10, 5, 9, 0.5);
  boulders(k, x, z, 3, 4, 7, 0.32);
  pillar(k, x, z, 0.9, 4, 0.35, T.glow, 1.6, 0.7);
  if (k.anchor(id)) {
    k.trail(id, R.energy, leap, 1.3, T.hot, T.deep);
    k.trail(id, R.dust, leap * 0.6, 0.4);
    k.glow.spawn(SHAPE.sphere, MODE.rim, leap + 0.05).follow(id).at(0, 1.2, 0).scale(1.5, 1.9).color(T.glow, 1.6, 0.75).fade(0.2, 0.75).opt(0.35, 2.2, 1);
  }
  k.shake(e.unitId === env.playerId ? 0.2 : 0.1, x, z);
};

/** 落地山崩 @pos, radius：闪光 → 冲击环(精确到伤害半径) + 三圈岩刺由内向外破土 → 尘浪与余烬 */
const ultLand: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? 4.5;
  const r = k.rnd;
  flash(k, x, 0.9, z, R0 * 1.5, T.hot, 0.22, true);
  orb(k, x, 0.8, z, 0.5, R0 * 0.45, 0.26, T.hot, 2);
  shockShell(k, x, 0.4, z, 1, R0 * 1.12, 0.45, T.glow, 1.9);
  pillar(k, x, z, R0 * 0.45, 6.5, 0.5, T.glow, 1.7, 0.8);
  ring(k, x, z, R0, 0.5, T.glow, 2.2, 0.1, 0.45);
  ring(k, x, z, R0 * 1.35, 0.6, T.hot, 1.1, 0.2, 0.2, 0.1);
  k.decals.add(DECAL.cracks, x, z, R0 * 1.06, fixedValue(ULT, 'zoneDur') + 0.4).params(0, 0.35).color(T.glow, 2).under(C.shadow, 0.95);
  scorch(k, x, z, R0 * 0.9, 4.2, T.deep);
  const rings: [number, number, number, number, number][] = [
    [5, 0.3, 2.7, 0.9, 0],
    [8, 0.6, 2.0, 0.8, 0.05],
    [11, 0.88, 1.4, 0.65, 0.1],
  ];
  for (const [count, rr, height, width, delay] of rings) {
    const a0 = r.next() * TAU;
    for (let i = 0; i < count; i++) {
      const a = a0 + (i * TAU) / count + r.signed() * 0.15;
      const d = R0 * rr * r.range(0.9, 1.08);
      rockSpike(k, x + Math.cos(a) * d, z + Math.sin(a) * d, width * r.range(0.8, 1.2), height * r.range(0.8, 1.2), 1.15, a, r.range(0.25, 0.5), C.white, delay + r.next() * 0.04);
    }
  }
  boulders(k, x, z, 8, 7.5, 10, 0.5);
  debris(k, x, z, 26, 9, 12, R0 * 0.5, C.rock, C.dustDark, 0.36);
  dustRing(k, x, z, 18, R0 * 0.6, 7, C.dust, C.dustDark, 2.2, 1.3);
  dustPuff(k, x, 0.5, z, 8, R0 * 0.4, 2.2, C.dust, C.dustDark, 1.2);
  shards(k, x, 0.8, z, 14, 8, 9, T.hot, T.glow, 0.3);
  sparks(k, x, 0.5, z, 12, 10, T.hot, T.deep, 0, 0, 0, 0.5, 0.16);
  embers(k, x, 0.3, z, 16, R0 * 0.8, 1.2, T.hot, T.deep, 1.8, 0.16);
  k.light(x, z, 2.5, T.glow, 14, 16, 0.7);
  k.shake(involvesPlayer(e, env) ? 0.6 : 0.4, x, z);
};

export const PANYUE = {
  panyue_passive_hit: passiveHit,
  panyue_s1_dash: s1Dash,
  panyue_s1_impact: s1Impact,
  panyue_s2_cast: s2Cast,
  panyue_ult_leap: ultLeap,
  panyue_ult_land: ultLand,
} satisfies Record<string, FxHandler>;

/**
 * 星璃 · 星辉 / 青蓝：星印、星环、流星与星屑。
 */
import { P, R, dustPuff, flash, glints, hoop, orb, pillar, ring, scorch, shards, shockShell } from '../common';
import { DECAL } from '../decals';
import { MODE, SHAPE } from '../glow';
import { C, TAU, THEME } from '../util';
import { type FxHandler, involvesPlayer, unitY } from './types';

const T = THEME.xingli;

/** 三层印记引爆 @target */
const passiveBurst: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.targetId, 0.55, 1.1);
  const r = k.rnd;
  k.decals.add(DECAL.star, x, z, 2.0, 0.6).params(6, 2.4).rot(r.next() * TAU).color(T.glow, 2).under(T.dark, 0.5);
  ring(k, x, z, 2.3, 0.4, T.hot, 1.5, 0.15, 0.25);
  flash(k, x, y, z, 2.4, T.hot, 0.24, true);
  shockShell(k, x, y, z, 0.4, 1.7, 0.28, T.glow, 1.8);
  pillar(k, x, z, 0.5, 4.8, 0.42, T.glow, 1.8, 0.8);
  const p = k.particles.use(P.star).tint(T.accent, T.hot);
  const n = k.n(8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r.signed() * 0.3;
    const s = r.range(3.5, 6);
    p.spawn(x, y, z, Math.cos(a) * s, r.range(1, 4), Math.sin(a) * s, r.range(0.5, 0.8), 0.42, 0.16);
  }
  glints(k, x, y, z, 8, 4.5, C.white, T.glow, 0.6, 0.34);
  k.light(x, z, y, T.glow, 6, 7, 0.35);
  k.shake(involvesPlayer(e, env) ? 0.2 : 0.08, x, z);
};

/** 流星矢出手 @pos, dir */
const s1Cast: FxHandler = (k, e) => {
  const dx = e.dir?.x ?? 1;
  const dz = e.dir?.y ?? 0;
  const facing = Math.atan2(dz, dx);
  const x = e.pos.x + dx * 0.9;
  const z = e.pos.y + dz * 0.9;
  const y = 1.5;
  const r = k.rnd;
  flash(k, x, y, z, 1.8, T.hot, 0.2, true);
  // 垂直于弹道的星环，向前推出
  k.glow.spawn(SHAPE.hoop, MODE.hoop, 0.3).at(x, y, z).vel(dx * 6, 0, dz * 6).rot(0, -facing, -Math.PI / 2).scale(0.3, 1.4).color(T.glow, 2, 0.9).fade(0.1, 0.4);
  k.glow.spawn(SHAPE.hoop, MODE.hoop, 0.26).at(x, y, z).vel(dx * 11, 0, dz * 11).rot(0, -facing, -Math.PI / 2).scale(0.2, 0.9).color(T.hot, 2, 0.9).fade(0.1, 0.4).delay(0.04);
  const p = k.particles.use(P.glint).tint(C.white, T.glow);
  const n = k.n(8);
  for (let i = 0; i < n; i++) {
    const s = r.range(5, 12);
    p.spawn(x, y, z, dx * s + r.signed() * 2, r.signed() * 1.6, dz * s + r.signed() * 2, r.range(0.3, 0.5), 0.34, 0.1);
  }
  k.decals.add(DECAL.streak, x + dx * 1.6, z + dz * 1.6, 2, 0.32).rot(facing, 0.22).params(0, 6).color(T.glow, 1.5).under(C.black, 0);
};

/** 引力星环收束爆发 @pos, radius */
const s2Burst: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? 3.4;
  const r = k.rnd;
  // 星环向心收束 → 中心爆开 → 余波回荡到伤害半径
  k.decals.add(DECAL.ring, x, z, R0, 0.3).params(1, 0.08).color(T.glow, 2.2).under(T.dark, 0.4);
  k.decals.add(DECAL.star, x, z, R0 * 0.78, 0.55).params(5, 2.2).rot(r.next() * TAU).color(T.hot, 1.8).under(T.dark, 0.4).delay(0.06);
  const p = k.particles.use(P.glint).tint(C.white, T.glow);
  const n = k.n(16);
  for (let i = 0; i < n; i++) p.orbit(x, r.range(0.2, 1.4), z, R0 * r.range(0.7, 1), 0.15, r.next() * TAU, r.range(5, 8), r.range(0, 1.5), r.range(0.2, 0.3), 0.36, 0.14);
  k.after(0.1, () => {
    flash(k, x, 0.9, z, R0 * 1.25, T.hot, 0.26, true);
    orb(k, x, 0.9, z, 0.3, R0 * 0.5, 0.26, T.hot, 2.4);
    pillar(k, x, z, 0.8, 7.5, 0.45, T.glow, 1.9, 0.85);
    shockShell(k, x, 0.6, z, 0.5, R0 * 0.85, 0.28, T.glow, 1.7);
    ring(k, x, z, R0, 0.42, T.glow, 1.6, 0.1, 0.25);
    shards(k, x, 0.8, z, 8, 6, 6, T.hot, T.glow, 0.24);
    glints(k, x, 1, z, 8, 5, C.white, T.accent, 0.6, 0.32);
    k.light(x, z, 1.8, T.glow, 8, R0 * 2.4, 0.4);
    k.shake(involvesPlayer(e, env) ? 0.3 : 0.15, x, z);
  });
};

/** 大招吟唱 @unit：脚下星图展开，星光沿光柱升向天空 */
const ultCast: FxHandler = (k, e) => {
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  const x = has ? k.a.x : e.pos.x;
  const z = has ? k.a.z : e.pos.y;
  const r = k.rnd;
  const rune = k.decals.add(DECAL.rune, x, z, 2.5, 1.2).params(8, 2).color(T.glow, 1.9).under(T.dark, 0.4);
  const pl = pillar(k, has ? 0 : x, has ? 0 : z, 0.38, 15, 0.75, T.hot, 2.2, 0.9);
  if (has) {
    rune.follow(id);
    pl.follow(id);
  }
  for (let i = 0; i < 2; i++) {
    const h = hoop(k, has ? 0 : x, 0.3, has ? 0 : z, 1.3 - i * 0.3, 0.6, 5, 0.6, T.glow, 2, 0.9).delay(i * 0.12);
    if (has) h.follow(id);
  }
  const p = k.particles.use(P.glint).tint(C.white, T.glow);
  const n = k.n(14);
  for (let i = 0; i < n; i++) p.orbit(x, r.range(0.1, 0.6), z, r.range(1, 2), 0.3, r.next() * TAU, r.range(4, 7), r.range(3, 7), r.range(0.5, 0.8), 0.36, 0.12, r.range(0, 0.25));
  flash(k, x, 2.7, z, 2.2, T.hot, 0.3, true);
  k.light(x, z, 2.4, T.glow, 6, 8, 0.6);
};

/** 单颗陨星落地 @pos, radius：斜向的流星尾迹砸进地面，爆出星屑并留下星痕 */
const meteor: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? 1.7;
  const r = k.rnd;
  // 流星从东北上空斜坠
  const ox = 2.6 + r.signed() * 0.6;
  const oz = -1.9 + r.signed() * 0.6;
  k.ribbons.trace(R.energy, x + ox, 10.5, z + oz, x, 0.3, z, 0.075, T.hot, T.deep);
  k.glow.spawn(SHAPE.diamond, MODE.core, 0.11).at(x + ox, 10.5, z + oz).vel(-ox / 0.085, -10.2 / 0.085, -oz / 0.085).rot(0, -Math.atan2(-oz, -ox), -1.3).scale3(1.8, 0.7, 0.7).color(T.hot, 2.6, 1).fade(0.1, 0.8).opt(1, 0.8, 0);
  k.after(0.075, () => {
    flash(k, x, 0.5, z, R0 * 2, T.hot, 0.24, true);
    orb(k, x, 0.5, z, 0.3, R0 * 0.7, 0.24, T.hot, 2.4);
    shockShell(k, x, 0.3, z, 0.3, R0, 0.28, T.glow, 1.8);
    ring(k, x, z, R0, 0.4, T.glow, 1.9, 0.15, 0.35);
    k.decals.add(DECAL.star, x, z, R0 * 0.85, 0.45).params(4, 2.2).rot(r.next() * TAU).color(T.hot, 1.8).under(T.dark, 0.3);
    scorch(k, x, z, R0 * 0.85, 2.4, T.glow, T.dark, 0.7);
    pillar(k, x, z, 0.4, 3.8, 0.3, T.glow, 1.8, 0.8);
    shards(k, x, 0.4, z, 7, 6.5, 6, T.hot, T.glow, 0.22);
    glints(k, x, 0.6, z, 7, 4.5, C.white, T.accent, 0.6, 0.32);
    dustPuff(k, x, 0.2, z, 2, 0.4, 1.3, T.deep, T.dark, 0.6);
    k.light(x, z, 1.2, T.glow, 6, 7, 0.3);
    k.shake(0.13, x, z);
  });
};

export const XINGLI = {
  xingli_passive_burst: passiveBurst,
  xingli_s1_cast: s1Cast,
  xingli_s2_burst: s2Burst,
  xingli_ult_cast: ultCast,
  xingli_meteor: meteor,
} satisfies Record<string, FxHandler>;

/**
 * 夜阙 · 暗影 / 紫：斩痕、影烟、残影与处决的十字斩。
 */
import { HEROES } from '../../../core/data/heroes';
import { P, R, flash, glints, pillar, ring, scorch, shards, shockShell, slashArc, sparks } from '../common';
import { DECAL } from '../decals';
import { MODE, SHAPE } from '../glow';
import type { FxKit } from '../kit';
import { C, TAU, THEME } from '../util';
import { type FxHandler, involvesPlayer, unitY } from './types';

const T = THEME.yeque;
const S1 = HEROES.yeque.skills.s1;
const S2 = HEROES.yeque.skills.s2;

function wisps(k: FxKit, x: number, y: number, z: number, count: number, spread: number, size = 1): void {
  const p = k.particles.use(P.wisp);
  const r = k.rnd;
  const n = k.n(count);
  for (let i = 0; i < n; i++) p.spawn(x + r.signed() * spread, y + r.next() * 0.8, z + r.signed() * spread, r.signed() * 0.8, r.range(0.8, 2.4), r.signed() * 0.8, r.range(0.5, 0.9), size * r.range(0.6, 0.9), size * r.range(1.2, 1.7), r.next() * 0.08);
}

/** 瞬影斩 from → to：一道瞬间贯穿的斩线 + 沿途的横切 */
const s1Dash: FxHandler = (k, e, env) => {
  const from = e.from ?? e.pos;
  const to = e.to ?? e.pos;
  let dx = to.x - from.x;
  let dz = to.y - from.y;
  const dist = Math.hypot(dx, dz) || 0.01;
  dx /= dist;
  dz /= dist;
  const facing = Math.atan2(dz, dx);
  const dur = dist / (S1.values.dashSpeed as number);
  const r = k.rnd;
  k.ribbons.trace(R.shadow, from.x, 1.0, from.y, to.x, 1.0, to.y, dur, T.glow, T.dark);
  k.ribbons.trace(R.thin, from.x, 1.1, from.y, to.x, 1.1, to.y, dur, T.hot, T.glow);
  k.decals
    .add(DECAL.streak, (from.x + to.x) / 2, (from.y + to.y) / 2, dist / 2 + 0.5, 0.55)
    .rot(facing, (S1.cast.width * 0.4) / (dist / 2 + 0.5))
    .params(0.25, 0.55 / dur)
    .color(T.glow, 2)
    .under(T.dark, 0.65);
  for (const f of [0.38, 0.72]) {
    const px = from.x + dx * dist * f;
    const pz = from.y + dz * dist * f;
    slashArc(k, px - dx * 0.6, 1.1, pz - dz * 0.6, facing + (f < 0.5 ? 0.5 : -0.5), 1.6, 0.26, T.hot, 2.4, f < 0.5 ? 0.9 : -0.9).delay(f * dur);
  }
  wisps(k, from.x, 0.3, from.y, 6, 0.4);
  flash(k, from.x, 1, from.y, 1.4, T.glow, 0.18);
  const p = k.particles.use(P.streak).tint(T.hot, T.glow);
  const n = k.n(8);
  for (let i = 0; i < n; i++) {
    const f = r.next();
    p.spawn(from.x + dx * dist * f, r.range(0.6, 1.5), from.y + dz * dist * f, dx * 4 + r.signed() * 2, r.signed() * 2, dz * 4 + r.signed() * 2, 0.25, 0.14, 0.05, f * dur);
  }
  k.after(dur, () => {
    flash(k, to.x, 1, to.y, 1.5, T.glow, 0.18);
    wisps(k, to.x, 0.3, to.y, 4, 0.3);
  });
  if (e.unitId === env.playerId) k.shake(0.1, from.x, from.y);
};

/** 掷出飞刃 @pos, dir：三道扇形散开的紫色刃光 */
const s2Cast: FxHandler = (k, e) => {
  const dx = e.dir?.x ?? 1;
  const dz = e.dir?.y ?? 0;
  const facing = Math.atan2(dz, dx);
  const x = e.pos.x + dx * 0.7;
  const z = e.pos.y + dz * 0.7;
  const y = 1.2;
  const spread = S2.values.spread as number;
  for (let i = -1; i <= 1; i++) {
    const a = facing + i * spread;
    slashArc(k, x, y, z, a, 1.2, 0.2, i === 0 ? T.hot : T.glow, 2.2, Math.PI * 0.5, false, 0.9).vel(Math.cos(a) * 9, 0, Math.sin(a) * 9);
  }
  flash(k, x, y, z, 1.4, T.glow, 0.16);
  sparks(k, x, y, z, 6, 9, T.hot, T.glow, dx, dz, 0.8, 0.3, 0.12);
  wisps(k, e.pos.x, 0.5, e.pos.y, 3, 0.3, 0.8);
};

/** 隐没 @pos：身形坍缩成一柱暗影，原地留下影池 */
const ultVanish: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const r = k.rnd;
  k.glow.spawn(SHAPE.cone, MODE.vortex, 0.55).at(x, 0.05, z).scale3(1.1, 2.4, 1.1, 0.25, 3.6, 0.25).color(T.deep, 1.3, 0.95).fade(0.05, 0.4).opt(0.3, 5, 1).spin(0, 12, 0);
  pillar(k, x, z, 0.5, 3.4, 0.35, T.glow, 1.7, 0.8);
  k.decals.add(DECAL.ring, x, z, 2.3, 0.3).params(1, 0.1).color(T.glow, 1.9).under(T.dark, 0.5);
  // 影池：比隐没本身留得久一点，标出「他刚才在这里」
  k.decals.add(DECAL.glow, x, z, 1.9, 1.1).params(1.1).color(T.deep, 0.5).under(T.dark, 0.85);
  k.decals.add(DECAL.swirl, x, z, 1.7, 0.7).params(3, -2.2).color(T.glow, 1.5).under(T.dark, 0.5);
  wisps(k, x, 0.3, z, 10, 0.5, 1.1);
  const p = k.particles.use(P.glint).tint(T.hot, T.glow);
  const n = k.n(8);
  for (let i = 0; i < n; i++) p.orbit(x, r.range(0.4, 1.8), z, r.range(1, 1.6), 0.1, r.next() * TAU, -r.range(6, 10), r.range(-0.5, 1), 0.3, 0.3, 0.1);
  flash(k, x, 1.1, z, 1.6, T.glow, 0.16);
};

/** 背后处决 @target, from → to：贯穿的影线 → 目标身上的十字斩 + 暗紫光柱 → 残烟 */
const ultStrike: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const from = e.from ?? e.pos;
  const to = e.to ?? e.pos;
  const y = unitY(k, e.targetId, 0.5, 1.1);
  let dx = x - to.x;
  let dz = z - to.y;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl;
  dz /= dl;
  const facing = Math.atan2(dz, dx);
  k.ribbons.trace(R.shadow, from.x, 1, from.y, to.x, 1, to.y, 0.05, T.glow, T.dark);
  k.ribbons.trace(R.thin, from.x, 1.1, from.y, to.x, 1.1, to.y, 0.05, T.hot, T.glow);
  wisps(k, to.x, 0.3, to.y, 5, 0.4);
  // 十字斩：两道大幅侧倾的斩弧在目标身上交叉
  slashArc(k, x - dx * 1.5, y, z - dz * 1.5, facing, 2.6, 0.34, T.hot, 2.7, 1.0);
  slashArc(k, x - dx * 1.5, y, z - dz * 1.5, facing, 2.4, 0.34, T.glow, 2.5, -1.0).delay(0.06);
  const c = k.particles.use(P.crescent).tint(T.hot, T.glow);
  c.spawn(x, y, z, 0, 0, 0, 0.26, 1.6, 3.4);
  c.spawn(x, y, z, 0, 0, 0, 0.3, 1.2, 2.8, 0.06);
  flash(k, x, y, z, 3, T.hot, 0.26, true);
  shockShell(k, x, y, z, 0.4, 2.2, 0.3, T.glow, 1.9);
  pillar(k, x, z, 0.7, 6.5, 0.4, T.glow, 1.9, 0.85);
  pillar(k, x, z, 0.28, 8, 0.3, T.hot, 2.3, 0.9);
  ring(k, x, z, 2.5, 0.42, T.glow, 1.9, 0.12, 0.5);
  for (const rot of [0.6, -0.6]) k.decals.add(DECAL.streak, x, z, 2.6, 0.5).rot(facing + rot, 0.14).params(0, 0).color(T.hot, 1.9).under(T.dark, 0.6);
  scorch(k, x, z, 1.7, 3, T.glow, T.dark);
  shards(k, x, y, z, 12, 8, 6, T.hot, T.glow, 0.26);
  sparks(k, x, y, z, 12, 11, T.hot, T.deep, dx, dz, 0.5, 0.4, 0.15);
  wisps(k, x, 0.4, z, 8, 0.7, 1.1);
  glints(k, x, y, z, 6, 4, C.white, T.accent, 0.5, 0.3);
  k.light(x, z, y, T.glow, 9, 9, 0.4);
  k.shake(involvesPlayer(e, env) ? 0.5 : 0.25, x, z);
};

export const YEQUE = {
  yeque_s1_dash: s1Dash,
  yeque_s2_cast: s2Cast,
  yeque_ult_vanish: ultVanish,
  yeque_ult_strike: ultStrike,
} satisfies Record<string, FxHandler>;

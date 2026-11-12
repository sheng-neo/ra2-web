/**
 * 赤烬 · 烈焰 / 橙红：刀气、火舌、余烬与焦痕。
 */
import { HEROES } from '../../../core/data/heroes';
import { P, R, SLASH_SPAN, embers, flash, pillar, ring, scorch, slashArc, sparks } from '../common';
import { DECAL } from '../decals';
import { MODE, SHAPE } from '../glow';
import type { FxKit } from '../kit';
import { C, TAU, THEME } from '../util';
import { type FxHandler, castRange, castWidth, fixedValue, involvesPlayer, unitY } from './types';

const T = THEME.chijin;
const S2 = HEROES.chijin.skills.s2;
const ULT = HEROES.chijin.skills.ult;

function flames(k: FxKit, x: number, y: number, z: number, count: number, spread: number, size: number, vx = 0, vz = 0, delay = 0): void {
  const p = k.particles.use(P.flame);
  const r = k.rnd;
  const n = k.n(count);
  for (let i = 0; i < n; i++) {
    p.spawn(x + r.signed() * spread, y + r.next() * 0.3, z + r.signed() * spread, vx + r.signed() * 0.8, r.range(1.5, 3.5), vz + r.signed() * 0.8, r.range(0.35, 0.6), size * r.range(0.7, 1.2), size * 0.5, delay + r.next() * 0.06);
  }
}

/** 余烬强化普攻 @target：两道交叉的火焰斩 */
const passiveHit: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.targetId, 0.5, 1);
  let facing = 0;
  if (k.anchor(e.unitId)) facing = Math.atan2(z - k.a.z, x - k.a.x);
  slashArc(k, x - Math.cos(facing) * 0.9, y, z - Math.sin(facing) * 0.9, facing, 1.7, 0.24, T.glow, 2.4, 0.7);
  slashArc(k, x - Math.cos(facing) * 0.9, y, z - Math.sin(facing) * 0.9, facing, 1.5, 0.24, T.hot, 2.2, -0.7).delay(0.05);
  flash(k, x, y, z, 1.7, T.accent, 0.2, true);
  flames(k, x, y - 0.3, z, 5, 0.3, 0.7);
  embers(k, x, y, z, 8, 0.3, 2.2, T.hot, T.glow, 0.8);
  sparks(k, x, y, z, 6, 8, T.hot, T.deep);
  ring(k, x, z, 1.4, 0.3, T.glow, 1.4, 0.2, 0.3);
  if (involvesPlayer(e, env)) k.shake(0.1, x, z);
};

/** 扇形烈焰斩 @pos, dir, radius, angle：地面扇形与刀弧都按技能的角度与半径画 */
const s1Slash: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const dx = e.dir?.x ?? 1;
  const dz = e.dir?.y ?? 0;
  const facing = Math.atan2(dz, dx);
  const R0 = e.radius ?? 5.5;
  const angle = e.angle ?? 1.92;
  const half = angle / 2;
  const r = k.rnd;
  k.decals.add(DECAL.cone, x, z, R0, 0.75).rot(facing).params(half, 0).color(T.glow, 2).under(T.dark, 0.6);
  // 两道由内向外推出去的刀弧(外亮内白)，沿弧扫过
  const k0 = angle / SLASH_SPAN;
  const a1 = slashArc(k, x, 1.0, z, facing, R0, 0.36, T.glow, 2.5, 0.1);
  a1.scale(R0 * 0.5, R0).k = k0;
  const a2 = slashArc(k, x, 1.25, z, facing, R0 * 0.8, 0.3, T.hot, 2.3, -0.08).delay(0.04);
  a2.scale(R0 * 0.35, R0 * 0.8).k = k0;
  // 火舌沿弧线依次腾起
  const n = k.n(16);
  for (let i = 0; i < n; i++) {
    const t = (i + r.next()) / n;
    const a = facing + (t - 0.5) * angle;
    const d = R0 * r.range(0.55, 0.96);
    flames(k, x + Math.cos(a) * d, 0.2, z + Math.sin(a) * d, 1, 0.15, r.range(0.7, 1.1), Math.cos(a) * 2.5, Math.sin(a) * 2.5, 0.05 + t * 0.12);
  }
  const p = k.particles.use(P.ember);
  const m = k.n(12);
  for (let i = 0; i < m; i++) {
    const a = facing + r.signed() * half;
    const s = r.range(4, 9);
    p.spawn(x + Math.cos(a) * R0 * 0.4, r.range(0.5, 1.4), z + Math.sin(a) * R0 * 0.4, Math.cos(a) * s, r.range(0.5, 2.5), Math.sin(a) * s, r.range(0.5, 0.9), 0.16, 0.05);
  }
  flash(k, x + dx * 1.2, 1.1, z + dz * 1.2, 2, T.accent, 0.18);
  k.light(x + dx * R0 * 0.5, z + dz * R0 * 0.5, 1.5, T.glow, 7, R0 * 1.6, 0.35);
  k.shake(involvesPlayer(e, env) ? 0.25 : 0.12, x, z);
};

/** 炎步 from → to：火焰尾迹 + 沿途的火影 */
const s2Dash: FxHandler = (k, e, env) => {
  const from = e.from ?? e.pos;
  const to = e.to ?? e.pos;
  let dx = to.x - from.x;
  let dz = to.y - from.y;
  const dist = Math.hypot(dx, dz) || 0.01;
  dx /= dist;
  dz /= dist;
  const facing = Math.atan2(dz, dx);
  const dur = dist / fixedValue(S2, 'dashSpeed');
  const id = e.unitId ?? -1;
  const r = k.rnd;
  flash(k, from.x, 1, from.y, 1.8, T.accent, 0.2);
  embers(k, from.x, 0.5, from.y, 8, 0.4, 2, T.hot, T.glow, 0.8);
  k.decals
    .add(DECAL.streak, (from.x + to.x) / 2, (from.y + to.y) / 2, dist / 2 + 0.4, 0.75)
    .rot(facing, (castWidth(S2) * 0.45) / (dist / 2 + 0.4))
    .params(0.7, 0.75 / dur)
    .color(T.glow, 1.9)
    .under(T.dark, 0.55);
  if (k.anchor(id)) {
    k.trail(id, R.fire, dur + 0.06, 1.0);
    k.trail(id, R.thin, dur + 0.06, 1.5, T.hot, T.glow);
  }
  // 三道火影：途经处腾起的火柱
  for (let i = 1; i <= 3; i++) {
    const f = i / 4;
    const px = from.x + dx * dist * f;
    const pz = from.y + dz * dist * f;
    k.glow
      .spawn(SHAPE.cone, MODE.vortex, 0.5)
      .at(px, 0.05, pz)
      .scale3(0.45, 1.5, 0.45, 0.75, 2.5, 0.75)
      .color(T.glow, 2.1, 0.9)
      .fade(0.1, 0.3)
      .opt(0.8, 3, 1)
      .delay(f * dur);
    flames(k, px, 0.2, pz, 3, 0.35, 0.8, dx * 1.5, dz * 1.5, f * dur);
  }
  const p = k.particles.use(P.ember);
  const n = k.n(10);
  for (let i = 0; i < n; i++) {
    const f = r.next();
    p.spawn(from.x + dx * dist * f + r.signed() * 0.4, r.range(0.3, 1.3), from.y + dz * dist * f + r.signed() * 0.4, r.signed() * 1.5, r.range(1, 3), r.signed() * 1.5, r.range(0.5, 0.9), 0.15, 0.05, f * dur);
  }
  k.after(dur, () => {
    flash(k, to.x, 1, to.y, 1.6, T.accent, 0.18);
    sparks(k, to.x, 0.8, to.y, 6, 7, T.hot, T.deep, dx, dz, 0.5);
  });
  if (e.unitId === env.playerId) k.shake(0.1, from.x, from.y);
};

/** 旋舞起手 @unit */
const ultStart: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = castRange(ULT);
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  ring(k, x, z, R0, 0.45, T.glow, 2, 0.1, 0.4);
  scorch(k, x, z, 2.2, 3.6, T.glow, T.dark);
  const v = k.glow
    .spawn(SHAPE.cone, MODE.vortex, 0.65)
    .at(has ? 0 : x, 0.05, has ? 0 : z)
    .scale3(1.1, 0.6, 1.1, 2.3, 3.8, 2.3)
    .color(T.glow, 2.2, 0.95)
    .fade(0.1, 0.35)
    .opt(0.8, 4, 1)
    .spin(0, -9, 0);
  const pl = pillar(k, has ? 0 : x, has ? 0 : z, 1.2, 5.5, 0.5, T.accent, 1.8, 0.8);
  if (has) {
    v.follow(id);
    pl.follow(id);
  }
  flash(k, x, 1.2, z, 3, T.accent, 0.24, true);
  flames(k, x, 0.2, z, 10, 1.1, 1.0);
  embers(k, x, 0.5, z, 16, 1.2, 3, T.hot, T.glow, 1.0);
  sparks(k, x, 1, z, 10, 9, T.hot, T.deep);
  k.light(x, z, 1.8, T.glow, 9, 10, 0.5);
  k.shake(involvesPlayer(e, env) ? 0.3 : 0.15, x, z);
};

/** 每跳火环 @pos, radius：火环扩到伤害半径 + 两道对称旋转的火刃 */
const ultTick: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? 4.2;
  const r = k.rnd;
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  const rp = k.decals.add(DECAL.ring, x, z, R0, 0.34).params(0.3, 1).color(T.glow, 1.6).under(T.dark, 0.3);
  if (has) rp.follow(id);
  const a0 = r.next() * TAU;
  for (let i = 0; i < 2; i++) {
    const m = slashArc(k, has ? 0 : x, 0.9 + i * 0.5, has ? 0 : z, a0 + i * Math.PI, R0 * 0.96, 0.32, i === 0 ? T.glow : T.accent, 2.3, i === 0 ? 0.12 : -0.12, false);
    m.spin(0, -15, 0).fade(0.15, 0.5).k = 0.75;
    if (has) m.follow(id);
  }
  // 沿切线甩出去的火星
  const p = k.particles.use(P.streak).tint(T.hot, T.glow);
  const n = k.n(8);
  for (let i = 0; i < n; i++) p.orbit(x, r.range(0.5, 1.6), z, R0 * r.range(0.4, 0.6), R0 * r.range(0.9, 1.05), r.next() * TAU, 9, r.range(0, 1.5), r.range(0.26, 0.36), 0.22, 0.08);
  embers(k, x, 0.4, z, 4, R0 * 0.7, 1.5, T.hot, T.glow, 0.7);
  flames(k, x, 0.1, z, 3, R0 * 0.6, 0.8);
};

export const CHIJIN = {
  chijin_passive_hit: passiveHit,
  chijin_s1_slash: s1Slash,
  chijin_s2_dash: s2Dash,
  chijin_ult_start: ultStart,
  chijin_ult_tick: ultTick,
} satisfies Record<string, FxHandler>;

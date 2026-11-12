/**
 * 风翎 · 疾风 / 翠绿：气环、风痕、飘羽与箭雨。
 */
import { HEROES } from '../../../core/data/heroes';
import { P, R, dustPuff, flash, hoop, pillar, ring, slashArc } from '../common';
import { DECAL } from '../decals';
import { MODE, SHAPE } from '../glow';
import type { FxKit } from '../kit';
import { C, TAU, THEME } from '../util';
import { type FxHandler, fixedValue } from './types';

const T = THEME.fengling;
const S2 = HEROES.fengling.skills.s2;

function feathers(k: FxKit, x: number, y: number, z: number, count: number, speed: number, vx = 0, vz = 0): void {
  const p = k.particles.use(P.feather);
  const r = k.rnd;
  const n = k.n(count);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const s = speed * r.range(0.4, 1);
    p.spawn(x, y + r.signed() * 0.4, z, Math.cos(a) * s + vx, r.range(0.8, 3), Math.sin(a) * s + vz, r.range(0.8, 1.3), 0.46, 0.38, r.next() * 0.05);
  }
}

function leaves(k: FxKit, x: number, y: number, z: number, count: number, radius: number): void {
  const p = k.particles.use(P.leaf);
  const r = k.rnd;
  const n = k.n(count);
  for (let i = 0; i < n; i++) p.orbit(x, y + r.next() * 0.6, z, radius * 0.25, radius * r.range(0.8, 1.2), r.next() * TAU, r.range(6, 10), r.range(0.8, 2.2), r.range(0.4, 0.65), 0.34, 0.2);
}

/** 贯风矢出手 @pos, dir：两道气环顺着箭路推出去 */
const s1Cast: FxHandler = (k, e) => {
  const dx = e.dir?.x ?? 1;
  const dz = e.dir?.y ?? 0;
  const facing = Math.atan2(dz, dx);
  const x = e.pos.x + dx * 0.8;
  const z = e.pos.y + dz * 0.8;
  const y = 1.4;
  const r = k.rnd;
  flash(k, x, y, z, 1.5, T.hot, 0.18);
  k.glow.spawn(SHAPE.hoop, MODE.hoop, 0.32).at(x, y, z).vel(dx * 5, 0, dz * 5).rot(0, -facing, -Math.PI / 2).scale(0.3, 1.6).color(T.glow, 1.9, 0.9).fade(0.1, 0.4);
  k.glow.spawn(SHAPE.hoop, MODE.hoop, 0.28).at(x, y, z).vel(dx * 10, 0, dz * 10).rot(0, -facing, -Math.PI / 2).scale(0.2, 1.0).color(T.hot, 1.9, 0.9).fade(0.1, 0.4).delay(0.04);
  const p = k.particles.use(P.streak).tint(T.hot, T.glow);
  const n = k.n(10);
  for (let i = 0; i < n; i++) {
    const s = r.range(12, 22);
    p.spawn(x + r.signed() * 0.3, y + r.signed() * 0.4, z + r.signed() * 0.3, dx * s + r.signed() * 2.5, r.signed() * 1.5, dz * s + r.signed() * 2.5, r.range(0.16, 0.3), 0.14, 0.05);
  }
  feathers(k, x, y, z, 5, 2.5, -dx * 2.5, -dz * 2.5);
  dustPuff(k, e.pos.x - dx * 0.4, 0.2, e.pos.y - dz * 0.4, 3, 0.3, 0.9, C.dust, C.dustDark, 0.5);
  k.decals.add(DECAL.streak, x + dx * 2.2, z + dz * 2.2, 2.6, 0.36).rot(facing, 0.16).params(0.3, 6).color(T.glow, 1.5).under(C.black, 0);
};

/** 逐风步 from → to：两道风痕 + 起跳处卷起的叶与羽 */
const s2Dash: FxHandler = (k, e) => {
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
  ring(k, from.x, from.y, 1.6, 0.35, T.glow, 1.4, 0.15, 0.25);
  leaves(k, from.x, 0.3, from.y, 8, 1.5);
  feathers(k, from.x, 1, from.y, 4, 2);
  dustPuff(k, from.x, 0.2, from.y, 3, 0.3, 0.9, C.dust, C.dustDark, 0.5);
  k.decals
    .add(DECAL.streak, (from.x + to.x) / 2, (from.y + to.y) / 2, dist / 2 + 0.3, 0.45)
    .rot(facing, 0.5 / (dist / 2 + 0.3))
    .params(0.35, 0.45 / dur)
    .color(T.glow, 1.5)
    .under(C.black, 0);
  if (k.anchor(id)) {
    k.trail(id, R.wind, dur + 0.06, 0.8, undefined, undefined, 0.4, dx, dz);
    k.trail(id, R.wind, dur + 0.06, 1.3, undefined, undefined, -0.4, dx, dz);
    k.trail(id, R.thin, dur + 0.06, 1.6, T.hot, T.glow);
  }
  // 途中立起的一道风刃，随身形向前掠过
  slashArc(k, from.x + dx * dist * 0.3, 1.1, from.y + dz * dist * 0.3, facing, 1.3, 0.28, T.hot, 1.9, Math.PI / 2, false, 0.8).vel(dx * 8, 0, dz * 8);
  k.after(dur, () => {
    ring(k, to.x, to.y, 1.3, 0.3, T.glow, 1.2, 0.2, 0.2);
    leaves(k, to.x, 0.3, to.y, 4, 1.1);
  });
};

/** 朝天射击 @unit：一簇箭矢拖着绿光直冲天空 */
const ultCast: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const r = k.rnd;
  const p = k.particles.use(P.arrow);
  const n = k.n(14);
  for (let i = 0; i < n; i++) p.spawn(x + r.signed() * 0.4, 1.8 + r.next() * 0.5, z + r.signed() * 0.4, r.signed() * 2.2, r.range(26, 36), r.signed() * 2.2, r.range(0.28, 0.36), 0.5, 0.4, r.next() * 0.16);
  pillar(k, x, z, 0.5, 10, 0.45, T.glow, 1.8, 0.8);
  hoop(k, x, 0.3, z, 0.5, 2.3, 0, 0.42, T.glow, 1.8, 0.85);
  hoop(k, x, 1.6, z, 0.4, 1.4, 6, 0.36, T.hot, 1.8, 0.85).delay(0.05);
  ring(k, x, z, 2.3, 0.4, T.glow, 1.4, 0.15, 0.25);
  feathers(k, x, 1.4, z, 8, 3.5);
  leaves(k, x, 0.3, z, 6, 1.6);
  flash(k, x, 2.3, z, 2, T.hot, 0.22, true);
  k.light(x, z, 2, T.glow, 5, 7, 0.4);
};

/** 一波箭雨落地 @pos, radius：每支箭都有落点与溅起的风屑 */
const ultTick: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? 5;
  const r = k.rnd;
  // 箭从施法者一侧的高空斜落
  let sx = -1.6;
  let sz = -1.1;
  if (k.anchor(e.unitId)) {
    const dx = x - k.a.x;
    const dz = z - k.a.z;
    const l = Math.hypot(dx, dz);
    if (l > 0.5) {
      sx = (dx / l) * 2.6;
      sz = (dz / l) * 2.6;
    }
  }
  const H = 10;
  const p = k.particles;
  const n = k.n(20);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const d = Math.sqrt(r.next()) * R0 * 0.96;
    const lx = x + Math.cos(a) * d;
    const lz = z + Math.sin(a) * d;
    const tf = r.range(0.15, 0.2);
    const delay = r.next() * 0.3;
    p.use(P.arrow).spawn(lx - sx, H, lz - sz, sx / tf, -H / tf, sz / tf, tf, 0.56, 0.5, delay);
    // 落点：贴地涟漪 + 两点风屑
    p.use(P.ripple).tint(T.hot, T.glow).spawn(lx, 0.08, lz, 0, 0, 0, 0.3, 0.25, 1.1, delay + tf);
    p.use(P.streak).tint(T.hot, T.glow);
    for (let j = 0; j < 2; j++) p.spawn(lx, 0.15, lz, r.signed() * 3, r.range(2, 5), r.signed() * 3, 0.22, 0.12, 0.04, delay + tf);
  }
  // 每一波都把边界亮一下：范围读得清
  k.decals.add(DECAL.ring, x, z, R0, 0.45).params(0.8, 1).color(T.glow, 1.2).under(T.dark, 0.2);
  const lf = k.particles.use(P.leaf);
  for (let i = 0; i < k.n(3); i++) {
    const a = r.next() * TAU;
    const d = r.next() * R0;
    lf.spawn(x + Math.cos(a) * d, 0.3, z + Math.sin(a) * d, r.signed() * 2, r.range(1, 3), r.signed() * 2, r.range(0.5, 0.8), 0.3, 0.16, 0.15 + r.next() * 0.3);
  }
};

export const FENGLING = {
  fengling_s1_cast: s1Cast,
  fengling_s2_dash: s2Dash,
  fengling_ult_cast: ultCast,
  fengling_ult_tick: ultTick,
} satisfies Record<string, FxHandler>;

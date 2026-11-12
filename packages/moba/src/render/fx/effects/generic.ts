/**
 * 通用一次性特效：命中 / 暴击 / 塔弹命中 / 治疗 / 破盾 / 升级 / 复活 / 回城 / 闪现 / 金币 / 塔毁 / 水晶毁 / 野怪倒地 / 获得增益。
 */
import type * as THREE from 'three';
import { MONSTERS } from '../../../core/data/units';
import type { TeamId } from '../../../core/types';
import { P, R, boulders, debris, dustPuff, dustRing, embers, flash, glints, groundGlow, hoop, orb, pillar, ring, scorch, shards, shockShell, slashArc, sparks } from '../common';
import { DECAL } from '../decals';
import type { FxKit } from '../kit';
import { C, TAU, teamTheme } from '../util';
import { type FxHandler, involvesPlayer, unitY } from './types';

const hitPhysical: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.targetId, 0.5, 1);
  const big = k.a.unit !== null && (k.a.unit.kind === 'hero' || k.a.unit.kind === 'monster');
  // 火花顺着攻击方向穿出去
  let dx = 0;
  let dz = 0;
  if (k.anchor(e.unitId)) {
    dx = x - k.a.x;
    dz = z - k.a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
  }
  flash(k, x, y, z, big ? 1.5 : 1.0, C.warm, 0.14, big);
  k.particles.use(P.ringB).tint(C.spark, C.sparkDeep).spawn(x, y, z, 0, 0, 0, 0.2, 0.3, big ? 1.5 : 1.0);
  if (big) k.particles.use(P.crescent).tint(C.warm, C.sparkDeep).spawn(x, y, z, 0, 0, 0, 0.2, 1.0, 2.0);
  sparks(k, x, y, z, big ? 7 : 3, 8, C.spark, C.sparkDeep, dx, dz, 0.55, 0.36, 0.14);
  if (e.targetId === env.playerId) k.shake(0.05, x, z);
};

const hitMagic: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.targetId, 0.5, 1);
  const big = k.a.unit !== null && (k.a.unit.kind === 'hero' || k.a.unit.kind === 'monster');
  flash(k, x, y, z, big ? 1.5 : 1.0, C.magic, 0.16, big);
  k.particles.use(P.ringB).tint(C.magic, C.magicDeep).spawn(x, y, z, 0, 0, 0, 0.26, 0.3, big ? 1.9 : 1.2);
  const p = k.particles.use(P.star).tint(C.magic, C.magicDeep);
  const r = k.rnd;
  for (let i = 0; i < k.n(big ? 4 : 2); i++) {
    const a = r.next() * TAU;
    p.spawn(x, y, z, Math.cos(a) * 3.5, r.range(0.5, 3), Math.sin(a) * 3.5, 0.4, 0.3, 0.12);
  }
  glints(k, x, y, z, big ? 5 : 3, 3.4, C.magic, C.magicDeep, 0.45, 0.32);
  if (e.targetId === env.playerId) k.shake(0.05, x, z);
};

const hitCrit: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.targetId, 0.5, 1);
  let dx = 0;
  let dz = 0;
  if (k.anchor(e.unitId)) {
    dx = x - k.a.x;
    dz = z - k.a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
  }
  flash(k, x, y, z, 2.6, C.crit, 0.2, true);
  // 交叉的两道斩痕
  const p = k.particles.use(P.crescent).tint(C.crit, C.critDeep);
  p.spawn(x, y, z, 0, 0, 0, 0.24, 1.5, 3.2);
  p.spawn(x, y, z, 0, 0, 0, 0.28, 1.2, 2.6, 0.04);
  k.particles.use(P.ringB).tint(C.crit, C.critDeep).spawn(x, y, z, 0, 0, 0, 0.26, 0.5, 2.6);
  sparks(k, x, y, z, 14, 12, C.crit, C.critDeep, dx, dz, 0.5, 0.45, 0.18);
  glints(k, x, y, z, 5, 4.5, C.crit, C.critDeep, 0.5, 0.42);
  ring(k, x, z, 1.7, 0.32, C.critDeep, 1.6, 0.2, 0.4);
  if (involvesPlayer(e, env)) {
    k.shake(0.14, x, z);
    k.light(x, z, y, C.crit, 4, 5, 0.25);
  }
};

const hitTower: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.targetId, 0.45, 1);
  const th = teamTheme(e.team);
  flash(k, x, y, z, 2.2, th.hot, 0.22, true);
  shockShell(k, x, y, z, 0.3, 1.5, 0.26, th.glow, 1.8);
  shards(k, x, y, z, 7, 6, 5, th.hot, th.glow, 0.24);
  sparks(k, x, y, z, 8, 9, th.hot, th.glow, 0, 0, 0, 0.4, 0.14);
  ring(k, x, z, 1.7, 0.35, th.glow, 1.6, 0.2, 0.3);
  if (e.targetId === env.playerId) {
    k.shake(0.22, x, z);
    k.light(x, z, y, th.glow, 6, 6, 0.3);
  }
};

const heal: FxHandler = (k, e) => {
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  const x = has ? k.a.x : e.pos.x;
  const z = has ? k.a.z : e.pos.y;
  const y0 = has ? k.a.y : 0;
  const pen = k.decals.add(DECAL.glow, x, z, 2.0, 1.0).params(1.3).color(C.heal, 1.4).under(C.black, 0);
  const rp = k.decals.add(DECAL.ring, x, z, 1.9, 0.5).params(0.2, 1).color(C.healDeep, 1.5).under(C.shadow, 0.25);
  const pl = pillar(k, has ? 0 : x, has ? 0 : z, 0.75, 3.2, 0.7, C.heal, 1.3, 0.7);
  if (has) {
    pen.follow(id);
    rp.follow(id);
    pl.follow(id);
  }
  for (let i = 0; i < 2; i++) {
    const h = hoop(k, has ? 0 : x, (has ? 0 : y0) + 0.3, has ? 0 : z, 1.0, 0.8, 2.2, 0.7, C.heal, 1.7, 0.9).delay(i * 0.16);
    if (has) h.follow(id);
  }
  const p = k.particles.use(P.plus);
  const r = k.rnd;
  const n = k.n(8);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const d = r.range(0.5, 1.1);
    p.spawn(x + Math.cos(a) * d, y0 + r.range(0.3, 1.2), z + Math.sin(a) * d, 0, r.range(1.2, 2.2), 0, r.range(0.6, 0.9), 0.3, 0.46, r.range(0, 0.25));
  }
  glints(k, x, y0 + 1, z, 6, 1.8, C.heal, C.healDeep, 0.7, 0.3);
};

const shieldBreak: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.unitId, 0.5, 1.1);
  const rad = (k.a.unit ? k.a.radius : 0.6) + 0.7;
  flash(k, x, y, z, 1.8, C.white, 0.16);
  shockShell(k, x, y, z, rad, rad * 1.6, 0.24, C.frost, 1.8, 0.9);
  const p = k.particles.use(P.hex);
  const r = k.rnd;
  const n = k.n(9);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const el = r.range(-0.2, 0.9);
    const h = Math.sqrt(1 - el * el * 0.8);
    const s = r.range(3, 6.5);
    p.spawn(x + Math.cos(a) * h * rad * 0.8, y + el * rad * 0.8, z + Math.sin(a) * h * rad * 0.8, Math.cos(a) * h * s, el * s + 1.5, Math.sin(a) * h * s, r.range(0.45, 0.75), 0.4, 0.22);
  }
  shards(k, x, y, z, 8, 6, 4, C.white, C.frost, 0.22);
  glints(k, x, y, z, 5, 3, C.white, C.frost, 0.5, 0.3);
};

const levelUp: FxHandler = (k, e, env) => {
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  const x = has ? k.a.x : e.pos.x;
  const z = has ? k.a.z : e.pos.y;
  const fx = has ? 0 : x;
  const fz = has ? 0 : z;
  // 预备：脚下金环收拢 → 主体：双层光柱 + 上升环 → 余波：星屑飘落
  // 光柱套在英雄身上：外层要淡、内层要细，否则升级的那一秒整个人被金光糊住(对线时每隔几十秒就升一级)
  const outer = pillar(k, fx, fz, 1.3, 6.5, 1.0, C.gold, 1.05, 0.34);
  const inner = pillar(k, fx, fz, 0.3, 8, 0.8, C.goldHot, 1.7, 0.5);
  const rune = k.decals.add(DECAL.rune, x, z, 2.1, 1.2).params(5, 1.2).color(C.gold, 1.7).under(C.shadow, 0.3);
  if (has) {
    outer.follow(id);
    inner.follow(id);
    rune.follow(id);
  }
  ring(k, x, z, 2.8, 0.5, C.gold, 1.6, 0.1, 0.25);
  for (let i = 0; i < 3; i++) {
    const h = hoop(k, fx, 0.2, fz, 1.25 - i * 0.12, 0.85, 3.4, 0.75, C.goldHot, 1.9, 0.85).delay(i * 0.14);
    if (has) h.follow(id);
  }
  const p = k.particles.use(P.star).tint(C.goldHot, C.gold);
  const r = k.rnd;
  const n = k.n(14);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    p.orbit(x, r.range(0.1, 0.6), z, r.range(0.7, 1.3), r.range(0.3, 0.9), a, r.range(2, 5), r.range(2.2, 4.2), r.range(0.7, 1.1), 0.3, 0.12, r.range(0, 0.3));
  }
  glints(k, x, 1.2, z, 10, 3.5, C.white, C.gold, 0.9, 0.36);
  k.light(x, z, 2, C.gold, id === env.playerId ? 7 : 4, 7, 0.7);
};

const respawn: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const mine = e.unitId === env.playerId;
  const th = teamTheme(e.team);
  const glow = mine ? C.green : th.glow;
  pillar(k, x, z, 1.5, 10, 1.25, glow, 1.6, 0.8);
  pillar(k, x, z, 0.6, 12, 0.9, th.hot, 2.2, 0.9);
  orb(k, x, 1.2, z, 0.4, 2.0, 0.4, th.hot, 2.2);
  k.decals.add(DECAL.rune, x, z, 2.6, 1.5).params(6, -0.9).color(glow, 1.7).under(C.shadow, 0.3);
  ring(k, x, z, 3.2, 0.55, glow, 1.6, 0.1);
  ring(k, x, z, 2.2, 0.5, th.hot, 1.3, 0.1, 0.2, 0.18);
  // 光羽自上而下落回身体
  const p = k.particles.use(P.streak).tint(th.hot, glow);
  const r = k.rnd;
  const n = k.n(14);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const d = r.range(0.2, 1.2);
    p.spawn(x + Math.cos(a) * d, r.range(5, 9), z + Math.sin(a) * d, 0, -r.range(9, 14), 0, r.range(0.4, 0.6), 0.14, 0.08, r.range(0, 0.4));
  }
  glints(k, x, 1.2, z, 12, 3.5, C.white, glow, 0.9, 0.34);
  k.light(x, z, 2.5, glow, 7, 8, 0.8);
  if (mine) k.shake(0.15, x, z);
};

const recallStart: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  ring(k, x, z, 1.8, 0.4, C.blue, 1.5, 1, 0.25);
  k.decals.add(DECAL.ring, x, z, 1.9, 0.5).params(1, 0.25).color(C.frost, 1.5).under(C.shadow, 0.2);
  const p = k.particles.use(P.glint).tint(C.white, C.blue);
  const r = k.rnd;
  const n = k.n(10);
  for (let i = 0; i < n; i++) p.orbit(x, r.range(0.1, 0.4), z, r.range(1.5, 2), 0.5, r.next() * TAU, r.range(4, 7), r.range(1, 2.4), r.range(0.5, 0.8), 0.3, 0.12, r.range(0, 0.15));
  flash(k, x, 0.5, z, 1.4, C.frost, 0.25);
};

const recallDone: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  pillar(k, x, z, 1.25, 9, 0.7, C.blue, 1.8, 0.85);
  pillar(k, x, z, 0.5, 11, 0.5, C.white, 2.2, 0.9);
  orb(k, x, 1.2, z, 0.5, 2.2, 0.35, C.frost, 2.2);
  ring(k, x, z, 2.6, 0.5, C.blue, 1.6, 0.1);
  k.decals.add(DECAL.star, x, z, 1.9, 0.6).params(6, 2.6).color(C.frost, 1.6).under(C.shadow, 0.2);
  glints(k, x, 1.2, z, 14, 4.5, C.white, C.blue, 0.8, 0.34);
  k.light(x, z, 2, C.blue, 6, 7, 0.5);
};

const flashFx: FxHandler = (k, e, env) => {
  const from = e.from ?? e.pos;
  const to = e.to ?? e.pos;
  let dx = to.x - from.x;
  let dz = to.y - from.y;
  const dist = Math.hypot(dx, dz) || 1;
  dx /= dist;
  dz /= dist;
  const y = 1.1;
  // 起点：残影光柱 + 被吸向终点的流光
  flash(k, from.x, y, from.y, 1.7, C.goldHot, 0.2);
  pillar(k, from.x, from.y, 0.55, 2.6, 0.32, C.goldHot, 1.8, 0.8);
  k.decals.add(DECAL.ring, from.x, from.y, 1.5, 0.35).params(1, 0.15).color(C.gold, 1.5).under(C.shadow, 0.2);
  const p = k.particles.use(P.streak).tint(C.white, C.gold);
  const r = k.rnd;
  const n = k.n(10);
  for (let i = 0; i < n; i++) {
    const s = r.range(10, 22);
    p.spawn(from.x + r.signed() * 0.5, y + r.signed() * 0.7, from.y + r.signed() * 0.5, dx * s + r.signed() * 1.5, r.signed() * 1.2, dz * s + r.signed() * 1.5, r.range(0.14, 0.26), 0.16, 0.06);
  }
  k.ribbons.trace(R.energy, from.x, y, from.y, to.x, y, to.y, 0.07, C.goldHot, C.gold);
  k.decals.add(DECAL.streak, (from.x + to.x) / 2, (from.y + to.y) / 2, dist / 2, 0.3).rot(Math.atan2(dz, dx), 0.5 / dist).params(0, 9).color(C.gold, 1.4).under(C.black, 0);
  // 终点：爆闪 + 冲击环
  k.after(0.06, () => {
    flash(k, to.x, y, to.y, 2.3, C.goldHot, 0.24, true);
    shockShell(k, to.x, y, to.y, 0.4, 1.7, 0.26, C.gold, 1.8);
    ring(k, to.x, to.y, 1.9, 0.38, C.gold, 1.6, 0.15, 0.25);
    glints(k, to.x, y, to.y, 9, 4.5, C.white, C.gold, 0.55, 0.32);
    k.light(to.x, to.y, 1.5, C.gold, 5, 6, 0.3);
  });
  if (e.unitId === env.playerId) k.shake(0.12, to.x, to.y);
};

const goldGain: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const value = e.value ?? 30;
  const r = k.rnd;
  const p = k.particles;
  flash(k, x, 0.8, z, 1.0, C.gold, 0.2);
  glints(k, x, 0.9, z, 4, 2.4, C.white, C.gold, 0.5, 0.28);
  const count = Math.min(9, Math.max(3, Math.round(2 + value / 22)));
  const has = k.anchor(e.unitId);
  const tx = has ? k.a.x : x;
  const tz = has ? k.a.z : z;
  const ty = has ? k.a.y + k.a.height * 0.5 : 0.3;
  const g = P.coin.gravity;
  p.use(P.coin);
  for (let i = 0; i < count; i++) {
    const x0 = x + r.signed() * 0.4;
    const z0 = z + r.signed() * 0.4;
    const y0 = 0.6 + r.next() * 0.5;
    // 抛物线：先向上弹起，T 秒后正好落到拾取者身上
    const T = (has ? 0.5 : 0.6) + i * 0.035 + r.next() * 0.08;
    const jx = has ? 0 : r.signed() * 1.4;
    const jz = has ? 0 : r.signed() * 1.4;
    p.spawn(x0, y0, z0, (tx + jx - x0) / T, (ty - y0) / T + 0.5 * g * T, (tz + jz - z0) / T, T, 0.34, 0.26, i * 0.025);
  }
  if (has) {
    p.use(P.glint).tint(C.goldHot, C.gold);
    for (let i = 0; i < 3; i++) p.spawn(tx + r.signed() * 0.3, ty + r.signed() * 0.3, tz + r.signed() * 0.3, r.signed(), 1 + r.next(), r.signed(), 0.4, 0.4, 0.1, 0.5 + i * 0.07);
  }
};

function secondaryBlast(k: FxKit, x: number, y: number, z: number, hot: THREE.Color, glow: THREE.Color, size: number): void {
  flash(k, x, y, z, 2.2 * size, hot, 0.22, true);
  shockShell(k, x, y, z, 0.3, 1.5 * size, 0.3, glow, 1.6);
  sparks(k, x, y, z, 8, 9, hot, glow, 0, 0, 0, 0.5, 0.16);
  dustPuff(k, x, y, z, 3, 0.6, 1.6 * size, C.smoke, C.smokeDark, 1.0);
}

const towerDestroyed: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const th = teamTheme(e.team);
  const r = k.rnd;
  // 主爆
  flash(k, x, 3, z, 6, th.hot, 0.32, true);
  shockShell(k, x, 1.5, z, 1, 6.5, 0.5, th.glow, 1.8);
  orb(k, x, 3, z, 0.8, 3.4, 0.4, th.hot, 2.4);
  pillar(k, x, z, 2.1, 13, 0.95, th.glow, 1.7, 0.85);
  pillar(k, x, z, 0.8, 15, 0.6, th.hot, 2.3, 0.9);
  ring(k, x, z, 7, 0.7, th.glow, 1.8, 0.1, 0.4);
  ring(k, x, z, 9.5, 0.8, th.hot, 1.2, 0.2, 0.2, 0.15);
  k.light(x, z, 3.5, th.glow, 14, 18, 1.0);
  k.shake(0.7, x, z);
  // 坍塌：碎岩、石屑、晶片、尘浪
  boulders(k, x, z, 9, 7.5, 11, 0.55);
  debris(k, x, z, 26, 9.5, 12, 1.2, C.rock, C.dustDark, 0.36);
  shards(k, x, 3, z, 20, 8, 9, th.hot, th.glow, 0.34);
  dustRing(k, x, z, 16, 1.4, 6.5, C.dust, C.dustDark, 2.3, 1.6);
  dustPuff(k, x, 0.8, z, 10, 1.8, 2.5, C.dust, C.smoke, 1.7);
  k.decals.add(DECAL.cracks, x, z, 4.6, 4.5).params(0, 0.2).color(th.glow, 1.6).under(C.shadow, 0.9);
  scorch(k, x, z, 4.3, 6, th.glow);
  // 余爆
  for (let i = 0; i < 4; i++) {
    const a = r.next() * TAU;
    const d = r.range(0.8, 2.6);
    const h = r.range(1, 5);
    k.after(0.22 + i * 0.2 + r.next() * 0.1, () => secondaryBlast(k, x + Math.cos(a) * d, h, z + Math.sin(a) * d, th.hot, th.glow, 0.8));
  }
  // 残留：烟柱与余烬
  const p = k.particles.use(P.smoke);
  const n = k.n(18);
  for (let i = 0; i < n; i++) p.spawn(x + r.signed() * 1.3, r.range(0.4, 1.5), z + r.signed() * 1.3, r.signed() * 0.5, r.range(1.6, 3.2), r.signed() * 0.5, r.range(1.4, 2.2), 1.6, 3.6, 0.2 + r.next() * 2.3);
  embers(k, x, 0.5, z, 22, 2, 1.6, th.hot, th.glow, 2.2, 0.2);
};

const coreDestroyed: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const th = teamTheme(e.team);
  const r = k.rnd;
  // 预备：能量向内坍缩
  k.decals.add(DECAL.ring, x, z, 10, 0.55).params(1, 0.08).color(th.hot, 1.8).under(C.shadow, 0.3);
  orb(k, x, 4, z, 5, 0.6, 0.5, th.hot, 2.4).opt(1, 1.2, 3);
  const pin = k.particles.use(P.glint).tint(th.hot, th.glow);
  const nIn = k.n(26);
  for (let i = 0; i < nIn; i++) pin.orbit(x, r.range(1, 6), z, r.range(5, 9), 0.4, r.next() * TAU, r.range(3, 6), r.range(-1, 1), 0.5, 0.5, 0.2, r.range(0, 0.1));
  k.light(x, z, 4, th.hot, 8, 14, 0.5);
  k.shake(0.35, x, z);
  // 主体：大爆炸
  k.after(0.5, () => {
    flash(k, x, 4, z, 11, th.hot, 0.4, true);
    shockShell(k, x, 2, z, 1.5, 12.5, 0.75, th.glow, 2);
    shockShell(k, x, 2, z, 1, 8, 0.55, th.hot, 1.6, 0.7);
    pillar(k, x, z, 3.3, 19, 1.7, th.glow, 1.8, 0.9);
    pillar(k, x, z, 1.3, 22, 1.2, th.hot, 2.5, 0.95);
    ring(k, x, z, 10.5, 0.8, th.glow, 2, 0.08, 0.45);
    ring(k, x, z, 13.5, 1.0, th.hot, 1.5, 0.15, 0.3, 0.16);
    ring(k, x, z, 17, 1.2, th.glow, 1.1, 0.2, 0.2, 0.34);
    boulders(k, x, z, 14, 10, 14, 0.7);
    debris(k, x, z, 40, 12, 15, 2.2, C.rock, C.dustDark, 0.42);
    shards(k, x, 4, z, 42, 12, 12, th.hot, th.glow, 0.42);
    dustRing(k, x, z, 24, 2.4, 9.5, C.dust, C.dustDark, 3.1, 2);
    k.decals.add(DECAL.rune, x, z, 8.5, 3.2).params(8, 0.5).color(th.glow, 1.7).under(C.shadow, 0.4);
    k.decals.add(DECAL.cracks, x, z, 9.5, 6.5).params(0, 0.3).color(th.glow, 1.8).under(C.shadow, 0.9);
    scorch(k, x, z, 7.8, 8, th.glow);
    k.light(x, z, 5, th.glow, 15, 24, 1.6);
    k.shake(1, x, z);
    // 余波：四周连环爆 + 光屑雨 + 浓烟
    for (let i = 0; i < 9; i++) {
      const a = r.next() * TAU;
      const d = r.range(2, 7.5);
      const h = r.range(0.8, 5);
      k.after(0.2 + i * 0.27 + r.next() * 0.1, () => {
        secondaryBlast(k, x + Math.cos(a) * d, h, z + Math.sin(a) * d, th.hot, th.glow, 1.15);
        ring(k, x + Math.cos(a) * d, z + Math.sin(a) * d, 2.4, 0.4, th.glow, 1.4, 0.2, 0.2);
        k.shake(0.22, x, z);
      });
    }
    const rain = k.particles.use(P.glint).tint(th.hot, th.glow);
    const nr = k.n(44);
    for (let i = 0; i < nr; i++) {
      const a = r.next() * TAU;
      const d = Math.sqrt(r.next()) * 9;
      rain.spawn(x + Math.cos(a) * d, r.range(5, 11), z + Math.sin(a) * d, r.signed() * 0.6, -r.range(1.5, 3.5), r.signed() * 0.6, r.range(1.2, 2), 0.42, 0.14, 0.4 + r.next() * 2.8);
    }
    const sm = k.particles.use(P.smoke);
    const ns = k.n(26);
    for (let i = 0; i < ns; i++) sm.spawn(x + r.signed() * 3, r.range(0.4, 2), z + r.signed() * 3, r.signed() * 0.7, r.range(1.8, 3.6), r.signed() * 0.7, r.range(1.6, 2.6), 2.2, 4.6, 0.3 + r.next() * 3);
    embers(k, x, 0.6, z, 30, 4, 2.2, th.hot, th.glow, 2.6, 0.24);
  });
};

const monsterSlain: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  // 单位在事件到达时可能已被移除：尽量从状态里取体型，取不到按小野怪算
  const u = k.anchors.unit(e.unitId ?? -1);
  const epic = u !== undefined && u.kind === 'monster' && MONSTERS[u.monsterType].epic;
  const rad = u ? u.radius : 0.9;
  const s = epic ? 2.2 : 0.8 + rad * 0.4;
  dustPuff(k, x, 0.3, z, epic ? 12 : 6, rad, 1.5 * s, C.dust, C.dustDark, 1.0);
  ring(k, x, z, 1.6 + rad * 1.3, 0.5, C.poison, 1.3, 0.2, 0.3);
  pillar(k, x, z, 0.45 * s, 3.6 * s, 0.9, C.poison, 1.5, 0.7);
  // 魂火上飘
  const p = k.particles.use(P.glint).tint(C.white, C.poison);
  const r = k.rnd;
  const n = k.n(epic ? 20 : 8);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    p.orbit(x, r.range(0.3, 1.2), z, r.range(0.2, rad + 0.4), r.range(0.1, 0.5), a, r.range(1.5, 4), r.range(1.6, 3.4), r.range(0.8, 1.3), 0.34, 0.1, r.range(0, 0.4));
  }
  const lp = k.particles.use(P.leaf).tint(C.poison, C.poisonDeep);
  for (let i = 0; i < k.n(6); i++) lp.spawn(x, 0.8, z, r.signed() * 3, r.range(1, 3.5), r.signed() * 3, r.range(0.8, 1.3), 0.34, 0.2);
  scorch(k, x, z, 1.2 + rad, 3.5);
  if (epic) {
    shockShell(k, x, 1.5, z, 1, 6, 0.6, C.poison, 1.6);
    ring(k, x, z, 8, 0.9, C.goldHot, 1.5, 0.1, 0.3, 0.1);
    boulders(k, x, z, 6, 6, 9, 0.5);
    k.light(x, z, 3, C.poison, 8, 14, 0.9);
    k.shake(0.5, x, z);
  }
};

const buffGain: FxHandler = (k, e) => {
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  const x = has ? k.a.x : e.pos.x;
  const z = has ? k.a.z : e.pos.y;
  // 从单位身上的增益判断是哪一种：霜蓝 / 焰红 / 星金
  let c = C.gold;
  let c2 = C.goldHot;
  let sides = 5;
  const u = k.a.unit;
  if (has && u) {
    for (const b of u.buffs) {
      if (b.id === 'frost_insight' && b.duration - b.timeLeft < 0.5) {
        c = C.frostDeep;
        c2 = C.frost;
        sides = 6;
      } else if (b.id === 'ember_might' && b.duration - b.timeLeft < 0.5) {
        c = C.ember;
        c2 = C.spark;
        sides = 3;
      }
    }
  }
  const rune = k.decals.add(DECAL.rune, x, z, 2, 1.3).params(sides, 1.5).color(c, 1.8).under(C.shadow, 0.3);
  const pl = pillar(k, has ? 0 : x, has ? 0 : z, 0.9, 5, 0.9, c, 1.6, 0.7);
  if (has) {
    rune.follow(id);
    pl.follow(id);
  }
  ring(k, x, z, 2.6, 0.45, c2, 1.5, 0.1, 0.25);
  for (let i = 0; i < 2; i++) {
    const h = hoop(k, has ? 0 : x, 0.2, has ? 0 : z, 1.2, 0.9, 2.8, 0.8, c2, 1.8, 0.85).delay(i * 0.2);
    if (has) h.follow(id);
  }
  const p = k.particles.use(P.rune).tint(c2, c);
  const r = k.rnd;
  const n = k.n(8);
  for (let i = 0; i < n; i++) p.orbit(x, r.range(0.2, 0.8), z, 1.25, 0.9, (i / n) * TAU, 3.2, r.range(1.6, 2.4), r.range(0.9, 1.2), 0.36, 0.3, r.range(0, 0.2));
  flash(k, x, 1.2, z, 1.8, c2, 0.3);
  glints(k, x, 1.2, z, 6, 3, C.white, c2, 0.7, 0.3);
  k.light(x, z, 1.8, c, 5, 7, 0.6);
};

export const GENERIC = {
  hit_physical: hitPhysical,
  hit_magic: hitMagic,
  hit_crit: hitCrit,
  hit_tower: hitTower,
  heal,
  shield_break: shieldBreak,
  level_up: levelUp,
  respawn,
  recall_start: recallStart,
  recall_done: recallDone,
  flash: flashFx,
  gold_gain: goldGain,
  tower_destroyed: towerDestroyed,
  core_destroyed: coreDestroyed,
  monster_slain: monsterSlain,
  buff_gain: buffGain,
} satisfies Record<string, FxHandler>;

// ───────────── 没有专属 FxKey、由其它事件触发的补充效果 ─────────────

/** 英雄阵亡：队伍色的魂光爆散 */
export function heroDeathFx(k: FxKit, x: number, z: number, team: TeamId, strong: boolean): void {
  const th = teamTheme(team);
  flash(k, x, 1.2, z, 2.6, th.hot, 0.3, true);
  shockShell(k, x, 1.1, z, 0.5, 2.8, 0.4, th.glow, 1.7);
  ring(k, x, z, 3.2, 0.6, th.glow, 1.6, 0.1, 0.35);
  pillar(k, x, z, 0.55, 7.5, 1.2, th.glow, 1.6, 0.75);
  shards(k, x, 1.2, z, 10, 6, 6, th.hot, th.glow, 0.26);
  const p = k.particles.use(P.glint).tint(th.hot, th.glow);
  const r = k.rnd;
  const n = k.n(14);
  for (let i = 0; i < n; i++) p.orbit(x, r.range(0.3, 1.6), z, r.range(0.2, 0.9), r.range(0.05, 0.4), r.next() * TAU, r.range(2, 5), r.range(2, 4.5), r.range(0.9, 1.5), 0.36, 0.1, r.range(0, 0.5));
  scorch(k, x, z, 1.7, 3.5);
  groundGlow(k, x, z, 2.4, 0.8, th.glow, 0.8);
  k.light(x, z, 1.6, th.glow, strong ? 8 : 5, 8, 0.6);
  k.shake(strong ? 0.5 : 0.25, x, z);
}

/** 小兵/野怪以外的小单位散架 */
export function minionDeathFx(k: FxKit, x: number, z: number, team: TeamId): void {
  const th = teamTheme(team);
  flash(k, x, 0.7, z, 0.9, th.hot, 0.16);
  shards(k, x, 0.7, z, 4, 4, 4, th.hot, th.glow, 0.18);
  dustPuff(k, x, 0.2, z, 3, 0.3, 0.9, C.dust, C.dustDark, 0.6);
}

/** 野怪刷新：营地腾起一圈光尘 */
export function monsterSpawnFx(k: FxKit, x: number, z: number, epic: boolean): void {
  const s = epic ? 2.2 : 1;
  ring(k, x, z, 2.2 * s, 0.6, C.poison, 1.3, 0.1, 0.25);
  dustRing(k, x, z, epic ? 12 : 6, 0.4 * s, 2.5 * s, C.dust, C.dustDark, 1.1 * s, 0.9);
  glints(k, x, 0.8 * s, z, epic ? 14 : 6, 3 * s, C.white, C.poison, 0.8, 0.3);
  if (epic) {
    pillar(k, x, z, 2.2, 10, 1.2, C.poison, 1.5, 0.7);
    k.shake(0.3, x, z);
  }
}

/** 史诗野怪被击杀：祝福的光浪从尸体处漫开 */
export function epicSlainFx(k: FxKit, x: number, z: number, team: TeamId): void {
  const th = teamTheme(team);
  pillar(k, x, z, 2.6, 16, 1.6, th.glow, 1.7, 0.85);
  pillar(k, x, z, 1, 18, 1.1, C.goldHot, 2.2, 0.9);
  ring(k, x, z, 12, 1.1, th.glow, 1.6, 0.05, 0.3);
  ring(k, x, z, 16, 1.4, C.gold, 1.2, 0.1, 0.2, 0.2);
  k.decals.add(DECAL.rune, x, z, 5.5, 2.4).params(8, 0.6).color(C.gold, 1.7).under(C.shadow, 0.3);
  glints(k, x, 2, z, 30, 7, C.white, C.gold, 1.4, 0.4);
  k.light(x, z, 4, th.glow, 10, 18, 1.2);
}

/** 近战英雄普攻的刀光(在出手瞬间调用) */
export function meleeSwingFx(k: FxKit, x: number, y: number, z: number, facing: number, c: THREE.Color, c2: THREE.Color, reach: number, variant: number): void {
  const tilt = (variant % 2 === 0 ? 1 : -1) * 0.45;
  slashArc(k, x, y, z, facing, reach, 0.22, c, 2, tilt, true, 0.9);
  k.particles.use(P.streak).tint(c, c2);
  const r = k.rnd;
  const n = k.n(3);
  for (let i = 0; i < n; i++) {
    const a = facing + r.signed() * 0.9;
    k.particles.spawn(x + Math.cos(a) * reach * 0.8, y + r.signed() * 0.3, z + Math.sin(a) * reach * 0.8, Math.cos(a) * 5, r.signed(), Math.sin(a) * 5, 0.2, 0.1, 0.04);
  }
}

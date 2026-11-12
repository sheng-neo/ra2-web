/**
 * 通用一次性特效：命中 / 暴击 / 塔弹命中 / 疗伤 / 破盾 / 升级 / 复活 / 回城 / 闪现 / 金币 / 塔毁 / 水晶毁 / 获得增益，
 * 以及没有专属 FxKey、由其它事件触发的补充效果(英雄阵亡、小兵散架、近战刀光)。野怪相关的在 monsters.ts。
 *
 * 调性按 art-v2 §7.1：命中是「一帧白闪 + 沿攻击方向的碎屑 + 小冲击环」，时长按普攻 / 技能 / 暴击分三档；
 * 升级 / 复活 / 回城的地面盘只留线、半径 ≤1.6 米，光柱细而高、0.5 秒内收束；建筑爆炸以「向上的碎片 + 地面痕迹」为主。
 */
import type * as THREE from 'three';
import type { TeamId } from '../../../core/types';
import { FX_RULES, P, R, boulders, debris, dustPuff, dustRing, embers, flash, glints, hitBurst, hoop, orb, pillar, ring, scorch, shards, shockShell, slashArc, sparks } from '../common';
import { DECAL } from '../decals';
import { MODE, SHAPE } from '../glow';
import type { FxKit } from '../kit';
import { C, TAU, teamTheme } from '../util';
import { recentSlain } from './monsters';
import { type FxEnv, type FxEvent, type FxHandler, involvesPlayer, unitY } from './types';

/** 攻击方向(来源 → 命中点)，没有来源时为 0 */
function attackDir(k: FxKit, e: FxEvent, x: number, z: number, out: { x: number; z: number }): void {
  out.x = 0;
  out.z = 0;
  if (!k.anchor(e.unitId)) return;
  const dx = x - k.a.x;
  const dz = z - k.a.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-3) return;
  out.x = dx / l;
  out.z = dz / l;
}
const _d = { x: 0, z: 0 };

/** 带着炽焰之力的普攻：命中处多一小簇火星 */
function emberTouch(k: FxKit, e: FxEvent, x: number, y: number, z: number): void {
  const u = k.anchors.unit(e.unitId ?? -1);
  if (!u || u.kind !== 'hero') return;
  for (const b of u.buffs) {
    if (b.id === 'ember_might') {
      sparks(k, x, y, z, 4, 5, C.emberHot, C.ember, _d.x, _d.z, 0.4, 0.35, 0.12);
      return;
    }
  }
}

const hitPhysical: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.targetId, 0.5, 1);
  const big = k.a.unit !== null && (k.a.unit.kind === 'hero' || k.a.unit.kind === 'monster');
  attackDir(k, e, x, z, _d);
  hitBurst(k, x, y, z, big ? 1.25 : 0.9, C.warm, C.sparkDeep, _d.x, _d.z, big ? 7 : 4, FX_RULES.flashBasic, 9);
  ring(k, x, z, big ? 1.05 : 0.75, 0.22, C.spark, 1.3, 0.3, 0.2);
  if (big) k.particles.use(P.crescent).tint(C.warm, C.sparkDeep).spawn(x, y, z, 0, 0, 0, 0.12, 0.8, 1.5);
  emberTouch(k, e, x, y, z);
};

const hitMagic: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.targetId, 0.5, 1);
  const big = k.a.unit !== null && (k.a.unit.kind === 'hero' || k.a.unit.kind === 'monster');
  attackDir(k, e, x, z, _d);
  hitBurst(k, x, y, z, big ? 1.25 : 0.9, C.magic, C.magicDeep, _d.x, _d.z, big ? 5 : 3, FX_RULES.flashBasic, 7);
  ring(k, x, z, big ? 1.05 : 0.75, 0.24, C.magic, 1.3, 0.3, 0.2);
  glints(k, x, y, z, big ? 4 : 2, 3, C.magic, C.magicDeep, 0.35, 0.28);
  emberTouch(k, e, x, y, z);
};

const hitCrit: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.targetId, 0.5, 1);
  attackDir(k, e, x, z, _d);
  const dx = _d.x === 0 && _d.z === 0 ? 1 : _d.x;
  const dz = _d.x === 0 && _d.z === 0 ? 0 : _d.z;
  hitBurst(k, x, y, z, 2.0, C.crit, C.critDeep, dx, dz, 12, FX_RULES.flashBig, 12);
  // 一道斜向的裂光：从目标身后上方斜劈到身前下方
  k.particles.use(P.streak).tint(C.white, C.crit).spawn(x - dx * 0.9, y + 0.7, z - dz * 0.9, dx * 26, -16, dz * 26, 0.1, 0.42, 0.12);
  const p = k.particles.use(P.crescent).tint(C.crit, C.critDeep);
  p.spawn(x, y, z, 0, 0, 0, 0.2, 1.4, 2.8);
  ring(k, x, z, 1.5, 0.3, C.critDeep, 1.5, 0.2, 0.35);
  emberTouch(k, e, x, y, z);
  if (involvesPlayer(e, env)) {
    k.shake(FX_RULES.shakeSkill, x, z);
    k.light(x, z, y, C.crit, 4, 5, 0.2);
  }
};

const hitTower: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.targetId, 0.45, 1);
  const th = teamTheme(e.team);
  // 有分量的一击：白闪 + 一小团向四周崩开的碎屑 + 落点的小冲击环与尘
  hitBurst(k, x, y, z, 1.7, th.hot, th.glow, 0, 0, 8, FX_RULES.flashSkill, 8);
  shards(k, x, y, z, 4, 5, 4, th.hot, th.glow, 0.2);
  ring(k, x, z, 1.25, 0.3, th.glow, 1.5, 0.2, 0.3);
  debris(k, x, z, 4, 3.5, 4, 0.3, C.rock, C.dustDark, 0.2);
  dustPuff(k, x, 0.2, z, 2, 0.3, 0.9, C.dust, C.dustDark, 0.5);
  if (e.targetId === env.playerId) {
    k.shake(0.1, x, z);
    k.light(x, z, y, th.glow, 5, 5, 0.25);
  }
};

const heal: FxHandler = (k, e) => {
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  const x = has ? k.a.x : e.pos.x;
  const z = has ? k.a.z : e.pos.y;
  const y0 = has ? k.a.y : 0;
  const rad = has ? k.a.radius : 0.6;
  // 一圈向上收拢的绿光 + 十字光点；不再套大光柱(疗伤是自保技能，不该比别人的技能还亮)
  const g = k.decals.add(DECAL.glow, x, z, 1.5 + rad, 0.8).params(1.4).color(C.heal, 1.0).under(C.black, 0);
  const rp = k.decals.add(DECAL.ring, x, z, 1.3 + rad, 0.45).params(0.25, 1).color(C.healDeep, 1.4).under(C.shadow, 0.2);
  const h = hoop(k, has ? 0 : x, (has ? 0 : y0) + 0.25, has ? 0 : z, rad + 0.55, rad + 0.25, 2.4, 0.6, C.heal, 1.5, 0.85);
  if (has) {
    g.follow(id);
    rp.follow(id);
    h.follow(id);
  }
  const p = k.particles.use(P.plus);
  const r = k.rnd;
  const n = k.n(7);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const d = r.range(0.4, rad + 0.5);
    p.spawn(x + Math.cos(a) * d, y0 + r.range(0.3, 1.1), z + Math.sin(a) * d, 0, r.range(1.2, 2.0), 0, r.range(0.55, 0.8), 0.28, 0.4, r.range(0, 0.2));
  }
  glints(k, x, y0 + 1, z, 4, 1.6, C.heal, C.healDeep, 0.6, 0.26);
};

const shieldBreak: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.unitId, 0.5, 1.1);
  const rad = (k.a.unit ? k.a.radius : 0.6) + 0.7;
  hitBurst(k, x, y, z, 1.6, C.frost, C.frostDeep, 0, 0, 6, FX_RULES.flashSkill, 6);
  shockShell(k, x, y, z, rad, rad * 1.5, 0.22, C.frost, 1.4, 0.8);
  const p = k.particles.use(P.hex);
  const r = k.rnd;
  const n = k.n(8);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const el = r.range(-0.2, 0.9);
    const h = Math.sqrt(1 - el * el * 0.8);
    const s = r.range(3, 6.5);
    p.spawn(x + Math.cos(a) * h * rad * 0.8, y + el * rad * 0.8, z + Math.sin(a) * h * rad * 0.8, Math.cos(a) * h * s, el * s + 1.5, Math.sin(a) * h * s, r.range(0.4, 0.65), 0.36, 0.2);
  }
  shards(k, x, y, z, 6, 6, 4, C.white, C.frost, 0.2);
};

/**
 * 升级 / 复活 / 回城共用的「细光柱收束」：起手是一根略粗的淡柱，0.5 秒内收成一根细亮线并消失。
 * 地面只画 1.6 米的线框符文盘(没有填充)。
 */
function convergeBeam(k: FxKit, x: number, z: number, follow: number, c: THREE.Color, hot: THREE.Color, height: number): void {
  const fx = follow >= 0 ? 0 : x;
  const fz = follow >= 0 ? 0 : z;
  const outer = k.glow.spawn(SHAPE.pillar, MODE.pillar, 0.5).at(fx, 0.05, fz).scale3(0.75, height * 0.6, 0.75, 0.12, height, 0.12).color(c, 1.1, 0.55).fade(0.06, 0.4).opt(0.3, 0.9, 1);
  const inner = k.glow.spawn(SHAPE.pillar, MODE.pillar, 0.42).at(fx, 0.05, fz).scale3(0.22, height * 0.8, 0.22, 0.05, height * 1.1, 0.05).color(hot, 1.6, 0.85).fade(0.04, 0.45).opt(0.45, 0.7, 1);
  if (follow >= 0) {
    outer.follow(follow);
    inner.follow(follow);
  }
}

const levelUp: FxHandler = (k, e, env) => {
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  const x = has ? k.a.x : e.pos.x;
  const z = has ? k.a.z : e.pos.y;
  const follow = has ? id : -1;
  // 起手：脚下金色线框盘一闪展开 → 主体：细光柱收束 + 两道上升细环 → 余波：星屑绕身上飘
  const rune = k.decals.add(DECAL.rune, x, z, 1.6, 0.9).params(5, 1.4).color(C.gold, 1.5, 0.95).under(C.shadow, 0.25);
  if (has) rune.follow(id);
  convergeBeam(k, x, z, follow, C.gold, C.goldHot, 6.5);
  for (let i = 0; i < 2; i++) {
    const h = hoop(k, has ? 0 : x, 0.2, has ? 0 : z, 0.95 - i * 0.12, 0.6, 3.6, 0.55, C.goldHot, 1.5, 0.85).delay(i * 0.12);
    if (has) h.follow(id);
  }
  const p = k.particles.use(P.star).tint(C.goldHot, C.gold);
  const r = k.rnd;
  const n = k.n(9);
  for (let i = 0; i < n; i++) p.orbit(x, r.range(0.1, 0.6), z, r.range(0.6, 1.0), r.range(0.25, 0.6), r.next() * TAU, r.range(2, 5), r.range(2.2, 3.8), r.range(0.6, 0.9), 0.26, 0.1, r.range(0, 0.25));
  k.light(x, z, 2, C.gold, id === env.playerId ? 6 : 3.5, 6, FX_RULES.lightDur);
};

const respawn: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const mine = e.unitId === env.playerId;
  const th = teamTheme(e.team);
  const glow = mine ? C.green : th.glow;
  convergeBeam(k, x, z, -1, glow, th.hot, 9);
  k.decals.add(DECAL.rune, x, z, 1.6, 1.1).params(6, -0.9).color(glow, 1.5, 0.95).under(C.shadow, 0.25);
  ring(k, x, z, 2.2, 0.45, glow, 1.4, 0.15, 0.25);
  // 光羽自上而下落回身体
  const p = k.particles.use(P.streak).tint(th.hot, glow);
  const r = k.rnd;
  const n = k.n(10);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const d = r.range(0.2, 0.9);
    p.spawn(x + Math.cos(a) * d, r.range(5, 8), z + Math.sin(a) * d, 0, -r.range(10, 14), 0, r.range(0.35, 0.5), 0.12, 0.06, r.range(0, 0.3));
  }
  glints(k, x, 1.2, z, 7, 2.6, C.white, glow, 0.7, 0.3);
  k.light(x, z, 2.5, glow, mine ? 6 : 4, 7, FX_RULES.lightDur);
  if (mine) k.shake(0.1, x, z);
};

const recallStart: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  ring(k, x, z, 1.5, 0.35, C.blue, 1.4, 1, 0.2);
  const p = k.particles.use(P.glint).tint(C.white, C.blue);
  const r = k.rnd;
  const n = k.n(8);
  for (let i = 0; i < n; i++) p.orbit(x, r.range(0.1, 0.4), z, r.range(1.2, 1.6), 0.45, r.next() * TAU, r.range(4, 7), r.range(1, 2.2), r.range(0.45, 0.7), 0.26, 0.1, r.range(0, 0.15));
};

const recallDone: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  convergeBeam(k, x, z, -1, C.blue, C.frost, 8);
  k.decals.add(DECAL.star, x, z, 1.5, 0.55).params(6, 2.6).color(C.frost, 1.5, 0.95).under(C.shadow, 0.2);
  ring(k, x, z, 2.0, 0.4, C.blue, 1.4, 0.15, 0.2);
  glints(k, x, 1.2, z, 9, 3.6, C.white, C.blue, 0.6, 0.3);
  k.light(x, z, 2, C.blue, 5, 6, FX_RULES.lightDur);
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
  // 起点：一闪 + 被吸向终点的流光；中段一道地面流光；终点：白闪 + 小冲击环
  hitBurst(k, from.x, y, from.y, 1.5, C.goldHot, C.gold, -dx, -dz, 4, FX_RULES.flashSkill, 5);
  k.decals.add(DECAL.ring, from.x, from.y, 1.3, 0.3).params(1, 0.15).color(C.gold, 1.4).under(C.shadow, 0.2);
  const p = k.particles.use(P.streak).tint(C.white, C.gold);
  const r = k.rnd;
  const n = k.n(8);
  for (let i = 0; i < n; i++) {
    const s = r.range(10, 22);
    p.spawn(from.x + r.signed() * 0.45, y + r.signed() * 0.6, from.y + r.signed() * 0.45, dx * s + r.signed() * 1.5, r.signed() * 1.2, dz * s + r.signed() * 1.5, r.range(0.12, 0.22), 0.14, 0.05);
  }
  k.ribbons.trace(R.energy, from.x, y, from.y, to.x, y, to.y, 0.07, C.goldHot, C.gold);
  k.decals.add(DECAL.streak, (from.x + to.x) / 2, (from.y + to.y) / 2, dist / 2, 0.28).rot(Math.atan2(dz, dx), 0.45 / dist).params(0, 9).color(C.gold, 1.3).under(C.black, 0);
  k.after(0.06, () => {
    hitBurst(k, to.x, y, to.y, 1.9, C.goldHot, C.gold, dx, dz, 6, FX_RULES.flashSkill, 6);
    ring(k, to.x, to.y, 1.6, 0.32, C.gold, 1.5, 0.15, 0.25);
    glints(k, to.x, y, to.y, 6, 3.6, C.white, C.gold, 0.45, 0.28);
    k.light(to.x, to.y, 1.5, C.gold, 4, 6, 0.25);
  });
  if (e.unitId === env.playerId) k.shake(0.08, to.x, to.y);
};

const goldGain: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const value = e.value ?? 30;
  const r = k.rnd;
  const p = k.particles;
  flash(k, x, 0.8, z, 0.8, C.gold, 0.12);
  const count = Math.min(8, Math.max(3, Math.round(2 + value / 24)));
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
    p.spawn(x0, y0, z0, (tx + jx - x0) / T, (ty - y0) / T + 0.5 * g * T, (tz + jz - z0) / T, T, 0.3, 0.24, i * 0.025);
  }
  if (has) {
    p.use(P.glint).tint(C.goldHot, C.gold);
    for (let i = 0; i < 2; i++) p.spawn(tx + r.signed() * 0.3, ty + r.signed() * 0.3, tz + r.signed() * 0.3, r.signed(), 1 + r.next(), r.signed(), 0.35, 0.36, 0.1, 0.5 + i * 0.07);
  }
};

function secondaryBlast(k: FxKit, x: number, y: number, z: number, hot: THREE.Color, glow: THREE.Color, size: number): void {
  flash(k, x, y, z, 1.6 * size, hot, 0.14, true);
  sparks(k, x, y, z, 6, 8, hot, glow, 0, 0, 0, 0.4, 0.14);
  debris(k, x, z, 4, 4, 7, 0.4, C.rock, C.dustDark, 0.26);
  dustPuff(k, x, y, z, 3, 0.6, 1.5 * size, C.smoke, C.smokeDark, 1.0);
}

/** 向上崩飞的碎片(建筑爆炸的主体)：受光碎岩 + 发光晶片，抛得高、落得慢 */
function upwardDebris(k: FxKit, x: number, z: number, count: number, up: number, spread: number, hot: THREE.Color, glow: THREE.Color): void {
  boulders(k, x, z, Math.round(count * 0.35), spread, up, 0.5);
  debris(k, x, z, count, spread * 1.2, up * 1.1, 1.1, C.rock, C.dustDark, 0.34);
  shards(k, x, 2.5, z, Math.round(count * 0.6), spread, up * 0.9, hot, glow, 0.3);
}

const towerDestroyed: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const th = teamTheme(e.team);
  const r = k.rnd;
  // 主爆：短促的白闪与光壳，光柱高度与时长比旧版砍半
  flash(k, x, 3, z, 4.5, th.hot, 0.2, true);
  shockShell(k, x, 1.5, z, 1, 5, 0.38, th.glow, 1.4, 0.7);
  pillar(k, x, z, 1.2, 7, 0.5, th.glow, 1.3, 0.6);
  ring(k, x, z, 6.5, 0.6, th.glow, 1.6, 0.1, 0.4);
  k.light(x, z, 3.5, th.glow, FX_RULES.lightMax, 16, FX_RULES.lightDur);
  k.shake(0.45, x, z);
  // 坍塌：向上的碎片、尘浪；地面留裂纹与焦痕
  upwardDebris(k, x, z, 26, 12, 7.5, th.hot, th.glow);
  dustRing(k, x, z, 14, 1.4, 6, C.dust, C.dustDark, 2.2, 1.5);
  dustPuff(k, x, 0.8, z, 8, 1.8, 2.4, C.dust, C.smoke, 1.6);
  k.decals.add(DECAL.cracks, x, z, 4.6, 4).params(0, 0.1).color(th.glow, 1.3).under(C.shadow, 0.9);
  scorch(k, x, z, 4.3, 5, th.glow);
  for (let i = 0; i < 3; i++) {
    const a = r.next() * TAU;
    const d = r.range(0.8, 2.4);
    const h = r.range(1, 4);
    k.after(0.2 + i * 0.22 + r.next() * 0.1, () => secondaryBlast(k, x + Math.cos(a) * d, h, z + Math.sin(a) * d, th.hot, th.glow, 0.8));
  }
  const p = k.particles.use(P.smoke);
  const n = k.n(14);
  for (let i = 0; i < n; i++) p.spawn(x + r.signed() * 1.3, r.range(0.4, 1.5), z + r.signed() * 1.3, r.signed() * 0.5, r.range(1.6, 3.2), r.signed() * 0.5, r.range(1.3, 2.0), 1.5, 3.4, 0.2 + r.next() * 2);
  embers(k, x, 0.5, z, 18, 2, 1.6, th.hot, th.glow, 2.0, 0.18);
};

const coreDestroyed: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const th = teamTheme(e.team);
  const r = k.rnd;
  // 预备：能量向内坍缩
  k.decals.add(DECAL.ring, x, z, 9, 0.5).params(1, 0.08).color(th.hot, 1.6).under(C.shadow, 0.3);
  orb(k, x, 4, z, 4.5, 0.6, 0.5, th.hot, 2.0).opt(1, 1.2, 3);
  const pin = k.particles.use(P.glint).tint(th.hot, th.glow);
  const nIn = k.n(22);
  for (let i = 0; i < nIn; i++) pin.orbit(x, r.range(1, 6), z, r.range(5, 8), 0.4, r.next() * TAU, r.range(3, 6), r.range(-1, 1), 0.5, 0.45, 0.18, r.range(0, 0.1));
  k.light(x, z, 4, th.hot, 6, 12, FX_RULES.lightDur);
  k.shake(0.25, x, z);
  // 主体：大爆炸(光柱砍半，换成向上的碎片 + 地面痕迹)
  k.after(0.5, () => {
    flash(k, x, 4, z, 8, th.hot, 0.22, true);
    shockShell(k, x, 2, z, 1.5, 10, 0.55, th.glow, 1.5, 0.7);
    pillar(k, x, z, 1.8, 11, 0.85, th.glow, 1.4, 0.6);
    pillar(k, x, z, 0.6, 12, 0.6, th.hot, 1.8, 0.8);
    ring(k, x, z, 10, 0.7, th.glow, 1.8, 0.08, 0.45);
    ring(k, x, z, 14, 0.9, th.hot, 1.3, 0.15, 0.3, 0.16);
    upwardDebris(k, x, z, 40, 15, 10, th.hot, th.glow);
    dustRing(k, x, z, 22, 2.4, 9, C.dust, C.dustDark, 3, 1.9);
    k.decals.add(DECAL.rune, x, z, 7.5, 3).params(8, 0.5).color(th.glow, 1.5).under(C.shadow, 0.35);
    k.decals.add(DECAL.cracks, x, z, 9, 4).params(0, 0.2).color(th.glow, 1.5).under(C.shadow, 0.9);
    scorch(k, x, z, 7.5, 4, th.glow);
    k.light(x, z, 5, th.glow, FX_RULES.lightMax, 22, FX_RULES.lightDur);
    k.shake(0.5, x, z);
    for (let i = 0; i < 7; i++) {
      const a = r.next() * TAU;
      const d = r.range(2, 7);
      const h = r.range(0.8, 4.5);
      k.after(0.2 + i * 0.27 + r.next() * 0.1, () => {
        secondaryBlast(k, x + Math.cos(a) * d, h, z + Math.sin(a) * d, th.hot, th.glow, 1.1);
        ring(k, x + Math.cos(a) * d, z + Math.sin(a) * d, 2.2, 0.35, th.glow, 1.3, 0.2, 0.2);
        k.shake(0.15, x, z);
      });
    }
    const rain = k.particles.use(P.glint).tint(th.hot, th.glow);
    const nr = k.n(36);
    for (let i = 0; i < nr; i++) {
      const a = r.next() * TAU;
      const d = Math.sqrt(r.next()) * 9;
      rain.spawn(x + Math.cos(a) * d, r.range(5, 11), z + Math.sin(a) * d, r.signed() * 0.6, -r.range(1.5, 3.5), r.signed() * 0.6, r.range(1.2, 2), 0.38, 0.12, 0.4 + r.next() * 2.4);
    }
    const sm = k.particles.use(P.smoke);
    const ns = k.n(22);
    for (let i = 0; i < ns; i++) sm.spawn(x + r.signed() * 3, r.range(0.4, 2), z + r.signed() * 3, r.signed() * 0.7, r.range(1.8, 3.6), r.signed() * 0.7, r.range(1.6, 2.4), 2.2, 4.4, 0.3 + r.next() * 2.6);
    embers(k, x, 0.6, z, 26, 4, 2.2, th.hot, th.glow, 2.4, 0.22);
  });
};

/**
 * 获得增益(蓝 / 红buff)：增益怪的核心化成一颗光球，0.6 秒内从尸体处飞到击杀者身上；
 * 到达时脚下的纹章细环展开 + 一道细光柱(高 3 米)。星陨祝福走 epicSlain 的全队演出，这里只做兜底。
 */
const buffGain: FxHandler = (k, e) => {
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  const x = has ? k.a.x : e.pos.x;
  const z = has ? k.a.z : e.pos.y;
  const rad = has ? k.a.radius : 0.6;
  let kind = 2;
  const u = k.a.unit;
  if (has && u) {
    for (const b of u.buffs) {
      if (b.duration - b.timeLeft > 0.5) continue;
      if (b.id === 'frost_insight') kind = 0;
      else if (b.id === 'ember_might') kind = 1;
    }
  }
  const c = kind === 0 ? C.frostDeep : kind === 1 ? C.ember : C.gold;
  const hot = kind === 0 ? C.frostHot : kind === 1 ? C.emberHot : C.goldHot;
  const arrive = (): void => {
    const ok = k.anchor(id);
    const ax = ok ? k.a.x : x;
    const az = ok ? k.a.z : z;
    const ay = ok ? k.a.y + k.a.height * 0.5 : 1;
    const sg = k.decals.add(DECAL.sigil, ax, az, rad * (kind === 0 ? 1.6 : kind === 1 ? 1.85 : 2.1) + 0.35, 0.9).params(kind === 2 ? 2 : kind, 0.35).rot(0).color(c, 1.6, 1).under(C.shadow, 0.3);
    const pl = k.glow.spawn(SHAPE.pillar, MODE.pillar, 0.5).at(ok ? 0 : ax, 0.05, ok ? 0 : az).scale3(0.4, 2.2, 0.4, 0.12, 3, 0.12).color(hot, 1.3, 0.75).fade(0.05, 0.4).opt(0.35, 0.8, 1);
    if (ok) {
      sg.follow(id);
      pl.follow(id);
    }
    hitBurst(k, ax, ay, az, 1.4, hot, c, 0, 0, 5, FX_RULES.flashSkill, 4);
    if (kind === 0) {
      const p = k.particles.use(P.frost);
      for (let i = 0; i < k.n(8); i++) p.orbit(ax, 0.2, az, rad + 0.4, rad + 0.9, (i / 8) * TAU, 3, k.rnd.range(0.6, 1.6), 0.8, 0.26, 0.12, k.rnd.range(0, 0.15));
    } else if (kind === 1) embers(k, ax, 0.4, az, 10, rad + 0.3, 2, hot, c, 0.9, 0.16);
    else glints(k, ax, ay, az, 8, 3, C.white, c, 0.7, 0.3);
    k.light(ax, az, 1.8, c, 4, 6, 0.3);
  };
  // 光球从最近倒下的增益怪处飞来；找不到(事件顺序变化或距离太远)就直接在身上展开
  const src = recentSlain(k, x, z, kind === 0 ? 'frost_golem' : kind === 1 ? 'ember_golem' : null);
  if (src && has) {
    const m = k.glow.hold(SHAPE.sphere, MODE.core);
    m.color(hot, 1.6, 0.95);
    m.add = 0.6;
    m.k = 1.6;
    m.scale(0.35);
    const sx = src.x;
    const sz = src.z;
    const sy = src.y;
    const rib = k.ribbons.start(R.energy, sx, sy, sz, hot, c);
    k.track(
      id,
      0.6,
      (a, t) => {
        // 抛物线飞行：先抬高再落到胸口
        const s = t * t * (3 - 2 * t);
        const px = sx + (a.x - sx) * s;
        const pz = sz + (a.z - sz) * s;
        const py = sy + (a.y + a.height * 0.5 - sy) * s + Math.sin(t * Math.PI) * 1.6;
        m.at(px, py, pz);
        if (rib >= 0) k.ribbons.move(rib, px, py, pz);
      },
      () => {
        k.glow.release(m);
        k.ribbons.end(rib);
        arrive();
      },
    );
  } else arrive();
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
  buff_gain: buffGain,
} satisfies Record<string, FxHandler>;

// ───────────── 没有专属 FxKey、由其它事件触发的补充效果 ─────────────

/** 英雄阵亡：队伍色的魂光散开；光柱比旧版矮一半、短一半，以上飘的光屑和地面暗斑为主 */
export function heroDeathFx(k: FxKit, x: number, z: number, team: TeamId, strong: boolean): void {
  const th = teamTheme(team);
  hitBurst(k, x, 1.2, z, 2.0, th.hot, th.glow, 0, 0, 6, FX_RULES.flashBig, 5);
  shockShell(k, x, 1.1, z, 0.5, 2.4, 0.3, th.glow, 1.4, 0.7);
  ring(k, x, z, 2.6, 0.5, th.glow, 1.5, 0.1, 0.3);
  pillar(k, x, z, 0.35, 3.8, 0.6, th.glow, 1.3, 0.6);
  shards(k, x, 1.2, z, 8, 5, 6, th.hot, th.glow, 0.24);
  const p = k.particles.use(P.glint).tint(th.hot, th.glow);
  const r = k.rnd;
  const n = k.n(12);
  for (let i = 0; i < n; i++) p.orbit(x, r.range(0.3, 1.6), z, r.range(0.2, 0.9), r.range(0.05, 0.4), r.next() * TAU, r.range(2, 5), r.range(2, 4.5), r.range(0.9, 1.4), 0.32, 0.1, r.range(0, 0.4));
  scorch(k, x, z, 1.6, 2.5);
  k.light(x, z, 1.6, th.glow, strong ? 6 : 4, 7, FX_RULES.lightDur);
  k.shake(strong ? 0.3 : 0.15, x, z);
}

/** 小兵散架：核心熄灭的一闪 + 零件弹开 */
export function minionDeathFx(k: FxKit, x: number, z: number, team: TeamId): void {
  const th = teamTheme(team);
  flash(k, x, 0.7, z, 0.8, th.hot, 0.1);
  shards(k, x, 0.7, z, 3, 4, 4, th.hot, th.glow, 0.16);
  debris(k, x, z, 3, 2.5, 4, 0.3, C.rock, C.dustDark, 0.2);
  dustPuff(k, x, 0.2, z, 2, 0.3, 0.9, C.dust, C.dustDark, 0.55);
}

/** 近战英雄普攻的刀光(在出手瞬间调用)：弧更窄更亮、0.14 秒，带 2~3 条速度线 */
export function meleeSwingFx(k: FxKit, x: number, y: number, z: number, facing: number, c: THREE.Color, c2: THREE.Color, reach: number, variant: number): void {
  const tilt = (variant % 2 === 0 ? 1 : -1) * 0.45;
  const m = slashArc(k, x, y, z, facing, reach, 0.14, c, 2.2, tilt, true, 0.95);
  // 只显示约 100° 的弧(斩弧网格全长 2.5 弧度)
  m.k = 0.7;
  k.particles.use(P.streak).tint(c, c2);
  const r = k.rnd;
  const n = 2 + (r.next() < 0.5 ? 1 : 0);
  const side = variant % 2 === 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const a = facing + side * (0.5 - i * 0.45) + r.signed() * 0.12;
    const tx = -Math.sin(a) * side;
    const tz = Math.cos(a) * side;
    k.particles.spawn(x + Math.cos(a) * reach * 0.85, y + r.signed() * 0.25, z + Math.sin(a) * reach * 0.85, tx * 9, r.signed() * 0.6, tz * 9, 0.12, 0.09, 0.03);
  }
}

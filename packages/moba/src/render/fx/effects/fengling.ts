/**
 * 李广 · 苍翠：破空的白线、白羽、草屑与石屑。「度不中不发」——特效要干净利落，
 * 不出现气旋、风环、风刃和绕飞的风叶。
 */
import { HEROES } from '../../../core/data/heroes';
import { FX_RULES, P, R, dustPuff, pillar, plumes, ring, slashArc } from '../common';
import { DECAL } from '../decals';
import { MODE, SHAPE } from '../glow';
import type { FxKit } from '../kit';
import { C, TAU, THEME } from '../util';
import { type FxHandler, fixedValue } from './types';

const T = THEME.fengling;
const S2 = HEROES.fengling.skills.s2;

/** 草屑：从 (x, z) 的地面被带起来，(vx, vz) 是整体被吹走的方向 */
export function grassBits(k: FxKit, x: number, z: number, count: number, spread: number, vx: number, vz: number, up = 2.2, delay = 0): void {
  const p = k.particles.use(P.grass);
  const r = k.rnd;
  const n = k.n(count);
  for (let i = 0; i < n; i++) {
    const sz = r.range(0.16, 0.3);
    p.spawn(x + r.signed() * spread, 0.12, z + r.signed() * spread, vx * r.range(0.5, 1.1) + r.signed() * 0.8, up * r.range(0.5, 1.2), vz * r.range(0.5, 1.1) + r.signed() * 0.8, r.range(0.4, 0.7), sz, sz * 0.8, delay + r.next() * 0.04);
  }
}

/** 弓弦回弹：立在弓位的一道竖弧光(弧顶朝前)，一闪即逝 */
function stringSnap(k: FxKit, x: number, y: number, z: number, facing: number, size: number, pitch = 0): void {
  const m = slashArc(k, x - Math.cos(facing) * size * 0.8, y, z - Math.sin(facing) * size * 0.8, facing, size, 0.16, T.hot, 2.2, Math.PI / 2, false, 0.95);
  m.rot(Math.PI / 2, -facing, pitch).scale(size * 0.92, size * 1.06).fade(0.02, 0.35);
  m.k = 0.5;
}

/** 白羽没石·出手 @pos, dir：弓弦回弹的竖弧光 + 一个小破空环 + 脚边草屑向两侧压开 */
const s1Cast: FxHandler = (k, e) => {
  const dx = e.dir?.x ?? 1;
  const dz = e.dir?.y ?? 0;
  const facing = Math.atan2(dz, dx);
  const x = e.pos.x + dx * 0.8;
  const z = e.pos.y + dz * 0.8;
  const y = 1.4;
  const r = k.rnd;
  k.particles.use(P.hitFlash).tint(C.white, T.hot).spawn(x, y, z, 0, 0, 0, FX_RULES.flashBasic, 0.7, 1.2);
  stringSnap(k, x, y, z, facing, 1.0);
  // 破空环：只有一个，小而快
  k.glow.spawn(SHAPE.hoop, MODE.hoop, 0.22).at(x + dx * 0.3, y, z + dz * 0.3).vel(dx * 12, 0, dz * 12).rot(0, -facing, -Math.PI / 2).scale(0.15, 0.75).color(C.white, 1.5, 0.85).fade(0.1, 0.35);
  // 破空白线
  const p = k.particles.use(P.streak).tint(C.white, T.hot);
  for (let i = 0; i < 3; i++) p.spawn(x + r.signed() * 0.12, y + r.signed() * 0.15, z + r.signed() * 0.12, dx * r.range(20, 28), 0, dz * r.range(20, 28), r.range(0.12, 0.18), 0.1, 0.03, i * 0.015);
  // 脚边的草被箭风压向两侧
  for (const side of [1, -1]) grassBits(k, e.pos.x + dx * 0.6, e.pos.y + dz * 0.6, 4, 0.3, dx * 1.5 - dz * side * 3.2, dz * 1.5 + dx * side * 3.2);
  k.decals.add(DECAL.streak, x + dx * 2.2, z + dz * 2.2, 2.6, 0.3).rot(facing, 0.1).params(0, 6).color(C.white, 1.1, 0.7).under(C.black, 0);
};

/** 飞将腾身 from → to：一道低平的细残痕 + 起跳处扬尘 */
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
  dustPuff(k, from.x, 0.2, from.y, 4, 0.35, 0.95, C.dust, C.dustDark, 0.5);
  grassBits(k, from.x, from.y, 5, 0.35, -dx * 2, -dz * 2, 2.6);
  k.decals
    .add(DECAL.streak, (from.x + to.x) / 2, (from.y + to.y) / 2, dist / 2 + 0.3, 0.4)
    .rot(facing, 0.32 / (dist / 2 + 0.3))
    .params(0.2, 0.4 / dur)
    .color(T.glow, 1.2, 0.75)
    .under(C.black, 0);
  if (k.anchor(id)) {
    k.trail(id, R.white, dur + 0.05, 0.55, C.white, T.glow);
    k.trail(id, R.thin, dur + 0.05, 1.25, T.hot, T.glow);
  }
  k.after(dur, () => {
    dustPuff(k, to.x, 0.15, to.y, 2, 0.3, 0.8, C.dust, C.dustDark, 0.4);
    plumes(k, to.x, 1.2, to.y, 2, 1.4, -dx * 1.5, -dz * 1.5);
  });
};

/** 箭锁阴山·仰射 @unit：一簇羽箭带着细光冲天，弓位一道朝上的弦震弧，几片白羽 */
const ultCast: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const r = k.rnd;
  const facing = k.anchor(e.unitId) && k.a.unit ? k.a.unit.facing : 0;
  const p = k.particles.use(P.arrow).tint(C.plume, T.hot);
  const n = k.n(12);
  for (let i = 0; i < n; i++) p.spawn(x + r.signed() * 0.4, 1.8 + r.next() * 0.5, z + r.signed() * 0.4, r.signed() * 2.2, r.range(26, 36), r.signed() * 2.2, r.range(0.28, 0.36), 0.5, 0.4, r.next() * 0.16);
  pillar(k, x, z, 0.24, 9, 0.4, T.glow, 1.5, 0.5);
  stringSnap(k, x + Math.cos(facing) * 0.5, 1.7, z + Math.sin(facing) * 0.5, facing, 1.05, 0.9);
  ring(k, x, z, 1.8, 0.34, T.glow, 1.2, 0.2, 0.2);
  plumes(k, x, 1.5, z, 5, 2.6);
  grassBits(k, x, z, 5, 0.6, 0, 0, 3);
  k.particles.use(P.hitFlash).tint(C.white, T.hot).spawn(x, 2.1, z, 0, 0, 0, FX_RULES.flashSkill, 0.9, 1.5);
  k.light(x, z, 2, T.glow, 5, 7, 0.3);
};

/** 一波箭雨落地 @pos, radius：每支箭都有落点(小尘点 + 草屑)，同时把区域边界亮一下 */
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
  const n = k.n(16);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const d = Math.sqrt(r.next()) * R0 * 0.96;
    const lx = x + Math.cos(a) * d;
    const lz = z + Math.sin(a) * d;
    const tf = r.range(0.15, 0.2);
    const delay = r.next() * 0.3;
    p.use(P.arrow).tint(C.plume, T.hot).spawn(lx - sx, H, lz - sz, sx / tf, -H / tf, sz / tf, tf, 0.56, 0.5, delay);
    // 落点：一小团尘 + 偶尔带起一片草
    p.use(P.dust).spawn(lx, 0.12, lz, sx * 0.25, r.range(0.5, 1.1), sz * 0.25, 0.35, 0.3, 0.7, delay + tf);
    if (i % 3 === 0) grassBits(k, lx, lz, 1, 0.1, sx * 0.6, sz * 0.6, 2.4, delay + tf);
    else p.use(P.chip).tint(C.white, T.glow).spawn(lx, 0.15, lz, r.signed() * 2.5, r.range(2, 4.5), r.signed() * 2.5, 0.18, 0.1, 0.03, delay + tf);
  }
  // 每一波都把边界亮一下：范围读得清
  k.decals.add(DECAL.ring, x, z, R0, 0.4).params(0.82, 1).color(T.glow, 1.1, 0.8).under(T.dark, 0.2);
};

export const FENGLING = {
  fengling_s1_cast: s1Cast,
  fengling_s2_dash: s2Dash,
  fengling_ult_cast: ultCast,
  fengling_ult_tick: ultTick,
} satisfies Record<string, FxHandler>;

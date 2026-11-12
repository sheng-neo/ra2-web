/**
 * 王昭君 · 月白青 + 弦金：弦(平行的金色细线)、音波(同心细环与弧)、雁(「人」字剪影 + 白羽)、月(圆形柔光)。
 * 不出现星形、晶屑、冰晶、雪花、六角形，也不用焦痕与粗光柱。
 */
import { FX_RULES, P, R, dustPuff, hoop, pillar, plumes, ring, waveRings } from '../common';
import { DECAL } from '../decals';
import { MODE, SHAPE } from '../glow';
import type { FxKit } from '../kit';
import { C, TAU, THEME } from '../util';
import { type FxHandler, involvesPlayer, unitY } from './types';

const T = THEME.xingli;
/** 雁影俯冲：起点相对落点的偏移(东北高空)与用时 */
const DIVE = { x: 2.3, y: 7.6, z: -1.7, time: 0.11 };

/** 金芒：一小把柔和的金点四散(代替星形闪烁) */
function motes(k: FxKit, x: number, y: number, z: number, count: number, speed: number, life = 0.55): void {
  const p = k.particles.use(P.mote);
  const r = k.rnd;
  const n = k.n(count);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const el = r.range(-0.2, 1);
    const h = Math.sqrt(Math.max(0, 1 - el * el));
    const s = speed * r.range(0.35, 1);
    p.spawn(x, y, z, Math.cos(a) * h * s, el * s, Math.sin(a) * h * s, life * r.range(0.6, 1.2), 0.22 * r.range(0.7, 1.3), 0.05, r.range(0, 0.05));
  }
}

/**
 * 一只雁影：从 (x, y, z) 以速度 (vx, vy, vz) 飞 life 秒。先垫一层深色剪影再画发光的雁，亮地面上轮廓才清楚。
 * size 是精灵边长(翼展约为它的 0.78 倍)。
 */
export function goose(k: FxKit, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow = 1, delay = 0): void {
  k.particles.use(P.gooseShade).spawn(x, y, z, vx, vy, vz, life, size * 1.1, size * 1.1 * grow, delay);
  k.particles.use(P.goose).spawn(x, y, z, vx, vy, vz, life, size, size * grow, delay);
}

/** 余音三叠·共振 @target：三道同心音波环连续外扩 + 一根竖直的金色弦光贯穿 + 金芒 */
const passiveBurst: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.targetId, 0.55, 1.1);
  waveRings(k, x, z, 2.3, 0.6, T.glow, 3, 1.8, false, 0.2);
  // 弦光：自上而下一线贯穿，随后留一根细而淡的弦
  k.ribbons.trace(R.string, x, 5.2, z, x, 0.1, z, 0.06, C.stringGold, T.accent);
  k.glow.spawn(SHAPE.pillar, MODE.pillar, 0.42).at(x, 0.05, z).scale3(0.09, 4.6, 0.09, 0.05, 5.2, 0.05).color(T.accent, 1.5, 0.9).fade(0.05, 0.4).opt(0.4, 0.5, 1);
  k.particles.use(P.hitFlash).tint(C.white, T.glow).spawn(x, y, z, 0, 0, 0, FX_RULES.flashSkill, 1.3, 2.1);
  // 两道朝向镜头的音波圈(在目标身上，和贴地的三环呼应)
  const rb = k.particles.use(P.ringB).tint(T.hot, T.glow);
  rb.spawn(x, y, z, 0, 0, 0, 0.3, 0.6, 2.4);
  rb.spawn(x, y, z, 0, 0, 0, 0.34, 0.4, 1.8, 0.08);
  motes(k, x, y, z, 10, 4.2);
  k.light(x, z, y, T.glow, 6, 7, 0.3);
  k.shake(involvesPlayer(e, env) ? FX_RULES.shakeSkill : 0.06, x, z);
};

/** 一弦穿云·出手 @pos, dir：琴位向前闪出四根平行短弦 + 两道推出去的音波环 */
const s1Cast: FxHandler = (k, e) => {
  const dx = e.dir?.x ?? 1;
  const dz = e.dir?.y ?? 0;
  const facing = Math.atan2(dz, dx);
  const x = e.pos.x + dx * 0.8;
  const z = e.pos.y + dz * 0.8;
  const y = 1.45;
  k.particles.use(P.hitFlash).tint(C.white, T.glow).spawn(x, y, z, 0, 0, 0, FX_RULES.flashBasic, 0.8, 1.3);
  // 垂直于弹道的两道音波环，向前推出
  k.glow.spawn(SHAPE.hoop, MODE.hoop, 0.28).at(x, y, z).vel(dx * 6, 0, dz * 6).rot(0, -facing, -Math.PI / 2).scale(0.25, 1.15).color(T.glow, 1.8, 0.9).fade(0.1, 0.4);
  k.glow.spawn(SHAPE.hoop, MODE.hoop, 0.24).at(x, y, z).vel(dx * 11, 0, dz * 11).rot(0, -facing, -Math.PI / 2).scale(0.18, 0.8).color(T.hot, 1.8, 0.9).fade(0.1, 0.4).delay(0.04);
  // 四弦：四根平行的金色短线，从琴位弹出去
  const p = k.particles.use(P.string);
  for (let i = 0; i < 4; i++) {
    const off = (i - 1.5) * 0.17;
    p.spawn(x - dz * off - dx * 0.3, y + (i - 1.5) * 0.05, z + dx * off - dz * 0.3, dx * 17, 0, dz * 17, 0.15, 0.07, 0.03, i * 0.012);
  }
  k.decals.add(DECAL.streak, x + dx * 1.5, z + dz * 1.5, 1.9, 0.26).rot(facing, 0.14).params(0, 6).color(T.accent, 1.2, 0.8).under(C.black, 0);
};

/** 回环收弦·收束 @pos, radius：八道弦线由边缘扫向中心 → 中心月白闪光 + 一道全圆的弧光(收拨) + 细光柱，白羽与金芒 */
const s2Burst: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? 3.4;
  const r = k.rnd;
  // 曲音向心收束
  k.decals.add(DECAL.ring, x, z, R0, 0.26).params(1, 0.08).color(T.glow, 1.9).under(T.dark, 0.35);
  const p = k.particles.use(P.string);
  const a0 = r.next() * TAU;
  for (let i = 0; i < 8; i++) {
    const a = a0 + (i * TAU) / 8;
    const sp = (R0 * 0.92) / 0.1;
    p.spawn(x + Math.cos(a) * R0, 0.55, z + Math.sin(a) * R0, -Math.cos(a) * sp, 0, -Math.sin(a) * sp, 0.1, 0.07, 0.03, i * 0.004);
  }
  k.after(0.1, () => {
    k.particles.use(P.hitFlash).tint(C.white, T.glow).spawn(x, 0.9, z, 0, 0, 0, FX_RULES.flashSkill, R0 * 0.5, R0 * 0.85);
    // 收拨：一道全圆的弧光从中心扫到判定半径
    hoop(k, x, 0.7, z, R0 * 0.2, R0 * 0.98, 0.6, 0.3, T.hot, 1.9, 0.9);
    ring(k, x, z, R0, 0.4, T.glow, 1.6, 0.12, 0.25);
    waveRings(k, x, z, R0 * 0.72, 0.45, T.accent, 2, 1.3, false, 0.2, 0.04);
    pillar(k, x, z, 0.22, 5.5, 0.32, T.hot, 1.6, 0.6);
    plumes(k, x, 1.1, z, 3, 2.4);
    motes(k, x, 1, z, 10, 5);
    k.light(x, z, 1.8, T.glow, FX_RULES.lightMax, R0 * 2.4, 0.35);
    k.shake(involvesPlayer(e, env) ? FX_RULES.shakeSkill : 0.06, x, z);
  });
};

/** 雁落平沙·起手 @unit：脚下一轮圆月带月晕，两道上升的音波环，一行小雁从身后朝落点方向飞出(预告) */
const ultCast: FxHandler = (k, e) => {
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  const x = has ? k.a.x : e.pos.x;
  const z = has ? k.a.z : e.pos.y;
  const facing = has && k.a.unit ? k.a.unit.facing : 0;
  const dx = Math.cos(facing);
  const dz = Math.sin(facing);
  const moon = k.decals.add(DECAL.moon, x, z, 2.1, 1.1).params(0.7, 1).color(T.hot, 1.5).under(T.dark, 0.35);
  if (has) moon.follow(id);
  const pl = pillar(k, has ? 0 : x, has ? 0 : z, 0.18, 9, 0.6, T.hot, 1.5, 0.55);
  if (has) pl.follow(id);
  for (let i = 0; i < 2; i++) {
    const h = hoop(k, has ? 0 : x, 0.3, has ? 0 : z, 1.2 - i * 0.3, 0.55, 5, 0.55, T.glow, 1.8, 0.85).delay(i * 0.12);
    if (has) h.follow(id);
  }
  // 雁阵：领头一只，其后左右各两只排成「人」字，朝落点方向掠过头顶
  const n = k.lowQ ? 3 : 5;
  for (let i = 0; i < n; i++) {
    const row = Math.ceil(i / 2);
    const side = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
    const bx = x - dx * (1.6 + row * 0.9) - dz * side * row * 0.8;
    const bz = z - dz * (1.6 + row * 0.9) + dx * side * row * 0.8;
    goose(k, bx, 3.3 + row * 0.12, bz, dx * 12, -1.3, dz * 12, 0.62, 1.0, 1.05, 0.05 + row * 0.03);
  }
  motes(k, x, 1.4, z, 8, 2.6, 0.7);
  k.particles.use(P.hitFlash).tint(C.white, T.glow).spawn(x, 1.6, z, 0, 0, 0, FX_RULES.flashSkill, 1.0, 1.7);
  k.light(x, z, 2.2, T.glow, 6, 8, 0.35);
};

/**
 * 一只雁影俯冲落地 @pos, radius：沿东北高空的斜线扑下来(约 0.11 秒，翼展约 1.6 米，两条翼尖细拖尾)，
 * 落地 = 月白音波环(精确到半径) + 一圈金色细环 + 一点沙尘 + 三片缓落的白羽；落地后雁影在原地舒翼一瞬再淡去，
 * 俯冲太快的那一下由它补足「看清是雁」。
 */
const meteor: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? 1.7;
  const r = k.rnd;
  const ox = DIVE.x + r.signed() * 0.5;
  const oz = DIVE.z + r.signed() * 0.5;
  const T0 = DIVE.time;
  const vx = -ox / T0;
  const vy = -(DIVE.y - 0.5) / T0;
  const vz = -oz / T0;
  goose(k, x + ox, DIVE.y, z + oz, vx, vy, vz, T0, 2.05, 1.08);
  // 翼尖拖尾：垂直于俯冲方向(水平面内)各偏半个翼展
  const hl = Math.hypot(ox, oz) || 1;
  const wx = (-oz / hl) * 0.72;
  const wz = (ox / hl) * 0.72;
  // 只画俯冲的后半程：整条路径都亮起来会读成两道从天而降的光线，抢了雁的戏
  for (const s of [1, -1]) k.ribbons.trace(R.thin, x + ox * 0.45 + wx * s, DIVE.y * 0.45 + 0.3, z + oz * 0.45 + wz * s, x + wx * s, 0.55, z + wz * s, T0 * 0.45, T.hot, T.glow);
  k.after(T0, () => {
    k.particles.use(P.hitFlash).tint(C.white, T.glow).spawn(x, 0.5, z, 0, 0, 0, FX_RULES.flashSkill, R0 * 0.7, R0 * 1.2);
    // 落地后舒翼一瞬：保持俯冲的朝向(速度与俯冲同向、只取百分之一)，放大着淡去
    goose(k, x, 0.6, z, vx * 0.012, vy * 0.012, vz * 0.012, 0.32, 2.0, 1.3);
    ring(k, x, z, R0, 0.36, T.glow, 1.8, 0.15, 0.3);
    waveRings(k, x, z, R0 * 0.62, 0.42, T.accent, 1, 1.5, false, 0.16, 0.03);
    dustPuff(k, x, 0.15, z, 2, 0.4, 1.0, C.sand, C.sandDark, 0.5);
    plumes(k, x, 0.9, z, 3, 1.6);
    k.light(x, z, 1.2, T.glow, 4, 6, 0.25);
    k.shake(0.08, x, z);
  });
};

export const XINGLI = {
  xingli_passive_burst: passiveBurst,
  xingli_s1_cast: s1Cast,
  xingli_s2_burst: s2Burst,
  xingli_ult_cast: ultCast,
  xingli_meteor: meteor,
} satisfies Record<string, FxHandler>;

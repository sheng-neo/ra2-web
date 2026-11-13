/**
 * 荆轲 · 墨紫 + 寒白：墨(笔触、飞白、溅开的墨点——全部是深色的遮挡层，不靠发光)、寒光(细而直的白线)、帛卷(米白长条)。
 * 不出现影烟、能量刃、十字斩和光柱。
 */
import { HEROES } from '../../../core/data/heroes';
import { FX_RULES, P, R, hitBurst, inkDots, inkSplat, inkStroke, swipeArc } from '../common';
import { DECAL } from '../decals';
import { MODE, SHAPE } from '../glow';
import { C, TAU, THEME, col } from '../util';
import { type FxHandler, castWidth, fixedValue, involvesPlayer, unitY } from './types';

const T = THEME.yeque;
const S1 = HEROES.yeque.skills.s1;
const S2 = HEROES.yeque.skills.s2;
const ULT = HEROES.yeque.skills.ult;
/** 帛卷：最长铺多远、全宽、铺开用时 */
const SCROLL = { max: 8, width: 0.8, unroll: 0.3 };
/** 旧帛的米黄。贴花着色器会给底衬掺一成多 A 色(这里是偏紫的墨)的色相，所以取得比目标色(#d9c9a3)再暖一点 */
const SILK_AGED = col(0xcdbf88);

/** 风萧易水 from → to：一笔横扫的浓墨(边缘飞白) + 中心一线寒白；地面留下一道墨迹笔触，沿途甩出墨点和两三道淡白风线 */
const s1Dash: FxHandler = (k, e, env) => {
  const from = e.from ?? e.pos;
  const to = e.to ?? e.pos;
  let dx = to.x - from.x;
  let dz = to.y - from.y;
  const dist = Math.hypot(dx, dz) || 0.01;
  dx /= dist;
  dz /= dist;
  const dur = dist / fixedValue(S1, 'dashSpeed');
  const r = k.rnd;
  // 半空的一笔墨：宽而暗的拖尾，随后被噪声侵蚀成飞白
  k.ribbons.trace(R.ink, from.x, 0.95, from.y, to.x, 0.95, to.y, dur);
  k.ribbons.trace(R.thin, from.x, 1.05, from.y, to.x, 1.05, to.y, dur, T.hot, T.accent);
  // 地上的笔触：起笔在出发点，行笔与位移同步
  inkStroke(k, from.x - dx * 0.5, from.y - dz * 0.5, to.x + dx * 0.7, to.y + dz * 0.7, castWidth(S1) * 0.62, 1.3, dur / 1.3, T.hot, 1.4, 0.8);
  inkSplat(k, from.x, 0.7, from.y, 1.1);
  // 墨点向两侧甩开
  const n = k.n(10);
  const p = k.particles.use(P.inkDot);
  for (let i = 0; i < n; i++) {
    const f = r.next();
    const side = r.chance(0.5) ? 1 : -1;
    const s = r.range(1.5, 4.5);
    const sz = r.range(0.09, 0.2);
    p.spawn(from.x + dx * dist * f, r.range(0.5, 1.2), from.y + dz * dist * f, -dz * side * s + dx * 2, r.range(0.5, 2.5), dx * side * s + dz * 2, r.range(0.35, 0.55), sz, sz * 0.7, f * dur);
  }
  // 两三道淡白的风线(易水的寒风)
  const w = k.particles.use(P.streak).tint(T.hot, T.accent);
  for (let i = 0; i < 3; i++) {
    const f = r.range(0.1, 0.7);
    const side = (i - 1) * 0.55;
    w.spawn(from.x + dx * dist * f - dz * side, r.range(0.5, 1.5), from.y + dz * dist * f + dx * side, dx * 13, 0, dz * 13, 0.18, 0.08, 0.02, f * dur);
  }
  k.after(dur, () => {
    k.particles.use(P.hitFlash).tint(C.white, T.hot).spawn(to.x, 1, to.y, 0, 0, 0, FX_RULES.flashBasic, 0.7, 1.2);
    inkDots(k, to.x, 0.8, to.y, 5, 5, dx, dz, 0.6);
  });
  if (e.unitId === env.playerId) k.shake(0.08, from.x, from.y);
};

/** 引匕一掷·出手 @pos, dir：三道扇形散开的寒白细光 + 手边一甩墨迹 */
const s2Cast: FxHandler = (k, e) => {
  const dx = e.dir?.x ?? 1;
  const dz = e.dir?.y ?? 0;
  const facing = Math.atan2(dz, dx);
  const x = e.pos.x + dx * 0.7;
  const z = e.pos.y + dz * 0.7;
  const y = 1.2;
  const spread = fixedValue(S2, 'spread');
  const p = k.particles.use(P.streak).tint(C.white, T.accent);
  for (let i = -1; i <= 1; i++) {
    const a = facing + i * spread;
    p.spawn(x, y, z, Math.cos(a) * 22, 0, Math.sin(a) * 22, 0.13, 0.09, 0.02);
    p.spawn(x, y, z, Math.cos(a) * 14, 0, Math.sin(a) * 14, 0.11, 0.07, 0.02, 0.02);
  }
  k.particles.use(P.hitFlash).tint(C.white, T.hot).spawn(x, y, z, 0, 0, 0, FX_RULES.flashBasic, 0.6, 1.0);
  // 甩墨：扇形飞出去的墨点 + 手边一小团
  inkDots(k, x, y, z, 7, 7, dx, dz, spread * 1.6);
  inkSplat(k, e.pos.x + dx * 0.3, 0.9, e.pos.y + dz * 0.3, 0.7, false);
};

/**
 * 图穷匕见·隐去 @pos, targetId：帛卷从脚下朝目标方向铺开(到目标为止，上限 8 米，0.3 秒由近及远)，
 * 人形散成一团墨，原地留一摊晕开的墨渍标出「他刚才在这里」。
 */
const ultVanish: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const r = k.rnd;
  // 方向与长度取事件里的 targetId；拿不到目标(已阵亡 / 不可见)时朝施放者面向铺一段短的
  let dx = 1;
  let dz = 0;
  let len = 3;
  if (k.anchor(e.unitId) && k.a.unit) {
    dx = Math.cos(k.a.unit.facing);
    dz = Math.sin(k.a.unit.facing);
  }
  if (k.anchor(e.targetId)) {
    const tx = k.a.x - x;
    const tz = k.a.z - z;
    const d = Math.hypot(tx, tz);
    if (d > 0.3) {
      dx = tx / d;
      dz = tz / d;
      len = Math.min(SCROLL.max, d);
    }
  }
  const vanish = fixedValue(ULT, 'vanish');
  const life = vanish + 0.45;
  const half = len / 2;
  k.decals
    .add(DECAL.scroll, x + dx * half, z + dz * half, half, life)
    // 四边形取帛宽的 1.8 倍：着色器里帛的中线会左右摆(见 DECAL.scroll)
    .rot(Math.atan2(dz, dx), (SCROLL.width * 0.5 * 1.8) / half)
    .params(Math.min(SCROLL.unroll, vanish) / life, r.next() * TAU)
    .color(C.ink, 1)
    // 帛色取旧帛的米黄(不是近白)，铺在水面上再淡一档——否则像漂着一块白木板
    .under(SILK_AGED, k.ctx.terrain.inWater(x + dx * half, z + dz * half) ? 0.42 : 0.52);
  // 人形散成墨：压矮的墨色漏斗迅速溶解 + 几团墨溅
  k.glow.spawn(SHAPE.cone, MODE.vortex, 0.38).at(x, 0.05, z).scale3(0.85, 1.7, 0.85, 0.3, 2.1, 0.3).color(C.ink, 1, 0.95).fade(0.04, 0.35).opt(0, 5, 1).spin(0, 11, 0);
  inkSplat(k, x, 1.1, z, 1.7);
  inkSplat(k, x + r.signed() * 0.3, 0.6, z + r.signed() * 0.3, 1.2, true, 0.05);
  inkDots(k, x, 1.0, z, 10, 4.5);
  // 墨渍：比隐身本身留得久一点
  k.decals.add(DECAL.scorch, x, z, 1.35, 1.5).color(C.black, 0).under(C.ink, 0.95);
  k.particles.use(P.hitFlash).tint(C.white, T.hot).spawn(x, 1.1, z, 0, 0, 0, FX_RULES.flashBasic, 0.6, 1.0);
};

/**
 * 图穷匕见·现身一击 @target, from → to：起点到落点的一道细白直线 → 目标身上一道自下而上的匕首寒光
 * → 五道短促的墨溅放射 + 几点朱砂 + 几片飘落的帛卷碎片。
 */
const ultStrike: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const from = e.from ?? e.pos;
  const to = e.to ?? e.pos;
  const y = unitY(k, e.targetId, 0.5, 1.1);
  const r = k.rnd;
  // 出手方向：从现身的位置(目标身后)指向目标
  let dx = x - to.x;
  let dz = z - to.y;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl;
  dz /= dl;
  const facing = Math.atan2(dz, dx);
  k.ribbons.trace(R.thin, from.x, 1.05, from.y, to.x, 1.05, to.y, 0.05, C.white, T.accent);
  // 匕首寒光：立着的一道窄弧，自下而上划过(只有一道，不是十字)
  swipeArc(k, x - dx * 1.7, y - 0.1, z - dz * 1.7 + 0.5, facing, 2.1, 0.24, T.hot, C.white, 1.25, -Math.PI / 2 + 0.4, false, 2.6);
  // 紧跟着一线向上的白光
  const w = k.particles.use(P.streak).tint(C.white, T.accent);
  w.spawn(x, y - 0.6, z, dx * 1.5, 16, dz * 1.5, 0.14, 0.11, 0.03, 0.03);
  w.spawn(x + dx * 0.15, y - 0.3, z + dz * 0.15, dx * 1.5, 11, dz * 1.5, 0.12, 0.08, 0.02, 0.05);
  hitBurst(k, x, y, z, 2.1, T.hot, T.accent, dx, dz, 9, FX_RULES.flashBig, 11);
  // 五道墨溅：以出手方向为中心的扇面上向外放射
  for (let i = 0; i < 5; i++) {
    const a = facing + (i - 2) * 0.62 + r.signed() * 0.18;
    const l = r.range(1.1, 1.9) * (i === 2 ? 1.3 : 1);
    // 笔触从外端「起笔」(粗、带一顿)收向目标(细)：读成甩出去的墨，而不是从目标身上长出来的刺
    inkStroke(k, x + Math.cos(a) * (0.3 + l), z + Math.sin(a) * (0.3 + l), x + Math.cos(a) * 0.2, z + Math.sin(a) * 0.2, r.range(0.55, 0.8), 1.5, 0);
  }
  inkSplat(k, x, y, z, 1.9);
  inkDots(k, x, y, z, 10, 7, dx, dz, 1.3);
  inkDots(k, x, y, z, 5, 5, dx, dz, 1.0, 0.02, C.cinnabar);
  // 帛卷碎片：在现身处缓缓飘落
  const s = k.particles.use(P.silk);
  for (let i = 0; i < k.n(5); i++) {
    const sz = r.range(0.16, 0.3);
    s.spawn(to.x + r.signed() * 0.6, r.range(1.2, 2.2), to.y + r.signed() * 0.6, r.signed() * 1.4, r.range(0.4, 1.8), r.signed() * 1.4, r.range(0.8, 1.2), sz, sz * 0.9, r.next() * 0.1);
  }
  k.decals.add(DECAL.scorch, x, z, 1.25, 2.2).color(C.black, 0).under(C.ink, 0.9);
  k.light(x, z, y, T.hot, FX_RULES.lightMax, 8, 0.3);
  k.shake(involvesPlayer(e, env) ? 0.4 : 0.25, x, z);
};

export const YEQUE = {
  yeque_s1_dash: s1Dash,
  yeque_s2_cast: s2Cast,
  yeque_ult_vanish: ultVanish,
  yeque_ult_strike: ultStrike,
} satisfies Record<string, FxHandler>;

/**
 * 程咬金 · 橙红：赤金斧弧、劲风、铁火星与尘土。三板斧招招是「抡」出来的，所以主体永远是一道厚重的斧弧；
 * 不出现火舌、火柱、火旋风和焦痕。
 */
import { HEROES } from '../../../core/data/heroes';
import { FX_RULES, P, R, SLASH_SPAN, dustRing, hitBurst, ironSparks, ring, slashArc } from '../common';
import { DECAL } from '../decals';
import type { FxMesh } from '../glow';
import type { FxKit } from '../kit';
import { C, TAU, THEME, col } from '../util';
import { type FxHandler, castRange, castWidth, fixedValue, involvesPlayer, unitY } from './types';

const T = THEME.chijin;
const S2 = HEROES.chijin.skills.s2;
const ULT = HEROES.chijin.skills.ult;
/** 赤金：斧刃的亮色(比主题的橙红更偏金) */
const GOLD = col(0xffc060);

/**
 * 一道厚重的斧弧 = 赤红弧身 + 叠在上面、先一步淡去的赤金刃光。flip = 自右向左扫(否则自左向右)。
 * 返回弧身实例(刃光与它同步)，调用方可以再改 spin / follow / k。
 */
function axeArc(k: FxKit, x: number, y: number, z: number, facing: number, radius: number, life: number, span: number, tilt: number, sweep: boolean, flip: boolean, into?: FxMesh[]): FxMesh {
  const roll = flip ? Math.PI + tilt : tilt;
  const body = slashArc(k, x, y, z, facing, radius, life, T.glow, 2.3, roll, sweep);
  body.scale(radius * 0.78, radius).k = span / SLASH_SPAN;
  // 刃光：同一道弧再叠一层赤金，略大一圈、先于弧身淡去——刚抡出来的一瞬是金的，随后只剩赤红的余势
  const edge = slashArc(k, x, y + 0.04, z, facing, radius * 1.03, life * 0.8, GOLD, 2.6, roll, sweep, 0.95);
  edge.scale(radius * 0.8, radius * 1.03).k = span / SLASH_SPAN;
  edge.fade(0.02, 0.3);
  if (into) into.push(body, edge);
  return body;
}

/** 沿弧线依次扬起的尘土与火星：from → to 是扫过的角度区间(模拟层角度)，dur 内依次出现 */
function sweepDust(k: FxKit, x: number, z: number, radius: number, from: number, to: number, dur: number, count: number): void {
  const r = k.rnd;
  const n = k.n(count);
  const dir = Math.sign(to - from) || 1;
  for (let i = 0; i < n; i++) {
    const t = (i + r.next()) / n;
    const a = from + (to - from) * t;
    const d = radius * r.range(0.7, 0.98);
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    // 切向 = 斧刃走过的方向
    const tx = -Math.sin(a) * dir;
    const tz = Math.cos(a) * dir;
    const delay = t * dur;
    k.particles.use(P.dust).spawn(px, 0.2, pz, tx * 2.2 + Math.cos(a) * 1.2, r.range(0.6, 1.6), tz * 2.2 + Math.sin(a) * 1.2, r.range(0.45, 0.7), 0.6, 1.3, delay);
    if (i % 2 === 0) k.particles.use(P.spark).tint(GOLD, T.deep).spawn(px, r.range(0.3, 0.9), pz, tx * r.range(5, 9), r.range(1, 3.5), tz * r.range(5, 9), 0.26, 0.11, 0.04, delay);
  }
}

/** 越砍越勇·重斧命中 @target：一道粗重的竖劈斧光 + 铁火星(回血的绿光由通用 heal 负责) */
const passiveHit: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const y = unitY(k, e.targetId, 0.5, 1);
  let facing = 0;
  if (k.anchor(e.unitId)) facing = Math.atan2(z - k.a.z, x - k.a.x);
  const dx = Math.cos(facing);
  const dz = Math.sin(facing);
  // 竖劈：把水平的斩弧滚转 90° 立起来，自上而下扫过
  axeArc(k, x - dx * 1.25, y + 0.25, z - dz * 1.25, facing, 2.0, 0.2, 2.1, Math.PI / 2, true, false);
  hitBurst(k, x, y, z, 1.7, GOLD, T.deep, dx, dz, 9, FX_RULES.flashSkill, 10);
  ironSparks(k, x, y - 0.2, z, 8, 8, GOLD, T.deep, dx, dz, 0.5);
  // 斧刃劈进地里的一道短痕
  k.decals.add(DECAL.streak, x + dx * 0.4, z + dz * 0.4, 1.3, 0.5).rot(facing, 0.16).params(0, 0).color(T.glow, 1.6).under(T.dark, 0.6);
  ring(k, x, z, 1.3, 0.26, T.glow, 1.3, 0.25, 0.25);
  if (involvesPlayer(e, env)) k.shake(0.1, x, z);
};

/** 拦腰一斧 @pos, dir, radius, angle：扇形贴花(角度与半径精确) + 一道厚斧弧自右向左扫过 + 沿弧扬起的尘土与火星 */
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
  k.decals.add(DECAL.cone, x, z, R0, 0.6).rot(facing).params(half, 0).color(T.glow, 1.8).under(T.dark, 0.5);
  // 斧弧：从身体右侧抡到左侧(俯视下 = 角度从 +half 到 −half)，0.22 秒扫完
  axeArc(k, x, 1.0, z, facing, R0, 0.3, angle, 0.06, true, true);
  sweepDust(k, x, z, R0, facing + half, facing - half, 0.13, 14);
  // 劲风：几道贴着弧走的白色风线
  const p = k.particles.use(P.streak).tint(C.white, T.hot);
  const n = k.n(6);
  for (let i = 0; i < n; i++) {
    const t = r.next();
    const a = facing + half - angle * t;
    const d = R0 * r.range(0.55, 0.9);
    p.spawn(x + Math.cos(a) * d, r.range(0.6, 1.5), z + Math.sin(a) * d, Math.sin(a) * 11, r.signed() * 0.6, -Math.cos(a) * 11, 0.14, 0.1, 0.03, t * 0.12);
  }
  k.particles.use(P.hitFlash).tint(C.white, GOLD).spawn(x + dx * 1.1, 1.1, z + dz * 1.1, 0, 0, 0, FX_RULES.flashSkill, 1.0, 1.7);
  k.light(x + dx * R0 * 0.5, z + dz * R0 * 0.5, 1.5, T.glow, 7, R0 * 1.6, 0.3);
  k.shake(involvesPlayer(e, env) ? FX_RULES.shakeSkill : 0.06, x, z);
};

/** 半路杀出 from → to：赤金拖尾 + 尘迹，路径上三道依次淡出的斧影小弧 */
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
  // 起步：蹬起的尘土
  const p = k.particles.use(P.dust);
  for (let i = 0; i < k.n(5); i++) p.spawn(from.x + r.signed() * 0.4, r.range(0.1, 0.5), from.y + r.signed() * 0.4, -dx * r.range(2, 5) + r.signed(), r.range(0.4, 1.6), -dz * r.range(2, 5) + r.signed(), r.range(0.45, 0.75), 0.6, 1.4);
  k.decals
    .add(DECAL.streak, (from.x + to.x) / 2, (from.y + to.y) / 2, dist / 2 + 0.4, 0.6)
    .rot(facing, (castWidth(S2) * 0.4) / (dist / 2 + 0.4))
    .params(0.6, 0.6 / dur)
    .color(T.glow, 1.5, 0.85)
    .under(T.dark, 0.45);
  if (k.anchor(id)) {
    k.trail(id, R.dust, dur + 0.05, 0.45);
    k.trail(id, R.energy, dur + 0.06, 1.2, GOLD, T.deep);
  }
  // 三道斧影：一路劈过去，左右交替、立着的小弧
  for (let i = 0; i < 3; i++) {
    const f = 0.28 + i * 0.26;
    const px = from.x + dx * dist * f;
    const pz = from.y + dz * dist * f;
    const m = axeArc(k, px - dx * 0.7, 1.05, pz - dz * 0.7, facing, 1.35, 0.3, 1.9, (i % 2 === 0 ? 1 : -1) * 1.05, true, i % 2 === 1);
    m.delay(f * dur);
    ironSparks(k, px, 0.9, pz, 2, 6, GOLD, T.deep, dx, dz, 0.6);
  }
  k.after(dur, () => {
    k.particles.use(P.hitFlash).tint(C.white, GOLD).spawn(to.x, 1, to.y, 0, 0, 0, FX_RULES.flashBasic, 0.9, 1.4);
    ironSparks(k, to.x, 0.8, to.y, 5, 7, GOLD, T.deep, dx, dz, 0.5);
    const q = k.particles.use(P.dust);
    for (let i = 0; i < k.n(3); i++) q.spawn(to.x + r.signed() * 0.3, 0.2, to.y + r.signed() * 0.3, dx * r.range(1, 3), r.range(0.4, 1.2), dz * r.range(1, 3), 0.5, 0.6, 1.3);
  });
  if (e.unitId === env.playerId) k.shake(0.08, from.x, from.y);
};

/** 抡圆了砍·起手 @unit：一圈向外的劲风环 + 尘环，两道斧影起转 */
const ultStart: FxHandler = (k, e, env) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = castRange(ULT);
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  const r = k.rnd;
  ring(k, x, z, R0, 0.42, T.glow, 1.9, 0.12, 0.4);
  dustRing(k, x, z, 12, 0.8, 6.5, C.dust, C.dustDark, 1.3, 0.7);
  // 劲风：贴地向外旋开的风线
  const p = k.particles.use(P.streak).tint(C.white, T.hot);
  const n = k.n(12);
  for (let i = 0; i < n; i++) p.orbit(x, r.range(0.3, 1.6), z, R0 * r.range(0.15, 0.3), R0 * r.range(0.8, 1.05), r.next() * TAU, -8, r.range(0, 1), r.range(0.26, 0.36), 0.14, 0.04);
  // 两道斧影从身侧起转(之后由每跳的斧弧接上)
  const a0 = has && k.a.unit ? k.a.unit.facing : 0;
  for (let i = 0; i < 2; i++) {
    const parts: FxMesh[] = [];
    axeArc(k, has ? 0 : x, 1.0 + i * 0.3, has ? 0 : z, a0 + i * Math.PI, R0 * 0.75, 0.4, 1.9, i === 0 ? 0.1 : -0.1, false, false, parts);
    for (const m of parts) {
      m.spin(0, 13, 0).scale(R0 * 0.35, R0 * 0.95).fade(0.1, 0.5);
      if (has) m.follow(id);
    }
  }
  k.particles.use(P.hitFlash).tint(C.white, GOLD).spawn(x, 1.2, z, 0, 0, 0, FX_RULES.flashBig, 1.6, 2.6);
  ironSparks(k, x, 1, z, 10, 9, GOLD, T.deep);
  k.light(x, z, 1.8, T.glow, FX_RULES.lightMax, 10, 0.35);
  k.shake(involvesPlayer(e, env) ? 0.3 : 0.15, x, z);
};

/** 抡圆了砍·每跳 @pos, radius：淡淡的赤金环 + 两道对称的斧刃弧(主体) + 沿切线甩出去的铁火星 */
const ultTick: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const R0 = e.radius ?? 4.2;
  const r = k.rnd;
  const id = e.unitId ?? -1;
  const has = k.anchor(id);
  const rp = k.decals.add(DECAL.ring, x, z, R0, 0.3).params(0.55, 1).color(T.glow, 1.2, 0.7).under(T.dark, 0.2);
  if (has) rp.follow(id);
  const a0 = r.next() * TAU;
  for (let i = 0; i < 2; i++) {
    const parts: FxMesh[] = [];
    axeArc(k, has ? 0 : x, 0.95 + i * 0.4, has ? 0 : z, a0 + i * Math.PI, R0 * 0.97, 0.32, 2.0, i === 0 ? 0.1 : -0.1, false, false, parts);
    for (const m of parts) {
      m.spin(0, 15, 0).fade(0.12, 0.45);
      if (has) m.follow(id);
    }
  }
  // 沿切线甩出去的铁火星
  const p = k.particles.use(P.spark).tint(GOLD, T.deep);
  const n = k.n(8);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const d = R0 * r.range(0.8, 1);
    p.spawn(x + Math.cos(a) * d, r.range(0.5, 1.5), z + Math.sin(a) * d, Math.sin(a) * r.range(6, 10), r.range(0.5, 3), -Math.cos(a) * r.range(6, 10), r.range(0.2, 0.3), 0.12, 0.04);
  }
};

export const CHIJIN = {
  chijin_passive_hit: passiveHit,
  chijin_s1_slash: s1Slash,
  chijin_s2_dash: s2Dash,
  chijin_ult_start: ultStart,
  chijin_ult_tick: ultTick,
} satisfies Record<string, FxHandler>;

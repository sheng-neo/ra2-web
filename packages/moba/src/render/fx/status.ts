/**
 * 状态特效：挂在单位身上的 buff 表现，随 buff 出现而建立、消失而回收，只画对玩家可见的存活单位。
 * 层数类(余音 / 猿臂连射 / 防御塔锁定)用对应数量的图标直接表达层数。
 */
import type * as THREE from 'three';
import { TICK_DT, type Buff, type BuffId } from '../../core/types';
import type { FrameInfo } from '../engine/context';
import type { UnitAnchor } from './anchors';
import { P } from './common';
import { DECAL } from './decals';
import { MODE, SHAPE, type FxMesh } from './glow';
import type { FxKit } from './kit';
import { SPRITE } from './textures';
import { C, TAU, THEME, col, teamTheme } from './util';

interface StatusView {
  key: number;
  def: StatusDef;
  seen: number;
  slots: number[];
  meshes: FxMesh[];
  acc: number;
  age: number;
  phase: number;
}

interface StatusDef {
  create?(k: FxKit, v: StatusView, a: UnitAnchor, b: Buff): void;
  update(k: FxKit, v: StatusView, a: UnitAnchor, b: Buff, dt: number): void;
  end?(k: FxKit, v: StatusView): void;
}

const GOLD = col(0xffd04a);
const STUN = col(0xffc81e);
const GOLD_HOT = col(0xfff2b0);
const ROOT = THEME.panyue;
const FROST = col(0x58c0ff);
const FROST_DEEP = col(0x2a6cf0);
const SHIELD = col(0xa8d8ff);
const SHIELD_AMBER = col(0xffc060);
const EMBER = col(0xff6a2a);
const EMBER_HOT = col(0xffc070);
const RECALL = col(0x58b4ff);
const HEAL = col(0x58f088);
const HEAL_DEEP = col(0x1fc060);
const SHADOW = THEME.yeque;
const WIND = THEME.fengling;
const MARK = THEME.xingli;
const LOCK = col(0xff3a28);
/** 程咬金斧刃的赤金 */
const AXE_GOLD = col(0xffc060);
/**
 * 英雄状态的脚环半径 = 单位半径 × 这个倍率：压在队伍环(1.3 倍)以内，不和增益环(1.6 / 1.85 / 2.1 倍)抢位置。
 */
const HERO_RING = 1.22;

/** 从 t0 起 0.22 秒的一下闪光(0..1，先快后慢地亮起再熄灭) */
function glintAt(age: number, t0: number): number {
  const t = (age - t0) / 0.22;
  return t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI);
}

/** 按每秒 rate 个的速率，本帧该发射几个(受画质倍率影响)。用返回值驱动循环，不为每帧每个状态分配闭包 */
function due(k: FxKit, v: StatusView, dt: number, rate: number): number {
  v.acc += dt * rate * k.density;
  const n = Math.floor(v.acc);
  v.acc -= n;
  return n;
}

function holdDecal(k: FxKit, v: StatusView, type: number, fadeIn = 0.15): number {
  const s = k.decals.hold(type, fadeIn);
  v.slots.push(s);
  return s;
}

/**
 * 增益脚环(§5.7)：按半径分层，可以同时显示——队伍环 1.3 倍单位半径(单位视图画) → 蓝buff 1.6 → 红buff 1.85 → 巨灵 2.1。
 * 纹章细环只画外圈一条带，中心留空，不压英雄脚下；剩 5 秒时闪烁提醒。
 */
const RING_SCALE = { frost: 1.6, ember: 1.85, star: 2.1 } as const;
/** 环的最小半径(米)：英雄半径只有 0.6 左右，按倍数算出来的环会被模型挡住 */
function ringRadius(a: UnitAnchor, mult: number): number {
  return Math.max(a.radius * mult, 0.75 + (mult - 1.3) * 0.9) + 0.15;
}
function expiring(v: StatusView, b: Buff): number {
  return b.timeLeft < 5 && Number.isFinite(b.timeLeft) ? 0.55 + 0.45 * Math.cos(v.age * 9) : 1;
}

function sigilRing(pattern: number, color: THREE.Color, hot: THREE.Color, mult: number, spin: number, sprite: number): StatusDef {
  return {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.sigil, 0.3);
      k.decals.at(s).y(0.065).params(pattern, 1).color(color, 1.7, 0.85).under(C.shadow, 0.3);
    },
    update(k, v, a, b, dt) {
      const blink = expiring(v, b);
      const rr = ringRadius(a, mult);
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(rr).rot(v.age * spin).alpha(0.85 * blink);
      // 一枚绕身的小图标：远看、被模型挡住脚环时也能认出是哪种增益
      const ang = v.phase + v.age * 2 * Math.sign(spin);
      const r = a.radius + 0.5;
      k.sprites.icon(sprite, a.x + Math.cos(ang) * r, a.y + a.height * 0.42 + Math.sin(v.age * 3) * 0.1, a.z + Math.sin(ang) * r, 0.46, 0, hot, 1.2, 0.85 * blink, 0.25, 0.2);
      if (pattern === 0) {
        // 贴地冷雾
        for (let n = due(k, v, dt, 1.6); n > 0; n--) {
          const t = k.rnd.next() * TAU;
          k.particles.use(P.puff).tint(C.frostHot, C.frost).spawn(a.x + Math.cos(t) * rr * 0.8, a.y + 0.15, a.z + Math.sin(t) * rr * 0.8, Math.cos(t) * 0.3, 0.05, Math.sin(t) * 0.3, 1.2, 0.6, 1.4);
        }
      } else {
        // 零星上飘的余烬
        for (let n = due(k, v, dt, 3); n > 0; n--) {
          const t = k.rnd.next() * TAU;
          k.particles.use(P.ember).tint(hot, color).spawn(a.x + Math.cos(t) * rr * 0.85, a.y + 0.15, a.z + Math.sin(t) * rr * 0.85, 0, k.rnd.range(0.8, 1.6), 0, 0.8, 0.12, 0.04);
        }
      }
    },
  };
}

const DEFS: Partial<Record<BuffId, StatusDef>> = {
  // 眩晕：头顶旋转星(绕在头的高度，比血条低，不会被叠加层盖住)
  stun: {
    create(k, _v, a) {
      // 被晕住的一瞬：头上炸开几道折线闪电
      const y = a.y + a.height * 0.9;
      const p = k.particles.use(P.bolt).tint(STUN, GOLD);
      for (let i = 0; i < 4; i++) {
        const ang = (i * TAU) / 4 + 0.6;
        p.spawn(a.x + Math.cos(ang) * 0.5, y + 0.2, a.z + Math.sin(ang) * 0.3, Math.cos(ang) * 2.5, 1.5, Math.sin(ang) * 1.5, 0.3, 0.5, 0.8);
      }
      k.particles.use(P.flash).tint(STUN).spawn(a.x, y, a.z, 0, 0, 0, 0.2, 0.8, 1.6);
    },
    update(k, v, a, _b, dt) {
      const y = a.y + a.height * 0.9;
      const r = 0.5 + a.radius * 0.45;
      for (let i = 0; i < 3; i++) {
        const ang = v.age * 5.2 + (i * TAU) / 3;
        // 压扁的椭圆轨道：像在头顶绕圈；转到后半圈时略小略暗
        const back = Math.sin(ang) < 0 ? 0.75 : 1;
        k.sprites.icon(SPRITE.star, a.x + Math.cos(ang) * r, y + Math.sin(ang) * 0.14, a.z + Math.sin(ang) * r * 0.5, 0.62 * back, ang * 1.3, STUN, 1.25, back, 0.15, 0.6);
      }
      for (let n = due(k, v, dt, 5); n > 0; n--) k.particles.use(P.glint).tint(GOLD_HOT, GOLD).spawn(a.x + k.rnd.signed() * r, y, a.z + k.rnd.signed() * r * 0.5, 0, 0.5, 0, 0.4, 0.26, 0.06);
    },
  },
  // 击飞：模型由单位视图抛起，这里补地面的落点暗影与上卷的气流
  airborne: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.glow, 0.05);
      k.decals.at(s).params(1.2).color(C.black, 0, 0.9).under(C.shadow, 0.7);
    },
    update(k, v, a, _b, dt) {
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius + 0.7);
      for (let n = due(k, v, dt, 16); n > 0; n--) {
        const t = k.rnd.next() * TAU;
        k.particles.use(P.streak).tint(C.white, C.dust).spawn(a.x + Math.cos(t) * a.radius, 0.2, a.z + Math.sin(t) * a.radius, 0, k.rnd.range(4, 8), 0, 0.25, 0.1, 0.04);
      }
    },
  },
  // 定身：脚下岩晶锁
  root: {
    create(k, v, a) {
      const s = holdDecal(k, v, DECAL.range, 0.1);
      k.decals.at(s).params(0.05, 8).color(ROOT.glow, 1.8, 0.95).under(C.shadow, 0.45);
      for (let i = 0; i < 4; i++) {
        const m = k.glow.hold(SHAPE.spike, MODE.plain);
        m.color(C.white, 1);
        v.meshes.push(m);
      }
      k.particles.use(P.dust);
      for (let i = 0; i < 4; i++) k.particles.spawn(a.x + k.rnd.signed() * 0.5, 0.2, a.z + k.rnd.signed() * 0.5, k.rnd.signed(), 1, k.rnd.signed(), 0.5, 0.5, 1.1);
    },
    update(k, v, a) {
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius + 0.6);
      const grow = Math.min(1, v.age * 7);
      for (let i = 0; i < v.meshes.length; i++) {
        const ang = v.phase + (i * TAU) / v.meshes.length;
        const d = a.radius + 0.25;
        // 四根岩晶向内倾斜，像爪子一样扣住脚
        v.meshes[i].at(a.x + Math.cos(ang) * d, -0.03, a.z + Math.sin(ang) * d).scale3(0.42, (0.85 + (i % 2) * 0.3) * grow, 0.42).rot(0, -ang, 0.38);
      }
    },
    end(k, v) {
      for (const m of v.meshes) {
        k.particles.use(P.debris);
        for (let i = 0; i < 2; i++) k.particles.spawn(m.x, 0.5, m.z, k.rnd.signed() * 2, k.rnd.range(1, 3), k.rnd.signed() * 2, 0.6, 0.2, 0.16);
      }
    },
  },
  // 减速：脚下冰蓝减速环
  slow: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.swirl, 0.15);
      k.decals.at(s).params(5, -1.5).color(FROST, 1.0, 0.75).under(FROST_DEEP, 0.15);
      const e = holdDecal(k, v, DECAL.range, 0.15);
      k.decals.at(e).params(0.04, 0).color(FROST, 1.4, 0.75).under(C.shadow, 0.2);
    },
    update(k, v, a, b, dt) {
      // 减速越重，环越大越亮
      const strength = Math.min(1, 0.5 + b.value);
      const rad = a.radius + 0.4 + b.value * 0.5;
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(rad).alpha(0.45 + 0.3 * strength);
      k.decals.at(v.slots[1]).at(a.x, a.z).radius(rad);
      for (let n = due(k, v, dt, 3); n > 0; n--) {
        const t = k.rnd.next() * TAU;
        k.particles.use(P.frost).spawn(a.x + Math.cos(t) * rad * 0.8, a.y + k.rnd.range(0.1, 0.5), a.z + Math.sin(t) * rad * 0.8, 0, 0.5, 0, 0.8, 0.3, 0.14);
      }
    },
  },
  // 护盾：半透明六边形护罩
  shield: {
    create(k, v, a, b) {
      const m = k.glow.hold(SHAPE.sphere, MODE.hex);
      // 磐岳自己的壁垒是琥珀色，其余护盾是冰蓝白
      const src = k.anchors.unit(b.sourceId);
      const amber = src !== undefined && src.kind === 'hero' && src.heroId === 'panyue';
      m.color(amber ? SHIELD_AMBER : SHIELD, 1.25, 0);
      m.add = 0.4;
      v.meshes.push(m);
      void a;
    },
    update(_k, v, a, b) {
      const m = v.meshes[0];
      const grow = Math.min(1, v.age * 8);
      // 快到期时闪烁提醒
      const blink = b.timeLeft < 0.8 ? 0.6 + 0.4 * Math.sin(v.age * 22) : 1;
      const r = (a.radius + 0.75) * (0.6 + 0.4 * grow);
      m.at(a.x, a.y + a.height * 0.46, a.z).scale3(r, Math.max(r, a.height * 0.56), r);
      m.rot(0, v.age * 0.5, 0);
      m.a = 0.85 * grow * blink;
    },
  },
  // 加速：风痕(移动时在身后拉出一道道流线；站定时脚边几道打转的细风线——不再用绕飞的风叶)
  haste: {
    update(k, v, a, _b, dt) {
      const u = a.unit;
      if (!u) return;
      const vx = (u.pos.x - u.prevPos.x) / TICK_DT;
      const vz = (u.pos.y - u.prevPos.y) / TICK_DT;
      const sp = Math.hypot(vx, vz);
      for (let n = due(k, v, dt, sp > 0.5 ? 26 : 8); n > 0; n--) {
        const r = k.rnd;
        const ox = r.signed() * (a.radius + 0.35);
        const oz = r.signed() * (a.radius + 0.35);
        if (sp > 0.5) {
          k.particles
            .use(P.streak)
            .tint(WIND.glow, WIND.deep)
            .spawn(a.x + ox - (vx / sp) * 0.4, a.y + r.range(0.2, 1.6), a.z + oz - (vz / sp) * 0.4, -vx * 0.7, r.signed() * 0.3, -vz * 0.7, 0.34, 0.2, 0.07);
        } else k.particles.use(P.streak).tint(C.white, WIND.glow).orbit(a.x, a.y + r.range(0.15, 0.6), a.z, a.radius + 0.3, a.radius + 0.55, r.next() * TAU, 8, r.range(0.3, 1), 0.3, 0.14, 0.04);
      }
    },
  },
  // 灼烧：身上的火苗
  burn: {
    update(k, v, a, _b, dt) {
      for (let n = due(k, v, dt, 18); n > 0; n--) {
        const r = k.rnd;
        const x = a.x + r.signed() * a.radius * 0.8;
        const z = a.z + r.signed() * a.radius * 0.8;
        const y = a.y + r.range(0.2, a.height * 0.7);
        if (r.chance(0.7)) k.particles.use(P.flame).spawn(x, y, z, 0, r.range(1, 2.2), 0, r.range(0.35, 0.55), 0.95, 0.4);
        else k.particles.use(P.ember).tint(EMBER_HOT, EMBER).spawn(x, y, z, r.signed() * 0.5, r.range(1, 2.5), r.signed() * 0.5, 0.6, 0.13, 0.04);
      }
    },
  },
  // 不可选中(荆轲隐入图卷的那一瞬)：脚下一摊墨 + 身周散开的墨点，不再是紫色影烟
  untargetable: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.glow, 0.1);
      k.decals.at(s).params(1.2).color(C.black, 0, 0.9).under(C.ink, 0.75);
    },
    update(k, v, a, _b, dt) {
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius + 0.8);
      for (let n = due(k, v, dt, 20); n > 0; n--) {
        const r = k.rnd;
        const t = r.next() * TAU;
        const d = a.radius * r.range(0.5, 1.2);
        const sz = r.range(0.1, 0.22);
        k.particles.use(P.inkRise).spawn(a.x + Math.cos(t) * d, a.y + r.range(0.1, 1.5), a.z + Math.sin(t) * d, r.signed() * 0.4, r.range(0.4, 1.2), r.signed() * 0.4, 0.5, sz, sz * 1.6);
      }
    },
  },
  // 免疫控制：身周上升的金色流光 + 脚下金环
  unstoppable: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.range, 0.1);
      k.decals.at(s).params(0.05, 12).color(GOLD, 1.6, 0.9).under(C.shadow, 0.3);
    },
    update(k, v, a, _b, dt) {
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius + 0.7);
      for (let n = due(k, v, dt, 22); n > 0; n--) {
        const t = k.rnd.next() * TAU;
        const d = a.radius + 0.35;
        k.particles.use(P.streak).tint(GOLD_HOT, GOLD).spawn(a.x + Math.cos(t) * d, a.y + 0.1, a.z + Math.sin(t) * d, 0, k.rnd.range(3.5, 6.5), 0, 0.4, 0.14, 0.05);
      }
    },
  },
  // 回城：脚下逐渐收拢的上升光环
  recall: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.rune, 0.3);
      k.decals.at(s).params(6, 1.6).color(RECALL, 1.7, 0.9).under(C.shadow, 0.3);
      const m = k.glow.hold(SHAPE.pillar, MODE.pillar);
      m.color(RECALL, 1.1, 0);
      m.add = 0.3;
      m.k = 1.2;
      v.meshes.push(m);
    },
    update(k, v, a, b, dt) {
      const t = b.duration > 0 ? 1 - b.timeLeft / b.duration : 0;
      // 符文环与光环随引导进度由外向内收拢，光柱越来越亮
      const rad = 1.9 - 0.9 * t;
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(rad + 0.2);
      const m = v.meshes[0];
      m.at(a.x, 0.05, a.z).scale3(rad * 0.62, 3 + 5 * t, rad * 0.62);
      m.a = 0.2 + 0.65 * t;
      for (let n = due(k, v, dt, 2.4 + t * 2); n > 0; n--) {
        k.glow.spawn(SHAPE.hoop, MODE.hoop, 0.9).at(a.x, 0.15, a.z).vel(0, 2.6 + t * 2, 0).scale(rad, rad * 0.6).color(RECALL, 1.2, 0.9).fade(0.15, 0.5).opt(0.3, 2, 1);
        for (let i = 0; i < 3; i++) k.particles.use(P.glint).tint(C.white, RECALL).orbit(a.x, 0.1, a.z, rad, rad * 0.4, k.rnd.next() * TAU, 5, k.rnd.range(2, 4), 0.8, 0.3, 0.08);
      }
    },
  },
  // 恢复：上升的绿色光点
  restore: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.glow, 0.2);
      k.decals.at(s).params(1.3).color(HEAL, 1.1, 0.85).under(C.black, 0);
    },
    update(k, v, a, _b, dt) {
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius + 0.9);
      // 每 0.7 秒一道上升的绿环
      const beat = Math.floor(v.age / 0.7);
      if (beat !== Math.floor((v.age - dt) / 0.7) || v.age <= dt) {
        k.glow.spawn(SHAPE.hoop, MODE.hoop, 0.8).at(a.x, a.y + 0.2, a.z).vel(0, 2.2, 0).scale(a.radius + 0.5, a.radius + 0.25).color(HEAL, 1.0, 0.9).fade(0.15, 0.5).opt(0.3, 2, 1);
      }
      for (let n = due(k, v, dt, 16); n > 0; n--) {
        const r = k.rnd;
        const t = r.next() * TAU;
        const d = r.range(0.5, a.radius + 0.6);
        if (r.chance(0.3)) k.particles.use(P.plus).spawn(a.x + Math.cos(t) * d, a.y + r.range(0.3, 1), a.z + Math.sin(t) * d, 0, r.range(1, 1.8), 0, 0.8, 0.26, 0.4);
        else k.particles.use(P.glint).tint(HEAL, HEAL_DEEP).spawn(a.x + Math.cos(t) * d, a.y + r.range(0.1, 0.8), a.z + Math.sin(t) * d, 0, r.range(1.2, 2.4), 0, 0.8, 0.34, 0.08);
      }
    },
  },
  // 泉水回复：脚边淡淡的队伍色光点
  fountain: {
    update(k, v, a, _b, dt) {
      const th = teamTheme(a.unit ? a.unit.team : 2);
      for (let n = due(k, v, dt, 8); n > 0; n--) {
        const t = k.rnd.next() * TAU;
        k.particles.use(P.glint).tint(th.glow, th.deep).spawn(a.x + Math.cos(t) * (a.radius + 0.3), a.y + 0.1, a.z + Math.sin(t) * (a.radius + 0.3), 0, k.rnd.range(1, 2.2), 0, 0.9, 0.32, 0.08);
      }
    },
  },
  // 复活保护：金色光晕
  respawn_guard: {
    create(k, v) {
      const m = k.glow.hold(SHAPE.sphere, MODE.rim);
      m.color(GOLD, 1.2, 0);
      m.add = 0.4;
      m.k = 2.6;
      v.meshes.push(m);
      const s = holdDecal(k, v, DECAL.range, 0.1);
      k.decals.at(s).params(0.04, 0).color(GOLD, 1.7, 0.9).under(C.shadow, 0.25);
    },
    update(k, v, a, _b, dt) {
      const m = v.meshes[0];
      const pulse = 1 + 0.05 * Math.sin(v.age * 6);
      const r = (a.radius + 0.85) * pulse;
      m.at(a.x, a.y + a.height * 0.46, a.z).scale3(r, Math.max(r, a.height * 0.58), r);
      m.a = 0.75;
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius + 0.9);
      for (let n = due(k, v, dt, 6); n > 0; n--) {
        const t = k.rnd.next() * TAU;
        k.particles.use(P.glint).tint(GOLD_HOT, GOLD).spawn(a.x + Math.cos(t) * r, a.y + k.rnd.range(0.2, 1.8), a.z + Math.sin(t) * r, 0, 0.8, 0, 0.6, 0.26, 0.06);
      }
    },
  },
  // 霜晶之智(蓝buff)：缓慢旋转的六角霜纹细环 + 贴地冷雾
  frost_insight: sigilRing(0, FROST_DEEP, FROST, RING_SCALE.frost, 0.35, SPRITE.frost),
  // 炽焰之力(红buff)：三焰纹细环 + 零星余烬(普攻命中的火星由命中特效补)
  ember_might: sigilRing(1, EMBER, EMBER_HOT, RING_SCALE.ember, -0.45, SPRITE.flame),
  // 星陨祝福：金色八芒星轨环(每 2 秒向外一道细脉冲，着色器里做) + 3 颗小星沿倾斜轨道绕身(low 档 1 颗)
  star_blessing: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.sigil, 0.3);
      k.decals.at(s).y(0.068).params(2, 1).color(GOLD, 1.5, 0.75).under(C.shadow, 0.25);
    },
    update(k, v, a, b) {
      const blink = expiring(v, b);
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(ringRadius(a, RING_SCALE.star)).rot(v.age * 0.25).alpha(0.75 * blink);
      const n = k.lowQ ? 1 : 3;
      const rr = a.radius + 0.55;
      for (let i = 0; i < n; i++) {
        const ang = v.phase + v.age * 1.7 + (i * TAU) / 3;
        // 倾斜的轨道：转到前半圈时低、后半圈时高
        const y = a.y + a.height * (0.45 + 0.18 * Math.sin(ang + 0.6));
        k.sprites.icon(SPRITE.star8, a.x + Math.cos(ang) * rr, y, a.z + Math.sin(ang) * rr, 0.42, v.age * 0.8, STUN, 1.3, 0.95 * blink, 0.15, 0.2);
      }
    },
  },
  // 王昭君·余音：脚下 1~3 圈同心细环(圈数 = 层数，压在队伍环以内) + 绕身同样数量的金色音珠(头顶的层数记号由叠加层画)
  xingli_mark: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.rings, 0.15);
      k.decals.at(s).y(0.07).params(1, 1).color(MARK.hot, 1.6, 0.9).under(MARK.dark, 0.3);
    },
    update(k, v, a, b) {
      const n = Math.max(1, Math.min(3, b.stacks));
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius * HERO_RING).params(n, 1).alpha(n >= 3 ? 1 : 0.8);
      const pop = Math.min(1, v.age * 8);
      const r = a.radius + 0.5;
      for (let i = 0; i < n; i++) {
        const ang = v.phase + v.age * 2.6 + (i * TAU) / 3;
        const s = 0.42 * (i === n - 1 ? 0.6 + 0.4 * pop : 1);
        const y = a.y + a.height * 0.55 + Math.sin(v.age * 3.2 + i * 2.1) * 0.12;
        k.sprites.icon(SPRITE.glow, a.x + Math.cos(ang) * r, y, a.z + Math.sin(ang) * r, s * 1.5, 0, MARK.accent, 1.9, 1, 0.5, 0.2);
      }
    },
  },
  // 防御塔锁定：脚下红色锁定圈，层数越高转得越急(层数数字由叠加层画在名字上方)
  tower_focus: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.lock, 0.1);
      k.decals.at(s).y(0.075).color(LOCK, 1.8, 0.95).under(C.shadow, 0.45);
    },
    update(k, v, a, b) {
      const n = Math.min(5, Math.max(1, b.stacks));
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius + 0.55 + 0.06 * n).alpha(0.7 + 0.3 * Math.abs(Math.sin(v.age * (3 + n))));
      // 身侧的小红菱 = 层数
      const r = a.radius + 0.5;
      for (let i = 0; i < n; i++) {
        const ang = v.phase - v.age * 3 + (i * TAU) / n;
        k.sprites.icon(SPRITE.diamond, a.x + Math.cos(ang) * r, a.y + 0.4, a.z + Math.sin(ang) * r, 0.4, 0, LOCK, 1.3, 1, 0.2, 0.2);
      }
    },
  },
  // 樊哙：第三击(覆盾震地)就绪 —— 盾心的盾鼻闪光(盾在左手：取 handL 挂点，拿不到就按朝向估在身前左侧)
  panyue_passive: {
    update(k, v, a, b) {
      if (b.stacks < 2) return;
      const u = a.unit;
      const f = u ? u.facing : 0;
      let x = a.x + Math.cos(f) * 0.55 + Math.sin(f) * 0.38;
      let y = a.y + a.height * 0.42;
      let z = a.z + Math.sin(f) * 0.55 - Math.cos(f) * 0.38;
      if (u && k.anchors.attach?.(u.id, 'handL', k.v)) {
        x = k.v.x + Math.cos(f) * 0.12;
        y = k.v.y - 0.12;
        z = k.v.z + Math.sin(f) * 0.12;
      }
      const s = 0.62 + 0.14 * Math.sin(v.age * 9);
      k.sprites.icon(SPRITE.glow, x, y, z, s * 1.25, 0, ROOT.hot, 1.9, 0.95, 0.6, 0.45);
      k.sprites.draw(SPRITE.spark, x, y, z, s * 1.15, v.age * 1.5, ROOT.hot, 1.6, 0.9, 0.7, 0.46);
    },
  },
  // 程咬金：越砍越勇就绪 —— 斧刃上的赤金闪光 + 少量铁火星(weapon 挂点；拿不到就放右肩上方)
  chijin_ember: {
    update(k, v, a, _b, dt) {
      const u = a.unit;
      const f = u ? u.facing : 0;
      let x = a.x - Math.sin(f) * 0.45;
      let y = a.y + a.height * 0.95;
      let z = a.z + Math.cos(f) * 0.45;
      if (u && k.anchors.attach?.(u.id, 'weapon', k.v)) {
        x = k.v.x;
        y = k.v.y;
        z = k.v.z;
      }
      const s = 0.7 + 0.16 * Math.sin(v.age * 11);
      k.sprites.icon(SPRITE.glow, x, y, z, s * 1.2, 0, AXE_GOLD, 2, 0.95, 0.6, 0.4);
      k.sprites.draw(SPRITE.spark, x, y, z, s, v.age * 2.2, AXE_GOLD, 1.7, 0.9, 0.7, 0.41);
      for (let n = due(k, v, dt, 7); n > 0; n--) {
        const r = k.rnd;
        k.particles.use(P.spark).tint(AXE_GOLD, EMBER).spawn(x + r.signed() * 0.15, y + r.signed() * 0.15, z + r.signed() * 0.15, r.signed() * 1.6, r.range(0.5, 2.5), r.signed() * 1.6, 0.3, 0.1, 0.03);
      }
    },
  },
  // 程咬金：半路杀出后的攻速加成 —— 脚下卷尘 + 贴地打转的赤色疾风线
  chijin_blaze: {
    update(k, v, a, _b, dt) {
      for (let n = due(k, v, dt, 20); n > 0; n--) {
        const r = k.rnd;
        const t = r.next() * TAU;
        const d = a.radius + r.range(0.05, 0.35);
        if (r.chance(0.35)) k.particles.use(P.dust).spawn(a.x + Math.cos(t) * d, a.y + 0.15, a.z + Math.sin(t) * d, Math.sin(t) * 1.2, r.range(0.3, 0.9), -Math.cos(t) * 1.2, 0.45, 0.45, 1.0);
        else k.particles.use(P.streak).tint(EMBER_HOT, EMBER).orbit(a.x, a.y + r.range(0.12, 0.7), a.z, d, d + 0.3, t, -10, r.range(0.2, 0.8), r.range(0.24, 0.34), 0.2, 0.06);
      }
    },
  },
  // 李广：猿臂连射 —— 层数 = 绕身的白羽数；满层时脚下一圈细的金绿实线环(压在队伍环以内)，白羽转得更快
  fengling_gale: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.range, 0.2);
      k.decals.at(s).y(0.07).params(0.035, 0).color(WIND.accent, 1.6, 0).under(C.shadow, 0.25);
    },
    update(k, v, a, b) {
      const n = Math.max(1, Math.min(5, b.stacks));
      const full = n >= 5;
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius * HERO_RING).alpha(full ? 0.9 : 0);
      const r = a.radius + 0.5;
      for (let i = 0; i < n; i++) {
        const ang = v.phase + v.age * (full ? 5.5 : 3.2) + (i * TAU) / n;
        // 羽尖顺着绕行方向
        k.sprites.icon(SPRITE.feather, a.x + Math.cos(ang) * r, a.y + a.height * 0.42 + Math.sin(ang * 2 + i) * 0.1, a.z + Math.sin(ang) * r, 0.52, -ang - Math.PI / 2, C.plume, full ? 1.35 : 1.15, 0.95, 0.15, 0.2);
      }
    },
  },
  // 李广：下一箭必暴 —— 箭镞处一点金芒(muzzle 挂点；拿不到就在身前 0.7 米)
  fengling_crit: {
    update(k, v, a) {
      const u = a.unit;
      const f = u ? u.facing : 0;
      let x = a.x + Math.cos(f) * 0.7;
      let y = a.y + a.height * 0.6;
      let z = a.z + Math.sin(f) * 0.7;
      if (u && k.anchors.attach?.(u.id, 'muzzle', k.v)) {
        x = k.v.x + Math.cos(f) * 0.2;
        y = k.v.y;
        z = k.v.z + Math.sin(f) * 0.2;
      }
      const s = 0.6 + 0.15 * Math.sin(v.age * 10);
      k.sprites.icon(SPRITE.spark, x, y, z, s * 1.3, v.age * 3, WIND.accent, 1.6, 1, 0.5, 0.3);
    },
  },
  // 荆轲：得手后的 3 秒(一、二技能已刷新) —— 脚下一圈墨晕 + 匕首处寒光闪两下 + 少量上升的墨点
  yeque_shadow: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.glow, 0.2);
      k.decals.at(s).params(1.3).color(C.black, 0, 0.8).under(C.ink, 0.55);
    },
    update(k, v, a, _b, dt) {
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius + 0.75);
      // 两下寒光：出现后 0.1~0.32 秒、0.5~0.72 秒
      const g = Math.max(glintAt(v.age, 0.1), glintAt(v.age, 0.5));
      const u = a.unit;
      if (g > 0 && u) {
        const f = u.facing;
        let x = a.x + Math.cos(f) * 0.4 - Math.sin(f) * 0.35;
        let y = a.y + a.height * 0.5;
        let z = a.z + Math.sin(f) * 0.4 + Math.cos(f) * 0.35;
        if (k.anchors.attach?.(u.id, 'weapon', k.v)) {
          x = k.v.x;
          y = k.v.y;
          z = k.v.z;
        }
        k.sprites.draw(SPRITE.spark, x, y, z, 0.4 + g * 0.55, 0.4, SHADOW.hot, 2.1, g, 0.75, 0.45);
      }
      for (let n = due(k, v, dt, 6); n > 0; n--) {
        const r = k.rnd;
        const sz = r.range(0.08, 0.16);
        k.particles.use(P.inkRise).spawn(a.x + r.signed() * a.radius, a.y + r.range(0.1, 0.6), a.z + r.signed() * a.radius, 0, r.range(0.5, 1.1), 0, 0.6, sz, sz * 1.3);
      }
    },
  },
};

/** 有专属状态特效的 buff 列表(画廊页用) */
export const STATUS_BUFFS = Object.keys(DEFS) as BuffId[];

const BUFF_INDEX = new Map<BuffId, number>(STATUS_BUFFS.map((id, i) => [id, i]));

export class StatusViews {
  private views = new Map<number, StatusView>();
  private list: StatusView[] = [];
  private k: FxKit;
  private stamp = 0;
  private phaseN = 0;

  constructor(k: FxKit) {
    this.k = k;
  }

  private release(v: StatusView): void {
    const k = this.k;
    v.def.end?.(k, v);
    for (const s of v.slots) k.decals.release(s, 0.2);
    for (const m of v.meshes) k.glow.release(m);
    v.slots.length = 0;
    v.meshes.length = 0;
  }

  update(frame: FrameInfo): void {
    const k = this.k;
    const stamp = ++this.stamp;
    const dt = frame.dt;
    for (const u of frame.state.units) {
      if (u.buffs.length === 0 || !u.alive) continue;
      if (u.team !== frame.playerTeam && !u.visible[frame.playerTeam]) continue;
      let anchored = false;
      for (const b of u.buffs) {
        const idx = BUFF_INDEX.get(b.id);
        if (idx === undefined) continue;
        // 同一单位上同名 buff 可能有多份(不同来源的减速/护盾)：只画一份
        const key = u.id * 64 + idx;
        let v = this.views.get(key);
        if (v && v.seen === stamp) continue;
        if (!anchored) {
          if (!k.anchors.get(u.id, k.a)) break;
          anchored = true;
        }
        // 取状态里最强的一份来驱动表现
        const best = strongest(u.buffs, b.id);
        if (!v) {
          this.phaseN = (this.phaseN + 2.399) % TAU;
          v = { key, def: DEFS[b.id] as StatusDef, seen: stamp, slots: [], meshes: [], acc: 0, age: 0, phase: this.phaseN };
          this.views.set(key, v);
          this.list.push(v);
          v.def.create?.(k, v, k.a, best);
        }
        v.seen = stamp;
        v.age += dt;
        v.def.update(k, v, k.a, best, dt);
      }
    }
    this.blessedMinions(frame);
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      if (v.seen === stamp) continue;
      this.release(v);
      this.views.delete(v.key);
      list[i] = list[list.length - 1];
      list.pop();
    }
  }

  /** 星陨祝福期间，该队小兵头顶各一颗小金星(小兵身上没有 buff，按队伍剩余时间判断；敌方视角同样看得到) */
  private blessedMinions(frame: FrameInfo): void {
    const k = this.k;
    const teams = frame.state.teams;
    if (!(teams[0].blessingLeft > 0) && !(teams[1].blessingLeft > 0)) return;
    const pt = frame.playerTeam;
    for (const u of frame.state.units) {
      if (u.kind !== 'minion' || !u.alive || (u.team !== 0 && u.team !== 1)) continue;
      const left = teams[u.team].blessingLeft;
      if (!(left > 0) || (u.team !== pt && !u.visible[pt])) continue;
      if (k.focusDist(u.pos.x, u.pos.y) > 30 || !k.anchors.get(u.id, k.a)) continue;
      const blink = left < 5 ? 0.55 + 0.45 * Math.cos(k.now * 9) : 1;
      k.sprites.icon(SPRITE.star8, k.a.x, k.a.y + k.a.height + 0.35 + Math.sin(k.now * 3 + u.id) * 0.06, k.a.z, 0.36, k.now * 0.8, STUN, 1.25, 0.9 * blink, 0.15, 0.1);
    }
  }

  get count(): number {
    return this.views.size;
  }

  reset(): void {
    for (const v of this.list) this.release(v);
    this.list.length = 0;
    this.views.clear();
  }
}

function strongest(buffs: Buff[], id: BuffId): Buff {
  let best: Buff | null = null;
  for (const b of buffs) {
    if (b.id !== id) continue;
    if (!best || b.value > best.value || (b.value === best.value && b.stacks > best.stacks)) best = b;
  }
  return best as Buff;
}

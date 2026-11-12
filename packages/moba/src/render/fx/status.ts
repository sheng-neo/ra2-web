/**
 * 状态特效：挂在单位身上的 buff 表现，随 buff 出现而建立、消失而回收，只画对玩家可见的存活单位。
 * 层数类(星辉印记 / 风之眷顾 / 防御塔锁定)用对应数量的图标直接表达层数。
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
const GOLD_HOT = col(0xfff2b0);
const ROOT = THEME.panyue;
const FROST = col(0x8fdcff);
const FROST_DEEP = col(0x3f8cff);
const SHIELD = col(0xa8d8ff);
const SHIELD_AMBER = col(0xffc060);
const EMBER = col(0xff6a2a);
const EMBER_HOT = col(0xffc070);
const RECALL = col(0x58b4ff);
const HEAL = col(0x7dffa0);
const SHADOW = THEME.yeque;
const WIND = THEME.fengling;
const MARK = THEME.xingli;
const LOCK = col(0xff3a28);

function emit(k: FxKit, v: StatusView, dt: number, rate: number, fn: () => void): void {
  v.acc += dt * rate * k.density;
  while (v.acc >= 1) {
    v.acc -= 1;
    fn();
  }
}

function holdDecal(k: FxKit, v: StatusView, type: number, fadeIn = 0.15): number {
  const s = k.decals.hold(type, fadeIn);
  v.slots.push(s);
  return s;
}

/** 脚下的符文环(霜 / 焰 / 星辉 共用) */
function runeRing(color: THREE.Color, hot: THREE.Color, sides: number, spin: number, scale: number, sprite: number): StatusDef {
  return {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.rune, 0.3);
      k.decals.at(s).params(sides, spin).color(color, 1.5, 0.85).under(C.shadow, 0.25);
    },
    update(k, v, a, _b, dt) {
      k.decals.at(v.slots[0]).at(a.x, a.z).radius((a.radius + 0.75) * scale);
      // 一枚绕身的小图标，远看也能认出是哪种增益
      const ang = v.phase + v.age * 2.2 * Math.sign(spin);
      const r = a.radius + 0.55;
      k.sprites.draw(sprite, a.x + Math.cos(ang) * r, a.y + a.height * 0.45 + Math.sin(v.age * 3) * 0.12, a.z + Math.sin(ang) * r, 0.5, 0, hot, 2, 0.95, 0.9);
      emit(k, v, dt, 2.5, () => {
        const t = k.rnd.next() * TAU;
        k.particles.use(P.glint).tint(hot, color).spawn(a.x + Math.cos(t) * r, a.y + 0.1, a.z + Math.sin(t) * r, 0, k.rnd.range(0.8, 1.6), 0, 0.8, 0.26, 0.06);
      });
    },
  };
}

const DEFS: Partial<Record<BuffId, StatusDef>> = {
  // 眩晕：头顶旋转星
  stun: {
    update(k, v, a, _b, dt) {
      const y = a.y + a.height + 0.35;
      const r = 0.34 + a.radius * 0.35;
      for (let i = 0; i < 3; i++) {
        const ang = v.age * 5.2 + (i * TAU) / 3;
        // 压扁的椭圆轨道：像在头顶绕圈
        k.sprites.draw(SPRITE.star, a.x + Math.cos(ang) * r, y + Math.sin(ang) * 0.1, a.z + Math.sin(ang) * r * 0.45, 0.44, ang * 1.3, GOLD_HOT, 2, 1, 0.85, 0.4);
      }
      k.sprites.draw(SPRITE.bolt, a.x, y + 0.02, a.z, 0.36, Math.sin(v.age * 14) * 0.4, GOLD, 2, 0.8, 0.9, 0.4);
      emit(k, v, dt, 4, () => k.particles.use(P.glint).tint(C.white, GOLD).spawn(a.x + k.rnd.signed() * r, y, a.z + k.rnd.signed() * r * 0.5, 0, 0.4, 0, 0.4, 0.22, 0.05));
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
      emit(k, v, dt, 16, () => {
        const t = k.rnd.next() * TAU;
        k.particles.use(P.streak).tint(C.white, C.dust).spawn(a.x + Math.cos(t) * a.radius, 0.2, a.z + Math.sin(t) * a.radius, 0, k.rnd.range(4, 8), 0, 0.25, 0.1, 0.04);
      });
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
      k.decals.at(s).params(6, -1.5).color(FROST, 1.5, 0.9).under(FROST_DEEP, 0.3);
      const e = holdDecal(k, v, DECAL.range, 0.15);
      k.decals.at(e).params(0.03, 0).color(FROST, 1.5, 0.8).under(C.shadow, 0.2);
    },
    update(k, v, a, b, dt) {
      // 减速越重，环越大越亮
      const strength = Math.min(1, 0.5 + b.value);
      const rad = a.radius + 0.75 + b.value * 0.5;
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(rad).alpha(0.6 + 0.4 * strength);
      k.decals.at(v.slots[1]).at(a.x, a.z).radius(rad);
      emit(k, v, dt, 3, () => {
        const t = k.rnd.next() * TAU;
        k.particles.use(P.frost).spawn(a.x + Math.cos(t) * rad * 0.8, a.y + k.rnd.range(0.1, 0.5), a.z + Math.sin(t) * rad * 0.8, 0, 0.5, 0, 0.8, 0.3, 0.14);
      });
    },
  },
  // 护盾：半透明六边形护罩
  shield: {
    create(k, v, a, b) {
      const m = k.glow.hold(SHAPE.sphere, MODE.hex);
      // 磐岳自己的壁垒是琥珀色，其余护盾是冰蓝白
      const src = k.anchors.unit(b.sourceId);
      const amber = src !== undefined && src.kind === 'hero' && src.heroId === 'panyue';
      m.color(amber ? SHIELD_AMBER : SHIELD, 2, 0);
      m.add = 0.85;
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
  // 加速：风痕
  haste: {
    update(k, v, a, _b, dt) {
      const u = a.unit;
      if (!u) return;
      const vx = (u.pos.x - u.prevPos.x) / TICK_DT;
      const vz = (u.pos.y - u.prevPos.y) / TICK_DT;
      const sp = Math.hypot(vx, vz);
      emit(k, v, dt, sp > 0.5 ? 16 : 4, () => {
        const r = k.rnd;
        const ox = r.signed() * (a.radius + 0.25);
        const oz = r.signed() * (a.radius + 0.25);
        k.particles
          .use(P.streak)
          .tint(WIND.hot, WIND.glow)
          .spawn(a.x + ox, a.y + r.range(0.2, 1.5), a.z + oz, -vx * 0.6, r.signed() * 0.3, -vz * 0.6, 0.28, 0.12, 0.04);
      });
    },
  },
  // 灼烧：身上的火苗
  burn: {
    update(k, v, a, _b, dt) {
      emit(k, v, dt, 11, () => {
        const r = k.rnd;
        const x = a.x + r.signed() * a.radius * 0.7;
        const z = a.z + r.signed() * a.radius * 0.7;
        const y = a.y + r.range(0.3, a.height * 0.75);
        if (r.chance(0.7)) k.particles.use(P.flame).spawn(x, y, z, 0, r.range(1, 2.2), 0, r.range(0.3, 0.5), 0.55, 0.25);
        else k.particles.use(P.ember).tint(EMBER_HOT, EMBER).spawn(x, y, z, r.signed() * 0.5, r.range(1, 2.5), r.signed() * 0.5, 0.6, 0.13, 0.04);
      });
    },
  },
  // 不可选中：半透明残影(暗影烟缕裹身)
  untargetable: {
    update(k, v, a, _b, dt) {
      emit(k, v, dt, 14, () => {
        const r = k.rnd;
        const x = a.x + r.signed() * a.radius;
        const z = a.z + r.signed() * a.radius;
        if (r.chance(0.6)) k.particles.use(P.wisp).spawn(x, a.y + r.range(0.1, 1.2), z, r.signed() * 0.4, r.range(0.6, 1.6), r.signed() * 0.4, 0.5, 0.6, 1.1);
        else k.particles.use(P.glint).tint(SHADOW.hot, SHADOW.glow).spawn(x, a.y + r.range(0.3, 1.8), z, 0, 0.5, 0, 0.4, 0.26, 0.06);
      });
    },
  },
  // 免疫控制：身周上升的金色流光
  unstoppable: {
    update(k, v, a, _b, dt) {
      emit(k, v, dt, 12, () => {
        const t = k.rnd.next() * TAU;
        const d = a.radius + 0.3;
        k.particles.use(P.streak).tint(GOLD_HOT, GOLD).spawn(a.x + Math.cos(t) * d, a.y + 0.1, a.z + Math.sin(t) * d, 0, k.rnd.range(3.5, 6), 0, 0.35, 0.12, 0.04);
      });
    },
  },
  // 回城：脚下逐渐收拢的上升光环
  recall: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.rune, 0.3);
      k.decals.at(s).params(6, 1.6).color(RECALL, 1.7, 0.9).under(C.shadow, 0.3);
      const m = k.glow.hold(SHAPE.pillar, MODE.pillar);
      m.color(RECALL, 1.6, 0);
      m.k = 1.6;
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
      emit(k, v, dt, 2.4 + t * 2, () => {
        k.glow.spawn(SHAPE.hoop, MODE.hoop, 0.9).at(a.x, 0.15, a.z).vel(0, 2.6 + t * 2, 0).scale(rad, rad * 0.6).color(RECALL, 1.9, 0.9).fade(0.15, 0.5);
        for (let i = 0; i < 3; i++) k.particles.use(P.glint).tint(C.white, RECALL).orbit(a.x, 0.1, a.z, rad, rad * 0.4, k.rnd.next() * TAU, 5, k.rnd.range(2, 4), 0.8, 0.3, 0.08);
      });
    },
  },
  // 恢复：上升的绿色光点
  restore: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.glow, 0.2);
      k.decals.at(s).params(1.5).color(HEAL, 0.7, 0.8).under(C.black, 0);
    },
    update(k, v, a, _b, dt) {
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius + 0.9);
      emit(k, v, dt, 9, () => {
        const r = k.rnd;
        const t = r.next() * TAU;
        const d = r.range(0.2, a.radius + 0.4);
        if (r.chance(0.25)) k.particles.use(P.plus).spawn(a.x + Math.cos(t) * d, a.y + r.range(0.3, 1), a.z + Math.sin(t) * d, 0, r.range(1, 1.8), 0, 0.7, 0.2, 0.32);
        else k.particles.use(P.glint).tint(C.white, HEAL).spawn(a.x + Math.cos(t) * d, a.y + r.range(0.1, 0.8), a.z + Math.sin(t) * d, 0, r.range(1.2, 2.4), 0, 0.7, 0.26, 0.06);
      });
    },
  },
  // 泉水回复：脚边淡淡的队伍色光点
  fountain: {
    update(k, v, a, _b, dt) {
      const th = teamTheme(a.unit ? a.unit.team : 2);
      emit(k, v, dt, 4, () => {
        const t = k.rnd.next() * TAU;
        k.particles.use(P.glint).tint(th.hot, th.glow).spawn(a.x + Math.cos(t) * (a.radius + 0.2), a.y + 0.1, a.z + Math.sin(t) * (a.radius + 0.2), 0, k.rnd.range(1, 2), 0, 0.8, 0.24, 0.06);
      });
    },
  },
  // 复活保护：金色光晕
  respawn_guard: {
    create(k, v) {
      const m = k.glow.hold(SHAPE.sphere, MODE.rim);
      m.color(GOLD, 1.8, 0);
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
      emit(k, v, dt, 6, () => {
        const t = k.rnd.next() * TAU;
        k.particles.use(P.glint).tint(GOLD_HOT, GOLD).spawn(a.x + Math.cos(t) * r, a.y + k.rnd.range(0.2, 1.8), a.z + Math.sin(t) * r, 0, 0.8, 0, 0.6, 0.26, 0.06);
      });
    },
  },
  // 霜晶之智：蓝色符文环
  frost_insight: runeRing(FROST_DEEP, FROST, 6, 0.8, 1.0, SPRITE.frost),
  // 炽焰之力：红色符文环
  ember_might: runeRing(EMBER, EMBER_HOT, 3, -0.8, 1.16, SPRITE.flame),
  // 星陨祝福：金色星辉
  star_blessing: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.star, 0.3);
      k.decals.at(s).params(5, 2.6).color(GOLD, 1.4, 0.8).under(C.shadow, 0.2);
    },
    update(k, v, a, _b, dt) {
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius + 0.95).rot(v.age * 0.7);
      const y = a.y + a.height + 0.75 + Math.sin(v.age * 2.4) * 0.08;
      k.sprites.draw(SPRITE.star, a.x, y, a.z, 0.4, v.age * 1.2, GOLD_HOT, 2.1, 0.95, 0.85, 0.3);
      k.sprites.draw(SPRITE.glow, a.x, y, a.z, 0.9, 0, GOLD, 1.2, 0.6, 1, 0.3);
      emit(k, v, dt, 4, () => {
        const t = k.rnd.next() * TAU;
        const d = k.rnd.range(0.2, a.radius + 0.5);
        k.particles.use(P.glint).tint(GOLD_HOT, GOLD).spawn(a.x + Math.cos(t) * d, a.y + k.rnd.range(0.2, 1), a.z + Math.sin(t) * d, 0, k.rnd.range(0.8, 1.8), 0, 0.9, 0.28, 0.06);
      });
    },
  },
  // 星辉印记：目标头顶 1~3 颗星印
  xingli_mark: {
    update(k, v, a, b) {
      const n = Math.max(1, Math.min(3, b.stacks));
      const y = a.y + a.height + 0.62;
      const pop = Math.min(1, v.age * 8);
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * 0.46;
        const bob = Math.sin(v.age * 3.2 + i * 1.1) * 0.05;
        // 最新的一颗弹一下
        const s = 0.46 * (i === n - 1 ? 0.6 + 0.4 * pop : 1);
        k.sprites.draw(SPRITE.glow, a.x + ox, y + bob, a.z, s * 2, 0, MARK.glow, 1.4, 0.7, 1, 0.5);
        k.sprites.draw(SPRITE.star, a.x + ox, y + bob, a.z, s, 0, MARK.hot, 2.2, 1, 0.75, 0.5);
      }
    },
  },
  // 防御塔锁定：头顶红色锁定标记，层数 = 小红菱
  tower_focus: {
    update(k, v, a, b) {
      const y = a.y + a.height + 1.0;
      const pulse = 1 + 0.12 * Math.sin(v.age * 10);
      k.sprites.draw(SPRITE.lock, a.x, y, a.z, 0.8 * pulse, v.age * 1.5, LOCK, 2.2, 1, 0.8, 0.5);
      const n = Math.min(5, b.stacks);
      for (let i = 0; i < n; i++) k.sprites.draw(SPRITE.diamond, a.x + (i - (n - 1) / 2) * 0.24, y - 0.55, a.z, 0.22, 0, LOCK, 2.2, 1, 0.7, 0.5);
    },
  },
  // 磐岳：第三击就绪时胸前的琥珀星芒
  panyue_passive: {
    update(k, v, a, b) {
      if (b.stacks < 2) return;
      const s = 0.55 + 0.12 * Math.sin(v.age * 9);
      k.sprites.draw(SPRITE.spark, a.x, a.y + a.height * 0.58, a.z, s, v.age * 2, ROOT.hot, 2.2, 0.95, 1, a.radius + 0.4);
    },
  },
  // 赤烬：余烬之刃就绪——双刃带火
  chijin_ember: {
    update(k, v, a, _b, dt) {
      const u = a.unit;
      const f = u ? u.facing : 0;
      emit(k, v, dt, 12, () => {
        const side = k.rnd.chance(0.5) ? 1 : -1;
        const x = a.x - Math.sin(f) * side * 0.65 + Math.cos(f) * 0.3;
        const z = a.z + Math.cos(f) * side * 0.65 + Math.sin(f) * 0.3;
        k.particles.use(P.flame).spawn(x, a.y + k.rnd.range(0.7, 1.2), z, 0, k.rnd.range(0.8, 1.6), 0, 0.32, 0.42, 0.18);
      });
    },
  },
  // 赤烬：炎步后的攻速加成——脚下带火
  chijin_blaze: {
    update(k, v, a, _b, dt) {
      emit(k, v, dt, 9, () => {
        const r = k.rnd;
        if (r.chance(0.6)) k.particles.use(P.flame).spawn(a.x + r.signed() * 0.4, a.y + 0.1, a.z + r.signed() * 0.4, 0, r.range(1, 2), 0, 0.35, 0.5, 0.22);
        else k.particles.use(P.ember).tint(EMBER_HOT, EMBER).spawn(a.x + r.signed() * 0.4, a.y + 0.3, a.z + r.signed() * 0.4, r.signed(), r.range(1, 2.5), r.signed(), 0.6, 0.12, 0.04);
      });
    },
  },
  // 风翎：风之眷顾——层数 = 绕身的风叶数，满层脚下起风环
  fengling_gale: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.swirl, 0.2);
      k.decals.at(s).params(4, 1.6).color(WIND.glow, 1.3, 0).under(C.black, 0);
    },
    update(k, v, a, b) {
      const n = Math.max(1, Math.min(5, b.stacks));
      const full = n >= 5;
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius + 0.85).alpha(full ? 0.85 : 0);
      const r = a.radius + 0.5;
      for (let i = 0; i < n; i++) {
        const ang = v.phase + v.age * (full ? 5.5 : 3.5) + (i * TAU) / n;
        k.sprites.draw(SPRITE.leaf, a.x + Math.cos(ang) * r, a.y + a.height * 0.42 + Math.sin(ang * 2 + i) * 0.1, a.z + Math.sin(ang) * r, 0.42, -ang, full ? WIND.hot : WIND.glow, full ? 2.2 : 1.7, 0.95, 0.7);
      }
    },
  },
  // 风翎：下一箭必暴——身前的金绿星芒
  fengling_crit: {
    update(k, v, a) {
      const u = a.unit;
      const f = u ? u.facing : 0;
      const s = 0.6 + 0.15 * Math.sin(v.age * 10);
      k.sprites.draw(SPRITE.spark, a.x + Math.cos(f) * 0.7, a.y + a.height * 0.6, a.z + Math.sin(f) * 0.7, s, v.age * 3, WIND.accent, 2.3, 1, 1, 0.3);
    },
  },
  // 夜阙：猎影(击杀刷新) —— 身周的紫色影缕
  yeque_shadow: {
    create(k, v) {
      const s = holdDecal(k, v, DECAL.glow, 0.2);
      k.decals.at(s).params(1.3).color(SHADOW.glow, 0.6, 0.8).under(SHADOW.dark, 0.5);
    },
    update(k, v, a, _b, dt) {
      k.decals.at(v.slots[0]).at(a.x, a.z).radius(a.radius + 0.9);
      emit(k, v, dt, 7, () => {
        const r = k.rnd;
        k.particles.use(P.wisp).spawn(a.x + r.signed() * a.radius, a.y + r.range(0.1, 0.8), a.z + r.signed() * a.radius, 0, r.range(0.8, 1.6), 0, 0.5, 0.5, 0.9);
      });
    },
  },
};

/** 有专属状态特效的 buff 列表(画廊页用) */
export const STATUS_BUFFS = Object.keys(DEFS) as BuffId[];

const BUFF_INDEX = new Map<BuffId, number>(STATUS_BUFFS.map((id, i) => [id, i]));

export class StatusViews {
  private views = new Map<number, StatusView>();
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
          v.def.create?.(k, v, k.a, best);
        }
        v.seen = stamp;
        v.age += dt;
        v.def.update(k, v, k.a, best, dt);
      }
    }
    for (const [key, v] of this.views) {
      if (v.seen !== stamp) {
        this.release(v);
        this.views.delete(key);
      }
    }
  }

  get count(): number {
    return this.views.size;
  }

  reset(): void {
    for (const v of this.views.values()) this.release(v);
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

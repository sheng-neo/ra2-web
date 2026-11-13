/**
 * 区域效果视图：按 state.areas 同步(出现 → 持续 → 结束)。半径一律取模拟层的精确值；跟随单位的区域用单位的插值位置。
 * 预警圈(§7.2 第 7 项的统一规范)：边线实、填充淡、倒计时由内向外推进；四色 = 敌红 / 友蓝 / 己绿 / 野怪琥珀。
 * 持续区域的填充与亮度上限由贴花着色器统一压住(≤0.22，low 档再乘 DECAL_FILL)，各条目只管意象。
 * 每个持续区域只有一道外沿边线，颜色表示敌我(敌方 = 红，「这块地方别站」)；英雄的意象在圈内的纹样与粒子上。
 */
import type * as THREE from 'three';
import { TICK_DT, type AreaEffect, type AreaVisual, type TeamId } from '../../core/types';
import type { FrameInfo } from '../engine/context';
import { P, WARN, dustRing, goose, ring } from './common';
import { DECAL } from './decals';
import { MODE, SHAPE, type FxMesh } from './glow';
import type { FxKit } from './kit';
import { SPRITE } from './textures';
import { C, TAU, THEME, col } from './util';

interface AreaView {
  id: number;
  def: AreaDef;
  seen: number;
  x: number;
  z: number;
  radius: number;
  team: TeamId;
  ownerId: number;
  /** 对玩家是敌方的 / 是玩家自己放的 */
  hostile: boolean;
  mine: boolean;
  /** 已存在时间(已按插值修正)与进度 0..1 */
  age: number;
  t: number;
  duration: number;
  slots: number[];
  /** 敌方区域的红色警示边(贴花槽位，-1 = 无) */
  edge: number;
  meshes: FxMesh[];
  acc: number;
  phase: number;
}

interface AreaDef {
  create(k: FxKit, v: AreaView): void;
  update(k: FxKit, v: AreaView, dt: number): void;
  end?(k: FxKit, v: AreaView): void;
}

const EDGE_ENEMY = col(0xff3a28);

function hold(k: FxKit, v: AreaView, type: number, fadeIn = 0.12): number {
  const s = k.decals.hold(type, fadeIn);
  v.slots.push(s);
  return s;
}

/**
 * 持续区域的边界：每个区域只画一道外沿边线，颜色表示敌我(敌红 / 友蓝 / 己绿)，英雄的意象留给圈内的纹样(填充很淡)。
 * 以前是「英雄色边线 + 内圈刻度环 + 敌方再套一道红圈」，三四个技能叠在一起就是十来道同心环，圈里的人看不清。
 * style：0 = 实线；> 0 = 短划虚线的段数(李广的箭雨)；< 0 = 弧形起伏的波数取负(王昭君的雁落)。pulse = 明暗脉冲的相位。
 */
function zoneEdge(k: FxKit, v: AreaView, style: number, pulse: number, dark: THREE.Color): number {
  const w = v.hostile ? WARN.enemy : v.mine ? WARN.mine : WARN.ally;
  const z = hold(k, v, DECAL.zone);
  k.decals.at(z).params(style, pulse).color(v.hostile ? EDGE_ENEMY : w.edge, v.hostile ? 1.7 : 1.4, v.hostile ? 0.95 : 0.85).under(dark, 0.12);
  return z;
}

/** 把所有贴花槽位的位置对齐到区域中心(跟随型区域每帧都在动) */
function place(k: FxKit, v: AreaView, scaleOf?: (i: number) => number): void {
  for (let i = 0; i < v.slots.length; i++) k.decals.at(v.slots[i]).at(v.x, v.z).radius(v.radius * (scaleOf ? scaleOf(i) : 1));
}

/** 按每秒 rate 个的速率，本帧该发射几个(受画质倍率影响)。用返回值驱动循环，不为每帧每个区域分配闭包 */
function due(k: FxKit, v: AreaView, dt: number, rate: number): number {
  v.acc += dt * rate * k.density;
  const n = Math.floor(v.acc);
  v.acc -= n;
  return n;
}

const TP = THEME.panyue;
const TC = THEME.chijin;
const TX = THEME.xingli;
const TF = THEME.fengling;
/** 程咬金的斧刃赤金与风沙色 */
const AXE_GOLD = col(0xffc060);
const AXE_DUST = col(0xe8b070);

const DEFS: Record<AreaVisual, AreaDef> = {
  // ── 通用预警圈 ──
  telegraph: {
    create(k, v) {
      const w = v.team === 2 ? WARN.monster : v.hostile ? WARN.enemy : v.mine ? WARN.mine : WARN.ally;
      const s = hold(k, v, DECAL.telegraph, 0.06);
      // 敌方与野怪的预警最要紧：边线更亮、不透明度满；自己和友方的淡一档
      const loud = v.hostile || v.team === 2;
      k.decals.at(s).y(0.09).color(w.edge, loud ? 1.7 : 1.4, loud ? 0.95 : 0.8).under(w.under, 0.6).xray();
    },
    update(k, v) {
      k.decals.at(v.slots[0]).at(v.x, v.z).radius(v.radius).params(v.t);
    },
  },

  // ── 樊哙·拥盾怒目：跟随自身的震慑减速场。三面小盾影绕身缓转，尘屑被吸向中心 ──
  panyue_s2_aura: {
    create(k, v) {
      zoneEdge(k, v, 0, 0, TP.dark);
      for (let i = 0; i < 3; i++) {
        const m = k.glow.hold(SHAPE.shield, MODE.plate);
        m.color(TP.hot, 1.15, 0);
        m.add = 0.25;
        m.k = 0.16;
        v.meshes.push(m);
      }
    },
    update(k, v, dt) {
      place(k, v);
      const n = v.meshes.length;
      const grow = Math.min(1, v.age * 5);
      const fade = Math.max(0, Math.min(1, (v.duration - v.age) * 4));
      for (let i = 0; i < n; i++) {
        const a = v.phase + v.age * 1.1 + (i * TAU) / n;
        const m = v.meshes[i];
        // 盾面朝外，贴着身周缓缓转
        m.at(v.x + Math.cos(a) * 2.05, 0.08, v.z + Math.sin(a) * 2.05).scale(1.75 * grow).rot(0, -a, 0.05);
        m.a = 0.85 * fade;
        // 漆光每 1.6 秒自下而上扫一遍，三面错开
        m.progress = (v.age * 0.62 + i / n) % 1;
      }
      for (let c = due(k, v, dt, 6); c > 0; c--) {
        const a = k.rnd.next() * TAU;
        const d = v.radius * k.rnd.range(0.55, 1);
        // 尘屑被吸向中心：表达「减速」
        k.particles.use(P.dust).spawn(v.x + Math.cos(a) * d, 0.15, v.z + Math.sin(a) * d, -Math.cos(a) * 1.4, 0.4, -Math.sin(a) * 1.4, 0.7, 0.5, 0.9);
      }
    },
    end(k, v) {
      ring(k, v.x, v.z, v.radius * 0.5, 0.35, TP.glow, 1.1, 0.5, 0.2);
      dustRing(k, v.x, v.z, 5, 1.4, 2.5, C.dust, C.dustDark, 1.0, 0.6);
    },
  },

  // ── 樊哙·死且不避落地后的震裂地面：只冒尘，碎土偶尔跳一下 ──
  panyue_ult_fissure: {
    create(k, v) {
      zoneEdge(k, v, 0, 1, TP.dark);
    },
    update(k, v, dt) {
      place(k, v);
      for (let n = due(k, v, dt, 12); n > 0; n--) {
        const r = k.rnd;
        const a = r.next() * TAU;
        const d = v.radius * Math.sqrt(r.next()) * 0.95;
        const x = v.x + Math.cos(a) * d;
        const z = v.z + Math.sin(a) * d;
        const pick = r.next();
        if (pick < 0.55) k.particles.use(P.dust).spawn(x, 0.1, z, 0, r.range(0.5, 1.2), 0, 0.9, 0.5, 1.2);
        else if (pick < 0.88) {
          const sz = r.range(0.12, 0.22);
          k.particles.use(P.debris).tint(C.earth, C.earthDark).spawn(x, 0.1, z, r.signed() * 0.6, r.range(2.2, 4), r.signed() * 0.6, 0.6, sz, sz * 0.8);
        } else k.particles.use(P.ember).tint(TP.hot, TP.deep).spawn(x, 0.1, z, r.signed() * 0.3, r.range(0.8, 1.8), r.signed() * 0.3, r.range(0.5, 0.8), 0.13, 0.04);
      }
    },
  },

  // ── 程咬金·抡圆了砍：跟随自身的斧影旋风。两道常驻的斧影绕身飞转，风沙被卷起来；圈内的英雄必须看得清 ──
  chijin_ult_spin: {
    create(k, v) {
      zoneEdge(k, v, 0, 2, TC.dark);
      // 风沙漏斗：赤金掺尘黄，压矮、很透；low 档再淡一半
      const m = k.glow.hold(SHAPE.cone, MODE.vortex);
      m.color(AXE_DUST, 0.9, 0);
      m.add = 0.3;
      m.k = 4;
      m.progress = 0.3;
      v.meshes.push(m);
      for (let i = 0; i < 2; i++) {
        const arc = k.glow.hold(SHAPE.slash, MODE.slash);
        arc.color(i === 0 ? TC.glow : TC.accent, 1.25, 0);
        arc.add = 0.2;
        arc.k = 0.62;
        arc.progress = -2;
        v.meshes.push(arc);
      }
    },
    update(k, v, dt) {
      place(k, v);
      const grow = Math.min(1, v.age * 4);
      const fade = Math.max(0, Math.min(1, (v.duration - v.age) * 3));
      const w = v.radius * 0.55 * grow;
      const funnel = v.meshes[0];
      funnel.at(v.x, 0.05, v.z).scale3(w, 2.1 * grow, w).rot(0, v.age * 7, 0);
      funnel.a = (k.lowQ ? 0.2 : 0.4) * fade;
      for (let i = 1; i < v.meshes.length; i++) {
        const arc = v.meshes[i];
        const rr = v.radius * 0.94 * (0.4 + 0.6 * grow);
        arc.at(v.x, 0.85 + (i - 1) * 0.45, v.z).scale(rr).rot(i === 1 ? 0.1 : -0.1, v.phase + v.age * 12 + i * Math.PI, 0);
        arc.a = 0.55 * fade;
      }
      for (let n = due(k, v, dt, 22); n > 0; n--) {
        const r = k.rnd;
        const a = r.next() * TAU;
        // 被卷起来的尘土贴着地面顺着斧势转；铁火星更小、更短命
        if (r.chance(0.6)) k.particles.use(P.dust).tint(C.sand, C.dustDark).orbit(v.x, r.range(0.15, 0.6), v.z, v.radius * r.range(0.45, 0.7), v.radius * r.range(0.9, 1.05), a, -5, r.range(0.3, 1), r.range(0.4, 0.6), 0.5, 1.0);
        else k.particles.use(P.spark).tint(AXE_GOLD, TC.deep).orbit(v.x, r.range(0.4, 1.4), v.z, v.radius * r.range(0.7, 0.9), v.radius * r.range(0.95, 1.1), a, -9, r.range(0.5, 2), r.range(0.16, 0.24), 0.1, 0.03);
      }
    },
    end(k, v) {
      ring(k, v.x, v.z, v.radius, 0.4, TC.glow, 1.3, 0.5, 0.25);
      dustRing(k, v.x, v.z, 8, v.radius * 0.5, 3, C.sand, C.dustDark, 1.1, 0.6);
    },
  },

  // ── 王昭君·回环收弦：延迟后收束。两臂回旋的曲线 + 一道随倒计时收拢的音环 + 四颗金色音珠(四弦)沿环收拢 ──
  xingli_s2_well: {
    create(k, v) {
      const s = hold(k, v, DECAL.swirl, 0.08);
      k.decals.at(s).params(2, -3).color(TX.glow, 1.4, 0.8).under(TX.dark, 0.2);
      const m = k.glow.hold(SHAPE.hoop, MODE.hoop);
      m.color(TX.glow, 1.2, 0.85);
      m.add = 0.3;
      v.meshes.push(m);
    },
    update(k, v, dt) {
      // 音环随倒计时向中心收拢
      const shrink = 1 - 0.72 * v.t * v.t;
      k.decals.at(v.slots[0]).at(v.x, v.z).radius(v.radius);
      const m = v.meshes[0];
      m.at(v.x, 0.7 + v.t * 0.6, v.z).scale(v.radius * shrink);
      m.rot(0, v.age * 3, 0);
      // 四颗音珠沿环疾转并收拢
      for (let i = 0; i < 4; i++) {
        const a = v.phase + v.age * (4 + v.t * 6) + (i * TAU) / 4;
        const bx = v.x + Math.cos(a) * v.radius * shrink;
        const bz = v.z + Math.sin(a) * v.radius * shrink;
        k.sprites.draw(SPRITE.glow, bx, 0.75 + v.t * 0.6, bz, 0.62, 0, TX.accent, 2.1, 1, 0.7);
      }
      for (let n = due(k, v, dt, 26); n > 0; n--) {
        const r = k.rnd;
        k.particles.use(P.mote).orbit(v.x, r.range(0.1, 0.9), v.z, v.radius * r.range(0.7, 1.05), v.radius * 0.15, r.next() * TAU, 5, 0.6, 0.3, 0.2, 0.06);
      }
    },
  },

  // ── 王昭君·雁落平沙：一道弧形起伏的边线(音波) + 淡淡的圆月倒影；两波之间有小雁掠过、白羽零星飘落 ──
  xingli_ult_storm: {
    create(k, v) {
      zoneEdge(k, v, -9, 0, TX.dark);
      const mo = hold(k, v, DECAL.moon, 0.3);
      k.decals.at(mo).params(0.74, 0.6).color(TX.hot, 1.0, 0.4).under(TX.dark, 0.1);
    },
    update(k, v, dt) {
      place(k, v, (i) => (i === 1 ? 0.5 : 1));
      for (let n = due(k, v, dt, 7); n > 0; n--) {
        const r = k.rnd;
        const a = r.next() * TAU;
        const d = v.radius * Math.sqrt(r.next()) * 0.9;
        const x = v.x + Math.cos(a) * d;
        const z = v.z + Math.sin(a) * d;
        if (r.chance(0.5)) {
          // 小雁影：与俯冲的雁同一个来向，低低地斜掠过去(不落地)
          const tf = r.range(0.5, 0.65);
          goose(k, x + 3.2, 4.6, z - 2.4, -6.4 / tf, -3.4 / tf, 4.8 / tf, tf, 0.9, 1.05);
        } else k.particles.use(P.plume).spawn(x, r.range(1.5, 3), z, r.signed() * 0.5, -0.4, r.signed() * 0.5, r.range(0.9, 1.3), 0.34, 0.28);
      }
    },
    end(k, v) {
      ring(k, v.x, v.z, v.radius, 0.5, TX.glow, 1.1, 0.85, 0.2);
    },
  },

  // ── 李广·箭锁阴山：边界 + 压暗一层的地面(箭阵的影子) + 两波之间零星落下的箭 ──
  fengling_ult_rain: {
    create(k, v) {
      zoneEdge(k, v, 30, 0, TF.dark);
      const sh = hold(k, v, DECAL.glow, 0.25);
      k.decals.at(sh).params(0.6).color(C.black, 0, 0.32).under(TF.dark, 0.05);
    },
    update(k, v, dt) {
      place(k, v);
      for (let n = due(k, v, dt, 10); n > 0; n--) {
        const r = k.rnd;
        const a = r.next() * TAU;
        const d = v.radius * Math.sqrt(r.next()) * 0.95;
        const x = v.x + Math.cos(a) * d;
        const z = v.z + Math.sin(a) * d;
        // 两波之间零星落下的箭，让箭雨看起来是连续的
        const tf = r.range(0.16, 0.22);
        k.particles.use(P.arrow).tint(C.plume, TF.hot).spawn(x + 1.4, 10, z + 0.9, -1.4 / tf, -10 / tf, -0.9 / tf, tf, 0.5, 0.45);
        k.particles.use(P.dust).spawn(x, 0.12, z, 0, r.range(0.4, 0.9), 0, 0.32, 0.26, 0.6, tf);
      }
    },
    end(k, v) {
      ring(k, v.x, v.z, v.radius, 0.5, TF.glow, 1.0, 0.85, 0.2);
    },
  },

  // ── 泉水：地形层已经画了法阵，这里不重复 ──
  fountain_zone: {
    create() {},
    update() {},
  },
};

export const AREA_VISUALS = Object.keys(DEFS) as AreaVisual[];

export class AreaViews {
  private views = new Map<number, AreaView>();
  private list: AreaView[] = [];
  private k: FxKit;
  private stamp = 0;
  private phaseN = 0;

  constructor(k: FxKit) {
    this.k = k;
  }

  private release(v: AreaView, natural: boolean): void {
    const k = this.k;
    if (natural && v.def.end) v.def.end(k, v);
    for (const s of v.slots) k.decals.release(s, 0.2);
    for (const m of v.meshes) k.glow.release(m);
    v.slots.length = 0;
    v.meshes.length = 0;
  }

  update(frame: FrameInfo): void {
    const k = this.k;
    const stamp = ++this.stamp;
    for (const a of frame.state.areas) {
      let v = this.views.get(a.id);
      if (!v) {
        v = this.make(a, frame);
        this.views.set(a.id, v);
        this.list.push(v);
        v.def.create(k, v);
      }
      v.seen = stamp;
      this.sync(v, a, frame);
      v.def.update(k, v, frame.dt);
      // 红边套在区域自身的亮边外面一点，两条线不重合
    }
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      if (v.seen === stamp) continue;
      // 从状态里消失 = 到期或被提前移除：到期的才播放收尾
      this.release(v, v.age >= v.duration - 0.12);
      this.views.delete(v.id);
      list[i] = list[list.length - 1];
      list.pop();
    }
  }

  private make(a: AreaEffect, frame: FrameInfo): AreaView {
    this.phaseN = (this.phaseN + 2.399) % TAU;
    return {
      id: a.id,
      def: DEFS[a.visual] ?? DEFS.fountain_zone,
      seen: 0,
      x: a.pos.x,
      z: a.pos.y,
      radius: a.radius,
      team: a.team,
      ownerId: a.ownerId,
      hostile: a.team !== frame.playerTeam,
      mine: a.ownerId === frame.state.playerId,
      age: a.age,
      t: 0,
      duration: a.duration,
      slots: [],
      edge: -1,
      meshes: [],
      acc: 0,
      phase: this.phaseN,
    };
  }

  private sync(v: AreaView, a: AreaEffect, frame: FrameInfo): void {
    const k = this.k;
    v.radius = a.radius;
    v.duration = a.duration;
    // 状态里的 age 是「当前 tick」的值，渲染时刻在上一 tick 与当前 tick 之间
    v.age = Math.max(0, a.age - (1 - frame.alpha) * TICK_DT);
    v.t = a.duration > 0 ? Math.min(1, v.age / a.duration) : 1;
    if (a.followUnitId >= 0 && k.anchor(a.followUnitId)) {
      v.x = k.a.x;
      v.z = k.a.z;
    } else {
      v.x = a.pos.x;
      v.z = a.pos.y;
    }
  }

  get count(): number {
    return this.views.size;
  }

  reset(): void {
    for (const v of this.list) this.release(v, false);
    this.list.length = 0;
    this.views.clear();
  }
}

/**
 * 区域效果视图：按 state.areas 同步(出现 → 持续 → 结束)。半径一律取模拟层的精确值；跟随单位的区域用单位的插值位置。
 * 预警圈：敌方红、友方蓝、自己金，圈内由中心向外填充表示倒计时。
 * 敌方的持续区域额外套一圈红色细边，方便判断「这块地方别站」。
 */
import { TICK_DT, type AreaEffect, type AreaVisual, type TeamId } from '../../core/types';
import type { FrameInfo } from '../engine/context';
import { P, dustRing, embers, ring } from './common';
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
  meshes: FxMesh[];
  acc: number;
  phase: number;
}

interface AreaDef {
  create(k: FxKit, v: AreaView): void;
  update(k: FxKit, v: AreaView, dt: number): void;
  end?(k: FxKit, v: AreaView): void;
}

const WARN_ENEMY = col(0xff4632);
const WARN_ENEMY_UNDER = col(0x3a0a08);
const WARN_ALLY = col(0x58b4ff);
const WARN_ALLY_UNDER = col(0x0a1c3a);
const WARN_MINE = col(0xffd04a);
const WARN_MINE_UNDER = col(0x3a2a08);
const EDGE_ENEMY = col(0xff3a28);

function hold(k: FxKit, v: AreaView, type: number, fadeIn = 0.12): number {
  const s = k.decals.hold(type, fadeIn);
  v.slots.push(s);
  return s;
}

/** 敌方区域的红色细边 */
function hostileEdge(k: FxKit, v: AreaView): void {
  if (!v.hostile) return;
  const s = hold(k, v, DECAL.range);
  k.decals.at(s).params(0.012, 0).color(EDGE_ENEMY, 1.7, 0.9).under(C.shadow, 0.3);
}

/** 把所有贴花槽位的位置对齐到区域中心(跟随型区域每帧都在动) */
function place(k: FxKit, v: AreaView, scaleOf?: (i: number) => number): void {
  for (let i = 0; i < v.slots.length; i++) k.decals.at(v.slots[i]).at(v.x, v.z).radius(v.radius * (scaleOf ? scaleOf(i) : 1));
}

/** 按每秒 rate 个的速率调用 fn(受画质倍率影响) */
function emit(k: FxKit, v: AreaView, dt: number, rate: number, fn: () => void): void {
  v.acc += dt * rate * k.density;
  while (v.acc >= 1) {
    v.acc -= 1;
    fn();
  }
}

const TP = THEME.panyue;
const TC = THEME.chijin;
const TX = THEME.xingli;
const TF = THEME.fengling;

const DEFS: Record<AreaVisual, AreaDef> = {
  // ── 通用预警圈 ──
  telegraph: {
    create(k, v) {
      const c = v.hostile ? WARN_ENEMY : v.mine ? WARN_MINE : WARN_ALLY;
      const u = v.hostile ? WARN_ENEMY_UNDER : v.mine ? WARN_MINE_UNDER : WARN_ALLY_UNDER;
      const s = hold(k, v, DECAL.telegraph, 0.06);
      k.decals.at(s).y(0.09).color(c, v.hostile ? 2 : 1.6, v.hostile ? 1 : 0.8).under(u, 0.75).xray();
    },
    update(k, v) {
      k.decals.at(v.slots[0]).at(v.x, v.z).radius(v.radius).params(v.t);
    },
  },

  // ── 不动壁垒：跟随自身的岩环减速场 ──
  panyue_s2_aura: {
    create(k, v) {
      const z = hold(k, v, DECAL.zone);
      k.decals.at(z).params(14, 0).color(TP.glow, 1.5, 0.9).under(TP.dark, 0.35);
      const s = hold(k, v, DECAL.swirl);
      k.decals.at(s).params(5, -1.4).color(TP.deep, 0.9, 0.7).under(C.shadow, 0.25);
      hostileEdge(k, v);
      // 绕身旋转的碎岩
      for (let i = 0; i < 5; i++) {
        const m = k.glow.hold(SHAPE.rock, MODE.plain);
        m.color(C.white, 1);
        v.meshes.push(m);
      }
    },
    update(k, v, dt) {
      place(k, v, (i) => (i === 1 ? 0.96 : 1));
      const n = v.meshes.length;
      const grow = Math.min(1, v.age * 5);
      for (let i = 0; i < n; i++) {
        const a = v.phase + v.age * 1.9 + (i * TAU) / n;
        const m = v.meshes[i];
        m.at(v.x + Math.cos(a) * 1.75, 0.9 + Math.sin(v.age * 2.3 + i * 1.7) * 0.25, v.z + Math.sin(a) * 1.75);
        const s = (0.22 + (i % 3) * 0.06) * grow;
        m.scale(s);
        m.rot(v.age * 1.3 + i, v.age * 0.9 + i * 2, v.age * 0.7);
      }
      emit(k, v, dt, 9, () => {
        const a = k.rnd.next() * TAU;
        const d = v.radius * k.rnd.range(0.55, 1);
        // 尘屑被吸向中心：表达「减速」
        k.particles.use(P.dust).spawn(v.x + Math.cos(a) * d, 0.15, v.z + Math.sin(a) * d, -Math.cos(a) * 1.4, 0.4, -Math.sin(a) * 1.4, 0.7, 0.5, 0.9);
      });
    },
    end(k, v) {
      ring(k, v.x, v.z, v.radius * 0.5, 0.35, TP.glow, 1.2, 0.5, 0.2);
      dustRing(k, v.x, v.z, 6, 1.4, 2.5, C.dust, C.dustDark, 1.0, 0.6);
    },
  },

  // ── 山崩地裂落地后的裂隙减速场 ──
  panyue_ult_fissure: {
    create(k, v) {
      const z = hold(k, v, DECAL.zone);
      k.decals.at(z).params(18, 1).color(TP.glow, 1.5, 0.9).under(TP.dark, 0.4);
      hostileEdge(k, v);
    },
    update(k, v, dt) {
      place(k, v);
      // 裂缝里持续冒出的热尘与琥珀余烬
      emit(k, v, dt, 20, () => {
        const a = k.rnd.next() * TAU;
        const d = v.radius * Math.sqrt(k.rnd.next()) * 0.95;
        const x = v.x + Math.cos(a) * d;
        const z = v.z + Math.sin(a) * d;
        if (k.rnd.chance(0.35)) k.particles.use(P.dust).spawn(x, 0.1, z, 0, k.rnd.range(0.5, 1.2), 0, 0.9, 0.5, 1.2);
        else k.particles.use(P.ember).tint(TP.hot, TP.deep).spawn(x, 0.1, z, k.rnd.signed() * 0.3, k.rnd.range(0.8, 2), k.rnd.signed() * 0.3, k.rnd.range(0.6, 1), 0.15, 0.04);
      });
    },
  },

  // ── 焚天旋舞：跟随自身的火焰旋风 ──
  chijin_ult_spin: {
    create(k, v) {
      const z = hold(k, v, DECAL.zone);
      k.decals.at(z).params(0, 2).color(TC.glow, 1.7, 0.95).under(TC.dark, 0.4);
      const s = hold(k, v, DECAL.swirl);
      k.decals.at(s).params(3, 2.4).color(TC.glow, 1.5, 0.9).under(TC.dark, 0.45);
      hostileEdge(k, v);
      const m = k.glow.hold(SHAPE.cone, MODE.vortex);
      m.color(TC.glow, 1.3, 0.85);
      m.add = 0.25;
      m.k = 4;
      m.progress = 0.15;
      v.meshes.push(m);
    },
    update(k, v, dt) {
      place(k, v);
      const m = v.meshes[0];
      const grow = Math.min(1, v.age * 4);
      const fade = Math.min(1, (v.duration - v.age) * 3);
      const w = v.radius * 0.5 * grow;
      m.at(v.x, 0.05, v.z).scale3(w, 3.3 * grow, w).rot(0, -v.age * 9, 0);
      m.a = 0.85 * Math.max(0, fade);
      emit(k, v, dt, 46, () => {
        const r = k.rnd;
        const a = r.next() * TAU;
        if (r.chance(0.6)) k.particles.use(P.ember).tint(TC.hot, TC.glow).orbit(v.x, r.range(0.2, 1.2), v.z, v.radius * r.range(0.3, 0.6), v.radius * r.range(0.85, 1), a, 7, r.range(0.8, 2.6), r.range(0.4, 0.6), 0.2, 0.05);
        else {
          const d = v.radius * r.range(0.35, 0.95);
          k.particles.use(P.flame).spawn(v.x + Math.cos(a) * d, 0.1, v.z + Math.sin(a) * d, -Math.sin(a) * 3, r.range(1.5, 3), Math.cos(a) * 3, r.range(0.3, 0.5), 0.9, 0.45);
        }
      });
    },
    end(k, v) {
      ring(k, v.x, v.z, v.radius, 0.45, TC.glow, 1.5, 0.4, 0.3);
      embers(k, v.x, 0.5, v.z, 14, v.radius * 0.6, 2.4, TC.hot, TC.glow, 1.1);
    },
  },

  // ── 引力星环：延迟后收束 ──
  xingli_s2_well: {
    create(k, v) {
      const s = hold(k, v, DECAL.swirl, 0.08);
      k.decals.at(s).params(4, -3).color(TX.glow, 1.6, 0.9).under(TX.dark, 0.45);
      const st = hold(k, v, DECAL.star, 0.08);
      k.decals.at(st).params(5, 2.4).color(TX.hot, 1.3, 0.8).under(C.black, 0);
      const m = k.glow.hold(SHAPE.hoop, MODE.hoop);
      m.color(TX.glow, 1.3, 0.9);
      m.add = 0.3;
      v.meshes.push(m);
    },
    update(k, v, dt) {
      // 星环随倒计时向中心收拢
      const shrink = 1 - 0.72 * v.t * v.t;
      k.decals.at(v.slots[0]).at(v.x, v.z).radius(v.radius);
      k.decals.at(v.slots[1]).at(v.x, v.z).radius(v.radius * 0.7 * shrink).rot(v.age * 2.5);
      const m = v.meshes[0];
      m.at(v.x, 0.7 + v.t * 0.6, v.z).scale(v.radius * shrink);
      m.rot(0, v.age * 3, 0);
      // 五颗小星沿环疾转
      for (let i = 0; i < 5; i++) {
        const a = v.phase + v.age * (4 + v.t * 6) + (i * TAU) / 5;
        k.sprites.draw(SPRITE.spark, v.x + Math.cos(a) * v.radius * shrink, 0.75 + v.t * 0.6, v.z + Math.sin(a) * v.radius * shrink, 0.75, a, TX.hot, 2.2, 1, 1);
      }
      emit(k, v, dt, 40, () => {
        const r = k.rnd;
        k.particles.use(P.glint).tint(C.white, TX.glow).orbit(v.x, r.range(0.1, 0.9), v.z, v.radius * r.range(0.7, 1.05), v.radius * 0.15, r.next() * TAU, 5, 0.6, 0.3, 0.3, 0.1);
      });
    },
  },

  // ── 星陨天降：持续落星的星域 ──
  xingli_ult_storm: {
    create(k, v) {
      const z = hold(k, v, DECAL.zone);
      k.decals.at(z).params(24, 0).color(TX.glow, 1.6, 0.95).under(TX.dark, 0.45);
      const rn = hold(k, v, DECAL.rune, 0.2);
      k.decals.at(rn).params(8, 0.35).color(TX.glow, 1.3, 0.75).under(TX.dark, 0.35);
      hostileEdge(k, v);
    },
    update(k, v, dt) {
      place(k, v, (i) => (i === 1 ? 0.93 : 1));
      emit(k, v, dt, 16, () => {
        const r = k.rnd;
        const a = r.next() * TAU;
        const d = v.radius * Math.sqrt(r.next()) * 0.95;
        const x = v.x + Math.cos(a) * d;
        const z = v.z + Math.sin(a) * d;
        if (r.chance(0.55)) {
          // 装饰性的细流星：与真正的陨星同一个下坠方向
          const tf = r.range(0.22, 0.3);
          k.particles.use(P.streak).tint(TX.hot, TX.glow).spawn(x + 2.4, 9.5, z - 1.8, -2.4 / tf, -9.5 / tf, 1.8 / tf, tf, 0.2, 0.1);
          k.particles.use(P.ripple).tint(TX.hot, TX.glow).spawn(x, 0.08, z, 0, 0, 0, 0.3, 0.2, 0.9, tf);
        } else k.particles.use(P.glint).tint(C.white, TX.glow).spawn(x, r.range(0.2, 2.5), z, 0, r.range(0.3, 1.2), 0, r.range(0.5, 0.9), 0.34, 0.08);
      });
    },
    end(k, v) {
      ring(k, v.x, v.z, v.radius, 0.5, TX.glow, 1.2, 0.85, 0.2);
    },
  },

  // ── 千羽天幕：持续箭雨 ──
  fengling_ult_rain: {
    create(k, v) {
      const z = hold(k, v, DECAL.zone);
      k.decals.at(z).params(20, 0).color(TF.glow, 1.5, 0.95).under(TF.dark, 0.4);
      const s = hold(k, v, DECAL.swirl, 0.2);
      k.decals.at(s).params(5, 1.3).color(TF.glow, 0.9, 0.6).under(TF.dark, 0.3);
      hostileEdge(k, v);
    },
    update(k, v, dt) {
      place(k, v);
      emit(k, v, dt, 18, () => {
        const r = k.rnd;
        const a = r.next() * TAU;
        const d = v.radius * Math.sqrt(r.next()) * 0.95;
        const x = v.x + Math.cos(a) * d;
        const z = v.z + Math.sin(a) * d;
        if (r.chance(0.7)) {
          // 两波之间零星落下的箭，让箭雨看起来是连续的
          const tf = r.range(0.16, 0.22);
          k.particles.use(P.arrow).spawn(x + 1.4, 10, z + 0.9, -1.4 / tf, -10 / tf, -0.9 / tf, tf, 0.5, 0.45);
          k.particles.use(P.ripple).tint(TF.hot, TF.glow).spawn(x, 0.08, z, 0, 0, 0, 0.26, 0.2, 0.8, tf);
        } else k.particles.use(P.leaf).orbit(v.x, 0.3, v.z, d, d * 1.1, a, 2.5, r.range(0.5, 1.5), 0.7, 0.3, 0.16);
      });
    },
    end(k, v) {
      ring(k, v.x, v.z, v.radius, 0.5, TF.glow, 1.1, 0.85, 0.2);
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
        v.def.create(k, v);
      }
      v.seen = stamp;
      this.sync(v, a, frame);
      v.def.update(k, v, frame.dt);
    }
    for (const [id, v] of this.views) {
      if (v.seen !== stamp) {
        // 从状态里消失 = 到期或被提前移除：到期的才播放收尾
        this.release(v, v.age >= v.duration - 0.12);
        this.views.delete(id);
      }
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
    for (const v of this.views.values()) this.release(v, false);
    this.views.clear();
  }
}

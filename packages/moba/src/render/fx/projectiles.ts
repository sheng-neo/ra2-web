/**
 * 投射物视图：按 state.projectiles 每帧同步(位置按 tick 插值、朝向取实际飞行方向、带拖尾与沿途星屑)，
 * 并在 projectileHit / projectileEnd 事件处播放命中 / 消散特效。
 * 追踪弹从出手者的出手高度飞向目标的胸口高度；攻城炮弹走抛物线；塔弹/水晶弹/小兵弹按队伍着色。
 */
import type * as THREE from 'three';
import type { GameEvent, Projectile, ProjectileVisual, TeamId } from '../../core/types';
import type { FrameInfo } from '../engine/context';
import { P, R, dustPuff, flash, glints, ring, shards, sparks } from './common';
import { DECAL } from './decals';
import { MODE, SHAPE, type FxMesh } from './glow';
import type { FxKit } from './kit';
import type { RibbonStyle } from './ribbons';
import { SPRITE } from './textures';
import { C, TAU, THEME, teamTheme } from './util';

interface ProjColors {
  glow: THREE.Color;
  hot: THREE.Color;
  deep: THREE.Color;
}

interface ProjDef {
  shape: number;
  mode: number;
  /** 模型缩放(长, 高, 宽) */
  scale: [number, number, number];
  intensity: number;
  add: number;
  k: number;
  /** 绕飞行轴 / 竖直轴的自转(弧度/秒) */
  roll: number;
  yawSpin: number;
  ribbon: RibbonStyle | null;
  ribbonWidth: number;
  /** 弹体光晕(直径，0 = 无) */
  halo: number;
  /** 沿途粒子的发射率(个/秒) */
  rate: number;
  /** 抛物线弧高系数(0 = 直飞) */
  arc: number;
  /** 脚下跟随的地面光斑半径(0 = 无) */
  ground: number;
  colors(team: TeamId): ProjColors;
  emit(k: FxKit, c: ProjColors, x: number, y: number, z: number, dx: number, dz: number): void;
  hit(k: FxKit, c: ProjColors, x: number, y: number, z: number, strong: boolean): void;
  end(k: FxKit, c: ProjColors, x: number, y: number, z: number): void;
}

const none = (): void => {};
const POISON: ProjColors = { glow: C.poison, hot: C.white, deep: C.poisonDeep };

function def(o: Partial<ProjDef> & Pick<ProjDef, 'shape' | 'scale' | 'colors'>): ProjDef {
  return {
    mode: MODE.core,
    intensity: 1.8,
    add: 0.6,
    k: 1,
    roll: 0,
    yawSpin: 0,
    ribbon: R.energy,
    ribbonWidth: 1,
    halo: 0,
    rate: 0,
    arc: 0,
    ground: 0,
    emit: none,
    hit: none,
    end: none,
    ...o,
  };
}

const DEFS: Record<ProjectileVisual, ProjDef> = {
  // 星璃普攻：小星辉弹
  xingli_basic: def({
    shape: SHAPE.diamond,
    scale: [0.42, 0.42, 0.42],
    colors: () => THEME.xingli,
    roll: 9,
    ribbon: R.thin,
    ribbonWidth: 1.2,
    halo: 0.9,
    rate: 14,
    emit(k, c, x, y, z) {
      k.particles.use(P.glint).tint(C.white, c.glow).spawn(x, y, z, k.rnd.signed() * 0.8, k.rnd.signed() * 0.8, k.rnd.signed() * 0.8, 0.3, 0.26, 0.06);
    },
    hit(k, c, x, y, z) {
      flash(k, x, y, z, 0.9, c.hot, 0.14);
      glints(k, x, y, z, 3, 2.6, C.white, c.glow, 0.35, 0.26);
    },
  }),
  // 流星矢：拖尾的蓝白流星(穿透)
  xingli_s1: def({
    shape: SHAPE.diamond,
    scale: [1.5, 0.75, 0.75],
    colors: () => THEME.xingli,
    intensity: 2.6,
    roll: 6,
    ribbon: R.energy,
    ribbonWidth: 2.2,
    halo: 2.3,
    rate: 46,
    ground: 1.6,
    emit(k, c, x, y, z, dx, dz) {
      const r = k.rnd;
      k.particles.use(P.glint).tint(C.white, c.glow).spawn(x + r.signed() * 0.3, y + r.signed() * 0.3, z + r.signed() * 0.3, -dx * 2 + r.signed() * 1.5, r.signed() * 1.5, -dz * 2 + r.signed() * 1.5, r.range(0.3, 0.55), 0.34, 0.08);
      if (r.chance(0.3)) k.particles.use(P.star).tint(THEME.xingli.accent, c.hot).spawn(x, y, z, -dx * 3 + r.signed() * 2, r.range(0.5, 2.5), -dz * 3 + r.signed() * 2, 0.5, 0.26, 0.1);
    },
    hit(k, c, x, y, z, strong) {
      flash(k, x, y, z, 1.9, c.hot, 0.2, true);
      glints(k, x, y, z, 7, 4.5, C.white, c.glow, 0.5, 0.32);
      ring(k, x, z, 1.4, 0.3, c.glow, 1.5, 0.2, 0.25);
      shards(k, x, y, z, 4, 5, 4, c.hot, c.glow, 0.2);
      if (strong) k.shake(0.12, x, z);
    },
    end(k, c, x, y, z) {
      flash(k, x, y, z, 1.6, c.hot, 0.22, true);
      glints(k, x, y, z, 10, 4, C.white, c.glow, 0.6, 0.3);
      ring(k, x, z, 1.2, 0.3, c.glow, 1.2, 0.2, 0.2);
    },
  }),
  // 风翎普攻：箭矢
  fengling_basic: def({
    shape: SHAPE.arrow,
    mode: MODE.solid,
    scale: [0.85, 0.85, 0.85],
    colors: () => THEME.fengling,
    intensity: 1.5,
    add: 0.25,
    ribbon: R.thin,
    ribbonWidth: 0.9,
    halo: 0.5,
    hit(k, c, x, y, z) {
      flash(k, x, y, z, 0.8, c.hot, 0.12);
      sparks(k, x, y, z, 2, 5, c.hot, c.glow, 0, 0, 0, 0.25, 0.1);
      k.particles.use(P.feather).spawn(x, y, z, k.rnd.signed() * 2, 2, k.rnd.signed() * 2, 0.7, 0.36, 0.3);
    },
  }),
  // 贯风矢：带气旋的大箭
  fengling_s1: def({
    shape: SHAPE.arrow,
    mode: MODE.solid,
    scale: [1.7, 1.7, 1.7],
    colors: () => THEME.fengling,
    intensity: 1.9,
    add: 0.35,
    roll: 14,
    ribbon: R.wind,
    ribbonWidth: 1.6,
    halo: 1.5,
    rate: 44,
    ground: 1.4,
    emit(k, c, x, y, z, dx, dz) {
      const r = k.rnd;
      // 绕箭身打旋的气流：垂直于飞行方向的平面内取一点，速度沿切向
      const a = r.next() * TAU;
      const ca = Math.cos(a) * 0.5;
      const sa = Math.sin(a) * 0.5;
      const px = -dz * ca;
      const pz = dx * ca;
      k.particles.use(P.streak).tint(c.hot, c.glow).spawn(x + px, y + sa, z + pz, -dz * -sa * 9 - dx * 4, ca * 9, dx * -sa * 9 - dz * 4, 0.2, 0.13, 0.04);
      if (r.chance(0.12)) k.particles.use(P.feather).spawn(x, y, z, -dx * 3 + r.signed() * 2, r.range(0.5, 2), -dz * 3 + r.signed() * 2, 0.8, 0.4, 0.32);
    },
    hit(k, c, x, y, z, strong) {
      flash(k, x, y, z, 1.8, c.hot, 0.18, true);
      ring(k, x, z, 1.6, 0.32, c.glow, 1.5, 0.2, 0.25);
      sparks(k, x, y, z, 6, 8, c.hot, c.glow, 0, 0, 0, 0.3, 0.13);
      const p = k.particles.use(P.feather);
      for (let i = 0; i < k.n(4); i++) p.spawn(x, y, z, k.rnd.signed() * 4, k.rnd.range(1, 4), k.rnd.signed() * 4, 0.9, 0.42, 0.34);
      if (strong) k.shake(0.14, x, z);
    },
    end(k, c, x, y, z) {
      flash(k, x, y, z, 1.3, c.hot, 0.18);
      const p = k.particles.use(P.leaf);
      for (let i = 0; i < k.n(5); i++) p.orbit(x, y - 0.4, z, 0.2, 1.2, k.rnd.next() * TAU, 8, 1, 0.45, 0.3, 0.16);
    },
  }),
  // 影刃飞旋：旋转的暗紫飞刃
  yeque_s2: def({
    shape: SHAPE.blade,
    mode: MODE.solid,
    scale: [0.72, 0.72, 0.72],
    colors: () => THEME.yeque,
    intensity: 2.1,
    add: 0.5,
    yawSpin: 26,
    ribbon: R.shadow,
    ribbonWidth: 0.75,
    halo: 1.3,
    rate: 22,
    emit(k, c, x, y, z, dx, dz) {
      const r = k.rnd;
      k.particles.use(P.wisp).spawn(x, y, z, -dx * 1.5 + r.signed(), r.range(0.2, 1.2), -dz * 1.5 + r.signed(), 0.35, 0.4, 0.8);
      if (r.chance(0.5)) k.particles.use(P.glint).tint(c.hot, c.glow).spawn(x, y, z, r.signed() * 2, r.signed() * 2, r.signed() * 2, 0.25, 0.24, 0.06);
    },
    hit(k, c, x, y, z, strong) {
      flash(k, x, y, z, 1.4, c.hot, 0.16);
      k.particles.use(P.crescent).tint(c.hot, c.glow).spawn(x, y, z, 0, 0, 0, 0.2, 0.9, 1.9);
      sparks(k, x, y, z, 5, 7, c.hot, c.glow, 0, 0, 0, 0.3, 0.12);
      if (strong) k.shake(0.08, x, z);
    },
    end(k, c, x, y, z) {
      flash(k, x, y, z, 0.9, c.glow, 0.16);
      const p = k.particles.use(P.wisp);
      for (let i = 0; i < k.n(3); i++) p.spawn(x, y, z, k.rnd.signed(), k.rnd.range(0.5, 1.5), k.rnd.signed(), 0.5, 0.5, 1);
    },
  }),
  // 远程兵的能量弹
  minion_ranged: def({
    shape: SHAPE.sphere,
    scale: [0.2, 0.2, 0.2],
    colors: teamTheme,
    ribbon: R.thin,
    ribbonWidth: 0.9,
    halo: 0.75,
    hit(k, c, x, y, z) {
      flash(k, x, y, z, 0.7, c.hot, 0.12);
      glints(k, x, y, z, 2, 2, c.hot, c.glow, 0.3, 0.2);
    },
  }),
  // 攻城兵的炮弹(抛物线)
  minion_siege: def({
    shape: SHAPE.sphere,
    scale: [0.34, 0.34, 0.34],
    colors: teamTheme,
    intensity: 2.4,
    ribbon: R.smoke,
    ribbonWidth: 1,
    halo: 1.3,
    rate: 18,
    arc: 1,
    emit(k, c, x, y, z) {
      k.particles.use(P.ember).tint(c.hot, c.glow).spawn(x, y, z, k.rnd.signed(), k.rnd.signed(), k.rnd.signed(), 0.4, 0.14, 0.04);
    },
    hit(k, c, x, y, z) {
      flash(k, x, y, z, 1.7, c.hot, 0.2, true);
      ring(k, x, z, 1.4, 0.32, c.glow, 1.4, 0.2, 0.3);
      sparks(k, x, y, z, 6, 7, c.hot, c.glow, 0, 0, 0, 0.35, 0.13);
      shards(k, x, y, z, 3, 4, 4, c.hot, c.glow, 0.18);
      dustPuff(k, x, 0.3, z, 3, 0.4, 1.2, C.dust, C.dustDark, 0.6);
    },
  }),
  // 防御塔光弹(追踪)
  tower_bolt: def({
    shape: SHAPE.diamond,
    scale: [0.95, 0.6, 0.6],
    colors: teamTheme,
    intensity: 2.6,
    roll: 10,
    ribbon: R.energy,
    ribbonWidth: 1.5,
    halo: 2,
    rate: 30,
    emit(k, c, x, y, z) {
      k.particles.use(P.glint).tint(c.hot, c.glow).spawn(x, y, z, k.rnd.signed() * 1.5, k.rnd.signed() * 1.5, k.rnd.signed() * 1.5, 0.3, 0.3, 0.06);
    },
    hit(k, c, x, y, z) {
      flash(k, x, y, z, 1.4, c.hot, 0.14);
    },
  }),
  // 水晶光弹
  core_bolt: def({
    shape: SHAPE.diamond,
    scale: [1.3, 0.85, 0.85],
    colors: teamTheme,
    intensity: 2.8,
    roll: 10,
    ribbon: R.energy,
    ribbonWidth: 2.1,
    halo: 2.8,
    rate: 40,
    emit(k, c, x, y, z) {
      k.particles.use(P.glint).tint(c.hot, c.glow).spawn(x, y, z, k.rnd.signed() * 2, k.rnd.signed() * 2, k.rnd.signed() * 2, 0.35, 0.36, 0.06);
    },
    hit(k, c, x, y, z) {
      flash(k, x, y, z, 1.9, c.hot, 0.16, true);
    },
  }),
  // 野怪吐息弹
  monster_spit: def({
    shape: SHAPE.sphere,
    scale: [0.3, 0.26, 0.26],
    colors: () => POISON,
    intensity: 1.8,
    add: 0.6,
    ribbon: R.energy,
    ribbonWidth: 0.9,
    halo: 0.9,
    rate: 16,
    emit(k, _c, x, y, z) {
      k.particles.use(P.drop).spawn(x, y, z, k.rnd.signed() * 0.6, 0.5, k.rnd.signed() * 0.6, 0.45, 0.16, 0.1);
    },
    hit(k, c, x, y, z) {
      flash(k, x, y, z, 1, c.glow, 0.16);
      ring(k, x, z, 1.1, 0.3, c.glow, 1.2, 0.2, 0.3);
      const p = k.particles.use(P.drop);
      for (let i = 0; i < k.n(5); i++) p.spawn(x, y, z, k.rnd.signed() * 3.5, k.rnd.range(1, 4), k.rnd.signed() * 3.5, 0.5, 0.2, 0.12);
    },
  }),
};

interface ProjView {
  id: number;
  def: ProjDef;
  colors: ProjColors;
  team: TeamId;
  seen: number;
  mesh: FxMesh;
  ribbon: number;
  decal: number;
  // 出手点与出手高度
  sx: number;
  sz: number;
  h0: number;
  // 上一帧的渲染位置
  x: number;
  y: number;
  z: number;
  acc: number;
  age: number;
  shown: boolean;
}

export const PROJECTILE_VISUALS = Object.keys(DEFS) as ProjectileVisual[];

export class ProjectileViews {
  private views = new Map<number, ProjView>();
  private k: FxKit;
  private stamp = 0;

  constructor(k: FxKit) {
    this.k = k;
  }

  private create(p: Projectile): ProjView {
    const k = this.k;
    const d = DEFS[p.visual];
    const colors = d.colors(p.team);
    // 出手点：按已飞行距离沿方向倒推；出手高度取出手者身上的出手口
    const sx = p.pos.x - p.dir.x * p.traveled;
    const sz = p.pos.y - p.dir.y * p.traveled;
    let h0 = 1.3;
    if (k.anchor(p.ownerId)) {
      const u = k.a.unit;
      h0 = u && (u.kind === 'tower' || u.kind === 'core') ? k.a.height * 0.82 : Math.min(k.a.height * 0.6, 2.2);
    }
    const mesh = k.glow.hold(d.shape, d.mode);
    mesh.color(colors.glow, d.intensity, 0);
    mesh.add = d.add;
    mesh.k = d.k;
    return { id: p.id, def: d, colors, team: p.team, seen: 0, mesh, ribbon: -1, decal: -1, sx, sz, h0, x: sx, y: h0, z: sz, acc: 0, age: 0, shown: false };
  }

  private release(v: ProjView): void {
    const k = this.k;
    k.glow.release(v.mesh);
    k.ribbons.end(v.ribbon);
    if (v.decal >= 0) k.decals.release(v.decal, 0.15);
  }

  update(frame: FrameInfo): void {
    const k = this.k;
    const stamp = ++this.stamp;
    const a = frame.alpha;
    const dt = frame.dt;
    for (const p of frame.state.projectiles) {
      let v = this.views.get(p.id);
      if (!v) {
        v = this.create(p);
        this.views.set(p.id, v);
      }
      v.seen = stamp;
      v.age += dt;
      const d = v.def;
      const x = p.prevPos.x + (p.pos.x - p.prevPos.x) * a;
      const z = p.prevPos.y + (p.pos.y - p.prevPos.y) * a;
      let y = 1.25;
      if (p.targetId >= 0) {
        // 追踪弹：从出手高度飞向目标胸口；进度按「已走 / (已走 + 剩余)」估计
        let tx = x;
        let tz = z;
        let th = 1;
        if (k.anchor(p.targetId)) {
          tx = k.a.x;
          tz = k.a.z;
          th = k.a.y + Math.min(k.a.height * 0.5, 3.2);
        }
        const d0 = Math.hypot(x - v.sx, z - v.sz);
        const d1 = Math.hypot(tx - x, tz - z);
        const t = d0 + d1 > 0.01 ? d0 / (d0 + d1) : 1;
        y = v.h0 + (th - v.h0) * t;
        if (d.arc > 0) y += 4 * t * (1 - t) * (1.6 + (d0 + d1) * 0.16) * d.arc;
      }
      // 迷雾里的敌方弹道不画
      let shown = p.team === frame.playerTeam || k.anchors.pointVisible(x, z);
      if (!shown && k.anchor(p.ownerId)) shown = k.a.visible;
      let dx = x - v.x;
      let dy = y - v.y;
      let dz = z - v.z;
      const moved = Math.hypot(dx, dy, dz);
      if (moved < 1e-4 || v.age <= dt) {
        dx = p.dir.x;
        dy = 0;
        dz = p.dir.y;
      } else {
        dx /= moved;
        dy /= moved;
        dz /= moved;
      }
      const m = v.mesh;
      m.at(x, y, z);
      m.a = shown ? 1 : 0;
      const pop = Math.min(1, v.age * 12 + 0.3);
      m.scale3(d.scale[0] * pop, d.scale[1] * pop, d.scale[2] * pop);
      if (d.yawSpin !== 0) m.rot(0.25, v.age * d.yawSpin, 0);
      else m.rot(v.age * d.roll, -Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz)));
      if (shown) {
        if (d.ribbon) {
          if (v.ribbon < 0) {
            v.ribbon = k.ribbons.start(d.ribbon, x, y, z, v.colors.hot, v.colors.glow);
            k.ribbons.setWidth(v.ribbon, d.ribbonWidth);
          } else k.ribbons.move(v.ribbon, x, y, z);
        }
        if (d.halo > 0) k.sprites.draw(SPRITE.glow, x, y, z, d.halo * (0.9 + 0.1 * Math.sin(v.age * 40)), 0, v.colors.glow, 1.5, 0.85, 1);
        if (d.ground > 0) {
          if (v.decal < 0) v.decal = k.decals.hold(DECAL.glow, 0.08);
          k.decals.at(v.decal).at(x, z).radius(d.ground).params(1.5).color(v.colors.glow, 0.9, 0.8).under(C.black, 0);
        }
        if (d.rate > 0) {
          v.acc += dt * d.rate * k.density;
          while (v.acc >= 1) {
            v.acc -= 1;
            d.emit(k, v.colors, x, y, z, dx, dz);
          }
        }
      } else if (v.ribbon >= 0) {
        k.ribbons.end(v.ribbon);
        v.ribbon = -1;
      }
      v.x = x;
      v.y = y;
      v.z = z;
      v.shown = shown;
    }
    for (const [id, v] of this.views) {
      if (v.seen !== stamp) {
        this.release(v);
        this.views.delete(id);
      }
    }
  }

  /** 命中 / 消散事件 */
  handle(e: Extract<GameEvent, { type: 'projectileHit' | 'projectileEnd' }>, playerId: number, playerTeam: TeamId): void {
    const k = this.k;
    const v = this.views.get(e.id);
    const d = DEFS[e.visual];
    const x = e.pos.x;
    const z = e.pos.y;
    if (!d) return;
    // 视图还在：沿用它的队伍与最后的高度；否则(弹道刚生成就命中)按默认估计
    const colors = v ? v.colors : d.colors(2);
    let y = v ? v.y : 1.2;
    if (!v?.shown && !k.anchors.pointVisible(x, z)) return;
    if (e.type === 'projectileHit') {
      if (k.anchor(e.targetId)) y = k.a.y + Math.min(k.a.height * 0.5, 3.2);
      d.hit(k, colors, x, y, z, e.targetId === playerId || (v !== undefined && v.team === playerTeam && k.a.unit !== null && k.a.unit.kind === 'hero'));
    } else {
      d.end(k, colors, x, y, z);
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

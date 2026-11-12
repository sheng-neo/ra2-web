/**
 * 投射物视图：按 state.projectiles 每帧同步(位置按 tick 插值、朝向取实际飞行方向、带拖尾与沿途星屑)，
 * 并在 projectileHit / projectileEnd 事件处播放命中 / 消散特效。
 * 追踪弹从出手者的出手高度飞向目标的胸口高度；攻城炮弹走抛物线；塔弹/水晶弹/小兵弹按队伍着色。
 */
import type * as THREE from 'three';
import type { GameEvent, Projectile, ProjectileVisual, TeamId } from '../../core/types';
import type { FrameInfo } from '../engine/context';
import { FX_RULES, P, R, dustPuff, flash, glints, hitBurst, ring, shards, sparks } from './common';
import { DECAL } from './decals';
import { MODE, SHAPE, type FxMesh } from './glow';
import type { FxKit } from './kit';
import type { RibbonStyle } from './ribbons';
import { SPRITE } from './textures';
import { C, THEME, col, teamTheme } from './util';

interface ProjColors {
  glow: THREE.Color;
  hot: THREE.Color;
  deep: THREE.Color;
  /** 拖尾的起止颜色(缺省用 glow → deep)：王昭君的弦尾是金的，弹体是月白的 */
  tail?: THREE.Color;
  tail2?: THREE.Color;
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
  /** 网格的手动进度(斩弧形状的弹体填 -2 = 不扫过，整道弧常亮) */
  progress: number;
  /** 跟在弹体后面的回声(同形状、逐个缩小变淡)个数与间距(米)：音波前锋用 */
  echo: number;
  echoGap: number;
  colors(team: TeamId): ProjColors;
  emit(k: FxKit, c: ProjColors, x: number, y: number, z: number, dx: number, dz: number): void;
  /** (dx, dz) = 弹体最后的飞行方向 */
  hit(k: FxKit, c: ProjColors, x: number, y: number, z: number, strong: boolean, dx: number, dz: number): void;
  end(k: FxKit, c: ProjColors, x: number, y: number, z: number, dx: number, dz: number): void;
}

const none = (): void => {};
/** 荧翅蛾的磷粉：青绿主色 + 琥珀芯(眼斑色) */
const PHOSPHOR: ProjColors = { glow: C.moth, hot: col(0xfff0c0), deep: col(0x1f7a72) };

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
    progress: -1,
    echo: 0,
    echoGap: 0.5,
    emit: none,
    hit: none,
    end: none,
    ...o,
  };
}

/** 王昭君：弹体月白，弦尾是金的 */
const XINGLI: ProjColors = { ...THEME.xingli, tail: C.stringGold, tail2: THEME.xingli.accent };
/** 荆轲：匕首寒白，身后一线寒光渐入墨色 */
const YEQUE: ProjColors = { ...THEME.yeque, tail: THEME.yeque.hot, tail2: THEME.yeque.deep };
/** 李广：箭后一道笔直的白线 */
const FENGLING: ProjColors = { ...THEME.fengling, tail: C.white, tail2: THEME.fengling.hot };

/** 一圈朝向镜头的音波(王昭君的命中反馈) */
function waveRing(k: FxKit, c: ProjColors, x: number, y: number, z: number, size: number, life: number, delay = 0): void {
  k.particles.use(P.ringB).tint(c.hot, c.glow).spawn(x, y, z, 0, 0, 0, life, size * 0.3, size, delay);
}

const DEFS: Record<ProjectileVisual, ProjDef> = {
  // 王昭君普攻：一枚小月牙音波(弧顶朝前，不自转) + 金色细弦尾；命中是一小圈音波
  xingli_basic: def({
    shape: SHAPE.slash,
    mode: MODE.slash,
    scale: [0.5, 0.5, 0.5],
    colors: () => XINGLI,
    intensity: 2.3,
    add: 0.45,
    k: 0.62,
    progress: -2,
    ribbon: R.string,
    ribbonWidth: 0.9,
    halo: 0.55,
    hit(k, c, x, y, z) {
      k.particles.use(P.hitFlash).tint(C.white, c.glow).spawn(x, y, z, 0, 0, 0, FX_RULES.flashBasic, 0.5, 0.85);
      waveRing(k, c, x, y, z, 1.25, 0.24);
    },
  }),
  // 一弦穿云：三道前后相叠的弧形音波前锋(宽度约等于判定宽 1.3) + 中心一根绷直的金色弦光；沿途是垂直于弹道的短促弦震线
  xingli_s1: def({
    shape: SHAPE.slash,
    mode: MODE.slash,
    scale: [0.92, 0.92, 0.92],
    colors: () => XINGLI,
    intensity: 2.4,
    add: 0.4,
    k: 0.72,
    progress: -2,
    echo: 2,
    echoGap: 0.52,
    ribbon: R.string,
    ribbonWidth: 1.5,
    halo: 1.1,
    rate: 30,
    ground: 1.1,
    emit(k, _c, x, y, z, dx, dz) {
      const r = k.rnd;
      // 弦震线：垂直于弹道、一左一右弹开的短线
      const side = r.chance(0.5) ? 1 : -1;
      const s = r.range(4.5, 7.5);
      k.particles.use(P.string).spawn(x - dx * r.range(0.3, 1.4), y + r.signed() * 0.08, z - dz * r.range(0.3, 1.4), -dz * side * s, 0, dx * side * s, 0.12, 0.05, 0.02);
    },
    hit(k, c, x, y, z, strong) {
      k.particles.use(P.hitFlash).tint(C.white, c.glow).spawn(x, y, z, 0, 0, 0, FX_RULES.flashSkill, 0.9, 1.5);
      // 两圈音波
      waveRing(k, c, x, y, z, 2.0, 0.28);
      waveRing(k, c, x, y, z, 1.4, 0.3, 0.07);
      k.decals.add(DECAL.rings, x, z, 1.3, 0.38).params(2, 0.22).color(c.glow, 1.5).under(C.shadow, 0.25);
      const p = k.particles.use(P.mote);
      for (let i = 0; i < k.n(4); i++) p.spawn(x, y, z, k.rnd.signed() * 3, k.rnd.range(0.5, 3), k.rnd.signed() * 3, 0.4, 0.2, 0.05);
      if (strong) k.shake(0.08, x, z);
    },
    end(k, c, x, y, z) {
      // 余音散开：一圈淡淡的音波 + 几点金芒
      waveRing(k, c, x, y, z, 1.8, 0.32);
      const p = k.particles.use(P.mote);
      for (let i = 0; i < k.n(6); i++) p.spawn(x, y, z, k.rnd.signed() * 2.5, k.rnd.range(-0.5, 2), k.rnd.signed() * 2.5, 0.5, 0.2, 0.05);
    },
  }),
  // 李广普攻：白羽箭
  fengling_basic: def({
    shape: SHAPE.arrow,
    mode: MODE.solid,
    scale: [1.15, 1.15, 1.15],
    colors: () => FENGLING,
    intensity: 1.3,
    add: 0.2,
    ribbon: R.thin,
    ribbonWidth: 0.9,
    halo: 0.45,
    hit(k, c, x, y, z, _strong, dx, dz) {
      hitBurst(k, x, y, z, 0.75, C.white, c.glow, dx, dz, 3, FX_RULES.flashBasic, 6);
      k.particles.use(P.plume).spawn(x, y, z, k.rnd.signed() * 2 - dx, 2, k.rnd.signed() * 2 - dz, 0.7, 0.34, 0.28);
    },
  }),
  // 白羽没石：重箭。一道笔直的破空白线 + 贴地带起的草屑；命中英雄 = 石屑迸溅(呼应「没石」)，飞到尽头 = 斜插在地上的箭
  fengling_s1: def({
    shape: SHAPE.arrow,
    mode: MODE.solid,
    scale: [2.0, 2.0, 2.0],
    colors: () => FENGLING,
    intensity: 1.45,
    add: 0.25,
    roll: 4,
    ribbon: R.white,
    ribbonWidth: 1.25,
    halo: 1.0,
    rate: 16,
    emit(k, _c, x, _y, z, dx, dz) {
      const r = k.rnd;
      const sz = r.range(0.14, 0.26);
      k.particles.use(P.grass).spawn(x + r.signed() * 0.3, 0.1, z + r.signed() * 0.3, dx * r.range(2, 5) + r.signed() * 1.5, r.range(1.2, 2.6), dz * r.range(2, 5) + r.signed() * 1.5, r.range(0.35, 0.55), sz, sz * 0.8);
    },
    hit(k, c, x, y, z, strong, dx, dz) {
      hitBurst(k, x, y, z, 1.6, C.white, c.glow, dx, dz, 6, FX_RULES.flashSkill, 9);
      ring(k, x, z, 1.5, 0.3, c.glow, 1.4, 0.2, 0.25);
      // 石屑：灰白的碎片顺着箭势向前迸开
      const p = k.particles.use(P.debris).tint(C.stone, C.stoneDark);
      for (let i = 0; i < k.n(9); i++) {
        const a = Math.atan2(dz, dx) + k.rnd.signed() * 0.9;
        const s = k.rnd.range(3, 8);
        const sz = k.rnd.range(0.12, 0.3);
        p.spawn(x, y, z, Math.cos(a) * s, k.rnd.range(1.5, 5.5), Math.sin(a) * s, k.rnd.range(0.5, 0.8), sz, sz * 0.8);
      }
      const f = k.particles.use(P.plume);
      for (let i = 0; i < k.n(3); i++) f.spawn(x, y, z, k.rnd.signed() * 3 - dx * 2, k.rnd.range(1, 3.5), k.rnd.signed() * 3 - dz * 2, 0.9, 0.4, 0.32);
      if (strong) k.shake(FX_RULES.shakeSkill, x, z);
    },
    end(k, c, x, _y, z, dx, dz) {
      // 力尽处：箭斜插进地面，停一会儿再淡去
      k.glow.spawn(SHAPE.arrow, MODE.solid, 0.7).at(x + dx * 0.2, 0.42, z + dz * 0.2).scale(1.7).rot(0, -Math.atan2(dz, dx), -0.62).color(c.hot, 1.3, 1).fade(0, 0.7).opt(0.2, 1, 0);
      k.particles.use(P.dust).spawn(x + dx * 0.6, 0.12, z + dz * 0.6, dx, 0.8, dz, 0.4, 0.4, 0.9);
      const sz = 0.2;
      k.particles.use(P.grass).spawn(x + dx * 0.6, 0.12, z + dz * 0.6, dx * 2, 2.2, dz * 2, 0.5, sz, sz * 0.8);
    },
  }),
  // 引匕一掷：匕首形，刃尖朝前直飞，绕飞行轴慢转；寒白细尾 + 很淡的墨点。命中 = 短促的十字寒光 + 墨溅；落空 = 钉进地面后淡出
  yeque_s2: def({
    shape: SHAPE.dagger,
    mode: MODE.solid,
    scale: [0.86, 0.86, 0.86],
    colors: () => YEQUE,
    intensity: 1.55,
    add: 0.2,
    roll: 3,
    ribbon: R.thin,
    ribbonWidth: 0.85,
    halo: 0.5,
    rate: 14,
    emit(k, _c, x, y, z, dx, dz) {
      const r = k.rnd;
      const sz = r.range(0.06, 0.13);
      k.particles.use(P.inkDot).spawn(x - dx * 0.5, y, z - dz * 0.5, -dx * 1.5 + r.signed(), r.range(0, 0.8), -dz * 1.5 + r.signed(), 0.3, sz, sz * 0.6);
    },
    hit(k, c, x, y, z, strong) {
      k.particles.use(P.hitFlash).tint(C.white, c.hot).spawn(x, y, z, 0, 0, 0, FX_RULES.flashBasic, 0.6, 1.0);
      // 十字寒光：一枚四芒闪光，瞬间放大即逝
      k.particles.use(P.glint).tint(c.hot, c.hot).spawn(x, y, z, 0, 0, 0, 0.14, 0.7, 1.5);
      k.particles.use(P.ink).spawn(x, y, z, 0, 0.3, 0, 0.36, 0.5, 0.95, 0.02);
      const p = k.particles.use(P.inkDot);
      for (let i = 0; i < k.n(5); i++) {
        const sz = k.rnd.range(0.07, 0.16);
        p.spawn(x, y, z, k.rnd.signed() * 4, k.rnd.range(0.5, 3), k.rnd.signed() * 4, 0.4, sz, sz * 0.7);
      }
      if (strong) k.shake(0.06, x, z);
    },
    end(k, c, x, _y, z, dx, dz) {
      k.glow.spawn(SHAPE.dagger, MODE.solid, 0.55).at(x + dx * 0.15, 0.3, z + dz * 0.15).scale(0.86).rot(0.4, -Math.atan2(dz, dx), -0.7).color(c.hot, 1.5, 1).fade(0, 0.6).opt(0.2, 1, 0);
      k.particles.use(P.inkFlat).spawn(x + dx * 0.4, 0.07, z + dz * 0.4, 0, 0, 0, 0.7, 0.4, 0.7);
    },
  }),
  // 远程兵(提灯傀儡)的灯火弹：小而清楚，不和英雄技能抢眼
  minion_ranged: def({
    shape: SHAPE.sphere,
    scale: [0.17, 0.17, 0.17],
    colors: teamTheme,
    intensity: 1.6,
    ribbon: R.thin,
    ribbonWidth: 0.75,
    halo: 0.6,
    hit(k, c, x, y, z) {
      hitBurst(k, x, y, z, 0.6, c.hot, c.glow, 0, 0, 2, FX_RULES.flashBasic, 4);
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
  // 防御塔光弹(追踪)：更粗的实芯 + 短而实的尾，读成「有分量的一发」；落点的冲击由 hit_tower 画
  tower_bolt: def({
    shape: SHAPE.diamond,
    scale: [1.1, 0.72, 0.72],
    colors: teamTheme,
    intensity: 2.4,
    add: 0.45,
    k: 1.4,
    roll: 10,
    ribbon: R.bolt,
    ribbonWidth: 1.3,
    halo: 1.7,
    rate: 22,
    emit(k, c, x, y, z) {
      k.particles.use(P.glint).tint(c.hot, c.glow).spawn(x, y, z, k.rnd.signed() * 1.2, k.rnd.signed() * 1.2, k.rnd.signed() * 1.2, 0.22, 0.26, 0.05);
    },
    hit(k, c, x, y, z) {
      flash(k, x, y, z, 1.1, c.hot, FX_RULES.flashBasic);
    },
  }),
  // 水晶光弹
  core_bolt: def({
    shape: SHAPE.diamond,
    scale: [1.35, 0.9, 0.9],
    colors: teamTheme,
    intensity: 2.6,
    add: 0.45,
    k: 1.4,
    roll: 10,
    ribbon: R.bolt,
    ribbonWidth: 1.8,
    halo: 2.3,
    rate: 30,
    emit(k, c, x, y, z) {
      k.particles.use(P.glint).tint(c.hot, c.glow).spawn(x, y, z, k.rnd.signed() * 2, k.rnd.signed() * 2, k.rnd.signed() * 2, 0.35, 0.36, 0.06);
    },
    hit(k, c, x, y, z) {
      flash(k, x, y, z, 1.9, c.hot, 0.16, true);
    },
  }),
  // 荧翅蛾的磷粉弹(§5.4)：一团青色磷粉，琥珀小芯 + 短拖尾，沿途掉落细粉
  monster_spit: def({
    shape: SHAPE.sphere,
    scale: [0.24, 0.22, 0.22],
    colors: () => PHOSPHOR,
    mode: MODE.core,
    intensity: 1.7,
    add: 0.5,
    k: 1.2,
    ribbon: R.dusty,
    ribbonWidth: 1,
    halo: 0.9,
    rate: 26,
    emit(k, c, x, y, z) {
      const r = k.rnd;
      if (r.chance(0.6)) k.particles.use(P.puff).tint(c.glow, c.deep).spawn(x, y, z, r.signed() * 0.5, r.range(-0.2, 0.3), r.signed() * 0.5, 0.35, 0.3, 0.6);
      else k.particles.use(P.glint).tint(c.hot, c.glow).spawn(x, y, z, r.signed() * 0.8, r.range(-0.6, 0.2), r.signed() * 0.8, 0.45, 0.2, 0.05);
    },
    hit(k, c, x, y, z) {
      hitBurst(k, x, y, z, 1.0, c.hot, c.glow, 0, 0, 3, FX_RULES.flashBasic, 4);
      const p = k.particles.use(P.puff).tint(c.glow, c.deep);
      for (let i = 0; i < k.n(4); i++) p.spawn(x, y, z, k.rnd.signed() * 1.6, k.rnd.range(0.2, 1), k.rnd.signed() * 1.6, 0.5, 0.4, 1.1);
      glints(k, x, y, z, 4, 2.2, c.hot, c.glow, 0.5, 0.22);
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
  /** 最后一帧的水平飞行方向(命中 / 消散特效用) */
  dx: number;
  dz: number;
  echoes: FxMesh[];
}

export const PROJECTILE_VISUALS = Object.keys(DEFS) as ProjectileVisual[];

export class ProjectileViews {
  private views = new Map<number, ProjView>();
  /** 与 views 同步的列表：逐帧清扫用它遍历(遍历 Map 会分配迭代器) */
  private list: ProjView[] = [];
  private k: FxKit;
  private stamp = 0;

  constructor(k: FxKit) {
    this.k = k;
  }

  private create(p: Projectile): ProjView {
    const k = this.k;
    const d = DEFS[p.visual];
    const colors = d.colors(p.team);
    // 出手点：按已飞行距离沿方向倒推；出手高度取出手者模型的弹道出口(塔/水晶取能量核心)，没有挂点信息时按身高估算
    const sx = p.pos.x - p.dir.x * p.traveled;
    const sz = p.pos.y - p.dir.y * p.traveled;
    let h0 = 1.3;
    if (k.anchor(p.ownerId)) {
      const u = k.a.unit;
      const structure = u !== null && (u.kind === 'tower' || u.kind === 'core');
      h0 = structure ? k.a.height * 0.82 : Math.min(k.a.height * 0.6, 2.2);
      if (k.anchors.attach?.(p.ownerId, structure ? 'core' : 'muzzle', k.v)) h0 = k.v.y;
    }
    const mesh = k.glow.hold(d.shape, d.mode);
    // 实体类(箭/飞刃)用亮色：木色箭杆 + 发光箭镞；能量弹用主色
    mesh.color(d.mode === MODE.solid ? colors.hot : colors.glow, d.intensity, 0);
    mesh.add = d.add;
    mesh.k = d.k;
    mesh.progress = d.progress;
    const echoes: FxMesh[] = [];
    for (let i = 0; i < d.echo; i++) {
      const m = k.glow.hold(d.shape, d.mode);
      m.color(colors.glow, d.intensity * (0.8 - i * 0.22), 0);
      m.add = d.add;
      m.k = d.k;
      m.progress = d.progress;
      echoes.push(m);
    }
    return { id: p.id, def: d, colors, team: p.team, seen: 0, mesh, ribbon: -1, decal: -1, sx, sz, h0, x: sx, y: h0, z: sz, acc: 0, age: 0, shown: false, dx: p.dir.x, dz: p.dir.y, echoes };
  }

  private release(v: ProjView): void {
    const k = this.k;
    k.glow.release(v.mesh);
    for (const m of v.echoes) k.glow.release(m);
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
        this.list.push(v);
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
      // 回声：跟在弹体后面，一个比一个小、一个比一个淡；刚出手时还没拉开距离，贴着弹体不显示
      for (let i = 0; i < v.echoes.length; i++) {
        const em = v.echoes[i];
        const back = Math.min(d.echoGap * (i + 1), Math.hypot(x - v.sx, z - v.sz));
        const sc = pop * (1 - 0.14 * (i + 1));
        em.at(x - dx * back, y - dy * back, z - dz * back).scale3(d.scale[0] * sc, d.scale[1] * sc, d.scale[2] * sc).rot(m.rx, m.ry, m.rz);
        em.a = shown && back > d.echoGap * (i + 0.5) ? 0.85 - i * 0.25 : 0;
      }
      const hl = Math.hypot(dx, dz);
      if (hl > 1e-4) {
        v.dx = dx / hl;
        v.dz = dz / hl;
      }
      if (shown) {
        if (d.ribbon) {
          if (v.ribbon < 0) {
            v.ribbon = k.ribbons.start(d.ribbon, x, y, z, v.colors.tail ?? v.colors.glow, v.colors.tail2 ?? v.colors.deep);
            k.ribbons.setWidth(v.ribbon, d.ribbonWidth);
          } else k.ribbons.move(v.ribbon, x, y, z);
        }
        if (d.halo > 0) k.sprites.draw(SPRITE.glow, x, y, z, d.halo * (0.9 + 0.1 * Math.sin(v.age * 40)), 0, v.colors.glow, 1.25, 0.8, 0.5);
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
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      if (v.seen === stamp) continue;
      this.release(v);
      this.views.delete(v.id);
      list[i] = list[list.length - 1];
      list.pop();
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
    const dx = v ? v.dx : 1;
    const dz = v ? v.dz : 0;
    if (e.type === 'projectileHit') {
      if (k.anchor(e.targetId)) y = k.a.y + Math.min(k.a.height * 0.5, 3.2);
      d.hit(k, colors, x, y, z, e.targetId === playerId || (v !== undefined && v.team === playerTeam && k.a.unit !== null && k.a.unit.kind === 'hero'), dx, dz);
    } else {
      d.end(k, colors, x, y, z, dx, dz);
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

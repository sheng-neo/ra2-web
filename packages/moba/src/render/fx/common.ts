/**
 * 各种效果共用的粒子样式、拖尾样式与「积木」函数(火花、尘环、碎石、闪光、冲击环、光柱、斩弧…)。
 * 样式都是模块级常量：运行时发射粒子不再分配对象。
 */
import type * as THREE from 'three';
import { DECAL } from './decals';
import { MODE, SHAPE, type FxMesh } from './glow';
import type { FxKit } from './kit';
import { ORIENT, particleStyle } from './particles';
import { ribbonStyle } from './ribbons';
import { SPRITE } from './textures';
import { C, TAU } from './util';

export const P = {
  /** 拉伸火花：受重力下坠 */
  spark: particleStyle({ sprite: SPRITE.streak, orient: ORIENT.stretch, color: 0xfff0c8, color2: 0xff8a30, intensity: 2.0, intensity2: 1.1, gravity: 13, drag: 3.2, stretch: 0.045, fadeIn: 0.01, fadeOut: 0.35 }),
  /** 无重力的能量流线 */
  streak: particleStyle({ sprite: SPRITE.streak, orient: ORIENT.stretch, color: 0xffffff, intensity: 1.8, intensity2: 1.0, drag: 2.2, stretch: 0.05, fadeIn: 0.02, fadeOut: 0.35, add: 0.85 }),
  /** 四芒星闪烁 */
  glint: particleStyle({ sprite: SPRITE.spark, color: 0xffffff, intensity: 1.8, intensity2: 1.1, drag: 2.4, spin: 2.5, fadeIn: 0.15, fadeOut: 0.35 }),
  /** 瞬间光晕 */
  flash: particleStyle({ sprite: SPRITE.glow, add: 0.55, color: 0xffffff, intensity: 1.05, intensity2: 0.65, alpha: 0.9, fadeIn: 0.02, fadeOut: 0.1 }),
  /** 大而柔的色晕(铺色用，不带白核) */
  haze: particleStyle({ sprite: SPRITE.soft, color: 0xffffff, intensity: 1, alpha: 0.6, alpha2: 0, fadeIn: 0.1, fadeOut: 0.2 }),
  /** 放射爆闪 */
  burst: particleStyle({ sprite: SPRITE.burst, add: 0.6, color: 0xffffff, intensity: 1.25, intensity2: 0.8, fadeIn: 0.02, fadeOut: 0.15, spin: 0.8 }),
  /** 尘土烟团(遮挡型) */
  dust: particleStyle({ sprite: SPRITE.smoke, sprite2: SPRITE.smoke2, add: 0, color: 0xc4b294, color2: 0xa49272, alpha: 0.62, alpha2: 0.28, drag: 2.8, gravity: -0.5, spin: 0.9, fadeIn: 0.08, fadeOut: 0.3, vary: 0.22 }),
  /** 深色浓烟 */
  smoke: particleStyle({ sprite: SPRITE.smoke, sprite2: SPRITE.smoke2, add: 0, color: 0x5a5560, color2: 0x2a2830, alpha: 0.7, alpha2: 0.3, drag: 1.6, gravity: -1.1, spin: 0.7, fadeIn: 0.1, fadeOut: 0.35, vary: 0.25 }),
  /** 碎石片 */
  debris: particleStyle({ sprite: SPRITE.shard, add: 0, color: 0xa39686, color2: 0x7d7166, gravity: 22, drag: 0.5, spin: 10, fadeIn: 0.01, fadeOut: 0.78, vary: 0.35 }),
  /** 发光晶屑 */
  shard: particleStyle({ sprite: SPRITE.diamond, add: 0.35, color: 0xffffff, intensity: 1.8, intensity2: 1.0, gravity: 14, drag: 1.2, spin: 9, fadeIn: 0.01, fadeOut: 0.6, vary: 0.2 }),
  /** 上飘的余烬 */
  ember: particleStyle({ sprite: SPRITE.ember, color: 0xffc070, color2: 0xff4a18, intensity: 2.0, intensity2: 1, gravity: -2.4, drag: 1.4, fadeIn: 0.05, fadeOut: 0.4, vary: 0.3 }),
  /** 火舌(尖朝上) */
  flame: particleStyle({ sprite: SPRITE.flame, add: 0.2, color: 0xffae30, color2: 0xe02c10, intensity: 1.3, intensity2: 0.9, gravity: -4.5, drag: 1.6, rot: 0, fadeIn: 0.1, fadeOut: 0.35, vary: 0.2 }),
  /** 实心星 */
  star: particleStyle({ sprite: SPRITE.star, add: 0.4, color: 0xffffff, intensity: 1.7, intensity2: 1.1, drag: 2.2, spin: 3, fadeIn: 0.08, fadeOut: 0.45 }),
  feather: particleStyle({ sprite: SPRITE.feather, add: 0.22, color: 0xffffff, color2: 0xcfffe8, intensity: 1.15, gravity: 2.4, drag: 2.6, spin: 4, fadeIn: 0.05, fadeOut: 0.6 }),
  leaf: particleStyle({ sprite: SPRITE.leaf, add: 0.2, color: 0xb8ffd8, color2: 0x5fe0a8, intensity: 1.4, gravity: 0.8, drag: 2.2, spin: 6, fadeIn: 0.06, fadeOut: 0.5 }),
  /** 暗影烟缕 */
  wisp: particleStyle({ sprite: SPRITE.wisp, sprite2: SPRITE.smoke, add: 0.12, color: 0x5a3aa8, color2: 0x1a1030, alpha: 0.8, alpha2: 0.3, gravity: -1.8, drag: 1.8, spin: 1.2, fadeIn: 0.1, fadeOut: 0.35, vary: 0.2 }),
  coin: particleStyle({ sprite: SPRITE.coin, add: 0.2, color: 0xffd860, color2: 0xffc030, intensity: 1.5, gravity: 14, drag: 0, spin: 5, fadeIn: 0.02, fadeOut: 0.85 }),
  /** 朝向相机的扩散环 */
  ringB: particleStyle({ sprite: SPRITE.ring, add: 0.5, color: 0xffffff, intensity: 2, intensity2: 1, fadeIn: 0.03, fadeOut: 0.25 }),
  plus: particleStyle({ sprite: SPRITE.plus, add: 0.35, color: 0xa8ffc0, color2: 0x38e080, intensity: 2, intensity2: 1.2, gravity: -1.2, drag: 1.2, rot: 0, fadeIn: 0.12, fadeOut: 0.5 }),
  hex: particleStyle({ sprite: SPRITE.hex, add: 0.4, color: 0xe8f6ff, color2: 0x8fc8ff, intensity: 2, intensity2: 1.2, gravity: 6, drag: 1.6, spin: 5, fadeIn: 0.02, fadeOut: 0.5 }),
  rune: particleStyle({ sprite: SPRITE.rune1, sprite2: SPRITE.rune2, add: 0.45, color: 0xffffff, intensity: 2.1, intensity2: 1.2, gravity: -0.8, drag: 1.5, rot: 0, fadeIn: 0.15, fadeOut: 0.55 }),
  /** 贴地扩散的小环(涟漪) */
  ripple: particleStyle({ sprite: SPRITE.ring, orient: ORIENT.flat, add: 0.5, color: 0xffffff, intensity: 1.6, intensity2: 0.8, fadeIn: 0.05, fadeOut: 0.3 }),
  drop: particleStyle({ sprite: SPRITE.drop, add: 0.3, color: 0xc8f070, color2: 0x5faa2c, intensity: 1.4, gravity: 16, drag: 0.8, rot: 0, fadeIn: 0.02, fadeOut: 0.7 }),
  frost: particleStyle({ sprite: SPRITE.frost, add: 0.45, color: 0xe8f8ff, color2: 0x7fd0ff, intensity: 2, intensity2: 1.1, gravity: 0.6, drag: 2, spin: 2, fadeIn: 0.12, fadeOut: 0.5 }),
  chevron: particleStyle({ sprite: SPRITE.chevron, add: 0.5, color: 0xffffff, intensity: 1.8, drag: 1, fadeIn: 0.15, fadeOut: 0.5 }),
  /** 月牙斩痕公告板 */
  crescent: particleStyle({ sprite: SPRITE.crescent, add: 0.4, color: 0xffffff, intensity: 1.6, intensity2: 0.9, fadeIn: 0.03, fadeOut: 0.2 }),
  /** 下落的箭 */
  arrow: particleStyle({ sprite: SPRITE.arrow, orient: ORIENT.stretch, add: 0.35, color: 0xf4fff8, color2: 0x9dffd8, intensity: 1.9, stretch: 0.012, fadeIn: 0.04, fadeOut: 0.92 }),
  bubble: particleStyle({ sprite: SPRITE.bubble, add: 0.5, color: 0xffffff, intensity: 1.5, gravity: -1.5, drag: 1.5, fadeIn: 0.15, fadeOut: 0.6 }),
  bolt: particleStyle({ sprite: SPRITE.bolt, color: 0xfff6c0, intensity: 2.4, fadeIn: 0.02, fadeOut: 0.3, spin: 0 }),
};

export const R = {
  /** 冲刺的尘迹 */
  dust: ribbonStyle({ width: 1.3, life: 0.5, color: 0xc4b294, color2: 0x9a8a70, add: 0, noise: 0.85, taper: 1.5, core: 0, alpha: 0.55, step: 0.35 }),
  /** 通用能量拖尾(着色由 tint 给) */
  energy: ribbonStyle({ width: 0.5, life: 0.32, color: 0xffffff, intensity: 1.5, intensity2: 0.9, add: 0.3, taper: 0.1, core: 0.4, step: 0.2 }),
  /** 细亮线 */
  thin: ribbonStyle({ width: 0.16, life: 0.22, color: 0xffffff, intensity: 1.9, intensity2: 1.0, add: 0.5, taper: 0, core: 0.6, step: 0.2 }),
  /** 火焰尾迹 */
  fire: ribbonStyle({ width: 1.5, life: 0.5, color: 0xffa028, color2: 0xd82410, intensity: 1.45, intensity2: 0.9, add: 0.25, noise: 0.9, taper: 0.5, core: 0.5, step: 0.3 }),
  /** 风痕 */
  wind: ribbonStyle({ width: 0.7, life: 0.4, color: 0xc8ffe6, color2: 0x2ee096, intensity: 1.35, intensity2: 0.8, add: 0.3, noise: 0.6, taper: 0.2, core: 0.3, step: 0.25 }),
  /** 暗影残迹 */
  shadow: ribbonStyle({ width: 1.3, life: 0.45, color: 0x8a5cff, color2: 0x1a1030, intensity: 1.3, intensity2: 0.6, add: 0.35, noise: 0.8, taper: 0.6, core: 0.25, alpha: 0.9, step: 0.3 }),
  /** 烟迹(炮弹) */
  smoke: ribbonStyle({ width: 0.6, life: 0.6, color: 0x8a8690, color2: 0x4a4650, add: 0, noise: 0.9, taper: 1.6, core: 0, alpha: 0.5, step: 0.3 }),
  /** 警示连线(本帧直线) */
  warn: ribbonStyle({ width: 0.22, life: 1, color: 0xff3a28, intensity: 1.8, add: 0.4, noise: 0.35, core: 0.6 }),
  /** 锁定连线 */
  link: ribbonStyle({ width: 0.14, life: 1, color: 0xffffff, intensity: 1.5, add: 0.45, noise: 0.2, core: 0.5 }),
};

/**
 * 大面积光效的全局强度系数。场景本身很亮(暖色砂岩、曝光 1.22)，纯加色的大片光一叠就过曝，
 * 经 ACES 之后只剩发白的浅色；所以壳/球/柱/斩弧一律用「半遮挡」混合(add ≈ 0.5)：先盖住一部分地面再发光，
 * 颜色才饱和。纯加色只留给火花、星点这类小面积的东西。
 */
const K_SHELL = 0.6;
const K_ORB = 0.55;
const K_PILLAR = 0.55;
const K_HOOP = 0.65;
const K_SLASH = 0.6;

/** 向四周迸射的拉伸火花。(dx, dz) 为偏向方向(单位向量)，bias 0..1 */
export function sparks(k: FxKit, x: number, y: number, z: number, count: number, speed: number, c0: THREE.Color = C.warm, c1: THREE.Color = C.sparkDeep, dx = 0, dz = 0, bias = 0, life = 0.4, size = 0.14): void {
  const p = k.particles.use(P.spark).tint(c0, c1);
  const r = k.rnd;
  const n = k.n(count);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const up = r.range(0.1, 1);
    const h = Math.sqrt(1 - up * up * 0.6);
    const s = speed * r.range(0.45, 1);
    p.spawn(x, y, z, (Math.cos(a) * h * (1 - bias) + dx * bias * r.range(0.6, 1.3)) * s, up * s * 0.9, (Math.sin(a) * h * (1 - bias) + dz * bias * r.range(0.6, 1.3)) * s, life * r.range(0.6, 1.2), size * r.range(0.7, 1.3), size * 0.4);
  }
}

/** 向四周飘散的闪烁星点(无重力) */
export function glints(k: FxKit, x: number, y: number, z: number, count: number, speed: number, c0: THREE.Color, c1: THREE.Color = c0, life = 0.6, size = 0.34): void {
  const p = k.particles.use(P.glint).tint(c0, c1);
  const r = k.rnd;
  const n = k.n(count);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const el = r.range(-0.3, 1);
    const h = Math.sqrt(Math.max(0, 1 - el * el));
    const s = speed * r.range(0.35, 1);
    p.spawn(x, y, z, Math.cos(a) * h * s, el * s, Math.sin(a) * h * s, life * r.range(0.6, 1.2), size * r.range(0.6, 1.3), size * 0.2, r.range(0, 0.06));
  }
}

/** 一团光晕闪一下 */
export function flash(k: FxKit, x: number, y: number, z: number, size: number, c: THREE.Color, life = 0.22, burst = false): void {
  k.particles.use(P.flash).tint(c).spawn(x, y, z, 0, 0, 0, life, size * 0.45, size * 0.85);
  if (burst) k.particles.use(P.burst).tint(c).spawn(x, y, z, 0, 0, 0, life * 0.9, size * 0.6, size * 1.3);
}

/** 贴地向外翻滚的尘环 */
export function dustRing(k: FxKit, x: number, z: number, count: number, radius: number, speed: number, c0: THREE.Color = C.dust, c1: THREE.Color = C.dustDark, size = 1.1, life = 0.8): void {
  const p = k.particles.use(P.dust).tint(c0, c1);
  const r = k.rnd;
  const n = k.n(count);
  const a0 = r.next() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + r.range(-0.2, 0.2);
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    const s = speed * r.range(0.7, 1.15);
    p.spawn(x + cs * radius, r.range(0.15, 0.4), z + sn * radius, cs * s, r.range(0.2, 1.2), sn * s, life * r.range(0.7, 1.2), size * r.range(0.5, 0.8), size * r.range(1.2, 1.8));
  }
}

/** 原地腾起的烟尘团 */
export function dustPuff(k: FxKit, x: number, y: number, z: number, count: number, spread: number, size: number, c0: THREE.Color = C.dust, c1: THREE.Color = C.dustDark, life = 0.7): void {
  const p = k.particles.use(P.dust).tint(c0, c1);
  const r = k.rnd;
  const n = k.n(count);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const d = Math.sqrt(r.next()) * spread;
    p.spawn(x + Math.cos(a) * d, y + r.range(0, 0.4), z + Math.sin(a) * d, Math.cos(a) * r.range(0.3, 1.4), r.range(0.4, 1.6), Math.sin(a) * r.range(0.3, 1.4), life * r.range(0.7, 1.2), size * r.range(0.5, 0.8), size * r.range(1.1, 1.7));
  }
}

/** 抛起的碎石片 */
export function debris(k: FxKit, x: number, z: number, count: number, speed: number, up: number, radius = 0.3, c0: THREE.Color = C.rock, c1: THREE.Color = C.dustDark, size = 0.3): void {
  const p = k.particles.use(P.debris).tint(c0, c1);
  const r = k.rnd;
  const n = k.n(count);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const s = speed * r.range(0.3, 1);
    const d = radius * Math.sqrt(r.next());
    const sz = size * r.range(0.5, 1.4);
    p.spawn(x + Math.cos(a) * d, 0.2, z + Math.sin(a) * d, Math.cos(a) * s, up * r.range(0.5, 1.2), Math.sin(a) * s, r.range(0.7, 1.2), sz, sz * 0.8);
  }
}

/** 发光晶屑(队伍色/主题色) */
export function shards(k: FxKit, x: number, y: number, z: number, count: number, speed: number, up: number, c0: THREE.Color, c1: THREE.Color = c0, size = 0.26): void {
  const p = k.particles.use(P.shard).tint(c0, c1);
  const r = k.rnd;
  const n = k.n(count);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const s = speed * r.range(0.3, 1);
    const sz = size * r.range(0.5, 1.3);
    p.spawn(x, y, z, Math.cos(a) * s, up * r.range(0.3, 1.2), Math.sin(a) * s, r.range(0.6, 1.1), sz, sz * 0.5);
  }
}

/** 上飘的余烬 */
export function embers(k: FxKit, x: number, y: number, z: number, count: number, spread: number, speed: number, c0: THREE.Color = C.spark, c1: THREE.Color = C.ember, life = 1.0, size = 0.16): void {
  const p = k.particles.use(P.ember).tint(c0, c1);
  const r = k.rnd;
  const n = k.n(count);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const d = Math.sqrt(r.next()) * spread;
    p.spawn(x + Math.cos(a) * d, y + r.range(0, 0.5), z + Math.sin(a) * d, Math.cos(a) * speed * r.range(0.2, 1), speed * r.range(0.4, 1.4), Math.sin(a) * speed * r.range(0.2, 1), life * r.range(0.5, 1.2), size * r.range(0.6, 1.4), size * 0.3, r.range(0, 0.15));
  }
}

/** 冲击环贴花：半径从 r0 比例扩到 radius(精确) */
export function ring(k: FxKit, x: number, z: number, radius: number, life: number, c: THREE.Color, intensity = 1.6, from = 0.15, under = 0.35, delay = 0): void {
  // under 是相对强度：统一放大到足以在亮地面上压出深色晕
  const pen = k.decals.add(DECAL.ring, x, z, radius, life).params(from, 1).color(c, intensity).under(C.shadow, Math.min(1, under * 1.8 + 0.1));
  if (delay > 0) pen.delay(delay);
}

/** 地面柔光斑 */
export function groundGlow(k: FxKit, x: number, z: number, radius: number, life: number, c: THREE.Color, intensity = 1, power = 1.6): void {
  k.decals.add(DECAL.glow, x, z, radius, life).params(power).color(c, intensity).under(C.black, 0);
}

/** 焦痕/暗斑 */
export function scorch(k: FxKit, x: number, z: number, radius: number, life: number, emberColor: THREE.Color = C.black, base: THREE.Color = C.shadow, strength = 0.8): void {
  k.decals.add(DECAL.scorch, x, z, radius, life).color(emberColor, 1.6).under(base, strength);
}

/** 向外膨胀的光壳(半球形冲击波) */
export function shockShell(k: FxKit, x: number, y: number, z: number, r0: number, r1: number, life: number, c: THREE.Color, intensity = 1.6, alpha = 0.9): FxMesh {
  return k.glow.spawn(SHAPE.sphere, MODE.rim, life).at(x, y, z).scale(r0, r1).color(c, intensity * K_SHELL, alpha).fade(0.05, 0.25).opt(0.3, 2.6, 1);
}

/** 中心亮的光球闪光 */
export function orb(k: FxKit, x: number, y: number, z: number, r0: number, r1: number, life: number, c: THREE.Color, intensity = 2, alpha = 1): FxMesh {
  return k.glow.spawn(SHAPE.sphere, MODE.core, life).at(x, y, z).scale(r0, r1).color(c, intensity * K_ORB, alpha).fade(0.05, 0.2).opt(0.5, 2.2, 1);
}

/** 竖直光柱 */
export function pillar(k: FxKit, x: number, z: number, radius: number, height: number, life: number, c: THREE.Color, intensity = 1.8, alpha = 0.9, y = 0.05): FxMesh {
  return k.glow.spawn(SHAPE.pillar, MODE.pillar, life).at(x, y, z).scale3(radius * 0.6, height * 0.5, radius * 0.6, radius, height, radius).color(c, intensity * K_PILLAR, alpha).fade(0.08, 0.35).opt(0.25, 1.15, 1);
}

/** 向上移动的光环箍 */
export function hoop(k: FxKit, x: number, y: number, z: number, r0: number, r1: number, rise: number, life: number, c: THREE.Color, intensity = 1.8, alpha = 0.9): FxMesh {
  return k.glow.spawn(SHAPE.hoop, MODE.hoop, life).at(x, y, z).vel(0, rise, 0).scale(r0, r1).color(c, intensity * K_HOOP, alpha).fade(0.1, 0.45).opt(0.3, 2, 1);
}

/** 斩弧网格本身的张角(弧度)：要画成 A 弧度的弧，把实例的 k 设为 A / SLASH_SPAN */
export const SLASH_SPAN = 2.5;

/**
 * 月牙斩弧：弧顶朝 facing(模拟层角度)，外半径 radius。tilt 为绕前进轴的侧倾，sweep = 沿弧扫过(挥砍感)。
 * 返回实例可继续改(spin、vel、k…)。
 */
export function slashArc(k: FxKit, x: number, y: number, z: number, facing: number, radius: number, life: number, c: THREE.Color, intensity = 2.2, tilt = 0, sweep = true, alpha = 1): FxMesh {
  const m = k.glow.spawn(SHAPE.slash, MODE.slash, life).at(x, y, z).scale(radius * 0.92, radius).rot(tilt, -facing, 0).color(c, intensity * K_SLASH, alpha).fade(0.02, 0.5).opt(0.2, 1, 1);
  if (!sweep) m.progress = -2;
  return m;
}

/** 岩刺破土而出，停留后沉回地下。lean 为向外倾斜(弧度)，朝 dirAngle 方向倒 */
export function rockSpike(k: FxKit, x: number, z: number, width: number, height: number, life: number, dirAngle: number, lean: number, tint: THREE.Color = C.white, delay = 0): void {
  const m = k.glow.spawn(SHAPE.spike, MODE.plain, life).at(x, -0.05, z).scale3(width * 0.6, height * 0.05, width * 0.6, width, height, width).color(tint, 1);
  m.ease = 4;
  // 先绕 z 倒向 +x，再绕 y 转到 dirAngle
  m.rot(0, -dirAngle + k.rnd.range(-0.3, 0.3), -lean);
  if (delay > 0) m.delay(delay);
}

/** 抛飞的受光碎岩(真 3D，落地后消失) */
export function boulders(k: FxKit, x: number, z: number, count: number, speed: number, up: number, size: number, tint: THREE.Color = C.white): void {
  const r = k.rnd;
  const n = Math.max(1, Math.round(count * (0.5 + 0.5 * k.density)));
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU;
    const s = speed * r.range(0.4, 1);
    const vy = up * r.range(0.6, 1.1);
    const g = 20;
    // 寿命 = 落回地面的时间
    const life = (2 * vy) / g;
    const sz = size * r.range(0.5, 1.2);
    const m = k.glow.spawn(SHAPE.rock, MODE.plain, life).at(x + Math.cos(a) * 0.4, 0.1, z + Math.sin(a) * 0.4).vel(Math.cos(a) * s, vy, Math.sin(a) * s, g).scale(sz, sz * 0.7).color(tint, 1);
    m.ease = 3;
    m.rot(r.next() * 3, r.next() * 6, r.next() * 3).spin(r.range(-7, 7), r.range(-5, 5), r.range(-7, 7));
  }
}

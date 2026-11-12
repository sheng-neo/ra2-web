/**
 * FxKit：特效底层的总装。持有粒子 / 拖尾 / 贴花 / 网格特效 / 精灵批五个子系统与同一只特效时钟，
 * 并提供定时器、单位跟踪器、临时点光、分级震屏等公共设施。所有具体效果(effects/*, projectiles, areas, status, aim)都只和它打交道。
 */
import * as THREE from 'three';
import type { FrameInfo, RenderContext } from '../engine/context';
import type { QualitySettings } from '../engine/quality';
import { type UnitAnchor, type UnitAnchors, createAnchor, createDefaultAnchors } from './anchors';
import { DecalSystem } from './decals';
import { GlowSystem } from './glow';
import { ParticleSystem } from './particles';
import { type RibbonStyle, RibbonSystem } from './ribbons';
import { SpriteBatch } from './sprites';
import { createFxAtlas } from './textures';
import { Rand } from './util';

interface Timer {
  at: number;
  fn: () => void;
}

interface Tracker {
  unitId: number;
  t0: number;
  dur: number;
  fn: (a: UnitAnchor, t: number, dt: number) => void;
  end: (() => void) | null;
}

/** 每档画质的粒子容量与数量倍率 */
const DENSITY: Record<string, { cap: number; scale: number }> = {
  low: { cap: 2048, scale: 0.45 },
  medium: { cap: 4096, scale: 0.7 },
  high: { cap: 6144, scale: 1 },
};

const _focus = new THREE.Vector3();

export class FxKit {
  readonly ctx: RenderContext;
  readonly atlas: THREE.DataTexture;
  readonly particles: ParticleSystem;
  readonly ribbons: RibbonSystem;
  readonly decals: DecalSystem;
  readonly glow: GlowSystem;
  readonly sprites: SpriteBatch;
  readonly rnd = new Rand(0x9e3779b9);
  /** 公用锚点缓冲(调用 anchor() 后立即读取，不要跨调用持有) */
  readonly a = createAnchor();
  anchors: UnitAnchors;
  /** 特效时钟(秒)与本帧步长 */
  now = 0;
  dt = 0;
  /** 粒子数量倍率(随画质) */
  density = 1;
  /** 每帧在各子系统上传之前调用的钩子(叠加层的世界标记挂在这里，保证与本帧镜头同步) */
  readonly hooks: ((frame: FrameInfo) => void)[] = [];
  /** clear() 时通知各个持有常驻贴花/网格句柄的模块：句柄已全部失效 */
  readonly onClear: (() => void)[] = [];

  private timers: Timer[] = [];
  private trackers: Tracker[] = [];
  private tmp = new THREE.Vector3();

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
    this.atlas = createFxAtlas();
    const d = DENSITY[ctx.settings.name] ?? DENSITY.high;
    this.density = d.scale;
    this.particles = new ParticleSystem(this.atlas, d.cap);
    this.ribbons = new RibbonSystem();
    this.decals = new DecalSystem();
    this.glow = new GlowSystem();
    this.sprites = new SpriteBatch(this.atlas);
    this.anchors = createDefaultAnchors(ctx, new THREE.Vector3());
    const resolve = (id: number, out: THREE.Vector3): boolean => {
      if (!this.anchors.get(id, this.a)) return false;
      out.set(this.a.x, this.a.y, this.a.z);
      return true;
    };
    this.decals.resolve = resolve;
    this.glow.resolve = resolve;
    ctx.layers.fx.add(this.decals.mesh, this.decals.xrayMesh, this.glow.group, this.ribbons.mesh, this.particles.mesh, this.sprites.mesh);
  }

  setQuality(s: QualitySettings): void {
    const d = DENSITY[s.name] ?? DENSITY.high;
    this.density = d.scale;
    this.particles.setCapacity(d.cap);
  }

  /** 按画质缩放的粒子数(至少 1) */
  n(count: number): number {
    const v = count * this.density;
    const f = Math.floor(v);
    // 小数部分按概率取整：低画质下少量粒子的效果不至于整个消失或数量突变
    return Math.max(1, f + (this.rnd.next() < v - f ? 1 : 0));
  }

  /** delay 秒后执行(特效时钟) */
  after(delay: number, fn: () => void): void {
    this.timers.push({ at: this.now + delay, fn });
  }

  /** 在 dur 秒内每帧回调单位的锚点(t ∈ 0..1)。单位消失或到时结束，结束时调 end */
  track(unitId: number, dur: number, fn: (a: UnitAnchor, t: number, dt: number) => void, end?: () => void): void {
    this.trackers.push({ unitId, t0: this.now, dur, fn, end: end ?? null });
  }

  /** 给单位挂一条跟随 dur 秒的拖尾(冲刺/跃击) */
  trail(unitId: number, style: RibbonStyle, dur: number, height: number, tint?: THREE.Color, tint2?: THREE.Color, side = 0, dirX = 0, dirZ = 0): void {
    if (!this.anchors.get(unitId, this.a)) return;
    const ox = -dirZ * side;
    const oz = dirX * side;
    const h = this.ribbons.start(style, this.a.x + ox, this.a.y + height, this.a.z + oz, tint, tint2);
    if (h < 0) return;
    this.track(
      unitId,
      dur,
      (a) => this.ribbons.move(h, a.x + ox, a.y + height, a.z + oz),
      () => this.ribbons.end(h),
    );
  }

  /** 查询单位锚点，结果在 this.a */
  anchor(id: number | undefined): boolean {
    if (id !== undefined && id >= 0 && this.anchors.get(id, this.a)) return true;
    // 失败时清掉 unit，免得调用方误读上一次查询的残留
    this.a.unit = null;
    return false;
  }

  /** 临时点光(受引擎点光池限制；low 档无效) */
  light(x: number, z: number, height: number, color: THREE.Color, intensity: number, radius: number, duration: number): void {
    this.ctx.lights.pulse(x, z, height, color, intensity, radius, duration);
  }

  /** 到镜头注视点的水平距离 */
  focusDist(x: number, z: number): number {
    this.ctx.rig.getFocus(_focus);
    return Math.hypot(x - _focus.x, z - _focus.z);
  }

  /** 震屏：按离镜头注视点的距离衰减(12 米内全额，32 米外无) */
  shake(strength: number, x: number, z: number): void {
    const d = this.focusDist(x, z);
    const k = d <= 12 ? 1 : d >= 32 ? 0 : 1 - (d - 12) / 20;
    if (k > 0) this.ctx.rig.shake(strength * k);
  }

  /** 推进时钟、跑定时器与跟踪器。之后由模块依次同步投射物/区域/状态，再调 flush() */
  begin(frame: FrameInfo): void {
    const dt = frame.dt;
    this.dt = dt;
    this.now += dt;
    const now = this.now;
    this.particles.now = now;
    this.ribbons.now = now;
    this.decals.now = now;
    this.glow.now = now;
    this.anchors.begin(frame);
    this.sprites.begin();

    const timers = this.timers;
    if (timers.length > 0) {
      let w = 0;
      // 回调里可能再注册定时器：只处理进入循环时已有的那部分
      const n = timers.length;
      for (let i = 0; i < n; i++) {
        const t = timers[i];
        if (t.at <= now) t.fn();
        else timers[w++] = t;
      }
      for (let i = n; i < timers.length; i++) timers[w++] = timers[i];
      timers.length = w;
    }

    const trackers = this.trackers;
    if (trackers.length > 0) {
      let w = 0;
      const n = trackers.length;
      for (let i = 0; i < n; i++) {
        const tr = trackers[i];
        const t = tr.dur > 0 ? (now - tr.t0) / tr.dur : 1;
        const ok = this.anchors.get(tr.unitId, this.a);
        if (ok) tr.fn(this.a, t > 1 ? 1 : t, dt);
        if (!ok || t >= 1) tr.end?.();
        else trackers[w++] = tr;
      }
      for (let i = n; i < trackers.length; i++) trackers[w++] = trackers[i];
      trackers.length = w;
    }
  }

  /** 跑钩子并把各子系统本帧的改动上传 */
  flush(frame: FrameInfo): void {
    for (const h of this.hooks) h(frame);
    this.particles.flush();
    this.ribbons.flush();
    this.decals.flush(this.dt);
    this.glow.flush();
    this.sprites.flush();
  }

  /** 清空所有进行中的效果(画廊页切换/重开对局) */
  clear(): void {
    for (const tr of this.trackers) tr.end?.();
    this.trackers.length = 0;
    this.timers.length = 0;
    this.particles.clear();
    this.ribbons.clear();
    this.decals.clear();
    this.glow.clear();
    for (const fn of this.onClear) fn();
  }

  /** 临时向量(仅限当前表达式内使用) */
  get v(): THREE.Vector3 {
    return this.tmp;
  }

  dispose(): void {
    const layer = this.ctx.layers.fx;
    layer.remove(this.decals.mesh, this.decals.xrayMesh, this.glow.group, this.ribbons.mesh, this.particles.mesh, this.sprites.mesh);
    this.particles.dispose();
    this.ribbons.dispose();
    this.decals.dispose();
    this.glow.dispose();
    this.sprites.dispose();
    this.atlas.dispose();
    this.timers.length = 0;
    this.trackers.length = 0;
    this.hooks.length = 0;
    this.onClear.length = 0;
  }
}

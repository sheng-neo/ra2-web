/**
 * GameRenderer 的宿主实现：引擎 + 模块注册。render/index.ts 用默认模块列表调用它；
 * 各模块的画廊页也可以直接调用 `createRendererCore(container, state, opts, [地形, 自己的模块])` 做隔离测试。
 */
import * as THREE from 'three';
import type { GameEvent, GameState, PlayerTeam, Unit, Vec2 } from '../../core/types';
import type { AimIndicator, GameRenderer, Quality, RendererOptions, RendererStats } from '../api';
import type { FrameInfo, RenderContext, RenderModule, RenderModuleFactory, TerrainQuery, UnitQuery } from './context';
import { RenderEngine } from './engine';

/** 契约之外的扩展能力(画廊页 / 调试用)。契约里的可选方法在这里都有实现 */
export interface GameRendererCore extends GameRenderer {
  readonly engine: RenderEngine;
  readonly context: RenderContext;
  setCameraShake(enabled: boolean): void;
  snapCamera(): void;
  setDeathTint(amount: number): void;
  prewarm(): void;
  /** 与 render 相同的一帧推进(相机/模块/时钟)，但不提交绘制：快进、无头长跑、定格前的预滚 */
  advance(state: GameState, alpha: number, dtReal: number): void;
  /**
   * 换了一局或时间轴跳变而不重建渲染器时调用：清空单位视图、进行中的特效、飘字与血条残影，镜头直接对准玩家。
   * 之后照常 render(newState, …) 即可。
   */
  reset(): void;
}

const FLAT_TERRAIN: TerrainQuery = { heightAt: () => 0, waterLevel: 0, inWater: () => false };

function defaultHeight(u: Unit): number {
  switch (u.kind) {
    case 'hero':
      return 2.5;
    case 'minion':
      return u.minionType === 'super' || u.minionType === 'siege' ? 2.0 : 1.5;
    case 'tower':
      return 8;
    case 'core':
      return 7;
    case 'monster':
      return 1.2 + u.radius * 1.6;
  }
}

export function createRendererCore(container: HTMLElement, state: GameState, opts: RendererOptions, factories: RenderModuleFactory[]): GameRendererCore {
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const engine = new RenderEngine(container, opts.quality);

  const overlayRoot = document.createElement('div');
  overlayRoot.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none;';
  container.appendChild(overlayRoot);

  const layers = { terrain: new THREE.Group(), units: new THREE.Group(), fx: new THREE.Group() };
  layers.terrain.name = 'terrain';
  layers.units.name = 'units';
  layers.fx.name = 'fx';
  engine.scene.add(layers.terrain, layers.units, layers.fx);

  /** 玩家英雄(每帧要查好几次：用循环，不建闭包) */
  const playerOf = (s: GameState): GameState['heroes'][number] | null => {
    const heroes = s.heroes;
    for (let i = 0; i < heroes.length; i++) if (heroes[i].id === s.playerId) return heroes[i];
    return null;
  };
  const playerTeamOf = (s: GameState): PlayerTeam => playerOf(s)?.team ?? 0;
  const frame: FrameInfo = { state, alpha: 1, dt: 0, time: 0, frame: 0, playerTeam: playerTeamOf(state) };

  // 默认的单位位置查询：按模拟状态插值。每帧重建 id 索引(复用同一个 Map)
  const unitIndex = new Map<number, Unit>();
  let indexedFrame = -1;
  const lookup = (id: number): Unit | undefined => {
    if (indexedFrame !== frame.frame) {
      unitIndex.clear();
      for (const u of frame.state.units) unitIndex.set(u.id, u);
      indexedFrame = frame.frame;
    }
    return unitIndex.get(id);
  };
  const defaultQuery: UnitQuery = {
    getPosition(id, out) {
      const u = lookup(id);
      if (!u) return false;
      const a = frame.alpha;
      out.set(u.prevPos.x + (u.pos.x - u.prevPos.x) * a, 0, u.prevPos.y + (u.pos.y - u.prevPos.y) * a);
      return true;
    },
    getHeight(id) {
      const u = lookup(id);
      return u ? defaultHeight(u) : 2;
    },
  };

  const modules: RenderModule[] = [];
  const ctx: RenderContext = {
    renderer: engine.renderer,
    scene: engine.scene,
    camera: engine.rig.camera,
    rig: engine.rig,
    lights: engine.lights,
    grade: engine.grade,
    layers,
    map: state.map,
    container,
    overlayRoot,
    viewport: engine.viewport,
    get quality(): Quality {
      return engine.quality;
    },
    get settings() {
      return engine.settings;
    },
    frame,
    unitQuery: defaultQuery,
    terrain: FLAT_TERRAIN,
    setUnitQuery(q) {
      ctx.unitQuery = q;
    },
    worldToScreen: (x, h, z, out) => engine.worldToScreen(x, h, z, out),
    screenToGround: (cx, cy) => engine.screenToGround(cx, cy),
    getModule<T extends RenderModule>(name: string): T | undefined {
      return modules.find((m) => m.name === name) as T | undefined;
    },
  };

  // 镜头夹取以可走区域的边界为准(相机装置按屏幕占比换算：界外装饰带只露出一小条)
  const b = state.map.bound;
  engine.rig.bounds = { minX: -b, maxX: b, minZ: -b, maxZ: b };

  for (const f of factories) modules.push(f(ctx));

  /** 预热做过了吗(切画质、上下文恢复后所有材质要重编译，需要再做一遍) */
  let warmed = false;

  engine.onQualityChanged = (s) => {
    for (const m of modules) m.setQuality?.(s);
  };
  engine.onResized = () => {
    for (const m of modules) m.resize?.(engine.viewport);
  };
  // 上下文失而复得：着色器全部要重编译，下一帧出图前再预热一遍
  engine.onContextRestored = () => {
    warmed = false;
  };

  const followPlayer = (s: GameState, alpha: number): void => {
    const hero = playerOf(s);
    if (!hero) return;
    engine.rig.setFollow(hero.prevPos.x + (hero.pos.x - hero.prevPos.x) * alpha, hero.prevPos.y + (hero.pos.y - hero.prevPos.y) * alpha);
  };
  followPlayer(state, 1);
  engine.rig.update(0);

  const tmp = { x: 0, y: 0, visible: false };
  const tmp2 = { x: 0, y: 0, visible: false };
  const pos = new THREE.Vector3();

  /** 内置拾取：按屏幕距离选最近的可见存活单位(半径按投影换算，最小约 26px) */
  const pickFallback = (clientX: number, clientY: number, s: GameState): number => {
    let best = -1;
    let bestScore = Infinity;
    for (const u of s.units) {
      if (!u.alive || u.id === s.playerId) continue;
      if (u.team !== frame.playerTeam && !u.visible[frame.playerTeam]) continue;
      if (!ctx.unitQuery.getPosition(u.id, pos)) continue;
      const mid = Math.min(1.4, ctx.unitQuery.getHeight(u.id) * 0.45);
      engine.worldToScreen(pos.x, pos.y + mid, pos.z, tmp);
      if (!tmp.visible) continue;
      engine.worldToScreen(pos.x + u.radius + 0.35, pos.y + mid, pos.z, tmp2);
      const r = Math.max(26, Math.abs(tmp2.x - tmp.x) * 1.25);
      const d = Math.hypot(tmp.x - clientX, tmp.y - clientY);
      if (d > r) continue;
      const score = d / r;
      if (score < bestScore) {
        bestScore = score;
        best = u.id;
      }
    }
    return best;
  };

  let disposed = false;

  // 瞄准前探：长射程技能朝屏幕外(尤其是朝南)瞄的时候，镜头往那边让一让，保证指示器末端看得见
  let aim: AimIndicator | null = null;
  const updateReach = (s: GameState, alpha: number): void => {
    const rig = engine.rig;
    if (!aim || aim.kind === 'self' || aim.kind === 'target') {
      rig.setReach(null);
      return;
    }
    const hero = playerOf(s);
    if (!hero || !hero.alive) {
      rig.setReach(null);
      return;
    }
    const hx = hero.prevPos.x + (hero.pos.x - hero.prevPos.x) * alpha;
    const hz = hero.prevPos.y + (hero.pos.y - hero.prevPos.y) * alpha;
    let dx: number;
    let dz: number;
    let len: number;
    if (aim.kind === 'position') {
      // 落点(超出射程时夹到射程圈上)再往外带一点落点圈的半径
      dx = aim.pos.x - hx;
      dz = aim.pos.y - hz;
      const d = Math.hypot(dx, dz);
      len = Math.min(d, aim.range) + Math.min(aim.radius, 2.5);
    } else {
      dx = aim.dir.x;
      dz = aim.dir.y;
      len = aim.range;
    }
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) rig.setReach(null);
    else rig.setReach(hx + (dx / d) * len, hz + (dz / d) * len);
  };

  const prewarmPass = (): void => {
    if (disposed) return;
    warmed = true;
    // 用当前帧信息(步长 0)让各模块把本帧的实例摆好，再让引擎把整个场景不分可见与否画一遍
    frame.dt = 0;
    engine.updateCamera(0);
    const finish: (() => void)[] = [];
    for (const m of modules) {
      const f = m.prewarm?.();
      if (f) finish.push(f);
    }
    try {
      for (const m of modules) m.update(frame);
      engine.prewarm();
    } finally {
      for (const f of finish) f();
    }
  };
  /** 对外的预热：做完再补画正常的一帧，免得「全场景可见」的预热画面留在 canvas 上 */
  const prewarm = (): void => {
    if (disposed) return;
    prewarmPass();
    for (const m of modules) m.update(frame);
    engine.render(0, true);
  };

  const step = (s: GameState, alpha: number, dtReal: number, draw: boolean): void => {
    if (disposed) return;
    const dt = Math.min(Math.max(dtReal, 0), 0.1);
    if (draw && !warmed) {
      // 第一次出图前自动预热(集成层的加载页正好盖着)；同一次调用里紧接着画正常的一帧，预热画面不会被呈现出来
      frame.state = s;
      frame.alpha = alpha;
      frame.playerTeam = playerTeamOf(s);
      followPlayer(s, alpha);
      prewarmPass();
    }
    frame.state = s;
    frame.alpha = alpha;
    frame.dt = dt;
    frame.time = engine.time + dt;
    frame.frame = engine.frame + 1;
    frame.playerTeam = playerTeamOf(s);
    followPlayer(s, alpha);
    updateReach(s, alpha);
    engine.updateCamera(dt);
    for (const m of modules) m.update(frame);
    engine.render(dt, draw);
  };
  const api: GameRendererCore = {
    engine,
    context: ctx,
    render(s: GameState, alpha: number, dtReal: number): void {
      step(s, alpha, dtReal, true);
    },
    advance(s: GameState, alpha: number, dtReal: number): void {
      step(s, alpha, dtReal, false);
    },
    reset(): void {
      if (disposed) return;
      for (const m of modules) m.reset?.();
      engine.rig.snap();
    },
    handleEvents(events: GameEvent[], s: GameState): void {
      if (disposed || events.length === 0) return;
      for (const m of modules) m.handleEvents?.(events, s);
    },
    setAim(a: AimIndicator | null): void {
      aim = a;
      for (const m of modules) m.setAim?.(a);
    },
    setQuality(q: Quality): void {
      if (q === engine.quality) return;
      engine.setQuality(q);
      // 换档后受光材质全部重编译：下一帧出图前重新预热，免得之后边打边卡
      warmed = false;
    },
    resize(): void {
      engine.resize();
    },
    screenToGround(clientX: number, clientY: number): Vec2 | null {
      return engine.screenToGround(clientX, clientY);
    },
    worldToScreen(p: Vec2, height = 0): { x: number; y: number; visible: boolean } {
      return engine.worldToScreen(p.x, height, p.y, { x: 0, y: 0, visible: false });
    },
    pickUnit(clientX: number, clientY: number, s: GameState): number {
      for (const m of modules) if (m.pickUnit) return m.pickUnit(clientX, clientY, s);
      return pickFallback(clientX, clientY, s);
    },
    setCameraPeek(p: Vec2 | null): void {
      if (p) engine.rig.setPeek(p.x, p.y);
      else engine.rig.setPeek(null);
    },
    getStats(): RendererStats {
      return engine.getStats();
    },
    setCameraShake(enabled: boolean): void {
      engine.rig.shakeEnabled = enabled;
    },
    snapCamera(): void {
      engine.rig.snap();
    },
    setDeathTint(amount: number): void {
      engine.setDeathTint(amount);
    },
    prewarm,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (let i = modules.length - 1; i >= 0; i--) modules[i].dispose();
      modules.length = 0;
      engine.dispose();
      overlayRoot.remove();
    },
  };
  return api;
}

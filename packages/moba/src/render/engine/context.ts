/**
 * 渲染模块的插槽与共享上下文。
 *
 * GameRenderer = 引擎(RenderEngine) + 一组 RenderModule。每个模块(地形 / 单位视图 / 特效 / 叠加层…)
 * 由一个工厂函数 `(ctx) => RenderModule` 创建，拿到同一个 RenderContext：
 *
 *   export const createUnitViews: RenderModuleFactory = (ctx) => {
 *     const root = new THREE.Group(); ctx.layers.units.add(root);
 *     return {
 *       name: 'units',
 *       update(frame) { ... 读 frame.state / frame.alpha / frame.dt ... },
 *       handleEvents(events, state) { ... },
 *       dispose() { ctx.layers.units.remove(root); ...释放几何/材质... },
 *     };
 *   };
 *
 * 模块之间通过 ctx.unitQuery / ctx.terrain / ctx.getModule(name) 协作，不直接互相 import 实现。
 *
 * 约定：
 * - 坐标：模拟 (x, y) → 世界 (x, 高度, z = y)；朝向 facing = atan2(y, x)，模型 +x 朝前时绕 y 轴旋转 -facing。
 * - 透明物体的 renderOrder：水面 1，瀑布 2，地形贴地纹样 3，单位脚下光环 4，技能地面贴花/预警圈 5，
 *   环境粒子 6，特效粒子/拖尾 ≥ 7。贴地透明物一律 depthWrite=false，并略高于地面(y ≥ 0.03)或开 polygonOffset。
 * - 受光物体用 materials.ts 的 createToonMaterial；需要投影的网格设 castShadow=true(阴影相机自动贴合镜头)。
 *   主光方向取 engine/lighting.ts 的 SUN_DIR / SUN_SHADOW_DIR / SUN_SHADOW_LENGTH，不要写死。
 * - 自写的受光 shader：环境光过一遍 GLSL_LIGHT_TINT(kitLightTint / kitTintAmbient)，暗部色读共享 uniform
 *   uShadeTintGround(地表/水面/贴花) 或 SHARED.uShadeTint(实体)，不要各写各的常量。
 * - 灯光数量固定(主光 + 半球光 + 点光池)，不要往场景里增删灯：灯数变化会让所有受光 shader 重编译。
 *   需要技能闪光用 ctx.lights.pulse(...)。
 * - 每帧热路径不要分配对象；静态物体设 matrixAutoUpdate=false。
 */
import type * as THREE from 'three';
import type { GameEvent, GameState, MapData, PlayerTeam, Vec2 } from '../../core/types';
import type { AimIndicator, Quality } from '../api';
import type { CameraRig } from './camera';
import type { LightRig } from './lighting';
import type { LightTint } from './lighttint';
import type { GradeParams } from './post';
import type { QualitySettings } from './quality';

/** 每帧信息(同一个对象逐帧复用，不要长期持有其中的引用以外的值) */
export interface FrameInfo {
  state: GameState;
  /** 上一 tick → 当前 tick 的插值系数 */
  alpha: number;
  /** 距上一帧的真实秒数(已限幅到 0.1) */
  dt: number;
  /** 渲染器启动以来累计的真实秒数 */
  time: number;
  frame: number;
  /** 玩家所在队伍(敌我着色、可见性判断) */
  playerTeam: PlayerTeam;
}

/** 单位的渲染位置查询。默认实现按模拟状态插值(高度恒 0)；R2 的单位视图模块应通过 ctx.setUnitQuery 换成带跳跃/击飞高度的版本 */
export interface UnitQuery {
  /** 渲染位置(世界坐标：x, 离地高度, z)。单位不存在返回 false */
  getPosition(id: number, out: THREE.Vector3): boolean;
  /** 模型高度(米)：血条/状态图标的挂点 */
  getHeight(id: number): number;
}

/** 地形查询(由地形模块提供) */
export interface TerrainQuery {
  /** 地表高度：陆地为 0，河床处为负(单位脚底可以据此略微下沉，营造涉水感；不用也可以) */
  heightAt(x: number, y: number): number;
  /** 水面高度(河道范围内有意义) */
  readonly waterLevel: number;
  /** 是否在河道水面范围内 */
  inWater(x: number, y: number): boolean;
}

export interface RenderLayers {
  /** 静态场景(地形模块) */
  terrain: THREE.Group;
  /** 单位/建筑/投射物模型(R2) */
  units: THREE.Group;
  /** 特效：粒子/贴花/范围指示(R3) */
  fx: THREE.Group;
}

export interface Viewport {
  /** CSS 像素 */
  width: number;
  height: number;
  dpr: number;
}

export interface RenderContext {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** 相机装置：shake(strength) / setPeek / getFocus */
  readonly rig: CameraRig;
  /** 灯光装置：pulse(...) 技能闪光；sun / hemi */
  readonly lights: LightRig;
  /**
   * 环境染色贴图(128²，覆盖 ±64 米)：stamp(x, z, radius, color, strength) 盖彩色环境光斑，occlude(x, z, radius, amount) 盖天空光遮蔽，
   * 全部盖完后 bake() 上传。地形模块在场景构建时写入；受光着色器通过 GLSL_LIGHT_TINT 的 kitLightTint(worldXZ) 读取。
   */
  readonly lightTint: LightTint;
  /** 调色参数(后期启用时生效)：desaturate / dim / exposure… */
  readonly grade: GradeParams;
  readonly layers: RenderLayers;
  readonly map: MapData;
  /** 渲染器所在容器 */
  readonly container: HTMLElement;
  /** 铺满容器、位于 canvas 之上的 DOM 层(pointer-events:none)：血条/飘字/名字等世界内叠加元素放这里 */
  readonly overlayRoot: HTMLElement;
  readonly viewport: Viewport;
  readonly quality: Quality;
  readonly settings: QualitySettings;
  /** 最近一帧的信息(update 之外也可读，例如 handleEvents 里) */
  readonly frame: FrameInfo;
  unitQuery: UnitQuery;
  terrain: TerrainQuery;
  setUnitQuery(q: UnitQuery): void;
  /** 世界坐标 → 屏幕坐标(相对视口的 clientX/clientY)；结果写入 out 并返回 */
  worldToScreen(x: number, height: number, z: number, out: { x: number; y: number; visible: boolean }): { x: number; y: number; visible: boolean };
  screenToGround(clientX: number, clientY: number): Vec2 | null;
  getModule<T extends RenderModule = RenderModule>(name: string): T | undefined;
}

export interface RenderModule {
  /** 唯一名：'terrain' | 'units' | 'fx' | 'overlay' … */
  readonly name: string;
  /** 每帧调用(在相机更新之后、绘制之前) */
  update(frame: FrameInfo): void;
  handleEvents?(events: GameEvent[], state: GameState): void;
  /** 画质切换(同时会收到一次 resize) */
  setQuality?(settings: QualitySettings): void;
  resize?(viewport: Viewport): void;
  /** 技能瞄准指示器(叠加层/特效模块实现) */
  setAim?(aim: AimIndicator | null): void;
  /** 精确拾取(单位视图模块实现)。未实现时用内置的屏幕距离拾取 */
  pickUnit?(clientX: number, clientY: number, state: GameState): number;
  /** 换了一局/时间轴跳变(不重建渲染器)：丢掉所有跟对局状态绑定的视图与进行中的效果 */
  reset?(): void;
  /**
   * 预热(加载阶段)：把还没出场的东西(小兵/野怪/废墟模型等)提前建好并放进场景，让随后的一次全场景绘制能编译到它们的着色器、
   * 上传它们的几何。返回一个可选的收尾函数，在那次绘制之后调用。
   */
  prewarm?(): (() => void) | void;
  dispose(): void;
}

export type RenderModuleFactory = (ctx: RenderContext) => RenderModule;

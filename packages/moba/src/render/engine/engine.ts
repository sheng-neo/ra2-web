/**
 * 渲染引擎：WebGLRenderer 初始化(sRGB 输出、统一的 Neutral 高光段色调映射)、画质档切换、相机/灯光装置、环境染色贴图、
 * 后期管线、坐标换算、尺寸适配、统计与彻底释放。不含任何游戏内容(由 RenderModule 往场景里加)。
 */
import * as THREE from 'three';
import type { Vec2 } from '../../core/types';
import type { Quality, RendererStats } from '../api';
import { BASE_GRADE, PALETTE, TONE_MAPPING, disposeSharedTextures, installToneMapping, tickShared } from '../materials';
import { setUnitPatternsEnabled } from '../models/shading';
import { CameraRig } from './camera';
import { disposeObject3D } from './dispose';
import { LightRig } from './lighting';
import { LightTint } from './lighttint';
import { PostPipeline, supportsHdrTargets, type GradeParams } from './post';
import { QUALITY, type QualitySettings } from './quality';

const _ray = new THREE.Ray();
const _v = new THREE.Vector3();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * 跨对局复用同一个 WebGLRenderer(同一个 canvas、同一个 GL 上下文)。
 *
 * 以前每局结束都 forceContextLoss()：那是一次同步的 GL 调用，要等 GPU 进程把排队的帧全部画完才返回，
 * 软件渲染下能把主线程卡住十几秒(结算页刚淡入就僵住)；不丢上下文又会攒出「Too many active WebGL contexts」。
 * 现在释放时只销毁场景资源(几何/材质/贴图/渲染目标，全是异步的删除指令)，把渲染器停放在这里，下一局接着用：
 * 整个会话只占一个上下文，释放不再阻塞，开局也省掉一次上下文创建。
 * 上下文已经丢失的渲染器不停放(直接弃用，下次新建)；同时存在第二个渲染器时(画廊页/异常流程)多出来的那个照旧销毁。
 */
let parked: THREE.WebGLRenderer | null = null;

function contextLost(r: THREE.WebGLRenderer): boolean {
  try {
    return r.getContext().isContextLost();
  } catch {
    return true;
  }
}

function acquireRenderer(): THREE.WebGLRenderer {
  const r = parked;
  parked = null;
  if (r) {
    if (!contextLost(r)) return r;
    r.dispose();
  }
  const created = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: false, depth: true, powerPreference: 'high-performance' });
  created.info.autoReset = false;
  return created;
}

/**
 * 停放期间把绘图缓冲缩到最小，不白占显存。改 canvas 尺寸也是同步的 GL 操作(实测软件渲染下同样会卡 4 秒)，
 * 所以不能在释放那一刻做：先插一个栅栏，轮询到 GPU 把积压的指令都执行完了再缩；期间渲染器被取走就作罢。
 */
function shrinkWhenIdle(r: THREE.WebGLRenderer): void {
  const gl = r.getContext() as WebGL2RenderingContext;
  let sync: WebGLSync | null = null;
  try {
    sync = typeof gl.fenceSync === 'function' ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    gl.flush();
  } catch {
    sync = null;
  }
  if (!sync) return;
  let tries = 0;
  const poll = (): void => {
    if (parked !== r || contextLost(r)) return;
    const status = gl.clientWaitSync(sync, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED && ++tries < 150) {
      window.setTimeout(poll, 200);
      return;
    }
    gl.deleteSync(sync);
    if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
      r.setPixelRatio(1);
      r.setSize(1, 1, false);
    }
  };
  window.setTimeout(poll, 200);
}

function releaseRenderer(r: THREE.WebGLRenderer): void {
  r.setRenderTarget(null);
  r.renderLists.dispose();
  const lost = contextLost(r);
  if (!lost && !parked) {
    parked = r;
    shrinkWhenIdle(r);
    return;
  }
  r.dispose();
  // 上下文还活着的多余渲染器：主动丢掉上下文，别占着浏览器的上下文名额
  if (!lost) r.forceContextLoss();
}

/** 没有后期管线(low 档)时阵亡去色的兜底：给 canvas 加 CSS 滤镜 */
function cssTint(amount: number): string {
  return amount > 0.004 ? `grayscale(${(amount * 0.9).toFixed(3)}) brightness(${(1 - amount * 0.16).toFixed(3)})` : '';
}

export class RenderEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly scene: THREE.Scene;
  readonly rig: CameraRig;
  readonly lights: LightRig;
  /** 环境染色贴图(发光体/基地/河道对周围的染色 + 天空光遮蔽)。地形模块在场景构建时盖印并 bake */
  readonly lightTint = new LightTint();
  readonly grade: GradeParams;
  readonly viewport = { width: 1, height: 1, dpr: 1 };
  quality: Quality;
  settings: QualitySettings;
  /** 累计真实时间(秒) / 帧号 */
  time = 0;
  frame = 0;
  /** 画质或尺寸变化后的回调(模块据此调整) */
  onQualityChanged: ((s: QualitySettings) => void) | null = null;
  onResized: (() => void) | null = null;
  /** 浏览器把丢失的 GL 上下文还回来之后(three 已重建内部状态；所有着色器都要重新编译) */
  onContextRestored: (() => void) | null = null;
  private readonly handleRestored = (): void => this.onContextRestored?.();

  private container: HTMLElement;
  private post: PostPipeline | null = null;
  private hdrOk: boolean;
  private stats: RendererStats = { fps: 60, drawCalls: 0, triangles: 0 };
  private fpsAccum = 0;
  private fpsFrames = 0;
  private disposed = false;
  /** canvas 在视口里的位置与尺寸(resize 时缓存；坐标换算每帧要调很多次，不能每次都触发布局查询) */
  private rect = { left: 0, top: 0, width: 1, height: 1 };
  private rectFrame = 0;
  /** 阵亡去色 0..1(见 setDeathTint)。没人调用过 setDeathTint 时不碰调色参数(老的调用方可能还在直接写 grade) */
  private deathTint = 0;
  private tintUsed = false;
  private cssFilter = '';
  /**
   * 自适应分辨率：帧率持续低于约 26fps 时逐级降低渲染分辨率(最低到档位上限的 0.6 倍)，只降不升，
   * 切换画质时复位。自动化测试(navigator.webdriver)下关闭，保证截图分辨率稳定。
   */
  adaptiveResolution = typeof navigator !== 'undefined' && !navigator.webdriver;
  private resScale = 1;
  private slowTime = 0;
  private slowFrames = 0;
  private slowWindows = 0;

  constructor(container: HTMLElement, quality: Quality) {
    this.container = container;
    const renderer = acquireRenderer();
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // 统一的色调映射(materials.ts 的 TONE_MAPPING：Neutral 的高光段、暗部线性)。
    // low 档直出时由材质内的色调映射执行，走后期时由 FinalPass 执行，两条路是同一个函数
    installToneMapping();
    renderer.toneMapping = TONE_MAPPING;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.needsUpdate = true;
    renderer.info.reset();
    renderer.setClearColor(PALETTE.env.fog, 1);
    this.canvas = renderer.domElement;
    const st = this.canvas.style;
    st.filter = '';
    st.position = 'absolute';
    st.left = '0';
    st.top = '0';
    st.width = '100%';
    st.height = '100%';
    st.display = 'block';
    st.touchAction = 'none';
    container.appendChild(this.canvas);
    this.canvas.addEventListener('webglcontextrestored', this.handleRestored);

    this.scene = new THREE.Scene();
    // 轻雾：对局镜头内(≤50m)几乎无感，只给远处山石/云海拉开层次
    this.scene.fog = new THREE.Fog(PALETTE.env.fog, 42, 520);
    this.rig = new CameraRig();
    this.lights = new LightRig(this.scene);
    this.grade = {
      exposure: 0.98,
      bloomStrength: 0.55,
      // 对比 / 饱和的基础值与 low 档直出时烘在色调映射里的那份是同一组常量
      saturation: BASE_GRADE.saturation,
      vibrance: BASE_GRADE.vibrance,
      contrast: BASE_GRADE.contrast,
      pivot: BASE_GRADE.pivot,
      vignette: 0.2,
      shadowTint: new THREE.Color(-0.01, -0.002, 0.022),
      highlightTint: new THREE.Color(0.018, 0.008, -0.014),
      haze: 0.06,
      hazeColor: new THREE.Color(PALETTE.env.haze),
      desaturate: 0,
      dim: 0,
    };
    this.hdrOk = supportsHdrTargets(renderer);
    this.quality = quality;
    this.settings = QUALITY[quality];
    this.applyQuality();
    this.resize();
  }

  /** 当前生效的档位设置(设备不支持 HDR 目标时后期会被强制关闭) */
  private effective(q: Quality): QualitySettings {
    const s = QUALITY[q];
    return s.post && !this.hdrOk ? { ...s, post: false, bloom: 0, grade: false, msaa: 0 } : s;
  }

  private applyQuality(): void {
    const s = (this.settings = this.effective(this.quality));
    const r = this.renderer;
    r.shadowMap.enabled = s.shadows;
    // 阴影滤波类型是渲染器级的开关(进所有受光着色器的宏)：medium = PCFSoft，high = PCF + 半径(更宽更软、固定图样无噪点)
    const shadowType = s.shadowType === 'pcf' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if (r.shadowMap.type !== shadowType) {
      r.shadowMap.type = shadowType;
      r.shadowMap.needsUpdate = true;
    }
    this.lights.applyQuality(s);
    setUnitPatternsEnabled(s.unitPatterns);
    this.grade.bloomStrength = s.bloom;
    this.grade.haze = s.haze;
    if (s.post) {
      if (!this.post) this.post = new PostPipeline(r, this.scene, this.rig.camera, this.grade, s);
      else this.post.applyQuality(s);
    } else if (this.post) {
      this.post.dispose();
      this.post = null;
    }
    if (this.tintUsed) this.applyDeathTint();
    // 直出屏幕时由材质内的色调映射负责；走后期时场景渲染到线性 HDR 目标(three 自动关闭材质端映射)
    r.toneMappingExposure = this.grade.exposure;
    // 阴影开关/点光数量变化 → 受光材质需要重编译
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) for (const x of m) x.needsUpdate = true;
      else if (m) m.needsUpdate = true;
    });
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.resScale = 1;
    this.slowWindows = 0;
    this.applyQuality();
    this.resize();
    this.onQualityChanged?.(this.settings);
  }

  /** 是否正在使用后期管线(否则调色参数里只有 exposure 生效) */
  get postEnabled(): boolean {
    return this.post !== null;
  }

  /** 供 R3/R4 插入自定义全屏 Pass；low 档为 null */
  get postPipeline(): PostPipeline | null {
    return this.post;
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, this.settings.dprCap) * this.resScale);
    const vp = this.viewport;
    vp.width = w;
    vp.height = h;
    vp.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h, dpr);
    this.rig.setAspect(w / h);
    this.readRect();
    this.onResized?.();
  }

  private readRect(): void {
    const r = this.canvas.getBoundingClientRect();
    this.rect.left = r.left;
    this.rect.top = r.top;
    this.rect.width = r.width;
    this.rect.height = r.height;
    this.rectFrame = this.frame;
  }

  /**
   * 阵亡去色(0 = 正常，1 = 完全灰屏)。有后期管线时写调色参数；没有(low 档)时给 canvas 加 CSS 滤镜。
   * 画质切换后自动换到另一条路，调用方不用管。
   */
  setDeathTint(amount: number): void {
    const a = Math.min(1, Math.max(0, amount));
    if (a === this.deathTint && this.tintUsed) return;
    this.deathTint = a;
    this.tintUsed = true;
    this.applyDeathTint();
  }

  private applyDeathTint(): void {
    const a = this.deathTint;
    this.grade.desaturate = this.post ? a * 0.9 : 0;
    this.grade.dim = this.post ? a * 0.16 : 0;
    const css = this.post ? '' : cssTint(a);
    if (css !== this.cssFilter) {
      this.cssFilter = css;
      this.canvas.style.filter = css;
    }
  }

  /**
   * 预热绘制：临时让场景里所有对象可见并关掉视锥裁剪，完整画一帧(走与正式绘制相同的管线：阴影、后期都在)，再原样恢复。
   * 这样镜头外的地形(河道/对面基地)、还没用到的特效材质、还没出场的单位，着色器都在加载阶段编译完，几何与贴图也传完。
   */
  prewarm(): void {
    if (this.disposed) return;
    const hidden: THREE.Object3D[] = [];
    const culled: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      // 灯不能动：可见灯的数量变了会让所有受光着色器按另一套参数重编译
      if ((o as THREE.Light).isLight) return;
      if (!o.visible) {
        o.visible = true;
        hidden.push(o);
      }
      if (o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
    });
    this.lightTint.bind(true);
    try {
      this.lights.fitShadow(this.rig.camera);
      const r = this.renderer;
      // 画两遍：three 的阴影通道用的是「上一次绘制」留下的灯光参数(灯数、带阴影的灯数都进着色器的缓存键)，
      // 第一次绘制(或刚换画质)时那份参数还是旧的，编出来的阴影着色器变体下一帧就不用了；第二遍才是之后一直用的那套
      for (let pass = 0; pass < 2; pass++) {
        if (this.post) this.post.render(0);
        else {
          r.setRenderTarget(null);
          r.render(this.scene, this.rig.camera);
        }
      }
    } finally {
      this.lightTint.bind(false);
      for (const o of hidden) o.visible = false;
      for (const o of culled) o.frustumCulled = true;
    }
  }

  /** 推进相机/灯光并画一帧。模块的 update 应在调用前完成(相机先由 updateCamera 更新) */
  updateCamera(dt: number): void {
    this.rig.update(dt);
  }

  /** draw = false：只推进时钟与灯光，不提交绘制(快进/无头长跑用) */
  render(dt: number, draw = true): void {
    if (this.disposed) return;
    this.time += dt;
    this.frame++;
    tickShared(dt);
    this.lights.update(dt);
    if (!draw) return;
    this.lights.fitShadow(this.rig.camera);
    // 调试俯瞰/自由视角距离很远：把雾推开，否则全图一片白
    const fog = this.scene.fog as THREE.Fog;
    const debugView = this.rig.isDebugView;
    fog.near = debugView ? 600 : 42;
    fog.far = debugView ? 3000 : 520;
    // 兜底：canvas 被挪动而尺寸没变时(不会触发 resize)，大约每秒重读一次位置。此刻布局是干净的，读一次很便宜
    if (this.frame - this.rectFrame >= 60) this.readRect();
    const r = this.renderer;
    r.info.reset();
    // 环境染色贴图只在主场景绘制期间挂在共享 uniform 上(立绘/头像这些独立小场景采到的是中性贴图)
    this.lightTint.bind(true);
    if (this.post) this.post.render(dt);
    else {
      r.setRenderTarget(null);
      r.render(this.scene, this.rig.camera);
    }
    this.lightTint.bind(false);
    this.stats.drawCalls = r.info.render.calls;
    this.stats.triangles = r.info.render.triangles;
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.adaptiveResolution) this.trackPerformance(dt);
    if (this.fpsAccum >= 0.5) {
      this.stats.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }

  /** 每 1.5 秒评估一次平均帧时间；连续 3 个窗口都过慢才降分辨率，避免被偶发卡顿误触发 */
  private trackPerformance(dt: number): void {
    this.slowTime += dt;
    this.slowFrames++;
    if (this.slowTime < 1.5) return;
    const avg = this.slowTime / this.slowFrames;
    this.slowTime = 0;
    this.slowFrames = 0;
    if (avg > 1 / 26 && this.resScale > 0.61) {
      if (++this.slowWindows >= 3) {
        this.slowWindows = 0;
        this.resScale = Math.max(0.6, this.resScale * 0.85);
        this.resize();
      }
    } else this.slowWindows = 0;
  }

  getStats(): RendererStats {
    return this.stats;
  }

  /** 屏幕坐标(clientX/clientY) → 地面(y=0)坐标 */
  screenToGround(clientX: number, clientY: number): Vec2 | null {
    const rect = this.rect;
    if (rect.width <= 0 || rect.height <= 0) return null;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const cam = this.rig.camera;
    _ray.origin.setFromMatrixPosition(cam.matrixWorld);
    _ray.direction.set(nx, ny, 0.5).unproject(cam).sub(_ray.origin).normalize();
    const hit = _ray.intersectPlane(_ground, _v);
    return hit ? { x: hit.x, y: hit.z } : null;
  }

  /** 世界坐标 → 屏幕坐标(clientX/clientY) */
  worldToScreen(x: number, height: number, z: number, out: { x: number; y: number; visible: boolean }): { x: number; y: number; visible: boolean } {
    const cam = this.rig.camera;
    _v.set(x, height, z).applyMatrix4(cam.matrixWorldInverse);
    const front = _v.z < 0;
    _v.applyMatrix4(cam.projectionMatrix);
    const rect = this.rect;
    out.x = rect.left + (_v.x * 0.5 + 0.5) * rect.width;
    out.y = rect.top + (-_v.y * 0.5 + 0.5) * rect.height;
    out.visible = front && Math.abs(_v.x) <= 1.05 && Math.abs(_v.y) <= 1.05;
    return out;
  }

  /**
   * 释放场景里所有几何/材质/贴图/渲染目标并移除 canvas。不阻塞：全是异步的 GL 删除指令，
   * 渲染器本身(GL 上下文)停放起来给下一局复用，见文件顶部的说明。
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeObject3D(this.scene);
    disposeSharedTextures();
    this.post?.dispose();
    this.post = null;
    this.lights.dispose();
    this.lightTint.dispose();
    this.scene.clear();
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    this.canvas.style.filter = '';
    this.canvas.remove();
    releaseRenderer(this.renderer);
  }
}

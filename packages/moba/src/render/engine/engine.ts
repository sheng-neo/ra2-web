/**
 * 渲染引擎：WebGLRenderer 初始化(sRGB 输出、ACES 色调映射)、画质档切换、相机/灯光装置、
 * 后期管线、坐标换算、尺寸适配、统计与彻底释放。不含任何游戏内容(由 RenderModule 往场景里加)。
 */
import * as THREE from 'three';
import type { Vec2 } from '../../core/types';
import type { Quality, RendererStats } from '../api';
import { PALETTE, disposeSharedTextures, tickShared } from '../materials';
import { CameraRig } from './camera';
import { disposeObject3D } from './dispose';
import { LightRig } from './lighting';
import { PostPipeline, supportsHdrTargets, type GradeParams } from './post';
import { QUALITY, type QualitySettings } from './quality';

const _ray = new THREE.Ray();
const _v = new THREE.Vector3();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class RenderEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly scene: THREE.Scene;
  readonly rig: CameraRig;
  readonly lights: LightRig;
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

  private container: HTMLElement;
  private post: PostPipeline | null = null;
  private hdrOk: boolean;
  private stats: RendererStats = { fps: 60, drawCalls: 0, triangles: 0 };
  private fpsAccum = 0;
  private fpsFrames = 0;
  private disposed = false;
  private onContextLost = (e: Event): void => e.preventDefault();

  constructor(container: HTMLElement, quality: Quality) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: false, depth: true, powerPreference: 'high-performance' });
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false;
    renderer.setClearColor(PALETTE.env.fog, 1);
    this.canvas = renderer.domElement;
    const st = this.canvas.style;
    st.position = 'absolute';
    st.left = '0';
    st.top = '0';
    st.width = '100%';
    st.height = '100%';
    st.display = 'block';
    st.touchAction = 'none';
    container.appendChild(this.canvas);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);

    this.scene = new THREE.Scene();
    // 轻雾：对局镜头内(≤50m)几乎无感，只给远处山石/云海拉开层次
    this.scene.fog = new THREE.Fog(PALETTE.env.fog, 42, 520);
    this.rig = new CameraRig();
    this.lights = new LightRig(this.scene);
    this.grade = {
      exposure: 1.22,
      bloomStrength: 0.75,
      saturation: 1.12,
      contrast: 1.04,
      vignette: 0.26,
      shadowTint: new THREE.Color(-0.006, 0.0, 0.014),
      highlightTint: new THREE.Color(0.016, 0.006, -0.012),
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
    this.lights.applyQuality(s);
    this.grade.bloomStrength = s.bloom;
    if (s.post) {
      if (!this.post) this.post = new PostPipeline(r, this.scene, this.rig.camera, this.grade, s);
      else this.post.applyQuality(s);
    } else if (this.post) {
      this.post.dispose();
      this.post = null;
    }
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
    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.dprCap);
    const vp = this.viewport;
    vp.width = w;
    vp.height = h;
    vp.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h, dpr);
    this.rig.setAspect(w / h);
    this.onResized?.();
  }

  /** 推进相机/灯光并画一帧。模块的 update 应在调用前完成(相机先由 updateCamera 更新) */
  updateCamera(dt: number): void {
    this.rig.update(dt);
  }

  render(dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    this.frame++;
    tickShared(dt);
    this.lights.update(dt);
    this.lights.fitShadow(this.rig.camera);
    const r = this.renderer;
    r.info.reset();
    if (this.post) this.post.render(dt);
    else {
      r.setRenderTarget(null);
      r.render(this.scene, this.rig.camera);
    }
    this.stats.drawCalls = r.info.render.calls;
    this.stats.triangles = r.info.render.triangles;
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.stats.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }

  getStats(): RendererStats {
    return this.stats;
  }

  /** 屏幕坐标(clientX/clientY) → 地面(y=0)坐标 */
  screenToGround(clientX: number, clientY: number): Vec2 | null {
    const rect = this.canvas.getBoundingClientRect();
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
    const rect = this.canvas.getBoundingClientRect();
    out.x = rect.left + (_v.x * 0.5 + 0.5) * rect.width;
    out.y = rect.top + (-_v.y * 0.5 + 0.5) * rect.height;
    out.visible = front && Math.abs(_v.x) <= 1.05 && Math.abs(_v.y) <= 1.05;
    return out;
  }

  /** 释放场景里所有几何/材质/贴图与 GL 资源，并移除 canvas */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeObject3D(this.scene);
    disposeSharedTextures();
    this.post?.dispose();
    this.post = null;
    this.lights.dispose();
    this.scene.clear();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}

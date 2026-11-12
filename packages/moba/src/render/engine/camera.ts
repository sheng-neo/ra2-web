/**
 * 相机装置：俯角约 52°、朝北(-z)看的透视相机，平滑跟随目标、地图边界夹取、peek 覆盖、震屏。
 * 竖屏/窄屏时自动加大 FOV 并拉远，保证横向视野不小于 MIN_HALF_WIDTH。
 */
import * as THREE from 'three';

const DEG = Math.PI / 180;
/** 横屏基准：俯角 / 垂直 FOV / 到注视点的距离(可视纵深约 28 米) */
const BASE_PITCH = 52;
const BASE_FOV = 35;
const BASE_DIST = 33;
/** 注视点处最小的横向半视野(米)：再窄就拉远 */
const MIN_HALF_WIDTH = 10.5;
const MAX_FOV = 46;

export interface CameraBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** 震屏总开关(设置里的「镜头震动」) */
  shakeEnabled = true;
  /** 注视点夹取范围(地图边界) */
  bounds: CameraBounds = { minX: -52, maxX: 52, minZ: -52, maxZ: 54 };

  private pitch = BASE_PITCH * DEG;
  private distance = BASE_DIST;
  /** 英雄在画面中略低于中心：注视点向北偏移的米数 */
  private lead = 2.2;
  private aspect = 16 / 9;
  private follow = new THREE.Vector3();
  private peek: THREE.Vector3 | null = null;
  private focus = new THREE.Vector3();
  private snapped = false;
  private trauma = 0;
  private shakeTime = 0;
  private topView = false;
  private topHalf = 76;
  /** 调试用自由视角(画廊页)：覆盖俯角/距离/方位 */
  private override: { pitch: number; distance: number; yaw: number; fov: number } | null = null;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, this.aspect, 1, 900);
    this.camera.up.set(0, 1, 0);
    this.applyLens();
  }

  /** 视口宽高比变化时调用 */
  setAspect(aspect: number): void {
    this.aspect = aspect > 0 ? aspect : 16 / 9;
    this.applyLens();
  }

  private applyLens(): void {
    const cam = this.camera;
    cam.aspect = this.aspect;
    if (this.topView) {
      cam.fov = 30;
      const tanHalf = Math.tan((cam.fov / 2) * DEG);
      this.distance = (this.topHalf * 1.04) / (tanHalf * Math.min(1, this.aspect));
      this.pitch = 89.9 * DEG;
      this.lead = 0;
      cam.near = 20;
      cam.far = this.distance + 300;
    } else if (this.override) {
      cam.fov = this.override.fov;
      this.pitch = this.override.pitch * DEG;
      this.distance = this.override.distance;
      this.lead = 0;
      cam.near = 1;
      cam.far = 1600;
    } else {
      let fov = BASE_FOV;
      let dist = BASE_DIST;
      let pitch = BASE_PITCH;
      const halfW = (f: number, d: number): number => d * Math.tan((f / 2) * DEG) * this.aspect;
      if (halfW(fov, dist) < MIN_HALF_WIDTH) {
        // 先加 FOV 再拉远；窄屏时俯角稍大一点，避免远端看得太远
        const need = Math.atan(MIN_HALF_WIDTH / (dist * this.aspect)) * 2 / DEG;
        fov = Math.min(MAX_FOV, need);
        dist = Math.max(dist, MIN_HALF_WIDTH / (Math.tan((fov / 2) * DEG) * this.aspect));
        pitch = 57;
      }
      cam.fov = fov;
      this.distance = dist;
      this.pitch = pitch * DEG;
      this.lead = 2.2 * (dist / BASE_DIST);
      cam.near = 2;
      cam.far = 900;
    }
    cam.updateProjectionMatrix();
  }

  /** 俯瞰全图的调试相机 */
  setTopView(on: boolean, half = 76): void {
    this.topView = on;
    this.topHalf = half;
    this.applyLens();
    this.snapped = false;
  }

  get isTopView(): boolean {
    return this.topView;
  }

  /** 是否处于调试视角(俯瞰或自由视角) */
  get isDebugView(): boolean {
    return this.topView || this.override !== null;
  }

  /** 调试：自定义俯角(度)/距离/方位角(度，0=朝北)/FOV。传 null 恢复 */
  setOverride(o: { pitch: number; distance: number; yaw?: number; fov?: number } | null): void {
    this.override = o ? { pitch: o.pitch, distance: o.distance, yaw: o.yaw ?? 0, fov: o.fov ?? BASE_FOV } : null;
    this.applyLens();
    this.snapped = false;
  }

  /** 设置跟随目标(地面坐标：模拟层 x,y → 世界 x,z) */
  setFollow(x: number, z: number): void {
    this.follow.set(x, 0, z);
  }

  /** 临时观察某处；null 回到跟随 */
  setPeek(x: number | null, z = 0): void {
    if (x === null) this.peek = null;
    else (this.peek ??= new THREE.Vector3()).set(x, 0, z);
  }

  /** 立即对准目标(开局/复活传送时避免长距离缓动) */
  snap(): void {
    this.snapped = false;
  }

  /** 叠加震屏。strength：0.1 轻击，0.3 技能，0.6+ 大招/击杀 */
  shake(strength: number): void {
    if (!this.shakeEnabled) return;
    this.trauma = Math.min(1, this.trauma + strength);
  }

  /** 当前注视的地面点(已夹取、已缓动) */
  getFocus(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.focus);
  }

  /** 相机到注视点的距离 */
  getDistance(): number {
    return this.distance;
  }

  update(dt: number): void {
    const cam = this.camera;
    const b = this.bounds;
    let gx: number;
    let gz: number;
    if (this.topView) {
      gx = 0;
      gz = 0;
    } else {
      const g = this.peek ?? this.follow;
      gx = g.x;
      gz = g.z - (this.peek ? 0 : this.lead);
      if (!this.override) {
        gx = Math.min(b.maxX, Math.max(b.minX, gx));
        gz = Math.min(b.maxZ, Math.max(b.minZ, gz));
      }
    }
    if (!this.snapped) {
      this.focus.set(gx, 0, gz);
      this.snapped = true;
    } else {
      // 指数缓动：帧率无关。超远距离(传送/复活)直接跳
      const dx = gx - this.focus.x;
      const dz = gz - this.focus.z;
      if (dx * dx + dz * dz > 45 * 45) this.focus.set(gx, 0, gz);
      else {
        const k = 1 - Math.exp(-(this.peek ? 14 : 9) * dt);
        this.focus.x += dx * k;
        this.focus.z += dz * k;
      }
    }

    const yaw = this.override ? this.override.yaw * DEG : 0;
    const ch = Math.cos(this.pitch) * this.distance;
    const cy = Math.sin(this.pitch) * this.distance;
    cam.position.set(this.focus.x + Math.sin(yaw) * ch, cy, this.focus.z + Math.cos(yaw) * ch);
    cam.up.set(0, 1, 0);
    if (this.topView) cam.up.set(0, 0, -1);
    cam.lookAt(this.focus.x, 0, this.focus.z);

    if (this.trauma > 0) {
      this.shakeTime += dt;
      const t = this.shakeTime;
      const a = this.trauma * this.trauma;
      const sx = Math.sin(t * 61.3) * 0.6 + Math.sin(t * 37.1 + 1.3) * 0.4;
      const sy = Math.sin(t * 53.7 + 2.1) * 0.6 + Math.sin(t * 29.9 + 0.4) * 0.4;
      const sr = Math.sin(t * 44.3 + 4.2);
      cam.translateX(sx * a * 0.55);
      cam.translateY(sy * a * 0.45);
      cam.rotateZ(sr * a * 0.012);
      this.trauma = Math.max(0, this.trauma - dt * 2.4);
    }
    cam.updateMatrixWorld();
  }
}

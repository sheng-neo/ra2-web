/**
 * 光照装置：暖色主平行光(西南上方) + 冷色半球环境光 + 技能闪光点光池。
 * 阴影相机每帧贴合镜头在地面上的可见范围，并按 texel 对齐，镜头平移时阴影边缘不闪烁。
 */
import * as THREE from 'three';
import { PALETTE } from '../materials';
import type { QualitySettings } from './quality';

/** 指向太阳的单位向量：西南(-x,+z)上方，仰角约 50° */
export const SUN_DIR = new THREE.Vector3(-0.5, 1.0, 0.64).normalize();

/** 可见范围内可能出现的最高物体(树冠/塔尖)，阴影包围盒按它外扩 */
const MAX_OBJECT_HEIGHT = 9;
const MAX_RAY_DIST = 160;

interface Pulse {
  light: THREE.PointLight;
  life: number;
  duration: number;
  peak: number;
}

const _ndc: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();
/** 光源空间的右/上基向量(与 three 阴影相机 lookAt 得到的一致) */
const _right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
const _up = new THREE.Vector3().crossVectors(SUN_DIR, _right).normalize();

export class LightRig {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private pulses: Pulse[] = [];
  private scene: THREE.Scene;
  private mapSize = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sun = new THREE.DirectionalLight(PALETTE.env.sun, 2.7);
    this.sun.position.copy(SUN_DIR).multiplyScalar(80);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(PALETTE.env.sky, PALETTE.env.bounce, 1.75);
    scene.add(this.hemi);
  }

  applyQuality(q: QualitySettings): void {
    this.sun.castShadow = q.shadows;
    if (q.shadows && q.shadowMapSize !== this.mapSize) {
      this.mapSize = q.shadowMapSize;
      this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    // 点光池大小固定为档位值：数量变化才会让受光 shader 重编译
    while (this.pulses.length > q.pointLights) {
      const p = this.pulses.pop();
      if (p) this.scene.remove(p.light);
    }
    while (this.pulses.length < q.pointLights) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      light.position.set(0, -50, 0);
      this.scene.add(light);
      this.pulses.push({ light, life: 0, duration: 1, peak: 0 });
    }
  }

  /**
   * 技能闪光：在 (x, height, z) 处亮起一盏短暂的点光，照亮地面与角色。
   * intensity 是点光强度(随距离衰减)：贴近地面(高度 1~2 米)的技能闪光取 3~15 即可，再大地面会过曝；
   * radius 为照射半径(米)，duration 为熄灭时长(秒)。池满时顶掉最快熄灭的一盏。low 档无点光，调用无效果。
   */
  pulse(x: number, z: number, height: number, color: THREE.ColorRepresentation, intensity: number, radius: number, duration: number): void {
    if (this.pulses.length === 0) return;
    let best = this.pulses[0];
    for (const p of this.pulses) if (p.life < best.life) best = p;
    best.light.position.set(x, height, z);
    best.light.color.set(color);
    best.light.distance = radius;
    best.peak = intensity;
    best.duration = Math.max(0.05, duration);
    best.life = best.duration;
    best.light.intensity = intensity;
  }

  update(dt: number): void {
    for (const p of this.pulses) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const t = Math.max(0, p.life / p.duration);
      p.light.intensity = p.peak * t * t;
      if (p.life <= 0) {
        p.light.intensity = 0;
        p.light.position.y = -50;
      }
    }
  }

  /** 让阴影相机贴合 camera 的可见地面范围 */
  fitShadow(camera: THREE.PerspectiveCamera): void {
    if (!this.sun.castShadow) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    _origin.setFromMatrixPosition(camera.matrixWorld);
    // 调试俯瞰相机很高：射线上限随相机高度放宽，保证能打到地面
    const maxDist = Math.max(MAX_RAY_DIST, _origin.y * 2.5);
    for (const [nx, ny] of _ndc) {
      _dir.set(nx, ny, 0.5).unproject(camera).sub(_origin).normalize();
      // 与 y=0 以及 y=MAX_OBJECT_HEIGHT 两个平面求交
      for (let k = 0; k < 2; k++) {
        const planeY = k === 0 ? 0 : MAX_OBJECT_HEIGHT;
        let t = _dir.y < -1e-4 ? (planeY - _origin.y) / _dir.y : maxDist;
        if (t < 0 || t > maxDist) t = t < 0 ? 0 : maxDist;
        _p.copy(_dir).multiplyScalar(t).add(_origin);
        const lx = _p.dot(_right);
        const ly = _p.dot(_up);
        const lz = _p.dot(SUN_DIR);
        if (lx < minX) minX = lx;
        if (lx > maxX) maxX = lx;
        if (ly < minY) minY = ly;
        if (ly > maxY) maxY = ly;
        if (lz < minZ) minZ = lz;
        if (lz > maxZ) maxZ = lz;
      }
    }
    // 尺寸向上取整到 4 米的倍数：镜头只平移时尺寸恒定，texel 大小稳定
    const size = Math.ceil(Math.max(maxX - minX, maxY - minY) / 4 + 0.25) * 4;
    const half = size / 2;
    const texel = size / Math.max(1, this.sun.shadow.mapSize.x);
    const cx = Math.round((minX + maxX) / 2 / texel) * texel;
    const cy = Math.round((minY + maxY) / 2 / texel) * texel;
    const cz = (minZ + maxZ) / 2;
    const back = Math.ceil(((maxZ - minZ) / 2 + 60) / 4) * 4;
    const sun = this.sun;
    sun.target.position.set(0, 0, 0).addScaledVector(_right, cx).addScaledVector(_up, cy).addScaledVector(SUN_DIR, cz);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, back);
    sun.target.updateMatrixWorld();
    const sc = sun.shadow.camera;
    if (sc.right !== half || sc.far !== back * 2 + 20) {
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.near = 1;
      sc.far = back * 2 + 20;
      sc.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.sun.shadow.map?.dispose();
    this.scene.remove(this.sun, this.sun.target, this.hemi);
    for (const p of this.pulses) this.scene.remove(p.light);
    this.pulses.length = 0;
  }
}

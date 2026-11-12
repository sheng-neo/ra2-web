/**
 * 光照装置：午后斜阳的暖金主平行光(自西偏南上方) + 偏蓝的半球天光 + 技能闪光点光池。
 * 阴影相机每帧贴合镜头在地面上的可见范围，并按 texel 对齐，镜头平移时阴影边缘不闪烁。
 *
 * 主光方向(art-v2 §4 L1)：仰角约 53°，从西偏南 29° 打来。朝上的面 N·L = 0.80、西立面 0.53、
 * 朝镜头的南立面 0.29、东立面 -0.53——在三阶明暗下正好是 亮 / 亮 / 灰 / 暗 三个面。投影落向屏幕右侧略偏上，长度 = 0.75 倍物高。
 * 所有需要太阳方向的地方(静态影烘焙、石板倒角、阴影包围盒外扩…)都从这里的常量推，不要再写死。
 */
import * as THREE from 'three';
import { PALETTE } from '../materials';
import type { QualitySettings } from './quality';

/** 指向太阳的单位向量(世界空间；x 向东，z 向南，镜头朝北) */
export const SUN_DIR = new THREE.Vector3(-0.66, 1.0, 0.36).normalize();
/** 投影在地面上的走向(世界 xz 平面单位向量：x, z)，即背离太阳的水平方向 */
export const SUN_SHADOW_DIR = new THREE.Vector2(-SUN_DIR.x, -SUN_DIR.z).normalize();
/** 投影长度 / 物体高度(= cot 仰角，约 0.75) */
export const SUN_SHADOW_LENGTH = Math.hypot(SUN_DIR.x, SUN_DIR.z) / SUN_DIR.y;
/** 主光与半球光的强度(与 PALETTE.env.sun / sky / bounce 配套；调色以 art-v2 §2.2 的亮度表为准) */
export const SUN_INTENSITY = 3.1;
export const HEMI_INTENSITY = 1.45;
/**
 * 地面反光的增益：半球光的下半球颜色 = PALETTE.env.bounce × 这个倍数。朝上的面不受它影响(只吃天光)，
 * 立面吃一半——岩壁、建筑和角色的背光面靠这份暖色的地面反光托起来，不至于只剩一点冷天光而发黑。
 */
export const BOUNCE_GAIN = 2.0;

/** 可见范围内可能出现的最高物体(树冠/塔尖/巨灵光轮)，阴影包围盒按它外扩 */
const MAX_OBJECT_HEIGHT = 10;
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
    this.sun = new THREE.DirectionalLight(PALETTE.env.sun, SUN_INTENSITY);
    this.sun.position.copy(SUN_DIR).multiplyScalar(80);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(PALETTE.env.sky, PALETTE.env.bounce, HEMI_INTENSITY);
    this.hemi.groundColor.multiplyScalar(BOUNCE_GAIN);
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
    // 偏移按 texel 大小给：朝镜头的立面是掠射光(N·L 0.29)，法线偏移要够大才不出痤疮；
    // high 档用 PCF + 半径(半影宽约 5 个 texel)，texel 小一半但滤波核更宽，偏移反而要略大一点
    const pcf = q.shadowType === 'pcf';
    this.sun.shadow.radius = pcf ? q.shadowRadius : 1;
    this.sun.shadow.bias = pcf ? -0.0006 : -0.0005;
    this.sun.shadow.normalBias = pcf ? 0.07 : 0.06;
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

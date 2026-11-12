/**
 * 立即模式精灵批：每帧由调用方重新提交的公告板(头顶旋转星、印记、弹体光晕…)。
 * 与粒子共用图集与片元着色器，一个 draw call；适合「跟着单位逐帧移动、数量很少」的东西——
 * 这类东西如果用一次性粒子每帧重发，会很快把粒子环形缓冲区冲掉。
 */
import * as THREE from 'three';
import { SPRITE_FRAGMENT } from './particles';
import { ATLAS_COLS, ATLAS_ROWS, applyFxBlending } from './textures';

const CAP = 512;
/** 图集里「极柔大光斑」的下标(与 textures.ts 的 SPRITE.soft 一致) */
const SOFT = 31;
const BACKING = new THREE.Color(0x0c0a18);
const STRIDE = 12;

const VERTEX = /* glsl */ `
uniform vec2 uAtlas;
attribute vec4 aP;
attribute vec4 aC;
attribute vec4 aX;
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vMix;
void main() {
  vec2 corner = position.xy;
  float cr = cos(aX.y);
  float sr = sin(aX.y);
  vec4 mv = viewMatrix * vec4(aP.xyz, 1.0);
  mv.xy += vec2(corner.x * cr - corner.y * sr, corner.x * sr + corner.y * cr) * aP.w;
  // 稍微朝相机拉近一点：贴在模型表面的图标不被模型吃掉
  mv.z += aX.w;
  gl_Position = projectionMatrix * mv;
  float cx = mod(aX.x, ${ATLAS_COLS}.0);
  float cy = floor(aX.x / ${ATLAS_COLS}.0);
  vUv = (vec2(cx, cy) + vec2(corner.x + 0.5, 0.5 - corner.y)) * uAtlas;
  vColor = aC;
  vMix = vec2(aX.z, max(aC.r, max(aC.g, aC.b)) * 0.85);
}
`;

export class SpriteBatch {
  readonly mesh: THREE.Mesh;
  private data = new Float32Array(CAP * STRIDE);
  private buffer: THREE.InstancedInterleavedBuffer;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private n = 0;
  private range = { start: 0, count: 0 };

  constructor(atlas: THREE.Texture) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(quad.getIndex());
    geo.setAttribute('position', quad.getAttribute('position'));
    const buf = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    ['aP', 'aC', 'aX'].forEach((name, i) => geo.setAttribute(name, new THREE.InterleavedBufferAttribute(buf, 4, i * 4)));
    geo.instanceCount = 0;
    this.geo = geo;
    this.buffer = buf;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: new THREE.Vector2(1 / ATLAS_COLS, 1 / ATLAS_ROWS) }, tAtlas: { value: atlas } },
      vertexShader: VERTEX,
      fragmentShader: SPRITE_FRAGMENT,
    });
    applyFxBlending(this.mat);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'fx.sprites';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  /** 每帧开始时清空 */
  begin(): void {
    this.n = 0;
  }

  /** 提交一个公告板。size 为直径(米)；pull > 0 时朝相机拉近(米) */
  draw(sprite: number, x: number, y: number, z: number, size: number, rot: number, c: THREE.Color, intensity: number, alpha: number, add: number, pull = 0): void {
    if (this.n >= CAP || alpha <= 0) return;
    const d = this.data;
    const o = this.n++ * STRIDE;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = size;
    d[o + 4] = c.r * intensity;
    d[o + 5] = c.g * intensity;
    d[o + 6] = c.b * intensity;
    d[o + 7] = alpha;
    d[o + 8] = sprite;
    d[o + 9] = rot;
    d[o + 10] = add;
    d[o + 11] = pull;
  }

  /**
   * 图标：先垫一团深色柔影再画图形。亮地面上的小图标(金星、印记、层数菱形)靠这圈暗影才看得清。
   */
  icon(sprite: number, x: number, y: number, z: number, size: number, rot: number, c: THREE.Color, intensity: number, alpha: number, add: number, pull = 0): void {
    this.draw(SOFT, x, y, z, size * 1.9, 0, BACKING, 1, 0.6 * alpha, 0, pull - 0.02);
    this.draw(sprite, x, y, z, size, rot, c, intensity, alpha, add, pull);
  }

  flush(): void {
    const n = this.n;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    this.range.start = 0;
    this.range.count = n * STRIDE;
    this.buffer.updateRanges.length = 0;
    this.buffer.updateRanges.push(this.range);
    this.buffer.needsUpdate = true;
  }

  get count(): number {
    return this.n;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

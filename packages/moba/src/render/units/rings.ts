/**
 * 单位脚下的贴地标记：接触阴影(柔和暗斑) + 队伍色光环(英雄带朝向指示，玩家自己是金绿色双环)。
 * 全部实例合成一个 draw call；预乘透明度混合：暗斑正常压暗地面，光环部分带一点叠加发光。
 */
import * as THREE from 'three';
import { GLSL_OUTPUT_FRAGMENT, SHARED } from '../materials';

export const RING_BLOB = 0;
export const RING_MINION = 1;
export const RING_HERO = 2;
export const RING_PLAYER = 3;

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 aPosR;
attribute vec4 aCol;
attribute vec4 aStyle;
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vStyle;
void main() {
  vUv = position.xz;
  vCol = aCol;
  vStyle = aStyle;
  vec4 mvPosition = viewMatrix * vec4(aPosR.xyz + position * aPosR.w * 1.5, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vStyle;
void main() {
  // 四边形比标称半径大 1.5 倍，留给外发光
  vec2 p = vUv * 1.5;
  float r = length(p);
  float style = vStyle.x;
  float aa = fwidth(r) * 1.2 + 1e-4;
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  vec3 glow = vec3(0.0);
  if (style < 0.5) {
    // 接触阴影
    float a = 1.0 - smoothstep(0.15, 1.05, r);
    alpha = a * a * vCol.a;
    col = vCol.rgb;
  } else {
    float cs = cos(vStyle.y);
    float sn = sin(vStyle.y);
    // q.x 指向单位朝向
    vec2 q = vec2(p.x * cs + p.y * sn, -p.x * sn + p.y * cs);
    float ring = 0.0;
    float fill = 0.0;
    if (style < 1.5) {
      ring = 1.0 - smoothstep(0.05, 0.05 + aa, abs(r - 0.92));
      fill = smoothstep(0.5, 0.92, r) * step(r, 0.92) * 0.18;
    } else {
      float w = style < 2.5 ? 0.055 : 0.07;
      ring = 1.0 - smoothstep(w, w + aa, abs(r - 0.93));
      // 朝向缺口 + 箭头
      float ang = atan(q.y, q.x);
      float gap = smoothstep(0.2, 0.26, abs(ang));
      ring *= gap;
      vec2 t = q - vec2(1.0, 0.0);
      float tri = max(abs(t.y) * 1.25 + t.x * 0.9 - 0.2, -t.x - 0.16);
      float arrow = 1.0 - smoothstep(0.0, aa * 1.5, tri);
      ring = max(ring, arrow);
      fill = smoothstep(0.45, 0.93, r) * step(r, 0.93) * 0.16;
      if (style > 2.5) {
        // 玩家：内圈一环缓慢转动的刻度
        float a2 = atan(p.y, p.x) + uTime * 0.6;
        float dash = smoothstep(0.25, 0.35, abs(fract(a2 / 6.2831853 * 12.0) - 0.5));
        float inner = (1.0 - smoothstep(0.022, 0.022 + aa, abs(r - 0.76))) * dash;
        ring = max(ring, inner * 0.85);
        fill *= 1.35;
      }
    }
    float halo = exp(-pow(max(r - 0.93, 0.0) * 7.0, 2.0)) * step(0.93, r) * 0.35;
    float a = saturate(ring + fill) * vCol.a;
    alpha = a;
    col = vCol.rgb * (0.85 + 0.6 * ring);
    glow = vCol.rgb * (ring * 0.55 + halo) * vCol.a;
  }
  if (alpha + glow.r + glow.g + glow.b < 0.004) discard;
  gl_FragColor = vec4(col * alpha + glow, alpha);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

export class RingBatch {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private posR: THREE.InstancedBufferAttribute;
  private col: THREE.InstancedBufferAttribute;
  private style: THREE.InstancedBufferAttribute;
  private capacity: number;
  private count = 0;
  private material: THREE.ShaderMaterial;

  constructor(capacity = 160) {
    this.capacity = capacity;
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
    this.geo.setIndex([0, 2, 1, 0, 3, 2]);
    this.posR = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.style = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    for (const a of [this.posR, this.col, this.style]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPosR', this.posR);
    this.geo.setAttribute('aCol', this.col);
    this.geo.setAttribute('aStyle', this.style);
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: SHARED.uTime },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.name = 'unit-rings';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }

  begin(): void {
    this.count = 0;
  }

  /** style 见 RING_*；angle 为朝向(世界 xz 平面内，atan2(z, x)) */
  push(x: number, y: number, z: number, radius: number, color: THREE.Color, alpha: number, style: number, angle = 0): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    const p = this.posR.array as Float32Array;
    p[i * 4] = x;
    p[i * 4 + 1] = y;
    p[i * 4 + 2] = z;
    p[i * 4 + 3] = radius;
    const c = this.col.array as Float32Array;
    c[i * 4] = color.r;
    c[i * 4 + 1] = color.g;
    c[i * 4 + 2] = color.b;
    c[i * 4 + 3] = alpha;
    const s = this.style.array as Float32Array;
    s[i * 4] = style;
    s[i * 4 + 1] = angle;
  }

  end(): void {
    this.geo.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
    if (this.count === 0) return;
    this.posR.needsUpdate = true;
    this.col.needsUpdate = true;
    this.style.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

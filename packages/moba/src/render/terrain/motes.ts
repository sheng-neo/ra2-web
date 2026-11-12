/**
 * 环境粒子：泉水里上升的光点、水晶/灯笼果旁的萤火、河面上的星屑、林间飘浮的花粉。
 * 全部在顶点着色器里按时间循环运动(零 CPU 开销)，整张地图一个 draw call。
 */
import * as THREE from 'three';
import { GLSL_ADDITIVE, GLSL_OUTPUT_FRAGMENT, Rng, SHARED } from '../materials';
import type { QualitySettings } from '../engine/quality';
import type { RGB } from './geo';

export interface MoteSource {
  x: number;
  y: number;
  z: number;
  /** 散布半径 */
  radius: number;
  color: RGB;
  count: number;
  /** 0 = 悬浮游走(萤火)，1 = 持续上升后循环(泉水/星屑) */
  mode: 0 | 1;
  /** 上升高度(mode 1) 或 游走幅度(mode 0) */
  range: number;
  size?: number;
}

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute vec4 aSeed;
attribute vec3 aColor;
attribute vec3 aMotion;
varying vec3 vColor;
varying float vAlpha;
void main() {
  // aSeed: 相位, 速度, 尺寸, 模式；aMotion: 水平幅度, 垂直范围, 闪烁频率
  float ph = aSeed.x * 6.2831853;
  float t = uTime * aSeed.y;
  vec3 p = position;
  float fade = 1.0;
  if (aSeed.w > 0.5) {
    float k = fract(t * 0.12 + aSeed.x);
    p.y += k * aMotion.y;
    p.x += sin(t * 0.7 + ph) * aMotion.x * (0.3 + k);
    p.z += cos(t * 0.6 + ph * 1.7) * aMotion.x * (0.3 + k);
    fade = smoothstep(0.0, 0.15, k) * (1.0 - smoothstep(0.6, 1.0, k));
  } else {
    p.x += sin(t * 0.31 + ph) * aMotion.x + sin(t * 0.83 + ph * 2.3) * aMotion.x * 0.4;
    p.z += cos(t * 0.27 + ph * 1.3) * aMotion.x + cos(t * 0.71 + ph * 0.7) * aMotion.x * 0.4;
    p.y += sin(t * 0.43 + ph * 2.1) * aMotion.y;
  }
  float tw = 0.55 + 0.45 * sin(uTime * aMotion.z + ph * 3.0);
  vAlpha = fade * tw;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSeed.z * uScale / max(1.0, -mv.z);
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${GLSL_ADDITIVE}
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  // 亮核 + 柔和光晕
  float a = (1.0 - r);
  a = a * a * 0.6 + smoothstep(0.35, 0.0, r) * 0.9;
  gl_FragColor = vec4(kitAdditive(vColor * a * vAlpha * 1.6), 1.0);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

export interface Motes {
  points: THREE.Points;
  setQuality(q: QualitySettings): void;
  resize(heightPx: number, fovDeg: number): void;
}

export function createMotes(sources: MoteSource[], q: QualitySettings): Motes {
  const rng = new Rng(2718);
  // 先把所有粒子生成出来并打乱，画质降低时只画前一部分
  const items: { p: [number, number, number]; seed: [number, number, number, number]; color: RGB; motion: [number, number, number] }[] = [];
  for (const s of sources) {
    for (let i = 0; i < s.count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * s.radius;
      const size = (s.size ?? 1) * rng.range(0.7, 1.3);
      items.push({
        p: [s.x + Math.cos(a) * d, s.y + (s.mode === 0 ? rng.range(0, s.range) : 0), s.z + Math.sin(a) * d],
        seed: [rng.next(), rng.range(0.7, 1.3), size, s.mode],
        color: [s.color[0] * rng.range(0.8, 1.2), s.color[1] * rng.range(0.8, 1.2), s.color[2] * rng.range(0.8, 1.2)],
        motion: s.mode === 1 ? [rng.range(0.1, 0.35), s.range * rng.range(0.7, 1.2), rng.range(1.5, 4)] : [rng.range(0.25, 0.7), rng.range(0.12, 0.35), rng.range(1.2, 3.5)],
      });
    }
  }
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = items[i];
    items[i] = items[j];
    items[j] = t;
  }
  const n = items.length;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 4);
  const col = new Float32Array(n * 3);
  const mot = new Float32Array(n * 3);
  items.forEach((it, i) => {
    pos.set(it.p, i * 3);
    seed.set(it.seed, i * 4);
    col.set(it.color, i * 3);
    mot.set(it.motion, i * 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aMotion', new THREE.BufferAttribute(mot, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: SHARED.uTime, uScale: { value: 300 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'motes';
  points.frustumCulled = false;
  points.renderOrder = 6;
  const setQuality = (s: QualitySettings): void => geo.setDrawRange(0, Math.floor(n * Math.min(1, s.motes)));
  setQuality(q);
  return {
    points,
    setQuality,
    resize(heightPx, fovDeg) {
      // 让粒子的屏幕尺寸与「世界尺寸(米)」对应：size(米) × 投影系数 / 距离
      mat.uniforms.uScale.value = (heightPx * 0.5) / Math.tan((fovDeg * Math.PI) / 360) * 0.16;
    },
  };
}

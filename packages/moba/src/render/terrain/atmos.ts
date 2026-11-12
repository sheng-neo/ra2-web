/**
 * 氛围层：体积光束、贴地薄雾、泉水的队伍色光柱。一个 InstancedMesh(单四边形 + 自写着色器)，整张地图 1 个 draw call。
 *   光束  沿太阳方向倾斜的长条，暖色加色，噪声缓慢滚动；只放在野区石台的树丛上方、营地空地、两个史诗潭；
 *   雾片  离地 0.25~0.6 米的水平大片，冷白，极淡；放在河源、史诗潭、霜晶洼地、南缘崖下；
 *   光柱  竖直的细长片(泉水中心，极淡的队伍色)。
 * 不写深度，renderOrder 6。画质：atmos 0 = 关，1 = 只画一半，2 = 全部。
 */
import * as THREE from 'three';
import { SUN_DIR } from '../engine/lighting';
import type { QualitySettings } from '../engine/quality';
import { GLSL_OUTPUT_FRAGMENT, PALETTE, Rng, SHARED } from '../materials';
import type { CliffInfo } from './cliffs';
import { type MapField, WATER_LEVEL } from './field';
import { type RGB, centroid, rgb } from './geo';

export interface AtmosSpec {
  kind: 'beam' | 'fog' | 'pillar';
  /** 光束/光柱：落地点；雾片：中心 */
  x: number;
  y: number;
  z: number;
  /** 宽度(米)；雾片为直径 */
  width: number;
  /** 光束/光柱的长度(米)；雾片不用 */
  length?: number;
  color: RGB;
  /** 透明度峰值 */
  alpha: number;
}

const VERTEX = /* glsl */ `
attribute vec4 aTint;
attribute vec2 aKind;
varying vec2 vUv;
varying vec4 vTint;
varying vec2 vKind;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vTint = aTint;
  vKind = aKind;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tNoise;
uniform float uTime;
varying vec2 vUv;
varying vec4 vTint;
varying vec2 vKind;
varying vec3 vWorld;
void main() {
  float kind = vKind.x;
  float seed = vKind.y;
  float t = uTime;
  vec3 rgbOut;
  float aOut;
  if (kind < 0.5) {
    // 光束：横向软边 + 沿束方向的条纹(几道粗细不一的光缕)，上端渐隐、落地处也收掉
    float across = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
    float shafts = texture2D(tNoise, vec2(vUv.x * 0.37 + seed, vUv.y * 0.05 + t * 0.006 + seed * 3.0)).g;
    float drift = texture2D(tNoise, vec2(vUv.x * 0.9 + seed * 2.0 - t * 0.004, vUv.y * 0.3 - t * 0.012)).r;
    float along = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
    float a = across * along * smoothstep(0.32, 0.7, shafts) * (0.55 + 0.9 * drift) * vTint.a;
    rgbOut = vTint.rgb * a;
    aOut = 0.0;
  } else if (kind < 1.5) {
    // 雾片：径向软边 + 两层反向漂移的噪声
    vec2 c = vUv - 0.5;
    float edge = 1.0 - smoothstep(0.18, 0.5, length(c));
    float n1 = texture2D(tNoise, vWorld.xz * 0.031 + vec2(t * 0.006, -t * 0.004) + seed).r;
    float n2 = texture2D(tNoise, vWorld.xz * 0.074 - vec2(t * 0.009, t * 0.005) + seed * 2.0).g;
    float a = edge * smoothstep(0.3, 0.78, n1 * 0.6 + n2 * 0.4) * vTint.a;
    rgbOut = vTint.rgb * a;
    aOut = a;
  } else {
    // 光柱：横向高斯状、往上渐隐
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float a = across * across * (1.0 - smoothstep(0.1, 1.0, vUv.y)) * (0.8 + 0.2 * sin(t * 1.4 + seed * 6.0)) * vTint.a;
    rgbOut = vTint.rgb * a;
    aOut = 0.0;
  }
  gl_FragColor = vec4(rgbOut, aOut);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

export interface Atmos {
  mesh: THREE.InstancedMesh;
  /** 实例总数 */
  count: number;
  setQuality(q: QualitySettings): void;
}

/** 对局镜头的俯视方向(朝北、俯角约 46°)：光束的宽边取垂直于它的方向，这样光束片最大限度地正对镜头 */
const VIEW_DIR = new THREE.Vector3(0, -0.72, -0.69).normalize();

export function createAtmos(field: MapField, cliffs: CliffInfo[], extra: AtmosSpec[], noise: THREE.Texture, q: QualitySettings): Atmos {
  const map = field.map;
  const rng = new Rng(60606);
  const specs: AtmosSpec[] = [...extra];
  const warm = rgb(0xffe9bf);
  const cold = rgb(0xd4ecf5);

  // ── 光束：野区大石台的树丛上方(离兵线 2 米以上) ──
  for (const cliff of cliffs) {
    if (cliff.kind === 'ridge' || cliff.inradius < 3) continue;
    const c = centroid(cliff.poly);
    if (field.laneDist(c.x, c.y) < 2 || field.baseDist(c.x, c.y, 12) < 4) continue;
    const n = cliff.inradius > 4.5 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      specs.push({ kind: 'beam', x: c.x + rng.range(-2.2, 2.2), y: cliff.height + 0.3, z: c.y + rng.range(-2.2, 2.2), width: rng.range(2.6, 4), length: rng.range(9, 12), color: warm, alpha: rng.range(0.05, 0.085) });
    }
  }
  // ── 雾片：河源与河尾、南缘崖下 ──
  const rl = map.river;
  const ends = [rl[0], rl[rl.length - 1]];
  for (const e of ends) {
    const k = Math.sign(e.x) * (map.bound - 6);
    specs.push({ kind: 'fog', x: k, y: WATER_LEVEL + 0.4, z: Math.sign(e.y) * (map.bound - 6), width: 13, color: cold, alpha: 0.11 });
  }
  for (let x = -map.bound + 10; x < map.bound - 8; x += 19) {
    specs.push({ kind: 'fog', x: x + rng.range(-3, 3), y: -1.3, z: map.bound + 5.5, width: rng.range(11, 14), color: cold, alpha: 0.1 });
  }

  // 打乱顺序：画质减半时各处都留一些
  for (let i = specs.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = specs[i];
    specs[i] = specs[j];
    specs[j] = t;
  }

  const count = specs.length;
  const geo = new THREE.PlaneGeometry(1, 1);
  // 单位片：x ∈ [-0.5, 0.5] 为宽，y ∈ [0, 1] 为长(落地点在 y = 0)
  geo.translate(0, 0.5, 0);
  const tint = new Float32Array(count * 4);
  const kind = new Float32Array(count * 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tNoise: { value: noise }, uTime: SHARED.uTime },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    fog: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  const m = new THREE.Matrix4();
  const ax = new THREE.Vector3();
  const ay = new THREE.Vector3();
  const az = new THREE.Vector3();
  const p = new THREE.Vector3();
  specs.forEach((s, i) => {
    const len = s.length ?? 1;
    if (s.kind === 'beam') {
      // 长边沿太阳方向，宽边垂直于「太阳方向 × 视线」所在的面
      ay.copy(SUN_DIR);
      ax.crossVectors(ay, VIEW_DIR).normalize();
      az.crossVectors(ax, ay).normalize();
      // 光束从落地点下方一点开始，往太阳方向伸
      p.set(s.x, s.y, s.z).addScaledVector(ay, -len * 0.12);
      m.makeBasis(ax.multiplyScalar(s.width), ay.clone().multiplyScalar(len), az).setPosition(p);
    } else if (s.kind === 'fog') {
      // 水平片：单位片的 y 轴躺到世界 z 上，中心对到 (x, y, z)
      ax.set(s.width, 0, 0);
      ay.set(0, 0, s.width);
      az.set(0, 1, 0);
      m.makeBasis(ax, ay, az).setPosition(s.x, s.y, s.z - s.width / 2);
    } else {
      ax.set(s.width, 0, 0);
      ay.set(0, len, 0);
      az.set(0, 0, 1);
      m.makeBasis(ax, ay, az).setPosition(s.x, s.y, s.z);
    }
    mesh.setMatrixAt(i, m);
    tint.set([s.color[0], s.color[1], s.color[2], s.alpha], i * 4);
    kind.set([s.kind === 'beam' ? 0 : s.kind === 'fog' ? 1 : 2, rng.next()], i * 2);
  });
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 4));
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 2));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'atmos';
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  const setQuality = (s: QualitySettings): void => {
    mesh.visible = s.atmos > 0 && count > 0;
    mesh.count = s.atmos >= 2 ? count : Math.ceil(count / 2);
  };
  setQuality(q);
  return { mesh, count, setQuality };
}

/** 营地/基地往氛围层里加东西时用的几个颜色 */
export const ATMOS_COLORS = {
  warm: rgb(0xffe9bf),
  cold: rgb(0xd4ecf5),
  steam: rgb(0xfff1d6),
  violet: rgb(PALETTE.env.violet),
};

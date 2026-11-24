/**
 * 纯色构件材质（地标的钢架、桅杆、冠顶鳍片等），按共享光照契约：顶点色 × cityAmbient + 自发光（aGlow × GLOW_SCALE）。
 * 布局：position、normal、color(3，线性反照率 / 发光色)、aGlow(1，0 = 只受光，1 = 完全自发光)。
 */
import { ShaderMaterial } from 'three';
import { simToThree } from '../../coords';
import { MeshArrays, type AttrSpec } from '../mesh-arrays';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, sharedUniforms } from './lighting';

export const SOLID_LAYOUT: readonly AttrSpec[] = [
  { name: 'position', size: 3 },
  { name: 'normal', size: 3 },
  { name: 'color', size: 3 },
  { name: 'aGlow', size: 1 },
];

export function newSolidArrays(): MeshArrays {
  return new MeshArrays(SOLID_LAYOUT);
}

const scratch = new Float32Array(10);

/** 写一个顶点：位置模拟坐标（dm），法线模拟方向；颜色为线性 RGB。 */
export function solidVertex(
  m: MeshArrays,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  rgb: readonly [number, number, number],
  glow: number,
): number {
  simToThree(x, y, z, scratch, 0);
  simToThree(nx, ny, nz, scratch, 3, 1);
  scratch[6] = rgb[0];
  scratch[7] = rgb[1];
  scratch[8] = rgb[2];
  scratch[9] = glow;
  return m.push(scratch);
}

const vertexShader = /* glsl */ `
attribute float aGlow;
varying vec3 vColor;
varying float vGlow;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vColor = color;
  vGlow = aGlow;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
varying vec3 vColor;
varying float vGlow;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormalW);
  // 离地高度取世界高度（地标在海旁平地，楼底约 0–15 mPD）；街面冷暖取中性
  vec3 surface = vColor * cityAmbient(n, vWorld.y - 5.0, 0.3) * (1.0 - vGlow);
  vec3 emissive = vColor * vGlow * GLOW_SCALE;
  vec3 col = applyHaze(surface, emissive, vWorld);
  ${GLSL_FINISH}
}
`;

/** aGlow = 1 时的发光亮度（线性，契约 EMISSIVE.crownWash 上限附近）。 */
export const GLOW_SCALE = 3.2;

export function createSolidMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: sharedUniforms(),
    vertexShader,
    fragmentShader: fragmentShader.replace('GLOW_SCALE', GLOW_SCALE.toFixed(2)),
    vertexColors: true,
  });
}

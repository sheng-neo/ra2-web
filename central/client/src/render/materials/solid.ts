/**
 * 纯色构件材质（地标的钢架、桅杆、冠顶鳍片等）：顶点色 × 夜间光照 + 自发光。
 * 布局：position、normal、color(3)、aGlow(1，0 = 只受光，1 = 完全自发光)。
 */
import { ShaderMaterial } from 'three';
import { simToThree } from '../../coords';
import { MeshArrays, type AttrSpec } from '../mesh-arrays';
import { GLSL_OUTPUT, GLSL_FOG_PARS_FRAG, GLSL_FOG_VERT, GLSL_NIGHT_LIGHT, withFog } from './common';

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
varying float vLift;
#include <fog_pars_vertex>
void main() {
  vColor = color;
  vGlow = aGlow;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vLift = world.y;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  ${GLSL_FOG_VERT}
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vGlow;
varying vec3 vNormalW;
varying float vLift;
${GLSL_FOG_PARS_FRAG}
${GLSL_NIGHT_LIGHT}
void main() {
  vec3 n = normalize(vNormalW);
  vec3 col = vColor * mix(nightLight(n, vLift) * 0.25, vec3(1.0), vGlow);
  ${GLSL_OUTPUT}
}
`;

export function createSolidMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: withFog({}),
    vertexShader,
    fragmentShader,
    vertexColors: true,
    fog: true,
  });
}

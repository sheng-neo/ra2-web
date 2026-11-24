/**
 * 霓虹灯带材质：色相随时间缓慢循环，并沿高度错相，形成自下而上流动的色带。
 * 布局：position、aNeon(1，相位 = 离地高度 m)。
 */
import { DoubleSide, ShaderMaterial, type IUniform } from 'three';
import { simToThree } from '../../coords';
import { MeshArrays, type AttrSpec } from '../mesh-arrays';
import { GLSL_OUTPUT, GLSL_FOG_PARS_FRAG, GLSL_FOG_VERT, withFog } from './common';

export const NEON_LAYOUT: readonly AttrSpec[] = [
  { name: 'position', size: 3 },
  { name: 'aNeon', size: 1 },
];

export function newNeonArrays(): MeshArrays {
  return new MeshArrays(NEON_LAYOUT);
}

const scratch = new Float32Array(4);

export function neonVertex(m: MeshArrays, x: number, y: number, z: number, phase: number): number {
  simToThree(x, y, z, scratch, 0);
  scratch[3] = phase;
  return m.push(scratch);
}

const vertexShader = /* glsl */ `
attribute float aNeon;
varying float vPhase;
#include <fog_pars_vertex>
void main() {
  vPhase = aNeon;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  ${GLSL_FOG_VERT}
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
varying float vPhase;
${GLSL_FOG_PARS_FRAG}
vec3 hue(float h) {
  vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return k * k;
}
void main() {
  float h = uTime * 0.035 - vPhase * 0.0045;
  vec3 col = hue(h) * 1.1 + 0.08;
  ${GLSL_OUTPUT}
}
`;

export function createNeonMaterial(time: IUniform<number>): ShaderMaterial {
  const uniforms = withFog({});
  uniforms.uTime = time;
  return new ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true, side: DoubleSide });
}

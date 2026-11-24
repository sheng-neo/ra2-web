/**
 * 0 mPD 底面材质（写实化整合后只剩陆地）：海面由 water/ 图层画（新水面盖在这块平面之上，陆地处 discard），
 * 本材质只给地形网格以外、远景以内露出来的空隙一个深色混凝土底色；平地模式（?terrain=0）时它就是全城地面。
 * 契约：线性 HDR、cityAmbient、applyHaze、GLSL_FINISH（与地形材质的建成区平地同一反照率）。
 */
import { ShaderMaterial } from 'three';
import { GLSL_HASH } from './common';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, sharedUniforms } from './lighting';

const vertexShader = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HASH}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
varying vec3 vWorld;

void main() {
  vec2 sim = vec2(vWorld.x, -vWorld.z);
  // 屏幕上太细时退成平均值，远处不闪
  float px = length(fwidth(sim));
  float k = mix(vnoise(sim * 0.08), 0.5, smoothstep(4.0, 16.0, px));
  vec3 albedo = vec3(0.075, 0.071, 0.066) * (0.85 + 0.3 * k);
  vec3 col = applyHaze(albedo * cityAmbient(vec3(0.0, 1.0, 0.0), 0.0, 0.5), vec3(0.0), vWorld);
  ${GLSL_FINISH}
}
`;

export function createGroundMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...sharedUniforms() },
    vertexShader,
    fragmentShader,
    // 新水面是 −1/−1：同深度处水面在上
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
}

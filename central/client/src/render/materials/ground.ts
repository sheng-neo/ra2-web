/**
 * 地面 + 海面材质：一张水体遮罩（由 water 多边形栅格化）决定陆地/海面。
 * 海面：深蓝底、缓慢流动的波纹高光、掠射角反射天色、岸边城市灯光的竖向倒影条纹。
 * 遮罩范围外按边缘像素延伸（北面一直是海），越过 uFarShore（对岸）再变回陆地。
 */
import { ShaderMaterial, type IUniform, type Texture } from 'three';
import { GLSL_OUTPUT, GLSL_FOG_PARS_FRAG, GLSL_FOG_VERT, GLSL_HASH, withFog } from './common';

const vertexShader = /* glsl */ `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  ${GLSL_FOG_VERT}
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uMask;
uniform vec4 uMaskRect; // 模拟坐标（米）：minX, minY, sizeX, sizeY
uniform float uFarShore; // 模拟 y（米），以北为对岸陆地
uniform float uTime;
varying vec3 vWorld;
${GLSL_FOG_PARS_FRAG}
${GLSL_HASH}

void main() {
  vec2 sim = vec2(vWorld.x, -vWorld.z);
  vec2 uv = (sim - uMaskRect.xy) / uMaskRect.zw;
  float water = smoothstep(0.4, 0.6, texture2D(uMask, uv).r);
  water *= 1.0 - smoothstep(uFarShore - 20.0, uFarShore, sim.y);

  vec3 land = vec3(0.012, 0.012, 0.017) * (0.8 + 0.4 * vnoise(sim * 0.08));

  vec3 V = normalize(cameraPosition - vWorld);
  float t = uTime;
  float ripple = vnoise(vec2(sim.x * 0.06, sim.y * 0.22) + vec2(t * 0.05, t * 0.11))
               * vnoise(vec2(sim.x * 0.13, sim.y * 0.5) - vec2(t * 0.07, t * 0.03));
  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
  vec3 sea = vec3(0.003, 0.004, 0.010);
  sea += vec3(0.016, 0.012, 0.034) * fres;
  sea += vec3(0.020, 0.020, 0.045) * smoothstep(0.35, 0.8, ripple) * (0.3 + 0.7 * fres);
  // 岸边倒影：越近岸越强（用遮罩的粗 mip 估距离），按 3 m 竖条取色，随波纹闪动
  float nearShore = 1.0 - texture2D(uMask, uv, 4.5).r;
  nearShore = smoothstep(0.02, 0.5, nearShore) * (1.0 - smoothstep(uFarShore - 600.0, uFarShore - 300.0, sim.y));
  float colId = floor(sim.x / 3.0);
  float on = step(hash12(vec2(colId, 1.7)), 0.45);
  vec3 tint = hash12(vec2(colId, 4.1)) < 0.6 ? vec3(1.0, 0.62, 0.28) : vec3(0.5, 0.7, 1.0);
  float shimmer = smoothstep(0.25, 0.75, vnoise(vec2(sim.x * 0.5, sim.y * 0.9 + t * 0.6)));
  sea += tint * on * shimmer * nearShore * 0.16;

  vec3 col = mix(land, sea, water);
  ${GLSL_OUTPUT}
}
`;

/** time 为各动画材质共享的 uniform 对象（同一引用，改一处全生效）。 */
export function createGroundMaterial(
  mask: Texture,
  rect: [number, number, number, number],
  farShore: number,
  time: IUniform<number>,
): ShaderMaterial {
  const uniforms = withFog({ uMaskRect: { value: rect }, uFarShore: { value: farShore } });
  // 贴图与共享时间在 merge 之后再挂上，避免被 UniformsUtils 克隆
  uniforms.uMask = { value: mask };
  uniforms.uTime = time;
  return new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
}

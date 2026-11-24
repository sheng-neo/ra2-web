/**
 * 街道小物件共用材质（灯杆、车身、电车、树、天桥）：realism 契约（线性 HDR、applyHaze、GLSL_FINISH）。
 *
 * 顶点属性：
 *   position, normal
 *   aAlb  (vec3) 反照率（线性）
 *   aEm   (vec3) 发光（线性 HDR，EMISSIVE 标尺）
 *   aPart (float) 0 = 用 aAlb；1 = 换成实例主色 iBody；2 = 换成实例副色 iBand；3 = 玻璃（暗、带天空菲涅耳）；
 *                 4 = 只在 iEmit > 0.5 的实例上画（出租车顶灯）
 * 实例属性（只在 InstancedMesh 上，defines.INST_COLOURS）：
 *   iBody (vec3) 主色，iBand (vec3) 副色，iEmit (float) 发光倍率（0 = 不亮，1 = 正常）
 * 照度 = cityAmbient（天光 + 街面反光，lift 取几何局部 y，即离物件底部的高度）× uLight，
 * 再加一点湿润车漆 / 金属的天空菲涅耳高光。
 */
import { ShaderMaterial } from 'three';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, sharedUniforms } from '../materials/lighting';

const vertexShader = /* glsl */ `
attribute vec3 aAlb;
attribute vec3 aEm;
attribute float aPart;
#ifdef VERTEX_LIFT
attribute float aLift;
#endif
#ifdef INST_COLOURS
attribute vec3 iBody;
attribute vec3 iBand;
attribute float iEmit;
#endif
varying vec3 vAlb;
varying vec3 vEm;
varying float vGlass;
varying vec3 vN;
varying vec3 vWorld;
varying float vLift;
void main() {
  vec3 alb = aAlb;
  float emit = 1.0;
#ifdef INST_COLOURS
  // part 4：只在 iEmit > 0.5 的实例上出现（出租车顶灯）；其余实例把顶点丢到裁剪空间外
  if (aPart > 3.5 && iEmit < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  if (aPart > 0.5 && aPart < 1.5) alb = iBody;
  if (aPart > 1.5 && aPart < 2.5) alb = iBand;
  emit = iEmit;
#endif
  vAlb = alb;
  vEm = aEm * emit;
  vGlass = aPart > 2.5 && aPart < 3.5 ? 1.0 : 0.0;
#ifdef USE_INSTANCING
  mat4 m = modelMatrix * instanceMatrix;
#else
  mat4 m = modelMatrix;
#endif
  vec4 world = m * vec4(position, 1.0);
  vWorld = world.xyz;
  vN = normalize(mat3(m) * normal);
#ifdef VERTEX_LIFT
  vLift = aLift;
#else
  vLift = position.y * length(m[1].xyz) + uLiftBias;
#endif
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
uniform float uWarmth;
uniform float uLight;
uniform float uNearCull;
varying vec3 vAlb;
varying vec3 vEm;
varying float vGlass;
varying vec3 vN;
varying vec3 vWorld;
varying float vLift;
void main() {
  // 近处剔除（树）：相机几米内的树冠不画，免得一个树冠糊满屏幕；边缘按屏幕位置抖动淡出
  if (uNearCull > 0.0) {
    float dc = length(cameraPosition - vWorld);
    float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (dc < uNearCull * (0.7 + 0.6 * dither)) discard;
  }
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(abs(dot(n, V)), 0.0, 1.0), 4.0);
  vec3 surface = vAlb * cityAmbient(n, vLift, uWarmth) * uLight;
  // 车漆 / 玻璃 / 金属：反射雾色天空（很弱）
  surface += uHazeColor * fres * mix(0.25, 0.6, vGlass) * max(n.y, 0.2);
  vec3 col = applyHaze(surface, vEm, vWorld);
  ${GLSL_FINISH}
}
`;

export interface PropMaterialOptions {
  /** 用实例主色 / 副色 / 发光倍率（InstancedMesh 的 iBody / iBand / iEmit）。 */
  instanceColours?: boolean;
  /** 街面主光源冷暖（0 = 白光 LED，1 = 钠灯）。 */
  warmth?: number;
  /** 照度倍率。 */
  light?: number;
  /** lift 的附加值（m）：物件底部离地面的高度。 */
  liftBias?: number;
  /** 离地高度取顶点属性 aLift（合并成一个网格的物件，如天桥）。 */
  vertexLift?: boolean;
  /** 相机这个距离（米）内的片元不画（树），0 = 不剔。 */
  nearCull?: number;
}

export function createPropMaterial(opts: PropMaterialOptions = {}): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...sharedUniforms(),
      uWarmth: { value: opts.warmth ?? 0.4 },
      uLight: { value: opts.light ?? 1 },
      uLiftBias: { value: opts.liftBias ?? 0 },
      uNearCull: { value: opts.nearCull ?? 0 },
    },
    defines: { ...(opts.instanceColours ? { INST_COLOURS: '' } : {}), ...(opts.vertexLift ? { VERTEX_LIFT: '' } : {}) },
    vertexShader: `uniform float uLiftBias;\n${vertexShader}`,
    fragmentShader,
  });
}

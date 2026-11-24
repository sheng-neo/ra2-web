/**
 * 海面材质（realism contract：线性 HDR、applyHaze、GLSL_FINISH）。
 *
 * - 遮罩：细遮罩（bbox 内 4 m，范围外按边缘延伸）× 九龙岸线（粗距离场，bbox 以北才用）；陆地 discard，
 *   露出底下旧的 0 mPD 平面（陆地底色）与地形。
 * - 波纹：5 个随 uTime 漂移的各向异性值噪声倍频（波长 0.22–7 m，长波减弱），像素足迹大于波长的倍频不再画成法线，
 *   改记入「未分辨粗糙度」，由反射的多点采样展宽（远处平滑光柱，近处碎成波光）。
 * - 反射：HIGH 平面反射纹理（沿视线竖直面倾斜法线取 5 点，投影「水面点 + 反射方向 × 估计距离」到镜像相机）；
 *   LOW / 降档：按方位角索引的发光条（CPU 每次相机明显移动时重算），按「需要的波面倾角」高斯加权。
 *   两条路径都乘 Schlick 菲涅尔（F0 = 0.02）。
 * - 底色 #0e0d11 左右，越远越亮（菲涅尔反射天光 / 雾色）。船尾浪花（≤ 8 条）。
 */
import { Color, Matrix4, ShaderMaterial, Vector2, Vector4, type Texture } from 'three';
import { GLSL_HASH } from '../materials/common';
import { GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, sharedUniforms } from '../materials/lighting';
import { GLSL_SKY, skyUniforms } from '../materials/sky';
import { SDF_RANGE_M } from './mask';

/** 船尾浪的 uniform 数组长度。 */
export const MAX_WAKES = 8;

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
${GLSL_HAZE}
${GLSL_SKY}
${GLSL_HASH}
uniform sampler2D uMask;
uniform vec4 uMaskRect;       // 模拟米：x0, y0, 宽, 高
uniform sampler2D uSdf;
uniform vec4 uSdfRect;
uniform sampler2D uRefl;
uniform mat4 uReflViewProj;
uniform vec2 uReflTexel;      // 反射纹理一个 texel（uv）
uniform float uReflMode;      // 1 = 平面反射，0 = 发光条
uniform sampler2D uStrip;
uniform vec3 uWaterBase;
uniform vec4 uWakes[${MAX_WAKES}];  // three 坐标 x, z；航向（弧度，three 坐标里从 +x 向 −z 量）；强度
varying vec3 vWorld;

const float SDF_RANGE = ${SDF_RANGE_M.toFixed(1)};
const float SLOPE_SIGMA = 0.13;

// 值噪声 + 解析导数（iq）
vec3 noised(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  float k = a - b - c + d;
  return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * (vec2(b - a, c - a) + k * u.yx));
}

// 一个倍频：p 为水平世界坐标（米），lambda 波长，dir 波向，c 相速（m/s）；返回坡度（d高/dx, d高/dz）
vec2 octave(vec2 p, float lambda, vec2 dir, float c, float amp, float seed) {
  vec2 side = vec2(-dir.y, dir.x);
  // 波峰方向拉长 2 倍：风浪的各向异性
  vec2 q = vec2(dot(p, dir), dot(p, side) * 0.5) / lambda;
  float t = uTime * c / lambda;
  vec3 n1 = noised(q - vec2(t, 0.0) + seed);
  vec3 n2 = noised(q * 1.37 + vec2(-t * 0.71, t * 0.29) + seed * 3.1);
  vec2 g = (n1.yz + n2.yz * vec2(1.37)) * 0.5;
  // 链式法则回到世界坐标
  vec2 gw = (dir * g.x + side * (g.y * 0.5)) / lambda;
  return gw * amp;
}

void waves(vec2 p, float fp, out vec2 slope, out float rough2) {
  slope = vec2(0.0);
  rough2 = 0.0;
  vec2 wind = normalize(vec2(0.82, -0.57));
  float L[5];
  L[0] = 7.0; L[1] = 2.6; L[2] = 1.05; L[3] = 0.45; L[4] = 0.22;
  for (int i = 0; i < 5; i++) {
    float lambda = L[i];
    float ang = float(i) * 0.61 - 0.4;
    vec2 dir = normalize(wind + vec2(cos(ang), sin(ang)) * 0.45);
    float c = sqrt(1.56 * lambda);
    // 每个倍频的坡度均方根约 0.065（总 σ ≈ 0.13）；amp 按噪声导数的均方根（约 0.6）换算。
    // 长波（7 m、2.6 m）只留 35 %：港内是短风浪（0.3–1 m 的碎浪，照片 04），长波大坡度会把近处倒影扭成「液态金属」的大漩涡
    // 1.05 m 的再降到 0.7，另加 0.22 m 的细碎浪：近处的倒影碎成一粒粒波光（照片 04），不是成片的弧形亮线
    float amp = 0.065 * lambda / 0.6 * (lambda > 2.0 ? 0.35 : (lambda > 1.0 ? 0.7 : 1.0));
    // 整合时调：一个波长至少约 8 px 才算完全分辨（原 3 px）。楼面亮窗反差大，2–3 px 的细浪把倒影打成雪花噪点；
    // 分辨不了的能量记入粗糙度，由竖向展宽 + 横向成条的抖动画成碎光柱（参考照片 01、02）
    float resolved = 1.0 - smoothstep(0.12 * lambda, 0.4 * lambda, fp);
    if (resolved > 0.01) slope += octave(p, lambda, dir, c, amp, float(i) * 17.3) * resolved;
    rough2 += 0.065 * 0.065 * (1.0 - resolved);
  }
}

float schlick(float cosT) {
  float m = 1.0 - clamp(cosT, 0.0, 1.0);
  float m2 = m * m;
  return 0.02 + 0.98 * m2 * m2 * m;
}

float waterAmount(vec2 sim) {
  vec2 uv = (sim - uMaskRect.xy) / uMaskRect.zw;
  // 数据范围内用细遮罩；范围外（对岸、港岛两翼）用粗距离场的符号
  if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) return texture2D(uMask, uv).r;
  vec2 su = (sim - uSdfRect.xy) / uSdfRect.zw;
  return smoothstep(0.49, 0.51, texture2D(uSdf, su).r);
}

float shoreDist(vec2 sim) {
  vec2 su = (sim - uSdfRect.xy) / uSdfRect.zw;
  return (texture2D(uSdf, su).r - 0.5) * 2.0 * SDF_RANGE;
}

// 船尾浪：船后方 V 字形的白色碎浪，随距离变淡
float wakeFoam(vec2 p) {
  float foam = 0.0;
  for (int i = 0; i < ${MAX_WAKES}; i++) {
    vec4 w = uWakes[i];
    if (w.w <= 0.0) continue;
    vec2 fwd = vec2(cos(w.z), -sin(w.z));
    vec2 d = p - w.xy;
    float along = -dot(d, fwd);           // 船后方为正
    float across = dot(d, vec2(-fwd.y, fwd.x));
    if (along < -4.0 || along > 260.0) continue;
    float spread = 2.5 + along * 0.33;    // 约 19° 的开尔文角
    float arm = exp(-pow((abs(across) - spread) / (2.5 + along * 0.06), 2.0));
    float centre = exp(-pow(across / (3.0 + along * 0.06), 2.0)) * exp(-along / 60.0);
    float fade = exp(-along / 90.0) * smoothstep(-4.0, 2.0, along);
    float brk = vnoise(p * 0.7 + uTime * 0.5) * 0.7 + 0.3;
    foam = max(foam, (arm * 0.35 + centre * 0.8) * fade * brk * w.w);
  }
  return foam;
}

void main() {
  vec2 sim = vec2(vWorld.x, -vWorld.z);
  float wet = waterAmount(sim);
  if (wet < 0.5) discard;

  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 fw = fwidth(vWorld.xz);
  float fp = max(max(fw.x, fw.y), 1e-3);
  vec2 slope;
  float rough2;
  waves(vWorld.xz, fp, slope, rough2);
  float rough = sqrt(rough2);
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  float sdf = max(shoreDist(sim), 0.0);

  vec3 refl = vec3(0.0);
  float F = 0.0;
  vec3 fwd = normalize(vec3(-V.x, 0.0, -V.z) + vec3(1e-4, 0.0, 0.0));
  if (uReflMode > 0.5) {
    // 平面反射。未分辨的细浪：一半能量用「子像素波面坡度」采样（沿波峰拉长、沿视线很短的值噪声，
    // 频率不低于屏幕像素尺度，远处成为 1–2 px 高、5 px 以上宽的横向碎光），另一半在 ±σ 处平滑采样；
    // 每次采样用 textureGrad 只在竖直方向展宽（各向异性：横向 1 texel，竖向随粗糙度），
    // 所以光柱只往竖向拉长、不会横向糊开，也不会把窗格的细碎图案变成雪花噪点（参考照片 01、02）。
    float D = clamp(sdf * 1.1 + 120.0, 80.0, 3500.0);
    vec2 side2 = vec2(-fwd.z, fwd.x);
    float fpS = max(length(dFdx(vWorld.xz)), 1e-3);
    float fpF = max(length(dFdy(vWorld.xz)), 1e-3);
    vec2 q = vec2(dot(vWorld.xz, side2) / max(4.0, fpS * 8.0), dot(vWorld.xz, fwd.xz) / max(0.6, fpF * 1.2) + uTime * 0.6);
    float jitter = (vnoise(q) * 2.0 - 1.0) * 1.1 + (vnoise(q * vec2(0.41, 1.9) + 7.1) * 2.0 - 1.0) * 0.6;
    vec2 gx = vec2(uReflTexel.x, 0.0);
    // 竖向展宽上限 0.15（原 0.06）：光柱一路拉到相机前，再由横向抖动切成 5–20 px 宽的短横段
    vec2 gy = vec2(0.0, clamp(rough * 0.3, uReflTexel.y, 0.15));
    float wsum = 0.0;
    for (int k = 0; k < 3; k++) {
      float o = k == 0 ? jitter * rough * 1.5 : (k == 1 ? -1.0 : 1.0) * rough * 0.9;
      float wk = k == 0 ? 0.5 : 0.25;
      vec3 nk = normalize(n + fwd * o);
      vec3 R = reflect(-V, nk);
      float fk = schlick(dot(nk, V));
      vec3 s;
      if (R.y <= 0.002) {
        s = uWaterBase * 2.0;
      } else {
        vec4 c = uReflViewProj * vec4(vWorld + R * D, 1.0);
        vec2 uv = c.xy / max(c.w, 1e-4) * 0.5 + 0.5;
        float inside = c.w > 0.0 ? smoothstep(0.0, 0.03, uv.x) * smoothstep(1.0, 0.97, uv.x) * smoothstep(0.0, 0.03, uv.y) * smoothstep(1.0, 0.97, uv.y) : 0.0;
        vec3 tex = inside > 0.0 ? textureGrad(uRefl, clamp(uv, vec2(0.001), vec2(0.999)), gx, gy).rgb : vec3(0.0);
        s = mix(nightSky(R) * 0.6, tex, inside);
        // 软阈值：暗的东西（夜空、未亮灯墙面、整片亮窗模糊后的灰）只反射约三成，亮的发光体（招牌、灯、LED、冠顶）照单全收，
        // 所以水面是黑底上一条条彩色光柱，而不是整片灰镜子（照片 01、02）
        float ls = dot(s, vec3(0.2126, 0.7152, 0.0722));
        s *= 0.3 + 0.9 * smoothstep(0.1, 0.9, ls);
      }
      refl += wk * fk * s;
      F += wk * fk;
      wsum += wk;
    }
    refl /= wsum;
    F /= wsum;
  } else {
    // 发光条：方位角索引；需要的波面倾角 = (视线俯角 − 光源仰角) / 2，与本像素已分辨坡度比较
    vec3 R = reflect(-V, n);
    F = schlick(dot(n, V));
    vec3 d = -V;
    float u = fract(atan(d.x, -d.z) / 6.28318530718);
    vec4 s = texture2D(uStrip, vec2(u, 0.5));
    // 反射方向低于该方位的天际线：看到的是楼（暗墙，亮窗在下面的发光条项里），不是天光
    float eR = asin(clamp(R.y, 0.0, 1.0));
    refl = F * (eR < s.a ? uWaterBase * 0.6 : nightSky(R) * 0.4);
    float dep = asin(clamp(V.y, 0.0, 1.0));
    float need = (dep - s.a * 0.5) * 0.5;
    vec2 side2 = vec2(-fwd.z, fwd.x);
    float fpS = max(length(dFdx(vWorld.xz)), 1e-3);
    float fpF = max(length(dFdy(vWorld.xz)), 1e-3);
    vec2 q = vec2(dot(vWorld.xz, side2) / max(6.0, fpS * 5.0), dot(vWorld.xz, fwd.xz) / max(0.8, fpF * 1.4) + uTime * 0.6);
    float jitter = (vnoise(q) * 2.0 - 1.0) * 0.8 + (vnoise(q * vec2(0.41, 1.9) + 7.1) * 2.0 - 1.0) * 0.45;
    float have = dot(slope, fwd.xz) + jitter * sqrt(rough2) * 0.9;
    float sw2 = rough2 * 0.45 + 0.03 * 0.03;
    float g = exp(-0.5 * (need - have) * (need - have) / sw2) * sqrt(sw2) / SLOPE_SIGMA;
    float Fs = schlick(sin((dep + s.a * 0.5) * 0.5));
    refl += s.rgb * Fs * g * 1.6;
  }

  // 船尾浪花：白色碎浪（只受环境光，夜里不亮）
  float foam = wakeFoam(vWorld.xz);
  vec3 base = mix(uWaterBase, vec3(0.028, 0.029, 0.031), clamp(foam, 0.0, 1.0));
  vec3 col = applyHaze(base * (1.0 - F), refl, vWorld);
  ${GLSL_FINISH}
}
`;

export interface WaterTextures {
  mask: Texture;
  maskRect: [number, number, number, number];
  sdf: Texture;
  sdfRect: [number, number, number, number];
  strip: Texture;
  reflection: Texture | null;
}

export function createWaterMaterial(t: WaterTextures): ShaderMaterial {
  const wakes: Vector4[] = [];
  for (let i = 0; i < MAX_WAKES; i++) wakes.push(new Vector4(0, 0, 0, 0));
  return new ShaderMaterial({
    uniforms: {
      ...sharedUniforms(),
      ...skyUniforms(),
      uMask: { value: t.mask },
      uMaskRect: { value: new Vector4(...t.maskRect) },
      uSdf: { value: t.sdf },
      uSdfRect: { value: new Vector4(...t.sdfRect) },
      uRefl: { value: t.reflection },
      uReflViewProj: { value: new Matrix4() },
      uReflTexel: { value: new Vector2(1 / 640, 1 / 360) },
      uReflMode: { value: t.reflection ? 1 : 0 },
      uStrip: { value: t.strip },
      uWaterBase: { value: new Color('#0b0a0e') },
      uWakes: { value: wakes },
    },
    vertexShader,
    fragmentShader,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

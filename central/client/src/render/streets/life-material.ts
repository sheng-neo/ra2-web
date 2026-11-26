/**
 * 街道设施材质（R2 STREETLIFE）：栏杆、护柱、行人灯、巴士站、垃圾桶、消防栓、皇后像广场水池与喷泉墙、行人天桥玻璃。
 * 遵守写实化光照契约：线性 HDR、cityAmbient（lift = 离地高度）、applyHaze、GLSL_FINISH；双面（单片栏杆两面都看得到）。
 *
 * 顶点属性：position, normal,
 *   aAlb (vec3) 反照率（线性），aEm (vec3) 发光（线性 HDR，EMISSIVE 标尺），
 *   aUv (vec2) 面内坐标（米或 0–1，按 kind），aK (vec3) x = kind，y = 附加参数（相位 / 种子），z = 离地高度（m，lift 用）。
 * kind：
 *   0 普通面；
 *   1 栏杆片：uv = (沿栏杆 m, 离地 m)，片元画立柱、上下横杆、0.12 m 间距竖条，其余透空（屏幕抖动镂空，远处自然变「半透明」）；
 *   2 行人灯面：uv 0–1（上格红色站立人、下格绿色步行人），y = 横过道路的车辆信号相位；状态按 signals.pedSignalState 同一公式；
 *   3 灯箱 / 广告箱：抽象色块（y = 种子），亮度取 aEm；
 *   4 水池水面：uv = 米；暗蓝反光 + 慢速涟漪闪光 + 水下青色射灯；
 *   5 喷泉水幕：uv = (沿墙 m, 离地 m)，向下流动的淡亮水纹；
 *   6 天桥侧面：uv = (沿桥 m, 离桥面 m)。v < 0 桥面封边；玻璃廊（y = 0）：1.5 m 一根窗框、1.0 m 扶手横杆、
 *     室内冷白灯带（0.5–0.8）、顶部光管（1.0–1.4）、3.2 m 以上白色檐口；开敞廊（y = 1）：1.1 m 栏杆（竖条），以上透空；
 *   7 透明玻璃（候车亭背板）：屏幕抖动镂空约一半，看得见后面的人；
 *   8 桥底 / 棚底：浅灰，沿线 2.4 m 一对筒灯（1.0–1.4）；
 *   9 底部投光的雕塑面（喷泉墙）：uv = (沿墙 m, 离池面 m)，aEm 为墙脚亮度，往上按指数衰减，竖向浅槽纹。
 */
import { DoubleSide, ShaderMaterial } from 'three';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_FINISH_ALPHA, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms } from '../materials/lighting';
import { PED_FLASH, PED_FLASH_HZ, PED_GREEN, PED_RED, SIGNAL_CYCLE_S } from './signals';

const glslVec3 = (c: { r: number; g: number; b: number }, k = 1) => `vec3(${(c.r * k).toFixed(4)}, ${(c.g * k).toFixed(4)}, ${(c.b * k).toFixed(4)})`;

const vertexShader = /* glsl */ `
attribute vec3 aAlb;
attribute vec3 aEm;
attribute vec2 aUv;
attribute vec3 aK;
varying vec3 vAlb;
varying vec3 vEm;
varying vec2 vUv;
varying vec3 vK;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vAlb = aAlb;
  vEm = aEm;
  vUv = aUv;
  vK = aK;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
uniform float uWarmth;
varying vec3 vAlb;
varying vec3 vEm;
varying vec2 vUv;
varying vec3 vK;
varying vec3 vN;
varying vec3 vWorld;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// 屏幕抖动（确定性：只取决于像素位置）
float dither() {
  return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
}
// 抗锯齿条纹覆盖率：x 在 [0, w) 内为 1（周期 1）
float stripe(float x, float w) {
  float f = fract(x);
  float aa = max(fwidth(x), 1e-4);
  return clamp((w - f) / aa + 0.5, 0.0, 1.0) * clamp(f / aa + 0.5, 0.0, 1.0);
}
float band(float v, float a, float b) {
  float aa = max(fwidth(v), 1e-4);
  return clamp((v - a) / aa + 0.5, 0.0, 1.0) * clamp((b - v) / aa + 0.5, 0.0, 1.0);
}
// 行人灯图形（局部坐标 p，格内 −1…1）：站立人 / 步行人
float standingMan(vec2 p) {
  float head = step(length(p - vec2(0.0, 0.62)), 0.17);
  float body = step(abs(p.x), 0.2) * step(-0.05, p.y) * step(p.y, 0.42);
  float legs = step(abs(abs(p.x) - 0.1), 0.065) * step(-0.72, p.y) * step(p.y, 0.0);
  float arms = step(abs(abs(p.x) - 0.27), 0.05) * step(-0.08, p.y) * step(p.y, 0.4);
  return max(max(head, body), max(legs, arms));
}
float walkingMan(vec2 p) {
  float head = step(length(p - vec2(0.05, 0.62)), 0.17);
  vec2 q = p - vec2(0.0, 0.2);
  float body = step(abs(q.x + q.y * 0.15), 0.15) * step(-0.25, q.y) * step(q.y, 0.25);
  // 两腿叉开
  float l1 = step(abs((p.x - 0.0) - (p.y + 0.05) * 0.55), 0.07) * step(-0.72, p.y) * step(p.y, -0.02);
  float l2 = step(abs((p.x - 0.0) + (p.y + 0.05) * 0.5), 0.07) * step(-0.72, p.y) * step(p.y, -0.02);
  float a1 = step(abs((p.x - 0.05) - (p.y - 0.3) * 0.7), 0.055) * step(0.0, p.y) * step(p.y, 0.4);
  float a2 = step(abs((p.x - 0.05) + (p.y - 0.3) * 0.7), 0.055) * step(0.0, p.y) * step(p.y, 0.4);
  return max(max(head, body), max(max(l1, l2), max(a1, a2)));
}

void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float glassAlpha = 1.0;
  float kind = vK.x;
  vec3 alb = vAlb;
  vec3 em = vEm;
  float lift = vK.z;
  if (kind > 0.5 && kind < 1.5) {
    // 栏杆：立柱（片首 6 cm）、上横杆、下横杆、竖条
    float u = vUv.x;
    float v = vUv.y;
    float post = band(u, -0.01, 0.06);
    float rails = max(band(v, 0.96, 1.05), band(v, 0.1, 0.17));
    float bars = stripe(u / 0.12, 0.22) * band(v, 0.1, 1.0);
    float cover = max(max(post, rails), bars);
    if (cover < 0.02 || cover < dither()) discard;
    // 上横杆顶面一条亮边
    alb *= 1.0 + 0.6 * band(v, 1.02, 1.05);
  } else if (kind > 1.5 && kind < 2.5) {
    // 行人灯：上格红色站立人、下格绿色步行人
    float c = fract(uTime / ${SIGNAL_CYCLE_S.toFixed(1)} + vK.y);
    float green = step(${PED_GREEN}, c) * step(c, ${PED_FLASH});
    float flash = step(${PED_FLASH}, c) * step(c, ${PED_RED}) * step(0.5, fract(uTime * ${PED_FLASH_HZ.toFixed(1)}));
    float red = 1.0 - step(${PED_GREEN}, c) * step(c, ${PED_RED});
    bool top = vUv.y > 0.5;
    vec2 cell = vec2((vUv.x - 0.5) * 2.0, ((top ? vUv.y - 0.75 : vUv.y - 0.25) * 4.0)) * 1.15;
    float glyph = top ? standingMan(cell) : walkingMan(cell);
    float frame = step(abs(cell.x), 0.95) * step(abs(cell.y), 0.95);
    alb = vec3(0.01);
    float on = top ? red : max(green, flash);
    vec3 lit = top ? RED_MAN : GREEN_MAN;
    em = lit * glyph * frame * (0.012 + on * 2.5);
  } else if (kind > 2.5 && kind < 3.5) {
    // 灯箱：抽象色块（不写字、无标志）
    float s = vK.y;
    vec3 a = 0.5 + 0.5 * cos(6.2831 * (s + vec3(0.0, 0.33, 0.67)));
    vec3 b = 0.5 + 0.5 * cos(6.2831 * (s * 1.7 + 0.4 + vec3(0.0, 0.33, 0.67)));
    float split = step(fract(s * 7.3) * 0.6 + 0.2, vUv.y + 0.15 * sin(vUv.x * 3.0 + s * 9.0));
    vec3 tint = mix(a, b, split);
    em *= tint * 1.1 + 0.12;
  } else if (kind > 3.5 && kind < 4.5) {
    // 水面：暗蓝 + 涟漪闪光（反射上方暖色灯笼）+ 水下青色射灯
    vec2 p = vUv;
    float t = uTime;
    float rip = sin(p.x * 3.1 + t * 1.3) * sin(p.y * 2.7 - t * 1.1) + 0.6 * sin((p.x + p.y) * 5.3 + t * 2.1);
    float glint = pow(clamp(rip * 0.5 + 0.2, 0.0, 1.0), 10.0);
    // R2 修复轮：深海军蓝池水（照片 18，约 #20294d），每 5 m 一格里约四成有一盏水下青色射灯（半径约 1 m），
    // 不再是整池亮青色的泳池
    vec2 cell = floor(p / 5.0);
    vec2 cp = p - (cell + 0.5) * 5.0;
    float spot = step(0.58, hash12(cell + 3.3)) * exp(-dot(cp, cp) / 0.7);
    alb = vec3(0.006, 0.009, 0.03);
    float sheen = 0.75 + 0.25 * sin(p.x * 1.3 + p.y * 0.7 + t * 0.6);
    em = vec3(0.012, 0.019, 0.062) + uHazeColor * 0.16 * sheen + vec3(0.1, 0.45, 0.55) * spot * (0.45 + 0.15 * rip) + vec3(0.9, 0.6, 0.3) * glint * 0.35;
  } else if (kind > 4.5 && kind < 5.5) {
    // 喷泉水幕：向下流动的亮纹
    float flow = fract(vUv.y * 1.7 + uTime * 0.9 + hash12(vec2(floor(vUv.x * 6.0), 1.0)));
    float streak = smoothstep(0.0, 0.3, flow) * (1.0 - smoothstep(0.5, 1.0, flow));
    em = vEm * (0.4 + 0.6 * streak);
    if (streak < 0.12 && dither() > 0.6) discard;
  } else if (kind > 6.5 && kind < 7.5) {
    // 候车亭玻璃（R2 修复轮）：在单独的半透明网格里画（GLASS_PASS）——淡青灰、中腰一条磨砂带、每 1.3 m 一根细竖框；
    // 不透明网格里不画（不再用屏幕抖动，近看不像铁丝网）
#ifndef GLASS_PASS
    discard;
#endif
    float u = vUv.x;
    float v = vUv.y;
    float frost = band(v, 0.95, 1.45);
    float mull = stripe(u / 1.3 + 0.5, 0.025);
    glassAlpha = 0.16 + 0.4 * frost + 0.75 * mull;
    alb = mix(vec3(0.05, 0.06, 0.065), vec3(0.4, 0.42, 0.43), max(frost, mull));
    em = TUBE * (0.025 + 0.05 * frost) * (0.6 + 0.4 * smoothstep(0.5, 2.3, v));
  } else if (kind > 5.5 && kind < 6.5) {
    float u = vUv.x;
    float v = vUv.y;
    if (v < 0.0) {
      // 桥面封边（浅灰）
      alb = vec3(0.3, 0.3, 0.29);
      em = vec3(0.0);
    } else if (v > 3.2) {
      // 白色檐口（被桥上灯光微微照亮）
      alb = vec3(0.62, 0.62, 0.6);
      em = TUBE * 0.12;
    } else if (vK.y > 0.5) {
      // 开敞廊：栏杆（扶手、立柱、竖条），以上透空
      float rails = max(band(v, 1.02, 1.1), band(v, 0.0, 0.08));
      float bars = stripe(u / 0.13, 0.2) * band(v, 0.0, 1.1);
      float posts = stripe(u / 2.0, 0.04);
      float cover = max(max(rails, bars), posts);
      if (v > 1.1 || cover < 0.02 || cover < dither()) discard;
      alb = vec3(0.32, 0.33, 0.34);
      em = vec3(0.0);
    } else {
      // 玻璃廊：窗框 + 扶手横杆 + 室内灯带（上亮下暗），顶部光管
      float mull = stripe(u / 1.5, 0.05);
      float rail = band(v, 0.98, 1.06);
      float tube = band(v, 2.8, 2.98);
      float floorBand = 1.0 - smoothstep(0.05, 0.35, v);
      // 室内：天花下亮、腰下暗，沿线有人影般的明暗起伏
      float people = 0.75 + 0.25 * sin(u * 2.3 + sin(u * 0.71) * 3.0);
      em = TUBE * (0.18 + 0.4 * smoothstep(0.6, 2.7, v)) * (1.0 - 0.8 * floorBand) * mix(1.0, people, band(v, 0.3, 1.8)) + TUBE * tube * 1.2;
      em *= (1.0 - mull) * (1.0 - 0.85 * rail);
      alb = mix(vec3(0.015, 0.017, 0.02), vec3(0.55, 0.56, 0.57), max(mull, rail));
    }
  } else if (kind > 8.5 && kind < 9.5) {
    // 喷泉墙（R2 修复轮）：抽象浮雕色块（深底上红、绿、金几块；不写字、无图案标志），块间暗缝；
    // 墙脚暖色投光往上衰减（彩色块反光多一些）；墙顶一道水帘亮线
    float u = vUv.x;
    float v = vUv.y;
    // 每片墙 4–5 块不规则的彩色浮雕（位置、大小按片哈希），其余是深色底
    float pid = floor(u / 2.47);
    float lu = u - pid * 2.47;
    vec3 relief = vec3(0.035, 0.03, 0.028);
    float lit = 0.35;
    for (int k = 0; k < 5; k++) {
      float fk = float(k);
      vec2 c = vec2(0.25 + 1.6 * hash12(vec2(pid, fk * 3.1)), 0.3 + (vK.y - 0.6) * hash12(vec2(pid + 7.7, fk * 5.3)));
      vec2 hs = vec2(0.18 + 0.3 * hash12(vec2(pid, fk + 11.0)), 0.12 + 0.25 * hash12(vec2(pid, fk + 21.0)));
      vec2 d = abs(vec2(lu, v) - c) - hs;
      float inside = 1.0 - smoothstep(-0.015, 0.015, max(d.x, d.y));
      float hc = hash12(vec2(pid * 1.3 + fk, 41.0));
      vec3 pc = hc < 0.3 ? vec3(0.34, 0.05, 0.04) : (hc < 0.55 ? vec3(0.06, 0.2, 0.1) : (hc < 0.8 ? vec3(0.38, 0.27, 0.07) : vec3(0.05, 0.16, 0.2)));
      relief = mix(relief, pc, inside);
      lit = mix(lit, 1.1, inside);
    }
    alb = relief;
    em = vEm * exp(-max(v, 0.0) * 2.4) * lit;
    em += vec3(0.22, 0.32, 0.4) * band(v, vK.y - 0.06, vK.y + 0.02);
  } else if (kind > 7.5 && kind < 8.5) {
    // 桥底 / 棚底：两排筒灯
    vec2 c = vec2(fract(vUv.x / 2.4) - 0.5, abs(vUv.y) - 0.9);
    float spot = 1.0 - smoothstep(0.08, 0.16, length(c * vec2(2.4, 1.0)));
    em = TUBE * 1.3 * spot;
  }
  vec3 surface = alb * cityAmbient(n, lift, uWarmth);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(abs(dot(n, V)), 0.0, 1.0), 4.0);
  surface += uHazeColor * fres * 0.25 * max(n.y, 0.2);
  vec3 col = applyHaze(surface, em, vWorld);
#ifdef GLASS_PASS
  float alpha = clamp(glassAlpha + 0.5 * fres, 0.0, 1.0);
  ${GLSL_FINISH_ALPHA}
#else
  ${GLSL_FINISH}
#endif
}
`;

export function createLifeMaterial(warmth = 0.4, glassPass = false): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...sharedUniforms(), uWarmth: { value: warmth } },
    defines: {
      RED_MAN: glslVec3(lightColour('#ff3a24')),
      GREEN_MAN: glslVec3(lightColour('#3dffb0')),
      TUBE: glslVec3(lightColour('tubeCool')),
      ...(glassPass ? { GLASS_PASS: '' } : {}),
    },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    transparent: glassPass,
    depthWrite: !glassPass,
  });
}

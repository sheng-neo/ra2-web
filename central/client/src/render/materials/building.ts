/**
 * 建筑材质：程序窗格（米制 UV）、夜间光照、雾。无贴图。
 * 立面模式与 style 位含义见 render/facade.ts。
 */
import { ShaderMaterial } from 'three';
import { GLSL_OUTPUT, GLSL_FOG_PARS_FRAG, GLSL_FOG_VERT, GLSL_HASH, GLSL_NIGHT_LIGHT, withFog } from './common';

const vertexShader = /* glsl */ `
attribute vec4 aFacade;
varying vec3 vFacade;
// 风格码逐栋恒定：flat 避免插值误差把 hash 输入搅成噪点
flat varying float vStyle;
varying vec3 vNormalW;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vFacade = aFacade.xyz;
  vStyle = aFacade.w;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  ${GLSL_FOG_VERT}
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vFacade;
flat varying float vStyle;
varying vec3 vNormalW;
varying vec3 vWorld;
${GLSL_FOG_PARS_FRAG}
${GLSL_HASH}
${GLSL_NIGHT_LIGHT}

const float FLOOR_H = 3.2;

// 抗锯齿矩形脉冲：中心 c、半宽 hw，aa 为一个像素对应的格数
float pulse(float x, float c, float hw, float aa) {
  float d = abs(x - c);
  return 1.0 - smoothstep(hw - aa, hw + aa, d);
}

vec3 windowTint(float h, float warmP) {
  vec3 warm = vec3(1.0, 0.60, 0.26);
  vec3 white = vec3(0.92, 0.92, 0.85);
  vec3 cool = vec3(0.55, 0.75, 1.0);
  return h < warmP ? warm : (h < warmP + 0.18 ? white : cool);
}

const vec3 WIN_OFF = vec3(0.012, 0.016, 0.030);

// 一级窗格：L = 0 为真实窗距；L > 0 时把 2^L × 2^L 个窗并成一个「远景窗」，
// 亮灯概率与窗面积占比不变，所以平均亮度一致，远处仍是点点灯光而不是一片灰。
// 返回 (窗色, 窗遮罩)。
vec4 windowLayer(vec2 g, vec2 aa, float L, float key, float litRatio, float warmP, float wx, bool porthole, vec2 cellM) {
  float s = exp2(L);
  vec2 sg = g / s;
  vec2 cell = floor(sg);
  vec2 f = fract(sg);
  vec2 a2 = aa / s;
  float mask;
  if (porthole && L < 0.5) {
    float r = length((f - 0.5) * cellM);
    float aaM = max(a2.x * cellM.x, a2.y * cellM.y);
    mask = 1.0 - smoothstep(0.62 - aaM, 0.62 + aaM, r);
  } else {
    mask = pulse(f.x, 0.5, wx * 0.5, a2.x) * pulse(f.y, 0.56, 0.29, a2.y);
  }
  // 整层熄灯 / 整层通亮的楼层只在真实窗距上体现
  float rowH = hash12(vec2(cell.y + 0.5, key + L * 13.0));
  float floorBias = L < 0.5 ? (rowH < 0.12 ? 0.15 : (rowH > 0.86 ? 1.8 : 1.0)) : 1.0;
  float lit = step(hash12(cell + vec2(key, L * 7.0)), litRatio * floorBias);
  vec3 tintC = windowTint(hash12(cell * 1.37 + 11.0 + key), warmP);
  float bright = 0.30 + 0.70 * hash12(cell * 2.11 + 5.0 + L);
  // 近看：靠天花板略亮，宽窗中间一道竖梃
  float glow = L < 0.5 ? 0.7 + 0.3 * smoothstep(0.3, 0.85, f.y) : 0.85;
  float mullion = L < 0.5 && cellM.x >= 2.0 && !porthole ? pulse(f.x, 0.5, 0.025, a2.x) : 0.0;
  vec3 c = mix(WIN_OFF, tintC * bright * glow, lit * (1.0 - mullion * 0.85));
  return vec4(c, mask);
}

void main() {
  float style = vStyle;
  float mode = floor(style / 256.0);
  float seed = floor(mod(style, 256.0));
  float rnd = fract(style);
  float tint = mod(seed, 4.0);
  float litLv = mod(floor(seed / 4.0), 4.0);
  float bayLv = mod(floor(seed / 16.0), 4.0);
  float body = floor(seed / 64.0);

  vec3 n = normalize(vNormalW);
  bool roof = n.y > 0.7;
  float u = vFacade.x;
  float v = vFacade.y;
  float h = vFacade.z;

  // 墙色族：混凝土 / 蓝玻璃 / 青玻璃 / 暖石
  vec3 albedo = body < 0.5 ? vec3(0.050, 0.047, 0.056)
              : body < 1.5 ? vec3(0.030, 0.042, 0.070)
              : body < 2.5 ? vec3(0.028, 0.055, 0.060)
              : vec3(0.064, 0.048, 0.038);
  albedo *= 0.85 + 0.3 * rnd;
  if (mode > 0.5 && mode < 1.5) albedo = vec3(0.046, 0.046, 0.050);
  if (mode > 1.5 && mode < 2.5) albedo = vec3(0.090, 0.092, 0.100);
  if (mode > 3.5) albedo = vec3(0.014, 0.018, 0.016);

  vec3 light = nightLight(n, roof || mode > 3.5 ? 30.0 : v);
  vec3 col = albedo * light;

  if (mode > 3.5) {
    // 远山（u, v 为平面坐标）：稀疏的屋苑灯点
    vec2 g = vec2(u / 9.0, v / 6.0);
    vec2 cell = floor(g);
    vec2 aa = fwidth(g);
    float far = smoothstep(0.4, 1.0, max(aa.x, aa.y));
    float on = step(hash12(cell + 7.7), 0.06);
    float dotM = pulse(fract(g.x), 0.5, 0.12, aa.x) * pulse(fract(g.y), 0.5, 0.18, aa.y);
    col += vec3(1.0, 0.7, 0.4) * on * mix(dotM, 0.03, far) * 0.9;
  } else if (roof) {
    // 屋顶：略亮的深灰 + 低频斑驳
    float k = vnoise(vec2(u, v) * 0.35);
    col = vec3(0.050, 0.050, 0.060) * (0.8 + 0.4 * k) * light;
  } else if (mode < 0.5 || (mode > 1.5 && mode < 2.5)) {
    bool porthole = mode > 1.5;
    vec2 cellM = porthole ? vec2(2.4, 3.4) : vec2(1.5 + bayLv * 0.5, FLOOR_H);
    vec2 g = vec2(u, v) / cellM;
    vec2 aa = fwidth(g);
    float wx = 0.58 + 0.22 * fract(rnd * 7.31);
    float litRatio = porthole ? 0.55 : 0.14 + litLv * 0.15;
    float warmP = 1.0 - tint / 3.0;
    float key = rnd * 131.0 + seed * 0.37;
    // 每像素对应的窗格数决定合并级别；两级之间交叉淡化
    float lv = log2(max(max(aa.x, aa.y), 1e-4) * 1.6);
    float L0 = clamp(floor(lv), 0.0, 4.0);
    float t = lv < 0.0 ? 0.0 : smoothstep(0.55, 1.0, lv - L0);
    vec4 w0 = windowLayer(g, aa, L0, key, litRatio, warmP, wx, porthole, cellM);
    vec3 wcol = mix(col, w0.rgb, w0.a);
    if (t > 0.0) {
      vec4 w1 = windowLayer(g, aa, L0 + 1.0, key, litRatio, warmP, wx, porthole, cellM);
      wcol = mix(wcol, mix(col, w1.rgb, w1.a), t);
    }
    float far = clamp(lv, 0.0, 1.0);

    // 只在 [首层之上, 女儿墙之下] 画窗；矮楼至少留一层
    float top = h - 1.2;
    float inBand = step(4.2, v) * step(v, top);
    col = mix(col, wcol, inBand);

    // 首层铺面：暖光橱窗为主，偶有彩色招牌光，少数落闸
    if (!porthole && h > 6.0) {
      float sc = floor(u / 4.0);
      float sh = hash12(vec2(sc, seed + rnd * 53.0));
      vec3 shop = sh < 0.62 ? vec3(1.0, 0.72, 0.40) * (0.45 + 0.4 * hash12(vec2(sc, 3.0)))
                : sh < 0.78 ? (hash12(vec2(sc, 9.0)) < 0.5 ? vec3(1.0, 0.18, 0.45) : vec3(0.15, 0.85, 1.0)) * 0.55
                : vec3(0.05, 0.05, 0.055);
      float aaS = fwidth(v);
      float band = pulse(v, 2.0, 1.4, aaS) * pulse(fract(u / 4.0), 0.5, 0.42, fwidth(u / 4.0));
      col = mix(col, shop, band * (1.0 - far * 0.5));
    }
  } else if (mode > 2.5 && mode < 3.5) {
    // 玻璃幕墙：反射天色（菲涅尔）+ 竖梃亮线 + 稀疏亮灯
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 R = reflect(-V, n);
    vec3 skyR = mix(vec3(0.05, 0.035, 0.09), vec3(0.006, 0.006, 0.025), smoothstep(-0.05, 0.6, R.y));
    float fres = 0.25 + 0.75 * pow(1.0 - max(dot(n, V), 0.0), 3.0);
    col = albedo * light * 0.6 + skyR * fres * 1.6;
    vec2 g = vec2(u / 1.5, v / FLOOR_H);
    vec2 aa = fwidth(g);
    float far = smoothstep(0.4, 0.9, max(aa.x, aa.y));
    float lines = max(1.0 - pulse(fract(g.x), 0.5, 0.46, aa.x), 1.0 - pulse(fract(g.y), 0.5, 0.47, aa.y));
    vec3 lineC = vec3(0.30, 0.42, 0.60);
    col = mix(col, lineC, lines * (1.0 - far) * 0.6 + far * 0.08);
    float lit = step(hash12(floor(g) + rnd * 71.0), 0.16);
    col += vec3(0.55, 0.72, 0.95) * lit * (1.0 - lines) * (1.0 - far) * 0.5 + far * vec3(0.02, 0.03, 0.05);
  }
  ${GLSL_OUTPUT}
}
`;

/** fogScale < 1：远景层（对岸、山脊）透雾更远。 */
export function createBuildingMaterial(fogScale = 1): ShaderMaterial {
  const m = new ShaderMaterial({
    uniforms: withFog({}),
    vertexShader,
    fragmentShader,
    fog: true,
  });
  m.uniforms.uFogScale!.value = fogScale;
  return m;
}

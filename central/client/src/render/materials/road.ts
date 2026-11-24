/**
 * 路面材质（realism 契约：线性 HDR、applyHaze、GLSL_FINISH）。
 * 车行道：暖灰沥青（细颗粒 + 修补块）、白色分道虚线、双向路中央白线、主路路边双黄线；不画方向箭头。
 * 路缘：0.25 m 浅灰花岗岩路缘石 + 路边排水暗线；人行道：暖灰方砖，近铺面一侧有店铺溢光。
 * 路灯光斑：与 streets/lamp-placement 同一规则（第 k 盏在沿线 φ + k·S、排布代码决定左右），在 shader 里解析计算，
 * 灯下 0.10–0.25、两灯之间 0.015–0.05（主路沿线 ≥ 3:1）；湿路面按 uWetness 变暗并叠加灯的竖向拉长倒影。
 * 侧板、底面、挡土墙（FLAG_SIDE）画成混凝土，挡土墙带排水孔格。
 *
 * 顶点属性见 ribbon.ts（aRoad、aLane、aLamp、aStreet、aPav、aDir）。
 */
import { ShaderMaterial } from 'three';
import { GLSL_HASH } from './common';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms } from './lighting';

/** 路灯在灯下路面的照度（乘反照率 = 出射亮度）：白光 LED / 钠灯。 */
export const POOL_LED = 2.3;
export const POOL_SODIUM = 1.9;
/** 灯头发光亮度（EMISSIVE.lampHead 6–20）：白光 LED / 钠灯。 */
export const HEAD_LED = 12;
export const HEAD_SODIUM = 8;

const vertexShader = /* glsl */ `
attribute vec4 aRoad;
attribute vec2 aLane;
attribute vec4 aLamp;
attribute vec4 aStreet;
attribute vec2 aPav;
attribute vec2 aDir;
varying vec4 vRoad;
varying vec2 vLane;
varying vec4 vLamp;
varying vec4 vStreet;
varying vec2 vPav;
varying vec2 vDir;
varying vec3 vWorld;
void main() {
  vRoad = aRoad;
  vLane = aLane;
  vLamp = aLamp;
  vStreet = aStreet;
  vPav = aPav;
  vDir = aDir;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  // 过路处贴片（FLAG_CROSSING）只比路面高 3 cm：鸟瞰 1–1.5 km 时深度精度（约 6–13 cm）分不开，
  // 在裁剪空间里往相机拉一点（NDC 2e-6，约等于多边形偏移；近处只有毫米级）
  if (mod(floor((aLane.y + 0.5) / 16.0), 2.0) > 0.5) gl_Position.z -= 2e-6 * gl_Position.w;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HASH}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
uniform vec3 uLed;
uniform vec3 uSodium;
uniform vec3 uShop;
uniform float uHeadLed;
uniform float uHeadSodium;
varying vec4 vRoad;
varying vec2 vLane;
varying vec4 vLamp;
varying vec4 vStreet;
varying vec2 vPav;
varying vec2 vDir;
varying vec3 vWorld;

float line(float d, float hw, float aa) {
  return 1.0 - smoothstep(hw - aa, hw + aa, d);
}
bool bitOn(float flags, float b) {
  return mod(floor(flags / b), 2.0) > 0.5;
}
// 排布代码 → 第 k 盏灯在左（+1）/ 右（−1）；对置排布另算对侧
float lampSide(float pattern, float k) {
  float even = 1.0 - mod(k, 2.0);
  if (pattern < 1.5) return 1.0;
  if (pattern < 2.5) return -1.0;
  if (pattern < 3.5) return even > 0.5 ? 1.0 : -1.0;
  if (pattern < 4.5) return even > 0.5 ? -1.0 : 1.0;
  return 1.0;
}
// 一盏灯对路面一点的相对照度（灯正下方 = 1）：cos³ 衰减再收窄，接近截光型路灯的配光
float pool(float da, float dc, float H) {
  float h2 = H * H;
  float q = h2 / (da * da + dc * dc + h2);
  return q * q;
}

void main() {
  float along = vRoad.x;
  float across = vRoad.y;
  float hw = vRoad.z;
  float len = vRoad.w;
  // 顶点上的整数属性插值后会带误差（4.0 → 3.9999998），先取整再做位判断，否则逐像素跳分支（椒盐噪点）
  float lanes = floor(vLane.x + 0.5);
  float flags = floor(vLane.y + 0.5);
  bool oneway = bitOn(flags, 1.0);
  bool ped = bitOn(flags, 2.0);
  bool mainRd = bitOn(flags, 4.0);
  bool sideFace = bitOn(flags, 8.0);
  bool crossing = bitOn(flags, 16.0);
  bool signalX = bitOn(flags, 32.0);
  float aacross = abs(across);

  // ---- 路灯：光斑（照度）与湿路面倒影 ----
  float S = vLamp.x;
  float phase = vLamp.y;
  float pattern = floor(vLamp.z + 0.5);
  float H = vStreet.x;
  float inset = vStreet.y;
  vec3 lampC = mix(uLed, uSodium, vLamp.w);
  float poolK = mix(${POOL_LED.toFixed(3)}, ${POOL_SODIUM.toFixed(3)}, vLamp.w);
  float headE = mix(uHeadLed, uHeadSodium, vLamp.w);
  float E = 0.0;
  float streak = 0.0;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 R = vec3(-V.x, V.y, -V.z);
  vec2 Rh = normalize(R.xz + 1e-5);
  vec3 T = vec3(vDir.x, 0.0, vDir.y);
  vec3 N = vec3(vDir.y, 0.0, -vDir.x);
  if (S > 0.5) {
    float k0 = floor((along - phase) / S);
    for (int j = -1; j <= 2; j++) {
      float k = k0 + float(j);
      float sk = phase + k * S;
      // 路段两端外 12 m 内的灯也算（相邻路段 / 路口的灯照过来），避免分段处光斑突然断开
      if (sk < -12.0 || sk > len + 12.0) continue;
      for (int o = 0; o < 2; o++) {
        float side = lampSide(pattern, k);
        if (o == 1) {
          if (pattern < 4.5) break;
          side = -1.0;
        }
        float da = sk - along;
        float dc = side * inset - across;
        E += pool(da, dc, H);
        // 倒影：反射视线与「指向灯头」的方向在水平方位上很接近、在仰角上可以差很多 → 竖向拉长的亮条
        vec3 L = normalize(T * da + N * dc + vec3(0.0, H, 0.0));
        vec2 Lh = normalize(L.xz + 1e-5);
        float az = 1.0 - dot(Rh, Lh);
        float el = R.y - L.y;
        streak += exp(-az * 2500.0) * exp(-el * el * 18.0);
      }
    }
  }
  E *= poolK;

  // ---- 地区 / 环境 ----
  float warmth = vLamp.w;
  vec3 ambient = cityAmbient(vec3(0.0, 1.0, 0.0), 0.0, warmth) * 0.6;
  vec3 light = ambient + lampC * E;
  float seed = vStreet.w * 97.0;

  vec3 albedo;
  float wetK = 1.0;
  float specK = 0.0;
  vec2 g2 = vec2(along, across);

  if (sideFace) {
    // 混凝土侧板 / 挡土墙：竖向排水孔（1.6 m 格）+ 渗水暗纹
    float y = vWorld.y;
    vec2 cell = vec2(along / 1.6, y / 1.6);
    vec2 f = abs(fract(cell) - 0.5);
    float hole = (1.0 - smoothstep(0.06, 0.1, max(f.x, f.y))) * step(0.5, hash12(floor(cell) + seed));
    float stain = vnoise(vec2(along * 0.4, y * 0.15));
    albedo = vec3(0.20, 0.19, 0.17) * (0.75 + 0.35 * stain) * (1.0 - 0.8 * hole);
    // 挡土墙接近竖直：收到的路灯光要少得多，街面反光则从下往上照
    light = cityAmbient(vec3(0.0, 0.0, 1.0), 2.0, warmth) * 0.7 + lampC * E * 0.35;
  } else if (ped) {
    // 行人街：浅暖灰方砖
    vec2 g = g2 / 0.6;
    vec2 t = abs(fract(g) - 0.5);
    vec2 aaT = fwidth(g);
    float grout = max(1.0 - line(t.x, 0.45, aaT.x), 1.0 - line(t.y, 0.45, aaT.y));
    float tile = hash12(floor(g) + seed);
    albedo = vec3(0.20, 0.17, 0.135) * (0.9 + 0.2 * tile) * (1.0 - 0.3 * grout * (1.0 - smoothstep(0.2, 0.6, aaT.x)));
    wetK = 0.85;
    specK = 0.6;
    light += uShop * 0.35 * vStreet.z * step(0.35, hash12(vec2(floor(along / 6.0), sign(across) + seed)));
  } else if (aacross > hw) {
    // ---- 人行道 + 路缘石 ----
    float pav = across > 0.0 ? vPav.x : vPav.y;
    float outM = aacross - hw;
    float kerb = 1.0 - smoothstep(0.24, 0.3, outM);
    vec2 g = vec2(along, outM) / vec2(0.4, 0.4);
    vec2 t = abs(fract(g) - 0.5);
    vec2 aaT = fwidth(g);
    float far = smoothstep(0.15, 0.5, aaT.x);
    float grout = max(1.0 - line(t.x, 0.46, aaT.x), 1.0 - line(t.y, 0.46, aaT.y)) * (1.0 - far);
    float tile = hash12(floor(g) + seed) * (1.0 - far);
    vec3 paving = vec3(0.20, 0.165, 0.125) * (0.88 + 0.24 * tile) * (1.0 - 0.25 * grout);
    vec3 granite = vec3(0.30, 0.29, 0.27) * (0.9 + 0.2 * vnoise(vec2(along * 3.0, 1.0)));
    albedo = mix(paving, granite, kerb);
    // 铺面溢光：近楼一侧最强；约每 7 m 一个铺位，部分铺位落闸（暗）
    float bay = step(0.3, hash12(vec2(floor(along / 7.0), sign(across) * 3.0 + seed)));
    float toward = smoothstep(0.0, max(pav, 0.5), outM);
    light += uShop * vStreet.z * (0.12 + 0.45 * toward * bay);
    wetK = 0.85;
    specK = 0.5;
  } else {
    // ---- 车行道 ----
    float aa = fwidth(across);
    float px = max(fwidth(along), aa);
    float far = smoothstep(0.12, 0.45, px * 1.7);
    // 沥青颗粒：三个倍频（约 0.05、0.2、0.6 m），像素比颗粒大时各自退成平均值（不闪）
    float f1 = 1.0 - smoothstep(0.02, 0.06, px);
    float f2 = 1.0 - smoothstep(0.08, 0.25, px);
    float grain = 0.5 + (vnoise(g2 * 1.7) - 0.5) * (1.0 - far) + (vnoise(g2 * 5.3 + 3.1) - 0.5) * 0.8 * f2
                + (hash12(floor(g2 * 18.0)) - 0.5) * 0.7 * f1;
    // 修补块：沿路 6 m × 车道宽的格子，约两成格子有一块新沥青（更深、边缘一道接缝）
    float lwP = lanes >= 1.0 ? 2.0 * hw / lanes : 3.2;
    vec2 pc = vec2(along / 6.0, (across + hw) / lwP);
    vec2 pf = fract(pc);
    float pHas = step(hash12(floor(pc) + seed * 0.37), 0.2);
    vec2 pIn = step(vec2(0.18, 0.12), pf) * step(pf, vec2(0.18 + 0.5 * hash12(floor(pc) + 1.7), 0.88));
    float patchR = pHas * pIn.x * pIn.y;
    float patchN = vnoise(g2 * vec2(0.12, 0.35) + seed);
    float patches = smoothstep(0.62, 0.7, patchN) * 0.12 + patchR * 0.22;
    // 每条车道中线一道油渍暗带（车底滴油），两侧轮迹略亮（磨光）
    float lt = fract((across + hw) / lwP) - 0.5;
    float oil = exp(-pow(lt * lwP / 0.35, 2.0)) * (0.7 + 0.3 * vnoise(vec2(along * 0.25, lt)));
    float track = exp(-pow((abs(lt) * lwP - 0.85) / 0.3, 2.0));
    // 沥青近中性灰（整合时调：暖色只来自灯光，避免灯色 × 暖底色叠成橙褐）
    albedo = vec3(0.087, 0.085, 0.081) * (0.8 + 0.4 * grain) * (1.0 - patches) * (1.0 - 0.28 * oil) * (1.0 + 0.1 * track);
    // 灯下的骨料反光：光斑里零星的亮点（近处才有）
    float glint = step(0.994, hash12(floor(g2 * 30.0) + seed)) * f1 * smoothstep(0.4, 0.9, E);
    albedo += vec3(0.25) * glint;
    // 路边排水暗线（路缘内 0.4 m）
    albedo *= 1.0 - 0.35 * (1.0 - smoothstep(0.2, 0.45, hw - aacross));
    // 近路缘的铺面溢光
    light += uShop * vStreet.z * 0.25 * exp(-(hw - aacross) / 2.0);

    float fade = (1.0 - smoothstep(0.06, 0.22, aa)) * smoothstep(3.0, 8.0, min(along, len - along));
    float white = 0.0;
    float yellow = mainRd
      ? max(line(abs(aacross - (hw - 0.3)), 0.06, aa), line(abs(aacross - (hw - 0.52)), 0.06, aa))
      : line(abs(aacross - (hw - 0.3)), 0.06, aa);
    if (lanes >= 2.0) {
      float lw = 2.0 * hw / lanes;
      float t = (across + hw) / lw;
      float kk = floor(t + 0.5);
      float d = abs(t - kk) * lw;
      bool inner = kk >= 1.0 && kk <= lanes - 1.0;
      bool isCentre = !oneway && abs(kk * lw - hw) < 0.3;
      float dash = step(mod(along, 9.0), 4.0);
      if (inner && !isCentre) white = line(d, 0.07, aa) * dash;
    }
    if (!oneway && lanes >= 2.0) {
      float dc = aacross;
      white = max(white, lanes >= 4.0 ? line(abs(dc - 0.17), 0.065, aa) : line(dc, 0.07, aa));
    }
    // 过路处贴片：盖住车道线，画斑马条纹（0.54 m 白 / 0.66 m 间隔，平行于路）或灯控过路处的两道横线 + 路钉
    if (crossing) {
      white = 0.0;
      yellow = 0.0;
      float du = along - vPav.x;
      float aau = max(fwidth(along), 1e-3);
      if (signalX) {
        float bars = line(abs(abs(du) - 1.8), 0.1, aau);
        vec2 sc = vec2((across + hw) / 0.9, abs(du) - 1.55);
        vec2 sd = vec2(abs(fract(sc.x) - 0.5) * 0.9, sc.y);
        float stud = 1.0 - smoothstep(0.06, 0.09, length(sd));
        white = max(bars, stud * 0.8);
      } else {
        float t = abs(fract((across + hw) / 1.2 + 0.25) - 0.5) * 1.2;
        float stripe = line(t, 0.27, aa);
        // 远处条纹小于像素：退成覆盖率平均值，避免摩尔纹
        stripe = mix(stripe, 0.45, smoothstep(0.15, 0.5, aa));
        white = stripe * (1.0 - smoothstep(1.85, 1.95, abs(du)));
      }
      fade = 1.0;
    }
    // 标线磨损
    float wear = 0.8 + 0.2 * mix(vnoise(g2 * vec2(0.35, 1.2)), 0.5, far);
    albedo = mix(albedo, vec3(0.55, 0.55, 0.52) * wear, white * fade);
    albedo = mix(albedo, vec3(0.50, 0.33, 0.035) * wear, yellow * fade);
    specK = 1.0 - 0.7 * max(white, yellow) * fade;
  }

  // 湿路面：底色变暗，灯在路面上拉出竖向倒影（菲涅耳：掠射角更亮）
  float wet = clamp(uWetness, 0.0, 1.0);
  albedo *= 1.0 - 0.4 * wet * wetK;
  float fres = 0.04 + 0.5 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
  vec3 refl = lampC * headE * streak * fres * wet * specK * 0.35;

  vec3 col = applyHaze(albedo * light, refl, vWorld);

  ${GLSL_FINISH}
}
`;

export function createRoadMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...sharedUniforms(),
      uLed: { value: lightColour('ledWhite') },
      uSodium: { value: lightColour('sodium') },
      uShop: { value: lightColour('shopWarm') },
      uHeadLed: { value: HEAD_LED },
      uHeadSodium: { value: HEAD_SODIUM },
    },
    vertexShader,
    fragmentShader,
  });
}

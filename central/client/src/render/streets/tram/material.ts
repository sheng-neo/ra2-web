/**
 * 电车车身材质（R2 TRAMS T1 / T3，R3 LIVERIES 换成真实涂装）：光照契约 v1（线性 HDR、cityAmbient、applyHaze、GLSL_FINISH）。
 *
 * 片元着色器按局部坐标（vLocal：x 向前、y 离轨顶、z 向右）画：
 * - 窗与门（圆角矩形 SDF + fwidth 抗锯齿）：上层每侧 8 扇（1.0 m 一格、上部 25 % 有气窗横档）；下层两侧相同（照片 01 / 03：
 *   两侧都有门）：车尾小方窗 · 入口门 · 5 扇带顶窗的窗 · 出口门 · 司机位窄窗；两端每层 3 扇圆角窗（上 0.76–0.94 H、下 0.32–0.53 H）。
 * - 车厢内部（interior mapping，无额外几何）：天花灯管、对面窗、座椅背、乘客剪影；上层冷白较亮，下层偏暖较暗（照片 02）。
 * - 涂装（livery.ts）：标准深青绿（窗柱同色、车顶 #374c50）或虚构广告车身（6 种几何插画图案，窗柱、檐口、车顶两侧都包，
 *   可带一个白名单行业通称；约三成下层两扇窗贴网点透视贴）。裙板、防撞杠、车顶面不包。
 * - 目的地牌：两端两层之间正中，1.0 × 0.34 m，黑底琥珀 LED 点阵，一行字，中文 / 英文每 4 s 轮换（字取自共用图集）。
 * - 车队编号：两端顶角（字高 0.085 m）与防撞杠右侧（0.14 m），白色窄身数字；只在近处画（HIGH 60 m、LOW 30 m）。
 * - 集电杆：顶点在杆坐标里，按实例的杆角（iState.x，由接触线高度算出）绕杆座转；至少约 0.6 像素粗。
 * 实例属性：iCol0/1/2（线性三色）、iMeta（涂装种类、图案、目的地、种子）、iMeta2（车队编号、广告字、透视贴）、
 * iState（杆仰角、路灯照度、杆偏角、钠灯比例）。
 */
import { ShaderMaterial, Vector3, type Texture } from 'three';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms } from '../../materials/lighting';
import { POLE_LEN_M, POLE_PIVOT } from './body';
import { DEST_SWAP_S } from './atlas';
import { DEST_LED, STANDARD, WRAP_ROOF } from './livery';
import { liveryAtlasGlsl } from '../liveries/atlas';
import { linearRGB } from '../prop-geometry';

const v3 = (c: readonly number[]) => `vec3(${c.map((x) => x.toFixed(4)).join(', ')})`;

const VERT = /* glsl */ `
${GLSL_SHARED_PARS}
attribute vec3 aAlb;
attribute vec3 aZWE;
attribute vec3 iCol0;
attribute vec3 iCol1;
attribute vec3 iCol2;
attribute vec4 iMeta;
attribute vec4 iMeta2;
attribute vec4 iState;
uniform vec3 uPivot;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCamL;
varying vec3 vAlb;
varying vec3 vEm;
varying vec3 vC0;
varying vec3 vC1;
varying vec3 vC2;
varying vec4 vMeta;
varying vec4 vMeta2;
varying vec4 vState;
varying float vZone;
varying float vWrap;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 p = position;
  vec3 n = normal;
  float aZone = aZWE.x;
  mat3 R0 = mat3(m);
  if (aZone > 6.5) {
    // 拉绳：车尾车顶的挂钩 → 杆头（随杆俯仰、偏转），中段下垂；朝相机展开、至少约 0.5 像素宽
    float a = 3.14159265 - iState.x;
    float cy = cos(iState.z);
    float sy = sin(iState.z);
    vec3 d0 = vec3(cos(a), sin(a), 0.0) * ${(POLE_LEN_M - 0.15).toFixed(2)};
    vec3 tip = uPivot + vec3(d0.x * cy + d0.z * sy, d0.y, -d0.x * sy + d0.z * cy);
    vec3 anchor = vec3(-4.15, 4.47, 0.0);
    float t = p.x;
    vec3 q = mix(anchor, tip, t);
    q.y -= sin(t * 3.14159265) * 0.18;
    vec3 camL = transpose(R0) * (cameraPosition - m[3].xyz);
    vec3 dirL = normalize(tip - anchor);
    vec3 viewL = normalize(camL - q);
    vec3 sideL = cross(dirL, viewL);
    sideL = length(sideL) > 1e-4 ? normalize(sideL) : vec3(0.0, 0.0, 1.0);
    vec4 vv = viewMatrix * m * vec4(q, 1.0);
    float pxM = max(-vv.z, 0.1) / (projectionMatrix[1][1] * 0.5 * uViewportPx.y);
    p = q + sideL * p.y * max(0.008, 0.5 * pxM);
    n = viewL;
  } else if (aZone > 5.5) {
    // 集电杆：杆坐标 → 绕杆座先俯仰（z 轴，π − 仰角：杆头向后上方）再偏转（y 轴，偏角），杆头搭在接触线上；按像素加粗
    float a = 3.14159265 - iState.x;
    float c = cos(a);
    float s = sin(a);
    float cy = cos(iState.z);
    float sy = sin(iState.z);
    vec3 v0 = vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
    vec3 q = uPivot + vec3(v0.x * cy + v0.z * sy, v0.y, -v0.x * sy + v0.z * cy);
    vec4 vv = viewMatrix * m * vec4(q, 1.0);
    float pxM = max(-vv.z, 0.1) / (projectionMatrix[1][1] * 0.5 * uViewportPx.y);
    float gl = length(p.yz);
    vec3 grow = gl > 1e-4 ? vec3(0.0, p.yz / gl) : vec3(0.0);
    p += grow * max(0.0, 0.6 * pxM - 0.03);
    v0 = vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
    p = uPivot + vec3(v0.x * cy + v0.z * sy, v0.y, -v0.x * sy + v0.z * cy);
    vec3 n0 = vec3(c * n.x - s * n.y, s * n.x + c * n.y, n.z);
    n = vec3(n0.x * cy + n0.z * sy, n0.y, -n0.x * sy + n0.z * cy);
  }
  vLocal = p;
  vec4 world = m * vec4(p, 1.0);
  vWorld = world.xyz;
  mat3 R = mat3(m);
  vN = normalize(R * n);
  // 相机在车身局部坐标里的位置（实例矩阵 = 旋转 + 平移）
  vCamL = transpose(R) * (cameraPosition - m[3].xyz);
  vAlb = aAlb;
  vEm = aAlb * aZWE.z;
  vC0 = iCol0;
  vC1 = iCol1;
  vC2 = iCol2;
  vMeta = iMeta;
  vMeta2 = iMeta2;
  vState = iState;
  vZone = aZone;
  vWrap = aZWE.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
${liveryAtlasGlsl()}
uniform vec3 uTube;
uniform vec3 uTubeLow;
uniform float uTextFar;
uniform vec3 uLed;
uniform vec3 uDestLed;
uniform vec3 uSodium;
uniform float uWarmth;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCamL;
varying vec3 vAlb;
varying vec3 vEm;
varying vec3 vC0;
varying vec3 vC1;
varying vec3 vC2;
varying vec4 vMeta;
varying vec4 vMeta2;
varying vec4 vState;
varying float vZone;
varying float vWrap;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float hitBox(vec3 ro, vec3 inv, vec3 bmin, vec3 bmax) {
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 tn = min(t0, t1);
  vec3 tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z);
  float b = min(min(tf.x, tf.y), tf.z);
  return (a <= b && b > 0.0) ? max(a, 0.0) : 1e9;
}
float hitSphere(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float h = b * b - (dot(oc, oc) - r * r);
  if (h < 0.0) return 1e9;
  float t = -b - sqrt(h);
  return t > 0.0 ? t : 1e9;
}

// ---- 车厢内部（interior mapping）：p = 玻璃上的点，d = 视线方向（朝车内），返回出射亮度（线性）----
vec3 interior(vec3 p, vec3 d, bool upper, float seed, bool detail) {
  // R3：上层冷白、较亮（#9094a4 ≈ 8000 K），下层偏暖、较暗（#a69c90 ≈ 5400 K）——照片 02
  vec3 T = upper ? uTube : uTubeLow;
  float y0 = upper ? 2.58 : 0.62;
  float y1 = upper ? 4.26 : 2.47;
  vec3 bmin = vec3(-4.2, y0, -1.1);
  vec3 bmax = vec3(4.2, y1, 1.1);
  vec3 dd = d + vec3(equal(d, vec3(0.0))) * 1e-5;
  vec3 inv = 1.0 / dd;
  vec3 tA = (bmin - p) * inv;
  vec3 tB = (bmax - p) * inv;
  vec3 tF = max(tA, tB);
  float tExit = max(min(min(tF.x, tF.y), tF.z), 0.0);
  vec3 h = p + d * tExit;
  vec3 col;
  // 天花板面 < 1（整窗不 bloom），只有灯管 ≈ 1.4
  float ceilY = upper ? 0.9 : 0.8;
  if (tF.y <= tF.x && tF.y <= tF.z) {
    if (d.y > 0.0) {
      // 天花：两条纵向灯管（亮）+ 板面；传统车上层是柚木天花、横向木肋
      float aaT = max(fwidth(h.z), 1e-3);
      float tube = 1.0 - smoothstep(0.035, 0.035 + aaT, abs(abs(h.z) - 0.45));
      {
        // 板缝（横向每 0.6 m）、灯管外壳（灯管两侧暗边）、两条纵向扶手（暗）
        float seam = 1.0 - smoothstep(0.0, 0.012 + aaT, abs(fract(h.x / 0.6) - 0.5) * 0.6 - 0.288);
        float housing = 1.0 - smoothstep(0.07, 0.08 + aaT, abs(abs(h.z) - 0.45));
        float rail = 1.0 - smoothstep(0.012, 0.012 + aaT, abs(abs(h.z) - 0.18));
        col = T * (ceilY * (1.0 - 0.25 * seam) * (1.0 - 0.35 * housing * (1.0 - tube)) + 0.55 * tube) * (1.0 - 0.85 * rail);
      }
    } else {
      col = vec3(0.045, 0.043, 0.04);
    }
  } else if (tF.z <= tF.x) {
    // 对面车厢壁：窗（看出去是暗街景，偶有远处灯光）、窗柱、窗下墙板
    float wy0 = upper ? 3.45 : 1.62;
    float wy1 = upper ? 4.16 : 2.38;
    if (h.y > wy0 && h.y < wy1) {
      // 对面窗：看出去是暗街景（偶有远处灯光），窗柱在每格两边（离格中心 > 半格 − 6 cm）
      float pitchW = upper ? 1.0 : 1.14;
      float u = abs(fract((h.x + 4.0) / pitchW) - 0.5) * pitchW;
      float post = smoothstep(pitchW * 0.5 - 0.07, pitchW * 0.5 - 0.04, u);
      // 街景：下暗上略亮（对面楼的灯光），没有大块色斑
      vec3 outside = vec3(0.05, 0.055, 0.07) * (0.75 + 0.5 * hash12(floor(h.xy * vec2(1.3, 3.0)) + seed * 17.0)) * (0.8 + 0.5 * smoothstep(wy0, wy1, h.y));
      col = mix(outside, T * 0.3, post);
    } else if (h.y >= wy1) {
      col = T * 0.6;
    } else {
      // 窗下墙板 / 座椅靠背：暗带
      col = T * 0.13;
    }
  } else {
    // 两端：上层是端窗（暗），下层是司机位隔板
    col = upper ? vec3(0.06, 0.065, 0.075) + T * 0.12 : T * 0.3;
  }
  if (detail) {
    // 座椅与乘客：沿车长按排，从入射处那一排起最多看 4 排
    float pitch = upper ? 0.8 : 0.62;
    float dir = d.x >= 0.0 ? 1.0 : -1.0;
    float k0 = floor((p.x + 4.0) / pitch);
    float kExit = floor((h.x + 4.0) / pitch);
    float tBest = tExit;
    vec3 hitCol = vec3(-1.0);
    float topLight = 0.0;
    for (int i = 0; i < 4; i++) {
      float k = k0 + dir * float(i);
      if ((k - kExit) * dir > 0.5) break;
      float xc = -4.0 + (k + 0.5) * pitch;
      if (abs(xc) > 3.75) continue;
      // 不锈钢立柱（每两排一根，过道边）：竖直圆柱与视线在水平面上求交
      if (mod(k, 2.0) < 0.5) {
        vec2 oc = p.xz - vec2(xc + 0.33, (mod(k, 4.0) < 1.5 ? 0.27 : -0.27));
        float a2 = dot(d.xz, d.xz);
        float b2 = dot(oc, d.xz);
        float h2 = b2 * b2 - a2 * (dot(oc, oc) - 0.0009);
        if (h2 > 0.0 && a2 > 1e-6) {
          float tc = (-b2 - sqrt(h2)) / a2;
          float yc = p.y + d.y * tc;
          if (tc > 0.0 && tc < tBest && yc > y0 && yc < y1) {
            tBest = tc;
            hitCol = vec3(0.18, 0.186, 0.195);
            topLight = 0.12;
          }
        }
      }
      for (int j = 0; j < 4; j++) {
        float fj = float(j);
        float occ = hash12(vec2(k * 3.1 + fj * 17.7, seed * 101.0));
        float zs;
        float headY;
        float t;
        if (upper) {
          // 横排座（面向车头）：每排过道两侧各两座；座椅背是暗色横条
          zs = (fj < 2.0 ? -1.0 : 1.0) * (fj == 0.0 || fj == 3.0 ? 0.82 : 0.42);
          headY = y0 + 1.18;
          if (j == 0 || j == 2) {
            float side = j == 0 ? -1.0 : 1.0;
            vec3 b0 = vec3(xc - 0.32, y0 + 0.38, side > 0.0 ? 0.22 : -1.06);
            vec3 b1 = vec3(xc - 0.25, y0 + 0.93, side > 0.0 ? 1.06 : -0.22);
            t = hitBox(p, inv, b0, b1);
            if (t < tBest) {
              tBest = t;
              hitCol = vec3(0.105, 0.111, 0.12);
              topLight = smoothstep(y0 + 0.86, y0 + 0.93, p.y + d.y * t) * 0.05;
            }
          }
        } else {
          // 下层：两侧长凳上坐着的人（背靠车壁）与中间站着的人
          if (j == 3) continue;
          zs = j == 0 ? -0.8 : (j == 1 ? 0.8 : (hash12(vec2(k, seed)) - 0.5) * 0.5);
          headY = j == 2 ? y0 + 1.62 : y0 + 1.27;
          occ = j == 2 ? occ + 0.35 : occ;
        }
        if (occ > 0.55) continue;
        float shoulder = headY - 0.2;
        float hipY = j == 2 && !upper ? y0 + 0.85 : y0 + 0.45;
        // 面朝：上层向车头（+x）；下层长凳上的人面向过道，站着的人随机朝前 / 后
        vec3 face = upper ? vec3(1.0, 0.0, 0.0) : (j == 0 ? vec3(0.0, 0.0, 1.0) : (j == 1 ? vec3(0.0, 0.0, -1.0) : vec3(hash12(vec2(k, seed * 7.0)) < 0.5 ? 1.0 : -1.0, 0.0, 0.0)));
        vec3 hc = vec3(xc + 0.04, headY, zs);
        t = hitSphere(p, d, hc, 0.105);
        if (t < tBest) {
          tBest = t;
          vec3 hn = normalize(p + d * t - hc);
          // 肤色（下部 70 %）+ 头发（顶部、后脑；发长按人随机）；天花灯管从上照下
          float hr = hash12(vec2(k * 5.1 + fj, seed * 29.0));
          vec3 skin = mix(vec3(0.46, 0.32, 0.24), vec3(0.6, 0.44, 0.34), hr);
          vec3 hair = hr < 0.15 ? vec3(0.1, 0.09, 0.085) : vec3(0.02, 0.018, 0.016);
          // 头发：头顶（发际线随人）、后脑；脸朝向的那一面是皮肤
          float hairM = max(step(0.5 - 0.2 * hr, hn.y), step(dot(hn, face), -0.4 + 0.25 * hr));
          hitCol = mix(skin, hair, hairM) * (0.7 + 0.5 * max(hn.y, 0.0));
          topLight = 0.0;
        }
        // 身体：肩宽 0.44 m（侧坐的人肩膀沿车长方向）
        vec2 hb2 = abs(face.x) > 0.5 ? vec2(0.15, 0.22) : vec2(0.22, 0.14);
        t = hitBox(p, inv, vec3(xc + 0.02 - hb2.x, hipY, zs - hb2.y), vec3(xc + 0.02 + hb2.x, shoulder, zs + hb2.y));
        if (t < tBest) {
          tBest = t;
          float shirt = hash12(vec2(k * 7.3 + fj, seed * 53.0));
          float tint = hash12(vec2(k * 3.7 + fj, seed * 11.0));
          vec3 cloth = shirt < 0.45 ? vec3(0.055, 0.055, 0.06) : (shirt < 0.85 ? mix(vec3(0.2, 0.15, 0.11), vec3(0.11, 0.15, 0.22), tint) : vec3(0.55, 0.54, 0.52));
          float hy = p.y + d.y * t;
          // 肩头（顶面）受光亮一些
          hitCol = cloth * (0.75 + 0.5 * smoothstep(shoulder - 0.04, shoulder, hy));
          topLight = 0.0;
        }
      }
    }
    if (!upper) {
      // 下层长凳（两侧）
      float t = hitBox(p, inv, vec3(-3.7, y0 + 0.36, 0.72), vec3(3.7, y0 + 0.47, 1.09));
      t = min(t, hitBox(p, inv, vec3(-3.7, y0 + 0.36, -1.09), vec3(3.7, y0 + 0.47, -0.72)));
      if (t < tBest) {
        tBest = t;
        hitCol = vec3(0.12, 0.105, 0.09);
        topLight = 0.08;
      }
    }
    if (hitCol.x >= 0.0) col = hitCol * T + T * topLight;
  }
  return col;
}

// ---- 窗、门开口（R3：两侧都有两道门，照片 01 / 03）：返回到最近开口的 SDF（负 = 在开口内），door = 1 表示门，c / hb = 开口中心与半尺寸 ----
float openings(float zone, float a, float y, out float door, out vec2 c, out vec2 hb, out float idx) {
  door = 0.0;
  idx = -1.0;
  if (zone > 2.5) {
    // 两端：每层三扇圆角窗（中间宽、两边窄；横坐标 = 局部 z）；上层 0.76–0.94 H，下层 0.32–0.53 H
    bool up = y > 2.9;
    float cy = up ? 3.74 : 1.87;
    float hy = up ? 0.40 : 0.46;
    float k = clamp(floor((a + 0.44) / 0.88), -1.0, 1.0);
    c = vec2(k * 0.80, cy);
    hb = vec2(k == 0.0 ? 0.41 : 0.31, hy);
    return sdBox(vec2(a, y) - c, hb, 0.09);
  }
  if (y > 2.9) {
    // 上层每侧 8 扇
    float k = clamp(floor(a + 4.0), 0.0, 7.0);
    c = vec2(-4.0 + k + 0.5, 3.805);
    hb = vec2(0.45, 0.355);
    idx = k;
    return sdBox(vec2(a, y) - c, hb, 0.05);
  }
  // 下层（两侧相同，车尾 → 车头）：车尾小方窗、入口门、5 扇窗（带顶窗）、出口门、车头司机位窄窗
  vec4 o[9];
  o[0] = vec4(-3.62, 2.04, 0.22, 0.24);
  o[1] = vec4(-2.95, 1.53, 0.42, 0.83);
  o[2] = vec4(-1.96, 2.0, 0.43, 0.38);
  o[3] = vec4(-0.98, 2.0, 0.43, 0.38);
  o[4] = vec4(0.0, 2.0, 0.43, 0.38);
  o[5] = vec4(0.98, 2.0, 0.43, 0.38);
  o[6] = vec4(1.96, 2.0, 0.43, 0.38);
  o[7] = vec4(2.95, 1.53, 0.42, 0.83);
  o[8] = vec4(3.66, 2.0, 0.24, 0.38);
  float best = 1e9;
  for (int i = 0; i < 9; i++) {
    float dd = sdBox(vec2(a, y) - o[i].xy, o[i].zw, 0.05);
    if (dd < best) {
      best = dd;
      c = o[i].xy;
      hb = o[i].zw;
      door = (i == 1 || i == 7) ? 1.0 : 0.0;
      idx = float(i);
    }
  }
  return best;
}

// ---- 虚构广告车身图案（u = 绕车身展开坐标 m，y = 离轨顶 m；p = 侧面局部 (x, y)，side = 是否侧面）----
vec3 wrapLivery(float u, float y, vec2 p, bool side) {
  float pat = floor(vMeta.y + 0.5);
  float sd = vMeta.w;
  float aa = max(fwidth(u), 1e-3);
  if (pat < 0.5) {
    // 大斜色块（宽带）+ 细边线
    float t = fract((u + y * 0.9 + sd * 10.0) / 5.2);
    vec3 c = mix(vC0, vC1, smoothstep(0.0, aa / 5.2, t) * (1.0 - smoothstep(0.42, 0.42 + aa / 5.2, t)));
    return mix(c, vC2, smoothstep(0.46, 0.46 + aa / 5.2, t) * (1.0 - smoothstep(0.52, 0.52 + aa / 5.2, t)));
  }
  if (pat < 1.5) {
    // 大圆点（每 2.4 m 一格，半径随机），部分带圈
    vec2 g = vec2(u, y) / 2.4 + vec2(sd * 5.0, 0.0);
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float r = 0.2 + 0.24 * hash12(cell + sd * 31.0);
    float dc = length(f) - r;
    float ring = abs(dc + 0.07) - 0.03;
    vec3 c = mix(vC0, vC1, 1.0 - smoothstep(-aa, aa, dc * 2.4));
    return mix(c, vC2, (1.0 - smoothstep(-aa, aa, ring * 2.4)) * step(0.5, hash12(cell + 3.7)));
  }
  if (pat < 2.5) {
    // 插画：上下渐变的「天空」、地平线色带、一个大圆（太阳 / 星球）
    vec3 c = mix(vC1, vC0, smoothstep(0.8, 4.2, y));
    float hz = abs(y - (1.45 + 0.12 * sin(u * 0.9 + sd * 7.0))) - 0.12;
    c = mix(c, vC2, 1.0 - smoothstep(-0.01, 0.01, hz));
    float disc = length(vec2(mod(u + sd * 9.0, 10.3) - 6.0, y - 2.9)) - 0.95;
    return mix(c, vC2, 1.0 - smoothstep(-aa, aa, disc));
  }
  if (pat < 3.5) {
    // 几何拼成的吉祥物（侧面正中一张大圆脸：两只眼、一道笑弧）+ 底色与腰带
    vec3 c = vC0;
    c = mix(c, vC1, step(abs(y - 1.1), 0.25));
    if (side) {
      vec2 q = p - vec2(-0.3 + (sd - 0.5) * 1.6, 2.75);
      float face = length(q * vec2(1.0, 1.12)) - 1.05;
      c = mix(c, vC2, 1.0 - smoothstep(-0.01, 0.01, face));
      vec2 e = vec2(abs(q.x) - 0.36, q.y - 0.22);
      float eye = length(e) - 0.15;
      c = mix(c, vec3(0.04), (1.0 - smoothstep(-0.01, 0.01, eye)) * step(face, 0.0));
      float pupil = length(e - vec2(0.04, 0.03)) - 0.05;
      c = mix(c, vec3(0.9), (1.0 - smoothstep(-0.01, 0.01, pupil)) * step(face, 0.0));
      float smile = abs(length(q - vec2(0.0, 0.2)) - 0.55) - 0.045;
      c = mix(c, vC1, (1.0 - smoothstep(-0.01, 0.01, smile)) * step(q.y, -0.05) * step(face, 0.0));
    }
    return c;
  }
  if (pat < 4.5) {
    // 渐变 + 波浪条
    float g = 0.5 + 0.5 * sin(u * 0.45 + sd * 6.28);
    vec3 c = mix(vC0, vC1, smoothstep(0.2, 0.8, g) * smoothstep(0.4, 3.8, y));
    float wave = abs(y - (2.9 + 0.32 * sin(u * 0.7 + sd * 9.0))) - 0.09;
    return mix(c, vC2, 1.0 - smoothstep(-0.01, 0.01, wave));
  }
  // 对角分色
  float edge = y - (0.9 + mod(u + sd * 7.0, 10.5) * 0.33);
  vec3 c = mix(vC1, vC0, smoothstep(-0.01, 0.01, edge));
  return mix(c, vC2, 1.0 - smoothstep(0.05, 0.08, abs(edge)));
}

float lumaT(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float zone = floor(vZone + 0.5);
  bool standard = floor(vMeta.x + 0.5) == 1.0;
  float camDist = length(vLocal - vCamL);
  // 字（车队编号、目的地字、广告字）只在近处画（HIGH 60 m、LOW 30 m）；更远只剩色块
  bool nearText = camDist < uTextFar;
  vec3 albedo = vAlb;
  vec3 emit = vEm;
  float glass = 0.0;
  float spec = 0.35;
  vec3 inside = vec3(0.0);
  if (zone == 5.0) {
    // 车顶：标准车 #374c50；广告车车顶两侧（第一圈坡面）也包，顶面不包
    albedo = standard ? vC1 : (vLocal.y < 4.49 ? wrapLivery(vWrap, vLocal.y, vLocal.xy, false) : WRAP_ROOF_C);
  } else if (zone == 6.0) {
    albedo = vec3(0.03);
  } else if (zone == 7.0) {
    albedo = vAlb;
  } else if (zone > 0.5) {
    float y = vLocal.y;
    bool endZ = zone > 2.5;
    float a = endZ ? vLocal.z : vLocal.x;
    // 观者右手方向的坐标（字从左到右读）：车头面 −z、车尾面 +z、右侧面 +x、左侧面 −x
    float px = zone > 3.5 ? vLocal.z : (zone > 2.5 ? -vLocal.z : (zone > 1.5 ? vLocal.x : -vLocal.x));
    vec3 body = standard ? vC0 : wrapLivery(vWrap, y, vLocal.xy, !endZ);
    // 裙板与两端防撞杠不包、不随涂装（黑 #2c2b30）
    if (y < 0.65) body = endZ ? BUMPER_C : SKIRT_C;
    // 广告字（行业通称，白名单）：两侧两层之间的广告带，观者右半边
    if (!standard && !endZ && nearText && vMeta2.y > -0.5 && y > 2.45 && y < 3.35) {
      float m = livTex(livCell(LIV_ADWORDS, LIV_ADWORDS_COLS, vMeta2.y), vec2((px - 0.95) / 1.1, (3.25 - y) / 0.64));
      vec3 ink = lumaT(vC0) > 0.25 ? vec3(0.02) : vec3(0.82);
      body = mix(body, ink, m);
    }
    albedo = body;
    float door;
    vec2 c;
    vec2 hb;
    float widx;
    float d = openings(zone, a, y, door, c, hb, widx);
    float aa = max(fwidth(d), 1e-4);
    bool inBand = y > 0.65 && y < 4.2;
    if (inBand && d < aa) {
      float inGlass = 1.0 - smoothstep(-aa, aa, d);
      if (door > 0.5) {
        // 门：两扇折门，每扇一块长玻璃（下部实板），门框深灰
        vec2 q = vec2(a, y) - c;
        float lx = abs(q.x);
        float leafGlass = step(0.05, lx) * step(lx, hb.x - 0.05) * step(1.0, y) * step(y, 2.3);
        inGlass *= leafGlass;
        albedo = mix(albedo, DOOR_C, step(d, 0.0) * (1.0 - leafGlass));
      }
      // 车头挡风窗上一支雨刮（P1，照片 01–03）
      if (endZ && y < 2.4 && abs(a) < 0.42) {
        vec2 wa = vec2(-0.22, 1.47);
        vec2 wb = vec2(0.12, 2.02);
        vec2 pw = vec2(a, y) - wa;
        vec2 bw = wb - wa;
        float dw = length(pw - bw * clamp(dot(pw, bw) / dot(bw, bw), 0.0, 1.0));
        inGlass *= smoothstep(0.008, 0.008 + aa * 2.0, dw);
      }
      // 上层气窗横档（窗高上部 25 %）；下层窗的顶窗横档
      if (y > 3.4) inGlass *= smoothstep(0.012, 0.012 + aa * 4.0, abs(y - 3.99));
      else if (!endZ && door < 0.5 && widx > 1.5 && widx < 6.5) inGlass *= smoothstep(0.012, 0.012 + aa * 4.0, abs(y - 2.2));
      // 网点单向透视贴（P1）：广告车下层第 2、3 扇窗盖一层广告（远看约一半透）
      bool film = !standard && !endZ && vMeta2.z > 0.5 && y < 2.45 && widx > 2.5 && widx < 4.5;
      if (inGlass > 0.001) {
        bool upper = y > 2.9;
        vec3 dir = normalize(vLocal - vCamL);
        vec3 ins = interior(vLocal, dir, upper, vMeta.w, camDist < 70.0);
        float cover = 0.0;
        if (film) {
          vec2 dp = fract(vec2(a, y) / 0.012) - 0.5;
          float fw = fwidth(a / 0.012);
          cover = mix(1.0 - smoothstep(0.28, 0.36, length(dp)), 0.55, smoothstep(0.25, 0.7, fw));
        }
        inside = ins * inGlass * (1.0 - cover);
        glass = inGlass * (1.0 - cover);
      }
    }
    if (endZ) {
      // 目的地牌（两层之间正中，0.57–0.65 H，1.0 × 0.34 m）：黑底琥珀 LED，一行字，中文 / 英文轮换
      vec2 dq = vec2(px, y) - vec2(0.0, 2.68);
      float db = sdBox(dq, vec2(0.5, 0.17), 0.03);
      if (db < 0.0) {
        albedo = vec3(0.008);
        spec = 0.6;
        vec2 uv = vec2((px + 0.47) / 0.94, (2.83 - y) / 0.30);
        if (nearText) {
          float lang = mod(floor(uTime / DEST_SWAP + vMeta.w * 2.0), 2.0);
          vec4 r = livCell(LIV_TRAMDEST, LIV_TRAMDEST_COLS, vMeta.z * 2.0 + lang);
          // LED 点阵：近处看得到点（约 1 cm），远处退成平均
          vec2 grid = vec2(96.0, 30.0);
          vec2 cellUv = (floor(uv * grid) + 0.5) / grid;
          float m = livTex(r, cellUv);
          float fw = fwidth(uv.x * grid.x);
          float dotK = mix(1.0 - smoothstep(0.3, 0.45, length(fract(uv * grid) - 0.5)), 0.6, smoothstep(0.3, 0.8, fw));
          emit += uDestLed * 2.1 * smoothstep(0.25, 0.6, m) * dotK + LEDBG_C * 0.3;
        } else {
          emit += uDestLed * 0.45 * step(0.08, uv.y) * step(uv.y, 0.92) * step(0.1, uv.x) * step(uv.x, 0.9);
        }
      }
      // 车队编号（白色窄身数字）：两端顶角贴着转角（≈ 0.97 H，字高 0.095 m，侧面斜看也看得到）与防撞杠右侧（字高 0.14 m）
      if (nearText) {
        float fleet = vMeta2.x;
        float m = 0.0;
        if (y > 4.2) m = livNumber(vec2(px, y), vec2(-0.92, 4.29), 0.095, fleet) + livNumber(vec2(px, y), vec2(0.92, 4.29), 0.095, fleet);
        else if (y < 0.64 && y > 0.36) m = livNumber(vec2(px, y), vec2(0.62, 0.5), 0.14, fleet);
        albedo = mix(albedo, vec3(0.78), clamp(m, 0.0, 1.0));
      }
    }
  }
  // 照明：城市环境光 + 车身所在位置的路灯照度（CPU 每帧按附近路灯算，iState.y）
  vec3 lampC = mix(uLed, uSodium, vState.w);
  // 复审修正：车身按「相机白平衡」照（neutralLight），真实涂装的深青绿不被暖光带偏
  vec3 irr = neutralLight(cityAmbient(n, vLocal.y, uWarmth) + lampC * vState.y * mix(0.45, 0.8, max(n.y, 0.0)), 0.6);
  float fres = pow(1.0 - clamp(abs(dot(n, V)), 0.0, 1.0), 4.0);
  // 光面漆：路灯在车身上的一点高光（不反射天空）
  vec3 R = reflect(-V, n);
  float lampSpec = pow(max(R.y, 0.0), 16.0) * vState.y * (standard ? 0.08 : 0.05) * (1.0 - glass);
  vec3 surface = albedo * irr * (1.0 - glass) + uHazeColor * fres * mix(spec * 0.5, 0.9, glass) * max(n.y + 0.4, 0.2) + lampC * lampSpec;
  // 玻璃：车内光透过（菲涅耳反射多时透得少）
  emit += inside * (1.0 - 0.6 * fres);
  vec3 col = applyHaze(surface, emit, vWorld);
  ${GLSL_FINISH}
}
`;

export function createTramMaterial(atlas: Texture | null, textFarM = 60): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...sharedUniforms(),
      uLiv: { value: atlas },
      uTextFar: { value: textFarM },
      uPivot: { value: new Vector3(...POLE_PIVOT) },
      // 上层冷白（照片 02 #9094a4，≈ 8000 K），下层偏暖（#a69c90，≈ 5400 K）且暗一些（vehicleCabin 0.4–1.0）
      uTube: { value: lightColour('#dde4f6') },
      uTubeLow: { value: lightColour('#f4e7d4').multiplyScalar(0.78) },
      // 复审修正：路灯（车身受光）用白光 LED；琥珀色只给目的地牌（原来车身被琥珀色照着，深青绿成了橄榄绿）
      uLed: { value: lightColour('ledWhite') },
      uDestLed: { value: lightColour(DEST_LED.fg) },
      uSodium: { value: lightColour('sodium') },
      uWarmth: { value: 0.4 },
    },
    defines: {
      WRAP_ROOF_C: v3(linearRGB(WRAP_ROOF)),
      BUMPER_C: v3(linearRGB(STANDARD.bumper)),
      SKIRT_C: v3(linearRGB('#26292a')),
      DOOR_C: v3(linearRGB('#2e3134')),
      LEDBG_C: v3(linearRGB(DEST_LED.bg)),
      DEST_SWAP: DEST_SWAP_S.toFixed(1),
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

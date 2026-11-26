/**
 * 电车车身材质（R2 TRAMS T1 / T3 / T4 / T5）：光照契约 v1（线性 HDR、cityAmbient、applyHaze、GLSL_FINISH）。
 *
 * 片元着色器按局部坐标（vLocal：x 向前、y 离轨顶、z 向右）画：
 * - 窗与门（圆角矩形 SDF + fwidth 抗锯齿）：上层每侧 8 扇（1.0 m 一格、窗柱 0.1 m、上部 25 % 有气窗横档）；
 *   左侧（车门侧）下层：短端窗 · 出口门 · 4 扇窗 · 入口门 · 短端窗；右侧下层 7 扇窗、无门；两端每层 3 扇圆角窗。
 * - 车厢内部（interior mapping，无额外几何）：视线穿过玻璃后与每层车厢的盒子求交：天花（冷白灯管最亮）、
 *   地板、对面窗（看出去是暗的街景）与窗柱、端墙；再与座椅背、乘客（头 = 球、身体 = 盒）求最近交点，
 *   座椅背与乘客是暗剪影。上层冷白（tubeCool）略亮于下层；传统涂装车上层是暖色柚木天花（照片 05）。
 * - 涂装：抽象广告车身（5 种图案：斜条、大圆点、色块、渐变波浪、对角分色）/ 传统深绿 + 米色带 / 白车身 + 色带；
 *   窗柱随车身色或深灰。车身不写字、无标志、无编号。
 * - 目的地牌：两端两层之间，1.4 × 0.46 m，地名图集（只含允许地名）；橙色 LED 点阵或红底黄字，亮度 1.6–2.2。
 * - 集电杆：顶点在杆坐标里，按实例的杆角（iState.x，由接触线高度算出）绕杆座转；至少约 0.6 像素粗。
 * 实例属性：iCol0/1/2（线性三色）、iMeta（涂装种类、图案、目的地格、种子）、iState（杆仰角、路灯照度、杆偏角、钠灯比例）。
 */
import { ShaderMaterial, Vector3, type Texture } from 'three';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms } from '../../materials/lighting';
import { POLE_LEN_M, POLE_PIVOT } from './body';
import { DEST_ROWS } from './atlas';
import { DEST_BOX, DEST_LED } from './livery';
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
uniform sampler2D uDest;
uniform vec3 uTube;
uniform vec3 uWood;
uniform vec3 uLed;
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
vec3 interior(vec3 p, vec3 d, bool upper, float seed, bool detail, bool heritage) {
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
      if (heritage && upper) {
        float rib = smoothstep(0.42, 0.5, abs(fract(h.x / 0.55) - 0.5));
        col = uWood * (0.75 - 0.3 * rib) + uTube * 1.4 * tube;
      } else {
        // 板缝（横向每 0.6 m）、灯管外壳（灯管两侧暗边）、两条纵向扶手（暗）
        float seam = 1.0 - smoothstep(0.0, 0.012 + aaT, abs(fract(h.x / 0.6) - 0.5) * 0.6 - 0.288);
        float housing = 1.0 - smoothstep(0.07, 0.08 + aaT, abs(abs(h.z) - 0.45));
        float rail = 1.0 - smoothstep(0.012, 0.012 + aaT, abs(abs(h.z) - 0.18));
        col = uTube * (ceilY * (1.0 - 0.25 * seam) * (1.0 - 0.35 * housing * (1.0 - tube)) + 0.55 * tube) * (1.0 - 0.85 * rail);
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
      col = mix(outside, uTube * 0.3, post);
    } else if (h.y >= wy1) {
      col = uTube * 0.6;
    } else {
      // 窗下墙板 / 座椅靠背：暗带
      col = uTube * 0.13;
    }
  } else {
    // 两端：上层是端窗（暗），下层是司机位隔板
    col = upper ? vec3(0.06, 0.065, 0.075) + uTube * 0.12 : uTube * 0.3;
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
              hitCol = heritage ? vec3(0.21, 0.105, 0.054) : vec3(0.105, 0.111, 0.12);
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
    if (hitCol.x >= 0.0) col = hitCol * uTube + uTube * topLight;
  }
  return col;
}

// ---- 窗、门开口：返回到最近开口的 SDF（负 = 在开口内），door = 1 表示门，c / hb = 开口中心与半尺寸 ----
float openings(float zone, float a, float y, out float door, out vec2 c, out vec2 hb) {
  door = 0.0;
  if (zone > 2.5) {
    // 两端：每层三扇圆角窗（横坐标 = 局部 z）
    float cy = y > 2.9 ? 3.8 : 2.0;
    float hy = y > 2.9 ? 0.35 : 0.38;
    float k = clamp(floor((a + 0.44) / 0.88) , -1.0, 1.0);
    c = vec2(k * 0.80, cy);
    hb = vec2(k == 0.0 ? 0.4 : 0.32, hy);
    return sdBox(vec2(a, y) - c, hb, 0.08);
  }
  if (y > 2.9) {
    float k = clamp(floor(a + 4.0), 0.0, 7.0);
    c = vec2(-4.0 + k + 0.5, 3.805);
    hb = vec2(0.45, 0.355);
    return sdBox(vec2(a, y) - c, hb, 0.05);
  }
  if (zone > 1.5) {
    // 右侧下层：7 扇窗
    float w = 8.0 / 7.0;
    float k = clamp(floor((a + 4.0) / w), 0.0, 6.0);
    c = vec2(-4.0 + (k + 0.5) * w, 2.0);
    hb = vec2(w * 0.5 - 0.055, 0.38);
    return sdBox(vec2(a, y) - c, hb, 0.05);
  }
  // 左侧（车门侧）下层，车尾 → 车头：端窗、入口门、4 扇窗、出口门、小端窗
  vec4 o[8];
  o[0] = vec4(-3.34, 2.0, 0.56, 0.38);
  o[1] = vec4(-2.24, 1.57, 0.44, 0.85);
  o[2] = vec4(-1.21, 2.0, 0.46, 0.38);
  o[3] = vec4(-0.19, 2.0, 0.46, 0.38);
  o[4] = vec4(0.83, 2.0, 0.46, 0.38);
  o[5] = vec4(1.85, 2.0, 0.46, 0.38);
  o[6] = vec4(2.88, 1.57, 0.44, 0.85);
  o[7] = vec4(3.66, 2.0, 0.26, 0.38);
  float best = 1e9;
  for (int i = 0; i < 8; i++) {
    float dd = sdBox(vec2(a, y) - o[i].xy, o[i].zw, 0.05);
    if (dd < best) {
      best = dd;
      c = o[i].xy;
      hb = o[i].zw;
      door = (i == 1 || i == 6) ? 1.0 : 0.0;
    }
  }
  return best;
}

// ---- 涂装（u = 绕车身展开坐标 m，y = 离轨顶 m）----
vec3 livery(float u, float y) {
  float kind = floor(vMeta.x + 0.5);
  float pat = floor(vMeta.y + 0.5);
  float sd = vMeta.w;
  if (kind == 1.0) {
    // 传统：深绿车身，两层之间米色带
    return (y > 2.4 && y < 3.4) ? vC1 : vC0;
  }
  if (kind == 2.0) {
    // 白车身 + 一道色带 + 细线
    if (y > 2.52 && y < 2.74) return vC1;
    if (y > 0.7 && y < 0.78) return vC2;
    return vC0;
  }
  vec2 q = vec2(u, y);
  float aa = max(fwidth(u), 1e-3);
  if (pat < 0.5) {
    // 斜条
    float t = fract((u + y * 0.85 + sd * 10.0) / 3.4);
    vec3 c = mix(vC0, vC1, smoothstep(0.0, aa / 3.4, t) * (1.0 - smoothstep(0.36, 0.36 + aa / 3.4, t)));
    return mix(c, vC2, smoothstep(0.42, 0.42 + aa / 3.4, t) * (1.0 - smoothstep(0.5, 0.5 + aa / 3.4, t)));
  }
  if (pat < 1.5) {
    // 大圆点（每 2.3 m 一格，半径随机）
    vec2 g = q / 2.3 + vec2(sd * 5.0, 0.0);
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float r = 0.18 + 0.25 * hash12(cell + sd * 31.0);
    float dc = length(f) - r;
    float ring = abs(dc + 0.06) - 0.025;
    vec3 c = mix(vC0, vC1, 1.0 - smoothstep(-aa, aa, dc * 2.3));
    return mix(c, vC2, (1.0 - smoothstep(-aa, aa, ring * 2.3)) * step(0.5, hash12(cell + 3.7)));
  }
  if (pat < 2.5) {
    // 色块：下层板一色，两层间广告带里一大块强调色
    if (y < 1.6) return vC1;
    float s0 = 2.0 + sd * 6.0;
    float inBlock = step(s0, mod(u, 10.0)) * step(mod(u, 10.0), s0 + 3.5) * step(2.5, y) * step(y, 3.3);
    return mix(vC0, vC2, inBlock);
  }
  if (pat < 3.5) {
    // 渐变 + 波浪线
    float g = 0.5 + 0.5 * sin(u * 0.45 + sd * 6.28);
    vec3 c = mix(vC0, vC1, smoothstep(0.2, 0.8, g) * smoothstep(0.4, 3.8, y));
    float wave = abs(y - (2.9 + 0.32 * sin(u * 0.7 + sd * 9.0))) - 0.07;
    return mix(c, vC2, 1.0 - smoothstep(-0.01, 0.01, wave));
  }
  // 对角分色
  float edge = y - (0.9 + mod(u + sd * 7.0, 10.5) * 0.33);
  vec3 c = mix(vC1, vC0, smoothstep(-0.01, 0.01, edge));
  return mix(c, vC2, 1.0 - smoothstep(0.05, 0.08, abs(edge)));
}

void main() {
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float zone = floor(vZone + 0.5);
  bool heritage = floor(vMeta.x + 0.5) == 1.0;
  vec3 albedo = vAlb;
  vec3 emit = vEm;
  float glass = 0.0;
  float spec = 0.35;
  vec3 inside = vec3(0.0);
  if (zone == 5.0) {
    albedo = ${v3(linearRGB('#c9ccc8'))} * 0.85;
  } else if (zone == 6.0) {
    albedo = vec3(0.03);
  } else if (zone == 7.0) {
    albedo = vAlb;
  } else if (zone > 0.5) {
    float y = vLocal.y;
    float a = zone > 2.5 ? vLocal.z : vLocal.x;
    vec3 body = livery(vWrap, y);
    vec3 post = heritage ? vC2 : (vMeta.w > 0.4 ? body : ${v3(linearRGB('#3a3d40'))});
    albedo = body;
    bool winBand = (y > 1.6 && y < 2.4) || (y > 3.4 && y < 4.2);
    float door;
    vec2 c;
    vec2 hb;
    float d = openings(zone, a, y, door, c, hb);
    bool doorZone = door > 0.5 && y > 0.65;
    float aa = max(fwidth(d), 1e-4);
    if (winBand || doorZone) {
      float inGlass = 1.0 - smoothstep(-aa, aa, d);
      albedo = post;
      if (doorZone) {
        // 门：两扇折门，每扇一块长玻璃（下部实板），门框深灰
        vec2 q = vec2(a, y) - c;
        float lx = abs(q.x);
        float leafGlass = step(0.05, lx) * step(lx, hb.x - 0.05) * step(1.0, y) * step(y, 2.34);
        inGlass *= leafGlass;
        albedo = mix(post, ${v3(linearRGB('#2e3134'))}, step(d, 0.0));
      }
      // 上层气窗横档（窗高上部 25 %）
      if (y > 3.4) inGlass *= smoothstep(0.012, 0.012 + aa * 4.0, abs(y - 3.99));
      if (inGlass > 0.001) {
        bool upper = y > 2.9;
        vec3 dir = normalize(vLocal - vCamL);
        float dist = length(vLocal - vCamL);
        vec3 ins = interior(vLocal, dir, upper, vMeta.w, dist < 70.0, heritage);
        inside = ins * inGlass;
        glass = inGlass;
      }
    }
    // 目的地牌（两端，两层之间）
    if (zone > 2.5) {
      vec2 dq = vec2(a, y) - vec2(0.0, 2.79);
      float db = sdBox(dq, vec2(0.74, 0.27), 0.04);
      if (db < 0.0) {
        float u = zone < 3.5 ? (0.7 - a) / 1.4 : (a + 0.7) / 1.4;
        float vv = (y - 2.56) / 0.46;
        float tile = floor(vMeta.z + 0.5);
        float style = step(7.5, tile);
        tile = mod(tile, 8.0);
        float inside2 = step(0.0, u) * step(u, 1.0) * step(0.0, vv) * step(vv, 1.0);
        float m = texture2D(uDest, vec2(clamp(u, 0.0, 1.0), 1.0 - (tile + 1.0) / ${DEST_ROWS.toFixed(1)} + clamp(vv, 0.0, 1.0) / ${DEST_ROWS.toFixed(1)})).r * inside2;
        albedo = vec3(0.01);
        if (style < 0.5) {
          // 橙色 LED 点阵：近处看得到点，远处退成平均
          vec2 dots = fract(vec2(u * 96.0, vv * 18.0)) - 0.5;
          float fw = fwidth(u * 96.0);
          float dotK = mix(1.0 - smoothstep(0.28, 0.42, length(dots)), 0.55, smoothstep(0.3, 0.8, fw));
          emit += ${v3(linearRGB(DEST_LED.fg))} * (2.2 / 0.45) * m * dotK + ${v3(linearRGB(DEST_LED.bg))} * 0.5;
        } else {
          emit += ${v3(linearRGB(DEST_BOX.bg))} * 3.0 * inside2 + ${v3(linearRGB(DEST_BOX.fg))} * 2.6 * m;
        }
        spec = 0.6;
      }
    }
  }
  // 照明：城市环境光 + 车身所在位置的路灯照度（CPU 每帧按附近路灯算，iState.y）
  vec3 lampC = mix(uLed, uSodium, vState.w);
  vec3 irr = cityAmbient(n, vLocal.y, uWarmth) + lampC * vState.y * mix(0.45, 0.8, max(n.y, 0.0));
  float fres = pow(1.0 - clamp(abs(dot(n, V)), 0.0, 1.0), 4.0);
  vec3 surface = albedo * irr * (1.0 - glass) + uHazeColor * fres * mix(spec * 0.5, 0.9, glass) * max(n.y + 0.4, 0.2);
  // 玻璃：车内光透过（菲涅耳反射多时透得少）
  emit += inside * (1.0 - 0.6 * fres);
  vec3 col = applyHaze(surface, emit, vWorld);
  ${GLSL_FINISH}
}
`;

export function createTramMaterial(dest: Texture | null): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...sharedUniforms(),
      uDest: { value: dest },
      uPivot: { value: new Vector3(...POLE_PIVOT) },
      uTube: { value: lightColour('tubeCool') },
      uWood: { value: lightColour('#c98d52').multiplyScalar(0.9) },
      uLed: { value: lightColour('ledWhite') },
      uSodium: { value: lightColour('sodium') },
      uWarmth: { value: 0.4 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

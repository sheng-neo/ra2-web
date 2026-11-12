/**
 * 贴地贴花：冲击环 / 柔光斑 / 扇形 / 裂纹 / 符文阵 / 预警圈 / 方向条 / 射程圈 / 锁定圈 / 旋涡 / 焦痕 / 星印 / 斩痕 / 指向环 / 区域边界。
 * 全部是实例化的贴地四边形，图案在片元着色器里用距离场程序绘制(任意分辨率都锐利、可动、可溶解)，
 * 整个系统 1 个 draw call(+1 个「被遮挡部分」的透视通道，只画标了 xray 的贴花：瞄准指示器、预警圈)。
 *
 * 两种用法：
 *   一次性：`add(type, x, z, radius, life)` → 自动播放、到期回收；
 *   常驻：  `hold(type)` 拿到槽位，逐帧用 `at(slot)` 改位置/半径/参数，`release(slot)` 淡出回收。
 * 输出 = B 色底衬(普通混合，保证亮地面上也读得清) + A 色发光(叠加，可触发 bloom)。
 */
import * as THREE from 'three';
import { GLSL_ADDITIVE, GLSL_NOISE } from '../materials';
import { applyFxBlending } from './textures';

const SLOTS = 192;
const STRIDE = 20;
/** 常驻贴花的寿命标记 */
const FOREVER = 1e9;

export const DECAL = {
  /** 冲击环：p0 起始半径比 → p1 结束半径比(p0 > p1 = 向内收束) */
  ring: 0,
  /** 柔光斑：p0 衰减指数 */
  glow: 1,
  /** 扇形：p0 半角(弧度)，p1 = 0 一次性刀气 / 1 常驻指示器。朝向 = rot */
  cone: 2,
  /** 地裂：p1 额外亮度 */
  cracks: 3,
  /** 符文阵：p0 星形角数，p1 自转速度 */
  rune: 4,
  /** 预警圈：p0 倒计时进度 0..1(由内向外填充) */
  telegraph: 5,
  /** 带箭头的矩形条(方向指示)：中心在条的中点，rot 为朝向，radius 为半长，aspect = 半宽/半长 */
  rect: 6,
  /** 细圈：p0 线宽比例，p1 虚线段数(0 = 实线) */
  range: 7,
  /** 锁定圈(旋转的括弧 + 向内的三角) */
  lock: 8,
  /** 旋涡：p0 旋臂数，p1 扭转(符号 = 方向) */
  swirl: 9,
  /** 焦痕/暗斑(A 色为余烬裂纹) */
  scorch: 10,
  /** 星印：p0 角数，p1 尖锐度 */
  star: 11,
  /** 斩痕/地面流光：沿 rot 方向的梭形，p0 噪声量，p1 扫过速度(0 = 立即全亮) */
  streak: 12,
  /** 脚下指向环：圆环 + 指向 rot 的三角 */
  pointer: 13,
  /** 持续区域边界：亮边 + 内向渐隐 + 转动的虚线，p0 虚线段数，p1 脉冲相位 */
  zone: 14,
} as const;

const VERTEX = /* glsl */ `
uniform float uNow;
uniform float uXray;
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aT;
attribute vec4 aC0;
attribute vec4 aC1;
varying vec2 vP;
varying vec4 vT;
varying vec4 vC0;
varying vec4 vC1;
varying vec4 vW;
varying vec2 vS;
void main() {
  float age = uNow - aT.x;
  float persist = step(1e8, aT.y);
  float t = persist > 0.5 ? 0.0 : age / aT.y;
  if (age < 0.0 || t >= 1.0 || aA.w <= 0.0 || aC0.a <= 0.0 || (uXray > 0.5 && aB.w < 0.5)) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec2 q = position.xz;
  float c = cos(aB.x);
  float s = sin(aB.x);
  vec2 l = vec2(q.x, q.y * aB.y) * aA.w;
  vec3 wp = vec3(aA.x + l.x * c - l.y * s, aA.y, aA.z + l.x * s + l.y * c);
  vP = q;
  vT = vec4(t, aB.z, aT.z, aT.w);
  vC0 = aC0;
  vC1 = aC1;
  vW = vec4(wp.xz, aA.w, aA.w * aB.y);
  vS = vec2(fract(aT.x * 17.31 + aA.x * 0.371 + aA.z * 0.113), persist);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uNow;
uniform float uAlpha;
varying vec2 vP;
varying vec4 vT;
varying vec4 vC0;
varying vec4 vC1;
varying vec4 vW;
varying vec2 vS;
${GLSL_NOISE}
${GLSL_ADDITIVE}
const float TAU = 6.2831853;
const float PI = 3.14159265;

float band(float x, float w, float aa) {
  return 1.0 - smoothstep(w - aa, w + aa, abs(x));
}
vec2 rot2(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}
// n 角星的有符号距离(Inigo Quilez)：m ∈ [2, n]，越小角越尖
float sdStar(vec2 p, float r, float n, float m) {
  float an = PI / n;
  float en = PI / m;
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}
// 一圈符文：圆环切成 n 格，每格用哈希画几道短划
float runes(float r, float a, float r0, float w, float n, float seed) {
  float fr = (r - r0) / w;
  if (abs(fr) > 1.0) return 0.0;
  float cell = floor(a / TAU * n);
  float fa = fract(a / TAU * n) - 0.5;
  float h = hash12(vec2(cell, seed));
  float h2 = hash12(vec2(cell + 31.0, seed));
  float g = (1.0 - smoothstep(0.07, 0.13, abs(fa - (h - 0.5) * 0.4))) * step(abs(fr), 0.8);
  g = max(g, (1.0 - smoothstep(0.1, 0.2, abs(fr - (h2 - 0.5) * 1.2))) * step(abs(fa), 0.3) * step(0.35, h));
  g = max(g, (1.0 - smoothstep(0.1, 0.2, abs(fr + (h - 0.5)))) * step(abs(fa + 0.1), 0.22) * step(0.5, h2));
  return g * step(abs(fa), 0.4);
}

void main() {
  float t = vT.x;
  float type = vT.y;
  float p0 = vT.z;
  float p1 = vT.w;
  float persist = vS.y;
  float seed = vS.x;
  vec2 p = vP;
  vec2 wp = vW.xy;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float aa = fwidth(r) * 1.2 + 1e-4;
  float now = uNow;
  // e = A 色发光量，hot = 白热量，cov = B 色底衬的覆盖率
  float e = 0.0;
  float hot = 0.0;
  float cov = 0.0;
  float disc = 1.0 - smoothstep(1.0 - aa * 2.0, 1.0, r);

  if (type < 0.5) {
    // ── 冲击环 ──
    float k = 1.0 - (1.0 - t) * (1.0 - t) * (1.0 - t);
    float rr = mix(p0, p1, k);
    float dir = p1 >= p0 ? 1.0 : -1.0;
    float d = (r - rr) * dir;
    float w = mix(0.26, 0.1, t);
    float front = 1.0 - smoothstep(-aa, aa, d);
    float trail = smoothstep(-w, 0.0, d);
    float body = front * trail * trail;
    float rim = band(d + 0.014, 0.014, aa);
    float fade = 1.0 - smoothstep(0.3, 1.0, t);
    e = (body * 0.8 + rim * 1.5) * fade;
    hot = rim * 0.55 * fade;
    cov = (body * 0.45 + rim * 0.3) * fade;
  } else if (type < 1.5) {
    // ── 柔光斑 ──
    float g = pow(max(0.0, 1.0 - r), max(p0, 0.5));
    float f = persist > 0.5 ? 1.0 : smoothstep(0.0, 0.08, t) * (1.0 - t) * (1.0 - t);
    e = g * f;
    cov = g * f;
  } else if (type < 2.5) {
    // ── 扇形 ──
    float da = (abs(ang) - p0) * max(r, 0.05);
    float inside = (1.0 - smoothstep(-aa, aa, da)) * disc;
    if (p1 < 0.5) {
      // 刀气从顶点扫向外缘，随后由噪声从内向外烧尽
      float front = min(1.0, t * 3.4);
      float swept = 1.0 - smoothstep(front - 0.03, front + 0.02, r);
      float lead = band(r - front + 0.03, 0.05, 0.03) * (1.0 - smoothstep(0.3, 0.45, t));
      float n = fbm(wp * 1.25 + vec2(seed * 7.0, -now * 0.5));
      float burn = smoothstep(t * 1.3 - 0.2, t * 1.3 + 0.25, n * 0.8 + r * 0.45);
      float fill = (0.2 + 0.8 * r * r) * swept * burn;
      float edge = max(band(da + 0.012, 0.014, aa), band(r - 0.975, 0.02, aa)) * swept;
      float fade = 1.0 - smoothstep(0.6, 1.0, t);
      e = (fill * 0.85 + lead * 1.4 + edge * 1.3 * (0.35 + 0.65 * burn)) * inside * fade;
      hot = (lead * 0.6 + edge * 0.25 * burn) * inside * fade;
      cov = (fill * 0.5 + edge * 0.3) * inside * fade;
    } else {
      float edge = max(band(da + 0.012, 0.012, aa), band(r - 0.98, 0.016, aa));
      float flow = band(fract(r * 3.0 - now * 0.9) - 0.5, 0.05, 0.05) * 0.3 * smoothstep(0.15, 0.45, r);
      float fill = 0.14 + 0.26 * r * r;
      float apex = smoothstep(0.03, 0.22, r);
      e = (fill + edge * 1.25 + flow) * inside * apex;
      hot = edge * 0.15 * inside * apex;
      cov = (0.3 + edge * 0.35) * inside * apex;
    }
  } else if (type < 3.5) {
    // ── 地裂：细胞状裂纹 + 放射主裂缝，由中心向外迅速蔓延，结束时噪声溶解 ──
    float grow = min(1.0, t * 6.0 + 0.12);
    vec2 q = wp * 0.95 + seed * 13.0;
    float n1 = vnoise(q);
    float n2 = vnoise(q + vec2(5.2, 1.3));
    float cell = abs(n1 - n2);
    float bend = (vnoise(wp * 0.7 + seed * 3.0) - 0.5) * 3.2;
    float spokes = abs(sin(ang * (3.0 + floor(seed * 3.0)) + bend + r * 1.3));
    float w = mix(0.085, 0.02, r);
    float lineA = (1.0 - smoothstep(w * 0.4, w, cell)) * (1.0 - smoothstep(0.55, 1.0, r));
    float lineB = 1.0 - smoothstep(w * 1.2, w * 2.6, spokes * (0.3 + r));
    float crack = max(lineA, lineB);
    float wideA = (1.0 - smoothstep(w, w * 3.0, cell)) * (1.0 - smoothstep(0.55, 1.0, r));
    float wideB = 1.0 - smoothstep(w * 2.6, w * 6.0, spokes * (0.3 + r));
    float mask = (1.0 - smoothstep(grow - 0.3, grow, r)) * (1.0 - smoothstep(0.82, 1.0, r + (n1 - 0.5) * 0.3));
    float gone = 1.0 - smoothstep(0.72, 1.0, t + (n2 - 0.5) * 0.3);
    float heat = 1.0 - t;
    heat = 0.3 + heat * heat * 1.5 + p1;
    float flicker = 0.85 + 0.15 * sin(now * 7.0 + n1 * 30.0);
    e = crack * mask * heat * gone * flicker;
    hot = crack * mask * (1.0 - smoothstep(0.0, 0.2, t)) * 0.9;
    cov = (max(wideA, wideB) * 0.8 + (1.0 - r) * 0.28) * mask * gone;
  } else if (type < 4.5) {
    // ── 符文阵 ──
    float n = max(3.0, p0);
    float appear = persist > 0.5 ? 1.0 : smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.65, 1.0, t));
    float grow = 1.0 - min(1.0, t * 5.0);
    float sc = persist > 0.5 ? 1.0 : 1.0 - 0.3 * grow * grow;
    vec2 ps = p / sc;
    float rs = r / sc;
    float spin = now * p1;
    float st = sdStar(rot2(ps, spin), 0.6, n, 2.0 + n * 0.1);
    float st2 = sdStar(rot2(ps, -spin * 0.7 + PI / n), 0.36, n, 2.6);
    float ln = band(rs - 0.945, 0.024, aa) + band(rs - 0.855, 0.008, aa) * 0.8 + band(rs - 0.64, 0.008, aa) * 0.7;
    ln += runes(rs, ang + PI - spin * 0.5, 0.75, 0.065, floor(n * 3.0 + 0.5), seed * 9.0) * 0.9;
    ln += (1.0 - smoothstep(0.008, 0.008 + aa * 1.5, abs(st))) * 0.95;
    ln += (1.0 - smoothstep(0.006, 0.006 + aa * 1.5, abs(st2))) * 0.6;
    float fill = (1.0 - rs) * 0.12 + (1.0 - smoothstep(-0.02, 0.0, st)) * 0.07;
    float inside = 1.0 - smoothstep(0.975, 1.0, rs);
    e = (ln + fill) * appear * inside;
    hot = ln * 0.2 * appear * inside;
    cov = (min(ln, 1.0) * 0.5 + 0.2 * (1.0 - rs)) * appear * inside;
  } else if (type < 5.5) {
    // ── 预警圈：亮边 + 由内向外的倒计时填充 ──
    float prog = clamp(p0, 0.0, 1.0);
    float urgent = smoothstep(0.65, 1.0, prog);
    float pulse = 0.7 + 0.3 * sin(now * 14.0);
    float edge = band(r - 0.962, 0.03, aa);
    float inner = 1.0 - smoothstep(prog - aa, prog + aa, r);
    float lead = band(r - prog + 0.012, 0.016, aa) * step(0.03, prog) * (1.0 - step(0.985, prog));
    float ticks = band(fract(ang / TAU * 16.0) - 0.5, 0.07, 0.03) * band(r - 0.9, 0.035, aa);
    e = (edge * (1.15 + 0.6 * pulse * urgent) + inner * (0.2 + 0.22 * r + 0.2 * urgent * pulse) + lead * 0.9 + ticks * 0.55 + 0.07) * disc;
    hot = (edge * 0.2 + lead * 0.3) * disc;
    cov = (0.26 + inner * 0.22 + edge * 0.4) * disc;
  } else if (type < 6.5) {
    // ── 方向条：箭身 + 箭头 + 向前流动的尖纹 ──
    float L = vW.z;
    float W = vW.w;
    float px = p.x * L;
    float py = abs(p.y) * W;
    float hl = min(W * 1.5, L * 0.6);
    float bw = W * 0.62;
    float x0 = L - hl;
    float dBody = max(py - bw, max(px - x0, -(px + L)));
    float dHead = max((py - W * (L - px) / hl) * (hl / sqrt(hl * hl + W * W)), x0 - px);
    float d = min(dBody, dHead);
    float aw = fwidth(d) * 1.2 + 1e-4;
    float inside = 1.0 - smoothstep(-aw, aw, d);
    float edge = band(d + 0.06, 0.04, aw);
    float along = (px + L) / (2.0 * L);
    float chev = band(fract((px - py * 0.9) * 0.5 - now * 1.5) - 0.5, 0.09, 0.07) * 0.3;
    float fill = 0.13 + 0.3 * along * along;
    float start = smoothstep(0.0, min(1.4, L * 0.5), px + L);
    e = (fill + edge * 1.2 + chev) * inside * start;
    hot = edge * 0.12 * inside * start;
    cov = (0.3 + edge * 0.4) * inside * start;
  } else if (type < 7.5) {
    // ── 细圈(射程 / 塔的攻击范围) ──
    float th = max(p0, 0.004);
    float ln = band(r - (1.0 - th * 1.5), th, aa);
    float dash = p1 > 0.5 ? 1.0 - smoothstep(0.3, 0.34, abs(fract(ang / TAU * p1 + now * 0.03) - 0.5)) : 1.0;
    float halo = smoothstep(0.72, 1.0, r) * disc * 0.14;
    e = ln * dash + halo;
    hot = ln * dash * 0.1;
    cov = ln * dash * 0.5 + halo * 0.5;
  } else if (type < 8.5) {
    // ── 锁定圈 ──
    float a2 = ang + now * 1.6;
    float seg = abs(fract(a2 / TAU * 4.0) - 0.5);
    float pulse = 0.82 + 0.18 * sin(now * 6.0);
    float brack = band(r - 0.88, 0.065, aa) * (1.0 - smoothstep(0.2, 0.24, seg));
    float tw = clamp((r - 0.52) / 0.26, 0.0, 1.0) * 0.1;
    float tri = (1.0 - smoothstep(tw - 0.012, tw + 0.012, seg)) * step(0.52, r) * (1.0 - smoothstep(0.78 - aa, 0.78 + aa, r));
    float inner = band(r - 0.6, 0.012, aa) * 0.5;
    e = (brack * 1.2 + tri * 1.1 + inner) * pulse;
    hot = brack * 0.2;
    cov = (brack + tri) * 0.5;
  } else if (type < 9.5) {
    // ── 旋涡 ──
    float arms = max(1.0, p0);
    float appear = persist > 0.5 ? 1.0 : smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.55, 1.0, t));
    float dirS = p1 >= 0.0 ? 1.0 : -1.0;
    float s = fract(ang / TAU * arms + r * p1 - now * 0.9 * dirS);
    float nz = fbm(vec2(ang * 2.0 + now * dirS, r * 5.0 - now * 1.3) + seed * 5.0);
    float arm = s * s * s * (1.0 - smoothstep(0.9, 1.0, s));
    float env = smoothstep(0.06, 0.35, r) * (1.0 - smoothstep(0.72, 1.0, r));
    e = arm * env * (0.55 + 0.9 * nz) * appear;
    hot = arm * arm * arm * env * 0.35 * appear;
    cov = arm * env * 0.4 * appear;
  } else if (type < 10.5) {
    // ── 焦痕 ──
    float n = fbm(wp * 1.7 + seed * 9.0);
    float blob = 1.0 - smoothstep(0.42, 0.95, r + (n - 0.5) * 0.6);
    float f = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.5, 1.0, t));
    cov = blob * 0.78 * f;
    float vein = 1.0 - smoothstep(0.0, 0.07, abs(vnoise(wp * 3.1 + seed * 5.0) - vnoise(wp * 3.1 + seed * 5.0 + 3.7)));
    e = vein * blob * (1.0 - smoothstep(0.0, 0.65, t)) * (0.6 + 0.4 * sin(now * 5.0 + n * 20.0));
  } else if (type < 11.5) {
    // ── 星印 ──
    float n = max(3.0, p0);
    float pop = 1.0 - pow(1.0 - min(1.0, t * 5.0), 3.0);
    float sc = persist > 0.5 ? 1.0 : mix(0.25, 1.0, pop);
    float st = sdStar(p / sc, 0.9, n, p1 > 0.0 ? p1 : 2.6) * sc;
    float outline = 1.0 - smoothstep(0.014, 0.014 + aa * 1.5, abs(st));
    float fill = 1.0 - smoothstep(-0.015, 0.0, st);
    float fade = persist > 0.5 ? 1.0 : 1.0 - smoothstep(0.25, 1.0, t);
    e = (outline * 1.3 + fill * (0.14 + 0.5 * (1.0 - t))) * fade;
    hot = outline * 0.3 * fade;
    cov = fill * 0.4 * fade;
  } else if (type < 12.5) {
    // ── 斩痕 / 流光 ──
    float x = p.x;
    float taper = sqrt(max(0.0, 1.0 - x * x));
    float w = max(0.03, taper);
    float prof = exp(-(p.y * p.y) / (w * w) * 4.5);
    float sweep = p1 > 0.0 ? 1.0 - smoothstep(-0.2, 0.1, x + 1.0 - 2.3 * min(1.0, t * p1)) : 1.0;
    float n = p0 > 0.0 ? mix(1.0, fbm(vec2(x * vW.z * 1.4 - now * 2.2, p.y * 2.0) + seed * 5.0) * 1.7, p0) : 1.0;
    float fade = (1.0 - t) * (1.0 - t);
    e = prof * taper * sweep * n * fade * 1.2;
    hot = pow(prof, 6.0) * taper * sweep * fade * 0.8;
    cov = prof * taper * sweep * fade * 0.55;
  } else if (type < 13.5) {
    // ── 脚下指向环 ──
    float ring = band(r - 0.6, 0.022, aa);
    float ty = abs(p.y);
    float tri = (1.0 - smoothstep(-aa, aa, ty - (0.99 - p.x) * 0.62)) * smoothstep(0.7 - aa, 0.7 + aa, p.x);
    float breath = 0.85 + 0.15 * sin(now * 3.0);
    e = (ring * 0.9 + tri * 1.25) * breath;
    hot = tri * 0.2;
    cov = (ring + tri) * 0.4;
  } else {
    // ── 持续区域边界 ──
    float edge = band(r - 0.972, 0.022, aa);
    float falloff = exp(-(1.0 - r) * 7.0) * 0.42 * disc;
    float dashes = p0 > 0.5 ? band(r - 0.885, 0.012, aa) * (1.0 - smoothstep(0.3, 0.34, abs(fract(ang / TAU * p0 + now * 0.06) - 0.5))) * 0.7 : 0.0;
    float pulse = 1.0 + 0.25 * sin(now * 4.0 + p1);
    e = edge * 1.2 * pulse + falloff + dashes + 0.06 * disc;
    hot = edge * 0.18;
    cov = edge * 0.45 + falloff * 0.5 + 0.12 * disc;
  }

  float alpha = vC0.a * uAlpha;
  float m = max(vC0.r, max(vC0.g, vC0.b));
  vec3 em = (vC0.rgb * e + vec3(hot * m)) * alpha;
  float c = clamp(cov * vC1.a, 0.0, 1.0) * min(alpha, 1.0);
  if (c + em.r + em.g + em.b < 0.004) discard;
  #ifdef TONE_MAPPING
  // 直出屏幕(low 档)：底衬与发光分别映射后再合成，半透明边缘不出亮边
  gl_FragColor = vec4(vC1.rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 baseMapped = gl_FragColor.rgb;
  gl_FragColor = vec4(kitAdditive(em), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(baseMapped * c + gl_FragColor.rgb, c);
  #else
  gl_FragColor = vec4(vC1.rgb * c + em, c);
  #endif
}
`;

/** 指向某个槽位的「画笔」：链式设置贴花参数。同一时刻只有一个实例，不要长期持有 */
export class DecalPen {
  slot = 0;
  private sys: DecalSystem;
  constructor(sys: DecalSystem) {
    this.sys = sys;
  }
  private o(): number {
    this.sys.dirty = true;
    return this.slot * STRIDE;
  }
  at(x: number, z: number): this {
    const d = this.sys.data;
    const o = this.o();
    d[o] = x;
    d[o + 2] = z;
    return this;
  }
  /** 离地高度(默认 0.06) */
  y(h: number): this {
    this.sys.data[this.o() + 1] = h;
    return this;
  }
  radius(r: number): this {
    this.sys.data[this.o() + 3] = r;
    return this;
  }
  /** 朝向(弧度，atan2(dir.y, dir.x)) 与宽长比 */
  rot(a: number, aspect = 1): this {
    const d = this.sys.data;
    const o = this.o();
    d[o + 4] = a;
    d[o + 5] = aspect;
    return this;
  }
  params(p0: number, p1 = 0): this {
    const d = this.sys.data;
    const o = this.o();
    d[o + 10] = p0;
    d[o + 11] = p1;
    return this;
  }
  /** A 色(发光)：颜色 × HDR 亮度，以及整体不透明度 */
  color(c: THREE.Color, intensity = 1, alpha = 1): this {
    const d = this.sys.data;
    const o = this.o();
    d[o + 12] = c.r * intensity;
    d[o + 13] = c.g * intensity;
    d[o + 14] = c.b * intensity;
    this.sys.baseAlpha[this.slot] = alpha;
    d[o + 15] = alpha * this.sys.vis[this.slot];
    return this;
  }
  alpha(a: number): this {
    this.sys.baseAlpha[this.slot] = a;
    this.sys.data[this.o() + 15] = a * this.sys.vis[this.slot];
    return this;
  }
  /** B 色底衬与强度(0 = 纯发光) */
  under(c: THREE.Color, k: number): this {
    const d = this.sys.data;
    const o = this.o();
    d[o + 16] = c.r;
    d[o + 17] = c.g;
    d[o + 18] = c.b;
    d[o + 19] = k;
    return this;
  }
  /** 被地形/单位挡住的部分也淡淡地画出来(瞄准指示器、预警圈) */
  xray(on = true): this {
    this.sys.data[this.o() + 7] = on ? 1 : 0;
    return this;
  }
  /** 延迟出现(仅一次性贴花) */
  delay(t: number): this {
    const o = this.o();
    this.sys.data[o + 8] += t;
    this.sys.expire[this.slot] += t;
    return this;
  }
  /** 跟随某个单位(每帧由系统更新位置) */
  follow(unitId: number): this {
    this.sys.followId[this.slot] = unitId;
    return this;
  }
  id(): number {
    return this.slot;
  }
}

export class DecalSystem {
  readonly mesh: THREE.Mesh;
  readonly xrayMesh: THREE.Mesh;
  now = 0;
  /** 跟随单位的位置解析(由 FxKit 注入) */
  resolve: ((unitId: number, out: THREE.Vector3) => boolean) | null = null;

  /** @internal */ data = new Float32Array(SLOTS * STRIDE);
  /** @internal */ expire = new Float64Array(SLOTS);
  /** @internal */ followId = new Int32Array(SLOTS).fill(-1);
  /** @internal */ baseAlpha = new Float32Array(SLOTS);
  /** @internal 常驻贴花的淡入淡出系数 */ vis = new Float32Array(SLOTS).fill(1);
  /** @internal */ dirty = false;

  private used = new Uint8Array(SLOTS);
  /** 0 = 一次性，1 = 常驻显示中，2 = 常驻淡出中 */
  private mode = new Uint8Array(SLOTS);
  private fadeRate = new Float32Array(SLOTS);
  private hi = 0;
  private pen: DecalPen;
  private buffer: THREE.InstancedInterleavedBuffer;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private xrayMat: THREE.ShaderMaterial;
  private tmp = new THREE.Vector3();
  private xrayCount = 0;

  constructor() {
    this.pen = new DecalPen(this);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
    geo.setIndex([0, 3, 2, 0, 2, 1]);
    const buf = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    ['aA', 'aB', 'aT', 'aC0', 'aC1'].forEach((n, i) => geo.setAttribute(n, new THREE.InterleavedBufferAttribute(buf, 4, i * 4)));
    geo.instanceCount = 0;
    this.geo = geo;
    this.buffer = buf;
    const uNow = { value: 0 };
    const mk = (xray: boolean): THREE.ShaderMaterial => {
      const m = new THREE.ShaderMaterial({
        uniforms: { uNow, uXray: { value: xray ? 1 : 0 }, uAlpha: { value: xray ? 0.42 : 1 } },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });
      applyFxBlending(m);
      if (xray) m.depthFunc = THREE.GreaterDepth;
      return m;
    };
    this.mat = mk(false);
    this.xrayMat = mk(true);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'fx.decals';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.xrayMesh = new THREE.Mesh(geo, this.xrayMat);
    this.xrayMesh.name = 'fx.decals.xray';
    this.xrayMesh.frustumCulled = false;
    this.xrayMesh.renderOrder = 5.5;
    this.mesh.visible = false;
    this.xrayMesh.visible = false;
  }

  private alloc(type: number, life: number): number {
    let i = 0;
    while (i < SLOTS && this.used[i]) i++;
    if (i >= SLOTS) {
      // 池满：挤掉最早到期的一次性贴花
      let best = -1;
      let bestT = Infinity;
      for (let k = 0; k < SLOTS; k++) {
        if (this.mode[k] === 0 && this.expire[k] < bestT) {
          bestT = this.expire[k];
          best = k;
        }
      }
      i = best < 0 ? 0 : best;
    }
    this.used[i] = 1;
    if (i >= this.hi) this.hi = i + 1;
    const d = this.data;
    const o = i * STRIDE;
    d.fill(0, o, o + STRIDE);
    d[o + 1] = 0.06;
    d[o + 5] = 1;
    d[o + 6] = type;
    d[o + 8] = this.now;
    d[o + 9] = life;
    d[o + 12] = d[o + 13] = d[o + 14] = 1;
    d[o + 15] = 1;
    this.baseAlpha[i] = 1;
    this.vis[i] = 1;
    this.followId[i] = -1;
    this.mode[i] = 0;
    this.expire[i] = this.now + life;
    this.dirty = true;
    return i;
  }

  /** 一次性贴花：到期自动回收。返回画笔继续设置颜色/参数 */
  add(type: number, x: number, z: number, radius: number, life: number): DecalPen {
    const i = this.alloc(type, life);
    const o = i * STRIDE;
    this.data[o] = x;
    this.data[o + 2] = z;
    this.data[o + 3] = radius;
    this.pen.slot = i;
    return this.pen;
  }

  /** 常驻贴花：占一个槽位，之后用 at(slot) 逐帧更新，release(slot) 归还 */
  hold(type: number, fadeIn = 0.12): number {
    const i = this.alloc(type, FOREVER);
    this.mode[i] = 1;
    this.vis[i] = fadeIn > 0 ? 0 : 1;
    this.fadeRate[i] = fadeIn > 0 ? 1 / fadeIn : 0;
    this.data[i * STRIDE + 15] = 0;
    return i;
  }

  /** 取某个槽位的画笔 */
  at(slot: number): DecalPen {
    this.pen.slot = slot;
    return this.pen;
  }

  /** 归还常驻贴花(fade 秒内淡出) */
  release(slot: number, fade = 0.18): void {
    if (slot < 0 || !this.used[slot] || this.mode[slot] === 0) return;
    if (fade <= 0) {
      this.free(slot);
      return;
    }
    this.mode[slot] = 2;
    this.fadeRate[slot] = 1 / fade;
  }

  private free(i: number): void {
    this.used[i] = 0;
    this.mode[i] = 0;
    this.followId[i] = -1;
    const o = i * STRIDE;
    this.data[o + 3] = 0;
    this.data[o + 7] = 0;
    this.dirty = true;
  }

  /** 每帧一次：回收到期的、推进淡入淡出、更新跟随位置并上传 */
  flush(dt: number): void {
    this.mat.uniforms.uNow.value = this.now;
    const d = this.data;
    let hi = 0;
    let xray = 0;
    for (let i = 0; i < this.hi; i++) {
      if (!this.used[i]) continue;
      const o = i * STRIDE;
      const mode = this.mode[i];
      if (mode === 0) {
        if (this.now >= this.expire[i]) {
          this.free(i);
          continue;
        }
      } else {
        const target = mode === 1 ? 1 : 0;
        let v = this.vis[i];
        if (v !== target) {
          const step = this.fadeRate[i] > 0 ? this.fadeRate[i] * dt : 1;
          v = target > v ? Math.min(1, v + step) : Math.max(0, v - step);
          this.vis[i] = v;
          d[o + 15] = this.baseAlpha[i] * v;
          this.dirty = true;
        }
        if (mode === 2 && v <= 0) {
          this.free(i);
          continue;
        }
      }
      const f = this.followId[i];
      if (f >= 0 && this.resolve && this.resolve(f, this.tmp)) {
        d[o] = this.tmp.x;
        d[o + 2] = this.tmp.z;
        this.dirty = true;
      }
      if (d[o + 7] > 0.5) xray++;
      hi = i + 1;
    }
    this.hi = hi;
    this.xrayCount = xray;
    this.geo.instanceCount = hi;
    this.mesh.visible = hi > 0;
    this.xrayMesh.visible = xray > 0;
    if (this.dirty) {
      this.buffer.updateRanges.length = 0;
      this.buffer.needsUpdate = true;
      this.dirty = false;
    }
  }

  get activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.hi; i++) n += this.used[i];
    return n;
  }

  get xrayActive(): number {
    return this.xrayCount;
  }

  clear(): void {
    for (let i = 0; i < SLOTS; i++) if (this.used[i]) this.free(i);
    this.hi = 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.xrayMat.dispose();
  }
}

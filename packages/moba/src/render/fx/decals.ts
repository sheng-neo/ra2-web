/**
 * 贴地贴花：冲击环 / 柔光斑 / 扇形 / 裂纹 / 符文阵 / 预警圈 / 方向条 / 射程圈 / 锁定圈 / 旋涡 / 焦痕 / 星印 / 斩痕 / 指向环 / 区域边界 / 纹章环 / 扇形预警，
 * 以及英雄专用的墨迹笔触 / 帛卷 / 音波环 / 盾印 / 圆月。
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
  /** 扇形：p0 半角(弧度)，p1 < 0.5 一次性刀气(p1 = 填充减淡量 0..0.49，0 = 原样，0.35 = 只剩三成填充) / 1 常驻指示器。朝向 = rot */
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
  /** 持续区域边界：一道外沿亮边 + 很淡的内向渐隐。p0 = 0 实线 / > 0 短划的段数 / < 0 弧形起伏的波数取负；p1 脉冲相位 */
  zone: 14,
  /**
   * 纹章细环(增益脚环 / 获得瞬间的展开环)：只画外圈一条细带，中心留空。
   * p0 = 纹样：0 六角霜纹，1 三焰纹，2 八芒星轨(带向外的细脉冲)，3 龙鳞纹；p1 = 一次性时的展开起始比例(0..1)。转角用 rot。
   */
  sigil: 15,
  /**
   * 扇形预警(野怪吐息等)：p0 半角(弧度)，p1 倒计时进度 0..1(由顶点向外推进)。
   * A 色只画边线与刻度(实线，琥珀)，B 色(under 的颜色)是随进度推进的填充(普通混合，0.18~0.28)。朝向 = rot。
   */
  coneWarn: 16,
  /**
   * 墨迹笔触(荆轲)：沿 rot 方向的一笔浓墨，起笔一顿、收笔出锋带飞白。radius = 半长，aspect = 半宽 / 半长。
   * 墨色用 under 的颜色(遮挡层，不发光)；A 色只画刚划过那一瞬的中线寒光。p0 = 行笔速度(0 = 立即全显)，p1 = 寒光强度。
   */
  ink: 17,
  /**
   * 帛卷(荆轲大招)：从起点朝 rot 方向铺开的一条长帛，前沿带一根卷轴。radius = 半长，aspect = 半宽 / 半长。
   * 帛面用 under 的颜色，A 色(取墨色)画卷面的淡墨纹与边线。p0 = 铺开所占的寿命比例，p1 = 纹样相位。
   */
  scroll: 18,
  /**
   * 音波环(王昭君)：p0 道同心细环(1~5)。一次性：p1 ≥ 0 由内向外依次荡开(p1 = 相邻两环错开的寿命比例，0 取 0.16)，
   * p1 < 0 由外向内依次收拢。常驻：0 ≤ p1 ≤ 1 = 由外向内逐环点亮的进度(1 = 全亮)，p1 = 2 = 循环外扩的涟漪。
   */
  rings: 19,
  /** 盾印(樊哙)：贴地的双弧盾轮廓，长轴沿 rot、盾顶朝前。一次性的会「砸下」并迅速冷却。p0 = 盾鼻与竖带的强度，p1 = 额外亮度 */
  shieldMark: 20,
  /** 圆月(王昭君)：月白的柔光圆盘(带月海斑驳) + 外圈月晕细环。p0 = 月盘占半径的比例(0 取 0.72)，p1 = 月晕强度 */
  moon: 21,
} as const;

/** 各画质的贴花填充倍率：low 档没有 bloom 衬托边线，大面积色块更容易糊住单位，统一压到六成 */
export const DECAL_FILL: Record<string, number> = { low: 0.6, medium: 0.9, high: 1 };

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
uniform float uFill;
uniform float uXray;
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
// Voronoi：返回 (到最近特征点的距离, F2 - F1)。后者在细胞边界处为 0，用来画龟裂
vec2 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 rr = g + hash22(n + g) - f;
      float d = dot(rr, rr);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  f1 = sqrt(f1);
  return vec2(f1, sqrt(f2) - f1);
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
  // 四个输出量：
  //   fil = A 色「色块」的覆盖率(普通混合：先盖住地面再显色，亮地面上颜色才饱和)
  //   e   = A 色发光线条(叠加，可溢出 bloom)，hot = 线条里的白热部分
  //   cov = B 色深色底衬的覆盖率(线条两侧的暗晕、焦痕)
  float fil = 0.0;
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
    float halo = band(d + 0.014, 0.07, 0.035);
    float fade = 1.0 - smoothstep(0.3, 1.0, t);
    fil = body * 0.55 * fade;
    e = rim * 1.4 * fade;
    hot = rim * 0.4 * fade;
    cov = halo * 0.85 * fade;
  } else if (type < 1.5) {
    // ── 柔光斑 ──
    float g = pow(max(0.0, 1.0 - r), max(p0, 0.5));
    float f = persist > 0.5 ? 1.0 : smoothstep(0.0, 0.08, t) * (1.0 - t) * (1.0 - t);
    fil = g * f * 0.5;
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
      float fill = (0.3 + 0.7 * r * r) * swept * burn * (1.0 - p1 * 2.0);
      float edge = max(band(da + 0.012, 0.014, aa), band(r - 0.975, 0.02, aa)) * swept;
      float fade = 1.0 - smoothstep(0.6, 1.0, t);
      fil = fill * 0.5 * inside * fade;
      e = (lead * 1.4 + edge * 1.3 * (0.35 + 0.65 * burn) + fill * 0.25) * inside * fade;
      hot = (lead * 0.6 + edge * 0.25 * burn) * inside * fade;
      cov = (edge * 0.7 + swept * 0.35) * inside * fade;
    } else {
      float edge = max(band(da + 0.012, 0.012, aa), band(r - 0.98, 0.016, aa));
      float flow = band(fract(r * 3.0 - now * 0.9) - 0.5, 0.05, 0.05) * 0.5 * smoothstep(0.15, 0.45, r);
      float apex = smoothstep(0.03, 0.22, r);
      fil = (0.2 + 0.3 * r * r) * inside * apex;
      e = (edge * 1.25 + flow) * inside * apex;
      hot = edge * 0.15 * inside * apex;
      cov = (0.25 + edge * 0.5) * inside * apex;
    }
  } else if (type < 3.5) {
    // ── 地裂：龟裂的碎块(Voronoi 边) + 几条放射的锯齿主裂缝，由中心向外迅速蔓延，结束时噪声溶解 ──
    float grow = min(1.0, t * 6.0 + 0.12);
    vec2 q = wp * 0.8 + seed * 13.0;
    q += (vec2(vnoise(wp * 1.7 + seed * 3.0), vnoise(wp * 1.7 + seed * 3.0 + 9.1)) - 0.5) * 0.45;
    vec2 vo = voronoi(q);
    float n1 = vnoise(wp * 2.1 + seed * 5.0);
    float n2 = vnoise(wp * 2.1 + seed * 5.0 + vec2(5.2, 1.3));
    // 中心粗、外缘细；越往外碎块越稀
    float w = mix(0.1, 0.02, smoothstep(0.0, 0.9, r));
    float sparse = 1.0 - smoothstep(0.45, 1.0, r + (n1 - 0.5) * 0.5);
    float lineA = (1.0 - smoothstep(w * 0.4, w, vo.y)) * sparse;
    float wideA = (1.0 - smoothstep(w, w * 2.8, vo.y)) * sparse;
    float kk = 2.0 + floor(seed * 2.99);
    float jag = (vnoise(vec2(r * 8.0, seed * 7.0)) - 0.5) * 0.55 + (vnoise(vec2(r * 21.0, seed * 3.0)) - 0.5) * 0.22;
    float sp = abs(sin((ang + jag + seed * 6.0) * kk));
    float hw = mix(0.04, 0.007, r) * kk / max(r, 0.06);
    float lineB = 1.0 - smoothstep(hw * 0.5, hw, sp);
    float wideB = 1.0 - smoothstep(hw, hw * 2.8, sp);
    float crack = max(lineA, lineB);
    float mask = (1.0 - smoothstep(grow - 0.3, grow, r)) * (1.0 - smoothstep(0.84, 1.0, r + (n1 - 0.5) * 0.25));
    float gone = 1.0 - smoothstep(0.72, 1.0, t + (n2 - 0.5) * 0.3);
    float heat = 1.0 - t;
    heat = 0.3 + heat * heat * 1.5 + p1;
    float flicker = 0.85 + 0.15 * sin(now * 7.0 + n1 * 30.0);
    e = crack * mask * heat * gone * flicker;
    hot = crack * mask * (1.0 - smoothstep(0.0, 0.2, t)) * 0.9;
    cov = (max(wideA, wideB) * 0.6 + (1.0 - r) * 0.15) * mask * gone;
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
    float inside = 1.0 - smoothstep(0.975, 1.0, rs);
    fil = ((1.0 - rs) * 0.06 + (1.0 - smoothstep(-0.02, 0.0, st)) * 0.07 + 0.02) * appear * inside;
    e = ln * appear * inside;
    hot = ln * 0.2 * appear * inside;
    cov = (min(ln, 1.0) * 0.75 + 0.06) * appear * inside;
  } else if (type < 5.5) {
    // ── 预警圈：亮边 + 由内向外的倒计时填充 ──
    float prog = clamp(p0, 0.0, 1.0);
    float urgent = smoothstep(0.65, 1.0, prog);
    float pulse = 0.7 + 0.3 * sin(now * 14.0);
    float edge = band(r - 0.962, 0.03, aa);
    float inner = 1.0 - smoothstep(prog - aa, prog + aa, r);
    float lead = band(r - prog + 0.012, 0.016, aa) * step(0.03, prog) * (1.0 - step(0.985, prog));
    float ticks = band(fract(ang / TAU * 16.0) - 0.5, 0.07, 0.03) * band(r - 0.9, 0.035, aa);
    // §7.1：边线实(0.9)、填充淡(0.18~0.28)，倒计时由内向外推进，快到点时边线加速闪
    fil = (0.07 + inner * (0.12 + 0.05 * r + 0.06 * urgent * pulse)) * disc;
    e = (edge * (1.1 + 0.45 * pulse * urgent) + lead * 0.85 + ticks * 0.5) * disc;
    hot = (edge * 0.18 + lead * 0.25) * disc;
    cov = (0.1 + edge * 0.6) * disc;
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
    float chev = band(fract((px - py * 0.9) * 0.5 - now * 1.5) - 0.5, 0.09, 0.07) * 0.5;
    float start = smoothstep(0.0, min(1.4, L * 0.5), px + L);
    fil = (0.2 + 0.3 * along * along) * inside * start;
    e = (edge * 1.2 + chev) * inside * start;
    hot = edge * 0.12 * inside * start;
    cov = (0.25 + edge * 0.5) * inside * start;
  } else if (type < 7.5) {
    // ── 细圈(射程 / 塔的攻击范围) ──
    float th = max(p0, 0.004);
    float ln = band(r - (1.0 - th * 1.5), th, aa);
    float dash = p1 > 0.5 ? 1.0 - smoothstep(0.3, 0.34, abs(fract(ang / TAU * p1 + now * 0.03) - 0.5)) : 1.0;
    float halo = smoothstep(0.72, 1.0, r) * disc;
    fil = halo * 0.16;
    e = ln * dash;
    hot = ln * dash * 0.1;
    cov = band(r - (1.0 - th * 1.5), th * 3.0, aa * 2.0) * dash * 0.7 + halo * 0.12;
  } else if (type < 8.5) {
    // ── 锁定圈 ──
    float a2 = ang + now * 1.6;
    float seg = abs(fract(a2 / TAU * 4.0) - 0.5);
    float pulse = 0.82 + 0.18 * sin(now * 6.0);
    float brack = band(r - 0.88, 0.065, aa) * (1.0 - smoothstep(0.2, 0.24, seg));
    float tw = clamp((r - 0.52) / 0.26, 0.0, 1.0) * 0.1;
    float tri = (1.0 - smoothstep(tw - 0.012, tw + 0.012, seg)) * step(0.52, r) * (1.0 - smoothstep(0.78 - aa, 0.78 + aa, r));
    float inner = band(r - 0.6, 0.012, aa) * 0.5;
    fil = (brack + tri) * 0.8 * pulse;
    e = (brack * 0.6 + tri * 0.5 + inner) * pulse;
    hot = brack * 0.2;
    cov = (band(r - 0.88, 0.11, aa) * (1.0 - smoothstep(0.22, 0.27, seg)) + tri) * 0.6;
  } else if (type < 9.5) {
    // ── 旋涡 ──
    float arms = max(1.0, p0);
    float appear = persist > 0.5 ? 1.0 : smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.55, 1.0, t));
    float dirS = p1 >= 0.0 ? 1.0 : -1.0;
    float s = fract(ang / TAU * arms + r * p1 - now * 0.9 * dirS);
    float nz = fbm(vec2(ang * 2.0 + now * dirS, r * 5.0 - now * 1.3) + seed * 5.0);
    float arm = s * s * (1.0 - smoothstep(0.9, 1.0, s));
    float env = smoothstep(0.06, 0.35, r) * (1.0 - smoothstep(0.72, 1.0, r));
    fil = arm * env * (0.14 + 0.18 * nz) * appear;
    e = arm * arm * arm * env * 0.75 * appear;
    hot = arm * arm * arm * arm * env * 0.25 * appear;
    cov = arm * env * 0.22 * appear;
  } else if (type < 10.5) {
    // ── 焦痕 ──
    float n = fbm(wp * 1.7 + seed * 9.0);
    float blob = 1.0 - smoothstep(0.42, 0.95, r + (n - 0.5) * 0.6);
    float f = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.5, 1.0, t));
    cov = blob * 0.5 * f;
    if (p0 > 0.5) {
      // 湿痕上的细碎光点：哈希格子里的小亮点，各自明灭
      vec2 gq = wp * 5.0 + seed * 11.0;
      vec2 gi = floor(gq);
      vec2 gf = fract(gq) - 0.5 - (hash22(gi) - 0.5) * 0.6;
      float hs = hash12(gi + 7.0);
      float spk = (1.0 - smoothstep(0.03, 0.09, length(gf))) * step(0.55, hs);
      e = spk * blob * (1.0 - smoothstep(0.2, 1.0, t)) * (0.5 + 0.5 * sin(now * 6.0 + hs * 40.0)) * 1.6;
      hot = e * 0.3;
    } else {
      float vein = 1.0 - smoothstep(0.0, 0.07, abs(vnoise(wp * 3.1 + seed * 5.0) - vnoise(wp * 3.1 + seed * 5.0 + 3.7)));
      e = vein * blob * (1.0 - smoothstep(0.0, 0.65, t)) * (0.6 + 0.4 * sin(now * 5.0 + n * 20.0));
    }
  } else if (type < 11.5) {
    // ── 星印 ──
    float n = max(3.0, p0);
    float pop = 1.0 - pow(1.0 - min(1.0, t * 5.0), 3.0);
    float sc = persist > 0.5 ? 1.0 : mix(0.25, 1.0, pop);
    float st = sdStar(p / sc, 0.9, n, p1 > 0.0 ? p1 : 2.6) * sc;
    float outline = 1.0 - smoothstep(0.014, 0.014 + aa * 1.5, abs(st));
    float fill = 1.0 - smoothstep(-0.015, 0.0, st);
    float fade = persist > 0.5 ? 1.0 : 1.0 - smoothstep(0.25, 1.0, t);
    fil = fill * (0.35 + 0.4 * (1.0 - t)) * fade;
    e = outline * 1.3 * fade;
    hot = outline * 0.3 * fade;
    cov = (fill * 0.4 + outline * 0.5) * fade;
  } else if (type < 12.5) {
    // ── 斩痕 / 流光 ──
    float x = p.x;
    float taper = sqrt(max(0.0, 1.0 - x * x));
    float w = max(0.03, taper);
    float prof = exp(-(p.y * p.y) / (w * w) * 4.5);
    float sweep = p1 > 0.0 ? 1.0 - smoothstep(-0.2, 0.1, x + 1.0 - 2.3 * min(1.0, t * p1)) : 1.0;
    float n = p0 > 0.0 ? mix(1.0, fbm(vec2(x * vW.z * 1.4 - now * 2.2, p.y * 2.0) + seed * 5.0) * 1.7, p0) : 1.0;
    float fade = (1.0 - t) * (1.0 - t);
    fil = min(1.0, prof * taper * sweep * n) * fade * 0.85;
    e = pow(prof, 5.0) * taper * sweep * fade * 1.1;
    hot = pow(prof, 9.0) * taper * sweep * fade * 0.7;
    cov = pow(prof, 0.6) * taper * sweep * fade * 0.6;
  } else if (type < 13.5) {
    // ── 脚下指向环 ──
    float ring = band(r - 0.6, 0.022, aa);
    float ty = abs(p.y);
    float tri = (1.0 - smoothstep(-aa, aa, ty - (0.99 - p.x) * 0.62)) * smoothstep(0.7 - aa, 0.7 + aa, p.x);
    float breath = 0.85 + 0.15 * sin(now * 3.0);
    fil = tri * 0.8 * breath;
    e = (ring * 0.9 + tri * 0.5) * breath;
    hot = tri * 0.2;
    cov = (band(r - 0.6, 0.05, aa) + tri) * 0.45;
  } else if (type < 14.5) {
    // ── 持续区域边界 ──
    // 只有一道外沿边线(不再有内圈刻度环)。p0 > 0：边线断成 p0 段短划；p0 < 0：边线按 -p0 个波起伏成弧形(音波)
    float wav = p0 < -0.5 ? 0.014 * sin(ang * (-p0) + now * 1.6) : 0.0;
    float gapK = p0 > 0.5 ? 1.0 - smoothstep(0.26, 0.3, abs(fract(ang / TAU * p0 + now * 0.05) - 0.5)) : 1.0;
    float edge = band(r - 0.972 - wav, 0.022, aa) * gapK;
    float falloff = exp(-(1.0 - r) * 6.0) * disc;
    float pulse = 1.0 + 0.2 * sin(now * 4.0 + p1);
    // 沿边流动的亮段：静止的环读成「贴图」，流动的环才读成「正在生效」
    float flow = 0.75 + 0.25 * band(fract(ang / TAU * 3.0 - now * 0.35) - 0.5, 0.18, 0.12);
    fil = (falloff * 0.12 + 0.03) * disc;
    e = edge * 1.15 * pulse * flow;
    hot = edge * 0.15 * flow;
    cov = band(r - 0.972, 0.06, 0.03) * 0.7 + 0.05 * disc;
  } else if (type < 15.5) {
    // ── 纹章细环：外圈一条细带上的纹样，中心留空 ──
    float pat = floor(p0 + 0.5);
    float unfold = persist > 0.5 ? 1.0 : 1.0 - pow(1.0 - min(1.0, t * 3.0), 3.0);
    float sc = mix(clamp(p1, 0.05, 1.0), 1.0, unfold);
    vec2 ps = p / sc;
    float rs = r / sc;
    float fade = persist > 0.5 ? 1.0 : 1.0 - smoothstep(0.55, 1.0, t);
    float inside = 1.0 - smoothstep(0.985, 1.0, rs);
    float ln = band(rs - 0.955, 0.024, aa) + band(rs - 0.79, 0.013, aa) * 0.8;
    float motif = 0.0;
    if (pat < 0.5) {
      // 六角霜纹：六边形外框 + 每角一枚小冰晶(三道短划)
      float a6 = mod(ang + PI / 6.0, PI / 3.0) - PI / 6.0;
      float hexR = 0.88 * cos(PI / 6.0) / cos(a6);
      motif = band(rs - hexR, 0.016, aa);
      vec2 q = vec2(rs * cos(a6), rs * sin(a6)) - vec2(0.88, 0.0);
      float cr = length(q);
      float spokes = band(abs(sin(atan(q.y, q.x) * 3.0)), 0.22, 0.08) * (1.0 - smoothstep(0.08, 0.11, cr));
      motif = max(motif, spokes + (1.0 - smoothstep(0.02, 0.035, cr)));
    } else if (pat < 1.5) {
      // 三焰纹：三枚向外的火舌，火舌之间是短弧
      float a3 = mod(ang + PI / 3.0, 2.0 * PI / 3.0) - PI / 3.0;
      float x = rs - 0.8;
      float flame = band(a3 * (0.9 + x * 1.6), 0.1 * (1.0 - smoothstep(0.0, 0.2, x)) + 0.006, 0.02) * step(-0.05, x) * (1.0 - smoothstep(0.18, 0.21, x));
      motif = max(flame, band(rs - 0.88, 0.014, aa) * smoothstep(0.35, 0.55, abs(a3)));
    } else if (pat < 2.5) {
      // 八芒星轨：八枚尖角站在轨道上，长短相间；每 2 秒一道向外的细脉冲
      float a8 = mod(ang + PI / 8.0, PI / 4.0) - PI / 8.0;
      float k8 = mod(floor((ang + PI / 8.0) / (PI / 4.0)), 2.0);
      float len = k8 > 0.5 ? 0.09 : 0.15;
      float x = rs - 0.88;
      motif = band(a8 * 6.0, 0.09 * (1.0 - smoothstep(0.0, len, abs(x))) + 0.005, 0.03) * (1.0 - smoothstep(len - 0.01, len, abs(x)));
      float pr = fract(now * 0.5 + seed);
      float pulseR = mix(0.82, 1.0, pr);
      ln += band(rs - pulseR, 0.008, aa) * (1.0 - pr) * 0.9;
    } else {
      // 龙鳞纹：两排错开的圆头鳞片
      float row = rs > 0.88 ? 1.0 : 0.0;
      float n = 22.0;
      float u = ang / TAU * n + row * 0.5;
      float fu = fract(u) - 0.5;
      float y = (rs - mix(0.83, 0.92, row)) / 0.06;
      float sd = length(vec2(fu * 1.3, y + fu * fu * 1.4)) - 0.48;
      motif = band(sd, 0.08, 0.05) * step(abs(y), 1.3);
    }
    ln += motif;
    fil = (motif * 0.15 + band(rs - 0.875, 0.085, 0.04) * 0.1) * fade * inside;
    e = ln * fade * inside;
    hot = ln * 0.18 * fade * inside;
    cov = (min(ln, 1.0) * 0.55) * fade * inside;
  } else if (type < 16.5) {
    // ── 扇形预警：A 色画实线边与刻度，B 色是由顶点向外推进的淡填充 ──
    float da = (abs(ang) - p0) * max(r, 0.05);
    float inside = (1.0 - smoothstep(-aa, aa, da)) * disc;
    // p1 < 0：一次性贴花按自身寿命推进(预警时长 = 贴花寿命)
    float prog = p1 < 0.0 ? t : clamp(p1, 0.0, 1.0);
    float urgent = smoothstep(0.7, 1.0, prog);
    float pulse = 0.75 + 0.25 * sin(now * 16.0);
    float edge = max(band(da + 0.014, 0.014, aa), band(r - 0.975, 0.018, aa));
    float lead = band(r - prog + 0.012, 0.014, aa) * step(0.03, prog) * (1.0 - step(0.985, prog));
    float ticks = band(fract(r * 6.0) - 0.5, 0.03, 0.03) * band(abs(ang) - p0 + 0.05, 0.03, 0.02);
    float inner = 1.0 - smoothstep(prog - aa, prog + aa, r);
    float apex = smoothstep(0.02, 0.12, r);
    e = (edge * (1.05 + 0.5 * pulse * urgent) + lead * 0.8 + ticks * 0.5) * inside * apex;
    hot = (edge * 0.15 + lead * 0.2) * inside * apex;
    cov = (0.05 + inner * (0.18 + 0.08 * urgent * pulse)) * inside * apex;
  } else if (type < 17.5) {
    // ── 墨迹笔触：起笔一顿(略粗) → 行笔 → 收笔渐细出锋；越到笔尾飞白越多。墨是遮挡层(B 色)，A 色只是中线上一闪而过的寒光 ──
    float u = p.x * 0.5 + 0.5;
    float wid = (0.7 + 0.22 * exp(-u * u * 40.0) + 0.07 * sin(u * 9.0 + seed * 20.0)) * (1.0 - smoothstep(0.5, 1.0, u) * 0.88);
    wid *= smoothstep(0.0, 0.03, u);
    float edgeN = fbm(vec2(p.x * vW.z * 1.3 + seed * 17.0, p.y * 3.0 + seed * 3.0)) - 0.5;
    float d = abs(p.y) - wid * (1.0 + edgeN * 0.4);
    float body = 1.0 - smoothstep(-0.07, 0.02, d);
    float dry = fbm(vec2(p.x * vW.z * 0.9 + seed * 5.0, p.y * vW.w * 26.0 + seed * 9.0));
    float th = 0.8 - 0.34 * u - 0.14 * abs(p.y) / max(wid, 0.05);
    float gaps = smoothstep(th, th + 0.18, dry);
    float sweep = p0 > 0.0 ? 1.0 - smoothstep(-0.08, 0.03, u - min(1.0, t * p0) * 1.12) : 1.0;
    float fade = 1.0 - smoothstep(0.5, 1.0, t + (dry - 0.5) * 0.3);
    cov = body * (1.0 - gaps * 0.9) * sweep * fade;
    float line = exp(-p.y * p.y * 260.0) * sweep * (1.0 - smoothstep(0.0, 0.3, t)) * smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.82, 1.0, u));
    e = line * p1;
    hot = line * p1 * 0.5;
  } else if (type < 18.5) {
    // ── 帛卷：帛面(B 色)由近及远铺开，前沿是一根卷轴；卷面上是 A 色(墨)的边线与几道山水细纹。寿命末尾由噪声溶解 ──
    float u = p.x * 0.5 + 0.5;
    float front = min(1.0, t / max(p0, 0.01));
    float ay = abs(p.y);
    float wob = 0.84 + 0.035 * sin(u * vW.z * 2.6 + seed * 20.0);
    // 近端不是一刀齐的直边：按噪声撕出毛边，再压一根轴头(与前沿那根卷轴成对)——整条读成「手卷」而不是一块木板
    float tear = vnoise(vec2(p.y * 5.0 + seed * 9.0, seed * 3.0)) * 0.035 / max(vW.z, 0.3);
    float nearCut = smoothstep(0.0, 0.012, u - tear);
    float farCut = 1.0 - smoothstep(front - 0.006, front + 0.006, u);
    float cloth = (1.0 - smoothstep(wob - 0.07, wob, ay)) * nearCut * farCut;
    float du = 0.07 / max(vW.z, 0.3);
    float roll = (1.0 - smoothstep(du * 0.55, du, abs(u - front + du * 0.4))) * (1.0 - smoothstep(0.93, 1.0, ay)) * step(0.02, front);
    float rod = (1.0 - smoothstep(du * 0.4, du * 0.75, abs(u - du * 0.55))) * (1.0 - smoothstep(0.93, 1.0, ay));
    float border = band(ay - (wob - 0.15), 0.04, 0.03);
    // 帛边外侧一圈淡墨的投影：帛铺在浅色石板上，靠它托出轮廓
    float shade = (1.0 - smoothstep(wob, 1.0, ay)) * smoothstep(wob - 0.05, wob, ay) * nearCut * farCut;
    // 帛面向两侧边缘压暗(中间亮、两边旧)：有一点卷曲的体积，不是平涂的一条
    float aged = smoothstep(wob - 0.5, wob - 0.05, ay) * 0.26;
    float xs = u * vW.z * 2.0;
    // 卷面的舆图：一道蜿蜒的河、疏密不等的山形折线、零星的墨点(城邑)
    float river = band(p.y - 0.3 * sin(xs * 1.5 + p1) - 0.1 * sin(xs * 3.7 + p1 * 2.3), 0.05, 0.05);
    float peak = abs(fract(xs * 0.55 + p1 * 0.3) - 0.5) * 2.0;
    float hills = band(p.y + 0.38 - peak * 0.22, 0.04, 0.04) * step(0.25, fract(xs * 0.275 + 0.13));
    float peak2 = abs(fract(xs * 0.9 + p1 * 0.7 + 0.31) - 0.5) * 2.0;
    float hills2 = band(p.y - 0.46 + peak2 * 0.16, 0.035, 0.035) * step(0.45, fract(xs * 0.3 + 0.61));
    float dots = smoothstep(0.8, 0.86, vnoise(vec2(xs * 3.1 + p1, p.y * 4.3 + seed * 11.0)));
    float dis = vnoise(wp * 3.0 + seed * 7.0);
    float fade = 1.0 - smoothstep(0.62, 1.0, t + (dis - 0.5) * 0.35);
    cov = cloth * 0.92 * fade;
    float inked = (river * 0.6 + hills * 0.55 + hills2 * 0.45 + dots * 0.5) * (1.0 - smoothstep(0.5, 0.66, ay));
    fil = max(max(max(max(border * 0.8, inked), aged) * cloth, max(roll, rod) * 0.9), shade * 0.5) * fade;
  } else if (type < 19.5) {
    // ── 音波环：若干道同心细环，带一点细微的颤动 ──
    float n = clamp(floor(p0 + 0.5), 1.0, 5.0);
    float lw = max(0.011, 0.028 / max(vW.z, 0.1));
    float ln = 0.0;
    float hal = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      if (fi >= n) break;
      float rr;
      float br;
      if (persist > 0.5) {
        if (p1 > 1.5) {
          float ph = fract(now * 0.22 + fi / n + seed);
          rr = mix(0.14, 0.97, ph);
          br = smoothstep(0.0, 0.2, ph) * (1.0 - smoothstep(0.6, 1.0, ph)) * 0.6;
        } else {
          rr = 0.965 - fi * 0.2;
          br = 0.16 + 0.84 * smoothstep(fi / n, (fi + 0.6) / n, p1);
        }
      } else {
        float stg = p1 >= 0.0 ? (p1 > 0.0 ? p1 : 0.16) : -p1;
        float tt = clamp((t - fi * stg) / max(1.0 - (n - 1.0) * stg, 0.05), 0.0, 1.0);
        float k = 1.0 - (1.0 - tt) * (1.0 - tt) * (1.0 - tt);
        rr = p1 >= 0.0 ? mix(0.1, 0.975, k) : mix(0.975, 0.08, k);
        br = step(0.001, tt) * (1.0 - smoothstep(0.45, 1.0, tt));
      }
      float dd = r - rr + lw * 0.5 * sin(ang * 22.0 + now * 26.0 + fi * 2.1);
      ln += band(dd, lw, aa) * br;
      hal += band(dd, lw * 4.5, lw * 2.5) * br;
    }
    e = ln * 1.2 * disc;
    hot = ln * 0.25 * disc;
    cov = hal * 0.5 * disc;
    fil = hal * 0.06 * disc;
  } else if (type < 20.5) {
    // ── 盾印：与樊哙漆盾同形的贴地轮廓(上缘两道圆弧、中间起尖；下缘两角上收；两侧微收腰) ──
    float pop = 1.0 - pow(1.0 - min(1.0, t * 7.0), 3.0);
    float sc = persist > 0.5 ? 1.0 : mix(1.22, 1.0, pop);
    vec2 q = p / sc;
    float ym = q.x / 1.72 + 0.5;
    float sa = abs(q.y) / 0.533;
    float hwm = 0.93 + 0.07 * cos(ym * TAU);
    float topm = 0.897 + (0.1 - 0.75 * (sa - 0.45) * (sa - 0.45) + 0.2 * exp(-sa * sa * 90.0)) / 1.45;
    float botm = 0.031 + (-0.045 + 0.185 * sa * sa * sa) / 1.45;
    float d = max((sa - hwm) * 0.533, max(ym - topm, botm - ym) * 1.72);
    float ad = fwidth(d) * 1.2 + 1e-4;
    float inside = 1.0 - smoothstep(-ad, ad, d);
    float outline = band(d + 0.045, 0.042, ad);
    float inner = band(d + 0.16, 0.014, ad);
    float bq = length(q);
    float boss = band(bq - 0.15, 0.016, ad) + (1.0 - smoothstep(0.05, 0.07, bq));
    float stripe = band(abs(q.y) - 0.085, 0.011, ad) * inside * step(0.19, bq) * (1.0 - smoothstep(-0.2, -0.12, d));
    float heat = persist > 0.5 ? 0.0 : 1.0 - smoothstep(0.0, 0.25, t);
    float fade = persist > 0.5 ? 1.0 : 1.0 - smoothstep(0.5, 1.0, t + (vnoise(wp * 2.0 + seed * 7.0) - 0.5) * 0.3);
    float ln = outline + inner * 0.6 + (boss + stripe * 0.7) * p0;
    e = ln * (0.75 + p1 + heat * 0.8) * fade;
    hot = outline * heat * 0.8 * fade;
    fil = inside * (0.08 + heat * 0.25) * fade;
    cov = (inside * 0.32 + outline * 0.6) * fade;
  } else {
    // ── 圆月：月盘 + 月缘亮线 + 月晕 ──
    float mr = p0 > 0.0 ? p0 : 0.72;
    float appear = persist > 0.5 ? 1.0 : smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.6, 1.0, t));
    float discM = 1.0 - smoothstep(mr - 0.05, mr, r);
    float mare = fbm(p * 2.6 + seed * 9.0);
    float body = discM * (0.6 + 0.4 * smoothstep(0.35, 0.7, mare)) * (0.8 + 0.2 * (1.0 - r / mr));
    float limb = band(r - (mr - 0.03), 0.02, aa);
    float halo = band(r - 0.95, 0.012, aa) * p1 + exp(-(r - mr) * 9.0) * step(mr, r) * 0.22 * disc;
    fil = body * 0.78 * appear;
    e = (limb * 0.55 + halo * 0.6 + body * 0.2) * appear;
    hot = limb * 0.1 * appear;
    cov = discM * 0.15 * appear;
  }

  float alpha = vC0.a * uAlpha;
  float m = max(vC0.r, max(vC0.g, vC0.b));
  vec3 hue = vC0.rgb / max(m, 1e-3);
  // 被挡住的部分(透视通道)只补画线条：站在预警圈里的单位身上不再蒙一层色块
  if (uXray > 0.5) {
    fil = 0.0;
    cov *= 0.0;
  }
  fil *= uFill;
  cov *= mix(1.0, uFill, 0.6);
  // 发光线条(叠加)。§7.1：线条与边缘 ≤1.6，超过的部分平滑压回
  vec3 em = (vC0.rgb * (e + hot * 0.6) + vec3(hot * m * 0.25)) * alpha;
  float emM = max(em.r, max(em.g, em.b));
  if (emM > 1.2) em *= (1.2 + (emM - 1.2) / (1.0 + (emM - 1.2) / 0.45)) / emM;
  // 色块：亮度取 A 色亮度的一部分(大面积 ≤0.9)，保持色相饱和
  float cf = clamp(fil, 0.0, 0.92) * min(alpha, 1.0) * step(1e-3, m);
  vec3 fillCol = hue * min(m * 0.55, 0.9);
  // 底衬：参数 0 = 不要底衬；其余按 0.25 + 1.3k 放大。带一点 A 色色相，深色不发灰
  float cd = vC1.a > 0.0 ? clamp(cov * (0.25 + vC1.a * 1.3), 0.0, 0.95) * min(alpha, 1.0) : 0.0;
  vec3 dark = vC1.rgb + hue * 0.12 * step(1e-3, m);
  // 先铺底衬，再在上面盖色块
  vec3 baseCol = dark * cd * (1.0 - cf) + fillCol * cf;
  float c = 1.0 - (1.0 - cd) * (1.0 - cf);
  if (c + em.r + em.g + em.b < 0.004) discard;
  #ifdef TONE_MAPPING
  // 直出屏幕(low 档)：底色与发光分别映射后再合成，半透明边缘不出亮边
  gl_FragColor = vec4(baseCol / max(c, 1e-3), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 baseMapped = gl_FragColor.rgb;
  gl_FragColor = vec4(kitAdditive(em), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(baseMapped * c + gl_FragColor.rgb, c);
  #else
  gl_FragColor = vec4(baseCol + em, c);
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
  /** 两个材质共用的填充倍率(随画质) */
  private fill = { value: 1 };

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
        uniforms: { uNow, uXray: { value: xray ? 1 : 0 }, uAlpha: { value: xray ? 0.5 : 1 }, uFill: this.fill },
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

  /** 画质切换：大面积填充按 DECAL_FILL 缩放 */
  setFill(k: number): void {
    this.fill.value = k;
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

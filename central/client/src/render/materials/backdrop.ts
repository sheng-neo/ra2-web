/**
 * 远景材质（ATMOSPHERE 自有，不再借用建筑材质的 Hill 模式）：山林冠层、远处平地（街灯网格漫光）、
 * 盒子楼墙面（住宅小窗暖冷混合 / 写字楼中性白大窗，远处按 2^L 合并窗格、平均亮度不变）、屋顶、静态 LED 外墙、海堤。
 * 契约：线性 HDR、cityAmbient 环境光、applyHaze（发光项只吃一半雾）、GLSL_FINISH。
 */
import { Color, ShaderMaterial } from 'three';
import { GLSL_HASH } from './common';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, LIGHT_HEX, lightColour, sharedUniforms } from './lighting';

const vertexShader = /* glsl */ `
attribute vec2 aUv;
attribute vec4 aInfo;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
flat varying vec4 vInfo;
void main() {
  vUv = aUv;
  vInfo = aInfo;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
${GLSL_HASH}
uniform vec3 uHomeWarm;
uniform vec3 uHomeCool;
uniform vec3 uOffice;
uniform vec3 uOfficeWarm;
uniform vec3 uLedWhite;
uniform vec3 uLedGold;
uniform vec3 uLedBlue;
uniform vec3 uSodium;
uniform vec3 uStreetLed;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
flat varying vec4 vInfo;

// 亮灯率随钟点（相对 20:00 的倍数）：写字楼傍晚高、夜深快速下降；住宅 21–22 点最高
float clockScale(bool office) {
  float t = uClock;
  if (office) return t < 19.0 ? 1.55 : (t < 20.0 ? mix(1.52, 1.0, t - 19.0) : (t < 21.0 ? mix(1.0, 0.66, t - 20.0) : (t < 23.0 ? mix(0.66, 0.32, (t - 21.0) * 0.5) : mix(0.32, 0.21, clamp((t - 23.0) * 0.5, 0.0, 1.0)))));
  return t < 20.0 ? mix(0.79, 1.0, clamp(t - 19.0, 0.0, 1.0)) : (t < 21.0 ? mix(1.0, 1.14, t - 20.0) : (t < 23.0 ? mix(1.14, 0.86, (t - 21.0) * 0.5) : mix(0.86, 0.36, clamp((t - 23.0) * 0.5, 0.0, 1.0))));
}

float pulse(float x, float c, float hw, float aa) {
  return 1.0 - smoothstep(hw - aa, hw + aa, abs(x - c));
}

// 窗格（远处按 2^L 合并，各轴分别合并，合并格整格亮 / 不亮、亮度 = 单窗亮度 × 窗面积比，平均不变）。
// 斜看墙面时横向压缩得厉害，只在横向合并，竖向仍按楼层，远处才是细密的点而不是大色块。
vec3 windows(vec2 uv, vec2 cellM, vec2 frac, float lit, float seed, bool office, vec3 cWarm, vec3 cCool, float warmP) {
  vec2 g = uv / cellM;
  vec2 fw = fwidth(g);
  vec2 L = clamp(floor(log2(max(fw * 1.2, vec2(1e-4)))) + 1.0, vec2(0.0), vec2(6.0));
  vec2 s = exp2(L);
  vec2 sg = g / s;
  vec2 cell = floor(sg);
  vec2 f = fract(sg);
  bool merged = L.x + L.y > 0.5;
  // 写字楼：按（楼层，租户段）成片亮；住宅：按（楼层，单位 = 3 窗）
  float runLen = office ? 6.0 + floor(hash12(vec2(seed * 91.0, 3.0)) * 18.0) : 3.0;
  vec2 key = merged ? cell + L * 57.0 : vec2(floor(cell.x / runLen), cell.y);
  float h = hash12(key + vec2(seed * 173.0, 0.0));
  float on = step(h, lit);
  float tint = hash12(key * 1.37 + seed * 11.0);
  vec3 c = tint < warmP ? cWarm : cCool;
  float bright = 0.75 + 0.5 * hash12(key * 2.3 + 5.0);
  if (merged) {
    // 整合时改：合并格里有 N 扇窗，亮着的比例围绕 lit 抖动，幅度按 N^−1/4 收敛（比二项分布的 N^−1/2 慢：
    // 照片里亮窗是会过曝的小亮点，远处仍看得出颗粒），颜色与亮度也向平均收敛；
    // 原来整格只取亮 / 不亮，远处九龙与两翼成了逐像素的椒盐噪点（手机尺寸尤甚）
    float N = s.x * s.y;
    float k = inversesqrt(sqrt(N));
    float lp = clamp(lit, 0.0, 1.0);
    on = clamp(lp + (h * 2.0 - 1.0) * sqrt(3.0 * lp * (1.0 - lp)) * k, 0.0, 1.0);
    c = mix(mix(cCool, cWarm, warmP), c, k);
    bright = mix(1.0, bright, k);
  }
  float mx = L.x > 0.5 ? frac.x : pulse(f.x, 0.5, frac.x * 0.5, fw.x);
  float my = L.y > 0.5 ? frac.y : pulse(f.y, 0.55, frac.y * 0.5, fw.y);
  float m = mx * my;
  // 写字楼：天花一侧更亮
  if (office && L.y < 0.5) m *= 0.75 + 0.5 * smoothstep(0.3, 0.8, f.y);
  return c * on * bright * m;
}

void main() {
  float kind = floor(vInfo.x + 0.5);
  float seed = vInfo.y;
  float lit = vInfo.z;
  float warmth = vInfo.w;
  vec3 n = normalize(vNormalW);
  vec3 surface = vec3(0.0);
  vec3 emit = vec3(0.0);

  if (kind < 0.5) {
    // 山林：近黑橄榄色，3–8 m 的树冠团块（像素比团块大时退成平均，远处不闪），沟谷更暗。
    // 山顶、半山一带（200–480 mPD）满是山路与屋苑：树冠顶被路灯从下方 / 侧面照出零星的暖色团块
    // （照片 05 左下角），不再是一整块平涂的黑面
    vec2 fw2 = fwidth(vUv);
    float pxm = max(fw2.x, fw2.y);
    float lump = mix(vnoise(vUv * 0.28), 0.5, smoothstep(1.0, 4.0, pxm)) * 0.55 + mix(vnoise(vUv * 0.09), 0.5, smoothstep(4.0, 12.0, pxm)) * 0.45;
    float clump = vnoise(vUv * 0.05);
    vec3 alb = vec3(0.016, 0.017, 0.011) * (0.35 + 1.3 * lump) * (0.7 + 0.6 * clump);
    surface = alb * cityAmbient(n, 150.0, 0.6);
    float peakZone = smoothstep(200.0, 300.0, vWorld.y) * (1.0 - smoothstep(470.0, 520.0, vWorld.y));
    float pool = smoothstep(0.55, 0.85, vnoise(vUv * 0.012 + 3.7)) * smoothstep(0.45, 0.8, lump);
    surface += alb * mix(uSodium, uStreetLed, 0.3) * (1.6 * pool * peakZone);
  } else if (kind < 1.5) {
    // 远处平地：暗地面 + 街道网格（约 110 m 一条，略斜）的路灯漫光；远处平均成均匀的暖光
    vec2 p = vUv;
    float r = -0.22;
    vec2 q = vec2(p.x * cos(r) - p.y * sin(r), p.x * sin(r) + p.y * cos(r)) / 110.0;
    vec2 fq = fwidth(q);
    float aa = max(fq.x, fq.y);
    float road = max(pulse(fract(q.x), 0.5, 0.07, fq.x), pulse(fract(q.y), 0.5, 0.07, fq.y));
    road = mix(road, 0.26, smoothstep(0.05, 0.25, aa));
    float warmMix = vnoise(p * 0.004);
    vec3 lampC = mix(uStreetLed, uSodium, smoothstep(0.35, 0.75, warmMix));
    surface = vec3(0.05, 0.048, 0.045) * cityAmbient(n, 0.0, 0.5);
    emit = lampC * (0.012 + road * 0.07) * (0.6 + 0.8 * vnoise(p * 0.02));
  } else if (kind < 3.5) {
    bool office = kind > 2.5;
    float v = vUv.y;
    // 复审后：楼身再暗一半、亮窗少三成但更亮（照片 05：九龙是一片亮点，楼身几乎看不见，不是灰色的颗粒地毯）
    if (office) {
      vec3 glass = mix(vec3(0.020, 0.024, 0.030), vec3(0.021, 0.027, 0.026), step(0.5, seed)) * 0.5;
      surface = glass * cityAmbient(n, v, warmth);
      emit = windows(vUv, vec2(1.5, 4.0), vec2(0.82, 0.62), lit * clockScale(true) * 0.7, seed, true, uOfficeWarm, uOffice, 0.12) * 0.68;
    } else {
      vec3 tile = mix(vec3(0.16, 0.145, 0.12), vec3(0.13, 0.13, 0.125), seed) * 0.5;
      surface = tile * cityAmbient(n, v, warmth);
      emit = windows(vUv, vec2(3.3, 2.9), vec2(0.42, 0.46), lit * clockScale(false) * 0.7, seed, false, uHomeWarm, uHomeCool, 0.6) * 0.45;
    }
    // 楼底 0–8 m 铺面：暖光带
    float shop = (1.0 - smoothstep(6.0, 9.0, v)) * step(0.5, v);
    emit += mix(uOfficeWarm, uHomeWarm, warmth) * shop * 0.35 * step(0.35, hash12(vec2(floor(vUv.x / 6.0), seed * 7.0)));
  } else if (kind < 4.5) {
    // 屋顶：暗
    surface = vec3(0.03) * cityAmbient(n, 40.0, warmth);
  } else if (kind < 7.5) {
    // 静态 LED 外墙：逐层水平灯带（白 / 金 / 蓝），远看是一整片发光面
    vec3 c = kind < 5.5 ? uLedWhite : (kind < 6.5 ? uLedGold : uLedBlue);
    vec2 g = vec2(vUv.x / 2.0, vUv.y / 4.0);
    vec2 fw = fwidth(g);
    float band = mix(pulse(fract(g.y), 0.5, 0.18, fw.y), 0.36, smoothstep(0.2, 0.6, fw.y));
    surface = vec3(0.03) * cityAmbient(n, vUv.y, warmth);
    emit = c * band * 1.9;
  } else {
    // 海堤立面；顶部 1.5 m 是海旁步道 / 平台的连续亮带（照片 05、01：两岸最亮的一条是海旁），每 ~120 m 一段、
    // 两成段落暗（码头、工地），亮度 0.3–0.6、冷白与暖白相间
    surface = vec3(0.14, 0.13, 0.12) * cityAmbient(n, 0.0, 0.4);
    float seg = floor(vWorld.x / 120.0);
    float hs = hash12(vec2(seg, 4.7));
    float band = smoothstep(vInfo.z - 2.0, vInfo.z - 0.5, vUv.y) * step(0.2, hs);
    emit = mix(uStreetLed, uOfficeWarm, step(0.6, hs)) * band * (0.3 + 0.3 * hash12(vec2(seg, 9.1)));
  }
  vec3 col = applyHaze(surface, emit, vWorld);
  ${GLSL_FINISH}
}
`;

export function createBackdropMaterial(): ShaderMaterial {
  const c = (name: keyof typeof LIGHT_HEX) => ({ value: lightColour(name) });
  return new ShaderMaterial({
    uniforms: {
      ...sharedUniforms(),
      uHomeWarm: c('homeWarm'),
      uHomeCool: c('homeCool'),
      uOffice: c('officeNeutral'),
      uOfficeWarm: c('officeWarm'),
      uLedWhite: c('crownWhite'),
      uLedGold: c('crownGold'),
      uLedBlue: { value: new Color(LIGHT_HEX.ledBlue).lerp(new Color('#ffffff'), 0.25) },
      uSodium: c('sodium'),
      uStreetLed: c('ledWhite'),
    },
    vertexShader,
    fragmentShader,
  });
}

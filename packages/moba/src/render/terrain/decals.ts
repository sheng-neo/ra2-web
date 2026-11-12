/**
 * 贴地纹样(全部在片元着色器里用距离场程序绘制，任意分辨率都锐利，且能动)：
 *   0 塔座星纹铺装   1 水晶座大星盘   2 泉水法阵(发光水池)   3 小野怪营地残环
 *   4 增益野怪法阵(霜/焰)   5 史诗野怪大法阵(浮在水面)   6 柔光斑(水晶/灯笼果/瀑布脚下的光晕)
 * 所有纹样合并成一个网格、一个 draw call。预乘透明度混合：石材部分正常覆盖，发光部分叠加。
 */
import * as THREE from 'three';
import { GLSL_LIGHT_PARS_FRAGMENT, GLSL_LIGHT_PARS_VERTEX, GLSL_LIGHT_VERTEX_TAIL, GLSL_NOISE, SHARED, litUniforms } from '../materials';
import type { MonsterType } from '../../core/types';
import { CORE_PAD_RADIUS, type MapField, TOWER_PAD_RADIUS, WATER_LEVEL, campRadius } from './field';
import { type RGB, rgb } from './geo';

const VERTEX = /* glsl */ `
${GLSL_LIGHT_PARS_VERTEX}
attribute vec4 aParam;
attribute vec3 aColorA;
attribute vec3 aColorB;
varying vec2 vUv;
varying vec4 vParam;
varying vec3 vColorA;
varying vec3 vColorB;
varying vec3 vWorldPos;
varying vec3 vViewPosition;
void main() {
  vUv = uv;
  vParam = aParam;
  vColorA = aColorA;
  vColorB = aColorB;
  vec3 objectNormal = vec3(0.0, 1.0, 0.0);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  ${GLSL_LIGHT_VERTEX_TAIL}
}
`;

const FRAGMENT = /* glsl */ `
${GLSL_LIGHT_PARS_FRAGMENT}
${GLSL_NOISE}
uniform float uTime;
uniform float uBound;
varying vec2 vUv;
varying vec4 vParam;
varying vec3 vColorA;
varying vec3 vColorB;
varying vec3 vWorldPos;
varying vec3 vViewPosition;

const float TAU = 6.2831853;

float band(float x, float c, float w, float aa) {
  return 1.0 - smoothstep(w - aa, w + aa, abs(x - c));
}
// n 角星的有符号距离(iq)：m 越小角越尖
float sdStar(vec2 p, float r, float n, float m) {
  float an = 3.141593 / n;
  float en = 3.141593 / m;
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}
// 一圈符文：把圆环切成 n 格，每格里用哈希画几道短划
float runes(float r, float a, float r0, float w, float n, float seed, float aa) {
  float cell = floor(a / TAU * n);
  float fa = fract(a / TAU * n) - 0.5;
  float fr = (r - r0) / w;
  if (abs(fr) > 1.0) return 0.0;
  float h = hash12(vec2(cell, seed));
  float h2 = hash12(vec2(cell + 31.0, seed));
  float g = 0.0;
  g = max(g, (1.0 - smoothstep(0.08, 0.14, abs(fa - (h - 0.5) * 0.4))) * step(abs(fr), 0.8));
  g = max(g, (1.0 - smoothstep(0.1, 0.2, abs(fr - (h2 - 0.5) * 1.2))) * step(abs(fa), 0.3) * step(0.35, h));
  g = max(g, (1.0 - smoothstep(0.1, 0.2, abs(fr + (h - 0.5) * 1.0))) * step(abs(fa + 0.1), 0.22) * step(0.5, h2));
  return g * step(abs(fa), 0.4);
}
// 环形石板：返回 (明暗, 接缝蒙版)
vec2 stoneRings(float r, float a, float seed) {
  float ringI = r < 0.42 ? 0.0 : (r < 0.7 ? 1.0 : 2.0);
  float n = ringI < 0.5 ? 6.0 : (ringI < 1.5 ? 10.0 : 16.0);
  float aa = a + ringI * 0.37 + seed;
  float cell = floor(aa / TAU * n);
  float fa = abs(fract(aa / TAU * n) - 0.5);
  float tone = 0.86 + 0.26 * hash12(vec2(cell, ringI + seed * 7.0));
  float jointA = smoothstep(0.5, 0.5 - 0.035 / max(r, 0.08) / n * 6.0, fa);
  float jr = min(min(abs(r - 0.42), abs(r - 0.7)), abs(r - 0.965));
  float jointR = smoothstep(0.0, 0.014, jr);
  return vec2(tone, jointA * jointR);
}

void main() {
  float type = vParam.x;
  float seed = vParam.y;
  float t = uTime;
  vec2 p = vUv;
  float r = length(p);
  if (r > 1.0) discard;
  // 建筑/泉水的铺装不越过地图边界(界外是崖壁或下沉的台地)
  if (type < 2.5 && (abs(vWorldPos.x) > uBound || abs(vWorldPos.z) > uBound)) discard;
  float a = atan(p.y, p.x) + 3.141593;
  float aa = fwidth(r) * 1.3 + 1e-4;
  vec3 paint = vec3(0.0);
  float alpha = 0.0;
  vec3 glow = vec3(0.0);
  // ln：发光线条的强度累加。最后既作为彩色镶嵌(亮底上也看得清)，又作为自发光
  float ln = 0.0;
  float nz = vnoise(vWorldPos.xz * 2.3 + seed);
  float nz2 = vnoise(vWorldPos.xz * 7.1 + seed * 3.0);

  if (type < 0.5) {
    // ── 塔座：三环石板 + 八角金星 + 队伍色光环 ──
    vec2 sr = stoneRings(r, a, seed);
    paint = vColorB * sr.x * mix(0.62, 1.0, sr.y) * (0.92 + 0.16 * nz2);
    float st = sdStar(p, 0.4, 8.0, 3.2);
    float starLine = 1.0 - smoothstep(0.012, 0.012 + aa * 1.5, abs(st));
    paint = mix(paint, vec3(0.95, 0.72, 0.28), starLine * 0.9);
    paint = mix(paint, vColorB * 0.6, (1.0 - smoothstep(-0.02, 0.0, st)) * 0.35);
    alpha = 1.0 - smoothstep(0.95, 1.0, r + (nz - 0.5) * 0.07);
    float pulse = 0.7 + 0.3 * sin(t * 1.7 + seed * 5.0);
    ln += band(r, 0.83, 0.014, aa) * 2.2 * pulse;
    // 环上 8 颗菱形星钉
    float ca = (fract(a / TAU * 8.0) - 0.5) * TAU / 8.0 * 0.56;
    float dia = abs(ca) * 5.0 + abs(r - 0.56) * 6.0;
    ln += (1.0 - smoothstep(0.16, 0.22, dia)) * 1.8 * pulse;
  } else if (type < 1.5) {
    // ── 水晶座：大星盘 ──
    vec2 sr = stoneRings(r * 1.02, a, seed);
    paint = vColorB * sr.x * mix(0.6, 1.0, sr.y) * (0.92 + 0.16 * nz2);
    float st = sdStar(p, 0.66, 8.0, 2.6);
    float st2 = sdStar(vec2(p.x * 0.7071 - p.y * 0.7071, p.x * 0.7071 + p.y * 0.7071), 0.5, 8.0, 3.4);
    float line = max(1.0 - smoothstep(0.008, 0.008 + aa * 1.5, abs(st)), 1.0 - smoothstep(0.006, 0.006 + aa * 1.5, abs(st2)));
    paint = mix(paint, vec3(0.95, 0.72, 0.28), line * 0.92);
    paint = mix(paint, vColorB * 1.12, (1.0 - smoothstep(-0.01, 0.0, st)) * 0.5);
    alpha = 1.0 - smoothstep(0.96, 1.0, r + (nz - 0.5) * 0.04);
    float pulse = 0.75 + 0.25 * sin(t * 1.3);
    ln += band(r, 0.9, 0.008, aa) * 2.4;
    ln += band(r, 0.45, 0.006, aa) * 2.0 * pulse;
    ln += runes(r, a + t * 0.06, 0.805, 0.045, 28.0, seed, aa) * 1.9 * pulse;
    // 从中心向外流动的能量纹
    float rays = pow(abs(sin(a * 4.0)), 24.0) * smoothstep(0.42, 0.5, r) * (1.0 - smoothstep(0.6, 0.74, r));
    ln += rays * (0.6 + 0.6 * sin(r * 30.0 - t * 3.0)) * 1.4;
  } else if (type < 2.5) {
    // ── 泉水：石沿 + 发光水池 + 缓缓旋转的法阵 ──
    float rimM = smoothstep(0.86, 0.875, r);
    vec2 sr = stoneRings(0.99, a * 1.0, seed);
    vec3 rimCol = vColorB * sr.x * mix(0.6, 1.0, smoothstep(0.0, 0.02, abs(fract(a / TAU * 24.0) - 0.5) - 0.03)) * (0.9 + 0.2 * nz2);
    rimCol = mix(rimCol, vec3(0.95, 0.72, 0.28), band(r, 0.93, 0.008, aa));
    // 水池：极坐标流动噪声
    vec2 q = vec2(a * 3.0 / TAU * 2.0 + r * 2.0 - t * 0.12, r * 3.0 - t * 0.25);
    float sw = vnoise(q * 3.0) * 0.6 + vnoise(q * 7.0 + 3.0) * 0.4;
    vec3 pool = mix(vColorA * 0.22, vColorA * 0.6 + vec3(0.12), smoothstep(0.35, 0.8, sw));
    pool = mix(pool, vec3(0.9), smoothstep(0.8, 0.96, sw) * 0.35);
    paint = mix(pool, rimCol, rimM);
    alpha = (1.0 - smoothstep(0.985, 1.0, r)) * mix(0.9, 1.0, rimM);
    float inside = 1.0 - rimM;
    float pulse = 0.75 + 0.25 * sin(t * 1.5);
    glow += vColorA * inside * (0.5 + 0.5 * (1.0 - r)) * 0.22;
    ln += band(r, 0.62, 0.007, aa) * 2.2 * inside;
    ln += band(r, 0.3, 0.006, aa) * 2.0 * inside;
    ln += runes(r, a - t * 0.1, 0.46, 0.07, 14.0, seed, aa) * 2.0 * pulse * inside;
    float st = sdStar(vec2(p.x * cos(t * 0.1) - p.y * sin(t * 0.1), p.x * sin(t * 0.1) + p.y * cos(t * 0.1)), 0.24, 4.0, 2.6);
    ln += (1.0 - smoothstep(0.006, 0.006 + aa * 1.5, abs(st))) * 2.4 * inside;
    glow += vec3(1.0) * (1.0 - smoothstep(0.0, 0.2, r)) * 0.3 * pulse;
  } else if (type < 3.5) {
    // ── 小营地：风化的残环 ──
    float broken = smoothstep(0.42, 0.6, vnoise(vec2(a * 2.2, seed * 9.0)) * 0.7 + nz * 0.3);
    float ringM = band(r, 0.86, 0.075, aa * 2.0) * broken;
    float joint = smoothstep(0.02, 0.05, abs(fract(a / TAU * 18.0 + seed) - 0.5) - 0.02);
    paint = vColorB * (0.8 + 0.3 * hash12(vec2(floor(a / TAU * 18.0 + seed), seed))) * mix(0.6, 1.0, joint);
    alpha = ringM * 0.95;
    ln += runes(r, a, 0.66, 0.05, 16.0, seed, aa) * broken * 0.55 * (0.6 + 0.4 * sin(t * 1.1 + seed));
  } else if (type < 4.5) {
    // ── 增益营地：双环法阵 + 六芒；霜 = 冰晶地面，焰 = 焦土裂纹 ──
    float ember = step(0.5, vParam.w);
    float pulse = 0.7 + 0.3 * sin(t * 1.6 + seed * 3.0);
    float crack = vnoise(vWorldPos.xz * 1.9 + seed) - vnoise(vWorldPos.xz * 1.9 + seed + 4.7);
    float crackLine = 1.0 - smoothstep(0.0, 0.07, abs(crack));
    float patchM = (1.0 - smoothstep(0.55, 0.95, r + (nz - 0.5) * 0.3));
    vec3 scorched = vec3(0.09, 0.07, 0.07);
    vec3 frost = vec3(0.78, 0.9, 1.0) * (0.75 + 0.3 * nz2);
    paint = mix(frost, scorched, ember);
    alpha = patchM * mix(0.5 * smoothstep(0.35, 0.65, nz + (1.0 - r) * 0.3), 0.7, ember);
    ln += crackLine * patchM * mix(0.2, 1.2, ember) * pulse;
    ln += band(r, 0.9, 0.012, aa) * 2.0 * pulse;
    ln += band(r, 0.74, 0.007, aa) * 1.6;
    ln += runes(r, a + t * 0.08, 0.82, 0.05, 22.0, seed, aa) * 1.7 * pulse;
    float st = sdStar(p, 0.5, 6.0, 2.2);
    ln += (1.0 - smoothstep(0.007, 0.007 + aa * 1.5, abs(st))) * 1.5;
  } else if (type < 5.5) {
    // ── 史诗营地：浮在水面上的巨大法阵，缓慢转动 ──
    float colossus = step(0.5, vParam.w);
    float pulse = 0.65 + 0.35 * sin(t * 1.2 + seed);
    float ca = cos(t * 0.07);
    float sa = sin(t * 0.07);
    vec2 pr = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
    float st = sdStar(pr, 0.62, mix(6.0, 8.0, colossus), mix(2.0, 2.8, colossus));
    float st2 = sdStar(vec2(pr.x * ca + pr.y * sa, -pr.x * sa + pr.y * ca), 0.34, mix(3.0, 4.0, colossus), 2.0);
    ln += (1.0 - smoothstep(0.006, 0.006 + aa * 1.5, abs(st))) * 2.2;
    ln += (1.0 - smoothstep(0.005, 0.005 + aa * 1.5, abs(st2))) * 1.8 * pulse;
    ln += band(r, 0.93, 0.01, aa) * 2.4;
    ln += band(r, 0.86, 0.004, aa) * 1.6;
    ln += band(r, 0.7, 0.005, aa) * 1.6 * pulse;
    ln += runes(r, a - t * 0.05, 0.78, 0.045, 30.0, seed, aa) * 2.0 * pulse;
    ln += runes(r, a + t * 0.09, 0.2, 0.05, 9.0, seed + 3.0, aa) * 1.6;
    // 水面被法阵映亮
    glow += vColorA * (1.0 - smoothstep(0.2, 1.0, r)) * 0.16 * pulse;
    paint = vColorB;
    alpha = (1.0 - smoothstep(0.3, 1.0, r)) * 0.28;
  } else {
    // ── 柔光斑 ──
    float f = 1.0 - r;
    glow += vColorA * f * f * (0.8 + 0.2 * sin(t * 1.3 + seed * 6.0)) * vParam.w;
  }

  float lm = clamp(ln, 0.0, 1.0);
  paint = mix(paint, vColorA * 0.42, lm * 0.9);
  alpha = max(alpha, lm * 0.92);
  glow += vColorA * ln * 0.55;

  vec3 N = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float shadow = kitShadow();
  vec3 irr = kitAmbient(N) + kitSunColor() * max(dot(N, kitSunDir()), 0.0) * shadow + kitPointLights(N, -vViewPosition);
  // 先对「未预乘」的受光颜色做色调映射/色彩空间转换，再预乘并叠加发光：
  // 这样 low 档直出屏幕时半透明边缘不会出现亮边(HDR 路径下这两步是空操作，结果不变)
  gl_FragColor = vec4(paint * RECIPROCAL_PI * irr, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef TONE_MAPPING
  gl_FragColor.rgb = gl_FragColor.rgb * alpha + glow * 0.9;
  #else
  gl_FragColor.rgb = gl_FragColor.rgb * alpha + glow;
  #endif
  gl_FragColor.a = alpha;
}
`;

export interface DecalSpec {
  type: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  /** 发光色 / 石材色(线性) */
  colorA: RGB;
  colorB: RGB;
  seed?: number;
  /** 类型相关参数：4 → 0 霜 1 焰；5 → 0 鳞兽 1 巨灵；6 → 亮度 */
  w?: number;
}

const CAMP_COLORS: Record<MonsterType, { glow: number; stone: number }> = {
  mossback: { glow: 0xb8e07a, stone: 0xa9b0a4 },
  glimwing: { glow: 0x7fe8e0, stone: 0xa4b0b4 },
  frost_golem: { glow: 0x7fd4ff, stone: 0xb9d3e8 },
  ember_golem: { glow: 0xff7a2c, stone: 0x5a4640 },
  abyss_drake: { glow: 0xa878ff, stone: 0x241848 },
  star_colossus: { glow: 0xffd070, stone: 0x4a3a18 },
};

/** 由地图数据生成全部固定纹样的规格 */
export function mapDecals(field: MapField): DecalSpec[] {
  const map = field.map;
  const out: DecalSpec[] = [];
  const teamCols = [
    { glow: rgb(0x2f8fff), stone: rgb(0xc6cfe0) },
    { glow: rgb(0xff4a2c), stone: rgb(0x5a4c55) },
  ];
  map.towers.forEach((t, i) => {
    const c = teamCols[t.team];
    out.push({ type: 0, x: t.pos.x, y: 0.02, z: t.pos.y, radius: TOWER_PAD_RADIUS, colorA: c.glow, colorB: c.stone, seed: i * 0.37 });
  });
  for (const b of map.bases) {
    const c = teamCols[b.team];
    out.push({ type: 1, x: b.core.x, y: 0.02, z: b.core.y, radius: CORE_PAD_RADIUS, colorA: c.glow, colorB: c.stone, seed: b.team });
    out.push({ type: 2, x: b.fountain.x, y: 0.03, z: b.fountain.y, radius: b.fountainRadius, colorA: c.glow, colorB: c.stone, seed: b.team + 0.5 });
  }
  for (const c of map.camps) {
    const col = CAMP_COLORS[c.monsterType];
    const R = campRadius(c.monsterType);
    const epic = c.monsterType === 'abyss_drake' || c.monsterType === 'star_colossus';
    const buff = c.monsterType === 'frost_golem' || c.monsterType === 'ember_golem';
    out.push({
      type: epic ? 5 : buff ? 4 : 3,
      x: c.pos.x,
      y: epic ? WATER_LEVEL + 0.035 : 0.02,
      z: c.pos.y,
      radius: R,
      colorA: rgb(col.glow),
      colorB: rgb(col.stone),
      seed: c.id * 0.61,
      w: c.monsterType === 'ember_golem' || c.monsterType === 'star_colossus' ? 1 : 0,
    });
  }
  return out;
}

export function createDecals(specs: DecalSpec[], bound: number): THREE.Mesh {
  const n = specs.length;
  const pos = new Float32Array(n * 12);
  const uv = new Float32Array(n * 8);
  const param = new Float32Array(n * 16);
  const colA = new Float32Array(n * 12);
  const colB = new Float32Array(n * 12);
  const idx: number[] = [];
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  specs.forEach((s, i) => {
    for (let c = 0; c < 4; c++) {
      const [cx, cz] = corners[c];
      const o = i * 4 + c;
      pos[o * 3] = s.x + cx * s.radius;
      pos[o * 3 + 1] = s.y;
      pos[o * 3 + 2] = s.z + cz * s.radius;
      uv[o * 2] = cx;
      uv[o * 2 + 1] = cz;
      param[o * 4] = s.type;
      param[o * 4 + 1] = s.seed ?? 0;
      param[o * 4 + 2] = s.radius;
      param[o * 4 + 3] = s.w ?? 0;
      colA.set(s.colorA, o * 3);
      colB.set(s.colorB, o * 3);
    }
    const b = i * 4;
    // 朝上的面：(-1,-1) → (-1,1) → (1,1) → (1,-1)
    idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aParam', new THREE.BufferAttribute(param, 4));
  geo.setAttribute('aColorA', new THREE.BufferAttribute(colA, 3));
  geo.setAttribute('aColorB', new THREE.BufferAttribute(colB, 3));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: litUniforms({ uTime: SHARED.uTime, uBound: { value: bound } }),
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    lights: true,
    // 预乘透明下雾色会把整个矩形染出来，对局视距内雾量可忽略，直接关掉
    fog: false,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'decals';
  mesh.receiveShadow = true;
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return mesh;
}

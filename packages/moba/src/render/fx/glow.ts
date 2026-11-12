/**
 * 网格类特效：光柱 / 光球与护罩 / 月牙斩弧 / 晶体弹 / 箭矢 / 飞刃 / 旋风漏斗 / 光环箍，以及受光的岩刺与碎岩。
 * 每种形状一个 InstancedMesh(同一份着色器)，没有实例时不产生 draw call。
 * 实例由 CPU 逐帧驱动：一次性实例按「起止缩放 + 速度 + 自转 + 淡入淡出」自动播放并回收；
 * 常驻实例(hold)由持有者逐帧改字段(投射物模型、护盾罩)。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL_ADDITIVE, GLSL_NOISE, Rng, createToonMaterial, hash2, type ToonMaterial } from '../materials';
import { GLSL_FX_OUT, applyFxBlending } from './textures';
import { backOut } from './util';

export const SHAPE = {
  /** 竖直光柱(底在原点，高 1，半径 1) */
  pillar: 0,
  /** 单位球 */
  sphere: 1,
  /** 水平月牙弧：圆心在原点，弧顶朝 +x，外半径 1 */
  slash: 2,
  /** 沿 +x 拉长的八面晶体 */
  diamond: 3,
  /** 箭：尖朝 +x，全长约 1.9 */
  arrow: 4,
  /** 水平三叶飞刃，半径 1 */
  blade: 5,
  /** 上大下小的漏斗(底在原点，高 1，顶半径 1) */
  cone: 6,
  /** 水平圆环箍(外半径 1) */
  hoop: 7,
  /** 受光岩刺(底在原点，高 1，底半径 0.5) */
  spike: 8,
  /** 受光碎岩(半径约 1) */
  rock: 9,
} as const;

export const MODE = {
  plain: 0,
  /** 边缘亮的光壳：k = 菲涅尔指数 */
  rim: 1,
  /** 中心亮的光球：k = 指数 */
  core: 2,
  /** 光柱：k = 竖直衰减指数 */
  pillar: 3,
  /** 斩弧：progress ≥ 0 时沿弧扫过；k = 可见弧长比例(1 = 全弧 2.5 弧度) */
  slash: 4,
  /** 六边形护罩 */
  hex: 5,
  /** 火焰/烟雾漏斗：k = 螺旋扭度，progress = 溶解 */
  vortex: 6,
  /** 假受光的实体(箭/飞刃) */
  solid: 7,
  /** 环箍 */
  hoop: 8,
} as const;

const CAP: Record<number, number> = { 0: 48, 1: 96, 2: 64, 3: 96, 4: 48, 5: 24, 6: 32, 7: 64, 8: 96, 9: 64 };
const LIT_FROM = SHAPE.spike;
const POOL = 420;

const VERTEX = /* glsl */ `
attribute vec4 aTint;
attribute vec4 aFxp;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vObj;
varying vec3 vColor;
varying vec4 vTint;
varying vec4 vFxp;
void main() {
  if (aTint.a <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vUv = uv;
  vObj = position;
  vColor = color;
  vTint = aTint;
  vFxp = aFxp;
  mat3 m = mat3(instanceMatrix);
  // 非均匀缩放下的法线：按各轴缩放平方修正
  vec3 s2 = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
  vNormal = normalize(mat3(viewMatrix) * (m * (normal / max(s2, vec3(1e-8)))));
  vec4 mv = viewMatrix * (instanceMatrix * vec4(position, 1.0));
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uNow;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vObj;
varying vec3 vColor;
varying vec4 vTint;
varying vec4 vFxp;
${GLSL_NOISE}
${GLSL_ADDITIVE}
const float PI = 3.14159265;
float hexEdge(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec2 a = mod(p, s) - s * 0.5;
  vec2 b = mod(p - s * 0.5, s) - s * 0.5;
  vec2 g = abs(dot(a, a) < dot(b, b) ? a : b);
  float d = max(dot(g, s * 0.5), g.x);
  return smoothstep(0.4, 0.485, d);
}
void main() {
  float mode = floor(vFxp.x + 0.001);
  float fxAdd = clamp((vFxp.x - mode) / 0.9, 0.0, 1.0);
  float seed = vFxp.y;
  float pr = vFxp.z;
  float k = vFxp.w;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vView);
  float ndv = abs(dot(N, V));
  vec3 c = vTint.rgb * vColor;
  float a = vTint.a;
  float hot = 0.0;
  if (mode < 0.5) {
  } else if (mode < 1.5) {
    a *= min(1.0, pow(1.0 - ndv, k) * 2.2 + 0.08);
  } else if (mode < 2.5) {
    float f = pow(ndv, k);
    a *= f;
    hot = f * f * f * 0.6;
  } else if (mode < 3.5) {
    float n = fbm(vec2(vUv.x * 18.0 + seed * 31.0, vUv.y * 2.5 - uNow * 1.8));
    float fall = pow(max(0.0, 1.0 - vUv.y), k);
    a *= min(1.0, fall * (0.55 + 0.9 * n) * (0.45 + 0.55 * ndv) * 2.2) * smoothstep(0.0, 0.03, vUv.y);
    hot = fall * fall * fall * 0.3;
  } else if (mode < 4.5) {
    float v = vUv.y;
    float u = vUv.x;
    float prof = pow(v, 1.5) * (1.0 - smoothstep(0.94, 1.0, v));
    // k = 可见弧长占整段弧的比例(1 = 全弧 2.5 弧度)：按技能的扇形角裁剪
    float uu = clamp((u - 0.5) / max(k, 0.05) + 0.5, 0.0, 1.0);
    float ends = pow(max(0.0, sin(uu * PI)), 0.6);
    u = uu;
    float sw = 1.0;
    if (pr >= 0.0) {
      float h = pr * 1.8;
      sw = (1.0 - smoothstep(h - 0.06, h, u)) * smoothstep(h - 1.0, h - 0.25, u);
    }
    a *= prof * ends * sw * 1.9;
    hot = pow(v, 7.0) * ends * sw * 1.2;
  } else if (mode < 5.5) {
    vec3 d = normalize(vObj);
    vec2 hp = vec2(atan(d.z, d.x) * 2.6, asin(clamp(d.y, -1.0, 1.0)) * 3.6);
    float rim = pow(1.0 - ndv, 2.4);
    float pulse = 0.5 + 0.5 * sin(uNow * 3.0 - d.y * 5.0 + seed * 6.0);
    float cell = hexEdge(hp * 1.5);
    a *= min(1.0, rim * 1.35 + cell * (0.3 + 0.3 * pulse) * (0.5 + 0.5 * rim) + 0.07);
    hot = rim * rim * 0.3;
  } else if (mode < 6.5) {
    float n = fbm(vec2(vUv.x * 5.0 + vUv.y * k - uNow * 1.6, vUv.y * 3.0 - uNow * 2.2) + seed * 9.0);
    float th = mix(0.2, 1.0, pr);
    float body = smoothstep(th - 0.12, th + 0.18, n + (1.0 - vUv.y) * 0.5);
    a *= min(1.0, body * smoothstep(0.0, 0.08, vUv.y) * pow(max(0.0, 1.0 - vUv.y), 0.5) * (0.55 + 0.45 * ndv) * 1.4);
    hot = body * (1.0 - vUv.y) * 0.25;
  } else if (mode < 7.5) {
    float l = 0.55 + 0.45 * max(0.0, dot(N, normalize(vec3(-0.3, 0.8, 0.5))));
    c = c * l + vTint.rgb * pow(1.0 - ndv, 2.5) * 0.45;
  } else {
    float prof = sin(vUv.y * PI);
    a *= min(1.0, prof * prof * 2.0);
    hot = pow(prof, 6.0) * 0.5;
  }
  float fxA = min(1.0, a);
  if (fxA < 0.004) discard;
  vec3 fxC = c * (1.0 + hot * 0.7) + vec3(hot * 0.3 * max(c.r, max(c.g, c.b)));
  ${GLSL_FX_OUT}
}
`;

/** 一个网格特效实例的全部参数(对象池复用；字段含义见各 setter) */
export class FxMesh {
  alive = false;
  shape = 0;
  mode = 0;
  t0 = 0;
  life = 1;
  /** 常驻实例：不自动播放、不自动回收 */
  manual = false;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  gravity = 0;
  /** 起止缩放 */
  sx0 = 1;
  sy0 = 1;
  sz0 = 1;
  sx1 = 1;
  sy1 = 1;
  sz1 = 1;
  /** 缩放缓动：0 线性，1 缓出，2 回弹缓出，3 缓入，4 冒出后沉回(岩刺：前 25% 回弹长出，末 35% 沉入地下) */
  ease = 1;
  rx = 0;
  ry = 0;
  rz = 0;
  wx = 0;
  wy = 0;
  wz = 0;
  r = 1;
  g = 1;
  b = 1;
  /** 峰值不透明度 */
  a = 1;
  fadeIn = 0.08;
  fadeOut = 0.4;
  add = 1;
  k = 2;
  /** 手动进度(< 0 = 用生命进度 t；斩弧的 -2 = 不扫过) */
  progress = -1;
  seed = 0;
  /** 跟随的单位(位置 = 单位位置 + (x, y, z) 偏移) */
  followId = -1;

  /** 位置 */
  at(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  vel(vx: number, vy: number, vz: number, gravity = 0): this {
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.gravity = gravity;
    return this;
  }
  /** 等比起止缩放 */
  scale(s0: number, s1 = s0): this {
    this.sx0 = this.sy0 = this.sz0 = s0;
    this.sx1 = this.sy1 = this.sz1 = s1;
    return this;
  }
  /** 分轴起止缩放 */
  scale3(x0: number, y0: number, z0: number, x1 = x0, y1 = y0, z1 = z0): this {
    this.sx0 = x0;
    this.sy0 = y0;
    this.sz0 = z0;
    this.sx1 = x1;
    this.sy1 = y1;
    this.sz1 = z1;
    return this;
  }
  /** 欧拉角：rx = 绕前轴(+x)侧倾/滚转 → rz = 抬头 → ry = 偏航(朝向用 -facing) */
  rot(rx: number, ry: number, rz: number): this {
    this.rx = rx;
    this.ry = ry;
    this.rz = rz;
    return this;
  }
  spin(wx: number, wy: number, wz: number): this {
    this.wx = wx;
    this.wy = wy;
    this.wz = wz;
    return this;
  }
  color(c: THREE.Color, intensity = 1, alpha = 1): this {
    this.r = c.r * intensity;
    this.g = c.g * intensity;
    this.b = c.b * intensity;
    this.a = alpha;
    return this;
  }
  fade(fadeIn: number, fadeOut: number): this {
    this.fadeIn = fadeIn;
    this.fadeOut = fadeOut;
    return this;
  }
  opt(add: number, k: number, ease = this.ease): this {
    this.add = add;
    this.k = k;
    this.ease = ease;
    return this;
  }
  follow(unitId: number): this {
    this.followId = unitId;
    return this;
  }
  /** 延迟出现 */
  delay(t: number): this {
    this.t0 += t;
    return this;
  }
}

function setColorAttr(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, i: number) => [number, number, number]): void {
  const pos = geo.getAttribute('position');
  const colArr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) colArr.set(fn(pos.getX(i), pos.getY(i), pos.getZ(i), i), i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
}

function white(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  setColorAttr(geo, () => [1, 1, 1]);
  return geo;
}

function buildSlash(): THREE.BufferGeometry {
  const N = 28;
  const span = 2.5;
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const a = (u - 0.5) * span;
    const w = 0.36 * Math.pow(Math.sin(Math.PI * u), 0.7) + 0.01;
    for (const [rad, v] of [[1 - w, 0], [1, 1]] as const) {
      pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      uv.push(u, v);
      nor.push(0, 1, 0);
    }
    if (i < N) {
      const b = i * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return white(g);
}

function buildHoop(): THREE.BufferGeometry {
  const N = 40;
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    for (const [rad, v] of [[0.72, 0], [1, 1]] as const) {
      pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      uv.push(i / N, v);
      nor.push(0, 1, 0);
    }
    if (i < N) {
      const b = i * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return white(g);
}

function buildArrow(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shaft = new THREE.CylinderGeometry(0.03, 0.03, 1.45, 6, 1).toNonIndexed();
  shaft.rotateZ(-Math.PI / 2);
  shaft.translate(-0.05, 0, 0);
  setColorAttr(shaft, () => [0.82, 0.76, 0.62]);
  parts.push(shaft);
  const head = new THREE.ConeGeometry(0.11, 0.4, 6, 1).toNonIndexed();
  head.rotateZ(-Math.PI / 2);
  head.translate(0.86, 0, 0);
  setColorAttr(head, () => [1.5, 1.5, 1.5]);
  parts.push(head);
  // 三片尾羽
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.BufferGeometry();
    fin.setAttribute('position', new THREE.Float32BufferAttribute([-0.78, 0.03, 0, -0.42, 0.03, 0, -0.86, 0.19, 0, -0.78, 0.03, 0, -0.86, 0.19, 0, -0.42, 0.03, 0], 3));
    fin.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
    fin.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    fin.rotateX((i * Math.PI * 2) / 3);
    setColorAttr(fin, () => [1.1, 1.1, 1.1]);
    parts.push(fin);
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

function buildBlade(): THREE.BufferGeometry {
  // 三叶回旋刃：每叶是一片向一侧弯的弯刀
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const colArr: number[] = [];
  const tri = (a: [number, number], b: [number, number], c: [number, number], shade: number): void => {
    for (const side of [1, -1]) {
      const pts = side === 1 ? [a, c, b] : [a, b, c];
      for (const p of pts) {
        pos.push(p[0], side * 0.03, p[1]);
        nor.push(0, side, 0);
        uv.push(0, 0);
        colArr.push(shade, shade, shade);
      }
    }
  };
  for (let i = 0; i < 3; i++) {
    const a0 = (i * Math.PI * 2) / 3;
    const p = (r: number, a: number): [number, number] => [Math.cos(a0 + a) * r, Math.sin(a0 + a) * r];
    const c: [number, number] = [0, 0];
    tri(c, p(0.34, -0.55), p(0.62, 0.05), 0.75);
    tri(c, p(0.62, 0.05), p(0.3, 0.6), 0.6);
    tri(p(0.34, -0.55), p(1.0, 0.42), p(0.62, 0.05), 1.5);
    tri(p(0.62, 0.05), p(1.0, 0.42), p(0.72, 0.5), 1.0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
  return g;
}

function withFx(geo: THREE.BufferGeometry, glow: (x: number, y: number, z: number) => number): void {
  const pos = geo.getAttribute('position');
  const fx = new Uint8Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    fx[i * 4 + 1] = Math.max(0, Math.min(1, glow(pos.getX(i), pos.getY(i), pos.getZ(i)))) * 255;
    fx[i * 4 + 3] = 255;
  }
  geo.setAttribute('aFx', new THREE.BufferAttribute(fx, 4, true));
}

function buildSpike(): THREE.BufferGeometry {
  const src = new THREE.ConeGeometry(0.5, 1, 5, 2);
  src.translate(0, 0.5, 0);
  // 按位置哈希抖动中段(接缝处重合的顶点得到相同偏移，保持水密)，再拆成独立三角面得到硬切面
  const p = src.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0.02 && y < 0.98) {
      const hx = Math.round(p.getX(i) * 100);
      const hz = Math.round(p.getZ(i) * 100);
      p.setX(i, p.getX(i) * (0.8 + 0.5 * hash2(hx, hz, 5)));
      p.setZ(i, p.getZ(i) * (0.8 + 0.5 * hash2(hx, hz, 9)));
    }
  }
  const g = src.toNonIndexed();
  src.dispose();
  g.computeVertexNormals();
  // 岩石底色 → 顶端透出琥珀晶光
  setColorAttr(g, (_x, y) => {
    const k = Math.max(0, (y - 0.5) / 0.5);
    return [0.15 + 0.85 * k, 0.125 + 0.42 * k, 0.11 - 0.02 * k];
  });
  withFx(g, (_x, y) => Math.max(0, (y - 0.55) / 0.45) * 0.55);
  return g;
}

function buildRock(): THREE.BufferGeometry {
  const rng = new Rng(31);
  const src = new THREE.IcosahedronGeometry(1, 0);
  const seen = new Map<string, [number, number, number]>();
  const p = src.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let v = seen.get(key);
    if (!v) {
      const k = rng.range(0.62, 1.12);
      v = [p.getX(i) * k, p.getY(i) * k * 0.82, p.getZ(i) * k];
      seen.set(key, v);
    }
    p.setXYZ(i, v[0], v[1], v[2]);
  }
  src.computeVertexNormals();
  setColorAttr(src, (_x, y, _z, i) => {
    const s = 0.14 + 0.05 * (((i / 3) | 0) % 3) + y * 0.03;
    return [s * 1.04, s, s * 0.94];
  });
  withFx(src, () => 0);
  return src;
}

function buildDiamond(): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(1, 0);
  g.scale(1, 0.36, 0.36);
  g.computeVertexNormals();
  // 尖端更亮
  setColorAttr(g, (x) => {
    const k = 0.75 + 0.5 * Math.max(0, x);
    return [k, k, k];
  });
  return g;
}

const _q = new THREE.Quaternion();
// 旋转顺序：先绕自身前轴(x)侧倾/滚转，再绕 z 抬头，最后绕 y 偏航
const _e = new THREE.Euler(0, 0, 0, 'YZX');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export class GlowSystem {
  readonly group = new THREE.Group();
  now = 0;
  resolve: ((unitId: number, out: THREE.Vector3) => boolean) | null = null;

  private meshes: THREE.InstancedMesh[] = [];
  private tint: THREE.InstancedBufferAttribute[] = [];
  private fxp: THREE.InstancedBufferAttribute[] = [];
  private counts: number[] = [];
  private pool: FxMesh[] = [];
  private free: FxMesh[] = [];
  private live: FxMesh[] = [];
  private mat: THREE.ShaderMaterial;
  private litMat: ToonMaterial;
  private seedN = 0;
  private dummy = new FxMesh();

  constructor() {
    this.group.name = 'fx.meshes';
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uNow: { value: 0 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    applyFxBlending(this.mat);
    this.litMat = createToonMaterial({ vertexColors: true, flat: true, steps: 2, rim: 0.35, glowBoost: 3.2 });

    const cyl = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
    cyl.translate(0, 0.5, 0);
    const cone = new THREE.CylinderGeometry(1, 0.28, 1, 24, 5, true);
    cone.translate(0, 0.5, 0);
    const geos: THREE.BufferGeometry[] = [
      white(cyl),
      white(new THREE.SphereGeometry(1, 24, 16)),
      buildSlash(),
      buildDiamond(),
      buildArrow(),
      buildBlade(),
      white(cone),
      buildHoop(),
      buildSpike(),
      buildRock(),
    ];
    geos.forEach((geo, shape) => {
      const cap = CAP[shape];
      const lit = shape >= LIT_FROM;
      const mesh = new THREE.InstancedMesh(geo, lit ? this.litMat : this.mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false;
      const tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      const fxp = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      tint.setUsage(THREE.DynamicDrawUsage);
      fxp.setUsage(THREE.DynamicDrawUsage);
      if (lit) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.setColorAt(0, _c.setRGB(1, 1, 1));
        (mesh.instanceColor as THREE.InstancedBufferAttribute).setUsage(THREE.DynamicDrawUsage);
        mesh.name = 'fx.lit' + shape;
      } else {
        geo.setAttribute('aTint', tint);
        geo.setAttribute('aFxp', fxp);
        mesh.renderOrder = 7;
        mesh.name = 'fx.glow' + shape;
      }
      this.meshes.push(mesh);
      this.tint.push(tint);
      this.fxp.push(fxp);
      this.counts.push(0);
      this.group.add(mesh);
    });
    for (let i = 0; i < POOL; i++) {
      const m = new FxMesh();
      this.pool.push(m);
      this.free.push(m);
    }
  }

  private take(shape: number, mode: number, life: number, manual: boolean): FxMesh {
    const m = this.free.pop();
    // 池空：返回一个不参与绘制的假实例，调用方照常链式设置即可
    if (!m) return this.dummy;
    m.alive = true;
    m.shape = shape;
    m.mode = mode;
    m.t0 = this.now;
    m.life = life;
    m.manual = manual;
    m.x = m.y = m.z = 0;
    m.vx = m.vy = m.vz = 0;
    m.gravity = 0;
    m.sx0 = m.sy0 = m.sz0 = m.sx1 = m.sy1 = m.sz1 = 1;
    m.ease = 1;
    m.rx = m.ry = m.rz = 0;
    m.wx = m.wy = m.wz = 0;
    m.r = m.g = m.b = 1;
    m.a = 1;
    m.fadeIn = 0.08;
    m.fadeOut = 0.4;
    m.add = 1;
    m.k = 2;
    m.progress = -1;
    m.seed = this.seedN = (this.seedN + 0.6180339) % 1;
    m.followId = -1;
    this.live.push(m);
    return m;
  }

  /** 一次性实例：自动播放 life 秒后回收 */
  spawn(shape: number, mode: number, life: number): FxMesh {
    return this.take(shape, mode, life, false);
  }

  /** 常驻实例：持有者逐帧改字段，用完 release */
  hold(shape: number, mode: number): FxMesh {
    return this.take(shape, mode, 1, true);
  }

  release(m: FxMesh | null): void {
    if (m) m.alive = false;
  }

  flush(): void {
    this.mat.uniforms.uNow.value = this.now;
    const counts = this.counts;
    for (let i = 0; i < counts.length; i++) counts[i] = 0;
    const live = this.live;
    let w = 0;
    for (let i = 0; i < live.length; i++) {
      const m = live[i];
      const age = this.now - m.t0;
      const t = m.manual ? 0 : age / m.life;
      if (!m.alive || t >= 1) {
        m.alive = false;
        this.free.push(m);
        continue;
      }
      live[w++] = m;
      if (age < 0) continue;
      const shape = m.shape;
      const n = counts[shape];
      if (n >= CAP[shape]) continue;
      // 缩放缓动
      let k = t;
      let sink = 0;
      if (m.ease === 1) k = 1 - (1 - t) * (1 - t);
      else if (m.ease === 2) k = backOut(Math.min(1, t * 2.2));
      else if (m.ease === 3) k = t * t;
      else if (m.ease === 4) {
        k = backOut(Math.min(1, t * 4));
        const s = (t - 0.65) / 0.35;
        if (s > 0) sink = s * s;
      }
      const sx = m.sx0 + (m.sx1 - m.sx0) * k;
      const sy = m.sy0 + (m.sy1 - m.sy0) * k;
      const sz = m.sz0 + (m.sz1 - m.sz0) * k;
      let px = m.x + m.vx * age;
      let py = m.y + m.vy * age - 0.5 * m.gravity * age * age;
      let pz = m.z + m.vz * age;
      if (m.followId >= 0 && this.resolve && this.resolve(m.followId, _p)) {
        px += _p.x;
        py += _p.y;
        pz += _p.z;
      }
      if (sink > 0) py -= sy * sink * 1.05;
      _e.set(m.rx + m.wx * age, m.ry + m.wy * age, m.rz + m.wz * age);
      _q.setFromEuler(_e);
      _p.set(px, py, pz);
      _s.set(sx, sy, sz);
      _m.compose(_p, _q, _s);
      const mesh = this.meshes[shape];
      mesh.setMatrixAt(n, _m);
      if (shape >= LIT_FROM) {
        mesh.setColorAt(n, _c.setRGB(m.r, m.g, m.b));
      } else {
        let a = m.a;
        if (!m.manual) {
          if (m.fadeIn > 0 && t < m.fadeIn) a *= t / m.fadeIn;
          if (t > m.fadeOut) {
            const f = 1 - (t - m.fadeOut) / (1 - m.fadeOut);
            a *= f * f;
          }
        }
        const ta = this.tint[shape].array as Float32Array;
        const fa = this.fxp[shape].array as Float32Array;
        const o = n * 4;
        ta[o] = m.r;
        ta[o + 1] = m.g;
        ta[o + 2] = m.b;
        ta[o + 3] = a;
        fa[o] = m.mode + Math.min(1, Math.max(0, m.add)) * 0.9;
        fa[o + 1] = m.seed;
        fa[o + 2] = m.progress >= 0 ? m.progress : m.progress <= -2 ? -1 : t;
        fa[o + 3] = m.k;
      }
      counts[shape] = n + 1;
    }
    live.length = w;
    for (let s = 0; s < counts.length; s++) {
      const mesh = this.meshes[s];
      const n = counts[s];
      mesh.count = n;
      mesh.visible = n > 0;
      if (n === 0) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (s >= LIT_FROM) {
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      } else {
        this.tint[s].needsUpdate = true;
        this.fxp[s].needsUpdate = true;
      }
    }
  }

  /** 当前有实例的形状数(= 额外 draw call 数，受光形状还要加阴影通道) */
  get activeShapes(): number {
    let n = 0;
    for (const c of this.counts) if (c > 0) n++;
    return n;
  }

  clear(): void {
    for (const m of this.live) m.alive = false;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.mat.dispose();
    this.litMat.dispose();
  }
}

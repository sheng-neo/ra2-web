/**
 * 行人渲染（R2 STREETLIFE S1）：两级 LOD，各一个实例化网格（2 个 draw call）。
 * - LOD0（近，HIGH 60 m / LOW 30 m 内）：约 146 个三角形的低模人（六棱头与躯干、斜肩、膝盖、鞋、头发盖住后脑与两侧，
 *   可选手机屏），顶点着色器做步态（腿 ±18°、膝盖弯曲、手臂反向摆、身体起伏；每人步频 ±18 %、相位错开），不用骨骼；
 * - LOD1（远，至 HIGH 150 m / LOW 80 m）：2 个三角形的竖直广告牌，片元着色器画剪影（头、躯干、两腿开合）。
 * 每帧由 Crowd.gather 取相机附近的人（位置只取决于 SIM_CLOCK.t），按距离分两级、写实例属性。
 * 光照走契约：cityAmbient（离地高度 = 局部 y）+ applyHaze + GLSL_FINISH，在亮铺面前成深色剪影；
 * 手机屏是唯一的自发光（冷白 0.8，低于 bloom 阈值）。
 */
import {
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  DynamicDrawUsage,
  type Camera,
} from 'three';
import { simToThree, threeToSim } from '../../coords';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms } from '../materials/lighting';
import { lookOf, type AgentPose, type Crowd, type Look } from './crowd';

/** 体部件编号（aPart）与肢体编号（aLimb）。 */
const P_SKIN = 0;
const P_HAIR = 1;
const P_TOP = 2;
const P_BOTTOM = 3;
const P_PHONE = 4;
const P_SHOE = 5;
/** 长发位（颈后）：按人随机画成头发或皮肤。 */
const P_HAIR_LONG = 6;
/** 头侧（耳上）：短发的人露出一点皮肤（耳朵 / 鬓角），其余是头发。 */
const P_HAIR_SIDE = 7;
const HIP_Y = 0.82;
const SHOULDER_Y = 1.37;

interface Builder {
  pos: number[];
  nrm: number[];
  part: number[];
  limb: number[];
  index: number[];
}

/** 收顶盒子（只画四个侧面，可选顶面）：底中心 (cx, y0, cz)，底尺寸 (sx, sz)，顶尺寸 (tx, tz)。 */
function box(b: Builder, cx: number, cz: number, y0: number, y1: number, s: [number, number], t: [number, number], part: number, limb: number, top: boolean, backPart = part): void {
  const B = (x: number, z: number) => [cx + (x * s[0]) / 2, y0, cz + (z * s[1]) / 2];
  const T = (x: number, z: number) => [cx + (x * t[0]) / 2, y1, cz + (z * t[1]) / 2];
  const quad = (a: number[], c: number[], d: number[], e: number[], pt = part) => {
    const ux = c[0]! - a[0]!;
    const uy = c[1]! - a[1]!;
    const uz = c[2]! - a[2]!;
    const vx = e[0]! - a[0]!;
    const vy = e[1]! - a[1]!;
    const vz = e[2]! - a[2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const base = b.pos.length / 3;
    for (const p of [a, c, d, e]) {
      b.pos.push(p[0]!, p[1]!, p[2]!);
      b.nrm.push(nx, ny, nz);
      b.part.push(pt);
      b.limb.push(limb);
    }
    b.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  quad(B(-1, 1), B(1, 1), T(1, 1), T(-1, 1)); // +z
  quad(B(1, -1), B(-1, -1), T(-1, -1), T(1, -1)); // −z
  quad(B(1, 1), B(1, -1), T(1, -1), T(1, 1)); // +x（前）
  quad(B(-1, -1), B(-1, 1), T(-1, 1), T(-1, -1), backPart); // −x（后脑：头发）
  if (top) quad(T(-1, 1), T(1, 1), T(1, -1), T(-1, -1));
}

/**
 * 椭圆截面的多边形棱柱（逐面一组顶点，法线取径向、平滑），rings = [[y, rx, rz], …] 自下而上。
 * partOf(面中心角, 段号) 决定每个面的部件（头发 / 皮肤 / 衣服）；capTop 在顶上加一个扇形盖（顶点 y = capY）。
 */
function prism(
  b: Builder,
  cx: number,
  cz: number,
  rings: readonly (readonly [number, number, number])[],
  sides: number,
  offset: number,
  partOf: (angle: number, seg: number) => number,
  limb: number,
  cap?: { y: number; part: number },
): void {
  const vert = (x: number, y: number, z: number, nx: number, ny: number, nz: number, part: number) => {
    const l = Math.hypot(nx, ny, nz) || 1;
    b.pos.push(x, y, z);
    b.nrm.push(nx / l, ny / l, nz / l);
    b.part.push(part);
    b.limb.push(limb);
    return b.pos.length / 3 - 1;
  };
  for (let i = 0; i + 1 < rings.length; i++) {
    const [y0, rx0, rz0] = rings[i]!;
    const [y1, rx1, rz1] = rings[i + 1]!;
    const slope = (Math.max(rx0, rz0) - Math.max(rx1, rz1)) / Math.max(y1 - y0, 1e-3);
    for (let k = 0; k < sides; k++) {
      const a0 = offset + (k * Math.PI * 2) / sides;
      const a1 = offset + ((k + 1) * Math.PI * 2) / sides;
      const part = partOf((a0 + a1) / 2, i);
      // 逆时针朝外：从外面看，角度大的一边在左
      const v = [
        vert(cx + rx0 * Math.cos(a1), y0, cz + rz0 * Math.sin(a1), Math.cos(a1), slope, Math.sin(a1), part),
        vert(cx + rx0 * Math.cos(a0), y0, cz + rz0 * Math.sin(a0), Math.cos(a0), slope, Math.sin(a0), part),
        vert(cx + rx1 * Math.cos(a0), y1, cz + rz1 * Math.sin(a0), Math.cos(a0), slope, Math.sin(a0), part),
        vert(cx + rx1 * Math.cos(a1), y1, cz + rz1 * Math.sin(a1), Math.cos(a1), slope, Math.sin(a1), part),
      ];
      b.index.push(v[0]!, v[1]!, v[2]!, v[0]!, v[2]!, v[3]!);
    }
  }
  if (cap) {
    const [y, rx, rz] = rings[rings.length - 1]!;
    const c = vert(cx, cap.y, cz, 0, 1, 0, cap.part);
    for (let k = 0; k < sides; k++) {
      const a0 = offset + (k * Math.PI * 2) / sides;
      const a1 = offset + ((k + 1) * Math.PI * 2) / sides;
      const p0 = vert(cx + rx * Math.cos(a0), y, cz + rz * Math.sin(a0), Math.cos(a0), 1.2, Math.sin(a0), cap.part);
      const p1 = vert(cx + rx * Math.cos(a1), y, cz + rz * Math.sin(a1), Math.cos(a1), 1.2, Math.sin(a1), cap.part);
      b.index.push(c, p1, p0);
    }
  }
}

/** 面中心角（弧度，0 = 正前方 +x）离正前方多远（0–π）。 */
const fromFront = (a: number) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));

/**
 * LOD0 人形（身高 1.7 m，面朝 +x，z 为左右），约 146 个三角形（R2 修复轮，取代方块人）：
 * - 头：六棱、两段（下巴收窄 → 眉线最宽 → 头顶收圆）+ 顶盖；头顶、后脑与两侧是头发，脸在前；
 *   颈后一面「长发」（按人随机，着色器里换成头发或皮肤）；
 * - 躯干：六棱、两段（胯 → 胸 → 肩线收窄成斜肩）+ 顶盖；
 * - 手臂：四棱一段（肩到手）；腿：五棱两段（大腿、小腿，膝盖能弯）+ 深色鞋（向前伸的楔形）。
 */
export function figureGeometry(): InstancedBufferGeometry {
  const b: Builder = { pos: [], nrm: [], part: [], limb: [], index: [] };
  const all = (p: number) => () => p;
  for (const side of [1, -1]) {
    const z = 0.085 * side;
    const thigh = side > 0 ? 1 : 2;
    const shin = side > 0 ? 5 : 6;
    prism(b, 0, z, [
      [0.47, 0.06, 0.055],
      [HIP_Y + 0.04, 0.085, 0.075],
    ], 5, 0, all(P_BOTTOM), thigh);
    prism(b, 0, z, [
      [0.08, 0.042, 0.04],
      [0.48, 0.06, 0.055],
    ], 5, 0, all(P_BOTTOM), shin);
    // 鞋：脚跟在踝后 5 cm、脚尖往前 17 cm，前低后高
    box(b, 0.06, z, 0, 0.085, [0.22, 0.095], [0.14, 0.085], P_SHOE, shin, true);
  }
  // 躯干：胯（宽 0.32）→ 胸（宽 0.38、最厚）→ 肩线（收窄 = 斜肩）
  prism(b, 0, 0, [
    [HIP_Y - 0.02, 0.1, 0.16],
    [1.25, 0.115, 0.19],
    [SHOULDER_Y + 0.05, 0.085, 0.14],
  ], 6, -Math.PI / 6, all(P_TOP), 0, { y: SHOULDER_Y + 0.07, part: P_TOP });
  // 手臂：肩到手（下端是手，皮肤色的一小段）
  for (const side of [1, -1]) {
    prism(b, 0, 0.215 * side, [
      [0.8, 0.035, 0.032],
      [SHOULDER_Y + 0.02, 0.045, 0.042],
    ], 4, Math.PI / 4, all(P_TOP), side > 0 ? 3 : 4);
  }
  // 颈（后面一面是长发位）
  prism(b, 0.005, 0, [
    [SHOULDER_Y + 0.04, 0.05, 0.05],
    [1.5, 0.048, 0.048],
  ], 4, Math.PI / 4, (a) => (fromFront(a) > 2.5 ? P_HAIR_LONG : P_SKIN), 0);
  // 头：下巴 → 眉线 → 头顶；脸（前方 ±60° 的面）是皮肤，其余头发
  prism(b, 0.01, 0, [
    [1.49, 0.075, 0.062],
    [1.62, 0.1, 0.086],
    [1.71, 0.072, 0.062],
  ], 6, -Math.PI / 6, (a, seg) => (seg === 0 && fromFront(a) < 1.2 ? P_SKIN : seg === 0 && fromFront(a) < 2.2 ? P_HAIR_SIDE : P_HAIR), 0, { y: 1.74, part: P_HAIR });
  // 手机屏（胸前右手，只在有手机的实例上显示）
  const base = b.pos.length / 3;
  for (const [y, z] of [
    [1.08, -0.16],
    [1.08, -0.08],
    [1.2, -0.08],
    [1.2, -0.16],
  ] as const) {
    b.pos.push(0.2, y, z);
    b.nrm.push(0.4, 0.9, 0);
    b.part.push(P_PHONE);
    b.limb.push(0);
  }
  b.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(b.nrm), 3));
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(b.part), 1));
  g.setAttribute('aLimb', new BufferAttribute(new Float32Array(b.limb), 1));
  g.setIndex(b.index);
  return g;
}

/** LOD1：竖直广告牌（2 个三角形），uv 0–1。 */
export function billboardGeometry(): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

const INSTANCE_PARS = /* glsl */ `
attribute vec4 iPos;   // three 坐标 + 朝向角（绕 y）
attribute vec4 iAnim;  // 步态相位、步态幅度、身高缩放、体宽缩放
attribute vec3 iTop;
attribute vec3 iBot;
attribute vec3 iSkin;
attribute vec4 iHair;  // rgb + 手机（> 0.5）
`;

const FIGURE_VERT = /* glsl */ `
${GLSL_SHARED_PARS}
${INSTANCE_PARS}
attribute float aPart;
attribute float aLimb;
varying vec3 vAlb;
varying vec3 vEm;
varying vec3 vN;
varying vec3 vWorld;
varying float vLift;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
void main() {
  vec3 p = position;
  vec3 n = normal;
  // 每人一个随机数（由衣服 / 肤色定，同一人恒定）：步频 ±18 %、相位错开，旁边的人不会齐步走
  float rnd = fract(sin(dot(iTop * 7.1 + iBot * 3.3 + iSkin, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float ph = iAnim.x * (0.84 + 0.34 * rnd) + rnd * 6.2832;
  float sw = sin(ph);
  float walk = iAnim.y;
  // 腿：小腿先绕膝盖向后弯（往前摆的那条腿弯得多），再整条腿绕胯前后摆 ±0.32 rad
  if ((aLimb > 0.5 && aLimb < 2.5) || aLimb > 4.5) {
    float side = (aLimb < 1.5 || (aLimb > 4.5 && aLimb < 5.5)) ? 1.0 : -1.0;
    float a = 0.32 * walk * sw * side;
    if (aLimb > 4.5) {
      float k = walk * (0.08 + 0.55 * max(0.0, cos(ph) * side));
      p.xy = vec2(0.0, 0.47) + rot(-k) * (p.xy - vec2(0.0, 0.47));
      n.xy = rot(-k) * n.xy;
    }
    p.xy = vec2(0.0, ${HIP_Y.toFixed(2)}) + rot(a) * (p.xy - vec2(0.0, ${HIP_Y.toFixed(2)}));
    n.xy = rot(a) * n.xy;
  }
  // 手臂：与同侧腿反向
  if (aLimb > 2.5 && aLimb < 4.5) {
    float a = -0.26 * walk * sw * (aLimb < 3.5 ? 1.0 : -1.0);
    p.xy = vec2(0.0, ${SHOULDER_Y.toFixed(2)}) + rot(a) * (p.xy - vec2(0.0, ${SHOULDER_Y.toFixed(2)}));
    n.xy = rot(a) * n.xy;
  }
  // 起伏（每步一次）与站立时的轻微晃动
  p.y += walk * 0.022 * abs(cos(ph));
  p.z += (1.0 - walk) * 0.012 * sin(iAnim.x) * p.y;
  // 手机：只在有手机的实例上画
  if (aPart > 3.5 && aPart < 4.5 && iHair.w < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  p *= vec3(iAnim.z, iAnim.z, iAnim.z * iAnim.w);
  float c = cos(iPos.w), s = sin(iPos.w);
  vec3 w = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  vec3 wn = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
  vec4 world = modelMatrix * vec4(iPos.xyz + w, 1.0);
  vWorld = world.xyz;
  vN = normalize(wn);
  vLift = p.y;
  // 长发（约三成人）：颈后一面是头发；头侧：短发的人露出一点皮肤
  float longHair = step(0.68, fract(rnd * 7.31));
  float part = aPart;
  if (part > 6.5) part = rnd < 0.3 ? 0.0 : 1.0;
  else if (part > 5.5) part = longHair > 0.5 ? 1.0 : 0.0;
  vAlb = part < 0.5 ? iSkin : part < 1.5 ? iHair.rgb : part < 2.5 ? iTop : part < 3.5 ? iBot : part < 4.5 ? vec3(0.02) : vec3(0.022, 0.021, 0.02);
  vEm = aPart > 3.5 && aPart < 4.5 ? PHONE_EM : vec3(0.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const BILLBOARD_VERT = /* glsl */ `
${GLSL_SHARED_PARS}
${INSTANCE_PARS}
varying vec2 vLocal;   // 局部米：x 横向（−0.3…0.3），y 离地
varying vec3 vWorld;
varying vec3 vTop;
varying vec3 vBot;
varying vec3 vSkin;
varying vec3 vHair;
varying vec2 vAnim;
varying float vH;
void main() {
  float h = 1.7 * iAnim.z;
  float wdt = 0.62 * iAnim.z * iAnim.w;
  vec3 toCam = cameraPosition - iPos.xyz;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
  vec3 world = iPos.xyz + right * position.x * wdt + vec3(0.0, position.y * h, 0.0);
  vWorld = world;
  vLocal = vec2(position.x * 0.62 * iAnim.w, position.y * 1.7);
  vTop = iTop;
  vBot = iBot;
  vSkin = iSkin;
  vHair = iHair.rgb;
  vAnim = iAnim.xy;
  vH = h;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FIGURE_FRAG = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
uniform float uWarmth;
varying vec3 vAlb;
varying vec3 vEm;
varying vec3 vN;
varying vec3 vWorld;
varying float vLift;
void main() {
  vec3 n = normalize(vN);
  vec3 surface = vAlb * cityAmbient(n, vLift, uWarmth) * 1.15;
  vec3 col = applyHaze(surface, vEm, vWorld);
  ${GLSL_FINISH}
}
`;

const BILLBOARD_FRAG = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
uniform float uWarmth;
varying vec2 vLocal;
varying vec3 vWorld;
varying vec3 vTop;
varying vec3 vBot;
varying vec3 vSkin;
varying vec3 vHair;
varying vec2 vAnim;
varying float vH;
void main() {
  float x = abs(vLocal.x);
  float y = vLocal.y;
  vec3 alb;
  // 头
  vec2 hc = vec2(vLocal.x, y - 1.59);
  if (length(hc * vec2(1.0, 0.85)) < 0.11) {
    alb = y > 1.62 ? vHair : vSkin;
  } else if (y > 0.8 && y < 1.44) {
    // 躯干 + 手臂：肩宽 0.21 → 胯宽 0.17
    float w = mix(0.17, 0.23, smoothstep(0.8, 1.38, y));
    if (x > w) discard;
    alb = vTop;
  } else if (y <= 0.84) {
    // 两腿：走路时开合
    float spread = 0.03 + 0.07 * vAnim.y * abs(sin(vAnim.x)) * (1.0 - y / 0.84);
    if (x > spread + 0.115 || (x < spread - 0.02 && y < 0.78)) discard;
    alb = vBot;
  } else discard;
  vec3 n = normalize(vec3(cameraPosition.x - vWorld.x, 0.0, cameraPosition.z - vWorld.z));
  vec3 surface = alb * cityAmbient(n, y, uWarmth) * 1.15;
  vec3 col = applyHaze(surface, vec3(0.0), vWorld);
  ${GLSL_FINISH}
}
`;

function phoneEm(): string {
  const c = lightColour('tubeCool').multiplyScalar(0.8);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}

function material(vert: string, frag: string, warmth: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...sharedUniforms(), uWarmth: { value: warmth } },
    defines: { PHONE_EM: phoneEm() },
    vertexShader: vert,
    fragmentShader: frag,
  });
}

/** 一级 LOD 的实例缓冲。 */
class Layer {
  readonly mesh: Mesh;
  readonly geo: InstancedBufferGeometry;
  private readonly pos: InstancedBufferAttribute;
  private readonly anim: InstancedBufferAttribute;
  private readonly top: InstancedBufferAttribute;
  private readonly bot: InstancedBufferAttribute;
  private readonly skin: InstancedBufferAttribute;
  private readonly hair: InstancedBufferAttribute;
  count = 0;

  constructor(
    geo: InstancedBufferGeometry,
    mat: ShaderMaterial,
    readonly capacity: number,
    name: string,
  ) {
    this.geo = geo;
    const attr = (k: number) => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * k), k);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.pos = attr(4);
    this.anim = attr(4);
    this.top = attr(3);
    this.bot = attr(3);
    this.skin = attr(3);
    this.hair = attr(4);
    geo.setAttribute('iPos', this.pos);
    geo.setAttribute('iAnim', this.anim);
    geo.setAttribute('iTop', this.top);
    geo.setAttribute('iBot', this.bot);
    geo.setAttribute('iSkin', this.skin);
    geo.setAttribute('iHair', this.hair);
    geo.instanceCount = 0;
    this.mesh = new Mesh(geo, mat);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
  }

  put(p: readonly number[], yaw: number, a: AgentPose, look: Look): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.pos.setXYZW(i, p[0]!, p[1]!, p[2]!, yaw);
    this.anim.setXYZW(i, a.phase, a.walk, (look.height / 1.7) * a.scale, look.build);
    this.top.setXYZ(i, look.top[0], look.top[1], look.top[2]);
    this.bot.setXYZ(i, look.bottom[0], look.bottom[1], look.bottom[2]);
    this.skin.setXYZ(i, look.skin[0], look.skin[1], look.skin[2]);
    this.hair.setXYZW(i, look.hair[0], look.hair[1], look.hair[2], look.phone ? 1 : 0);
  }

  commit(): void {
    this.geo.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
    for (const a of [this.pos, this.anim, this.top, this.bot, this.skin, this.hair]) {
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.count * a.itemSize);
    }
  }
}

export interface PedestrianOptions {
  /** 画的最远距离（m，三维）。 */
  radius: number;
  /** LOD0 的距离（m）。 */
  nearM: number;
  /** 总人数上限与 LOD0 上限。 */
  cap: number;
  nearCap: number;
  /** 街面主光冷暖。 */
  warmth?: number;
}

/** 行人渲染器：update(camera, t) 每帧调用。 */
export class Pedestrians {
  readonly objects: Mesh[];
  private readonly near: Layer;
  private readonly far: Layer;
  private readonly pool: AgentPose[];
  private readonly looks = new Map<number, Look>();
  private readonly v = [0, 0, 0];
  private readonly order: number[] = [];
  private readonly dist: Float32Array;
  /** 上一帧画了多少人（调试）。 */
  drawn = 0;
  /** 按距离排序的比较函数（建一次，每帧不再分配闭包）。 */
  private readonly byDist = (a: number, b: number): number => this.dist[a]! - this.dist[b]!;

  constructor(
    readonly crowd: Crowd,
    readonly opts: PedestrianOptions,
  ) {
    const warmth = opts.warmth ?? 0.35;
    this.near = new Layer(figureGeometry(), material(FIGURE_VERT, FIGURE_FRAG, warmth), opts.nearCap, 'pedestrians-near');
    this.far = new Layer(billboardGeometry(), material(BILLBOARD_VERT, BILLBOARD_FRAG, warmth), opts.cap, 'pedestrians-far');
    this.objects = [this.near.mesh, this.far.mesh];
    const poolN = opts.cap * 3;
    this.pool = Array.from({ length: poolN }, () => ({ x: 0, y: 0, z: 0, hx: 1, hy: 0, walk: 0, phase: 0, scale: 1, seed: 0 }));
    this.dist = new Float32Array(poolN);
  }

  private look(seed: number): Look {
    let l = this.looks.get(seed);
    if (!l) {
      l = lookOf(seed);
      if (this.looks.size > 20000) this.looks.clear();
      this.looks.set(seed, l);
    }
    return l;
  }

  update(camera: Camera, t: number): void {
    const c = camera.position;
    const [sx, sy, sz] = threeToSim(c.x, c.y, c.z);
    const cx = sx / 10;
    const cy = sy / 10;
    const cz = sz / 10;
    const n = this.crowd.gather(cx, cy, cz, this.opts.radius, t, this.pool);
    // 太多时只留最近的 cap 个
    this.order.length = 0;
    for (let i = 0; i < n; i++) {
      const a = this.pool[i]!;
      this.dist[i] = Math.hypot(a.x - cx, a.y - cy, a.z - cz);
      this.order.push(i);
    }
    if (n > this.opts.cap) this.order.sort(this.byDist);
    this.near.count = 0;
    this.far.count = 0;
    const m = Math.min(n, this.opts.cap);
    for (let k = 0; k < m; k++) {
      const i = this.order[k]!;
      const a = this.pool[i]!;
      if (a.scale <= 0.01) continue;
      simToThree(a.x, a.y, a.z, this.v, 0, 1);
      // 局部 +x 转到朝向（模拟 hx, hy → three (hx, −hy)）：绕 y 轴转 atan2(hy, hx)
      const yaw = Math.atan2(a.hy, a.hx);
      const look = this.look(a.seed);
      // 实例属性当场写进缓冲，直接传暂存数组（每帧不分配）
      if (this.dist[i]! < this.opts.nearM && this.near.count < this.near.capacity) this.near.put(this.v, yaw, a, look);
      else this.far.put(this.v, yaw, a, look);
    }
    this.near.commit();
    this.far.commit();
    this.drawn = this.near.count + this.far.count;
  }
}

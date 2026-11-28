/**
 * 近景行人图层（R4 STREET S-P0-1）：figure.ts 的平滑人形，一个实例化网格（1 个 draw call），HIGH 档 30 m 内、≤ 64 人。
 *
 * - 顶点着色器：发型形变（长发 / 齐耳）、男女肩宽、体宽、身高；步态（gait() 同一组常数：胯 / 膝 / 踝、肩 / 肘，
 *   上身反向扭转、每步起伏），看手机的人右前臂抬到胸前、头低 20°；选配件（裙、马尾、帽舌、包、手机）按实例显示。
 *   光照逐顶点：契约的 cityAmbient + 路灯（实例上 CPU 按 LampField 算的水平照度，朝上的面全收、竖面收约三分之一）
 *   + 铺面溢光（实例上 CPU 按 frontage-field 算的照度与来光方向，面向亮铺的一侧亮）× 逐顶点遮蔽。
 * - 片元着色器：按部件取色——外套 V 领露衬衫、背包 / 斜挎 / 托特包的背带、短袖、裙下露腿、口罩、侧分发缝、帽；
 *   手机屏是唯一的自发光（冷白 0.8，低于 bloom 阈值）。
 */
import { DynamicDrawUsage, InstancedBufferAttribute, Mesh, ShaderMaterial, type InstancedBufferGeometry } from 'three';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms } from '../materials/lighting';
import { FB, FP, GLSL_GAIT, PIVOT } from './figure';
import { HAIR_LENGTH, type Look } from './crowd';

const f = (v: number) => v.toFixed(4);
const v3 = (p: readonly number[]) => `vec3(${f(p[0]!)}, ${f(p[1]!)}, ${f(p[2]!)})`;

const COLOUR_VARYINGS = /* glsl */ `
varying vec3 vTop;
varying vec3 vBot;
varying vec3 vSkin;
varying vec3 vHair;
varying vec3 vShirt;
varying vec3 vShoe;
varying vec3 vBag;
`;

/**
 * 顶点属性（GLSL 里不写注释，省包体积）：
 * aRig = (部件, 骨骼 + 16 × 选配件, 关节混合, 沿肢体参数 u)；aMorph = (长发形变 xyz, 遮蔽)；
 * iPos = (three 坐标, 朝向角)；iAnim = (步态相位, 步态幅度, 身高缩放, 体宽)；
 * iTop = (上衣, 外套)；iBot = (下装, 裙)；iSkin = (肤色, 短袖)；iHair = (发色, 发型)；iShirt = (衬衫, 口罩)；
 * iShoe = (鞋, 女性)；iBag = (包 / 帽, 随身包)；iLamp = (路灯照度, 手机)；iShop = (铺面照度, 来光方向角)。
 */
const VERT = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_CITY_LIGHT}
${GLSL_GAIT}
attribute vec4 aRig;
attribute vec4 aMorph;
attribute vec4 iPos;
attribute vec4 iAnim;
attribute vec4 iTop;
attribute vec4 iBot;
attribute vec4 iSkin;
attribute vec4 iHair;
attribute vec4 iShirt;
attribute vec4 iShoe;
attribute vec4 iBag;
attribute vec4 iLamp;
attribute vec4 iShop;
uniform float uWarmth;
${COLOUR_VARYINGS}
varying vec3 vIrr;
varying vec3 vWorld;
varying vec3 vLocal;
varying float vPart;
varying float vU;
varying vec4 vFlags;
varying vec4 vFlags2;
varying vec3 vNv;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
void rotXY(inout vec3 p, inout vec3 n, vec3 pv, float a) {
p.xy = pv.xy + rot(a) * (p.xy - pv.xy);
n.xy = rot(a) * n.xy;
}
void main() {
float part = aRig.x;
float gate = floor(aRig.y / 16.0 + 0.01);
float bone = aRig.y - 16.0 * gate;
float bend = aRig.z;
float style = iHair.w;
float carry = iBag.w;
bool phone = iLamp.w > 0.5;
bool show = gate < 0.5
|| (gate < 1.5 && iBot.w > 0.5)
|| (gate > 1.5 && gate < 2.5 && abs(style - 4.0) < 0.5)
|| (gate > 2.5 && gate < 3.5 && abs(style - 5.0) < 0.5)
|| (gate > 3.5 && gate < 7.5 && abs(carry - (gate - 3.0)) < 0.5)
|| (gate > 7.5 && phone);
if (!show) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
vec3 p = position;
vec3 n = normal;
float rnd = fract(sin(dot(iTop.rgb * 7.1 + iBot.rgb * 3.3 + iSkin.rgb + iHair.rgb * 1.7, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
if (abs(part - ${FP.hair}.0) < 0.5) {
float len = style < 1.5 ? ${f(HAIR_LENGTH[0])} : (style < 2.5 ? ${f(HAIR_LENGTH[2])} : (style < 3.5 ? ${f(HAIR_LENGTH[3])} : 0.0));
p += aMorph.xyz * len;
if (abs(style - 1.0) < 0.5) p += normalize(p - vec3(0.0, 1.6, 0.0)) * 0.006 * smoothstep(1.62, 1.7, p.y);
if (abs(style - 5.0) < 0.5) p += normalize(p - vec3(0.0, 1.6, 0.0)) * 0.008 * smoothstep(1.6, 1.68, p.y);
}
bool female = iShoe.w > 0.5;
float shK = female ? 0.87 : 1.0;
float hipK = female ? 1.04 : 1.0;
bool armBone = bone > ${FB.upperL - 0.5} && bone < ${FB.foreR + 0.5};
if (bone < 1.5 || bone > ${FB.pack - 0.5}) {
float k = mix(hipK, shK, smoothstep(1.0, 1.34, p.y));
p.z *= k;
}
float side = p.z >= 0.0 ? 1.0 : -1.0;
if (armBone) p.z += side * (shK - 1.0) * 0.19;
float ph = iAnim.x / max(iAnim.z, 0.5) * (0.94 + 0.12 * rnd) + rnd * 6.2832;
float walk = iAnim.y;
vec4 legs;
vec4 arms;
vec2 body;
gaitAngles(ph, walk, legs, arms, body);
float idle = (1.0 - walk) * sin(uTime * (0.5 + 0.3 * rnd) + rnd * 6.0);
if (bone > ${FB.thighL - 0.5} && bone < ${FB.footR + 0.5}) {
bool left = bone < ${FB.thighR - 0.5};
float hip = left ? legs.x : legs.y;
float knee = left ? legs.z : legs.w;
float lb = left ? ${FB.thighL}.0 : ${FB.thighR}.0;
float lz = left ? -1.0 : 1.0;
vec3 kp = vec3(${f(PIVOT.knee[0])}, ${f(PIVOT.knee[1])}, lz * ${f(PIVOT.knee[2])});
vec3 ap = vec3(${f(PIVOT.ankle[0])}, ${f(PIVOT.ankle[1])}, lz * ${f(PIVOT.ankle[2])});
vec3 hp = vec3(${f(PIVOT.hip[0])}, ${f(PIVOT.hip[1])}, lz * ${f(PIVOT.hip[2])});
if (bone > lb + 1.5) rotXY(p, n, ap, -(hip - knee) * 0.85);
if (bone > lb + 0.5) rotXY(p, n, kp, -knee * (bone > lb + 1.5 ? 1.0 : bend));
else if (bend < 0.99) rotXY(p, n, kp, -knee * (1.0 - bend));
rotXY(p, n, hp, hip);
}
if (armBone) {
bool left = bone < ${FB.upperR - 0.5};
float sh = left ? arms.x : arms.y;
float el = left ? arms.z : arms.w;
sh += (1.0 - walk) * 0.03 * idle;
bool raise = phone && !left;
if (raise) { sh = 0.06; el = 1.38; }
float ub = left ? ${FB.upperL}.0 : ${FB.upperR}.0;
float lz = left ? -1.0 : 1.0;
vec3 ep = vec3(${f(PIVOT.elbow[0])}, ${f(PIVOT.elbow[1])}, lz * (${f(PIVOT.elbow[2])} + (shK - 1.0) * 0.19));
vec3 sp = vec3(${f(PIVOT.shoulder[0])}, ${f(PIVOT.shoulder[1])}, lz * (${f(PIVOT.shoulder[2])} + (shK - 1.0) * 0.19));
if (bone > ub + 0.5) {
float w = bend;
rotXY(p, n, ep, el * w);
if (raise) {
vec2 q = p.xz - ep.xz;
p.xz = ep.xz + rot(-0.42 * w) * q;
n.xz = rot(-0.42 * w) * n.xz;
}
} else if (bend < 0.99) {
rotXY(p, n, ep, el * (1.0 - bend));
}
rotXY(p, n, sp, sh);
}
if (bone > ${FB.head - 0.5} && bone < ${FB.head + 0.5}) {
float nod = (phone ? 0.35 : 0.0) + 0.02 * walk * cos(ph * 2.0);
rotXY(p, n, vec3(${v3(PIVOT.neck)}), -nod);
}
float tw = 0.0;
if (abs(bone - ${FB.chest}.0) < 0.5) tw = body.x * bend;
else if (armBone || abs(bone - ${FB.head}.0) < 0.5 || abs(bone - ${FB.pack}.0) < 0.5) tw = body.x;
if (tw != 0.0) {
p.xz = rot(tw) * p.xz;
n.xz = rot(tw) * n.xz;
}
p.y += body.y;
p.z += walk * 0.012 * sin(ph) + 0.012 * idle * smoothstep(0.3, 1.5, p.y);
vLocal = position;
p *= vec3(iAnim.z, iAnim.z, iAnim.z * iAnim.w);
float c = cos(iPos.w), s = sin(iPos.w);
vec3 w = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
vec3 wn = normalize(vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z) + vec3(0.0, 1e-5, 0.0));
vec4 world = modelMatrix * vec4(iPos.xyz + w, 1.0);
vWorld = world.xyz;
vec3 shopDir = vec3(cos(iShop.w), 0.0, -sin(iShop.w));
vec3 irr = cityAmbient(wn, p.y, uWarmth) * 1.1
+ iLamp.rgb * (0.3 + 0.7 * max(wn.y, 0.0)) * 0.55
+ iShop.rgb * (0.12 + 0.88 * max(dot(wn, shopDir), 0.0)) * 0.38;
vIrr = irr * aMorph.w;
vPart = part;
vU = aRig.w;
vFlags = vec4(iTop.w, iSkin.w, iBot.w, iShirt.w);
vFlags2 = vec4(style, female ? 1.0 : 0.0, carry, phone ? 1.0 : 0.0);
vNv = wn;
gl_Position = projectionMatrix * viewMatrix * world;
vTop = iTop.rgb;
vBot = iBot.rgb;
vSkin = iSkin.rgb;
vHair = iHair.rgb;
vShirt = iShirt.rgb;
vShoe = iShoe.rgb;
vBag = iBag.rgb;
}
`;


const FRAG = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${COLOUR_VARYINGS}
varying vec3 vIrr;
varying vec3 vWorld;
varying vec3 vLocal;
varying float vPart;
varying float vU;
varying vec4 vFlags;
varying vec4 vFlags2;
varying vec3 vNv;
bool isPart(float k) { return abs(vPart - k) < 0.5; }
void main() {
vec3 L = vLocal;
float az = abs(L.z);
bool jacket = vFlags.x > 0.5;
bool shortSleeve = vFlags.y > 0.5;
bool skirt = vFlags.z > 0.5;
bool mask = vFlags.w > 0.5;
float style = vFlags2.x;
float carry = vFlags2.z;
vec3 alb = vTop;
vec3 em = vec3(0.0);
float px = length(fwidth(vWorld));
float det = 1.0 - smoothstep(0.004, 0.02, px);
if (isPart(${FP.skin}.0)) {
alb = vSkin;
} else if (isPart(${FP.face}.0)) {
alb = vSkin;
if (L.x > 0.03) {
float e = (1.0 - smoothstep(0.005, 0.011, abs(L.y - 1.601))) * smoothstep(0.01, 0.018, az) * (1.0 - smoothstep(0.042, 0.052, az));
float br = (1.0 - smoothstep(0.003, 0.007, abs(L.y - 1.62))) * smoothstep(0.008, 0.016, az) * (1.0 - smoothstep(0.05, 0.058, az));
float mo = (1.0 - smoothstep(0.003, 0.006, abs(L.y - 1.536))) * (1.0 - smoothstep(0.016, 0.022, az));
alb = mix(alb * (1.0 - 0.5 * e * det - 0.3 * mo * det), vHair, 0.7 * br * det);
// 复审修正：脸不再是平涂的肤色椭圆（远近都有）——眉骨下、眼窝一条柔和的暗带，鼻梁略亮，两颊向侧面渐暗，下巴下暗
float sock = (1.0 - smoothstep(0.008, 0.022, abs(L.y - 1.603))) * smoothstep(0.004, 0.012, az) * (1.0 - smoothstep(0.04, 0.062, az));
float cheek = smoothstep(0.03, 0.075, az);
float chin = 1.0 - smoothstep(1.5, 1.53, L.y);
float nose = (1.0 - smoothstep(0.002, 0.01, az)) * step(1.55, L.y) * step(L.y, 1.6);
alb *= (1.0 - 0.3 * sock) * (1.0 - 0.22 * cheek) * (1.0 - 0.3 * chin) * (1.0 + 0.12 * nose);
}
if (mask && L.y > 1.505 && L.y < 1.58 && L.x > -0.01) alb = vec3(0.62, 0.7, 0.76);
if (L.y > 1.652) alb = mix(alb, vHair, smoothstep(1.652, 1.66, L.y));
} else if (isPart(${FP.hair}.0) || isPart(${FP.cap}.0)) {
alb = vHair;
alb *= 0.9 + 0.2 * smoothstep(1.66, 1.72, L.y);
if (abs(style - 1.0) < 0.5) alb = mix(alb, vSkin * 0.7, (1.0 - smoothstep(0.004, 0.01, abs(L.z - 0.03))) * step(1.68, L.y) * step(-0.04, L.x) * det);
if (abs(style - 5.0) < 0.5 && (L.y > 1.636 || isPart(${FP.cap}.0))) alb = vBag;
} else if (isPart(${FP.top}.0)) {
alb = vTop;
if (jacket) {
float v = (1.43 - L.y) * 0.35 + 0.012;
if (L.x > 0.04 && L.y > 1.08 && az < v) alb = vShirt;
if (L.y > 1.43) alb = vShirt;
}
if (abs(carry - 1.0) < 0.5 && L.y > 1.05 && abs(az - 0.1 - (1.42 - L.y) * 0.08) < 0.02) alb = vBag * 0.8;
if (abs(carry - 2.0) < 0.5 && abs((L.y - 1.4) + (0.13 - L.z) * 1.45) < 0.025 && L.y > 0.88) alb = vBag * 0.8;
if (abs(carry - 3.0) < 0.5 && L.z < -0.09 && L.z > -0.15 && L.y > 1.2) alb = vBag;
alb *= 0.9 + 0.1 * smoothstep(0.84, 0.95, L.y);
} else if (isPart(${FP.upperArm}.0)) {
alb = shortSleeve && vU > 0.45 ? vSkin : vTop;
} else if (isPart(${FP.foreArm}.0)) {
alb = shortSleeve ? vSkin : (jacket && vU > 1.85 ? vShirt : vTop);
} else if (isPart(${FP.bottom}.0)) {
alb = vBot;
if (skirt && L.y < 0.55) alb = vSkin * 0.85;
} else if (isPart(${FP.skirt}.0)) {
alb = vBot;
} else if (isPart(${FP.shoe}.0)) {
alb = vShoe;
} else if (isPart(${FP.bag}.0)) {
alb = vBag;
} else if (isPart(${FP.phone}.0)) {
alb = vec3(0.02);
em = PHONE_EM * step(0.0, dot(vNv, normalize(cameraPosition - vWorld)) + 0.2);
}
vec3 col = applyHaze(alb * vIrr, em, vWorld);
${GLSL_FINISH}
}
`;

function phoneEm(): string {
  const c = lightColour('tubeCool').multiplyScalar(0.8);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}

export function nearPeopleMaterial(warmth: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...sharedUniforms(), uWarmth: { value: warmth } },
    defines: { PHONE_EM: phoneEm() },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

/** 一个行人的照明（CPU 按路灯场 / 铺面溢光场算，近景图层写进实例）。 */
export interface PersonLight {
  lamp: readonly [number, number, number];
  shop: readonly [number, number, number];
  /** 来光方向（three 坐标绕 y 的角，cos → x、−sin → z）。 */
  shopYaw: number;
}

/** 近景图层的实例缓冲。 */
export class NearLayer {
  readonly mesh: Mesh;
  private readonly attrs: Record<string, InstancedBufferAttribute> = {};
  /** 同一批属性的数组（commit 每帧遍历，复审修正：不再每帧 Object.values 分配）。 */
  private readonly attrList: InstancedBufferAttribute[] = [];
  count = 0;

  constructor(
    readonly geo: InstancedBufferGeometry,
    mat: ShaderMaterial,
    readonly capacity: number,
  ) {
    for (const k of ['iPos', 'iAnim', 'iTop', 'iBot', 'iSkin', 'iHair', 'iShirt', 'iShoe', 'iBag', 'iLamp', 'iShop']) {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(DynamicDrawUsage);
      geo.setAttribute(k, a);
      this.attrs[k] = a;
      this.attrList.push(a);
    }
    geo.instanceCount = 0;
    this.mesh = new Mesh(geo, mat);
    this.mesh.name = 'pedestrians-detail';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
  }

  put(p: readonly number[], yaw: number, phase: number, walk: number, scale: number, look: Look, light: PersonLight): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    const A = this.attrs;
    A.iPos!.setXYZW(i, p[0]!, p[1]!, p[2]!, yaw);
    A.iAnim!.setXYZW(i, phase, walk, (look.height / 1.7) * scale, look.build);
    A.iTop!.setXYZW(i, look.top[0], look.top[1], look.top[2], look.jacket ? 1 : 0);
    A.iBot!.setXYZW(i, look.bottom[0], look.bottom[1], look.bottom[2], look.skirt ? 1 : 0);
    A.iSkin!.setXYZW(i, look.skin[0], look.skin[1], look.skin[2], look.shortSleeve ? 1 : 0);
    A.iHair!.setXYZW(i, look.hair[0], look.hair[1], look.hair[2], look.hairStyle);
    A.iShirt!.setXYZW(i, look.shirt[0], look.shirt[1], look.shirt[2], look.mask ? 1 : 0);
    A.iShoe!.setXYZW(i, look.shoe[0], look.shoe[1], look.shoe[2], look.female ? 1 : 0);
    A.iBag!.setXYZW(i, look.bag[0], look.bag[1], look.bag[2], look.carry);
    A.iLamp!.setXYZW(i, light.lamp[0], light.lamp[1], light.lamp[2], look.phone ? 1 : 0);
    A.iShop!.setXYZW(i, light.shop[0], light.shop[1], light.shop[2], light.shopYaw);
  }

  commit(): void {
    this.geo.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
    for (const a of this.attrList) {
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.count * 4);
    }
  }
}



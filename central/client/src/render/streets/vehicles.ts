/**
 * 车辆外形、真实营运商涂装与车灯（realism C5、R2 STREETLIFE S5，R3 LIVERIES 换成真实涂装）：
 * 私家车 / 的士 / MPV / 客货车共用一个 InstancedMesh，双层巴士 / 小巴共用一个（车身共 2 个 draw call），
 * 车灯全部进一个动态 GlowBatch（1 个 draw call）。同一网格里的几种车型是同一套拓扑的「变形目标」
 * （aPos1 / aPos2 …），顶点着色器按实例的 iVar 取，三角形数不随车型增加。
 *
 * R3（负责人 2026-11-26：营运商真实涂装、名称、车队编号、路线、目的地都要；车身广告仍虚构）：
 * - 城巴 2023 涂装（surfaces-facts §2，照片 04）：黄 #e2c100 车身、车尾蓝块 #015cb5（车顶 0–22 %、两层之间 0–26 %、裙脚 0–36 %），
 *   块前缘是一道向后倾约 24° 的红条 #d72630；两层黑色车窗带；车头两层之间是黑玻璃板，里面是路线显示屏；
 *   「城巴 [红色 C 标志] Citybus」深蓝字样在车头下部与两侧前轮后；车队编号 5 位（显示屏左端白字、前门旁黑字）。
 * - 九巴（§3，照片 05）：红色车身，车头下部银灰带上红色「KMB」，两侧车尾下部大号白色「KMB」；
 *   香槟金涂装只在 101 / 104 / 111。九巴白 / 橙那套（照片 06）状态未明，不做。
 * - 显示屏（§4）：黑底琥珀 LED（#e8ab36），中文目的地在上、英文大写在下、路线号在右（约两行高）；九巴 111 与「經:灣仔」轮换；
 *   车尾与前门旁另有路线号小屏（P1）。路线与目的地只取 transit-data.ts（liveries/fleet.ts 分配）。
 * - 约 35 % 巴士两层之间的侧面广告带是虚构广告（抽象色块，部分配一个招牌白名单行业通称）。
 * - 小巴（§5）：米色车身 #e6d9ad，绿色 #3f9a74 / 红色 #7a2630 车顶与车顶带，车顶带白字「PUBLIC LIGHT BUS 19 SEATS 公共小型巴士十九座位」；
 *   车顶前沿 LED 牌：绿色小巴 = 左边大路线号 + 右边中英文目的地，红色小巴 = 地名。
 * - 的士（§6，照片 09）：高车身（MPV 变形目标缩到 4.4 × 1.7 × 1.75 m），红 #c0303a 车身、银 #868b92 车顶 / 车柱 / 车窗以上、
 *   车头下部黑；车顶白色灯箱，前后红色「TAXI」，两侧竖排「的士」，亮 1.5–2.0。
 * - 私家车 / 客货车不挂任何牌子（深色、银、白为主）。
 * 字（营运商字样、目的地、路线号、车队编号、广告字）只在近处画（HIGH 60 m、LOW 30 m），更远只剩涂装色块（300 m 外仍是对的颜色）。
 * 字形来自共用图集 liveries/atlas.ts（'liveries:atlas'，≈ 1.3 MB）。
 * 几何局部坐标：车头朝 +x，y 向上，z 为车宽方向（左 = −z，香港上落客的一侧）。
 */
import {
  BufferAttribute,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Texture,
} from 'three';
import { threeToSim } from '../../coords';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms, type GlowBatch } from '../materials/lighting';
import { hash32 } from './lamp-placement';
import { PropBuilder, linearRGB, scale3, type V3 } from './prop-geometry';
import { VehicleKind } from './traffic';
import { liveryAtlasGlsl, liveryAtlasTexture } from './liveries/atlas';
import { Scheme, busLook, minibusLook, taxiLook, type FleetLook, type FleetOperator, type StopHint } from './liveries/fleet';

const GLASS: V3 = [0.02, 0.022, 0.026];

/** 光源色（亮度归一）× 亮度，作为顶点发光。 */
export function lightV3(name: string, k: number): V3 {
  const c = lightColour(name);
  return scale3([c.r, c.g, c.b], k);
}

/**
 * 车轮（R2 修复轮；复审修正）：每个轮子是外侧一块十边形黑色轮胎面 + 前面一块六边形灰色轮毂（半径 0.58 r，外凸 6 mm）
 * + 后面一块更暗的轮拱（方形，比轮大一圈），只画朝外的面：x 为各轴位置，半宽 hw，轮径 d。每轮 14 个三角形（原来八边形无轮毂，8 个）。
 */
function wheels(b: PropBuilder, axles: readonly number[], hw: number, d: number, _w: number): void {
  const tyre = { alb: [0.026, 0.026, 0.028] as V3 };
  const hub = { alb: [0.2, 0.2, 0.205] as V3 };
  const arch = { alb: [0.006, 0.006, 0.007] as V3 };
  const r = d / 2;
  for (const x of axles) {
    for (const side of [1, -1]) {
      const z = side * (hw + 0.005);
      const za = side * (hw - 0.02);
      // 轮拱：车身侧面上、轮子上半圈后面一块暗方块（比轮宽一圈），轮子下半圈露在路面前
      const ra = r + 0.06;
      const archQ: [V3, V3, V3, V3] = [
        [x - ra, r, za],
        [x + ra, r, za],
        [x + ra, r + ra, za],
        [x - ra, r + ra, za],
      ];
      if (side > 0) b.quad(archQ[0], archQ[1], archQ[2], archQ[3], arch);
      else b.quad(archQ[1], archQ[0], archQ[3], archQ[2], arch);
      // 轮胎面（十二边形扇）与轮毂（八边形扇，外凸一点免得 z-fighting）
      const ring = (n: number, rr: number, zz: number, k: number): V3 => {
        const a = (k / n) * Math.PI * 2;
        return [x + Math.cos(a) * rr, r + Math.sin(a) * rr, zz];
      };
      const fan = (n: number, rr: number, zz: number, style: { alb: V3 }) => {
        const c0 = ring(n, rr, zz, 0);
        for (let k = 1; k < n - 1; k++) {
          const c1 = ring(n, rr, zz, k);
          const c2 = ring(n, rr, zz, k + 1);
          if (side > 0) b.tri(c0, c1, c2, style);
          else b.tri(c0, c2, c1, style);
        }
      };
      fan(10, r, z, tyre);
      fan(6, r * 0.58, z + side * 0.006, hub);
    }
  }
}

/** 小汽车类的尺寸参数（同一套拓扑）。 */
interface CarDims {
  L: number;
  W: number;
  axles: [number, number];
  /** 下车身顶、车舱顶（m）。 */
  belt: number;
  roof: number;
  /** 车舱长、车舱中心 x、收顶比例。 */
  cabL: number;
  cabX: number;
  cabTop: [number, number];
  /** 车舱侧面是玻璃（3）还是车身（1，客货车）。 */
  cabPart: number;
}

const SEDAN: CarDims = { L: 4.6, W: 1.8, axles: [1.42, -1.38], belt: 0.86, roof: 1.42, cabL: 2.5, cabX: -0.25, cabTop: [0.72, 0.84], cabPart: 3 };
const MPV: CarDims = { L: 4.9, W: 1.85, axles: [1.5, -1.45], belt: 0.95, roof: 1.8, cabL: 3.7, cabX: -0.4, cabTop: [0.9, 0.9], cabPart: 3 };
const VAN: CarDims = { L: 5.0, W: 1.85, axles: [1.55, -1.5], belt: 1.0, roof: 2.0, cabL: 4.1, cabX: -0.42, cabTop: [0.97, 0.97], cabPart: 1 };

/** 的士 = MPV 变形目标按这个比例缩（4.41 × 1.70 × 1.75 m，Comfort Hybrid / JPN Taxi，照片 09）。 */
export const TAXI_SCALE: V3 = [0.9, 0.97, 0.92];
/** 的士顶灯箱（局部，宽 0.45 × 高 0.17 × 深 0.16 m）：车顶前部。 */
const SIGN = { w: 0.45, h: 0.17, d: 0.16 } as const;
const signX = (d: CarDims) => d.cabX + d.cabL * 0.5 * d.cabTop[0] - 0.32;

function carShape(d: CarDims): PropBuilder {
  const b = new PropBuilder();
  const body = { part: 1 };
  const dark = { alb: [0.014, 0.014, 0.016] as V3 };
  const hl = d.L / 2;
  wheels(b, d.axles, d.W / 2 + 0.02, 0.64, 0.24);
  // 底裙（轮拱之间的暗带）
  b.box([0, 0.16, 0], [d.L - 0.3, 0.2, d.W - 0.1], dark, { bottom: null, top: null });
  // 下车身：前后收窄成引擎盖 / 车尾的斜面（顶面 x 方向收 0.6 m 左右）
  b.box([0, 0.36, 0], [d.L, d.belt - 0.36, d.W], body, { bottom: null }, [1 - 0.5 / d.L, 0.95]);
  // 车舱：侧面玻璃（客货车为车身），车顶 part 2；前挡永远是玻璃
  const cab = { part: d.cabPart, alb: GLASS };
  b.box([d.cabX, d.belt, 0], [d.cabL, d.roof - d.belt, d.W - 0.16], cab, { bottom: null, top: { part: 2 }, px: { part: 3, alb: GLASS } }, d.cabTop);
  // 尾灯（车尾两侧各一盏 0.25 × 0.1 m，红）与日行灯带（车头，冷白）：只画朝外的一面
  for (const side of [1, -1])
    b.box([-hl + 0.16, d.belt - 0.2, side * (d.W / 2 - 0.22)], [0.04, 0.1, 0.25], { alb: [0.05, 0.01, 0.01], em: lightV3('tailLight', 1.7) }, { bottom: null, top: null, px: null, pz: null, nz: null });
  b.box([hl - 0.13, d.belt - 0.16, 0], [0.04, 0.06, d.W - 0.4], { alb: [0.3, 0.3, 0.3], em: lightV3('headlight', 1.2) }, { bottom: null, top: null, nx: null, pz: null, nz: null });
  // 的士顶灯箱（只在的士实例上画）：白色灯箱，前后红色 TAXI、两侧竖排「的士」由着色器画（R3）
  b.box([signX(d), d.roof - 0.02, 0], [SIGN.d, SIGN.h, SIGN.w], { part: 4, alb: [0.8, 0.8, 0.78], em: lightV3('lightboxWhite', 1.7) }, { bottom: null });
  return b;
}

/** 小汽车网格（私家车 / 的士 / MPV / 客货车，约 84 个三角形）。 */
export function carGeometry(): BufferGeometry {
  return morphGeometry([carShape(SEDAN), carShape(MPV), carShape(VAN)]);
}

interface BusDims {
  L: number;
  W: number;
  axles: number[];
  wheel: number;
  /** 各段高度：车身底、下层窗底、下层窗顶 / 腰线底、腰线顶 / 上层窗底、上层窗顶、车顶。 */
  y: [number, number, number, number, number, number];
  lowerEm: number;
  upperEm: number;
  /** 路线牌：位置（中心 y）、高、宽、底色发光；minibus 为车顶牌。 */
  sign: { x: number; y: number; h: number; w: number; em: V3 };
}

/**
 * 双层巴士（R3：按照片 04 的色带比例重排高度，裙脚 0 → 车顶 1：下层板 0–0.26、下层窗 0.26–0.52、两层之间 0.52–0.745、
 * 上层窗 0.745–0.97、车顶边 0.97–1；车身 0.30–4.35 m）。
 */
const DECKER: BusDims = {
  L: 12.4,
  W: 2.5,
  axles: [4.3, -2.6, -3.95],
  wheel: 1.0,
  y: [0.3, 1.35, 2.41, 3.32, 4.23, 4.35],
  // 整合（R2）：车厢灯整窗平均压到 vehicleCabin 中段（原 0.95 / 1.25，近看整块白板），与电车窗一致
  lowerEm: 0.75,
  upperEm: 0.95,
  // 路线显示屏在车头两层之间的黑玻璃板里（2.0 × 0.42 m）
  sign: { x: 6.2, y: 2.865, h: 0.42, w: 2.0, em: lightV3('#e8ab36', 0.06) },
};
const MINIBUS: BusDims = {
  L: 7.2,
  W: 2.1,
  axles: [2.45, -2.05, -2.05],
  wheel: 0.7,
  y: [0.28, 1.0, 1.92, 2.28, 2.28, 2.36],
  lowerEm: 0.8,
  upperEm: 0.01,
  sign: { x: 2.9, y: 2.5, h: 0.26, w: 1.5, em: lightV3('#e8ab36', 0.06) },
};

/**
 * 城巴 2023 涂装的车尾蓝块（surfaces-facts §2，照片 04 透视校正后实测）：蓝块前缘离车尾的长度比例在裙脚 36 %、车顶 22 %
 * （两层之间约 26 %），即向后倾约 24°；前缘是一道 0.18 m 宽的红条。车身高度比例 h：裙脚 0 → 车顶 1（0.30–4.35 m）。
 */
export const CITYBUS_BLOCK = { skirt: 0.36, roof: 0.22, stripeM: 0.18 } as const;

/** 蓝块前缘（离车尾的长度比例）在车身高度比例 h 处（纯函数，着色器同一公式）。 */
export function citybusEdge(h: number): number {
  const k = Math.min(Math.max(h, 0), 1);
  return CITYBUS_BLOCK.skirt - (CITYBUS_BLOCK.skirt - CITYBUS_BLOCK.roof) * k;
}

/** 城巴侧面某点的涂装色区：f = 离车尾的长度比例，h = 车身高度比例。 */
export function citybusZone(f: number, h: number): 'blue' | 'red' | 'yellow' {
  const e = citybusEdge(h);
  if (f < e) return 'blue';
  if (f < e + CITYBUS_BLOCK.stripeM / DECKER.L) return 'red';
  return 'yellow';
}

/** 显示屏几何常量（着色器用）。 */
export const DISPLAY = { decker: DECKER.sign, minibus: MINIBUS.sign, deckerY: DECKER.y } as const;

function busShape(d: BusDims): PropBuilder {
  const b = new PropBuilder();
  const win = (k: number) => ({ part: 3, alb: GLASS, em: lightV3('tubeCool', k), emGrad: [0.25, 1.15] as const });
  wheels(b, d.axles, d.W / 2 + 0.01, d.wheel, 0.3);
  const [y0, y1, y2, y3, y4, y5] = d.y;
  // 下车身、下层窗、腰线（小巴：车顶色带）、上层窗（小巴压扁为 0）、车顶
  b.box([0, y0, 0], [d.L, y1 - y0, d.W], { part: 1 }, { bottom: null });
  b.box([0, y1, 0], [d.L, y2 - y1, d.W], win(d.lowerEm), { bottom: null, top: null });
  b.box([0, y2, 0], [d.L, y3 - y2, d.W], { part: 2 }, { bottom: null, top: null });
  b.box([0, y3, 0], [d.L, Math.max(y4 - y3, 0.001), d.W], win(d.upperEm), { bottom: null, top: null });
  b.box([0, y4, 0], [d.L, y5 - y4, d.W], { part: 1 }, { bottom: null }, [0.99, 0.95]);
  // 路线牌：双层巴士在车头腰线上，小巴在车顶前沿；牌面凸出车身 3 cm（原来与车头面重合，z-fighting）
  const s = d.sign;
  b.box([s.x - 0.2 + 0.03, s.y - s.h / 2, 0], [0.4, s.h, s.w], { part: 5, alb: [0.02, 0.02, 0.02], em: s.em }, { bottom: null, nx: null });
  return b;
}

/** 巴士网格（双层巴士 / 小巴）。 */
export function busGeometry(): BufferGeometry {
  return morphGeometry([busShape(DECKER), busShape(MINIBUS)]);
}

/**
 * 同拓扑的几种外形合成一个几何：第 0 种为 position / normal / aAlb / aEm，其余外形的位置存 aPos1 / aPos2，
 * 三种外形的 part 合成 aParts（vec3）。法线、发光共用第 0 种（顶点属性上限 16 个，实例矩阵占 4 个）。
 */
function morphGeometry(shapes: PropBuilder[]): BufferGeometry {
  const g = shapes[0]!.build();
  const n = shapes[0]!.pos.length / 3;
  const parts = new Float32Array(n * 3);
  for (let k = 0; k < 3; k++) {
    const sh = shapes[Math.min(k, shapes.length - 1)]!;
    if (sh.pos.length !== shapes[0]!.pos.length) throw new Error('车型变形目标拓扑不一致');
    for (let i = 0; i < n; i++) parts[i * 3 + k] = sh.part[i]!;
    if (k > 0) g.setAttribute(`aPos${k}`, new BufferAttribute(new Float32Array(sh.pos), 3));
  }
  g.setAttribute('aParts', new BufferAttribute(parts, 3));
  g.deleteAttribute('aPart');
  return g;
}

// 顶点属性：position、normal、aAlb、aEm、aParts、aPos1、aPos2（7）+ 实例矩阵（4）+ iBody、iAcc、iVar、iTxt（4）= 15 ≤ 16
const VEHICLE_VERT = /* glsl */ `
attribute vec3 aAlb;
attribute vec3 aEm;
attribute vec3 aParts;
attribute vec3 aPos1;
attribute vec3 aPos2;
attribute vec3 iBody;
attribute vec4 iAcc;   // rgb 广告图形色，w 广告图案种子（0 = 无广告）
attribute vec4 iVar;   // x 车型变形目标（0/1/2），y 发光倍率（的士顶灯 / 车厢灯），z 路灯照度（亮度），w 钠灯比例
attribute vec4 iTxt;   // x 目的地格（+ 64 ×（「經」格 + 1）），y 路线号格，z 车队编号，w 涂装方案 + 16 ×（广告字 + 1）+ 256 ×（九巴车型 + 1）
uniform vec3 uLedLamp;
uniform vec3 uSodiumLamp;
varying vec3 vAlb;
varying float vVariant;
varying vec3 vLamp;
varying vec3 vEm;
varying float vPart;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec4 vAcc;
varying vec3 vBody;
varying vec3 vLN;
varying vec4 vTxt;
void main() {
  vec3 p = position;
  vec3 n = normal;
  float part = aParts.x;
  vec3 em = aEm;
  if (iVar.x > 0.5 && iVar.x < 1.5) { p = aPos1; part = aParts.y; }
  else if (iVar.x > 1.5) { p = aPos2; part = aParts.z; }
  // part 4：只在 iVar.y > 0.5 的实例上出现（的士顶灯）
  if (part > 3.5 && part < 4.5 && iVar.y < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vAlb = part > 0.5 && part < 2.5 ? iBody : aAlb;
  // 车厢灯（玻璃 part 3 的发光）只在 iVar.y > 0.5 的实例（巴士、小巴）上亮
  vEm = em * (part > 2.5 && part < 3.5 && iVar.y < 0.5 ? 0.0 : 1.0);
  vPart = part;
  vVariant = iVar.x;
  vLamp = mix(uLedLamp, uSodiumLamp, iVar.w) * iVar.z;
  vAcc = iAcc;
  vBody = iBody;
  vTxt = iTxt;
  vLocal = p;
  vLN = n;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 world = m * vec4(p, 1.0);
  vWorld = world.xyz;
  vN = normalize(mat3(m) * n);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const c3 = (hex: string) => {
  const c = linearRGB(hex);
  return `vec3(${c.map((v) => v.toFixed(4)).join(', ')})`;
};
const f3 = (v: readonly number[]) => `vec3(${v.map((x) => x.toFixed(4)).join(', ')})`;

/** 涂装色（sRGB，surfaces-facts §2、§3、§5、§6）。 */
export const LIVERY_HEX = {
  cbYellow: '#e2c100',
  cbBlue: '#015cb5',
  cbRed: '#d72630',
  cbNavy: '#1b2a5e',
  kmbRed: '#c0282c',
  kmbGold: '#c4b083',
  kmbSilver: '#9a9ea3',
  windowBlack: '#0a0b10',
  miniCream: '#e6d9ad',
  gmbGreen: '#3f9a74',
  rmbMaroon: '#7a2630',
  taxiRed: '#c0303a',
  taxiSilver: '#868b92',
  taxiFront: '#323232',
} as const;

const VEHICLE_FRAG = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
${liveryAtlasGlsl()}
uniform float uWarmth;
uniform float uTextFar;
uniform vec3 uAmber;
varying vec3 vAlb;
varying vec3 vEm;
varying float vPart;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec4 vAcc;
varying vec3 vBody;
varying vec3 vLN;
varying float vVariant;
varying vec3 vLamp;
varying vec4 vTxt;
float hashV(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float lumaV(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
// 城巴「C」标志：开口朝右的粗圆环（中心 c、外半径 r）
float cityC(vec2 p, vec2 c, float r) {
  vec2 q = p - c;
  float aa = fwidth(q.x) + 1e-4;
  float ring = abs(length(q) - r * 0.68) - r * 0.32;
  float open = smoothstep(-aa, aa, q.x - r * 0.05) * (1.0 - smoothstep(-aa, aa, abs(q.y) - r * 0.36));
  return (1.0 - smoothstep(-aa, aa, ring)) * (1.0 - open);
}
// 城巴字样「城巴 C Citybus」：中心 c、字高 h（p 与 c 同为观者右手坐标、上为 +y）；返回 x = 深蓝字、y = 红色 C
vec2 citybusMark(vec2 p, vec2 c, float h) {
  float wz = h * 2.0;
  float we = h * 4.0;
  float gap = h * 0.25;
  float total = wz + gap + h + gap + we;
  float x0 = c.x - total * 0.5;
  float v = (c.y + h * 0.5 - p.y) / h;
  float t = livTex(LIV_CBZH, vec2((p.x - x0) / wz, v)) + livTex(LIV_CBEN, vec2((p.x - x0 - wz - gap - h - gap) / we, v));
  float cm = cityC(p, vec2(x0 + wz + gap + h * 0.5, c.y), h * 0.5);
  return vec2(clamp(t, 0.0, 1.0), cm);
}
// 显示屏字形（屏内 uv：u 向右、v 向下）：双层巴士 = 中英文目的地 + 右边路线号；绿色小巴 = 左边路线号 + 目的地；红色小巴 = 地名
float displayText(vec2 uv, float scheme) {
  float dest = mod(vTxt.x, 64.0);
  float via = floor(vTxt.x / 64.0) - 1.0;
  // 「經」字幕与目的地每 3 s 轮换（九巴 111，照片 05）
  if (via >= 0.0 && mod(floor(uTime / 3.0), 2.0) > 0.5) dest = via;
  float m;
  if (scheme > 5.5) {
    m = livTex(livCell(LIV_BUSDEST, LIV_BUSDEST_COLS, dest), (uv - vec2(0.05, 0.04)) / vec2(0.9, 0.92));
  } else if (scheme > 4.5) {
    m = livTex(livCell(LIV_ROUTE, LIV_ROUTE_COLS, vTxt.y), (uv - vec2(0.03, 0.04)) / vec2(0.23, 0.92));
    m += livTex(livCell(LIV_BUSDEST, LIV_BUSDEST_COLS, dest), (uv - vec2(0.28, 0.04)) / vec2(0.7, 0.92));
  } else {
    m = livTex(livCell(LIV_BUSDEST, LIV_BUSDEST_COLS, dest), (uv - vec2(0.11, 0.05)) / vec2(0.6, 0.9));
    m += livTex(livCell(LIV_ROUTE, LIV_ROUTE_COLS, vTxt.y), (uv - vec2(0.74, 0.03)) / vec2(0.24, 0.94));
  }
  return clamp(m, 0.0, 1.0);
}
// LED 点阵：按点格（约 1 cm）量化取样，近处看得到点，远处退成平均
float ledDots(vec2 uv, vec2 grid, float scheme, out float avgK) {
  vec2 q = (floor(uv * grid) + 0.5) / grid;
  float m = displayText(q, scheme);
  float fw = fwidth(uv.x * grid.x);
  float dotK = mix(1.0 - smoothstep(0.3, 0.46, length(fract(uv * grid) - 0.5)), 0.62, smoothstep(0.3, 0.8, fw));
  avgK = dotK;
  return smoothstep(0.25, 0.6, m) * dotK;
}
// 双层巴士车身色（不含车窗带）：p = 局部坐标，ln = 局部法线
vec3 deckerColour(float scheme, vec3 p, vec3 ln) {
  if (scheme > 3.5) return KMB_GOLD;
  if (scheme > 2.5) return KMB_RED;
  // 城巴 2023：车头黄、车尾面蓝；侧面按高度算蓝块前缘（裙脚 36 % → 车顶 22 %，向后倾约 24°），前缘一道 0.18 m 红条
  if (ln.x > 0.5) return CB_YELLOW;
  if (ln.x < -0.5) return CB_BLUE;
  float h = clamp((p.y - 0.3) / 4.05, 0.0, 1.0);
  float f = (p.x + 6.2) / 12.4;
  float edge = ln.y > 0.5 ? CB_ROOF : CB_SKIRT - (CB_SKIRT - CB_ROOF) * h;
  float aa = fwidth(f) + 1e-4;
  vec3 c = mix(CB_BLUE, CB_RED, smoothstep(edge - aa, edge + aa, f));
  return mix(c, CB_YELLOW, smoothstep(edge + CB_STRIPE - aa, edge + CB_STRIPE + aa, f));
}
void main() {
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(abs(dot(n, V)), 0.0, 1.0), 4.0);
  vec3 alb = vAlb;
  vec3 em = vEm;
  float scheme = mod(floor(vTxt.w + 0.5), 16.0);
  float word = mod(floor((vTxt.w + 0.5) / 16.0), 16.0) - 1.0;
  float fleetClass = floor((vTxt.w + 0.5) / 256.0) - 1.0;
  bool decker = scheme > 1.5 && scheme < 4.5;
  bool mini = scheme > 4.5;
  bool taxi = scheme > 0.5 && scheme < 1.5;
  bool nearText = length(cameraPosition - vWorld) < uTextFar;
  vec3 ln = vLN;
  bool fFront = ln.x > 0.5;
  bool fRear = ln.x < -0.5;
  bool fSide = abs(ln.z) > 0.5;
  // 观者右手方向的坐标（字从左到右读）：车头面 −z、车尾面 +z、右侧面（+z）+x、左侧面 −x
  float px = fFront ? -vLocal.z : (fRear ? vLocal.z : (ln.z > 0.0 ? vLocal.x : -vLocal.x));
  float y = vLocal.y;
  float glass = vPart > 2.5 && vPart < 3.5 ? 1.0 : 0.0;
  bool bodyPart = vPart > 0.5 && vPart < 2.5;
  float spec = 0.25;
  vec3 roofC = scheme > 5.5 ? RMB_MAROON : GMB_GREEN;

  // ---- 车身涂装 ----
  if (bodyPart) {
    if (decker) {
      alb = deckerColour(scheme, vLocal, ln);
      // 车头两层之间是黑玻璃板（显示屏装在里面）
      if (fFront && vPart > 1.5) {
        alb = WINDOW_BLACK;
        spec = 0.6;
      }
      // 虚构车身广告（两侧两层之间的广告带，前轮之后到蓝块之前）：抽象色块，部分配一个白名单行业通称
      if (fSide && vPart > 1.5 && vAcc.w > 0.0 && vLocal.x > -2.4 && vLocal.x < 4.5) {
        float s = vAcc.w;
        float diag = fract((vLocal.x * 0.11 + y * 0.42) + s * 3.7);
        float circ = length(vec2(vLocal.x - (1.0 + (fract(s * 5.3) - 0.5) * 4.0), y - 2.86)) - (0.3 + fract(s * 9.1) * 0.25);
        float pick = fract(s * 17.0) < 0.5 ? step(0.62, diag) : step(circ, 0.0);
        alb = mix(vBody, vAcc.rgb, pick);
        if (word >= 0.0 && nearText) {
          float wm = livTex(livCell(LIV_ADWORDS, LIV_ADWORDS_COLS, word), vec2((px - (ln.z > 0.0 ? 1.2 : -2.3)) / 1.1, (3.2 - y) / 0.64));
          alb = mix(alb, lumaV(vBody) > 0.25 ? vec3(0.015) : vec3(0.85), wm);
        }
      }
      if (nearText) {
        if (scheme < 2.5) {
          // 城巴字样：两侧前轮之后（1.3 × 0.17 m）、车头下部（0.9 × 0.12 m）；前门旁黑色车队编号
          vec2 cm = vec2(0.0);
          if (fSide && vPart < 1.5) cm = citybusMark(vec2(px, y), vec2(ln.z > 0.0 ? 2.85 : -2.85, 0.8), 0.17);
          if (fFront && vPart < 1.5) cm = citybusMark(vec2(px, y), vec2(0.0, 0.74), 0.12);
          alb = mix(alb, CB_NAVY, cm.x);
          alb = mix(alb, CB_RED, cm.y);
          if (fSide && ln.z < 0.0 && vPart < 1.5) alb = mix(alb, vec3(0.01), clamp(livNumber(vec2(px, y), vec2(-5.45, 1.2), 0.07, vTxt.z), 0.0, 1.0));
        } else {
          // 九巴：车头下部银灰带 + 红色 KMB；两侧车尾下部大号白色 KMB（字高约 0.62 m）
          if (fFront && vPart < 1.5 && y > 0.45 && y < 0.88) {
            alb = KMB_SILVER;
            alb = mix(alb, KMB_RED, livTex(LIV_KMB, vec2((px + 0.3) / 0.6, (0.86 - y) / 0.2)));
          }
          if (fSide && vPart < 1.5) {
            float cx = ln.z > 0.0 ? -5.15 : 5.15;
            alb = mix(alb, vec3(0.88), livTex(LIV_KMB, vec2((px - cx + 0.95) / 1.9, (1.2 - y) / 0.64)));
            // 车队编号（P1）：前门旁白色小字「ATENU1668」式（车型前缀 + 号码）
            if (ln.z < 0.0 && fleetClass >= 0.0) {
              float m = livTex(livCell(LIV_KMBCLASS, LIV_KMBCLASS_COLS, fleetClass), vec2((px + 5.62) / 0.21, (1.235 - y) / 0.07));
              m += livNumber(vec2(px, y), vec2(-5.41 + 0.0196 * livDigits(vTxt.z), 1.2), 0.07, vTxt.z);
              alb = mix(alb, vec3(0.85), clamp(m, 0.0, 1.0));
            }
          }
        }
        // 车尾路线号小屏（P1）
        if (fRear && vPart > 1.5) {
          vec2 q = vec2(px, y) - vec2(0.0, 2.86);
          if (abs(q.x) < 0.3 && abs(q.y) < 0.16) {
            alb = vec3(0.01);
            float m = livTex(livCell(LIV_ROUTE, LIV_ROUTE_COLS, vTxt.y), vec2((q.x + 0.21) / 0.42, (0.15 - q.y) / 0.3));
            em += uAmber * 1.8 * smoothstep(0.25, 0.6, m);
          }
        }
      }
    } else if (mini) {
      alb = vPart > 1.5 || y > 2.2 ? roofC : MINI_CREAM;
      // 车顶带白字（两侧）：PUBLIC LIGHT BUS 19 SEATS 公共小型巴士十九座位
      if (nearText && fSide && vPart > 1.5) {
        float t = livTex(LIV_PLBEN, vec2((px + 2.2) / 1.6, (2.16 - y) / 0.1)) + livTex(LIV_PLBZH, vec2((px + 0.45) / 1.2, (2.16 - y) / 0.1));
        alb = mix(alb, vec3(0.86), clamp(t, 0.0, 1.0));
      }
    } else if (taxi) {
      // 红车身；车窗以上（车门上部）、车柱、车顶银色；车头下部黑
      alb = vPart > 1.5 || y > TAXI_BELT ? TAXI_SILVER : TAXI_RED;
      if (fFront && y < 0.55) alb = TAXI_FRONT;
      // 后门上的白字 TAXI（P1，照片 24）
      if (nearText && fSide && vPart < 1.5) {
        float cx = ln.z > 0.0 ? -0.8 : 0.8;
        alb = mix(alb, vec3(0.85), livTex(LIV_TAXI, vec2((px - cx + 0.17) / 0.34, (0.74 - y) / 0.1)));
      }
      spec = 0.4;
    }
  }

  // ---- 的士顶灯：白色灯箱，前后红色 TAXI，两侧竖排「的士」----
  if (vPart > 3.5 && vPart < 4.5) {
    float m = 0.0;
    if (nearText) {
      vec3 q = vLocal - TAXI_SIGN;
      if (abs(ln.x) > 0.5) m = livTex(LIV_TAXI, vec2((px + 0.2) / 0.4, (0.15 - q.y) / 0.13));
      else if (fSide) m = livTex(LIV_TAXIZH, vec2(((ln.z > 0.0 ? q.x : -q.x) + 0.06) / 0.12, (0.16 - q.y) / 0.15));
    }
    em = mix(em, TAXI_RED_LIT, m);
    alb = mix(alb, TAXI_RED, m);
  }

  // ---- 显示屏（part 5）：黑底琥珀 LED ----
  if (vPart > 4.5) {
    alb = vec3(0.015);
    if (fFront) {
      bool miniSign = mini;
      vec2 box = miniSign ? MINI_SIGN_WH : DECKER_SIGN_WH;
      float cy = miniSign ? MINI_SIGN_Y : DECKER_SIGN_Y;
      vec2 uv = vec2((px + box.x * 0.5) / box.x, (cy + box.y * 0.5 - y) / box.y);
      if (nearText) {
        float avgK;
        float m = ledDots(uv, box * 100.0, scheme, avgK);
        em += uAmber * 2.0 * m;
        // 城巴：显示屏左端白色车队编号（字高 0.065 m）
        if (scheme > 1.5 && scheme < 2.5) em += vec3(0.9) * clamp(livNumber(vec2(px, y), vec2(-box.x * 0.5 + 0.13, cy - 0.12), 0.065, vTxt.z), 0.0, 1.0);
      } else {
        // 远处：一条暗琥珀光带（字的平均亮度）
        em += uAmber * 0.5 * step(0.15, uv.y) * step(uv.y, 0.85) * step(0.08, uv.x) * step(uv.x, 0.97);
      }
    } else if (mini) {
      // 小巴车顶牌外壳 = 车顶色
      alb = roofC;
      em = vec3(0.0);
    }
  }

  // ---- 车窗 ----
  // 亮着的车窗（巴士 / 小巴，R2 修复轮）：上部天花带、下部座椅靠背暗带、中间 0–2 个人的头肩剪影；立柱 1.3 m 一格；车头 / 车尾深色窗框
  if (glass > 0.5 && dot(em, vec3(1.0)) > 0.01) {
    float endFace = step(0.5, abs(vLN.x));
    vec3 hue = em / max(dot(em, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    bool upper = vVariant < 0.5 && y > 2.9;
    vec2 band = vVariant < 0.5 ? (upper ? DECK_Y.zw : DECK_Y.xy) : vec2(1.0, 1.92);
    float t = clamp((y - band.x) / (band.y - band.x), 0.0, 1.0);
    // 车头 / 车尾的玻璃看进去是整个车厢的纵深，暗一些（不然车头是一块白板）
    // R3 整合：再压约两成（整窗平均约 0.45），与电车上下层、照片立面亮窗同一量级（原来侧看是两条白板）
    float level = (upper ? 0.56 : 0.48) * (endFace > 0.5 ? 0.45 : 1.0);
    // 复审修正（照片 04 / 05 / 22）：车厢不再是一块平的浅灰板——
    // 有色玻璃（× 0.55）、顶上一条很亮的灯带（t > 0.86）、下部座椅靠背一排（营运商颜色：城巴淡紫、九巴红 / 蓝、小巴深灰）、
    // 每 2.6 m 一根黄色扶手竖杆、乘客的头肩（衣服按灯色照亮，不再是悬空的蛋）
    float strip = smoothstep(0.86, 0.9, t) * (1.0 - smoothstep(0.97, 1.0, t));
    float prof = t > 0.78 ? 0.8 + 1.4 * strip : (t < 0.3 ? 0.1 : 0.55);
    vec3 inside = hue * level * prof;
    float coord = endFace > 0.5 ? vLocal.z / 1.2 + 0.5 : vLocal.x / 1.3;
    float cell = floor(coord + 0.5);
    float u = fract(coord + 0.5);
    float aa = fwidth(coord) + 1e-4;
    if (endFace < 0.5) {
      // 座椅靠背：每 0.8 m 一张（中间一条缝），顶边圆一点
      vec3 seatC = scheme > 3.5 ? vec3(0.32, 0.05, 0.05) : (scheme > 2.5 ? (fract(cell * 0.5) < 0.25 ? vec3(0.32, 0.05, 0.06) : vec3(0.06, 0.09, 0.24)) : (decker ? vec3(0.26, 0.17, 0.4) : vec3(0.08)));
      float sx = fract(vLocal.x / 0.8);
      float seatTop = 0.5 + 0.06 * (1.0 - pow(abs(sx - 0.5) * 2.0, 2.0));
      float awx = fwidth(vLocal.x / 0.8) + 1e-4;
      float seat = (1.0 - smoothstep(seatTop - 0.02, seatTop + 0.02, t)) * smoothstep(0.25, 0.3, t) * (1.0 - smoothstep(0.455 - awx, 0.455 + awx, abs(sx - 0.5)));
      inside = mix(inside, hue * level * 0.6 * seatC * 2.2, seat);
      // 黄色扶手竖杆（每两格窗一根，4 cm）
      float pu = fract(coord * 0.5 + 0.15);
      float pw = fwidth(coord * 0.5) + 1e-4;
      float pole = 1.0 - smoothstep(0.016 - pw, 0.016 + pw, abs(pu - 0.5));
      inside = mix(inside, hue * level * vec3(0.95, 0.72, 0.1) * 0.9, pole * step(0.06, t) * step(t, 0.9));
    }
    if (endFace < 0.5 && t > 0.3 && t < 0.78) {
      for (int k = 0; k < 2; k++) {
        float hk = hashV(vec2(cell * 1.7 + float(k) * 13.1, floor(y) + vLocal.z * 0.01 + vAcc.w * 7.0 + vTxt.z * 0.013));
        if (hk > (k == 0 ? 0.55 : 0.25)) continue;
        float cx = (k == 0 ? 0.3 : 0.68) + (hk - 0.25) * 0.15;
        float yh = band.x + (band.y - band.x) * 0.6;
        vec2 dh = vec2((u - cx) * 1.3, y - yh);
        float head = length(dh * vec2(1.0, 0.85)) - 0.11;
        float shoulders = max(abs(dh.x) - 0.22, -(dh.y + 0.13));
        shoulders = max(shoulders, dh.y + 0.14 - 0.5);
        float hw2 = fwidth(dh.x) + 1e-3;
        float mHead = 1.0 - smoothstep(-hw2, hw2, head);
        float mBody = (1.0 - smoothstep(-hw2, hw2, shoulders)) * step(dh.y, -0.1);
        vec3 skinC = hue * level * mix(0.55, 0.75, hk) * vec3(1.0, 0.78, 0.62);
        // 衣服：深蓝西装、白恤衫、米色、黑（被车厢灯照着，比座椅亮或暗，肩膀轮廓看得出）
        float hc = fract(hk * 7.3);
        vec3 clothC = hue * level * (hc < 0.35 ? vec3(0.07, 0.08, 0.13) : hc < 0.65 ? vec3(0.75) : hc < 0.85 ? vec3(0.5, 0.42, 0.3) : vec3(0.04));
        inside = mix(inside, clothC, mBody);
        inside = mix(inside, skinC * (0.75 + 0.5 * smoothstep(-0.11, 0.08, dh.y)), mHead);
      }
    }
    // 有色玻璃
    em = inside * 0.55;
    float post = smoothstep(0.44 - aa, 0.44 + aa, abs(u - 0.5));
    // 车头 / 车尾：深色窗框（两侧与上下 10 cm）
    if (endFace > 0.5) {
      float halfW = vVariant < 0.5 ? 1.25 : 1.05;
      float frame = max(step(halfW - 0.12, abs(vLocal.z)), max(step(y, band.x + 0.08), step(band.y - 0.08, y)));
      post = max(post, frame);
    }
    em *= 1.0 - 0.95 * post;
    // 窗柱：双层巴士是黑色车窗带（城巴 / 九巴都是），小巴是米色
    vec3 postC = decker ? WINDOW_BLACK : MINI_CREAM * 0.6;
    alb = mix(alb, postC, post);
    // 前门旁的路线号小屏（P1，左侧下层窗前端）
    if (decker && nearText && fSide && ln.z < 0.0 && !upper) {
      vec2 q = vec2(px, y) - vec2(-5.15, 2.12);
      if (abs(q.x) < 0.2 && abs(q.y) < 0.11) {
        float m = livTex(livCell(LIV_ROUTE, LIV_ROUTE_COLS, vTxt.y), vec2((q.x + 0.15) / 0.3, (0.1 - q.y) / 0.2));
        em = uAmber * 1.8 * smoothstep(0.25, 0.6, m);
        alb = vec3(0.01);
      }
    }
  }
  // 小汽车玻璃（不发光）：A / B / C 柱与窗下沿线、车里隐约的暗色（R2 修复轮）；的士车柱银色
  if (glass > 0.5 && dot(vEm, vec3(1.0)) <= 0.01 && abs(vLN.y) < 0.5) {
    vec3 cab = vVariant < 0.5 ? vec3(-0.25, 2.5, 0.86) : (vVariant < 1.5 ? vec3(-0.4, 3.7, 0.95) : vec3(-0.42, 4.1, 1.0));
    float endFace = step(0.6, abs(vLN.x));
    float uu = (vLocal.x - (cab.x - cab.y * 0.5)) / cab.y;
    float aa2 = fwidth(uu) + 1e-4;
    float pil = endFace > 0.5 ? step(0.78, abs(vLocal.z) / 0.82) : max(1.0 - smoothstep(0.1 - aa2, 0.1 + aa2, uu), max(smoothstep(0.88 - aa2, 0.88 + aa2, uu), 1.0 - smoothstep(0.03 - aa2, 0.03 + aa2, abs(uu - 0.52))));
    float sill = 1.0 - smoothstep(cab.z + 0.04, cab.z + 0.07, y);
    float m = max(pil, sill);
    alb = mix(vec3(0.035, 0.037, 0.04), taxi ? TAXI_SILVER : vBody, m);
    glass = 1.0 - m;
    // 复审修正：车里不是一片死黑——路灯斜照进车厢，看得见座椅头枕的剪影（侧窗）与仪表台的一点微光
    float tc = clamp((y - cab.z) / 0.5, 0.0, 1.0);
    float hr = endFace > 0.5 ? 0.0 : (1.0 - smoothstep(0.1, 0.13, abs(fract(uu * 2.0) - 0.5) * 0.9)) * smoothstep(0.35, 0.45, tc) * (1.0 - smoothstep(0.62, 0.7, tc));
    vec3 cabin = vLamp * 0.035 + vec3(0.008, 0.0085, 0.01);
    em += mix(cabin, cabin * 0.25, hr) * (1.0 - m);
  }
  // 复审修正：车身漆面按「相机白平衡」照（neutralLight：照度向自身亮度收六成），真实涂装的色相不被暖光带偏
  vec3 irrV = neutralLight(cityAmbient(n, y, uWarmth) + vLamp * mix(0.3, 0.85, max(n.y, 0.0)), 0.6);
  // 光面漆的环境反光（亮着的街、楼的漫反射，约 5 %、中性）：照片里城巴黄是 #cfb891 这种「带白」的黄，不是纯色块
  vec3 surface = alb * irrV + irrV * 0.05 * (1.0 - glass);
  surface += uHazeColor * fres * mix(spec, 0.6, glass) * max(n.y, 0.2);
  // 光面漆：路灯在车身上的一点高光（不反射天空）
  vec3 R = reflect(-V, n);
  surface += vLamp * pow(max(R.y, 0.0), 12.0) * 0.06 * (1.0 - glass);
  vec3 col = applyHaze(surface, em, vWorld);
  ${GLSL_FINISH}
}
`;

function vehicleMaterial(atlas: Texture | null, textFarM: number): ShaderMaterial {
  const H = LIVERY_HEX;
  const mpvSign = [signX(MPV), MPV.roof - 0.02, 0];
  return new ShaderMaterial({
    uniforms: {
      ...sharedUniforms(),
      uWarmth: { value: 0.4 },
      uLedLamp: { value: lightColour('ledWhite') },
      uSodiumLamp: { value: lightColour('sodium') },
      uLiv: { value: atlas },
      uTextFar: { value: textFarM },
      uAmber: { value: lightColour('#e8ab36') },
    },
    defines: {
      CB_YELLOW: c3(H.cbYellow),
      CB_SKIRT: CITYBUS_BLOCK.skirt.toFixed(4),
      CB_ROOF: CITYBUS_BLOCK.roof.toFixed(4),
      CB_STRIPE: (CITYBUS_BLOCK.stripeM / DECKER.L).toFixed(5),
      CB_BLUE: c3(H.cbBlue),
      CB_RED: c3(H.cbRed),
      CB_NAVY: c3(H.cbNavy),
      KMB_RED: c3(H.kmbRed),
      KMB_GOLD: c3(H.kmbGold),
      KMB_SILVER: c3(H.kmbSilver),
      WINDOW_BLACK: c3(H.windowBlack),
      MINI_CREAM: c3(H.miniCream),
      GMB_GREEN: c3(H.gmbGreen),
      RMB_MAROON: c3(H.rmbMaroon),
      TAXI_RED: c3(H.taxiRed),
      TAXI_SILVER: c3(H.taxiSilver),
      TAXI_FRONT: c3(H.taxiFront),
      TAXI_RED_LIT: f3(lightV3('#ff2a2a', 0.55)),
      TAXI_BELT: (MPV.belt - 0.1).toFixed(3),
      TAXI_SIGN: f3(mpvSign),
      DECKER_SIGN_WH: `vec2(${DECKER.sign.w.toFixed(3)}, ${DECKER.sign.h.toFixed(3)})`,
      DECKER_SIGN_Y: DECKER.sign.y.toFixed(3),
      MINI_SIGN_WH: `vec2(${MINIBUS.sign.w.toFixed(3)}, ${MINIBUS.sign.h.toFixed(3)})`,
      MINI_SIGN_Y: MINIBUS.sign.y.toFixed(3),
      DECK_Y: `vec4(${DECKER.y.slice(1, 5).map((v) => v.toFixed(3)).join(', ')})`,
    },
    vertexShader: VEHICLE_VERT,
    fragmentShader: VEHICLE_FRAG,
  });
}

/** 私家车颜色（sRGB）：深色、银、白为主。 */
const CAR_COLOURS = ['#1b1c1e', '#2b2e33', '#3c4046', '#8b9096', '#a9adb1', '#d8dadb', '#e4e4e0', '#1e2a3c', '#4a1e22', '#2f3a2f'];
const VAN_WHITE = '#e4e4e0';

/** 一辆车的外观（纯函数，可测）。 */
export interface VehicleLook {
  /** 车身色（私家车）/ 广告底色（巴士）。 */
  body: string;
  /** 广告图形色。 */
  acc: string;
  /** 广告图案种子（0 = 无广告）。 */
  wrap: number;
  /** 变形目标（小汽车：0 轿车 / 1 MPV（的士也用）/ 2 客货车；巴士网格：0 双层 / 1 小巴）。 */
  variant: number;
  /** 发光开关（的士顶灯、巴士车厢灯）。 */
  emit: number;
  /** 营运商涂装（私家车、客货车为 Scheme.Car）。 */
  fleet: FleetLook;
}

const GENERIC: FleetLook = { scheme: Scheme.Car, dest: -1, via: -1, routeCell: -1, fleet: 0, fleetClass: -1, ad: 0, word: -1, adColours: ['#000000', '#000000'] };

/** 车型的外观（纯函数，可测）：seed = 车辆下标；hint = 开场停靠的车站（巴士挂该站的路线）。 */
export function vehicleLook(kind: number, seed: number, hint?: StopHint): VehicleLook {
  const h = (k: number) => hash32(seed * 2654435761 + k * 97) / 4294967296;
  switch (kind) {
    case VehicleKind.Taxi:
      return { body: LIVERY_HEX.taxiRed, acc: LIVERY_HEX.taxiSilver, wrap: 0, variant: 1, emit: 1, fleet: taxiLook() };
    case VehicleKind.Mpv: {
      const c = CAR_COLOURS[Math.floor(h(1) * CAR_COLOURS.length)]!;
      return { body: c, acc: c, wrap: 0, variant: 1, emit: 0, fleet: GENERIC };
    }
    case VehicleKind.Van:
      return { body: VAN_WHITE, acc: VAN_WHITE, wrap: 0, variant: 2, emit: 0, fleet: GENERIC };
    case VehicleKind.Bus: {
      const f = busLook(seed, hint);
      return { body: f.adColours[0], acc: f.adColours[1], wrap: f.ad, variant: 0, emit: 1, fleet: f };
    }
    case VehicleKind.Minibus:
      return { body: LIVERY_HEX.miniCream, acc: LIVERY_HEX.miniCream, wrap: 0, variant: 1, emit: 1, fleet: minibusLook(seed) };
    default: {
      const c = CAR_COLOURS[hash32(seed) % CAR_COLOURS.length]!;
      return { body: c, acc: c, wrap: 0, variant: 0, emit: 0, fleet: GENERIC };
    }
  }
}

/** 着色器 iTxt：目的地格（+ 64 ×（「經」+ 1））、路线号格、车队编号、方案 + 16 ×（广告字 + 1）+ 256 ×（九巴车型 + 1）。 */
export function textAttr(f: FleetLook): [number, number, number, number] {
  return [Math.max(f.dest, 0) + (f.via >= 0 ? 64 * (f.via + 1) : 0), f.routeCell, f.fleet, f.scheme + 16 * (f.word + 1) + 256 * (f.fleetClass + 1)];
}

/** 车辆实例（一个 InstancedMesh）+ 实例属性。 */
function instanced(geo: BufferGeometry, capacity: number, name: string, material: ShaderMaterial) {
  const body = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const acc = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const vari = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const txt = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  geo.setAttribute('iBody', body);
  geo.setAttribute('iAcc', acc);
  geo.setAttribute('iVar', vari);
  geo.setAttribute('iTxt', txt);
  const mesh = new InstancedMesh(geo, material, capacity);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  return { mesh, body, acc, vari, txt };
}

export interface VehiclePose {
  x: number;
  y: number;
  z: number;
  /** 水平朝向（three xz 单位向量）。 */
  hx: number;
  hz: number;
  kind: number;
  /** 刹车 / 停车。 */
  brake: boolean;
  /** 颜色种子。 */
  seed: number;
}

/** 调试钩子 __central.vehicles() 的一项（模拟坐标，米；heading 弧度自东逆时针）。 */
export interface VehicleDebug {
  kind: 'car' | 'taxi' | 'bus' | 'minibus' | 'mpv' | 'van';
  operator?: FleetOperator;
  route?: string;
  x: number;
  y: number;
  /** 路面高程 mPD。 */
  z: number;
  heading: number;
  speed: number;
}

const KIND_NAMES: VehicleDebug['kind'][] = ['car', 'taxi', 'bus', 'minibus', 'mpv', 'van'];

const HEAD_COLOUR = lightColour('headlight');
const TAIL_COLOUR = lightColour('tailLight');
/** 各车型半长（m）、灯高（头灯、尾灯，m）、半宽（m）。 */
const HALF_LEN = [2.3, 2.2, 6.2, 3.6, 2.45, 2.5];
const HEAD_Y = [0.7, 0.75, 0.8, 0.75, 0.78, 0.8];
const TAIL_Y = [0.85, 0.9, 1.0, 0.95, 0.9, 0.9];
const HALF_W = [0.7, 0.68, 0.95, 0.8, 0.72, 0.72];

/** 每辆车的外观（线性色 + 变形目标 + 发光 + 字），按车辆下标缓存：车型在重置后不变，每帧不再解析颜色字符串。 */
interface LookCache {
  kind: number;
  /** body rgb、acc rgb + wrap、variant、emit、iTxt（4）（13 个数）。 */
  v: Float32Array;
  fleet: FleetLook;
}

/** 路灯照度来源（tram/trackbed.ts LampField）。 */
export interface LampSource {
  at(x: number, y: number, z: number, out: [number, number, number], lift?: number): number;
}

/** 车身实例与车灯。 */
export class VehicleRenderer {
  readonly cars: InstancedMesh;
  readonly buses: InstancedMesh;
  private readonly carAttr: ReturnType<typeof instanced>;
  private readonly busAttr: ReturnType<typeof instanced>;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly one = new Vector3(1, 1, 1);
  private readonly taxiScale = new Vector3(...TAXI_SCALE);
  private readonly up = new Vector3(0, 1, 0);
  private readonly c = new Color();
  private readonly looks: (LookCache | undefined)[] = [];
  private readonly lampE: [number, number, number] = [0, 0, 0];
  private hints = new Map<number, StopHint>();

  constructor(
    capCars: number,
    capBuses: number,
    /** 近处车身受路灯照（车顶、引擎盖在灯下看得出颜色）；不给就只有城市环境光。 */
    private readonly lampField: LampSource | null = null,
    /** 字（营运商字样、目的地、路线号、车队编号）只在这个距离内画（HIGH 60 m、LOW 30 m）。 */
    textFarM = 60,
  ) {
    const atlas = liveryAtlasTexture();
    this.carAttr = instanced(carGeometry(), Math.max(capCars, 1), 'cars', vehicleMaterial(atlas, textFarM));
    this.busAttr = instanced(busGeometry(), Math.max(capBuses, 1), 'buses', vehicleMaterial(atlas, textFarM));
    this.cars = this.carAttr.mesh;
    this.buses = this.busAttr.mesh;
  }

  /** 开场停在站上的巴士挂该站真实停靠的路线（liveries/fleet.ts busStopHints）。 */
  setStopHints(hints: Map<number, StopHint>): void {
    this.hints = hints;
    this.looks.length = 0;
  }

  /**
   * 写一帧：poses 为全部车辆；lights 从 start 起写车灯，返回下一个下标。
   */
  write(poses: readonly VehiclePose[], camera: Camera, lights: GlowBatch, start: number, bodyM = Infinity): number {
    let nc = 0;
    let nb = 0;
    let li = start;
    const cam = camera.position;
    const body2 = bodyM * bodyM;
    for (const v of poses) {
      const bus = v.kind === VehicleKind.Bus || v.kind === VehicleKind.Minibus;
      const a = bus ? this.busAttr : this.carAttr;
      // 车身只画相机 bodyM 米内的（更远的车只是几个像素，靠车灯光点就够）：三角形不随车数线性涨
      const ddx = v.x - cam.x;
      const ddy = v.y - cam.y;
      const ddz = v.z - cam.z;
      const nearBody = ddx * ddx + ddy * ddy + ddz * ddz < body2;
      const idx = nearBody ? (bus ? nb++ : nc++) : a.mesh.instanceMatrix.count;
      if (idx < a.mesh.instanceMatrix.count) {
        this.q.setFromAxisAngle(this.up, Math.atan2(-v.hz, v.hx));
        this.m.compose(this.p.set(v.x, v.y, v.z), this.q, v.kind === VehicleKind.Taxi ? this.taxiScale : this.one);
        a.mesh.setMatrixAt(idx, this.m);
        const L = this.lookOf(v.kind, v.seed).v;
        a.body.setXYZ(idx, L[0]!, L[1]!, L[2]!);
        a.acc.setXYZW(idx, L[3]!, L[4]!, L[5]!, L[6]!);
        a.txt.setXYZW(idx, L[9]!, L[10]!, L[11]!, L[12]!);
        // 路灯照度（亮度 + 钠灯比例）：只给 80 m 内的车算（远处看不出来）
        const e = this.lampE;
        let lum = 0;
        let sodium = 0;
        if (this.lampField && ddx * ddx + ddz * ddz < 6400) {
          sodium = this.lampField.at(v.x, v.y, v.z, e, 1.2);
          lum = Math.min(0.2126 * e[0] + 0.7152 * e[1] + 0.0722 * e[2], 3);
        }
        a.vari.setXYZW(idx, L[7]!, L[8]!, lum, sodium);
      }
      // 车灯：朝向相机的一端亮
      const k = v.kind;
      const half = HALF_LEN[k] ?? 2.3;
      const dx = cam.x - v.x;
      const dz = cam.z - v.z;
      const dl = Math.hypot(dx, dz) || 1;
      const facing = (v.hx * dx + v.hz * dz) / dl;
      const headK = 0.1 + 0.9 * smooth(-0.25, 0.6, facing);
      const tailK = 0.1 + 0.9 * smooth(-0.25, 0.6, -facing);
      const sx = -v.hz;
      const sz = v.hx;
      const hw = HALF_W[k] ?? 0.7;
      for (let side = -1; side <= 1; side += 2) {
        // 头灯光点：复审修正——原来半径 12 cm，的士近看是两块大白圆盘；巴士 9 cm、其余 6 cm
        lights.setXYZ(li++, v.x + v.hx * half + sx * hw * side, v.y + (HEAD_Y[k] ?? 0.7), v.z + v.hz * half + sz * hw * side, HEAD_COLOUR, 8 * headK, k === 2 ? 0.09 : 0.06);
        // 尾灯光点：小而不刺眼（原来 1.8–3、半径 10 cm，近看是两团粉红大圆盘）
        lights.setXYZ(
          li++,
          v.x - v.hx * half + sx * (hw - 0.05) * side,
          v.y + (TAIL_Y[k] ?? 0.85),
          v.z - v.hz * half + sz * (hw - 0.05) * side,
          TAIL_COLOUR,
          (v.brake ? 2.2 : 1.2) * tailK,
          0.07,
        );
      }
    }
    for (const [a, n] of [
      [this.carAttr, nc],
      [this.busAttr, nb],
    ] as const) {
      a.mesh.count = Math.min(n, a.mesh.instanceMatrix.count);
      a.mesh.visible = a.mesh.count > 0;
      a.mesh.instanceMatrix.needsUpdate = true;
      a.body.needsUpdate = true;
      a.acc.needsUpdate = true;
      a.vari.needsUpdate = true;
      a.txt.needsUpdate = true;
    }
    return li;
  }

  /** 调试钩子：全部车辆（模拟坐标，米）。speeds[i] = 第 i 辆车的速度（m/s，traffic.v）。 */
  debug(poses: readonly VehiclePose[], speeds: ArrayLike<number>): VehicleDebug[] {
    return poses.map((v, i) => {
      const [x, y, z] = threeToSim(v.x, v.y, v.z);
      const f = this.lookOf(v.kind, v.seed).fleet;
      const out: VehicleDebug = { kind: KIND_NAMES[v.kind] ?? 'car', x: x / 10, y: y / 10, z: z / 10, heading: Math.atan2(-v.hz, v.hx), speed: speeds[i] ?? 0 };
      if (f.operator) out.operator = f.operator;
      if (f.route) out.route = f.route;
      return out;
    });
  }

  /** 第 seed 号车的外观（线性色等 13 个数），按车辆下标缓存。 */
  private lookOf(kind: number, seed: number): LookCache {
    const hit = this.looks[seed];
    if (hit && hit.kind === kind) return hit;
    const look = vehicleLook(kind, seed, this.hints.get(seed));
    const v = new Float32Array(13);
    for (const [o, hex] of [
      [0, look.body],
      [3, look.acc],
    ] as const) {
      this.c.set(hex);
      v[o] = this.c.r;
      v[o + 1] = this.c.g;
      v[o + 2] = this.c.b;
    }
    v[6] = look.wrap;
    v[7] = look.variant;
    v[8] = look.emit;
    v.set(textAttr(look.fleet), 9);
    const entry = { kind, v, fleet: look.fleet };
    this.looks[seed] = entry;
    return entry;
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

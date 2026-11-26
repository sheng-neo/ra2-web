/**
 * 车辆外形与车灯（realism C5，R2 STREETLIFE S5 加车型）：
 * 私家车 / 出租车 / MPV / 客货车共用一个 InstancedMesh，双层巴士 / 小巴共用一个（车身共 2 个 draw call），
 * 车灯全部进一个动态 GlowBatch（1 个 draw call）。同一网格里的几种车型是同一套拓扑的「变形目标」
 * （aPos1 / aPos2 …），顶点着色器按实例的 iVar 取，三角形数不随车型增加。
 * - 私家车 4.6 × 1.8 × 1.48 m；MPV 4.9 × 1.85 × 1.82 m；白色客货车 5.0 × 1.85 × 2.0 m（车厢侧面是车身色，不是玻璃）。
 *   引擎盖 / 车尾收成斜面，玻璃上画 A / B / C 柱与窗下沿，八边形轮面 + 暗轮拱，两盏小尾灯；近处（80 m 内）的车身受路灯照。
 * - 出租车：法定红色车身 #c41e1e、银色车顶、车顶亮着的空白顶灯箱（不写字）。
 * - 双层巴士 12.4 × 2.5 × 4.4 m、三轴（后面两轴）、平直车头：车窗在着色器里画成车厢——上部天花带略亮、下部 40 % 座椅靠背暗带、
 *   中间每格 0–2 个受灯照亮的头肩剪影，立柱 1.3 m 一格，车头 / 车尾深色窗框（上层平均约 0.7、下层约 0.6）；
 *   车头上下层之间橙色 LED 路线牌（凸出车头 3 cm，只有光点、没有文字）。
 *   涂装：5 种通用双色（浅灰 + 青、白 + 紫、暖灰 + 靛蓝、银 + 藏青、白 + 青柠），不仿任何营运商；约 30 % 抽象色块车身广告（不写字、无标志）。
 * - 小巴 7.2 × 2.1 × 2.6 m + 0.25 m 车顶牌：米色车身 #e2d6a8，车顶色带红（70 %）或绿（30 %，法定颜色），
 *   车顶亮着的白色路线牌（只有红 / 绿色块，不写字），车厢冷白光 0.5–0.7。
 * - 车灯：头灯白（6–9），尾灯红（1.5–3，刹车 / 停车时取上限），亮度按车头 / 车尾是否朝向相机调整。
 * 几何局部坐标：车头朝 +x，y 向上，z 为车宽方向。
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
} from 'three';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms, type GlowBatch } from '../materials/lighting';
import { hash32 } from './lamp-placement';
import { PropBuilder, scale3, type V3 } from './prop-geometry';
import { VehicleKind } from './traffic';

const GLASS: V3 = [0.02, 0.022, 0.026];

/** 光源色（亮度归一）× 亮度，作为顶点发光。 */
export function lightV3(name: string, k: number): V3 {
  const c = lightColour(name);
  return scale3([c.r, c.g, c.b], k);
}

/**
 * 车轮（R2 修复轮）：每个轮子是外侧一块八边形轮面（轮毂略亮）+ 后面一块更暗的轮拱（方形，比轮大一圈），
 * 只画朝外的面：x 为各轴位置，半宽 hw，轮径 d。每轮 8 个三角形。
 */
function wheels(b: PropBuilder, axles: readonly number[], hw: number, d: number, _w: number): void {
  const tyre = { alb: [0.032, 0.032, 0.034] as V3 };
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
      // 八边形轮面：扇形 6 个三角形（用 3 个四边形拼：上、中、下）
      const P = (k: number): V3 => {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        return [x + Math.cos(a) * r, r + Math.sin(a) * r, z];
      };
      const quads: [number, number, number, number][] = [
        [0, 1, 2, 3],
        [3, 4, 7, 0],
        [4, 5, 6, 7],
      ];
      for (const [a, b2, c, d2] of quads) {
        if (side > 0) b.quad(P(a), P(b2), P(c), P(d2), tyre);
        else b.quad(P(b2), P(a), P(d2), P(c), tyre);
      }
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
  // 出租车顶灯（只在出租车实例上画）
  b.box([d.cabX - 0.1, d.roof - 0.06, 0], [0.5, 0.2, 0.3], { part: 4, alb: [0.8, 0.8, 0.78], em: lightV3('lightboxWhite', 1.25) }, { bottom: null });
  return b;
}

/** 小汽车网格（私家车 / 出租车 / MPV / 客货车，约 84 个三角形）。 */
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
  /** 路线牌：位置（中心 y）、高、宽、颜色 / 亮度；minibus 为车顶牌。 */
  sign: { x: number; y: number; h: number; w: number; em: V3 };
}

const DECKER: BusDims = {
  L: 12.4,
  W: 2.5,
  axles: [4.3, -2.6, -3.95],
  wheel: 1.0,
  y: [0.3, 1.05, 2.1, 2.6, 3.75, 4.35],
  // 整合（R2）：车厢灯整窗平均压到 vehicleCabin 中段（原 0.95 / 1.25，近看整块白板），与电车窗一致
  lowerEm: 0.75,
  upperEm: 0.95,
  sign: { x: 6.2, y: 2.35, h: 0.36, w: 1.8, em: lightV3('#ff8a1e', 1.9) },
};
const MINIBUS: BusDims = {
  L: 7.2,
  W: 2.1,
  axles: [2.45, -2.05, -2.05],
  wheel: 0.7,
  y: [0.28, 1.0, 1.92, 2.28, 2.28, 2.36],
  lowerEm: 0.8,
  upperEm: 0.01,
  sign: { x: 2.9, y: 2.5, h: 0.26, w: 1.5, em: lightV3('lightboxWhite', 1.0) },
};

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
  // 路线牌：双层巴士在车头腰线上（橙色 LED），小巴在车顶前沿（白色灯箱）
  const s = d.sign;
  // 牌面凸出车身 3 cm（原来与车头面重合，z-fighting 时只剩两个边点）
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

const VEHICLE_VERT = /* glsl */ `
attribute vec3 aAlb;
attribute vec3 aEm;
attribute vec3 aParts;
attribute vec3 aPos1;
attribute vec3 aPos2;
attribute vec3 iBody;
attribute vec3 iBand;
attribute vec4 iAcc;   // rgb 广告第二色，w 广告图案种子（0 = 无广告）
attribute vec4 iVar;   // x 车型变形目标（0/1/2），y 发光倍率（出租车顶灯 / 车厢灯），z 路灯照度（亮度），w 钠灯比例
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
void main() {
  vec3 p = position;
  vec3 n = normal;
  float part = aParts.x;
  vec3 em = aEm;
  if (iVar.x > 0.5 && iVar.x < 1.5) { p = aPos1; part = aParts.y; }
  else if (iVar.x > 1.5) { p = aPos2; part = aParts.z; }
  // part 5：路线牌——双层巴士橙色 LED（aEm），小巴为白色灯箱
  if (part > 4.5 && iVar.x > 0.5) em = MINI_SIGN;
  // part 4：只在 iVar.y > 0.5 的实例上出现（出租车顶灯）
  if (part > 3.5 && part < 4.5 && iVar.y < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 alb = aAlb;
  if (part > 0.5 && part < 1.5) alb = iBody;
  if (part > 1.5 && part < 2.5) alb = iBand;
  vAlb = alb;
  // 车厢灯（玻璃 part 3 的发光）只在 iVar.y > 0.5 的实例（巴士、小巴）上亮
  vEm = em * (part > 2.5 && part < 3.5 && iVar.y < 0.5 ? 0.0 : 1.0);
  vPart = part;
  vVariant = iVar.x;
  vLamp = mix(uLedLamp, uSodiumLamp, iVar.w) * iVar.z;
  vAcc = iAcc;
  vBody = iBody;
  vLocal = p;
  vLN = n;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 world = m * vec4(p, 1.0);
  vWorld = world.xyz;
  vN = normalize(mat3(m) * n);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const VEHICLE_FRAG = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
uniform float uWarmth;
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
float hashV(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(abs(dot(n, V)), 0.0, 1.0), 4.0);
  vec3 alb = vAlb;
  vec3 em = vEm;
  float glass = vPart > 2.5 && vPart < 3.5 ? 1.0 : 0.0;
  // 抽象色块车身广告（只在车身色 part 1 上；不写字、无标志）
  if (vPart > 0.5 && vPart < 1.5 && vAcc.w > 0.0) {
    float s = vAcc.w;
    float diag = fract((vLocal.x * 0.18 + vLocal.y * 0.35) + s * 3.7);
    float circ = length(vec2(vLocal.x - (fract(s * 5.3) - 0.5) * 8.0, vLocal.y - 1.8)) - (1.2 + fract(s * 9.1) * 1.5);
    float pick = fract(s * 17.0) < 0.5 ? step(0.55, diag) : step(circ, 0.0);
    alb = mix(vBody, vAcc.rgb, pick);
  }
  // 亮着的车窗（巴士 / 小巴，R2 修复轮）：与电车窗同一套——上部 28 % 天花带（灯管，略亮）、下部 40 % 座椅靠背暗带、
  // 中间是车厢（冷白）里 0–2 个人的头肩剪影（皮肤 / 衣服受灯管照亮，不是黑点）；立柱 1.3 m 一格；车头 / 车尾有深色窗框与中柱
  if (glass > 0.5 && dot(em, vec3(1.0)) > 0.01) {
    float endFace = step(0.5, abs(vLN.x));
    vec3 hue = em / max(dot(em, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    bool upper = vVariant < 0.5 && vLocal.y > 2.4;
    vec2 band = vVariant < 0.5 ? (upper ? vec2(2.6, 3.75) : vec2(1.05, 2.1)) : vec2(1.0, 1.92);
    float t = clamp((vLocal.y - band.x) / (band.y - band.x), 0.0, 1.0);
    // 车头 / 车尾的玻璃看进去是整个车厢的纵深，暗一些（不然车头是一块白板）
    float level = (upper ? 0.72 : 0.62) * (endFace > 0.5 ? 0.45 : 1.0);
    float prof = t > 0.72 ? 1.3 : (t < 0.4 ? 0.12 : 1.0);
    vec3 inside = hue * level * prof;
    float coord = endFace > 0.5 ? vLocal.z / 1.2 + 0.5 : vLocal.x / 1.3;
    float cell = floor(coord + 0.5);
    float u = fract(coord + 0.5);
    float aa = fwidth(coord) + 1e-4;
    // 头肩剪影（侧面每格 0–2 人；车头一格最多 1 人）
    if (endFace < 0.5 && t > 0.3 && t < 0.78) {
      for (int k = 0; k < 2; k++) {
        float hk = hashV(vec2(cell * 1.7 + float(k) * 13.1, floor(vLocal.y) + vLocal.z * 0.01 + vAcc.w * 7.0 + vBody.r * 31.0));
        if (hk > (k == 0 ? 0.55 : 0.25)) continue;
        float cx = (k == 0 ? 0.3 : 0.68) + (hk - 0.25) * 0.15;
        float yh = band.x + (band.y - band.x) * 0.6;
        vec2 dh = vec2((u - cx) * 1.3, vLocal.y - yh);
        float head = length(dh * vec2(1.0, 0.85)) - 0.11;
        float shoulders = max(abs(dh.x) - 0.22, -(dh.y + 0.13));
        shoulders = max(shoulders, dh.y + 0.14 - 0.5);
        float hw2 = fwidth(dh.x) + 1e-3;
        float mHead = 1.0 - smoothstep(-hw2, hw2, head);
        float mBody = (1.0 - smoothstep(-hw2, hw2, shoulders)) * step(dh.y, -0.1);
        vec3 skinC = hue * mix(0.3, 0.42, hk) * vec3(1.0, 0.78, 0.62);
        vec3 clothC = hue * (hk < 0.3 ? 0.05 : 0.16);
        inside = mix(inside, clothC, mBody);
        inside = mix(inside, skinC * (0.75 + 0.5 * smoothstep(-0.11, 0.08, dh.y)), mHead);
      }
    }
    em = inside;
    float post = smoothstep(0.44 - aa, 0.44 + aa, abs(u - 0.5));
    // 车头 / 车尾：深色窗框（两侧与上下 10 cm）
    if (endFace > 0.5) {
      float halfW = vVariant < 0.5 ? 1.25 : 1.05;
      float frame = max(step(halfW - 0.12, abs(vLocal.z)), max(step(vLocal.y, band.x + 0.08), step(band.y - 0.08, vLocal.y)));
      post = max(post, frame);
    }
    em *= 1.0 - 0.95 * post;
    alb = mix(alb, vBody * 0.5, post);
  }
  // 小汽车玻璃（不发光）：A / B / C 柱与窗下沿线、车里隐约的暗色（R2 修复轮）
  if (glass > 0.5 && dot(vEm, vec3(1.0)) <= 0.01 && abs(vLN.y) < 0.5) {
    vec3 cab = vVariant < 0.5 ? vec3(-0.25, 2.5, 0.86) : (vVariant < 1.5 ? vec3(-0.4, 3.7, 0.95) : vec3(-0.42, 4.1, 1.0));
    float endFace = step(0.6, abs(vLN.x));
    float uu = (vLocal.x - (cab.x - cab.y * 0.5)) / cab.y;
    float aa2 = fwidth(uu) + 1e-4;
    float pil = endFace > 0.5 ? step(0.78, abs(vLocal.z) / 0.82) : max(1.0 - smoothstep(0.1 - aa2, 0.1 + aa2, uu), max(smoothstep(0.88 - aa2, 0.88 + aa2, uu), 1.0 - smoothstep(0.03 - aa2, 0.03 + aa2, abs(uu - 0.52))));
    float sill = 1.0 - smoothstep(cab.z + 0.04, cab.z + 0.07, vLocal.y);
    float m = max(pil, sill);
    alb = mix(vec3(0.035, 0.037, 0.04), vBody, m);
    glass = 1.0 - m;
    em += vec3(0.006, 0.0062, 0.007) * (1.0 - m);
  }
  vec3 surface = alb * (cityAmbient(n, vLocal.y, uWarmth) + vLamp * mix(0.3, 0.85, max(n.y, 0.0)));
  surface += uHazeColor * fres * mix(0.25, 0.6, glass) * max(n.y, 0.2);
  vec3 col = applyHaze(surface, em, vWorld);
  ${GLSL_FINISH}
}
`;

function vehicleMaterial(): ShaderMaterial {
  const w = lightV3('lightboxWhite', 1.0);
  return new ShaderMaterial({
    uniforms: { ...sharedUniforms(), uWarmth: { value: 0.4 }, uLedLamp: { value: lightColour('ledWhite') }, uSodiumLamp: { value: lightColour('sodium') } },
    defines: { MINI_SIGN: `vec3(${w.map((v) => v.toFixed(4)).join(', ')})` },
    vertexShader: VEHICLE_VERT,
    fragmentShader: VEHICLE_FRAG,
  });
}

/** 私家车颜色（sRGB）：深色、银、白为主。 */
const CAR_COLOURS = ['#1b1c1e', '#2b2e33', '#3c4046', '#8b9096', '#a9adb1', '#d8dadb', '#e4e4e0', '#1e2a3c', '#4a1e22', '#2f3a2f'];
const TAXI_RED = '#c41e1e';
const TAXI_ROOF = '#b9bcbf';
const VAN_WHITE = '#e4e4e0';
/** 双层巴士通用双色涂装（车身、腰线）：不仿任何营运商。 */
export const BUS_LIVERIES: readonly (readonly [string, string])[] = [
  ['#c9cdd0', '#1f7a7a'],
  ['#e6e6e2', '#5a3d8a'],
  ['#dad7d0', '#3f4a86'],
  ['#b7bcc1', '#1f2f55'],
  ['#e6e6e2', '#5f9a2a'],
];
/** 车身广告配色（主色、副色）。 */
const WRAP_COLOURS = ['#d23c3c', '#2a6fd6', '#f0b429', '#25a18e', '#8e44ad', '#e8e8e8', '#1c1c1c', '#f06292'];
export const MINIBUS_CREAM = '#e2d6a8';
export const MINIBUS_RED = '#84343b';
export const MINIBUS_GREEN = '#2f6b45';

/** 车型的外观（纯函数，可测）：车身、腰线 / 车顶色、广告副色与种子（0 = 无）、变形目标、发光倍率。 */
export function vehicleLook(kind: number, seed: number): { body: string; band: string; acc: string; wrap: number; variant: number; emit: number } {
  const h = (k: number) => hash32(seed * 2654435761 + k * 97) / 4294967296;
  switch (kind) {
    case VehicleKind.Taxi:
      return { body: TAXI_RED, band: TAXI_ROOF, acc: TAXI_RED, wrap: 0, variant: 0, emit: 1 };
    case VehicleKind.Mpv: {
      const c = CAR_COLOURS[Math.floor(h(1) * CAR_COLOURS.length)]!;
      return { body: c, band: c, acc: c, wrap: 0, variant: 1, emit: 0 };
    }
    case VehicleKind.Van:
      return { body: VAN_WHITE, band: VAN_WHITE, acc: VAN_WHITE, wrap: 0, variant: 2, emit: 0 };
    case VehicleKind.Bus: {
      if (h(2) < 0.3) {
        const a = WRAP_COLOURS[Math.floor(h(3) * WRAP_COLOURS.length)]!;
        const b = WRAP_COLOURS[(Math.floor(h(3) * WRAP_COLOURS.length) + 1 + Math.floor(h(4) * (WRAP_COLOURS.length - 1))) % WRAP_COLOURS.length]!;
        return { body: a, band: a, acc: b, wrap: 0.05 + 0.95 * h(5), variant: 0, emit: 1 };
      }
      const [body, band] = BUS_LIVERIES[Math.floor(h(6) * BUS_LIVERIES.length)]!;
      return { body, band, acc: body, wrap: 0, variant: 0, emit: 1 };
    }
    case VehicleKind.Minibus:
      return { body: MINIBUS_CREAM, band: h(7) < 0.7 ? MINIBUS_RED : MINIBUS_GREEN, acc: MINIBUS_CREAM, wrap: 0, variant: 1, emit: 1 };
    default: {
      const c = CAR_COLOURS[hash32(seed) % CAR_COLOURS.length]!;
      return { body: c, band: c, acc: c, wrap: 0, variant: 0, emit: 0 };
    }
  }
}

/** 车辆实例（一个 InstancedMesh）+ 实例属性。 */
function instanced(geo: BufferGeometry, capacity: number, name: string) {
  const body = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const band = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const acc = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const vari = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  geo.setAttribute('iBody', body);
  geo.setAttribute('iBand', band);
  geo.setAttribute('iAcc', acc);
  geo.setAttribute('iVar', vari);
  const mesh = new InstancedMesh(geo, vehicleMaterial(), capacity);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  return { mesh, body, band, acc, vari };
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

const HEAD_COLOUR = lightColour('headlight');
const TAIL_COLOUR = lightColour('tailLight');
/** 各车型半长（m）、灯高（头灯、尾灯，m）、半宽（m）。 */
const HALF_LEN = [2.3, 2.3, 6.2, 3.6, 2.45, 2.5];
const HEAD_Y = [0.7, 0.7, 0.8, 0.75, 0.78, 0.8];
const TAIL_Y = [0.85, 0.85, 1.0, 0.95, 0.9, 0.9];
const HALF_W = [0.7, 0.7, 0.95, 0.8, 0.72, 0.72];

/** 每辆车的外观（线性色 + 变形目标 + 发光），按车辆下标缓存：车型在重置后不变，每帧不再解析颜色字符串。 */
interface LookCache {
  kind: number;
  /** body rgb、band rgb、acc rgb + wrap、variant、emit（10 个数）。 */
  v: Float32Array;
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
  private readonly up = new Vector3(0, 1, 0);
  private readonly c = new Color();
  private readonly looks: (LookCache | undefined)[] = [];
  private readonly lampE: [number, number, number] = [0, 0, 0];

  constructor(
    capCars: number,
    capBuses: number,
    /** 近处车身受路灯照（车顶、引擎盖在灯下看得出颜色）；不给就只有城市环境光。 */
    private readonly lampField: LampSource | null = null,
  ) {
    this.carAttr = instanced(carGeometry(), Math.max(capCars, 1), 'cars');
    this.busAttr = instanced(busGeometry(), Math.max(capBuses, 1), 'buses');
    this.cars = this.carAttr.mesh;
    this.buses = this.busAttr.mesh;
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
        this.m.compose(this.p.set(v.x, v.y, v.z), this.q, this.one);
        a.mesh.setMatrixAt(idx, this.m);
        const L = this.lookOf(v.kind, v.seed);
        a.body.setXYZ(idx, L[0]!, L[1]!, L[2]!);
        a.band.setXYZ(idx, L[3]!, L[4]!, L[5]!);
        a.acc.setXYZW(idx, L[6]!, L[7]!, L[8]!, L[9]!);
        // 路灯照度（亮度 + 钠灯比例）：只给 80 m 内的车算（远处看不出来）
        const e = this.lampE;
        let lum = 0;
        let sodium = 0;
        if (this.lampField && ddx * ddx + ddz * ddz < 6400) {
          sodium = this.lampField.at(v.x, v.y, v.z, e, 1.2);
          lum = Math.min(0.2126 * e[0] + 0.7152 * e[1] + 0.0722 * e[2], 3);
        }
        a.vari.setXYZW(idx, L[10]!, L[11]!, lum, sodium);
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
        lights.setXYZ(li++, v.x + v.hx * half + sx * hw * side, v.y + (HEAD_Y[k] ?? 0.7), v.z + v.hz * half + sz * hw * side, HEAD_COLOUR, 9 * headK, 0.12);
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
      a.band.needsUpdate = true;
      a.acc.needsUpdate = true;
      a.vari.needsUpdate = true;
    }
    return li;
  }

  /** 第 seed 号车的外观（线性色等 12 个数），按车辆下标缓存。 */
  private lookOf(kind: number, seed: number): Float32Array {
    const hit = this.looks[seed];
    if (hit && hit.kind === kind) return hit.v;
    const look = vehicleLook(kind, seed);
    const v = new Float32Array(12);
    for (const [o, hex] of [
      [0, look.body],
      [3, look.band],
      [6, look.acc],
    ] as const) {
      this.c.set(hex);
      v[o] = this.c.r;
      v[o + 1] = this.c.g;
      v[o + 2] = this.c.b;
    }
    v[9] = look.wrap;
    v[10] = look.variant;
    v[11] = look.emit;
    this.looks[seed] = { kind, v };
    return v;
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * 路面材质（realism 契约：线性 HDR、applyHaze、GLSL_FINISH）。
 * 车行道：中性灰沥青（细颗粒 + 浅色骨料 + 修补块）、白色分道虚线、双向路中央白线、主路路边双黄线；不画方向箭头。
 * 路缘：0.3 m 浅灰花岗岩路缘石（#a8a294，每 1 m 一道缝）+ 0.15 m 立面暗边 + 路边排水暗线。
 * 人行道（R3 STATIONS，照片 17）：核心区是火烧面灰花岗岩板（600 × 300 mm 错缝 / 600 × 600 mm 对缝，冷浅灰、逐块 ±8 %、
 * 3–4 mm 深缝），路缘旁偶有钢坑盖；海旁与码头（WATERFRONT 半平面以北）是 200 × 100 mm 红褐陶土砖（编篮纹）。近铺面一侧有店铺溢光。
 * 过路处贴片（R3）：灯控过路处是两行银色路钉（相距 2.8 m，Ø 0.1 m、每 0.5 m 一颗，灯下反光）+ 来车方向 0.25 m 停车线，
 * 无灯控才画斑马线；两头路缘处写「LOOK RIGHT 望右」（单行路来车在左的一侧写 LOOK LEFT 望左 ←，字从车站图集取），
 * 降低的路缘后是 1.2 m 深的黄色触觉警示砖（300 mm 砖、每块 6 × 6 个圆点）。
 * 路灯光斑：与 streets/lamp-placement 同一规则（第 k 盏在沿线 φ + k·S、排布代码决定左右），在 shader 里解析计算，
 * 灯下 0.10–0.25、两灯之间 0.015–0.05（主路沿线 ≥ 3:1）；湿路面按 uWetness 变暗并叠加灯的竖向拉长倒影。
 * 侧板、底面、挡土墙（FLAG_SIDE）画成混凝土，挡土墙带排水孔格。
 *
 * 顶点属性见 ribbon.ts（aRoad、aLane、aLamp、aStreet、aPav、aDir）。
 */
import { ShaderMaterial, Vector4 } from 'three';
import { ROAD_TEXT_M, stationsAtlas, type AtlasRect } from '../stations/atlas';
import { GLSL_HASH } from './common';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms } from './lighting';

/**
 * 海旁铺地（红褐陶土砖）的分界半平面（模拟米）：a·x + b·y + c > 0 为海旁（码头前地、海滨长廊，约在民耀街 / 龙和道以北）。
 * 由中环码头一带的路网与岸线目测定（R3 STATIONS），地形材质同一条线。
 */
export const WATERFRONT_LINE = [0.2615, 1, -522.3] as const;

/** GLSL：海旁系数 0–1（sim = 模拟坐标米）。 */
export const GLSL_WATERFRONT = /* glsl */ `
float waterfront(vec2 sim) {
  return smoothstep(-2.0, 2.0, ${WATERFRONT_LINE[0].toFixed(4)} * sim.x + ${WATERFRONT_LINE[1].toFixed(4)} * sim.y + ${WATERFRONT_LINE[2].toFixed(2)});
}
`;

/**
 * 黄色方格路口（R3 STATIONS S-R4 P1，照片 20）：德辅道中四个路口（模拟米）：中心、德辅道走向（单位向量）、沿德辅道 / 横跨德辅道的半长。
 * 由真实数据里德辅道中两条车道中线与横街中线的交点定（中心 = 两交点中点，横跨半长 = 两车道中线距离 / 2 + 3.2 m，
 * 沿路半长 = 横街车道半宽 + 0.5 m），整个路口连电车轨道一起画（轨道板着色器同一函数）。
 */
export const YELLOW_BOXES: readonly { name: string; c: readonly [number, number]; along: readonly [number, number]; ha: number; hc: number }[] = [
  { name: 'DVRC / Queen Victoria St', c: [123.65, 142.05], along: [0.6, -0.8], ha: 4.8, hc: 9.1 },
  { name: 'DVRC / Pedder St', c: [300.95, -96.6], along: [0.563, -0.826], ha: 4.8, hc: 8.4 },
  { name: 'DVRC / Jubilee St', c: [89.2, 186.65], along: [0.627, -0.778], ha: 4.8, hc: 9.5 },
  { name: 'DVRC / Pottinger St', c: [167.05, 84.75], along: [0.621, -0.784], ha: 4.8, hc: 8.75 },
];

/** GLSL：黄色方格遮罩 0–1（sim = 模拟坐标米，aa = 像素大小米）：0.2 m 外框 + 两组 45° 斜线（2.2 m 一道、0.15 m 宽）。 */
export const GLSL_YELLOW_BOX = /* glsl */ `
float yellowBox(vec2 sim, float aa) {
  float m = 0.0;
${YELLOW_BOXES.map(
  (b) => `  {
    vec2 d = sim - vec2(${b.c[0].toFixed(2)}, ${b.c[1].toFixed(2)});
    vec2 A = vec2(${b.along[0].toFixed(3)}, ${b.along[1].toFixed(3)});
    float la = dot(d, A);
    float lc = dot(d, vec2(-A.y, A.x));
    vec2 e = vec2(${b.ha.toFixed(2)}, ${b.hc.toFixed(2)}) - abs(vec2(la, lc));
    if (e.x > -0.05 && e.y > -0.05) {
      float rim = 1.0 - smoothstep(0.2 - aa, 0.2 + aa, min(e.x, e.y));
      float u = abs(fract((la + lc) / 2.2) - 0.5) * 2.2;
      float v = abs(fract((la - lc) / 2.2) - 0.5) * 2.2;
      float x = max(1.0 - smoothstep(0.075 - aa, 0.075 + aa, u), 1.0 - smoothstep(0.075 - aa, 0.075 + aa, v));
      x = mix(x, 0.13, smoothstep(0.1, 0.4, aa));
      m = max(m, max(rim, x) * step(0.0, min(e.x, e.y)));
    }
  }`,
).join('\n')}
  return m;
}
`;

/**
 * GLSL：人行道 / 广场铺地反照率（线性）。p = 铺地坐标（米，x 沿主方向）；px = 像素大小（米）；seed 0–100；wf = 海旁系数。
 * 灰花岗岩板：每 30 m 一段随机取 600 × 300 错缝或 600 × 600 对缝；红褐陶土砖：200 × 100 编篮纹（200 mm 方格里两块，横竖相间）。
 * 像素大于砖缝时退成平均色（远处不闪）。
 */
export const GLSL_PAVING = /* glsl */ `
vec3 pavingAlbedo(vec2 p, float px, float seed, float wf) {
  float near = 1.0 - smoothstep(0.02, 0.08, px);
  float mid = 1.0 - smoothstep(0.12, 0.4, px);
  // 灰花岗岩板
  float square = step(hash12(vec2(floor(p.x / 30.0), seed)), 0.35);
  vec2 cell = square > 0.5 ? vec2(0.6, 0.6) : vec2(0.6, 0.3);
  float row = floor(p.y / cell.y);
  vec2 g = vec2(p.x / cell.x + (square > 0.5 ? 0.0 : 0.5 * mod(row, 2.0)), p.y / cell.y);
  vec2 f = abs(fract(g) - 0.5);
  vec2 aa = max(fwidth(g), vec2(1e-4));
  vec2 jw = 0.0035 / cell;
  float joint = max(smoothstep(0.5 - jw.x - aa.x, 0.5 + aa.x, f.x), smoothstep(0.5 - jw.y - aa.y, 0.5 + aa.y, f.y)) * mid;
  float tone = mix(0.5, hash12(floor(g) + seed * 1.7), mid);
  float speck = mix(0.5, hash12(floor(p * 90.0)), near);
  vec3 granite = vec3(0.092, 0.093, 0.101) * (0.92 + 0.16 * tone) * (0.94 + 0.12 * speck) * (1.0 - 0.45 * joint);
  // 红褐陶土砖（编篮纹）
  vec2 q = p / 0.2;
  vec2 qi = floor(q);
  vec2 qf = fract(q);
  float vert = mod(qi.x + qi.y, 2.0);
  float half_ = vert > 0.5 ? qf.x : qf.y;
  vec2 bf = abs(vec2(fract(half_ * 2.0), vert > 0.5 ? qf.y : qf.x) - 0.5);
  vec2 qaa = max(fwidth(q) * 2.0, vec2(1e-4));
  float bj = max(smoothstep(0.47 - qaa.x, 0.5, bf.x), smoothstep(0.47 - qaa.y, 0.5, bf.y)) * (1.0 - smoothstep(0.03, 0.08, px));
  float bt = mix(0.5, hash12(qi * 2.0 + floor(half_ * 2.0) + seed), mid);
  vec3 brick = vec3(0.11, 0.066, 0.054) * (0.85 + 0.3 * bt) * (1.0 - 0.4 * bj);
  return mix(granite, brick, wf);
}
`;

/** 路灯在灯下路面的照度（乘反照率 = 出射亮度）：白光 LED / 钠灯。 */
export const POOL_LED = 2.3;
export const POOL_SODIUM = 1.9;
/** 灯头发光亮度（EMISSIVE.lampHead 6–20）：白光 LED / 钠灯。 */
export const HEAD_LED = 12;
export const HEAD_SODIUM = 8;

const vertexShader = /* glsl */ `
attribute vec4 aRoad;
attribute vec2 aLane;
attribute vec4 aLamp;
attribute vec4 aStreet;
attribute vec2 aPav;
attribute vec2 aDir;
varying vec4 vRoad;
varying vec2 vLane;
varying vec4 vLamp;
varying vec4 vStreet;
varying vec2 vPav;
varying vec2 vDir;
varying vec3 vWorld;
void main() {
  vRoad = aRoad;
  vLane = aLane;
  vLamp = aLamp;
  vStreet = aStreet;
  vPav = aPav;
  vDir = aDir;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  // 过路处贴片（FLAG_CROSSING）只比路面高 3 cm：鸟瞰 1–1.5 km 时深度精度（约 6–13 cm）分不开，
  // 在裁剪空间里往相机拉一点（NDC 2e-6，约等于多边形偏移；近处只有毫米级）
  if (mod(floor((aLane.y + 0.5) / 16.0), 2.0) > 0.5) gl_Position.z -= 2e-6 * gl_Position.w;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HASH}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
${GLSL_WATERFRONT}
${GLSL_PAVING}
${GLSL_YELLOW_BOX}
uniform sampler2D uAtlas;
uniform vec4 uLookR;
uniform vec4 uLookL;
uniform float uHasAtlas;
uniform vec3 uLed;
uniform vec3 uSodium;
uniform vec3 uShop;
uniform float uHeadLed;
uniform float uHeadSodium;
varying vec4 vRoad;
varying vec2 vLane;
varying vec4 vLamp;
varying vec4 vStreet;
varying vec2 vPav;
varying vec2 vDir;
varying vec3 vWorld;

float line(float d, float hw, float aa) {
  return 1.0 - smoothstep(hw - aa, hw + aa, d);
}
bool bitOn(float flags, float b) {
  return mod(floor(flags / b), 2.0) > 0.5;
}
// 排布代码 → 第 k 盏灯在左（+1）/ 右（−1）；对置排布另算对侧
float lampSide(float pattern, float k) {
  float even = 1.0 - mod(k, 2.0);
  if (pattern < 1.5) return 1.0;
  if (pattern < 2.5) return -1.0;
  if (pattern < 3.5) return even > 0.5 ? 1.0 : -1.0;
  if (pattern < 4.5) return even > 0.5 ? -1.0 : 1.0;
  return 1.0;
}
// 一盏灯对路面一点的相对照度（灯正下方 = 1）：cos³ 衰减再收窄，接近截光型路灯的配光
float pool(float da, float dc, float H) {
  float h2 = H * H;
  float q = h2 / (da * da + dc * dc + h2);
  return q * q;
}

void main() {
  float along = vRoad.x;
  float across = vRoad.y;
  float hw = vRoad.z;
  float len = vRoad.w;
  // 顶点上的整数属性插值后会带误差（4.0 → 3.9999998），先取整再做位判断，否则逐像素跳分支（椒盐噪点）
  float lanes = floor(vLane.x + 0.5);
  float flags = floor(vLane.y + 0.5);
  bool oneway = bitOn(flags, 1.0);
  bool ped = bitOn(flags, 2.0);
  bool mainRd = bitOn(flags, 4.0);
  bool sideFace = bitOn(flags, 8.0);
  bool crossing = bitOn(flags, 16.0);
  bool signalX = bitOn(flags, 32.0);
  float aacross = abs(across);

  // ---- 路灯：光斑（照度）与湿路面倒影 ----
  float S = vLamp.x;
  float phase = vLamp.y;
  float pattern = floor(vLamp.z + 0.5);
  float H = vStreet.x;
  float inset = vStreet.y;
  vec3 lampC = mix(uLed, uSodium, vLamp.w);
  float poolK = mix(${POOL_LED.toFixed(3)}, ${POOL_SODIUM.toFixed(3)}, vLamp.w);
  float headE = mix(uHeadLed, uHeadSodium, vLamp.w);
  float E = 0.0;
  float streak = 0.0;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 R = vec3(-V.x, V.y, -V.z);
  vec2 Rh = normalize(R.xz + 1e-5);
  vec3 T = vec3(vDir.x, 0.0, vDir.y);
  vec3 N = vec3(vDir.y, 0.0, -vDir.x);
  if (S > 0.5) {
    float k0 = floor((along - phase) / S);
    for (int j = -1; j <= 2; j++) {
      float k = k0 + float(j);
      float sk = phase + k * S;
      // 路段两端外 12 m 内的灯也算（相邻路段 / 路口的灯照过来），避免分段处光斑突然断开
      if (sk < -12.0 || sk > len + 12.0) continue;
      for (int o = 0; o < 2; o++) {
        float side = lampSide(pattern, k);
        if (o == 1) {
          if (pattern < 4.5) break;
          side = -1.0;
        }
        float da = sk - along;
        float dc = side * inset - across;
        E += pool(da, dc, H);
        // 倒影：反射视线与「指向灯头」的方向在水平方位上很接近、在仰角上可以差很多 → 竖向拉长的亮条
        vec3 L = normalize(T * da + N * dc + vec3(0.0, H, 0.0));
        vec2 Lh = normalize(L.xz + 1e-5);
        float az = 1.0 - dot(Rh, Lh);
        float el = R.y - L.y;
        streak += exp(-az * 2500.0) * exp(-el * el * 18.0);
      }
    }
  }
  E *= poolK;

  // ---- 地区 / 环境 ----
  float warmth = vLamp.w;
  vec3 ambient = cityAmbient(vec3(0.0, 1.0, 0.0), 0.0, warmth) * 0.6;
  vec3 light = ambient + lampC * E;
  float seed = vStreet.w * 97.0;

  vec3 albedo;
  float wetK = 1.0;
  float specK = 0.0;
  vec2 g2 = vec2(along, across);

  if (sideFace) {
    // 混凝土侧板 / 挡土墙：竖向排水孔（1.6 m 格）+ 渗水暗纹
    float y = vWorld.y;
    vec2 cell = vec2(along / 1.6, y / 1.6);
    vec2 f = abs(fract(cell) - 0.5);
    float hole = (1.0 - smoothstep(0.06, 0.1, max(f.x, f.y))) * step(0.5, hash12(floor(cell) + seed));
    float stain = vnoise(vec2(along * 0.4, y * 0.15));
    albedo = vec3(0.20, 0.19, 0.17) * (0.75 + 0.35 * stain) * (1.0 - 0.8 * hole);
    // 挡土墙接近竖直：收到的路灯光要少得多，街面反光则从下往上照
    light = cityAmbient(vec3(0.0, 0.0, 1.0), 2.0, warmth) * 0.7 + lampC * E * 0.35;
  } else if (ped) {
    // 行人街（R3）：与人行道同一套花岗岩板 / 海旁陶土砖
    float px0 = max(length(fwidth(g2)), 1e-4);
    albedo = pavingAlbedo(g2, px0, seed, waterfront(vec2(vWorld.x, -vWorld.z)));
    wetK = 0.85;
    specK = 0.6;
    light += uShop * 0.35 * vStreet.z * step(0.35, hash12(vec2(floor(along / 6.0), sign(across) + seed)));
  } else if (aacross > hw) {
    // ---- 人行道 + 路缘石（R3：灰花岗岩板、#a8a294 花岗岩路缘、海旁陶土砖、过路处降低路缘 + 黄色触觉砖） ----
    float pav = crossing ? 3.0 : (across > 0.0 ? vPav.x : vPav.y);
    float outM = aacross - hw;
    vec2 pp = vec2(along, outM - 0.3);
    float pxP = max(length(fwidth(pp)), 1e-4);
    float wf = waterfront(vec2(vWorld.x, -vWorld.z));
    vec3 paving = pavingAlbedo(pp, pxP, seed, wf);
    // 路缘石：顶面 0.3 m，每 1 m 一道缝；外沿 0.15 m 立面在俯视里是一道暗边（过路处降低成平的，没有暗边）
    float kerb = 1.0 - smoothstep(0.29, 0.31, outM);
    float kj = 1.0 - smoothstep(0.0, max(fwidth(along), 1e-3) * 1.5 + 0.004, abs(fract(along) - 0.5) * -1.0 + 0.5);
    vec3 granite = vec3(0.15, 0.142, 0.12) * (0.9 + 0.2 * vnoise(vec2(along * 3.0, 1.0))) * (1.0 - 0.35 * kj * (1.0 - smoothstep(0.1, 0.3, pxP)));
    float face = crossing ? 0.0 : 1.0 - smoothstep(0.03, 0.06, outM);
    albedo = mix(paving, granite, kerb) * (1.0 - 0.55 * face);
    // 路缘旁的钢坑盖：约每 18 m 一块 0.9 × 0.3 m（深灰、横向格栅）
    vec2 gc = vec2(fract(along / 18.0 + seed * 0.13) * 18.0, outM - 0.32);
    float grate = step(0.0, gc.y) * step(gc.y, 0.3) * step(gc.x, 0.9) * step(0.35, hash12(vec2(floor(along / 18.0 + seed * 0.13), seed))) * (1.0 - wf);
    float slots = 0.6 + 0.4 * step(0.5, fract(gc.x / 0.06)) * (1.0 - smoothstep(0.02, 0.05, pxP));
    albedo = mix(albedo, vec3(0.05, 0.052, 0.055) * slots, grate);
    if (crossing) {
      // 降低路缘后的触觉警示砖：路缘外 0.3–1.5 m、过路处全宽（灯控 ±1.5 m、斑马线 ±1.9 m）
      float du = along - vPav.x;
      float wHalf = signalX ? 1.5 : 1.9;
      float pad = step(0.3, outM) * step(outM, 1.5) * step(abs(du), wHalf);
      vec2 tp = vec2(du + 3.0, outM - 0.3) / 0.3;
      vec2 tf = abs(fract(tp) - 0.5);
      vec2 taa = max(fwidth(tp), vec2(1e-4));
      float tj = max(smoothstep(0.48 - taa.x, 0.5, tf.x), smoothstep(0.48 - taa.y, 0.5, tf.y)) * (1.0 - smoothstep(0.05, 0.15, pxP));
      vec2 dp = fract(tp * 6.0) - 0.5;
      float dome = (1.0 - smoothstep(0.24, 0.32, length(dp))) * (1.0 - smoothstep(0.006, 0.02, pxP));
      vec3 tactile = vec3(0.27, 0.21, 0.1) * (0.92 + 0.16 * hash12(floor(tp) + seed)) * (1.0 - 0.35 * tj) * (1.0 + 0.25 * dome);
      albedo = mix(albedo, tactile, pad);
    }
    // 铺面溢光：近楼一侧最强；约每 7 m 一个铺位，部分铺位落闸（暗）
    float bay = step(0.3, hash12(vec2(floor(along / 7.0), sign(across) * 3.0 + seed)));
    float toward = smoothstep(0.0, max(pav, 0.5), outM);
    light += uShop * vStreet.z * (0.12 + 0.45 * toward * bay);
    wetK = 0.85;
    specK = 0.5;
  } else {
    // ---- 车行道 ----
    float aa = fwidth(across);
    float px = max(fwidth(along), aa);
    float far = smoothstep(0.12, 0.45, px * 1.7);
    // 沥青颗粒：三个倍频（约 0.05、0.2、0.6 m），像素比颗粒大时各自退成平均值（不闪）
    float f1 = 1.0 - smoothstep(0.02, 0.06, px);
    float f2 = 1.0 - smoothstep(0.08, 0.25, px);
    float grain = 0.5 + (vnoise(g2 * 1.7) - 0.5) * (1.0 - far) + (vnoise(g2 * 5.3 + 3.1) - 0.5) * 0.8 * f2
                + (hash12(floor(g2 * 18.0)) - 0.5) * 0.7 * f1;
    // 修补块：沿路 6 m × 车道宽的格子，约两成格子有一块新沥青（更深、边缘一道接缝）
    float lwP = lanes >= 1.0 ? 2.0 * hw / lanes : 3.2;
    vec2 pc = vec2(along / 6.0, (across + hw) / lwP);
    vec2 pf = fract(pc);
    float pHas = step(hash12(floor(pc) + seed * 0.37), 0.2);
    vec2 pIn = step(vec2(0.18, 0.12), pf) * step(pf, vec2(0.18 + 0.5 * hash12(floor(pc) + 1.7), 0.88));
    float patchR = pHas * pIn.x * pIn.y;
    float patchN = vnoise(g2 * vec2(0.12, 0.35) + seed);
    float patches = smoothstep(0.62, 0.7, patchN) * 0.12 + patchR * 0.22;
    // 每条车道中线一道油渍暗带（车底滴油），两侧轮迹略亮（磨光）
    float lt = fract((across + hw) / lwP) - 0.5;
    float oil = exp(-pow(lt * lwP / 0.35, 2.0)) * (0.7 + 0.3 * vnoise(vec2(along * 0.25, lt)));
    float track = exp(-pow((abs(lt) * lwP - 0.85) / 0.3, 2.0));
    // 沥青近中性灰（整合时调：暖色只来自灯光，避免灯色 × 暖底色叠成橙褐）
    albedo = vec3(0.083, 0.084, 0.086) * (0.8 + 0.4 * grain) * (1.0 - patches) * (1.0 - 0.28 * oil) * (1.0 + 0.1 * track);
    // 浅色骨料（R3，照片 21：灰底上零星的近白石粒）
    vec2 ag = g2 * 40.0;
    albedo += vec3(0.12) * step(0.985, hash12(floor(ag) + seed * 3.1)) * (1.0 - smoothstep(0.18, 0.38, length(fract(ag) - 0.5))) * f1;
    // 灯下的骨料反光：光斑里零星的亮点（近处才有）
    float glint = step(0.994, hash12(floor(g2 * 30.0) + seed)) * f1 * smoothstep(0.4, 0.9, E);
    albedo += vec3(0.25) * glint;
    // 路边排水暗线（路缘内 0.4 m）
    albedo *= 1.0 - 0.35 * (1.0 - smoothstep(0.2, 0.45, hw - aacross));
    // 近路缘的铺面溢光
    light += uShop * vStreet.z * 0.25 * exp(-(hw - aacross) / 2.0);

    float fade = (1.0 - smoothstep(0.06, 0.22, aa)) * smoothstep(3.0, 8.0, min(along, len - along));
    float white = 0.0;
    float yellow = mainRd
      ? max(line(abs(aacross - (hw - 0.3)), 0.06, aa), line(abs(aacross - (hw - 0.52)), 0.06, aa))
      : line(abs(aacross - (hw - 0.3)), 0.06, aa);
    if (lanes >= 2.0) {
      float lw = 2.0 * hw / lanes;
      float t = (across + hw) / lw;
      float kk = floor(t + 0.5);
      float d = abs(t - kk) * lw;
      bool inner = kk >= 1.0 && kk <= lanes - 1.0;
      bool isCentre = !oneway && abs(kk * lw - hw) < 0.3;
      float dash = step(mod(along, 9.0), 4.0);
      if (inner && !isCentre) white = line(d, 0.07, aa) * dash;
    }
    if (!oneway && lanes >= 2.0) {
      float dc = aacross;
      white = max(white, lanes >= 4.0 ? line(abs(dc - 0.17), 0.065, aa) : line(dc, 0.07, aa));
    }
    // 过路处贴片：盖住车道线。灯控过路处（R3）：两行路钉 + 来车方向停车线；无灯控：斑马条纹（0.54 m 白 / 0.66 m 间隔）。
    // 两头路缘处写「LOOK RIGHT 望右」/「LOOK LEFT 望左 ←」（字形从车站图集取 r 通道当油漆遮罩）
    float stud = 0.0;
    if (crossing) {
      white = 0.0;
      yellow = 0.0;
      float du = along - vPav.x;
      float aau = max(fwidth(along), 1e-3);
      float code = floor(vPav.y + 0.5);
      float dir = mod(code, 3.0) - 1.0;
      float kerbL = mod(floor(code / 3.0), 2.0);
      float kerbR = floor(code / 6.0);
      float side = across > 0.0 ? 1.0 : -1.0;
      if (signalX) {
        // 路钉：|du| = 1.4 m 两行，横向每 0.5 m 一颗、Ø 0.1 m；像素大于路钉时退成很淡的平均
        vec2 sd = vec2((fract((across + hw) / 0.5) - 0.5) * 0.5, abs(du) - 1.4);
        float rr = length(sd);
        float saa = max(fwidth(rr), 1e-3);
        stud = (1.0 - smoothstep(0.05 - saa, 0.05 + saa, rr)) * step(0.2, hw - aacross);
        stud = mix(stud, 0.12 * (1.0 - smoothstep(0.08, 0.2, abs(abs(du) - 1.4))), smoothstep(0.04, 0.12, px));
        // 停车线：双向路各在本侧来车方向，单行路整幅在来车方向
        float stopSide = dir == 0.0 ? -side : -dir;
        white = line(abs(du - stopSide * 3.1), 0.125, aau);
      } else {
        float t = abs(fract((across + hw) / 1.2 + 0.25) - 0.5) * 1.2;
        float stripe = line(t, 0.27, aa);
        // 远处条纹小于像素：退成覆盖率平均值，避免摩尔纹
        stripe = mix(stripe, 0.45, smoothstep(0.15, 0.5, aa));
        white = stripe * (1.0 - smoothstep(1.85, 1.95, abs(du)));
      }
      // 望右 / 望左：近路缘车道的来车方向（靠左行）；读字的人站在路缘、面向马路
      float hasKerb = side > 0.0 ? kerbL : kerbR;
      float flow = dir == 0.0 ? side : dir;
      vec4 rect = flow == side ? uLookR : uLookL;
      vec2 tuv = vec2((side > 0.0 ? -du : du) / ${ROAD_TEXT_M[0].toFixed(2)} + 0.5, (hw - 0.4 - aacross) / ${ROAD_TEXT_M[1].toFixed(2)});
      float inside = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
      float paint = texture2D(uAtlas, mix(rect.xy, rect.zw, clamp(tuv, 0.0, 1.0))).r;
      white = max(white, smoothstep(0.25, 0.75, paint) * inside * hasKerb * uHasAtlas);
      fade = 1.0;
    }
    // 标线磨损
    float wear = 0.8 + 0.2 * mix(vnoise(g2 * vec2(0.35, 1.2)), 0.5, far);
    albedo = mix(albedo, vec3(0.6, 0.6, 0.575) * wear, white * fade);
    albedo = mix(albedo, vec3(0.47, 0.355, 0.125) * wear, yellow * fade);
    // 黄色方格路口（新漆，比路边黄线鲜）
    float ybox = yellowBox(vec2(vWorld.x, -vWorld.z), px);
    albedo = mix(albedo, vec3(0.62, 0.42, 0.02) * wear, ybox);
    // 路钉：银白、灯下反光（逆反射，像小亮点）
    albedo = mix(albedo, vec3(0.5, 0.5, 0.52), stud);
    light += lampC * E * 1.6 * stud;
    specK = 1.0 - 0.7 * max(max(white, yellow) * fade, ybox);
  }

  // 湿路面：底色变暗，灯在路面上拉出竖向倒影（菲涅耳：掠射角更亮）
  float wet = clamp(uWetness, 0.0, 1.0);
  albedo *= 1.0 - 0.4 * wet * wetK;
  float fres = 0.04 + 0.5 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
  vec3 refl = lampC * headE * streak * fres * wet * specK * 0.35;

  vec3 col = applyHaze(albedo * light, refl, vWorld);

  ${GLSL_FINISH}
}
`;

/** 路面上白光 LED 的光斑色（R3）：比灯头的 ledWhite 更中性（照片 14：中性 LED 下路面 #7f7b65，饱和度约 0.2）。 */
export const POOL_LED_HEX = '#ffefd6';
/** 铺面溢光色（R3）：比 shopWarm 淡，人行道灰花岗岩在店铺光下不再发橙。 */
export const SHOP_SPILL_HEX = '#ffe6c8';

const rectVec = (r: AtlasRect | null) => (r ? new Vector4(r.u0, r.v0, r.u1, r.v1) : new Vector4(0, 0, 0, 0));

export function createRoadMaterial(): ShaderMaterial {
  const atlas = stationsAtlas(); // [r3:stations] 路面字（望右 / 望左）
  return new ShaderMaterial({
    uniforms: {
      ...sharedUniforms(),
      uAtlas: { value: atlas.texture },
      uHasAtlas: { value: atlas.texture ? 1 : 0 },
      uLookR: { value: rectVec(atlas.rect('look-right')) },
      uLookL: { value: rectVec(atlas.rect('look-left')) },
      uLed: { value: lightColour(POOL_LED_HEX) },
      uSodium: { value: lightColour('sodium') },
      uShop: { value: lightColour(SHOP_SPILL_HEX) },
      uHeadLed: { value: HEAD_LED },
      uHeadSodium: { value: HEAD_SODIUM },
    },
    vertexShader,
    fragmentShader,
  });
}

/**
 * 海港船只（ATMOSPHERE A9，R3 LIVERIES 换成真实渡轮）：位置只由 SIM_CLOCK 决定（截图确定）。
 *
 * - 天星小轮（surfaces-facts §7，照片 11）：3 艘双头渡轮（约 40 × 9.5 m、两层）走中环 7 号码头 ↔ 尖沙咀；
 *   深绿船身 #1b3a30、绿色主甲板带 #2f5a48、中间一道白色护舷线、白色上层甲板（栏杆上一排白色救生圈）、
 *   车顶红白救生筏桶、白烟囱黑顶黑星；船头白色大写船名「星 NORTHERN STAR 北」式（transit-data STAR_FERRY_NAMES）；
 *   两层舱窗暖光。泊位：7 号码头西侧（中心 (637, 480)、船身沿码头轴线 67°）两艘、东侧一艘，两端各停 110 s；
 *   同一泊位的两艘错开半个周期，西泊位约 38 % 的时间有船停着（含开场 0–110 s），对开时各偏到右侧（不互穿）。
 *   双头船不掉头：回程倒着开（与真船一样）。
 * - 新渡輪（P1，照片 12）：「新輝玫」双体快船，白色上层、浅蓝顶带、深藏青船身 #031626 + 红色水线，船身字样「新輝玫 FIRST FERRY IX」
 *   与「新渡輪 SUN FERRY」；5 号码头东侧 ↔ 西面（长洲方向）。
 * - 其余 3 艘小汽艇保持通用外观（不编造营运商）。
 * 航行灯：左红、右绿、桅顶白、船尾白（GlowBatch）。船尾浪交给水面着色器。
 * draw call：天星小轮 1 个 + 其他船 1 个 + 航行灯 1 个；整批船不在视野里时整个网格不画（街景机位省 call）。
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Frustum,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Sphere,
  Vector3,
  type Camera,
  type Object3D,
  type Texture,
} from 'three';
import { simMetresToThree } from '../coords';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, GlowBatch, SIM_CLOCK, getQuality, lightColour, sharedUniforms } from './materials/lighting';
import { liveryAtlasGlsl, liveryAtlasTexture } from './streets/liveries/atlas';
import { STAR_FERRY_NAMES } from './streets/transit-data';
import type { WakeSource } from './water';

export type BoatType = 'star' | 'cat' | 'launch';
export type BoatOperator = 'star' | 'sun' | 'generic';

export interface Route {
  /** 航线折线（模拟米）：第 0 点 = A 泊位，最后一点 = B 泊位。 */
  path: readonly (readonly [number, number])[];
  /** 平均航速（m/s）、两端靠岸停留（s）、相位（s）。 */
  speed: number;
  dwellA: number;
  dwellB: number;
  phase: number;
  type: BoatType;
  operator: BoatOperator;
  /** 船名（天星小轮：STAR_FERRY_NAMES 下标；新渡輪：0）。 */
  name?: number;
  /** 双头船（不掉头，回程倒着开）。 */
  doubleEnded: boolean;
  /** 会船时偏到航线右侧的最大距离（m）。 */
  passOffset: number;
  hull: string;
}

/** 7 号码头西侧泊位（spec L-F2：中心 (637, 480)，船身沿码头轴线约 67.3°）。 */
export const STAR_CENTRAL_BERTH: readonly [number, number] = [637, 480];
export const STAR_PIER_AXIS_DEG = 67.3;
/** 7 号码头东侧泊位（东壁 (654.3, 430.2)–(681.2, 495.1) 外 7 m，同一轴线）。 */
export const STAR_CENTRAL_BERTH_E: readonly [number, number] = [676, 464];
/** 尖沙咀天星码头两个泊位（[k]）。 */
export const STAR_TST_BERTH: readonly [number, number] = [1405, 1198];
export const STAR_TST_BERTH_E: readonly [number, number] = [1432, 1178];
/** 天星小轮：3 艘，两端各停 110 s。 */
export const STAR_FERRIES = 3;
const STAR_DWELL_S = 110;


const axis = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)] as const;
const ax = axis(STAR_PIER_AXIS_DEG);

/** Chaikin 平滑（保留首尾点；第一段方向不变：泊位处船身仍沿码头轴线）。 */
export function smoothPath(pts: readonly (readonly [number, number])[], iterations = 3): [number, number][] {
  let p = pts.map((q) => [q[0], q[1]] as [number, number]);
  for (let it = 0; it < iterations; it++) {
    const out: [number, number][] = [p[0]!];
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i]!;
      const b = p[i + 1]!;
      if (i > 0) out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      if (i + 2 < p.length) out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    out.push(p[p.length - 1]!);
    p = out;
  }
  return p;
}

const STAR_PATH = smoothPath([
  STAR_CENTRAL_BERTH,
  [STAR_CENTRAL_BERTH[0] + ax[0] * 70, STAR_CENTRAL_BERTH[1] + ax[1] * 70],
  [735, 640],
  [1010, 885],
  [1330, 1140],
  STAR_TST_BERTH,
]);
/** 东泊位航线：中段在西航线东南约 90 m。 */
const STAR_PATH_E = smoothPath([
  STAR_CENTRAL_BERTH_E,
  [STAR_CENTRAL_BERTH_E[0] + ax[0] * 70, STAR_CENTRAL_BERTH_E[1] + ax[1] * 70],
  [800, 600],
  [1085, 830],
  [1375, 1100],
  STAR_TST_BERTH_E,
]);

/** 5 号码头东侧泊位（码头东壁 (468.1, 496.6)–(488.7, 562.4) 中点外 7 m，船头朝海、沿轴线约 72.6°）。 */
export const SUN_CENTRAL_BERTH: readonly [number, number] = [485.1, 527.4];
const sunAx = axis(72.6);
const SUN_PATH = smoothPath([SUN_CENTRAL_BERTH, [SUN_CENTRAL_BERTH[0] + sunAx[0] * 60, SUN_CENTRAL_BERTH[1] + sunAx[1] * 60], [430, 700], [150, 765], [-600, 905], [-2600, 1050]]);

/** 一条航线的长度与平均航速下的单程时间（s）。 */
function pathLen(path: Route['path']): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  return s;
}

const starPeriod = 2 * (pathLen(STAR_PATH) / 6) + 2 * STAR_DWELL_S;

/** 天星小轮 k 号船：航线（西 / 东泊位）、相位、船名（STAR_FERRY_NAMES 下标）。 */
const STAR_PLAN: readonly { path: Route['path']; phase: number; name: number }[] = [
  // 西泊位两艘相隔半个周期：第 0 艘开场停在中环 7 号码头西侧（0–110 s，「碼頭」机位）
  { path: STAR_PATH, phase: 0, name: 2 },
  { path: STAR_PATH, phase: starPeriod / 2, name: 0 },
  // 东泊位一艘：开场约 10 s 刚离开中环（「渡輪甲板」机位正前方）
  { path: STAR_PATH_E, phase: 145, name: 3 },
];

export const ROUTES: readonly Route[] = [
  // 天星小轮 ×3：中环 7 号码头（西、东泊位）↔ 尖沙咀；同一泊位的两艘靠岸时段错开半个周期，对开时各偏到右侧
  ...STAR_PLAN.map(
    (p): Route => ({
      path: p.path,
      speed: 6,
      dwellA: STAR_DWELL_S,
      dwellB: STAR_DWELL_S,
      phase: p.phase,
      type: 'star',
      operator: 'star',
      name: p.name,
      doubleEnded: true,
      passOffset: p.path === STAR_PATH ? 30 : 0,
      hull: '#1b3a30',
    }),
  ),
  // 新渡輪「新輝玫」：5 号码头 ↔ 西面（长洲方向）
  { path: SUN_PATH, speed: 9, dwellA: 120, dwellB: 30, phase: 400, type: 'cat', operator: 'sun', name: 0, doubleEnded: false, passOffset: 0, hull: '#031626' },
  // 通用小汽艇
  { path: [[-2600, 880], [4600, 1120]], speed: 6.5, dwellA: 10, dwellB: 10, phase: 400, type: 'launch', operator: 'generic', doubleEnded: false, passOffset: 0, hull: '#3a4c66' },
  { path: [[2050, 760], [150, 1820]], speed: 6, dwellA: 20, dwellB: 20, phase: 120, type: 'launch', operator: 'generic', doubleEnded: false, passOffset: 0, hull: '#c8ccd0' },
  { path: [[820, 1350], [1900, 1000]], speed: 4.5, dwellA: 15, dwellB: 15, phase: 640, type: 'launch', operator: 'generic', doubleEnded: false, passOffset: 0, hull: '#8d969e' },
];

export interface BoatState {
  x: number;
  y: number;
  /** 船身朝向（弧度，东 = 0，逆时针）。双头船始终沿 A→B 方向。 */
  heading: number;
  /** 0 = 靠岸停着，1 = 航行中。 */
  moving: number;
  /** 航行方向：1 = A→B，−1 = B→A（停着时为下一程方向的反向，即刚到的方向）。 */
  dir: 1 | -1;
}

/** 航线周期（s）与单程时间。 */
export function routeTiming(r: Route): { run: number; period: number; len: number } {
  const len = pathLen(r.path);
  const run = len / r.speed;
  return { run, period: 2 * run + r.dwellA + r.dwellB, len };
}

/** 折线上弧长 s 处的点与单位切向（沿 A→B）。 */
function along(path: Route['path'], s: number, out: { x: number; y: number; tx: number; ty: number }): void {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= acc + l || i === path.length - 1) {
      const f = l > 0 ? Math.min(Math.max((s - acc) / l, 0), 1) : 0;
      out.x = a[0] + (b[0] - a[0]) * f;
      out.y = a[1] + (b[1] - a[1]) * f;
      out.tx = l > 0 ? (b[0] - a[0]) / l : 1;
      out.ty = l > 0 ? (b[1] - a[1]) / l : 0;
      return;
    }
    acc += l;
  }
}

const ease = (u: number) => u * u * (3 - 2 * u);
const smoothstep = (e0: number, e1: number, x: number) => ease(Math.min(Math.max((x - e0) / (e1 - e0), 0), 1));

/**
 * 时刻 t 的船（纯函数）：在 A 停 dwellA → A→B → 在 B 停 dwellB → B→A；单程首尾缓加 / 减速（smoothstep）。
 * 会船：航行时偏到行进方向右侧（两端 200 m 内渐变到 0），对开的两艘错开 2 × passOffset。
 */
export function boatAt(r: Route, t: number): BoatState {
  const { run, period, len } = routeTiming(r);
  const tt = (((t + r.phase) % period) + period) % period;
  let s: number;
  let dir: 1 | -1;
  let moving = 1;
  if (tt < r.dwellA) {
    s = 0;
    dir = -1;
    moving = 0;
  } else if (tt < r.dwellA + run) {
    s = ease((tt - r.dwellA) / run) * len;
    dir = 1;
  } else if (tt < r.dwellA + run + r.dwellB) {
    s = len;
    dir = 1;
    moving = 0;
  } else {
    s = (1 - ease((tt - r.dwellA - run - r.dwellB) / run)) * len;
    dir = -1;
  }
  const p = { x: 0, y: 0, tx: 1, ty: 0 };
  along(r.path, s, p);
  const off = r.passOffset * smoothstep(0, 200, s) * smoothstep(0, 200, len - s) * dir;
  // 行进方向右侧：A→B 时为切向右法线 (ty, −tx)；B→A 时取反
  const x = p.x + p.ty * off;
  const y = p.y - p.tx * off;
  const fwd = r.doubleEnded || dir === 1 ? 1 : -1;
  return { x, y, heading: Math.atan2(p.ty * fwd, p.tx * fwd), moving, dir };
}

/** 调试钩子 __central.boats() 的一项（模拟坐标，米）。 */
export interface BoatDebug {
  x: number;
  y: number;
  heading: number;
  moving: boolean;
  operator: BoatOperator;
  name?: string;
}

const vertexShader = /* glsl */ `
attribute float aPart;
attribute vec4 iInfo;   // x 营运商（0 通用、1 天星、2 新渡輪），y 船名格，z 船体色（打包），w 预留
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
varying vec3 vLocalN;
varying float vPart;
varying vec3 vHull;
varying vec4 vInfo;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 world = m * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(m) * normal);
  // 局部坐标换成米（实例矩阵 = 旋转 × 缩放）
  vLocal = position * vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vLocalN = normal;
  vPart = aPart;
  vInfo = iInfo;
  #ifdef USE_INSTANCING_COLOR
  vHull = instanceColor;
  #else
  vHull = vec3(0.8);
  #endif
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const v3 = (hex: string) => {
  const c = new Color(hex);
  return `vec3(${[c.r, c.g, c.b].map((v) => v.toFixed(4)).join(', ')})`;
};

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
${liveryAtlasGlsl()}
uniform vec3 uCabin;
uniform float uTextFar;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
varying vec3 vLocalN;
varying float vPart;
varying vec3 vHull;
varying vec4 vInfo;
// 五角星（中心 0、外接半径 r）SDF
float sdStar5(vec2 p, float r) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = 0.382 * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
void main() {
  vec3 n = normalize(vNormalW);
  float op = floor(vInfo.x + 0.5);
  bool nearText = length(cameraPosition - vWorld) < uTextFar;
  vec3 amb = cityAmbient(n, 30.0, 0.4) * 0.6;
  vec3 L = vLocal;
  vec3 ln = vLocalN;
  bool side = abs(ln.z) > 0.6;
  // 观者右手方向（字从左到右读）：右舷（+z）+x、左舷 −x
  float px = ln.z > 0.0 ? L.x : -L.x;
  vec3 alb;
  vec3 emit = vec3(0.0);
  float spill = 0.0;
  if (op > 0.5 && op < 1.5) {
    // ---- 天星小轮 ----
    if (vPart < 0.5) {
      // 船身深绿，顶部一道白色护舷线
      alb = STAR_HULL;
      if (L.y > 1.22) alb = vec3(0.75);
    } else if (vPart < 1.5) {
      // 主甲板：绿色舷墙带 + 一排暖光舱窗（复审修正：窗距 3.2 m、每扇中间一根窗柱，不再是约 25 个一样的桃色方块；
      // 窗里上亮下暗、有一排座椅靠背的暗带）
      alb = STAR_BAND;
      float u = fract(L.x / 3.2);
      float aaw = fwidth(L.x / 3.2) + 1e-4;
      float win = smoothstep(0.1 - aaw, 0.1 + aaw, u) * (1.0 - smoothstep(0.9 - aaw, 0.9 + aaw, u)) * step(2.05, L.y) * step(L.y, 3.15);
      win *= smoothstep(0.012 - aaw, 0.012 + aaw, abs(u - 0.5));
      float tw = clamp((L.y - 2.05) / 1.1, 0.0, 1.0);
      float inner = (0.45 + 0.7 * smoothstep(0.5, 1.0, tw)) * (tw < 0.4 && fract(L.x / 0.9) < 0.75 ? 0.45 : 1.0);
      emit = uCabin * win * 0.42 * inner;
      alb = mix(alb, vec3(0.02), win);
      spill = 0.14;
      // 船名（复审修正：在船头两侧的绿色舷墙上，白色「星 NORTHERN STAR 北」，被甲板灯照着，夜里看得清）
      if (side && nearText && L.y > 1.5 && L.y < 2.0) {
        float m = livTex(livCell(LIV_BOATNAMES, LIV_BOATNAMES_COLS, vInfo.y), vec2((px - (ln.z > 0.0 ? 11.0 : -15.2)) / 4.2, (2.0 - L.y) / 0.5));
        alb = mix(alb, vec3(0.8, 0.8, 0.77), m);
        spill = mix(spill, 0.55, m);
      }
    } else if (vPart < 2.5) {
      // 上层甲板（复审修正）：下面一道白色舷墙（挂一排救生圈），上面是开敞的乘客区——暗的室内、白色立柱、
      // 天花一排暖色灯；不再是一整排实心的亮窗
      alb = STAR_WHITE;
      spill = 0.45;
      if (L.y > 4.4 && L.y < 5.65) {
        float u = fract(L.x / 1.6);
        float aap = fwidth(L.x / 1.6) + 1e-4;
        float post = 1.0 - smoothstep(0.03 - aap, 0.03 + aap, abs(u - 0.5));
        float th = clamp((L.y - 4.4) / 1.25, 0.0, 1.0);
        // 室内：天花暖光往下渐暗；靠背一排暗块
        vec3 room = vec3(0.012, 0.011, 0.01);
        float lampD = abs(fract(L.x / 2.4) - 0.5) * 2.4;
        float lamp = (1.0 - smoothstep(0.06, 0.1, lampD)) * smoothstep(0.86, 0.9, th) * (1.0 - smoothstep(0.95, 0.98, th));
        emit = uCabin * ((0.05 + 0.18 * smoothstep(0.3, 1.0, th)) * (th < 0.35 && fract(L.x / 0.9) < 0.7 ? 0.4 : 1.0) + 1.4 * lamp) * (1.0 - post);
        alb = mix(room, STAR_WHITE, post);
        spill = mix(0.0, 0.45, post);
      }
      if (side && L.y < 4.25) {
        vec2 q = vec2((fract(L.x / 1.6) - 0.5) * 1.6, L.y - 3.88);
        float d = abs(length(q) - 0.25) - 0.075;
        float aa = fwidth(q.x) + 1e-3;
        float ring = 1.0 - smoothstep(-aa, aa, d);
        float edge = 1.0 - smoothstep(-aa, aa, abs(d) - 0.02);
        alb = mix(alb * 0.55, vec3(0.86), ring);
        alb = mix(alb, STAR_RINGBAND, edge * 0.6);
      }
    } else if (vPart < 3.5) {
      alb = vec3(0.62, 0.63, 0.6);
    } else if (vPart < 4.5) {
      // 烟囱：白色、黑顶、两侧黑星
      alb = STAR_WHITE;
      if (L.y > 8.0) alb = vec3(0.02);
      if (side) {
        float st = sdStar5(vec2(L.x, L.y - 7.15), 0.42);
        float aa = fwidth(L.x) + 1e-3;
        alb = mix(alb, vec3(0.02), 1.0 - smoothstep(-aa, aa, st));
      }
      spill = 0.05;
    } else if (vPart < 5.5) {
      // 驾驶室：白色 + 一圈深色窗
      alb = STAR_WHITE;
      if (L.y > 6.35 && L.y < 6.85) alb = vec3(0.02);
      emit = uCabin * 0.12 * step(6.35, L.y) * step(L.y, 6.85);
    } else {
      // 救生筏桶：红白相间
      alb = fract(L.y / 0.2) < 0.5 ? vec3(0.55, 0.03, 0.03) : vec3(0.75);
    }
  } else if (op > 1.5) {
    // ---- 新渡輪「新輝玫」：白色上层、浅蓝顶带、深藏青船身 + 红色水线 ----
    if (vPart < 0.5) {
      alb = vHull;
      if (L.y < 0.16 && L.y > -0.02) alb = vec3(0.45, 0.03, 0.03);
      if (side && nearText && L.y > 0.3 && L.y < 0.66) {
        // 船身白色登记号位置画船名（较小）
        float m = livTex(livCell(LIV_BOATNAMES, LIV_BOATNAMES_COLS, 8.0), vec2((px - (ln.z > 0.0 ? -1.0 : -2.6)) / 3.6, (0.66 - L.y) / 0.42));
        alb = mix(alb, vec3(0.75), m);
      }
    } else if (vPart < 1.5) {
      alb = vec3(0.78, 0.79, 0.8);
      float u = fract(L.x / 1.6);
      float win = step(0.12, u) * step(u, 0.88) * (step(1.0, L.y) * step(L.y, 2.2) + step(2.95, L.y) * step(L.y, 3.7) * step(L.x, 3.5));
      emit = uCabin * win * 0.5;
      alb = mix(alb, vec3(0.02), win);
      if (L.y > 3.78) alb = SUN_BLUE;
      // 公司字样「新渡輪 SUN FERRY」（上层前部，深蓝）
      if (side && nearText && L.y > 2.95 && L.y < 3.55) {
        float m = livTex(LIV_SUNLOGO, vec2((px - (ln.z > 0.0 ? 4.2 : -6.9)) / 2.7, (3.55 - L.y) / 0.6));
        alb = mix(alb, SUN_NAVY, m);
      }
      spill = 0.06;
    } else {
      alb = SUN_BLUE * 0.8;
    }
  } else {
    // ---- 通用小汽艇 ----
    alb = vHull * 0.5;
    if (vPart > 0.5 && vPart < 1.5) {
      float u = fract(L.x / 1.6);
      float row = fract(L.y / 2.6);
      float win = step(0.15, u) * step(u, 0.85) * step(0.3, row) * step(row, 0.8);
      emit = uCabin * win * 0.8;
      alb = vHull * 0.35;
    } else if (vPart > 1.5) {
      alb = vec3(0.05);
    }
  }
  // 夜里：城市环境光 + 舱内灯光照到附近的白色船身（spill，低于 bloom 阈值）
  vec3 surface = alb * (amb + mix(uCabin, vec3(1.0), 0.5) * spill);
  vec3 col = applyHaze(surface, emit, vWorld);
  ${GLSL_FINISH}
}
`;

/** 简单几何拼装（非索引三角形；面朝向按「离中心」自动定）。 */
class BoatBuilder {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly part: number[] = [];
  tri(a: readonly number[], b: readonly number[], c: readonly number[], p: number, outward?: readonly number[]): void {
    const ux = b[0]! - a[0]!;
    const uy = b[1]! - a[1]!;
    const uz = b[2]! - a[2]!;
    const vx = c[0]! - a[0]!;
    const vy = c[1]! - a[1]!;
    const vz = c[2]! - a[2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    let flip = false;
    if (outward && nx * outward[0]! + ny * outward[1]! + nz * outward[2]! < 0) {
      flip = true;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    const verts = flip ? [a, c, b] : [a, b, c];
    for (const v of verts) {
      this.pos.push(v[0]!, v[1]!, v[2]!);
      this.nor.push(nx / l, ny / l, nz / l);
      this.part.push(p);
    }
  }
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], p: number, outward: readonly number[]): void {
    this.tri(a, b, c, p, outward);
    this.tri(a, c, d, p, outward);
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('aPart', new BufferAttribute(new Float32Array(this.part), 1));
    return g;
  }
  /** 轴对齐盒子（中心 x、z，y0–y1），不画底面。 */
  box(cx: number, cz: number, sx: number, sz: number, y0: number, y1: number, p: number): void {
    const hx = sx / 2;
    const hz = sz / 2;
    const P = (x: number, y: number, z: number) => [cx + x, y, cz + z];
    this.quad(P(-hx, y0, hz), P(hx, y0, hz), P(hx, y1, hz), P(-hx, y1, hz), p, [0, 0, 1]);
    this.quad(P(hx, y0, -hz), P(-hx, y0, -hz), P(-hx, y1, -hz), P(hx, y1, -hz), p, [0, 0, -1]);
    this.quad(P(hx, y0, hz), P(hx, y0, -hz), P(hx, y1, -hz), P(hx, y1, hz), p, [1, 0, 0]);
    this.quad(P(-hx, y0, -hz), P(-hx, y0, hz), P(-hx, y1, hz), P(-hx, y1, -hz), p, [-1, 0, 0]);
    this.quad(P(-hx, y1, hz), P(hx, y1, hz), P(hx, y1, -hz), P(-hx, y1, -hz), p, [0, 1, 0]);
  }
}

/** 天星小轮平面轮廓（双头、两端圆）：半长 20 m、半宽 4.75 m，按 (sx, sz) 缩放。 */
export function starPlan(sx = 1, sz = 1): [number, number][] {
  const end: [number, number][] = [
    [13.5, 4.75],
    [16.5, 4.4],
    [18.6, 3.5],
    [19.7, 2.1],
    [20.1, 0],
  ];
  const ring: [number, number][] = [];
  for (const [x, z] of end) ring.push([x, -z]);
  for (let i = end.length - 2; i >= 0; i--) ring.push([end[i]![0], end[i]![1]]);
  for (const [x, z] of end) ring.push([-x, z]);
  for (let i = end.length - 2; i >= 0; i--) ring.push([-end[i]![0], -end[i]![1]]);
  return ring.map(([x, z]) => [x * sx, z * sz]);
}

/** 天星小轮几何（米，+x 船头、+y 上、+z 右舷），约 250 个三角形。 */
export function starFerryGeometry(): BufferGeometry {
  const b = new BoatBuilder();
  const rings: { plan: [number, number][]; y0: number; y1: number; part: number }[] = [
    { plan: starPlan(1, 1), y0: -0.4, y1: 1.4, part: 0 },
    // 复审修正：上层甲板比船身短一截（两头露出前甲板与驾驶室），不再是一条通长的「驳船」箱
    { plan: starPlan(0.95, 0.97), y0: 1.4, y1: 3.5, part: 1 },
    { plan: starPlan(0.82, 0.93), y0: 3.5, y1: 5.9, part: 2 },
  ];
  for (let k = 0; k < rings.length; k++) {
    const { plan, y0, y1, part } = rings[k]!;
    for (let i = 0; i < plan.length; i++) {
      const a = plan[i]!;
      const c = plan[(i + 1) % plan.length]!;
      const mx = (a[0] + c[0]) / 2;
      const mz = (a[1] + c[1]) / 2;
      b.quad([a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], part, [mx, 0, mz]);
    }
    // 台阶面（本圈顶到上一圈底之间的环带，朝上）
    const next = rings[k + 1]?.plan;
    for (let i = 0; i < plan.length; i++) {
      const a = plan[i]!;
      const c = plan[(i + 1) % plan.length]!;
      if (next) {
        const a2 = next[i]!;
        const c2 = next[(i + 1) % next.length]!;
        b.quad([a[0], y1, a[1]], [c[0], y1, c[1]], [c2[0], y1, c2[1]], [a2[0], y1, a2[1]], 3, [0, 1, 0]);
      } else {
        b.tri([0, y1, 0], [a[0], y1, a[1]], [c[0], y1, c[1]], 3, [0, 1, 0]);
      }
    }
  }
  // 烟囱（中部）、两端驾驶室、车顶救生筏桶
  b.box(0, 0, 1.5, 1.7, 5.9, 8.6, 4);
  for (const sx of [-1, 1]) b.box(sx * 14.2, 0, 2.2, 3.2, 5.9, 7.0, 5);
  for (const [x, z] of [
    [-6, 3.1],
    [6, -3.1],
    [-8.5, -3.1],
    [8.5, 3.1],
  ] as const)
    b.box(x, z, 0.7, 0.55, 5.9, 6.5, 6);
  return b.build();
}

/** 通用船体几何（本地：+x 船头、+y 上、+z 右舷，长度归一化 1 单位 = 1 m × 实例缩放）：船壳（船头收尖）+ 两层舱 + 舱顶。 */
function boatGeometry(): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const part: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], p: number) => {
    const ab = new Vector3(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!);
    const ad = new Vector3(d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!);
    const nn = ab.cross(ad).normalize();
    for (const v of [a, b, c, a, c, d]) {
      pos.push(v[0]!, v[1]!, v[2]!);
      nor.push(nn.x, nn.y, nn.z);
      part.push(p);
    }
  };
  // 箱体：x0..x1、y0..y1、半宽 w（四个侧面 + 顶）
  const box = (x0: number, x1: number, y0: number, y1: number, w: number, p: number, bow = 0) => {
    const xb = x1 + bow;
    quad([x0, y0, w], [x1, y0, w], [x1, y1, w], [x0, y1, w], p); // 右舷
    quad([x1, y0, -w], [x0, y0, -w], [x0, y1, -w], [x1, y1, -w], p); // 左舷
    quad([x0, y0, -w], [x0, y0, w], [x0, y1, w], [x0, y1, -w], p); // 船尾
    if (bow > 0) {
      // 船头收尖：两片斜面
      quad([x1, y0, w], [xb, y0, 0], [xb, y1, 0], [x1, y1, w], p);
      quad([xb, y0, 0], [x1, y0, -w], [x1, y1, -w], [xb, y1, 0], p);
      quad([x0, y1, w], [x1, y1, w], [x1, y1, -w], [x0, y1, -w], 2);
      pos.push(x1, y1, w, xb, y1, 0, x1, y1, -w);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      part.push(2, 2, 2);
    } else {
      quad([x1, y0, w], [x1, y0, -w], [x1, y1, -w], [x1, y1, w], p); // 前
      quad([x0, y1, w], [x1, y1, w], [x1, y1, -w], [x0, y1, -w], 2); // 顶
    }
  };
  box(-0.5, 0.36, -0.06, 0.12, 0.5, 0, 0.14);
  box(-0.42, 0.28, 0.12, 0.42, 0.42, 1);
  box(-0.36, 0.2, 0.42, 0.68, 0.38, 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  return g;
}

/** 各船型尺寸（长、宽、高，米）：天星小轮几何已是米（缩放 1）。 */
const SIZE: Record<BoatType, [number, number, number]> = { star: [1, 1, 1], cat: [36, 10, 6], launch: [15, 4, 4] };
/** 航行灯用的外形尺寸（长、宽、高）。 */
const DIMS: Record<BoatType, [number, number, number]> = { star: [40, 9.5, 6], cat: [36, 10, 6], launch: [15, 4, 4] };
const OP_CODE: Record<BoatOperator, number> = { generic: 0, star: 1, sun: 2 };

function boatMaterial(atlas: Texture | null, textFar: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...sharedUniforms(), uCabin: { value: lightColour('shopWarm') }, uLiv: { value: atlas }, uTextFar: { value: textFar } },
    defines: {
      STAR_HULL: v3('#1b3a30'),
      STAR_BAND: v3('#2f5a48'),
      STAR_WHITE: v3('#e6e6e0'),
      STAR_RINGBAND: v3('#2f5a48'),
      SUN_BLUE: v3('#5d8fb4'),
      SUN_NAVY: v3('#0c2a5a'),
    },
    vertexShader,
    fragmentShader,
  });
}

/** 一组同几何的船（一个 InstancedMesh）。 */
class BoatGroup {
  readonly mesh: InstancedMesh;
  readonly info: InstancedBufferAttribute;
  constructor(
    geo: BufferGeometry,
    material: ShaderMaterial,
    readonly members: number[],
    routes: readonly Route[],
    name: string,
  ) {
    const n = Math.max(members.length, 1);
    this.info = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute('iInfo', this.info);
    this.mesh = new InstancedMesh(geo, material, n);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
    members.forEach((ri, k) => {
      const r = routes[ri]!;
      this.mesh.setColorAt(k, new Color(r.hull));
      this.info.setXYZW(k, OP_CODE[r.operator], r.name ?? 0, 0, 0);
    });
    this.mesh.count = members.length;
    this.mesh.userData.reflect = true;
  }
}

export class Boats {
  readonly objects: Object3D[];
  private readonly groups: BoatGroup[];
  private readonly lights: GlowBatch;
  private readonly m = new Matrix4();
  private readonly s = new Vector3();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly yAxis = new Vector3(0, 1, 0);
  private readonly frustum = new Frustum();
  private readonly pv = new Matrix4();
  private readonly sphere = new Sphere();
  private readonly red = lightColour('aviation');
  private readonly green = lightColour('neonGreen');
  private readonly white = lightColour('headlight');
  private readonly states: BoatState[];

  constructor(private readonly routes: readonly Route[] = ROUTES) {
    const textFar = getQuality().tier === 'high' ? 60 : 30;
    const material = boatMaterial(liveryAtlasTexture(), textFar);
    const star = routes.map((r, i) => (r.type === 'star' ? i : -1)).filter((i) => i >= 0);
    const other = routes.map((r, i) => (r.type !== 'star' ? i : -1)).filter((i) => i >= 0);
    this.groups = [new BoatGroup(starFerryGeometry(), material, star, routes, 'boats-star'), new BoatGroup(boatGeometry(), material, other, routes, 'boats')];
    this.lights = new GlowBatch(routes.length * 4, 'boat-lights');
    this.lights.mesh.userData.reflect = true;
    this.states = routes.map(() => ({ x: 0, y: 0, heading: 0, moving: 0, dir: 1 }));
    this.objects = [...this.groups.map((g) => g.mesh), this.lights.mesh];
  }

  /** 每帧：按 SIM_CLOCK 摆船、写航行灯；把船尾浪交给水面。camera 给了就整组剔除视野外的船（不画就不占 draw call）。 */
  update(water: { setWakes(list: readonly WakeSource[]): void } | null, camera?: Camera): void {
    const t = SIM_CLOCK.t;
    const wakes: WakeSource[] = [];
    if (camera) {
      camera.updateMatrixWorld();
      this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.pv);
    }
    let anyVisible = false;
    for (const g of this.groups) {
      let vis = 0;
      g.members.forEach((ri, k) => {
        const r = this.routes[ri]!;
        const b = boatAt(r, t);
        this.states[ri] = b;
        const [L, W, H] = DIMS[r.type];
        const sz = SIZE[r.type];
        const [x, y, z] = simMetresToThree(b.x, b.y, 0);
        // 轻微起伏（靠岸时更小）
        const bob = Math.sin(t * 0.9 + ri * 1.7) * (b.moving ? 0.12 : 0.04);
        this.q.setFromAxisAngle(this.yAxis, b.heading);
        this.m.compose(this.p.set(x, y + bob, z), this.q, this.s.set(sz[0] === 1 ? 1 : L, sz[0] === 1 ? 1 : H, sz[0] === 1 ? 1 : W));
        g.mesh.setMatrixAt(k, this.m);
        this.sphere.center.set(x, y + 4, z);
        this.sphere.radius = L * 0.6 + 6;
        if (!camera || this.frustum.intersectsSphere(this.sphere)) vis++;
        // 航行灯（本地：+x 船头、+z 右舷）
        const c = Math.cos(b.heading);
        const sn = Math.sin(b.heading);
        const at = (fx: number, side: number, up: number): [number, number, number] => {
          // 本地 (fx 前, side 右) → 模拟坐标：前 = (c, sn)，右 = (sn, −c)
          const px = b.x + fx * c + side * sn;
          const py = b.y + fx * sn - side * c;
          return simMetresToThree(px, py, up);
        };
        const i = ri * 4;
        this.lights.set(i, at(L * 0.1, -W * 0.5, H * 0.55), this.red, 4, 0.25);
        this.lights.set(i + 1, at(L * 0.1, W * 0.5, H * 0.55), this.green, 4, 0.25);
        this.lights.set(i + 2, at(L * 0.15, 0, r.type === 'star' ? 9.2 : H + 2.5), this.white, 5, 0.25);
        this.lights.set(i + 3, at(-L * 0.5, 0, H * 0.45), this.white, 3, 0.2);
        if (b.moving) {
          const back = b.dir === 1 || !r.doubleEnded ? -1 : 1;
          wakes.push({ x: b.x + back * c * L * 0.45, y: b.y + back * sn * L * 0.45, heading: b.heading + (back > 0 ? Math.PI : 0), strength: r.type === 'launch' ? 0.7 : 1 });
        }
      });
      g.mesh.instanceMatrix.needsUpdate = true;
      g.mesh.visible = vis > 0;
      anyVisible ||= vis > 0;
    }
    this.lights.mesh.visible = anyVisible;
    this.lights.commit(true);
    water?.setWakes(wakes);
  }

  /** 调试钩子：全部船（模拟坐标，米）。 */
  debug(): BoatDebug[] {
    const t = SIM_CLOCK.t;
    return this.routes.map((r) => {
      const b = boatAt(r, t);
      const out: BoatDebug = { x: b.x, y: b.y, heading: b.heading, moving: b.moving === 1, operator: r.operator };
      if (r.operator === 'star' && r.name !== undefined) out.name = STAR_FERRY_NAMES[r.name]?.en;
      if (r.operator === 'sun') out.name = 'First Ferry IX';
      return out;
    });
  }
}

/**
 * R5 真实地标的夜景材质（按共享光照契约 lighting.ts）：地政总署照片图集给反照率与玻璃度，夜景按 R3 照片贴面的同一套规则换算——
 * 实墙 = 反照率 ×（城市环境照度 + 中环峡谷光）；玻璃 = 很暗的有色玻璃（照片色相 ≤ 20 %）+ 夜空 / 街面的菲涅尔反射；
 * 亮窗按楼层（烘焙时从照片检测的层高与相位）× 租户（1–3 层一组、每组 2–7 扇一段、段里再逐扇熄 20 %）亮，光只落在照片的玻璃上，
 * 竖梃按烘焙时检测的间距与相位切开；屋面压暗到契约屋顶范围。网格顶点带「特征号」（烘焙规则见 fetch/landsd_3d_landmark_bake.py 的
 * LANDMARKS），按对照夜景照片加各楼的灯（照片与不确定项见 README「R5 真实地标」）：
 *   2 冠顶（harbour-spire：鳍片自下而上的白光；鳍片里面另有一个收进去的「发光芯」网格（网格第 4 分量 = 1），从街上往上看也是一整个亮穹顶）
 *   3 白光 LED 结构（prism-tower：铝包结构件是被照亮的实墙、玻璃有一层淡淡的竖梃格；LED 本身是 14 号 LED 线，不从图集里读）
 *   4 每层蓝色灯带（neon-centre 四个三角凸窗的面上；#lmcycle 打开缓慢的蓝 → 品红竖向波，照片定不了，默认关）、
 *  15 冠顶阶梯与尖帽（暗的阶梯立面，亮的是阶梯外沿的 LED 线）
 *   5 尖顶（饱和的品红灯泡，进 bloom）、6 竖梃 / 楼层横档的亮格 + 交点白色点灯（mirror-block）
 *   7 桁架（被照亮的钢，红光是 14 号 LED 线）、8 桅杆（暗灰的钢腿；两腿之间每层一格紫光灯，见 mastCells）、
 *  13 西服务塔楼梯间红光格栅（steel-frame）
 *   9 泛光外墙 + 圆窗（porthole-house：铝板一窗一块、板缝、圆窗银灰反光带亮边，少数暖光，亮的圆窗里看得到天花的亮与深处的暗）
 *  10 大堂（玻璃后面一间按视线算的大堂：亮天花与筒灯、地面、后墙；steel-frame 的是亮着的扶梯玻璃筒）、11 屋顶边白光线
 *  12 广场底腹（steel-frame：冷白透光玻璃格，凹进去的扶梯口更亮）
 *  14 LED 线：线段四个顶点（法线 = 线方向、法线第 4 分量 = 左右），顶点着色器把它撑成朝向相机、宽 max(实宽, 1.5 px) 的细条，
 *     变宽时按比例减亮度（远处不会成粗光棒），并朝相机挪一点（不与所在面共面闪烁）；颜色号见 LINE_COLOURS。
 * 不加任何照片里没有的标志、屏幕或激光。远处所有几何细节都是盒式滤波的周期脉冲（与 building.ts 相同），远看不闪。
 * 颜色量级：tone map 在最大通道 ≤ 0.75 时恒等、以上向白收敛（lighting.ts），所以要保持饱和的彩色灯（红线、红光楼梯、紫光灯格）
 * 最大通道都压在 0.75 上下；要 bloom 的（尖顶、冠顶）亮度 Y 才 > 1。
 */
import { DoubleSide, ShaderMaterial, Vector4, type IUniform, type Texture } from 'three';
import { GLSL_HASH } from '../materials/common';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms } from '../materials/lighting';
import { GLSL_WINDOWS } from '../windows';

/** 特征号（与烘焙脚本的 FEATURE 一致）。 */
export const FEATURE = {
  facade: 0,
  plain: 1,
  crown: 2,
  led: 3,
  bands: 4,
  spire: 5,
  dots: 6,
  truss: 7,
  mast: 8,
  flood: 9,
  lobby: 10,
  edge: 11,
  belly: 12,
  redcore: 13,
  line: 14,
  ctier: 15,
} as const;

/** LED 线的颜色号（与烘焙脚本的 LINE_COLOURS 一致）。 */
export const LINE_COLOURS = { white: 0, red: 1, violet: 2, tier: 3 } as const;

/** 最多几座（uniform 数组长度）。 */
export const MAX_LANDMARKS = 8;

const vertexShader = /* glsl */ `
${GLSL_SHARED_PARS}
attribute vec4 aNrm;
attribute vec2 aUv;
attribute vec4 aRect;
attribute vec4 aCol;
attribute vec2 aFac;
attribute vec4 aGrid;
// 远景合并网格：按位隐藏正在画近景的地标（近景网格恒为 0）
uniform float uHide;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
flat varying vec4 vRect;
varying vec4 vCol;
varying float vU;
flat varying vec4 vGrid;
// LED 线：横向坐标（−1…1）与「实宽 / 画宽」
varying float vAcross;
varying float vLineE;
// steel-frame 红光楼梯间的条带坐标（离条带中线 / 半宽；|值| < 1 在条带里；其余块为 0）
varying float vStrip;
void main() {
  int lm = int(aGrid.z + 0.5);
  if (((int(uHide + 0.5) >> lm) & 1) == 1) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec4 world = modelMatrix * vec4(position, 1.0);
  vAcross = 0.0;
  vLineE = 1.0;
  vStrip = aFac.y * 0.001;
  if (int(aGrid.y + 0.5) == ${FEATURE.line}) {
    vStrip = 0.0;
    vec3 D = normalize(aNrm.xyz);
    vec3 toCam = cameraPosition - world.xyz;
    float dist = max(length(toCam), 0.1);
    vec3 view = toCam / dist;
    vec3 side = cross(D, view);
    float sl = length(side);
    side = sl > 1e-3 ? side / sl : normalize(cross(D, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
    float wM = max(aFac.y * 0.001, 0.05);
    float depth = max(-(viewMatrix * world).z, 0.1);
    float pxPerM = projectionMatrix[1][1] * 0.5 * uViewportPx.y / depth;
    float s = max(1.0, 1.5 / max(wM * pxPerM, 1e-4));
    vLineE = 1.0 / s;
    vAcross = aNrm.w > 0.0 ? 1.0 : -1.0;
    world.xyz += side * (vAcross * 0.5 * wM * s) + view * min(0.3 + 0.003 * dist, 2.5);
  }
  vWorld = world.xyz;
  vNormalW = normalize(aNrm.xyz);
  vUv = aUv;
  vRect = aRect;
  vCol = aCol;
  vU = aFac.x * 0.01;
  vGrid = aGrid;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
${GLSL_HASH}
${GLSL_WINDOWS}

uniform sampler2D uAtlas;
// 图集到了以后为 1（之前用顶点色；远景网格与图集一起到，所以实际只在占位时为 0）
uniform float uAtlasOn;
uniform float uAtlasPx;
// 每座：A (层高 m, 楼层线相位 m, 20:00 亮灯率, 地面 mPD)、B (街面冷暖, 灯光键, 冠顶 / 特征带底 mPD, 顶 mPD)、
// C (大堂天花离地 m, 窗光色调 0 暖…1 冷, 租户成片 0 逐扇…1 成段, 整层全亮的上限)、D (大堂样式 0 室内 / 1 亮玻璃筒, 泛光倍率, 冠顶泛光下洗 m, 0)
uniform vec4 uLmA[${MAX_LANDMARKS}];
uniform vec4 uLmB[${MAX_LANDMARKS}];
uniform vec4 uLmC[${MAX_LANDMARKS}];
uniform vec4 uLmD[${MAX_LANDMARKS}];
// E (本地轴转角 °, 西排桅杆灯格中线的本地 e, 东排, 灯格最高 mPD；没有桅杆的为 0)、F (裙楼去残影的高度 m, 大堂暖光 0…1, 0, 0)
uniform vec4 uLmE[${MAX_LANDMARKS}];
uniform vec4 uLmF[${MAX_LANDMARKS}];
uniform vec3 uOfficeN;
uniform vec3 uOfficeC;
uniform vec3 uOfficeW;
uniform vec3 uWarm;
uniform vec3 uLed;
uniform vec3 uCrown;
uniform vec3 uBand;
uniform vec3 uMagenta;
uniform vec3 uRed;
uniform vec3 uViolet;
uniform vec3 uFlood;
uniform vec3 uTier;
uniform vec3 uLobby;
uniform vec3 uBelly;
uniform vec3 uSpire;
uniform float uCycle;
// 调试（#lmdebug=1|2|3|4）：1 白天反照率直出、2 玻璃度（红）与实墙覆盖（绿）、3 特征号色板、4 亮灯（红）/ 窗形（绿）/ 亮灯率（蓝）
uniform float uDebug;

varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
flat varying vec4 vRect;
varying vec4 vCol;
varying float vU;
flat varying vec4 vGrid;
varying float vAcross;
varying float vLineE;
varying float vStrip;

const int OFS = 4096;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const vec3 ZENITH = vec3(0.0070, 0.0075, 0.0116);

float pulseInt(float x, float a, float b) {
  return floor(x) * (b - a) + clamp(fract(x) - a, 0.0, b - a);
}
float fpulse(float x, float w, float c, float hw) {
  w = max(w, 1e-3);
  float a = c - hw;
  float b = c + hw;
  return clamp((pulseInt(x + 0.5 * w, a, b) - pulseInt(x - 0.5 * w, a, b)) / w, 0.0, 1.0);
}
float fband(float x, float w, float a, float b) {
  w = max(w, 1e-3);
  return (clamp(x + 0.5 * w, a, b) - clamp(x - 0.5 * w, a, b)) / w;
}
int repFloor(int key, int fl, int L) {
  if (L <= 0) return fl;
  int g = fl >> L;
  return (g << L) + int(hash3(key, g, 31 + L) * float(1 << L));
}
vec2 mergeLevel(float floorsPerPx) {
  float Lf = log2(max(floorsPerPx * 2.0, 1.0));
  float L0 = floor(Lf);
  return vec2(L0, Lf > 0.0 ? smoothstep(0.5, 1.0, Lf - L0) : 0.0);
}
vec3 glassRefl(vec3 n, vec3 V, float warmth, out float fres) {
  vec3 R = reflect(-V, n);
  fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
  vec3 street = mix(vec3(0.050, 0.046, 0.040), vec3(0.070, 0.048, 0.024), warmth);
  return R.y >= 0.0 ? mix(uHazeColor, ZENITH, smoothstep(0.0, 0.45, R.y)) : mix(uHazeColor, street, smoothstep(0.0, -0.25, R.y));
}
// 写字楼亮窗（地标版）：租户楼层组 1–3 层（35 % 的楼层另抽）、组里一段 2–7 扇同亮灭、段里每扇再熄 20 %；
// cluster < 0.5 时逐扇独立（整面均匀的细格）。返回 (亮 0/1, 组号, 段号；整层全亮 −1)。
vec3 lmOfficeLit(int key, int fl, int bay, float target, float cluster, float fullMax) {
  bool drop = hash3(key, fl * 977 + bay, 30) < 0.2;
  if (cluster < 0.5) {
    float p = clamp(target / 0.8, 0.0, 1.0);
    return vec3(hash3(key, fl * 977 + bay, 29) < p && !drop ? 1.0 : 0.0, float(fl), float(bay));
  }
  float dark = 0.10 + 0.06 * hash3(key, 13, 0);
  float full = min(fullMax, 0.6 * target);
  int span = 1 + int(hash3(key, 11, 1) * 2.99);
  int stack = (fl + int(hash3(key, 12, 1) * 3.0)) / span;
  float r = hash3(key, stack, 21);
  if (hash3(key, fl, 22) < 0.35) r = hash3(key, fl, 23);
  if (r < dark) return vec3(0.0, float(stack), -2.0);
  if (r > 1.0 - full) return vec3(drop ? 0.0 : 1.0, float(stack), -1.0);
  int len = 2 + int(hash3(key, stack, 24) * 6.0);
  int run = (bay + int(hash3(key, stack, 25) * float(len))) / len;
  float p = clamp((target - 0.8 * full) / (0.8 * max(1.0 - dark - full, 0.05)), 0.0, 1.0);
  return vec3(hash3(key, stack * 977 + run, 26) < p && !drop ? 1.0 : 0.0, float(stack), float(run));
}
float officeProf(float y, float wfv, float u, float wu) {
  float vis = fband(y, wfv, 0.2, 0.88);
  float low = fband(y, wfv, 0.2, 0.38);
  float ceil_ = fband(y, wfv, 0.7, 0.86);
  float row = fband(y, wfv, 0.8, 0.84) * fpulse(u / 0.6, wu / 0.6, 0.5, 0.22);
  return vis * (0.5 - 0.3 * low) + ceil_ * 0.45 + row * 1.2;
}
// 地标本地坐标 (e, n)：模拟坐标 (x, y) = (world.x, −world.z) 转 deg 度（与烘焙脚本的 frame_xy 相同）
vec2 lmLocal(vec3 w, float deg) {
  float a = radians(deg);
  vec2 xy = vec2(w.x, -w.z);
  return vec2(dot(xy, vec2(cos(a), sin(a))), dot(xy, vec2(-sin(a), cos(a))));
}
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// steel-frame 桅杆的紫光灯格（2019 北立面照片：每根桅杆两条腿之间、每层一格，格里一盏圆角的蓝紫灯——中间一道竖的亮芯、
// 上沿一道发白的弧，腿是暗的钢；复审 R5b 修正二：原来是横跨整根桅杆的一圈圈光环，比照片宽一倍、亮四成，远看成两条紫色梯子）。
// 只在南北立面（法线的本地 n 分量 > 0.7）、两排桅杆灯格中线 ±1.6 m（两腿内沿之间）、广场顶以上到 E4.w 的高度；
// 立面、桅杆的面都画（格里看得到桅杆后面的立面）。格窄于约 4 px 时按覆盖率摊成平均色（远看不闪）。
vec3 mastCells(vec3 P, vec3 n, float fv, float wfv, float F, float lift, vec4 E4) {
  if (E4.w <= 0.0 || P.y > E4.w + 2.0 || lift < 12.0) return vec3(0.0);
  float a = radians(E4.x);
  float nN = dot(vec2(n.x, -n.z), vec2(-sin(a), cos(a)));
  if (abs(nN) < 0.7) return vec3(0.0);
  vec2 loc = lmLocal(P, E4.x);
  float de = abs(loc.x - E4.y) < abs(loc.x - E4.z) ? loc.x - E4.y : loc.x - E4.z;
  if (abs(de) > 2.2) return vec3(0.0);
  float fw = max(fwidth(loc.x), 1e-4);
  float dy = (fract(fv) - 0.5) * F;
  float sd = sdRoundBox(vec2(de, dy), vec2(1.2, 0.32 * F), 0.75);
  float aa = max(fwidth(sd), 1e-3);
  float inside = 1.0 - smoothstep(-aa, aa, sd);
  // 格里大部分是暗的（看得到后面的亮窗）：一道竖的亮芯、上沿一道发白的弧、下沿正中一个亮点
  float core = exp(-de * de * 4.0);
  float arc = (1.0 - smoothstep(0.0, 0.15 + aa, abs(sd + 0.12))) * smoothstep(0.05, 0.3, dy / F);
  float spot = exp(-(de * de + (dy + 0.26 * F) * (dy + 0.26 * F)) * 4.0);
  // R4 + R5 整合复审：整体再压到 0.33 倍（同一 2019 北立面照片：德辅道中电车上层仰看时格里的紫光均值 sRGB (139,129,220)，
  // 照片 (105,92,161)；蓝通道原来远超 1，被 tone map 压平：0.62 倍时实测 (126,117,203)、0.38 倍时 (113,105,180)）
  vec3 lamp = (uViolet * (0.1 + 0.42 * core + 0.5 * spot) * inside + mix(uViolet, vec3(0.75), 0.5) * 0.75 * arc) * 0.33;
  // 远处：格宽（3.2 m）不足约 4 px 时按平均亮度摊平；按楼层的盒式滤波也一起淡掉
  vec3 avg = uViolet * 0.056 * (1.0 - step(1.6, abs(de)));
  float near = smoothstep(1.0, 2.5, 1.6 / fw) * (1.0 - smoothstep(0.3, 0.6, wfv));
  return mix(avg, lamp, near) * (1.0 - smoothstep(E4.w, E4.w + 2.0, P.y));
}
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
// 玻璃度 → 实墙覆盖率：近处按 0.5 抗锯齿阶跃，远处（缩小时）取平均覆盖率
float solidCover(float g) {
  float fw = fwidth(g);
  float stepAA = clamp((0.5 - g) / max(fw * 1.5, 0.02) + 0.5, 0.0, 1.0);
  return mix(stepAA, 1.0 - g, smoothstep(0.15, 0.45, fw));
}
// 大堂玻璃后面的一间屋（按视线求交：天花、地面、离玻璃 depth m 的后墙）：天花亮、每 2.4 m 一盏筒灯，地面与后墙暗一些
vec3 lobbyRoom(vec3 P, vec3 V, vec3 n, float floorY, float ceilY) {
  vec3 r = -V;
  float rin = max(dot(V, n), 0.05);
  float tb = 9.0 / rin;
  float tc = r.y > 1e-4 ? (ceilY - P.y) / r.y : 1e6;
  float tf = r.y < -1e-4 ? (floorY - P.y) / r.y : 1e6;
  float t = max(min(tb, min(tc, tf)), 0.0);
  vec3 h = P + r * t;
  if (tc <= min(tb, tf)) {
    vec2 q = h.xz / 2.4;
    float fw = clamp(length(fwidth(q)), 0.0, 1.0);
    float dl = 1.0 - smoothstep(0.07, 0.07 + 0.06 + fw, length(fract(q) - 0.5));
    dl = mix(dl, 0.035, smoothstep(0.15, 0.4, fw));
    return uLobby * (0.22 + 3.2 * dl);
  }
  if (tf <= tb) return uLobby * (0.10 + 0.10 * exp(-t / 6.0));
  float yy = clamp((h.y - floorY) / max(ceilY - floorY, 0.5), 0.0, 1.0);
  return uLobby * (0.08 + 0.22 * smoothstep(0.7, 1.0, yy) + 0.05 * vnoise(h.xz * 0.7 + h.y));
}

void main() {
  int lm = int(vGrid.z + 0.5);
  int feat = int(vGrid.y + 0.5);
  vec4 A = uLmA[lm];
  vec4 B = uLmB[lm];
  vec4 C = uLmC[lm];
  vec4 D = uLmD[lm];
  vec4 E4 = uLmE[lm];
  vec4 F4 = uLmF[lm];
  vec3 col;
  if (feat == ${FEATURE.line}) {
    // LED 线：横向抗锯齿的细条（顶点着色器保证 ≥ 1.5 px），亮度按「实宽 / 画宽」的 0.6 次方减（远处细而淡，不成光棒）
    int ci = int(vGrid.w + 0.5);
    // 红线（steel-frame 桁架构件、桅杆内侧腿与吊杆）按 2019 北立面照片：粗的深红光条（烘焙时线宽 0.9 / 0.6 m）；
    // 最大通道压在 0.75 以下，不被 tone map 推向粉白（复审 R5b 修正二：1.5 倍时实测粉红 (216,97,111)，照片 (186,45,66)）。
    // R4 + R5 整合复审：0.72 时红线中位数 sRGB (250,96,108)、照片 (222,81,96)——uRed 按亮度归一，红通道约 4.3，乘 0.72 仍远超 1，
    // 被 tone map 压平并向白收（粉红）；压到 0.30（芯约 1.3，只略过肩部、边缘在恒等段）。紫线同比 1.8 → 0.75
    vec3 lc = ci == ${LINE_COLOURS.red} ? uRed * 0.30 : (ci == ${LINE_COLOURS.violet} ? uViolet * 0.75 : (ci == ${LINE_COLOURS.tier} ? uTier * 2.4 : uLed * 1.7));
    float prof = 1.0 - smoothstep(0.35, 1.0, abs(vAcross));
    col = applyHaze(vec3(0.0), lc * prof * pow(vLineE, 0.6), vWorld);
    if (uDebug > 0.5) col = vec3(0.5);
    ${GLSL_FINISH}
    return;
  }
  float F = max(A.x, 2.5);
  float share = A.z;
  float warmth = B.x;
  int key = int(B.y + 0.5);
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  float lift = vWorld.y - A.w;
  vec3 amb = cityAmbient(n, lift, warmth);
  vec3 V = normalize(cameraPosition - vWorld);

  // 反照率与玻璃度：有图集取图集（夹在本块的框里，不取到邻块），否则顶点色
  vec3 alb = srgbToLinear(vCol.rgb);
  float g = vCol.a;
  if (vRect.z > vRect.x && uAtlasOn > 0.0) {
    float hp = 0.5 / uAtlasPx;
    vec2 uv = clamp(vUv, vRect.xy + hp, vRect.zw - hp);
    vec4 t = texture(uAtlas, uv);
    alb = mix(alb, t.rgb, uAtlasOn);
    g = mix(g, t.a, uAtlasOn);
  }
  // 灯带那一段（neon-centre 塔身）整面是玻璃幕墙；朝下的面（挑檐底、外挑楼层的底）是实的，不当玻璃（免得映出天空）
  if (feat == ${FEATURE.bands}) g = 1.0;
  if (n.y < -0.5 && feat != ${FEATURE.belly}) g = 0.0;
  // 裙楼的白天残影（F4.x m 以下；neon-centre 皇后大道中一侧大堂以上的玻璃中庭与白色斜撑上的灰蓝 / 黑斑、门头一排黑色的污块）：
  // 反照率八成收向块的平均色、玻璃度按整块定（与大堂同一做法；复审 R5b 修正二）
  if (F4.x > 0.0 && lift < F4.x && (feat == ${FEATURE.facade} || feat == ${FEATURE.plain})) {
    alb = mix(alb, srgbToLinear(vCol.rgb), 0.8);
    g = vCol.a > 0.45 ? 1.0 : 0.0;
  }
  // prism-tower 的铝包结构件：中性的浅灰铝（照片里那一带的颜色常是玻璃的倒影）
  if (feat == ${FEATURE.led}) alb = vec3(clamp(dot(alb, LUMA), 0.3, 0.5));
  // 带灯的特征（冠顶、尖帽、prism-tower 的斜面……）即使朝上也按立面画，只有普通屋面走屋顶分支
  bool special = feat == ${FEATURE.crown} || feat == ${FEATURE.led} || feat == ${FEATURE.spire} || feat == ${FEATURE.ctier} ||
                 feat == ${FEATURE.edge} || feat == ${FEATURE.truss} || feat == ${FEATURE.mast};

  vec3 surf;
  vec3 emit = vec3(0.0);
  vec3 dbg4 = vec3(0.0);
  if (n.y > 0.7 && !special) {
    // 屋面：照片反照率压暗、封顶到程序屋顶的亮度量级（契约屋顶 Y 0.002–0.015）
    vec3 ra = alb * 0.6;
    ra *= min(1.0, 0.2 / max(dot(ra, LUMA), 1e-3));
    surf = ra * amb + ra * uHazeColor * 0.6;
  } else {
    float u = vU;
    float v = vWorld.y - A.y;
    float wu = fwidth(u);
    float wv = fwidth(v);
    float M = max(vGrid.x * 0.02, 0.8);
    float fv = v / F;
    float wfv = wv / F;
    vec3 canyon = (uHazeColor * 0.6 + vec3(0.040, 0.036, 0.030)) * (0.45 + 0.55 * exp(-max(lift, 0.0) / 120.0)) * 0.52;
    vec3 solid = alb * (amb + canyon);
    float det = 1.0 - smoothstep(0.02, 0.06, max(wu, wv));
    if (det > 0.0) solid *= 1.0 + det * ((vnoise(vec2(u, v) * 7.0) - 0.5) * 0.1 - 0.2 * max(fpulse(u / 1.2 + 0.5, wu / 1.2, 0.5, 0.006), fpulse(v / 0.75 + 0.5, wv / 0.75, 0.5, 0.009))) * (1.0 - g);
    float fl0 = max(dot(alb, LUMA), 0.02);
    vec3 hue = mix(vec3(1.0), clamp(alb / fl0, 0.4, 1.8), 0.2);
    float fres;
    vec3 refl = glassRefl(n, V, warmth, fres);
    vec3 gsurf = hue * vec3(0.0035, 0.0037, 0.0045) + refl * fres;
    float mullU = fpulse(u / M + 0.5, wu / M, 0.5, 0.035 / M);
    float mullV = fpulse(fv + 0.5, wfv, 0.5, 0.06 / F);
    gsurf = mix(gsurf, vec3(0.03) * amb + refl * fres * 0.5, max(mullU, mullV) * (1.0 - smoothstep(0.05, 0.2, wu)));
    float gs = 1.0 - solidCover(g);
    surf = mix(solid, gsurf, gs);

    // 亮窗：楼层 × 租户；亮灯率 = 本座 20:00 亮灯率 × 写字楼钟点曲线（相对 20:00）
    float target = clamp(share * officeLitTarget(uClock) / officeLitTarget(20.0), 0.0, 0.95);
    int fl = int(floor(fv)) + OFS;
    float y = fract(fv);
    vec2 ml = mergeLevel(wfv);
    int L0 = int(ml.x);
    int bay = int(floor(u / M));
    vec3 s0 = lmOfficeLit(key, repFloor(key, fl, L0), bay, target, C.z, C.w);
    float lit = s0.x;
    if (ml.y > 0.0) lit = mix(lit, lmOfficeLit(key, repFloor(key, fl, L0 + 1), bay, target, C.z, C.w).x, ml.y);
    float nFar = exp2(ml.x + ml.y) * max(1.0, wu / M / 12.0);
    if (nFar > 1.01) lit = mix(target, lit, inversesqrt(sqrt(nFar)));
    int tk = int(s0.y) * 977 + int(s0.z);
    float th = hash3(key, tk, 27);
    vec3 warmC = mix(uOfficeW, uOfficeN, 0.4);
    vec3 tone = C.y < 0.5 ? mix(warmC, uOfficeN, C.y * 2.0) : mix(uOfficeN, uOfficeC, C.y * 2.0 - 1.0);
    vec3 lc = th < 0.15 ? mix(tone, uOfficeW, 0.35) : (th < 0.8 ? tone : mix(tone, uOfficeC, 0.5));
    float hb = hash3(key, tk, 28);
    float Bw = s0.z < -0.5 ? 0.95 + 0.35 * hb : 0.6 + 0.9 * hb * hb;
    Bw = mix(0.95, Bw, inversesqrt(sqrt(max(nFar, 1.0))));
    float glassU = 1.0 - fpulse(u / M + 0.5, wu / M, 0.5, 0.04 / M);
    glassU *= 1.0 - 0.85 * fpulse(u / (6.0 * M) + 0.5, wu / (6.0 * M), 0.5, 0.3 / (6.0 * M));
    float gb = smoothstep(0.35, 0.65, gs);
    float prof = officeProf(y, wfv, u, wu);
    // mirror-block（2026 皇后大道中照片）：玻璃大多是暗的，亮的是室内一排排的筒灯光点，不是整扇亮的窗（复审 R5b 修正二）
    if (feat == ${FEATURE.dots}) prof = 0.12 * fband(y, wfv, 0.2, 0.88) + 1.3 * fband(y, wfv, 0.8, 0.84) * fpulse(u / 0.6, wu / 0.6, 0.5, 0.12);
    float shape = gb * glassU * prof;
    float perWin = mix(1.0, 0.75 + 0.5 * hash12(vec2(floor(u / M) + 0.5, float(fl) * 1.7)), 1.0 - smoothstep(0.6, 1.6, wu / M));
    dbg4 = vec3(lit, shape, target);
    bool windows = (feat == ${FEATURE.facade} || feat == ${FEATURE.led} || feat == ${FEATURE.bands} || feat == ${FEATURE.dots} ||
                    feat == ${FEATURE.truss} || feat == ${FEATURE.mast}) && abs(n.y) < 0.6;
    if (windows) {
      emit = lc * (Bw * lit * shape * perWin);
      emit += uOfficeN * (0.006 + 0.014 * hash3(key, fl, 35)) * (1.0 - lit) * gb * fband(y, wfv, 0.2, 0.86);
    }
    // 冠顶的泛光往下洗到最上面几层的外墙（D.z m；harbour-spire：从街上往上看，冠顶本身被顶层挡住大半，亮的是这一圈）
    if (D.z > 0.0 && feat == ${FEATURE.facade} && vWorld.y > B.z - D.z && vWorld.y < B.z) {
      float k = smoothstep(B.z - D.z, B.z, vWorld.y);
      // 复审 R5b 修正二：1.3 → 0.55（照片里冠顶下沿清楚，最上面一段外墙只是被照亮，不是一圈光晕）
      emit += uCrown * 0.55 * k * k * (0.7 + 0.3 * gs);
    }
    // steel-frame 桅杆两腿之间的紫光灯格（桅杆后面的立面也画，见 mastCells）
    if (feat == ${FEATURE.facade} || feat == ${FEATURE.plain}) emit += mastCells(vWorld, n, fv, wfv, F, lift, E4);
    float t01 = clamp((vWorld.y - B.z) / max(B.w - B.z, 1.0), 0.0, 1.0);

    if (feat == ${FEATURE.crown}) {
      // 复审 R5b 修正二：冠顶原来整个是过曝的白穹顶、bloom 光晕比照片大，鳍片与鳍片之间的暗缝看不出来（2019 山顶、2024 尖沙咀照片里都看得到）：
      // 发光芯 2.4 → 0.8、鳍片 2.8 → 1.4，鳍片之间压到两成
      if (vGrid.w > 0.5) {
        // 冠顶发光芯：鳍片后面收进去的一层光（下亮上稍暗）
        emit = uCrown * (0.8 - 0.3 * t01);
        surf = vec3(0.0);
      } else {
        // 鳍片：开口里打出来的白光，底部最亮、向上渐弱；鳍片 / 竖梃切成竖条（条间暗）
        float fall = (1.0 - 0.55 * t01) * (1.0 - 0.55 * t01);
        float fins = 0.2 + 0.8 * fpulse(u / 1.6, wu / 1.6, 0.5, 0.25);
        emit = uCrown * 1.4 * fall * fins;
        surf *= 0.4;
      }
    } else if (feat == ${FEATURE.led}) {
      // prism-tower：LED 是另画的线；这里只有被照亮的铝包结构件（玻璃度 0.4 的实墙）、玻璃上一层很淡的竖梃 / 横档细格
      // 没进图集的小块（塔顶的双桅杆等，在冠顶高程以上）整块发光
      // 塔顶的双桅杆（没进图集的小块，在冠顶高程以上）：2026 红磡长焦照片里是暗灰的杆子、每隔几米一盏点灯，不是亮白的框
      // （复审 R5b 修正二：原来整根当 LED 发白光，亮度 240 左右，照片里杆身约 110–125、点灯 180–250）
      if (vRect.z <= vRect.x && vWorld.y > B.z) {
        surf = vec3(0.3) * (amb + canyon + uFlood * 0.25);
        float pts = fpulse(v / 6.0 + 0.5, wv / 6.0, 0.5, 0.04);
        emit = uLed * (0.03 + 2.2 * pts);
      } else {
        float grid = max(mullU, mullV) * (1.0 - smoothstep(0.08, 0.3, max(wu / M, wfv)));
        emit += uLed * (0.05 * (1.0 - gs) + 0.035 * grid * gs) + uLed * 0.006 * gs;
      }
    } else if (feat == ${FEATURE.bands}) {
      // 每层一道 0.25 m 的蓝色灯带（在楼层线上）；#lmcycle：缓慢的竖向色波（蓝 → 品红），照片里定不了，默认关
      float band = fpulse(fv + 0.5, wfv, 0.5, 0.125 / F);
      vec3 bc = uBand;
      if (uCycle > 0.5) bc = mix(uBand, uMagenta, 0.5 + 0.5 * sin(uTime * 0.35 - vWorld.y * 0.02));
      // 复审 R5b 修正二：2.2 → 1.5（照片里的灯带是饱和的蓝 / 紫，2.2 倍时被 tone map 推成了淡紫白）
      emit += bc * 1.5 * band;
    } else if (feat == ${FEATURE.ctier}) {
      // neon-centre 冠顶：2019 / 2022 / 2024 三张照片里阶梯的立面是暗的，亮的是阶梯外沿一圈圈的灯（LED 线，tier 色）；
      // 每层只一道淡灯带（复审 R5b 修正二：原来整个冠顶是均匀发光的淡紫阶梯金字塔）
      vec3 cc = mix(uBand, uMagenta, 0.35);
      if (uCycle > 0.5) cc = mix(uBand, uMagenta, 0.5 + 0.5 * sin(uTime * 0.35 - vWorld.y * 0.02));
      float band = fpulse(fv + 0.5, wfv, 0.5, 0.12 / F);
      emit = cc * (0.03 + 0.45 * band);
      surf *= 0.6;
    } else if (feat == ${FEATURE.spire}) {
      // 尖顶：饱和的品红（2022 干诺道中品红、2019 山顶红粉、2024 尖沙咀白粉）、整根亮到进 bloom，远看是一根粗的光柱
      // （复审 R5b 修正二：原来是一根细的淡紫针，亮像素均值 (203,178,255)）
      float bulbs = fpulse(v / 1.8 + 0.5, wv / 1.8, 0.5, 0.12) * fpulse(u / 1.2 + 0.5, wu / 1.2, 0.5, 0.2);
      emit = uSpire * (2.2 + 3.5 * bulbs);
    } else if (feat == ${FEATURE.dots}) {
      // 竖梃交点的白色点灯（约 0.25 m 见方）+ 整面竖梃 / 楼层横档的细格微光（2023 照片里整面是一张细亮格），远处按覆盖率摊薄
      // 2026 皇后大道中照片：一张很亮的白色竖梃 / 横档粗格（约 0.12 m）+ 交点点灯，玻璃大多暗（复审 R5b 修正二：原来是 0.05 m 的发丝格）
      float d = fpulse(u / M + 0.5, wu / M, 0.5, 0.14 / M) * fpulse(fv + 0.5, wfv, 0.5, 0.14 / F);
      float gridF = max(fpulse(u / M + 0.5, wu / M, 0.5, 0.06 / M), fpulse(fv + 0.5, wfv, 0.5, 0.06 / F));
      emit += uLed * (4.0 * d + 1.1 * gridF);
    } else if (feat == ${FEATURE.truss}) {
      // 桁架：被泛光照亮的灰钢（红光是 LED 线），近处只带一点红色反光。R4 + R5 整合复审：从德辅道中电车上层仰看，
      // 朝下的桁架底面（soffit）原来是一块块灰粉色（红色反光压过了很暗的环境光）；照片里桁架底面是被街面泛光打亮的白灰钢：
      // 底面不带红色反光、加一层自下而上的冷白泛光，侧面的红色反光也减半
      vec3 steel = max(alb, vec3(0.22));
      float soffit = smoothstep(0.3, 0.75, -n.y);
      surf = steel * (amb + canyon + uFlood * (0.12 + 0.22 * soffit) * D.y);
      emit += uRed * 0.0075 * (1.0 - soffit);
    } else if (feat == ${FEATURE.mast}) {
      // 桅杆：暗灰的钢腿（2019 照片里腿比立面暗），两腿之间每层一格紫光灯（mastCells；远景网格的桅杆是长方体，同一个函数）
      vec3 steel = clamp(alb, vec3(0.16), vec3(0.24));
      surf = steel * (amb + canyon + uFlood * 0.06 * D.y * (1.0 - 0.35 * clamp(lift / 180.0, 0.0, 1.0)));
      emit = mastCells(vWorld, n, fv, wfv, F, lift, E4);
    } else if (feat == ${FEATURE.redcore}) {
      // 西服务塔的楼梯间：只在条带里（烘焙写的条带坐标 |vStrip| < 1，约 4.2 m 宽、东沿离西桅杆内侧腿约 11 m）发光；条带外是服务塔的实墙。
      // 2019 北立面照片（复审 R5b 修正二）：深红（均值约 (124,39,44)、饱和度 0.52），是红光的玻璃后面一道道横格条、
      // 每层两跑楼梯的暗斜梯段（之字形）与两侧的暗框——亮条之间有真正的暗缝，不是一整块均匀的橙红板
      float aw = max(fwidth(vStrip), 1e-3);
      float inS = 1.0 - smoothstep(1.0 - aw, 1.0 + aw, abs(vStrip));
      float xs = clamp(0.5 + 0.5 * vStrip, 0.0, 1.0);
      float wxs = max(0.5 * aw, 1e-4);
      float h2 = fv * 2.0;
      float flight = mod(floor(h2), 2.0) < 0.5 ? xs : 1.0 - xs;
      float dSt = abs(fract(h2) - flight) * 0.5 * F;
      float wSt = (wfv * 2.0 + wxs) * 0.5 * F + 1e-3;
      float stair = 1.0 - smoothstep(0.22, 0.22 + wSt, dSt);
      float slat = fpulse(v / 0.55 + 0.5, wv / 0.55, 0.5, 0.2);
      float frameL = smoothstep(0.86 - wxs, 0.9 + wxs, abs(vStrip));
      float lattice = (1.0 - 0.9 * stair) * (1.0 - 0.75 * slat) * (1.0 - 0.85 * frameL);
      vec3 stairC = vec3(0.62, 0.035, 0.05);
      emit = stairC * lattice * inS;
      surf *= mix(1.0, 0.35, inS);
    } else if (feat == ${FEATURE.flood}) {
      // 泛光铝外墙（一窗一块方板，板缝）：冷白，下亮上暗；圆窗按烘焙时检测到的格距与相位画（每层一排、竖梃格中间一扇，
      // 直径为格距的 0.55），抗锯齿按圆的有向距离逐像素（斜看、远看也还是圆），小到约 1 px 才淡成平均色（板色 + 圆窗平均色）
      float floodK = D.y * (1.0 - 0.45 * clamp(lift / 170.0, 0.0, 1.0));
      vec3 skin = max(srgbToLinear(vCol.rgb), vec3(0.30));
      vec2 c = (vec2(fract(u / M), fract(fv)) - 0.5) * vec2(M, F);
      float r = min(M, F) * 0.275;
      float sd = length(c) - r;
      float aa = max(fwidth(sd), 1e-4);
      float near = smoothstep(0.8, 2.0, 2.0 * r / max(max(wu, wv), 1e-5));
      float circ = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, sd);
      float rim = (1.0 - smoothstep(0.0, 0.05 + aa, abs(sd - 0.035))) * near;
      float cov = 3.14159 * r * r / (M * F);
      float hole = mix(cov, circ, near);
      float joint = max(fpulse(u / M + 0.5, wu / M, 0.5, 0.012 / M), fpulse(fv + 0.5, wfv, 0.5, 0.012 / F)) * near;
      vec3 skinLit = skin * (amb + canyon + uFlood * 0.6 * floodK) * (1.0 - 0.45 * joint);
      skinLit += skin * uFlood * 0.9 * floodK * rim;
      // 圆窗玻璃：银灰的反光（泛光打在窗框里的反射 + 天空 / 街面的菲涅尔），上沿偏亮
      float sheen = 0.5 + 0.5 * clamp(c.y / max(r, 1e-3), -1.0, 1.0);
      vec3 port = vec3(0.016, 0.017, 0.02) + refl * (0.3 + 0.7 * fres) + uFlood * (0.025 + 0.035 * sheen * near) * floodK;
      int pk = int(floor(u / M)) * 131 + fl;
      float plit = step(hash3(key, pk, 71), target);
      surf = mix(skinLit, port, hole);
      // 亮的圆窗里看得到室内：上半（天花）亮、下半与圆窗边缘暗（复审 R5b 修正二：原来是一片平涂的桃色圆片）
      float depth = (0.3 + 0.7 * smoothstep(-0.4 * r, 0.6 * r, c.y)) * (1.0 - 0.55 * clamp(dot(c, c) / (r * r), 0.0, 1.0));
      emit = mix(uWarm, uOfficeN, hash3(key, pk, 72)) * 0.45 * mix(target * cov * 0.6, plit * circ * depth, near);
    } else if (feat == ${FEATURE.lobby}) {
      float top = A.w + max(C.x, 3.0);
      if (D.x > 0.5) {
        // 扶梯玻璃筒（steel-frame 广场）：里面很亮的冷白，竖梃切开；整块平均算玻璃的块一律当玻璃（复审 R5b：底腹下沿那一圈
        // 按照片逐像素分玻璃 / 实墙时成了一条明暗相间的锯齿带）
        float fr = fpulse(u / M + 0.5, wu / M, 0.5, 0.05 / M);
        float gT = vCol.a > 0.45 ? 1.0 : gb;
        emit = uBelly * 0.9 * (1.0 - 0.6 * fr) * gT;
        surf = mix(surf, refl * fres, gT);
      } else {
        // 大堂玻璃：照片反照率不要，玻璃后面是一间亮着的大堂（天花筒灯、地面、后墙），竖梃 / 门头横档按块的竖梃间距；
        // 实的部分（柱、石材）带一点自下而上的泛光
        // 复审 R5b：照片里的大堂玻璃带着白天的倒影（树、对面的楼、橙褐的室内），被分成「实墙」就成了灰绿 / 橙褐的斑块：
        // 按整块分：块平均算玻璃的（顶点色 alpha = 块的玻璃度 > 0.45）一律当玻璃（竖梃、门头横档照旧按程序画），偏实的块（柱、石材墙）
        // 一律当实墙——逐像素分时，实墙块里零星被判成玻璃的像素映着天空，成了一块块浅灰的斑；实墙不取照片的色相、明暗只留三成
        float Ml = clamp(M, 1.2, 3.0);
        float fr = max(fpulse(u / Ml + 0.5, wu / Ml, 0.5, 0.05 / Ml), fband(vWorld.y, wv, top - 0.25, top + 0.25));
        fr = max(fr, fband(vWorld.y, wv, A.w + 2.9, A.w + 3.05));
        vec3 room = lobbyRoom(vWorld, V, n, A.w, top);
        float gL = vCol.a > 0.45 ? 1.0 : 0.0;
        vec3 stone = vec3(mix(0.18, clamp(dot(alb, LUMA), 0.1, 0.3), 0.3));
        // F4.y：暖色大堂（porthole-house，2019 两张照片：米色石柱在暖色筒灯下 (178,146,128)、大堂里 (105,89,74)；复审 R5b 修正二）
        vec3 warmT = mix(vec3(1.0), vec3(1.3, 1.0, 0.72), F4.y);
        stone *= mix(vec3(1.0), vec3(1.6, 1.25, 0.95), F4.y);
        vec3 down = mix(uFlood * 0.18, uWarm * 0.55, F4.y);
        emit = room * warmT * (1.0 - fres) * (1.0 - 0.85 * fr) * gL;
        surf = mix(stone * (amb + canyon + down * exp(-max(lift, 0.0) / mix(8.0, 10.0, F4.y))), refl * fres + vec3(0.01) * fr, gL);
      }
    } else if (feat == ${FEATURE.belly}) {
      // 广场顶上的玻璃底腹：冷白透光的 1.6 m 玻璃格，越往上凹（扶梯口）越亮
      vec2 q = vWorld.xz / 1.6;
      vec2 fq = fwidth(q);
      float gridL = max(fpulse(q.x + 0.5, fq.x, 0.5, 0.03), fpulse(q.y + 0.5, fq.y, 0.5, 0.03));
      float pane = hash12(floor(q) + 0.5);
      emit = uBelly * (0.16 + 0.1 * pane + 0.45 * smoothstep(9.0, 11.5, lift)) * (1.0 - 0.75 * gridL);
      surf = vec3(0.01);
    } else if (feat == ${FEATURE.edge}) {
      emit += uLed * 1.8;
    }
  }
  surf *= 0.7 + 0.3 * smoothstep(0.0, 2.0, lift);
  col = applyHaze(surf, emit, vWorld);
  if (uDebug > 0.5) {
    float gd = 1.0 - solidCover(g);
    vec3 pal[16] = vec3[16](vec3(0.35), vec3(0.15), vec3(1.0), vec3(0.8, 0.9, 1.0), vec3(0.2, 0.3, 1.0), vec3(1.0, 0.2, 0.9),
      vec3(1.0, 1.0, 0.6), vec3(1.0, 0.1, 0.1), vec3(0.6, 0.3, 1.0), vec3(0.8, 0.85, 0.95), vec3(1.0, 0.7, 0.3), vec3(0.4, 1.0, 0.4),
      vec3(0.85, 0.95, 1.0), vec3(1.0, 0.35, 0.25), vec3(1.0), vec3(0.6, 0.45, 1.0));
    col = uDebug < 1.5 ? alb * 0.5 : (uDebug < 2.5 ? vec3(gd, 1.0 - gd, 0.0) * 0.5 : (uDebug < 3.5 ? pal[clamp(feat, 0, 15)] * 0.5 : dbg4 * 0.5));
  }
  ${GLSL_FINISH}
}
`;

const v3 = (name: string) => ({ value: lightColour(name) });

export interface LandmarkUniforms {
  uAtlas: IUniform<Texture | null>;
  uAtlasOn: IUniform<number>;
  uAtlasPx: IUniform<number>;
  uLmA: IUniform<Vector4[]>;
  uLmB: IUniform<Vector4[]>;
  uLmC: IUniform<Vector4[]>;
  uLmD: IUniform<Vector4[]>;
  uLmE: IUniform<Vector4[]>;
  uLmF: IUniform<Vector4[]>;
  uCycle: IUniform<number>;
  uDebug: IUniform<number>;
}

/** 共用的 uniform（近景网格与远景网格两个材质实例按引用共享，只有 uHide 各自一份）。 */
export function landmarkUniforms(): LandmarkUniforms {
  const arr = (x: number, y: number, z: number, w: number) => ({ value: Array.from({ length: MAX_LANDMARKS }, () => new Vector4(x, y, z, w)) });
  return {
    uAtlas: { value: null },
    uAtlasOn: { value: 0 },
    uAtlasPx: { value: 1024 },
    uLmA: arr(4, 0, 0.3, 0),
    uLmB: arr(0.3, 1, 0, 1),
    uLmC: arr(10, 0.5, 1, 0.08),
    uLmD: arr(0, 1, 0, 0),
    uLmE: arr(0, 0, 0, 0),
    uLmF: arr(0, 0, 0, 0),
    uCycle: { value: 0 },
    uDebug: { value: 0 },
  };
}

/** 地标材质：双面（地政总署模型有开放的面、单层的立面片）；uHide 只给远景合并网格用（近景与远景各一个实例）。 */
export function createLandmarkMaterial(shared: LandmarkUniforms): ShaderMaterial {
  const uniforms: Record<string, IUniform> = {
    ...sharedUniforms(),
    ...(shared as unknown as Record<string, IUniform>),
    uHide: { value: 0 },
    uOfficeN: v3('officeNeutral'),
    uOfficeC: v3('officeCool'),
    uOfficeW: v3('officeWarm'),
    uWarm: v3('shopWarm'),
    uLed: v3('crownWhite'),
    uCrown: { value: lightColour('#fffbf0') },
    uBand: { value: lightColour('#4a5cff') },
    uMagenta: { value: lightColour('#b048ff') },
    uRed: { value: lightColour('#ff2a3c') },
    uViolet: { value: lightColour('#8f7cff') },
    uFlood: { value: lightColour('#eef4ff') },
    uTier: { value: lightColour('#a8b4ff') },
    uLobby: { value: lightColour('#f6f3ec') },
    uBelly: { value: lightColour('#eaf2ff') },
    uSpire: { value: lightColour('#ff38c4') },
  };
  return new ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: DoubleSide });
}

/**
 * 建筑材质（写实化一轮，按共享光照契约 lighting.ts 重写）：程序立面、按楼层 / 租户成片的窗灯、铺面、屋顶、冠顶。无贴图。
 *
 * 顶点布局与风格码见 render/facade.ts（aFacade = u, v, h, style；aBldg = 层高, 街面冷暖, 墙脚地面, 特征位）。
 * 类型（立面模式）：5 写字楼、6 住宅、7 唐楼、8 裙楼、9 公共建筑、10 屋顶机房；1 敏感区（素灰石材、暗窗格、无发光）；
 * 0 / 2 / 3 旧模式（地标与旧远景用）按写字楼画；4 远山。
 *
 * 亮度标尺（线性 HDR，曝光 1.0，见 lighting.EMISSIVE）：
 * - 未亮灯立面 ≈ 0.004–0.06（上部约 0.01，底部 0–30 m 由 cityAmbient 的街面反光抬亮）；屋顶 ≤ 0.015；
 * - 写字楼亮窗整窗平均 ≈ 0.25–0.45，天花灯具点 ≈ 1.5（只有它 > 1）；住宅亮窗 0.12–0.45；铺面 0.5–1.1；
 * - 冠顶泛光 1.6–2.8（白光可过曝），避难层通亮带 ≈ 0.9。
 * 远处：所有几何细节（竖梃、窗间墙、灯具、窗机）都是盒式滤波的周期脉冲，像素再大也保持正确的平均覆盖率；
 * 楼层小于半个像素时按 2^L 层合并成一个「代表楼层」抽样（亮灯率的期望不变），两级之间交叉淡化，远看不闪。
 * 片元最后 applyHaze（表面吃满雾、发光项只吃 uLightHaze）+ GLSL_FINISH。
 */
import { ShaderMaterial, type IUniform } from 'three';
import { GLSL_HASH } from './common';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, getQuality, lightColour, sharedUniforms } from './lighting';
import { GLSL_WINDOWS } from '../windows';

const vertexShader = /* glsl */ `
attribute vec4 aFacade;
attribute vec4 aBldg;
varying vec3 vFacade;
// 风格码与逐栋参数恒定：flat 避免插值误差把 hash 输入搅成噪点
flat varying float vStyle;
flat varying vec4 vBldg;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vFacade = aFacade.xyz;
  vStyle = aFacade.w;
  vBldg = aBldg;
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
${GLSL_WINDOWS}

uniform vec3 uOfficeN;
uniform vec3 uOfficeC;
uniform vec3 uOfficeW;
uniform vec3 uHomeW;
uniform vec3 uHomeC;
uniform vec3 uShop;
uniform vec3 uTube;
uniform vec3 uCrown[4];

varying vec3 vFacade;
flat varying float vStyle;
flat varying vec4 vBldg;
varying vec3 vNormalW;
varying vec3 vWorld;

const int OFS = 4096;
// 天顶色（#14151c 线性）与街面反射色，用于玻璃的菲涅尔反射
const vec3 ZENITH = vec3(0.0070, 0.0075, 0.0116);

float pulseInt(float x, float a, float b) {
  return floor(x) * (b - a) + clamp(fract(x) - a, 0.0, b - a);
}
// 周期 1 的脉冲 [c − hw, c + hw]（须在 [0, 1] 内）按像素宽 w（周期数）盒式滤波后的覆盖率：远处自动收敛到 2·hw
float fpulse(float x, float w, float c, float hw) {
  w = max(w, 1e-3);
  float a = c - hw;
  float b = c + hw;
  return clamp((pulseInt(x + 0.5 * w, a, b) - pulseInt(x - 0.5 * w, a, b)) / w, 0.0, 1.0);
}
// 非周期区间 [a, b] 的滤波覆盖率
float fband(float x, float w, float a, float b) {
  w = max(w, 1e-3);
  return (clamp(x + 0.5 * w, a, b) - clamp(x - 0.5 * w, a, b)) / w;
}

// 远处按 2^L 层合并：组内随机挑一层作代表（期望亮灯率不变，相机移动时组不变所以不闪）
int repFloor(int key, int fl, int L) {
  if (L <= 0) return fl;
  int g = fl >> L;
  return (g << L) + int(hash3(key, g, 31 + L) * float(1 << L));
}

// 像素覆盖的楼层数 → (合并级 L0, 向 L0+1 的淡化系数)
vec2 mergeLevel(float floorsPerPx) {
  float Lf = log2(max(floorsPerPx * 2.0, 1.0));
  float L0 = floor(Lf);
  return vec2(L0, Lf > 0.0 ? smoothstep(0.5, 1.0, Lf - L0) : 0.0);
}

// 视线穿过玻璃进入一个开敞房间（只有天花、地面、后墙）。x：沿墙水平坐标（米），y：离楼板高度（米）。
// 返回 (面上坐标 a, 面上坐标 b, 面类型, 进深)：天花 / 地面为 (水平, 进深)，后墙为 (水平, 高度)；类型 0 天花、1 地面、2 后墙。
vec4 roomRay(vec3 n, vec3 V, float x, float y, float ceilH, float depth) {
  vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), n));
  float dn = max(dot(V, n), 0.06);
  float du = -dot(V, t) / dn;
  float dv = -V.y / dn;
  float zc = dv > 1e-4 ? (ceilH - y) / dv : 1e6;
  float zf = dv < -1e-4 ? (y - 0.05) / -dv : 1e6;
  float z = clamp(min(min(zc, zf), depth), 0.0, depth);
  float kind = z >= depth - 1e-3 ? 2.0 : (zc < zf ? 0.0 : 1.0);
  return vec4(x + du * z, kind > 1.5 ? y + dv * z : z, kind, z);
}

vec3 glassRefl(vec3 n, vec3 V, float warmth, out float fres) {
  vec3 R = reflect(-V, n);
  fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
  vec3 street = mix(vec3(0.050, 0.046, 0.040), vec3(0.070, 0.048, 0.024), warmth);
  return R.y >= 0.0 ? mix(uHazeColor, ZENITH, smoothstep(0.0, 0.45, R.y)) : mix(uHazeColor, street, smoothstep(0.0, -0.25, R.y));
}

// ---------------------------------------------------------------- 写字楼
void office(float u, float v, float h, float F, float M, int key, int fam, float tint, vec3 amb, vec3 refl, float fres,
            int feat, bool porthole, vec3 normalW, vec3 viewW, out vec3 surf, out vec3 emit) {
  float clock = (feat & 128) != 0 ? min(uClock, 19.0) : uClock;
  float wu = fwidth(u);
  float wv = fwidth(v);
  bool stone = fam == 3;
  float S = stone ? 1.6 : 1.0 + 0.2 * hash3(key, 3, 0);
  float g0 = 0.45 * S;
  float g1 = F - 0.55 * S;
  float gh = g1 - g0;
  float fv = v / F;
  int fl = int(floor(fv)) + OFS;
  float bu = u / M;
  int bay = int(floor(bu));
  float wfv = wv / F;
  float wbu = wu / M;
  float mullHW = (stone ? 0.22 : 0.035) / M;
  float glassU = 1.0 - fpulse(bu + 0.5, wbu, 0.5, mullHW);
  // 结构柱 / 隔墙：每 6 个窗距一道 0.6 m 宽的暗竖带（亮着的楼层里看得出窗格节奏，远处按覆盖率淡化）
  if (!stone) glassU *= 1.0 - 0.85 * fpulse(bu / 6.0 + 0.5, wbu / 6.0, 0.5, 0.3 / (6.0 * M));
  float glassV = fpulse(fv, wfv, (g0 + g1) * 0.5 / F, gh * 0.5 / F);
  if (porthole) {
    // 圆窗：近处画圆，远处取面积占比
    vec2 c = (vec2(fract(bu), fract(fv)) - 0.5) * vec2(M, F);
    float aaM = max(wu, wv);
    float r = min(M, F) * 0.36;
    float circ = 1.0 - smoothstep(r - aaM, r + aaM, length(c));
    float cov = 3.14159 * r * r / (M * F);
    float far = smoothstep(0.15, 0.5, aaM / r);
    glassU = 1.0;
    glassV = mix(circ, cov, far);
  }

  // 亮灯：楼层 + 租户（windows.ts 的镜像），远处合并楼层
  vec2 ml = mergeLevel(wfv);
  int L0 = int(ml.x);
  vec3 s0 = officeLit(key, repFloor(key, fl, L0), bay, clock);
  float lit = s0.x;
  if (ml.y > 0.0) lit = mix(lit, officeLit(key, repFloor(key, fl, L0 + 1), bay, clock).x, ml.y);
  // 远处（整合时加）：一个像素盖住 N 层 × 若干租户段时，亮灯按 N^−1/4 向期望亮灯率收敛，
  // 不再整像素亮 / 灭——山顶、手机尺寸下的楼群不成椒盐噪点，又留着亮窗的颗粒；近处 N = 1 不变
  float nFar = exp2(ml.x + ml.y) * max(1.0, wbu / 12.0);
  if (nFar > 1.01) lit = mix(officeLitTarget(clock), lit, inversesqrt(sqrt(nFar)));
  int tk = int(s0.y) * 977 + int(s0.z);
  float th = hash3(key, tk, 27);
  // 暖白租户比契约色稍淡（3000 K 的灯透过有色玻璃，照片里偏黄白而非橙）
  vec3 lc = th < 0.11 ? mix(uOfficeW, uOfficeN, 0.45) : (th < 0.7 ? uOfficeN : uOfficeC);
  // 租户亮度近似对数正态（windows.officeTenantBrightness）：多数偏暗、少数很亮；整层通亮的楼层亮且匀
  float hb = hash3(key, tk, 28);
  float B = s0.z < -0.5 ? 0.65 + 0.7 * hb * hb : 0.3 + 1.2 * hb * hb;
  // 远处（一个像素盖住多个租户段）向平均亮度收敛，免得整片楼面成椒盐
  B = mix(0.7, B, inversesqrt(sqrt(max(nFar, 1.0))));
  bool blinds = hash3(key, tk, 29) < 0.15;

  // 窗内亮度剖面（单位玻璃面积）：下部家具暗、中部、天花最亮、灯具一排点（1.0–1.8）
  float det = 1.0 - smoothstep(0.06, 0.25, wu);
  float furn = mix(0.8, hash12(vec2(floor(u / 0.45), float(fl))) < 0.55 ? 0.45 : 1.0, det);
  float pLow = fpulse(fv, wfv, (g0 + 0.175 * gh) / F, 0.175 * gh / F);
  float pMid = fpulse(fv, wfv, (g0 + 0.565 * gh) / F, 0.215 * gh / F);
  float pCeil = fpulse(fv, wfv, (g0 + 0.89 * gh) / F, 0.11 * gh / F);
  float pRow = fpulse(fv, wfv, (g0 + 0.86 * gh) / F, 0.035 * gh / F);
  float dots = fpulse(u / 0.6, wu / 0.6, 0.5, 0.22);
  float prof = 0.14 * furn * pLow + 0.32 * pMid + 1.0 * pCeil + 1.5 * pRow * dots;
  if (blinds) {
    // 百叶帘（整合时调）：不再是一块平灰板——上亮下暗（天花灯照在帘上）、近处 0.1 m 一条叶片，
    // 约四成的窗帘只拉下一半，下半截仍看得见室内
    float fyB = fract(fv) * F;
    float slatW = wv / 0.1;
    float slat = mix(1.0, 0.72 + 0.28 * fpulse(v / 0.1, slatW, 0.5, 0.32), 1.0 - smoothstep(0.3, 0.8, slatW));
    float shade = (0.2 + 0.2 * smoothstep(g0, g1, fyB)) * slat;
    float half_ = step(hash12(vec2(float(bay) + 0.3, float(fl) * 2.3)), 0.4) * step(fyB, g0 + 0.45 * gh);
    prof = mix(shade * glassV, prof, half_);
  }
  if (stone || porthole) prof = blinds ? 0.3 * glassV : 0.38 * glassV;
  // 逐窗 ±30 % 的亮度差（不同房间、灯具、隔断）：一个窗距仍有约 1 px 时保留，比这更远才取平均
  float perWin = mix(1.0, 0.7 + 0.6 * hash12(vec2(float(bay) + 0.5, float(fl) * 1.7)), 1.0 - smoothstep(0.6, 1.6, wbu));
  // 近处（像素 < 约 15 cm）：视线进入 5 m 深的开敞办公室，看见一排排向里退的天花灯盘、后墙与桌面
#ifdef ROOM_MAPPING
  float detRoom = (stone || porthole || blinds) ? 0.0 : 1.0 - smoothstep(0.05, 0.16, wu);
  if (detRoom > 0.0 && lit > 0.0) {
    float fy = (fv - floor(fv)) * F;
    vec4 rr = roomRay(normalW, viewW, u, fy, g1, 5.0);
    float wa = fwidth(rr.x);
    float wb = fwidth(rr.y);
    float isC = 1.0 - step(0.5, rr.z);
    float isF = step(0.5, rr.z) * (1.0 - step(1.5, rr.z));
    float isB = step(1.5, rr.z);
    // 天花：灯盘每 1.5 m 一排（进深方向），每排 1.2 m 长、0.6 m 间隔
    float tro = fpulse(rr.y / 1.5, wb / 1.5, 0.5, 0.11) * fpulse(rr.x / 1.8 + 0.25, wa / 1.8, 0.5, 0.33);
    float Lc = 0.36 + 1.25 * tro;
    // 地面：桌面与隔板的暗块
    float Lf = 0.1 * (hash12(floor(vec2(rr.x / 1.6, rr.y / 1.4))) < 0.5 ? 0.6 : 1.1);
    // 后墙：上部亮、下部隔板暗
    float Lb = rr.y > 1.2 ? 0.3 : 0.14;
    float room = (isC * Lc + isF * Lf + isB * Lb) * (1.0 - 0.25 * rr.w / 5.0);
    prof = mix(prof, room * glassV, detRoom);
  }
#endif
  emit = lc * (B * lit * glassU * prof * perWin);

  // 熄灯楼层偶有走廊 / 夜灯（很暗）
  float night = (1.0 - lit) * step(hash3(key, fl * 131 + bay, 33), 0.05) * 0.035;
  emit += uOfficeN * night * glassU * glassV;
  // 室内溢光：熄灯的玻璃后面并非全黑（走廊、邻室、核心筒的灯透过来），逐层 0.006–0.02，照片里暗楼层是深灰不是纯黑
  float spill = 0.006 + 0.014 * hash3(key, fl, 35);
  emit += uOfficeN * spill * (1.0 - lit) * glassU * glassV;

  // 表面：玻璃（深色族色 + 菲涅尔反射）、窗间墙、竖梃
  vec3 famCol = fam == 0 ? vec3(0.0213, 0.0319, 0.0497) : (fam == 1 ? vec3(0.0232, 0.0423, 0.0368) : vec3(0.0232, 0.0212, 0.0319));
  famCol *= tint;
  float pane = mix(1.0, 0.85 + 0.3 * hash12(vec2(float(bay), float(fl))), det);
  vec3 glass = famCol * 0.35 * pane + refl * fres;
  vec3 stoneAlb = vec3(0.21, 0.195, 0.17) * tint;
  vec3 spand = stone ? stoneAlb * amb : famCol * 0.22 + refl * fres * 0.8 + 0.02 * amb;
  vec3 mull = stone ? stoneAlb * amb * 0.9 : vec3(0.035) * amb + refl * fres * 0.5;
  surf = glassU * (glassV * glass + (1.0 - glassV) * spand) + (1.0 - glassU) * mull;

  // 地标镜面大厦：竖梃节点点阵 LED（静态，约 1.5）
  if ((feat & 64) != 0) {
    float nd = fpulse(bu + 0.5, wbu, 0.5, 0.06 / M) * fpulse(fv + 0.5, wfv, 0.5, 0.06 / F);
    emit += uCrown[0] * nd * 1.5;
  }
  // 避难层 / 机电层：每 15–25 层一道整层通亮带（0.9）
  if ((feat & 8) != 0) {
    int every = 15 + int(hash3(key, 34, 0) * 11.0);
    float band = fband(mod(v, float(every) * F), wv, float(every - 1) * F + 0.3, float(every) * F - 0.3);
    if (v > 20.0 && v < h - 15.0) {
      emit = mix(emit, uOfficeN * 0.9, band);
      surf = mix(surf, vec3(0.05) * amb, band);
    }
  }
}

// ---------------------------------------------------------------- 住宅 / 唐楼
vec3 wallPalette(int i, bool old) {
  if (old) {
    vec3 c = i == 0 ? vec3(0.396, 0.539, 0.440) : i == 1 ? vec3(0.584, 0.351, 0.249) : i == 2 ? vec3(0.341, 0.332, 0.314)
           : i == 3 ? vec3(0.610, 0.521, 0.341) : i == 4 ? vec3(0.341, 0.402, 0.451) : vec3(0.552, 0.527, 0.456);
    return c * 0.62;
  }
  // 浅色瓷砖：米白、浅米、浅灰、淡粉、淡绿、灰白（夜里被钠灯照得偏暖，所以底色取得偏冷偏淡）
  vec3 c = i == 0 ? vec3(0.680, 0.640, 0.540) : i == 1 ? vec3(0.600, 0.540, 0.430) : i == 2 ? vec3(0.560, 0.565, 0.560)
         : i == 3 ? vec3(0.640, 0.540, 0.500) : i == 4 ? vec3(0.520, 0.580, 0.520) : vec3(0.700, 0.700, 0.680);
  return c * 0.7;
}

void residential(float u, float v, float F, int key, bool old, float tint, vec3 amb, vec3 refl, float fres, float lift,
                 out vec3 surf, out vec3 emit) {
  float wu = fwidth(u);
  float wv = fwidth(v);
  bool modern = !old && hash3(key, 40, 0) < 0.3;
  bool hasAC = !modern && hash3(key, 41, 0) < (old ? 0.85 : 0.72);
  float Wf = old ? 4.0 + 1.6 * hash3(key, 42, 0) : 6.0 + 3.0 * hash3(key, 42, 0);
  int nWin = old ? 2 : 2 + int(hash3(key, 43, 0) * 3.0);
  float slotW = Wf / float(nWin);
  float ww = modern ? slotW * 0.78 : clamp(slotW * 0.55, 0.9, old ? 1.7 : 1.5);
  float sill = modern ? 0.5 : (old ? 1.0 : 0.9);
  float wh = modern ? min(F - 0.9, 1.9) : (old ? min(1.6, F - 1.4) : 1.3);
  float fv = v / F;
  int fl = int(floor(fv)) + OFS;
  float su = u / slotW;
  int slotG = int(floor(su));
  int flat_ = slotG / nWin;
  int slot = slotG - flat_ * nWin;
  float wsu = wu / slotW;
  float wfv = wv / F;
  float winU = fpulse(su, wsu, 0.5, 0.5 * ww / slotW);
  float winV = fpulse(fv, wfv, (sill + 0.5 * wh) / F, 0.5 * wh / F);
  float win = winU * winV;

  vec2 ml = mergeLevel(wfv);
  int L0 = int(ml.x);
  int rf = repFloor(key, fl, L0);
  float lit = homeWindowLit(key, rf, flat_, slot, uClock);
  if (ml.y > 0.0) lit = mix(lit, homeWindowLit(key, repFloor(key, fl, L0 + 1), flat_, slot, uClock), ml.y);
  // 远处同写字楼：按合并层数 × 每像素窗数向期望亮灯率收敛
  float nFar = exp2(ml.x + ml.y) * max(1.0, wsu);
  if (nFar > 1.01) lit = mix(homeLitTarget(uClock), lit, inversesqrt(sqrt(nFar)));
  int fk = rf * 613 + flat_;
  vec3 lc = hash3(key, fk, 66) < 0.6 ? uHomeW : uHomeC;
  bool curtain = hash3(key, fk * 4 + slot, 68) < 0.3;
  float B = (curtain ? 0.12 : 0.2) + 0.25 * hash3(key, fk, 67);
  // 近处：窗框横档（窗高 70 % 处）与中梃，暗线
  float det = 1.0 - smoothstep(0.04, 0.2, wu);
  float frame = det * max(fpulse(fv, wfv, (sill + 0.7 * wh) / F, 0.025 / F), fpulse(su, wsu, 0.5, 0.025 / slotW)) * winV * winU;
  // 近处亮窗的室内：上亮下暗（天花灯）、窗帘褶皱（拉上的窗）或半拉窗帘（一侧被帘挡住、更暗更暖）、
  // 下沿家具剪影；远处退成平均（均值约 0.85，不改总亮度）
  float yIn = clamp((fract(fv) * F - sill) / wh, 0.0, 1.0);
  float xIn = fract(su) * slotW / max(ww, 0.1) - 0.5 * (slotW / max(ww, 0.1) - 1.0);
  float inner = 0.6 + 0.55 * smoothstep(0.15, 0.95, yIn);
  inner *= 1.0 - 0.45 * (1.0 - smoothstep(0.08, 0.22, yIn)) * step(0.5, hash12(vec2(floor(u / 0.5), float(fl))));
  if (curtain) inner = 0.75 + 0.25 * sin(u * 41.9);
  else if (hash3(key, fk * 4 + slot, 73) < 0.4) inner *= mix(1.0, 0.45, step(xIn, 0.3 + 0.4 * hash3(key, fk * 4 + slot, 74)));
  inner = mix(0.85, inner, det);
  emit = lc * (B * lit * win * inner * (1.0 - 0.8 * frame));
  // 铝窗框（浅色细框，近处可见）
  float rimD = 1.0 - smoothstep(0.08, 0.35, wu);
  float rim = rimD * winV * (fpulse(su, wsu, 0.5 - 0.5 * ww / slotW + 0.025 / slotW, 0.025 / slotW) + fpulse(su, wsu, 0.5 + 0.5 * ww / slotW - 0.025 / slotW, 0.025 / slotW));
  rim += rimD * winU * (fpulse(fv, wfv, (sill + 0.025) / F, 0.025 / F) + fpulse(fv, wfv, (sill + wh - 0.025) / F, 0.025 / F));
  rim = min(rim, 1.0);
  // 未亮灯的窗：三成挂浅色窗帘（反一点街光），其余暗玻璃
  float curtainU = hash3(key, fk * 4 + slot, 69) < 0.35 ? 1.0 : 0.0;

  // 墙：瓷砖色族 + 竖向污迹 + 近处砖缝
  int pal = int(hash3(key, 44, 0) * 6.0);
  vec3 alb = wallPalette(pal, old) * tint;
  float streak = vnoise(vec2(u * 1.3, v * 0.035 + float(key & 255)));
  alb *= 1.0 - (old ? 0.35 : 0.18) * smoothstep(0.45, 0.9, streak);
  float tile = det * max(fpulse(u / 0.2, wu / 0.2, 0.5, 0.04), fpulse(v / 0.2, wv / 0.2, 0.5, 0.04));
  alb *= 1.0 - 0.12 * tile;
  if (modern) {
    // 新式住宅：楼板边浅色横带 + 外凸窗台线
    float slab = fpulse(fv, wfv, 0.05, 0.05);
    alb = mix(alb, vec3(0.42, 0.41, 0.39), slab);
  }
  // 窗洞四周 10 cm 的暗边（窗台、窗楣的阴影）：中距离也看得出窗是凹进去的，不是贴在墙上的色块
  float revU = fpulse(su, wsu, 0.5, 0.5 * ww / slotW + 0.1 / slotW);
  float revV = fpulse(fv, wfv, (sill + 0.5 * wh) / F, 0.5 * wh / F + 0.1 / F);
  float reveal = clamp(revU * revV - win, 0.0, 1.0);
  vec3 wall = alb * amb * (1.0 - 0.6 * reveal);
  // 逐窗玻璃：深色玻璃深浅不一，三成挂浅色窗帘（反一点街光），另有两成透出邻室微光
  float gv = hash3(key, fk * 4 + slot, 72);
  vec3 dark = vec3(0.010, 0.011, 0.013) * (0.6 + 0.9 * gv) + refl * fres * (0.6 + 0.6 * gv);
  vec3 glass = mix(dark, vec3(0.2, 0.18, 0.15) * amb * 0.6 + refl * fres * 0.5, curtainU);
  glass += lc * 0.012 * step(0.8, gv) * (1.0 - curtainU);
  surf = mix(wall, glass, win);
  surf = mix(surf, vec3(0.5, 0.5, 0.48) * amb, rim * (1.0 - lit));
  // 楼板线：每层一道略深的横带（非新式）
  if (!modern) surf *= 1.0 - 0.12 * fpulse(fv, wfv, 0.04, 0.04);

  // 窗机（0.6 × 0.45 m，窗下偏一侧；带顶部亮边、底下 3 cm 阴影、格栅），近处才画细节，远处按覆盖率淡化
  if (hasAC) {
    int ak = fk * 4 + slot;
    float has = hash3(key, ak, 70) < 0.5 ? 1.0 : 0.0;
    float side = hash3(key, ak, 71) < 0.5 ? -1.0 : 1.0;
    float cx = 0.5 + side * clamp((ww * 0.5 - 0.3) / slotW, 0.0, 0.3);
    float acU = fpulse(su, wsu, cx, 0.3 / slotW);
    float acV = fpulse(fv, wfv, (sill - 0.375) / F, 0.225 / F);
    float shadow = fpulse(fv, wfv, (sill - 0.62) / F, 0.025 / F) * acU;
    float top = fpulse(fv, wfv, (sill - 0.17) / F, 0.02 / F) * acU;
    float grille = det * fpulse(v / 0.06, wv / 0.06, 0.5, 0.18);
    float ac = has * acU * acV;
    vec3 acAlb = vec3(0.56, 0.54, 0.49) * (1.0 - 0.35 * grille);
    surf = mix(surf, acAlb * amb, ac);
    surf = mix(surf, acAlb * amb * 1.35, has * top);
    surf = mix(surf, alb * amb * 0.25, has * shadow);
  }
}

// ---------------------------------------------------------------- 铺面（离街 0–4.6 m）
void shopfront(float u, float lift, int key, int typ, float shopTop, vec3 amb, vec3 normalW, vec3 viewW, out vec3 surf, out vec3 emit) {
  float wu = fwidth(u);
  float wl = fwidth(lift);
  float unitW = 4.5 + 3.5 * hash3(key, 52, 0);
  float uu = u / unitW;
  int unit = int(floor(uu)) + OFS;
  float r = hash3(key, unit, 53);
  // 类型：0 商铺、1 大堂、2 落闸、3 熄灯铺
  int kind = typ == 5 ? (r < 0.3 ? 1 : (r < 0.88 ? 0 : 2)) : (r < 0.2 ? 2 : (r < 0.27 ? 3 : 0));
  float pier = fpulse(uu + 0.5, wu / unitW, 0.5, 0.25 / unitW);
  float glazeTop = kind == 1 ? shopTop - 0.5 : min(3.3, shopTop - 1.0);
  float glaze = fband(lift, wl, 0.25, glazeTop) * (1.0 - pier);
  // 门框 / 竖框（整合时加粗到 6 cm）+ 2.5 m 处一道横框
  float mull = max(fpulse(u / 1.3, wu / 1.3, 0.5, 0.06 / 1.3), fband(lift, wl, 2.46, 2.54));
  float B = 0.35 + 0.65 * hash3(key, unit, 54);
  // 约三成的铺子灯暗一半（小店、快打烊）
  if (hash3(key, unit, 61) < 0.3) B *= 0.5;
  // 室内：天花一条最亮（灯槽 / 筒灯），中部货架与陈列，下部较暗；近处有货架、人台的暗剪影
  float detS = 1.0 - smoothstep(0.05, 0.3, wu);
  float col7 = floor(u / 0.7);
  float shelf = mix(0.75, hash12(vec2(col7, float(unit))) < 0.45 ? 0.35 : 1.0, detS * (1.0 - smoothstep(2.2, 2.6, lift)));
  float grad = (0.4 + 0.5 * smoothstep(0.3, 2.4, lift)) * shelf + 0.9 * fband(lift, wl, glazeTop - 0.45, glazeTop - 0.1);
  float tintH = hash3(key, unit, 56);
  vec3 shopC = tintH < 0.38 ? mix(uShop, uTube, 0.8) : (tintH < 0.46 ? uShop * vec3(1.1, 0.85, 0.8) : uShop);
  // 货品（整合时加）：0.4–2.3 m 之间按 0.7 m 一列的低饱和色块，各列明暗不同；远处退成平均（均值 ≈ 1，不改总亮度）
  float fu = float(unit);
  vec3 merch = 0.55 + 0.9 * vec3(hash12(vec2(col7, 3.1 + fu)), hash12(vec2(col7, 5.7 + fu)), hash12(vec2(col7, 8.3 + fu)));
  merch = mix(vec3(1.0), merch, 0.55 * detS * fband(lift, wl, 0.4, 2.3));
  vec3 inner = kind == 1 ? mix(uTube, uOfficeN, 0.5) * (0.45 + 0.5 * smoothstep(0.5, shopTop - 0.6, lift)) : shopC * B * grad * merch;
  // 近处：视线进入 7 m 深的铺内：天花筒灯阵、后墙货架（逐格略有色差）、亮地面
#ifdef ROOM_MAPPING
  float detRoom = 1.0 - smoothstep(0.05, 0.18, wu);
  if (detRoom > 0.0 && kind != 2 && kind != 3) {
    vec4 rr = roomRay(normalW, viewW, u, lift, glazeTop + 0.2, 7.0);
    float wa = fwidth(rr.x);
    float wb = fwidth(rr.y);
    float isC = 1.0 - step(0.5, rr.z);
    float isF = step(0.5, rr.z) * (1.0 - step(1.5, rr.z));
    float isB = step(1.5, rr.z);
    float dl = fpulse(rr.x / 1.2, wa / 1.2, 0.5, 0.08) * fpulse(rr.y / 1.2, wb / 1.2, 0.5, 0.08);
    float Lc = 0.55 + 6.0 * dl;
    float shelfCol = floor(rr.x / 0.9);
    float sh = hash12(vec2(shelfCol, float(unit) + 0.5));
    // 后墙货架：0.3–0.6 m 的货品块，饱和色（红、黄、绿、蓝、白……）各块明暗不同，块与块之间暗缝；
    // 不再是整排横条纹（照片 16、10：铺内五颜六色、塞得满满）
    vec2 pc = vec2(rr.x / (0.3 + 0.3 * sh), rr.y / 0.3);
    vec2 pid = floor(pc);
    float ph = hash12(pid + vec2(float(unit) * 1.3, 7.1));
    vec3 prod = ph < 0.2 ? vec3(1.0, 0.35, 0.3) : ph < 0.38 ? vec3(1.0, 0.85, 0.35) : ph < 0.52 ? vec3(0.4, 0.9, 0.5)
              : ph < 0.64 ? vec3(0.45, 0.6, 1.0) : ph < 0.8 ? vec3(1.0, 0.95, 0.9) : vec3(0.9, 0.55, 0.85);
    vec2 pf = abs(fract(pc) - 0.5);
    float gap = smoothstep(0.38, 0.47, max(pf.x * 1.1, pf.y));
    // 货架层板：每 0.6 m 一道暗横线（货品块之间）；货品只在 0.3–2.2 m 之间
    float shelfLine = fpulse(rr.y / 0.6, wb / 0.6, 0.02, 0.06);
    float stocked = step(0.3, rr.y) * step(rr.y, 2.2) * step(0.25, hash12(pid + 9.9));
    float Lb = kind == 1 ? 0.45 : (0.5 + 0.4 * hash12(pid + 3.3) * stocked) * (1.0 - 0.6 * gap * stocked) * (1.0 - 0.5 * shelfLine);
    vec3 tintB = kind == 1 ? vec3(1.0) : mix(vec3(1.0), prod, 0.45 * stocked);
    float Lf = 0.32;
    // 铺内站着的人 / 人台：每间 0–2 个暗剪影（后墙上 0.45 m 宽、1.7 m 高，头部收窄）
    float sil = 0.0;
    for (int k = 0; k < 2; k++) {
      float hk = hash3(key, unit, 62 + k);
      if (hk < 0.45 || kind == 1) continue;
      float cx = (floor(u / unitW) + 0.2 + 0.6 * hash3(key, unit, 64 + k)) * unitW;
      float dxs = abs(rr.x - cx);
      float body = step(dxs, 0.22) * step(rr.y, 1.45);
      float head = step(length(vec2(dxs, rr.y - 1.6)), 0.12);
      sil = max(sil, max(body, head));
    }
    vec3 roomC = (kind == 1 ? mix(uTube, uOfficeN, 0.5) * 0.8 : shopC * B) * (isC * Lc + isF * Lf + isB * Lb * tintB * (1.0 - 0.85 * sil));
    inner = mix(inner, roomC * (1.0 - 0.2 * rr.w / 7.0), detRoom);
  }
#endif
  float canopy = fband(lift, wl, glazeTop + 0.05, glazeTop + 0.45);
  float fascia = fband(lift, wl, glazeTop + 0.45, shopTop);
  float down = fpulse(u / 1.1, wu / 1.1, 0.5, 0.06 / 1.1) * fband(lift, wl, glazeTop - 0.05, glazeTop + 0.05);
  vec3 stone = vec3(0.16, 0.15, 0.13);
  surf = stone * amb * (pier + fascia * 0.5) + vec3(0.06) * amb * canopy;
  emit = vec3(0.0);
  if (kind == 2) {
    float ribs = fpulse(lift / 0.09, wl / 0.09, 0.5, 0.2);
    surf += vec3(0.17, 0.17, 0.16) * amb * (1.0 - 0.4 * ribs) * glaze;
  } else if (kind == 3) {
    surf += vec3(0.015) * glaze + 0.01 * amb * glaze;
  } else {
    emit = inner * glaze * (1.0 - 0.85 * mull);
    surf += vec3(0.02) * amb * glaze;
    emit += uShop * 3.0 * down;
  }
}

// ---------------------------------------------------------------- 裙楼上部（商场玻璃 / 停车场 / 素墙）
void podiumUpper(float u, float lift, float v, int key, int feat, vec3 amb, vec3 refl, float fres, float tint, out vec3 surf, out vec3 emit) {
  float wu = fwidth(u);
  float wv = fwidth(v);
  vec3 clad = vec3(0.17, 0.165, 0.155) * tint;
  surf = clad * amb;
  emit = vec3(0.0);
  if ((feat & 16) != 0) {
    // 商场玻璃（裙楼类型自己的样式，不是写字楼的逐层租户段）：通高玻璃幕墙、1.5 m 细竖梃、每 9 m 一根 0.8 m 的暗结构柱、
    // 每 4.5 m 一道 0.6 m 的暗楼板线；室内暖白，按「两层高 × 15–40 m」的大块（中庭、店铺）亮度 0.6–1.4 倍，
    // 两成大块熄灯（后勤、打烊的店）。近处天花灯槽一条亮带。整体比写字楼亮窗暗（照片里商场是柔和的暖色带）。
    float mU = 1.0 - fpulse(u / 1.5 + 0.5, wu / 1.5, 0.5, 0.03 / 1.5);
    mU *= 1.0 - 0.9 * fpulse(u / 9.0 + 0.5, wu / 9.0, 0.5, 0.4 / 9.0);
    float mV = 1.0 - fpulse(v / 4.5 + 0.5, wv / 4.5, 0.5, 0.3 / 4.5);
    int level2 = int(floor(v / 9.0)) + OFS;
    float segW = 15.0 + 25.0 * hash3(key, level2, 59);
    int cell = int(floor(u / segW + hash3(key, level2, 60))) * 37 + level2;
    float on = hash3(key, cell, 57) < 0.65 ? 1.0 : 0.06;
    float B = (0.06 + 0.05 * hash3(key, 55, 0)) * (0.5 + 1.0 * hash3(key, cell, 58)) * on;
    float ceilB = 1.0 + 0.8 * fpulse(v / 4.5, wv / 4.5, 0.78, 0.04);
    emit = mix(uShop, uOfficeN, 0.35) * B * ceilB * mU * mV;
    surf = mix(surf, vec3(0.02) + refl * fres, mU * mV);
  } else if ((feat & 32) != 0) {
    // 停车场：每 3 m 一道横向开口，里面暗，零星冷白光管
    float open = fpulse(v / 3.0, wv / 3.0, 0.55, 0.22);
    float tube = fpulse(u / 6.0, wu / 6.0, 0.5, 0.12) * fpulse(v / 3.0, wv / 3.0, 0.72, 0.02);
    surf = mix(surf, vec3(0.006), open);
    emit = uTube * (0.05 * open + 0.9 * tube * open);
  } else {
    // 素墙：横向百叶带
    float louv = fpulse(v / 4.0, wv / 4.0, 0.5, 0.12);
    surf *= 1.0 - 0.35 * louv;
  }
}

void main() {
  float style = vStyle;
  int m = int(floor(style / 256.0) + 0.5);
  int seed = int(floor(mod(style, 256.0)) + 0.5);
  float rnd = fract(style);
  int key = seed * 4099 + int(rnd * 4093.0);
  int body = seed >> 6;
  int bayLv = (seed >> 4) & 3;
  float tint = 0.88 + 0.24 * hash3(key, 1, 0);

  vec3 n = normalize(vNormalW);
  bool roof = n.y > 0.7;
  float u = vFacade.x;
  float v = vFacade.y;
  float h = vFacade.z;
  float lift = vWorld.y - vBldg.z;
  float warmth = vBldg.y;
  int feat = int(vBldg.w + 0.5);
  vec3 amb = cityAmbient(n, lift, warmth);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 surf = vec3(0.0);
  vec3 emit = vec3(0.0);

  if (roof) {
    // 屋顶：深色混凝土 + 低频斑驳（≤ 0.015，必须暗于亮着的路面）
    float k = vnoise(vWorld.xz * 0.35) * 0.6 + vnoise(vWorld.xz * 0.05) * 0.4;
    surf = vec3(0.085, 0.083, 0.08) * (0.75 + 0.5 * k) * amb;
  } else {
    float fres;
    vec3 refl = glassRefl(n, V, warmth, fres);
    float F = vBldg.x > 0.5 ? vBldg.x : (m == 6 ? 2.9 : (m == 7 ? 3.2 : (m == 8 ? 4.5 : (m == 9 ? 4.2 : 4.0))));
    bool parapet = v > h - 1.1 && h > 4.0;
    float shopTop = 4.6;
    bool shops = (m == 0 || m == 5 || m == 6 || m == 7 || m == 8) && h > 3.5;
    if (m == 1) {
      // 敏感区：素灰石材 + 凹进去的暗窗格，无任何发光；整体比同高度的未亮灯写字楼更暗
      vec3 st = vec3(0.25, 0.25, 0.24) * amb * 0.55;
      float fv = v / 4.0;
      float wu = fwidth(u);
      float wv = fwidth(v);
      float wx = fpulse(u / 2.4, wu / 2.4, 0.5, 0.25);
      float wy = fpulse(fv, wv / 4.0, 0.55, 0.25);
      float rim = fpulse(u / 2.4, wu / 2.4, 0.25, 0.02) * wy;
      surf = mix(st, vec3(0.006) + st * 0.1, wx * wy * step(4.5, v) * step(v, h - 1.5));
      surf *= 1.0 - 0.3 * rim;
    } else if (shops && lift < shopTop) {
      shopfront(u, lift, key, m, shopTop, amb, n, V, surf, emit);
    } else if (m == 8 && !parapet) {
      podiumUpper(u, lift, v, key, feat, amb, refl, fres, tint, surf, emit);
    } else if (m == 10) {
      // 屋顶机房 / 水箱 / 楼梯间：深色，横向百叶；30 % 的住宅楼梯间有一扇暖光小窗
      float wv = fwidth(v);
      float wu = fwidth(u);
      float louv = fpulse(v / 0.6, wv / 0.6, 0.5, 0.15);
      surf = vec3(0.09, 0.088, 0.085) * tint * amb * (1.0 - 0.25 * louv);
      float lw = fpulse(u / 7.0, wu / 7.0, 0.5, 0.06) * fband(v, wv, 1.0, 2.0);
      emit = uHomeW * 0.35 * lw * step(hash3(key, 90, 0), 0.3);
    } else if (parapet) {
      // 女儿墙：素墙 + 顶部压顶线
      vec3 alb = m == 6 || m == 7 ? wallPalette(int(hash3(key, 44, 0) * 6.0), m == 7) * tint : vec3(0.075, 0.075, 0.08) * tint;
      float cap = fband(v, fwidth(v), h - 0.15, h);
      surf = alb * amb * (1.0 + 0.6 * cap);
    } else if (m == 6 || m == 7) {
      residential(u, v, F, key, m == 7, tint, amb, refl, fres, lift, surf, emit);
    } else if (m == 9) {
      // 公共建筑：暖色石材、竖长窗、少量暖光
      float wu = fwidth(u);
      float wv = fwidth(v);
      vec3 st = vec3(0.30, 0.27, 0.22) * tint * amb;
      float fv = v / F;
      float wx = fpulse(u / 3.0, wu / 3.0, 0.5, 0.2);
      float wy = fpulse(fv, wv / F, 0.5, 0.3);
      int fl = int(floor(fv)) + OFS;
      float lit = step(hash3(key, fl * 211 + int(floor(u / 3.0)), 80), 0.22);
      surf = mix(st, vec3(0.01) + refl * fres, wx * wy);
      emit = uHomeW * 0.3 * lit * wx * wy;
    } else {
      // 写字楼（含旧模式 0 / 2 / 3 与地标）
      int fam = m == 3 ? (body == 2 ? 1 : body == 3 ? 2 : 0) : body;
      float M = 1.2 + 0.1 * float(bayLv);
      office(u, v, h, F, M, key, fam, tint, amb, refl, fres, feat, m == 2, n, V, surf, emit);
    }
    // 冠顶泛光：顶部 8–15 m，静态单色，自下而上渐弱
    int crown = feat & 7;
    if (crown > 0 && m != 1) {
      // 泛光灯在冠顶带底部朝上打：底部最亮、向上衰减；立面竖向鳍片 / 竖梃把光切成条纹
      float ch = clamp(h * 0.06, 8.0, 15.0);
      float t = clamp((v - (h - ch)) / ch, 0.0, 1.0);
      float band = fband(v, fwidth(v), h - ch, h);
      float fins = fpulse(u / 1.6, fwidth(u) / 1.6, 0.5, 0.3);
      vec3 cc = uCrown[crown - 1];
      float lum = crown == 1 ? 2.6 : (crown == 2 ? 2.0 : 1.3);
      float fall = (1.0 - 0.75 * t) * (1.0 - 0.75 * t);
      emit = mix(emit, cc * lum * fall * (0.45 + 0.55 * fins), band * 0.8);
    }
  }
  // 墙脚压暗（接地处 −30 %，2 m 内恢复）
  surf *= 0.7 + 0.3 * smoothstep(0.0, 2.0, lift);
  vec3 col = applyHaze(surf, emit, vWorld);
  ${GLSL_FINISH}
}
`;

const v3 = (name: string) => {
  const c = lightColour(name);
  return { value: c };
};

/**
 * 建筑材质（楼群与地标共用一份）。
 * HIGH 档开近处室内映射（ROOM_MAPPING：写字楼开敞办公室、铺内），LOW 档不开（规格 §v）。建材质时读一次画质档。
 */
export function createBuildingMaterial(): ShaderMaterial {
  const uniforms: Record<string, IUniform> = {
    ...sharedUniforms(),
    uOfficeN: v3('officeNeutral'),
    uOfficeC: v3('officeCool'),
    uOfficeW: v3('officeWarm'),
    uHomeW: v3('homeWarm'),
    uHomeC: v3('homeCool'),
    uShop: v3('shopWarm'),
    uTube: v3('tubeCool'),
    uCrown: { value: ['crownWhite', 'crownGold', 'crownCyan', 'crownMagenta'].map((n) => lightColour(n)) },
  };
  const defines: Record<string, number> = {};
  if (getQuality().tier === 'high') defines.ROOM_MAPPING = 1;
  return new ShaderMaterial({ uniforms, vertexShader, fragmentShader, defines });
}

/**
 * 街道设施材质（R2 STREETLIFE）：栏杆、护柱、行人灯、巴士站、垃圾桶、消防栓、皇后像广场水池与喷泉墙、行人天桥玻璃。
 * 遵守写实化光照契约：线性 HDR、cityAmbient（lift = 离地高度）、applyHaze、GLSL_FINISH；双面（单片栏杆两面都看得到）。
 *
 * 顶点属性：position, normal,
 *   aAlb (vec3) 反照率（线性），aEm (vec3) 发光（线性 HDR，EMISSIVE 标尺），
 *   aUv (vec2) 面内坐标（米或 0–1，按 kind），aK (vec3) x = kind，y = 附加参数（相位 / 种子），z = 离地高度（m，lift 用）。
 * kind：
 *   0 普通面；
 *   1 栏杆片：uv = (沿栏杆 m, 离地 m)，片元画立柱、上下横杆、0.12 m 间距竖条，其余透空（屏幕抖动镂空，远处自然变「半透明」）；
 *   2 行人灯面：uv 0–1（上格红色站立人、下格绿色步行人），y = 横过道路的车辆信号相位；状态按 signals.pedSignalState 同一公式；
 *   3 灯箱 / 广告箱：抽象色块（y = 种子），亮度取 aEm；
 *   4 水池水面：uv = 米；暗蓝反光 + 慢速涟漪闪光 + 水下青色射灯；
 *   5 喷泉水幕：uv = (沿墙 m, 离地 m)，向下流动的淡亮水纹；
 *   6 天桥侧面：uv = (沿桥 m, 离桥面 m)。v < 0 桥面封边；y = 2 自动扶梯米白砖矮墙、y = 3 自动扶梯泛黄拱顶（R3）；
 *     玻璃廊（y = 0）：1.5 m 一根窗框、1.0 m 扶手横杆、
 *     室内冷白灯带（0.5–0.8）、顶部光管（1.0–1.4）、3.2 m 以上白色檐口；开敞廊（y = 1）：1.1 m 栏杆（竖条），以上透空；
 *   7 透明玻璃（候车亭背板）：屏幕抖动镂空约一半，看得见后面的人；
 *   8 桥底 / 棚底：浅灰，沿线 2.4 m 一对筒灯（1.0–1.4）；
 *   9 底部投光的雕塑面（喷泉墙）：uv = (沿墙 m, 离池面 m)，aEm 为墙脚亮度，往上按指数衰减，竖向浅槽纹。
 * R3 STATIONS 新增（车站图集 stations/atlas.ts 经 uAtlas 传入）：
 *   10 图集字牌：uv = 图集坐标；反照率 = 图集颜色，发光 = 图集颜色 × aEm.x（灯箱 / 背光牌）；
 *      远于 uTextFar（HIGH 80 m / LOW 40 m）退成 aAlb（整块牌的平均色），不再采样文字；
 *   11 候车亭百叶顶棚：uv = 米；0.18 m 一片横向金属百叶，片间是暗玻璃；
 *   12 电车站岛灯箱广告墙：uv = (沿墙 m, 离底 m)，y = 种子（≥ 10 为檐口灯带）；约 4 m 一幅虚构广告（抽象渐变与大色块，
 *      部分幅面写一个白名单行业字，字形取图集），整幅背光 0.8–1.2；
 *   13 港铁出口梯井（室内贴图）：uv = 出口洞口内坐标（米，宽 3.2 × 高 2.6），按视线在洞口后虚拟一个梯井
 *      （白色小瓷砖侧墙、白色天花与圆筒灯、灰色触觉砖、花岗岩梯级与黄色级咀、红白扶手套），冷白自发光 0.3–0.6；
 *   14 拉丝不锈钢：竖向细纹 + 街灯 / 梯井的模糊反光；
 *   15 方砖墙 / 地面：uv = 米，y = 砖边长（m），砖缝暗；
 *   16 黄色触觉警示砖（地面）：uv = 米，300 mm 砖、6 × 6 圆点；
 *   17 不锈钢柱上的红色环带：uv.y = 米，0.25 m 一圈；
 *   18 实时到站屏（LCD）：深色屏面，几行琥珀色 / 白色「字」块（不写真实内容），0.3–0.6。
 */
import { DoubleSide, ShaderMaterial, Vector4 } from 'three';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_FINISH_ALPHA, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms } from '../materials/lighting';
import { AD_WORDS, stationsAtlas, stationsTier } from '../stations/atlas';
import { PED_FLASH, PED_FLASH_HZ, PED_GREEN, PED_RED, SIGNAL_CYCLE_S } from './signals';

/** 灯箱广告字的格数（uAdRects 长度）。 */
const AD_N = Math.max(AD_WORDS.length, 1);

const glslVec3 = (c: { r: number; g: number; b: number }, k = 1) => `vec3(${(c.r * k).toFixed(4)}, ${(c.g * k).toFixed(4)}, ${(c.b * k).toFixed(4)})`;

const vertexShader = /* glsl */ `
attribute vec3 aAlb;
attribute vec3 aEm;
attribute vec2 aUv;
attribute vec3 aK;
varying vec3 vAlb;
varying vec3 vEm;
varying vec2 vUv;
varying vec3 vK;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vAlb = aAlb;
  vEm = aEm;
  vUv = aUv;
  vK = aK;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
uniform float uWarmth;
uniform sampler2D uAtlas;
uniform vec4 uAdRects[${AD_N}];
uniform float uTextFar;
varying vec3 vAlb;
varying vec3 vEm;
varying vec2 vUv;
varying vec3 vK;
varying vec3 vN;
varying vec3 vWorld;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// 屏幕抖动（确定性：只取决于像素位置）
float dither() {
  return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
}
// 抗锯齿条纹覆盖率：x 在 [0, w) 内为 1（周期 1）
float stripe(float x, float w) {
  float f = fract(x);
  float aa = max(fwidth(x), 1e-4);
  return clamp((w - f) / aa + 0.5, 0.0, 1.0) * clamp(f / aa + 0.5, 0.0, 1.0);
}
float band(float v, float a, float b) {
  float aa = max(fwidth(v), 1e-4);
  return clamp((v - a) / aa + 0.5, 0.0, 1.0) * clamp((b - v) / aa + 0.5, 0.0, 1.0);
}
// 行人灯图形（局部坐标 p，格内 −1…1）：站立人 / 步行人
float standingMan(vec2 p) {
  float head = step(length(p - vec2(0.0, 0.62)), 0.17);
  float body = step(abs(p.x), 0.2) * step(-0.05, p.y) * step(p.y, 0.42);
  float legs = step(abs(abs(p.x) - 0.1), 0.065) * step(-0.72, p.y) * step(p.y, 0.0);
  float arms = step(abs(abs(p.x) - 0.27), 0.05) * step(-0.08, p.y) * step(p.y, 0.4);
  return max(max(head, body), max(legs, arms));
}
float walkingMan(vec2 p) {
  float head = step(length(p - vec2(0.05, 0.62)), 0.17);
  vec2 q = p - vec2(0.0, 0.2);
  float body = step(abs(q.x + q.y * 0.15), 0.15) * step(-0.25, q.y) * step(q.y, 0.25);
  // 两腿叉开
  float l1 = step(abs((p.x - 0.0) - (p.y + 0.05) * 0.55), 0.07) * step(-0.72, p.y) * step(p.y, -0.02);
  float l2 = step(abs((p.x - 0.0) + (p.y + 0.05) * 0.5), 0.07) * step(-0.72, p.y) * step(p.y, -0.02);
  float a1 = step(abs((p.x - 0.05) - (p.y - 0.3) * 0.7), 0.055) * step(0.0, p.y) * step(p.y, 0.4);
  float a2 = step(abs((p.x - 0.05) + (p.y - 0.3) * 0.7), 0.055) * step(0.0, p.y) * step(p.y, 0.4);
  return max(max(head, body), max(max(l1, l2), max(a1, a2)));
}


// ---- R3 STATIONS ----
vec3 adPalette(float h) {
  // 虚构广告的配色（饱和但不刺眼）：深蓝、紫、青、珊瑚、金、墨绿、玫红、天蓝
  vec3 c = 0.5 + 0.5 * cos(6.2831 * (h + vec3(0.0, 0.33, 0.67)));
  return c * c;
}
// 复审修正：灯箱广告的「照片」画面（虚构，不写字）：满幅双色渐变底 + 两三团柔和的光斑 + 一个竖向的主体剪影 + 细颗粒，
// 饱和度封顶 0.6，亮度按像素部分归一（整幅平均约 1，乘上灯箱亮度就是平均亮度），不再是白底上几个平面圆。
// uv：幅面内坐标（米），sz：幅面尺寸（米），seed：每幅一个；cool：偏冷色（巴士站端头灯箱）
vec3 adArt(vec2 uv, vec2 sz, float seed, float cool) {
  vec2 q = uv / sz;
  float h0 = hash12(vec2(seed, 1.7));
  float h1 = hash12(vec2(seed, 5.3));
  float h2 = hash12(vec2(seed, 9.1));
  // 底色一深一浅（照片广告多是深底配亮主体，或浅底配深主体）
  vec3 c1 = adPalette(h0 + cool * 0.45) * (h1 < 0.5 ? 0.35 : 1.0);
  vec3 c2 = adPalette(h0 + 0.18 + 0.25 * h1) * (h1 < 0.5 ? 0.6 : 0.85);
  vec3 c3 = adPalette(h2 + 0.5);
  c1 = mix(c1, vec3(0.35, 0.55, 0.62), cool * 0.5);
  float ang = 6.2831 * h1;
  float t = clamp(0.5 + 0.7 * dot(q - 0.5, vec2(cos(ang), sin(ang))), 0.0, 1.0);
  vec3 col = mix(c1, c2, smoothstep(0.0, 1.0, t));
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 bc = vec2(hash12(vec2(seed, 11.0 + fk)), hash12(vec2(seed, 17.0 + fk)));
    vec2 d = (q - bc) * vec2(sz.x / sz.y, 1.0);
    float r = 0.15 + 0.3 * hash12(vec2(seed, 23.0 + fk));
    col = mix(col, c3 * (0.8 + 0.6 * hash12(vec2(seed, 29.0 + fk))), 0.6 * exp(-dot(d, d) / (r * r)));
  }
  // 主体（人像 / 产品）：竖向椭圆，暗或亮，边缘柔
  vec2 fc = vec2(0.3 + 0.4 * h2, 0.45);
  vec2 fd = (q - fc) * vec2(sz.x / sz.y * 2.2, 1.3);
  float fig = 1.0 - smoothstep(0.32, 0.42, length(fd));
  col = mix(col, (h1 < 0.5 ? col * 0.35 : mix(col, vec3(0.9, 0.82, 0.74), 0.55)) * (0.85 + 0.3 * q.y), fig);
  col *= 0.96 + 0.08 * hash12(floor(uv * 30.0));
  float mx = max(col.r, max(col.g, col.b));
  float mn = min(col.r, min(col.g, col.b));
  float sat = (mx - mn) / max(mx, 1e-4);
  if (sat > 0.6) col = mx - (mx - col) * (0.6 / sat);
  // 画面四周略暗（灯管在中间），亮度只部分归一：保留照片里的明暗对比（不是一片均匀的粉彩）
  col *= 0.7 + 0.3 * smoothstep(0.0, 0.25, min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)));
  float Y = dot(col, vec3(0.2126, 0.7152, 0.0722));
  return col * mix(1.0, 0.4 / max(Y, 0.03), 0.35) / 0.4 * 0.85;
}
// 港铁梯井：洞口坐标 (u, v)（米）、视线 dl（局部：x 沿洞口宽、y 上、z 进洞），返回自发光颜色
vec3 stairwell(vec2 uv, vec3 dl) {
  const float W = 3.2;
  const float H = 2.6;
  const float K = 0.62;
  const float LAND = 0.6;
  const float CEIL0 = 2.2;
  const float D = 9.0;
  vec3 p0 = vec3(uv, 0.0);
  float tBest = 1e4;
  int hit = 0;
  if (dl.x > 1e-4) { float t = (W - p0.x) / dl.x; if (t < tBest) { tBest = t; hit = 1; } }
  if (dl.x < -1e-4) { float t = -p0.x / dl.x; if (t < tBest) { tBest = t; hit = 1; } }
  // 天花：平段 + 与梯级平行的斜段
  if (dl.y > 1e-4) { float t = (H - p0.y) / dl.y; if (t < tBest && p0.z + dl.z * t < CEIL0) { tBest = t; hit = 2; } }
  float den = dl.y + K * dl.z;
  if (den > 1e-4) { float t = (H + CEIL0 * K - p0.y) / den; if (t > 0.0 && t < tBest && p0.z + dl.z * t >= CEIL0) { tBest = t; hit = 2; } }
  // 地面：平台 + 梯级斜面
  if (dl.y < -1e-4) { float t = -p0.y / dl.y; if (t < tBest && p0.z + dl.z * t < LAND) { tBest = t; hit = 3; } }
  if (den < -1e-4) { float t = (K * LAND - p0.y) / den; if (t > 0.0 && t < tBest && p0.z + dl.z * t >= LAND) { tBest = t; hit = 4; } }
  if (dl.z > 1e-4) { float t = (D - p0.z) / dl.z; if (t < tBest) { tBest = t; hit = 5; } }
  vec3 q = p0 + dl * tBest;
  float floorY = q.z < LAND ? 0.0 : -(q.z - LAND) * K;
  float fade = exp(-q.z * 0.07);
  vec3 cool = TUBE;
  vec3 c = vec3(0.0);
  if (hit == 1) {
    // 侧墙：白色小瓷砖（0.1 m）+ 腰下拉丝不锈钢；扶手（红白相间的握把套）在梯面上 0.9 m
    vec2 tg = vec2(q.z, q.y) / 0.1;
    vec2 tf = abs(fract(tg) - 0.5);
    float joint = max(smoothstep(0.38, 0.48, tf.x), smoothstep(0.38, 0.48, tf.y)) * exp(-q.z * 0.25);
    float rel = q.y - floorY;
    vec3 tile = vec3(0.62, 0.62, 0.6) * (1.0 - 0.25 * joint);
    vec3 dado = vec3(0.32, 0.32, 0.31) * (0.85 + 0.15 * fract(q.z * 37.0));
    c = rel < 0.75 ? dado : tile;
    float rail = step(abs(rel - 0.9), 0.035) + step(abs(rel - 0.55), 0.02) * 0.6;
    vec3 grip = mod(floor(q.z / 0.18), 2.0) < 0.5 ? vec3(0.75, 0.06, 0.05) : vec3(0.85);
    c = mix(c, grip, rail);
    c *= 0.55 * fade;
  } else if (hit == 2) {
    // 天花：白色板 + 1.2 m 一盏圆筒灯
    vec2 cp = vec2(q.x - W * 0.5, mod(q.z, 1.2) - 0.6);
    float lamp = 1.0 - smoothstep(0.08, 0.12, length(vec2(abs(cp.x) - 0.8, cp.y)));
    c = vec3(0.5) * 0.7 * fade + vec3(2.5) * lamp * fade;
  } else if (hit == 3) {
    // 平台：洞口后 0.3–0.9 m 灰色触觉砖，其余花岗岩
    float tact = step(0.3, q.z) * step(q.z, 0.9);
    vec2 dp = fract(vec2(q.x, q.z) / 0.05) - 0.5;
    float dome = 1.0 - smoothstep(0.25, 0.35, length(dp));
    c = mix(vec3(0.46, 0.44, 0.41), vec3(0.34, 0.34, 0.33) * (0.9 + 0.2 * dome), tact) * 0.7;
    // 级咀（梯口第一级）黄色防滑条
    c = mix(c, vec3(0.8, 0.6, 0.05), step(LAND - 0.08, q.z));
  } else if (hit == 4) {
    // 梯级（复审修正：一级一级往下退）：0.28 m 一级（每级落 0.17 m），踏面受筒灯照亮、踢面暗，
    // 每级前沿一道亮的不锈钢级咀；第一级级咀黄色；越深越暗
    float s = (q.z - LAND) / 0.28;
    float fs = fract(s);
    float riser = smoothstep(0.62, 0.7, fs);
    float nose = smoothstep(0.0, 0.03, fs) * (1.0 - smoothstep(0.07, 0.11, fs));
    c = mix(vec3(0.5, 0.48, 0.45) * 0.85, vec3(0.12, 0.12, 0.12), riser) * fade;
    c = mix(c, vec3(0.75, 0.76, 0.76) * fade, nose * 0.8);
    c = mix(c, vec3(0.8, 0.6, 0.05) * fade, step(s, 0.12));
  } else {
    // 尽头：亮的通道墙
    c = vec3(0.55, 0.57, 0.58) * 0.9 * fade;
  }
  return c * cool * 0.7;
}

void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float glassAlpha = 1.0;
  float kind = vK.x;
  vec3 alb = vAlb;
  vec3 em = vEm;
  float lift = vK.z;
  if (kind > 0.5 && kind < 1.5) {
    // 栏杆：立柱（片首 6 cm）、上横杆、下横杆、竖条
    float u = vUv.x;
    float v = vUv.y;
    float post = band(u, -0.01, 0.06);
    float rails = max(band(v, 0.96, 1.05), band(v, 0.1, 0.17));
    float bars = stripe(u / 0.12, 0.22) * band(v, 0.1, 1.0);
    float cover = max(max(post, rails), bars);
    if (cover < 0.02 || cover < dither()) discard;
    // 上横杆顶面一条亮边
    alb *= 1.0 + 0.6 * band(v, 1.02, 1.05);
  } else if (kind > 1.5 && kind < 2.5) {
    // 行人灯：上格红色站立人、下格绿色步行人
    float c = fract(uTime / ${SIGNAL_CYCLE_S.toFixed(1)} + vK.y);
    float green = step(${PED_GREEN}, c) * step(c, ${PED_FLASH});
    float flash = step(${PED_FLASH}, c) * step(c, ${PED_RED}) * step(0.5, fract(uTime * ${PED_FLASH_HZ.toFixed(1)}));
    float red = 1.0 - step(${PED_GREEN}, c) * step(c, ${PED_RED});
    bool top = vUv.y > 0.5;
    vec2 cell = vec2((vUv.x - 0.5) * 2.0, ((top ? vUv.y - 0.75 : vUv.y - 0.25) * 4.0)) * 1.15;
    float glyph = top ? standingMan(cell) : walkingMan(cell);
    float frame = step(abs(cell.x), 0.95) * step(abs(cell.y), 0.95);
    alb = vec3(0.01);
    float on = top ? red : max(green, flash);
    vec3 lit = top ? RED_MAN : GREEN_MAN;
    em = lit * glyph * frame * (0.012 + on * 2.5);
  } else if (kind > 2.5 && kind < 3.5) {
    // 灯箱：满幅「照片」式虚构广告画面（不写字、无标志；复审修正：原来是一块饱和的平色板）。
    // 亮度：整幅平均约 aEm 的亮度 × 0.3（巴士站端头灯箱约 Y 0.4，比立面亮 3–10 倍、但不过曝）
    float s = vK.y;
    float lumE = dot(em, vec3(0.2126, 0.7152, 0.0722));
    em = adArt(vUv * vec2(1.25, 1.85), vec2(1.25, 1.85), s * 37.0, 1.0) * lumE * 0.3;
  } else if (kind > 3.5 && kind < 4.5) {
    // 水面：暗蓝 + 涟漪闪光（反射上方暖色灯笼）+ 水下青色射灯
    vec2 p = vUv;
    float t = uTime;
    float rip = sin(p.x * 3.1 + t * 1.3) * sin(p.y * 2.7 - t * 1.1) + 0.6 * sin((p.x + p.y) * 5.3 + t * 2.1);
    float glint = pow(clamp(rip * 0.5 + 0.2, 0.0, 1.0), 10.0);
    // R2 修复轮：深海军蓝池水（照片 18，约 #20294d），每 5 m 一格里约四成有一盏水下青色射灯（半径约 1 m），
    // 不再是整池亮青色的泳池
    vec2 cell = floor(p / 5.0);
    vec2 cp = p - (cell + 0.5) * 5.0;
    float spot = step(0.58, hash12(cell + 3.3)) * exp(-dot(cp, cp) / 0.7);
    alb = vec3(0.006, 0.009, 0.03);
    float sheen = 0.75 + 0.25 * sin(p.x * 1.3 + p.y * 0.7 + t * 0.6);
    em = vec3(0.012, 0.019, 0.062) + uHazeColor * 0.16 * sheen + vec3(0.1, 0.45, 0.55) * spot * (0.45 + 0.15 * rip) + vec3(0.9, 0.6, 0.3) * glint * 0.35;
  } else if (kind > 4.5 && kind < 5.5) {
    // 喷泉水幕：向下流动的亮纹
    float flow = fract(vUv.y * 1.7 + uTime * 0.9 + hash12(vec2(floor(vUv.x * 6.0), 1.0)));
    float streak = smoothstep(0.0, 0.3, flow) * (1.0 - smoothstep(0.5, 1.0, flow));
    em = vEm * (0.4 + 0.6 * streak);
    if (streak < 0.12 && dither() > 0.6) discard;
  } else if (kind > 6.5 && kind < 7.5) {
    // 候车亭玻璃（R2 修复轮）：在单独的半透明网格里画（GLASS_PASS）——淡青灰、中腰一条磨砂带、每 1.3 m 一根细竖框；
    // 不透明网格里不画（不再用屏幕抖动，近看不像铁丝网）
#ifndef GLASS_PASS
    discard;
#endif
    float u = vUv.x;
    float v = vUv.y;
    float frost = band(v, 0.95, 1.45);
    float mull = stripe(u / 1.3 + 0.5, 0.025);
    glassAlpha = 0.16 + 0.4 * frost + 0.75 * mull;
    alb = mix(vec3(0.05, 0.06, 0.065), vec3(0.4, 0.42, 0.43), max(frost, mull));
    em = TUBE * (0.025 + 0.05 * frost) * (0.6 + 0.4 * smoothstep(0.5, 2.3, v));
  } else if (kind > 5.5 && kind < 6.5) {
    float u = vUv.x;
    float v = vUv.y;
    if (vK.y > 2.5) {
      // 中环至半山自动扶梯的拱形顶棚（R3 S-F3，照片 18）：泛黄聚碳酸酯透光板（屋脊灯管照亮 0.4–0.8）+ 1.75 m 一道奶白钢拱肋
      float rib = stripe(u / 1.75, 0.07);
      float ridge = exp(-pow((v - 3.25) / 0.12, 2.0));
      alb = mix(vec3(0.45, 0.33, 0.16), vec3(0.62, 0.6, 0.52), rib);
      em = mix(AMBER * (0.45 + 0.9 * ridge), TUBE * 0.12, rib);
    } else if (v < 0.0) {
      // 桥面封边（浅灰）
      alb = vec3(0.3, 0.3, 0.29);
      em = vec3(0.0);
    } else if (v > 3.2) {
      // 白色檐口（被桥上灯光微微照亮）
      alb = vec3(0.62, 0.62, 0.6);
      em = TUBE * 0.12;
    } else if (vK.y > 1.5) {
      // 自动扶梯两侧矮墙：米白釉面砖（200 × 50 mm 对缝）、顶上不锈钢扶手；以上透空
      if (v > 1.1) discard;
      vec2 tg = vec2(u / 0.2, v / 0.05);
      vec2 tf = abs(fract(tg) - 0.5);
      vec2 taa = max(fwidth(tg), vec2(1e-4));
      float joint = max(smoothstep(0.44 - taa.x, 0.5, tf.x), smoothstep(0.42 - taa.y, 0.5, tf.y)) * (1.0 - smoothstep(0.1, 0.35, taa.y));
      alb = vec3(0.5, 0.47, 0.4) * (1.0 - 0.3 * joint);
      alb = mix(alb, vec3(0.55, 0.56, 0.57), band(v, 1.02, 1.1));
      em = AMBER * 0.04;
    } else if (vK.y > 0.5) {
      // 开敞廊：栏杆（扶手、立柱、竖条），以上透空
      float rails = max(band(v, 1.02, 1.1), band(v, 0.0, 0.08));
      float bars = stripe(u / 0.13, 0.2) * band(v, 0.0, 1.1);
      float posts = stripe(u / 2.0, 0.04);
      float cover = max(max(rails, bars), posts);
      if (v > 1.1 || cover < 0.02 || cover < dither()) discard;
      alb = vec3(0.32, 0.33, 0.34);
      em = vec3(0.0);
    } else {
      // 玻璃廊：窗框 + 扶手横杆 + 室内灯带（上亮下暗），顶部光管
      float mull = stripe(u / 1.5, 0.05);
      float rail = band(v, 0.98, 1.06);
      float tube = band(v, 2.8, 2.98);
      float floorBand = 1.0 - smoothstep(0.05, 0.35, v);
      // 室内：天花下亮、腰下暗，沿线有人影般的明暗起伏
      float people = 0.75 + 0.25 * sin(u * 2.3 + sin(u * 0.71) * 3.0);
      em = TUBE * (0.18 + 0.4 * smoothstep(0.6, 2.7, v)) * (1.0 - 0.8 * floorBand) * mix(1.0, people, band(v, 0.3, 1.8)) + TUBE * tube * 1.2;
      em *= (1.0 - mull) * (1.0 - 0.85 * rail);
      alb = mix(vec3(0.015, 0.017, 0.02), vec3(0.55, 0.56, 0.57), max(mull, rail));
    }
  } else if (kind > 8.5 && kind < 9.5) {
    // 喷泉墙（R2 修复轮）：抽象浮雕色块（深底上红、绿、金几块；不写字、无图案标志），块间暗缝；
    // 墙脚暖色投光往上衰减（彩色块反光多一些）；墙顶一道水帘亮线
    float u = vUv.x;
    float v = vUv.y;
    // 每片墙 4–5 块不规则的彩色浮雕（位置、大小按片哈希），其余是深色底
    float pid = floor(u / 2.47);
    float lu = u - pid * 2.47;
    vec3 relief = vec3(0.035, 0.03, 0.028);
    float lit = 0.35;
    for (int k = 0; k < 5; k++) {
      float fk = float(k);
      vec2 c = vec2(0.25 + 1.6 * hash12(vec2(pid, fk * 3.1)), 0.3 + (vK.y - 0.6) * hash12(vec2(pid + 7.7, fk * 5.3)));
      vec2 hs = vec2(0.18 + 0.3 * hash12(vec2(pid, fk + 11.0)), 0.12 + 0.25 * hash12(vec2(pid, fk + 21.0)));
      vec2 d = abs(vec2(lu, v) - c) - hs;
      float inside = 1.0 - smoothstep(-0.015, 0.015, max(d.x, d.y));
      float hc = hash12(vec2(pid * 1.3 + fk, 41.0));
      vec3 pc = hc < 0.3 ? vec3(0.34, 0.05, 0.04) : (hc < 0.55 ? vec3(0.06, 0.2, 0.1) : (hc < 0.8 ? vec3(0.38, 0.27, 0.07) : vec3(0.05, 0.16, 0.2)));
      relief = mix(relief, pc, inside);
      lit = mix(lit, 1.1, inside);
    }
    alb = relief;
    em = vEm * exp(-max(v, 0.0) * 2.4) * lit;
    em += vec3(0.22, 0.32, 0.4) * band(v, vK.y - 0.06, vK.y + 0.02);
  } else if (kind > 9.5 && kind < 10.5) {
    // 图集字牌：近处取图集颜色，远处退成整块平均色（aAlb）
    float dist = length(cameraPosition - vWorld);
    float farK = smoothstep(uTextFar * 0.75, uTextFar, dist);
    vec3 tex = texture2D(uAtlas, vUv).rgb;
    vec3 base = mix(tex, vAlb, farK);
    alb = base * 0.85;
    // 背光牌：近黑的底色不发光（与周围黑色牌框一致，不露出一块灰色矩形）
    em = base * vEm.x * smoothstep(0.004, 0.03, max(base.r, max(base.g, base.b)));
  } else if (kind > 10.5 && kind < 11.5) {
    // 百叶顶棚：横向金属片（0.18 m 一片、宽 0.09 m）+ 片间暗玻璃
    float slat = stripe(vUv.x / 0.18, 0.5);
    alb = mix(vec3(0.03, 0.035, 0.04), vAlb, slat);
    em = vEm * slat;
  } else if (kind > 11.5 && kind < 12.5) {
    // 电车站岛灯箱广告墙（虚构广告）
    float fascia = step(9.5, vK.y);
    float seed = fract(vK.y);
    float panelW = fascia > 0.5 ? 6.0 : 4.0;
    float pid = floor(vUv.x / panelW);
    float lu = vUv.x - pid * panelW;
    float H = fascia > 0.5 ? 0.6 : 1.5;
    float lv = vUv.y / H;
    float h0 = hash12(vec2(pid, seed * 97.0));
    float h1 = hash12(vec2(pid, seed * 31.0 + 4.0));
    float h2 = hash12(vec2(pid, seed * 17.0 + 9.0));
    // 底色：约三成浅底（暖白），其余深色底（藏青、紫、酒红、墨绿、深青）；主体是一个大圆 / 圆角块（抽象「产品图」）
    // 复审修正（照片 13）：满幅「照片」式画面（adArt：渐变底、光斑、主体剪影），不再是白底上的平面圆
    bool light = false;
    vec3 col = adArt(vec2(lu, vUv.y), vec2(panelW, H), pid * 7.13 + seed * 91.0 + h0, 0.0);
    // 标题与小字：左边两三道横条（不可读的「字」）
    float bars = band(vUv.y, H * 0.72, H * 0.8) * step(lu, panelW * (0.3 + 0.15 * h1)) + band(vUv.y, H * 0.6, H * 0.64) * step(lu, panelW * (0.25 + 0.1 * h2)) + band(vUv.y, H * 0.12, H * 0.16) * step(lu, panelW * 0.42);
    float hasWord = step(hash12(vec2(pid, 21.0 + seed)), 0.55);
    bars *= step(0.25, lu) * (1.0 - hasWord);
    col = mix(col, light ? vec3(0.08, 0.08, 0.1) : vec3(0.95), clamp(bars, 0.0, 1.0) * 0.9);
    // 一半的幅面写一个行业字（白字，图集）
    float wi = floor(hash12(vec2(pid, 12.1 + seed * 13.0)) * ${AD_N}.0);
    vec4 r = uAdRects[0];
    for (int k = 0; k < ${AD_N}; k++) if (float(k) == wi) r = uAdRects[k];
    float ww = fascia > 0.5 ? 1.2 : 1.6;
    vec2 wuv = vec2((lu - 0.3) / ww, (vUv.y - H * (fascia > 0.5 ? 0.1 : 0.55)) / (ww * 0.5));
    float win = step(0.0, wuv.x) * step(wuv.x, 1.0) * step(0.0, wuv.y) * step(wuv.y, 1.0) * hasWord;
    float word = texture2D(uAtlas, mix(r.xy, r.zw, clamp(wuv, 0.0, 1.0))).r * win;
    col = mix(col, vec3(1.0), smoothstep(0.3, 0.7, word));
    // 幅间 8 cm 暗框
    float frame = 1.0 - band(lu, 0.04, panelW - 0.04) * band(vUv.y, 0.03, H - 0.03);
    // 亮度：整幅平均 Y 约 0.4（照片 13：灯箱约是后面立面的 3–10 倍，从不过曝成白）
    alb = col * 0.3;
    em = col * 0.45 * (vEm.x / 1.9) * (1.0 - frame);
  } else if (kind > 12.5 && kind < 13.5) {
    // 港铁出口梯井（室内贴图）：洞口局部轴 R = cross(n, up)，进洞 = −n
    vec3 R = normalize(vec3(-n.z, 0.0, n.x));
    vec3 d = normalize(vWorld - cameraPosition);
    vec3 dl = vec3(dot(d, R), d.y, dot(d, -n));
    alb = vec3(0.0);
    em = dl.z > 0.0 ? stairwell(vUv, dl) : vec3(0.0);
  } else if (kind > 13.5 && kind < 14.5) {
    // 拉丝不锈钢：竖向细纹 + 很淡的环境反光（掠射角更亮）+ 路灯在板面上拉出的竖向亮纹；1.25 m 一道板缝（复审修正）
    float brush = hash12(vec2(floor(vUv.x * 160.0), 0.0)) * (1.0 - smoothstep(0.004, 0.02, fwidth(vUv.x)));
    float streak = smoothstep(0.55, 1.0, hash12(vec2(floor(vUv.x * 6.0), 3.0))) * (0.6 + 0.4 * sin(vUv.y * 0.9 + vUv.x));
    vec3 V0 = normalize(cameraPosition - vWorld);
    float gr = pow(1.0 - abs(dot(n, V0)), 2.0);
    float jx = fract(vUv.x / 1.25);
    float jaw = fwidth(vUv.x / 1.25) + 1e-4;
    float seam = (1.0 - smoothstep(0.006, 0.006 + jaw, min(jx, 1.0 - jx))) * (1.0 - smoothstep(0.05, 0.2, jaw));
    alb = vAlb * (0.85 + 0.3 * brush) * (1.0 - 0.6 * seam);
    em = vEm + TUBE * (0.03 + 0.07 * gr + 0.09 * streak) * (0.7 + 0.6 * brush) * (1.0 - seam);
  } else if (kind > 14.5 && kind < 15.5) {
    // 方砖：y = 砖边长（m）
    float sz = max(vK.y, 0.02);
    vec2 g = vUv / sz;
    vec2 f = abs(fract(g) - 0.5);
    vec2 aa = max(fwidth(g), vec2(1e-4));
    float joint = max(smoothstep(0.44 - aa.x, 0.48 + aa.x, f.x), smoothstep(0.44 - aa.y, 0.48 + aa.y, f.y)) * (1.0 - smoothstep(0.15, 0.4, max(aa.x, aa.y)));
    alb = vAlb * (0.92 + 0.16 * hash12(floor(g))) * (1.0 - 0.35 * joint);
  } else if (kind > 15.5 && kind < 16.5) {
    // 黄色触觉警示砖
    vec2 g = vUv / 0.3;
    vec2 f = abs(fract(g) - 0.5);
    vec2 aa = max(fwidth(g), vec2(1e-4));
    float joint = max(smoothstep(0.46 - aa.x, 0.5, f.x), smoothstep(0.46 - aa.y, 0.5, f.y)) * (1.0 - smoothstep(0.1, 0.3, max(aa.x, aa.y)));
    vec2 dp = fract(g * 6.0) - 0.5;
    float dome = (1.0 - smoothstep(0.24, 0.32, length(dp))) * (1.0 - smoothstep(0.08, 0.25, max(aa.x, aa.y) * 6.0));
    alb = vAlb * (0.92 + 0.16 * hash12(floor(g))) * (1.0 - 0.3 * joint) * (1.0 + 0.25 * dome);
  } else if (kind > 16.5 && kind < 17.5) {
    // 不锈钢柱的红色细环（复审修正：1.3–2.3 m 之间每 0.3 m 一道 4.5 cm 的细环，其余是拉丝不锈钢）
    float red = stripe(vUv.y / 0.3, 0.15) * step(1.3, vUv.y) * step(vUv.y, 2.3);
    alb = mix(vAlb, vec3(0.5, 0.02, 0.03), red);
    em = vEm * (1.0 - red);
  } else if (kind > 17.5 && kind < 18.5) {
    // 实时到站屏：4 行「字」块（琥珀 / 白），不写真实内容
    float row = floor(vUv.y * 4.0);
    float fy = fract(vUv.y * 4.0);
    float cell = floor(vUv.x * 18.0);
    float on = step(0.18, fy) * step(fy, 0.78) * step(hash12(vec2(cell, row + 3.0)), 0.7) * step(cell, 6.0 + 10.0 * hash12(vec2(row, 7.0)));
    vec3 ink = row > 2.5 ? vec3(0.9, 0.9, 0.85) : vec3(1.0, 0.55, 0.08);
    alb = vec3(0.01);
    em = ink * on * 0.5 + vec3(0.004, 0.006, 0.01);
  } else if (kind > 7.5 && kind < 8.5) {
    // 桥底 / 棚底：两排筒灯
    vec2 c = vec2(fract(vUv.x / 2.4) - 0.5, abs(vUv.y) - 0.9);
    float spot = 1.0 - smoothstep(0.08, 0.16, length(c * vec2(2.4, 1.0)));
    em = TUBE * 1.3 * spot;
  }
  // 复审修正：站台、港铁出口等真实材质面按「相机白平衡」照（neutralLight），不锈钢不再照成褐色
  vec3 surface = alb * neutralLight(cityAmbient(n, lift, uWarmth), 0.5);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(abs(dot(n, V)), 0.0, 1.0), 4.0);
  surface += uHazeColor * fres * 0.25 * max(n.y, 0.2);
  vec3 col = applyHaze(surface, em, vWorld);
#ifdef GLASS_PASS
  float alpha = clamp(glassAlpha + 0.5 * fres, 0.0, 1.0);
  ${GLSL_FINISH_ALPHA}
#else
  ${GLSL_FINISH}
#endif
}
`;

/** 字牌只在这个距离（m）内写字（规格：HIGH 80 m、LOW 40 m），更远退成色块。 */
export const TEXT_FAR_M = { high: 80, low: 40 } as const;

export function createLifeMaterial(warmth = 0.4, glassPass = false): ShaderMaterial {
  const atlas = stationsAtlas(); // [r3:stations] 车站图集（字牌、灯箱广告字）
  const adRects = AD_WORDS.map((_, i) => {
    const r = atlas.rect(`ad-${i}`);
    return r ? new Vector4(r.u0, r.v0, r.u1, r.v1) : new Vector4(0, 0, 0, 0);
  });
  if (adRects.length === 0) adRects.push(new Vector4(0, 0, 0, 0));
  return new ShaderMaterial({
    uniforms: {
      ...sharedUniforms(),
      uWarmth: { value: warmth },
      uAtlas: { value: atlas.texture },
      uAdRects: { value: adRects },
      uTextFar: { value: TEXT_FAR_M[stationsTier()] },
    },
    defines: {
      RED_MAN: glslVec3(lightColour('#ff3a24')),
      GREEN_MAN: glslVec3(lightColour('#3dffb0')),
      TUBE: glslVec3(lightColour('tubeCool')),
      AMBER: glslVec3(lightColour('#f4c980')),
      ...(glassPass ? { GLASS_PASS: '' } : {}),
    },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    transparent: glassPass,
    depthWrite: !glassPass,
  });
}

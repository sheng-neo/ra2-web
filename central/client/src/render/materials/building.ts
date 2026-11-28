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
 *
 * R3 真实贴面（PHOTO，city.meta.facades 存在时）：aPhoto = (s, t, 页号, 楼层线相位)，见 facade.ts、facades/layout.ts。
 * - 取样：远景图集（每页一格）总在；页在近景池里（NEAR_PHOTO，HIGH 档）时按淡入权重换成近景页（facades/streamer.ts）。
 *   RGBA：alpha 码 0 = 无照片、135–255 = 连续玻璃度（255 − 120 g）、24 + k = 照片里认出的独立窗（亮灯种子 k = 0..89）。
 * - 夜景（photoFacade）：照片是去过日照的白天反照率。实墙 = 反照率 ×（城市环境照度 + 中环峡谷光）；
 *   玻璃 = 很暗的有色玻璃（远景格的色相）+ 夜空 / 街面的菲涅尔反射（不留白天的天空蓝、倒影与眩光）。
 * - 窗灯：楼层用照片检测到的层高与相位（v 减相位后再分层），亮灯仍是原来的租户 / 住户逻辑；光只落在照片的玻璃上，
 *   独立窗整扇按自己的种子亮或灭。程序立面只在照片区边缘交叉淡化。
 * - 屋顶：照片反照率按夜景压暗；铺面区（离街 0–4.6 m）与敏感区一律程序立面。
 *
 * R4 电车走廊高清街面层（HIRES，HIGH 档、meta.hires 存在时）：aHires = (s, t, 高清页号, 密度 d)，见 facades/hires-layout.ts。
 * - 取样（hiresSample）：高清页在近景池里（uHiresSlots）时盖过 R3（按淡入权重）；颜色 + alpha 码与 R3 同义（独立窗近处按 4 个纹素解码），
 *   辅助图（uHiresAux，半分辨率）R = 墙面后退深度、G = 店面开口、B = 招牌、A = 店铺种子。
 * - 视差（HIRES_POM）：复审修正后默认关（摄影测量的后退深度太噪，墙面「熔化」），#pom=1 才开：只在街面带、30 m 内、掠射角淡出、深度封顶 0.4 m。
 * - 夜景（hiresNight，复审修正）：店面开口（烘焙按铺位认出的矩形）= 照片本身当铺内（按「照片 / 1.3 m 模糊照片」保留货品与招牌的明暗、
 *   色相六成；离地 2.2 m 以下用模糊、去饱和的照片，拍进去的行人与车糊掉），Y 约 0.30–0.50、色温约 40 % 冷 / 30 % 中性 / 30 % 暖，
 *   亮铺比例按路段与钟点（shopLitTarget：上环 0.65、中环西 0.45、中环东 0.30、金钟道 0.6）；室内映射只作两成的淡层，不画程序竖梃；
 *   招牌（优先于店面）按照片自己的颜色发光；上层：烘焙切好的一扇扇真窗按窗的种子亮灯（不叠程序竖梃与楼层剖面），零碎玻璃是暗玻璃（alpha 码 114–134）。
 *   没有高清照片的街面（页没到、照片的洞、质量闸剔除的铺位）画程序铺面，高清页淡入时按权重交叉淡化。
 *   有高清照片的铺面不再画程序铺面与程序招牌。
 */
import { ShaderMaterial, type IUniform } from 'three';
import { GLSL_HASH } from './common';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, getQuality, lightColour, readParam, sharedUniforms } from './lighting';
import { GLSL_WINDOWS } from '../windows';

const vertexShader = /* glsl */ `
attribute vec4 aFacade;
attribute vec4 aBldg;
attribute vec4 aPhoto;
attribute vec4 aHires;
varying vec3 vFacade;
varying vec2 vPhotoUV;
flat varying float vPhotoPage;
flat varying float vPhase;
varying vec2 vHiUV;
flat varying float vHiPage;
flat varying float vHiD;
// 风格码与逐栋参数恒定：flat 避免插值误差把 hash 输入搅成噪点
flat varying float vStyle;
flat varying vec4 vBldg;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vFacade = aFacade.xyz;
  vStyle = aFacade.w;
  vBldg = aBldg;
  vPhotoUV = aPhoto.xy;
  vPhotoPage = aPhoto.z;
  vPhase = aPhoto.w;
  vHiUV = aHires.xy;
  vHiPage = aHires.z;
  vHiD = aHires.w;
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
varying vec2 vPhotoUV;
flat varying float vPhotoPage;
flat varying float vPhase;
varying vec2 vHiUV;
flat varying float vHiPage;
flat varying float vHiD;

#ifdef PHOTO
// 远景图集与近景页都是 RGBA：颜色 sRGB；alpha 码 0 = 无照片、135–255 = 连续玻璃度（255 − 120 g）、24 + k = 独立窗（种子 k = 0..89）
uniform sampler2D uPhotoFarCol;
// (列数, 行数, 已加载的淡入权重 0–1, 每格像素)
uniform vec4 uPhotoFarGrid;
#ifdef NEAR_PHOTO
uniform highp sampler2DArray uPhotoNearCol;
uniform sampler2D uPhotoSlots;
#endif
#endif
#ifdef HIRES
// R4 高清街面层：辅助图数组、页号 → 槽查表（r = 颜色层、g = 淡入、b = 辅助图层）、(页边长, 辅助图边长, 后退深度满量程, 开关)
uniform highp sampler2DArray uHiresAux;
uniform sampler2D uHiresSlots;
uniform vec4 uHiresInfo;
#endif

// R4 高清街面层取样：valid 0–1（含淡入）、反照率（线性）、玻璃度、发光用玻璃度与独立窗种子（近处 4 纹素解码，同 R3）、
// 辅助图（G 店面、B 招牌）、后退深度（米）、店铺种子（0–255，0 = 不是店面）。视差（HIRES_POM）按后退深度偏移纹理坐标。
void hiresSample(vec3 n, vec3 V, float lift, out float valid, out vec3 alb, out vec3 albM, out vec3 albW, out float glass, out float glassE,
                 out float winK, out vec4 aux, out float relief, out float seed) {
  valid = 0.0;
  alb = vec3(0.0);
  albM = vec3(0.0);
  albW = vec3(0.0);
  glass = 0.0;
  glassE = -1.0;
  winK = -1.0;
  aux = vec4(0.0);
  relief = 0.0;
  seed = 0.0;
#if defined(HIRES) && defined(NEAR_PHOTO)
  vec2 ndx = dFdx(vHiUV);
  vec2 ndy = dFdy(vHiUV);
  if (vHiPage < -0.5 || uHiresInfo.w < 0.5) return;
  vec4 sl = texelFetch(uHiresSlots, ivec2(int(vHiPage + 0.5), 0), 0);
  if (sl.r > 0.999 || sl.g <= 0.0) return;
  float layer = floor(sl.r * 255.0 + 0.5);
  float alayer = floor(sl.b * 255.0 + 0.5);
  float P = uHiresInfo.x;
  vec2 uv = vHiUV;
  float texPx = max(length(ndx), length(ndy)) * P;
#ifdef HIRES_POM
  // 视差遮挡（复审修正：默认关，#pom=1 才开）：只在街面带（离地 6 m 内）、掠射角淡出（视线与墙法线夹角 > 约 65° 不做）、
  // 视差深度封顶 0.4 m；原来满量程 2.5 m、掠射时偏移放大 3 倍，墙面「熔化」、招牌拉成火焰样的流痕
  // 切线 T = 沿墙 s 增大方向、B = 向下（t 增大方向），见 coords.ts（three = (x, z, −y)）
  float dist = length(cameraPosition - vWorld);
  vec3 T = vec3(n.z, 0.0, -n.x);
  vec3 B = vec3(0.0, -1.0, 0.0);
  vec3 vt = vec3(dot(V, T), dot(V, B), dot(V, n));
  float pk = (1.0 - smoothstep(18.0, 30.0, dist)) * (1.0 - smoothstep(0.8, 1.6, texPx)) * step(abs(n.y), 0.3)
           * smoothstep(0.42, 0.7, vt.z) * (1.0 - smoothstep(5.0, 6.0, lift));
  if (pk > 0.001 && vHiD > 0.0) {
    float depthUv = min(uHiresInfo.z, 0.4) * vHiD / P;
    vec2 dir = -vt.xy / max(vt.z, 0.42) * depthUv * pk;
    const int NS = 10;
    float stepD = 1.0 / float(NS);
    float curD = 0.0;
    vec2 cuv = uv;
    float h = textureGrad(uHiresAux, vec3(cuv, alayer), ndx, ndy).r;
    float prevH = h;
    vec2 prevUv = cuv;
    float prevD = 0.0;
    for (int i = 0; i < NS; i++) {
      if (curD >= h) break;
      prevUv = cuv;
      prevH = h;
      prevD = curD;
      cuv += dir * stepD;
      curD += stepD;
      h = textureGrad(uHiresAux, vec3(cuv, alayer), ndx, ndy).r;
    }
    // 最后一步线性细化
    float a = h - curD;
    float b = prevH - prevD;
    float w = clamp(b / max(b - a, 1e-4), 0.0, 1.0);
    uv = mix(prevUv, cuv, w);
  }
#endif
  vec4 c = textureGrad(uPhotoNearCol, vec3(uv, layer), ndx, ndy);
  // 模糊的照片（铺内底色）：约 0.4 m（albM，离地 2.2 m 以下用：拍进去的行人、车糊成一片颜色）与约 1.3 m（albW，铺内亮度的参考）
  float baseLod = log2(max(texPx, 1.0));
  albM = textureLod(uPhotoNearCol, vec3(uv, layer), max(baseLod, log2(max(0.4 * vHiD, 1.0)))).rgb;
  albW = textureLod(uPhotoNearCol, vec3(uv, layer), max(baseLod, log2(max(1.3 * vHiD, 1.0)))).rgb;
  aux = textureGrad(uHiresAux, vec3(uv, alayer), ndx, ndy);
  relief = aux.r * uHiresInfo.z;
  float A = uHiresInfo.y;
  seed = texelFetch(uHiresAux, ivec3(clamp(ivec2(uv * A), ivec2(0), ivec2(int(A) - 1)), int(alayer)), 0).a * 255.0;
  float code = c.a * 255.0;
  float nearValid = -1.0;
  float nearGlass = 0.0;
  if (texPx < 1.6) {
    // 同 R3 近处：双线性足迹里 4 个纹素逐个解码（独立窗整扇一个种子、窗边不插值成半玻璃）
    vec2 tc = uv * P - 0.5;
    ivec2 i0 = ivec2(floor(tc));
    vec2 fr = tc - floor(tc);
    int Ly = int(layer);
    int Pm = int(P) - 1;
    float cs[4];
    cs[0] = texelFetch(uPhotoNearCol, ivec3(clamp(i0, ivec2(0), ivec2(Pm)), Ly), 0).a * 255.0;
    cs[1] = texelFetch(uPhotoNearCol, ivec3(clamp(i0 + ivec2(1, 0), ivec2(0), ivec2(Pm)), Ly), 0).a * 255.0;
    cs[2] = texelFetch(uPhotoNearCol, ivec3(clamp(i0 + ivec2(0, 1), ivec2(0), ivec2(Pm)), Ly), 0).a * 255.0;
    cs[3] = texelFetch(uPhotoNearCol, ivec3(clamp(i0 + ivec2(1, 1), ivec2(0), ivec2(Pm)), Ly), 0).a * 255.0;
    float ws[4];
    ws[0] = (1.0 - fr.x) * (1.0 - fr.y);
    ws[1] = fr.x * (1.0 - fr.y);
    ws[2] = (1.0 - fr.x) * fr.y;
    ws[3] = fr.x * fr.y;
    float bw = 0.0;
    float bk = -1.0;
    float gc = 0.0;
    float vc = 0.0;
    float dk = 0.0;
    for (int i = 0; i < 4; i++) {
      bool isWin = cs[i] > 17.0 && cs[i] < 114.5;
      // 复审修正：114.5–134.5 = 暗玻璃（烘焙切不出窗格的零碎玻璃、街面不是店面的玻璃）：是玻璃，但不亮灯
      bool isDark = cs[i] >= 114.5 && cs[i] < 134.5;
      if (isWin && ws[i] > bw) {
        bw = ws[i];
        bk = floor(cs[i] - 24.0 + 0.5);
      }
      if (cs[i] > 17.0) vc += ws[i];
      if (!isWin && !isDark && cs[i] > 17.0) gc += ws[i] * clamp((255.0 - cs[i]) / 120.0, 0.0, 1.0);
      if (isWin) gc += ws[i];
      // 暗玻璃多半是照片里的暗斑（阴影、污迹、零碎的深色玻璃）：按两成玻璃画（照片的颜色压暗），不画成纯黑的玻璃洞
      if (isDark) gc += 0.2 * ws[i];
      if (isDark) dk += ws[i];
    }
    nearValid = vc;
    nearGlass = gc / max(vc, 1e-4);
    if (bk >= 0.0) {
      float m[4];
      for (int i = 0; i < 4; i++) m[i] = abs(cs[i] - 24.0 - bk) < 0.5 ? 1.0 : 0.0;
      float ax = mix(max(m[0], m[2]), max(m[1], m[3]), fr.x);
      float ay = mix(max(m[0], m[1]), max(m[2], m[3]), fr.y);
      float hw = clamp(0.5 * texPx, 0.03, 0.25);
      float cov = smoothstep(0.5 - hw, 0.5 + hw, ax) * smoothstep(0.5 - hw, 0.5 + hw, ay);
      float frameK = 1.0 - smoothstep(0.15, 0.3, texPx);
      float frame = mix(1.0, 0.3 + 0.7 * smoothstep(0.66, 0.8, ax) * smoothstep(0.66, 0.8, ay), frameK);
      winK = clamp(bk, 0.0, 89.0);
      glassE = cov * frame;
    } else {
      glassE = max(gc - 0.2 * dk, 0.0) / max(vc, 1e-4);
    }
  }
  valid = smoothstep(6.0, 20.0, code) * sl.g;
  glass = code > 114.5 && code < 134.5 ? 0.2 : clamp((255.0 - code) / 120.0, 0.0, 1.0);
  if (nearValid >= 0.0) {
    valid = smoothstep(0.35, 0.65, nearValid) * sl.g;
    glass = nearGlass;
  }
  if (glassE < 0.0) glassE = code > 114.5 && code < 134.5 ? 0.0 : glass;
  alb = c.rgb;
#endif
}

// 照片取样：valid 0–1、反照率（线性，近景页在池里时按淡入权重换成近景）、远景反照率（玻璃色相用，没有白天倒影的细节）、
// 玻璃度（表面用，双线性）、发光用玻璃度与独立窗种子（近处按最近纹素取 alpha 码：窗边不会因插值变成「半玻璃」而亮一圈）、
// 近景权重。导数在分支之前求（分支里用 textureGrad）。
void photoSample(out float valid, out vec3 alb, out vec3 farAlb, out float glass, out float glassE, out float winK, out float nearW) {
  valid = 0.0;
  alb = vec3(0.0);
  farAlb = vec3(0.0);
  glass = 0.0;
  glassE = -1.0;
  winK = -1.0;
  nearW = 0.0;
#ifdef PHOTO
  vec2 uv = clamp(vPhotoUV, 0.0, 1.0);
  float pg = max(vPhotoPage, 0.0);
  vec2 cell = vec2(mod(pg, uPhotoFarGrid.x), floor(pg / uPhotoFarGrid.x));
  // 复审修正：远景格之间没有外延边，格内向里收半个纹素（不取到相邻页的颜色）
  float hpx = 0.5 / max(uPhotoFarGrid.w, 1.0);
  vec2 fuv = (cell + clamp(uv, vec2(hpx), vec2(1.0 - hpx))) / uPhotoFarGrid.xy;
  // 远景格之间没有外延边：导数限在约 4 个纹素以内（mip 不越过相邻页太多）
  float lim = 4.0 / (uPhotoFarGrid.x * max(uPhotoFarGrid.w, 1.0));
  vec2 fdx = dFdx(fuv);
  vec2 fdy = dFdy(fuv);
  fdx *= min(1.0, lim / max(length(fdx), 1e-9));
  fdy *= min(1.0, lim / max(length(fdy), 1e-9));
  vec2 ndx = dFdx(vPhotoUV);
  vec2 ndy = dFdy(vPhotoUV);
  float nearValid = -1.0;
  float nearGlass = 0.0;
  if (vPhotoPage < -0.5 || uPhotoFarGrid.z <= 0.0) {
    glassE = 0.0;
    return;
  }
  vec4 f = textureGrad(uPhotoFarCol, fuv, fdx, fdy);
  farAlb = f.rgb;
  vec3 a = f.rgb;
  float code = f.a * 255.0;
#ifdef NEAR_PHOTO
  vec4 sl = texelFetch(uPhotoSlots, ivec2(int(pg + 0.5), 0), 0);
  if (sl.r < 0.999) {
    float layer = floor(sl.r * 255.0 + 0.5);
    vec4 nv = textureGrad(uPhotoNearCol, vec3(uv, layer), ndx, ndy);
    nearW = sl.g;
    a = mix(a, nv.rgb, nearW);
    float nc = nv.a * 255.0;
    code = mix(code, nc, nearW);
    // 近处（一个纹素 ≥ 约 0.6 像素）：发光按最近纹素的 alpha 码——独立窗整扇用自己的种子，窗边不插值
    float texPx = max(length(ndx), length(ndy)) * 1024.0;
    if (nearW > 0.99 && texPx < 1.6) {
      // 双线性足迹里的 4 个纹素：权重最大的独立窗定种子，同一扇窗的纹素权重和（锐化）就是光的形状——
      // 窗边抗锯齿、不跨到墙上，也不会因插值把窗边当成「半玻璃」按程序格亮一圈
      vec2 tc = uv * 1024.0 - 0.5;
      ivec2 i0 = ivec2(floor(tc));
      vec2 fr = tc - floor(tc);
      int Ly = int(layer);
      float cs[4];
      cs[0] = texelFetch(uPhotoNearCol, ivec3(clamp(i0, ivec2(0), ivec2(1023)), Ly), 0).a * 255.0;
      cs[1] = texelFetch(uPhotoNearCol, ivec3(clamp(i0 + ivec2(1, 0), ivec2(0), ivec2(1023)), Ly), 0).a * 255.0;
      cs[2] = texelFetch(uPhotoNearCol, ivec3(clamp(i0 + ivec2(0, 1), ivec2(0), ivec2(1023)), Ly), 0).a * 255.0;
      cs[3] = texelFetch(uPhotoNearCol, ivec3(clamp(i0 + ivec2(1, 1), ivec2(0), ivec2(1023)), Ly), 0).a * 255.0;
      float ws[4];
      ws[0] = (1.0 - fr.x) * (1.0 - fr.y);
      ws[1] = fr.x * (1.0 - fr.y);
      ws[2] = (1.0 - fr.x) * fr.y;
      ws[3] = fr.x * fr.y;
      float bw = 0.0;
      float bk = -1.0;
      float gc = 0.0;
      float vc = 0.0;
      for (int i = 0; i < 4; i++) {
        bool isWin = cs[i] > 17.0 && cs[i] < 125.0;
        if (isWin && ws[i] > bw) {
          bw = ws[i];
          bk = floor(cs[i] - 24.0 + 0.5);
        }
        if (cs[i] > 17.0) vc += ws[i];
        if (!isWin && cs[i] > 17.0) gc += ws[i] * clamp((255.0 - cs[i]) / 120.0, 0.0, 1.0);
        if (isWin) gc += ws[i];
      }
      // 复审修正：「无照片 0」与「实墙 255」之间双线性插值会落进玻璃码段，照片边上一圈假玻璃暗边；
      // 近处按 4 个纹素逐个解码：有效度、玻璃度（只在有效纹素上平均）分开算
      nearValid = vc;
      nearGlass = gc / max(vc, 1e-4);
      if (bk >= 0.0) {
        // R3 整合：窗形按列 / 行分开插值再相乘（直角窗角，不是双线性等值线的圆角「药丸」），边缘宽约 1 像素；
        // 放大到一个纹素 ≥ 4 像素时，窗边内侧约 6 cm 画一圈暗窗框（近看不再是一块平的光板）
        float m[4];
        for (int i = 0; i < 4; i++) m[i] = abs(cs[i] - 24.0 - bk) < 0.5 ? 1.0 : 0.0;
        float ax = mix(max(m[0], m[2]), max(m[1], m[3]), fr.x);
        float ay = mix(max(m[0], m[1]), max(m[2], m[3]), fr.y);
        float hw = clamp(0.5 * texPx, 0.03, 0.25);
        float cov = smoothstep(0.5 - hw, 0.5 + hw, ax) * smoothstep(0.5 - hw, 0.5 + hw, ay);
        float frameK = 1.0 - smoothstep(0.15, 0.3, texPx);
        float frame = mix(1.0, 0.3 + 0.7 * smoothstep(0.66, 0.8, ax) * smoothstep(0.66, 0.8, ay), frameK);
        winK = clamp(bk, 0.0, 89.0);
        glassE = cov * frame;
      } else {
        glassE = gc / max(vc, 1e-4);
      }
    }
  }
#endif
  // uPhotoFarGrid.z：远景图集到了以后 0–1 淡入（从程序立面过渡）
  valid = smoothstep(6.0, 20.0, code) * uPhotoFarGrid.z;
  glass = clamp((255.0 - code) / 120.0, 0.0, 1.0);
  if (nearValid >= 0.0) {
    valid = smoothstep(0.35, 0.65, nearValid) * uPhotoFarGrid.z;
    glass = nearGlass;
  }
  if (glassE < 0.0) glassE = glass;
  alb = a;
#if defined(PHOTO_DEBUG) && PHOTO_DEBUG > 2
  // 离散色：红 = 实墙（≥ 200）、绿 = 玻璃（125–200）、蓝 = 独立窗码（20–125）、黑 = 无照片
  alb = code >= 200.0 ? vec3(0.8, 0.0, 0.0) : code >= 125.0 ? vec3(0.0, 0.8, 0.0) : code >= 20.0 ? vec3(0.0, 0.0, 0.8) : vec3(0.0);
#endif
#endif
}

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

  // 竖梃节点点阵 LED（静态，约 1.5；原来给程序地标 mirror-block 用）
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
// R4 铺面亮灯率（复审修正：按路段，见 route-facts §2；与 facades/frontage.ts 的 shopLitTarget 一致）：
// 20:00 上环 / 西环 0.65、中环西（x 0–320）0.45、中环东（x 320–690）0.30、金钟道商场 0.6；19:00 前多一点，20:30 起渐渐收铺，
// 23:00 约收一半，24:30 剩约两成。x = 模拟坐标（米，向东）。
float shopLitBase(float x) {
  float t = mix(0.65, 0.45, smoothstep(0.0, 60.0, x));
  t = mix(t, 0.30, smoothstep(290.0, 350.0, x));
  return mix(t, 0.6, smoothstep(660.0, 720.0, x));
}
float shopLitTarget(float h, float x) {
  float t = h < 12.0 ? h + 24.0 : h;
  return shopLitBase(x) * mix(1.0, 0.2, smoothstep(20.5, 24.5, t)) + 0.08 * (1.0 - smoothstep(18.5, 20.0, t));
}

void shopfront(float u, float lift, int key, int typ, int feat, float shopTop, vec3 amb, vec3 normalW, vec3 viewW, out vec3 surf, out vec3 emit) {
  float wu = fwidth(u);
  float wl = fwidth(lift);
  if ((feat & 256) != 0) {
    // 复审修正：名店裙楼（毕打街口）——连续的亮玻璃墙（Y ≈ 0.58、约 6000 K），1.5 m 细竖梃、顶上一条天花灯带，没有闸、没有招牌
    float mU = fpulse(u / 1.5 + 0.5, wu / 1.5, 0.5, 0.025 / 1.5);
    float g = fband(lift, wl, 0.15, shopTop - 0.35);
    float top = fband(lift, wl, shopTop - 0.75, shopTop - 0.55);
    // 每 6 m 一间名店（冷白 / 暖白各半，亮度 0.5–1.2 倍），每 1.5 m 一格橱窗：约四成格里是深色的陈列背板，
    // 每 0.8 m 约三成五有人台 / 陈列架的暗剪影（0.6–1.9 m），下面 0.6 m 是展台（暗）
    float shopH = hash12(vec2(floor(u / 6.0), float(key)));
    vec3 lc = hash12(vec2(floor(u / 6.0), float(key) + 1.0)) < 0.5 ? mix(uOfficeC, uOfficeN, 0.35) : uShop;
    lc /= max(dot(lc, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    float var = 0.5 + 0.7 * shopH;
    float pane = hash12(vec2(floor(u / 1.5), float(key) + 3.3));
    float back = pane < 0.4 ? 0.4 + 0.3 * pane : 1.0;
    float sx = u / 0.8;
    float sil = step(hash12(vec2(floor(sx), float(key) + 7.7)), 0.35) * (1.0 - smoothstep(0.14, 0.2, abs(fract(sx) - 0.5)))
              * smoothstep(0.55, 0.65, lift) * (1.0 - smoothstep(1.8, 1.95, lift));
    float plinth = mix(0.3, 1.0, smoothstep(0.5, 0.7, lift));
    surf = vec3(0.05, 0.048, 0.045) * amb * (1.0 - g) + vec3(0.02) * amb * g;
    emit = lc * (0.3 * var * back * plinth * (1.0 - 0.65 * sil) * (0.8 + 0.3 * smoothstep(0.7, 3.5, lift)) + 0.7 * top) * g * (1.0 - 0.8 * mU);
    return;
  }
  float unitW = 4.5 + 3.5 * hash3(key, 52, 0);
  float uu = u / unitW;
  int unit = int(floor(uu)) + OFS;
  float r = hash3(key, unit, 53);
  // 类型：0 商铺、1 大堂、2 落闸、3 熄灯铺。复审修正：亮着的比例按路段与钟点（shopLitTarget，与高清层同一条），其余六成落闸、四成熄灯
  float litT = shopLitTarget(uClock, vWorld.x);
  float r2 = hash3(key, unit, 57);
  int kind = typ == 5 && r < 0.25 ? 1 : (r2 < litT ? 0 : (r < 0.6 ? 2 : 3));
  float pier = fpulse(uu + 0.5, wu / unitW, 0.5, 0.25 / unitW);
  float glazeTop = kind == 1 ? shopTop - 0.5 : min(3.3, shopTop - 1.0);
  float glaze = fband(lift, wl, 0.25, glazeTop) * (1.0 - pier);
  // 门框 / 竖框（整合时加粗到 6 cm）+ 2.5 m 处一道横框
  float mull = max(fpulse(u / 1.3, wu / 1.3, 0.5, 0.06 / 1.3), fband(lift, wl, 2.46, 2.54));
  // 复审修正：铺内亮度 Y 约 0.22–0.45（原来 0.35–1.0，整排白得发亮的「玻璃盒」），约三成再暗三成
  float B = 0.22 + 0.23 * hash3(key, unit, 54);
  if (hash3(key, unit, 61) < 0.3) B *= 0.7;
  // 室内：天花一条最亮（灯槽 / 筒灯），中部货架与陈列，下部较暗；近处有货架、人台的暗剪影
  float detS = 1.0 - smoothstep(0.05, 0.3, wu);
  float col7 = floor(u / 0.7);
  float shelf = mix(0.75, hash12(vec2(col7, float(unit))) < 0.45 ? 0.35 : 1.0, detS * (1.0 - smoothstep(2.2, 2.6, lift)));
  float grad = (0.4 + 0.5 * smoothstep(0.3, 2.4, lift)) * shelf + 0.9 * fband(lift, wl, glazeTop - 0.45, glazeTop - 0.1);
  // 色温约 40 % 冷 / 30 % 中性 / 30 % 暖（route-facts §2）
  float tintH = hash3(key, unit, 56);
  vec3 shopC = tintH < 0.4 ? mix(uOfficeC, uTube, 0.5) : (tintH < 0.7 ? uOfficeN : uShop);
  shopC /= max(dot(shopC, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
  // 货品（整合时加）：0.4–2.3 m 之间按 0.7 m 一列的低饱和色块，各列明暗不同；远处退成平均（均值 ≈ 1，不改总亮度）
  float fu = float(unit);
  vec3 merch = 0.55 + 0.9 * vec3(hash12(vec2(col7, 3.1 + fu)), hash12(vec2(col7, 5.7 + fu)), hash12(vec2(col7, 8.3 + fu)));
  merch = mix(vec3(1.0), merch, 0.25 * detS * fband(lift, wl, 0.4, 2.3));
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
    // R2 修复轮：货品块加大（0.7–1.1 m 宽、一层 0.45 m 高），三四层货架之间暗缝更宽，颜色淡一些——近看是货架，不是彩色纸屑
    vec2 pc = vec2(rr.x / (0.7 + 0.4 * sh), rr.y / 0.6);
    vec2 pid = floor(pc);
    float ph = hash12(pid + vec2(float(unit) * 1.3, 7.1));
    vec3 prod = ph < 0.2 ? vec3(1.0, 0.35, 0.3) : ph < 0.38 ? vec3(1.0, 0.85, 0.35) : ph < 0.52 ? vec3(0.4, 0.9, 0.5)
              : ph < 0.64 ? vec3(0.45, 0.6, 1.0) : ph < 0.8 ? vec3(1.0, 0.95, 0.9) : vec3(0.9, 0.55, 0.85);
    vec2 pf = abs(fract(pc) - 0.5);
    float gap = smoothstep(0.36, 0.45, max(pf.x * 0.9, pf.y * 1.15));
    // 货架层板：每 0.6 m 一道暗横线（货品块之间）；货品只在 0.3–2.2 m 之间
    float shelfLine = fpulse(rr.y / 0.6, wb / 0.6, 0.02, 0.12);
    float stocked = step(0.3, rr.y) * step(rr.y, 2.2) * step(0.35, hash12(pid + 9.9));
    float Lb = kind == 1 ? 0.45 : (0.5 + 0.4 * hash12(pid + 3.3) * stocked) * (1.0 - 0.6 * gap * stocked) * (1.0 - 0.5 * shelfLine);
    vec3 tintB = kind == 1 ? vec3(1.0) : mix(vec3(1.0), prod, 0.3 * stocked);
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
    emit += shopC * 1.8 * down;
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

// ---------------------------------------------------------------- R3 真实贴面的夜景
// 照片是去过日照的白天反照率。实墙 = 反照率 ×（城市环境照度 + 中环「峡谷光」：邻楼窗光、招牌、雾光，随高度缓降）；
// 玻璃 = 很暗的有色玻璃（只取远景格的色相，白天的倒影图案不要）+ 夜空 / 街面的菲涅尔反射。
// 亮灯（复审修正）：
// - 写字楼按楼层 × 租户段（officeLit）成片亮，照片检测到楼层时独立窗也按它所在的楼层 / 租户亮（不再一扇一个随机种子的「纸屑」），
//   没检测到楼层的楼独立窗仍按自己的种子整扇亮；住宅窗按单位 / 窗。
// - 光的形状 = 照片玻璃（独立窗按纹素逐个定形；连续玻璃二值化，不再跟着照片噪点、倒影成斑驳光斑）
//   × 竖梃（1.5 m）× 楼层内剖面（楼板 / 窗间墙暗带、视线高度中等、天花灯槽亮带与一排灯具点）。
// - 亮度按契约 windowOffice 0.25–0.6（整窗平均），只有灯具点 > 1。
// - 近处（像素 < 约 5 cm）：照片实墙加石材板缝 / 瓷砖缝与细颗粒，玻璃加竖梃与楼层横档（照片 4 px/m 本身是糊的）。
float officeProf(float y, float wfv, float u, float wu, bool home) {
  // y：楼层内 0–1（0 = 楼层线）。窗台以下与楼板处暗、视线高度中等、天花灯槽亮
  float vis = fband(y, wfv, 0.2, 0.88);
  float low = fband(y, wfv, 0.2, 0.38);
  float ceil_ = fband(y, wfv, 0.7, 0.86);
  if (home) return vis * (0.6 - 0.25 * low) + ceil_ * 0.3;
  float row = fband(y, wfv, 0.8, 0.84) * fpulse(u / 0.6, wu / 0.6, 0.5, 0.22);
  return vis * (0.5 - 0.3 * low) + ceil_ * 0.45 + row * 1.2;
}

void photoFacade(vec3 alb, vec3 farAlb, float g, float gE, float winK, float u, float v, float F, bool floorsKnown, int key, bool home,
                 int feat, float lift, vec3 amb, vec3 refl, float fres, vec3 nW, vec3 VW, float hiK, out vec3 surf, out vec3 emit) {
  float wu = fwidth(u);
  float wv = fwidth(v);
  // 峡谷光（邻楼窗光、招牌、街灯的漫反射与雾光，中性偏暖）：Y ≈ 0.035（街面）→ 0.016（150 m 以上），加上 cityAmbient；
  // 浅色石材 / 瓷砖（反照率 0.45）在 20 m 以上约 0.01–0.02、深色金属约 0.004（导演规格：0.004–0.02，底部 10–20 m 由街面项抬到 0.04–0.06）
  vec3 canyon = (uHazeColor * 0.6 + vec3(0.040, 0.036, 0.030)) * (0.45 + 0.55 * exp(-max(lift, 0.0) / 120.0)) * 0.52;
  vec3 solid = alb * (amb + canyon);
  float M = 1.5 + 0.15 * hash3(key, 3, 1);
  float fv = v / F;
  float wfv = wv / F;
  // 近处细节：照片一个纹素放大到 5 像素以上才有，远处为 0（平均亮度不变）
  float det = 1.0 - smoothstep(0.02, 0.06, max(wu, wv));
  if (det > 0.0) {
    float grain = (vnoise(vec2(u, v) * 7.0) - 0.5) * 0.1 + (vnoise(vec2(u, v) * 23.0 + 5.3) - 0.5) * 0.08;
    // 住宅瓷砖缝（20 cm）/ 写字楼石材板缝（1.2 × 0.75 m）
    float joint = home ? max(fpulse(u / 0.2, wu / 0.2, 0.5, 0.03), fpulse(v / 0.2, wv / 0.2, 0.5, 0.03))
                       : max(fpulse(u / 1.2 + 0.5, wu / 1.2, 0.5, 0.006), fpulse(v / 0.75 + 0.5, wv / 0.75, 0.5, 0.009));
    solid *= 1.0 + det * (grain - (home ? 0.12 : 0.25) * joint) * (1.0 - g);
  }
  // 未亮灯玻璃：夜空 / 街面反射（glassRefl）+ 很暗的底色，照片色相最多 20 %（白天的倒影图案不要）：Y ≈ 0.003–0.015
  float fl0 = max(dot(farAlb, vec3(0.2126, 0.7152, 0.0722)), 0.02);
  vec3 hue = mix(vec3(1.0), clamp(farAlb / fl0, 0.4, 1.8), 0.2);
  vec3 gsurf = hue * vec3(0.0035, 0.0037, 0.0045) + refl * fres;
  // 竖梃（1.5 m）、楼层横档（检测到楼层时在楼层线上）：浅灰铝框，近处才看得出
  float mullU = fpulse(u / M + 0.5, wu / M, 0.5, 0.035 / M);
  float mullV = floorsKnown ? fpulse(fv + 0.5, wfv, 0.5, 0.06 / F) : 0.0;
  float mull = max(mullU, mullV) * (1.0 - smoothstep(0.05, 0.2, wu));
  gsurf = mix(gsurf, vec3(0.03) * amb + refl * fres * 0.5, mull);
  surf = mix(solid, gsurf, g);

  float clock = (feat & 128) != 0 ? min(uClock, 19.0) : uClock;
  int fl = int(floor(fv)) + OFS;
  float y = fract(fv);
  vec2 ml = mergeLevel(wfv);
  int L0 = int(ml.x);
  // 竖梃与每 6 个窗距一道结构柱把光切开（远处按覆盖率淡化）
  float glassU = 1.0 - fpulse(u / M + 0.5, wu / M, 0.5, 0.04 / M);
  if (!home) glassU *= 1.0 - 0.85 * fpulse(u / (6.0 * M) + 0.5, wu / (6.0 * M), 0.5, 0.3 / (6.0 * M));
  float lit;
  vec3 lc;
  float B;
  float cellW;
  float shape;
  // 高清层（hiK > 0.5，复审修正）：烘焙已把玻璃切成一扇扇真窗（矩形、≤ 一层，同一租户 / 一户的几扇共用种子），一律按窗的种子亮灯，
  // 不再叠程序竖梃与楼层剖面（原来整层成片亮成一排白色「琴键」、斑驳的光斑）
  bool hiWin = hiK > 0.5;
  if (winK >= 0.0 && (home || !floorsKnown || hiWin)) {
    // 照片里认出的独立窗、按自己的种子整扇亮（住宅：一户一窗各自开灯；写字楼没检测到楼层时窗跨不跨楼层线不知道）
    int k = int(winK + 0.5);
    lit = step(hash3(key, 5000 + k, home ? 61 : 62), home ? homeLitTarget(uClock) : officeLitTarget(clock));
    float th = hash3(key, 5000 + k, 66);
    lc = home ? (th < 0.6 ? uHomeW : uHomeC) : (th < 0.11 ? mix(uOfficeW, uOfficeN, 0.45) : (th < 0.7 ? uOfficeN : uOfficeC));
    float hb = hash3(key, 5000 + k, 67);
    B = home ? 0.22 + 0.28 * hb : 0.32 + 0.4 * hb * hb;
    // 高清真窗（复审修正）：同一租户的一组窗里也有约一成五不亮
    if (hiWin) lit *= step(0.15, hash12(vec2(floor(u / 1.4) + 0.5, float(k) * 1.31 + float(fl))));
    // 约三成住宅窗、一成写字楼窗拉了窗帘（偏暖、暗三成，近处有竖褶）
    float cur = step(hash3(key, 5000 + k, 68), home ? 0.3 : 0.1);
    lc = mix(lc, uHomeW, 0.5 * cur);
    B *= 1.0 - 0.3 * cur;
    float nearK = 1.0 - smoothstep(0.025, 0.07, wu);
    float folds = 0.86 + 0.14 * sin(u * (28.0 + 14.0 * hash3(key, 5000 + k, 69)));
    // 窗里上亮下暗（天花灯），检测到楼层时按楼层内位置，否则按楼层格的平滑周期
    float grad = floorsKnown ? 0.7 + 0.5 * smoothstep(0.35, 0.8, y) : 0.84 + 0.2 * cos(6.2832 * (fv - 0.82));
    B *= mix(1.0, grad * mix(1.0, folds, cur), nearK);
#ifdef ROOM_MAPPING
    // R4：近处（像素 < 约 10 cm）看进房间：天花灯、后墙、地面，没拉窗帘的窗才有（不再是一块平的光板）
    float detW = (1.0 - smoothstep(0.03, 0.1, wu)) * (1.0 - cur);
    if (detW > 0.0 && lit > 0.0) {
      float fy = clamp(fract(fv) * F, 0.06, F - 0.35);
      vec4 rr = roomRay(nW, VW, u, fy, F - 0.3, home ? 3.5 : 5.0);
      float wa = fwidth(rr.x) + 1e-3;
      float wb = fwidth(rr.y) + 1e-3;
      float isC = 1.0 - step(0.5, rr.z);
      float isF = step(0.5, rr.z) * (1.0 - step(1.5, rr.z));
      float isB = step(1.5, rr.z);
      float lamp = home ? (1.0 - smoothstep(0.25, 0.45, length(vec2(fract(rr.x / 3.0) - 0.5, (rr.y - 1.6) / 3.0) * 3.0)))
                        : fpulse(rr.y / 1.5, wb / 1.5, 0.5, 0.11) * fpulse(rr.x / 1.8 + 0.25, wa / 1.8, 0.5, 0.33);
      float Lc = 0.35 + 1.3 * lamp;
      float Lb = home ? 0.42 * (0.7 + 0.5 * hash12(floor(vec2(rr.x / 1.3, 0.0)) + vec2(float(k), 3.0))) : (rr.y > 1.2 ? 0.32 : 0.15);
      float Lf = home ? 0.18 : 0.1 * (hash12(floor(vec2(rr.x / 1.6, rr.y / 1.4))) < 0.5 ? 0.6 : 1.1);
      float room = (isC * Lc + isF * Lf + isB * Lb) * (1.0 - 0.25 * rr.w / 5.0);
      B *= mix(1.0, room * 1.6, detW);
    }
#endif
    cellW = M;
    shape = gE * (home || hiWin ? 1.0 : glassU) * 0.85;
    // 窗框错跨楼层线时，楼板那一条暗（照片窗框没对齐楼层的楼）
    if (floorsKnown) shape *= 1.0 - fpulse(fv + 0.5, wfv, 0.5, 0.35 / F);
  } else {
    if (home) {
      float Wf = 6.0 + 3.0 * hash3(key, 42, 0);
      int nWin = 2 + int(hash3(key, 43, 0) * 3.0);
      float slotW = Wf / float(nWin);
      int slotG = int(floor(u / slotW));
      int flat_ = slotG / nWin;
      int slot = slotG - flat_ * nWin;
      int rf = repFloor(key, fl, L0);
      lit = homeWindowLit(key, rf, flat_, slot, uClock);
      if (ml.y > 0.0) lit = mix(lit, homeWindowLit(key, repFloor(key, fl, L0 + 1), flat_, slot, uClock), ml.y);
      cellW = slotW;
      float nFar = exp2(ml.x + ml.y) * max(1.0, wu / slotW);
      if (nFar > 1.01) lit = mix(homeLitTarget(uClock), lit, inversesqrt(sqrt(nFar)));
      int fk = rf * 613 + flat_;
      lc = hash3(key, fk, 66) < 0.6 ? uHomeW : uHomeC;
      B = 0.3 + 0.35 * hash3(key, fk, 67);
    } else {
      int bay = int(floor(u / M));
      vec3 s0 = officeLit(key, repFloor(key, fl, L0), bay, clock);
      lit = s0.x;
      if (ml.y > 0.0) lit = mix(lit, officeLit(key, repFloor(key, fl, L0 + 1), bay, clock).x, ml.y);
      float nFar = exp2(ml.x + ml.y) * max(1.0, wu / M / 12.0);
      if (nFar > 1.01) lit = mix(officeLitTarget(clock), lit, inversesqrt(sqrt(nFar)));
      int tk = int(s0.y) * 977 + int(s0.z);
      float th = hash3(key, tk, 27);
      lc = th < 0.11 ? mix(uOfficeW, uOfficeN, 0.45) : (th < 0.7 ? uOfficeN : uOfficeC);
      float hb = hash3(key, tk, 28);
      // 整层通亮的楼层亮且匀，其余租户近似对数正态；整窗平均落在契约 windowOffice 0.25–0.6
      B = s0.z < -0.5 ? 0.95 + 0.35 * hb : 0.6 + 0.9 * hb * hb;
      B = mix(0.95, B, inversesqrt(sqrt(max(nFar, 1.0))));
      cellW = M;
    }
    // 连续玻璃二值化：照片玻璃度只决定「是不是玻璃」，不再逐像素调光（倒影、阴影、噪点不进灯光）
    float gb = winK >= 0.0 ? gE : smoothstep(0.35, 0.65, gE);
    shape = gb * glassU * officeProf(y, wfv, u, wu, home);
  }
  float perWin = mix(1.0, 0.75 + 0.5 * hash12(vec2(floor(u / cellW) + 0.5, float(fl) * 1.7)), 1.0 - smoothstep(0.6, 1.6, wu / cellW));
  if (!home) {
    // 复审修正：一排亮窗不再是一样亮的白色「琴键」——写字楼窗整体暗两成，约三成拉了一半百叶（上半截暗），逐窗亮度 0.7–1.3 倍
    float paneX = floor(u / cellW);
    float bl = step(hash12(vec2(paneX + 3.7, float(fl) * 0.7 + 1.3)), 0.3);
    float nearV = 1.0 - smoothstep(0.6, 1.6, wu / cellW);
    B *= 0.8 * mix(1.0, (1.0 - 0.5 * bl * smoothstep(0.5, 0.56, y)) * (0.7 + 0.6 * hash12(vec2(paneX, float(fl) + 9.1))), nearV);
  }
  emit = lc * (B * lit * shape * perWin);
  // 熄灯处的走廊 / 邻室溢光（很暗）
  float spill = 0.006 + 0.014 * hash3(key, fl, 35);
  emit += (home ? uHomeW * 0.4 : uOfficeN) * spill * (1.0 - lit) * (winK >= 0.0 ? gE : smoothstep(0.35, 0.65, gE)) * fband(y, wfv, 0.2, 0.86);
}

// R4 高清街面层的夜景（在 photoFacade 之后叠加）。w = 高清权重；albM / albW = 约 0.4 m / 1.3 m 模糊的照片。
// 复审修正：
// - 店面开口（辅助图 G，烘焙按铺位认的矩形）：照片本身就是铺内——亮度按「照片 / 1.3 m 模糊照片」保留货品、柜台、招牌的明暗，
//   色相保留六成；整体亮度 Y 0.30–0.50（tone map 后）、色温约 40 % 冷 / 30 % 中性 / 30 % 暖；离地 2.2 m 以下用 0.4 m 模糊、
//   去一半饱和的照片（拍进去的行人、车只剩一片颜色）；室内映射只作两成的淡层，不再画程序竖梃 / 门楣横档（照片里有真的框）。
// - 招牌（B）优先于店面：灯箱按照片自己的颜色发光（过 bloom 阈值），暗底亮字的字亮、底不亮。
// - 落了闸 / 关了门：约七成是熄灯的玻璃门（照片压暗），约三成是铝闸（横条，掺一半照片颜色）。
void hiresNight(vec3 alb, vec3 albM, vec3 albW, vec4 aux, float relief, float seed, float gl, float glE, float u, float lift, int key, vec3 amb,
                float w, vec3 n, vec3 V, inout vec3 surf, inout vec3 emit) {
  const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
  // 墙面凹进去的地方（窗洞、骑楼、铺内、阳台下）照不到街灯与天光
  surf *= 1.0 - w * 0.3 * smoothstep(0.15, 1.4, relief);
  float sgA = aux.b;
  float shop = aux.g * w * (1.0 - smoothstep(0.3, 0.7, sgA));
  if (shop > 0.004) {
    int sk = int(seed + 0.5);
    float h1 = hash3(key, 7000 + sk, 71);
    bool lit = h1 < shopLitTarget(uClock, vWorld.x);
    float h2 = hash3(key, 7000 + sk, 72);
    float h3 = hash3(key, 7000 + sk, 73);
    vec3 lc = h2 < 0.4 ? mix(uOfficeC, uTube, 0.5) : (h2 < 0.7 ? uOfficeN : uShop);
    lc /= max(dot(lc, LW), 1e-3);
    // 离地 2.2 m 以下：模糊、去饱和的照片（行人、车糊掉）；以上：清楚的照片（招牌、灯盘、货架顶）
    float lowK = 1.0 - smoothstep(1.9, 2.5, lift);
    vec3 pa = mix(alb, albM, lowK);
    float Y = max(dot(pa, LW), 0.004);
    float Yw = max(dot(albW, LW), 0.01);
    float detail = clamp(Y / Yw, 0.3, 2.6);
    vec3 hueP = clamp(pa / Y, vec3(0.3), vec3(2.2));
    vec3 tint = mix(vec3(1.0), hueP, 0.6 * (1.0 - 0.5 * lowK));
    // 上亮下暗：天花灯带在开口顶部；离地 1 m 以下是柜台、货架底座（照片在这一带多半是拍进去的行人、车与地面的拉花），压暗
    float grad = mix(0.4, 1.0, smoothstep(0.2, 1.4, lift)) * (0.85 + 0.3 * smoothstep(1.5, 2.7, lift));
    float B = 0.30 + 0.2 * h3;
    vec3 E = lc * tint * (B * mix(1.0, detail, 0.85) * grad);
#ifdef ROOM_MAPPING
    // 近处：视线进入约 6 m 深的铺内，只作两成的淡层（天花灯盘、后墙），照片仍是主体
    float detR = 1.0 - smoothstep(0.04, 0.12, fwidth(u));
    if (detR > 0.0) {
      float ceilH = 2.9 + 0.7 * h2;
      vec4 rr = roomRay(n, V, u, clamp(lift, 0.06, ceilH - 0.05), ceilH, 6.0);
      float wa = fwidth(rr.x) + 1e-3;
      float wb = fwidth(rr.y) + 1e-3;
      float isC = 1.0 - step(0.5, rr.z);
      float pitch = 1.2 + 0.8 * h3;
      float panel = fpulse(rr.y / 1.6, wb / 1.6, 0.5, 0.1) * fpulse(rr.x / pitch + 0.3, wa / pitch, 0.5, h2 < 0.5 ? 0.12 : 0.35);
      float room = mix(0.85, 1.0 + 1.6 * panel, isC) * (1.0 - 0.25 * rr.w / 6.0);
      E *= mix(1.0, room, 0.2 * detR);
    }
#endif
    float EY = dot(E, LW);
    E *= min(1.0, 0.75 / max(EY, 1e-4));
    vec3 S;
    if (lit) {
      // 亮着的铺：玻璃 / 门洞，表面几乎只剩一点街面反光
      S = alb * amb * 0.25;
    } else {
      // [r4:int] 关了门：约七成是熄了灯的玻璃门 / 铺面（照片压暗，留一点夜灯），约三成落了铝闸（横条，掺一半照片的颜色）
      float sl = fpulse(lift / 0.07, fwidth(lift) / 0.07, 0.5, 0.18);
      if (h3 < 0.3) {
        S = mix(alb, vec3(0.2, 0.2, 0.19), 0.55) * amb * (0.9 - 0.3 * sl);
        E = vec3(0.0);
      } else {
        S = alb * amb * 0.35;
        E = lc * tint * 0.01 * grad;
      }
    }
    surf = mix(surf, S, shop);
    emit = mix(emit, E, shop);
  }
  // 街面带里不是店面开口的暗玻璃（大堂、熄了灯的玻璃铺面、暗色玻璃墙）：不是黑洞（复审修正：原来 Y < 0.01 的一整片黑）——
  // 留一点室内夜灯与照片的明暗（Y 约 0.03–0.07）
  // gl ≈ 0.2 且 glE ≈ 0：暗玻璃码（见 hiresSample）
  float gfDark = w * (1.0 - smoothstep(4.3, 4.8, lift)) * smoothstep(0.1, 0.17, gl) * (1.0 - smoothstep(0.26, 0.4, gl)) * (1.0 - smoothstep(0.02, 0.1, glE)) * (1.0 - smoothstep(0.1, 0.5, aux.g)) * (1.0 - sgA);
  if (gfDark > 0.004) {
    float hd = hash12(vec2(floor(u / 4.0), float(key) * 0.37));
    vec3 lcN = hd < 0.5 ? uOfficeN : uShop;
    lcN /= max(dot(lcN, LW), 1e-3);
    float det2 = clamp(max(dot(alb, LW), 0.004) / max(dot(albW, LW), 0.01), 0.4, 2.2);
    float gr = mix(0.5, 1.0, smoothstep(0.3, 2.2, lift));
    emit = mix(emit, lcN * (0.03 + 0.04 * hd) * det2 * gr, gfDark);
    surf = mix(surf, alb * amb * 0.4, gfDark);
  }
  float sg = sgA * w;
  if (sg > 0.004) {
    // 招牌：灯箱 / 字按照片自己的颜色发光（契约 signLightbox 1.5–2.5）；约一成到深夜已关
    float on = step(hash3(key, int(floor(u / 4.0)) + 9000, int(floor(lift / 3.0)) + 74), uClock < 23.5 && uClock > 12.0 ? 0.95 : 0.6);
    // 复审修正：白板、浅色墙块被认成灯箱时原来按 Y 2.4 发光，成了刺眼的白斑——封顶 Y 1.3（白灯箱仍略过 bloom 阈值）
    vec3 E = alb * 3.0;
    float EY = dot(E, LW);
    E *= min(1.0, 1.3 / max(EY, 1e-4));
    emit = mix(emit, E * on, sg);
    surf = mix(surf, alb * amb * 0.5, sg);
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
  float pv;
  vec3 pAlb;
  vec3 pFar;
  float pGlass;
  float pGlassE;
  float pWin;
  float pNear;
  photoSample(pv, pAlb, pFar, pGlass, pGlassE, pWin, pNear);
  if (m == 1) pv = 0.0;
  // R4 高清街面层：在近景池里时盖过 R3（按淡入权重）；离地 39–45 m 交叉淡化到 R3（高清带上沿）
  float hv;
  vec3 hAlb;
  vec3 hAlbM;
  vec3 hAlbW;
  float hGlass;
  float hGlassE;
  float hWin;
  vec4 hAux;
  float hRelief;
  float hSeed;
  hiresSample(n, V, lift, hv, hAlb, hAlbM, hAlbW, hGlass, hGlassE, hWin, hAux, hRelief, hSeed);
  if (m == 1) hv = 0.0;
  // 复审修正：交叉淡化拉长到 39–45 m（两层照片的去日照略有色差，2 m 的过渡看得出台阶）
  hv *= 1.0 - smoothstep(39.0, 45.0, lift);
  if (hv > 0.0) {
    pAlb = mix(pAlb, hAlb, hv);
    pFar = pv > 0.0 ? mix(pFar, hAlb, 0.5 * hv) : hAlb;
    pGlass = mix(pGlass, hGlass, hv);
    pGlassE = mix(pGlassE, hGlassE, hv);
    pWin = hv > 0.5 ? hWin : pWin;
    pv = hv + pv * (1.0 - hv);
  }
  // 楼层线相位：照片检测到的真楼层（v、h 都减相位，楼层格与亮灯按它排）；相位 > 0 = 检测到楼层（buildings.ts 只在用照片楼层时给相位）
  float vs = vFacade.y - vPhase;
  bool floorsKnown = vPhase > 0.001;

  if (roof) {
    // 屋顶（R2 修复轮）：深灰混凝土 + 低频斑驳，再加一点夜空雾光（天光托底），从上面看退台、机房的轮廓分得出；
    // 仍比亮着的立面暗
    float k = vnoise(vWorld.xz * 0.35) * 0.6 + vnoise(vWorld.xz * 0.05) * 0.4;
    vec3 conc = vec3(0.18, 0.176, 0.17) * (0.75 + 0.5 * k);
    // R3：屋顶照片（去过日照的反照率）按夜景压暗，与程序屋顶同一亮度量级（契约屋顶 Y 0.002–0.015）
    // 复审修正：浅色屋顶照片封顶到程序屋顶的亮度量级（反照率 ≤ 0.2，保留色相），夜里不再比墙亮
    vec3 ra = pAlb * 0.6;
    ra *= min(1.0, 0.2 / max(dot(ra, vec3(0.2126, 0.7152, 0.0722)), 1e-3));
    conc = mix(conc, ra, pv);
    surf = conc * amb + conc * uHazeColor * 0.6;
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
    } else if (shops && lift < shopTop && hv < 0.999) {
      // 街面带：没有高清照片（页没到、照片的洞、质量闸剔除的铺位）画程序铺面；高清页淡入时按权重交叉淡化（复审修正：原来在 hv = 0.5 硬切）
      shopfront(u, lift, key, m, feat, shopTop, amb, n, V, surf, emit);
      pv = 0.0;
      if (hv > 0.001) {
        vec3 sH;
        vec3 eH;
        photoFacade(hAlb, hAlb, hGlass, hGlassE, hWin, u, vs, F, floorsKnown, key, m == 6 || m == 7, feat, lift, amb, refl, fres, n, V, 1.0, sH, eH);
        hiresNight(hAlb, hAlbM, hAlbW, hAux, hRelief, hSeed, hGlass, hGlassE, u, lift, key, amb, 1.0, n, V, sH, eH);
        surf = mix(surf, sH, hv);
        emit = mix(emit, eH, hv);
      }
    } else if (pv > 0.995) {
      photoFacade(pAlb, pFar, pGlass, pGlassE, pWin, u, vs, F, floorsKnown, key, m == 6 || m == 7, feat, lift, amb, refl, fres, n, V, hv, surf, emit);
      if (hv > 0.0) hiresNight(hAlb, hAlbM, hAlbW, hAux, hRelief, hSeed, hGlass, hGlassE, u, lift, key, amb, hv, n, V, surf, emit);
    } else if (m == 8 && !parapet) {
      podiumUpper(u, lift, v, key, feat, amb, refl, fres, tint, surf, emit);
    } else if (m == 10) {
      // 屋顶机房 / 水箱 / 楼梯间（R2 修复轮）：中灰（0.2），横向百叶，顶边一道受光的压顶；
      // 约三成机房门口有一盏暖色壁灯（门上方小灯 + 门洞一片暖光），从高处看得到屋顶上的一点点灯
      float wv = fwidth(v);
      float wu = fwidth(u);
      float louv = fpulse(v / 0.6, wv / 0.6, 0.5, 0.15);
      vec3 pl = vec3(0.2, 0.196, 0.19) * tint;
      float capP = fband(v, wv, h - 0.12, h);
      surf = pl * amb * (1.0 - 0.25 * louv) * (1.0 + 0.9 * capP) + pl * uHazeColor * 0.3;
      float cell = floor(u / 7.0);
      float du = u - (cell + 0.5) * 7.0;
      bool lit = hash3(key, int(cell) + OFS, 90) < 0.3 && h > 2.4;
      if (lit) {
        float door = fband(du, wu, -0.45, 0.45) * fband(v, wv, 0.0, 2.0);
        float lamp = fband(du, wu, -0.14, 0.14) * fband(v, wv, 2.12, 2.3);
        surf = mix(surf, vec3(0.02), door);
        emit = uHomeW * (2.4 * lamp + 0.18 * door * (0.4 + 0.6 * smoothstep(0.0, 2.0, v)));
      }
    } else if (parapet) {
      // 女儿墙：素墙 + 顶部压顶线
      vec3 alb = m == 6 || m == 7 ? wallPalette(int(hash3(key, 44, 0) * 6.0), m == 7) * tint : vec3(0.075, 0.075, 0.08) * tint;
      float cap = fband(v, fwidth(v), h - 0.15, h);
      surf = alb * amb * (1.0 + 0.6 * cap);
    } else if (m == 6 || m == 7) {
      residential(u, vs, F, key, m == 7, tint, amb, refl, fres, lift, surf, emit);
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
      office(u, vs, h - vPhase, F, M, key, fam, tint, amb, refl, fres, feat, m == 2, n, V, surf, emit);
    }
    // R3：照片区边缘（valid 0–1）与程序立面交叉淡化
    if (pv > 0.0 && pv <= 0.995) {
      vec3 sP;
      vec3 eP;
      photoFacade(pAlb, pFar, pGlass, pGlassE, pWin, u, vs, F, floorsKnown, key, m == 6 || m == 7, feat, lift, amb, refl, fres, n, V, hv, sP, eP);
      if (hv > 0.0) hiresNight(hAlb, hAlbM, hAlbW, hAux, hRelief, hSeed, hGlass, hGlassE, u, lift, key, amb, hv, n, V, sP, eP);
      surf = mix(surf, sP, pv);
      emit = mix(emit, eP, pv);
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
#ifdef PHOTO_DEBUG
  // 调试（#facadedebug=1/2/3/4）：照片按白天反照率直出 / 红 = 玻璃度、绿 = 近景页、蓝 = 独立窗 / 红 = alpha 码、绿 = 窗种子 /
  // 4（R4）：高清层的辅助图（红 = 后退深度、绿 = 店面开口、蓝 = 招牌；没有高清的照片区灰）/ 5：档位着色（见下）
#if PHOTO_DEBUG > 4
  // 5（R4 整合，接口 I-3 的档位着色，不打光不加雾，给截图工具数像素）：绿 = 高清层、黄 = 4 px/m 近景页、红 = 远景图集、
  // 蓝 = 程序立面（没有照片 / 排除的面 / 高清页未到时的铺面带）、青 = 敏感区；屋顶灰（不计入墙面）
  col = roof ? vec3(0.25) : (m == 1 ? vec3(0.0, 1.0, 1.0) : (hv > 0.5 ? vec3(0.0, 1.0, 0.0) : (pv > 0.5 ? (pNear > 0.5 ? vec3(1.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)) : vec3(0.0, 0.0, 1.0))));
#elif PHOTO_DEBUG > 3
  if (pv > 0.0) col = hv > 0.0 ? vec3(hRelief / 2.5, hAux.g, hAux.b) * 0.8 + hAlb * 0.25 : vec3(0.08);
#else
  if (pv > 0.0) col = mix(col, PHOTO_DEBUG > 2 ? pAlb : PHOTO_DEBUG > 1 ? vec3(pGlass, pNear, pWin >= 0.0 ? 0.3 + pWin / 128.0 : 0.0) * 0.6 : pAlb * 0.6, pv);
#endif
#endif
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
 * photo：真实贴面的 uniform（facades/streamer.ts）；给了就开 PHOTO，有近景池（near）再开 NEAR_PHOTO。
 */
export function createBuildingMaterial(photo?: { uniforms: Record<string, IUniform>; near: boolean; hires?: boolean }): ShaderMaterial {
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
    ...(photo?.uniforms ?? {}),
  };
  const defines: Record<string, number> = {};
  if (getQuality().tier === 'high') defines.ROOM_MAPPING = 1;
  if (photo) defines.PHOTO = 1;
  if (photo?.near) defines.NEAR_PHOTO = 1;
  // R4 高清街面层（HIGH 档才有）；视差只在 HIGH 档
  if (photo?.near && photo.hires) {
    defines.HIRES = 1;
    // 复审修正：视差默认关（摄影测量的后退深度太噪，墙面「熔化」）；#pom=1 才开（只在街面带、掠射角淡出、深度封顶 0.4 m）
    if (getQuality().tier === 'high' && readParam('pom') === '1') defines.HIRES_POM = 1;
  }
  const dbg = photo ? readParam('facadedebug') : null;
  // 只接受 1–5 的整数（进 GLSL #define；#facadedebug=2.5 之类原来会让着色器编不过）；5 = 档位着色（R4 整合）
  if (dbg !== null) defines.PHOTO_DEBUG = Math.min(5, Math.max(1, Math.round(Number(dbg)) || 1));
  return new ShaderMaterial({ uniforms, vertexShader, fragmentShader, defines });
}

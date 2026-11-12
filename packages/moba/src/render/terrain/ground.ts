/**
 * 地面：一张由地图距离场(splat)驱动的整块地表着色——草地 / 兵线石板路 / 野区腐殖土 / 基地放射铺装 / 河床。
 * 几何：大部分是 4 米粗格，河道附近细分并按河床高度下沉(三角形对角线顺着河道方向，岸线干净)。
 *
 * 画面层次全部在片元着色器里完成，不加几何：
 *   石板    真法线(倒角受光随主光方向变化) + 缝内阴影 + 路中央磨亮 / 路边与近水处长苔
 *   点缀    程序化落叶图章、近河水洼(压暗 + 天光反射 + 太阳碎闪)、墙脚树根纹、树下的叶影斑驳
 *   基地    以水晶为圆心的同心环形铺装 + 通向三路与泉水的发光轴线 + 兵线入口的门槛线
 *   河床    采样坐标按水波偏移(折射) + 按水深吸收 + 焦散(只在受光处)
 *   营地    按营地主题号(uCamps)给地面染色：霜 / 余烬裂纹 / 落叶土 / 花瓣 / 渊藻 / 熔蚀金线
 * 画质：DETAIL 0 不读法线、不画落叶与水洼(倒角明暗用烘在贴图里的值)；1 = 法线 + 苔 + 水洼 + 一层落叶；2 = 全部。
 *       WATER  0 无折射与焦散；1 = 折射 + 单层焦散；2 = 双层焦散 + 水底星屑。
 */
import * as THREE from 'three';
import { pointInPolygon } from '../../core/map';
import type { BaseDef, MapData, Vec2 } from '../../core/types';
import { SUN_DIR } from '../engine/lighting';
import type { QualitySettings } from '../engine/quality';
import { GLSL_LIGHT_PARS_FRAGMENT, GLSL_LIGHT_PARS_VERTEX, GLSL_LIGHT_TINT, GLSL_LIGHT_VERTEX_TAIL, GLSL_NOISE, GLSL_OUTPUT_FRAGMENT, PALETTE, SHARED, litUniforms } from '../materials';
import { CAMP_THEME, CORE_PAD_RADIUS, MAX_CAMPS, type MapField, SPLAT_EXTENT, SPLAT_RANGE, type SplatTextures, WATER_LEVEL } from './field';
import { makeCausticTexture, makeDirtTexture, makeGrassTexture, makeLaneStoneTextures } from './textures';

const VERTEX = /* glsl */ `
${GLSL_LIGHT_PARS_VERTEX}
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec3 vViewPosition;
void main() {
  vec3 objectNormal = normal;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vNormalW = normal;
  ${GLSL_LIGHT_VERTEX_TAIL}
}
`;

const R = SPLAT_RANGE;
const f1 = (v: number): string => v.toFixed(1);

const FRAGMENT = /* glsl */ `
${GLSL_LIGHT_PARS_FRAGMENT}
${GLSL_LIGHT_TINT}
${GLSL_NOISE}
uniform sampler2D tSplatA;
uniform sampler2D tSplatB;
uniform sampler2D tNoise;
uniform sampler2D tGrass;
uniform sampler2D tStone;
uniform sampler2D tStoneN;
uniform sampler2D tDirt;
uniform sampler2D tCaust;
uniform float uTime;
uniform float uSplatScale;
uniform float uWaterLevel;
uniform vec2 uFlow;
uniform vec3 uShadeTintGround;
uniform float uLaneGain;
uniform vec3 cGrass;
uniform vec3 cGrassWarm;
uniform vec3 cGrassCool;
uniform vec3 cGrassDark;
uniform vec3 cLane;
uniform vec3 cLaneAlt;
uniform vec3 cLaneEarth;
uniform vec3 cGrout;
uniform vec3 cMoss;
uniform vec3 cDirt;
uniform vec3 cHumus;
uniform vec3 cSand;
uniform vec3 cGravel;
uniform vec3 cScatter;
uniform vec3 cCaustic;
uniform vec3 cSkyRefl;
uniform vec3 cStar;
uniform vec3 cLeaf[3];
uniform vec3 cPetal[2];
uniform vec3 cBaseStone[2];
uniform vec3 cBaseTrim[2];
uniform vec3 cBaseGlow[2];
uniform vec2 uBaseCore[2];
uniform vec2 uBaseAxis[8];
uniform vec3 uCamps[${MAX_CAMPS}];
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec3 vViewPosition;

const float TAU = 6.2831853;

// 一层落叶图章：cell 米见方的格子里至多一片两头尖的小叶。返回 rgb = 叶色序号对应的颜色权重(x 琥珀 y 橄榄 z 锈红)，a = 覆盖
vec4 leafLayer(vec2 p, float cell, float density, float seed) {
  vec2 g = p / cell;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 h = hash22(id + seed);
  float h3 = hash12(id * 1.37 + seed + 7.1);
  if (h3 > density) return vec4(0.0);
  float a = h.x * TAU;
  vec2 d = f - (h - 0.5) * 0.46;
  float ca = cos(a);
  float sa = sin(a);
  vec2 r = vec2(d.x * ca + d.y * sa, -d.x * sa + d.y * ca);
  // 叶长 0.2~0.3 米
  float len = (0.1 + 0.05 * h.y) / cell * 1.1;
  r /= len;
  // 柳叶形：|y| < 0.42 (1 - x²)
  float lens = 0.42 * (1.0 - r.x * r.x) - abs(r.y);
  float aa = fwidth(lens) + 0.02;
  float cover = smoothstep(0.0, aa, lens) * step(abs(r.x), 1.0);
  // 中脉一道暗线、叶缘略亮
  float rib = 1.0 - 0.3 * (1.0 - smoothstep(0.03, 0.09, abs(r.y)));
  float k = fract(h3 * 37.0 / max(density, 0.01));
  vec3 w = k < 0.4 ? vec3(1.0, 0.0, 0.0) : (k < 0.75 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0));
  return vec4(w * rib * (0.82 + 0.36 * h.y), cover);
}

void main() {
  vec2 wp0 = vWorldPos.xz;
  float t = uTime;
  float under = smoothstep(uWaterLevel + 0.02, uWaterLevel - 0.1, vWorldPos.y);
  float wdepth = max(0.0, uWaterLevel - vWorldPos.y);
  vec2 wp = wp0;
  #if WATER >= 1
  // 折射：河床各层的采样坐标按水波法线偏移，水越深晃得越厉害(与水面着色器用同一组流动噪声)
  vec4 rn = texture2D(tNoise, wp0 * 0.061 - uFlow * t * 0.022);
  vec4 rn2 = texture2D(tNoise, wp0 * 0.113 - uFlow * t * 0.041 + vec2(0.37, 0.71));
  wp += vec2((rn.g - 0.5) * 0.4 + (rn2.b - 0.5) * 0.3, (rn.b - 0.5) * 0.4 + (rn2.g - 0.5) * 0.3) * (wdepth * 2.4);
  #endif

  vec2 suv = wp * uSplatScale + 0.5;
  vec4 sa = texture2D(tSplatA, suv);
  vec4 sb = texture2D(tSplatB, suv);
  float dLane = (sa.r - 0.5) * ${f1(R.lane * 2)};
  float dRiver = (sa.g - 0.5) * ${f1(R.river * 2)};
  float dSolid = (sa.b - 0.5) * ${f1(R.solid * 2)};
  float dBase = (sa.a - 0.5) * ${f1(R.base * 2)};
  float dBush = (sb.r - 0.5) * ${f1(R.bush * 2)};
  float dCamp = (sb.g - 0.5) * ${f1(R.camp * 2)};
  float dPad = (sb.a - 0.5) * ${f1(R.pad * 2)};

  // 多尺度噪声：nA 管大色块(十米级)，nB 管米级破碎
  vec4 nA = texture2D(tNoise, wp * 0.0213);
  vec4 nB = texture2D(tNoise, wp * 0.0871 + vec2(0.31, 0.17));

  // ── 草地：四个草色的大块色斑(日晒发黄 / 近水发青 / 背阴发暗)，贴图只给笔触 ──
  vec3 gt = texture2D(tGrass, wp * 0.1).rgb;
  #if DETAIL >= 1
  vec3 gt2 = texture2D(tGrass, vec2(wp.y, -wp.x) * 0.0371 + 0.4).rgb;
  #else
  vec3 gt2 = vec3(0.47);
  #endif
  vec3 grass = mix(cGrassCool, cGrass, smoothstep(0.3, 0.6, nA.r));
  grass = mix(grass, cGrassWarm, smoothstep(0.5, 0.76, nA.g) * 0.55);
  grass = mix(grass, cGrassCool, (1.0 - smoothstep(0.4, 5.0, dRiver)) * 0.55);
  grass = mix(grass, cGrassDark, smoothstep(0.54, 0.8, nB.r) * 0.45);
  vec3 gdet = mix(vec3(1.0), gt * 2.1 * (gt2 * 0.8 + 0.62), 0.72);
  grass *= mix(vec3(0.86, 0.96, 1.02), vec3(1.1, 1.06, 0.88), smoothstep(0.75, 1.35, gdet.g)) * gdet;
  vec3 albedo = grass;
  vec3 emissive = vec3(0.0);

  // ── 野区腐殖土：通道中央踩实成土路，靠墙处保留草 ──
  // (泥土贴图是 sRGB 的中灰，线性均值约 0.22：乘回 1 附近，并收一点对比)
  vec3 dt = mix(vec3(1.0), texture2D(tDirt, wp * 0.238).rgb * 4.4, 0.75);
  float corridor = smoothstep(0.9, 3.0, dSolid);
  float dirtN = nB.r * 0.55 + nA.g * 0.45;
  float dirtMask = smoothstep(0.47, 0.6, dirtN + corridor * 0.12 - 0.06) * corridor;
  // 营地空地与草丛下的泥土
  float clearing = 1.0 - smoothstep(-0.8, 1.6, dCamp + (nB.g - 0.5) * 2.2);
  float bushSoil = 1.0 - smoothstep(-0.1, 0.55, dBush + (nB.b - 0.5) * 0.5);
  dirtMask = max(dirtMask * 0.85, clearing * 0.92);
  vec3 dirt = mix(cHumus, cDirt, nA.b) * dt;
  #if DETAIL >= 2
  // 墙脚的树根纹：噪声等值线取脊，深棕
  float rootZone = (1.0 - smoothstep(0.5, 2.2, dSolid)) * step(0.05, dSolid);
  float rootN = texture2D(tNoise, wp * 0.047 + 0.19).g;
  float root = (1.0 - smoothstep(0.012, 0.03, abs(rootN - 0.5))) * rootZone;
  dirt = mix(dirt, cHumus * 0.5, root * 0.8);
  albedo = mix(albedo, cHumus * 0.55, root * 0.5);
  #endif
  albedo = mix(albedo, dirt, dirtMask);
  albedo = mix(albedo, cGrassDark * (gt * 1.6 + 0.2) * 0.62, bushSoil * 0.85);

  // ── 兵线石板路：路内铺满，只有最外沿零星缺块；路缘石(几何)外面是一条窄夯土带，再过渡到草 ──
  float laneN = (nB.g - 0.5) * 0.45 + (nB.b - 0.5) * 0.25;
  float dl = dLane + laneN;
  // tStone：r 明暗 g 石面蒙版 b 石块 id a 烘好的倒角受光；tStoneN：rg 法线 b 高度 a 苔藓噪声
  vec4 sd = texture2D(tStone, wp * 0.125);
  vec4 sn = texture2D(tStoneN, wp * 0.125);
  float keepT = smoothstep(-0.95, 0.2, dl);
  float paved = step(keepT * keepT * 0.85, sd.b);
  float earth = 1.0 - smoothstep(0.3, 0.8, dl);
  vec3 laneEarth = cLaneEarth * dt * (0.94 + 0.2 * nA.b);
  float wear = smoothstep(-1.2, -3.2, dLane);
  float tone = mix(sd.r * 2.0, 1.0, 0.4 * wear) * (1.0 + 0.08 * wear);
  vec3 laneStone = mix(cLane, cLaneAlt, smoothstep(0.5, 0.9, sd.b) * 0.7) * tone * (0.95 + 0.12 * nA.r) * uLaneGain;
  // 苔：路边、墙脚与近水处，从石缝往石面上爬
  float nearWall = 1.0 - smoothstep(0.3, 2.0, dSolid);
  float nearRiver = 1.0 - smoothstep(0.4, 3.0, dRiver);
  float mossAmt = (1.0 - wear) * smoothstep(0.5, 0.82, sn.a + nA.b * 0.3 - 0.12 + (nearWall + nearRiver) * 0.26);
  float face = smoothstep(0.3, 0.7, sd.g);
  vec3 pave = mix(mix(mix(cGrout, laneStone, 0.22), cMoss * 0.8, mossAmt * 0.5), mix(laneStone, cMoss * tone, mossAmt * 0.22), face);
  #if DETAIL >= 1
  // 缝内阴影：按高度压暗
  pave *= mix(0.78, 1.0, smoothstep(0.0, 0.35, sn.b));
  #else
  pave *= mix(0.62, 1.0, face) * (0.4 + 1.2 * sd.a);
  #endif
  albedo = mix(albedo, laneEarth, earth);
  float laneMask = 1.0 - smoothstep(-0.12, 0.1, dl);
  float stoneMask = laneMask * paved;

  // ── 基地地台：以水晶为圆心的同心环形铺装 + 发光轴线；塔座用队伍石色的石板 ──
  float team = step(0.0, wp.x - wp.y);
  float plazaMask = 1.0 - smoothstep(-0.12, 0.06, dBase);
  float padMask = (1.0 - smoothstep(-0.25, 0.25, dPad + (nB.g - 0.5) * 0.5)) * (1.0 - plazaMask);
  vec3 bStone = team > 0.5 ? cBaseStone[1] : cBaseStone[0];
  vec3 bTrim = team > 0.5 ? cBaseTrim[1] : cBaseTrim[0];
  vec3 bGlow = team > 0.5 ? cBaseGlow[1] : cBaseGlow[0];
  vec3 plaza = bStone;
  vec2 plazaTilt = vec2(0.0);
  if (dBase < 0.6) {
    int ti = team > 0.5 ? 1 : 0;
    vec2 q = wp - uBaseCore[ti];
    float r = length(q) + 1e-4;
    float ang = atan(q.y, q.x);
    // 环带：两宽一窄为一组(5.2 米一组)，窄环是深色的饰带
    float rr = r / 5.2;
    float ri = floor(rr);
    float rf = fract(rr) * 5.2;
    float band = rf < 2.15 ? 0.0 : (rf < 4.3 ? 1.0 : 2.0);
    float b0 = band < 0.5 ? 0.0 : (band < 1.5 ? 2.15 : 4.3);
    float bw = band > 1.5 ? 0.9 : 2.15;
    float rin = rf - b0;
    float ringId = ri * 3.0 + band;
    float rMid = ri * 5.2 + b0 + bw * 0.5;
    // 每环的石块数按周长取整，相邻环错缝
    float nSeg = max(6.0, floor(TAU * rMid / (band > 1.5 ? 1.15 : 2.4)));
    float af = ang / TAU * nSeg + ringId * 0.37;
    float segId = mod(floor(af), nSeg);
    float sf = fract(af);
    float dA = min(sf, 1.0 - sf) * (TAU * r / nSeg);
    float dR = min(rin, bw - rin);
    float e = min(dA, dR);
    float hs = hash12(vec2(segId, ringId) + team * 17.0);
    float joint = smoothstep(0.018, 0.04, e);
    plaza = bStone * (0.86 + 0.24 * hs) * (0.88 + 0.24 * nA.g) * (0.72 + 0.56 * sd.r) * (0.9 + 0.2 * dt.g);
    plaza *= band > 1.5 ? 0.74 : 1.0;
    // 饰带中线嵌一道细金线
    plaza = mix(plaza, bTrim, (1.0 - smoothstep(0.02, 0.045, abs(rin - 0.45))) * step(1.5, band) * 0.85);
    plaza *= mix(0.5, 1.0, joint);
    // 倒角：石面朝最近的接缝微微下倾
    vec2 rad = q / r;
    vec2 toJoint = dR < dA ? rad * (rin < bw * 0.5 ? -1.0 : 1.0) : vec2(-rad.y, rad.x) * (sf < 0.5 ? -1.0 : 1.0);
    plazaTilt = toJoint * (1.0 - smoothstep(0.02, 0.1, e)) * 0.42 + (hash22(vec2(segId, ringId)) - 0.5) * 0.09 * joint;
    // 通向三路入口与泉水的轴线嵌线(队伍色，发光)
    float axis = 0.0;
    float axisBand = 0.0;
    float axisEdge = 0.0;
    float flowK = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 d = uBaseAxis[ti * 4 + i];
      float along = dot(q, d);
      float perp = abs(q.x * d.y - q.y * d.x);
      float on = step(${f1(CORE_PAD_RADIUS * 0.94)}, along);
      float ln = (1.0 - smoothstep(0.045, 0.085, perp)) * on;
      axis = max(axis, ln);
      axisBand = max(axisBand, (1.0 - smoothstep(0.52, 0.56, perp)) * on);
      axisEdge = max(axisEdge, (1.0 - smoothstep(0.015, 0.035, abs(perp - 0.54))) * on);
      flowK = max(flowK, ln * (0.5 + 0.5 * sin(along * 0.9 - t * 1.8)));
    }
    // 轴线：一条略亮的整石带，两侧细缝，中线嵌发光条
    plaza = mix(plaza, bStone * 1.16 * (0.8 + 0.4 * sd.r), axisBand * 0.9);
    plaza *= 1.0 - 0.45 * axisEdge;
    plaza = mix(plaza, bGlow * 0.5, axis * 0.85);
    #if DETAIL >= 2
    emissive += bGlow * axis * (0.35 + 0.5 * flowK) * plazaMask;
    #else
    emissive += bGlow * axis * 0.55 * plazaMask;
    #endif
  }
  // 地台边缘：一圈深色的压边石 + 金线
  float rimB = smoothstep(-1.0, -0.85, dBase) * (1.0 - smoothstep(-0.12, 0.0, dBase));
  float rimLine = smoothstep(-0.62, -0.55, dBase) * (1.0 - smoothstep(-0.47, -0.4, dBase));
  plaza = mix(plaza, bStone * 0.7 * (0.55 + 0.9 * sd.r) * mix(0.6, 1.0, face), rimB);
  plaza = mix(plaza, bTrim, rimLine);
  // 门槛线：兵线进入基地处横一条队伍色发光嵌线，线外是指向外面的人字刻纹
  float inLane = 1.0 - smoothstep(-0.9, -0.4, dLane);
  float sill = (1.0 - smoothstep(0.05, 0.09, abs(dBase + 0.28))) * inLane;
  float lat = dLane + ${f1(R.lane)};
  float chevP = (dBase + 0.45 * max(0.0, 5.0 - abs(dLane + 5.0))) ;
  float chev = (1.0 - smoothstep(0.05, 0.1, abs(fract(chevP / 0.85) - 0.5))) * smoothstep(0.25, 0.5, dBase) * (1.0 - smoothstep(2.2, 2.8, chevP)) * inLane * step(lat, 5.4);
  emissive += bGlow * sill * 0.75;

  albedo = mix(albedo, pave, stoneMask * (1.0 - plazaMask));
  albedo = mix(albedo, albedo * 0.72 + bTrim * 0.05, chev * (1.0 - plazaMask) * 0.8);
  // 塔座：石板换成偏队伍石色的铺装底(星纹由贴花叠在上面)
  albedo = mix(albedo, mix(pave, bStone * tone * mix(0.6, 1.0, face), 0.65), padMask * face);
  plaza = mix(plaza, bGlow * 0.5, sill);
  albedo = mix(albedo, plaza, plazaMask);

  // ── 落叶(路边 1.5 米带、野区通道、营地空地)──
  float open = (1.0 - plazaMask) * (1.0 - under) * (1.0 - padMask);
  #if DETAIL >= 1
  float leafZone = max(smoothstep(-1.9, -0.7, dLane) * (1.0 - smoothstep(0.3, 1.1, dLane)), (1.0 - smoothstep(1.0, 3.6, dSolid)) * step(0.05, dSolid) * 0.9);
  leafZone = max(leafZone, clearing * 0.6) * open;
  float leafDen = leafZone * smoothstep(0.3, 0.62, nB.r + nearWall * 0.15) * 0.75;
  vec4 lf = leafLayer(wp, 0.9, leafDen, 0.0);
  #if DETAIL >= 2
  vec4 lf2 = leafLayer(wp + 3.7, 0.63, leafDen * 0.8, 23.0);
  lf = mix(lf, lf2, lf2.a);
  #endif
  vec3 leafCol = cLeaf[0] * lf.x + cLeaf[1] * lf.y + cLeaf[2] * lf.z;
  #else
  vec4 lf = vec4(0.0);
  vec3 leafCol = vec3(0.0);
  #endif

  // ── 营地主题：只在营地附近进分支，循环找最近的营地取主题号 ──
  float pitGlow = 0.0;
  if (dCamp < 2.2) {
    float best = 1e9;
    vec3 camp = vec3(0.0);
    for (int i = 0; i < ${MAX_CAMPS}; i++) {
      vec2 d = wp - uCamps[i].xy;
      float dd = dot(d, d);
      if (dd < best) {
        best = dd;
        camp = uCamps[i];
      }
    }
    vec2 cq = wp - camp.xy;
    float cr = sqrt(best);
    float m = 1.0 - smoothstep(-0.6, 1.8, dCamp + (nB.g - 0.5) * 1.6);
    float pulse = 0.72 + 0.28 * sin(t * 1.3 + camp.x);
    if (camp.z < 1.5) {
      // 霜晶洼地：石与土偏冷灰蓝，草尖泛白霜
      float frost = smoothstep(0.8, 1.25, gdet.g) * 0.5 + smoothstep(0.5, 0.75, nB.b) * 0.35;
      albedo = mix(albedo, albedo * vec3(0.74, 0.88, 1.06) + vec3(0.42, 0.56, 0.66) * frost, m * 0.85 * open);
    } else if (camp.z < 2.5) {
      // 余烬坑：焦黑的玄武地面 + 缓慢明灭的熔裂纹
      vec3 scorch = vec3(0.05, 0.043, 0.045) * (0.55 + 0.9 * dt.g);
      float sm = m * open;
      albedo = mix(albedo, scorch, sm * 0.88);
      #if DETAIL >= 1
      float cn = texture2D(tNoise, wp * 0.115 + 0.43).g;
      float crack = (1.0 - smoothstep(0.006, 0.03, abs(cn - 0.5))) * smoothstep(0.25, 0.9, sm);
      emissive += vec3(1.0, 0.36, 0.08) * crack * (0.5 + 0.7 * pulse) * (0.6 + 0.6 * nB.b);
      albedo = mix(albedo, vec3(0.5, 0.16, 0.04), crack * 0.6);
      #endif
    } else if (camp.z < 3.5) {
      // 树根巢穴：腐殖土 + 厚落叶
      albedo = mix(albedo, cHumus * dt * 0.9, m * 0.7 * open);
      #if DETAIL >= 1
      vec4 l3 = leafLayer(wp + 11.3, 0.5, m * 0.6 * open, 51.0);
      leafCol = mix(leafCol, cLeaf[0] * l3.x + cLeaf[1] * l3.y + cLeaf[2] * l3.z, l3.a);
      lf.a = max(lf.a, l3.a);
      #endif
    } else if (camp.z < 4.5) {
      // 灯花丛：一地花瓣碎屑
      #if DETAIL >= 1
      vec4 l3 = leafLayer(wp + 5.9, 0.42, m * 0.55 * open, 77.0);
      leafCol = mix(leafCol, mix(cPetal[0], cPetal[1], l3.x + l3.z) * (l3.x + l3.y + l3.z), l3.a);
      lf.a = max(lf.a, l3.a);
      #endif
    } else if (camp.z < 5.5) {
      // 沉渊潭：潭底加深，紫色发光水藻纹
      float pm = (1.0 - smoothstep(4.2, 6.4, cr)) * under;
      albedo *= mix(vec3(1.0), vec3(0.42, 0.4, 0.62), pm);
      #if DETAIL >= 1
      float an = texture2D(tNoise, wp * 0.083 + vec2(t * 0.004, 0.61)).g;
      float algae = (1.0 - smoothstep(0.008, 0.035, abs(an - 0.5))) * pm;
      emissive += vec3(0.56, 0.3, 1.0) * algae * (0.35 + 0.4 * pulse);
      #endif
      pitGlow = pm;
    } else {
      // 坠星潭：潭底放射状熔蚀纹 + 指向中心的金色嵌线(脉动向内收)
      float pm = (1.0 - smoothstep(4.2, 6.4, cr)) * under;
      float ca = atan(cq.y, cq.x);
      float ray = abs(fract(ca / TAU * 16.0 + 0.5 * step(0.5, fract(cr * 0.31))) - 0.5);
      float melt = smoothstep(0.5, 0.2, ray + (nB.r - 0.5) * 0.5);
      albedo *= mix(vec3(1.0), mix(vec3(0.5, 0.44, 0.4), vec3(0.78, 0.66, 0.5), melt), pm);
      #if DETAIL >= 1
      float ray2 = abs(fract(ca / TAU * 8.0) - 0.5);
      float line = (1.0 - smoothstep(0.012, 0.03, ray2 * cr * 0.785)) * smoothstep(1.2, 1.8, cr) * (1.0 - smoothstep(4.4, 5.0, cr));
      emissive += vec3(1.0, 0.72, 0.26) * line * pm * (0.3 + 0.5 * (0.5 + 0.5 * sin(cr * 1.6 + t * 1.5)));
      #endif
      pitGlow = pm;
    }
  }
  albedo = mix(albedo, leafCol, lf.a * 0.92);

  // ── 河床：沙与卵石，按水深被水体吸收(红先没、蓝留到最后)并叠一层散射色 ──
  float dr = dRiver + (nB.g - 0.5) * 0.7;
  float bedMask = 1.0 - smoothstep(-0.2, 0.45, dr);
  vec3 bed = mix(cSand, cGravel, smoothstep(0.08, 0.42, wdepth)) * (0.8 + 0.4 * nB.g) * (0.5 + 0.5 * dt);
  // 河底卵石
  float pebble = smoothstep(0.3, 0.2, texture2D(tNoise, wp * 0.21).a);
  bed = mix(bed, bed * vec3(0.62, 0.66, 0.72), pebble * 0.6);
  // 渡口：水下仍能看到石板
  float ford = stoneMask * 0.85 + plazaMask;
  albedo = mix(albedo, mix(bed, albedo, ford), bedMask * (1.0 - plazaMask));
  vec3 absorb = exp(-wdepth * vec3(6.2, 2.1, 1.25));
  albedo = albedo * absorb + cScatter * (0.42 * (1.0 - absorb.r)) * under;
  // 岸边湿土 + 紧贴水线的一道深色水渍
  float wet = (1.0 - smoothstep(0.1, 1.1, dr)) * (1.0 - under);
  albedo *= 1.0 - 0.34 * wet;
  albedo *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.07, abs(vWorldPos.y - uWaterLevel - 0.03)));

  // ── 水洼：近河的草地/土路上，压暗、拉平、映天光 ──
  float puddle = 0.0;
  #if DETAIL >= 1
  float pn = nA.r * 0.6 + nB.g * 0.4;
  // (河道距离场的量程只有 6 米：水洼带取离岸 1.2~5.2 米)
  float pzone = smoothstep(1.2, 2.2, dRiver) * (1.0 - smoothstep(4.4, 5.4, dRiver)) * (1.0 - stoneMask) * open * (1.0 - bushSoil) * smoothstep(0.3, 0.8, dSolid);
  puddle = smoothstep(0.6, 0.64, pn) * pzone;
  float puddleRim = smoothstep(0.56, 0.6, pn) * pzone;
  albedo *= 1.0 - 0.32 * puddleRim;
  albedo = mix(albedo, albedo * 0.5 + cScatter * 0.06, puddle);
  #endif

  // ── 法线：几何法线 → 石板/铺装的细节法线 ──
  vec3 Nw = normalize(vNormalW);
  #if DETAIL >= 1
  vec2 nxy = sn.rg * 2.0 - 1.0;
  float nMask = max(stoneMask * (1.0 - plazaMask), padMask) * (1.0 - puddle);
  Nw = normalize(mix(Nw, vec3(nxy.x, sqrt(max(0.05, 1.0 - dot(nxy, nxy))), nxy.y), nMask));
  Nw = normalize(Nw + vec3(plazaTilt.x, 0.0, plazaTilt.y) * plazaMask);
  #endif
  vec3 N = normalize((viewMatrix * vec4(Nw, 0.0)).xyz);
  vec3 L = kitSunDir();
  float ndl = max(dot(N, L), 0.0);

  // ── 主光阴影：有阴影贴图用阴影贴图，没有(低画质)就用烘在 splat 里的静态受光蒙版 ──
  #ifdef USE_SHADOWMAP
  float shadow = kitShadow();
  #else
  float shadow = mix(1.0, sb.b, 0.92);
  #endif
  float sunK = 1.0;
  #if DETAIL >= 1
  // 缓慢飘过的云影：让大片地面有明暗流动
  shadow *= 1.0 - 0.14 * smoothstep(0.48, 0.7, texture2D(tNoise, wp * 0.0061 + vec2(t * 0.004, -t * 0.0025)).r);
  // 树下的叶影斑驳：离墙近的地方，太阳光被一层缓慢漂移的碎影打花
  float canopy = (1.0 - smoothstep(1.2, 4.5, dSolid)) * (1.0 - plazaMask);
  float dap = smoothstep(0.36, 0.62, texture2D(tNoise, wp * 0.163 + vec2(t * 0.007, t * 0.004)).b);
  sunK *= mix(1.0, 0.7 + 0.3 * dap, canopy * 0.8);
  #endif
  #if WATER >= 1
  // 焦散：两个尺度反向滚动取交叠，只在受光的浅水里
  vec2 cuv = wp * 0.155;
  float c1 = texture2D(tCaust, cuv + uFlow * t * 0.018 + vec2(t * 0.011, -t * 0.007)).r;
  #if WATER >= 2
  float c2 = texture2D(tCaust, cuv * 0.71 - vec2(t * 0.013, t * 0.009) + 0.31).g;
  float caust = (c1 + c2) * 0.42 + min(c1, c2) * 1.5;
  #else
  float caust = c1 * 0.8;
  #endif
  float cdep = smoothstep(0.03, 0.14, wdepth) * (1.0 - 0.45 * smoothstep(0.26, 0.4, wdepth)) * (1.0 - 0.6 * pitGlow);
  vec3 caustic = cCaustic * caust * cdep * under;
  #else
  vec3 caustic = vec3(0.0);
  #endif

  // 墙脚/草丛根部的接触阴影
  float ao = mix(0.5, 1.0, smoothstep(-0.1, 1.5, dSolid)) * mix(0.8, 1.0, smoothstep(-0.4, 0.5, dBush));
  float contact = mix(0.7, 1.0, smoothstep(0.0, 0.7, dSolid));
  float lit = shadow * contact;
  vec3 amb = kitTintAmbient(kitAmbient(N) * ao, kitLightTint(wp0));
  vec3 sun = kitSunColor();
  vec3 irradiance = amb + sun * (ndl * lit * sunK) * (1.0 + caustic * 1.6) + kitPointLights(N, -vViewPosition);
  vec3 col = albedo * RECIPROCAL_PI * irradiance;
  // 暗部偏冷(只偏色不压暗)
  col *= mix(uShadeTintGround, vec3(1.0), lit);
  #if DETAIL >= 1
  // 水洼的天光反射与(高画质)太阳碎闪
  col = mix(col, cSkyRefl * (0.45 + 0.55 * lit), puddle * 0.34);
  #if DETAIL >= 2
  float gl = smoothstep(0.86, 0.95, texture2D(tNoise, wp * 0.9 + vec2(t * 0.02, -t * 0.013)).b);
  col += sun * RECIPROCAL_PI * gl * puddle * lit * 0.5;
  #endif
  #endif
  #if WATER >= 2
  // 水底星屑：稀疏成簇的发光碎晶，缓慢闪烁
  vec4 sp4 = texture2D(tNoise, wp * 0.094 + 0.63);
  float cluster = smoothstep(0.62, 0.76, nA.b * 0.6 + nB.r * 0.5);
  float spark = smoothstep(0.07, 0.02, sp4.a) * cluster;
  emissive += cStar * spark * (0.55 + 0.45 * sin(t * 1.7 + sp4.g * 40.0 + wp.x)) * 0.9 * under;
  #endif
  col += emissive;
  gl_FragColor = vec4(col, 1.0);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

export interface Ground {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** 草地笔触贴图(崖顶的顶面贴图复用它) */
  grassTexture: THREE.Texture;
  setQuality(q: QualitySettings): void;
}

/** 地表网格：粗格 4m；河道附近细分到 1m 并下沉 */
function buildGroundGeometry(field: MapField): THREE.BufferGeometry {
  const bound = field.map.bound;
  const cell = 4;
  const x0 = -Math.ceil((bound + 1.2) / cell) * cell;
  const x1 = -x0;
  const sub = 4;
  const pos: number[] = [];
  const idx: number[] = [];
  const vmap = new Map<number, number>();
  const key = (x: number, z: number): number => Math.round((x - x0) * 8) * 8192 + Math.round((z - x0) * 8);
  const lim = bound + 0.3;
  const vert = (x0v: number, z: number): number => {
    // 夹到边界线：界外是外缘地形(北/东/西为拔起的崖壁，南为下沉的台地)
    const x = Math.max(-lim, Math.min(lim, x0v));
    const zc = Math.max(-lim, Math.min(lim, z));
    const k = key(x, zc);
    let i = vmap.get(k);
    if (i === undefined) {
      i = pos.length / 3;
      pos.push(x, field.heightAt(x, zc), zc);
      vmap.set(k, i);
    }
    return i;
  };
  const quad = (ax: number, az: number, s: number): void => {
    const a = vert(ax, az);
    const b = vert(ax + s, az);
    const c = vert(ax + s, az + s);
    const d = vert(ax, az + s);
    // 对角线取 a→c(与 x=z 方向的河道平行)
    idx.push(a, d, c, a, c, b);
  };
  for (let z = x0; z < x1; z += cell) {
    for (let x = x0; x < x1; x += cell) {
      const near = field.riverDist(x + cell / 2, z + cell / 2) < cell * 0.75 + 0.6;
      if (!near) quad(x, z, cell);
      else for (let j = 0; j < sub; j++) for (let i = 0; i < sub; i++) quad(x + (i * cell) / sub, z + (j * cell) / sub, cell / sub);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** 兵线穿出基地地台边界的位置(每条路一个) */
export function laneGates(map: MapData, base: BaseDef): Vec2[] {
  const out: Vec2[] = [];
  for (const lane of Object.values(map.lanes)) {
    let found: Vec2 | null = null;
    for (let i = 1; i < lane.length && !found; i++) {
      const a = lane[i - 1];
      const b = lane[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let prev = pointInPolygon(a, base.area);
      for (let d = 0.25; d <= len; d += 0.25) {
        const p = { x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len };
        const inside = pointInPolygon(p, base.area);
        if (inside !== prev) {
          found = p;
          break;
        }
        prev = inside;
      }
    }
    if (found) out.push(found);
  }
  return out;
}

/** 水流方向(河道中心线首尾相连的单位向量) */
export function riverFlow(field: MapField): THREE.Vector2 {
  const line = field.riverLine;
  const a = line[0];
  const b = line[line.length - 1];
  return new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
}

/** QualitySettings.waterDetail → 着色器的 WATER 档 */
const waterLevelOf = (s: QualitySettings): number => s.waterDetail;

export function createGround(field: MapField, splat: SplatTextures, noise: THREE.Texture, q: QualitySettings, maxAniso: number): Ground {
  const aniso = Math.min(8, maxAniso);
  const sunH = Math.hypot(SUN_DIR.x, SUN_DIR.z) || 1;
  const grass = makeGrassTexture(1024);
  const dirt = makeDirtTexture(512, SUN_DIR.x / sunH, SUN_DIR.z / sunH);
  const stone = makeLaneStoneTextures(SUN_DIR, 512, aniso);
  const caust = makeCausticTexture(256);
  for (const t of [grass, dirt]) t.anisotropy = aniso;
  const E = PALETTE.env;
  const map = field.map;
  const col = (hex: number, mul = 1): THREE.Color => new THREE.Color(hex).multiplyScalar(mul);
  // 基地：水晶位置 + 四条轴线(三路入口 + 泉水)的方向
  const cores = map.bases.map((b) => new THREE.Vector2(b.core.x, b.core.y));
  const axes: THREE.Vector2[] = [];
  for (const b of map.bases) {
    const targets = [...laneGates(map, b), b.fountain];
    for (let i = 0; i < 4; i++) {
      const p = targets[i] ?? b.fountain;
      axes.push(new THREE.Vector2(p.x - b.core.x, p.y - b.core.y).normalize());
    }
  }
  const camps: THREE.Vector3[] = [];
  for (let i = 0; i < MAX_CAMPS; i++) {
    const c = map.camps[i];
    camps.push(c ? new THREE.Vector3(c.pos.x, c.pos.y, CAMP_THEME[c.monsterType]) : new THREE.Vector3(9999, 9999, 0));
  }
  const material = new THREE.ShaderMaterial({
    uniforms: litUniforms({
      tSplatA: { value: splat.a },
      tSplatB: { value: splat.b },
      tNoise: { value: noise },
      tGrass: { value: grass },
      tStone: { value: stone.data },
      tStoneN: { value: stone.normal },
      tDirt: { value: dirt },
      tCaust: { value: caust },
      uTime: SHARED.uTime,
      uSplatScale: { value: 1 / (SPLAT_EXTENT * 2) },
      uWaterLevel: { value: WATER_LEVEL },
      uFlow: { value: riverFlow(field) },
      // 石板反照率的整体增益(对色用：受光兵线的目标明度 L* 66~72)
      uLaneGain: { value: 1.22 },
      cGrass: { value: col(E.grass) },
      cGrassWarm: { value: col(E.grassWarm) },
      cGrassCool: { value: col(E.grassCool) },
      cGrassDark: { value: col(E.grassDark) },
      cLane: { value: col(E.lane) },
      cLaneAlt: { value: col(E.laneAlt) },
      cLaneEarth: { value: col(E.laneDark) },
      cGrout: { value: col(E.laneGrout) },
      cMoss: { value: col(E.moss) },
      cDirt: { value: col(E.dirt) },
      cHumus: { value: col(E.dirtDark) },
      cSand: { value: col(E.sand) },
      cGravel: { value: col(0x8d8672) },
      cScatter: { value: col(E.water) },
      cCaustic: { value: col(E.caustic) },
      cSkyRefl: { value: col(0xbcd6f2) },
      cStar: { value: col(0x9ff0ff) },
      // 落叶：琥珀 / 橄榄 / 锈红；花瓣：粉 / 白
      cLeaf: { value: [col(0xc98a34), col(0x8b8e3e), col(0xa3552e)] },
      cPetal: { value: [col(E.petalPink), col(E.petalWhite)] },
      // 地台用中明度的铺地石，而不是和建筑一样的亮石：水晶/塔/英雄和特效站在上面才分得出来
      cBaseStone: { value: [col(PALETTE.blue.plaza), col(PALETTE.red.plaza)] },
      cBaseTrim: { value: [col(PALETTE.blue.trim), col(PALETTE.red.trim)] },
      cBaseGlow: { value: [col(PALETTE.blue.glow), col(PALETTE.red.glow)] },
      uBaseCore: { value: cores },
      uBaseAxis: { value: axes },
      uCamps: { value: camps },
    }),
    defines: { DETAIL: q.groundDetail, WATER: waterLevelOf(q) },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    lights: true,
    fog: true,
  });
  const mesh = new THREE.Mesh(buildGroundGeometry(field), material);
  mesh.name = 'ground';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  // 地面永远在视野内，省掉包围球测试
  mesh.frustumCulled = false;
  return {
    mesh,
    material,
    grassTexture: grass,
    setQuality(s) {
      const w = waterLevelOf(s);
      if (material.defines.DETAIL !== s.groundDetail || material.defines.WATER !== w) {
        material.defines.DETAIL = s.groundDetail;
        material.defines.WATER = w;
        material.needsUpdate = true;
      }
    },
  };
}

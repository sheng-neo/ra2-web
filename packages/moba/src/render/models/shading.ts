/**
 * 单位着色与合批：
 *   - 单位材质 = 共享着色套件(materials.ts)的三阶明暗 + 冷暖双边缘光 + 环境染色，外加「骨骼贴图蒙皮 + 逐实例参数」。
 *     同一种模型的所有实例一次 draw call 画完：每个实例占骨骼贴图的一行，顶点着色器按 gl_InstanceID 取自己的骨骼。
 *   - 逐实例参数：不透明度(抖动淡出) / 受击闪白 / 自发光倍率 / 队伍色 / 整体染色 / 本体乘色。
 *   - 阴影通道用同一套蒙皮的深度材质(customDepthMaterial)。
 * 骨骼数据已经是世界空间(见 rig.ts 的 pack)，所以网格本身必须保持单位矩阵。
 *
 * ── 材质分类与纹样(顶点属性 aMat，4 个归一化字节；模型不写这个属性时等价于全 0 = 布、无纹样) ──
 *   aMat.x = 纹样号 / 8      1 鳞·甲片  2 岩层  3 毛笔触  4 织纹  5 树皮  6 熔纹  7 翼脉·叶脉  8 陨铁交叉纹
 *   aMat.y = 每米格数 / 32   纹样的密度(例：0.22 米一片的鳞 = 4.5 格/米 → 4.5 / 32)
 *   aMat.z = 纹样强度 0..1
 *   aMat.w = 材质类别 / 8    0 布  1 皮肤  2 皮革·木  3 金属  4 晶体  5 毛  6 岩
 * 类别决定高光与明暗的性格：布 = 无高光、明暗交界软；皮肤 = 暗部偏暖、极弱的宽高光；皮革·木 = 宽而弱的高光；
 * 金属 = 窄而强的硬边高光 + 上冷下暖的假环境反射(漫反射压暗一点)；晶体 = 更窄的高光 + 菲涅尔提亮 + 背光透射；
 * 毛 = 明暗交界最软 + 轮廓上一层绒光；岩 = 明暗交界硬 + 弱高光。同一个三角形的三个顶点应写同一类别与纹样号(着色器按面取值)。
 * 纹样在绑定姿态的物体空间里程序计算(不用贴图、不随动作滑动)，远处自动淡出避免闪烁；画质 low 关闭纹样、保留类别。
 * 纹样 6(熔纹)：把这块面涂成熔岩/能量的亮色并给 aFx.y 自发光——着色器把它变成「暗壳 + 流动明灭的发光裂纹」，强度越大裂纹越细。
 * 旧的 aFx.x(高光强度)仍然有效：在类别自带的高光之上取较大者，现有模型不改也照常有金属亮斑。
 */
import * as THREE from 'three';
import { GLSL_DITHER, GLSL_KICK, GLSL_LIGHT_PARS_FRAGMENT, GLSL_LIGHT_PARS_VERTEX, GLSL_LIGHT_TINT, GLSL_LIGHT_VERTEX_TAIL, GLSL_NOISE, GLSL_OUTPUT_FRAGMENT, LIGHT_TINT_GAIN, PALETTE, SHARED, litUniforms } from '../materials';
import type { Skeleton } from './rig';

/** 材质类别编号(写入 aMat.w = 编号 / 8) */
export const UNIT_MAT = { cloth: 0, skin: 1, leather: 2, metal: 3, crystal: 4, fur: 5, rock: 6 } as const;
/** 纹样编号(写入 aMat.x = 编号 / 8) */
export const UNIT_PATTERN = { none: 0, scales: 1, strata: 2, fur: 3, weave: 4, bark: 5, magma: 6, veins: 7, meteoric: 8 } as const;

const SKIN_PARS = /* glsl */ `
uniform highp sampler2D uBones;
attribute vec3 aSkin;
vec3 qrot(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}
void boneXf(float idx, out vec4 ps, out vec4 q) {
  int x = int(idx + 0.5) * 2;
  ps = texelFetch(uBones, ivec2(x, gl_InstanceID), 0);
  q = texelFetch(uBones, ivec2(x + 1, gl_InstanceID), 0);
}
`;

/** 输出 skinnedPos / skinnedNormal(世界空间) */
const SKIN_MAIN = /* glsl */ `
  vec4 ps0;
  vec4 q0;
  vec4 ps1;
  vec4 q1;
  boneXf(aSkin.x, ps0, q0);
  vec3 skinnedPos = ps0.xyz + ps0.w * qrot(q0, position);
  vec3 skinnedNormal = qrot(q0, normal);
  if (aSkin.z < 0.999) {
    boneXf(aSkin.y, ps1, q1);
    skinnedPos = mix(ps1.xyz + ps1.w * qrot(q1, position), skinnedPos, aSkin.z);
    skinnedNormal = mix(qrot(q1, normal), skinnedNormal, aSkin.z);
  }
`;

const UNIT_VERTEX = /* glsl */ `
${GLSL_LIGHT_PARS_VERTEX}
#include <color_pars_vertex>
${SKIN_PARS}
${GLSL_LIGHT_TINT}
attribute vec4 aFx;
attribute vec4 aMat;
attribute vec4 aInstA;
attribute vec3 aInstTeam;
attribute vec4 aInstTint;
attribute vec3 aInstBody;
varying vec4 vFx;
varying vec4 vInstA;
varying vec3 vTeam;
varying vec4 vTint;
varying vec3 vBody;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec4 vLt;
varying vec4 vObj;
varying vec3 vObjN;
flat varying vec4 vMat;
void main() {
  #include <color_vertex>
  vFx = aFx;
  vMat = aMat;
  vInstA = aInstA;
  vTeam = aInstTeam;
  vTint = aInstTint;
  vBody = aInstBody;
  ${SKIN_MAIN}
  vec3 objectNormal = skinnedNormal;
  vec4 worldPosition = vec4(skinnedPos, 1.0);
  // 环境染色在顶点采一次就够(贴图 1 米一个 texel)；vObj.w = 离地高度(冷边在脚底渐隐)
  vLt = kitLightTint(skinnedPos.xz);
  vObj = vec4(position, skinnedPos.y);
  vObjN = normal;
  ${GLSL_LIGHT_VERTEX_TAIL}
  vNormal = normalize(transformedNormal);
}
`;

/** 程序纹样：输入 q = 绑定姿态坐标投影到主轴平面后 × 每米格数。tone 乘到底色上，edge 加到高光蒙版上，glowMul 乘到自发光上 */
const UNIT_PATTERN_GLSL = /* glsl */ `
void unitPattern(int id, vec2 q, float t, out float tone, out float edge, out float glowMul) {
  tone = 1.0;
  edge = 0.0;
  glowMul = 1.0;
  if (id == 1) {
    // 鳞 / 甲片：错排的圆弧鳞。根部被上一排压住(暗)，下缘翘起(亮边)，逐片明暗略有不同
    float row = floor(q.y);
    float x = q.x + 0.5 * mod(row, 2.0);
    vec2 f = vec2(fract(x) - 0.5, q.y - row);
    float d = length(vec2(f.x, (f.y - 0.62) * 0.86)) / 0.6;
    float inside = 1.0 - smoothstep(0.84, 1.0, d);
    tone = (0.86 + 0.24 * hash12(vec2(floor(x), row))) * mix(0.78, 1.08, 1.0 - f.y);
    tone = mix(0.58, tone, inside);
    edge = smoothstep(0.55, 0.84, d) * inside * step(f.y, 0.62);
  } else if (id == 2) {
    // 岩层：被低频噪声扭曲的水平层理，层间一道暗缝，层的上沿受光
    float y = q.y + (vnoise(q * 0.35) - 0.5) * 1.3;
    float fy = fract(y);
    tone = (0.84 + 0.3 * hash12(vec2(floor(y), 3.0))) * (0.94 + 0.12 * vnoise(q * 2.3));
    tone *= 1.0 - 0.32 * (1.0 - smoothstep(0.0, 0.1, fy));
    edge = smoothstep(0.8, 0.98, fy) * 0.5;
  } else if (id == 3) {
    // 毛笔触：顺着毛向(物体空间的竖直方向)拉长的明暗条
    float n = vnoise(vec2(q.x * 3.2, q.y * 0.55));
    float n2 = vnoise(vec2(q.x * 7.0 + 3.7, q.y * 1.1 + 1.3));
    tone = 0.8 + 0.3 * n + 0.16 * (n2 - 0.5);
    edge = smoothstep(0.62, 0.9, n) * 0.25;
  } else if (id == 4) {
    // 织纹：经纬交替的方格，每格一根鼓起的线
    vec2 c = floor(q);
    vec2 f = fract(q);
    float odd = mod(c.x + c.y, 2.0);
    float u = mix(f.y, f.x, odd);
    float v = mix(f.x, f.y, odd);
    tone = (0.9 + 0.16 * sin(u * 3.14159)) * (0.9 + 0.1 * smoothstep(0.0, 0.14, v) * smoothstep(1.0, 0.86, v));
  } else if (id == 5) {
    // 树皮：竖向的沟槽，被噪声扭弯
    float w = vnoise(q * vec2(0.6, 0.25)) * 2.2;
    float r = abs(fract(q.x + w) - 0.5) * 2.0;
    tone = (0.9 + 0.22 * vnoise(q * vec2(2.0, 0.7))) * (1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.32, r)));
    edge = smoothstep(0.7, 1.0, r) * 0.3;
  } else if (id == 6) {
    // 熔纹：暗壳 + 缓慢流动、明灭的发光裂纹
    vec2 fl = vec2(t * 0.05, t * 0.08);
    float n = vnoise(q * 0.9 + fl);
    float n2 = vnoise(q * 1.9 - fl * 1.7 + 5.2);
    float r = abs(n - 0.5) * 2.0 + abs(n2 - 0.5) * 0.6;
    float crack = 1.0 - smoothstep(0.04, 0.26, r);
    float pulse = 0.72 + 0.28 * sin(t * 1.7 + n2 * 9.0);
    tone = mix(0.14, 1.0, crack);
    glowMul = crack * pulse;
  } else if (id == 7) {
    // 翼脉 / 叶脉：主脉 + 斜向细支脉
    float v1 = 1.0 - smoothstep(0.0, 0.1, abs(fract(q.x) - 0.5));
    float v2 = 1.0 - smoothstep(0.0, 0.07, abs(fract(q.y * 2.0 + abs(fract(q.x) - 0.5) * 2.4) - 0.5));
    tone = (0.94 + 0.12 * vnoise(q * 1.7)) * (1.0 - 0.34 * v1) * (1.0 - 0.16 * v2);
    edge = v1 * 0.35;
  } else if (id == 8) {
    // 陨铁交叉纹：三组互成 60° 的平行片晶，随机几条发亮
    float l = 0.0;
    for (int i = 0; i < 3; i++) {
      float a = float(i) * 1.0472 + 0.35;
      float u = dot(q, vec2(cos(a), sin(a)));
      float band = floor(u);
      float fu = fract(u);
      float on = step(0.56, hash12(vec2(band, float(i) * 7.0 + 1.0)));
      l = max(l, on * smoothstep(0.0, 0.12, fu) * smoothstep(1.0, 0.88, fu) * (0.6 + 0.4 * hash12(vec2(band, float(i) + 11.0))));
    }
    tone = 0.86 + 0.26 * l;
    edge = l * 0.6;
  }
}
`;

const UNIT_FRAGMENT = /* glsl */ `
${GLSL_LIGHT_PARS_FRAGMENT}
#include <color_pars_fragment>
${GLSL_DITHER}
${GLSL_NOISE}
${GLSL_KICK}
#define KIT_LIGHT_TINT_GAIN ${LIGHT_TINT_GAIN.toFixed(2)}
uniform vec4 uRamp;
uniform vec3 uShadeTint;
uniform vec3 uSkinShade;
uniform vec3 uRimColor;
uniform vec2 uRim;
uniform vec2 uSpec;
uniform float uGlowBoost;
uniform float uKick;
uniform vec2 uKickDir;
uniform vec3 uKickColor;
uniform float uTime;
varying vec4 vFx;
varying vec4 vInstA;
varying vec3 vTeam;
varying vec4 vTint;
varying vec3 vBody;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec4 vLt;
varying vec4 vObj;
varying vec3 vObjN;
flat varying vec4 vMat;

// 各材质类别的参数：x = 高光强度，y = 高光锐度，z = 明暗交界的柔和倍率，w = 假环境反射强度
const vec4 MAT_PARAMS[7] = vec4[7](
  vec4(0.0, 24.0, 1.7, 0.0),
  vec4(0.1, 14.0, 1.5, 0.0),
  vec4(0.3, 10.0, 1.0, 0.0),
  vec4(1.15, 52.0, 0.8, 0.7),
  vec4(0.85, 70.0, 0.9, 0.2),
  vec4(0.0, 24.0, 2.2, 0.0),
  vec4(0.22, 28.0, 0.6, 0.0)
);
#ifdef UNIT_PATTERNS
${UNIT_PATTERN_GLSL}
#endif

void main() {
  float opacity = vInstA.x;
  if (opacity < 0.995) {
    if (opacity <= ditherThreshold(gl_FragCoord.xy)) discard;
  }
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewPosition);
  int cat = clamp(int(vMat.w * 8.0 + 0.5), 0, 6);
  vec4 mp = MAT_PARAMS[cat];

  // 本体乘色只作用在非队伍色区域；队伍色只染蒙版区域；整体染色(石化/冰冻/阵亡变灰)按 vTint.a 的强度向灰度化后的染色过渡
  vec3 base = mix(vColor.rgb * vBody, vTeam, vFx.z);
  float lum = dot(base, vec3(0.3, 0.55, 0.15));
  base = mix(base, vTint.rgb * mix(lum, 1.0, 0.25) * 1.6, vTint.a);

  float patEdge = 0.0;
  float glowMul = 1.0;
  // 有纹样的金属面：高光打碎到纹样的棱边上(见下面的高光一节)。1 = 不打碎
  float specBreak = 1.0;
  #ifdef UNIT_PATTERNS
  int pat = int(vMat.x * 8.0 + 0.5);
  // 屏幕空间导数放在分支外面算(分支里求导在个别驱动上不可靠)
  vec3 objFw = fwidth(vObj.xyz);
  if (pat > 0 && vMat.z > 0.004) {
    // 三向投影：绑定姿态坐标按法线主轴投到二维。绝大多数像素只有一个轴有权重、只算一次；
    // 两个轴权重接近的过渡带里两边都算再混合，球面和圆柱上不留接缝。格子小到接近像素时淡出(远处不闪)
    vec3 w = abs(vObjN);
    w *= w;
    w *= w;
    w /= w.x + w.y + w.z;
    float cells = vMat.y * 32.0;
    vec3 fw = objFw * cells;
    float toneSum = 0.0;
    float edgeSum = 0.0;
    float glowSum = 0.0;
    float wSum = 0.0;
    float tone;
    float edge;
    float gm;
    if (w.y > 0.06) {
      unitPattern(pat, vObj.xz * cells, uTime, tone, edge, gm);
      float f = w.y * (1.0 - smoothstep(0.3, 0.8, max(fw.x, fw.z)));
      toneSum += mix(w.y, w.y * tone, f / w.y);
      edgeSum += edge * f;
      glowSum += mix(w.y, w.y * gm, f / w.y);
      wSum += w.y;
    }
    if (w.x > 0.06) {
      unitPattern(pat, vObj.zy * cells, uTime, tone, edge, gm);
      float f = w.x * (1.0 - smoothstep(0.3, 0.8, max(fw.z, fw.y)));
      toneSum += mix(w.x, w.x * tone, f / w.x);
      edgeSum += edge * f;
      glowSum += mix(w.x, w.x * gm, f / w.x);
      wSum += w.x;
    }
    if (w.z > 0.06) {
      unitPattern(pat, vObj.xy * cells, uTime, tone, edge, gm);
      float f = w.z * (1.0 - smoothstep(0.3, 0.8, max(fw.x, fw.y)));
      toneSum += mix(w.z, w.z * tone, f / w.z);
      edgeSum += edge * f;
      glowSum += mix(w.z, w.z * gm, f / w.z);
      wSum += w.z;
    }
    float k = vMat.z;
    base *= mix(1.0, toneSum / wSum, k);
    patEdge = edgeSum / wSum * k;
    glowMul = mix(1.0, glowSum / wSum, k);
    specBreak = mix(1.0, 0.16 + 0.84 * min(1.0, edgeSum / wSum * 1.5), min(1.0, k * 4.0));
  }
  #endif

  vec3 L = kitSunDir();
  float ndl = dot(N, L);
  float soft = uRamp.w * mp.z;
  float a = smoothstep(uRamp.x - soft, uRamp.x + soft, ndl);
  float b = smoothstep(uRamp.y - soft, uRamp.y + soft, ndl);
  float lit = (a * uRamp.z + b * (1.0 - uRamp.z)) * kitShadow();
  vec3 sun = kitSunColor();
  float ao = vFx.w;
  #ifndef USE_SHADOWMAP
  // 没有阴影贴图的画质档(low)：模型没有自阴影，凹处与檐下全靠顶点里烘的遮蔽撑明暗——让它再压一截主光，
  // 浅色的塔身、城垣才不会整面一个亮度。有阴影贴图的档位不走这里
  lit *= mix(0.72, 1.0, ao);
  #endif
  float metal = cat == 3 ? 1.0 : 0.0;

  // 技能闪光的点光是按「离地一两米、照亮地面」调的强度；单位就站在光源边上，按平方衰减会比地面亮十倍，
  // 整个人被打成一团白。所以单位只吃一部分点光，并做软上限：只留下染色与提亮的感觉
  vec3 pl = kitPointLights(N, -vViewPosition) * 0.5;
  pl /= 1.0 + max(pl.r, max(pl.g, pl.b)) * 0.8;
  // 环境光 = 半球光 × 天光可见度 + 环境染色(站在红方基地里带一层暖红补光，站在河里带青色)
  vec3 amb = (kitAmbient(N) * vLt.a + vLt.rgb * KIT_LIGHT_TINT_GAIN) * ao;
  vec3 irradiance = amb + sun * lit * mix(1.0, ao, 0.4) + pl;
  // 金属的漫反射压暗一截，亮度让给高光与环境反射
  vec3 col = base * RECIPROCAL_PI * irradiance * (1.0 - 0.42 * metal);
  // 暗部乘色：统一偏冷紫；皮肤的暗部偏暖(血色)
  col *= mix(cat == 1 ? uSkinShade : uShadeTint, vec3(1.0), lit);

  float fres = pow(1.0 - saturate(dot(N, V)), uRim.y);
  // 受光侧暖边
  col += uRimColor * (fres * uRim.x * (0.3 + 0.7 * lit) * mix(0.55, 1.0, ao));
  // 背光侧冷边：朝屏幕右上、不受光的轮廓上一道冷色亮边，把暗面从地面上分出来；脚底半米内渐隐(不然会和地面的接触暗部打架)
  col += uKickColor * (kitKick(N, V, uKickDir) * (1.0 - 0.6 * lit) * uKick * smoothstep(0.0, 0.5, vObj.w) * mix(0.6, 1.0, ao));

  // 风格化高光：类别自带的强度与旧的 aFx.x(高光强度)取较大者；纹样的棱边(鳞缘、片晶)再加一点
  vec3 H = normalize(L + V);
  float sAmt = max(mp.x, vFx.x * uSpec.x);
  float sPow = mp.x > 0.0 ? mp.y : uSpec.y;
  float sp = pow(saturate(dot(N, H)), sPow);
  // 金属 / 晶体 / 岩，以及只靠旧的 aFx.x 出高光的面：硬边亮斑；皮肤 / 皮革：边缘柔一些
  float hard = cat >= 3 || mp.x == 0.0 ? 0.08 : 0.3;
  // 金属的高光带上金属自己的颜色(深色的铁亮得有限，铜与亮钢才接近主光的亮度)。大块平直的甲片会整片对上高光方向：
  // 原先一律按主光的亮度加上去，深色札甲上就是一块块不规则的米白斑；现在是一片提亮的金属色(最亮的甲片 L* 85~92)
  // 带纹样的金属(札甲的甲片、陨铁的片晶)再把高光打碎到纹样的棱边上：读成一片片甲缘在反光，而不是整块面翻白；
  // 远处纹样淡出后只留两成，对局镜头下不再冒零星白点
  vec3 specCol = sun * RECIPROCAL_PI;
  float specMask = smoothstep(0.5 - hard, 0.5 + hard, sp);
  if (cat == 3) {
    specCol *= 0.3 + base;
    specMask *= specBreak;
  }
  col += specCol * (specMask * sAmt * (1.0 + patEdge) * lit);
  col += sun * RECIPROCAL_PI * base * patEdge * 0.5 * lit;
  // 假环境反射：反射方向朝上取天光(冷)、朝下取地面反光(暖)
  float env = max(mp.w, vFx.x * 0.22);
  if (env > 0.0) {
    vec3 R = reflect(-V, N);
    #if NUM_HEMI_LIGHTS > 0
    // 地平线以上取天光(冷)、以下取地面反光(暖)，交界收紧成一道明暗线——金属感主要靠这条线
    float ry = dot(R, hemisphereLights[0].direction);
    vec3 envCol = mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, smoothstep(-0.14, 0.2, ry));
    #else
    vec3 envCol = kitAmbient(R);
    #endif
    col += base * envCol * (RECIPROCAL_PI * env * (0.55 + 0.9 * fres));
  }
  if (cat == 4) {
    // 晶体：轮廓提亮 + 背光透射(光从背面穿过来)
    col += base * (kitAmbient(N) * RECIPROCAL_PI * fres * 1.2 + sun * RECIPROCAL_PI * saturate(-ndl) * 0.4);
  } else if (cat == 5) {
    // 毛：轮廓上一层柔和的绒光
    col += base * (kitAmbient(N) + sun * lit * 0.6) * (RECIPROCAL_PI * 0.45 * sqrt(fres));
  }

  col += base * (vFx.y * uGlowBoost * vInstA.z * glowMul);
  // 受击闪白：整体提亮并叠一层暖白，但保留自身的明暗与配色(直接换成纯白的话，被集火的单位会连成一团白色剪影)
  col = mix(col, col * 1.45 + vec3(0.6, 0.58, 0.54), vInstA.y);

  gl_FragColor = vec4(col, 1.0);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

const DEPTH_VERTEX = /* glsl */ `
#include <common>
${SKIN_PARS}
attribute vec4 aInstA;
varying vec2 vHighPrecisionZW;
varying float vOpacity;
void main() {
  ${SKIN_MAIN}
  vOpacity = aInstA.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(skinnedPos, 1.0);
  vHighPrecisionZW = gl_Position.zw;
}
`;

const DEPTH_FRAGMENT = /* glsl */ `
#include <common>
#include <packing>
varying vec2 vHighPrecisionZW;
varying float vOpacity;
void main() {
  // 半透明(草丛内/淡出中)的单位不投影
  if (vOpacity < 0.75) discard;
  #ifdef USE_REVERSED_DEPTH_BUFFER
  float fragCoordZ = vHighPrecisionZW[0] / vHighPrecisionZW[1];
  #else
  float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
  #endif
  gl_FragColor = packDepthToRGBA(fragCoordZ);
}
`;

const OUTLINE_VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
${SKIN_PARS}
attribute vec4 aOutline;
attribute vec4 aFx;
attribute vec4 aInstA;
attribute vec3 aInstTeam;
attribute vec3 aInstBody;
uniform float uLine;
varying float vOpacity;
varying float vRim;
varying vec3 vBase;
void main() {
  ${SKIN_MAIN}
  vec3 n = qrot(q0, aOutline.xyz);
  if (aSkin.z < 0.999) n = mix(qrot(q1, aOutline.xyz), n, aSkin.z);
  vec4 mvPosition = viewMatrix * vec4(skinnedPos, 1.0);
  // 线宽按视距换算成恒定的屏幕像素；被缩没的部件(骨骼缩放趋零)不留描边残点
  float sc = ps0.w;
  if (aSkin.z < 0.999) sc = mix(ps1.w, ps0.w, aSkin.z);
  float w = aOutline.w * uLine * -mvPosition.z * min(1.0, sc * 4.0);
  mvPosition = viewMatrix * vec4(skinnedPos + normalize(n) * w, 1.0);
  vOpacity = aInstA.x;
  vRim = aInstA.w;
  // 描边带一点本体色(本体色压暗后与统一的深色各半)：比一律深蓝更干净，浅色件不会被勾出一圈脏边
  vBase = mix(color * aInstBody, aInstTeam, aFx.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const OUTLINE_FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${GLSL_DITHER}
uniform vec3 uColor;
varying float vOpacity;
varying float vRim;
varying vec3 vBase;
void main() {
  if (vOpacity < 0.995) {
    if (vOpacity <= ditherThreshold(gl_FragCoord.xy)) discard;
  }
  vec3 line = mix(vBase * 0.35, uColor, 0.5);
  // 逐实例的描边掺金(InstanceLook.rim)：0.5 上下是暗金(星陨祝福期间常驻)，1 是亮金(河道巨龙击杀奖励的一闪)；亮度压在泛光阈值以下
  line = mix(line, vec3(1.0, 0.74, 0.26) * (0.34 + 0.86 * vRim), min(1.0, vRim * 1.7));
  gl_FragColor = vec4(line, 1.0);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

/**
 * 透视剪影：单位被断崖/树冠/高草挡住时，在遮挡物上画出队伍色的抖动剪影(俯视角下墙后、树后的单位不能凭空消失)。
 * 做法：深度测试取「更远才通过」、不写深度，并排在场景不透明物之后、单位本体之前绘制——
 * 没被挡住的地方本体随后盖上来，被挡住的地方只剩剪影。顶点沿视线朝镜头拉近一点，
 * 这样只有确实躲在遮挡物后面超过这段距离的部分才显示，脚踩进地面/倒地贴地时不会冒出色块。
 */
const XRAY_VERTEX = /* glsl */ `
#include <common>
${SKIN_PARS}
attribute vec4 aInstA;
attribute vec4 aInstX;
uniform float uPull;
varying vec4 vX;
void main() {
  ${SKIN_MAIN}
  vec4 mv = viewMatrix * vec4(skinnedPos, 1.0);
  mv.xyz *= 1.0 - uPull / max(uPull * 2.0, -mv.z);
  gl_Position = projectionMatrix * mv;
  vX = vec4(aInstX.rgb, aInstX.a * aInstA.x);
  // 不需要剪影的实例整个挪出裁剪空间
  if (vX.a <= 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const XRAY_FRAGMENT = /* glsl */ `
#include <common>
${GLSL_DITHER}
varying vec4 vX;
void main() {
  if (vX.a * 0.72 <= ditherThreshold(gl_FragCoord.xy)) discard;
  gl_FragColor = vec4(vX.rgb, 1.0);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

export interface UnitMaterialOptions {
  /** 受光侧暖边(轮廓光)强度 / 指数 / 颜色。默认 0.3 / 3 / #ffe9c4 */
  rim?: number;
  rimPower?: number;
  rimColor?: THREE.ColorRepresentation;
  /**
   * 背光侧冷色边缘光强度。不传时按批名前缀取：hero 0.55、monster 0.5、minion 0.4、其余(建筑) 0.3。
   * 颜色与方向是全局的(SHARED.uKickColor / uKickDir)。
   */
  kicker?: number;
  /** 旧式高光(aFx.x 驱动)的强度 / 锐度；材质类别自带的高光不受它影响 */
  specular?: number;
  gloss?: number;
  /** aFx.y 自发光倍率 */
  glowBoost?: number;
  /** 暗部乘色。不传 = 跟随全局 SHARED.uShadeTint */
  shadeTint?: THREE.ColorRepresentation;
  /** 描边线宽(CSS 像素)；0 = 不描边。约定：英雄 1.5、小兵 1.2、史诗野怪 1.8 */
  outline?: number;
  /** 描边的统一深色(最终描边色 = 本体色 ×0.35 与它各半) */
  outlineColor?: THREE.ColorRepresentation;
  /** 被遮挡时画透视剪影(逐实例颜色见 InstanceLook.xray) */
  xray?: boolean;
}

/** 当前画质是否开启程序纹样，以及所有存活的单位材质(切画质时统一改宏) */
let patternsEnabled = true;
const liveUnitMaterials = new Set<THREE.ShaderMaterial>();

/** 开关全部单位材质的程序纹样(引擎在应用画质档时调用：low 关，medium / high 开)。之后新建的批也按这个值 */
export function setUnitPatternsEnabled(on: boolean): void {
  if (on === patternsEnabled) return;
  patternsEnabled = on;
  for (const m of liveUnitMaterials) {
    if (on) m.defines.UNIT_PATTERNS = '';
    else delete m.defines.UNIT_PATTERNS;
    m.needsUpdate = true;
  }
}

function defaultKicker(name: string): number {
  if (name.startsWith('hero:') || name.startsWith('preview:') || name.startsWith('portrait:')) return 0.55;
  if (name.startsWith('monster:')) return 0.5;
  if (name.startsWith('minion:')) return 0.4;
  return 0.3;
}

function createUnitMaterial(bones: THREE.DataTexture, o: UnitMaterialOptions, name: string): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: litUniforms({
      uBones: { value: bones },
      uTime: SHARED.uTime,
      // 与套件里 steps=3 的角色配置一致：暗→中 / 中→亮 的 N·L 阈值、中间调亮度、柔和度
      uRamp: { value: new THREE.Vector4(-0.08, 0.5, 0.58, 0.08) },
      uShadeTint: o.shadeTint !== undefined ? { value: new THREE.Color(o.shadeTint) } : SHARED.uShadeTint,
      // 皮肤的暗部乘色：偏暖(#e8a090)，不跟着全局的冷紫走
      uSkinShade: { value: new THREE.Color(0xe8a090) },
      uRimColor: { value: new THREE.Color(o.rimColor ?? PALETTE.env.rimWarm) },
      uRim: { value: new THREE.Vector2(o.rim ?? 0.3, o.rimPower ?? 3) },
      uKick: { value: o.kicker ?? defaultKicker(name) },
      uSpec: { value: new THREE.Vector2(o.specular ?? 0.9, o.gloss ?? 36) },
      uGlowBoost: { value: o.glowBoost ?? 3 },
    }),
    defines: patternsEnabled ? { UNIT_PATTERNS: '' } : {},
    vertexShader: UNIT_VERTEX,
    fragmentShader: UNIT_FRAGMENT,
    lights: true,
    fog: true,
    vertexColors: true,
  });
  liveUnitMaterials.add(mat);
  return mat;
}

function createDepthMaterial(bones: THREE.DataTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uBones: { value: bones } },
    vertexShader: DEPTH_VERTEX,
    fragmentShader: DEPTH_FRAGMENT,
  });
}

const _size = new THREE.Vector2();

function createOutlineMaterial(bones: THREE.DataTexture, px: number, color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uBones: { value: bones },
      uLine: { value: 0.001 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: THREE.BackSide,
    fog: true,
    // 只为让着色器前缀声明 color 属性(描边要读本体色)
    vertexColors: true,
  });
  mat.onBeforeRender = (renderer, _scene, camera) => {
    // 视距 d 处一个 CSS 像素对应的世界尺寸 = 2·tan(fov/2)·d / 视口高度；投影矩阵的 [5] 就是 1/tan(fov/2)
    renderer.getSize(_size);
    mat.uniforms.uLine.value = (px * 2) / (camera.projectionMatrix.elements[5] * Math.max(1, _size.y));
  };
  return mat;
}

function createXrayMaterial(bones: THREE.DataTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uBones: { value: bones }, uPull: { value: 0.7 } },
    vertexShader: XRAY_VERTEX,
    fragmentShader: XRAY_FRAGMENT,
    depthFunc: THREE.GreaterDepth,
    depthWrite: false,
  });
}

/** 逐实例外观参数 */
export interface InstanceLook {
  opacity: number;
  flash: number;
  /** 自发光倍率(1 = 原样) */
  glow: number;
  /** 队伍色(线性 RGB) */
  team: THREE.Color;
  /** 整体染色与强度 0..1(石化/冰冻/阵亡变灰：连队伍色件一起染) */
  tint: THREE.Color;
  tintAmount: number;
  /** 本体乘色(线性 RGB，默认白)：只乘在非队伍色蒙版的区域上——例如把共用几何的红方小兵压成玄铁色而不动队伍色件 */
  body: THREE.Color;
  /** 被遮挡时的剪影颜色与强度 0..1(0 = 不画；只有开启了 xray 的批才生效) */
  xray: THREE.Color;
  xrayAmount: number;
  /** 描边掺金 0..1(0 = 原样；约 0.5 暗金，1 亮金)。只影响描边壳，不描边的批(low 档)无效 */
  rim: number;
}

export function createInstanceLook(): InstanceLook {
  return { opacity: 1, flash: 0, glow: 1, team: new THREE.Color(1, 1, 1), tint: new THREE.Color(1, 1, 1), tintAmount: 0, body: new THREE.Color(1, 1, 1), xray: new THREE.Color(1, 1, 1), xrayAmount: 0, rim: 0 };
}

/**
 * 一种模型的实例批：InstancedBufferGeometry(共享模型的顶点缓冲) + 骨骼贴图 + 逐实例属性。
 * 每帧 begin() → 若干次 push() → end()。容量不够时自动翻倍。
 *
 * 约定(单位视图的分通道减面依赖它，重构时保留)：本体 / 描边 / 透视剪影三个网格共用同一份索引，
 * 索引顺序由 models/kit.ts 的 build 排成「描边形体从大到小 → 不描边形体」，各段长度写在 geometry.userData.lod；
 * units/index.ts 在描边、剪影、阴影通道的渲染前后用 geometry.setDrawRange 只画一段前缀。
 * 所以这里不能给各通道各建一份几何，也不能改索引顺序。
 */
export class RigBatch {
  readonly mesh: THREE.Mesh;
  /** 本帧实例数 */
  count = 0;
  readonly triangles: number;
  private readonly source: THREE.BufferGeometry;
  private readonly bones: number;
  private capacity: number;
  private geo!: THREE.InstancedBufferGeometry;
  private tex!: THREE.DataTexture;
  private data!: Float32Array;
  private instA!: THREE.InstancedBufferAttribute;
  private instTeam!: THREE.InstancedBufferAttribute;
  private instTint!: THREE.InstancedBufferAttribute;
  private instBody!: THREE.InstancedBufferAttribute;
  private instX: THREE.InstancedBufferAttribute | null = null;
  private readonly wantXray: boolean;
  private readonly material: THREE.ShaderMaterial;
  private readonly depth: THREE.ShaderMaterial;
  /** 描边壳(背面外扩)；不描边的批为 null */
  readonly outline: THREE.Mesh | null = null;
  private readonly outlineMat: THREE.ShaderMaterial | null = null;
  /** 透视剪影；没开启的批为 null */
  readonly xray: THREE.Mesh | null = null;
  private readonly xrayMat: THREE.ShaderMaterial | null = null;
  private xrayOn = true;

  constructor(source: THREE.BufferGeometry, bones: number, capacity: number, opts: UnitMaterialOptions = {}, name = 'unit-batch') {
    this.source = source;
    this.bones = bones;
    this.capacity = Math.max(1, capacity);
    this.triangles = (source.index ? source.index.count : source.attributes.position.count) / 3;
    this.wantXray = opts.xray === true;
    // 没写材质分类属性的模型：补一份全 0 的(= 布、无纹样)，所有单位共用同一套着色器，不为「有没有 aMat」多编一个变体
    if (!source.attributes.aMat) source.setAttribute('aMat', new THREE.BufferAttribute(new Uint8Array(source.attributes.position.count * 4), 4, true));
    this.allocate();
    this.material = createUnitMaterial(this.tex, opts, name);
    this.depth = createDepthMaterial(this.tex);
    const mesh = new THREE.Mesh(this.geo, this.material);
    mesh.name = name;
    mesh.customDepthMaterial = this.depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // 实例分布在整张地图上，由调用方自己做可见性裁剪
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    // 绘制次序(同在不透明队列)：场景 0 → 剪影 1 → 本体与描边 2
    mesh.renderOrder = 2;
    this.mesh = mesh;
    if (this.wantXray) {
      this.xrayMat = createXrayMaterial(this.tex);
      const xr = new THREE.Mesh(this.geo, this.xrayMat);
      xr.name = `${name}:xray`;
      xr.frustumCulled = false;
      xr.matrixAutoUpdate = false;
      xr.visible = false;
      xr.renderOrder = 1;
      this.xray = xr;
    }
    const px = opts.outline ?? 0;
    if (px > 0) {
      this.outlineMat = createOutlineMaterial(this.tex, px, opts.outlineColor ?? 0x1b2233);
      const ol = new THREE.Mesh(this.geo, this.outlineMat);
      ol.name = `${name}:outline`;
      ol.frustumCulled = false;
      ol.matrixAutoUpdate = false;
      ol.visible = false;
      ol.renderOrder = 2;
      this.outline = ol;
    }
  }

  /** 把本批的网格(本体 + 描边壳)加到父节点 */
  addTo(parent: THREE.Object3D): void {
    parent.add(this.mesh);
    if (this.outline) parent.add(this.outline);
    if (this.xray) parent.add(this.xray);
  }

  removeFrom(parent: THREE.Object3D): void {
    parent.remove(this.mesh);
    if (this.outline) parent.remove(this.outline);
    if (this.xray) parent.remove(this.xray);
  }

  setOutlineVisible(on: boolean): void {
    this.outlineOn = on;
  }

  setXrayVisible(on: boolean): void {
    this.xrayOn = on;
  }
  private outlineOn = true;

  private allocate(): void {
    const cap = this.capacity;
    const geo = new THREE.InstancedBufferGeometry();
    const src = this.source;
    geo.setIndex(src.index);
    for (const name of ['position', 'normal', 'color', 'aFx', 'aMat', 'aSkin', 'aOutline']) geo.setAttribute(name, src.attributes[name]);
    this.instA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.instTeam = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.instTint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.instBody = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.instBody.setUsage(THREE.DynamicDrawUsage);
    this.instA.setUsage(THREE.DynamicDrawUsage);
    this.instTeam.setUsage(THREE.DynamicDrawUsage);
    this.instTint.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aInstA', this.instA);
    geo.setAttribute('aInstTeam', this.instTeam);
    geo.setAttribute('aInstTint', this.instTint);
    geo.setAttribute('aInstBody', this.instBody);
    if (this.wantXray) {
      this.instX = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      this.instX.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aInstX', this.instX);
    }
    geo.instanceCount = 0;
    this.geo = geo;
    this.data = new Float32Array(this.bones * 8 * cap);
    const tex = new THREE.DataTexture(this.data, this.bones * 2, cap, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.tex = tex;
  }

  private grow(): void {
    const oldData = this.data;
    const oldA = this.instA.array as Float32Array;
    const oldTeam = this.instTeam.array as Float32Array;
    const oldTint = this.instTint.array as Float32Array;
    const oldBody = this.instBody.array as Float32Array;
    const oldX = this.instX ? (this.instX.array as Float32Array) : null;
    const oldGeo = this.geo;
    const oldTex = this.tex;
    this.capacity *= 2;
    this.allocate();
    this.data.set(oldData);
    (this.instA.array as Float32Array).set(oldA);
    (this.instTeam.array as Float32Array).set(oldTeam);
    (this.instTint.array as Float32Array).set(oldTint);
    (this.instBody.array as Float32Array).set(oldBody);
    if (this.instX && oldX) (this.instX.array as Float32Array).set(oldX);
    this.mesh.geometry = this.geo;
    this.material.uniforms.uBones.value = this.tex;
    this.depth.uniforms.uBones.value = this.tex;
    if (this.outline && this.outlineMat) {
      this.outline.geometry = this.geo;
      this.outlineMat.uniforms.uBones.value = this.tex;
    }
    if (this.xray && this.xrayMat) {
      this.xray.geometry = this.geo;
      this.xrayMat.uniforms.uBones.value = this.tex;
    }
    // 旧的实例属性与贴图直接释放；共享的模型顶点缓冲会在下次绘制时由新几何体重新上传
    oldGeo.dispose();
    oldTex.dispose();
  }

  begin(): void {
    this.count = 0;
  }

  /** 追加一个实例：拷贝骨架的蒙皮数据与外观参数 */
  push(skeleton: Skeleton, look: InstanceLook): void {
    if (this.count >= this.capacity) this.grow();
    const i = this.count++;
    skeleton.pack(this.data, i * this.bones * 8);
    const a = this.instA.array as Float32Array;
    a[i * 4] = look.opacity;
    a[i * 4 + 1] = look.flash;
    a[i * 4 + 2] = look.glow;
    a[i * 4 + 3] = look.rim;
    const t = this.instTeam.array as Float32Array;
    t[i * 3] = look.team.r;
    t[i * 3 + 1] = look.team.g;
    t[i * 3 + 2] = look.team.b;
    const n = this.instTint.array as Float32Array;
    n[i * 4] = look.tint.r;
    n[i * 4 + 1] = look.tint.g;
    n[i * 4 + 2] = look.tint.b;
    n[i * 4 + 3] = look.tintAmount;
    const bd = this.instBody.array as Float32Array;
    bd[i * 3] = look.body.r;
    bd[i * 3 + 1] = look.body.g;
    bd[i * 3 + 2] = look.body.b;
    if (this.instX) {
      const x = this.instX.array as Float32Array;
      x[i * 4] = look.xray.r;
      x[i * 4 + 1] = look.xray.g;
      x[i * 4 + 2] = look.xray.b;
      x[i * 4 + 3] = look.xrayAmount;
    }
  }

  end(): void {
    const n = this.count;
    this.mesh.visible = n > 0;
    if (this.outline) this.outline.visible = n > 0 && this.outlineOn;
    if (this.xray) this.xray.visible = n > 0 && this.xrayOn;
    this.geo.instanceCount = n;
    if (n === 0) return;
    this.tex.needsUpdate = true;
    this.instA.needsUpdate = true;
    this.instTeam.needsUpdate = true;
    this.instTint.needsUpdate = true;
    this.instBody.needsUpdate = true;
    if (this.instX) this.instX.needsUpdate = true;
  }

  setShadows(cast: boolean): void {
    this.mesh.castShadow = cast;
  }

  dispose(): void {
    this.geo.dispose();
    this.tex.dispose();
    liveUnitMaterials.delete(this.material);
    this.material.dispose();
    this.depth.dispose();
    this.outlineMat?.dispose();
    this.xrayMat?.dispose();
  }
}

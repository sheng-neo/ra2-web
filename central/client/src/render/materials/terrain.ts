/**
 * 地形材质（realism C7，契约：线性 HDR、applyHaze、GLSL_FINISH）。
 * - 未建成的坡地 = 树冠：近黑橄榄（反照率 ~0.05，#0e0e0a–#14130e），2–8 m 成团的明暗、沟谷更暗；
 *   只受 cityAmbient 的天光（≈ 0.003 亮度），与 ATMOSPHERE 的山脊树冠同一反照率与光照，接缝处亮度一致。
 * - 建成区平地 = 深色混凝土 / 铺地（反照率 ~0.08–0.12）；平坦的广场、行人区（R3）= 灰花岗岩板，海旁 = 红褐陶土砖（与路面材质同一套铺地）。
 * - 路灯照到的范围（遮罩 R）加街面反光：树冠近路的边缘透出暖光（参考照 05），广场被路灯照亮。
 * - 遮罩 A（水面）且高度 < 0.6 m：不画（海边的地形格子伸进水里的部分交给水面）。
 * 山上零星的住宅灯点由 streets 层的 GlowBatch 画（有最小像素尺寸，远处不闪）。
 */
import { ShaderMaterial, type Texture } from 'three';
import { GLSL_HASH } from './common';
import { GLSL_PAVING, GLSL_PAVING_KIND, GLSL_WATERFRONT, POOL_LED_HEX } from './road'; // [r4:street] GLSL_PAVING_KIND
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, getQuality, lightColour, sharedUniforms } from './lighting'; // [r4:street] getQuality
import { FRONTAGE_UNIFORMS, GLSL_FRONTAGE } from '../streets/frontage-field'; // [r4:street] 铺面溢光场（门前空地 / 广场）
import { GLSL_PAVE_FIELD, PAVING_UNIFORMS } from '../streets/paving-field'; // [r4:street] 楼前人行道的铺地种类

/** 树冠反照率（线性，= sRGB #0e0e0a 附近；与 ATMOSPHERE 的山脊同值）。 */
export const CANOPY_ALBEDO = '#0e0e0a';

const vertexShader = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HASH}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
${GLSL_WATERFRONT}
${GLSL_PAVING}
${GLSL_PAVING_KIND}
${GLSL_FRONTAGE}
${GLSL_PAVE_FIELD}
uniform sampler2D uMask;
uniform vec4 uMaskRect; // 模拟坐标（米）：minX, minY, sizeX, sizeY
uniform vec3 uCanopy;
uniform vec3 uLed;
uniform vec3 uSodium;
varying vec3 vWorld;
varying vec3 vN;

void main() {
  vec2 sim = vec2(vWorld.x, -vWorld.z);
  vec2 uv = (sim - uMaskRect.xy) / uMaskRect.zw;
  vec4 m = texture2D(uMask, uv);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) m = vec4(0.0);
  if (m.a > 0.5 && vWorld.y < 0.6) discard;

  vec3 n = normalize(vN);
  float slope = 1.0 - n.y;
  float built = smoothstep(0.3, 0.8, m.g);
  float lit = m.r;
  // 树冠：坡地、非建成区；海拔高（> 60 m）的平台也多是树
  float hill = smoothstep(0.05, 0.2, slope) + smoothstep(40.0, 90.0, vWorld.y) * 0.6;
  float canopy = clamp(hill, 0.0, 1.0) * (1.0 - built);

  // 树冠成团：两级噪声（~8 m 与 ~2.5 m），屏幕上太细时退成平均值，避免远处闪烁
  float px = length(fwidth(sim));
  float fine = mix(vnoise(sim * 0.4), 0.5, smoothstep(0.6, 2.0, px));
  float clump = mix(vnoise(sim * 0.12), 0.5, smoothstep(2.0, 8.0, px));
  float gully = smoothstep(0.35, 0.05, n.y + 0.4 * (clump - 0.5));
  vec3 tree = uCanopy * (0.55 + 0.6 * clump + 0.35 * fine) * (1.0 - 0.5 * gully);
  vec3 ground = mix(vec3(0.075, 0.071, 0.066), vec3(0.11, 0.10, 0.088), lit) * (0.85 + 0.3 * fine);
  vec3 albedo = mix(ground, tree, canopy);
  // 平地的广场 / 行人区 = 花岗岩铺地：0.6 m 方砖 + 灰缝，逐块 ±12 % 色差，4.8 m 一道深浅两色的拼花带；
  // 像素大于砖时退成平均（远处不闪）。皇后像广场一类的空地不再是一整块无纹理的暗面
  // 低处（< 12–25 mPD，填海平地）的空地都是广场、海旁步道、公园，晚上有成片的庭园灯与地灯
  float open = smoothstep(0.97, 0.995, n.y) * (1.0 - canopy) * (1.0 - smoothstep(12.0, 25.0, vWorld.y));
  float flatK = smoothstep(0.97, 0.995, n.y) * (1.0 - canopy) * max(smoothstep(0.1, 0.5, max(built, lit)), open);
  if (flatK > 0.0) {
    // R3 STATIONS：广场 / 行人区与人行道同一套铺地——核心区冷灰花岗岩板（不再是暖棕），海旁与码头前地红褐陶土砖；
    // 码头前地另有 4.8 m 一道的深色拼花带（照片 19：灰米色砌块间酱紫色带，这里用陶土砖深浅两色）
    float wf = waterfront(sim);
    // R4 STREET：德辅道中 / 金钟道两旁楼前那截人行道换成该街的铺地，砖缝顺街
    vec2 pk = paveKindAt(sim);
    vec2 sdir = vec2(cos(pk.y), sin(pk.y));
    vec2 sp = pk.x > 0.5 ? vec2(dot(sim, sdir), dot(sim, vec2(-sdir.y, sdir.x))) : sim;
    vec3 paved = pavingAlbedoKind(sp, px, 37.0, wf, pk.x);
    vec2 band = floor(sim / 4.8);
    paved *= 1.0 - 0.12 * mod(band.x + band.y, 2.0) * wf;
    albedo = mix(albedo, paved * 0.85, flatK);
  }
  // 城区里的陡坡 = 灰色批荡护坡（chunam）：浅灰水泥面、2 m 一格的疏水孔、雨水渍；近路或建成区才有
  float chunamK = smoothstep(0.985, 0.9, n.y) * max(built, smoothstep(0.2, 0.5, lit));
  if (chunamK > 0.0) {
    vec2 wp = vec2(vWorld.x + vWorld.z, vWorld.y) / 2.0;
    vec2 f = abs(fract(wp) - 0.5);
    float hole = (1.0 - smoothstep(0.05, 0.09, max(f.x, f.y))) * (1.0 - smoothstep(0.3, 0.8, px));
    float stain = vnoise(vec2((vWorld.x + vWorld.z) * 0.5, vWorld.y * 0.08));
    vec3 chunam = vec3(0.17, 0.165, 0.15) * (0.7 + 0.45 * stain) * (1.0 - 0.7 * hole);
    albedo = mix(albedo, chunam, chunamK);
    canopy *= 1.0 - chunamK;
  }

  // 天光：树冠按高空取（只有天光），平地按贴地取（含微弱的街面反光）
  float warm = m.b;
  vec3 amb = cityAmbient(n, mix(0.0, 200.0, canopy), warm) * mix(0.5, 1.0, canopy);
  // 路灯：遮罩 R 的平方作为照度权重；树冠只在面向路的边缘接到光（法线越朝上越少）
  // R3：核心区平地（广场、海旁）按白光 LED 照（与路面同一光斑色），半山 / 上环才偏钠灯
  vec3 lampC = mix(uLed * 2.3, uSodium * 1.9, smoothstep(0.45, 0.8, warm));
  float lampE = lit * lit * mix(0.45 * mix(1.0, 0.35, chunamK), 0.8 * (0.5 + 0.5 * (1.0 - n.y)), canopy);
  // 平地的灯光不是一条均匀的光带：按约 15 m 的团块起伏（灯下亮、两灯之间暗，约 3:1；鸟瞰时一个个光斑）
  lampE *= mix(0.35 + 1.1 * vnoise(sim * 0.07 + 1.3), 1.0, canopy);
  // 广场 / 步道的庭园灯：约 12 m 一团的光斑（皇后像广场在地面看不再是一片无光的空地）
  float garden = smoothstep(0.45, 0.8, vnoise(sim * 0.085 + 7.7));
  lampE += open * (1.0 - lit) * (0.06 + 0.3 * garden);
  // R4 STREET：铺面溢光（门前空地、骑楼底、广场边的亮铺位）；树冠与陡坡不受
  vec3 spill = frontageSpill(sim) * (1.0 - canopy) * smoothstep(0.9, 0.98, n.y);
  vec3 col = applyHaze(albedo * (amb + lampC * lampE + spill), vec3(0.0), vWorld);
  ${GLSL_FINISH}
}
`;

/** rect：遮罩覆盖的模拟坐标范围（米）[minX, minY, sizeX, sizeY]。 */
export function createTerrainMaterial(mask: Texture, rect: [number, number, number, number]): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...sharedUniforms(),
      ...FRONTAGE_UNIFORMS, // [r4:street]
      ...PAVING_UNIFORMS, // [r4:street]
      uMask: { value: mask },
      uMaskRect: { value: rect },
      uCanopy: { value: lightColour(CANOPY_ALBEDO).multiplyScalar(0.05) },
      uLed: { value: lightColour(POOL_LED_HEX) },
      uSodium: { value: lightColour('sodium') },
    },
    defines: getQuality().tier === 'low' ? { FRONT_MAX: 4 } : {}, // [r4:street] LOW 档每格只取 4 个亮铺位
    vertexShader,
    fragmentShader,
  });
}

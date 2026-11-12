/**
 * 地面：一张由地图距离场(splat)驱动的整块地表着色——草地 / 兵线石板路 / 野区泥土 / 基地方砖 / 河床。
 * 几何：大部分是 4 米粗格，河道附近细分并按河床高度下沉(三角形对角线顺着河道方向，岸线干净)。
 */
import * as THREE from 'three';
import { GLSL_LIGHT_PARS_FRAGMENT, GLSL_LIGHT_PARS_VERTEX, GLSL_LIGHT_VERTEX_TAIL, GLSL_OUTPUT_FRAGMENT, PALETTE, SHARED, getStoneDataTexture, litUniforms } from '../materials';
import type { QualitySettings } from '../engine/quality';
import { type MapField, SPLAT_EXTENT, SPLAT_RANGE, type SplatTextures, WATER_LEVEL } from './field';
import { makeDirtTexture, makeGrassTexture, makePlazaTexture } from './textures';

const VERTEX = /* glsl */ `
${GLSL_LIGHT_PARS_VERTEX}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  vec3 objectNormal = normal;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  ${GLSL_LIGHT_VERTEX_TAIL}
  vNormal = normalize(transformedNormal);
}
`;

const FRAGMENT = /* glsl */ `
${GLSL_LIGHT_PARS_FRAGMENT}
uniform sampler2D tSplatA;
uniform sampler2D tSplatB;
uniform sampler2D tNoise;
uniform sampler2D tGrass;
uniform sampler2D tStone;
uniform sampler2D tDirt;
uniform sampler2D tPlaza;
uniform float uTime;
uniform float uSplatScale;
uniform float uWaterLevel;
uniform vec3 cGrass;
uniform vec3 cGrassWarm;
uniform vec3 cGrassCool;
uniform vec3 cGrassDark;
uniform vec3 cLane;
uniform vec3 cLaneAlt;
uniform vec3 cLaneEarth;
uniform vec3 cDirt;
uniform vec3 cSand;
uniform vec3 cBedDeep;
uniform vec3 cStar;
uniform vec3 cBaseStone[2];
uniform vec3 cBaseTrim[2];
uniform vec3 cBaseGlow[2];
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vec2 wp = vWorldPos.xz;
  vec2 suv = wp * uSplatScale + 0.5;
  vec4 sa = texture2D(tSplatA, suv);
  vec4 sb = texture2D(tSplatB, suv);
  float dLane = (sa.r - 0.5) * ${(SPLAT_RANGE.lane * 2).toFixed(1)};
  float dRiver = (sa.g - 0.5) * ${(SPLAT_RANGE.river * 2).toFixed(1)};
  float dSolid = (sa.b - 0.5) * ${(SPLAT_RANGE.solid * 2).toFixed(1)};
  float dBase = (sa.a - 0.5) * ${(SPLAT_RANGE.base * 2).toFixed(1)};
  float dBush = (sb.r - 0.5) * ${(SPLAT_RANGE.bush * 2).toFixed(1)};
  float dCamp = (sb.g - 0.5) * ${(SPLAT_RANGE.camp * 2).toFixed(1)};
  float dPad = (sb.a - 0.5) * ${(SPLAT_RANGE.pad * 2).toFixed(1)};

  // 多尺度噪声：nA 管大色块(十米级)，nB 管米级破碎
  vec4 nA = texture2D(tNoise, wp * 0.0213);
  vec4 nB = texture2D(tNoise, wp * 0.0871 + vec2(0.31, 0.17));

  // ── 草地 ──
  vec3 gt = texture2D(tGrass, wp * 0.118).rgb;
  #if DETAIL >= 1
  vec3 gt2 = texture2D(tGrass, vec2(wp.y, -wp.x) * 0.0391 + 0.4).rgb;
  #else
  vec3 gt2 = vec3(0.5);
  #endif
  vec3 grass = mix(cGrassCool, cGrass, smoothstep(0.34, 0.62, nA.r));
  grass = mix(grass, cGrassWarm, smoothstep(0.5, 0.74, nA.g) * 0.8);
  grass = mix(grass, cGrassDark, smoothstep(0.58, 0.8, nB.r) * 0.45);
  grass *= (gt * 1.5 + 0.25) * (gt2 * 0.7 + 0.65);
  // 零星的小白花/亮草尖(远看的点缀)
  float fleck = smoothstep(0.83, 0.9, nB.b) * smoothstep(0.52, 0.6, nA.b);
  grass += vec3(0.5, 0.5, 0.3) * fleck * 0.35;
  vec3 albedo = grass;

  // ── 野区泥土：通道中央踩实成土路，靠墙处保留草 ──
  vec3 dt = texture2D(tDirt, wp * 0.238).rgb * 2.0;
  float corridor = smoothstep(0.9, 3.0, dSolid);
  float dirtN = nB.r * 0.55 + nA.g * 0.45;
  float dirtMask = smoothstep(0.47, 0.6, dirtN + corridor * 0.12 - 0.06) * corridor;
  // 营地空地与草丛下的泥土
  float clearing = 1.0 - smoothstep(-0.8, 1.6, dCamp + (nB.g - 0.5) * 2.2);
  float bushSoil = 1.0 - smoothstep(-0.1, 0.55, dBush + (nB.b - 0.5) * 0.5);
  dirtMask = max(dirtMask * 0.85, clearing * 0.9);
  vec3 dirt = mix(cDirt, cLaneEarth, nA.b) * dt;
  albedo = mix(albedo, dirt, dirtMask);
  albedo = mix(albedo, cGrassDark * (gt * 1.2 + 0.3) * 0.62, bushSoil * 0.85);

  // ── 兵线石板路：中间铺满，越靠边石板越稀疏，露出夯土，再过渡到草 ──
  float laneN = (nB.g - 0.5) * 1.5 + (nB.b - 0.5) * 0.5;
  float dl = dLane + laneN;
  // tStone：r = 石面明暗，g = 石面蒙版，b = 每块石头的随机 id
  vec3 st = texture2D(tStone, wp * 0.125).rgb;
  float keepT = smoothstep(-2.6, 0.45, dl);
  float isStone = smoothstep(0.3, 0.7, st.g) * step(keepT * keepT, st.b);
  float earth = 1.0 - smoothstep(-0.25, 0.75, dl);
  vec3 laneEarth = cLaneEarth * dt * (0.84 + 0.22 * nA.b);
  vec3 laneStone = mix(cLane, cLaneAlt, st.b) * st.r * 2.0 * (0.92 + 0.16 * nA.g);
  albedo = mix(albedo, laneEarth, earth);
  float stoneMask = isStone * (1.0 - smoothstep(-0.1, 0.5, dl));

  // ── 基地地台 / 塔座：方砖 + 金属嵌线 + 发光星纹 ──
  float team = step(0.0, wp.x - wp.y);
  vec3 pz = texture2D(tPlaza, wp * 0.2273).rgb;
  float plazaMask = 1.0 - smoothstep(-0.12, 0.06, dBase);
  float padMask = (1.0 - smoothstep(-0.25, 0.25, dPad + (nB.g - 0.5) * 0.5)) * (1.0 - plazaMask);
  vec3 bStone = team > 0.5 ? cBaseStone[1] : cBaseStone[0];
  vec3 bTrim = team > 0.5 ? cBaseTrim[1] : cBaseTrim[0];
  vec3 bGlow = team > 0.5 ? cBaseGlow[1] : cBaseGlow[0];
  vec3 plaza = bStone * pz.r * 2.0 * (0.9 + 0.2 * nA.g);
  plaza = mix(plaza, bTrim, pz.g);
  // 地台边缘的石沿与金线
  float rim = smoothstep(-0.95, -0.8, dBase) * (1.0 - smoothstep(-0.12, 0.0, dBase));
  float rimLine = smoothstep(-0.62, -0.55, dBase) * (1.0 - smoothstep(-0.47, -0.4, dBase));
  plaza = mix(plaza, bStone * 0.72 * (0.6 + 0.8 * st.r), rim * plazaMask);
  plaza = mix(plaza, bTrim, rimLine * plazaMask);
  vec3 emissive = bGlow * pz.b * plazaMask * (1.3 + 0.5 * sin(uTime * 1.6 + wp.x * 0.35 + wp.y * 0.27));

  albedo = mix(albedo, laneStone, stoneMask * (1.0 - plazaMask));
  // 塔座：石板换成偏队伍石色的铺装底(星纹由贴花叠在上面)
  albedo = mix(albedo, mix(laneStone, bStone * st.r * 2.0, 0.65), padMask * smoothstep(0.3, 0.7, st.g));
  albedo = mix(albedo, plaza, plazaMask);

  // ── 河床 ──
  float depth = max(0.0, -vWorldPos.y);
  float dr = dRiver + (nB.g - 0.5) * 0.7;
  float bedMask = 1.0 - smoothstep(-0.25, 0.55, dr);
  float under = smoothstep(uWaterLevel + 0.02, uWaterLevel - 0.1, vWorldPos.y);
  vec3 bed = mix(cSand, cBedDeep, smoothstep(0.12, 0.5, depth));
  bed *= 0.8 + 0.4 * nB.g;
  // 河底卵石
  float pebble = smoothstep(0.34, 0.22, texture2D(tNoise, wp * 0.21).a);
  bed = mix(bed, bed * vec3(0.62, 0.7, 0.8), pebble * 0.7);
  // 渡口：水下仍能看到石板
  float ford = stoneMask * 0.8 + plazaMask;
  albedo = mix(albedo, mix(bed, albedo * vec3(0.72, 0.9, 0.98), ford), bedMask * (1.0 - plazaMask));
  // 岸边湿土
  float wet = (1.0 - smoothstep(0.2, 1.3, dr)) * (1.0 - under);
  albedo *= 1.0 - 0.3 * wet;

  #if DETAIL >= 1
  if (under > 0.01) {
    // 焦散：两层细胞噪声相减得到流动的光网
    float t = uTime;
    float c1 = texture2D(tNoise, wp * 0.085 + vec2(t * 0.011, t * 0.008)).a;
    float c2 = texture2D(tNoise, wp * 0.117 - vec2(t * 0.009, -t * 0.012) + 0.37).a;
    float caust = smoothstep(0.72, 1.0, 1.0 - abs(c1 - c2) * 2.6);
    albedo += vec3(0.35, 0.6, 0.62) * caust * under * 0.42;
    #if DETAIL >= 2
    // 水底星屑：稀疏的发光碎晶，缓慢闪烁
    vec4 sn = texture2D(tNoise, wp * 0.147 + 0.63);
    float cluster = smoothstep(0.5, 0.7, nA.b + nB.r * 0.4);
    float spark = smoothstep(0.2, 0.02, sn.a) * cluster;
    float tw = 0.6 + 0.4 * sin(t * 2.3 + sn.g * 40.0 + wp.x);
    emissive += cStar * spark * tw * 3.2 * under;
    #endif
  }
  #endif

  // ── 光照 ──
  vec3 N = normalize(vNormal);
  vec3 L = kitSunDir();
  float ndl = max(dot(N, L), 0.0);
  float shadow = kitShadow();
  // 墙脚/草丛根部的接触阴影
  float ao = mix(0.5, 1.0, smoothstep(-0.1, 1.5, dSolid)) * mix(0.82, 1.0, smoothstep(-0.4, 0.5, dBush));
  float contact = mix(0.72, 1.0, smoothstep(0.0, 0.7, dSolid));
  vec3 irradiance = kitAmbient(N) * ao + kitSunColor() * (ndl * shadow * contact) + kitPointLights(N, -vViewPosition);
  vec3 col = albedo * RECIPROCAL_PI * irradiance;
  // 暗部偏冷
  col *= mix(vec3(0.86, 0.92, 1.08), vec3(1.0), shadow * contact);
  col += emissive;
  gl_FragColor = vec4(col, 1.0);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

export interface Ground {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  setQuality(q: QualitySettings): void;
}

/** 地表网格：粗格 4m；河道附近细分到 0.5m 并下沉 */
function buildGroundGeometry(field: MapField): THREE.BufferGeometry {
  const bound = field.map.bound;
  const cell = 4;
  const x0 = -Math.ceil((bound + 1.2) / cell) * cell;
  const x1 = -x0;
  // 南侧只铺到边界外一点(再往南是下沉的外缘台地)，北/东/西多铺一格压在外缘崖体下面
  const zMaxLimit = bound + 0.6;
  const sub = 4;
  const pos: number[] = [];
  const idx: number[] = [];
  const vmap = new Map<number, number>();
  const key = (x: number, z: number): number => Math.round((x - x0) * 8) * 8192 + Math.round((z - x0) * 8);
  const vert = (x: number, z: number): number => {
    const zc = Math.min(z, zMaxLimit);
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
    if (az >= zMaxLimit) return;
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

export function createGround(field: MapField, splat: SplatTextures, noise: THREE.Texture, q: QualitySettings, maxAniso: number): Ground {
  const grass = makeGrassTexture(512);
  const dirt = makeDirtTexture(512);
  const plaza = makePlazaTexture(512);
  const stone = getStoneDataTexture();
  for (const t of [grass, dirt, plaza, stone]) t.anisotropy = Math.min(8, maxAniso);
  const E = PALETTE.env;
  const col = (hex: number, mul = 1): THREE.Color => new THREE.Color(hex).multiplyScalar(mul);
  const material = new THREE.ShaderMaterial({
    uniforms: litUniforms({
      tSplatA: { value: splat.a },
      tSplatB: { value: splat.b },
      tNoise: { value: noise },
      tGrass: { value: grass },
      tStone: { value: stone },
      tDirt: { value: dirt },
      tPlaza: { value: plaza },
      uTime: SHARED.uTime,
      uSplatScale: { value: 1 / (SPLAT_EXTENT * 2) },
      uWaterLevel: { value: WATER_LEVEL },
      cGrass: { value: col(E.grass) },
      cGrassWarm: { value: col(E.grassWarm) },
      cGrassCool: { value: col(E.grassCool) },
      cGrassDark: { value: col(E.grassDark) },
      cLane: { value: col(E.lane) },
      cLaneAlt: { value: col(0xc9b9a2) },
      cLaneEarth: { value: col(E.laneDark) },
      cDirt: { value: col(E.dirt) },
      cSand: { value: col(E.sand) },
      cBedDeep: { value: col(0x3f9fb8) },
      cStar: { value: col(0x9ff0ff) },
      cBaseStone: { value: [col(PALETTE.blue.stone, 0.92), col(PALETTE.red.stone)] },
      cBaseTrim: { value: [col(PALETTE.blue.trim), col(PALETTE.red.trim)] },
      cBaseGlow: { value: [col(PALETTE.blue.glow), col(PALETTE.red.glow)] },
    }),
    defines: { DETAIL: q.groundDetail },
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
    setQuality(s) {
      if (material.defines.DETAIL !== s.groundDetail) {
        material.defines.DETAIL = s.groundDetail;
        material.needsUpdate = true;
      }
    },
  };
}

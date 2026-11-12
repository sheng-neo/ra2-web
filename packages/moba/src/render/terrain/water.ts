/**
 * 河道水面：沿河道中心线的一条半透明带。水体的颜色(按水深吸收)、折射、焦散都由地表着色器画在河床上，
 * 水面这一层只负责：很薄的一层水色、天光反射、太阳碎闪、岸边两条泡沫(贴岸一进一退的拍岸沫 + 顺流漂移的碎沫)，
 * 以及两个史诗潭的加深与缓慢旋涡。所以它比以前透得多，河底看得清。
 * 画质(WATER)：0 = 一条泡沫、无碎闪；1 = 两条泡沫；2 = 再加碎闪与潭内旋涡。
 */
import * as THREE from 'three';
import type { QualitySettings } from '../engine/quality';
import { GLSL_LIGHT_PARS_FRAGMENT, GLSL_LIGHT_PARS_VERTEX, GLSL_LIGHT_TINT, GLSL_LIGHT_VERTEX_TAIL, GLSL_OUTPUT_FRAGMENT, PALETTE, SHARED, litUniforms } from '../materials';
import { type MapField, SPLAT_EXTENT, SPLAT_RANGE, type SplatTextures, WATER_LEVEL, campRadius } from './field';
import { riverFlow } from './ground';

const VERTEX = /* glsl */ `
${GLSL_LIGHT_PARS_VERTEX}
varying vec3 vWorldPos;
varying vec3 vViewPosition;
void main() {
  vec3 objectNormal = vec3(0.0, 1.0, 0.0);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  ${GLSL_LIGHT_VERTEX_TAIL}
}
`;

const FRAGMENT = /* glsl */ `
${GLSL_LIGHT_PARS_FRAGMENT}
${GLSL_LIGHT_TINT}
uniform sampler2D tNoise;
uniform sampler2D tSplatA;
uniform float uTime;
uniform float uSplatScale;
uniform vec2 uFlow;
uniform vec3 uShadeTintGround;
uniform vec3 cShallow;
uniform vec3 cDeep;
uniform vec3 cPit;
uniform vec3 cSky;
uniform vec3 cFoam;
uniform vec3 uPits[2];
varying vec3 vWorldPos;
varying vec3 vViewPosition;
const float TAU = 6.2831853;
void main() {
  vec2 wp = vWorldPos.xz;
  vec4 sa = texture2D(tSplatA, wp * uSplatScale + 0.5);
  float shore = -(sa.g - 0.5) * ${(SPLAT_RANGE.river * 2).toFixed(1)};
  float dLane = (sa.r - 0.5) * ${(SPLAT_RANGE.lane * 2).toFixed(1)};
  float t = uTime;
  vec4 n1 = texture2D(tNoise, wp * 0.061 - uFlow * t * 0.022);
  vec4 n2 = texture2D(tNoise, wp * 0.113 - uFlow * t * 0.041 + vec2(0.37, 0.71));
  // 波纹法线(世界空间 → 视图空间)
  vec3 Nw = normalize(vec3((n1.g - 0.5) * 0.4 + (n2.b - 0.5) * 0.3, 1.0, (n1.b - 0.5) * 0.4 + (n2.g - 0.5) * 0.3));
  vec3 N = normalize((viewMatrix * vec4(Nw, 0.0)).xyz);
  vec3 V = normalize(vViewPosition);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  float ford = 1.0 - smoothstep(-1.2, 0.8, dLane);
  float depthF = smoothstep(0.1, 2.8, shore) * (1.0 - 0.32 * ford);
  // 河心的水色往浅色收一点(对色：河水中段 L* 60~64)
  vec3 tint = mix(cShallow, cDeep, depthF * 0.86);
  float alpha = mix(0.1, 0.4, depthF);

  // 两个史诗潭：水色加深(河底几乎看不见，突出潭的深)
  float pit = 0.0;
  vec2 pq = vec2(0.0);
  for (int i = 0; i < 2; i++) {
    vec2 d = wp - uPits[i].xy;
    float k = 1.0 - smoothstep(uPits[i].z * 0.72, uPits[i].z * 1.22, length(d));
    if (k > pit) {
      pit = k;
      pq = d;
    }
  }
  tint = mix(tint, cPit, pit * 0.9);
  alpha = mix(alpha, 0.74, pit * 0.85);

  float shadow = kitShadow();
  vec3 sun = kitSunColor();
  vec3 L = kitSunDir();
  vec3 amb = kitTintAmbient(kitAmbient(N), kitLightTint(wp));
  vec3 irr = amb + sun * max(dot(N, L), 0.0) * shadow;
  vec3 col = tint * RECIPROCAL_PI * irr;
  // 大块缓慢流动的明暗水纹：手绘感的浅色涡流
  float swirl = texture2D(tNoise, vec2(dot(wp, vec2(-uFlow.y, uFlow.x)) * 0.05, dot(wp, uFlow) * 0.018 - t * 0.012)).r;
  float swirl2 = texture2D(tNoise, vec2(dot(wp, vec2(-uFlow.y, uFlow.x)) * 0.11 + 0.4, dot(wp, uFlow) * 0.04 - t * 0.02)).g;
  float band = smoothstep(0.5, 0.68, swirl * 0.6 + swirl2 * 0.4);
  col = mix(col, col * 1.25 + vec3(0.015, 0.035, 0.035), band * 0.5 * depthF);
  alpha += band * 0.06 * depthF;
  #if WATER >= 2
  if (pit > 0.01) {
    // 潭内旋涡：极坐标里缓慢旋进的亮纹
    float pr = length(pq);
    float pa = atan(pq.y, pq.x) / TAU;
    float sw = texture2D(tNoise, vec2(pa * 2.0 + pr * 0.11 - t * 0.02, pr * 0.085 + t * 0.012)).g;
    float streak = smoothstep(0.5, 0.62, sw) * (1.0 - smoothstep(0.62, 0.78, sw));
    col += tint * RECIPROCAL_PI * irr * streak * pit * 1.1;
    alpha += streak * pit * 0.1;
  }
  #endif
  // 天光反射
  col = mix(col, cSky * (0.55 + 0.45 * shadow), fres * 0.5);
  alpha = mix(alpha, 0.85, fres * 0.6);

  #if WATER >= 2
  // 太阳碎闪：只在水纹亮带上零星出现
  vec3 H = normalize(L + V);
  float sp = pow(max(dot(N, H), 0.0), 220.0);
  float glint = smoothstep(0.3, 0.8, sp) * shadow * (0.25 + 0.75 * band);
  col += sun * glint * 0.9;
  alpha = max(alpha, glint);
  #endif

  // ── 泡沫 ──
  float fn = n1.r * 0.6 + n2.r * 0.4;
  // 拍岸沫：贴着水线，宽度被噪声撕碎，3.5 秒一个进退约 0.25 米的周期
  float lap = 0.125 + 0.125 * sin(t * (TAU / 3.5) + fn * 5.0 + dot(wp, vec2(0.23, 0.17)));
  float edgeW = 0.1 + 0.22 * fn + lap * 0.8;
  float edge = 1.0 - smoothstep(edgeW * 0.45, edgeW, shore - 0.3);
  float foam = edge * (0.5 + 0.5 * n2.b);
  // 向岸推进的一道细浪
  foam += smoothstep(0.72, 0.93, sin((shore - t * 0.3) * 5.0 + fn * 8.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.45, 1.5, shore)) * 0.34;
  #if WATER >= 1
  // 漂沫：顺流漂移的碎沫，成簇，靠岸处多
  // (沿流向拉长的噪声取细带：一缕一缕的，不是点)
  vec2 fuv = vec2(dot(wp, vec2(-uFlow.y, uFlow.x)) * 0.36, dot(wp, uFlow) * 0.06 - t * 0.021);
  vec4 fl = texture2D(tNoise, fuv);
  float clump = smoothstep(0.52, 0.7, n1.r * 0.7 + (1.0 - smoothstep(0.4, 2.2, shore)) * 0.3);
  float streak = (1.0 - smoothstep(0.015, 0.05, abs(fl.b - 0.5))) * smoothstep(0.5, 0.64, fl.g);
  foam += streak * clump * 0.42 * (1.0 - pit * 0.7);
  #endif
  foam = clamp(foam, 0.0, 1.0);
  vec3 foamCol = cFoam * RECIPROCAL_PI * (amb + sun * shadow * 0.9);
  col = mix(col, foamCol, foam);
  alpha = max(alpha, foam * 0.78);
  col *= mix(uShadeTintGround, vec3(1.0), shadow);
  // 边界淡出：水面带两侧多出来的部分不应盖住岸
  alpha *= smoothstep(-0.9, -0.3, shore);

  gl_FragColor = vec4(col, alpha);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

export interface Water {
  mesh: THREE.Mesh;
  setQuality(q: QualitySettings): void;
}

export function createWater(field: MapField, splat: SplatTextures, noise: THREE.Texture, q: QualitySettings): Water {
  const line = field.riverLine;
  const half = field.map.riverWidth / 2 + 0.6;
  const bound = field.map.bound;
  const pos: number[] = [];
  const idx: number[] = [];
  // 沿中心线每 3 米一段；只保留可走范围内(加一点余量)的部分
  for (let s = 0; s < line.length - 1; s++) {
    const a = line[s];
    const b = line[s + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    const segs = Math.ceil(len / 3);
    for (let i = 0; i < segs; i++) {
      const t0 = (i / segs) * len;
      const t1 = ((i + 1) / segs) * len;
      const cx = a.x + (dx * (t0 + t1)) / 2;
      const cy = a.y + (dy * (t0 + t1)) / 2;
      if (Math.max(Math.abs(cx), Math.abs(cy)) > bound + 3) continue;
      const base = pos.length / 3;
      for (const t of [t0, t1]) {
        for (const side of [-1, 1]) {
          const x = a.x + dx * t - dy * half * side;
          const z = a.y + dy * t + dx * half * side;
          // 夹到边界内：越界部分由外缘地形/瀑布负责
          pos.push(Math.max(-bound, Math.min(bound, x)), WATER_LEVEL, Math.max(-bound, Math.min(bound, z)));
        }
      }
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const E = PALETTE.env;
  // 两个史诗潭(都在河道里)：x, z, 半径
  const pits = field.map.camps.filter((c) => c.monsterType === 'abyss_drake' || c.monsterType === 'star_colossus').map((c) => new THREE.Vector3(c.pos.x, c.pos.y, campRadius(c.monsterType)));
  while (pits.length < 2) pits.push(new THREE.Vector3(9999, 9999, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: litUniforms({
      tNoise: { value: noise },
      tSplatA: { value: splat.a },
      uTime: SHARED.uTime,
      uSplatScale: { value: 1 / (SPLAT_EXTENT * 2) },
      uFlow: { value: riverFlow(field) },
      cShallow: { value: new THREE.Color(E.waterShallow) },
      cDeep: { value: new THREE.Color(E.water) },
      cPit: { value: new THREE.Color(0x14406e) },
      cSky: { value: new THREE.Color(0xdff4ff) },
      cFoam: { value: new THREE.Color(E.foam) },
      uPits: { value: pits.slice(0, 2) },
    }),
    defines: { WATER: q.waterDetail },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    lights: true,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'water';
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return {
    mesh,
    setQuality(s) {
      if (material.defines.WATER !== s.waterDetail) {
        material.defines.WATER = s.waterDetail;
        material.needsUpdate = true;
      }
    },
  };
}

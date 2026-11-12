/**
 * 河道水面：沿河道中心线的一条半透明带。清澈的青蓝浅水——岸边浅而透、白色水沫，河心稍深；
 * 流动的波纹法线带来菲涅尔天光与太阳碎闪。水下的河床/焦散/星屑由地表 shader 负责。
 */
import * as THREE from 'three';
import { GLSL_LIGHT_PARS_FRAGMENT, GLSL_LIGHT_PARS_VERTEX, GLSL_LIGHT_VERTEX_TAIL, GLSL_OUTPUT_FRAGMENT, PALETTE, SHARED, litUniforms } from '../materials';
import { type MapField, SPLAT_EXTENT, SPLAT_RANGE, type SplatTextures, WATER_LEVEL } from './field';

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
uniform sampler2D tNoise;
uniform sampler2D tSplatA;
uniform float uTime;
uniform float uSplatScale;
uniform vec2 uFlow;
uniform vec3 cShallow;
uniform vec3 cDeep;
uniform vec3 cSky;
uniform vec3 cFoam;
varying vec3 vWorldPos;
varying vec3 vViewPosition;
void main() {
  vec2 wp = vWorldPos.xz;
  vec4 sa = texture2D(tSplatA, wp * uSplatScale + 0.5);
  float shore = -(sa.g - 0.5) * ${(SPLAT_RANGE.river * 2).toFixed(1)};
  float dLane = (sa.r - 0.5) * ${(SPLAT_RANGE.lane * 2).toFixed(1)};
  float t = uTime;
  vec4 n1 = texture2D(tNoise, wp * 0.061 - uFlow * t * 0.022);
  vec4 n2 = texture2D(tNoise, wp * 0.113 - uFlow * t * 0.041 + vec2(0.37, 0.71));
  // 波纹法线(世界空间 → 视图空间)
  vec3 Nw = normalize(vec3((n1.g - 0.5) * 0.55 + (n2.b - 0.5) * 0.4, 1.0, (n1.b - 0.5) * 0.55 + (n2.g - 0.5) * 0.4));
  vec3 N = normalize((viewMatrix * vec4(Nw, 0.0)).xyz);
  vec3 V = normalize(vViewPosition);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  float ford = 1.0 - smoothstep(-1.2, 0.8, dLane);
  float depthF = smoothstep(0.1, 2.6, shore) * (1.0 - 0.45 * ford);
  vec3 tint = mix(cShallow, cDeep, depthF);
  float alpha = mix(0.16, 0.6, depthF);

  float shadow = kitShadow();
  vec3 sun = kitSunColor();
  vec3 L = kitSunDir();
  vec3 irr = kitAmbient(N) + sun * max(dot(N, L), 0.0) * shadow;
  vec3 col = tint * RECIPROCAL_PI * irr;
  // 天光反射
  col = mix(col, cSky * (0.55 + 0.45 * shadow), fres * 0.55);
  alpha = mix(alpha, 0.85, fres * 0.6);

  // 太阳碎闪：阈值化的高光，星星点点
  vec3 H = normalize(L + V);
  float sp = pow(max(dot(N, H), 0.0), 90.0);
  float glint = smoothstep(0.35, 0.75, sp) * shadow;
  col += sun * glint * 0.9;
  alpha = max(alpha, glint * 0.9);

  // 岸边水沫：一条被噪声撕碎的白边 + 向岸推进的细浪
  float fn = n1.r * 0.6 + n2.r * 0.4;
  float edge = 1.0 - smoothstep(0.0, 0.5, shore - 0.22 + (fn - 0.5) * 0.7);
  float wave = smoothstep(0.62, 0.9, sin((shore - t * 0.35) * 5.5 + fn * 9.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.5, 1.7, shore)) * 0.45;
  // 河心的流水纹
  float streak = smoothstep(0.66, 0.82, texture2D(tNoise, vec2(dot(wp, vec2(-uFlow.y, uFlow.x)) * 0.19, dot(wp, uFlow) * 0.027 - t * 0.045)).g) * smoothstep(1.2, 2.6, shore) * 0.2;
  float foam = clamp(edge * (0.55 + 0.45 * n2.b) + wave + streak, 0.0, 1.0);
  vec3 foamCol = cFoam * RECIPROCAL_PI * (kitAmbient(N) + sun * shadow * 0.9);
  col = mix(col, foamCol, foam);
  alpha = max(alpha, foam * 0.9);
  // 边界淡出：水面带两侧多出来的部分不应盖住岸
  alpha *= smoothstep(-0.9, -0.3, shore);

  gl_FragColor = vec4(col, alpha);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

export function createWater(field: MapField, splat: SplatTextures, noise: THREE.Texture): THREE.Mesh {
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
      const cx = a.x + dx * (t0 + t1) / 2;
      const cy = a.y + dy * (t0 + t1) / 2;
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
  const first = line[0];
  const last = line[line.length - 1];
  const flow = new THREE.Vector2(last.x - first.x, last.y - first.y).normalize();
  const material = new THREE.ShaderMaterial({
    uniforms: litUniforms({
      tNoise: { value: noise },
      tSplatA: { value: splat.a },
      uTime: SHARED.uTime,
      uSplatScale: { value: 1 / (SPLAT_EXTENT * 2) },
      uFlow: { value: flow },
      cShallow: { value: new THREE.Color(0x8ff0ee) },
      cDeep: { value: new THREE.Color(0x2f9fd0) },
      cSky: { value: new THREE.Color(0xdff4ff) },
      cFoam: { value: new THREE.Color(PALETTE.env.foam) },
    }),
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
  return mesh;
}

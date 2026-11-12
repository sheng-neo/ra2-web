/**
 * 远景：渐变天穹、高原下方流动的云海、云海中升起的远山与浮空岩屿。
 * 对局镜头俯角大，基本只在地图边角瞥见云海；俯瞰/过场镜头下它们保证画面不穿帮。
 */
import * as THREE from 'three';
import { SUN_DIR } from '../engine/lighting';
import { GLSL_NOISE, GLSL_OUTPUT_FRAGMENT, PALETTE, Rng, SHARED, createToonMaterial, fbm2, hash2 } from '../materials';
import { MeshBuilder, type RGB, mixRgb, rgb, scaleRgb } from './geo';

const CLOUD_Y = -46;

function createDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(820, 24, 12);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      cHorizon: { value: new THREE.Color(PALETTE.env.horizon) },
      cZenith: { value: new THREE.Color(PALETTE.env.zenith) },
      cFog: { value: new THREE.Color(PALETTE.env.fog) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 cHorizon;
      uniform vec3 cZenith;
      uniform vec3 cFog;
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 col = mix(cHorizon, cZenith, smoothstep(0.0, 0.55, h));
        col = mix(col, cFog, smoothstep(0.06, -0.12, h));
        gl_FragColor = vec4(col, 1.0);
        ${GLSL_OUTPUT_FRAGMENT}
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky-dome';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

function createCloudSea(): THREE.Mesh {
  const geo = new THREE.CircleGeometry(900, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: SHARED.uTime,
      uSunXZ: { value: new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize() },
      cLight: { value: new THREE.Color(PALETTE.env.cloud) },
      cShade: { value: new THREE.Color(PALETTE.env.cloudShade) },
      cDeep: { value: new THREE.Color(0x7fa6d8) },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      uniform float uTime;
      uniform vec2 uSunXZ;
      uniform vec3 cLight;
      uniform vec3 cShade;
      uniform vec3 cDeep;
      varying vec3 vWorldPos;
      void main() {
        vec2 p = vWorldPos.xz * 0.012;
        vec2 drift = vec2(uTime * 0.006, uTime * 0.0035);
        float n = fbm(p + drift);
        float n2 = fbm(p * 2.7 - drift * 1.6 + 7.3);
        float c = n * 0.65 + n2 * 0.35;
        // 云团：亮顶、蓝灰的谷；朝向太阳的一侧镶暖亮边，背光一侧压暗
        float lit = n - fbm(p + drift + uSunXZ * 0.045);
        vec3 col = mix(cDeep, cShade, smoothstep(0.25, 0.5, c));
        col = mix(col, cLight, smoothstep(0.45, 0.72, c));
        col += vec3(1.0, 0.93, 0.8) * clamp(lit * 3.4, -0.1, 0.24);
        // 高空更大一层云缓慢投下的云影
        float sh = fbm(p * 0.35 - drift * 0.6 + 3.1);
        col *= 1.0 - 0.16 * smoothstep(0.5, 0.72, sh);
        gl_FragColor = vec4(col * 1.05, 1.0);
        ${GLSL_OUTPUT_FRAGMENT}
      }
    `,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = CLOUD_Y;
  mesh.name = 'cloud-sea';
  mesh.frustumCulled = false;
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** 一座山峰：带噪声的多棱锥，雪线以上变白 */
function addPeak(b: MeshBuilder, cx: number, cz: number, radius: number, height: number, seed: number, base: RGB, snow: RGB): void {
  const sides = 9;
  const tiers = 4;
  const rows: number[][] = [];
  for (let k = 0; k <= tiers; k++) {
    const t = k / tiers;
    const row: number[] = [];
    const y = CLOUD_Y - 12 + (height + 12) * t;
    const r = radius * Math.pow(1 - t, 0.85) + (k === tiers ? 0 : radius * 0.03);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + seed;
      const rr = r * (0.78 + hash2(s + k * 13, seed * 100, 7) * 0.5);
      const yy = y + (k > 0 && k < tiers ? (hash2(s, k + seed * 50, 9) - 0.5) * height * 0.16 : 0);
      const snowT = Math.min(1, Math.max(0, (t - 0.52) * 3.5 + (hash2(s, k, 11) - 0.5) * 0.4));
      const c = mixRgb(scaleRgb(base, 0.8 + t * 0.35), snow, snowT);
      row.push(b.vertex(cx + Math.cos(a) * rr, yy, cz + Math.sin(a) * rr, c));
    }
    rows.push(row);
  }
  for (let k = 0; k < tiers; k++) {
    for (let s = 0; s < sides; s++) {
      const s2 = (s + 1) % sides;
      b.quad(rows[k][s], rows[k + 1][s], rows[k + 1][s2], rows[k][s2]);
    }
  }
}

/** 远山环 + 近处的浮空岩屿(顶上带一小片草) */
function createMountains(): THREE.Mesh {
  // 远山自己的材质：按面着色的两阶明暗，不吃环境染色(远在染色贴图覆盖范围之外)
  const material = createToonMaterial({ vertexColors: true, flat: true, steps: 2, softness: 0.14, rim: 0, lightTint: false, glowBoost: 1.1 });
  const b = new MeshBuilder();
  const rng = new Rng(8086);
  const base = rgb(0x6f86b8);
  const snow = rgb(0xf2f7ff);
  const count = 34;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.range(-0.06, 0.06);
    const dist = rng.range(240, 430);
    const h = rng.range(70, 190) * (0.7 + 0.5 * fbm2(Math.cos(a) * 2, Math.sin(a) * 2, 2, 5));
    addPeak(b, Math.cos(a) * dist, Math.sin(a) * dist, h * rng.range(0.55, 0.85), h, rng.next() * 6.28, base, snow);
  }
  // 浮空岩屿：倒锥形的岩块，顶面长草
  const rock = rgb(0x7c8497);
  const rockDark = rgb(0x4d566e);
  const grass = rgb(0x6aad4e);
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, Math.PI * 2);
    const dist = rng.range(112, 190);
    const cx = Math.cos(a) * dist;
    const cz = Math.sin(a) * dist;
    const r = rng.range(5, 13);
    const top = rng.range(-16, 6);
    const depth = r * rng.range(1.2, 2.0);
    const sides = 8;
    const ringTop: number[] = [];
    const ringMid: number[] = [];
    const center = b.vertex(cx, top + 0.6, cz, grass);
    const tip = b.vertex(cx + rng.range(-1, 1), top - depth, cz + rng.range(-1, 1), rockDark);
    for (let s = 0; s < sides; s++) {
      const sa = (s / sides) * Math.PI * 2;
      const rr = r * rng.range(0.8, 1.15);
      ringTop.push(b.vertex(cx + Math.cos(sa) * rr, top + rng.range(-0.3, 0.3), cz + Math.sin(sa) * rr, mixRgb(grass, rock, 0.35)));
      ringMid.push(b.vertex(cx + Math.cos(sa) * rr * 0.72, top - depth * 0.4, cz + Math.sin(sa) * rr * 0.72, rock));
    }
    for (let s = 0; s < sides; s++) {
      const s2 = (s + 1) % sides;
      b.tri(center, ringTop[s2], ringTop[s]);
      b.quad(ringTop[s], ringTop[s2], ringMid[s2], ringMid[s]);
      b.tri(ringMid[s], ringMid[s2], tip);
    }
  }
  // 地标：东北远山里嵌着一块倾斜的巨型坠星晶体(微光)，只在上路和北缘能瞥见
  {
    const cx = 150;
    const cz = -205;
    const h = 150;
    const r = 24;
    const lean = new THREE.Vector3(-0.32, 1, 0.22).normalize();
    const sideA = new THREE.Vector3(1, 0, 0).cross(lean).normalize();
    const sideB = lean.clone().cross(sideA).normalize();
    const c0 = rgb(0x4a6ac8);
    const c1 = rgb(0xa8dcff);
    const baseP = new THREE.Vector3(cx, CLOUD_Y - 20, cz);
    const ringLo: number[] = [];
    const ringHi: number[] = [];
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI * 2;
      const dir = sideA.clone().multiplyScalar(Math.cos(a)).addScaledVector(sideB, Math.sin(a));
      const lo = baseP.clone().addScaledVector(dir, r * 0.8);
      const hi = baseP.clone().addScaledVector(lean, h * 0.72).addScaledVector(dir, r);
      ringLo.push(b.vertex(lo.x, lo.y, lo.z, c0, 0, 1, 0, 0, 0.25));
      ringHi.push(b.vertex(hi.x, hi.y, hi.z, mixRgb(c0, c1, 0.6), 0, 1, 0, 0, 0.5));
    }
    const tipP = baseP.clone().addScaledVector(lean, h);
    const tip = b.vertex(tipP.x, tipP.y, tipP.z, c1, 0, 1, 0, 0, 0.8);
    for (let s = 0; s < 6; s++) {
      const s2 = (s + 1) % 6;
      b.quad(ringLo[s], ringHi[s], ringHi[s2], ringLo[s2]);
      b.tri(ringHi[s], tip, ringHi[s2]);
    }
  }
  b.computeNormals();
  const mesh = new THREE.Mesh(b.build(), material);
  mesh.name = 'mountains';
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  return mesh;
}

export function createSky(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sky';
  g.add(createDome(), createCloudSea(), createMountains());
  return g;
}

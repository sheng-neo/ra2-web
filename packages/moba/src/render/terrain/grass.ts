/**
 * 草丛：每个 bushes 多边形内密植一人高的金绿色芦苇/长草。
 * - 叶片只种在多边形内侧，边界清晰(玩家凭视觉判断进没进草)；
 * - 顶点着色器里做风摆，并被附近单位「拨开」(单位进草后仍可辨)；
 * - 玩家英雄所在位置附近的叶片用抖动镂空变得通透。
 * 每个草丛一个网格(可被视锥剔除)，叶片顺序打乱，低画质用 drawRange 只画一部分。
 */
import * as THREE from 'three';
import { pointInPolygon } from '../../core/map';
import type { Polygon } from '../../core/types';
import type { QualitySettings } from '../engine/quality';
import { GLSL_DITHER, GLSL_LIGHT_PARS_FRAGMENT, GLSL_LIGHT_PARS_VERTEX, GLSL_LIGHT_VERTEX_TAIL, GLSL_OUTPUT_FRAGMENT, GLSL_WIND, PALETTE, Rng, litUniforms, SHARED } from '../materials';
import { type MapField, polygonSignedDist } from './field';
import { MeshBuilder, type RGB, mixRgb, rgb, scaleRgb } from './geo';

/** 同时参与「拨草」的单位上限 */
export const MAX_PUSHERS = 8;

const VERTEX = /* glsl */ `
${GLSL_LIGHT_PARS_VERTEX}
${GLSL_WIND}
attribute vec3 color;
attribute vec4 aFx;
uniform vec4 uPushers[${MAX_PUSHERS}];
varying vec3 vColor;
varying vec3 vViewPosition;
varying vec3 vWorldPos;
varying float vTip;
void main() {
  vColor = color;
  vTip = aFx.x;
  vec3 objectNormal = normal;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  float w = aFx.x;
  // 被单位拨开：向外推并压低，离得越近越明显
  vec2 push = vec2(0.0);
  float press = 0.0;
  for (int i = 0; i < ${MAX_PUSHERS}; i++) {
    vec4 p = uPushers[i];
    vec2 d = worldPosition.xz - p.xy;
    float dist = length(d);
    float f = 1.0 - smoothstep(p.z * 0.35, p.z, dist);
    push += (d / max(dist, 0.05)) * f * p.w;
    press += f * p.w;
  }
  worldPosition.xz += push * w * 0.55;
  worldPosition.y -= min(press, 1.0) * w * 0.38;
  worldPosition.xyz += windOffset(worldPosition.xyz, w * 0.34);
  vWorldPos = worldPosition.xyz;
  ${GLSL_LIGHT_VERTEX_TAIL}
}
`;

const FRAGMENT = /* glsl */ `
${GLSL_LIGHT_PARS_FRAGMENT}
${GLSL_DITHER}
uniform vec4 uReveal;
varying vec3 vColor;
varying vec3 vViewPosition;
varying vec3 vWorldPos;
varying float vTip;
void main() {
  // 玩家附近的草叶变通透(抖动镂空，不需要透明排序)
  float rv = (1.0 - smoothstep(uReveal.z * 0.45, uReveal.z, length(vWorldPos.xz - uReveal.xy))) * uReveal.w;
  float keep = 1.0 - rv * (0.35 + 0.5 * vTip);
  if (keep < 0.995 && keep <= ditherThreshold(gl_FragCoord.xy)) discard;
  vec3 N = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float shadow = kitShadow();
  vec3 sun = kitSunColor();
  float ndl = max(dot(N, kitSunDir()), 0.0);
  // 叶片薄而透光：暗部不压得太死
  vec3 irr = kitAmbient(N) * (0.75 + 0.25 * vTip) + sun * ndl * (0.35 + 0.65 * shadow) + kitPointLights(N, -vViewPosition);
  vec3 col = vColor * RECIPROCAL_PI * irr;
  // 叶尖的逆光金边
  col += vColor * sun * RECIPROCAL_PI * vTip * vTip * 0.22 * shadow;
  gl_FragColor = vec4(col, 1.0);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

interface BushMesh {
  mesh: THREE.Mesh;
  /** 满密度时的索引数 */
  fullCount: number;
}

export interface Bushes {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  /** 每帧设置拨草的单位(x, z, 半径, 强度) 与玩家透视圈 */
  setPushers(list: ArrayLike<number>, count: number): void;
  setReveal(x: number, z: number, radius: number, strength: number): void;
  setQuality(q: QualitySettings): void;
}

const REED_DARK = rgb(PALETTE.env.reedDark);
const REED = rgb(PALETTE.env.reed);
const REED_TIP = rgb(PALETTE.env.reedTip);
const PLUME = rgb(0xf6edc0);

/** 一片叶：3 段四边形，自下而上变窄并向外弯 */
function addBlade(b: MeshBuilder, x: number, z: number, y0: number, h: number, w: number, dirX: number, dirZ: number, lean: number, hue: number, plume: boolean): void {
  // 叶面朝向与弯曲方向垂直
  const px = -dirZ * w;
  const pz = dirX * w;
  const rows = 4;
  const idx: number[] = [];
  const cBase: RGB = scaleRgb(mixRgb(REED_DARK, REED, 0.15 + hue * 0.2), 0.8);
  const cMid: RGB = mixRgb(REED, scaleRgb(REED, 1.12), hue);
  const cTip: RGB = mixRgb(REED_TIP, scaleRgb(REED, 1.25), hue * 0.5);
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const bend = t * t * lean;
    const cx = x + dirX * bend;
    const cz = z + dirZ * bend;
    const cy = y0 + h * t * (1 - 0.12 * t * Math.abs(lean));
    const ww = (1 - t * 0.82) * (r === rows - 1 ? 0.25 : 1);
    const c = t < 0.5 ? mixRgb(cBase, cMid, t * 2) : mixRgb(cMid, cTip, (t - 0.5) * 2);
    // aFx.x = 弯曲权重(根部 0，梢部 1)
    idx.push(b.vertex(cx - px * ww, cy, cz - pz * ww, c, 0, 1, 0, t * t), b.vertex(cx + px * ww, cy, cz + pz * ww, c, 0, 1, 0, t * t));
  }
  for (let r = 0; r < rows - 1; r++) b.quad(idx[r * 2], idx[r * 2 + 1], idx[r * 2 + 3], idx[r * 2 + 2]);
  if (plume) {
    // 芦花：梢部一片细长的菱形
    const tx = x + dirX * lean;
    const tz = z + dirZ * lean;
    const ty = y0 + h * 0.9;
    const a = b.vertex(tx, ty, tz, PLUME, 0, 1, 0, 0.9);
    const l = b.vertex(tx - px * 1.5, ty + 0.2, tz - pz * 1.5, PLUME, 0, 1, 0, 1);
    const r2 = b.vertex(tx + px * 1.5, ty + 0.2, tz + pz * 1.5, PLUME, 0, 1, 0, 1);
    const top = b.vertex(tx + dirX * 0.08, ty + 0.52, tz + dirZ * 0.08, scaleRgb(PLUME, 1.1), 0, 1, 0, 1);
    b.quad(a, r2, top, l);
  }
}

function buildBush(poly: Polygon, field: MapField, seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  // 抖动网格采样点，再整体打乱顺序(方便按比例裁剪)
  const spacing = 0.2;
  const spots: [number, number][] = [];
  const q = { x: 0, y: 0 };
  for (let y = minY; y <= maxY; y += spacing) {
    for (let x = minX; x <= maxX; x += spacing) {
      q.x = x + rng.range(-0.5, 0.5) * spacing;
      q.y = y + rng.range(-0.5, 0.5) * spacing;
      if (!pointInPolygon(q, poly)) continue;
      if (polygonSignedDist(q, poly) > -0.1) continue;
      // 不种进墙体/边界外
      if (field.solidDist(q.x, q.y) < 0.1) continue;
      spots.push([q.x, q.y]);
    }
  }
  for (let i = spots.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = spots[i];
    spots[i] = spots[j];
    spots[j] = t;
  }
  const b = new MeshBuilder();
  for (const [x, z] of spots) {
    q.x = x;
    q.y = z;
    const edgeDist = -polygonSignedDist(q, poly);
    // 外圈略矮、向外倾，内部高而直：丛的体量感
    const rim = Math.min(1, edgeDist / 0.9);
    const h = (0.95 + rng.range(0, 0.45)) * (0.72 + 0.28 * rim);
    const a = rng.range(0, Math.PI * 2);
    const lean = rng.range(0.1, 0.34);
    const plume = rim > 0.6 && rng.chance(0.045);
    addBlade(b, x, z, field.heightAt(x, z) - 0.03, plume ? h * 1.25 : h, rng.range(0.055, 0.085), Math.cos(a), Math.sin(a), lean, rng.next(), plume);
  }
  return b.build();
}

export function createBushes(field: MapField, q: QualitySettings): Bushes {
  const material = new THREE.ShaderMaterial({
    uniforms: litUniforms({
      uTime: SHARED.uTime,
      uWind: SHARED.uWind,
      uPushers: { value: Array.from({ length: MAX_PUSHERS }, () => new THREE.Vector4(0, 0, 1, 0)) },
      uReveal: { value: new THREE.Vector4(0, 0, 1, 0) },
    }),
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    lights: true,
    fog: true,
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  group.name = 'bushes';
  const list: BushMesh[] = [];
  field.map.bushes.forEach((poly, i) => {
    const geo = buildBush(poly, field, 9000 + i * 17);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `bush:${i}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    // 包围球加大一点：叶片会被风吹出原始范围
    if (geo.boundingSphere) geo.boundingSphere.radius += 0.6;
    group.add(mesh);
    list.push({ mesh, fullCount: geo.index ? geo.index.count : 0 });
  });
  const pushers = material.uniforms.uPushers.value as THREE.Vector4[];
  const applyQuality = (s: QualitySettings): void => {
    for (const bm of list) {
      // 每片叶 18 个索引(普通叶)；按比例取整到三角形边界即可
      const count = Math.floor((bm.fullCount * Math.min(1, s.foliage)) / 3) * 3;
      bm.mesh.geometry.setDrawRange(0, count);
    }
  };
  applyQuality(q);
  return {
    group,
    material,
    setPushers(arr, count) {
      for (let i = 0; i < MAX_PUSHERS; i++) {
        if (i < count) pushers[i].set(arr[i * 4], arr[i * 4 + 1], arr[i * 4 + 2], arr[i * 4 + 3]);
        else pushers[i].w = 0;
      }
    },
    setReveal(x, z, radius, strength) {
      (material.uniforms.uReveal.value as THREE.Vector4).set(x, z, radius, strength);
    },
    setQuality: applyQuality,
  };
}

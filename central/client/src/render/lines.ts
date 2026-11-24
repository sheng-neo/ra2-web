/**
 * 线状图层：电车路轨（每条轨道两根钢轨，轨距 1067 mm）与敏感区边界（暗色虚线，只示意、不可交互）。
 * 路轨画成贴路面的 7 cm 钢条（realism C8）：顶点着色器保证至少约 0.6 像素宽、按覆盖率减淡，远处不闪不断；
 * 钢面带一点路灯色的反光（≤ 0.3）。敏感区虚线默认不加进场景（#zones 才显示，见 city-renderer）。
 */
import {
  BufferAttribute,
  BufferGeometry,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  ShaderMaterial,
} from 'three';
import { GLSL_FINISH_ALPHA, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms } from './materials/lighting';
import type { FlatXY, Rail, SensitiveZone } from '@central/data';
import { simToThree } from '../coords';
import type { HeightFn } from '../data/terrain';
import { cleanRing } from '../geom/ring';
import { drapeResample } from './ribbon';

const HALF_GAUGE_DM = 5.35;
const RAIL_LIFT_DM = 2.5;
const ZONE_LIFT_DM = 6;

function lineGeometry(pos: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeBoundingSphere();
  return g;
}

/** 折线按左右偏移 off（dm）输出线段端点（three 坐标）。 */
function offsetSegments(pts: FlatXY, off: number, z: (x: number, y: number) => number, out: number[]): void {
  const n = pts.length >> 1;
  const p: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(i - 1, 0);
    const b = Math.min(i + 1, n - 1);
    const dx = pts[b * 2]! - pts[a * 2]!;
    const dy = pts[b * 2 + 1]! - pts[a * 2 + 1]!;
    const l = Math.hypot(dx, dy) || 1;
    const x = pts[i * 2]! - (dy / l) * off;
    const y = pts[i * 2 + 1]! + (dx / l) * off;
    const v = [0, 0, 0];
    simToThree(x, y, z(x, y), v);
    p.push(...v);
  }
  for (let i = 0; i + 1 < n; i++) out.push(...p.slice(i * 3, i * 3 + 6));
}

/** 钢轨半宽（m）。 */
const RAIL_HALF_W_M = 0.035;

const RAIL_VERT = /* glsl */ `
${GLSL_SHARED_PARS}
attribute vec3 aLat;   // 横向单位向量（three xz）+ 侧（−1 / +1）
varying float vCover;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float depth = max(-(viewMatrix * world).z, 0.1);
  float pxM = depth / (projectionMatrix[1][1] * 0.5 * uViewportPx.y);
  float hw = max(${RAIL_HALF_W_M.toFixed(3)}, 0.6 * pxM);
  vCover = ${RAIL_HALF_W_M.toFixed(3)} / hw;
  world.xz += aLat.xy * aLat.z * hw;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const RAIL_FRAG = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
uniform vec3 uSheen;
varying float vCover;
varying vec3 vWorld;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  // 抛光钢面：掠射角反射路灯与天光
  float graze = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
  vec3 steel = vec3(0.035, 0.034, 0.033) + uSheen * (0.06 + 0.24 * graze);
  vec3 col = applyHaze(steel, vec3(0.0), vWorld);
  float alpha = clamp(vCover, 0.0, 1.0);
  ${GLSL_FINISH_ALPHA}
}
`;

/** 折线（dm）两侧偏移 off（dm）的钢条中线，写四边形（中线点 + 横向向量，宽度在着色器里定）。 */
function railStrip(pts: FlatXY, off: number, z: (x: number, y: number) => number, pos: number[], lat: number[], idx: number[]): void {
  const n = pts.length >> 1;
  const v = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = Math.max(i - 1, 0);
    const b = Math.min(i + 1, n - 1);
    const dx = pts[b * 2]! - pts[a * 2]!;
    const dy = pts[b * 2 + 1]! - pts[a * 2 + 1]!;
    const l = Math.hypot(dx, dy) || 1;
    // 左法线（模拟）(−dy, dx) → three xz (−dy, −dx)
    const x = pts[i * 2]! - (dy / l) * off;
    const y = pts[i * 2 + 1]! + (dx / l) * off;
    simToThree(x, y, z(x, y), v);
    const base = pos.length / 3;
    for (const side of [-1, 1]) {
      pos.push(v[0]!, v[1]!, v[2]!);
      lat.push(-dy / l, -dx / l, side);
    }
    if (i > 0) idx.push(base - 2, base + 1, base - 1, base - 2, base, base + 1);
  }
}

export function buildRails(rails: readonly Rail[], ground: HeightFn): Mesh | null {
  const pos: number[] = [];
  const lat: number[] = [];
  const idx: number[] = [];
  const z = (x: number, y: number) => ground(x, y) + RAIL_LIFT_DM;
  for (const r of rails) {
    const pts = drapeResample(cleanRing(r.pts), ground, 80);
    if (pts.length < 4) continue;
    railStrip(pts, HALF_GAUGE_DM, z, pos, lat, idx);
    railStrip(pts, -HALF_GAUGE_DM, z, pos, lat, idx);
  }
  if (pos.length === 0) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aLat', new BufferAttribute(new Float32Array(lat), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const material = new ShaderMaterial({
    uniforms: { ...sharedUniforms(), uSheen: { value: lightColour('ledWhite').multiplyScalar(1) } },
    vertexShader: RAIL_VERT,
    fragmentShader: RAIL_FRAG,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const mesh = new Mesh(g, material);
  mesh.name = 'rails';
  mesh.renderOrder = 1;
  return mesh;
}

export function buildZoneOutlines(zones: readonly SensitiveZone[], ground: HeightFn): LineSegments | null {
  const pos: number[] = [];
  const z = (x: number, y: number) => ground(x, y) + ZONE_LIFT_DM;
  for (const zone of zones) {
    for (const ring of [zone.area.outer, ...(zone.area.holes ?? [])]) {
      const r = cleanRing(ring);
      if (r.length < 6) continue;
      const closed = drapeResample([...r, r[0]!, r[1]!], ground, 80);
      offsetSegments(closed, 0, z, pos);
    }
  }
  if (pos.length === 0) return null;
  const lines = new LineSegments(
    lineGeometry(pos),
    new LineDashedMaterial({ color: 0x6f7590, dashSize: 4, gapSize: 3, transparent: true, opacity: 0.55, depthWrite: false, fog: true }),
  );
  lines.computeLineDistances();
  lines.name = 'sensitive-zones';
  return lines;
}

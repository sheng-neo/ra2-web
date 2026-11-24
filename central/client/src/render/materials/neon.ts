/**
 * 静态发光条材质（写实化一轮）：地标的霓虹灯带、边缘 LED 线、塔楼边缘灯，颜色固定、不随时间变（不做灯光秀）。
 * 取代 M0 的变色霓虹与 1 像素 LineSegments。
 *
 * 布局：position（条带中线上的点，three 世界坐标，米）、aOffset（该顶点相对中线的偏移，米）、aEmit（线性发光，已乘亮度）。
 * 细条在远处会小于一个像素而闪烁 / 消失：顶点着色器把屏幕宽度不足 uGlowMinPx × 0.6 像素的条带撑宽到这个宽度，
 * 亮度按撑宽倍数摊薄（保留 25 % 下限），远处仍是一条连续细亮线，近处是真实宽度。
 * 不透明（写深度），片元 applyHaze(0, 发光, 世界坐标)。
 */
import { DoubleSide, ShaderMaterial } from 'three';
import { simToThree } from '../../coords';
import { MeshArrays, type AttrSpec } from '../mesh-arrays';
import { GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, sharedUniforms } from './lighting';

export const NEON_LAYOUT: readonly AttrSpec[] = [
  { name: 'position', size: 3 },
  { name: 'aOffset', size: 3 },
  { name: 'aEmit', size: 3 },
];

export function newNeonArrays(): MeshArrays {
  return new MeshArrays(NEON_LAYOUT);
}

const scratch = new Float32Array(9);

/**
 * 写一个发光条顶点：中线点为模拟坐标（dm），偏移为模拟坐标方向上的米，emit 为线性发光（亮度已乘进去）。
 */
export function neonVertex(
  m: MeshArrays,
  x: number,
  y: number,
  z: number,
  emit: readonly [number, number, number],
  offset: readonly [number, number, number] = [0, 0, 0],
): number {
  simToThree(x, y, z, scratch, 0);
  simToThree(offset[0], offset[1], offset[2], scratch, 3, 1);
  scratch[6] = emit[0];
  scratch[7] = emit[1];
  scratch[8] = emit[2];
  return m.push(scratch);
}

/**
 * 一段发光线（模拟坐标 dm 的两端点）：两片互相垂直的条带组成十字截面，任何方向看都有宽度。
 * halfWidthM：半宽（米）。
 */
export function neonLine(
  m: MeshArrays,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  emit: readonly [number, number, number],
  halfWidthM: number,
): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  const t = [dx / l, dy / l, dz / l];
  // 两个与线垂直、互相垂直的方向
  const ref = Math.abs(t[2]!) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const p1 = cross(t, ref);
  const p2 = cross(t, p1);
  for (const p of [p1, p2]) {
    const o: [number, number, number] = [p[0]! * halfWidthM, p[1]! * halfWidthM, p[2]! * halfWidthM];
    const n: [number, number, number] = [-o[0], -o[1], -o[2]];
    const i0 = neonVertex(m, a[0], a[1], a[2], emit, n);
    const i1 = neonVertex(m, b[0], b[1], b[2], emit, n);
    const i2 = neonVertex(m, b[0], b[1], b[2], emit, o);
    const i3 = neonVertex(m, a[0], a[1], a[2], emit, o);
    m.tri(i0, i1, i2);
    m.tri(i0, i2, i3);
  }
}

function cross(a: readonly number[], b: readonly number[]): number[] {
  const c = [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const l = Math.hypot(c[0]!, c[1]!, c[2]!) || 1;
  return c.map((v) => v / l);
}

const vertexShader = /* glsl */ `
${GLSL_SHARED_PARS}
attribute vec3 aOffset;
attribute vec3 aEmit;
varying vec3 vEmit;
varying vec3 vWorld;
void main() {
  vec3 c = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float depth = max(-mv.z, 0.1);
  float pxPerM = projectionMatrix[1][1] * 0.5 * uViewportPx.y / depth;
  float wPx = 2.0 * length(aOffset) * pxPerM;
  float s = wPx > 0.0 ? max(1.0, uGlowMinPx * 0.6 / wPx) : 1.0;
  vec3 wp = c + aOffset * s;
  vEmit = aEmit * max(1.0 / s, 0.25);
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
varying vec3 vEmit;
varying vec3 vWorld;
void main() {
  vec3 col = applyHaze(vec3(0.0), vEmit, vWorld);
  ${GLSL_FINISH}
}
`;

export function createNeonMaterial(): ShaderMaterial {
  return new ShaderMaterial({ uniforms: sharedUniforms(), vertexShader, fragmentShader, side: DoubleSide });
}

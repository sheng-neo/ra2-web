/**
 * 电车架空线网格（R2 TRAMS T6）：接触线、横跨线、悬臂全部进一个网格（一个 draw call）。
 * 每段线是一条朝向相机的窄带：顶点着色器按「线段方向 × 视线」求横向，宽度 = max(线半径, 0.65 像素)，
 * 再按覆盖率（半径 / 宽度，下限 0.8）给透明度 —— 远处是 1 像素左右的暗线，不闪、不断。
 * 超出 uRange（HIGH 350 m / LOW 150 m）淡出。颜色 #15161a，吃雾；只在路灯正下方有一点去饱和的细反光（R2 修复轮：不再整条染成钠灯色）。
 */
import { BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, Vector3 } from 'three';
import { simToThree } from '../../../coords';
import { GLSL_FINISH_ALPHA, GLSL_HAZE, GLSL_SHARED_PARS, sharedUniforms } from '../../materials/lighting';
import { linearRGB } from '../prop-geometry';
import type { V3 } from './overhead';
import type { LampField } from './trackbed';

const VERT = /* glsl */ `
${GLSL_SHARED_PARS}
attribute vec3 aOther;
attribute vec3 aSE;   // x = 侧（±1），y = 本点是线段起点（0）/ 终点（1），z = 线半径（m）
attribute vec3 aLamp; // 该点的路灯照度（线性 RGB，CPU 算）
uniform float uRange;
varying float vAlpha;
varying vec3 vWorld;
varying vec3 vLamp;
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 o = (modelMatrix * vec4(aOther, 1.0)).xyz;
  vec3 d = aSE.y < 0.5 ? o - p : p - o;
  d = normalize(d + vec3(1e-6));
  vec3 view = normalize(cameraPosition - p);
  vec3 side = cross(d, view);
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(0.0, 1.0, 0.0);
  float depth = max(-(viewMatrix * vec4(p, 1.0)).z, 0.1);
  float pxM = depth / (projectionMatrix[1][1] * 0.5 * uViewportPx.y);
  float w = max(aSE.z, 0.65 * pxM);
  float dist = length(cameraPosition - p);
  vAlpha = max(aSE.z / w, 0.8) * (1.0 - smoothstep(0.7 * uRange, uRange, dist));
  p += side * aSE.x * w;
  vWorld = p;
  vLamp = aLamp;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
uniform vec3 uColour;
varying float vAlpha;
varying vec3 vWorld;
varying vec3 vLamp;
void main() {
  if (vAlpha < 0.01) discard;
  float alpha = vAlpha;
  // 铜线 / 钢缆：天光下是暗线；只在路灯正下方有一点去饱和的细反光（不把整条线染成灯色）
  float lum = dot(vLamp, vec3(0.2126, 0.7152, 0.0722));
  vec3 glint = mix(vec3(lum), vLamp, 0.5) * 0.05 * smoothstep(0.6, 2.5, lum);
  vec3 col = applyHaze(uColour + glint, vec3(0.0), vWorld);
  ${GLSL_FINISH_ALPHA}
}
`;

/** 线网格（三角形数 = 2 × 线段数）。lines 为模拟坐标米 / mPD 的折线；radius 为每条折线的半径（m）。 */
export function buildWires(lines: readonly { pts: readonly V3[]; radius: number }[], range: number, lamps?: LampField): Mesh | null {
  const pos: number[] = [];
  const lampRGB: number[] = [];
  const e: [number, number, number] = [0, 0, 0];
  const other: number[] = [];
  const se: number[] = [];
  const idx: number[] = [];
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  for (const line of lines) {
    // 长段切成 ≤ 12 m（宽度、淡出都按顶点算：一段太长，远端淡出会把整段带暗）
    const pts: V3[] = [line.pts[0]!];
    for (let i = 1; i < line.pts.length; i++) {
      const p = line.pts[i - 1]!;
      const q = line.pts[i]!;
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / 12));
      for (let k = 1; k <= n; k++) pts.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n, p[2] + ((q[2] - p[2]) * k) / n]);
    }
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!;
      const q = pts[i]!;
      simToThree(p[0], p[1], p[2], a, 0, 1);
      simToThree(q[0], q[1], q[2], b, 0, 1);
      const base = pos.length / 3;
      for (const [P, O, end] of [
        [a, b, 0],
        [b, a, 1],
      ] as const) {
        if (lamps) lamps.at(P[0]!, P[1]!, P[2]!, e, 0, 8);
        for (const side of [-1, 1]) {
          pos.push(P[0]!, P[1]!, P[2]!);
          other.push(O[0]!, O[1]!, O[2]!);
          se.push(side, end, line.radius);
          lampRGB.push(e[0], e[1], e[2]);
        }
      }
      // 顶点：0 起点左、1 起点右、2 终点左、3 终点右（双面不剔除）
      idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
  }
  if (!pos.length) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aOther', new BufferAttribute(new Float32Array(other), 3));
  g.setAttribute('aSE', new BufferAttribute(new Float32Array(se), 3));
  g.setAttribute('aLamp', new BufferAttribute(new Float32Array(lampRGB), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const material = new ShaderMaterial({
    uniforms: { ...sharedUniforms(), uRange: { value: range }, uColour: { value: new Vector3(...linearRGB('#15161a')) } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new Mesh(g, material);
  mesh.name = 'tram-wires';
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 2;
  return mesh;
}

/**
 * 电车轨道混凝土板与钢轨（R2 TRAMS T7，取代 R1 lines.ts 给电车画的钢轨）：一个网格、一个 draw call。
 * - 每条轨道一条 2.8 m 宽的浅色混凝土板（反照率约沥青的 2.2 倍），盖在看得见的路面上 3 cm（polygonOffset 防闪）；
 *   两轨之间的缝填满（整个电车专用带都是混凝土，不再露出 R1 的花岗岩铺砖）。
 * - 板面：每 3–6 m 一道横缝、零星补块；路灯照度在 CPU 上按附近灯头逐顶点算（与路面 shader 同一配光 pool()），
 *   所以板面上也有一团团灯光。
 * - 钢轨在片元里画：轨距 1067 mm（±0.5335 m），每根 7 cm 亮轨头 + 内侧 4 cm 暗槽；远处按像素覆盖率退成平均，不闪。
 *   轨头在灯下有掠射反光（≤ 0.8）。
 */
import { BufferAttribute, BufferGeometry, Mesh, ShaderMaterial } from 'three';
import { simToThree } from '../../../coords';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms } from '../../materials/lighting';
import { POOL_LED, POOL_SODIUM } from '../../materials/road';
import type { StreetLamp } from '../lamps';
import { ROUTE_STEP_M, projectOnRoute, routePoint, type TramRoute } from './route';

export const BED_HALF_W_M = 1.4;
export const HALF_GAUGE_M = 0.5335;

/** 路灯照度查询（three 坐标）：与路面 shader 的 pool() 相同的配光。 */
export class LampField {
  private readonly cells = new Map<number, number[]>();
  private static readonly CELL = 20;
  private readonly led = lightColour('ledWhite');
  private readonly sodium = lightColour('sodium');
  constructor(private readonly lamps: readonly StreetLamp[]) {
    lamps.forEach((l, i) => {
      const k = this.key(Math.floor(l.head[0] / LampField.CELL), Math.floor(l.head[2] / LampField.CELL));
      const list = this.cells.get(k);
      if (list) list.push(i);
      else this.cells.set(k, [i]);
    });
  }
  private key(i: number, j: number): number {
    return (i + 5000) * 10000 + (j + 5000);
  }
  /**
   * (x, y, z)（three 坐标）处水平面的路灯照度，写进 out（线性 RGB，已乘配光系数），返回钠灯比例。
   * lift：受光面离地高度（m），灯高按 headH − lift 算；fixedH 给定时一律按这个灯高（架空线：线在灯头附近、四面受光）。
   */
  at(x: number, y: number, z: number, out: [number, number, number], lift = 0, fixedH?: number): number {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    const C = LampField.CELL;
    const ci = Math.floor(x / C);
    const cj = Math.floor(z / C);
    let sum = 0;
    let sod = 0;
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++)
        for (const k of this.cells.get(this.key(i, j)) ?? []) {
          const l = this.lamps[k]!;
          const H = fixedH ?? Math.max(l.head[1] - y - lift, 1.5);
          const dx = l.head[0] - x;
          const dz = l.head[2] - z;
          const q = (H * H) / (dx * dx + dz * dz + H * H);
          const e = q * q * (l.sodium ? POOL_SODIUM : POOL_LED);
          if (e < 1e-3) continue;
          const c = l.sodium ? this.sodium : this.led;
          out[0] += c.r * e;
          out[1] += c.g * e;
          out[2] += c.b * e;
          sum += e;
          if (l.sodium) sod += e;
        }
    return sum > 0 ? sod / sum : 0;
  }
}

const VERT = /* glsl */ `
${GLSL_SHARED_PARS}
attribute vec3 aBed;
attribute vec3 aLamp;
varying vec3 vBed;
varying vec3 vLamp;
varying vec3 vWorld;
void main() {
  vBed = aBed;
  vLamp = aLamp;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
uniform float uWarmth;
varying vec3 vBed;
varying vec3 vLamp;
varying vec3 vWorld;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float along = vBed.x;
  float across = vBed.y;
  float seed = vBed.z * 13.0;
  float aa = max(fwidth(across), 1e-4);
  float aaL = max(fwidth(along), 1e-4);
  float far = smoothstep(0.08, 0.3, max(aa, aaL));
  // 混凝土板：每块 3–6 m，块间横缝；块色略有差异，零星补块；细颗粒近处才有
  float slab = floor(along / 4.5 + 0.5 * hash12(vec2(floor(along / 4.5), seed)));
  float u = fract(along / 4.5 + 0.5 * hash12(vec2(floor(along / 4.5), seed)));
  float joint = (1.0 - smoothstep(0.0, aaL / 4.5 * 1.5 + 0.004, min(u, 1.0 - u))) * (1.0 - far);
  float tone = 0.9 + 0.2 * hash12(vec2(slab, seed + 3.0));
  float patchK = step(0.85, hash12(vec2(slab * 1.7, seed + 9.0))) * step(0.3, fract(across * 0.37 + slab * 0.31)) * 0.18;
  float grain = mix(0.85 + 0.3 * vnoise(vec2(along, across) * 6.0), 1.0, far);
  vec3 concrete = vec3(0.19, 0.182, 0.168) * tone * grain * (1.0 - patchK) * (1.0 - 0.45 * joint);
  // 板边一道暗缝
  float edge = 1.0 - smoothstep(0.0, aa * 1.5 + 0.01, ${BED_HALF_W_M.toFixed(3)} - abs(across));
  concrete *= 1.0 - 0.4 * edge * step(abs(across), ${(BED_HALF_W_M + 0.05).toFixed(3)});
  // 钢轨：轨头 7 cm、内侧槽 4 cm；像素比轨宽时按覆盖率淡出成平均
  float dr = abs(abs(across) - ${HALF_GAUGE_M.toFixed(4)});
  float head = (1.0 - smoothstep(0.035 - aa, 0.035 + aa, dr));
  float dg = abs(abs(across) - ${(HALF_GAUGE_M - 0.055).toFixed(4)});
  float groove = (1.0 - smoothstep(0.02 - aa, 0.02 + aa, dg));
  float cover = clamp(0.07 / (aa * 2.0), 0.0, 1.0);
  head = mix(head, 0.0, 1.0 - cover) + (1.0 - cover) * 0.07 / (aa * 2.0 + 0.07) * step(dr, aa * 2.0);
  // 渡线 / 支线（vBed.z = 9）只画钢轨
  if (vBed.z > 8.5 && head < 0.05 && groove * cover < 0.05) discard;
  vec3 alb = mix(concrete, vec3(0.012), groove * cover);
  alb = mix(alb, vec3(0.3, 0.3, 0.31), clamp(head, 0.0, 1.0));
  vec3 irr = cityAmbient(vec3(0.0, 1.0, 0.0), 0.0, uWarmth) * 0.6 + vLamp;
  // 轨头掠射反光：灯光在抛光轨面上的亮线
  vec3 V = normalize(cameraPosition - vWorld);
  float graze = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
  vec3 sheen = vLamp * clamp(head, 0.0, 1.0) * graze * 0.3;
  vec3 col = applyHaze(alb * irr + sheen, vec3(0.0), vWorld);
  ${GLSL_FINISH}
}
`;

export interface BedOptions {
  /** 沿线步长（m）。 */
  step: number;
}

/**
 * 两条行车线的混凝土板（three 坐标）。lamps 给逐顶点路灯照度。
 * 网格：每站两点（左右板边），并行段内侧板边推到两轨中线（填缝）。
 */
export function buildTrackBed(
  routes: readonly TramRoute[],
  lamps: LampField,
  opts: BedOptions,
  surfaceM?: (x: number, y: number) => number,
  /** 不在两条行车线上的其他电车路轨（渡线、支线、车厂线）：只画钢轨（模拟坐标米折线）。 */
  branches: readonly (readonly [number, number][])[] = [],
): Mesh | null {
  const pos: number[] = [];
  const bed: number[] = [];
  const lamp: number[] = [];
  const idx: number[] = [];
  const v = [0, 0, 0];
  const e: [number, number, number] = [0, 0, 0];
  const q = { x: 0, y: 0, z: 0 };
  const every = Math.max(1, Math.round(opts.step / ROUTE_STEP_M));
  routes.forEach((r, ri) => {
    const other = routes[1 - ri];
    const n = r.x.length;
    let prevBase = -1;
    let prevDrops: number[] = [0, 0];
    for (let i = 0; i < n; i += every) {
      const k = Math.min(i, n - 1);
      const a = Math.max(k - 1, 0);
      const b = Math.min(k + 1, n - 1);
      const dx = r.x[b]! - r.x[a]!;
      const dy = r.y[b]! - r.y[a]!;
      const l = Math.hypot(dx, dy) || 1;
      // 左法线（行驶方向）
      const nx = -dy / l;
      const ny = dx / l;
      let extL = 0;
      let extR = 0;
      if (other) {
        const hit = projectOnRoute(other, r.x[k]!, r.y[k]!);
        if (hit.d < 4.5) {
          // 另一条线在本线的左（+1）还是右（−1）：投影点相对左法线的方向
          routePoint(other, hit.s, q);
          const toward = (q.x - r.x[k]!) * nx + (q.y - r.y[k]!) * ny > 0 ? 1 : -1;
          const fill = Math.max(0, hit.d / 2 - BED_HALF_W_M + 0.03);
          if (toward > 0) extL = fill;
          else extR = fill;
        }
      }
      const base = pos.length / 3;
      const drops: number[] = [];
      for (const [lat, ext] of [
        [BED_HALF_W_M, extL],
        [-BED_HALF_W_M, extR],
      ] as const) {
        const off = lat + Math.sign(lat) * ext;
        const x = r.x[k]! + nx * off;
        const y = r.y[k]! + ny * off;
        // 板边高度：不低于轨顶 − 2 cm，边上的路面更高（人行道、相邻路面）时盖在它上面
        const zEdge = surfaceM ? Math.max(r.z[k]! - 0.02, surfaceM(x, y) + 0.03) : r.z[k]!;
        // 板边外 0.15 m 的路面：板浮在上面时画一道竖直板边（混凝土侧面）挡住缝
        const outside = surfaceM ? surfaceM(x + nx * Math.sign(lat) * 0.15, y + ny * Math.sign(lat) * 0.15) : zEdge;
        drops.push(ext > 0 ? 0 : Math.max(0, zEdge - outside - 0.02));
        simToThree(x, y, zEdge, v, 0, 1);
        pos.push(v[0]!, v[1]!, v[2]!);
        bed.push(k * ROUTE_STEP_M, off, ri);
        lamps.at(v[0]!, v[1]!, v[2]!, e);
        lamp.push(e[0], e[1], e[2]);
      }
      if (prevBase >= 0) {
        // 左（base）在行驶方向左侧：三角形朝上
        idx.push(prevBase, prevBase + 1, base + 1, prevBase, base + 1, base);
        // 板边侧面（两站都浮起 > 4 cm 时）
        for (let side = 0; side < 2; side++) {
          const dropA = prevDrops[side]!;
          const dropB = drops[side]!;
          if (dropA < 0.04 || dropB < 0.04) continue;
          const s0 = pos.length / 3;
          for (const [vi, drop] of [
            [prevBase + side, dropA],
            [base + side, dropB],
          ] as const) {
            for (const dz of [0, -drop - 0.02]) {
              pos.push(pos[vi * 3]!, pos[vi * 3 + 1]! + dz, pos[vi * 3 + 2]!);
              bed.push(bed[vi * 3]!, Math.sign(bed[vi * 3 + 1]!) * (BED_HALF_W_M + 0.02), ri);
              lamp.push(lamp[vi * 3]! * 0.4, lamp[vi * 3 + 1]! * 0.4, lamp[vi * 3 + 2]! * 0.4);
            }
          }
          // s0 = 前站顶、前站底、本站顶、本站底；左侧朝左、右侧朝右
          if (side === 0) idx.push(s0, s0 + 2, s0 + 3, s0, s0 + 3, s0 + 1);
          else idx.push(s0, s0 + 1, s0 + 3, s0, s0 + 3, s0 + 2);
        }
      }
      prevBase = base;
      prevDrops = drops;
      if (k === n - 1) break;
    }
  });
  // 其他路轨：1.4 m 宽的窄条，只画钢轨（其余片元丢弃），比主线板面高 1 cm，盖在路面 / 主线板面上
  for (const line of branches) {
    if (line.length < 2 || !surfaceM) continue;
    let prevBase = -1;
    let along = 0;
    for (let k = 0; k < line.length; k++) {
      const [x0, y0] = line[k]!;
      const a = line[Math.max(k - 1, 0)]!;
      const b = line[Math.min(k + 1, line.length - 1)]!;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / l;
      const ny = (b[0] - a[0]) / l;
      if (k > 0) along += Math.hypot(x0 - line[k - 1]![0], y0 - line[k - 1]![1]);
      const z = Math.max(surfaceM(x0, y0), surfaceM(x0 + nx * 0.6, y0 + ny * 0.6), surfaceM(x0 - nx * 0.6, y0 - ny * 0.6)) + 0.045;
      const base = pos.length / 3;
      for (const off of [0.7, -0.7]) {
        simToThree(x0 + nx * off, y0 + ny * off, z, v, 0, 1);
        pos.push(v[0]!, v[1]!, v[2]!);
        bed.push(along, off, 9);
        lamps.at(v[0]!, v[1]!, v[2]!, e);
        lamp.push(e[0], e[1], e[2]);
      }
      if (prevBase >= 0) idx.push(prevBase, prevBase + 1, base + 1, prevBase, base + 1, base);
      prevBase = base;
    }
  }
  if (!pos.length) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aBed', new BufferAttribute(new Float32Array(bed), 3));
  g.setAttribute('aLamp', new BufferAttribute(new Float32Array(lamp), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const material = new ShaderMaterial({
    uniforms: { ...sharedUniforms(), uWarmth: { value: 0.4 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const mesh = new Mesh(g, material);
  mesh.name = 'tram-trackbed';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

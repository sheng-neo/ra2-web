/**
 * 海港船只（ATMOSPHERE A9）：5 艘通用船沿固定航线往返（中环码头 ↔ 尖沙咀 / 红磡 / 西九，一条东西向），
 * 位置只由 uTime 决定（截图确定）。双层渡轮式（暖光舱窗两排）与小汽艇两种船体；船身白 / 蓝 / 灰，
 * 不用任何真实渡轮公司的涂装。航行灯：左红、右绿、桅顶白、船尾白（GlowBatch）。船尾浪交给水面着色器。
 * 2 个 draw call（船体 InstancedMesh + 航行灯），三角形 < 1k。
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { simMetresToThree } from '../coords';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, GlowBatch, SIM_CLOCK, lightColour, sharedUniforms } from './materials/lighting';
import type { WakeSource } from './water';

export interface Route {
  /** 两端码头（模拟米）。 */
  a: readonly [number, number];
  b: readonly [number, number];
  /** 航速（m/s）、靠岸停留（s）、相位（s）。 */
  speed: number;
  dwell: number;
  phase: number;
  /** 0 = 双层渡轮，1 = 小汽艇。 */
  type: 0 | 1;
  hull: string;
}

export const ROUTES: readonly Route[] = [
  { a: [690, 655], b: [1300, 1035], speed: 5.5, dwell: 40, phase: 30, type: 0, hull: '#e8e9e4' },
  { a: [540, 640], b: [2280, 1330], speed: 6, dwell: 50, phase: 210, type: 0, hull: '#d9dee6' },
  { a: [-2600, 880], b: [4600, 1120], speed: 6.5, dwell: 10, phase: 400, type: 1, hull: '#3a4c66' },
  { a: [2050, 760], b: [150, 1820], speed: 6, dwell: 20, phase: 120, type: 1, hull: '#c8ccd0' },
  { a: [820, 1350], b: [1900, 1000], speed: 4.5, dwell: 15, phase: 640, type: 1, hull: '#8d969e' },
];

export interface BoatState {
  x: number;
  y: number;
  /** 航向（弧度，东 = 0，逆时针）。 */
  heading: number;
  /** 0 = 靠岸停着，1 = 航行中。 */
  moving: number;
}

/** 航线上的位置：a → b 航行、在 b 停 dwell 秒、b → a、在 a 停；首尾 25 s 缓加 / 减速（纯函数）。 */
export function boatAt(r: Route, t: number): BoatState {
  const dx = r.b[0] - r.a[0];
  const dy = r.b[1] - r.a[1];
  const len = Math.hypot(dx, dy);
  const run = len / r.speed;
  const period = 2 * (run + r.dwell);
  const tt = (((t + r.phase) % period) + period) % period;
  const ease = (u: number) => u * u * (3 - 2 * u);
  let k: number;
  let dir: 1 | -1;
  let moving = 1;
  if (tt < run) {
    k = ease(tt / run);
    dir = 1;
  } else if (tt < run + r.dwell) {
    k = 1;
    dir = 1;
    moving = 0;
  } else if (tt < 2 * run + r.dwell) {
    k = 1 - ease((tt - run - r.dwell) / run);
    dir = -1;
  } else {
    k = 0;
    dir = -1;
    moving = 0;
  }
  const heading = Math.atan2(dy * dir, dx * dir);
  return { x: r.a[0] + dx * k, y: r.a[1] + dy * k, heading, moving };
}

const vertexShader = /* glsl */ `
attribute float aPart;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
flat varying float vPart;
varying vec3 vHull;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 world = m * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(m) * normal);
  vLocal = position;
  vPart = aPart;
  #ifdef USE_INSTANCING_COLOR
  vHull = instanceColor;
  #else
  vHull = vec3(0.8);
  #endif
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
uniform vec3 uCabin;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
flat varying float vPart;
varying vec3 vHull;
void main() {
  vec3 n = normalize(vNormalW);
  vec3 amb = cityAmbient(n, 30.0, 0.4) * 0.6;
  vec3 surface = vHull * 0.5 * amb;
  vec3 emit = vec3(0.0);
  if (vPart > 0.5 && vPart < 1.5) {
    // 舱壁：一排窗（本地 x 方向每 1.6 m 一扇），暖光 0.6–0.9
    float u = vLocal.x / 1.6;
    float f = fract(u);
    float win = step(0.15, f) * step(f, 0.85);
    float row = fract(vLocal.y / 2.6);
    float band = step(0.3, row) * step(row, 0.8);
    emit = uCabin * win * band * 0.8;
    surface = vHull * 0.35 * amb;
  } else if (vPart > 1.5) {
    surface = vec3(0.05) * amb;
  }
  vec3 col = applyHaze(surface, emit, vWorld);
  ${GLSL_FINISH}
}
`;

/** 船体几何（本地：+x 船头、+y 上、+z 右舷）：船壳（船头收尖）+ 一或两层舱 + 舱顶。length 1 单位 = 1 m。 */
function boatGeometry(): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const part: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], p: number) => {
    const ab = new Vector3(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!);
    const ad = new Vector3(d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!);
    const nn = ab.cross(ad).normalize();
    for (const v of [a, b, c, a, c, d]) {
      pos.push(v[0]!, v[1]!, v[2]!);
      nor.push(nn.x, nn.y, nn.z);
      part.push(p);
    }
  };
  // 箱体：x0..x1、y0..y1、半宽 w（四个侧面 + 顶）
  const box = (x0: number, x1: number, y0: number, y1: number, w: number, p: number, bow = 0) => {
    const xb = x1 + bow;
    quad([x0, y0, w], [x1, y0, w], [x1, y1, w], [x0, y1, w], p); // 右舷
    quad([x1, y0, -w], [x0, y0, -w], [x0, y1, -w], [x1, y1, -w], p); // 左舷
    quad([x0, y0, -w], [x0, y0, w], [x0, y1, w], [x0, y1, -w], p); // 船尾
    if (bow > 0) {
      // 船头收尖：两片斜面
      quad([x1, y0, w], [xb, y0, 0], [xb, y1, 0], [x1, y1, w], p);
      quad([xb, y0, 0], [x1, y0, -w], [x1, y1, -w], [xb, y1, 0], p);
      quad([x0, y1, w], [x1, y1, w], [x1, y1, -w], [x0, y1, -w], 2);
      pos.push(x1, y1, w, xb, y1, 0, x1, y1, -w);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      part.push(2, 2, 2);
    } else {
      quad([x1, y0, w], [x1, y0, -w], [x1, y1, -w], [x1, y1, w], p); // 前
      quad([x0, y1, w], [x1, y1, w], [x1, y1, -w], [x0, y1, -w], 2); // 顶
    }
  };
  // 船体归一化：长 1（−0.5…0.5），实际尺寸用实例缩放
  box(-0.5, 0.36, -0.06, 0.12, 0.5, 0, 0.14);
  box(-0.42, 0.28, 0.12, 0.42, 0.42, 1);
  box(-0.36, 0.2, 0.42, 0.68, 0.38, 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  return g;
}

/** 两种船的尺寸（长、宽、高，米）。 */
const SIZE: Record<0 | 1, [number, number, number]> = { 0: [34, 9, 6], 1: [15, 4, 4] };

export class Boats {
  readonly objects: Object3D[];
  private readonly hulls: InstancedMesh;
  private readonly lights: GlowBatch;
  private readonly m = new Matrix4();
  private readonly s = new Vector3();
  private readonly red = lightColour('aviation');
  private readonly green = lightColour('neonGreen');
  private readonly white = lightColour('headlight');

  constructor(private readonly routes: readonly Route[] = ROUTES) {
    const material = new ShaderMaterial({
      uniforms: { ...sharedUniforms(), uCabin: { value: lightColour('shopWarm') } },
      vertexShader,
      fragmentShader,
    });
    this.hulls = new InstancedMesh(boatGeometry(), material, routes.length);
    this.hulls.name = 'boats';
    this.hulls.frustumCulled = false;
    this.hulls.instanceColor = new InstancedBufferAttribute(new Float32Array(routes.length * 3), 3);
    routes.forEach((r, i) => this.hulls.setColorAt(i, new Color(r.hull)));
    this.hulls.userData.reflect = true;
    this.lights = new GlowBatch(routes.length * 4, 'boat-lights');
    this.lights.mesh.userData.reflect = true;
    this.objects = [this.hulls, this.lights.mesh];
  }

  /** 每帧：按 uTime 摆船、写航行灯；把船尾浪交给水面。 */
  update(water: { setWakes(list: readonly WakeSource[]): void } | null): void {
    const t = SIM_CLOCK.t;
    const wakes: WakeSource[] = [];
    this.routes.forEach((r, i) => {
      const b = boatAt(r, t);
      const [L, W, H] = SIZE[r.type];
      const [x, y, z] = simMetresToThree(b.x, b.y, 0);
      // 轻微起伏
      const bob = Math.sin(t * 0.9 + i * 1.7) * 0.12;
      this.m.makeRotationY(b.heading);
      this.m.scale(this.s.set(L, H, W));
      this.m.setPosition(x, y + bob, z);
      this.hulls.setMatrixAt(i, this.m);
      // 航行灯（本地：+x 船头、+z 右舷）
      const c = Math.cos(b.heading);
      const sn = Math.sin(b.heading);
      const at = (fx: number, side: number, up: number): [number, number, number] => {
        // 本地 (fx 前, side 右) → 模拟坐标：前 = (c, sn)，右 = (sn, −c)
        const px = b.x + fx * c + side * sn;
        const py = b.y + fx * sn - side * c;
        return simMetresToThree(px, py, up);
      };
      this.lights.set(i * 4, at(L * 0.1, -W * 0.5, H * 0.55), this.red, 4, 0.25);
      this.lights.set(i * 4 + 1, at(L * 0.1, W * 0.5, H * 0.55), this.green, 4, 0.25);
      this.lights.set(i * 4 + 2, at(L * 0.15, 0, H + 2.5), this.white, 5, 0.25);
      this.lights.set(i * 4 + 3, at(-L * 0.5, 0, H * 0.45), this.white, 3, 0.2);
      if (b.moving) wakes.push({ x: b.x - c * L * 0.45, y: b.y - sn * L * 0.45, heading: b.heading, strength: r.type === 0 ? 1 : 0.7 });
    });
    this.hulls.instanceMatrix.needsUpdate = true;
    this.lights.commit(true);
    water?.setWakes(wakes);
  }
}

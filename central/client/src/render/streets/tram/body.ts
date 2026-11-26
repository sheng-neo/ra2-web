/**
 * 电车车身几何（R2 TRAMS T1）：程序生成，局部坐标 x 向前（车头 +x）、y 向上（0 = 轨顶）、z 向右（车门在左 = −z）。
 * 真实比例（detail-facts §1.1）：车身 8.7 × 2.35 m，檐口 4.40 m、拱顶 ≤ 4.6 m，长高比约 2；中间一个四轮转向架，前后长悬挑。
 *
 * 外形：平面是「直侧面 8.0 m + 两端弓形车头」（弓高 0.35 m，圆角），立面按色带分段并有 3 cm 的凹凸：
 *   裙板 0.35–0.65（暗、内收）· 下层板 0.65–1.60 · 下层窗带 1.60–2.40（内收）· 两层间广告带 2.40–3.40 ·
 *   上层窗带 3.40–4.20（内收）· 檐口 4.20–4.40（略外凸）· 拱顶。
 * 窗、门、窗柱、涂装、目的地牌、车厢内部都在片元着色器里按局部坐标画（tram/material.ts），几何只给形体。
 * R3（真实涂装）：两端车头中线一盏圆头灯（车尾那盏不亮）、两下角白 / 琥珀 / 红灯组、观者左侧上下两盏红灯（照片 01–03），
 * 白色百叶冷气箱；裙板按分区着色（两端黑色防撞杠上画车队编号）。
 *
 * 顶点属性（顶点属性槽有限：实例矩阵占 4 个，再加 5 个实例属性，总数要 ≤ 16）：
 * position、normal、aAlb（固定色分区的反照率）、aZWE = (分区 ZONE, 绕车身一周的展开坐标 m, 发光倍率 k：发光 = aAlb × k)。
 * 集电杆的加粗方向在着色器里由杆坐标的 (y, z) 求。
 * 集电杆顶点存的是「杆坐标」（沿杆 x′ 0–4 m），着色器按实例的接触线高度绕杆座旋转。
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { linearRGB } from '../prop-geometry';
import { STANDARD } from './livery';

/** 车底、裙板暗色（不随涂装）。 */
const SKIRT_DARK = '#26292a';

export const TRAM_HALF_SIDE_M = 4.0;
export const TRAM_BULGE_M = 0.35;
export const TRAM_LEN_M = 2 * (TRAM_HALF_SIDE_M + TRAM_BULGE_M);
export const TRAM_W_M = 2.35;
export const TRAM_HW_M = TRAM_W_M / 2;
export const SKIRT_Y_M = 0.35;
export const CORNICE_Y_M = 4.4;
export const ROOF_TOP_M = 4.58;
/** 集电杆座（杆坐标原点）：车顶中部偏前 0.4 m。 */
export const POLE_PIVOT: readonly [number, number, number] = [0.4, 4.74, 0];
export const POLE_LEN_M = 4.0;
/** 车头灯（R3：两端车头中线上各一盏圆灯，Ø 0.25 m，中心 0.18 H ≈ 0.79 m；车尾那盏不亮）。 */
export const LAMP_Y_M = 0.79;
export const HEADLAMP_R_M = 0.125;
/** 车角灯组（两端下角：白色示廓、琥珀转向、红色尾灯，横排），横向位置（|z|）与高度。 */
export const CLUSTER_Y_M = 0.74;
export const CLUSTER_Z_M: readonly [number, number, number] = [0.8, 0.9, 1.0];
/** 两端「观者左侧」上下两盏红灯（约 0.25 H）。 */
export const STACK_Y_M: readonly [number, number] = [1.02, 1.14];
export const STACK_Z_M = 0.95;
/** R2 的两角车灯横向位置（保留给旧调用方；R3 光点改用 CLUSTER_Z_M）。 */
export const LAMP_Z_M = CLUSTER_Z_M[2];

/** 分区代码（与 material.ts 一致）。 */
export const ZONE = {
  Fixed: 0,
  SideLeft: 1,
  SideRight: 2,
  Front: 3,
  Rear: 4,
  Roof: 5,
  Pole: 6,
  /** 集电杆拉绳：position = (沿绳 0–1, 侧 ±1, 0)，着色器从车尾车顶拉到杆头。 */
  Rope: 7,
} as const;

/** 弓形车头平面（z → 外凸量 dx），由左（−z）到右（+z）。 */
const END_FAN: readonly [number, number][] = [
  [-1.175, 0.0],
  [-1.12, 0.12],
  [-0.98, 0.22],
  [-0.6, 0.31],
  [0, 0.35],
  [0.6, 0.31],
  [0.98, 0.22],
  [1.12, 0.12],
  [1.175, 0.0],
];
const END_FAN_LOD1: readonly [number, number][] = [
  [-1.175, 0.0],
  [-0.98, 0.22],
  [0, 0.35],
  [0.98, 0.22],
  [1.175, 0.0],
];

/** 最近一次 bodyLoop 的周长（展开坐标回绕处用）。 */
let perimeter = 0;

interface LoopPt {
  x: number;
  z: number;
  /** 外法线（平面）。 */
  nx: number;
  nz: number;
  /** 该点之后那条边所属的分区。 */
  zone: number;
  /** 展开坐标（m）。 */
  wrap: number;
}

/**
 * 车身平面外轮廓（逆时针从车尾左角开始）：左侧 → 车头 → 右侧 → 车尾。
 * 每点带外法线（相邻两边法线平均）与展开坐标（从车尾中心起沿左侧量；右侧接着量到一圈）。
 */
export function bodyLoop(fan: readonly [number, number][] = END_FAN): LoopPt[] {
  const H = TRAM_HALF_SIDE_M;
  const pts: { x: number; z: number; zone: number }[] = [];
  // 车尾左角 → 车头左角（左侧面，z = −HW）
  pts.push({ x: -H, z: -TRAM_HW_M, zone: ZONE.SideLeft });
  // 车头：由左到右
  for (let i = 0; i < fan.length; i++) {
    const [z, dx] = fan[i]!;
    pts.push({ x: H + dx, z, zone: i < fan.length - 1 ? ZONE.Front : ZONE.SideRight });
  }
  // 车尾：由右到左（车尾左角是起点，不重复）
  for (let i = fan.length - 1; i >= 1; i--) {
    const [z, dx] = fan[i]!;
    pts.push({ x: -H - dx, z, zone: ZONE.Rear });
  }
  // 最后一点（车尾 z = fan[1].z）到起点（车尾左角）是闭合段，分区 Rear
  const n = pts.length;
  // 展开坐标：从车尾中心（x = −H − bulge, z = 0）起算，沿左侧方向为正
  const segLen = (i: number) => Math.hypot(pts[(i + 1) % n]!.x - pts[i]!.x, pts[(i + 1) % n]!.z - pts[i]!.z);
  const perim = pts.reduce((a, _, i) => a + segLen(i), 0);
  perimeter = perim;
  // 车尾中心在车尾那段扇形中（z = 0 的点）
  let start = pts.findIndex((p, i) => i > 0 && p.zone === ZONE.Rear && Math.abs(p.z) < 1e-6);
  if (start < 0) start = 0;
  const wrap = new Array<number>(n);
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    wrap[i] = acc;
    acc += segLen(i);
  }
  return pts.map((p, i) => {
    const a = pts[(i + n - 1) % n]!;
    const b = pts[(i + 1) % n]!;
    // 边 a→p 与 p→b 的外法线（逆时针轮廓、y 向上：边方向 (dx, dz) 的外法线 = (dz, −dx)）—— 轮廓走向见下方测试
    const n1x = p.z - a.z;
    const n1z = -(p.x - a.x);
    const n2x = b.z - p.z;
    const n2z = -(b.x - p.x);
    const l1 = Math.hypot(n1x, n1z) || 1;
    const l2 = Math.hypot(n2x, n2z) || 1;
    let nx = n1x / l1 + n2x / l2;
    let nz = n1z / l1 + n2z / l2;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    return { x: p.x, z: p.z, nx, nz, zone: p.zone, wrap: wrap[i]! };
  });
}

class Geo {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly zone: number[] = [];
  readonly wrap: number[] = [];
  readonly alb: number[] = [];
  readonly em: number[] = [];
  readonly index: number[] = [];

  vert(p: readonly number[], n: readonly number[], zone: number, wrap = 0, alb: readonly number[] = [0, 0, 0], em: readonly number[] = [0, 0, 0]): number {
    const i = this.pos.length / 3;
    this.pos.push(p[0]!, p[1]!, p[2]!);
    this.nrm.push(n[0]!, n[1]!, n[2]!);
    this.zone.push(zone);
    this.wrap.push(wrap);
    this.alb.push(alb[0]!, alb[1]!, alb[2]!);
    this.em.push(em[0]!, em[1]!, em[2]!);
    return i;
  }

  /** 四边形 a b c d（从外面看逆时针），平面法线。 */
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], zone: number, wraps: readonly number[] = [0, 0, 0, 0], alb?: readonly number[], em?: readonly number[]): void {
    const ux = b[0]! - a[0]!;
    const uy = b[1]! - a[1]!;
    const uz = b[2]! - a[2]!;
    const vx = d[0]! - a[0]!;
    const vy = d[1]! - a[1]!;
    const vz = d[2]! - a[2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const i = this.vert(a, [nx, ny, nz], zone, wraps[0], alb, em);
    this.vert(b, [nx, ny, nz], zone, wraps[1], alb, em);
    this.vert(c, [nx, ny, nz], zone, wraps[2], alb, em);
    this.vert(d, [nx, ny, nz], zone, wraps[3], alb, em);
    this.index.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** 轴对齐盒子（固定色），底面中心 c，尺寸 s；skip 里的面不画。 */
  box(c: readonly number[], s: readonly number[], alb: readonly number[], skip: string[] = ['bottom'], em?: readonly number[]): void {
    const [cx, y0, cz] = c as [number, number, number];
    const hx = s[0]! / 2;
    const hz = s[2]! / 2;
    const y1 = y0 + s[1]!;
    const b = (x: number, z: number) => [cx + x, y0, cz + z];
    const t = (x: number, z: number) => [cx + x, y1, cz + z];
    if (!skip.includes('pz')) this.quad(b(-hx, hz), b(hx, hz), t(hx, hz), t(-hx, hz), ZONE.Fixed, undefined, alb, em);
    if (!skip.includes('nz')) this.quad(b(hx, -hz), b(-hx, -hz), t(-hx, -hz), t(hx, -hz), ZONE.Fixed, undefined, alb, em);
    if (!skip.includes('px')) this.quad(b(hx, hz), b(hx, -hz), t(hx, -hz), t(hx, hz), ZONE.Fixed, undefined, alb, em);
    if (!skip.includes('nx')) this.quad(b(-hx, -hz), b(-hx, hz), t(-hx, hz), t(-hx, -hz), ZONE.Fixed, undefined, alb, em);
    if (!skip.includes('top')) this.quad(t(-hx, hz), t(hx, hz), t(hx, -hz), t(-hx, -hz), ZONE.Fixed, undefined, alb, em);
    if (!skip.includes('bottom')) this.quad(b(-hx, -hz), b(hx, -hz), b(hx, hz), b(-hx, hz), ZONE.Fixed, undefined, alb, em);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('aAlb', new BufferAttribute(new Float32Array(this.alb), 3));
    const n = this.zone.length;
    const zwe = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const em = Math.max(this.em[i * 3]!, this.em[i * 3 + 1]!, this.em[i * 3 + 2]!);
      const al = Math.max(this.alb[i * 3]!, this.alb[i * 3 + 1]!, this.alb[i * 3 + 2]!, 1e-3);
      zwe[i * 3] = this.zone[i]!;
      zwe[i * 3 + 1] = this.wrap[i]!;
      zwe[i * 3 + 2] = em > 0 ? em / al : 0;
    }
    g.setAttribute('aZWE', new BufferAttribute(zwe, 3));
    g.setIndex(this.index);
    // 包围球按车身 + 集电杆（实例化时 three 用它做整体剔除，这里关掉剔除，由 CPU 逐车判断）
    g.computeBoundingSphere();
    return g;
  }
}

/** 一圈外壁：轮廓按 inset 内收，从 y0 到 y1（外法线朝外）。 */
function ring(g: Geo, loop: readonly LoopPt[], y0: number, y1: number, inset: number, fixed: readonly number[] | null): void {
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % n]!;
    const ax = a.x - a.nx * inset;
    const az = a.z - a.nz * inset;
    const bx = b.x - b.nx * inset;
    const bz = b.z - b.nz * inset;
    // 展开坐标在车尾中心回绕：回到 0 的那一段终点记作周长
    const wb = b.wrap < a.wrap ? perimeter : b.wrap;
    const zone = fixed ? ZONE.Fixed : a.zone;
    g.quad([ax, y0, az], [ax, y1, az], [bx, y1, bz], [bx, y0, bz], zone, [a.wrap, a.wrap, wb, wb], fixed ?? undefined);
  }
}

/** 台阶面（上下两段内收量不同处的水平窄条）：下段更靠外 → 朝上，否则朝下。 */
function ledge(g: Geo, loop: readonly LoopPt[], y: number, insetBelow: number, insetAbove: number, alb: readonly number[]): void {
  const n = loop.length;
  const up = insetBelow < insetAbove;
  const inn = Math.max(insetBelow, insetAbove);
  const out = Math.min(insetBelow, insetAbove);
  for (let i = 0; i < n; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % n]!;
    const p = (q: LoopPt, k: number) => [q.x - q.nx * k, y, q.z - q.nz * k];
    if (up) g.quad(p(a, inn), p(b, inn), p(b, out), p(a, out), ZONE.Fixed, undefined, alb);
    else g.quad(p(a, out), p(b, out), p(b, inn), p(a, inn), ZONE.Fixed, undefined, alb);
  }
}

/** 车顶拱：外圈（檐口顶）逐圈内收抬高，最后扇形封顶。 */
function roof(g: Geo, loop: readonly LoopPt[], steps: readonly [number, number][]): void {
  const n = loop.length;
  let prev = steps[0]!;
  for (let k = 1; k < steps.length; k++) {
    const cur = steps[k]!;
    for (let i = 0; i < n; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % n]!;
      const p = (q: LoopPt, s: readonly [number, number]) => [q.x - q.nx * s[0], s[1], q.z - q.nz * s[0]];
      g.quad(p(a, cur), p(b, cur), p(b, prev), p(a, prev), ZONE.Roof);
    }
    prev = cur;
  }
  // 封顶：以中心为扇心
  const top = prev;
  const c = g.vert([0, top[1] + 0.01, 0], [0, 1, 0], ZONE.Roof);
  const first = g.pos.length / 3;
  for (const q of loop) g.vert([q.x - q.nx * top[0], top[1], q.z - q.nz * top[0]], [0, 1, 0], ZONE.Roof);
  for (let i = 0; i < n; i++) g.index.push(c, first + ((i + 1) % n), first + i);
}

/** 圆盘（灯罩）：中心 c、法线 nrm（水平）、半径 r，8 边形。 */
function disc(g: Geo, c: readonly number[], nx: number, nz: number, r: number, alb: readonly number[], em: readonly number[]): void {
  // 盘面切向：水平切向 t = (−nz, 0, nx)，竖直 u = (0, 1, 0)
  const centre = g.vert([c[0]! + nx * 0.03, c[1]!, c[2]! + nz * 0.03], [nx, 0, nz], ZONE.Fixed, 0, alb, em);
  const first = g.pos.length / 3;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const tx = Math.cos(a) * r;
    const ty = Math.sin(a) * r;
    g.vert([c[0]! - nz * tx + nx * 0.02, c[1]! + ty, c[2]! + nx * tx + nz * 0.02], [nx, 0, nz], ZONE.Fixed, 0, alb, em);
  }
  for (let k = 0; k < 8; k++) g.index.push(centre, first + ((k + 1) % 8), first + k);
}

/** 车轮：朝外的八边形盘 + 轮缘（只画外侧）。 */
function wheel(g: Geo, x: number, z: number, side: number): void {
  const tyre = [0.02, 0.02, 0.021];
  const r = 0.35;
  const y = 0.35;
  const first = g.pos.length / 3;
  const c = g.vert([x, y, z], [0, 0, side], ZONE.Fixed, 0, tyre);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.vert([x + Math.cos(a) * r, y + Math.sin(a) * r, z], [0, 0, side], ZONE.Fixed, 0, [0.05, 0.05, 0.05]);
  }
  for (let k = 0; k < 8; k++) {
    if (side > 0) g.index.push(c, first + 1 + k, first + 1 + ((k + 1) % 8));
    else g.index.push(c, first + 1 + ((k + 1) % 8), first + 1 + k);
  }
}

/** 集电杆（杆坐标）：六棱管 + 杆头滑块 + 杆座弹簧箱。 */
function pole(g: Geo, sides: number): void {
  const r = 0.03;
  const dark = [0.03, 0.032, 0.034];
  const first = g.pos.length / 3;
  for (let k = 0; k <= sides; k++) {
    const a = (k / sides) * Math.PI * 2;
    const gy = Math.cos(a);
    const gz = Math.sin(a);
    for (const x of [0, POLE_LEN_M]) g.vert([x, gy * r, gz * r], [0, gy, gz], ZONE.Pole, 0, dark);
  }
  for (let k = 0; k < sides; k++) {
    const a = first + k * 2;
    g.index.push(a, a + 2, a + 3, a, a + 3, a + 1);
  }
  // 杆头滑块（跟杆一起转；稍粗，远处也看得见一个小点）
  poleBox(g, POLE_LEN_M - 0.18, POLE_LEN_M + 0.06, 0.05, dark);
}

/** 杆坐标里的小盒（x0–x1 × ±s × ±s）。 */
function poleBox(g: Geo, x0: number, x1: number, s: number, alb: readonly number[]): void {
  const faces: [number[], number[], number[], number[]][] = [];
  const P = (x: number, y: number, z: number) => [x, y, z];
  // ±z、±y、±x 六个面（逆时针朝外）
  faces.push([P(x0, -s, s), P(x1, -s, s), P(x1, s, s), P(x0, s, s)]);
  faces.push([P(x1, -s, -s), P(x0, -s, -s), P(x0, s, -s), P(x1, s, -s)]);
  faces.push([P(x0, s, s), P(x1, s, s), P(x1, s, -s), P(x0, s, -s)]);
  faces.push([P(x0, -s, -s), P(x1, -s, -s), P(x1, -s, s), P(x0, -s, s)]);
  faces.push([P(x1, -s, s), P(x1, -s, -s), P(x1, s, -s), P(x1, s, s)]);
  faces.push([P(x0, -s, -s), P(x0, -s, s), P(x0, s, s), P(x0, s, -s)]);
  for (const f of faces) {
    const i0 = g.pos.length / 3;
    const ux = f[1]![0]! - f[0]![0]!;
    const uy = f[1]![1]! - f[0]![1]!;
    const uz = f[1]![2]! - f[0]![2]!;
    const vx = f[3]![0]! - f[0]![0]!;
    const vy = f[3]![1]! - f[0]![1]!;
    const vz = f[3]![2]! - f[0]![2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const p of f) {
      g.vert(p, [nx / l, ny / l, nz / l], ZONE.Pole, 0, alb);
    }
    g.index.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
}

export interface TramGeometryOptions {
  lod: 0 | 1;
}

/** 电车几何：LOD0（近，约 1k 三角形）/ LOD1（远，约 80 三角形）。 */
export function tramGeometry(opts: TramGeometryOptions = { lod: 0 }): BufferGeometry {
  const g = new Geo();
  const near = opts.lod === 0;
  const loop = bodyLoop(near ? END_FAN : END_FAN_LOD1);
  const skirt = linearRGB(SKIRT_DARK);
  const ledgeC = linearRGB('#2c2e30');
  if (near) {
    // 分段车身：裙板（固定暗色）+ 五段涂装带，凹凸 3 cm
    // 裙板 / 防撞杠按分区着色（两端黑色防撞杠上要画车队编号，R3）
    ring(g, loop, SKIRT_Y_M, 0.65, 0.04, null);
    ledge(g, loop, 0.65, 0.04, 0, skirt);
    ring(g, loop, 0.65, 1.6, 0, null);
    ledge(g, loop, 1.6, 0, 0.03, ledgeC);
    ring(g, loop, 1.6, 2.4, 0.03, null);
    ledge(g, loop, 2.4, 0.03, 0, ledgeC);
    ring(g, loop, 2.4, 3.4, 0, null);
    ledge(g, loop, 3.4, 0, 0.03, ledgeC);
    ring(g, loop, 3.4, 4.2, 0.03, null);
    ledge(g, loop, 4.2, 0.03, -0.02, ledgeC);
    ring(g, loop, 4.2, CORNICE_Y_M, -0.02, null);
    roof(g, loop, [
      [-0.02, CORNICE_Y_M],
      [0.05, 4.47],
      [0.22, 4.53],
      [0.55, ROOF_TOP_M],
    ]);
    // 车底（暗）：挡住低机位从下往上看进车身
    const c = g.vert([0, SKIRT_Y_M, 0], [0, -1, 0], ZONE.Fixed, 0, skirt);
    const first = g.pos.length / 3;
    for (const q of loop) g.vert([q.x - q.nx * 0.04, SKIRT_Y_M, q.z - q.nz * 0.04], [0, -1, 0], ZONE.Fixed, 0, skirt);
    for (let i = 0; i < loop.length; i++) g.index.push(c, first + i, first + ((i + 1) % loop.length));
    // 转向架、车轮、两端救生托盘（暗）
    g.box([0, 0.12, 0], [2.2, 0.35, 1.5], [0.018, 0.018, 0.02]);
    for (const x of [-0.9, 0.9]) {
      wheel(g, x, 0.72, 1);
      wheel(g, x, -0.72, -1);
    }
    // 救生托架（两端车底）：薄、贴着车底收在弧形车头下面，不伸出车头外（深灰 #3a3d40）
    for (const sx of [1, -1]) g.box([sx * (TRAM_HALF_SIDE_M + 0.05), 0.24, 0], [0.3, 0.05, 1.4], [0.042, 0.047, 0.051]);
    // 车顶：集电杆座（中部偏前）、百叶通风箱（近车尾）
    g.box([POLE_PIVOT[0], ROOF_TOP_M - 0.02, 0], [0.9, 0.14, 0.7], [0.05, 0.052, 0.055]);
    g.box([POLE_PIVOT[0], ROOF_TOP_M + 0.1, 0], [0.3, 0.08, 0.3], [0.03, 0.03, 0.03]);
    // 白色百叶冷气箱（照片 01 #c8c7c9）
    g.box([-2.7, ROOF_TOP_M - 0.03, 0], [1.8, 0.34, 0.9], linearRGB(STANDARD.ac));
    for (let k = 0; k < 5; k++) g.box([-3.4 + k * 0.35, ROOF_TOP_M - 0.03, 0.451], [0.06, 0.3, 0.01], linearRGB('#6e7072'), ['bottom', 'top', 'nz', 'px', 'nx']);
    // R3：车头中线一盏圆头灯（Ø 0.25 m、中心 0.79 m，镀铬圈）；车尾同位置那盏不亮（双头车，照片 01–03）
    const head = [6, 6.1, 6.3];
    const chrome = [0.32, 0.33, 0.34];
    disc(g, [TRAM_HALF_SIDE_M + TRAM_BULGE_M - 0.005, LAMP_Y_M, 0], 1, 0, HEADLAMP_R_M + 0.025, chrome, [0, 0, 0]);
    disc(g, [TRAM_HALF_SIDE_M + TRAM_BULGE_M + 0.005, LAMP_Y_M, 0], 1, 0, HEADLAMP_R_M, [0.6, 0.6, 0.6], head);
    disc(g, [-TRAM_HALF_SIDE_M - TRAM_BULGE_M + 0.005, LAMP_Y_M, 0], -1, 0, HEADLAMP_R_M + 0.025, chrome, [0, 0, 0]);
    disc(g, [-TRAM_HALF_SIDE_M - TRAM_BULGE_M - 0.005, LAMP_Y_M, 0], -1, 0, HEADLAMP_R_M, [0.1, 0.1, 0.1], [0, 0, 0]);
    // 两端下角灯组（白示廓、琥珀转向、红尾灯）：车头白灯微亮，车尾红灯亮
    const tail = [1.8, 0.035, 0.03];
    for (const sz of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const z = sz * CLUSTER_Z_M[k]!;
        const dx = fanAt(z);
        const albF = k === 0 ? [0.6, 0.6, 0.58] : k === 1 ? [0.5, 0.3, 0.06] : [0.35, 0.02, 0.02];
        const emF = k === 0 ? [1.4, 1.45, 1.5] : [0, 0, 0];
        const emR = k === 2 ? tail : [0, 0, 0];
        disc(g, [TRAM_HALF_SIDE_M + dx, CLUSTER_Y_M, z], 1, 0, 0.04, albF, emF);
        disc(g, [-TRAM_HALF_SIDE_M - dx, CLUSTER_Y_M, z], -1, 0, 0.04, albF, emR);
      }
    }
    // 两端观者左侧的上下两盏红灯（车头：观者左 = +z；车尾：观者左 = −z）
    for (const y of STACK_Y_M) {
      const dxF = fanAt(STACK_Z_M);
      disc(g, [TRAM_HALF_SIDE_M + dxF, y, STACK_Z_M], 1, 0, 0.035, [0.35, 0.02, 0.02], [0, 0, 0]);
      disc(g, [-TRAM_HALF_SIDE_M - dxF, y, -STACK_Z_M], -1, 0, 0.035, [0.35, 0.02, 0.02], [1.5, 0.03, 0.025]);
    }
    pole(g, 6);
    // 拉绳（杆头 → 车尾车顶），三点两段、中间下垂
    const rope = [0.55, 0.52, 0.48];
    const r0 = g.pos.length / 3;
    for (const t of [0, 0.5, 1]) for (const side of [-1, 1]) g.vert([t, side, 0], [0, 1, 0], ZONE.Rope, 0, rope);
    for (let k = 0; k < 2; k++) {
      const a = r0 + k * 2;
      g.index.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  } else {
    ring(g, loop, SKIRT_Y_M, 0.65, 0, null);
    ring(g, loop, 0.65, CORNICE_Y_M, 0, null);
    roof(g, loop, [
      [0, CORNICE_Y_M],
      [0.3, ROOF_TOP_M],
    ]);
    g.box([0, 0.12, 0], [2.4, 0.25, 1.6], [0.018, 0.018, 0.02], ['bottom', 'top']);
    pole(g, 3);
  }
  return g.build();
}

/** 弓形车头在横坐标 z 处的外凸量（线性插值 END_FAN）。 */
export function fanAt(z: number): number {
  const f = END_FAN;
  for (let i = 1; i < f.length; i++) {
    const [z0, d0] = f[i - 1]!;
    const [z1, d1] = f[i]!;
    if (z >= z0 && z <= z1) return d0 + ((d1 - d0) * (z - z0)) / (z1 - z0 || 1);
  }
  return 0;
}

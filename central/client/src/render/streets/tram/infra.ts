/**
 * 电车站岛与架空线杆的几何（R2 TRAMS T6 / T8），用街道小物件共用材质（prop-material，实例色）画成实例网格，
 * 只画相机一定距离内的实例（站岛 HIGH 500 m / LOW 200 m，杆 HIGH 300 m / LOW 120 m）。
 *
 * 站岛（局部坐标：x 沿行驶方向，y 离路面，z 向右 = 朝轨道，−z = 一般车道一侧），约 410 个三角形：
 * - 24 × 2.0 m、高 0.18 m 的站台，浅色花岗岩路缘（#8f8c86）；
 * - 14 m 平顶遮篷：底面 2.6 m，檐口 0.45 m 色带（每站一种柔和的颜色，不用营运商的绿色）+ 0.3 m 白边（规格 0.6 + 0.5 m，
 *   近看太厚重，减薄），底面一条冷白灯带（1.2）；
 * - 车道一侧 5 块广告板（2.6 m 一格、1.5 m 高、离台面 0.12 m）：一半是背光灯箱（抽象色块，1.4），一半是空白玻璃；
 * - 没有广告板处是 1.05 m 灰色竖条栏杆，车头一端横拦；车尾（来车一端）一支靠左标（橙色底座、蓝色发光圆牌，无字）；
 * - 车头一端一支空白站牌（不写站名）；遮篷下三个候车的人（简单剪影，深色衣服为主）。
 */
import { InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Camera } from 'three';
import { lightV3 } from '../vehicles';
import { createPropMaterial } from '../prop-material';
import { PropBuilder, linearRGB, type V3 } from '../prop-geometry';

/** 站岛上画几个候车的人（STREETLIFE 的行人系统接上 tramStopIslands() 后可关掉）。 */
export const ISLAND_PEOPLE = false;

const GRANITE = linearRGB('#8f8c86');
const PAVING = linearRGB('#8a8782');
const STEEL = linearRGB('#9aa0a3');
const WHITE = linearRGB('#d9dbd8');
const SOFFIT = linearRGB('#b8bab6');
const DARK = linearRGB('#2a2d30');

/** 只画朝两侧（±z）的细条（栏杆竖条、横杆）。 */
function slat(b: PropBuilder, c: V3, s: V3, alb: V3): void {
  b.box(c, s, { alb }, { bottom: null, top: null, px: null, nx: null });
}

export function islandGeometry(len = 24, width = 2): BufferGeometry {
  const b = new PropBuilder();
  const H = 0.18;
  const hw = width / 2;
  // 站台与路缘；台面在遮篷下的一段有灯带照着（微弱冷白，免得遮篷下一片黑）
  const cl = 14;
  b.box([0, 0, 0], [len, H, width], { alb: GRANITE }, { bottom: null, top: null });
  for (const [xa, xb, lit] of [
    [-len / 2, -cl / 2, false],
    [-cl / 2, cl / 2, true],
    [cl / 2, len / 2, false],
  ] as const)
    b.quad([xa, H, hw], [xb, H, hw], [xb, H, -hw], [xa, H, -hw], lit ? { alb: PAVING, em: lightV3('tubeCool', 0.07) } : { alb: PAVING });
  b.quad([-len / 2, H + 0.004, hw], [len / 2, H + 0.004, hw], [len / 2, H + 0.004, hw - 0.25], [-len / 2, H + 0.004, hw - 0.25], { alb: GRANITE });
  b.quad([-len / 2, H + 0.004, -hw + 0.25], [len / 2, H + 0.004, -hw + 0.25], [len / 2, H + 0.004, -hw], [-len / 2, H + 0.004, -hw], { alb: GRANITE });
  // 遮篷：下段白边（0.5 m）+ 上段色带（0.6 m，part 1 = 每站色）；底面白（灯带照亮，微发光）+ 冷白灯带
  const cy = 2.6;
  b.box([0, cy, 0], [cl, 0.3, width + 0.2], { alb: WHITE }, { top: null, bottom: { alb: SOFFIT, em: lightV3('tubeCool', 0.14) } });
  b.box([0, cy + 0.3, 0], [cl, 0.45, width + 0.2], { part: 1 }, { bottom: null, top: { alb: linearRGB('#5a5c5e') } });
  b.quad([-cl / 2 + 0.4, cy - 0.01, -0.12], [cl / 2 - 0.4, cy - 0.01, -0.12], [cl / 2 - 0.4, cy - 0.01, 0.12], [-cl / 2 + 0.4, cy - 0.01, 0.12], {
    alb: [0.6, 0.6, 0.6],
    em: lightV3('tubeCool', 1.2),
  });
  // 广告板墙（车道一侧）：5 格 × 2.6 m；第 0、2、3 格是背光灯箱：抽象两色块（part 5 = 每站广告色、part 6 = 遮篷色，
  // 发光按颜色、上限 1.2，不会 bloom 成白块；无字、无标志），其余空白玻璃
  const z = -hw + 0.14;
  const panels = 5;
  const mod = 2.6;
  const x0 = -(panels * mod) / 2;
  for (let i = 0; i < panels; i++) {
    const cx = x0 + (i + 0.5) * mod;
    const lit = i === 0 || i === 2 || i === 3;
    const faces = { bottom: null, px: null, nx: null, top: { alb: STEEL } };
    if (!lit) {
      b.box([cx, H + 0.12, z], [mod - 0.16, 1.5, 0.1], { part: 3, alb: linearRGB('#1c2226') }, faces);
      continue;
    }
    // 两块颜色上下分（每块板比例不同）；中间一条暗缝
    const split = i === 0 ? 0.62 : i === 2 ? 0.38 : 0.5;
    const em = lightV3('#ffffff', i === 2 ? 1.15 : 1.0);
    const hA = 1.5 * split;
    b.box([cx, H + 0.12, z], [mod - 0.16, hA - 0.02, 0.1], { part: i === 3 ? 6 : 5, em }, { ...faces, top: null });
    b.box([cx, H + 0.12 + hA, z], [mod - 0.16, 1.5 - hA, 0.1], { part: i === 3 ? 5 : 6, em: lightV3('#ffffff', 0.8) }, faces);
  }
  // 柱（板缝处，撑遮篷）
  for (let i = 0; i <= panels; i++) slat(b, [x0 + i * mod, H, z], [0.1, cy - H, 0.1], STEEL);
  // 栏杆：车道一侧两端（无广告板处）+ 车头一端横拦；横杆 + 竖条（0.35 m 一根）
  const rail = (xa: number, xb: number, zz: number) => {
    const l = xb - xa;
    slat(b, [(xa + xb) / 2, H + 1.0, zz], [l, 0.05, 0.05], STEEL);
    slat(b, [(xa + xb) / 2, H + 0.15, zz], [l, 0.05, 0.05], STEEL);
    for (let x = xa + 0.1; x < xb; x += 0.13) slat(b, [x, H + 0.15, zz], [0.025, 0.88, 0.025], STEEL);
  };
  rail(-len / 2 + 0.2, x0 - 0.1, z);
  rail(-x0 + 0.1, len / 2 - 0.2, z);
  // 车头端横拦（朝 ±x 的竖条）
  for (let zz = -hw + 0.15; zz < hw - 0.1; zz += 0.13) b.box([len / 2 - 0.15, H + 0.15, zz], [0.025, 0.88, 0.025], { alb: STEEL }, { bottom: null, top: null, pz: null, nz: null });
  b.box([len / 2 - 0.15, H + 1.0, 0], [0.05, 0.05, width - 0.3], { alb: STEEL }, { bottom: null, pz: null, nz: null });
  // 靠左标（车尾来车端）：橙色底座 + 蓝色发光圆牌（无字）
  b.box([-len / 2 + 0.3, H, -0.2], [0.34, 0.75, 0.34], { alb: linearRGB('#d67a2a') });
  b.box([-len / 2 + 0.3, H + 0.75, -0.2], [0.06, 0.34, 0.3], { alb: [0.05, 0.08, 0.3], em: lightV3('ledBlue', 1.8) }, { bottom: null, pz: null, nz: null });
  // 站牌（车头端）：深灰牌面、顶上一条站色细条（不写站名、无标志、不发光）
  const sx = len / 2 - 0.6;
  const sz = -hw + 0.3;
  b.box([sx, H, sz], [0.08, 2.4, 0.08], { alb: DARK });
  b.box([sx, H + 2.0, sz], [0.05, 0.5, 0.46], { alb: linearRGB('#3a3d40') }, { bottom: null });
  b.box([sx, H + 2.44, sz], [0.06, 0.06, 0.46], { part: 1 }, { bottom: null });
  // 候车的人（站在遮篷下面朝轨道）：腿、上身、头；衣服深色为主、一件浅色衬衫
  if (ISLAND_PEOPLE) {
    const people: [number, number, string][] = [
      [-3.2, 0.1, '#1f1d1f'],
      [-1.4, 0.35, '#d8d4c8'],
      [2.6, 0.0, '#2c2b30'],
    ];
    const skin = linearRGB('#8a6a55');
    for (const [px, pz, shirt] of people) {
      // 两条腿（深色裤）、收腰的上身、头（顶面是头发）
      for (const lz of [-0.09, 0.09]) b.box([px, H, pz + lz], [0.18, 0.84, 0.13], { alb: linearRGB('#1b1b1f') }, { bottom: null, top: null });
      b.box([px, H + 0.84, pz], [0.24, 0.6, 0.42], { alb: linearRGB(shirt) }, { bottom: null }, [0.9, 0.95]);
      b.box([px, H + 1.47, pz], [0.19, 0.22, 0.17], { alb: skin }, { bottom: null, top: { alb: [0.01, 0.01, 0.01] } });
    }
  }
  return b.build();
}

/**
 * 搭电车时的上层车头内景（R2 修复轮）：坐标以相机为原点（电车局部轴：x 向前、y 向上、z 向右）。
 * 跟车机位贴着车头玻璃（0.3 m），按实际距离画的窗框都在视野外；这里按「坐第二排」的观感把车头墙画在前方 1.1 m
 * （车身此时不画，看不出矛盾）：窗下台面（暗、上沿一条浅色）、两根中窗柱（圆角）、两侧角柱、窗顶横梁、天花与冷白灯管。
 * 整体再按 RIDE_FRAME_SCALE 绕相机放大（透视投影不变），留出与近裁面的余量。约 100 个三角形。
 */
export const RIDE_FRAME_SCALE = 1.5;

export function rideFrameGeometry(): BufferGeometry {
  const b = new PropBuilder();
  const lit = (k: number, alb: V3 = [0.03, 0.03, 0.032]) => ({ alb, em: lightV3('tubeCool', k) });
  const post = lit(0.022, [0.02, 0.02, 0.022]);
  const fx = 1.1;
  const y0 = -0.5;
  const y1 = 0.22;
  const top = 0.36;
  // 车头墙：朝相机（−x）的面（逆时针朝外：z0 → z1 → 上）
  const wall = (z0: number, z1: number, ya: number, yb: number, st: { alb: V3; em: V3 }) =>
    b.quad([fx, ya, z0], [fx, ya, z1], [fx, yb, z1], [fx, yb, z0], st);
  wall(-1.3, 1.3, -1.4, y0, lit(0.02, [0.02, 0.02, 0.022]));
  wall(-1.3, 1.3, y1, top, lit(0.04));
  // 台面上沿（浅一点的一条，向车内伸 0.25 m）+ 边上一道亮线
  b.quad([fx - 0.25, y0, -1.3], [fx - 0.25, y0, 1.3], [fx, y0, 1.3], [fx, y0, -1.3], lit(0.045));
  b.quad([fx - 0.27, y0 - 0.03, -1.3], [fx - 0.27, y0 - 0.03, 1.3], [fx - 0.25, y0, 1.3], [fx - 0.25, y0, -1.3], lit(0.12));
  const posts: [number, number][] = [
    [-1.3, -1.0],
    [-0.45, -0.36],
    [0.36, 0.45],
    [1.0, 1.3],
  ];
  for (const [za, zb] of posts) wall(za, zb, y0, y1, post);
  // 圆角：每扇窗四个角的小三角
  const r = 0.08;
  for (const [za, zb] of [
    [-1.0, -0.45],
    [-0.36, 0.36],
    [0.45, 1.0],
  ] as const) {
    const tri = (p: V3, q: V3, w: V3) => b.quad(q, p, w, w, post);
    tri([fx, y0, za + r], [fx, y0, za], [fx, y0 + r, za]);
    tri([fx, y0, zb], [fx, y0, zb - r], [fx, y0 + r, zb]);
    tri([fx, y1 - r, za], [fx, y1, za], [fx, y1, za + r]);
    tri([fx, y1, zb - r], [fx, y1, zb], [fx, y1 - r, zb]);
  }
  // 天花（朝下）与两条纵向冷白灯管（手机横屏视野大时看得到）
  b.quad([-0.6, top, -1.3], [fx, top, -1.3], [fx, top, 1.3], [-0.6, top, 1.3], lit(0.3, [0.2, 0.2, 0.2]));
  for (const zc of [-0.5, 0.5]) b.quad([-0.6, top - 0.005, zc - 0.03], [fx - 0.02, top - 0.005, zc - 0.03], [fx - 0.02, top - 0.005, zc + 0.03], [-0.6, top - 0.005, zc + 0.03], lit(1.3, [0.6, 0.6, 0.6]));
  return b.build();
}

/** 架空线杆（9 m，锥形方钢管）+ 底座 + 杆帽 + 朝轨道（+x）的挂线耳。 */
export function poleGeometry(): BufferGeometry {
  const b = new PropBuilder();
  const steel = { alb: DARK };
  b.box([0, 0, 0], [0.34, 0.6, 0.34], steel);
  b.box([0, 0.6, 0], [0.2, 8.4, 0.2], steel, { bottom: null, top: null }, [0.75, 0.75]);
  b.box([0, 9.0, 0], [0.18, 0.18, 0.18], steel);
  b.box([0.25, 8.45, 0], [0.4, 0.08, 0.08], steel, { bottom: null, nx: null });
  return b.build();
}

export interface NearItem {
  pos: Vector3;
  matrix: Matrix4;
  /** 实例主色、副色（线性），只在 instanceColours 时用。 */
  body?: V3;
  band?: V3;
}

/** 只画相机 range 米内的实例（相机移动 > 10 m 才重排）。 */
export class NearInstances {
  readonly mesh: InstancedMesh;
  private readonly lastCam = new Vector3(1e9, 0, 0);
  private readonly body: InstancedBufferAttribute | null = null;
  private readonly band: InstancedBufferAttribute | null = null;

  constructor(
    geometry: BufferGeometry,
    private readonly items: readonly NearItem[],
    private readonly range: number,
    name: string,
    instanceColours: boolean,
  ) {
    const cap = Math.max(items.length, 1);
    if (instanceColours) {
      this.body = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      this.band = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      geometry.setAttribute('iBody', this.body);
      geometry.setAttribute('iBand', this.band);
      geometry.setAttribute('iEmit', new InstancedBufferAttribute(new Float32Array(cap).fill(1), 1));
    }
    this.mesh = new InstancedMesh(geometry, createPropMaterial({ instanceColours, warmth: 0.4 }), cap);
    this.mesh.name = name;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  /** 当前画了几个实例。 */
  get drawn(): number {
    return this.mesh.count;
  }

  update(camera: Camera): void {
    const c = camera.position;
    if (this.lastCam.distanceToSquared(c) < 100) return;
    this.lastCam.copy(c);
    let n = 0;
    const r2 = this.range * this.range;
    for (const it of this.items) {
      if (it.pos.distanceToSquared(c) > r2) continue;
      this.mesh.setMatrixAt(n, it.matrix);
      if (this.body && it.body) this.body.setXYZ(n, it.body[0], it.body[1], it.body[2]);
      if (this.band && it.band) this.band.setXYZ(n, it.band[0], it.band[1], it.band[2]);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.body) this.body.needsUpdate = true;
    if (this.band) this.band.needsUpdate = true;
  }
}

/** 由位置、朝向（three xz 单位向量）、缩放拼实例矩阵。 */
export function placeMatrix(p: readonly [number, number, number], dirX: number, dirZ: number, scale: readonly [number, number, number] = [1, 1, 1]): Matrix4 {
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(-dirZ, dirX));
  return new Matrix4().compose(new Vector3(p[0], p[1], p[2]), q, new Vector3(scale[0], scale[1], scale[2]));
}

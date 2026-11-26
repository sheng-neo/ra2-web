/**
 * 电车站岛与架空线杆的几何（R2 TRAMS T6 / T8），用街道小物件共用材质（prop-material，实例色）画成实例网格，
 * 只画相机一定距离内的实例（站岛 HIGH 500 m / LOW 200 m，杆 HIGH 300 m / LOW 120 m）。
 *
 * 站岛（局部坐标：x 沿行驶方向，y 离路面，z 向右 = 朝轨道，−z = 一般车道一侧），约 410 个三角形：
 * - 24 × 2.0 m、高 0.18 m 的站台，浅色花岗岩路缘（#8f8c86）；
 * - 20 m 平顶遮篷（R3）：底面 2.6 m，白色檐板，底面一条冷白灯带（1.2）；
 * - 车道一侧整条灯箱广告墙与檐口灯带、车头一端的站名牌（真实站名、站号）由街道设施网格画（stations/index.ts、furniture.ts），
 *   不在这个实例网格里；
 * - 灯箱墙两端外是 1.05 m 灰色竖条栏杆，车头一端横拦；车尾（来车一端）一支靠左标（橙色底座、蓝色发光圆牌 + 白色斜箭头）；
 * - 遮篷下候车的人由行人系统画。
 */
import { InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Camera } from 'three';
import { lightV3 } from '../vehicles';
import { createPropMaterial } from '../prop-material';
import { PropBuilder, linearRGB, type V3 } from '../prop-geometry';

/** 站岛上画几个候车的人（STREETLIFE 的行人系统接上 tramStopIslands() 后可关掉）。 */
export const ISLAND_PEOPLE = false;

const GRANITE = linearRGB('#a8a294');
const PAVING = linearRGB('#7c7b7d');
const STEEL = linearRGB('#9aa0a3');
const WHITE = linearRGB('#d9dbd8');
const SOFFIT = linearRGB('#b8bab6');
const DARK = linearRGB('#2a2d30');

/** 只画朝两侧（±z）的细条（栏杆竖条、横杆）。 */
function slat(b: PropBuilder, c: V3, s: V3, alb: V3): void {
  b.box(c, s, { alb }, { bottom: null, top: null, px: null, nx: null });
}

/** 站岛灯箱广告墙与遮篷的长度（m，R3 STATIONS：照片 13 的灯箱墙几乎占满整个站岛）。 */
export const ISLAND_WALL_M = 20;
export const ISLAND_CANOPY_M = 20;
/** 遮篷底面离台面（m）。 */
export const ISLAND_CANOPY_Y = 2.6;

export function islandGeometry(len = 24, width = 2): BufferGeometry {
  const b = new PropBuilder();
  const H = 0.18;
  const hw = width / 2;
  // 站台与花岗岩路缘（R3：#a8a294）；台面在遮篷下的一段有灯带照着（微弱冷白，免得遮篷下一片黑）
  const cl = ISLAND_CANOPY_M;
  b.box([0, 0, 0], [len, H, width], { alb: GRANITE }, { bottom: null, top: null });
  for (const [xa, xb, lit] of [
    [-len / 2, -cl / 2, false],
    [-cl / 2, cl / 2, true],
    [cl / 2, len / 2, false],
  ] as const)
    b.quad([xa, H, hw], [xb, H, hw], [xb, H, -hw], [xa, H, -hw], lit ? { alb: PAVING, em: lightV3('tubeCool', 0.07) } : { alb: PAVING });
  b.quad([-len / 2, H + 0.004, hw], [len / 2, H + 0.004, hw], [len / 2, H + 0.004, hw - 0.25], [-len / 2, H + 0.004, hw - 0.25], { alb: GRANITE });
  b.quad([-len / 2, H + 0.004, -hw + 0.25], [len / 2, H + 0.004, -hw + 0.25], [len / 2, H + 0.004, -hw], [-len / 2, H + 0.004, -hw], { alb: GRANITE });
  // 遮篷（R3）：白色平顶，底面灯带照亮（微发光）+ 冷白灯带；车道一侧的檐口灯带由街道设施网格画（stationsFurniture）
  const cy = ISLAND_CANOPY_Y;
  // 复审修正：遮篷底面只是被灯管照亮的一点（0.05），不再是整块发亮的白板；亮的只有中间一条灯管
  b.box([0, cy, 0], [cl, 0.3, width + 0.2], { alb: WHITE }, { top: null, bottom: { alb: SOFFIT, em: lightV3('tubeCool', 0.05) } });
  b.box([0, cy + 0.3, 0.06], [cl, 0.3, width + 0.08], { alb: linearRGB('#d0d2d0') }, { bottom: null, top: { alb: linearRGB('#5a5c5e') } });
  b.quad([-cl / 2 + 0.4, cy - 0.01, -0.12], [cl / 2 - 0.4, cy - 0.01, -0.12], [cl / 2 - 0.4, cy - 0.01, 0.12], [-cl / 2 + 0.4, cy - 0.01, 0.12], {
    alb: [0.6, 0.6, 0.6],
    em: lightV3('tubeCool', 1.2),
  });
  // 遮篷柱（灯箱墙后，5 m 一根）
  const z = -hw + 0.14;
  const wl = ISLAND_WALL_M;
  for (let x = -wl / 2; x <= wl / 2 + 1e-6; x += wl / 4) slat(b, [x, H, z + 0.12], [0.1, cy - H, 0.1], STEEL);
  // 栏杆：灯箱墙两端外（车道一侧）+ 车头一端横拦；横杆 + 竖条（0.13 m 一根）
  const rail = (xa: number, xb: number, zz: number) => {
    const l = xb - xa;
    slat(b, [(xa + xb) / 2, H + 1.0, zz], [l, 0.05, 0.05], STEEL);
    slat(b, [(xa + xb) / 2, H + 0.15, zz], [l, 0.05, 0.05], STEEL);
    for (let x = xa + 0.1; x < xb; x += 0.13) slat(b, [x, H + 0.15, zz], [0.025, 0.88, 0.025], STEEL);
  };
  rail(-len / 2 + 0.2, -wl / 2 - 0.15, z);
  rail(wl / 2 + 0.15, len / 2 - 0.2, z);
  // 车头端横拦（朝 ±x 的竖条）
  for (let zz = -hw + 0.15; zz < hw - 0.1; zz += 0.13) b.box([len / 2 - 0.15, H + 0.15, zz], [0.025, 0.88, 0.025], { alb: STEEL }, { bottom: null, top: null, pz: null, nz: null });
  b.box([len / 2 - 0.15, H + 1.0, 0], [0.05, 0.05, width - 0.3], { alb: STEEL }, { bottom: null, pz: null, nz: null });
  // 靠左标（车尾来车端）：橙黄底座 + 蓝色发光圆牌 + 白色「靠左」斜箭头（R3 P1）
  const kx = -len / 2 + 0.3;
  b.box([kx, H, -0.2], [0.34, 0.75, 0.34], { alb: linearRGB('#d67a2a') });
  b.box([kx, H + 0.75, -0.2], [0.06, 0.34, 0.3], { alb: [0.05, 0.08, 0.3], em: lightV3('ledBlue', 1.8) }, { bottom: null, pz: null, nz: null });
  const ax = kx - 0.032;
  const ac = H + 0.92;
  const white = { alb: [0.6, 0.6, 0.6] as V3, em: lightV3('#ffffff', 1.6) };
  // 从车头方向看（站在 −x 看向 +x），左 = −z：箭头由右上指向左下
  const bar = (u0: number, v0: number, u1: number, v1: number, w: number) => {
    const du = u1 - u0;
    const dv = v1 - v0;
    const l = Math.hypot(du, dv) || 1;
    const pu = (-dv / l) * w;
    const pv = (du / l) * w;
    b.quad([ax, ac + v0 - pv, -0.2 + u0 - pu], [ax, ac + v1 - pv, -0.2 + u1 - pu], [ax, ac + v1 + pv, -0.2 + u1 + pu], [ax, ac + v0 + pv, -0.2 + u0 + pu], white);
  };
  bar(0.07, 0.07, -0.04, -0.04, 0.018);
  b.tri([ax, ac - 0.08, -0.2 - 0.08], [ax, ac - 0.08, -0.2 + 0.01], [ax, ac + 0.01, -0.2 - 0.08], white);
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

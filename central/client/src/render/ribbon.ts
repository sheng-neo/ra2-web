/**
 * 道路带状网格：沿中心折线左右各偏移（斜接，限制斜接长度），从上往下看逆时针。
 * 横截面只有左右两个顶点：外沿 = 车行道半宽 + 该侧人行道宽（逐点给，路口处收窄为 0），
 * 车行道 / 路缘石 / 人行道由 shader 按横向坐标 |across| 与半宽 hw 区分（不加三角形）。
 * 高度：贴地模式左右边各按所在位置取高度；水平模式（level）左右边都取中线高度，横向不倾斜（realism C9）。
 * 高架段可加桥面厚度：两侧侧板 + 底面；水平路面在填方 / 挖方处加竖直的护坡 / 挡土墙面。
 * 侧板、底面、挡土墙的顶点带 FLAG_SIDE，shader 画成混凝土。
 */
import type { FlatXY } from '@central/data';
import { DM_TO_M, simToThree } from '../coords';
import type { HeightFn } from '../data/terrain';
import { MeshArrays, type AttrSpec } from './mesh-arrays';

/**
 * 顶点属性：
 * aRoad   = (沿线距离 m, 横向偏移 m（左正）, 车行道半宽 m, 段长 m)
 * aLane   = (车道数, 标志位 FLAG_*)
 * aLamp   = (路灯间距 m（0 = 无灯）, 相位 m, 排布代码, 钠灯 0/1)
 * aStreet = (灯头高 m, 灯头离中线横距 m, 店铺溢光 0–1, 种子 0–1)
 * aPav    = (左人行道宽 m, 右人行道宽 m)
 * aDir    = 道路前进方向（three 的 xz，单位向量）
 */
export const ROAD_LAYOUT: readonly AttrSpec[] = [
  { name: 'position', size: 3 },
  { name: 'aRoad', size: 4 },
  { name: 'aLane', size: 2 },
  { name: 'aLamp', size: 4 },
  { name: 'aStreet', size: 4 },
  { name: 'aPav', size: 2 },
  { name: 'aDir', size: 2 },
];

/** 标志位（aLane.y）。 */
export const FLAG_ONEWAY = 1;
export const FLAG_PED = 2;
/** 主路：路边画双黄线。 */
export const FLAG_MAIN = 4;
/** 侧板 / 底面 / 挡土墙（混凝土）。 */
export const FLAG_SIDE = 8;
/** 过路处贴片（斑马线）；再加 FLAG_SIGNAL 为灯控过路处（两行路钉 + 停车线，R3）。贴片的 aPav = (过路处中心沿线 m, crossingCode)。 */
export const FLAG_CROSSING = 16;
export const FLAG_SIGNAL = 32;
/** 过路处沿路方向的宽度（dm）。 */
const CROSSING_HALF_DM = 20;
/** 过路处贴片高出路面（dm）。 */
const CROSSING_LIFT_DM = 0.3;

export function newRoadArrays(): MeshArrays {
  return new MeshArrays(ROAD_LAYOUT);
}

export interface RibbonSpec {
  /** 中心线（dm），已去重。 */
  pts: FlatXY;
  /** 车行道半宽（dm）。 */
  halfWidth: number;
  /** 路面高程（dm）：参数为该顶点坐标与沿线距离（dm），左右边分别调用（水平模式只在中线调用）。 */
  height: (x: number, y: number, along: number) => number;
  lanes: number;
  flags: number;
  /** 桥面厚度（dm）；0 表示贴地，不生成侧板。 */
  deck: number;
  /** 每个点左 / 右人行道宽（dm），省略为 0。 */
  pavL?: readonly number[];
  pavR?: readonly number[];
  /** 路灯参数（写进每个顶点的 aLamp），省略为无灯。 */
  lamp?: readonly [number, number, number, number];
  /** aStreet：灯头高 m、灯头横距 m、店铺溢光、种子。 */
  street?: readonly [number, number, number, number];
  /** 横向水平：左右边取中线高度。 */
  level?: boolean;
  /** 各点的水平系数（0 = 贴地，1 = 水平；省略为 1），路口处贴地，与相交道路同一张地面。 */
  levelK?: readonly number[];
  /** 各点中线路面高程（dm），水平模式下代替 height(中线)。 */
  zc?: readonly number[];
  /** 给出时（且 level）在路边与地面高差 > 阈值处生成竖直护坡（填方，朝外）/ 挡土墙（挖方，朝路）。 */
  ground?: HeightFn;
  /** 整合时加：(x, y)（dm）是否在楼宇轮廓内。给出时挡土墙往路外多看几米（遇楼即停），墙顶按坡后最高的地面砌。 */
  blocked?: (x: number, y: number) => boolean;
}

/** 把折线按最大段长重采样（插点，不移动原有点）。 */
export function resample(pts: FlatXY, maxSeg: number): FlatXY {
  const out: FlatXY = [];
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2]!;
    const y = pts[i * 2 + 1]!;
    if (i > 0) {
      const px = pts[i * 2 - 2]!;
      const py = pts[i * 2 - 1]!;
      const steps = Math.ceil(Math.hypot(x - px, y - py) / maxSeg);
      for (let k = 1; k < steps; k++) out.push(px + ((x - px) * k) / steps, py + ((y - py) * k) / steps);
    }
    out.push(x, y);
  }
  return out;
}

/** 贴地加密的最小段长（dm）。 */
const DRAPE_MIN_DM = 25;

/**
 * 贴地重采样：先按 maxSeg 插点，再把中点处地面偏离两端连线超过 tol（dm）的段二分，
 * 直到段长 < 2 × DRAPE_MIN_DM。平地上不加点，坡折处加密，线不会钻进地形。
 */
export function drapeResample(pts: FlatXY, ground: HeightFn, maxSeg: number, tol = 0.5): FlatXY {
  const base = resample(pts, maxSeg);
  const out: FlatXY = [base[0]!, base[1]!];
  const split = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): void => {
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const mz = ground(mx, my);
    if (Math.hypot(bx - ax, by - ay) >= 2 * DRAPE_MIN_DM && Math.abs(mz - (az + bz) / 2) > tol) {
      split(ax, ay, az, mx, my, mz);
      split(mx, my, mz, bx, by, bz);
    } else out.push(bx, by);
  };
  for (let i = 2; i < base.length; i += 2) {
    const ax = base[i - 2]!;
    const ay = base[i - 1]!;
    split(ax, ay, ground(ax, ay), base[i]!, base[i + 1]!, ground(base[i]!, base[i + 1]!));
  }
  return out;
}

const scratch = new Float32Array(21);
const NO_LAMP = [0, 0, 0, 0] as const;
const NO_STREET = [8, 0, 0, 0] as const;

interface Station {
  along: number;
  pavL: number;
  pavR: number;
  dx: number;
  dz: number;
}

function vertex(m: MeshArrays, x: number, y: number, z: number, across: number, st: Station, s: RibbonSpec, len: number, flags: number): number {
  simToThree(x, y, z, scratch, 0);
  const lamp = s.lamp ?? NO_LAMP;
  const street = s.street ?? NO_STREET;
  scratch[3] = st.along * DM_TO_M;
  scratch[4] = across;
  scratch[5] = s.halfWidth * DM_TO_M;
  scratch[6] = len * DM_TO_M;
  scratch[7] = s.lanes;
  scratch[8] = flags;
  for (let k = 0; k < 4; k++) {
    scratch[9 + k] = lamp[k]!;
    scratch[13 + k] = street[k]!;
  }
  scratch[17] = st.pavL * DM_TO_M;
  scratch[18] = st.pavR * DM_TO_M;
  scratch[19] = st.dx;
  scratch[20] = st.dz;
  return m.push(scratch);
}

/** 挡土墙 / 护坡的触发高差（dm）：填方或挖方 > 1.5 m（更小的高差由路廊压低地形、肉眼看不出）。 */
const FILL_DM = 15;
const CUT_DM = 15;
/**
 * 挖方侧的墙顶（整合时加）：从路缘往外按 BACK_DM 逐点取地面最高值（遇到楼宇轮廓即停，不在楼前砌墙挡住铺面），
 * 墙顶最多比路缘地面再高 BACK_RISE_DM。两楼之间的空地若坡脚离人行道几米就陡升（半山罗便臣道），
 * 只按路缘一点的高度砌墙会露出整片被路灯照橙的地形土堆；香港这种地方实际是一道高挡土墙。
 */
const BACK_DM = [20, 40, 70, 100, 140] as const;
const BACK_RISE_DM = 100;

/** 路缘 (x, y) 处供挡土墙用的地面高度；(ox, oy) 为外法线。 */
function cutGround(ground: HeightFn, blocked: ((x: number, y: number) => boolean) | undefined, x: number, y: number, ox: number, oy: number): number {
  const g0 = ground(x, y);
  if (!blocked) return g0;
  let g = g0;
  for (const d of BACK_DM) {
    const bx = x + ox * d;
    const by = y + oy * d;
    if (blocked(bx, by)) break;
    g = Math.max(g, ground(bx, by));
  }
  return Math.min(g, g0 + BACK_RISE_DM);
}

export function addRibbon(m: MeshArrays, s: RibbonSpec): void {
  const p = s.pts;
  const n = p.length >> 1;
  if (n < 2) return;
  const along: number[] = [0];
  for (let i = 1; i < n; i++) {
    along.push(along[i - 1]! + Math.hypot(p[i * 2]! - p[i * 2 - 2]!, p[i * 2 + 1]! - p[i * 2 - 1]!));
  }
  const len = along[n - 1]!;
  if (len <= 0) return;
  const hwM = s.halfWidth * DM_TO_M;
  const skirt = hwM + 0.5;
  const sideFlags = s.flags | FLAG_SIDE;
  const top: { l: number; r: number }[] = [];
  const side: { l: number; r: number; lb: number; rb: number }[] = [];
  // 挡土墙：每点左右边的 (x, y, 路面 z, 地面 z, 横向 m)
  const edges: { L: [number, number, number, number, number]; R: [number, number, number, number, number]; st: Station }[] = [];
  for (let i = 0; i < n; i++) {
    const x = p[i * 2]!;
    const y = p[i * 2 + 1]!;
    let px = 0;
    let py = 0;
    let nx = 0;
    let ny = 0;
    if (i > 0) {
      const d = Math.hypot(x - p[i * 2 - 2]!, y - p[i * 2 - 1]!) || 1;
      px = (x - p[i * 2 - 2]!) / d;
      py = (y - p[i * 2 - 1]!) / d;
    }
    if (i < n - 1) {
      const d = Math.hypot(p[i * 2 + 2]! - x, p[i * 2 + 3]! - y) || 1;
      nx = (p[i * 2 + 2]! - x) / d;
      ny = (p[i * 2 + 3]! - y) / d;
    }
    let tx = px + nx;
    let ty = py + ny;
    let tl = Math.hypot(tx, ty);
    if (tl < 1e-6) {
      tx = px || nx;
      ty = py || ny;
      tl = Math.hypot(tx, ty) || 1;
    }
    tx /= tl;
    ty /= tl;
    // 左法线 (−ty, tx)；斜接长度按与前一段左法线的夹角放大，最多约 2.9 倍
    const lx = -ty;
    const ly = tx;
    const ref = i > 0 ? lx * -py + ly * px : 1;
    const miter = 1 / Math.max(ref, 0.35);
    const pl = s.pavL?.[i] ?? 0;
    const pr = s.pavR?.[i] ?? 0;
    const offL = (s.halfWidth + pl) * miter;
    const offR = (s.halfWidth + pr) * miter;
    const L = [x + lx * offL, y + ly * offL] as const;
    const R = [x - lx * offR, y - ly * offR] as const;
    const st: Station = { along: along[i]!, pavL: pl, pavR: pr, dx: tx, dz: -ty };
    const zc = s.level && s.zc ? s.zc[i]! : s.height(x, y, along[i]!);
    // 贴地：左右边各取所在位置的高度；中线处地面若高出两边连线（路面横跨凸起），整段横截面抬到中线不入地
    let zl = s.height(L[0], L[1], along[i]!);
    let zr = s.height(R[0], R[1], along[i]!);
    const bump = Math.max(0, zc - (zl + zr) / 2);
    zl += bump;
    zr += bump;
    if (s.level) {
      const k = s.levelK?.[i] ?? 1;
      zl += (zc - zl) * k;
      zr += (zc - zr) * k;
    }
    top.push({
      r: vertex(m, R[0], R[1], zr, -(hwM + pr * DM_TO_M), st, s, len, s.flags),
      l: vertex(m, L[0], L[1], zl, hwM + pl * DM_TO_M, st, s, len, s.flags),
    });
    if (s.deck > 0) {
      side.push({
        r: vertex(m, R[0], R[1], zr, -skirt, st, s, len, sideFlags),
        l: vertex(m, L[0], L[1], zl, skirt, st, s, len, sideFlags),
        rb: vertex(m, R[0], R[1], zr - s.deck, -skirt, st, s, len, sideFlags),
        lb: vertex(m, L[0], L[1], zl - s.deck, skirt, st, s, len, sideFlags),
      });
    } else if (s.level && s.ground) {
      edges.push({
        L: [L[0], L[1], zl, cutGround(s.ground, s.blocked, L[0], L[1], lx, ly), hwM + pl * DM_TO_M],
        R: [R[0], R[1], zr, cutGround(s.ground, s.blocked, R[0], R[1], -lx, -ly), -(hwM + pr * DM_TO_M)],
        st,
      });
    }
  }
  for (let i = 0; i + 1 < n; i++) {
    const a = top[i]!;
    const b = top[i + 1]!;
    m.tri(a.r, b.r, b.l);
    m.tri(a.r, b.l, a.l);
    if (s.deck > 0) {
      const c = side[i]!;
      const d = side[i + 1]!;
      // 左侧板朝左外、右侧板朝右外、底面朝下
      m.tri(d.lb, c.lb, c.l);
      m.tri(d.lb, c.l, d.l);
      m.tri(c.rb, d.rb, d.r);
      m.tri(c.rb, d.r, c.r);
      m.tri(c.rb, d.lb, d.rb);
      m.tri(c.rb, c.lb, d.lb);
    }
  }
  if (edges.length === n) addWalls(m, s, edges, len, sideFlags);
}

/** 挡土墙墙顶沿路的最大坡度（墙顶高差 / 沿路距离）。 */
export const WALL_TOP_SLOPE = 0.3;
/** 墙高上限（m）：相邻点地面高度差都不到 1 m（确实是一整片高坡）时放宽到 BACK_RISE_DM。 */
export const WALL_CAP_M = 6;
/** 比这短（m，沿路）的一段挡土墙不画（零星的三角块比没有更假）。 */
export const WALL_MIN_RUN_M = 8;

/**
 * 挖方侧挡土墙的墙顶（离路面的高度，dm，0 = 不画）：
 * 1. 每点要挡的高差 = 地面 − 路面（≤ 0 不要）；
 * 2. 前后各两点取最大（墙顶连成水平 / 台阶，不随单点地形起伏成尖顶）；
 * 3. 封顶 WALL_CAP_M（相邻点地面差都 < 1 m 时放宽）；
 * 4. 沿路坡度 ≤ WALL_TOP_SLOPE（前后两遍）；
 * 5. 低于 CUT_DM 的点不画；连续一段短于 WALL_MIN_RUN_M 的整段不画。
 * 纯函数（测试用）：road、ground 为各点路面与地面高度（dm），along 为沿线距离（dm）。
 */
export function cutWallHeights(road: readonly number[], ground: readonly number[], along: readonly number[]): number[] {
  const n = road.length;
  const want = road.map((r, i) => Math.max(ground[i]! - r, 0));
  const h = want.map((_, i) => {
    let m = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) m = Math.max(m, want[j]!);
    const agree = (i === 0 || Math.abs(ground[i - 1]! - ground[i]!) < 10) && (i === n - 1 || Math.abs(ground[i + 1]! - ground[i]!) < 10);
    return Math.min(m, agree ? BACK_RISE_DM : WALL_CAP_M * 10);
  });
  for (let i = 1; i < n; i++) h[i] = Math.min(h[i]!, h[i - 1]! + WALL_TOP_SLOPE * (along[i]! - along[i - 1]!));
  for (let i = n - 2; i >= 0; i--) h[i] = Math.min(h[i]!, h[i + 1]! + WALL_TOP_SLOPE * (along[i + 1]! - along[i]!));
  const out = h.map((v) => (v > CUT_DM ? v : 0));
  // 去掉过短的段
  let i = 0;
  while (i < n) {
    if (out[i]! <= 0) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && out[j + 1]! > 0) j++;
    if (along[j]! - along[i]! < WALL_MIN_RUN_M * 10) for (let k = i; k <= j; k++) out[k] = 0;
    i = j + 1;
  }
  return out;
}

/**
 * 水平路面两侧的竖直墙面。
 * - 填方（路高于地面 > FILL_DM）：护坡从地面 − 0.5 m 到路面，朝外（从坡下看得到）；
 * - 挖方：墙顶按 cutWallHeights（水平 / 台阶状、限坡、封顶、去掉短段），朝路；一段墙的两头是竖直的端面，
 *   不再出现「一端 0、一端几米」的三角形尖顶（半山罗便臣道尽头、皇后大道西的楔形块）。
 */
function addWalls(
  m: MeshArrays,
  s: RibbonSpec,
  edges: { L: [number, number, number, number, number]; R: [number, number, number, number, number]; st: Station }[],
  len: number,
  flags: number,
): void {
  const alongs = edges.map((e) => e.st.along);
  for (const key of ['L', 'R'] as const) {
    const left = key === 'L';
    const es = edges.map((e) => e[key]);
    const cut = cutWallHeights(
      es.map((e) => e[2]),
      es.map((e) => e[3]),
      alongs,
    );
    for (let i = 0; i + 1 < es.length; i++) {
      const a = es[i]!;
      const b = es[i + 1]!;
      const fa = a[2] - a[3];
      const fb = b[2] - b[3];
      let loA: number;
      let hiA: number;
      let loB: number;
      let hiB: number;
      let outward: boolean;
      if (cut[i]! > 0 && cut[i + 1]! > 0) {
        loA = a[2] - 5;
        loB = b[2] - 5;
        hiA = a[2] + cut[i]! + 3;
        hiB = b[2] + cut[i + 1]! + 3;
        outward = false;
      } else if (fa > FILL_DM && fb > FILL_DM / 2) {
        loA = a[3] - 5;
        loB = Math.min(b[3], b[2]) - 5;
        hiA = a[2];
        hiB = b[2];
        outward = true;
      } else if (fb > FILL_DM && fa > FILL_DM / 2) {
        loA = Math.min(a[3], a[2]) - 5;
        loB = b[3] - 5;
        hiA = a[2];
        hiB = b[2];
        outward = true;
      } else continue;
      const ab = vertex(m, a[0], a[1], loA, a[4], edges[i]!.st, s, len, flags);
      const at = vertex(m, a[0], a[1], hiA, a[4], edges[i]!.st, s, len, flags);
      const bb = vertex(m, b[0], b[1], loB, b[4], edges[i + 1]!.st, s, len, flags);
      const bt = vertex(m, b[0], b[1], hiB, b[4], edges[i + 1]!.st, s, len, flags);
      // 填方（路高于地面）：左墙朝左外 = 与高架左侧板同绕向；挖方反过来朝路
      if (outward === left) {
        m.tri(bb, ab, at);
        m.tri(bb, at, bt);
      } else {
        m.tri(ab, bb, bt);
        m.tri(ab, bt, at);
      }
    }
  }
}

/** 灯控过路处贴片沿路方向的半宽（dm）：两行路钉（±1.4 m）+ 两头停车线（±3.1 m）。 */
const STUD_HALF_DM = 36;
/** 路缘外的触觉引导砖贴片最深（dm）与需要的最窄人行道（dm）。 */
const PAD_DEEP_DM = 18;
const PAD_MIN_PAV_DM = 14;

/**
 * 过路处贴片代码（写进贴片顶点 aPav.y）：(单行方向 + 1) + 3 × 左侧有路缘 + 6 × 右侧有路缘。纯函数，测试用。
 * 着色器解码：dir = mod(k, 3) − 1，左 = mod(floor(k / 3), 2)，右 = floor(k / 6)。
 */
export function crossingCode(oneway: 0 | 1 | -1, kerbL: boolean, kerbR: boolean): number {
  return oneway + 1 + (kerbL ? 3 : 0) + (kerbR ? 6 : 0);
}

/**
 * 过路处贴片：在沿线 s（dm）处横跨整条车行道的四边形，比路面高 3 cm，与路面同材质同属性（路灯光斑一致）。
 * R3 STATIONS：斑马线贴片沿路 ±2 m；灯控过路处（signal）±3.6 m（两行路钉 + 停车线，见 materials/road.ts）。
 * 两侧有 ≥ 1.4 m 人行道时，贴片再伸出路缘外 ≤ 1.8 m（降低的路缘 + 1.2 m 黄色触觉警示砖）；aPav = (中心沿线 m, crossingCode)。
 * quiet（离敏感区太近）：不伸出路缘、不写望右，只画车行道上的路钉 / 斑马线。
 * 水平模式用中线高度，贴地模式逐点取高度。
 */
export function addCrossing(m: MeshArrays, s: RibbonSpec, at: number, signal: boolean, oneway: 0 | 1 | -1 = 0, quiet = false): void {
  const p = s.pts;
  const n = p.length >> 1;
  if (n < 2) return;
  const along: number[] = [0];
  for (let i = 1; i < n; i++) along.push(along[i - 1]! + Math.hypot(p[i * 2]! - p[i * 2 - 2]!, p[i * 2 + 1]! - p[i * 2 - 1]!));
  const len = along[n - 1]!;
  const flags = s.flags | FLAG_CROSSING | (signal ? FLAG_SIGNAL : 0);
  const half = signal ? STUD_HALF_DM : CROSSING_HALF_DM;
  // 过路处中心的人行道宽（dm）
  let ic = 0;
  while (ic < n - 2 && along[ic + 1]! < at) ic++;
  const pavAt = (arr: readonly number[] | undefined) => (arr ? Math.min(arr[ic] ?? 0, arr[ic + 1] ?? 0) : 0);
  const pl = !quiet && pavAt(s.pavL) >= PAD_MIN_PAV_DM ? Math.min(pavAt(s.pavL), PAD_DEEP_DM) : 0;
  const pr = !quiet && pavAt(s.pavR) >= PAD_MIN_PAV_DM ? Math.min(pavAt(s.pavR), PAD_DEEP_DM) : 0;
  // 望右字画在有路缘（有人行道）的一侧；quiet（近敏感区）两侧都不画
  const code = crossingCode(oneway, pl > 0, pr > 0);
  // 横向四个断点（dm，左正）：右人行道外沿、右路缘、左路缘、左人行道外沿
  const cuts = [-(s.halfWidth + pr), -s.halfWidth, s.halfWidth, s.halfWidth + pl];
  const ends: number[][] = [];
  for (const a of [Math.max(at - half, 0), Math.min(at + half, len)]) {
    let i = 0;
    while (i < n - 2 && along[i + 1]! < a) i++;
    const seg = along[i + 1]! - along[i]! || 1;
    const t = Math.min(Math.max((a - along[i]!) / seg, 0), 1);
    const dx = (p[i * 2 + 2]! - p[i * 2]!) / seg;
    const dy = (p[i * 2 + 3]! - p[i * 2 + 1]!) / seg;
    const x = p[i * 2]! + dx * seg * t;
    const y = p[i * 2 + 1]! + dy * seg * t;
    const zc = s.level && s.zc ? s.zc[i]! + (s.zc[i + 1]! - s.zc[i]!) * t : s.height(x, y, a);
    const st: Station = { along: a, pavL: at, pavR: code * 10, dx, dz: -dy };
    ends.push(
      cuts.map((c) => {
        const vx = x - dy * c;
        const vy = y + dx * c;
        const z = (s.level ? zc : s.height(vx, vy, a)) + CROSSING_LIFT_DM;
        return vertex(m, vx, vy, z, c * DM_TO_M, st, s, len, flags);
      }),
    );
  }
  const [A, B] = ends as [number[], number[]];
  for (let k = 0; k < 3; k++) {
    if ((k === 0 && pr <= 0) || (k === 2 && pl <= 0)) continue;
    m.tri(A[k]!, B[k]!, B[k + 1]!);
    m.tri(A[k]!, B[k + 1]!, A[k + 1]!);
  }
}

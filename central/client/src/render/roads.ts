/**
 * 道路 → 按块的带状网格。画可驾驶道路和行人街；人行道（footway）、台阶、小径不画成路面；隧道不画。
 * 宽度 = 车道数 × 3.3 m × 1.3（ROAD_WIDTH_SCALE），可驾驶路至少 4 m。
 * 地面道路两侧加 2–3.5 m 人行道（与车行道同一条带，shader 画路缘石和铺砖），路口处收窄为 0：
 * 人行道上的点若落在别的可驾驶道路车行道内，就不画该处人行道（沿线每 2 m 判一次，交界处插点、3 m 渐变）。
 * 路面贴地形：中线按 data/terrain 的 HeightFn 取高度，统一离地 0.1 m，同高度重叠处再按道路等级给极小抬升。
 * 地面道路横向水平（左右边取中线高度，realism C9）；填挖方处由 ribbon 补竖直护坡 / 挡土墙，
 * 地形网格在路廊下压低（road-corridor.ts），不会顶穿路面。
 * 高架：Overture/OSM 的 level 是叠放次序，不是高度。只把 level 1–2（以及标了 bridge 的更高层）当高架，
 * 一律最多抬 2 层 × 6 m；level ≥ 3 又没标 bridge 的（裙楼、停车场顶层的楼层号误标）按地面画。
 * 高架端点若接在地面道路的端点上，就在该端做引道坡。
 *
 * planRoads 产出的 RoadPlan 是路面、路灯、车道共用的唯一几何来源（同一组重采样点与沿线距离）。
 */
import type { FlatXY, Props, Road, RoadClass } from '@central/data';
import type { HeightFn } from '../data/terrain';
import { cleanRing } from '../geom/ring';
import { streetWarmth } from './materials/lighting';
import { groupByChunk, polylineChunk, type ChunkCoord } from './chunks';
import type { MeshArrays } from './mesh-arrays';
import { FLAG_MAIN, FLAG_ONEWAY, FLAG_PED, addCrossing, addRibbon, drapeResample, newRoadArrays } from './ribbon';
import {
  LampPattern,
  POLE_KERB_OFFSET_M,
  lampRule,
  seedOf,
  snapToReal,
  sodiumProbability,
  unit,
  type LampPatternCode,
} from './streets/lamp-placement';

export const LANE_W_M = 3.3;
export const ROAD_WIDTH_SCALE = 1.3;
const LEVEL_H_DM = 60;
const MAX_TIERS = 2;
const DECK_DM = 12;
const RAMP_DM = 800;
const RESAMPLE_DM = 160;

/** 所有路面统一离地 0.1 m：地形网格是 10 m 三角面，路面顶点虽贴地，两点之间仍可能被坡折顶穿。 */
const DRAPE_DM = 1;

/** 各等级在 DRAPE_DM 之上的额外抬升（dm），让主路标线压住支路；未列出的等级不画。 */
const LIFT_DM: Partial<Record<RoadClass, number>> = {
  motorway: 1.4,
  trunk: 1.4,
  primary: 1.2,
  secondary: 1.0,
  tertiary: 0.8,
  residential: 0.7,
  unclassified: 0.7,
  living_street: 0.7,
  service: 0.6,
  unknown: 0.6,
  pedestrian: 0.5,
};

/** 人行道宽（dm），只给地面可驾驶道路；未列出的等级没有人行道。 */
const PAVEMENT_DM: Partial<Record<RoadClass, number>> = {
  trunk: 30,
  primary: 35,
  secondary: 30,
  tertiary: 28,
  residential: 22,
  unclassified: 22,
  living_street: 22,
};

/** 店铺溢光强度（0–1，乘地区系数）：商业街最亮，住宅支路弱。 */
const SHOPS: Partial<Record<RoadClass, number>> = {
  primary: 1,
  secondary: 1,
  tertiary: 0.9,
  trunk: 0.5,
  residential: 0.5,
  unclassified: 0.5,
  living_street: 0.6,
  pedestrian: 1,
  service: 0.25,
};

const MAIN_CLASSES: ReadonlySet<RoadClass> = new Set(['motorway', 'trunk', 'primary', 'secondary']);

export function isRendered(r: Road): boolean {
  return LIFT_DM[r.cls] !== undefined && !r.tunnel;
}

/** 可驾驶（有车流）的道路等级。 */
export function isDrivable(r: Road): boolean {
  return isRendered(r) && r.cls !== 'pedestrian';
}

/** 半宽（dm）。 */
export function roadHalfWidth(r: Road): number {
  if (r.cls === 'pedestrian') return 20;
  const w = Math.max(Math.max(r.lanes, 1) * LANE_W_M * ROAD_WIDTH_SCALE, 4);
  return w * 5;
}

const endKey = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;

/** 渲染用的高架层数 0..MAX_TIERS（0 = 贴地）。 */
export function elevationTiers(r: Road): number {
  const level = r.level ?? 0;
  if (level < 1 || (level > MAX_TIERS && !r.bridge)) return 0;
  return Math.min(level, MAX_TIERS);
}

/** 一条路的路灯参数（路面 shader 与灯头精灵共用）。 */
export interface LampPlan {
  /** 间距（m）。 */
  spacing: number;
  /** 第 0 盏灯的沿线位置（m），0 ≤ phase < spacing。 */
  phase: number;
  pattern: LampPatternCode;
  sodium: boolean;
  /** 灯头离路面高度（m）。 */
  headH: number;
  /** 灯头离中线横距（m，正值；左右由 side 决定）。 */
  inset: number;
  /** 灯杆离中线横距（m）。 */
  poleLat: number;
  postTop: boolean;
}

export interface RoadPlan {
  road: Road;
  /** 在输入数组里的下标。 */
  index: number;
  /** 重采样后的中线（dm）。 */
  pts: FlatXY;
  /** 各点沿线距离（dm）。 */
  along: number[];
  /** 全长（dm）。 */
  len: number;
  /** 车行道半宽（dm）。 */
  hw: number;
  /** 各点左右人行道宽（dm）。 */
  pavL: number[];
  pavR: number[];
  /** 路面高程（dm）：中线位置 (x, y) 与沿线距离 s（dm）。 */
  height: (x: number, y: number, s: number) => number;
  /** 各点中线路面高程（dm）：水平段按沿线 ±12 m 平滑过（路面纵坡不跟着 10 m 地形网格起伏）。 */
  zc: number[];
  /** 高架抬升（dm），0 = 地面。 */
  elev: number;
  /** 地面道路横向水平。 */
  level: boolean;
  /** 各点横向水平系数（0 = 贴地，1 = 水平；路口内为 0）。 */
  levelK: number[];
  lamps: LampPlan | null;
  /** 店铺溢光 0–1。 */
  shops: number;
  /** 0–1 的稳定随机数（shader 种子）。 */
  seed: number;
  /** 路面上的过路处：沿线位置（dm）、是否有交通灯（有灯画两道横线 + 路钉，否则斑马线）。 */
  crossings: { s: number; signal: boolean }[];
}

/** 可驾驶道路车行道的线段空间索引（判人行道是否落进别的路）。 */
class SegmentGrid {
  private readonly cells = new Map<string, number[]>();
  /** [ax, ay, bx, by, 半宽, 路下标] 逐段平铺。 */
  readonly segs: number[] = [];
  constructor(private readonly cell: number) {}

  add(ax: number, ay: number, bx: number, by: number, hw: number, owner: number): void {
    const id = this.segs.length / 6;
    this.segs.push(ax, ay, bx, by, hw, owner);
    const r = hw;
    const x0 = Math.floor((Math.min(ax, bx) - r) / this.cell);
    const x1 = Math.floor((Math.max(ax, bx) + r) / this.cell);
    const y0 = Math.floor((Math.min(ay, by) - r) / this.cell);
    const y1 = Math.floor((Math.max(ay, by) + r) / this.cell);
    for (let i = x0; i <= x1; i++)
      for (let j = y0; j <= y1; j++) {
        const k = `${i},${j}`;
        const list = this.cells.get(k);
        if (list) list.push(id);
        else this.cells.set(k, [id]);
      }
  }

  /** 点是否落在（除 owner 外）某条路的车行道里（再放宽 margin dm）。 */
  inside(x: number, y: number, owner: number, margin: number, elev: number, elevOf: (owner: number) => number): boolean {
    const list = this.cells.get(`${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`);
    if (!list) return false;
    for (const id of list) {
      const o = id * 6;
      const who = this.segs[o + 5]!;
      if (who === owner || elevOf(who) !== elev) continue;
      const ax = this.segs[o]!;
      const ay = this.segs[o + 1]!;
      const dx = this.segs[o + 2]! - ax;
      const dy = this.segs[o + 3]! - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / l2, 0), 1) : 0;
      const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
      if (d < this.segs[o + 4]! + margin) return true;
    }
    return false;
  }
}

/** 沿折线在沿线距离 s（dm）处插值（along 为各点沿线距离）。 */
export function pointAt(pts: FlatXY, along: readonly number[], s: number): { x: number; y: number; tx: number; ty: number } {
  const n = along.length;
  let i = 0;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (along[mid]! <= s) lo = mid;
    else hi = mid;
  }
  i = lo;
  const j = Math.min(i + 1, n - 1);
  const seg = along[j]! - along[i]! || 1;
  const t = Math.min(Math.max((s - along[i]!) / seg, 0), 1);
  const ax = pts[i * 2]!;
  const ay = pts[i * 2 + 1]!;
  const bx = pts[j * 2]!;
  const by = pts[j * 2 + 1]!;
  const l = Math.hypot(bx - ax, by - ay) || 1;
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, tx: (bx - ax) / l, ty: (by - ay) / l };
}

function cumulative(pts: FlatXY): number[] {
  const along = [0];
  for (let i = 2; i < pts.length; i += 2) along.push(along[along.length - 1]! + Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!));
  return along;
}

/** 人行道判定步长（dm）与人行道收口渐变长度（dm）。 */
const PAV_STEP_DM = 20;
const PAV_TAPER_DM = 30;
/** 纵断面平滑尺度（dm）。 */
const SMOOTH_DM = 60;

/**
 * 给一条路沿线定「站点」：原有重采样点 + 人行道有 / 无交界处插点。每站给出左右人行道宽（dm）：
 * 该侧人行道中线或外沿落进别的路的车行道 → 0（路口收口），交界两侧各 PAV_TAPER_DM / 2 渐变。
 * blocked(x, y) 判断某点是否落进别的路。路口处的高度对齐由 matchJunctions 负责（横向始终水平）。
 */
function stationsFor(
  pts: FlatXY,
  width: number,
  hw: number,
  blocked: (x: number, y: number) => boolean,
): { pts: FlatXY; pavL: number[]; pavR: number[]; levelK: number[] } {
  const along = cumulative(pts);
  const len = along[along.length - 1]!;
  if (len <= 0) {
    const zero = along.map(() => 0);
    return { pts, pavL: zero, pavR: [...zero], levelK: along.map(() => 1) };
  }
  const at = (s: number, off: number): boolean => {
    const p = pointAt(pts, along, s);
    return blocked(p.x - p.ty * off, p.y + p.tx * off);
  };
  // 逐 PAV_STEP_DM 判一次
  const steps = Math.max(1, Math.ceil(len / PAV_STEP_DM));
  const okL: boolean[] = [];
  const okR: boolean[] = [];
  for (let k = 0; k <= steps; k++) {
    const s = (len * k) / steps;
    const edge = hw + width;
    okL.push(width > 0 && !at(s, hw + width * 0.5) && !at(s, edge));
    okR.push(width > 0 && !at(s, -(hw + width * 0.5)) && !at(s, -edge));
  }
  const idx = (s: number) => Math.min(Math.max(Math.round((s / len) * steps), 0), steps);
  const extra = new Set<number>();
  const mark = (flags: boolean[], taper: number) => {
    for (let k = 1; k <= steps; k++) {
      if (flags[k] === flags[k - 1]) continue;
      const mid = (len * (k - 0.5)) / steps;
      extra.add(Math.max(0, mid - taper / 2));
      extra.add(Math.min(len, mid + taper / 2));
    }
  };
  mark(okL, PAV_TAPER_DM);
  mark(okR, PAV_TAPER_DM);
  const stations = [...along];
  for (const s of extra) if (!along.some((a) => Math.abs(a - s) < 2)) stations.push(s);
  stations.sort((a, b) => a - b);
  const out: FlatXY = [];
  const pavL: number[] = [];
  const pavR: number[] = [];
  const levelK: number[] = [];
  for (const s of stations) {
    const p = pointAt(pts, along, s);
    out.push(p.x, p.y);
    pavL.push(okL[idx(s)] ? width : 0);
    pavR.push(okR[idx(s)] ? width : 0);
    levelK.push(1);
  }
  return { pts: out, pavL, pavR, levelK };
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

const planCache = new WeakMap<readonly Road[], RoadPlan[]>();

/** 上一次为这组道路算好的规划（地形网格的路廊压低要用；没有就现算）。 */
export function cachedRoadPlans(roads: readonly Road[], ground: HeightFn): RoadPlan[] {
  return planCache.get(roads) ?? planRoads(roads, ground);
}

/**
 * 全部要画的道路的规划。props.streetLamps：真实路灯（dm 扁平坐标），用来对齐所在道路的相位与灯侧；
 * props.crossings / signals：过路处落到最近的可驾驶道路上（附近 15 m 内有交通灯的画成灯控过路处）。
 */
export function planRoads(roads: readonly Road[], ground: HeightFn, props: Partial<Pick<Props, 'streetLamps' | 'crossings' | 'signals'>> = {}): RoadPlan[] {
  const streetLamps = props.streetLamps ?? [];
  const drawn: { r: Road; index: number }[] = [];
  roads.forEach((r, index) => {
    if (isRendered(r)) drawn.push({ r, index });
  });
  const gradeEnds = new Set<string>();
  for (const { r } of drawn) {
    if (elevationTiers(r) > 0 || r.cls === 'pedestrian') continue;
    const n = r.pts.length >> 1;
    gradeEnds.add(endKey(r.pts[0]!, r.pts[1]!));
    gradeEnds.add(endKey(r.pts[n * 2 - 2]!, r.pts[n * 2 - 1]!));
  }
  // 可驾驶道路车行道索引（判人行道是否压到别的路）
  const grid = new SegmentGrid(400);
  const tierOf = new Map<number, number>();
  for (const { r, index } of drawn) {
    tierOf.set(index, elevationTiers(r));
    if (r.cls === 'pedestrian') continue;
    const p = cleanRing(r.pts);
    const hw = roadHalfWidth(r);
    for (let i = 2; i < p.length; i += 2) grid.add(p[i - 2]!, p[i - 1]!, p[i]!, p[i + 1]!, hw, index);
  }
  const tier = (i: number) => tierOf.get(i) ?? 0;
  // 真实路灯的空间索引
  const real: [number, number][] = [];
  for (let i = 0; i + 1 < streetLamps.length; i += 2) real.push([streetLamps[i]!, streetLamps[i + 1]!]);
  const usedReal = new Set<number>();

  const plans: RoadPlan[] = [];
  for (const { r, index } of drawn) {
    const raw = cleanRing(r.pts);
    const n = raw.length >> 1;
    if (n < 2) continue;
    const tiers = elevationTiers(r);
    const elev = tiers * LEVEL_H_DM;
    const startGrade = elev > 0 && gradeEnds.has(endKey(raw[0]!, raw[1]!));
    const endGrade = elev > 0 && gradeEnds.has(endKey(raw[n * 2 - 2]!, raw[n * 2 - 1]!));
    const hw = roadHalfWidth(r);
    const pavW = elev > 0 ? 0 : (PAVEMENT_DM[r.cls] ?? 0);
    const draped = drapeResample(raw, ground, RESAMPLE_DM);
    const st = stationsFor(draped, pavW, hw, (x, y) => grid.inside(x, y, index, 5, tiers, tier));
    const pts = st.pts;
    const along = cumulative(pts);
    const len = along[along.length - 1]!;
    if (len <= 0) continue;
    const ramp = startGrade && endGrade ? Math.min(RAMP_DM, len / 2) : Math.min(RAMP_DM, len);
    const lift = LIFT_DM[r.cls]!;
    const height = (x: number, y: number, s: number) => {
      let k = 1;
      if (startGrade) k = Math.min(k, s / ramp);
      if (endGrade) k = Math.min(k, (len - s) / ramp);
      return ground(x, y) + DRAPE_DM + lift + elev * Math.max(0, k);
    };
    // 中线纵断面：水平段按沿线高斯平滑（σ 6 m）；路口处再由 matchJunctions 对齐到等级更高的相交道路
    const zraw = along.map((s, i) => height(pts[i * 2]!, pts[i * 2 + 1]!, s));
    const levelled = elev === 0;
    const zc = zraw.map((z, i) => {
      if (!levelled) return z;
      let sw = 0;
      let sz = 0;
      for (let j = 0; j < zraw.length; j++) {
        const d = along[j]! - along[i]!;
        if (d < -SMOOTH_DM * 2) continue;
        if (d > SMOOTH_DM * 2) break;
        const w = Math.exp(-(d * d) / (2 * SMOOTH_DM * SMOOTH_DM));
        sw += w;
        sz += w * zraw[j]!;
      }
      return sz / sw;
    });
    const seed = seedOf(r.id);
    // 灯色按街名定（同一条街各段一致），没有街名时按段
    const lampSeed = seedOf(r.name?.en ?? r.name?.zh ?? r.id);
    // 路灯
    const mid = pointAt(pts, along, len / 2);
    const g = ground(mid.x, mid.y) / 10;
    const warmth = streetWarmth(mid.x / 10, mid.y / 10, g);
    const rule = lampRule(r.cls, r.lanes, unit(seed, 1) < 0.5 ? 1 : -1, g > 60);
    let lamps: LampPlan | null = null;
    if (rule) {
      let phase = unit(seed, 2) * rule.spacing;
      let pattern = rule.pattern;
      // 对齐路旁的真实路灯（离中线 ≤ 半宽 + 人行道 + 4 m、在路段范围内）
      const reach = hw + pavW + 40;
      for (let k = 0; k < real.length; k++) {
        if (usedReal.has(k)) continue;
        const [lx, ly] = real[k]!;
        const hit = projectOnto(pts, along, lx, ly);
        if (hit.d > reach || hit.s < 10 || hit.s > len - 10) continue;
        usedReal.add(k);
        const snapped = snapToReal(rule.spacing, pattern, hit.s / 10, hit.side);
        phase = snapped.phase;
        pattern = snapped.pattern;
        break;
      }
      const hwM = hw / 10;
      lamps = {
        spacing: rule.spacing,
        phase,
        pattern,
        sodium: unit(lampSeed, 3) < sodiumProbability(r.cls, warmth),
        headH: rule.headH,
        inset: rule.postTop ? Math.max(hwM - 0.4, 0.5) : Math.max(hwM + POLE_KERB_OFFSET_M - rule.overhang, 0.5),
        poleLat: rule.postTop ? Math.max(hwM - 0.4, 0.5) : hwM + POLE_KERB_OFFSET_M,
        postTop: rule.postTop,
      };
    }
    const hill = smooth(40, 90, g);
    plans.push({
      road: r,
      index,
      pts,
      along,
      len,
      hw,
      pavL: st.pavL,
      pavR: st.pavR,
      height,
      elev,
      level: levelled,
      levelK: st.levelK,
      zc,
      lamps,
      shops: (SHOPS[r.cls] ?? 0.3) * (1 - 0.75 * hill),
      seed: unit(seed, 4),
      crossings: [],
    });
  }
  matchJunctions(plans);
  assignCrossings(plans, props.crossings ?? [], props.signals ?? []);
  planCache.set(roads, plans);
  return plans;
}

/** 过路处 → 最近的地面可驾驶道路（离中线 ≤ 半宽 + 4 m，离路段两端 ≥ 2 m，同一路上相距 ≥ 8 m）。 */
function assignCrossings(plans: RoadPlan[], crossings: FlatXY, signals: FlatXY): void {
  const cand = plans.filter((p) => p.elev === 0 && p.road.cls !== 'pedestrian' && p.road.cls !== 'service');
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const x = crossings[i]!;
    const y = crossings[i + 1]!;
    let best: { p: RoadPlan; s: number; d: number } | null = null;
    for (const p of cand) {
      // 粗筛：包围盒
      const hit = projectOnto(p.pts, p.along, x, y);
      if (hit.d < p.hw + 40 && (!best || hit.d < best.d)) best = { p, s: hit.s, d: hit.d };
    }
    if (!best || best.s < 20 || best.s > best.p.len - 20) continue;
    if (best.p.crossings.some((c) => Math.abs(c.s - best.s) < 80)) continue;
    let signal = false;
    for (let k = 0; k + 1 < signals.length; k += 2) if (Math.hypot(signals[k]! - x, signals[k + 1]! - y) < 150) signal = true;
    best.p.crossings.push({ s: best.s, signal });
  }
}

/** 道路等级的优先次序（路口处低等级道路的路面高度对齐到高等级道路）。 */
const RANK: Partial<Record<RoadClass, number>> = {
  motorway: 9,
  trunk: 8,
  primary: 7,
  secondary: 6,
  tertiary: 5,
  residential: 4,
  unclassified: 4,
  living_street: 4,
  unknown: 3,
  service: 2,
  pedestrian: 1,
};
/** 路口高度对齐的渐变距离（dm）。 */
const JUNCTION_BLEND_DM = 100;

/**
 * 路口高度对齐：按等级从高到低处理；某条（水平的）路中线落进已处理的更高等级道路车行道内的点，
 * 中线高度改成那条路在该处的路面高度（低 2 cm，让高等级路的标线压在上面），前后 10 m 渐变。
 * 两条路在路口就在同一高度上，不会出现一条翘起、一条埋下的「台阶」。
 */
function matchJunctions(plans: RoadPlan[]): void {
  const order = plans.map((_, i) => i);
  const rank = (p: RoadPlan) => RANK[p.road.cls] ?? 0;
  order.sort((a, b) => rank(plans[b]!) - rank(plans[a]!) || plans[b]!.len - plans[a]!.len);
  const cell = 400;
  const cells = new Map<string, number[]>();
  /** [plan, ax, ay, bx, by, s0] 逐段 */
  const segs: number[][] = [];
  const add = (pi: number) => {
    const p = plans[pi]!;
    for (let i = 1; i < p.along.length; i++) {
      const ax = p.pts[i * 2 - 2]!;
      const ay = p.pts[i * 2 - 1]!;
      const bx = p.pts[i * 2]!;
      const by = p.pts[i * 2 + 1]!;
      const id = segs.length;
      segs.push([pi, ax, ay, bx, by, p.along[i - 1]!]);
      const r = p.hw;
      for (let gx = Math.floor((Math.min(ax, bx) - r) / cell); gx <= Math.floor((Math.max(ax, bx) + r) / cell); gx++)
        for (let gy = Math.floor((Math.min(ay, by) - r) / cell); gy <= Math.floor((Math.max(ay, by) + r) / cell); gy++) {
          const k = `${gx},${gy}`;
          const list = cells.get(k);
          if (list) list.push(id);
          else cells.set(k, [id]);
        }
    }
  };
  for (const pi of order) {
    const p = plans[pi]!;
    if (p.level) {
      const n = p.along.length;
      const target: (number | null)[] = new Array<number | null>(n).fill(null);
      let any = false;
      for (let i = 0; i < n; i++) {
        const x = p.pts[i * 2]!;
        const y = p.pts[i * 2 + 1]!;
        let best: { q: RoadPlan; s: number; d: number } | null = null;
        for (const id of cells.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`) ?? []) {
          const [qi, ax, ay, bx, by, s0] = segs[id]!;
          const q = plans[qi!]!;
          if (q.elev !== p.elev || q === p) continue;
          const dx = bx! - ax!;
          const dy = by! - ay!;
          const l2 = dx * dx + dy * dy || 1;
          const t = Math.min(Math.max(((x - ax!) * dx + (y - ay!) * dy) / l2, 0), 1);
          const d = Math.hypot(ax! + t * dx - x, ay! + t * dy - y);
          if (d < q.hw + 10 && (!best || d < best.d)) best = { q, s: s0! + t * Math.sqrt(l2), d };
        }
        if (best) {
          target[i] = centreZ(best.q, best.s) - 0.2;
          any = true;
        }
      }
      if (any) {
        const zc = [...p.zc];
        for (let i = 0; i < n; i++) {
          let bestD = Infinity;
          let z = 0;
          for (let j = 0; j < n; j++) {
            const t = target[j];
            if (t === null || t === undefined) continue;
            const d = Math.abs(p.along[j]! - p.along[i]!);
            if (d < bestD) {
              bestD = d;
              z = t;
            }
          }
          const w = 1 - smooth(0, JUNCTION_BLEND_DM, bestD);
          zc[i] = zc[i]! + (z - zc[i]!) * w;
        }
        p.zc.splice(0, n, ...zc);
      }
    }
    add(pi);
  }
}

/** 沿线 s（dm）处的中线路面高程（dm），按各点 zc 线性插值。 */
export function centreZ(p: RoadPlan, s: number): number {
  const a = p.along;
  let lo = 0;
  let hi = a.length - 1;
  if (s <= 0) return p.zc[0]!;
  if (s >= a[hi]!) return p.zc[hi]!;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (a[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - a[lo]!) / (a[hi]! - a[lo]! || 1);
  return p.zc[lo]! + (p.zc[hi]! - p.zc[lo]!) * t;
}

/** 点 (x, y)（dm）到折线的最近投影：沿线距离 s、距离 d（dm）、在左（+1）还是右（−1）。 */
export function projectOnto(pts: FlatXY, along: readonly number[], x: number, y: number): { s: number; d: number; side: 1 | -1 } {
  let best = { s: 0, d: Infinity, side: 1 as 1 | -1 };
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2]!;
    const ay = pts[i - 1]!;
    const dx = pts[i]! - ax;
    const dy = pts[i + 1]! - ay;
    const l2 = dx * dx + dy * dy;
    if (l2 <= 0) continue;
    const t = Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / l2, 0), 1);
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) {
      const cross = dx * (y - ay) - dy * (x - ax);
      best = { s: along[(i >> 1) - 1]! + t * Math.sqrt(l2), d, side: cross >= 0 ? 1 : -1 };
    }
  }
  return best;
}

/** 道路规划 → 路面带状网格的顶点属性参数。 */
function ribbonOf(p: RoadPlan, ground: HeightFn | null, blocked?: (x: number, y: number) => boolean): Parameters<typeof addRibbon>[1] {
  const r = p.road;
  const l = p.lamps;
  return {
    pts: p.pts,
    halfWidth: p.hw,
    height: p.height,
    lanes: r.cls === 'pedestrian' ? 0 : r.lanes,
    flags: (r.oneway !== 0 ? FLAG_ONEWAY : 0) | (r.cls === 'pedestrian' ? FLAG_PED : 0) | (MAIN_CLASSES.has(r.cls) ? FLAG_MAIN : 0),
    deck: p.elev > 0 ? DECK_DM : 0,
    pavL: p.pavL,
    pavR: p.pavR,
    lamp: l ? [l.spacing, l.phase, l.pattern, l.sodium ? 1 : 0] : [0, 0, LampPattern.None, 0],
    street: [l?.headH ?? 8, l?.inset ?? 0, p.shops, p.seed],
    level: p.level,
    levelK: p.levelK,
    zc: p.zc,
    ground: p.level && ground ? (x, y) => ground(x, y) + DRAPE_DM : undefined,
    blocked,
  };
}

/**
 * walls：水平路面在填挖方处加竖直墙面（HIGH 档；LOW 档省掉这部分三角形）。
 * blocked（整合时加，dm）：楼宇轮廓测试；给出时挖方侧挡土墙按路缘外十余米内（楼前为止）的最高地面砌。
 */
export function buildRoadChunks(
  roads: readonly Road[],
  ground: HeightFn,
  plans: readonly RoadPlan[] = planRoads(roads, ground),
  walls = true,
  blocked?: (x: number, y: number) => boolean,
): Map<string, { coord: ChunkCoord; arrays: MeshArrays }> {
  const out = new Map<string, { coord: ChunkCoord; arrays: MeshArrays }>();
  for (const [key, g] of groupByChunk(plans, (p) => polylineChunk(p.road.pts))) {
    const arrays = newRoadArrays();
    for (const p of g.items) {
      const spec = ribbonOf(p, walls ? ground : null, blocked);
      addRibbon(arrays, spec);
      for (const c of p.crossings) addCrossing(arrays, spec, c.s, c.signal);
    }
    if (arrays.vertexCount > 0) out.set(key, { coord: g.coord, arrays });
  }
  return out;
}

/**
 * 路边设施摆放（R2 STREETLIFE S2/S3/S4，纯函数，可测）。全部用模拟坐标「米」（x 东、y 北、z mPD）。
 * - 栏杆：核心区（及上环）主次干道 / 支路两侧路缘外 0.4 m，2.4 m 一片；过路处斑马线两侧各让 2.5 m、巴士站上落客段、
 *   人行道到路口收口前 2 m 断开，偶有 4 m 的出入口缺口；不进别的车行道、楼、敏感区。
 * - 护柱：每个有人过路的过路处两侧路缘、斑马线两边各 1–2 根不锈钢护柱。
 * - 行人灯杆：灯控过路处两侧路缘各一支（灯头朝对面路缘，按钮箱朝候车的人）。
 * - 巴士站：props.busStops 6 m 内去重，落到最近的地面可驾驶道路人行道上（人行道 ≥ 2.4 m），
 *   沿路 6–12 m 的候车亭（R3：中环大会堂款百叶顶棚，两种跨距），候车区交给行人（3–8 人）；
 *   放不下候车亭的站（人行道 1.5–2.4 m，或亭子会碰楼 / 杆）只立一支站牌（length = 0）。
 * - 垃圾桶、消防栓：沿人行道 60 / 90 m 左右一个（种子）。
 */
import type { FlatXY } from '@central/data';
import { hash32 } from './lamp-placement';
import { pointAt, projectOnto, type RoadPlan } from '../roads';
import { CROSSING_HALF_M, footOk, inCore, type CrossingSite, type WalkContext } from '../people/walkways';
import type { WaitingArea } from '../people/crowd';

const unit = (seed: number, salt: number) => hash32(Math.imul(seed + 3, 0x9e3779b1) ^ Math.imul(salt + 5, 0x85ebca77)) / 4294967296;

/** 栏杆离路缘（m）、片长（m）、在过路处斑马线外让出的距离（m）。 */
export const RAIL_INSET_M = 0.4;
export const RAIL_PANEL_M = 2.4;
export const RAIL_CROSSING_CLEAR_M = 2.5;
/** 要装栏杆的道路等级。 */
const RAILED: ReadonlySet<string> = new Set(['trunk', 'primary', 'secondary', 'tertiary']);
/** 上环一带（核心区以西）主干道也装栏杆的范围（模拟米）。 */
const SHEUNG_WAN: readonly [number, number, number, number] = [-420, -120, 14, 420];

/** 一片栏杆：起止点（模拟米，含 z）。 */
export interface RailPanel {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  z: number;
  plan: number;
}

/** 一个点状设施（模拟米）：朝向为局部 +x 的方向。 */
export interface Spot {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  /** 附加参数（行人灯相位、种子……）。 */
  aux: number;
}

export interface BusStop {
  /** 候车亭中心（模拟米）与沿路方向（朝 +x）、朝路一侧的法线。 */
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  /** 候车亭长度（m，0 = 只有站牌、没有候车亭）与类型（R3：0 = 每跨有横撑、1 = 无）。 */
  length: number;
  type: 0 | 1;
  plan: number;
  /** 沿路位置（m）与在哪一侧（+1 左、−1 右）。 */
  s: number;
  side: 1 | -1;
  seed: number;
}

/** 候车亭中心、外缘（背板）离车行道边的距离（m）。 */
export const SHELTER_CENTRE_M = 0.95;
export const SHELTER_OUTER_M = 1.65;
/** 灯控过路处：附近（m）有交通灯杆就算。 */
export const SIGNAL_NEAR_M = 20;

/** 巴士站去重半径（m）。 */
export const BUS_DEDUPE_M = 6;

/**
 * 巴士站：去重后落到最近的地面可驾驶道路人行道上。只放核心区 + 主路（trunk / primary / secondary / tertiary）。
 */
export function busStops(
  points: FlatXY,
  plans: readonly RoadPlan[],
  ctx: WalkContext,
  surface: (xDm: number, yDm: number) => number,
  avoid?: (x: number, y: number) => boolean,
): BusStop[] {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i]! / 10;
    const y = points[i + 1]! / 10;
    if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < BUS_DEDUPE_M)) continue;
    pts.push([x, y]);
  }
  const out: BusStop[] = [];
  const cand = plans.map((p, k) => ({ p, k })).filter(({ p }) => p.elev === 0 && RAILED.has(p.road.cls));
  for (const [x, y] of pts) {
    if (!inCore(ctx.core, x, y) && !inCore(SHEUNG_WAN, x, y)) continue;
    let best: { p: RoadPlan; k: number; s: number; d: number; side: 1 | -1 } | null = null;
    for (const { p, k } of cand) {
      const h = projectOnto(p.pts, p.along, x * 10, y * 10);
      const reach = p.hw + 60;
      if (h.d < reach && (!best || h.d < best.d)) best = { p, k, s: h.s, d: h.d, side: h.side };
    }
    if (!best) continue;
    const { p, k, side } = best;
    const s = best.s / 10;
    // 人行道宽（取最近站点）
    let i = 0;
    while (i < p.along.length - 1 && p.along[i + 1]! < best.s) i++;
    const pav = Math.min((side > 0 ? p.pavL : p.pavR)[i] ?? 0, (side > 0 ? p.pavL : p.pavR)[i + 1] ?? 0) / 10;
    const seed = hash32(Math.round(x * 10) * 73856093 ^ Math.round(y * 10) * 19349663);
    const type: 0 | 1 = unit(seed, 1) < 0.45 ? 0 : 1;
    const length = type === 0 ? 1.9 * (3 + Math.floor(unit(seed, 2) * 3)) : 2.6 * (3 + Math.floor(unit(seed, 2) * 2));
    // 整合（R2）：亭子范围里有电车架空线杆等（avoid）时，沿路缘前后挪 2.5 / 5 m
    let placed = false;
    for (const shift of pav >= 2.4 ? (avoid ? SHELTER_SHIFTS_M : [0]) : []) {
      const st = shelterAt(p, k, s + shift, side, length, ctx, avoid);
      if (!st) continue;
      // 与已放的候车亭重叠就跳过
      placed = true;
      if (out.some((o) => Math.hypot(o.x - st.cx, o.y - st.cy) < (o.length + length) / 2 + 1)) break;
      out.push({ x: st.cx, y: st.cy, z: surface(st.cx * 10, st.cy * 10) / 10, tx: st.tx, ty: st.ty, nx: st.nx, ny: st.ny, length, type, plan: k, s: s + shift, side, seed });
      break;
    }
    // [r3:stations] 放不下候车亭（人行道窄、贴着楼或花槽）的站：只立一支站牌（长度 0，香港很多站就是这样，照片 22 长江集团中心）
    // 站点投影落在路段两头（路口转角）时，挪进路段 3 m
    const sf = Math.min(Math.max(s, 3), p.len / 10 - 3);
    let jf = 0;
    while (jf < p.along.length - 1 && p.along[jf + 1]! < sf * 10) jf++;
    const pavF = Math.min((side > 0 ? p.pavL : p.pavR)[jf] ?? 0, (side > 0 ? p.pavL : p.pavR)[jf + 1] ?? 0) / 10;
    if (!placed && pavF >= FLAG_ONLY_PAV_M) {
      const st = shelterAt(p, k, sf, side, 0, ctx, avoid);
      if (st && !out.some((o) => Math.hypot(o.x - st.cx, o.y - st.cy) < o.length / 2 + 2)) {
        out.push({ x: st.cx, y: st.cy, z: surface(st.cx * 10, st.cy * 10) / 10, tx: st.tx, ty: st.ty, nx: st.nx, ny: st.ny, length: 0, type, plan: k, s: sf, side, seed });
      }
    }
  }
  return out;
}

/** 只立站牌（不放候车亭）的站要的最窄人行道（m）。 */
export const FLAG_ONLY_PAV_M = 1.5;

/** 候车亭沿路挪位的候选（m）：先原位。 */
const SHELTER_SHIFTS_M = [0, 2.5, -2.5, 5, -5];

/** 路 p 上沿线 s（m）处、side 一侧的候车亭能不能放；能放返回中心与朝向（模拟米）。 */
function shelterAt(
  p: RoadPlan,
  k: number,
  s: number,
  side: 1 | -1,
  length: number,
  ctx: WalkContext,
  avoid?: (x: number, y: number) => boolean,
): { cx: number; cy: number; tx: number; ty: number; nx: number; ny: number } | null {
  if (s < length / 2 + 3 || s > p.len / 10 - length / 2 - 3) return null;
  const c = pointAt(p.pts, p.along, s * 10);
  const nx = -c.ty * side;
  const ny = c.tx * side;
  const hw = p.hw / 10;
  // 候车亭靠路缘（亭后是走道）：中心离路缘 0.9 m
  const off = hw + SHELTER_CENTRE_M;
  const cx = c.x / 10 + nx * off;
  const cy = c.y / 10 + ny * off;
  for (const a of [-0.5, 0, 0.5])
    for (const b of [-0.5, 0.5]) {
      const px = cx + c.tx * a * length + nx * b;
      const py = cy + c.ty * a * length + ny * b;
      if (!footOk(ctx, px, py, k, 0.2)) return null;
    }
  if (avoid) {
    // 亭顶范围（含 0.3 m 余量）每 1 m 取样
    const n = Math.ceil(length + 0.6);
    for (let i = 0; i <= n; i++)
      for (const b of [-0.6, 0, 0.6]) {
        const a = -length / 2 - 0.3 + ((length + 0.6) * i) / n;
        if (avoid(cx + c.tx * a + nx * b, cy + c.ty * a + ny * b)) return null;
      }
  }
  return { cx, cy, tx: c.tx * side, ty: c.ty * side, nx: -nx, ny: -ny };
}

/**
 * 巴士站 → 各车道上巴士车头的停靠位置（沿车道 m）：取同一路上、站在车道行驶方向左边（靠左行，巴士在左边路缘上落客）
 * 离站最近的车道；车头停在候车亭下游端。lanes 的点是 three 坐标（x, y, z），换回模拟坐标为 (x, −z)。
 */
export function busStopLanes(stops: readonly BusStop[], lanes: readonly { id: number; plan: number; pts: Float32Array; cum: Float32Array }[]): number[][] {
  const out: number[][] = lanes.map(() => []);
  for (const b of stops) {
    let best: { id: number; d: number; s: number } | null = null;
    for (const l of lanes) {
      if (l.plan !== b.plan) continue;
      const n = l.cum.length;
      for (let i = 1; i < n; i++) {
        const ax = l.pts[i * 3 - 3]!;
        const ay = -l.pts[i * 3 - 1]!;
        const bx = l.pts[i * 3]!;
        const by = -l.pts[i * 3 + 2]!;
        const dx = bx - ax;
        const dy = by - ay;
        const l2 = dx * dx + dy * dy;
        if (l2 <= 0) continue;
        const t = Math.min(Math.max(((b.x - ax) * dx + (b.y - ay) * dy) / l2, 0), 1);
        const px = ax + dx * t;
        const py = ay + dy * t;
        const d = Math.hypot(b.x - px, b.y - py);
        // 站在车道左边
        const left = (-dy * (b.x - px) + dx * (b.y - py)) > 0;
        if (left && (!best || d < best.d)) best = { id: l.id, d, s: l.cum[i - 1]! + Math.sqrt(l2) * t };
      }
    }
    if (best && best.d < 8) out[best.id]!.push(best.s + b.length / 2 - 0.5);
  }
  return out;
}

/** 巴士站候车区（交给行人）：候车亭后面与两侧的人行道。 */
export function busWaitingAreas(stops: readonly BusStop[], plans: readonly RoadPlan[]): WaitingArea[] {
  return stops.map((b) => {
    void plans;
    // 亭子靠路缘、背板在行人路一侧：人站在亭下（背板与路缘之间），面向马路
    const across = 0.15;
    return {
      centre: [b.x + b.nx * across, b.y + b.ny * across] as const,
      axis: [b.tx, b.ty] as const,
      length: b.length > 0 ? b.length + 1 : 3,
      width: 0.8,
      z: b.z,
      face: [b.nx, b.ny] as const,
      count: b.length > 0 ? 3 + Math.floor(unit(b.seed, 9) * 6) : 1 + Math.floor(unit(b.seed, 9) * 3),
      seed: b.seed,
    };
  });
}

/**
 * 栏杆片。stops：巴士站（上落客段不装）；sites：过路处（斑马线两侧各让 RAIL_CROSSING_CLEAR_M）。
 */
export function railPanels(plans: readonly RoadPlan[], ctx: WalkContext, sites: readonly CrossingSite[], stops: readonly BusStop[], surface: (xDm: number, yDm: number) => number): RailPanel[] {
  const out: RailPanel[] = [];
  // 每条路上的「禁区」（沿线 m 区间），按侧
  const gaps = new Map<string, [number, number][]>();
  const addGap = (plan: number, side: number, a: number, b: number) => {
    const k = `${plan},${side}`;
    const list = gaps.get(k);
    if (list) list.push([a, b]);
    else gaps.set(k, [[a, b]]);
  };
  for (const c of sites) {
    const w = CROSSING_HALF_M + RAIL_CROSSING_CLEAR_M;
    addGap(c.plan, 1, c.s - w, c.s + w);
    addGap(c.plan, -1, c.s - w, c.s + w);
  }
  for (const b of stops) addGap(b.plan, b.side, b.s - b.length / 2 - 3, b.s + b.length / 2 + 4);
  // 别的路上的过路处若靠近本路路缘，也要让开（路口处横路的斑马线）
  const crossPts = sites.map((c) => [c.x, c.y] as const);
  plans.forEach((p, k) => {
    if (p.elev > 0 || !RAILED.has(p.road.cls)) return;
    const mid = pointAt(p.pts, p.along, p.len / 2);
    if (!inCore(ctx.core, mid.x / 10, mid.y / 10) && !(inCore(SHEUNG_WAN, mid.x / 10, mid.y / 10) && p.road.cls !== 'tertiary')) return;
    const hw = p.hw / 10;
    const seed = hash32(k * 2654435761 + 17);
    for (const side of [1, -1] as const) {
      const pav = side > 0 ? p.pavL : p.pavR;
      const list = gaps.get(`${k},${side}`) ?? [];
      // 偶发出入口缺口：每 ~70 m 有 35 % 机会断 4 m
      const len = p.len / 10;
      for (let s = 30; s < len; s += 70) if (unit(seed + side, Math.floor(s)) < 0.35) list.push([s, s + 4]);
      let i = 0;
      const n = p.along.length;
      while (i < n) {
        while (i < n && (pav[i] ?? 0) < 12) i++;
        const a = i;
        while (i < n && (pav[i] ?? 0) >= 12) i++;
        const b = i - 1;
        if (b <= a) continue;
        // 路口收口前 2 m 停
        const s0 = p.along[a]! / 10 + 2;
        const s1 = p.along[b]! / 10 - 2;
        if (s1 - s0 < 3) continue;
        const at = (s: number) => {
          const c = pointAt(p.pts, p.along, s * 10);
          const off = hw + RAIL_INSET_M;
          return [c.x / 10 - c.ty * off * side, c.y / 10 + c.tx * off * side] as const;
        };
        const bad = (s: number) => {
          if (list.some(([g0, g1]) => s > g0 && s < g1)) return true;
          const [x, y] = at(s);
          if (crossPts.some(([cx, cy]) => Math.abs(cx - x) < 8 && Math.abs(cy - y) < 8 && Math.hypot(cx - x, cy - y) < CROSSING_HALF_M + RAIL_CROSSING_CLEAR_M)) return true;
          return !footOk(ctx, x, y, k, 0.15);
        };
        let s = s0;
        while (s < s1) {
          let e = Math.min(s + RAIL_PANEL_M, s1);
          // 弯道外侧的偏移线比中线长：缩短到弦长 ≤ 2.4 m
          for (let k = 0; k < 8; k++) {
            const [ax, ay] = at(s);
            const [bx, by] = at(e);
            if (Math.hypot(bx - ax, by - ay) <= RAIL_PANEL_M) break;
            e = s + (e - s) * 0.85;
          }
          if (e - s < 0.8) break;
          if (bad(s) || bad(e) || bad((s + e) / 2)) {
            s += 0.6;
            continue;
          }
          const [ax, ay] = at(s);
          const [bx, by] = at(e);
          out.push({ ax, ay, bx, by, z: surface(((ax + bx) / 2) * 10, ((ay + by) / 2) * 10) / 10, plan: k });
          s = e;
        }
      }
    }
  });
  return out;
}

/** 过路处两侧路缘的护柱（斑马线两边各 1–2 根）。 */
export function bollardSpots(sites: readonly CrossingSite[], ctx: WalkContext, surface: (xDm: number, yDm: number) => number): Spot[] {
  const out: Spot[] = [];
  for (const c of sites) {
    if (!c.kerbs) continue;
    const nx = -c.ty;
    const ny = c.tx;
    for (const side of [1, -1]) {
      for (const u of [-1, 1]) {
        const k = unit(c.id * 4 + (side > 0 ? 0 : 2) + (u > 0 ? 1 : 0), 3) < 0.5 ? 1 : 2;
        for (let j = 0; j < k; j++) {
          const along = u * (CROSSING_HALF_M + 0.35 + j * 0.9);
          const x = c.x + nx * side * (c.hw + 0.45) + c.tx * along;
          const y = c.y + ny * side * (c.hw + 0.45) + c.ty * along;
          if (!footOk(ctx, x, y, -1, 0.1)) continue;
          out.push({ x, y, z: surface(x * 10, y * 10) / 10, dx: c.tx, dy: c.ty, aux: 0 });
        }
      }
    }
  }
  return out;
}

/**
 * 行人灯杆：灯控过路处（signal，或 signalPoles 里有灯杆在 12 m 内）两侧路缘各一支，立在斑马线外 0.6 m；
 * 灯头朝对面路缘（dx, dy），aux = 横过道路的信号相位。返回 [灯杆, 是否灯控] 。
 */
export function pedPoleSpots(
  sites: readonly CrossingSite[],
  phases: readonly number[],
  signalPoles: readonly (readonly [number, number])[],
  ctx: WalkContext,
  surface: (xDm: number, yDm: number) => number,
): Spot[] {
  const out: Spot[] = [];
  for (const c of sites) {
    if (!c.kerbs) continue;
    const near = c.signal || signalPoles.some(([x, y]) => Math.hypot(x - c.x, y - c.y) < SIGNAL_NEAR_M);
    if (!near) continue;
    const nx = -c.ty;
    const ny = c.tx;
    for (const side of [1, -1]) {
      // 靠左行：灯杆放在斑马线「来车一侧」不要紧，固定放在 +t 一侧外 0.6 m
      const along = (CROSSING_HALF_M + 0.6) * (side > 0 ? 1 : -1);
      const x = c.x + nx * side * (c.hw + 0.5) + c.tx * along;
      const y = c.y + ny * side * (c.hw + 0.5) + c.ty * along;
      if (!footOk(ctx, x, y, -1, 0.05)) continue;
      out.push({ x, y, z: surface(x * 10, y * 10) / 10, dx: -nx * side, dy: -ny * side, aux: phases[c.id] ?? 0 });
    }
  }
  return out;
}

/** 有灯控行人灯的过路处（与 pedPoleSpots 同一判定）。 */
export function signalisedSites(sites: readonly CrossingSite[], signalPoles: readonly (readonly [number, number])[]): Set<number> {
  const out = new Set<number>();
  for (const c of sites) if (c.kerbs && (c.signal || signalPoles.some(([x, y]) => Math.hypot(x - c.x, y - c.y) < SIGNAL_NEAR_M))) out.add(c.id);
  return out;
}

/** 垃圾桶（kind 0）与消防栓（kind 1）：沿有人行道的路，靠路缘 0.7 m。 */
export function streetBits(plans: readonly RoadPlan[], ctx: WalkContext, surface: (xDm: number, yDm: number) => number): (Spot & { kind: number })[] {
  const out: (Spot & { kind: number })[] = [];
  plans.forEach((p, k) => {
    if (p.elev > 0 || p.road.cls === 'pedestrian' || p.road.cls === 'service') return;
    const hw = p.hw / 10;
    const len = p.len / 10;
    const seed = hash32(k * 2654435761 + 91);
    for (const side of [1, -1] as const) {
      const pav = side > 0 ? p.pavL : p.pavR;
      for (const [kind, step] of [
        [0, 60],
        [1, 90],
      ] as const) {
        for (let s = step * unit(seed + side, kind) + 8; s < len - 8; s += step * (0.7 + 0.6 * unit(seed, Math.floor(s)))) {
          let i = 0;
          while (i < p.along.length - 1 && p.along[i + 1]! / 10 < s) i++;
          if ((pav[i] ?? 0) < 20 || (pav[i + 1] ?? 0) < 20) continue;
          const c = pointAt(p.pts, p.along, s * 10);
          const off = hw + 0.75;
          const x = c.x / 10 - c.ty * off * side;
          const y = c.y / 10 + c.tx * off * side;
          if (!footOk(ctx, x, y, k, 0.3)) continue;
          out.push({ x, y, z: surface(x * 10, y * 10) / 10, dx: c.tx, dy: c.ty, aux: unit(seed, Math.floor(s * 3)), kind });
        }
      }
    }
  });
  return out;
}

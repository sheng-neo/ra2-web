/**
 * R4 整合：雨篷让开街上的东西（纯函数，不碰 three）。
 *
 * 雨篷来自照片模型（Building.hires.c），路灯、交通灯、电车架空线杆、候车亭、港铁出口、电车行车线与天桥来自街道包，两边各自摆放，
 * 合在一起时杆子会穿过雨篷板、雨篷伸到电车上、天桥桥面被认成雨篷。这里逐块雨篷沿墙每 0.25 m 求「最多能伸多深」：
 * - 不能进的地方（电车行车线 + 净空、站岛）：从墙往外第一个碰到的点之前 0.3 m；
 * - 立杆（杆顶高过雨篷底）：杆两侧各 0.4 m 范围内只伸到杆前 0.3 m（伸不到 1 m 就在杆处断开，像真的雨篷给灯柱开的缺口）；
 * - 矩形障碍（候车亭、港铁出口，顶高过雨篷底）：同上，按矩形离墙最近的点；
 * 深度相同的连续段合成一块，深 < 1 m 或长 < 0.8 m 的段不要。整块丢掉：雨篷底离地 < 2.3 m（行人从底下走过），
 * 或雨篷顶高过天桥桥面底（照片里的高架行人通道被认成雨篷；天桥由街道包画）。
 * 檐口的 aHires 沿墙线性插值（照片按墙上的位置贴，与深度无关）。
 */
import { canopyThicknessDm, type CanopyHires, type CanopyItem } from './canopies';

/** 矩形障碍（模拟米）：中心、沿向单位向量、沿向半长、横向半宽、顶高程（mPD 米）。 */
export interface CanopyBox {
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  hl: number;
  hw: number;
  top: number;
}

export interface CanopyObstacles {
  /** 立杆（模拟米）：[x, y, 杆顶高程 mPD]。 */
  poles: readonly (readonly [number, number, number])[];
  boxes: readonly CanopyBox[];
  /** 雨篷不能伸进去的地方（电车行车线 + 净空、站岛）。 */
  keepOut: (x: number, y: number) => boolean;
  /** 车行道（路缘线以内）；雨篷底离地低于 BUS_CLEAR_M 时也不能伸进去（复审修正：双层巴士从雨篷里穿过）。省略 = 不查。 */
  carriageway?: (x: number, y: number) => boolean;
  /** 这里头上天桥桥面底的高程（mPD 米）；不在天桥下 null。 */
  deckBottom: (x: number, y: number) => number | null;
  /** 地面高程（mPD 米）。 */
  ground: (x: number, y: number) => number;
}

export interface CanopyFitStats {
  input: number;
  kept: number;
  /** 被修改（变浅、开缺口或截短）的块数。 */
  trimmed: number;
  /** 输出的块数（开缺口会把一块分成几块）。 */
  pieces: number;
  dropLow: number;
  dropBridge: number;
  dropTram: number;
  dropPoles: number;
}

/** 最浅的雨篷（m）、最短的一段（m）、沿墙取样步长（m）、离障碍的净距（m）、杆半径 + 余量（m）。 */
export const MIN_DEPTH_M = 1;
export const MIN_PIECE_M = 0.8;
const STEP = 0.25;
const CLEAR = 0.3;
const POLE_R = 0.15;
/** 雨篷底离地至少（m）。 */
export const MIN_UNDER_M = 2.3;
/** 雨篷底离地低于这个高度时不能伸到车行道上（双层巴士 4.4 m + 余量）。 */
export const BUS_CLEAR_M = 4.8;

const lerp = (a: CanopyHires, b: CanopyHires, t: number): CanopyHires => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2], a[3]];

/** 雨篷记录 [x0, y0, x1, y1（dm）, 伸出 dm, 顶 dm, 厚 cm, ...色] 的一段 [a0, a1]（米，沿墙）、深 D（米）→ 新记录。 */
function pieceRec(rec: readonly number[], a0: number, a1: number, D: number): number[] {
  const [x0, y0, x1, y1] = rec as [number, number, number, number];
  const L = Math.hypot(x1 - x0, y1 - y0);
  const tx = (x1 - x0) / L;
  const ty = (y1 - y0) / L;
  return [x0 + tx * a0 * 10, y0 + ty * a0 * 10, x0 + tx * a1 * 10, y0 + ty * a1 * 10, D * 10, ...rec.slice(5)];
}

/** 让开障碍后的雨篷（确定性；输入顺序不变，一块可能分成几块）。 */
export function fitCanopies(items: readonly CanopyItem[], obs: CanopyObstacles): { items: CanopyItem[]; stats: CanopyFitStats } {
  const stats: CanopyFitStats = { input: items.length, kept: 0, trimmed: 0, pieces: 0, dropLow: 0, dropBridge: 0, dropTram: 0, dropPoles: 0 };
  const out: CanopyItem[] = [];
  for (const it of items) {
    const r = it.rec;
    if (r.length !== 10) continue;
    const [x0, y0, x1, y1, dDm, zTop, th] = r as [number, number, number, number, number, number, number];
    const L = Math.hypot(x1 - x0, y1 - y0) / 10;
    const D = dDm / 10;
    if (L < 1e-3 || D <= 0) continue;
    const tx = (x1 - x0) / 10 / L;
    const ty = (y1 - y0) / 10 / L;
    const nx = ty;
    const ny = -tx;
    const ox = x0 / 10;
    const oy = y0 / 10;
    const zt = zTop / 10;
    const zb = (zTop - canopyThicknessDm(th)) / 10;
    const P = (a: number, b: number): [number, number] => [ox + tx * a + nx * b, oy + ty * a + ny * b];
    // 雨篷底离地（外沿中点）
    const [mx, my] = P(L / 2, D);
    if (zb - obs.ground(mx, my) < MIN_UNDER_M) {
      stats.dropLow++;
      continue;
    }
    // 天桥：雨篷顶高过桥面底（留 0.2 m）且平面上在桥下 → 整块不要
    let bridge = false;
    for (let a = 0; a <= L + 1e-6 && !bridge; a += 0.5) {
      for (const b of [0.2, D / 2, D]) {
        const [x, y] = P(Math.min(a, L), b);
        const deck = obs.deckBottom(x, y);
        if (deck !== null && zt > deck - 0.5) {
          bridge = true;
          break;
        }
      }
    }
    if (bridge) {
      stats.dropBridge++;
      continue;
    }
    // 沿墙每 STEP 一个取样：最多能伸多深
    const n = Math.max(1, Math.ceil(L / STEP));
    const lim = new Float64Array(n).fill(D);
    const aOf = (i: number) => (i + 0.5) * (L / n);
    let tram = false;
    const lowOverRoad = !!obs.carriageway && zb - obs.ground(mx, my) < BUS_CLEAR_M;
    for (let i = 0; i < n; i++) {
      // 取样格的两端与中点都查（相邻两格之间不漏）
      for (const a of [(i * L) / n, aOf(i), ((i + 1) * L) / n]) {
        for (let b = 0; b <= D + 1e-6; b += 0.2) {
          const [x, y] = P(a, b);
          if (obs.keepOut(x, y) || (lowOverRoad && b > 0.3 && obs.carriageway!(x, y))) {
            lim[i] = Math.min(lim[i]!, b - 0.2 - CLEAR);
            tram = true;
            break;
          }
        }
      }
    }
    // 立杆与矩形障碍：先求它在雨篷坐标里的 (a 范围, 离墙最近的 b)
    const blockers: [number, number, number][] = [];
    for (const [px, py, top] of obs.poles) {
      if (top <= zb) continue;
      const a = (px - ox) * tx + (py - oy) * ty;
      const b = (px - ox) * nx + (py - oy) * ny;
      if (a < -POLE_R - CLEAR || a > L + POLE_R + CLEAR || b < -POLE_R || b > D + POLE_R + CLEAR) continue;
      blockers.push([a - POLE_R - CLEAR, a + POLE_R + CLEAR, b - POLE_R - CLEAR]);
    }
    for (const bx of obs.boxes) {
      if (bx.top <= zb) continue;
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      for (const s of [-1, 1])
        for (const w of [-1, 1]) {
          const x = bx.cx + bx.tx * bx.hl * s - bx.ty * bx.hw * w;
          const y = bx.cy + bx.ty * bx.hl * s + bx.tx * bx.hw * w;
          const a = (x - ox) * tx + (y - oy) * ty;
          const b = (x - ox) * nx + (y - oy) * ny;
          a0 = Math.min(a0, a);
          a1 = Math.max(a1, a);
          b0 = Math.min(b0, b);
        }
      if (a1 < -CLEAR || a0 > L + CLEAR || b0 > D + CLEAR) continue;
      // 矩形整个在墙后面（b 全 < 0）不挡
      blockers.push([a0 - CLEAR, a1 + CLEAR, b0 - CLEAR]);
    }
    for (const [a0, a1, bmax] of blockers) {
      for (let i = 0; i < n; i++) {
        const a = aOf(i);
        if (a >= a0 && a <= a1) lim[i] = Math.min(lim[i]!, bmax);
      }
    }
    // 连续取样按深度分段（没被挡的取原深度，被挡的按 0.25 m 向下量化）；太浅的段当缺口
    const q = (v: number) => (v >= D ? D : v >= MIN_DEPTH_M ? Math.floor(v / 0.25) * 0.25 : 0);
    const pieces: [number, number, number][] = [];
    let i = 0;
    while (i < n) {
      const d = q(lim[i]!);
      let j = i;
      while (j + 1 < n && q(lim[j + 1]!) === d) j++;
      const a0 = (i * L) / n;
      const a1 = ((j + 1) * L) / n;
      if (d > 0 && a1 - a0 >= MIN_PIECE_M) pieces.push([a0, a1, d]);
      i = j + 1;
    }
    const whole = pieces.length === 1 && pieces[0]![0] === 0 && Math.abs(pieces[0]![1] - L) < 1e-9 && pieces[0]![2] === D;
    if (!pieces.length) {
      if (tram) stats.dropTram++;
      else stats.dropPoles++;
      continue;
    }
    stats.kept++;
    if (whole) {
      out.push(it);
      stats.pieces++;
      continue;
    }
    stats.trimmed++;
    const f = it.fascia ?? null;
    for (const [a0, a1, d] of pieces) {
      const t0 = a0 / L;
      const t1 = a1 / L;
      out.push({
        ...it,
        rec: pieceRec(r, a0, a1, d),
        fascia: f ? [lerp(f[0], f[1], t0), lerp(f[0], f[1], t1), lerp(f[3], f[2], t1), lerp(f[3], f[2], t0)] : null,
      });
      stats.pieces++;
    }
  }
  return { items: out, stats };
}

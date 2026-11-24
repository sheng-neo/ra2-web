/**
 * 水面遮罩与离岸距离场（纯函数，可测）。
 * - 细遮罩：数据范围（bbox）内把 water 多边形按奇偶规则栅格化，4 m/像素（与旧地面材质同一套边界）；
 *   范围外按边缘像素延伸（clamp-to-edge）。
 * - 九龙岸线：数据范围北面的对岸按近似锚点连成 y = f(x) 折线（模拟米），其北为陆地。
 * - 港岛两翼岸线：数据范围东西两侧（上环以西、金钟 / 湾仔 / 铜锣湾）同样用近似锚点，其北为水；
 *   锚点在 bbox 边上正好接上数据岸线。
 * - 粗距离场：在大范围粗网格上合成「细遮罩 ∪ 九龙岸线」的陆/水，再做两遍倒角距离变换，
 *   得到带符号的离岸距离（米，水为正、陆为负），给水面着色（反射距离、近岸效果）与 LOW 档倒影条用。
 */
import type { Ring } from '@central/data';

/** 九龙岸线锚点（模拟米，x 单调递增）：西九海滨 → 尖沙咀码头尖端 → 尖东海旁 → 红磡以东（近似，±150–300 m）。 */
export const KOWLOON_SHORE: readonly (readonly [number, number])[] = [
  [-6000, 2700],
  [-3000, 2350],
  [-1400, 1980],
  [-500, 1896],
  [-40, 1951],
  [529, 2029],
  [1148, 1840],
  [1250, 1200],
  [1323, 1065],
  [1420, 1150],
  [1498, 1198],
  [2023, 1154],
  [2384, 1453],
  [3200, 1520],
  [4300, 1820],
  [6000, 2450],
  [9000, 2700],
];

/** 港岛两翼岸线锚点（模拟米，x 单调递增；数据范围内不用）：坚尼地城 → 西营盘 → 上环 | 金钟 → 会展 → 铜锣湾 → 北角。 */
export const ISLAND_SHORE: readonly (readonly [number, number])[] = [
  [-6000, -2400],
  [-5000, -1500],
  [-4100, -540],
  [-3500, 0],
  [-2870, 260],
  [-2200, 450],
  [-1530, 600],
  [-1100, 760],
  [-811, 807],
  [1663, -12],
  [1750, 150],
  [1850, 340],
  [2100, 330],
  [2500, 260],
  [3000, 240],
  [3600, 350],
  [4600, 900],
  [6000, 1500],
  [9000, 1700],
];

function polyY(s: readonly (readonly [number, number])[], x: number): number {
  if (x <= s[0]![0]) return s[0]![1];
  for (let i = 1; i < s.length; i++) {
    const [x1, y1] = s[i]!;
    if (x <= x1) {
      const [x0, y0] = s[i - 1]!;
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return s[s.length - 1]![1];
}

/** 对岸岸线 y（模拟米）：线性插值，两端外延取端点值。 */
export function kowloonShoreY(x: number): number {
  return polyY(KOWLOON_SHORE, x);
}

/** 港岛两翼岸线 y（模拟米；只用于数据范围以外）。 */
export function islandShoreY(x: number): number {
  return polyY(ISLAND_SHORE, x);
}

export interface MaskGrid {
  /** 左下角（模拟米）与像素尺寸（米，x / y 可略有不同）。 */
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 行优先，j = 0 为最南一行；1 = 水，0 = 陆。 */
  data: Uint8Array;
}

/**
 * 奇偶规则扫描线栅格化（像素中心采样）。rings 为 dm 坐标的多边形（外环 + 洞），dmToM 换算到米。
 * 只覆盖 [x0, x0 + w·cx] × [y0, y0 + h·cy]。
 */
export function rasterizeWater(rings: readonly Ring[], x0: number, y0: number, cx: number, cy: number, w: number, h: number, dmToM = 0.1): MaskGrid {
  const data = new Uint8Array(w * h);
  const edges: [number, number, number, number][] = [];
  for (const ring of rings) {
    for (const r of [ring.outer, ...(ring.holes ?? [])]) {
      const n = r.length / 2;
      for (let i = 0; i < n; i++) {
        const k = (i + 1) % n;
        edges.push([r[i * 2]! * dmToM, r[i * 2 + 1]! * dmToM, r[k * 2]! * dmToM, r[k * 2 + 1]! * dmToM]);
      }
    }
  }
  const xs: number[] = [];
  for (let j = 0; j < h; j++) {
    const y = y0 + (j + 0.5) * cy;
    xs.length = 0;
    for (const [ax, ay, bx, by] of edges) {
      if (ay <= y === by <= y) continue;
      xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k]! - x0) / cx - 0.5));
      const i1 = Math.min(w - 1, Math.floor((xs[k + 1]! - x0) / cx - 0.5));
      for (let i = i0; i <= i1; i++) data[j * w + i] = 1;
    }
  }
  return { x0, y0, cx, cy, w, h, data };
}

/** 数据范围内取细遮罩（南北方向超出按边缘延伸），东西两侧用港岛两翼岸线；对岸以北为陆。 */
export function isWaterAt(mask: MaskGrid, x: number, y: number): boolean {
  if (y >= kowloonShoreY(x)) return false;
  if (x < mask.x0 || x > mask.x0 + mask.w * mask.cx) return y > islandShoreY(x);
  const i = Math.min(Math.max(Math.floor((x - mask.x0) / mask.cx), 0), mask.w - 1);
  const j = Math.min(Math.max(Math.floor((y - mask.y0) / mask.cy), 0), mask.h - 1);
  return mask.data[j * mask.w + i] === 1;
}

/**
 * 带符号离岸距离场（米）：水为正（到最近陆地的距离），陆为负（到最近水面的距离）。
 * 两遍 3-4 倒角距离变换（误差 < 8 %），对粗网格足够。
 */
export function signedDistance(water: Uint8Array, w: number, h: number, cell: number): Float32Array {
  const one = (target: number): Float32Array => {
    // 到最近「值为 target」的格子的距离
    const INF = 1e9;
    const d = new Float32Array(w * h);
    for (let k = 0; k < w * h; k++) d[k] = water[k] === target ? 0 : INF;
    const a = cell;
    const b = cell * Math.SQRT2;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        let v = d[k]!;
        if (i > 0) v = Math.min(v, d[k - 1]! + a);
        if (j > 0) {
          v = Math.min(v, d[k - w]! + a);
          if (i > 0) v = Math.min(v, d[k - w - 1]! + b);
          if (i < w - 1) v = Math.min(v, d[k - w + 1]! + b);
        }
        d[k] = v;
      }
    }
    for (let j = h - 1; j >= 0; j--) {
      for (let i = w - 1; i >= 0; i--) {
        const k = j * w + i;
        let v = d[k]!;
        if (i < w - 1) v = Math.min(v, d[k + 1]! + a);
        if (j < h - 1) {
          v = Math.min(v, d[k + w]! + a);
          if (i < w - 1) v = Math.min(v, d[k + w + 1]! + b);
          if (i > 0) v = Math.min(v, d[k + w - 1]! + b);
        }
        d[k] = v;
      }
    }
    return d;
  };
  const toLand = one(0);
  const toWater = one(1);
  const out = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) out[k] = water[k] === 1 ? toLand[k]! - cell * 0.5 : -(toWater[k]! - cell * 0.5);
  return out;
}

/** 粗距离场的编码：R8，0.5 处为岸线，±SDF_RANGE_M 映射到 0 / 1。 */
export const SDF_RANGE_M = 1600;

export function encodeSdf(sdf: Float32Array): Uint8Array {
  const out = new Uint8Array(sdf.length);
  for (let k = 0; k < sdf.length; k++) {
    const t = 0.5 + 0.5 * Math.max(-1, Math.min(1, sdf[k]! / SDF_RANGE_M));
    out[k] = Math.round(t * 255);
  }
  return out;
}

export interface WaterField {
  fine: MaskGrid;
  /** 粗网格（覆盖整个可见海港）：陆/水与编码后的带符号距离。 */
  coarse: { x0: number; y0: number; cell: number; w: number; h: number; water: Uint8Array; sdf: Float32Array };
}

/** 细遮罩：4 m/像素正好铺满 bbox；粗网格：25 m，x −7000…9000、y −1500…3300（米）。 */
export function buildWaterField(rings: readonly Ring[], bboxDm: readonly [number, number, number, number], fineCell = 4, coarseCell = 25): WaterField {
  const [bx0, by0, bx1, by1] = bboxDm.map((v) => v * 0.1) as [number, number, number, number];
  const fw = Math.max(1, Math.ceil((bx1 - bx0) / fineCell));
  const fh = Math.max(1, Math.ceil((by1 - by0) / fineCell));
  // 像素尺寸略小于 fineCell，正好铺满 bbox（边缘像素完全落在数据范围内，与旧地面遮罩同理）
  const fine = rasterizeWater(rings, bx0, by0, (bx1 - bx0) / fw, (by1 - by0) / fh, fw, fh);
  const x0 = -7000;
  const y0 = -1500;
  const w = Math.ceil((9000 - x0) / coarseCell);
  const h = Math.ceil((3300 - y0) / coarseCell);
  const water = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) water[j * w + i] = isWaterAt(fine, x0 + (i + 0.5) * coarseCell, y0 + (j + 0.5) * coarseCell) ? 1 : 0;
  }
  return { fine, coarse: { x0, y0, cell: coarseCell, w, h, water, sdf: signedDistance(water, w, h, coarseCell) } };
}

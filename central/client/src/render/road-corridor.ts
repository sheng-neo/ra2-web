/**
 * 路廊（realism C9）：地面道路横向水平后，地形网格在路廊下只往下压（≤ 3 m），不让 10 m 地形三角面顶穿路面。
 * - 路廊半宽 = 车行道半宽 + 人行道 + 1 m：节点压到「路面 − 0.3 m」以下；
 * - 再往外一个网格（10 m）内按 1:1 的挖方坡放宽（离路廊越远允许越高），压低量同样 ≤ 3 m；
 * - 楼宇轮廓下的节点（整合时改）：压到该楼的墙底（与 buildings.ts 同一规则：min(楼底标高, 墙脚最低地面) − 0.5 m）。
 *   原来不动时，坡地上的楼外跨轮廓的地形格子从楼内的高处斜插下来，盖住下坡一侧的地铺与人行道
 *   （半山罗便臣道那片「土堆」）；压到墙底后这些格子都斜进楼里，被墙挡住，墙底以下不露缝。
 * - HeightFn 本身不变（data/terrain.ts），楼、路、街道物件照旧按原地形取高。
 * 返回新的高度数组（与 grid.heights 同长，dm）；只影响地形网格的画法。
 */
import type { Building, FlatXY, LandmarkPlacement, TerrainGrid } from '@central/data';
import { reliefHeight, type HeightFn } from '../data/terrain';
import { pointInFlat } from '../geom/ring';
import type { RoadPlan } from './roads';

/** 最多压低（dm）。 */
export const MAX_PUSH_DM = 30;
/** 路面下留的余量（dm）。 */
const CLEAR_DM = 3;
/** 路廊在人行道外再放宽（dm）。 */
const MARGIN_DM = 10;
/** 楼墙埋进地面的深度（dm），与 buildings.ts 的 SINK_DM 相同。 */
const BUILDING_SINK_DM = 5;

export function corridorHeights(grid: TerrainGrid, plans: readonly RoadPlan[], buildings: readonly Building[] = []): Int16Array {
  const { x0, y0, cell, nx, ny, heights } = grid;
  const out = new Int16Array(heights);
  const hf = reliefHeight(grid);
  // 楼宇轮廓下的节点：标记，并压到该楼墙底
  const underBuilding = new Uint8Array(nx * ny);
  for (const b of buildings) {
    const r = b.footprint.outer;
    let low = Infinity;
    for (let i = 0; i < r.length; i += 2) {
      const k = (i + 2) % r.length;
      low = Math.min(low, hf(r[i]!, r[i + 1]!), hf((r[i]! + r[k]!) / 2, (r[i + 1]! + r[k + 1]!) / 2));
    }
    const bottom = Math.min(b.base !== 0 ? b.base : Infinity, low) - BUILDING_SINK_DM;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < r.length; i += 2) {
      minX = Math.min(minX, r[i]!);
      maxX = Math.max(maxX, r[i]!);
      minY = Math.min(minY, r[i + 1]!);
      maxY = Math.max(maxY, r[i + 1]!);
    }
    const i0 = Math.max(0, Math.ceil((minX - x0) / cell));
    const i1 = Math.min(nx - 1, Math.floor((maxX - x0) / cell));
    const j0 = Math.max(0, Math.ceil((minY - y0) / cell));
    const j1 = Math.min(ny - 1, Math.floor((maxY - y0) / cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const id = j * nx + i;
        if (!pointInFlat(r, x0 + i * cell, y0 + j * cell)) continue;
        underBuilding[id] = 1;
        if (heights[id] !== 0 && Number.isFinite(bottom)) out[id] = Math.max(Math.min(out[id]!, Math.round(bottom)), 1);
      }
  }
  for (const p of plans) {
    if (p.elev > 0) continue;
    const n = p.pts.length >> 1;
    // 各点路面高度（中线，已平滑）
    const z = p.zc;
    for (let k = 1; k < n; k++) {
      const ax = p.pts[k * 2 - 2]!;
      const ay = p.pts[k * 2 - 1]!;
      const bx = p.pts[k * 2]!;
      const by = p.pts[k * 2 + 1]!;
      const half = p.hw + Math.max(p.pavL[k - 1]!, p.pavL[k]!, p.pavR[k - 1]!, p.pavR[k]!) + MARGIN_DM;
      const reach = half + cell;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / cell));
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + reach - x0) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - y0) / cell));
      const j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by) + reach - y0) / cell));
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy || 1;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const id = j * nx + i;
          if (underBuilding[id] || heights[id] === 0) continue;
          const x = x0 + i * cell;
          const y = y0 + j * cell;
          const t = Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / l2, 0), 1);
          const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
          if (d > reach) continue;
          const road = z[k - 1]! + (z[k]! - z[k - 1]!) * t;
          const ceil = road - CLEAR_DM + Math.max(0, d - half);
          const h = heights[id]!;
          const v = Math.max(Math.min(out[id]!, ceil), h - MAX_PUSH_DM);
          out[id] = Math.round(Math.min(out[id]!, v));
        }
      }
    }
  }
  return out;
}

/**
 * 完全被楼宇盖住的地形格子（4 个角点与格心都在同一栋楼的外轮廓里）：楼是封闭的棱柱，里面的地面看不见，
 * 地形网格可以不画这些格子（市区约省两成地形三角形）。返回按格子下标（j * nx + i）的标记。
 */
export function cellsUnderBuildings(grid: TerrainGrid, buildings: readonly Building[]): Uint8Array {
  const { x0, y0, cell, nx, ny } = grid;
  const out = new Uint8Array(nx * ny);
  for (const b of buildings) {
    const r = b.footprint.outer;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < r.length; i += 2) {
      minX = Math.min(minX, r[i]!);
      maxX = Math.max(maxX, r[i]!);
      minY = Math.min(minY, r[i + 1]!);
      maxY = Math.max(maxY, r[i + 1]!);
    }
    const i0 = Math.max(0, Math.ceil((minX - x0) / cell));
    const i1 = Math.min(nx - 2, Math.floor((maxX - x0) / cell) - 1);
    const j0 = Math.max(0, Math.ceil((minY - y0) / cell));
    const j1 = Math.min(ny - 2, Math.floor((maxY - y0) / cell) - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = x0 + i * cell;
        const y = y0 + j * cell;
        if (
          pointInFlat(r, x, y) &&
          pointInFlat(r, x + cell, y) &&
          pointInFlat(r, x, y + cell) &&
          pointInFlat(r, x + cell, y + cell) &&
          pointInFlat(r, x + cell / 2, y + cell / 2)
        )
          out[j * nx + i] = 1;
      }
    }
  }
  return out;
}

/**
 * 楼宇轮廓点测试（dm）：50 m 网格分桶 + 包围盒预筛 + 奇偶规则（只看外环）。
 * 整合时加：给挡土墙的「坡后取高」用（ribbon.ts cutGround），遇楼即停。
 * extra：另外几个外环（R4 + R5 整合复审：地标网格在行人高度的实心范围 LandmarkMesh.street，见 landmarkStreetRings）。
 */
export function footprintTest(buildings: readonly Building[], extra: readonly FlatXY[] = []): (x: number, y: number) => boolean {
  const CELL = 500;
  const buckets = new Map<number, { r: FlatXY; box: [number, number, number, number] }[]>();
  const key = (i: number, j: number) => i * 100003 + j;
  for (const r of [...buildings.map((b) => b.footprint.outer), ...extra]) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < r.length; i += 2) {
      minX = Math.min(minX, r[i]!);
      maxX = Math.max(maxX, r[i]!);
      minY = Math.min(minY, r[i + 1]!);
      maxY = Math.max(maxY, r[i + 1]!);
    }
    const item = { r, box: [minX, minY, maxX, maxY] as [number, number, number, number] };
    for (let j = Math.floor(minY / CELL); j <= Math.floor(maxY / CELL); j++)
      for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++) {
        const k = key(i, j);
        const list = buckets.get(k);
        if (list) list.push(item);
        else buckets.set(k, [item]);
      }
  }
  return (x, y) => {
    const list = buckets.get(key(Math.floor(x / CELL), Math.floor(y / CELL)));
    if (!list) return false;
    for (const it of list) {
      const [a, b, c, d] = it.box;
      if (x < a || x > c || y < b || y > d) continue;
      if (pointInFlat(it.r, x, y)) return true;
    }
    return false;
  };
}

/** 地标网格在行人高度的实心范围（管线 landmarkStreetSections 写进 LandmarkMesh.street；没有网格的地标没有）。 */ // [r45:fix]
export function landmarkStreetRings(landmarks: readonly LandmarkPlacement[]): FlatXY[] {
  return landmarks.flatMap((l) => l.mesh?.street ?? []);
}

const renderedCache = new WeakMap<TerrainGrid, { grid: TerrainGrid; fn: HeightFn }>();

/**
 * 路廊压低后的地形网格（同一份地形只算一次，地形网格与街道物件共用）：网格本身与按它取高的 HeightFn（dm）。
 * 路灯、交通灯、树要立在看得见的地面上，不能按原始地形（见 streets/surface.ts）。
 */
export function renderedTerrain(grid: TerrainGrid, plans: readonly RoadPlan[], buildings: readonly Building[] = []): { grid: TerrainGrid; fn: HeightFn } {
  const hit = renderedCache.get(grid);
  if (hit) return hit;
  const g = { ...grid, heights: corridorHeights(grid, plans, buildings) };
  const out = { grid: g, fn: reliefHeight(g) };
  renderedCache.set(grid, out);
  return out;
}

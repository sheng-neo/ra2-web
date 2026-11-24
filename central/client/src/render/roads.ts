/**
 * 道路 → 按块的带状网格。M0 只画可驾驶道路和行人街；人行道、台阶、小径暂不画；隧道不画。
 * 宽度 = 车道数 × 3.3 m × 1.3（ROAD_WIDTH_SCALE），可驾驶路至少 4 m。
 * 路面贴地形：每个顶点按自己的位置取地面高度（data/terrain 的 HeightFn），统一离地 0.1 m，
 * 同高度重叠处再按道路等级给极小抬升，让主路标线压住支路。
 * 高架：Overture/OSM 的 level 是叠放次序，不是高度。只把 level 1–2（以及标了 bridge 的更高层）当高架，
 * 一律最多抬 2 层 × 6 m；level ≥ 3 又没标 bridge 的（裙楼、停车场顶层的楼层号误标）按地面画。
 * 高架端点若接在地面道路的端点上，就在该端做引道坡。
 */
import type { Road, RoadClass } from '@central/data';
import type { HeightFn } from '../data/terrain';
import { cleanRing } from '../geom/ring';
import { groupByChunk, polylineChunk, type ChunkCoord } from './chunks';
import type { MeshArrays } from './mesh-arrays';
import { addRibbon, drapeResample, newRoadArrays } from './ribbon';

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

export function isRendered(r: Road): boolean {
  return LIFT_DM[r.cls] !== undefined && !r.tunnel;
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

export function buildRoadChunks(roads: readonly Road[], ground: HeightFn): Map<string, { coord: ChunkCoord; arrays: MeshArrays }> {
  const drawn = roads.filter(isRendered);
  const gradeEnds = new Set<string>();
  for (const r of drawn) {
    if (elevationTiers(r) > 0 || r.cls === 'pedestrian') continue;
    const n = r.pts.length >> 1;
    gradeEnds.add(endKey(r.pts[0]!, r.pts[1]!));
    gradeEnds.add(endKey(r.pts[n * 2 - 2]!, r.pts[n * 2 - 1]!));
  }
  const out = new Map<string, { coord: ChunkCoord; arrays: MeshArrays }>();
  for (const [key, g] of groupByChunk(drawn, (r) => polylineChunk(r.pts))) {
    const arrays = newRoadArrays();
    for (const r of g.items) {
      const raw = cleanRing(r.pts);
      const n = raw.length >> 1;
      if (n < 2) continue;
      const elev = elevationTiers(r) * LEVEL_H_DM;
      const startGrade = elev > 0 && gradeEnds.has(endKey(raw[0]!, raw[1]!));
      const endGrade = elev > 0 && gradeEnds.has(endKey(raw[n * 2 - 2]!, raw[n * 2 - 1]!));
      const pts = drapeResample(raw, ground, RESAMPLE_DM);
      let len = 0;
      for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!);
      const ramp = startGrade && endGrade ? Math.min(RAMP_DM, len / 2) : Math.min(RAMP_DM, len);
      const lift = LIFT_DM[r.cls]!;
      addRibbon(arrays, {
        pts,
        halfWidth: roadHalfWidth(r),
        height: (x, y, s) => {
          let k = 1;
          if (startGrade) k = Math.min(k, s / ramp);
          if (endGrade) k = Math.min(k, (len - s) / ramp);
          return ground(x, y) + DRAPE_DM + lift + elev * Math.max(0, k);
        },
        lanes: r.cls === 'pedestrian' ? 0 : r.lanes,
        flags: (r.oneway !== 0 ? 1 : 0) | (r.cls === 'pedestrian' ? 2 : 0),
        deck: elev > 0 ? DECK_DM : 0,
      });
    }
    if (arrays.vertexCount > 0) out.set(key, { coord: g.coord, arrays });
  }
  return out;
}

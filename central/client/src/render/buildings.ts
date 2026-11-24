/**
 * 建筑 → 按块的立面网格。
 * - 楼底基准：数据给了 base 用 base，否则（0）用地形采样；墙脚再埋到整圈墙脚下最低地面以下 0.5 m（walls.ts）。
 * - 与别栋楼共面重合的墙只画一次（walls.ts），塔楼与裙楼共用外边处不再闪条纹。
 * - 敏感区内的楼一律灰色无窗封闭体。
 */
import type { Building, FlatXY, SensitiveZone } from '@central/data';
import type { HeightFn } from '../data/terrain';
import { normalizeRing, pointInRing, ringCentroid } from '../geom/ring';
import { groupByChunk, chunkOf, type ChunkCoord } from './chunks';
import { extrudePrism } from './extrude';
import { FacadeMode, hash01, newFacadeArrays, styleCode } from './facade';
import type { MeshArrays } from './mesh-arrays';
import { lowestAlongRings, planWallCuts, type WallCutsFn } from './walls';

const SINK_DM = 5;
const MIN_HEIGHT_DM = 25;

export function inSensitive(zones: readonly SensitiveZone[], x: number, y: number): boolean {
  return zones.some((z) => pointInRing(z.area, x, y));
}

/** 一栋楼的墙体参数（模拟坐标，dm）。 */
export interface PreparedBuilding {
  b: Building;
  ring: { outer: FlatXY; holes: FlatXY[] };
  /** [外环, ...洞]，与 extrudePrism 的环序号一致。 */
  rings: FlatXY[];
  cx: number;
  cy: number;
  base: number;
  bottom: number;
  top: number;
}

/** 楼底、墙底、楼顶与共面墙去重（cutsOf 的楼序号即 items 下标）。 */
export function prepareBuildings(
  buildings: readonly Building[],
  ground: HeightFn,
): { items: PreparedBuilding[]; cutsOf: WallCutsFn } {
  const items = buildings.flatMap((b) => {
    const ring = normalizeRing(b.footprint);
    if (!ring) return [];
    const [cx, cy] = ringCentroid(ring.outer);
    const rings = [ring.outer, ...ring.holes];
    const base = b.base !== 0 ? b.base : ground(cx, cy);
    const bottom = Math.min(base, lowestAlongRings(rings, ground)) - SINK_DM;
    return [{ b, ring, rings, cx, cy, base, bottom, top: base + Math.max(b.height, MIN_HEIGHT_DM) }];
  });
  return { items, cutsOf: planWallCuts(items) };
}

export function buildBuildingChunks(
  buildings: readonly Building[],
  ground: HeightFn,
  sensitive: readonly SensitiveZone[],
): Map<string, { coord: ChunkCoord; arrays: MeshArrays }> {
  const { items, cutsOf } = prepareBuildings(buildings, ground);
  const indexed = items.map((p, k) => ({ p, k }));
  const out = new Map<string, { coord: ChunkCoord; arrays: MeshArrays }>();
  for (const [key, g] of groupByChunk(indexed, ({ p }) => chunkOf(p.cx, p.cy))) {
    const arrays = newFacadeArrays();
    for (const { p, k } of g.items) {
      const r = hash01(p.b.id);
      const mode = inSensitive(sensitive, p.cx, p.cy) ? FacadeMode.Plain : FacadeMode.Windows;
      extrudePrism(arrays, {
        outer: p.ring.outer,
        holes: p.ring.holes,
        bottom: p.bottom,
        base: p.base,
        top: p.top,
        style: styleCode(p.b.style, mode, r),
        uOffset: r * 97,
        cuts: (ring, edge) => cutsOf(k, ring, edge),
      });
    }
    out.set(key, { coord: g.coord, arrays });
  }
  return out;
}

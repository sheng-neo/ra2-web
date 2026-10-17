// ===== sim/services/traffic.ts =====
// XTRF 的唯一 owner（spec:services §2.4 / §3.3）：addTraffic 逐日累加、第 19 天 decayTraffic 衰减并写 MISC 0x0030 与 state.traffic
// （TrafficReport 缓存到下一个第 19 天）、读档后 rebuildTrafficReport（Σ XTRF + 路网格数）。transport 只经 Actions.addTraffic 写入。
import { HALF_N, TILES, halfOfTile } from '../../contracts/grid';
import { MISC, miscSet } from '../../contracts/io';
import { isBridge, isHighway, isRoad } from '../../contracts/net';
import type { CityState, TrafficReport } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import type { ServicesTuning } from './tuning';
import { idiv } from './runtime';

export type RoadTileCounts = { roadTiles: number; highwayTiles: number; bridgeTiles: number };

/** Actions.addTraffic：XTRF[h] = min(255, XTRF[h] + weight)。 */
export function addTraffic(state: CityState, tile: number, weight: number): void {
  if (!(tile >= 0 && tile < TILES) || (tile | 0) !== tile) return;
  const w = Math.max(0, weight | 0);
  if (w === 0) return;
  const h = halfOfTile(tile);
  state.maps.xtrf[h] = Math.min(255, state.maps.xtrf[h]! + w);
}

export function sumTraffic(xtrf: Uint8Array): number {
  let total = 0;
  for (let h = 0; h < HALF_N; h++) total += xtrf[h]!;
  return total;
}

/** 生成并缓存报告：total → state.traffic 与 rawMisc 0x0030；graph = total / (1 + 道路 + 高速 + 桥)。 */
export function commitReport(state: CityState, total: number, counts: RoadTileCounts): TrafficReport {
  const report: TrafficReport = {
    total, graph: idiv(total, 1 + counts.roadTiles + counts.highwayTiles + counts.bridgeTiles),
    roadTiles: counts.roadTiles, highwayTiles: counts.highwayTiles, bridgeTiles: counts.bridgeTiles };
  state.traffic.total = report.total; state.traffic.graph = report.graph;
  state.traffic.roadTiles = report.roadTiles; state.traffic.highwayTiles = report.highwayTiles; state.traffic.bridgeTiles = report.bridgeTiles;
  miscSet(state.rawMisc, MISC.trafficCount, total);
  return report;
}

/** 第 19 天：全游戏唯一的 XTRF 衰减点。 */
export function decayTraffic(ctx: SimContext, t: ServicesTuning): TrafficReport {
  const xtrf = ctx.state.maps.xtrf;
  const minStep = Math.max(0, t.trafficDecayMin | 0);
  for (let h = 0; h < HALF_N; h++) {
    const v = xtrf[h]!;
    if (v === 0) continue;
    const step = Math.max(v >> t.trafficDecayShift, Math.min(v, minStep));
    xtrf[h] = v - step;
  }
  ctx.act.layerChanged('maps');
  return commitReport(ctx.state, sumTraffic(xtrf), ctx.q.transport.roadTileCounts());
}

/** 读档后按契约谓词（NET_FLAGS）直接数路网格：POSTLOAD_ORDER 里 services 先于 transport，不能依赖对方尚未重建的缓存。 */
export function countRoadTilesFromLayers(xbld: Uint8Array): RoadTileCounts {
  let roadTiles = 0, highwayTiles = 0, bridgeTiles = 0;
  for (let i = 0; i < TILES; i++) {
    const b = xbld[i]!;
    if (isRoad(b)) roadTiles++;
    if (isHighway(b)) highwayTiles++;
    if (isBridge(b)) bridgeTiles++;
  }
  return { roadTiles, highwayTiles, bridgeTiles };
}

/** .SC2 读档 / 新城后立即重建（spec:services §3.3 rebuildTrafficReportOnLoad）。 */
export function rebuildTrafficReport(state: CityState): TrafficReport {
  return commitReport(state, sumTraffic(state.maps.xtrf), countRoadTilesFromLayers(state.layers.xbld));
}

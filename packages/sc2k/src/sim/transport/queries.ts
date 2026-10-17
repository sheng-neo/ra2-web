// ===== sim/transport/queries.ts =====（CONTRACTS §I TransportQuery；spec:transport §3.5 / §3.7 / §3.8）
// 把闭包缓存与各纯函数拼成 Queries.transport。除 runTrip 外全部不消费 PRNG、不写状态（hasAccess 只填自己的缓存）。
import { halfIndex, inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import { isRoad } from '../../contracts/net';
import type { StationInfo, TransportQuery } from '../../contracts/queries';
import { bridgeBlocksShips, bridgeOptions, bridgePieces } from './bridge';
import { connectionSummary } from './connections';
import { pieceFor, surfaceNeighborMask, undNeighborMask } from './piece';
import { hasAccess, isWaterAt, stationAtTile } from './runtime';
import type { Runtime } from './runtime';
import type { TripEngine } from './trip';

/** Chebyshev 距最近 ROAD_SET 格（≤ 3），否则 4；仅 UI 用（§3.5）。 */
export function roadDistance(rt: Runtime, x: number, y: number): number {
  if (!inMap(x, y)) return 4;
  const xbld = rt.state.layers.xbld;
  if (isRoad(xbld[tileIndex(x, y)]!)) return 0;
  for (let d = 1; d <= 3; d++) {
    for (let dx = -d; dx <= d; dx++) {
      const edge = dx === -d || dx === d;
      for (let dy = -d; dy <= d; dy += edge ? 1 : 2 * d) {
        const nx = x + dx, ny = y + dy;
        if (inMap(nx, ny) && isRoad(xbld[tileIndex(nx, ny)]!)) return d;
      }
    }
  }
  return 4;
}

export function createTransportQuery(rt: Runtime, trip: TripEngine): TransportQuery {
  const stationInfo = (i: number): StationInfo | null => {
    if (!inMap(tileX(i), tileY(i))) return null;
    const s = stationAtTile(rt, i);
    return s ? { kind: s.kind, id: s.id, anchor: s.anchor, n: s.n } : null;
  };
  return {
    hasAccess: (x, y) => hasAccess(rt, x, y),
    runTrip: (i, zone, popLevel) => trip.runTrip(i, zone, popLevel),
    pieceFor: (family, i) => pieceFor(rt, family, i),
    roadDistance: (x, y) => roadDistance(rt, x, y),
    roadTileCounts: () => ({ roadTiles: rt.counts.roadTiles, highwayTiles: rt.counts.highwayTiles, bridgeTiles: rt.counts.bridgeTiles }),
    connections: () => connectionSummary(rt.state),
    stationAt: stationInfo,
    bridgeBlocksShips: (i) => (inMap(tileX(i), tileY(i)) ? bridgeBlocksShips(rt.state.layers.xbld[i]!, isWaterAt(rt, i)) : false),
    bridgeOptions: (family, n) => bridgeOptions(rt.tune, family, n),
    bridgePieces: (kind, family, n) => bridgePieces(rt.tune, kind, family, n),
    railMask: (i) => (inMap(tileX(i), tileY(i)) ? surfaceNeighborMask(rt, 'rail', i) : 0),
    subwayMask: (i) => (inMap(tileX(i), tileY(i)) ? undNeighborMask(rt, 'subway', i) : 0),
    trafficAt: (x, y) => (inMap(x, y) ? rt.state.maps.xtrf[halfIndex(x, y)]! : 0),
  };
}

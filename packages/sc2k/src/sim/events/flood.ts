// ===== sim/events/flood.ts =====（spec:disasters §2.6.2 洪水 / §3.4 stepFlood）
// GROW（前沿 4 邻扩散，alt ≤ floodAlt+1，不越过调度单位 3×3，面积上限）→ HOLD → RECEDE（每 tick 退去最远的 ceil(area/40) 格，保护区内优先）。
// 被淹建筑与电线立即毁损；树 / 道路 / 铁路 / 桥 / 地下保留。
import { DX, DY, DisasterKind, TileMarker, XBit, inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import { isPowerCarrier } from '../../contracts/net';
import type { SimContext } from '../../contracts/system';
import { cheb, privOf } from './common';
import { destroyStructure } from './destroy';
import { UNIT_ANY, unitWithin } from './dispatch';
import { countMarker, tilesWithMarker } from './marker';
import type { EventsPriv } from './priv';
import { FloodPhase } from './priv';
import type { EventsTuning } from './tuning';

/** 淹没一格：打标 + 建筑 / 电线毁损。 */
function floodTile(ctx: SimContext, P: EventsPriv, T: EventsTuning, i: number): void {
  P.marker[i] = TileMarker.Flood; P.fuel[i] = 0;
  const id = ctx.state.layers.xbld[i]!;
  if (id >= 0x70 || isPowerCarrier(id)) destroyStructure(ctx, T, tileX(i), tileY(i), DisasterKind.Flood);
}

/** 原点候选：与水面 4 邻接的陆地格；有淡水岸时只返回淡水岸（spec §2.6.2 "优先淡水"）。不消费 PRNG。 */
export function floodOriginCandidates(ctx: SimContext): number[] {
  const q = ctx.q.terrain, L = ctx.state.layers;
  const fresh: number[] = [], salty: number[] = [];
  for (let i = 0; i < 16384; i++) {
    if (q.isWater(i)) continue;
    const x = tileX(i), y = tileY(i);
    let near = 0;                                   // 1 = 淡水 2 = 咸水
    for (let d = 0; d < 4 && near !== 1; d++) {
      const nx = x + DX[d]!, ny = y + DY[d]!;
      if (!inMap(nx, ny)) continue;
      const n = tileIndex(nx, ny);
      if (!q.isWater(n)) continue;
      near = (L.xbit[n]! & XBit.SaltWater) !== 0 ? Math.max(near, 2) : 1;
    }
    if (near === 1) fresh.push(i); else if (near === 2) salty.push(i);
  }
  return fresh.length > 0 ? fresh : salty;
}
/** 随机原点；−1 = 地图无岸。恰消费一次 PRNG（有候选时）。 */
export function pickFloodOrigin(ctx: SimContext): number {
  const pool = floodOriginCandidates(ctx);
  return pool.length > 0 ? ctx.prng.pick(pool) : -1;
}

export function seedFlood(ctx: SimContext, T: EventsTuning, origin: number): void {
  const P = privOf(ctx.state);
  P.floodPhase = FloodPhase.Grow; P.floodTicks = 0;
  P.floodAlt = ctx.q.terrain.alt(origin);
  P.floodMax = ctx.prng.range(T.flood.maxTiles[0], T.flood.maxTiles[1]);
  P.floodOx = tileX(origin); P.floodOy = tileY(origin);
  if (P.marker[origin] === 0) floodTile(ctx, P, T, origin);
}

export function stepFlood(ctx: SimContext, P: EventsPriv, T: EventsTuning): void {
  if (P.floodPhase === FloodPhase.None) return;
  const f = T.flood, q = ctx.q.terrain, prng = ctx.prng, radius = T.dispatch.radius;
  switch (P.floodPhase) {
    case FloodPhase.Grow: {
      let area = countMarker(P, TileMarker.Flood);
      const flooded = tilesWithMarker(P, TileMarker.Flood);
      for (const i of flooded) {
        const x = tileX(i), y = tileY(i);
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d]!, ny = y + DY[d]!;
          if (!inMap(nx, ny)) continue;
          const n = tileIndex(nx, ny);
          if (P.marker[n] !== 0 || q.isWater(n) || q.alt(n) > P.floodAlt + 1 || area >= P.floodMax) continue;
          if (unitWithin(P, n, UNIT_ANY, radius)) continue;
          if (prng.float() < f.spread) { floodTile(ctx, P, T, n); area++; }
        }
      }
      if (++P.floodTicks >= f.growTicks) { P.floodPhase = FloodPhase.Hold; P.floodTicks = 0; }
      return;
    }
    case FloodPhase.Hold:
      if (++P.floodTicks >= f.holdTicks) { P.floodPhase = FloodPhase.Recede; P.floodTicks = 0; }
      return;
    case FloodPhase.Recede: {
      const flooded = tilesWithMarker(P, TileMarker.Flood);
      if (flooded.length === 0) { P.floodPhase = FloodPhase.None; return; }
      const k = Math.ceil(flooded.length / f.recedeDivisor);
      const ranked = flooded
        .map((i) => ({ i, prot: unitWithin(P, i, UNIT_ANY, radius) ? 1 : 0, d: cheb(tileX(i), tileY(i), P.floodOx, P.floodOy) }))
        .sort((a, b) => b.prot - a.prot || b.d - a.d || a.i - b.i);
      for (let n = 0; n < k && n < ranked.length; n++) P.marker[ranked[n]!.i] = 0;
      if (flooded.length - k <= 0) P.floodPhase = FloodPhase.None;
      P.floodTicks++;
      return;
    }
    default: return;
  }
}

/** 洪水当前面积（UI / 报纸）。 */
export const floodArea = (P: EventsPriv): number => countMarker(P, TileMarker.Flood);

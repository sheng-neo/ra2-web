// ===== sim/events/fire.ts =====（spec:disasters §2.6.1 火灾 / §3.4 stepFire）
// 每 tick：先扑灭判定（XFIR 覆盖 + 3×3 内消防单位），再以 tick 开始时的燃烧集合向 8 邻蔓延（对角减半、道路不可燃），最后燃尽 → destroyStructure → 瓦砾续烧。
import { DisasterKind, TileMarker, quarterOfTile, tileX, tileY, inMap, tileIndex } from '../../contracts/grid';
import type { SimContext } from '../../contracts/system';
import { DIR8_DX, DIR8_DY, classOf, TileClass, flammableAt, fuelFactorFor, isRubble, windOf, quarterWeight } from './common';
import { destroyStructure } from './destroy';
import { UNIT_FIRE, unitWithin } from './dispatch';
import { clearMarker, igniteTile, tilesWithMarker } from './marker';
import type { EventsPriv } from './priv';
import type { EventsTuning } from './tuning';

export function stepFire(ctx: SimContext, P: EventsPriv, T: EventsTuning): void {
  const t = T.fire, s = ctx.state, L = s.layers, xfir = s.maps.xfir, prng = ctx.prng;
  const burning = tilesWithMarker(P, TileMarker.Fire);
  if (burning.length === 0) return;
  const radius = T.dispatch.radius;
  const windK = 1 + windOf(s) / 255;

  // 1. 扑灭（含"脚下已被推平"的即时熄灭）
  const still: number[] = [];
  for (const i of burning) {
    if (classOf(L.xbld[i]!) === TileClass.Empty) { clearMarker(P, i); continue; }
    const pExt = (xfir[quarterOfTile(i)]! / 255) * t.extinguishPerCoverage + (unitWithin(P, i, UNIT_FIRE, radius) ? t.dispatchExtinguish : 0);
    if (prng.float() < pExt) { clearMarker(P, i); continue; }
    still.push(i);
  }
  // 2. 蔓延（用本 tick 开始时仍在烧的集合）
  for (const i of still) {
    const x = tileX(i), y = tileY(i);
    for (let d = 0; d < 8; d++) {
      const nx = x + DIR8_DX[d]!, ny = y + DIR8_DY[d]!;
      if (!inMap(nx, ny)) continue;
      const n = tileIndex(nx, ny);
      if (P.marker[n] !== 0 || !flammableAt(ctx, n) || unitWithin(P, n, UNIT_FIRE, radius)) continue;
      let p = t.spreadBase * windK * fuelFactorFor(t, L.xbld[n]!) * (1 - Math.min(xfir[quarterOfTile(n)]!, 255) / t.coverageDivisor);
      if ((d & 1) === 1) p *= t.diagonalFactor;
      if (prng.float() < Math.max(p, t.minSpread)) igniteTile(ctx, P, t, n);
    }
  }
  // 3. 燃尽
  for (const i of still) {
    if (P.marker[i] !== TileMarker.Fire) continue;
    const f = P.fuel[i]! - 1;
    P.fuel[i] = f;
    if (f > 0) continue;
    const id = L.xbld[i]!;
    if (isRubble(id)) { clearMarker(P, i); continue; }
    destroyStructure(ctx, T, tileX(i), tileY(i), DisasterKind.Fire);
    if (isRubble(L.xbld[i]!)) P.fuel[i] = t.fuel.rubble;          // 瓦砾阶段续烧
    else clearMarker(P, i);                                       // 树烧成清地：熄灭
  }
}

/** 随机灾害的起火点：XPOP 加权的已开发可燃格；没有建筑则任意可燃格等权；都没有 → −1。恰消费一次 PRNG（有候选时）。 */
export function pickFireOrigin(ctx: SimContext): number {
  const L = ctx.state.layers;
  const developed: number[] = [], weights: number[] = [], other: number[] = [];
  let total = 0;
  for (let i = 0; i < L.xbld.length; i++) {
    if (!flammableAt(ctx, i)) continue;
    if (L.xbld[i]! >= 0x70) { const w = quarterWeight(ctx.state.maps.xpop, i); developed.push(i); weights.push(w); total += w; } else other.push(i);
  }
  if (developed.length > 0) {
    let r = ctx.prng.int(total);
    for (let k = 0; k < developed.length; k++) { r -= weights[k]!; if (r < 0) return developed[k]!; }
    return developed[developed.length - 1]!;
  }
  if (other.length > 0) return ctx.prng.pick(other);
  return -1;
}
export function hasFlammable(ctx: SimContext): boolean {
  for (let i = 0; i < 16384; i++) if (flammableAt(ctx, i)) return true;
  return false;
}

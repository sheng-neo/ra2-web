// ===== sim/events/fire.ts =====（spec:disasters §2.6.1 火灾 / §3.4 stepFire）
// 每 tick：先扑灭判定（XFIR 覆盖 + 3×3 内消防单位），再以 tick 开始时的燃烧集合向 8 邻蔓延（对角减半、道路不可燃），
// 最后对此刻全部燃烧格（含本 tick 新点燃的，§3.4 伪代码第三个 tilesWithMarker）扣燃料 → 燃尽 → destroyStructure → 瓦砾续烧。
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
  // 3. 燃尽：§3.4 对蔓延后的全部燃烧格扣燃料（本 tick 新点燃的也扣一次，否则每格多烧一 tick、多一次蔓延机会）
  for (const i of tilesWithMarker(P, TileMarker.Fire)) {
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

/** 有人口的建筑：分区建筑（含施工 / 废弃，0x70..0xC5）与巨型住区（0xFB..0xFE）——与 services XPOP 的 POPWEIGHT / arco 口径一致。 */
const isPopulated = (b: number): boolean => (b >= 0x70 && b < 0xc6) || (b >= 0xfb && b <= 0xfe);

/**
 * 随机灾害的起火点：XPOP 加权的已开发可燃格（spec §2.6.1"XPOP 加权"——火从人多处起）；没有建筑则任意可燃格等权；都没有 → −1。
 * 恰消费一次 PRNG（有候选时）。只有"有人口的建筑"格按所在四分格 XPOP + 1 加权，电厂 / 公共设施 / 港口等无人口建筑格权重恒 1：
 * services 的 popW 给非分区建筑每格 +2，一座 4×4 煤电独占的四分格 XPOP = 128，若照搬会让唯一电厂占小城全部起火权重的 40–57%
 * （评审 Fix-A #12 金城实测），火灾几乎总是先烧电厂。
 * marker 给出时跳过已带任何标记的格（灾害中叠加触发时另选一处新火点，而不是落在已在烧的格上）。
 */
export function pickFireOrigin(ctx: SimContext, marker: Uint8Array | null = null): number {
  const L = ctx.state.layers, xpop = ctx.state.maps.xpop;
  const developed: number[] = [], weights: number[] = [], other: number[] = [];
  let total = 0;
  for (let i = 0; i < L.xbld.length; i++) {
    if ((marker !== null && marker[i] !== 0) || !flammableAt(ctx, i)) continue;
    const b = L.xbld[i]!;
    if (b >= 0x70) { const w = isPopulated(b) ? quarterWeight(xpop, i) : 1; developed.push(i); weights.push(w); total += w; } else other.push(i);
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

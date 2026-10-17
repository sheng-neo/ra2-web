// ===== sim/events/marker.ts =====（spec:disasters §2.5.1 标记层）
// marker 层的原子操作：点燃 / 清标 / 按 (y, x) 升序枚举 / 质心。运行时从不写 XTXT。
import { TileMarker, tileIndex } from '../../contracts/grid';
import type { SimContext } from '../../contracts/system';
import { flammableAt, fuelFor } from './common';
import type { EventsPriv } from './priv';
import type { FireTuning } from './tuning';

/** 点燃：已有任何标记或不可燃 → false。 */
export function igniteTile(ctx: SimContext, P: EventsPriv, t: FireTuning, i: number): boolean {
  if (P.marker[i] !== 0 || !flammableAt(ctx, i)) return false;
  P.marker[i] = TileMarker.Fire;
  P.fuel[i] = fuelFor(t, ctx.state.layers.xbld[i]!);
  return true;
}
export function clearMarker(P: EventsPriv, i: number): void { P.marker[i] = 0; P.fuel[i] = 0; }

/** 带某标记的格索引，按 (y, x) 升序（spec §4.12 的遍历口径）。 */
export function tilesWithMarker(P: EventsPriv, m: TileMarker): number[] {
  const out: number[] = [];
  const mk = P.marker;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const i = tileIndex(x, y); if (mk[i] === m) out.push(i); }
  return out;
}
export function countMarker(P: EventsPriv, m: TileMarker): number {
  let n = 0;
  const mk = P.marker;
  for (let i = 0; i < mk.length; i++) if (mk[i] === m) n++;
  return n;
}
export function anyMarker(P: EventsPriv): boolean {
  const mk = P.marker;
  for (let i = 0; i < mk.length; i++) if (mk[i] !== 0) return true;
  return false;
}
/** 某标记连通块的粗质心（全部同类标记的平均；v1 不分块）。无 → null。 */
export function centroidOf(P: EventsPriv, m: TileMarker): { x: number; y: number } | null {
  let sx = 0, sy = 0, n = 0;
  const mk = P.marker;
  for (let i = 0; i < mk.length; i++) if (mk[i] === m) { sx += i >> 7; sy += i & 127; n++; }
  return n === 0 ? null : { x: Math.floor(sx / n), y: Math.floor(sy / n) };
}

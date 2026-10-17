// ===== sim/zones/queries.ts =====
// ZonesQuery（CONTRACTS §I）：lotAt（任意占地格 → TL 锚点的 LotInfo）与 recreation（休闲建筑栋数，供 R cap 与产业 Tourism 用）。
// 绑定前（init 之前）回答空值，不抛错。
import type { CatalogueApi } from '../../contracts/catalogue';
import type { LotInfo, ZonesQuery } from '../../contracts/queries';
import type { CityState } from '../../contracts/state';
import { LotClass } from './buildings';
import { lotContaining } from './lots';
import type { ZonesCtx } from './lots';

export interface RecreationCounts { smallPark: number; bigPark: number; marina: number; zoo: number; stadium: number }
interface RecIds { smallPark: number; bigPark: number; marina: number; zoo: number; stadium: number }
const recCache = new WeakMap<CatalogueApi, RecIds>();
const idOf = (cat: CatalogueApi, key: string): number => cat.buildingByKey(key)?.id ?? -1;
function recIdsFor(cat: CatalogueApi): RecIds {
  let r = recCache.get(cat);
  if (!r) { r = { smallPark: idOf(cat, 'smallPark'), bigPark: idOf(cat, 'bigPark'), marina: idOf(cat, 'marina'), zoo: idOf(cat, 'zoo'), stadium: idOf(cat, 'stadium') }; recCache.set(cat, r); }
  return r;
}
/** 栋数 = 格数 / 占地面积（counts.tile 由 core 增量维护）。 */
export function recreationCounts(state: CityState, cat: CatalogueApi): RecreationCounts {
  const ids = recIdsFor(cat), tile = state.counts.tile, fp = cat.FOOTPRINT;
  const n = (id: number): number => { if (id < 0) return 0; const s = fp[id] ?? 1; return Math.floor((tile[id] ?? 0) / (s * s)); };
  return { smallPark: n(ids.smallPark), bigPark: n(ids.bigPark), marina: n(ids.marina), zoo: n(ids.zoo), stadium: n(ids.stadium) };
}

const PHASE_NAME = ['built', 'built', 'construct', 'abandoned'] as const;   // 按 LotClass 下标（0 不会出现）

export interface QueryBinding { state: CityState; cat: CatalogueApi; Z: ZonesCtx }
export function makeZonesQuery(get: () => QueryBinding | null): ZonesQuery {
  return {
    lotAt(i: number): LotInfo | null {
      const b = get();
      if (!b || !(i >= 0 && i < b.state.layers.xbld.length)) return null;
      const lot = lotContaining(b.state.layers, b.Z.tbl, b.Z.priv, i);
      if (!lot || lot.cls === LotClass.None) return null;
      return { anchor: lot.anchor, size: lot.size as 1 | 2 | 3, level: lot.level as 0 | 1 | 2 | 3 | 4, tier: lot.tier as 0 | 1 | 2, phase: PHASE_NAME[lot.cls] };
    },
    recreation(): RecreationCounts {
      const b = get();
      return b ? recreationCounts(b.state, b.cat) : { smallPark: 0, bigPark: 0, marina: 0, zoo: 0, stadium: 0 };
    },
  };
}

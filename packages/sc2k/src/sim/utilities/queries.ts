// ===== sim/utilities/queries.ts =====（CONTRACTS §I UtilityQuery；spec:power-water §2.5 / §3.6）
// 全部纯读：poweredSelf / watered / piped 读 XBIT 本格；hasPower = 本格或任一 4 邻 POWERED（生长判定）；plantAt 合成查询窗口数据。
// 绑定前（init / postLoad 之前）一律按空城作答，不抛错。
import { FOOTPRINT, anchorOf } from '../../contracts/footprint';
import { SCAN_NEIGHBORS, TILES, XBit, neighborXY } from '../../contracts/grid';
import type { PlantInfo, UtilityQuery } from '../../contracts/queries';
import { PLANT_KIND_BY_XBLD, POWER_PLANT_DEFS } from './defs';
import { isUtilitiesPriv } from './priv';
import type { Runtime } from './runtime';
import { EMPTY_POWER_REPORT, EMPTY_WATER_REPORT } from './runtime';

export function makeUtilityQueries(rt: Runtime): UtilityQuery {
  const bit = (i: number, mask: number): boolean => {
    const s = rt.ctx?.state;
    return s !== undefined && i >= 0 && i < TILES && (s.layers.xbit[i]! & mask) !== 0;
  };
  const poweredSelf = (i: number): boolean => bit(i, XBit.Powered);
  return {
    poweredSelf,
    hasPower(i) {
      if (poweredSelf(i)) return true;
      if (i < 0 || i >= TILES) return false;
      for (const [dx, dy] of SCAN_NEIGHBORS) { const j = neighborXY(i, dx, dy); if (j >= 0 && poweredSelf(j)) return true; }
      return false;
    },
    watered: (i) => bit(i, XBit.Watered),
    piped: (i) => bit(i, XBit.Piped),
    plantAt(i): PlantInfo | null {
      const ctx = rt.ctx;
      if (!ctx || i < 0 || i >= TILES) return null;
      const L = ctx.state.layers;
      const b = L.xbld[i]!;
      const kind = PLANT_KIND_BY_XBLD[b];
      if (!kind) return null;
      const def = POWER_PLANT_DEFS[kind];
      let anchor = FOOTPRINT[b] === 1 ? i : anchorOf(L, i);
      if (anchor < 0) anchor = i;
      let ageYears = 0, loadPct = ctx.state.utilities.power.usagePct;
      if (def.expires) {
        const p = ctx.state.priv.utilities;
        if (isUtilitiesPriv(p)) {
          const k = p.plantAnchors.indexOf(anchor);
          if (k >= 0) { ageYears = p.plantAges[k]!; if (ageYears > 0) loadPct = p.plantLoads[k]!; }
        }
      }
      return { kind, anchor, ageYears, loadPct, nominalMW: def.nominalMW, expires: def.expires };
    },
    lastPower: () => rt.ctx?.state.utilities.power ?? EMPTY_POWER_REPORT,
    lastWater: () => rt.ctx?.state.utilities.water ?? EMPTY_WATER_REPORT,
  };
}

// ===== app/stubs/stubActions.ts =====（CONTRACTS §U：stubActions(state) → 非 core 的 Actions 子集）
// core 的 set* / layerChanged / emit 由真实 TileWriter 提供；这里只有其他 owner 的键，缺席 / 桩系统时由 nullSystem 挂上。
//  - charge：资金不足返回 false（桩没有 ctx，不 emit insufficientFunds；真 economy 负责事件）；cost ≤ 0 恒 true。
//  - destroyStructure：整栋 → 瓦砾 0x01..0x04（按占地内偏移轮换，确定性）+ 清 XZON 角标（分区低 4 位保留）+ 清 Powered/Powerable/Watered/Piped 位；
//    直接写图层并增量维护 counts.tile（桩绕过 TileWriter，因此脏标记由渲染的整层刷新兜底）。
//  - addTraffic：累加到半格 XTRF（饱和 255）；其余空操作。
import type { CityState } from '../../contracts/state';
import type { StubActions } from '../../contracts/testkit';
import { Corner, XBit, halfOfTile, inMap, tileIndex } from '../../contracts/grid';
import { FOOTPRINT, anchorOf, forEachLotTile } from '../../contracts/footprint';

const CLEAR_ON_DESTROY = XBit.Powered | XBit.Powerable | XBit.Watered | XBit.Piped;

/** 把格 i 的 xbld 改为 id 并同步 counts.tile。 */
function writeXbld(s: CityState, i: number, id: number): void {
  const old = s.layers.xbld[i]!;
  if (old === id) return;
  s.layers.xbld[i] = id;
  s.counts.tile[old] = (s.counts.tile[old] ?? 0) - 1;
  s.counts.tile[id] = (s.counts.tile[id] ?? 0) + 1;
}

export function stubActions(state: CityState): StubActions {
  return {
    charge: (cost) => {
      if (cost <= 0) return true;
      if (state.economy.funds < cost) return false;
      state.economy.funds -= cost;
      return true;
    },
    destroyStructure: (x, y) => {
      if (!inMap(x, y)) return;
      const i = tileIndex(x, y);
      const L = state.layers;
      const id = L.xbld[i]!;
      if (id === 0) return;
      // 地面物（树 / 瓦砾 / 公园 / 网络片段 < 0x0E 以外）：1×1，直接清空而不是变瓦砾
      if (id < 0x0e) { writeXbld(state, i, 0); L.xzon[i] = L.xzon[i]! & ~Corner.All; L.xbit[i] = L.xbit[i]! & ~CLEAR_ON_DESTROY; return; }
      const n = FOOTPRINT[id] ?? 1;
      const anchor = n === 1 ? i : anchorOf(L, i);
      if (anchor < 0) {
        // 角标损坏：按 1×1 处理
        writeXbld(state, i, 0x01); L.xzon[i] = L.xzon[i]! & ~Corner.All; L.xbit[i] = L.xbit[i]! & ~CLEAR_ON_DESTROY; return;
      }
      forEachLotTile(anchor, n, (j, dx, dy) => {
        writeXbld(state, j, 0x01 + ((dx + dy) & 3));
        L.xzon[j] = L.xzon[j]! & ~Corner.All;
        L.xbit[j] = L.xbit[j]! & ~CLEAR_ON_DESTROY;
      });
    },
    news: () => { /* 桩：无报纸 */ },
    addTraffic: (tile, weight) => {
      const h = halfOfTile(tile);
      state.maps.xtrf[h] = Math.min(255, state.maps.xtrf[h]! + Math.max(0, weight | 0));
    },
    allocMicrosim: () => -1,
    freeMicrosim: () => { /* 桩：无微模拟 */ },
    requestRescan: () => { /* 桩：无电 / 水重扫 */ },
    markAccessDirty: () => { /* 桩：无可达缓存 */ },
  };
}

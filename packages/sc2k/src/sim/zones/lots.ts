// ===== sim/zones/lots.ts =====
// lot（建筑实例）的运行时视图与瓦片写入（spec:zones §2.5.6 放置、§3.4 角标写入、§4 边界条件 1/4/5）。
// lot 没有独立对象表：锚点 = 带 TL 角标且 XBLD 为分区建筑 / 施工 / 废弃瓦片的格；size / level / tier / zone 由 XBLD 查表，
// 计时器与施工目标在 priv 的列式数组里按锚点索引（priv.ts）。
import { Corner, TILES, XBit, ZONE_MASK, tileIndex, tileX, tileY, zoneTypeOf } from '../../contracts/grid';
import { anchorOf, cornerBits, forEachLotTile, lotIsUniform } from '../../contracts/footprint';
import { hash32 } from '../../contracts/prng';
import type { TileLayers } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { LotClass, NO_ZONE, RUBBLE_IDS, zoneIdxOf } from './buildings';
import type { ZoneTable } from './buildings';
import type { ZonesPriv } from './priv';
import { clearLotColumns } from './priv';
import type { ZonesTuning } from './tuning';

/** 每日 / 每月的运行计数（闭包态，不入快照）。 */
export interface ZonesRuntime {
  quotaAge: number; growsToday: number; declinesToday: number;
  monthGrows: number; monthDeclines: number; monthVisits: number;
}
export const createRuntime = (): ZonesRuntime => ({ quotaAge: -1, growsToday: 0, declinesToday: 0, monthGrows: 0, monthDeclines: 0, monthVisits: 0 });
/** 系统闭包在每次调用时交给各子模块的绑定包。 */
export interface ZonesCtx { T: ZonesTuning; tbl: ZoneTable; priv: ZonesPriv; rt: ZonesRuntime }

export interface LotView {
  anchor: number; size: number; level: number; tier: number;
  /** 分区类型下标；施工 / 废弃瓦片所在格已被取消分区时为 NO_ZONE。 */
  zoneIdx: number;
  cls: LotClass;
}

/** 锚点格 i 上的 lot；i 不是合法锚点（无 TL 位 / 非分区瓦片 / 多格占地不完整）返回 null。 */
export function lotAtAnchor(L: TileLayers, tbl: ZoneTable, priv: ZonesPriv, i: number): LotView | null {
  if ((L.xzon[i]! & Corner.TL) === 0) return null;
  const b = L.xbld[i]!;
  const cls = tbl.cls[b]! as LotClass;
  if (cls === LotClass.None) return null;
  const size = tbl.size[b]!;
  if (size > 1) {
    const x = tileX(i), y = tileY(i);
    if (x + size > 128 || y + size > 128 || !lotIsUniform(L, x, y, size, b)) return null;
  }
  const level = tbl.level[b]!;
  if (cls === LotClass.Built) return { anchor: i, size, level, tier: tbl.tier[b]!, zoneIdx: tbl.zoneIdx[b]!, cls };
  const zt = zoneTypeOf(L.xzon[i]! & ZONE_MASK);
  const pid = priv.pendingId[i]!;
  const pidBuilt = tbl.cls[pid] === LotClass.Built;
  const zoneIdx = zt ? zoneIdxOf(zt) : pidBuilt ? tbl.zoneIdx[pid]! : NO_ZONE;
  const tier = cls === LotClass.Construct && pidBuilt ? tbl.tier[pid]! : 0;
  return { anchor: i, size, level, tier, zoneIdx, cls };
}

/** 含格 j 的 lot（经 anchorOf 找 TL 锚点）。 */
export function lotContaining(L: TileLayers, tbl: ZoneTable, priv: ZonesPriv, j: number): LotView | null {
  if (tbl.cls[L.xbld[j]!] === LotClass.None) return null;
  const a = anchorOf(L, j);
  return a < 0 ? null : lotAtAnchor(L, tbl, priv, a);
}

/** 分区建筑格的 XBIT 预置位（与 placement 对公共建筑的预置一致）。 */
export const LOT_BITS = XBit.Powerable | XBit.Piped;
/** 变瓦砾时清除的位。 */
export const RUBBLE_CLEAR_BITS = XBit.Powerable | XBit.Piped | XBit.Powered | XBit.Watered;

/** 整栋写入 XBLD（可选重写角标：1x1 → 0xF0，多格按位置），并预置 Powerable | Piped；分区码保持不变。 */
export function writeLotTiles(ctx: SimContext, anchor: number, size: number, id: number, corners: boolean): void {
  const L = ctx.state.layers, act = ctx.act;
  forEachLotTile(anchor, size, (j, dx, dy) => {
    act.setXbld(j, id);
    if (corners) act.setXzon(j, (L.xzon[j]! & ZONE_MASK) | cornerBits(size, dx, dy));
    if ((L.xbit[j]! & LOT_BITS) !== LOT_BITS) act.setXbit(j, LOT_BITS, true);
  });
}

/** 整栋变瓦砾：每格独立 1x1（角标 0xF0、瓦砾变体 hash32(age, j)）、清 XBIT、清 priv 列。不消费 PRNG（日末也会调用）。 */
export function toRubble(ctx: SimContext, Z: ZonesCtx, anchor: number, size: number): void {
  const L = ctx.state.layers, act = ctx.act, age = ctx.state.clock.age;
  forEachLotTile(anchor, size, (j) => {
    act.setXbld(j, RUBBLE_IDS[hash32(age, j) & 3]!);
    act.setXzon(j, (L.xzon[j]! & ZONE_MASK) | Corner.All);
    if ((L.xbit[j]! & RUBBLE_CLEAR_BITS) !== 0) act.setXbit(j, RUBBLE_CLEAR_BITS, false);
    clearLotColumns(Z.priv, j);
  });
}

/** 遍历全部锚点格（TL 位且 XBLD 为分区 / 过渡瓦片），fn(i, b, cls)。 */
export function forEachAnchor(L: TileLayers, tbl: ZoneTable, fn: (i: number, b: number, cls: LotClass) => void): void {
  const xzon = L.xzon, xbld = L.xbld, cls = tbl.cls;
  for (let i = 0; i < TILES; i++) {
    if ((xzon[i]! & Corner.TL) === 0) continue;
    const b = xbld[i]!;
    const c = cls[b]! as LotClass;
    if (c !== LotClass.None) fn(i, b, c);
  }
}

export const tileAt = (x: number, y: number): number => tileIndex(x, y);

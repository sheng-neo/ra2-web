// ===== sim/zones/fixtures.ts =====
// 验收测试的场景搭建助手（只依赖 contracts，因而可被 *.test.ts 与 tools/ 复用；不被 index.ts 引用，不进产物）。
// 全部经 ctx.act 写层（counts / dirty / onTilesChanged 与真实模拟一致）；地价直接写 maps.xval（现实桩读该图）。
import { cornerBits, forEachLotTile, FOOTPRINT } from '../../contracts/footprint';
import { Corner, XBit, ZONE_MASK, tileIndex } from '../../contracts/grid';
import { NET_BASE } from '../../contracts/net';
import type { CityState } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { ABANDONED_IDS, CONSTRUCTION_IDS } from './buildings';

/** 矩形划区（含端点）：只改 XZON 低 4 位。 */
export function zoneRect(ctx: SimContext, zone: number, x0: number, y0: number, x1: number, y1: number): void {
  const xzon = ctx.state.layers.xzon;
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    const i = tileIndex(x, y);
    ctx.act.setXzon(i, (xzon[i]! & ~ZONE_MASK) | (zone & ZONE_MASK));
  }
}
/** 直线道路（沿 x 用横向片段 idx 0，沿 y 用纵向片段 idx 1）。 */
export function roadLine(ctx: SimContext, x0: number, y0: number, x1: number, y1: number): void {
  const horizontal = y0 === y1;
  const id = NET_BASE.road + (horizontal ? 0 : 1);
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) ctx.act.setXbld(tileIndex(x, y), id);
}
/** 一格电线并置 POWERED（桩 utilities 不扫描，测试自己给电）。 */
export function powerLineAt(ctx: SimContext, x: number, y: number): void {
  const i = tileIndex(x, y);
  ctx.act.setXbld(i, NET_BASE.power);
  ctx.act.setXbit(i, XBit.Powered, true);
}
export function setPowered(ctx: SimContext, i: number, on: boolean): void { ctx.act.setXbit(i, XBit.Powered, on); }

/** 直接放一栋分区 / 过渡建筑（占地 + 角标 + Powerable|Piped，可选 Powered）；分区码保持。 */
export function placeLot(ctx: SimContext, id: number, x: number, y: number, powered = true): number {
  const n = FOOTPRINT[id] ?? 1, anchor = tileIndex(x, y), xzon = ctx.state.layers.xzon;
  forEachLotTile(anchor, n, (j, dx, dy) => {
    ctx.act.setXbld(j, id);
    ctx.act.setXzon(j, (xzon[j]! & ZONE_MASK) | cornerBits(n, dx, dy));
    ctx.act.setXbit(j, XBit.Powerable | XBit.Piped | (powered ? XBit.Powered : 0), true);
  });
  return anchor;
}
/** 整图地价（半格图 XVAL，现实桩 services.landValue 读它）。 */
export function setLandValue(state: CityState, v: number): void { state.maps.xval.fill(v & 0xff); }

const CONSTRUCTION_SET = new Set<number>(CONSTRUCTION_IDS.flat());
const ABANDONED_SET = new Set<number>(ABANDONED_IDS.flat());
export const isConstructionId = (b: number): boolean => CONSTRUCTION_SET.has(b);
export const isAbandonedId = (b: number): boolean => ABANDONED_SET.has(b);
export const isRubbleId = (b: number): boolean => b >= 0x01 && b <= 0x04;
export const isBuiltZoneId = (b: number): boolean => b >= 0x70 && b <= 0xc5 && !CONSTRUCTION_SET.has(b) && !ABANDONED_SET.has(b);

/** 满足谓词的格数。 */
export function countTiles(state: CityState, pred: (b: number, i: number) => boolean): number {
  const xbld = state.layers.xbld;
  let n = 0;
  for (let i = 0; i < xbld.length; i++) if (pred(xbld[i]!, i)) n++;
  return n;
}
/** 带 TL 角标且 XBLD 在分区建筑 / 过渡态范围内的锚点格。 */
export function anchors(state: CityState, pred: (b: number) => boolean = (b) => b >= 0x70 && b <= 0xc5): number[] {
  const { xbld, xzon } = state.layers;
  const out: number[] = [];
  for (let i = 0; i < xbld.length; i++) if ((xzon[i]! & Corner.TL) !== 0 && pred(xbld[i]!)) out.push(i);
  return out;
}
/** 图中出现过的建筑 ID 集合（过滤谓词）。 */
export function idsPresent(state: CityState, pred: (b: number) => boolean): Set<number> {
  const s = new Set<number>();
  for (const b of state.layers.xbld) if (pred(b)) s.add(b);
  return s;
}

// ===== sim/utilities/bits.ts =====（spec:power-water §2.2：哪些格子可导电 / 可导水）
// 本模块独占 XBIT 的 POWERABLE / POWERED / PIPED / WATERED 四位；POWERABLE / PIPED 由本规则从 XBLD / XUND 推出
// （放置系统的乐观预置与本规则一致；onTilesChanged 与 .SC2 读档时按规则重算，保证位与层永远自洽）。
import { DEVELOPED_FIRST, XBit } from '../../contracts/grid';
import { isPipeUnd, isPowerCarrier } from '../../contracts/net';
import { XBLD_BIG_PARK, XBLD_SMALL_PARK, XBLD_STATUE, XUND_SUBWAY_STATION } from './defs';

/** 可导电：电线 / 电线十字口 / 架空电线，以及一切已建建筑（≥ 0x70）——雕像与大公园除外；道路 / 铁路 / 树 / 瓦砾 / 空分区地不导电。 */
export const powerableFor = (xbld: number): boolean =>
  isPowerCarrier(xbld) || (xbld >= DEVELOPED_FIRST && xbld !== XBLD_STATUE && xbld !== XBLD_BIG_PARK);

/** 可导水：建筑与小公园自带隐式管线（地铁站地下部分 0x23 例外）；其余格看地下是否有管线 / 管线十字口。 */
export const pipedFor = (xbld: number, xund: number): boolean =>
  xbld >= DEVELOPED_FIRST || xbld === XBLD_SMALL_PARK ? xund !== XUND_SUBWAY_STATION : isPipeUnd(xund);

export const RULE_MASK = XBit.Powerable | XBit.Piped;
/** 格 (xbld, xund) 按规则应有的 POWERABLE | PIPED 位组合。 */
export const ruleBits = (xbld: number, xund: number): number =>
  (powerableFor(xbld) ? XBit.Powerable : 0) | (pipedFor(xbld, xund) ? XBit.Piped : 0);

/** 直接按规则重写整层的 POWERABLE / PIPED（读档重建用；不经 TileWriter，调用方负责 layerChanged）。返回改动格数。 */
export function applyRuleToLayer(xbld: Uint8Array, xund: Uint8Array, xbit: Uint8Array): number {
  let changed = 0;
  for (let i = 0; i < xbit.length; i++) {
    const want = ruleBits(xbld[i]!, xund[i]!);
    const cur = xbit[i]!;
    const next = (cur & ~RULE_MASK & 0xff) | want;
    if (next !== cur) { xbit[i] = next; changed++; }
  }
  return changed;
}

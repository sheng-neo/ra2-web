// ===== sim/placement/testFixtures.ts =====（仅供本目录的 *.test.ts 使用；只依赖 contracts，直接改图层搭最小场景，不经 TileWriter）
import { XBit, tileIndex } from '../../contracts/grid';
import type { CityState } from '../../contracts/state';

/** 把格 i 变成水面：水面高度 surface（默认 = 当前地表，即与平地齐平）、深度 depth（基准海拔 = surface − depth）；depth ≥ 1 → 水下 0x10，0 → 零深度浅水 0x30。 */
export function setWater(state: CityState, i: number, surface = state.layers.alt[i]!, depth = 1, salt = false): void {
  const L = state.layers;
  L.alt[i] = surface - depth;
  L.waterLevel[i] = surface;
  L.xter[i] = depth > 0 ? 0x10 : 0x30;
  L.xbit[i] = (L.xbit[i]! | XBit.Water | (salt ? XBit.SaltWater : 0)) & ~XBit.Piped & 0xff;
}
/** 干地坡面码 1..13（基准海拔不变）。 */
export function setSlope(state: CityState, i: number, code: number): void { state.layers.xter[i] = code & 0x0f; }
/** 瀑布格 0x3E（bedrock + 水）。 */
export function setWaterfall(state: CityState, i: number): void {
  const L = state.layers;
  L.xter[i] = 0x3e; L.waterLevel[i] = L.alt[i]! + 1; L.xbit[i] = L.xbit[i]! | XBit.Water;
}
/** 直接写一个 XBLD 值（不经 TileWriter，counts 需要时由调用方忽略）。 */
export function putXbld(state: CityState, x: number, y: number, id: number, xzon = 0xf0): void {
  const i = tileIndex(x, y);
  state.layers.xbld[i] = id; state.layers.xzon[i] = xzon;
  state.counts.tile[0] = state.counts.tile[0]! - 1; state.counts.tile[id] = state.counts.tile[id]! + 1;
}
export const T = tileIndex;

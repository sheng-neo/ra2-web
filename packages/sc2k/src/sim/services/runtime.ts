// ===== sim/services/runtime.ts =====
// 服务系统的运行缓存（闭包态，不持久化；任一读档后由 postLoad 重建）。本模块没有 priv：城市中心、交通报告、告示牌与
// 微模拟全部可由真源层（XBLD / XTRF / XTXT / XLAB / XMIC / MISC 标量）重建或直接存于 CityState。
import { HALF_N, QUARTER_N } from '../../contracts/grid';
import type { SimContext } from '../../contracts/system';

/** allocMicrosim 之后、放置者尚未在占地格写 XTXT 标签之前的待绑定记录（onTilesChanged 里补写标签）。 */
export interface PendingAlloc { slot: number; tileId: number }

export interface ServicesRuntime {
  ctx: SimContext | null;                 // init / postLoad 绑定
  centerHx: number; centerHy: number;     // 城市中心半格坐标（state.totals.centerX/Y = 2×）
  pending: PendingAlloc[];
  airportTilesCache: number;              // −1 = 失效，需重扫
  /** runDataMaps 的草稿缓冲（复用，避免每月分配）。 */
  scratch: {
    src: Int32Array; newPlt: Uint8Array; habR: Int32Array; habI: Int32Array; developedHalf: Uint8Array; newVal: Uint8Array;
    popW: Int32Array; plc: Uint8Array; fir: Uint8Array; newPop: Uint8Array; newRog: Uint8Array; crimeSrc: Int32Array; newCrm: Uint8Array;
  };
}

export function createRuntime(): ServicesRuntime {
  return {
    ctx: null, centerHx: 0, centerHy: 0, pending: [], airportTilesCache: -1,
    scratch: {
      src: new Int32Array(HALF_N), newPlt: new Uint8Array(HALF_N), habR: new Int32Array(QUARTER_N), habI: new Int32Array(QUARTER_N),
      developedHalf: new Uint8Array(HALF_N), newVal: new Uint8Array(HALF_N), popW: new Int32Array(QUARTER_N), plc: new Uint8Array(QUARTER_N),
      fir: new Uint8Array(QUARTER_N), newPop: new Uint8Array(QUARTER_N), newRog: new Uint8Array(QUARTER_N), crimeSrc: new Int32Array(HALF_N), newCrm: new Uint8Array(HALF_N),
    },
  };
}

/** 向零截断的整数除法（spec:services §4 第 1 条：不要用 Math.floor）。 */
export const idiv = (a: number, b: number): number => (a / b) | 0;
export const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

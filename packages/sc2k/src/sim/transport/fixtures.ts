// ===== sim/transport/fixtures.ts =====（本目录验收测试共用的场景搭建助手）
// 只依赖 contracts（sim/** 非测试文件不得 import testkit）：经 ctx.act 写层、用一条 core 命令触发 TileWriter 扇出（onTilesChanged）。
// 生产代码不 import 本文件。
import type { SimHost } from '../../contracts/host';
import { Corner, XBit, ZONE_MASK, tileIndex } from '../../contracts/grid';
import { NET_BASE } from '../../contracts/net';
import type { NetFamily } from '../../contracts/net';
import type { CityState } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';

/** 触发阶段末扇出：派发一条无副作用的 core 命令（setSpeed 为当前速度），TileWriter.flush → onTilesChanged。 */
export function flush(host: SimHost): void {
  host.dispatch({ type: 'setSpeed', speed: host.state.clock.speed });
}
export const lay = (ctx: SimContext, x: number, y: number, id: number): void => { ctx.act.setXbld(tileIndex(x, y), id); };
export const layUnd = (ctx: SimContext, x: number, y: number, v: number): void => { ctx.act.setXund(tileIndex(x, y), v); };
/** 直线网络：横向用 L-R 直线（idx 0），纵向用 T-B 直线（idx 1）；只写直线片段，路口由测试自行写。 */
export function layLine(ctx: SimContext, family: Exclude<NetFamily, 'subway' | 'pipe'>, x0: number, y0: number, x1: number, y1: number): void {
  const horizontal = y0 === y1;
  const id = NET_BASE[family] + (horizontal ? 0 : 1);
  if (horizontal) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) lay(ctx, x, y0, id);
  else for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) lay(ctx, x0, y, id);
}
export function layUndLine(ctx: SimContext, family: 'subway' | 'pipe', x0: number, y0: number, x1: number, y1: number): void {
  const horizontal = y0 === y1;
  const v = NET_BASE[family] + (horizontal ? 0 : 1);
  if (horizontal) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) layUnd(ctx, x, y0, v);
  else for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) layUnd(ctx, x0, y, v);
}
/** 2×2 车站（公交 0xEC / 火车 0xED）：四格同 ID + 角标 T-L/T-R/B-L/B-R + POWERABLE。 */
export function station2x2(ctx: SimContext, id: number, x0: number, y0: number): void {
  const corners = [Corner.TL, Corner.TR, Corner.BL, Corner.BR] as const;
  let k = 0;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const i = tileIndex(x0 + dx, y0 + dy);
    ctx.act.setXbld(i, id);
    ctx.act.setXzon(i, (ctx.state.layers.xzon[i]! & ZONE_MASK) | corners[k++]!);
    ctx.act.setXbit(i, XBit.Powerable, true);
  }
}
/** 1×1 建筑（地铁站 0xE9、拱城等）：角标 0xF0。 */
export function building1x1(ctx: SimContext, id: number, x: number, y: number): void {
  const i = tileIndex(x, y);
  ctx.act.setXbld(i, id);
  ctx.act.setXzon(i, (ctx.state.layers.xzon[i]! & ZONE_MASK) | Corner.All);
}
export function zoneTile(ctx: SimContext, x: number, y: number, zone: number): void {
  const i = tileIndex(x, y);
  ctx.act.setXzon(i, (ctx.state.layers.xzon[i]! & ~ZONE_MASK) | (zone & ZONE_MASK));
}
export const setFunding = (state: CityState, pct: number): void => { state.economy.funding.fill(pct); };
export const setWater = (state: CityState, x: number, y: number, on: boolean): void => {
  const i = tileIndex(x, y);
  state.layers.xbit[i] = on ? state.layers.xbit[i]! | XBit.Water : state.layers.xbit[i]! & ~XBit.Water;
};
export const setXter = (state: CityState, x: number, y: number, code: number): void => { state.layers.xter[tileIndex(x, y)] = code; };
export const sumXtrf = (state: CityState): number => { let s = 0; for (const v of state.maps.xtrf) s += v; return s; };

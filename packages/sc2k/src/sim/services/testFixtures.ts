// ===== sim/services/testFixtures.ts =====
// 服务系统测试夹具（只依赖 contracts，供本目录 *.test.ts 调用；不进生产依赖图）：经 ctx.act 写建筑 / 分区 / 道路，使 counts 与脏追踪保持一致。
import { FOOTPRINT, cornerBits } from '../../contracts/footprint';
import { XBit, ZONE_MASK, tileIndex } from '../../contracts/grid';
import type { SimHost } from '../../contracts/host';
import type { SimContext } from '../../contracts/system';

export interface BuildOpts { powered?: boolean; watered?: boolean; zone?: number }

/** 在 (x, y) 以 TL 锚格放整栋建筑：XBLD、XZON 角标（保留 / 覆盖低 4 位分区码）、POWERABLE|PIPED（+ POWERED / WATERED 可选，默认都置）。 */
export function build(ctx: SimContext, id: number, x: number, y: number, o: BuildOpts = {}): number[] {
  const n = FOOTPRINT[id]!;
  const tiles: number[] = [];
  for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) {
    const i = tileIndex(x + dx, y + dy);
    const low = o.zone ?? (ctx.state.layers.xzon[i]! & ZONE_MASK);
    ctx.act.setXbld(i, id);
    ctx.act.setXzon(i, cornerBits(n, dx, dy) | low);
    ctx.act.setXbit(i, XBit.Powerable | XBit.Piped, true);
    ctx.act.setXbit(i, XBit.Powered, o.powered !== false);
    ctx.act.setXbit(i, XBit.Watered, o.watered !== false);
    tiles.push(i);
  }
  return tiles;
}

/** 拆为空地（XBLD 0、角标清零、电水位清零）。 */
export function clear(ctx: SimContext, tiles: readonly number[]): void {
  for (const i of tiles) {
    ctx.act.setXbld(i, 0);
    ctx.act.setXzon(i, ctx.state.layers.xzon[i]! & ZONE_MASK);
    ctx.act.setXbit(i, XBit.Powerable | XBit.Piped | XBit.Powered | XBit.Watered, false);
  }
}

/** 矩形分区（只写低 4 位）。 */
export function zoneRect(ctx: SimContext, zone: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const i = tileIndex(x, y);
    ctx.act.setXzon(i, (ctx.state.layers.xzon[i]! & 0xf0) | zone);
  }
}

/** 一行 / 一列直路（0x1D 横 / 0x1E 纵），返回格数。 */
export function roadLine(ctx: SimContext, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  if (y0 === y1) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { ctx.act.setXbld(tileIndex(x, y0), 0x1d); n++; }
  else for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { ctx.act.setXbld(tileIndex(x0, y), 0x1e); n++; }
  return n;
}

/** 让 core 扇出 onTilesChanged（经一条无副作用命令触发 flush）。 */
export function flush(host: SimHost): void {
  host.dispatch({ type: 'setSpeed', speed: host.state.clock.speed });
}

/** 距离下一个 month_day == day 还有多少天（含当天为 0 时取下一个月）。 */
export function daysUntil(host: SimHost, day: number, strictFuture = false): number {
  const cur = host.state.clock.age % 25;
  let d = (day - cur + 25) % 25;
  if (d === 0 && strictFuture) d = 25;
  return d;
}

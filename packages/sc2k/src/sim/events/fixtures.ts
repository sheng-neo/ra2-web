// ===== sim/events/fixtures.ts =====（仅供 events 的 *.test.ts import；只依赖 contracts，不依赖 testkit）
// 灾害测试用小工具：按灾害 tick 推进 host、搭建筑占地、找标签格等。
import { DISASTER_TICK_MS } from '../../contracts/clock';
import { cornerBits } from '../../contracts/footprint';
import { FOOTPRINT } from '../../contracts/footprint';
import { tileIndex } from '../../contracts/grid';
import type { SimHost } from '../../contracts/host';
import type { Speed } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';

/** 用慢速档推进：每次 advance 恰一个灾害 / 物件 tick，且城市模式下不会顺带推进日历（accumMs 归零）。 */
export const TICK_SPEED: Speed = 2;

/** 推进 n 个 tick（两种模式通用）；遇模态（disasterAlert / extraPaper / newspaper）自动关闭。 */
export function runTicks(host: SimHost, n: number): void {
  const clock = host.state.clock;
  const prev = clock.speed;
  clock.speed = TICK_SPEED;
  try {
    for (let k = 0; k < n; k++) {
      if (clock.modalPause > 0) host.modalClosed();
      host.advance(DISASTER_TICK_MS[TICK_SPEED], () => 0, { budgetMs: Infinity, maxDaysPerFrame: 1 });
      clock.accumMs = 0;
    }
    if (clock.modalPause > 0) host.modalClosed();
  } finally { clock.speed = prev; }
}

/** 推进直到 pred 为真或到达 maxTicks；返回用掉的 tick 数。 */
export function runUntil(host: SimHost, pred: () => boolean, maxTicks: number): number {
  let used = 0;
  while (used < maxTicks && !pred()) { runTicks(host, 1); used++; }
  return used;
}

/** 以 (x, y) 为 TL 锚格写整栋建筑（XBLD 全占地 + XZON 角标 + 分区 nibble）。返回锚格索引。 */
export function placeBuilding(ctx: SimContext, id: number, x: number, y: number, zone = 0): number {
  const n = FOOTPRINT[id] ?? 1;
  for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) {
    const i = tileIndex(x + dx, y + dy);
    ctx.act.setXbld(i, id);
    ctx.act.setXzon(i, cornerBits(n, dx, dy) | (zone & 0x0f));
  }
  return tileIndex(x, y);
}

/** 给建筑占地写微模拟标签（xtxt）并登记 XMIC 记录（tileId）。label = 0x33 + record。 */
export function labelBuilding(ctx: SimContext, anchor: number, id: number, record: number): number {
  const n = FOOTPRINT[id] ?? 1, L = ctx.state.layers;
  const ax = anchor >> 7, ay = anchor & 127, label = 0x33 + record;
  for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) L.xtxt[tileIndex(ax + dx, ay + dy)] = label;
  L.xmic[record * 8] = id;
  return label;
}

/** 全部事件里取某类型。 */
export function ofType<T extends { type: string }, K extends T['type']>(events: readonly T[], type: K): Extract<T, { type: K }>[] {
  return events.filter((e): e is Extract<T, { type: K }> => e.type === type);
}

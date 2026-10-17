// ===== sim/transport/counts.test.ts =====（WORKPLAN WP6 验收：roadTileCounts 增量 = 全量；读档重建；口径）
import { describe, expect, it } from 'vitest';
import { TILES, tileIndex } from '../../contracts/grid';
import { NET_BASE, isBridge, isHighway, isRoad } from '../../contracts/net';
import type { CityState } from '../../contracts/state';
import { createTestContext } from '../../testkit';
import { flush, lay, layLine, station2x2 } from './fixtures';
import { createTransportSystem } from './index';

function brute(state: CityState): { roadTiles: number; highwayTiles: number; bridgeTiles: number } {
  let roadTiles = 0, highwayTiles = 0, bridgeTiles = 0;
  for (let i = 0; i < TILES; i++) {
    const id = state.layers.xbld[i]!;
    if (isRoad(id) && !isHighway(id)) roadTiles++;
    if (isHighway(id)) highwayTiles++;
    if (isBridge(id)) bridgeTiles++;
  }
  return { roadTiles, highwayTiles, bridgeTiles };
}

describe.each(['optimistic', 'pessimistic'] as const)('roadTileCounts（%s 桩）', (profile) => {
  it('增量维护 == 全量重数（放置、覆盖、拆除、交叉件 / 匝道 / 高速桥的双重口径）', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createTransportSystem()] });
    const T = ctx.q.transport;
    expect(T.roadTileCounts()).toEqual({ roadTiles: 0, highwayTiles: 0, bridgeTiles: 0 });
    layLine(ctx, 'road', 10, 10, 30, 10); layLine(ctx, 'rail', 10, 12, 30, 12);
    lay(ctx, 15, 10, 0x45); lay(ctx, 16, 10, 0x43);                       // 道口 / 电线交叉仍是道路格
    lay(ctx, 20, 20, 0x4b); lay(ctx, 21, 20, 0x49);                       // 高速 × 道路：只计高速
    lay(ctx, 22, 20, 0x6a); lay(ctx, 23, 20, 0x6b);                       // 加固高速桥：高速 + 桥
    lay(ctx, 25, 25, 0x58); lay(ctx, 26, 25, 0x57); lay(ctx, 27, 25, 0x5c); lay(ctx, 28, 25, 0x5a);
    lay(ctx, 30, 30, 0x5d); lay(ctx, 31, 30, 0x3f);                       // 匝道 / 隧道口 ∈ ROAD_SET
    station2x2(ctx, 0xec, 40, 40);
    flush(host);
    expect(T.roadTileCounts()).toEqual(brute(state));
    expect(T.roadTileCounts()).toEqual({ roadTiles: 21 + 2, highwayTiles: 4, bridgeTiles: 2 + 4 });
    lay(ctx, 12, 10, 0); lay(ctx, 13, 10, NET_BASE.rail); lay(ctx, 22, 20, 0x01); lay(ctx, 25, 25, 0); lay(ctx, 30, 30, NET_BASE.road + 14);
    flush(host);
    expect(T.roadTileCounts()).toEqual(brute(state));
    // 同一批内改了又改回：无变化
    lay(ctx, 14, 10, 0); lay(ctx, 14, 10, NET_BASE.road); flush(host);
    expect(T.roadTileCounts()).toEqual(brute(state));
  });
  it('快照载入 / postLoad 后全量重算；返回的是拷贝', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createTransportSystem()] });
    layLine(ctx, 'road', 0, 0, 0, 127); lay(ctx, 5, 5, 0x49); lay(ctx, 6, 6, 0x5b); flush(host);
    const c = ctx.q.transport.roadTileCounts();
    expect(c).toEqual(brute(state));
    c.roadTiles = 0;
    expect(ctx.q.transport.roadTileCounts().roadTiles).toBe(128);
    const other = createTestContext({ profile, systems: [createTransportSystem()] });
    other.host.loadSnapshot(host.saveSnapshot());
    expect(other.ctx.q.transport.roadTileCounts()).toEqual(brute(state));
    // 夹具直接改层 + postLoad 重建
    other.state.layers.xbld[tileIndex(9, 9)] = NET_BASE.road + 1;
    for (const s of other.host.systems) s.postLoad?.(other.ctx, 'snapshot');
    expect(other.ctx.q.transport.roadTileCounts()).toEqual(brute(other.state));
  });
});

// ===== sim/transport/access.test.ts =====（WORKPLAN WP6 验收：24 偏移可达、脏缓存、2×2 车站 36 格影响区）
import { describe, expect, it } from 'vitest';
import { XBit, tileIndex } from '../../contracts/grid';
import { NET_BASE } from '../../contracts/net';
import { createTestContext } from '../../testkit';
import { building1x1, flush, lay, layLine, layUnd, station2x2 } from './fixtures';
import { createTransportSystem } from './index';

const mk = (profile: 'optimistic' | 'pessimistic') => createTestContext({ profile, systems: [createTransportSystem()] });

describe.each(['optimistic', 'pessimistic'] as const)('hasAccess（%s 桩）', (profile) => {
  it('(3,0) / (2,1) 可达；(2,2) / (3,1) 不可达；轴向 4 格不可达', () => {
    const { ctx, host } = mk(profile);
    const T = ctx.q.transport;
    const probe = (dx: number, dy: number): boolean => {
      lay(ctx, 50 + dx, 50 + dy, NET_BASE.road); flush(host);
      const r = T.hasAccess(50, 50);
      lay(ctx, 50 + dx, 50 + dy, 0); flush(host);
      return r;
    };
    expect(T.hasAccess(50, 50)).toBe(false);
    expect(probe(3, 0)).toBe(true); expect(probe(0, -3)).toBe(true);
    expect(probe(2, 1)).toBe(true); expect(probe(-1, 2)).toBe(true);
    expect(probe(1, 1)).toBe(true);
    expect(probe(2, 2)).toBe(false); expect(probe(3, 1)).toBe(false); expect(probe(1, 3)).toBe(false);
    expect(probe(4, 0)).toBe(false);
    expect(T.hasAccess(50, 50)).toBe(false);
  });
  it('缓存随放置 / 拆除失效；markAccessDirty 覆盖绕过 TileWriter 的写入', () => {
    const { ctx, host, state } = mk(profile);
    const T = ctx.q.transport;
    expect(T.hasAccess(20, 20)).toBe(false);
    lay(ctx, 23, 20, NET_BASE.road); flush(host);
    expect(T.hasAccess(20, 20)).toBe(true);
    lay(ctx, 23, 20, 0); flush(host);
    expect(T.hasAccess(20, 20)).toBe(false);
    // 直接写层（不经 act）→ 缓存仍是旧值；markAccessDirty 后更新
    state.layers.xbld[tileIndex(20, 22)] = NET_BASE.road + 1;
    expect(T.hasAccess(20, 20)).toBe(false);
    ctx.act.markAccessDirty([tileIndex(20, 22)]);
    expect(T.hasAccess(20, 20)).toBe(true);
    ctx.act.markAccessDirty([-1, 999999]);                                  // 越界忽略
  });
  it('纯铁路 / 高速 / 地铁 / 电线不提供可达；车站格提供', () => {
    const { ctx, host } = mk(profile);
    const T = ctx.q.transport;
    lay(ctx, 31, 30, NET_BASE.rail); lay(ctx, 29, 30, 0x49); lay(ctx, 30, 31, NET_BASE.power); layUnd(ctx, 30, 29, NET_BASE.subway); flush(host);
    expect(T.hasAccess(30, 30)).toBe(false);
    building1x1(ctx, 0xe9, 32, 30); flush(host);
    expect(T.hasAccess(30, 30)).toBe(true);
    lay(ctx, 32, 30, 0); flush(host);
    expect(T.hasAccess(30, 30)).toBe(false);
    lay(ctx, 32, 30, 0x5d); flush(host);                                   // 匝道 ∈ ROAD_SET
    expect(T.hasAccess(30, 30)).toBe(true);
  });
  it('2×2 车站影响区 36 格（去掉占地）；1×1 地铁站 24 格', () => {
    const { ctx, host } = mk(profile);
    const T = ctx.q.transport;
    station2x2(ctx, 0xec, 60, 60); flush(host);
    let n = 0;
    for (let x = 50; x <= 70; x++) for (let y = 50; y <= 70; y++) {
      const inFp = x >= 60 && x <= 61 && y >= 60 && y <= 61;
      if (!inFp && T.hasAccess(x, y)) n++;
    }
    expect(n).toBe(36);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) lay(ctx, 60 + dx, 60 + dy, 0);
    building1x1(ctx, 0xe9, 60, 60); flush(host);
    n = 0;
    for (let x = 50; x <= 70; x++) for (let y = 50; y <= 70; y++) if (!(x === 60 && y === 60) && T.hasAccess(x, y)) n++;
    expect(n).toBe(24);
  });
  it('边缘 / 越界：越界偏移跳过，越界坐标返回 false', () => {
    const { ctx, host } = mk(profile);
    const T = ctx.q.transport;
    expect(T.hasAccess(-1, 0)).toBe(false); expect(T.hasAccess(0, 128)).toBe(false);
    lay(ctx, 0, 1, NET_BASE.road); flush(host);
    expect(T.hasAccess(0, 0)).toBe(true);
    expect(T.hasAccess(127, 127)).toBe(false);
  });
  it('roadDistance：0 在路上、1 相邻、4 为三格内无路；不依赖车站', () => {
    const { ctx, host } = mk(profile);
    const T = ctx.q.transport;
    layLine(ctx, 'road', 10, 10, 10, 15); flush(host);
    expect(T.roadDistance(10, 12)).toBe(0);
    expect(T.roadDistance(11, 12)).toBe(1);
    expect(T.roadDistance(13, 12)).toBe(3);
    expect(T.roadDistance(14, 12)).toBe(4);
    expect(T.roadDistance(13, 18)).toBe(3);
    expect(T.roadDistance(-5, 0)).toBe(4);
  });
  it('postLoad / 快照载入后缓存重建；trafficAt 读 XTRF 半格', () => {
    const { ctx, host, state } = mk(profile);
    lay(ctx, 43, 40, NET_BASE.road); flush(host);
    expect(ctx.q.transport.hasAccess(40, 40)).toBe(true);
    state.maps.xtrf[(40 >> 1) * 64 + (40 >> 1)] = 77;
    expect(ctx.q.transport.trafficAt(40, 40)).toBe(77); expect(ctx.q.transport.trafficAt(41, 41)).toBe(77); expect(ctx.q.transport.trafficAt(42, 40)).toBe(0);
    const bytes = host.saveSnapshot();
    const other = mk(profile);
    expect(other.ctx.q.transport.hasAccess(40, 40)).toBe(false);
    other.host.loadSnapshot(bytes);
    expect(other.ctx.q.transport.hasAccess(40, 40)).toBe(true);
    expect(other.state.layers.xbit[tileIndex(43, 40)]! & XBit.Water).toBe(0);
  });
});

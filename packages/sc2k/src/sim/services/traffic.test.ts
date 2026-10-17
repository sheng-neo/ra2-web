import { describe, expect, it } from 'vitest';
import { halfIndex, tileIndex } from '../../contracts/grid';
import { MISC, miscGet } from '../../contracts/io';
import { createTestContext, runDays } from '../../testkit';
import { createServicesSystem } from './index';
import { daysUntil, flush, roadLine } from './testFixtures';

const sumOf = (a: Uint8Array): number => a.reduce((s, v) => s + v, 0);

describe.each(['optimistic', 'pessimistic'] as const)('services.traffic（%s 桩）', (profile) => {
  it('第 19 天衰减后 Σ XTRF == state.traffic.total == MISC 0x0030；之后 addTraffic(w) 恰增 w；分母为 0 时 graph == total', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createServicesSystem()] });
    const a = tileIndex(10, 10), b = tileIndex(11, 11), c = tileIndex(60, 7);
    for (let k = 0; k < 20; k++) ctx.act.addTraffic(a, 4);
    ctx.act.addTraffic(b, 3);
    ctx.act.addTraffic(c, 7);
    expect(state.maps.xtrf[halfIndex(10, 10)]).toBe(83);   // (10,10) 与 (11,11) 同一半格
    expect(state.maps.xtrf[halfIndex(60, 7)]).toBe(7);
    runDays(host, daysUntil(host, 19) + 1);
    const total = sumOf(state.maps.xtrf);
    expect(total).toBe(83 - (83 >> 2) + 7 - Math.max(1, 7 >> 2));
    expect(state.traffic.total).toBe(total);
    expect(miscGet(state.rawMisc, MISC.trafficCount)).toBe(total);
    expect(state.traffic.graph).toBe(total);                 // 没有路网：分母 1
    expect(ctx.q.services.trafficReport()).toEqual(state.traffic);
    ctx.act.addTraffic(c, 5);
    expect(sumOf(state.maps.xtrf) - state.traffic.total).toBe(5);
    ctx.act.addTraffic(a, 2);
    expect(sumOf(state.maps.xtrf) - state.traffic.total).toBe(7);
    expect(state.traffic.total).toBe(total);                 // 报告缓存到下一个第 19 天
  });

  it('衰减：255 → 192、4 → 3、3 → 2、1 → 0；饱和 255；越界 / 非正权重忽略', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createServicesSystem()] });
    const X = state.maps.xtrf;
    X[halfIndex(0, 0)] = 255; X[halfIndex(2, 0)] = 4; X[halfIndex(4, 0)] = 3; X[halfIndex(6, 0)] = 1;
    ctx.act.addTraffic(tileIndex(0, 0), 9);
    expect(X[halfIndex(0, 0)]).toBe(255);
    ctx.act.addTraffic(-5, 9); ctx.act.addTraffic(16384, 9); ctx.act.addTraffic(tileIndex(8, 0), 0); ctx.act.addTraffic(tileIndex(8, 0), -3);
    expect(X[halfIndex(8, 0)]).toBe(0);
    runDays(host, daysUntil(host, 19) + 1);
    expect([X[halfIndex(0, 0)], X[halfIndex(2, 0)], X[halfIndex(4, 0)], X[halfIndex(6, 0)]]).toEqual([192, 3, 2, 0]);
    runDays(host, 25);
    expect([X[halfIndex(2, 0)], X[halfIndex(4, 0)]]).toEqual([2, 1]);
  });

  it('graph = total / (1 + 道路格 + 高速格 + 桥格)；路网变化在下一个第 19 天才进入报告', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createServicesSystem()] });
    expect(roadLine(ctx, 20, 20, 28, 20)).toBe(9);
    flush(host);
    for (let k = 0; k < 10; k++) ctx.act.addTraffic(tileIndex(20, 20), 20);
    runDays(host, daysUntil(host, 19) + 1);
    expect(state.traffic.roadTiles).toBe(9);
    expect(state.traffic.total).toBe(200 - (200 >> 2));
    expect(state.traffic.graph).toBe(Math.trunc(150 / 10));
    roadLine(ctx, 20, 30, 29, 30);
    flush(host);
    expect(state.traffic.roadTiles).toBe(9);
    runDays(host, 25);
    expect(state.traffic.roadTiles).toBe(19);
  });
});

describe('services.traffic（读档重建）', () => {
  it('.SC2 往返：导出写 MISC 0x0030 = 第 19 天 total；导入后 traffic 由 Σ XTRF 与路网重建', () => {
    const { ctx, host, state } = createTestContext({ systems: [createServicesSystem()] });
    roadLine(ctx, 20, 20, 23, 20);
    flush(host);
    for (let k = 0; k < 5; k++) ctx.act.addTraffic(tileIndex(20, 20), 20);
    runDays(host, daysUntil(host, 19) + 1);
    const day19Total = state.traffic.total;
    ctx.act.addTraffic(tileIndex(22, 20), 6);
    runDays(host, daysUntil(host, 0, true));
    const doc = host.exportSc2();
    expect(miscGet(doc.misc, MISC.trafficCount)).toBe(day19Total);
    host.importSc2(doc);
    expect(state.traffic.total).toBe(sumOf(state.maps.xtrf));
    expect(state.traffic.total).toBe(day19Total + 6);
    expect(state.traffic.roadTiles).toBe(4);
    expect(state.traffic.graph).toBe(Math.trunc((day19Total + 6) / 5));
    expect(miscGet(state.rawMisc, MISC.trafficCount)).toBe(state.traffic.total);
  });
});

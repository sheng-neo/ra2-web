// ===== sim/transport/decay.test.ts =====（spec:transport §2.15 预算衰败：funding 100 不掷骰、funding 0 变废墟、桥梁随风坍塌、地铁塌陷、总开关）
import { describe, expect, it } from 'vitest';
import { XBit, tileIndex } from '../../contracts/grid';
import { NET_BASE } from '../../contracts/net';
import { BudgetLine } from '../../contracts/state';
import { createTestContext, runDays } from '../../testkit';
import { flush, lay, layLine, setFunding } from './fixtures';
import { createTransportSystem } from './index';

const countId = (xbld: Uint8Array, pred: (id: number) => boolean): number => { let n = 0; for (const v of xbld) if (pred(v)) n++; return n; };

describe.each(['optimistic', 'pessimistic'] as const)('预算衰败（%s 桩）', (profile) => {
  it('funding == 100：一个月后路网完好且 growthVisit 零 PRNG 消费', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createTransportSystem()] });
    setFunding(state, 100);
    layLine(ctx, 'road', 10, 10, 60, 10); layLine(ctx, 'rail', 10, 20, 60, 20); lay(ctx, 30, 30, 0x58); ctx.act.setXund(tileIndex(5, 5), NET_BASE.subway);
    flush(host);
    const prng = ctx.prng.state();
    runDays(host, 25);
    expect(ctx.prng.state()).toBe(prng);
    expect(countId(state.layers.xbld, (id) => id === NET_BASE.road)).toBe(51);
    expect(countId(state.layers.xbld, (id) => id === NET_BASE.rail)).toBe(51);
    expect(state.layers.xbld[tileIndex(30, 30)]).toBe(0x58);
    expect(state.layers.xund[tileIndex(5, 5)]).toBe(NET_BASE.subway);
  });
  it('funding == 0：道路 / 铁路在一次生长扫描后全部变废墟（清 POWERABLE、角标）、地铁段塌陷（交叉件退化为水管）；计数增量 == 全量', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createTransportSystem()] });
    setFunding(state, 0);
    layLine(ctx, 'road', 10, 10, 40, 10); layLine(ctx, 'rail', 10, 20, 40, 20);
    for (let x = 10; x <= 40; x++) ctx.act.setXbit(tileIndex(x, 10), XBit.Powerable | XBit.Powered, true);
    ctx.act.setXund(tileIndex(5, 5), NET_BASE.subway); ctx.act.setXund(tileIndex(5, 6), 0x1f); ctx.act.setXund(tileIndex(5, 7), 0x20); ctx.act.setXund(tileIndex(5, 8), NET_BASE.pipe);
    flush(host);
    runDays(host, 25);
    expect(countId(state.layers.xbld, (id) => id === NET_BASE.road || id === NET_BASE.rail)).toBe(0);
    expect(countId(state.layers.xbld, (id) => id >= 0x01 && id <= 0x04)).toBe(62);
    for (let x = 10; x <= 40; x++) expect(state.layers.xbit[tileIndex(x, 10)]! & (XBit.Powerable | XBit.Powered)).toBe(0);
    expect(state.layers.xund[tileIndex(5, 5)]).toBe(0);
    expect(state.layers.xund[tileIndex(5, 6)]).toBe(NET_BASE.pipe + 1);
    expect(state.layers.xund[tileIndex(5, 7)]).toBe(NET_BASE.pipe);
    expect(state.layers.xund[tileIndex(5, 8)]).toBe(NET_BASE.pipe);
    expect(ctx.q.transport.roadTileCounts()).toEqual({ roadTiles: 0, highwayTiles: 0, bridgeTiles: 0 });
    const ev = host.drainEvents().filter((e) => e.type === 'structureDestroyed');
    expect(ev).toHaveLength(62);
    expect(ev.every((e) => e.type === 'structureDestroyed' && e.cause === 'DECAY')).toBe(true);
  });
  it('桥梁：wind + rand(0..49) ≥ funding 时坍塌（清空、bridgeCollapse + goto 事件）；大风下 99% 也必塌；无风 100% 不塌', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createTransportSystem()] });
    setFunding(state, 100);
    state.economy.funding[BudgetLine.Bridges] = 99;
    state.weather.wind = 120;
    lay(ctx, 20, 20, 0x58); lay(ctx, 21, 20, 0x57); lay(ctx, 22, 20, 0x5b); lay(ctx, 23, 20, 0x5c); flush(host);
    runDays(host, 25);
    for (let x = 20; x <= 23; x++) expect(state.layers.xbld[tileIndex(x, 20)]).toBe(0);
    const ev = host.drainEvents();
    expect(ev.filter((e) => e.type === 'bridgeCollapse')).toHaveLength(4);
    expect(ev.filter((e) => e.type === 'goto')).toHaveLength(4);
    expect(ev.filter((e) => e.type === 'structureDestroyed' && e.cause === 'BRIDGE')).toHaveLength(4);
    expect(ctx.q.transport.roadTileCounts().bridgeTiles).toBe(0);
    // 无风、funding 60：rand(0..49) < 60 恒成立 → 不塌
    state.economy.funding[BudgetLine.Bridges] = 60; state.weather.wind = 0;
    lay(ctx, 20, 20, 0x58); flush(host);
    runDays(host, 25);
    expect(state.layers.xbld[tileIndex(20, 20)]).toBe(0x58);
  });
  it('高速 2×2 块在偶数锚点一次掷骰、整块变废墟；匝道按 Highways 单格；subwayDecays=false 保留地铁；budgetDecay=false 关闭全部衰败', () => {
    const a = createTestContext({ profile, systems: [createTransportSystem()] });
    setFunding(a.state, 0);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) lay(a.ctx, 50 + dx, 50 + dy, 0x49);
    lay(a.ctx, 52, 50, 0x5d);
    flush(a.host);
    runDays(a.host, 25);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) expect(a.state.layers.xbld[tileIndex(50 + dx, 50 + dy)]).toBeGreaterThanOrEqual(0x01);
    expect(a.state.layers.xbld[tileIndex(50, 50)]).toBeLessThanOrEqual(0x04);
    expect(a.state.layers.xbld[tileIndex(52, 50)]).toBeLessThanOrEqual(0x04);
    const b = createTestContext({ profile, systems: [createTransportSystem()], tuning: { transport: { subwayDecays: false } } });
    setFunding(b.state, 0);
    b.ctx.act.setXund(tileIndex(5, 5), NET_BASE.subway); flush(b.host);
    runDays(b.host, 25);
    expect(b.state.layers.xund[tileIndex(5, 5)]).toBe(NET_BASE.subway);
    const c = createTestContext({ profile, systems: [createTransportSystem()], tuning: { transport: { budgetDecay: false } } });
    setFunding(c.state, 0);
    layLine(c.ctx, 'road', 10, 10, 40, 10); lay(c.ctx, 20, 20, 0x58); flush(c.host);
    const prng = c.ctx.prng.state();
    runDays(c.host, 25);
    expect(c.ctx.prng.state()).toBe(prng);
    expect(countId(c.state.layers.xbld, (id) => id === NET_BASE.road)).toBe(31);
    expect(c.state.layers.xbld[tileIndex(20, 20)]).toBe(0x58);
  });
});

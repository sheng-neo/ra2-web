// ===== sim/transport/decay.test.ts =====（spec:transport §2.15 预算衰败：funding 100 不掷骰、funding 0 变废墟、桥梁随风坍塌、地铁塌陷、总开关）
import { describe, expect, it } from 'vitest';
import { XBit, tileIndex } from '../../contracts/grid';
import { NET_BASE, bridgeRunTiles } from '../../contracts/net';
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
  it('桥梁：wind + rand(0..49) ≥ funding 时整座桥坍塌（全段清空、一次 bridgeCollapse + goto）；两座桥各塌一次；大风下 99% 也必塌；无风 100% 不塌', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createTransportSystem()] });
    setFunding(state, 100);
    state.economy.funding[BudgetLine.Bridges] = 99;
    state.weather.wind = 120;
    lay(ctx, 20, 20, 0x58); lay(ctx, 21, 20, 0x57); lay(ctx, 22, 20, 0x58); lay(ctx, 23, 20, 0x57);   // 沿 x 的同族 4 格堤道（契约 bridgeRunTiles）
    for (let y = 40; y <= 45; y++) lay(ctx, 60, y, y % 2 === 0 ? 0x58 : 0x57);                       // 另一座 6 格堤道（沿 y）
    flush(host);
    runDays(host, 25);
    for (let x = 20; x <= 23; x++) expect(state.layers.xbld[tileIndex(x, 20)]).toBe(0);
    for (let y = 40; y <= 45; y++) expect(state.layers.xbld[tileIndex(60, y)]).toBe(0);
    const ev = host.drainEvents();
    expect(ev.filter((e) => e.type === 'bridgeCollapse')).toHaveLength(2);
    expect(ev.filter((e) => e.type === 'goto')).toHaveLength(2);
    expect(ev.filter((e) => e.type === 'structureDestroyed' && e.cause === 'BRIDGE')).toHaveLength(10);
    expect(ctx.q.transport.roadTileCounts().bridgeTiles).toBe(0);
    // 无风、funding 60：rand(0..49) < 60 恒成立 → 不塌
    state.economy.funding[BudgetLine.Bridges] = 60; state.weather.wind = 0;
    lay(ctx, 20, 20, 0x58); flush(host);
    runDays(host, 25);
    expect(state.layers.xbld[tileIndex(20, 20)]).toBe(0x58);
  });
  it('整桥坍塌只走同一座桥（复核修复）：两座相邻的平行竖桥（公路堤道 x=40 + 铁路桥 x=41）只塌掷到的那座、全段清空，另一座完好', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createTransportSystem()] });
    setFunding(state, 100);
    for (let y = 20; y <= 25; y++) {
      lay(ctx, 40, y, y % 2 === 0 ? 0x58 : 0x57); lay(ctx, 41, y, y % 2 === 0 ? 0x5b : 0x5a);
      ctx.act.setXbit(tileIndex(40, y), XBit.Flipped, true); ctx.act.setXbit(tileIndex(41, y), XBit.Flipped, true);   // 沿 y 铺设 = 翻转
    }
    flush(host);
    const before = ctx.q.transport.roadTileCounts().bridgeTiles;
    expect(bridgeRunTiles(state.layers.xbld, state.layers.xbit, tileIndex(40, 22)).sort((a, b) => a - b)).toEqual([20, 21, 22, 23, 24, 25].map((y) => tileIndex(40, y)));
    expect(bridgeRunTiles(state.layers.xbld, state.layers.xbit, tileIndex(41, 22))).toHaveLength(6);
    // 第三方存档翻转位口径相反时按邻接回退：清掉翻转位仍找到沿 y 的整座桥
    for (let y = 20; y <= 25; y++) state.layers.xbit[tileIndex(40, y)] = state.layers.xbit[tileIndex(40, y)]! & ~XBit.Flipped;
    expect(bridgeRunTiles(state.layers.xbld, state.layers.xbit, tileIndex(40, 22))).toHaveLength(6);
    expect(before).toBe(12);
  });
  it('加固高速桥 2×2 块（.SC2 导入可见）：整座桥带上块内搭档行', () => {
    const { ctx, state } = createTestContext({ profile, systems: [createTransportSystem()] });
    for (let x = 30; x < 38; x++) for (let y = 50; y <= 51; y++) lay(ctx, x, y, (x & 1) === 0 ? 0x6a : 0x6b);   // 沿 x 的 4 块
    expect(bridgeRunTiles(state.layers.xbld, state.layers.xbit, tileIndex(33, 50))).toHaveLength(16);
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
  it('整座桥同一天塌完：第一次掷骰命中后其余桥件不再残留为孤立桥段、不再计入 bridgeTiles；两岸引道重新选片', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createTransportSystem()] });
    setFunding(state, 100);
    state.economy.funding[BudgetLine.Bridges] = 0;
    layLine(ctx, 'road', 10, 30, 13, 30);
    for (let x = 14; x <= 21; x++) lay(ctx, x, 30, x % 2 === 0 ? 0x58 : 0x57);
    layLine(ctx, 'road', 22, 30, 25, 30);
    lay(ctx, 13, 31, NET_BASE.road + 1); lay(ctx, 13, 30, NET_BASE.road + 11);                     // 引道端头是三岔（L、B、R → 指向桥）
    flush(host);
    expect(ctx.q.transport.roadTileCounts().bridgeTiles).toBe(8);
    const sys = host.systems.find((s) => s.id === 'transport')!;
    sys.growthVisit!(ctx, 17, 30); flush(host);                                                     // 只掷中间一格
    for (let x = 14; x <= 21; x++) expect(state.layers.xbld[tileIndex(x, 30)], `x=${x}`).toBe(0);
    expect(ctx.q.transport.roadTileCounts().bridgeTiles).toBe(0);
    expect(state.layers.xbld[tileIndex(13, 30)]).toBe(NET_BASE.road + 7);                          // 三岔 → B-L 弯（只剩左、下两邻）
    expect(state.layers.xbld[tileIndex(22, 30)]).toBe(NET_BASE.road);                              // 端头直线保持 L-R
  });
  it('道路 / 铁路衰败后四邻重新选片：三岔 / 十字不再指向瓦砾；交叉件与坡面件不动；零额外 PRNG', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createTransportSystem()] });
    setFunding(state, 100);
    state.economy.funding[BudgetLine.Roads] = 0;
    layLine(ctx, 'road', 10, 10, 20, 10); layLine(ctx, 'road', 15, 11, 15, 14);
    lay(ctx, 15, 10, NET_BASE.road + 11);                                                           // (15,10) 三岔 L-B-R
    layLine(ctx, 'rail', 30, 10, 40, 10); lay(ctx, 35, 10, NET_BASE.rail + 14); layLine(ctx, 'rail', 35, 9, 35, 9); layLine(ctx, 'rail', 35, 11, 35, 11);   // 铁路十字
    flush(host);
    const sys = host.systems.find((s) => s.id === 'transport')!;
    const prng = ctx.prng.state();
    sys.growthVisit!(ctx, 15, 11); flush(host);                                                     // 三岔下方的道路格衰败
    const used = ctx.prng.state();
    expect(state.layers.xbld[tileIndex(15, 11)]).toBeGreaterThanOrEqual(0x01); expect(state.layers.xbld[tileIndex(15, 11)]).toBeLessThanOrEqual(0x04);
    expect(state.layers.xbld[tileIndex(15, 10)]).toBe(NET_BASE.road);                               // 三岔 → 直线 L-R
    expect(state.layers.xbld[tileIndex(15, 12)]).toBe(NET_BASE.road + 1);                           // 端头仍是 T-B 直线
    expect(used).not.toBe(prng);
    state.economy.funding[BudgetLine.Roads] = 100; state.economy.funding[BudgetLine.Rail] = 0;
    sys.growthVisit!(ctx, 35, 11); flush(host);                                                     // 十字下方的铁路格衰败
    expect(state.layers.xbld[tileIndex(35, 10)]).toBe(NET_BASE.rail + 13);                          // 十字 → L-T-R 三岔
  });
});

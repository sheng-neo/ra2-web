// ===== sim/economy/graphs.test.ts =====（WORKPLAN WP8 验收：XGRP 三档节奏——月 / 半年（6 月、12 月）/ 五年（year % 5 == 0 的 12 月）对齐点；缩放；不消费 PRNG）
import { describe, expect, it } from 'vitest';
import type { TestContextOptions } from '../../contracts/testkit';
import { createTestContext, runDays } from '../../testkit';
import { GRAPH_LEN, GRAPH_SERIES, GraphSeries, SEG_FIVE, SEG_FIVE_LEN, SEG_HALF, SEG_HALF_LEN, SEG_MONTH, SEG_MONTH_LEN, graphLatest, graphSlot, pushSegment } from './graphs';
import { createEconomySystem } from './index';

const mk = (opts: TestContextOptions = {}) => createTestContext({ systems: [createEconomySystem()], ...opts });
const latest = (xgrp: Int32Array, s: number, seg: 'm' | 'h' | 'f'): number =>
  seg === 'm' ? graphLatest(xgrp, s, SEG_MONTH, SEG_MONTH_LEN) : seg === 'h' ? graphLatest(xgrp, s, SEG_HALF, SEG_HALF_LEN) : graphLatest(xgrp, s, SEG_FIVE, SEG_FIVE_LEN);

describe('pushSegment', () => {
  it('左移一格、末尾写新值；段之间互不影响', () => {
    const xgrp = new Int32Array(GRAPH_SERIES * GRAPH_LEN);
    pushSegment(xgrp, 2, SEG_MONTH, SEG_MONTH_LEN, 1); pushSegment(xgrp, 2, SEG_MONTH, SEG_MONTH_LEN, 2);
    expect(xgrp[graphSlot(2, SEG_MONTH, 11)]).toBe(2); expect(xgrp[graphSlot(2, SEG_MONTH, 10)]).toBe(1); expect(xgrp[graphSlot(2, SEG_MONTH, 9)]).toBe(0);
    expect(xgrp[graphSlot(2, SEG_HALF, 19)]).toBe(0); expect(xgrp[graphSlot(1, SEG_MONTH, 11)]).toBe(0); expect(xgrp[graphSlot(3, SEG_MONTH, 0)]).toBe(0);
  });
});

describe.each(['optimistic', 'pessimistic'] as const)('graphs 阶段（%s 桩）', (profile) => {
  it('第 21 天推月值：16 条序列取各所有者当前值，Value / Crime 缩放向上取整，Fed Rate 为整数百分比', () => {
    const { host, state, ctx } = mk({ profile });
    state.census.citySize = 1234; state.census.res = 100; state.census.com = 200; state.census.ind = 300; state.census.unemploymentPct = 5;
    state.demographics.workforceLE = 70; state.demographics.workforceEQ = 80;
    state.national.value = 3000; state.national.population = 10000;
    state.totals.landValue = 6401; state.totals.crime = 3750; state.totals.pollution = 55; state.traffic.total = 77;
    state.utilities.power.usagePct = 42; state.utilities.water.usagePct = 17;
    runDays(host, 21);
    const prng = ctx.prng.state();
    runDays(host, 1);
    expect(ctx.prng.state()).toBe(prng);                         // graphs 不消费 PRNG
    const g = state.xgrp;
    expect(latest(g, GraphSeries.CitySize, 'm')).toBe(1234); expect(latest(g, GraphSeries.Residents, 'm')).toBe(100);
    expect(latest(g, GraphSeries.Commerce, 'm')).toBe(200); expect(latest(g, GraphSeries.Industry, 'm')).toBe(300);
    expect(latest(g, GraphSeries.Traffic, 'm')).toBe(77); expect(latest(g, GraphSeries.Pollution, 'm')).toBe(55);
    expect(latest(g, GraphSeries.Value, 'm')).toBe(3); expect(latest(g, GraphSeries.Crime, 'm')).toBe(1);
    expect(latest(g, GraphSeries.PowerPct, 'm')).toBe(42); expect(latest(g, GraphSeries.WaterPct, 'm')).toBe(17);
    expect(latest(g, GraphSeries.Health, 'm')).toBe(70); expect(latest(g, GraphSeries.Education, 'm')).toBe(80);
    expect(latest(g, GraphSeries.Unemployment, 'm')).toBe(5); expect(latest(g, GraphSeries.Gnp, 'm')).toBe(3000);
    expect(latest(g, GraphSeries.NatPop, 'm')).toBe(10000); expect(latest(g, GraphSeries.FedRate, 'm')).toBe(3);
    expect(g[graphSlot(GraphSeries.CitySize, SEG_MONTH, 10)]).toBe(0);
    expect(latest(g, GraphSeries.CitySize, 'h')).toBe(0); expect(latest(g, GraphSeries.CitySize, 'f')).toBe(0);
  });
  it('半年序列在 6 月与 12 月推；五年序列只在 year % 5 == 0 的 12 月推；月序列滚动 12 格', () => {
    const { host, state } = mk({ profile });
    state.economy.autoBudget = true;
    state.census.citySize = 500;
    runDays(host, 5 * 25 + 21);                                   // 1 月..5 月各推一次 + 6 月第 21 天前
    expect(latest(state.xgrp, GraphSeries.CitySize, 'h')).toBe(0);
    runDays(host, 1);                                             // 6 月第 21 天
    const g = state.xgrp;
    expect(latest(g, GraphSeries.CitySize, 'h')).toBe(500);
    expect(g[graphSlot(GraphSeries.CitySize, SEG_HALF, 18)]).toBe(0);
    for (let k = 6; k < 12; k++) expect(g[graphSlot(GraphSeries.CitySize, SEG_MONTH, k)]).toBe(500);
    for (let k = 0; k < 6; k++) expect(g[graphSlot(GraphSeries.CitySize, SEG_MONTH, k)]).toBe(0);
    expect(latest(g, GraphSeries.CitySize, 'f')).toBe(0);
    state.census.citySize = 900;
    runDays(host, 150);                                           // 跑完 12 月第 21 天（age 296 的阶段）
    expect(state.clock.age).toBe(297);
    expect(latest(g, GraphSeries.CitySize, 'h')).toBe(900); expect(g[graphSlot(GraphSeries.CitySize, SEG_HALF, 18)]).toBe(500);
    expect(latest(g, GraphSeries.CitySize, 'f')).toBe(900);       // 1900 % 5 == 0
    expect(g[graphSlot(GraphSeries.CitySize, SEG_FIVE, 18)]).toBe(0);
    state.census.citySize = 1300;
    runDays(host, 300);                                           // 1901 全年：半年推两次，五年不推
    expect(latest(g, GraphSeries.CitySize, 'h')).toBe(1300); expect(g[graphSlot(GraphSeries.CitySize, SEG_HALF, 18)]).toBe(1300); expect(g[graphSlot(GraphSeries.CitySize, SEG_HALF, 17)]).toBe(900);
    expect(latest(g, GraphSeries.CitySize, 'f')).toBe(900); expect(g[graphSlot(GraphSeries.CitySize, SEG_FIVE, 18)]).toBe(0);
    for (let k = 0; k < 12; k++) expect(g[graphSlot(GraphSeries.CitySize, SEG_MONTH, k)]).toBe(1300);
  });
});

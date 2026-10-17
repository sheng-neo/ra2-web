// ===== sim/economy/settle.test.ts =====（WORKPLAN WP8 验收：splitMonthly 之和 = 年额；Hard 开局债券；法令向下取整；税基用 census.taxable*；经费 / 利息 / 事件）
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../contracts/events';
import { OrdinanceId } from '../../contracts/state';
import { createTestContext, runDays } from '../../testkit';
import type { TestContextOptions } from '../../contracts/testkit';
import { createEconomySystem } from './index';
import { F_LINES, F_ORD, F_ORD_NET, F_TAX_I, F_TAX_R, F_TAX_TOTAL, Y_TOTALS, histTax, isValidPriv } from './priv';
import type { EconomyPriv } from './priv';
import { splitMonthly, structureCountsFromTiles, weightedIndustryTaxX100 } from './settle';

const mk = (opts: TestContextOptions = {}) => createTestContext({ systems: [createEconomySystem()], ...opts });
const privOf = (state: { priv: { economy?: unknown } }): EconomyPriv => { const p = state.priv.economy; if (!isValidPriv(p)) throw new Error('priv 无效'); return p; };
/** 去年年报中道路线（BudgetLine.Roads = 5）的全年支出。 */
const yearLineTotal = (lastYear: Int32Array): number => lastYear[Y_TOTALS + F_LINES + 5]!;
const ofType = <K extends SimEvent['type']>(evs: SimEvent[], type: K): Extract<SimEvent, { type: K }>[] => evs.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

describe('splitMonthly', () => {
  it('12 份之和恰等于年额，每份只差 0 或 1', () => {
    for (const annual of [0, 1, 5, 11, 12, 13, 100, 300, 12345, 99999, 125000]) {
      let sum = 0;
      for (let m = 0; m < 12; m++) {
        const v = splitMonthly(annual, m);
        expect(v === Math.floor(annual / 12) || v === Math.ceil(annual / 12)).toBe(true);
        sum += v;
      }
      expect(sum).toBe(annual);
    }
  });
});

describe('init：起始资金 / 难度 / Hard 开局债券', () => {
  it('Easy $20,000 无债券；Medium $10,000；Hard $10,000 + 1 张 3% 债券；税率 7、资金率 100、fed 3/4/5%', () => {
    const easy = mk({ params: { difficulty: 1 } }).state.economy;
    expect(easy.funds).toBe(20000); expect(easy.bonds).toEqual([]); expect(easy.difficulty).toBe(1); expect(easy.fedRateRaw).toBe(30000);
    expect(easy.taxRate).toEqual({ r: 7, c: 7, i: 7 }); expect(Array.from(easy.industryTax)).toEqual(new Array(11).fill(7)); expect(Array.from(easy.funding)).toEqual(new Array(11).fill(100));
    expect(easy.ordinances).toBe(0); expect(easy.autoBudget).toBe(false); expect(easy.impeached).toBe(false); expect(easy.yearOpeningFunds).toBe(20000);
    const medium = mk({ params: { difficulty: 2 } }).state.economy;
    expect(medium.funds).toBe(10000); expect(medium.bonds).toEqual([]); expect(medium.difficulty).toBe(2); expect(medium.fedRateRaw).toBe(40000);
    const hard = mk({ params: { difficulty: 3, startYear: 1950 } });
    expect(hard.state.economy.funds).toBe(10000); expect(hard.state.economy.difficulty).toBe(3); expect(hard.state.economy.fedRateRaw).toBe(50000);
    expect(hard.state.economy.bonds).toEqual([{ rateRaw: 30000, issuedYear: 1950, issuedMonth: 0 }]);
    expect(privOf(hard.state).ytd).toEqual([]);
  });
  it('Hard 债券一年付息 $300（12 个月之和），只付息不还本', () => {
    const { host, state } = mk({ params: { difficulty: 3 } });
    runDays(host, 301);                                           // 跑完 age 300（1 月第 0 天结算 12 月）
    expect(state.economy.funds).toBe(10000 - 300);
    expect(state.economy.bonds).toHaveLength(1);
  });
});

describe.each(['optimistic', 'pessimistic'] as const)('settleMonth（%s 桩）', (profile) => {
  it('税基用 census.taxable*（不是 res/com/ind），税率 × 人口 / 75 向下取整；工业按 11 产业加权', () => {
    const { host, state, ctx } = mk({ profile });
    const c = state.census;
    c.res = 999999; c.com = 999999; c.ind = 999999;          // 应被忽略
    c.taxableRes = 7500; c.taxableCom = 750; c.taxableInd = 1500;
    runDays(host, 1);                                             // age 0：nationalAnnual.economy 按契约在每个 1 月（含建城日）消费一次 PRNG
    const prng = ctx.prng.state();
    runDays(host, 25);                                            // runDays(n) 执行 n 天：age 1..25，含 age 25 的 settleMonth
    // ratio 全零 → 产业税均值 7 → 工业税 = ⌊1500 × 700 / 100 / 75⌋ = 140
    const flow = privOf(state).ytd[0]!;
    expect(flow[F_TAX_R]).toBe(700); expect(flow[F_TAX_TOTAL]).toBe(700 + 70 + 140); expect(flow[F_TAX_I]).toBe(140);
    expect(state.economy.funds).toBe(20000 + 910);
    expect(ctx.prng.state()).toBe(prng);                        // settleMonth / graphs 不消费 PRNG
    const ev = ofType(host.drainEvents(), 'monthSettled');
    expect(ev).toEqual([{ type: 'monthSettled', funds: 20910, net: 910 }]);
    // 账本：月 0 的 (pop, rate)
    const h = privOf(state).hist;
    expect(h[histTax(0, 0)]).toBe(7500); expect(h[histTax(0, 0) + 1]).toBe(7);
    // 产业占比生效：ratio = [100, 0, …]，tax_0 = 20 → 加权 2000 → ⌊1500 × 2000 / 7500⌋ = 400；taxRate.i 反推为 20
    state.industry.ratio.fill(0); state.industry.ratio[0] = 100;
    expect(host.dispatch({ type: 'setIndustryTax', k: 0, rate: 20 }).ok).toBe(true);
    expect(state.economy.taxRate.i).toBe(20);
    runDays(host, 25);
    expect(privOf(state).ytd[1]![F_TAX_I]).toBe(400);
    expect(weightedIndustryTaxX100(state.economy.industryTax, state.industry.ratio)).toBe(2000);
  });
  it('法令金额逐条向下取整（不是求和后取整）；新城几乎全为 $0', () => {
    const { host, state } = mk({ profile });
    state.census.taxableRes = 5358;                              // tax.R = ⌊7 × 5358 / 75⌋ = 500
    host.dispatch({ type: 'setOrdinance', id: OrdinanceId.ProReading, on: true });      // −1/6% × R = −⌊500/600⌋ = 0
    host.dispatch({ type: 'setOrdinance', id: OrdinanceId.CprTraining, on: true });     // 同上 0（求和后取整会是 −1）
    host.dispatch({ type: 'setOrdinance', id: OrdinanceId.IncomeTax, on: true });       // +1% × R = 5
    host.dispatch({ type: 'setOrdinance', id: OrdinanceId.NuclearFreeZone, on: true }); // 无金额
    runDays(host, 26);
    const flow = privOf(state).ytd[0]!;
    expect(flow[F_TAX_R]).toBe(500);
    expect(flow[F_ORD + OrdinanceId.ProReading]).toBe(0); expect(flow[F_ORD + OrdinanceId.CprTraining]).toBe(0);
    expect(flow[F_ORD + OrdinanceId.IncomeTax]).toBe(5); expect(flow[F_ORD + OrdinanceId.NuclearFreeZone]).toBe(0);
    expect(flow[F_ORD_NET]).toBe(5);
    expect(state.economy.funds).toBe(20000 + 500 + 5);
  });
  it('部门经费 = 数量 × 单价 × 资金率 / 12（按 splitMonthly 切分，年和精确）；数量由 counts.tile 推出', () => {
    const { host, state } = mk({ profile });
    state.counts.tile[0xd2] = 9;                                 // 1 座警局（3×3）→ $100 / 年
    state.counts.tile[0xd8] = 16;                                // 1 座监狱并入警察线 → +$100 / 年
    state.counts.tile[0xd1] = 9;                                 // 1 座医院 $50 / 年
    state.counts.tile[0xec] = 4;                                 // 1 座公交站：固定 $25 / 年
    expect(structureCountsFromTiles(state)).toEqual({ police: 1, prison: 1, fire: 0, hospital: 1, school: 0, college: 0, busDepot: 1 });
    host.dispatch({ type: 'setFunding', line: 2, pct: 50 });     // Health 50% → $25 / 年
    runDays(host, 301);
    expect(state.economy.funds).toBe(20000 - 200 - 25 - 25);
    const y = privOf(state).lastYear;
    expect(y.length).toBeGreaterThan(0);
  });
  it('交通线资金率 < 80% 且有格 → underfunded 每年每线一次；税率 ≥ 10 → taxGripe 每年一次、≥ 15 severe', () => {
    const { host, state } = mk({ profile });
    for (let i = 0; i < 40; i++) state.layers.xbld[i] = 0x1d;   // 40 格道路（桩的 roadTileCounts 扫 XBLD）
    host.dispatch({ type: 'setFunding', line: 5, pct: 40 });
    host.dispatch({ type: 'setTax', rates: { r: 10, c: 7, i: 7 } });
    runDays(host, 51);                                            // 结算 1 月、2 月
    let ev = host.drainEvents();
    expect(ofType(ev, 'underfunded')).toEqual([{ type: 'underfunded', line: 5 }]);
    expect(ofType(ev, 'taxGripe')).toEqual([{ type: 'taxGripe', rate: 10, severe: false }]);
    runDays(host, 250);                                         // 到 age 301：跨年（closeYear 清去重位）
    host.dispatch({ type: 'setTax', rates: { r: 16, c: 7, i: 7 } });
    runDays(host, 25);
    ev = host.drainEvents();
    expect(ofType(ev, 'underfunded')).toEqual([{ type: 'underfunded', line: 5 }]);
    expect(ofType(ev, 'taxGripe')).toEqual([{ type: 'taxGripe', rate: 16, severe: true }]);
    // 道路维护费：40 格 × $0.10 × 40% = $1.6 → ⌊1⌋/年：第一年 $1，第二年 1 月份额 splitMonthly(1, 0) = 0；税收 0（无人口）
    expect(state.economy.funds).toBe(20000 - 1);
    expect(privOf(state).ytd[0]![F_LINES + 5]).toBe(splitMonthly(1, 0));
    expect(yearLineTotal(privOf(state).lastYear)).toBe(1);
  });
  it('广告法令计数：启用时每月 +1，停用后每月 −1，夹在 [0, max]', () => {
    const { host, state } = mk({ profile });
    host.dispatch({ type: 'setOrdinance', id: OrdinanceId.TouristAdvertising, on: true });
    runDays(host, 76);
    expect(state.economy.counters.advertising).toBe(3);
    host.dispatch({ type: 'setOrdinance', id: OrdinanceId.TouristAdvertising, on: false });
    runDays(host, 125);
    expect(state.economy.counters.advertising).toBe(0);
  });
});

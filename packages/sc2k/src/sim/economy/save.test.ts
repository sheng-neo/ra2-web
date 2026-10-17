// ===== sim/economy/save.test.ts =====（spec:economy-budget §3.10 存档映射：.SC2 导出 / 导入往返、ytd 由账本重建、fedRate / impeached 落点；快照 priv 往返与版本校验）
import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../contracts/grid';
import { MISC, miscGet, miscSet } from '../../contracts/io';
import { OrdinanceId } from '../../contracts/state';
import type { CityState } from '../../contracts/state';
import type { TestContextOptions } from '../../contracts/testkit';
import { snapshotCodec } from '../../io/snapshot';
import { createTestContext, runDays } from '../../testkit';
import { createEconomySystem } from './index';
import { ECONOMY_PRIV_VERSION, F_NET, F_ORD, ORDINANCE_COUNT, isValidPriv } from './priv';
import type { EconomyPriv } from './priv';
import { industryTaxOffset } from './save';

const mk = (opts: TestContextOptions = {}) => createTestContext({ systems: [createEconomySystem()], ...opts });
const privOf = (state: { priv: { economy?: unknown } }): EconomyPriv => { const p = state.priv.economy; if (!isValidPriv(p)) throw new Error('priv 无效'); return p; };
const sumNet = (p: EconomyPriv): number => p.ytd.reduce((acc, f) => acc + f[F_NET]!, 0);
/** 账本可重建的字段（去掉 20 条法令的逐条金额：存档只保留净额）。 */
const reconstructable = (f: Int32Array): number[] => Array.from(f).filter((_, k) => k < F_ORD || k >= F_ORD + ORDINANCE_COUNT);
/** zones 桩没有 importFrom：把 zones 所有的输入（税基、产业占比）从原城拷到导入城，模拟真 zones 的读档。 */
function copyZonesInputs(from: CityState, to: CityState): void {
  to.census.taxableRes = from.census.taxableRes; to.census.taxableCom = from.census.taxableCom; to.census.taxableInd = from.census.taxableInd;
  to.industry.ratio.set(from.industry.ratio);
}

function busyCity(profile: 'optimistic' | 'pessimistic') {
  const t = mk({ profile, params: { difficulty: 2, startYear: 1950 } });
  const { host, state } = t;
  state.census.taxableRes = 3000; state.census.taxableCom = 1500; state.census.taxableInd = 750;
  state.industry.ratio[2] = 100;                                  // 产业全部为第 2 类 → 加权工业税率 = 该产业税率（整数，账本可精确重建）
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) state.layers.xbld[tileIndex(10 + dx, 10 + dy)] = 0xd2;   // 1 座警局（层 + 计数一致，导入时由层重数）
  state.counts.tile[0xd2] = 9; state.counts.tile[0] = state.counts.tile[0]! - 9;   // 夹具直接写层：计数须与 xbld 全量重数一致（core 读档会校验）
  expect(host.dispatch({ type: 'setTax', rates: { r: 9, c: 9, i: 9 } }).ok).toBe(true);
  expect(host.dispatch({ type: 'setIndustryTax', k: 2, rate: 15 }).ok).toBe(true);
  expect(host.dispatch({ type: 'setFunding', line: 5, pct: 60 }).ok).toBe(true);
  expect(host.dispatch({ type: 'setOrdinance', id: OrdinanceId.IncomeTax, on: true }).ok).toBe(true);
  expect(host.dispatch({ type: 'cheat', code: 'fund' }).ok).toBe(true);
  expect(host.dispatch({ type: 'cheat', code: 'fund' }).ok).toBe(true);
  expect(host.dispatch({ type: 'setOption', key: 'autoBudget', value: true }).ok).toBe(true);
  runDays(host, 51);                                              // 结算了 1 月、2 月；现在是 3 月第 1 天
  return t;
}

describe.each(['optimistic', 'pessimistic'] as const)('.SC2 往返（%s 桩）', (profile) => {
  it('经济标量 / 债券 / 产业税率 / 账本块 / fedRate 写入 MISC 并读回一致；ytd 由账本重建', () => {
    const a = busyCity(profile);
    const e = a.state.economy, pa = privOf(a.state);
    expect(pa.ytd).toHaveLength(2);
    const doc = a.host.exportSc2();
    const m = doc.misc;
    expect(miscGet(m, MISC.money)).toBe(e.funds); expect(miscGet(m, MISC.bondCount)).toBe(2); expect(miscGet(m, MISC.bonds)).toBe(250000); expect(miscGet(m, MISC.bonds + 8)).toBe(0);
    expect(miscGet(m, MISC.difficulty)).toBe(2); expect(miscGet(m, MISC.ordinances)).toBe(1 << OrdinanceId.IncomeTax); expect(miscGet(m, MISC.autoBudget)).toBe(1);
    expect(miscGet(m, industryTaxOffset(2))).toBe(15); expect(miscGet(m, industryTaxOffset(0))).toBe(9);
    expect(miscGet(m, MISC.taxRes)).toBe(3000); expect(miscGet(m, MISC.taxRes + 4)).toBe(9); expect(miscGet(m, MISC.taxRes + 8)).toBe(e.fedRateRaw);
    expect(miscGet(m, MISC.taxRes + 12)).toBe(3000); expect(miscGet(m, MISC.taxRes + 16)).toBe(9);   // 1 月 (pop, rate)
    expect(miscGet(m, MISC.svcRoads + 4)).toBe(60); expect(miscGet(m, MISC.svcPolice)).toBe(1); expect(miscGet(m, MISC.svcPolice + 12)).toBe(1);
    expect(miscGet(m, MISC.bondBlock)).toBe(2); expect(miscGet(m, MISC.bondBlock + 8)).toBe(2);
    expect(miscGet(m, MISC.ordinanceBlock)).toBe(1);
    expect(Array.from(a.host.exportSc2().misc)).toEqual(Array.from(m));          // 导出确定性
    const b = mk({ profile });
    const diag = b.host.importSc2(doc);
    expect(diag.filter((d) => d.level === 'error')).toEqual([]);
    const eb = b.state.economy, pb = privOf(b.state);
    expect(eb.funds).toBe(e.funds); expect(eb.difficulty).toBe(2); expect(eb.taxRate).toEqual(e.taxRate);
    expect(Array.from(eb.industryTax)).toEqual(Array.from(e.industryTax)); expect(Array.from(eb.funding)).toEqual(Array.from(e.funding));
    expect(eb.ordinances).toBe(e.ordinances); expect(eb.autoBudget).toBe(true); expect(eb.fedRateRaw).toBe(e.fedRateRaw); expect(eb.impeached).toBe(false);
    expect(eb.bonds.map((x) => x.rateRaw)).toEqual(e.bonds.map((x) => x.rateRaw));
    expect(eb.bonds[0]).toEqual({ rateRaw: 250000, issuedYear: 1950, issuedMonth: 0 });
    expect(Array.from(pb.hist)).toEqual(Array.from(pa.hist));
    expect(pb.ytd.map(reconstructable)).toEqual(pa.ytd.map(reconstructable));   // 服务线 / 利息 / 法令净额按账本精确重建
    expect(pb.ytd[0]![F_ORD + OrdinanceId.IncomeTax]).toBe(0);    // 逐条法令金额不入存档（只有净额）
    expect(eb.yearOpeningFunds).toBe(eb.funds - sumNet(pb));
    expect(b.state.clock.age).toBe(51);
    expect(b.state.counts.tile[0xd2]).toBe(9);
    // 导入后继续推进：下一次结算与原城一致（zones 所有的输入由测试拷贝）
    copyZonesInputs(a.state, b.state);
    runDays(a.host, 25); runDays(b.host, 25);                     // 含 age 75 的结算
    expect(b.state.economy.funds).toBe(a.state.economy.funds);
    expect(privOf(b.state).ytd).toHaveLength(3);
  });
  it('impeached 标志经税线 C 块索引 2 往返；1 月第 0 天导出的 ytd 为去年 1–11 月', () => {
    const a = busyCity(profile);
    a.state.economy.impeached = true;
    const b = mk({ profile });
    b.host.importSc2(a.host.exportSc2());
    expect(b.state.economy.impeached).toBe(true);
    a.state.economy.impeached = false;
    runDays(a.host, 300 - 51);                                    // age 300 = 1 月第 0 天，日内阶段尚未执行
    expect(a.state.clock.age).toBe(300); expect(a.state.clock.phaseCursor).toBe(0);
    expect(privOf(a.state).ytd).toHaveLength(11);
    const c = mk({ profile });
    c.host.importSc2(a.host.exportSc2());
    expect(privOf(c.state).ytd).toHaveLength(11);
    expect(c.state.economy.impeached).toBe(false);
  });
  it('导入缺少产业税率 / fed 槽的存档：产业税率取工业税率；fedRate 由 XGRP 重建（再缺则按 natTrend 初始化）', () => {
    const a = busyCity(profile);
    const doc = a.host.exportSc2();
    for (let k = 0; k < 11; k++) miscSet(doc.misc, industryTaxOffset(k), 0);
    miscSet(doc.misc, MISC.taxRes + 8, 0);
    const b = mk({ profile });
    const diag = b.host.importSc2(doc);
    expect(Array.from(b.state.economy.industryTax)).toEqual(new Array(11).fill(a.state.economy.taxRate.i));
    expect(b.state.economy.fedRateRaw).toBe(40000);               // XGRP Fed Rate 月值 4 × 10000
    expect(diag.map((d) => d.code)).toEqual(expect.arrayContaining(['economy.industryTaxFilled', 'economy.fedRateRebuilt']));
    doc.xgrp.fill(0);
    b.state.national.trend = 2;
    const c = mk({ profile });
    c.host.importSc2(doc);
    expect(c.state.economy.fedRateRaw).toBe(30000 + 10000 * c.state.national.trend);
  });
});

describe('快照 priv', () => {
  it('saveSnapshot / loadSnapshot 原样保留账本与 ytd；hash(full) 不变；validatePriv 无错且在预算内', () => {
    const a = busyCity('optimistic');
    runDays(a.host, 250);                                         // 到 age 301：跨过 closeYear（账本满 12 个月、年报已生成）
    const bytes = a.host.saveSnapshot();
    const b = mk();
    expect(b.host.loadSnapshot(bytes)).toEqual([]);
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
    expect(privOf(b.state)).toEqual(privOf(a.state));
    expect(snapshotCodec.validatePriv(a.state).filter((d) => d.level === 'error')).toEqual([]);
    runDays(a.host, 30); runDays(b.host, 30);
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
  });
  it('priv 版本 / 形状不符 → postLoad 丢弃并重建空账本，不抛错；之后可继续推进', () => {
    const sys = createEconomySystem();
    const { host, state, ctx } = createTestContext({ systems: [sys] });
    runDays(host, 51);
    expect(privOf(state).ytd).toHaveLength(2);
    state.priv.economy = { v: ECONOMY_PRIV_VERSION + 1, hist: new Int32Array(3) };
    expect(() => sys.postLoad!(ctx, 'snapshot')).not.toThrow();
    expect(privOf(state).ytd).toHaveLength(0);
    delete state.priv.economy;
    expect(() => sys.postLoad!(ctx, 'sc2')).not.toThrow();
    expect(isValidPriv(state.priv.economy)).toBe(true);
    runDays(host, 25);
    expect(privOf(state).ytd).toHaveLength(1);
  });
});

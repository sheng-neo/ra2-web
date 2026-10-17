// ===== sim/economy/save.ts =====（spec:economy-budget §3.10 存档映射、spec:file-formats §2.3.3 27×i32 预算块；ARCHITECTURE §4.3 / §4.5）
// exportTo：资金 / 债券 / 难度 / 法令位 / 自动预算 / 广告与名望计数 / 11 条产业税率 / 税线 ×3 / 法令块 / 债券块 / 11 条经费块。
// importFrom：读回以上并由账本块近似重建 ytd；fedRateRaw 与 impeached 没有原版落点，借用税线块索引 2（"未明"槽，spec Q12）。
// 债券块在契约里只有 26 个 i32（0x0930..0x0997），写 [count, avgRateRaw, (count, avgRateRaw) × 12]，利率总和可由债券数组重算故省略。
import { MISC, miscGet, miscSet } from '../../contracts/io';
import type { Sc2Document } from '../../contracts/io';
import { dateOf } from '../../contracts/state';
import type { Diagnostic, SimContext } from '../../contracts/system';
import { GraphSeries, SEG_MONTH, SEG_MONTH_LEN, graphLatest } from './graphs';
import {
  F_BOND, F_EXPENSE, F_FIXED, F_INCOME, F_LINES, F_NET, F_ORD_NET, F_TAX_C, F_TAX_I, F_TAX_R, F_TAX_TOTAL, FLOW_LEN, LINE_COUNT,
  ensurePriv, freshPriv, histBond, histLine, histOrd, histTax,
} from './priv';
import type { EconomyPriv } from './priv';
import { tuningOf } from './runtime';
import { annualInterest, bondStats, collectInputs, enactedCount, splitMonthly, structureCountsFromTiles } from './settle';
import type { EconomyTuning } from './tuning';
import { clampInt, clampInt32 } from './tuning';

/** 27×i32 块之间的步长（0x6C B）；债券块在契约里只有 26 个 i32。 */
const SVC_STRIDE = 0x6c;
/** 税线 C 块索引 2 = 弹劾标志的魔数（原版此槽"未明"，读到恰为该值才认为已弹劾）。 */
const IMPEACHED_MAGIC = 0x494d50;
const ORDINANCE_BITS = 0xfffff;
export const industryTaxOffset = (k: number): number => MISC.industryGraph + 44 + 4 * k;
const svcOffset = (line: number): number => MISC.svcPolice + SVC_STRIDE * line;
const taxOffsets: readonly number[] = [MISC.taxRes, MISC.taxCom, MISC.taxInd];

/** 写一个 27×i32 块：[cur0, cur1, cur2, (a, b) × 12]，(a, b) 取自账本 hist 的 at(m)。 */
function writeBlock(misc: Int32Array, off: number, cur: readonly [number, number, number], at: (m: number) => readonly [number, number]): void {
  miscSet(misc, off, cur[0]); miscSet(misc, off + 4, cur[1]); miscSet(misc, off + 8, cur[2]);
  for (let m = 0; m < 12; m++) { const [a, b] = at(m); miscSet(misc, off + 12 + m * 8, a); miscSet(misc, off + 16 + m * 8, b); }
}
function readBlockMonths(misc: Int32Array, off: number, into: (m: number, a: number, b: number) => void): void {
  for (let m = 0; m < 12; m++) into(m, miscGet(misc, off + 12 + m * 8), miscGet(misc, off + 16 + m * 8));
}

export function exportEconomy(ctx: SimContext, doc: Sc2Document): void {
  const s = ctx.state, e = s.economy, misc = doc.misc, tune = tuningOf(ctx), priv = ensurePriv(s), h = priv.hist;
  const inp = collectInputs(ctx, tune);
  miscSet(misc, MISC.money, clampInt32(e.funds));
  miscSet(misc, MISC.bondCount, e.bonds.length);
  for (let k = 0; k < tune.bonds.max; k++) miscSet(misc, MISC.bonds + 4 * k, k < e.bonds.length ? clampInt32(e.bonds[k]!.rateRaw) : 0);
  miscSet(misc, MISC.difficulty, e.difficulty);
  miscSet(misc, MISC.ordinances, e.ordinances & ORDINANCE_BITS);
  miscSet(misc, MISC.autoBudget, e.autoBudget ? 1 : 0);
  miscSet(misc, MISC.advertising, e.counters.advertising);
  miscSet(misc, MISC.fame, e.counters.fame);
  for (let k = 0; k < LINE_COUNT; k++) miscSet(misc, industryTaxOffset(k), e.industryTax[k]!);
  const taxCur: readonly (readonly [number, number, number])[] = [
    [inp.taxable.r, e.taxRate.r, e.fedRateRaw],
    [inp.taxable.c, e.taxRate.c, e.impeached ? IMPEACHED_MAGIC : 0],
    [inp.taxable.i, e.taxRate.i, 0],
  ];
  for (let z = 0; z < 3; z++) writeBlock(misc, taxOffsets[z]!, taxCur[z]!, (m) => [h[histTax(z as 0 | 1 | 2, m)]!, h[histTax(z as 0 | 1 | 2, m) + 1]!]);
  const lastOrdNet = priv.ytd.length > 0 ? priv.ytd[priv.ytd.length - 1]![F_ORD_NET]! : 0;
  writeBlock(misc, MISC.ordinanceBlock, [enactedCount(e.ordinances), lastOrdNet, 0], (m) => [h[histOrd(m)]!, h[histOrd(m) + 1]!]);
  const bs = bondStats(e);
  miscSet(misc, MISC.bondBlock, bs.count); miscSet(misc, MISC.bondBlock + 4, bs.avgRaw);
  for (let m = 0; m < 12; m++) { miscSet(misc, MISC.bondBlock + 8 + m * 8, h[histBond(m)]!); miscSet(misc, MISC.bondBlock + 12 + m * 8, h[histBond(m) + 1]!); }
  for (let line = 0; line < LINE_COUNT; line++) writeBlock(misc, svcOffset(line), [inp.lineCount[line]!, e.funding[line]!, 0], (m) => [h[histLine(line, m)]!, h[histLine(line, m) + 1]!]);
  // 设施数双账对账（spec §4.13）：services 的计数非零且与地块推出的不一致时记日志（以地块为准）。
  const svc = ctx.q.services.structureCounts(), tiles = structureCountsFromTiles(s);
  for (const key of ['police', 'prison', 'fire', 'hospital', 'school', 'college', 'busDepot'] as const) {
    if (svc[key] !== 0 && svc[key] !== tiles[key]) ctx.diag.push({ level: 'info', code: 'economy.structureCountMismatch', message: `${key}: services ${svc[key]} ≠ tileCounts ${tiles[key]}（以 tileCounts 为准）` });
  }
}

/** 由账本块近似重建已结月份的现金流（利息 / 公交站按当前状态；交通线按主单价），spec §3.10。 */
export function rebuildYtdFromHist(ctx: SimContext, priv: EconomyPriv, tune: EconomyTuning): void {
  const s = ctx.state, e = s.economy, h = priv.hist, D = tune.taxDivisor;
  const d = dateOf(s.clock);
  const settled = d.day === 0 ? (d.month + 11) % 12 : d.month;   // 第 0 天：当月的 settleMonth 尚未执行
  const U = tune.serviceUnitCents, T = tune.transitUnitCents, k = tune.transitCostScale;
  const unitCents: readonly number[] = [U.police, U.fire, U.hospital, U.school, U.college, T.roadTile * k, T.highwayTile * k, T.bridgeTile * k, T.railTile * k, T.subwayTile * k, T.tunnelTile * k];
  const busDepots = structureCountsFromTiles(s).busDepot;
  priv.ytd = [];
  for (let m = 0; m < settled; m++) {
    const f = new Int32Array(FLOW_LEN);
    f[F_TAX_R] = Math.floor((h[histTax(0, m) + 1]! * h[histTax(0, m)]!) / D);
    f[F_TAX_C] = Math.floor((h[histTax(1, m) + 1]! * h[histTax(1, m)]!) / D);
    f[F_TAX_I] = Math.floor((h[histTax(2, m) + 1]! * h[histTax(2, m)]!) / D);
    f[F_TAX_TOTAL] = f[F_TAX_R]! + f[F_TAX_C]! + f[F_TAX_I]!;
    f[F_ORD_NET] = h[histOrd(m) + 1]!;
    let lines = 0;
    for (let line = 0; line < LINE_COUNT; line++) {
      const v = splitMonthly(Math.floor((h[histLine(line, m)]! * unitCents[line]! * h[histLine(line, m) + 1]!) / 10000), m);
      f[F_LINES + line] = v; lines += v;
    }
    let bond = 0;
    for (const b of e.bonds) bond += splitMonthly(annualInterest(b.rateRaw), m);
    f[F_BOND] = bond;
    f[F_FIXED] = splitMonthly(Math.floor((busDepots * U.busDepot) / 100), m);
    f[F_INCOME] = f[F_TAX_TOTAL]! + Math.max(f[F_ORD_NET]!, 0);
    f[F_EXPENSE] = lines + f[F_FIXED]! + bond + Math.max(-f[F_ORD_NET]!, 0);
    f[F_NET] = f[F_INCOME]! - f[F_EXPENSE]!;
    priv.ytd.push(f);
  }
}

export function importEconomy(ctx: SimContext, doc: Sc2Document, diag: Diagnostic[]): void {
  const s = ctx.state, e = s.economy, misc = doc.misc, tune = tuningOf(ctx), B = tune.bonds;
  const priv = freshPriv(); s.priv.economy = priv;
  const h = priv.hist;
  e.funds = clampInt32(miscGet(misc, MISC.money));
  const diff = miscGet(misc, MISC.difficulty);
  e.difficulty = diff === 2 || diff === 3 ? diff : 1;
  const bondCount = clampInt(miscGet(misc, MISC.bondCount), 0, B.max);
  e.bonds.length = 0;
  for (let k = 0; k < bondCount; k++) e.bonds.push({ rateRaw: Math.max(0, miscGet(misc, MISC.bonds + 4 * k)), issuedYear: s.clock.foundedYear, issuedMonth: 0 });
  e.taxRate.r = clampInt(miscGet(misc, MISC.taxRes + 4), 0, tune.maxTaxRate);
  e.taxRate.c = clampInt(miscGet(misc, MISC.taxCom + 4), 0, tune.maxTaxRate);
  e.taxRate.i = clampInt(miscGet(misc, MISC.taxInd + 4), 0, tune.maxTaxRate);
  let anyIndustry = false;
  for (let k = 0; k < LINE_COUNT; k++) { e.industryTax[k] = clampInt(miscGet(misc, industryTaxOffset(k)), 0, tune.maxTaxRate); if (e.industryTax[k] !== 0) anyIndustry = true; }
  if (!anyIndustry && e.taxRate.i > 0) { e.industryTax.fill(e.taxRate.i); diag.push({ level: 'info', code: 'economy.industryTaxFilled', message: `11 条产业税率缺失，全部取工业税率 ${e.taxRate.i}` }); }
  for (let line = 0; line < LINE_COUNT; line++) e.funding[line] = clampInt(miscGet(misc, svcOffset(line) + 4), 0, 100);
  e.ordinances = (miscGet(misc, MISC.ordinances) & ORDINANCE_BITS) >>> 0;
  e.autoBudget = miscGet(misc, MISC.autoBudget) !== 0;
  e.counters.advertising = clampInt(miscGet(misc, MISC.advertising), 0, tune.advertisingCounterMax);
  e.counters.fame = miscGet(misc, MISC.fame);
  e.impeached = miscGet(misc, MISC.taxCom + 8) === IMPEACHED_MAGIC;
  // fedRateRaw：税线 R 块索引 2（本项目约定）→ XGRP Fed Rate 最近月值 × 10000 → 按 natTrend 初始化
  const fedSlot = miscGet(misc, MISC.taxRes + 8);
  const fedGraph = graphLatest(s.xgrp, GraphSeries.FedRate, SEG_MONTH, SEG_MONTH_LEN) * 10000;
  if (fedSlot >= B.fedMinRaw && fedSlot <= B.fedMaxRaw) e.fedRateRaw = fedSlot;
  else if (fedGraph >= B.fedMinRaw && fedGraph <= B.fedMaxRaw) { e.fedRateRaw = fedGraph; diag.push({ level: 'info', code: 'economy.fedRateRebuilt', message: `联邦利率由 XGRP 重建为 ${fedGraph}` }); }
  else e.fedRateRaw = clampInt(B.fedInitialRaw + B.fedPerTrendRaw * s.national.trend, B.fedMinRaw, B.fedMaxRaw);
  // 账本
  for (let z = 0; z < 3; z++) readBlockMonths(misc, taxOffsets[z]!, (m, pop, rate) => { h[histTax(z as 0 | 1 | 2, m)] = pop; h[histTax(z as 0 | 1 | 2, m) + 1] = clampInt(rate, 0, tune.maxTaxRate); });
  readBlockMonths(misc, MISC.ordinanceBlock, (m, count, net) => { h[histOrd(m)] = count; h[histOrd(m) + 1] = net; });
  for (let m = 0; m < 12; m++) { h[histBond(m)] = miscGet(misc, MISC.bondBlock + 8 + m * 8); h[histBond(m) + 1] = miscGet(misc, MISC.bondBlock + 12 + m * 8); }
  for (let line = 0; line < LINE_COUNT; line++) readBlockMonths(misc, svcOffset(line), (m, count, funding) => { h[histLine(line, m)] = count; h[histLine(line, m) + 1] = clampInt(funding, 0, 100); });
  rebuildYtdFromHist(ctx, priv, tune);
  let net = 0;
  for (const f of priv.ytd) net += f[F_NET]!;
  e.yearOpeningFunds = clampInt32(e.funds - net);
}

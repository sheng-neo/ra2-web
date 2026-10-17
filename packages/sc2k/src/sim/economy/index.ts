// ===== sim/economy/index.ts =====（CONTRACTS §V SimEntries.createEconomySystem；WORKPLAN WP8 [v1]）
// economy 系统：预算、税收、法令金额、债券、年度窗口、XGRP 图表、最小破产判定。
//  - 阶段：settleMonth / closeYear / nationalAnnual.economy / budgetWindow / graphs / scenario(v2 空转) / solvency
//  - 命令：setTax / setIndustryTax / setFunding / setOrdinance / issueBond / repayBond / setOption / cheat
//  - 查询 q.economy、动作 act.charge、模态 budget / gameOver（scenarioBrief / scenarioResult 为 v2）
//  - init 写起始资金 / 难度 / Hard 开局债券；priv 存账本与 ytd（priv.ts）；.SC2 读写在 save.ts。
import type { SimEntries } from '../../contracts/entrypoints';
import type { Actions } from '../../contracts/actions';
import type { NewCityParams, SimContext, System } from '../../contracts/system';
import { makeCommands } from './commands';
import { makePhases } from './phases';
import { ECONOMY_PRIV_VERSION, ensurePriv, freshPriv } from './priv';
import { makeQueries } from './queries';
import { createRuntime, restoreBudgetSnapshot, tuningOf } from './runtime';
import type { EconomyRuntime } from './runtime';
import { exportEconomy, importEconomy } from './save';
import { clampInt32 } from './tuning';

export { DEFAULT_ECONOMY_TUNING } from './tuning';
export type { EconomyTuning } from './tuning';

/** budget 模态的回答值：0 = 关闭 / 确认，1 = 取消并恢复滑块。 */
export const BUDGET_ANSWER_CONFIRM = 0, BUDGET_ANSWER_CANCEL = 1;

/** act.charge（CONTRACTS §J）：cost ≤ 0 恒 true；观察模式（已弹劾）拒绝；资金不足 → emit insufficientFunds 并返回 false。 */
function makeCharge(rt: EconomyRuntime): Actions['charge'] {
  return (cost: number): boolean => {
    if (cost <= 0) return true;
    const ctx = rt.bound;
    if (!ctx) return false;
    const e = ctx.state.economy;
    if (e.impeached) return false;
    if (e.funds < cost) { ctx.act.emit({ type: 'insufficientFunds', cost }); return false; }
    e.funds = clampInt32(e.funds - cost);
    return true;
  };
}

/** 新城（spec:economy §2.1）：起始资金按难度、税率 7、资金率 100、法令全关、联邦利率 3% + 1% × (难度 − 1)、Hard 自带 1 张 3% 债券。 */
function initEconomy(ctx: SimContext, p: NewCityParams): void {
  const tune = tuningOf(ctx), e = ctx.state.economy;
  e.difficulty = p.difficulty;
  e.funds = tune.startFunds[p.difficulty];
  e.taxRate.r = tune.defaultTaxRate; e.taxRate.c = tune.defaultTaxRate; e.taxRate.i = tune.defaultTaxRate;
  e.industryTax.fill(tune.defaultTaxRate);
  e.funding.fill(tune.defaultFunding);
  e.ordinances = 0;
  e.bonds.length = 0;
  e.fedRateRaw = tune.bonds.fedInitialRaw + tune.bonds.fedPerTrendRaw * (p.difficulty - 1);
  e.autoBudget = false;
  e.counters.advertising = 0; e.counters.fame = 0;
  e.impeached = false;
  e.yearOpeningFunds = e.funds;
  if (p.difficulty === 3) e.bonds.push({ rateRaw: tune.hardStartBondRateRaw, issuedYear: p.startYear, issuedMonth: 0 });
  ctx.state.priv.economy = freshPriv();
}

export const createEconomySystem = ((): System => {
  const rt = createRuntime();
  const sys: System = {
    id: 'economy',
    privVersion: ECONOMY_PRIV_VERSION,
    phases: makePhases(rt),
    commands: makeCommands(rt),
    queries: { economy: makeQueries(rt) },
    actions: { charge: makeCharge(rt) },
    init(ctx, p) { rt.bound = ctx; rt.snapshot = null; initEconomy(ctx, p); },
    importFrom(ctx, doc, diag) { rt.bound = ctx; rt.snapshot = null; importEconomy(ctx, doc, diag); },
    exportTo(ctx, doc) { exportEconomy(ctx, doc); },
    /** 任一读档后：重新绑定 ctx、校验 priv（版本不符 → 空账本重建）；不消费 PRNG、不改真源层。 */
    postLoad(ctx) { rt.bound = ctx; rt.snapshot = null; ensurePriv(ctx.state); },
    /**
     * 模态回答（与 contract-rfc WP12b 第 4 行的约定一致：外壳默认 answer(0) 必须是安全选项）：
     *  budget：0 = 关闭 / 确认（保留当前滑块），1 = 取消（恢复打开窗口时的滑块值）。
     *  gameOver：0 = 继续观看、1 = 回主菜单 —— 本模块无状态可改（impeached 已置位；回主菜单由 UI 处理）。
     */
    onModalAnswer(ctx, dialog, answer) {
      if (dialog === 'budget') {
        if (answer === BUDGET_ANSWER_CANCEL && rt.snapshot) restoreBudgetSnapshot(ctx, rt.snapshot);
        rt.snapshot = null;
      }
    },
  };
  return sys;
}) satisfies SimEntries['createEconomySystem'];

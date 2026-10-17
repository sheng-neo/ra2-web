// ===== sim/economy/commands.ts =====（CONTRACTS §K COMMAND_OWNER 归 economy 的 8 条命令；spec:economy-budget §2.4.1 税率、§2.5 法令、§3.5 债券、§2.15 作弊码）
// setTax / setIndustryTax / setFunding / setOrdinance / issueBond / repayBond / setOption / cheat。越界数值一律夹到合法范围（不拒绝）；
// 目标不存在（产业 k、线、法令 id、未知作弊码）→ reason 'noTarget'。PRNG：issueBond（可发行时一次抖动）、加钱作弊码（一次起火判定）。
import type { CommandResult, RejectReason } from '../../contracts/commands';
import { DisasterKind } from '../../contracts/grid';
import { MISC, miscSet } from '../../contracts/io';
import type { System } from '../../contracts/system';
import { budgetMath } from './budget';
import { applyIssue, pickIssueRate, repayEarliest } from './bonds';
import { F_TAX_TOTAL, LINE_COUNT, ORDINANCE_COUNT, ensurePriv } from './priv';
import { tuningOf } from './runtime';
import type { EconomyRuntime } from './runtime';
import { weightedIndustryTax } from './settle';
import { clampInt, clampInt32 } from './tuning';

const EMPTY: readonly number[] = Object.freeze([]) as readonly number[];
const ok = (cost = 0): CommandResult => ({ ok: true, cost, changed: EMPTY });
const reject = (reason: RejectReason): CommandResult => ({ ok: false, cost: 0, reason, changed: EMPTY });
const isIndex = (v: number, n: number): boolean => Number.isInteger(v) && v >= 0 && v < n;

/** 作弊码（spec §2.15；可重放命令）。 */
export const CHEAT_BOND = 'fund', CHEAT_CASH = 'cass';

export function makeCommands(_rt: EconomyRuntime): NonNullable<System['commands']> {
  return {
    /** 主税率滑块：一次写 R / C / I 并把 11 条产业税率同步为工业值（spec §2.4.1）。 */
    setTax(ctx, cmd) {
      const tune = tuningOf(ctx), e = ctx.state.economy;
      e.taxRate.r = clampInt(cmd.rates.r, 0, tune.maxTaxRate);
      e.taxRate.c = clampInt(cmd.rates.c, 0, tune.maxTaxRate);
      e.taxRate.i = clampInt(cmd.rates.i, 0, tune.maxTaxRate);
      e.industryTax.fill(e.taxRate.i);
      return ok();
    },
    /** 产业窗口：只写一条产业税率并反推加权 taxRate.i（不让两处互相覆盖，spec §4.14）。 */
    setIndustryTax(ctx, cmd) {
      if (!isIndex(cmd.k, LINE_COUNT)) return reject('noTarget');
      const tune = tuningOf(ctx), e = ctx.state.economy;
      e.industryTax[cmd.k] = clampInt(cmd.rate, 0, tune.maxTaxRate);
      e.taxRate.i = weightedIndustryTax(e.industryTax, ctx.state.industry.ratio);
      return ok();
    },
    setFunding(ctx, cmd) {
      const line = cmd.line as number;
      if (!isIndex(line, LINE_COUNT)) return reject('noTarget');
      ctx.state.economy.funding[line] = clampInt(cmd.pct, 0, 100);
      return ok();
    },
    /** 启停即时生效、无一次性费用；每次变化发 ordinance 事件；无核区影响工具可用性 → toolbar 事件。 */
    setOrdinance(ctx, cmd) {
      const id = cmd.id as number;
      if (!isIndex(id, ORDINANCE_COUNT)) return reject('noTarget');
      const tune = tuningOf(ctx), e = ctx.state.economy;
      const def = ctx.catalogue.ORDINANCES.find((d) => d.id === id);
      if (cmd.on && tune.ordinanceYearGate && def !== undefined && def.availableYear > ctx.q.economy.year()) return reject('notInvented');
      const bit = 1 << id, was = (e.ordinances & bit) !== 0;
      if (was === cmd.on) return ok();
      e.ordinances = cmd.on ? (e.ordinances | bit) >>> 0 : (e.ordinances & ~bit) >>> 0;
      ctx.act.emit({ type: 'ordinance', id: cmd.id, enacted: cmd.on });
      if (def?.forbidNuclear) ctx.act.emit({ type: 'toolbar', reason: 'ordinance' });
      return ok();
    },
    issueBond(ctx) {
      const tune = tuningOf(ctx), priv = ensurePriv(ctx.state);
      if (ctx.state.economy.impeached) return reject('locked');
      const preview = budgetMath(ctx, priv, tune).next[F_TAX_TOTAL]!;
      const r = pickIssueRate(ctx, priv, tune, preview);
      if (!r.ok) { ctx.act.emit({ type: 'bondRefused', reason: r.reason }); return reject(r.reason === 'max' ? 'limit' : 'locked'); }
      applyIssue(ctx, priv, r.rateRaw, tune);
      ctx.act.emit({ type: 'bondIssued', rateRaw: r.rateRaw });
      return ok();
    },
    repayBond(ctx) {
      const tune = tuningOf(ctx), priv = ensurePriv(ctx.state);
      if (ctx.state.economy.impeached) return reject('locked');
      const r = repayEarliest(ctx, priv, tune);
      if (r === 'none') return reject('noTarget');
      if (r === 'funds') { ctx.act.emit({ type: 'insufficientFunds', cost: tune.bonds.face }); return reject('funds'); }
      ctx.act.emit({ type: 'bondRepaid' });
      return ok(tune.bonds.face);
    },
    /** 选项：有 CityState 字段的写字段；只有 MISC 落点的（音效 / 音乐 / 报纸投递 / 号外）写 rawMisc 透传到 .SC2。 */
    setOption(ctx, cmd) {
      const s = ctx.state, v = cmd.value === true;
      switch (cmd.key) {
        case 'autoBudget': s.economy.autoBudget = v; break;
        case 'autoGoto': s.disaster.autoGoto = v; break;
        case 'noDisasters': s.disaster.noDisasters = v; break;
        case 'sound': miscSet(s.rawMisc, MISC.sound, v ? 1 : 0); break;
        case 'music': miscSet(s.rawMisc, MISC.music, v ? 1 : 0); break;
        case 'paperDelivery': miscSet(s.rawMisc, MISC.paperDelivery, v ? 1 : 0); break;
        case 'extraPaper': miscSet(s.rawMisc, MISC.extraPaper, v ? 1 : 0); break;
        default: return reject('noTarget');
      }
      return ok();
    },
    /** 资金类作弊码直接处理；起火副作用只写 state.disaster.pending（events 的状态机启动）。 */
    cheat(ctx, cmd) {
      const tune = tuningOf(ctx), s = ctx.state, e = s.economy, priv = ensurePriv(s);
      const code = cmd.code.trim().toLowerCase();
      if (code === CHEAT_BOND) {
        const r = pickIssueRate(ctx, priv, tune, 0, { rateRaw: tune.bonds.cheatRateRaw, bypassRating: true });
        if (!r.ok) { ctx.act.emit({ type: 'bondRefused', reason: r.reason }); return reject('limit'); }
        applyIssue(ctx, priv, r.rateRaw, tune);
        ctx.act.emit({ type: 'bondIssued', rateRaw: r.rateRaw });
        return ok();
      }
      if (code === CHEAT_CASH) {
        e.funds = clampInt32(e.funds + tune.cheatCash);
        if (ctx.prng.int(1000) < tune.cheatFirePermille && s.disaster.pending === DisasterKind.None) s.disaster.pending = DisasterKind.Fire;
        return ok();
      }
      return reject('noTarget');
    },
  };
}

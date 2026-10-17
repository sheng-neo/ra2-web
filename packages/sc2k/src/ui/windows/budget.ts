// ===== ui/windows/budget.ts =====（WP12b：预算窗口，spec:economy-budget §2.10；WORKPLAN WP12 "简版"）
// 税率滑块（一次改 R/C/I 三值）+ 11 条部门资金滑块（setFunding）+ 账目表（BudgetView.rows：YTD / 年末估计，带符号求净额）
// + 期初 / 当前 / 年末资金 + 自动预算复选框（setOption autoBudget）+「法令…」「债券…」明细按钮 + 顾问评语。
// 同一组件既是 Windows 菜单的非模态窗口，也是 1 月第 0 天挂起的 budget 模态（modal 模式多一个 OK → answer(0)）。
import type { BudgetLine } from '../../contracts/state';
import { BUDGET_LINE_COUNT } from '../../contracts/state';
import type { WindowDeps, WindowFactory } from '../windowTypes';
import { money, monthYear, pct } from './format';
import { bindText } from './text';
import { btn, checkbox, field, group, h, replace, slider, table } from './wdom';
import type { SliderHandle } from './wdom';

/** BudgetLine 下标 → strings 键后缀 budget.<key>（与 contracts/state.BudgetLine 同序）。 */
export const BUDGET_LINE_KEYS = ['police', 'fire', 'health', 'schools', 'colleges', 'roads', 'highways', 'bridges', 'rail', 'subway', 'tunnel'] as const;
export const TAX_MAX = 20, FUNDING_MAX = 100;

export interface BudgetOptions { modal?: boolean; onDone?: () => void }

export function buildBudget(deps: WindowDeps, opts: BudgetOptions = {}): { el: HTMLElement; refresh(): void } {
  const t = bindText(deps.strings);
  const q = deps.host.q.economy;
  const view0 = q.budgetView();

  const header = h('div', { cls: 'sc2k-win-row sc2k-win-budget-header', testid: 'budget-header' });
  // 税率：一个滑块同时写 R / C / I（spec §2.10 "滑块一次改 R/C/I 三值"）
  const taxSlider = slider({
    min: 0, max: TAX_MAX, value: view0.taxRate.r, fmt: pct, testid: 'budget-tax',
    onChange: (v) => { deps.dispatch({ type: 'setTax', rates: { r: v, c: v, i: v } }); refresh(); },
  });
  const taxDetail = h('span', { cls: 'sc2k-win-muted', testid: 'budget-tax-rci' });
  // 11 条资金滑块
  const fundingSliders: SliderHandle[] = [];
  const fundingRows: HTMLElement[] = [];
  for (let line = 0; line < BUDGET_LINE_COUNT; line++) {
    const s = slider({
      min: 0, max: FUNDING_MAX, value: view0.funding[line] ?? 0, fmt: pct, testid: `budget-funding-${BUDGET_LINE_KEYS[line]}`,
      onChange: (v) => { deps.dispatch({ type: 'setFunding', line: line as BudgetLine, pct: v }); refresh(); },
    });
    fundingSliders.push(s);
    fundingRows.push(field(t(`budget.${BUDGET_LINE_KEYS[line]}`), s.el));
  }
  const ledger = h('div', { cls: 'sc2k-win-ledger', testid: 'budget-ledger' });
  const summary = h('div', { cls: 'sc2k-win-summary', testid: 'budget-summary' });
  const advisors = h('ul', { cls: 'sc2k-win-advisors', testid: 'budget-advisors' });
  const auto = checkbox(t('ui.budget.autoBudget'), view0.autoBudget, (on) => { deps.dispatch({ type: 'setOption', key: 'autoBudget', value: on }); refresh(); }, { testid: 'budget-auto' });

  const buttons = h('div', { cls: 'sc2k-win-buttons' },
    btn(t('ui.budget.ordinances'), () => deps.openWindow('ordinances'), { testid: 'budget-open-ordinances' }),
    btn(t('ui.budget.bonds'), () => deps.openWindow('bonds'), { testid: 'budget-open-bonds' }),
    opts.modal ? btn(t('ui.ok'), () => opts.onDone?.(), { testid: 'budget-ok', cls: 'sc2k-win-primary' }) : null,
  );

  const el = h('div', { cls: 'sc2k-win-body sc2k-win-budget' },
    header,
    group(t('ui.budget.tax'), field(t('ui.tax.rate'), taxSlider.el), taxDetail),
    group(t('ui.budget.ledger'), ledger),
    group(t('ui.budget.funding'), ...fundingRows),
    summary,
    group(t('ui.budget.advisors'), advisors),
    h('div', { cls: 'sc2k-win-row' }, auto),
    buttons,
  );

  const notDragging = (s: SliderHandle): boolean => document.activeElement !== s.input;

  function refresh(): void {
    const v = q.budgetView();
    const s = deps.host.state;
    replace(header, h('b', { text: t('ui.budget.year', { year: deps.host.q.economy.year() }) }), h('span', { text: ` · ${monthYear(deps.strings, s.clock)} · ${t('ui.funds')} ${money(v.funds)}` }));
    if (notDragging(taxSlider)) taxSlider.setValue(v.taxRate.r);
    taxDetail.textContent = `${t('ui.tax.r')} ${pct(v.taxRate.r)} · ${t('ui.tax.c')} ${pct(v.taxRate.c)} · ${t('ui.tax.i')} ${pct(v.taxRate.i)}`;
    for (let line = 0; line < BUDGET_LINE_COUNT; line++) { const sl = fundingSliders[line]!; if (notDragging(sl)) sl.setValue(v.funding[line] ?? 0); }
    // 账目：rows 按签名含正负（收入正 / 支出负，spec §2.10 "债券显示为负数"），净额 = Σ
    let ytd = 0, est = 0;
    const rows = v.rows.map((r) => { ytd += r.ytd; est += r.estimate; return [t(r.key), money(r.ytd), money(r.estimate)] as const; });
    rows.push([t('ui.budget.net'), money(ytd), money(est)]);
    replace(ledger, table([t('ui.budget.item'), t('ui.budget.ytd'), t('ui.budget.estimate')], rows, { testid: 'budget-table' }));
    replace(summary,
      field(t('ui.budget.openingFunds'), h('span', { text: money(v.openingFunds), testid: 'budget-opening' })),
      field(t('ui.budget.currentFunds'), h('span', { text: money(v.funds), testid: 'budget-funds' })),
      field(t('ui.budget.endOfYearFunds'), h('span', { text: money(v.endOfYearFunds), testid: 'budget-eoy' })));
    replace(advisors, ...v.advisors.map((a) => h('li', {}, h('b', { text: `${t(`advisor.${a.advisor}`)}: ` }), t(a.key))));
    auto.input.checked = v.autoBudget;
  }
  refresh();
  return { el, refresh };
}

export const budgetWindow: WindowFactory = (deps) => {
  const b = buildBudget(deps);
  return { id: 'budget', title: deps.strings.t('window.budget'), el: b.el, width: 440, refresh: b.refresh };
};

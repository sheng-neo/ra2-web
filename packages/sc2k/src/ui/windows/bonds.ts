// ===== ui/windows/bonds.ts =====（WP12b：债券窗口，spec:economy-budget §2.6 / §2.10）
// 列表（发行年月 / 利率 / 年息）+ 当前数 / 平均利率 / 利率之和 / 下一张利率 / 评级 / 城市价值 + 发行 / 偿还按钮；数据 q.economy.bondView()（纯函数）。
import type { WindowFactory } from '../windowTypes';
import { money } from './format';
import { bindText } from './text';
import { btn, field, h, replace, table } from './wdom';

export const bondsWindow: WindowFactory = (deps) => {
  const t = bindText(deps.strings);
  const q = deps.host.q.economy;
  const list = h('div', { cls: 'sc2k-win-ledger', testid: 'bonds-list' });
  const summary = h('div', { cls: 'sc2k-win-summary', testid: 'bonds-summary' });
  const issue = btn(t('ui.bonds.issue'), () => { deps.dispatch({ type: 'issueBond' }); refresh(); }, { testid: 'bonds-issue' });
  const repay = btn(t('ui.bonds.repay'), () => { deps.dispatch({ type: 'repayBond' }); refresh(); }, { testid: 'bonds-repay' });
  const el = h('div', { cls: 'sc2k-win-body sc2k-win-bonds' }, list, summary, h('div', { cls: 'sc2k-win-buttons' }, issue, repay));

  function refresh(): void {
    const v = q.bondView();
    if (v.bonds.length === 0) replace(list, h('div', { cls: 'sc2k-win-muted', text: t('ui.bonds.none') }));
    else replace(list, table(
      ['#', t('ui.bonds.issued'), t('ui.bonds.rate'), t('ui.bonds.annual')],
      v.bonds.map((b, k) => [String(k + 1), `${t(`month.${Math.max(0, Math.min(11, b.issuedMonth))}`)} ${b.issuedYear}`, `${b.ratePctFloor}%`, money(b.annual)]),
      { testid: 'bonds-table' }));
    replace(summary,
      field(t('ui.bonds.count'), h('span', { text: String(v.count), testid: 'bonds-count' })),
      field(t('ui.bonds.avg'), h('span', { text: `${v.avgRatePctFloor}%` })),
      field(t('ui.bonds.sum'), h('span', { text: `${v.sumRatePctFloor}%` })),
      field(t('ui.bonds.next'), h('span', { text: v.nextRatePctFloor === null ? '—' : `${v.nextRatePctFloor}%`, testid: 'bonds-next' })),
      field(t('ui.bonds.rating'), h('span', { text: v.rating || '—', testid: 'bonds-rating' })),
      field(t('ui.bonds.cityValue'), h('span', { text: money(v.cityValueDollars) })));
    issue.disabled = !v.canIssue;
    repay.disabled = !v.canRepay;
  }
  refresh();
  return { id: 'bonds', title: t('window.bonds'), el, width: 400, refresh };
};

// ===== ui/windows/ordinances.ts =====（WP12b：法令窗口，spec:economy-budget §2.5 / §2.10；WORKPLAN：20 复选框按 5 组，勾选派发 setOrdinance；YTD / 估计列 v2）
import type { OrdinanceGroup } from '../../contracts/catalogue';
import type { WindowFactory } from '../windowTypes';
import { bindText } from './text';
import { checkbox, group, h } from './wdom';

/** 五组顺序（spec:economy §2.5 的分栏顺序）。 */
export const ORDINANCE_GROUPS: readonly OrdinanceGroup[] = ['finance', 'educationSafety', 'environment', 'healthSafety', 'promotional'];

export const ordinancesWindow: WindowFactory = (deps) => {
  const t = bindText(deps.strings);
  const defs = deps.host.catalogue.ORDINANCES;
  const q = deps.host.q.economy;
  const boxes: Array<{ id: number; availableYear: number; box: ReturnType<typeof checkbox> }> = [];

  const groups = ORDINANCE_GROUPS.map((g) => group(t(`ordinanceGroup.${g}`), ...defs.filter((d) => d.group === g).map((d) => {
    const box = checkbox(t(`ordinance.${d.key}`), q.ordinance(d.id), (on) => {
      const r = deps.dispatch({ type: 'setOrdinance', id: d.id, on });
      if (!r.ok) refresh();                       // 被拒（资金 / 未实现）→ 回弹到真源
    }, { testid: `ordinance-${d.key}` });
    boxes.push({ id: d.id, availableYear: d.availableYear, box });
    return box;
  })));
  const footer = h('div', { cls: 'sc2k-win-note', testid: 'ordinances-footer' });
  const el = h('div', { cls: 'sc2k-win-body sc2k-win-ordinances' }, h('div', { cls: 'sc2k-win-columns' }, ...groups), footer);

  function refresh(): void {
    const year = q.year();
    let n = 0;
    for (const b of boxes) {
      const on = q.ordinance(b.id);
      if (on) n++;
      b.box.input.checked = on;
      const locked = b.availableYear > 0 && year < b.availableYear;
      b.box.input.disabled = locked;
      b.box.title = locked ? t('ui.ordinances.availableFrom', { year: b.availableYear }) : '';
    }
    footer.textContent = t('ui.ordinances.enacted', { value: n, total: defs.length });
  }
  refresh();
  return { id: 'ordinances', title: t('window.ordinances'), el, width: 520, refresh };
};

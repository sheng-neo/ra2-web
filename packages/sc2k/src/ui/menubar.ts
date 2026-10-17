// ===== ui/menubar.ts =====（spec:ui-art §2.2 菜单栏）
// File / Speed / Options / Disasters（DISASTER_MENU 8 项 + No Disasters；V1_DISASTERS 之外灰掉）/ Windows / Newspaper / Help。
// 菜单项在每次打开时重建，勾选 / 单选状态直接读 host.state（UI 不维护第二份真源；音效 / 音乐 / 工具栏显隐由外壳本地持有）。
import type { SimHost } from '../contracts/host';
import type { Strings } from '../contracts/strings';
import type { WindowId } from '../contracts/shell';
import type { Speed } from '../contracts/state';
import { DISASTER_MENU, V1_DISASTERS } from '../contracts/grid';
import { h } from './dom';
import { tr } from './theme';

/** DisasterKind 数值 → strings 键后缀（contracts/grid.ts 枚举序；const enum 无运行时名表）。 */
export const DISASTER_KEYS: readonly string[] = ['none', 'fire', 'flood', 'riot', 'toxicSpill', 'airCrashLegacy', 'earthquake', 'tornado', 'monster', 'meltdown', 'microwave', 'volcano', 'firestorm', 'massRiots', 'massFloods', 'pollution', 'hurricane', 'helicopterCrash', 'planeCrash'];
export const disasterName = (strings: Strings, kind: number): string => strings.t(`disaster.${DISASTER_KEYS[kind] ?? 'none'}`);

export type OptionKey = 'autoBudget' | 'autoGoto' | 'noDisasters' | 'sound' | 'music' | 'paperDelivery' | 'extraPaper';
export interface MenuItemDef {
  label: string; kind?: 'action' | 'check' | 'radio' | 'sep';
  checked?: boolean; disabled?: boolean; hint?: string; testid?: string;
  onSelect?: () => void;
}
export interface MenuDef { id: string; title: string; items: () => MenuItemDef[] }
export interface MenuActions {
  newCity(): void; loadCity(): void; saveCity(): void; saveCityAs(): void; importAssets: (() => void) | null; exit(): void;
  setSpeed(s: Speed): void;
  setOption(key: OptionKey, value: boolean): void; optionState(): Readonly<Record<OptionKey, boolean>>;
  showToolbar(on: boolean): void; toolbarVisible(): boolean; resetToolbar(): void;
  requestDisaster(kind: number): void;
  openWindow(id: WindowId): void;
  helpTool(): void; about(): void;
}
const WINDOW_MENU: readonly WindowId[] = ['budget', 'map', 'graphs', 'population', 'industries', 'neighbors', 'ordinances', 'newspaper'];
const SPEEDS: readonly Speed[] = [1, 2, 3, 4, 5];

/** 外壳的七个菜单（spec:ui-art §2.2 表）。 */
export function buildShellMenus(host: SimHost, strings: Strings, a: MenuActions): MenuDef[] {
  const t = (k: string): string => strings.t(k);
  const sep: MenuItemDef = { label: '', kind: 'sep' };
  return [
    { id: 'file', title: t('menu.file'), items: () => [
      { label: t('menu.file.newCity'), onSelect: a.newCity, testid: 'menu-file-newCity' },
      { label: t('menu.file.loadCity'), onSelect: a.loadCity, testid: 'menu-file-loadCity' },
      { label: t('menu.file.loadScenario'), disabled: true },
      sep,
      { label: t('menu.file.saveCity'), hint: 'Ctrl+S', onSelect: a.saveCity, testid: 'menu-file-saveCity' },
      { label: t('menu.file.saveCityAs'), onSelect: a.saveCityAs, testid: 'menu-file-saveCityAs' },
      ...(a.importAssets ? [sep, { label: t('menu.file.importAssets'), onSelect: a.importAssets, testid: 'menu-file-importAssets' }] : []),
      sep,
      { label: t('menu.file.exit'), onSelect: a.exit, testid: 'menu-file-exit' },
    ] },
    { id: 'speed', title: t('menu.speed'), items: () => SPEEDS.map((s) => ({
      label: t(`speed.${s}`), kind: 'radio' as const, checked: host.state.clock.speed === s, hint: s === 1 ? 'Space' : String(s - 1),
      onSelect: () => a.setSpeed(s), testid: `menu-speed-${s}`,
    })) },
    { id: 'options', title: t('menu.options'), items: () => {
      const st = a.optionState();
      const check = (key: OptionKey, label: string): MenuItemDef => ({ label, kind: 'check', checked: st[key], onSelect: () => a.setOption(key, !st[key]), testid: `menu-options-${key}` });
      return [
        check('autoBudget', t('menu.options.autoBudget')), check('autoGoto', t('menu.options.autoGoto')),
        sep,
        check('sound', t('menu.options.sound')), check('music', t('menu.options.music')),
        sep,
        { label: t('menu.options.showToolbar'), kind: 'check', checked: a.toolbarVisible(), onSelect: () => a.showToolbar(!a.toolbarVisible()), testid: 'menu-options-showToolbar' },
        { label: t('menu.options.resetToolbar'), onSelect: a.resetToolbar },
      ];
    } },
    { id: 'disasters', title: t('menu.disasters'), items: () => [
      ...DISASTER_MENU.map((kind) => ({
        label: disasterName(strings, kind), disabled: !V1_DISASTERS.has(kind), onSelect: () => a.requestDisaster(kind), testid: `menu-disaster-${DISASTER_KEYS[kind]}`,
        hint: V1_DISASTERS.has(kind) ? undefined : tr(strings, 'reject.notImplemented'),
      })),
      sep,
      { label: t('menu.disasters.none'), kind: 'check', checked: host.state.disaster.noDisasters, onSelect: () => a.setOption('noDisasters', !host.state.disaster.noDisasters), testid: 'menu-disasters-none' },
    ] },
    { id: 'windows', title: t('menu.windows'), items: () => WINDOW_MENU.map((id) => ({ label: t(`window.${id}`), onSelect: () => a.openWindow(id), testid: `menu-window-${id}` })) },
    { id: 'newspaper', title: t('menu.newspaper'), items: () => {
      const st = a.optionState();
      return [
        { label: `${t('menu.newspaper.subscribe')} — ${tr(strings, 'news.paperName')}`, kind: 'radio', checked: st.paperDelivery, onSelect: () => a.setOption('paperDelivery', true), testid: 'menu-paper-subscribe' },
        { label: t('menu.newspaper.none'), kind: 'radio', checked: !st.paperDelivery, onSelect: () => a.setOption('paperDelivery', false), testid: 'menu-paper-none' },
        sep,
        { label: t('menu.newspaper.extra'), kind: 'check', checked: st.extraPaper, onSelect: () => a.setOption('extraPaper', !st.extraPaper), testid: 'menu-paper-extra' },
        sep,
        { label: t('window.newspaper'), onSelect: () => a.openWindow('newspaper'), testid: 'menu-paper-open' },
      ];
    } },
    { id: 'help', title: t('menu.help'), items: () => [
      { label: t('menu.help.tool'), onSelect: a.helpTool, testid: 'menu-help-tool' },
      { label: t('menu.help.about'), onSelect: a.about, testid: 'menu-help-about' },
    ] },
  ];
}

export interface MenuBarOptions { root: HTMLElement; menus: MenuDef[]; right?: () => string }
export interface MenuBar { el: HTMLElement; closeAll(): boolean; isOpen(): boolean; refresh(): void; destroy(): void }

export function createMenuBar(o: MenuBarOptions): MenuBar {
  const { root } = o;
  const el = h('div', { class: 'sc2k-menubar', dataset: { testid: 'menubar' } });
  const rightEl = h('span', { class: 'sc2k-menubar-right' });
  let openId: string | null = null;
  const menus = new Map<string, { root: HTMLElement; popup: HTMLElement; def: MenuDef }>();

  const render = (m: { popup: HTMLElement; def: MenuDef }): void => {
    m.popup.replaceChildren();
    for (const it of m.def.items()) {
      if (it.kind === 'sep') { m.popup.appendChild(h('div', { class: 'sc2k-menu-sep' })); continue; }
      const mark = it.kind === 'check' ? (it.checked ? '✓' : '') : it.kind === 'radio' ? (it.checked ? '●' : '') : '';
      const row = h('div', { class: `sc2k-menu-item${it.disabled ? ' disabled' : ''}`, dataset: it.testid ? { testid: it.testid } : undefined, attrs: { role: 'menuitem', 'aria-disabled': !!it.disabled, 'aria-checked': !!it.checked } },
        h('span', { class: 'mark', text: mark }), h('span', { text: it.label }), it.hint ? h('span', { class: 'hint', text: it.hint }) : null);
      if (!it.disabled) row.addEventListener('click', (e) => { e.stopPropagation(); closeAll(); it.onSelect?.(); });
      m.popup.appendChild(row);
    }
  };
  const open = (id: string): void => {
    const m = menus.get(id);
    if (!m) return;
    if (openId && openId !== id) menus.get(openId)?.root.classList.remove('open');
    openId = id;
    render(m);
    m.root.classList.add('open');
  };
  const closeAll = (): boolean => {
    if (!openId) return false;
    menus.get(openId)?.root.classList.remove('open');
    openId = null;
    return true;
  };
  for (const def of o.menus) {
    const popup = h('div', { class: 'sc2k-menu-popup sc2k-out', attrs: { role: 'menu' } });
    const title = h('div', { class: 'sc2k-menu-title', text: def.title, dataset: { testid: `menu-${def.id}` } });
    const mroot = h('div', { class: 'sc2k-menu' }, title, popup);
    title.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (openId === def.id) closeAll(); else open(def.id); });
    title.addEventListener('pointerenter', () => { if (openId && openId !== def.id) open(def.id); });
    menus.set(def.id, { root: mroot, popup, def });
    el.appendChild(mroot);
  }
  el.appendChild(rightEl);
  root.appendChild(el);
  const outside = (e: PointerEvent): void => { if (openId && !(e.target instanceof Node && el.contains(e.target))) closeAll(); };
  document.addEventListener('pointerdown', outside, true);
  const refresh = (): void => { const s = o.right?.() ?? ''; if (rightEl.textContent !== s) rightEl.textContent = s; if (openId) { const m = menus.get(openId); if (m) render(m); } };
  refresh();
  return {
    el, closeAll, isOpen: () => openId !== null, refresh,
    destroy() { document.removeEventListener('pointerdown', outside, true); el.remove(); },
  };
}
/** 便于测试：某菜单项当前是否勾选。 */
export const isChecked = (row: Element): boolean => row.getAttribute('aria-checked') === 'true';

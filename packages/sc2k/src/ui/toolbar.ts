// ===== ui/toolbar.ts =====（spec:ui-art §2.3 工具栏：两列按钮 + 子工具弹出条 + 显示开关 + RCI 指示器；ARCHITECTURE §7.6 v1 白名单）
// 浮动可拖动；按钮行序为本项目固定值（§2.3 表）。不在 V1_TOOL_IDS 的工具隐藏；q.placement.availability 为 false 的置灰并给出原因（UI 不自行判断）；
// 灾害模式下仅 Bulldozer / Emergency / Query / Signs / 视图可用。RCI 柱高 = |demand| / 2000 × 半幅（zones §2.8.7），数据只来自 state.demand。
import type { SimHost } from '../contracts/host';
import type { RendererApi } from '../contracts/rendererApi';
import type { Strings } from '../contracts/strings';
import type { ToolDef, ToolGroup, ToolId } from '../contracts/catalogue';
import type { Availability, Queries } from '../contracts/queries';
import type { WindowId } from '../contracts/shell';
import type { ViewState } from '../contracts/render';
import { CityMode } from '../contracts/grid';
import { rejectKey } from '../contracts/strings';
import { classIf, fmtMoney, h, readJson, writeJson } from './dom';
import { GROUP_COLOR, GROUP_GLYPH, glyph, swatch, tr } from './theme';
import { makeDraggable } from './windowManager';
import { DISASTER_MODE_GROUPS, HELP_TOOL } from './tools/modes';

type ViewBtn = 'rotCcw' | 'rotCw' | 'zoomOut' | 'zoomIn' | 'help';
type Cell = { kind: 'group'; group: ToolGroup } | { kind: 'view'; id: ViewBtn } | { kind: 'window'; id: WindowId } | null;
const G = (group: ToolGroup): Cell => ({ kind: 'group', group });
const V = (id: ViewBtn): Cell => ({ kind: 'view', id });
const W = (id: WindowId): Cell => ({ kind: 'window', id });
/** spec:ui-art §2.3 的 15 行 × 2 列（第 16 行开关、第 17 行 RCI 另排）。 */
export const TOOLBAR_ROWS: ReadonlyArray<readonly [Cell, Cell]> = [
  [G('bulldozer'), G('nature')], [G('dispatch'), G('roads')], [G('power'), G('water')], [G('rail'), G('ports')],
  [G('residential'), G('commercial')], [G('industrial'), G('education')], [G('services'), G('parks')], [G('signs'), G('query')],
  [G('rewards'), null], [V('rotCcw'), V('rotCw')], [V('zoomOut'), V('zoomIn')], [G('center'), V('help')],
  [W('map'), W('graphs')], [W('population'), W('industries')], [W('neighbors'), W('budget')],
];
const VIEW_GLYPH: Readonly<Record<ViewBtn, string>> = { rotCcw: '↺', rotCw: '↻', zoomOut: '−', zoomIn: '+', help: '?' };
const VIEW_LABEL: Readonly<Record<ViewBtn, string>> = { rotCcw: 'ui.rotateCcw', rotCw: 'ui.rotateCw', zoomOut: 'ui.zoomOut', zoomIn: 'ui.zoomIn', help: 'ui.help' };
const TOGGLES: ReadonlyArray<{ key: keyof ViewState['show'] | 'underground'; glyph: string; label: string }> = [
  { key: 'buildings', glyph: 'B', label: 'ui.showBuildings' }, { key: 'signs', glyph: 'S', label: 'ui.showSigns' }, { key: 'infrastructure', glyph: 'I', label: 'ui.showInfra' },
  { key: 'zones', glyph: 'Z', label: 'ui.showZones' }, { key: 'underground', glyph: 'U', label: 'ui.underground' },
];
export const RCI_HALF_PX = 20, RCI_FULL = 2000;
const POS_KEY = 'sc2k.toolbar.pos', VIS_KEY = 'sc2k.toolbar.visible';
const DEFAULT_POS = { x: 8, y: 32 };

export interface ToolbarOptions {
  root: HTMLElement; host: SimHost; strings: Strings; v1Tools: ReadonlySet<ToolId>; renderer: RendererApi;
  getTool(): ToolId | null; setTool(id: ToolId | null): void;
  openWindow(id: WindowId): void;
  zoomBy(delta: number): void; rotateBy(delta: number): void;
  toggleShow(key: keyof ViewState['show']): void; setUnderground(on: boolean): void;
  storage?: Storage | null;
}
export interface Toolbar {
  el: HTMLElement;
  refresh(): void;
  refreshAvailability(): void;
  closePopup(): boolean;
  isPopupOpen(): boolean;
  /** 组热键：选中该组上次的子工具（或第一个可用的）并切换子工具条。 */
  selectGroup(group: ToolGroup): void;
  /** Tab：同组内下一个可用子工具。 */
  nextSubtool(): void;
  setVisible(on: boolean): void; isVisible(): boolean; resetPosition(): void;
  availabilityOf(id: ToolId): Availability;
  destroy(): void;
}

export function createToolbar(o: ToolbarOptions): Toolbar {
  const { root, host, strings, v1Tools } = o;
  const cat = host.catalogue;
  const t = (k: string, args?: Record<string, string | number>): string => strings.t(k, args);
  const storage = o.storage ?? null;
  const avail = new Map<ToolId, Availability>();
  const lastSub = new Map<ToolGroup, ToolId>();
  const groupTools = new Map<ToolGroup, ToolDef[]>();
  for (const d of cat.TOOLS) { if (!v1Tools.has(d.id)) continue; const arr = groupTools.get(d.group) ?? []; arr.push(d); groupTools.set(d.group, arr); }
  const groupBtns = new Map<ToolGroup, HTMLButtonElement>();
  const toggleBtns: HTMLButtonElement[] = [];
  let popupGroup: ToolGroup | null = null;
  let visible = readJson<boolean>(storage, VIS_KEY) ?? true;

  // ---- 可用性（UI 不自行判断；只读 availability + v1 白名单 + 模式） ----
  const modeAllows = (d: ToolDef): boolean => {
    const mode = host.state.clock.mode;
    if (mode === CityMode.Disaster) return DISASTER_MODE_GROUPS.has(d.group);
    if (mode === CityMode.TerrainEdit) return d.availableIn !== 'city';
    return d.availableIn !== 'map';
  };
  const availabilityOf = (id: ToolId): Availability => {
    const d = cat.toolById(id);
    if (!d || !v1Tools.has(id)) return { enabled: false, reason: 'notImplemented' };
    if (!modeAllows(d)) return { enabled: false, reason: 'mode' };
    return avail.get(id) ?? { enabled: true };
  };
  const reasonText = (a: Availability): string => (a.enabled || !a.reason ? '' : t(rejectKey(a.reason)));
  function refreshAvailability(): void {
    const q: Queries = host.q;
    for (const d of cat.TOOLS) {
      if (!v1Tools.has(d.id)) continue;
      let a: Availability;
      try { a = q.placement.availability(d.id); } catch { a = { enabled: true }; }
      avail.set(d.id, a);
    }
    refresh();
  }
  const enabledTools = (group: ToolGroup): ToolDef[] => (groupTools.get(group) ?? []).filter((d) => availabilityOf(d.id).enabled);
  const pickForGroup = (group: ToolGroup): ToolId | null => {
    const last = lastSub.get(group);
    if (last && availabilityOf(last).enabled) return last;
    return enabledTools(group)[0]?.id ?? (groupTools.get(group)?.[0]?.id ?? null);
  };

  // ---- DOM ----
  const grip = h('div', { class: 'sc2k-toolbar-grip', title: tr(strings, 'menu.options.showToolbar') });
  const grid = h('div', { class: 'sc2k-toolgrid' });
  const el = h('div', { class: 'sc2k-toolbar sc2k-out', dataset: { testid: 'toolbar' } }, grip, grid);
  const popup = h('div', { class: 'sc2k-subtools sc2k-out', dataset: { testid: 'subtools' } });
  popup.style.display = 'none';

  const groupButton = (group: ToolGroup): HTMLButtonElement => {
    const label = t(`group.${group}`);
    const btn = h('button', { class: 'sc2k-btn sc2k-toolbtn', type: 'button', title: label, dataset: { group, testid: `tool-group-${group}` } },
      glyph(GROUP_GLYPH[group], undefined, /^[^A-Za-z]$/.test(GROUP_GLYPH[group])), h('span', { class: 'dot', style: { background: GROUP_COLOR[group] } }), h('span', { class: 'badge' }));
    btn.addEventListener('click', (e) => { e.stopPropagation(); onGroupClick(group); });
    groupBtns.set(group, btn);
    return btn;
  };
  const viewButton = (id: ViewBtn): HTMLButtonElement => h('button', {
    class: 'sc2k-btn sc2k-toolbtn', type: 'button', title: tr(strings, VIEW_LABEL[id]), dataset: { view: id, testid: `tool-view-${id}` },
    on: { click: () => {
      closePopup();
      switch (id) {
        case 'rotCcw': o.rotateBy(1); break; case 'rotCw': o.rotateBy(-1); break;
        case 'zoomOut': o.zoomBy(-1); break; case 'zoomIn': o.zoomBy(1); break;
        case 'help': o.setTool(o.getTool() === HELP_TOOL ? null : HELP_TOOL); break;
      }
      refresh();
    } },
  }, glyph(VIEW_GLYPH[id], undefined, true));
  const windowButton = (id: WindowId): HTMLButtonElement => {
    const label = t(`window.${id}`);
    return h('button', { class: 'sc2k-btn sc2k-toolbtn', type: 'button', title: label, dataset: { win: id, testid: `tool-window-${id}` }, on: { click: () => { closePopup(); o.openWindow(id); } } },
      glyph(/[㐀-鿿]/.test(label) ? label.slice(0, 1) : label.slice(0, 2)));
  };
  for (const [a, b] of TOOLBAR_ROWS) {
    for (const cell of [a, b]) {
      if (!cell) { grid.appendChild(h('button', { class: 'sc2k-btn sc2k-toolbtn empty', type: 'button', attrs: { tabindex: -1 } })); continue; }
      if (cell.kind === 'group') {
        // 组内没有任何 v1 工具 → 整个按钮隐藏（占位保持两列对齐）
        if ((groupTools.get(cell.group) ?? []).length === 0) { grid.appendChild(h('button', { class: 'sc2k-btn sc2k-toolbtn empty', type: 'button', attrs: { tabindex: -1 }, dataset: { group: cell.group } })); continue; }
        grid.appendChild(groupButton(cell.group));
      } else if (cell.kind === 'view') grid.appendChild(viewButton(cell.id));
      else grid.appendChild(windowButton(cell.id));
    }
  }
  // 第 16 行：显示开关
  const toggles = h('div', { class: 'sc2k-toggles' });
  for (const tg of TOGGLES) {
    const btn = h('button', { class: 'sc2k-btn sc2k-toggle', type: 'button', title: tr(strings, tg.label), text: tg.glyph, dataset: { toggle: tg.key, testid: `tool-toggle-${tg.key}` },
      on: { click: () => { if (tg.key === 'underground') o.setUnderground(!o.renderer.getView().underground); else o.toggleShow(tg.key); refresh(); } } });
    toggleBtns.push(btn);
    toggles.appendChild(btn);
  }
  el.appendChild(toggles);
  // 第 17 行：RCI 指示器
  const bars = { r: h('div', { class: 'sc2k-rci-bar r' }), c: h('div', { class: 'sc2k-rci-bar c' }), i: h('div', { class: 'sc2k-rci-bar i' }) };
  const rci = h('div', { class: 'sc2k-rci sc2k-in', dataset: { testid: 'rci' }, on: { click: () => o.openWindow('industries') } },
    h('div', { class: 'sc2k-rci-col' }, bars.r, h('span', { class: 'sc2k-rci-label', text: 'R' })),
    h('div', { class: 'sc2k-rci-col' }, bars.c, h('span', { class: 'sc2k-rci-label', text: 'C' })),
    h('div', { class: 'sc2k-rci-col' }, bars.i, h('span', { class: 'sc2k-rci-label', text: 'I' })));
  el.appendChild(rci);
  root.appendChild(el);
  root.appendChild(popup);

  // ---- 位置 / 显隐 ----
  const place = (p: { x: number; y: number }): void => { el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; };
  place(readJson<{ x: number; y: number }>(storage, POS_KEY) ?? DEFAULT_POS);
  const undrag = makeDraggable(grip, el, root, (x, y) => { writeJson(storage, POS_KEY, { x, y }); positionPopup(); });
  const setVisible = (on: boolean): void => { visible = on; classIf(el, 'hidden', !on); if (!on) closePopup(); writeJson(storage, VIS_KEY, on); };
  setVisible(visible);

  // ---- 子工具条 ----
  function positionPopup(): void {
    if (!popupGroup) return;
    const btn = groupBtns.get(popupGroup);
    if (!btn) return;
    const right = el.offsetLeft + el.offsetWidth + 2;
    const top = el.offsetTop + btn.offsetTop + 2;
    popup.style.top = `${Math.max(0, Math.min(top, Math.max(0, root.clientHeight - popup.offsetHeight - 4)))}px`;
    const fitsRight = right + popup.offsetWidth <= (root.clientWidth || Infinity);
    popup.style.left = `${fitsRight ? right : Math.max(0, el.offsetLeft - popup.offsetWidth - 2)}px`;
  }
  function renderPopup(): void {
    popup.replaceChildren();
    if (!popupGroup) return;
    const cur = o.getTool();
    for (const d of groupTools.get(popupGroup) ?? []) {
      const a = availabilityOf(d.id);
      const cost = host.q.economy.costOf(d.id, 1);
      const row = h('div', { class: `sc2k-subtool${a.enabled ? '' : ' disabled'}${cur === d.id ? ' active' : ''}`, title: a.enabled ? '' : reasonText(a), dataset: { tool: d.id, testid: `subtool-${d.id}` }, attrs: { 'aria-disabled': !a.enabled } },
        swatch(GROUP_COLOR[d.group]), h('span', { text: t(d.label) }), h('span', { class: 'cost', text: cost > 0 ? fmtMoney(cost) : '' }));
      if (a.enabled) row.addEventListener('click', (e) => { e.stopPropagation(); lastSub.set(d.group, d.id); o.setTool(d.id); closePopup(); refresh(); });
      popup.appendChild(row);
    }
  }
  const openPopup = (group: ToolGroup): void => { popupGroup = group; renderPopup(); popup.style.display = ''; positionPopup(); };
  const closePopup = (): boolean => { if (!popupGroup) return false; popupGroup = null; popup.style.display = 'none'; return true; };
  function onGroupClick(group: ToolGroup): void {
    const tools = groupTools.get(group) ?? [];
    const id = pickForGroup(group);
    if (id && availabilityOf(id).enabled) { lastSub.set(group, id); o.setTool(id); }
    if (tools.length <= 1) { closePopup(); refresh(); return; }
    if (popupGroup === group) closePopup(); else openPopup(group);
    refresh();
  }
  const outside = (e: PointerEvent): void => { if (popupGroup && e.target instanceof Node && !popup.contains(e.target) && !el.contains(e.target)) closePopup(); };
  document.addEventListener('pointerdown', outside, true);

  // ---- 刷新 ----
  function refresh(): void {
    const cur = o.getTool();
    const curDef = cur ? cat.toolById(cur) : undefined;
    for (const [group, btn] of groupBtns) {
      const enabled = enabledTools(group).length > 0;
      btn.disabled = !enabled;
      classIf(btn, 'disabled', !enabled);
      classIf(btn, 'active', curDef?.group === group);
      const badge = btn.querySelector('.badge');
      const sub = lastSub.get(group) ?? (curDef?.group === group ? cur : null);
      const tools = groupTools.get(group) ?? [];
      if (badge) { const k = sub ? tools.findIndex((d) => d.id === sub) : -1; badge.textContent = tools.length > 1 && k >= 0 ? String(k + 1) : ''; }
      const reason = enabled ? '' : (tools.map((d) => reasonText(availabilityOf(d.id))).find((s) => s) ?? '');
      btn.title = reason ? `${t(`group.${group}`)} — ${reason}` : t(`group.${group}`);
    }
    const helpBtn = grid.querySelector('[data-view="help"]');
    if (helpBtn) classIf(helpBtn, 'active', cur === HELP_TOOL);
    const v = o.renderer.getView();
    for (const btn of toggleBtns) { const key = btn.dataset['toggle'] as keyof ViewState['show'] | 'underground'; classIf(btn, 'active', key === 'underground' ? v.underground : v.show[key]); }
    const d = host.state.demand;
    const setBar = (bar: HTMLElement, val: number): void => {
      const hgt = Math.min(RCI_HALF_PX, Math.round(Math.abs(val) / RCI_FULL * RCI_HALF_PX));
      bar.style.height = `${hgt}px`;
      if (val >= 0) { bar.style.top = `${RCI_HALF_PX + 2 - hgt}px`; bar.style.bottom = ''; } else { bar.style.top = `${RCI_HALF_PX + 2}px`; bar.style.bottom = ''; }
    };
    setBar(bars.r, d.r); setBar(bars.c, d.c); setBar(bars.i, d.i);
    rci.title = `${t('ui.rci.r')} ${d.r} · ${t('ui.rci.c')} ${d.c} · ${t('ui.rci.i')} ${d.i}`;
    if (popupGroup) renderPopup();
  }
  refreshAvailability();

  return {
    el, refresh, refreshAvailability, closePopup, isPopupOpen: () => popupGroup !== null,
    selectGroup(group) { if (!groupBtns.has(group)) return; onGroupClick(group); },
    nextSubtool() {
      const cur = o.getTool(); const d = cur ? cat.toolById(cur) : undefined;
      if (!d) return;
      const list = enabledTools(d.group);
      if (list.length <= 1) return;
      const k = list.findIndex((x) => x.id === d.id);
      const next = list[(k + 1) % list.length]!;
      lastSub.set(d.group, next.id); o.setTool(next.id); refresh();
    },
    setVisible, isVisible: () => visible,
    resetPosition() { place(DEFAULT_POS); writeJson(storage, POS_KEY, DEFAULT_POS); setVisible(true); positionPopup(); },
    availabilityOf,
    destroy() { undrag(); document.removeEventListener('pointerdown', outside, true); popup.remove(); el.remove(); },
  };
}

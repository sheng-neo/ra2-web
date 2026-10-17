// ===== ui/index.ts =====（CONTRACTS §V UiEntry：mountShell(ShellOptions): ShellHandle；ARCHITECTURE §7）
// 外壳装配：菜单栏 / 城市视图容器 / 浮动工具栏 / 窗口层 / 状态栏 / 模态层 + ToolController + EventBus 订阅 + 统一派发（音效 / 状态栏 / 命令结果型模态）。
// app 侧通过 shellControlsOf(handle) 取得外壳内部句柄（EventBus、tick、文件动作挂点）——ShellOptions / ShellHandle 契约不变，wire.ts 不动。
import type { UiEntry, ShellHandle, ShellOptions, WindowId } from '../contracts/shell';
import type { EventBus, SimEvent } from '../contracts/events';
import type { Command, CommandResult, ModalId } from '../contracts/commands';
import type { SoundId } from '../contracts/audio';
import type { ToolId } from '../contracts/catalogue';
import { TECH_SLOT_KEYS } from '../contracts/catalogue';
import { rejectKey } from '../contracts/strings';
import { WINDOW_FACTORIES, MODAL_FACTORIES } from './windows';
import type { WindowDeps } from './windowTypes';
import { fmtMoney, h, localStorageOrNull } from './dom';
import { SHELL_CLASS, tr } from './theme';
import { buildShellMenus, createMenuBar, disasterName } from './menubar';
import type { MenuActions, MenuBar, OptionKey } from './menubar';
import { createToolbar } from './toolbar';
import type { Toolbar } from './toolbar';
import { createStatusBar } from './statusbar';
import type { StatusBar } from './statusbar';
import { createWindowManager } from './windowManager';
import type { WindowManager } from './windowManager';
import { createModalHost } from './modalHost';
import type { ModalHost } from './modalHost';
import { createToolController } from './tools/toolController';
import type { StatusMessage, ToolController } from './tools/toolController';
import { HELP_TOOL } from './tools/modes';

export { HELP_TOOL } from './tools/modes';
export { PHASE_MODALS, RESULT_MODALS } from './modalHost';
export type { ShellHandle, ShellOptions, WindowId };

/** 外壳请求返回标题页时在 root 上派发的事件（boot 监听）。 */
export const SHOW_TITLE_EVENT = 'sc2k:showTitle';
/** 状态栏 / 工具栏的节流刷新间隔。 */
export const UI_REFRESH_MS = 100, AVAILABILITY_REFRESH_MS = 1000;

/** 最小 EventBus（contracts/events.ts 接口）：按 type 扇出；监听器异常不影响其他监听器。 */
export function createEventBus(): EventBus {
  const subs = new Map<string, Set<(e: SimEvent) => void>>();
  return {
    on(type, fn) {
      let set = subs.get(type);
      if (!set) { set = new Set(); subs.set(type, set); }
      const f = fn as unknown as (e: SimEvent) => void;
      set.add(f);
      return () => { set!.delete(f); };
    },
    publish(e) {
      const set = subs.get(e.type);
      if (!set) return;
      for (const fn of [...set]) { try { fn(e); } catch (err) { console.error('[sc2k] event handler failed', e.type, err); } }
    },
  };
}

/** app 侧挂入的文件动作（session）；未挂入时 newCity → 标题页，其余提示未实现。 */
export interface FileActions { newCity(): void; loadCity(): void; saveCity(): void; saveCityAs(): void; exit(): void }
export interface ShellControls {
  readonly bus: EventBus;
  readonly viewEl: HTMLElement;
  readonly controller: ToolController;
  readonly windows: WindowManager;
  readonly modals: ModalHost;
  readonly toolbar: Toolbar;
  readonly statusBar: StatusBar;
  readonly menuBar: MenuBar;
  /** 统一派发（音效 / 状态栏 / 命令结果型模态）。 */
  dispatch(cmd: Command): CommandResult;
  /** 主循环每帧调用（内部节流）。 */
  tick(dtMs: number): void;
  refreshAll(): void;
  message(text: string, level?: StatusMessage['level']): void;
  fileActions: Partial<FileActions>;
  version: string;
}
const CONTROLS = new WeakMap<ShellHandle, ShellControls>();
export function shellControlsOf(handle: ShellHandle): ShellControls {
  const c = CONTROLS.get(handle);
  if (!c) throw new Error('shellControlsOf: 该句柄不是 mountShell 创建的');
  return c;
}

/** 命令 → 成功音效。 */
const SOUND_OF: Partial<Record<Command['type'], SoundId>> = {
  bulldoze: 'bulldoze', dezone: 'bulldoze', zoneRect: 'zone', placeBuilding: 'place', network: 'place', terrainTool: 'place', tunnel: 'place',
  issueBond: 'cash', repayBond: 'cash', setTax: 'click', setFunding: 'click', setOrdinance: 'click', setSpeed: 'click', requestDisaster: 'siren', dispatch: 'siren', sign: 'click',
};

export const mountShell = ((opts: ShellOptions): ShellHandle => {
  const { root, host, renderer, strings, audio } = opts;
  const t = (k: string, args?: Record<string, string | number>): string => strings.t(k, args);
  const storage = localStorageOrNull();
  root.classList.add(SHELL_CLASS);
  const bus = createEventBus();
  const offs: Array<() => void> = [];

  // ---- 视图容器：boot 已创建并 attach 渲染器的 .sc2k-view 直接采用，否则自建 ----
  let viewEl = root.querySelector<HTMLElement>(':scope > .sc2k-view');
  if (!viewEl) { viewEl = h('div', { class: 'sc2k-view', dataset: { testid: 'view' } }); root.appendChild(viewEl); }
  viewEl.classList.add('sc2k-view');
  const windowLayer = h('div', { class: 'sc2k-windows', dataset: { testid: 'windows' } });
  const modalLayer = h('div', { class: 'sc2k-modals', dataset: { testid: 'modals' } });
  root.append(windowLayer, modalLayer);

  // ---- 本地 UI 选项（契约无 state 落点的：音效 / 音乐 / 工具栏显隐） ----
  let soundOn = true, musicOn = true;
  audio.setEnabled(soundOn, musicOn);
  const optionState = (): Readonly<Record<OptionKey, boolean>> => {
    const s = host.state;
    const miscFlag = (off: number): boolean => (s.rawMisc[off >> 2] ?? 0) !== 0;
    return {
      autoBudget: s.economy.autoBudget, autoGoto: s.disaster.autoGoto, noDisasters: s.disaster.noDisasters, sound: soundOn, music: musicOn,
      paperDelivery: miscFlag(0x1004), extraPaper: miscFlag(0x1008),    // 报纸选项在 state 无专属字段：读 rawMisc（events 的 setOption 落点），缺省 0
    };
  };

  // ---- 组件 ----
  const statusBar = createStatusBar({ root, host, renderer, strings });
  const message = (text: string, level: StatusMessage['level'] = 'alert'): void => statusBar.setMessage({ text, level });
  const tilePickListeners = new Set<(x: number, y: number) => void>();
  let lastPick: { x: number; y: number } | null = null;
  let availDirty = false;

  const dispatch = (cmd: Command): CommandResult => {
    const r = host.dispatch(cmd);
    if (r.ok) {
      const snd = SOUND_OF[cmd.type];
      if (snd) audio.play(snd);
      if (r.cost > 0) statusBar.setMessage({ text: t('ui.status.cost', { value: fmtMoney(r.cost) }), level: 'alert', ttlMs: 1500 });
    } else if (r.reason && r.reason !== 'cancelled') {
      statusBar.setMessage({ text: t('ui.status.rejected', { reason: t(rejectKey(r.reason)) }), level: 'reject' });
      audio.play('reject');
      if (r.reason === 'funds') statusBar.flashFunds();
    }
    if (r.modal) openResultModal(r.modal, cmd);
    availDirty = true;
    return r;
  };
  const deps: WindowDeps = {
    host, renderer, strings, audio, saves: opts.saves, v1Tools: opts.v1Tools, importer: opts.importer ?? null,
    dispatch,
    openWindow: (id) => windows.open(id),
    closeWindow: (id) => windows.close(id),
    onTilePicked: (fn) => { tilePickListeners.add(fn); if (lastPick) fn(lastPick.x, lastPick.y); return () => { tilePickListeners.delete(fn); }; },
  };
  const windows: WindowManager = createWindowManager({ layer: windowLayer, deps, strings, factories: WINDOW_FACTORIES, storage, origin: { x: 100, y: 16 } });
  const modals: ModalHost = createModalHost({ layer: modalLayer, host, strings, deps, factories: MODAL_FACTORIES, onChange: () => audio.play('click') });
  /** 命令结果型模态：bridgeType → 带 bridge 重发；neighborConnect → neighborConnection；teamPick → modalAnswer。 */
  function openResultModal(modal: { id: ModalId; payload: unknown }, cmd: Command): void {
    const p = (modal.payload ?? {}) as Record<string, unknown>;
    modals.openFromResult(modal, (answer) => {
      switch (modal.id) {
        case 'bridgeType': {
          if (answer < 0 || cmd.type !== 'network') return;
          const opts2 = Array.isArray(p['options']) ? (p['options'] as number[]) : [];
          const bridge = opts2[answer] ?? opts2[0];
          if (bridge !== undefined) dispatch({ ...cmd, bridge });
          return;
        }
        case 'neighborConnect': {
          const at = typeof p['at'] === 'number' ? (p['at'] as number) : cmd.type === 'network' ? cmd.to : -1;
          if (at >= 0) dispatch({ type: 'neighborConnection', at, accept: answer === 1 });
          return;
        }
        case 'teamPick': dispatch({ type: 'modalAnswer', dialog: 'teamPick', answer: Math.max(0, answer) }); return;
        default: return;
      }
    });
  }

  const controller = createToolController({
    host, renderer, strings, target: viewEl, dispatch,
    onMessage: (m) => statusBar.setMessage(m),
    onTilePicked: (x, y) => { lastPick = { x, y }; for (const fn of [...tilePickListeners]) fn(x, y); },
    openWindow: (id) => windows.open(id),
    onToolChanged: () => { toolbar.refresh(); audio.play('click'); },
    onEscape: () => toolbar.closePopup() || windows.closeTop(),
    onGroupKey: (g) => toolbar.selectGroup(g),
    onNextSubtool: () => toolbar.nextSubtool(),
    onSave: () => (controls.fileActions.saveCity ?? notImplemented)(),
    onViewChanged: () => toolbar.refresh(),
  });
  const toolbar: Toolbar = createToolbar({
    root, host, strings, v1Tools: opts.v1Tools, renderer, storage,
    getTool: () => controller.getTool(), setTool: (id) => controller.setTool(id),
    openWindow: (id) => windows.open(id),
    zoomBy: (d) => controller.zoomBy(d), rotateBy: (d) => controller.rotateBy(d),
    toggleShow: (k) => controller.toggleShow(k), setUnderground: (on) => controller.setUnderground(on),
  });
  const notImplemented = (): void => message(t(rejectKey('notImplemented')), 'reject');
  const showTitle = (): void => { root.dispatchEvent(new CustomEvent(SHOW_TITLE_EVENT)); };
  const setOption = (key: OptionKey, value: boolean): void => {
    if (key === 'sound' || key === 'music') { if (key === 'sound') soundOn = value; else musicOn = value; audio.setEnabled(soundOn, musicOn); return; }
    host.dispatch({ type: 'setOption', key, value });       // economy 归属；桩期返回 notImplemented 时静默
  };
  const about = (): void => {
    modals.openCustom('about', {
      title: tr(strings, 'menu.help.about'),
      el: h('div', {}, h('div', { text: `sc2k ${controls.version}` }), h('div', { text: tr(strings, 'ui.title.tagline') }),
        h('div', { class: 'sc2k-modal-actions' }, h('button', { class: 'sc2k-btn', type: 'button', text: tr(strings, 'ui.ok'), on: { click: () => modals.closeTop(0) } }))),
    });
  };
  const importAssets = (): void => {
    const importer = opts.importer;
    if (!importer) return;
    if (MODAL_FACTORIES.importAssets) { modals.openUi('importAssets', null); return; }
    const el = h('div', { dataset: { testid: 'import-assets' } });
    importer.mount(el);
    modals.openCustom('importAssets', { title: tr(strings, 'modal.importAssets'), el, destroy: () => importer.unmount() });
  };
  const menuActions: MenuActions = {
    newCity: () => (controls.fileActions.newCity ?? showTitle)(),
    loadCity: () => (controls.fileActions.loadCity ?? notImplemented)(),
    saveCity: () => (controls.fileActions.saveCity ?? notImplemented)(),
    saveCityAs: () => (controls.fileActions.saveCityAs ?? notImplemented)(),
    importAssets: opts.importer ? importAssets : null,
    exit: () => (controls.fileActions.exit ?? showTitle)(),
    setSpeed: (s) => { dispatch({ type: 'setSpeed', speed: s }); statusBar.refresh(); },
    setOption, optionState,
    showToolbar: (on) => toolbar.setVisible(on), toolbarVisible: () => toolbar.isVisible(), resetToolbar: () => toolbar.resetPosition(),
    requestDisaster: (kind) => { dispatch({ type: 'requestDisaster', kind }); },
    openWindow: (id) => windows.open(id),
    helpTool: () => controller.setTool(controller.getTool() === HELP_TOOL ? null : HELP_TOOL),
    about,
  };
  const menuBar = createMenuBar({ root, menus: buildShellMenus(host, strings, menuActions), right: () => host.state.cityName });

  // ---- 帮助模式：点击任意带 title 的 UI 元素 → 气泡 ----
  let bubble: HTMLElement | null = null;
  let bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  const showBubble = (text: string, x: number, y: number): void => {
    bubble?.remove();
    bubble = h('div', { class: 'sc2k-help-bubble', text, dataset: { testid: 'help-bubble' } });
    bubble.style.left = `${Math.min(x, Math.max(0, root.clientWidth - 270))}px`; bubble.style.top = `${y + 12}px`;
    root.appendChild(bubble);
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble?.remove(); bubble = null; }, 3000);
  };
  const helpClick = (e: MouseEvent): void => {
    if (controller.getTool() !== HELP_TOOL || !(e.target instanceof HTMLElement) || viewEl.contains(e.target) || menuBar.el.contains(e.target)) return;
    const titled = e.target.closest<HTMLElement>('[title]');
    if (!titled || !titled.title) return;
    e.preventDefault(); e.stopPropagation();
    const r = root.getBoundingClientRect();
    showBubble(titled.title, e.clientX - r.left, e.clientY - r.top);
  };
  root.addEventListener('click', helpClick, true);

  // ---- 键盘：模态 > 菜单 > 工具控制器 ----
  const onKey = (e: KeyboardEvent): void => {
    if (modals.depth() > 0) { if (e.key === 'Escape') { modals.closeTop(0); e.preventDefault(); } return; }
    if (e.key === 'Escape' && menuBar.closeAll()) { e.preventDefault(); return; }
    controller.handleKey(e);
  };
  window.addEventListener('keydown', onKey);

  // ---- EventBus 订阅（ARCHITECTURE §7.3；goto / sound 由 boot 处理） ----
  const on = <K extends SimEvent['type']>(type: K, fn: (e: Extract<SimEvent, { type: K }>) => void): void => { offs.push(bus.on(type, fn)); };
  on('modal', (e) => modals.openFromEvent(e.id, e.payload));
  on('toolbar', () => { availDirty = true; });
  on('techInvented', (e) => { availDirty = true; const key = TECH_SLOT_KEYS[e.slot]; message(t('message.techInvented', { name: key ? t(`tech.${key}`) : String(e.slot) })); });
  on('reward', (e) => { availDirty = true; const tool = host.catalogue.TOOLS.find((d) => d.unlock?.rewardBit === e.bit); message(t('message.rewardOffer', { name: tool ? t(tool.label) : String(e.bit) })); });
  on('message', (e) => statusBar.setMessage({ text: t(e.key, e.args), level: e.level === 'reject' ? 'reject' : 'alert' }));
  on('complaint', (e) => statusBar.setComplaint(e.key));
  on('insufficientFunds', (e) => { statusBar.flashFunds(); statusBar.setMessage({ text: t('message.insufficientFunds', { value: fmtMoney(e.cost) }), level: 'reject' }); });
  on('disasterStarted', (e) => {
    message(t('message.disasterStarted', { name: disasterName(strings, e.kind) }));
    if (host.state.disaster.autoGoto) renderer.goto(e.x, e.y, true);
    availDirty = true; statusBar.refresh();
  });
  on('disasterEnded', (e) => { message(t('message.disasterEnded', { name: disasterName(strings, e.kind) })); availDirty = true; statusBar.refresh(); });
  on('modeChanged', () => { availDirty = true; statusBar.refresh(); });
  on('weatherChanged', () => statusBar.refresh());
  on('brownout', () => message(t('message.brownout')));
  on('waterShortage', () => message(t('message.waterShortage')));
  on('plantExpired', () => message(t('message.plantExpired')));
  on('impeached', () => message(t('message.gameOver')));
  on('paper', (e) => { if (windows.isOpen('newspaper')) windows.refresh('newspaper'); if (e.extra) message(tr(strings, 'news.extra')); });
  on('uiRefresh', () => { windows.refreshAll(); modals.refreshAll(); });
  on('monthTick', () => { windows.refreshAll(); availDirty = true; statusBar.refresh(); menuBar.refresh(); });
  on('yearClosed', () => { windows.refreshAll(); });
  on('budgetWindow', () => { if (windows.isOpen('budget')) windows.refresh('budget'); });

  // ---- 节流刷新 ----
  let acc = 0, accAvail = 0;
  const tick = (dt: number): void => {
    acc += dt; accAvail += dt;
    if (acc >= UI_REFRESH_MS) { acc = 0; statusBar.refresh(); toolbar.refresh(); menuBar.refresh(); }
    if (availDirty || accAvail >= AVAILABILITY_REFRESH_MS) { availDirty = false; accAvail = 0; toolbar.refreshAvailability(); }
  };
  const refreshAll = (): void => { statusBar.refresh(); toolbar.refreshAvailability(); menuBar.refresh(); windows.refreshAll(); };

  const handle: ShellHandle = {
    destroy() {
      for (const off of offs) off();
      window.removeEventListener('keydown', onKey);
      root.removeEventListener('click', helpClick, true);
      if (bubbleTimer) clearTimeout(bubbleTimer);
      bubble?.remove();
      controller.destroy(); toolbar.destroy(); menuBar.destroy(); statusBar.destroy(); windows.destroy(); modals.destroy();
      windowLayer.remove(); modalLayer.remove();
      root.classList.remove(SHELL_CLASS);
      CONTROLS.delete(handle);
    },
    openWindow: (id: WindowId) => windows.open(id),
    closeWindow: (id: WindowId) => windows.close(id),
    setTool: (tool: ToolId | null) => controller.setTool(tool),
    showTitle,
  };
  const controls: ShellControls = { bus, viewEl, controller, windows, modals, toolbar, statusBar, menuBar, dispatch, tick, refreshAll, message, fileActions: {}, version: '' };
  CONTROLS.set(handle, controls);
  refreshAll();
  return handle;
}) satisfies UiEntry['mountShell'];

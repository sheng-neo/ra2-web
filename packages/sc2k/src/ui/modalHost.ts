// ===== ui/modalHost.ts =====（spec:ui-art §2.6 对话框；ARCHITECTURE §7.2 两条模态路径）
// 模态栈。两条打开路径：
//  1. SimEvent 'modal'（阶段挂起型：budget / militaryOffer / disasterAlert / scenarioBrief / scenarioResult / gameOver / newspaper / extraPaper / rewardOffer）
//     ——core 已 modalPause++，这里不再计数；玩家作答 → dispatch modalAnswer（挂起期间允许）→ host.modalClosed() 续跑当天剩余阶段。
//  2. CommandResult.modal（命令结果型：bridgeType / teamPick / neighborConnect）——打开时 host.modalOpened()，作答时 host.modalClosed() 再回调由 UI 重发命令。
//  3. 纯 UI 模态（importAssets / 关于 / 确认框）：不触碰 host。
// 内容按 MODAL_FACTORIES[id] 创建；缺失则用通用"确定"对话框并 answer(0)。
import type { SimHost } from '../contracts/host';
import type { Strings } from '../contracts/strings';
import type { ModalId } from '../contracts/commands';
import type { WindowDeps, ModalContent, ModalFactories } from './windowTypes';
import { h } from './dom';
import { tr } from './theme';

/** 阶段挂起型模态（由 SimEvent 'modal' 打开；关闭时必须 host.modalClosed()）。 */
export const PHASE_MODALS: ReadonlySet<ModalId> = new Set<ModalId>(['budget', 'militaryOffer', 'disasterAlert', 'scenarioBrief', 'scenarioResult', 'gameOver', 'newspaper', 'extraPaper', 'rewardOffer']);
/** 命令结果型模态（由 CommandResult.modal 打开；UI 重发命令）。 */
export const RESULT_MODALS: ReadonlySet<ModalId> = new Set<ModalId>(['bridgeType', 'teamPick', 'neighborConnect']);

export type ModalPath = 'event' | 'result' | 'ui';
/** BridgeKind 数值 → strings 键后缀（contracts/net.ts 枚举序）。 */
export const BRIDGE_KEYS: readonly string[] = ['causeway', 'raising', 'suspension', 'rail', 'highwayLow', 'highwayReinforced', 'wire'];
export interface ModalHostOptions {
  layer: HTMLElement;
  host: Pick<SimHost, 'dispatch' | 'modalOpened' | 'modalClosed'>;
  strings: Strings;
  deps: WindowDeps;
  factories: ModalFactories;
  /** 每次打开 / 关闭时的回调（音效、状态栏）。 */
  onChange?(depth: number): void;
}
export interface ModalHost {
  openFromEvent(id: ModalId, payload: unknown): void;
  openFromResult(modal: { id: ModalId; payload: unknown }, onAnswer: (n: number) => void): void;
  openUi(id: ModalId | string, payload: unknown, onAnswer?: (n: number) => void, title?: string): void;
  /** 纯 UI 模态，内容由调用方给出（导入素材面板 / 关于）。 */
  openCustom(id: string, content: ModalContent, onClose?: (n: number) => void): void;
  /** 关闭最上层模态（视为 answer(n)）；返回是否有模态被关闭。 */
  closeTop(answer?: number): boolean;
  depth(): number;
  isOpen(id: ModalId | string): boolean;
  refreshAll(): void;
  destroy(): void;
}
interface Live { id: string; path: ModalPath; content: ModalContent; el: HTMLElement; answered: boolean; onAnswer?: (n: number) => void }

/** payload 的安全文本摘要（通用对话框用）。 */
export function describePayload(payload: unknown): string {
  if (payload === null || payload === undefined) return '';
  if (typeof payload !== 'object') return String(payload);
  try { return JSON.stringify(payload, (_k, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v), 1).slice(0, 2000); } catch { return '[object]'; }
}

export function createModalHost(o: ModalHostOptions): ModalHost {
  const { layer, host, strings, deps, factories } = o;
  const stack: Live[] = [];

  const btn = (label: string, n: number, answer: (n: number) => void, testid: string): HTMLButtonElement =>
    h('button', { class: 'sc2k-btn', type: 'button', text: label, dataset: { testid }, on: { click: () => answer(n) } });
  /**
   * 通用对话框（工厂缺失时）。命令结果型三种给出可用的最小选择（内部约定，WP12b 的工厂同此语义）：
   *  bridgeType：answer = payload.options 下标，−1 取消；neighborConnect：1 接受 / 0 拒绝；teamPick：answer = 运动 0..4。
   *  其余：单个"确定"→ answer(0)。
   */
  const generic = (id: string, payload: unknown, answer: (n: number) => void): ModalContent => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const actions = h('div', { class: 'sc2k-modal-actions' });
    let extra: HTMLElement | null = null;
    if (id === 'neighborConnect') {
      extra = h('div', { text: strings.t('ui.neighbor.connect', { value: typeof p['cost'] === 'number' ? String(p['cost']) : '' }) });
      actions.append(btn(tr(strings, 'ui.yes'), 1, answer, 'modal-yes'), btn(tr(strings, 'ui.no'), 0, answer, 'modal-no'));
    } else if (id === 'bridgeType') {
      const opts = Array.isArray(p['options']) ? (p['options'] as number[]) : [];
      const len = typeof p['length'] === 'number' ? (p['length'] as number) : 0;
      extra = h('div', {}, ...opts.map((kind, k) => btn(`${tr(strings, `ui.bridge.${BRIDGE_KEYS[kind] ?? 'causeway'}`)}${len ? ` ×${len}` : ''}`, k, answer, `modal-bridge-${k}`)));
      extra.style.display = 'flex'; extra.style.flexWrap = 'wrap'; extra.style.gap = '4px';
      actions.append(btn(tr(strings, 'ui.cancel'), -1, answer, 'modal-cancel'));
    } else if (id === 'teamPick') {
      extra = h('div', {}, ...[0, 1, 2, 3, 4].map((k) => btn(tr(strings, `ui.team.${k}`), k, answer, `modal-team-${k}`)));
      extra.style.display = 'flex'; extra.style.flexWrap = 'wrap'; extra.style.gap = '4px';
    } else {
      actions.append(btn(tr(strings, 'ui.ok'), 0, answer, 'modal-ok'));
    }
    const body = h('div', { dataset: { testid: `modal-generic-${id}` } },
      h('div', { text: tr(strings, `modal.${id}`, 'ui.ok') }),
      extra,
      !extra && payload !== undefined && payload !== null ? h('pre', { class: 'sc2k-modal-payload sc2k-sunken-white', text: describePayload(payload) }) : null,
      actions);
    return { title: tr(strings, `modal.${id}`), el: body };
  };

  function push(id: string, path: ModalPath, payload: unknown, onAnswer?: (n: number) => void, title?: string, custom?: ModalContent): void {
    const entry: Live = { id, path, content: { title: '', el: h('div') }, el: h('div'), answered: false, onAnswer };
    const answer = (n: number): void => finish(entry, n);
    const factory = (factories as Record<string, ModalFactories[ModalId]>)[id];
    let content: ModalContent;
    try { content = custom ?? (factory ? factory(deps, payload, answer) : generic(id, payload, answer)); }
    catch (err) { content = generic(id, { error: String(err) }, answer); }
    entry.content = content;
    const closeAnswer = path === 'result' ? -1 : 0;   // 命令结果型：× = 取消（−1）；其余 × = 确定（0）
    const bar = h('div', { class: 'sc2k-titlebar' },
      h('span', { class: 'sc2k-title-text', text: title ?? content.title ?? tr(strings, `modal.${id}`) }),
      h('button', { class: 'sc2k-btn sc2k-close', type: 'button', text: '×', title: tr(strings, 'ui.close'), dataset: { testid: `modal-close-${id}` }, on: { click: () => answer(closeAnswer) } }));
    const win = h('div', { class: 'sc2k-window sc2k-modal sc2k-out', dataset: { modal: id, testid: `modal-${id}` } }, bar, h('div', { class: 'sc2k-window-body' }, content.el));
    entry.el = h('div', { class: 'sc2k-backdrop', on: { pointerdown: (e) => { e.stopPropagation(); } } }, win);
    layer.appendChild(entry.el);
    stack.push(entry);
    if (path === 'result') host.modalOpened();
    o.onChange?.(stack.length);
    content.refresh?.();
  }
  function finish(entry: Live, n: number): void {
    if (entry.answered) return;
    entry.answered = true;
    const k = stack.indexOf(entry);
    if (k >= 0) stack.splice(k, 1);
    entry.content.destroy?.();
    entry.el.remove();
    if (entry.path === 'event') {
      host.dispatch({ type: 'modalAnswer', dialog: entry.id as ModalId, answer: n | 0 });
      host.modalClosed();
    } else if (entry.path === 'result') {
      host.modalClosed();
    }
    entry.onAnswer?.(n);
    o.onChange?.(stack.length);
  }
  return {
    openFromEvent: (id, payload) => push(id, 'event', payload),
    openFromResult: (modal, onAnswer) => push(modal.id, 'result', modal.payload, onAnswer),
    openUi: (id, payload, onAnswer, title) => push(id, 'ui', payload, onAnswer, title),
    openCustom: (id, content, onClose) => push(id, 'ui', null, onClose, content.title, content),
    closeTop: (answer = 0) => { const top = stack[stack.length - 1]; if (!top) return false; finish(top, answer); return true; },
    depth: () => stack.length,
    isOpen: (id) => stack.some((e) => e.id === id),
    refreshAll: () => { for (const e of stack) e.content.refresh?.(); },
    destroy: () => { for (const e of [...stack]) { e.answered = true; e.content.destroy?.(); e.el.remove(); } stack.length = 0; },
  };
}

// ===== ui/windowManager.ts =====（spec:ui-art §2.5 信息窗口；ARCHITECTURE §7.2）
// 非模态浮动窗口：按 WINDOW_FACTORIES[id] 创建（缺失 → "未实现"占位窗口），可拖动、可关闭、z 序置顶、同类单例、位置记 localStorage。
// 窗口组件只依赖 WindowDeps（ui/windowTypes.ts，Lead 预置）；本文件不认识任何具体窗口。
import type { Strings } from '../contracts/strings';
import type { WindowId } from '../contracts/shell';
import type { WindowDeps, WindowFactories, WindowSpec } from './windowTypes';
import { clamp, h, readJson, writeJson } from './dom';
import { tr } from './theme';

export interface WindowManagerOptions {
  layer: HTMLElement;                  // 窗口层（pointer-events: none；窗口本身 auto）
  deps: WindowDeps;
  strings: Strings;
  factories: WindowFactories;
  storage?: Storage | null;
  /** 新窗口的默认落点（级联）。 */
  origin?: { x: number; y: number };
}
export interface WindowManager {
  open(id: WindowId): void; close(id: WindowId): void; toggle(id: WindowId): void;
  isOpen(id: WindowId): boolean; openIds(): WindowId[];
  /** 关闭 z 序最上层的窗口（Esc 语义栈）；返回是否关闭了窗口。 */
  closeTop(): boolean;
  refresh(id: WindowId): void; refreshAll(): void;
  /** 窗口元素（已打开时）。 */
  elementOf(id: WindowId): HTMLElement | null;
  destroy(): void;
}
interface Live { id: WindowId; spec: WindowSpec; el: HTMLElement; z: number }
const STORE_KEY = (id: WindowId): string => `sc2k.win.${id}`;
const CASCADE = 24;

/** 标题栏拖动（PointerEvent；约束在 layer 内）。 */
export function makeDraggable(handle: HTMLElement, el: HTMLElement, bounds: HTMLElement, onEnd?: (x: number, y: number) => void): () => void {
  let drag: { id: number; dx: number; dy: number } | null = null;
  const down = (e: PointerEvent): void => {
    if (e.button !== 0 || (e.target instanceof HTMLElement && e.target.closest('button'))) return;
    drag = { id: e.pointerId, dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop };
    try { handle.setPointerCapture?.(e.pointerId); } catch { /* 合成事件 */ }
    e.preventDefault();
  };
  const move = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    const maxX = Math.max(0, bounds.clientWidth - 40), maxY = Math.max(0, bounds.clientHeight - 20);
    el.style.left = `${clamp(e.clientX - drag.dx, -el.offsetWidth + 40, maxX)}px`;
    el.style.top = `${clamp(e.clientY - drag.dy, 0, maxY)}px`;
  };
  const up = (e: PointerEvent): void => { if (drag && e.pointerId === drag.id) { drag = null; onEnd?.(el.offsetLeft, el.offsetTop); } };
  handle.addEventListener('pointerdown', down);
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
  return () => {
    handle.removeEventListener('pointerdown', down); handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
  };
}

export function createWindowManager(o: WindowManagerOptions): WindowManager {
  const { layer, deps, strings, factories } = o;
  const storage = o.storage ?? null;
  const live = new Map<WindowId, Live>();
  const undrag = new Map<WindowId, () => void>();
  let zTop = 1;
  let cascade = 0;

  const placeholder = (id: WindowId): WindowSpec => ({
    id, title: tr(strings, `window.${id}`),
    el: h('div', { class: 'sc2k-placeholder', dataset: { testid: `window-placeholder-${id}` } }, `${tr(strings, 'reject.notImplemented')} (${id})`),
  });
  const raise = (w: Live): void => {
    w.z = ++zTop;
    w.el.style.zIndex = String(w.z);
    for (const x of live.values()) x.el.classList.toggle('inactive', x !== w);
  };
  const topWindow = (): Live | null => { let best: Live | null = null; for (const w of live.values()) if (!best || w.z > best.z) best = w; return best; };

  function open(id: WindowId): void {
    const cur = live.get(id);
    if (cur) { raise(cur); cur.spec.refresh?.(); return; }
    const factory = factories[id];
    let spec: WindowSpec;
    try { spec = factory ? factory(deps) : placeholder(id); }
    catch (err) { spec = placeholder(id); spec.el.textContent = `${spec.el.textContent} — ${String(err)}`; }
    const title = h('span', { class: 'sc2k-title-text', text: spec.title || tr(strings, `window.${id}`) });
    const closeBtn = h('button', { class: 'sc2k-btn sc2k-close', type: 'button', text: '×', title: tr(strings, 'ui.close'), dataset: { testid: `window-close-${id}` }, on: { click: () => close(id) } });
    const bar = h('div', { class: 'sc2k-titlebar' }, title, closeBtn);
    const body = h('div', { class: 'sc2k-window-body' }, spec.el);
    const el = h('div', { class: 'sc2k-window sc2k-out', dataset: { window: id, testid: `window-${id}` }, on: { pointerdown: () => { const w = live.get(id); if (w) raise(w); } } }, bar, body);
    if (spec.width) el.style.width = `${spec.width}px`;
    if (spec.height) el.style.height = `${spec.height}px`;
    const saved = readJson<{ x: number; y: number }>(storage, STORE_KEY(id));
    const origin = o.origin ?? { x: 96, y: 24 };
    const x = saved ? saved.x : origin.x + (cascade % 8) * CASCADE, y = saved ? saved.y : origin.y + (cascade % 8) * CASCADE;
    if (!saved) cascade++;
    el.style.left = `${clamp(x, 0, Math.max(0, layer.clientWidth - 60))}px`;
    el.style.top = `${clamp(y, 0, Math.max(0, layer.clientHeight - 24))}px`;
    layer.appendChild(el);
    const w: Live = { id, spec, el, z: 0 };
    live.set(id, w);
    undrag.set(id, makeDraggable(bar, el, layer, (nx, ny) => writeJson(storage, STORE_KEY(id), { x: nx, y: ny })));
    raise(w);
    spec.onShow?.();
    spec.refresh?.();
  }
  function close(id: WindowId): void {
    const w = live.get(id);
    if (!w) return;
    live.delete(id);
    undrag.get(id)?.(); undrag.delete(id);
    w.spec.onHide?.();
    w.spec.destroy?.();
    w.el.remove();
    const top = topWindow();
    if (top) raise(top);
  }
  return {
    open, close,
    toggle: (id) => { if (live.has(id)) close(id); else open(id); },
    isOpen: (id) => live.has(id),
    openIds: () => [...live.keys()],
    closeTop: () => { const top = topWindow(); if (!top) return false; close(top.id); return true; },
    refresh: (id) => { live.get(id)?.spec.refresh?.(); },
    refreshAll: () => { for (const w of live.values()) w.spec.refresh?.(); },
    elementOf: (id) => live.get(id)?.el ?? null,
    destroy: () => { for (const id of [...live.keys()]) close(id); },
  };
}

// ===== ui/dom.ts =====（ARCHITECTURE §7.1：≈ 60 行 h() 构建器 + Store<T>）
// 极小的 DOM 构建器与可订阅状态盒：外壳全部组件只用这两样，不引入框架（Playwright 选择器稳定、与 canvas 完全分离）。
export type Child = Node | string | number | null | undefined | false;
type EventMap = HTMLElementEventMap;
export type OnMap = { [K in keyof EventMap]?: (e: EventMap[K]) => void };
export interface HProps {
  class?: string; id?: string; title?: string; text?: string;
  style?: Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
  attrs?: Record<string, string | number | boolean>;
  on?: OnMap;
  ref?: (el: HTMLElement) => void;
  /** 其余键直接赋给元素属性（value / type / disabled / checked / tabIndex / htmlFor …）。 */
  [k: string]: unknown;
}
const SPECIAL = new Set(['class', 'style', 'dataset', 'attrs', 'on', 'ref', 'text']);

/** 创建元素：h('div', { class: 'a', on: { click } }, '文字', child)。children 中的 null / false / undefined 被跳过。 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: HProps | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.text !== undefined) el.textContent = props.text;
    if (props.style) Object.assign(el.style, props.style);
    if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v;
    if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, String(v));
    if (props.on) for (const [type, fn] of Object.entries(props.on)) if (fn) el.addEventListener(type, fn as EventListener);
    for (const [k, v] of Object.entries(props)) {
      if (SPECIAL.has(k) || v === undefined) continue;
      (el as unknown as Record<string, unknown>)[k] = v;
    }
    props.ref?.(el);
  }
  append(el, children);
  return el;
}
/** 追加子节点（跳过空值；数字 / 字符串转文本节点）。 */
export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
}
/** 清空元素内容。 */
export function clear(el: Element): void { while (el.firstChild) el.removeChild(el.firstChild); }
/** 条件切换 class。 */
export function classIf(el: Element, cls: string, on: boolean): void { el.classList.toggle(cls, on); }
/** 只在文本变化时写 textContent（避免每帧触发布局）。 */
export function setText(el: Element, s: string): void { if (el.textContent !== s) el.textContent = s; }

/**
 * 可订阅状态盒：get / set / update / subscribe；set 相同引用不通知；batch 内多次 set 只在结束时通知一次。
 * 订阅回调里再 set 会在当前通知结束后再通知一轮（不递归）。
 */
export class Store<T> {
  private v: T;
  private readonly subs = new Set<(v: T) => void>();
  private depth = 0;
  private dirty = false;
  private notifying = false;
  constructor(v: T) { this.v = v; }
  get(): T { return this.v; }
  set(v: T): void {
    if (Object.is(v, this.v)) return;
    this.v = v;
    this.dirty = true;
    if (this.depth === 0) this.flush();
  }
  update(fn: (v: T) => T): void { this.set(fn(this.v)); }
  subscribe(fn: (v: T) => void, immediate = false): () => void {
    this.subs.add(fn);
    if (immediate) fn(this.v);
    return () => { this.subs.delete(fn); };
  }
  batch(fn: () => void): void {
    this.depth++;
    try { fn(); } finally { this.depth--; }
    if (this.depth === 0 && this.dirty) this.flush();
  }
  private flush(): void {
    if (this.notifying) return;                 // 回调中的 set：dirty 保持，外层循环再发
    this.notifying = true;
    try {
      while (this.dirty) {
        this.dirty = false;
        for (const s of [...this.subs]) s(this.v);
      }
    } finally { this.notifying = false; }
  }
}

/** 金额：$ + 千分位；负数前置减号（'-$1,234'）。 */
export function fmtMoney(n: number): string {
  const v = Math.trunc(n);
  const s = Math.abs(v).toLocaleString('en-US');
  return (v < 0 ? '-$' : '$') + s;
}
/** 夹取。 */
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/** 读 / 写 localStorage 的 JSON 值（无 storage 或解析失败时静默返回 null）。 */
export function readJson<T>(storage: Storage | null | undefined, key: string): T | null {
  try { const s = storage?.getItem(key); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
}
export function writeJson(storage: Storage | null | undefined, key: string, v: unknown): void {
  try { storage?.setItem(key, JSON.stringify(v)); } catch { /* 配额 / 隐私模式：忽略 */ }
}
/** 当前可用的 localStorage（无 window 或被禁用时 null）。 */
export function localStorageOrNull(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

// ===== ui/windows/wdom.ts =====（WP12b：窗口组件自用的最小 DOM 构建器）
// 只依赖 DOM；类名约定 sc2k-win-*（基础斜面样式由 WP12a 的 theme.css 提供，补充样式在 ./windows.css）。
// 不与 WP12a 的 ui/dom.ts 耦合：窗口组件只经 WindowDeps 与外壳交互（windowTypes.ts）。

export type Child = Node | string | number | null | undefined | false;

export interface HProps {
  cls?: string; text?: string; title?: string; testid?: string;
  type?: string; value?: string; placeholder?: string; name?: string;
  min?: number | string; max?: number | string; step?: number | string; maxLength?: number;
  checked?: boolean; disabled?: boolean; selected?: boolean; multiple?: boolean;
  accept?: string; href?: string; download?: string; htmlFor?: string;
  width?: number; height?: number;
  style?: Partial<CSSStyleDeclaration>; attrs?: Record<string, string>;
  onClick?: (e: MouseEvent) => void; onInput?: (e: Event) => void; onChange?: (e: Event) => void; onSubmit?: (e: Event) => void;
}

const DIRECT_PROPS = ['type', 'value', 'placeholder', 'name', 'checked', 'disabled', 'selected', 'multiple', 'accept', 'href', 'download', 'htmlFor', 'title', 'maxLength', 'width', 'height'] as const;

/** 创建元素：props 中的事件 / 属性 / 样式 / data-testid 一次写入；children 中的 string / number 变成文本节点，falsy 跳过。 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: HProps = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props.cls) e.className = props.cls;
  if (props.text !== undefined) e.textContent = props.text;
  if (props.testid) e.dataset['testid'] = props.testid;
  for (const k of DIRECT_PROPS) {
    const v = props[k];
    if (v !== undefined) (e as unknown as Record<string, unknown>)[k] = v;
  }
  if (props.min !== undefined) e.setAttribute('min', String(props.min));
  if (props.max !== undefined) e.setAttribute('max', String(props.max));
  if (props.step !== undefined) e.setAttribute('step', String(props.step));
  if (props.style) Object.assign(e.style, props.style);
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) e.setAttribute(k, v);
  if (props.onClick) e.addEventListener('click', props.onClick as EventListener);
  if (props.onInput) e.addEventListener('input', props.onInput);
  if (props.onChange) e.addEventListener('change', props.onChange);
  if (props.onSubmit) e.addEventListener('submit', props.onSubmit);
  append(e, ...children);
  return e;
}

export function append(el: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: HTMLElement): void { while (el.firstChild) el.removeChild(el.firstChild); }
export function replace(el: HTMLElement, ...children: Child[]): void { clear(el); append(el, ...children); }

/** 斜面按钮。 */
export function btn(label: string, onClick: () => void, opts: { testid?: string; disabled?: boolean; cls?: string; title?: string } = {}): HTMLButtonElement {
  return h('button', { cls: `sc2k-win-btn${opts.cls ? ' ' + opts.cls : ''}`, type: 'button', text: label, testid: opts.testid, disabled: opts.disabled, title: opts.title, onClick: () => onClick() });
}

/** 复选框 + 文字；返回 label 元素，input 可经 .input 取得。 */
export function checkbox(label: string, checked: boolean, onChange: (on: boolean) => void, opts: { testid?: string; disabled?: boolean } = {}): HTMLLabelElement & { input: HTMLInputElement } {
  const input = h('input', { type: 'checkbox', checked, disabled: opts.disabled, testid: opts.testid });
  input.addEventListener('change', () => onChange(input.checked));
  const el = h('label', { cls: 'sc2k-win-check' }, input, h('span', { text: label })) as HTMLLabelElement & { input: HTMLInputElement };
  el.input = input;
  return el;
}

export interface SliderHandle { el: HTMLDivElement; input: HTMLInputElement; readout: HTMLSpanElement; setValue(v: number): void }
/** 滑块 + 读数（fmt 决定读数文本）；onInput 随拖动回调（读数已自动更新），onChange 在松手（change 事件）时回调——派发命令用后者。 */
export function slider(opts: { min: number; max: number; value: number; step?: number; testid?: string; disabled?: boolean; fmt?: (v: number) => string; onInput?: (v: number) => void; onChange?: (v: number) => void }): SliderHandle {
  const fmt = opts.fmt ?? ((v: number): string => String(v));
  const input = h('input', { type: 'range', min: opts.min, max: opts.max, step: opts.step ?? 1, value: String(opts.value), testid: opts.testid, disabled: opts.disabled, cls: 'sc2k-win-slider' });
  const readout = h('span', { cls: 'sc2k-win-readout', text: fmt(opts.value) });
  input.addEventListener('input', () => { const v = Number(input.value); readout.textContent = fmt(v); opts.onInput?.(v); });
  input.addEventListener('change', () => { const v = Number(input.value); readout.textContent = fmt(v); opts.onChange?.(v); });
  const el = h('div', { cls: 'sc2k-win-sliderrow' }, input, readout);
  return { el, input, readout, setValue: (v) => { input.value = String(v); readout.textContent = fmt(v); } };
}

/** 一行"标签 + 控件"。 */
export function field(label: string, control: Child, opts: { cls?: string } = {}): HTMLDivElement {
  return h('div', { cls: `sc2k-win-field${opts.cls ? ' ' + opts.cls : ''}` }, h('span', { cls: 'sc2k-win-label', text: label }), control);
}

/** 带标题的分组框。 */
export function group(title: string, ...children: Child[]): HTMLFieldSetElement {
  return h('fieldset', { cls: 'sc2k-win-group' }, h('legend', { text: title }), ...children);
}

/** 简单表格。 */
export function table(headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<Child>>, opts: { cls?: string; testid?: string } = {}): HTMLTableElement {
  const thead = h('thead', {}, h('tr', {}, ...headers.map((s) => h('th', { text: s }))));
  const tbody = h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c)))));
  return h('table', { cls: `sc2k-win-table${opts.cls ? ' ' + opts.cls : ''}`, testid: opts.testid }, thead, tbody);
}

/** 下载字节为文件（浏览器）；Node / 测试环境缺 createObjectURL 时静默返回 false。 */
export function downloadBytes(bytes: Uint8Array | ArrayBuffer, fileName: string, mime = 'application/octet-stream'): boolean {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const blob = new Blob([bytes instanceof Uint8Array ? new Uint8Array(bytes) : bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: fileName, style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof URL.revokeObjectURL === 'function') setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** 短暂提示行（窗口内的消息区）。 */
export function noteLine(testid?: string): HTMLDivElement & { say(text: string, level?: 'info' | 'error'): void } {
  const el = h('div', { cls: 'sc2k-win-note', testid }) as HTMLDivElement & { say(text: string, level?: 'info' | 'error'): void };
  el.say = (text, level = 'info') => { el.textContent = text; el.dataset['level'] = level; };
  return el;
}

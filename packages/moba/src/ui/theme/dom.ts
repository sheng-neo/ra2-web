/**
 * DOM 小工具与通用组件工厂。组件只负责结构与状态类，外观全部在 components.css.ts。
 */
import type { AudioEngine, UiSound } from '../../audio/api';

export type Child = Node | string | number | null | undefined | false;

/** 创建元素：h('div', 'sf-panel', child1, child2…) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  append(el, ...children);
  return el;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** 内联 SVG 图标包装：<span class="sf-i">svg</span>，尺寸跟随字号(1.25em) */
export function icon(svg: string, cls?: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = cls ? `sf-i ${cls}` : 'sf-i';
  el.innerHTML = svg;
  return el;
}

/** 图标槽：带金边的方/圆形容器，里面放技能/装备图标 SVG */
export interface SlotOptions {
  /** CSS 尺寸，如 '48u' 会被原样写入 --sf-slot（请传已展开的值或 var()） */
  size?: string;
  round?: boolean;
  /** 作为按钮渲染（可点击/聚焦） */
  button?: boolean;
  cls?: string;
  label?: string;
}
export function createSlot(svg: string | null, o: SlotOptions = {}): HTMLElement {
  const el = document.createElement(o.button ? 'button' : 'span');
  el.className = `sf-slot${o.round ? ' sf-slot--round' : ''}${svg === null ? ' sf-slot--empty' : ''}${o.cls ? ` ${o.cls}` : ''}`;
  if (o.size) el.style.setProperty('--sf-slot', o.size);
  if (o.label) el.setAttribute('aria-label', o.label);
  if (o.button) (el as HTMLButtonElement).type = 'button';
  if (svg) el.innerHTML = svg;
  return el;
}

// ───────────── 按钮 ─────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export interface ButtonOptions {
  label: string;
  /** 前置图标(SVG 字符串) */
  icon?: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  /** 呼吸光（每屏唯一主行动） */
  pulse?: boolean;
  /** 点击音；'none' 不发声。默认 click */
  sound?: UiSound | 'none';
  cls?: string;
  onClick?: (ev: MouseEvent) => void;
}

export function createButton(o: ButtonOptions): HTMLButtonElement {
  const v = o.variant ?? 'secondary';
  const b = h('button', `sf-btn${v !== 'secondary' ? ` sf-btn--${v}` : ''}${o.size && o.size !== 'md' ? ` sf-btn--${o.size}` : ''}${o.block ? ' sf-btn--block' : ''}${o.pulse ? ' sf-btn--pulse' : ''}${o.cls ? ` ${o.cls}` : ''}`);
  b.type = 'button';
  b.dataset.sfSnd = o.sound ?? 'click';
  if (o.pulse) b.appendChild(h('i', 'sf-btn__glow'));
  if (o.icon) b.appendChild(icon(o.icon));
  b.appendChild(h('span', 'sf-btn__label', o.label));
  if (o.onClick) b.addEventListener('click', o.onClick);
  return b;
}

export interface IconButtonOptions {
  icon: string;
  /** 无障碍名称（必填：图标按钮没有可见文字） */
  label: string;
  quiet?: boolean;
  sound?: UiSound | 'none';
  cls?: string;
  onClick?: (ev: MouseEvent) => void;
}

export function createIconButton(o: IconButtonOptions): HTMLButtonElement {
  const b = h('button', `sf-iconbtn${o.quiet ? ' sf-iconbtn--quiet' : ''}${o.cls ? ` ${o.cls}` : ''}`, icon(o.icon));
  b.type = 'button';
  b.setAttribute('aria-label', o.label);
  b.title = o.label;
  b.dataset.sfSnd = o.sound ?? 'click';
  if (o.onClick) b.addEventListener('click', o.onClick);
  return b;
}

// ───────────── 分段选择 ─────────────

export interface SegmentedOptions<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  block?: boolean;
  label?: string;
  onChange: (value: T) => void;
}
export interface Segmented<T extends string> {
  el: HTMLElement;
  get(): T;
  /** 仅更新显示，不触发 onChange */
  set(value: T): void;
}

export function createSegmented<T extends string>(o: SegmentedOptions<T>): Segmented<T> {
  let cur = o.value;
  const el = h('div', `sf-seg${o.block ? ' sf-seg--block' : ''}`);
  el.setAttribute('role', 'radiogroup');
  if (o.label) el.setAttribute('aria-label', o.label);
  const btns = o.options.map((opt) => {
    const b = h('button', 'sf-seg__opt', opt.label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.sfSnd = 'select';
    b.addEventListener('click', () => {
      if (cur === opt.value) return;
      set(opt.value);
      o.onChange(opt.value);
    });
    el.appendChild(b);
    return b;
  });
  function set(v: T): void {
    cur = v;
    o.options.forEach((opt, i) => {
      const on = opt.value === v;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-checked', String(on));
    });
  }
  set(cur);
  return { el, get: () => cur, set };
}

// ───────────── 标签页 ─────────────

export interface TabsOptions<T extends string> {
  tabs: { id: T; label: string; icon?: string }[];
  value: T;
  onChange: (id: T) => void;
}
export interface Tabs<T extends string> {
  el: HTMLElement;
  get(): T;
  set(id: T): void;
}

export function createTabs<T extends string>(o: TabsOptions<T>): Tabs<T> {
  let cur = o.value;
  const el = h('div', 'sf-tabs');
  el.setAttribute('role', 'tablist');
  const btns = o.tabs.map((t) => {
    const b = h('button', 'sf-tab', t.icon ? icon(t.icon) : null, t.label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.sfSnd = 'select';
    b.addEventListener('click', () => {
      if (cur === t.id) return;
      set(t.id);
      o.onChange(t.id);
    });
    el.appendChild(b);
    return b;
  });
  function set(id: T): void {
    cur = id;
    o.tabs.forEach((t, i) => {
      const on = t.id === id;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-selected', String(on));
    });
  }
  set(cur);
  return { el, get: () => cur, set };
}

// ───────────── 滑块 ─────────────

export interface SliderOptions {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  label?: string;
  /** 拖动过程中连续触发 */
  onInput: (value: number) => void;
  /** 松手时触发一次 */
  onCommit?: (value: number) => void;
}
export interface Slider {
  el: HTMLInputElement;
  get(): number;
  set(value: number): void;
}

export function createSlider(o: SliderOptions): Slider {
  const min = o.min ?? 0;
  const max = o.max ?? 1;
  const el = h('input', 'sf-slider');
  el.type = 'range';
  el.min = String(min);
  el.max = String(max);
  el.step = String(o.step ?? 0.01);
  if (o.label) el.setAttribute('aria-label', o.label);
  const paint = (): void => {
    const v = Number(el.value);
    el.style.setProperty('--sf-fill', `${((v - min) / (max - min || 1)) * 100}%`);
  };
  el.value = String(o.value);
  paint();
  el.addEventListener('input', () => {
    paint();
    o.onInput(Number(el.value));
  });
  el.addEventListener('change', () => o.onCommit?.(Number(el.value)));
  return {
    el,
    get: () => Number(el.value),
    set: (v) => {
      el.value = String(v);
      paint();
    },
  };
}

// ───────────── 开关 ─────────────

export interface ToggleOptions {
  value: boolean;
  label?: string;
  onChange: (value: boolean) => void;
}
export interface Toggle {
  el: HTMLButtonElement;
  get(): boolean;
  set(value: boolean): void;
  /** 翻转并触发 onChange（供整行可点时调用） */
  flip(): void;
}

export function createToggle(o: ToggleOptions): Toggle {
  let cur = o.value;
  const el = h('button', 'sf-toggle');
  el.type = 'button';
  el.setAttribute('role', 'switch');
  if (o.label) el.setAttribute('aria-label', o.label);
  el.dataset.sfSnd = 'click';
  const set = (v: boolean): void => {
    cur = v;
    el.setAttribute('aria-checked', String(v));
  };
  const flip = (): void => {
    set(!cur);
    o.onChange(cur);
  };
  el.addEventListener('click', (ev) => {
    // 整行可点时，行的 click 也会触发 flip；这里拦住避免翻两次
    ev.stopPropagation();
    flip();
  });
  set(cur);
  return { el, get: () => cur, set, flip };
}

// ───────────── 进度条 / 徽标 ─────────────

export interface Progress {
  el: HTMLElement;
  /** p ∈ [0,1] */
  set(p: number): void;
}

export function createProgress(): Progress {
  const el = h('div', 'sf-progress', h('div', 'sf-progress__fill'), h('div', 'sf-progress__spark'));
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  return {
    el,
    set: (p) => {
      const v = Math.max(0, Math.min(1, p));
      el.style.setProperty('--sf-p', String(v));
      el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    },
  };
}

export type BadgeTone = 'gold' | 'cyan' | 'blue' | 'red' | 'green' | 'violet' | 'mute' | 'solid' | 'me';

export function createBadge(text: string, tone: BadgeTone = 'gold', iconSvg?: string): HTMLSpanElement {
  return h('span', `sf-badge${tone !== 'gold' ? ` sf-badge--${tone}` : ''}`, iconSvg ? icon(iconSvg) : null, text);
}

// ───────────── 界面音效 ─────────────

const UI_SOUNDS: ReadonlySet<string> = new Set<UiSound>(['click', 'hover', 'confirm', 'back', 'select', 'buy', 'error', 'ready', 'countdown']);

/**
 * 给容器内所有带 `data-sf-snd` 的控件接上悬停/点击音（事件委托，新增的控件自动生效）。
 * 同时负责「首次任意按下解锁音频」。返回解除绑定的函数。
 */
export function bindUiSounds(root: HTMLElement, audio: Pick<AudioEngine, 'ui' | 'unlock'>): () => void {
  let hovered: Element | null = null;
  const find = (t: EventTarget | null): HTMLElement | null => (t instanceof Element ? t.closest<HTMLElement>('[data-sf-snd]') : null);
  const onDown = (): void => audio.unlock();
  const onOver = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse') return;
    const el = find(ev.target);
    if (el === hovered) return;
    hovered = el;
    if (el && !(el as HTMLButtonElement).disabled) audio.ui('hover');
  };
  const onClick = (ev: MouseEvent): void => {
    const el = find(ev.target);
    if (!el || (el as HTMLButtonElement).disabled) return;
    const snd = el.dataset.sfSnd ?? '';
    if (UI_SOUNDS.has(snd)) audio.ui(snd as UiSound);
  };
  root.addEventListener('pointerdown', onDown, true);
  // 键盘事件的目标是焦点元素（常常是 body），所以挂在 window 上
  window.addEventListener('keydown', onDown, true);
  root.addEventListener('pointerover', onOver);
  // 捕获阶段播放：即便控件的处理函数里移除了自身/切了屏，声音也已发出
  root.addEventListener('click', onClick, true);
  return () => {
    root.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('keydown', onDown, true);
    root.removeEventListener('pointerover', onOver);
    root.removeEventListener('click', onClick, true);
  };
}

/**
 * 浮层：对话框与提示浮层(tooltip)。
 */
import { append, h, icon } from './dom';
import type { Child } from './dom';

const CLOSE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// ───────────── 对话框 ─────────────

/** 打开中的对话框。用登记表而不是计数器：宿主直接清空 DOM(错误恢复时的软重启)也不会让状态卡死 */
interface OpenEntry {
  scrim: HTMLElement;
  close(): void;
}
const openEntries = new Set<OpenEntry>();

/** 是否有对话框打开（各界面的全局快捷键据此让路）。只认还在文档里的：节点被外部移走的不算 */
export function hasOpenDialog(): boolean {
  for (const e of openEntries) if (e.scrim.isConnected) return true;
  return false;
}

/**
 * 关闭全部对话框(不播退场动画，立即摘除节点)；传 within 则只关挂在它里面的。
 * 宿主要丢弃整个界面(软重启)或某个界面被中途取消时调用：监听与回调照常走 onClose 清理。
 */
export function closeAllDialogs(within?: HTMLElement): void {
  for (const e of Array.from(openEntries)) {
    if (within && e.scrim.isConnected && !within.contains(e.scrim)) continue;
    e.close();
    e.scrim.remove();
  }
}

/**
 * 当前是否有「键盘聚焦中的按钮」：有的话回车/空格应交给它，界面级快捷键让路。
 * 鼠标点过的按钮虽然也持有焦点，但没有可见焦点环，不算。
 */
export function isButtonKeyFocused(within?: HTMLElement): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLButtonElement)) return false;
  if (within && !within.contains(el)) return false;
  return focusVisible(el);
}

/** 旧浏览器不认识 :focus-visible 选择器时 matches 会抛错：那就一律当作「键盘聚焦」，行为退回到最保守 */
function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

export interface DialogOptions {
  title: string;
  content: Child | Child[];
  /** 底部按钮区 */
  footer?: Child | Child[];
  /** 最大宽度（已展开的 CSS 值，如 u(640)） */
  width?: string;
  /** 允许点遮罩/Esc/关闭按钮关闭，默认 true */
  closable?: boolean;
  cls?: string;
  /** 以任何方式关闭后调用一次 */
  onClose?: () => void;
}

export interface Dialog {
  el: HTMLElement;
  body: HTMLElement;
  close(): void;
}

/** 在 root（应为 .sf-root 容器）上打开一个居中的模态对话框 */
export function openDialog(root: HTMLElement, o: DialogOptions): Dialog {
  const closable = o.closable !== false;
  let closed = false;
  // 只有键盘操作(焦点环可见)打开的对话框，关闭后才把焦点还回去；
  // 鼠标/触控点开的不还，否则之后按回车会再次触发那个按钮
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const prevFocus = active && focusVisible(active) ? active : null;

  const title = h('h2', 'sf-dialog__title sf-metal', o.title);
  const closeBtn = closable ? h('button', 'sf-iconbtn sf-iconbtn--quiet', icon(CLOSE_SVG)) : null;
  if (closeBtn) {
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.dataset.sfSnd = 'back';
  }
  const body = h('div', 'sf-dialog__body sf-scroll');
  append(body, ...(Array.isArray(o.content) ? o.content : [o.content]));
  const foot = o.footer ? h('div', 'sf-dialog__foot') : null;
  if (foot) append(foot, ...(Array.isArray(o.footer) ? o.footer : [o.footer]));
  const panel = h('div', `sf-dialog sf-panel${o.cls ? ` ${o.cls}` : ''}`, h('div', 'sf-dialog__head', title, closeBtn), body, foot);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', o.title);
  panel.tabIndex = -1;
  if (o.width) panel.style.setProperty('--sf-dialog-w', o.width);
  const scrim = h('div', 'sf-dialog-scrim', panel);

  const entry: OpenEntry = { scrim, close: () => close() };
  const close = (): void => {
    if (closed) return;
    closed = true;
    openEntries.delete(entry);
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('focusin', onFocusIn);
    scrim.classList.add('is-leaving');
    window.setTimeout(() => scrim.remove(), 180);
    if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLElement && scrim.contains(document.activeElement)) document.activeElement.blur();
    o.onClose?.();
  };
  const onKey = (ev: KeyboardEvent): void => {
    if (!scrim.isConnected) {
      // 节点已被外部移走(宿主清空了容器)：只做善后，不吞这次按键
      close();
      return;
    }
    if (ev.key !== 'Escape' || !closable) return;
    // 捕获阶段拦截，避免底下的界面同时响应 Esc
    ev.stopPropagation();
    ev.preventDefault();
    close();
  };
  // 焦点陷阱：Tab 走到对话框外面时拉回来，键盘用户不会「掉」到遮罩后面的界面上
  const onFocusIn = (ev: FocusEvent): void => {
    if (closed || !scrim.isConnected) return;
    // 只有最上层的对话框负责拉回焦点
    if (scrim.nextElementSibling?.classList.contains('sf-dialog-scrim')) return;
    if (ev.target instanceof Node && !scrim.contains(ev.target)) panel.focus({ preventScroll: true });
  };
  scrim.addEventListener('pointerdown', (ev) => {
    if (ev.target === scrim && closable) close();
  });
  closeBtn?.addEventListener('click', close);
  window.addEventListener('keydown', onKey, true);
  document.addEventListener('focusin', onFocusIn);

  root.appendChild(scrim);
  openEntries.add(entry);
  panel.focus({ preventScroll: true });
  return { el: scrim, body, close };
}

// ───────────── 提示浮层 ─────────────

let tipEl: HTMLDivElement | null = null;
let tipOwner: HTMLElement | null = null;
let tipTimer = 0;
let tipDocBound = false;

/**
 * 鼠标最近一次真实事件(移动 / 按下)的位置。元素自己出现在静止的光标底下时，浏览器也会补发 pointerenter
 * (例如开局那一刻，道具栏正好落在刚点过的「开始对战」按钮的位置)——这种不是玩家移上去的「悬停」不该弹提示。
 * 补发的事件坐标与上一次真实事件相同，据此分辨。模块加载时挂一次，全程只有这两个监听。
 */
let mouseX = NaN;
let mouseY = NaN;
if (typeof window !== 'undefined') {
  const track = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse') return;
    mouseX = ev.clientX;
    mouseY = ev.clientY;
  };
  window.addEventListener('pointermove', track, { capture: true, passive: true });
  window.addEventListener('pointerdown', track, { capture: true, passive: true });
}

/** 全局只挂一个监听：点到提示目标以外的地方就收起（触控时没有 pointerleave 可依赖） */
function bindTipDismiss(): void {
  if (tipDocBound) return;
  tipDocBound = true;
  document.addEventListener(
    'pointerdown',
    (ev) => {
      if (tipOwner && ev.target instanceof Node && !tipOwner.contains(ev.target)) hideTip();
    },
    true,
  );
}

function hideTip(): void {
  window.clearTimeout(tipTimer);
  tipOwner = null;
  if (tipEl) tipEl.classList.remove('is-open');
}

function showTip(target: HTMLElement, content: string | Node): void {
  if (!target.isConnected) return;
  // 挂到最近的 .sf-root 下（全屏元素模式下 body 直属子节点不可见）
  const host = target.closest<HTMLElement>('.sf-root') ?? document.body;
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'sf-tip';
    tipEl.setAttribute('role', 'tooltip');
  }
  if (tipEl.parentElement !== host) host.appendChild(tipEl);
  tipEl.textContent = '';
  if (typeof content === 'string') tipEl.innerHTML = content;
  else tipEl.appendChild(content);
  tipOwner = target;

  // 先放到左上角量尺寸，再贴着目标摆放并夹在视口内
  tipEl.style.transform = 'none';
  tipEl.style.left = '0px';
  tipEl.style.top = '0px';
  const tr = target.getBoundingClientRect();
  const w = tipEl.offsetWidth;
  const hgt = tipEl.offsetHeight;
  const gap = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = tr.left + tr.width / 2 - w / 2;
  x = Math.max(8, Math.min(vw - w - 8, x));
  let y = tr.top - hgt - gap;
  if (y < 8) y = Math.min(vh - hgt - 8, tr.bottom + gap);
  tipEl.style.left = `${Math.round(x)}px`;
  tipEl.style.top = `${Math.round(Math.max(8, y))}px`;
  tipEl.style.transform = '';
  // 强制回流后再加类，保证过渡生效
  void tipEl.offsetWidth;
  tipEl.classList.add('is-open');
}

export interface TooltipOptions {
  /**
   * 触控行为：'tap' = 点按即显示（控件本身没有别的点击行为时用）；
   * 'longpress' = 长按约 0.35 秒显示（控件点击另有用途时用）。默认 'tap'。
   */
  touch?: 'tap' | 'longpress';
}

/**
 * 给元素挂提示浮层。鼠标：悬停显示；键盘：聚焦显示；触控：点按或长按显示，再点别处/数秒后消失。
 * content 惰性求值。返回解除函数。
 */
export function attachTooltip(target: HTMLElement, content: () => string | Node, o: TooltipOptions = {}): () => void {
  const touchMode = o.touch ?? 'tap';
  let pressTimer = 0;
  let downX = 0;
  let downY = 0;

  /** 光标没动、是元素自己出现在它底下：先不弹，等鼠标真的动了再弹 */
  let waitMove = false;

  const open = (): void => showTip(target, content());
  const onEnter = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse') return;
    if (ev.clientX === mouseX && ev.clientY === mouseY) waitMove = true;
    else open();
  };
  const onLeave = (ev: PointerEvent): void => {
    waitMove = false;
    if (ev.pointerType === 'mouse' && tipOwner === target) hideTip();
  };
  const autoHide = (): void => {
    window.clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => {
      if (tipOwner === target) hideTip();
    }, 4200);
  };
  const onDown = (ev: PointerEvent): void => {
    if (ev.pointerType === 'mouse') return;
    downX = ev.clientX;
    downY = ev.clientY;
    window.clearTimeout(pressTimer);
    if (touchMode === 'longpress') {
      pressTimer = window.setTimeout(() => {
        open();
        autoHide();
      }, 350);
    }
  };
  const onMove = (ev: PointerEvent): void => {
    if (ev.pointerType === 'mouse') {
      if (waitMove) {
        waitMove = false;
        open();
      }
      return;
    }
    if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 10) window.clearTimeout(pressTimer);
  };
  const onUp = (ev: PointerEvent): void => {
    if (ev.pointerType === 'mouse') return;
    window.clearTimeout(pressTimer);
    if (touchMode === 'tap' && Math.hypot(ev.clientX - downX, ev.clientY - downY) <= 10) {
      if (tipOwner === target) hideTip();
      else {
        open();
        autoHide();
      }
    }
  };
  const onCancel = (): void => window.clearTimeout(pressTimer);
  const onFocus = (): void => {
    if (focusVisible(target)) open();
  };
  const onBlur = (): void => {
    if (tipOwner === target) hideTip();
  };
  bindTipDismiss();

  target.addEventListener('pointerenter', onEnter);
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onCancel);
  target.addEventListener('focus', onFocus);
  target.addEventListener('blur', onBlur);

  return () => {
    window.clearTimeout(pressTimer);
    if (tipOwner === target) hideTip();
    target.removeEventListener('pointerenter', onEnter);
    target.removeEventListener('pointerleave', onLeave);
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);
    target.removeEventListener('pointercancel', onCancel);
    target.removeEventListener('focus', onFocus);
    target.removeEventListener('blur', onBlur);
  };
}

/** 立即收起当前提示浮层（切屏/销毁界面时调用） */
export function dismissTooltip(): void {
  hideTip();
}

/**
 * 以编程方式在 target 旁显示提示浮层：给手势自定义的控件用（如 HUD 技能键的长按——它的按下/拖动另有含义，
 * 不能直接套 attachTooltip）。autoHideMs > 0 时到时自动收起；点到 target 以外同样会收起。
 */
export function showTooltip(target: HTMLElement, content: string | Node, autoHideMs = 0): void {
  bindTipDismiss();
  window.clearTimeout(tipTimer);
  showTip(target, content);
  if (autoHideMs > 0) {
    tipTimer = window.setTimeout(() => {
      if (tipOwner === target) hideTip();
    }, autoHideMs);
  }
}

/** 当前提示浮层是否挂在 target 上（用于「再点一次收起」之类的切换） */
export function isTooltipOpenFor(target: HTMLElement): boolean {
  return tipOwner === target && !!tipEl && tipEl.classList.contains('is-open');
}

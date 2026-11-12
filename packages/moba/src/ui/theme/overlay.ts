/**
 * 浮层：对话框与提示浮层(tooltip)。
 */
import { append, h, icon } from './dom';
import type { Child } from './dom';

const CLOSE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// ───────────── 对话框 ─────────────

let openDialogs = 0;

/** 是否有对话框打开（各界面的全局快捷键据此让路） */
export function hasOpenDialog(): boolean {
  return openDialogs > 0;
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
  const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

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

  const close = (): void => {
    if (closed) return;
    closed = true;
    openDialogs = Math.max(0, openDialogs - 1);
    window.removeEventListener('keydown', onKey, true);
    scrim.classList.add('is-leaving');
    window.setTimeout(() => scrim.remove(), 180);
    if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true });
    o.onClose?.();
  };
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape' || !closable) return;
    // 捕获阶段拦截，避免底下的界面同时响应 Esc
    ev.stopPropagation();
    ev.preventDefault();
    close();
  };
  scrim.addEventListener('pointerdown', (ev) => {
    if (ev.target === scrim && closable) close();
  });
  closeBtn?.addEventListener('click', close);
  window.addEventListener('keydown', onKey, true);

  openDialogs++;
  root.appendChild(scrim);
  panel.focus({ preventScroll: true });
  return { el: scrim, body, close };
}

// ───────────── 提示浮层 ─────────────

let tipEl: HTMLDivElement | null = null;
let tipOwner: HTMLElement | null = null;
let tipTimer = 0;

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

  const open = (): void => showTip(target, content());
  const onEnter = (ev: PointerEvent): void => {
    if (ev.pointerType === 'mouse') open();
  };
  const onLeave = (ev: PointerEvent): void => {
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
    if (ev.pointerType === 'mouse') return;
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
    if (target.matches(':focus-visible')) open();
  };
  const onBlur = (): void => {
    if (tipOwner === target) hideTip();
  };
  // 触控时点到别处收起
  const onDocDown = (ev: PointerEvent): void => {
    if (tipOwner === target && ev.target instanceof Node && !target.contains(ev.target)) hideTip();
  };

  target.addEventListener('pointerenter', onEnter);
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onCancel);
  target.addEventListener('focus', onFocus);
  target.addEventListener('blur', onBlur);
  document.addEventListener('pointerdown', onDocDown, true);

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
    document.removeEventListener('pointerdown', onDocDown, true);
  };
}

/** 立即收起当前提示浮层（切屏/销毁界面时调用） */
export function dismissTooltip(): void {
  hideTip();
}

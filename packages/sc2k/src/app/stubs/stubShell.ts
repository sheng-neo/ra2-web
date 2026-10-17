// ===== app/stubs/stubShell.ts =====（CONTRACTS §V UiEntry.mountShell 的 WP0 桩；WP12 的 src/ui 接手）
// 最小 DOM 外壳：顶栏显示日期 / 资金 + 5 个速度按钮（派发 setSpeed）+ "新建城市"按钮（→ showTitle，由 boot 监听 root 上的 'sc2k:showTitle' 事件弹出标题页）
// + 在画布上拖拽平移（改 ViewState.centerX/Y 后 renderer.setView）。文案一律经 strings 表键（ui.* / speed.* / month.*），不写死。
import type { ShellHandle, ShellOptions, WindowId } from '../../contracts/shell';
import type { ViewState } from '../../contracts/render';
import { ZOOM_TABLE } from '../../contracts/render';
import type { Speed } from '../../contracts/state';
import { dateOf } from '../../contracts/state';
import type { ToolId } from '../../contracts/catalogue';

export const SHOW_TITLE_EVENT = 'sc2k:showTitle';
const SPEEDS: readonly Speed[] = [1, 2, 3, 4, 5];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 屏幕像素位移 → 世界地块位移（忽略海拔；旋转 r 次的逆变换：向量 (rx,ry) 每步 → (−ry, rx)）。 */
export function panDelta(view: ViewState, dx: number, dy: number): [number, number] {
  const S = ZOOM_TABLE[view.zoom].tileW / 2;
  let vx = (dx / S + dy / (S / 2)) / 2;
  let vy = (dy / (S / 2) - dx / S) / 2;
  for (let k = 0; k < view.rotation; k++) { const t = vx; vx = -vy; vy = t; }
  return [vx, vy];
}

export function mountShell(opts: ShellOptions): ShellHandle {
  const { root, host, renderer, strings } = opts;
  const t = (k: string): string => strings.t(k);

  const bar = el('div', 'sc2k-stub-bar');
  bar.dataset['testid'] = 'stub-shell';
  Object.assign(bar.style, {
    position: 'absolute', left: '0', top: '0', right: '0', height: '32px', display: 'flex', alignItems: 'center', gap: '8px',
    padding: '0 8px', background: 'var(--bevel-face)', color: '#000', borderBottom: '2px solid var(--bevel-shadow)', fontSize: '13px', zIndex: '10', userSelect: 'none',
  } as Partial<CSSStyleDeclaration>);
  const dateEl = el('span', 'sc2k-date'); dateEl.dataset['testid'] = 'date';
  const fundsEl = el('span', 'sc2k-funds'); fundsEl.dataset['testid'] = 'funds';
  bar.append(dateEl, fundsEl);

  const speedBtns: HTMLButtonElement[] = [];
  for (const sp of SPEEDS) {
    const b = el('button', 'sc2k-speed', t(`speed.${sp}`));
    b.type = 'button';
    b.dataset['speed'] = String(sp);
    b.dataset['testid'] = `speed-${sp}`;
    b.addEventListener('click', () => { host.dispatch({ type: 'setSpeed', speed: sp }); refresh(); });
    speedBtns.push(b);
    bar.appendChild(b);
  }
  const spacer = el('span'); spacer.style.flex = '1'; bar.appendChild(spacer);
  const newCityBtn = el('button', 'sc2k-newcity', t('ui.newCity'));
  newCityBtn.type = 'button';
  newCityBtn.dataset['testid'] = 'show-title';
  newCityBtn.addEventListener('click', () => handle.showTitle());
  bar.appendChild(newCityBtn);
  root.appendChild(bar);

  const refresh = (): void => {
    const s = host.state;
    const d = dateOf(s.clock);
    dateEl.textContent = `${t('ui.date')}: ${d.year} ${t(`month.${d.month}`)} ${d.day + 1}`;
    fundsEl.textContent = `${t('ui.funds')}: ${s.economy.funds}`;
    for (const b of speedBtns) b.style.fontWeight = Number(b.dataset['speed']) === s.clock.speed ? 'bold' : 'normal';
  };
  refresh();
  const timer = window.setInterval(refresh, 200);

  // ---- 拖拽平移（只响应画布上的指针） ----
  let dragging: { id: number; x: number; y: number; view: ViewState } | null = null;
  const onDown = (e: PointerEvent): void => {
    if (!(e.target instanceof HTMLCanvasElement)) return;
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, view: renderer.getView() };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const [vx, vy] = panDelta(dragging.view, e.clientX - dragging.x, e.clientY - dragging.y);
    const v = renderer.getView();
    v.centerX = Math.max(0, Math.min(127, dragging.view.centerX - vx));
    v.centerY = Math.max(0, Math.min(127, dragging.view.centerY - vy));
    renderer.setView(v);
  };
  const onUp = (e: PointerEvent): void => { if (dragging && e.pointerId === dragging.id) dragging = null; };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);

  const handle: ShellHandle = {
    destroy: () => {
      window.clearInterval(timer);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      bar.remove();
    },
    openWindow: (_id: WindowId) => { /* 桩：无窗口系统 */ },
    closeWindow: (_id: WindowId) => { /* 桩：无窗口系统 */ },
    setTool: (_tool: ToolId | null) => { /* 桩：无工具栏 */ },
    showTitle: () => { root.dispatchEvent(new CustomEvent(SHOW_TITLE_EVENT)); },
  };
  return handle;
}

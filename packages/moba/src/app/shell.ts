/**
 * 应用外壳的 DOM 小件：启动占位的淡出、对局容器样式、界面内提示层(错误 / 图形中断 / 不支持 WebGL2)。
 *
 * 提示层故意不依赖界面层的设计系统：主题样式注入失败、或错误就出在界面层时，它仍然要能显示出来。
 * 目标宿主里 alert / confirm / prompt 无效，所有提示都走这里。
 */

const STYLE_ID = 'starfall-app-style';

const FONT = '"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei",system-ui,sans-serif';

const CSS = `
.app-match { position: absolute; inset: 0; overflow: hidden; isolation: isolate; background: #070a14; }
.app-stage { position: absolute; inset: 0; overflow: hidden; transition: filter 0.6s linear; }
.app-stage.is-gray { filter: grayscale(0.92) brightness(0.8); }

.app-layer {
  position: absolute; inset: 0; z-index: 900; display: grid; place-items: center; box-sizing: border-box;
  padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
  font-family: ${FONT}; font-size: 14px; line-height: 1.6; color: #eaf0ff;
  background: rgba(3, 6, 16, 0.78); overflow: auto; -webkit-user-select: none; user-select: none;
  animation: app-layer-in 0.25s ease-out both;
}
.app-layer--page { background: radial-gradient(120% 90% at 50% 0%, #16264f 0%, #0a1128 46%, #050814 100%); }
.app-layer * { box-sizing: border-box; }
@keyframes app-layer-in { from { opacity: 0; } to { opacity: 1; } }
.app-card {
  position: relative; width: min(100%, 460px); padding: 22px 24px 20px; border-radius: 10px;
  background: linear-gradient(180deg, rgba(20, 34, 72, 0.96), rgba(10, 17, 40, 0.97));
  box-shadow: 0 0 0 1px rgba(224, 177, 96, 0.55), 0 0 0 4px rgba(8, 13, 31, 0.6), 0 18px 48px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(143, 233, 255, 0.16);
  text-align: center; animation: app-card-in 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}
@keyframes app-card-in { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: none; } }
.app-card__mark { display: block; width: 56px; height: 56px; margin: 0 auto 6px; filter: drop-shadow(0 0 8px rgba(255, 214, 130, 0.55)); }
.app-card--error .app-card__mark { filter: drop-shadow(0 0 8px rgba(255, 110, 110, 0.5)); }
.app-card__title {
  margin: 0 0 8px; font-size: 20px; font-weight: 800; letter-spacing: 0.16em; margin-right: -0.16em; color: #ffe7ad;
  background: linear-gradient(180deg, #fffbe9 0%, #f3cf85 55%, #b98434 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
}
.app-card--error .app-card__title { background-image: linear-gradient(180deg, #fff1ec 0%, #ff9d8a 55%, #c2473f 100%); }
.app-card__text { margin: 0 0 6px; color: #b3c1e0; }
.app-card__list { margin: 8px 0 4px; padding: 10px 14px 10px 30px; text-align: left; color: #b3c1e0; background: rgba(5, 8, 20, 0.5); border-radius: 6px; }
.app-card__list li { margin: 2px 0; }
.app-card__detail {
  margin: 10px 0 0; padding: 8px 10px; max-height: 96px; overflow: auto; text-align: left; white-space: pre-wrap; word-break: break-all;
  font: 12px/1.5 ui-monospace, Menlo, Consolas, monospace; color: #9fb0d0; background: rgba(5, 8, 20, 0.6); border-radius: 6px;
  -webkit-user-select: text; user-select: text;
}
.app-card__btns { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 16px; }
.app-btn {
  min-width: 124px; min-height: 42px; padding: 0 20px; border: 0; border-radius: 6px; cursor: pointer;
  font: inherit; font-weight: 700; letter-spacing: 0.12em; color: #eaf0ff; background: rgba(40, 64, 124, 0.7);
  box-shadow: inset 0 0 0 1px rgba(143, 233, 255, 0.35); touch-action: manipulation; -webkit-tap-highlight-color: transparent;
  transition: filter 0.12s linear, transform 0.08s linear;
}
.app-btn:hover { filter: brightness(1.15); }
.app-btn:active { transform: translateY(1px) scale(0.98); }
.app-btn:focus-visible { outline: 2px solid #8fe9ff; outline-offset: 2px; }
.app-btn--primary { color: #2a1a04; background: linear-gradient(180deg, #ffe7ad, #e0b160 60%, #c08c3c); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 0 14px rgba(255, 214, 130, 0.35); }
`;

/** 原创星徽(四芒星 + 倾斜星轨)，提示层与不支持页共用 */
const MARK_SVG =
  '<svg class="app-card__mark" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="app-mk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe9"/><stop offset=".55" stop-color="#f3cf85"/><stop offset="1" stop-color="#a8742c"/></linearGradient></defs>' +
  '<ellipse cx="32" cy="34" rx="26" ry="9" fill="none" stroke="#8fe9ff" stroke-opacity=".7" stroke-width="1.6" transform="rotate(-18 32 34)"/>' +
  '<path d="M32 4Q34.6 26.4 58 32Q34.6 37.6 32 60Q29.4 37.6 6 32Q29.4 26.4 32 4Z" fill="url(#app-mk)"/><circle cx="32" cy="32" r="4" fill="#fffdf2"/></svg>';

export function injectAppStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

/** 淡出并移除 index.html 里的纯 CSS 启动占位 */
export function hideBootSplash(): void {
  (window as Window & { __mobaBooted?: boolean }).__mobaBooted = true;
  const boot = document.getElementById('boot');
  if (!boot || boot.classList.contains('is-done')) return;
  boot.classList.add('is-done');
  window.setTimeout(() => boot.remove(), 600);
}

/** 探测 WebGL2：建一个临时上下文，用完立刻归还(浏览器对同时存在的上下文数量有上限) */
export function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export interface LayerButton {
  label: string;
  primary?: boolean;
  onClick(): void;
}

export interface LayerOptions {
  title: string;
  /** 正文段落 */
  lines: string[];
  /** 列表项(排查建议等) */
  list?: string[];
  /** 技术细节(错误信息)，等宽小字、可选中复制 */
  detail?: string;
  tone?: 'info' | 'error';
  /** 整页样式(不透明背景)，用于无法进入游戏的场合 */
  page?: boolean;
  buttons: LayerButton[];
}

export interface Layer {
  readonly el: HTMLElement;
  /** 追加一行技术细节(同一提示层期间又出了新错误时用) */
  addDetail(text: string): void;
  close(): void;
}

/** 在 parent 上盖一个提示层。按钮点击后先关闭提示层再回调 */
export function showLayer(parent: HTMLElement, o: LayerOptions): Layer {
  injectAppStyle();
  const el = document.createElement('div');
  el.className = `app-layer${o.page ? ' app-layer--page' : ''}`;
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', o.title);

  const card = document.createElement('div');
  card.className = `app-card${o.tone === 'error' ? ' app-card--error' : ''}`;
  card.innerHTML = MARK_SVG;

  const title = document.createElement('h2');
  title.className = 'app-card__title';
  title.textContent = o.title;
  card.appendChild(title);

  for (const line of o.lines) {
    const p = document.createElement('p');
    p.className = 'app-card__text';
    p.textContent = line;
    card.appendChild(p);
  }
  if (o.list && o.list.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'app-card__list';
    for (const item of o.list) {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    }
    card.appendChild(ul);
  }

  let detail: HTMLPreElement | null = null;
  const addDetail = (text: string): void => {
    if (!detail) {
      detail = document.createElement('pre');
      detail.className = 'app-card__detail';
      card.insertBefore(detail, btns);
    }
    // 只留最近的几条，避免错误风暴把提示层撑爆
    const lines = detail.textContent ? detail.textContent.split('\n') : [];
    lines.push(text);
    detail.textContent = lines.slice(-6).join('\n');
  };

  const btns = document.createElement('div');
  btns.className = 'app-card__btns';
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    el.remove();
  };
  let primary: HTMLButtonElement | null = null;
  for (const b of o.buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `app-btn${b.primary ? ' app-btn--primary' : ''}`;
    btn.textContent = b.label;
    btn.addEventListener('click', () => {
      close();
      b.onClick();
    });
    btns.appendChild(btn);
    if (b.primary && !primary) primary = btn;
  }
  card.appendChild(btns);
  if (o.detail) addDetail(o.detail);

  // 提示层打开期间，键盘与指针事件不应漏到底下的对局
  const swallow = (ev: Event): void => ev.stopPropagation();
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'wheel', 'contextmenu', 'keydown', 'keyup']) {
    el.addEventListener(type, swallow);
  }

  el.appendChild(card);
  parent.appendChild(el);
  primary?.focus({ preventScroll: true });
  return { el, addDetail, close };
}

/** 把任意抛出物整理成一行可读文字 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message ? `${err.name}: ${err.message}` : err.name;
  if (typeof err === 'string') return err;
  try {
    const s = JSON.stringify(err);
    return typeof s === 'string' ? s : String(err);
  } catch {
    return String(err);
  }
}

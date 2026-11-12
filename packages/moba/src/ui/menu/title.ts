/**
 * 标题页：原创 Logo（金属渐变字 + 坠星划痕 + 星芒）与三个入口按钮。
 */
import type { MenuHost } from '../api';
import { uiIcon } from '../icons';
import { openSettingsDialog } from '../settings';
import { createButton, h, hasOpenDialog, injectStyle, sfCss, svgDataUri } from '../theme';
import { openHowToDialog } from './howto';

export interface MenuScreen {
  el: HTMLElement;
  /** 开始退场：立刻停止响应输入（此时界面还在播退场动画） */
  freeze(): void;
  /** 退场动画结束后调用：释放事件、计时器、3D 预览等 */
  dispose(): void;
}

export interface TitleOptions {
  host: MenuHost;
  /** .sf-root 容器：对话框挂在它下面 */
  root: HTMLElement;
  onStart(): void;
}

const STAR_HEAD = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".3" stop-color="#ffe7ad" stop-opacity=".5"/><stop offset="1" stop-color="#ffd682" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#g)"/><path d="M32 2Q34 30 62 32Q34 34 32 62Q30 34 2 32Q30 30 32 2Z" fill="#fff"/><path d="M32 16Q33.500 30.500 48 32Q33.500 33.500 32 48Q30.500 33.500 16 32Q30.500 30.500 32 16Z" fill="#fff6d8" transform="rotate(45 32 32)"/></svg>',
);

/** Logo 顶部的星徽：四芒星 + 一圈倾斜的星轨 */
const EMBLEM =
  '<svg viewBox="0 0 120 60" aria-hidden="true"><defs><linearGradient id="sfl-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe9"/><stop offset=".55" stop-color="#f3cf85"/><stop offset="1" stop-color="#a8742c"/></linearGradient><radialGradient id="sfl-b"><stop offset="0" stop-color="#ffe7ad" stop-opacity=".7"/><stop offset="1" stop-color="#ffe7ad" stop-opacity="0"/></radialGradient></defs>' +
  '<circle cx="60" cy="30" r="26" fill="url(#sfl-b)"/>' +
  '<ellipse cx="60" cy="31" rx="34" ry="9" transform="rotate(-14 60 31)" fill="none" stroke="#8fe9ff" stroke-width="1" opacity=".75"/>' +
  '<path d="M60 3Q62.600 27.400 87 30Q62.600 32.600 60 57Q57.400 32.600 33 30Q57.400 27.400 60 3Z" fill="url(#sfl-a)" stroke="#5a3e18" stroke-width=".8"/>' +
  '<path d="M60 17Q61.200 28.800 73 30Q61.200 31.200 60 43Q58.800 31.200 47 30Q58.800 28.800 60 17Z" fill="#fffdf2"/>' +
  '<circle cx="27.500" cy="38.800" r="2.200" fill="#c9f6ff"/><circle cx="93" cy="23" r="1.500" fill="#c9f6ff"/></svg>';

const CSS = sfCss(`
.sf-title { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1.5fr) auto minmax(0, 1fr) auto; justify-items: center; padding: max(16u, var(--sf-safe-t)) max(24u, var(--sf-safe-r)) max(12u, var(--sf-safe-b)) max(24u, var(--sf-safe-l)); }
.sf-title__logo { grid-row: 1; align-self: end; display: flex; flex-direction: column; align-items: center; padding-bottom: 22u; }

.sf-logo { position: relative; display: flex; flex-direction: column; align-items: center; isolation: isolate; }
.sf-logo__emblem { width: max(84px, 132u); margin-bottom: -6u; animation: sf-drop-in 0.8s 0.05s var(--sf-ease-out) both; }
.sf-logo__emblem svg { display: block; width: 100%; height: auto; animation: sf-logo-breathe 3.6s ease-in-out infinite; }
.sf-logo__name {
  position: relative; display: flex; margin: 0; font-weight: 900; line-height: 1.12; white-space: nowrap;
  font-size: max(50px, min(124u, 19.5vw));
  filter: drop-shadow(0 max(1px, 2u) 0 #6b4614) drop-shadow(0 max(2px, 5u) 0 rgba(24, 12, 0, 0.75)) drop-shadow(0 0 30u rgba(255, 200, 110, 0.32));
}
.sf-logo__name span {
  display: block; padding: 0 0.055em;
  background:
    linear-gradient(105deg, rgba(255, 255, 255, 0) 42%, rgba(255, 255, 255, 0.95) 50%, rgba(255, 255, 255, 0) 58%) no-repeat 200% 0 / 300% 100%,
    linear-gradient(180deg, #fffdf2 0%, #ffeab5 26%, #eebb5e 50%, #a26d26 57%, #e9c074 72%, #fff3cf 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent;
  -webkit-text-stroke: max(0.6px, 1u) rgba(255, 246, 216, 0.35);
  animation: sf-logo-char 0.9s var(--sf-ease-out) both, sf-logo-sheen 6s 1.6s ease-in-out infinite;
}
.sf-logo__name span:nth-child(1) { animation-delay: 0.25s, 1.6s; }
.sf-logo__name span:nth-child(2) { animation-delay: 0.36s, 1.72s; }
.sf-logo__name span:nth-child(3) { animation-delay: 0.47s, 1.84s; }
.sf-logo__name span:nth-child(4) { animation-delay: 0.58s, 1.96s; }
@keyframes sf-logo-char { from { opacity: 0; transform: translateY(26u) scale(1.18); } 60% { opacity: 1; } to { opacity: 1; transform: none; } }
@keyframes sf-logo-sheen { 0% { background-position: 200% 0, 0 0; } 18%, 100% { background-position: -100% 0, 0 0; } }
@keyframes sf-logo-breathe { 0%, 100% { filter: drop-shadow(0 0 6u rgba(255, 214, 130, 0.5)); transform: scale(1); } 50% { filter: drop-shadow(0 0 16u rgba(255, 214, 130, 0.95)); transform: scale(1.04); } }

/* 坠星划痕：自右上斜贯到左下，星头落在「星」字旁 */
.sf-logo__streak { position: absolute; left: -15%; top: 60%; width: 132%; height: 0; z-index: -1; transform: rotate(-13deg); pointer-events: none; }
.sf-logo__streak::before {
  content: ''; position: absolute; left: 0; right: 0; top: -22u; height: 44u; transform-origin: 100% 50%;
  background:
    linear-gradient(90deg, #ffffff 0%, rgba(255, 240, 200, 0.95) 5%, rgba(255, 214, 130, 0.5) 30%, rgba(255, 214, 130, 0) 92%) no-repeat 0 50% / 100% max(2px, 3u),
    linear-gradient(90deg, rgba(255, 226, 160, 0.3) 0%, rgba(143, 233, 255, 0.1) 45%, rgba(143, 233, 255, 0) 85%) no-repeat 0 50% / 100% 100%;
  -webkit-mask: linear-gradient(180deg, transparent, #000 46%, #000 54%, transparent);
  mask: linear-gradient(180deg, transparent, #000 46%, #000 54%, transparent);
  animation: sf-logo-streak 1s 0.1s var(--sf-ease-out) both;
}
.sf-logo__streak::after {
  content: ''; position: absolute; left: -34u; top: -34u; width: 68u; height: 68u;
  background-repeat: no-repeat; background-position: center; background-size: contain;
  animation: sf-logo-head 0.7s 0.95s var(--sf-ease-spring) both, sf-logo-glint 2.8s 1.7s ease-in-out infinite;
}
@keyframes sf-logo-streak { from { transform: scaleX(0); opacity: 0; } 30% { opacity: 1; } to { transform: none; opacity: 1; } }
@keyframes sf-logo-glint { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.82); opacity: 0.8; } }
@keyframes sf-logo-head { from { opacity: 0; transform: scale(0.2); } to { opacity: 1; transform: none; } }

.sf-logo__sub { display: flex; align-items: center; justify-content: center; gap: 16u; width: 100%; margin-top: 6u; animation: sf-rise-in 0.8s 0.85s var(--sf-ease-out) both; }
.sf-logo__sub b {
  font-family: var(--sf-font-num); font-weight: 600; font-size: max(15px, 27u); line-height: 1; letter-spacing: 0.72em; margin-right: -0.72em; padding-left: 0.1em;
  background: linear-gradient(180deg, #ffffff, #c9f6ff 45%, #5cd6f7); -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 10u rgba(92, 214, 247, 0.55));
}
.sf-logo__sub i { position: relative; flex: 0 1 max(40px, 92u); min-width: 12u; height: 1px; background: linear-gradient(90deg, rgba(232, 199, 122, 0), var(--sf-c-gold-300)); }
.sf-logo__sub i:last-child { transform: scaleX(-1); }
.sf-logo__sub i::after { content: ''; position: absolute; right: -3u; top: 50%; width: 6u; height: 6u; margin-top: -3u; transform: rotate(45deg); background: var(--sf-c-gold-200); box-shadow: 0 0 6u rgba(255, 214, 130, 0.8); }
.sf-logo__tag { margin: 16u 0 0; font-size: var(--sf-fs-sm); letter-spacing: 0.34em; color: var(--sf-c-text-2); text-align: center; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8); animation: sf-rise-in 0.8s 1s var(--sf-ease-out) both; }

.sf-title__menu { grid-row: 2; display: flex; flex-direction: column; align-items: stretch; gap: 12u; width: min(100%, max(260px, 330u)); animation: sf-rise-in 0.7s 1.05s var(--sf-ease-out) both; }
.sf-title__row { display: grid; grid-template-columns: 1fr 1fr; gap: 12u; }
.sf-title__foot { grid-row: 4; display: flex; align-items: center; justify-content: center; gap: 10u; margin: 0; font-size: var(--sf-fs-xs); letter-spacing: 0.14em; color: var(--sf-c-text-3); text-align: center; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9); animation: sf-fade-in 1s 1.4s linear both; }
.sf-title__foot i { width: 3px; height: 3px; border-radius: 50%; background: var(--sf-c-text-4); }

/* 矮屏（横屏手机）：Logo 收紧一些，按钮排成一行 */
@media (max-height: 480px) and (orientation: landscape) {
  .sf-title { grid-template-rows: minmax(0, 1.25fr) auto minmax(0, 0.5fr) auto; }
  .sf-title__logo { padding-bottom: 14u; }
  .sf-logo__name { font-size: max(46px, min(104u, 19.5vw)); }
  .sf-logo__emblem { width: max(64px, 96u); }
  .sf-logo__tag { margin-top: 10u; }
  .sf-title__menu { flex-direction: row; width: min(100%, max(520px, 700u)); }
  .sf-title__menu > .sf-btn { flex: 1.25; }
  .sf-title__row { flex: 2; }
}
@media (orientation: portrait) {
  .sf-title { grid-template-rows: minmax(0, 1.25fr) auto minmax(0, 1fr) auto; }
  .sf-logo__tag { letter-spacing: 0.2em; }
  .sf-title__foot { flex-direction: column; gap: 3u; }
  .sf-title__foot i { display: none; }
}
`);

const DECOR = `.sf-logo__streak::after { background-image: ${STAR_HEAD}; }`;

export function createTitleScreen(o: TitleOptions): MenuScreen {
  injectStyle('sf-menu-title', CSS + DECOR);

  const name = h('h1', 'sf-logo__name', ...'星陨战纪'.split('').map((c) => h('span', null, c)));
  name.setAttribute('aria-label', '星陨战纪');
  const emblem = h('div', 'sf-logo__emblem');
  emblem.innerHTML = EMBLEM;
  const logo = h(
    'div',
    'sf-logo',
    h('div', 'sf-logo__streak'),
    emblem,
    name,
    h('div', 'sf-logo__sub', h('i'), h('b', null, 'STARFALL'), h('i')),
    h('p', 'sf-logo__tag', '原创 5v5 星陨对决'),
  );

  const start = createButton({ label: '开始对战', variant: 'primary', size: 'lg', pulse: true, sound: 'confirm', onClick: () => o.onStart() });
  const howto = createButton({ label: '操作说明', icon: uiIcon('keyboard'), onClick: () => openHowToDialog(o.root) });
  const settings = createButton({
    label: '设置',
    icon: uiIcon('settings'),
    onClick: () => openSettingsDialog(o.root, { get: () => o.host.getSettings(), update: (p) => o.host.updateSettings(p), audio: o.host.audio, mode: 'menu' }),
  });

  const el = h(
    'div',
    'sf-screen sf-title',
    h('div', 'sf-title__logo', logo),
    h('nav', 'sf-title__menu', start, h('div', 'sf-title__row', howto, settings)),
    h('p', 'sf-title__foot', h('span', null, '1 名玩家 + 9 名 AI'), h('i'), h('span', null, '全部美术与音效均为程序化生成'), h('i'), h('span', null, 'v0.1')),
  );

  let frozen = false;
  const onKey = (ev: KeyboardEvent): void => {
    if (frozen || hasOpenDialog() || ev.repeat) return;
    // 焦点在某个按钮上时，回车/空格交给按钮自己
    if (document.activeElement instanceof HTMLButtonElement && el.contains(document.activeElement)) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      o.host.audio.ui('confirm');
      o.onStart();
    }
  };
  window.addEventListener('keydown', onKey);

  return {
    el,
    freeze: () => {
      frozen = true;
    },
    dispose: () => window.removeEventListener('keydown', onKey),
  };
}

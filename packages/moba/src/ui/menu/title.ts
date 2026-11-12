/**
 * 标题页：原创 Logo（金属渐变字 + 坠星划痕 + 星芒）与三个入口按钮；「开始对战」下面一行「新手引导」复选。
 * 复选直接读写 Settings.tutorial：存储不可用的宿主里每次刷新都会回到默认(开)，老玩家在这里一点就关。
 */
import type { MenuHost } from '../api';
import { assistOn, setAssist } from '../hud/assist';
import { uiIcon } from '../icons';
import { openSettingsDialog } from '../settings';
import { createButton, h, hasOpenDialog, icon, injectStyle, isButtonKeyFocused, sfCss, svgDataUri } from '../theme';
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
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g"><stop offset="0" stop-color="#fffdf2"/><stop offset=".16" stop-color="#ffeab5" stop-opacity=".85"/><stop offset=".45" stop-color="#ffd682" stop-opacity=".28"/><stop offset="1" stop-color="#ffd682" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#g)"/><path d="M32 0Q33.200 30.800 64 32Q33.200 33.200 32 64Q30.800 33.200 0 32Q30.800 30.800 32 0Z" fill="#fff"/><circle cx="32" cy="32" r="4.500" fill="#fff"/></svg>',
);

/** Logo 顶部的星徽：四芒星 + 一圈倾斜的星轨 */
const EMBLEM =
  '<svg viewBox="0 0 120 60" aria-hidden="true"><defs><linearGradient id="sfl-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe9"/><stop offset=".55" stop-color="#f3cf85"/><stop offset="1" stop-color="#a8742c"/></linearGradient><radialGradient id="sfl-b"><stop offset="0" stop-color="#ffe7ad" stop-opacity=".7"/><stop offset="1" stop-color="#ffe7ad" stop-opacity="0"/></radialGradient></defs>' +
  '<circle cx="60" cy="30" r="26" fill="url(#sfl-b)"/>' +
  '<ellipse cx="60" cy="31" rx="34" ry="9" transform="rotate(-14 60 31)" fill="none" stroke="#8fe9ff" stroke-width="1" opacity=".75"/>' +
  '<path d="M60 3Q62.600 27.400 87 30Q62.600 32.600 60 57Q57.400 32.600 33 30Q57.400 27.400 60 3Z" fill="url(#sfl-a)" stroke="#5a3e18" stroke-width=".8"/>' +
  '<path d="M60 17Q61.200 28.800 73 30Q61.200 31.200 60 43Q58.800 31.200 47 30Q58.800 28.800 60 17Z" fill="#fffdf2"/>' +
  '<circle cx="27.500" cy="38.800" r="2.200" fill="#c9f6ff"/><circle cx="93" cy="23" r="1.500" fill="#c9f6ff"/></svg>';

// 屏幕根类名用 sf-home：.sf-title 已被设计系统的标题字占用
const CSS = sfCss(`
.sf-home { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1.5fr) auto minmax(0, 1fr) auto; justify-items: center; padding: max(16u, var(--sf-safe-t)) max(24u, var(--sf-safe-r)) max(12u, var(--sf-safe-b)) max(24u, var(--sf-safe-l)); }
.sf-home__logo { grid-row: 1; align-self: end; display: flex; flex-direction: column; align-items: center; padding-bottom: 22u; }

.sf-logo { position: relative; display: flex; flex-direction: column; align-items: center; isolation: isolate; }
.sf-logo__emblem { width: max(84px, 132u); margin-bottom: -6u; animation: sf-drop-in 0.8s 0.05s var(--sf-ease-out) both; }
.sf-logo__emblem svg { display: block; width: 100%; height: auto; filter: drop-shadow(0 0 8u rgba(255, 214, 130, 0.7)); animation: sf-logo-breathe 3.6s ease-in-out infinite; }
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
@keyframes sf-logo-breathe { 0%, 100% { opacity: 0.86; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }

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
  content: ''; position: absolute; left: -42u; top: -42u; width: 84u; height: 84u;
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

.sf-home__menu { grid-row: 2; display: flex; flex-direction: column; align-items: stretch; gap: 12u; width: min(100%, max(260px, 330u)); animation: sf-rise-in 0.7s 1.05s var(--sf-ease-out) both; }
.sf-home__row { display: grid; grid-template-columns: 1fr 1fr; gap: 12u; }
/* 「开始对战」+ 它下面的新手引导复选 */
.sf-home__start { display: flex; flex-direction: column; align-items: stretch; gap: 7u; }
.sf-home__guide {
  display: inline-flex; align-items: center; justify-content: center; gap: 7u; align-self: center; min-height: max(30px, 32u); margin: 0; padding: 2u 10u; border: 0; border-radius: 99px; background: none; cursor: pointer;
  font: inherit; font-size: var(--sf-fs-sm); font-weight: 700; line-height: 1.2; color: var(--sf-c-text); text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85); white-space: nowrap;
}
.sf-home__guide small { font-size: var(--sf-fs-xs); font-weight: 500; color: var(--sf-c-text-3); }
.sf-home__guide-box { flex: none; display: grid; place-items: center; width: max(17px, 19u); height: max(17px, 19u); border-radius: 4u; color: transparent; background: rgba(8, 13, 31, 0.7); box-shadow: inset 0 0 0 max(1.5px, 1.5u) rgba(150, 178, 235, 0.7); transition: background 0.12s linear, box-shadow 0.12s linear; }
.sf-home__guide-box .sf-i { width: 82%; height: 82%; vertical-align: 0; }
.sf-home__guide[aria-checked="true"] .sf-home__guide-box { color: #2b1a04; background: linear-gradient(180deg, #fff4d6, #e0b160); box-shadow: inset 0 0 0 1px #6b4614, 0 0 8u rgba(255, 214, 130, 0.6); }
@media (hover: hover) { .sf-home__guide:hover { background: rgba(150, 178, 235, 0.12); } }
.sf-home__guide:focus-visible { outline: 2px solid var(--sf-c-cyan-300); outline-offset: 2px; }
.sf-home__guide:active { transform: scale(0.97); }
.sf-home__foot { grid-row: 4; display: flex; align-items: center; justify-content: center; gap: 10u; margin: 0; font-size: var(--sf-fs-xs); letter-spacing: 0.14em; color: var(--sf-c-text-3); text-align: center; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9); animation: sf-fade-in 1s 1.4s linear both; }
.sf-home__foot i { width: 3px; height: 3px; border-radius: 50%; background: var(--sf-c-text-4); }

/* 矮屏（横屏手机）：Logo 收紧一些，按钮排成一行 */
@media (max-height: 480px) and (orientation: landscape) {
  .sf-home { grid-template-rows: minmax(0, 1.25fr) auto minmax(0, 0.5fr) auto; }
  .sf-home__logo { padding-bottom: 14u; }
  .sf-logo__name { font-size: max(46px, min(104u, 19.5vw)); }
  .sf-logo__emblem { width: max(64px, 96u); }
  .sf-logo__tag { margin-top: 10u; }
  .sf-home__menu { flex-direction: row; align-items: flex-start; width: min(100%, max(520px, 700u)); }
  .sf-home__start { flex: 1.25; gap: 3u; }
  .sf-home__guide { min-height: max(26px, 28u); }
  .sf-home__row { flex: 2; }
}
@media (orientation: portrait) {
  .sf-home { grid-template-rows: minmax(0, 1.25fr) auto minmax(0, 1fr) auto; }
  .sf-logo__tag { letter-spacing: 0.2em; }
  .sf-home__foot { flex-direction: column; gap: 3u; }
  .sf-home__foot i { display: none; }
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
    h('p', 'sf-logo__tag', '坠星召来历代英杰 · 5v5 对决'),
  );

  const start = createButton({ label: '开始对战', variant: 'primary', size: 'lg', pulse: true, sound: 'confirm', onClick: () => o.onStart() });

  // 新手引导复选：读写 Settings.tutorial(缺省开)
  const guide = h('button', 'sf-home__guide', h('i', 'sf-home__guide-box', icon(uiIcon('check'))), h('span', null, '新手引导'), h('small', null, '(第一次玩建议打开)'));
  guide.type = 'button';
  guide.setAttribute('role', 'checkbox');
  const syncGuide = (): void => guide.setAttribute('aria-checked', assistOn(o.host.getSettings(), 'tutorial') ? 'true' : 'false');
  syncGuide();
  guide.addEventListener('click', () => {
    setAssist(o.host, 'tutorial', !assistOn(o.host.getSettings(), 'tutorial'));
    o.host.audio.ui('click');
    syncGuide();
  });

  const howto = createButton({ label: '操作说明', icon: uiIcon('keyboard'), onClick: () => openHowToDialog(o.root) });
  const settings = createButton({
    label: '设置',
    icon: uiIcon('settings'),
    onClick: () =>
      openSettingsDialog(o.root, {
        get: () => o.host.getSettings(),
        update: (p) => {
          o.host.updateSettings(p);
          // 设置面板里也有同一个开关：改了这边跟着变
          syncGuide();
        },
        audio: o.host.audio,
        mode: 'menu',
      }),
  });

  const el = h(
    'div',
    'sf-screen sf-home',
    h('div', 'sf-home__logo', logo),
    h('nav', 'sf-home__menu', h('div', 'sf-home__start', start, guide), h('div', 'sf-home__row', howto, settings)),
    h('p', 'sf-home__foot', h('span', null, '1 名玩家 + 9 名 AI'), h('i'), h('span', null, '全部美术与音效均为程序化生成'), h('i'), h('span', null, 'v0.1')),
  );

  let frozen = false;
  const onKey = (ev: KeyboardEvent): void => {
    if (frozen || hasOpenDialog() || ev.repeat) return;
    // 键盘聚焦在某个按钮上时，回车/空格交给按钮自己
    if (isButtonKeyFocused(el)) return;
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

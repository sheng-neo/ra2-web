/**
 * 通用组件样式。类名统一 `sf-` 前缀；状态类用 `is-*`。
 * 视觉语言：深海军蓝半透明面板 + 细金色「星轨」描边(两个对角亮、沿边渐隐) + 青色高光；
 * 可点击的主体控件用两对角切角的造型。
 */
import { sfCss, svgDataUri } from './css';

const STAR4 = (fill: string): string =>
  svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 0Q8.8 7.2 16 8Q8.8 8.8 8 16Q7.2 8.8 0 8Q7.2 7.2 8 0Z" fill="${fill}"/></svg>`,
  );

// data URI 在 sfCss 之后再拼入，避免其中的字符被误当成 u 单位
const BODY = sfCss(`
/* ───────────── 根容器 ───────────── */
.sf-root {
  position: absolute; inset: 0; overflow: hidden;
  font-family: var(--sf-font); font-size: var(--sf-fs-md); line-height: 1.5; color: var(--sf-c-text);
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
}
.sf-root *, .sf-root *::before, .sf-root *::after { box-sizing: border-box; }
.sf-root button, .sf-root input { font-family: inherit; }
.sf-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.sf-root :focus { outline: none; }
.sf-root :focus-visible { outline: 2px solid var(--sf-c-cyan-300); outline-offset: 2px; }
.sf-root img { -webkit-user-drag: none; }

.sf-num { font-family: var(--sf-font-num); font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
.sf-dim { color: var(--sf-c-text-3); }
.sf-gold { color: var(--sf-c-gold-200); }
.sf-cyan { color: var(--sf-c-cyan-300); }
.sf-hidden { display: none !important; }

/* 内联 SVG 图标 */
.sf-ico { display: block; width: 100%; height: 100%; }
.sf-i { display: inline-block; width: 1.25em; height: 1.25em; flex: none; vertical-align: -0.24em; }
.sf-i > svg { display: block; width: 100%; height: 100%; }

/* ───────────── 滚动区 ───────────── */
.sf-scroll {
  overflow: hidden auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-y;
  scrollbar-width: thin; scrollbar-color: rgba(224, 177, 96, 0.45) transparent;
}
.sf-scroll::-webkit-scrollbar { width: max(4px, 5u); height: max(4px, 5u); }
.sf-scroll::-webkit-scrollbar-thumb { background: rgba(224, 177, 96, 0.45); border-radius: 99px; }
.sf-scroll::-webkit-scrollbar-track { background: transparent; }

/* ───────────── 面板 ───────────── */
.sf-panel {
  position: relative; border-radius: var(--sf-r-md);
  background: var(--sf-bg-panel);
  box-shadow: var(--sf-shadow-2), inset 0 1px 0 rgba(143, 233, 255, 0.14);
}
/* 金色星轨描边：左上、右下两角最亮，沿边缘渐隐 */
.sf-panel::before {
  content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1px; pointer-events: none;
  background: conic-gradient(from 315deg at 50% 50%,
    rgba(255, 231, 173, 0.95) 0deg, rgba(224, 177, 96, 0.34) 38deg, rgba(160, 180, 230, 0.16) 110deg,
    rgba(224, 177, 96, 0.3) 150deg, rgba(255, 231, 173, 0.8) 180deg, rgba(224, 177, 96, 0.3) 212deg,
    rgba(160, 180, 230, 0.16) 250deg, rgba(224, 177, 96, 0.34) 322deg, rgba(255, 231, 173, 0.95) 360deg);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
}
/* 角上的四芒星 + 顶边一道青色高光 */
.sf-panel::after {
  content: ''; position: absolute; inset: -7u; pointer-events: none;
  background-repeat: no-repeat;
  background-position: left 1u top 1u, right 3u bottom 3u, center top calc(7u + 1px);
  background-size: 15u 15u, 10u 10u, 56% 1px;
}
.sf-panel--plain::after { display: none; }
.sf-panel--flat { box-shadow: inset 0 1px 0 rgba(143, 233, 255, 0.1); }
/* 内嵌小面板：更暗、无装饰，用于面板里的分组 */
.sf-inset {
  border-radius: var(--sf-r-sm); background: var(--sf-bg-inset);
  box-shadow: inset 0 0 0 1px var(--sf-c-line);
}

/* ───────────── 标题字 ───────────── */
.sf-metal {
  background: var(--sf-grad-gold-text); -webkit-background-clip: text; background-clip: text;
  color: transparent; -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 1u 0 rgba(70, 40, 8, 0.9)) drop-shadow(0 3u 8u rgba(0, 0, 0, 0.55));
}
.sf-metal--steel { background-image: var(--sf-grad-steel-text); filter: drop-shadow(0 1u 0 rgba(10, 16, 40, 0.9)) drop-shadow(0 3u 8u rgba(0, 0, 0, 0.55)); }
.sf-title { margin: 0; font-weight: 800; font-size: var(--sf-fs-2xl); line-height: 1.15; letter-spacing: 0.16em; }
.sf-subtitle { margin: 0; font-weight: 700; font-size: var(--sf-fs-xl); line-height: 1.2; letter-spacing: 0.1em; }

/* 分节小标题：菱形 + 渐隐星轨线 */
.sf-heading {
  display: flex; align-items: center; gap: 8u; margin: 0;
  font-weight: 700; font-size: var(--sf-fs-sm); line-height: 1.2; letter-spacing: 0.2em; color: var(--sf-c-gold-300);
}
.sf-heading::before {
  content: ''; flex: none; width: max(5px, 6u); height: max(5px, 6u); transform: rotate(45deg);
  background: var(--sf-grad-gold); box-shadow: 0 0 6u rgba(255, 214, 130, 0.7);
}
.sf-heading::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--sf-c-gold-line), rgba(232, 199, 122, 0)); }

.sf-divider { height: 1px; border: 0; margin: 0; background: linear-gradient(90deg, rgba(150, 178, 235, 0), var(--sf-c-line-strong) 20%, var(--sf-c-line-strong) 80%, rgba(150, 178, 235, 0)); }

/* ───────────── 按钮 ───────────── */
.sf-btn {
  --sf-btn-h: max(40px, 46u); --sf-btn-cut: var(--sf-cut);
  --sf-btn-edge: linear-gradient(180deg, rgba(255, 231, 173, 0.95), rgba(192, 140, 60, 0.5));
  --sf-btn-fill: linear-gradient(180deg, #20356c, #0d1836 70%, #0a1128);
  position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; gap: 8u;
  min-height: var(--sf-btn-h); min-width: var(--sf-btn-h); padding: 0 24u; margin: 0; border: 0; background: none;
  color: var(--sf-c-gold-200); font-weight: 700; font-size: var(--sf-fs-lg); line-height: 1; letter-spacing: 0.14em;
  white-space: nowrap; cursor: pointer;
  transition: transform var(--sf-t-fast) var(--sf-ease-out), filter var(--sf-t-fast) linear;
}
.sf-btn::before, .sf-btn::after {
  content: ''; position: absolute; z-index: -1; pointer-events: none;
  clip-path: polygon(var(--sf-btn-cut) 0, 100% 0, 100% calc(100% - var(--sf-btn-cut)), calc(100% - var(--sf-btn-cut)) 100%, 0 100%, 0 var(--sf-btn-cut));
}
.sf-btn::before { inset: 0; background: var(--sf-btn-edge); }
.sf-btn::after {
  inset: 1px;
  background:
    linear-gradient(105deg, rgba(255, 255, 255, 0) 42%, rgba(255, 255, 255, 0.5) 50%, rgba(255, 255, 255, 0) 58%) no-repeat 160% 0 / 250% 100%,
    linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 46%),
    var(--sf-btn-fill);
  transition: background-position 0s;
}
.sf-btn > * { position: relative; }
.sf-btn .sf-i { width: 1.2em; height: 1.2em; margin-left: -0.1em; }
@media (hover: hover) {
  .sf-btn:hover { filter: brightness(1.14) drop-shadow(0 0 8u rgba(255, 214, 130, 0.35)); }
  .sf-btn:hover::after { background-position: -60% 0, 0 0, 0 0; transition: background-position 0.55s var(--sf-ease-out); }
}
.sf-btn:active { transform: translateY(1.5u) scale(0.985); filter: brightness(0.88); }
.sf-btn:disabled, .sf-btn.is-disabled { filter: grayscale(0.9) brightness(0.72); opacity: 0.6; pointer-events: none; cursor: default; }

.sf-btn--primary {
  --sf-btn-edge: linear-gradient(180deg, #fffbe9, #7a5220);
  --sf-btn-fill: var(--sf-grad-gold);
  color: #2b1a04; text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
}
@media (hover: hover) { .sf-btn--primary:hover { filter: brightness(1.08) drop-shadow(0 0 12u rgba(255, 214, 130, 0.6)); } }
.sf-btn--ghost {
  --sf-btn-edge: linear-gradient(180deg, rgba(150, 178, 235, 0.5), rgba(150, 178, 235, 0.22));
  --sf-btn-fill: linear-gradient(180deg, rgba(22, 36, 76, 0.92), rgba(10, 17, 40, 0.92));
  color: var(--sf-c-text-2);
}
.sf-btn--danger {
  --sf-btn-edge: linear-gradient(180deg, #ffc3b5, #6e1820);
  --sf-btn-fill: linear-gradient(180deg, #f27262, #c23b40 55%, #8f2331);
  color: #fff5f0; text-shadow: 0 1px 0 rgba(80, 10, 16, 0.6);
}
.sf-btn--sm { --sf-btn-h: max(36px, 36u); --sf-btn-cut: 6u; padding: 0 14u; font-size: var(--sf-fs-sm); letter-spacing: 0.08em; }
.sf-btn--lg { --sf-btn-h: max(48px, 60u); --sf-btn-cut: 13u; padding: 0 40u; font-size: max(17px, 23u); font-weight: 800; letter-spacing: 0.28em; }
.sf-btn--block { display: flex; width: 100%; }
/* 主按钮呼吸光：用于每屏唯一的主行动。只动 opacity（合成层动画），不逐帧重算滤镜 */
.sf-btn__glow {
  position: absolute; inset: -12u -16u; z-index: -2; pointer-events: none; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 214, 130, 0.75), rgba(255, 214, 130, 0.28) 55%, rgba(255, 214, 130, 0));
  animation: sf-btn-pulse 2.4s ease-in-out infinite;
}
@keyframes sf-btn-pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }

/* 图标按钮 */
.sf-iconbtn {
  position: relative; display: inline-grid; place-items: center; flex: none;
  width: var(--sf-hit); height: var(--sf-hit); padding: 0; margin: 0; cursor: pointer;
  border: 0; border-radius: 9u; color: var(--sf-c-gold-200);
  background: linear-gradient(180deg, rgba(32, 53, 108, 0.9), rgba(10, 17, 40, 0.92));
  box-shadow: inset 0 0 0 1px var(--sf-c-gold-line), inset 0 1px 0 1px rgba(143, 233, 255, 0.12), var(--sf-shadow-1);
  transition: transform var(--sf-t-fast) var(--sf-ease-out), filter var(--sf-t-fast) linear, color var(--sf-t-fast) linear;
}
.sf-iconbtn > .sf-i { width: 52%; height: 52%; }
@media (hover: hover) { .sf-iconbtn:hover { filter: brightness(1.25); color: var(--sf-c-gold-100); } }
.sf-iconbtn:active { transform: scale(0.94); filter: brightness(0.88); }
.sf-iconbtn:disabled { opacity: 0.45; pointer-events: none; }
.sf-iconbtn--quiet { background: none; box-shadow: none; color: var(--sf-c-text-2); }

/* 文字链接式按钮 */
.sf-link {
  display: inline-flex; align-items: center; gap: 6u; min-height: max(32px, 32u); padding: 0 6u; margin: 0; border: 0; background: none; cursor: pointer;
  color: var(--sf-c-text-3); font-size: var(--sf-fs-sm); letter-spacing: 0.06em;
  transition: color var(--sf-t-fast) linear;
}
@media (hover: hover) { .sf-link:hover { color: var(--sf-c-cyan-300); } }
.sf-link:active { color: var(--sf-c-cyan-200); }

/* ───────────── 分段选择 ───────────── */
.sf-seg {
  display: inline-grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3u; padding: 3u;
  border-radius: 8u; background: var(--sf-bg-inset); box-shadow: inset 0 0 0 1px var(--sf-c-line-strong);
}
.sf-seg--block { display: grid; width: 100%; }
.sf-seg__opt {
  position: relative; min-height: max(34px, 36u); padding: 0 16u; margin: 0; border: 0; border-radius: 6u; cursor: pointer;
  background: transparent; color: var(--sf-c-text-3); font-weight: 700; font-size: var(--sf-fs-md); letter-spacing: 0.1em; white-space: nowrap;
  transition: color var(--sf-t-fast) linear, background var(--sf-t-fast) linear;
}
@media (hover: hover) { .sf-seg__opt:hover { color: var(--sf-c-text); background: var(--sf-bg-raise); } }
.sf-seg__opt.is-active {
  color: #2b1a04; background: var(--sf-grad-gold); text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65), inset 0 0 0 1px rgba(122, 82, 32, 0.6), 0 2u 10u rgba(255, 200, 100, 0.28);
}

/* ───────────── 标签页 ───────────── */
.sf-tabs { display: flex; gap: 2u; box-shadow: inset 0 -1px 0 var(--sf-c-line-strong); }
.sf-tab {
  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 6u;
  min-height: var(--sf-hit); padding: 0 18u; margin: 0; border: 0; background: none; cursor: pointer;
  color: var(--sf-c-text-3); font-weight: 700; font-size: var(--sf-fs-md); letter-spacing: 0.12em; white-space: nowrap;
  transition: color var(--sf-t-fast) linear;
}
@media (hover: hover) { .sf-tab:hover { color: var(--sf-c-text); } }
.sf-tab::after {
  content: ''; position: absolute; left: 10u; right: 10u; bottom: 0; height: 2px; opacity: 0; transform: scaleX(0.3);
  background: linear-gradient(90deg, rgba(243, 207, 133, 0), var(--sf-c-gold-200), rgba(243, 207, 133, 0));
  transition: opacity var(--sf-t-mid) linear, transform var(--sf-t-mid) var(--sf-ease-out);
}
.sf-tab::before {
  content: ''; position: absolute; left: 50%; bottom: -3u; width: 7u; height: 7u; margin-left: -3.5u; opacity: 0;
  transform: rotate(45deg) scale(0.4); background: var(--sf-c-gold-200); box-shadow: 0 0 8u rgba(255, 214, 130, 0.9);
  transition: opacity var(--sf-t-mid) linear, transform var(--sf-t-mid) var(--sf-ease-spring);
}
.sf-tab.is-active { color: var(--sf-c-gold-200); }
.sf-tab.is-active::after { opacity: 1; transform: none; }
.sf-tab.is-active::before { opacity: 1; transform: rotate(45deg); }

/* ───────────── 滑块 ───────────── */
.sf-slider {
  --sf-fill: 50%; --sf-sl-track: max(5px, 6u); --sf-sl-thumb: max(20px, 22u);
  -webkit-appearance: none; appearance: none; display: block; width: 100%; height: max(36px, 40u); margin: 0; padding: 0;
  background: transparent; cursor: pointer; touch-action: pan-y;
}
.sf-slider::-webkit-slider-runnable-track {
  height: var(--sf-sl-track); border-radius: 99px;
  background: linear-gradient(90deg, var(--sf-c-cyan-600), var(--sf-c-cyan-300)) no-repeat 0 0 / var(--sf-fill) 100%, rgba(4, 8, 22, 0.7);
  box-shadow: 0 0 0 1px var(--sf-c-line-strong);
}
.sf-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: var(--sf-sl-thumb); height: var(--sf-sl-thumb);
  margin-top: calc((var(--sf-sl-track) - var(--sf-sl-thumb)) / 2); border: 0; border-radius: 50%;
  background: radial-gradient(circle at 36% 30%, #fffbe9, #f3cf85 46%, #a8742c);
  box-shadow: 0 0 0 2px rgba(8, 14, 34, 0.95), 0 0 0 3px var(--sf-c-gold-400), 0 2u 6u rgba(0, 0, 0, 0.55);
  transition: transform var(--sf-t-fast) var(--sf-ease-out);
}
.sf-slider:active::-webkit-slider-thumb { transform: scale(1.14); }
.sf-slider::-moz-range-track { height: var(--sf-sl-track); border-radius: 99px; background: rgba(4, 8, 22, 0.7); box-shadow: 0 0 0 1px var(--sf-c-line-strong); }
.sf-slider::-moz-range-progress { height: var(--sf-sl-track); border-radius: 99px; background: linear-gradient(90deg, var(--sf-c-cyan-600), var(--sf-c-cyan-300)); }
.sf-slider::-moz-range-thumb {
  width: var(--sf-sl-thumb); height: var(--sf-sl-thumb); border: 0; border-radius: 50%;
  background: radial-gradient(circle at 36% 30%, #fffbe9, #f3cf85 46%, #a8742c);
  box-shadow: 0 0 0 2px rgba(8, 14, 34, 0.95), 0 0 0 3px var(--sf-c-gold-400), 0 2u 6u rgba(0, 0, 0, 0.55);
}

/* ───────────── 开关 ───────────── */
.sf-toggle {
  --sf-tg-h: max(26px, 28u); --sf-tg-w: max(48px, 52u);
  position: relative; flex: none; width: var(--sf-tg-w); height: var(--sf-tg-h); padding: 0; margin: 0; border: 0; border-radius: 99px; cursor: pointer;
  background: rgba(4, 8, 22, 0.7); box-shadow: inset 0 0 0 1px var(--sf-c-line-strong);
  transition: background var(--sf-t-mid) linear, box-shadow var(--sf-t-mid) linear;
}
.sf-toggle::after {
  content: ''; position: absolute; top: 3px; left: 3px; width: calc(var(--sf-tg-h) - 6px); height: calc(var(--sf-tg-h) - 6px); border-radius: 50%;
  background: radial-gradient(circle at 36% 30%, #c5d3ee, #7f8fb4 55%, #44517a);
  box-shadow: 0 1u 4u rgba(0, 0, 0, 0.5);
  transition: transform var(--sf-t-mid) var(--sf-ease-spring), background var(--sf-t-mid) linear;
}
.sf-toggle[aria-checked='true'] {
  background: linear-gradient(90deg, #14506e, var(--sf-c-cyan-500));
  box-shadow: inset 0 0 0 1px var(--sf-c-cyan-300), 0 0 10u rgba(92, 214, 247, 0.35);
}
.sf-toggle[aria-checked='true']::after {
  transform: translateX(calc(var(--sf-tg-w) - var(--sf-tg-h)));
  background: radial-gradient(circle at 36% 30%, #fffbe9, #f3cf85 46%, #a8742c);
}

/* ───────────── 徽标 ───────────── */
.sf-badge {
  --sf-bd: 224, 177, 96;
  display: inline-flex; align-items: center; gap: 4u; flex: none; height: max(18px, 20u); padding: 0 7u; border-radius: 3u;
  font-weight: 700; font-size: var(--sf-fs-xs); line-height: 1; letter-spacing: 0.08em; white-space: nowrap;
  color: rgb(var(--sf-bd)); background: rgba(var(--sf-bd), 0.14); box-shadow: inset 0 0 0 1px rgba(var(--sf-bd), 0.5);
}
.sf-badge .sf-i { width: 1.1em; height: 1.1em; }
.sf-badge--cyan { --sf-bd: 143, 233, 255; }
.sf-badge--blue { --sf-bd: 110, 180, 255; }
.sf-badge--red { --sf-bd: 255, 120, 120; }
.sf-badge--green { --sf-bd: 111, 227, 161; }
.sf-badge--violet { --sf-bd: 190, 160, 255; }
.sf-badge--mute { --sf-bd: 150, 165, 200; }
.sf-badge--solid { color: #2b1a04; background: var(--sf-grad-gold); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 0 8u rgba(255, 214, 130, 0.4); }
.sf-badge--me { color: #14240a; background: linear-gradient(180deg, #e2ffb0, #9bdc4c); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 0 8u rgba(183, 243, 107, 0.45); }

/* ───────────── 进度条 ───────────── */
.sf-progress {
  --sf-p: 0;
  position: relative; height: max(8px, 10u); border-radius: 99px; background: rgba(4, 8, 22, 0.7);
  box-shadow: inset 0 0 0 1px var(--sf-c-line-strong), 0 0 0 3u rgba(8, 13, 31, 0.5);
}
.sf-progress__fill {
  position: absolute; left: 1px; top: 1px; bottom: 1px; width: calc((100% - 2px) * var(--sf-p)); min-width: max(6px, 8u); border-radius: inherit; overflow: hidden;
  background: linear-gradient(90deg, #1c84b0, #5cd6f7 60%, #fff4d6);
  box-shadow: 0 0 12u rgba(92, 214, 247, 0.55);
  transition: width 0.4s var(--sf-ease-out);
}
.sf-progress__fill::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(100deg, rgba(255, 255, 255, 0) 30%, rgba(255, 255, 255, 0.65) 50%, rgba(255, 255, 255, 0) 70%) 0 0 / 60% 100% no-repeat;
  animation: sf-shimmer 1.6s linear infinite;
}
.sf-progress__spark {
  position: absolute; top: 50%; left: calc((100% - 2px) * var(--sf-p)); width: 26u; height: 26u; margin: -13u 0 0 -13u; pointer-events: none;
  background-repeat: no-repeat; background-position: center; background-size: contain;
  filter: drop-shadow(0 0 6u rgba(255, 244, 214, 0.9));
  transition: left 0.4s var(--sf-ease-out); animation: sf-twinkle 1.2s ease-in-out infinite;
}

/* ───────────── 图标槽 / 头像框 ───────────── */
.sf-slot {
  --sf-slot: 48u;
  position: relative; display: inline-block; flex: none; width: var(--sf-slot); height: var(--sf-slot); padding: 0; margin: 0; border: 0;
  border-radius: 16%; overflow: hidden; background: #0a1128;
  box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(2px, 2u) rgba(224, 177, 96, 0.55), 0 3u 8u rgba(0, 0, 0, 0.5);
}
.sf-slot > svg, .sf-slot > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.sf-slot::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16), inset 0 -8u 12u rgba(0, 0, 0, 0.28);
}
.sf-slot--round { border-radius: 50%; }
.sf-slot--plain { box-shadow: 0 0 0 1px rgba(150, 178, 235, 0.3); }
.sf-slot--empty { background: rgba(4, 8, 22, 0.6); box-shadow: inset 0 0 0 1px var(--sf-c-line-strong); }
.sf-slot--empty::after { box-shadow: none; }
.sf-slot--cyan { box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(2px, 2u) rgba(92, 214, 247, 0.7), 0 3u 8u rgba(0, 0, 0, 0.5); }
button.sf-slot { cursor: pointer; transition: transform var(--sf-t-fast) var(--sf-ease-out), box-shadow var(--sf-t-fast) linear, filter var(--sf-t-fast) linear; }
@media (hover: hover) { button.sf-slot:hover { filter: brightness(1.15); } }
button.sf-slot:active { transform: scale(0.94); }
.sf-slot.is-active { box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(2px, 2.5u) var(--sf-c-gold-100), 0 0 16u rgba(255, 214, 130, 0.75); }

/* ───────────── 英雄头像 / 星级 ───────────── */
.sf-portrait {
  position: relative; display: block; flex: none; overflow: hidden;
  background: radial-gradient(circle at 50% 30%, var(--sf-hero-a, #28407c), var(--sf-hero-b, #0a1128) 92%);
}
.sf-portrait > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.3s linear; }
.sf-portrait.is-loaded > img { opacity: 1; }
.sf-portrait__fallback { position: absolute; left: 50%; top: 50%; width: 54%; height: 54%; transform: translate(-50%, -50%); color: var(--sf-hero-c, #c9f6ff); opacity: 0.92; transition: opacity 0.3s linear; }
.sf-portrait.is-loaded > .sf-portrait__fallback { opacity: 0; }
.sf-stars { display: inline-flex; gap: 1u; color: var(--sf-c-text-4); vertical-align: middle; }
.sf-stars .sf-i { width: 1.05em; height: 1.05em; vertical-align: 0; }
.sf-stars .is-on { color: var(--sf-c-gold-300); filter: drop-shadow(0 0 3u rgba(255, 214, 130, 0.6)); }

/* ───────────── 键帽 ───────────── */
.sf-kbd {
  display: inline-grid; place-items: center; flex: none; min-width: max(22px, 24u); height: max(22px, 24u); padding: 0 6u; border-radius: 5u;
  font-family: var(--sf-font-num); font-weight: 700; font-size: var(--sf-fs-xs); line-height: 1; color: var(--sf-c-text); white-space: nowrap;
  background: linear-gradient(180deg, #2a3f7a, #16244c); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 0 0 1px rgba(150, 178, 235, 0.35), 0 2u 0 #070c1c;
}

/* ───────────── 对话框 ───────────── */
.sf-dialog-scrim {
  position: absolute; inset: 0; z-index: var(--sf-z-dialog); display: grid; place-items: center;
  padding: max(12u, var(--sf-safe-t)) max(12u, var(--sf-safe-r)) max(12u, var(--sf-safe-b)) max(12u, var(--sf-safe-l));
  background: radial-gradient(ellipse at center, rgba(8, 14, 34, 0.7), rgba(3, 6, 16, 0.9));
  animation: sf-fade-in 0.2s linear both;
}
.sf-dialog-scrim.is-leaving { animation: sf-fade-out 0.18s linear both; pointer-events: none; }
.sf-dialog {
  --sf-dialog-w: 560u;
  display: flex; flex-direction: column; width: min(100%, max(300px, var(--sf-dialog-w))); max-height: 100%; min-height: 0;
  animation: sf-pop-in 0.3s var(--sf-ease-out) both;
}
.sf-root .sf-dialog:focus, .sf-root .sf-dialog:focus-visible { outline: none; }
.sf-dialog-scrim.is-leaving .sf-dialog { animation: sf-pop-out 0.18s var(--sf-ease-in) both; }
.sf-dialog__head { display: flex; align-items: center; gap: 12u; flex: none; padding: 12u 12u 10u 24u; box-shadow: inset 0 -1px 0 var(--sf-c-line); }
.sf-dialog__title { flex: 1; margin: 0; font-weight: 800; font-size: var(--sf-fs-xl); line-height: 1.3; letter-spacing: 0.2em; }
.sf-dialog__body { flex: 1; min-height: 0; padding: 16u 24u 20u; }
.sf-dialog__foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12u; flex: none; padding: 14u 24u 18u; box-shadow: inset 0 1px 0 var(--sf-c-line); }

/* ───────────── 提示浮层 ───────────── */
.sf-tip {
  position: fixed; left: 0; top: 0; z-index: var(--sf-z-tooltip); width: max-content; max-width: min(max(230px, 300u), calc(100vw - 16px));
  padding: 10u 13u 11u; border-radius: 7u; pointer-events: none;
  font-family: var(--sf-font); font-size: var(--sf-fs-sm); line-height: 1.55; color: var(--sf-c-text-2); text-align: left; white-space: normal;
  background: linear-gradient(180deg, #16254f, #0a1128);
  box-shadow: 0 0 0 1px var(--sf-c-gold-line), inset 0 1px 0 rgba(143, 233, 255, 0.16), var(--sf-shadow-2);
  opacity: 0; transform: translateY(4u) scale(0.98); transition: opacity 0.12s linear, transform 0.16s var(--sf-ease-out);
}
.sf-tip, .sf-tip * { box-sizing: border-box; }
.sf-tip.is-open { opacity: 1; transform: none; }
.sf-tip__title { display: flex; align-items: baseline; justify-content: space-between; gap: 14u; font-weight: 700; font-size: var(--sf-fs-md); color: var(--sf-c-gold-200); letter-spacing: 0.06em; }
.sf-tip__meta { font-weight: 600; font-size: var(--sf-fs-xs); color: var(--sf-c-text-3); letter-spacing: 0.04em; white-space: nowrap; }
.sf-tip__stats { margin-top: 4u; color: var(--sf-c-cyan-300); }
.sf-tip__passive { margin-top: 6u; padding-top: 6u; box-shadow: inset 0 1px 0 var(--sf-c-line); }
.sf-tip__passive b { color: var(--sf-c-amber); font-weight: 700; }

/* ───────────── 表单行（设置面板等） ───────────── */
.sf-field { display: grid; grid-template-columns: minmax(84u, auto) 1fr; align-items: center; column-gap: 16u; min-height: var(--sf-hit); }
.sf-field__label { display: flex; align-items: center; gap: 8u; font-weight: 600; font-size: var(--sf-fs-md); color: var(--sf-c-text); letter-spacing: 0.08em; white-space: nowrap; }
.sf-field__label .sf-i { color: var(--sf-c-gold-300); }
.sf-field__ctl { display: flex; align-items: center; justify-content: flex-end; gap: 12u; min-width: 0; }
.sf-field__hint { grid-column: 1 / -1; margin: -2u 0 6u; font-size: var(--sf-fs-xs); color: var(--sf-c-text-3); line-height: 1.5; }
.sf-field__val { flex: none; width: 3.2em; text-align: right; font-size: var(--sf-fs-md); color: var(--sf-c-gold-200); }
button.sf-field { width: 100%; padding: 0; margin: 0; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }

/* ───────────── 通用动效 ───────────── */
@keyframes sf-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes sf-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes sf-pop-in { from { opacity: 0; transform: translateY(14u) scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes sf-pop-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(8u) scale(0.97); } }
@keyframes sf-rise-in { from { opacity: 0; transform: translateY(18u); } to { opacity: 1; transform: none; } }
@keyframes sf-drop-in { from { opacity: 0; transform: translateY(-18u); } to { opacity: 1; transform: none; } }
@keyframes sf-left-in { from { opacity: 0; transform: translateX(-28u); } to { opacity: 1; transform: none; } }
@keyframes sf-right-in { from { opacity: 0; transform: translateX(28u); } to { opacity: 1; transform: none; } }
@keyframes sf-shimmer { from { background-position: -80% 0; } to { background-position: 240% 0; } }
@keyframes sf-twinkle { 0%, 100% { opacity: 1; transform: scale(1) rotate(0deg); } 50% { opacity: 0.7; transform: scale(0.78) rotate(45deg); } }
@keyframes sf-spin { to { transform: rotate(360deg); } }

/* 整屏界面的进出场 */
.sf-screen { position: absolute; inset: 0; z-index: var(--sf-z-screen); animation: sf-screen-in 0.42s var(--sf-ease-out) both; }
.sf-screen.is-leaving { animation: sf-screen-out 0.26s var(--sf-ease-in) both; pointer-events: none; }
@keyframes sf-screen-in { from { opacity: 0; transform: scale(1.025); } to { opacity: 1; transform: none; } }
@keyframes sf-screen-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: scale(0.985); } }

@media (prefers-reduced-motion: reduce) {
  .sf-root *, .sf-root *::before, .sf-root *::after { animation-duration: 0.01s !important; animation-iteration-count: 1 !important; transition-duration: 0.01s !important; }
}
`);

const DECOR = `
.sf-panel::after { background-image: ${STAR4('#ffe7ad')}, ${STAR4('#f3cf85')}, linear-gradient(90deg, rgba(143,233,255,0), rgba(143,233,255,0.6), rgba(143,233,255,0)); }
.sf-progress__spark { background-image: ${STAR4('#fff4d6')}; }
`;

export const COMPONENTS_CSS = BODY + DECOR;

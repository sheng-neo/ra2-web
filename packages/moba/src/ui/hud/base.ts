/**
 * HUD 根样式：布局变量、点穿规则、通用小部件（数值牌、键位角标）。
 *
 * 布局变量（各组件共用，输入模块的命中区域也按它们算）：
 *   --hud-l/r/t/b   四边留白（已并入刘海安全区）
 *   --hud-sk        技能键直径：触控按 vmin 取（拇指尺寸，约 14vmin），键鼠按设计单位（只是状态显示）
 *   --hud-cw/ch     右下技能区占用的宽/高（底部状态栏据此避让）
 *   --hud-mini      小地图边长
 */
import { injectStyle, sfCss } from '../theme';

const CSS = sfCss(`
.sf-hud {
  /* 不设 z-index：与宿主里别的界面(加载/结算)按 DOM 顺序叠放；isolation 让内部层级不外溢 */
  isolation: isolate; pointer-events: none; touch-action: none; overscroll-behavior: none;
  --hud-l: max(10u, var(--sf-safe-l)); --hud-r: max(10u, var(--sf-safe-r));
  --hud-t: max(8u, var(--sf-safe-t)); --hud-b: max(6u, var(--sf-safe-b));
  --hud-sk: clamp(46px, 14vmin, 92px);
  --hud-cw: calc(var(--hud-sk) * 3.72 + var(--hud-r));
  --hud-ch: calc(var(--hud-sk) * 3.6 + var(--hud-b));
  --hud-mini: 172u;
  --hud-plate: linear-gradient(180deg, rgba(20, 33, 72, 0.88), rgba(7, 12, 30, 0.92));
  --hud-shadow-text: 0 1px 2px rgba(2, 4, 12, 0.95), 0 0 6u rgba(2, 4, 12, 0.7);
}
.sf-hud--kbm { --hud-sk: clamp(44px, 60u, 132px); }
/* 可交互元素显式恢复点击；其余区域点穿到输入层/战场 */
.sf-hud button, .sf-hud [data-hud-hit], .sf-hud .sf-dialog-scrim { pointer-events: auto; }
.sf-hud [hidden] { display: none !important; }

/* 输入层：铺满全屏的透明面，接住战场上的鼠标/触摸（摇杆、点地移动、点选目标） */
.sf-hud__field { position: absolute; inset: 0; z-index: 1; pointer-events: auto; touch-action: none; cursor: default; }

/* 数值牌：右上 KDA/金币、商店按钮等共用的小底板 */
.sf-hud__chip {
  position: relative; display: inline-flex; align-items: center; gap: 6u; height: max(28px, 32u); padding: 0 11u; border-radius: 7u;
  background: var(--hud-plate); box-shadow: inset 0 0 0 1px rgba(232, 199, 122, 0.3), inset 0 1px 0 1px rgba(143, 233, 255, 0.1), 0 3u 10u rgba(2, 4, 12, 0.45);
  font-size: var(--sf-fs-sm); font-weight: 700; color: var(--sf-c-text); white-space: nowrap; line-height: 1;
}
.sf-hud__chip .sf-i { width: 1.15em; height: 1.15em; color: var(--sf-c-gold-300); vertical-align: 0; }

/* 键位角标（仅键鼠布局显示） */
.sf-hud__key {
  position: absolute; z-index: 3; display: none; place-items: center; min-width: max(17px, 19u); height: max(17px, 19u); padding: 0 4u; border-radius: 4u; pointer-events: none;
  font-family: var(--sf-font-num); font-weight: 800; font-size: max(10px, 11u); line-height: 1; color: var(--sf-c-gold-100); white-space: nowrap;
  background: linear-gradient(180deg, #2a3f7a, #111c3e); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 0 0 1px rgba(232, 199, 122, 0.55), 0 1px 3px rgba(0, 0, 0, 0.6);
}
.sf-hud--kbm .sf-hud__key { display: inline-grid; }

/* 圆头像：击杀播报、记分板、死亡面板共用 */
.sf-hud__face { --sz: 28u; display: block; flex: none; width: var(--sz); height: var(--sz); border-radius: 50%; box-shadow: 0 0 0 max(1.5px, 2u) var(--ring, rgba(232, 199, 122, 0.7)), 0 2u 6u rgba(0, 0, 0, 0.55); }
.sf-hud__face.is-blue { --ring: var(--sf-c-blue); }
.sf-hud__face.is-red { --ring: var(--sf-c-red); }
.sf-hud__face.is-me { --ring: var(--sf-c-me); }
.sf-hud__face.is-dead > img { filter: grayscale(1) brightness(0.6); }
.sf-hud__face--glyph { display: grid; place-items: center; background: radial-gradient(circle at 50% 30%, #2a3f7a, #0a1128); color: var(--ring, var(--sf-c-gold-200)); }
.sf-hud__face--glyph > .sf-i { width: 62%; height: 62%; }
`);

export function injectHudBase(): void {
  injectStyle('sf-hud-base', CSS);
}

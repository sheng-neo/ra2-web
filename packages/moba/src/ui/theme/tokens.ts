/**
 * 设计令牌（CSS 变量）。全部挂在 :root 上并带 `--sf-` 前缀：
 * 提示浮层等挂在 body 下的元素也能取到，且不会与宿主页面的变量冲突。
 */
import { sfCss } from './css';

/** JS 侧也要用到的颜色（canvas 背景、SVG 图标等），与 CSS 变量保持同值 */
export const COLORS = {
  void: '#050814',
  abyss: '#080d1f',
  navy900: '#0a1128',
  navy800: '#0e1836',
  navy700: '#142248',
  navy600: '#1c2f60',
  navy500: '#28407c',
  gold100: '#fff4d6',
  gold200: '#ffe7ad',
  gold300: '#f3cf85',
  gold400: '#e0b160',
  gold500: '#c08c3c',
  gold600: '#8d6226',
  gold700: '#5a3e18',
  cyan200: '#c9f6ff',
  cyan300: '#8fe9ff',
  cyan400: '#5cd6f7',
  cyan500: '#2fb4e0',
  cyan600: '#1c84b0',
  text: '#eaf0ff',
  text2: '#b3c1e0',
  text3: '#7f8fb4',
  text4: '#56648a',
  blue: '#4da3ff',
  blueDeep: '#1e5fc4',
  red: '#ff5d5d',
  redDeep: '#b62a35',
  green: '#6fe3a1',
  amber: '#ffb84d',
  violet: '#b48cff',
  me: '#b7f36b',
} as const;

export const FONT_STACK = '"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei",sans-serif';

export const TOKENS_CSS = sfCss(`
:root {
  /* ── 缩放基准：横屏 1280×720 为 1u = 1px；下限保证小屏手机上控件不至于过小，上限覆盖 4K ── */
  --sf-u: clamp(0.78px, min(calc(100vw / 1280), calc(100vh / 720)), 3.2px);

  /* ── 颜色 ── */
  --sf-c-void: ${COLORS.void};
  --sf-c-abyss: ${COLORS.abyss};
  --sf-c-navy-900: ${COLORS.navy900};
  --sf-c-navy-800: ${COLORS.navy800};
  --sf-c-navy-700: ${COLORS.navy700};
  --sf-c-navy-600: ${COLORS.navy600};
  --sf-c-navy-500: ${COLORS.navy500};
  --sf-c-gold-100: ${COLORS.gold100};
  --sf-c-gold-200: ${COLORS.gold200};
  --sf-c-gold-300: ${COLORS.gold300};
  --sf-c-gold-400: ${COLORS.gold400};
  --sf-c-gold-500: ${COLORS.gold500};
  --sf-c-gold-600: ${COLORS.gold600};
  --sf-c-gold-700: ${COLORS.gold700};
  --sf-c-cyan-200: ${COLORS.cyan200};
  --sf-c-cyan-300: ${COLORS.cyan300};
  --sf-c-cyan-400: ${COLORS.cyan400};
  --sf-c-cyan-500: ${COLORS.cyan500};
  --sf-c-cyan-600: ${COLORS.cyan600};
  --sf-c-text: ${COLORS.text};
  --sf-c-text-2: ${COLORS.text2};
  --sf-c-text-3: ${COLORS.text3};
  --sf-c-text-4: ${COLORS.text4};
  --sf-c-blue: ${COLORS.blue};
  --sf-c-blue-deep: ${COLORS.blueDeep};
  --sf-c-red: ${COLORS.red};
  --sf-c-red-deep: ${COLORS.redDeep};
  --sf-c-green: ${COLORS.green};
  --sf-c-amber: ${COLORS.amber};
  --sf-c-violet: ${COLORS.violet};
  /* 玩家自己：金绿色（与渲染层脚下光环一致） */
  --sf-c-me: ${COLORS.me};
  --sf-c-line: rgba(150, 178, 235, 0.16);
  --sf-c-line-strong: rgba(150, 178, 235, 0.3);
  --sf-c-gold-line: rgba(232, 199, 122, 0.42);
  --sf-c-scrim: rgba(3, 6, 16, 0.72);

  /* 面板底色（深海军蓝半透明） */
  --sf-bg-panel: linear-gradient(180deg, rgba(40, 64, 124, 0.2), rgba(40, 64, 124, 0) 30%), linear-gradient(180deg, rgba(15, 26, 60, 0.9), rgba(8, 14, 34, 0.94));
  --sf-bg-inset: rgba(4, 8, 22, 0.55);
  --sf-bg-raise: rgba(60, 92, 170, 0.14);
  --sf-bg-raise-2: rgba(86, 124, 210, 0.22);

  /* 金属渐变 */
  --sf-grad-gold: linear-gradient(180deg, #fff6d8 0%, #f9dc98 26%, #e2ae55 60%, #b17a2c 100%);
  --sf-grad-gold-text: linear-gradient(180deg, #fffbe9 0%, #ffe9b3 30%, #e7b55b 52%, #a8742c 60%, #f2cf86 80%, #fff3cf 100%);
  --sf-grad-steel-text: linear-gradient(180deg, #f4f8ff 0%, #c5d3ee 34%, #8496bd 54%, #56648a 62%, #a9b9d9 82%, #e3ebfb 100%);
  --sf-grad-cyan: linear-gradient(90deg, #1c84b0, #5cd6f7 60%, #c9f6ff);

  /* ── 字体 ── */
  --sf-font: ${FONT_STACK};
  --sf-font-num: "DIN Alternate", "Bahnschrift", "Roboto Condensed", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  /* 字号：按 u 缩放，但有像素下限（手机上正文不小于 12px） */
  --sf-fs-xs: max(11px, 11u);
  --sf-fs-sm: max(12px, 13u);
  --sf-fs-md: max(13px, 15u);
  --sf-fs-lg: max(14px, 18u);
  --sf-fs-xl: max(17px, 24u);
  --sf-fs-2xl: max(22px, 34u);
  --sf-fs-3xl: max(30px, 52u);

  /* ── 间距 ── */
  --sf-sp-1: 4u;
  --sf-sp-2: 8u;
  --sf-sp-3: 12u;
  --sf-sp-4: 16u;
  --sf-sp-5: 24u;
  --sf-sp-6: 32u;
  --sf-sp-7: 48u;

  /* ── 圆角 ── */
  --sf-r-xs: 3u;
  --sf-r-sm: 6u;
  --sf-r-md: 10u;
  --sf-r-lg: 16u;
  /* 切角按钮的切角大小 */
  --sf-cut: 9u;

  /* ── 阴影 / 辉光 ── */
  --sf-shadow-1: 0 4u 12u rgba(2, 4, 12, 0.45);
  --sf-shadow-2: 0 14u 40u rgba(2, 4, 12, 0.6);
  --sf-glow-gold: 0 0 14u rgba(255, 214, 130, 0.45);
  --sf-glow-cyan: 0 0 14u rgba(92, 214, 247, 0.5);

  /* ── 动效 ── */
  --sf-ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --sf-ease-in: cubic-bezier(0.6, 0, 0.8, 0.2);
  --sf-ease-spring: cubic-bezier(0.3, 1.5, 0.5, 1);
  --sf-t-fast: 0.12s;
  --sf-t-mid: 0.24s;
  --sf-t-slow: 0.5s;

  /* ── 触控目标下限 ── */
  --sf-hit: max(40px, 44u);

  /* ── 安全区 ── */
  --sf-safe-t: env(safe-area-inset-top, 0px);
  --sf-safe-r: env(safe-area-inset-right, 0px);
  --sf-safe-b: env(safe-area-inset-bottom, 0px);
  --sf-safe-l: env(safe-area-inset-left, 0px);

  /* ── 层级 ── */
  --sf-z-screen: 10;
  --sf-z-dialog: 100;
  --sf-z-tooltip: 200;
}
/* 移动浏览器地址栏伸缩时 vh 不准，优先用动态视口高度 */
@supports (height: 1dvh) {
  :root { --sf-u: clamp(0.78px, min(calc(100vw / 1280), calc(100dvh / 720)), 3.2px); }
}
/* 竖屏以 480×860 为基准 */
@media (orientation: portrait) {
  :root { --sf-u: clamp(0.78px, min(calc(100vw / 480), calc(100vh / 860)), 3.2px); }
}
@supports (height: 1dvh) {
  @media (orientation: portrait) {
    :root { --sf-u: clamp(0.78px, min(calc(100vw / 480), calc(100dvh / 860)), 3.2px); }
  }
}
`);

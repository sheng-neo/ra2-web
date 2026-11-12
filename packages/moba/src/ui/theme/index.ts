/**
 * 星陨战纪 · 界面设计系统入口。
 *
 * 用法（菜单与 HUD 通用）：
 *   ensureTheme();                               // 注入令牌 + 组件样式（幂等）
 *   const root = h('div', 'sf-root');            // 所有界面都放在 .sf-root 容器里（字体/配色/盒模型在此生效）
 *   root.append(createButton({ label: '开始', variant: 'primary' }));
 *   injectStyle('my-screen', sfCss(`.x { padding: 12u }`));   // 自己的样式用 u 单位
 *
 * 缩放：`u` 是随视口缩放的设计像素（横屏以 1280×720 为 1u=1px，下限 0.78px、上限 3.2px；竖屏以 480×860 为基准）。
 *       字号用 --sf-fs-xs…3xl（自带像素下限），触控目标用 --sf-hit(≥40px)，安全区用 --sf-safe-t/r/b/l。
 *
 * 类名速查（全部 sf- 前缀，状态类 is-*）：
 *   面板     .sf-panel(金色星轨描边 + 角星) / --plain(无角星) / --flat(无投影)；.sf-inset 内嵌暗底分组
 *   标题字   .sf-metal(金属渐变) / .sf-metal--steel；.sf-title .sf-subtitle；.sf-heading(分节小标题)；.sf-divider
 *   按钮     createButton → .sf-btn / --primary / --ghost / --danger / --sm / --lg / --block；createIconButton → .sf-iconbtn / --quiet；.sf-link
 *   选择     createSegmented → .sf-seg；createTabs → .sf-tabs；createSlider → .sf-slider；createToggle → .sf-toggle
 *   展示     createBadge → .sf-badge--cyan|blue|red|green|violet|mute|solid|me；createProgress → .sf-progress；.sf-kbd 键帽
 *   图标     icon(svg) → .sf-i(1.25em 行内图标)；createSlot(svg) → .sf-slot / --round / --empty / --cyan / .is-active(--sf-slot 定尺寸)
 *   头像     .sf-portrait（见 menu/shared.ts 的 createPortrait）；.sf-stars 星级
 *   表单行   .sf-field > .sf-field__label + .sf-field__ctl (+ .sf-field__hint / __val)
 *   浮层     openDialog(root, …) → .sf-dialog；attachTooltip(el, () => html) → .sf-tip（__title/__meta/__stats/__passive）
 *   其它     .sf-scroll 滚动区；.sf-num 等宽数字；.sf-screen 整屏进出场(.is-leaving)
 *   音效     带 data-sf-snd="click|confirm|back|select|…" 的元素由 bindUiSounds(root, audio) 统一发声（工厂函数已自动加）
 */
import { COMPONENTS_CSS } from './components.css';
import { injectStyle } from './css';
import { TOKENS_CSS } from './tokens';

/** 注入设计令牌与通用组件样式；可重复调用 */
export function ensureTheme(): void {
  injectStyle('sf-theme-tokens', TOKENS_CSS);
  injectStyle('sf-theme-components', COMPONENTS_CSS);
}

export { injectStyle, sfCss, svgDataUri, u } from './css';
export { COLORS, FONT_STACK } from './tokens';
export {
  append, bindUiSounds, clear, createBadge, createButton, createIconButton, createProgress, createSegmented, createSlider, createSlot, createTabs, createToggle, h, icon,
} from './dom';
export type {
  BadgeTone, ButtonOptions, ButtonVariant, Child, IconButtonOptions, Progress, Segmented, SegmentedOptions, Slider, SliderOptions, SlotOptions, Tabs, TabsOptions, Toggle, ToggleOptions,
} from './dom';
export { attachTooltip, dismissTooltip, hasOpenDialog, isButtonKeyFocused, isTooltipOpenFor, openDialog, showTooltip } from './overlay';
export type { Dialog, DialogOptions, TooltipOptions } from './overlay';

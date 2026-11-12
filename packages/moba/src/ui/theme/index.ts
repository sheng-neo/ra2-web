/**
 * 星陨战纪 · 界面设计系统入口。
 *
 * 用法（菜单与 HUD 通用）：
 *   ensureTheme();                               // 注入令牌 + 组件样式（幂等）
 *   const root = h('div', 'sf-root');            // 所有界面都放在 .sf-root 容器里
 *   root.append(createButton({ label: '开始', variant: 'primary' }));
 *   injectStyle('my-screen', sfCss(`.x { padding: 12u }`));   // 自己的样式用 u 单位
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
export { attachTooltip, dismissTooltip, hasOpenDialog, openDialog } from './overlay';
export type { Dialog, DialogOptions, TooltipOptions } from './overlay';

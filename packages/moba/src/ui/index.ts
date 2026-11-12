/**
 * 界面层入口。
 *
 * 本文件目前导出：对局外的全部界面（主菜单 / 加载 / 结算）、设置存取与设置面板、
 * 设计系统（theme）与图标库（icons）。对局内 HUD（createHud）由 HUD 模块在此追加导出。
 */

// ── 对局外界面 ──
export { showMainMenu } from './menu/index';
export type { MainMenuOptions } from './menu/index';
export { showLoading } from './menu/loading';
export { computeScores, showResult } from './menu/result';
export type { HeroScore } from './menu/result';
export { openHowToDialog } from './menu/howto';
export { itemTooltipHtml } from './menu/select';
export { createBackdrop } from './menu/backdrop';
export type { Backdrop, BackdropMood } from './menu/backdrop';
export {
  DIFFICULTY_META, HERO_ORDER, HERO_RATINGS, RATING_KEYS, RATING_LABELS, ROLE_COLOR, createPortrait, createStars, escapeHtml, fmtClock, fmtK,
} from './menu/shared';
export type { PortraitSource, RatingKey } from './menu/shared';

// ── 设置 ──
export { createSettingsPanel, loadSettings, openSettingsDialog, saveSettings } from './settings';
export type { SettingsDialogOptions, SettingsPanel, SettingsPanelOptions } from './settings';

// ── 设计系统与图标 ──
export * from './theme/index';
export * from './icons/index';

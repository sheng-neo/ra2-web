// ===== ui/theme.ts =====（spec:ui-art §1 外壳层；ARCHITECTURE §7.1）
// 主题辅助：引入 theme.css、斜面按钮 / 图标构造器、工具组配色、文案回退（缺键时退到另一个已有键）。
// 图标 v1 为"色块 + 字形"（原创；不读精灵表），v2 换成 UiIconId 精灵。
import './theme.css';
import type { Strings } from '../contracts/strings';
import type { ToolGroup } from '../contracts/catalogue';
import { h } from './dom';

export const SHELL_CLASS = 'sc2k-shell';

/** 工具组配色（原创取值，仅用于按钮色点与子工具图标）。 */
export const GROUP_COLOR: Readonly<Record<ToolGroup, string>> = {
  bulldozer: '#b05a2a', nature: '#2f7d3a', dispatch: '#c02020', power: '#d9a400', water: '#2a7fd0', rewards: '#8a4fb8',
  roads: '#505050', rail: '#6b4a2a', ports: '#2a6b7f', residential: '#3fae3f', commercial: '#3f6fd6', industrial: '#d6b23f',
  education: '#5a7fb0', services: '#7a7a9a', parks: '#4caf50', signs: '#303030', query: '#303030', center: '#303030',
};
/** 工具组字形（ASCII / 通用符号，不用 emoji；窄按钮上一个字符）。 */
export const GROUP_GLYPH: Readonly<Record<ToolGroup, string>> = {
  bulldozer: '⌧', nature: '♣', dispatch: '✚', power: 'ϟ', water: '≈', rewards: '★', roads: '═', rail: '╪', ports: '⚓',
  residential: 'R', commercial: 'C', industrial: 'I', education: 'E', services: 'S', parks: '♠', signs: '¶', query: '?', center: '⌖',
};

/** 斜面按钮。 */
export function button(label: string, opts: { title?: string; cls?: string; onClick?: (e: MouseEvent) => void; testid?: string } = {}): HTMLButtonElement {
  return h('button', {
    class: `sc2k-btn${opts.cls ? ' ' + opts.cls : ''}`, type: 'button', title: opts.title ?? '', text: label,
    dataset: opts.testid ? { testid: opts.testid } : undefined,
    on: opts.onClick ? { click: opts.onClick } : undefined,
  });
}
/** 字形图标（<span class="glyph">）。 */
export function glyph(ch: string, color?: string, sym = false): HTMLSpanElement {
  const s = h('span', { class: `glyph${sym ? ' sym' : ''}`, text: ch });
  if (color) s.style.color = color;
  return s;
}
/** 小色块图标（子工具条）。 */
export function swatch(color: string): HTMLSpanElement {
  const s = h('span', { class: 'ico' });
  s.style.background = color;
  return s;
}

/** 文案回退：主键缺失时依次尝试备选键，最后返回主键名（与 strings.t 的缺键行为一致）。 */
export function tr(strings: Strings, key: string, ...fallbacks: string[]): string {
  if (strings.has(key)) return strings.t(key);
  for (const f of fallbacks) if (strings.has(f)) return strings.t(f);
  return key;
}
/** 是否 CJK 文案（按钮字形取 1 个字 / 2 个字母）。 */
export const isCjk = (s: string): boolean => /[㐀-鿿]/.test(s);
export const shortGlyph = (label: string): string => (isCjk(label) ? label.slice(0, 1) : label.slice(0, 2));

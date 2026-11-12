/**
 * 装备提示浮层的内容：固定四层，自上而下——名字 → 一句大白话(brief) → 属性(统一叫法，数值右对齐) → 被动。
 * 前两层永远在最上面：玩家先看懂「这件是干什么的」，想细看再往下读数值。
 * 状态栏装备格与商店的装备栏共用；返回的是给 attachTooltip 用的 HTML 字符串。
 */
import type { ItemDef } from '../../core/types';
import { escapeHtml } from '../menu/shared';
import { injectStyle, sfCss } from '../theme';
import { statLines } from './text';

const CSS = sfCss(`
.sf-tip__brief { margin-top: 2u; font-size: var(--sf-fs-sm); font-weight: 600; line-height: 1.45; color: var(--sf-c-text); }
.sf-tip__statgrid { display: grid; grid-template-columns: auto auto; justify-content: space-between; gap: 1u 18u; margin-top: 6u; padding-top: 6u; box-shadow: inset 0 1px 0 var(--sf-c-line); }
.sf-tip__statgrid > span { color: var(--sf-c-text-2); }
.sf-tip__statgrid > b { color: var(--sf-c-cyan-300); font-weight: 700; text-align: right; }
.sf-tip__note { margin-top: 6u; font-size: var(--sf-fs-xs); color: var(--sf-c-text-3); }
`);

/**
 * 装备提示的 HTML。note：最底下的一行小字(如「点选可出售」)，可不给。
 * 没有 brief 的装备(老数据)退回三层：名字 → 属性 → 被动。
 */
export function itemTipHtml(item: ItemDef, note?: string): string {
  injectStyle('sf-hud-itemtip', CSS);
  const brief = item.brief ? `<div class="sf-tip__brief">${escapeHtml(item.brief)}</div>` : '';
  const rows = statLines(item.stats)
    .map((r) => `<span>${escapeHtml(r.label)}</span><b class="sf-num">${escapeHtml(r.value)}</b>`)
    .join('');
  const stats = rows ? `<div class="sf-tip__statgrid">${rows}</div>` : '';
  const passive = item.passive ? `<div class="sf-tip__passive"><b>被动 · ${escapeHtml(item.passive.name)}</b>\u3000${escapeHtml(item.passive.desc)}</div>` : '';
  const foot = note ? `<div class="sf-tip__note">${escapeHtml(note)}</div>` : '';
  return `<div class="sf-tip__title"><span>${escapeHtml(item.name)}</span><span class="sf-tip__meta sf-num">${item.cost} 金币</span></div>${brief}${stats}${passive}${foot}`;
}

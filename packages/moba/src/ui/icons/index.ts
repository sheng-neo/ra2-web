/**
 * 图标库入口。全部为程序绘制的内联 SVG 字符串，零外部素材。
 *
 *   skillIcon(heroId, 'passive' | 's1' | 's2' | 'ult')   英雄技能（64×64 满幅徽章，外层用 .sf-slot 裁圆角/圆形）
 *   summonerIcon('recall' | 'heal' | 'flash')            召唤师技能
 *   itemIcon(itemId)                                     装备
 *   buffIcon(buffId) + BUFF_META[buffId]                 增益/减益状态（中文名 + buff/debuff 性质）
 *   anySkillIcon(heroId, slot)                           SkillSlot 通用入口（英雄技能 + 召唤师技能）
 *   uiIcon(name) / roleIcon(role) / laneIcon(lane)       24×24 单色字形（currentColor）；uiIcon('gold') 为彩色金币
 */
import type { HeroId, SkillSlot } from '../../core/types';
import { skillIcon, summonerIcon } from './skills';

export { skillIcon, summonerIcon } from './skills';
export type { HeroIconSlot } from './skills';
export { itemIcon } from './items';
export { BUFF_META, buffIcon } from './buffs';
export type { BuffKind } from './buffs';
export { LANE_NAMES, UI_ICON_NAMES, laneIcon, roleIcon, uiIcon } from './ui';
export type { UiIconName } from './ui';

/** 按 SkillSlot 取图标：s1/s2/ult 走英雄技能，recall/heal/flash 走召唤师技能 */
export function anySkillIcon(heroId: HeroId, slot: SkillSlot): string {
  return slot === 's1' || slot === 's2' || slot === 'ult' ? skillIcon(heroId, slot) : summonerIcon(slot);
}

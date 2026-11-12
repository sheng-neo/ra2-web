/**
 * 增益/减益状态图标（HUD 的 buff 栏用）。与技能/装备同一套 64×64 徽章底板：
 * 通用状态 = 语义色底 + 白色字形；英雄专属状态直接复用对应技能图标，玩家一眼能对上来源。
 */
import type { BuffId } from '../../core/types';
import { skillIcon, summonerIcon } from './skills';
import { badge, darken, glow, glowDef, lighten, star4, starPoly } from './svg';
import { GLYPH_FILL, glyphLine, uiGlyph } from './ui';

export type BuffKind = 'buff' | 'debuff' | 'neutral';

/** 状态的中文名与性质（debuff 建议用红色描边显示） */
export const BUFF_META: Record<BuffId, { name: string; kind: BuffKind }> = {
  stun: { name: '眩晕', kind: 'debuff' },
  airborne: { name: '击飞', kind: 'debuff' },
  root: { name: '定身', kind: 'debuff' },
  slow: { name: '减速', kind: 'debuff' },
  silence: { name: '沉默', kind: 'debuff' },
  shield: { name: '护盾', kind: 'buff' },
  haste: { name: '加速', kind: 'buff' },
  attack_speed: { name: '攻速提升', kind: 'buff' },
  dmg_reduction: { name: '减伤', kind: 'buff' },
  untargetable: { name: '不可选中', kind: 'buff' },
  unstoppable: { name: '免疫控制', kind: 'buff' },
  burn: { name: '灼烧', kind: 'debuff' },
  recall: { name: '回城中', kind: 'neutral' },
  restore: { name: '疗伤中', kind: 'buff' },
  fountain: { name: '泉水回复', kind: 'buff' },
  respawn_guard: { name: '复活保护', kind: 'buff' },
  frost_insight: { name: '蓝buff', kind: 'buff' },
  ember_might: { name: '红buff', kind: 'buff' },
  star_blessing: { name: '巨灵buff', kind: 'buff' },
  // 英雄专属(键名沿用第一阶段)：樊哙 / 程咬金 / 王昭君 / 李广 / 荆轲
  panyue_passive: { name: '覆盾震地', kind: 'buff' },
  panyue_bulwark: { name: '拥盾怒目', kind: 'buff' },
  chijin_ember: { name: '越砍越勇', kind: 'buff' },
  chijin_blaze: { name: '半路杀出 · 攻速', kind: 'buff' },
  chijin_spin: { name: '抡圆了砍', kind: 'buff' },
  xingli_mark: { name: '余音', kind: 'debuff' },
  fengling_gale: { name: '连射', kind: 'buff' },
  fengling_crit: { name: '应弦而倒', kind: 'buff' },
  yeque_shadow: { name: '得手', kind: 'buff' },
  tower_focus: { name: '防御塔锁定', kind: 'debuff' },
};

const F = GLYPH_FILL;
const L = glyphLine;

/** 语义色底 + 白色字形（24 格字形放大两倍居中，底下垫一层深色投影保证对比） */
function glyphBadge(color: string, glyph: string): string {
  return badge(
    [lighten(color, 0.3), darken(color, 0.3), darken(color, 0.82)],
    glowDef('g', lighten(color, 0.55), 0.75),
    glow('g', 32, 30, 27) +
      `<g transform="translate(8.8 10) scale(1.96)" style="color:#060a16" opacity=".5">${glyph}</g>` +
      `<g transform="translate(8 8) scale(2)" style="color:#ffffff">${glyph}</g>`,
  );
}

const FLAME = 'M12.500 1.800c.6 4.200 5.500 5.700 5.500 11.200a6 6 0 0 1-12 0c0-2.600 1.300-4.200 2.700-5.400.1 1.900.9 2.900 1.900 3.100-.2-3.300.3-6.400 1.900-8.900z';
const SNOW = `<path d="M12 2.500v19M3.800 7.200l16.400 9.600M3.800 16.800l16.400-9.600" ${L(2.2)}/><path d="M9.500 4.200L12 6.500l2.500-2.300M9.500 19.800l2.500-2.300 2.500 2.300M4.200 11l3.200-1-.8-3.200M19.800 13l-3.200 1 .8 3.200M4.200 13l3.200 1-.8 3.200M19.800 11l-3.200-1 .8-3.200" ${L(1.6)}/>`;
const SHIELD_FULL = 'M12 2.200l8 3v6.300c0 5-3.400 8.500-8 10.300-4.600-1.800-8-5.300-8-10.300V5.200z';

type Draw = () => string;

const DRAW: Record<BuffId, Draw> = {
  // 眩晕：旋涡与两颗小星
  stun: () =>
    glyphBadge('#c9a227', `<path d="M12 12.500a2 2 0 0 1 4 0a4 4 0 0 1-8 0a6 6 0 0 1 12 0" ${L(2.3)}/><path d="${star4(5.5, 6, 3.4)}" ${F}/><path d="${star4(18.5, 19.5, 2.6)}" ${F}/>`),
  // 击飞：离地上扬
  airborne: () => glyphBadge('#b9832e', `<path d="M12 2.500l7 7.500h-4.200v5H9.200v-5H5z" ${F}/><path d="M5 19.500h14M8 22h8" ${L(2)}/>`),
  // 定身：岩晶锁住脚下
  root: () => glyphBadge('#8a6a3a', `<path d="M3 21l3.500-11L10 21zM8.500 21L12 5l3.500 16zM14 21l3.500-11L21 21z" ${F}/><path d="M12 5v16M6.500 10v11M17.500 10v11" stroke="#060a16" stroke-opacity=".35" stroke-width="1"/>`),
  // 减速：冰晶
  slow: () => glyphBadge('#2f8fb8', SNOW),
  // 沉默：被划掉的话语
  silence: () => glyphBadge('#7a4fb8', `<path d="M4 4.500h16v10.500h-9l-4.500 4v-4H4z" ${L(2.2)}/><path d="M4.500 21L19.500 3" ${L(2.6)}/>`),
  // 护盾
  shield: () => glyphBadge('#4f7fc8', `<path d="${SHIELD_FULL}" ${F}/><path d="M12 5.200v13.800M7 8.500l5 2 5-2" stroke="#060a16" stroke-opacity=".3" stroke-width="1.200" fill="none"/>`),
  // 加速：双箭头
  haste: () => glyphBadge('#2f9e6a', `<path d="M4 5.500l7 6.500-7 6.500M12.500 5.500l7 6.500-7 6.500" ${L(3)}/>`),
  // 攻速：剑 + 速度线
  attack_speed: () => glyphBadge('#c8642a', `${uiGlyph('kill')}<path d="M3 5h5M2 9h4" ${L(1.8)}/>`),
  // 减伤：盾上向下的箭头
  dmg_reduction: () => glyphBadge('#5f6f86', `<path fill-rule="evenodd" d="${SHIELD_FULL}M10.700 7h2.600v5.200h2.700L12 17l-4-4.800h2.700z" ${F}/>`),
  // 不可选中：虚线轮廓里的残影
  untargetable: () =>
    glyphBadge('#6a55a8', `<circle cx="12" cy="12" r="9.500" ${L(1.8)} stroke-dasharray="3.200 3"/><circle cx="12" cy="9" r="3.200" ${F} opacity=".85"/><path d="M5.800 18.500c1-3.600 3.400-5 6.200-5s5.200 1.400 6.200 5z" ${F} opacity=".85"/>`),
  // 免疫控制：迸发的星芒
  unstoppable: () => glyphBadge('#c89a2a', `<path d="${starPoly(12, 12, 8, 10.6, 5.2)}" ${F}/><circle cx="12" cy="12" r="2.600" fill="#060a16" fill-opacity=".4"/>`),
  // 灼烧
  burn: () => glyphBadge('#c8402a', `<path d="${FLAME}" ${F}/><path d="M12 12.500c1.800 1.400 2.600 2.800 2.600 4.300a2.600 2.600 0 0 1-5.200 0c0-1.500.8-2.900 2.600-4.300z" fill="#060a16" fill-opacity=".35"/>`),
  recall: () => summonerIcon('recall'),
  restore: () => summonerIcon('heal'),
  // 泉水回复：水滴与涟漪
  fountain: () => glyphBadge('#2a9fb8', `<path d="M12 2c2.800 3.700 5.500 6.800 5.500 10.200a5.500 5.500 0 0 1-11 0C6.500 8.800 9.200 5.700 12 2z" ${F}/><path d="M3.500 20.500q4.200-3 8.500 0t8.500 0" ${L(2)}/>`),
  // 复活保护：光轮
  respawn_guard: () =>
    glyphBadge('#c8a83a', `<circle cx="12" cy="12" r="4.600" ${F}/><g ${L(2.2)}>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M12 2v3" transform="rotate(${a} 12 12)"/>`).join('')}</g>`),
  // 蓝buff：六棱霜晶
  frost_insight: () => glyphBadge('#3a78d0', `<path d="${starPoly(12, 12, 6, 10.6, 5.4)}" ${F}/><path d="M12 5v14M5.900 8.500l12.200 7M5.900 15.500l12.200-7" stroke="#060a16" stroke-opacity=".35" stroke-width="1.100"/><circle cx="12" cy="12" r="2" fill="#060a16" fill-opacity=".35"/>`),
  // 红buff：火焰中的一点亮芯
  ember_might: () => glyphBadge('#d0502a', `<path d="${FLAME}" ${F}/><path d="${star4(12, 15, 3.6, 0.2)}" fill="#060a16" fill-opacity=".5"/>`),
  // 巨灵buff(星陨祝福)：大小星芒
  star_blessing: () => glyphBadge('#d8a83a', `<path d="${star4(10.5, 13, 8.8, 0.2)}" ${F}/><path d="${star4(19, 5.5, 3.8, 0.2)}" ${F}/><path d="${star4(19.5, 19, 2.4, 0.2)}" ${F}/>`),
  // 英雄专属：复用技能图标
  panyue_passive: () => skillIcon('panyue', 'passive'),
  panyue_bulwark: () => skillIcon('panyue', 's2'),
  chijin_ember: () => skillIcon('chijin', 'passive'),
  chijin_blaze: () => skillIcon('chijin', 's2'),
  chijin_spin: () => skillIcon('chijin', 'ult'),
  xingli_mark: () => skillIcon('xingli', 'passive'),
  fengling_gale: () => skillIcon('fengling', 'passive'),
  fengling_crit: () => skillIcon('fengling', 's2'),
  yeque_shadow: () => skillIcon('yeque', 'passive'),
  // 防御塔锁定：红色准星
  tower_focus: () => glyphBadge('#c8303a', uiGlyph('target')),
};

/** 状态图标。返回 SVG 字符串（64×64 满幅方形，配合 .sf-slot 使用） */
export function buffIcon(id: BuffId): string {
  return DRAW[id]();
}

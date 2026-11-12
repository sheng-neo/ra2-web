/**
 * HUD 文案：拒绝提示、状态说明、施法方式、装备属性、播报用语。全部原创措辞。
 */
import { SUMMONER } from '../../core/data/heroes';
import { MONSTER_RULES, TOWER_RULES } from '../../core/data/units';
import type { AnnounceKey, Buff, BuffId, CastSpec, GameEvent, StatMods, SummonerSlot } from '../../core/types';

type RejectReason = Extract<GameEvent, { type: 'reject' }>['reason'];

export const REJECT_TEXT: Record<RejectReason, string> = {
  cooldown: '技能冷却中',
  mana: '法力不足',
  disabled: '当前无法行动',
  no_target: '没有可用目标',
  gold: '金币不足',
  full: '装备栏已满',
};

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** 状态说明：能从 value/stacks 读出数值的就写具体数值 */
const BUFF_DESC: Record<BuffId, (b: Buff) => string> = {
  stun: () => '无法移动、攻击和施放技能。',
  airborne: () => '被击飞：无法移动、攻击和施放技能。',
  root: () => '无法移动，仍可攻击与施放技能。',
  slow: (b) => (b.value > 0 ? `移动速度降低 ${pct(b.value)}。` : '移动速度降低。'),
  silence: () => '无法施放技能。',
  shield: (b) => (b.value > 0 ? `可吸收 ${Math.round(b.value)} 点伤害。` : '吸收即将受到的伤害。'),
  haste: (b) => (b.value > 0 ? `移动速度提高 ${pct(b.value)}。` : '移动速度提高。'),
  attack_speed: (b) => (b.value > 0 ? `攻击速度提高 ${pct(b.value)}。` : '攻击速度提高。'),
  dmg_reduction: (b) => (b.value > 0 ? `受到的伤害降低 ${pct(b.value)}。` : '受到的伤害降低。'),
  untargetable: () => '不可被选中，免疫一切伤害。',
  unstoppable: () => '免疫控制效果。',
  burn: (b) => (b.value > 0 ? `持续灼烧，每跳受到 ${Math.round(b.value)} 点真实伤害。` : '持续受到灼烧伤害。'),
  recall: () => '引导结束后传送回泉水。移动、攻击或受到伤害会打断。',
  restore: () => '持续回复生命与法力。受到英雄或防御塔的伤害会打断。',
  fountain: () => '身处泉水，快速回复生命与法力。',
  respawn_guard: () => '刚刚复活，短时间内免疫伤害。',
  frost_insight: () => `冷却缩减提高 ${pct(MONSTER_RULES.frostCdr)}，并持续回复法力。`,
  ember_might: () => `普攻附带灼烧，并使目标减速 ${pct(MONSTER_RULES.emberSlow)}。`,
  star_blessing: () => `造成的伤害提高 ${pct(MONSTER_RULES.blessingDamage)}，持续回复生命；己方小兵得到强化。`,
  panyue_passive: (b) => `普攻蓄势 ${b.stacks}/3：第三次普攻震击地面，附带额外伤害与减速。`,
  panyue_bulwark: () => '岩壁护体：持有护盾，周围敌人被震慑减速。',
  chijin_ember: () => '下一次普攻附带烈焰，并回复自身生命。',
  chijin_blaze: (b) => (b.value > 0 ? `攻击速度提高 ${pct(b.value)}。` : '攻击速度大幅提高。'),
  chijin_spin: () => '火焰旋风持续灼伤周围敌人；期间免疫减速并获得减伤。',
  xingli_mark: (b) => `星辉印记 ${b.stacks}/3：叠满后引爆并眩晕。`,
  fengling_gale: (b) => `风势 ${b.stacks}/5：每层提高攻击速度，满层后移速提高、普攻附带额外伤害。`,
  fengling_crit: () => '下一次普攻必定暴击。',
  yeque_shadow: () => '潜行于暗影之中，移动速度提高。',
  tower_focus: (b) => `被防御塔锁定：受到的塔伤害提高 ${pct(Math.min(TOWER_RULES.rampMax, b.stacks * TOWER_RULES.rampPerHit))}。`,
};

export function buffDesc(b: Buff): string {
  return BUFF_DESC[b.id](b);
}

/** 施法方式标签：技能详情里的一行小字 */
export function castLabel(c: CastSpec): string {
  switch (c.type) {
    case 'direction':
      return `方向 · 距离 ${c.range}`;
    case 'cone':
      return `扇形 · 距离 ${c.range}`;
    case 'position':
      return `范围 · 距离 ${c.range}`;
    case 'target':
      return `指向 · 距离 ${c.range}`;
    default:
      return c.radius > 0 ? `自身 · 半径 ${c.radius}` : '自身';
  }
}

/** 召唤师技能在界面上的施法方式（与模拟层的解析一致：闪现取方向，其余立即生效） */
export const SUMMONER_CAST: Record<SummonerSlot, CastSpec> = {
  flash: { type: 'direction', range: SUMMONER.flash.range, width: 1.2 },
  heal: { type: 'self', radius: 0 },
  recall: { type: 'self', radius: 0 },
};

export const STAT_LABELS: [keyof StatMods, string, (v: number) => string][] = [
  ['ad', '物理攻击', (v) => `+${v}`],
  ['ap', '法术强度', (v) => `+${v}`],
  ['apPct', '法术强度', (v) => `+${pct(v)}`],
  ['hp', '最大生命', (v) => `+${v}`],
  ['mana', '最大法力', (v) => `+${v}`],
  ['armor', '护甲', (v) => `+${v}`],
  ['mr', '法术抗性', (v) => `+${v}`],
  ['attackSpeedPct', '攻击速度', (v) => `+${pct(v)}`],
  ['moveSpeed', '移动速度', (v) => `+${v}`],
  ['cdr', '冷却缩减', (v) => `+${pct(v)}`],
  ['lifesteal', '普攻吸血', (v) => `+${pct(v)}`],
  ['critChance', '暴击率', (v) => `+${pct(v)}`],
  ['critDamage', '暴击伤害', (v) => `+${pct(v)}`],
  ['armorPen', '护甲穿透', (v) => `+${pct(v)}`],
  ['magicPen', '法术穿透', (v) => `+${pct(v)}`],
  ['hpRegen', '生命回复', (v) => `+${v}/秒`],
  ['manaRegen', '法力回复', (v) => `+${v}/秒`],
];

/** 装备属性的短写（卡片上一行放得下） */
const STAT_SHORT: Partial<Record<keyof StatMods, string>> = {
  ad: '物攻', ap: '法强', apPct: '法强', hp: '生命', mana: '法力', armor: '护甲', mr: '法抗', attackSpeedPct: '攻速', moveSpeed: '移速',
  cdr: '冷却', lifesteal: '吸血', critChance: '暴击', critDamage: '暴伤', armorPen: '破甲', magicPen: '法穿', hpRegen: '回血', manaRegen: '回蓝',
};

export function statLines(stats: StatMods): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const [k, label, fmt] of STAT_LABELS) {
    const v = stats[k];
    if (v !== undefined) out.push({ label, value: fmt(v) });
  }
  return out;
}

export function statSummary(stats: StatMods, max = 3): string {
  const out: string[] = [];
  for (const [k, , fmt] of STAT_LABELS) {
    const v = stats[k];
    if (v !== undefined && out.length < max) out.push(`${STAT_SHORT[k] ?? ''}${fmt(v)}`);
  }
  return out.join('  ');
}

export const CATEGORY_NAMES = { recommend: '推荐', attack: '攻击', magic: '法术', defense: '防御', boots: '鞋' } as const;
export type ShopTab = keyof typeof CATEGORY_NAMES;

/**
 * 播报强度：1 = 信息条；2 = 普通击杀/推塔；3 = 连杀；4 = 高光时刻(四杀、五杀、传说、团灭、终局)。
 * 强度越高横幅越大、光效越多，在队列里也越不容易被挤掉。
 */
export const ANNOUNCE_TIER: Record<AnnounceKey, 1 | 2 | 3 | 4> = {
  match_start: 1,
  minions_spawn: 1,
  super_minions: 2,
  epic_spawn: 2,
  first_blood: 3,
  double_kill: 3,
  triple_kill: 3,
  quadra_kill: 4,
  penta_kill: 4,
  killing_spree: 2,
  unstoppable: 3,
  legendary: 4,
  shutdown: 2,
  ace: 4,
  tower_destroyed: 2,
  epic_slain: 3,
  victory: 4,
  defeat: 4,
};

/** 击杀类播报的大字标题 */
export const KILL_TITLES: Partial<Record<AnnounceKey, string>> = {
  first_blood: '首杀',
  double_kill: '双杀',
  triple_kill: '三杀',
  quadra_kill: '四杀',
  penta_kill: '五杀 · 星陨降临',
  killing_spree: '锋芒毕露',
  unstoppable: '势不可挡',
  legendary: '星陨传说',
  shutdown: '终结',
};

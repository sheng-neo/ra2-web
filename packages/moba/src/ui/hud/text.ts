/**
 * HUD 文案：拒绝提示、状态说明、施法方式、装备属性、播报用语、通用叫法(分路 / 塔 / 野怪奖励)、技能标签。全部原创措辞。
 * 本文件不引用 DOM 与主题模块：引导脚本与目标规则(纯函数，在 Node 里跑单测)也要用这里的词表。
 */
import { SKILL_TAG_NAME, SUMMONER } from '../../core/data/heroes';
import { MONSTER_RULES, TOWER_RULES } from '../../core/data/units';
import type { AnnounceKey, Buff, BuffId, CastSpec, GameEvent, LaneId, MonsterType, RoleLane, SkillTag, StatMods, SummonerSlot, Vec2 } from '../../core/types';

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

// ───────────────────────── 通用叫法 ─────────────────────────

/** 分路名(横幅、击杀流、引导、目标提示共用) */
export const LANE_NAME: Record<LaneId, string> = { top: '上路', mid: '中路', bot: '下路' };
/** 含打野位的分路名 */
export const ROLE_LANE_NAME: Record<RoleLane, string> = { ...LANE_NAME, jungle: '打野' };
/** 塔的叫法：tier 1 = 一塔，2 = 二塔，3 = 高地塔 */
export const TIER_NAME: Record<1 | 2 | 3, string> = { 1: '一塔', 2: '二塔', 3: '高地塔' };
/** 「上路一塔」 */
export const towerName = (lane: LaneId, tier: 1 | 2 | 3): string => `${LANE_NAME[lane]}${TIER_NAME[tier]}`;

/**
 * 河道营地在小地图上的方位(蓝方视角，小地图方位固定：西北 = 左上，东南 = 右下)。
 * 给横幅和目标提示里的「(左上河道)」用。
 */
export function riverSide(pos: Vec2): string {
  return pos.x + pos.y < 0 ? '左上河道' : '右下河道';
}

/** 史诗野怪被拿下时的一句话：mine = 我方拿到。数值取自 MONSTER_RULES */
export function epicSlainText(type: MonsterType, mine: boolean): string {
  const R = MONSTER_RULES;
  const side = mine ? '全队' : '敌方全队';
  if (type === 'abyss_drake') return `${side} +${R.drakeTeamGold} 金币 +${R.drakeTeamXp} 经验`;
  if (type === 'star_colossus') return mine ? `全队 ${R.blessingDuration} 秒内伤害 +${pct(R.blessingDamage)}、持续回血、小兵更强` : `敌方全队 ${R.blessingDuration} 秒内更强，先避一避`;
  return mine ? '全队获得奖励' : '敌方获得奖励';
}

/** 拿到蓝buff / 红buff 时屏幕中下的轻提示 */
export const BUFF_GAIN_TEXT = {
  frost_insight: `拿到蓝buff：冷却缩减 +${pct(MONSTER_RULES.frostCdr)}，回蓝更快(${MONSTER_RULES.buffDuration} 秒)`,
  ember_might: `拿到红buff：普攻附带灼烧和减速(${MONSTER_RULES.buffDuration} 秒)`,
} as const;

/** 状态说明：能从 value/stacks 读出数值的就写具体数值 */
const BUFF_DESC: Record<BuffId, (b: Buff) => string> = {
  stun: () => '无法移动、攻击和施放技能。',
  airborne: () => '被击飞：无法移动、攻击和施放技能。',
  root: () => '无法移动，仍可攻击与施放技能。',
  slow: (b) => (b.value > 0 ? `移速降低 ${pct(b.value)}。` : '移速降低。'),
  silence: () => '无法施放技能。',
  shield: (b) => (b.value > 0 ? `可吸收 ${Math.round(b.value)} 点伤害。` : '吸收即将受到的伤害。'),
  haste: (b) => (b.value > 0 ? `移速提高 ${pct(b.value)}。` : '移速提高。'),
  attack_speed: (b) => (b.value > 0 ? `攻速提高 ${pct(b.value)}。` : '攻速提高。'),
  dmg_reduction: (b) => (b.value > 0 ? `受到的伤害降低 ${pct(b.value)}。` : '受到的伤害降低。'),
  untargetable: () => '不可被选中，免疫一切伤害。',
  unstoppable: () => '免疫控制效果。',
  burn: (b) => (b.value > 0 ? `持续灼烧，每跳受到 ${Math.round(b.value)} 点真实伤害。` : '持续受到灼烧伤害。'),
  recall: () => '原地站满时间就传送回泉水。移动、攻击或挨打会打断。',
  restore: () => '疗伤中：持续回血回蓝。被英雄或防御塔打到会打断。',
  fountain: () => '在泉水里：快速回血回蓝。',
  respawn_guard: () => '刚刚复活，短时间内免疫伤害。',
  frost_insight: () => `蓝buff：冷却缩减 +${pct(MONSTER_RULES.frostCdr)}(总上限 40%)，回蓝更快。打掉蓝buff 怪获得，持续 ${MONSTER_RULES.buffDuration} 秒。`,
  ember_might: () => `红buff：普攻附带灼烧，并让目标减速 ${pct(MONSTER_RULES.emberSlow)}。打掉红buff 怪获得，持续 ${MONSTER_RULES.buffDuration} 秒。`,
  star_blessing: () => `巨灵buff(星陨祝福)：伤害 +${pct(MONSTER_RULES.blessingDamage)}，持续回血，我方小兵更强。打掉远古巨灵后全队获得，持续 ${MONSTER_RULES.blessingDuration} 秒。`,
  // 英雄专属状态(键名沿用第一阶段，名字与说明按新身份写；名字见 icons/buffs.ts 的 BUFF_META)
  panyue_passive: (b) => `盾击蓄势 ${b.stacks}/3：第三次普攻改用大盾砸地，附带额外伤害与减速。`,
  // 减速只在施放的一瞬间生效一次，持续期间只有护盾
  panyue_bulwark: () => '拥盾而立：护盾生效中，盾破或到期即结束。',
  chijin_ember: () => '下一次普攻变为重斧，并回复自身生命。',
  chijin_blaze: (b) => (b.value > 0 ? `攻速提高 ${pct(b.value)}。` : '攻速大幅提高。'),
  chijin_spin: () => '斧影持续劈砍周围敌人；期间免疫减速并获得减伤。',
  xingli_mark: (b) => `余音 ${b.stacks}/3：叠满后弦音共振，造成伤害并眩晕。`,
  fengling_gale: (b) => `连射 ${b.stacks}/5：每层提高攻速，满层后移速提高、普攻附带额外伤害。`,
  fengling_crit: () => '下一次普攻必定暴击。',
  // 没有移速或隐身效果，只是参与击杀后的刷新提示
  yeque_shadow: () => '刚刚得手：一、二技能的冷却已刷新。',
  tower_focus: (b) => `塔在打你：塔的伤害越打越疼，现在 +${pct(Math.min(TOWER_RULES.rampMax, b.stacks * TOWER_RULES.rampPerHit))}。塔下没有小兵就先退出来。`,
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

/** 施法方式的一个词(技能浮层的标签行里用)：方向 / 扇形 / 范围 / 指向 / 自身 */
export function castKind(c: CastSpec): string {
  switch (c.type) {
    case 'direction':
      return '方向';
    case 'cone':
      return '扇形';
    case 'position':
      return '范围';
    case 'target':
      return '指向';
    default:
      return '自身';
  }
}

/** 施法距离(自身类技能给作用半径)，技能浮层的数值行里用；没有可说的返回空串 */
export function castReach(c: CastSpec): string {
  if (c.type === 'self') return c.radius > 0 ? `半径 ${c.radius}` : '';
  return `距离 ${c.range}`;
}

/** 通用技能(回城 / 疗伤 / 闪现)在界面上的施法方式（与模拟层的解析一致：闪现取方向，其余立即生效） */
export const SUMMONER_CAST: Record<SummonerSlot, CastSpec> = {
  flash: { type: 'direction', range: SUMMONER.flash.range, width: 1.2 },
  heal: { type: 'self', radius: 0 },
  recall: { type: 'self', radius: 0 },
};

/**
 * 属性的统一叫法：长处短处都用这一套(物攻 / 法强 / 生命 / 法力 / 护甲 / 魔抗 / 攻速 / 移速 / 冷却缩减 / 吸血 / 暴击 / 暴击伤害 / 物穿 / 法穿 / 回血 / 回蓝)。
 * 吸血只对普攻生效，数值后面注明。
 */
export const STAT_LABELS: [keyof StatMods, string, (v: number) => string][] = [
  ['ad', '物攻', (v) => `+${v}`],
  ['ap', '法强', (v) => `+${v}`],
  ['apPct', '法强', (v) => `+${pct(v)}`],
  ['hp', '生命', (v) => `+${v}`],
  ['mana', '法力', (v) => `+${v}`],
  ['armor', '护甲', (v) => `+${v}`],
  ['mr', '魔抗', (v) => `+${v}`],
  ['attackSpeedPct', '攻速', (v) => `+${pct(v)}`],
  ['moveSpeed', '移速', (v) => `+${v}`],
  ['cdr', '冷却缩减', (v) => `+${pct(v)}`],
  ['lifesteal', '吸血', (v) => `+${pct(v)}(仅普攻)`],
  ['critChance', '暴击', (v) => `+${pct(v)}`],
  ['critDamage', '暴击伤害', (v) => `+${pct(v)}`],
  ['armorPen', '物穿', (v) => `+${pct(v)}`],
  ['magicPen', '法穿', (v) => `+${pct(v)}`],
  ['hpRegen', '回血', (v) => `+${v}/秒`],
  ['manaRegen', '回蓝', (v) => `+${v}/秒`],
];

export function statLines(stats: StatMods): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const [k, label, fmt] of STAT_LABELS) {
    const v = stats[k];
    if (v !== undefined) out.push({ label, value: fmt(v) });
  }
  return out;
}

/** 一行放得下的属性摘要(名字与详情处同一套叫法；这里不带「仅普攻」之类的括注) */
export function statSummary(stats: StatMods, max = 3): string {
  const out: string[] = [];
  for (const [k, label, fmt] of STAT_LABELS) {
    const v = stats[k];
    if (v !== undefined && out.length < max) out.push(`${label}${fmt(v).replace(/\(.*\)$/, '')}`);
  }
  return out.join('  ');
}

// ───────────────────────── 技能类型标签 ─────────────────────────

/**
 * 技能标签的显示信息(HUD 与选英雄页共用)：name = 标签文字，short = 技能键角标上的两个字，color = 标签色。
 * 样式约定：胶囊形，文字用标签色，底色为标签色 14% 不透明度，1px 同色 45% 描边。「大招」「被动」按槽位另加，不在这张表里。
 */
export const SKILL_TAG_META: Record<SkillTag, { name: string; short: string; color: string }> = {
  dash: { name: SKILL_TAG_NAME.dash, short: '位移', color: '#5cd6f7' },
  control: { name: SKILL_TAG_NAME.control, short: '控制', color: '#b9a2ff' },
  slow: { name: SKILL_TAG_NAME.slow, short: '减速', color: '#8fc7ff' },
  burst: { name: SKILL_TAG_NAME.burst, short: '爆发', color: '#ff8a7a' },
  dot: { name: SKILL_TAG_NAME.dot, short: '持续', color: '#ffb454' },
  shield: { name: SKILL_TAG_NAME.shield, short: '护盾', color: '#dfe8ff' },
  heal: { name: SKILL_TAG_NAME.heal, short: '回复', color: '#6fe3a1' },
  buff: { name: SKILL_TAG_NAME.buff, short: '增益', color: '#f3cf85' },
};

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
  penta_kill: '五杀·星陨降临',
  killing_spree: '锋芒毕露',
  unstoppable: '势不可挡',
  legendary: '星陨传说',
  shutdown: '终结',
};

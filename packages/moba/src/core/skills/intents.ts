/**
 * 技能意图表：把 15 个技能「是什么、怎么用、打多远、有没有位移/控制、多久生效」整理成数据，给 Bot AI 做决策，
 * 外加一组伤害估算函数(斩杀判断/连招评估)。只依赖契约类型与 data/*，不碰引擎内部状态。
 *
 * 表里的「行为」字段与 skills/<hero>.ts 的脚本一一对应(skills/intents.test.ts 用实际施放校验)；
 * 数值全部取自 data/heroes.ts，改数据不需要改这里。
 */
import { HEROES, HERO_IDS, skillValue } from '../data/heroes';
import { ARMOR_K } from '../data/units';
import type { AbilitySlot, AreaVisual, BuffId, CastSpec, DamageType, HeroId, HeroUnit, Unit } from '../types';
import { castPoint, castRange, fixedValue } from './timing';

export type SkillRole =
  | 'engage' // 先手开团/留人
  | 'poke' // 远程消耗
  | 'burst' // 贴脸爆发
  | 'execute' // 收割残血
  | 'chase' // 追击
  | 'escape' // 逃生
  | 'zone' // 持续区域(封路/压制站位)
  | 'waveclear' // 清兵/刷野
  | 'defense' // 自保
  | 'steroid'; // 强化后续普攻

export type CcKind = 'knockup' | 'stun' | 'slow' | 'pull';

export interface SkillCc {
  kind: CcKind;
  /** 持续时间（秒）；pull 为 0 */
  duration: number;
  /** slow = 减速比例；pull = 拉拽距离；其余为 0 */
  value: number;
}

export interface SkillMobility {
  /** dash = 沿方向冲刺(撞墙即停)；leap = 跃向落点(可越墙)；blink = 瞬移 */
  kind: 'dash' | 'leap' | 'blink';
  /** 最大位移距离 */
  distance: number;
  /** 位移耗时（秒）；blink 为遁影时间 */
  duration: number;
  /** 会被墙挡住 */
  wallBlocked: boolean;
  /** 撞到第一个敌方英雄就停下 */
  stopsAtHero: boolean;
  /** 终点：aim = 沿瞄准方向/落点；behindTarget = 目标身后 */
  destination: 'aim' | 'behindTarget';
}

/** 伤害公式：values[base] + values[ad]×物攻 + values[ap]×法强 + values[hp]×自身最大生命 + values[missing]×目标已损生命 */
export interface SkillDamage {
  type: DamageType;
  base: string;
  ad?: string;
  ap?: string;
  hp?: string;
  missing?: string;
  /** 对同一目标最多命中几段 */
  hits: number;
  /** 多段之间的间隔（秒）；同时命中为 0 */
  interval: number;
  /** 第 2 段起的伤害比例（影刃的重复命中）；普通多段为 1 */
  repeatRatio: number;
  /** 对小兵/野怪的伤害比例 */
  nonHeroRatio: number;
}

export interface SkillIntent {
  heroId: HeroId;
  slot: AbilitySlot;
  name: string;
  cast: CastSpec;
  /** 手动瞄准时命令里该带哪个参数 */
  param: 'dir' | 'pos' | 'target' | 'none';
  /** 轻点(不带参数)时是否自动朝敌人瞄准；false = 朝移动/面向方向(逃生位移) */
  autoAimsEnemy: boolean;
  /** 有效距离：施法者中心到「还能被影响到的目标中心」的最大距离(未计目标半径) */
  reach: number;
  /** 效果半径（圆形/扇形范围）；线形/单体为 0 */
  aoeRadius: number;
  roles: SkillRole[];
  damage: SkillDamage | null;
  cc: SkillCc[];
  mobility: SkillMobility | null;
  /** 从发出命令到(首次)生效的延迟（秒）。弹道的飞行时间另算 */
  delay: number;
  /** 弹道速度（米/秒）；无弹道为 0 */
  projectileSpeed: number;
  /** 会被第一个小兵/野怪挡下(瞄英雄时要看路线上有没有兵) */
  blockedByMinions: boolean;
  /** 命中第一个英雄后不再继续 */
  stopsAtFirstHero: boolean;
  /** 能否伤害小兵/野怪 */
  hitsNonHeroes: boolean;
  /** 持续效果(区域/旋转/护盾)的总时长；瞬时为 0 */
  duration: number;
  /** 施放后自身被占用(动作锁/位移/遁影)、不能做别的事的时间 */
  lock: number;
  /** 给自己的增益 */
  selfBuffs: BuffId[];
  /** 生效期间自身的免疫状态 */
  immunity: 'unstoppable' | 'untargetable' | null;
  /** 敌人能否靠走位躲开(有延迟或弹道) */
  dodgeable: boolean;
}

type Behavior = Omit<SkillIntent, 'heroId' | 'slot' | 'name' | 'cast' | 'param'>;

/** 几何量(param/reach/aoeRadius)先按施放方式推出缺省值，b 里给了就以 b 为准 */
function build(heroId: HeroId, slot: AbilitySlot, b: Partial<Behavior> & Pick<Behavior, 'roles'>): SkillIntent {
  const def = HEROES[heroId].skills[slot];
  const cast = def.cast;
  let param: SkillIntent['param'];
  let reach: number;
  let aoeRadius = 0;
  switch (cast.type) {
    case 'direction': param = 'dir'; reach = cast.range + cast.width * 0.5; break;
    case 'cone': param = 'dir'; reach = cast.range; aoeRadius = cast.range; break;
    case 'position': param = 'pos'; reach = cast.range + cast.radius; aoeRadius = cast.radius; break;
    case 'target': param = 'target'; reach = cast.range; break;
    default: param = 'none'; reach = cast.radius; aoeRadius = cast.radius; break;
  }
  return {
    heroId, slot, name: def.name, cast, param, reach, aoeRadius,
    autoAimsEnemy: true, damage: null, cc: [], mobility: null, delay: 0, projectileSpeed: 0, blockedByMinions: false,
    stopsAtFirstHero: false, hitsNonHeroes: true, duration: 0, lock: def.castTime, selfBuffs: [], immunity: null, dodgeable: false,
    ...b,
  };
}

const v = fixedValue;
const rangeOf = castRange;
const dash = (heroId: HeroId, slot: AbilitySlot, stopsAtHero = false): SkillMobility => {
  const distance = rangeOf(heroId, slot);
  return { kind: 'dash', distance, duration: distance / v(heroId, slot, 'dashSpeed'), wallBlocked: true, stopsAtHero, destination: 'aim' };
};
const dmg = (type: DamageType, d: Partial<SkillDamage> = {}): SkillDamage => ({
  type, base: 'damage', hits: 1, interval: 0, repeatRatio: 1, nonHeroRatio: 1, ...d,
});

export const SKILL_INTENTS: Record<HeroId, Record<AbilitySlot, SkillIntent>> = {
  panyue: {
    // 冲锋：撞到第一个英雄即停并震击(半径 impactRadius)，否则到终点震击
    s1: build('panyue', 's1', {
      roles: ['engage', 'chase'],
      damage: dmg('physical', { ad: 'adRatio' }),
      cc: [{ kind: 'knockup', duration: v('panyue', 's1', 'knockup'), value: 0 }],
      mobility: dash('panyue', 's1', true),
      lock: dash('panyue', 's1').duration,
      reach: rangeOf('panyue', 's1') + v('panyue', 's1', 'impactRadius'),
      aoeRadius: v('panyue', 's1', 'impactRadius'),
      dodgeable: true,
    }),
    s2: build('panyue', 's2', {
      roles: ['defense', 'engage'],
      damage: dmg('magic'),
      cc: [{ kind: 'slow', duration: v('panyue', 's2', 'slowDur'), value: v('panyue', 's2', 'slow') }],
      duration: v('panyue', 's2', 'duration'),
      selfBuffs: ['shield', 'panyue_bulwark'],
    }),
    // 跃击：leapTime 后落地(期间霸体)，落点留下 zoneDur 秒的减速裂隙
    ult: build('panyue', 'ult', {
      roles: ['engage', 'zone'],
      damage: dmg('physical', { hp: 'hpRatio' }),
      cc: [
        { kind: 'knockup', duration: v('panyue', 'ult', 'knockup'), value: 0 },
        { kind: 'slow', duration: v('panyue', 'ult', 'zoneDur'), value: v('panyue', 'ult', 'slow') },
      ],
      mobility: {
        kind: 'leap', distance: rangeOf('panyue', 'ult'), duration: v('panyue', 'ult', 'leapTime'),
        wallBlocked: false, stopsAtHero: false, destination: 'aim',
      },
      delay: v('panyue', 'ult', 'leapTime'),
      duration: v('panyue', 'ult', 'zoneDur'),
      lock: v('panyue', 'ult', 'leapTime'),
      immunity: 'unstoppable',
      dodgeable: true,
    }),
  },
  chijin: {
    s1: build('chijin', 's1', {
      roles: ['burst', 'waveclear'],
      damage: dmg('physical', { ad: 'adRatio' }),
      cc: [{ kind: 'slow', duration: v('chijin', 's1', 'slowDur'), value: v('chijin', 's1', 'slow') }],
      delay: castPoint('chijin', 's1'),
    }),
    // 穿过敌人的突进 + 攻速
    s2: build('chijin', 's2', {
      roles: ['chase', 'escape', 'steroid'],
      damage: dmg('physical', { ad: 'adRatio' }),
      mobility: dash('chijin', 's2'),
      lock: dash('chijin', 's2').duration,
      duration: v('chijin', 's2', 'asDur'),
      selfBuffs: ['chijin_blaze'],
    }),
    // 跟随自身的旋风：期间可移动/放技能、不能普攻
    ult: build('chijin', 'ult', {
      roles: ['burst', 'zone', 'waveclear'],
      damage: dmg('physical', {
        ad: 'adRatio', hits: Math.round(v('chijin', 'ult', 'duration') / v('chijin', 'ult', 'tick')), interval: v('chijin', 'ult', 'tick'),
      }),
      delay: HEROES.chijin.skills.ult.castTime,
      duration: v('chijin', 'ult', 'duration'),
      lock: 0,
      selfBuffs: ['chijin_spin', 'dmg_reduction'],
      dodgeable: true,
    }),
  },
  xingli: {
    s1: build('xingli', 's1', {
      roles: ['poke', 'waveclear'],
      damage: dmg('magic', { ap: 'apRatio' }),
      delay: castPoint('xingli', 's1'),
      projectileSpeed: v('xingli', 's1', 'speed'),
      dodgeable: true,
    }),
    // 延迟 delay 秒后收束：伤害 + 拉向中心 + 减速
    s2: build('xingli', 's2', {
      roles: ['engage', 'zone', 'waveclear'],
      damage: dmg('magic', { ap: 'apRatio' }),
      cc: [
        { kind: 'pull', duration: 0, value: v('xingli', 's2', 'pull') },
        { kind: 'slow', duration: v('xingli', 's2', 'slowDur'), value: v('xingli', 's2', 'slow') },
      ],
      delay: v('xingli', 's2', 'delay'),
      dodgeable: true,
    }),
    // 预警 delay 秒后，duration 秒内落 waves 波(每波叠一层印记，三层眩晕)
    ult: build('xingli', 'ult', {
      roles: ['burst', 'zone', 'waveclear'],
      damage: dmg('magic', {
        ap: 'apRatio', hits: v('xingli', 'ult', 'waves'), interval: v('xingli', 'ult', 'duration') / v('xingli', 'ult', 'waves'),
      }),
      cc: [
        { kind: 'slow', duration: v('xingli', 'ult', 'slowDur'), value: v('xingli', 'ult', 'slow') },
        { kind: 'stun', duration: HEROES.xingli.passive.values.stun, value: 0 },
      ],
      delay: v('xingli', 'ult', 'delay'),
      duration: v('xingli', 'ult', 'duration'),
      dodgeable: true,
    }),
  },
  fengling: {
    // 穿透小兵(减伤)，命中第一个英雄即停
    s1: build('fengling', 's1', {
      roles: ['poke', 'waveclear'],
      damage: dmg('physical', { ad: 'adRatio', nonHeroRatio: v('fengling', 's1', 'minionRatio') }),
      cc: [{ kind: 'slow', duration: v('fengling', 's1', 'slowDur'), value: v('fengling', 's1', 'slow') }],
      delay: castPoint('fengling', 's1'),
      projectileSpeed: v('fengling', 's1', 'speed'),
      stopsAtFirstHero: true,
      dodgeable: true,
    }),
    // 逃生/走位翻跃：轻点朝移动方向；落地后加速 + 下一次普攻必暴
    s2: build('fengling', 's2', {
      roles: ['escape', 'steroid'],
      autoAimsEnemy: false,
      mobility: dash('fengling', 's2'),
      lock: dash('fengling', 's2').duration,
      duration: v('fengling', 's2', 'critWindow'),
      hitsNonHeroes: false,
      selfBuffs: ['haste', 'fengling_crit'],
    }),
    ult: build('fengling', 'ult', {
      roles: ['zone', 'waveclear', 'burst'],
      damage: dmg('physical', {
        ad: 'adRatio', hits: Math.round(v('fengling', 'ult', 'duration') / v('fengling', 'ult', 'tick')), interval: v('fengling', 'ult', 'tick'),
      }),
      cc: [{ kind: 'slow', duration: v('fengling', 'ult', 'slowDur'), value: v('fengling', 'ult', 'slow') }],
      delay: v('fengling', 'ult', 'delay'),
      duration: v('fengling', 'ult', 'duration'),
      dodgeable: true,
    }),
  },
  yeque: {
    // 穿过敌人的突进；命中英雄返还部分冷却，参与击杀直接刷新
    s1: build('yeque', 's1', {
      roles: ['chase', 'burst', 'escape', 'waveclear'],
      damage: dmg('physical', { ad: 'adRatio' }),
      mobility: dash('yeque', 's1'),
      lock: dash('yeque', 's1').duration,
    }),
    // 扇形多枚飞刃，各自被第一个敌人挡下；贴脸时多枚命中同一目标(后续按 repeatRatio)
    s2: build('yeque', 's2', {
      roles: ['poke', 'burst', 'waveclear'],
      damage: dmg('physical', { ad: 'adRatio', hits: v('yeque', 's2', 'blades'), repeatRatio: v('yeque', 's2', 'repeatRatio') }),
      cc: [{ kind: 'slow', duration: v('yeque', 's2', 'slowDur'), value: v('yeque', 's2', 'slow') }],
      delay: castPoint('yeque', 's2'),
      projectileSpeed: v('yeque', 's2', 'speed'),
      blockedByMinions: true,
      stopsAtFirstHero: true,
      dodgeable: true,
    }),
    // 指向英雄：遁影 vanish 秒(不可选中)后出现在目标身后处决，目标越残伤害越高
    ult: build('yeque', 'ult', {
      roles: ['execute', 'chase', 'burst'],
      damage: dmg('physical', { ad: 'adRatio', missing: 'missingRatio' }),
      mobility: {
        kind: 'blink', distance: rangeOf('yeque', 'ult'), duration: v('yeque', 'ult', 'vanish'),
        wallBlocked: false, stopsAtHero: false, destination: 'behindTarget',
      },
      delay: v('yeque', 'ult', 'vanish'),
      lock: v('yeque', 'ult', 'vanish'),
      hitsNonHeroes: false,
      immunity: 'untargetable',
    }),
  },
};

export function skillIntent(heroId: HeroId, slot: AbilitySlot): SkillIntent {
  return SKILL_INTENTS[heroId][slot];
}

/** 全部 15 个技能意图（遍历用） */
export const SKILL_INTENT_LIST: SkillIntent[] = HERO_IDS.flatMap((id) => [SKILL_INTENTS[id].s1, SKILL_INTENTS[id].s2, SKILL_INTENTS[id].ult]);

/**
 * 推荐连招顺序（先手控制 → 伤害 → 收割）。Bot 可以按顺序放「已就绪且够得着」的技能。
 * 磐岳：大招或冲撞进场 → 壁垒减速黏人；赤烬：炎步贴身 → 旋舞 → 烈焰斩留人；
 * 星璃：星环拉住 → 星陨覆盖 → 流星矢补层数；风翎：贯风矢减速 → 箭雨 → 逐风步留着走位；
 * 夜阙：飞刃减速 → 瞬影斩贴脸 → 处决收割。
 */
export const COMBOS: Record<HeroId, AbilitySlot[]> = {
  panyue: ['ult', 's1', 's2'],
  chijin: ['s2', 'ult', 's1'],
  xingli: ['s2', 'ult', 's1'],
  fengling: ['s1', 'ult', 's2'],
  yeque: ['s2', 's1', 'ult'],
};

/**
 * 敌方区域效果对「站在里面的我」意味着什么（配合 BotView.hostileAreas() 做走位）：
 * incoming = 预警，结束的那一刻才生效(趁早走出去)；damage = 待在里面持续掉血；slow = 只减速；none = 纯表现。
 * 跟随型区域(chijin_ult_spin)会追着敌方英雄移动，躲它等于远离那个英雄。
 */
export type AreaThreat = 'incoming' | 'damage' | 'slow' | 'none';

export const AREA_THREATS: Record<AreaVisual, AreaThreat> = {
  telegraph: 'incoming',
  xingli_s2_well: 'incoming',
  chijin_ult_spin: 'damage',
  xingli_ult_storm: 'damage',
  fengling_ult_rain: 'damage',
  panyue_ult_fissure: 'slow',
  panyue_s2_aura: 'none',
  fountain_zone: 'none',
};

// ───────────────────────── 伤害估算 ─────────────────────────

/** 目标身上的减伤 buff 合计(与引擎相同：相乘，最多减 80%) */
function takenMultiplier(target: Unit): number {
  let k = 1;
  for (const b of target.buffs) if (b.id === 'dmg_reduction') k *= 1 - Math.min(1, Math.max(0, b.value));
  return k < 1 ? Math.max(0.2, k) : 1;
}

/** 按护甲/法抗与穿透折算后的伤害（不含减伤 buff、护盾） */
export function mitigatedDamage(raw: number, type: DamageType, attacker: Unit, target: Unit): number {
  if (type === 'true') return raw;
  const resist = type === 'physical' ? target.stats.armor * (1 - attacker.stats.armorPen) : target.stats.mr * (1 - attacker.stats.magicPen);
  return (raw * ARMOR_K) / (ARMOR_K + Math.max(0, resist));
}

/**
 * 技能对单个目标的原始伤害(未计护甲)：按英雄当前技能等级与属性，hits 段全部命中(缺省 = 该技能的最大段数)。
 * 没学会/无伤害的技能返回 0。给了 target 才会计入「已损生命」项与小兵减伤比例。
 */
export function skillRawDamage(hero: HeroUnit, slot: AbilitySlot, target?: Unit, hits?: number): number {
  const d = SKILL_INTENTS[hero.heroId][slot].damage;
  const level = hero.skills[slot].level;
  if (!d || level <= 0) return 0;
  const def = HEROES[hero.heroId].skills[slot];
  const val = (key: string | undefined): number => (key ? skillValue(def, key, level) : 0);
  let one = val(d.base) + val(d.ad) * hero.stats.ad + val(d.ap) * hero.stats.ap + val(d.hp) * hero.stats.maxHp;
  if (target && d.missing) one += val(d.missing) * Math.max(0, target.stats.maxHp - target.hp);
  if (target && target.kind !== 'hero') one *= d.nonHeroRatio;
  const n = Math.max(0, Math.min(d.hits, hits ?? d.hits));
  return n <= 0 ? 0 : one * (1 + (n - 1) * d.repeatRatio);
}

/** 英雄自身被动带来的伤害倍率（目前只有夜阙的「猎影」；装备被动不计） */
function passiveMultiplier(hero: HeroUnit, target: Unit): number {
  if (hero.heroId !== 'yeque' || target.kind === 'tower' || target.kind === 'core') return 1;
  const p = HEROES.yeque.passive.values;
  let k = 1;
  if (target.hp < target.stats.maxHp * p.threshold) k *= 1 + p.bonus;
  if (target.kind === 'monster') k *= 1 + p.monsterBonus;
  return k;
}

/**
 * 估算技能打在 target 身上的实际伤害(全部 hits 段命中)：计入护甲/法抗/穿透、目标的减伤 buff、夜阙被动。
 * 不计护盾、装备被动、星辉印记引爆、以及多段期间目标血量变化。
 */
export function estimateSkillDamage(hero: HeroUnit, slot: AbilitySlot, target: Unit, hits?: number): number {
  const d = SKILL_INTENTS[hero.heroId][slot].damage;
  if (!d) return 0;
  const raw = skillRawDamage(hero, slot, target, hits) * passiveMultiplier(hero, target) * takenMultiplier(target);
  return mitigatedDamage(raw, d.type, hero, target);
}

/** 估算一次普攻的期望伤害(按暴击率加权；不含被动/装备附加) */
export function estimateBasicDamage(attacker: Unit, target: Unit): number {
  const s = attacker.stats;
  const type: DamageType = attacker.kind === 'hero' ? HEROES[attacker.heroId].basicAttack.damageType : 'physical';
  const crit = target.kind === 'tower' || target.kind === 'core' ? 0 : s.critChance;
  let raw = s.ad * (1 + crit * (s.critDamage - 1)) * takenMultiplier(target);
  if (attacker.kind === 'hero') raw *= passiveMultiplier(attacker, target);
  return mitigatedDamage(raw, type, attacker, target);
}

/** 技能当前能否施放（已学会、冷却好、蓝够）。不含控制状态判断，那是 BotView.skillReady 的事 */
export function skillAvailable(hero: HeroUnit, slot: AbilitySlot): boolean {
  const s = hero.skills[slot];
  return s.level > 0 && s.cd <= 0 && hero.mana >= s.cost;
}

/**
 * 估算「把当前可用的技能全交给 target」的总伤害(各技能全部段数命中)。
 * slots 缺省为三个技能；法力按顺序扣，蓝不够的后续技能不计。用于判断能不能打出击杀。
 */
export function estimateComboDamage(hero: HeroUnit, target: Unit, slots: AbilitySlot[] = COMBOS[hero.heroId]): number {
  let mana = hero.mana;
  let total = 0;
  for (const slot of slots) {
    const s = hero.skills[slot];
    if (s.level <= 0 || s.cd > 0 || mana < s.cost) continue;
    mana -= s.cost;
    total += estimateSkillDamage(hero, slot, target);
  }
  return total;
}

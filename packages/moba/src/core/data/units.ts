/**
 * 小兵 / 防御塔 / 水晶 / 野怪数值与经济规则。
 * 这些是初始平衡值：模拟层可以通过无头对局调参，但字段含义保持不变。
 * 目标节奏：一局 10~15 分钟；约 1:40 到 4 级；12 分钟左右接近满级、3~4 件成装。
 */
import type { MinionType, MonsterType } from '../types';

/** 伤害减免：实际伤害 = 原始伤害 × K / (K + 有效护甲)。有效护甲 = 护甲 × (1 − 穿透) */
export const ARMOR_K = 600;

export interface MinionDef {
  name: string;
  hp: number;
  /** 每分钟成长 */
  hpPerMin: number;
  ad: number;
  adPerMin: number;
  armor: number;
  mr: number;
  attackSpeed: number;
  attackRange: number;
  moveSpeed: number;
  radius: number;
  /** 远程弹道速度（近战为 0） */
  projectileSpeed: number;
  /** 补刀金币 / 击杀经验（经验由 12 米内的敌方英雄均分，单人独享） */
  gold: number;
  xp: number;
  /** 对建筑的伤害倍率 */
  towerMult: number;
}

export const MINIONS: Record<MinionType, MinionDef> = {
  melee: { name: '星卫', hp: 1100, hpPerMin: 75, ad: 58, adPerMin: 4, armor: 40, mr: 40, attackSpeed: 0.8, attackRange: 1.9, moveSpeed: 4.0, radius: 0.5, projectileSpeed: 0, gold: 52, xp: 86, towerMult: 0.6 },
  ranged: { name: '星术兵', hp: 720, hpPerMin: 45, ad: 84, adPerMin: 6, armor: 20, mr: 20, attackSpeed: 0.75, attackRange: 6.5, moveSpeed: 4.0, radius: 0.45, projectileSpeed: 18, gold: 42, xp: 64, towerMult: 0.6 },
  siege: { name: '攻城兽', hp: 2000, hpPerMin: 140, ad: 150, adPerMin: 10, armor: 80, mr: 80, attackSpeed: 0.5, attackRange: 8.0, moveSpeed: 3.8, radius: 0.8, projectileSpeed: 14, gold: 96, xp: 145, towerMult: 1.6 },
  super: { name: '星陨巨卫', hp: 4500, hpPerMin: 300, ad: 220, adPerMin: 14, armor: 120, mr: 120, attackSpeed: 0.85, attackRange: 2.3, moveSpeed: 4.0, radius: 0.9, projectileSpeed: 0, gold: 110, xp: 165, towerMult: 1.2 },
};

export const WAVES = {
  /** 第一波出兵时间 / 出兵间隔 */
  firstAt: 10,
  interval: 30,
  /** 每波每路：近战 ×2 + 远程 ×1；从第 3 波起每 3 波加 1 个攻城兵 */
  melee: 2,
  ranged: 1,
  siegeEvery: 3,
  /** 某路己方高地塔(tier3)被摧毁后，对方该路每波加 1 个超级兵 */
  /** 同波小兵出生间隔（秒），排成一列 */
  stagger: 0.6,
};

export interface TowerDef {
  hp: number;
  ad: number;
  armor: number;
  mr: number;
  attackSpeed: number;
  attackRange: number;
  radius: number;
  projectileSpeed: number;
  /** 摧毁后敌方全队每人获得的金币 / 最后一击者额外金币 */
  teamGold: number;
  lastHitGold: number;
}

export const TOWERS: Record<1 | 2 | 3, TowerDef> = {
  1: { hp: 7200, ad: 420, armor: 80, mr: 80, attackSpeed: 1.0, attackRange: 8.5, radius: 1.6, projectileSpeed: 26, teamGold: 120, lastHitGold: 100 },
  2: { hp: 8500, ad: 480, armor: 110, mr: 110, attackSpeed: 1.0, attackRange: 8.5, radius: 1.6, projectileSpeed: 26, teamGold: 140, lastHitGold: 100 },
  3: { hp: 12000, ad: 540, armor: 140, mr: 140, attackSpeed: 1.0, attackRange: 8.5, radius: 1.6, projectileSpeed: 26, teamGold: 160, lastHitGold: 100 },
};

export const TOWER_RULES = {
  /** 连续命中同一英雄，每次增伤比例与上限（tower_focus 层数） */
  rampPerHit: 0.25,
  rampMax: 1.0,
  /** 无敌方小兵在塔附近(10 米)时，塔受到的伤害减免（防偷塔） */
  backdoorReduction: 0.6,
  /** 目标优先级：正在攻击己方英雄的敌方英雄 > 小兵(攻城/超级优先) > 英雄 */
  /** 塔对小兵伤害倍率（让兵线推进更快） */
  minionMult: 1.4,
  /** 塔的视野半径 */
  sight: 11,
};

export const CORE = {
  hp: 19000,
  ad: 560,
  armor: 150,
  mr: 150,
  attackSpeed: 1.0,
  attackRange: 9,
  radius: 2.6,
  projectileSpeed: 26,
  /** 8 秒未受击后每秒回复 */
  regen: 40,
  regenDelay: 8,
};

export const FOUNTAIN = {
  /** 泉水内己方每秒回复最大生命/法力比例 */
  regenRatio: 0.12,
  /** 敌方进入泉水每 0.5 秒受到的真实伤害(占最大生命比例) */
  enemyDamageRatio: 0.2,
};

export interface MonsterDef {
  name: string;
  hp: number;
  hpPerMin: number;
  ad: number;
  adPerMin: number;
  armor: number;
  mr: number;
  attackSpeed: number;
  attackRange: number;
  moveSpeed: number;
  radius: number;
  projectileSpeed: number;
  gold: number;
  xp: number;
  /** 史诗野怪 */
  epic: boolean;
}

export const MONSTERS: Record<MonsterType, MonsterDef> = {
  mossback: { name: '苔背兽', hp: 2200, hpPerMin: 150, ad: 70, adPerMin: 5, armor: 60, mr: 40, attackSpeed: 0.7, attackRange: 2.0, moveSpeed: 4.6, radius: 0.9, projectileSpeed: 0, gold: 50, xp: 70, epic: false },
  glimwing: { name: '荧翼蜥', hp: 1250, hpPerMin: 85, ad: 55, adPerMin: 4, armor: 30, mr: 30, attackSpeed: 0.9, attackRange: 5.0, moveSpeed: 4.8, radius: 0.6, projectileSpeed: 16, gold: 29, xp: 41, epic: false },
  frost_golem: { name: '霜晶魔像', hp: 4200, hpPerMin: 280, ad: 110, adPerMin: 7, armor: 90, mr: 60, attackSpeed: 0.65, attackRange: 2.4, moveSpeed: 4.4, radius: 1.3, projectileSpeed: 0, gold: 90, xp: 126, epic: false },
  ember_golem: { name: '炽焰魔像', hp: 4200, hpPerMin: 280, ad: 110, adPerMin: 7, armor: 90, mr: 60, attackSpeed: 0.65, attackRange: 2.4, moveSpeed: 4.4, radius: 1.3, projectileSpeed: 0, gold: 90, xp: 126, epic: false },
  abyss_drake: { name: '深渊鳞兽', hp: 9000, hpPerMin: 600, ad: 190, adPerMin: 12, armor: 120, mr: 100, attackSpeed: 0.6, attackRange: 3.2, moveSpeed: 4.0, radius: 2.0, projectileSpeed: 0, gold: 80, xp: 120, epic: true },
  star_colossus: { name: '星陨巨灵', hp: 16000, hpPerMin: 900, ad: 260, adPerMin: 16, armor: 160, mr: 140, attackSpeed: 0.55, attackRange: 3.6, moveSpeed: 3.8, radius: 2.4, projectileSpeed: 0, gold: 120, xp: 180, epic: true },
};

export const MONSTER_RULES = {
  /** 野怪离营地超过此距离则脱战回营并回满血 */
  leash: 9,
  /** 增益持续时间 */
  buffDuration: 70,
  /** 霜晶之智：冷却缩减 / 每秒回蓝(最大法力比例) */
  frostCdr: 0.2,
  frostManaRegen: 0.015,
  /** 炽焰之力：普攻灼烧每 0.5 秒真实伤害 = base + perLevel×等级，持续 2 秒；并减速 */
  emberBurnBase: 14,
  emberBurnPerLevel: 3,
  emberSlow: 0.15,
  /** 深渊鳞兽：击杀方全队每人获得的金币/经验 */
  drakeTeamGold: 90,
  drakeTeamXp: 160,
  /** 星陨巨灵：击杀方全队「星陨祝福」持续时间、伤害加成、每秒回复(最大生命比例)，并且期间己方小兵伤害/生命 +40% */
  blessingDuration: 80,
  blessingDamage: 0.15,
  blessingRegen: 0.01,
  blessingMinionBoost: 0.4,
  colossusTeamGold: 120,
};

export const ECONOMY = {
  startGold: 300,
  /** 每秒自然金币（开局 10 秒后开始） */
  passiveGold: 3.4,
  /** 没补到刀但在 12 米内时获得的小兵金币比例 */
  proximityGoldRatio: 0.35,
  /** 经验/助攻判定半径 */
  shareRadius: 12,
  /** 多人分享经验时的总量放大（2 人各得 70%，3 人各 52%…） */
  xpShare: [1, 0.7, 0.52, 0.42, 0.36],
  /** 英雄击杀赏金：基础 + 被杀者连杀加成，死亡多的目标递减 */
  killGold: 220,
  killGoldPerStreak: 60,
  killGoldMax: 520,
  killGoldMin: 110,
  firstBloodBonus: 100,
  /** 助攻总金币(由助攻者均分)占击杀金币比例 */
  assistRatio: 0.8,
  /** 助攻判定：击杀前多少秒内对目标造成过伤害 */
  assistWindow: 10,
  /** 英雄击杀经验 = base + perLevel × 被杀者等级 */
  killXp: 140,
  killXpPerLevel: 28,
  /** 连杀播报窗口（秒） */
  multiKillWindow: 10,
};

/** 升到下一级所需经验：xpToNext(1) = 1→2 级 */
export function xpToNext(level: number): number {
  return level >= 15 ? 0 : 160 + 60 * (level - 1);
}

/** 复活时间（秒）：随等级增长；10 分钟后每 20 秒再 +1 秒，后期一次团灭就足以决定胜负 */
export function respawnTime(level: number, gameTime: number): number {
  return Math.min(60, 6 + level * 1.5 + Math.max(0, gameTime - 600) / 20);
}

/**
 * 终局加速：对局拖过 start 之后，建筑逐分钟变脆、新出生的小兵逐分钟变强(都是线性、无上限)，
 * 让满级满装后的僵持也能分出胜负。例：start 后 5 分钟，建筑受到的伤害 ×(1 + 5×structureVulnPerMin)，
 * 新小兵的生命与攻击 ×(1 + 5×minionBoostPerMin)。
 */
export const ENDGAME = {
  start: 660,
  structureVulnPerMin: 0.2,
  minionBoostPerMin: 0.22,
};

export const VISION = {
  hero: 13,
  minion: 9,
  monster: 0,
  tower: 11,
  core: 13,
  /** 草丛外的单位只有在此距离内才能看见草丛里的敌人 */
  bushReveal: 2.2,
  /** 攻击/施法暴露时间：在草丛里出手后对敌方可见的秒数 */
  revealOnAttack: 1.5,
};

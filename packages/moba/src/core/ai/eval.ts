/**
 * 战力评估：把「这场架能不能打」量化成一个优势比 adv。
 *
 * 每个参战英雄折算成 有效生命(EHP) 与 时间窗内的输出(OUT)；一方的强度 = ΣEHP × ΣOUT(兰彻斯特平方律：
 * 人多的一方既更肉又更痛)，adv = sqrt(己方强度 / 敌方强度)。两个同等英雄打一个 → adv = 2，势均力敌 → 1。
 * 防御塔、会转火的小兵只贡献输出；看不见但可能在附近的敌人按「幽灵」折算进敌方(地图意识)。
 */
import { ARMOR_K } from '../data/units';
import { estimateBasicDamage, estimateSkillDamage, SKILL_INTENTS, skillRawDamage } from '../skills/intents';
import type { AbilitySlot, HeroUnit, Unit } from '../types';
import { TUNE } from './params';

export const ABILITIES: AbilitySlot[] = ['s1', 's2', 'ult'];

/** 多段技能很少全中：按段数打折 */
function hitShare(hits: number): number {
  return hits >= 5 ? 0.55 : hits > 1 ? 0.75 : 0.85;
}

/** 有效生命：(血 + 盾) 按双抗平均折算 */
export function effHp(u: Unit): number {
  return (u.hp + u.shield) * (1 + ((u.stats.armor + u.stats.mr) * 0.5) / ARMOR_K);
}

/** 普攻 DPS（未计目标护甲） */
export function basicDps(u: Unit): number {
  const s = u.stats;
  return s.ad * s.attackSpeed * (1 + s.critChance * (s.critDamage - 1));
}

/**
 * 英雄在时间窗内的原始输出估计：普攻 + 当前可用技能的爆发(冷却中的技能按能转好的比例折算)。
 * ready(slot) 由调用方提供：自己/队友读冷却，敌人靠「看见他放过技能」来推断。
 */
export function heroOutput(h: HeroUnit, ready: (slot: AbilitySlot) => boolean): number {
  const horizon = TUNE.fightHorizon;
  // 近战要贴身才能输出，在场时间打折
  let out = basicDps(h) * horizon * (h.stats.attackRange < 4 ? 0.8 : 1);
  for (let i = 0; i < ABILITIES.length; i++) {
    const slot = ABILITIES[i];
    if (h.skills[slot].level <= 0) continue;
    const d = SKILL_INTENTS[h.heroId][slot].damage;
    if (!d) continue;
    const raw = skillRawDamage(h, slot) * hitShare(d.hits);
    out += ready(slot) ? raw : raw * 0.2;
  }
  return out;
}

/**
 * 距离权重：离交战点越远，赶到并参战的可能越小。对敌人更悲观(远一点的也算进来)、对队友更保守，
 * 这样估出来的优势偏谨慎 —— 宁可少打一场五五开的架，也不要因为没算上旁边的敌人而送掉。
 */
export function allyWeight(d: number): number {
  if (d <= TUNE.allyNear) return 1;
  if (d >= TUNE.allyFar) return 0;
  return 1 - (d - TUNE.allyNear) / (TUNE.allyFar - TUNE.allyNear);
}

export function foeWeight(d: number): number {
  if (d <= TUNE.foeNear) return 1;
  if (d >= TUNE.foeFar) return 0;
  return 1 - (d - TUNE.foeNear) / (TUNE.foeFar - TUNE.foeNear);
}

/**
 * 敌方英雄 e 一套技能加两下普攻能打掉 target 多少血。技能是否可用靠「看见他放过」推断(ready)，不读对方的冷却。
 */
export function burstOn(e: HeroUnit, target: Unit, ready: (slot: AbilitySlot) => boolean): number {
  let total = 2 * estimateBasicDamage(e, target);
  for (let i = 0; i < ABILITIES.length; i++) {
    const slot = ABILITIES[i];
    if (e.skills[slot].level <= 0 || !ready(slot)) continue;
    const d = SKILL_INTENTS[e.heroId][slot].damage;
    if (!d) continue;
    total += estimateSkillDamage(e, slot, target) * hitShare(d.hits);
  }
  return total;
}

/** 防御塔/水晶在时间窗内对英雄的原始输出（含连击增伤的平均值） */
export function structureOutput(s: Unit): number {
  return s.stats.ad * s.stats.attackSpeed * 1.4 * TUNE.fightHorizon;
}

export function sideStrength(ehp: number, out: number): number {
  return ehp * out;
}

export function advantageOf(allyEhp: number, allyOut: number, foeEhp: number, foeOut: number): number {
  const a = allyEhp * allyOut;
  const e = foeEhp * foeOut;
  if (e <= 1) return 9;
  return Math.min(9, Math.sqrt(a / e));
}

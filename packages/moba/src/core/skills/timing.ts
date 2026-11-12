/**
 * 技能时序约定（纯数据，不依赖引擎）：技能脚本与给 AI 用的技能意图表(intents.ts)共用，保证两边说的是同一件事。
 *
 * 出手点：非位移、非延迟落地的技能(挥砍/弹道)不在按键瞬间生效，而是在施法动作(castTime)的
 * CAST_POINT 处生效 —— 动作有预备，命中与挥砍/出弹对得上。出手前被控制不会打断这次出手(只有阵亡会)，
 * 否则 0.1 秒量级的前摇里被点一下控制就白交技能，手感很差。
 * 位移/跃击/自身增益类技能在按键瞬间开始；延迟落地类技能在按键瞬间放出预警圈。
 */
import { HEROES, skillValue } from '../data/heroes';
import type { AbilitySlot, HeroId } from '../types';

/** 出手点占施法动作时长的比例 */
export const CAST_POINT = 0.4;

/** 某技能从 skillCast 到出手的延迟（秒） */
export function castPoint(heroId: HeroId, slot: AbilitySlot): number {
  return HEROES[heroId].skills[slot].castTime * CAST_POINT;
}

/** 读取不随等级变化的技能数值（注册技能时就要用到的：弹道速度、冲刺速度、延迟…） */
export function fixedValue(heroId: HeroId, slot: AbilitySlot, key: string): number {
  return skillValue(HEROES[heroId].skills[slot], key, 1);
}

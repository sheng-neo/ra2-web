/**
 * 五位英雄主动技能的占位注册：只有引擎管线的通用行为(扣蓝、冷却、skillCast 事件、cast_* 动作)，没有技能效果。
 *
 * 实现英雄技能时(S2)：为每位英雄建一个文件(如 skills/panyue.ts)，用 toolkit.ts 的工具函数写效果，
 * 调 registerSkill(heroId, slot, impl) 覆盖这里的占位，再在 skills/index.ts 里 import 它(放在本文件之后)。
 * 英雄被动用 registerHeroHooks(heroId, hooks)。写法可参考 skills/summoner.ts 与 passives.ts。
 */
import { HERO_IDS } from '../data/heroes';
import type { AbilitySlot } from '../types';
import { registerSkill } from './registry';

const SLOTS: AbilitySlot[] = ['s1', 's2', 'ult'];

for (const heroId of HERO_IDS) {
  for (const slot of SLOTS) {
    registerSkill(heroId, slot, { cast: () => undefined });
  }
}

/**
 * 技能/装备测试的共用辅助（只给 *.test.ts 用）。场地选在地图正中的河道口：以原点为中心、
 * 半径约 9 米内没有墙、草丛，也在双方中路一塔的射程之外。
 */
import { skillValue } from '../data/heroes';
import { ARMOR_K } from '../data/units';
import type { SimHero, SimMinion, SimUnit } from '../internal';
import { eventsOf, freezeUnit, heroOf, levelTo, place, quietWorld, spawnMinionAt } from '../testkit';
import type { AbilitySlot, FxKey, GameEvent, HeroId, MinionType } from '../types';
import type { Sim } from '../world';

export type FxEvent = Extract<GameEvent, { type: 'fx' }>;
export type DamageEvent = Extract<GameEvent, { type: 'damage' }>;

/** 安静的世界 + 玩家英雄(蓝方)站在 (x, y)、缺省面朝 +x，升到指定等级 */
export function arena(heroId: HeroId, level = 1, x = 0, y = 0, facing = 0): { sim: Sim; hero: SimHero } {
  const sim = quietWorld(heroId);
  const hero = heroOf(sim, 0, heroId);
  place(sim, hero, x, y, facing);
  levelTo(sim, hero, level);
  sim.drainEvents();
  return { sim, hero };
}

/** 把一个红方英雄摆到场地里当靶子（不会行动） */
export function enemyAt(sim: Sim, heroId: HeroId, x: number, y: number, facing = Math.PI): SimHero {
  const e = heroOf(sim, 1, heroId);
  place(sim, e, x, y, facing);
  return e;
}

/** 红方木桩小兵：不动、不攻击、血量很厚 */
export function dummyAt(sim: Sim, x: number, y: number, type: MinionType = 'melee', hp = 1e6): SimMinion {
  const m = spawnMinionAt(sim, 1, type, x, y, 'mid', hp);
  freezeUnit(m);
  return m;
}

/** 护甲/法抗减免后的伤害 */
export function mitigate(raw: number, resist: number, pen = 0): number {
  return (raw * ARMOR_K) / (ARMOR_K + resist * (1 - pen));
}

/** 英雄当前等级下的技能数值 */
export function val(hero: SimHero, slot: AbilitySlot, key: string): number {
  return skillValue(hero.h.def.skills[slot], key, hero.skills[slot].level);
}

export function fxOf(events: GameEvent[], key: FxKey): FxEvent[] {
  return eventsOf(events, 'fx').filter((e) => e.key === key);
}

/** source 对 target 造成的伤害事件 */
export function damageTo(events: GameEvent[], source: SimUnit, target: SimUnit): DamageEvent[] {
  return eventsOf(events, 'damage').filter((e) => e.sourceId === source.id && e.targetId === target.id);
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

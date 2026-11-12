/**
 * 测试辅助：搭一个「安静」的世界(没有 Bot/兵线/野怪)，摆放单位，推进时间，筛选事件。
 * 只给 *.test.ts 与调试脚本使用，不要在正式流程里 import。
 */
import { createMinion } from './entity';
import type { SimHero, SimMinion, SimUnit } from './internal';
import { setHeroLevel } from './rewards';
import { recomputeStats } from './stats';
import { TICK_DT, type GameEvent, type HeroId, type LaneId, type MinionType, type PlayerTeam } from './types';
import { updateVision } from './vision';
import { createWorld, type Sim, type SimOptions } from './world';

/** 没有 Bot、不出兵、不刷野的世界：10 个英雄站在各自泉水里一动不动 */
export function quietWorld(playerHero: HeroId = 'chijin', seed = 1, opts: SimOptions = {}): Sim {
  return createWorld({ seed, playerHero, difficulty: 'normal' }, { noBots: true, noWaves: true, noCamps: true, ...opts });
}

/** 取某队的某个英雄 */
export function heroOf(sim: Sim, team: PlayerTeam, heroId: HeroId): SimHero {
  const h = sim.heroes.find((x) => x.team === team && x.heroId === heroId);
  if (!h) throw new Error(`no hero ${heroId} on team ${team}`);
  return h;
}

/** 把单位直接摆到 (x, y)（不做可走性修正），并刷新空间网格与视野 */
export function place(sim: Sim, u: SimUnit, x: number, y: number, facing?: number): void {
  u.pos.x = x;
  u.pos.y = y;
  u.prevPos.x = x;
  u.prevPos.y = y;
  if (facing !== undefined) u.facing = facing;
  u.rt.path = null;
  sim.grid.rebuild(sim.units);
  updateVision(sim);
}

/** 在指定位置生成一个小兵（缺省中路）。hp 可指定为一个很大的数当木桩用 */
export function spawnMinionAt(sim: Sim, team: PlayerTeam, type: MinionType, x: number, y: number, lane: LaneId = 'mid', hp?: number): SimMinion {
  const m = createMinion(sim, team, lane, type, { x, y });
  if (hp !== undefined) {
    m.rt.base.maxHp = hp;
    m.stats.maxHp = hp;
    m.hp = hp;
  }
  sim.addUnit(m);
  updateVision(sim);
  return m;
}

/** 让小兵原地发呆（不索敌、不前进），当木桩用 */
export function freezeUnit(u: SimUnit): void {
  u.rt.thinkAt = Infinity;
  u.rt.base.moveSpeed = 0;
  u.stats.moveSpeed = 0;
  u.rt.base.attackRange = 0;
  u.stats.attackRange = 0;
  u.rt.atkCd = Infinity;
}

/** 推进 seconds 秒，返回期间产生的全部事件 */
export function stepFor(sim: Sim, seconds: number): GameEvent[] {
  const n = Math.round(seconds / TICK_DT);
  const out: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    sim.step();
    const ev = sim.drainEvents();
    for (const e of ev) out.push(e);
  }
  return out;
}

/** 按类型筛选事件（带类型收窄） */
export function eventsOf<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/** 把英雄直接升到指定等级，并回满状态、清空冷却 */
export function levelTo(sim: Sim, hero: SimHero, level: number): void {
  setHeroLevel(sim, hero, level);
  refresh(sim, hero);
}

/** 回满状态、清空冷却 */
export function refresh(sim: Sim, hero: SimHero): void {
  recomputeStats(sim, hero);
  hero.hp = hero.stats.maxHp;
  hero.mana = hero.stats.maxMana;
  for (const s of Object.values(hero.skills)) s.cd = 0;
}

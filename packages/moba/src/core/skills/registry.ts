/**
 * 技能脚本 / 英雄被动 / 装备被动的注册表。
 *
 * 引擎(hero.ts 的施法管线)负责：是否学会、冷却、法力、控制校验、瞄准解析(含自动瞄准)、扣蓝、进冷却、
 * skillCast 事件、cast_* 动作与动作锁；然后调用这里注册的 SkillImpl.cast 执行具体效果。
 * 技能脚本用 skills/toolkit.ts 里的工具函数实现效果，数值一律通过 ctx.val(key) 从 data/heroes.ts 读取。
 *
 * 本文件不依赖任何玩法模块，可以在模块加载期安全调用 register*。
 */
import { SUMMONER } from '../data/heroes';
import type { HeroHooks, SimHero, SimUnit } from '../internal';
import type { AbilitySlot, CastSpec, GameEvent, HeroId, ItemDef, ItemPassiveId, SkillDef, SkillSlot, SummonerSlot, Vec2 } from '../types';
import type { Sim } from '../world';

export type { HeroHooks } from '../internal';

export type RejectReason = Extract<GameEvent, { type: 'reject' }>['reason'];

/** 一次施法的上下文（引擎已完成全部校验与瞄准解析） */
export interface CastContext {
  sim: Sim;
  caster: SimHero;
  slot: SkillSlot;
  /** 技能等级（召唤师技能恒为 1） */
  level: number;
  /** 技能数据；召唤师技能为 null */
  def: SkillDef | null;
  /** 施法瞬间施法者的位置（快照，不随之后的位移变化） */
  origin: Vec2;
  /** 瞄准方向（单位向量）。self 型为当前朝向 */
  dir: Vec2;
  /**
   * 落点：position 型 = 已限制在施法距离内的目标点；direction/cone 型 = origin + dir × range；
   * target 型 = 目标当前位置；self 型 = origin。
   */
  targetPos: Vec2;
  /** target 型的目标单位；其余类型为 null */
  target: SimUnit | null;
  /** 读取当前技能等级的数值：等价于 skillValue(def, key, level) */
  val(key: string): number;
}

export interface SkillImpl {
  /** 技能效果。调用时已扣蓝、进冷却、发出 skillCast 事件、进入 cast_* 动作 */
  cast(ctx: CastContext): void;
  /** 额外的施放条件：返回拒绝原因，或 null 表示可以施放 */
  canCast?(sim: Sim, hero: SimHero): RejectReason | null;
  /**
   * 自动瞄准方式(命令未给 dir/pos/targetId 时)：
   * 'enemy'(缺省) = 瞄准射程内血量比例最低的可见敌方英雄 → 最近敌方单位 → 朝移动/面向方向；
   * 'facing' = 始终朝移动方向(没在移动则朝面向)，适合逃生位移。
   */
  aim?: 'enemy' | 'facing';
  /** 自动瞄准预判：弹道速度(米/秒，方向型按飞行时间提前量) */
  aimSpeed?: number;
  /** 自动瞄准预判：生效延迟(秒，范围型落点按目标移动提前)。缺省 0.3 */
  aimLead?: number;
  /** 施放后多久不能移动/普攻/再施法(动作锁)。缺省 = SkillDef.castTime */
  lockTime?: number;
  /** 位移类技能：被定身(root)时不可施放 */
  movement?: boolean;
  /** 不自动播放 cast_* 动作（脚本自己控制动画，如冲刺/跃击/旋转） */
  noAnim?: boolean;
}

const NOOP: SkillImpl = { cast: () => undefined };

const skills = new Map<string, SkillImpl>();
const heroHooks = new Map<HeroId, HeroHooks>();
const itemPassives = new Map<ItemPassiveId, (item: ItemDef) => HeroHooks>();

/** 注册英雄主动技能脚本（重复注册会覆盖） */
export function registerSkill(heroId: HeroId, slot: AbilitySlot, impl: SkillImpl): void {
  skills.set(`${heroId}:${slot}`, impl);
}

/** 注册召唤师技能（所有英雄通用） */
export function registerSummoner(slot: SummonerSlot, impl: SkillImpl): void {
  skills.set(`*:${slot}`, impl);
}

/** 取技能脚本；未注册的返回「无效果」的空实现（skillCast 事件照发） */
export function getSkill(heroId: HeroId, slot: SkillSlot): SkillImpl {
  return skills.get(`${heroId}:${slot}`) ?? skills.get(`*:${slot}`) ?? NOOP;
}

/** 注册英雄被动（一组钩子） */
export function registerHeroHooks(heroId: HeroId, hooks: HeroHooks): void {
  heroHooks.set(heroId, hooks);
}

export function getHeroHooks(heroId: HeroId): HeroHooks | undefined {
  return heroHooks.get(heroId);
}

/**
 * 注册装备被动：factory 拿到装备定义(从 item.passive 读 value/value2)，返回一组钩子。
 * 同一被动 id 在一个英雄身上只生效一份（唯一被动）。
 */
export function registerItemPassive(id: ItemPassiveId, factory: (item: ItemDef) => HeroHooks): void {
  itemPassives.set(id, factory);
}

export function getItemPassive(id: ItemPassiveId): ((item: ItemDef) => HeroHooks) | undefined {
  return itemPassives.get(id);
}

/** 召唤师技能的施放方式（英雄技能的在 data/heroes.ts） */
export const SUMMONER_CAST: Record<SummonerSlot, CastSpec> = {
  recall: { type: 'self', radius: 0 },
  heal: { type: 'self', radius: 0 },
  flash: { type: 'direction', range: SUMMONER.flash.range, width: 0 },
};

export function isSummonerSlot(slot: SkillSlot): slot is SummonerSlot {
  return slot === 'recall' || slot === 'heal' || slot === 'flash';
}

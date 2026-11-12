/**
 * 装备被动（数据驱动）：每个 ItemPassiveId 对应一组英雄钩子，数值取自 data/items.ts 的 passive.value / value2。
 * 同 id 被动在一个英雄身上只生效一份（见 hero.ts rebuildHooks）。
 */
import { isStructure } from './entity';
import type { HeroHooks } from './internal';
import { addShield, attackSpeedBuff, procDamage, registerItemPassive, slow, tryInternalCooldown } from './skills/toolkit';
import type { ItemDef } from './types';

/** 描述文案里写死、但数据里没有单独字段的常量 */
const SPELL_SHIELD_THRESHOLD = 0.35;
const SPELL_SHIELD_DURATION = 4;
const SPELL_SHIELD_COOLDOWN = 60;
/** 脱战判定：多久没有受到任何伤害 */
const OUT_OF_COMBAT_TIME = 5;

const value = (item: ItemDef): number => item.passive?.value ?? 0;
const value2 = (item: ItemDef): number => item.passive?.value2 ?? 0;

// 灼光：普攻额外造成法术伤害（不对建筑生效）
registerItemPassive('onhit_magic', (item): HeroHooks => ({
  modifyBasicAttack(_sim, _hero, target, mod) {
    if (!isStructure(target)) mod.bonusMagic += value(item);
  },
}));

// 反震：受到普攻时，对攻击者造成其伤害一定比例的法术伤害
registerItemPassive('thorns', (item): HeroHooks => ({
  onDamageTaken(sim, hero, source, dealt, info) {
    if (info.kind !== 'basic' || !source || !source.alive || isStructure(source)) return;
    procDamage(sim, hero, source, dealt * value(item), 'magic');
  },
}));

// 霜蚀：技能伤害使目标减速
registerItemPassive('spell_slow', (item): HeroHooks => ({
  onSkillHit(sim, hero, target) {
    if (target.alive) slow(sim, target, value(item), value2(item), hero, 'item_frost');
  },
}));

// 生生不息：脱离战斗后按最大生命比例持续回复
registerItemPassive('regen_ooc', (item): HeroHooks => ({
  onTick(sim, hero, dt) {
    if (hero.inCombat || hero.hp >= hero.stats.maxHp) return;
    if (sim.state.time - hero.lastHitTime < OUT_OF_COMBAT_TIME) return;
    hero.hp = Math.min(hero.stats.maxHp, hero.hp + hero.stats.maxHp * value(item) * dt);
  },
}));

// 寒铁：用普攻攻击你的敌人攻速降低
registerItemPassive('cripple_aura', (item): HeroHooks => ({
  onDamageTaken(sim, hero, source, _dealt, info) {
    if (info.kind !== 'basic' || !source || !source.alive || isStructure(source)) return;
    attackSpeedBuff(sim, source, -value(item), value2(item), hero, 'item_cripple');
  },
}));

// 坠星：对低血量敌人增伤（不对建筑生效）
registerItemPassive('execute_bonus', (item): HeroHooks => ({
  modifyDamageDealt(_sim, _hero, target, info) {
    if (isStructure(target)) return;
    if (target.hp < target.stats.maxHp * value2(item)) info.amount *= 1 + value(item);
  },
}));

// 星幕：低血时获得一次护盾（有内部冷却）
registerItemPassive('spell_shield', (item): HeroHooks => ({
  onDamageTaken(sim, hero) {
    if (!hero.alive || hero.hp >= hero.stats.maxHp * SPELL_SHIELD_THRESHOLD) return;
    if (!tryInternalCooldown(sim, hero, 'item_spell_shield', SPELL_SHIELD_COOLDOWN)) return;
    addShield(sim, hero, value(item) + value2(item) * hero.level, SPELL_SHIELD_DURATION, hero, 'item_spell_shield');
  },
}));

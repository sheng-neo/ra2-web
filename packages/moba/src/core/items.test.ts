import { describe, expect, it } from 'vitest';
import { addBuff, findBuff, hasBuff } from './buffs';
import { dealDamage, resolveBasicHit } from './combat';
import { HEROES } from './data/heroes';
import { ITEM_LIST, ITEMS } from './data/items';
import { MONSTER_RULES } from './data/units';
import type { SimHero, SimUnit } from './internal';
import { getItemHooks } from './skills/registry';
import { arena, damageTo, dummyAt, enemyAt, mitigate } from './skills/testutil';
import { eventsOf, stepFor } from './testkit';
import type { ItemId } from './types';
import type { Sim } from './world';

function buy(sim: Sim, hero: SimHero, ...items: ItemId[]): void {
  hero.gold = 999999;
  for (const id of items) sim.command(hero.id, { type: 'buy', itemId: id });
  sim.drainEvents();
}

/** 让 attacker 对 target 结算一次普攻命中(跳过走位与前摇) */
function basicHit(sim: Sim, attacker: SimUnit, target: SimUnit): void {
  resolveBasicHit(sim, attacker, target, attacker.stats.ad, attacker.rt.atk.dtype, attacker.rt.atk.vsStructure, attacker.rt.atk.vsMinion);
}

describe('装备被动', () => {
  it('每个带被动的装备都注册了实现', () => {
    const withPassive = ITEM_LIST.filter((it) => it.passive);
    expect(withPassive.map((it) => it.passive && it.passive.id).sort()).toEqual(
      ['cripple_aura', 'execute_bonus', 'onhit_magic', 'regen_ooc', 'spell_shield', 'spell_slow', 'thorns'],
    );
    for (const it of withPassive) expect(getItemHooks(it), it.id).toBeDefined();
  });

  it('灼光(onhit_magic)：普攻额外 45 法术伤害；同名被动只生效一份；对建筑无效', () => {
    const { sim, hero } = arena('chijin');
    const d = dummyAt(sim, 2.5, 0, 'siege');
    buy(sim, hero, 'sunchaser_bow', 'sunchaser_bow');
    basicHit(sim, hero, d);
    const hits = damageTo(sim.drainEvents(), hero, d);
    const magic = hits.filter((h) => h.dtype === 'magic');
    expect(magic.length).toBe(1);
    expect(magic[0].amount).toBeCloseTo(mitigate(ITEMS.sunchaser_bow.passive?.value ?? 0, d.stats.mr), 6);
    expect(magic[0].skill).toBe(false);
    const tower = sim.towers[1].mid[0];
    if (!tower) throw new Error('no tower');
    basicHit(sim, hero, tower);
    expect(damageTo(sim.drainEvents(), hero, tower).every((h) => h.dtype === 'physical')).toBe(true);
  });

  it('反震(thorns)：受到普攻时对攻击者造成其伤害 18% 的法术伤害；技能伤害不触发', () => {
    const { sim, hero } = arena('panyue');
    const e = enemyAt(sim, 'chijin', 2, 0);
    const m = dummyAt(sim, 0, 2);
    buy(sim, hero, 'thorn_mail');
    basicHit(sim, e, hero);
    let ev = sim.drainEvents();
    const taken = damageTo(ev, e, hero)[0].amount;
    const back = damageTo(ev, hero, e);
    expect(back.length).toBe(1);
    expect(back[0].dtype).toBe('magic');
    expect(back[0].amount).toBeCloseTo(mitigate(taken * 0.18, e.stats.mr), 6);
    // 小兵打过来同样反弹
    basicHit(sim, m, hero);
    ev = sim.drainEvents();
    expect(damageTo(ev, hero, m)[0].amount).toBeCloseTo(mitigate(damageTo(ev, m, hero)[0].amount * 0.18, m.stats.mr), 6);
    dealDamage(sim, e, hero, 500, 'physical', 'skill');
    expect(damageTo(sim.drainEvents(), hero, e).length).toBe(0);
  });

  it('霜蚀(spell_slow)：技能伤害使目标减速 20% 1 秒；普攻不触发', () => {
    const { sim, hero } = arena('xingli');
    const e = enemyAt(sim, 'chijin', 5, 0);
    buy(sim, hero, 'winter_scepter');
    basicHit(sim, hero, e);
    expect(hasBuff(e, 'slow')).toBe(false);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    stepFor(sim, 0.4);
    const slow = findBuff(e, 'slow');
    expect(slow && slow.value).toBe(0.2);
    expect(slow && slow.duration).toBe(1);
    expect(e.stats.moveSpeed).toBeCloseTo(HEROES.chijin.base.moveSpeed * 0.8, 6);
    stepFor(sim, 1);
    expect(hasBuff(e, 'slow')).toBe(false);
  });

  it('生生不息(regen_ooc)：脱战后每秒回复 2% 最大生命；受伤后 5 秒内不生效', () => {
    const { sim, hero } = arena('panyue');
    const e = enemyAt(sim, 'chijin', 9, 0);
    buy(sim, hero, 'undying_heart');
    const s = hero.stats;
    hero.hp = s.maxHp * 0.3;
    let hp = hero.hp;
    stepFor(sim, 2);
    expect(hero.hp - hp).toBeCloseTo(2 * (s.maxHp * 0.02 + s.hpRegen), 3);
    dealDamage(sim, e, hero, 100, 'true');
    hp = hero.hp;
    stepFor(sim, 2);
    expect(hero.hp - hp).toBeCloseTo(2 * s.hpRegen, 3);
    stepFor(sim, 3.2);
    hp = hero.hp;
    stepFor(sim, 1);
    expect(hero.hp - hp).toBeCloseTo(s.maxHp * 0.02 + s.hpRegen, 3);
    // 被小兵/野怪打到同样算战斗中：5 秒内没有再受伤才恢复
    const m = dummyAt(sim, 0, 3);
    dealDamage(sim, m, hero, 50, 'true', 'basic');
    expect(hero.inCombat).toBe(false);
    hp = hero.hp;
    stepFor(sim, 4.5);
    expect(hero.hp - hp).toBeCloseTo(4.5 * s.hpRegen, 3);
    stepFor(sim, 0.6);
    hp = hero.hp;
    stepFor(sim, 1);
    expect(hero.hp - hp).toBeCloseTo(s.maxHp * 0.02 + s.hpRegen, 3);
    // 满血即停
    hero.hp = s.maxHp - 1;
    stepFor(sim, 1);
    expect(hero.hp).toBe(s.maxHp);
  });

  it('寒铁(cripple_aura)：用普攻打我的敌人攻速 -20% 持续 2 秒；技能不触发', () => {
    const { sim, hero } = arena('panyue');
    const e = enemyAt(sim, 'fengling', 3, 0);
    buy(sim, hero, 'guardian_plate');
    const as0 = e.stats.attackSpeed;
    dealDamage(sim, e, hero, 100, 'physical', 'skill');
    expect(e.stats.attackSpeed).toBeCloseTo(as0, 6);
    basicHit(sim, e, hero);
    // 风翎自己的被动会给她叠一层攻速：两者相加
    const gale = HEROES.fengling.passive.values.asPerStack;
    expect(e.stats.attackSpeed).toBeCloseTo(HEROES.fengling.base.attackSpeed * (1 - 0.2 + gale), 6);
    const cripple = findBuff(e, 'attack_speed');
    expect(cripple && cripple.value).toBe(-0.2);
    expect(cripple && cripple.duration).toBe(2);
    stepFor(sim, 2.1);
    expect(hasBuff(e, 'attack_speed')).toBe(false);
  });

  it('坠星(execute_bonus)：对生命低于 50% 的敌人伤害 +15%；对建筑无效', () => {
    const { sim, hero } = arena('chijin');
    const e = enemyAt(sim, 'panyue', 3, 0);
    buy(sim, hero, 'starfall_blade');
    e.hp = e.stats.maxHp * 0.51;
    expect(dealDamage(sim, hero, e, 100, 'true')).toBeCloseTo(100, 6);
    e.hp = e.stats.maxHp * 0.49;
    expect(dealDamage(sim, hero, e, 100, 'true')).toBeCloseTo(115, 6);
    const tower = sim.towers[1].mid[0];
    if (!tower) throw new Error('no tower');
    tower.rt.backdoor = false;
    tower.hp = tower.stats.maxHp * 0.2;
    expect(dealDamage(sim, hero, tower, 100, 'true')).toBeCloseTo(100, 6);
  });

  it('星幕(spell_shield)：低于 35% 生命时获得 600(+每级60) 护盾 4 秒，冷却 60 秒', () => {
    const { sim, hero } = arena('panyue', 5);
    const e = enemyAt(sim, 'chijin', 9, 0);
    buy(sim, hero, 'starweave_cloak');
    hero.hp = hero.stats.maxHp * 0.6;
    dealDamage(sim, e, hero, 100, 'true');
    expect(hero.shield).toBe(0);
    // 受伤后仍高于 35%：不触发
    hero.hp = hero.stats.maxHp * 0.38;
    dealDamage(sim, e, hero, hero.stats.maxHp * 0.02, 'true');
    expect(hero.shield).toBe(0);
    hero.hp = hero.stats.maxHp * 0.36;
    dealDamage(sim, e, hero, hero.stats.maxHp * 0.02, 'true');
    expect(hero.shield).toBeCloseTo(600 + 60 * 5, 6);
    const shield = findBuff(hero, 'shield');
    expect(shield && shield.duration).toBe(4);
    stepFor(sim, 4.1);
    expect(hero.shield).toBe(0);
    // 冷却中不再触发
    hero.hp = hero.stats.maxHp * 0.3;
    dealDamage(sim, e, hero, 10, 'true');
    expect(hero.shield).toBe(0);
    stepFor(sim, 54);
    hero.hp = hero.stats.maxHp * 0.3;
    dealDamage(sim, e, hero, 10, 'true');
    expect(hero.shield).toBe(0);
    stepFor(sim, 2);
    hero.hp = hero.stats.maxHp * 0.3;
    dealDamage(sim, e, hero, 10, 'true');
    expect(hero.shield).toBeCloseTo(900, 6);
  });
});

describe('装备属性', () => {
  it('法强百分比、冷却缩减上限、法术穿透', () => {
    const { sim, hero } = arena('xingli', 4);
    const e = enemyAt(sim, 'panyue', 5, 0);
    buy(sim, hero, 'sage_codex', 'astral_staff');
    // (220 + 180) × (1 + 30%)
    expect(hero.stats.ap).toBeCloseTo(400 * 1.3, 6);
    expect(hero.stats.maxMana).toBeCloseTo(HEROES.xingli.base.mana + 3 * HEROES.xingli.growth.mana + 300, 6);
    buy(sim, hero, 'boots_arcane', 'starfall_blade');
    expect(hero.stats.cdr).toBeCloseTo(0.35, 6);
    addBuff(sim, hero, 'frost_insight', { duration: 30, key: 'camp' });
    // 0.35 + 霜晶之智 0.2 → 封顶 0.4
    expect(MONSTER_RULES.frostCdr).toBe(0.2);
    expect(hero.stats.cdr).toBe(0.4);
    sim.command(hero.id, { type: 'cast', slot: 'ult', pos: { x: 5, y: 0 } });
    expect(hero.skills.ult.cdMax).toBeCloseTo(HEROES.xingli.skills.ult.cooldown[0] * 0.6, 6);
    stepFor(sim, 4);
    buy(sim, hero, 'void_crown');
    expect(hero.stats.magicPen).toBeCloseTo(0.35, 6);
    e.hp = e.stats.maxHp;
    expect(dealDamage(sim, hero, e, 1000, 'magic')).toBeCloseTo(mitigate(1000, e.stats.mr, 0.35), 6);
    // 穿透只对对应类型生效
    e.hp = e.stats.maxHp;
    expect(dealDamage(sim, hero, e, 1000, 'physical')).toBeCloseTo(mitigate(1000, e.stats.armor), 6);
  });

  it('暴击率/暴击倍率只作用于普攻；吸血按实际普攻伤害回复；护甲穿透', () => {
    const { sim, hero } = arena('chijin');
    const d = dummyAt(sim, 2.5, 0, 'siege');
    buy(sim, hero, 'phantom_edge', 'sunchaser_bow', 'blood_scythe', 'piercing_spear');
    const s = hero.stats;
    expect(s.critChance).toBeCloseTo(0.45, 6);
    expect(s.critDamage).toBeCloseTo(2.3, 6);
    expect(s.lifesteal).toBeCloseTo(0.2, 6);
    expect(s.armorPen).toBeCloseTo(0.35, 6);
    expect(s.attackSpeed).toBeCloseTo(HEROES.chijin.base.attackSpeed * 1.35, 6);
    expect(s.moveSpeed).toBeCloseTo(HEROES.chijin.base.moveSpeed + 0.25, 6);
    hero.hp = 100;
    let crits = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      hero.hp = 100;
      basicHit(sim, hero, d);
      const ev = sim.drainEvents();
      const main = damageTo(ev, hero, d).find((h) => h.dtype === 'physical');
      if (!main) throw new Error('no hit');
      const expected = mitigate(s.ad * (main.crit ? s.critDamage : 1), d.stats.armor, 0.35);
      expect(main.amount).toBeCloseTo(expected, 4);
      const heal = eventsOf(ev, 'heal').find((h) => h.targetId === hero.id);
      expect(heal && heal.amount).toBeCloseTo(main.amount * 0.2, 4);
      if (main.crit) crits++;
    }
    // 期望 180 次，标准差约 10
    expect(crits).toBeGreaterThan(140);
    expect(crits).toBeLessThan(220);
    // 技能伤害不暴击、不吸血
    hero.hp = 100;
    for (let i = 0; i < 50; i++) dealDamage(sim, hero, d, 100, 'physical', 'skill');
    const ev = sim.drainEvents();
    expect(eventsOf(ev, 'damage').some((h) => h.crit)).toBe(false);
    expect(eventsOf(ev, 'heal').length).toBe(0);
  });

  it('生命/护甲/法抗/攻速/移速等基础加成直接相加', () => {
    const { sim, hero } = arena('panyue');
    const base = { ...hero.stats };
    buy(sim, hero, 'guardian_plate', 'starweave_cloak', 'boots_fury', 'thorn_mail', 'iron_blade', 'swift_bow');
    const s = hero.stats;
    expect(s.maxHp).toBeCloseTo(base.maxHp + 1000 + 1000 + 500, 6);
    expect(s.armor).toBeCloseTo(base.armor + 210 + 170, 6);
    expect(s.mr).toBeCloseTo(base.mr + 200, 6);
    expect(s.ad).toBeCloseTo(base.ad + 20, 6);
    expect(s.attackSpeed).toBeCloseTo(base.attackSpeed * (1 + 0.25 + 0.15), 6);
    expect(s.moveSpeed).toBeCloseTo(base.moveSpeed + 0.6, 6);
  });
});

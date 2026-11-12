import { describe, expect, it } from 'vitest';
import { addBuff } from '../buffs';
import { formatSkillDesc, HEROES, HERO_IDS } from '../data/heroes';
import type { SimHero, SimUnit } from '../internal';
import { recomputeStats } from '../stats';
import { heroOf, levelTo, place, stepFor } from '../testkit';
import type { AbilitySlot, HeroId, PlayerCommand } from '../types';
import type { Sim } from '../world';
import {
  AREA_THREATS, COMBOS, estimateBasicDamage, estimateComboDamage, estimateSkillDamage, mitigatedDamage, SKILL_INTENT_LIST, SKILL_INTENTS,
  skillAvailable, skillRawDamage, type SkillIntent,
} from './intents';
import { getSkill } from './registry';
import { arena, damageTo, dummyAt, mitigate } from './testutil';

const SLOTS: AbilitySlot[] = ['s1', 's2', 'ult'];

/** 朝 +x 方向、对着 at 处的目标放技能(按技能的施放方式给参数) */
function castToward(sim: Sim, hero: SimHero, intent: SkillIntent, target: SimUnit): void {
  let cmd: PlayerCommand;
  switch (intent.param) {
    case 'dir': cmd = { type: 'cast', slot: intent.slot, dir: { x: target.pos.x - hero.pos.x, y: target.pos.y - hero.pos.y } }; break;
    case 'pos': cmd = { type: 'cast', slot: intent.slot, pos: { x: target.pos.x, y: target.pos.y } }; break;
    case 'target': cmd = { type: 'cast', slot: intent.slot, targetId: target.id }; break;
    default: cmd = { type: 'cast', slot: intent.slot }; break;
  }
  sim.command(hero.id, cmd);
}

/** 满级、带一件物攻装和一件法强装的英雄 + 一个满级磐岳当靶子(不回血) */
function duel(heroId: HeroId, distance: number): { sim: Sim; hero: SimHero; target: SimHero } {
  const { sim, hero } = arena(heroId, 15);
  hero.gold = 99999;
  sim.command(hero.id, { type: 'buy', itemId: 'blood_scythe' });
  sim.command(hero.id, { type: 'buy', itemId: 'astral_staff' });
  const target = heroOf(sim, 1, 'panyue');
  levelTo(sim, target, 15);
  target.rt.base.hpRegen = 0;
  recomputeStats(sim, target);
  place(sim, target, distance, 0, Math.PI);
  hero.mana = hero.stats.maxMana;
  sim.drainEvents();
  return { sim, hero, target };
}

describe('技能意图表', () => {
  it('15 个技能齐全，几何量与数据一致，与脚本的注册选项一致', () => {
    expect(SKILL_INTENT_LIST.length).toBe(15);
    for (const heroId of HERO_IDS) {
      for (const slot of SLOTS) {
        const it = SKILL_INTENTS[heroId][slot];
        const def = HEROES[heroId].skills[slot];
        const impl = getSkill(heroId, slot);
        expect(it.heroId).toBe(heroId);
        expect(it.slot).toBe(slot);
        expect(it.name).toBe(def.name);
        expect(it.cast).toBe(def.cast);
        expect(it.reach).toBeGreaterThan(0);
        expect(it.roles.length).toBeGreaterThan(0);
        // 位移技能 ⇔ 被定身时不可施放；逃生位移 ⇔ 轻点朝移动方向
        expect(impl.movement === true, `${heroId}:${slot} movement`).toBe(it.mobility !== null);
        expect(impl.aim !== 'facing', `${heroId}:${slot} aim`).toBe(it.autoAimsEnemy);
        expect(it.delay).toBeGreaterThanOrEqual(0);
        expect(it.lock).toBeGreaterThanOrEqual(0);
        if (it.damage) {
          for (const key of [it.damage.base, it.damage.ad, it.damage.ap, it.damage.hp, it.damage.missing]) {
            if (key) expect(def.values[key], `${heroId}:${slot} values.${key}`).toBeDefined();
          }
        }
        for (const c of it.cc) expect(c.kind === 'pull' ? c.value : c.duration).toBeGreaterThan(0);
      }
      expect([...COMBOS[heroId]].sort()).toEqual(['s1', 's2', 'ult']);
    }
    expect(AREA_THREATS.telegraph).toBe('incoming');
    expect(AREA_THREATS.chijin_ult_spin).toBe('damage');
    // 几个容易写错的点
    expect(SKILL_INTENTS.panyue.s1.reach).toBeCloseTo(7.5 + 2.6, 6);
    expect(SKILL_INTENTS.panyue.s1.mobility).toMatchObject({ kind: 'dash', stopsAtHero: true, wallBlocked: true });
    expect(SKILL_INTENTS.panyue.ult.mobility).toMatchObject({ kind: 'leap', wallBlocked: false });
    expect(SKILL_INTENTS.panyue.ult.immunity).toBe('unstoppable');
    expect(SKILL_INTENTS.chijin.ult.damage).toMatchObject({ hits: 10, interval: 0.3 });
    expect(SKILL_INTENTS.xingli.ult.damage).toMatchObject({ hits: 5, interval: 0.5 });
    expect(SKILL_INTENTS.fengling.ult.damage).toMatchObject({ hits: 6, interval: 0.5 });
    expect(SKILL_INTENTS.fengling.s2.autoAimsEnemy).toBe(false);
    expect(SKILL_INTENTS.fengling.s2.damage).toBeNull();
    expect(SKILL_INTENTS.yeque.s2.damage).toMatchObject({ hits: 3, repeatRatio: 0.5 });
    expect(SKILL_INTENTS.yeque.s2.blockedByMinions).toBe(true);
    expect(SKILL_INTENTS.yeque.ult.mobility).toMatchObject({ kind: 'blink', destination: 'behindTarget' });
    expect(SKILL_INTENTS.yeque.ult.immunity).toBe('untargetable');
  });

  it('伤害估算与实际施放一致(每个带伤害的技能，全部段数命中)', () => {
    for (const heroId of HERO_IDS) {
      for (const slot of SLOTS) {
        const intent = SKILL_INTENTS[heroId][slot];
        if (!intent.damage) continue;
        // 贴近一点：影刃三枚全中、冲锋/突进都能碰到
        const { sim, hero, target } = duel(heroId, 2.5);
        target.hp = target.stats.maxHp * 0.6;
        const estimate = estimateSkillDamage(hero, slot, target);
        expect(estimate, `${heroId}:${slot}`).toBeGreaterThan(0);
        castToward(sim, hero, intent, target);
        const ev = sim.drainEvents().concat(stepFor(sim, 5));
        const hits = damageTo(ev, hero, target).filter((d) => d.skill);
        expect(hits.length, `${heroId}:${slot} hits`).toBe(intent.damage.hits);
        const total = hits.reduce((sum, d) => sum + d.amount, 0);
        expect(total, `${heroId}:${slot} total`).toBeCloseTo(estimate, 2);
        expect(hits[0].dtype).toBe(intent.damage.type);
        expect(target.alive).toBe(true);
      }
    }
  });

  it('估算细节：部分段数、小兵减伤比例、夜阙被动、减伤 buff、连招合计', () => {
    const { sim, hero, target } = duel('fengling', 4);
    const d = SKILL_INTENTS.fengling.s1.damage;
    if (!d) throw new Error('no damage');
    const raw = skillRawDamage(hero, 's1');
    expect(raw).toBeCloseTo(630 + 1.1 * hero.stats.ad, 6);
    const minion = dummyAt(sim, 3, 3);
    expect(skillRawDamage(hero, 's1', minion)).toBeCloseTo(raw * 0.6, 6);
    expect(estimateSkillDamage(hero, 's1', minion)).toBeCloseTo(mitigate(raw * 0.6, minion.stats.armor), 6);
    // 箭雨只算 2 跳
    expect(skillRawDamage(hero, 'ult', target, 2)).toBeCloseTo(2 * (210 + 0.4 * hero.stats.ad), 6);
    expect(skillRawDamage(hero, 'ult', target, 99)).toBeCloseTo(6 * (210 + 0.4 * hero.stats.ad), 6);
    expect(skillRawDamage(hero, 's2')).toBe(0);
    expect(mitigatedDamage(1000, 'true', hero, target)).toBe(1000);
    expect(mitigatedDamage(1000, 'physical', hero, target)).toBeCloseTo(mitigate(1000, target.stats.armor, hero.stats.armorPen), 6);
    expect(estimateBasicDamage(hero, target)).toBeCloseTo(mitigate(hero.stats.ad, target.stats.armor), 6);
    // 连招合计 = 可用技能之和；冷却中/蓝不够的不计
    const all = estimateSkillDamage(hero, 's1', target) + estimateSkillDamage(hero, 'ult', target);
    expect(estimateComboDamage(hero, target)).toBeCloseTo(all, 6);
    hero.skills.ult.cd = 5;
    expect(skillAvailable(hero, 'ult')).toBe(false);
    expect(estimateComboDamage(hero, target)).toBeCloseTo(estimateSkillDamage(hero, 's1', target), 6);
    hero.mana = 10;
    expect(estimateComboDamage(hero, target)).toBe(0);

    // 夜阙：低血增伤与已损生命项
    const y = duel('yeque', 4);
    y.target.hp = y.target.stats.maxHp * 0.35;
    const missing = y.target.stats.maxHp * 0.65;
    const rawUlt = 740 + 1.2 * y.hero.stats.ad + 0.2 * missing;
    expect(skillRawDamage(y.hero, 'ult', y.target)).toBeCloseTo(rawUlt, 4);
    const expected = mitigate(rawUlt * 1.18, y.target.stats.armor);
    expect(estimateSkillDamage(y.hero, 'ult', y.target)).toBeCloseTo(expected, 4);
    y.sim.command(y.hero.id, { type: 'cast', slot: 'ult', targetId: y.target.id });
    const hit = damageTo(stepFor(y.sim, 0.5), y.hero, y.target);
    expect(hit[0].amount).toBeCloseTo(expected, 2);
    // 没学会的技能估算为 0
    const fresh = arena('yeque', 1);
    expect(skillRawDamage(fresh.hero, 'ult')).toBe(0);
    expect(skillAvailable(fresh.hero, 'ult')).toBe(false);
    expect(skillAvailable(fresh.hero, 's1')).toBe(true);
  });

  it('reach：刚好在有效距离内的英雄会被打到，明显超出的不会', () => {
    for (const heroId of HERO_IDS) {
      for (const slot of SLOTS) {
        const intent = SKILL_INTENTS[heroId][slot];
        if (!intent.damage) continue;
        for (const [offset, expected] of [[-0.15, true], [0.9, false]] as const) {
          const { sim, hero, target } = duel(heroId, 1);
          // 沿 -x → +x 摆开，给长射程技能留够场地
          place(sim, hero, -8, 0, 0);
          place(sim, target, -8 + intent.reach + target.radius + offset, 0, Math.PI);
          castToward(sim, hero, intent, target);
          const hit = damageTo(sim.drainEvents().concat(stepFor(sim, 1.5)), hero, target).length > 0;
          expect(hit, `${heroId}:${slot} at reach${offset >= 0 ? '+' : ''}${offset}`).toBe(expected);
        }
      }
    }
  });
});

describe('BotView.skillReady 与施法管线一致', () => {
  it('位移技能被定身时不可用；回城引导中不可再次回城；沉默只影响英雄技能', () => {
    const { sim, hero } = arena('yeque', 4);
    const view = sim.botView(hero.id);
    if (!view) throw new Error('no view');
    for (const slot of ['s1', 's2', 'ult', 'recall', 'heal', 'flash'] as const) expect(view.skillReady(slot)).toBe(true);
    addBuff(sim, hero, 'root', { duration: 1 });
    expect(view.skillReady('s1')).toBe(false);
    expect(view.skillReady('ult')).toBe(false);
    expect(view.skillReady('s2')).toBe(true);
    stepFor(sim, 1.1);
    addBuff(sim, hero, 'silence', { duration: 1 });
    expect(view.skillReady('s1')).toBe(false);
    expect(view.skillReady('flash')).toBe(true);
    stepFor(sim, 1.1);
    sim.command(hero.id, { type: 'cast', slot: 'recall' });
    stepFor(sim, 1.2);
    expect(hero.skills.recall.cd).toBe(0);
    expect(view.skillReady('recall')).toBe(false);
    hero.mana = 0;
    expect(view.skillReady('s1')).toBe(false);
  });
});

describe('技能描述', () => {
  it('formatSkillDesc：所有占位符都能解析；等级数组长度正确', () => {
    for (const heroId of HERO_IDS) {
      for (const slot of SLOTS) {
        const def = HEROES[heroId].skills[slot];
        expect(def.cooldown.length).toBe(def.maxLevel);
        expect(def.manaCost.length).toBe(def.maxLevel);
        for (const v of Object.values(def.values)) if (Array.isArray(v)) expect(v.length).toBe(def.maxLevel);
        for (let level = 0; level <= def.maxLevel; level++) {
          const text = formatSkillDesc(def, level);
          expect(text.includes('{'), `${heroId}:${slot} lv${level}: ${text}`).toBe(false);
          expect(text.includes('NaN')).toBe(false);
        }
      }
    }
    expect(formatSkillDesc(HEROES.panyue.skills.s1, 1)).toContain('240(+60%物攻)');
    expect(formatSkillDesc(HEROES.panyue.skills.s1, 0)).toContain('240/300/360/420/480/540');
    expect(formatSkillDesc(HEROES.yeque.skills.ult, 3)).toContain('740(+120%物攻) 外加目标 20% 已损生命');
  });

  it('被动描述里写死的数字与 passive.values 一致', () => {
    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    const p = HEROES.panyue.passive;
    for (const s of ['每第三次', `${pct(p.values.hpRatio)} 最大生命`, `减速 ${pct(p.values.slow)}`, `持续 ${p.values.slowDur} 秒`]) expect(p.desc).toContain(s);
    expect(p.values.hits).toBe(3);
    const c = HEROES.chijin.passive;
    for (const s of [`${c.values.window} 秒内`, `${c.values.damage}(+${pct(c.values.adRatio)}物攻)`, `${pct(c.values.healHpRatio)} 最大生命`]) expect(c.desc).toContain(s);
    const x = HEROES.xingli.passive;
    for (const s of [`持续 ${x.values.duration} 秒`, `叠满 ${x.values.stacks} 层`, `${pct(x.values.hpRatio)} 最大生命`, `上限 ${x.values.cap}`, `眩晕 ${x.values.stun} 秒`]) expect(x.desc).toContain(s);
    const f = HEROES.fengling.passive;
    for (const s of [`最多 ${f.values.maxStacks} 层`, `持续 ${f.values.duration} 秒`, `每层提高 ${pct(f.values.asPerStack)} 攻速`, `移速提高 ${pct(f.values.haste)}`, `${f.values.bonus}(+每级 ${f.values.bonusPerLevel})`]) expect(f.desc).toContain(s);
    const y = HEROES.yeque.passive;
    for (const s of [`低于 ${pct(y.values.threshold)}`, `提高 ${pct(y.values.bonus)}`, `回复 ${pct(y.values.healHpRatio)} 最大生命`, `对野怪造成的伤害提高 ${pct(y.values.monsterBonus)}`]) expect(y.desc).toContain(s);
    // 技能描述里写死的两个数字
    expect(HEROES.yeque.skills.s2.desc).toContain(`${HEROES.yeque.skills.s2.values.blades} 枚影刃`);
    expect(HEROES.yeque.skills.s2.desc).toContain(`${pct(HEROES.yeque.skills.s2.values.repeatRatio as number)} 伤害`);
    expect(HEROES.fengling.skills.s1.desc).toContain(`${pct(HEROES.fengling.skills.s1.values.minionRatio as number)} 伤害`);
  });
});

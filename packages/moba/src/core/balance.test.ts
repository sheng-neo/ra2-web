/**
 * 平衡阶段加进引擎的规则：终局加速(建筑变脆、小兵变强、复活变慢)与史诗野怪的仇恨交接。
 */
import { describe, expect, it } from 'vitest';
import { dealDamage } from './combat';
import { ENDGAME, MINIONS, respawnTime } from './data/units';
import { createMinion } from './entity';
import { MON_COMBAT } from './internal';
import { heroOf, levelTo, place, quietWorld, stepFor } from './testkit';
import { createWorld } from './world';

describe('终局加速', () => {
  it('start 之前建筑受到的伤害不变，之后每分钟线性增加；新出生的小兵同步变强', () => {
    const sim = quietWorld();
    const a = heroOf(sim, 0, 'fengling');
    const tower = sim.towers[1].mid[0];
    expect(tower).not.toBeNull();
    if (!tower) return;
    // 关掉「防偷塔」减伤，只看时间的影响
    tower.rt.thinkAt = Infinity;
    tower.rt.backdoor = false;
    const hit = (): number => dealDamage(sim, a, tower, 1000, 'true');
    const base = hit();
    expect(base).toBeCloseTo(1000, 6);
    const early = createMinion(sim, 0, 'mid', 'melee', { x: 0, y: 0 });

    // 把时钟拨到 start 之后 4 分钟
    const minutes = 4;
    sim.state.tick = Math.round((ENDGAME.start + minutes * 60) * 30);
    sim.state.time = sim.state.tick / 30;
    expect(hit()).toBeCloseTo(1000 * (1 + minutes * ENDGAME.structureVulnPerMin), 3);
    // 英雄受到的伤害不受影响
    const foe = heroOf(sim, 1, 'panyue');
    expect(dealDamage(sim, a, foe, 500, 'true')).toBeCloseTo(500, 6);

    const late = createMinion(sim, 0, 'mid', 'melee', { x: 0, y: 0 });
    const t = sim.state.time / 60;
    const boost = 1 + minutes * ENDGAME.minionBoostPerMin;
    expect(late.stats.maxHp).toBeCloseTo((MINIONS.melee.hp + MINIONS.melee.hpPerMin * t) * boost, 3);
    expect(late.stats.ad).toBeCloseTo((MINIONS.melee.ad + MINIONS.melee.adPerMin * t) * boost, 3);
    expect(late.stats.maxHp).toBeGreaterThan(early.stats.maxHp * 2);
  });

  it('复活时间随等级与对局时间增长，有上限', () => {
    expect(respawnTime(1, 0)).toBeLessThan(10);
    expect(respawnTime(10, 300)).toBeGreaterThan(respawnTime(5, 300));
    expect(respawnTime(15, 900)).toBeGreaterThan(respawnTime(15, 600));
    expect(respawnTime(15, 5000)).toBeLessThanOrEqual(60);
  });
});

describe('史诗野怪仇恨', () => {
  it('第一个被盯上的人撤走后，仇恨交给还在打它的人，而不是整只脱战回血', () => {
    const sim = createWorld({ seed: 3, playerHero: 'panyue', difficulty: 'normal' }, { noBots: true, noWaves: true });
    // 等河道巨龙刷新
    stepFor(sim, 121);
    const drake = sim.units.find((u) => u.kind === 'monster' && u.monsterType === 'abyss_drake');
    expect(drake).toBeDefined();
    if (!drake || drake.kind !== 'monster') return;
    const tank = heroOf(sim, 0, 'panyue');
    const carry = heroOf(sim, 0, 'fengling');
    levelTo(sim, tank, 10);
    levelTo(sim, carry, 10);
    place(sim, tank, drake.pos.x - 3, drake.pos.y);
    place(sim, carry, drake.pos.x + 6, drake.pos.y);
    sim.command(tank.id, { type: 'attack', targetId: drake.id });
    stepFor(sim, 1.5);
    expect(drake.targetId).toBe(tank.id);
    sim.command(carry.id, { type: 'attack', targetId: drake.id });
    stepFor(sim, 2);
    const hpBefore = drake.hp;
    expect(hpBefore).toBeLessThan(drake.stats.maxHp);
    // 坦克闪现 + 走开，远离营地
    place(sim, tank, drake.pos.x - 30, drake.pos.y - 5);
    sim.command(tank.id, { type: 'stop' });
    stepFor(sim, 1.5);
    expect(drake.mon.state).toBe(MON_COMBAT);
    expect(drake.targetId).toBe(carry.id);
    // 没有回血：还在继续掉血
    expect(drake.hp).toBeLessThan(hpBefore);
    // 所有人都走了才脱战回血
    place(sim, carry, drake.pos.x + 30, drake.pos.y + 5);
    sim.command(carry.id, { type: 'stop' });
    stepFor(sim, 4);
    expect(drake.mon.state).not.toBe(MON_COMBAT);
    expect(drake.hp).toBeGreaterThan(hpBefore);
  });
});

import { describe, expect, it } from 'vitest';
import { addBuff, buffStacks, findBuff, hasBuff } from '../buffs';
import { resolveBasicHit } from '../combat';
import { HEROES } from '../data/heroes';
import { eventsOf, stepFor } from '../testkit';
import { TICK_DT, type GameEvent } from '../types';
import { arena, damageTo, dist, dummyAt, enemyAt, fxOf, mitigate, val } from './testutil';

const P = HEROES.fengling.passive.values;

describe('风翎 · 被动 风之眷顾', () => {
  it('普攻命中叠层：每层 +7% 攻速；满 5 层 +10% 移速且普攻附带 30(+每级5) 物理伤害；3 秒不续则消失', () => {
    const { sim, hero } = arena('fengling', 3);
    const d = dummyAt(sim, 5, 0, 'siege');
    const as0 = hero.stats.attackSpeed;
    const ms0 = hero.stats.moveSpeed;
    sim.command(hero.id, { type: 'attack', targetId: d.id });
    const amounts: number[] = [];
    const stacks: number[] = [];
    for (let i = 0; i < 30 * 8 && amounts.length < 8; i++) {
      sim.step();
      for (const e of damageTo(sim.drainEvents(), hero, d)) {
        amounts.push(e.amount);
        stacks.push(buffStacks(hero, 'fengling_gale'));
        const n = stacks[stacks.length - 1];
        expect(hero.stats.attackSpeed).toBeCloseTo(as0 * (1 + n * P.asPerStack), 6);
        expect(hero.stats.moveSpeed).toBeCloseTo(n >= P.maxStacks ? ms0 * (1 + P.haste) : ms0, 6);
      }
    }
    expect(stacks).toEqual([1, 2, 3, 4, 5, 5, 5, 5]);
    const plain = mitigate(hero.stats.ad, d.stats.armor);
    const boosted = mitigate(hero.stats.ad + P.bonus + P.bonusPerLevel * hero.level, d.stats.armor);
    expect(P.bonus + P.bonusPerLevel * hero.level).toBe(45);
    // 满层之后的普攻才带附加伤害(并入普攻本体，一个伤害数字)
    for (let i = 0; i < 5; i++) expect(amounts[i]).toBeCloseTo(plain, 4);
    for (let i = 5; i < 8; i++) expect(amounts[i]).toBeCloseTo(boosted, 4);
    const gale = findBuff(hero, 'fengling_gale');
    expect(gale && gale.duration).toBe(P.duration);
    sim.command(hero.id, { type: 'stop' });
    stepFor(sim, P.duration + 0.6);
    expect(hasBuff(hero, 'fengling_gale')).toBe(false);
    expect(hero.stats.attackSpeed).toBeCloseTo(as0, 6);
    expect(hero.stats.moveSpeed).toBeCloseTo(ms0, 6);
  });

  it('打建筑照样叠攻速层数，但满层附加伤害不对建筑生效', () => {
    const { sim, hero } = arena('fengling');
    const tower = sim.towers[1].mid[0];
    if (!tower) throw new Error('no tower');
    tower.rt.backdoor = false;
    for (let i = 0; i < 5; i++) resolveBasicHit(sim, hero, tower, hero.stats.ad, 'physical', 1, 1);
    expect(buffStacks(hero, 'fengling_gale')).toBe(5);
    sim.drainEvents();
    resolveBasicHit(sim, hero, tower, hero.stats.ad, 'physical', 1, 1);
    const hit = damageTo(sim.drainEvents(), hero, tower);
    expect(hit.length).toBe(1);
    expect(hit[0].amount).toBeCloseTo(mitigate(hero.stats.ad, tower.stats.armor), 4);
  });
});

describe('风翎 · S1 贯风矢', () => {
  it('穿透小兵(60% 伤害)，命中第一个敌方英雄即停：全额物理伤害 + 减速；其后的敌人不受影响', () => {
    const { sim, hero } = arena('fengling', 1, -7, 0);
    const m1 = dummyAt(sim, -3, 0);
    const a = enemyAt(sim, 'chijin', 1, 0);
    const b = enemyAt(sim, 'xingli', 4, 0);
    const m2 = dummyAt(sim, 6, 0);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    // 「蓄力」：出手点之前没有箭
    let ev = sim.drainEvents().concat(stepFor(sim, 3 * TICK_DT));
    expect(sim.projectiles.length).toBe(0);
    expect(hero.anim).toBe('cast_s1');
    ev = ev.concat(stepFor(sim, TICK_DT));
    expect(sim.projectiles[0]).toMatchObject({ visual: 'fengling_s1', speed: 32, maxRange: 14, radius: 0.65 });
    expect(fxOf(ev, 'fengling_s1_cast')[0].dir).toEqual({ x: 1, y: 0 });
    ev = ev.concat(stepFor(sim, 0.6));
    const raw = val(hero, 's1', 'damage') + val(hero, 's1', 'adRatio') * hero.stats.ad;
    expect(raw).toBeCloseTo(280 + 1.1 * hero.stats.ad, 6);
    const hm = damageTo(ev, hero, m1);
    expect(hm.length).toBe(1);
    expect(hm[0].amount).toBeCloseTo(mitigate(raw * 0.6, m1.stats.armor), 4);
    expect(hasBuff(m1, 'slow')).toBe(false);
    const ha = damageTo(ev, hero, a);
    expect(ha.length).toBe(1);
    expect(ha[0]).toMatchObject({ dtype: 'physical', skill: true });
    expect(ha[0].amount).toBeCloseTo(mitigate(raw, a.stats.armor), 4);
    const slow = findBuff(a, 'slow');
    expect(slow && slow.value).toBe(val(hero, 's1', 'slow'));
    expect(slow && slow.duration).toBe(val(hero, 's1', 'slowDur'));
    expect(damageTo(ev, hero, b).length).toBe(0);
    expect(damageTo(ev, hero, m2).length).toBe(0);
    const end = eventsOf(ev, 'projectileEnd');
    expect(end.length).toBe(1);
    expect(end[0].pos.x).toBeLessThan(1);
    expect(sim.projectiles.length).toBe(0);
  });

  it('路上没有英雄：一直穿到 14 米射程尽头', () => {
    const { sim, hero } = arena('fengling', 1, -7, 0);
    const m1 = dummyAt(sim, -3, 0);
    const m2 = dummyAt(sim, 6, 0);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    const ev = stepFor(sim, 0.8);
    expect(damageTo(ev, hero, m1).length).toBe(1);
    expect(damageTo(ev, hero, m2).length).toBe(1);
    expect(eventsOf(ev, 'projectileEnd')[0].pos.x).toBeCloseTo(7, 3);
  });
});

describe('风翎 · S2 逐风步', () => {
  it('轻点朝面向/移动方向翻跃(不会冲向敌人)；落地后 +20% 移速 2 秒，下一次普攻必暴且只一次', () => {
    const { sim, hero } = arena('fengling', 2);
    const e = enemyAt(sim, 'panyue', 0, 5);
    const ms0 = hero.stats.moveSpeed;
    sim.command(hero.id, { type: 'cast', slot: 's2' });
    let ev = sim.drainEvents();
    const fx = fxOf(ev, 'fengling_s2_dash');
    expect(fx.length).toBe(1);
    expect(fx[0].from).toEqual({ x: 0, y: 0 });
    expect(fx[0].to && fx[0].to.x).toBeCloseTo(5, 3);
    // 翻跃途中还没有增益
    sim.step();
    expect(hero.anim).toBe('dash');
    expect(hasBuff(hero, 'fengling_crit')).toBe(false);
    stepFor(sim, 0.3);
    expect(hero.pos.x).toBeCloseTo(5, 3);
    expect(hero.pos.y).toBeCloseTo(0, 6);
    const haste = findBuff(hero, 'haste');
    expect(haste && haste.value).toBe(val(hero, 's2', 'haste'));
    expect(haste && haste.duration).toBe(val(hero, 's2', 'hasteDur'));
    expect(hero.stats.moveSpeed).toBeCloseTo(ms0 * 1.2, 6);
    const crit = findBuff(hero, 'fengling_crit');
    expect(crit && crit.duration).toBe(val(hero, 's2', 'critWindow'));
    // 下一次普攻必暴(暴击率为 0)
    expect(hero.stats.critChance).toBe(0);
    sim.command(hero.id, { type: 'attack', targetId: e.id });
    ev = stepFor(sim, 2.2);
    const hits = damageTo(ev, hero, e);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0].crit).toBe(true);
    expect(hits[0].amount).toBeCloseTo(mitigate(hero.stats.ad * hero.stats.critDamage, e.stats.armor), 4);
    expect(hits[1].crit).toBe(false);
    expect(fxOf(ev, 'hit_crit').length).toBe(1);
    expect(hasBuff(hero, 'fengling_crit')).toBe(false);
    expect(hasBuff(hero, 'haste')).toBe(false);
  });

  it('正在用摇杆移动时朝移动方向翻跃；手动给方向则按给定方向；撞墙即停；必暴窗口 4 秒', () => {
    const a = arena('fengling', 2);
    enemyAt(a.sim, 'panyue', 4, 0);
    a.sim.command(a.hero.id, { type: 'move', dir: { x: 0, y: -1 } });
    stepFor(a.sim, 0.2);
    const y0 = a.hero.pos.y;
    a.sim.command(a.hero.id, { type: 'cast', slot: 's2' });
    stepFor(a.sim, 7 * TICK_DT);
    // 5 米翻跃 + 落地后继续按摇杆方向走
    expect(a.hero.pos.y).toBeLessThan(y0 - 5);
    expect(a.hero.pos.x).toBeCloseTo(0, 6);

    const b = arena('fengling', 2);
    b.sim.command(b.hero.id, { type: 'cast', slot: 's2', dir: { x: -3, y: 0 } });
    stepFor(b.sim, 0.3);
    expect(b.hero.pos.x).toBeCloseTo(-5, 3);
    stepFor(b.sim, val(b.hero, 's2', 'critWindow') - 0.5);
    expect(hasBuff(b.hero, 'fengling_crit')).toBe(true);
    stepFor(b.sim, 0.5);
    expect(hasBuff(b.hero, 'fengling_crit')).toBe(false);

    const c = arena('fengling', 2, -49, 0);
    c.sim.command(c.hero.id, { type: 'cast', slot: 's2', dir: { x: 1, y: 0 } });
    const ev = stepFor(c.sim, 0.3);
    expect(c.hero.pos.x).toBeLessThan(-46.5);
    expect(c.sim.nav.isFree(c.hero.pos.x, c.hero.pos.y, c.hero.rt.navR - 0.06)).toBe(true);
    const fx = fxOf(ev, 'fengling_s2_dash')[0];
    expect(fx.to && dist(fx.to, c.hero.pos)).toBeLessThan(0.25);
    // 被定身时放不出来
    c.hero.skills.s2.cd = 0;
    addBuff(c.sim, c.hero, 'root', { duration: 1 });
    c.sim.drainEvents();
    c.sim.command(c.hero.id, { type: 'cast', slot: 's2' });
    expect(eventsOf(c.sim.drainEvents(), 'reject')[0].reason).toBe('disabled');
  });
});

describe('风翎 · 大招 千羽天幕', () => {
  it('预警 0.5 秒 → 箭雨 3 秒共 6 跳：物理伤害 + 减速 35%', () => {
    const { sim, hero } = arena('fengling', 4);
    const a = enemyAt(sim, 'panyue', 8, 3);
    const out = enemyAt(sim, 'chijin', 8, 7);
    sim.command(hero.id, { type: 'cast', slot: 'ult', pos: { x: 8, y: 0 } });
    const first = sim.drainEvents();
    expect(fxOf(first, 'fengling_ult_cast').length).toBe(1);
    expect(eventsOf(first, 'areaSpawn')[0]).toMatchObject({ visual: 'telegraph', pos: { x: 8, y: 0 }, radius: 5, duration: 0.5 });
    const hitTicks: number[] = [];
    let all: GameEvent[] = [];
    let slowSeen = 0;
    for (let i = 1; i <= 30 * 4; i++) {
      sim.step();
      const ev = sim.drainEvents();
      all = all.concat(ev);
      if (damageTo(ev, hero, a).length > 0) {
        hitTicks.push(i);
        const slow = findBuff(a, 'slow');
        if (slow && slow.value === val(hero, 'ult', 'slow') && slow.duration === val(hero, 'ult', 'slowDur')) slowSeen++;
      }
    }
    expect(hitTicks).toEqual([15, 30, 45, 60, 75, 90]);
    expect(slowSeen).toBe(6);
    const raw = val(hero, 'ult', 'damage') + val(hero, 'ult', 'adRatio') * hero.stats.ad;
    expect(raw).toBeCloseTo(110 + 0.4 * hero.stats.ad, 6);
    for (const h of damageTo(all, hero, a)) expect(h.amount).toBeCloseTo(mitigate(raw, a.stats.armor), 4);
    expect(damageTo(all, hero, out).length).toBe(0);
    const rain = eventsOf(all, 'areaSpawn').find((e) => e.visual === 'fengling_ult_rain');
    expect(rain).toMatchObject({ pos: { x: 8, y: 0 }, radius: 5, duration: 3 });
    const ticks = fxOf(all, 'fengling_ult_tick');
    expect(ticks.length).toBe(6);
    expect(ticks[0]).toMatchObject({ pos: { x: 8, y: 0 }, radius: 5 });
    expect(eventsOf(all, 'areaEnd').map((e) => e.visual)).toEqual(['telegraph', 'fengling_ult_rain']);
    expect(hasBuff(a, 'slow')).toBe(false);
  });
});

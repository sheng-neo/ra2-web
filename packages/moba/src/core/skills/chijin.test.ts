import { describe, expect, it } from 'vitest';
import { addBuff, findBuff, hasBuff } from '../buffs';
import { dealDamage, killUnit } from '../combat';
import { HEROES } from '../data/heroes';
import { eventsOf, stepFor } from '../testkit';
import { TICK_DT } from '../types';
import { CAST_POINT } from './timing';
import { arena, damageTo, dist, dummyAt, enemyAt, fxOf, mitigate, val } from './testutil';

const P = HEROES.chijin.passive.values;
const DEG = Math.PI / 180;

describe('赤烬 · 被动 余烬之刃', () => {
  it('放技能后 4 秒内的下一次普攻：+60(+40%物攻) 物理伤害并回复 4% 最大生命，只触发一次', () => {
    const { sim, hero } = arena('chijin');
    const d = dummyAt(sim, 2.5, 0, 'siege');
    hero.hp = 1000;
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    const ember = findBuff(hero, 'chijin_ember');
    expect(ember && ember.duration).toBe(P.window);
    sim.command(hero.id, { type: 'attack', targetId: d.id });
    const ev = stepFor(sim, 2);
    const basics = damageTo(ev, hero, d).filter((e) => !e.skill);
    expect(basics.length).toBe(2);
    const ad = hero.stats.ad;
    expect(basics[0].amount).toBeCloseTo(mitigate(ad + P.damage + P.adRatio * ad, d.stats.armor), 4);
    expect(basics[1].amount).toBeCloseTo(mitigate(ad, d.stats.armor), 4);
    const heals = eventsOf(ev, 'heal').filter((e) => e.targetId === hero.id);
    expect(heals.length).toBe(1);
    expect(heals[0].amount).toBeCloseTo(hero.stats.maxHp * P.healHpRatio, 4);
    expect(fxOf(ev, 'chijin_passive_hit').map((e) => e.targetId)).toEqual([d.id]);
    expect(hasBuff(hero, 'chijin_ember')).toBe(false);
  });

  it('窗口过期后不再强化；召唤师技能不触发', () => {
    const { sim, hero } = arena('chijin');
    const d = dummyAt(sim, 2.5, 0, 'siege');
    sim.command(hero.id, { type: 'cast', slot: 'heal' });
    expect(hasBuff(hero, 'chijin_ember')).toBe(false);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: -1, y: 0 } });
    expect(hasBuff(hero, 'chijin_ember')).toBe(true);
    stepFor(sim, P.window + 0.1);
    expect(hasBuff(hero, 'chijin_ember')).toBe(false);
    sim.command(hero.id, { type: 'attack', targetId: d.id });
    const hit = damageTo(stepFor(sim, 0.8), hero, d);
    expect(hit.length).toBe(1);
    expect(hit[0].amount).toBeCloseTo(mitigate(hero.stats.ad, d.stats.armor), 4);
  });
});

describe('赤烬 · S1 烈焰斩', () => {
  it('在出手点结算：110° 扇形内的敌人受物理伤害并减速，扇形外/射程外不受影响', () => {
    const { sim, hero } = arena('chijin');
    const front = enemyAt(sim, 'xingli', 4, 0);
    const edge = dummyAt(sim, 4 * Math.cos(50 * DEG), 4 * Math.sin(50 * DEG));
    const side = dummyAt(sim, 4 * Math.cos(72 * DEG), 4 * Math.sin(72 * DEG));
    const behind = dummyAt(sim, -3, 0);
    const far = enemyAt(sim, 'fengling', 7, 0);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    const castTime = HEROES.chijin.skills.s1.castTime;
    // 按键瞬间还没有伤害
    expect(eventsOf(sim.drainEvents(), 'damage').length).toBe(0);
    const early = stepFor(sim, castTime * CAST_POINT - TICK_DT);
    expect(eventsOf(early, 'damage').length).toBe(0);
    expect(hero.anim).toBe('cast_s1');
    expect(hero.animDur).toBe(castTime);
    const ev = stepFor(sim, 2 * TICK_DT);
    const raw = val(hero, 's1', 'damage') + val(hero, 's1', 'adRatio') * hero.stats.ad;
    expect(raw).toBeCloseTo(220 + 0.7 * hero.stats.ad, 6);
    const hit = damageTo(ev, hero, front);
    expect(hit.length).toBe(1);
    expect(hit[0]).toMatchObject({ dtype: 'physical', skill: true, crit: false });
    expect(hit[0].amount).toBeCloseTo(mitigate(raw, front.stats.armor), 4);
    expect(damageTo(ev, hero, edge).length).toBe(1);
    expect(damageTo(ev, hero, side).length).toBe(0);
    expect(damageTo(ev, hero, behind).length).toBe(0);
    expect(damageTo(ev, hero, far).length).toBe(0);
    const slow = findBuff(front, 'slow');
    expect(slow && slow.value).toBe(val(hero, 's1', 'slow'));
    expect(slow && slow.duration).toBe(val(hero, 's1', 'slowDur'));
    expect(hasBuff(far, 'slow')).toBe(false);
    const fx = fxOf(ev, 'chijin_s1_slash');
    expect(fx.length).toBe(1);
    expect(fx[0]).toMatchObject({ pos: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, radius: 5.5 });
    expect(fx[0].angle).toBeCloseTo(110 * DEG, 9);
    // 每个命中的目标一朵火花
    expect(fxOf(ev, 'hit_physical').length).toBe(2);
  });

  it('出手前阵亡则不出刀；出手前被眩晕不影响这一刀', () => {
    const a = arena('chijin');
    const t1 = enemyAt(a.sim, 'xingli', 3, 0);
    a.sim.command(a.hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    killUnit(a.sim, a.hero, null);
    expect(damageTo(stepFor(a.sim, 0.3), a.hero, t1).length).toBe(0);

    const b = arena('chijin');
    const t2 = enemyAt(b.sim, 'xingli', 3, 0);
    b.sim.command(b.hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    addBuff(b.sim, b.hero, 'stun', { duration: 0.5 });
    expect(damageTo(stepFor(b.sim, 0.3), b.hero, t2).length).toBe(1);
  });
});

describe('赤烬 · S2 炎步', () => {
  it('突进 5.5 米，路径上的敌人各受一次物理伤害；获得 40% 攻速 4 秒', () => {
    const { sim, hero } = arena('chijin', 2, -3, 0);
    const onPath = dummyAt(sim, -1, 0.5);
    const heroOnPath = enemyAt(sim, 'xingli', 1, -0.8);
    const off = dummyAt(sim, 0, 3);
    const as0 = hero.stats.attackSpeed;
    sim.command(hero.id, { type: 'cast', slot: 's2', dir: { x: 1, y: 0 } });
    const blaze = findBuff(hero, 'chijin_blaze');
    expect(blaze && blaze.value).toBe(0.4);
    expect(blaze && blaze.duration).toBe(4);
    expect(hero.stats.attackSpeed).toBeCloseTo(as0 * 1.4, 6);
    sim.step();
    expect(hero.anim).toBe('dash');
    const ev = sim.drainEvents().concat(stepFor(sim, 0.4));
    expect(hero.pos.x).toBeCloseTo(2.5, 3);
    const raw = val(hero, 's2', 'damage') + val(hero, 's2', 'adRatio') * hero.stats.ad;
    expect(raw).toBeCloseTo(150 + 0.5 * hero.stats.ad, 6);
    const h1 = damageTo(ev, hero, onPath);
    const h2 = damageTo(ev, hero, heroOnPath);
    expect(h1.length).toBe(1);
    expect(h2.length).toBe(1);
    expect(h1[0].amount).toBeCloseTo(mitigate(raw, onPath.stats.armor), 4);
    expect(h2[0].amount).toBeCloseTo(mitigate(raw, heroOnPath.stats.armor), 4);
    expect(damageTo(ev, hero, off).length).toBe(0);
    const fx = fxOf(ev, 'chijin_s2_dash');
    expect(fx.length).toBe(1);
    expect(fx[0].from).toEqual({ x: -3, y: 0 });
    expect(fx[0].to && fx[0].to.x).toBeCloseTo(2.5, 3);
    // 冲刺耗时 ≈ 距离 / dashSpeed
    expect(hero.rt.dash).toBeNull();
    stepFor(sim, 4);
    expect(hasBuff(hero, 'chijin_blaze')).toBe(false);
    expect(hero.stats.attackSpeed).toBeCloseTo(as0, 6);
  });

  it('撞墙即停，特效的终点就是实际停下的位置', () => {
    const { sim, hero } = arena('chijin', 2, -49.5, 0);
    sim.command(hero.id, { type: 'cast', slot: 's2', dir: { x: 1, y: 0 } });
    const ev = stepFor(sim, 0.4);
    expect(hero.pos.x).toBeLessThan(-46.5);
    expect(sim.nav.isFree(hero.pos.x, hero.pos.y, hero.rt.navR - 0.06)).toBe(true);
    const fx = fxOf(ev, 'chijin_s2_dash')[0];
    expect(fx.to && dist(fx.to, hero.pos)).toBeLessThan(0.25);
  });
});

describe('赤烬 · 大招 焚天旋舞', () => {
  it('3 秒内 10 跳物理伤害；spin 动画；可移动、区域跟随；免疫减速、减伤 25%、不能普攻', () => {
    const { sim, hero } = arena('chijin', 4);
    const a = enemyAt(sim, 'panyue', 3, 0);
    const out = enemyAt(sim, 'xingli', 6.5, 0);
    const speed = hero.stats.moveSpeed;
    // 起手时身上已有的减速被解除
    addBuff(sim, hero, 'slow', { duration: 10, value: 0.3 });
    expect(hero.stats.moveSpeed).toBeCloseTo(speed * 0.7, 6);
    sim.command(hero.id, { type: 'cast', slot: 'ult' });
    expect(hasBuff(hero, 'slow')).toBe(false);
    expect(hero.stats.moveSpeed).toBeCloseTo(speed, 6);
    let ev = sim.drainEvents();
    expect(fxOf(ev, 'chijin_ult_start').length).toBe(1);
    const area = eventsOf(ev, 'areaSpawn').find((e) => e.visual === 'chijin_ult_spin');
    expect(area).toMatchObject({ radius: 4.2, duration: 3 });
    const spin = findBuff(hero, 'chijin_spin');
    expect(spin && spin.duration).toBe(3);
    const red = findBuff(hero, 'dmg_reduction');
    expect(red && red.value).toBe(val(hero, 'ult', 'reduction'));
    sim.step();
    expect(hero.anim).toBe('spin');
    expect(hero.animDur).toBe(3);
    // 减伤
    expect(dealDamage(sim, a, hero, 1000, 'true')).toBeCloseTo(750, 6);
    // 免疫减速(不会挂上减速状态)，但硬控照吃(见下一个用例)
    expect(addBuff(sim, hero, 'slow', { duration: 10, value: 0.5 })).toBeNull();
    expect(hero.stats.moveSpeed).toBeCloseTo(speed, 6);
    // 可以移动，不能普攻
    sim.command(hero.id, { type: 'attack', targetId: a.id });
    ev = sim.drainEvents().concat(stepFor(sim, 1));
    expect(eventsOf(ev, 'attack').filter((e) => e.unitId === hero.id).length).toBe(0);
    sim.command(hero.id, { type: 'move', dir: { x: 0, y: -1 } });
    ev = ev.concat(stepFor(sim, 0.3));
    expect(hero.pos.y).toBeLessThan(-1);
    expect(hero.anim).toBe('spin');
    const live = sim.areas.find((x) => x.visual === 'chijin_ult_spin');
    expect(live && dist(live.pos, hero.pos)).toBeLessThan(0.3);
    sim.command(hero.id, { type: 'move', dir: { x: 0, y: 0 } });
    ev = ev.concat(stepFor(sim, 2));
    const hits = damageTo(ev, hero, a);
    expect(hits.length).toBe(10);
    const raw = val(hero, 'ult', 'damage') + val(hero, 'ult', 'adRatio') * hero.stats.ad;
    expect(raw).toBeCloseTo(90 + 0.45 * hero.stats.ad, 6);
    for (const h of hits) expect(h.amount).toBeCloseTo(mitigate(raw, a.stats.armor), 4);
    expect(damageTo(ev, hero, out).length).toBe(0);
    const ticks = fxOf(ev, 'chijin_ult_tick');
    expect(ticks.length).toBe(10);
    expect(ticks[0].radius).toBe(4.2);
    // 结束：状态清除，之后又能被减速了
    expect(hasBuff(hero, 'chijin_spin')).toBe(false);
    expect(hasBuff(hero, 'dmg_reduction')).toBe(false);
    expect(sim.areas.length).toBe(0);
    expect(hero.anim).not.toBe('spin');
    expect(addBuff(sim, hero, 'slow', { duration: 0.5, value: 0.5 })).not.toBeNull();
    expect(hero.stats.moveSpeed).toBeCloseTo(speed * 0.5, 6);
    stepFor(sim, 0.6);
    // 之后可以普攻了
    sim.command(hero.id, { type: 'attack', targetId: a.id });
    expect(eventsOf(stepFor(sim, 1.5), 'attack').filter((e) => e.unitId === hero.id).length).toBeGreaterThan(0);
  });

  it('第一跳在起手动作之后，之后每 0.3 秒一跳', () => {
    const { sim, hero } = arena('chijin', 4);
    const a = enemyAt(sim, 'panyue', 3, 0);
    sim.command(hero.id, { type: 'cast', slot: 'ult' });
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      sim.step();
      if (damageTo(sim.drainEvents(), hero, a).length > 0) times.push(i + 1);
    }
    expect(times.length).toBe(10);
    expect(times[0]).toBe(3);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBe(9);
  });

  it('被眩晕不会中断旋风(动画变 stunned，伤害照常)；阵亡则立即结束', () => {
    const { sim, hero } = arena('chijin', 4);
    const a = enemyAt(sim, 'panyue', 3, 0);
    sim.command(hero.id, { type: 'cast', slot: 'ult' });
    stepFor(sim, 0.5);
    addBuff(sim, hero, 'stun', { duration: 1 });
    sim.step();
    expect(hero.anim).toBe('stunned');
    const ev = stepFor(sim, 1.2);
    expect(damageTo(ev, hero, a).length).toBeGreaterThanOrEqual(3);
    expect(hero.anim).toBe('spin');
    sim.drainEvents();
    killUnit(sim, hero, null);
    const after = stepFor(sim, 1);
    expect(damageTo(after, hero, a).length).toBe(0);
    expect(eventsOf(after, 'areaEnd').some((e) => e.visual === 'chijin_ult_spin')).toBe(true);
    expect(fxOf(after, 'chijin_ult_tick').length).toBe(0);
  });

  it('旋舞中可以放烈焰斩，施法动作结束后回到 spin', () => {
    const { sim, hero } = arena('chijin', 4);
    enemyAt(sim, 'panyue', 3, 0);
    sim.command(hero.id, { type: 'cast', slot: 'ult' });
    stepFor(sim, 0.5);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    const ev = sim.drainEvents().concat(stepFor(sim, 2 * TICK_DT));
    expect(eventsOf(ev, 'skillCast').some((e) => e.slot === 's1')).toBe(true);
    expect(hero.anim).toBe('cast_s1');
    stepFor(sim, 0.4);
    expect(hero.anim).toBe('spin');
  });
});

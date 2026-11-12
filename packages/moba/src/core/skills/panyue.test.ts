import { describe, expect, it } from 'vitest';
import { addBuff, buffStacks, findBuff, hasBuff } from '../buffs';
import { dealDamage, resolveBasicHit } from '../combat';
import { HEROES } from '../data/heroes';
import { eventsOf, levelTo, stepFor } from '../testkit';
import { TICK_DT } from '../types';
import { arena, damageTo, dist, dummyAt, enemyAt, fxOf, mitigate, val } from './testutil';

const P = HEROES.panyue.passive.values;

describe('磐岳 · 被动 磐石之躯', () => {
  it('每第三次普攻：额外 4% 最大生命的法术伤害 + 减速；层数 1 → 2 → 清零', () => {
    const { sim, hero } = arena('panyue');
    const d = dummyAt(sim, 2.5, 0, 'siege');
    sim.command(hero.id, { type: 'attack', targetId: d.id });
    const stacks: number[] = [];
    const magic: number[] = [];
    const physical: number[] = [];
    const fx: number[] = [];
    let slowChecked = false;
    for (let i = 0; i < 30 * 4.5; i++) {
      sim.step();
      const ev = sim.drainEvents();
      for (const e of damageTo(ev, hero, d)) {
        if (e.dtype === 'magic') magic.push(e.amount);
        else {
          physical.push(e.amount);
          stacks.push(buffStacks(hero, 'panyue_passive'));
        }
      }
      for (const e of fxOf(ev, 'panyue_passive_hit')) fx.push(e.targetId ?? -1);
      if (physical.length === 3 && !slowChecked) {
        // 第三下刚落地：目标被减速
        slowChecked = true;
        const slow = findBuff(d, 'slow');
        expect(slow && slow.value).toBe(P.slow);
        expect(slow && slow.duration).toBe(P.slowDur);
      }
    }
    expect(slowChecked).toBe(true);
    expect(physical.length).toBe(4);
    expect(stacks).toEqual([1, 2, 0, 1]);
    for (const p of physical) expect(p).toBeCloseTo(mitigate(hero.stats.ad, d.stats.armor), 4);
    expect(magic.length).toBe(1);
    expect(magic[0]).toBeCloseTo(mitigate(hero.stats.maxHp * P.hpRatio, d.stats.mr), 4);
    expect(fx).toEqual([d.id]);
  });

  it('打建筑不计数、不触发', () => {
    const { sim, hero } = arena('panyue');
    const tower = sim.towers[1].mid[0];
    if (!tower) throw new Error('no tower');
    for (let i = 0; i < 5; i++) resolveBasicHit(sim, hero, tower, hero.stats.ad, 'physical', 1, 1);
    expect(hasBuff(hero, 'panyue_passive')).toBe(false);
    expect(eventsOf(sim.drainEvents(), 'damage').every((e) => e.dtype === 'physical')).toBe(true);
  });
});

describe('磐岳 · S1 裂地冲撞', () => {
  it('撞到第一个敌方英雄即停，在该处震击：物理伤害 + 击飞；远处的敌人不受影响', () => {
    const { sim, hero } = arena('panyue', 1, -4, 0);
    const a = enemyAt(sim, 'xingli', 0, 0);
    const b = enemyAt(sim, 'fengling', 3, 0);
    const near = dummyAt(sim, -1, 2);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    sim.step();
    expect(hero.anim).toBe('dash');
    const ev = sim.drainEvents().concat(stepFor(sim, 0.6));
    // 停在第一个英雄身前，没有冲完全程
    expect(hero.pos.x).toBeGreaterThan(-2.2);
    expect(hero.pos.x).toBeLessThan(-0.9);
    expect(hero.pos.y).toBeCloseTo(0, 6);
    const raw = val(hero, 's1', 'damage') + val(hero, 's1', 'adRatio') * hero.stats.ad;
    expect(raw).toBeCloseTo(240 + 0.6 * hero.stats.ad, 6);
    const hitA = damageTo(ev, hero, a);
    expect(hitA.length).toBe(1);
    expect(hitA[0].amount).toBeCloseTo(mitigate(raw, a.stats.armor), 4);
    expect(hitA[0].dtype).toBe('physical');
    expect(hitA[0].skill).toBe(true);
    expect(damageTo(ev, hero, near)[0].amount).toBeCloseTo(mitigate(raw, near.stats.armor), 4);
    expect(damageTo(ev, hero, b).length).toBe(0);
    const dash = fxOf(ev, 'panyue_s1_dash');
    expect(dash.length).toBe(1);
    expect(dash[0].pos).toEqual({ x: -4, y: 0 });
    expect(dash[0].dir).toEqual({ x: 1, y: 0 });
    const impact = fxOf(ev, 'panyue_s1_impact');
    expect(impact.length).toBe(1);
    expect(impact[0].radius).toBe(val(hero, 's1', 'impactRadius'));
    // 震击发生在停下的位置(之后只会被软分离挤开一点点)
    expect(dist(impact[0].pos, hero.pos)).toBeLessThan(0.2);
    expect(eventsOf(ev, 'skillCast').length).toBe(1);
    expect(hero.skills.s1.cd).toBeGreaterThan(0);
  });

  it('击飞 0.75 秒：期间目标不能行动，动画为 airborne', () => {
    const { sim, hero } = arena('panyue', 1, -3, 0);
    const a = enemyAt(sim, 'chijin', 0, 0);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    let landed = -1;
    for (let i = 0; i < 20 && landed < 0; i++) {
      sim.step();
      if (hasBuff(a, 'airborne')) landed = i;
    }
    expect(landed).toBeGreaterThanOrEqual(0);
    const buff = findBuff(a, 'airborne');
    expect(buff && buff.duration).toBe(val(hero, 's1', 'knockup'));
    expect(a.anim).toBe('airborne');
    sim.command(a.id, { type: 'move', dir: { x: 0, y: 1 } });
    const y = a.pos.y;
    stepFor(sim, 0.6);
    expect(a.pos.y).toBe(y);
    stepFor(sim, 0.3);
    expect(hasBuff(a, 'airborne')).toBe(false);
    expect(a.pos.y).toBeGreaterThan(y);
  });

  it('没有英雄：冲完全程在终点震击；途中的小兵只是被穿过', () => {
    const { sim, hero } = arena('panyue', 1, -4, 0);
    const passed = dummyAt(sim, -1, 0.3);
    const atEnd = dummyAt(sim, 4.5, 0.5);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    const ev = stepFor(sim, 0.6);
    expect(hero.pos.x).toBeCloseTo(-4 + 7.5, 3);
    expect(damageTo(ev, hero, passed).length).toBe(0);
    expect(damageTo(ev, hero, atEnd).length).toBe(1);
    expect(hasBuff(atEnd, 'airborne')).toBe(true);
    expect(fxOf(ev, 'panyue_s1_impact').length).toBe(1);
    // 冲刺耗时 = 距离 / dashSpeed
    expect(hero.rt.dash).toBeNull();
  });

  it('撞墙即停并在墙边震击；被眩晕打断则没有震击', () => {
    const { sim, hero } = arena('panyue', 1, -50, 0);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    const ev = stepFor(sim, 0.6);
    expect(hero.pos.x).toBeLessThan(-46.5);
    expect(hero.pos.x).toBeGreaterThan(-48.5);
    expect(sim.nav.isFree(hero.pos.x, hero.pos.y, hero.rt.navR - 0.06)).toBe(true);
    expect(fxOf(ev, 'panyue_s1_impact').length).toBe(1);

    const b = arena('panyue', 1, -4, 0);
    b.sim.command(b.hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    stepFor(b.sim, 3 * TICK_DT);
    addBuff(b.sim, b.hero, 'stun', { duration: 1 });
    const x = b.hero.pos.x;
    const ev2 = stepFor(b.sim, 0.6);
    expect(b.hero.rt.dash).toBeNull();
    expect(b.hero.pos.x).toBe(x);
    expect(x).toBeLessThan(0);
    expect(fxOf(ev2, 'panyue_s1_impact').length).toBe(0);
  });

  it('自动瞄准：轻点朝射程内的敌方英雄冲；被定身时放不出来', () => {
    const { sim, hero } = arena('panyue', 1, 0, 0);
    enemyAt(sim, 'xingli', 0, 5);
    addBuff(sim, hero, 'root', { duration: 1 });
    sim.command(hero.id, { type: 'cast', slot: 's1' });
    expect(eventsOf(sim.drainEvents(), 'reject')[0].reason).toBe('disabled');
    stepFor(sim, 1.1);
    sim.command(hero.id, { type: 'cast', slot: 's1' });
    const cast = eventsOf(sim.drainEvents(), 'skillCast')[0];
    expect(cast.dir.x).toBeCloseTo(0, 5);
    expect(cast.dir.y).toBeCloseTo(1, 5);

    // 比冲锋距离(7.5)稍远、但终点震击够得着的英雄：也朝他冲，并且打得到
    const far = arena('panyue', 1, -8, 0, Math.PI / 2);
    const e = enemyAt(far.sim, 'xingli', 1, 0);
    far.sim.command(far.hero.id, { type: 'cast', slot: 's1' });
    const c2 = eventsOf(far.sim.drainEvents(), 'skillCast')[0];
    expect(c2.dir.x).toBeCloseTo(1, 5);
    expect(damageTo(stepFor(far.sim, 0.6), far.hero, e).length).toBe(1);
  });
});

describe('磐岳 · S2 不动壁垒', () => {
  it('护盾 = shield + 9% 最大生命，持续 4 秒；周围敌人受法术伤害并减速；特效与区域齐全', () => {
    const { sim, hero } = arena('panyue', 3);
    const inside = enemyAt(sim, 'chijin', 3, 0);
    const outside = enemyAt(sim, 'xingli', 6.5, 0);
    sim.command(hero.id, { type: 'cast', slot: 's2' });
    const shield = val(hero, 's2', 'shield') + val(hero, 's2', 'hpRatio') * hero.stats.maxHp;
    expect(shield).toBeCloseTo(300 + 0.09 * hero.stats.maxHp, 6);
    expect(hero.shield).toBeCloseTo(shield, 6);
    expect(hasBuff(hero, 'panyue_bulwark')).toBe(true);
    const ev = sim.drainEvents();
    const hit = damageTo(ev, hero, inside);
    expect(hit.length).toBe(1);
    expect(hit[0].dtype).toBe('magic');
    expect(hit[0].amount).toBeCloseTo(mitigate(val(hero, 's2', 'damage'), inside.stats.mr), 4);
    const slow = findBuff(inside, 'slow');
    expect(slow && slow.value).toBe(val(hero, 's2', 'slow'));
    expect(slow && slow.duration).toBe(val(hero, 's2', 'slowDur'));
    expect(damageTo(ev, hero, outside).length).toBe(0);
    expect(hasBuff(outside, 'slow')).toBe(false);
    expect(fxOf(ev, 'panyue_s2_cast')[0].radius).toBe(4.5);
    const area = eventsOf(ev, 'areaSpawn').find((e) => e.visual === 'panyue_s2_aura');
    expect(area && area.radius).toBe(4.5);
    expect(area && area.duration).toBe(4);
    sim.step();
    expect(hero.anim).toBe('cast_s2');
    // 区域跟随自身
    sim.command(hero.id, { type: 'move', dir: { x: 0, y: 1 } });
    stepFor(sim, 1);
    const live = sim.areas.find((x) => x.visual === 'panyue_s2_aura');
    expect(live && live.followUnitId).toBe(hero.id);
    expect(live && dist(live.pos, hero.pos)).toBeLessThan(0.3);
    // 到期：护盾、壁垒、区域一起结束
    const end = stepFor(sim, 3.2);
    expect(hero.shield).toBe(0);
    expect(hasBuff(hero, 'panyue_bulwark')).toBe(false);
    expect(eventsOf(end, 'areaEnd').some((e) => e.visual === 'panyue_s2_aura')).toBe(true);
    expect(sim.areas.length).toBe(0);
  });

  it('护盾被打破：壁垒与区域立即结束', () => {
    const { sim, hero } = arena('panyue', 3);
    const e = enemyAt(sim, 'chijin', 8, 0);
    sim.command(hero.id, { type: 'cast', slot: 's2' });
    stepFor(sim, 0.5);
    const hp = hero.hp;
    sim.drainEvents();
    dealDamage(sim, e, hero, hero.shield + 50, 'true');
    expect(hero.shield).toBe(0);
    expect(hero.hp).toBeCloseTo(hp - 50, 6);
    expect(hasBuff(hero, 'panyue_bulwark')).toBe(false);
    const ev = sim.drainEvents();
    expect(fxOf(ev, 'shield_break').length).toBe(1);
    expect(eventsOf(ev, 'areaEnd').some((x) => x.visual === 'panyue_s2_aura')).toBe(true);
  });

  it('上一面壁垒还在时再次施放：旧的正常收尾，只留下新的一面', () => {
    const { sim, hero } = arena('panyue', 3);
    sim.command(hero.id, { type: 'cast', slot: 's2' });
    stepFor(sim, 1);
    hero.skills.s2.cd = 0;
    sim.drainEvents();
    sim.command(hero.id, { type: 'cast', slot: 's2' });
    const ev = sim.drainEvents();
    expect(eventsOf(ev, 'areaEnd').filter((e) => e.visual === 'panyue_s2_aura').length).toBe(1);
    expect(hero.buffs.filter((b) => b.id === 'shield').length).toBe(1);
    expect(hero.shield).toBeCloseTo(val(hero, 's2', 'shield') + val(hero, 's2', 'hpRatio') * hero.stats.maxHp, 6);
    expect(hasBuff(hero, 'panyue_bulwark')).toBe(true);
    stepFor(sim, TICK_DT);
    expect(sim.areas.filter((a) => a.visual === 'panyue_s2_aura').length).toBe(1);
    stepFor(sim, 4.1);
    expect(hero.buffs.length).toBe(0);
    expect(sim.areas.length).toBe(0);
  });
});

describe('磐岳 · 大招 山崩地裂', () => {
  it('跃起(霸体, leap 动画) → 落地物理伤害 + 击飞 1 秒 → 留下 3 秒减速裂隙', () => {
    const { sim, hero } = arena('panyue', 4);
    const a = enemyAt(sim, 'chijin', 6, 1);
    const far = enemyAt(sim, 'xingli', 6, 7);
    sim.command(hero.id, { type: 'cast', slot: 'ult', pos: { x: 6, y: 0 } });
    const leapTime = val(hero, 'ult', 'leapTime');
    let ev = sim.drainEvents();
    const leap = fxOf(ev, 'panyue_ult_leap')[0];
    expect(leap.from).toEqual({ x: 0, y: 0 });
    expect(leap.to).toEqual({ x: 6, y: 0 });
    const warn = eventsOf(ev, 'areaSpawn').find((e) => e.visual === 'telegraph');
    expect(warn).toMatchObject({ pos: { x: 6, y: 0 }, radius: 4.5, duration: leapTime });
    // 跃起期间免疫控制
    expect(addBuff(sim, hero, 'stun', { duration: 1 })).toBeNull();
    expect(addBuff(sim, hero, 'slow', { duration: 1, value: 0.5 })).toBeNull();
    sim.step();
    expect(hero.anim).toBe('leap');
    expect(hero.animDur).toBeCloseTo(leapTime, 6);
    expect(damageTo(sim.drainEvents(), hero, a).length).toBe(0);
    ev = stepFor(sim, leapTime + 2 * TICK_DT);
    const land = fxOf(ev, 'panyue_ult_land')[0];
    expect(land.pos.x).toBeCloseTo(6, 6);
    expect(land.pos.y).toBeCloseTo(0, 6);
    expect(land.radius).toBe(4.5);
    expect(dist(hero.pos, land.pos)).toBeLessThan(0.2);
    expect(hasBuff(hero, 'unstoppable')).toBe(false);
    const hit = damageTo(ev, hero, a);
    expect(hit.length).toBe(1);
    const raw = val(hero, 'ult', 'damage') + val(hero, 'ult', 'hpRatio') * hero.stats.maxHp;
    expect(raw).toBeCloseTo(400 + 0.06 * hero.stats.maxHp, 6);
    expect(hit[0].amount).toBeCloseTo(mitigate(raw, a.stats.armor), 4);
    const air = findBuff(a, 'airborne');
    expect(air && air.duration).toBe(val(hero, 'ult', 'knockup'));
    expect(damageTo(ev, hero, far).length).toBe(0);
    expect(eventsOf(ev, 'areaEnd').some((e) => e.visual === 'telegraph')).toBe(true);
    const fissure = eventsOf(ev, 'areaSpawn').find((e) => e.visual === 'panyue_ult_fissure');
    expect(fissure).toMatchObject({ radius: 4.5, duration: val(hero, 'ult', 'zoneDur') });
    // 裂隙内持续减速 40%
    stepFor(sim, 1.5);
    const slow = findBuff(a, 'slow');
    expect(slow && slow.value).toBe(val(hero, 'ult', 'slow'));
    expect(a.stats.moveSpeed).toBeCloseTo(HEROES.chijin.base.moveSpeed * 0.6, 6);
    // 后进来的敌人也会被减速；裂隙消失后很快恢复
    enemyAt(sim, 'xingli', 6, -2);
    stepFor(sim, 0.4);
    expect(hasBuff(far, 'slow')).toBe(true);
    stepFor(sim, 2);
    expect(sim.areas.length).toBe(0);
    expect(hasBuff(a, 'slow')).toBe(false);
    expect(hasBuff(far, 'slow')).toBe(false);
  });

  it('落点在墙里：修正到最近可走点，预警圈画在实际落点；可以越过墙体', () => {
    const { sim, hero } = arena('panyue', 4, -50, 0);
    sim.command(hero.id, { type: 'cast', slot: 'ult', pos: { x: -44, y: 0 } });
    const ev = sim.drainEvents();
    const leap = fxOf(ev, 'panyue_ult_leap')[0];
    const warn = eventsOf(ev, 'areaSpawn').find((e) => e.visual === 'telegraph');
    expect(leap.to && warn && dist(leap.to, warn.pos)).toBeLessThan(1e-9);
    stepFor(sim, 0.8);
    expect(sim.nav.isFree(hero.pos.x, hero.pos.y, hero.rt.navR - 0.06)).toBe(true);
    expect(leap.to && dist(leap.to, hero.pos)).toBeLessThan(1e-6);

    // 越过上路内侧长墙落到野区
    levelTo(sim, hero, 4);
    sim.command(hero.id, { type: 'cast', slot: 'ult', pos: { x: hero.pos.x + 9, y: 0 } });
    const from = hero.pos.x;
    stepFor(sim, 0.8);
    expect(Math.abs(hero.pos.x - from)).toBeGreaterThan(6);
    expect(sim.nav.isFree(hero.pos.x, hero.pos.y, hero.rt.navR - 0.06)).toBe(true);
  });

  it('自动瞄准：落点按目标的移动做预判，不超出施法距离', () => {
    const { sim, hero } = arena('panyue', 4);
    const e = enemyAt(sim, 'fengling', 6, 0);
    sim.command(e.id, { type: 'move', dir: { x: 0, y: 1 } });
    stepFor(sim, 0.3);
    sim.command(hero.id, { type: 'cast', slot: 'ult' });
    const cast = eventsOf(sim.drainEvents(), 'skillCast')[0];
    expect(cast.targetPos.x).toBeCloseTo(6, 3);
    expect(cast.targetPos.y).toBeCloseTo(e.pos.y + e.stats.moveSpeed * val(hero, 'ult', 'leapTime'), 3);
    const ev = stepFor(sim, 0.8);
    // 目标一直在走，落地时仍在范围内
    expect(damageTo(ev, hero, e).length).toBe(1);
    // 没有任何目标：朝面向跳，不超过施法距离
    const b = arena('panyue', 4);
    b.sim.command(b.hero.id, { type: 'cast', slot: 'ult' });
    const c2 = eventsOf(b.sim.drainEvents(), 'skillCast')[0];
    expect(c2.targetPos.x).toBeGreaterThan(0);
    expect(c2.targetPos.x).toBeLessThanOrEqual(9.5);
  });
});

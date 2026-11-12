import { describe, expect, it } from 'vitest';
import { spawnArea } from './areas';
import { addBuff, buffStacks, findBuff, hasBuff, removeBuff } from './buffs';
import { dealDamage, heal } from './combat';
import { ARMOR_K } from './data/units';
import { displace, startDash, startLeap } from './movement';
import { spawnLinearProjectile } from './projectiles';
import { eventsOf, freezeUnit, heroOf, place, quietWorld, spawnMinionAt, stepFor } from './testkit';
import { TICK_DT } from './types';

describe('伤害公式', () => {
  it('物理/法术按护甲/法抗减免，真实伤害不减免', () => {
    const sim = quietWorld();
    const a = heroOf(sim, 0, 'chijin');
    const dummy = spawnMinionAt(sim, 1, 'siege', 0, 0, 'mid', 100000);
    // 攻城兵护甲/法抗都是 80
    const k = ARMOR_K / (ARMOR_K + 80);
    expect(dealDamage(sim, a, dummy, 1000, 'physical')).toBeCloseTo(1000 * k, 6);
    expect(dealDamage(sim, a, dummy, 1000, 'magic')).toBeCloseTo(1000 * k, 6);
    expect(dealDamage(sim, a, dummy, 1000, 'true')).toBeCloseTo(1000, 6);
    expect(dummy.hp).toBeCloseTo(100000 - 2000 * k - 1000, 4);
  });

  it('穿透按百分比削减护甲', () => {
    const sim = quietWorld();
    const a = heroOf(sim, 0, 'chijin');
    const dummy = spawnMinionAt(sim, 1, 'siege', 0, 0, 'mid', 100000);
    a.gold = 99999;
    sim.command(a.id, { type: 'buy', itemId: 'piercing_spear' }); // 35% 护甲穿透
    expect(a.stats.armorPen).toBeCloseTo(0.35, 6);
    const dealt = dealDamage(sim, a, dummy, 1000, 'physical');
    expect(dealt).toBeCloseTo((1000 * ARMOR_K) / (ARMOR_K + 80 * 0.65), 6);
  });

  it('护盾先于生命扣除，打破时发 shield_break', () => {
    const sim = quietWorld();
    const a = heroOf(sim, 0, 'chijin');
    const b = heroOf(sim, 1, 'panyue');
    place(sim, b, 0, 0);
    stepFor(sim, 2.5); // 等复活保护(无敌)以外的初始状态稳定
    sim.drainEvents();
    addBuff(sim, b, 'shield', { duration: 5, value: 300 });
    addBuff(sim, b, 'shield', { duration: 3, value: 200 });
    expect(b.shield).toBe(500);
    const hp0 = b.hp;
    const d1 = dealDamage(sim, a, b, 250, 'true');
    expect(d1).toBe(250);
    expect(b.hp).toBe(hp0);
    // 先消耗最早到期的那层(200)，再扣另一层 50
    expect(b.shield).toBe(250);
    const d2 = dealDamage(sim, a, b, 400, 'true');
    expect(d2).toBe(400);
    expect(b.shield).toBe(0);
    expect(b.hp).toBe(hp0 - 150);
    const fx = eventsOf(sim.drainEvents(), 'fx').filter((e) => e.key === 'shield_break');
    expect(fx.length).toBe(2);
    expect(hasBuff(b, 'shield')).toBe(false);
  });

  it('无敌 / 不可选中的单位不受伤害；减伤 buff 叠乘', () => {
    const sim = quietWorld();
    const a = heroOf(sim, 0, 'chijin');
    const tower2 = sim.towers[1].mid[1];
    expect(tower2 && tower2.invulnerable).toBe(true);
    if (tower2) expect(dealDamage(sim, a, tower2, 1000, 'true')).toBe(0);
    const b = heroOf(sim, 1, 'panyue');
    place(sim, b, 0, 0);
    addBuff(sim, b, 'untargetable', { duration: 1 });
    expect(dealDamage(sim, a, b, 1000, 'true')).toBe(0);
    removeBuff(sim, b, 'untargetable');
    addBuff(sim, b, 'dmg_reduction', { duration: 5, value: 0.25, key: 'a' });
    addBuff(sim, b, 'dmg_reduction', { duration: 5, value: 0.2, key: 'b' });
    expect(dealDamage(sim, a, b, 1000, 'true')).toBeCloseTo(1000 * 0.75 * 0.8, 6);
  });

  it('治疗不超过上限并发 heal 事件', () => {
    const sim = quietWorld();
    const b = heroOf(sim, 1, 'panyue');
    b.hp = b.stats.maxHp - 100;
    sim.drainEvents();
    expect(heal(sim, b, b, 500)).toBeCloseTo(100, 6);
    expect(b.hp).toBe(b.stats.maxHp);
    const ev = eventsOf(sim.drainEvents(), 'heal');
    expect(ev.length).toBe(1);
    expect(ev[0].targetId).toBe(b.id);
  });
});

describe('Buff 与控制', () => {
  it('叠层、刷新、到期', () => {
    const sim = quietWorld();
    const b = heroOf(sim, 1, 'fengling');
    addBuff(sim, b, 'fengling_gale', { duration: 3, maxStacks: 5, sourceId: b.id });
    stepFor(sim, 1);
    addBuff(sim, b, 'fengling_gale', { duration: 3, maxStacks: 5, sourceId: b.id });
    expect(buffStacks(b, 'fengling_gale')).toBe(2);
    const inst = findBuff(b, 'fengling_gale');
    expect(inst && inst.timeLeft).toBeCloseTo(3, 6);
    for (let i = 0; i < 10; i++) addBuff(sim, b, 'fengling_gale', { duration: 3, maxStacks: 5, sourceId: b.id });
    expect(buffStacks(b, 'fengling_gale')).toBe(5);
    expect(b.buffs.filter((x) => x.id === 'fengling_gale').length).toBe(1);
    stepFor(sim, 3.1);
    expect(hasBuff(b, 'fengling_gale')).toBe(false);
  });

  it('减速取最强一层；加速相加；到期后恢复', () => {
    const sim = quietWorld();
    const b = heroOf(sim, 1, 'panyue');
    const base = b.stats.moveSpeed;
    addBuff(sim, b, 'slow', { duration: 2, value: 0.3, sourceId: 1 });
    addBuff(sim, b, 'slow', { duration: 1, value: 0.5, sourceId: 2 });
    expect(b.stats.moveSpeed).toBeCloseTo(base * 0.5, 6);
    stepFor(sim, 1.2);
    expect(b.stats.moveSpeed).toBeCloseTo(base * 0.7, 6);
    stepFor(sim, 1);
    expect(b.stats.moveSpeed).toBeCloseTo(base, 6);
    addBuff(sim, b, 'haste', { duration: 2, value: 0.2, key: 'x' });
    addBuff(sim, b, 'haste', { duration: 2, value: 0.1, key: 'y' });
    expect(b.stats.moveSpeed).toBeCloseTo(base * 1.3, 6);
  });

  it('眩晕期间不能移动/施法，状态结束后恢复；动画为 stunned', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    stepFor(sim, 2.2);
    addBuff(sim, h, 'stun', { duration: 1 });
    sim.command(h.id, { type: 'move', dir: { x: 1, y: 0 } });
    stepFor(sim, 0.5);
    expect(h.pos.x).toBeCloseTo(0, 6);
    expect(h.anim).toBe('stunned');
    sim.drainEvents();
    sim.command(h.id, { type: 'cast', slot: 's1' });
    const rej = eventsOf(sim.drainEvents(), 'reject');
    expect(rej.length).toBe(1);
    expect(rej[0].reason).toBe('disabled');
    stepFor(sim, 1);
    expect(h.pos.x).toBeGreaterThan(1);
    expect(h.anim).toBe('move');
  });

  it('定身不能移动但可以普攻；击飞有 airborne 动画', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'fengling');
    place(sim, h, 0, 0);
    const dummy = spawnMinionAt(sim, 1, 'melee', 4, 0, 'mid', 50000);
    freezeUnit(dummy);
    stepFor(sim, 2.2);
    addBuff(sim, h, 'root', { duration: 2 });
    sim.command(h.id, { type: 'move', dir: { x: 0, y: 1 } });
    stepFor(sim, 0.5);
    expect(h.pos.y).toBeCloseTo(0, 6);
    sim.command(h.id, { type: 'attack', targetId: dummy.id });
    const ev = stepFor(sim, 1.2);
    expect(eventsOf(ev, 'attack').length).toBeGreaterThan(0);
    addBuff(sim, h, 'airborne', { duration: 0.75 });
    stepFor(sim, TICK_DT);
    expect(h.anim).toBe('airborne');
    expect(h.animDur).toBeCloseTo(0.75, 6);
    stepFor(sim, 0.8);
    expect(h.anim).not.toBe('airborne');
  });

  it('霸体免疫控制；建筑免疫一切控制', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'panyue');
    stepFor(sim, 2.2);
    addBuff(sim, h, 'unstoppable', { duration: 2 });
    expect(addBuff(sim, h, 'stun', { duration: 1 })).toBeNull();
    expect(addBuff(sim, h, 'slow', { duration: 1, value: 0.5 })).toBeNull();
    expect(displace(sim, h, 1, 0, 3, 10)).toBe(false);
    const tower = sim.towers[1].mid[0];
    if (tower) expect(addBuff(sim, tower, 'stun', { duration: 1 })).toBeNull();
  });

  it('持续伤害按间隔跳，buff 到期时最后一跳也会结算', () => {
    const sim = quietWorld();
    const a = heroOf(sim, 0, 'chijin');
    const dummy = spawnMinionAt(sim, 1, 'melee', 0, 0, 'mid', 10000);
    freezeUnit(dummy);
    let ticks = 0;
    addBuff(sim, dummy, 'burn', {
      duration: 2, value: 50, sourceId: a.id, tickInterval: 0.5,
      onTick: (s, u, b) => {
        ticks++;
        dealDamage(s, a, u, b.value, 'true', 'dot');
      },
    });
    stepFor(sim, 2.5);
    expect(ticks).toBe(4);
    expect(dummy.hp).toBeCloseTo(10000 - 200, 6);
    expect(hasBuff(dummy, 'burn')).toBe(false);
  });
});

describe('普攻循环', () => {
  it('近战：按攻速出手，前摇结束时结算；移动取消前摇', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    const dummy = spawnMinionAt(sim, 1, 'siege', 2.5, 0, 'mid', 1e6);
    freezeUnit(dummy);
    stepFor(sim, 2.2);
    sim.drainEvents();
    sim.command(h.id, { type: 'attack', targetId: dummy.id });
    const ev = stepFor(sim, 10);
    const attacks = eventsOf(ev, 'attack').filter((e) => e.unitId === h.id);
    const hits = eventsOf(ev, 'damage').filter((e) => e.sourceId === h.id);
    // 攻速 0.9/s → 10 秒约 9~10 次
    expect(attacks.length).toBeGreaterThanOrEqual(9);
    expect(attacks.length).toBeLessThanOrEqual(10);
    expect(hits.length).toBeGreaterThanOrEqual(attacks.length - 1);
    const expected = (h.stats.ad * ARMOR_K) / (ARMOR_K + dummy.stats.armor);
    expect(hits[0].amount).toBeCloseTo(expected, 4);
    expect(hits[0].skill).toBe(false);

    // 等下一次出手的前摇开始，立刻移动 → 这次出手不会造成伤害
    let started = false;
    for (let i = 0; i < 90 && !started; i++) {
      sim.step();
      started = eventsOf(sim.drainEvents(), 'attack').some((e) => e.unitId === h.id);
    }
    expect(started).toBe(true);
    expect(h.anim).toBe('attack');
    sim.command(h.id, { type: 'move', dir: { x: -1, y: 0 } });
    const after = stepFor(sim, 0.6);
    expect(eventsOf(after, 'damage').filter((e) => e.sourceId === h.id).length).toBe(0);
    expect(h.anim).toBe('move');
  });

  it('远程：前摇后出弹，追踪弹命中才结算；事件顺序 spawn → hit → end', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'fengling');
    place(sim, h, 0, 0);
    const dummy = spawnMinionAt(sim, 1, 'siege', 7, 0, 'mid', 1e6);
    freezeUnit(dummy);
    stepFor(sim, 2.2);
    sim.drainEvents();
    sim.command(h.id, { type: 'attack', targetId: dummy.id });
    const ev = stepFor(sim, 1);
    const spawnIdx = ev.findIndex((e) => e.type === 'projectileSpawn');
    const hitIdx = ev.findIndex((e) => e.type === 'projectileHit');
    const endIdx = ev.findIndex((e) => e.type === 'projectileEnd');
    const dmgIdx = ev.findIndex((e) => e.type === 'damage');
    expect(spawnIdx).toBeGreaterThanOrEqual(0);
    expect(hitIdx).toBeGreaterThan(spawnIdx);
    expect(dmgIdx).toBeGreaterThan(hitIdx);
    expect(endIdx).toBeGreaterThan(hitIdx);
    const spawn = ev[spawnIdx];
    if (spawn.type === 'projectileSpawn') expect(spawn.visual).toBe('fengling_basic');
    expect(sim.projectiles.length).toBe(0);
  });

  it('暴击只在普攻上出现；吸血只对普攻生效', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    const dummy = spawnMinionAt(sim, 1, 'siege', 2.5, 0, 'mid', 1e6);
    freezeUnit(dummy);
    stepFor(sim, 2.2);
    h.gold = 99999;
    sim.command(h.id, { type: 'buy', itemId: 'blood_scythe' });
    expect(h.stats.lifesteal).toBeCloseTo(0.2, 6);
    h.h.hooks.push({ modifyBasicAttack: (_s, _h, _t, mod) => { mod.forceCrit = true; } });
    h.hp = 1000;
    sim.drainEvents();
    sim.command(h.id, { type: 'attack', targetId: dummy.id });
    const ev = stepFor(sim, 0.6);
    const hit = eventsOf(ev, 'damage').find((e) => e.sourceId === h.id);
    expect(hit).toBeDefined();
    if (!hit) return;
    expect(hit.crit).toBe(true);
    expect(hit.amount).toBeCloseTo((h.stats.ad * h.stats.critDamage * ARMOR_K) / (ARMOR_K + dummy.stats.armor), 3);
    const healed = eventsOf(ev, 'heal').find((e) => e.targetId === h.id);
    expect(healed).toBeDefined();
    if (healed) expect(healed.amount).toBeCloseTo(hit.amount * 0.2, 3);
    // 技能伤害：不暴击、不吸血
    sim.command(h.id, { type: 'stop' });
    stepFor(sim, 1.5);
    const hp = h.hp;
    sim.drainEvents();
    dealDamage(sim, h, dummy, 500, 'physical', 'skill');
    const ev2 = sim.drainEvents();
    const d2 = eventsOf(ev2, 'damage')[0];
    expect(d2.crit).toBe(false);
    expect(d2.skill).toBe(true);
    expect(eventsOf(ev2, 'heal').length).toBe(0);
    expect(h.hp).toBe(hp);
  });

  it('目标死亡后发 death 事件并从 units 中移除', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    const m = spawnMinionAt(sim, 1, 'ranged', 2.5, 0, 'mid', 100);
    freezeUnit(m);
    stepFor(sim, 2.2);
    sim.drainEvents();
    sim.command(h.id, { type: 'attack', targetId: m.id });
    const ev = stepFor(sim, 1);
    const death = eventsOf(ev, 'death');
    expect(death.length).toBe(1);
    expect(death[0].unitId).toBe(m.id);
    expect(death[0].killerId).toBe(h.id);
    expect(sim.getUnit(m.id)).toBeUndefined();
    expect(sim.units.includes(m)).toBe(false);
    expect(h.cs).toBe(1);
  });
});

describe('投射物 / 区域 / 位移', () => {
  it('直线弹：穿透弹命中沿途所有敌人各一次；非穿透弹命中第一个即销毁', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'xingli');
    place(sim, h, 0, 0);
    const m1 = spawnMinionAt(sim, 1, 'melee', 3, 0, 'mid', 5000);
    const m2 = spawnMinionAt(sim, 1, 'melee', 6, 0.4, 'mid', 5000);
    const m3 = spawnMinionAt(sim, 1, 'melee', 6, 4, 'mid', 5000); // 不在线上
    const ally = spawnMinionAt(sim, 0, 'melee', 4.5, 0, 'mid', 5000); // 友军不被命中
    for (const m of [m1, m2, m3, ally]) freezeUnit(m);
    sim.drainEvents();
    const hitIds: number[] = [];
    let ended = 0;
    spawnLinearProjectile(sim, {
      visual: 'xingli_s1', owner: h, from: h.pos, dir: { x: 1, y: 0 }, speed: 26, range: 12, radius: 0.65, pierce: true,
      onHit: (_s, _p, t) => { hitIds.push(t.id); },
      onEnd: () => { ended++; },
    });
    const ev = stepFor(sim, 1);
    expect(hitIds).toEqual([m1.id, m2.id]);
    expect(ended).toBe(1);
    expect(eventsOf(ev, 'projectileHit').length).toBe(2);
    const end = eventsOf(ev, 'projectileEnd');
    expect(end.length).toBe(1);
    expect(end[0].pos.x).toBeCloseTo(12, 3);

    hitIds.length = 0;
    spawnLinearProjectile(sim, {
      visual: 'fengling_s1', owner: h, from: h.pos, dir: { x: 1, y: 0 }, speed: 30, range: 14, radius: 0.65,
      onHit: (_s, _p, t) => { hitIds.push(t.id); },
    });
    const ev2 = stepFor(sim, 1);
    expect(hitIds).toEqual([m1.id]);
    const end2 = eventsOf(ev2, 'projectileEnd');
    expect(end2.length).toBe(1);
    expect(end2[0].pos.x).toBeLessThan(3.1);
  });

  it('区域：按间隔触发 tick，跟随单位移动，到期发 areaEnd', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    stepFor(sim, 2.2);
    sim.drainEvents();
    let ticks = 0;
    let endedNaturally = false;
    const area = spawnArea(sim, {
      visual: 'chijin_ult_spin', owner: h, pos: h.pos, radius: 4.2, duration: 3, follow: h, tickInterval: 0.3,
      onTick: () => { ticks++; },
      onEnd: (_s, _a, expired) => { endedNaturally = expired; },
    });
    sim.command(h.id, { type: 'move', dir: { x: 1, y: 0 } });
    stepFor(sim, 1);
    expect(area.pos.x).toBeCloseTo(h.pos.x, 6);
    expect(h.pos.x).toBeGreaterThan(4);
    const ev = stepFor(sim, 2.2);
    expect(ticks).toBe(10);
    expect(endedNaturally).toBe(true);
    expect(eventsOf(ev, 'areaEnd').length).toBe(1);
    expect(sim.areas.length).toBe(0);
  });

  it('冲刺：按速度位移、途中命中回调、撞墙停止；位移期间动画为 dash', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, -52, 0);
    const m = spawnMinionAt(sim, 1, 'melee', -52, -3, 'top', 5000);
    freezeUnit(m);
    stepFor(sim, 2.2);
    const hits: number[] = [];
    let reason = '';
    startDash(sim, h, {
      dir: { x: 0, y: -1 }, distance: 5.5, speed: 24, hitRadius: 1,
      onHit: (t) => { hits.push(t.id); },
      onEnd: (r) => { reason = r; },
    });
    sim.step();
    expect(h.anim).toBe('dash');
    stepFor(sim, 0.4);
    expect(reason).toBe('arrived');
    expect(h.pos.y).toBeCloseTo(-5.5, 3);
    expect(hits).toEqual([m.id]);
    // 朝东冲向上路内侧的山体：撞墙停下
    place(sim, h, -50, 0);
    reason = '';
    startDash(sim, h, { dir: { x: 1, y: 0 }, distance: 8, speed: 24, onEnd: (r) => { reason = r; } });
    stepFor(sim, 0.6);
    expect(reason).toBe('wall');
    expect(h.pos.x).toBeLessThan(-46.5);
    expect(sim.nav.isFree(h.pos.x, h.pos.y, h.rt.navR - 0.06)).toBe(true);
  });

  it('跃击：越过墙体落到目标点；落点在墙里则落到最近可走点', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'panyue');
    place(sim, h, -49, 0);
    stepFor(sim, 2.2);
    let landed = false;
    // 越过上路内侧长墙(x ∈ [-46.5, -41])落到野区
    startLeap(sim, h, -39, 0, 0.65, () => { landed = true; });
    sim.step();
    expect(h.anim).toBe('leap');
    expect(h.animDur).toBeCloseTo(0.65, 6);
    stepFor(sim, 0.7);
    expect(landed).toBe(true);
    expect(h.pos.x).toBeCloseTo(-39, 3);
    // 落点选在墙里
    startLeap(sim, h, -44, 0, 0.5);
    stepFor(sim, 0.6);
    expect(sim.nav.isFree(h.pos.x, h.pos.y, h.rt.navR - 0.06)).toBe(true);
  });

  it('被迫位移：把目标拉动指定距离，期间目标不能行动', () => {
    const sim = quietWorld();
    const b = heroOf(sim, 1, 'fengling');
    place(sim, b, 0, 0);
    stepFor(sim, 2.2);
    sim.command(b.id, { type: 'move', dir: { x: 0, y: 1 } });
    expect(displace(sim, b, 1, 0, 1.6, 14)).toBe(true);
    stepFor(sim, 2 * TICK_DT);
    expect(b.pos.y).toBeCloseTo(0, 6);
    stepFor(sim, 0.2);
    expect(b.pos.x).toBeCloseTo(1.6, 3);
    expect(b.pos.y).toBeGreaterThan(0);
  });
});

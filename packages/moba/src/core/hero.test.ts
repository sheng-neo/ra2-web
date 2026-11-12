import { describe, expect, it } from 'vitest';
import { addBuff, hasBuff } from './buffs';
import { dealDamage, killUnit } from './combat';
import { HEROES, SUMMONER, skillLevelsAt } from './data/heroes';
import { ITEMS } from './data/items';
import { ECONOMY, MINIONS, respawnTime, xpToNext } from './data/units';
import { isWalkableTerrain } from './map';
import { grantXp } from './rewards';
import { getSkill, registerSkill, type CastContext } from './skills/registry';
import { eventsOf, freezeUnit, heroOf, levelTo, place, quietWorld, spawnMinionAt, stepFor } from './testkit';
import { TICK_DT, type CastSpec } from './types';

const rangeOf = (spec: CastSpec): number => ('range' in spec ? spec.range : 0);

describe('移动指令', () => {
  it('move：按移速沿方向移动，零向量停止；动画 move/idle', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    sim.command(h.id, { type: 'move', dir: { x: 3, y: 0 } });
    stepFor(sim, 1);
    expect(h.pos.x).toBeCloseTo(h.stats.moveSpeed, 3);
    expect(h.pos.y).toBeCloseTo(0, 6);
    expect(h.anim).toBe('move');
    expect(h.facing).toBeCloseTo(0, 6);
    // prevPos 是上一 tick 的位置
    expect(h.pos.x - h.prevPos.x).toBeCloseTo(h.stats.moveSpeed * TICK_DT, 6);
    sim.command(h.id, { type: 'move', dir: { x: 0, y: 0 } });
    const x = h.pos.x;
    stepFor(sim, 0.5);
    expect(h.pos.x).toBe(x);
    expect(h.anim).toBe('idle');
  });

  it('moveTo：绕过墙体寻路到达目标点', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, -52, 0);
    // 目标在上路内侧长墙的另一边(野区)
    sim.command(h.id, { type: 'moveTo', pos: { x: -38, y: 0 } });
    let maxStepLen = 0;
    for (let i = 0; i < 30 * 12; i++) {
      sim.step();
      expect(isWalkableTerrain(sim.map, h.pos)).toBe(true);
      maxStepLen = Math.max(maxStepLen, Math.hypot(h.pos.x - h.prevPos.x, h.pos.y - h.prevPos.y));
    }
    expect(Math.hypot(h.pos.x + 38, h.pos.y)).toBeLessThan(0.05);
    expect(h.anim).toBe('idle');
    // 每 tick 位移不超过移速
    expect(maxStepLen).toBeLessThanOrEqual(h.stats.moveSpeed * TICK_DT + 1e-6);
  });

  it('stop 取消一切指令', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    sim.command(h.id, { type: 'moveTo', pos: { x: 20, y: -20 } });
    stepFor(sim, 0.5);
    sim.command(h.id, { type: 'stop' });
    const p = { ...h.pos };
    stepFor(sim, 0.5);
    expect(h.pos).toEqual(p);
  });
});

describe('普攻指令', () => {
  it('智能选目标：射程内英雄 > 能补刀的小兵 > 血少的小兵；没有目标就走向最近的敌人', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'fengling');
    place(sim, h, 0, 0);
    const full = spawnMinionAt(sim, 1, 'melee', 5, 0, 'mid', 3000);
    const low = spawnMinionAt(sim, 1, 'melee', 5, 2, 'mid', 3000);
    low.hp = 800;
    const killable = spawnMinionAt(sim, 1, 'melee', 5, -2, 'mid', 3000);
    killable.hp = 60;
    for (const m of [full, low, killable]) freezeUnit(m);
    stepFor(sim, 2.2);
    sim.command(h.id, { type: 'attack' });
    expect(h.targetId).toBe(killable.id);
    stepFor(sim, 1);
    expect(sim.getUnit(killable.id)).toBeUndefined();
    // 目标死亡后自动续上下一个：血少的那个
    stepFor(sim, 0.2);
    expect(h.targetId).toBe(low.id);

    // 敌方英雄进入射程：再按普攻会切到英雄
    const enemy = heroOf(sim, 1, 'xingli');
    place(sim, enemy, 0, 6);
    stepFor(sim, 0.3);
    // 等当前这一下出手完
    stepFor(sim, 1);
    sim.command(h.id, { type: 'attack' });
    expect(h.targetId).toBe(enemy.id);
  });

  it('智能选目标：残血小兵 > 塔 > 满血小兵', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'fengling');
    const tower = sim.towers[1].mid[0];
    if (!tower) throw new Error('no tower');
    place(sim, h, tower.pos.x - 5, tower.pos.y + 5);
    const healthy = spawnMinionAt(sim, 1, 'melee', tower.pos.x - 3, tower.pos.y + 6, 'mid', 3000);
    freezeUnit(healthy);
    sim.command(h.id, { type: 'attack' });
    expect(h.targetId).toBe(tower.id);
    healthy.hp = 600;
    sim.command(h.id, { type: 'attack' });
    expect(h.targetId).toBe(healthy.id);
  });

  it('射程外的显式目标：走过去打', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    const m = spawnMinionAt(sim, 1, 'siege', 9, 0, 'mid', 1e6);
    freezeUnit(m);
    stepFor(sim, 2.2);
    sim.command(h.id, { type: 'attack', targetId: m.id });
    const ev = stepFor(sim, 3);
    expect(h.pos.x).toBeGreaterThan(5);
    expect(eventsOf(ev, 'damage').some((e) => e.sourceId === h.id && e.targetId === m.id)).toBe(true);
  });

  it('看不见的敌人不能被选为目标', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    const far = heroOf(sim, 1, 'xingli');
    expect(far.visible[0]).toBe(false);
    sim.drainEvents();
    sim.command(h.id, { type: 'attack', targetId: far.id });
    expect(h.h.atkOrder).toBe(false);
    const rej = eventsOf(sim.drainEvents(), 'reject');
    expect(rej.length).toBe(1);
    expect(rej[0].reason).toBe('no_target');
  });
});

describe('施法管线', () => {
  it('未学会/冷却中/法力不足/被控 都会被拒绝并发 reject(仅玩家)', () => {
    const sim = quietWorld('chijin');
    const h = heroOf(sim, 0, 'chijin');
    expect(h.isPlayer).toBe(true);
    place(sim, h, 0, 0);
    sim.drainEvents();
    // 1 级没有大招
    sim.command(h.id, { type: 'cast', slot: 'ult' });
    expect(eventsOf(sim.drainEvents(), 'reject')[0].reason).toBe('disabled');
    // 成功施放 s1
    const mana0 = h.mana;
    sim.command(h.id, { type: 'cast', slot: 's1', dir: { x: 0, y: -1 } });
    const ev = sim.drainEvents();
    const cast = eventsOf(ev, 'skillCast');
    expect(cast.length).toBe(1);
    expect(cast[0]).toMatchObject({ unitId: h.id, heroId: 'chijin', slot: 's1', targetId: -1 });
    expect(cast[0].dir.x).toBeCloseTo(0, 6);
    expect(cast[0].dir.y).toBeCloseTo(-1, 6);
    expect(cast[0].targetPos.y).toBeCloseTo(-rangeOf(HEROES.chijin.skills.s1.cast), 6);
    expect(h.mana).toBe(mana0 - HEROES.chijin.skills.s1.manaCost[0]);
    expect(h.skills.s1.cd).toBeCloseTo(HEROES.chijin.skills.s1.cooldown[0], 6);
    expect(h.facing).toBeCloseTo(-Math.PI / 2, 6);
    sim.step();
    expect(h.anim).toBe('cast_s1');
    expect(h.animDur).toBeCloseTo(HEROES.chijin.skills.s1.castTime, 6);
    stepFor(sim, 0.5);
    sim.drainEvents();
    // 冷却中
    sim.command(h.id, { type: 'cast', slot: 's1' });
    expect(eventsOf(sim.drainEvents(), 'reject')[0].reason).toBe('cooldown');
    // 法力不足
    h.skills.s1.cd = 0;
    h.mana = 5;
    sim.command(h.id, { type: 'cast', slot: 's1' });
    expect(eventsOf(sim.drainEvents(), 'reject')[0].reason).toBe('mana');
    // 沉默
    h.mana = 400;
    addBuff(sim, h, 'silence', { duration: 1 });
    sim.command(h.id, { type: 'cast', slot: 's1' });
    expect(eventsOf(sim.drainEvents(), 'reject')[0].reason).toBe('disabled');
    // 非玩家英雄被拒绝时不发事件
    const bot = heroOf(sim, 0, 'xingli');
    sim.command(bot.id, { type: 'cast', slot: 'ult' });
    expect(sim.drainEvents().length).toBe(0);
  });

  it('冷却缩减作用于英雄技能，不作用于召唤师技能', () => {
    const sim = quietWorld('xingli');
    const h = heroOf(sim, 0, 'xingli');
    place(sim, h, 0, 0);
    h.gold = 99999;
    sim.command(h.id, { type: 'buy', itemId: 'astral_staff' }); // 10%
    sim.command(h.id, { type: 'buy', itemId: 'boots_arcane' }); // 15%
    expect(h.stats.cdr).toBeCloseTo(0.25, 6);
    sim.command(h.id, { type: 'cast', slot: 's1' });
    expect(h.skills.s1.cdMax).toBeCloseTo(HEROES.xingli.skills.s1.cooldown[0] * 0.75, 6);
    stepFor(sim, 0.5);
    sim.command(h.id, { type: 'cast', slot: 'heal' });
    expect(h.skills.heal.cdMax).toBe(SUMMONER.heal.cooldown);
  });

  it('自动瞄准：优先射程内血量比例最低的可见敌方英雄，否则最近的敌方单位，否则朝面向', () => {
    const sim = quietWorld('xingli');
    const h = heroOf(sim, 0, 'xingli');
    place(sim, h, 0, 0, 0);
    stepFor(sim, 2.2);
    const calls: CastContext[] = [];
    const original = getSkill('xingli', 's1');
    registerSkill('xingli', 's1', { cast: (ctx) => { calls.push(ctx); } });
    try {
      // 没有任何敌人：朝面向
      sim.command(h.id, { type: 'cast', slot: 's1' });
      expect(calls[0].dir.x).toBeCloseTo(1, 6);
      expect(calls[0].dir.y).toBeCloseTo(0, 6);
      // 只有小兵：瞄最近的小兵
      const m = spawnMinionAt(sim, 1, 'melee', 0, 6, 'mid', 3000);
      freezeUnit(m);
      h.skills.s1.cd = 0;
      stepFor(sim, 0.5);
      sim.command(h.id, { type: 'cast', slot: 's1' });
      expect(calls[1].dir.x).toBeCloseTo(0, 5);
      expect(calls[1].dir.y).toBeCloseTo(1, 5);
      // 两个敌方英雄：瞄血量比例低的那个
      const e1 = heroOf(sim, 1, 'panyue');
      const e2 = heroOf(sim, 1, 'fengling');
      place(sim, e1, -8, 0);
      place(sim, e2, 0, -8);
      e2.hp = e2.stats.maxHp * 0.3;
      h.skills.s1.cd = 0;
      stepFor(sim, 0.5);
      sim.command(h.id, { type: 'cast', slot: 's1' });
      expect(calls[2].dir.x).toBeCloseTo(0, 5);
      expect(calls[2].dir.y).toBeCloseTo(-1, 5);
      // 命令里带 targetId：瞄指定单位
      h.skills.s1.cd = 0;
      stepFor(sim, 0.5);
      sim.command(h.id, { type: 'cast', slot: 's1', targetId: e1.id });
      expect(calls[3].dir.x).toBeCloseTo(-1, 5);
    } finally {
      registerSkill('xingli', 's1', original);
    }
  });

  it('范围型：落点被限制在施法距离内，自动瞄准带移动预判', () => {
    const sim = quietWorld('xingli');
    const h = heroOf(sim, 0, 'xingli');
    place(sim, h, 0, 0);
    stepFor(sim, 2.2);
    levelTo(sim, h, 2);
    const calls: CastContext[] = [];
    const original = getSkill('xingli', 's2');
    registerSkill('xingli', 's2', { aimLead: 0.6, cast: (ctx) => { calls.push(ctx); } });
    try {
      const range = rangeOf(HEROES.xingli.skills.s2.cast);
      sim.command(h.id, { type: 'cast', slot: 's2', pos: { x: 30, y: 0 } });
      expect(calls[0].targetPos.x).toBeCloseTo(range, 6);
      // 敌人向 +y 移动：落点在他前方
      const e = heroOf(sim, 1, 'panyue');
      place(sim, e, 6, 0);
      stepFor(sim, 2.2);
      sim.command(e.id, { type: 'move', dir: { x: 0, y: 1 } });
      stepFor(sim, 0.5);
      h.skills.s2.cd = 0;
      sim.command(h.id, { type: 'cast', slot: 's2' });
      expect(calls[1].targetPos.x).toBeCloseTo(6, 3);
      expect(calls[1].targetPos.y).toBeCloseTo(e.pos.y + e.stats.moveSpeed * 0.6, 3);
    } finally {
      registerSkill('xingli', 's2', original);
    }
  });

  it('指向型：没有合法目标时拒绝(不扣蓝不进冷却)；有目标时带上 target', () => {
    const sim = quietWorld('yeque');
    const h = heroOf(sim, 0, 'yeque');
    place(sim, h, 0, 0);
    levelTo(sim, h, 4);
    expect(h.skills.ult.level).toBe(1);
    const mana = h.mana;
    sim.drainEvents();
    sim.command(h.id, { type: 'cast', slot: 'ult' });
    expect(eventsOf(sim.drainEvents(), 'reject')[0].reason).toBe('no_target');
    expect(h.mana).toBe(mana);
    expect(h.skills.ult.cd).toBe(0);
    const e = heroOf(sim, 1, 'xingli');
    place(sim, e, 5, 0);
    sim.command(h.id, { type: 'cast', slot: 'ult' });
    const cast = eventsOf(sim.drainEvents(), 'skillCast')[0];
    expect(cast.targetId).toBe(e.id);
    expect(cast.targetPos).toEqual({ x: 5, y: 0 });
  });

  it('动作锁期间的施法指令被缓冲，解锁后自动放出', () => {
    const sim = quietWorld('xingli');
    const h = heroOf(sim, 0, 'xingli');
    place(sim, h, 0, 0);
    levelTo(sim, h, 2);
    sim.drainEvents();
    sim.command(h.id, { type: 'cast', slot: 's2' }); // castTime 0.25
    sim.command(h.id, { type: 'cast', slot: 's1' });
    expect(eventsOf(sim.drainEvents(), 'skillCast').length).toBe(1);
    const ev = stepFor(sim, 0.4);
    const casts = eventsOf(ev, 'skillCast');
    expect(casts.length).toBe(1);
    expect(casts[0].slot).toBe('s1');
  });
});

describe('召唤师技能', () => {
  it('闪现：瞬移固定距离，prevPos 同步；穿墙时落在可走点', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    sim.drainEvents();
    sim.command(h.id, { type: 'cast', slot: 'flash', dir: { x: 1, y: 0 } });
    expect(h.pos.x).toBeCloseTo(SUMMONER.flash.range, 6);
    expect(h.prevPos).toEqual(h.pos);
    const fx = eventsOf(sim.drainEvents(), 'fx').find((e) => e.key === 'flash');
    expect(fx && fx.from).toEqual({ x: 0, y: 0 });
    expect(h.skills.flash.cd).toBe(SUMMONER.flash.cooldown);
    // 贴着上路内侧长墙(厚约 5m)向东闪：落点在墙里 → 取最近可走点
    h.skills.flash.cd = 0;
    place(sim, h, -47.3, 0);
    sim.command(h.id, { type: 'cast', slot: 'flash', dir: { x: 1, y: 0 } });
    expect(sim.nav.isFree(h.pos.x, h.pos.y, h.rt.navR)).toBe(true);
    expect(h.pos.x).toBeGreaterThan(-41.5); // 穿到了墙的另一侧
  });

  it('回城：引导 5 秒后回到泉水；移动或受伤会打断', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    sim.command(h.id, { type: 'cast', slot: 'recall' });
    expect(hasBuff(h, 'recall')).toBe(true);
    sim.step();
    expect(h.anim).toBe('channel');
    stepFor(sim, 4.8);
    expect(h.pos.x).toBe(0);
    const ev = stepFor(sim, 0.3);
    expect(h.pos).toEqual(h.h.spawn);
    expect(eventsOf(ev, 'fx').some((e) => e.key === 'recall_done')).toBe(true);
    expect(hasBuff(h, 'recall')).toBe(false);
    expect(h.anim).toBe('idle');

    // 受伤打断
    place(sim, h, 0, 0);
    stepFor(sim, 1.5);
    sim.command(h.id, { type: 'cast', slot: 'recall' });
    stepFor(sim, 2);
    dealDamage(sim, null, h, 10, 'true', 'env');
    expect(hasBuff(h, 'recall')).toBe(false);
    stepFor(sim, 4);
    expect(h.pos.x).toBe(0);
    // 移动打断
    sim.command(h.id, { type: 'cast', slot: 'recall' });
    stepFor(sim, 1);
    sim.command(h.id, { type: 'move', dir: { x: 1, y: 0 } });
    expect(hasBuff(h, 'recall')).toBe(false);
  });

  it('恢复：5 秒内回复 30% 生命与法力；受英雄伤害打断', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'panyue');
    place(sim, h, 0, 0);
    h.hp = 500;
    h.mana = 0;
    sim.command(h.id, { type: 'cast', slot: 'heal' });
    stepFor(sim, 5.2);
    const regen = h.stats.hpRegen * 5.2;
    expect(h.hp).toBeGreaterThan(500 + h.stats.maxHp * 0.3 - 1);
    expect(h.hp).toBeLessThan(500 + h.stats.maxHp * 0.3 + regen + 1);
    expect(h.mana).toBeGreaterThan(h.stats.maxMana * 0.3 - 1);
    expect(hasBuff(h, 'restore')).toBe(false);

    h.skills.heal.cd = 0;
    h.hp = 500;
    sim.command(h.id, { type: 'cast', slot: 'heal' });
    stepFor(sim, 1);
    const enemy = heroOf(sim, 1, 'chijin');
    dealDamage(sim, enemy, h, 10, 'true');
    expect(hasBuff(h, 'restore')).toBe(false);
  });
});

describe('装备', () => {
  it('购买扣钱、加属性、发事件；钱不够/格子满 被拒绝', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    const ad0 = h.stats.ad;
    const hp0 = h.stats.maxHp;
    sim.drainEvents();
    sim.command(h.id, { type: 'buy', itemId: 'iron_blade' });
    expect(h.gold).toBe(ECONOMY.startGold - ITEMS.iron_blade.cost);
    expect(h.items[0]).toBe('iron_blade');
    expect(h.stats.ad).toBeCloseTo(ad0 + 20, 6);
    expect(eventsOf(sim.drainEvents(), 'itemBought')[0]).toMatchObject({ unitId: h.id, itemId: 'iron_blade' });
    sim.command(h.id, { type: 'buy', itemId: 'guardian_plate' });
    expect(eventsOf(sim.drainEvents(), 'reject')[0].reason).toBe('gold');
    h.gold = 99999;
    h.hp = 1000;
    sim.command(h.id, { type: 'buy', itemId: 'guardian_plate' });
    // 买血装：上限与当前生命同步增加
    expect(h.stats.maxHp).toBeCloseTo(hp0 + 1000, 6);
    expect(h.hp).toBeCloseTo(2000, 6);
    for (let i = 0; i < 4; i++) sim.command(h.id, { type: 'buy', itemId: 'iron_blade' });
    expect(h.items.every((x) => x !== null)).toBe(true);
    sim.drainEvents();
    sim.command(h.id, { type: 'buy', itemId: 'iron_blade' });
    expect(eventsOf(sim.drainEvents(), 'reject')[0].reason).toBe('full');
  });

  it('出售返还 60%，属性回落', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    h.gold = 2000;
    sim.command(h.id, { type: 'buy', itemId: 'guardian_plate' });
    const gold = h.gold;
    const armor = h.stats.armor;
    sim.command(h.id, { type: 'sell', index: 0 });
    expect(h.gold).toBe(gold + Math.floor(ITEMS.guardian_plate.cost * 0.6));
    expect(h.items[0]).toBeNull();
    expect(h.stats.armor).toBeCloseTo(armor - 210, 6);
    expect(h.hp).toBeLessThanOrEqual(h.stats.maxHp);
  });

  it('鞋子互斥：升级鞋替换基础鞋并抵扣售价；已有鞋不能再买基础鞋', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    h.gold = 5000;
    sim.command(h.id, { type: 'buy', itemId: 'boots' });
    const speed = h.stats.moveSpeed;
    const gold = h.gold;
    sim.command(h.id, { type: 'buy', itemId: 'boots_guard' });
    expect(h.items.filter((x) => x !== null)).toEqual(['boots_guard']);
    expect(h.gold).toBe(gold - (ITEMS.boots_guard.cost - Math.floor(ITEMS.boots.cost * 0.6)));
    expect(h.stats.moveSpeed).toBeCloseTo(speed + 0.1, 6);
    sim.drainEvents();
    sim.command(h.id, { type: 'buy', itemId: 'boots' });
    expect(eventsOf(sim.drainEvents(), 'reject')[0].reason).toBe('full');
    sim.command(h.id, { type: 'buy', itemId: 'boots_guard' });
    expect(eventsOf(sim.drainEvents(), 'reject')[0].reason).toBe('full');
    expect(h.items.filter((x) => x !== null).length).toBe(1);
  });

  it('装备被动：反震 / 星幕 / 灼光', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'panyue');
    const e = heroOf(sim, 1, 'fengling');
    place(sim, h, 0, 0);
    place(sim, e, 5, 0);
    h.gold = 99999;
    e.gold = 99999;
    sim.command(h.id, { type: 'buy', itemId: 'thorn_mail' });
    sim.command(h.id, { type: 'buy', itemId: 'starweave_cloak' });
    sim.command(e.id, { type: 'buy', itemId: 'sunchaser_bow' });
    stepFor(sim, 2.2);
    sim.drainEvents();
    sim.command(e.id, { type: 'attack', targetId: h.id });
    const ev = stepFor(sim, 0.8);
    const dmg = eventsOf(ev, 'damage');
    const main = dmg.find((d) => d.sourceId === e.id && d.dtype === 'physical');
    const onhit = dmg.find((d) => d.sourceId === e.id && d.dtype === 'magic');
    const thorns = dmg.find((d) => d.sourceId === h.id && d.targetId === e.id);
    expect(main).toBeDefined();
    expect(onhit).toBeDefined();
    expect(thorns).toBeDefined();
    if (main && thorns) expect(thorns.amount).toBeCloseTo((main.amount * 0.18 * 600) / (600 + e.stats.mr), 3);
    // 星幕：打到 35% 以下触发一次护盾
    sim.command(e.id, { type: 'stop' });
    h.hp = h.stats.maxHp * 0.36;
    dealDamage(sim, e, h, 200, 'true');
    expect(h.shield).toBeCloseTo(600 + 60 * h.level, 6);
    stepFor(sim, 4.2);
    expect(h.shield).toBe(0);
    dealDamage(sim, e, h, 10, 'true');
    expect(h.shield).toBe(0); // 冷却中
  });
});

describe('成长与经济', () => {
  it('经验升级：自动加点、回复 20% 已损生命、发 levelUp', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    h.hp = 1000;
    sim.drainEvents();
    grantXp(sim, h, xpToNext(1) + 10);
    expect(h.level).toBe(2);
    expect(h.xp).toBeCloseTo(10, 6);
    expect(h.xpToNext).toBe(xpToNext(2));
    expect(h.skills.s2.level).toBe(1);
    const grown = 1000 + HEROES.chijin.growth.hp;
    expect(h.hp).toBeCloseTo(grown + (h.stats.maxHp - grown) * 0.2, 4);
    const ev = sim.drainEvents();
    expect(eventsOf(ev, 'levelUp')[0]).toMatchObject({ unitId: h.id, level: 2 });
    expect(eventsOf(ev, 'fx').some((e) => e.key === 'level_up')).toBe(true);
    // 一次给很多经验：连升到满级
    grantXp(sim, h, 1e6);
    expect(h.level).toBe(15);
    expect(h.xpToNext).toBe(0);
    const lv = skillLevelsAt(15);
    expect(h.skills.s1.level).toBe(lv.s1);
    expect(h.skills.ult.level).toBe(3);
    expect(h.skills.ult.cost).toBe(HEROES.chijin.skills.ult.manaCost[2]);
    expect(h.stats.maxHp).toBeCloseTo(HEROES.chijin.base.hp + HEROES.chijin.growth.hp * 14, 6);
  });

  it('自然金币：开局 10 秒后每秒增长', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    stepFor(sim, 10);
    expect(h.gold).toBe(ECONOMY.startGold);
    stepFor(sim, 10);
    expect(h.gold).toBeGreaterThanOrEqual(ECONOMY.startGold + Math.floor(ECONOMY.passiveGold * 10) - 1);
    expect(h.gold).toBeLessThanOrEqual(ECONOMY.startGold + Math.ceil(ECONOMY.passiveGold * 10));
  });

  it('补刀金币与临近分享、经验分享', () => {
    const sim = quietWorld();
    const a = heroOf(sim, 0, 'chijin');
    const b = heroOf(sim, 0, 'xingli');
    place(sim, a, 0, 0);
    place(sim, b, 3, 3);
    const m = spawnMinionAt(sim, 1, 'melee', 2, 0, 'mid', 100);
    sim.drainEvents();
    const ga = a.gold;
    const gb = b.gold;
    dealDamage(sim, a, m, 9999, 'true');
    // 数值取自 data/units.ts(平衡会调整它们)，这里只验证规则
    const def = MINIONS.melee;
    expect(a.gold).toBe(ga + def.gold);
    expect(b.gold).toBe(gb + Math.round(def.gold * ECONOMY.proximityGoldRatio));
    expect(a.cs).toBe(1);
    expect(b.cs).toBe(0);
    // 两人分享：各得 xpShare[1]
    expect(a.xp).toBeCloseTo(def.xp * ECONOMY.xpShare[1], 6);
    expect(b.xp).toBeCloseTo(def.xp * ECONOMY.xpShare[1], 6);
    const ev = sim.drainEvents();
    const gold = eventsOf(ev, 'gold');
    expect(gold.find((g) => g.unitId === a.id)).toMatchObject({ amount: def.gold, reason: 'lasthit' });
    expect(eventsOf(ev, 'fx').some((e) => e.key === 'gold_gain' && e.value === def.gold)).toBe(true);
  });

  it('击杀结算：首杀/赏金/助攻/连杀窗口/终结/团灭播报', () => {
    const sim = quietWorld();
    const killer = heroOf(sim, 0, 'chijin');
    const helper = heroOf(sim, 0, 'xingli');
    const reds = sim.heroes.filter((h) => h.team === 1);
    place(sim, killer, 0, 0);
    place(sim, helper, 2, 2);
    reds.forEach((r, i) => place(sim, r, 3 + i, -3));
    stepFor(sim, 0.1);
    sim.drainEvents();

    dealDamage(sim, helper, reds[0], 10, 'true');
    dealDamage(sim, killer, reds[0], 1e6, 'true');
    let ev = sim.drainEvents();
    let kill = eventsOf(ev, 'heroKill')[0];
    expect(kill).toMatchObject({ victimId: reds[0].id, killerId: killer.id, assistIds: [helper.id], multiKill: 1, streak: 1, firstBlood: true });
    expect(kill.bounty).toBe(ECONOMY.killGold + ECONOMY.firstBloodBonus);
    expect(eventsOf(ev, 'announce').map((a) => a.key)).toEqual(['first_blood']);
    expect(killer.kills).toBe(1);
    expect(helper.assists).toBe(1);
    expect(reds[0].deaths).toBe(1);
    expect(reds[0].alive).toBe(false);
    expect(reds[0].anim).toBe('dead');
    expect(reds[0].respawnIn).toBeCloseTo(respawnTime(1, sim.time), 6);
    expect(sim.state.teams[0].kills).toBe(1);
    const golds = eventsOf(ev, 'gold');
    expect(golds.find((g) => g.unitId === killer.id && g.reason === 'kill')?.amount).toBe(kill.bounty);
    expect(golds.find((g) => g.unitId === helper.id && g.reason === 'assist')?.amount).toBe(Math.round(kill.bounty * ECONOMY.assistRatio));

    // 10 秒内再杀：双杀、三杀…
    stepFor(sim, 1);
    sim.drainEvents();
    dealDamage(sim, killer, reds[1], 1e6, 'true');
    ev = sim.drainEvents();
    kill = eventsOf(ev, 'heroKill')[0];
    expect(kill.multiKill).toBe(2);
    expect(kill.firstBlood).toBe(false);
    expect(kill.bounty).toBe(ECONOMY.killGold);
    expect(eventsOf(ev, 'announce').map((a) => a.key)).toEqual(['double_kill']);
    dealDamage(sim, killer, reds[2], 1e6, 'true');
    dealDamage(sim, killer, reds[3], 1e6, 'true');
    sim.drainEvents();
    dealDamage(sim, killer, reds[4], 1e6, 'true');
    ev = sim.drainEvents();
    expect(eventsOf(ev, 'heroKill')[0].multiKill).toBe(5);
    expect(eventsOf(ev, 'announce').map((a) => a.key)).toEqual(['penta_kill', 'ace']);
    expect(killer.streak).toBe(5);

    // 终结：红方复活后击杀连杀 5 的蓝方英雄
    stepFor(sim, 20);
    expect(reds[0].alive).toBe(true);
    place(sim, reds[0], 0, 1);
    stepFor(sim, 2.1);
    sim.drainEvents();
    dealDamage(sim, reds[0], killer, 1e6, 'true');
    ev = sim.drainEvents();
    kill = eventsOf(ev, 'heroKill')[0];
    expect(kill.shutdown).toBe(true);
    expect(kill.bounty).toBe(Math.min(ECONOMY.killGoldMax, ECONOMY.killGold + ECONOMY.killGoldPerStreak * 5 - 0));
    expect(eventsOf(ev, 'announce').map((a) => a.key)).toEqual(['shutdown']);
    expect(killer.streak).toBe(0);
  });

  it('被小兵/塔补掉时，击杀算给最近伤害过他的敌方英雄；无人参与则无人得分', () => {
    const sim = quietWorld();
    const a = heroOf(sim, 0, 'chijin');
    const victim = heroOf(sim, 1, 'xingli');
    place(sim, a, 0, 0);
    place(sim, victim, 3, 0);
    const minion = spawnMinionAt(sim, 0, 'melee', 4, 0);
    dealDamage(sim, a, victim, 10, 'true');
    sim.drainEvents();
    killUnit(sim, victim, minion);
    let ev = sim.drainEvents();
    expect(eventsOf(ev, 'heroKill')[0].killerId).toBe(a.id);
    expect(eventsOf(ev, 'death')[0].killerId).toBe(a.id);
    expect(a.kills).toBe(1);

    const victim2 = heroOf(sim, 1, 'panyue');
    place(sim, victim2, 3, 1);
    killUnit(sim, victim2, minion);
    ev = sim.drainEvents();
    expect(eventsOf(ev, 'heroKill')[0]).toMatchObject({ killerId: minion.id, bounty: 0 });
    expect(a.kills).toBe(1);
    expect(sim.state.teams[0].kills).toBe(1);
  });

  it('死亡与复活：倒计时结束后在泉水满状态复活，带 2 秒复活保护', () => {
    const sim = quietWorld();
    const a = heroOf(sim, 0, 'chijin');
    const e = heroOf(sim, 1, 'xingli');
    place(sim, a, 0, 0);
    place(sim, e, 2, 0);
    dealDamage(sim, e, a, 1e6, 'true');
    expect(a.alive).toBe(false);
    const wait = a.respawnIn;
    expect(wait).toBeCloseTo(respawnTime(1, sim.time), 6);
    // 阵亡期间不能下命令，但可以买装备
    sim.command(a.id, { type: 'move', dir: { x: 1, y: 0 } });
    a.gold = 1000;
    sim.command(a.id, { type: 'buy', itemId: 'iron_blade' });
    expect(a.items[0]).toBe('iron_blade');
    stepFor(sim, wait - 0.2);
    expect(a.alive).toBe(false);
    expect(a.pos.x).toBe(0);
    const ev = stepFor(sim, 0.3);
    expect(a.alive).toBe(true);
    expect(a.respawnIn).toBe(0);
    expect(a.hp).toBe(a.stats.maxHp);
    expect(a.prevPos).toEqual(a.pos);
    expect(Math.hypot(a.pos.x - a.h.spawn.x, a.pos.y - a.h.spawn.y)).toBeLessThan(0.01);
    expect(eventsOf(ev, 'respawn')[0].unitId).toBe(a.id);
    expect(hasBuff(a, 'respawn_guard')).toBe(true);
    expect(a.invulnerable).toBe(true);
    expect(dealDamage(sim, e, a, 100, 'true')).toBe(0);
    stepFor(sim, 2.1);
    expect(a.invulnerable).toBe(false);
  });
});

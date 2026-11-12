import { describe, expect, it } from 'vitest';
import { addBuff, findBuff, hasBuff } from '../buffs';
import { dealDamage, killUnit } from '../combat';
import { HEROES } from '../data/heroes';
import { canTarget } from '../entity';
import type { SimHero } from '../internal';
import { recomputeStats } from '../stats';
import { eventsOf, heroOf, levelTo, place, stepFor } from '../testkit';
import { TICK_DT } from '../types';
import { createWorld, type Sim } from '../world';
import { arena, damageTo, dist, dummyAt, enemyAt, fxOf, mitigate, val } from './testutil';

const P = HEROES.yeque.passive.values;
const DEG = Math.PI / 180;

/** 关掉自然回血，便于精确核对「已损生命」 */
function noRegen(sim: Sim, u: SimHero): void {
  u.rt.base.hpRegen = 0;
  recomputeStats(sim, u);
}

describe('荆轲 · 被动 一去不还', () => {
  it('对生命低于 40% 的敌人伤害 +18%；对野怪 +25%(与斩杀乘算)；对建筑无效', () => {
    const sim = createWorld({ seed: 1, playerHero: 'yeque', difficulty: 'normal' }, { noBots: true, noWaves: true });
    const hero = heroOf(sim, 0, 'yeque');
    stepFor(sim, 26);
    const a = heroOf(sim, 1, 'panyue');
    place(sim, hero, 0, 0);
    place(sim, a, 3, 0);
    a.hp = a.stats.maxHp * 0.41;
    expect(dealDamage(sim, hero, a, 100, 'true')).toBeCloseTo(100, 6);
    a.hp = a.stats.maxHp * 0.39;
    expect(dealDamage(sim, hero, a, 100, 'true')).toBeCloseTo(100 * (1 + P.bonus), 6);
    // 别的英雄没有这个加成
    expect(dealDamage(sim, heroOf(sim, 0, 'chijin'), a, 100, 'true')).toBeCloseTo(100, 6);
    const camp = sim.camps.find((c) => c.def.monsterType === 'mossback' && c.members.length > 0);
    if (!camp) throw new Error('no camp');
    const mon = camp.members[0];
    expect(dealDamage(sim, hero, mon, 100, 'true')).toBeCloseTo(100 * (1 + P.monsterBonus), 6);
    mon.hp = mon.stats.maxHp * 0.3;
    expect(dealDamage(sim, hero, mon, 100, 'true')).toBeCloseTo(100 * (1 + P.monsterBonus) * (1 + P.bonus), 6);
    const tower = sim.towers[1].mid[0];
    if (!tower) throw new Error('no tower');
    tower.rt.backdoor = false;
    tower.hp = tower.stats.maxHp * 0.2;
    expect(dealDamage(sim, hero, tower, 100, 'true')).toBeCloseTo(100, 6);
  });

  it('击杀或助攻英雄：刷新 S1/S2 冷却(不含大招)、回复 8% 最大生命、挂上 yeque_shadow', () => {
    const { sim, hero } = arena('yeque', 4);
    const victim = enemyAt(sim, 'xingli', 3, 0);
    hero.hp = 1000;
    hero.skills.s1.cd = 5;
    hero.skills.s2.cd = 6;
    hero.skills.ult.cd = 30;
    sim.drainEvents();
    dealDamage(sim, hero, victim, 1e6, 'true');
    let ev = sim.drainEvents();
    expect(hero.skills.s1.cd).toBe(0);
    expect(hero.skills.s2.cd).toBe(0);
    expect(hero.skills.ult.cd).toBe(30);
    const heal = eventsOf(ev, 'heal').find((e) => e.targetId === hero.id);
    expect(heal && heal.amount).toBeCloseTo(hero.stats.maxHp * P.healHpRatio, 4);
    expect(hero.hp).toBeCloseTo(1000 + hero.stats.maxHp * P.healHpRatio, 4);
    expect(hasBuff(hero, 'yeque_shadow')).toBe(true);
    expect(fxOf(ev, 'heal').some((e) => e.unitId === hero.id)).toBe(true);
    // 助攻同样生效
    stepFor(sim, 4);
    expect(hasBuff(hero, 'yeque_shadow')).toBe(false);
    const second = enemyAt(sim, 'fengling', 3, 0);
    const mate = heroOf(sim, 0, 'chijin');
    hero.skills.s1.cd = 5;
    hero.skills.s2.cd = 6;
    dealDamage(sim, hero, second, 10, 'true');
    sim.drainEvents();
    dealDamage(sim, mate, second, 1e6, 'true');
    ev = sim.drainEvents();
    expect(eventsOf(ev, 'heroKill')[0].assistIds).toEqual([hero.id]);
    expect(hero.skills.s1.cd).toBe(0);
    expect(hero.skills.s2.cd).toBe(0);
    expect(hasBuff(hero, 'yeque_shadow')).toBe(true);
  });
});

describe('荆轲 · S1 风萧易水', () => {
  it('穿过路径上的敌人各造成一次物理伤害；命中英雄返还 40% 冷却(只返还一次)', () => {
    const { sim, hero } = arena('yeque', 1, -3, 0);
    const a = enemyAt(sim, 'xingli', 0, 0.5);
    const b = enemyAt(sim, 'fengling', 2, -0.5);
    const m = dummyAt(sim, -1, 0);
    const off = dummyAt(sim, 0, 3.5);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    const cdMax = hero.skills.s1.cdMax;
    expect(cdMax).toBe(7);
    sim.step();
    expect(hero.anim).toBe('dash');
    const ev = sim.drainEvents().concat(stepFor(sim, 9 * TICK_DT));
    expect(hero.pos.x).toBeCloseTo(3.5, 3);
    expect(hero.rt.dash).toBeNull();
    const raw = val(hero, 's1', 'damage') + val(hero, 's1', 'adRatio') * hero.stats.ad;
    expect(raw).toBeCloseTo(200 + 1.0 * hero.stats.ad, 6);
    for (const t of [a, b, m]) {
      const hit = damageTo(ev, hero, t);
      expect(hit.length).toBe(1);
      expect(hit[0]).toMatchObject({ dtype: 'physical', skill: true });
      expect(hit[0].amount).toBeCloseTo(mitigate(raw, t.stats.armor), 4);
    }
    expect(damageTo(ev, hero, off).length).toBe(0);
    expect(hero.skills.s1.cd).toBeCloseTo(cdMax * (1 - val(hero, 's1', 'refund')) - 10 * TICK_DT, 6);
    const fx = fxOf(ev, 'yeque_s1_dash');
    expect(fx.length).toBe(1);
    expect(fx[0].from).toEqual({ x: -3, y: 0 });
    expect(fx[0].to && fx[0].to.x).toBeCloseTo(3.5, 3);
  });

  it('只命中小兵不返还冷却；撞墙即停', () => {
    const { sim, hero } = arena('yeque', 1, -3, 0);
    dummyAt(sim, 0, 0);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    stepFor(sim, 10 * TICK_DT);
    expect(hero.skills.s1.cd).toBeCloseTo(7 - 10 * TICK_DT, 6);

    const w = arena('yeque', 1, -49.5, 0);
    w.sim.command(w.hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    stepFor(w.sim, 0.4);
    expect(w.hero.pos.x).toBeLessThan(-46.5);
    expect(w.sim.nav.isFree(w.hero.pos.x, w.hero.pos.y, w.hero.rt.navR - 0.06)).toBe(true);
  });

  it('击杀后冷却刷新：冲刺途中缓冲的下一次风萧易水会接着放出来', () => {
    const { sim, hero } = arena('yeque', 1, -3, 0);
    const a = enemyAt(sim, 'xingli', 0, 0);
    a.hp = 50;
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    stepFor(sim, 5 * TICK_DT);
    expect(a.alive).toBe(false);
    expect(hero.skills.s1.cd).toBe(0);
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 0, y: 1 } });
    const ev = stepFor(sim, 0.5);
    expect(eventsOf(ev, 'skillCast').filter((e) => e.slot === 's1').length).toBe(1);
    expect(hero.pos.y).toBeGreaterThan(6);
  });
});

describe('荆轲 · S2 引匕一掷', () => {
  it('出手点掷出 3 枚飞刃(相邻夹角 16°)；贴脸全中：首枚全额，后续各 50%，并减速', () => {
    const { sim, hero } = arena('yeque', 2);
    const a = enemyAt(sim, 'chijin', 2.5, 0);
    sim.command(hero.id, { type: 'cast', slot: 's2', dir: { x: 1, y: 0 } });
    let ev = sim.drainEvents().concat(stepFor(sim, TICK_DT));
    expect(sim.projectiles.length).toBe(0);
    ev = ev.concat(stepFor(sim, TICK_DT));
    expect(sim.projectiles.length).toBe(3);
    const angles = sim.projectiles.map((p) => Math.atan2(p.dir.y, p.dir.x) / DEG).sort((x, y) => x - y);
    expect(angles[0]).toBeCloseTo(-16, 6);
    expect(angles[1]).toBeCloseTo(0, 6);
    expect(angles[2]).toBeCloseTo(16, 6);
    for (const p of sim.projectiles) expect(p).toMatchObject({ visual: 'yeque_s2', speed: 26, maxRange: 9, radius: 0.5 });
    expect(fxOf(ev, 'yeque_s2_cast')[0].dir).toEqual({ x: 1, y: 0 });
    ev = ev.concat(stepFor(sim, 0.5));
    const raw = val(hero, 's2', 'damage') + val(hero, 's2', 'adRatio') * hero.stats.ad;
    expect(raw).toBeCloseTo(165 + 0.65 * hero.stats.ad, 6);
    const full = mitigate(raw, a.stats.armor);
    const hits = damageTo(ev, hero, a).map((h) => h.amount);
    expect(hits.length).toBe(3);
    expect(hits[0]).toBeCloseTo(full, 4);
    expect(hits[1]).toBeCloseTo(full * val(hero, 's2', 'repeatRatio'), 4);
    expect(hits[2]).toBeCloseTo(full * 0.5, 4);
    const slow = findBuff(a, 'slow');
    expect(slow && slow.value).toBe(val(hero, 's2', 'slow'));
    expect(slow && slow.duration).toBe(val(hero, 's2', 'slowDur'));
    expect(eventsOf(ev, 'projectileEnd').length).toBe(3);
  });

  it('远处只有中间一枚命中；飞刃被第一个敌人(含小兵)挡下；没命中的飞到 9 米', () => {
    const { sim, hero } = arena('yeque', 2);
    const far = enemyAt(sim, 'chijin', 8, 0);
    sim.command(hero.id, { type: 'cast', slot: 's2', dir: { x: 1, y: 0 } });
    let ev = stepFor(sim, 0.6);
    expect(damageTo(ev, hero, far).length).toBe(1);
    const ends = eventsOf(ev, 'projectileEnd').map((e) => Math.hypot(e.pos.x, e.pos.y)).sort((x, y) => x - y);
    expect(ends.length).toBe(3);
    expect(ends[1]).toBeCloseTo(9, 3);
    expect(ends[2]).toBeCloseTo(9, 3);

    stepFor(sim, 1);
    hero.skills.s2.cd = 0;
    const block = dummyAt(sim, 3, 0);
    sim.command(hero.id, { type: 'cast', slot: 's2', dir: { x: 1, y: 0 } });
    ev = stepFor(sim, 0.6);
    expect(damageTo(ev, hero, block).length).toBeGreaterThanOrEqual(1);
    expect(damageTo(ev, hero, far).length).toBe(0);
  });
});

describe('荆轲 · 大招 图穷匕见', () => {
  it('隐身 0.35 秒(不可选中、免疫控制) → 出现在目标身后 → 340(+120%物攻) + 20% 已损生命的物理伤害', () => {
    const { sim, hero } = arena('yeque', 4);
    const a = enemyAt(sim, 'panyue', 5, 0, Math.PI);
    noRegen(sim, a);
    a.hp = a.stats.maxHp * 0.5;
    sim.command(hero.id, { type: 'cast', slot: 'ult', targetId: a.id });
    let ev = sim.drainEvents();
    expect(eventsOf(ev, 'skillCast')[0]).toMatchObject({ slot: 'ult', targetId: a.id });
    expect(fxOf(ev, 'yeque_ult_vanish')[0].pos).toEqual({ x: 0, y: 0 });
    expect(hero.rt.untargetable).toBe(true);
    expect(canTarget(a, hero)).toBe(false);
    expect(dealDamage(sim, a, hero, 500, 'true')).toBe(0);
    expect(addBuff(sim, hero, 'stun', { duration: 1 })).toBeNull();
    sim.step();
    expect(hero.anim).toBe('cast_ult');
    ev = stepFor(sim, 9 * TICK_DT);
    expect(hero.pos).toEqual({ x: 0, y: 0 });
    expect(damageTo(ev, hero, a).length).toBe(0);
    const missing = a.stats.maxHp - a.hp;
    ev = stepFor(sim, TICK_DT);
    // 出现在目标身后：目标面朝 -x，身后就是 +x 一侧
    const gap = a.radius + hero.radius + 0.3;
    expect(hero.pos.x).toBeCloseTo(5 + gap, 6);
    expect(hero.pos.y).toBeCloseTo(0, 6);
    expect(hero.prevPos).toEqual(hero.pos);
    expect(Math.cos(hero.facing)).toBeCloseTo(-1, 6);
    expect(hero.rt.untargetable).toBe(false);
    const strike = fxOf(ev, 'yeque_ult_strike');
    expect(strike.length).toBe(1);
    expect(strike[0]).toMatchObject({ pos: { x: 5, y: 0 }, targetId: a.id, from: { x: 0, y: 0 } });
    expect(strike[0].to && dist(strike[0].to, hero.pos)).toBeLessThan(1e-9);
    const raw = val(hero, 'ult', 'damage') + val(hero, 'ult', 'adRatio') * hero.stats.ad + val(hero, 'ult', 'missingRatio') * missing;
    expect(raw).toBeCloseTo(340 + 1.2 * hero.stats.ad + 0.2 * 0.5 * a.stats.maxHp, 4);
    const hit = damageTo(ev, hero, a);
    expect(hit.length).toBe(1);
    expect(hit[0]).toMatchObject({ dtype: 'physical', skill: true });
    expect(hit[0].amount).toBeCloseTo(mitigate(raw, a.stats.armor), 3);
  });

  it('目标低于 40% 生命时叠加被动的 18% 增伤', () => {
    const { sim, hero } = arena('yeque', 4);
    const a = enemyAt(sim, 'panyue', 5, 0);
    // 靶子升到满级：血够厚，这一下打不死，伤害数字才不会被剩余血量截断
    levelTo(sim, a, 15);
    noRegen(sim, a);
    a.hp = a.stats.maxHp * 0.39;
    const missing = a.stats.maxHp - a.hp;
    sim.command(hero.id, { type: 'cast', slot: 'ult' });
    const hit = damageTo(stepFor(sim, 0.5), hero, a);
    expect(a.alive).toBe(true);
    const raw = val(hero, 'ult', 'damage') + val(hero, 'ult', 'adRatio') * hero.stats.ad + val(hero, 'ult', 'missingRatio') * missing;
    expect(hit[0].amount).toBeCloseTo(mitigate(raw * (1 + P.bonus), a.stats.armor), 3);
  });

  it('隐身期间目标阵亡：处决落空，原地现身；目标只是位移则照样追到身后', () => {
    const { sim, hero } = arena('yeque', 4);
    const a = enemyAt(sim, 'xingli', 5, 0);
    sim.command(hero.id, { type: 'cast', slot: 'ult', targetId: a.id });
    stepFor(sim, 0.1);
    killUnit(sim, a, null);
    const ev = stepFor(sim, 0.5);
    expect(hero.pos).toEqual({ x: 0, y: 0 });
    expect(fxOf(ev, 'yeque_ult_strike').length).toBe(0);
    expect(hero.rt.untargetable).toBe(false);

    const b = enemyAt(sim, 'fengling', 5, 0, 0);
    levelTo(sim, hero, 4);
    sim.command(hero.id, { type: 'cast', slot: 'ult', targetId: b.id });
    stepFor(sim, 0.1);
    place(sim, b, 2, 6, Math.PI / 2);
    const ev2 = stepFor(sim, 0.5);
    expect(damageTo(ev2, hero, b).length).toBe(1);
    // 目标面朝 +y，身后在 -y 一侧
    expect(hero.pos.x).toBeCloseTo(2, 6);
    expect(hero.pos.y).toBeLessThan(6);
    expect(dist(hero.pos, b.pos)).toBeLessThan(2);
  });

  it('身后是墙：落在最近的可走点', () => {
    const { sim, hero } = arena('yeque', 4, -52, 0);
    // 目标背靠上路内侧长墙(x ≥ -46.5)，面朝西
    const a = enemyAt(sim, 'xingli', -47.4, 0, Math.PI);
    sim.command(hero.id, { type: 'cast', slot: 'ult', targetId: a.id });
    const ev = stepFor(sim, 0.5);
    expect(damageTo(ev, hero, a).length).toBe(1);
    expect(sim.nav.isFree(hero.pos.x, hero.pos.y, hero.rt.navR)).toBe(true);
    expect(dist(hero.pos, a.pos)).toBeLessThan(2.5);
  });

  it('自动瞄准：选范围内血量比例最低的可见敌方英雄；范围内没有英雄则拒绝', () => {
    const { sim, hero } = arena('yeque', 4);
    const healthy = enemyAt(sim, 'panyue', 3, 0);
    const weak = enemyAt(sim, 'fengling', 0, 6);
    weak.hp = weak.stats.maxHp * 0.25;
    enemyAt(sim, 'xingli', 0, -9.5).hp = 1; // 射程外
    sim.command(hero.id, { type: 'cast', slot: 'ult' });
    expect(eventsOf(sim.drainEvents(), 'skillCast')[0].targetId).toBe(weak.id);
    const ev = stepFor(sim, 0.5);
    expect(damageTo(ev, hero, weak).length).toBe(1);
    expect(damageTo(ev, hero, healthy).length).toBe(0);

    const empty = arena('yeque', 4);
    dummyAt(empty.sim, 3, 0);
    empty.sim.command(empty.hero.id, { type: 'cast', slot: 'ult' });
    expect(eventsOf(empty.sim.drainEvents(), 'reject')[0].reason).toBe('no_target');
    expect(empty.hero.skills.ult.cd).toBe(0);
  });
});

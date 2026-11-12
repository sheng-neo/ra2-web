import { describe, expect, it } from 'vitest';
import { buffStacks, findBuff, hasBuff } from '../buffs';
import { killUnit } from '../combat';
import { HEROES } from '../data/heroes';
import type { SimHero, SimUnit } from '../internal';
import { eventsOf, stepFor } from '../testkit';
import { TICK_DT, type GameEvent, type Vec2 } from '../types';
import type { Sim } from '../world';
import { arena, damageTo, dist, dummyAt, enemyAt, fxOf, mitigate, val } from './testutil';

const P = HEROES.xingli.passive.values;

/** 朝 +x 放一发流星矢并等它飞完 */
function fireS1(sim: Sim, hero: SimHero): GameEvent[] {
  hero.skills.s1.cd = 0;
  hero.mana = hero.stats.maxMana;
  sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
  return sim.drainEvents().concat(stepFor(sim, 0.8));
}

describe('星璃 · 被动 星辉印记', () => {
  it('技能命中叠层(持续 5 秒)；第三层引爆：6% 最大生命法术伤害 + 眩晕 0.75 秒', () => {
    const { sim, hero } = arena('xingli');
    const a = enemyAt(sim, 'panyue', 5, 0);
    fireS1(sim, hero);
    expect(buffStacks(a, 'xingli_mark')).toBe(1);
    const mark = findBuff(a, 'xingli_mark');
    expect(mark && mark.duration).toBe(P.duration);
    expect(mark && mark.sourceId).toBe(hero.id);
    fireS1(sim, hero);
    expect(buffStacks(a, 'xingli_mark')).toBe(2);
    hero.skills.s1.cd = 0;
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    let ev: GameEvent[] = [];
    let stunnedFor = -1;
    for (let i = 0; i < 20; i++) {
      sim.step();
      ev = ev.concat(sim.drainEvents());
      const stun = findBuff(a, 'stun');
      if (stun && stunnedFor < 0) stunnedFor = stun.duration;
    }
    expect(stunnedFor).toBe(P.stun);
    expect(hasBuff(a, 'xingli_mark')).toBe(false);
    const dmg = damageTo(ev, hero, a);
    expect(dmg.length).toBe(2);
    const burst = dmg.find((d) => !d.skill);
    expect(burst && burst.dtype).toBe('magic');
    expect(burst && burst.amount).toBeCloseTo(mitigate(a.stats.maxHp * P.hpRatio, a.stats.mr), 4);
    expect(fxOf(ev, 'xingli_passive_burst').map((e) => e.targetId)).toEqual([a.id]);
    expect(a.anim).toBe('stunned');
    // 引爆后重新从一层开始
    stepFor(sim, 1);
    fireS1(sim, hero);
    expect(buffStacks(a, 'xingli_mark')).toBe(1);
    // 5 秒没有续上：印记消失
    stepFor(sim, P.duration - 1);
    expect(hasBuff(a, 'xingli_mark')).toBe(true);
    stepFor(sim, 1);
    expect(hasBuff(a, 'xingli_mark')).toBe(false);
  });

  it('对非英雄的引爆伤害有 300 上限', () => {
    const { sim, hero } = arena('xingli');
    const d = dummyAt(sim, 5, 0, 'siege');
    fireS1(sim, hero);
    fireS1(sim, hero);
    const ev = fireS1(sim, hero);
    const burst = damageTo(ev, hero, d).find((e) => !e.skill);
    expect(burst && burst.amount).toBeCloseTo(mitigate(P.cap, d.stats.mr), 4);
    // 小兵同样会被眩晕
    expect(hasBuff(d, 'stun')).toBe(true);
    expect(fxOf(ev, 'xingli_passive_burst').length).toBe(1);
  });
});

describe('星璃 · S1 流星矢', () => {
  it('出手点放出穿透弹：沿途敌人各受一次 300(+65%法强) 法术伤害，射程 12', () => {
    const { sim, hero } = arena('xingli', 1, -6, 0);
    sim.command(hero.id, { type: 'buy', itemId: 'spell_tome' });
    expect(hero.stats.ap).toBe(40);
    const m1 = dummyAt(sim, -2, 0);
    const a = enemyAt(sim, 'chijin', 2, 0.3);
    const m2 = dummyAt(sim, 5.5, 0);
    const off = dummyAt(sim, 0, 3);
    const beyond = dummyAt(sim, 7.5, 0);
    sim.drainEvents();
    sim.command(hero.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
    expect(sim.projectiles.length).toBe(0);
    let ev = sim.drainEvents().concat(stepFor(sim, 2 * TICK_DT));
    expect(sim.projectiles.length).toBe(0);
    ev = ev.concat(stepFor(sim, TICK_DT));
    const spawn = eventsOf(ev, 'projectileSpawn');
    expect(spawn.length).toBe(1);
    expect(spawn[0]).toMatchObject({ visual: 'xingli_s1', ownerId: hero.id });
    expect(sim.projectiles[0]).toMatchObject({ speed: 26, maxRange: 12, radius: 0.65, targetId: -1 });
    const cast = fxOf(ev, 'xingli_s1_cast');
    expect(cast.length).toBe(1);
    expect(cast[0].dir).toEqual({ x: 1, y: 0 });
    ev = ev.concat(stepFor(sim, 0.6));
    const raw = val(hero, 's1', 'damage') + val(hero, 's1', 'apRatio') * hero.stats.ap;
    expect(raw).toBeCloseTo(300 + 0.65 * 40, 6);
    for (const t of [m1, a, m2] as SimUnit[]) {
      const hit = damageTo(ev, hero, t);
      expect(hit.length).toBe(1);
      expect(hit[0]).toMatchObject({ dtype: 'magic', skill: true });
      expect(hit[0].amount).toBeCloseTo(mitigate(raw, t.stats.mr), 4);
    }
    expect(damageTo(ev, hero, off).length).toBe(0);
    expect(damageTo(ev, hero, beyond).length).toBe(0);
    expect(eventsOf(ev, 'projectileHit').map((e) => e.targetId)).toEqual([m1.id, a.id, m2.id]);
    const end = eventsOf(ev, 'projectileEnd');
    expect(end.length).toBe(1);
    expect(end[0].pos.x).toBeCloseTo(6, 3);
  });

  it('自动瞄准：对横向移动的目标带提前量，轻点也能命中', () => {
    const { sim, hero } = arena('xingli', 1, -4, 0);
    const e = enemyAt(sim, 'fengling', 4, -3);
    sim.command(e.id, { type: 'move', dir: { x: 0, y: 1 } });
    stepFor(sim, 0.3);
    sim.command(hero.id, { type: 'cast', slot: 's1' });
    const cast = eventsOf(sim.drainEvents(), 'skillCast')[0];
    // 瞄的是目标前方，而不是它当前的位置
    const now = Math.atan2(e.pos.y - hero.pos.y, e.pos.x - hero.pos.x);
    expect(Math.atan2(cast.dir.y, cast.dir.x)).toBeGreaterThan(now + 0.05);
    expect(damageTo(stepFor(sim, 0.8), hero, e).length).toBe(1);
  });
});

describe('星璃 · S2 引力星环', () => {
  it('预警 0.6 秒后收束：法术伤害、拉向中心 1.6 米(不越过中心)、减速 45% 2 秒', () => {
    const { sim, hero } = arena('xingli', 2);
    const a = enemyAt(sim, 'chijin', 8, 0);
    const m = dummyAt(sim, 6, 3);
    const out = enemyAt(sim, 'fengling', 6, -5);
    sim.command(hero.id, { type: 'cast', slot: 's2', pos: { x: 6, y: 0 } });
    let ev = sim.drainEvents();
    const spawned = eventsOf(ev, 'areaSpawn');
    expect(spawned.map((e) => e.visual).sort()).toEqual(['telegraph', 'xingli_s2_well']);
    for (const s of spawned) expect(s).toMatchObject({ pos: { x: 6, y: 0 }, radius: 3.4, duration: 0.6 });
    ev = stepFor(sim, 0.6 - TICK_DT);
    expect(eventsOf(ev, 'damage').length).toBe(0);
    ev = stepFor(sim, 2 * TICK_DT);
    const burst = fxOf(ev, 'xingli_s2_burst');
    expect(burst.length).toBe(1);
    expect(burst[0]).toMatchObject({ pos: { x: 6, y: 0 }, radius: 3.4 });
    const raw = val(hero, 's2', 'damage') + val(hero, 's2', 'apRatio') * hero.stats.ap;
    expect(raw).toBe(260);
    const hit = damageTo(ev, hero, a);
    expect(hit.length).toBe(1);
    expect(hit[0].amount).toBeCloseTo(mitigate(raw, a.stats.mr), 4);
    expect(damageTo(ev, hero, m).length).toBe(1);
    expect(damageTo(ev, hero, out).length).toBe(0);
    const slow = findBuff(a, 'slow');
    expect(slow && slow.value).toBe(val(hero, 's2', 'slow'));
    expect(slow && slow.duration).toBe(val(hero, 's2', 'slowDur'));
    expect(eventsOf(ev, 'areaEnd').length).toBe(2);
    stepFor(sim, 0.3);
    const pull = val(hero, 's2', 'pull');
    expect(a.pos.x).toBeCloseTo(8 - pull, 2);
    expect(m.pos.y).toBeCloseTo(3 - pull, 2);
    expect(out.pos).toEqual({ x: 6, y: -5 });
    expect(hasBuff(out, 'slow')).toBe(false);
    expect(buffStacks(a, 'xingli_mark')).toBe(1);
  });

  it('离中心不足 1.6 米的目标只被拉到中心；落点超出施法距离时被拉回 9 米；自动瞄准落在目标的预判位置', () => {
    const { sim, hero } = arena('xingli', 2);
    const close = dummyAt(sim, 8, 0);
    sim.command(hero.id, { type: 'cast', slot: 's2', pos: { x: 30, y: 0 } });
    const far = eventsOf(sim.drainEvents(), 'areaSpawn')[0];
    expect(far.pos.x).toBeCloseTo(9, 6);
    stepFor(sim, 1);
    expect(dist(close.pos, { x: 9, y: 0 })).toBeLessThan(0.05);
    hero.skills.s2.cd = 0;
    const e = enemyAt(sim, 'fengling', 6, -2);
    sim.command(e.id, { type: 'move', dir: { x: 0, y: 1 } });
    stepFor(sim, 0.3);
    sim.command(hero.id, { type: 'cast', slot: 's2' });
    const spot = eventsOf(sim.drainEvents(), 'areaSpawn')[0];
    expect(spot.pos.y).toBeCloseTo(e.pos.y + e.stats.moveSpeed * val(hero, 's2', 'delay'), 3);
    expect(damageTo(stepFor(sim, 0.7), hero, e).length).toBe(1);
  });
});

describe('星璃 · 大招 星陨天降', () => {
  function castUlt(seed: number): { sim: Sim; hero: SimHero; a: SimHero; out: SimHero } {
    void seed;
    const { sim, hero } = arena('xingli', 4);
    const a = enemyAt(sim, 'panyue', 8, 4.5);
    const out = enemyAt(sim, 'chijin', 8, 7);
    sim.drainEvents();
    sim.command(hero.id, { type: 'cast', slot: 'ult', pos: { x: 8, y: 0 } });
    return { sim, hero, a, out };
  }

  it('预警 0.5 秒 → 2.5 秒内 5 波：每波对整个区域法术伤害 + 减速 + 印记(第三波引爆)', () => {
    const { sim, hero, a, out } = castUlt(1);
    let ev = sim.drainEvents();
    expect(fxOf(ev, 'xingli_ult_cast').length).toBe(1);
    const warn = eventsOf(ev, 'areaSpawn');
    expect(warn.length).toBe(1);
    expect(warn[0]).toMatchObject({ visual: 'telegraph', pos: { x: 8, y: 0 }, radius: 5.2, duration: 0.5 });
    ev = stepFor(sim, 0.5 - TICK_DT);
    expect(eventsOf(ev, 'damage').length).toBe(0);
    expect(sim.areas.map((x) => x.visual)).toEqual(['telegraph']);
    // 逐 tick 记录每一波的时刻(从施放算起的 tick 数)
    const waveTicks: number[] = [];
    let all: GameEvent[] = [];
    for (let i = 15; i <= 30 * 3.5; i++) {
      sim.step();
      const e = sim.drainEvents();
      all = all.concat(e);
      if (damageTo(e, hero, a).some((d) => d.skill)) waveTicks.push(i);
    }
    const storm = eventsOf(all, 'areaSpawn').find((e) => e.visual === 'xingli_ult_storm');
    expect(storm).toMatchObject({ pos: { x: 8, y: 0 }, radius: 5.2, duration: 2.5 });
    // 第一波在预警结束的同一刻(施放后 0.5 秒)，之后每 0.5 秒一波
    expect(waveTicks).toEqual([15, 30, 45, 60, 75]);
    const raw = val(hero, 'ult', 'damage') + val(hero, 'ult', 'apRatio') * hero.stats.ap;
    expect(raw).toBe(180);
    const waves = damageTo(all, hero, a).filter((d) => d.skill);
    for (const w of waves) expect(w.amount).toBeCloseTo(mitigate(raw, a.stats.mr), 4);
    // 目标站在圈边(离中心 4.5 米)：伤害判定是整个区域，与陨星落点无关
    expect(damageTo(all, hero, out).length).toBe(0);
    // 三层印记引爆一次，之后的两波再叠两层
    expect(fxOf(all, 'xingli_passive_burst').length).toBe(1);
    expect(damageTo(all, hero, a).filter((d) => !d.skill).length).toBe(1);
    expect(buffStacks(a, 'xingli_mark')).toBe(2);
    // 陨星：每波 3 颗，落点都在星域内
    const meteors = fxOf(all, 'xingli_meteor');
    expect(meteors.length).toBe(15);
    for (const m of meteors) {
      expect(dist(m.pos, { x: 8, y: 0 })).toBeLessThanOrEqual(5.2);
      expect(m.radius).toBeGreaterThan(0);
    }
    expect(new Set(meteors.map((m) => `${m.pos.x.toFixed(3)},${m.pos.y.toFixed(3)}`)).size).toBe(15);
    expect(eventsOf(all, 'areaEnd').map((e) => e.visual)).toEqual(['telegraph', 'xingli_ult_storm']);
    expect(sim.areas.length).toBe(0);
  });

  it('每波减速 30% 持续 1 秒；陨星落点由种子随机决定(可复现)', () => {
    const run = (): { spots: Vec2[]; slow: number } => {
      const { sim, a } = castUlt(1);
      let slow = 0;
      let spots: Vec2[] = [];
      for (let i = 0; i < 30 * 3.2; i++) {
        sim.step();
        spots = spots.concat(fxOf(sim.drainEvents(), 'xingli_meteor').map((m) => m.pos));
        const s = findBuff(a, 'slow');
        if (s) slow = s.value;
      }
      return { spots, slow };
    };
    const r1 = run();
    const r2 = run();
    expect(r1.slow).toBe(HEROES.xingli.skills.ult.values.slow);
    expect(r1.spots.length).toBe(15);
    expect(r2.spots).toEqual(r1.spots);
  });

  it('星域放出后不随星璃阵亡而消失，击杀仍归她', () => {
    const { sim, hero, a } = castUlt(1);
    stepFor(sim, 0.2);
    killUnit(sim, hero, null);
    a.hp = 100;
    sim.drainEvents();
    const ev = stepFor(sim, 1);
    expect(a.alive).toBe(false);
    const kill = eventsOf(ev, 'heroKill')[0];
    expect(kill.killerId).toBe(hero.id);
    expect(hero.kills).toBe(1);
  });
});

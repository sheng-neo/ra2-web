import { describe, expect, it } from 'vitest';
import { hasBuff } from './buffs';
import { killUnit } from './combat';
import type { HeroHooks } from './internal';
import { Rng } from './rng';
import { Scheduler } from './scheduler';
import { getSkill, registerSkill } from './skills/registry';
import * as tk from './skills/toolkit';
import { eventsOf, freezeUnit, heroOf, levelTo, place, quietWorld, spawnMinionAt, stepFor } from './testkit';
import type { PlayerCommand, SkillSlot } from './types';
import { createWorld } from './world';

describe('基础设施', () => {
  it('Rng：同种子同序列，fork 出的子流互不影响', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const seq = Array.from({ length: 50 }, () => a.next());
    expect(Array.from({ length: 50 }, () => b.next())).toEqual(seq);
    expect(seq.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(seq).size).toBe(50);
    const c = new Rng(123);
    const fork = c.fork();
    const afterFork = c.next();
    for (let i = 0; i < 10; i++) fork.next();
    const d = new Rng(123);
    d.fork();
    expect(d.next()).toBe(afterFork);
    const ints = Array.from({ length: 200 }, () => a.int(5));
    expect(Math.min(...ints)).toBe(0);
    expect(Math.max(...ints)).toBe(4);
  });

  it('Scheduler：按时间、同刻按登记顺序执行；可取消；回调里可再登记', () => {
    const s = new Scheduler();
    const log: string[] = [];
    s.at(2, () => log.push('b'));
    s.at(1, () => log.push('a'));
    s.at(2, () => log.push('c'));
    const cancelled = s.at(1.5, () => log.push('x'));
    s.cancel(cancelled);
    s.at(3, () => {
      log.push('d');
      s.at(3, () => log.push('e'));
    });
    s.run(0.5);
    expect(log).toEqual([]);
    s.run(2);
    expect(log).toEqual(['a', 'b', 'c']);
    s.run(3);
    expect(log).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(s.pending).toBe(0);
  });
});

describe('技能工具箱：范围查询', () => {
  it('圆 / 扇形 / 线段，按队伍与类型过滤', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    const front = spawnMinionAt(sim, 1, 'melee', 4, 0);
    const side = spawnMinionAt(sim, 1, 'melee', 0, 4);
    const behind = spawnMinionAt(sim, 1, 'melee', -4, 0);
    const far = spawnMinionAt(sim, 1, 'melee', 9, 0);
    const ally = spawnMinionAt(sim, 0, 'melee', 3, 1);
    const enemyHero = heroOf(sim, 1, 'xingli');
    place(sim, enemyHero, 3, -1);
    const enemies = tk.enemyFilter(h.team);
    const ids = (list: { id: number }[]): number[] => list.map((u) => u.id).sort((a, b) => a - b);

    expect(ids(tk.unitsInCircle(sim, h.pos, 5, enemies))).toEqual(ids([front, side, behind, enemyHero]));
    // 身体半径计入：圆刚好够到 far 的边缘(中心 9，半径 0.5)
    expect(tk.unitsInCircle(sim, h.pos, 8.6, enemies).some((u) => u.id === far.id)).toBe(true);
    expect(tk.unitsInCircle(sim, h.pos, 8.4, enemies).some((u) => u.id === far.id)).toBe(false);
    expect(ids(tk.unitsInCircle(sim, h.pos, 5, tk.enemyFilter(h.team, { heroesOnly: true })))).toEqual([enemyHero.id]);
    expect(ids(tk.unitsInCircle(sim, h.pos, 5, tk.allyFilter(h.team, { exclude: h })))).toEqual([ally.id]);
    // 由近到远排序
    const sorted = tk.unitsInCircle(sim, h.pos, 10, enemies);
    for (let i = 1; i < sorted.length; i++) {
      expect(Math.hypot(sorted[i].pos.x, sorted[i].pos.y)).toBeGreaterThanOrEqual(Math.hypot(sorted[i - 1].pos.x, sorted[i - 1].pos.y));
    }
    expect(tk.nearestUnit(sim, h.pos, 10, enemies)?.id).toBe(enemyHero.id);

    // 110° 扇形朝 +x：前方与斜前方命中，侧面与背后不命中
    const cone = tk.unitsInCone(sim, h.pos, { x: 1, y: 0 }, 5.5, (110 * Math.PI) / 180, enemies);
    expect(ids(cone)).toEqual(ids([front, enemyHero]));
    // 线段：宽 2 的直线朝 +x 12 米
    const line = tk.unitsInLine(sim, h.pos, { x: 12, y: 0 }, 2, enemies);
    expect(line.map((u) => u.id)).toEqual([enemyHero.id, front.id, far.id]);
    // 建筑默认不在技能目标里
    const tower = sim.towers[1].mid[0];
    if (tower) {
      expect(tk.unitsInCircle(sim, tower.pos, 3, enemies).length).toBe(0);
      expect(tk.unitsInCircle(sim, tower.pos, 3, tk.enemyFilter(h.team, { structures: true })).length).toBe(1);
    }
  });
});

describe('技能工具箱：效果', () => {
  it('技能脚本 + 被动钩子：伤害、控制、护盾、延迟、冷却返还', () => {
    const sim = quietWorld('chijin');
    const h = heroOf(sim, 0, 'chijin');
    place(sim, h, 0, 0);
    const m = spawnMinionAt(sim, 1, 'melee', 3, 0, 'mid', 5000);
    freezeUnit(m);
    const log: string[] = [];
    const hooks: HeroHooks = {
      onSkillCast: (_s, _h, slot) => { log.push(`cast:${slot}`); },
      onSkillHit: (_s, _h, target, dealt) => { log.push(`hit:${target.id}:${Math.round(dealt)}`); },
      onKill: (_s, _h, victim) => { log.push(`kill:${victim.id}`); },
      modifyDamageDealt: (_s, _h, _t, info) => { if (info.kind === 'skill') info.amount *= 2; },
      statMods: (_s, hero, acc) => { if (hasBuff(hero, 'chijin_blaze')) acc.asPct += 0.5; },
    };
    h.h.hooks.push(hooks);
    const original = getSkill('chijin', 's1');
    registerSkill('chijin', 's1', {
      lockTime: 0,
      cast(ctx) {
        const { sim: s, caster } = ctx;
        tk.after(ctx, 0.1, () => {
          for (const u of tk.unitsInCone(s, caster.pos, ctx.dir, 5.5, 2, tk.enemyFilter(caster.team))) {
            tk.skillDamage(s, caster, u, ctx.val('damage'), 'true', ctx.slot);
            tk.slow(s, u, ctx.val('slow'), ctx.val('slowDur'), caster);
            tk.knockup(s, u, 0.5, caster);
          }
        });
        tk.addShield(s, caster, 300, 2, caster);
        tk.addBuff(s, caster, 'chijin_blaze', { duration: 4, sourceId: caster.id });
        tk.refundCooldown(caster, 's1', 0.4);
      },
    });
    try {
      const as0 = h.stats.attackSpeed;
      sim.drainEvents();
      sim.command(h.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
      expect(h.shield).toBe(300);
      expect(h.stats.attackSpeed).toBeCloseTo(as0 * 1.5, 6);
      expect(h.skills.s1.cd).toBeCloseTo(h.skills.s1.cdMax * 0.6, 6);
      expect(log).toEqual(['cast:s1']);
      expect(m.hp).toBe(5000);
      stepFor(sim, 0.15);
      // 220 基础伤害 × 钩子的 2 倍
      expect(m.hp).toBe(5000 - 440);
      expect(log[1]).toBe(`hit:${m.id}:440`);
      expect(hasBuff(m, 'slow')).toBe(true);
      expect(m.rt.stunned).toBe(true);
      expect(m.anim).toBe('airborne');
      stepFor(sim, 2);
      expect(h.shield).toBe(0);
      // 击杀钩子
      tk.skillDamage(sim, h, m, 1e6, 'true');
      expect(log).toContain(`kill:${m.id}`);
      // 施法者死亡后延迟效果不再执行
      h.skills.s1.cd = 0;
      const m2 = spawnMinionAt(sim, 1, 'melee', 3, 0, 'mid', 5000);
      freezeUnit(m2);
      sim.command(h.id, { type: 'cast', slot: 's1', dir: { x: 1, y: 0 } });
      killUnit(sim, h, null);
      stepFor(sim, 0.3);
      expect(m2.hp).toBe(5000);
    } finally {
      registerSkill('chijin', 's1', original);
    }
  });

  it('拉拽 / 击退 / 闪烁 / 追踪弹目标消失 / 缴械', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'xingli');
    const e = heroOf(sim, 1, 'panyue');
    place(sim, h, 0, 0);
    place(sim, e, 5, 0);
    stepFor(sim, 0.1);
    expect(tk.pullToward(sim, e, h.pos, 1.6)).toBe(true);
    stepFor(sim, 0.3);
    expect(e.pos.x).toBeCloseTo(3.4, 3);
    expect(tk.knockback(sim, e, h.pos, 2)).toBe(true);
    stepFor(sim, 0.3);
    expect(e.pos.x).toBeCloseTo(5.4, 3);
    // 闪烁到墙里：落在最近可走点，prevPos 同步
    tk.blink(sim, h, { x: -44, y: 0 });
    expect(sim.nav.isFree(h.pos.x, h.pos.y, h.rt.navR)).toBe(true);
    expect(h.prevPos).toEqual(h.pos);
    // 追踪弹：目标变得不可选中后熄灭，不造成伤害
    place(sim, h, 0, 0);
    stepFor(sim, 0.1);
    sim.command(h.id, { type: 'attack', targetId: e.id });
    let spawned = false;
    for (let i = 0; i < 30 && !spawned; i++) {
      sim.step();
      spawned = sim.projectiles.length > 0;
    }
    expect(spawned).toBe(true);
    sim.command(h.id, { type: 'stop' });
    tk.addBuff(sim, e, 'untargetable', { duration: 1 });
    const hp = e.hp;
    const ev = stepFor(sim, 0.5);
    expect(sim.projectiles.length).toBe(0);
    expect(eventsOf(ev, 'projectileEnd').length).toBe(1);
    expect(eventsOf(ev, 'projectileHit').length).toBe(0);
    expect(e.hp).toBeGreaterThanOrEqual(hp);
    // 缴械期间不会出手
    stepFor(sim, 1);
    tk.disarm(sim, h, 2);
    sim.command(h.id, { type: 'attack', targetId: e.id });
    expect(eventsOf(stepFor(sim, 1.8), 'attack').filter((a) => a.unitId === h.id).length).toBe(0);
    expect(eventsOf(stepFor(sim, 0.5), 'attack').filter((a) => a.unitId === h.id).length).toBe(1);
  });

  it('位移乱序轰炸：冲刺/跃击/闪烁/拉拽之后单位始终落在可走位置', () => {
    const sim = quietWorld();
    const rng = new Rng(2024);
    const heroes = sim.heroes;
    for (const h of heroes) place(sim, h, rng.range(-50, 50), rng.range(-50, 50));
    for (const h of heroes) tk.blink(sim, h, h.pos);
    let bad = 0;
    for (let i = 0; i < 30 * 60; i++) {
      for (const h of heroes) {
        if (!rng.chance(0.06)) continue;
        const dir = { x: rng.range(-1, 1), y: rng.range(-1, 1) };
        const to = { x: h.pos.x + rng.range(-12, 12), y: h.pos.y + rng.range(-12, 12) };
        switch (rng.int(5)) {
          case 0: tk.startDash(sim, h, { dir, distance: rng.range(1, 9), speed: rng.range(10, 40) }); break;
          case 1: tk.startDash(sim, h, { dir, distance: rng.range(1, 9), speed: rng.range(10, 40), ignoreWalls: true }); break;
          case 2: tk.startLeap(sim, h, to.x, to.y, rng.range(0.2, 0.8)); break;
          case 3: tk.blink(sim, h, to); break;
          default: tk.displace(sim, h, dir.x, dir.y, rng.range(0.5, 4), rng.range(8, 20)); break;
        }
      }
      sim.step();
      sim.drainEvents();
      for (const h of heroes) {
        if (!Number.isFinite(h.pos.x + h.pos.y)) bad++;
        // 跃击/穿墙冲刺途中允许在墙上方，其余时刻必须站在可走位置
        else if (h.rt.dash === null && !sim.nav.isFree(h.pos.x, h.pos.y, h.rt.navR - 0.1)) bad++;
      }
    }
    expect(bad).toBe(0);
  });

  it('scaled：按伤害约定叠加系数', () => {
    const sim = quietWorld('panyue');
    const h = heroOf(sim, 0, 'panyue');
    place(sim, h, 0, 0);
    let got = 0;
    let geo = '';
    const original = getSkill('panyue', 's2');
    registerSkill('panyue', 's2', {
      cast: (ctx) => {
        got = tk.scaled(ctx, 'shield', { hp: 'hpRatio' });
        geo = `${ctx.spec.type}:${ctx.range}:${ctx.radius}:${ctx.width}:${ctx.angle}`;
      },
    });
    try {
      levelTo(sim, h, 2);
      sim.command(h.id, { type: 'cast', slot: 's2' });
      expect(got).toBeCloseTo(300 + 0.09 * h.stats.maxHp, 6);
      expect(geo).toBe('self:0:4.5:0:0');
    } finally {
      registerSkill('panyue', 's2', original);
    }
  });

  it('被动内部冷却与自由变量', () => {
    const sim = quietWorld();
    const h = heroOf(sim, 0, 'chijin');
    expect(tk.tryInternalCooldown(sim, h, 'x', 5)).toBe(true);
    expect(tk.tryInternalCooldown(sim, h, 'x', 5)).toBe(false);
    stepFor(sim, 5.1);
    expect(tk.tryInternalCooldown(sim, h, 'x', 5)).toBe(true);
    expect(tk.getVar(h, 'n', 7)).toBe(7);
    tk.setVar(h, 'n', 3);
    expect(tk.getVar(h, 'n')).toBe(3);
  });
});

describe('命令健壮性', () => {
  it('随机/非法命令轰炸：不抛异常、不产生 NaN、英雄不进墙', () => {
    const sim = createWorld({ seed: 11, playerHero: 'yeque', difficulty: 'normal' }, { noBots: true });
    const rng = new Rng(99);
    const slots: SkillSlot[] = ['s1', 's2', 'ult', 'recall', 'heal', 'flash'];
    for (const h of sim.heroes) levelTo(sim, h, 6);
    const junk = [NaN, Infinity, -Infinity, 1e300, 0];
    const randomCmd = (): PlayerCommand => {
      const r = rng.int(12);
      const v = (): { x: number; y: number } => (rng.chance(0.08)
        ? { x: rng.pick(junk), y: rng.pick(junk) }
        : { x: rng.range(-70, 70), y: rng.range(-70, 70) });
      const id = rng.chance(0.2) ? rng.int(4000) - 5 : rng.pick(sim.units).id;
      switch (r) {
        case 0: return { type: 'move', dir: rng.chance(0.2) ? { x: 0, y: 0 } : v() };
        case 1: return { type: 'moveTo', pos: v() };
        case 2: return { type: 'stop' };
        case 3: return { type: 'attack' };
        case 4: return { type: 'attack', targetId: id };
        case 5: return { type: 'cast', slot: rng.pick(slots) };
        case 6: return { type: 'cast', slot: rng.pick(slots), dir: v() };
        case 7: return { type: 'cast', slot: rng.pick(slots), pos: v() };
        case 8: return { type: 'cast', slot: rng.pick(slots), targetId: id };
        case 9: return { type: 'buy', itemId: rng.pick(['boots', 'iron_blade', 'boots_fury', 'thorn_mail', 'sage_codex'] as const) };
        case 10: return { type: 'sell', index: rng.int(9) - 2 };
        default: return { type: 'cast', slot: 'nope' as SkillSlot };
      }
    };
    let bad = 0;
    for (let i = 0; i < 30 * 90; i++) {
      for (const h of sim.heroes) {
        if (rng.chance(0.25)) sim.command(h.id, randomCmd());
        // 冷却清零，让技能/闪现被大量触发
        if (rng.chance(0.02)) for (const s of slots) h.skills[s].cd = 0;
      }
      sim.command(-1, { type: 'stop' });
      sim.command(sim.cores[0].id, { type: 'stop' });
      sim.step();
      sim.drainEvents();
      for (const u of sim.units) {
        if (!Number.isFinite(u.pos.x + u.pos.y + u.hp + u.mana + u.facing)) bad++;
        // 跃击(磐岳大招)途中允许在墙体上方，其余时刻英雄必须站在可走位置
        else if (u.kind === 'hero' && u.alive && !(u.rt.dash && u.rt.dash.ignoreWalls) && !sim.nav.isFree(u.pos.x, u.pos.y, u.rt.navR - 0.1)) bad++;
      }
    }
    expect(bad).toBe(0);
    for (const h of sim.heroes) {
      expect(h.gold).toBeGreaterThanOrEqual(0);
      expect(h.items.length).toBe(6);
      expect(h.items.filter((x) => x !== null && x.startsWith('boots')).length).toBeLessThanOrEqual(1);
    }
  }, 30000);
});

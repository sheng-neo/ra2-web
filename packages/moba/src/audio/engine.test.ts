/**
 * 引擎的事件 → 音效映射(第二阶段新增的部分)：自动出装的提示音、与界面购买音的去重、
 * 河道巨龙吐息(可见性 / 时长 / 巨龙被打死时收声)、野怪与史诗野怪的音色变体、
 * 王昭君普攻的乐句、李广与荆轲弹道的变体、荆轲「得手」提示。
 * 用假的 AudioContext 跑真实的 Engine + Mixer，只看它向混音器要了哪些声音。
 */
import { describe, expect, it } from 'vitest';
import { createMockState } from '../core/mock';
import { TICK_DT } from '../core/types';
import type { GameEvent, GameState, HeroId, HeroUnit, MonsterType, MonsterUnit, Unit } from '../core/types';
import { Engine } from './engine';
import { attachSpy } from './testkit';
import type { PlayCall } from './testkit';

interface Rig {
  eng: Engine;
  st: GameState;
  me: HeroUnit;
  calls: PlayCall[];
  /** 喂一批事件(之前先把假时钟拨快 dt 秒，避开同键限流) */
  feed(events: GameEvent[], dt?: number): void;
  of(key: string): PlayCall[];
}

function rig(hero: HeroId = 'chijin'): Rig {
  const eng = new Engine();
  const st = createMockState(hero);
  const { calls, clock } = attachSpy(eng);
  const me = st.heroes[0];
  return {
    eng, st, me, calls,
    feed(events, dt = 2) {
      clock.t += dt;
      st.time += dt;
      eng.handleEvents(events, st);
    },
    of: (key) => calls.filter((c) => c.key === key),
  };
}

function monster(st: GameState, type: MonsterType): MonsterUnit {
  const u = st.units.find((x): x is MonsterUnit => x.kind === 'monster' && x.monsterType === type);
  if (!u) throw new Error(`假对局里没有 ${type}`);
  return u;
}

/** 把单位挪到玩家身边 dx 米处(声音的可听距离以内) */
function near(r: Rig, u: Unit, dx = 3): Unit {
  u.pos = { x: r.me.pos.x + dx, y: r.me.pos.y };
  return u;
}

describe('自动出装的提示音', () => {
  it('手动购买照原样响，自动购买是同一个音、音量 0.6；别人买装备不响', () => {
    const r = rig();
    r.feed([{ type: 'itemBought', unitId: r.st.playerId, itemId: 'boots' }]);
    r.feed([{ type: 'itemBought', unitId: r.st.playerId, itemId: 'boots_fury', auto: true }]);
    r.feed([{ type: 'itemBought', unitId: r.st.heroes[1].id, itemId: 'boots', auto: true }]);
    const buys = r.of('buy');
    expect(buys.length).toBe(2);
    expect(buys[0].opts.gain ?? 1).toBe(1);
    expect(buys[1].opts.gain).toBe(0.6);
    expect(buys.every((c) => c.played)).toBe(true);
  });

  it('界面已经响过购买音时，同一时刻的 itemBought 不再叠一声', () => {
    const r = rig();
    r.eng.ui('buy');
    r.feed([{ type: 'itemBought', unitId: r.st.playerId, itemId: 'boots' }], 0);
    r.feed([{ type: 'itemBought', unitId: r.st.playerId, itemId: 'boots_fury', auto: true }], 0.1);
    expect(r.of('ui_buy').filter((c) => c.played).length).toBe(1);
    expect(r.of('buy').filter((c) => c.played).length).toBe(0);
    // 过了限流间隔之后的自动购买照常响
    r.feed([{ type: 'itemBought', unitId: r.st.playerId, itemId: 'sage_codex', auto: true }], 1);
    expect(r.of('buy').filter((c) => c.played).length).toBe(1);
  });
});

describe('河道巨龙吐息', () => {
  const fan = (r: Rig, dirX: number): { pos: { x: number; y: number }; team: 2; unitId: number; dir: { x: number; y: number }; radius: number; angle: number } => ({
    pos: { x: r.me.pos.x - 5, y: r.me.pos.y }, team: 2, unitId: monster(r.st, 'abyss_drake').id, dir: { x: dirX, y: 0 }, radius: 7.5, angle: Math.PI / 3,
  });

  it('预警与喷吐各一声，时长取事件给的秒数；盯着玩家时优先级最高', () => {
    const r = rig();
    r.feed([{ type: 'fx', key: 'drake_breath_warn', ...fan(r, 1), targetId: r.st.playerId, value: 0.9 }]);
    r.feed([{ type: 'fx', key: 'drake_breath', ...fan(r, 1), value: 0.8 }], 0.9);
    const warn = r.of('fx_drake_breath_warn');
    const breath = r.of('fx_drake_breath');
    expect(warn.length).toBe(1);
    expect(breath.length).toBe(1);
    expect(warn[0].opts.dur).toBeCloseTo(0.9);
    expect(breath[0].opts.dur).toBeCloseTo(0.8);
    expect(warn[0].opts.prio).toBe(3);
    expect(warn[0].played && breath[0].played).toBe(true);
  });

  it('时长异常的事件被夹在 0.3 ~ 1.6 秒之间', () => {
    const r = rig();
    r.feed([{ type: 'fx', key: 'drake_breath', ...fan(r, 1), value: 40 }]);
    expect(r.of('fx_drake_breath')[0].opts.dur).toBe(1.6);
  });

  it('玩家站在扇形里(或被盯上)比站在扇形外更响', () => {
    const a = rig();
    a.feed([{ type: 'fx', key: 'drake_breath', ...fan(a, 1), value: 0.8 }]);
    const b = rig();
    b.feed([{ type: 'fx', key: 'drake_breath', ...fan(b, -1), value: 0.8 }]);
    const inside = a.of('fx_drake_breath')[0].opts.gain ?? 0;
    const outside = b.of('fx_drake_breath')[0].opts.gain ?? 0;
    expect(outside / inside).toBeCloseTo(0.7, 5);
    expect(b.of('fx_drake_breath')[0].opts.prio).toBe(2);
  });

  it('巨龙不在视野里：不出声(哪怕它盯着的目标看得见)', () => {
    const r = rig();
    monster(r.st, 'abyss_drake').visible[0] = false;
    r.feed([{ type: 'fx', key: 'drake_breath_warn', ...fan(r, 1), targetId: r.st.heroes[1].id, value: 0.9 }]);
    r.feed([{ type: 'fx', key: 'drake_breath', ...fan(r, 1), value: 0.8 }], 0.9);
    expect(r.of('fx_drake_breath_warn').length + r.of('fx_drake_breath').length).toBe(0);
  });

  it('巨龙盯着一个看不见的敌人：预警照样响(危险提示只看巨龙自己)', () => {
    const r = rig();
    const foe = r.st.heroes[5];
    foe.visible[0] = false;
    r.feed([{ type: 'fx', key: 'drake_breath_warn', ...fan(r, 1), targetId: foe.id, value: 0.9 }]);
    expect(r.of('fx_drake_breath_warn').length).toBe(1);
  });

  it('预警到一半巨龙被打死：声音被收掉；别的野怪死亡不影响', () => {
    const r = rig();
    const drake = monster(r.st, 'abyss_drake');
    r.feed([{ type: 'fx', key: 'drake_breath_warn', ...fan(r, 1), targetId: r.st.playerId, value: 0.9 }]);
    r.feed([{ type: 'death', unitId: monster(r.st, 'mossback').id, kind: 'monster', team: 2, killerId: r.st.playerId, pos: r.me.pos }], 0.2);
    expect(r.of('fx_drake_breath_warn')[0].stopped).toBe(false);
    r.feed([{ type: 'death', unitId: drake.id, kind: 'monster', team: 2, killerId: r.st.playerId, pos: drake.pos }], 0.2);
    expect(r.of('fx_drake_breath_warn')[0].stopped).toBe(true);
  });

  it('吐息的伤害事件(skill = true)不会再触发史诗野怪的重击声', () => {
    const r = rig();
    const drake = near(r, monster(r.st, 'abyss_drake'));
    r.feed([{ type: 'damage', targetId: r.st.playerId, sourceId: drake.id, amount: 80, dtype: 'magic', crit: false, pos: r.me.pos, skill: true }]);
    expect(r.of('epic_hit').length).toBe(0);
  });
});

describe('野怪的音色变体', () => {
  const VAR: Record<MonsterType, number> = { mossback: 0, frost_golem: 1, ember_golem: 2, abyss_drake: 3, star_colossus: 4, glimwing: 5 };

  it('出手 / 命中 / 倒下按野怪种类取变体，史诗野怪用自己的重击声', () => {
    const r = rig();
    const pid = r.st.playerId;
    for (const type of ['mossback', 'frost_golem', 'ember_golem', 'abyss_drake', 'star_colossus'] as const) {
      const m = near(r, monster(r.st, type));
      r.feed([{ type: 'attack', unitId: m.id, targetId: pid }]);
      r.feed([{ type: 'damage', targetId: pid, sourceId: m.id, amount: 30, dtype: 'physical', crit: false, pos: r.me.pos, skill: false }]);
    }
    expect(r.of('monster_swing').map((c) => c.opts.v)).toEqual([0, 1, 2, 3, 4]);
    expect(r.of('monster_hit').map((c) => c.opts.v)).toEqual([0, 1, 2]);
    expect(r.of('epic_hit').map((c) => c.opts.v)).toEqual([0, 1]);
    for (const type of ['mossback', 'frost_golem', 'ember_golem', 'glimwing'] as const) {
      const m = near(r, monster(r.st, type));
      r.feed([{ type: 'death', unitId: m.id, kind: 'monster', team: 2, killerId: pid, pos: m.pos }]);
    }
    expect(r.of('death_monster').map((c) => c.opts.v)).toEqual([VAR.mossback, VAR.frost_golem, VAR.ember_golem, VAR.glimwing]);
  });

  it('远程野怪(荧翅蛾)出手不走挥击声', () => {
    const r = rig();
    const m = near(r, monster(r.st, 'glimwing'));
    r.feed([{ type: 'attack', unitId: m.id, targetId: r.st.playerId }]);
    expect(r.of('monster_swing').length).toBe(0);
  });

  it('普通营地刷新：在视野里才出声；史诗野怪现身全图可闻，按种类取变体', () => {
    const r = rig();
    const at = { x: r.me.pos.x + 4, y: r.me.pos.y };
    r.feed([{ type: 'monsterSpawn', campId: 1, monsterType: 'frost_golem', pos: at }]);
    r.feed([{ type: 'monsterSpawn', campId: 2, monsterType: 'ember_golem', pos: at }]);
    // 远在敌方半区、己方没有视野的营地
    r.feed([{ type: 'monsterSpawn', campId: 3, monsterType: 'mossback', pos: { x: 300, y: 300 } }]);
    expect(r.of('monster_spawn').map((c) => c.opts.v)).toEqual([1, 2]);
    // (史诗野怪的现身 / 倒下声各有三秒多长、同键只留一个发声：两次之间隔开 5 秒)
    r.feed([{ type: 'monsterSpawn', campId: 8, monsterType: 'abyss_drake', pos: { x: 300, y: 300 } }], 5);
    r.feed([{ type: 'monsterSpawn', campId: 9, monsterType: 'star_colossus', pos: { x: 300, y: 300 } }], 5);
    const roars = r.of('epic_roar');
    expect(roars.map((c) => c.opts.v)).toEqual([0, 1]);
    expect(roars.every((c) => c.played && (c.opts.gain ?? 0) >= 0.3)).toBe(true);
    r.feed([{ type: 'epicSlain', monsterType: 'abyss_drake', team: 0, pos: at }], 5);
    r.feed([{ type: 'epicSlain', monsterType: 'star_colossus', team: 1, pos: at }], 5);
    expect(r.of('epic_fall').map((c) => c.opts.v)).toEqual([0, 1]);
  });
});

describe('英雄音色的事件细节', () => {
  it('王昭君普攻沿乐句推进：每位各记各的进度，停手 3 秒从头再来', () => {
    const r = rig('xingli');
    const pid = r.st.playerId;
    const other = r.st.heroes.find((h) => h.team === 1 && h.heroId === 'xingli');
    if (!other) throw new Error('假对局里没有敌方王昭君');
    near(r, other, 4);
    let id = 100;
    const shot = (ownerId: number, dt: number): void => r.feed([{ type: 'projectileSpawn', id: id++, visual: 'xingli_basic', pos: r.me.pos, ownerId }], dt);
    shot(pid, 1);
    shot(pid, 1);
    shot(other.id, 0.5);
    shot(pid, 1);
    shot(pid, 3.5);
    expect(r.of('atk_xingli_launch').map((c) => c.opts.v)).toEqual([0, 1, 0, 2, 0]);
  });

  it('李广「白羽没石」命中英雄用石裂变体，命中小兵不用；普通箭不带变体', () => {
    const r = rig('fengling');
    const foe = near(r, r.st.heroes[5]);
    const minion = r.st.units.find((u) => u.kind === 'minion' && u.team === 1);
    if (!minion) throw new Error('假对局里没有敌方小兵');
    near(r, minion, 2);
    r.feed([{ type: 'projectileHit', id: 1, visual: 'fengling_s1', pos: foe.pos, targetId: foe.id }]);
    r.feed([{ type: 'projectileHit', id: 1, visual: 'fengling_s1', pos: minion.pos, targetId: minion.id }]);
    r.feed([{ type: 'projectileHit', id: 2, visual: 'fengling_basic', pos: foe.pos, targetId: foe.id }]);
    expect(r.of('fengling_s1_hit').map((c) => c.opts.v)).toEqual([1, 0]);
    expect(r.of('atk_fengling_hit').map((c) => c.opts.v)).toEqual([0]);
  });

  it('荆轲的匕首落空是「钉地」变体，其它技能弹道落空是「消散」', () => {
    const r = rig('yeque');
    r.feed([{ type: 'projectileEnd', id: 1, visual: 'yeque_s2', pos: r.me.pos }]);
    r.feed([{ type: 'projectileEnd', id: 2, visual: 'xingli_s1', pos: r.me.pos }]);
    expect(r.of('proj_fizzle').map((c) => c.opts.v)).toEqual([1, 0]);
  });

  it('荆轲「得手」：状态刚挂上、被新的击杀刷新时各响一声，倒计时期间不响', () => {
    const r = rig('yeque');
    const tick = (): void => r.eng.update(r.st, TICK_DT);
    tick();
    expect(r.of('yeque_refresh').length).toBe(0);
    r.me.buffs.push({ id: 'yeque_shadow', sourceId: r.me.id, timeLeft: 3, duration: 3, stacks: 1, value: 0 });
    tick();
    expect(r.of('yeque_refresh').length).toBe(1);
    const buff = r.me.buffs[r.me.buffs.length - 1];
    for (let i = 0; i < 30; i++) {
      buff.timeLeft -= TICK_DT;
      tick();
    }
    expect(r.of('yeque_refresh').length).toBe(1);
    buff.timeLeft = 3;
    tick();
    expect(r.of('yeque_refresh').length).toBe(2);
    r.me.buffs.length = 0;
    tick();
    expect(r.of('yeque_refresh').length).toBe(2);
  });
});

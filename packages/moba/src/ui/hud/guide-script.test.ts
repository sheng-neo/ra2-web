import { describe, expect, it, vi } from 'vitest';
import { HEROES } from '../../core/data/heroes';
import type { SimHero } from '../../core/internal';
import { freezeUnit, place, quietWorld, spawnMinionAt } from '../../core/testkit';
import type { BuffId, GameEvent, GameState, HeroUnit, TowerUnit, Vec2 } from '../../core/types';
import { TICK_DT } from '../../core/types';
import { createWorld, type Sim } from '../../core/world';
import { GUIDE_TUNE, GuideScript, parseGuideText, plainGuideText, type GuideInput, type GuideView } from './guide-script';

// 这些用例要推进真实模拟层，机器负载高时默认 5 秒不够
vi.setConfig({ testTimeout: 60_000 });

const player = (sim: Sim): SimHero => sim.heroes.find((h) => h.isPlayer) as SimHero;
/** 直接给单位挂一个状态(只填界面读的那几个字段；测试里不再推进模拟层时用) */
function addBuff(u: HeroUnit, id: BuffId, sourceId: number): void {
  u.buffs.push({ id, sourceId, timeLeft: 99, duration: 99, stacks: 1, value: 0 });
}

const tower = (sim: Sim, team: 0 | 1, lane: 'top' | 'mid' | 'bot', tier: 1 | 2 | 3): TowerUnit =>
  sim.units.find((u) => u.kind === 'tower' && u.team === team && u.lane === lane && u.tier === tier) as TowerUnit;

/** 一套「世界 + 脚本」，带推进时间与喂事件的小工具 */
function rig(hero: 'chijin' | 'yeque' = 'chijin', mode: 'kbm' | 'touch' = 'kbm') {
  const sim = quietWorld(hero);
  const me = player(sim);
  const script = new GuideScript(sim.state, me);
  const inp: GuideInput = { state: sim.state, me, mode, shopOpen: false, objectiveHints: true };
  let view: GuideView = script.update(inp);
  const pid = me.id;
  const api = {
    sim,
    me,
    script,
    inp,
    get view() {
      return view;
    },
    /** 推进 seconds 秒：逐 tick 把事件喂给脚本并刷新视图 */
    run(seconds: number): GuideView {
      const n = Math.max(1, Math.round(seconds / TICK_DT));
      for (let i = 0; i < n; i++) {
        sim.step();
        for (const ev of sim.drainEvents()) script.onEvent(ev, sim.state);
        view = script.update(inp);
      }
      return view;
    },
    /** 直接喂一条事件(不经模拟层) */
    emit(ev: GameEvent): void {
      script.onEvent(ev, sim.state);
    },
    /** 一直推进到出现指定步骤的卡片(或超时) */
    until(id: string, max = 200): GuideView {
      for (let t = 0; t < max; t += 0.1) {
        if (view.card && view.card.id === id && !view.card.done) return view;
        api.run(0.1);
      }
      throw new Error(`card ${id} never showed; at ${JSON.stringify(script.debug())}`);
    },
    attack: (): void => api.emit({ type: 'attack', unitId: pid, targetId: 0 }),
    lasthit: (): void => api.emit({ type: 'gold', unitId: pid, amount: 50, pos: me.pos, reason: 'lasthit' }),
    monster: (): void => api.emit({ type: 'gold', unitId: pid, amount: 50, pos: me.pos, reason: 'monster' }),
    cast: (): void => api.emit({ type: 'skillCast', unitId: pid, heroId: me.heroId, slot: 's1', pos: me.pos, dir: { x: 1, y: 0 }, targetPos: me.pos, targetId: -1 }),
    recallDone: (): void => api.emit({ type: 'fx', key: 'recall_done', pos: me.pos, team: 0, unitId: pid }),
    autoBuy: (): void => api.emit({ type: 'itemBought', unitId: pid, itemId: 'guardian_plate', auto: true }),
    hitTower: (t: TowerUnit): void => api.emit({ type: 'damage', targetId: t.id, sourceId: pid, amount: 10, dtype: 'physical', crit: false, pos: t.pos, skill: false }),
    moveTo: (pos: Vec2): void => sim.command(pid, { type: 'moveTo', pos }),
    /** 把玩家直接摆到某处并取消还在执行的移动命令(否则他会接着往原来的目的地走) */
    park(x: number, y: number): void {
      sim.command(pid, { type: 'stop' });
      place(sim, me, x, y);
    },
  };
  return api;
}

/** 走到「放技能」做完为止(之后是回城 / 商店 / 推塔的各种分支) */
function throughSkill(r: ReturnType<typeof rig>): void {
  r.until('move');
  r.moveTo({ x: -52, y: 30 });
  r.until('go');
  const spot = tower(r.sim, 0, 'top', 1).pos;
  r.park(spot.x, spot.y + 4);
  r.run(1.2);
  spawnMinionAt(r.sim, 1, 'melee', r.me.pos.x + 6, r.me.pos.y, 'top', 99999);
  r.until('attack');
  r.attack();
  r.until('lasthit');
  r.lasthit();
  r.lasthit();
  r.until('skill');
  r.cast();
  r.run(1);
  // 清掉木桩：后面的分支不需要它
  for (const u of r.sim.units) if (u.kind === 'minion') u.alive = false;
}

describe('parseGuideText', () => {
  it('拆出键位与强调', () => {
    expect(parseGuideText('按 `W` `A` 移动，去**上路一塔**。')).toEqual([
      { t: 'text', s: '按 ' },
      { t: 'key', s: 'W' },
      { t: 'text', s: ' ' },
      { t: 'key', s: 'A' },
      { t: 'text', s: ' 移动，去' },
      { t: 'bold', s: '上路一塔' },
      { t: 'text', s: '。' },
    ]);
    expect(plainGuideText('按 `Q` 放**一技能**')).toBe('按 Q 放一技能');
    expect(parseGuideText('没有标记')).toEqual([{ t: 'text', s: '没有标记' }]);
  });
});

describe('GuideScript：完整走一遍(键鼠，上路英雄)', () => {
  it('六课九步依次出现，每步做到后打勾 0.8 秒再换下一步，最后给结束语', () => {
    const r = rig('chijin', 'kbm');
    // 开打 2 秒内不出卡
    expect(r.run(1.5).card).toBeNull();
    let v = r.until('move');
    expect(v.card?.title).toBe('移动');
    expect(v.card?.lesson).toBe(1);
    expect(v.card?.text).toBe('按 `W` `A` `S` `D` 移动，或鼠标右键点地面。');
    expect(v.highlight).toBeNull();
    expect(v.lessonsDone).toEqual([false, false, false, false, false, false]);

    // 1a 走够 8 米
    r.moveTo({ x: -52, y: 30 });
    for (let i = 0; i < 100 && !r.view.card?.done; i++) r.run(0.1);
    expect(r.view.card?.id).toBe('move');
    expect(r.view.card?.done).toBe(true);
    expect(r.script.debug().moved).toBeGreaterThanOrEqual(GUIDE_TUNE.moveDist);
    v = r.until('go', 3);
    expect(v.card?.text).toBe('跟着箭头去**上路一塔**，小兵马上就到。');
    const spot = tower(r.sim, 0, 'top', 1).pos;
    expect(v.arrow).toEqual({ pos: spot, label: '上路一塔' });
    expect(v.minimap).toEqual(spot);

    // 1b 走到一塔 12 米内
    r.park(spot.x, spot.y + 4);
    v = r.run(0.1);
    expect(v.card?.done).toBe(true);
    v = r.run(1);
    // 兵还没到：不出卡，第 1 课已完成
    expect(v.card).toBeNull();
    expect(v.arrow).toBeNull();
    expect(v.lessonsDone[0]).toBe(true);
    expect(r.script.debug().step).toBe('attack');

    // 2a 敌方小兵进到 14 米内才教普攻；还够不着时先叫人走近
    const dummy = spawnMinionAt(r.sim, 1, 'melee', r.me.pos.x + 12, r.me.pos.y, 'top', 99999);
    freezeUnit(dummy);
    v = r.until('attack', 2);
    expect(v.card?.title).toBe('普攻补兵');
    expect(v.card?.text).toBe('走近敌方小兵，再按 `空格` 普攻。');
    expect(v.highlight).toBe('attack');
    r.park(dummy.pos.x - 6, dummy.pos.y);
    v = r.run(0.5);
    expect(v.card?.text).toBe('按 `空格` 普攻，会自动打最合适的敌人。');
    r.attack();
    v = r.run(0.1);
    expect(v.card?.done).toBe(true);

    // 2b 补两刀，文案里的进度跟着走
    v = r.until('lasthit', 3);
    expect(v.card?.text).toContain('(0/2)');
    r.lasthit();
    expect(r.run(0.1).card?.text).toContain('(1/2)');
    r.lasthit();
    v = r.run(0.1);
    expect(v.card?.done).toBe(true);
    expect(v.card?.text).toContain('(2/2)');

    // 3 放技能：引用一技能的大白话
    v = r.until('skill', 3);
    expect(v.lessonsDone.slice(0, 2)).toEqual([true, true]);
    expect(v.card?.text).toContain(`按 \`Q\` 放一技能：${HEROES.chijin.skills.s1.brief}。`);
    expect(v.highlight).toBe('s1');
    r.cast();
    expect(r.run(0.1).card?.done).toBe(true);
    v = r.run(1);
    expect(v.card).toBeNull();
    expect(r.script.debug().step).toBe('recall');
    for (const u of r.sim.units) if (u.kind === 'minion') u.alive = false;

    // 4a 回城：放完技能 60 秒后教
    r.run(GUIDE_TUNE.recallAfter - 3);
    expect(r.view.card).toBeNull();
    v = r.until('recall', 5);
    expect(v.card?.title).toBe('回城与出装');
    expect(v.card?.text).toContain('按 `B` 回城');
    expect(v.highlight).toBe('recall');
    r.recallDone();
    expect(r.run(0.1).card?.done).toBe(true);

    // 4b 商店：打开过一次就算
    v = r.until('shop', 3);
    expect(v.highlight).toBe('shop');
    expect(v.card?.text).toContain('按 `P` 打开商店');
    r.inp.shopOpen = true;
    expect(r.run(0.1).card?.done).toBe(true);
    r.inp.shopOpen = false;
    v = r.run(1);
    expect(v.card).toBeNull();
    expect(v.lessonsDone.slice(0, 4)).toEqual([true, true, true, true]);

    // 5 推塔：我方小兵进了敌塔射程、人在 22 米内
    const foeT1 = tower(r.sim, 1, 'top', 1);
    r.park(foeT1.pos.x - 14, foeT1.pos.y);
    r.run(0.5);
    expect(r.view.card).toBeNull();
    spawnMinionAt(r.sim, 0, 'melee', foeT1.pos.x - 4, foeT1.pos.y, 'top', 99999);
    v = r.until('push', 2);
    expect(v.card?.text).toContain('小兵进塔了！');
    expect(v.arrow?.label).toBe('上路一塔');
    expect(v.arrow?.pos).toEqual(foeT1.pos);
    expect(v.minimap).toEqual(foeT1.pos);
    // 打到塔之后卡片再留 20 秒
    r.hitTower(foeT1);
    r.run(GUIDE_TUNE.pushLinger - 2);
    expect(r.view.card?.id).toBe('push');
    expect(r.view.card?.done).toBe(false);
    for (let i = 0; i < 40 && !r.view.card?.done; i++) r.run(0.1);
    expect(r.view.card?.done).toBe(true);

    // 6 获胜：读 8 秒，小地图指向敌方水晶
    v = r.until('win', 3);
    expect(v.card?.text).toContain('一塔 → 二塔 → 高地塔');
    expect(v.minimap).toEqual(r.sim.state.map.bases[1].core);
    expect(v.arrow).toBeNull();
    r.run(GUIDE_TUNE.winShow + 0.2);
    v = r.view;
    expect(v.card?.kind).toBe('outro');
    expect(v.card?.text).toBe('引导结束，接下来看屏幕上方的目标提示。');
    expect(v.lessonsDone).toEqual([true, true, true, true, true, true]);
    expect(v.finished).toBe(false);
    v = r.run(GUIDE_TUNE.outroShow + 0.2);
    expect(v.card).toBeNull();
    expect(v.finished).toBe(true);
    expect(r.script.finished).toBe(true);
  });
});

describe('GuideScript：触控文案与控件光圈', () => {
  it('移动提示摇杆、普攻 / 技能 / 回城 / 商店各有触控说法', () => {
    const r = rig('chijin', 'touch');
    let v = r.until('move');
    expect(v.card?.text).toBe('拖动左下角的摇杆移动。');
    expect(v.highlight).toBe('joystick');
    r.moveTo({ x: -52, y: 30 });
    r.until('go');
    const spot = tower(r.sim, 0, 'top', 1).pos;
    r.park(spot.x, spot.y + 4);
    r.run(1.2);
    spawnMinionAt(r.sim, 1, 'melee', r.me.pos.x + 6, r.me.pos.y, 'top', 99999);
    v = r.until('attack');
    expect(v.card?.text).toBe('按住右下角的大按钮普攻。');
    // 够不着时的触控说法
    for (const u of r.sim.units) if (u.kind === 'minion') place(r.sim, u, r.me.pos.x + 12, r.me.pos.y);
    expect(r.run(0.4).card?.text).toBe('走近敌方小兵，再按住右下角的大按钮普攻。');
    r.attack();
    r.until('lasthit');
    r.lasthit();
    r.lasthit();
    v = r.until('skill');
    expect(v.card?.text).toContain('轻点一技能：');
    expect(v.card?.text).toContain('按住拖动可以自己瞄准。');
    r.cast();
    r.run(GUIDE_TUNE.recallAfter + 2);
    v = r.until('recall', 5);
    expect(v.card?.text).toContain('点「回城」');
    r.recallDone();
    v = r.until('shop', 3);
    expect(v.card?.text).toContain('点小地图下面的商店');
  });

  it('自动出装开着时，商店那一步先说「会自动购买」', () => {
    const r = rig('chijin', 'kbm');
    r.me.autoBuy = true;
    throughSkill(r);
    r.autoBuy();
    const v = r.until('shop', 3);
    expect(v.card?.text).toBe('金币够了会**自动购买**推荐装备。想自己挑，按 `P` 打开商店。');
  });
});

describe('GuideScript：不卡死', () => {
  it('每一步都会超时：玩家什么都不做，引导也能走到结束', () => {
    const r = rig('chijin', 'kbm');
    const seen: string[] = [];
    let last = '';
    for (let t = 0; t < 700 && !r.script.finished; t += 0.5) {
      const v = r.run(0.5);
      const id = v.card ? v.card.id : '';
      if (id && id !== last) seen.push(id);
      last = id;
      // 超时的步骤不打勾
      if (v.card && v.card.kind === 'step') expect(v.card.done).toBe(false);
    }
    expect(r.script.finished).toBe(true);
    expect(seen).toEqual(['move', 'go', 'attack', 'lasthit', 'skill', 'recall', 'shop', 'push', 'win', 'outro']);
    // 走完用了多久：2 + 30 + 60 + (90 + 45) + 60 + 40 + (60 + 45) + 12 + 40 + 8 + 3 秒
    expect(r.sim.state.time).toBeGreaterThan(400);
    expect(r.sim.state.time).toBeLessThan(520);
  });

  it('单步超时：站着不动 30 秒后换到「去本路」', () => {
    const r = rig();
    r.until('move');
    r.run(GUIDE_TUNE.moveTimeout - 1);
    expect(r.view.card?.id).toBe('move');
    r.run(1.2);
    expect(r.view.card?.id).toBe('go');
  });

  it('早就做过的步骤轮到时直接跳过，不出卡', () => {
    const r = rig();
    // 开局就放了技能、普攻过、补了两刀
    r.cast();
    r.attack();
    r.lasthit();
    r.lasthit();
    r.until('move');
    r.moveTo({ x: -52, y: 30 });
    r.until('go');
    const spot = tower(r.sim, 0, 'top', 1).pos;
    r.park(spot.x, spot.y + 4);
    const seen = new Set<string>();
    for (let t = 0; t < 5; t += 0.1) {
      const v = r.run(0.1);
      if (v.card) seen.add(v.card.id);
    }
    expect(seen.has('attack')).toBe(false);
    expect(seen.has('lasthit')).toBe(false);
    expect(seen.has('skill')).toBe(false);
    expect(r.script.debug().step).toBe('recall');
    expect(r.view.lessonsDone.slice(0, 3)).toEqual([true, true, true]);
  });

  it('一上来就走了 8 米以上：跳过「动一动」，直接指路', () => {
    const r = rig();
    r.moveTo({ x: -52, y: 20 });
    const v = r.until('go', 6);
    expect(r.sim.state.time).toBeLessThan(4);
    expect(v.card?.id).toBe('go');
  });

  it('阵亡时卡片隐藏、计时暂停，复活后继续当前步', () => {
    const r = rig();
    r.until('move');
    r.run(10);
    const t0 = r.script.debug().t;
    // 这一段不推进模拟层(它会让英雄马上复活)：只走时间
    const tick = (sec: number): GuideView => {
      let v = r.script.update(r.inp);
      for (let t = 0; t < sec; t += 0.5) {
        (r.sim.state as GameState).time += 0.5;
        v = r.script.update(r.inp);
      }
      return v;
    };
    r.me.alive = false;
    const v = tick(40);
    expect(v.card).toBeNull();
    expect(v.highlight).toBeNull();
    expect(r.script.debug().t).toBeCloseTo(t0, 5);
    r.me.alive = true;
    expect(tick(0.5).card?.id).toBe('move');
    // 阵亡前用了 10 秒，还剩 20 秒才超时
    expect(tick(15).card?.id).toBe('move');
    expect(tick(6).card?.id).toBe('go');
  });

  it('跳过引导：立刻结束', () => {
    const r = rig();
    r.until('move');
    r.script.skip();
    const v = r.run(0.1);
    expect(v.card).toBeNull();
    expect(v.finished).toBe(true);
    expect(r.script.debug().skipped).toBe(true);
  });

  it('对局结束时不显示', () => {
    const r = rig();
    r.until('move');
    (r.sim.state as GameState).over = true;
    expect(r.script.update(r.inp).card).toBeNull();
  });
});

describe('GuideScript：回城与出装的几种走法', () => {
  it('残血且脱战 1.5 秒：提前教回城，不超时；血回到 60% 以上自动收起，之后到点再教', () => {
    const r = rig();
    throughSkill(r);
    r.park(-48, -20);
    r.run(0.5);
    r.me.hp = r.me.stats.maxHp * 0.3;
    r.run(1);
    expect(r.view.card).toBeNull();
    const v = r.until('recall', 3);
    expect(r.script.debug().variant).toBe('low');
    expect(v.highlight).toBe('recall');
    // 不超时：过了 45 秒还在(把血压住)，一直压到过了定时版的时间点
    for (let t = 0; t < GUIDE_TUNE.recallAfter + 5; t += 1) {
      r.me.hp = r.me.stats.maxHp * 0.3;
      r.run(1);
    }
    expect(r.view.card?.id).toBe('recall');
    // 血回上来：收起，回到等待
    r.me.hp = r.me.stats.maxHp * 0.7;
    r.run(0.2);
    // 此时已过了定时版的时间点：算学过了，不再唠叨
    expect(r.script.debug().done).toContain('recall');
  });

  it('残血版收起时还没到定时点：回到等待，到点后出定时版，45 秒超时', () => {
    const r = rig();
    throughSkill(r);
    r.park(-48, -20);
    r.run(0.5);
    r.me.hp = r.me.stats.maxHp * 0.3;
    r.until('recall', 4);
    r.me.hp = r.me.stats.maxHp * 0.7;
    r.run(0.3);
    expect(r.view.card).toBeNull();
    expect(r.script.debug().step).toBe('recall');
    expect(r.script.debug().phase).toBe('wait');
    r.until('recall', GUIDE_TUNE.recallAfter + 5);
    expect(r.script.debug().variant).toBe('timed');
    r.run(GUIDE_TUNE.recallTimeout + 1);
    expect(r.script.debug().done).toContain('recall');
    expect(r.view.card?.id).toBe('shop');
  });

  it('走回泉水 / 阵亡复活也算学到了回城', () => {
    const r = rig();
    throughSkill(r);
    r.run(GUIDE_TUNE.recallAfter);
    r.until('recall', 5);
    const f = r.sim.state.map.bases[0].fountain;
    r.park(f.x, f.y);
    for (let i = 0; i < 30 && !r.view.card?.done; i++) r.run(0.1);
    expect(r.view.card?.id).toBe('recall');
    expect(r.view.card?.done).toBe(true);
  });

  it('等回城触发的空档里自动出装买了东西：先讲商店，再回来讲回城', () => {
    const r = rig();
    throughSkill(r);
    r.run(5);
    expect(r.view.card).toBeNull();
    r.autoBuy();
    let v = r.until('shop', 2);
    expect(v.card?.title).toBe('回城与出装');
    // 12 秒自动收起
    r.run(GUIDE_TUNE.shopTimeout + 0.5);
    expect(r.script.debug().done).toContain('shop');
    expect(r.script.debug().step).toBe('recall');
    expect(r.view.card).toBeNull();
    // 回城仍按「放完技能 60 秒」教
    v = r.until('recall', GUIDE_TUNE.recallAfter);
    expect(r.script.debug().variant).toBe('timed');
    r.recallDone();
    r.run(1.2);
    // 商店讲过了：直接等推塔
    expect(r.script.debug().step).toBe('push');
  });

  it('开局那双自动买的草鞋不触发商店提示', () => {
    const r = rig();
    r.autoBuy();
    throughSkill(r);
    r.run(5);
    expect(r.view.card).toBeNull();
    expect(r.script.debug().step).toBe('recall');
  });
});

describe('GuideScript：推塔的几种走法', () => {
  function toPush(r: ReturnType<typeof rig>): void {
    throughSkill(r);
    r.recallDone();
    r.inp.shopOpen = true;
    r.run(0.2);
    r.inp.shopOpen = false;
    r.run(0.2);
    expect(r.script.debug().step).toBe('push');
  }

  it('到 4 分钟还没遇到「兵进塔」：直接教，文案换成等兵的说法，箭头指向本路当前打得动的塔', () => {
    const r = rig();
    toPush(r);
    expect(r.view.card).toBeNull();
    r.run(GUIDE_TUNE.pushAt - 2 - r.sim.state.time);
    expect(r.sim.state.time).toBeLessThan(GUIDE_TUNE.pushAt);
    expect(r.view.card).toBeNull();
    const v = r.until('push', 4);
    expect(r.script.debug().variant).toBe('late');
    expect(v.card?.text).toContain('等小兵进塔再上去打');
    expect(v.arrow?.label).toBe('上路一塔');
    // 40 秒超时
    r.run(GUIDE_TUNE.pushTimeout + 0.5);
    expect(r.view.card?.id).toBe('win');
  });

  it('指着的那座塔被推掉：这一课结束', () => {
    const r = rig();
    toPush(r);
    const t = tower(r.sim, 1, 'top', 1);
    r.park(t.pos.x - 14, t.pos.y);
    spawnMinionAt(r.sim, 0, 'melee', t.pos.x - 4, t.pos.y, 'top', 99999);
    r.until('push', 3);
    t.alive = false;
    const v = r.run(0.1);
    expect(v.card?.id).toBe('push');
    expect(v.card?.done).toBe(true);
  });

  it('早就打过塔：跳过推塔这一课', () => {
    const r = rig();
    r.hitTower(tower(r.sim, 1, 'mid', 1));
    throughSkill(r);
    r.recallDone();
    r.inp.shopOpen = true;
    r.run(0.3);
    expect(r.view.card?.id).toBe('win');
  });
});

describe('GuideScript：打野英雄变体', () => {
  it('去增益怪营地 → 野怪进 14 米教普攻 → 打死一只野怪算补刀', () => {
    const r = rig('yeque', 'kbm');
    r.until('move');
    r.moveTo({ x: -45, y: 40 });
    let v = r.until('go');
    expect(v.card?.text).toMatch(/^你是打野：跟着箭头去\*\*(蓝|红)buff\*\*，打野怪升级。$/);
    const camp = r.sim.state.map.camps.find((c) => c.side === 0 && v.arrow && c.pos.x === v.arrow.pos.x && c.pos.y === v.arrow.pos.y);
    expect(camp).toBeDefined();
    expect(camp?.monsterType === 'frost_golem' || camp?.monsterType === 'ember_golem').toBe(true);
    expect(v.arrow?.label).toMatch(/^(蓝|红)buff$/);
    if (!camp) return;
    // 落脚点别在草丛里(否则空档里会先出草丛的小贴士)
    for (const [ox, oy] of [[5, 0], [0, 5], [-5, 0], [0, -5]]) {
      r.park(camp.pos.x + ox, camp.pos.y + oy);
      r.run(0.1);
      if (r.me.bushId < 0) break;
    }
    expect(r.me.bushId).toBe(-1);
    // 试落脚点时可能蹭过草丛：等那条草丛小贴士播完(5 秒)再往下看
    r.run(7);
    // 敌方小兵在旁边不算(打野看的是野怪)
    spawnMinionAt(r.sim, 1, 'melee', r.me.pos.x + 4, r.me.pos.y, 'mid', 99999);
    r.run(1);
    expect(r.view.card).toBeNull();
    // 摆一只野怪(借小兵的壳改成野怪的种类字段太绕，这里直接往单位表里放一个最小的野怪对象)
    const proto = r.sim.units.find((u) => u.kind === 'minion');
    if (!proto) throw new Error('no minion');
    const monster = { ...proto, id: 99001, kind: 'monster', team: 2, monsterType: camp.monsterType, campId: camp.id, pos: { x: camp.pos.x, y: camp.pos.y } };
    (r.sim.state.units as unknown[]).push(monster);
    v = r.script.update(r.inp);
    for (let i = 0; i < 5 && v.card?.id !== 'attack'; i++) {
      (r.sim.state as GameState).time += 0.25;
      v = r.script.update(r.inp);
    }
    expect(v.card?.id, JSON.stringify(r.script.debug())).toBe('attack');
    r.attack();
    (r.sim.state as GameState).time += 1;
    r.script.update(r.inp);
    (r.sim.state as GameState).time += 1;
    v = r.script.update(r.inp);
    expect(v.card?.id).toBe('lasthit');
    expect(v.card?.text).toBe('把野怪打死，金币和经验都归你。(0/1)');
    // 补小兵不算，打死野怪才算
    r.lasthit();
    r.lasthit();
    expect(r.script.update(r.inp).card?.done).toBe(false);
    r.monster();
    expect(r.script.update(r.inp).card?.done).toBe(true);
  });
});

describe('GuideScript：情境小贴士', () => {
  /** 走到「等回城触发」的空档：此时没有步骤卡 */
  function idle(): ReturnType<typeof rig> {
    const r = rig();
    throughSkill(r);
    r.park(-48, -20);
    r.run(0.5);
    expect(r.view.card).toBeNull();
    return r;
  }

  it('技能解锁：空档里显示 5 秒，键鼠带键位；每条每局一次', () => {
    const r = idle();
    r.me.skills.s2.level = 1;
    let v = r.run(0.1);
    expect(v.card?.kind).toBe('tip');
    expect(v.card?.id).toBe('tip_s2');
    expect(v.card?.title).toBe('小贴士');
    expect(v.card?.text).toBe(`二技能解锁了：${HEROES.chijin.skills.s2.brief}。按 \`E\` 施放。`);
    r.run(GUIDE_TUNE.tipShow - 0.5);
    expect(r.view.card?.id).toBe('tip_s2');
    v = r.run(1);
    expect(v.card).toBeNull();
    // 再升一级不重复
    r.me.skills.s2.level = 2;
    expect(r.run(0.5).card).toBeNull();
  });

  it('两条小贴士之间至少隔 15 秒', () => {
    const r = idle();
    r.me.skills.s2.level = 1;
    r.run(0.1);
    r.me.skills.ult.level = 1;
    r.run(GUIDE_TUNE.tipShow + 1);
    expect(r.view.card).toBeNull();
    r.run(GUIDE_TUNE.tipGap - 3);
    expect(r.view.card).toBeNull();
    const v = r.run(3);
    expect(v.card?.id).toBe('tip_ult');
    expect(v.card?.text).toContain('大招解锁了：');
    expect(v.card?.text).toContain('按 `R` 施放。');
  });

  it('步骤卡优先：有步骤卡时普通小贴士排队，过期就作废(下次遇到再提示)', () => {
    const r = rig();
    r.until('move');
    r.me.bushId = 3;
    r.run(1);
    expect(r.view.card?.id).toBe('move');
    r.me.bushId = -1;
    r.run(6);
    // 草丛提示 4 秒内没轮到：作废，但没有记成「看过」
    expect(r.script.debug().tips).not.toContain('tip_bush');
  });

  it('塔在打你且塔下没兵：立刻盖过步骤卡，期间步骤卡的计时暂停', () => {
    const r = rig();
    r.until('move');
    r.run(5);
    const t0 = r.script.debug().t;
    const t = tower(r.sim, 1, 'top', 1);
    addBuff(r.me, 'tower_focus', t.id);
    const v = r.run(0.3);
    expect(v.card?.id).toBe('tip_tower');
    expect(v.card?.warn).toBe(true);
    expect(v.card?.text).toBe('塔在打你！塔下没有小兵别硬冲，越打越疼。');
    r.run(3);
    // 小贴士盖着的 3 秒没有算进步骤卡的计时(触发前最多走了一个扫描间隔)
    expect(r.script.debug().t).toBeGreaterThanOrEqual(t0);
    expect(r.script.debug().t).toBeLessThan(t0 + 0.4);
    r.run(GUIDE_TUNE.tipShow);
    expect(r.view.card?.id).toBe('move');
  });

  it('靠近蓝buff：用一句话说明奖励', () => {
    const r = idle();
    const proto = r.sim.units.find((u) => u.kind === 'tower');
    if (!proto) throw new Error('no unit');
    const blue = { ...proto, id: 99002, kind: 'monster', team: 2, monsterType: 'frost_golem', campId: 0, alive: true, pos: { x: r.me.pos.x + 8, y: r.me.pos.y } };
    (r.sim.state.units as unknown[]).push(blue);
    (r.sim.state as GameState).time += 0.3;
    const v = r.script.update(r.inp);
    expect(v.card?.id).toBe('tip_buff_blue');
    expect(v.card?.text).toMatch(/^\*\*蓝buff\*\*：打掉它，\d+ 秒内技能冷却更短、回蓝更快。$/);
  });
});

describe('GuideScript：跟着一局真实对局跑', () => {
  it('玩家由 Bot 代打 4 分半钟：不抛错，前三课都按实际操作完成，文案没有占位符', { timeout: 120_000 }, () => {
    for (const hero of ['chijin', 'yeque'] as const) {
      const sim = createWorld({ seed: 17, playerHero: hero, difficulty: 'easy', autoPlay: true });
      const me = player(sim);
      const script = new GuideScript(sim.state, me);
      const inp: GuideInput = { state: sim.state, me, mode: 'touch', shopOpen: false, objectiveHints: true };
      const shown: string[] = [];
      let last = '';
      for (let tick = 0; tick < 270 * 30 && !sim.state.over && !script.finished; tick++) {
        sim.step();
        for (const ev of sim.drainEvents()) script.onEvent(ev, sim.state);
        // 界面按渲染帧更新：每 2 tick 一次
        if (tick % 2 !== 0) continue;
        const v = script.update(inp);
        const id = v.card ? `${v.card.id}${v.card.done ? '✓' : ''}` : '';
        if (id && id !== last) shown.push(id);
        last = id;
        if (v.card) {
          expect(v.card.text.length).toBeGreaterThan(4);
          expect(v.card.text).not.toMatch(/undefined|NaN|\{|\}/);
        }
        if (v.arrow) expect(Number.isFinite(v.arrow.pos.x) && v.arrow.label.length > 0).toBe(true);
      }
      const done = script.debug().done;
      // Bot 会走路、普攻、补刀、放技能：前三课一定做得完
      expect(done, `${hero}: ${shown.join(' ')}`).toEqual(expect.arrayContaining(['move', 'go', 'attack', 'lasthit', 'skill']));
      expect(shown[0].startsWith('move') || shown[0].startsWith('go')).toBe(true);
    }
  });
});


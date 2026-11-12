import { describe, expect, it } from 'vitest';
import { addBuff, buffStacks, hasBuff } from './buffs';
import { dealDamage } from './combat';
import { CORE, MINIONS, MONSTER_RULES, MONSTERS, TOWER_RULES, TOWERS, VISION, WAVES } from './data/units';
import { hashSim } from './hash';
import { runHeadless } from './headless';
import { MON_IDLE } from './internal';
import { isWalkableTerrain } from './map';
import { recomputeStats } from './stats';
import { eventsOf, freezeUnit, heroOf, place, quietWorld, spawnMinionAt, stepFor } from './testkit';
import type { GameEvent, LaneId, PlayerTeam } from './types';
import { createWorld } from './world';

const LANES: LaneId[] = ['top', 'mid', 'bot'];

describe('世界初始化', () => {
  it('10 英雄(玩家排第一)、18 塔、2 水晶；外塔可打、内塔与水晶无敌', () => {
    const sim = createWorld({ seed: 3, playerHero: 'xingli', difficulty: 'hard' });
    const st = sim.state;
    expect(st.heroes.length).toBe(10);
    expect(st.heroes.slice(0, 5).every((h) => h.team === 0)).toBe(true);
    expect(st.heroes.slice(5).every((h) => h.team === 1)).toBe(true);
    expect(st.heroes[0].heroId).toBe('xingli');
    expect(st.heroes[0].isPlayer).toBe(true);
    expect(st.heroes.filter((h) => h.isPlayer).length).toBe(1);
    expect(st.playerId).toBe(st.heroes[0].id);
    expect(new Set(st.heroes.slice(5).map((h) => h.heroId)).size).toBe(5);
    expect(st.units.filter((u) => u.kind === 'tower').length).toBe(18);
    expect(st.units.filter((u) => u.kind === 'core').length).toBe(2);
    for (const u of st.units) {
      if (u.kind === 'tower') expect(u.invulnerable).toBe(u.tier !== 1);
      if (u.kind === 'core') expect(u.invulnerable).toBe(true);
    }
    expect(new Set(st.units.map((u) => u.id)).size).toBe(st.units.length);
    // 玩家没有 Bot 控制器；其余 9 个有
    expect(sim.heroes.filter((h) => h.h.controller !== null).length).toBe(9);
    expect(sim.drainEvents().some((e) => e.type === 'announce' && e.key === 'match_start')).toBe(true);
    const auto = createWorld({ seed: 3, playerHero: 'xingli', difficulty: 'hard', autoPlay: true });
    expect(auto.heroes.filter((h) => h.h.controller !== null).length).toBe(10);
    // 托管开关
    sim.setBotControl(st.playerId, true);
    expect(sim.heroes[0].h.controller).not.toBeNull();
    sim.setBotControl(st.playerId, false);
    expect(sim.heroes[0].h.controller).toBeNull();
    // 运行时字段不可枚举：外部层序列化/拷贝状态是安全的
    stepFor(auto, 30);
    const json = JSON.stringify({ units: auto.state.units, projectiles: auto.state.projectiles, areas: auto.state.areas });
    expect(json.includes('"rt"')).toBe(false);
    expect(() => structuredClone(auto.state.units)).not.toThrow();
    expect(Object.keys(auto.state.heroes[0])).not.toContain('h');
  });
});

describe('兵线', () => {
  it('按波次出兵，两军在每条兵线的中点附近交汇', () => {
    const sim = createWorld({ seed: 1, playerHero: 'chijin', difficulty: 'normal' }, { noBots: true, noCamps: true });
    const firstClash: Partial<Record<LaneId, { x: number; y: number }>> = {};
    let waveEvents = 0;
    let announced = false;
    for (let i = 0; i < 30 * 45; i++) {
      sim.step();
      for (const e of sim.drainEvents()) {
        if (e.type === 'waveSpawn') waveEvents++;
        if (e.type === 'announce' && e.key === 'minions_spawn') announced = true;
        if (e.type !== 'damage') continue;
        const t = sim.getUnit(e.targetId);
        const s = sim.getUnit(e.sourceId);
        if (t && s && t.kind === 'minion' && s.kind === 'minion' && !firstClash[t.lane]) firstClash[t.lane] = { ...e.pos };
      }
    }
    expect(waveEvents).toBe(2);
    expect(announced).toBe(true);
    expect(sim.state.wave).toBe(2);
    expect(sim.state.nextWaveIn).toBeCloseTo(WAVES.firstAt + 2 * WAVES.interval - 45, 3);
    for (const lane of LANES) {
      const clash = firstClash[lane];
      expect(clash, `lane ${lane} never clashed`).toBeDefined();
      if (!clash) continue;
      const path = sim.lanes[lane];
      const mid = path.pointAt(path.total / 2, { x: 0, y: 0 });
      expect(Math.hypot(clash.x - mid.x, clash.y - mid.y), `lane ${lane}`).toBeLessThan(8);
    }
    // 每波每路每队：2 近战 + 1 远程
    const firstWave = sim.units.filter((u) => u.kind === 'minion');
    expect(firstWave.length).toBeGreaterThan(0);
    expect(firstWave.length).toBeLessThanOrEqual(2 * 3 * 2 * 3);
  }, 30000);

  it('第 3 波带攻城兵；小兵属性随时间成长；高地塔被毁的一路对方出超级兵', () => {
    const sim = createWorld({ seed: 1, playerHero: 'chijin', difficulty: 'normal' }, { noBots: true, noCamps: true });
    // 拆掉红方上路三座塔
    for (let tier = 0; tier < 3; tier++) {
      const t = sim.towers[1].top[tier];
      if (t) {
        t.rt.backdoor = false;
        dealDamage(sim, sim.heroes[0], t, 1e6, 'true');
      }
    }
    expect(sim.towers[1].top[2]).toBeNull();
    const seen = new Set<string>();
    let superAnnounce = 0;
    for (let i = 0; i < 30 * 73; i++) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.type === 'announce' && e.key === 'super_minions') superAnnounce++;
      for (const u of sim.units) if (u.kind === 'minion') seen.add(`${u.team}:${u.lane}:${u.minionType}`);
    }
    expect(sim.state.wave).toBe(3);
    expect(seen.has('0:top:super')).toBe(true);
    expect(seen.has('1:top:super')).toBe(false);
    expect(seen.has('0:mid:super')).toBe(false);
    expect(seen.has('0:mid:siege')).toBe(true);
    expect(superAnnounce).toBe(1);
    const late = sim.units.find((u) => u.kind === 'minion' && u.minionType === 'siege');
    expect(late).toBeDefined();
    if (late) expect(late.stats.maxHp).toBeGreaterThan(MINIONS.siege.hp + MINIONS.siege.hpPerMin * 0.9);
  }, 30000);

  it('小兵仇恨：优先小兵，其次英雄；敌方英雄攻击己方英雄时转火', () => {
    const sim = quietWorld();
    const red = spawnMinionAt(sim, 1, 'melee', 0, 0, 'mid', 50000);
    const blueMinion = spawnMinionAt(sim, 0, 'melee', 4, 4, 'mid', 50000);
    freezeUnit(blueMinion);
    const blueHero = heroOf(sim, 0, 'chijin');
    const redHero = heroOf(sim, 1, 'xingli');
    place(sim, blueHero, 2, -1);
    place(sim, redHero, -3, 0);
    stepFor(sim, 0.6);
    // 英雄更近，但小兵优先
    expect(red.targetId).toBe(blueMinion.id);
    // 蓝方英雄打了红方英雄 → 红方小兵转火蓝方英雄
    dealDamage(sim, blueHero, redHero, 10, 'true');
    stepFor(sim, 0.6);
    expect(red.targetId).toBe(blueHero.id);
    // 呼救窗口过后回去打小兵
    stepFor(sim, 3);
    expect(red.targetId).toBe(blueMinion.id);
  });
});

describe('防御塔与水晶', () => {
  function setup(): { sim: ReturnType<typeof quietWorld>; tower: NonNullable<ReturnType<typeof quietWorld>['towers'][0]['mid'][0]> } {
    const sim = quietWorld();
    const tower = sim.towers[1].mid[0];
    if (!tower) throw new Error('no tower');
    return { sim, tower };
  }

  it('目标优先级：小兵(攻城优先) > 英雄；打己方英雄的敌方英雄会被立刻锁定', () => {
    const { sim, tower } = setup();
    const tx = tower.pos.x;
    const ty = tower.pos.y;
    const hero = heroOf(sim, 0, 'panyue');
    place(sim, hero, tx - 4, ty + 4);
    stepFor(sim, 0.3);
    expect(tower.targetId).toBe(hero.id);
    // 小兵进场：塔当前锁定英雄不变(锁定目标离开射程前不换)
    const melee = spawnMinionAt(sim, 0, 'melee', tx - 5, ty + 3, 'mid', 50000);
    const siege = spawnMinionAt(sim, 0, 'siege', tx - 6, ty + 4, 'mid', 50000);
    freezeUnit(melee);
    freezeUnit(siege);
    stepFor(sim, 0.3);
    expect(tower.targetId).toBe(hero.id);
    // 英雄离开再回来：这次塔已经在打攻城兵
    place(sim, hero, tx - 20, ty + 20);
    stepFor(sim, 0.3);
    expect(tower.targetId).toBe(siege.id);
    place(sim, hero, tx - 4, ty + 4);
    stepFor(sim, 0.5);
    expect(tower.targetId).toBe(siege.id);
    // 英雄在塔下攻击敌方英雄 → 塔立刻转火
    const defender = heroOf(sim, 1, 'xingli');
    place(sim, defender, tx + 2, ty - 2);
    stepFor(sim, 2.2);
    dealDamage(sim, hero, defender, 10, 'true');
    stepFor(sim, 0.2);
    expect(tower.targetId).toBe(hero.id);
  });

  it('对同一英雄连续命中逐次增伤(tower_focus)，塔弹为 tower_bolt', () => {
    const { sim, tower } = setup();
    const hero = heroOf(sim, 0, 'panyue');
    place(sim, hero, tower.pos.x - 4, tower.pos.y + 4);
    hero.rt.base.maxHp = 1e6;
    const ev = stepFor(sim, 5.5);
    const hits = eventsOf(ev, 'damage').filter((e) => e.sourceId === tower.id && e.targetId === hero.id);
    expect(hits.length).toBeGreaterThanOrEqual(4);
    const first = hits[0].amount;
    expect(hits[1].amount).toBeCloseTo(first * (1 + TOWER_RULES.rampPerHit), 3);
    expect(hits[2].amount).toBeCloseTo(first * (1 + TOWER_RULES.rampPerHit * 2), 3);
    expect(hits[hits.length - 1].amount).toBeLessThanOrEqual(first * (1 + TOWER_RULES.rampMax) + 1e-6);
    expect(buffStacks(hero, 'tower_focus')).toBeGreaterThanOrEqual(3);
    const spawn = eventsOf(ev, 'projectileSpawn').find((e) => e.ownerId === tower.id);
    expect(spawn && spawn.visual).toBe('tower_bolt');
    expect(eventsOf(ev, 'fx').some((e) => e.key === 'hit_tower')).toBe(true);
    // 塔对小兵有额外倍率
    place(sim, hero, 0, 40);
    const m = spawnMinionAt(sim, 0, 'siege', tower.pos.x - 4, tower.pos.y + 4, 'mid', 50000);
    freezeUnit(m);
    const ev2 = stepFor(sim, 2);
    const mh = eventsOf(ev2, 'damage').find((e) => e.sourceId === tower.id && e.targetId === m.id);
    expect(mh).toBeDefined();
    if (mh) expect(mh.amount).toBeCloseTo((TOWERS[1].ad * TOWER_RULES.minionMult * 600) / (600 + m.stats.armor), 3);
  });

  it('防偷塔：附近没有敌方小兵时塔受到的伤害减免', () => {
    const { sim, tower } = setup();
    const hero = heroOf(sim, 0, 'chijin');
    stepFor(sim, 0.3);
    const k = 600 / (600 + tower.stats.armor);
    expect(dealDamage(sim, hero, tower, 1000, 'physical')).toBeCloseTo(1000 * k * (1 - TOWER_RULES.backdoorReduction), 4);
    const m = spawnMinionAt(sim, 0, 'melee', tower.pos.x - 5, tower.pos.y + 5, 'mid', 50000);
    freezeUnit(m);
    stepFor(sim, 0.3);
    expect(dealDamage(sim, hero, tower, 1000, 'physical')).toBeCloseTo(1000 * k, 4);
    expect(hero.dmgTower).toBeGreaterThan(0);
  });

  it('无敌链：每路按 1→2→3 顺序；任意一路高地塔被毁后水晶可被攻击', () => {
    const sim = quietWorld();
    const hero = heroOf(sim, 0, 'chijin');
    const core = sim.cores[1];
    const [t1, t2, t3] = sim.towers[1].bot;
    if (!t1 || !t2 || !t3) throw new Error('missing towers');
    expect(dealDamage(sim, hero, t2, 100, 'true')).toBe(0);
    expect(dealDamage(sim, hero, core, 100, 'true')).toBe(0);
    sim.drainEvents();
    dealDamage(sim, hero, t1, 1e6, 'true');
    const ev = sim.drainEvents();
    expect(eventsOf(ev, 'towerDestroyed')[0]).toMatchObject({ unitId: t1.id, team: 1, lane: 'bot', tier: 1 });
    expect(eventsOf(ev, 'death').some((e) => e.unitId === t1.id && e.kind === 'tower')).toBe(true);
    expect(eventsOf(ev, 'fx').some((e) => e.key === 'tower_destroyed')).toBe(true);
    expect(eventsOf(ev, 'announce').some((e) => e.key === 'tower_destroyed' && e.team === 0)).toBe(true);
    expect(sim.state.teams[0].towersDestroyed).toBe(1);
    // 全队金币 + 最后一击额外金币
    const golds = eventsOf(ev, 'gold').filter((g) => g.reason === 'tower');
    expect(golds.length).toBe(5);
    expect(golds.find((g) => g.unitId === hero.id)?.amount).toBe(TOWERS[1].teamGold + TOWERS[1].lastHitGold);
    expect(t2.invulnerable).toBe(false);
    expect(t3.invulnerable).toBe(true);
    expect(core.invulnerable).toBe(true);
    // 本 tick 末从 units 移除，导航障碍同时消失
    sim.step();
    expect(sim.getUnit(t1.id)).toBeUndefined();
    expect(sim.nav.isFree(t1.pos.x, t1.pos.y, 0.6)).toBe(true);
    // 其他路的中塔仍然无敌
    const midT2 = sim.towers[1].mid[1];
    expect(midT2 && midT2.invulnerable).toBe(true);
    dealDamage(sim, hero, t2, 1e6, 'true');
    expect(t3.invulnerable).toBe(false);
    expect(core.invulnerable).toBe(true);
    dealDamage(sim, hero, t3, 1e6, 'true');
    expect(core.invulnerable).toBe(false);
    expect(dealDamage(sim, hero, core, 100, 'true')).toBeGreaterThan(0);
  });

  it('水晶：会攻击、脱战回血；被毁则对局结束，之后世界不再变化', () => {
    const sim = quietWorld();
    const hero = heroOf(sim, 0, 'chijin');
    const core = sim.cores[1];
    for (const t of sim.towers[1].mid) if (t) dealDamage(sim, hero, t, 1e6, 'true');
    place(sim, hero, core.pos.x - 5, core.pos.y + 5);
    hero.rt.base.maxHp = 1e6;
    stepFor(sim, 0.1);
    hero.hp = hero.stats.maxHp;
    const m = spawnMinionAt(sim, 0, 'melee', core.pos.x - 6, core.pos.y + 4, 'mid', 1e6);
    freezeUnit(m);
    const ev = stepFor(sim, 2.5);
    expect(eventsOf(ev, 'projectileSpawn').some((e) => e.ownerId === core.id && e.visual === 'core_bolt')).toBe(true);
    dealDamage(sim, hero, core, 2000, 'true');
    const hp = core.hp;
    stepFor(sim, CORE.regenDelay - 1);
    expect(core.hp).toBeCloseTo(hp, 6);
    stepFor(sim, 3);
    expect(core.hp).toBeGreaterThan(hp + CORE.regen);
    sim.drainEvents();
    dealDamage(sim, hero, core, 1e7, 'true');
    const end = sim.drainEvents();
    expect(sim.state.over).toBe(true);
    expect(sim.state.winner).toBe(0);
    const endTime = sim.state.time;
    expect(sim.state.endTime).toBe(endTime);
    expect(eventsOf(end, 'gameOver')[0].winner).toBe(0);
    expect(eventsOf(end, 'announce').some((e) => e.key === 'victory')).toBe(true);
    expect(eventsOf(end, 'fx').some((e) => e.key === 'core_destroyed')).toBe(true);
    expect(core.alive).toBe(false);
    // 结束后：时间继续走，世界冻结，命令被忽略
    const tick = sim.state.tick;
    const pos = { ...hero.pos };
    sim.command(hero.id, { type: 'move', dir: { x: 1, y: 0 } });
    const after = stepFor(sim, 1);
    expect(sim.state.tick).toBe(tick + 30);
    expect(hero.pos).toEqual(pos);
    expect(after.length).toBe(0);
    // time 继续走，endTime 停在水晶被毁的那一刻
    expect(sim.state.time).toBeGreaterThan(endTime + 0.9);
    expect(sim.state.endTime).toBe(endTime);
  });

  it('红方获胜时以玩家视角播报 defeat', () => {
    const sim = quietWorld();
    const red = heroOf(sim, 1, 'chijin');
    for (const t of sim.towers[0].mid) if (t) dealDamage(sim, red, t, 1e6, 'true');
    sim.drainEvents();
    dealDamage(sim, red, sim.cores[0], 1e7, 'true');
    const ev = sim.drainEvents();
    expect(sim.state.winner).toBe(1);
    expect(eventsOf(ev, 'announce').some((e) => e.key === 'defeat' && e.team === 1)).toBe(true);
  });
});

describe('泉水', () => {
  it('己方快速回复，敌方进入受高额真实伤害', () => {
    const sim = quietWorld();
    const blue = heroOf(sim, 0, 'chijin');
    blue.hp = 100;
    blue.mana = 0;
    stepFor(sim, 3);
    expect(blue.hp).toBeGreaterThan(100 + blue.stats.maxHp * 0.3);
    expect(blue.mana).toBeGreaterThan(blue.stats.maxMana * 0.3);
    expect(hasBuff(blue, 'fountain')).toBe(true);
    const red = heroOf(sim, 1, 'panyue');
    const f = sim.map.bases[0].fountain;
    place(sim, red, f.x + 2, f.y - 2);
    const ev = stepFor(sim, 4);
    expect(red.alive).toBe(false);
    expect(eventsOf(ev, 'damage').some((e) => e.targetId === red.id && e.dtype === 'true' && e.sourceId === -1)).toBe(true);
    place(sim, blue, 0, 0);
    stepFor(sim, 0.5);
    expect(hasBuff(blue, 'fountain')).toBe(false);
  });
});

describe('野怪', () => {
  it('按时刷新并同步 state.camps；被打才还手；拉出牵引范围后回营回血', () => {
    const sim = createWorld({ seed: 1, playerHero: 'chijin', difficulty: 'normal' }, { noBots: true, noWaves: true });
    expect(sim.state.camps.every((c) => !c.alive)).toBe(true);
    expect(sim.state.camps[0].respawnIn).toBe(sim.map.camps[0].firstSpawn);
    const ev = stepFor(sim, 26);
    const spawns = eventsOf(ev, 'monsterSpawn');
    expect(spawns.length).toBe(12);
    for (const c of sim.state.camps) {
      const def = sim.map.camps[c.campId];
      expect(c.alive).toBe(!MONSTERS[def.monsterType].epic);
      if (!c.alive) expect(c.respawnIn).toBeCloseTo(def.firstSpawn - 26, 3);
    }
    const camp = sim.camps.find((c) => c.def.monsterType === 'mossback' && c.def.side === 0);
    if (!camp) throw new Error('no camp');
    const mon = camp.members[0];
    const hero = heroOf(sim, 0, 'fengling');
    place(sim, hero, camp.def.pos.x + 5, camp.def.pos.y);
    stepFor(sim, 1.5);
    // 站在旁边不会被打
    expect(mon.mon.state).toBe(MON_IDLE);
    expect(hero.hp).toBe(hero.stats.maxHp);
    expect(mon.visible).toEqual([true, true]);
    // 打一下：还手
    dealDamage(sim, hero, mon, 500, 'true');
    const fight = stepFor(sim, 3);
    expect(mon.targetId).toBe(hero.id);
    expect(eventsOf(fight, 'damage').some((e) => e.sourceId === mon.id && e.targetId === hero.id)).toBe(true);
    // 英雄跑远：野怪追出牵引范围后回营并回满血
    hero.rt.base.moveSpeed = 9;
    sim.command(hero.id, { type: 'moveTo', pos: { x: camp.def.pos.x + 22, y: camp.def.pos.y - 14 } });
    stepFor(sim, 14);
    expect(mon.mon.state).toBe(MON_IDLE);
    expect(Math.hypot(mon.pos.x - mon.mon.home.x, mon.pos.y - mon.mon.home.y)).toBeLessThan(0.7);
    expect(mon.hp).toBeCloseTo(mon.stats.maxHp, 3);
  }, 30000);

  it('击杀：金币经验、增益怪 buff、营地重生计时', () => {
    const sim = createWorld({ seed: 1, playerHero: 'yeque', difficulty: 'normal' }, { noBots: true, noWaves: true });
    stepFor(sim, 26);
    const hero = heroOf(sim, 0, 'yeque');
    const frost = sim.camps.find((c) => c.def.monsterType === 'frost_golem' && c.def.side === 0);
    const ember = sim.camps.find((c) => c.def.monsterType === 'ember_golem' && c.def.side === 0);
    if (!frost || !ember) throw new Error('no camp');
    place(sim, hero, frost.def.pos.x + 3, frost.def.pos.y);
    const gold = hero.gold;
    const cdr = hero.stats.cdr;
    sim.drainEvents();
    dealDamage(sim, hero, frost.members[0], 1e6, 'true');
    const ev = sim.drainEvents();
    expect(hero.gold).toBe(gold + MONSTERS.frost_golem.gold);
    expect(hero.cs).toBe(1);
    expect(hasBuff(hero, 'frost_insight')).toBe(true);
    expect(hero.stats.cdr).toBeCloseTo(cdr + MONSTER_RULES.frostCdr, 6);
    expect(eventsOf(ev, 'fx').map((e) => e.key)).toEqual(expect.arrayContaining(['monster_slain', 'buff_gain']));
    expect(eventsOf(ev, 'gold')[0].reason).toBe('monster');
    sim.step();
    const cs = sim.state.camps[frost.def.id];
    expect(cs.alive).toBe(false);
    expect(cs.respawnIn).toBeCloseTo(frost.def.respawn, 1);
    // 炽焰之力：普攻附带灼烧与减速
    dealDamage(sim, hero, ember.members[0], 1e6, 'true');
    expect(hasBuff(hero, 'ember_might')).toBe(true);
    const dummy = spawnMinionAt(sim, 1, 'siege', hero.pos.x + 2, hero.pos.y, 'mid', 1e6);
    freezeUnit(dummy);
    stepFor(sim, 0.1);
    sim.command(hero.id, { type: 'attack', targetId: dummy.id });
    const ev2 = stepFor(sim, 1.6);
    expect(hasBuff(dummy, 'burn')).toBe(true);
    expect(eventsOf(ev2, 'damage').filter((e) => e.targetId === dummy.id && e.dtype === 'true').length).toBeGreaterThanOrEqual(2);
    // 重生
    stepFor(sim, frost.def.respawn);
    expect(sim.state.camps[frost.def.id].alive).toBe(true);
  }, 30000);

  it('史诗野怪：团队奖励、epicSlain/announce、星陨祝福', () => {
    const sim = createWorld({ seed: 1, playerHero: 'yeque', difficulty: 'normal' }, { noBots: true, noWaves: true });
    const ev0 = stepFor(sim, 271);
    expect(eventsOf(ev0, 'announce').filter((e) => e.key === 'epic_spawn').length).toBe(2);
    const hero = heroOf(sim, 0, 'yeque');
    const mate = heroOf(sim, 0, 'xingli');
    const drake = sim.camps.find((c) => c.def.monsterType === 'abyss_drake');
    const colossus = sim.camps.find((c) => c.def.monsterType === 'star_colossus');
    if (!drake || !colossus) throw new Error('no epic camp');
    const mateGold = mate.gold;
    const mateXp = mate.xp + mate.level * 1000;
    sim.drainEvents();
    // 史诗野怪免疫硬控
    expect(addBuff(sim, drake.members[0], 'stun', { duration: 1 })).toBeNull();
    dealDamage(sim, hero, drake.members[0], 1e6, 'true');
    let ev = sim.drainEvents();
    expect(eventsOf(ev, 'epicSlain')[0]).toMatchObject({ monsterType: 'abyss_drake', team: 0 });
    expect(eventsOf(ev, 'announce').some((e) => e.key === 'epic_slain' && e.team === 0)).toBe(true);
    expect(mate.gold).toBe(mateGold + MONSTER_RULES.drakeTeamGold);
    expect(mate.xp + mate.level * 1000).toBeGreaterThan(mateXp);

    const minion = spawnMinionAt(sim, 0, 'melee', 0, 0);
    freezeUnit(minion);
    const minionHp = minion.stats.maxHp;
    dealDamage(sim, hero, colossus.members[0], 1e6, 'true');
    ev = sim.drainEvents();
    expect(eventsOf(ev, 'epicSlain')[0].monsterType).toBe('star_colossus');
    expect(sim.state.teams[0].blessingLeft).toBe(MONSTER_RULES.blessingDuration);
    expect(minion.stats.maxHp).toBeCloseTo(minionHp * (1 + MONSTER_RULES.blessingMinionBoost), 4);
    stepFor(sim, 0.1);
    expect(hasBuff(hero, 'star_blessing')).toBe(true);
    expect(hasBuff(mate, 'star_blessing')).toBe(true);
    expect(hasBuff(heroOf(sim, 1, 'yeque'), 'star_blessing')).toBe(false);
    // 祝福期间伤害提高
    const dummy = spawnMinionAt(sim, 1, 'siege', 5, 5, 'mid', 1e6);
    freezeUnit(dummy);
    expect(dealDamage(sim, hero, dummy, 1000, 'true')).toBeCloseTo(1000 * (1 + MONSTER_RULES.blessingDamage), 4);
    // 把时间拨到下一波出兵之后会更慢，这里直接验证「祝福期间重算属性」对新小兵生效
    const fresh = spawnMinionAt(sim, 0, 'melee', 1, 1);
    freezeUnit(fresh);
    recomputeStats(sim, fresh);
    expect(fresh.stats.maxHp).toBeCloseTo(fresh.rt.base.maxHp * (1 + MONSTER_RULES.blessingMinionBoost), 4);
    expect(fresh.hp).toBeCloseTo(fresh.stats.maxHp, 4);
    stepFor(sim, MONSTER_RULES.blessingDuration + 0.5);
    expect(sim.state.teams[0].blessingLeft).toBe(0);
    expect(hasBuff(hero, 'star_blessing')).toBe(false);
    expect(minion.stats.maxHp).toBeCloseTo(minionHp, 4);
  }, 30000);
});

describe('视野', () => {
  it('敌人只有在己方单位/建筑视野内才可见；建筑与野怪恒可见', () => {
    const sim = quietWorld();
    const blue = heroOf(sim, 0, 'chijin');
    const red = heroOf(sim, 1, 'xingli');
    place(sim, blue, 0, 20);
    place(sim, red, 0, 20 - VISION.hero - 1);
    expect(red.visible[0]).toBe(false);
    expect(blue.visible[1]).toBe(false);
    expect(blue.visible[0]).toBe(true);
    place(sim, red, 0, 20 - VISION.hero + 1);
    expect(red.visible[0]).toBe(true);
    expect(blue.visible[1]).toBe(true);
    for (const u of sim.units) if (u.kind === 'tower' || u.kind === 'core') expect(u.visible).toEqual([true, true]);
    // 走进敌方塔的视野也会被看到
    const tower = sim.towers[1].mid[0];
    if (!tower) throw new Error('no tower');
    place(sim, red, 50, -50);
    place(sim, blue, tower.pos.x - 7, tower.pos.y + 7);
    expect(blue.visible[1]).toBe(true);
  });

  it('草丛：外面的敌人看不到草里的单位，除非贴近/同在草里/草里的人出手', () => {
    const sim = quietWorld();
    const blue = heroOf(sim, 0, 'fengling');
    const red = heroOf(sim, 1, 'xingli');
    // 中心三角草：约 x∈[-14,-10.5], y∈[-4,4]
    place(sim, blue, -12.5, 0);
    expect(blue.bushId).toBeGreaterThanOrEqual(0);
    place(sim, red, -6, 0);
    expect(red.bushId).toBe(-1);
    expect(blue.visible[1]).toBe(false);
    expect(red.visible[0]).toBe(true);
    // 贴近到 bushReveal 以内
    place(sim, red, -12.5 + VISION.bushReveal - 0.2, 0);
    expect(blue.visible[1]).toBe(true);
    // 同在草里
    place(sim, red, -11.5, 1.5);
    expect(red.bushId).toBe(blue.bushId);
    expect(blue.visible[1]).toBe(true);
    // 草里出手：暴露一小段时间
    place(sim, red, -6, 0);
    expect(blue.visible[1]).toBe(false);
    stepFor(sim, 2.2);
    sim.command(blue.id, { type: 'attack', targetId: red.id });
    stepFor(sim, 0.6);
    expect(blue.visible[1]).toBe(true);
    sim.command(blue.id, { type: 'stop' });
    stepFor(sim, VISION.revealOnAttack + 0.5);
    expect(blue.visible[1]).toBe(false);
  });

  it('Bot 视图只包含可见的敌人，并记住最后一次看到的位置', () => {
    const sim = createWorld({ seed: 1, playerHero: 'chijin', difficulty: 'normal', autoPlay: true }, { noWaves: true, noCamps: true });
    const blue = heroOf(sim, 0, 'chijin');
    const red = heroOf(sim, 1, 'xingli');
    const view = sim.botView(blue.id);
    if (!view) throw new Error('no view');
    for (const h of sim.heroes) h.h.controller = null; // 只用视图，不让 Bot 乱动
    // 上路兵线上的两个点(都不在草丛里)
    place(sim, blue, -52, 0);
    place(sim, red, -52, -8);
    sim.step();
    expect(view.enemyHeroes().map((h) => h.id)).toEqual([red.id]);
    expect(view.unit(red.id)).toBe(red);
    expect(view.near(blue.pos, 10).some((u) => u.id === red.id)).toBe(true);
    place(sim, red, -52, -40);
    sim.step();
    expect(view.enemyHeroes().length).toBe(0);
    expect(view.unit(red.id)).toBeUndefined();
    expect(view.near(red.pos, 5).some((u) => u.id === red.id)).toBe(false);
    const seen = view.lastSeen(red.id);
    expect(seen && seen.y).toBeCloseTo(-8, 6);
    // 建筑恒可见
    expect(view.enemyStructures().length).toBe(10);
    expect(view.enemyStructureCovering({ x: 13, y: -8.5 })).not.toBeNull();
    expect(view.skillReady('s1')).toBe(true);
    expect(view.skillReady('ult')).toBe(false);
    expect(view.castSpec('flash').type).toBe('direction');
    // 隔着上路内侧长墙：寻路距离明显大于直线距离
    expect(view.pathDistance({ x: -38, y: 0 })).toBeGreaterThan(20);
    expect(view.pathDistance({ x: -52, y: 10 })).toBeCloseTo(10, 6);
  });
});

describe('确定性', () => {
  it('同种子：每个检查点的状态哈希完全一致；不同种子会分叉', () => {
    const cfg = { seed: 42, playerHero: 'fengling' as const, difficulty: 'normal' as const, autoPlay: true };
    const a = createWorld(cfg);
    const b = createWorld(cfg);
    const c = createWorld({ ...cfg, seed: 43 });
    let diverged = false;
    let mismatchAt = -1;
    for (let i = 0; i < 30 * 120; i++) {
      a.step();
      b.step();
      a.drainEvents();
      // b 故意不取事件：是否 drain 不应影响模拟
      if (i < 30 * 40) {
        c.step();
        c.drainEvents();
      }
      if (i % 100 === 0) {
        if (hashSim(a) !== hashSim(b) && mismatchAt < 0) mismatchAt = i;
        if (i < 30 * 40 && hashSim(a) !== hashSim(c)) diverged = true;
      }
    }
    expect(mismatchAt).toBe(-1);
    expect(hashSim(a)).toBe(hashSim(b));
    expect(a.state.wave).toBe(4);
    expect(diverged).toBe(true);
  }, 30000);
});

describe('整局冒烟', () => {
  it('默认 Bot 跑 12 分钟：无异常、无 NaN、单位不出界不进墙、有塔被推', () => {
    const counts: Record<PlayerTeam, number> = { 0: 0, 1: 0 };
    const kinds = new Set<GameEvent['type']>();
    let maxUnits = 0;
    const t0 = performance.now();
    const r = runHeadless({ seed: 7, playerHero: 'chijin', difficulty: 'normal', autoPlay: true }, {
      maxTime: 12 * 60,
      onTick(sim, events) {
        for (const e of events) {
          kinds.add(e.type);
          if (e.type === 'towerDestroyed') counts[e.team]++;
        }
        const st = sim.state;
        if (st.units.length > maxUnits) maxUnits = st.units.length;
        // 每 5 tick 全量体检一次
        if (st.tick % 5 !== 0) return;
        for (const u of sim.units) {
          const ok = Number.isFinite(u.pos.x) && Number.isFinite(u.pos.y) && Number.isFinite(u.hp) && Number.isFinite(u.mana) && Number.isFinite(u.facing);
          if (!ok) throw new Error(`NaN in unit ${u.id} (${u.kind}) at t=${st.time}`);
          if (u.kind === 'tower' || u.kind === 'core') continue;
          // 跃击(磐岳大招)途中在墙体上方是合法的
          if (u.rt.dash && u.rt.dash.ignoreWalls) continue;
          if (!isWalkableTerrain(st.map, u.pos)) throw new Error(`unit ${u.id} (${u.kind}) inside terrain at (${u.pos.x}, ${u.pos.y}) t=${st.time}`);
          if (u.alive && (u.hp <= 0 || u.hp > u.stats.maxHp + 1e-6)) throw new Error(`bad hp ${u.hp}/${u.stats.maxHp} on unit ${u.id}`);
        }
        for (const p of sim.projectiles) if (!Number.isFinite(p.pos.x + p.pos.y)) throw new Error('NaN projectile');
      },
    });
    const ms = performance.now() - t0;
    const st = r.sim.state;
    expect(r.time).toBeGreaterThanOrEqual(st.over ? 0 : 12 * 60 - 0.1);
    expect(counts[0] + counts[1]).toBeGreaterThan(0);
    expect(st.teams[0].towersDestroyed).toBe(counts[1]);
    expect(st.teams[1].towersDestroyed).toBe(counts[0]);
    // 对局确实在「进行」：升级、买装备、击杀小兵、野怪刷新
    for (const k of ['attack', 'damage', 'death', 'levelUp', 'itemBought', 'gold', 'waveSpawn', 'monsterSpawn', 'skillCast', 'projectileSpawn'] as const) {
      expect(kinds.has(k), `no ${k} event`).toBe(true);
    }
    expect(st.heroes.every((h) => h.level >= 3)).toBe(true);
    expect(maxUnits).toBeGreaterThan(60);
    // 性能：每 tick 平均耗时（含本测试的体检开销）。目标 < 0.5ms，这里留余量防止 CI 抖动
    const perStep = ms / r.ticks;
    expect(perStep).toBeLessThan(2.5);
  }, 120000);
});

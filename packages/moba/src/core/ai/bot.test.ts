/**
 * 正式 Bot 的冒烟与回归测试：整局能打完、会对线/补刀/买装备/回城/放技能/打野/推塔，
 * 不卡墙不发呆，难度分档有效。行为细节靠批量对局统计调(见汇报)，这里只守住底线。
 */
import { describe, expect, it } from 'vitest';
import { HEROES } from '../data/heroes';
import { ITEMS, SELL_RATIO } from '../data/items';
import { runHeadless } from '../headless';
import { isWalkableTerrain } from '../map';
import { segmentHitsZones } from '../nav';
import { heroOf, place, quietWorld } from '../testkit';
import type { GameEvent, HeroId, HeroUnit } from '../types';
import { createWorld } from '../world';
import { HeroBot } from './bot';
import { inCone } from './geom';
import { fallbackBotFactory, setDefaultBotFactory } from './index';
import { botTierFor, PROFILES } from './params';
import { buildCost, nextBuildItem } from './shop';
import { teamBrain } from './team';

describe('Bot：整局', () => {
  it('autoPlay 全 Bot 对局在 25 分钟内分出胜负；节奏、成长、参与度都在合理范围', () => {
    const kills: Record<number, number> = {};
    let towers = 0;
    let recalls = 0;
    let flashes = 0;
    let heals = 0;
    let skillHitsOnHeroes = 0;
    let monstersKilled = 0;
    let epics = 0;
    let level4At = Infinity;
    // 河道巨龙吐息：预警开始时站在扇形里的英雄，有多少在喷吐结束前一跳没挨(走出去了)
    let breaths = 0;
    let caught = 0;
    let escaped = 0;
    let dodgeLabels = 0;
    let watching: Map<number, number> | null = null;
    const r = runHeadless({ seed: 2024, playerHero: 'fengling', difficulty: 'normal', autoPlay: true }, {
      maxTime: 25 * 60,
      onTick(sim, events) {
        for (const e of events) {
          if (e.type === 'fx' && e.key === 'drake_breath_warn') {
            breaths++;
            watching = new Map();
            const cone = sim.cones.find((c) => c.ownerId === e.unitId);
            if (cone) for (const h of sim.heroes) if (h.alive && inCone(h.pos, h.radius, cone)) watching.set(h.id, 0);
          } else if (e.type === 'damage' && e.skill && watching && watching.has(e.targetId)) {
            const src = sim.byId.get(e.sourceId);
            if (src && src.kind === 'monster') watching.set(e.targetId, (watching.get(e.targetId) ?? 0) + 1);
          }
        }
        if (watching && sim.cones.length > 0) {
          for (const id of watching.keys()) {
            const h = sim.byId.get(id);
            if (h && h.kind === 'hero' && h.h.controller instanceof HeroBot && h.h.controller.label === 'dodge') dodgeLabels++;
          }
        } else if (watching) {
          for (const n of watching.values()) {
            caught++;
            if (n === 0) escaped++;
          }
          watching = null;
        }
        for (const e of events) {
          if (e.type === 'heroKill') kills[e.killerId] = (kills[e.killerId] ?? 0) + 1;
          else if (e.type === 'towerDestroyed') towers++;
          else if (e.type === 'skillCast') {
            if (e.slot === 'recall') recalls++;
            else if (e.slot === 'flash') flashes++;
            else if (e.slot === 'heal') heals++;
          } else if (e.type === 'damage' && e.skill) {
            const s = sim.byId.get(e.sourceId);
            const t = sim.byId.get(e.targetId);
            if (s && t && s.kind === 'hero' && t.kind === 'hero') skillHitsOnHeroes++;
          } else if (e.type === 'death' && e.kind === 'monster') monstersKilled++;
          else if (e.type === 'epicSlain') epics++;
          else if (e.type === 'levelUp' && e.level === 4 && level4At === Infinity) level4At = sim.state.time;
        }
        // 单位不进墙、数值不坏
        if (sim.state.tick % 15 !== 0) return;
        for (const h of sim.heroes) {
          if (!Number.isFinite(h.pos.x + h.pos.y + h.hp)) throw new Error(`NaN on ${h.heroId}`);
          if (h.rt.dash && h.rt.dash.ignoreWalls) continue;
          if (!isWalkableTerrain(sim.state.map, h.pos)) throw new Error(`${h.heroId} inside terrain at t=${sim.state.time}`);
        }
      },
    });
    const st = r.sim.state;
    expect(st.over).toBe(true);
    expect(r.winner).not.toBeNull();
    // 不是 5 分钟滚雪球结束，也不拖到超时
    expect(r.time).toBeGreaterThan(7 * 60);
    expect(r.time).toBeLessThan(25 * 60);
    expect(level4At).toBeLessThan(170);
    const totalKills = st.teams[0].kills + st.teams[1].kills;
    expect(totalKills).toBeGreaterThanOrEqual(8);
    expect(totalKills).toBeLessThanOrEqual(70);
    expect(towers).toBeGreaterThanOrEqual(3);
    // 会回城、会用恢复、技能打得到人、打野、拿史诗野怪
    expect(recalls).toBeGreaterThan(5);
    expect(heals).toBeGreaterThan(3);
    expect(skillHitsOnHeroes).toBeGreaterThan(100);
    expect(monstersKilled).toBeGreaterThan(20);
    expect(epics + flashes).toBeGreaterThan(0);
    // 打龙时巨龙会吐息；被扇形罩住的 Bot 至少有人走了出去(普通难度不是每次都躲)
    expect(breaths).toBeGreaterThanOrEqual(2);
    expect(caught).toBeGreaterThanOrEqual(2);
    expect(escaped).toBeGreaterThanOrEqual(1);
    expect(dodgeLabels).toBeGreaterThan(0);
    for (const h of st.heroes) {
      // 每个英雄都在成长、都买了装备；线上英雄有补刀
      expect(h.level, `${h.heroId}@${h.team} level`).toBeGreaterThanOrEqual(7);
      expect(h.items.filter((it) => it !== null).length, `${h.heroId}@${h.team} items`).toBeGreaterThanOrEqual(2);
      expect(h.dmgDealt, `${h.heroId}@${h.team} damage`).toBeGreaterThan(1500);
      if (h.heroId !== 'panyue') expect(h.cs, `${h.heroId}@${h.team} cs`).toBeGreaterThanOrEqual(12);
      // 钱没有攒着不花
      const next = nextBuildItem(h);
      if (next) expect(h.gold).toBeLessThan(buildCost(h, next) + 400);
    }
    // 打野的补刀主要来自野怪
    const jungler = st.heroes.find((h) => h.heroId === 'yeque' && h.team === 0) as HeroUnit;
    expect(jungler.cs).toBeGreaterThan(20);
  }, 30000);

  it('对线期行为：按分路站位、补刀、放技能；不在泉水发呆，不长时间卡住', () => {
    const sim = createWorld({ seed: 7, playerHero: 'chijin', difficulty: 'normal', autoPlay: true });
    const casts = new Map<number, Set<string>>();
    const stuck = new Map<number, { x: number; y: number; t: number; worst: number }>();
    const events: GameEvent[] = [];
    while (sim.state.time < 200) {
      sim.step();
      for (const e of sim.drainEvents()) {
        events.push(e);
        if (e.type === 'skillCast') {
          let s = casts.get(e.unitId);
          if (!s) casts.set(e.unitId, (s = new Set()));
          s.add(e.slot);
        }
      }
      // 「想走却没动」的最长持续时间
      for (const h of sim.heroes) {
        let rec = stuck.get(h.id);
        if (!rec) stuck.set(h.id, (rec = { x: h.pos.x, y: h.pos.y, t: sim.state.time, worst: 0 }));
        const moving = h.alive && h.rt.moveMode === 2 && !h.rt.stunned && !h.rt.rooted && !h.h.atkOrder;
        if (!moving || Math.hypot(h.pos.x - rec.x, h.pos.y - rec.y) > 0.6) {
          rec.x = h.pos.x;
          rec.y = h.pos.y;
          rec.t = sim.state.time;
        } else rec.worst = Math.max(rec.worst, sim.state.time - rec.t);
      }
      if (Math.abs(sim.state.time - 40) < 1e-6) {
        // 第一波兵交战时：每个线上英雄都在自己的分路上，打野在己方野区
        const geo = teamBrain(sim.botView(sim.heroes[0].id)!).geo;
        for (const h of sim.heroes) {
          if (h.lane === 'jungle') {
            const camp = sim.map.camps.filter((c) => c.side === h.team).some((c) => Math.hypot(c.pos.x - h.pos.x, c.pos.y - h.pos.y) < 14);
            expect(camp, `${h.heroId}@${h.team} should be at a jungle camp`).toBe(true);
          } else {
            expect(geo.nearestLane(h.pos.x, h.pos.y), `${h.heroId}@${h.team} lane`).toBe(h.lane);
            expect(geo.lateral).toBeLessThan(8);
          }
        }
      }
    }
    for (const h of sim.heroes) {
      expect(h.h.controller).toBeInstanceOf(HeroBot);
      // 3 分 20 秒：到 4 级附近，买了鞋，放过技能
      expect(h.level, `${h.heroId}@${h.team} level`).toBeGreaterThanOrEqual(3);
      expect(h.items[0]).not.toBeNull();
      const used = casts.get(h.id) ?? new Set();
      expect(used.has('s1') || used.has('s2'), `${h.heroId}@${h.team} used a skill`).toBe(true);
      expect((stuck.get(h.id) as { worst: number }).worst, `${h.heroId}@${h.team} stuck`).toBeLessThan(4);
      const base = sim.map.bases[h.team];
      const inBase = Math.hypot(h.pos.x - base.fountain.x, h.pos.y - base.fountain.y) < base.fountainRadius;
      if (inBase) expect(h.hp < h.stats.maxHp * 0.95 || !h.alive || h.respawnIn > 0 || h.mana < h.stats.maxMana * 0.85).toBe(true);
    }
    // 补刀：三条线的输出位在 200 秒内至少补到 8 个(每路约 22 个小兵)
    for (const id of ['chijin', 'xingli', 'fengling'] as HeroId[]) {
      const best = Math.max(heroOf(sim, 0, id).cs, heroOf(sim, 1, id).cs);
      expect(best, `${id} cs`).toBeGreaterThanOrEqual(8);
    }
    const lastHits = events.filter((e) => e.type === 'gold' && e.reason === 'lasthit').length;
    expect(lastHits).toBeGreaterThan(40);
  }, 30000);
});

describe('Bot：难度', () => {
  it('档位：简单 = 红方 novice + 队友 easy；普通 / 困难只改红方，队友固定 normal', () => {
    expect([botTierFor('easy', 0), botTierFor('easy', 1)]).toEqual(['easy', 'novice']);
    expect([botTierFor('normal', 0), botTierFor('normal', 1)]).toEqual(['normal', 'normal']);
    expect([botTierFor('hard', 0), botTierFor('hard', 1)]).toEqual(['normal', 'hard']);
    // novice 比 easy 更软：反应更慢、更不敢打、更爱发呆、更少配合
    const n = PROFILES.novice;
    const e = PROFILES.easy;
    expect(n.reaction).toBeGreaterThan(e.reaction);
    expect(n.aggression).toBeLessThan(e.aggression);
    expect(n.idleRate).toBeGreaterThan(e.idleRate);
    expect(n.teamwork).toBeLessThan(e.teamwork);
    // 世界里每个英雄的视图拿到的就是这个档位(玩家英雄托管时用队友那一档)
    const sim = createWorld({ seed: 9, playerHero: 'chijin', difficulty: 'easy', autoPlay: true });
    for (const h of sim.heroes) expect(sim.botView(h.id)?.difficulty).toBe(h.team === 1 ? 'novice' : 'easy');
  });

  it('同一局种子：简单难度的红方明显落后，困难难度的红方明显领先', () => {
    const lead = (difficulty: 'easy' | 'hard'): number => {
      let sum = 0;
      for (const seed of [11, 12]) {
        const r = runHeadless({ seed, playerHero: 'xingli', difficulty, autoPlay: true }, { maxTime: 6.5 * 60 });
        const t = r.sim.state.teams;
        // 红方相对蓝方的经济领先(对局提前结束则按胜负计一个大数)
        sum += r.winner === null ? t[1].gold - t[0].gold : r.winner === 1 ? 5000 : -5000;
      }
      return sum;
    };
    const easy = lead('easy');
    const hard = lead('hard');
    expect(easy).toBeLessThan(-1500);
    expect(hard).toBeGreaterThan(1500);
  }, 40000);
});

describe('Bot：组件', () => {
  it('购买：按推荐出装顺序推算下一件；升级鞋抵扣旧鞋', () => {
    const sim = quietWorld('panyue');
    const h = heroOf(sim, 0, 'panyue');
    const build = HEROES.panyue.build;
    expect(nextBuildItem(h)).toBe(build[0]);
    h.gold = 99999;
    const bought: string[] = [];
    for (let i = 0; i < 12; i++) {
      const id = nextBuildItem(h);
      if (!id) break;
      const before = h.gold;
      const cost = buildCost(h, id);
      // 升级鞋的花费 = 标价 − 旧鞋售价
      if (id === 'boots_guard') expect(cost).toBe(ITEMS.boots_guard.cost - Math.floor(ITEMS.boots.cost * SELL_RATIO));
      else expect(cost).toBe(ITEMS[id].cost);
      sim.command(h.id, { type: 'buy', itemId: id });
      expect(before - h.gold).toBe(cost);
      bought.push(id);
    }
    // 7 件出装全部买齐：鞋只占一格，装备栏正好 6 件
    expect(bought).toEqual(build);
    expect(h.items.every((it) => it !== null)).toBe(true);
    expect(h.items.filter((it) => it && ITEMS[it].category === 'boots')).toEqual(['boots_guard']);
    expect(nextBuildItem(h)).toBeNull();
  });

  it('绕塔寻路：safePath 给出的路线不穿过敌方防御塔的射程', () => {
    const sim = quietWorld('chijin');
    const h = heroOf(sim, 0, 'chijin');
    // 敌方中路一塔在 (8.1, -12.9)：从它的西南走到东北，直线会穿过射程
    place(sim, h, -2, -2);
    const tower = sim.towers[1].mid[0];
    expect(tower).not.toBeNull();
    if (!tower) return;
    const view = sim.botView(h.id)!;
    const to = { x: 18, y: -24 };
    const zone = [{ x: tower.pos.x, y: tower.pos.y, r: tower.stats.attackRange }];
    expect(segmentHitsZones(zone, h.pos.x, h.pos.y, to.x, to.y)).toBe(true);
    const path = view.safePath(to);
    expect(path).not.toBeNull();
    if (!path) return;
    let px = h.pos.x;
    let py = h.pos.y;
    for (const p of path) {
      expect(segmentHitsZones(zone, px, py, p.x, p.y)).toBe(false);
      px = p.x;
      py = p.y;
    }
    expect(Math.hypot(px - to.x, py - to.y)).toBeLessThan(1.5);
    // 终点在射程里(去点塔)：照样给路，只是不往更深处绕
    expect(view.safePath({ x: tower.pos.x - 5, y: tower.pos.y + 5 })).not.toBeNull();
  });

  it('公平性：看不见的敌人不会出现在 Bot 的感知里；setBotControl 可随时接管/交还', () => {
    const sim = quietWorld('xingli');
    const me = heroOf(sim, 0, 'xingli');
    const foe = heroOf(sim, 1, 'yeque');
    place(sim, me, -4, 6);
    // 敌人藏在中路河道口的三角草丛里：在视野半径内，但超出草丛的贴身可见距离
    place(sim, foe, -12.5, 0);
    expect(foe.bushId).toBeGreaterThanOrEqual(0);
    expect(foe.visible[0]).toBe(false);
    sim.setBotControl(me.id, true);
    const bot = me.h.controller as HeroBot;
    for (let i = 0; i < 30; i++) sim.step();
    expect(bot.foes.length).toBe(0);
    expect(bot.foesAll.length).toBe(0);
    expect(bot.adv).toBe(9);
    // 走出草丛 → 过了反应时间才进入感知
    place(sim, foe, -4, -1);
    expect(foe.visible[0]).toBe(true);
    for (let i = 0; i < 30; i++) sim.step();
    expect(bot.foesAll.map((e) => e.id)).toContain(foe.id);
    sim.setBotControl(me.id, false);
    expect(me.h.controller).toBeNull();
  });

  it('兜底 AI 仍可通过工厂切换(对照实验用)', () => {
    setDefaultBotFactory(fallbackBotFactory);
    try {
      const sim = createWorld({ seed: 1, playerHero: 'chijin', difficulty: 'normal', autoPlay: true });
      expect(sim.heroes.every((h) => h.h.controller !== null && !(h.h.controller instanceof HeroBot))).toBe(true);
    } finally {
      setDefaultBotFactory(null);
    }
    const sim = createWorld({ seed: 1, playerHero: 'chijin', difficulty: 'normal', autoPlay: true });
    expect(sim.heroes.every((h) => h.h.controller instanceof HeroBot)).toBe(true);
  });
});

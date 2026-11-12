/**
 * 假对局状态：仅供渲染层/界面层在真正的模拟内核完成前做开发与画廊页使用。
 * 生成一个「看起来像对局中」的静态 GameState（10 英雄、几波小兵、全部塔与野怪、若干弹道/区域）。
 * 不要在正式游戏流程里使用。
 */
import { HEROES, HERO_IDS, heroStatsAt, skillLevelsAt } from './data/heroes';
import { CORE, MINIONS, MONSTERS, TOWERS, xpToNext } from './data/units';
import { createMap } from './map';
import type {
  CoreUnit, GameState, HeroId, HeroUnit, MinionType, MinionUnit, MonsterUnit, PlayerTeam, SkillSlot, SkillState, Stats, TowerUnit, UnitBase, Vec2,
} from './types';

function baseStats(p: Partial<Stats>): Stats {
  return {
    maxHp: 1000, maxMana: 0, ad: 50, ap: 0, armor: 0, mr: 0, attackSpeed: 1, moveSpeed: 0, attackRange: 2, hpRegen: 0, manaRegen: 0,
    cdr: 0, lifesteal: 0, critChance: 0, critDamage: 2, armorPen: 0, magicPen: 0, ...p,
  };
}

let nextId = 1;
function unitBase(team: 0 | 1 | 2, pos: Vec2, radius: number, stats: Stats, hpRatio = 1): Omit<UnitBase, 'kind'> {
  return {
    id: nextId++, team, pos: { ...pos }, prevPos: { ...pos }, facing: team === 1 ? Math.PI * 0.75 : -Math.PI * 0.25, radius,
    alive: true, hp: stats.maxHp * hpRatio, mana: stats.maxMana * 0.7, stats, buffs: [], shield: 0,
    anim: 'idle', animStart: 0, animDur: 0, targetId: -1, visible: [true, true], bushId: -1, invulnerable: false, lastHitTime: -999,
  };
}

export function createMockState(playerHero: HeroId = 'chijin'): GameState {
  nextId = 1;
  const map = createMap();
  const state: GameState = {
    time: 185, tick: 185 * 30, config: { seed: 1, playerHero, difficulty: 'normal' }, map,
    units: [], heroes: [], projectiles: [], areas: [],
    teams: [{ kills: 4, towersDestroyed: 1, gold: 9800, blessingLeft: 0 }, { kills: 3, towersDestroyed: 0, gold: 9100, blessingLeft: 0 }],
    camps: map.camps.map((c) => ({ campId: c.id, alive: true, respawnIn: 0 })),
    playerId: -1, nextWaveIn: 12, wave: 6, over: false, winner: null,
  };

  // 英雄：蓝方围在中路河道西南侧，红方在东北侧，摆成对峙
  const order: HeroId[] = [playerHero, ...HERO_IDS.filter((h) => h !== playerHero)];
  const blueSpots: Vec2[] = [{ x: -5, y: 5 }, { x: -8.5, y: 3.5 }, { x: -3.5, y: 9 }, { x: -9, y: 9.5 }, { x: -12, y: 6 }];
  for (const team of [0, 1] as PlayerTeam[]) {
    order.forEach((heroId, i) => {
      const def = HEROES[heroId];
      const level = 5 + ((i * 2 + team) % 4);
      const stats = heroStatsAt(def, level);
      const sl = skillLevelsAt(level);
      const mk = (lv: number, cdMax: number, cd: number, cost: number): SkillState => ({ level: lv, cd, cdMax, cost });
      const skills: Record<SkillSlot, SkillState> = {
        s1: mk(sl.s1, def.skills.s1.cooldown[0], i === 1 ? 3.2 : 0, def.skills.s1.manaCost[0]),
        s2: mk(sl.s2, def.skills.s2.cooldown[0], i === 0 ? 5.5 : 0, def.skills.s2.manaCost[0]),
        ult: mk(sl.ult, def.skills.ult.cooldown[0], i === 2 ? 21 : 0, def.skills.ult.manaCost[0]),
        recall: mk(1, 1, 0, 0), heal: mk(1, 60, i === 0 ? 31 : 0, 0), flash: mk(1, 110, 0, 0),
      };
      const s = blueSpots[i];
      const pos = team === 0 ? s : { x: s.y, y: s.x };
      const hero: HeroUnit = {
        ...unitBase(team, pos, def.radius, stats, 0.45 + 0.11 * i), kind: 'hero', team, heroId, name: def.name, isPlayer: team === 0 && i === 0,
        lane: def.lane, level, xp: 120, xpToNext: xpToNext(level), gold: 640 + i * 180, goldEarned: 2400 + i * 300,
        kills: (i * 3 + team) % 4, deaths: (i + team * 2) % 3, assists: (i * 2) % 5, cs: 18 + i * 6, streak: 0, skills,
        items: [def.build[0], def.build[1], null, null, null, null], respawnIn: 0, dmgDealt: 4200 + i * 900, dmgTaken: 3900, dmgTower: 800, inCombat: true,
      };
      if (i === 4 && team === 1) { hero.alive = false; hero.hp = 0; hero.respawnIn = 9; hero.anim = 'dead'; }
      if (i === 1) hero.buffs.push({ id: 'slow', sourceId: -1, timeLeft: 1.2, duration: 2, stacks: 1, value: 0.3 });
      if (i === 3) { hero.buffs.push({ id: 'shield', sourceId: hero.id, timeLeft: 3, duration: 4, stacks: 1, value: 420 }); hero.shield = 420; }
      state.units.push(hero);
      state.heroes.push(hero);
      if (hero.isPlayer) state.playerId = hero.id;
    });
  }

  // 防御塔与水晶
  for (const t of map.towers) {
    const d = TOWERS[t.tier];
    const destroyed = t.team === 1 && t.lane === 'mid' && t.tier === 1;
    if (destroyed) continue;
    const tower: TowerUnit = {
      ...unitBase(t.team, t.pos, d.radius, baseStats({ maxHp: d.hp, ad: d.ad, armor: d.armor, mr: d.mr, attackRange: d.attackRange }), t.tier === 1 ? 0.6 : 1),
      kind: 'tower', team: t.team, lane: t.lane, tier: t.tier,
    };
    tower.invulnerable = t.tier > 1;
    state.units.push(tower);
  }
  for (const b of map.bases) {
    const core: CoreUnit = { ...unitBase(b.team, b.core, CORE.radius, baseStats({ maxHp: CORE.hp, ad: CORE.ad, attackRange: CORE.attackRange })), kind: 'core', team: b.team };
    core.invulnerable = true;
    state.units.push(core);
  }

  // 小兵：每路在交汇点两侧各摆一波
  const meet: Record<'top' | 'mid' | 'bot', { at: Vec2; dir: Vec2 }> = {
    top: { at: { x: -50, y: -50 }, dir: { x: 0.7, y: -0.7 } },
    mid: { at: { x: 0, y: 0 }, dir: { x: 0.7, y: -0.7 } },
    bot: { at: { x: 50, y: 50 }, dir: { x: 0.7, y: -0.7 } },
  };
  const waveTypes: MinionType[] = ['melee', 'melee', 'ranged', 'siege'];
  for (const lane of ['top', 'mid', 'bot'] as const) {
    for (const team of [0, 1] as PlayerTeam[]) {
      waveTypes.forEach((mt, k) => {
        const d = MINIONS[mt];
        const sign = team === 0 ? -1 : 1;
        const back = 1.6 + k * 1.5;
        const side = (k % 2 === 0 ? 1 : -1) * 0.9;
        const m = meet[lane];
        const pos = { x: m.at.x + sign * m.dir.x * back + m.dir.y * side, y: m.at.y + sign * m.dir.y * back - m.dir.x * side };
        const minion: MinionUnit = {
          ...unitBase(team, pos, d.radius, baseStats({ maxHp: d.hp, ad: d.ad, attackRange: d.attackRange, moveSpeed: d.moveSpeed }), 0.4 + 0.2 * k),
          kind: 'minion', team, minionType: mt, lane,
        };
        minion.anim = k < 2 ? 'attack' : 'idle';
        minion.animDur = 1.2;
        state.units.push(minion);
      });
    }
  }

  // 野怪
  for (const c of map.camps) {
    const d = MONSTERS[c.monsterType];
    for (const off of c.spawns) {
      const mon: MonsterUnit = {
        ...unitBase(2, { x: c.pos.x + off.x, y: c.pos.y + off.y }, d.radius, baseStats({ maxHp: d.hp, ad: d.ad, attackRange: d.attackRange })),
        kind: 'monster', team: 2, monsterType: c.monsterType, campId: c.id,
      };
      mon.facing = Math.atan2(-c.pos.y, -c.pos.x);
      state.units.push(mon);
    }
  }

  // 几个弹道与区域效果，方便调试外观
  state.projectiles.push(
    { id: 9001, visual: 'xingli_s1', team: 0, ownerId: state.heroes[2].id, pos: { x: -1, y: 2 }, prevPos: { x: -1.6, y: 2.6 }, dir: { x: 0.707, y: -0.707 }, speed: 26, radius: 0.65, targetId: -1, traveled: 4, maxRange: 12 },
    { id: 9002, visual: 'fengling_basic', team: 1, ownerId: state.heroes[8].id, pos: { x: 3, y: -2 }, prevPos: { x: 3.5, y: -2.5 }, dir: { x: -0.707, y: 0.707 }, speed: 30, radius: 0.2, targetId: state.heroes[0].id, traveled: 2, maxRange: 0 },
  );
  state.areas.push(
    { id: 9101, visual: 'xingli_ult_storm', team: 1, ownerId: state.heroes[7].id, pos: { x: -6, y: 12 }, radius: 5.2, age: 1, duration: 3, followUnitId: -1 },
    { id: 9102, visual: 'telegraph', team: 1, ownerId: state.heroes[7].id, pos: { x: 2, y: 6 }, radius: 3.4, age: 0.2, duration: 0.6, followUnitId: -1 },
  );
  return state;
}

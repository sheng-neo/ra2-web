/**
 * 单位的创建与基础判定。所有单位对象都在这里构造，保证契约字段与运行时字段齐全。
 */
import { HEROES, heroStatsAt, skillLevelsAt, SUMMONER } from './data/heroes';
import { CORE, ECONOMY, MINIONS, MONSTERS, TOWERS, VISION, xpToNext } from './data/units';
import {
  DEFAULT_WINDUP, hideFields, MON_IDLE, MOVE_NONE,
  type AttackProfile, type CampRt, type SimCore, type SimHero, type SimMinion, type SimMonster, type SimTower, type SimUnit, type UnitRt,
} from './internal';
import type {
  AbilitySlot, BaseDef, HeroId, LaneId, MinionType, PlayerTeam, SkillSlot, SkillState, Stats, TeamId, TowerSpot, UnitBase, Vec2,
} from './types';
import type { Sim } from './world';

/** 地形碰撞半径上限：大体型单位(攻城兵/野怪)按此封顶，否则在野区窄处寻不到路 */
const MAX_NAV_RADIUS = 0.8;

export function makeStats(p: Partial<Stats>): Stats {
  return {
    maxHp: 1, maxMana: 0, ad: 0, ap: 0, armor: 0, mr: 0, attackSpeed: 1, moveSpeed: 0, attackRange: 0, hpRegen: 0, manaRegen: 0,
    cdr: 0, lifesteal: 0, critChance: 0, critDamage: 2, armorPen: 0, magicPen: 0, ...p,
  };
}

function newRt(radius: number, weight: number, sight: number, base: Stats, atk: AttackProfile): UnitRt {
  return {
    navR: Math.min(radius, MAX_NAV_RADIUS), weight, sight, base, atk,
    stunned: false, rooted: false, silenced: false, untargetable: false, unstoppable: false, slowImmune: false, airborne: null,
    moveMode: MOVE_NONE, dirX: 0, dirY: 0, path: null, pathIdx: 0, goalX: 0, goalY: 0, pathTime: -999, stuck: 0, moved: false,
    pushX: 0, pushY: 0, dash: null,
    atkCd: 0, windupLeft: 0, windupTarget: -1, disarmUntil: 0,
    lockUntil: 0, act: null, actStart: 0, actDur: 0, actUntil: 0, actMoveCancel: true,
    hitHeroTime: -999, hitHeroId: -1, revealUntil: -999, lastAttackerId: -1, thinkAt: 0, backdoor: false,
  };
}

function newBase(sim: Sim, team: TeamId, pos: Vec2, facing: number, radius: number, stats: Stats): Omit<UnitBase, 'kind'> {
  return {
    id: sim.allocId(), team, pos: { x: pos.x, y: pos.y }, prevPos: { x: pos.x, y: pos.y }, facing, radius,
    alive: true, hp: stats.maxHp, mana: stats.maxMana, stats, buffs: [], shield: 0,
    anim: 'idle', animStart: sim.state.time, animDur: 0, targetId: -1,
    // 己方恒可见；对敌方的可见性由视野系统在下一次更新时给出
    visible: [team !== 1, team !== 0], bushId: -1, invulnerable: false, lastHitTime: -999,
  };
}

/** 蓝方朝东北、红方朝西南 */
const teamFacing = (team: TeamId): number => (team === 1 ? Math.PI * 0.75 : -Math.PI * 0.25);

export function createHero(sim: Sim, index: number, team: PlayerTeam, heroId: HeroId, isPlayer: boolean): SimHero {
  const def = HEROES[heroId];
  const base: BaseDef = sim.map.bases[team];
  const spawn = base.spawns[index % base.spawns.length];
  const stats = heroStatsAt(def, 1);
  const levels = skillLevelsAt(1);
  const ability = (slot: AbilitySlot): SkillState => ({
    level: levels[slot], cd: 0, cdMax: def.skills[slot].cooldown[0], cost: def.skills[slot].manaCost[0],
  });
  const summoner = (cd: number): SkillState => ({ level: 1, cd: 0, cdMax: cd, cost: 0 });
  const skills: Record<SkillSlot, SkillState> = {
    s1: ability('s1'), s2: ability('s2'), ult: ability('ult'),
    recall: summoner(SUMMONER.recall.cooldown), heal: summoner(SUMMONER.heal.cooldown), flash: summoner(SUMMONER.flash.cooldown),
  };
  const atk: AttackProfile = {
    windup: def.basicAttack.windup, dtype: def.basicAttack.damageType,
    visual: def.basicAttack.projectile ?? null, projSpeed: def.basicAttack.projectileSpeed ?? 0, vsStructure: 1, vsMinion: 1,
  };
  const hero: SimHero = {
    ...newBase(sim, team, spawn, teamFacing(team), def.radius, stats),
    kind: 'hero', team, heroId, name: def.name, isPlayer, lane: def.lane,
    level: 1, xp: 0, xpToNext: xpToNext(1), gold: ECONOMY.startGold, goldEarned: ECONOMY.startGold,
    kills: 0, deaths: 0, assists: 0, cs: 0, streak: 0, skills, items: [null, null, null, null, null, null],
    respawnIn: 0, dmgDealt: 0, dmgTaken: 0, dmgTower: 0, inCombat: false,
    buffs: [],
    rt: newRt(def.radius, 2, VISION.hero, heroStatsAt(def, 1), atk),
    h: {
      def, index, spawn: { x: spawn.x, y: spawn.y }, baseLevel: 1,
      atkOrder: false, atkTargetId: -1, atkExplicit: false, pendingCast: null, pendingUntil: 0,
      goldFrac: 0, multiKill: 0, lastKillTime: -999, deathStreak: 0, damagers: new Map(), lastCombatTime: -999,
      hooks: [], cooldowns: new Map(), vars: new Map(), controller: null, nextThink: 0,
    },
  };
  return hideFields(hero, 'rt', 'h');
}

export function createMinion(sim: Sim, team: PlayerTeam, lane: LaneId, type: MinionType, pos: Vec2): SimMinion {
  const d = MINIONS[type];
  const minutes = sim.state.time / 60;
  const stats = makeStats({
    maxHp: d.hp + d.hpPerMin * minutes, ad: d.ad + d.adPerMin * minutes, armor: d.armor, mr: d.mr,
    attackSpeed: d.attackSpeed, attackRange: d.attackRange, moveSpeed: d.moveSpeed,
  });
  const ranged = d.projectileSpeed > 0;
  const atk: AttackProfile = {
    windup: DEFAULT_WINDUP, dtype: 'physical', visual: ranged ? (type === 'siege' ? 'minion_siege' : 'minion_ranged') : null,
    projSpeed: d.projectileSpeed, vsStructure: d.towerMult, vsMinion: 1,
  };
  const weight = type === 'super' || type === 'siege' ? 2 : 1;
  const minion: SimMinion = {
    ...newBase(sim, team, pos, teamFacing(team), d.radius, stats),
    kind: 'minion', team, minionType: type, lane, buffs: [],
    rt: newRt(d.radius, weight, VISION.minion, { ...stats }, atk),
    m: { offset: 0, dir: team === 0 ? 1 : -1, goalX: pos.x, goalY: pos.y, helping: false, offLane: false },
  };
  return hideFields(minion, 'rt', 'm');
}

export function createTower(sim: Sim, spot: TowerSpot): SimTower {
  const d = TOWERS[spot.tier];
  const stats = makeStats({ maxHp: d.hp, ad: d.ad, armor: d.armor, mr: d.mr, attackSpeed: d.attackSpeed, attackRange: d.attackRange });
  const atk: AttackProfile = { windup: 0.3, dtype: 'physical', visual: 'tower_bolt', projSpeed: d.projectileSpeed, vsStructure: 1, vsMinion: 1 };
  const tower: SimTower = {
    ...newBase(sim, spot.team, spot.pos, teamFacing(spot.team), d.radius, stats),
    kind: 'tower', team: spot.team, lane: spot.lane, tier: spot.tier, buffs: [],
    rt: newRt(d.radius, 0, VISION.tower, { ...stats }, atk),
  };
  return hideFields(tower, 'rt');
}

export function createCore(sim: Sim, base: BaseDef): SimCore {
  const stats = makeStats({
    maxHp: CORE.hp, ad: CORE.ad, armor: CORE.armor, mr: CORE.mr, attackSpeed: CORE.attackSpeed, attackRange: CORE.attackRange,
  });
  const atk: AttackProfile = { windup: 0.3, dtype: 'physical', visual: 'core_bolt', projSpeed: CORE.projectileSpeed, vsStructure: 1, vsMinion: 1 };
  const core: SimCore = {
    ...newBase(sim, base.team, base.core, teamFacing(base.team), CORE.radius, stats),
    kind: 'core', team: base.team, buffs: [],
    rt: newRt(CORE.radius, 0, VISION.core, { ...stats }, atk),
  };
  return hideFields(core, 'rt');
}

export function createMonster(sim: Sim, camp: CampRt, slot: number): SimMonster {
  const def = camp.def;
  const d = MONSTERS[def.monsterType];
  const minutes = sim.state.time / 60;
  const stats = makeStats({
    maxHp: d.hp + d.hpPerMin * minutes, ad: d.ad + d.adPerMin * minutes, armor: d.armor, mr: d.mr,
    attackSpeed: d.attackSpeed, attackRange: d.attackRange, moveSpeed: d.moveSpeed,
  });
  const off = def.spawns[slot];
  const home = { x: def.pos.x + off.x, y: def.pos.y + off.y };
  const atk: AttackProfile = {
    windup: DEFAULT_WINDUP, dtype: 'physical', visual: d.projectileSpeed > 0 ? 'monster_spit' : null,
    projSpeed: d.projectileSpeed, vsStructure: 1, vsMinion: 1,
  };
  // 野怪面朝地图中心，看起来像在守着营地
  const facing = Math.atan2(-home.y, -home.x);
  const monster: SimMonster = {
    ...newBase(sim, 2, home, facing, d.radius, stats),
    kind: 'monster', team: 2, monsterType: def.monsterType, campId: def.id, buffs: [],
    rt: newRt(d.radius, d.epic ? 0 : 3, VISION.monster, { ...stats }, atk),
    mon: { home, state: MON_IDLE, camp },
  };
  return hideFields(monster, 'rt', 'mon');
}

// ───────────────────────── 基础判定 ─────────────────────────

export function isStructure(u: SimUnit): u is SimTower | SimCore {
  return u.kind === 'tower' || u.kind === 'core';
}

/** 存活、非无敌、可被选中 */
export function isTargetable(u: SimUnit): boolean {
  return u.alive && !u.invulnerable && !u.rt.untargetable;
}

/** attacker 能否把 target 当作攻击目标：敌对 + 可选中 + 对其队伍可见（野怪不受视野限制） */
export function canTarget(attacker: SimUnit, target: SimUnit): boolean {
  if (!target.alive || target.invulnerable || target.rt.untargetable) return false;
  if (target.team === attacker.team) return false;
  if (attacker.team !== 2 && !target.visible[attacker.team]) return false;
  return true;
}

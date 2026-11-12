/**
 * 经济与成长：金币、经验/升级(自动加点)、击杀结算(首杀/连杀/多杀/终结/赏金/助攻)、小兵击杀分成。
 */
import { HEROES, MAX_LEVEL, skillLevelsAt } from './data/heroes';
import { ECONOMY, MINIONS, respawnTime, xpToNext } from './data/units';
import type { SimHero, SimMinion, SimUnit } from './internal';
import { recomputeStats } from './stats';
import type { AbilitySlot, AnnounceKey, GameEvent, Vec2 } from './types';
import type { Sim } from './world';

type GoldReason = Extract<GameEvent, { type: 'gold' }>['reason'];

/** 升级时回复的已损生命/法力比例 */
const LEVEL_UP_RESTORE = 0.2;
/** 连续死亡时每次递减的赏金 */
const BOUNTY_DECAY_PER_DEATH = 40;
const ABILITY_SLOTS: AbilitySlot[] = ['s1', 's2', 'ult'];

/** 给英雄加金币（计入累计经济与队伍经济）。silent = 不发 gold 事件 */
export function grantGold(sim: Sim, hero: SimHero, amount: number, reason: GoldReason, pos: Vec2, silent = false): void {
  const g = Math.round(amount);
  if (g <= 0) return;
  hero.gold += g;
  hero.goldEarned += g;
  sim.state.teams[hero.team].gold += g;
  if (!silent) sim.emit({ type: 'gold', unitId: hero.id, amount: g, pos: { x: pos.x, y: pos.y }, reason });
}

/** 按英雄等级同步三个技能的等级与法力消耗（自动加点） */
export function syncSkillLevels(hero: SimHero): void {
  const levels = skillLevelsAt(hero.level);
  const def = HEROES[hero.heroId];
  for (const slot of ABILITY_SLOTS) {
    const s = hero.skills[slot];
    const d = def.skills[slot];
    s.level = levels[slot];
    const i = Math.max(0, s.level - 1);
    s.cost = d.manaCost[i];
    if (s.cd <= 0) s.cdMax = d.cooldown[i];
  }
}

function levelUp(sim: Sim, hero: SimHero): void {
  hero.level++;
  hero.xpToNext = xpToNext(hero.level);
  recomputeStats(sim, hero);
  if (hero.alive) {
    hero.hp += (hero.stats.maxHp - hero.hp) * LEVEL_UP_RESTORE;
    hero.mana += (hero.stats.maxMana - hero.mana) * LEVEL_UP_RESTORE;
  }
  syncSkillLevels(hero);
  sim.emit({ type: 'levelUp', unitId: hero.id, level: hero.level });
  sim.fx('level_up', hero.pos, hero.team, { unitId: hero.id });
}

/** 给英雄加经验，自动处理升级（可连升多级） */
export function grantXp(sim: Sim, hero: SimHero, amount: number): void {
  if (hero.level >= MAX_LEVEL || !(amount > 0)) return;
  hero.xp += amount;
  while (hero.level < MAX_LEVEL && hero.xp >= hero.xpToNext) {
    hero.xp -= hero.xpToNext;
    levelUp(sim, hero);
  }
  if (hero.level >= MAX_LEVEL) {
    hero.xp = 0;
    hero.xpToNext = 0;
  }
}

/** 直接把英雄设为指定等级（测试/调试用） */
export function setHeroLevel(sim: Sim, hero: SimHero, level: number): void {
  const target = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  while (hero.level < target) {
    hero.xp = 0;
    levelUp(sim, hero);
  }
  if (hero.level >= MAX_LEVEL) hero.xpToNext = 0;
}

const share = (n: number): number => ECONOMY.xpShare[Math.min(n, ECONOMY.xpShare.length) - 1];

/**
 * 击杀归属：最后一击来自敌方英雄则归他；否则(塔/小兵/野怪/泉水补刀)归助攻窗口内最近伤害过死者的敌方英雄。
 * 都没有则返回 null（被「处决」，无人获得击杀）。
 */
export function resolveHeroKiller(sim: Sim, victim: SimHero, killer: SimUnit | null): SimHero | null {
  if (killer && killer.kind === 'hero' && killer.team !== victim.team) return killer;
  let best: SimHero | null = null;
  let bestTime = sim.state.time - ECONOMY.assistWindow;
  for (const [id, t] of victim.h.damagers) {
    if (t < bestTime) continue;
    const u = sim.byId.get(id);
    if (u && u.kind === 'hero' && u.team !== victim.team) {
      best = u;
      bestTime = t;
    }
  }
  return best;
}

export function onHeroKilled(sim: Sim, victim: SimHero, killer: SimHero | null, rawKiller: SimUnit | null): void {
  const st = sim.state;
  const time = st.time;
  const E = ECONOMY;
  const victimStreak = victim.streak;
  victim.deaths++;
  victim.streak = 0;
  victim.respawnIn = respawnTime(victim.level, time);
  victim.h.atkOrder = false;
  victim.h.pendingCast = null;

  // 助攻：窗口内伤害过死者的其他敌方英雄
  const assists: SimHero[] = [];
  for (const [id, t] of victim.h.damagers) {
    if (time - t > E.assistWindow) continue;
    const u = sim.byId.get(id);
    if (u && u.kind === 'hero' && u !== killer && u.team !== victim.team) assists.push(u);
  }
  victim.h.damagers.clear();

  let bounty = 0;
  let firstBlood = false;
  let shutdown = false;
  let multi = 0;
  let streak = 0;
  if (killer) {
    bounty = E.killGold + E.killGoldPerStreak * victimStreak - BOUNTY_DECAY_PER_DEATH * victim.h.deathStreak;
    bounty = Math.max(E.killGoldMin, Math.min(E.killGoldMax, bounty));
    if (!sim.firstBlood) {
      sim.firstBlood = true;
      firstBlood = true;
      bounty += E.firstBloodBonus;
    }
    shutdown = victimStreak >= 3;
    const kh = killer.h;
    killer.kills++;
    killer.streak++;
    streak = killer.streak;
    kh.multiKill = time - kh.lastKillTime <= E.multiKillWindow ? Math.min(5, kh.multiKill + 1) : 1;
    kh.lastKillTime = time;
    kh.deathStreak = 0;
    multi = kh.multiKill;
    st.teams[killer.team].kills++;
    grantGold(sim, killer, bounty, 'kill', victim.pos);
    if (assists.length > 0) {
      const each = (bounty * E.assistRatio) / assists.length;
      for (const a of assists) {
        a.assists++;
        a.h.deathStreak = 0;
        grantGold(sim, a, each, 'assist', victim.pos);
      }
    }
  }
  victim.h.deathStreak++;

  // 经验：击杀者 + 助攻者 + 附近的敌方英雄 分享
  const R2 = E.shareRadius * E.shareRadius;
  const takers: SimHero[] = [];
  if (killer) takers.push(killer);
  for (const a of assists) takers.push(a);
  for (const h of sim.heroes) {
    if (h.team === victim.team || !h.alive || takers.indexOf(h) >= 0) continue;
    const dx = h.pos.x - victim.pos.x;
    const dy = h.pos.y - victim.pos.y;
    if (dx * dx + dy * dy <= R2) takers.push(h);
  }
  if (takers.length > 0) {
    const xp = (E.killXp + E.killXpPerLevel * victim.level) * share(takers.length);
    for (const h of takers) grantXp(sim, h, xp);
  }

  sim.emit({
    type: 'heroKill', victimId: victim.id, killerId: killer ? killer.id : rawKiller ? rawKiller.id : -1,
    assistIds: assists.map((a) => a.id), multiKill: multi, streak, firstBlood, shutdown, bounty,
  });

  // 钩子
  for (const hk of victim.h.hooks) if (hk.onDeath) hk.onDeath(sim, victim, killer ?? rawKiller);
  if (killer) {
    for (const hk of killer.h.hooks) {
      if (hk.onKill) hk.onKill(sim, killer, victim);
      if (hk.onTakedown) hk.onTakedown(sim, killer, victim, true);
    }
  }
  for (const a of assists) for (const hk of a.h.hooks) if (hk.onTakedown) hk.onTakedown(sim, a, victim, false);

  // 播报：每次击杀只播最重要的一条
  const enemyTeam = victim.team === 0 ? 1 : 0;
  if (killer) {
    let key: AnnounceKey | null = null;
    if (firstBlood) key = 'first_blood';
    else if (multi >= 5) key = 'penta_kill';
    else if (multi === 4) key = 'quadra_kill';
    else if (multi === 3) key = 'triple_kill';
    else if (multi === 2) key = 'double_kill';
    else if (shutdown) key = 'shutdown';
    else if (streak >= 7) key = 'legendary';
    else if (streak === 5) key = 'unstoppable';
    else if (streak === 3) key = 'killing_spree';
    if (key) sim.emit({ type: 'announce', key, team: killer.team, unitId: killer.id, victimId: victim.id });
  }
  let anyAlive = false;
  for (const h of sim.heroes) if (h.team === victim.team && h.alive) anyAlive = true;
  if (!anyAlive) sim.emit({ type: 'announce', key: 'ace', team: enemyTeam, unitId: killer ? killer.id : undefined });
}

export function onMinionKilled(sim: Sim, victim: SimMinion, killer: SimUnit | null): void {
  const def = MINIONS[victim.minionType];
  const E = ECONOMY;
  const lastHitter = killer && killer.kind === 'hero' && killer.team !== victim.team ? killer : null;
  if (lastHitter) {
    lastHitter.cs++;
    grantGold(sim, lastHitter, def.gold, 'lasthit', victim.pos);
    sim.fx('gold_gain', victim.pos, lastHitter.team, { unitId: lastHitter.id, value: def.gold });
    for (const hk of lastHitter.h.hooks) if (hk.onKill) hk.onKill(sim, lastHitter, victim);
  }
  // 附近的敌方英雄：没补到刀的拿一部分金币；经验由在场者分享
  const R2 = E.shareRadius * E.shareRadius;
  const takers: SimHero[] = [];
  if (lastHitter) takers.push(lastHitter);
  for (const h of sim.heroes) {
    if (h.team === victim.team || !h.alive || h === lastHitter) continue;
    const dx = h.pos.x - victim.pos.x;
    const dy = h.pos.y - victim.pos.y;
    if (dx * dx + dy * dy > R2) continue;
    takers.push(h);
    grantGold(sim, h, def.gold * E.proximityGoldRatio, 'passive', victim.pos);
  }
  if (takers.length > 0) {
    const xp = def.xp * share(takers.length);
    for (const h of takers) grantXp(sim, h, xp);
  }
}

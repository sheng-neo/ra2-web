/**
 * 防御塔 / 水晶 / 泉水。
 *
 * 塔的目标优先级：正在攻击己方英雄的敌方英雄(呼救) > 小兵(攻城/超级优先，再按距离) > 英雄。
 * 已锁定的目标在离开射程/死亡前不会更换，除非出现呼救目标。对同一英雄连续命中逐次增伤(tower_focus)。
 * 推塔顺序：每路必须 1→2→3；任意一路高地塔被毁后水晶才可被攻击。附近没有敌方小兵时建筑受到的伤害减免。
 */
import { dealDamage, engage, tickAttack } from './combat';
import { findBuff, addBuff } from './buffs';
import { CORE, FOUNTAIN, TOWERS } from './data/units';
import { canTarget } from './entity';
import { HELP_WINDOW, type SimCore, type SimTower, type SimUnit } from './internal';
import { grantGold } from './rewards';
import type { LaneId, PlayerTeam } from './types';
import type { Sim } from './world';

const LANE_IDS: LaneId[] = ['top', 'mid', 'bot'];
const THINK_INTERVAL = 0.1;
/** 判定「附近有敌方小兵」(防偷塔)的半径 */
const BACKDOOR_RADIUS = 10;
/** 泉水伤敌的间隔（秒） */
const FOUNTAIN_HIT_INTERVAL = 0.5;

const near: SimUnit[] = [];

/** 根据各路一塔存活情况刷新塔与水晶的无敌状态 */
export function refreshInvulnerability(sim: Sim): void {
  for (const team of [0, 1] as PlayerTeam[]) {
    let highGroundDown = false;
    for (const lane of LANE_IDS) {
      const [t1, t2, t3] = sim.towers[team][lane];
      if (t1) t1.invulnerable = false;
      if (t2) t2.invulnerable = t1 !== null;
      if (t3) t3.invulnerable = t1 !== null || t2 !== null;
      if (!t3) highGroundDown = true;
    }
    const core = sim.cores[team];
    if (core.alive) core.invulnerable = !highGroundDown;
  }
}

function structureThink(sim: Sim, s: SimTower | SimCore): void {
  const range = s.stats.attackRange;
  const helpSince = sim.state.time - HELP_WINDOW;
  let minionNear = false;
  let help: SimUnit | null = null;
  let helpD = Infinity;
  let minion: SimUnit | null = null;
  let minionScore = Infinity;
  let hero: SimUnit | null = null;
  let heroD = Infinity;
  const n = sim.grid.query(s.pos.x, s.pos.y, Math.max(range, BACKDOOR_RADIUS), near);
  for (let i = 0; i < n; i++) {
    const c = near[i];
    if (!c.alive || c.team === s.team || c.team === 2) continue;
    const d = Math.hypot(c.pos.x - s.pos.x, c.pos.y - s.pos.y);
    if (c.kind === 'minion' && d <= BACKDOOR_RADIUS) minionNear = true;
    if (d - c.radius > range || !canTarget(s, c)) continue;
    if (c.kind === 'hero') {
      if (c.rt.hitHeroTime >= helpSince && d < helpD) {
        help = c;
        helpD = d;
      }
      if (d < heroD) {
        hero = c;
        heroD = d;
      }
    } else if (c.kind === 'minion') {
      // 攻城兵/超级兵优先，其次最近
      const score = d + (c.minionType === 'siege' || c.minionType === 'super' ? 0 : 1000);
      if (score < minionScore) {
        minion = c;
        minionScore = score;
      }
    }
  }
  s.rt.backdoor = !minionNear;

  const cur = s.targetId >= 0 ? sim.byId.get(s.targetId) : undefined;
  const curValid = !!cur && canTarget(s, cur) && Math.hypot(cur.pos.x - s.pos.x, cur.pos.y - s.pos.y) - cur.radius <= range;
  if (help && !(curValid && cur && cur.kind === 'hero' && cur.rt.hitHeroTime >= helpSince)) {
    s.targetId = help.id;
  } else if (!curValid) {
    const pick = minion ?? hero;
    s.targetId = pick ? pick.id : -1;
  }
}

export function updateStructure(sim: Sim, s: SimTower | SimCore, dt: number): void {
  const rt = s.rt;
  const time = sim.state.time;
  tickAttack(sim, s, dt);
  if (time >= rt.thinkAt) {
    rt.thinkAt = time + THINK_INTERVAL;
    structureThink(sim, s);
  }
  if (s.targetId >= 0) {
    const target = sim.byId.get(s.targetId);
    if (target && canTarget(s, target)) engage(sim, s, target, dt, false);
    else s.targetId = -1;
  }
  // 水晶脱战回血
  if (s.kind === 'core' && s.hp < s.stats.maxHp && time - s.lastHitTime >= CORE.regenDelay) {
    s.hp = Math.min(s.stats.maxHp, s.hp + CORE.regen * dt);
  }
}

export function onTowerKilled(sim: Sim, tower: SimTower, killer: SimUnit | null): void {
  const st = sim.state;
  const enemy: PlayerTeam = tower.team === 0 ? 1 : 0;
  const def = TOWERS[tower.tier];
  sim.towers[tower.team][tower.lane][tower.tier - 1] = null;
  sim.nav.removeObstacle(tower.id);
  st.teams[enemy].towersDestroyed++;
  const pos = { x: tower.pos.x, y: tower.pos.y };
  sim.emit({ type: 'towerDestroyed', unitId: tower.id, team: tower.team, lane: tower.lane, tier: tower.tier, pos });
  sim.fx('tower_destroyed', tower.pos, tower.team, { unitId: tower.id });
  const killerHero = killer && killer.kind === 'hero' ? killer : null;
  sim.emit({ type: 'announce', key: 'tower_destroyed', team: enemy, unitId: killerHero ? killerHero.id : undefined });
  for (const h of sim.heroes) {
    if (h.team !== enemy) continue;
    grantGold(sim, h, def.teamGold + (h === killerHero ? def.lastHitGold : 0), 'tower', tower.pos);
  }
  if (killerHero) for (const hk of killerHero.h.hooks) if (hk.onKill) hk.onKill(sim, killerHero, tower);
  refreshInvulnerability(sim);
}

export function onCoreKilled(sim: Sim, core: SimCore): void {
  const st = sim.state;
  const winner: PlayerTeam = core.team === 0 ? 1 : 0;
  sim.nav.removeObstacle(core.id);
  st.over = true;
  st.winner = winner;
  st.endTime = st.time;
  sim.fx('core_destroyed', core.pos, core.team, { unitId: core.id });
  sim.emit({ type: 'gameOver', winner });
  // 玩家永远在蓝方：以玩家视角播报胜负
  sim.emit({ type: 'announce', key: winner === 0 ? 'victory' : 'defeat', team: winner });
}

/** 泉水：己方英雄快速回复；敌方单位进入受高额真实伤害 */
export function updateFountains(sim: Sim, dt: number): void {
  const st = sim.state;
  const bases = sim.map.bases;
  for (const h of sim.heroes) {
    if (!h.alive) continue;
    const base = bases[h.team];
    const dx = h.pos.x - base.fountain.x;
    const dy = h.pos.y - base.fountain.y;
    if (dx * dx + dy * dy > base.fountainRadius * base.fountainRadius) continue;
    const s = h.stats;
    if (h.hp < s.maxHp) h.hp = Math.min(s.maxHp, h.hp + s.maxHp * FOUNTAIN.regenRatio * dt);
    if (h.mana < s.maxMana) h.mana = Math.min(s.maxMana, h.mana + s.maxMana * FOUNTAIN.regenRatio * dt);
    // 状态图标用的标记 buff：在泉水里每 tick 续期
    const b = findBuff(h, 'fountain');
    if (b) b.timeLeft = 0.3;
    else addBuff(sim, h, 'fountain', { duration: 0.3 });
  }
  if (st.tick % Math.round(FOUNTAIN_HIT_INTERVAL / dt) !== 0) return;
  for (const base of bases) {
    const n = sim.grid.query(base.fountain.x, base.fountain.y, base.fountainRadius, near);
    if (n === 0) continue;
    const victims = near.slice();
    for (const u of victims) {
      if (!u.alive || u.team === base.team || u.team === 2) continue;
      const dx = u.pos.x - base.fountain.x;
      const dy = u.pos.y - base.fountain.y;
      if (dx * dx + dy * dy > base.fountainRadius * base.fountainRadius) continue;
      dealDamage(sim, null, u, u.stats.maxHp * FOUNTAIN.enemyDamageRatio, 'true', 'env');
    }
  }
}

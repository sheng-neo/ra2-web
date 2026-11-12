/**
 * 野怪：营地刷新、被打才还手、超出牵引范围回营回血、击杀奖励(增益怪 buff / 史诗野怪团队奖励)。
 */
import { addBuff } from './buffs';
import { engage, tickAttack, cancelWindup } from './combat';
import { ECONOMY, MONSTERS, MONSTER_RULES } from './data/units';
import { canTarget, createMonster } from './entity';
import { MON_COMBAT, MON_IDLE, MON_RETURN, type CampRt, type SimHero, type SimMonster, type SimUnit } from './internal';
import { moveToward, stepToward, updateDash } from './movement';
import { grantGold, grantXp } from './rewards';
import { recomputeStats } from './stats';
import type { Sim } from './world';

/** 回营途中 / 待机时每秒回复的最大生命比例 */
const RETURN_REGEN = 0.25;
const IDLE_REGEN = 0.05;
/** 目标离营地超过 leash + 此值就放弃追击 */
const TARGET_SLACK = 3;
/** 仇恨目标丢失时，多久之内打过我的单位可以接过仇恨 */
const RETARGET_WINDOW = 2.5;

export function initCamps(sim: Sim): void {
  for (const def of sim.map.camps) sim.camps.push({ def, members: [], respawnAt: def.firstSpawn });
}

function spawnCamp(sim: Sim, camp: CampRt): void {
  const def = camp.def;
  for (let i = 0; i < def.spawns.length; i++) {
    const m = createMonster(sim, camp, i);
    camp.members.push(m);
    sim.addUnit(m);
  }
  sim.emit({ type: 'monsterSpawn', campId: def.id, monsterType: def.monsterType, pos: { x: def.pos.x, y: def.pos.y } });
  if (MONSTERS[def.monsterType].epic) sim.emit({ type: 'announce', key: 'epic_spawn', team: 2 });
}

/** 营地刷新计时；同步 state.camps */
export function updateCamps(sim: Sim): void {
  const time = sim.state.time;
  const out = sim.state.camps;
  for (let i = 0; i < sim.camps.length; i++) {
    const camp = sim.camps[i];
    if (camp.members.length === 0 && !sim.opts.noCamps && time + 1e-9 >= camp.respawnAt) spawnCamp(sim, camp);
    const alive = camp.members.length > 0;
    out[i].alive = alive;
    out[i].respawnIn = alive ? 0 : Math.max(0, camp.respawnAt - time);
  }
}

/** 野怪被打：整个营地一起还手（回营途中的不理会） */
export function monsterAggro(mo: SimMonster, source: SimUnit): void {
  if (source.team === 2 || !source.alive) return;
  for (const member of mo.mon.camp.members) {
    if (member.mon.state !== MON_IDLE) continue;
    member.mon.state = MON_COMBAT;
    member.targetId = source.id;
  }
}

export function updateMonster(sim: Sim, mo: SimMonster, dt: number): void {
  const rt = mo.rt;
  const mon = mo.mon;
  const s = mo.stats;
  tickAttack(sim, mo, dt);
  if (rt.dash) {
    updateDash(sim, mo, dt);
    return;
  }
  if (rt.stunned) return;
  const camp = mon.camp.def;
  if (mon.state === MON_COMBAT) {
    const target = sim.byId.get(mo.targetId);
    const leash = MONSTER_RULES.leash;
    const hx = mo.pos.x - camp.pos.x;
    const hy = mo.pos.y - camp.pos.y;
    let valid = !!target && canTarget(mo, target) && hx * hx + hy * hy <= leash * leash;
    if (valid && target) {
      const tx = target.pos.x - camp.pos.x;
      const ty = target.pos.y - camp.pos.y;
      const lim = leash + TARGET_SLACK;
      valid = tx * tx + ty * ty <= lim * lim;
    }
    if (valid && target) {
      engage(sim, mo, target, dt, true);
      return;
    }
    // 目标跑远/死亡：还有别人在打我就转火，否则脱战回营
    // (多人围攻时不该因为第一个仇恨目标撤走就整只回满血)
    if (hx * hx + hy * hy <= leash * leash) {
      const other = sim.byId.get(rt.lastAttackerId);
      if (other && other !== target && other.team !== 2 && canTarget(mo, other) && sim.state.time - mo.lastHitTime < RETARGET_WINDOW) {
        const ox = other.pos.x - camp.pos.x;
        const oy = other.pos.y - camp.pos.y;
        if (ox * ox + oy * oy <= leash * leash) {
          cancelWindup(mo);
          mo.targetId = other.id;
          return;
        }
      }
    }
    cancelWindup(mo);
    mon.state = MON_RETURN;
    mo.targetId = -1;
  }
  const dx = mon.home.x - mo.pos.x;
  const dy = mon.home.y - mo.pos.y;
  const away = dx * dx + dy * dy;
  if (mon.state === MON_RETURN) {
    if (mo.hp < s.maxHp) mo.hp = Math.min(s.maxHp, mo.hp + s.maxHp * RETURN_REGEN * dt);
    if (away > 0.3 * 0.3) {
      if (!rt.rooted) moveToward(sim, mo, mon.home.x, mon.home.y, dt);
    } else {
      mon.state = MON_IDLE;
      mo.facing = Math.atan2(-mon.home.y, -mon.home.x);
    }
    return;
  }
  // 待机：缓慢回血；被挤开了就走回原位
  if (mo.hp < s.maxHp) mo.hp = Math.min(s.maxHp, mo.hp + s.maxHp * IDLE_REGEN * dt);
  if (away > 0.6 * 0.6 && !rt.rooted) stepToward(sim, mo, mon.home.x, mon.home.y, dt);
}

export function onMonsterKilled(sim: Sim, mo: SimMonster, killer: SimUnit | null): void {
  const st = sim.state;
  const def = MONSTERS[mo.monsterType];
  const camp = mo.mon.camp;
  const idx = camp.members.indexOf(mo);
  if (idx >= 0) camp.members.splice(idx, 1);
  if (camp.members.length === 0) camp.respawnAt = st.time + camp.def.respawn;
  sim.fx('monster_slain', mo.pos, 2, { unitId: mo.id });

  // 最后一击不是英雄(持续伤害的来源已消失等)时，算给最近打过它的英雄
  let hero: SimHero | null = null;
  if (killer && killer.kind === 'hero') hero = killer;
  else {
    const last = sim.byId.get(mo.rt.lastAttackerId);
    if (last && last.kind === 'hero') hero = last;
  }
  if (!hero) return;

  hero.cs++;
  grantGold(sim, hero, def.gold, 'monster', mo.pos);
  // 经验由附近的己方英雄分享
  const R2 = ECONOMY.shareRadius * ECONOMY.shareRadius;
  const takers: SimHero[] = [hero];
  for (const h of sim.heroes) {
    if (h === hero || h.team !== hero.team || !h.alive) continue;
    const dx = h.pos.x - mo.pos.x;
    const dy = h.pos.y - mo.pos.y;
    if (dx * dx + dy * dy <= R2) takers.push(h);
  }
  const ratio = ECONOMY.xpShare[Math.min(takers.length, ECONOMY.xpShare.length) - 1];
  for (const h of takers) grantXp(sim, h, def.xp * ratio);
  for (const hk of hero.h.hooks) if (hk.onKill) hk.onKill(sim, hero, mo);

  const R = MONSTER_RULES;
  switch (mo.monsterType) {
    case 'frost_golem':
      if (hero.alive) {
        addBuff(sim, hero, 'frost_insight', { duration: R.buffDuration, key: 'camp', merge: 'replace' });
        sim.fx('buff_gain', hero.pos, hero.team, { unitId: hero.id });
      }
      break;
    case 'ember_golem':
      if (hero.alive) {
        addBuff(sim, hero, 'ember_might', { duration: R.buffDuration, key: 'camp', merge: 'replace' });
        sim.fx('buff_gain', hero.pos, hero.team, { unitId: hero.id });
      }
      break;
    case 'abyss_drake':
      for (const h of sim.heroes) {
        if (h.team !== hero.team) continue;
        grantGold(sim, h, R.drakeTeamGold, 'monster', h.pos);
        grantXp(sim, h, R.drakeTeamXp);
      }
      sim.emit({ type: 'epicSlain', monsterType: mo.monsterType, team: hero.team, pos: { x: mo.pos.x, y: mo.pos.y } });
      sim.emit({ type: 'announce', key: 'epic_slain', team: hero.team, unitId: hero.id });
      break;
    case 'star_colossus':
      for (const h of sim.heroes) {
        if (h.team !== hero.team) continue;
        grantGold(sim, h, R.colossusTeamGold, 'monster', h.pos);
      }
      // 星陨祝福：英雄的 buff 由 hero.ts 按队伍剩余时间同步；小兵属性这里立即刷新
      st.teams[hero.team].blessingLeft = R.blessingDuration;
      for (const u of sim.units) if (u.kind === 'minion' && u.team === hero.team && u.alive) recomputeStats(sim, u);
      sim.emit({ type: 'epicSlain', monsterType: mo.monsterType, team: hero.team, pos: { x: mo.pos.x, y: mo.pos.y } });
      sim.emit({ type: 'announce', key: 'epic_slain', team: hero.team, unitId: hero.id });
      break;
    default:
      break;
  }
}

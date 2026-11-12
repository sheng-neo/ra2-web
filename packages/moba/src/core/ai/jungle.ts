/**
 * 打野位的工作：按路线清野(含增益怪) → 状态好就找机会 gank(从侧后方切入) → 史诗野怪由队伍任务驱动(epicWork，全队共用)。
 */
import { MONSTERS } from '../data/units';
import type { CampDef, HeroUnit, MonsterUnit, Vec2 } from '../types';
import type { HeroBot } from './bot';
import { dist } from './geom';
import { laneWork } from './lane';
import { TUNE } from './params';
import { waveSkills } from './skills';

const MONS: MonsterUnit[] = [];
const P: Vec2 = { x: 0, y: 0 };

function hasBuff(u: HeroUnit, id: string): boolean {
  for (let i = 0; i < u.buffs.length; i++) if (u.buffs[i].id === id) return true;
  return false;
}

/** 某个营地当前存活的野怪，按血量从少到多 */
function campMonsters(b: HeroBot, campId: number): MonsterUnit[] {
  MONS.length = 0;
  for (const m of b.v.monsters()) if (m.campId === campId) MONS.push(m);
  MONS.sort((x, y) => x.hp - y.hp);
  return MONS;
}

/** 下一个要打的营地：己方野区里「走过去时已经刷出来」的最近一个；身上没增益时优先增益怪 */
function chooseCamp(b: HeroBot): CampDef | null {
  const v = b.v;
  const me = b.me;
  const camps = v.map.camps;
  const state = v.state.camps;
  // 手上的营地还没打完就不换
  if (b.campId >= 0 && state[b.campId].alive) return camps[b.campId];
  let best: CampDef | null = null;
  let bestCost = Infinity;
  const speed = Math.max(1, me.stats.moveSpeed);
  for (const c of camps) {
    if (c.side !== b.team || MONSTERS[c.monsterType].epic) continue;
    const d = dist(me.pos, c.pos);
    const st = state[c.id];
    const wait = st.alive ? 0 : Math.max(0, st.respawnIn - d / speed);
    if (wait > 6) continue;
    let cost = d + wait * speed;
    if (c.monsterType === 'frost_golem' && !hasBuff(me, 'frost_insight')) cost -= 10;
    if (c.monsterType === 'ember_golem' && !hasBuff(me, 'ember_might')) cost -= 12;
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  b.campId = best ? best.id : -1;
  return best;
}

// ───────────────────────── gank ─────────────────────────

/** 找一个值得抓的目标：越线、离他的塔远、我方线上有人配合、去了能赢 */
function evalGank(b: HeroBot): HeroUnit | null {
  const me = b.me;
  const v = b.v;
  if (b.time < b.nextGankAt || me.level < 2 || b.hpR < 0.6 || b.manaR < 0.3) return null;
  let best: HeroUnit | null = null;
  let bestScore = 0;
  for (const e of b.foesAll) {
    const d = dist(me.pos, e.pos);
    if (d > 48) continue;
    if (v.enemyStructureCovering(e.pos, 5)) continue;
    // 刚抓过的人/刚去过的路先放一放：换条线找机会，别盯着一个人抓
    if (b.time - (b.gankedAt.get(e.id) ?? -999) < TUNE.gankSameTarget) continue;
    const lane = b.geo.nearestLane(e.pos.x, e.pos.y);
    if (b.time - b.gankLaneAt[lane] < TUNE.gankSameLane) continue;
    // 线上得有状态尚可的队友
    let ally = false;
    for (const h of v.alliedHeroes()) {
      if (h !== me && h.hp > h.stats.maxHp * 0.4 && dist(h.pos, e.pos) < 14) ally = true;
    }
    if (!ally) continue;
    const adv = b.advantageAt(e.pos.x, e.pos.y);
    if (adv < 1.25 / b.prof.aggression) continue;
    const score = adv * (1.4 - e.hp / e.stats.maxHp) - d / 60;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function endGank(b: HeroBot, success: boolean): boolean {
  b.gankId = -1;
  b.nextGankAt = b.time + b.prof.gankCooldown * (success ? 1 : 0.6);
  return false;
}

/** 接近 gank 目标。返回 true = 这次思考用在 gank 上了 */
function gankStep(b: HeroBot): boolean {
  const v = b.v;
  const me = b.me;
  const time = b.time;
  const u = v.unit(b.gankId);
  if (time - b.gankSince > 24) return endGank(b, false);
  if (!u || u.kind !== 'hero' || !u.alive || !v.canSee(u)) {
    // 目标没了：阵亡算成功；只是丢了视野就再往最后看到的位置走几秒
    const board = v.scoreboard();
    for (let i = 0; i < board.length; i++) if (board[i].id === b.gankId && !board[i].alive) return endGank(b, true);
    if (time - b.gankSeenAt > 3.5) return endGank(b, false);
    const ls = v.lastSeen(b.gankId);
    if (!ls) return endGank(b, false);
    b.act.moveTo(ls.x, ls.y);
    b.label = 'gank';
    return true;
  }
  b.gankSeenAt = time;
  // 缩回塔下了：放弃
  if (v.enemyStructureCovering(u.pos, 1.5)) return endGank(b, false);
  const d = dist(me.pos, u.pos);
  if (d < 10) {
    // 到位了。优势够的话 combat() 早就开打了；走到这里说明差一口气 —— 再确认一次，不行就撤
    if (b.advantageAt(u.pos.x, u.pos.y) < 1) return endGank(b, false);
    b.act.moveTo(u.pos.x, u.pos.y);
    b.label = 'gank';
    return true;
  }
  // 绕后：朝「目标回家的方向」偏几米切入，把他和他的塔隔开
  const hl = dist(b.foeHome, u.pos) || 1;
  P.x = u.pos.x + ((b.foeHome.x - u.pos.x) / hl) * 4;
  P.y = u.pos.y + ((b.foeHome.y - u.pos.y) / hl) * 4;
  if (!v.walkable(P) || v.enemyStructureCovering(P, 2) || dist(me.pos, P) > d + 6) {
    P.x = u.pos.x;
    P.y = u.pos.y;
  }
  b.travel(P.x, P.y, 2.5);
  b.label = 'gank';
  return true;
}

// ───────────────────────── 清野 ─────────────────────────

export function jungleWork(b: HeroBot): void {
  const v = b.v;
  const me = b.me;
  const time = b.time;
  if (b.gankId >= 0 && gankStep(b)) return;

  const camps = v.state.camps;
  // 手上的营地打到一半就不去 gank(野怪会回血)
  let engaged = false;
  if (b.campId >= 0 && camps[b.campId].alive && dist(me.pos, v.map.camps[b.campId].pos) < 9) {
    for (const m of campMonsters(b, b.campId)) if (m.hp < m.stats.maxHp * 0.97) engaged = true;
  }
  if (!engaged && time >= b.nextGankEval) {
    b.nextGankEval = time + 1;
    const target = evalGank(b);
    if (target) {
      b.gankId = target.id;
      b.gankSince = time;
      b.gankSeenAt = time;
      b.gankedAt.set(target.id, time);
      b.gankLaneAt[b.geo.nearestLane(target.pos.x, target.pos.y)] = time;
      if (gankStep(b)) return;
    }
  }

  const camp = chooseCamp(b);
  if (!camp) {
    // 野区刷干净了：去兵线压力最大的一路帮忙
    let lane = b.brain.pushLane;
    let worst = -1;
    for (const l of ['top', 'mid', 'bot'] as const) {
      const ls = b.brain.lanes[l];
      const pressure = ls.threat + ls.foeHeroes * 0.5;
      if (pressure > worst) {
        worst = pressure;
        lane = l;
      }
    }
    laneWork(b, lane, 'lane');
    return;
  }
  const mons = campMonsters(b, camp.id);
  const d = dist(me.pos, camp.pos);
  if (mons.length === 0) {
    // 还没刷：到营地旁边等
    if (d > 4.5) b.travel(camp.pos.x, camp.pos.y);
    else b.act.halt();
    b.label = 'jungle:wait';
    return;
  }
  if (d > 9) {
    b.travel(camp.pos.x, camp.pos.y);
    b.label = 'jungle:go';
    return;
  }
  if (!v.busy()) waveSkills(b, mons, true);
  b.act.attack(mons[0].id);
  b.label = 'jungle:clear';
}

// ───────────────────────── 史诗野怪 ─────────────────────────

export function epicWork(b: HeroBot, campId: number): void {
  const v = b.v;
  const me = b.me;
  const camp = v.map.camps[campId];
  const mons = campMonsters(b, campId);
  if (!camp || mons.length === 0) {
    b.act.halt();
    b.label = 'epic:none';
    return;
  }
  const mon = mons[0];
  const d = dist(me.pos, camp.pos);
  if (d > 11) {
    // 集合点：营地朝己方基地一侧
    const hl = dist(b.home, camp.pos) || 1;
    b.travel(camp.pos.x + ((b.home.x - camp.pos.x) / hl) * 5, camp.pos.y + ((b.home.y - camp.pos.y) / hl) * 5);
    b.label = 'epic:go';
    return;
  }
  const colossus = camp.monsterType === 'star_colossus';
  const need = colossus ? TUNE.colossusHeroes : TUNE.drakeHeroes;
  const fresh = mon.hp >= mon.stats.maxHp * 0.985;
  if (fresh) {
    // 人到齐再开；由最肉的那个先手(史诗野怪盯着第一个打它的人)
    let here = 1;
    let tankiest = true;
    for (const f of b.friends) {
      if (dist(f.pos, camp.pos) > 12) continue;
      here++;
      if (f.hp > me.hp) tankiest = false;
    }
    if (here < need || !tankiest) {
      if (d > 6) b.act.moveTo(camp.pos.x, camp.pos.y);
      else b.act.halt();
      b.label = 'epic:wait';
      return;
    }
  }
  if (!v.busy()) waveSkills(b, mons, true);
  b.act.attack(mon.id);
  b.label = 'epic:fight';
}

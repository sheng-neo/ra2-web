/**
 * 兵线上的工作：对线(lane) / 抱团推进(push) / 回防(defend) 共用一套流程，区别只在站位和激进程度。
 *
 *   站位锚点(跟着己方小兵前线走，不进无兵扛的塔) → 补刀(预判小兵血量) → 消耗 → 点塔 → 清线/推线 → 回到锚点
 */
import { HEROES } from '../data/heroes';
import { ARMOR_K, TOWER_RULES } from '../data/units';
import type { HeroUnit, LaneId, MinionUnit, Vec2 } from '../types';
import { MOOD_POKE, type HeroBot } from './bot';
import { clamp, dist } from './geom';
import { TUNE } from './params';
import { pokeSkills, waveSkills } from './skills';
import type { LaneState } from './team';

export type LaneKind = 'lane' | 'push' | 'defend';

const A: Vec2 = { x: 0, y: 0 };

interface MinionPick {
  /** 现在出手就能收掉的 */
  kill: MinionUnit | null;
  /** 推线时可以随便打的(血最少的) */
  push: MinionUnit | null;
  /** 马上进入斩杀线、值得等一下的 */
  wait: MinionUnit | null;
}
const PICK: MinionPick = { kill: null, push: null, wait: null };

/** 同路的后排队友(辅助型英雄把补刀让给他) */
function findCarry(b: HeroBot): HeroUnit | null {
  if (!b.style.support) return null;
  for (const f of b.friends) {
    const role = HEROES[f.heroId].role;
    if ((role === 'marksman' || role === 'mage') && dist(f.pos, b.me.pos) < 13) return f;
  }
  return null;
}

/**
 * 在够得着的敌方小兵里挑目标。补刀判定：估算「我的普攻落到它身上时」它还剩多少血
 * (己方小兵/防御塔正在打它的输出 × 我的出手时间)，不高于我一刀的伤害就出手。
 */
function pickMinion(b: HeroBot, carry: HeroUnit | null, alone: boolean): MinionPick {
  PICK.kill = null;
  PICK.push = null;
  PICK.wait = null;
  if (b.foeMinions.length === 0) return PICK;
  const me = b.me;
  const v = b.v;
  const atk = HEROES[b.heroId].basicAttack;
  const range = me.stats.attackRange;
  const interval = 1 / Math.max(0.1, me.stats.attackSpeed);
  const windup = Math.min(interval, 0.7) * atk.windup;
  const projSpeed = atk.projectileSpeed ?? 0;
  const cd = v.attackCooldown();
  const speed = Math.max(1, me.stats.moveSpeed);
  const maxApproach = b.ranged ? 4.5 : 6;
  const tower = b.myStruct;
  let killScore = Infinity;
  let lowHp = Infinity;
  let waitT = Infinity;
  for (const m of b.foeMinions) {
    const d = dist(me.pos, m.pos) - m.radius;
    const approach = Math.max(0, d - range);
    if (approach > maxApproach) continue;
    if (!b.safeToHit(m) || !b.safeFromFoes(m)) continue;
    // 独自面对一波兵：只打已经在打塔的(它们不会转火)，或者已经盯上我的
    if (alone && m.targetId !== me.id && !(tower && m.targetId === tower.id)) continue;
    const k = ARMOR_K / (ARMOR_K + m.stats.armor);
    const dmg = me.stats.ad * k;
    let inc = 0;
    for (const a of b.myMinions) if (a.targetId === m.id) inc += a.stats.ad * a.stats.attackSpeed * k;
    if (tower && tower.targetId === m.id) inc += tower.stats.ad * TOWER_RULES.minionMult * tower.stats.attackSpeed * k;
    const tHit = approach / speed + windup + (projSpeed > 0 ? Math.min(d, range) / projSpeed : 0) + cd;
    const pred = m.hp - inc * tHit;
    const est = dmg * (1 + v.rng.range(-1, 1) * b.prof.lastHitError);
    if (pred <= est) {
      // 辅助：射手正盯着这个兵、或者它还不至于马上被小兵打死 → 让给射手
      if (carry && (carry.targetId === m.id || pred > est * 0.4)) continue;
      const score = pred - (m.minionType === 'siege' || m.minionType === 'super' ? 600 : 0);
      if (score < killScore) {
        killScore = score;
        PICK.kill = m;
      }
      continue;
    }
    if (inc > 0) {
      const t = (m.hp - dmg) / inc - tHit;
      if (t < interval * 1.05 && t < waitT) {
        waitT = t;
        PICK.wait = m;
      }
    }
    if (m.hp < lowHp) {
      lowHp = m.hp;
      PICK.push = m;
    }
  }
  if (PICK.kill && b.prof.lastHitSkip > 0 && v.rng.chance(b.prof.lastHitSkip)) PICK.kill = null;
  return PICK;
}

/** 对线消耗：技能蹭 + 远程普攻点人。返回 true = 下了普攻命令 */
function harass(b: HeroBot, waiting: boolean): boolean {
  if (b.foes.length === 0 || b.adv < TUNE.advPoke || b.inFoeRange) return false;
  if (!b.inMood(MOOD_POKE, b.prof.harass)) return false;
  const me = b.me;
  const v = b.v;
  let t: HeroUnit | null = null;
  let best = Infinity;
  for (const e of b.foes) {
    const d = dist(me.pos, e.pos);
    if (d > 13.5) continue;
    const s = e.hp / e.stats.maxHp + d * 0.03;
    if (s < best) {
      best = s;
      t = e;
    }
  }
  if (!t) return false;
  if (!v.busy() && pokeSkills(b, t)) b.label = 'poke';
  if (waiting) return false;
  const d = dist(me.pos, t.pos) - t.radius;
  const range = me.stats.attackRange;
  // 身边会被引来的敌方小兵太多就不用普攻换血(点一下就走，挨不了几下；大波兵才需要忌惮)
  const tolerate = 3 + Math.floor(me.level / 3);
  if (b.aggroMinions > tolerate || !b.safeToHit(t)) return false;
  if (b.ranged ? d <= range + 0.8 && v.attackCooldown() <= 0.25 : d <= range + 0.3 && b.adv >= 1) {
    b.act.attack(t.id);
    b.label = 'harass';
    return true;
  }
  return false;
}

/** 点塔：有兵扛、塔没盯着我、附近打得过 */
function siege(b: HeroBot, ls: LaneState): boolean {
  const T = ls.foeStruct;
  if (T.invulnerable || b.foeStruct !== T) return false;
  if (b.foeStructD - T.radius > b.me.stats.attackRange + 6) return false;
  if (b.tankers === 0 || b.tankHp < 450 || b.towerOnMe) return false;
  if (b.foes.length > 0 && b.adv < 0.95) return false;
  b.act.attack(T.id);
  b.label = 'siege';
  return true;
}

/** 抱团推进时人到齐了没有(对面快死光了就不用等) */
function groupReady(b: HeroBot, lane: LaneId): boolean {
  const brain = b.brain;
  if (brain.aliveFoes <= 1) return true;
  const want = Math.min(TUNE.groupMin, brain.pushers(b.v, lane));
  return b.friendsNear + 1 >= want;
}

export function laneWork(b: HeroBot, lane: LaneId, kind: LaneKind): void {
  const me = b.me;
  const geo = b.geo;
  const team = b.team;
  const ls = b.brain.lanes[lane];
  const range = me.stats.attackRange;
  const T = ls.foeStruct;
  const tr = T.stats.attackRange;
  const total = geo.total(lane);
  const myP = geo.prog(team, lane, me.pos.x, me.pos.y);
  const carry = kind === 'lane' ? findCarry(b) : null;

  // ── 站位锚点 ──
  const back = b.ranged ? Math.max(2.5, range - 2.2) : b.style.support ? 1.6 : 1;
  const fa = ls.allyFront >= ls.ownP - 6 ? ls.allyFront : -1;
  const fe = ls.enemyFront;
  // 没有兵线时的等候点：不退回塔下傻等，也不越过河道
  const hold = clamp(myP, ls.ownP + 2.5, Math.max(ls.ownP + 2.5, total * 0.5 - 4));
  let anchorP: number;
  if (kind === 'defend') {
    anchorP = ls.ownP - 1.5;
    // 敌方兵线快到塔下了：迎上去，在塔的掩护里清兵
    if (fe >= 0 && fe < ls.ownP + 9) anchorP = Math.min(fe - back, ls.ownP + 3);
  } else if (fa >= 0) {
    const clash = fe >= 0 && Math.abs(fe - fa) < 12 ? (fa + fe) * 0.5 : fa + 0.5;
    anchorP = clash - back;
    // 己方下一波兵还在身后、敌方兵线也没到：原地(最多退到河道前)等它上来，不走回头路去接兵
    if (anchorP < myP - 3 && (fe < 0 || fe - myP > 10)) anchorP = Math.max(anchorP, Math.min(myP, hold));
  } else if (fe >= 0) {
    anchorP = Math.min(fe - back - 1.5, hold);
  } else {
    anchorP = hold;
  }
  const threatened = b.respect;
  // 身边没有己方小兵时不单挑一整波兵(小兵会全部转火英雄)：退到小兵仇恨范围外，等它们去打塔或者己方兵线上来
  const alone = b.myMinions.length === 0 && b.foeMinions.length >= 3;
  if (alone && fe >= 0) anchorP = Math.min(anchorP, fe > ls.ownP + 7 ? fe - TUNE.minionAggro - 1.5 : ls.ownP - 3);
  // 与敌方英雄保持距离：不占优时不站在对方普攻射程里白挨打；被压制(respect)时退到对方突进也够不着的地方
  if (b.adv < 1.15) {
    for (const e of b.foes) {
      const eP = geo.prog(team, lane, e.pos.x, e.pos.y);
      if (geo.lateral > 9 || eP < myP - 2) continue;
      const keep = b.respect ? b.threatReach(e) + 1 : e.stats.attackRange + e.radius + me.radius + 0.8;
      if (anchorP > eP - keep) anchorP = eP - keep;
    }
  }
  // 简单难度：对线期很少越过河道
  if (kind === 'lane' && b.prof.harass < 0.3) anchorP = Math.min(anchorP, total * 0.5 + 3);
  // 抱团推进：人没到齐不越过集合线
  if (kind === 'push' && anchorP > ls.foeP - tr - 9 && !groupReady(b, lane)) anchorP = ls.foeP - tr - 9;
  // 不进敌方建筑射程，除非有兵扛着且塔没盯着我
  const tankOk = b.foeStruct === T ? b.tankers > 0 && b.tankHp > 450 && !b.towerOnMe : ls.atFoeStruct;
  if (!tankOk) anchorP = Math.min(anchorP, ls.foeP - (tr + TUNE.towerMargin + 0.8));
  anchorP = Math.max(anchorP, ls.ownP - 4);
  geo.point(team, lane, anchorP, A, b.side);
  const dA = dist(me.pos, A);

  // ── 赶路 ──
  if (dA > 17) {
    // 回防路途遥远、而从泉水出发近得多：直接回城再过去
    if (kind === 'defend' && dA > 60 && dist(b.home, A) < dA - 35 && b.recallNow()) {
      b.label = 'defend:recall';
      return;
    }
    b.travel(A.x, A.y);
    b.label = `${kind}:go`;
    return;
  }

  // ── 小兵 ──
  const support = carry !== null;
  // 强推：清兵不等刀、舍得用技能
  const hardPush = kind !== 'lane' || ls.foeHeroes === 0 || b.adv >= 1.3 || ls.threatMinions > 0;
  const pick = pickMinion(b, carry, alone);
  if (pick.kill) {
    b.act.attack(pick.kill.id);
    b.label = `${kind}:lasthit`;
    return;
  }
  const waiting = pick.wait !== null && !hardPush;
  if (harass(b, waiting)) return;
  if (siege(b, ls)) return;
  if (hardPush && !support && !b.v.busy() && b.foeMinions.length >= 3) waveSkills(b, b.foeMinions, false);
  if (pick.push && !support && !threatened && !waiting) {
    b.act.attack(pick.push.id);
    b.label = `${kind}:push`;
    return;
  }

  // ── 站位 ──
  if (waiting && pick.wait) {
    // 等刀：凑到够得着的位置站好
    const m = pick.wait;
    const d = dist(me.pos, m.pos) - m.radius;
    if (d > range - 0.3) b.act.moveTo(m.pos.x, m.pos.y);
    else b.act.halt();
    b.label = `${kind}:wait`;
    return;
  }
  if (dA > 1.5) b.act.moveTo(A.x, A.y);
  else b.act.halt();
  b.label = threatened ? `${kind}:zoned` : alone ? `${kind}:wait-wave` : `${kind}:hold`;
}

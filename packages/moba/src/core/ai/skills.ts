/**
 * 技能层：五位英雄各自的连招与释放条件。
 *
 * 对外五个入口，由战术层在不同场合调用，每次最多下一条施法命令：
 *   fightSkills  全力交战(连招)          pokeSkills   对线消耗(留蓝)
 *   finisherSkills 补一个技能收残血      waveSkills   清兵/打野
 *   escapeSkills 逃生位移
 * 瞄准统一走 lead()：按目标速度预判，难度档案决定预判比例与角度误差(不用引擎的自动瞄准，否则各难度一样准)。
 */
import { HEROES, skillValue } from '../data/heroes';
import { estimateSkillDamage, SKILL_INTENTS } from '../skills/intents';
import { TICK_DT, type AbilitySlot, type HeroUnit, type Unit, type Vec2 } from '../types';
import type { HeroBot } from './bot';
import { dist } from './geom';
import { TUNE } from './params';

const P: Vec2 = { x: 0, y: 0 };
const Q: Vec2 = { x: 0, y: 0 };

function has(u: Unit, id: string): boolean {
  for (let i = 0; i < u.buffs.length; i++) if (u.buffs[i].id === id) return true;
  return false;
}

/** 目标正被硬控/减速：延迟技能这时放最稳 */
function pinned(u: Unit): number {
  let t = 0;
  for (let i = 0; i < u.buffs.length; i++) {
    const b = u.buffs[i];
    if (b.id === 'stun' || b.id === 'airborne' || b.id === 'root') t = Math.max(t, b.timeLeft);
  }
  return t;
}

function slowed(u: Unit): boolean {
  return has(u, 'slow');
}

/** 可以出手：技能就绪 + 连招节奏(手速) + 不打断正在抬手的普攻(urgent 除外) */
function can(b: HeroBot, slot: AbilitySlot, urgent = false): boolean {
  if (!b.v.skillReady(slot)) return false;
  if (urgent) return true;
  if (b.time - b.act.lastCastAt < b.prof.comboGap) return false;
  return !b.v.attackWindup();
}

/** 放完这个技能后法力还剩多少比例 */
function manaAfter(b: HeroBot, slot: AbilitySlot): number {
  return (b.me.mana - b.me.skills[slot].cost) / Math.max(1, b.me.stats.maxMana);
}

/**
 * 预判：目标在 delay + 距离/speed 秒后的位置，写入 out。
 * 冲刺/被击飞中的目标不外推(速度是假的)。
 */
export function lead(b: HeroBot, t: Unit, delay: number, speed: number, out: Vec2): Vec2 {
  const me = b.me;
  let vx = (t.pos.x - t.prevPos.x) / TICK_DT;
  let vy = (t.pos.y - t.prevPos.y) / TICK_DT;
  const sp = Math.hypot(vx, vy);
  if (sp > 12 || pinned(t) > 0.05) {
    vx = 0;
    vy = 0;
  }
  let time = delay;
  if (speed > 0) time += Math.hypot(t.pos.x - me.pos.x, t.pos.y - me.pos.y) / speed;
  // 目标被定住的时间里不会动
  time = Math.min(1, time) * b.prof.aimLead;
  out.x = t.pos.x + vx * time;
  out.y = t.pos.y + vy * time;
  return out;
}

/** 朝某点放方向技能（带难度误差） */
function castToward(b: HeroBot, slot: AbilitySlot, p: Vec2): void {
  const me = b.me;
  const a = Math.atan2(p.y - me.pos.y, p.x - me.pos.x) + b.v.rng.range(-1, 1) * b.prof.aimError;
  b.act.castDir(slot, Math.cos(a), Math.sin(a));
}

/** 在某点放范围技能（误差随距离放大） */
function castOn(b: HeroBot, slot: AbilitySlot, p: Vec2): void {
  const me = b.me;
  const d = Math.hypot(p.x - me.pos.x, p.y - me.pos.y);
  const err = d * b.prof.aimError;
  const a = b.v.rng.range(0, Math.PI * 2);
  const r = b.v.rng.next() * err;
  Q.x = p.x + Math.cos(a) * r;
  Q.y = p.y + Math.sin(a) * r;
  b.act.castAt(slot, Q);
}

/** 以 center 为圆心 radius 内有几个敌方英雄（按预判位置） */
function heroesIn(b: HeroBot, center: Vec2, radius: number, delay: number): number {
  let n = 0;
  for (const e of b.foes) {
    lead(b, e, delay, 0, P);
    if (Math.hypot(P.x - center.x, P.y - center.y) <= radius + e.radius * 0.5) n++;
  }
  return n;
}

/**
 * 范围技能的最佳落点：在「主目标的预判点」和「它与其他敌人的中点」里挑覆盖英雄最多的。写入 out，返回覆盖数。
 */
function bestCircle(b: HeroBot, t: HeroUnit, radius: number, range: number, delay: number, out: Vec2): number {
  const me = b.me;
  lead(b, t, delay, 0, out);
  let best = heroesIn(b, out, radius, delay);
  const bx = out.x;
  const by = out.y;
  for (const e of b.foes) {
    if (e === t) continue;
    lead(b, e, delay, 0, P);
    const cx = (bx + P.x) * 0.5;
    const cy = (by + P.y) * 0.5;
    // 中点必须仍然罩得住主目标，且够得着
    if (Math.hypot(cx - bx, cy - by) > radius * 0.8) continue;
    if (Math.hypot(cx - me.pos.x, cy - me.pos.y) > range) continue;
    Q.x = cx;
    Q.y = cy;
    const n = heroesIn(b, Q, radius, delay);
    if (n > best) {
      best = n;
      out.x = cx;
      out.y = cy;
    }
  }
  return best;
}

/** me → to 的直线上(半宽 width)有没有敌方小兵/野怪挡路 */
function blocked(b: HeroBot, to: Vec2, width: number): boolean {
  const me = b.me;
  const dx = to.x - me.pos.x;
  const dy = to.y - me.pos.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return false;
  const ux = dx / len;
  const uy = dy / len;
  for (const m of b.foeMinions) {
    const rx = m.pos.x - me.pos.x;
    const ry = m.pos.y - me.pos.y;
    const along = rx * ux + ry * uy;
    if (along < 0.3 || along > len - 0.3) continue;
    if (Math.abs(rx * uy - ry * ux) < width + m.radius) return true;
  }
  return false;
}

/** 一组单位的重心写入 out；返回离重心 radius 内的数量 */
function centroid(units: readonly Unit[], radius: number, out: Vec2): number {
  if (units.length === 0) return 0;
  let x = 0;
  let y = 0;
  for (const u of units) {
    x += u.pos.x;
    y += u.pos.y;
  }
  out.x = x / units.length;
  out.y = y / units.length;
  let n = 0;
  for (const u of units) if (Math.hypot(u.pos.x - out.x, u.pos.y - out.y) <= radius + u.radius) n++;
  return n;
}

/** 从我出发、朝 (dx,dy) 的直线(半宽 width、长 range)能穿到几个单位 */
function lineCount(b: HeroBot, units: readonly Unit[], dx: number, dy: number, range: number, width: number): number {
  const me = b.me;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  let n = 0;
  for (const u of units) {
    const rx = u.pos.x - me.pos.x;
    const ry = u.pos.y - me.pos.y;
    const along = rx * ux + ry * uy;
    if (along < 0 || along > range + u.radius) continue;
    if (Math.abs(rx * uy - ry * ux) <= width + u.radius) n++;
  }
  return n;
}

/** 朝 (dx,dy) 冲 distance 米，落点是否可走、且不扎进敌方建筑射程 */
function dashSafe(b: HeroBot, dx: number, dy: number, distance: number): boolean {
  const me = b.me;
  P.x = me.pos.x + dx * distance;
  P.y = me.pos.y + dy * distance;
  if (!b.v.lineClear(me.pos, P)) return false;
  return b.diving || b.v.enemyStructureCovering(P, TUNE.towerMargin) === null;
}

function val(b: HeroBot, slot: AbilitySlot, key: string): number {
  return skillValue(HEROES[b.heroId].skills[slot], key, Math.max(1, b.me.skills[slot].level));
}

// ───────────────────────── 全力交战 ─────────────────────────

/** 对目标 t 打连招。返回 true = 这次思考放了一个技能 */
export function fightSkills(b: HeroBot, t: HeroUnit): boolean {
  const me = b.me;
  const d = dist(me.pos, t.pos);
  const hpR = t.hp / t.stats.maxHp;
  switch (b.heroId) {
    case 'panyue': {
      // 大招进场：能砸到两个，或者单抓一个有把握的
      if (can(b, 'ult') && d <= 13 && d > 3) {
        const spec = SKILL_INTENTS.panyue.ult;
        const n = bestCircle(b, t, spec.aoeRadius, 9.5, spec.delay, P);
        if (n >= 2 || (n >= 1 && (hpR < 0.6 || b.fightAdv >= 1.5 || b.friendsNear >= 1))) {
          if (b.diving || b.v.enemyStructureCovering(P, 0) === null) {
            castOn(b, 'ult', P);
            return true;
          }
        }
      }
      // 冲撞击飞：目标还被控着就先留着，等控制快结束再接上
      // 贴身时也放：冲撞本身有伤害，还能接上一段击飞
      if (can(b, 's1') && d <= 9.6 && pinned(t) < 0.35) {
        lead(b, t, 0, val(b, 's1', 'dashSpeed'), P);
        castToward(b, 's1', P);
        return true;
      }
      if (can(b, 's2') && (d <= 4.3 + t.radius || (b.hpR < 0.55 && b.heroesOnMe > 0))) {
        b.act.castSelf('s2');
        return true;
      }
      return false;
    }
    case 'chijin': {
      const ember = has(me, 'chijin_ember');
      const inMelee = d <= me.stats.attackRange + t.radius + 0.4;
      // 余烬在身且够得着：先把这下强化普攻打出去再放下一个技能
      const weave = ember && inMelee && b.v.attackCooldown() < 0.35 && !has(me, 'chijin_spin');
      if (can(b, 's2') && d > 3.2 && d <= 8.2) {
        lead(b, t, 0, val(b, 's2', 'dashSpeed'), P);
        const dx = P.x - me.pos.x;
        const dy = P.y - me.pos.y;
        const l = Math.hypot(dx, dy) || 1;
        if (dashSafe(b, dx / l, dy / l, Math.min(5.5, l))) {
          castToward(b, 's2', P);
          return true;
        }
      }
      if (weave) return false;
      if (can(b, 'ult') && d <= 4.4) {
        let n = 0;
        for (const e of b.foes) if (dist(me.pos, e.pos) <= 4.2 + e.radius) n++;
        if (n >= 2 || hpR < 0.7 || b.fightAdv >= 1.4 || b.hpR < 0.5) {
          b.act.castSelf('ult');
          return true;
        }
      }
      if (can(b, 's1') && d <= 5.4) {
        lead(b, t, 0.1, 0, P);
        castToward(b, 's1', P);
        return true;
      }
      // 已经贴身：炎步的攻速也是输出(穿过去再回头砍)
      if (can(b, 's2') && inMelee && !ember && hpR > 0.25 && b.me.skills.s1.cd > 1.5) {
        const dx = t.pos.x - me.pos.x;
        const dy = t.pos.y - me.pos.y;
        const l = Math.hypot(dx, dy) || 1;
        if (dashSafe(b, dx / l, dy / l, 5.5)) {
          b.act.castDir('s2', dx / l, dy / l);
          return true;
        }
      }
      return false;
    }
    case 'xingli': {
      const pin = pinned(t);
      if (can(b, 's2') && d <= 12) {
        const spec = SKILL_INTENTS.xingli.s2;
        // 贴脸的近战：放在自己和他之间自保
        if (d < 4.5 && t.stats.attackRange < 4) {
          P.x = (me.pos.x + t.pos.x) * 0.5;
          P.y = (me.pos.y + t.pos.y) * 0.5;
          castOn(b, 's2', P);
          return true;
        }
        bestCircle(b, t, spec.aoeRadius, 9, spec.delay, P);
        if (Math.hypot(P.x - me.pos.x, P.y - me.pos.y) <= 9 + spec.aoeRadius * 0.5) {
          castOn(b, 's2', P);
          return true;
        }
      }
      if (can(b, 'ult') && d <= 15) {
        const spec = SKILL_INTENTS.xingli.ult;
        const n = bestCircle(b, t, spec.aoeRadius, 11, spec.delay + 0.3, P);
        if (n >= 2 || (n >= 1 && (pin > 0.2 || slowed(t) || hpR < 0.6 || b.fightAdv >= 1.4))) {
          castOn(b, 'ult', P);
          return true;
        }
      }
      if (can(b, 's1') && d <= 12.2) {
        lead(b, t, 0.08, val(b, 's1', 'speed'), P);
        castToward(b, 's1', P);
        return true;
      }
      return false;
    }
    case 'fengling': {
      // 被近战贴脸：翻跃拉开(朝远离他、且安全的方向)
      if (can(b, 's2', true) && b.nearFoe && b.nearFoeD < 3.4 && b.nearFoe.stats.attackRange < 4) {
        if (escapeDash(b, 's2', me.pos.x - b.nearFoe.pos.x, me.pos.y - b.nearFoe.pos.y, 5)) return true;
      }
      if (can(b, 's1') && d <= 13.2) {
        lead(b, t, 0.12, val(b, 's1', 'speed'), P);
        castToward(b, 's1', P);
        return true;
      }
      if (can(b, 'ult') && d <= 15) {
        const spec = SKILL_INTENTS.fengling.ult;
        const n = bestCircle(b, t, spec.aoeRadius, 11.5, spec.delay + 0.3, P);
        if (n >= 2 || (n >= 1 && (slowed(t) || pinned(t) > 0.2 || hpR < 0.55 || b.fightAdv >= 1.4))) {
          castOn(b, 'ult', P);
          return true;
        }
      }
      // 追残血：翻过去补一发必暴
      const reach = me.stats.attackRange + t.radius;
      if (can(b, 's2') && d > reach + 0.5 && d < reach + 5 && hpR < 0.3 && b.fightAdv >= 1.2) {
        const dx = t.pos.x - me.pos.x;
        const dy = t.pos.y - me.pos.y;
        const l = Math.hypot(dx, dy) || 1;
        if (dashSafe(b, dx / l, dy / l, 5)) {
          b.act.castDir('s2', dx / l, dy / l);
          return true;
        }
      }
      return false;
    }
    case 'yeque': {
      // 处决：大招能直接带走，或者目标已残且别的技能都交了
      if (can(b, 'ult') && d <= 8.4 && t.alive) {
        const est = estimateSkillDamage(me, 'ult', t);
        const left = t.hp + t.shield;
        if (est >= left * 0.9 || (hpR < 0.45 && est >= left * 0.6 && me.skills.s1.cd > 0.5)) {
          b.act.castTarget('ult', t.id);
          return true;
        }
      }
      if (can(b, 's2') && d <= 8.4) {
        lead(b, t, 0.06, val(b, 's2', 'speed'), P);
        if (d < 4.2 || !blocked(b, P, 0.5)) {
          castToward(b, 's2', P);
          return true;
        }
      }
      if (can(b, 's1') && d <= 7.6 && d > 1.2) {
        lead(b, t, 0, val(b, 's1', 'dashSpeed'), P);
        const dx = P.x - me.pos.x;
        const dy = P.y - me.pos.y;
        const l = Math.hypot(dx, dy) || 1;
        if (dashSafe(b, dx / l, dy / l, Math.min(6.5, l + 1))) {
          castToward(b, 's1', P);
          return true;
        }
      }
      return false;
    }
  }
}

// ───────────────────────── 收人头 ─────────────────────────

/**
 * 补一个技能就能带走的残血：不管当前是不是在全力交战，够得着就出手(不留蓝)。
 * 只用「隔着距离也能打到」的技能，位移技能只在落点安全时用。返回 true = 放了技能。
 */
export function finisherSkills(b: HeroBot, t: HeroUnit): boolean {
  const me = b.me;
  const d = dist(me.pos, t.pos);
  const left = (t.hp + t.shield) * 1.08;
  const kills = (slot: AbilitySlot, hits?: number): boolean => can(b, slot) && estimateSkillDamage(me, slot, t, hits) >= left;
  switch (b.heroId) {
    case 'panyue':
      if (d <= 9.4 && kills('s1')) {
        lead(b, t, 0, val(b, 's1', 'dashSpeed'), P);
        const l = Math.hypot(P.x - me.pos.x, P.y - me.pos.y) || 1;
        if (dashSafe(b, (P.x - me.pos.x) / l, (P.y - me.pos.y) / l, Math.min(7.5, l))) {
          castToward(b, 's1', P);
          return true;
        }
      }
      return false;
    case 'chijin':
      if (d <= 5.3 && kills('s1')) {
        lead(b, t, 0.1, 0, P);
        castToward(b, 's1', P);
        return true;
      }
      if (d <= 6.3 && kills('s2')) {
        lead(b, t, 0, val(b, 's2', 'dashSpeed'), P);
        const l = Math.hypot(P.x - me.pos.x, P.y - me.pos.y) || 1;
        if (dashSafe(b, (P.x - me.pos.x) / l, (P.y - me.pos.y) / l, 5.5)) {
          castToward(b, 's2', P);
          return true;
        }
      }
      return false;
    case 'xingli':
      if (d <= 12.2 && kills('s1')) {
        lead(b, t, 0.08, val(b, 's1', 'speed'), P);
        castToward(b, 's1', P);
        return true;
      }
      return false;
    case 'fengling':
      if (d <= 13.6 && kills('s1')) {
        lead(b, t, 0.12, val(b, 's1', 'speed'), P);
        castToward(b, 's1', P);
        return true;
      }
      return false;
    case 'yeque':
      if (d <= 8.4 && kills('s2', 1)) {
        lead(b, t, 0.06, val(b, 's2', 'speed'), P);
        if (!blocked(b, P, 0.5)) {
          castToward(b, 's2', P);
          return true;
        }
      }
      // 处决会把自己送到目标身后：那边不能是塔下，也不能是一群人中间
      if (d <= 8.3 && kills('ult') && (b.diving || b.v.enemyStructureCovering(t.pos, 0.5) === null) && b.advantageAt(t.pos.x, t.pos.y) >= 0.8) {
        b.act.castTarget('ult', t.id);
        return true;
      }
      return false;
  }
}

// ───────────────────────── 对线消耗 ─────────────────────────

/** 远距离蹭一下：只用消耗型技能，并且放完还留得出一套的蓝 */
export function pokeSkills(b: HeroBot, t: HeroUnit): boolean {
  const me = b.me;
  const d = dist(me.pos, t.pos);
  switch (b.heroId) {
    case 'panyue':
      if (can(b, 's2') && d <= 4 + t.radius && manaAfter(b, 's2') >= TUNE.pokeMana) {
        b.act.castSelf('s2');
        return true;
      }
      return false;
    case 'chijin':
      if (can(b, 's1') && d <= 5.2 && manaAfter(b, 's1') >= TUNE.pokeMana) {
        lead(b, t, 0.1, 0, P);
        castToward(b, 's1', P);
        return true;
      }
      return false;
    case 'xingli':
      if (can(b, 's1') && d <= 11.6 && manaAfter(b, 's1') >= TUNE.pokeMana) {
        lead(b, t, 0.08, val(b, 's1', 'speed'), P);
        castToward(b, 's1', P);
        return true;
      }
      if (can(b, 's2') && d <= 9 && manaAfter(b, 's2') >= 0.5 && (slowed(t) || pinned(t) > 0.2)) {
        lead(b, t, SKILL_INTENTS.xingli.s2.delay, 0, P);
        castOn(b, 's2', P);
        return true;
      }
      return false;
    case 'fengling':
      if (can(b, 's1') && d <= 12.8 && manaAfter(b, 's1') >= TUNE.pokeMana) {
        lead(b, t, 0.12, val(b, 's1', 'speed'), P);
        castToward(b, 's1', P);
        return true;
      }
      return false;
    case 'yeque':
      if (can(b, 's2') && d <= 8 && manaAfter(b, 's2') >= TUNE.pokeMana) {
        lead(b, t, 0.06, val(b, 's2', 'speed'), P);
        if (!blocked(b, P, 0.5)) {
          castToward(b, 's2', P);
          return true;
        }
      }
      return false;
  }
}

// ───────────────────────── 清兵 / 打野 ─────────────────────────

/**
 * 对一群非英雄单位(小兵/野怪)用范围技能。jungle = 打野(法力门槛更低、单体也放)。
 * 只在能打到足够多目标时才放，不把技能浪费在一两个满血小兵上。
 */
export function waveSkills(b: HeroBot, units: readonly Unit[], jungle: boolean): boolean {
  if (units.length === 0) return false;
  const me = b.me;
  const floor = jungle ? TUNE.jungleMana : TUNE.waveclearMana;
  const need = jungle ? 1 : 3;
  const cheap = (slot: AbilitySlot): boolean => can(b, slot) && manaAfter(b, slot) >= floor;
  const first = units[0];
  switch (b.heroId) {
    case 'panyue': {
      if (!cheap('s2')) return false;
      let n = 0;
      for (const u of units) if (dist(me.pos, u.pos) <= 4.5 + u.radius) n++;
      if (n >= need + (jungle ? 0 : 1)) {
        b.act.castSelf('s2');
        return true;
      }
      return false;
    }
    case 'chijin': {
      if (!cheap('s1')) return false;
      const n = centroid(units, 4, P);
      if (n >= need && dist(me.pos, P) <= 4.5) {
        b.act.castDir('s1', P.x - me.pos.x, P.y - me.pos.y);
        return true;
      }
      return false;
    }
    case 'xingli': {
      if (cheap('s1')) {
        centroid(units, 4, P);
        const dx = P.x - me.pos.x;
        const dy = P.y - me.pos.y;
        if (Math.hypot(dx, dy) <= 11 && lineCount(b, units, dx, dy, 12, 0.65) >= need) {
          b.act.castDir('s1', dx, dy);
          return true;
        }
      }
      if (can(b, 's2') && manaAfter(b, 's2') >= floor + 0.1) {
        const n = centroid(units, 3.4, P);
        if (n >= need + 1 && dist(me.pos, P) <= 9) {
          b.act.castAt('s2', P);
          return true;
        }
      }
      return false;
    }
    case 'fengling': {
      if (!cheap('s1')) return false;
      centroid(units, 4, P);
      const dx = P.x - me.pos.x;
      const dy = P.y - me.pos.y;
      if (Math.hypot(dx, dy) <= 12 && lineCount(b, units, dx, dy, 14, 0.65) >= need) {
        b.act.castDir('s1', dx, dy);
        return true;
      }
      return false;
    }
    case 'yeque': {
      // 飞刃贴脸三枚全中；瞬影斩穿过一排
      if (cheap('s2') && dist(me.pos, first.pos) <= 3.6 + first.radius) {
        b.act.castDir('s2', first.pos.x - me.pos.x, first.pos.y - me.pos.y);
        return true;
      }
      if (cheap('s1')) {
        centroid(units, 4, P);
        const dx = P.x - me.pos.x;
        const dy = P.y - me.pos.y;
        const l = Math.hypot(dx, dy);
        if (l > 0.8 && l <= 6 && lineCount(b, units, dx, dy, 6.5, 1) >= need && dashSafe(b, dx / l, dy / l, 6.5)) {
          b.act.castDir('s1', dx, dy);
          return true;
        }
      }
      return false;
    }
  }
}

// ───────────────────────── 逃生 ─────────────────────────

/** 朝 (dx,dy) 附近找一个能冲出去的方向并施放位移技能 */
function escapeDash(b: HeroBot, slot: AbilitySlot, dx: number, dy: number, distance: number): boolean {
  const base = Math.atan2(dy, dx);
  for (const off of [0, 0.5, -0.5, 1, -1]) {
    const a = base + off;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    P.x = b.me.pos.x + ux * distance;
    P.y = b.me.pos.y + uy * distance;
    if (!b.v.lineClear(b.me.pos, P)) continue;
    if (b.v.enemyStructureCovering(P, 0) !== null) continue;
    b.act.castDir(slot, ux, uy);
    return true;
  }
  return false;
}

/**
 * 逃生：朝 (dx,dy)(通常是回家的方向) 交位移；追兵贴得近时顺手留一个减速。
 * 返回 true = 放了技能。
 */
export function escapeSkills(b: HeroBot, dx: number, dy: number): boolean {
  const chaser = b.nearFoe;
  const close = chaser !== null && b.nearFoeD < 7;
  switch (b.heroId) {
    case 'panyue':
      if (close && can(b, 's2', true) && b.nearFoeD < 4.5) {
        b.act.castSelf('s2');
        return true;
      }
      if (can(b, 's1', true) && escapeDash(b, 's1', dx, dy, 7.5)) return true;
      if (b.hpR < 0.25 && can(b, 'ult', true)) {
        const l = Math.hypot(dx, dy) || 1;
        P.x = b.me.pos.x + (dx / l) * 9.5;
        P.y = b.me.pos.y + (dy / l) * 9.5;
        const to = b.v.nearestWalkable(P);
        if (b.v.enemyStructureCovering(to, 0) === null) {
          b.act.castAt('ult', to);
          return true;
        }
      }
      return false;
    case 'chijin':
      return can(b, 's2', true) && escapeDash(b, 's2', dx, dy, 5.5);
    case 'xingli':
      if (close && chaser && can(b, 's2', true)) {
        // 星环放在追兵脚下偏向自己一点：拉 + 减速
        P.x = chaser.pos.x + (b.me.pos.x - chaser.pos.x) * 0.3;
        P.y = chaser.pos.y + (b.me.pos.y - chaser.pos.y) * 0.3;
        b.act.castAt('s2', P);
        return true;
      }
      return false;
    case 'fengling':
      if (can(b, 's2', true) && escapeDash(b, 's2', dx, dy, 5)) return true;
      if (close && chaser && can(b, 's1', true) && b.hpR > 0.2) {
        lead(b, chaser, 0.12, val(b, 's1', 'speed'), P);
        castToward(b, 's1', P);
        return true;
      }
      return false;
    case 'yeque':
      return can(b, 's1', true) && escapeDash(b, 's1', dx, dy, 6.5);
  }
}

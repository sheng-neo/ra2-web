/**
 * 战斗：伤害公式、治疗、死亡、普攻循环(前摇 → 结算/出弹 → 后摇)。
 *
 * 伤害：实际 = 原始 × ARMOR_K / (ARMOR_K + 护甲 × (1 − 穿透))；法术用法抗/法穿；真实伤害不减免。
 * 护盾先于生命扣除。暴击与吸血只作用于普攻(kind='basic')。
 */
import { setAction } from './anim';
import { absorbShield, addBuff, clearBuffs, findBuff, hasBuff, removeBuff } from './buffs';
import { ARMOR_K, ENDGAME, MONSTER_RULES, TOWER_RULES, VISION } from './data/units';
import { canTarget, isStructure } from './entity';
import {
  MAX_ATTACK_ANIM,
  type BasicAttackMod, type DamageInfo, type DamageKind, type SimBuff, type SimHero, type SimProjectile, type SimUnit,
} from './internal';
import { monsterAggro, onMonsterKilled } from './monsters';
import { cancelDash, faceTo, moveToward, stopMove } from './movement';
import { spawnHomingProjectile } from './projectiles';
import { onHeroKilled, onMinionKilled, resolveHeroKiller } from './rewards';
import { onCoreKilled, onTowerKilled } from './structures';
import type { DamageType, FxKey, SkillSlot } from './types';
import type { Sim } from './world';

/** 前摇期间目标可以跑出射程多远而不取消这次出手 */
const WINDUP_LEEWAY = 2;
/** 红buff的灼烧/减速时长 */
const EMBER_BURN_TIME = 2;
const EMBER_SLOW_TIME = 1;
const BURN_TICK = 0.5;
/** 塔的连击增伤 buff 持续时间（超过这个时间没被同一座塔打到就清零） */
const TOWER_FOCUS_TIME = 3;
/** 多个减伤叠乘后的下限(最多减 80%) */
const MIN_DAMAGE_TAKEN = 0.2;

// ───────────────────────── 伤害 / 治疗 ─────────────────────────

/**
 * 造成一次伤害，返回实际造成的量(扣血 + 扣盾)。
 * source 可为 null(环境/发射者已消失)。kind 决定触发哪些钩子，见 DamageKind。
 */
export function dealDamage(
  sim: Sim, source: SimUnit | null, target: SimUnit, amount: number, dtype: DamageType,
  kind: DamageKind = 'skill', slot: SkillSlot | null = null, crit = false,
): number {
  const st = sim.state;
  if (st.over || !target.alive || !(amount > 0)) return 0;
  if (target.invulnerable || target.rt.untargetable) return 0;
  const time = st.time;
  const info: DamageInfo = { amount, dtype, kind, slot, crit };

  // 出伤方修正
  if (source && source.kind === 'hero') {
    const hooks = source.h.hooks;
    for (let i = 0; i < hooks.length; i++) {
      const hk = hooks[i];
      if (hk.modifyDamageDealt) hk.modifyDamageDealt(sim, source, target, info);
    }
    if (st.teams[source.team].blessingLeft > 0 && hasBuff(source, 'star_blessing')) info.amount *= 1 + MONSTER_RULES.blessingDamage;
  }
  // 受伤方修正
  if (target.kind === 'hero') {
    const hooks = target.h.hooks;
    for (let i = 0; i < hooks.length; i++) {
      const hk = hooks[i];
      if (hk.modifyDamageTaken) hk.modifyDamageTaken(sim, target, source, info);
    }
  } else if (isStructure(target)) {
    if (target.rt.backdoor) info.amount *= 1 - TOWER_RULES.backdoorReduction;
    // 终局加速：拖得越久建筑越脆
    if (time > ENDGAME.start) info.amount *= 1 + ((time - ENDGAME.start) / 60) * ENDGAME.structureVulnPerMin;
  }
  let taken = 1;
  const tb = target.buffs;
  for (let i = 0; i < tb.length; i++) {
    if (tb[i].id === 'dmg_reduction') taken *= 1 - Math.min(1, Math.max(0, tb[i].value));
  }
  if (taken < 1) info.amount *= Math.max(MIN_DAMAGE_TAKEN, taken);

  // 护甲 / 法抗
  let dmg = info.amount;
  if (dtype === 'physical') {
    const armor = target.stats.armor * (1 - (source ? source.stats.armorPen : 0));
    dmg *= ARMOR_K / (ARMOR_K + Math.max(0, armor));
  } else if (dtype === 'magic') {
    const mr = target.stats.mr * (1 - (source ? source.stats.magicPen : 0));
    dmg *= ARMOR_K / (ARMOR_K + Math.max(0, mr));
  }
  if (!(dmg > 0)) return 0;

  // 护盾 → 生命
  const toHp = target.shield > 0 ? absorbShield(sim, target, dmg) : dmg;
  const hpLoss = Math.min(target.hp, toHp);
  target.hp -= toHp;
  const dealt = dmg - toHp + hpLoss;
  target.lastHitTime = time;

  // 记录：仇恨、战斗状态、统计
  if (source) {
    target.rt.lastAttackerId = source.id;
    if (target.kind === 'hero') {
      target.dmgTaken += dealt;
      if (source.team !== target.team) {
        source.rt.hitHeroTime = time;
        source.rt.hitHeroId = target.id;
      }
      if (source.kind === 'hero') {
        source.dmgDealt += dealt;
        source.h.lastCombatTime = time;
        target.h.lastCombatTime = time;
        target.h.damagers.set(source.id, time);
      } else if (isStructure(source)) {
        target.h.lastCombatTime = time;
      }
    } else if (source.kind === 'hero' && isStructure(target)) {
      source.dmgTower += dealt;
    } else if (target.kind === 'monster') {
      monsterAggro(target, source);
    }
  }

  sim.emit({
    type: 'damage', targetId: target.id, sourceId: source ? source.id : -1, amount: dealt, dtype, crit,
    pos: { x: target.pos.x, y: target.pos.y }, skill: kind === 'skill',
  });

  // 受伤打断：回城被任何伤害打断；疗伤被英雄/建筑伤害打断
  if (target.kind === 'hero') {
    if (hasBuff(target, 'recall')) removeBuff(sim, target, 'recall');
    if (source && (source.kind === 'hero' || isStructure(source)) && hasBuff(target, 'restore')) removeBuff(sim, target, 'restore');
  }

  if (target.hp <= 0) {
    target.hp = 0;
    killUnit(sim, target, source);
  }

  // 钩子（目标可能已死亡，钩子自行判断）
  if (target.kind === 'hero' && kind !== 'env') {
    const hooks = target.h.hooks;
    for (let i = 0; i < hooks.length; i++) {
      const hk = hooks[i];
      if (hk.onDamageTaken) hk.onDamageTaken(sim, target, source, dealt, info);
    }
  }
  if (source && source.kind === 'hero') {
    if (kind === 'skill') {
      const hooks = source.h.hooks;
      for (let i = 0; i < hooks.length; i++) {
        const hk = hooks[i];
        if (hk.onSkillHit) hk.onSkillHit(sim, source, target, dealt, info);
      }
    } else if (kind === 'basic' && source.alive && source.stats.lifesteal > 0 && !isStructure(target)) {
      heal(sim, source, source, dealt * source.stats.lifesteal);
    }
  }
  return dealt;
}

/** 治疗，返回实际回复量。silent = 不发 heal 事件(持续回复的小跳) */
export function heal(sim: Sim, _source: SimUnit | null, target: SimUnit, amount: number, silent = false): number {
  if (!target.alive || !(amount > 0)) return 0;
  const before = target.hp;
  target.hp = Math.min(target.stats.maxHp, before + amount);
  const got = target.hp - before;
  if (got >= 1 && !silent) sim.emit({ type: 'heal', targetId: target.id, amount: got, pos: { x: target.pos.x, y: target.pos.y } });
  return got;
}

/** 单位死亡：清状态、发 death 事件、按类型结算奖励 */
export function killUnit(sim: Sim, victim: SimUnit, killer: SimUnit | null): void {
  if (!victim.alive) return;
  const st = sim.state;
  victim.alive = false;
  victim.hp = 0;
  const rt = victim.rt;
  rt.windupLeft = 0;
  rt.windupTarget = -1;
  if (rt.dash) cancelDash(sim, victim, 'interrupted');
  clearBuffs(sim, victim);
  stopMove(victim);
  rt.act = null;
  rt.lockUntil = 0;
  victim.targetId = -1;
  victim.anim = 'dead';
  victim.animStart = st.time;
  victim.animDur = 1.5;

  // 英雄被塔/小兵补掉时，击杀算给最近伤害过他的敌方英雄
  const creditHero = victim.kind === 'hero' ? resolveHeroKiller(sim, victim, killer) : null;
  const killerId = creditHero ? creditHero.id : killer ? killer.id : -1;
  sim.emit({ type: 'death', unitId: victim.id, kind: victim.kind, team: victim.team, killerId, pos: { x: victim.pos.x, y: victim.pos.y } });

  switch (victim.kind) {
    case 'hero': onHeroKilled(sim, victim, creditHero, killer); break;
    case 'minion': onMinionKilled(sim, victim, killer); break;
    case 'monster': onMonsterKilled(sim, victim, killer); break;
    case 'tower': onTowerKilled(sim, victim, killer); break;
    case 'core': onCoreKilled(sim, victim); break;
  }
}

/** 草丛中出手会暴露一小段时间 */
export function reveal(sim: Sim, u: SimUnit): void {
  u.rt.revealUntil = sim.state.time + VISION.revealOnAttack;
}

// ───────────────────────── 普攻循环 ─────────────────────────

/** target 的身体是否在 u 的普攻射程内（extra = 额外宽限） */
export function inRange(u: SimUnit, target: SimUnit, extra = 0): boolean {
  const r = u.stats.attackRange + target.radius + extra;
  const dx = u.pos.x - target.pos.x;
  const dy = u.pos.y - target.pos.y;
  return dx * dx + dy * dy <= r * r;
}

/** 取消前摇（移动/被控/目标丢失）。不消耗这次攻击 */
export function cancelWindup(u: SimUnit): void {
  const rt = u.rt;
  if (rt.windupLeft <= 0) return;
  rt.windupLeft = 0;
  rt.windupTarget = -1;
  rt.atkCd = 0;
  if (rt.act === 'attack') rt.act = null;
}

function canSwing(sim: Sim, u: SimUnit): boolean {
  const rt = u.rt;
  const t = sim.state.time;
  return u.alive && !rt.stunned && rt.dash === null && rt.windupLeft <= 0 && rt.atkCd <= 0 && t >= rt.lockUntil && t >= rt.disarmUntil;
}

/** 开始一次普攻出手（进入前摇） */
function startSwing(sim: Sim, u: SimUnit, target: SimUnit): void {
  const rt = u.rt;
  const interval = 1 / Math.max(0.1, u.stats.attackSpeed);
  const animDur = Math.min(interval, MAX_ATTACK_ANIM);
  rt.atkCd = interval;
  rt.windupLeft = animDur * rt.atk.windup;
  rt.windupTarget = target.id;
  u.targetId = target.id;
  faceTo(u, target.pos.x, target.pos.y);
  setAction(sim, u, 'attack', animDur, true);
  sim.emit({ type: 'attack', unitId: u.id, targetId: target.id });
  if (u.kind === 'hero') {
    if (hasBuff(u, 'recall')) removeBuff(sim, u, 'recall');
    const hooks = u.h.hooks;
    for (let i = 0; i < hooks.length; i++) {
      const hk = hooks[i];
      if (hk.onBasicAttackStart) hk.onBasicAttackStart(sim, u, target);
    }
  }
}

/** 每 tick 推进普攻计时；前摇结束时近战结算 / 远程出弹 */
export function tickAttack(sim: Sim, u: SimUnit, dt: number): void {
  const rt = u.rt;
  if (rt.atkCd > 0) rt.atkCd -= dt;
  if (rt.windupLeft <= 0) return;
  const target = sim.byId.get(rt.windupTarget);
  if (rt.stunned || !target || !canTarget(u, target) || !inRange(u, target, WINDUP_LEEWAY)) {
    cancelWindup(u);
    return;
  }
  rt.windupLeft -= dt;
  if (rt.windupLeft > 1e-9) return;
  rt.windupLeft = 0;
  rt.windupTarget = -1;
  reveal(sim, u);
  const atk = rt.atk;
  if (atk.visual) {
    const proj = spawnHomingProjectile(sim, {
      visual: atk.visual, owner: u, from: u.pos, target, speed: atk.projSpeed, onHit: basicProjectileHit,
    });
    proj.basic = true;
    proj.ad = u.stats.ad;
    proj.dtype = atk.dtype;
    proj.vsStructure = atk.vsStructure;
    proj.vsMinion = atk.vsMinion;
  } else {
    resolveBasicHit(sim, u, target, u.stats.ad, atk.dtype, atk.vsStructure, atk.vsMinion);
  }
}

function basicProjectileHit(sim: Sim, proj: SimProjectile, target: SimUnit): void {
  const owner = sim.byId.get(proj.ownerId) ?? null;
  resolveBasicHit(sim, owner, target, proj.ad, proj.dtype, proj.vsStructure, proj.vsMinion);
}

function burnTick(sim: Sim, unit: SimUnit, buff: SimBuff): void {
  dealDamage(sim, sim.byId.get(buff.sourceId) ?? null, unit, buff.value, 'true', 'dot');
}

const mod: BasicAttackMod = { mult: 1, bonus: 0, bonusPhysical: 0, bonusMagic: 0, bonusTrue: 0, forceCrit: false, noCrit: false };

/** 英雄普攻命中：暴击、被动/装备修正、红buff、吸血(在 dealDamage 内) */
function heroBasicHit(sim: Sim, hero: SimHero, target: SimUnit): void {
  mod.mult = 1;
  mod.bonus = 0;
  mod.bonusPhysical = 0;
  mod.bonusMagic = 0;
  mod.bonusTrue = 0;
  mod.forceCrit = false;
  mod.noCrit = false;
  const hooks = hero.h.hooks;
  for (let i = 0; i < hooks.length; i++) {
    const hk = hooks[i];
    if (hk.modifyBasicAttack) hk.modifyBasicAttack(sim, hero, target, mod);
  }
  const s = hero.stats;
  const structure = isStructure(target);
  const crit = !mod.noCrit && !structure && (mod.forceCrit || (s.critChance > 0 && sim.rng.next() < s.critChance));
  const raw = s.ad * mod.mult * (crit ? s.critDamage : 1) + mod.bonus;
  // 钩子里可能嵌套触发别的普攻结算，先把附加段取出来
  const bp = mod.bonusPhysical;
  const bm = mod.bonusMagic;
  const bt = mod.bonusTrue;
  const dtype = hero.rt.atk.dtype;
  sim.fx(crit ? 'hit_crit' : dtype === 'magic' ? 'hit_magic' : 'hit_physical', target.pos, hero.team, { unitId: hero.id, targetId: target.id });
  const dealt = dealDamage(sim, hero, target, raw, dtype, 'basic', null, crit);
  if (bp > 0) dealDamage(sim, hero, target, bp, 'physical', 'proc');
  if (bm > 0) dealDamage(sim, hero, target, bm, 'magic', 'proc');
  if (bt > 0) dealDamage(sim, hero, target, bt, 'true', 'proc');
  // 红buff：普攻附带灼烧与减速
  if (!structure && target.alive && hasBuff(hero, 'ember_might')) {
    addBuff(sim, target, 'burn', {
      sourceId: hero.id, duration: EMBER_BURN_TIME, merge: 'replace', key: 'ember',
      value: MONSTER_RULES.emberBurnBase + MONSTER_RULES.emberBurnPerLevel * hero.level,
      tickInterval: BURN_TICK, onTick: burnTick,
    });
    addBuff(sim, target, 'slow', { sourceId: hero.id, duration: EMBER_SLOW_TIME, value: MONSTER_RULES.emberSlow, key: 'ember' });
  }
  for (let i = 0; i < hooks.length; i++) {
    const hk = hooks[i];
    if (hk.onBasicAttackHit) hk.onBasicAttackHit(sim, hero, target, dealt, crit);
  }
}

/**
 * 结算一次普攻命中。attacker 为 null 表示发射者已被移除(用出手时的快照数值)。
 * 英雄走完整的普攻流程(暴击/被动/吸血)；小兵/塔/野怪按各自倍率直接结算。
 */
export function resolveBasicHit(
  sim: Sim, attacker: SimUnit | null, target: SimUnit, ad: number, dtype: DamageType, vsStructure: number, vsMinion: number,
): void {
  if (!target.alive) return;
  if (attacker && attacker.kind === 'hero') {
    heroBasicHit(sim, attacker, target);
    return;
  }
  let raw = ad;
  if (isStructure(target)) raw *= vsStructure;
  let fxKey: FxKey = dtype === 'magic' ? 'hit_magic' : 'hit_physical';
  if (attacker && isStructure(attacker)) {
    fxKey = 'hit_tower';
    if (target.kind === 'minion') {
      raw *= TOWER_RULES.minionMult;
    } else if (target.kind === 'hero') {
      // 连续命中同一英雄逐次增伤
      const key = `t${attacker.id}`;
      const focus = findBuff(target, 'tower_focus', key);
      raw *= 1 + Math.min(TOWER_RULES.rampMax, TOWER_RULES.rampPerHit * (focus ? focus.stacks : 0));
      addBuff(sim, target, 'tower_focus', {
        sourceId: attacker.id, duration: TOWER_FOCUS_TIME, key, stacks: 1,
        maxStacks: Math.max(1, Math.round(TOWER_RULES.rampMax / TOWER_RULES.rampPerHit)),
      });
    }
  } else if (target.kind === 'minion') {
    raw *= vsMinion;
  }
  sim.fx(fxKey, target.pos, attacker ? attacker.team : 2, { targetId: target.id });
  dealDamage(sim, attacker, target, raw, dtype, 'basic');
}

/**
 * 「走过去打」一个 tick：目标在射程内则站定出手，否则(允许追击时)向它移动。
 * 返回 true = 目标在射程内(正在出手或等待攻击间隔)。
 */
export function engage(sim: Sim, u: SimUnit, target: SimUnit, dt: number, chase: boolean): boolean {
  const rt = u.rt;
  if (rt.windupLeft > 0) return true;
  if (inRange(u, target)) {
    if (canSwing(sim, u)) startSwing(sim, u, target);
    else if (sim.state.time >= rt.lockUntil && !rt.stunned) faceTo(u, target.pos.x, target.pos.y);
    return true;
  }
  if (chase && !rt.rooted && !rt.stunned && rt.dash === null && sim.state.time >= rt.lockUntil) {
    moveToward(sim, u, target.pos.x, target.pos.y, dt);
  }
  return false;
}

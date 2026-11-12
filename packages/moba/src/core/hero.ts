/**
 * 英雄控制：处理 PlayerCommand、每 tick 的行动、施法管线、智能选目标、装备买卖、复活。
 * 玩家与 Bot 走完全相同的入口(heroCommand)。
 */
import { setAction } from './anim';
import { addBuff, hasBuff, removeBuff } from './buffs';
import { cancelWindup, engage, inRange, reveal, tickAttack } from './combat';
import { skillValue, SUMMONER } from './data/heroes';
import { ITEMS, SELL_RATIO } from './data/items';
import { ARMOR_K, ECONOMY } from './data/units';
import { canTarget } from './entity';
import { COMBAT_WINDOW, MOVE_DIR, MOVE_NONE, type CastCommand, type HeroHooks, type SimHero, type SimUnit } from './internal';
import { orderMoveDir, orderMoveTo, stopMove, updateDash, updateOrderedMove } from './movement';
import {
  getHeroHooks, getItemHooks, getSkill, isSummonerSlot, SUMMONER_CAST, type CastContext, type RejectReason, type SkillImpl,
} from './skills/registry';
import { recomputeStats } from './stats';
import { TICK_DT, type AbilitySlot, type CastSpec, type ItemId, type ItemPassiveId, type PlayerCommand, type SkillSlot, type Vec2 } from './types';
import type { Sim } from './world';

const ALL_SLOTS: SkillSlot[] = ['s1', 's2', 'ult', 'recall', 'heal', 'flash'];
/** 普攻键没有目标时，愿意走多远去找最近的敌人 */
const ATTACK_SEEK = 7;
/** 当前目标死亡后，自动续上下一个目标的搜索余量 */
const ATTACK_CHAIN_SEEK = 2.5;
/** 「射程内」的宽限：略超出射程的目标也算（会自动走两步） */
const ATTACK_LEEWAY = 0.75;
/** 自动瞄准时技能射程的余量 */
const AIM_MARGIN = 0.5;
/** 动作锁期间的施法指令最多缓冲多久 */
const CAST_BUFFER = 0.6;
/** 预判时超过这个速度视为瞬移/冲刺，不做提前量 */
const PREDICT_MAX_SPEED = 12;
const DEFAULT_AIM_LEAD = 0.3;
const RESPAWN_GUARD_TIME = 2;

function reject(sim: Sim, hero: SimHero, reason: RejectReason, silent = false): false {
  // 拒绝提示只发给玩家
  if (hero.isPlayer && !silent) sim.emit({ type: 'reject', unitId: hero.id, reason });
  return false;
}

/** 回城引导被打断 */
export function interruptRecall(sim: Sim, hero: SimHero): void {
  if (hasBuff(hero, 'recall')) removeBuff(sim, hero, 'recall');
}

// ───────────────────────── 钩子组 ─────────────────────────

/** 重建英雄生效中的钩子组：英雄被动 + 身上装备的被动（同 id 被动只生效一份） */
export function rebuildHooks(hero: SimHero): void {
  const hooks: HeroHooks[] = [];
  const own = getHeroHooks(hero.heroId);
  if (own) hooks.push(own);
  const seen = new Set<ItemPassiveId>();
  for (const id of hero.items) {
    if (!id) continue;
    const item = ITEMS[id];
    if (!item.passive || seen.has(item.passive.id)) continue;
    const hk = getItemHooks(item);
    if (!hk) continue;
    seen.add(item.passive.id);
    hooks.push(hk);
  }
  hero.h.hooks = hooks;
}

// ───────────────────────── 装备 ─────────────────────────

function onItemsChanged(sim: Sim, hero: SimHero): void {
  rebuildHooks(hero);
  recomputeStats(sim, hero);
}

/** 购买装备（随时随地可买）。鞋子互斥：升级鞋会替换已有的鞋并抵扣其售价 */
export function buyItem(sim: Sim, hero: SimHero, itemId: ItemId): boolean {
  const def = ITEMS[itemId];
  if (!def) return false;
  const items = hero.items;
  let cost = def.cost;
  let slot = -1;
  if (def.category === 'boots') {
    const owned = items.findIndex((id) => id !== null && ITEMS[id].category === 'boots');
    if (owned >= 0) {
      const old = ITEMS[items[owned] as ItemId];
      // 已有鞋时：不能再买基础鞋，也不能重复买同一双
      if (def.tier === 1 || old.id === def.id) return reject(sim, hero, 'full');
      slot = owned;
      cost -= Math.floor(old.cost * SELL_RATIO);
    }
  }
  if (slot < 0) slot = items.indexOf(null);
  if (slot < 0) return reject(sim, hero, 'full');
  if (hero.gold < cost) return reject(sim, hero, 'gold');
  hero.gold -= cost;
  items[slot] = itemId;
  onItemsChanged(sim, hero);
  sim.emit({ type: 'itemBought', unitId: hero.id, itemId });
  return true;
}

/** 出售装备栏第 index 格，返还 60% */
export function sellItem(sim: Sim, hero: SimHero, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= hero.items.length) return false;
  const id = hero.items[index];
  if (!id) return false;
  hero.gold += Math.floor(ITEMS[id].cost * SELL_RATIO);
  hero.items[index] = null;
  onItemsChanged(sim, hero);
  return true;
}

// ───────────────────────── 普攻指令 ─────────────────────────

const smartBuf: SimUnit[] = [];

/** 「残血小兵」：一刀能收掉，或血量低于这个比例 */
const LOW_MINION_HP = 0.35;

function lastHittable(hero: SimHero, m: SimUnit): boolean {
  return m.hp <= (hero.stats.ad * ARMOR_K) / (ARMOR_K + m.stats.armor);
}

/** 智能选目标的类别优先级（越小越优先）：英雄 → 残血小兵 → 建筑 → 其他小兵 → 野怪 */
function targetRank(hero: SimHero, u: SimUnit): number {
  switch (u.kind) {
    case 'hero': return 0;
    case 'minion': return lastHittable(hero, u) || u.hp < u.stats.maxHp * LOW_MINION_HP ? 1 : 3;
    case 'monster': return 4;
    default: return 2;
  }
}

/**
 * 智能选目标：射程内按 英雄(血量比例最低) → 残血小兵(能补刀的最优先) → 建筑(最近) → 其他小兵(血量最低) → 野怪 的顺序选；
 * 射程内没有任何目标时，返回 seek 范围内最近的敌人(走过去打)。都没有返回 null。
 */
export function pickSmartTarget(sim: Sim, hero: SimHero, seek: number): SimUnit | null {
  const range = hero.stats.attackRange;
  const n = sim.grid.query(hero.pos.x, hero.pos.y, range + seek, smartBuf);
  let best: SimUnit | null = null;
  let bestRank = Infinity;
  let bestScore = Infinity;
  let nearest: SimUnit | null = null;
  let nearestD = Infinity;
  for (let i = 0; i < n; i++) {
    const c = smartBuf[i];
    if (!canTarget(hero, c)) continue;
    const d = Math.hypot(c.pos.x - hero.pos.x, c.pos.y - hero.pos.y) - c.radius;
    if (d <= range + ATTACK_LEEWAY) {
      const rank = targetRank(hero, c);
      let score: number;
      if (c.kind === 'hero') score = c.hp / c.stats.maxHp;
      else if (c.kind === 'minion') score = lastHittable(hero, c) ? c.hp - 1e6 : c.hp;
      else if (c.kind === 'monster') score = c.hp;
      else score = d;
      if (rank < bestRank || (rank === bestRank && score < bestScore)) {
        best = c;
        bestRank = rank;
        bestScore = score;
      }
    } else if (d <= range + seek && d < nearestD) {
      // 不主动跑远路去招惹野怪
      if (c.kind === 'monster' && d > range + ATTACK_CHAIN_SEEK) continue;
      nearestD = d;
      nearest = c;
    }
  }
  return best ?? nearest;
}

function orderAttack(sim: Sim, hero: SimHero, targetId: number | undefined): void {
  const h = hero.h;
  interruptRecall(sim, hero);
  let target: SimUnit | null = null;
  let explicit = false;
  if (targetId !== undefined && targetId >= 0) {
    const t = sim.byId.get(targetId);
    if (!t || !canTarget(hero, t)) {
      reject(sim, hero, 'no_target');
      return;
    }
    target = t;
    explicit = true;
  } else {
    const best = pickSmartTarget(sim, hero, ATTACK_SEEK);
    if (!best) return;
    const cur = h.atkOrder ? sim.byId.get(h.atkTargetId) : undefined;
    if (cur && canTarget(hero, cur)) {
      // 出手中不换目标；同等优先级时保持当前目标，避免每次按键都换人
      if (hero.rt.windupLeft > 0) return;
      if (inRange(hero, cur, ATTACK_LEEWAY) && targetRank(hero, cur) <= targetRank(hero, best)) return;
    }
    target = best;
  }
  if (h.atkTargetId !== target.id) cancelWindup(hero);
  h.atkOrder = true;
  h.atkTargetId = target.id;
  h.atkExplicit = explicit;
  hero.targetId = target.id;
  stopMove(hero);
}

function updateAttackOrder(sim: Sim, hero: SimHero, dt: number): void {
  const h = hero.h;
  let target = sim.byId.get(h.atkTargetId);
  if (!target || !canTarget(hero, target)) {
    if (hero.rt.windupLeft > 0) return;
    // 目标没了：在附近续一个，否则结束攻击指令
    const next = pickSmartTarget(sim, hero, ATTACK_CHAIN_SEEK);
    if (!next) {
      h.atkOrder = false;
      hero.targetId = -1;
      return;
    }
    h.atkTargetId = next.id;
    h.atkExplicit = false;
    target = next;
  }
  hero.targetId = target.id;
  engage(sim, hero, target, dt, true);
}

// ───────────────────────── 施法管线 ─────────────────────────

interface Aim {
  dir: Vec2;
  pos: Vec2;
  target: SimUnit | null;
}

const aimBuf: SimUnit[] = [];

function castSpecOf(hero: SimHero, slot: SkillSlot): CastSpec {
  return isSummonerSlot(slot) ? SUMMONER_CAST[slot] : hero.h.def.skills[slot].cast;
}

/** 目标 lead 秒后的预计位置（按上一 tick 的速度线性外推） */
function predict(target: SimUnit, lead: number): Vec2 {
  const vx = (target.pos.x - target.prevPos.x) / TICK_DT;
  const vy = (target.pos.y - target.prevPos.y) / TICK_DT;
  if (lead <= 0 || Math.hypot(vx, vy) > PREDICT_MAX_SPEED) return { x: target.pos.x, y: target.pos.y };
  return { x: target.pos.x + vx * lead, y: target.pos.y + vy * lead };
}

/**
 * 自动瞄准选目标：reach 内血量比例最低的可见敌方英雄；heroesOnly=false 时退而求其次选最近的敌方小兵/野怪。
 */
function pickAimTarget(sim: Sim, hero: SimHero, reach: number, heroesOnly: boolean): SimUnit | null {
  const n = sim.grid.query(hero.pos.x, hero.pos.y, reach, aimBuf);
  let bestHero: SimUnit | null = null;
  let heroScore = Infinity;
  let nearest: SimUnit | null = null;
  let nearestD = Infinity;
  for (let i = 0; i < n; i++) {
    const c = aimBuf[i];
    if (c.kind === 'tower' || c.kind === 'core' || !canTarget(hero, c)) continue;
    const d = Math.hypot(c.pos.x - hero.pos.x, c.pos.y - hero.pos.y) - c.radius;
    if (d > reach) continue;
    if (c.kind === 'hero') {
      const score = c.hp / c.stats.maxHp;
      if (score < heroScore) {
        heroScore = score;
        bestHero = c;
      }
    } else if (d < nearestD) {
      nearestD = d;
      nearest = c;
    }
  }
  return bestHero ?? (heroesOnly ? null : nearest);
}

function unitDir(hero: SimHero, x: number, y: number, fallback: Vec2): Vec2 {
  const dx = x - hero.pos.x;
  const dy = y - hero.pos.y;
  const l = Math.hypot(dx, dy);
  return l > 1e-4 ? { x: dx / l, y: dy / l } : { x: fallback.x, y: fallback.y };
}

/** 没有瞄准对象时的默认方向：正在摇杆移动则取移动方向，否则取面向 */
function idleDir(hero: SimHero): Vec2 {
  const rt = hero.rt;
  if (rt.moveMode === MOVE_DIR) return { x: rt.dirX, y: rt.dirY };
  return { x: Math.cos(hero.facing), y: Math.sin(hero.facing) };
}

/** 朝某个单位出手的方向（方向型技能按弹道飞行时间做提前量） */
function dirAtUnit(hero: SimHero, target: SimUnit, impl: SkillImpl, fallback: Vec2): Vec2 {
  let lead = impl.aimLead ?? 0;
  if (impl.aimSpeed && impl.aimSpeed > 0) {
    lead += Math.hypot(target.pos.x - hero.pos.x, target.pos.y - hero.pos.y) / impl.aimSpeed;
  }
  const p = predict(target, Math.min(lead, 0.8));
  return unitDir(hero, p.x, p.y, fallback);
}

function validFinite(v: Vec2 | undefined): v is Vec2 {
  return v !== undefined && Number.isFinite(v.x) && Number.isFinite(v.y);
}

/** 把命令解析成最终的 方向/落点/目标。返回 null = 没有合法目标(仅 target 型) */
function resolveAim(sim: Sim, hero: SimHero, spec: CastSpec, impl: SkillImpl, cmd: CastCommand): Aim | null {
  const p = hero.pos;
  const facing = idleDir(hero);
  let explicit: SimUnit | null = null;
  if (cmd.targetId !== undefined && cmd.targetId >= 0) {
    const t = sim.byId.get(cmd.targetId);
    if (t && canTarget(hero, t)) explicit = t;
  }
  const auto = impl.aim !== 'facing';
  switch (spec.type) {
    case 'self':
      return { dir: { x: Math.cos(hero.facing), y: Math.sin(hero.facing) }, pos: { x: p.x, y: p.y }, target: null };
    case 'target': {
      const reach = spec.range + AIM_MARGIN;
      let t = explicit;
      if (t && (t.kind !== 'hero' || Math.hypot(t.pos.x - p.x, t.pos.y - p.y) - t.radius > reach)) t = null;
      if (!t) t = pickAimTarget(sim, hero, reach, true);
      if (!t) return null;
      return { dir: unitDir(hero, t.pos.x, t.pos.y, facing), pos: { x: t.pos.x, y: t.pos.y }, target: t };
    }
    case 'direction':
    case 'cone': {
      let dir: Vec2;
      if (validFinite(cmd.dir) && Math.hypot(cmd.dir.x, cmd.dir.y) > 1e-3) dir = unitDir(hero, p.x + cmd.dir.x, p.y + cmd.dir.y, facing);
      else if (validFinite(cmd.pos)) dir = unitDir(hero, cmd.pos.x, cmd.pos.y, facing);
      else if (explicit) dir = dirAtUnit(hero, explicit, impl, facing);
      else {
        const t = auto ? pickAimTarget(sim, hero, spec.range + AIM_MARGIN, false) : null;
        dir = t ? dirAtUnit(hero, t, impl, facing) : facing;
      }
      return { dir, pos: { x: p.x + dir.x * spec.range, y: p.y + dir.y * spec.range }, target: null };
    }
    case 'position': {
      let pos: Vec2;
      const lead = impl.aimLead ?? DEFAULT_AIM_LEAD;
      if (validFinite(cmd.pos)) pos = { x: cmd.pos.x, y: cmd.pos.y };
      else if (validFinite(cmd.dir) && Math.hypot(cmd.dir.x, cmd.dir.y) > 1e-3) {
        const d = unitDir(hero, p.x + cmd.dir.x, p.y + cmd.dir.y, facing);
        pos = { x: p.x + d.x * spec.range, y: p.y + d.y * spec.range };
      } else if (explicit) pos = predict(explicit, lead);
      else {
        const t = auto ? pickAimTarget(sim, hero, spec.range + spec.radius * 0.6, false) : null;
        pos = t ? predict(t, lead) : { x: p.x + facing.x * spec.range * 0.6, y: p.y + facing.y * spec.range * 0.6 };
      }
      // 落点限制在施法距离内
      const dx = pos.x - p.x;
      const dy = pos.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > spec.range) {
        pos.x = p.x + (dx / d) * spec.range;
        pos.y = p.y + (dy / d) * spec.range;
      }
      return { dir: d > 1e-4 ? { x: dx / d, y: dy / d } : facing, pos, target: null };
    }
  }
}

/**
 * 施法入口。校验 → 瞄准 → 扣蓝 → 冷却 → skillCast 事件 → 动作 → 技能脚本。
 * 动作锁/位移期间的指令会被缓冲并在解锁后自动重试。返回是否已施放。
 */
export function requestCast(sim: Sim, hero: SimHero, cmd: CastCommand, buffered = false): boolean {
  const slot = cmd.slot;
  const skill = hero.skills[slot];
  if (!skill || !hero.alive) return false;
  const rt = hero.rt;
  const time = sim.state.time;
  if (skill.level <= 0) return reject(sim, hero, 'disabled', buffered);
  if (skill.cd > 0) return reject(sim, hero, 'cooldown', buffered);
  const summoner = isSummonerSlot(slot);
  const impl = getSkill(hero.heroId, slot);
  if (rt.stunned || (rt.silenced && !summoner) || (impl.movement && rt.rooted)) return reject(sim, hero, 'disabled', buffered);
  if (hero.mana < skill.cost) return reject(sim, hero, 'mana', buffered);
  if (time < rt.lockUntil || rt.dash !== null) {
    hero.h.pendingCast = cmd;
    hero.h.pendingUntil = time + CAST_BUFFER;
    return false;
  }
  if (impl.canCast) {
    const why = impl.canCast(sim, hero);
    if (why) return reject(sim, hero, why, buffered);
  }
  const spec = castSpecOf(hero, slot);
  const aim = resolveAim(sim, hero, spec, impl, cmd);
  if (!aim) return reject(sim, hero, 'no_target', buffered);

  // —— 施放成立 ——
  const def = summoner ? null : hero.h.def.skills[slot as AbilitySlot];
  const level = skill.level;
  hero.mana -= skill.cost;
  // 冷却缩减只作用于英雄技能，不作用于召唤师技能
  skill.cdMax = def ? def.cooldown[level - 1] * (1 - hero.stats.cdr) : SUMMONER[slot as keyof typeof SUMMONER].cooldown;
  skill.cd = skill.cdMax;
  cancelWindup(hero);
  if (slot !== 'recall') interruptRecall(sim, hero);
  if (spec.type !== 'self') hero.facing = Math.atan2(aim.dir.y, aim.dir.x);
  reveal(sim, hero);
  const castTime = def ? def.castTime : 0;
  const lock = impl.lockTime ?? castTime;
  if (lock > 0) rt.lockUntil = time + lock;
  if (def && castTime > 0 && !impl.noAnim) setAction(sim, hero, `cast_${slot as AbilitySlot}`, castTime, true);
  const origin = { x: hero.pos.x, y: hero.pos.y };
  sim.emit({
    type: 'skillCast', unitId: hero.id, heroId: hero.heroId, slot, pos: origin, dir: { x: aim.dir.x, y: aim.dir.y },
    targetPos: { x: aim.pos.x, y: aim.pos.y }, targetId: aim.target ? aim.target.id : -1,
  });
  const ctx: CastContext = {
    sim, caster: hero, slot, level, def, origin: { x: origin.x, y: origin.y }, dir: aim.dir, targetPos: aim.pos, target: aim.target,
    spec,
    range: 'range' in spec ? spec.range : 0,
    radius: 'radius' in spec ? spec.radius : 0,
    width: 'width' in spec ? spec.width : 0,
    angle: 'angle' in spec ? spec.angle : 0,
    val: (key: string): number => {
      if (!def) throw new Error(`summoner skill "${slot}" has no values`);
      return skillValue(def, key, level);
    },
  };
  const hooks = hero.h.hooks;
  for (let i = 0; i < hooks.length; i++) {
    const hk = hooks[i];
    if (hk.onSkillCast) hk.onSkillCast(sim, hero, slot);
  }
  impl.cast(ctx);
  return true;
}

// ───────────────────────── 命令入口 ─────────────────────────

function breakForMove(sim: Sim, hero: SimHero): void {
  hero.h.atkOrder = false;
  hero.targetId = -1;
  cancelWindup(hero);
  interruptRecall(sim, hero);
}

export function heroCommand(sim: Sim, hero: SimHero, cmd: PlayerCommand): void {
  if (sim.state.over) return;
  // 买卖不受死亡影响
  if (cmd.type === 'buy') {
    buyItem(sim, hero, cmd.itemId);
    return;
  }
  if (cmd.type === 'sell') {
    sellItem(sim, hero, cmd.index);
    return;
  }
  if (!hero.alive) return;
  const rt = hero.rt;
  switch (cmd.type) {
    case 'move': {
      const l = validFinite(cmd.dir) ? Math.hypot(cmd.dir.x, cmd.dir.y) : 0;
      if (!(l > 0.05)) {
        // 零向量 = 松开摇杆：只停掉方向移动，不影响寻路/攻击指令
        if (rt.moveMode === MOVE_DIR) stopMove(hero);
        return;
      }
      breakForMove(sim, hero);
      orderMoveDir(hero, cmd.dir.x / l, cmd.dir.y / l);
      return;
    }
    case 'moveTo':
      if (!validFinite(cmd.pos)) return;
      breakForMove(sim, hero);
      orderMoveTo(sim, hero, cmd.pos.x, cmd.pos.y);
      return;
    case 'stop':
      stopMove(hero);
      hero.h.atkOrder = false;
      hero.h.pendingCast = null;
      hero.targetId = -1;
      cancelWindup(hero);
      return;
    case 'attack':
      orderAttack(sim, hero, cmd.targetId);
      return;
    case 'cast':
      requestCast(sim, hero, cmd);
      return;
  }
}

// ───────────────────────── 每 tick ─────────────────────────

/** 在泉水复活：满状态 + 2 秒复活保护 */
export function respawnHero(sim: Sim, hero: SimHero): void {
  const h = hero.h;
  const rt = hero.rt;
  hero.alive = true;
  hero.respawnIn = 0;
  hero.pos.x = h.spawn.x;
  hero.pos.y = h.spawn.y;
  hero.prevPos.x = h.spawn.x;
  hero.prevPos.y = h.spawn.y;
  hero.facing = hero.team === 1 ? Math.PI * 0.75 : -Math.PI * 0.25;
  hero.anim = 'idle';
  hero.animStart = sim.state.time;
  hero.animDur = 0;
  hero.targetId = -1;
  stopMove(hero);
  rt.atkCd = 0;
  rt.windupLeft = 0;
  rt.lockUntil = 0;
  rt.disarmUntil = 0;
  rt.act = null;
  rt.revealUntil = -999;
  h.atkOrder = false;
  h.pendingCast = null;
  recomputeStats(sim, hero);
  hero.hp = hero.stats.maxHp;
  hero.mana = hero.stats.maxMana;
  sim.grid.insert(hero);
  addBuff(sim, hero, 'respawn_guard', { duration: RESPAWN_GUARD_TIME });
  sim.emit({ type: 'respawn', unitId: hero.id, pos: { x: hero.pos.x, y: hero.pos.y } });
  sim.fx('respawn', hero.pos, hero.team, { unitId: hero.id });
  for (const hk of h.hooks) if (hk.onSpawn) hk.onSpawn(sim, hero);
}

export function updateHero(sim: Sim, hero: SimHero, dt: number): void {
  const st = sim.state;
  const time = st.time;
  const h = hero.h;
  const rt = hero.rt;

  // 自然金币（开局 10 秒后；阵亡期间照常增长）
  if (time >= 10) {
    h.goldFrac += ECONOMY.passiveGold * dt;
    if (h.goldFrac >= 1) {
      const g = Math.floor(h.goldFrac);
      h.goldFrac -= g;
      hero.gold += g;
      hero.goldEarned += g;
      st.teams[hero.team].gold += g;
    }
  }
  for (let i = 0; i < ALL_SLOTS.length; i++) {
    const s = hero.skills[ALL_SLOTS[i]];
    if (s.cd > 0) s.cd = s.cd > dt ? s.cd - dt : 0;
  }
  hero.inCombat = time - h.lastCombatTime < COMBAT_WINDOW;

  if (!hero.alive) {
    hero.respawnIn -= dt;
    if (hero.respawnIn <= 1e-9) respawnHero(sim, hero);
    return;
  }

  // 自然回复
  const s = hero.stats;
  if (hero.hp < s.maxHp) hero.hp = Math.min(s.maxHp, hero.hp + s.hpRegen * dt);
  if (hero.mana < s.maxMana) hero.mana = Math.min(s.maxMana, hero.mana + s.manaRegen * dt);

  // 星陨祝福：队伍增益期间保证每个存活英雄身上都有（复活后自动补上）
  const blessing = st.teams[hero.team].blessingLeft;
  if (blessing > 0.05 && !hasBuff(hero, 'star_blessing')) addBuff(sim, hero, 'star_blessing', { duration: blessing, key: 'team' });

  const hooks = h.hooks;
  for (let i = 0; i < hooks.length; i++) {
    const hk = hooks[i];
    if (hk.onTick) hk.onTick(sim, hero, dt);
  }
  if (!hero.alive) return;

  tickAttack(sim, hero, dt);
  if (rt.dash) {
    updateDash(sim, hero, dt);
    return;
  }
  if (rt.stunned || time < rt.lockUntil) return;

  if (h.pendingCast) {
    const pc = h.pendingCast;
    h.pendingCast = null;
    if (time <= h.pendingUntil) {
      requestCast(sim, hero, pc, true);
      if (time < rt.lockUntil || rt.dash !== null) return;
    }
  }
  if (h.atkOrder) {
    updateAttackOrder(sim, hero, dt);
    return;
  }
  if (rt.windupLeft > 0 || rt.rooted || rt.moveMode === MOVE_NONE) return;
  updateOrderedMove(sim, hero, dt);
}

/** 英雄出生时的初始化：钩子组、属性、出生钩子 */
export function initHero(sim: Sim, hero: SimHero): void {
  rebuildHooks(hero);
  recomputeStats(sim, hero);
  hero.hp = hero.stats.maxHp;
  hero.mana = hero.stats.maxMana;
  for (const hk of hero.h.hooks) if (hk.onSpawn) hk.onSpawn(sim, hero);
}

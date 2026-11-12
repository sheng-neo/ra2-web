/**
 * Buff 系统：增删、合并(叠层/刷新)、到期与周期回调、控制状态缓存、护盾吸收。
 *
 * 合并规则：同一单位上 (id, key) 相同的 buff 视为同一个。
 * - 默认 key：硬控(stun/airborne/root/silence) 全部来源共用一个(取最长)；护盾每次施加各自独立；
 *   其余按来源区分(`s<sourceId>`) —— 同一来源重复施加会合并，不同来源并存。
 * - maxStacks > 1 的 buff 再次施加 = 加层并刷新时间；否则时间/数值取较大者(merge:'replace' 则覆盖)。
 * 数值含义：slow 取所有实例的最大值；haste / attack_speed 各实例相加；dmg_reduction 相乘。
 */
import { cancelWindup } from './combat';
import { MONSTERS } from './data/units';
import type { BuffFn, SimBuff, SimUnit } from './internal';
import { cancelDash } from './movement';
import { recomputeStats } from './stats';
import type { BuffId } from './types';
import type { Sim } from './world';

export interface BuffOpts {
  /** 持续时间（秒）；Infinity = 常驻 */
  duration: number;
  /** 施加者单位 id，缺省 -1(系统) */
  sourceId?: number;
  value?: number;
  /** 本次增加的层数，缺省 1 */
  stacks?: number;
  /** 层数上限，缺省 1 */
  maxStacks?: number;
  /** 合并键，见文件头注释 */
  key?: string;
  /** 已存在同 (id,key) 时：'max'(缺省) 时间与数值取较大者；'replace' 用新值覆盖 */
  merge?: 'max' | 'replace';
  /** 周期回调（如持续伤害）：每 tickInterval 秒调用一次 onTick */
  tickInterval?: number;
  onTick?: BuffFn;
  /** 自然到期时调用 */
  onExpire?: BuffFn;
  /** 以任何方式移除时调用 */
  onRemove?: BuffFn;
}

const HARD_CC: ReadonlySet<BuffId> = new Set<BuffId>(['stun', 'airborne', 'root', 'silence']);
/** 会影响属性的 buff：增删时立即重算属性 */
const STAT_BUFFS: ReadonlySet<BuffId> = new Set<BuffId>(['slow', 'haste', 'attack_speed', 'frost_insight', 'star_blessing']);

/** 该单位是否免疫某种控制 */
export function isCcImmune(u: SimUnit, id: BuffId): boolean {
  if (u.kind === 'tower' || u.kind === 'core') return true;
  if (u.invulnerable || u.rt.untargetable || u.rt.unstoppable) return true;
  // 史诗野怪只吃减速
  if (u.kind === 'monster' && id !== 'slow' && MONSTERS[u.monsterType].epic) return true;
  return false;
}

export function findBuff(u: SimUnit, id: BuffId, key?: string): SimBuff | null {
  const buffs = u.buffs;
  for (let i = 0; i < buffs.length; i++) {
    const b = buffs[i];
    if (b.id === id && (key === undefined || b.key === key)) return b;
  }
  return null;
}

export function hasBuff(u: SimUnit, id: BuffId): boolean {
  const buffs = u.buffs;
  for (let i = 0; i < buffs.length; i++) if (buffs[i].id === id) return true;
  return false;
}

/** 某 id 的层数（多个实例取最大）；没有返回 0 */
export function buffStacks(u: SimUnit, id: BuffId): number {
  let n = 0;
  const buffs = u.buffs;
  for (let i = 0; i < buffs.length; i++) if (buffs[i].id === id && buffs[i].stacks > n) n = buffs[i].stacks;
  return n;
}

/** 根据当前 buff 列表刷新控制标记、护盾总量、英雄无敌状态 */
export function refreshFlags(u: SimUnit): void {
  const rt = u.rt;
  let stun = false;
  let root = false;
  let silence = false;
  let untargetable = false;
  let unstoppable = false;
  let guard = false;
  let airborne: SimBuff | null = null;
  let shield = 0;
  const buffs = u.buffs;
  for (let i = 0; i < buffs.length; i++) {
    const b = buffs[i];
    switch (b.id) {
      case 'stun': stun = true; break;
      case 'airborne': airborne = b; break;
      case 'root': root = true; break;
      case 'silence': silence = true; break;
      case 'untargetable': untargetable = true; break;
      case 'unstoppable': unstoppable = true; break;
      case 'respawn_guard': guard = true; break;
      case 'shield': shield += b.value; break;
      default: break;
    }
  }
  rt.stunned = stun || airborne !== null;
  rt.airborne = airborne;
  rt.rooted = root;
  rt.silenced = silence;
  rt.untargetable = untargetable;
  rt.unstoppable = unstoppable;
  u.shield = shield;
  // 建筑的无敌由推塔顺序决定(structures.ts)，这里只管英雄的复活保护
  if (u.kind === 'hero') u.invulnerable = guard;
}

/** 硬控生效瞬间：打断正在做的事 */
function interrupt(sim: Sim, u: SimUnit, hard: boolean): void {
  const rt = u.rt;
  // 被拉/被击退(forced)不算自己的位移，不能被控制「打断」
  if (rt.dash && rt.dash.mode !== 'forced') cancelDash(sim, u, 'interrupted');
  if (!hard) return;
  cancelWindup(u);
  if (rt.act !== null && rt.act !== 'spin') rt.act = null;
  if (u.kind === 'hero') {
    u.h.pendingCast = null;
    if (hasBuff(u, 'recall')) removeBuff(sim, u, 'recall');
  }
}

/**
 * 给单位加 buff。目标已死亡或免疫(控制类)时返回 null。
 * 返回值是单位身上的 buff 实例（可能是合并后的已有实例）。
 */
export function addBuff(sim: Sim, target: SimUnit, id: BuffId, opts: BuffOpts): SimBuff | null {
  if (!target.alive) return null;
  const hard = HARD_CC.has(id);
  if ((hard || id === 'slow') && isCcImmune(target, id)) return null;
  const sourceId = opts.sourceId ?? -1;
  const duration = opts.duration;
  const value = opts.value ?? 0;
  const addStacks = opts.stacks ?? 1;
  const key = opts.key ?? (hard ? 'cc' : id === 'shield' ? `#${sim.buffSeq++}` : `s${sourceId}`);
  const time = sim.state.time;

  let b = findBuff(target, id, key);
  if (b) {
    const maxStacks = opts.maxStacks ?? b.maxStacks;
    b.maxStacks = maxStacks;
    if (maxStacks > 1) {
      b.stacks = Math.min(maxStacks, b.stacks + addStacks);
      b.timeLeft = duration;
      b.duration = duration;
      b.startTime = time;
      if (opts.value !== undefined) b.value = value;
    } else if (opts.merge === 'replace') {
      b.timeLeft = duration;
      b.duration = duration;
      b.value = value;
      b.startTime = time;
    } else {
      if (duration > b.timeLeft) {
        b.timeLeft = duration;
        b.duration = duration;
        b.startTime = time;
      }
      if (value > b.value) b.value = value;
    }
    b.sourceId = sourceId;
    if (opts.onTick) b.onTick = opts.onTick;
    if (opts.onExpire) b.onExpire = opts.onExpire;
    if (opts.onRemove) b.onRemove = opts.onRemove;
  } else {
    const maxStacks = opts.maxStacks ?? 1;
    b = {
      id, sourceId, timeLeft: duration, duration, stacks: Math.min(maxStacks, Math.max(1, addStacks)), value,
      key, maxStacks, startTime: time,
      tickInterval: opts.tickInterval ?? 0, tickLeft: opts.tickInterval ?? 0,
      onTick: opts.onTick ?? null, onExpire: opts.onExpire ?? null, onRemove: opts.onRemove ?? null,
    };
    target.buffs.push(b);
  }

  refreshFlags(target);
  if (id === 'stun' || id === 'airborne') interrupt(sim, target, true);
  else if (id === 'root') interrupt(sim, target, false);
  if (target.kind === 'hero' || STAT_BUFFS.has(id)) recomputeStats(sim, target);
  return b;
}

function afterRemoval(sim: Sim, u: SimUnit, b: SimBuff): void {
  if (b.id === 'recall' && u.rt.act === 'channel') u.rt.act = null;
  if (b.onRemove) b.onRemove(sim, u, b);
}

/** 移除某个 buff 实例 */
export function removeBuffInstance(sim: Sim, u: SimUnit, b: SimBuff): boolean {
  const i = u.buffs.indexOf(b);
  if (i < 0) return false;
  u.buffs.splice(i, 1);
  refreshFlags(u);
  afterRemoval(sim, u, b);
  if (u.alive && (u.kind === 'hero' || STAT_BUFFS.has(b.id))) recomputeStats(sim, u);
  return true;
}

/** 移除某 id 的全部 buff（给了 key 则只移除该 key）。不触发 onExpire。返回是否移除了东西 */
export function removeBuff(sim: Sim, u: SimUnit, id: BuffId, key?: string): boolean {
  const buffs = u.buffs;
  let removed = false;
  for (let i = buffs.length - 1; i >= 0; i--) {
    const b = buffs[i];
    if (b.id !== id || (key !== undefined && b.key !== key)) continue;
    buffs.splice(i, 1);
    removed = true;
    afterRemoval(sim, u, b);
  }
  if (removed) {
    refreshFlags(u);
    if (u.alive && (u.kind === 'hero' || STAT_BUFFS.has(id))) recomputeStats(sim, u);
  }
  return removed;
}

/** 死亡时清空全部 buff（只触发 onRemove） */
export function clearBuffs(sim: Sim, u: SimUnit): void {
  const buffs = u.buffs;
  if (buffs.length === 0) return;
  const old = buffs.slice();
  buffs.length = 0;
  refreshFlags(u);
  for (const b of old) afterRemoval(sim, u, b);
}

// tickBuffs 的暂存区（tickBuffs 不会重入）
const dueTicks: SimBuff[] = [];
const expired: SimBuff[] = [];

/** 推进一个单位的所有 buff 计时：触发周期回调与到期 */
export function tickBuffs(sim: Sim, u: SimUnit, dt: number): void {
  const buffs = u.buffs;
  if (buffs.length === 0) return;
  dueTicks.length = 0;
  expired.length = 0;
  for (let i = 0; i < buffs.length; i++) {
    const b = buffs[i];
    if (b.tickInterval > 0 && b.onTick) {
      b.tickLeft -= dt;
      if (b.tickLeft <= 1e-9) {
        b.tickLeft += b.tickInterval;
        dueTicks.push(b);
      }
    }
    b.timeLeft -= dt;
    if (b.timeLeft <= 1e-9) expired.push(b);
  }
  if (dueTicks.length === 0 && expired.length === 0) return;
  // 回调可能增删 buff 甚至杀死单位，所以先收集、后执行，并在执行前确认 buff 仍在
  const ticks = dueTicks.length > 0 ? dueTicks.slice() : null;
  const ends = expired.length > 0 ? expired.slice() : null;
  if (ticks) {
    for (const b of ticks) {
      if (!u.alive) return;
      if (buffs.indexOf(b) >= 0 && b.onTick) b.onTick(sim, u, b);
    }
  }
  if (ends) {
    let statDirty = false;
    for (const b of ends) {
      if (!u.alive) return;
      const i = buffs.indexOf(b);
      // 周期回调里被刷新过的不算到期
      if (i < 0 || b.timeLeft > 1e-9) continue;
      buffs.splice(i, 1);
      refreshFlags(u);
      if (b.onExpire) b.onExpire(sim, u, b);
      afterRemoval(sim, u, b);
      if (u.kind === 'hero' || STAT_BUFFS.has(b.id)) statDirty = true;
    }
    if (statDirty && u.alive) recomputeStats(sim, u);
  }
}

/**
 * 用护盾吸收伤害：先消耗最早到期的护盾。返回未被吸收的剩余伤害。
 */
export function absorbShield(sim: Sim, u: SimUnit, amount: number): number {
  let left = amount;
  while (left > 0) {
    let pick: SimBuff | null = null;
    const buffs = u.buffs;
    for (let i = 0; i < buffs.length; i++) {
      const b = buffs[i];
      if (b.id === 'shield' && b.value > 0 && (pick === null || b.timeLeft < pick.timeLeft)) pick = b;
    }
    if (!pick) break;
    const take = Math.min(pick.value, left);
    pick.value -= take;
    left -= take;
    if (pick.value <= 1e-6) {
      const i = buffs.indexOf(pick);
      if (i >= 0) buffs.splice(i, 1);
      sim.fx('shield_break', u.pos, u.team, { unitId: u.id });
      afterRemoval(sim, u, pick);
    }
  }
  refreshFlags(u);
  return left;
}

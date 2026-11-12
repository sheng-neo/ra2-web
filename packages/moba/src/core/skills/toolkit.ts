/**
 * 技能工具箱：技能脚本 / 被动钩子实现效果时用的全部积木。
 *
 * 约定：
 * - 所有函数第一个参数是 sim。位置一律是模拟平面坐标(米)，时间是秒。
 * - 范围查询按「目标身体与形状相交」判定(会计入目标半径)，返回新数组，可以放心在回调里保存/修改。
 * - 技能伤害请用 skillDamage(会触发 onSkillHit → 星辉印记、凛冬权杖等)；被动/装备的附带伤害用
 *   procDamage(不触发任何钩子，防止递归)。
 * - 数值从 ctx.val('key') 读取，不要硬编码。
 */
import { clearAction, setAction } from '../anim';
import { removeArea, spawnArea, type AreaOpts } from '../areas';
import {
  addBuff, buffStacks, findBuff, hasBuff, isCcImmune, removeBuff, removeBuffInstance, type BuffOpts,
} from '../buffs';
import { dealDamage, heal as healUnit, reveal } from '../combat';
import { isStructure, isTargetable } from '../entity';
import type { SimArea, SimBuff, SimHero, SimProjectile, SimUnit, UnitFilter } from '../internal';
import {
  cancelDash, displace, faceTo, startDash, startLeap, teleport, type DashOpts,
} from '../movement';
import {
  destroyProjectile, spawnHomingProjectile, spawnLinearProjectile, type HomingProjectileOpts, type LinearProjectileOpts,
} from '../projectiles';
import type { Task } from '../scheduler';
import type { BuffId, DamageType, FxKey, GameEvent, PlayerTeam, SkillSlot, TeamId, UnitAnim, Vec2 } from '../types';
import type { Sim } from '../world';
import type { CastContext } from './registry';

export type { AreaOpts, BuffOpts, DashOpts, HomingProjectileOpts, LinearProjectileOpts };
export type { CastContext, SkillImpl, HeroHooks, RejectReason } from './registry';
export { registerSkill, registerSummoner, registerHeroHooks, registerItemPassive } from './registry';

// ───────────────────────── 目标过滤 ─────────────────────────

export interface TargetOpts {
  /** 只要英雄 */
  heroesOnly?: boolean;
  /** 包含野怪（缺省 true） */
  monsters?: boolean;
  /** 包含建筑（缺省 false：技能默认不打塔） */
  structures?: boolean;
  /** 只要对该队伍可见的单位（缺省不要求：范围技能可以打中草里的敌人） */
  visibleTo?: PlayerTeam;
  /** 排除某个单位 */
  exclude?: SimUnit;
}

/** 构造「team 的敌人」过滤器：存活、可被选中(非无敌/非不可选中)、队伍不同 */
export function enemyFilter(team: TeamId, opts: TargetOpts = {}): UnitFilter {
  const monsters = opts.monsters !== false;
  const structures = opts.structures === true;
  return (u: SimUnit): boolean => {
    if (u.team === team || !isTargetable(u) || u === opts.exclude) return false;
    if (opts.heroesOnly && u.kind !== 'hero') return false;
    if (!monsters && u.kind === 'monster') return false;
    if (!structures && isStructure(u)) return false;
    if (opts.visibleTo !== undefined && !u.visible[opts.visibleTo]) return false;
    return true;
  };
}

/** 构造「team 的友军」过滤器：存活、同队（缺省只含英雄与小兵） */
export function allyFilter(team: TeamId, opts: TargetOpts = {}): UnitFilter {
  const structures = opts.structures === true;
  return (u: SimUnit): boolean => {
    if (u.team !== team || !u.alive || u === opts.exclude) return false;
    if (opts.heroesOnly && u.kind !== 'hero') return false;
    if (!structures && isStructure(u)) return false;
    return true;
  };
}

// ───────────────────────── 范围查询 ─────────────────────────

const buf: SimUnit[] = [];

/** 圆形范围内的单位（距离圆心由近到远） */
export function unitsInCircle(sim: Sim, pos: Vec2, radius: number, filter?: UnitFilter): SimUnit[] {
  const n = sim.grid.query(pos.x, pos.y, radius, buf);
  const out: SimUnit[] = [];
  const dist: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = buf[i];
    if (!u.alive) continue;
    const d = Math.hypot(u.pos.x - pos.x, u.pos.y - pos.y);
    if (d > radius + u.radius) continue;
    if (filter && !filter(u)) continue;
    let k = out.length;
    out.push(u);
    dist.push(d);
    while (k > 0 && dist[k - 1] > d) {
      out[k] = out[k - 1];
      dist[k] = dist[k - 1];
      k--;
    }
    out[k] = u;
    dist[k] = d;
  }
  return out;
}

/**
 * 扇形范围内的单位：顶点 pos、朝向 dir、半径 range、全角 angle(弧度)。由近到远。
 */
export function unitsInCone(sim: Sim, pos: Vec2, dir: Vec2, range: number, angle: number, filter?: UnitFilter): SimUnit[] {
  const all = unitsInCircle(sim, pos, range, filter);
  const half = angle * 0.5;
  const l = Math.hypot(dir.x, dir.y) || 1;
  const dx = dir.x / l;
  const dy = dir.y / l;
  const out: SimUnit[] = [];
  for (const u of all) {
    const ux = u.pos.x - pos.x;
    const uy = u.pos.y - pos.y;
    const d = Math.hypot(ux, uy);
    // 贴脸的目标一定命中
    if (d <= u.radius) {
      out.push(u);
      continue;
    }
    const cos = (ux * dx + uy * dy) / d;
    const off = Math.acos(cos > 1 ? 1 : cos < -1 ? -1 : cos);
    // 目标身体张开的角度也算进去
    if (off <= half + Math.asin(Math.min(1, u.radius / d))) out.push(u);
  }
  return out;
}

/**
 * 线段(胶囊)范围内的单位：from→to，总宽度 width。按沿线先后排序。
 */
export function unitsInLine(sim: Sim, from: Vec2, to: Vec2, width: number, filter?: UnitFilter): SimUnit[] {
  const mx = (from.x + to.x) * 0.5;
  const my = (from.y + to.y) * 0.5;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len2 = dx * dx + dy * dy;
  const half = width * 0.5;
  const n = sim.grid.query(mx, my, Math.sqrt(len2) * 0.5 + half, buf);
  const out: SimUnit[] = [];
  const ts: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = buf[i];
    if (!u.alive) continue;
    let t = len2 > 1e-9 ? ((u.pos.x - from.x) * dx + (u.pos.y - from.y) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = from.x + dx * t - u.pos.x;
    const cy = from.y + dy * t - u.pos.y;
    const r = half + u.radius;
    if (cx * cx + cy * cy > r * r) continue;
    if (filter && !filter(u)) continue;
    let k = out.length;
    out.push(u);
    ts.push(t);
    while (k > 0 && ts[k - 1] > t) {
      out[k] = out[k - 1];
      ts[k] = ts[k - 1];
      k--;
    }
    out[k] = u;
    ts[k] = t;
  }
  return out;
}

/** 圆内离圆心最近的单位；没有返回 null */
export function nearestUnit(sim: Sim, pos: Vec2, radius: number, filter?: UnitFilter): SimUnit | null {
  const list = unitsInCircle(sim, pos, radius, filter);
  return list.length > 0 ? list[0] : null;
}

// ───────────────────────── 伤害 / 治疗 ─────────────────────────

/** 技能伤害（触发 onSkillHit 钩子）。返回实际伤害 */
export function skillDamage(sim: Sim, source: SimUnit, target: SimUnit, amount: number, dtype: DamageType, slot: SkillSlot | null = null): number {
  return dealDamage(sim, source, target, amount, dtype, 'skill', slot);
}

/** 被动/装备的附带伤害（不触发钩子、不吸血）。返回实际伤害 */
export function procDamage(sim: Sim, source: SimUnit | null, target: SimUnit, amount: number, dtype: DamageType): number {
  return dealDamage(sim, source, target, amount, dtype, 'proc');
}

/** 治疗目标并发 heal 事件；withFx=true 时额外发一次 fx 'heal'（治疗绿光） */
export function heal(sim: Sim, source: SimUnit | null, target: SimUnit, amount: number, withFx = false): number {
  const got = healUnit(sim, source, target, amount);
  if (withFx && got > 0) sim.fx('heal', target.pos, target.team, { unitId: target.id });
  return got;
}

/** 回复法力，返回实际回复量 */
export function restoreMana(target: SimUnit, amount: number): number {
  if (!target.alive || !(amount > 0)) return 0;
  const before = target.mana;
  target.mana = Math.min(target.stats.maxMana, before + amount);
  return target.mana - before;
}

// ───────────────────────── Buff / 控制 / 护盾 ─────────────────────────

export { addBuff, removeBuff, removeBuffInstance, hasBuff, findBuff, buffStacks, isCcImmune };

/** 眩晕 duration 秒。目标免疫时返回 false */
export function stun(sim: Sim, target: SimUnit, duration: number, source?: SimUnit): boolean {
  return addBuff(sim, target, 'stun', { duration, sourceId: source ? source.id : -1 }) !== null;
}

/** 击飞 duration 秒（等同眩晕，渲染层会把模型抛起） */
export function knockup(sim: Sim, target: SimUnit, duration: number, source?: SimUnit): boolean {
  return addBuff(sim, target, 'airborne', { duration, sourceId: source ? source.id : -1 }) !== null;
}

/** 定身 duration 秒（不能移动，可以攻击/施法） */
export function root(sim: Sim, target: SimUnit, duration: number, source?: SimUnit): boolean {
  return addBuff(sim, target, 'root', { duration, sourceId: source ? source.id : -1 }) !== null;
}

/** 沉默 duration 秒（不能施放英雄技能） */
export function silence(sim: Sim, target: SimUnit, duration: number, source?: SimUnit): boolean {
  return addBuff(sim, target, 'silence', { duration, sourceId: source ? source.id : -1 }) !== null;
}

/**
 * 减速 pct(0..1) 持续 duration 秒。同一来源(同 key)重复施加取较强/较长者；不同来源并存，生效的是最强一层。
 * key 用来区分同一来源的不同减速(缺省按来源合并)。
 */
export function slow(sim: Sim, target: SimUnit, pct: number, duration: number, source?: SimUnit, key?: string): boolean {
  return addBuff(sim, target, 'slow', { duration, value: pct, sourceId: source ? source.id : -1, key }) !== null;
}

/** 加速 pct 持续 duration 秒（不同 key 的加速相加） */
export function haste(sim: Sim, target: SimUnit, pct: number, duration: number, source?: SimUnit, key?: string): SimBuff | null {
  return addBuff(sim, target, 'haste', { duration, value: pct, sourceId: source ? source.id : -1, key, merge: 'replace' });
}

/** 攻速加成 pct(可为负) 持续 duration 秒（不同 key 的加成相加） */
export function attackSpeedBuff(sim: Sim, target: SimUnit, pct: number, duration: number, source?: SimUnit, key?: string): SimBuff | null {
  return addBuff(sim, target, 'attack_speed', { duration, value: pct, sourceId: source ? source.id : -1, key, merge: 'replace' });
}

/**
 * 加一层护盾：吸收 amount 点伤害，持续 duration 秒。每次调用是独立的一层(给了 key 则同 key 覆盖刷新)。
 * unit.shield 自动等于所有护盾之和；受伤时先扣最早到期的。
 */
export function addShield(sim: Sim, target: SimUnit, amount: number, duration: number, source?: SimUnit, key?: string): SimBuff | null {
  return addBuff(sim, target, 'shield', { duration, value: amount, sourceId: source ? source.id : -1, key, merge: 'replace' });
}

/** 移除身上的指定几种 buff（净化）。返回是否移除了东西 */
export function cleanse(sim: Sim, target: SimUnit, ids: BuffId[]): boolean {
  let any = false;
  for (const id of ids) if (removeBuff(sim, target, id)) any = true;
  return any;
}

// ───────────────────────── 位移 ─────────────────────────

export { startDash, startLeap, displace, cancelDash, teleport };

/**
 * 闪现式瞬移到 pos：落点不可走时取最近可走点；prevPos 同步。返回实际落点(单位的 pos 引用)。
 */
export function blink(sim: Sim, unit: SimUnit, pos: Vec2): Vec2 {
  return teleport(sim, unit, pos.x, pos.y);
}

/** 把 target 朝 center 拉近至多 distance 米（不会越过中心）。免疫控制的目标不受影响 */
export function pullToward(sim: Sim, target: SimUnit, center: Vec2, distance: number, speed = 14): boolean {
  const dx = center.x - target.pos.x;
  const dy = center.y - target.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.05) return false;
  return displace(sim, target, dx, dy, Math.min(distance, d), speed);
}

/** 把 target 从 from 方向推开 distance 米 */
export function knockback(sim: Sim, target: SimUnit, from: Vec2, distance: number, speed = 16): boolean {
  let dx = target.pos.x - from.x;
  let dy = target.pos.y - from.y;
  if (Math.hypot(dx, dy) < 1e-4) {
    dx = Math.cos(target.facing + Math.PI);
    dy = Math.sin(target.facing + Math.PI);
  }
  return displace(sim, target, dx, dy, distance, speed);
}

// ───────────────────────── 投射物 / 区域 ─────────────────────────

export { spawnLinearProjectile, spawnHomingProjectile, destroyProjectile, spawnArea, removeArea };
export type { SimProjectile, SimArea };

// ───────────────────────── 调度 ─────────────────────────

/** seconds 秒(模拟时间)后执行 fn。返回句柄，可用 cancelDelay 取消 */
export function delay(sim: Sim, seconds: number, fn: () => void): Task {
  return sim.schedule(seconds, fn);
}

export function cancelDelay(sim: Sim, task: Task | null | undefined): void {
  sim.scheduler.cancel(task);
}

/**
 * 施法者存活时才执行的延迟：用于「前摇后出手」。施法者期间死亡则不执行；
 * cancelOnCC=true 时，到点若施法者正被眩晕/击飞也不执行。
 */
export function after(ctx: CastContext, seconds: number, fn: () => void, cancelOnCC = false): Task {
  const { sim, caster } = ctx;
  return sim.schedule(seconds, () => {
    if (!caster.alive) return;
    if (cancelOnCC && caster.rt.stunned) return;
    fn();
  });
}

// ───────────────────────── 特效 / 动作 / 朝向 ─────────────────────────

type FxEvent = Extract<GameEvent, { type: 'fx' }>;
export type FxExtra = Partial<Omit<FxEvent, 'type' | 'key' | 'pos' | 'team'>>;

/** 发一次性特效事件（渲染层画粒子、音频层配音）。各键需要哪些字段见 types.ts 的 FxKey 注释 */
export function fx(sim: Sim, key: FxKey, pos: Vec2, team: TeamId, extra?: FxExtra): void {
  sim.fx(key, pos, team, extra);
}

/**
 * 让单位做一个动作动画 dur 秒（如 'spin'、'cast_ult'）。moveCancel=false 表示移动不打断它(旋转/引导)。
 * dur=0 为循环动作，需要 stopAnim 结束。
 */
export function playAnim(sim: Sim, unit: SimUnit, anim: UnitAnim, dur: number, moveCancel = true): void {
  setAction(sim, unit, anim, dur, moveCancel);
}

export function stopAnim(unit: SimUnit, anim?: UnitAnim): void {
  clearAction(unit, anim);
}

/** 动作锁：seconds 秒内不能移动/普攻/施法（取与现有锁的较晚者） */
export function lockAction(sim: Sim, unit: SimUnit, seconds: number): void {
  const until = sim.state.time + seconds;
  if (until > unit.rt.lockUntil) unit.rt.lockUntil = until;
}

export function faceDir(unit: SimUnit, dir: Vec2): void {
  if (dir.x * dir.x + dir.y * dir.y > 1e-8) unit.facing = Math.atan2(dir.y, dir.x);
}

export function facePoint(unit: SimUnit, pos: Vec2): void {
  faceTo(unit, pos.x, pos.y);
}

/** 草丛中出手暴露（施法管线已自动调用；持续性技能想持续暴露可再调） */
export function revealUnit(sim: Sim, unit: SimUnit): void {
  reveal(sim, unit);
}

// ───────────────────────── 冷却 / 内部冷却 ─────────────────────────

/** 返还冷却：把剩余冷却减少「本次冷却总长 × ratio」 */
export function refundCooldown(hero: SimHero, slot: SkillSlot, ratio: number): void {
  const s = hero.skills[slot];
  s.cd = Math.max(0, s.cd - s.cdMax * ratio);
}

/** 立即刷新冷却 */
export function resetCooldown(hero: SimHero, slot: SkillSlot): void {
  hero.skills[slot].cd = 0;
}

/**
 * 被动的内部冷却：若键 key 已冷却完毕则开始新一轮 seconds 秒冷却并返回 true，否则返回 false。
 * 例：if (tryInternalCooldown(sim, hero, 'spell_shield', 60)) { ...触发... }
 */
export function tryInternalCooldown(sim: Sim, hero: SimHero, key: string, seconds: number): boolean {
  const now = sim.state.time;
  const ready = hero.h.cooldowns.get(key) ?? -Infinity;
  if (now < ready) return false;
  hero.h.cooldowns.set(key, now + seconds);
  return true;
}

/** 技能脚本的自由数值变量（挂在英雄身上，死亡不清除） */
export function getVar(hero: SimHero, key: string, fallback = 0): number {
  return hero.h.vars.get(key) ?? fallback;
}

export function setVar(hero: SimHero, key: string, value: number): void {
  hero.h.vars.set(key, value);
}

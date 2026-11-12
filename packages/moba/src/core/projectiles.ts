/**
 * 投射物：追踪弹(普攻/塔弹，必中，目标消失则熄灭) 与 直线弹(技能，沿途碰撞，可穿透)。
 * 事件：projectileSpawn → projectileHit(可多次) → projectileEnd。
 */
import { isTargetable } from './entity';
import { hideFields, type SimProjectile, type SimUnit, type UnitFilter } from './internal';
import type { ProjectileVisual, TeamId, Vec2 } from './types';
import { distSqToSegment, projectT } from './vec';
import type { Sim } from './world';

export interface HomingProjectileOpts {
  visual: ProjectileVisual;
  owner: SimUnit;
  /** 出手位置（一般就是 owner.pos） */
  from: Vec2;
  target: SimUnit;
  speed: number;
  radius?: number;
  /** 命中目标时调用 */
  onHit?: (sim: Sim, proj: SimProjectile, target: SimUnit) => boolean | void;
  onEnd?: (sim: Sim, proj: SimProjectile) => void;
}

export interface LinearProjectileOpts {
  visual: ProjectileVisual;
  owner: SimUnit;
  from: Vec2;
  /** 方向（会被归一化） */
  dir: Vec2;
  speed: number;
  /** 最大飞行距离 */
  range: number;
  /** 弹体半径（判定 = 弹体与目标身体相交） */
  radius: number;
  /** 命中后是否继续飞（穿透）。缺省 false = 命中第一个目标即销毁 */
  pierce?: boolean;
  /** 可命中对象。缺省：敌方、可被选中的英雄/小兵/野怪 */
  filter?: UnitFilter;
  /** 命中回调（每个目标至多一次）。返回 true = 命中后立即销毁（即使 pierce） */
  onHit?: (sim: Sim, proj: SimProjectile, target: SimUnit) => boolean | void;
  /** 销毁时调用（射程耗尽或命中销毁） */
  onEnd?: (sim: Sim, proj: SimProjectile) => void;
  /** 缺省取 owner.team */
  team?: TeamId;
}

function make(sim: Sim, visual: ProjectileVisual, owner: SimUnit, from: Vec2, team: TeamId): SimProjectile {
  const p: SimProjectile = {
    id: sim.allocId(), visual, team, ownerId: owner.id,
    pos: { x: from.x, y: from.y }, prevPos: { x: from.x, y: from.y }, dir: { x: 1, y: 0 },
    speed: 0, radius: 0.25, targetId: -1, traveled: 0, maxRange: 0,
    homing: false, pierce: false, dead: false, filter: null, hitIds: [], onHit: null, onEnd: null,
    basic: false, ad: 0, dtype: 'physical', vsStructure: 1, vsMinion: 1,
  };
  hideFields(p, 'filter', 'onHit', 'onEnd', 'hitIds');
  sim.projectiles.push(p);
  sim.emit({ type: 'projectileSpawn', id: p.id, visual, pos: { x: from.x, y: from.y }, ownerId: owner.id });
  return p;
}

/** 生成追踪弹：飞向目标直到命中；目标死亡/不可选中则原地熄灭 */
export function spawnHomingProjectile(sim: Sim, o: HomingProjectileOpts): SimProjectile {
  const p = make(sim, o.visual, o.owner, o.from, o.owner.team);
  p.homing = true;
  p.speed = Math.max(1, o.speed);
  p.radius = o.radius ?? 0.25;
  p.targetId = o.target.id;
  p.onHit = o.onHit ?? null;
  p.onEnd = o.onEnd ?? null;
  const dx = o.target.pos.x - o.from.x;
  const dy = o.target.pos.y - o.from.y;
  const l = Math.hypot(dx, dy);
  if (l > 1e-6) {
    p.dir.x = dx / l;
    p.dir.y = dy / l;
  }
  return p;
}

/** 生成直线弹：沿 dir 飞行 range 米，沿途与单位碰撞 */
export function spawnLinearProjectile(sim: Sim, o: LinearProjectileOpts): SimProjectile {
  const team = o.team ?? o.owner.team;
  const p = make(sim, o.visual, o.owner, o.from, team);
  const l = Math.hypot(o.dir.x, o.dir.y);
  if (l > 1e-6) {
    p.dir.x = o.dir.x / l;
    p.dir.y = o.dir.y / l;
  } else {
    p.dir.x = Math.cos(o.owner.facing);
    p.dir.y = Math.sin(o.owner.facing);
  }
  p.speed = Math.max(1, o.speed);
  p.radius = o.radius;
  p.maxRange = o.range;
  p.pierce = o.pierce === true;
  p.filter = o.filter ?? null;
  p.onHit = o.onHit ?? null;
  p.onEnd = o.onEnd ?? null;
  return p;
}

function endProjectile(sim: Sim, p: SimProjectile): void {
  if (p.dead) return;
  p.dead = true;
  sim.emit({ type: 'projectileEnd', id: p.id, visual: p.visual, pos: { x: p.pos.x, y: p.pos.y } });
  if (p.onEnd) p.onEnd(sim, p);
}

/** 主动销毁一枚投射物（技能脚本用） */
export function destroyProjectile(sim: Sim, p: SimProjectile): void {
  endProjectile(sim, p);
}

function hit(sim: Sim, p: SimProjectile, target: SimUnit): boolean {
  sim.emit({ type: 'projectileHit', id: p.id, visual: p.visual, pos: { x: p.pos.x, y: p.pos.y }, targetId: target.id });
  return p.onHit ? p.onHit(sim, p, target) === true : false;
}

function defaultFilter(p: SimProjectile, u: SimUnit): boolean {
  return u.team !== p.team && (u.kind === 'hero' || u.kind === 'minion' || u.kind === 'monster') && isTargetable(u);
}

const near: SimUnit[] = [];
const hitList: SimUnit[] = [];
const hitT: number[] = [];

function updateHoming(sim: Sim, p: SimProjectile, dt: number): void {
  const target = sim.byId.get(p.targetId);
  if (!target || !target.alive || target.rt.untargetable) {
    endProjectile(sim, p);
    return;
  }
  const dx = target.pos.x - p.pos.x;
  const dy = target.pos.y - p.pos.y;
  const d = Math.hypot(dx, dy);
  const step = p.speed * dt;
  if (d <= step + target.radius * 0.5) {
    p.pos.x = target.pos.x;
    p.pos.y = target.pos.y;
    p.traveled += d;
    hit(sim, p, target);
    endProjectile(sim, p);
    return;
  }
  p.dir.x = dx / d;
  p.dir.y = dy / d;
  p.pos.x += p.dir.x * step;
  p.pos.y += p.dir.y * step;
  p.traveled += step;
}

function updateLinear(sim: Sim, p: SimProjectile, dt: number): void {
  const remaining = p.maxRange - p.traveled;
  const step = Math.min(p.speed * dt, remaining);
  const ax = p.pos.x;
  const ay = p.pos.y;
  const bx = ax + p.dir.x * step;
  const by = ay + p.dir.y * step;

  // 收集这一步扫过的目标，按沿线先后排序
  const n = sim.grid.query((ax + bx) * 0.5, (ay + by) * 0.5, step * 0.5 + p.radius, near);
  hitList.length = 0;
  hitT.length = 0;
  for (let i = 0; i < n; i++) {
    const u = near[i];
    if (!u.alive || u.id === p.ownerId || p.hitIds.indexOf(u.id) >= 0) continue;
    if (p.filter ? !p.filter(u) : !defaultFilter(p, u)) continue;
    const r = p.radius + u.radius;
    if (distSqToSegment(u.pos.x, u.pos.y, ax, ay, bx, by) > r * r) continue;
    const t = projectT(u.pos.x, u.pos.y, ax, ay, bx, by);
    let k = hitList.length;
    hitList.push(u);
    hitT.push(t);
    while (k > 0 && hitT[k - 1] > t) {
      hitList[k] = hitList[k - 1];
      hitT[k] = hitT[k - 1];
      k--;
    }
    hitList[k] = u;
    hitT[k] = t;
  }

  if (hitList.length > 0) {
    // 命中回调可能触发新的查询/弹道，先拷贝
    const targets = hitList.slice();
    const ts = hitT.slice();
    for (let i = 0; i < targets.length; i++) {
      const u = targets[i];
      if (!u.alive) continue;
      p.hitIds.push(u.id);
      p.pos.x = ax + (bx - ax) * ts[i];
      p.pos.y = ay + (by - ay) * ts[i];
      const stop = hit(sim, p, u);
      if (p.dead) return;
      if (stop || !p.pierce) {
        p.traveled += step * ts[i];
        endProjectile(sim, p);
        return;
      }
    }
  }
  p.pos.x = bx;
  p.pos.y = by;
  p.traveled += step;
  if (p.traveled >= p.maxRange - 1e-6) endProjectile(sim, p);
}

/** 推进全部投射物一个 tick，并清理已销毁的 */
export function updateProjectiles(sim: Sim, dt: number): void {
  const list = sim.projectiles;
  // 本 tick 内新生成的投射物从下一 tick 开始飞
  const count = list.length;
  for (let i = 0; i < count; i++) {
    const p = list[i];
    if (p.dead) continue;
    p.prevPos.x = p.pos.x;
    p.prevPos.y = p.pos.y;
    if (p.homing) updateHoming(sim, p, dt);
    else updateLinear(sim, p, dt);
  }
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.dead) list[w++] = p;
  }
  list.length = w;
}

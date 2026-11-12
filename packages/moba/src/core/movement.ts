/**
 * 移动：摇杆方向 / 寻路行走 / 追击移动 / 冲刺与跃击 / 被迫位移 / 瞬移 / 单位间软分离。
 * 所有位移最终都经过 NavGrid 的碰撞函数，单位不会进墙。
 */
import { cancelWindup } from './combat';
import { isCcImmune } from './buffs';
import { MOVE_DIR, MOVE_NONE, MOVE_PATH, type DashEndReason, type DashState, type SimUnit, type UnitFilter } from './internal';
import type { UnitAnim, Vec2 } from './types';
import { distSqToSegment } from './vec';
import type { Sim } from './world';

/** 追击时目标移动超过此距离才重新规划（且受最小间隔限制） */
const REPLAN_DIST = 0.6;
const REPLAN_INTERVAL = 0.25;
/** 走不动多久后强制用 A* 重新寻路 */
const STUCK_TIME = 0.35;
/** 目标不可达时，额外推迟重新规划的时间 */
const UNREACHABLE_PENALTY = 1;
/** 软分离：允许的重叠比例、刚度、每 tick 最大推移 */
const SEP_TIGHTNESS = 0.85;
const SEP_STIFFNESS = 0.5;
const SEP_MAX_PUSH = 0.12;
/** 瞬移/跃击落点不可走时，搜索最近可走点的最大距离 */
const FAR_SEARCH = 24;

export function faceTo(u: SimUnit, x: number, y: number): void {
  const dx = x - u.pos.x;
  const dy = y - u.pos.y;
  if (dx * dx + dy * dy > 1e-8) u.facing = Math.atan2(dy, dx);
}

/** 清除移动指令与路径 */
export function stopMove(u: SimUnit): void {
  const rt = u.rt;
  rt.moveMode = MOVE_NONE;
  rt.path = null;
  rt.stuck = 0;
}

/** 摇杆方向移动（传入单位向量） */
export function orderMoveDir(u: SimUnit, x: number, y: number): void {
  const rt = u.rt;
  rt.moveMode = MOVE_DIR;
  rt.dirX = x;
  rt.dirY = y;
  rt.path = null;
}

function planPath(sim: Sim, u: SimUnit, x: number, y: number, forceSearch: boolean): void {
  const rt = u.rt;
  const nav = sim.nav;
  rt.goalX = x;
  rt.goalY = y;
  rt.pathTime = sim.state.time;
  rt.pathIdx = 0;
  rt.stuck = 0;
  if (!forceSearch && nav.segmentFree(u.pos.x, u.pos.y, x, y, rt.navR)) {
    rt.path = [{ x, y }];
    return;
  }
  const p = nav.findPath(u.pos.x, u.pos.y, x, y, rt.navR);
  rt.path = p && p.length > 0 ? p : [{ x, y }];
  // 目标走不到(只有部分路径)：推迟下一次重新规划，免得对着够不着的目标每 0.25 秒白跑一次全图搜索
  if (!p || nav.lastPathPartial) rt.pathTime += UNREACHABLE_PENALTY;
}

/** 点地板寻路移动 */
export function orderMoveTo(sim: Sim, u: SimUnit, x: number, y: number): void {
  u.rt.moveMode = MOVE_PATH;
  planPath(sim, u, x, y, false);
}

/** 沿当前路径走一个 tick。返回 true = 还没走完 */
function followPath(sim: Sim, u: SimUnit, dt: number): boolean {
  const rt = u.rt;
  const path = rt.path;
  if (!path) return false;
  const nav = sim.nav;
  const want = u.stats.moveSpeed * dt;
  let budget = want;
  const sx = u.pos.x;
  const sy = u.pos.y;
  while (budget > 1e-6 && rt.pathIdx < path.length) {
    const wp = path[rt.pathIdx];
    const dx = wp.x - u.pos.x;
    const dy = wp.y - u.pos.y;
    const d = Math.hypot(dx, dy);
    if (d <= budget) {
      if (d > 1e-6) nav.moveWithCollision(u.pos, dx, dy, rt.navR);
      budget -= d;
      rt.pathIdx++;
    } else {
      nav.moveWithCollision(u.pos, (dx / d) * budget, (dy / d) * budget, rt.navR);
      budget = 0;
    }
  }
  const mx = u.pos.x - sx;
  const my = u.pos.y - sy;
  const moved = Math.hypot(mx, my);
  if (moved > 1e-5) {
    u.facing = Math.atan2(my, mx);
    rt.moved = true;
  }
  const done = rt.pathIdx >= path.length;
  if (!done && moved < want * 0.35) {
    // 被墙角/建筑卡住：强制 A* 重新规划
    rt.stuck += dt;
    if (rt.stuck > STUCK_TIME) planPath(sim, u, rt.goalX, rt.goalY, true);
  } else {
    rt.stuck = 0;
  }
  if (done) {
    rt.path = null;
    return false;
  }
  return true;
}

/** 方向移动时，一步的实际位移不到应走距离的这个比例，就算「被正面顶住」 */
const SIDESTEP_BLOCKED = 0.35;
/** 判断障碍是不是弧面：比较正前方两侧这么远处的空旷程度 */
const SIDESTEP_PROBE = 0.6;
/** 侧面比脚下至少空旷这么多才算弧面(半径 9 米以内的圆都够得着；平直的墙是 0) */
const SIDESTEP_GAIN = 0.02;

/**
 * 正面顶在圆形建筑(水晶 / 防御塔)或墙的凸角上时，距离场只会把这一步原样推回来，英雄就钉在原地——
 * 键盘按住 W+D 从泉水走向中路正好对着己方水晶的中心。这里朝更开阔的一侧横移一步；错开之后不再是正对，
 * 接着就自然贴着弧面滑过去。平直的墙两侧一样空旷、凹角两侧更窄：都不处理，顶墙就该停住。
 */
function sidestep(sim: Sim, u: SimUnit, step: number): boolean {
  const rt = u.rt;
  const nav = sim.nav;
  const tx = -rt.dirY;
  const ty = rt.dirX;
  const here = nav.clearanceAt(u.pos.x, u.pos.y);
  const left = nav.clearanceAt(u.pos.x + tx * SIDESTEP_PROBE, u.pos.y + ty * SIDESTEP_PROBE);
  const right = nav.clearanceAt(u.pos.x - tx * SIDESTEP_PROBE, u.pos.y - ty * SIDESTEP_PROBE);
  if (Math.max(left, right) - here < SIDESTEP_GAIN) return false;
  // 两侧一样时固定取左侧(模拟层要确定性)
  const side = left >= right ? step : -step;
  return nav.moveWithCollision(u.pos, tx * side, ty * side, rt.navR);
}

/** 执行英雄的移动指令（摇杆方向或寻路） */
export function updateOrderedMove(sim: Sim, u: SimUnit, dt: number): void {
  const rt = u.rt;
  if (rt.moveMode === MOVE_DIR) {
    const step = u.stats.moveSpeed * dt;
    const sx = u.pos.x;
    const sy = u.pos.y;
    sim.nav.moveWithCollision(u.pos, rt.dirX * step, rt.dirY * step, rt.navR);
    // 面向输入方向（贴墙滑动时朝向不抖）
    u.facing = Math.atan2(rt.dirY, rt.dirX);
    const mx = u.pos.x - sx;
    const my = u.pos.y - sy;
    const moved2 = mx * mx + my * my;
    if (moved2 > 1e-10) rt.moved = true;
    // 这一步几乎没走动(正面顶在障碍上)：看看是不是顶在弧面上，是就朝开阔的一侧错开
    if (moved2 < step * step * SIDESTEP_BLOCKED * SIDESTEP_BLOCKED && sidestep(sim, u, step)) rt.moved = true;
  } else if (rt.moveMode === MOVE_PATH) {
    if (rt.path === null) planPath(sim, u, rt.goalX, rt.goalY, false);
    if (!followPath(sim, u, dt)) rt.moveMode = MOVE_NONE;
  }
}

/**
 * 朝一个(可能在移动的)目标点走一个 tick：自动维护路径，目标挪动或路径过期时重新规划。
 * 给 AI 单位追击、英雄「走过去打」使用。
 */
export function moveToward(sim: Sim, u: SimUnit, x: number, y: number, dt: number): void {
  const rt = u.rt;
  const time = sim.state.time;
  const gdx = x - rt.goalX;
  const gdy = y - rt.goalY;
  const age = time - rt.pathTime;
  const path = rt.path;
  if (path === null) {
    // 刚规划过(或刚发现目标不可达)又走完了：等一会儿再规划，保证每个单位的寻路频率有上限
    if (age < REPLAN_INTERVAL) return;
    planPath(sim, u, x, y, false);
  } else if (age > 2 || (age >= REPLAN_INTERVAL && gdx * gdx + gdy * gdy > REPLAN_DIST * REPLAN_DIST)) {
    planPath(sim, u, x, y, false);
  } else if (path.length === 1 && rt.pathIdx === 0) {
    // 直线可达的情况下每 tick 直接跟住目标，不必等重新规划
    path[0].x = x;
    path[0].y = y;
  }
  followPath(sim, u, dt);
}

/** 不寻路，直接朝 (x, y) 走一个 tick（遇墙滑动）。用于小兵沿兵线行进 */
export function stepToward(sim: Sim, u: SimUnit, x: number, y: number, dt: number): boolean {
  const dx = x - u.pos.x;
  const dy = y - u.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.05) return false;
  const step = Math.min(d, u.stats.moveSpeed * dt);
  const sx = u.pos.x;
  const sy = u.pos.y;
  sim.nav.moveWithCollision(u.pos, (dx / d) * step, (dy / d) * step, u.rt.navR);
  const mx = u.pos.x - sx;
  const my = u.pos.y - sy;
  if (mx * mx + my * my > 1e-10) {
    u.facing = Math.atan2(dy, dx);
    u.rt.moved = true;
    return true;
  }
  return false;
}

/**
 * 瞬移到 (x, y)（落点不可走时取最近可走点）。prevPos 同步，渲染不会插值出一条拖影。
 * 返回实际落点。
 */
export function teleport(sim: Sim, u: SimUnit, x: number, y: number): Vec2 {
  const rt = u.rt;
  // 落点周围大片不可走(瞄到了图外很远)时 nearestFree 不改写位置：留在原地
  sim.nav.nearestFree(x, y, rt.navR, u.pos, FAR_SEARCH);
  u.prevPos.x = u.pos.x;
  u.prevPos.y = u.pos.y;
  rt.path = null;
  if (rt.moveMode === MOVE_PATH) rt.moveMode = MOVE_NONE;
  sim.grid.rebuild(sim.units);
  return u.pos;
}

// ───────────────────────── 冲刺 / 跃击 / 被迫位移 ─────────────────────────

export interface DashOpts {
  /** 方向（会被归一化；零向量则沿当前朝向） */
  dir: Vec2;
  distance: number;
  /** 米/秒 */
  speed: number;
  /** 位移期间的动作，缺省 'dash'；null = 不改变动作 */
  anim?: UnitAnim | null;
  /** 途中命中判定半径（判定 = 路径胶囊与目标身体相交）。需配合 onHit */
  hitRadius?: number;
  /** 途中命中的过滤器（缺省：任何存活的其他单位） */
  filter?: UnitFilter;
  /** 途中每碰到一个单位调用一次；返回 true = 立即停下(结束原因 'hit') */
  onHit?: (target: SimUnit) => boolean | void;
  /** 位移结束回调（到达/撞墙/命中停下/被打断） */
  onEnd?: (reason: DashEndReason) => void;
  /** 穿墙：途中不做地形碰撞，结束时落到最近可走点 */
  ignoreWalls?: boolean;
}

function newDash(sim: Sim, mode: DashState['mode']): DashState {
  return {
    mode, dirX: 1, dirY: 0, speed: 0, left: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, t: 0, dur: 0, startTime: sim.state.time,
    ignoreWalls: false, hitRadius: -1, filter: null, hitIds: [], onHit: null, onEnd: null, anim: null,
  };
}

/** 开始一段冲刺位移：按 speed 沿 dir 前进 distance，撞墙停止。位移期间单位不能做其他动作 */
export function startDash(sim: Sim, u: SimUnit, opts: DashOpts): boolean {
  if (!u.alive) return false;
  const rt = u.rt;
  if (rt.dash) cancelDash(sim, u, 'interrupted');
  cancelWindup(u);
  let dx = opts.dir.x;
  let dy = opts.dir.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-6) {
    dx = Math.cos(u.facing);
    dy = Math.sin(u.facing);
  } else {
    dx /= l;
    dy /= l;
  }
  const d = newDash(sim, 'dash');
  d.dirX = dx;
  d.dirY = dy;
  d.speed = Math.max(0.1, opts.speed);
  d.left = Math.max(0, opts.distance);
  d.dur = d.left / d.speed;
  d.ignoreWalls = opts.ignoreWalls === true;
  d.hitRadius = opts.onHit ? (opts.hitRadius ?? u.radius) : -1;
  d.filter = opts.filter ?? null;
  d.onHit = opts.onHit ?? null;
  d.onEnd = opts.onEnd ?? null;
  d.anim = opts.anim === undefined ? 'dash' : opts.anim;
  rt.dash = d;
  rt.path = null;
  u.facing = Math.atan2(dy, dx);
  return true;
}

/**
 * 跃向落点：duration 秒内从当前位置线性插值到落点(无视地形)，anim='leap'(渲染层按进度画抛物线)。
 * 落点不可走时取最近可走点。
 */
export function startLeap(sim: Sim, u: SimUnit, toX: number, toY: number, duration: number, onEnd?: (reason: DashEndReason) => void): boolean {
  if (!u.alive) return false;
  const rt = u.rt;
  if (rt.dash) cancelDash(sim, u, 'interrupted');
  cancelWindup(u);
  const dest = { x: u.pos.x, y: u.pos.y };
  // 落点周围找不到可走点(瞄到了图外很远)就原地起跳
  sim.nav.nearestFree(toX, toY, rt.navR, dest, FAR_SEARCH);
  const d = newDash(sim, 'leap');
  d.fromX = u.pos.x;
  d.fromY = u.pos.y;
  d.toX = dest.x;
  d.toY = dest.y;
  d.dur = Math.max(0.05, duration);
  d.ignoreWalls = true;
  d.onEnd = onEnd ?? null;
  d.anim = 'leap';
  rt.dash = d;
  rt.path = null;
  faceTo(u, dest.x, dest.y);
  return true;
}

/**
 * 被迫位移（拉拽/击退）：目标沿 (dirX, dirY) 被移动 distance，撞墙停止。
 * 免疫控制的单位(霸体/建筑/史诗野怪)不受影响，返回 false。
 */
export function displace(sim: Sim, target: SimUnit, dirX: number, dirY: number, distance: number, speed: number): boolean {
  if (!target.alive || target.rt.weight === 0 || isCcImmune(target, 'airborne')) return false;
  const l = Math.hypot(dirX, dirY);
  if (l < 1e-6 || distance <= 0) return false;
  const rt = target.rt;
  if (rt.dash) cancelDash(sim, target, 'interrupted');
  cancelWindup(target);
  const d = newDash(sim, 'forced');
  d.dirX = dirX / l;
  d.dirY = dirY / l;
  d.speed = Math.max(0.1, speed);
  d.left = distance;
  d.dur = distance / d.speed;
  rt.dash = d;
  rt.path = null;
  return true;
}

function finishDash(sim: Sim, u: SimUnit, d: DashState, reason: DashEndReason): void {
  const rt = u.rt;
  if (rt.dash !== d) return;
  rt.dash = null;
  if (d.ignoreWalls && !sim.nav.isFree(u.pos.x, u.pos.y, rt.navR - 0.05)) {
    sim.nav.nearestFree(u.pos.x, u.pos.y, rt.navR, u.pos, FAR_SEARCH);
  }
  if (d.onEnd) d.onEnd(reason);
}

/** 中止单位当前的位移（触发其 onEnd） */
export function cancelDash(sim: Sim, u: SimUnit, reason: DashEndReason = 'interrupted'): void {
  const d = u.rt.dash;
  if (d) finishDash(sim, u, d, reason);
}

const dashNear: SimUnit[] = [];

/** 推进位移一个 tick */
export function updateDash(sim: Sim, u: SimUnit, dt: number): void {
  const rt = u.rt;
  const d = rt.dash;
  if (!d) return;
  const px = u.pos.x;
  const py = u.pos.y;
  let end: DashEndReason | null = null;
  if (d.mode === 'leap') {
    d.t += dt;
    const k = d.t >= d.dur ? 1 : d.t / d.dur;
    u.pos.x = d.fromX + (d.toX - d.fromX) * k;
    u.pos.y = d.fromY + (d.toY - d.fromY) * k;
    if (k >= 1) end = 'arrived';
  } else {
    const step = Math.min(d.left, d.speed * dt);
    if (d.ignoreWalls) {
      u.pos.x += d.dirX * step;
      u.pos.y += d.dirY * step;
    } else {
      const moved = sim.nav.moveStraight(u.pos, d.dirX, d.dirY, step, rt.navR);
      if (moved < step - 1e-4) end = 'wall';
    }
    d.left -= step;
    if (!end && d.left <= 1e-6) end = 'arrived';
  }

  if (d.onHit && d.hitRadius >= 0) {
    const mx = (px + u.pos.x) * 0.5;
    const my = (py + u.pos.y) * 0.5;
    const half = Math.hypot(u.pos.x - px, u.pos.y - py) * 0.5;
    const n = sim.grid.query(mx, my, half + d.hitRadius, dashNear);
    // 回调里可能再次触发查询，先拷贝候选
    const cands = n > 0 ? dashNear.slice() : dashNear;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (c === u || !c.alive || d.hitIds.indexOf(c.id) >= 0) continue;
      if (d.filter && !d.filter(c)) continue;
      const r = d.hitRadius + c.radius;
      if (distSqToSegment(c.pos.x, c.pos.y, px, py, u.pos.x, u.pos.y) > r * r) continue;
      d.hitIds.push(c.id);
      const stop = d.onHit(c);
      if (rt.dash !== d) return; // 回调里取消/替换了这段位移
      if (stop === true) {
        end = 'hit';
        break;
      }
    }
  }
  if (end) finishDash(sim, u, d, end);
}

// ───────────────────────── 软分离 ─────────────────────────

const sepNear: SimUnit[] = [];

function mobile(u: SimUnit): boolean {
  return u.alive && u.kind !== 'tower' && u.kind !== 'core' && u.rt.dash === null;
}

/**
 * 单位间软分离：重叠的单位互相推开一点，让人群自然散开而不硬挡路。
 * 重的单位(英雄/大野怪)更难被推动；史诗野怪完全不动。
 */
export function separate(sim: Sim): void {
  const units = sim.units;
  const grid = sim.grid;
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (!mobile(a)) continue;
    const n = grid.query(a.pos.x, a.pos.y, a.radius, sepNear);
    for (let k = 0; k < n; k++) {
      const b = sepNear[k];
      // 每对只处理一次
      if (b.id <= a.id || !mobile(b)) continue;
      const wa = a.rt.weight;
      const wb = b.rt.weight;
      if (wa === 0 && wb === 0) continue;
      let dx = a.pos.x - b.pos.x;
      let dy = a.pos.y - b.pos.y;
      const min = (a.radius + b.radius) * SEP_TIGHTNESS;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) {
        // 完全重合：按 id 取一个确定的方向
        const ang = (a.id * 2.399963 + b.id) % (Math.PI * 2);
        dx = Math.cos(ang);
        dy = Math.sin(ang);
        d = 1;
      }
      const push = (min - d) * SEP_STIFFNESS;
      const sa = wa === 0 ? 0 : wb === 0 ? 1 : wb / (wa + wb);
      const sb = wb === 0 ? 0 : wa === 0 ? 1 : wa / (wa + wb);
      const ux = dx / d;
      const uy = dy / d;
      a.rt.pushX += ux * push * sa;
      a.rt.pushY += uy * push * sa;
      b.rt.pushX -= ux * push * sb;
      b.rt.pushY -= uy * push * sb;
    }
  }
  const nav = sim.nav;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const rt = u.rt;
    if (rt.pushX === 0 && rt.pushY === 0) continue;
    let px = rt.pushX;
    let py = rt.pushY;
    rt.pushX = 0;
    rt.pushY = 0;
    if (!u.alive) continue;
    const l = Math.hypot(px, py);
    if (l > SEP_MAX_PUSH) {
      px = (px / l) * SEP_MAX_PUSH;
      py = (py / l) * SEP_MAX_PUSH;
    }
    nav.moveWithCollision(u.pos, px, py, rt.navR);
  }
}

/**
 * 区域效果：持续存在一段时间的地面/跟随效果（预警圈、减速场、持续伤害区…）。
 * 引擎只负责计时、跟随、周期回调与事件；具体效果由回调里的技能脚本决定。
 */
import type { SimArea, SimUnit } from './internal';
import type { AreaVisual, TeamId, Vec2 } from './types';
import type { Sim } from './world';

export interface AreaOpts {
  visual: AreaVisual;
  /** 归属单位（决定 team/ownerId） */
  owner: SimUnit;
  pos: Vec2;
  radius: number;
  duration: number;
  /** 跟随某单位移动（如自身光环）；该单位死亡时区域随之结束(除非 endWithFollow=false) */
  follow?: SimUnit;
  endWithFollow?: boolean;
  /** 周期回调间隔（秒）。0/缺省 = 不周期触发 */
  tickInterval?: number;
  /** 首次周期回调的延迟，缺省 = tickInterval（传 0 则生成后的下一 tick 立即触发一次） */
  firstTick?: number;
  onTick?: (sim: Sim, area: SimArea) => void;
  /** 结束回调。expired=true 自然到期；false 被提前移除 */
  onEnd?: (sim: Sim, area: SimArea, expired: boolean) => void;
  team?: TeamId;
}

export function spawnArea(sim: Sim, o: AreaOpts): SimArea {
  const interval = o.tickInterval ?? 0;
  const a: SimArea = {
    id: sim.allocId(), visual: o.visual, team: o.team ?? o.owner.team, ownerId: o.owner.id,
    pos: { x: o.pos.x, y: o.pos.y }, radius: o.radius, age: 0, duration: o.duration,
    followUnitId: o.follow ? o.follow.id : -1,
    tickInterval: interval, tickLeft: o.firstTick ?? interval, dead: false, endWithFollow: o.endWithFollow !== false,
    onTick: o.onTick ?? null, onEnd: o.onEnd ?? null,
  };
  sim.areas.push(a);
  sim.emit({ type: 'areaSpawn', id: a.id, visual: a.visual, pos: { x: a.pos.x, y: a.pos.y }, radius: a.radius, duration: a.duration });
  return a;
}

function endArea(sim: Sim, a: SimArea, expired: boolean): void {
  if (a.dead) return;
  a.dead = true;
  sim.emit({ type: 'areaEnd', id: a.id, visual: a.visual, pos: { x: a.pos.x, y: a.pos.y } });
  if (a.onEnd) a.onEnd(sim, a, expired);
}

/** 提前移除一个区域（触发 onEnd(expired=false)） */
export function removeArea(sim: Sim, a: SimArea): void {
  endArea(sim, a, false);
}

export function updateAreas(sim: Sim, dt: number): void {
  const list = sim.areas;
  const count = list.length;
  for (let i = 0; i < count; i++) {
    const a = list[i];
    if (a.dead) continue;
    if (a.followUnitId >= 0) {
      const f = sim.byId.get(a.followUnitId);
      if (f && f.alive) {
        a.pos.x = f.pos.x;
        a.pos.y = f.pos.y;
      } else if (a.endWithFollow) {
        endArea(sim, a, false);
        continue;
      }
    }
    a.age += dt;
    if (a.tickInterval > 0 && a.onTick) {
      a.tickLeft -= dt;
      // 一个 tick 内最多触发一次即可：间隔不会小于一个模拟 tick
      if (a.tickLeft <= 1e-9 && a.age <= a.duration + 1e-9) {
        a.tickLeft += a.tickInterval;
        a.onTick(sim, a);
        if (a.dead) continue;
      }
    }
    if (a.age >= a.duration - 1e-9) endArea(sim, a, true);
  }
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.dead) list[w++] = a;
  }
  list.length = w;
}

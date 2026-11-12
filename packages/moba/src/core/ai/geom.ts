/**
 * Bot 用的几何小工具：距离、兵线的「队伍相对进度」坐标。
 * 进度 p：沿兵线从己方基地(0)到敌方基地(total)的弧长，蓝红双方用同一套逻辑而不必区分方向。
 */
import { LanePath } from '../lanes';
import type { LaneId, MapData, PlayerTeam, Unit, Vec2 } from '../types';

export const LANES: LaneId[] = ['top', 'mid', 'bot'];

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** a 到单位 u 身体边缘的距离 */
export function edgeDist(a: Vec2, u: Unit): number {
  return Math.hypot(u.pos.x - a.x, u.pos.y - a.y) - u.radius;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** 三条兵线的弧长参数化 + 队伍相对坐标（每张地图一份，全体 Bot 共用） */
export class LaneGeo {
  readonly paths: Record<LaneId, LanePath>;
  /** prog() 的附带输出：该点到兵线的垂直距离 */
  lateral = 0;

  constructor(map: MapData) {
    this.paths = { top: new LanePath(map.lanes.top), mid: new LanePath(map.lanes.mid), bot: new LanePath(map.lanes.bot) };
  }

  total(lane: LaneId): number {
    return this.paths[lane].total;
  }

  /** (x, y) 在 lane 上的进度（0 = 己方基地端） */
  prog(team: PlayerTeam, lane: LaneId, x: number, y: number): number {
    const path = this.paths[lane];
    const s = path.project(x, y);
    this.lateral = path.lateral;
    return team === 0 ? s : path.total - s;
  }

  /** 进度 p 处的点；side = 横向偏移（米，沿前进方向的左手侧为正） */
  point(team: PlayerTeam, lane: LaneId, p: number, out: Vec2, side = 0): Vec2 {
    const path = this.paths[lane];
    path.pointAt(team === 0 ? p : path.total - p, out);
    if (side !== 0) {
      const f = team === 0 ? 1 : -1;
      out.x += -path.ty * f * side;
      out.y += path.tx * f * side;
    }
    return out;
  }

  /** 离 (x, y) 最近的兵线；垂直距离写入 this.lateral */
  nearestLane(x: number, y: number): LaneId {
    let best: LaneId = 'mid';
    let bestD = Infinity;
    for (const lane of LANES) {
      const path = this.paths[lane];
      path.project(x, y);
      if (path.lateral < bestD) {
        bestD = path.lateral;
        best = lane;
      }
    }
    this.lateral = bestD;
    return best;
  }
}

const geoCache = new WeakMap<MapData, LaneGeo>();

export function laneGeo(map: MapData): LaneGeo {
  let g = geoCache.get(map);
  if (!g) {
    g = new LaneGeo(map);
    geoCache.set(map, g);
  }
  return g;
}

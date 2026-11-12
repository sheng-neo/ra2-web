/**
 * Bot 用的几何小工具：距离、兵线的「队伍相对进度」坐标。
 * 进度 p：沿兵线从己方基地(0)到敌方基地(total)的弧长，蓝红双方用同一套逻辑而不必区分方向。
 */
import { LanePath } from '../lanes';
import type { LaneId, MapData, PlayerTeam, Vec2 } from '../types';
import type { ConeHazard } from './types';

export const LANES: LaneId[] = ['top', 'mid', 'bot'];

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** 身体半径为 radius 的单位站在 pos，是否会被扇形 c 扫到(pad = 额外留的余量；判定方式与模拟层的吐息结算一致) */
export function inCone(pos: Vec2, radius: number, c: ConeHazard, pad = 0): boolean {
  const dx = pos.x - c.pos.x;
  const dy = pos.y - c.pos.y;
  const d = Math.hypot(dx, dy);
  const r = radius + pad;
  if (d > c.radius + r) return false;
  if (d <= r) return true;
  const off = Math.atan2(Math.abs(dy * c.dir.x - dx * c.dir.y), dx * c.dir.x + dy * c.dir.y);
  return off <= c.angle * 0.5 + Math.asin(r / d);
}

/**
 * 站在扇形危险区里该往哪边走。在扇形外(含余量 pad)返回 false；否则把单位方向写进 out 并返回 true。
 * 两条出路挑近的：绕着顶点横移出扇面(近战贴着顶点，横挪两步就出去，还能接着打)，或者直接退出半径(站得远的远程)。
 * 正好站在中轴上时朝 home 所在的一侧；walkable 用来探那一侧是不是墙，是墙就换另一侧。
 */
export function coneEscape(
  pos: Vec2, radius: number, c: ConeHazard, home: Vec2, walkable: (p: Vec2) => boolean, out: Vec2, pad = 0.4,
): boolean {
  if (!inCone(pos, radius, c, pad)) return false;
  const dx = pos.x - c.pos.x;
  const dy = pos.y - c.pos.y;
  const d = Math.hypot(dx, dy);
  const r = radius + pad;
  // 相对中轴的横向偏移：> 0 在中轴左侧(法线 (-dir.y, dir.x) 一侧)
  const lateral = dy * c.dir.x - dx * c.dir.y;
  const off = Math.atan2(Math.abs(lateral), dx * c.dir.x + dy * c.dir.y);
  const edge = c.angle * 0.5 + (d > r ? Math.asin(r / d) : Math.PI);
  const sideNeed = d * Math.max(0, edge - off);
  const backNeed = c.radius + r - d;
  if (backNeed < sideNeed && d > 0.3) {
    out.x = dx / d;
    out.y = dy / d;
    return true;
  }
  let side = lateral >= 0 ? 1 : -1;
  if (Math.abs(lateral) < 0.25) side = (home.y - pos.y) * c.dir.x - (home.x - pos.x) * c.dir.y >= 0 ? 1 : -1;
  out.x = -c.dir.y * side;
  out.y = c.dir.x * side;
  PROBE.x = pos.x + out.x * 1.6;
  PROBE.y = pos.y + out.y * 1.6;
  if (!walkable(PROBE)) {
    out.x = -out.x;
    out.y = -out.y;
  }
  return true;
}

const PROBE: Vec2 = { x: 0, y: 0 };

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

/**
 * 地图「星陨高原」布局数据（模拟层与渲染层共用的唯一事实来源）。
 *
 * 经典三路对称图：蓝方基地在西南角，红方在东北角；中路沿对角线，上路走西边+北边，
 * 下路走南边+东边；河道沿另一条对角线(西北→东南)，把四块野区分成蓝/红两侧。
 * 整张图关于两条对角线都对称，所以只手工编写「西野区」(蓝方上半野区)的一份几何，
 * 其余三份由 mirrorTeam / mirrorLane 生成。
 */
import type { BaseDef, CampDef, LaneId, MapData, MonsterType, PlayerTeam, Polygon, TeamId, TowerSpot, Vec2 } from './types';

/** 可行走范围半边长 */
export const MAP_BOUND = 57.5;
/** 地图总半边长（含边缘装饰带） */
export const MAP_HALF = 76;

const v = (x: number, y: number): Vec2 => ({ x, y });

/** 蓝 ↔ 红：沿河道(y = x)翻转 */
export const mirrorTeam = (p: Vec2): Vec2 => ({ x: p.y, y: p.x });
/** 上半区 ↔ 下半区：沿中路(y = −x)翻转 */
export const mirrorLane = (p: Vec2): Vec2 => ({ x: -p.y, y: -p.x });

const IDENT = (p: Vec2): Vec2 => ({ x: p.x, y: p.y });
const BOTH = (p: Vec2): Vec2 => mirrorTeam(mirrorLane(p));

/** 一份西野区几何 → 四个象限 */
function fourfold(poly: Polygon): Polygon[] {
  return [IDENT, mirrorLane, mirrorTeam, BOTH].map((f) => poly.map(f));
}

// ───────────── 西野区(蓝方上半野区)的墙体 ─────────────
// 上路走廊 x∈[-57,-47]；中路走廊边界 y = -x - 7.5；河道边界 y = x + 7.5。
const WEST_WALLS: Polygon[] = [
  // 基地北墙 + 上路/中路之间的山体
  [v(-46.5, 35), v(-42.5, 35), v(-30.5, 23), v(-34, 17.5), v(-46.5, 19)],
  // 上路内侧长墙
  [v(-46.5, 13), v(-41.5, 12.5), v(-41, -11.5), v(-46.5, -12)],
  // 上路与河道夹角的大山体
  [v(-46.5, -18), v(-40.5, -18.5), v(-34, -19.5), v(-30.5, -23), v(-46.5, -39)],
  // 中路内侧墙
  [v(-26, 18.5), v(-14, 6.5), v(-17.5, 3), v(-29.5, 15)],
  // 河道内侧墙
  [v(-14, -6.5), v(-25, -17.5), v(-28.5, -14), v(-17.5, -3)],
  // 野区中央山体
  [v(-36, 6), v(-30, 7), v(-24.5, 1.5), v(-25, -3), v(-31, -7.5), v(-36, -6.5)],
];

// ───────────── 西野区及相邻兵线的草丛 ─────────────
const WEST_BUSHES: Polygon[] = [
  // 上路外侧草(靠近兵线交汇处)
  [v(-57.3, -40), v(-54.6, -40), v(-54.6, -31), v(-57.3, -31)],
  // 上路进野区入口草
  [v(-46.3, 13.6), v(-42.2, 13.4), v(-42.2, 18.6), v(-46.3, 18.6)],
  // 中路侧翼草(野区入口)
  [v(-30, 22.5), v(-26.5, 19), v(-29, 16.5), v(-32, 20)],
  // 河道草(史诗野怪坑旁)
  [v(-25.5, -18), v(-30, -22.5), v(-32, -20.5), v(-27.5, -16)],
  // 中心三角草
  [v(-14, 4), v(-10.5, 1.2), v(-10.5, -1.2), v(-14, -4)],
];

// 上/下路拐角草(自身关于河道对称，只需沿中路再镜像一次)
const CORNER_BUSH: Polygon = [v(-57.3, -57.3), v(-51, -57.3), v(-57.3, -51)];

interface CampSeed {
  monsterType: MonsterType;
  pos: Vec2;
  spawns: Vec2[];
  firstSpawn: number;
  respawn: number;
}

/** 西野区营地（增益怪类型在上/下半区不同：上半区霜晶，下半区炽焰） */
const WEST_CAMPS: CampSeed[] = [
  { monsterType: 'frost_golem', pos: v(-36.5, 12.5), spawns: [v(0, 0)], firstSpawn: 25, respawn: 90 },
  { monsterType: 'glimwing', pos: v(-35, -13), spawns: [v(-1.0, -0.2), v(1.0, 0.3)], firstSpawn: 25, respawn: 55 },
  { monsterType: 'mossback', pos: v(-20.5, 0), spawns: [v(0, 0)], firstSpawn: 25, respawn: 55 },
];

function buildCamps(): CampDef[] {
  const out: CampDef[] = [];
  const quads: { f: (p: Vec2) => Vec2; side: TeamId; lower: boolean }[] = [
    { f: IDENT, side: 0, lower: false },
    { f: mirrorLane, side: 0, lower: true },
    { f: mirrorTeam, side: 1, lower: false },
    { f: BOTH, side: 1, lower: true },
  ];
  for (const q of quads) {
    for (const c of WEST_CAMPS) {
      const type: MonsterType = c.monsterType === 'frost_golem' && q.lower ? 'ember_golem' : c.monsterType;
      const pos = q.f(c.pos);
      out.push({
        id: out.length,
        side: q.side,
        monsterType: type,
        pos,
        // 偏移量按同样的镜像变换（变换是线性的，直接作用于偏移向量）
        spawns: c.spawns.map((s) => q.f(s)),
        firstSpawn: c.firstSpawn,
        respawn: c.respawn,
      });
    }
  }
  // 河道史诗野怪
  out.push({ id: out.length, side: 2, monsterType: 'abyss_drake', pos: v(-24, -24), spawns: [v(0, 0)], firstSpawn: 120, respawn: 150 });
  out.push({ id: out.length, side: 2, monsterType: 'star_colossus', pos: v(24, 24), spawns: [v(0, 0)], firstSpawn: 270, respawn: 210 });
  return out;
}

// ───────────── 兵线 ─────────────
const TOP_LANE: Vec2[] = [v(-52, 42), v(-52, -45), v(-51, -49), v(-49, -51), v(-45, -52), v(42, -52)];
const LANES: Record<LaneId, Vec2[]> = {
  top: TOP_LANE,
  mid: [v(-43, 43), v(-36, 36), v(0, 0), v(36, -36), v(43, -43)],
  bot: TOP_LANE.map(mirrorLane),
};

// ───────────── 基地 / 防御塔 ─────────────
function buildBase(team: PlayerTeam): BaseDef {
  const f = team === 0 ? IDENT : mirrorTeam;
  const fountain = v(-54, 54);
  const spawnOffsets = [v(0, 0), v(1.8, 0.6), v(-0.6, -1.8), v(1.6, -1.6), v(2.8, -2.8)];
  return {
    team,
    core: f(v(-47, 47)),
    fountain: f(fountain),
    fountainRadius: 4.5,
    spawns: spawnOffsets.map((o) => f(v(fountain.x + o.x, fountain.y + o.y))),
    minionSpawn: {
      top: f(v(-52, 37)),
      mid: f(v(-41, 41)),
      // 红方的 top/bot 仍指同一条物理兵线：mirrorTeam 把上路映到上路
      bot: f(v(-37, 52)),
    },
    area: [v(-57.5, 32), v(-39.5, 32), v(-32, 39.5), v(-32, 57.5), v(-57.5, 57.5)].map(f),
  };
}

const BLUE_TOWERS: { lane: LaneId; tier: 1 | 2 | 3; pos: Vec2 }[] = [
  { lane: 'top', tier: 3, pos: v(-48.6, 27) },
  { lane: 'top', tier: 2, pos: v(-55.4, 4) },
  { lane: 'top', tier: 1, pos: v(-48.6, -24) },
  { lane: 'mid', tier: 3, pos: v(-32.4, 27.6) },
  { lane: 'mid', tier: 2, pos: v(-18.6, 23.4) },
  { lane: 'mid', tier: 1, pos: v(-12.9, 8.1) },
  { lane: 'bot', tier: 3, pos: mirrorLane(v(-48.6, 27)) },
  { lane: 'bot', tier: 2, pos: mirrorLane(v(-55.4, 4)) },
  { lane: 'bot', tier: 1, pos: mirrorLane(v(-48.6, -24)) },
];

function buildTowers(): TowerSpot[] {
  const out: TowerSpot[] = [];
  for (const t of BLUE_TOWERS) out.push({ team: 0, lane: t.lane, tier: t.tier, pos: t.pos });
  for (const t of BLUE_TOWERS) out.push({ team: 1, lane: t.lane, tier: t.tier, pos: mirrorTeam(t.pos) });
  return out;
}

export function createMap(): MapData {
  return {
    bound: MAP_BOUND,
    half: MAP_HALF,
    lanes: LANES,
    laneWidth: 10,
    bases: [buildBase(0), buildBase(1)],
    towers: buildTowers(),
    walls: WEST_WALLS.flatMap(fourfold),
    bushes: [...WEST_BUSHES.flatMap(fourfold), CORNER_BUSH, CORNER_BUSH.map(mirrorLane)],
    camps: buildCamps(),
    river: [v(-52, -52), v(0, 0), v(52, 52)],
    riverWidth: 10.6,
  };
}

// ───────────── 通用几何工具 ─────────────

export function pointInPolygon(p: Vec2, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** 点到多边形边界的最短距离（内部也返回正值） */
export function distToPolygonEdge(p: Vec2, poly: Polygon): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSegment(p, poly[j], poly[i]));
  return d;
}

/** 点到折线的最短距离 */
export function distToPolyline(p: Vec2, line: Vec2[]): number {
  let d = Infinity;
  for (let i = 1; i < line.length; i++) d = Math.min(d, distToSegment(p, line[i - 1], line[i]));
  return d;
}

/** 静态地形是否可走（不考虑防御塔等单位）：在边界内且不在任何墙体内 */
export function isWalkableTerrain(map: MapData, p: Vec2): boolean {
  if (Math.abs(p.x) > map.bound || Math.abs(p.y) > map.bound) return false;
  for (const w of map.walls) if (pointInPolygon(p, w)) return false;
  return true;
}

/** 所在草丛下标，不在草丛返回 -1 */
export function bushAt(map: MapData, p: Vec2): number {
  for (let i = 0; i < map.bushes.length; i++) if (pointInPolygon(p, map.bushes[i])) return i;
  return -1;
}

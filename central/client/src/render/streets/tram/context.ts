/**
 * 电车布置用的场景查询（纯函数，模拟坐标米）：路面高程、头顶桥底、楼、敏感区、车行道、一般车道中心线、过路处。
 * 运行时（streets/index.ts）与单元测试共用同一份，保证测的就是画出来的。
 */
import type { CityFile } from '@central/data';
import type { HeightFn } from '../../../data/terrain';
import { footprintTest } from '../../road-corridor';
import { centreZ, type RoadPlan } from '../../roads';
import { footbridgeTiers, isFootbridge } from '../footbridges';
import { LANE_SPEED, laneSlots } from '../lanes';
import { inZones } from '../surface';
import type { OverheadContext } from './overhead';
import type { RouteContext } from './route';
import type { LaneLine, StopContext } from './stops';

/** 天桥每层高（m）与桥面厚（m）：与 footbridges.ts 相同。 */
const FOOTBRIDGE_TIER_M = 6;
const FOOTBRIDGE_DECK_M = 0.6;
/** 高架车行桥的桥面厚（m）：与 roads.ts DECK_DM 相同。 */
const ROAD_DECK_M = 1.2;

/** 线段空间索引（模拟坐标米）：[ax, ay, bx, by, 半宽, 值]。 */
class SegIndex {
  private readonly cells = new Map<number, number[]>();
  readonly segs: number[] = [];
  constructor(private readonly cell = 20) {}
  private key(i: number, j: number): number {
    return (i + 2000) * 4000 + (j + 2000);
  }
  add(ax: number, ay: number, bx: number, by: number, hw: number, value: number): void {
    const id = this.segs.length / 6;
    this.segs.push(ax, ay, bx, by, hw, value);
    const c = this.cell;
    for (let i = Math.floor((Math.min(ax, bx) - hw) / c); i <= Math.floor((Math.max(ax, bx) + hw) / c); i++)
      for (let j = Math.floor((Math.min(ay, by) - hw) / c); j <= Math.floor((Math.max(ay, by) + hw) / c); j++) {
        const k = this.key(i, j);
        const list = this.cells.get(k);
        if (list) list.push(id);
        else this.cells.set(k, [id]);
      }
  }
  /** 覆盖 (x, y) 的线段的 value（距离 ≤ 半宽 + margin），按 reduce 合并；没有返回 null。 */
  query(x: number, y: number, margin: number, pick: (a: number, b: number) => number, at?: (id: number, t: number) => number): number | null {
    let out: number | null = null;
    for (const id of this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(y / this.cell))) ?? []) {
      const o = id * 6;
      const ax = this.segs[o]!;
      const ay = this.segs[o + 1]!;
      const dx = this.segs[o + 2]! - ax;
      const dy = this.segs[o + 3]! - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / l2, 0), 1) : 0;
      if (Math.hypot(ax + t * dx - x, ay + t * dy - y) > this.segs[o + 4]! + margin) continue;
      const v = at ? at(id, t) : this.segs[o + 5]!;
      out = out === null ? v : pick(out, v);
    }
    return out;
  }
}

export interface TramContext {
  route: RouteContext;
  stops: StopContext;
  overhead: OverheadContext;
}

/**
 * city：城市数据；plans：planRoads 的结果；ground：原始地形（dm）；surface：看得见的地面（dm，RenderedSurface.heightAt）。
 */
export function tramContext(city: CityFile, plans: readonly RoadPlan[], ground: HeightFn, surface: HeightFn): TramContext {
  const surfaceM = (x: number, y: number) => surface(x * 10, y * 10) / 10;
  const zones = city.zones.sensitive;
  const inZone = (x: number, y: number) => inZones(zones, x * 10, y * 10);
  const fp = footprintTest(city.buildings);
  const inBuilding = (x: number, y: number) => fp(x * 10, y * 10);

  // 桥底：天桥（footway / pedestrian 的 level / bridge）与高架车行道
  const bridges = new SegIndex(20);
  const soffitAt: number[] = [];
  for (const r of city.roads) {
    if (!isFootbridge(r)) continue;
    const tiers = footbridgeTiers(r);
    const p = r.pts;
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2]! / 10;
      const ay = p[i - 1]! / 10;
      const bx = p[i]! / 10;
      const by = p[i + 1]! / 10;
      const za = ground(p[i - 2]!, p[i - 1]!) / 10 + tiers * FOOTBRIDGE_TIER_M - FOOTBRIDGE_DECK_M;
      const zb = ground(p[i]!, p[i + 1]!) / 10 + tiers * FOOTBRIDGE_TIER_M - FOOTBRIDGE_DECK_M;
      soffitAt.push(za, zb);
      bridges.add(ax, ay, bx, by, 2.4, soffitAt.length / 2 - 1);
    }
  }
  for (const pl of plans) {
    if (pl.elev <= 0) continue;
    for (let i = 1; i < pl.along.length; i++) {
      const za = centreZ(pl, pl.along[i - 1]!) / 10 - ROAD_DECK_M;
      const zb = centreZ(pl, pl.along[i]!) / 10 - ROAD_DECK_M;
      soffitAt.push(za, zb);
      bridges.add(pl.pts[i * 2 - 2]! / 10, pl.pts[i * 2 - 1]! / 10, pl.pts[i * 2]! / 10, pl.pts[i * 2 + 1]! / 10, pl.hw / 10 + 0.5, soffitAt.length / 2 - 1);
    }
  }
  const soffit = (x: number, y: number): number | null =>
    bridges.query(x, y, 1.0, Math.min, (id, t) => {
      const k = bridges.segs[id * 6 + 5]!;
      return soffitAt[k * 2]! + (soffitAt[k * 2 + 1]! - soffitAt[k * 2]!) * t;
    });

  // 车行道（地面可驾驶道路）与一般车道中心线
  const road = new SegIndex(20);
  const lanes: LaneLine[] = [];
  for (const pl of plans) {
    if (pl.elev > 0 || LANE_SPEED[pl.road.cls] === undefined) continue;
    const n = pl.pts.length >> 1;
    for (let i = 1; i < n; i++) road.add(pl.pts[i * 2 - 2]! / 10, pl.pts[i * 2 - 1]! / 10, pl.pts[i * 2]! / 10, pl.pts[i * 2 + 1]! / 10, pl.hw / 10, 1);
    for (const slot of laneSlots(pl.road.lanes, pl.road.oneway, pl.hw / 10)) {
      const pts: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = Math.max(i - 1, 0);
        const b = Math.min(i + 1, n - 1);
        const dx = pl.pts[b * 2]! - pl.pts[a * 2]!;
        const dy = pl.pts[b * 2 + 1]! - pl.pts[a * 2 + 1]!;
        const l = Math.hypot(dx, dy) || 1;
        pts.push((pl.pts[i * 2]! - (dy / l) * slot.across * 10) / 10, (pl.pts[i * 2 + 1]! + (dx / l) * slot.across * 10) / 10);
      }
      lanes.push({ pts });
    }
  }
  const inCarriageway = (x: number, y: number) => road.query(x, y, 0, Math.max) !== null;

  const pts = (flat: readonly number[]): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i]! / 10, flat[i + 1]! / 10]);
    return out;
  };
  const crossings = pts(city.props.crossings);
  const signals = pts(city.props.signals);

  return {
    route: { surface, soffit },
    stops: { points: [...crossings, ...signals], inZone, inBuilding, lanes, surfaceM },
    overhead: { inBuilding, inZone, inCarriageway, crossings, soffit, surfaceM },
  };
}

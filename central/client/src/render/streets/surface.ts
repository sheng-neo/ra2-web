/**
 * 画出来的地表高度（纯函数，可测）与敏感区过滤。
 *
 * 地面道路横向水平（roads.ts 的 zc），地形网格在路廊下又被压低了 ≤ 3 m（road-corridor.ts），
 * 所以「原始地形 ground(x, y)」并不是看得见的地面：灯杆、交通灯杆、树要立在看得见的面上——
 * 落在某条地面道路的车行道 + 人行道里，取该路的水平路面高度 centreZ；否则取路廊压低后的地形。
 *
 * 敏感区（军营、政府）只做背景：客户端自己生成的道具（路灯、交通灯、山上灯点、树）与车道一律不进去
 * （管线 citymap/src/stages/props.ts 对数据里的道具点也是同一规则）。
 */
import type { SensitiveZone } from '@central/data';
import { threeToSim } from '../../coords';
import type { HeightFn } from '../../data/terrain';
import { pointInRing } from '../../geom/ring';
import { centreZ, pointAt, type RoadPlan } from '../roads';

/** 地面道路的空间索引：线段 → 所属道路、半宽（车行道 + 两侧人行道较宽者，dm）。 */
export class RenderedSurface {
  private readonly cells = new Map<number, number[]>();
  /** [ax, ay, bx, by, sa, sb, 半宽, 路序号] 逐段平铺（dm）。 */
  private readonly segs: number[] = [];
  private static readonly CELL = 300;

  constructor(
    private readonly plans: readonly RoadPlan[],
    /** 路廊压低后的地形高度（dm）。 */
    private readonly terrain: HeightFn,
  ) {
    plans.forEach((p, k) => {
      if (p.elev > 0) return;
      for (let i = 1; i < p.along.length; i++) {
        const ax = p.pts[i * 2 - 2]!;
        const ay = p.pts[i * 2 - 1]!;
        const bx = p.pts[i * 2]!;
        const by = p.pts[i * 2 + 1]!;
        const hw = p.hw + Math.max(p.pavL[i - 1] ?? 0, p.pavR[i - 1] ?? 0, p.pavL[i] ?? 0, p.pavR[i] ?? 0);
        const id = this.segs.length / 8;
        this.segs.push(ax, ay, bx, by, p.along[i - 1]!, p.along[i]!, hw, k);
        const c = RenderedSurface.CELL;
        for (let gx = Math.floor((Math.min(ax, bx) - hw) / c); gx <= Math.floor((Math.max(ax, bx) + hw) / c); gx++) {
          for (let gy = Math.floor((Math.min(ay, by) - hw) / c); gy <= Math.floor((Math.max(ay, by) + hw) / c); gy++) {
            const key = gx * 65536 + gy;
            const list = this.cells.get(key);
            if (list) list.push(id);
            else this.cells.set(key, [id]);
          }
        }
      }
    });
  }

  /**
   * (x, y) dm 处落在地面道路的路面（含人行道）上时返回路面高度（dm），不在路上为 null。
   * 路口处几条路的路面叠在一起、各自水平：看得见的是最高的那一片，取最大值。
   */
  roadHeight(x: number, y: number): number | null {
    const c = RenderedSurface.CELL;
    let z: number | null = null;
    for (const id of this.cells.get(Math.floor(x / c) * 65536 + Math.floor(y / c)) ?? []) {
      const o = id * 8;
      const ax = this.segs[o]!;
      const ay = this.segs[o + 1]!;
      const dx = this.segs[o + 2]! - ax;
      const dy = this.segs[o + 3]! - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / l2, 0), 1) : 0;
      const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
      if (d > this.segs[o + 6]!) continue;
      const s = this.segs[o + 4]! + (this.segs[o + 5]! - this.segs[o + 4]!) * t;
      const h = centreZ(this.plans[this.segs[o + 7]!]!, s);
      z = z === null ? h : Math.max(z, h);
    }
    return z;
  }

  /** 看得见的地面高度（dm）：路面上取路面，否则取路廊压低后的地形。 */
  heightAt(x: number, y: number): number {
    return this.roadHeight(x, y) ?? this.terrain(x, y);
  }
}

/** 模拟坐标（dm）是否在任一敏感区内。 */
export function inZones(zones: readonly SensitiveZone[], x: number, y: number): boolean {
  for (const z of zones) if (pointInRing(z.area, x, y)) return true;
  return false;
}

/** three 坐标（米）的点是否在敏感区内（逆换算走 coords.threeToSim）。 */
export function threeInZones(zones: readonly SensitiveZone[], p: readonly [number, number, number]): boolean {
  const [x, y] = threeToSim(p[0], p[1], p[2]);
  return inZones(zones, x, y);
}

/** 只留不在敏感区里的物件（pos 给出物件的 three 坐标，米）。 */
export function outsideZones<T>(items: readonly T[], zones: readonly SensitiveZone[], ...pos: ((t: T) => readonly [number, number, number])[]): T[] {
  return items.filter((t) => !pos.some((f) => threeInZones(zones, f(t))));
}

/** 中点落在敏感区里的路不装路灯（路面光斑与灯头一起去掉）。原地改 plans。 */
export function dropZoneLamps(plans: RoadPlan[], zones: readonly SensitiveZone[]): void {
  for (const p of plans) {
    if (!p.lamps) continue;
    const mid = pointAt(p.pts, p.along, p.len / 2);
    if (inZones(zones, mid.x, mid.y)) p.lamps = null;
  }
}

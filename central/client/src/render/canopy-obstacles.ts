/**
 * R4 整合：雨篷要让开的街上东西（facades/canopy-fit.ts 的 CanopyObstacles），从已建好的街道（streets/index.ts）取：
 * - 立杆：路灯杆（顶 = 灯头高）、交通灯杆（顶 ≈ 杆底 + 4.5 m）、电车架空线杆（顶 ≈ 地面 + 9 m）；
 * - 矩形：巴士候车亭（长 × 2 m、高 2.9 m）、港铁出口（mtr-exits.ts 表里的结构：宽 × 深、顶 = base + height）；
 * - 不能进：电车行车线（车身半宽 + 0.3 m）、站岛（0.3 m）；
 * - 天桥：footway / pedestrian 中画成天桥的路段（streets/footbridges.ts 同一判断），桥面底 ≈ 地面 + 层数 × 6 m − 0.6 m，半宽 2.25 m。
 * 坐标：模拟米（three 坐标的杆位经 coords.ts 换算）。
 */
import type { Road } from '@central/data';
import { threeToSim } from '../coords';
import type { CanopyBox, CanopyObstacles } from './facades/canopy-fit';
import { SegGrid } from './people/walkways';
import { MTR_EXITS } from './stations/mtr-exits';
import { elevationTiers, isDrivable, roadHalfWidth } from './roads';
import { footbridgeTiers, isFootbridge } from './streets/footbridges';
import type { BusStop } from './streets/kerbside';
import type { StreetLamp } from './streets/lamps';
import type { SignalHead } from './streets/signals';
import { TRAM_HW_M } from './streets/tram/body';
import type { TramRoute } from './streets/tram/route';
import { inIsland } from './streets/tram/stops';

/** 街道包交出来的东西（streets/index.ts Streets.canopyParts + trams）。 */
export interface StreetCanopyParts {
  lamps: readonly Pick<StreetLamp, 'pole' | 'head'>[];
  signals: readonly Pick<SignalHead, 'base'>[];
  stops: readonly Pick<BusStop, 'x' | 'y' | 'z' | 'tx' | 'ty' | 'length'>[];
  routes: readonly Pick<TramRoute, 'x' | 'y'>[];
  islands: Parameters<typeof inIsland>[0];
  /** 电车架空线杆（模拟米）。 */
  overheadPoles: readonly (readonly [number, number])[];
  /** 看得见的地面（dm → dm）。 */
  surface: (xDm: number, yDm: number) => number;
}

const BRIDGE_HW = 2.25;
const BRIDGE_CELL = 20;

export function canopyObstacles(roads: readonly Road[], s: StreetCanopyParts): CanopyObstacles {
  const ground = (x: number, y: number) => s.surface(x * 10, y * 10) / 10;
  const poles: [number, number, number][] = [];
  for (const l of s.lamps) {
    const [px, py] = threeToSim(l.pole[0], l.pole[1], l.pole[2]);
    const [, , hz] = threeToSim(l.head[0], l.head[1], l.head[2]);
    poles.push([px / 10, py / 10, hz / 10]);
  }
  for (const h of s.signals) {
    const [px, py, pz] = threeToSim(h.base[0], h.base[1], h.base[2]);
    poles.push([px / 10, py / 10, pz / 10 + 4.5]);
  }
  for (const [x, y] of s.overheadPoles) poles.push([x, y, ground(x, y) + 9]);
  const boxes: CanopyBox[] = [];
  for (const st of s.stops) if (st.length > 0) boxes.push({ cx: st.x, cy: st.y, tx: st.tx, ty: st.ty, hl: st.length / 2, hw: 1, top: st.z + 2.9 });
  for (const e of MTR_EXITS) {
    const cx = (e.left[0] + e.right[0]) / 2 + (e.normal[0] * e.depth) / 2;
    const cy = (e.left[1] + e.right[1]) / 2 + (e.normal[1] * e.depth) / 2;
    boxes.push({ cx, cy, tx: -e.normal[1], ty: e.normal[0], hl: e.width / 2, hw: e.depth / 2, top: e.base + e.height });
  }
  const route = new SegGrid(20);
  s.routes.forEach((r, k) => {
    for (let i = 1; i < r.x.length; i++) route.add(r.x[i - 1]!, r.y[i - 1]!, r.x[i]!, r.y[i]!, 0, k);
  });
  // 天桥段（模拟米）：[ax, ay, bx, by, 层数]
  const segs: number[][] = [];
  const cells = new Map<number, number[]>();
  for (const r of roads) {
    if (!isFootbridge(r)) continue;
    const tiers = footbridgeTiers(r);
    for (let i = 2; i < r.pts.length; i += 2) {
      const seg = [r.pts[i - 2]! / 10, r.pts[i - 1]! / 10, r.pts[i]! / 10, r.pts[i + 1]! / 10, tiers];
      const id = segs.push(seg) - 1;
      const m = BRIDGE_HW + 0.5;
      for (let cx = Math.floor((Math.min(seg[0]!, seg[2]!) - m) / BRIDGE_CELL); cx <= Math.floor((Math.max(seg[0]!, seg[2]!) + m) / BRIDGE_CELL); cx++)
        for (let cy = Math.floor((Math.min(seg[1]!, seg[3]!) - m) / BRIDGE_CELL); cy <= Math.floor((Math.max(seg[1]!, seg[3]!) + m) / BRIDGE_CELL); cy++) {
          const k = cx * 65536 + cy;
          (cells.get(k) ?? cells.set(k, []).get(k)!).push(id);
        }
    }
  }
  // 复审修正：车行道（贴地、能开车的路，路缘线以内 0.3 m）——雨篷底低于 4.8 m 时不能伸进去（双层巴士约 4.4 m 高，原来从雨篷板里穿过）
  const carriage = new SegGrid(20);
  roads.forEach((r, k) => {
    if (!isDrivable(r) || elevationTiers(r) > 0) return;
    const hw = roadHalfWidth(r) / 10 - 0.3;
    if (hw <= 0) return;
    for (let i = 2; i < r.pts.length; i += 2) carriage.add(r.pts[i - 2]! / 10, r.pts[i - 1]! / 10, r.pts[i]! / 10, r.pts[i + 1]! / 10, hw, k);
  });
  return {
    poles,
    boxes,
    keepOut: (x, y) => route.hit(x, y, TRAM_HW_M + 0.3) || inIsland(s.islands, x, y, 0.3),
    carriageway: (x, y) => carriage.hit(x, y),
    deckBottom: (x, y) => {
      let best: number | null = null;
      for (const id of cells.get(Math.floor(x / BRIDGE_CELL) * 65536 + Math.floor(y / BRIDGE_CELL)) ?? []) {
        const [ax, ay, bx, by, tiers] = segs[id] as [number, number, number, number, number];
        const dx = bx - ax;
        const dy = by - ay;
        const l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / l2, 0), 1) : 0;
        if (Math.hypot(ax + t * dx - x, ay + t * dy - y) > BRIDGE_HW + 0.3) continue;
        const z = ground(x, y) + tiers * 6 - 0.6;
        best = best === null ? z : Math.min(best, z);
      }
      return best;
    },
    ground,
  };
}

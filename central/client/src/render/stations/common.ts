/**
 * 车站设施共用的输入、距离与摆放工具（R3 STATIONS；index.ts、mtr.ts、piers.ts 共用，避免循环引用）。
 */
import type { Building, SensitiveZone } from '@central/data';
import { simToThreeVec } from '../../coords';
import type { FurnitureItem } from '../streets/furniture';
import type { BusStop } from '../streets/kerbside';

/** 站岛（与 trams.ts TramIsland 同字段）。 */
export interface IslandFrame {
  centre: readonly [number, number];
  axis: readonly [number, number];
  length: number;
  width: number;
  z: number;
}

export interface StationsInput {
  zones: readonly SensitiveZone[];
  stops: readonly BusStop[];
  islands: readonly IslandFrame[];
  /** 楼宇（找码头楼）。 */
  buildings: readonly Building[];
  /** 看得见的地面高度（dm → dm）。 */
  surface: (xDm: number, yDm: number) => number;
  /** 这里（模拟米）能立杆吗（人行道上、不在车行道 / 楼 / 敏感区里）；缺省都能。 */
  footOk?: (x: number, y: number) => boolean;
  high: boolean;
}

/** 各类设施最远距离（m）：HIGH / LOW。 */
export const STATION_REACH = {
  flag: [300, 100],
  plate: [300, 100],
  wall: [500, 200],
  mtr: [350, 150],
  pier: [450, 180],
} as const;

/** 在模拟米 (x, y, z) 放一个局部 +x 朝 (dx, dy) 的实例。 */
export function placeItem(items: FurnitureItem[], t: number, x: number, y: number, z: number, dx: number, dy: number, maxD: number, aux = 0): void {
  const p = simToThreeVec(x, y, z, 1);
  const d = simToThreeVec(dx, dy, 0, 1);
  const l = Math.hypot(d[0], d[2]) || 1;
  items.push({ t, x: p[0], y: p[1], z: p[2], dx: d[0] / l, dz: d[2] / l, sx: 1, aux, maxD });
}

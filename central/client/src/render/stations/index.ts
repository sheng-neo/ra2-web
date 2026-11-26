/**
 * 车站与站台的街道设施（R3 STATIONS）入口：产出要并进街道设施网格（streetlife.ts 的 NearFurniture，一个 draw call）的模板与实例，
 * 不另加 draw call。
 * - 巴士站：每个候车亭下游端一支营运商站牌（城巴橙牌 / 九巴红牌 / 小巴牌，真实站名与路线号，stations/rules.ts）；
 * - 电车站岛：车道一侧整条灯箱广告墙 + 檐口灯带（虚构广告）、两端各一块真实站名牌（如 砵典乍街 Pottinger Street 72W）；
 * - 港铁中环站出口（mtr.ts）与中环码头正面（piers.ts）。
 * 敏感区：不放任何东西，离区 3 m 内也不放（rules.clearOfZones）。全部摆放确定（只取决于数据）。
 */
import { islandAdTemplate, stopFlagTemplate, tramPlateTemplate, type FurnitureItem, type Template } from '../streets/furniture';
import { linearRGB, type V3 } from '../streets/prop-geometry';
import { ISLAND_CANOPY_M, ISLAND_CANOPY_Y, ISLAND_WALL_M } from '../streets/tram/infra';
import { ISLAND_H_M } from '../streets/tram/stops';
import { stationsAtlas } from './atlas';
import { STATION_REACH, placeItem, type StationsInput } from './common';
import { mtrFurniture } from './mtr';
import { pierFurniture } from './piers';
import { busStopInfoNear, clearOfZones, flagSpec, tramStopFor, type FlagKind } from './rules';
import { BUS_STOPS } from '../streets/transit-data';

/** 中环核心区（模拟米，与 streets/index.ts CORE_RECT_M 相同）。 */
const CORE_M = [14, -485, 652, 512] as const;

export interface StationsFurniture {
  templates: Template[];
  items: FurnitureItem[];
  /** 调试：各类数目。 */
  counts: { flags: number; plates: number; walls: number; mtr: number; piers: number; atlasOverflow: number };
  /** 每个电车站岛的站名（站岛 id 顺序）：测试用。 */
  plates: { zh: string; en: string; ref: string }[];
}

/** 站牌离候车亭下游端（m）。 */
export const FLAG_AHEAD_M = 2.5;

/** 站牌远处平均色（线性）。 */
const FLAG_AVG: Record<FlagKind, V3> = {
  citybus: linearRGB('#c4642a'),
  kmb: linearRGB('#b03030'),
  gmb: linearRGB('#c8d0c8'),
};

/**
 * 车站设施的模板与实例。templateBase：这些模板在合并后的模板表里的起始下标。
 */
export function stationsFurniture(input: StationsInput, templateBase: number): StationsFurniture {
  const tier = input.high ? 0 : 1;
  const atlas = stationsAtlas();
  const templates: Template[] = [];
  const items: FurnitureItem[] = [];
  const key = new Map<string, number>();
  const tpl = (k: string, make: () => Template): number => {
    let i = key.get(k);
    if (i === undefined) {
      i = templateBase + templates.length;
      templates.push(make());
      key.set(k, i);
    }
    return i;
  };
  const ok = (x: number, y: number) => clearOfZones(input.zones, x, y);
  const counts = { flags: 0, plates: 0, walls: 0, mtr: 0, piers: 0, atlasOverflow: 0 };

  // 巴士站牌：候车亭下游端（巴士车头停的一端）外 2.5 m——停站巴士的车头前面，从对面街看过来不被车身挡住
  for (const b of input.stops) {
    const spec = flagSpec(busStopInfoNear(b.x, b.y));
    // 杆在亭子局部 z = +0.55（近路缘）；放不下（路口转角、车行道）就退回亭边 0.7 m
    const pole = (a: number): [number, number] => [b.x + b.tx * a + b.nx * 0.55, b.y + b.ty * a + b.ny * 0.55];
    let ahead = b.length / 2 + FLAG_AHEAD_M;
    if (input.footOk && !input.footOk(...pole(ahead))) ahead = b.length / 2 + 0.7;
    const x = b.x + b.tx * ahead;
    const y = b.y + b.ty * ahead;
    if (!ok(x, y)) continue;
    const rect = atlas.flag(spec);
    const k = `flag:${spec.kind}:${spec.zh}:${spec.routes.join(',')}:${rect ? 1 : 0}`;
    const t = tpl(k, () => stopFlagTemplate(rect, spec.kind === 'gmb', FLAG_AVG[spec.kind]));
    placeItem(items, t, x, y, input.surface(x * 10, y * 10) / 10, b.tx, b.ty, STATION_REACH.flag[tier]);
    counts.flags++;
  }

  // 小巴站（S-B3）：数据里营运商是小巴（如 中環（天星碼頭） 22 / 22S / 22X）、附近 15 m 没有已放的巴士站、立得下杆的点，
  // 单独立一支小巴站牌（白底绿框小巴图 + 路线圆牌）
  for (const g of BUS_STOPS) {
    if (g.op !== 'gmb' || g.x < CORE_M[0] || g.x > CORE_M[2] || g.y < CORE_M[1] || g.y > CORE_M[3]) continue;
    if (input.stops.some((b) => Math.hypot(b.x - g.x, b.y - g.y) < 15)) continue;
    if (!ok(g.x, g.y) || (input.footOk && !input.footOk(g.x, g.y))) continue;
    const spec = flagSpec(g);
    const rect = atlas.flag(spec);
    const t = tpl(`flag:gmb:${spec.routes.join(',')}:${rect ? 1 : 0}`, () => stopFlagTemplate(rect, true, FLAG_AVG.gmb));
    placeItem(items, t, g.x, g.y, input.surface(g.x * 10, g.y * 10) / 10, 1, 0, STATION_REACH.flag[tier]);
    counts.flags++;
  }

  // 电车站岛：灯箱广告墙 + 檐口灯带、站名牌
  const plates: { zh: string; en: string; ref: string }[] = [];
  input.islands.forEach((s, i) => {
    const l = Math.hypot(s.axis[0], s.axis[1]) || 1;
    const ax = s.axis[0] / l;
    const ay = s.axis[1] / l;
    if (!ok(s.centre[0], s.centre[1])) return;
    const seed = ((Math.round(s.centre[0] * 7.31 + s.centre[1] * 3.17) % 997) + 997) % 997;
    const wall = tpl(`wall:${i}`, () => islandAdTemplate(ISLAND_WALL_M, ISLAND_CANOPY_M, s.width / 2, ISLAND_H_M, ISLAND_CANOPY_Y, seed / 997));
    placeItem(items, wall, s.centre[0], s.centre[1], s.z, ax, ay, STATION_REACH.wall[tier]);
    counts.walls++;
    const stop = tramStopFor(s.centre[0], s.centre[1], ax < 0);
    if (!stop) return;
    plates.push({ zh: stop.zh, en: stop.en, ref: stop.ref });
    const rect = atlas.tramPlate(stop.zh, stop.en, stop.ref);
    const plate = tpl(`plate:${stop.ref}:${s.width}:${s.length}:${rect ? 1 : 0}`, () => tramPlateTemplate(rect, [s.length / 2 - 0.6, -s.length / 2 + 1.0], -s.width / 2 + 0.3, ISLAND_H_M));
    placeItem(items, plate, s.centre[0], s.centre[1], s.z, ax, ay, STATION_REACH.plate[tier]);
    counts.plates++;
  });

  // 港铁出口、码头正面
  const mtr = mtrFurniture(input, templateBase + templates.length);
  templates.push(...mtr.templates);
  items.push(...mtr.items);
  counts.mtr = mtr.count;
  const piers = pierFurniture(input, templateBase + templates.length);
  templates.push(...piers.templates);
  items.push(...piers.items);
  counts.piers = piers.count;
  counts.atlasOverflow = atlas.overflow;
  return { templates, items, counts, plates };
}

export type { IslandFrame, StationsInput } from './common';

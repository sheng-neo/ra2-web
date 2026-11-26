/**
 * 街头生活（R2 STREETLIFE）入口：行人、过路处、行人灯、栏杆、护柱、巴士站、街道杂项、皇后像广场。
 * streets/index.ts 只加几行接线（标 // [r2:streetlife]）：
 *   const life = buildStreetLife(...)        —— 在交通灯之后、静态光点批之前
 *   glow 容量 + life.glowCount，life.writeGlow(glow, n)
 *   traffic.setCrossings(life.trafficCrossings)
 *   objects 加 ...life.objects，update 里 life.update(camera, t)
 * 电车站台（TRAMS 的 tramStopIslands）与架空线杆经 opts.tram 传入（整合 R2）：站岛上有人候车，栏杆、护柱、杂项让开站岛与杆，
 * 候车亭碰到杆就沿路缘挪位。
 * 敏感区只做背景：所有设施与行人的摆放都经 walkways.footOk（不进敏感区、楼、车行道）。
 */
import type { Camera, Object3D } from 'three';
import type { CityFile } from '@central/data';
import { simToThreeVec, threeToSim } from '../../coords';
import type { HeightFn } from '../../data/terrain';
import type { GlowBatch } from '../materials/lighting';
import { footprintTest } from '../road-corridor';
import type { RoadPlan } from '../roads';
import { Crowd, type WaitingArea } from '../people/crowd';
import { Pedestrians } from '../people/pedestrians';
import { buildCrossingSites, buildWalkPaths, crossingRect, walkContext, type CrossingSite, type WalkPath } from '../people/walkways';
import {
  K_GLASS,
  NearFurniture,
  splitTemplates,
  binTemplate,
  bollardTemplate,
  hydrantTemplate,
  pedPoleTemplate,
  railTemplate,
  shelterTemplate,
  type FurnitureItem,
  type Template,
} from './furniture';
import { SHELTER_OUTER_M, bollardSpots, busStops, busWaitingAreas, pedPoleSpots, railPanels, streetBits, type BusStop, type RailPanel, type Spot } from './kerbside';
import { createLifeMaterial } from './life-material';
import { ISLAND_H_M, inIsland } from './tram/stops';
import { crossingPhase, type SignalHead } from './signals';
import { buildStatueSquare } from './statue-square';
import type { TrafficCrossing } from './traffic';

export interface StreetLife {
  objects: Object3D[];
  /** 交给 Traffic.setCrossings 的过路处（three 坐标，已按车宽放宽）。 */
  trafficCrossings: TrafficCrossing[];
  sites: CrossingSite[];
  paths: WalkPath[];
  stops: BusStop[];
  /** 最终摆出的栏杆片与点状设施（护柱、行人灯杆、垃圾桶 / 消防栓）：整合测试用。 */
  kerb: { rails: readonly RailPanel[]; spots: readonly Spot[] };
  crowd: Crowd;
  /** 静态光点数（写进街道静态光点批）。 */
  glowCount: number;
  writeGlow(batch: GlowBatch, start: number): number;
  /** 接上车流：行人等过路处上的车开走才放行（Traffic.releaseDelay）。 */
  bindTraffic(traffic: { releaseDelay(c: number, g: number): number }): void;
  /** 模拟 dm 处是否在地面车行道上（天桥：不立桥墩、用玻璃廊）。 */
  overRoad(xDm: number, yDm: number): boolean;
  /** 额外的候车区（电车站台等）：与巴士站候车区合并。 */
  setWaitingAreas(areas: readonly WaitingArea[]): void;
  update(camera: Camera, t: number): void;
  summary(): string;
}

export interface StreetLifeOptions {
  high: boolean;
  core: readonly [number, number, number, number];
  /** 整合（R2）：电车站岛与架空线杆（模拟坐标米）。路边设施让开站岛和杆，站岛上放候车的人。 */
  tram?: TramKeepClear;
}

/** 电车设施（整合用的结构类型，与 trams.ts 的 TramIsland / Support 字段相同）。 */
export interface TramKeepClear {
  islands: readonly { centre: readonly [number, number]; axis: readonly [number, number]; length: number; width: number; z: number }[];
  poles: readonly (readonly [number, number])[];
}

/** 站岛上候车区：遮篷下（14 m 长）、靠轨道一侧，面向轨道（站岛在轨道左侧 → 轨道在站岛的右法线方向）。 */
export function tramWaitingAreas(islands: TramKeepClear['islands']): WaitingArea[] {
  return islands.map((s, i) => {
    const l = Math.hypot(s.axis[0], s.axis[1]) || 1;
    const ax = s.axis[0] / l;
    const ay = s.axis[1] / l;
    // 右法线（朝轨道）
    const rx = ay;
    const ry = -ax;
    return {
      centre: [s.centre[0] + rx * 0.15, s.centre[1] + ry * 0.15] as const,
      axis: [ax, ay] as const,
      length: 12,
      width: Math.max(0.6, s.width - 1.0),
      z: s.z + ISLAND_H_M,
      face: [rx, ry] as const,
      count: 2 + (Math.round(s.centre[0] * 7 + s.centre[1] * 13) & 3),
      seed: 50000 + i * 131,
    };
  });
}

/** 点离站岛 / 架空线杆太近（模拟米）：站岛外扩 islandM，杆半径 poleM。 */
function tramClash(t: TramKeepClear | undefined, x: number, y: number, islandM: number, poleM: number): boolean {
  if (!t) return false;
  for (const [px, py] of t.poles) if (Math.abs(px - x) < poleM && Math.abs(py - y) < poleM && Math.hypot(px - x, py - y) < poleM) return true;
  return inIsland(t.islands, x, y, islandM);
}

/** 巴士走廊（核心区内双层巴士比例 15 %）：街道名是事实信息，可以用。 */
export const BUS_STREETS: ReadonlySet<string> = new Set(['Des Voeux Road Central', 'Connaught Road Central', "Queen's Road Central", 'Pedder Street']);

/** 车辆入口外扩（m）：车身半宽 1.25 m + 余量。 */
const VEHICLE_GROW_M = 1.6;

/** 各类设施的最远距离（m）：HIGH / LOW。 */
const REACH = {
  rail: [250, 60],
  bollard: [130, 60],
  pole: [200, 80],
  shelter: [300, 100],
  bits: [110, 45],
} as const;

export function buildStreetLife(
  city: CityFile,
  plans: readonly RoadPlan[],
  ground: HeightFn,
  surface: HeightFn,
  signals: readonly SignalHead[],
  opts: StreetLifeOptions,
): StreetLife {
  const zones = city.zones.sensitive;
  const tier = opts.high ? 0 : 1;
  const inBuilding = footprintTest(city.buildings);
  const ctx = walkContext(plans, city.rails, inBuilding, zones, opts.core);
  // 巴士站先定（走线要绕开候车亭）
  const tram = opts.tram;
  const stops = busStops(city.props.busStops, plans, ctx, surface, tram ? (x, y) => tramClash(tram, x, y, 0.3, 0.45) : undefined);
  const paths = buildWalkPaths(
    plans,
    city.roads,
    ctx,
    surface,
    ground,
    stops.map((b) => ({ plan: b.plan, side: b.side, s: b.s, halfLen: b.length / 2 + 0.6, outer: SHELTER_OUTER_M })),
  );
  // 皇后像广场（HIGH 才画网格；步道与灯球两档都有）
  const plaza = buildStatueSquare(ctx, surface, paths.length, opts.high);
  paths.push(...plaza.paths);
  const sites = buildCrossingSites(plans, ctx, surface, (x, y, tx, ty) => crossingPhase(signals, x, y, tx, ty));
  const crowd = new Crowd(paths, sites, ctx, { density: opts.high ? 1 : 0.6 });
  // 车辆让行：有人过路的过路处 + 全部灯控过路处
  const trafficCrossings: TrafficCrossing[] = [];
  const siteToTraffic = new Map<number, number>();
  for (const c of sites) {
    if (!c.kerbs && !c.signal) continue;
    siteToTraffic.set(c.id, trafficCrossings.length);
    const r = crossingRect(c, VEHICLE_GROW_M);
    const corners: number[] = [];
    for (let k = 0; k < 4; k++) {
      const p = simToThreeVec(r[k * 2]!, r[k * 2 + 1]!, 0, 1);
      corners.push(p[0], p[2]);
    }
    const z0 = crossingRect(c, 0);
    const zebra: number[] = [];
    for (let k = 0; k < 4; k++) {
      const p = simToThreeVec(z0[k * 2]!, z0[k * 2 + 1]!, 0, 1);
      zebra.push(p[0], p[2]);
    }
    trafficCrossings.push({ corners, zebra, phase: crowd.sitePhase[c.id]! });
  }

  // 路边设施
  // 整合（R2）：栏杆在电车站岛处断开（站岛贴行人路时那段是上落客位），也让开架空线杆；点状设施不放在站岛上、杆脚下
  const rails = railPanels(plans, ctx, sites, stops, surface).filter((r) => {
    for (let k = 0; k <= 4; k++) if (tramClash(tram, r.ax + ((r.bx - r.ax) * k) / 4, r.ay + ((r.by - r.ay) * k) / 4, 0.8, 0.35)) return false;
    return true;
  });
  const clearSpot = (p: { x: number; y: number }) => !tramClash(tram, p.x, p.y, 0.4, 0.7);
  const bollards = bollardSpots(sites, ctx, surface).filter(clearSpot);
  const polesSim = signals.map((s) => {
    const [x, y] = threeToSim(s.base[0], s.base[1], s.base[2]);
    return [x / 10, y / 10] as const;
  });
  const pedPoles = pedPoleSpots(sites, crowd.sitePhase, polesSim, ctx, surface).filter(clearSpot);
  const bits = streetBits(plans, ctx, surface).filter(clearSpot);

  const templates: Template[] = [railTemplate(), bollardTemplate(), pedPoleTemplate(), binTemplate(), hydrantTemplate()];
  const shelterKey = new Map<string, number>();
  const shelterT = (type: 0 | 1, length: number): number => {
    const k = `${type},${length.toFixed(2)}`;
    let i = shelterKey.get(k);
    if (i === undefined) {
      i = templates.length;
      templates.push(shelterTemplate(type, length));
      shelterKey.set(k, i);
    }
    return i;
  };
  const items: FurnitureItem[] = [];
  const put = (t: number, x: number, y: number, z: number, dx: number, dy: number, sx: number, aux: number, maxD: number) => {
    const p = simToThreeVec(x, y, z, 1);
    const d = simToThreeVec(dx, dy, 0, 1);
    const l = Math.hypot(d[0], d[2]) || 1;
    items.push({ t, x: p[0], y: p[1], z: p[2], dx: d[0] / l, dz: d[2] / l, sx, aux, maxD });
  };
  for (const r of rails) {
    const len = Math.hypot(r.bx - r.ax, r.by - r.ay);
    put(0, r.ax, r.ay, r.z, r.bx - r.ax, r.by - r.ay, len, 0, REACH.rail[tier]);
  }
  for (const b of bollards) put(1, b.x, b.y, b.z, b.dx, b.dy, 1, 0, REACH.bollard[tier]);
  for (const p of pedPoles) put(2, p.x, p.y, p.z, p.dx, p.dy, 1, p.aux, REACH.pole[tier]);
  for (const b of bits) put(b.kind === 0 ? 3 : 4, b.x, b.y, b.z, b.dx, b.dy, 1, 0, REACH.bits[tier]);
  for (const s of stops) put(shelterT(s.type, s.length), s.x, s.y, s.z, s.tx, s.ty, 1, (s.seed % 997) / 997, REACH.shelter[tier]);
  // 候车亭玻璃单独一个半透明网格（只在近处有候车亭时多 1 个 draw call）
  const [solidT, glassT] = splitTemplates(templates, K_GLASS);
  const furniture = new NearFurniture(solidT, items, createLifeMaterial(0.4), opts.high ? 140000 : 40000, opts.high ? 240000 : 70000, 'street-furniture');
  const glassItems = items.filter((it) => glassT[it.t]!.index.length > 0);
  const shelterGlass = new NearFurniture(glassT, glassItems, createLifeMaterial(0.4, true), opts.high ? 4000 : 1500, opts.high ? 6000 : 2400, 'shelter-glass');
  shelterGlass.mesh.renderOrder = 2;

  const peds = new Pedestrians(crowd, opts.high ? { radius: 150, nearM: 60, cap: 600, nearCap: 260 } : { radius: 80, nearM: 30, cap: 150, nearCap: 50 });
  // 候车的人：巴士站 + 电车站岛（整合 R2：站岛不再自带剪影，统一用行人系统）
  const base: WaitingArea[] = [...busWaitingAreas(stops, plans), ...(tram ? tramWaitingAreas(tram.islands) : [])];
  crowd.setWaitingAreas(base);
  return {
    objects: [...peds.objects, furniture.mesh, shelterGlass.mesh, ...(plaza.mesh ? [plaza.mesh] : [])],
    trafficCrossings,
    sites,
    paths,
    stops,
    kerb: { rails, spots: [...bollards, ...pedPoles, ...bits] },
    crowd,
    glowCount: plaza.lights.length,
    writeGlow(batch, start) {
      let i = start;
      for (const l of plaza.lights) batch.set(i++, l.p, l.colour, l.intensity, l.radius);
      return i;
    },
    bindTraffic(traffic) {
      crowd.setRelease((site, g) => {
        const c = siteToTraffic.get(site);
        return c === undefined ? 0 : traffic.releaseDelay(c, g);
      });
    },
    overRoad: (x, y) => ctx.carriage.hit(x / 10, y / 10, 1) || ctx.trams.hit(x / 10, y / 10, 3),
    setWaitingAreas(areas) {
      crowd.setWaitingAreas([...base, ...areas]);
    },
    update(camera, t) {
      furniture.update(camera);
      shelterGlass.update(camera);
      peds.update(camera, t);
    },
    summary: () =>
      `行人 ${crowd.walkers.length + crowd.crossers.length + crowd.waiters.length}（畫 ${peds.drawn}）· 過路處 ${sites.filter((s) => s.kerbs).length}/${sites.length} · 欄杆 ${rails.length} · 巴士站 ${stops.length} · 設施 ${furniture.drawnItems}/${items.length}`,
  };
}

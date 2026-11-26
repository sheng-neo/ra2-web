/**
 * 街道层入口（realism STREETS）：路灯灯头与灯杆、山上零星灯点、交通灯、车流、电车、树、行人天桥。
 * buildStreets 在道路图层之后调用；update 每帧调用一次（车流按 uTime 推进，灯杆 / 树按相机位置重排）。
 * 全部动画只取决于单调时钟 SIM_CLOCK（不随 uTime 每小时回绕）与固定种子，同一时刻截图结果相同。
 */
import type { Camera, Object3D } from 'three';
import type { CityFile, TerrainGrid } from '@central/data';
import type { HeightFn } from '../../data/terrain';
import { GlowBatch, SIM_CLOCK, getQuality, lightColour } from '../materials/lighting';
import type { RoadPlan } from '../roads';
import { groundMask } from './ground-mask';
import { hillLights } from './hill-lights';
import { lampPoles, streetLamps, writeLampHeads } from './lamps';
import { laneSignalPhases, signalHeads, signalPoles, writeSignalHeads, type SignalHead } from './signals';
import { treeItems, treeProps } from './trees';
import { buildFootbridges } from './footbridges';
import { buildLanes, lanePose, type Lane } from './lanes';
import { RenderedSurface, inZones, outsideZones } from './surface';
import { laneSweepSamples } from './sweep';
import { renderedTerrain } from '../road-corridor';
import { Traffic, isBusKind } from './traffic'; // [r2:streetlife]
import { BUS_STREETS, buildStreetLife, type StreetLife } from './streetlife'; // [r2:streetlife]
import { busStopLanes } from './kerbside'; // [r2:streetlife]
import { TramSystem, tramStopIslands } from './trams'; // [r2:trams]
import { POLE_CLEAR_M, TramOccupancy, tramLaneConflicts, tramRouteProximity } from './tram-traffic'; // [r2:fix] 车流给电车让路、杆不立在路轨上
import { threeToSim } from '../../coords';
import { VehicleRenderer, type VehiclePose } from './vehicles';
import { LampField } from './tram/trackbed';

/** MVP 核心区（模拟坐标，米）：经度 114.155–114.1612、纬度 22.2785–22.2875 换算到本地原点。 */
export const CORE_RECT_M = [14, -485, 652, 512] as const;
/** 车流随机种子（固定：同一 uTime 截图相同）。 */
const TRAFFIC_SEED = 20261124;

export interface Streets {
  objects: Object3D[];
  trams: TramSystem; // [r2:trams]
  update(dt: number, camera: Camera): void;
  /** 调试摘要。 */
  summary(): string;
}

/** 杆（three 坐标）离电车行车线中心 ≥ POLE_CLEAR_M 的项（模拟坐标判定，coords.ts 换算）。 */
export function keepOffTramRoutes<T>(items: readonly T[], trams: Pick<TramSystem, 'routes'>, pole: (t: T) => readonly number[]): T[] {
  const near = tramRouteProximity(trams.routes);
  return items.filter((it) => {
    const p = pole(it);
    const [x, y] = threeToSim(p[0]!, p[1]!, p[2]!);
    return !near(x / 10, y / 10, POLE_CLEAR_M);
  });
}

/**
 * 车流（与 streets/index.ts、测试共用同一套设置）：敏感区车道与电车共用车道不开车，交通灯相位、行人过路处、穿轨区（让电车）、巴士站。
 * 会改 lanes[*].next（去掉不开车的车道）。
 */
export function buildTraffic(
  lanes: Lane[],
  plans: readonly RoadPlan[],
  zones: CityFile['zones']['sensitive'],
  signals: readonly SignalHead[],
  life: Pick<StreetLife, 'trafficCrossings' | 'stops' | 'bindTraffic'>,
  trams: TramSystem,
  cap: number,
): Traffic {
  // 敏感区里的车道：不刷车、也不接进去（车开到区边掉头 / 重生）；
  // 与电车行车线平行重叠的车道（单向两车道路面靠轨那条）同样不开车，横过路轨的区间做成穿轨区（tram-traffic.ts）[r2:fix]
  const sweeps = laneSweepSamples(lanes);
  const tramConflicts = tramLaneConflicts(lanes, trams.routes, { samples: sweeps });
  const blockedLane = lanes.map((l) => inZones(zones, l.mid[0] * 10, l.mid[1] * 10) || tramConflicts.shared.has(l.id));
  for (const l of lanes) l.next = blockedLane[l.id] ? [] : l.next.filter((n) => !blockedLane[n]);
  const traffic = new Traffic(lanes, { cap, seed: TRAFFIC_SEED, core: CORE_RECT_M, sweeps, busy: (l) => BUS_STREETS.has(plans[l.plan]?.road.name?.en ?? '') }); // [r2:streetlife]
  traffic.setSignals(
    laneSignalPhases(
      lanes.map((l) => {
        const n = l.pts.length / 3;
        const x = l.pts[(n - 1) * 3]!;
        const z = l.pts[(n - 1) * 3 + 2]!;
        return { x, z, dx: x - l.pts[(n - 2) * 3]!, dz: z - l.pts[(n - 2) * 3 + 2]! };
      }),
      signals,
    ),
  );
  traffic.setCrossings(life.trafficCrossings); // [r2:streetlife]
  traffic.setTramZones(tramConflicts.zones, new TramOccupancy(trams)); // [r2:fix]
  traffic.setBusStops(busStopLanes(life.stops, lanes)); // [r2:streetlife]
  life.bindTraffic(traffic); // [r2:streetlife]
  return traffic;
}

export function buildStreets(city: CityFile, plans: readonly RoadPlan[], ground: HeightFn, relief: TerrainGrid | null): Streets {
  const q = getQuality();
  const high = q.tier === 'high';
  // 敏感区只做背景：客户端生成的路灯、交通灯、山上灯点、树都不放进去（数据管线对道具点也是同一规则）
  const zones = city.zones.sensitive;
  const allLamps = outsideZones(streetLamps(plans), zones, (l) => l.pole, (l) => l.head);
  const mask = relief ? groundMask(city, plans) : null;
  const hills = outsideZones(relief && mask && high ? hillLights(relief, (x, y) => mask.sample(x, y, 1), (x, y) => mask.sample(x, y, 0)) : [], zones, (h) => h.p);

  // 看得见的地面：路面上取水平路面（路口取最高的一片），否则取路廊压低后的地形
  const surface = new RenderedSurface(plans, relief ? renderedTerrain(relief, plans, city.buildings).fn : ground);
  const surfaceAt = (x: number, y: number) => surface.heightAt(x, y);

  // 静态光点：路灯灯头 + 山上灯点 + 交通灯（一个 draw call）
  const signals = outsideZones(signalHeads(city.props.signals, plans, ground, surfaceAt), zones, (s) => s.base);
  const trams = new TramSystem({ city, plans, ground, surface: surfaceAt, lamps: allLamps, high }); // [r2:trams]
  // [r2:fix] 路灯杆、交通灯杆不立在电车路轨上：离行车线中心 < 车身半宽 + 0.9 m 的不画（信号相位仍用全部灯头）
  const lamps = keepOffTramRoutes(allLamps, trams, (l) => l.pole);
  const signalsShown = keepOffTramRoutes(signals, trams, (s) => s.base);
  const tramClear = { islands: tramStopIslands(), poles: trams.overhead.supports.filter((s) => s.kind === 'pole').map((s) => [s.x, s.y] as const) }; // [r2:integrate] 站岛 / 杆给街头生活让位、站岛上候车
  const life = buildStreetLife(city, plans, ground, surfaceAt, signals, { high, core: CORE_RECT_M, tram: tramClear }); // [r2:streetlife]
  const glow = new GlowBatch(lamps.length + hills.length + signalsShown.length * 3 + 8 + life.glowCount, 'street-lights'); // [r2:streetlife]
  let n = writeLampHeads(glow, lamps, 0);
  n = writeSignalHeads(glow, signalsShown, n);
  const warm = lightColour('homeWarm');
  const cool = lightColour('homeCool');
  for (const h of hills) glow.set(n++, h.p, h.warm ? warm : cool, h.intensity, 0.6);
  n = life.writeGlow(glow, n); // [r2:streetlife]
  glow.setCount(n);
  glow.commit();

  // 灯杆只在 HIGH 画（LOW 只留灯头光点，省三角形）
  const poles = lampPoles(lamps, high ? 350 : 0, high ? 700 : 1);
  const sigPoles = signalPoles(signalsShown, high ? 300 : 0);
  // 树只在 HIGH 画（LOW 档三角形预算 ≤ 140k）；天桥 LOW 只画相机 150 m 内的块 // [r2:streetlife]
  const bridges = buildFootbridges(city.roads, ground, (x, y) => life.overRoad(x, y), high ? Infinity : 150, (x, y) => inZones(zones, x, y)); // [r2:streetlife] LOW 也画 150 m 内；[r2:fix] 敏感区内不画
  const trees = treeProps(
    high ? treeItems(city.props.trees, ground, relief, mask, 3000, surfaceAt, (x, y) => inZones(zones, x, y)) : [],
    high,
  );

  // 车流 + 电车：车身 3 个 draw call（私家车 / 出租车、巴士、电车），车灯 1 个
  const lanes = buildLanes(plans);
  const traffic = buildTraffic(lanes, plans, zones, signals, life, trams, high ? 900 : 260); // [r2:fix]
  let buses = 0;
  for (let i = 0; i < traffic.n; i++) if (isBusKind(traffic.kind[i]!)) buses++; // [r2:streetlife]
  const vehicles = new VehicleRenderer(traffic.n - buses, buses, new LampField(allLamps)); // [r2:fix] 近处车身受路灯照
  const moving = new GlowBatch(traffic.n * 4 + trams.lightCapacity + 8, 'traffic-lights'); // [r2:trams]
  const poses: VehiclePose[] = Array.from({ length: traffic.n }, () => ({ x: 0, y: 0, z: 0, hx: 1, hz: 0, kind: 0, brake: false, seed: 0 }));
  const pose = { x: 0, y: 0, z: 0, hx: 1, hz: 0 };

  return {
    objects: [glow.mesh, poles.mesh, sigPoles.mesh, ...trees.map((t) => t.mesh), ...bridges.objects, vehicles.cars, vehicles.buses, ...trams.objects, moving.mesh, ...life.objects], // [r2:trams] [r2:streetlife]
    trams, // [r2:trams]
    update(_dt, camera) {
      poles.update(camera);
      bridges.update(camera); // [r2:streetlife]
      sigPoles.update(camera);
      for (const t of trees) t.update(camera);
      const t = SIM_CLOCK.t;
      traffic.advanceTo(t);
      const ahead = Math.max(0, t - traffic.simTime);
      for (let i = 0; i < traffic.n; i++) {
        const lane = lanes[traffic.lane[i]!]!;
        lanePose(lane, traffic.s[i]! + traffic.v[i]! * ahead, pose);
        const o = poses[i]!;
        const k = traffic.offLeft[i]! / 10;
        o.x = pose.x + traffic.off[i * 3]! * k;
        o.y = pose.y + traffic.off[i * 3 + 1]! * k;
        o.z = pose.z + traffic.off[i * 3 + 2]! * k;
        o.hx = pose.hx;
        o.hz = pose.hz;
        o.kind = traffic.kind[i]!;
        o.brake = traffic.acc[i]! < -1.5 || traffic.v[i]! < 0.5;
        o.seed = i;
      }
      let li = vehicles.write(poses, camera, moving, 0, high ? 700 : 450);
      li = trams.update(t, camera, moving, li); // [r2:trams]
      moving.setCount(li);
      moving.commit(true);
      life.update(camera, t); // [r2:streetlife]
    },
    summary: () => `路燈 ${lamps.length} · 山燈 ${hills.length} · 車 ${traffic.n}（巴士 ${buses}）· ${trams.summary()} · ${life.summary()}`, // [r2:trams] [r2:streetlife]
  };
}

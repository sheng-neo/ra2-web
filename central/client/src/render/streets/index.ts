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
import { laneSignalPhases, signalHeads, signalPoles, writeSignalHeads } from './signals';
import { treeItems, treeProps } from './trees';
import { buildFootbridges } from './footbridges';
import { buildLanes, lanePose } from './lanes';
import { RenderedSurface, inZones, outsideZones } from './surface';
import { renderedTerrain } from '../road-corridor';
import { Traffic, VehicleKind } from './traffic';
import { Trams, tramTracks } from './trams';
import { VehicleRenderer, type VehiclePose } from './vehicles';

/** MVP 核心区（模拟坐标，米）：经度 114.155–114.1612、纬度 22.2785–22.2875 换算到本地原点。 */
export const CORE_RECT_M = [14, -485, 652, 512] as const;
/** 车流随机种子（固定：同一 uTime 截图相同）。 */
const TRAFFIC_SEED = 20261124;

export interface Streets {
  objects: Object3D[];
  update(dt: number, camera: Camera): void;
  /** 调试摘要。 */
  summary(): string;
}

export function buildStreets(city: CityFile, plans: readonly RoadPlan[], ground: HeightFn, relief: TerrainGrid | null): Streets {
  const q = getQuality();
  const high = q.tier === 'high';
  // 敏感区只做背景：客户端生成的路灯、交通灯、山上灯点、树都不放进去（数据管线对道具点也是同一规则）
  const zones = city.zones.sensitive;
  const lamps = outsideZones(streetLamps(plans), zones, (l) => l.pole, (l) => l.head);
  const mask = relief ? groundMask(city, plans) : null;
  const hills = outsideZones(relief && mask && high ? hillLights(relief, (x, y) => mask.sample(x, y, 1), (x, y) => mask.sample(x, y, 0)) : [], zones, (h) => h.p);

  // 看得见的地面：路面上取水平路面（路口取最高的一片），否则取路廊压低后的地形
  const surface = new RenderedSurface(plans, relief ? renderedTerrain(relief, plans, city.buildings).fn : ground);
  const surfaceAt = (x: number, y: number) => surface.heightAt(x, y);

  // 静态光点：路灯灯头 + 山上灯点 + 交通灯（一个 draw call）
  const signals = outsideZones(signalHeads(city.props.signals, plans, ground, surfaceAt), zones, (s) => s.base);
  const glow = new GlowBatch(lamps.length + hills.length + signals.length * 3 + 8, 'street-lights');
  let n = writeLampHeads(glow, lamps, 0);
  n = writeSignalHeads(glow, signals, n);
  const warm = lightColour('homeWarm');
  const cool = lightColour('homeCool');
  for (const h of hills) glow.set(n++, h.p, h.warm ? warm : cool, h.intensity, 0.6);
  glow.setCount(n);
  glow.commit();

  // 灯杆只在 HIGH 画（LOW 只留灯头光点，省三角形）
  const poles = lampPoles(lamps, high ? 350 : 0, high ? 700 : 1);
  const sigPoles = signalPoles(signals, high ? 300 : 0);
  // 天桥、树只在 HIGH 画（LOW 档三角形预算 ≤ 140k）
  const bridges = high ? buildFootbridges(city.roads, ground) : null;
  const trees = treeProps(
    high ? treeItems(city.props.trees, ground, relief, mask, 3000, surfaceAt, (x, y) => inZones(zones, x, y)) : [],
    high,
  );

  // 车流 + 电车：车身 3 个 draw call（私家车 / 出租车、巴士、电车），车灯 1 个
  const lanes = buildLanes(plans);
  // 敏感区里的车道：不刷车、也不接进去（车开到区边掉头 / 重生）
  const blockedLane = lanes.map((l) => inZones(zones, l.mid[0] * 10, l.mid[1] * 10));
  for (const l of lanes) l.next = blockedLane[l.id] ? [] : l.next.filter((n) => !blockedLane[n]);
  const traffic = new Traffic(lanes, { cap: high ? 900 : 260, seed: TRAFFIC_SEED, core: CORE_RECT_M });
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
  let buses = 0;
  for (let i = 0; i < traffic.n; i++) if (traffic.kind[i] === VehicleKind.Bus) buses++;
  const vehicles = new VehicleRenderer(traffic.n - buses, buses);
  const trams = new Trams(tramTracks(city.rails, ground));
  const moving = new GlowBatch(traffic.n * 4 + trams.count * 3 + 8, 'traffic-lights');
  const poses: VehiclePose[] = Array.from({ length: traffic.n }, () => ({ x: 0, y: 0, z: 0, hx: 1, hz: 0, kind: 0, brake: false, seed: 0 }));
  const pose = { x: 0, y: 0, z: 0, hx: 1, hz: 0 };

  return {
    objects: [glow.mesh, poles.mesh, sigPoles.mesh, ...trees.map((t) => t.mesh), ...(bridges ? [bridges] : []), vehicles.cars, vehicles.buses, trams.mesh, moving.mesh],
    update(_dt, camera) {
      poles.update(camera);
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
      li = trams.write(t, camera, moving, li);
      moving.setCount(li);
      moving.commit(true);
    },
    summary: () => `路燈 ${lamps.length} · 山燈 ${hills.length} · 車 ${traffic.n}（巴士 ${buses}）· 電車 ${trams.count}`,
  };
}

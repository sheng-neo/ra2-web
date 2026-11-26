/**
 * 电车「叮叮」（R2 TRAMS，取代 R1 的方盒电车）：两条行车线（西行 / 东行）、站岛、架空线、轨道板、电车车身与车灯。
 *
 * - 路线、站岛、架空线布置、行车时刻都是纯函数（render/streets/tram/*）；位置只取决于 SIM_CLOCK.t，同一时刻截图相同。
 * - draw call：车身 LOD0（近）+ LOD1（远）2 个、轨道板 1 个、架空线 1 个、站岛 1 个、线杆 1 个；车灯进 traffic-lights 光点批。
 *   HIGH：LOD0 < 180 m、LOD1 < 2.5 km；LOW：LOD0 < 80 m、LOD1 < 1.2 km。CPU 逐车做视锥剔除。
 * - 敏感区：站岛、线杆不进区（布置时排除）；电车本身沿真实路轨跑，不经过敏感区。
 * - 调试钩子：debugCars()（main.ts 挂到 window.__central.trams）；打铃事件 drainBells()（音频用）；跟车 ridePose()。
 */
import {
  Frustum,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Sphere,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';
import type { CityFile } from '@central/data';
import { simToThree } from '../../coords';
import type { HeightFn } from '../../data/terrain';
import { lightColour, type GlowBatch } from '../materials/lighting';
import type { RoadPlan } from '../roads';
import type { StreetLamp } from './lamps';
import { linearRGB, type V3 } from './prop-geometry';
import { destAtlasTexture } from './tram/atlas';
import { CLUSTER_Y_M, CLUSTER_Z_M, LAMP_Y_M, STACK_Y_M, STACK_Z_M, TRAM_BULGE_M, TRAM_HALF_SIDE_M, tramGeometry } from './tram/body'; // [r3:liveries]
import { aimPole } from './tram/pole';
import { tramContext } from './tram/context';
import { NearInstances, RIDE_FRAME_SCALE, islandGeometry, placeMatrix, poleGeometry, rideFrameGeometry, type NearItem } from './tram/infra';
import { createPropMaterial } from './prop-material';
import { LiveryKind, hash01, tramFleet, type CarLivery } from './tram/livery'; // [r3:liveries]
import { TRAM_DESTINATIONS } from './transit-data'; // [r3:liveries]
import { createTramMaterial } from './tram/material';
import { placeOverhead, type OverheadPlan } from './tram/overhead';
import { buildRoutes, projectOnRoute, resampleEven, routePose, type RoutePose, type TramRoute } from './tram/route';
import { bellBetween, carState, curveCap, baseDwell, routeTimetables, speedProfile, type CarState, type CarTimetable, type SpeedProfile } from './tram/schedule';
import { inIsland, placeStops, type TramStop } from './tram/stops';
import { LampField, buildTrackBed } from './tram/trackbed';
import { buildWires } from './tram/wires';

export interface TramBuildInput {
  city: CityFile;
  plans: readonly RoadPlan[];
  /** 原始地形（dm）。 */
  ground: HeightFn;
  /** 看得见的地面（dm），streets/surface.ts RenderedSurface.heightAt。 */
  surface: HeightFn;
  lamps: readonly StreetLamp[];
  high: boolean;
}

export interface TramCarDebug {
  /** 路线：0 = 西行，1 = 东行。 */
  track: number;
  /** 模拟坐标（米）、轨顶高程 mPD。 */
  x: number;
  y: number;
  z: number;
  /** 车头朝向（弧度，自东逆时针）。 */
  heading: number;
  speed: number;
  /** 停在哪个站（站 id），在走为 null。 */
  atStop: string | null;
  /** 涂装：标准深绿 / 广告车身（R3）。 */ // [r3:liveries]
  livery: 'standard' | 'wrap'; // [r3:liveries]
  /** 车队编号。 */ // [r3:liveries]
  fleet: number; // [r3:liveries]
  /** 目的地牌。 */ // [r3:liveries]
  dest: { zh: string; en: string }; // [r3:liveries]
}

export interface TramBell {
  /** three 坐标（米）。 */
  pos: [number, number, number];
  /** 0–1，同一辆车的铃声音高一致。 */
  seed: number;
}

/** 给 STREETLIFE 的候车区（模拟坐标，米）。 */
export interface TramIsland {
  id: string;
  centre: [number, number];
  axis: [number, number];
  length: number;
  width: number;
  z: number;
}

let lastIslands: TramIsland[] = [];

/** 不在两条行车线上的电车路轨（渡线、支线、车厂线）：2 m 重采样的折线（模拟坐标米）。 */
function branchRails(city: CityFile, routes: readonly TramRoute[]): [number, number][][] {
  const out: [number, number][][] = [];
  for (const r of city.rails) {
    if (r.kind !== 'tram') continue;
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < r.pts.length; i += 2) pts.push([r.pts[i]! / 10, r.pts[i + 1]! / 10]);
    const line = resampleEven(pts, 2);
    // 整段都贴在某条行车线上（≤ 1.2 m）的，是已经画了的主线 / 延伸段
    const off = line.filter(([x, y]) => routes.every((rt) => projectOnRoute(rt, x, y).d > 1.2));
    if (off.length >= 2 && line.length >= 2) out.push(line);
  }
  return out;
}

/** 最近一次建好的站岛（模拟坐标，米）：整合时喂给行人系统的 setWaitingAreas。 */
export function tramStopIslands(): TramIsland[] {
  return lastIslands.map((s) => ({ ...s, centre: [...s.centre], axis: [...s.axis] }));
}

interface Car {
  route: number;
  tt: CarTimetable;
  livery: CarLivery;
  col: [V3, V3, V3];
  state: CarState;
  seed: number;
  /** 车的种子（涂装、目的地按它定）。 */ // [r3:liveries]
  key: number; // [r3:liveries]
}

/** 站岛遮篷色带（柔和、通用，不用营运商绿色）。 */
const FASCIA = ['#6d8fa8', '#a8776d', '#8c8aa6', '#7d9a86', '#b0955f', '#6f7d8c'];
const AD = ['#e85a71', '#4fb0c6', '#f2b134', '#7d5ba6', '#5bbf7a', '#f07b3f', '#3d6fd8'];

const HEAD = lightColour('headlight');
const TAIL = lightColour('tailLight');

/** 架空线杆顶（m，infra.ts poleGeometry：9 m 杆 + 杆帽）。 */
const POLE_TOP_M = 9.2;

/** 每车光点：车头中线头灯 + 车尾两角红灯 + 车尾观者左侧的红灯（R3：照片 01–03 只有一盏头灯）。 */ // [r3:liveries]
const LIGHTS_PER_CAR = 4;

class TramLod {
  readonly mesh: InstancedMesh;
  readonly col0: InstancedBufferAttribute;
  readonly col1: InstancedBufferAttribute;
  readonly col2: InstancedBufferAttribute;
  readonly meta: InstancedBufferAttribute;
  readonly meta2: InstancedBufferAttribute; // [r3:liveries]
  readonly st: InstancedBufferAttribute;
  n = 0;
  constructor(lod: 0 | 1, cap: number, material: ReturnType<typeof createTramMaterial>) {
    const geo = tramGeometry({ lod });
    const mk = (k: number) => new InstancedBufferAttribute(new Float32Array(cap * k), k);
    this.col0 = mk(3);
    this.col1 = mk(3);
    this.col2 = mk(3);
    this.meta = mk(4);
    this.meta2 = mk(4); // [r3:liveries]
    this.st = mk(4);
    geo.setAttribute('iCol0', this.col0);
    geo.setAttribute('iCol1', this.col1);
    geo.setAttribute('iCol2', this.col2);
    geo.setAttribute('iMeta', this.meta);
    geo.setAttribute('iMeta2', this.meta2); // [r3:liveries]
    geo.setAttribute('iState', this.st);
    this.mesh = new InstancedMesh(geo, material, cap);
    this.mesh.name = lod === 0 ? 'trams-near' : 'trams-far';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }
  commit(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const a of [this.col0, this.col1, this.col2, this.meta, this.meta2, this.st]) a.needsUpdate = true; // [r3:liveries]
  }
}

export class TramSystem {
  readonly objects: Object3D[] = [];
  readonly routes: TramRoute[];
  readonly stops: TramStop[];
  readonly overhead: OverheadPlan;
  private readonly profiles: SpeedProfile[];
  private readonly cars: Car[] = [];
  private readonly lods: [TramLod, TramLod];
  private readonly islands: NearInstances | null;
  private readonly poles: NearInstances | null;
  private readonly lampField: LampField;
  private readonly high: boolean;
  private readonly bells: TramBell[] = [];
  private lastT = -1;
  /** 跟车：被跟的车（画面上不画这辆车，相机在它的上层车头）。 */
  private ridden = -1;
  private readonly pose: RoutePose = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly one = new Vector3(1, 1, 1);
  private readonly p2 = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly frustum = new Frustum();
  private readonly sphere = new Sphere();
  private readonly pv = new Matrix4();
  private readonly v3 = [0, 0, 0];
  private readonly d3 = [0, 0, 0];
  private readonly lampE: [number, number, number] = [0, 0, 0];
  private readonly tip: [number, number, number] = [0, 0, 0];
  private readonly scratchState: CarState = { s: 0, v: 0, atStop: -1, tau: 0 };
  private readonly pose2: RoutePose = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };
  private readonly v3b = [0, 0, 0];
  /** 各车本帧的位置（three）与速度：音频（马达声）用。 */
  private readonly carPos: Float32Array;

  constructor(input: TramBuildInput) {
    const { city, plans, ground, surface, lamps, high } = input;
    this.high = high;
    this.lampField = new LampField(lamps);
    const ctx = tramContext(city, plans, ground, surface);
    this.routes = buildRoutes(city.rails, ctx.route);
    this.stops = this.routes.length ? placeStops(this.routes, ctx.stops) : [];
    // 整合（R2）：杆不立在站岛上（站岛贴着行人路的路段，杆原本会落在站台中间），外扩 0.5 m；
    // 杆 / 楼面锚也不放在行人天桥、高架路底下（桥底低于杆顶 + 0.8 m 就算挡住）
    const stops = this.stops;
    const o = ctx.overhead;
    const underDeck = (x: number, y: number) => {
      const so = o.soffit(x, y);
      return so !== null && so < o.surfaceM(x, y) + POLE_TOP_M + 0.8;
    };
    const overheadCtx = { ...o, blocked: (x: number, y: number) => inIsland(stops, x, y, 0.5) || underDeck(x, y) };
    this.overhead = this.routes.length ? placeOverhead(this.routes, overheadCtx) : { supports: [], spans: [], contact: [] };
    lastIslands = this.stops.map((s) => ({ id: s.id, centre: s.centre, axis: s.axis, length: s.length, width: s.width, z: s.z }));
    // 行车时刻：每条路线一份速度曲线；西行第 0 号车开场 10 s 进 W1，东行第 0 号车开场 22 s 进 E1
    this.profiles = this.routes.map((r) => {
      const rs = this.stops.filter((s) => s.route === r.id);
      return speedProfile(r.len, rs.map((s) => s.s), curveCap(r));
    });
    this.routes.forEach((r, ri) => {
      const rs = this.stops.filter((s) => s.route === r.id);
      const first = rs.findIndex((s) => s.anchor === (r.westbound ? 'W1' : 'E1'));
      const tts = routeTimetables(this.profiles[ri]!, rs.map((s) => baseDwell(s.seed)), 1000 + ri * 77, first, r.westbound ? 10 : 22);
      tts.forEach((tt, k) => {
        const seed = ri * 1000 + k + 1;
        this.cars.push({ route: ri, tt, livery: null as unknown as CarLivery, col: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], state: { s: 0, v: 0, atStop: -1, tau: 0 }, seed: hash01(seed * 7 + 1), key: seed }); // [r3:liveries]
      });
    });
    // [r3:liveries] 车队涂装：约 25 % 标准深绿、其余广告车身，车队编号每车唯一；
    // [r3:liveries] 主角车是标准深绿：开场进 W1 的西行第 0 号车（「電車」机位）、开场 30 s 后第一辆停 E2 的东行车（「tram-livery」机位）
    const heroes = [this.cars.findIndex((c) => this.routes[c.route]!.westbound && c.key % 1000 === 1), this.firstAtAnchor('E2', 30, 600)]; // [r3:liveries]
    const fleet = tramFleet(this.cars.map((c) => ({ seed: c.key, westbound: this.routes[c.route]!.westbound })), heroes); // [r3:liveries]
    this.cars.forEach((c, i) => { c.livery = fleet[i]!; c.col = c.livery.colours.map((h) => linearRGB(h)) as [V3, V3, V3]; }); // [r3:liveries]
    this.carPos = new Float32Array(this.cars.length * 4);
    const material = createTramMaterial(destAtlasTexture(), high ? 60 : 30); // [r3:liveries] 字只在 60 m（LOW 30 m）内画
    const cap = Math.max(this.cars.length, 1);
    this.lods = [new TramLod(0, cap, material), new TramLod(1, cap, material)];
    this.objects.push(this.lods[0].mesh, this.lods[1].mesh);

    // 轨道板（HIGH 4 m 一站、LOW 8 m）
    const bed = buildTrackBed(this.routes, this.lampField, { step: high ? 4 : 8 }, (x, y) => surface(x * 10, y * 10) / 10, branchRails(city, this.routes));
    if (bed) this.objects.push(bed);
    // 架空线：接触线 Ø 12 mm、跨线 Ø 10 mm（按真实半径画，远处按像素 ≥ 0.65 px 半宽，约 1 像素的暗线）
    const wires = buildWires(
      [...this.overhead.contact.map((pts) => ({ pts, radius: 0.006 })), ...this.overhead.spans.map((pts) => ({ pts, radius: 0.005 }))],
      high ? 350 : 150,
      this.lampField,
    );
    if (wires) this.objects.push(wires);
    // 站岛（实例）
    const v = [0, 0, 0];
    const d = [0, 0, 0];
    const islandItems: NearItem[] = this.stops.map((s) => {
      simToThree(s.centre[0], s.centre[1], s.z, v, 0, 1);
      simToThree(s.axis[0], s.axis[1], 0, d, 0, 1);
      return {
        pos: new Vector3(v[0], v[1], v[2]),
        matrix: placeMatrix([v[0]!, v[1]!, v[2]!], d[0]!, d[2]!),
        body: linearRGB(FASCIA[Math.floor(s.seed * FASCIA.length)]!),
        band: linearRGB(AD[Math.floor(hash01(Math.round(s.seed * 1e6)) * AD.length)]!),
      };
    });
    this.islands = islandItems.length ? new NearInstances(islandGeometry(), islandItems, high ? 500 : 200, 'tram-islands', true) : null;
    // 线杆与楼面锚（同一个实例网格：锚 = 压扁的杆）
    const poleItems: NearItem[] = this.overhead.supports.map((s) => {
      simToThree(s.x, s.y, s.kind === 'pole' ? s.z : s.z - 0.18, v, 0, 1);
      simToThree(s.dx, s.dy, 0, d, 0, 1);
      const scale: [number, number, number] = s.kind === 'pole' ? [1, 1, 1] : [1.1, 0.04, 1.1];
      return { pos: new Vector3(v[0], v[1], v[2]), matrix: placeMatrix([v[0]!, v[1]!, v[2]!], d[0]!, d[2]!, scale) };
    });
    this.poles = poleItems.length ? new NearInstances(poleGeometry(), poleItems, high ? 300 : 120, 'tram-poles', false) : null;
    if (this.islands) this.objects.push(this.islands.mesh);
    if (this.poles) this.objects.push(this.poles.mesh);
    // 搭电车：上层车头内景（只在跟车时画，1 个 draw call）
    this.cab = new Mesh(rideFrameGeometry(), createPropMaterial({ light: 0.6 }));
    this.cab.name = 'tram-ride-cab';
    this.cab.matrixAutoUpdate = false;
    this.cab.frustumCulled = false;
    this.cab.visible = false;
    this.cab.renderOrder = 3;
    this.objects.push(this.cab);
  }

  private readonly cab: Mesh;

  /** [r3:liveries] 时刻 t0 之后（逐秒扫到 t1）第一辆停在锚点站 anchor 的车的下标；没有返回 −1（纯计算）。 */
  private firstAtAnchor(anchor: string, t0: number, t1: number): number {
    const st: CarState = { s: 0, v: 0, atStop: -1, tau: 0 };
    const idx = this.routes.map((r) => this.stops.filter((s) => s.route === r.id).findIndex((s) => s.anchor === anchor));
    for (let t = t0; t <= t1; t++) {
      for (let i = 0; i < this.cars.length; i++) {
        const car = this.cars[i]!;
        const k = idx[car.route]!;
        if (k < 0) continue;
        carState(this.profiles[car.route]!, car.tt, t, st);
        if (st.atStop === k) return i;
      }
    }
    return -1;
  }

  get count(): number {
    return this.cars.length;
  }

  /** 光点批要预留的容量。 */
  get lightCapacity(): number {
    return this.cars.length * LIGHTS_PER_CAR;
  }

  /** 写入时刻 t 的全部电车；车灯从 start 起写进 lights，返回下一个下标。 */
  update(t: number, camera: Camera, lights: GlowBatch, start: number): number {
    this.islands?.update(camera);
    this.poles?.update(camera);
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const cam = camera.position;
    const near = this.high ? 180 : 80;
    const far = this.high ? 2500 : 1200;
    const [l0, l1] = this.lods;
    l0.n = 0;
    l1.n = 0;
    let li = start;
    const pose = this.pose;
    const v = this.v3;
    const d = this.d3;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i]!;
      const r = this.routes[car.route]!;
      const prof = this.profiles[car.route]!;
      carState(prof, car.tt, t, car.state);
      if (this.lastT >= 0 && t > this.lastT && t - this.lastT < 5) {
        const bell = bellBetween(car.tt, this.lastT, t, car.state);
        if (bell >= 0) {
          routePose(r, car.state.s, pose);
          simToThree(pose.x, pose.y, pose.z + 3, v, 0, 1);
          this.bells.push({ pos: [v[0]!, v[1]!, v[2]!], seed: car.seed });
        }
      }
      if (i === this.ridden) {
        routePose(r, car.state.s, pose);
        simToThree(pose.x, pose.y, pose.z, v, 0, 1);
        this.writeCarPos(i, v[0]!, v[1]! + 1.2, v[2]!, car.state.v);
        continue;
      }
      routePose(r, car.state.s, pose);
      simToThree(pose.x, pose.y, pose.z, v, 0, 1);
      simToThree(pose.hx, pose.hy, 0, d, 0, 1);
      const x = v[0]!;
      const y = v[1]!;
      const z = v[2]!;
      const hx = d[0]!;
      const hz = d[2]!;
      this.writeCarPos(i, x, y + 1.2, z, car.state.v);
      const dist = Math.hypot(cam.x - x, cam.y - y - 2, cam.z - z);
      if (dist > far) continue;
      this.sphere.center.set(x, y + 2.3, z);
      this.sphere.radius = 5.6;
      const visible = this.frustum.intersectsSphere(this.sphere);
      // 车灯（R3）：车头中线一盏头灯；车尾两角红灯 + 观者左侧红灯；朝向相机才亮（从车后看不到头灯） // [r3:liveries]
      const fx = cam.x - x;
      const fz = cam.z - z;
      const facing = (hx * fx + hz * fz) / (Math.hypot(fx, fz) || 1);
      const headK = 0.1 + 0.9 * Math.max(0, Math.min(1, (facing + 0.25) / 0.85));
      const tailK = 0.1 + 0.9 * Math.max(0, Math.min(1, (-facing + 0.25) / 0.85));
      // 右手方向（three）：(−hz, 0, hx)
      const rx = -hz;
      const rz = hx;
      const half = TRAM_HALF_SIDE_M + TRAM_BULGE_M + 0.04; // [r3:liveries]
      lights.setXYZ(li++, x + hx * half, y + LAMP_Y_M, z + hz * half, HEAD, 8 * headK, 0.11); // [r3:liveries]
      for (let side = -1; side <= 1; side += 2) { // [r3:liveries]
        const lx = side * CLUSTER_Z_M[2]!; // [r3:liveries]
        lights.setXYZ(li++, x - hx * (half - 0.2) + rx * lx, y + CLUSTER_Y_M, z - hz * (half - 0.2) + rz * lx, TAIL, 1.8 * tailK, 0.05); // [r3:liveries]
      } // [r3:liveries]
      lights.setXYZ(li++, x - hx * (half - 0.2) - rx * STACK_Z_M, y + STACK_Y_M[0], z - hz * (half - 0.2) - rz * STACK_Z_M, TAIL, 1.4 * tailK, 0.045); // [r3:liveries]
      if (!visible) continue;
      const lod = dist < near ? l0 : l1;
      const k = lod.n++;
      this.q.setFromAxisAngle(this.up, Math.atan2(-hz, hx));
      this.m.compose(this.p.set(x, y, z), this.q, this.one);
      lod.mesh.setMatrixAt(k, this.m);
      const [c0, c1, c2] = car.col;
      lod.col0.setXYZ(k, c0[0], c0[1], c0[2]);
      lod.col1.setXYZ(k, c1[0], c1[1], c1[2]);
      lod.col2.setXYZ(k, c2[0], c2[1], c2[2]);
      const lv = car.livery;
      lod.meta.setXYZW(k, lv.kind, lv.pattern, lv.dest, lv.seed); // [r3:liveries]
      lod.meta2.setXYZW(k, lv.fleet, lv.word, lv.perforated ? 1 : 0, 0); // [r3:liveries]
      // 集电杆：杆头搭在接触线上离杆座 4 m 的点（仰角、偏角）
      const aim = aimPole(r, car.state.s, pose, this.tip);
      const sodium = this.lampField.at(x, y, z, this.lampE, 2.2);
      const e = 0.2126 * this.lampE[0] + 0.7152 * this.lampE[1] + 0.0722 * this.lampE[2];
      lod.st.setXYZW(k, aim.pitch, Math.min(e, 3), aim.yaw, sodium);
    }
    l0.commit();
    l1.commit();
    this.lastT = t;
    return li;
  }

  private writeCarPos(i: number, x: number, y: number, z: number, v: number): void {
    const a = this.carPos;
    a[i * 4] = x;
    a[i * 4 + 1] = y;
    a[i * 4 + 2] = z;
    a[i * 4 + 3] = v;
  }

  /** 测试 / 调试：第 i 辆车在时刻 t 的杆头位置（模拟坐标，米 + mPD）。 */
  poleTip(i: number, t: number): [number, number, number] {
    const car = this.cars[i]!;
    const r = this.routes[car.route]!;
    const st: CarState = { s: 0, v: 0, atStop: -1, tau: 0 };
    carState(this.profiles[car.route]!, car.tt, t, st);
    const pose = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };
    routePose(r, st.s, pose);
    const out: [number, number, number] = [0, 0, 0];
    aimPole(r, st.s, pose, out);
    return out;
  }

  /** 离 p（three）range 米内最近的 n 辆车（位置 three、速度 m/s），马达声用。 */
  nearest(p: { x: number; y: number; z: number }, n: number, range: number): { pos: [number, number, number]; speed: number; d: number }[] {
    const out: { pos: [number, number, number]; speed: number; d: number }[] = [];
    const a = this.carPos;
    for (let i = 0; i < this.cars.length; i++) {
      const d = Math.hypot(a[i * 4]! - p.x, a[i * 4 + 1]! - p.y, a[i * 4 + 2]! - p.z);
      if (d > range) continue;
      out.push({ pos: [a[i * 4]!, a[i * 4 + 1]!, a[i * 4 + 2]!], speed: a[i * 4 + 3]!, d });
    }
    return out.sort((u, w) => u.d - w.d).slice(0, n);
  }

  /** 取走本帧以前的打铃事件。 */
  drainBells(): TramBell[] {
    return this.bells.splice(0, this.bells.length);
  }

  /** 时刻 t 各车在路线上的位置（m）与停站下标（测试用，纯计算）。 */
  carPositions(t: number): { track: number; s: number; atStop: number }[] {
    const st: CarState = { s: 0, v: 0, atStop: -1, tau: 0 };
    return this.cars.map((car) => {
      carState(this.profiles[car.route]!, car.tt, t, st);
      return { track: car.route, s: st.s, atStop: st.atStop };
    });
  }

  /** 第 i 辆车所在路线 id（tram-traffic.ts TramPositions）。 */
  routeOf(i: number): number {
    return this.routes[this.cars[i]!.route]!.id;
  }

  /** 时刻 t 各车沿线位置（m），写进 out[i]（纯计算，不动本帧状态）。 */
  positions(t: number, out: Float64Array): void {
    const st = this.scratchState;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i]!;
      carState(this.profiles[car.route]!, car.tt, t, st);
      out[i] = st.s;
    }
  }

  /** 时刻 t 各车车身中心与朝向（three xz）：out[i·4 ..] = x, z, hx, hz（tram-traffic.ts TramPositions）。 */
  poses(t: number, out: Float64Array): void {
    const st = this.scratchState;
    const pose = this.pose2;
    const v = this.v3b;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i]!;
      carState(this.profiles[car.route]!, car.tt, t, st);
      routePose(this.routes[car.route]!, st.s, pose);
      simToThree(pose.x, pose.y, 0, v, 0, 1);
      out[i * 4] = v[0]!;
      out[i * 4 + 1] = v[2]!;
      simToThree(pose.hx, pose.hy, 0, v, 0, 1);
      out[i * 4 + 2] = v[0]!;
      out[i * 4 + 3] = v[2]!;
    }
  }

  /** 调试：时刻 t 的全部电车（模拟坐标）。 */
  debugCars(t: number): TramCarDebug[] {
    const st: CarState = { s: 0, v: 0, atStop: -1, tau: 0 };
    const pose = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };
    const byRoute = this.routes.map((r) => this.stops.filter((s) => s.route === r.id));
    return this.cars.map((car) => {
      const r = this.routes[car.route]!;
      carState(this.profiles[car.route]!, car.tt, t, st);
      routePose(r, st.s, pose);
      const stops = byRoute[car.route]!;
      return {
        track: car.route,
        x: pose.x,
        y: pose.y,
        z: pose.z,
        heading: Math.atan2(pose.hy, pose.hx),
        speed: st.v,
        atStop: st.atStop >= 0 ? (stops[st.atStop]?.id ?? null) : null,
        livery: car.livery.kind === LiveryKind.Standard ? 'standard' : 'wrap', // [r3:liveries]
        fleet: car.livery.fleet, // [r3:liveries]
        dest: { zh: TRAM_DESTINATIONS[car.livery.dest]!.zh, en: TRAM_DESTINATIONS[car.livery.dest]!.en }, // [r3:liveries]
      };
    });
  }

  /**
   * 跟车：选离 (x, z)（three 坐标）最近的一辆西行车；返回是否选中。ride(null) 取消。
   */
  ride(from: { x: number; z: number } | null): boolean {
    if (!from) {
      this.ridden = -1;
      this.cab.visible = false;
      return false;
    }
    const v = this.v3;
    let best = -1;
    let bd = Infinity;
    this.cars.forEach((car, i) => {
      if (!this.routes[car.route]!.westbound) return;
      routePose(this.routes[car.route]!, car.state.s, this.pose);
      simToThree(this.pose.x, this.pose.y, this.pose.z, v, 0, 1);
      const dd = Math.hypot(v[0]! - from.x, v[2]! - from.z);
      // 不选快到终点的车（跑完一趟会跳回起点）
      if (car.state.s > this.routes[car.route]!.len - 400) return;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    this.ridden = best;
    return best >= 0;
  }

  /** 跟车机位（three 坐标）：上层车头后 0.6 m、离轨顶 3.7 m，向前看、俯 13°。没在跟车返回 false。 */
  ridePose(eye: Vector3, target: Vector3): boolean {
    if (this.ridden < 0) {
      this.cab.visible = false;
      return false;
    }
    const car = this.cars[this.ridden]!;
    const r = this.routes[car.route]!;
    // 快到路线终点（数据范围边缘）就下车：时刻表会把车送回起点，镜头不能跟着跳 3 km
    if (car.state.s > r.len - 50) {
      this.ridden = -1;
      this.cab.visible = false;
      return false;
    }
    routePose(r, car.state.s, this.pose, 5);
    const v = this.v3;
    const d = this.d3;
    simToThree(this.pose.x, this.pose.y, this.pose.z, v, 0, 1);
    simToThree(this.pose.hx, this.pose.hy, 0, d, 0, 1);
    const fwd = TRAM_HALF_SIDE_M + 0.35 - 0.6;
    eye.set(v[0]! + d[0]! * fwd, v[1]! + 3.7, v[2]! + d[2]! * fwd);
    target.set(eye.x + d[0]! * 20, eye.y - Math.tan((13 * Math.PI) / 180) * 20, eye.z + d[2]! * 20);
    // 车头内景：以相机为原点、跟车头朝向，放大 RIDE_FRAME_SCALE 倍（透视不变）
    this.q.setFromAxisAngle(this.up, Math.atan2(-d[2]!, d[0]!));
    this.cab.matrix.compose(this.p.copy(eye), this.q, this.p2.setScalar(RIDE_FRAME_SCALE));
    this.cab.matrixWorld.copy(this.cab.matrix);
    this.cab.visible = true;
    return true;
  }

  summary(): string {
    const poles = this.overhead.supports.filter((s) => s.kind === 'pole').length;
    return `電車 ${this.cars.length} 架 · 站 ${this.stops.length} · 杆 ${poles} · 牆錨 ${this.overhead.supports.length - poles} · 跨線 ${this.overhead.spans.length}`;
  }
}

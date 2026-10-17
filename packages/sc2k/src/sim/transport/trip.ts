// ===== sim/transport/trip.ts =====（spec:transport §2.11 起点、§2.12 出行生成器、§2.12.4 模式转移表、§3.6 伪代码）
// 带回溯的随机深度优先搜索：步数预算（popLevel == 1 时减四分之一）、每节点 4 次尝试、禁止掉头 / 桥上直行 / 刚入地铁四向全开、
// 回溯恢复步数与剩余方向、512 栈、2×2 车站占地的 visited 掩码；成功后沿最终栈把 ROAD / HIGHWAY / ROADBRIDGE 帧经 act.addTraffic 写 XTRF，
// 并按 popLevel 累加公交 / 铁路 / 地铁乘客（priv）。随机只用 ctx.prng（turn 一次 bit()、每个节点一次 int(4)）。
import { DX, DY, ZONE_MASK, dirBit, inMap, opposite, tileIndex, tileX, tileY } from '../../contracts/grid';
import type { Dir, ZoneCode } from '../../contracts/grid';
import { StationKind, isBridge, isHighway, isOnramp, isPortal, isRail, isRoad, isRoadSurface, isSubwayUnd, isTerminal } from '../../contracts/net';
import type { TripResult } from '../../contracts/queries';
import { Mode, stationKindOf } from './model';
import { privOf } from './priv';
import { findAccessStart, fpIndex, rebuildStations } from './runtime';
import type { Runtime } from './runtime';
import { CONNECTION_MARK } from './connections';

/** step() 的结果编码：到达 / 不可走 为负数，可走 = (新模式 << 4) | 步数。 */
export const ARRIVE = -1, BLOCKED = -2;
export const stepMode = (r: number): Mode => (r >> 4) as Mode;
export const stepCost = (r: number): number => r & 0x0f;
const mv = (mode: Mode, cost: number): number => (mode << 4) | cost;
const FAIL: TripResult = Object.freeze({ ok: false, usedBus: false, usedRail: false, usedSubway: false, steps: 0 });

export const enterMode = (k: StationKind): Mode => (k === StationKind.Bus ? Mode.Bus : k === StationKind.Rail ? Mode.RailEnter : Mode.SubwayEnter);
const isSubRail = (id: number): boolean => id >= 0x6c && id <= 0x6f;
/** 原版实现对步行者的粗分类区间 0x43–0x50（含高速直线段 0x49/0x4A），spec §2.12.4 原文。 */
const isCrossover = (id: number): boolean => id >= 0x43 && id <= 0x50;
/** 轨道模式眼里的铁路：RAIL_SET + 铁路桥 0x5A/0x5B（spec §2.2："出行时视为铁路"；契约 RAIL_SET 不含桥段）。 */
const isRailTile = (id: number): boolean => isRail(id) || id === 0x5a || id === 0x5b;

export interface TripEngine {
  /** 转移表（§2.12.4）：cur / next 为格索引，visited 为当前帧的占地掩码，zone 为起点分区码。 */
  step(mode: Mode, cur: number, visited: number, next: number, zone: number): number;
  runTrip(i: number, zone: ZoneCode, popLevel: 0 | 1 | 2 | 3 | 4): TripResult;
}

export function createTripEngine(rt: Runtime): TripEngine {
  // 预分配搜索栈（按 stackLimit 惰性扩容；避免每次出行分配）
  let cap = 0;
  let sx = new Int16Array(0), sy = new Int16Array(0), smode = new Uint8Array(0), ssteps = new Int32Array(0), sdirs = new Uint8Array(0), svis = new Uint8Array(0);
  const ensureStack = (n: number): void => {
    if (cap >= n) return;
    cap = n;
    sx = new Int16Array(n); sy = new Int16Array(n); smode = new Uint8Array(n); ssteps = new Int32Array(n); sdirs = new Uint8Array(n); svis = new Uint8Array(n);
  };

  /** 汽车 / 步行模式眼里的"桥面"：BRIDGE_SET，铁路桥与高架电线按两个怪癖开关取舍。 */
  const isCarBridge = (id: number): boolean => {
    if (!isBridge(id)) return false;
    if (id === 0x5a || id === 0x5b) return rt.tune.carsCrossRailBridge;
    if (id === 0x5c) return rt.tune.carsCrossWireBridge;
    return true;
  };
  const isSubwayU = (u: number): boolean => isSubwayUnd(u) && (rt.tune.missileSiloIsSubway || u !== 0x22);

  function step(mode: Mode, cur: number, visited: number, next: number, zone: number): number {
    const T = rt.tune;
    const L = rt.state.layers;
    const id = L.xbld[next]!;
    const destHit = (): boolean => (((1 << (L.xzon[next]! & ZONE_MASK)) & (T.destMask[zone] ?? 0)) !== 0);
    /** 车站三谓词（§2.9.1）：返回 [kind, same, unvisited]。 */
    const stationRel = (): [StationKind, boolean, boolean] => {
      const so = rt.stationOf[next]!;
      if (so === 0) return [StationKind.None, false, false];
      const same = so === rt.stationOf[cur]!;
      if (!same) return [rt.station[next] as StationKind, false, false];
      const s = rt.stations[so - 1]!;
      const bit = 1 << fpIndex(s, tileX(next), tileY(next));
      return [s.kind, true, (visited & bit) === 0];
    };
    switch (mode) {
      case Mode.Road: {
        if (destHit()) return ARRIVE;
        if (isPortal(id)) return mv(Mode.Tunnel, T.stepRoad);
        if (isCarBridge(id)) return mv(Mode.RoadBridge, T.stepRoad);
        if (isOnramp(id)) return mv(Mode.Highway, T.stepOnrampIn);
        if (isRoadSurface(id)) return mv(Mode.Road, T.stepRoad);
        const k = stationKindOf(id);
        if (k !== StationKind.None) return mv(enterMode(k), T.stepTransfer);
        if (isTerminal(id)) return ARRIVE;
        return BLOCKED;
      }
      case Mode.Highway:
        if (isHighway(id)) return mv(Mode.Highway, T.stepRapid);
        if (isOnramp(id)) return mv(Mode.Road, T.stepOnrampOut);
        return BLOCKED;
      case Mode.Tunnel:
        if (L.tunnelLevels[next] !== 0) return mv(Mode.Tunnel, T.stepRoad);
        if (isRoad(id)) return mv(Mode.Road, T.stepRoad);
        return BLOCKED;
      case Mode.RoadBridge:
        if (isCarBridge(id)) return mv(Mode.RoadBridge, T.stepRoad);
        if (isRoad(id)) return mv(Mode.Road, T.stepRoad);
        return BLOCKED;
      case Mode.Walk: {
        if (destHit()) return ARRIVE;
        if (isPortal(id)) return mv(Mode.WalkTunnel, T.stepWalk);
        if (isCarBridge(id) || (T.walkCrossoverAsBridge && isCrossover(id))) return mv(Mode.WalkBridge, T.stepWalk);
        if (isOnramp(id)) return mv(Mode.WalkHighway, T.stepWalk);
        if (isRoadSurface(id)) return mv(Mode.Walk, T.stepWalk);
        const k = stationKindOf(id);
        if (k !== StationKind.None) return mv(enterMode(k), T.stepTransfer);
        if (isTerminal(id)) return ARRIVE;
        return BLOCKED;
      }
      case Mode.WalkHighway:
        if (isHighway(id)) return mv(Mode.WalkHighway, T.stepRapid);
        if (isOnramp(id)) return mv(Mode.Walk, T.stepOnrampOut);
        return BLOCKED;
      case Mode.WalkTunnel:
        if (L.tunnelLevels[next] !== 0) return mv(Mode.WalkTunnel, T.stepWalk);
        if (isRoad(id)) return mv(Mode.Walk, T.stepWalk);
        return BLOCKED;
      case Mode.WalkBridge:
        if (isCarBridge(id) || (T.walkCrossoverAsBridge && isCrossover(id))) return mv(Mode.WalkBridge, T.stepWalk);
        if (isRoad(id)) return mv(Mode.Walk, T.stepWalk);
        return BLOCKED;
      case Mode.Bus: {
        if (destHit()) return ARRIVE;
        const [k, same, unvisited] = stationRel();
        if (k !== StationKind.None) {
          if (same) return unvisited ? mv(Mode.Bus, T.stationInteriorStep) : BLOCKED;
          return k === StationKind.Bus ? mv(Mode.Bus, T.stepTransfer) : BLOCKED;
        }
        if (isRoad(id)) return mv(Mode.Walk, T.stepWalk);
        return BLOCKED;
      }
      case Mode.Exit: {
        if (destHit()) return ARRIVE;
        const [k, same, unvisited] = stationRel();
        if (k !== StationKind.None) {
          if (same) return unvisited ? mv(Mode.Exit, T.stationInteriorStep) : BLOCKED;
          return k === StationKind.Bus || k === StationKind.Rail ? mv(Mode.Exit, T.stepTransfer) : BLOCKED;
        }
        if (isRoad(id)) return mv(Mode.Road, T.stepRoad);
        return BLOCKED;
      }
      case Mode.RailEnter: {
        const [k, same, unvisited] = stationRel();
        if (k !== StationKind.None) {
          if (same) return unvisited ? mv(Mode.RailEnter, T.stationInteriorStep) : BLOCKED;
          return k === StationKind.Rail ? mv(Mode.RailEnter, T.stepTransfer) : BLOCKED;
        }
        if (isRailTile(id)) return mv(Mode.Rail, T.stepRapid);
        return BLOCKED;
      }
      case Mode.SubwayEnter:
        if (isSubwayU(L.xund[next]!)) return mv(Mode.Subway, T.stepRapid);
        return BLOCKED;
      case Mode.Rail:
        if (stationKindOf(id) === StationKind.Rail) return mv(Mode.Exit, T.stepTransfer);
        if (isRailTile(id)) return mv(Mode.Rail, T.stepRapid);
        if (isTerminal(id)) return ARRIVE;
        if (T.allowSubRailTransfer && isSubRail(L.xbld[cur]!) && isSubwayU(L.xund[next]!)) return mv(Mode.Subway, T.stepRapid);
        return BLOCKED;
      case Mode.Subway:
        if (id === 0xe9) return mv(Mode.Exit, T.stepTransfer);
        if (isSubwayU(L.xund[next]!)) return mv(Mode.Subway, T.stepRapid);
        if (T.allowSubRailTransfer && isSubRail(L.xbld[cur]!) && isRailTile(id)) return mv(Mode.Rail, T.stepRapid);
        return BLOCKED;
      default:
        return BLOCKED;
    }
  }

  function runTrip(i: number, zone: ZoneCode, popLevel: 0 | 1 | 2 | 3 | 4): TripResult {
    const prng = rt.prng;
    if (!prng || !rt.act) return FAIL;                                   // 未绑定（init 之前）：不消费 PRNG
    const T = rt.tune;
    const L = rt.state.layers;
    if (rt.stationsDirty) rebuildStations(rt);
    const x0 = tileX(i), y0 = tileY(i);
    if (!inMap(x0, y0)) return FAIL;
    const start = findAccessStart(rt, x0, y0);
    if (start < 0) return FAIL;
    ensureStack(Math.max(1, T.stackLimit | 0));
    let budget = T.maxSteps;
    if (popLevel === 1) budget = Math.floor((budget * T.lowDensityNumerator) / T.lowDensityDenominator);
    const turn = prng.bit() ? 1 : 3;
    const sk = stationKindOf(L.xbld[start]!);
    const s0 = rt.stationOf[start]! === 0 ? null : rt.stations[rt.stationOf[start]! - 1]!;
    let sp = 0;
    sx[0] = tileX(start); sy[0] = tileY(start); smode[0] = sk === StationKind.None ? Mode.Road : enterMode(sk); ssteps[0] = 0; sdirs[0] = 0b1111;
    svis[0] = s0 ? 1 << fpIndex(s0, sx[0]!, sy[0]!) : 0;
    sp = 1;
    let done = false;
    while (!done && ssteps[sp - 1]! < budget) {
      const top = sp - 1;
      let d = prng.int(4);
      let moved = false;
      for (let t = 0; t < T.triesPerNode; t++) {
        d = (d + turn) & 3;
        const bit = dirBit(d as Dir);
        if ((sdirs[top]! & bit) === 0) continue;
        sdirs[top] = sdirs[top]! & ~bit;
        const cx = sx[top]!, cy = sy[top]!;
        const nx = cx + DX[d]!, ny = cy + DY[d]!;
        const cur = tileIndex(cx, cy);
        if (!inMap(nx, ny)) {
          if (L.xtxt[cur] === CONNECTION_MARK) { done = true; break; }      // 去邻城
          continue;
        }
        const next = tileIndex(nx, ny);
        const r = step(smode[top] as Mode, cur, svis[top]!, next, zone);
        if (r === ARRIVE) { done = true; break; }
        if (r === BLOCKED) continue;
        const nm = stepMode(r), cost = stepCost(r);
        const nextDirs = nm === Mode.RoadBridge || nm === Mode.WalkBridge ? bit : nm === Mode.SubwayEnter ? 0b1111 : 0b1111 & ~dirBit(opposite(d as Dir));
        const so = rt.stationOf[next]!;
        let nextVisited = 0;
        if (so !== 0) {
          const s = rt.stations[so - 1]!;
          const b = 1 << fpIndex(s, nx, ny);
          nextVisited = so === rt.stationOf[cur]! ? (svis[top]! | b) : b;
        }
        if (sp >= cap) return FAIL;                                           // 栈满（512）按失败处理
        sx[sp] = nx; sy[sp] = ny; smode[sp] = nm; ssteps[sp] = ssteps[top]! + cost; sdirs[sp] = nextDirs; svis[sp] = nextVisited;
        sp++;
        moved = true;
        break;
      }
      if (done) break;
      if (!moved) {
        do { sp--; if (sp === 0) return FAIL; } while (sdirs[sp - 1] === 0);  // 回溯：恢复该节点当时的步数与剩余掩码
      }
    }
    if (!done) return FAIL;
    let usedBus = false, usedRail = false, usedSubway = false;
    for (let k = 0; k < sp; k++) {
      const m = smode[k] as Mode;
      if (m === Mode.Bus) usedBus = true;
      else if (m === Mode.RailEnter) usedRail = true;
      else if (m === Mode.SubwayEnter) usedSubway = true;
      if (popLevel > 0 && (m === Mode.Road || m === Mode.Highway || m === Mode.RoadBridge)) rt.act.addTraffic(tileIndex(sx[k]!, sy[k]!), popLevel);
    }
    if (popLevel > 0) {
      const p = privOf(rt.state);
      if (usedBus) p.bus += popLevel;
      if (usedRail) p.rail += popLevel;
      if (usedSubway) p.subway += popLevel;
    }
    return { ok: true, usedBus, usedRail, usedSubway, steps: ssteps[sp - 1]! };
  }

  return { step, runTrip };
}

import { describe, expect, it } from 'vitest';
import type { Road } from '@central/data';
import { planRoads } from '../roads';
import { bridgeStyle, footbridgeChunks } from './footbridges';
import { buildLanes } from './lanes';
import { AMBER_END, GREEN_END, PED_BLOCK_START, PED_FLASH, PED_GREEN, PED_RED, crossingClosed, pedCycle, pedSignalState } from './signals';
import { BUS_LEN_M, KIND_LEN_M, SIM_DT, Traffic, VehicleKind, laneThrough, pickKind } from './traffic';
import { LIVERY_HEX, busGeometry, carGeometry, vehicleLook } from './vehicles'; // [r3:liveries]
import { Scheme } from './liveries/fleet'; // [r3:liveries]
import { sideStreetSpan } from '../signs/placement';

describe('行人灯（S3）', () => {
  it('绿色行人 [0.52, 0.84)、闪 [0.84, 0.92)、其余红；只在车辆红灯（≥ 0.5）里亮绿', () => {
    expect(pedSignalState(0.1)).toBe(2);
    expect(pedSignalState(PED_GREEN - 1e-6)).toBe(2);
    expect(pedSignalState(PED_GREEN)).toBe(0);
    expect(pedSignalState(0.7)).toBe(0);
    expect(pedSignalState(PED_FLASH + 1e-9)).toBe(1);
    expect(pedSignalState(PED_RED - 1e-6)).toBe(1);
    expect(pedSignalState(PED_RED + 1e-9)).toBe(2);
    expect(pedSignalState(1.6)).toBe(0);
    expect(PED_GREEN).toBeGreaterThan(AMBER_END);
    expect(GREEN_END).toBeLessThan(PED_GREEN);
  });

  it('车辆不得驶入过路处的时段覆盖整个行人绿灯与闪灯，并提前封闭', () => {
    for (let f = 0; f < 1; f += 0.005) {
      const t = f * 60;
      const closed = crossingClosed(t, 0);
      if (pedSignalState(f) !== 2) expect(closed).toBe(true);
      expect(closed).toBe(f >= PED_BLOCK_START && f < PED_RED);
    }
    expect(pedCycle(90, 0.25)).toBeCloseTo(0.75, 9);
    expect((PED_GREEN - PED_BLOCK_START) * 60).toBeGreaterThan(8);
  });
});

describe('车流扩充（S3 让行、S5 车型、巴士站）', () => {
  const road = (id: string, pts: number[], cls: Road['cls'] = 'primary'): Road => ({ id, cls, pts, oneway: 1, lanes: 1 });

  it('laneThrough：直线车道穿过四边形的进出位置', () => {
    const l = { pts: new Float32Array([0, 0, 0, 100, 0, 0]), cum: new Float32Array([0, 100]) };
    const q = [40, -5, 50, -5, 50, 5, 40, 5];
    const hit = laneThrough(l, q)!;
    expect(hit[0]).toBeCloseTo(40, 5);
    expect(hit[1]).toBeCloseTo(50, 5);
    expect(laneThrough(l, [40, 10, 50, 10, 50, 20, 40, 20])).toBeNull();
    // 顶点顺时针也一样
    const cw = [40, 5, 50, 5, 50, -5, 40, -5];
    expect(laneThrough(l, cw)![0]).toBeCloseTo(40, 5);
  });

  it('车型比例：核心区巴士走廊约 15 % 双层巴士、7 % 小巴、34 % 出租车（约占小车四成）；车长对得上', () => {
    const n = 20000;
    const count = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const k = pickKind((i + 0.5) / n, 'primary', true, true);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    expect(count.get(VehicleKind.Bus)! / n).toBeCloseTo(0.15, 2);
    expect(count.get(VehicleKind.Minibus)! / n).toBeCloseTo(0.07, 2);
    expect(count.get(VehicleKind.Taxi)! / n).toBeCloseTo(0.34, 2);
    expect(pickKind(0.01, 'residential', false, false)).not.toBe(VehicleKind.Bus);
    expect(KIND_LEN_M[VehicleKind.Bus]).toBe(BUS_LEN_M);
    expect(KIND_LEN_M[VehicleKind.Minibus]).toBeCloseTo(7.2);
  });

  // 400 m × 400 m 单行环路
  const ring = [road('s', [0, 0, 4000, 0]), road('e', [4000, 0, 4000, 4000]), road('n', [4000, 4000, 0, 4000]), road('w', [0, 4000, 0, 0])];

  it('巴士到站停 12–22 s 再开；同一站不再停', () => {
    const lanes = buildLanes(planRoads(ring, () => 0));
    const t = new Traffic(lanes, { cap: 400, seed: 3, core: [-1000, -1000, 1000, 1000] });
    t.setBusStops(lanes.map(() => [200]));
    const buses: number[] = [];
    for (let i = 0; i < t.n; i++) if (t.kind[i] === VehicleKind.Bus) buses.push(i);
    expect(buses.length).toBeGreaterThan(0);
    // 每次停靠（dwell 从 0 变正到回 0）的时长
    const episodes: number[] = [];
    const cur = new Map<number, number>();
    for (let k = 0; k < 2400; k++) {
      t.step(SIM_DT);
      for (const i of buses) {
        if (t.dwell[i]! > 0) cur.set(i, (cur.get(i) ?? 0) + SIM_DT);
        else if (cur.has(i)) {
          episodes.push(cur.get(i)!);
          cur.delete(i);
        }
      }
    }
    expect(episodes.length).toBeGreaterThan(0);
    for (const s of episodes) {
      expect(s).toBeGreaterThan(11.5);
      expect(s).toBeLessThan(22.5);
    }
  });

  it('封闭的过路处：车停在入口前，不驶入', () => {
    const lanes = buildLanes(planRoads(ring, () => 0));
    const t = new Traffic(lanes, { cap: 60, seed: 5, core: [-1000, -1000, 1000, 1000] });
    // 一个永远在封闭时段里的过路处（相位让 t ∈ [0, 20] s 的周期相位落在 [0.4, 0.73]）
    const x = 200;
    t.setCrossings([{ corners: [x - 3.6, -10, x + 3.6, -10, x + 3.6, 10, x - 3.6, 10], phase: 0.4 }]);
    let inside = 0;
    for (let k = 0; k < 200; k++) {
      t.step(SIM_DT);
      for (let i = 0; i < t.n; i++) {
        if (t.laneCross[t.lane[i]!]!.length === 0) continue;
        const front = t.s[i]! + t.len[i]! / 2;
        const rear = t.s[i]! - t.len[i]! / 2;
        // 开始时就在里面的车可以开出去；从外面来的车不许进
        if (k > 60 && front > x - 3.6 && rear < x + 3.6) inside++;
      }
    }
    expect(inside).toBe(0);
  });
});

describe('车辆外观（S5，纯函数）', () => {
  // [r3:liveries] R3 真实涂装：营运商比例与颜色的详细测试在 liveries/fleet.test.ts
  it('的士红车身 + 银顶 + 顶灯（MPV 高车身）；小巴米色、约 65 % 绿顶 35 % 红顶；双层巴士城巴 / 九巴、约 35 % 虚构车身广告', () => {
    const taxi = vehicleLook(VehicleKind.Taxi, 1);
    expect(taxi.body).toBe(LIVERY_HEX.taxiRed);
    expect(taxi.fleet.scheme).toBe(Scheme.Taxi);
    expect(taxi.variant).toBe(1);
    expect(taxi.emit).toBe(1);
    let gmb = 0;
    let wraps = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const m = vehicleLook(VehicleKind.Minibus, i);
      expect([Scheme.Gmb, Scheme.Rmb]).toContain(m.fleet.scheme);
      if (m.fleet.scheme === Scheme.Gmb) gmb++;
      const b = vehicleLook(VehicleKind.Bus, i);
      expect([Scheme.Citybus, Scheme.KmbRed, Scheme.KmbGold]).toContain(b.fleet.scheme);
      if (b.wrap > 0) wraps++;
    }
    expect(gmb / n).toBeGreaterThan(0.6);
    expect(gmb / n).toBeLessThan(0.7);
    expect(wraps / n).toBeGreaterThan(0.3);
    expect(wraps / n).toBeLessThan(0.4);
    expect(vehicleLook(VehicleKind.Van, 3).body).toBe('#e4e4e0');
    expect(vehicleLook(VehicleKind.Car, 3).fleet.scheme).toBe(Scheme.Car);
  });

  it('几种车型共用一个网格（变形目标），三角形数不随车型增加', () => {
    const car = carGeometry();
    expect(car.getAttribute('aPos1').count).toBe(car.getAttribute('position').count);
    expect(car.getAttribute('aPos2').count).toBe(car.getAttribute('position').count);
    const bus = busGeometry();
    expect(bus.getAttribute('aPos1').count).toBe(bus.getAttribute('position').count);
    expect(bus.index!.count / 3).toBeLessThanOrEqual(150);
  });
});

describe('直招牌加密（S8）与天桥（S7）', () => {
  it('横街：中环 / 上环的支路、街坊路、行人街才加密；大街与山上不加', () => {
    expect(sideStreetSpan({ x0: 100, groundM: 20 }, 'tertiary')).toBe(true);
    expect(sideStreetSpan({ x0: -300, groundM: 10 }, 'pedestrian')).toBe(true);
    expect(sideStreetSpan({ x0: 100, groundM: 20 }, 'primary')).toBe(false);
    expect(sideStreetSpan({ x0: 100, groundM: 90 }, 'residential')).toBe(false);
    expect(sideStreetSpan({ x0: 600, groundM: 10 }, 'residential')).toBe(false);
    expect(sideStreetSpan({ x0: 100, groundM: 10 }, null)).toBe(false);
  });

  it('跨车行道的天桥段一律封闭玻璃廊；跨路处不立桥墩', () => {
    for (let s = 0; s < 50; s++) expect(bridgeStyle(true, s)).toBe('glazed');
    const styles = new Set(Array.from({ length: 200 }, (_, s) => bridgeStyle(false, s)));
    expect(styles.size).toBe(3);
    const bridge: Road = { id: 'b', cls: 'footway', pts: [0, 0, 600, 0], oneway: 0, lanes: 0, bridge: true };
    const over = footbridgeChunks([bridge], () => 0, () => true);
    const free = footbridgeChunks([bridge], () => 0, () => false);
    const verts = (m: Map<string, { vertexCount: number }>) => [...m.values()].reduce((a, b) => a + b.vertexCount, 0);
    // 跨路：没有桥墩（盒子 4 个侧面 = 16 个顶点）
    expect(verts(free) - verts(over)).toBeGreaterThan(0);
  });
});

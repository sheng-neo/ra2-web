import { describe, expect, it } from 'vitest';
import type { Road } from '@central/data';
import { planRoads } from '../roads';
import { buildLanes } from './lanes';
import { SIM_DT, Traffic, VehicleKind } from './traffic';

const road = (id: string, pts: number[], oneway: Road['oneway'] = 0, lanes = 2, cls: Road['cls'] = 'primary'): Road => ({ id, cls, pts, oneway, lanes });

// 一个 400 m × 400 m 的方块环路（双向）+ 一条横穿的单行路
const roads: Road[] = [
  road('s', [0, 0, 4000, 0]),
  road('e', [4000, 0, 4000, 4000]),
  road('n', [4000, 4000, 0, 4000]),
  road('w', [0, 4000, 0, 0]),
  road('x', [0, 2000, 4000, 2000], 1, 2, 'secondary'),
];
const lanes = buildLanes(planRoads(roads, () => 0));
const opts = { cap: 80, seed: 7, core: [-1000, -1000, 1000, 1000] as const };

describe('Traffic', () => {
  it('车数不超过上限，出租车 15–25 %', () => {
    const big = new Traffic(lanes, { ...opts, cap: 1000 });
    const capped = new Traffic(lanes, { ...opts, cap: 20 });
    expect(capped.n).toBeLessThanOrEqual(20);
    expect(big.n).toBeGreaterThan(capped.n);
    let taxis = 0;
    for (let i = 0; i < big.n; i++) if (big.kind[i] === VehicleKind.Taxi) taxis++;
    expect(taxis / big.n).toBeGreaterThan(0.1);
    expect(taxis / big.n).toBeLessThan(0.3);
  });

  it('确定性：推进到同一时刻，不论分几次推进，状态相同', () => {
    const a = new Traffic(lanes, opts);
    const b = new Traffic(lanes, opts);
    a.advanceTo(30);
    for (let t = 0.37; t < 30; t += 0.37) b.advanceTo(t);
    b.advanceTo(30);
    expect(b.simTime).toBeCloseTo(a.simTime, 6);
    expect([...b.s]).toEqual([...a.s]);
    expect([...b.lane]).toEqual([...a.lane]);
  });

  it('时间回退（uTime 回绕）时从头再来', () => {
    const a = new Traffic(lanes, opts);
    a.advanceTo(20);
    a.advanceTo(1);
    const fresh = new Traffic(lanes, opts);
    fresh.advanceTo(1);
    expect([...a.s]).toEqual([...fresh.s]);
  });

  it('车会动、不倒车，同车道前后车不重叠', () => {
    const t = new Traffic(lanes, opts);
    const s0 = [...t.s];
    t.step(SIM_DT);
    let moved = 0;
    for (let i = 0; i < t.n; i++) if (t.s[i]! !== s0[i]!) moved++;
    expect(moved).toBeGreaterThan(t.n * 0.8);
    t.advanceTo(60);
    for (let i = 0; i < t.n; i++) expect(t.v[i]!).toBeGreaterThanOrEqual(0);
    const by = new Map<number, number[]>();
    for (let i = 0; i < t.n; i++) by.set(t.lane[i]!, [...(by.get(t.lane[i]!) ?? []), i]);
    let overlaps = 0;
    for (const list of by.values()) {
      list.sort((x, y) => t.s[x]! - t.s[y]!);
      for (let k = 1; k < list.length; k++) if (t.s[list[k]!]! - t.s[list[k - 1]!]! < 4.5) overlaps++;
    }
    expect(overlaps).toBe(0);
  });

  it('红灯：所有车道终点常红（相位 0.6）时，没有车越过停车线', () => {
    const t = new Traffic(lanes, opts);
    // 相位 0.6：周期里 0.6–1.0 再到 0.1 都是红（0.5–1.0 红，+0.6 后整个 0–40 s 都在红区）
    t.setSignals(new Float32Array(lanes.length).fill(0.6));
    const passed = new Set<number>();
    const start = [...t.lane];
    for (let k = 0; k < 200; k++) {
      t.step(SIM_DT);
      for (let i = 0; i < t.n; i++) if (t.lane[i] !== start[i]) passed.add(i);
    }
    // 20 s 内（全程红灯）没有车换到下一条车道
    expect(passed.size).toBe(0);
    // 不设信号时 20 s 内会有车开过路口
    const free = new Traffic(lanes, opts);
    const s0 = [...free.lane];
    for (let k = 0; k < 200; k++) free.step(SIM_DT);
    let moved = 0;
    for (let i = 0; i < free.n; i++) if (free.lane[i] !== s0[i]) moved++;
    expect(moved).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { Road } from '@central/data';
import { planRoads } from '../roads';
import { buildLanes, lanePose, laneSlots } from './lanes';

const road = (id: string, pts: number[], oneway: Road['oneway'] = 0, lanes = 2, cls: Road['cls'] = 'secondary'): Road => ({ id, cls, pts, oneway, lanes });

describe('laneSlots（靠左行驶）', () => {
  it('双向路：沿 pts 的车道在左（across > 0），逆向车道在右', () => {
    const s = laneSlots(2, 0, 4);
    expect(s).toEqual([
      { dir: 1, across: 2 },
      { dir: -1, across: -2 },
    ]);
    for (const slot of laneSlots(4, 0, 8)) expect(Math.sign(slot.across)).toBe(slot.dir);
  });

  it('单行路：全部同向、铺满路宽；oneway = −1 逆 pts', () => {
    const s = laneSlots(3, -1, 6);
    expect(s.map((x) => x.dir)).toEqual([-1, -1, -1]);
    expect(s.map((x) => x.across)).toEqual([-4, 0, 4]);
  });
});

describe('buildLanes', () => {
  // 一条向北的双向路（x = 0），北端接一条向东的路
  const roads = [road('n', [0, 0, 0, 2000]), road('e', [0, 2000, 2000, 2000]), road('one', [2000, 2000, 2000, 0], 1)];
  const plans = planRoads(roads, () => 0);
  const lanes = buildLanes(plans);

  it('北行车道在中线西侧（x < 0），南行在东侧（PLAN §7.4）', () => {
    const p = { x: 0, y: 0, z: 0, hx: 0, hz: 0 };
    const north = lanes.find((l) => l.plan === 0 && l.dir === 1)!;
    const south = lanes.find((l) => l.plan === 0 && l.dir === -1)!;
    lanePose(north, north.len / 2, p);
    expect(p.x).toBeLessThan(0);
    // three 的 −Z 是北：北行的朝向 hz < 0
    expect(p.hz).toBeLessThan(-0.99);
    lanePose(south, south.len / 2, p);
    expect(p.x).toBeGreaterThan(0);
    expect(p.hz).toBeGreaterThan(0.99);
  });

  it('单行路只有沿 pts 方向的车道', () => {
    const one = lanes.filter((l) => l.plan === 2);
    expect(one.length).toBe(2);
    expect(one.every((l) => l.dir === 1)).toBe(true);
  });

  it('路口接续：北行车道接到向东的路，不掉头；单行路逆向不能驶入', () => {
    const north = lanes.find((l) => l.plan === 0 && l.dir === 1)!;
    expect(north.next.length).toBeGreaterThan(0);
    for (const id of north.next) expect(lanes[id]!.plan).toBe(1);
    const westOnE = lanes.find((l) => l.plan === 1 && l.dir === -1)!;
    // 东西路西行车道终点在 (0, 200 m)，只能接南行车道
    for (const id of westOnE.next) expect(lanes[id]!.plan).toBe(0);
    // 单行路（沿 pts 南行）起点在 (200 m, 200 m)：东行车道可接上
    const eastOnE = lanes.find((l) => l.plan === 1 && l.dir === 1)!;
    expect(eastOnE.next.every((id) => lanes[id]!.plan === 2)).toBe(true);
    // 没有车道从单行路终点逆行回来
    expect(lanes.some((l) => l.plan === 2 && l.dir === -1)).toBe(false);
  });
});

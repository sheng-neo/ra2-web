import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { addRibbon, drapeResample, newRoadArrays, resample } from './ribbon';

const flat = () => 0;

function faceNormal(pos: number[], a: number, b: number, c: number): Vector3 {
  const pa = new Vector3().fromArray(pos, a * 3);
  return new Vector3().fromArray(pos, b * 3).sub(pa).cross(new Vector3().fromArray(pos, c * 3).sub(pa)).normalize();
}

describe('addRibbon', () => {
  it('直路：2 点 → 4 顶点 2 三角形，路面朝上，左侧横向坐标为正', () => {
    const m = newRoadArrays();
    // 向东 20 m，半宽 5 m
    addRibbon(m, { pts: [0, 0, 200, 0], halfWidth: 50, height: flat, lanes: 2, flags: 0, deck: 0 });
    expect(m.vertexCount).toBe(4);
    expect(m.triangleCount).toBe(2);
    const pos = m.data[0]!;
    for (let t = 0; t < m.index.length; t += 3) {
      expect(faceNormal(pos, m.index[t]!, m.index[t + 1]!, m.index[t + 2]!).y).toBeGreaterThan(0.99);
    }
    // 第 2 个顶点是左侧（北，three 的 −Z）
    const road = m.data[1]!;
    expect(road[1 * 4 + 1]).toBeCloseTo(5);
    expect(pos[1 * 3 + 2]).toBeCloseTo(-5);
    expect(road[1 * 4 + 3]).toBeCloseTo(20);
  });

  it('高架：侧板朝外、底面朝下', () => {
    const m = newRoadArrays();
    addRibbon(m, { pts: [0, 0, 200, 0], halfWidth: 50, height: () => 60, lanes: 2, flags: 0, deck: 12 });
    expect(m.triangleCount).toBe(2 + 6);
    const pos = m.data[0]!;
    const normals = [];
    for (let t = 0; t < m.index.length; t += 3) normals.push(faceNormal(pos, m.index[t]!, m.index[t + 1]!, m.index[t + 2]!));
    const near = (v: Vector3, x: number, y: number, z: number) => v.distanceTo(new Vector3(x, y, z)) < 1e-6;
    // 顶面 2、左侧板（北，−Z）2、右侧板（南，+Z）2、底面 2
    expect(normals.filter((n) => near(n, 0, 1, 0))).toHaveLength(2);
    expect(normals.filter((n) => near(n, 0, 0, -1))).toHaveLength(2);
    expect(normals.filter((n) => near(n, 0, 0, 1))).toHaveLength(2);
    expect(normals.filter((n) => near(n, 0, -1, 0))).toHaveLength(2);
  });

  it('转角处斜接，路宽保持', () => {
    const m = newRoadArrays();
    // 先东后北的直角弯
    addRibbon(m, { pts: [0, 0, 200, 0, 200, 200], halfWidth: 50, height: flat, lanes: 2, flags: 0, deck: 0 });
    const pos = m.data[0]!;
    // 拐点处左右顶点（下标 2、3）到中心 (20, 0, 0) 的距离 = 半宽 × √2
    const corner = new Vector3(20, 0, 0);
    expect(new Vector3().fromArray(pos, 2 * 3).distanceTo(corner)).toBeCloseTo(5 * Math.SQRT2);
    expect(new Vector3().fromArray(pos, 3 * 3).distanceTo(corner)).toBeCloseTo(5 * Math.SQRT2);
  });

  it('resample 插点不改原有点', () => {
    expect(resample([0, 0, 100, 0], 40)).toEqual([0, 0, 100 / 3, 0, 200 / 3, 0, 100, 0]);
    expect(resample([0, 0, 30, 0], 40)).toEqual([0, 0, 30, 0]);
  });

  it('左右边各按自己的位置取地面高度（横坡）', () => {
    const m = newRoadArrays();
    // 向东的路，地面向北每 dm 升 0.1 dm：北（左）边比南（右）边高 2 × 50 × 0.1 = 10 dm
    addRibbon(m, { pts: [0, 0, 200, 0], halfWidth: 50, height: (_x, y) => y / 10, lanes: 2, flags: 0, deck: 0 });
    const pos = m.data[0]!;
    expect(pos[1 * 3 + 1]! - pos[0 * 3 + 1]!).toBeCloseTo(1);
  });

  it('drapeResample：平地不加点，坡折处加密', () => {
    expect(drapeResample([0, 0, 400, 0], () => 0, 160)).toEqual(resample([0, 0, 400, 0], 160));
    // x = 100 dm 处有 V 形谷（10 dm 深）
    const valley = (x: number) => Math.abs(x - 100) / 10;
    const pts = drapeResample([0, 0, 200, 0], valley, 400);
    expect(pts.length).toBeGreaterThan(4);
    for (let i = 2; i < pts.length; i += 2) expect(pts[i]! - pts[i - 2]!).toBeGreaterThanOrEqual(25);
  });
});

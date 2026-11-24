import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { FLAG_SIDE, WALL_TOP_SLOPE, addRibbon, cutWallHeights, drapeResample, newRoadArrays, resample } from './ribbon';

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

  it('人行道：外沿 = 半宽 + 人行道宽，aPav 记两侧宽度，不加三角形', () => {
    const m = newRoadArrays();
    addRibbon(m, { pts: [0, 0, 200, 0], halfWidth: 50, height: flat, lanes: 2, flags: 0, deck: 0, pavL: [30, 30], pavR: [20, 20] });
    expect(m.triangleCount).toBe(2);
    const pos = m.data[0]!;
    const road = m.data[1]!;
    const pav = m.data[5]!;
    // 顶点 0 = 右（南，+Z），1 = 左（北，−Z）
    expect(pos[0 * 3 + 2]).toBeCloseTo(7);
    expect(pos[1 * 3 + 2]).toBeCloseTo(-8);
    expect(road[0 * 4 + 1]).toBeCloseTo(-7);
    expect(road[1 * 4 + 1]).toBeCloseTo(8);
    expect(road[0 * 4 + 2]).toBeCloseTo(5);
    expect([pav[0], pav[1]]).toEqual([3, 2]);
  });

  it('水平模式：横坡上左右边同高（取中线 zc）', () => {
    const m = newRoadArrays();
    addRibbon(m, { pts: [0, 0, 200, 0], halfWidth: 50, height: (_x, y) => y / 10, lanes: 2, flags: 0, deck: 0, level: true, zc: [0, 0] });
    const pos = m.data[0]!;
    expect(pos[1 * 3 + 1]).toBeCloseTo(pos[0 * 3 + 1]!);
    expect(pos[1 * 3 + 1]).toBeCloseTo(0);
  });

  it('水平模式在挖方 / 填方 > 1.5 m 处加竖直墙面（FLAG_SIDE）', () => {
    const m = newRoadArrays();
    // 地面向北每 dm 升 0.4 dm：半宽 5 m 处高差 2 m
    const g = (_x: number, y: number) => y * 0.4;
    addRibbon(m, { pts: [0, 0, 200, 0], halfWidth: 50, height: g, lanes: 2, flags: 0, deck: 0, level: true, zc: [0, 0], ground: g });
    expect(m.triangleCount).toBe(2 + 4);
    const flags = m.data[2]!;
    const side = [];
    for (let v = 0; v < m.vertexCount; v++) if ((flags[v * 2 + 1]! & FLAG_SIDE) !== 0) side.push(v);
    expect(side).toHaveLength(8);
    // 挖方（北、左）一侧的墙朝路（法线朝南 +Z），填方（南）一侧朝外（也朝南 +Z）
    const pos = m.data[0]!;
    for (let t = 2 * 3; t < m.index.length; t += 3) {
      expect(faceNormal(pos, m.index[t]!, m.index[t + 1]!, m.index[t + 2]!).z).toBeGreaterThan(0.99);
    }
  });

  it('挖方墙顶：单点凸起不成尖顶——前后取最大成平台、沿路坡度 ≤ 0.3、封顶 6 m、短于 8 m 的段不画', () => {
    const along = Array.from({ length: 12 }, (_, i) => i * 50); // 每 5 m 一点（dm）
    const road = along.map(() => 1000);
    // 单点高 4 m 的凸起（原来会画成三角形尖顶）
    const bump = road.map((r, i) => (i === 6 ? r + 40 : r - 10));
    const hb = cutWallHeights(road, bump, along);
    expect(hb.filter((v) => v > 0).length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < hb.length; i++) {
      if (hb[i]! > 0 && hb[i - 1]! > 0) expect(Math.abs(hb[i]! - hb[i - 1]!)).toBeLessThanOrEqual(WALL_TOP_SLOPE * 50 + 1e-6);
    }
    // 局部尖峰 20 m：封顶 6 m
    const spike = road.map((r, i) => (i === 6 ? r + 200 : i === 5 || i === 7 ? r + 60 : r));
    expect(Math.max(...cutWallHeights(road, spike, along))).toBeLessThanOrEqual(60);
    // 只有 2 点（5 m）超过门槛：整段不画
    const short = Array.from({ length: 12 }, (_, i) => i * 10);
    const tiny = cutWallHeights(
      short.map(() => 0),
      short.map((_, i) => (i === 3 ? 30 : 0)),
      short,
    );
    expect(tiny.every((v) => v === 0)).toBe(true);
  });

  it('真实坡道上：任何一段挡土墙墙顶的沿路坡度都 ≤ 0.3', () => {
    const m = newRoadArrays();
    // 地面沿路起伏（±4 m、波长 30 m），横向向北升坡
    const g = (x: number, y: number) => 40 * Math.sin(x / 50) + y * 0.4;
    const pts: number[] = [];
    for (let x = 0; x <= 2000; x += 40) pts.push(x, 0);
    addRibbon(m, { pts, halfWidth: 50, height: g, lanes: 2, flags: 0, deck: 0, level: true, zc: pts.filter((_, i) => i % 2 === 0).map(() => 0), ground: g });
    const pos = m.data[0]!;
    const flags = m.data[2]!;
    let walls = 0;
    for (let t = 0; t < m.index.length; t += 6) {
      const vs = [m.index[t]!, m.index[t + 1]!, m.index[t + 2]!, m.index[t + 3]!, m.index[t + 4]!, m.index[t + 5]!];
      if (!vs.every((v) => (flags[v * 2 + 1]! & FLAG_SIDE) !== 0)) continue;
      // 一个墙面四边形：按 x 分成两根竖边，各取最高点
      const xs = [...new Set(vs.map((v) => Math.round(pos[v * 3]! * 100)))];
      if (xs.length !== 2) continue;
      const top = (x: number) => Math.max(...vs.filter((v) => Math.round(pos[v * 3]! * 100) === x).map((v) => pos[v * 3 + 1]!));
      const dx = Math.abs(xs[0]! - xs[1]!) / 100;
      expect(Math.abs(top(xs[0]!) - top(xs[1]!)) / dx).toBeLessThanOrEqual(WALL_TOP_SLOPE + 0.02);
      walls++;
    }
    expect(walls).toBeGreaterThan(10);
  });
});

import { describe, expect, it } from 'vitest';
import type { Ring } from '@central/data';
import {
  ISLAND_SHORE,
  KOWLOON_SHORE,
  SDF_RANGE_M,
  buildWaterField,
  encodeSdf,
  isWaterAt,
  islandShoreY,
  kowloonShoreY,
  rasterizeWater,
  signedDistance,
} from './mask';

/** dm 坐标的矩形环（逆时针）。 */
const rect = (x0: number, y0: number, x1: number, y1: number): number[] => [x0, y0, x1, y0, x1, y1, x0, y1];

describe('水面遮罩', () => {
  it('奇偶规则栅格化：外环内为水、洞内为陆', () => {
    const ring: Ring = { outer: rect(0, 0, 1000, 1000), holes: [rect(400, 400, 600, 600).reverse()] };
    const m = rasterizeWater([ring], 0, 0, 10, 10, 12, 12);
    const at = (x: number, y: number) => m.data[Math.floor(y / 10) * m.w + Math.floor(x / 10)];
    expect(at(5, 5)).toBe(1);
    expect(at(95, 95)).toBe(1);
    expect(at(50, 50)).toBe(0); // 洞
    expect(at(105, 50)).toBe(0); // 外环以外
  });

  it('岸线锚点 x 单调递增，插值与外延', () => {
    for (const list of [KOWLOON_SHORE, ISLAND_SHORE]) {
      for (let i = 1; i < list.length; i++) expect(list[i]![0]).toBeGreaterThan(list[i - 1]![0]);
    }
    expect(kowloonShoreY(-500)).toBeCloseTo(1896, 5);
    expect(kowloonShoreY(-99999)).toBe(KOWLOON_SHORE[0]![1]);
    expect(kowloonShoreY(1323)).toBeCloseTo(1065, 5); // 尖沙咀码头尖端
    expect(islandShoreY(1663)).toBeCloseTo(-12, 5);
    // 维港在任何 x 上都有水：港岛两翼岸线在九龙岸线以南
    for (let x = -6000; x <= 9000; x += 250) expect(islandShoreY(x)).toBeLessThan(kowloonShoreY(x));
  });

  it('isWaterAt：数据范围内看细遮罩，两翼看港岛岸线，九龙以北一律是陆', () => {
    // 数据范围 x 0…100 m、y 0…100 m；y > 50 m 为水
    const bbox: [number, number, number, number] = [0, 0, 1000, 1000];
    const f = buildWaterField([{ outer: rect(0, 500, 1000, 1000) }], bbox, 4, 50);
    expect(isWaterAt(f.fine, 50, 80)).toBe(true);
    expect(isWaterAt(f.fine, 50, 20)).toBe(false);
    expect(isWaterAt(f.fine, 50, 600)).toBe(true); // 北面超出 bbox：按边缘延伸
    expect(isWaterAt(f.fine, 50, kowloonShoreY(50) + 5)).toBe(false); // 对岸
    expect(isWaterAt(f.fine, 3000, islandShoreY(3000) + 50)).toBe(true); // 东翼海面
    expect(isWaterAt(f.fine, 3000, islandShoreY(3000) - 50)).toBe(false); // 东翼陆地
    // 粗网格与逐点判断一致
    const c = f.coarse;
    const i = Math.floor((3000 - c.x0) / c.cell);
    const j = Math.floor((islandShoreY(3000) + 100 - c.y0) / c.cell);
    expect(c.water[j * c.w + i]).toBe(1);
  });

  it('带符号距离场：水为正、陆为负，量级正确', () => {
    const w = 40;
    const h = 10;
    const water = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 20; i < w; i++) water[j * w + i] = 1; // 右半边是水
    const d = signedDistance(water, w, h, 10);
    expect(d[5 * w + 30]).toBeGreaterThan(80); // 离岸 10 格
    expect(d[5 * w + 30]).toBeLessThan(110);
    expect(d[5 * w + 5]).toBeLessThan(-120);
    expect(Math.abs(d[5 * w + 20]!)).toBeLessThanOrEqual(5);
    const e = encodeSdf(new Float32Array([-SDF_RANGE_M * 2, 0, SDF_RANGE_M]));
    expect([...e]).toEqual([0, 128, 255]);
  });
});

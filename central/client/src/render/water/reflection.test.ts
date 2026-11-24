import { describe, expect, it } from 'vitest';
import type { CityFile } from '@central/data';
import { cityEmitters } from './index';
import { reflectionSize } from './reflection';

describe('平面反射目标尺寸', () => {
  it('每轴一半、向上取整、至少 1', () => {
    expect(reflectionSize(1280, 720)).toEqual([640, 360]);
    expect(reflectionSize(1749, 805)).toEqual([875, 403]);
    expect(reflectionSize(1, 1)).toEqual([1, 1]);
    expect(reflectionSize(0, 0)).toEqual([1, 1]);
  });
});

describe('LOW 档倒影发光条的城市光源', () => {
  const box = (id: string, x: number, h: number) => ({
    id,
    kind: 'tower' as const,
    footprint: { outer: [x, 0, x + 300, 0, x + 300, 300, x, 300] },
    base: 50,
    height: h,
    style: 0,
  });
  const city = {
    buildings: [box('a', 0, 400), box('b', 1000, 1200)],
    landmarks: [{ id: 'l', name: { zh: '測', en: 'T' }, x: 5000, y: 0, rot: 0, base: 50, height: 3000, footprint: { outer: [] }, replaces: [] }],
  } as unknown as CityFile;

  it('每栋楼一条铺面暖光带，30 m 以上的楼另有楼面；地标有冠顶与楼面；亮度有限、底低于顶', () => {
    const em = cityEmitters(city);
    // a：40 m（铺面 + 楼面）；b：120 m（铺面 + 楼面）；地标 2 条
    expect(em).toHaveLength(6);
    for (const e of em) {
      expect(e.z1).toBeGreaterThan(e.z0);
      expect(e.halfWidth).toBeGreaterThan(0);
      expect(Math.max(e.r, e.g, e.b)).toBeLessThan(5);
    }
  });
});

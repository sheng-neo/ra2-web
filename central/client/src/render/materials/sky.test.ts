import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { NIGHT_SKY } from './lighting';
import { nightSkyRgb } from './sky';

const Y = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const deg = (d: number) => Math.sin((d * Math.PI) / 180);
/** 线性 → sRGB（0–1）。 */
const srgb = (c: [number, number, number]) => {
  const col = new Color(c[0], c[1], c[2]);
  col.convertLinearToSRGB();
  return [col.r, col.g, col.b];
};

describe('夜空调色板（realism spec 天空数值目标）', () => {
  it('地平线正好是雾色，地平线以下也是', () => {
    const h = new Color(NIGHT_SKY.horizon);
    expect(nightSkyRgb(0)).toEqual([h.r, h.g, h.b]);
    expect(nightSkyRgb(-0.3)).toEqual([h.r, h.g, h.b]);
    const near = nightSkyRgb(deg(0.01));
    expect(Y(near)).toBeCloseTo(Y([h.r, h.g, h.b]), 2);
  });

  it('天顶附近（约 27–30°）Y 在 0.006–0.016、中性（(max−min)/max ≤ 0.30）', () => {
    for (const e of [27, 30, 60, 90]) {
      const c = nightSkyRgb(deg(e));
      expect(Y(c)).toBeGreaterThanOrEqual(0.006);
      expect(Y(c)).toBeLessThanOrEqual(0.016);
      const s = srgb(c);
      expect((Math.max(...s) - Math.min(...s)) / Math.max(...s)).toBeLessThanOrEqual(0.3);
    }
  });

  it('天际线上方（3–8°）是淡紫灰光晕：Y 0.025–0.07，b ≥ r，b − g ≤ 0.08', () => {
    for (const e of [3, 5, 8]) {
      const c = nightSkyRgb(deg(e));
      expect(Y(c)).toBeGreaterThanOrEqual(0.025);
      expect(Y(c)).toBeLessThanOrEqual(0.07);
      const [r, g, b] = srgb(c);
      expect(b).toBeGreaterThanOrEqual(r!);
      expect(b! - g!).toBeLessThanOrEqual(0.08);
    }
  });

  it('光害穹：天际线上方 3–6° 比只靠雾积分亮约一半，30° 以上几乎不变', () => {
    const base = (e: number) => {
      const z = new Color(NIGHT_SKY.zenith);
      const h = new Color(NIGHT_SKY.horizon);
      const a = (1 / 4000) * 600 * (2 / 3);
      const t = 1 - Math.exp(-a / deg(e));
      return Y([z.r + (h.r - z.r) * t, z.g + (h.g - z.g) * t, z.b + (h.b - z.b) * t]);
    };
    expect(Y(nightSkyRgb(deg(4))) / base(4)).toBeGreaterThan(1.3);
    expect(Y(nightSkyRgb(deg(45))) / base(45)).toBeLessThan(1.05);
  });

  it('仰角越高越暗；相机越高天越暗（雾在下面）', () => {
    let prev = Infinity;
    for (const e of [1, 3, 6, 10, 20, 40, 90]) {
      const y = Y(nightSkyRgb(deg(e)));
      expect(y).toBeLessThan(prev);
      prev = y;
    }
    expect(Y(nightSkyRgb(deg(10), 430))).toBeLessThan(Y(nightSkyRgb(deg(10), 0)));
  });
});

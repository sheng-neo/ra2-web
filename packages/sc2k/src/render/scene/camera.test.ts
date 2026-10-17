// WP10：camera —— 中心 ↔ 相机偏移往返、拖动平移、可见带区间。
import { describe, expect, it } from 'vitest';
import type { Rotation } from '../../contracts/rotation';
import { MAX_ALT } from '../../contracts/grid';
import { bandOf } from '../../contracts/render';
import { bandScreenRange, cameraFor, centerHeight, centerOfCamera, clampCenter, panCenter, visibleBands } from './camera';
import { pointToScreen, projectionFor } from './projection';
import { flatState } from './testFixtures';

const ROTS: readonly Rotation[] = [0, 1, 2, 3];

describe('camera', () => {
  it('cameraFor / centerOfCamera 往返误差 < 1 px 对应的世界距离；整数偏移', () => {
    for (const rotation of ROTS) for (const zoom of [1, 2, 3] as const) {
      const p = projectionFor(zoom, rotation);
      for (const [cx, cy, h] of [[64.5, 64.5, 4], [0.25, 127.75, 0], [100.1, 3.9, 20]] as const) {
        const cam = cameraFor(p, cx, cy, h, 1280, 720);
        expect(Number.isInteger(cam.camX) && Number.isInteger(cam.camY)).toBe(true);
        const [bx, by] = centerOfCamera(p, cam, h, 1280, 720);
        expect(Math.abs(bx - cx)).toBeLessThan(2 / p.tileW + 1e-9);
        expect(Math.abs(by - cy)).toBeLessThan(2 / p.tileW + 1e-9);
        // 该点确实落在视口中心附近
        const [sx, sy] = pointToScreen(p, cx, cy, h);
        expect(Math.abs(sx + cam.camX - 640)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(sy + cam.camY - 360)).toBeLessThanOrEqual(0.5);
      }
    }
  });
  it('旋转改变时同一世界点保持在视口中心（连续坐标语义）', () => {
    for (const rotation of ROTS) {
      const p = projectionFor(2, rotation);
      const cam = cameraFor(p, 40.5, 90.5, 4, 800, 600);
      const [sx, sy] = pointToScreen(p, 40.5, 90.5, 4);
      expect([sx + cam.camX, sy + cam.camY]).toEqual([400, 300]);
    }
  });
  it('panCenter：内容随手指移动——向右拖 tileW px 等于中心沿屏幕左移一格（rot0：x−1,y+1）；夹到地图内', () => {
    const p = projectionFor(2, 0);
    const [nx, ny] = panCenter(p, 64, 64, p.tileW, 0, 0);
    expect(nx).toBeCloseTo(63, 9); expect(ny).toBeCloseTo(65, 9);
    const [dx, dy] = panCenter(p, 64, 64, 0, p.tileH, 0);
    expect(dx).toBeCloseTo(63, 9); expect(dy).toBeCloseTo(63, 9);
    expect(panCenter(p, 0, 0, 10000, 0, 0)).toEqual([0, clampCenter(1e9)]);
    expect(clampCenter(-5)).toBe(0); expect(clampCenter(200)).toBe(128);
  });
  it('centerHeight 读中心所在格海拔并夹到地图内', () => {
    const s = flatState();
    s.layers.alt[0] = 9; s.layers.alt[127 * 128 + 127] = 17;
    expect(centerHeight(s.layers, -3, -3)).toBe(9);
    expect(centerHeight(s.layers, 500, 500)).toBe(17);
    expect(centerHeight(s.layers, 10.5, 10.5)).toBe(4);
  });
  it('visibleBands：中心所在带可见、带区间连续、带 y 范围随 b 单调；视口在地图外 → null', () => {
    for (const rotation of ROTS) {
      const p = projectionFor(2, rotation);
      const cam = cameraFor(p, 64.5, 64.5, 4, 1280, 720);
      const r = visibleBands(p, cam, 720, 64);
      expect(r).not.toBeNull();
      const [b0, b1] = r!;
      const centerBand = bandOf(127);
      expect(b0).toBeLessThanOrEqual(centerBand); expect(b1).toBeGreaterThanOrEqual(centerBand);
      for (let b = 1; b < 16; b++) {
        expect(bandScreenRange(p, b, cam)[0]).toBeGreaterThan(bandScreenRange(p, b - 1, cam)[0]);
        expect(bandScreenRange(p, b, cam)[1]).toBeGreaterThan(bandScreenRange(p, b - 1, cam)[1]);
      }
      const [top0] = bandScreenRange(p, 0, { camX: 0, camY: 0 });
      expect(top0).toBe(p.oy - MAX_ALT * p.level);
      expect(visibleBands(p, { camX: 0, camY: -1e6 }, 720)).toBeNull();
    }
  });
});

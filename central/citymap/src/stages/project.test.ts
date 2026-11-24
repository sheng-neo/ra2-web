import { describe, expect, it } from 'vitest';
import { EXTENT } from '../config';
import { gridToLocal, project, projectRectBounds, toGrid, unproject } from './project';

describe('project（EPSG:2326 → 本地 dm）', () => {
  it('pyproj 基准点误差 < 0.5 m', () => {
    // pyproj：(114.1594, 22.2810) → (834467.1, 815791.9)
    const [e, n] = toGrid(114.1594, 22.281);
    expect(Math.abs(e - 834467.1)).toBeLessThan(0.5);
    expect(Math.abs(n - 815791.9)).toBeLessThan(0.5);
  });

  it('减原点后取整数分米', () => {
    expect(gridToLocal(834467.14, 815791.89)).toEqual([4671, -2081]);
    const [x, y] = project(114.1594, 22.281);
    expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    expect([x, y]).toEqual([4671, -2081]);
  });

  it('x 向东、y 向北', () => {
    const [x0, y0] = project(114.155, 22.28);
    const [x1, y1] = project(114.156, 22.281);
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeGreaterThan(y0);
  });

  it('反投影往返误差 < 0.1 m', () => {
    const [lon, lat] = unproject(4671, -2081);
    const [e, n] = toGrid(lon, lat);
    expect(Math.hypot(e - 834467.1, n - 815791.9)).toBeLessThan(0.1);
  });

  it('范围外包矩形包住四个角点', () => {
    const r = projectRectBounds(EXTENT);
    for (const [lon, lat] of [[EXTENT.west, EXTENT.south], [EXTENT.east, EXTENT.north]] as const) {
      const [x, y] = project(lon, lat);
      expect(x).toBeGreaterThanOrEqual(r[0]);
      expect(y).toBeGreaterThanOrEqual(r[1]);
      expect(x).toBeLessThanOrEqual(r[2]);
      expect(y).toBeLessThanOrEqual(r[3]);
    }
  });
});

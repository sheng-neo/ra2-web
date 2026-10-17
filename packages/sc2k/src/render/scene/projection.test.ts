// WP10 验收：projection —— mapOrigin 约定（(0,0)@31 顶点 y==0、(0,127) 左顶点 x==0，四旋转 × 五档）、c11' = c00' + tileH、连续坐标往返、四边形。
import { describe, expect, it } from 'vitest';
import { MAX_ALT, TILES, tileX, tileY } from '../../contracts/grid';
import type { Rotation } from '../../contracts/rotation';
import { rotateTile, unrotateTile } from '../../contracts/rotation';
import type { ZoomLevel } from '../../contracts/render';
import { ZOOM_TABLE, mapCanvasSize, mapOrigin } from '../../contracts/render';
import { pointInQuad, pointToScreen, projectionFor, screenToPoint, screenToRotated, screenToTile, tileQuad, worldToScreen, zoomOfScale } from './projection';
import { flatState, snapshotOf } from './testFixtures';

const ZOOMS: readonly ZoomLevel[] = [0, 1, 2, 3, 4];
const ROTS: readonly Rotation[] = [0, 1, 2, 3];

describe('projection: mapOrigin 约定', () => {
  it('旋转后 (0,0)@31 的顶点 y == 0；旋转后 (0,127) 的左顶点 x == 0（四旋转 × 五档）', () => {
    const s = flatState();
    for (const zoom of ZOOMS) for (const rotation of ROTS) {
      const snap = snapshotOf(s, { zoom, rotation });
      const [x0, y0] = unrotateTile(0, 0, rotation);
      expect(worldToScreen(snap, x0, y0, MAX_ALT)[1]).toBe(0);
      const [xl, yl] = unrotateTile(0, 127, rotation);
      const S = ZOOM_TABLE[zoom].tileW / 2;
      for (const h of [0, 7, 31]) expect(worldToScreen(snap, xl, yl, h)[0] - S).toBe(0);
      // 右顶点 (127,0) 触右边、底顶点 (127,127)@0 触下边
      const size = mapCanvasSize(zoom);
      const [xr, yr] = unrotateTile(127, 0, rotation);
      expect(worldToScreen(snap, xr, yr, 0)[0] + S).toBe(size.w);
      const [xb, yb] = unrotateTile(127, 127, rotation);
      expect(worldToScreen(snap, xb, yb, 0)[1] + ZOOM_TABLE[zoom].tileH).toBe(size.h);
    }
  });
  it('全图最小 y（@31）为 0、最小左顶点 x 为 0，没有任何顶点落在画布外', () => {
    const s = flatState();
    for (const zoom of [1, 2, 3] as const) for (const rotation of ROTS) {
      const snap = snapshotOf(s, { zoom, rotation });
      const { tileW, tileH } = ZOOM_TABLE[zoom];
      const size = mapCanvasSize(zoom);
      let minY = Infinity, minX = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < TILES; i++) {
        const [sx, sy] = worldToScreen(snap, tileX(i), tileY(i), MAX_ALT);
        const [, sy0] = worldToScreen(snap, tileX(i), tileY(i), 0);
        minY = Math.min(minY, sy); minX = Math.min(minX, sx - tileW / 2); maxX = Math.max(maxX, sx + tileW / 2); maxY = Math.max(maxY, sy0 + tileH);
      }
      expect(minY).toBe(0); expect(minX).toBe(0);
      expect(maxX).toBeLessThanOrEqual(size.w); expect(maxY).toBeLessThanOrEqual(size.h);
    }
  });
  it('worldToScreen 与契约公式逐项一致，海拔每级上移 levelPx', () => {
    const s = flatState();
    for (const zoom of ZOOMS) for (const rotation of ROTS) {
      const snap = snapshotOf(s, { zoom, rotation });
      const { tileW, levelPx } = ZOOM_TABLE[zoom];
      const S = tileW / 2, o = mapOrigin(zoom);
      for (const [x, y, h] of [[0, 0, 0], [127, 127, 31], [10, 100, 5], [64, 64, 12]] as const) {
        const [rx, ry] = rotateTile(x, y, rotation);
        expect(worldToScreen(snap, x, y, h)).toEqual([o.x + (rx - ry) * S, o.y + ((rx + ry) * S) / 2 - h * levelPx]);
        expect(worldToScreen(snap, x, y, h + 1)[1]).toBe(worldToScreen(snap, x, y, h)[1] - levelPx);
      }
    }
  });
});

describe('projection: 连续坐标与逆投影', () => {
  it('pointToScreen 在整数点上等于 worldToScreen（旋转 0），且 screenToPoint 为其逆（四旋转）', () => {
    const s = flatState();
    for (const zoom of [1, 2, 3] as const) for (const rotation of ROTS) {
      const p = projectionFor(zoom, rotation);
      const snap = snapshotOf(s, { zoom, rotation });
      if (rotation === 0) for (const [x, y] of [[0, 0], [5, 9], [127, 127]] as const) expect(pointToScreen(p, x, y, 3)).toEqual(worldToScreen(snap, x, y, 3));
      for (const [X, Y, h] of [[0.5, 0.5, 0], [64.25, 10.75, 9], [127.9, 0.1, 31]] as const) {
        const [sx, sy] = pointToScreen(p, X, Y, h);
        const [bx, by] = screenToPoint(p, sx, sy, h);
        expect(bx).toBeCloseTo(X, 9); expect(by).toBeCloseTo(Y, 9);
      }
      // 地块中心 (x+0.5, y+0.5) 的连续投影 = 顶点 + [0, tileH/2]
      for (const [x, y] of [[3, 4], [100, 20]] as const) {
        const [sx, sy] = worldToScreen(snap, x, y, 2);
        const [cx, cy] = pointToScreen(p, x + 0.5, y + 0.5, 2);
        expect(cx).toBeCloseTo(sx, 9); expect(cy).toBeCloseTo(sy + ZOOM_TABLE[zoom].tileH / 2, 9);
      }
    }
  });
  it('screenToRotated / screenToTile：地块中心逆投影回同一格', () => {
    const s = flatState();
    for (const rotation of ROTS) {
      const p = projectionFor(2, rotation);
      const snap = snapshotOf(s, { zoom: 2, rotation });
      for (const [x, y] of [[0, 0], [127, 0], [0, 127], [127, 127], [33, 77]] as const) {
        const [sx, sy] = worldToScreen(snap, x, y, 4);
        const [rx, ry] = rotateTile(x, y, rotation);
        const [frx, fry] = screenToRotated(p, sx, sy + 8, 4);
        expect(Math.floor(frx)).toBe(rx); expect(Math.floor(fry)).toBe(ry);
        expect(screenToTile(p, sx, sy + 8, 4)).toEqual([x, y]);
      }
      expect(screenToTile(p, -1e6, -1e6, 0)).toBeNull();
    }
  });
  it('tileQuad：平地四点为菱形顶点；抬高角上移 levelPx；中心在四边形内、远点在外', () => {
    const p = projectionFor(3, 0);
    const q = tileQuad(p, 10, 20, 5, 0b1100);   // c00' 与 c10' 抬高
    const [sx, sy] = [p.ox + (10 - 20) * p.S, p.oy + ((10 + 20) * p.S) / 2 - 5 * p.level];
    expect([q.x0, q.y0]).toEqual([sx, sy - p.level]);
    expect([q.x1, q.y1]).toEqual([sx + p.S, sy + p.S / 2 - p.level]);
    expect([q.x2, q.y2]).toEqual([sx, sy + p.tileH]);
    expect([q.x3, q.y3]).toEqual([sx - p.S, sy + p.S / 2]);
    expect(pointInQuad(q, sx, sy + p.tileH / 2)).toBe(true);
    expect(pointInQuad(q, sx + 10 * p.S, sy)).toBe(false);
    const flat = tileQuad(p, 10, 20, 5, 0);
    expect(pointInQuad(flat, sx, sy + 1)).toBe(true);
    expect(pointInQuad(flat, sx + p.S - 1, sy + 1)).toBe(false);
  });
  it('zoomOfScale 与 ZOOM_TABLE 一致', () => {
    expect(ZOOM_TABLE.map((r) => zoomOfScale(r.scale))).toEqual([0, 1, 2, 3, 4]);
  });
});

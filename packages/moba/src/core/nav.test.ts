import { describe, expect, it } from 'vitest';
import { createMap, distToPolygonEdge, isWalkableTerrain, pointInPolygon } from './map';
import { NavGrid, pathLength } from './nav';
import { Rng } from './rng';
import type { LaneId, MapData, Vec2 } from './types';
import { createWorld } from './world';

const map = createMap();
const LANES: LaneId[] = ['top', 'mid', 'bot'];

/** 沿折线每 0.2m 采样，检查每个点离所有墙体至少 minClear */
function assertPathClear(m: MapData, from: Vec2, path: Vec2[], minClear: number): void {
  let prev = from;
  for (const wp of path) {
    const d = Math.hypot(wp.x - prev.x, wp.y - prev.y);
    const steps = Math.max(1, Math.ceil(d / 0.2));
    for (let i = 0; i <= steps; i++) {
      const p = { x: prev.x + ((wp.x - prev.x) * i) / steps, y: prev.y + ((wp.y - prev.y) * i) / steps };
      expect(isWalkableTerrain(m, p), `point (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) is inside terrain`).toBe(true);
      for (const w of m.walls) {
        expect(pointInPolygon(p, w)).toBe(false);
        expect(distToPolygonEdge(p, w)).toBeGreaterThan(minClear);
      }
    }
    prev = wp;
  }
}

describe('nav: 寻路', () => {
  const nav = new NavGrid(map);

  it('三条兵线都能从蓝方基地走到红方基地，且不穿墙', () => {
    for (const lane of LANES) {
      const a = map.bases[0].minionSpawn[lane];
      const b = map.bases[1].minionSpawn[lane];
      const path = nav.findPath(a.x, a.y, b.x, b.y, 0.6);
      expect(path, `lane ${lane}`).not.toBeNull();
      if (!path) continue;
      const end = path[path.length - 1];
      expect(Math.hypot(end.x - b.x, end.y - b.y)).toBeLessThan(0.01);
      assertPathClear(map, a, path, 0.6 - 0.2);
    }
  });

  it('泉水到泉水(穿过整张图)有路，长度合理', () => {
    const a = map.bases[0].fountain;
    const b = map.bases[1].fountain;
    const path = nav.findPath(a.x, a.y, b.x, b.y, 0.75);
    expect(path).not.toBeNull();
    if (!path) return;
    const len = pathLength(a, path);
    const straight = Math.hypot(a.x - b.x, a.y - b.y);
    expect(len).toBeGreaterThanOrEqual(straight - 1e-6);
    expect(len).toBeLessThan(straight * 1.25);
    assertPathClear(map, a, path, 0.75 - 0.2);
  });

  it('最大体型的英雄(半径 0.75)能进出每一个野怪营地', () => {
    const start = map.bases[0].fountain;
    for (const camp of map.camps) {
      // 站到营地边上（野怪本体不是导航障碍）
      const path = nav.findPath(start.x, start.y, camp.pos.x, camp.pos.y, 0.75);
      expect(path, `camp ${camp.id}`).not.toBeNull();
      if (!path) continue;
      const end = path[path.length - 1];
      expect(Math.hypot(end.x - camp.pos.x, end.y - camp.pos.y), `camp ${camp.id} reachable`).toBeLessThan(0.5);
      assertPathClear(map, start, path, 0.75 - 0.2);
    }
  });

  it('野区的狭窄通道可以通过，且不会绕远路', () => {
    // 上路内侧两段山体之间的野区入口(宽约 6m，里面有草丛)：从上路走进蓝方上半野区
    const a = { x: -52, y: 16 };
    const b = { x: -38, y: 16 };
    const path = nav.findPath(a.x, a.y, b.x, b.y, 0.75);
    expect(path).not.toBeNull();
    if (!path) return;
    expect(pathLength(a, path)).toBeLessThan(Math.hypot(a.x - b.x, a.y - b.y) * 1.2);
    assertPathClear(map, a, path, 0.5);
  });

  it('终点在墙里时走到最近的可走点', () => {
    const a = { x: -52, y: 0 };
    const inWall = { x: -44, y: 0 }; // 上路内侧长墙中间
    expect(isWalkableTerrain(map, inWall)).toBe(false);
    const path = nav.findPath(a.x, a.y, inWall.x, inWall.y, 0.6);
    expect(path).not.toBeNull();
    if (!path) return;
    const end = path[path.length - 1];
    expect(nav.isFree(end.x, end.y, 0.6)).toBe(true);
    expect(Math.hypot(end.x - inWall.x, end.y - inWall.y)).toBeLessThan(4.5);
  });

  it('视线检测：隔墙看不到，兵线上看得到', () => {
    expect(nav.lineOfSight(-52, 0, -38, 0)).toBe(false);
    expect(nav.lineOfSight(-52, 30, -52, -30)).toBe(true);
    expect(nav.segmentFree(-52, 30, -52, -30, 0.6)).toBe(true);
    expect(nav.segmentFree(-52, 0, -38, 0, 0.6)).toBe(false);
  });
});

describe('nav: 碰撞移动', () => {
  const nav = new NavGrid(map);

  it('随机乱走永远不会进墙或出界', () => {
    const rng = new Rng(7);
    const r = 0.6;
    for (let trial = 0; trial < 40; trial++) {
      const pos = { x: 0, y: 0 };
      // 随机找一个合法起点
      do {
        pos.x = rng.range(-57, 57);
        pos.y = rng.range(-57, 57);
      } while (!nav.isFree(pos.x, pos.y, r));
      let ang = rng.range(0, Math.PI * 2);
      for (let i = 0; i < 400; i++) {
        if (rng.chance(0.05)) ang = rng.range(0, Math.PI * 2);
        const step = rng.range(0.05, 1.2); // 包含远超单步上限的高速位移
        nav.moveWithCollision(pos, Math.cos(ang) * step, Math.sin(ang) * step, r);
        expect(Number.isFinite(pos.x) && Number.isFinite(pos.y)).toBe(true);
        expect(nav.clearanceAt(pos.x, pos.y)).toBeGreaterThanOrEqual(r - 1e-4);
        expect(isWalkableTerrain(map, pos)).toBe(true);
      }
    }
  });

  it('斜着顶墙会沿墙面滑动', () => {
    // 上路内侧长墙的西侧面大致在 x ≈ -46.5：从兵线上向东北方向顶过去
    const pos = { x: -48.5, y: 0 };
    const r = 0.6;
    for (let i = 0; i < 60; i++) nav.moveWithCollision(pos, 0.15, -0.15, r);
    // 被墙挡住了东向位移，但沿墙向北滑出了很远
    expect(pos.x).toBeLessThan(-46.5);
    expect(pos.y).toBeLessThan(-5);
    for (const w of map.walls) expect(pointInPolygon(pos, w)).toBe(false);
  });

  it('moveStraight 撞墙即停，不滑动', () => {
    const pos = { x: -50, y: 0 };
    const moved = nav.moveStraight(pos, 1, 0, 10, 0.6);
    expect(moved).toBeLessThan(4);
    expect(moved).toBeGreaterThan(2);
    expect(pos.y).toBe(0);
    expect(isWalkableTerrain(map, pos)).toBe(true);
  });

  it('nearestFree 把墙里的点挪到最近的可走点', () => {
    const out = { x: 0, y: 0 };
    expect(nav.nearestFree(-44, 0, 0.6, out)).toBe(true);
    expect(nav.isFree(out.x, out.y, 0.6)).toBe(true);
    expect(Math.hypot(out.x + 44, out.y)).toBeLessThan(4.5);
    // 本来就可走的点原样返回
    expect(nav.nearestFree(-52, 0, 0.6, out)).toBe(true);
    expect(out).toEqual({ x: -52, y: 0 });
    // 图外的点拉回图内
    expect(nav.nearestFree(80, 80, 0.6, out, 40)).toBe(true);
    expect(Math.abs(out.x)).toBeLessThanOrEqual(map.bound);
  });
});

describe('nav: 建筑障碍', () => {
  it('存活的塔挡路，被毁后可通行；寻路会绕开塔和水晶', () => {
    const sim = createWorld({ seed: 1, playerHero: 'chijin', difficulty: 'normal' }, { noBots: true, noWaves: true, noCamps: true });
    const nav = sim.nav;
    const tower = sim.towers[1].mid[0];
    expect(tower).not.toBeNull();
    if (!tower) return;
    expect(nav.isFree(tower.pos.x, tower.pos.y, 0.6)).toBe(false);
    expect(nav.isFree(tower.pos.x + tower.radius + 0.3, tower.pos.y, 0.6)).toBe(false);

    const a = sim.map.bases[0].fountain;
    const b = sim.map.bases[1].fountain;
    const path = nav.findPath(a.x, a.y, b.x, b.y, 0.6);
    expect(path).not.toBeNull();
    if (path) {
      let prev: Vec2 = a;
      for (const wp of path) {
        const steps = Math.max(1, Math.ceil(Math.hypot(wp.x - prev.x, wp.y - prev.y) / 0.2));
        for (let i = 0; i <= steps; i++) {
          const x = prev.x + ((wp.x - prev.x) * i) / steps;
          const y = prev.y + ((wp.y - prev.y) * i) / steps;
          for (const u of sim.units) {
            if (u.kind !== 'tower' && u.kind !== 'core') continue;
            expect(Math.hypot(u.pos.x - x, u.pos.y - y)).toBeGreaterThan(u.radius + 0.6 - 0.2);
          }
        }
        prev = wp;
      }
    }

    nav.removeObstacle(tower.id);
    expect(nav.isFree(tower.pos.x, tower.pos.y, 0.6)).toBe(true);
    // 其他塔不受影响
    const other = sim.towers[1].mid[1];
    if (other) expect(nav.isFree(other.pos.x, other.pos.y, 0.6)).toBe(false);
  });
});

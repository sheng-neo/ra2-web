import { describe, expect, it } from 'vitest';
import { findPath } from './pathfind';
import { gridTerrain } from './replay';

describe('findPath', () => {
  it('直线路径', () => {
    const g = gridTerrain(10, 10);
    const path = findPath(g, 0, 0, 3, 0)!;
    expect(path.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('绕墙', () => {
    // 竖墙 x=2, y=0..8，只留 y=9 缺口
    const blocked = new Set<number>();
    for (let y = 0; y <= 8; y++) blocked.add(y * 10 + 2);
    const g = gridTerrain(10, 10, blocked);
    const path = findPath(g, 0, 0, 5, 0)!;
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 5, y: 0 });
    // 必须经过缺口行
    expect(path.some((p) => p.y === 9)).toBe(true);
    // 路径不踩墙
    for (const p of path) expect(blocked.has(p.y * 10 + p.x)).toBe(false);
  });

  it('不可达返回 null', () => {
    const blocked = new Set<number>();
    for (let y = 0; y < 10; y++) blocked.add(y * 10 + 2); // 整面墙
    const g = gridTerrain(10, 10, blocked);
    expect(findPath(g, 0, 0, 5, 0)).toBeNull();
  });

  it('目标不可通行返回 null', () => {
    const g = gridTerrain(10, 10, new Set([55]));
    expect(findPath(g, 0, 0, 5, 5)).toBeNull();
  });

  it('斜行不穿角', () => {
    // (1,0) 与 (0,1) 堵住 → 不能直接斜穿到 (1,1)
    const g = gridTerrain(3, 3, new Set([1, 3]));
    expect(findPath(g, 0, 0, 1, 1)).toBeNull();
  });

  it('起点即终点', () => {
    const g = gridTerrain(5, 5);
    expect(findPath(g, 2, 2, 2, 2)).toEqual([]);
  });
});

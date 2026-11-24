import { describe, expect, it } from 'vitest';
import { groundOf, lowestGround } from './ground';

// 3×2 网格，西南角 (0, 0)，间距 100 dm：南排 10/20/30，北排 40/50/60
const GRID = { x0: 0, y0: 0, cell: 100, nx: 3, ny: 2, heights: Int16Array.from([10, 20, 30, 40, 50, 60]) };

describe('groundOf', () => {
  it('网格内双线性，网格外钳到最近边（不是 0）', () => {
    const g = groundOf(GRID);
    expect(g(50, 50)).toBe(30);
    expect(g(-500, 0)).toBe(10);
    expect(g(900, 900)).toBe(60);
    expect(g(100, -300)).toBe(20);
  });
});

describe('lowestGround', () => {
  it('取各顶点地面高程的最小值并取整', () => {
    const g = groundOf(GRID);
    expect(lowestGround([150, 50, 200, 100, 105, 100], g)).toBe(40);
    expect(lowestGround([], g)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { MAX_HOLE_CELLS, repairDtm } from './terrain-repair';

const ND = -32768;

/** nx×ny 网格，f(i, j) 给值。 */
function grid(nx: number, ny: number, f: (i: number, j: number) => number): Int16Array {
  const a = new Int16Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) a[j * nx + i] = f(i, j);
  return a;
}

describe('repairDtm', () => {
  it('干净数据原样返回，且不改输入', () => {
    const input = grid(6, 5, (i, j) => 40 + i * 3 + j);
    const before = input.slice();
    const { data, report } = repairDtm(input, 6, 5, ND);
    expect(Array.from(data)).toEqual(Array.from(before));
    expect(Array.from(input)).toEqual(Array.from(before));
    expect(report).toEqual({ outOfRange: 0, spikes: 0, holesFilled: 0, holeCellsFilled: 0, holesLeft: 0 });
  });

  it('离谱值改成无数据（在边上，不会被当空洞补回）', () => {
    const input = grid(5, 5, () => 50);
    input[0] = -9999; // 原始无数据值漏进来
    input[4] = 20000; // 2000 m
    const { data, report } = repairDtm(input, 5, 5, ND);
    expect(report.outOfRange).toBe(2);
    expect(data[0]).toBe(ND);
    expect(data[4]).toBe(ND);
  });

  it('孤立尖刺换成邻域中位数；挡土墙（一侧有同高邻居）不动', () => {
    const spiky = grid(5, 5, () => 100);
    spiky[2 * 5 + 2] = 600;
    spiky[1 * 5 + 1] = -200;
    const { data, report } = repairDtm(spiky, 5, 5, ND);
    expect(report.spikes).toBe(2);
    expect(data[2 * 5 + 2]).toBe(100);
    expect(data[1 * 5 + 1]).toBe(100);

    // 东半边比西半边高 20 m 的墙
    const wall = grid(6, 5, (i) => (i < 3 ? 50 : 250));
    expect(repairDtm(wall, 6, 5, ND).report.spikes).toBe(0);
  });

  it('内陆小空洞按邻居补齐，海面（连边界）保持无数据', () => {
    // 北边两行是海；中间一个 2×2 空洞
    const hole: [number, number][] = [[3, 2], [4, 2], [3, 3], [4, 3]];
    const input = grid(8, 8, (i, j) => (j >= 6 ? ND : 100 + i));
    for (const [i, j] of hole) input[j * 8 + i] = ND;
    const { data, report } = repairDtm(input, 8, 8, ND);
    expect(report.holesFilled).toBe(1);
    expect(report.holeCellsFilled).toBe(4);
    for (const [i, j] of hole) {
      const v = data[j * 8 + i]!;
      expect(v).toBeGreaterThanOrEqual(102);
      expect(v).toBeLessThanOrEqual(105);
    }
    for (let i = 0; i < 8; i++) expect(data[7 * 8 + i]).toBe(ND);
  });

  it('太大的封闭空洞留着并计数', () => {
    const side = Math.ceil(Math.sqrt(MAX_HOLE_CELLS)) + 1;
    const n = side + 2;
    const input = grid(n, n, (i, j) => (i > 0 && j > 0 && i < n - 1 && j < n - 1 ? ND : 30));
    const { data, report } = repairDtm(input, n, n, ND);
    expect(report.holesLeft).toBe(1);
    expect(report.holesFilled).toBe(0);
    expect(data[(n >> 1) * n + (n >> 1)]).toBe(ND);
  });
});

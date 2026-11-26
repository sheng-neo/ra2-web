import { describe, expect, it } from 'vitest';
import { components, countMask, fillRings, gridFor, insideRing, rasterRings, ringsBounds, traceMask } from './mask';
import { ringArea, signedArea2 } from './ring';

/** 轴对齐矩形，逆时针，dm。 */
const box = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
const cw = (r: number[]) => {
  const out: number[] = [];
  for (let i = r.length - 2; i >= 0; i -= 2) out.push(r[i]!, r[i + 1]!);
  return out;
};

describe('gridFor / fillRings', () => {
  it('格心在内即算：10 m × 6 m 的矩形在 2 dm 网格上恰好 50 × 30 格', () => {
    const r = box(0, 0, 100, 60);
    const g = gridFor(ringsBounds([r]), 2, 1);
    expect(g.x0).toBe(-2);
    expect(g.y0).toBe(-2);
    expect(countMask(rasterRings(g, [r]))).toBe(50 * 30);
  });

  it('偶奇规则：洞不填，绕向无关', () => {
    const outer = box(0, 0, 100, 100);
    const hole = cw(box(20, 20, 60, 60));
    const g = gridFor(ringsBounds([outer]), 2);
    expect(countMask(rasterRings(g, [outer, hole]))).toBe(50 * 50 - 20 * 20);
    expect(countMask(rasterRings(g, [cw(outer), box(20, 20, 60, 60)]))).toBe(50 * 50 - 20 * 20);
  });

  it('每格只回调一次', () => {
    const g = gridFor([0, 0, 40, 40], 2);
    const hits = new Map<number, number>();
    fillRings(g, [box(0, 0, 40, 40)], (k) => hits.set(k, (hits.get(k) ?? 0) + 1));
    expect([...hits.values()].every((v) => v === 1)).toBe(true);
    expect(hits.size).toBe(400);
  });
});

/** 掩膜 → 环（dm）。 */
function rings(mask: Uint8Array, g: ReturnType<typeof gridFor>): number[][] {
  return traceMask(mask, g.nx, g.ny).map((loop) => {
    const r: number[] = [];
    for (let i = 0; i < loop.length; i += 2) r.push(g.x0 + loop[i]! * g.cell, g.y0 + loop[i + 1]! * g.cell);
    return r;
  });
}

describe('traceMask', () => {
  it('矩形：一个逆时针环，只留 4 个拐点，从最南最西的角起', () => {
    const r = box(10, 20, 50, 80);
    const g = gridFor([0, 0, 100, 100], 2);
    const out = rings(rasterRings(g, [r]), g);
    expect(out).toEqual([[10, 20, 50, 20, 50, 80, 10, 80]]);
  });

  it('带洞：外环 CCW、洞 CW，面积与栅格一致', () => {
    const g = gridFor([0, 0, 100, 100], 2);
    const out = rings(rasterRings(g, [box(0, 0, 100, 100), cw(box(30, 30, 70, 60))]), g);
    expect(out).toHaveLength(2);
    const [outer, hole] = signedArea2(out[0]!) > 0 ? [out[0]!, out[1]!] : [out[1]!, out[0]!];
    expect(signedArea2(outer)).toBeGreaterThan(0);
    expect(signedArea2(hole)).toBeLessThan(0);
    expect(ringArea(outer) - ringArea(hole)).toBe(100 * 100 - 40 * 30);
  });

  it('对角相接的两格各成一环（4 连通，与 components 一致）', () => {
    const g = { x0: 0, y0: 0, cell: 1, nx: 2, ny: 2 };
    const m = new Uint8Array([1, 0, 0, 1]);
    expect(traceMask(m, 2, 2)).toHaveLength(2);
    expect(components(m, 2, 2).sizes).toEqual([0, 1, 1]);
    expect(rings(m, g).every((r) => signedArea2(r) > 0 && r.length === 8)).toBe(true);
  });

  it('两个重叠矩形的并（栅格精确并集）：一个 8 拐点的环，面积 = 和 − 交', () => {
    const a = box(0, 0, 60, 40);
    const b = box(40, 20, 100, 80);
    const g = gridFor(ringsBounds([a, b]), 2);
    const m = rasterRings(g, [a]);
    fillRings(g, [b], (k) => {
      m[k] = 1;
    });
    const out = rings(m, g);
    expect(out).toHaveLength(1);
    expect(out[0]!.length).toBe(16);
    expect(ringArea(out[0]!)).toBe(60 * 40 + 60 * 60 - 20 * 20);
  });
});

describe('components', () => {
  it('标号按行优先首次出现编号，大小正确', () => {
    const m = new Uint8Array([1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1]);
    const { labels, sizes } = components(m, 4, 3);
    expect(sizes).toEqual([0, 2, 3, 2]);
    expect(labels[0]).toBe(1);
    expect(labels[3]).toBe(2);
  });
});

describe('insideRing', () => {
  it('偶奇规则', () => {
    const r = box(0, 0, 10, 10);
    expect(insideRing(5, 5, r)).toBe(true);
    expect(insideRing(15, 5, r)).toBe(false);
  });
});

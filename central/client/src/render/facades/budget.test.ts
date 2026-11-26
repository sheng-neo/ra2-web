import { describe, expect, it } from 'vitest';
import { FACADE_SHARE_MB, SlotLru, boxDistance, choosePages, facadeBudget, farBytes, layerBytes, pageNearest } from './budget';

const MB = 1024 * 1024;

describe('facadeBudget', () => {
  it('近景层数 = 份额减远景后放得下的层数（2–12 层）；LOW 半分辨率远景 + 2 层近景池（80 m 内）', () => {
    const far = farBytes(2048, 2048);
    // 远景 2048 × 2048 RGBA ≈ 21.3 MB：手机 (76.5 − 21.3) / 5.33 → 10 层，桌面 (87 − 21.3) / 5.33 → 12 层
    expect(facadeBudget('high', true, far, 1024)).toEqual({ nearLayers: 10, far: 'full', nearMaxM: 900 });
    expect(facadeBudget('high', false, far, 1024)).toEqual({ nearLayers: 12, far: 'full', nearMaxM: 900 });
    expect(facadeBudget('high', true, farBytes(2048, 2816), 1024).nearLayers).toBe(8);
    expect(facadeBudget('high', true, 200 * MB, 1024).nearLayers).toBe(2);
    expect(facadeBudget('low', true, far, 1024)).toEqual({ nearLayers: 2, far: 'low', nearMaxM: 80 });
    // LOW 远景太大时近景池让出（不低于 0 层）
    expect(facadeBudget('low', true, farBytes(4096, 4096), 1024).nearLayers).toBe(0);
  });
  it('显存份额：远景 + 近景池守住 HIGH 手机 70 MB、桌面 85 MB（远景不太大时）；LOW 半分辨率远景 ≤ 15 MB', () => {
    for (const rows of [4, 8, 14, 18]) {
      const far = farBytes(2048, rows * 128);
      for (const mobile of [true, false]) {
        const n = facadeBudget('high', mobile, far, 1024).nearLayers;
        expect((far + n * layerBytes(1024)) / MB).toBeLessThanOrEqual(mobile ? FACADE_SHARE_MB.phone : FACADE_SHARE_MB.desktop);
      }
      const low = facadeBudget('low', true, far, 1024);
      expect((farBytes(1024, rows * 64) + low.nearLayers * layerBytes(1024)) / MB).toBeLessThanOrEqual(FACADE_SHARE_MB.low);
    }
    // 一层 = RGBA 4 B（颜色 + alpha 码），含 mipmap 4/3
    expect(layerBytes(1024) / MB).toBeCloseTo((4 * 4) / 3, 5);
  });
});

describe('boxDistance', () => {
  const boxes = new Float32Array([0, 0, 0, 10, 10, 50, 0, 0, 0, 0, 0, 0]);
  it('盒内为 0，盒外为到盒的欧氏距离；全 0 的盒（没有楼用到的页）为 Infinity', () => {
    expect(boxDistance(boxes, 0, 5, 5, 20)).toBe(0);
    expect(boxDistance(boxes, 0, 13, 14, 20)).toBeCloseTo(5);
    expect(boxDistance(boxes, 0, 5, 5, 60)).toBeCloseTo(10);
    expect(boxDistance(boxes, 1, 0, 0, 0)).toBe(Infinity);
  });
});

describe('choosePages', () => {
  it('按有效距离（视野外：100 m 内 × 1.25、更远 × 2.5）升序取前 cap 个，超出 maxDist 的不要，同距离按页号', () => {
    const dist = [100, 50, 50, 400, 1000, 30, 200];
    const view = [true, true, true, true, true, false, false];
    // 页 5 在视野外但很近：30 × 1.25 = 37.5；页 6：200 × 2.5 = 500
    expect(choosePages(dist, view, 4, 900)).toEqual([5, 1, 2, 0]);
    expect(choosePages(dist, view, 10, 900)).toEqual([5, 1, 2, 0, 3, 6]);
    expect(choosePages(dist, view, 2, 20)).toEqual([]);
  });
  it('滞回：已常驻的页距离打 0.75 折，新页要近 25 % 以上才换掉它', () => {
    const view = [true, true];
    expect(choosePages([100, 90], view, 1, 900)).toEqual([1]);
    expect(choosePages([100, 90], view, 1, 900, (p) => p === 0)).toEqual([0]);
    expect(choosePages([100, 70], view, 1, 900, (p) => p === 0)).toEqual([1]);
  });
});

describe('pageNearest', () => {
  it('按页取最近一栋楼的距离（不是页覆盖楼群的外包盒）', () => {
    // 页 0 有两栋：一栋在 (0..10)、一栋在 (500..510)；页 1 一栋在 (100..110)；页 2 没有楼
    const boxes = new Float32Array([0, 0, 0, 10, 10, 50, 500, 0, 0, 510, 10, 50, 100, 0, 0, 110, 10, 50]);
    const pageOf = new Int32Array([0, 0, 1]);
    const out = pageNearest(pageOf, boxes, 250, 5, 10, new Float64Array(3));
    expect(out[0]).toBeCloseTo(240);
    expect(out[1]).toBeCloseTo(140);
    expect(out[2]).toBe(Infinity);
  });
});

describe('SlotLru', () => {
  it('先用空槽；满了让出不再需要、最久没用的页；需要的页不让', () => {
    const lru = new SlotLru(2);
    expect(lru.plan([7, 8, 9])).toEqual([
      { page: 7, slot: 0, evicted: -1 },
      { page: 8, slot: 1, evicted: -1 },
    ]);
    lru.commit(7, 0, 1);
    lru.commit(8, 1, 2);
    expect(lru.resident).toBe(2);
    // 7、8 都还需要：9 没有槽
    expect(lru.plan([7, 8, 9])).toEqual([]);
    // 只要 8 与 9：让出 7
    expect(lru.plan([8, 9])).toEqual([{ page: 9, slot: 0, evicted: 7 }]);
    // 都不需要时让出最久没被需要的（touch 更新时刻）
    lru.touch([7], 10);
    expect(lru.plan([1])).toEqual([{ page: 1, slot: 1, evicted: 8 }]);
  });
  it('reserved 的槽（正在加载）不分配；commit 后页 ↔ 槽一一对应、常驻数不超过槽数', () => {
    const lru = new SlotLru(3);
    expect(lru.plan([1, 2], Infinity, new Set([0]))).toEqual([
      { page: 1, slot: 1, evicted: -1 },
      { page: 2, slot: 2, evicted: -1 },
    ]);
    for (let p = 0; p < 20; p++) {
      const plan = lru.plan([p], 1);
      if (plan.length) lru.commit(plan[0]!.page, plan[0]!.slot, p);
      expect(lru.resident).toBeLessThanOrEqual(3);
    }
    expect(lru.slot(19)).toBeGreaterThanOrEqual(0);
    expect(lru.page(lru.slot(19))).toBe(19);
    expect(lru.slot(0)).toBe(-1);
    lru.release(lru.slot(19));
    expect(lru.slot(19)).toBe(-1);
  });
  it('limit 限制一次分配的个数；同一页重复 commit 到别的槽会腾出旧槽', () => {
    const lru = new SlotLru(4);
    expect(lru.plan([1, 2, 3], 2)).toHaveLength(2);
    lru.commit(5, 0, 0);
    lru.commit(5, 2, 1);
    expect(lru.page(0)).toBe(-1);
    expect(lru.slot(5)).toBe(2);
  });
});

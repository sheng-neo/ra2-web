import { describe, expect, it } from 'vitest';
import type { CanopyItem } from './canopies';
import { MIN_DEPTH_M, fitCanopies, type CanopyObstacles } from './canopy-fit';

// 沿 y = 0 的南墙（x 0 → 20 m）向 −y 伸出 3 m 的雨篷，顶 9.0 m、厚 30 cm（底 8.7 m），地面 4 m（底离地 4.7 m）
const REC = [0, 0, 200, 0, 30, 90, 30, 0x808080, 0x404040, 0xc0c0c0];
const F = [
  [0, 0, 1, 24],
  [1, 0, 1, 24],
  [1, 0.1, 1, 24],
  [0, 0.1, 1, 24],
] as const;
const item: CanopyItem = { rec: REC, fascia: F, groundM: 4 };

function obs(o: Partial<CanopyObstacles> = {}): CanopyObstacles {
  return { poles: [], boxes: [], keepOut: () => false, deckBottom: () => null, ground: () => 4, ...o };
}

describe('fitCanopies', () => {
  it('没有障碍：原样保留（同一个对象）', () => {
    const r = fitCanopies([item], obs());
    expect(r.items).toEqual([item]);
    expect(r.items[0]).toBe(item);
    expect(r.stats).toMatchObject({ input: 1, kept: 1, trimmed: 0, pieces: 1 });
  });
  it('灯杆离墙 2 m：杆两侧 0.45 m 内只伸到杆前 0.45 m（开缺口），其余照原深度；檐口照片坐标沿墙插值', () => {
    const r = fitCanopies([item], obs({ poles: [[10, -2, 14]] }));
    expect(r.stats).toMatchObject({ kept: 1, trimmed: 1 });
    expect(r.items).toHaveLength(3);
    const [a, b, c] = r.items.map((x) => x.rec);
    // 第一段：x 0 → 9.5 m（取样 0.25 m），深 3 m
    expect(a![0]).toBe(0);
    expect(a![2]).toBeCloseTo(95, 6);
    expect(a![4]).toBe(30);
    // 中段：深 floor((2 − 0.45) / 0.25) × 0.25 = 1.5 m
    expect(b![4]).toBeCloseTo(15, 6);
    expect(c![0]).toBeCloseTo(105, 6);
    expect(c![4]).toBe(30);
    // 檐口坐标：第一段终点 s = 9.5 / 20
    expect(r.items[0]!.fascia![1][0]).toBeCloseTo(0.475, 6);
    expect(r.items[2]!.fascia![3][0]).toBeCloseTo(0.525, 6);
  });
  it('灯杆贴墙（伸不到 1 m）：在杆处断开；杆顶低于雨篷底的不管', () => {
    const r = fitCanopies([item], obs({ poles: [[10, -1, 14]] }));
    expect(r.items).toHaveLength(2);
    expect(r.items.every((x) => x.rec[4]! >= MIN_DEPTH_M * 10)).toBe(true);
    expect(r.items[0]!.rec[2]).toBeLessThanOrEqual(10 * (10 - 0.45) + 1e-6);
    expect(r.items[1]!.rec[0]).toBeGreaterThanOrEqual(10 * (10 + 0.45) - 2.5);
    expect(fitCanopies([item], obs({ poles: [[10, -1, 8]] })).items).toEqual([item]);
  });
  it('电车行车线（y < −2.2）：整块变浅到净距 0.3 m 以内（0.2 m 取样、0.25 m 量化 → 1.75 m）；伸不到 1 m 就整块不要', () => {
    const r = fitCanopies([item], obs({ keepOut: (_x, y) => y < -2.2 }));
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.rec[4]).toBeCloseTo(17.5, 6);
    const gone = fitCanopies([item], obs({ keepOut: (_x, y) => y < -1.0 }));
    expect(gone.items).toHaveLength(0);
    expect(gone.stats.dropTram).toBe(1);
  });
  it('车行道：雨篷底离地低于 4.8 m 时退到路缘线以内（双层巴士），高的雨篷不管', () => {
    // 底离地 4.7 m < 4.8：车行道从 y < −2.0 开始 → 变浅
    const r = fitCanopies([item], obs({ carriageway: (_x, y) => y < -2.0 }));
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.rec[4]).toBeLessThan(20);
    // 雨篷高 1 m（底离地 5.7 m）：不管车行道
    const high: CanopyItem = { ...item, rec: [0, 0, 200, 0, 30, 100, 30, 0x808080, 0x404040, 0xc0c0c0] };
    expect(fitCanopies([high], obs({ carriageway: (_x, y) => y < -2.0 })).items[0]!.rec[4]).toBe(30);
  });
  it('候车亭（矩形，顶高过雨篷底）同样让开；雨篷底离地 < 2.3 m 或高过天桥桥面底的整块不要', () => {
    const box = { cx: 5, cy: -2.5, tx: 1, ty: 0, hl: 2, hw: 1, top: 9 };
    const r = fitCanopies([item], obs({ boxes: [box] }));
    // 候车亭 x 3–7、离墙 1.5–3.5 m：x 2.7–7.3 之间只伸到 1.5 − 0.3 = 1.2 → 1.0 m
    expect(r.items.length).toBe(3);
    expect(r.items[1]!.rec[4]).toBeCloseTo(10, 6);
    expect(fitCanopies([item], obs({ boxes: [{ ...box, cy: -1.5 }] })).items).toHaveLength(2); // 离墙 0.5 m：断开
    expect(fitCanopies([item], obs({ boxes: [{ ...box, top: 8 }] })).items).toEqual([item]);
    expect(fitCanopies([item], obs({ ground: () => 6.6 })).stats.dropLow).toBe(1);
    expect(fitCanopies([item], obs({ deckBottom: () => 8.5 })).stats.dropBridge).toBe(1);
    expect(fitCanopies([item], obs({ deckBottom: () => 9.5 })).items).toEqual([item]);
  });
});

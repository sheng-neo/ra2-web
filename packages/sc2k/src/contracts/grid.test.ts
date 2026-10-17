import { describe, expect, it } from 'vitest';
import {
  Dir, DX, DY, HALF_N, MAP, QUARTER_N, SCAN_NEIGHBORS, TILES, XterClass, ZoneCode,
  dirBit, halfIndex, halfOfTile, inMap, isDenseZone, neighbor, neighborXY, opposite, quarterIndex, quarterOfTile,
  tileIndex, tileX, tileY, xterClassOf, zoneTypeOf,
} from './grid';

describe('grid: 线性索引', () => {
  it('tileIndex 为 x 主序（y 变化最快）', () => {
    expect(tileIndex(0, 0)).toBe(0);
    expect(tileIndex(0, 1)).toBe(1);
    expect(tileIndex(1, 0)).toBe(128);
    expect(tileIndex(127, 127)).toBe(TILES - 1);
  });
  it('tileX/tileY 与 tileIndex 互为反转置（全 16384 格）', () => {
    for (let i = 0; i < TILES; i++) expect(tileIndex(tileX(i), tileY(i))).toBe(i);
    for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) {
      const i = tileIndex(x, y);
      expect(tileX(i)).toBe(x);
      expect(tileY(i)).toBe(y);
    }
  });
  it('半格 / 四分格索引覆盖 [0, N) 且随 tile 单调', () => {
    let maxH = -1, maxQ = -1;
    for (let i = 0; i < TILES; i++) {
      const h = halfOfTile(i), q = quarterOfTile(i);
      expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(HALF_N);
      expect(q).toBeGreaterThanOrEqual(0); expect(q).toBeLessThan(QUARTER_N);
      maxH = Math.max(maxH, h); maxQ = Math.max(maxQ, q);
    }
    expect(maxH).toBe(HALF_N - 1);
    expect(maxQ).toBe(QUARTER_N - 1);
    expect(halfIndex(2, 0)).toBe(64);
    expect(quarterIndex(4, 0)).toBe(32);
  });
});

describe('grid: 方向与邻居', () => {
  it('DX/DY 与 Dir 命名一致：T=−y R=+x B=+y L=−x', () => {
    expect([DX[Dir.T], DY[Dir.T]]).toEqual([0, -1]);
    expect([DX[Dir.R], DY[Dir.R]]).toEqual([1, 0]);
    expect([DX[Dir.B], DY[Dir.B]]).toEqual([0, 1]);
    expect([DX[Dir.L], DY[Dir.L]]).toEqual([-1, 0]);
  });
  it('opposite / dirBit', () => {
    expect(opposite(Dir.T)).toBe(Dir.B); expect(opposite(Dir.R)).toBe(Dir.L);
    expect(opposite(Dir.B)).toBe(Dir.T); expect(opposite(Dir.L)).toBe(Dir.R);
    expect([dirBit(Dir.T), dirBit(Dir.R), dirBit(Dir.B), dirBit(Dir.L)]).toEqual([1, 2, 4, 8]);
  });
  it('neighbor 在地图边缘返回 −1，不绕到相邻列', () => {
    expect(neighbor(tileIndex(5, 0), Dir.T)).toBe(-1);
    expect(neighbor(tileIndex(5, 127), Dir.B)).toBe(-1);
    expect(neighbor(tileIndex(0, 5), Dir.L)).toBe(-1);
    expect(neighbor(tileIndex(127, 5), Dir.R)).toBe(-1);
    // 用 i−1 / i+1 会绕列的两个典型格
    expect(neighbor(tileIndex(7, 0), Dir.T)).toBe(-1);
    expect(neighbor(tileIndex(6, 127), Dir.B)).toBe(-1);
    expect(neighborXY(tileIndex(0, 0), -1, 0)).toBe(-1);
    expect(neighborXY(tileIndex(127, 127), 1, 1)).toBe(-1);
  });
  it('neighbor 在内部等于坐标加减', () => {
    for (let x = 1; x < 127; x += 7) for (let y = 1; y < 127; y += 5) {
      const i = tileIndex(x, y);
      for (const d of [Dir.T, Dir.R, Dir.B, Dir.L]) expect(neighbor(i, d)).toBe(tileIndex(x + DX[d]!, y + DY[d]!));
      expect(neighborXY(i, 1, -1)).toBe(tileIndex(x + 1, y - 1));
    }
  });
  it('SCAN_NEIGHBORS 对应索引增量 −1, −128, +1, +128', () => {
    const deltas = SCAN_NEIGHBORS.map(([dx, dy]) => dx * 128 + dy);
    expect(deltas).toEqual([-1, -128, 1, 128]);
  });
  it('inMap', () => {
    expect(inMap(0, 0)).toBe(true); expect(inMap(127, 127)).toBe(true);
    expect(inMap(-1, 0)).toBe(false); expect(inMap(128, 0)).toBe(false); expect(inMap(0, 128)).toBe(false);
  });
});

describe('grid: 枚举辅助', () => {
  it('zoneTypeOf / isDenseZone', () => {
    expect(zoneTypeOf(ZoneCode.LightR)).toBe('R'); expect(zoneTypeOf(ZoneCode.DenseR)).toBe('R');
    expect(zoneTypeOf(ZoneCode.LightC)).toBe('C'); expect(zoneTypeOf(ZoneCode.DenseC)).toBe('C');
    expect(zoneTypeOf(ZoneCode.LightI)).toBe('I'); expect(zoneTypeOf(ZoneCode.DenseI)).toBe('I');
    for (const z of [ZoneCode.None, ZoneCode.Military, ZoneCode.Airport, ZoneCode.Seaport]) expect(zoneTypeOf(z)).toBeNull();
    expect([1, 2, 3, 4, 5, 6].filter(isDenseZone)).toEqual([2, 4, 6]);
  });
  it('xterClassOf', () => {
    expect(xterClassOf(0x00)).toBe(XterClass.Dry); expect(xterClassOf(0x0d)).toBe(XterClass.Dry);
    expect(xterClassOf(0x15)).toBe(XterClass.Submerged); expect(xterClassOf(0x2a)).toBe(XterClass.Shore);
    expect(xterClassOf(0x30)).toBe(XterClass.Surface); expect(xterClassOf(0x3e)).toBe(XterClass.Waterfall);
    for (let c = 0x40; c <= 0x45; c++) expect(xterClassOf(c)).toBe(XterClass.Stream);
  });
});

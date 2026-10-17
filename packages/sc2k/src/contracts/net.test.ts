import { describe, expect, it } from 'vitest';
import { Dir, dirBit } from './grid';
import {
  ACCESS_OFFSETS, NET_BASE, NET_FLAGS, NetFlag, PIECE_MASK, SLOPE_PIECE,
  isBridge, isHighway, isOnramp, isPipeUnd, isPortal, isPowerCarrier, isRail, isRoad, isRoadSurface, isStationTile, isSubwayUnd, isTerminal,
  pieceIndexFor, type NetFamily,
} from './net';

/** 与 CONTRACTS §D 注释独立转录的集合（不复用 NET_FLAG_RANGES）。 */
const DOC_SETS: Readonly<Record<string, ReadonlyArray<readonly [number, number]>>> = {
  Road: [[0x1d, 0x2b], [0x3f, 0x46], [0x4b, 0x4c], [0x5d, 0x60]],
  Rail: [[0x2c, 0x3e], [0x45, 0x48], [0x4d, 0x4e], [0x6c, 0x6f]],
  Highway: [[0x49, 0x50], [0x61, 0x6b]],
  Bridge: [[0x51, 0x5c], [0x6a, 0x6b]],
  Portal: [[0x3f, 0x42]],
  Onramp: [[0x5d, 0x60]],
  Station: [[0xe9, 0xe9], [0xec, 0xed]],
  Power: [[0x0e, 0x1c], [0x43, 0x44], [0x47, 0x48], [0x4f, 0x50], [0x5c, 0x5c]] };
const FLAG_OF: Readonly<Record<string, NetFlag>> = { Road: NetFlag.Road, Rail: NetFlag.Rail, Highway: NetFlag.Highway, Bridge: NetFlag.Bridge, Portal: NetFlag.Portal, Onramp: NetFlag.Onramp, Station: NetFlag.Station, Power: NetFlag.Power };
const inSet = (id: number, ranges: ReadonlyArray<readonly [number, number]>): boolean => ranges.some(([lo, hi]) => id >= lo && id <= hi);

describe('net: NET_FLAGS', () => {
  it('256 项；每个类别位的集合与文档区间逐 ID 一致', () => {
    expect(NET_FLAGS.length).toBe(256);
    for (const [name, ranges] of Object.entries(DOC_SETS)) {
      const flag = FLAG_OF[name]!;
      for (let id = 0; id < 256; id++) expect((NET_FLAGS[id]! & flag) !== 0, `${name} 0x${id.toString(16)}`).toBe(inSet(id, ranges));
    }
    for (let id = 0; id < 0x0e; id++) expect(NET_FLAGS[id]).toBe(0);     // 地形 / 树木 / 瓦砾无网络位
    for (let id = 0x70; id < 0xe9; id++) expect(NET_FLAGS[id]).toBe(0);  // 普通建筑无网络位
  });
  it('谓词函数与表一致；isRoadSurface = 道路去匝道', () => {
    for (let id = 0; id < 256; id++) {
      expect(isRoad(id)).toBe(inSet(id, DOC_SETS.Road!));
      expect(isRail(id)).toBe(inSet(id, DOC_SETS.Rail!));
      expect(isHighway(id)).toBe(inSet(id, DOC_SETS.Highway!));
      expect(isBridge(id)).toBe(inSet(id, DOC_SETS.Bridge!));
      expect(isPortal(id)).toBe(inSet(id, DOC_SETS.Portal!));
      expect(isOnramp(id)).toBe(inSet(id, DOC_SETS.Onramp!));
      expect(isStationTile(id)).toBe(inSet(id, DOC_SETS.Station!));
      expect(isPowerCarrier(id)).toBe(inSet(id, DOC_SETS.Power!));
      expect(isRoadSurface(id)).toBe(isRoad(id) && !isOnramp(id));
      expect(isTerminal(id)).toBe(id > 0xfa);
    }
  });
  it('地下层谓词', () => {
    for (let u = 0; u < 256; u++) {
      expect(isSubwayUnd(u)).toBe((u >= 0x01 && u <= 0x0f) || u === 0x1f || u === 0x20 || u === 0x22 || u === 0x23);
      expect(isPipeUnd(u)).toBe((u >= 0x10 && u <= 0x1e) || u === 0x1f || u === 0x20);
    }
  });
});

describe('net: 片段掩码与选形', () => {
  it('PIECE_MASK 15 项；直线 / 弯 / 三岔 / 十字的位数', () => {
    expect(PIECE_MASK.length).toBe(15);
    const bits = (m: number): number => [0, 1, 2, 3].filter((b) => m & (1 << b)).length;
    for (let k = 0; k <= 5; k++) expect(bits(PIECE_MASK[k]!)).toBe(2);
    for (let k = 6; k <= 9; k++) expect(bits(PIECE_MASK[k]!)).toBe(2);
    for (let k = 10; k <= 13; k++) expect(bits(PIECE_MASK[k]!)).toBe(3);
    expect(PIECE_MASK[14]).toBe(0b1111);
    // 弯 6–9 = BR BL TL TR
    expect(PIECE_MASK[6]).toBe(dirBit(Dir.B) | dirBit(Dir.R));
    expect(PIECE_MASK[7]).toBe(dirBit(Dir.B) | dirBit(Dir.L));
    expect(PIECE_MASK[8]).toBe(dirBit(Dir.T) | dirBit(Dir.L));
    expect(PIECE_MASK[9]).toBe(dirBit(Dir.T) | dirBit(Dir.R));
    // 坡面件 2..5 掩码沿坡向直线
    expect(SLOPE_PIECE).toEqual({ 1: 2, 2: 3, 3: 4, 4: 5 });
    expect(PIECE_MASK[0]).toBe(dirBit(Dir.L) | dirBit(Dir.R));
    expect(PIECE_MASK[1]).toBe(dirBit(Dir.T) | dirBit(Dir.B));
  });
  it('pieceIndexFor：非坡面片段按掩码反查；单方向视为直线；掩码 0 管线取十字', () => {
    const families: readonly NetFamily[] = ['power', 'road', 'rail', 'subway', 'pipe'];
    for (const f of families) {
      for (let k = 6; k < 15; k++) expect(pieceIndexFor(PIECE_MASK[k]!, f)).toBe(k);
      expect(pieceIndexFor(0b1010, f)).toBe(0);
      expect(pieceIndexFor(0b0101, f)).toBe(1);
      expect(pieceIndexFor(dirBit(Dir.T), f)).toBe(1); expect(pieceIndexFor(dirBit(Dir.B), f)).toBe(1);
      expect(pieceIndexFor(dirBit(Dir.L), f)).toBe(0); expect(pieceIndexFor(dirBit(Dir.R), f)).toBe(0);
      expect(pieceIndexFor(0, f)).toBe(f === 'pipe' ? 14 : 0);
      // 任意掩码都落在 [0,15) 且不选坡面件
      for (let m = 0; m < 16; m++) { const k = pieceIndexFor(m, f); expect(k).toBeGreaterThanOrEqual(0); expect(k).toBeLessThan(15); expect(k < 2 || k > 5).toBe(true); }
    }
    expect(NET_BASE).toEqual({ power: 0x0e, road: 0x1d, rail: 0x2c, subway: 0x01, pipe: 0x10 });
  });
});

describe('net: ACCESS_OFFSETS', () => {
  it('24 项、无重复、不含原点、关于原点对称、切比雪夫距离 ≤ 3', () => {
    expect(ACCESS_OFFSETS.length).toBe(24);
    const keys = new Set(ACCESS_OFFSETS.map(([x, y]) => `${x},${y}`));
    expect(keys.size).toBe(24);
    expect(keys.has('0,0')).toBe(false);
    for (const [x, y] of ACCESS_OFFSETS) {
      expect(keys.has(`${-x},${-y}`)).toBe(true);
      expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(3);
    }
    expect(ACCESS_OFFSETS.slice(0, 4)).toEqual([[0, 1], [1, 0], [0, -1], [-1, 0]]);
  });
});

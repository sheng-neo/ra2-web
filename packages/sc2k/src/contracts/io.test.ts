import { describe, expect, it } from 'vitest';
import type { ChunkId, MiscKey } from './io';
import { CHUNK_SIZES, COHORT_COUNT, COHORT_STRIDE, MISC, MISC_BYTES, MISC_ZERO_RANGES, UNCOMPRESSED, WRITE_ORDER, cohortOffset, miscGet, miscSet } from './io';
import { LAYER_LENGTHS } from './state';

const MISC_SIZE = CHUNK_SIZES.MISC;
const entries = (Object.keys(MISC) as MiscKey[]).map((k) => ({ key: k, start: MISC[k], end: MISC[k] + MISC_BYTES[k] }));

describe('io: MISC 偏移表', () => {
  it('全部偏移 4 字节对齐，长度为 4 的倍数且 > 0', () => {
    for (const e of entries) {
      expect(e.start % 4, e.key).toBe(0);
      expect(MISC_BYTES[e.key] % 4, e.key).toBe(0);
      expect(MISC_BYTES[e.key], e.key).toBeGreaterThan(0);
    }
  });
  it('MISC_BYTES 的键集合 == MISC 的键集合', () => {
    expect(Object.keys(MISC_BYTES).sort()).toEqual(Object.keys(MISC).sort());
  });
  it('条目两两不重叠且都落在 4800 B 内', () => {
    const sorted = [...entries].sort((a, b) => a.start - b.start);
    for (let k = 1; k < sorted.length; k++) {
      const prev = sorted[k - 1]!, cur = sorted[k]!;
      expect(prev.end, `${prev.key} 与 ${cur.key} 重叠`).toBeLessThanOrEqual(cur.start);
    }
    for (const e of entries) expect(e.end, e.key).toBeLessThanOrEqual(MISC_SIZE);
    expect(new Set(entries.map((e) => e.start)).size).toBe(entries.length);
  });
  it('数组块首尾相接（spec:file-formats §2.3.2 的区间）', () => {
    expect(MISC.cohorts + MISC_BYTES.cohorts).toBe(MISC.industryGraph);
    expect(MISC.industryGraph + MISC_BYTES.industryGraph).toBe(MISC.tileCounts);
    expect(MISC.tileCounts + MISC_BYTES.tileCounts).toBe(MISC.zoneTileCounts);
    expect(MISC.zoneTileCounts + MISC_BYTES.zoneTileCounts).toBe(MISC.bonds);
    expect(MISC.bonds + MISC_BYTES.bonds).toBe(MISC.neighbors);
    expect(MISC.neighbors + MISC_BYTES.neighbors).toBe(MISC.rciDemand);
    expect(MISC.techYears + MISC_BYTES.techYears).toBe(MISC.taxRes);
    expect(MISC.taxRes + MISC_BYTES.taxRes).toBe(MISC.taxCom);
    expect(MISC.taxInd + MISC_BYTES.taxInd).toBe(MISC.ordinanceBlock);
    expect(MISC.ordinanceBlock + MISC_BYTES.ordinanceBlock).toBe(MISC.bondBlock);
    expect(MISC.bondBlock + MISC_BYTES.bondBlock).toBe(MISC.svcPolice);
    expect(MISC.svcTunnel + MISC_BYTES.svcTunnel).toBe(MISC.yearEnd);
    expect(MISC.paperList + MISC_BYTES.paperList).toBe(MISC.newsList);
    expect(MISC.newsList + MISC_BYTES.newsList).toBe(MISC.ordinances);
    expect(MISC.militaryCounts + MISC_BYTES.militaryCounts).toBe(MISC.subwayCount);
    expect(MISC_BYTES.tileCounts).toBe(LAYER_LENGTHS.countTile * 4);
    expect(MISC_BYTES.zoneTileCounts).toBe(LAYER_LENGTHS.countZone * 4);
    expect(MISC_BYTES.militaryCounts).toBe(LAYER_LENGTHS.countMilitary * 4);
    expect(MISC_BYTES.techYears).toBe(LAYER_LENGTHS.tech * 4);
    expect(MISC_BYTES.cohorts).toBe(LAYER_LENGTHS.cohorts * 4);
  });
  it('零区扩展项落在零区内，零区在 4800 B 内', () => {
    const inZero = (off: number, len: number): boolean => MISC_ZERO_RANGES.some(([a, b]) => off >= a && off + len <= b);
    for (const k of ['prngMarker', 'prngState', 'saveFormatVersion', 'viewZoom', 'xtxtShadow'] as const) expect(inZero(MISC[k], MISC_BYTES[k]), k).toBe(true);
    for (const [a, b] of MISC_ZERO_RANGES) { expect(a % 4).toBe(0); expect(b % 4).toBe(0); expect(b).toBeLessThanOrEqual(MISC_SIZE); expect(a).toBeLessThan(b); }
    expect(MISC.xtxtShadow + MISC_BYTES.xtxtShadow).toBe(0x12bc);
  });
});

describe('io: cohortOffset', () => {
  it('cohortOffset(19, leSum) + 4 == MISC.industryGraph（块恰好填满 0x007C–0x016B）', () => {
    expect(cohortOffset(19, 'leSum') + 4).toBe(MISC.industryGraph);
    expect(cohortOffset(0, 'count')).toBe(MISC.cohorts);
    expect(cohortOffset(0, 'eqSum')).toBe(MISC.cohorts + 4);
    expect(cohortOffset(0, 'leSum')).toBe(MISC.cohorts + 8);
    expect(cohortOffset(1, 'count')).toBe(MISC.cohorts + COHORT_STRIDE);
    expect(COHORT_COUNT * COHORT_STRIDE).toBe(MISC_BYTES.cohorts);
    for (let k = 0; k < COHORT_COUNT; k++) for (const f of ['count', 'eqSum', 'leSum'] as const) expect(cohortOffset(k, f) % 4).toBe(0);
  });
});

describe('io: CHUNK_SIZES / WRITE_ORDER / UNCOMPRESSED', () => {
  it('WRITE_ORDER 无重复、25 项、CNAM 首 MISC 次；CHUNK_SIZES 键 ⊆ WRITE_ORDER，差集恰为四个变长情景 chunk', () => {
    expect(WRITE_ORDER).toHaveLength(25);
    expect(new Set(WRITE_ORDER).size).toBe(WRITE_ORDER.length);
    expect(WRITE_ORDER[0]).toBe('CNAM'); expect(WRITE_ORDER[1]).toBe('MISC'); expect(WRITE_ORDER[2]).toBe('ALTM');
    const sized = Object.keys(CHUNK_SIZES) as ChunkId[];
    for (const id of sized) expect(WRITE_ORDER).toContain(id);
    expect(WRITE_ORDER.filter((id) => !(id in CHUNK_SIZES))).toEqual(['TEXT', 'SCEN', 'PICT', 'TMPL']);
    for (const id of UNCOMPRESSED) expect(WRITE_ORDER).toContain(id);
    expect([...UNCOMPRESSED].sort()).toEqual(['ALTM', 'CNAM', 'PICT', 'SCEN', 'TEXT', 'TMPL']);
  });
  it('定长 chunk 的尺寸与 LAYER_LENGTHS 一致', () => {
    expect(CHUNK_SIZES.MISC).toBe(LAYER_LENGTHS.rawMisc * 4);
    expect(CHUNK_SIZES.XGRP).toBe(LAYER_LENGTHS.xgrp * 4);
    expect(CHUNK_SIZES.ALTM).toBe(LAYER_LENGTHS.tile * 2);
    for (const id of ['XTER', 'XBLD', 'XZON', 'XUND', 'XTXT', 'XBIT'] as const) expect(CHUNK_SIZES[id]).toBe(LAYER_LENGTHS.tile);
    expect(CHUNK_SIZES.XLAB).toBe(LAYER_LENGTHS.xlab); expect(CHUNK_SIZES.XMIC).toBe(LAYER_LENGTHS.xmic); expect(CHUNK_SIZES.XTHG).toBe(LAYER_LENGTHS.xthg);
    for (const id of ['XTRF', 'XPLT', 'XVAL', 'XCRM'] as const) expect(CHUNK_SIZES[id]).toBe(LAYER_LENGTHS.half);
    for (const id of ['XPLC', 'XFIR', 'XPOP', 'XROG'] as const) expect(CHUNK_SIZES[id]).toBe(LAYER_LENGTHS.quarter);
    expect(CHUNK_SIZES.CNAM).toBe(32);
  });
});

describe('io: miscGet / miscSet', () => {
  it('按字节偏移读写 i32 槽；写入经 |0 截断', () => {
    const m = new Int32Array(LAYER_LENGTHS.rawMisc);
    miscSet(m, MISC.cityAge, 12345);
    expect(m[MISC.cityAge >> 2]).toBe(12345);
    expect(m[4]).toBe(12345);                                   // 0x0010 / 4
    expect(miscGet(m, MISC.cityAge)).toBe(12345);
    miscSet(m, MISC.money, -7);
    expect(miscGet(m, MISC.money)).toBe(-7);
    miscSet(m, MISC.fame, 1.9);
    expect(miscGet(m, MISC.fame)).toBe(1);
    miscSet(m, MISC.garbage, 2 ** 31);
    expect(miscGet(m, MISC.garbage)).toBe(-(2 ** 31));
    expect(miscGet(m, MISC.header)).toBe(0);
  });
});

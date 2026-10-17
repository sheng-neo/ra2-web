// io/sc2/roundtrip.test.ts —— 手工构造样例 readSc2(writeSc2(doc)) 深比较；MISC 偏移表静态检查；ALTM / XLAB / XMIC 访问器（WORKPLAN WP2 验收）。
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZES, MISC, MISC_BYTES, WRITE_ORDER, cohortOffset, miscGet, miscSet } from '../../contracts/io';
import type { MiscKey } from '../../contracts/io';
import { createPrng } from '../../contracts/prng';
import { tileIndex } from '../../contracts/grid';
import { parseIff } from './iff';
import { altmPack, altmSplit, getLabel, getXmic, readCohorts, setLabel, setXmic, writeCohorts, MISC_HEADER_VALUE } from './misc';
import { newDocument } from './newDocument';
import { readSc2 } from './sc2Read';
import { writeSc2 } from './sc2Write';
import { sc2Codec } from './index';

/** 手工样例：每层填不同的确定性图案（含长重复段与随机段），情景 chunk 与未知 chunk 齐全。 */
function sampleDoc(seed: number) {
  const prng = createPrng(seed);
  const doc = newDocument();
  doc.cityName = 'Harborlight';
  for (let k = 0; k < doc.misc.length; k++) doc.misc[k] = k % 7 === 0 ? -(k * 1000) : k;
  miscSet(doc.misc, MISC.header, MISC_HEADER_VALUE);
  for (let i = 0; i < doc.altm.length; i++) doc.altm[i] = altmPack(i & 31, (i >> 5) & 31, i % 97 === 0 ? 3 : 0);
  const fillLayer = (a: Uint8Array, mode: number): void => {
    for (let i = 0; i < a.length; i++) {
      const block = i >> 7;
      a[i] = mode === 0 ? (block & 3) === 0 ? prng.int(256) : block & 0xff : mode === 1 ? (i & 1 ? 0xaa : 0x55) : (i % 300 < 150 ? 0 : 0x3e);
    }
  };
  fillLayer(doc.xter, 0); fillLayer(doc.xbld, 1); fillLayer(doc.xzon, 2); fillLayer(doc.xund, 0); fillLayer(doc.xtxt, 1); fillLayer(doc.xbit, 2);
  fillLayer(doc.xlab, 0); fillLayer(doc.xmic, 1); fillLayer(doc.xthg, 2);
  fillLayer(doc.xtrf, 0); fillLayer(doc.xplt, 1); fillLayer(doc.xval, 2); fillLayer(doc.xcrm, 0);
  fillLayer(doc.xplc, 1); fillLayer(doc.xfir, 2); fillLayer(doc.xpop, 0); fillLayer(doc.xrog, 1);
  for (let k = 0; k < doc.xgrp.length; k++) doc.xgrp[k] = (k * 7919) | 0;
  // 校验和字段与图层一致，避免 info 诊断
  let sv = 0, sc = 0;
  for (let k = 0; k < doc.xval.length; k++) sv += doc.xval[k]!;
  for (let k = 0; k < doc.xcrm.length; k++) sc += doc.xcrm[k]!;
  miscSet(doc.misc, MISC.landValueSum, sv); miscSet(doc.misc, MISC.crimeSum, sc);
  doc.scenario = {
    texts: [{ kind: 0x80000000, text: 'Line one\nLine two' }, { kind: 0x81000000, text: 'Long brief\n\nwith blank line' }],
    scen: Uint8Array.from({ length: 56 }, (_, k) => (k * 13) & 0xff),
    pict: Uint8Array.from({ length: 4 + 66 * 65 }, (_, k) => (k * 3) & 0xff),
    tmpl: Uint8Array.from({ length: 338 }, (_, k) => k & 0xff),
  };
  doc.unknownChunks.push({ id: 'ZZZZ', data: Uint8Array.from([1, 2, 3, 4, 5]) });
  return doc;
}

describe('io/sc2 roundtrip', () => {
  it('readSc2(writeSc2(doc)) 深相等（含情景 chunk 与未知 chunk），且无诊断', () => {
    const doc = sampleDoc(1);
    const buf = writeSc2(doc);
    const { value, diagnostics } = readSc2(buf);
    expect(diagnostics.filter((d) => d.level !== 'info')).toEqual([]);
    expect(diagnostics.map((d) => d.code)).toEqual(['sc2.unknownChunk']);
    expect(value).toEqual(doc);
    // 再往返一次字节级稳定
    expect(new Uint8Array(writeSc2(value))).toEqual(new Uint8Array(buf));
  });
  it('写出顺序 = WRITE_ORDER（情景 chunk 在末尾、TEXT 两次），未知 chunk 追加在最后；MISC / XTER 已压缩、CNAM / ALTM 未压缩', () => {
    const doc = sampleDoc(2);
    const chunks = parseIff(writeSc2(doc)).chunks;
    const ids = chunks.map((c) => c.id);
    expect(ids).toEqual([...WRITE_ORDER.slice(0, 21), 'TEXT', 'TEXT', 'SCEN', 'PICT', 'TMPL', 'ZZZZ']);
    const byId = new Map(chunks.map((c) => [c.id, c.data]));
    expect(byId.get('CNAM')!.length).toBe(32);
    expect(byId.get('ALTM')!.length).toBe(CHUNK_SIZES.ALTM);
    expect(byId.get('MISC')!.length).not.toBe(CHUNK_SIZES.MISC);   // 压缩后长度不同
    expect(byId.get('CNAM')![0]).toBe(0x1f);
  });
  it('非情景文档不写 TEXT / SCEN / PICT / TMPL；MISC 头为 0 时写出补 0x122', () => {
    const doc = newDocument();
    doc.misc[0] = 0;
    const chunks = parseIff(writeSc2(doc)).chunks;
    expect(chunks.map((c) => c.id)).toEqual(WRITE_ORDER.slice(0, 21));
    expect(miscGet(readSc2(writeSc2(doc)).value.misc, MISC.header)).toBe(MISC_HEADER_VALUE);
  });
  it('newDocument：全零（MISC 头除外）、尺寸按 CHUNK_SIZES；sc2Codec 三个入口可用', () => {
    const d = sc2Codec.newDocument();
    expect(d.misc.length).toBe(CHUNK_SIZES.MISC / 4); expect(d.altm.length).toBe(CHUNK_SIZES.ALTM / 2); expect(d.xgrp.length).toBe(CHUNK_SIZES.XGRP / 4);
    expect(d.xter.length).toBe(16384); expect(d.xlab.length).toBe(6400); expect(d.xmic.length).toBe(1200); expect(d.xthg.length).toBe(480);
    expect(d.xtrf.length).toBe(4096); expect(d.xplc.length).toBe(1024);
    expect(miscGet(d.misc, MISC.header)).toBe(MISC_HEADER_VALUE);
    expect(d.misc.filter((v) => v !== 0)).toHaveLength(1);
    expect(d.cityName).toBe(''); expect(d.unknownChunks).toEqual([]); expect(d.scenario).toBeUndefined();
    const r = sc2Codec.readSc2(sc2Codec.writeSc2(d));
    expect(r.value).toEqual(d);
  });
  it('线性索引不转置：ALTM[tileIndex(x,y)] 往返后仍在 (x,y)，且 (3,5) ≠ (5,3)', () => {
    const doc = newDocument();
    doc.altm[tileIndex(3, 5)] = altmPack(7, 7, 0);
    doc.altm[tileIndex(5, 3)] = altmPack(9, 9, 0);
    const v = readSc2(writeSc2(doc)).value;
    expect(altmSplit(v.altm[tileIndex(3, 5)]!).alt).toBe(7);
    expect(altmSplit(v.altm[tileIndex(5, 3)]!).alt).toBe(9);
    expect(tileIndex(3, 5)).toBe(3 * 128 + 5);
  });
});

describe('io/sc2 misc：偏移表与访问器', () => {
  const keys = Object.keys(MISC) as MiscKey[];
  it('cohortOffset(19, leSum) + 4 == MISC.industryGraph', () => {
    expect(cohortOffset(19, 'leSum') + 4).toBe(MISC.industryGraph);
  });
  it('偏移表无重叠且 4 字节对齐，全部落在 4800 B 内', () => {
    const entries = keys.map((k) => ({ k, a: MISC[k], b: MISC[k] + MISC_BYTES[k] })).sort((x, y) => x.a - y.a);
    for (const e of entries) { expect(e.a % 4, e.k).toBe(0); expect(e.b).toBeLessThanOrEqual(CHUNK_SIZES.MISC); }
    for (let i = 1; i < entries.length; i++) expect(entries[i - 1]!.b, `${entries[i - 1]!.k}/${entries[i]!.k}`).toBeLessThanOrEqual(entries[i]!.a);
  });
  it('ALTM 拆位 / 打包互逆；掩码按 spec:terrain §2.3', () => {
    for (const [alt, wl, tun] of [[0, 0, 0], [31, 31, 63], [4, 7, 1], [17, 2, 40]] as const) {
      const v = altmPack(alt, wl, tun);
      expect(altmSplit(v)).toEqual({ alt, waterLevel: wl, tunnelLevels: tun });
    }
    expect(altmPack(0x1f, 0, 0)).toBe(0x001f); expect(altmPack(0, 0x1f, 0)).toBe(0x03e0); expect(altmPack(0, 0, 0x3f)).toBe(0xfc00);
  });
  it('XLAB 标签：[len][≤23 B][0 填充]，读时按 len 并在首个 0 截断，忽略填充垃圾', () => {
    const xlab = new Uint8Array(6400).fill(0xee);                 // 模拟垃圾填充
    setLabel(xlab, 3, 'Mayor Quill');
    expect(getLabel(xlab, 3)).toBe('Mayor Quill');
    expect(xlab[3 * 25]).toBe(11);
    expect(xlab[3 * 25 + 24]).toBe(0);
    setLabel(xlab, 4, 'A'.repeat(40));
    expect(getLabel(xlab, 4)).toBe('A'.repeat(23));
    xlab.set([5, 0x41, 0x42, 0x00, 0x43, 0x44], 5 * 25);          // len 5 但第 3 字节为 0
    expect(getLabel(xlab, 5)).toBe('AB');
    expect(getLabel(xlab, 300)).toBe('');
  });
  it('XMIC 记录 8 B：tileId u8、stat0 u8、stat1–3 u16 BE', () => {
    const xmic = new Uint8Array(1200);
    setXmic(xmic, 2, { tileId: 0xd2, stat0: 9, stat1: 0x1234, stat2: 0xffff, stat3: 7 });
    expect(Array.from(xmic.subarray(16, 24))).toEqual([0xd2, 9, 0x12, 0x34, 0xff, 0xff, 0, 7]);
    expect(getXmic(xmic, 2)).toEqual({ tileId: 0xd2, stat0: 9, stat1: 0x1234, stat2: 0xffff, stat3: 7 });
  });
  it('年龄队列读写互逆，且只触及 0x007C–0x016B', () => {
    const m = new Int32Array(1200);
    const cohorts = Array.from({ length: 20 }, (_, k) => ({ count: 100 + k, eqSum: 2000 + k, leSum: 3000 + k }));
    writeCohorts(m, cohorts);
    expect(readCohorts(m)).toEqual(cohorts);
    expect(m[(MISC.cohorts >> 2) - 1]).toBe(0); expect(m[MISC.industryGraph >> 2]).toBe(0);
    expect(miscGet(m, cohortOffset(19, 'leSum'))).toBe(3019);
  });
});

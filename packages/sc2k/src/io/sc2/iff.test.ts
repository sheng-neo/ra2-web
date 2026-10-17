// io/sc2/iff.test.ts —— 容器：Mac 头 / Classic 拒绝 / 无填充 / 截断容错 / 非 SC2（WORKPLAN WP2 验收）。
import { describe, expect, it } from 'vitest';
import { ByteWriter } from './bytes';
import { Sc2FormatError, buildIff, parseIff } from './iff';
import type { IffChunk } from './iff';
import { newDocument } from './newDocument';
import { readSc2 } from './sc2Read';
import { writeSc2 } from './sc2Write';

const chunk = (id: string, bytes: number[]): IffChunk => ({ id, data: Uint8Array.from(bytes) });
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

describe('io/sc2 iff：容器', () => {
  it('buildIff → parseIff 往返；奇数长度 chunk 无填充字节；FORM 长度 = 总长 − 8', () => {
    const chunks = [chunk('CNAM', [0x1f, ...ascii('A'), 0]), chunk('MISC', [1, 2, 3]), chunk('XTER', [9])];
    const buf = buildIff(chunks);
    const u8 = new Uint8Array(buf);
    expect(u8.length).toBe(12 + (8 + 3) + (8 + 3) + (8 + 1));
    expect(new DataView(buf).getUint32(4, false)).toBe(u8.length - 8);
    expect(String.fromCharCode(...u8.subarray(0, 4))).toBe('FORM');
    expect(String.fromCharCode(...u8.subarray(8, 12))).toBe('SCDH');
    // 第二个 chunk 紧随第一个（3 字节数据后没有填充）
    expect(String.fromCharCode(...u8.subarray(12 + 8 + 3, 12 + 8 + 3 + 4))).toBe('MISC');
    const parsed = parseIff(buf);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.chunks.map((c) => [c.id, Array.from(c.data)])).toEqual(chunks.map((c) => [c.id, Array.from(c.data)]));
  });
  it('Mac 版：前 128 字节 MacBinary 头被剥离，文件名作为 macName', () => {
    const inner = new Uint8Array(buildIff([chunk('MISC', [7, 7])]));
    const w = new ByteWriter();
    w.u8(0); w.u8(6); w.ascii('MACCTY'); w.zeros(128 - 8); w.bytes(inner);
    const parsed = parseIff(w.toArrayBuffer());
    expect(parsed.macName).toBe('MACCTY');
    expect(parsed.chunks).toHaveLength(1);
    expect(parsed.diagnostics.some((d) => d.code === 'sc2.macHeader')).toBe(true);
  });
  it('SimCity Classic 存档：00 0D + 0x41 处 CITYMCRP → UNSUPPORTED_CLASSIC', () => {
    const b = new Uint8Array(0x60);
    b[0] = 0x00; b[1] = 0x0d; b.set(ascii('CITYMCRP'), 0x41);
    expect(() => parseIff(b)).toThrowError(Sc2FormatError);
    try { parseIff(b); } catch (e) { expect((e as Sc2FormatError).code).toBe('UNSUPPORTED_CLASSIC'); }
  });
  it('非 SC2（无 FORM / 无 SCDH / 过短）→ NOT_SC2', () => {
    expect(() => parseIff(Uint8Array.from(ascii('RIFF....WAVE')))).toThrowError(/FORM/);
    const w = new ByteWriter(); w.ascii('FORM'); w.u32be(4); w.ascii('XXXX');
    expect(() => parseIff(w.toArrayBuffer())).toThrowError(/SCDH/);
    expect(() => parseIff(Uint8Array.from(ascii('FORM')))).toThrowError(Sc2FormatError);
  });
  it('截断容错：chunk 数据不足 → 告警并截断；尾部不足 8 字节的碎片忽略；声明长度不符告警', () => {
    const full = new Uint8Array(buildIff([chunk('MISC', [1, 2, 3, 4, 5, 6]), chunk('XTER', [9, 9])]));
    const cut = full.subarray(0, 12 + 8 + 4);                    // MISC 只剩 4 字节
    const parsed = parseIff(cut);
    expect(parsed.chunks).toHaveLength(1);
    expect(Array.from(parsed.chunks[0]!.data)).toEqual([1, 2, 3, 4]);
    expect(parsed.diagnostics.some((d) => d.code === 'sc2.truncatedChunk')).toBe(true);
    expect(parsed.diagnostics.some((d) => d.code === 'sc2.sizeMismatch')).toBe(true);
    const frag = full.subarray(0, 12 + 8 + 6 + 3);               // 第二个 chunk 头不完整
    expect(parseIff(frag).chunks).toHaveLength(1);
  });
  it('chunk id 含非 ASCII 字符 → BAD_CHUNK_ID', () => {
    const b = new Uint8Array(buildIff([chunk('MISC', [1])]));
    b[12] = 0x01;
    expect(() => parseIff(b)).toThrowError(/chunk id/);
  });
});

describe('io/sc2 readSc2：诊断与容错', () => {
  it('缺少必需 chunk → MISSING_CHUNK', () => {
    const buf = buildIff([chunk('MISC', [0x81, 0x00])]);
    expect(() => readSc2(buf)).toThrowError(/缺少必需 chunk/);
  });
  it('缺 CNAM 时城市名取自文件名（大写、去扩展名、≤31 字节）；MISC 头不为 0x122 时告警；未知 chunk 原样保留', () => {
    const doc = newDocument();
    doc.misc[0] = 5;                                            // 非 0 且 ≠ 0x122：writeSc2 原样写出（只有 0 会被补成 0x122）
    const base = new Uint8Array(writeSc2(doc));
    // 去掉 CNAM（前 8 + 32 字节）并追加一个未知 chunk
    const parsed = parseIff(base);
    const rest = parsed.chunks.filter((c) => c.id !== 'CNAM');
    rest.push(chunk('ZZZZ', [1, 2, 3]));
    const r = readSc2(buildIff(rest), 'dir/sub/my_city.sc2');
    expect(r.value.cityName).toBe('MY_CITY');
    expect(r.diagnostics.some((d) => d.code === 'sc2.miscHeader')).toBe(true);
    expect(r.diagnostics.some((d) => d.code === 'sc2.nameFromFile')).toBe(true);
    expect(r.value.unknownChunks).toEqual([{ id: 'ZZZZ', data: Uint8Array.from([1, 2, 3]) }]);
    // 再写出时未知 chunk 仍在
    const again = readSc2(writeSc2(r.value));
    expect(again.value.unknownChunks).toHaveLength(1);
  });
  it('压缩 chunk 解压长度差 1 字节 → 补零 / 截断并告警，不抛错；ALTM 未压缩长度不足 → 补零并告警', () => {
    const doc = newDocument();
    const parsed = parseIff(writeSc2(doc));
    const patched = parsed.chunks.map((c) => {
      if (c.id === 'XTER') return chunk('XTER', [0xff, 0x00, 0xff, 0x00, 0x02, 0x05, 0x06]);   // 128+128+2 = 258 字节 ≠ 16384
      if (c.id === 'ALTM') return chunk('ALTM', Array.from(c.data.subarray(0, 100)));
      return c;
    });
    const r = readSc2(buildIff(patched));
    expect(r.value.xter.length).toBe(16384);
    expect(r.value.xter[256]).toBe(5); expect(r.value.xter[257]).toBe(6); expect(r.value.xter[258]).toBe(0);
    expect(r.value.altm.length).toBe(16384);
    expect(r.diagnostics.some((d) => d.code === 'sc2.rleLength' && d.at === 'XTER')).toBe(true);
    expect(r.diagnostics.some((d) => d.code === 'sc2.chunkLength' && d.at === 'ALTM')).toBe(true);
  });
  it('CNAM：首字节长度不可信，只取到首个 0；非 ASCII 名按 UTF-8 往返', () => {
    const doc = newDocument();
    const bytes = new Uint8Array(writeSc2(doc));
    // CNAM 数据从 12+8 开始：伪造长度字节 0x05 但文本 "AB\0CD"
    bytes.set([0x05, 0x41, 0x42, 0x00, 0x43, 0x44], 20);
    expect(readSc2(bytes.buffer).value.cityName).toBe('AB');
    doc.cityName = '新城·Test';
    expect(readSc2(writeSc2(doc)).value.cityName).toBe('新城·Test');
    doc.cityName = 'X'.repeat(40);
    expect(readSc2(writeSc2(doc)).value.cityName).toBe('X'.repeat(31));
  });
  it('Mac 文件无 CNAM 时城市名取自 MacBinary 头', () => {
    const doc = newDocument();
    const inner = parseIff(writeSc2(doc)).chunks.filter((c) => c.id !== 'CNAM');
    const body = new Uint8Array(buildIff(inner));
    const w = new ByteWriter(); w.u8(0); w.u8(4); w.ascii('Oldy'); w.zeros(128 - 6); w.bytes(body);
    expect(readSc2(w.toArrayBuffer()).value.cityName).toBe('Oldy');
  });
});

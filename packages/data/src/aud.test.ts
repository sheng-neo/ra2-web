import { describe, it, expect } from 'vitest';
import { parseAud } from './aud';

/** 构造一个 IMA-ADPCM(99)、16bit 单声道 AUD：给定若干分块的原始数据字节。 */
function buildAud(chunks: number[][], sampleRate = 22050): Uint8Array {
  const dataSize = chunks.reduce((n, c) => n + 8 + c.length, 0);
  const outSize = chunks.reduce((n, c) => n + c.length * 4, 0);
  const buf = new Uint8Array(12 + dataSize);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, sampleRate, true);
  dv.setUint32(2, dataSize, true);
  dv.setUint32(6, outSize, true);
  dv.setUint8(10, 2); // flags: 16bit mono
  dv.setUint8(11, 99); // IMA-ADPCM
  let off = 12;
  for (const c of chunks) {
    dv.setUint16(off, c.length, true);
    dv.setUint16(off + 2, c.length * 4, true);
    dv.setUint32(off + 4, 0x0000deaf, true);
    off += 8;
    for (const b of c) buf[off++] = b;
  }
  return buf;
}

describe('AUD (Westwood IMA-ADPCM) 解码', () => {
  it('解析头部字段', () => {
    const a = parseAud(buildAud([[0]], 11025));
    expect(a.sampleRate).toBe(11025);
    expect(a.channels).toBe(1);
    expect(a.bitsPerSample).toBe(16);
  });

  it('每字节解码出两个采样（低 nibble 先、高 nibble 后）', () => {
    // 全零字节：预测值/索引始终为 0 → 全零采样
    expect(Array.from(parseAud(buildAud([[0x00, 0x00]])).samples)).toEqual([0, 0, 0, 0]);
    // 0x04：低 nibble=4 → +7（index→2）；高 nibble=0 → +1 → 8
    expect(Array.from(parseAud(buildAud([[0x04]])).samples)).toEqual([7, 8]);
    // 0x0C：低 nibble=12(含符号位) → -7（index→2）；高 nibble=0 → +1 → -6
    expect(Array.from(parseAud(buildAud([[0x0c]])).samples)).toEqual([-7, -6]);
  });

  it('IMA 状态跨分块连续（不每块重置）', () => {
    // 两块各 [0x04]：第二块从 index=1,sample=8 继续 → [17,18]
    expect(Array.from(parseAud(buildAud([[0x04], [0x04]])).samples)).toEqual([7, 8, 17, 18]);
  });

  it('非 IMA 压缩类型抛错', () => {
    const b = buildAud([[0]]);
    b[11] = 1; // WS-ADPCM
    expect(() => parseAud(b)).toThrow();
  });

  it('截断文件只产出已解出的采样、不崩溃', () => {
    const full = buildAud([[0x04, 0x04, 0x04]]);
    const truncated = full.subarray(0, full.length - 2); // 砍掉尾部数据
    const a = parseAud(truncated);
    expect(a.samples.length).toBeLessThan(6);
    expect(a.samples.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { BufferSource } from './source';
import { MixFile } from './mix';
import { buildMix } from './mix-fixtures';

const enc = new TextEncoder();

describe('MixFile', () => {
  const files = [
    { name: 'rules.ini', data: enc.encode('[General]\nName=test\n') },
    { name: 'art.ini', data: enc.encode('[ART]\n') },
    { name: 'cameo.pal', data: new Uint8Array(768).fill(42) },
  ];

  it('解析明文新式头并按名取文件', async () => {
    const mix = await MixFile.open(new BufferSource(buildMix(files)));
    expect(mix.fileCount).toBe(3);
    expect(mix.hasFile('RULES.INI')).toBe(true);
    expect(mix.hasFile('nothing.txt')).toBe(false);
    const rules = await mix.readFile('rules.ini');
    expect(new TextDecoder().decode(rules)).toContain('[General]');
    const pal = await mix.readFile('cameo.pal');
    expect(pal.length).toBe(768);
    expect(pal[0]).toBe(42);
  });

  it('解析加密头（RSA + Blowfish 全链路）', async () => {
    const mix = await MixFile.open(new BufferSource(buildMix(files, { encrypted: true })));
    expect(mix.fileCount).toBe(3);
    const rules = await mix.readFile('rules.ini');
    expect(new TextDecoder().decode(rules)).toContain('Name=test');
  });

  it('嵌套 mix：子 mix 经零拷贝切片打开', async () => {
    const inner = buildMix([{ name: 'local.txt', data: enc.encode('inner!') }]);
    const outer = buildMix([
      { name: 'cache.mix', data: inner },
      { name: 'other.dat', data: enc.encode('x') },
    ], { encrypted: true });
    const outerMix = await MixFile.open(new BufferSource(outer));
    const innerMix = await outerMix.openMix('cache.mix');
    expect(new TextDecoder().decode(await innerMix.readFile('local.txt'))).toBe('inner!');
  });

  it('解析旧式头（无 flags，首 u16 为文件数）', async () => {
    // 手工构造：u16 count, u32 dataSize, 1 条目, 数据
    const body = enc.encode('old');
    const buf = new Uint8Array(6 + 12 + body.length);
    const v = new DataView(buf.buffer);
    v.setUint16(0, 1, true);
    v.setUint32(2, body.length, true);
    v.setUint32(6, 0x12345678, true);
    v.setUint32(10, 0, true);
    v.setUint32(14, body.length, true);
    buf.set(body, 18);
    const mix = await MixFile.open(new BufferSource(buf));
    expect(mix.fileCount).toBe(1);
    expect(new TextDecoder().decode(await mix.readFile(0x12345678))).toBe('old');
  });
});

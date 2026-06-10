import { describe, expect, it } from 'vitest';
import { crc32, mixIdRA2, padMixName } from './crc32';

describe('crc32', () => {
  it('标准校验向量', () => {
    const bytes = new TextEncoder().encode('123456789');
    expect(crc32(bytes)).toBe(0xcbf43926);
  });

  it('空输入', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('padMixName（TS/RA2 补位规则）', () => {
  it('长度为 4 的倍数时只做大写', () => {
    expect(padMixName('ra2.mix1')).toBe('RA2.MIX1');
  });

  it('补位：追加 (len&3) 再重复末块首字符', () => {
    // "RULES.INI" 长 9：a=2，追加 \x01，再补 2 个 name[8]='I'
    expect(padMixName('rules.ini')).toBe('RULES.INIII');
    // 长 5：追加 \x01 + 2 个 name[4]
    expect(padMixName('abcde')).toBe('ABCDEEE');
    // 长 6：追加 \x02 + 1 个 name[4]
    expect(padMixName('abcdef')).toBe('ABCDEFE');
    // 长 7：追加 \x03，无重复字符
    expect(padMixName('abcdefg')).toBe('ABCDEFG');
  });
});

describe('mixIdRA2', () => {
  it('与手工 CRC 一致（4 倍数长度）', () => {
    const id = mixIdRA2('test.mix');
    expect(id).toBe(crc32(new TextEncoder().encode('TEST.MIX')));
  });

  it('大小写不敏感', () => {
    expect(mixIdRA2('Rules.Ini')).toBe(mixIdRA2('RULES.INI'));
  });
});

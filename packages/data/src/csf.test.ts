import { describe, expect, it } from 'vitest';
import { parseCsf } from './csf';

function buildCsf(entries: { label: string; text: string; extra?: string }[]): Uint8Array {
  const chunks: number[] = [];
  const pushAscii = (s: string) => {
    for (let i = 0; i < s.length; i++) chunks.push(s.charCodeAt(i) & 0xff);
  };
  const pushU32 = (v: number) => {
    chunks.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  };
  pushAscii(' FSC');
  pushU32(3);
  pushU32(entries.length);
  pushU32(entries.length);
  pushU32(0);
  pushU32(0);
  for (const e of entries) {
    pushAscii(' LBL');
    pushU32(1);
    pushU32(e.label.length);
    pushAscii(e.label);
    pushAscii(e.extra !== undefined ? 'WRTS' : ' RTS');
    pushU32(e.text.length);
    for (let i = 0; i < e.text.length; i++) {
      const code = e.text.charCodeAt(i);
      chunks.push(~code & 0xff, ~(code >>> 8) & 0xff);
    }
    if (e.extra !== undefined) {
      pushU32(e.extra.length);
      pushAscii(e.extra);
    }
  }
  return new Uint8Array(chunks);
}

describe('parseCsf', () => {
  it('解析普通与带附加值的条目（含中文）', () => {
    const csf = parseCsf(
      buildCsf([
        { label: 'Name:E1', text: '美国大兵' },
        { label: 'GUI:OK', text: 'OK', extra: 'sound.wav' },
      ]),
    );
    expect(csf.strings.get('name:e1')).toBe('美国大兵');
    expect(csf.strings.get('gui:ok')).toBe('OK');
  });

  it('标签大小写不敏感存取', () => {
    const csf = parseCsf(buildCsf([{ label: 'NAME:Rhino', text: '犀牛坦克' }]));
    expect(csf.strings.get('name:rhino')).toBe('犀牛坦克');
  });

  it('拒绝坏魔数', () => {
    expect(() => parseCsf(new Uint8Array(24))).toThrow();
  });
});

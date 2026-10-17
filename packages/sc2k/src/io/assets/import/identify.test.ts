// WP14 验收：identify 的魔数表（§3.9.3）；文件名不符按魔数采信；文件名符但魔数失败 → UNKNOWN + BAD_MAGIC。
import { describe, expect, it } from 'vitest';
import { HEAD_BYTES, identify, identifyBytes, identifyFile, kindByName, sniffMagic } from './identify';
import { synthSpriteSet } from '../sprites/__fixtures__/synth';
import { writePaletteBmp } from '../palette/bmp';

const synth = synthSpriteSet();
const head = (buf: ArrayBuffer): Uint8Array => new Uint8Array(buf).slice(0, HEAD_BYTES);
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const sc2Head = (at = 0): Uint8Array => { const b = new Uint8Array(HEAD_BYTES); b.set(ascii('FORM'), at); b.set([0, 1, 0, 0], at + 4); b.set(ascii('SCDH'), at + 8); b.set(ascii('CNAM'), at + 12); return b; };
const mifHead = (): Uint8Array => { const b = new Uint8Array(HEAD_BYTES); b.set(ascii('MIFF')); b.set([0, 0, 1, 0], 4); b.set(ascii('SC2K'), 8); return b; };
const idxBytes = (): Uint8Array => { const b = new Uint8Array(48); const dv = new DataView(b.buffer); for (let k = 0; k < 6; k++) { dv.setUint32(k * 8, k + 1, true); dv.setUint32(k * 8 + 4, 100 * (k + 1), true); } return b; };
const text = new Uint8Array(ascii('hello, this is not a game file at all.............................'));

describe('kindByName', () => {
  it('不分大小写、取路径末段、按扩展名识别存档 / 情景 / MIF', () => {
    expect(kindByName('DATA/LARGE.DAT')).toBe('LARGE');
    expect(kindByName('c:\\game\\data\\smallmed.dat')).toBe('SMALLMED');
    expect(kindByName('Special.Dat')).toBe('SPECIAL');
    expect(kindByName('BITMAPS/pal_mstr.bmp')).toBe('PAL_MSTR');
    expect(kindByName('PAL_STTC.BMP')).toBe('PAL_STTC');
    expect(kindByName('PAL_MAC.BMP')).toBe('PAL_MAC');
    expect(kindByName('DATA_USA.IDX')).toBe('DATA_USA_IDX');
    expect(kindByName('TEXT_USA.DAT')).toBe('TEXT_USA_DAT');
    expect(kindByName('cities/MyTown.sc2')).toBe('SC2');
    expect(kindByName('x.SCN')).toBe('SCN');
    expect(kindByName('custom.mif')).toBe('MIF');
    expect(kindByName('readme.txt')).toBe('UNKNOWN');
    expect(kindByName('LARGE.DAT.bak')).toBe('UNKNOWN');
  });
});

describe('sniffMagic（只看字节）', () => {
  it('精灵文件按 ID 段分 large / small；调色板 BMP；FORM/SCDH（含 Mac 0x80）；MIFF/SC2K；DATA_USA.IDX', () => {
    expect(sniffMagic(head(synth.large), synth.large.byteLength).family).toBe('sprite-large');
    expect(sniffMagic(head(synth.smallmed), synth.smallmed.byteLength).family).toBe('sprite-small');
    expect(sniffMagic(head(synth.special), synth.special.byteLength).family).toBe('sprite-small');
    expect(sniffMagic(head(synth.palette), synth.palette.byteLength).family).toBe('palette');
    expect(sniffMagic(sc2Head(), 100000).family).toBe('sc2');
    expect(sniffMagic(sc2Head(0x80), 100000)).toEqual({ family: 'sc2', note: 'mac' });
    expect(sniffMagic(mifHead(), 5000).family).toBe('mif');
    expect(sniffMagic(idxBytes(), 48).family).toBe('data-idx');
    expect(sniffMagic(text, text.length).family).toBe('none');
    // 声明 count 超过文件长 / 首条偏移落在索引区内 → 不是精灵文件
    const bogus = new Uint8Array(HEAD_BYTES); bogus[1] = 1; bogus.set([0x03, 0xe9, 0, 0, 0, 2, 0, 3, 0, 4], 2);
    expect(sniffMagic(bogus, 40).family).toBe('none');
  });
});

describe('identify（名字 + 魔数）', () => {
  it('名字与魔数一致 → 名字种类，无诊断', () => {
    for (const [name, buf, kind] of [['DATA/LARGE.DAT', synth.large, 'LARGE'], ['smallmed.dat', synth.smallmed, 'SMALLMED'], ['SPECIAL.DAT', synth.special, 'SPECIAL'], ['PAL_MSTR.BMP', synth.palette, 'PAL_MSTR'], ['pal_sttc.bmp', synth.palette, 'PAL_STTC']] as const) {
      const r = identifyBytes(name, buf.byteLength, head(buf));
      expect(r.kind, name).toBe(kind);
      expect(r.byMagicOnly).toBe(false);
      expect(r.diagnostics).toEqual([]);
    }
    expect(identifyBytes('town.sc2', 99999, sc2Head()).kind).toBe('SC2');
    expect(identifyBytes('quest.scn', 99999, sc2Head()).kind).toBe('SCN');
    expect(identifyBytes('a.mif', 5000, mifHead()).kind).toBe('MIF');
    expect(identifyBytes('DATA_USA.IDX', 48, idxBytes()).kind).toBe('DATA_USA_IDX');
    expect(identifyBytes('DATA_USA.DAT', 12345, text).kind).toBe('DATA_USA_DAT');     // 只按名字
    expect(identifyBytes('TEXT_USA.IDX', 400, text).kind).toBe('TEXT_USA_IDX');
  });

  it('文件名不符 → 按魔数采信并记 IDENTIFIED_BY_MAGIC', () => {
    const r1 = identifyBytes('whatever.bin', synth.large.byteLength, head(synth.large));
    expect(r1.kind).toBe('LARGE'); expect(r1.byMagicOnly).toBe(true);
    expect(r1.diagnostics.map((d) => d.code)).toEqual(['IDENTIFIED_BY_MAGIC']);
    expect(identifyBytes('x.bin', synth.smallmed.byteLength, head(synth.smallmed)).kind).toBe('SMALLMED');
    expect(identifyBytes('colors.bmp', synth.palette.byteLength, head(synth.palette)).kind).toBe('PAL_MSTR');
    expect(identifyBytes('oldsave.dat', 99999, sc2Head()).kind).toBe('SC2');
    expect(identifyBytes('shape.bin', 5000, mifHead()).kind).toBe('MIF');
    expect(identify('x.bin', synth.large.byteLength, head(synth.large))).toBe('LARGE');
  });

  it('文件名像 A 内容是 B → 按内容并记 NAME_MISMATCH（warn）；名字只认文本库但内容是 BMP 也按内容', () => {
    const r = identifyBytes('LARGE.DAT', synth.smallmed.byteLength, head(synth.smallmed));
    expect(r.kind).toBe('SMALLMED');
    expect(r.diagnostics.map((d) => [d.code, d.level])).toEqual([['NAME_MISMATCH', 'warn']]);
    const r2 = identifyBytes('PAL_MSTR.BMP', synth.large.byteLength, head(synth.large));
    expect(r2.kind).toBe('LARGE');
    const r3 = identifyBytes('DATA_USA.DAT', synth.palette.byteLength, head(synth.palette));
    expect(r3.kind).toBe('PAL_MSTR');
    expect(r3.diagnostics[0]!.code).toBe('NAME_MISMATCH');
  });

  it('文件名匹配但魔数失败 → UNKNOWN + BAD_MAGIC；两者都不认识 → UNKNOWN_FILE', () => {
    const r = identifyBytes('LARGE.DAT', text.length, text);
    expect(r.kind).toBe('UNKNOWN');
    expect(r.diagnostics.map((d) => [d.code, d.level])).toEqual([['BAD_MAGIC', 'error']]);
    // 24 bpp 的 BMP 冒充调色板
    const bmp24 = new Uint8Array(writePaletteBmp(new Uint8Array(768)));
    bmp24[28] = 24;
    const r2 = identifyBytes('PAL_MSTR.BMP', bmp24.length, bmp24.slice(0, HEAD_BYTES));
    expect(r2.kind).toBe('UNKNOWN');
    expect(r2.diagnostics[0]!.code).toBe('BAD_MAGIC');
    expect(r2.diagnostics[0]!.message).toContain('24');
    const r3 = identifyBytes('notes.txt', text.length, text);
    expect(r3.kind).toBe('UNKNOWN');
    expect(r3.diagnostics.map((d) => d.code)).toEqual(['UNKNOWN_FILE']);
  });

  it('identifyFile 读取 File 的前 HEAD_BYTES 字节', async () => {
    const f = new File([new Uint8Array(synth.large)], 'LARGE.DAT', { lastModified: 1234 });
    const { identified, result } = await identifyFile(f);
    expect(identified).toMatchObject({ kind: 'LARGE', name: 'LARGE.DAT', size: synth.large.byteLength, lastModified: 1234 });
    expect(identified.file).toBe(f);
    expect(result.byMagicOnly).toBe(false);
  });
});

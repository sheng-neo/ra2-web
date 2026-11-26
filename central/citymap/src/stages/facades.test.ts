import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Building, SensitiveZone } from '@central/data';
import { sha256Hex } from '../geo/hash';
import { FACADES_VERSION, LANDSD_FACADES_FILE, attachFacades, geometryKey, readFacades, validRecord, verifyFacadeFiles, type FacadesDoc } from './facades';

const bld = (id: string, x0: number, extra: Partial<Building> = {}): Building => ({
  id,
  src: 'landsd',
  footprint: { outer: [x0, 0, x0 + 100, 0, x0 + 100, 100, x0, 100] },
  base: 50,
  height: 300,
  heightSource: 'landsd',
  kind: 'tower',
  style: 3,
  ...extra,
});

const page = new Uint8Array([1, 2, 3, 4]);
const far = new Uint8Array([5, 6]);
const farLow = new Uint8Array([7]);
const entry = (file: string, bytes: Uint8Array) => ({ file, sha256: sha256Hex(bytes), bytes: bytes.byteLength });

function doc(buildings: FacadesDoc['buildings']): FacadesDoc {
  return {
    format: 'central-3dvm-facades',
    version: FACADES_VERSION,
    params: { page: 1024, pad: 4, tile: 1016, densityQ: 16 },
    pages: [entry('p000-aaaa.webp', page)],
    far: { cols: 16, rows: 1, cell: 128, full: entry('far-bbbb.webp', far), low: entry('far-low-cccc.webp', farLow) },
    buildings,
    excluded: { scaffold: [{ id: 'zz', green: 0.2 }], sensitive: [] },
  };
}

const REC = [64, 48, 0, 10, 20, 1, 0, 4, 4, 0, 0, 100, 50];

describe('geometryKey', () => {
  it('与烘焙脚本 geometry_key 逐字一致（Python 算出的金样）', () => {
    const b = {
      id: 'abc',
      footprint: { outer: [0, 0, 100, 0, 100, -50, 0, 50], holes: [[10, 10, 20, 10, 20, 20]] },
      base: 52,
      height: -7,
      parts: [{ top: 300 }, { ring: [1, 2, 3, 4, 5, 6], holes: [[7, 8, 9, 10, 11, 12]], top: 900 }],
    };
    expect(geometryKey(b)).toBe('8e3f901669f8');
    expect(geometryKey({ id: 'x', footprint: { outer: [0, 0, 10, 0, 10, 10] }, base: 0, height: 25 })).toBe('0383d3a48510');
  });
  it('几何一变指纹就变', () => {
    const a = bld('a', 0);
    expect(geometryKey(a)).not.toBe(geometryKey({ ...a, height: 301 }));
    expect(geometryKey(a)).not.toBe(geometryKey({ ...a, parts: [{ top: 100 }, { ring: [0, 0, 1, 0, 1, 1], top: 200 }] }));
  });
});

describe('readFacades / verifyFacadeFiles', () => {
  it('读快照里的清单；格式不符报错；没有清单返回 null', () => {
    const d = doc({});
    const files = new Map([[LANDSD_FACADES_FILE, gzipSync(JSON.stringify(d))]]);
    expect(readFacades(files)?.pages[0]?.file).toBe('p000-aaaa.webp');
    expect(readFacades(new Map())).toBeNull();
    expect(() => readFacades(new Map([[LANDSD_FACADES_FILE, gzipSync(JSON.stringify({ ...d, version: 1 }))]]))).toThrow(/格式/);
  });
  it('贴图文件逐个校验 sha256 与字节数，缺文件、内容不符、文件名不合规都报错', () => {
    const d = doc({});
    const all = new Map([
      ['p000-aaaa.webp', page],
      ['far-bbbb.webp', far],
      ['far-low-cccc.webp', farLow],
    ]);
    expect(() => verifyFacadeFiles(d, (n) => all.get(n) ?? null)).not.toThrow();
    expect(() => verifyFacadeFiles(d, (n) => (n === 'far-bbbb.webp' ? null : (all.get(n) ?? null)))).toThrow(/缺少/);
    expect(() => verifyFacadeFiles(d, (n) => (n === 'p000-aaaa.webp' ? new Uint8Array([9, 9, 9, 9]) : (all.get(n) ?? null)))).toThrow(/不符/);
    const bad = { ...d, pages: [entry('../evil.webp', page)] };
    expect(() => verifyFacadeFiles(bad, () => page)).toThrow(/文件名/);
  });
});

describe('attachFacades', () => {
  const zone: SensitiveZone = { id: 'z', kind: 'government', area: { outer: [900, -100, 1200, -100, 1200, 200, 900, 200] } };
  it('几何指纹相符才接；几何变了、在敏感区里、记录不合规的楼不接；统计如实', () => {
    const a = bld('a', 0);
    const b = bld('b', 200);
    const s = bld('s', 1000);
    const bad = bld('bad', 400);
    const d = doc({
      a: { k: geometryKey(a), f: [390, 120], p: [REC] },
      b: { k: 'stale000000', p: [REC] },
      s: { k: geometryKey(s), p: [REC] },
      bad: { k: geometryKey(bad), p: [[64, 48, 7, 0, 0, 1, 0, 0, 0, 0, 0, 10, 10]] },
      gone: { k: 'x', p: [REC] },
    });
    const r = attachFacades([a, b, s, bad], d, [zone]);
    expect(r.buildings[0]!.facade).toEqual({ f: [390, 120], p: [REC] });
    expect(r.buildings[1]!.facade).toBeUndefined();
    expect(r.buildings[2]!.facade).toBeUndefined();
    expect(r.buildings[3]!.facade).toBeUndefined();
    expect(r.stats).toMatchObject({ listed: 5, attached: 1, stale: 2, sensitive: 1, missing: 1, scaffold: ['zz'], pages: 1 });
    expect(r.meta).toEqual({
      dir: 'facades',
      page: 1024,
      tile: 1016,
      densityQ: 16,
      pages: ['p000-aaaa.webp'],
      far: { file: 'far-bbbb.webp', low: 'far-low-cccc.webp', cols: 16, rows: 1, cell: 128 },
      bytes: 7,
      excluded: ['zz'],
    });
    // 输入不被改动
    expect(a.facade).toBeUndefined();
  });
  it('一栋也接不上时整层省略（meta 为 null）', () => {
    const a = bld('a', 0);
    const r = attachFacades([a], doc({ a: { k: 'nope', p: [REC] } }), []);
    expect(r.meta).toBeNull();
    expect(r.buildings[0]).toBe(a);
  });
});

describe('validRecord', () => {
  it('墙片 7 个整数：页号、页内位置与外包框都要在页里；空记录与「无照片」片合规', () => {
    expect(validRecord([REC, []], 1, 1024)).toBe(true);
    expect(validRecord([[64, 48, -1, 0, 0, 1, -1, 0, 0, 0, 0, 0, 0]], 1, 1024)).toBe(true);
    // 外包框越出页边
    expect(validRecord([[64, 48, 0, 0, 0, 1, 0, 1000, 0, 0, 0, 100, 10]], 1, 1024)).toBe(false);
    // 外包框为空
    expect(validRecord([[64, 48, 0, 0, 0, 1, 0, 4, 4, 0, 0, 0, 10]], 1, 1024)).toBe(false);
    // 截断、非整数、密度为 0
    expect(validRecord([[64, 48, 0, 0, 0, 2, 0, 4, 4, 0, 0, 10, 10]], 1, 1024)).toBe(false);
    expect(validRecord([[64, 48, 0, 0.5, 0, 1, 0, 4, 4, 0, 0, 10, 10]], 1, 1024)).toBe(false);
    expect(validRecord([[0, 48, 0, 0, 0, 1, 0, 4, 4, 0, 0, 10, 10]], 1, 1024)).toBe(false);
  });
});

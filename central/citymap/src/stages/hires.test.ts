import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Building, SensitiveZone } from '@central/data';
import { sha256Hex } from '../geo/hash';
import { geometryKey } from './facades';
import {
  HIRES_VERSION,
  LANDSD_HIRES_BAYS_FILE,
  LANDSD_HIRES_FILE,
  attachHires,
  hiresPagesDigest,
  readHires,
  readHiresBays,
  validBays,
  validCanopy,
  validHiresRecord,
  verifyHiresFiles,
  type HiresBaysDoc,
  type HiresDoc,
} from './hires';

const bld = (id: string, x0: number): Building => ({
  id,
  src: 'landsd',
  footprint: { outer: [x0, 0, x0 + 100, 0, x0 + 100, 100, x0, 100] },
  base: 50,
  height: 300,
  heightSource: 'landsd',
  kind: 'tower',
  style: 3,
});

const page = new Uint8Array([1, 2, 3, 4]);
const entry = (file: string, bytes: Uint8Array) => ({ file, sha256: sha256Hex(bytes), bytes: bytes.byteLength });
// 一段：part 0、环 0、边 2、街面段、24 px/m、zTop 200、zBot 40、一片
const SEC = [0, 0, 2, 0, 384, 200, 40, 1, 0, 8, 8, 0, 0, 200, 300];
// 一块雨篷：沿 y = 0 的南墙（x 0 → 100，外法线 = 右手侧 = −y）伸出 20 dm
const CAN = [0, 0, 100, 0, 20, 90, 30, 0x808080, 0x404040, 0xc0c0c0];

function doc(buildings: HiresDoc['buildings']): HiresDoc {
  return {
    format: 'central-3dvm-hires',
    version: HIRES_VERSION,
    params: { page: 1024, aux: 512, tile: 1016, densityQ: 16, reliefMaxM: 2.5 },
    pages: [entry('hs000-0123abcd.webp', page)],
    streetPages: 1,
    buildings,
    excluded: { buildings: { zz: 'scaffold' }, faces: [{ id: 'yy', face: 'yy_0_0_1', why: 'netting 1.4' }] },
  };
}

describe('validHiresRecord / validCanopy', () => {
  it('段记录：整数、长度 = 8 + 7n、片在页内、zTop > zBot', () => {
    expect(validHiresRecord([SEC], 1, 1024)).toBe(true);
    expect(validHiresRecord([SEC.slice(0, 14)], 1, 1024)).toBe(false);
    expect(validHiresRecord([[...SEC.slice(0, 8), 1, 8, 8, 0, 0, 200, 300]], 1, 1024)).toBe(false); // 页号越界
    expect(validHiresRecord([[0, 0, 2, 0, 384, 40, 200, 1, 0, 8, 8, 0, 0, 200, 300]], 1, 1024)).toBe(false);
    expect(validHiresRecord([[0, 0, 2, 0, 384, 200, 40, 1, 0, 900, 8, 0, 0, 200, 300]], 1, 1024)).toBe(false); // 片出页
    expect(validHiresRecord([[0, 0, 2, 0, 384.5, 200, 40, 1, 0, 8, 8, 0, 0, 200, 300]], 1, 1024)).toBe(false);
  });
  it('雨篷：合规且不碰敏感区（伸出的那侧落进敏感区的整块丢掉）', () => {
    const south: SensitiveZone = { id: 's', kind: 'government', area: { outer: [0, -50, 100, -50, 100, -10, 0, -10] } };
    const north: SensitiveZone = { id: 'n', kind: 'government', area: { outer: [0, 10, 100, 10, 100, 50, 0, 50] } };
    expect(validCanopy(CAN, [])).toBe(true);
    expect(validCanopy(CAN, [north])).toBe(true); // 墙的另一侧
    expect(validCanopy(CAN, [south])).toBe(false); // 伸出到 y = −20 dm，落在区里
    expect(validCanopy([...CAN.slice(0, 4), 0, ...CAN.slice(5)], [])).toBe(false);
    expect(validCanopy(CAN.slice(0, 9), [])).toBe(false);
  });
});

describe('attachHires', () => {
  it('按几何指纹接到楼上；几何变了的不接；敏感区里的不接；雨篷按敏感区过滤；统计', () => {
    const a = bld('a', 0);
    const b = bld('b', 200);
    const c = bld('c', 2000);
    const d = doc({
      a: { k: geometryKey(a), f: [SEC], c: [CAN] },
      b: { k: 'stale0000000', f: [SEC] },
      c: { k: geometryKey(c), f: [SEC] },
      gone: { k: 'x', f: [SEC] },
    });
    const zone: SensitiveZone = { id: 'z', kind: 'military', area: { outer: [1900, -100, 2200, -100, 2200, 200, 1900, 200] } };
    const r = attachHires([a, b, c], d, [zone]);
    expect(r.buildings[0]!.hires).toEqual({ f: [SEC], c: [CAN] });
    expect(r.buildings[1]!.hires).toBeUndefined();
    expect(r.buildings[2]!.hires).toBeUndefined();
    expect(r.stats).toMatchObject({ listed: 4, attached: 1, stale: 1, sensitive: 1, missing: 1, faces: 1, canopies: 1, pages: 1, bytes: 4 });
    expect(r.stats.excluded).toEqual(['yy', 'zz']);
    expect(r.meta).toEqual({
      dir: 'facades', page: 1024, aux: 512, tile: 1016, densityQ: 16, pages: ['hs000-0123abcd.webp'], streetPages: 1, reliefMaxM: 2.5, bytes: 4,
    });
    // 输入不被改动
    expect(a.hires).toBeUndefined();
    // 一栋都接不上：整层省略
    expect(attachHires([b], d, []).meta).toBeNull();
  });
  it('读清单、校验页文件（缺文件 / sha256 不符 / 文件名不合规报错）', () => {
    const d = doc({});
    expect(readHires(new Map([[LANDSD_HIRES_FILE, gzipSync(JSON.stringify(d))]]))?.streetPages).toBe(1);
    expect(readHires(new Map())).toBeNull();
    expect(() => readHires(new Map([[LANDSD_HIRES_FILE, gzipSync(JSON.stringify({ ...d, version: 99 }))]]))).toThrow();
    expect(() => verifyHiresFiles(d, () => page)).not.toThrow();
    expect(() => verifyHiresFiles(d, () => null)).toThrow(/缺少/);
    expect(() => verifyHiresFiles(d, () => new Uint8Array([9]))).toThrow(/不符/);
    expect(() => verifyHiresFiles({ ...d, pages: [entry('../x.webp', page)] }, () => page)).toThrow(/不合规/);
  });
});

describe('铺位（I-1 数据）', () => {
  // 边 2 上 1.00–7.25 m 一间铺，种子 151，开口 4.0–9.0 m（dm 40–90）
  const BAY = [0, 0, 2, 100, 725, 151, 90, 40, 28];
  it('validBays：长度、整数、s0 < s1、种子 1–255、顶 > 底、覆盖率 0–100', () => {
    expect(validBays([BAY])).toBe(true);
    expect(validBays([BAY.slice(0, 8)])).toBe(false);
    expect(validBays([[0, 0, 2, 725, 100, 151, 90, 40, 28]])).toBe(false);
    expect(validBays([[0, 0, 2, 100, 725, 0, 90, 40, 28]])).toBe(false);
    expect(validBays([[0, 0, 2, 100, 725, 151, 40, 90, 28]])).toBe(false);
    expect(validBays([[0, 0, 2, 100, 725.5, 151, 90, 40, 28]])).toBe(false);
  });
  it('页摘要一致时接上铺位（只给接上高清的楼）；摘要不符报错；读清单', () => {
    const a = bld('a', 0);
    const d = doc({ a: { k: geometryKey(a), f: [SEC] } });
    const bays: HiresBaysDoc = { format: 'central-3dvm-hires-bays', version: 1, pagesDigest: hiresPagesDigest(d.pages), buildings: { a: [BAY], zz: [BAY] } };
    const r = attachHires([a], d, [], 'facades', bays);
    expect(r.buildings[0]!.hires).toEqual({ f: [SEC], b: [BAY] });
    expect(r.stats.bays).toBe(1);
    // 不合规的铺位整栋不接（楼照样有高清层）
    expect(attachHires([a], d, [], 'facades', { ...bays, buildings: { a: [[...BAY.slice(0, 5), 999, 90, 40, 28]] } }).buildings[0]!.hires).toEqual({ f: [SEC] });
    expect(() => attachHires([a], d, [], 'facades', { ...bays, pagesDigest: 'x' })).toThrow(/不符/);
    expect(hiresPagesDigest(d.pages)).toBe(sha256Hex(`hs000-0123abcd.webp ${sha256Hex(page)}`));
    expect(readHiresBays(new Map([[LANDSD_HIRES_BAYS_FILE, gzipSync(JSON.stringify(bays))]]))?.buildings.a).toEqual([BAY]);
    expect(readHiresBays(new Map())).toBeNull();
    expect(() => readHiresBays(new Map([[LANDSD_HIRES_BAYS_FILE, gzipSync(JSON.stringify({ ...bays, format: 'x' }))]]))).toThrow();
  });
});

describe('红线：排除的楼 / 面连 R3 贴面一起不用', () => {
  it('整栋排除的楼删掉 Building.facade；整面排除的面记进 hires.x（没有高清层的楼只带 x）', () => {
    const a = bld('a', 0);
    const yy = { ...bld('yy', 400), facade: { p: [[64, 48, -1, 0, 0, 0]] } };
    const zz = { ...bld('zz', 800), facade: { p: [[64, 48, -1, 0, 0, 0]] } };
    const d = doc({ a: { k: geometryKey(a), f: [SEC] } });
    d.excluded.faces.push({ id: 'a', face: 'a_0_0_3', why: 'bamboo' }, { id: 'a', face: 'a_0_0_1', why: 'hoarding' }, { id: 'bad', face: 'zz_0_0_1', why: 'x' });
    const r = attachHires([a, yy, zz], d, []);
    expect(r.buildings[0]!.hires).toEqual({ f: [SEC], x: [[0, 0, 1], [0, 0, 3]] });
    // yy：整面排除 yy_0_0_1（文档默认）→ 只带 x、R3 贴面保留
    expect(r.buildings[1]!.hires).toEqual({ f: [], x: [[0, 0, 1]] });
    expect(r.buildings[1]!.facade).toBeDefined();
    // zz：整栋排除 → 没有 R3 贴面
    expect(r.buildings[2]!.facade).toBeUndefined();
    expect(r.stats).toMatchObject({ r3Dropped: 1, noPhotoFaces: 3 });
    // 一栋都接不上高清层时红线照样生效
    expect(attachHires([zz], doc({}), []).buildings[0]!.facade).toBeUndefined();
  });
});

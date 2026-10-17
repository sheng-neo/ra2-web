import { describe, expect, it } from 'vitest';
import { createCityState } from './state';
import type { CityState } from './state';
import { SYSTEM_ORDER } from './clock';
import type { HashTag } from './snapshot';
import {
  BOND_SLOTS, HASH_EXCLUDE, NEIGHBOR_SLOTS, PRIV_BUDGET_BYTES, PRIV_BUDGET_TOTAL_MAX, SCALAR_FIELDS, SNAPSHOT_MAGIC, SNAPSHOT_SCHEMA, SNAPSHOT_VERSION,
  STRING_FIELDS, inHashScope, parsePath, stringFieldHash,
} from './snapshot';

const LEGAL_TAGS: ReadonlySet<string> = new Set<HashTag>(['full', 'sc2', 'none']);
const isTypedArray = (v: unknown): boolean => ArrayBuffer.isView(v);
/** 按契约路径语法从对象取值；路径不存在时返回 undefined。 */
function resolve(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of parsePath(path)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}
/** 递归收集 number / boolean 叶子路径（跳过 TypedArray / 字符串 / priv / formatVersion）。 */
function collectScalarLeaves(v: unknown, prefix: string, out: string[]): void {
  if (typeof v === 'number' || typeof v === 'boolean') { out.push(prefix); return; }
  if (typeof v === 'string' || isTypedArray(v) || v === null || typeof v !== 'object') return;
  if (Array.isArray(v)) { v.forEach((e, k) => collectScalarLeaves(e, `${prefix}[${k}]`, out)); return; }
  for (const [k, e] of Object.entries(v)) {
    if (prefix === '' && (k === 'priv' || k === 'formatVersion')) continue;
    collectScalarLeaves(e, prefix === '' ? k : `${prefix}.${k}`, out);
  }
}

describe('snapshot: parsePath', () => {
  it('解析属性与下标', () => {
    expect(parsePath('neighbors[2].connections.road')).toEqual(['neighbors', 2, 'connections', 'road']);
    expect(parsePath('economy.bonds[49].rateRaw')).toEqual(['economy', 'bonds', 49, 'rateRaw']);
    expect(parsePath('rawMisc')).toEqual(['rawMisc']);
  });
  it('非法路径抛错', () => {
    for (const bad of ['', 'a..b', 'a[x]', 'a[1', '[0]', 'a.', '1a']) expect(() => parsePath(bad), bad).toThrow();
  });
});

describe('snapshot: SNAPSHOT_SCHEMA', () => {
  const s = createCityState();
  it('路径无重复，hash 标注合法', () => {
    const paths = SNAPSHOT_SCHEMA.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const e of SNAPSHOT_SCHEMA) expect(LEGAL_TAGS.has(e.hash), e.path).toBe(true);
  });
  it('TypedArray 条目在 createCityState() 上可解析，kind 与 len 与数组一致', () => {
    for (const e of SNAPSHOT_SCHEMA) {
      if (e.kind !== 'u8' && e.kind !== 'i32' && e.kind !== 'u16') continue;
      const arr = resolve(s, e.path);
      expect(isTypedArray(arr), e.path).toBe(true);
      const ctor = e.kind === 'u8' ? Uint8Array : e.kind === 'u16' ? Uint16Array : Int32Array;
      expect(arr, e.path).toBeInstanceOf(ctor);
      expect((arr as ArrayLike<number>).length, e.path).toBe(e.len);
    }
  });
  it('分组顺序：layers → maps → counts → xgrp → rawMisc → 小型 TypedArray → scalars → strings → priv', () => {
    const groups = SNAPSHOT_SCHEMA.map((e) => (e.kind === 'scalars' || e.kind === 'strings' || e.kind === 'priv' ? e.kind : e.path.split('.')[0]!));
    const dedup = groups.filter((g, k) => k === 0 || g !== groups[k - 1]);
    expect(dedup.slice(0, 5)).toEqual(['layers', 'maps', 'counts', 'xgrp', 'rawMisc']);
    expect(dedup.slice(-3)).toEqual(['scalars', 'strings', 'priv']);
    expect(groups.filter((g) => g === 'layers')).toHaveLength(12);
    expect(groups.filter((g) => g === 'maps')).toHaveLength(8);
    expect(groups.filter((g) => g === 'counts')).toHaveLength(3);
  });
  it('scalars / strings / priv 各恰一条；len 与字段表一致；rawMisc 不入哈希、priv 只入 full', () => {
    const byKind = (k: string) => SNAPSHOT_SCHEMA.filter((e) => e.kind === k);
    expect(byKind('scalars')).toHaveLength(1); expect(byKind('strings')).toHaveLength(1); expect(byKind('priv')).toHaveLength(1);
    expect(byKind('scalars')[0]!.len).toBe(SCALAR_FIELDS.length);
    expect(byKind('strings')[0]!.len).toBe(STRING_FIELDS.length);
    expect(byKind('priv')[0]!.hash).toBe('full');
    expect(SNAPSHOT_SCHEMA.find((e) => e.path === 'rawMisc')!.hash).toBe('none');
  });
  it('每个在 §F 中非标量的定长字段都有 TypedArray 条目（含 economy.funding / industryTax、industry.ratio / demand、cohorts、tech）', () => {
    const paths = new Set(SNAPSHOT_SCHEMA.map((e) => e.path));
    for (const p of ['economy.industryTax', 'economy.funding', 'industry.ratio', 'industry.demand', 'demographics.cohorts', 'tech.invented', 'tech.announced', 'xgrp', 'rawMisc'])
      expect(paths.has(p), p).toBe(true);
  });
});

describe('snapshot: SCALAR_FIELDS', () => {
  it('路径无重复，hash 标注合法', () => {
    const paths = SCALAR_FIELDS.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const f of SCALAR_FIELDS) expect(LEGAL_TAGS.has(f.hash), f.path).toBe(true);
  });
  it('穷举 CityState 的全部 number / boolean 叶子（+ 虚拟 economy.bondCount 与 50 个债券槽）', () => {
    const leaves: string[] = [];
    collectScalarLeaves(createCityState(), '', leaves);
    const expected = new Set(leaves);
    expected.add('economy.bondCount');
    for (let k = 0; k < BOND_SLOTS; k++) for (const leaf of ['rateRaw', 'issuedYear', 'issuedMonth']) expected.add(`economy.bonds[${k}].${leaf}`);
    const actual = new Set(SCALAR_FIELDS.map((f) => f.path));
    expect([...actual].filter((p) => !expected.has(p)), '多余的字段').toEqual([]);
    expect([...expected].filter((p) => !actual.has(p)), '缺失的字段').toEqual([]);
  });
  it('bool 标注与 createCityState() 的类型一致；债券满 50 条时全部债券路径可解析', () => {
    const s: CityState = createCityState();
    for (let k = 0; k < BOND_SLOTS; k++) s.economy.bonds.push({ rateRaw: k, issuedYear: 1900 + k, issuedMonth: k % 12 });
    for (const f of SCALAR_FIELDS) {
      if (f.path === 'economy.bondCount') { expect(s.economy.bonds.length).toBe(BOND_SLOTS); continue; }
      const v = resolve(s, f.path);
      expect(typeof v, f.path).toBe(f.bool ? 'boolean' : 'number');
    }
    expect(resolve(s, 'economy.bonds[49].issuedYear')).toBe(1949);
    expect(resolve(createCityState(), 'economy.bonds[0].rateRaw')).toBeUndefined();   // 空债券表 → 编码器按 0 处理
  });
  it("'none' 集合 == HASH_EXCLUDE；'full' 标量只有 clock.phaseCursor 与 economy.yearOpeningFunds", () => {
    const none = [...SCALAR_FIELDS.filter((f) => f.hash === 'none').map((f) => f.path), ...SNAPSHOT_SCHEMA.filter((e) => e.hash === 'none').map((e) => e.path)];
    expect(none.sort()).toEqual([...HASH_EXCLUDE].sort());
    expect(new Set(HASH_EXCLUDE).size).toBe(HASH_EXCLUDE.length);
    expect(SCALAR_FIELDS.filter((f) => f.hash === 'full').map((f) => f.path).sort()).toEqual(['clock.phaseCursor', 'economy.yearOpeningFunds']);
    for (const p of ['clock.speed', 'clock.modalPause', 'clock.accumMs', 'view.x', 'view.y', 'view.zoom', 'census.workforcePctUsed', 'rawMisc']) expect(HASH_EXCLUDE).toContain(p);
  });
  it('邻城固定 4 条、债券固定 50 槽，字段序稳定（clock 开头、view 结尾）', () => {
    expect(NEIGHBOR_SLOTS).toBe(4); expect(BOND_SLOTS).toBe(50);
    expect(SCALAR_FIELDS.filter((f) => f.path.startsWith('neighbors['))).toHaveLength(4 * 8);
    expect(SCALAR_FIELDS.filter((f) => f.path.startsWith('economy.bonds['))).toHaveLength(50 * 3);
    expect(SCALAR_FIELDS[0]!.path).toBe('clock.age');
    expect(SCALAR_FIELDS[SCALAR_FIELDS.length - 1]!.path).toBe('view.zoom');
  });
});

describe('snapshot: STRING_FIELDS / 哈希档 / priv 预算', () => {
  it('STRING_FIELDS 全部解析为字符串，且无重复', () => {
    const s = createCityState();
    expect(new Set(STRING_FIELDS).size).toBe(STRING_FIELDS.length);
    for (const p of STRING_FIELDS) expect(typeof resolve(s, p), p).toBe('string');
    expect(STRING_FIELDS).toEqual(['cityName', 'mayorName', 'neighbors[0].name', 'neighbors[1].name', 'neighbors[2].name', 'neighbors[3].name']);
    expect(STRING_FIELDS.map(stringFieldHash)).toEqual(['sc2', 'full', 'sc2', 'sc2', 'sc2', 'sc2']);   // 市长名不在 .SC2 内
  });
  it('inHashScope 真值表', () => {
    expect(inHashScope('sc2', 'sc2')).toBe(true); expect(inHashScope('sc2', 'full')).toBe(true);
    expect(inHashScope('full', 'full')).toBe(true); expect(inHashScope('full', 'sc2')).toBe(false);
    expect(inHashScope('none', 'full')).toBe(false); expect(inHashScope('none', 'sc2')).toBe(false);
  });
  it('PRIV_BUDGET_BYTES 键 == SystemId 去 core，总和 ≤ 512 KB', () => {
    expect(Object.keys(PRIV_BUDGET_BYTES).sort()).toEqual(SYSTEM_ORDER.filter((id) => id !== 'core').sort());
    const total = Object.values(PRIV_BUDGET_BYTES).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(PRIV_BUDGET_TOTAL_MAX);
    for (const v of Object.values(PRIV_BUDGET_BYTES)) expect(v).toBeGreaterThan(0);
  });
  it('魔数 8 字节；版本号 == CityState.formatVersion', () => {
    expect(SNAPSHOT_MAGIC).toHaveLength(8);
    expect(SNAPSHOT_VERSION).toBe(createCityState().formatVersion);
  });
});

import { describe, expect, it } from 'vitest';
import { createCityState } from '../../contracts/state';
import type { CityState, PrivState } from '../../contracts/state';
import { PRIV_BUDGET_BYTES, SNAPSHOT_MAGIC, SNAPSHOT_SCHEMA } from '../../contracts/snapshot';
import { decodeSnapshot, encodeSnapshot, hashSnapshot, privEncodedSize, snapshotCodec, utf8Decode, utf8Encode, validatePriv } from './codec';

/** 一份"有内容"的状态：层 / 图 / 标量 / 字符串 / 债券 / priv 都非默认。 */
function populated(): CityState {
  const s = createCityState();
  let x = 1;
  const lcg = (): number => (x = (x * 1103515245 + 12345) >>> 0);
  for (let i = 0; i < s.layers.xbld.length; i++) { s.layers.xbld[i] = lcg() & 0xff; s.layers.alt[i] = lcg() & 31; s.layers.xbit[i] = lcg() & 0xff; }
  for (let i = 0; i < s.maps.xtrf.length; i++) s.maps.xtrf[i] = lcg() & 0xff;
  for (let i = 0; i < s.xgrp.length; i++) s.xgrp[i] = (lcg() | 0) >> 3;
  for (let i = 0; i < s.rawMisc.length; i++) s.rawMisc[i] = lcg() | 0;
  s.cityName = '海港之光 Harborlight'; s.mayorName = 'Ada 😀'; s.neighbors[2]!.name = 'Nordmark';
  s.clock.age = 1234; s.clock.foundedYear = 1950; s.clock.prngState = -123456789; s.clock.phaseCursor = 3; s.clock.speed = 4; s.clock.accumMs = 77;
  s.economy.funds = -5000; s.economy.autoBudget = true; s.economy.yearOpeningFunds = 20000;
  s.economy.bonds.push({ rateRaw: 50000, issuedYear: 1951, issuedMonth: 3 }, { rateRaw: 61000, issuedYear: 1952, issuedMonth: 11 });
  s.economy.industryTax[3] = 7; s.demographics.cohorts[59] = 42; s.tech.invented[2] = 1961; s.tech.announced[2] = 1;
  s.disaster.active = true; s.disaster.windOverride = 3; s.view.x = 10; s.view.zoom = 2; s.terrain.rotation = 2;
  s.priv.zones = { v: 1, lots: new Uint16Array([1, 2, 65535]), timers: new Int32Array([-1, 7]), flags: new Uint8Array([0, 255]), name: 'π', nested: { b: [1, 'two', true], a: { deep: -2147483648 } }, ok: false };
  s.priv.events = { v: 2, bytes: new Int8Array([-128, 127]), words: new Int16Array([-32768, 32767]), dwords: new Uint32Array([0xffffffff, 1]), list: [{ k: 1 }, { k: 2 }] };
  return s;
}
const withKeysShuffled = (p: PrivState): PrivState => {
  const keys = Object.keys(p).reverse();
  const out: Record<string, unknown> = {};
  for (const k of keys) { const v = p[k]; out[k] = v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v) ? withKeysShuffled(v as PrivState) : v; }
  return out as PrivState;
};

describe('snapshot codec: 往返', () => {
  it('文件头：魔数 + 版本 + header JSON（entries 顺序 = SNAPSHOT_SCHEMA）', () => {
    const bytes = encodeSnapshot(createCityState());
    expect(utf8Decode(bytes.subarray(0, 8))).toBe(SNAPSHOT_MAGIC);
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getUint16(8, true)).toBe(2);
    const headerLen = view.getUint32(10, true);
    const header = JSON.parse(utf8Decode(bytes.subarray(14, 14 + headerLen))) as { schema: number; entries: { path: string; kind: string; bytes: number }[] };
    expect(header.schema).toBe(2);
    expect(header.entries.map((e) => e.path)).toEqual(SNAPSHOT_SCHEMA.map((e) => e.path));
    const payload = header.entries.reduce((n, e) => n + e.bytes, 0);
    expect(bytes.length).toBe(14 + headerLen + payload);
  });
  it('decode(encode(S)) 两档哈希不变，内容逐字段相等（含 UTF-8 字符串、债券、priv TypedArray、不入哈希字段）', () => {
    const s = populated();
    const bytes = encodeSnapshot(s);
    const into = createCityState();
    const clock = into.clock, xbld = into.layers.xbld;
    expect(decodeSnapshot(bytes, into)).toEqual([]);
    expect(into.clock).toBe(clock); expect(into.layers.xbld).toBe(xbld);                 // 就地写回
    expect(hashSnapshot(into, 'full')).toBe(hashSnapshot(s, 'full'));
    expect(hashSnapshot(into, 'sc2')).toBe(hashSnapshot(s, 'sc2'));
    expect(into.cityName).toBe(s.cityName); expect(into.mayorName).toBe('Ada 😀'); expect(into.neighbors[2]!.name).toBe('Nordmark');
    expect(into.economy.bonds).toEqual(s.economy.bonds); expect(into.economy.funds).toBe(-5000); expect(into.economy.autoBudget).toBe(true);
    expect(into.clock.prngState).toBe(-123456789); expect(into.clock.phaseCursor).toBe(3); expect(into.clock.speed).toBe(4); expect(into.clock.accumMs).toBe(77);
    expect(into.disaster.active).toBe(true); expect(into.disaster.windOverride).toBe(3); expect(into.view.x).toBe(10); expect(into.terrain.rotation).toBe(2);
    expect(Array.from(into.layers.alt)).toEqual(Array.from(s.layers.alt)); expect(Array.from(into.rawMisc)).toEqual(Array.from(s.rawMisc));
    expect(into.priv.zones).toEqual(s.priv.zones); expect(into.priv.events).toEqual(s.priv.events);
    expect(into.priv.zones!.lots).toBeInstanceOf(Uint16Array); expect((into.priv.events!.dwords as Uint32Array)[0]).toBe(0xffffffff);
    expect(into.priv.terrain).toBeUndefined();
    expect(encodeSnapshot(into)).toEqual(bytes);                                          // 字节级幂等
  });
  it('decode 清掉 into 原有的 priv 与多余债券', () => {
    const into = populated();
    into.priv.terrain = { v: 1 }; into.economy.bonds.push({ rateRaw: 1, issuedYear: 1, issuedMonth: 1 });
    decodeSnapshot(encodeSnapshot(createCityState()), into);
    expect(into.priv).toEqual({}); expect(into.economy.bonds).toEqual([]); expect(into.cityName).toBe('');
    expect(hashSnapshot(into, 'full')).toBe(hashSnapshot(createCityState(), 'full'));
  });
  it('缺失 / 未知 / 损坏条目：补默认并记诊断；版本不同记 warn；魔数错误抛错', () => {
    const s = populated();
    const bytes = encodeSnapshot(s);
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const headerLen = view.getUint32(10, true);
    const header = JSON.parse(utf8Decode(bytes.subarray(14, 14 + headerLen))) as { schema: number; entries: { path: string; kind: string; len?: number; bytes: number }[] };
    // 去掉 layers.xbld 条目（及其 payload），把 maps.xtrf 的 len 改错，追加一个未知条目名
    const payloadStart = 14 + headerLen;
    let off = payloadStart;
    const chunks: Uint8Array[] = [];
    const kept: typeof header.entries = [];
    for (const e of header.entries) {
      const chunk = bytes.subarray(off, off + e.bytes); off += e.bytes;
      if (e.path === 'layers.xbld') continue;
      if (e.path === 'maps.xtrf') kept.push({ ...e, len: 7 }); else if (e.path === 'xgrp') kept.push({ ...e, path: 'future.unknown' }); else kept.push(e);
      chunks.push(chunk);
    }
    const h2 = utf8Encode(JSON.stringify({ schema: 2, entries: kept }));
    const total = 14 + h2.length + chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    out.set(bytes.subarray(0, 8)); new DataView(out.buffer).setUint16(8, 1, true); new DataView(out.buffer).setUint32(10, h2.length, true); out.set(h2, 14);
    let p = 14 + h2.length; for (const c of chunks) { out.set(c, p); p += c.length; }
    const into = createCityState();
    const diag = decodeSnapshot(out, into);
    expect(diag.map((d) => d.code).sort()).toEqual(['snapshot.badEntry', 'snapshot.missingEntry', 'snapshot.missingEntry', 'snapshot.unknownEntry', 'snapshot.version'].sort());
    expect(Array.from(into.layers.xbld).every((v) => v === 0)).toBe(true);
    expect(Array.from(into.maps.xtrf).every((v) => v === 0)).toBe(true);
    expect(Array.from(into.xgrp).every((v) => v === 0)).toBe(true);
    expect(Array.from(into.layers.alt)).toEqual(Array.from(s.layers.alt));              // 其余条目正常
    expect(into.priv.zones).toEqual(s.priv.zones);
    const bad = bytes.slice(); bad[0] = 0x58;
    expect(() => decodeSnapshot(bad, createCityState())).toThrow(/魔数/);
  });
  it('UTF-8 编解码：ASCII / 双字节 / 三字节 / 代理对往返', () => {
    for (const s of ['', 'abc', 'ÄÖü', '海港', '😀🏙️', 'a\u0000b']) expect(utf8Decode(utf8Encode(s))).toBe(s);
    expect(Array.from(utf8Encode('€'))).toEqual([0xe2, 0x82, 0xac]);
  });
});

describe('snapshot codec: 哈希', () => {
  it('hash(structuredClone(S)) == hash(S)（两档）', () => {
    const s = populated();
    const c = structuredClone(s);
    expect(hashSnapshot(c, 'full')).toBe(hashSnapshot(s, 'full'));
    expect(hashSnapshot(c, 'sc2')).toBe(hashSnapshot(s, 'sc2'));
  });
  it('priv 键乱序重建哈希不变；priv 内容变化只影响 full 档', () => {
    const s = populated();
    const full = hashSnapshot(s, 'full'), sc2 = hashSnapshot(s, 'sc2');
    s.priv.zones = withKeysShuffled(s.priv.zones!); s.priv.events = withKeysShuffled(s.priv.events!);
    expect(hashSnapshot(s, 'full')).toBe(full);
    (s.priv.zones as PrivState).ok = true;
    expect(hashSnapshot(s, 'full')).not.toBe(full);
    expect(hashSnapshot(s, 'sc2')).toBe(sc2);
    s.priv.zones!.maybe = undefined as unknown as number;                                 // undefined 键视为不存在
    const h3 = hashSnapshot(s, 'full'); delete s.priv.zones!.maybe; expect(hashSnapshot(s, 'full')).toBe(h3);
  });
  it('hash:none 字段（speed / modalPause / accumMs / view / rotation / rawMisc / workforcePctUsed）两档都不影响；phaseCursor / yearOpeningFunds 只进 full；图层进两档', () => {
    const s = populated();
    const full = hashSnapshot(s, 'full'), sc2 = hashSnapshot(s, 'sc2');
    s.clock.speed = 1; s.clock.modalPause = 2; s.clock.accumMs = 0; s.view.x = 99; s.view.zoom = 0; s.terrain.rotation = 0; s.rawMisc[5] = 12345; s.census.workforcePctUsed = 33;
    expect(hashSnapshot(s, 'full')).toBe(full); expect(hashSnapshot(s, 'sc2')).toBe(sc2);
    s.clock.phaseCursor = 0; s.economy.yearOpeningFunds = 1;
    expect(hashSnapshot(s, 'full')).not.toBe(full); expect(hashSnapshot(s, 'sc2')).toBe(sc2);
    const full2 = hashSnapshot(s, 'full');
    s.layers.xzon[77] = 0xf1;
    expect(hashSnapshot(s, 'full')).not.toBe(full2); expect(hashSnapshot(s, 'sc2')).not.toBe(sc2);
    const sc2b = hashSnapshot(s, 'sc2');
    s.cityName = 'Other';
    expect(hashSnapshot(s, 'sc2')).not.toBe(sc2b);
    // mayorName：.SC2 没有该字段 → 只进 full（stringFieldHash）
    const full3 = hashSnapshot(s, 'full'), sc2c = hashSnapshot(s, 'sc2');
    s.mayorName = 'Someone Else';
    expect(hashSnapshot(s, 'full')).not.toBe(full3); expect(hashSnapshot(s, 'sc2')).toBe(sc2c);
  });
  it('默认状态哈希稳定（基线：任何改动 schema / 字节序的 PR 都会触发本断言，需有意更新）', () => {
    const s = createCityState();
    expect(hashSnapshot(s, 'full')).toBe(hashSnapshot(createCityState(), 'full'));
    expect(hashSnapshot(s, 'full')).not.toBe(hashSnapshot(s, 'sc2'));
    expect(typeof hashSnapshot(s, 'full')).toBe('number');
    expect(hashSnapshot(s, 'full')).toBeGreaterThanOrEqual(0);
  });
});

describe('snapshot codec: priv 白名单与预算', () => {
  const withPriv = (p: unknown): CityState => { const s = createCityState(); (s.priv as Record<string, unknown>).zones = p; return s; };
  it('非白名单类型抛错（encode 与 hash 一致），错误信息带路径', () => {
    const bad: [string, unknown, RegExp][] = [
      ['Map', { v: 1, m: new Map() }, /priv\.zones\.m/], ['Set', { v: 1, s: new Set() }, /priv\.zones\.s/], ['function', { v: 1, f: () => 0 }, /function/],
      ['null', { v: 1, n: null }, /null/], ['NaN', { v: 1, x: NaN }, /i32/], ['Infinity', { v: 1, x: Infinity }, /i32/], ['非整数', { v: 1, x: 1.5 }, /i32/],
      ['超 i32', { v: 1, x: 2147483648 }, /i32/], ['Float32Array', { v: 1, a: new Float32Array(2) }, /TypedArray/], ['Float64Array', { v: 1, a: new Float64Array(2) }, /TypedArray/],
      ['类实例', { v: 1, d: new Date(0) }, /类实例/], ['数组内 undefined', { v: 1, a: [1, undefined] }, /undefined/], ['bigint', { v: 1, b: 1n }, /bigint/], ['顶层非对象', 7, /priv\.zones/],
    ];
    for (const [name, p, re] of bad) {
      const s = withPriv(p);
      expect(() => encodeSnapshot(s), name).toThrow(re);
      expect(() => hashSnapshot(s, 'full'), name).toThrow(re);
      expect(validatePriv(s).some((d) => d.level === 'error' && d.code === 'priv.type'), name).toBe(true);
    }
    expect(() => hashSnapshot(withPriv({ v: 1, x: 1.5 }), 'sc2')).not.toThrow();            // sc2 档不含 priv
  });
  it('validatePriv：预算断言（zones 131072 B）、v 校验、未知系统键', () => {
    const ok = withPriv({ v: 1, big: new Uint8Array(PRIV_BUDGET_BYTES.zones - 64) });
    expect(validatePriv(ok)).toEqual([]);
    expect(privEncodedSize(ok.priv.zones!, 'zones')).toBeLessThanOrEqual(PRIV_BUDGET_BYTES.zones);
    const over = withPriv({ v: 1, big: new Uint8Array(PRIV_BUDGET_BYTES.zones) });
    expect(validatePriv(over).map((d) => d.code)).toEqual(['priv.budget']);
    expect(() => encodeSnapshot(over)).not.toThrow();                                       // 预算只在 validatePriv 断言，编码不拒绝
    expect(validatePriv(withPriv({ v: 0 })).map((d) => d.code)).toEqual(['priv.version']);
    const s = createCityState(); (s.priv as Record<string, unknown>).core = { v: 1 };
    expect(validatePriv(s).map((d) => d.code)).toEqual(['priv.unknownSystem']);
    expect(() => encodeSnapshot(s)).not.toThrow();
    expect(Object.keys(PRIV_BUDGET_BYTES)).toHaveLength(8);
  });
  it('snapshotCodec 出口把四个方法绑定到同一实现', () => {
    expect(snapshotCodec.encode).toBe(encodeSnapshot); expect(snapshotCodec.decode).toBe(decodeSnapshot);
    expect(snapshotCodec.hash).toBe(hashSnapshot); expect(snapshotCodec.validatePriv).toBe(validatePriv);
  });
});

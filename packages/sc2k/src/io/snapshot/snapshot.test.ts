// ===== io/snapshot/snapshot.test.ts =====（WORKPLAN WP1 验收：往返两档哈希不变；structuredClone 哈希不变；priv 键乱序哈希不变；
// 非白名单类型抛错；预算断言；v=0 旧 priv 不崩）。字节级细节见 codec.test.ts；本文件以 SimHost 为主体（经注入的 snapshotCodec）。
import { describe, expect, it } from 'vitest';
import { PRIV_BUDGET_BYTES, SNAPSHOT_MAGIC } from '../../contracts/snapshot';
import { tileIndex } from '../../contracts/grid';
import type { PrivState } from '../../contracts/state';
import type { System } from '../../contracts/system';
import { createTestContext, hashOf, nullSystem, runDays, simInternalsOf } from '../../testkit';
import { decodeSnapshot, encodeSnapshot, hashSnapshot, snapshotCodec, utf8Decode, validatePriv } from './codec';

const shuffleKeys = (p: PrivState): PrivState => {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(p).reverse()) { const v = p[k]; out[k] = v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v) ? shuffleKeys(v as PrivState) : v; }
  return out as PrivState;
};
/** 带 priv 的假 zones（privVersion 2）：v ≠ 2 的旧 priv 在 postLoad('snapshot') 丢弃重建，不崩。 */
function zonesWithPriv(): System {
  return {
    ...nullSystem('zones'), privVersion: 2,
    init(ctx, p) { nullSystem('zones').init(ctx, p); ctx.state.priv.zones = { v: 2, lots: new Uint16Array(8), note: 'fresh', nested: { a: 1, b: [true, 'x'] } }; },
    phases: { census: (ctx) => { const p = ctx.state.priv.zones!; (p.lots as Uint16Array)[ctx.state.clock.age & 7] = ctx.state.clock.age; return 'done'; } },
    postLoad(ctx) {
      const p = ctx.state.priv.zones;
      if (!p || p.v !== 2) ctx.state.priv.zones = { v: 2, lots: new Uint16Array(8), note: 'rebuilt', nested: { a: 0, b: [] } };
    },
  };
}

describe('snapshot: 经 SimHost 的往返', () => {
  it.each(['optimistic', 'pessimistic'] as const)('[%s] saveSnapshot → loadSnapshot：两档哈希不变、priv TypedArray 保留、字节级幂等', (profile) => {
    const a = createTestContext({ profile, seed: 8, systems: [zonesWithPriv()], params: { name: '港湾·Harbor', mayor: 'Ümit 😀' } });
    a.ctx.act.setXbld(tileIndex(9, 9), 0x0e); a.ctx.act.setXzon(tileIndex(9, 10), 0xf2);
    runDays(a.host, 60);
    a.state.economy.bonds.push({ rateRaw: 51234, issuedYear: 1900, issuedMonth: 2 });
    const bytes = a.host.saveSnapshot();
    expect(utf8Decode(bytes.subarray(0, 8))).toBe(SNAPSHOT_MAGIC);
    const full = a.host.hash('full'), sc2 = a.host.hash('sc2');
    const b = createTestContext({ profile, seed: 1, systems: [zonesWithPriv()] });
    runDays(b.host, 9);
    expect(b.host.loadSnapshot(bytes).filter((d) => d.level !== 'info')).toEqual([]);
    expect(b.host.hash('full')).toBe(full); expect(b.host.hash('sc2')).toBe(sc2);
    expect(b.state.cityName).toBe('港湾·Harbor'); expect(b.state.mayorName).toBe('Ümit 😀');
    expect(b.state.priv.zones!.lots).toBeInstanceOf(Uint16Array); expect(b.state.priv.zones!.note).toBe('fresh');
    expect(b.state.economy.bonds).toEqual([{ rateRaw: 51234, issuedYear: 1900, issuedMonth: 2 }]);
    expect(b.host.saveSnapshot()).toEqual(bytes);
    expect(hashOf(b.state)).toBe(full); expect(hashOf(b.state, 'sc2')).toBe(sc2);
  });
  it('hash(structuredClone(S)) == hash(S)；priv 键乱序重建哈希不变；priv 变化只影响 full 档', () => {
    const { host, state } = createTestContext({ systems: [zonesWithPriv()] });
    runDays(host, 30);
    const full = host.hash('full'), sc2 = host.hash('sc2');
    const clone = structuredClone(state);
    expect(hashSnapshot(clone, 'full')).toBe(full); expect(hashSnapshot(clone, 'sc2')).toBe(sc2);
    state.priv.zones = shuffleKeys(state.priv.zones!);
    expect(host.hash('full')).toBe(full);
    state.priv.zones!.note = 'changed';
    expect(host.hash('full')).not.toBe(full); expect(host.hash('sc2')).toBe(sc2);
  });
  it('v=0 的旧 priv 载入不崩：系统在 postLoad(snapshot) 丢弃并重建；缺 priv 的系统也能重建', () => {
    const a = createTestContext({ systems: [zonesWithPriv()] });
    runDays(a.host, 5);
    const old = structuredClone(a.state);
    old.priv.zones = { v: 0, legacy: new Int32Array([1, 2, 3]) };
    const bytes = encodeSnapshot(old);
    const b = createTestContext({ systems: [zonesWithPriv()] });
    expect(() => b.host.loadSnapshot(bytes)).not.toThrow();
    expect(b.state.priv.zones).toMatchObject({ v: 2, note: 'rebuilt' });
    expect(b.host.hash('sc2')).toBe(hashSnapshot(old, 'sc2'));
    delete old.priv.zones;
    const c = createTestContext({ systems: [zonesWithPriv()] });
    expect(() => c.host.loadSnapshot(encodeSnapshot(old))).not.toThrow();
    expect(c.state.priv.zones).toMatchObject({ v: 2, note: 'rebuilt' });
    runDays(c.host, 3);                                                                  // 重建后可继续推进
  });
  it('挂起态快照编码 phaseCursor：载入后仍挂起；魔数错误 / 截断的字节抛错且状态不变', () => {
    const economy: System = { ...nullSystem('economy'), phases: { graphs: () => 'suspend' } };
    const a = createTestContext({ systems: [economy] });
    runDays(a.host, 21); simInternalsOf(a.host).stepDay();
    expect(a.state.clock.phaseCursor).toBe(4);
    const bytes = a.host.saveSnapshot();
    const b = createTestContext({ systems: [economy] });
    const before = b.host.hash('full');
    expect(() => b.host.loadSnapshot(bytes.subarray(0, 40))).toThrow();
    const bad = bytes.slice(); bad[2] = 0x21;
    expect(() => b.host.loadSnapshot(bad)).toThrow(/魔数/);
    expect(b.host.hash('full')).toBe(before);
    b.host.loadSnapshot(bytes);
    expect(b.state.clock.phaseCursor).toBe(4); expect(b.state.clock.modalPause).toBe(1);
    b.host.modalClosed();
    expect(b.state.clock.age).toBe(22);
  });
});

describe('snapshot: priv 白名单与预算（编解码器层）', () => {
  it('非白名单类型：encode / hash(full) 抛错并带路径，validatePriv 报 error；hash(sc2) 不受影响', () => {
    const { state } = createTestContext();
    const bad: Array<[string, unknown, RegExp]> = [
      ['Map', new Map(), /priv\.zones\.x/], ['函数', () => 1, /function/], ['null', null, /null/], ['浮点', 0.5, /i32/], ['Float32Array', new Float32Array(1), /TypedArray/], ['Date', new Date(0), /类实例/],
    ];
    for (const [name, v, re] of bad) {
      (state.priv as Record<string, unknown>).zones = { v: 1, x: v };
      expect(() => encodeSnapshot(state), name).toThrow(re);
      expect(() => hashSnapshot(state, 'full'), name).toThrow(re);
      expect(() => hashSnapshot(state, 'sc2'), name).not.toThrow();
      expect(validatePriv(state).some((d) => d.level === 'error'), name).toBe(true);
    }
  });
  it('预算断言：每个系统的 priv 编码后 ≤ PRIV_BUDGET_BYTES[id]；超预算 validatePriv 报 priv.budget 而编码不拒绝', () => {
    const { state } = createTestContext();
    for (const [id, budget] of Object.entries(PRIV_BUDGET_BYTES)) {
      (state.priv as Record<string, unknown>)[id] = { v: 1, blob: new Uint8Array(budget - 32) };
    }
    expect(validatePriv(state)).toEqual([]);
    const bytes = encodeSnapshot(state);
    const into = structuredClone(state);
    decodeSnapshot(bytes, into);
    expect(hashSnapshot(into, 'full')).toBe(hashSnapshot(state, 'full'));
    (state.priv as Record<string, unknown>).events = { v: 1, blob: new Uint8Array(PRIV_BUDGET_BYTES.events + 1) };
    expect(validatePriv(state).map((d) => d.code)).toEqual(['priv.budget']);
    expect(() => encodeSnapshot(state)).not.toThrow();
  });
  it('snapshotCodec 四个方法 == 模块函数；hash 为 u32', () => {
    expect(snapshotCodec.encode).toBe(encodeSnapshot); expect(snapshotCodec.decode).toBe(decodeSnapshot);
    expect(snapshotCodec.hash).toBe(hashSnapshot); expect(snapshotCodec.validatePriv).toBe(validatePriv);
    const { state } = createTestContext();
    const h = snapshotCodec.hash(state, 'full');
    expect(h).toBe(h >>> 0);
  });
});

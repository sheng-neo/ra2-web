// ===== sim/core/saveload.test.ts =====（ARCHITECTURE §4.3–§4.5；WORKPLAN WP1 验收）
// .SC2 往返 hash('sc2') 相同；priv 经 postLoad('sc2') 重建非空；compat 零区为零；phaseCursor > 0 导出抛错；importCity / exportCity 的顺序与对账。
// 用两个假系统补齐桩不做的事：terrain 把 alt / waterLevel / xter 写进 ALTM / XTER（测试双，非真实 ALTM 位布局）；services 带 priv、经 MISC 往返并在 postLoad 重建。
import { describe, expect, it } from 'vitest';
import { EXPORT_ORDER, IMPORT_ORDER, POSTLOAD_ORDER } from '../../contracts/clock';
import { MISC, MISC_ZERO_RANGES, miscGet, miscSet } from '../../contracts/io';
import { tileIndex } from '../../contracts/grid';
import type { PrivState } from '../../contracts/state';
import type { System, SystemId } from '../../contracts/system';
import { createTestContext, nullSystem, runDays, simInternalsOf } from '../../testkit';

interface ServicesPriv extends PrivState { v: number; counter: number; marks: Uint8Array }

/** 假系统集合 + 调用痕迹。 */
function fakes() {
  const trace: string[] = [];
  const terrain: System = {
    ...nullSystem('terrain'),
    importFrom(ctx, doc) { trace.push('import.terrain'); const L = ctx.state.layers; for (let i = 0; i < 16384; i++) { L.alt[i] = doc.altm[i]! & 0x1f; L.waterLevel[i] = (doc.altm[i]! >> 8) & 0x1f; } L.xter.set(doc.xter); },
    exportTo(ctx, doc) { trace.push('export.terrain'); const L = ctx.state.layers; for (let i = 0; i < 16384; i++) doc.altm[i] = (L.alt[i]! & 0x1f) | ((L.waterLevel[i]! & 0x1f) << 8); doc.xter.set(L.xter); },
    postLoad(_ctx, source) { trace.push(`postLoad.terrain:${source}`); },
  };
  const services: System = {
    ...nullSystem('services'),
    privVersion: 1,
    init(ctx, p) { nullSystem('services').init(ctx, p); ctx.state.priv.services = { v: 1, counter: 0, marks: new Uint8Array(4) } satisfies ServicesPriv; },
    phases: { dataMaps: (ctx) => { const p = ctx.state.priv.services as ServicesPriv; p.counter++; p.marks[p.counter & 3] = p.counter & 0xff; ctx.state.totals.crime = p.counter; return 'done'; } },
    exportTo(ctx, doc) { trace.push('export.services'); miscSet(doc.misc, MISC.crimeSum, ctx.state.totals.crime); },
    importFrom(ctx, doc) { trace.push('import.services'); ctx.state.totals.crime = miscGet(doc.misc, MISC.crimeSum); },
    postLoad(ctx, source) {
      trace.push(`postLoad.services:${source}`);
      if (source === 'sc2') {
        // 从真源重建 priv：counter = totals.crime（规格声明归零的 marks 保持默认）
        const counter = ctx.state.totals.crime;
        const marks = new Uint8Array(4); for (let k = 1; k <= counter; k++) marks[k & 3] = k & 0xff;
        ctx.state.priv.services = { v: 1, counter, marks } satisfies ServicesPriv;
      }
    },
  };
  return { trace, systems: [terrain, services] };
}

describe('saveload: .SC2 往返', () => {
  it.each(['optimistic', 'pessimistic'] as const)('[%s] exportSc2 → importSc2：hash(sc2) 相同、priv 重建非空且相等、mayorName 丢失只影响 full 档', (profile) => {
    const { systems } = fakes();
    const a = createTestContext({ profile, seed: 3, systems, params: { mayor: 'Keeper' } });
    a.ctx.act.setXbld(tileIndex(10, 10), 0x0e); a.ctx.act.setXzon(tileIndex(20, 20), 0xf3); a.ctx.act.setTerrain(tileIndex(5, 5), 7, 0x03, 7);
    runDays(a.host, 80);                                             // 4 次 dataMaps → counter 4
    const sc2 = a.host.hash('sc2'), full = a.host.hash('full');
    const privA = structuredClone(a.state.priv.services) as ServicesPriv;
    expect(privA.counter).toBe(4);
    const doc = a.host.exportSc2();
    expect(doc.cityName).toBe('Testopolis'); expect(doc.altm[tileIndex(5, 5)]).toBe(7 | (7 << 8)); expect(doc.xbld[tileIndex(10, 10)]).toBe(0x0e);
    expect(miscGet(doc.misc, MISC.prngMarker)).toBe(1); expect(miscGet(doc.misc, MISC.prngState)).toBe(a.state.clock.prngState);
    const b = createTestContext({ profile, seed: 44, systems: fakes().systems, params: { mayor: 'Other' } });
    runDays(b.host, 7);
    const diag = b.host.importSc2(doc);
    expect(diag.filter((d) => d.level === 'error')).toEqual([]);
    expect(b.host.hash('sc2')).toBe(sc2);
    expect(b.host.hash('full')).not.toBe(full);                      // mayorName 不在 .SC2 内（full 档）
    expect(b.state.mayorName).toBe('');
    expect(b.state.priv.services).toBeDefined();
    expect(b.state.priv.services).toEqual(privA);                    // 规格之外的字段重建后相等
    expect(b.state.clock.age).toBe(80); expect(b.state.clock.phaseCursor).toBe(0); expect(b.state.clock.modalPause).toBe(0);
    expect(b.ctx.prng.state()).toBe(a.ctx.prng.state());
    runDays(a.host, 25); runDays(b.host, 25);
    expect(b.host.hash('sc2')).toBe(a.host.hash('sc2'));
  });
  it('importFrom 按 IMPORT_ORDER、exportTo 按 EXPORT_ORDER、postLoad 按 POSTLOAD_ORDER（source 正确）', () => {
    const { trace, systems } = fakes();
    const tc = createTestContext({ systems });
    trace.length = 0;
    const doc = tc.host.exportSc2();
    expect(trace).toEqual(['export.terrain', 'export.services']);
    expect(EXPORT_ORDER.indexOf('terrain')).toBeLessThan(EXPORT_ORDER.indexOf('services'));
    trace.length = 0;
    tc.host.importSc2(doc);
    expect(trace).toEqual(['import.terrain', 'import.services', 'postLoad.services:sc2', 'postLoad.terrain:sc2']);
    expect(IMPORT_ORDER.indexOf('terrain')).toBeLessThan(IMPORT_ORDER.indexOf('services'));
    expect(POSTLOAD_ORDER.indexOf('services')).toBeLessThan(POSTLOAD_ORDER.indexOf('terrain'));
    trace.length = 0;
    tc.host.loadSnapshot(tc.host.saveSnapshot());
    expect(trace).toEqual(['postLoad.services:snapshot', 'postLoad.terrain:snapshot']);
  });
  it('compat 导出：零区全零（无 PRNG 标志 / 状态 / 版本 / 侧表）；默认导出写 PRNG 标志与 saveFormatVersion', () => {
    const { host, state } = createTestContext();
    runDays(host, 5);
    const plain = host.exportSc2();
    expect(miscGet(plain.misc, MISC.prngMarker)).toBe(1); expect(miscGet(plain.misc, MISC.saveFormatVersion)).toBe(2);
    expect(miscGet(plain.misc, MISC.prngState)).toBe(state.clock.prngState);
    state.rawMisc[MISC.xtxtShadow >> 2] = 0x1234;                    // 模拟侧表残留
    const compat = host.exportSc2({ compat: true });
    for (const [lo, hi] of MISC_ZERO_RANGES) for (let off = lo; off < hi; off += 4) expect(miscGet(compat.misc, off), `0x${off.toString(16)}`).toBe(0);
    expect(miscGet(compat.misc, MISC.cityAge)).toBe(5);              // 零区之外照写
    expect(miscGet(compat.misc, MISC.yearFounded)).toBe(1900);
    expect(miscGet(host.exportSc2().misc, MISC.xtxtShadow)).toBe(0x1234);
  });
  it('phaseCursor > 0 时 exportSc2 抛错；importSc2 / loadSnapshot 后挂起态归一', () => {
    const economy: System = { ...nullSystem('economy'), phases: { graphs: () => 'suspend' } };
    const { host, state } = createTestContext({ systems: [economy] });
    runDays(host, 21);
    simInternalsOf(host).stepDay();
    expect(state.clock.phaseCursor).toBe(4);
    expect(() => host.exportSc2()).toThrow(/phaseCursor/);
    expect(() => host.exportSc2({ compat: true })).toThrow(/phaseCursor/);
    const other = createTestContext();
    const doc = other.host.exportSc2();
    host.importSc2(doc);
    expect(state.clock.phaseCursor).toBe(0); expect(state.clock.modalPause).toBe(0);
    expect(() => host.exportSc2()).not.toThrow();
  });
  it('counts 对账：导出前 counts 被外部破坏 → 重算并记 core.countsMismatch；导入后 counts 与 xbld 一致', () => {
    const { host, state, ctx } = createTestContext();
    ctx.act.setXbld(tileIndex(3, 3), 0x70); ctx.act.setXbld(tileIndex(4, 4), 0x0e);
    state.counts.tile[0x70] = 99;
    const doc = host.exportSc2();
    expect(ctx.diag.some((d) => d.code === 'core.countsMismatch' && d.at === 'exportCity')).toBe(true);
    expect(state.counts.tile[0x70]).toBe(1);
    expect(miscGet(doc.misc, MISC.tileCounts + 0x70 * 4)).toBe(1);
    expect(miscGet(doc.misc, MISC.zoneTileCounts)).toBe(1); expect(miscGet(doc.misc, MISC.zoneTileCounts + 2 * 4)).toBe(1);
    const other = createTestContext();
    other.host.importSc2(doc);
    expect(other.state.counts.tile[0x70]).toBe(1); expect(other.state.counts.tile[0x0e]).toBe(1); expect(other.state.counts.tile[0]).toBe(16384 - 2);
    expect(Array.from(other.state.counts.zone)).toEqual([1, 0, 1, 0, 0, 0, 0, 0]);
    expect(simInternalsOf(other.host).reconcileCounts()).toBe(true);
  });
  it('importSc2 清空运行期缓冲：命令日志 / 事件 / 脏追踪重置并置 all；诊断只记录不拒绝', () => {
    const { host, ctx } = createTestContext();
    host.dispatch({ type: 'setSpeed', speed: 3 });
    ctx.act.setXbld(1, 0x0e);
    const doc = createTestContext().host.exportSc2();
    doc.xzon[7] = 0x0c; doc.xund[8] = 0x30;                          // 非法值 → core 清洗并记 info
    const diag = host.importSc2(doc);
    expect(diag.some((d) => d.code === 'core.importCleaned')).toBe(true);
    expect(host.commandLog()).toEqual([]); expect(host.drainEvents()).toEqual([]);
    expect(host.dirty.bulk.all).toBe(true);
    expect(host.state.layers.xzon[7]).toBe(0); expect(host.state.layers.xund[8]).toBe(0);
    expect(host.state.layers.xbld[1]).toBe(0);
  });
  it('importFrom 顺序常量：IMPORT_ORDER 覆盖 9 个系统且 core 紧随 terrain', () => {
    expect(IMPORT_ORDER.slice(0, 2)).toEqual(['terrain', 'core']);
    expect(new Set(IMPORT_ORDER).size).toBe(9);
    const ids: SystemId[] = ['core', 'terrain', 'placement', 'utilities', 'transport', 'zones', 'services', 'economy', 'events'];
    expect([...IMPORT_ORDER].sort()).toEqual([...ids].sort());
  });
});

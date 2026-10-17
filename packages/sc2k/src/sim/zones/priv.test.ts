// ===== sim/zones/priv.test.ts =====（priv 预算、系统注册外形、快照往返、.SC2 往返：postLoad('sc2') 由 XBLD 推断 + 计时器归 0、角标修复、版本不符重建）
import { describe, expect, it } from 'vitest';
import { END_OF_DAY_IO, PHASE_OWNER } from '../../contracts/clock';
import type { PhaseId } from '../../contracts/clock';
import { Corner, ZoneCode, tileIndex } from '../../contracts/grid';
import { MISC, miscGet } from '../../contracts/io';
import { PRIV_BUDGET_BYTES } from '../../contracts/snapshot';
import { CATALOGUE } from '../../data';
import { privEncodedSize, snapshotCodec } from '../../io/snapshot';
import { createTestContext, runDays } from '../../testkit';
import { zoneTableFor } from './buildings';
import { isBuiltZoneId, isConstructionId, placeLot, zoneRect } from './fixtures';
import { ZONES_MISC_EXT, createZonesSystem } from './index';
import { CONNECTION_MARK } from './neighbors';
import { createZonesPriv, ensureZonesPriv } from './priv';
import type { ZonesPriv } from './priv';

const TBL = zoneTableFor(CATALOGUE);
const privOf = (s: { priv: { zones?: unknown } }): ZonesPriv => s.priv.zones as ZonesPriv;
const ZONE_PHASES = (Object.keys(PHASE_OWNER) as PhaseId[]).filter((k) => PHASE_OWNER[k] === 'zones').sort();

describe('priv 与注册外形', () => {
  it('编码后 ≤ PRIV_BUDGET_BYTES.zones（128 KB），validatePriv 无错误', () => {
    expect(privEncodedSize(createZonesPriv(), 'zones')).toBeLessThanOrEqual(PRIV_BUDGET_BYTES.zones);
    const { ctx, host, state } = createTestContext({ profile: 'optimistic', systems: [createZonesSystem()] });
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 30, 30);
    runDays(host, 60);
    expect(snapshotCodec.validatePriv(state).filter((d) => d.level === 'error')).toEqual([]);
  });
  it('System：phases 恰为 PHASE_OWNER 归 zones 者、无命令、queries 只有 zones、endOfDay 已声明、privVersion ≥ 1', () => {
    const sys = createZonesSystem();
    expect(sys.id).toBe('zones'); expect(sys.stub).toBeUndefined();
    expect(Object.keys(sys.phases ?? {}).sort()).toEqual(ZONE_PHASES);
    expect(sys.commands).toBeUndefined();
    expect(Object.keys(sys.queries ?? {})).toEqual(['zones']);
    expect(typeof sys.endOfDay).toBe('function'); expect(END_OF_DAY_IO.zones).toBeDefined();
    expect(typeof sys.growthVisit).toBe('function'); expect(typeof sys.postLoad).toBe('function');
    expect(sys.privVersion).toBeGreaterThanOrEqual(1);
  });
  it('priv 版本 / 形状不符 → postLoad(snapshot) 重建并记 diag', () => {
    const sys = createZonesSystem();
    const { ctx, state } = createTestContext({ profile: 'optimistic', systems: [sys] });
    state.priv.zones = { v: 99 };
    sys.postLoad!(ctx, 'snapshot');
    expect(privOf(state).v).toBe(1); expect(privOf(state).phaseDays).toBeInstanceOf(Uint16Array);
    expect(ctx.diag.some((d) => d.code === 'zones.privReset')).toBe(true);
    const p = ensureZonesPriv(state);
    expect(p).toBe(state.priv.zones);
  });
});

describe('往返', () => {
  it('快照往返：hash(full) 相同、priv TypedArray 类型保留、载入后继续推进与不中断一致', () => {
    const a = createTestContext({ profile: 'optimistic', systems: [createZonesSystem()], seed: 5 });
    zoneRect(a.ctx, ZoneCode.DenseR, 10, 10, 20, 20); zoneRect(a.ctx, ZoneCode.DenseI, 30, 10, 40, 20);
    runDays(a.host, 70);
    const bytes = a.host.saveSnapshot();
    const b = createTestContext({ profile: 'optimistic', systems: [createZonesSystem()], seed: 9 });
    expect(b.host.loadSnapshot(bytes)).toEqual([]);
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
    expect(privOf(b.state).phaseDays).toBeInstanceOf(Uint16Array); expect(privOf(b.state).pendingId).toBeInstanceOf(Uint8Array);
    expect(Array.from(privOf(b.state).phaseDays)).toEqual(Array.from(privOf(a.state).phaseDays));
    runDays(a.host, 40); runDays(b.host, 40);
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
  });
  it('.SC2 往返：hash(sc2) 不变；priv 由 XBLD 推断（lotAt 一致）、计时器归 0；MISC 落点正确', () => {
    const a = createTestContext({ profile: 'optimistic', systems: [createZonesSystem()], seed: 11, flat: false, tuning: { zones: { fixedDemand: { r: 0, c: 0, i: 0 } } } });
    zoneRect(a.ctx, ZoneCode.DenseR, 10, 10, 20, 20); zoneRect(a.ctx, ZoneCode.DenseC, 30, 10, 40, 20);
    a.state.demand.r = a.state.demand.c = a.state.demand.i = 0;
    const built = placeLot(a.ctx, 0xaf, 10, 10), cons = placeLot(a.ctx, 0xa6, 14, 14), aban = placeLot(a.ctx, 0xab, 30, 10);
    a.state.layers.xtxt[tileIndex(64, 127)] = CONNECTION_MARK; a.ctx.act.setXbld(tileIndex(64, 127), 0x1e);
    a.state.census.arcoPop = 1200;
    runDays(a.host, 22);                                                           // 过 census / demand（连接重算、caps）
    const p = privOf(a.state);
    expect(p.phaseDays[built]).toBeGreaterThan(0); expect(p.phaseDays[cons]).toBe(22);
    const doc = a.host.exportSc2();
    const m = doc.misc;
    expect(miscGet(m, MISC.rciDemand)).toBe(a.state.demand.r); expect(miscGet(m, MISC.nationalPop)).toBe(a.state.national.population);
    expect(miscGet(m, MISC.neighbors + 16 + 4)).toBe(a.state.neighbors[1]!.population);
    expect(miscGet(m, MISC.residentialPop)).toBe(a.state.census.res); expect(miscGet(m, MISC.arcoPop)).toBe(1200);
    expect(miscGet(m, MISC.industryGraph)).toBe(a.state.industry.ratio[0]);
    expect(miscGet(m, ZONES_MISC_EXT)).toBe(0x5a4e5331);
    expect(a.state.neighbors[0]!.connections.road).toBe(1);
    const b = createTestContext({ profile: 'optimistic', systems: [createZonesSystem()], seed: 2, flat: false });
    const diag = b.host.importSc2(doc);
    expect(diag.filter((d) => d.level === 'error')).toEqual([]);
    expect(b.host.hash('sc2')).toBe(a.host.hash('sc2'));
    expect(b.state.neighbors.map((n) => n.name)).toEqual(a.state.neighbors.map((n) => n.name));
    expect(b.state.census).toEqual(a.state.census); expect(b.state.caps).toEqual(a.state.caps);
    const q = privOf(b.state);
    expect(q.phaseDays[built]).toBe(0); expect(q.phaseDays[cons]).toBe(0); expect(q.pendingId[cons]).toBe(0);
    for (const i of [built, cons, aban]) expect(b.ctx.q.zones.lotAt(i)).toEqual(a.ctx.q.zones.lotAt(i));
    // 施工瓦片的 pendingId 丢失：到期按地价 hash 抽取，仍能完工为同级 R 建筑
    runDays(b.host, 30);
    expect(isBuiltZoneId(b.state.layers.xbld[cons]!)).toBe(true); expect(TBL.level[b.state.layers.xbld[cons]!]).toBe(2); expect(TBL.zoneIdx[b.state.layers.xbld[cons]!]).toBe(0);
  });
  it('没有扩展块的存档（原版 / compat）：census 与邻城连接由图层重算；角标损坏的多格建筑被修复', () => {
    const a = createTestContext({ profile: 'optimistic', systems: [createZonesSystem()], seed: 11, flat: false, tuning: { zones: { fixedDemand: { r: 0, c: 0, i: 0 } } } });
    a.state.demand.r = a.state.demand.c = a.state.demand.i = 0;
    zoneRect(a.ctx, ZoneCode.DenseR, 10, 10, 20, 20);
    placeLot(a.ctx, 0xaf, 10, 10); placeLot(a.ctx, 0x8c, 14, 14); placeLot(a.ctx, 0x70, 18, 18);
    a.state.layers.xtxt[tileIndex(0, 40)] = CONNECTION_MARK; a.ctx.act.setXbld(tileIndex(0, 40), 0x2c);
    runDays(a.host, 25);
    const doc = a.host.exportSc2({ compat: true });
    expect(miscGet(doc.misc, ZONES_MISC_EXT)).toBe(0);
    doc.xzon[tileIndex(14, 14)] = doc.xzon[tileIndex(14, 14)]! & 0x0f;             // 破坏 2x2 的 TL 角标
    doc.xzon[tileIndex(15, 15)] = doc.xzon[tileIndex(15, 15)]! & 0x0f;
    const b = createTestContext({ profile: 'optimistic', systems: [createZonesSystem()], seed: 2, flat: false });
    const diag = b.host.importSc2(doc);
    expect(diag.some((d) => d.code === 'zones.noExt')).toBe(true);
    expect(diag.some((d) => d.code === 'zones.cornerRepair')).toBe(true);
    expect(b.state.layers.xzon[tileIndex(14, 14)]! & 0xf0).toBe(Corner.TL); expect(b.state.layers.xzon[tileIndex(15, 15)]! & 0xf0).toBe(Corner.BR);
    expect(b.ctx.q.zones.lotAt(tileIndex(15, 14))).toEqual({ anchor: tileIndex(14, 14), size: 2, level: 2, tier: 0, phase: 'built' });
    expect(b.state.census.res).toBe(900 + 200 + 24); expect(b.state.census.tiles.res).toBe(9 + 4 + 1);
    expect(b.state.neighbors[1]!.connections.rail).toBe(1);
    expect(b.state.census.res).toBe(a.state.census.res);
    expect(isConstructionId(b.state.layers.xbld[tileIndex(10, 10)]!)).toBe(false);
  });
});

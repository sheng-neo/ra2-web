import { describe, expect, it } from 'vitest';
import { halfIndex, quarterIndex, tileIndex } from '../../contracts/grid';
import { BudgetLine } from '../../contracts/state';
import { CATALOGUE } from '../../data';
import { createTestContext, runDays } from '../../testkit';
import { createServicesSystem } from './index';
import { build, daysUntil, flush, zoneRect } from './testFixtures';
import { Xbld } from './tables';

const sumOf = (a: Uint8Array): number => a.reduce((s, v) => s + v, 0);
const mk = (profile: 'optimistic' | 'pessimistic') => createTestContext({ profile, systems: [createServicesSystem()] });
const C1 = CATALOGUE.BUILDINGS.find((b) => b.category === 'zoneC' && b.size === 1 && b.transition === undefined)!.id;

describe.each(['optimistic', 'pessimistic'] as const)('services.dataMaps（%s 桩）', (profile) => {
  it('Σ XVAL / XCRM / XPLT == totals；未开发半格地价为 0；不消费 PRNG；bulk maps 脏', () => {
    const { ctx, host, state } = mk(profile);
    zoneRect(ctx, 1, 40, 40, 43, 43);
    for (let x = 40; x <= 43; x++) for (let y = 40; y <= 43; y++) build(ctx, 0x70, x, y);
    build(ctx, 0xcf, 20, 20);
    flush(host);
    host.dirty.take();
    const before = ctx.prng.state();
    runDays(host, daysUntil(host, 2) + 1);
    expect(ctx.prng.state()).toBe(before);
    const M = state.maps;
    expect(sumOf(M.xval)).toBe(state.totals.landValue);
    expect(sumOf(M.xcrm)).toBe(state.totals.crime);
    expect(sumOf(M.xplt)).toBe(state.totals.pollution);
    expect(state.totals.landValue).toBeGreaterThan(0);
    expect(state.totals.developedTiles).toBe(32);                 // 16 住宅格 + 煤电厂 16 格（XBLD ≥ 0x1D）
    expect(M.xval[halfIndex(100, 100)]).toBe(0);
    expect(M.xval[halfIndex(40, 40)]).toBeGreaterThan(0);
    expect(host.dirty.take().bulk.maps).toBe(true);
  });

  it('主次序 = halfIndex / quarterIndex：污染与密度落在 (x,y) 而不是转置位置', () => {
    const { ctx, host, state } = mk(profile);
    build(ctx, 0xcf, 20, 4);
    zoneRect(ctx, 1, 60, 8, 60, 8); build(ctx, 0x70, 60, 8);
    flush(host);
    runDays(host, daysUntil(host, 2) + 1);
    const M = state.maps;
    expect(M.xplt[halfIndex(20, 4)]).toBeGreaterThan(0);
    expect(M.xplt[halfIndex(4, 20)]).toBe(0);
    expect(M.xpop[quarterIndex(60, 8)]).toBe(4);
    expect(M.xpop[quarterIndex(8, 60)]).toBe(0);
  });

  it('煤电厂首月污染：4 格 × 50 = 200/半格，扩散后角半格 = (2·200 + 2·200) / (4 + 4) = 100；商业不污染', () => {
    const { ctx, host, state } = mk(profile);
    build(ctx, 0xcf, 20, 20);
    zoneRect(ctx, 3, 80, 80, 80, 80); build(ctx, C1, 80, 80);
    flush(host);
    runDays(host, daysUntil(host, 2) + 1);
    expect(state.maps.xplt[halfIndex(20, 20)]).toBe(100);
    expect(state.maps.xplt[halfIndex(80, 80)]).toBe(0);
    expect(state.maps.xplt[halfIndex(120, 120)]).toBe(0);
  });

  it('单栋 1×1 住宅的地价（宜居度五点均值 + 低密度 21 + dist/2 + 基线 32）', () => {
    const { ctx, host, state } = mk(profile);
    zoneRect(ctx, 1, 64, 64, 64, 64); build(ctx, 0x70, 64, 64);
    flush(host);
    runDays(host, daysUntil(host, 2) + 1);
    // 乐观桩全图受水：空格 4+4=8/格 → 满四分格 128、含建筑四分格 15×8+4 = 124 → mean5 = (124+4·128)/5 = 127；城市中心 (16,16) → dist = 64−16−16 = 32
    // 悲观桩无水：空格 4 → 64 / 60 → mean5 = 63
    expect(state.maps.xval[halfIndex(64, 64)]).toBe(profile === 'optimistic' ? 127 + 21 + 16 + 32 : 63 + 21 + 16 + 32);
    expect(ctx.q.services.landValue(tileIndex(64, 64))).toBe(state.maps.xval[halfIndex(64, 64)]);
    expect(ctx.q.services.cityCenter()).toEqual({ x: 32, y: 32 });
    expect(state.maps.xcrm[halfIndex(64, 64)]).toBe(0);
  });

  it('覆盖图案值表：满资金警局 TR 角位所在四分格 250 / 四邻 200 / 对角 150 / 二环 100 / 三环 50；断电（悲观桩）减半', () => {
    const { ctx, host, state } = mk(profile);
    state.economy.funding[BudgetLine.Police] = 100;
    build(ctx, Xbld.Police, 40, 40);           // TR 角位 = (42,40) → q = (10,10)
    flush(host);
    runDays(host, daysUntil(host, 2) + 1);
    const q = (qx: number, qy: number): number => state.maps.xplc[qx * 32 + qy]!;
    const k = profile === 'optimistic' ? 1 : 0.5;
    expect(q(10, 10)).toBe(250 * k);
    expect([q(11, 10), q(9, 10), q(10, 11), q(10, 9)]).toEqual([200 * k, 200 * k, 200 * k, 200 * k]);
    expect([q(11, 11), q(9, 9), q(11, 9), q(9, 11)]).toEqual([150 * k, 150 * k, 150 * k, 150 * k]);
    expect([q(12, 10), q(12, 9), q(12, 11), q(8, 10), q(10, 12), q(9, 12)]).toEqual(new Array<number>(6).fill(100 * k));
    expect([q(13, 10), q(13, 11), q(7, 9), q(10, 13), q(12, 12), q(8, 8), q(12, 8)]).toEqual(new Array<number>(7).fill(50 * k));
    expect([q(14, 10), q(13, 13), q(13, 12), q(6, 10)]).toEqual([0, 0, 0, 0]);
    expect(state.maps.xfir.every((v) => v === 0)).toBe(true);
    expect(state.maps.xplc[quarterIndex(42, 40)]).toBe(250 * k);
  });

  it('XROG：新城 0x7F；静止且 128 的格保持 128；人口出现后先升再收敛到 128', () => {
    const { ctx, host, state } = mk(profile);
    expect(state.maps.xrog.every((v) => v === 0x7f)).toBe(true);
    state.maps.xrog.fill(128);
    runDays(host, daysUntil(host, 2) + 1);
    expect(state.maps.xrog.every((v) => v === 128)).toBe(true);
    zoneRect(ctx, 1, 40, 40, 43, 43);
    for (let x = 40; x <= 43; x++) for (let y = 40; y <= 43; y++) build(ctx, 0x70, x, y);
    flush(host);
    const q = quarterIndex(40, 40);
    runDays(host, 25);
    expect(state.maps.xpop[q]).toBe(64);
    expect(state.maps.xrog[q]).toBe(Math.trunc((7 * 128 + 8 * 64 + 128) / 8));
    runDays(host, 25 * 30);
    expect(state.maps.xrog[q]).toBe(128);
    expect(state.maps.xrog.every((v) => v === 128)).toBe(true);
  });

  it('graphCurrent = total / (developedTiles/4 + 1)；pollution / crime 查询读半格', () => {
    const { ctx, host, state } = mk(profile);
    zoneRect(ctx, 1, 40, 40, 47, 47);
    for (let x = 40; x <= 47; x++) for (let y = 40; y <= 47; y++) build(ctx, 0x70, x, y);
    build(ctx, 0xcf, 50, 40);
    flush(host);
    runDays(host, daysUntil(host, 2) + 1);
    const t = state.totals;
    expect(t.developedTiles).toBe(80);                           // 64 住宅格 + 煤电厂 16 格
    expect(ctx.q.services.graphCurrent('landValue')).toBe(Math.trunc(t.landValue / (20 + 1)));
    expect(ctx.q.services.graphCurrent('pollution')).toBe(Math.trunc(t.pollution / 21));
    expect(ctx.q.services.graphCurrent('crime')).toBe(Math.trunc(t.crime / 21));
    expect(ctx.q.services.pollution(tileIndex(50, 40))).toBe(state.maps.xplt[halfIndex(50, 40)]);
    expect(ctx.q.services.crime(tileIndex(40, 40))).toBe(state.maps.xcrm[halfIndex(40, 40)]);
  });
});

describe('services.dataMaps（法令与废弃）', () => {
  it('邻里守望给分区建筑四分格 XPLC +2；赌博合法化抬高犯罪；废弃建筑地价减半', () => {
    const { ctx, host, state } = createTestContext({ profile: 'optimistic', systems: [createServicesSystem()] });
    zoneRect(ctx, 1, 40, 40, 43, 43);
    for (let x = 40; x <= 43; x++) for (let y = 40; y <= 43; y++) build(ctx, 0x70, x, y);
    flush(host);
    runDays(host, daysUntil(host, 2) + 1);
    const q = quarterIndex(40, 40), h = halfIndex(40, 40);
    expect(state.maps.xplc[q]).toBe(0);
    const crime0 = state.totals.crime, val0 = state.maps.xval[h]!;
    state.economy.ordinances = (1 << 7) | (1 << 2);          // NeighborhoodWatch(7) + LegalizedGambling(2)
    runDays(host, 25);
    expect(state.maps.xplc[q]).toBe(32);
    expect(state.totals.crime).toBeGreaterThan(crime0);
    build(ctx, 0x8a, 40, 40);                                 // 废弃 1×1 覆盖 (40,40)
    flush(host);
    state.economy.ordinances = 0;
    runDays(host, 25);
    expect(state.maps.xval[h]).toBeLessThan(val0);
  });
});

import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../contracts/grid';
import { BudgetLine } from '../../contracts/state';
import { createTestContext } from '../../testkit';
import { createServicesSystem } from './index';
import { exclusiveUsed, readRecord, recTileId } from './microsim';
import { MICROSIM_FIRST_EXCLUSIVE, MICROSIM_RECORDS, Xbld } from './tables';
import { build, clear, flush } from './testFixtures';
import { readLabel } from './xlab';

describe.each(['optimistic', 'pessimistic'] as const)('services.microsim（%s 桩）', (profile) => {
  it('独占记录 140 槽（10..149）按序分配，满则 −1；无记录建筑返回 0', () => {
    const { ctx, state } = createTestContext({ profile, systems: [createServicesSystem()] });
    const slots: number[] = [];
    for (let k = 0; k < 140; k++) slots.push(ctx.act.allocMicrosim(Xbld.Police));
    expect(slots[0]).toBe(MICROSIM_FIRST_EXCLUSIVE);
    expect(slots[139]).toBe(MICROSIM_RECORDS - 1);
    expect(new Set(slots).size).toBe(140);
    expect(exclusiveUsed(state.layers.xmic)).toBe(140);
    expect(ctx.act.allocMicrosim(Xbld.Hospital)).toBe(-1);
    expect(ctx.act.allocMicrosim(Xbld.SmallPark)).toBe(0);
    expect(ctx.act.allocMicrosim(0xdc)).toBe(0);
    expect(recTileId(state.layers.xmic, 10)).toBe(Xbld.Police);
  });

  it('共享记录不占槽：图书馆 → 8、博物馆 → 7（stat0 100）、大公园 → 6（stat2 +9/座）、码头 → 9；独占计数不变', () => {
    const { ctx, state } = createTestContext({ profile, systems: [createServicesSystem()] });
    expect(ctx.act.allocMicrosim(Xbld.Library)).toBe(8);
    expect(ctx.act.allocMicrosim(Xbld.Library)).toBe(8);
    expect(ctx.act.allocMicrosim(Xbld.Museum)).toBe(7);
    expect(ctx.act.allocMicrosim(Xbld.BigPark)).toBe(6);
    expect(ctx.act.allocMicrosim(Xbld.BigPark)).toBe(6);
    expect(ctx.act.allocMicrosim(Xbld.Marina)).toBe(9);
    const X = state.layers.xmic;
    expect(readRecord(X, 7).stat0).toBe(100);
    expect(readRecord(X, 6).stat2).toBe(18);
    expect(exclusiveUsed(X)).toBe(0);
    ctx.act.freeMicrosim(8);                                   // 共享记录保留
    expect(recTileId(X, 8)).toBe(Xbld.Library);
  });

  it('放置初值：医院 / 学校 / 大学 stat0 = 6；警局 stat1 = popCap(2·fund, 90)；消防 stat1 = popCap(fund/2, 70)、stat2 = 4；市政厅建成年', () => {
    const { ctx, state } = createTestContext({ profile, systems: [createServicesSystem()], params: { startYear: 1950 } });
    state.census.normalPop = 9000;
    state.economy.funding[BudgetLine.Police] = 100; state.economy.funding[BudgetLine.Fire] = 100;
    const X = state.layers.xmic;
    expect(readRecord(X, ctx.act.allocMicrosim(Xbld.Hospital)).stat0).toBe(6);
    expect(readRecord(X, ctx.act.allocMicrosim(Xbld.School)).stat0).toBe(6);
    expect(readRecord(X, ctx.act.allocMicrosim(Xbld.College)).stat0).toBe(6);
    expect(readRecord(X, ctx.act.allocMicrosim(Xbld.Police)).stat1).toBe(Math.min(200, Math.trunc(9000 / 90)));
    const fire = readRecord(X, ctx.act.allocMicrosim(Xbld.Fire));
    expect(fire.stat1).toBe(Math.min(50, Math.trunc(9000 / 70))); expect(fire.stat2).toBe(4);
    const hall = readRecord(X, ctx.act.allocMicrosim(Xbld.CityHall));
    expect(hall.stat1).toBe(Math.min(200, Math.trunc(9000 / 900))); expect(hall.stat2).toBe(1950);
    const arco = readRecord(X, ctx.act.allocMicrosim(Xbld.ArcoFirst));
    expect(arco.stat0).toBe(5); expect(arco.stat1).toBe(55); expect(arco.stat3).toBe(1950);
  });

  it('释放：记录清零、槽位可复用、XTXT 标签与 XLAB 清空；拆除（整栋变空地）由 onTilesChanged 自动释放', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createServicesSystem()] });
    const L = state.layers;
    const slot = ctx.act.allocMicrosim(Xbld.Police);
    expect(slot).toBe(10);
    const tiles = build(ctx, Xbld.Police, 40, 40);
    flush(host);                                               // 待绑定记录 → 占地 9 格写标签 0x3D
    expect(tiles.every((i) => L.xtxt[i] === 0x33 + slot)).toBe(true);
    expect(ctx.q.services.microsimOf(tileIndex(41, 41))).toEqual({ slot, tileId: Xbld.Police, stat0: 0, stat1: 0, stat2: 0, stat3: 0 });
    expect(host.dispatch({ type: 'rename', slot, text: 'Harbor Precinct' }).ok).toBe(true);
    expect(readLabel(L.xlab, 0x33 + slot)).toBe('Harbor Precinct');
    expect(ctx.q.services.queryStats(tileIndex(40, 40))).toEqual(expect.arrayContaining([{ key: 'query.name', value: 'Harbor Precinct' }, { key: 'query.officers', value: 0 }]));
    // 整栋拆为空地：标签与格上建筑不符 → 清标签，无引用 → 释放记录
    clear(ctx, tiles);
    flush(host);
    expect(recTileId(L.xmic, slot)).toBe(0);
    expect(tiles.every((i) => L.xtxt[i] === 0)).toBe(true);
    expect(readLabel(L.xlab, 0x33 + slot)).toBe('');
    expect(ctx.q.services.microsimOf(tileIndex(40, 40))).toBeNull();
    expect(ctx.act.allocMicrosim(Xbld.Fire)).toBe(10);        // 复用
    // 显式 freeMicrosim
    const s2 = ctx.act.allocMicrosim(Xbld.Hospital);
    expect(s2).toBe(11);
    ctx.act.freeMicrosim(s2);
    expect(recTileId(L.xmic, s2)).toBe(0);
    expect(ctx.act.allocMicrosim(Xbld.Hospital)).toBe(11);
  });

  it('放置者自己写标签（0x33 + slot）也可；共享建筑占地无标签时自动补写共享标签', () => {
    const { ctx, host, state } = createTestContext({ profile, systems: [createServicesSystem()] });
    const L = state.layers;
    const slot = ctx.act.allocMicrosim(Xbld.School);
    const tiles = build(ctx, Xbld.School, 10, 10);
    for (const i of tiles) L.xtxt[i] = 0x33 + slot;
    flush(host);
    expect(ctx.q.services.microsimOf(tileIndex(12, 12))?.slot).toBe(slot);
    expect(ctx.act.allocMicrosim(Xbld.Library)).toBe(8);
    const lib = build(ctx, Xbld.Library, 20, 20);
    flush(host);
    expect(lib.every((i) => L.xtxt[i] === 0x33 + 8)).toBe(true);
    expect(ctx.q.services.microsimOf(tileIndex(20, 20))?.slot).toBe(8);
  });

  it('structureCounts / seaportCranes / airportRunwayGroups / airportTiles 由 counts 与分区推出', () => {
    const { ctx, host } = createTestContext({ profile, systems: [createServicesSystem()] });
    build(ctx, Xbld.Police, 10, 10); build(ctx, Xbld.Police, 20, 10); build(ctx, Xbld.Prison, 30, 10); build(ctx, Xbld.Fire, 40, 10);
    build(ctx, Xbld.Hospital, 50, 10); build(ctx, Xbld.School, 60, 10); build(ctx, Xbld.College, 70, 10); build(ctx, Xbld.BusDepot, 80, 10);
    for (let k = 0; k < 7; k++) ctx.act.setXbld(tileIndex(90 + k, 10), Xbld.Crane);
    for (let k = 0; k < 12; k++) ctx.act.setXbld(tileIndex(90 + k, 20), Xbld.Runway);
    for (let x = 100; x < 110; x++) for (let y = 30; y < 36; y++) ctx.act.setXzon(tileIndex(x, y), 8);
    flush(host);
    expect(ctx.q.services.structureCounts()).toEqual({ police: 2, prison: 1, fire: 1, hospital: 1, school: 1, college: 1, busDepot: 1 });
    expect(ctx.q.services.seaportCranes()).toBe(7);
    expect(ctx.q.services.airportRunwayGroups()).toBe(2);
    expect(ctx.q.services.airportTiles()).toBe(60);
    for (let x = 100; x < 110; x++) ctx.act.setXzon(tileIndex(x, 30), 0);
    flush(host);
    expect(ctx.q.services.airportTiles()).toBe(50);
  });
});

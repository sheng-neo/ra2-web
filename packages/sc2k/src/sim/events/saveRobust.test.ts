// ===== sim/events/saveRobust.test.ts =====（fix-B：存档 / 导入健壮性回归）
// 伪造侧表的非法标签被拒绝；第三方暴乱 / 毒云标记只产生一条聚合诊断；XTHG 物件记录与 XTXT 指针一致（v1 清空）；
// MISC 0x1040 只在本项目存档中当作 pending；被灾害标记覆盖的邻城连接 0xFA 经侧表 / 几何兜底恢复。
import { describe, expect, it } from 'vitest';
import { CityMode, DisasterKind, TileMarker, tileIndex } from '../../contracts/grid';
import { MISC, miscGet, miscSet } from '../../contracts/io';
import type { Sc2Document } from '../../contracts/io';
import { NET_BASE } from '../../contracts/net';
import { createTestContext } from '../../testkit';
import { flush, lay } from '../transport/fixtures';
import { createTransportSystem } from '../transport';
import { placeBuilding, runTicks } from './fixtures';
import { createEventsSystem } from './index';
import type { EventsPriv } from './priv';
import { XTHG_RECORDS, XTHG_RECORD_BYTES, XTXT_CONNECTION, readShadow, writeShadow } from './save';

const fresh = (seed = 1) => createTestContext({ systems: [createEventsSystem()], seed });
const withTransport = (seed = 1) => createTestContext({ systems: [createEventsSystem(), createTransportSystem()], seed });
/** 一份本项目导出的空城文档（prngMarker = 1）。 */
const blankDoc = (): Sc2Document => fresh(7).host.exportSc2();
const asThirdParty = (doc: Sc2Document): Sc2Document => { miscSet(doc.misc, MISC.prngMarker, 0); miscSet(doc.misc, MISC.prngState, 0); return doc; };

describe('fix-B：events 读档健壮性', () => {
  it('伪造侧表：0xFF / 物件指针 / 0x00 / 共享标签等非法标签不写回 XTXT，只记一条 warn；合法标签照常恢复', () => {
    const doc = blankDoc();
    const tiles = [tileIndex(10, 10), tileIndex(11, 10), tileIndex(12, 10), tileIndex(13, 10), tileIndex(14, 10), tileIndex(15, 10), tileIndex(16, 10)];
    for (const t of tiles) doc.xtxt[t] = TileMarker.Fire;
    writeShadow(doc.misc, [
      { tile: tiles[0]!, label: 0xff }, { tile: tiles[1]!, label: 0xc9 }, { tile: tiles[2]!, label: 0x00 }, { tile: tiles[3]!, label: 0x36 },
      { tile: tiles[4]!, label: 0xfb },
      { tile: tiles[5]!, label: 0x40 }, { tile: tiles[6]!, label: 0x07 },
    ]);
    const b = fresh(2);
    const diag = b.host.importSc2(doc);
    const L = b.state.layers;
    for (const t of tiles.slice(0, 5)) expect(L.xtxt[t]).toBe(0);
    expect(L.xtxt[tiles[5]!]).toBe(0x40); expect(L.xtxt[tiles[6]!]).toBe(0x07);
    for (const t of tiles) expect(b.host.q.disasters.marker(t)).toBe(TileMarker.Fire);
    const bad = diag.filter((d) => d.code === 'events.xtxtShadowInvalid');
    expect(bad).toHaveLength(1); expect(bad[0]!.message).toContain('5 条');
  });

  it('第三方 2000 格暴乱 + 10 格毒云：只产生一条 markerUnsupported 计数诊断，标记全部清除', () => {
    const doc = asThirdParty(blankDoc());
    for (let k = 0; k < 2000; k++) doc.xtxt[k] = TileMarker.Rioters;
    for (let k = 3000; k < 3010; k++) doc.xtxt[k] = TileMarker.ToxicCloud;
    const b = fresh(2);
    const diag = b.host.importSc2(doc);
    const un = diag.filter((d) => d.code === 'events.markerUnsupported');
    expect(un).toHaveLength(1);
    expect(un[0]!.message).toContain('2010 格');
    expect(b.host.q.disasters.markers().every((m) => m === 0)).toBe(true);
    expect(diag.length).toBeLessThan(20);
  });

  it('XTHG：导入时物件记录 1..39 清空（头部记录 0 保留）并聚合诊断；导出的 XTHG 与"无物件指针"的 XTXT 一致', () => {
    const doc = blankDoc();
    doc.xthg[0] = 0x04; doc.xthg[1] = 0x02;                                       // 头部
    for (const r of [1, 2, 39]) { doc.xthg[r * XTHG_RECORD_BYTES] = 0x0a; doc.xthg[r * XTHG_RECORD_BYTES + 3] = 20 + r; }
    doc.xtxt[tileIndex(20, 21)] = 0xc9; doc.xtxt[tileIndex(20, 22)] = 0xca;       // 物件指针
    const b = fresh(2);
    const diag = b.host.importSc2(doc);
    const L = b.state.layers;
    expect(L.xthg[0]).toBe(0x04); expect(L.xthg[1]).toBe(0x02);
    expect(L.xthg.subarray(XTHG_RECORD_BYTES).every((v) => v === 0)).toBe(true);
    expect(L.xtxt[tileIndex(20, 21)]).toBe(0); expect(L.xtxt[tileIndex(20, 22)]).toBe(0);
    expect(diag.filter((d) => d.code === 'events.thingsDropped').map((d) => d.message)).toEqual([expect.stringContaining('3 条')]);
    // 导出：即使活状态里残留物件记录（旧版快照），doc.xthg 的物件槽也全部清 0，且没有 0xC9..0xEF 指针
    L.xthg[5 * XTHG_RECORD_BYTES] = 0x01;
    const out = b.host.exportSc2();
    expect(out.xthg[0]).toBe(0x04);
    for (let r = 1; r < XTHG_RECORDS; r++) expect(out.xthg[r * XTHG_RECORD_BYTES]).toBe(0);
    expect(out.xtxt.some((v) => v >= 0xc9 && v <= 0xef)).toBe(false);
  });

  it('MISC 0x1040：本项目存档读作 pending；第三方存档不当作待触发灾害（记 info），读档后推进不会起灾害', () => {
    const ours = blankDoc();
    miscSet(ours.misc, MISC.pendingDisaster, DisasterKind.Fire);
    const a = fresh(2);
    expect(a.host.importSc2(ours).some((d) => d.code === 'events.pendingIgnored')).toBe(false);
    expect(a.state.disaster.pending).toBe(DisasterKind.Fire);
    const third = asThirdParty(blankDoc());
    miscSet(third.misc, MISC.pendingDisaster, DisasterKind.Fire);
    const b = fresh(2);
    const diag = b.host.importSc2(third);
    expect(b.state.disaster.pending).toBe(DisasterKind.None);
    expect(diag.filter((d) => d.code === 'events.pendingIgnored')).toHaveLength(1);
    runTicks(b.host, 5);
    expect(b.state.clock.mode).toBe(CityMode.City); expect(b.state.disaster.active).toBe(false);
    expect(b.state.rawMisc[MISC.pendingDisaster >> 2]).toBe(DisasterKind.Fire);   // 原值仍在 rawMisc（不解释）
  });

  it('本项目存档无侧表时不再误报 signLost（只有第三方 / compat 存档才提示）', () => {
    const a = fresh(3);
    (a.state.priv.events as EventsPriv).marker[tileIndex(30, 30)] = TileMarker.Fire;
    const doc = a.host.exportSc2();
    expect(readShadow(doc.misc)).toBeNull();
    expect(fresh(4).host.importSc2(doc).some((d) => d.code === 'events.signLost')).toBe(false);
    const compat = a.host.exportSc2({ compat: true });
    expect(fresh(4).host.importSc2(compat).some((d) => d.code === 'events.signLost')).toBe(true);
  });
});

describe('fix-B：灾害中 .SC2 往返的已知有损（v1：XTHG 物件 v2）', () => {
  it('进行中的龙卷风不写入 .SC2：导出记 warn；读档后无物件 → 灾害在 postLoad 结束（hash("sc2") 在 mode / active 上不同，.sc2kweb 无损）', () => {
    const a = createTestContext({ systems: [createEventsSystem()], seed: 17, flat: false });
    a.host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Tornado });
    runTicks(a.host, 1);
    expect(a.host.q.disasters.things()).toHaveLength(1);
    expect(a.host.q.disasters.markers().every((m) => m === 0)).toBe(true);     // 空城：龙卷风没有点火
    const doc = a.host.exportSc2();
    expect(miscGet(doc.misc, MISC.cityMode)).toBe(CityMode.Disaster);
    expect(doc.xthg.subarray(XTHG_RECORD_BYTES).every((v) => v === 0)).toBe(true);
    expect(a.ctx.diag.some((d) => d.code === 'events.actorsNotSaved')).toBe(true);
    const b = createTestContext({ systems: [createEventsSystem()], seed: 18, flat: false });
    b.host.importSc2(doc);
    expect(b.host.q.disasters.things()).toHaveLength(0);
    expect(b.state.clock.mode).toBe(CityMode.City); expect(b.state.disaster.active).toBe(false);
    a.state.clock.disasterTicks = 0;                                          // core 字段，无 MISC 落点（hash 'full'）
    expect(b.host.hash('sc2')).not.toBe(a.host.hash('sc2'));
    b.state.clock.mode = CityMode.Disaster; b.state.disaster.active = true;   // 丢失的恰是"灾害仍在进行"这一点
    expect(b.host.hash('sc2')).toBe(a.host.hash('sc2'));
    // 无损路径：快照
    const c = fresh(19);
    c.host.loadSnapshot(a.host.saveSnapshot());
    expect(c.host.hash('full')).toBe(a.host.hash('full'));
    expect(c.host.q.disasters.things()).toHaveLength(1);
  });
  it('只有火 / 洪水标记的灾害中存档：.SC2 往返 hash("sc2") 相同（不变量在 v1 可表示的范围内成立）', () => {
    // 桩下只有 core 读写地形层：两端都不铺平地形，否则 ALTM 无人回读（与 shadow.test 同口径）
    const a = createTestContext({ systems: [createEventsSystem()], seed: 21, flat: false });
    for (let x = 40; x < 44; x++) for (let y = 40; y < 44; y++) placeBuilding(a.ctx, 0x70, x, y, 1);
    a.host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 41, y: 41 });
    runTicks(a.host, 4);
    expect(a.state.disaster.active).toBe(true);
    a.state.clock.disasterTicks = 0;                                          // core 字段，无 MISC 落点（open-questions #11，hash 'full'）
    const b = createTestContext({ systems: [createEventsSystem()], seed: 22, flat: false });
    b.host.importSc2(a.host.exportSc2());
    expect(b.state.disaster.active).toBe(true);
    expect(b.host.hash('sc2')).toBe(a.host.hash('sc2'));
  });
});

describe('fix-B：被灾害标记覆盖的邻城连接 0xFA', () => {
  /** T 边 (10, 0) 一格道路 TB 直线 + 0xFA，并被洪水标记覆盖。 */
  function floodedConnection(seed = 1) {
    const a = withTransport(seed);
    lay(a.ctx, 10, 0, NET_BASE.road + 1); lay(a.ctx, 10, 1, NET_BASE.road + 1); flush(a.host);
    a.state.layers.xtxt[tileIndex(10, 0)] = XTXT_CONNECTION; a.ctx.act.layerChanged('xtxt');
    (a.state.priv.events as EventsPriv).marker[tileIndex(10, 0)] = TileMarker.Flood;
    expect(a.host.q.transport.connections()).toEqual({ commerce: 1, industry: 0, total: 1 });
    return a;
  }
  it('本项目存档：0xFA 进侧表，读档后逐字节恢复、连接数不变；洪水退去后仍在', () => {
    const a = floodedConnection();
    const xtxt0 = a.state.layers.xtxt.slice();
    const doc = a.host.exportSc2();
    expect(doc.xtxt[tileIndex(10, 0)]).toBe(TileMarker.Flood);
    expect(readShadow(doc.misc)!.entries).toEqual([{ tile: tileIndex(10, 0), label: XTXT_CONNECTION }]);
    expect(miscGet(doc.misc, MISC.connectionTiles)).toBe(1);
    const b = withTransport(5);
    const diag = b.host.importSc2(doc);
    expect(b.state.layers.xtxt).toEqual(xtxt0);
    expect(b.host.q.disasters.marker(tileIndex(10, 0))).toBe(TileMarker.Flood);
    expect(b.host.q.transport.connections()).toEqual({ commerce: 1, industry: 0, total: 1 });
    expect(diag.some((d) => d.code === 'transport.connectionRestored')).toBe(false);   // 侧表已恢复，几何兜底不介入
    (b.state.priv.events as EventsPriv).marker[tileIndex(10, 0)] = 0;                 // 退水
    expect(b.host.q.transport.connections().total).toBe(1);
  });
  it('本项目存档侧表溢出（0xFA 排在最后被截掉）：transport 仍按 MISC 0x1024 差额用几何补回（复核修复）', () => {
    const a = floodedConnection();
    const doc = a.host.exportSc2();
    expect(miscGet(doc.misc, MISC.prngMarker)).not.toBe(0);
    writeShadow(doc.misc, []);                                                        // 模拟溢出：侧表里没有这条 0xFA
    const b = withTransport(5);
    const diag = b.host.importSc2(doc);
    expect(b.state.layers.xtxt[tileIndex(10, 0)]).toBe(XTXT_CONNECTION);
    expect(b.host.q.transport.connections().total).toBe(1);
    expect(diag.filter((d) => d.code === 'transport.connectionRestored')).toHaveLength(1);
  });
  it('compat / 第三方存档（无侧表）：transport 按边缘几何补回 0xFA，以 MISC 0x1024 为上限', () => {
    const a = floodedConnection();
    const compat = a.host.exportSc2({ compat: true });
    expect(readShadow(compat.misc)).toBeNull();
    const b = withTransport(5);
    const diag = b.host.importSc2(compat);
    expect(b.state.layers.xtxt[tileIndex(10, 0)]).toBe(XTXT_CONNECTION);
    expect(b.host.q.transport.connections().total).toBe(1);
    expect(diag.filter((d) => d.code === 'transport.connectionRestored')).toHaveLength(1);
    // 存档记录的连接格数为 0 → 不凭空补连接
    miscSet(compat.misc, MISC.connectionTiles, 0);
    const c = withTransport(5);
    c.host.importSc2(compat);
    expect(c.state.layers.xtxt[tileIndex(10, 0)]).toBe(0);
    expect(c.host.q.transport.connections().total).toBe(0);
  });
});

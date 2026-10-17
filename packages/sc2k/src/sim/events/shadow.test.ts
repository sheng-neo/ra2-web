// WP13 验收：XTXT 标记合成 / 剥离与侧表（灾害中快照与 .SC2 往返 xtxt / marker 逐字节相等；200 个带标签格侧表截断后微模拟标签全恢复）。
import { describe, expect, it } from 'vitest';
import { CityMode, DisasterKind, TileMarker, tileIndex } from '../../contracts/grid';
import { MISC } from '../../contracts/io';
import { createTestContext, runDays } from '../../testkit';
import { labelBuilding, placeBuilding, runTicks, runUntil } from './fixtures';
import { createEventsSystem } from './index';
import type { EventsPriv } from './priv';
import { FloodPhase } from './priv';
import { SHADOW_CAPACITY, composeXtxt, readShadow, writeShadow } from './save';

const POLICE = 0xd2, HOUSE = 0x70;
const fresh = (seed = 1) => createTestContext({ systems: [createEventsSystem()], seed });

describe('xtxt shadow', () => {
  it('composeXtxt / writeShadow / readShadow：标记覆盖原字节，微模拟标签在前标牌在后、同类 tile 升序；容量 168，超出置截断位', () => {
    const xtxt = new Uint8Array(16384), marker = new Uint8Array(16384), misc = new Int32Array(1200);
    xtxt[5] = 0x10; marker[5] = TileMarker.Flood;                           // 标牌
    xtxt[300] = 0x3d; marker[300] = TileMarker.Fire;                        // 微模拟
    xtxt[200] = 0x40; marker[200] = TileMarker.Fire;
    xtxt[7] = 0x36; marker[7] = TileMarker.Fire;                            // 共享标签：不入表
    xtxt[9] = 0x50;                                                          // 无标记：原样
    const out = xtxt.slice();
    const entries = composeXtxt(xtxt, marker, out);
    expect(entries).toEqual([{ tile: 200, label: 0x40 }, { tile: 300, label: 0x3d }, { tile: 5, label: 0x10 }]);
    expect(out[5]).toBe(TileMarker.Flood); expect(out[300]).toBe(TileMarker.Fire); expect(out[7]).toBe(TileMarker.Fire); expect(out[9]).toBe(0x50);
    expect(xtxt[5]).toBe(0x10);                                              // 不回写运行时 xtxt
    expect(writeShadow(misc, entries)).toBe(false);
    expect(misc[MISC.xtxtShadow >> 2]).toBe(0x58534844 | 0);                 // 'XSHD' 大端
    expect(readShadow(misc)).toEqual({ entries, truncated: false });
    const many = Array.from({ length: 200 }, (_, k) => ({ tile: k + 1000, label: 0x3d + (k % 100) }));
    expect(writeShadow(misc, many)).toBe(true);
    const back = readShadow(misc)!;
    expect(back.truncated).toBe(true); expect(back.entries).toEqual(many.slice(0, SHADOW_CAPACITY));
    expect(SHADOW_CAPACITY).toBe(168);
    expect(writeShadow(misc, [])).toBe(false); expect(readShadow(misc)).toBeNull();
  });

  it('灾害中快照往返：xtxt / marker 逐字节相等，hash(full) 相等，载入后继续推进与不中断一致', () => {
    const a = fresh(5);
    const anchor = placeBuilding(a.ctx, POLICE, 40, 40);
    labelBuilding(a.ctx, anchor, POLICE, 12);
    for (let x = 43; x < 50; x++) for (let y = 38; y < 46; y++) placeBuilding(a.ctx, HOUSE, x, y, 1);
    a.state.layers.xtxt[tileIndex(44, 40)] = 0x07;                          // 标牌
    a.host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 41, y: 41 });
    runTicks(a.host, 6);
    expect(a.state.clock.mode).toBe(CityMode.Disaster);
    expect(a.host.q.disasters.markers().some((m) => m === TileMarker.Fire)).toBe(true);
    const xtxt0 = a.state.layers.xtxt.slice(), marker0 = a.host.q.disasters.markers().slice();
    const bytes = a.host.saveSnapshot();
    const b = fresh(99);
    runTicks(b.host, 3);
    expect(b.host.loadSnapshot(bytes)).toEqual([]);
    expect(b.state.layers.xtxt).toEqual(xtxt0);
    expect(b.host.q.disasters.markers()).toEqual(marker0);
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
    expect(b.state.clock.mode).toBe(CityMode.Disaster); expect(b.state.disaster.active).toBe(true);
    runTicks(a.host, 30); runTicks(b.host, 30);
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
    expect(b.host.q.disasters.markers()).toEqual(a.host.q.disasters.markers());
  });

  it('灾害中 .SC2 往返：doc.xtxt 含标记与侧表，importSc2 后 xtxt / marker / 天气 / 发明年 / 状态机逐项相等', () => {
    const a = fresh(8);
    const anchor = placeBuilding(a.ctx, POLICE, 40, 40);
    const label = labelBuilding(a.ctx, anchor, POLICE, 12);
    for (let x = 43; x < 48; x++) for (let y = 38; y < 44; y++) placeBuilding(a.ctx, HOUSE, x, y, 1);
    a.state.layers.xtxt[tileIndex(44, 40)] = 0x07;
    a.host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 41, y: 41 });
    runTicks(a.host, 8);
    const P = a.state.priv.events as EventsPriv;
    P.marker[tileIndex(44, 40)] = TileMarker.Fire; P.fuel[tileIndex(44, 40)] = 10;   // 确保标牌格被覆盖
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) { const i = tileIndex(40 + dx, 40 + dy); if (P.marker[i] === 0) { P.marker[i] = TileMarker.Fire; P.fuel[i] = 16; } }
    const xtxt0 = a.state.layers.xtxt.slice(), marker0 = P.marker.slice();
    const doc = a.host.exportSc2();
    expect(doc.xtxt[tileIndex(41, 41)]).toBe(TileMarker.Fire);
    expect(doc.xtxt[tileIndex(44, 40)]).toBe(TileMarker.Fire);
    expect(readShadow(doc.misc)!.entries).toContainEqual({ tile: tileIndex(44, 40), label: 0x07 });
    expect(readShadow(doc.misc)!.entries.filter((e) => e.label === label)).toHaveLength(9);
    expect(doc.misc[MISC.disasterActive >> 2]).toBe(1); expect(doc.misc[MISC.disaster >> 2]).toBe(DisasterKind.Fire); expect(doc.misc[MISC.cityMode >> 2]).toBe(CityMode.Disaster);
    expect(a.state.layers.xtxt).toEqual(xtxt0);                              // 导出不改运行时
    const b = fresh(2);
    expect(b.host.importSc2(doc).filter((d) => d.level === 'error')).toEqual([]);
    expect(b.state.layers.xtxt).toEqual(xtxt0);
    expect(b.host.q.disasters.markers()).toEqual(marker0);
    expect(b.state.weather).toEqual(a.state.weather);
    expect(b.state.tech.invented).toEqual(a.state.tech.invented);
    expect(b.state.disaster.active).toBe(true); expect(b.state.disaster.current).toBe(DisasterKind.Fire);
    expect(b.state.clock.mode).toBe(CityMode.Disaster);
    expect((b.state.priv.events as EventsPriv).fuel[tileIndex(44, 40)]).toBe(10);   // 1×1 建筑按类型默认值重建
    expect(b.state.rawMisc.subarray(MISC.xtxtShadow >> 2, (MISC.xtxtShadow >> 2) + 128).every((v) => v === 0)).toBe(true);
    // 读档后能继续推进到结束
    let n = 0; while (b.state.disaster.active && n < 500) { runTicks(b.host, 1); n++; }
    expect(b.state.disaster.active).toBe(false);
  });

  it('灾害结束后 .SC2 往返 hash("sc2") 不变：events 写入 MISC 的天气 / 灾害 / 发明年标量都能回读', () => {
    // 桩下只有 core 读写地形层：两端都不铺平地形，否则 ALTM 无人回读（与 createSim.test 同口径）
    const a = createTestContext({ systems: [createEventsSystem()], seed: 6, flat: false });
    placeBuilding(a.ctx, HOUSE, 30, 30, 1);
    runDays(a.host, 60);
    a.host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 30, y: 30 });
    runTicks(a.host, 1);
    runUntil(a.host, () => !a.state.disaster.active, 300);
    expect(a.state.disaster.current).toBe(DisasterKind.Fire);
    a.state.clock.disasterTicks = 0;                                          // core 的字段，尚无 MISC 落点（open-questions #11）
    const h = a.host.hash('sc2');
    const doc = a.host.exportSc2();
    const b = createTestContext({ systems: [createEventsSystem()], seed: 9, flat: false });
    runDays(b.host, 10);
    b.host.importSc2(doc);
    expect(b.state.weather).toEqual(a.state.weather);
    expect(b.state.disaster).toEqual(a.state.disaster);
    expect(b.state.tech).toEqual(a.state.tech);
    expect(b.host.hash('sc2')).toBe(h);
  });

  it('225 个带独立标签的被淹格：侧表截断（168）→ 占地补全 + XMIC 反查后微模拟标签全部恢复（名字可能错配，有诊断）', () => {
    const a = fresh(3);
    const stations: { anchor: number; label: number }[] = [];
    let r = 10;
    for (let k = 0; k < 25; k++) {
      const x = 10 + (k % 5) * 4, y = 10 + Math.floor(k / 5) * 4;
      const anchor = placeBuilding(a.ctx, POLICE, x, y);
      stations.push({ anchor, label: labelBuilding(a.ctx, anchor, POLICE, r++) });
    }
    const P = a.state.priv.events as EventsPriv;
    for (const s of stations) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) P.marker[tileIndex((s.anchor >> 7) + dx, (s.anchor & 127) + dy)] = TileMarker.Flood;
    a.state.layers.xtxt[tileIndex(60, 60)] = 0x05; P.marker[tileIndex(60, 60)] = TileMarker.Flood;   // 一块标牌（允许丢失）
    a.state.disaster.active = true; a.state.disaster.current = DisasterKind.Flood; a.state.clock.mode = CityMode.Disaster;
    P.floodPhase = FloodPhase.Hold;
    const doc = a.host.exportSc2();
    expect(a.ctx.diag.some((d) => d.code === 'events.xtxtShadowTruncated')).toBe(true);
    expect(readShadow(doc.misc)!.truncated).toBe(true);
    const b = fresh(4);
    const diag = b.host.importSc2(doc);
    expect(diag.some((d) => d.code === 'events.xtxtShadowTruncated')).toBe(true);
    const wanted = new Set(stations.map((s) => s.label));
    const got = new Set<number>();
    for (const s of stations) {
      const first = b.state.layers.xtxt[s.anchor]!;
      expect(first).toBeGreaterThanOrEqual(0x3d); expect(first).toBeLessThanOrEqual(0xc8);
      for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) expect(b.state.layers.xtxt[tileIndex((s.anchor >> 7) + dx, (s.anchor & 127) + dy)]).toBe(first);
      got.add(first);
    }
    expect(got).toEqual(wanted);                                             // 每个标签恰好回到一座警局
    expect(b.host.q.disasters.markers()).toEqual(P.marker);
    expect(b.state.disaster.active).toBe(true);
  });
});

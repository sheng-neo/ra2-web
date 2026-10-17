// ===== testkit/goldenMiniCity.test.ts =====（WP1：金城脚本 / pngOf / 不变量检查 / headless 驱动器的自检）
import { describe, expect, it } from 'vitest';
import { FOOTPRINT } from '../contracts/footprint';
import { XBit, inMap, tileIndex, tileX, tileY } from '../contracts/grid';
import type { RenderSnapshot, SceneItem } from '../contracts/render';
import { mapCanvasSize } from '../contracts/render';
import { CATALOGUE } from '../data';
import { sceneCompiler } from '../render';
import {
  BUILTIN_PROCEDURAL_STUB, GOLDEN_IDS, GOLDEN_LAYOUT, bitmapHash, checkInvariants, createTestContext, flattenTerrain, goldenMiniCity, isMonochrome, pngOf,
  replayScript, runHeadless, runScript,
} from './index';

describe('goldenMiniCity: 脚本形状', () => {
  it('全部 id 来自 CATALOGUE；第一条 terrainDone；全部在 age 0 / phaseCursor 0 且 seq 递增；占地 / 矩形都在图内', () => {
    const g = goldenMiniCity();
    expect(g.commands[0]!.cmd.type).toBe('terrainDone');
    g.commands.forEach((c, k) => { expect(c.age).toBe(0); expect(c.phaseCursor).toBe(0); expect(c.seq).toBe(k); });
    for (const c of g.commands) {
      if (c.cmd.type === 'placeBuilding') {
        const def = CATALOGUE.BUILDINGS[c.cmd.id]!;
        expect(def.placeable).toBe(true);
        const n = FOOTPRINT[c.cmd.id]!;
        expect(inMap(c.cmd.x, c.cmd.y) && inMap(c.cmd.x + n - 1, c.cmd.y + n - 1)).toBe(true);
      } else if (c.cmd.type === 'zoneRect') {
        expect(inMap(c.cmd.x0, c.cmd.y0) && inMap(c.cmd.x1, c.cmd.y1)).toBe(true);
        expect(c.cmd.x0 <= c.cmd.x1 && c.cmd.y0 <= c.cmd.y1).toBe(true);
      } else if (c.cmd.type === 'network') {
        expect(c.cmd.from).toBeGreaterThanOrEqual(0); expect(c.cmd.to).toBeLessThan(16384);
        const dx = tileX(c.cmd.to) - tileX(c.cmd.from), dy = tileY(c.cmd.to) - tileY(c.cmd.from);
        expect(dx === 0 || dy === 0).toBe(true);                                      // 轴向直线
      }
    }
    expect(GOLDEN_IDS.coal).toBe(0xcf); expect(FOOTPRINT[GOLDEN_IDS.coal]).toBe(4); expect(FOOTPRINT[GOLDEN_IDS.hospital]).toBe(3); expect(FOOTPRINT[GOLDEN_IDS.railDepot]).toBe(2);
    for (const t of Object.values(GOLDEN_IDS.tools).flat()) expect(CATALOGUE.toolById(t)).toBeDefined();
    expect(g.params.terrain).toEqual({ coast: false, river: false, hills: 0, water: 0, trees: 0 });
  });
  it('布局无交叉：电线 / 道路 / 铁路 / 建筑占地两两不重叠；分区矩形与建筑占地不重叠', () => {
    const owner = new Map<number, string>();
    const claim = (i: number, who: string): void => { expect(owner.has(i), `${who} 与 ${owner.get(i)} 重叠于 (${tileX(i)},${tileY(i)})`).toBe(false); owner.set(i, who); };
    const line = (seg: { from: readonly [number, number]; to: readonly [number, number] }, who: string): void => {
      const [x0, y0] = seg.from, [x1, y1] = seg.to;
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { const i = tileIndex(x, y); if (owner.get(i) !== who) claim(i, who); }
    };
    const L = GOLDEN_LAYOUT;
    for (const s of L.wires) line(s, 'wire'); for (const s of L.roads) line(s, 'road'); line(L.rail, 'rail');
    const box = (p: { x: number; y: number }, n: number, who: string): void => { for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) claim(tileIndex(p.x + dx, p.y + dy), who); };
    box(L.coal, 4, 'coal'); box(L.pump, 1, 'pump'); box(L.hospital, 3, 'hospital'); box(L.railDepot, 2, 'depot');
    for (const z of L.zones) for (let x = z.x0; x <= z.x1; x++) for (let y = z.y0; y <= z.y1; y++) claim(tileIndex(x, y), `zone${z.zone}`);
  });
  it('脚本在全桩上下文中可派发（全部 notImplemented、不抛错、日志为空），变体行数不同', () => {
    const tc = replayScript(goldenMiniCity('full'), 25);
    expect(tc.state.clock.age).toBe(25);
    expect(tc.host.commandLog()).toEqual([]);                                             // 城市模式下 terrainDone 被拒绝，其余归桩
    expect(goldenMiniCity('noPower').commands.length).toBe(goldenMiniCity('full').commands.length - 3);
    expect(goldenMiniCity('noRoad').commands.length).toBe(goldenMiniCity('full').commands.length - 2);
    // 从地形编辑模式开始：terrainDone 真正生效并入日志
    const fresh = createTestContext();
    fresh.state.clock.mode = 0;
    expect(runScript(fresh.host, goldenMiniCity().commands, 1)).toBe(goldenMiniCity().commands.length);
    expect(fresh.host.commandLog().map((l) => l.cmd.type)).toEqual(['terrainDone']);
  });
});

describe('testkit: pngOf / 不变量 / runHeadless', () => {
  it('pngOf：PNG 签名、同输入同哈希、不同 rect 不同哈希；位图非单色', () => {
    const { state } = createTestContext();
    const snap: RenderSnapshot = {
      layers: state.layers, maps: state.maps, markers: new Uint8Array(16384),
      view: { zoom: 2, rotation: 0, centerX: 64, centerY: 64, underground: false, show: { buildings: true, signs: true, infrastructure: true, zones: true }, mapLayer: null },
      seaLevel: 4, artScale: 'M', trafficLight: 48, trafficHeavy: 160,
    };
    const items: SceneItem[] = sceneCompiler.compileAll(snap);
    expect(items.length).toBeGreaterThanOrEqual(16384);
    const size = mapCanvasSize(2);
    const rect = { x: Math.floor(size.w / 2) - 64, y: Math.floor(size.h / 2) - 32, w: 128, h: 64 };
    const a = pngOf(items, BUILTIN_PROCEDURAL_STUB, 'M', rect), b = pngOf(items, BUILTIN_PROCEDURAL_STUB, 'M', rect);
    expect(Array.from(a.png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(a.hash).toBe(b.hash); expect(a.png).toEqual(b.png);
    const c = pngOf(items, BUILTIN_PROCEDURAL_STUB, 'M', { ...rect, x: rect.x + 7 });
    expect(c.hash).not.toBe(a.hash);
    const empty = pngOf([], BUILTIN_PROCEDURAL_STUB, 'M', rect);
    expect(isMonochrome({ w: rect.w, h: rect.h, data: new Uint8Array(rect.w * rect.h), anchorX: 0, anchorY: 0, cycling: false })).toBe(true);
    expect(empty.hash).not.toBe(a.hash);
    expect(bitmapHash({ w: 1, h: 1, data: new Uint8Array([1]), anchorX: 0, anchorY: 0, cycling: false })).not.toBe(bitmapHash({ w: 1, h: 1, data: new Uint8Array([2]), anchorX: 0, anchorY: 0, cycling: false }));
  });
  it('checkInvariants：新建上下文为空；破坏 counts / 残留 Mark 位 / 悬空 XTXT / 角标损坏 / 利用率越界各报一条', () => {
    const { state, host } = createTestContext();
    expect(checkInvariants(state, host.catalogue)).toEqual([]);
    const snapshot = structuredClone(state);
    state.counts.tile[0] = state.counts.tile[0]! - 1;
    expect(checkInvariants(state, host.catalogue).some((m) => m.includes('counts.tile'))).toBe(true);
    state.counts.tile[0] = state.counts.tile[0]! + 1;
    state.layers.xbit[5] = XBit.Mark;
    expect(checkInvariants(state, host.catalogue).some((m) => m.includes('Mark'))).toBe(true);
    state.layers.xbit[5] = 0;
    state.layers.xtxt[6] = 0x3d;                                                           // 指向 XMIC 槽 0，但记录 tileId 为 0
    expect(checkInvariants(state, host.catalogue).some((m) => m.includes('XTXT'))).toBe(true);
    state.layers.xmic[0] = 1;
    expect(checkInvariants(state, host.catalogue)).toEqual([]);
    state.layers.xtxt[6] = 0;
    const bump = (id: number, d: number): void => { state.counts.tile[id] = state.counts.tile[id]! + d; };
    state.layers.xbld[tileIndex(50, 50)] = 0xcf; bump(0, -1); bump(0xcf, 1);                 // 4×4 建筑只有一格、无角标
    expect(checkInvariants(state, host.catalogue).some((m) => m.includes('锚点'))).toBe(true);
    state.layers.xbld[tileIndex(50, 50)] = 0; bump(0, 1); bump(0xcf, -1);
    state.utilities.power.usagePct = 101;
    expect(checkInvariants(state, host.catalogue).some((m) => m.includes('usagePct'))).toBe(true);
    state.utilities.power.usagePct = 0;
    state.economy.funds = -2_000_000;
    expect(checkInvariants(state, host.catalogue).some((m) => m.includes('funds'))).toBe(true);
    state.economy.funds = 0;
    expect(checkInvariants(state, host.catalogue)).toEqual([]);
    expect(checkInvariants(snapshot, host.catalogue)).toEqual([]);
  });
  it('runHeadless：每年一条记录、hash 与 host.hash 一致、phaseMsP95 覆盖全部 PhaseId、runTrips 计数生效', () => {
    const { host } = createTestContext();
    const records = runHeadless(host, goldenMiniCity(), { years: 2, afterNewCity: (h) => flattenTerrain(h.state) });
    expect(records.map((r) => r.year)).toEqual([1, 2]);
    expect(records[1]!.hash).toBe(host.hash('full')); expect(records[1]!.hashSc2).toBe(host.hash('sc2'));
    expect(Object.keys(records[0]!.phaseMsP95)).toHaveLength(27);
    expect(records[0]!.invariants).toEqual([]); expect(records[0]!.runTrips).toBe(0);
    host.q.transport.runTrip(0, 1, 0); host.q.transport.runTrip(1, 1, 0);
    const more = runHeadless(host, goldenMiniCity(), { years: 1 });
    expect(more[0]!.runTrips).toBe(0);                                                     // newCity 后重新计数
    host.q.transport.runTrip(0, 1, 0);
    expect(runHeadless(createTestContext().host, goldenMiniCity(), { years: 0 })).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { createDirtyTracker } from '../../contracts/dirty';
import type { SimEvent } from '../../contracts/events';
import { TILES, XBit, tileIndex } from '../../contracts/grid';
import { createCityState } from '../../contracts/state';
import type { SimContext, System, TileChangeKind } from '../../contracts/system';
import { CATALOGUE } from '../../data';
import { recountFromLayers } from './stateOps';
import { MAX_FANOUT_ROUNDS, TILE_CHANGE_KINDS, createTileWriter } from './tileWriter';

const R_BUILT = 0x70, C_BUILT = 0x7c, I_BUILT = 0x84, CONSTRUCTION = 0x88, COAL = 0xdd;

function setup() {
  const state = createCityState();
  const dirty = createDirtyTracker();
  const events: SimEvent[] = [];
  const diag: SimContext['diag'] = [];
  const ctx = { state, events, diag } as unknown as SimContext;
  const writer = createTileWriter(state, dirty, events, CATALOGUE);
  return { state, dirty, events, ctx, writer, act: writer.actions };
}

describe('tileWriter: counts 恒等', () => {
  it('setXbld 增量维护 counts.tile，与全量重数一致；总和恒 16384', () => {
    const { state, act } = setup();
    expect(state.counts.tile[0]).toBe(0);                       // createCityState 全零：counts 未初始化为 16384 个 0 号格
    recountFromLayers(state, CATALOGUE);
    expect(state.counts.tile[0]).toBe(TILES);
    let x = 7;
    for (let k = 0; k < 3000; k++) { x = (x * 1103515245 + 12345) >>> 0; act.setXbld((x >>> 8) % TILES, (x >>> 3) & 0xff); }
    const expected = new Int32Array(256);
    for (let i = 0; i < TILES; i++) { const id = state.layers.xbld[i]!; expected[id] = expected[id]! + 1; }
    expect(Array.from(state.counts.tile)).toEqual(Array.from(expected));
    expect(Array.from(state.counts.tile).reduce((a, b) => a + b, 0)).toBe(TILES);
  });
  it('counts.zone：已建 R/C/I 建筑格计入 slot 0/2/4/6，施工 / 非分区建筑不计；清除后归零', () => {
    const { state, act } = setup();
    recountFromLayers(state, CATALOGUE);
    act.setXbld(1, R_BUILT); act.setXbld(2, R_BUILT); act.setXbld(3, C_BUILT); act.setXbld(4, I_BUILT); act.setXbld(5, CONSTRUCTION); act.setXbld(6, COAL);
    expect(Array.from(state.counts.zone)).toEqual([4, 0, 2, 0, 1, 0, 1, 0]);
    const viaRecount = createCityState(); viaRecount.layers.xbld.set(state.layers.xbld); recountFromLayers(viaRecount, CATALOGUE);
    expect(Array.from(viaRecount.counts.zone)).toEqual(Array.from(state.counts.zone));
    act.setXbld(1, 0); act.setXbld(2, CONSTRUCTION); act.setXbld(3, 0); act.setXbld(4, 0);
    expect(Array.from(state.counts.zone)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('setXzon / setXund / setXbit / setTerrain 写入对应层；越界索引忽略', () => {
    const { state, act, dirty } = setup();
    const i = tileIndex(10, 20);
    act.setXzon(i, 0xf2); act.setXund(i, 0x1f); act.setXbit(i, XBit.Powered, true); act.setXbit(i, XBit.Powered | XBit.Water, false); act.setTerrain(i, 7, 0x0d, 9);
    expect(state.layers.xzon[i]).toBe(0xf2); expect(state.layers.xund[i]).toBe(0x1f); expect(state.layers.xbit[i]).toBe(0);
    expect(state.layers.alt[i]).toBe(7); expect(state.layers.xter[i]).toBe(0x0d); expect(state.layers.waterLevel[i]).toBe(9);
    act.setXbit(i, XBit.Watered, true); expect(state.layers.xbit[i]).toBe(XBit.Watered);
    const before = dirty.count;
    act.setXbld(-1, 1); act.setXbld(TILES, 1); act.setXzon(99999, 1); act.setTerrain(-5, 1, 1, 1);
    expect(dirty.count).toBe(before);
    expect(state.counts.tile[1]).toBe(0);
  });
});

describe('tileWriter: dirty 去重与扇出', () => {
  it('1000 格各 setXbld + setXzon 两次写只产生 1000 个脏项；layerChanged 置整层标志；emit 入 events', () => {
    const { act, dirty, events } = setup();
    for (let k = 0; k < 1000; k++) { const i = tileIndex(k % 128, Math.floor(k / 128)); act.setXbld(i, 0x70); act.setXzon(i, 0xf1); act.setXbld(i, 0x71); }
    expect(dirty.count).toBe(1000);
    act.layerChanged('xbit'); act.layerChanged('maps');
    expect(dirty.bulk.xbit).toBe(true); expect(dirty.bulk.maps).toBe(true); expect(dirty.bulk.all).toBe(false);
    act.emit({ type: 'uiRefresh' });
    expect(events).toEqual([{ type: 'uiRefresh' }]);
    const taken = dirty.take();
    expect(taken.tiles.length).toBe(1000); expect(dirty.count).toBe(0);
  });
  it('flush 按 kind 固定顺序批量扇出到实现了 onTilesChanged 的系统，每格每 kind 一次；无监听者也清空本批', () => {
    const { ctx, writer, act } = setup();
    const calls: { id: string; kind: TileChangeKind; tiles: number[] }[] = [];
    const listener = (id: 'zones' | 'services'): System => ({ id, init() {}, onTilesChanged(_c, tiles, kind) { calls.push({ id, kind, tiles: [...tiles] }); } });
    const mute: System = { id: 'terrain', init() {} };
    act.setXzon(5, 1); act.setXbld(5, 0x70); act.setXbld(5, 0x71); act.setXund(9, 2); act.setTerrain(3, 4, 0, 4); act.setXbit(5, XBit.Powered, true); act.setXbld(6, 0x72);
    expect(writer.pendingCount).toBe(6);
    writer.flush(ctx, [mute, listener('zones'), listener('services')]);
    expect(writer.pendingCount).toBe(0);
    expect(calls.map((c) => `${c.id}:${c.kind}:${c.tiles.join(',')}`)).toEqual([
      'zones:terrain:3', 'services:terrain:3', 'zones:building:5,6', 'services:building:5,6', 'zones:zone:5', 'services:zone:5',
      'zones:underground:9', 'services:underground:9', 'zones:bit:5', 'services:bit:5']);
    expect(TILE_CHANGE_KINDS).toEqual(['terrain', 'building', 'zone', 'underground', 'bit']);
    act.setXbld(7, 1); writer.flush(ctx, []); expect(writer.pendingCount).toBe(0);
  });
  it('onTilesChanged 期间的再写入会再扇出；无限连锁在 MAX_FANOUT_ROUNDS 轮后停止并记 diag', () => {
    const { ctx, writer, act, state } = setup();
    let rounds = 0;
    const chain: System = { id: 'zones', init() {}, onTilesChanged(_c, tiles) { rounds++; act.setXbld((tiles[0]! + 1) % TILES, 1); } };
    act.setXbld(0, 1);
    writer.flush(ctx, [chain]);
    expect(rounds).toBe(MAX_FANOUT_ROUNDS);
    expect(writer.pendingCount).toBe(0);
    expect(ctx.diag.some((d) => d.code === 'core.fanoutLoop')).toBe(true);
    expect(state.layers.xbld[MAX_FANOUT_ROUNDS]).toBe(1);
    // 有限连锁：两轮后自然停止，无 diag
    const d2 = setup();
    let n = 0;
    const finite: System = { id: 'zones', init() {}, onTilesChanged(_c, tiles) { if (tiles[0] === 0) d2.act.setXzon(1, 1); n++; } };
    d2.act.setXbld(0, 1); d2.writer.flush(d2.ctx, [finite]);
    expect(n).toBe(2); expect(d2.ctx.diag).toEqual([]);
  });
});

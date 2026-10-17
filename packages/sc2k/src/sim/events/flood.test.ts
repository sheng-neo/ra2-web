// WP13 验收：洪水（GROW 不越过 floodAlt+1；RECEDE 后标记清零；被淹建筑毁、道路留）。
import { describe, expect, it } from 'vitest';
import { DisasterKind, TileMarker, XBit, tileIndex, tileX } from '../../contracts/grid';
import { createTestContext } from '../../testkit';
import { ofType, placeBuilding, runTicks } from './fixtures';
import { createEventsSystem } from './index';
import { FloodPhase } from './priv';
import type { EventsPriv } from './priv';

const HOUSE = 0x70, ROAD_TB = 0x1e, WIRE = 0x0f;

describe('flood', () => {
  it('从岸边起淹：面积受上限、不越过 floodAlt+1 的堤坝；建筑 / 电线毁、道路留；退去后标记全清', () => {
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 21 });
    const L = state.layers;
    // 左侧三列水（淡水），平地 alt 4；x = 8..9 抬高到 7 作堤坝
    for (let x = 0; x < 3; x++) for (let y = 0; y < 128; y++) { const i = tileIndex(x, y); L.xbit[i] = L.xbit[i]! | XBit.Water; L.xter[i] = 0x30; L.waterLevel[i] = 4; L.alt[i] = 3; }
    for (let x = 8; x < 10; x++) for (let y = 0; y < 128; y++) { const i = tileIndex(x, y); L.alt[i] = 7; L.waterLevel[i] = 7; }
    for (let y = 0; y < 128; y++) { placeBuilding(ctx, HOUSE, 4, y, 1); ctx.act.setXbld(tileIndex(6, y), ROAD_TB); ctx.act.setXbld(tileIndex(5, y), WIRE); placeBuilding(ctx, HOUSE, 10, y, 1); }
    host.drainEvents();
    expect(host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Flood }).ok).toBe(true);
    runTicks(host, 1);
    expect(state.disaster.active).toBe(true);
    const P = state.priv.events as EventsPriv;
    expect(P.floodPhase).toBe(FloodPhase.Grow);
    expect(P.floodMax).toBeGreaterThanOrEqual(48); expect(P.floodMax).toBeLessThanOrEqual(96);
    expect(tileX(tileIndex(P.floodOx, P.floodOy))).toBe(3);                 // 原点 = 与水相邻的陆地格
    let peak = 0;
    const phases = new Set<number>();
    for (let k = 0; k < 400 && state.disaster.active; k++) {
      runTicks(host, 1);
      phases.add(P.floodPhase);
      let area = 0;
      host.q.disasters.markers().forEach((m, i) => {
        if (m !== TileMarker.Flood) return;
        area++;
        expect(L.alt[i]).toBeLessThanOrEqual(P.floodAlt + 1);
        expect(tileX(i)).toBeLessThan(8);
        expect(ctx.q.terrain.isWater(i)).toBe(false);
      });
      peak = Math.max(peak, area);
    }
    expect(state.disaster.active).toBe(false);
    expect(phases.has(FloodPhase.Hold)).toBe(true); expect(phases.has(FloodPhase.Recede)).toBe(true);
    expect(peak).toBeGreaterThan(8); expect(peak).toBeLessThanOrEqual(P.floodMax);
    expect(host.q.disasters.markers().every((m) => m === 0)).toBe(true);
    expect(P.floodPhase).toBe(FloodPhase.None);
    const destroyed = ofType(host.drainEvents(), 'structureDestroyed');
    expect(destroyed.length).toBeGreaterThan(0);
    expect(destroyed.every((e) => e.cause === DisasterKind.Flood)).toBe(true);
    expect(destroyed.some((e) => e.oldId === HOUSE)).toBe(true);
    for (let y = 0; y < 128; y++) { expect(L.xbld[tileIndex(6, y)]).toBe(ROAD_TB); expect(L.xbld[tileIndex(10, y)]).toBe(HOUSE); }
    let rubble = 0;
    for (let y = 0; y < 128; y++) { const id = L.xbld[tileIndex(4, y)]!; if (id >= 1 && id <= 4) rubble++; }
    expect(rubble).toBeGreaterThan(0);
    const paper = host.q.news.currentPaper();
    expect(paper?.extra).toBe(true);
    expect(paper?.headline?.type).toBe(23);                                 // NewsType.DisasterFlood
  });

  it('无水地图：Flood 不可触发；调度单位 3×3 内不被淹', () => {
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 4 });
    const L = state.layers;
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Flood });
    runTicks(host, 1);
    expect(state.disaster.active).toBe(false);
    // 水 + 单位保护
    for (let y = 0; y < 128; y++) { const i = tileIndex(0, y); L.xbit[i] = L.xbit[i]! | XBit.Water; L.alt[i] = 3; }
    ctx.act.setXbld(tileIndex(64, 64), 0);
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Flood });
    runTicks(host, 1);
    expect(state.disaster.active).toBe(true);
    const P = state.priv.events as EventsPriv;
    P.units.push({ kind: 0, x: 1, y: P.floodOy, order: 0 });              // 警察直接护住原点右侧
    for (let k = 0; k < 30; k++) {
      runTicks(host, 1);
      for (let dy = -1; dy <= 1; dy++) for (let dx = 0; dx <= 2; dx++) {
        const x = 1 + dx, y = P.floodOy + dy;
        if (x < 128 && y >= 0 && y < 128 && tileIndex(x, y) !== tileIndex(P.floodOx, P.floodOy)) expect(host.q.disasters.marker(tileIndex(x, y))).toBe(0);
      }
    }
  });
});

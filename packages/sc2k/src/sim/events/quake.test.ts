// WP13 验收：地震（magnitude 范围；一次性结算后进入火灾流程；报纸 value = 震级×10）。
import { describe, expect, it } from 'vitest';
import { NewsType } from '../../contracts/events';
import { DisasterKind, TileMarker, tileIndex } from '../../contracts/grid';
import { createTestContext } from '../../testkit';
import { ofType, placeBuilding, runTicks, runUntil } from './fixtures';
import { createEventsSystem } from './index';
import type { EventsPriv } from './priv';
import { DEFAULT_EVENTS_TUNING } from './tuning';

const HOUSE = 0x70, ROAD_LR = 0x1d;

describe('earthquake', () => {
  it('magnitude×10 ∈ [50, 89]（多种子）', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed });
      placeBuilding(ctx, HOUSE, 10, 10);
      host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Earthquake });
      runTicks(host, 1);
      const P = state.priv.events as EventsPriv;
      expect(P.quakeMag10).toBeGreaterThanOrEqual(50); expect(P.quakeMag10).toBeLessThanOrEqual(89);
      expect(P.quakeShake).toBe(DEFAULT_EVENTS_TUNING.quake.shakeTicks);
    }
  });

  it('第 1 tick 一次性结算（瓦砾 + 次生火 + 地下随机清除）→ 余震倒数 → 火灾流程 → 结束时报纸 value = 震级×10', () => {
    const tuning = { events: { quake: { ...DEFAULT_EVENTS_TUNING.quake, fireChance: 1, undergroundChance: 1 } } };
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 42, tuning });
    for (let x = 20; x < 40; x++) for (let y = 20; y < 40; y++) { placeBuilding(ctx, HOUSE, x, y, 1); ctx.act.setXund(tileIndex(x, y), 0x12); }
    for (let x = 20; x < 40; x++) ctx.act.setXbld(tileIndex(x, 41), ROAD_LR);
    host.drainEvents();
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Earthquake });
    runTicks(host, 1);                                                      // 启动（结算在 seed 阶段）
    const P = state.priv.events as EventsPriv;
    const mag = P.quakeMag10;
    const destroyed = ofType(host.drainEvents(), 'structureDestroyed');
    expect(destroyed.length).toBeGreaterThan(0);
    expect(destroyed.every((e) => e.cause === DisasterKind.Earthquake)).toBe(true);
    let fires = 0, rubble = 0, undCleared = 0;
    for (const e of destroyed) {
      const i = tileIndex(e.x, e.y);
      if (host.q.disasters.marker(i) === TileMarker.Fire) fires++;
      const id = state.layers.xbld[i]!; if (id >= 1 && id <= 4) rubble++;
      if (state.layers.xund[i] === 0) undCleared++;
    }
    expect(rubble).toBe(destroyed.length);                                  // 房屋与道路都变瓦砾
    expect(destroyed.some((e) => e.oldId === HOUSE)).toBe(true);
    expect(fires).toBeGreaterThan(0);
    expect(undCleared).toBe(destroyed.length);                              // undergroundChance=1：被毁格下的管线全清
    // 余震期间不结束
    runTicks(host, 3);
    expect(state.disaster.active).toBe(true);
    expect(P.quakeShake).toBeLessThan(DEFAULT_EVENTS_TUNING.quake.shakeTicks);
    const used = runUntil(host, () => !state.disaster.active, 1500);
    expect(used).toBeLessThan(1500);
    expect(host.q.disasters.markers().every((m) => m === 0)).toBe(true);
    const paper = host.q.news.currentPaper();
    expect(paper?.headline).toMatchObject({ type: NewsType.DisasterEarthquake, value: mag });
    expect(ofType(host.drainEvents(), 'disasterEnded')[0]).toMatchObject({ kind: DisasterKind.Earthquake });
  });
});

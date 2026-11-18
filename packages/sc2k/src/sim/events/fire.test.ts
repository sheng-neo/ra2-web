// WP13 验收：火灾（警局点火 → 蔓延受 XFIR 抑制 → 扑灭 → 标签与 XMIC 绑定不变；燃尽 → 瓦砾 + 角标清 + 分区保留；火不过路）。
import { describe, expect, it } from 'vitest';
import { Corner, DisasterKind, TileMarker, quarterOfTile, tileIndex } from '../../contracts/grid';
import { createTestContext } from '../../testkit';
import { labelBuilding, ofType, placeBuilding, runTicks, runUntil } from './fixtures';
import { pickFireOrigin } from './fire';
import { createEventsSystem } from './index';
import { DEFAULT_EVENTS_TUNING } from './tuning';

const HOUSE = 0x70, POLICE = 0xd2, R2 = 0x8c, ROAD_TB = 0x1e, COAL = 0xcf;
const fireTuning = (over: Partial<typeof DEFAULT_EVENTS_TUNING.fire>) => ({ events: { fire: { ...DEFAULT_EVENTS_TUNING.fire, ...over } } });

describe('fire', () => {
  it('警局点火 → XFIR 满覆盖下扑灭 → 建筑保留、xtxt 标签与 XMIC 记录不变', () => {
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 3, tuning: fireTuning({ extinguishPerCoverage: 0.6 }) });
    const anchor = placeBuilding(ctx, POLICE, 40, 40);
    const label = labelBuilding(ctx, anchor, POLICE, 10);
    state.maps.xfir.fill(255);
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 41, y: 41 });
    runTicks(host, 1);
    expect(host.q.disasters.marker(tileIndex(41, 41))).toBe(TileMarker.Fire);
    const used = runUntil(host, () => !state.disaster.active, 200);
    expect(used).toBeLessThan(200);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      const i = tileIndex(40 + dx, 40 + dy);
      expect(state.layers.xbld[i]).toBe(POLICE);
      expect(state.layers.xtxt[i]).toBe(label);
    }
    expect(state.layers.xmic[10 * 8]).toBe(POLICE);
    expect(ofType(host.drainEvents(), 'structureDestroyed')).toHaveLength(0);
  });

  it('蔓延受 XFIR 抑制：同一种子下满覆盖比零覆盖烧到的格少', () => {
    const burnedTiles = (coverage: number): number => {
      const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 11, tuning: fireTuning({ extinguishPerCoverage: 0 }) });
      for (let x = 30; x < 42; x++) for (let y = 30; y < 42; y++) placeBuilding(ctx, HOUSE, x, y, 1);
      state.maps.xfir.fill(coverage);
      host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 36, y: 36 });
      const ever = new Set<number>();
      for (let k = 0; k < 40; k++) { runTicks(host, 1); host.q.disasters.markers().forEach((m, i) => { if (m === TileMarker.Fire) ever.add(i); }); }
      return ever.size;
    };
    const none = burnedTiles(0), full = burnedTiles(255);
    expect(none).toBeGreaterThan(20);
    expect(full).toBeLessThan(none / 2);
  });

  it('§3.4 燃尽次序：本 tick 新点燃的格也扣一次燃料——1×1 房子从被引燃到烧毁恰 fuel − 1 个 tick', () => {
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 4, tuning: fireTuning({ spreadBase: 1, extinguishPerCoverage: 0 }) });
    placeBuilding(ctx, HOUSE, 20, 20); placeBuilding(ctx, HOUSE, 21, 20);
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 20, y: 20 });
    const b = tileIndex(21, 20);
    let ignitedAt = -1, destroyedAt = -1;
    for (let k = 0; k < 40 && destroyedAt < 0; k++) {
      runTicks(host, 1);
      if (ignitedAt < 0 && host.q.disasters.marker(b) === TileMarker.Fire) ignitedAt = k;
      if (state.layers.xbld[b] !== HOUSE) destroyedAt = k;
    }
    expect(ignitedAt).toBeGreaterThanOrEqual(0);
    expect(destroyedAt - ignitedAt).toBe(DEFAULT_EVENTS_TUNING.fire.fuel.s1 - 1);
  });

  it('消防覆盖明显抑制（默认数值）：XFIR 200（满资金消防局 7 格内）烧到的格不到零覆盖的 1/10', () => {
    const burned = (coverage: number, seed: number): number => {
      const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed });
      for (let x = 30; x < 46; x++) for (let y = 30; y < 46; y++) placeBuilding(ctx, HOUSE, x, y, 1);
      state.maps.xfir.fill(coverage);
      host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 38, y: 38 });
      const ever = new Set<number>();
      for (let k = 0; k < 400 && (k === 0 || state.disaster.active); k++) { runTicks(host, 1); host.q.disasters.markers().forEach((m, i) => { if (m === TileMarker.Fire) ever.add(i); }); }
      return ever.size;
    };
    let none = 0, covered = 0;
    for (let seed = 1; seed <= 6; seed++) { none += burned(0, seed); covered += burned(200, seed); }
    expect(none).toBeGreaterThan(6 * 200);
    expect(covered).toBeLessThan(none / 10);
  });

  it('随机起火点按 XPOP 加权，但只给有人口的建筑加权：独占一个四分格的 4×4 煤电（XPOP 128）不再是最常见起火点', () => {
    let plant = 0, houses = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { ctx, state } = createTestContext({ systems: [createEventsSystem()], seed });
      placeBuilding(ctx, COAL, 40, 40);                                                     // 四分格 (10,10) 整格
      for (let x = 48; x < 56; x++) placeBuilding(ctx, HOUSE, x, 41, 1);                     // 8 座房子：四分格 (12,10) / (13,10)
      state.maps.xpop[quarterOfTile(tileIndex(40, 40))] = 128;                               // services：16 格 × 2 × 4
      state.maps.xpop[quarterOfTile(tileIndex(48, 41))] = 16; state.maps.xpop[quarterOfTile(tileIndex(52, 41))] = 16;
      const i = pickFireOrigin(ctx);
      if (state.layers.xbld[i] === COAL) plant++; else if (state.layers.xbld[i] === HOUSE) houses++;
    }
    expect(plant + houses).toBe(60);
    expect(plant).toBeLessThan(10);                                                          // 16 / (16 + 8 × 17) ≈ 10.5% 期望；照搬 XPOP 时 ≈ 94%
    // 只有无人口建筑时仍可选中（等权）
    const only = createTestContext({ systems: [createEventsSystem()], seed: 1 });
    placeBuilding(only.ctx, COAL, 40, 40);
    expect(only.state.layers.xbld[pickFireOrigin(only.ctx)]).toBe(COAL);
  });

  it('燃尽 → 整栋瓦砾 0x01..0x04 + 角标清 + 分区 nibble 保留 + 电水位清 + structureDestroyed(Fire)', () => {
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 5 });
    placeBuilding(ctx, R2, 50, 50, 2);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) ctx.act.setXbit(tileIndex(50 + dx, 50 + dy), 0x40 | 0x80 | 0x10 | 0x20, true);
    host.drainEvents();
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 50, y: 50 });
    runTicks(host, 1);
    expect(state.disaster.active).toBe(true);
    runUntil(host, () => !state.disaster.active, 300);
    expect(state.disaster.active).toBe(false);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      const i = tileIndex(50 + dx, 50 + dy);
      expect(state.layers.xbld[i]).toBeGreaterThanOrEqual(0x01); expect(state.layers.xbld[i]).toBeLessThanOrEqual(0x04);
      expect(state.layers.xzon[i]! & Corner.All).toBe(0);
      expect(state.layers.xzon[i]! & 0x0f).toBe(2);
      expect(state.layers.xbit[i]! & (0x40 | 0x80 | 0x10 | 0x20)).toBe(0);
    }
    const destroyed = ofType(host.drainEvents(), 'structureDestroyed');
    expect(destroyed).toEqual([{ type: 'structureDestroyed', x: 50, y: 50, oldId: R2, cause: DisasterKind.Fire }]);
    expect(state.counts.tile[R2]).toBe(0);
    expect(state.counts.zone[0]).toBe(0);
  });

  it('火不过路：整列道路是防火带，另一侧永不起火；推平正在烧的格立即熄灭', () => {
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 8, tuning: fireTuning({ extinguishPerCoverage: 0, spreadBase: 1 }) });
    for (let y = 0; y < 128; y++) ctx.act.setXbld(tileIndex(45, y), ROAD_TB);
    for (let y = 40; y < 48; y++) for (const x of [43, 44, 46, 47]) placeBuilding(ctx, HOUSE, x, y, 1);
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 43, y: 40 });
    runTicks(host, 1);
    let crossed = false, leftBurned = 0;
    for (let k = 0; k < 60 && state.disaster.active; k++) {
      runTicks(host, 1);
      const mk = host.q.disasters.markers();
      for (let y = 40; y < 48; y++) { if (mk[tileIndex(46, y)] !== 0 || mk[tileIndex(47, y)] !== 0) crossed = true; if (mk[tileIndex(44, y)] === TileMarker.Fire) leftBurned++; }
    }
    expect(crossed).toBe(false);
    expect(leftBurned).toBeGreaterThan(0);
    for (let y = 0; y < 128; y++) expect(state.layers.xbld[tileIndex(45, y)]).toBe(ROAD_TB);
    // 推平：把一个仍在烧的格直接清为 0，下一 tick 标记必须消失
    const burning = [...host.q.disasters.markers()].findIndex((m) => m === TileMarker.Fire);
    if (burning >= 0) {
      ctx.act.setXbld(burning, 0);
      runTicks(host, 1);
      expect(host.q.disasters.marker(burning)).toBe(0);
    }
  });

  it('focusPoints 在火灾中给出火场质心；灾害结束后为空', () => {
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 2 });
    placeBuilding(ctx, HOUSE, 10, 10);
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 10, y: 10 });
    runTicks(host, 1);
    expect(host.q.disasters.focusPoints()).toEqual([{ x: 10, y: 10 }]);
    runUntil(host, () => !state.disaster.active, 100);
    expect(host.q.disasters.focusPoints()).toEqual([]);
  });
});

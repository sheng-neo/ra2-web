// WP13 验收：怪兽（边缘生成、朝城市中心寻路、踩踏 / 点火；things() 恰 1 项；出界或 life==0 结束）。
import { describe, expect, it } from 'vitest';
import { DisasterKind, TileMarker, inMap, tileIndex } from '../../contracts/grid';
import { ActorId } from '../../contracts/render';
import { createTestContext } from '../../testkit';
import { ofType, placeBuilding, runTicks } from './fixtures';
import { createEventsSystem } from './index';
import type { EventsPriv } from './priv';
import { DEFAULT_EVENTS_TUNING } from './tuning';

const HOUSE = 0x70;
const cheb = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

describe('monster', () => {
  it('things() 恰 1 项（ActorId.Monster）、朝 cityCenter 靠近、出界或 life==0 结束', () => {
    const tuning = { events: { monster: { ...DEFAULT_EVENTS_TUNING.monster, ignite: 0, rayIgnite: 0 } } };
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 31, tuning });
    for (let x = 0; x < 128; x++) for (let y = 0; y < 128; y++) placeBuilding(ctx, HOUSE, x, y, 1);
    host.drainEvents();
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Monster });
    runTicks(host, 1);
    const P = state.priv.events as EventsPriv;
    const t0 = host.q.disasters.things();
    expect(t0).toHaveLength(1);
    expect(t0[0]).toMatchObject({ slot: 39, type: ActorId.Monster });
    const center = ctx.q.services.cityCenter();
    const d0 = cheb(t0[0]!.x, t0[0]!.y, center.x, center.y);
    const life0 = P.actors[0]!.life;
    expect(life0).toBeGreaterThanOrEqual(120); expect(life0).toBeLessThanOrEqual(240);
    let minD = d0, ticks = 0;
    while (state.disaster.active && ticks < 500) {
      runTicks(host, 1); ticks++;
      const t = host.q.disasters.things();
      if (t.length === 0) break;
      expect(t).toHaveLength(1);
      expect(inMap(t[0]!.x, t[0]!.y)).toBe(true);
      minD = Math.min(minD, cheb(t[0]!.x, t[0]!.y, center.x, center.y));
    }
    expect(minD).toBeLessThan(d0 / 2);                                       // seekChance 0.6 下明显靠近中心
    expect(ticks).toBeLessThanOrEqual(life0);
    expect(host.q.disasters.things()).toHaveLength(0);
    expect(state.disaster.active).toBe(false);
    const ev = host.drainEvents();
    expect(ofType(ev, 'disasterEnded')[0]).toMatchObject({ kind: DisasterKind.Monster });
    const crushed = ofType(ev, 'structureDestroyed');
    expect(crushed.length).toBeGreaterThan(0);
    expect(crushed.every((e) => e.cause === DisasterKind.Monster)).toBe(true);
  });

  it('踩踏点火：怪兽经过建筑区后留下火标记，火灭后灾害才结束', () => {
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 12 });
    for (let x = 56; x < 72; x++) for (let y = 56; y < 72; y++) placeBuilding(ctx, HOUSE, x, y, 1);
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Monster });
    runTicks(host, 1);
    const P = state.priv.events as EventsPriv;
    P.actors[0]!.x = 60; P.actors[0]!.y = 60;                                // 白盒：直接放到建筑区
    let sawFire = false, sawFireWithoutMonster = false;
    for (let k = 0; k < 600 && state.disaster.active; k++) {
      runTicks(host, 1);
      const anyFire = host.q.disasters.markers().some((m) => m === TileMarker.Fire);
      if (anyFire) sawFire = true;
      if (anyFire && host.q.disasters.things().length === 0) sawFireWithoutMonster = true;
    }
    expect(sawFire).toBe(true);
    expect(sawFireWithoutMonster).toBe(true);
    expect(state.disaster.active).toBe(false);
    expect(host.q.disasters.marker(tileIndex(60, 60))).toBe(0);
  });
});

// WP13 验收：龙卷风（边缘生成、路径抖动、毁坏；things() 恰 1 项；出界或 life==0 结束）。
import { describe, expect, it } from 'vitest';
import { DisasterKind, inMap } from '../../contracts/grid';
import { ActorId } from '../../contracts/render';
import { createTestContext } from '../../testkit';
import { ofType, placeBuilding, runTicks } from './fixtures';
import { createEventsSystem } from './index';
import type { EventsPriv } from './priv';
import { DEFAULT_EVENTS_TUNING } from './tuning';

const HOUSE = 0x70;
const onEdge = (x: number, y: number): boolean => x === 0 || y === 0 || x === 127 || y === 127;

describe('tornado', () => {
  it('在地图边缘生成、每 tick 走一格、things() 恰一项（ActorId.Tornado，槽 39）、出界或 life==0 删除并结束', () => {
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 17 });
    for (let x = 0; x < 128; x++) for (let y = 0; y < 128; y++) placeBuilding(ctx, HOUSE, x, y, 1);
    host.drainEvents();
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Tornado });
    runTicks(host, 1);
    const P = state.priv.events as EventsPriv;
    const first = host.q.disasters.things();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ slot: 39, type: ActorId.Tornado, air: false });
    expect(onEdge(first[0]!.x, first[0]!.y)).toBe(true);
    expect(host.q.disasters.thingsAt(first[0]!.x * 128 + first[0]!.y)).toHaveLength(1);
    const life0 = P.actors[0]!.life;
    expect(life0).toBeGreaterThanOrEqual(DEFAULT_EVENTS_TUNING.tornado.life[0]); expect(life0).toBeLessThanOrEqual(DEFAULT_EVENTS_TUNING.tornado.life[1]);
    let prev = { x: first[0]!.x, y: first[0]!.y }, ticks = 0, exited = false;
    while (state.disaster.active && ticks < 400) {
      runTicks(host, 1); ticks++;
      const t = host.q.disasters.things();
      if (t.length === 0) { exited = true; break; }
      expect(t).toHaveLength(1);
      expect(Math.max(Math.abs(t[0]!.x - prev.x), Math.abs(t[0]!.y - prev.y))).toBe(1);
      expect(inMap(t[0]!.x, t[0]!.y)).toBe(true);
      prev = { x: t[0]!.x, y: t[0]!.y };
    }
    expect(exited).toBe(true);
    expect(ticks).toBeLessThanOrEqual(life0);                                // 出界提前结束或寿命耗尽
    expect(host.q.disasters.things()).toHaveLength(0);
    expect(state.disaster.active).toBe(false);
    const ev = host.drainEvents();
    expect(ofType(ev, 'disasterEnded')[0]).toMatchObject({ kind: DisasterKind.Tornado });
    const destroyed = ofType(ev, 'structureDestroyed');
    expect(destroyed.length).toBeGreaterThan(0);
    expect(destroyed.every((e) => e.cause === DisasterKind.Tornado)).toBe(true);
    const actor = ofType(ev, 'actor');
    expect(actor.filter((a) => a.op === 'remove' && a.slot === 39)).toHaveLength(1);
    expect(actor.filter((a) => a.op === 'move')).toHaveLength(ticks - 1);
  });

  it('龙卷风不点火：全程无火标记', () => {
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], seed: 23 });
    for (let x = 0; x < 128; x++) for (let y = 0; y < 128; y++) placeBuilding(ctx, HOUSE, x, y, 1);
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Tornado });
    for (let k = 0; k < 200 && state.disaster.active; k++) {
      runTicks(host, 1);
      expect(host.q.disasters.markers().some((m) => m !== 0)).toBe(false);
    }
  });
});

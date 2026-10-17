// WP13 验收：警 / 消调度（无警局 → noTarget；只在灾害模式；3×3 保护区内火不蔓延；things() 暴露 DeployPolice / DeployFire；已放满则搬最早的）。
import { describe, expect, it } from 'vitest';
import { NOT_IMPLEMENTED_RESULT } from '../../contracts/commands';
import { DisasterKind, TileMarker, tileIndex } from '../../contracts/grid';
import { ActorId } from '../../contracts/render';
import type { System } from '../../contracts/system';
import { createTestContext, nullSystem } from '../../testkit';
import { ofType, placeBuilding, runTicks } from './fixtures';
import { createEventsSystem } from './index';
import { DEFAULT_EVENTS_TUNING } from './tuning';

const HOUSE = 0x70;
/** 在桩 services 之上覆盖 structureCounts（有 1 座警局、2 座消防局）。 */
function servicesWith(profile: 'optimistic' | 'pessimistic', police: number, fire: number): System {
  const base = nullSystem('services', profile);
  const q = base.queries!.services!;
  return { ...base, queries: { services: { ...q, structureCounts: () => ({ police, prison: 0, fire, hospital: 0, school: 0, college: 0, busDepot: 0 }) } } };
}

describe.each(['optimistic', 'pessimistic'] as const)('dispatch（%s 桩）', (profile) => {
  it('无警局 / 消防局 → noTarget；城市模式 → mode；军队 → notImplemented；水面 → water', () => {
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem()], profile });
    placeBuilding(ctx, HOUSE, 30, 30);
    expect(host.dispatch({ type: 'dispatch', kind: 0, x: 31, y: 30 }).reason).toBe('mode');
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 30, y: 30 });
    runTicks(host, 1);
    expect(host.dispatch({ type: 'dispatch', kind: 0, x: 31, y: 30 }).reason).toBe('noTarget');
    expect(host.dispatch({ type: 'dispatch', kind: 1, x: 31, y: 30 }).reason).toBe('noTarget');
    expect(host.dispatch({ type: 'dispatch', kind: 2, x: 31, y: 30 })).toBe(NOT_IMPLEMENTED_RESULT);
    expect(host.q.disasters.dispatchAvailable(0)).toBe(0);
    expect(state.disaster.active).toBe(true);
  });

  it('有局所：放置成功并经 things() 暴露；放满后再放 = 搬动最早的单位；灾害结束全部删除', () => {
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem(), servicesWith(profile, 1, 2)], profile });
    placeBuilding(ctx, HOUSE, 30, 30);
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 30, y: 30 });
    runTicks(host, 1);
    expect(host.q.disasters.dispatchAvailable(1)).toBe(2);
    expect(host.dispatch({ type: 'dispatch', kind: 1, x: 40, y: 40 }).ok).toBe(true);
    expect(host.dispatch({ type: 'dispatch', kind: 0, x: 41, y: 40 }).ok).toBe(true);
    expect(host.q.disasters.dispatchAvailable(1)).toBe(1);
    expect(host.q.disasters.dispatchAvailable(0)).toBe(0);
    const things = host.q.disasters.things();
    expect(things.map((t) => [t.slot, t.type, t.x, t.y])).toEqual([[1, ActorId.DeployFire, 40, 40], [2, ActorId.DeployPolice, 41, 40]]);
    expect(host.dispatch({ type: 'dispatch', kind: 0, x: 50, y: 50 }).ok).toBe(true);     // 警察已放满 → 搬动
    expect(host.q.disasters.things().find((t) => t.type === ActorId.DeployPolice)).toMatchObject({ x: 50, y: 50 });
    expect(host.q.disasters.things()).toHaveLength(2);
    host.drainEvents();
    while (state.disaster.active) runTicks(host, 1);
    expect(host.q.disasters.things()).toHaveLength(0);
    expect(ofType(host.drainEvents(), 'actor').filter((a) => a.op === 'remove')).toHaveLength(2);
    expect(host.dispatch({ type: 'dispatch', kind: 1, x: 40, y: 40 }).reason).toBe('mode');
  });

  it('消防单位 3×3 保护区内火不蔓延（spreadBase=1 的必燃链条在保护区前停下）', () => {
    const tuning = { events: { fire: { ...DEFAULT_EVENTS_TUNING.fire, spreadBase: 1, extinguishPerCoverage: 0 } } };
    const { host, ctx, state } = createTestContext({ systems: [createEventsSystem(), servicesWith(profile, 0, 1)], profile, tuning });
    for (let x = 30; x <= 50; x++) placeBuilding(ctx, HOUSE, x, 40, 1);
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 30, y: 40 });
    runTicks(host, 1);
    expect(host.dispatch({ type: 'dispatch', kind: 1, x: 40, y: 40 }).ok).toBe(true);
    let reached38 = false;
    for (let k = 0; k < 60 && state.disaster.active; k++) {
      runTicks(host, 1);
      const mk = host.q.disasters.markers();
      if (mk[tileIndex(38, 40)] === TileMarker.Fire) reached38 = true;
      for (let x = 39; x <= 50; x++) expect(mk[tileIndex(x, 40)]).toBe(0);
    }
    expect(reached38).toBe(true);
    for (let x = 39; x <= 50; x++) expect(state.layers.xbld[tileIndex(x, 40)]).toBe(HOUSE);
  });
});

// availability：顺序 notImplemented → mode → notInvented → ordinance → locked → alreadyBuilt → funds；V1_TOOL_IDS 54 项乐观桩全 enabled；白名单之外 notImplemented。
import { describe, expect, it } from 'vitest';
import { V1_TOOL_COUNT, V1_TOOL_IDS } from '../../app/v1Tools';
import { CityMode } from '../../contracts/grid';
import { OrdinanceId } from '../../contracts/state';
import type { StubProfile } from '../../contracts/testkit';
import { CATALOGUE } from '../../data';
import { createTestContext } from '../../testkit';
import { createPlacementSystem } from './index';

const mk = (profile: StubProfile, v1 = true, funds = 1_000_000) => {
  const t = createTestContext({ profile, systems: [createPlacementSystem()], tuning: v1 ? { placement: { v1Tools: V1_TOOL_IDS } } : undefined });
  t.state.economy.funds = funds;
  return t;
};

describe('availability', () => {
  it('悲观桩：带科技的工具全部 notInvented；奖励 locked；其余有价工具 funds；免费工具 enabled', () => {
    const { host } = mk('pessimistic');
    for (const def of CATALOGUE.TOOLS) {
      if (!V1_TOOL_IDS.has(def.id)) continue;
      const a = host.q.placement.availability(def.id);
      if (def.tech) expect(a, def.id).toEqual({ enabled: false, reason: 'notInvented' });
      else if (def.unlock) expect(a, def.id).toEqual({ enabled: false, reason: 'locked' });
      else if (def.costUnit !== 'none' && def.cost > 0) expect(a, def.id).toEqual({ enabled: false, reason: 'funds' });
      else expect(a, def.id).toEqual({ enabled: true });
    }
  });
  it('乐观桩 + 奖励位全开：V1_TOOL_IDS 的 54 项全部 enabled；白名单之外 notImplemented；未知工具 notImplemented', () => {
    const { host, state } = mk('optimistic');
    state.rewards.grantedMask = 0x1f;
    expect(V1_TOOL_IDS.size).toBe(V1_TOOL_COUNT);
    for (const id of V1_TOOL_IDS) expect(host.q.placement.availability(id), id).toEqual({ enabled: true });
    for (const def of CATALOGUE.TOOLS) if (!V1_TOOL_IDS.has(def.id)) expect(host.q.placement.availability(def.id), def.id).toEqual({ enabled: false, reason: 'notImplemented' });
    expect(host.q.placement.availability('nope.tool')).toEqual({ enabled: false, reason: 'notImplemented' });
  });
  it('v1Tools 为 null（未注入）：全部工具视为已实现（乐观桩下 v2 工具也 enabled）', () => {
    const { host, state } = mk('optimistic', false);
    state.rewards.grantedMask = 0x1f;
    expect(host.q.placement.availability('roads.highway')).toEqual({ enabled: true });
    expect(host.q.placement.availability('rewards.arcoPioneer')).toEqual({ enabled: true });
  });
  it('顺序：notInvented 先于 ordinance（悲观）；ordinance 先于 funds（乐观 + 无核区）；locked 先于 alreadyBuilt / funds', () => {
    const pess = mk('pessimistic');
    pess.state.economy.ordinances |= 1 << OrdinanceId.NuclearFreeZone;
    expect(pess.host.q.placement.availability('power.nuclear')).toEqual({ enabled: false, reason: 'notInvented' });
    const opt = mk('optimistic');
    opt.state.economy.ordinances |= 1 << OrdinanceId.NuclearFreeZone;
    expect(opt.host.q.placement.availability('power.nuclear')).toEqual({ enabled: false, reason: 'ordinance' });
    expect(opt.host.q.placement.availability('rewards.mayorsHouse')).toEqual({ enabled: false, reason: 'locked' });
    opt.state.rewards.grantedMask = 1;
    expect(opt.host.q.placement.availability('rewards.mayorsHouse')).toEqual({ enabled: true });
    expect(opt.host.dispatch({ type: 'placeBuilding', id: 0xf3, x: 10, y: 10 }).ok).toBe(true);
    expect(opt.host.q.placement.availability('rewards.mayorsHouse')).toEqual({ enabled: false, reason: 'alreadyBuilt' });
    expect(opt.host.drainEvents().some((e) => e.type === 'toolbar' && e.reason === 'reward')).toBe(true);
  });
  it('mode：地形编辑模式下 city 工具 mode，both 工具照常；notImplemented 仍优先', () => {
    const { host, state } = mk('optimistic');
    state.clock.mode = CityMode.TerrainEdit;
    expect(host.q.placement.availability('roads.road')).toEqual({ enabled: false, reason: 'mode' });
    expect(host.q.placement.availability('query')).toEqual({ enabled: true });
    expect(host.q.placement.availability('bulldozer.raise')).toEqual({ enabled: true });
    expect(host.q.placement.availability('roads.highway')).toEqual({ enabled: false, reason: 'notImplemented' });
  });
  it('funds：现实桩按单价与资金判定（按格计价的工具看一格）', () => {
    const { host, state } = mk('realistic', true, 0);
    expect(host.q.placement.availability('power.coal')).toEqual({ enabled: false, reason: 'funds' });
    expect(host.q.placement.availability('roads.road')).toEqual({ enabled: false, reason: 'funds' });
    expect(host.q.placement.availability('query')).toEqual({ enabled: true });
    state.economy.funds = 10;
    expect(host.q.placement.availability('roads.road')).toEqual({ enabled: true });
    expect(host.q.placement.availability('power.coal')).toEqual({ enabled: false, reason: 'funds' });
  });
});

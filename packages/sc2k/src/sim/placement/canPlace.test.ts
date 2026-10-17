// canPlace：每种 RejectReason 一例（spec:building-catalogue §3.4 顺序）、4×4 锚点 ≤ 124、码头水格 1..8、瀑布水电；查询纯读。
import { describe, expect, it } from 'vitest';
import { CityMode, tileIndex } from '../../contracts/grid';
import { OrdinanceId } from '../../contracts/state';
import type { StubProfile } from '../../contracts/testkit';
import { createTestContext, hashOf } from '../../testkit';
import { createPlacementSystem } from './index';
import { T, putXbld, setSlope, setWater, setWaterfall } from './testFixtures';

const COAL = 0xcf, POLICE = 0xd2, GAS = 0xc9, MAYOR = 0xf3, NUCLEAR = 0xcb, HYDRO = 0xc6, MARINA = 0xf8, BUS = 0xec, RAIL_DEPOT = 0xed, WIND = 0xc8;
const mk = (profile: StubProfile, funds = 1_000_000) => {
  const t = createTestContext({ profile, systems: [createPlacementSystem()] });
  t.state.economy.funds = funds;
  return t;
};

describe.each(['optimistic', 'pessimistic'] as const)('canPlace（%s 桩）', (profile) => {
  const okOrFunds = profile === 'optimistic' ? { ok: true } : { ok: false, reason: 'funds' };

  it('平地空地：乐观 ok / 悲观 funds（canAfford 为假）；费用来自目录', () => {
    const { host } = mk(profile);
    expect(host.q.placement.canPlace(POLICE, 10, 10)).toMatchObject({ ...okOrFunds, cost: 500 });
  });
  it('outOfBounds：4×4 锚点 x,y ≤ 124', () => {
    const { host } = mk(profile);
    expect(host.q.placement.canPlace(COAL, 124, 124)).toMatchObject(okOrFunds);
    expect(host.q.placement.canPlace(COAL, 125, 10).reason).toBe('outOfBounds');
    expect(host.q.placement.canPlace(COAL, 10, 125).reason).toBe('outOfBounds');
    expect(host.q.placement.canPlace(POLICE, -1, 5).reason).toBe('outOfBounds');
  });
  it('notInvented：科技建筑按 q.tech.invented；它先于坡面 / 占用检查', () => {
    const { host, state } = mk(profile);
    setSlope(state, T(10, 10), 1);
    const r = host.q.placement.canPlace(GAS, 10, 10);
    expect(r.reason).toBe(profile === 'pessimistic' ? 'notInvented' : 'slope');
  });
  it('locked / alreadyBuilt：奖励建筑看 grantedMask 位；一次性奖励建成后 alreadyBuilt', () => {
    const { host, state } = mk(profile);
    expect(host.q.placement.canPlace(MAYOR, 10, 10).reason).toBe('locked');
    state.rewards.grantedMask = 1;
    expect(host.q.placement.canPlace(MAYOR, 10, 10)).toMatchObject({ ok: true, cost: 0 });   // 费用 0：悲观桩的 canAfford 不触发
    expect(host.dispatch({ type: 'placeBuilding', id: MAYOR, x: 10, y: 10 }).ok).toBe(true);
    expect(host.q.placement.canPlace(MAYOR, 40, 40).reason).toBe('alreadyBuilt');
  });
  it('ordinance：无核区法令禁止核电（乐观）；悲观下 notInvented 先于 ordinance', () => {
    const { host, state } = mk(profile);
    state.economy.ordinances |= 1 << OrdinanceId.NuclearFreeZone;
    expect(host.q.placement.canPlace(NUCLEAR, 10, 10).reason).toBe(profile === 'optimistic' ? 'ordinance' : 'notInvented');
  });
  it('slope：平地建筑占地内任一坡面格拒绝；terrain:any 的风机可放坡面', () => {
    const { host, state } = mk(profile);
    setSlope(state, T(12, 12), 3);
    expect(host.q.placement.canPlace(POLICE, 10, 10).reason).toBe('slope');
    if (profile === 'optimistic') expect(host.q.placement.canPlace(WIND, 12, 12).ok).toBe(true);
  });
  it('needWaterfall：水电只能放 0x3E，且瀑布水格不算 water', () => {
    const { host, state } = mk(profile);
    expect(host.q.placement.canPlace(HYDRO, 10, 10).reason).toBe('needWaterfall');
    setWaterfall(state, T(10, 10));
    expect(host.q.placement.canPlace(HYDRO, 10, 10)).toMatchObject({ ...okOrFunds, cost: 400 });
  });
  it('occupied：网络 / 建筑 / 放射性 / 小公园占用；树木与瓦砾可覆盖', () => {
    const { host, state } = mk(profile);
    putXbld(state, 11, 11, 0x1d);
    expect(host.q.placement.canPlace(POLICE, 10, 10).reason).toBe('occupied');
    putXbld(state, 11, 11, 0x06, 0);
    expect(host.q.placement.canPlace(POLICE, 10, 10)).toMatchObject(okOrFunds);
    putXbld(state, 11, 11, 0x03, 0);
    expect(host.q.placement.canPlace(POLICE, 10, 10)).toMatchObject(okOrFunds);
    putXbld(state, 11, 11, 0x05, 0);
    expect(host.q.placement.canPlace(POLICE, 10, 10).reason).toBe('occupied');
    putXbld(state, 11, 11, 0x0d);
    expect(host.q.placement.canPlace(POLICE, 10, 10).reason).toBe('occupied');
  });
  it('zoned：公共建筑不能压分区', () => {
    const { host, state } = mk(profile);
    state.layers.xzon[T(12, 10)] = 1;
    expect(host.q.placement.canPlace(POLICE, 10, 10).reason).toBe('zoned');
  });
  it('waterCells：码头占地水格必须 1..8；0 或 9 都拒', () => {
    const { host, state } = mk(profile);
    expect(host.q.placement.canPlace(MARINA, 20, 20).reason).toBe('waterCells');
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) setWater(state, T(20 + dx, 20 + dy));
    expect(host.q.placement.canPlace(MARINA, 20, 20).reason).toBe('waterCells');
    for (let dx = 0; dx < 3; dx++) setWater(state, T(30 + dx, 22), undefined, 0);   // 仅第三行三格为零深度浅水
    expect(host.q.placement.canPlace(MARINA, 30, 20)).toMatchObject(okOrFunds);
  });
  it('water：普通建筑占地含水格', () => {
    const { host, state } = mk(profile);
    setWater(state, T(13, 13));
    expect(host.q.placement.canPlace(COAL, 10, 10).reason).toBe('water');
  });
  it('adjacency：公交站须外沿环邻接道路、火车站邻接铁路', () => {
    const { host, state } = mk(profile);
    const bus = host.q.placement.canPlace(BUS, 10, 10);
    if (profile === 'pessimistic') { expect(bus.reason).toBe('notInvented'); }
    else {
      expect(bus.reason).toBe('adjacency');
      putXbld(state, 12, 10, 0x1e);                                    // 右侧外沿
      expect(host.q.placement.canPlace(BUS, 10, 10).ok).toBe(true);
      putXbld(state, 13, 11, 0x1d);                                    // 斜角不算
      expect(host.q.placement.canPlace(BUS, 11, 12).reason).toBe('adjacency');
    }
    expect(host.q.placement.canPlace(RAIL_DEPOT, 20, 20).reason).toBe('adjacency');
    putXbld(state, 20, 19, 0x2c);
    expect(host.q.placement.canPlace(RAIL_DEPOT, 20, 20)).toMatchObject(okOrFunds);
  });
  it('noTarget / notImplemented：分区生长建筑不可放；树 / 匝道 / 道路片段不走 placeBuilding', () => {
    const { host } = mk(profile);
    expect(host.q.placement.canPlace(0x70, 10, 10).reason).toBe('noTarget');
    expect(host.q.placement.canPlace(0xe3, 10, 10).reason).toBe('noTarget');
    expect(host.q.placement.canPlace(0x06, 10, 10).reason).toBe('notImplemented');
    expect(host.q.placement.canPlace(0x5d, 10, 10).reason).toBe('notImplemented');
    expect(host.q.placement.canPlace(0x1d, 10, 10).reason).toBe('notImplemented');
  });
  it('mode：地形编辑模式下一律 mode', () => {
    const { host, state } = mk(profile);
    state.clock.mode = CityMode.TerrainEdit;
    expect(host.q.placement.canPlace(POLICE, 10, 10).reason).toBe('mode');
  });
  it('纯读：不改哈希、不消费 PRNG', () => {
    const { host, state, ctx } = mk(profile);
    const h = hashOf(state), p = ctx.prng.state();
    for (let k = 0; k < 20; k++) host.q.placement.canPlace(COAL + (k % 3), 5 + k, 7);
    expect(hashOf(state)).toBe(h);
    expect(ctx.prng.state()).toBe(p);
  });
});

describe('canPlace（现实桩）', () => {
  it('funds：现实桩按资金判定', () => {
    const { host, state } = mk('realistic', 0);
    expect(host.q.placement.canPlace(POLICE, 10, 10).reason).toBe('funds');
    state.economy.funds = 500;
    expect(host.q.placement.canPlace(POLICE, 10, 10).ok).toBe(true);
  });
  it('绑定前（新城之前）查询不抛错，保守返回 mode', () => {
    const sys = createPlacementSystem();
    expect(sys.queries!.placement!.canPlace(POLICE, 10, 10)).toEqual({ ok: false, reason: 'mode', cost: 0 });
    expect(sys.queries!.placement!.availability('roads.road')).toEqual({ enabled: false, reason: 'mode' });
    expect(sys.queries!.placement!.preview({ type: 'bulldoze', tiles: [tileIndex(1, 1)] }).ok).toBe(false);
  });
});

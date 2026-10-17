// place / demolish / zoneRect / dezone：整栋角标、counts.tile 增量、位预置、水泵自动管线、XUND 0x23、微模拟标签、选队模态、拆除瓦砾与 $1×size²。
import { describe, expect, it } from 'vitest';
import { CityMode, Corner, XBit, ZoneCode } from '../../contracts/grid';
import type { System } from '../../contracts/system';
import type { StubProfile } from '../../contracts/testkit';
import { createTestContext, hashOf, nullSystem } from '../../testkit';
import { createPlacementSystem } from './index';
import { T, putXbld, setSlope, setWaterfall } from './testFixtures';

const POLICE = 0xd2, STATUE = 0xdb, BIG_PARK = 0xd5, PUMP = 0xdc, SUB_STATION = 0xe9, STADIUM = 0xd7, HYDRO = 0xc6, HYDRO_B = 0xc7, R_HOUSE = 0x70, PARK = 0x0d;
const mk = (profile: StubProfile, opts: { funds?: number; systems?: System[]; tuning?: object } = {}) => {
  const t = createTestContext({ profile, systems: [createPlacementSystem(), ...(opts.systems ?? [])], tuning: opts.tuning ? { placement: opts.tuning } : undefined });
  t.state.economy.funds = opts.funds ?? 1_000_000;
  return t;
};
/** 假 services：只改写 allocMicrosim / freeMicrosim 记录调用。 */
function fakeServices(slot: number): { sys: System; freed: number[]; allocated: number[] } {
  const base = nullSystem('services');
  const freed: number[] = [], allocated: number[] = [];
  const sys: System = { ...base, actions: { ...base.actions, allocMicrosim: (tileId) => { allocated.push(tileId); return slot; }, freeMicrosim: (s) => { freed.push(s); } } };
  return { sys, freed, allocated };
}

describe.each(['optimistic', 'pessimistic'] as const)('placeBuilding / 拆除 / 分区（%s 桩）', (profile) => {
  it('3×3 警局：整栋写入、角标 TL/TR/BL/BR、内部 0、counts.tile +9、位预置 POWERABLE|POWERED|PIPED、扣费、sound 事件', () => {
    const { host, state } = mk(profile);
    host.drainEvents();
    const r = host.dispatch({ type: 'placeBuilding', id: POLICE, x: 10, y: 10 });
    expect(r).toMatchObject({ ok: true, cost: 500 });
    expect(r.changed).toHaveLength(9);
    expect(state.economy.funds).toBe(1_000_000 - 500);
    expect(state.counts.tile[POLICE]).toBe(9);
    const L = state.layers;
    expect(L.xzon[T(10, 10)]).toBe(Corner.TL); expect(L.xzon[T(12, 10)]).toBe(Corner.TR);
    expect(L.xzon[T(10, 12)]).toBe(Corner.BL); expect(L.xzon[T(12, 12)]).toBe(Corner.BR);
    expect(L.xzon[T(11, 11)]).toBe(0); expect(L.xzon[T(11, 10)]).toBe(0);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      expect(L.xbld[T(10 + dx, 10 + dy)]).toBe(POLICE);
      expect(L.xbit[T(10 + dx, 10 + dy)]! & (XBit.Powerable | XBit.Powered | XBit.Piped)).toBe(XBit.Powerable | XBit.Powered | XBit.Piped);
    }
    expect(host.drainEvents().some((e) => e.type === 'sound' && e.id === 'place')).toBe(true);
    expect(host.commandLog()).toHaveLength(1);
  });
  it('雕像不导电只导水；大公园同理；放在树上自动清树', () => {
    const { host, state } = mk(profile);
    state.rewards.grantedMask = 1 << 2;
    putXbld(state, 20, 20, 0x08, 0);
    expect(host.dispatch({ type: 'placeBuilding', id: STATUE, x: 20, y: 20 }).ok).toBe(true);
    expect(state.layers.xbld[T(20, 20)]).toBe(STATUE);
    expect(state.layers.xbit[T(20, 20)]! & (XBit.Powerable | XBit.Powered)).toBe(0);
    expect(state.layers.xbit[T(20, 20)]! & XBit.Piped).toBe(XBit.Piped);
    expect(host.dispatch({ type: 'placeBuilding', id: BIG_PARK, x: 30, y: 30 }).ok).toBe(true);
    expect(state.layers.xbit[T(31, 31)]! & XBit.Powerable).toBe(0);
  });
  it('水泵自动管线：空 → 0x10；地铁 LR → 0x1F；地铁 TB → 0x20；并置 PIPED', () => {
    const { host, state } = mk(profile);
    state.layers.xund[T(6, 5)] = 0x01; state.layers.xund[T(7, 5)] = 0x02;
    for (const x of [5, 6, 7]) expect(host.dispatch({ type: 'placeBuilding', id: PUMP, x, y: 5 }).ok).toBe(true);
    expect(state.layers.xund[T(5, 5)]).toBe(0x10); expect(state.layers.xund[T(6, 5)]).toBe(0x1f); expect(state.layers.xund[T(7, 5)]).toBe(0x20);
    expect(state.layers.xbit[T(5, 5)]! & XBit.Piped).toBe(XBit.Piped);
  });
  it('地铁站：XUND 0x23 且清 PIPED（科技：悲观桩 notInvented）', () => {
    const { host, state } = mk(profile);
    const r = host.dispatch({ type: 'placeBuilding', id: SUB_STATION, x: 9, y: 9 });
    if (profile === 'pessimistic') { expect(r.reason).toBe('notInvented'); return; }
    expect(r.ok).toBe(true);
    expect(state.layers.xund[T(9, 9)]).toBe(0x23);
    expect(state.layers.xbit[T(9, 9)]! & XBit.Piped).toBe(0);
  });
  it('体育场：返回 teamPick 模态；modalAnswer 经 core 转发写 rewards.stadiumTeams 位', () => {
    const { host, state } = mk(profile);
    const r = host.dispatch({ type: 'placeBuilding', id: STADIUM, x: 40, y: 40 });
    expect(r.ok).toBe(true);
    expect(r.modal).toEqual({ id: 'teamPick', payload: { at: T(40, 40) } });
    expect(host.dispatch({ type: 'modalAnswer', dialog: 'teamPick', answer: 3 }).ok).toBe(true);
    expect(state.rewards.stadiumTeams & (1 << 3)).toBe(1 << 3);
  });
  it('水电：按高侧邻格选 0xC6（T/B 高）或 0xC7（L/R 高）', () => {
    const { host, state } = mk(profile);
    setWaterfall(state, T(30, 30)); state.layers.alt[T(30, 29)] = 6;
    expect(host.dispatch({ type: 'placeBuilding', id: HYDRO, x: 30, y: 30 }).ok).toBe(true);
    expect(state.layers.xbld[T(30, 30)]).toBe(HYDRO);
    setWaterfall(state, T(50, 50)); state.layers.alt[T(51, 50)] = 6;
    expect(host.dispatch({ type: 'placeBuilding', id: HYDRO, x: 50, y: 50 }).ok).toBe(true);
    expect(state.layers.xbld[T(50, 50)]).toBe(HYDRO_B);
  });
  it('微模拟：allocMicrosim 给槽位 → 每格 XTXT = 0x33 + 槽；拆除释放槽并清标签', () => {
    const fake = fakeServices(12);
    const { host, state } = mk(profile, { systems: [fake.sys] });
    expect(host.dispatch({ type: 'placeBuilding', id: POLICE, x: 10, y: 10 }).ok).toBe(true);
    expect(fake.allocated).toEqual([POLICE]);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) expect(state.layers.xtxt[T(10 + dx, 10 + dy)]).toBe(0x33 + 12);
    expect(host.dirty.bulk.xtxt).toBe(true);
    expect(host.dispatch({ type: 'bulldoze', tiles: [T(11, 11)] }).ok).toBe(true);
    expect(fake.freed).toEqual([12]);
    expect(state.layers.xtxt[T(10, 10)]).toBe(0);
  });
  it('microsimFull：alloc 返回 −1 且 tuning.microsimFullRejects 时拒绝、不写不扣；默认放行', () => {
    const strict = mk(profile, { systems: [fakeServices(-1).sys], tuning: { microsimFullRejects: true } });
    expect(strict.host.dispatch({ type: 'placeBuilding', id: POLICE, x: 10, y: 10 })).toMatchObject({ ok: false, reason: 'microsimFull' });
    expect(strict.state.counts.tile[POLICE]).toBe(0);
    expect(strict.state.economy.funds).toBe(1_000_000);
    const lax = mk(profile, { systems: [fakeServices(-1).sys] });
    expect(lax.host.dispatch({ type: 'placeBuilding', id: POLICE, x: 10, y: 10 }).ok).toBe(true);
    expect(lax.state.layers.xtxt[T(10, 10)]).toBe(0);
  });
  it('资金不足：act.charge 失败 → funds，不写任何格；地形编辑模式 → mode', () => {
    const { host, state } = mk(profile, { funds: 100 });
    expect(host.dispatch({ type: 'placeBuilding', id: POLICE, x: 10, y: 10 })).toMatchObject({ ok: false, reason: 'funds', cost: 500 });
    expect(state.counts.tile[POLICE]).toBe(0);
    expect(host.commandLog()).toHaveLength(0);
    state.economy.funds = 1000; state.clock.mode = CityMode.TerrainEdit;
    expect(host.dispatch({ type: 'placeBuilding', id: POLICE, x: 10, y: 10 }).reason).toBe('mode');
  });
  it('拆除整栋：$1×size²、平地留瓦砾（1×1 角标 0xF0、分区码保留）、位清零；再推瓦砾变空地', () => {
    const { host, state } = mk(profile);
    expect(host.dispatch({ type: 'placeBuilding', id: POLICE, x: 10, y: 10 }).ok).toBe(true);
    setSlope(state, T(12, 12), 2);                                    // 一格坡面：拆后直接空地
    const before = state.economy.funds;
    const r = host.dispatch({ type: 'bulldoze', tiles: [T(11, 11)] });
    expect(r).toMatchObject({ ok: true, cost: 9 });
    expect(state.economy.funds).toBe(before - 9);
    expect(state.counts.tile[POLICE]).toBe(0);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      const i = T(10 + dx, 10 + dy), v = state.layers.xbld[i]!;
      if (dx === 2 && dy === 2) { expect(v).toBe(0); expect(state.layers.xzon[i]).toBe(0); }
      else { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(4); expect(state.layers.xzon[i]).toBe(Corner.All); }
      expect(state.layers.xbit[i]! & (XBit.Powerable | XBit.Powered | XBit.Piped)).toBe(0);
    }
    const r2 = host.dispatch({ type: 'bulldoze', tiles: [T(10, 10), T(10, 10), T(12, 12)] });
    expect(r2).toMatchObject({ ok: true, cost: 1 });                  // 空地与重复格不计费
    expect(state.layers.xbld[T(10, 10)]).toBe(0);
    expect(host.dispatch({ type: 'bulldoze', tiles: [T(60, 60)] })).toMatchObject({ ok: false, reason: 'noTarget', cost: 0 });
  });
  it('拆水泵后自动管线留在地下且 PIPED 保留；拆小公园 / 树木 $1 直接清空', () => {
    const { host, state } = mk(profile);
    expect(host.dispatch({ type: 'placeBuilding', id: PUMP, x: 5, y: 5 }).ok).toBe(true);
    expect(host.dispatch({ type: 'bulldoze', tiles: [T(5, 5)] })).toMatchObject({ ok: true, cost: 1 });
    expect(state.layers.xbld[T(5, 5)]).toBeGreaterThanOrEqual(1); expect(state.layers.xbld[T(5, 5)]).toBeLessThanOrEqual(4);   // 建筑 → 瓦砾
    expect(state.layers.xund[T(5, 5)]).toBe(0x10);
    expect(state.layers.xbit[T(5, 5)]! & XBit.Piped).toBe(XBit.Piped);
    expect(host.dispatch({ type: 'bulldoze', tiles: [T(5, 5)] })).toMatchObject({ ok: true, cost: 1 });   // 瓦砾 → 空地
    expect(state.layers.xbld[T(5, 5)]).toBe(0); expect(state.layers.xund[T(5, 5)]).toBe(0x10);
    expect(host.dispatch({ type: 'bulldoze', tiles: [T(5, 5)] })).toMatchObject({ ok: true, cost: 1 });   // 地表空 → 推地下管线
    expect(state.layers.xund[T(5, 5)]).toBe(0); expect(state.layers.xbit[T(5, 5)]! & XBit.Piped).toBe(0);
    expect(host.dispatch({ type: 'placeBuilding', id: PARK, x: 7, y: 7 }).ok).toBe(true);
    putXbld(state, 8, 8, 0x0a, 0);
    expect(host.dispatch({ type: 'bulldoze', tiles: [T(7, 7), T(8, 8)] })).toMatchObject({ ok: true, cost: 2 });
    expect(state.layers.xbld[T(7, 7)]).toBe(0); expect(state.layers.xbld[T(8, 8)]).toBe(0);
  });
  it('zoneRect：按实际格数计费、不合格格跳过、同码免费；dezone 建筑变瓦砾且码归 0', () => {
    const { host, state } = mk(profile);
    putXbld(state, 6, 6, 0x1d);                                       // 一格道路：跳过
    const r = host.dispatch({ type: 'zoneRect', zone: ZoneCode.LightR, x0: 8, y0: 8, x1: 5, y1: 5 });
    expect(r).toMatchObject({ ok: true, cost: 15 * 5 });
    expect(r.changed).toHaveLength(15);
    expect(state.layers.xzon[T(5, 5)]).toBe(ZoneCode.LightR); expect(state.layers.xzon[T(6, 6)]).toBe(0xf0);
    expect(host.dispatch({ type: 'zoneRect', zone: ZoneCode.LightR, x0: 7, y0: 7, x1: 8, y1: 8 })).toMatchObject({ ok: false, reason: 'zoned', cost: 0 });
    // 改划异类：按新价收费，已有分区建筑变瓦砾
    putXbld(state, 5, 5, R_HOUSE, 0xf0 | ZoneCode.LightR);
    const r2 = host.dispatch({ type: 'zoneRect', zone: ZoneCode.DenseC, x0: 5, y0: 5, x1: 5, y1: 6 });
    expect(r2).toMatchObject({ ok: true, cost: 20 });
    expect(state.layers.xzon[T(5, 5)]! & 0x0f).toBe(ZoneCode.DenseC);
    expect(state.layers.xbld[T(5, 5)]).toBeGreaterThanOrEqual(1); expect(state.layers.xbld[T(5, 5)]).toBeLessThanOrEqual(4);
    // 去分区
    putXbld(state, 7, 7, R_HOUSE, 0xf0 | ZoneCode.LightR);
    const r3 = host.dispatch({ type: 'dezone', tiles: [T(7, 7), T(8, 8), T(60, 60)] });
    expect(r3).toMatchObject({ ok: true, cost: 2 });
    expect(state.layers.xzon[T(7, 7)]).toBe(Corner.All); expect(state.layers.xzon[T(8, 8)]).toBe(0);
    expect(state.layers.xbld[T(7, 7)]).toBeGreaterThanOrEqual(1);
    expect(host.dispatch({ type: 'dezone', tiles: [T(60, 60)] })).toMatchObject({ ok: false, reason: 'noTarget' });
  });
  it('preview 与命令同价、纯读（哈希与 PRNG 不变）；资金不足的预览标 funds 但命令由 charge 把关', () => {
    const { host, state, ctx } = mk(profile);
    const h = hashOf(state), p = ctx.prng.state();
    const pv = host.q.placement.preview({ type: 'zoneRect', zone: ZoneCode.LightI, x0: 20, y0: 20, x1: 23, y1: 21 });
    const pb = host.q.placement.preview({ type: 'placeBuilding', id: POLICE, x: 30, y: 30 });
    expect(hashOf(state)).toBe(h); expect(ctx.prng.state()).toBe(p);
    expect(pv.tiles).toHaveLength(8); expect(pb.footprint).toEqual({ x0: 30, y0: 30, size: 3 });
    if (profile === 'optimistic') { expect(pv).toMatchObject({ ok: true, cost: 40 }); expect(pb).toMatchObject({ ok: true, cost: 500 }); }
    else { expect(pv).toMatchObject({ ok: false, reason: 'funds', cost: 40 }); expect(pb.reason).toBe('funds'); }
    expect(host.dispatch({ type: 'zoneRect', zone: ZoneCode.LightI, x0: 20, y0: 20, x1: 23, y1: 21 })).toMatchObject({ ok: true, cost: 40 });
  });
});

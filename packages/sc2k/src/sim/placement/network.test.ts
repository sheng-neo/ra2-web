// network：直线轴向、重复铺设免费、整段拒绝、高速偶数吸附、needsBridge 结果形状、bridge 重发、岸格 terrain、highway 遇水 water、管线×地铁 0x1F/0x20、交叉件、坡面、边缘模态、预览纯读。
import { describe, expect, it } from 'vitest';
import { CityMode, XBit, tileIndex } from '../../contracts/grid';
import { BridgeKind } from '../../contracts/net';
import type { StubProfile } from '../../contracts/testkit';
import { createTestContext, hashOf } from '../../testkit';
import { createPlacementSystem } from './index';
import { T, putXbld, setSlope, setWater } from './testFixtures';

const ROAD_LR = 0x1d, ROAD_TB = 0x1e, RAIL_LR = 0x2c, POWER_LR = 0x0e, POWER_TB = 0x0f, POLICE = 0xd2;
const mk = (profile: StubProfile, funds = 1_000_000) => {
  const t = createTestContext({ profile, systems: [createPlacementSystem()] });
  t.state.economy.funds = funds;
  return t;
};
const xb = (s: { layers: { xbld: Uint8Array } }, x: number, y: number): number => s.layers.xbld[T(x, y)]!;

describe.each(['optimistic', 'pessimistic'] as const)('network（%s 桩）', (profile) => {
  it('沿位移大的轴约束成直线：(10,10)→(20,13) 铺在 y=10 的 11 格，每格 $10', () => {
    const { host, state } = mk(profile);
    const r = host.dispatch({ type: 'network', kind: 'road', from: T(10, 10), to: T(20, 13) });
    expect(r).toMatchObject({ ok: true, cost: 110 });
    expect(r.changed).toHaveLength(11);
    for (let x = 10; x <= 20; x++) { expect(xb(state, x, 10)).toBe(ROAD_LR); expect(state.layers.xzon[T(x, 10)]).toBe(0xf0); }
    expect(xb(state, 20, 13)).toBe(0);
    expect(state.economy.funds).toBe(1_000_000 - 110);
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(5, 20), to: T(5, 5) }).ok).toBe(true);
    for (let y = 5; y <= 20; y++) expect(xb(state, 5, y)).toBe(ROAD_TB);
  });
  it('重复铺设免费；接入既有道路时邻格经 pieceFor 重选形（T 字 / 十字）', () => {
    const { host, state } = mk(profile);
    host.dispatch({ type: 'network', kind: 'road', from: T(10, 10), to: T(20, 10) });
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(12, 10), to: T(18, 10) })).toMatchObject({ ok: true, cost: 0, changed: [] });
    host.dispatch({ type: 'network', kind: 'road', from: T(15, 5), to: T(15, 10) });
    expect(xb(state, 15, 10)).toBe(0x1d + 13);                        // LTR 三岔
    expect(xb(state, 15, 9)).toBe(ROAD_TB);
    host.dispatch({ type: 'network', kind: 'road', from: T(15, 10), to: T(15, 15) });
    expect(xb(state, 15, 10)).toBe(0x1d + 14);                        // 十字
    expect(xb(state, 15, 11)).toBe(ROAD_TB);
  });
  it('整段拒绝：资金不足时一格不写、不入日志；越界 / 地形编辑模式', () => {
    const { host, state } = mk(profile, 50);
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(10, 10), to: T(20, 10) })).toMatchObject({ ok: false, reason: 'funds', cost: 110 });
    for (let x = 10; x <= 20; x++) expect(xb(state, x, 10)).toBe(0);
    expect(state.economy.funds).toBe(50);
    expect(host.commandLog()).toHaveLength(0);
    expect(host.dispatch({ type: 'network', kind: 'road', from: -1, to: T(3, 3) }).reason).toBe('outOfBounds');
    state.clock.mode = CityMode.TerrainEdit;
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(1, 1), to: T(3, 1) }).reason).toBe('mode');
  });
  it('高速：from/to 吸附到偶数 2×2 块、按块步进、每块 $100、角标全置；悲观桩 notInvented', () => {
    const { host, state } = mk(profile);
    const r = host.dispatch({ type: 'network', kind: 'highway', from: T(5, 5), to: T(11, 5) });
    if (profile === 'pessimistic') { expect(r.reason).toBe('notInvented'); return; }
    expect(r).toMatchObject({ ok: true, cost: 400 });
    expect(r.changed).toHaveLength(16);
    for (let x = 4; x <= 11; x++) for (const y of [4, 5]) { expect(xb(state, x, y)).toBe(0x49); expect(state.layers.xzon[T(x, y)]).toBe(0xf0); }
    expect(xb(state, 3, 4)).toBe(0); expect(xb(state, 12, 4)).toBe(0); expect(xb(state, 4, 6)).toBe(0);
    const pv = host.q.placement.preview({ type: 'network', kind: 'highway', from: T(20, 7), to: T(20, 2) });
    expect(pv.tiles.map((t) => t.i).sort((a, b) => a - b)).toEqual([T(20, 2), T(20, 3), T(20, 4), T(20, 5), T(20, 6), T(20, 7), T(21, 2), T(21, 3), T(21, 4), T(21, 5), T(21, 6), T(21, 7)]);
    expect(pv.cost).toBe(300);
  });
  it('遇水未给 bridge：needsBridge 结果形状、options 来自 q.transport.bridgeOptions、不写任何格', () => {
    const { host, state } = mk(profile);
    for (const x of [13, 14, 15]) setWater(state, T(x, 10));
    const r = host.dispatch({ type: 'network', kind: 'road', from: T(10, 10), to: T(18, 10) });
    expect(r).toEqual({ ok: false, cost: 0, reason: 'needsBridge', changed: [], modal: { id: 'bridgeType', payload: { from: T(10, 10), to: T(18, 10), length: 3, options: [BridgeKind.Causeway] } } });
    for (let x = 10; x <= 18; x++) expect(xb(state, x, 10)).toBe(0);
    expect(state.economy.funds).toBe(1_000_000);
    expect(host.commandLog()).toHaveLength(0);
    const pv = host.q.placement.preview({ type: 'network', kind: 'road', from: T(10, 10), to: T(18, 10) });
    expect(pv.reason).toBe('needsBridge'); expect(pv.ok).toBe(false);
  });
  it('带 bridge:Causeway 重发：0x58/0x57 交替、整段计费 = 陆地格×$10 + 水面格×$25、翻转位按行进轴', () => {
    const { host, state } = mk(profile);
    for (const x of [13, 14, 15]) setWater(state, T(x, 10));
    const r = host.dispatch({ type: 'network', kind: 'road', from: T(10, 10), to: T(18, 10), bridge: BridgeKind.Causeway });
    expect(r).toMatchObject({ ok: true, cost: 6 * 10 + 3 * 25 });
    expect([13, 14, 15].map((x) => xb(state, x, 10))).toEqual([0x58, 0x57, 0x58]);
    for (const x of [10, 11, 12, 16, 17, 18]) expect(xb(state, x, 10)).toBe(ROAD_LR);
    for (const x of [13, 14, 15]) expect(state.layers.xbit[T(x, 10)]! & XBit.Flipped).toBe(XBit.Flipped);   // 精灵默认 T–B，L–R 铺设翻转
    expect(state.layers.xbit[T(14, 10)]! & XBit.Water).toBe(XBit.Water);
    // 再次拖过同一座桥：既有桥免费、不弹模态
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(10, 10), to: T(18, 10) })).toMatchObject({ ok: true, cost: 0 });
    // T–B 方向的桥不翻转；铁路桥 0x5B/0x5A
    for (const y of [30, 31]) setWater(state, T(40, y));
    expect(host.dispatch({ type: 'network', kind: 'rail', from: T(40, 28), to: T(40, 33), bridge: BridgeKind.Rail })).toMatchObject({ ok: true, cost: 4 * 25 + 2 * 75 });
    expect([30, 31].map((y) => xb(state, 40, y))).toEqual([0x5b, 0x5a]);
    expect(state.layers.xbit[T(40, 30)]! & XBit.Flipped).toBe(0);
    // 电线：高架 0x5C；桥型不在 options → water
    for (const x of [50, 51]) setWater(state, T(x, 50));
    expect(host.dispatch({ type: 'network', kind: 'power', from: T(48, 50), to: T(53, 50), bridge: BridgeKind.Wire }).ok).toBe(true);
    expect(xb(state, 50, 50)).toBe(0x5c);
    for (const x of [60, 61]) setWater(state, T(x, 60));
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(58, 60), to: T(63, 60), bridge: BridgeKind.Rail }).reason).toBe('water');
  });
  it('岸格不合格 → terrain（先于模态）；沿桥向坡面岸格合格；桥不着陆 → water', () => {
    const { host, state } = mk(profile);
    for (const x of [13, 14]) setWater(state, T(x, 10), 5, 2);        // 水面 5 > 岸格 4
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(10, 10), to: T(17, 10) })).toMatchObject({ ok: false, reason: 'terrain' });
    setSlope(state, T(12, 10), 2); setSlope(state, T(15, 10), 4);       // 沿 L–R 的坡面岸格：最高点 5 ≥ 水面 5
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(10, 10), to: T(17, 10) }).reason).toBe('needsBridge');
    setSlope(state, T(12, 10), 1);                                      // 横向坡面 → terrain
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(10, 10), to: T(17, 10) }).reason).toBe('terrain');
    for (const x of [30, 31]) setWater(state, T(x, 20));
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(27, 20), to: T(31, 20) })).toMatchObject({ ok: false, reason: 'water' });
  });
  it('高速遇水：v1 无桥型 → water 而非模态', () => {
    const { host, state } = mk('optimistic');
    for (const x of [8, 9]) for (const y of [4, 5]) setWater(state, T(x, y));
    const r = host.dispatch({ type: 'network', kind: 'highway', from: T(4, 4), to: T(13, 4) });
    expect(r).toMatchObject({ ok: false, reason: 'water' });
    expect(r.modal).toBeUndefined();
    expect(xb(state, 4, 4)).toBe(0);
    void profile;
  });
  it('管线与地铁垂直交叉写 0x1F/0x20、置 PIPED；平行 / 0x22 / 0x23 / 水下跳过', () => {
    const { host, state } = mk(profile);
    const L = state.layers;
    L.xund[T(20, 20)] = 0x02; L.xund[T(22, 20)] = 0x01; L.xund[T(24, 20)] = 0x23; L.xund[T(25, 20)] = 0x22; setWater(state, T(26, 20));
    const r = host.dispatch({ type: 'network', kind: 'pipe', from: T(18, 20), to: T(27, 20) });
    expect(r.ok).toBe(true);
    expect(L.xund[T(20, 20)]).toBe(0x20);                               // 管线 LR × 地铁 TB
    expect(L.xund[T(22, 20)]).toBe(0x01);                               // 平行：跳过
    expect(L.xund[T(24, 20)]).toBe(0x23); expect(L.xund[T(25, 20)]).toBe(0x22); expect(L.xund[T(26, 20)]).toBe(0);
    expect(L.xund[T(19, 20)]).toBe(0x10); expect(L.xund[T(27, 20)]).toBe(0x1e);   // 末格无邻：孤立管线为十字
    expect(L.xbit[T(20, 20)]! & XBit.Piped).toBe(XBit.Piped); expect(L.xbit[T(19, 20)]! & XBit.Piped).toBe(XBit.Piped);
    expect(r.cost).toBe(3 * 6);                                         // 18 19 20 21 23 27 = 6 格新铺
    L.xund[T(30, 30)] = 0x01;
    expect(host.dispatch({ type: 'network', kind: 'pipe', from: T(30, 28), to: T(30, 32) }).ok).toBe(true);
    expect(L.xund[T(30, 30)]).toBe(0x1f);                               // 管线 TB × 地铁 LR
    const pv = host.q.placement.preview({ type: 'network', kind: 'pipe', from: T(40, 40), to: T(40, 40) });
    expect(pv.tiles).toHaveLength(1); expect(pv.cost).toBe(3);
    expect(pv.ok).toBe(profile === 'optimistic');                       // 悲观桩 canAfford 为假 → 预览标 funds
  });
  it('地表交叉件：电线跨道路 0x43/0x44、铁路跨道路 0x46、道路跨铁路 0x45；非直线 / 平行不可交叉', () => {
    const { host, state } = mk(profile);
    putXbld(state, 30, 30, ROAD_LR);
    expect(host.dispatch({ type: 'network', kind: 'power', from: T(30, 28), to: T(30, 32) })).toMatchObject({ ok: true, cost: 10 });
    expect(xb(state, 30, 30)).toBe(0x43); expect(xb(state, 30, 29)).toBe(POWER_TB);
    putXbld(state, 40, 30, ROAD_TB);
    expect(host.dispatch({ type: 'network', kind: 'power', from: T(38, 30), to: T(42, 30) }).ok).toBe(true);
    expect(xb(state, 40, 30)).toBe(0x44); expect(xb(state, 39, 30)).toBe(POWER_LR);
    putXbld(state, 50, 30, ROAD_TB);                                    // 道路 TB，铁路 LR 跨过
    expect(host.dispatch({ type: 'network', kind: 'rail', from: T(48, 30), to: T(52, 30) }).ok).toBe(true);
    expect(xb(state, 50, 30)).toBe(0x46);
    putXbld(state, 60, 30, 0x2d);                                       // 铁路 TB，道路 LR 跨过
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(58, 30), to: T(62, 30) }).ok).toBe(true);
    expect(xb(state, 60, 30)).toBe(0x45);
    putXbld(state, 70, 30, ROAD_LR);
    const r = host.dispatch({ type: 'network', kind: 'power', from: T(68, 30), to: T(72, 30) });
    expect(r).toMatchObject({ ok: true, cost: 8 });                     // 平行：该格跳过，其余 4 格照铺
    expect(xb(state, 70, 30)).toBe(ROAD_LR);
    expect(host.q.placement.preview({ type: 'network', kind: 'power', from: T(68, 30), to: T(72, 30) }).tiles.find((t) => t.i === T(70, 30))).toMatchObject({ ok: false, reason: 'obstructed' });
  });
  it('坡面：沿轴单级坡用坡面件，横向坡面跳过；铁路坡脚写半高件且不允许连续坡；障碍格跳过并继续', () => {
    const { host, state } = mk(profile);
    setSlope(state, T(12, 10), 2); setSlope(state, T(14, 10), 1);
    const r = host.dispatch({ type: 'network', kind: 'road', from: T(10, 10), to: T(16, 10) });
    expect(r).toMatchObject({ ok: true, cost: 60 });
    expect(xb(state, 12, 10)).toBe(0x1d + 3);                           // L-HR
    expect(xb(state, 14, 10)).toBe(0);
    setSlope(state, T(12, 20), 2);
    expect(host.dispatch({ type: 'network', kind: 'rail', from: T(10, 20), to: T(14, 20) }).ok).toBe(true);
    expect(xb(state, 12, 20)).toBe(0x2f); expect(xb(state, 11, 20)).toBe(0x3c); expect(xb(state, 13, 20)).toBe(RAIL_LR);
    setSlope(state, T(12, 24), 2); setSlope(state, T(13, 24), 2);
    expect(host.dispatch({ type: 'network', kind: 'rail', from: T(10, 24), to: T(14, 24) })).toMatchObject({ ok: true, cost: 75 });
    expect(xb(state, 12, 24)).toBe(0); expect(xb(state, 13, 24)).toBe(0);
    expect(host.dispatch({ type: 'placeBuilding', id: POLICE, x: 30, y: 29 }).ok).toBe(true);
    const r2 = host.dispatch({ type: 'network', kind: 'road', from: T(26, 30), to: T(36, 30) });
    expect(r2).toMatchObject({ ok: true, cost: 80 });
    expect(xb(state, 29, 30)).toBe(ROAD_LR); expect(xb(state, 31, 30)).toBe(POLICE); expect(xb(state, 33, 30)).toBe(ROAD_LR);
  });
  it('到达边缘：道路 / 铁路垂直于边的新直线格 → modal neighborConnect；电线 / 沿边铺设不弹', () => {
    const { host, state } = mk(profile);
    const r = host.dispatch({ type: 'network', kind: 'road', from: T(3, 64), to: T(0, 64) });
    expect(r.ok).toBe(true);
    expect(r.modal).toEqual({ id: 'neighborConnect', payload: { at: T(0, 64), kind: 'road', cost: 1000 } });
    expect(host.dispatch({ type: 'network', kind: 'power', from: T(3, 70), to: T(0, 70) }).modal).toBeUndefined();
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(0, 80), to: T(0, 90) }).modal).toBeUndefined();
    expect(host.dispatch({ type: 'network', kind: 'rail', from: T(100, 127), to: T(100, 124) }).modal).toEqual({ id: 'neighborConnect', payload: { at: T(100, 127), kind: 'rail', cost: 1000 } });
    state.layers.xtxt[T(0, 64)] = 0xfa;
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(0, 64), to: T(0, 64) }).modal).toBeUndefined();   // 已有连接 / 既有格不再弹
  });
  it('preview 纯读：不改哈希、不消费 PRNG；与命令同价；悲观桩下预览标 funds', () => {
    const { host, state, ctx } = mk(profile);
    const h = hashOf(state), p = ctx.prng.state();
    const pv = host.q.placement.preview({ type: 'network', kind: 'road', from: T(10, 10), to: T(20, 10) });
    expect(hashOf(state)).toBe(h); expect(ctx.prng.state()).toBe(p);
    expect(pv.cost).toBe(110); expect(pv.tiles).toHaveLength(11);
    expect(pv.ok).toBe(profile === 'optimistic');
    if (profile === 'pessimistic') expect(pv.reason).toBe('funds');
    const r = host.dispatch({ type: 'network', kind: 'road', from: T(10, 10), to: T(20, 10) });
    expect(r.cost).toBe(pv.cost);
    expect(ctx.prng.state()).toBe(p);                                    // 命令本身也不消费 PRNG（v1 无 NIMBY）
    expect(host.q.placement.preview({ type: 'setSpeed', speed: 3 })).toEqual({ ok: true, cost: 0, tiles: [] });
    expect(host.q.placement.preview({ type: 'tunnel', at: tileIndex(2, 2) }).reason).toBe('notImplemented');
    expect(host.dispatch({ type: 'tunnel', at: tileIndex(2, 2) }).reason).toBe('notImplemented');
  });
});

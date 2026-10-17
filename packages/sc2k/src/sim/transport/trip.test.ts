// ===== sim/transport/trip.test.ts =====（WORKPLAN WP6 验收：转移表逐行、回溯恢复步数、桥上直行、入地铁四向、popLevel==1 预算 75、失败不写交通、addTraffic 计数）
import { describe, expect, it } from 'vitest';
import { Corner, tileIndex } from '../../contracts/grid';
import { NET_BASE } from '../../contracts/net';
import type { System } from '../../contracts/system';
import { createTestContext, nullSystem } from '../../testkit';
import { building1x1, flush, lay, layLine, layUnd, layUndLine, setFunding, station2x2, sumXtrf, zoneTile } from './fixtures';
import { createTransportSystem } from './index';
import { Mode } from './model';
import { privOf } from './priv';
const MODE_NAMES = ['Road', 'Highway', 'Tunnel', 'RoadBridge', 'Walk', 'WalkHighway', 'WalkTunnel', 'WalkBridge', 'Bus', 'Exit', 'RailEnter', 'SubwayEnter', 'Rail', 'Subway'] as const;
import { bind, createRuntime, rebuildAll } from './runtime';
import { ARRIVE, BLOCKED, createTripEngine, stepCost, stepMode } from './trip';
import type { TransportTuning } from './tuning';

type Profile = 'optimistic' | 'pessimistic';
const C = { x: 40, y: 40 }, N = { x: 41, y: 40 };
const ci = tileIndex(C.x, C.y), ni = tileIndex(N.x, N.y);

/** 独立 Runtime + 引擎（直接读同一 state），场景用直接写层 + rebuildAll。 */
function mkEngine(tuning?: Partial<TransportTuning>) {
  const t = createTestContext({ systems: [createTransportSystem()], tuning: tuning ? { transport: tuning } : undefined });
  const rt = createRuntime();
  bind(rt, t.ctx);
  const eng = createTripEngine(rt);
  const L = t.state.layers;
  const clear = (): void => {
    for (let x = 34; x <= 48; x++) for (let y = 34; y <= 48; y++) { const i = tileIndex(x, y); L.xbld[i] = 0; L.xzon[i] = 0; L.xund[i] = 0; L.tunnelLevels[i] = 0; L.xtxt[i] = 0; }
  };
  const put = (x: number, y: number, o: { bld?: number; zone?: number; und?: number; tun?: number; corner?: number }): void => {
    const i = tileIndex(x, y);
    if (o.bld !== undefined) L.xbld[i] = o.bld;
    if (o.zone !== undefined) L.xzon[i] = (L.xzon[i]! & 0xf0) | o.zone;
    if (o.corner !== undefined) L.xzon[i] = (L.xzon[i]! & 0x0f) | o.corner;
    if (o.und !== undefined) L.xund[i] = o.und;
    if (o.tun !== undefined) L.tunnelLevels[i] = o.tun;
  };
  const depot = (id: number, x0: number, y0: number): void => {
    put(x0, y0, { bld: id, corner: Corner.TL }); put(x0 + 1, y0, { bld: id, corner: Corner.TR });
    put(x0, y0 + 1, { bld: id, corner: Corner.BL }); put(x0 + 1, y0 + 1, { bld: id, corner: Corner.BR });
  };
  const step = (mode: Mode, o: { visited?: number; zone?: number; cur?: number; next?: number } = {}): string => {
    rebuildAll(rt);
    const r = eng.step(mode, o.cur ?? ci, o.visited ?? 0, o.next ?? ni, o.zone ?? 1);
    return r === ARRIVE ? 'arrive' : r === BLOCKED ? 'blocked' : `${MODE_NAMES[stepMode(r)]}+${stepCost(r)}`;
  };
  return { ...t, rt, eng, L, clear, put, depot, step };
}

describe('转移表（§2.12.4）逐行', () => {
  const E = mkEngine();
  it('ROAD 行', () => {
    E.clear(); E.put(C.x, C.y, { bld: NET_BASE.road });
    E.put(N.x, N.y, { zone: 3 }); expect(E.step(Mode.Road, { zone: 1 })).toBe('arrive');
    expect(E.step(Mode.Road, { zone: 3 })).toBe('blocked');                         // C 起点不去 C
    expect(E.step(Mode.Road, { zone: 5 })).toBe('arrive');                          // I 去 C
    E.put(N.x, N.y, { zone: 0, bld: 0x3f }); expect(E.step(Mode.Road)).toBe('Tunnel+3');
    E.put(N.x, N.y, { bld: 0x58 }); expect(E.step(Mode.Road)).toBe('RoadBridge+3');
    E.put(N.x, N.y, { bld: 0x5b }); expect(E.step(Mode.Road)).toBe('RoadBridge+3'); // 原版怪癖：铁路桥对汽车一视同仁
    E.put(N.x, N.y, { bld: 0x5c }); expect(E.step(Mode.Road)).toBe('blocked');       // 高架电线默认不通行（WORKPLAN）
    E.put(N.x, N.y, { bld: 0x5d }); expect(E.step(Mode.Road)).toBe('Highway+2');
    E.put(N.x, N.y, { bld: NET_BASE.road + 7 }); expect(E.step(Mode.Road)).toBe('Road+3');
    E.put(N.x, N.y, { bld: 0x45 }); expect(E.step(Mode.Road)).toBe('Road+3');
    E.put(N.x, N.y, { bld: 0x4b }); expect(E.step(Mode.Road)).toBe('Road+3');
    E.put(N.x, N.y, { bld: 0x49 }); expect(E.step(Mode.Road)).toBe('blocked');
    E.put(N.x, N.y, { bld: NET_BASE.rail }); expect(E.step(Mode.Road)).toBe('blocked');
    E.put(N.x, N.y, { bld: 0xec, corner: Corner.All }); expect(E.step(Mode.Road)).toBe('Bus+4');
    E.put(N.x, N.y, { bld: 0xed }); expect(E.step(Mode.Road)).toBe('RailEnter+4');
    E.put(N.x, N.y, { bld: 0xe9 }); expect(E.step(Mode.Road)).toBe('SubwayEnter+4');
    E.put(N.x, N.y, { bld: 0xfb }); expect(E.step(Mode.Road, { zone: 7 })).toBe('arrive');
    E.put(N.x, N.y, { bld: 0xd2 }); expect(E.step(Mode.Road)).toBe('blocked');
    // 分区目的地先于一切：带 C 分区码的道路格也算到达
    E.put(N.x, N.y, { bld: NET_BASE.road, zone: 4 }); expect(E.step(Mode.Road)).toBe('arrive');
    const F = mkEngine({ carsCrossRailBridge: false, carsCrossWireBridge: true });
    F.put(C.x, C.y, { bld: NET_BASE.road }); F.put(N.x, N.y, { bld: 0x5b }); expect(F.step(Mode.Road)).toBe('blocked');
    F.put(N.x, N.y, { bld: 0x5c }); expect(F.step(Mode.Road)).toBe('RoadBridge+3');      // 字面复刻开关
    F.put(N.x, N.y, { bld: 0x57 }); expect(F.step(Mode.Road)).toBe('RoadBridge+3');
  });
  it('HIGHWAY / TUNNEL / ROADBRIDGE 行（不检查目的地）', () => {
    E.clear();
    E.put(N.x, N.y, { bld: 0x49, zone: 3 }); expect(E.step(Mode.Highway)).toBe('Highway+1');
    E.put(N.x, N.y, { bld: 0x69 }); expect(E.step(Mode.Highway)).toBe('Highway+1');
    E.put(N.x, N.y, { bld: 0x5e }); expect(E.step(Mode.Highway)).toBe('Road+1');
    E.put(N.x, N.y, { bld: NET_BASE.road }); expect(E.step(Mode.Highway)).toBe('blocked');
    E.put(N.x, N.y, { bld: 0, zone: 3, tun: 2 }); expect(E.step(Mode.Tunnel)).toBe('Tunnel+3');
    E.put(N.x, N.y, { bld: 0x88, tun: 2 }); expect(E.step(Mode.Tunnel)).toBe('Tunnel+3');   // 隧道内部可建楼（§4.20）
    E.put(N.x, N.y, { bld: NET_BASE.road, tun: 0 }); expect(E.step(Mode.Tunnel)).toBe('Road+3');
    E.put(N.x, N.y, { bld: 0x41 }); expect(E.step(Mode.Tunnel)).toBe('Road+3');            // 出洞必须踩到 ROAD_SET（隧道口 ∈ ROAD_SET）
    E.put(N.x, N.y, { bld: 0 }); expect(E.step(Mode.Tunnel)).toBe('blocked');
    E.put(N.x, N.y, { bld: 0x57 }); expect(E.step(Mode.RoadBridge)).toBe('RoadBridge+3');
    E.put(N.x, N.y, { bld: 0x5d }); expect(E.step(Mode.RoadBridge)).toBe('Road+3');
    E.put(N.x, N.y, { bld: 0xec }); expect(E.step(Mode.RoadBridge)).toBe('blocked');
  });
  it('WALK 系行', () => {
    E.clear();
    E.put(N.x, N.y, { zone: 6 }); expect(E.step(Mode.Walk, { zone: 2 })).toBe('arrive');
    E.put(N.x, N.y, { zone: 0, bld: 0x42 }); expect(E.step(Mode.Walk)).toBe('WalkTunnel+2');
    E.put(N.x, N.y, { bld: 0x51 }); expect(E.step(Mode.Walk)).toBe('WalkBridge+2');
    E.put(N.x, N.y, { bld: 0x47 }); expect(E.step(Mode.Walk)).toBe('WalkBridge+2');        // 交叉件按过桥直行（原版粗分类）
    E.put(N.x, N.y, { bld: 0x60 }); expect(E.step(Mode.Walk)).toBe('WalkHighway+2');
    E.put(N.x, N.y, { bld: NET_BASE.road + 14 }); expect(E.step(Mode.Walk)).toBe('Walk+2');
    E.put(N.x, N.y, { bld: 0xed }); expect(E.step(Mode.Walk)).toBe('RailEnter+4');
    E.put(N.x, N.y, { bld: 0xff }); expect(E.step(Mode.Walk, { zone: 9 })).toBe('arrive');
    E.put(N.x, N.y, { bld: 0x4a }); expect(E.step(Mode.Walk)).toBe('WalkBridge+2');      // 原版粗分类区间 0x43–0x50 含高速直线段（spec 原文怪癖）
    E.put(N.x, N.y, { bld: 0x61 }); expect(E.step(Mode.Walk)).toBe('blocked');            // 高速坡面块不在该区间
    E.put(N.x, N.y, { bld: 0x4a }); expect(E.step(Mode.WalkHighway)).toBe('WalkHighway+1');
    E.put(N.x, N.y, { bld: 0x5f }); expect(E.step(Mode.WalkHighway)).toBe('Walk+1');
    E.put(N.x, N.y, { bld: 0 }); expect(E.step(Mode.WalkHighway)).toBe('blocked');
    E.put(N.x, N.y, { bld: 0, tun: 3 }); expect(E.step(Mode.WalkTunnel)).toBe('WalkTunnel+2');
    E.put(N.x, N.y, { bld: NET_BASE.road, tun: 0 }); expect(E.step(Mode.WalkTunnel)).toBe('Walk+2');
    E.put(N.x, N.y, { bld: 0x5a }); expect(E.step(Mode.WalkBridge)).toBe('WalkBridge+2');
    E.put(N.x, N.y, { bld: 0x43 }); expect(E.step(Mode.WalkBridge)).toBe('WalkBridge+2');
    E.put(N.x, N.y, { bld: NET_BASE.road + 3 }); expect(E.step(Mode.WalkBridge)).toBe('Walk+2');
    const W = mkEngine({ walkCrossoverAsBridge: false });
    W.put(N.x, N.y, { bld: 0x45 }); expect(W.step(Mode.Walk)).toBe('Walk+2');
    W.put(N.x, N.y, { bld: 0x47 }); expect(W.step(Mode.Walk)).toBe('blocked');
    W.put(N.x, N.y, { bld: 0x4a }); expect(W.step(Mode.Walk)).toBe('blocked');
    W.put(N.x, N.y, { bld: 0x43 }); expect(W.step(Mode.WalkBridge)).toBe('Walk+2');
  });
  it('BUS / EXIT / RAIL_ENTER 行：本座未踏过 0 步、已踏过不可走、另一座 4 步、出站', () => {
    E.clear();
    E.depot(0xec, 39, 39);                                                           // 本座：cur = (40,40) 为 B-R（idx 3）
    const inner = tileIndex(39, 40);                                                 // 本座 B-L（idx 2）
    expect(E.step(Mode.Bus, { visited: 1 << 3, next: inner })).toBe('Bus+0');
    expect(E.step(Mode.Bus, { visited: (1 << 3) | (1 << 2), next: inner })).toBe('blocked');
    E.depot(0xec, 41, 39);                                                           // 另一座公交站：next = (41,40) 为其 B-L
    expect(E.step(Mode.Bus, { visited: 1 << 3 })).toBe('Bus+4');
    E.depot(0xed, 41, 39);
    expect(E.step(Mode.Bus, { visited: 1 << 3 })).toBe('blocked');                     // 公交 → 火车站：表中无此行
    E.put(41, 39, { bld: 0 }); E.put(42, 39, { bld: 0 }); E.put(41, 40, { bld: 0 }); E.put(42, 40, { bld: 0 });
    E.put(N.x, N.y, { bld: NET_BASE.road + 1 }); expect(E.step(Mode.Bus, { visited: 1 << 3 })).toBe('Walk+2');
    E.put(N.x, N.y, { bld: 0, zone: 4 }); expect(E.step(Mode.Bus, { visited: 1 << 3 })).toBe('arrive');
    E.put(N.x, N.y, { zone: 0, bld: NET_BASE.rail }); expect(E.step(Mode.Bus, { visited: 1 << 3 })).toBe('blocked');
    // EXIT（刚出站，本座为火车站）
    E.depot(0xed, 39, 39);
    expect(E.step(Mode.Exit, { visited: 1 << 3, next: inner })).toBe('Exit+0');
    expect(E.step(Mode.Exit, { visited: 0b1111, next: inner })).toBe('blocked');
    E.depot(0xec, 41, 39); expect(E.step(Mode.Exit, { visited: 1 << 3 })).toBe('Exit+4');
    E.depot(0xed, 41, 39); expect(E.step(Mode.Exit, { visited: 1 << 3 })).toBe('Exit+4');
    E.put(41, 39, { bld: 0 }); E.put(42, 39, { bld: 0 }); E.put(41, 40, { bld: 0 }); E.put(42, 40, { bld: 0 });
    E.put(N.x, N.y, { bld: 0xe9, corner: Corner.All }); expect(E.step(Mode.Exit, { visited: 1 << 3 })).toBe('blocked');
    E.put(N.x, N.y, { bld: NET_BASE.road, corner: 0 }); expect(E.step(Mode.Exit, { visited: 1 << 3 })).toBe('Road+3');
    E.put(N.x, N.y, { bld: 0, zone: 1 }); expect(E.step(Mode.Exit, { visited: 1 << 3, zone: 3 })).toBe('arrive');
    // RAIL_ENTER
    E.put(N.x, N.y, { zone: 0 });
    expect(E.step(Mode.RailEnter, { visited: 1 << 3, next: inner })).toBe('RailEnter+0');
    expect(E.step(Mode.RailEnter, { visited: 0b1100, next: inner })).toBe('blocked');
    E.depot(0xed, 41, 39); expect(E.step(Mode.RailEnter, { visited: 1 << 3 })).toBe('RailEnter+4');
    E.depot(0xec, 41, 39); expect(E.step(Mode.RailEnter, { visited: 1 << 3 })).toBe('blocked');
    E.put(41, 39, { bld: 0 }); E.put(42, 39, { bld: 0 }); E.put(41, 40, { bld: 0 }); E.put(42, 40, { bld: 0 });
    E.put(N.x, N.y, { bld: NET_BASE.rail + 1 }); expect(E.step(Mode.RailEnter, { visited: 1 << 3 })).toBe('Rail+1');
    E.put(N.x, N.y, { bld: 0x45 }); expect(E.step(Mode.RailEnter, { visited: 1 << 3 })).toBe('Rail+1');
    E.put(N.x, N.y, { bld: NET_BASE.road }); expect(E.step(Mode.RailEnter, { visited: 1 << 3 })).toBe('blocked');
    const S4 = mkEngine({ stationInteriorStep: 4 });
    S4.depot(0xed, 39, 39);
    expect(S4.step(Mode.RailEnter, { visited: 1 << 3, next: inner })).toBe('RailEnter+4');  // 字面复刻预设
    expect(S4.step(Mode.RailEnter, { visited: 0b1100, next: inner })).toBe('blocked');       // 掩码仍然生效
  });
  it('SUBWAY_ENTER / RAIL / SUBWAY 行与地铁↔铁路换乘', () => {
    E.clear();
    E.put(C.x, C.y, { bld: 0xe9, und: 0x23 });
    E.put(N.x, N.y, { und: NET_BASE.subway }); expect(E.step(Mode.SubwayEnter)).toBe('Subway+1');
    E.put(N.x, N.y, { und: 0x20 }); expect(E.step(Mode.SubwayEnter)).toBe('Subway+1');
    E.put(N.x, N.y, { und: NET_BASE.pipe }); expect(E.step(Mode.SubwayEnter)).toBe('blocked');
    E.put(N.x, N.y, { und: 0, bld: NET_BASE.road, zone: 3 }); expect(E.step(Mode.SubwayEnter)).toBe('blocked');   // 地下不看地表
    E.clear(); E.put(C.x, C.y, { bld: NET_BASE.rail });
    E.depot(0xed, 41, 39); expect(E.step(Mode.Rail)).toBe('Exit+4');
    E.put(41, 39, { bld: 0 }); E.put(42, 39, { bld: 0 }); E.put(41, 40, { bld: 0 }); E.put(42, 40, { bld: 0 });
    E.put(N.x, N.y, { bld: 0x3c }); expect(E.step(Mode.Rail)).toBe('Rail+1');
    E.put(N.x, N.y, { bld: 0x5a }); expect(E.step(Mode.Rail)).toBe('Rail+1');
    E.put(N.x, N.y, { bld: 0x6d }); expect(E.step(Mode.Rail)).toBe('Rail+1');
    E.put(N.x, N.y, { bld: 0xfc }); expect(E.step(Mode.Rail)).toBe('arrive');
    E.put(N.x, N.y, { bld: 0, zone: 3 }); expect(E.step(Mode.Rail)).toBe('blocked');          // 轨道上不检查分区
    E.put(N.x, N.y, { zone: 0, bld: NET_BASE.road }); expect(E.step(Mode.Rail)).toBe('blocked');
    E.put(N.x, N.y, { bld: 0xec }); expect(E.step(Mode.Rail)).toBe('blocked');
    E.clear(); E.put(C.x, C.y, { und: NET_BASE.subway });
    E.put(N.x, N.y, { bld: 0xe9, und: 0x23 }); expect(E.step(Mode.Subway)).toBe('Exit+4');
    E.put(N.x, N.y, { bld: 0, und: 0x1f }); expect(E.step(Mode.Subway)).toBe('Subway+1');
    E.put(N.x, N.y, { und: 0x23 }); expect(E.step(Mode.Subway)).toBe('Subway+1');
    E.put(N.x, N.y, { und: 0x22 }); expect(E.step(Mode.Subway)).toBe('Subway+1');              // 导弹井怪癖
    E.put(N.x, N.y, { und: 0x12 }); expect(E.step(Mode.Subway)).toBe('blocked');
    E.put(N.x, N.y, { und: 0, zone: 3 }); expect(E.step(Mode.Subway)).toBe('blocked');
    // 转换件换乘（默认开）：cur 为转换件
    E.clear(); E.put(C.x, C.y, { bld: 0x6d, und: 0x23 });
    E.put(N.x, N.y, { und: NET_BASE.subway }); expect(E.step(Mode.Rail)).toBe('Subway+1');
    E.put(N.x, N.y, { und: 0, bld: NET_BASE.rail }); expect(E.step(Mode.Subway)).toBe('Rail+1');
    E.put(C.x, C.y, { bld: NET_BASE.rail, und: 0 }); expect(E.step(Mode.Subway)).toBe('blocked');   // 普通铁路格下方没有地铁
    const X = mkEngine({ allowSubRailTransfer: false, missileSiloIsSubway: false });
    X.put(C.x, C.y, { bld: 0x6d, und: 0x23 });
    X.put(N.x, N.y, { und: NET_BASE.subway }); expect(X.step(Mode.Rail)).toBe('blocked');
    X.put(N.x, N.y, { und: 0, bld: NET_BASE.rail }); expect(X.step(Mode.Subway)).toBe('blocked');
    X.put(N.x, N.y, { bld: 0, und: 0x22 }); expect(X.step(Mode.Subway)).toBe('blocked');
  });
});

/** 端到端场景：R 分区 (10,10)，起点经 24 偏移找到相邻网络格。 */
function world(profile: Profile, tuning?: Partial<TransportTuning>, extra: System[] = []) {
  const t = createTestContext({ profile, systems: [createTransportSystem(), ...extra], tuning: tuning ? { transport: tuning } : undefined });
  setFunding(t.state, 100);
  zoneTile(t.ctx, 10, 10, 1);
  return { ...t, T: t.ctx.q.transport, origin: tileIndex(10, 10) };
}
const seeds = Array.from({ length: 24 }, (_, k) => k * 7919 + 1);

describe.each(['optimistic', 'pessimistic'] as const)('runTrip 端到端（%s 桩）', (profile) => {
  it('直路：成功、steps = 3 × 格数、沿路 ROAD 帧累加 popLevel 到 XTRF；popLevel 0 不写交通不计乘客', () => {
    const w = world(profile);
    layLine(w.ctx, 'road', 11, 10, 20, 10); zoneTile(w.ctx, 21, 10, 3); flush(w.host);
    for (const s of seeds) {
      w.state.maps.xtrf.fill(0); w.ctx.prng.seed(s);
      const r = w.T.runTrip(w.origin, 1, 2);
      expect(r).toEqual({ ok: true, usedBus: false, usedRail: false, usedSubway: false, steps: 27 });
      expect(sumXtrf(w.state)).toBe(20);
    }
    w.state.maps.xtrf.fill(0);
    const p0 = JSON.stringify(w.state.priv.transport);
    expect(w.T.runTrip(w.origin, 1, 0).ok).toBe(true);
    expect(sumXtrf(w.state)).toBe(0);
    expect(JSON.stringify(w.state.priv.transport)).toBe(p0);
  });
  it('预算：popLevel ≥ 2 为 100 步、popLevel == 1 为 75 步（30 格路：87 步 vs 失败）；34 格成功、35 格失败', () => {
    const w = world(profile);
    layLine(w.ctx, 'road', 11, 10, 40, 10); zoneTile(w.ctx, 41, 10, 3); flush(w.host);
    for (const s of seeds.slice(0, 8)) {
      w.ctx.prng.seed(s); expect(w.T.runTrip(w.origin, 1, 2)).toMatchObject({ ok: true, steps: 87 });
      w.ctx.prng.seed(s); expect(w.T.runTrip(w.origin, 1, 1).ok).toBe(false);
      w.ctx.prng.seed(s); expect(w.T.runTrip(w.origin, 1, 4)).toMatchObject({ ok: true, steps: 87 });
    }
    zoneTile(w.ctx, 41, 10, 0); layLine(w.ctx, 'road', 41, 10, 44, 10); zoneTile(w.ctx, 45, 10, 3); flush(w.host);   // 34 格
    w.ctx.prng.seed(5); expect(w.T.runTrip(w.origin, 1, 2)).toMatchObject({ ok: true, steps: 99 });
    zoneTile(w.ctx, 45, 10, 0); lay(w.ctx, 45, 10, NET_BASE.road); zoneTile(w.ctx, 46, 10, 3); flush(w.host);         // 35 格
    w.ctx.prng.seed(5); expect(w.T.runTrip(w.origin, 1, 2).ok).toBe(false);
  });
  it('失败不写交通：死胡同 → 失败且 XTRF 为 0（消费 PRNG）；没有起点 → 失败且不消费 PRNG', () => {
    const w = world(profile);
    const s0 = w.ctx.prng.state();
    expect(w.T.runTrip(w.origin, 1, 3).ok).toBe(false);
    expect(w.ctx.prng.state()).toBe(s0);
    layLine(w.ctx, 'road', 11, 10, 25, 10); flush(w.host);
    expect(w.T.runTrip(w.origin, 1, 3).ok).toBe(false);
    expect(w.ctx.prng.state()).not.toBe(s0);
    expect(sumXtrf(w.state)).toBe(0);
    expect(w.T.runTrip(-5, 1, 3).ok).toBe(false);
  });
  it('回溯恢复步数与剩余方向：带 10 格死胡同支路的主路，任意种子 steps 恒为主路长度（20 格 = 19 步 × 3）、支路不写交通', () => {
    const plain = world(profile);
    layLine(plain.ctx, 'road', 11, 10, 30, 10); zoneTile(plain.ctx, 31, 10, 3); flush(plain.host);
    const w = world(profile);
    layLine(w.ctx, 'road', 11, 10, 30, 10); zoneTile(w.ctx, 31, 10, 3);
    layLine(w.ctx, 'road', 15, 11, 15, 20); layLine(w.ctx, 'road', 22, 11, 22, 20); layLine(w.ctx, 'road', 22, 9, 22, 1);
    flush(w.host);
    let divergent = 0;
    for (const s of seeds) {
      w.state.maps.xtrf.fill(0); w.ctx.prng.seed(s); plain.ctx.prng.seed(s);
      const r = w.T.runTrip(w.origin, 1, 2);
      expect(r.ok, `seed ${s}`).toBe(true);
      expect(r.steps).toBe(57);                                   // 任一支路（10 格 = 30 步）若未在回溯时退还，总步数就不可能恒为 57
      expect(sumXtrf(w.state)).toBe(40);
      plain.T.runTrip(plain.origin, 1, 2);
      if (plain.ctx.prng.state() !== w.ctx.prng.state()) divergent++;   // 探索过支路的样本多消费了 PRNG
    }
    expect(divergent).toBeGreaterThan(0);
  });
  it('桥上只许直行：堤道中段旁的垂直支路永不被尝试；直行到对岸成功且桥面帧计交通', () => {
    const w = world(profile);
    layLine(w.ctx, 'road', 11, 10, 19, 10); lay(w.ctx, 20, 10, 0x58); lay(w.ctx, 21, 10, 0x57); lay(w.ctx, 22, 10, 0x58);
    lay(w.ctx, 21, 11, NET_BASE.road + 1); zoneTile(w.ctx, 21, 12, 3); flush(w.host);
    for (const s of seeds) { w.ctx.prng.seed(s); expect(w.T.runTrip(w.origin, 1, 2).ok, `seed ${s}`).toBe(false); }
    lay(w.ctx, 23, 10, NET_BASE.road); zoneTile(w.ctx, 24, 10, 3); flush(w.host);
    for (const s of seeds) {
      w.state.maps.xtrf.fill(0); w.ctx.prng.seed(s);
      expect(w.T.runTrip(w.origin, 1, 2)).toMatchObject({ ok: true, steps: 36 });
      expect(sumXtrf(w.state)).toBe(26);
    }
  });
  it('刚入地铁四向全开：从进站方向原路向回走地铁；出站回到汽车模式；隧道 / 步行 / 轨道帧不计交通', () => {
    const w = world(profile);
    lay(w.ctx, 11, 10, NET_BASE.road); building1x1(w.ctx, 0xe9, 12, 10); layUnd(w.ctx, 12, 10, 0x23);
    layUndLine(w.ctx, 'subway', 7, 10, 11, 10); building1x1(w.ctx, 0xe9, 6, 10); layUnd(w.ctx, 6, 10, 0x23);
    lay(w.ctx, 5, 10, NET_BASE.road); zoneTile(w.ctx, 4, 10, 3); flush(w.host);
    const before = JSON.stringify(w.state.priv.transport);
    for (const s of seeds) {
      w.state.maps.xtrf.fill(0); w.ctx.prng.seed(s);
      expect(w.T.runTrip(w.origin, 1, 3), `seed ${s}`).toEqual({ ok: true, usedBus: false, usedRail: false, usedSubway: true, steps: 16 });
      expect(sumXtrf(w.state)).toBe(6);
    }
    expect(JSON.stringify(w.state.priv.transport)).not.toBe(before);
    expect(privOf(w.state).subway).toBe(3 * seeds.length);
  });
  it('2×2 火车站：站内 0 步移动 + visited 掩码（不会 0 步绕圈）、换乘 4 步、出站后汽车模式；stationInteriorStep=4 时多扣 8–24 步', () => {
    const build = (tuning?: Partial<TransportTuning>) => {
      const w = world(profile, tuning);
      station2x2(w.ctx, 0xed, 11, 9); layLine(w.ctx, 'rail', 13, 9, 20, 9); station2x2(w.ctx, 0xed, 21, 9);
      lay(w.ctx, 23, 10, NET_BASE.road); zoneTile(w.ctx, 24, 10, 3); flush(w.host);
      return w;
    };
    const w = build();
    expect(w.T.stationAt(tileIndex(11, 10))).toEqual({ kind: 2, id: 0, anchor: tileIndex(11, 9), n: 2 });
    expect(w.T.stationAt(tileIndex(22, 10))?.id).toBe(1);
    for (const s of seeds) {
      w.state.maps.xtrf.fill(0); w.ctx.prng.seed(s);
      const r = w.T.runTrip(w.origin, 1, 2);
      expect(r, `seed ${s}`).toEqual({ ok: true, usedBus: false, usedRail: true, usedSubway: false, steps: 15 });
      expect(sumXtrf(w.state)).toBe(2);
    }
    const w4 = build({ stationInteriorStep: 4 });
    for (const s of seeds) {
      w4.ctx.prng.seed(s);
      const r = w4.T.runTrip(w4.origin, 1, 2);
      expect(r.ok, `seed ${s}`).toBe(true);
      expect((r.steps - 15) % 4).toBe(0);
      expect(r.steps).toBeGreaterThanOrEqual(15 + 8); expect(r.steps).toBeLessThanOrEqual(15 + 24);
    }
  });
  it('公交：踏入公交站后步行 2 步 / 格且不计交通；乘客按 popLevel 累计', () => {
    const w = world(profile);
    station2x2(w.ctx, 0xec, 11, 9); layLine(w.ctx, 'road', 13, 10, 30, 10); zoneTile(w.ctx, 31, 10, 3); flush(w.host);
    for (const s of seeds) {
      w.state.maps.xtrf.fill(0); w.ctx.prng.seed(s);
      expect(w.T.runTrip(w.origin, 1, 4), `seed ${s}`).toEqual({ ok: true, usedBus: true, usedRail: false, usedSubway: false, steps: 36 });
      expect(sumXtrf(w.state)).toBe(0);
    }
    expect(privOf(w.state).bus).toBe(4 * seeds.length);
  });
  it('邻城连接：从 XTXT 0xFA 的边缘格走出地图即到达；无标记则失败；Arco 无条件到达', () => {
    const w = world(profile);
    zoneTile(w.ctx, 120, 10, 1); layLine(w.ctx, 'road', 121, 10, 127, 10); flush(w.host);
    const o = tileIndex(120, 10);
    w.ctx.prng.seed(1); expect(w.T.runTrip(o, 1, 2).ok).toBe(false);
    w.state.layers.xtxt[tileIndex(127, 10)] = 0xfa;
    for (const s of seeds) {
      w.state.maps.xtrf.fill(0); w.ctx.prng.seed(s);
      expect(w.T.runTrip(o, 1, 2)).toMatchObject({ ok: true, steps: 18 });
      expect(sumXtrf(w.state)).toBe(14);
    }
    building1x1(w.ctx, 0xfb, 15, 10); layLine(w.ctx, 'road', 11, 10, 14, 10); flush(w.host);
    w.ctx.prng.seed(3); expect(w.T.runTrip(w.origin, 7, 2)).toMatchObject({ ok: true, steps: 9 });   // 军事分区起点 destMask 0，只能靠 Arco
  });
  it('addTraffic 调用计数 == 汽车模式帧数（经 services 的 action）；栈上限按失败处理', () => {
    const calls: Array<[number, number]> = [];
    const base = nullSystem('services');
    const services: System = { ...base, actions: { ...base.actions, addTraffic: (tile, weight) => { calls.push([tile, weight]); } } };
    const w = world(profile, undefined, [services]);
    layLine(w.ctx, 'road', 11, 10, 20, 10); zoneTile(w.ctx, 21, 10, 3); flush(w.host);
    w.ctx.prng.seed(11);
    expect(w.T.runTrip(w.origin, 1, 3).ok).toBe(true);
    expect(calls).toHaveLength(10);
    expect(new Set(calls.map((c) => c[0])).size).toBe(10);
    expect(calls.every((c) => c[1] === 3)).toBe(true);
    const tiny = world(profile, { stackLimit: 5 });
    layLine(tiny.ctx, 'road', 11, 10, 20, 10); zoneTile(tiny.ctx, 21, 10, 3); flush(tiny.host);
    tiny.ctx.prng.seed(11);
    expect(tiny.T.runTrip(tiny.origin, 1, 3).ok).toBe(false);
  });
  it('确定性：同种子同结果序列；乘客累计进 priv 与 hash("full")，快照往返保留', () => {
    const run = (): string[] => {
      const w = world(profile);
      station2x2(w.ctx, 0xec, 11, 9); layLine(w.ctx, 'road', 13, 10, 30, 10); layLine(w.ctx, 'road', 20, 11, 20, 25); zoneTile(w.ctx, 31, 10, 3); flush(w.host);
      w.ctx.prng.seed(2024);
      const out: string[] = [];
      for (let k = 0; k < 20; k++) out.push(JSON.stringify(w.T.runTrip(w.origin, 1, (1 + (k % 4)) as 1 | 2 | 3 | 4)));
      out.push(String(w.host.hash('full')));
      return out;
    };
    expect(run()).toEqual(run());
    const w = world(profile);
    station2x2(w.ctx, 0xec, 11, 9); layLine(w.ctx, 'road', 13, 10, 30, 10); zoneTile(w.ctx, 31, 10, 3); flush(w.host);
    const h0 = w.host.hash('full');
    w.ctx.prng.seed(9); w.T.runTrip(w.origin, 1, 2);
    expect(w.host.hash('full')).not.toBe(h0);
    const other = world(profile);
    other.host.loadSnapshot(w.host.saveSnapshot());
    expect(other.state.priv.transport).toEqual(w.state.priv.transport);
    expect(other.T.stationAt(tileIndex(12, 10))?.n).toBe(2);
  });
  it('车站登记：2×2 四格同 id；并排两座 id 不同；角标 0xF0 的单格车站按 1×1；stationFootprint=1 时四格为四座', () => {
    const w = world(profile);
    station2x2(w.ctx, 0xec, 30, 30); station2x2(w.ctx, 0xec, 32, 30); flush(w.host);
    const a = w.T.stationAt(tileIndex(31, 31))!, b = w.T.stationAt(tileIndex(32, 31))!;
    expect(a.id).not.toBe(b.id); expect(a.n).toBe(2); expect(b.anchor).toBe(tileIndex(32, 30));
    expect(w.T.stationAt(tileIndex(31, 32))).toBeNull(); expect(w.T.stationAt(-1)).toBeNull();
    building1x1(w.ctx, 0xed, 50, 50); building1x1(w.ctx, 0xed, 51, 50); building1x1(w.ctx, 0xed, 50, 51); building1x1(w.ctx, 0xed, 51, 51); flush(w.host);
    const ids = new Set([50, 51].flatMap((x) => [50, 51].map((y) => w.T.stationAt(tileIndex(x, y))!.id)));
    expect(ids.size).toBe(4);
    expect(w.T.stationAt(tileIndex(50, 50))!.n).toBe(1);
    const one = world(profile, { stationFootprint: { bus: 1, rail: 1, subway: 1 } });
    station2x2(one.ctx, 0xec, 30, 30); flush(one.host);
    expect(new Set([30, 31].flatMap((x) => [30, 31].map((y) => one.T.stationAt(tileIndex(x, y))!.id))).size).toBe(4);
    // 角标变化（zone 扇出）重新归并：抹掉角标后四格全 0 仍按 2×2
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) w.ctx.act.setXzon(tileIndex(30 + dx, 30 + dy), 0);
    flush(w.host);
    expect(w.T.stationAt(tileIndex(31, 31))!.n).toBe(2);
  });
});

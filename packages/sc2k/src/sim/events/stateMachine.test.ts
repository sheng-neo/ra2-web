// WP13 验收：状态机（requestDisaster → modeChanged(Disaster) → disasterEnded → modeChanged(City)、noDisasters 只禁随机、宽限期、cheat 写 pending、notImplemented）。
import { describe, expect, it } from 'vitest';
import { NOT_IMPLEMENTED_RESULT } from '../../contracts/commands';
import { CityMode, DisasterKind, TileMarker, tileIndex } from '../../contracts/grid';
import { createTestContext, runDays } from '../../testkit';
import { ofType, placeBuilding, runTicks, runUntil } from './fixtures';
import { createEventsSystem } from './index';
import { DEFAULT_EVENTS_TUNING } from './tuning';

const HOUSE = 0x70;

describe.each(['optimistic', 'pessimistic'] as const)('events 状态机（%s 桩）', (profile) => {
  const mk = (tuning?: object, seed = 7) => createTestContext({ systems: [createEventsSystem()], profile, seed, tuning: tuning ? { events: tuning } : undefined });

  it('requestDisaster(Fire) → 下一 tick 进入灾害模式（modeChanged / disasterStarted / disasterAlert 模态）→ 烧尽 → disasterEnded + modeChanged(City) + 号外', () => {
    const { host, ctx, state } = mk();
    placeBuilding(ctx, HOUSE, 40, 40, 1);
    host.drainEvents();
    const r = host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 40, y: 40 });
    expect(r.ok).toBe(true);
    expect(state.disaster.pending).toBe(DisasterKind.Fire);
    expect(state.clock.mode).toBe(CityMode.City);                       // 命令只写 pending
    runTicks(host, 1);
    expect(state.clock.mode).toBe(CityMode.Disaster);
    expect(state.disaster.active).toBe(true);
    expect(state.disaster.pending).toBe(DisasterKind.None);
    expect(state.disaster.current).toBe(DisasterKind.Fire);
    expect(host.q.disasters.marker(tileIndex(40, 40))).toBe(TileMarker.Fire);
    const started = host.drainEvents();
    expect(ofType(started, 'modeChanged').map((e) => e.mode)).toEqual([CityMode.Disaster]);
    expect(ofType(started, 'disasterStarted')).toEqual([{ type: 'disasterStarted', kind: DisasterKind.Fire, x: 40, y: 40 }]);
    expect(ofType(started, 'modal').map((e) => e.id)).toEqual(['disasterAlert']);
    expect(ofType(started, 'goto')).toHaveLength(1);                     // autoGoto 默认开
    const used = runUntil(host, () => !state.disaster.active, 400);
    expect(used).toBeLessThan(400);
    expect(state.clock.mode).toBe(CityMode.City);
    const ended = host.drainEvents();
    expect(ofType(ended, 'disasterEnded')[0]).toMatchObject({ kind: DisasterKind.Fire });
    expect(ofType(ended, 'modeChanged').map((e) => e.mode)).toEqual([CityMode.City]);
    expect(ofType(ended, 'paper')).toEqual([{ type: 'paper', extra: true }]);
    expect(ofType(ended, 'modal').map((e) => e.id)).toEqual(['extraPaper']);
    const id = state.layers.xbld[tileIndex(40, 40)]!;
    expect(id).toBeGreaterThanOrEqual(0x01); expect(id).toBeLessThanOrEqual(0x04);
    expect(host.q.disasters.markers().every((m) => m === 0)).toBe(true);
    expect(state.clock.modalPause).toBe(0);
  });

  it('cheat / 其它系统只写 pending：下一 thingsTick 启动；灾害中再写 pending 叠加而不重置', () => {
    const { host, ctx, state } = mk();
    placeBuilding(ctx, HOUSE, 20, 20);
    state.disaster.pending = DisasterKind.Earthquake;                     // economy 的 cheat 语义
    runTicks(host, 1);
    expect(state.clock.mode).toBe(CityMode.Disaster);
    expect(state.disaster.current).toBe(DisasterKind.Earthquake);
    state.disaster.pending = DisasterKind.Tornado;
    runTicks(host, 1);
    expect(state.disaster.current).toBe(DisasterKind.Tornado);
    expect(state.disaster.active).toBe(true);
    expect(host.q.disasters.things()).toHaveLength(1);
  });

  it('菜单之外 / v1 未实现的灾害 → NOT_IMPLEMENTED_RESULT 同一对象；地形编辑模式 → reason mode', () => {
    const { host, state } = mk();
    for (const kind of [DisasterKind.Hurricane, DisasterKind.PlaneCrash, DisasterKind.Riot, DisasterKind.Volcano, DisasterKind.None]) {
      expect(host.dispatch({ type: 'requestDisaster', kind })).toBe(NOT_IMPLEMENTED_RESULT);
    }
    expect(host.commandLog()).toHaveLength(0);
    state.clock.mode = CityMode.TerrainEdit;
    expect(host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire }).reason).toBe('mode');
  });

  it('前置条件不满足（空城无可燃格的 Fire、无水的 Flood）→ message 且不进入灾害模式', () => {
    const { host, state } = mk();
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire });
    runTicks(host, 1);
    expect(state.clock.mode).toBe(CityMode.City);
    expect(state.disaster.active).toBe(false);
    expect(state.disaster.pending).toBe(DisasterKind.None);
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Flood });
    runTicks(host, 1);
    expect(state.clock.mode).toBe(CityMode.City);
    const msgs = ofType(host.drainEvents(), 'message');
    expect(msgs.map((m) => m.key)).toEqual(['message.disasterUnavailable', 'message.disasterUnavailable']);
    expect(msgs.map((m) => m.args?.name)).toEqual(['disaster.fire', 'disaster.flood']);
  });

  it('宽限期内无随机灾害；宽限后 monthlyChance=1 的第 24 天判定写 pending；noDisasters 只禁随机', () => {
    const T = { graceDays: [0, 75, 75, 75], monthlyChance: [0, 1, 1, 1], weights: { fire: 1, flood: 0, earthquake: 0, tornado: 0, monster: 0 } };
    const a = mk(T);
    placeBuilding(a.ctx, HOUSE, 30, 30);
    runDays(a.host, 74);                                                  // 判定日 24 / 49 都在宽限期内
    expect(a.state.disaster.pending).toBe(DisasterKind.None);
    expect(ofType(a.host.drainEvents(), 'disasterStarted')).toHaveLength(0);
    runDays(a.host, 26);                                                  // 第 99 天判定：age ≥ 75
    expect(a.state.disaster.pending).toBe(DisasterKind.Fire);
    const b = mk(T);
    placeBuilding(b.ctx, HOUSE, 30, 30);
    b.state.disaster.noDisasters = true;
    runDays(b.host, 100);
    expect(b.state.disaster.pending).toBe(DisasterKind.None);
    expect(b.host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire }).ok).toBe(true);   // 菜单不受约束
    runTicks(b.host, 1);
    expect(b.state.clock.mode).toBe(CityMode.Disaster);
  });

  it('disasterAlert 的 answer=1 → goto 原点；超时 maxDisasterTicks 强制清场', () => {
    const { host, ctx, state } = mk({ maxDisasterTicks: 5, fire: { ...DEFAULT_EVENTS_TUNING.fire, extinguishPerCoverage: 0 } });
    for (let x = 30; x < 40; x++) for (let y = 30; y < 40; y++) placeBuilding(ctx, HOUSE, x, y);
    host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 35, y: 35 });
    runTicks(host, 1);
    host.drainEvents();
    expect(host.dispatch({ type: 'modalAnswer', dialog: 'disasterAlert', answer: 1 }).ok).toBe(true);
    expect(ofType(host.drainEvents(), 'goto')).toEqual([{ type: 'goto', x: 35, y: 35, smooth: true }]);
    const used = runUntil(host, () => !state.disaster.active, 50);
    expect(used).toBeLessThanOrEqual(6);
    expect(ctx.diag.some((d) => d.code === 'events.disasterTimeout')).toBe(true);
    expect(state.clock.mode).toBe(CityMode.City);
  });

  it('两次独立运行同一灾害 → 事件序列与 hash(full) 相同（确定性）', () => {
    const run = () => {
      const t = mk(undefined, 99);
      for (let x = 50; x < 56; x++) for (let y = 50; y < 56; y++) placeBuilding(t.ctx, HOUSE, x, y, 1);
      t.host.dispatch({ type: 'requestDisaster', kind: DisasterKind.Fire, x: 52, y: 52 });
      runTicks(t.host, 1);
      runUntil(t.host, () => !t.state.disaster.active, 600);
      return { hash: t.host.hash('full'), n: ofType(t.host.drainEvents(), 'structureDestroyed').length };
    };
    const a = run(), b = run();
    expect(a).toEqual(b);
    expect(a.n).toBeGreaterThan(0);
  });
});

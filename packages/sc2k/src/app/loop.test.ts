// ===== app/loop.test.ts =====（WORKPLAN WP12 验收：预算参数传递；暂停不推进；事件扇出；UI 节流；actorsOf 映射）
import { describe, expect, it, vi } from 'vitest';
import type { SimEvent } from '../contracts/events';
import type { AdvanceOptions } from '../contracts/host';
import type { NewCityParams } from '../contracts/system';
import { DEFAULT_BUDGET_MS } from '../contracts/clock';
import { ActorId } from '../contracts/render';
import { createEventBus } from '../ui';
import { createLoop, actorsOf, MAX_FRAME_MS, DEFAULT_UI_REFRESH_MS } from './loop';
import { createWiredHost } from './wire';

const PARAMS: NewCityParams = { name: 'Looptown', difficulty: 1, startYear: 2000, seed: 7, terrainSeed: 3, terrain: { coast: false, river: false, hills: 0, water: 0, trees: 0 } };
const fakeRenderer = () => { const r = { frames: [] as number[], frame: (dt: number) => { r.frames.push(dt); } }; return r; };
const fakeSource = () => { const s = { animTick: 0, bump: () => { s.animTick++; } }; return s; };

describe('createLoop', () => {
  it('step：advance 收到 budgetMs 与夹取后的 dt；事件扇出到 bus；frame / bump / UI 节流', () => {
    const calls: Array<{ dt: number; opts: AdvanceOptions | undefined }> = [];
    let pending: SimEvent[] = [{ type: 'uiRefresh' }, { type: 'goto', x: 1, y: 2, smooth: false }];
    const host = {
      advance: (dt: number, now: () => number, opts?: AdvanceOptions) => { calls.push({ dt, opts }); expect(typeof now()).toBe('number'); return { daysRun: 0, suspended: false }; },
      drainEvents: () => { const out = pending; pending = []; return out; },
    };
    const renderer = fakeRenderer(), source = fakeSource(), bus = createEventBus();
    const seen: string[] = [];
    bus.on('goto', (e) => seen.push(`goto:${e.x},${e.y}`));
    bus.on('uiRefresh', () => seen.push('ui'));
    const ui: number[] = [];
    const before: number[] = [];
    const loop = createLoop({ host, renderer, bus, source, uiRefresh: (acc) => ui.push(acc), beforeFrame: (dt) => before.push(dt) });
    loop.step(1000);                                       // 首帧 dt = 0
    loop.step(1016);                                       // dt = 16
    loop.step(5000);                                       // dt 夹到 MAX_FRAME_MS
    expect(calls.map((c) => c.dt)).toEqual([0, 16, MAX_FRAME_MS]);
    for (const c of calls) expect(c.opts).toEqual({ budgetMs: DEFAULT_BUDGET_MS });
    expect(DEFAULT_BUDGET_MS).toBe(6);
    expect(seen).toEqual(['ui', 'goto:1,2']);
    expect(renderer.frames).toEqual([0, 16, MAX_FRAME_MS]);
    expect(before).toEqual([0, 16, MAX_FRAME_MS]);
    expect(source.animTick).toBe(3);
    expect(ui).toEqual([MAX_FRAME_MS + 16]);               // 0 + 16 < 100 未刷新；累计 266 ≥ 100 刷新一次并清零
    expect(loop.last).toEqual({ dtMs: MAX_FRAME_MS, daysRun: 0, suspended: false, events: 0 });
    expect(DEFAULT_UI_REFRESH_MS).toBe(100);
    const custom = createLoop({ host, renderer, bus, source, budgetMs: 12 });
    custom.step(0); custom.step(1);
    expect(calls.at(-1)?.opts).toEqual({ budgetMs: 12 });
  });

  it('start / stop 走注入的 raf / caf；停止后回调不再排帧', () => {
    const cbs: Array<(ts: number) => void> = [];
    const raf = vi.fn((cb: (ts: number) => void) => { cbs.push(cb); return cbs.length; });
    const caf = vi.fn();
    const host = { advance: () => ({ daysRun: 0, suspended: false }), drainEvents: () => [] };
    const loop = createLoop({ host, renderer: fakeRenderer(), bus: createEventBus(), source: fakeSource(), raf, caf, now: () => 0 });
    loop.start();
    expect(loop.running).toBe(true);
    expect(raf).toHaveBeenCalledTimes(1);
    cbs[0]!(100);                                          // 一帧：先排下一帧再执行
    expect(raf).toHaveBeenCalledTimes(2);
    loop.stop();
    expect(caf).toHaveBeenCalledWith(2);
    cbs[1]!(116);
    expect(raf).toHaveBeenCalledTimes(2);                  // 停止后不再排帧
    loop.start(); loop.start();
    expect(raf).toHaveBeenCalledTimes(3);
    loop.stop();
  });

  it('暂停（speed 1）不推进；极速推进（真 host，桩系统）', () => {
    const host = createWiredHost();
    host.newCity(PARAMS);
    host.dispatch({ type: 'terrainDone' });
    host.dispatch({ type: 'setSpeed', speed: 1 });
    const loop = createLoop({ host, renderer: fakeRenderer(), bus: createEventBus(), source: fakeSource(), now: () => performance.now() });
    for (let k = 0; k < 10; k++) loop.step(k * 100);
    expect(host.state.clock.age).toBe(0);
    expect(loop.last.daysRun).toBe(0);
    host.dispatch({ type: 'setSpeed', speed: 5 });
    for (let k = 10; k < 14; k++) loop.step(k * 100);
    expect(host.state.clock.age).toBeGreaterThan(0);
    expect(host.state.clock.age).toBeLessThanOrEqual(40);  // maxDaysPerFrame 10 × 4 帧
    host.dispatch({ type: 'setSpeed', speed: 3 });          // 160 ms / 天：100 ms 帧约每 1.6 帧一天
    const age = host.state.clock.age;
    for (let k = 14; k < 30; k++) loop.step(k * 100);
    expect(host.state.clock.age - age).toBeGreaterThanOrEqual(9);
    expect(host.state.clock.age - age).toBeLessThanOrEqual(11);
  });

  it('createEventBus：按类型扇出、退订、监听器异常隔离', () => {
    const bus = createEventBus();
    const got: string[] = [];
    const off = bus.on('dayTick', (e) => got.push(`a${e.age}`));
    bus.on('dayTick', () => { throw new Error('boom'); });
    bus.on('dayTick', (e) => got.push(`c${e.age}`));
    bus.on('monthTick', () => got.push('m'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    bus.publish({ type: 'dayTick', age: 1 });
    off();
    bus.publish({ type: 'dayTick', age: 2 });
    bus.publish({ type: 'yearClosed', year: 1 });
    expect(got).toEqual(['a1', 'c1', 'c2']);
    expect(err).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });

  it('actorsOf：XTHG 类型 → ActorId；帆船 variant≠0 = 湖怪；未知类型丢弃', () => {
    const th = (type: number, variant = 0) => ({ slot: type, type, x: 1, y: 2, z: 0, px: 3, py: 4, dir: 5, variant, air: type === 1 });
    const out = actorsOf([th(0x01), th(0x09), th(0x09, 1), th(0x0f), th(0x04), th(0x7f)]);
    expect(out.map((a) => a.key.id)).toEqual([ActorId.Plane, ActorId.Sailboat, ActorId.Nessie, ActorId.Tornado]);
    expect(out[0]).toMatchObject({ slot: 1, x: 1, y: 2, px: 3, py: 4, dir: 5, air: true, key: { kind: 'actor', variant: 5 } });
  });
});

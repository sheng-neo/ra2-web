// neighborConnection：accept 写 XTXT 0xFA 并扣 $1,000；资金不足回滚边缘格并退费；reject 回滚并退费；无效目标。
import { describe, expect, it } from 'vitest';
import type { StubProfile } from '../../contracts/testkit';
import { createTestContext } from '../../testkit';
import { createPlacementSystem } from './index';
import { T } from './testFixtures';

const ROAD_LR = 0x1d;
const mk = (profile: StubProfile, funds = 1_000_000) => {
  const t = createTestContext({ profile, systems: [createPlacementSystem()] });
  t.state.economy.funds = funds;
  return t;
};

describe.each(['optimistic', 'pessimistic'] as const)('neighborConnection（%s 桩）', (profile) => {
  it('accept：XTXT 0xFA、扣 $1,000、xtxt 整层脏、changed = [at]', () => {
    const { host, state } = mk(profile);
    const laid = host.dispatch({ type: 'network', kind: 'road', from: T(3, 64), to: T(0, 64) });
    expect(laid.modal?.id).toBe('neighborConnect');
    const at = T(0, 64), funds = state.economy.funds;
    host.dirty.take();
    const r = host.dispatch({ type: 'neighborConnection', at, accept: true });
    expect(r).toEqual({ ok: true, cost: 1000, changed: [at] });
    expect(state.layers.xtxt[at]).toBe(0xfa);
    expect(state.layers.xbld[at]).toBe(ROAD_LR);
    expect(state.economy.funds).toBe(funds - 1000);
    expect(host.dirty.bulk.xtxt).toBe(true);
    expect(host.dispatch({ type: 'neighborConnection', at, accept: true })).toMatchObject({ ok: false, reason: 'alreadyBuilt' });
    expect(host.q.placement.preview({ type: 'neighborConnection', at: T(0, 70), accept: true })).toMatchObject({ ok: false, reason: 'noTarget' });
  });
  it('资金不足：funds、回滚边缘格（清片段）并退还铺设费', () => {
    const { host, state } = mk(profile, 1040);
    expect(host.dispatch({ type: 'network', kind: 'road', from: T(3, 64), to: T(0, 64) }).ok).toBe(true);
    expect(state.economy.funds).toBe(1000);
    state.economy.funds = 500;
    const at = T(0, 64);
    const r = host.dispatch({ type: 'neighborConnection', at, accept: true });
    expect(r).toMatchObject({ ok: false, reason: 'funds', cost: 1000 });
    expect(state.layers.xbld[at]).toBe(0);
    expect(state.layers.xzon[at]).toBe(0);
    expect(state.layers.xtxt[at]).toBe(0);
    expect(state.economy.funds).toBe(510);
    expect(state.layers.xbld[T(1, 64)]).toBe(ROAD_LR);               // 邻格仍是直线
  });
  it('reject：回滚边缘格并退费，不收连接费；高速回滚整列', () => {
    const { host, state } = mk(profile);
    host.dispatch({ type: 'network', kind: 'rail', from: T(64, 3), to: T(64, 0) });
    const at = T(64, 0), funds = state.economy.funds;
    const r = host.dispatch({ type: 'neighborConnection', at, accept: false });
    expect(r).toMatchObject({ ok: true, cost: 0 });
    expect(r.changed).toContain(at);
    expect(state.layers.xbld[at]).toBe(0);
    expect(state.economy.funds).toBe(funds + 25);
    expect(state.layers.xbld[T(64, 1)]).toBe(0x2d);
    if (profile === 'optimistic') {
      const h = host.dispatch({ type: 'network', kind: 'highway', from: T(5, 20), to: T(0, 20) });
      expect(h.modal).toEqual({ id: 'neighborConnect', payload: { at: T(0, 20), kind: 'highway', cost: 1000 } });
      const f2 = state.economy.funds;
      expect(host.dispatch({ type: 'neighborConnection', at: T(0, 20), accept: false }).ok).toBe(true);
      expect(state.layers.xbld[T(0, 20)]).toBe(0); expect(state.layers.xbld[T(0, 21)]).toBe(0); expect(state.layers.xbld[T(1, 20)]).toBe(0x49);
      expect(state.economy.funds).toBe(f2 + 100);
    }
  });
  it('无效目标：非边缘格 / 沿边直线 / 空格 → noTarget；越界 → noTarget', () => {
    const { host, state } = mk(profile);
    host.dispatch({ type: 'network', kind: 'road', from: T(0, 40), to: T(0, 50) });
    expect(host.dispatch({ type: 'neighborConnection', at: T(0, 45), accept: true }).reason).toBe('noTarget');
    expect(host.dispatch({ type: 'neighborConnection', at: T(10, 10), accept: true }).reason).toBe('noTarget');
    expect(host.dispatch({ type: 'neighborConnection', at: 99999, accept: true }).reason).toBe('noTarget');
    expect(state.economy.funds).toBe(1_000_000 - 110);
  });
});

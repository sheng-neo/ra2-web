// ===== app/session.test.ts =====（fix-B：每年自动存档的时机——yearClosed 发自 budgetWindow 阶段（模态挂起中），
// 必须等模态关闭、当天跑完（phaseCursor 归零）再写；载入这份自动存档不应处于挂起态。）
import { describe, expect, it } from 'vitest';
import type { SaveMeta, SaveRecord, SaveStore } from '../contracts/assets';
import type { EventBus, SimEvent } from '../contracts/events';
import type { SimHost } from '../contracts/host';
import type { SpriteProvider } from '../contracts/render';
import type { RendererApi } from '../contracts/rendererApi';
import { sc2Codec } from '../io/sc2';
import { createEconomySystem } from '../sim/economy';
import { BUDGET_ANSWER_CONFIRM } from '../sim/economy';
import { createTestContext } from '../testkit';
import { AUTOSAVE_NAME, createSession } from './session';

function memoryStore(): SaveStore & { records: Map<number, SaveRecord> } {
  const records = new Map<number, SaveRecord>();
  let next = 1;
  return {
    records,
    listSaves: async () => [...records.entries()].map(([id, r]): SaveMeta => ({ id, kind: r.kind, name: r.name, cityName: r.cityName, year: r.year, population: r.population, savedAt: r.savedAt, thumbnail: null })),
    putSave: async (r) => { const id = r.id ?? next++; records.set(id, { ...r, id }); return id; },
    getSave: async (id) => records.get(id),
    deleteSave: async (id) => { records.delete(id); },
  };
}
function miniBus(): EventBus {
  const subs = new Map<string, Array<(e: SimEvent) => void>>();
  return {
    on(type, fn) { const l = subs.get(type) ?? []; l.push(fn as unknown as (e: SimEvent) => void); subs.set(type, l); return () => undefined; },
    publish(e) { for (const fn of subs.get(e.type) ?? []) fn(e); },
  };
}
const renderer = { getView: () => ({ centerX: 64, centerY: 64, rotation: 0, underground: false }), setView: () => undefined, setProvider: () => undefined, thumbnail: async () => new Uint8Array(0) } as unknown as RendererApi;
const settle = async (): Promise<void> => { for (let k = 0; k < 5; k++) await new Promise((r) => setTimeout(r, 0)); };
/** 模拟 RAF 主循环的一帧：advance → drainEvents → bus。 */
function frame(host: SimHost, bus: EventBus): boolean {
  host.state.clock.speed = 5;
  const r = host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 10 });
  for (const e of host.drainEvents()) bus.publish(e);
  return r.suspended;
}

describe('fix-B：session 自动存档时机', () => {
  it('预算窗口挂起期间不写；关闭模态、当天跑完后才写，且存下的快照 phaseCursor = 0（载入后不挂起）', async () => {
    const { host } = createTestContext({ systems: [createEconomySystem()] });
    const store = memoryStore(), bus = miniBus();
    createSession({ host, renderer, store, sc2: sc2Codec, procedural: {} as SpriteProvider, bus, now: () => 1 });
    let suspended = false;
    while (!suspended && host.state.clock.age < 310) suspended = frame(host, bus);
    expect(suspended).toBe(true);
    expect(host.state.clock.age).toBe(300); expect(host.state.clock.phaseCursor).toBeGreaterThan(0);   // yearClosed 已发布，模态开着
    await settle();
    expect([...store.records.values()].filter((r) => r.name === AUTOSAVE_NAME)).toEqual([]);
    host.dispatch({ type: 'modalAnswer', dialog: 'budget', answer: BUDGET_ANSWER_CONFIRM });
    host.modalClosed();                                                                                 // 外壳关模态 → 续跑当天剩余阶段 → dayTick
    for (const e of host.drainEvents()) bus.publish(e);
    await settle();
    const saves = [...store.records.values()].filter((r) => r.name === AUTOSAVE_NAME);
    expect(saves).toHaveLength(1);
    const b = createTestContext({ systems: [createEconomySystem()], seed: 4 });
    b.host.loadSnapshot(new Uint8Array(saves[0]!.bytes));
    expect(b.state.clock.phaseCursor).toBe(0); expect(b.state.clock.modalPause).toBe(0);
    expect(b.state.clock.age).toBe(301);
    // 之后的日子不再重复写
    for (let k = 0; k < 3; k++) frame(host, bus);
    await settle();
    expect(store.records.size).toBe(1);
  });
});

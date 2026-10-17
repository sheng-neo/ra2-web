// ===== sim/core/commands.test.ts =====（WORKPLAN WP1 验收：NOT_IMPLEMENTED 路径、core 四条命令、modalAnswer 转发、日志）
import { describe, expect, it } from 'vitest';
import { MODAL_OWNER, NOT_IMPLEMENTED_RESULT } from '../../contracts/commands';
import type { Command, CommandResult, ModalId } from '../../contracts/commands';
import { CityMode } from '../../contracts/grid';
import type { System, SystemId } from '../../contracts/system';
import { createTestContext, nullSystem, runDays } from '../../testkit';

/** 去掉 stub 标记的"真"假系统（dispatch 对桩一律 notImplemented）。 */
function realFake(id: SystemId, extra: Partial<System>): System {
  const base = { ...nullSystem(id) } as System & { stub?: true };
  delete base.stub;
  return { ...base, ...extra };
}
const ok: CommandResult = { ok: true, cost: 0, changed: [] };

describe('commands: NOT_IMPLEMENTED 路径', () => {
  it.each(['optimistic', 'pessimistic'] as const)('[%s] owner 为桩 → NOT_IMPLEMENTED_RESULT 同一对象、日志为空、PRNG 不动、无事件', (profile) => {
    const { host, ctx } = createTestContext({ profile });
    const prng = ctx.prng.state();
    const cmds: Command[] = [
      { type: 'placeBuilding', id: 0xcf, x: 10, y: 10 }, { type: 'zoneRect', zone: 1, x0: 0, y0: 0, x1: 3, y1: 3 }, { type: 'network', kind: 'road', from: 0, to: 5 },
      { type: 'terrainTool', tool: 'raise', path: [0] }, { type: 'setTax', rates: { r: 7, c: 7, i: 7 } }, { type: 'cheat', code: 'x' }, { type: 'requestDisaster', kind: 1 }, { type: 'sign', at: 0, text: 'a' },
    ];
    for (const cmd of cmds) {
      const r = host.dispatch(cmd);
      expect(r).toBe(NOT_IMPLEMENTED_RESULT); expect(r.ok).toBe(false); expect(r.reason).toBe('notImplemented');
    }
    expect(host.commandLog()).toEqual([]);
    expect(ctx.prng.state()).toBe(prng);
    expect(host.drainEvents()).toEqual([]);
    expect(Object.isFrozen(NOT_IMPLEMENTED_RESULT)).toBe(true);
  });
  it('owner 在场但未实现该命令 → notImplemented；实现了的命令正常处理并入日志', () => {
    const economy = realFake('economy', { commands: { setTax: (ctx, cmd) => { ctx.state.economy.taxRate = { ...cmd.rates }; return ok; } } });
    const { host, state } = createTestContext({ systems: [economy] });
    expect(host.dispatch({ type: 'cheat', code: 'x' })).toBe(NOT_IMPLEMENTED_RESULT);
    expect(host.dispatch({ type: 'setTax', rates: { r: 9, c: 8, i: 7 } }).ok).toBe(true);
    expect(state.economy.taxRate).toEqual({ r: 9, c: 8, i: 7 });
    expect(host.commandLog().map((l) => l.cmd.type)).toEqual(['setTax']);
  });
  it('失败的命令（ok:false）不入日志；成功的按 seq 递增；日志带派发时的 age / phaseCursor', () => {
    const { host, state } = createTestContext();
    runDays(host, 7);
    expect(host.dispatch({ type: 'terrainDone' })).toMatchObject({ ok: false, reason: 'mode' });   // 测试上下文已在城市模式
    expect(host.dispatch({ type: 'setSpeed', speed: 2 }).ok).toBe(true);
    expect(host.dispatch({ type: 'setSpeed', speed: 0 as never })).toMatchObject({ ok: false, reason: 'mode' });
    expect(host.dispatch({ type: 'setView', x: 1, y: 1, zoom: 1, rotation: 0 }).ok).toBe(true);
    expect(host.commandLog().map((l) => [l.cmd.type, l.age, l.phaseCursor, l.seq])).toEqual([['setSpeed', 7, 0, 0], ['setView', 7, 0, 1]]);
    expect(state.clock.speed).toBe(2);
  });
  it('commandLog() 返回的引用在 newCity 后不被清空（重放可持有）；新一轮 seq 从 0 起', () => {
    const { host } = createTestContext();
    host.dispatch({ type: 'setSpeed', speed: 3 });
    const before = host.commandLog();
    expect(before).toHaveLength(1);
    host.newCity({ name: 'Again', difficulty: 1, startYear: 1950, seed: 1, terrainSeed: 1, terrain: { coast: false, river: false, hills: 0, water: 0, trees: 0 } });
    expect(before).toHaveLength(1);
    expect(host.commandLog()).toEqual([]);
    host.dispatch({ type: 'setSpeed', speed: 4 });
    expect(host.commandLog()[0]!.seq).toBe(0);
  });
  it('阶段内重入 dispatch 抛错（命令只在两天之间或挂起期间执行）', () => {
    let hostRef: ReturnType<typeof createTestContext>['host'] | null = null;
    const zones: System = { ...nullSystem('zones'), phases: { census: () => { hostRef!.dispatch({ type: 'setSpeed', speed: 2 }); return 'done'; } } };
    const tc = createTestContext({ systems: [zones] });
    hostRef = tc.host;
    expect(() => runDays(tc.host, 25)).toThrow(/重入/);
  });
});

describe('commands: core 四条命令', () => {
  it('setSpeed / setView 不入哈希（两档），但入日志；setView 写 view 与 terrain.rotation', () => {
    const { host, state } = createTestContext();
    runDays(host, 3);
    const full = host.hash('full'), sc2 = host.hash('sc2');
    expect(host.dispatch({ type: 'setSpeed', speed: 4 }).ok).toBe(true);
    expect(host.dispatch({ type: 'setView', x: 12, y: 34, zoom: 3, rotation: 2 }).ok).toBe(true);
    expect(state.clock.speed).toBe(4); expect(state.view).toEqual({ x: 12, y: 34, zoom: 3 }); expect(state.terrain.rotation).toBe(2);
    expect(host.hash('full')).toBe(full); expect(host.hash('sc2')).toBe(sc2);
    expect(host.commandLog().map((l) => l.cmd.type)).toEqual(['setSpeed', 'setView']);
    expect(host.dispatch({ type: 'setView', x: 1.9, y: -2.2, zoom: 9.5, rotation: 7 as never }).ok).toBe(true);
    expect(state.view).toEqual({ x: 1, y: -2, zoom: 9 }); expect(state.terrain.rotation).toBe(3);   // 取整 / & 3
  });
  it('terrainDone：地形编辑 → 城市模式，emit modeChanged + toolbar；重复 → reason mode 且不入日志；灾害模式下也拒绝', () => {
    const { host, state } = createTestContext();
    state.clock.mode = CityMode.TerrainEdit;
    host.drainEvents();
    expect(host.dispatch({ type: 'terrainDone' }).ok).toBe(true);
    expect(state.clock.mode).toBe(CityMode.City);
    expect(host.drainEvents().map((e) => e.type)).toEqual(['modeChanged', 'toolbar']);
    expect(host.dispatch({ type: 'terrainDone' })).toMatchObject({ ok: false, reason: 'mode' });
    state.clock.mode = CityMode.Disaster;
    expect(host.dispatch({ type: 'terrainDone' })).toMatchObject({ ok: false, reason: 'mode' });
    expect(host.commandLog().map((l) => l.cmd.type)).toEqual(['terrainDone']);
  });
  it('modalAnswer 按 MODAL_OWNER 转发到 owner.onModalAnswer（每个 dialog 恰到一处）；importAssets 归 core 直接 ok；owner 为桩 → 记 diag 仍 ok', () => {
    const got: Record<string, [ModalId, number][]> = { economy: [], services: [], events: [], placement: [] };
    const fake = (id: SystemId): System => ({ ...nullSystem(id), onModalAnswer(_c, dialog, answer) { got[id]!.push([dialog, answer]); } });
    const { host, ctx } = createTestContext({ systems: [fake('economy'), fake('services'), fake('events'), fake('placement')] });
    const dialogs = Object.keys(MODAL_OWNER) as ModalId[];
    dialogs.forEach((dialog, k) => { expect(host.dispatch({ type: 'modalAnswer', dialog, answer: k }).ok).toBe(true); });
    for (const [id, list] of Object.entries(got)) expect(list.map(([d]) => d).sort()).toEqual(dialogs.filter((d) => MODAL_OWNER[d] === id).sort());
    expect(got.economy!.find(([d]) => d === 'budget')![1]).toBe(dialogs.indexOf('budget'));
    expect(host.commandLog()).toHaveLength(dialogs.length);
    expect(ctx.diag.filter((d) => d.code === 'core.modalAnswerIgnored')).toEqual([]);
    // owner 为桩（无 onModalAnswer）：忽略并记 diag
    const plain = createTestContext();
    expect(plain.host.dispatch({ type: 'modalAnswer', dialog: 'budget', answer: 1 }).ok).toBe(true);
    expect(plain.ctx.diag.some((d) => d.code === 'core.modalAnswerIgnored')).toBe(true);
    expect(plain.host.dispatch({ type: 'modalAnswer', dialog: 'nope' as ModalId, answer: 0 })).toMatchObject({ ok: false, reason: 'noTarget' });
  });
  it('挂起期间派发：日志记录 phaseCursor > 0；modalAnswer 转发给 owner 后 modalClosed 续跑', () => {
    const answers: number[] = [];
    const economy: System = { ...nullSystem('economy'), phases: { budgetWindow: (ctx) => { ctx.act.emit({ type: 'modal', id: 'budget', payload: null }); return 'suspend'; } }, onModalAnswer(_c, _d, a) { answers.push(a); } };
    const { host, state } = createTestContext({ systems: [economy] });
    runDays(host, 300);                                           // 停在第 300 天开始前（第 300 天的阶段尚未执行）
    expect(state.clock.age).toBe(300);
    state.clock.speed = 5;
    const r = host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 1 });
    expect(r.suspended).toBe(true); expect(state.clock.phaseCursor).toBe(10);   // budgetWindow 是第 0 天第 10 个阶段
    expect(host.dispatch({ type: 'modalAnswer', dialog: 'budget', answer: 42 }).ok).toBe(true);
    expect(host.commandLog().at(-1)).toMatchObject({ age: 300, phaseCursor: 10, cmd: { type: 'modalAnswer' } });
    expect(answers).toEqual([42]);
    host.modalClosed();
    expect(state.clock.age).toBe(301);
  });
});

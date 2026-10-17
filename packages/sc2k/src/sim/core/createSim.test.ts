import { describe, expect, it } from 'vitest';
import { DAY_PHASES, SYSTEM_ORDER } from '../../contracts/clock';
import { NOT_IMPLEMENTED_RESULT } from '../../contracts/commands';
import { CityMode } from '../../contracts/grid';
import type { NewCityParams, System } from '../../contracts/system';
import { CATALOGUE } from '../../data';
import { snapshotCodec } from '../../io/snapshot';
import { createTestContext, hashOf, nullSystem, runDays } from '../../testkit';
import { createCoreSystem } from './coreSystem';
import { createSim, replay, simContextOf } from './createSim';

const PARAMS: NewCityParams = { name: 'Harborlight', difficulty: 2, startYear: 1950, seed: 42, terrainSeed: 7, terrain: { coast: false, river: false, hills: 0, water: 0, trees: 0 } };
const ALL_STUBS = SYSTEM_ORDER.filter((id) => id !== 'core');
const stubsExcept = (...ids: System['id'][]): System[] => ALL_STUBS.filter((id) => !ids.includes(id)).map((id) => nullSystem(id));
const mk = (systems: System[], allow = ALL_STUBS) => createSim({ systems, catalogue: CATALOGUE, snapshot: snapshotCodec, stubAllowlist: allow });

describe('createSim: 注册校验', () => {
  it('按 SYSTEM_ORDER 排序，与传入顺序无关；缺 core 抛错', () => {
    const shuffled = [...ALL_STUBS.map((id) => nullSystem(id)), createCoreSystem()].reverse();
    expect(mk(shuffled).systems.map((s) => s.id)).toEqual(SYSTEM_ORDER);
    expect(() => mk(ALL_STUBS.map((id) => nullSystem(id)))).toThrow(/core/);
  });
  it('id 重复 / allowlist 外的桩 / 越权 phases / commands / actions / queries / endOfDay 抛错，消息含系统 id', () => {
    const base = () => [createCoreSystem(), ...stubsExcept('zones')];
    expect(() => mk([...base(), nullSystem('zones'), nullSystem('zones')])).toThrow(/zones.*重复/);
    expect(() => mk([...base(), nullSystem('zones')], ALL_STUBS.filter((id) => id !== 'zones'))).toThrow(/"zones" 是桩/);
    const bad = (extra: Partial<System>): System => ({ id: 'zones', init() {}, queries: nullSystem('zones').queries, ...extra });
    expect(() => mk([...base(), bad({ phases: { powerScan: () => 'done' } })])).toThrow(/powerScan.*utilities/);
    expect(() => mk([...base(), bad({ commands: { setSpeed: () => NOT_IMPLEMENTED_RESULT } })])).toThrow(/setSpeed.*core/);
    expect(() => mk([...base(), bad({ actions: { charge: () => true } })])).toThrow(/charge.*economy/);
    expect(() => mk([...base(), bad({ queries: { ...nullSystem('zones').queries, terrain: nullSystem('terrain').queries!.terrain } })])).toThrow(/query "terrain".*terrain/);
    expect(() => mk([createCoreSystem(), ...stubsExcept('economy'), { id: 'economy', init() {}, queries: nullSystem('economy').queries, actions: nullSystem('economy').actions, endOfDay() {} }])).toThrow(/economy.*endOfDay/);
  });
  it('查询 / action 缺失抛错并指出 owner', () => {
    expect(() => mk([createCoreSystem(), ...stubsExcept('events')])).toThrow(/q\.tech（owner events 未注册）/);
    expect(() => mk([createCoreSystem(), ...stubsExcept('events'), { id: 'events', init() {} }])).toThrow(/q\.tech（owner events 未提供）/);
    const eventsNoActions: System = { id: 'events', init() {}, queries: nullSystem('events').queries };
    expect(() => mk([createCoreSystem(), ...stubsExcept('events'), eventsNoActions])).toThrow(/act\.destroyStructure（owner events 未提供）/);
  });
});

describe('createSim: 调度', () => {
  it('newCity 就地重置（state / clock / layers 引用不变），按 SYSTEM_ORDER 调 init，模式为地形编辑、暂停、age 0', () => {
    const order: string[] = [];
    const spy = (id: System['id']): System => ({ ...nullSystem(id), init(ctx, p) { order.push(id); nullSystem(id).init(ctx, p); } });
    const host = mk([createCoreSystem(), ...ALL_STUBS.map(spy)]);
    const state = host.state, clock = state.clock, xbld = state.layers.xbld;
    host.newCity(PARAMS);
    expect(order).toEqual(ALL_STUBS);
    expect(host.state).toBe(state); expect(state.clock).toBe(clock); expect(state.layers.xbld).toBe(xbld);
    expect(clock.mode).toBe(CityMode.TerrainEdit); expect(clock.speed).toBe(1); expect(clock.age).toBe(0);
    expect(state.cityName).toBe('Harborlight'); expect(clock.foundedYear).toBe(1950);
    expect(host.state.clock.prngState >>> 0).toBe(42);
    simContextOf(host).prng.next32();
    host.newCity({ ...PARAMS, seed: 9 });
    expect(host.state.clock.prngState >>> 0).toBe(9);
  });
  it('暂停不推进；速度 2 按 MS_PER_DAY 折天并保留余量；速度 5 受 maxDaysPerFrame 与预算约束', () => {
    const { host, state } = createTestContext();
    expect(host.advance(10000, () => 0)).toEqual({ daysRun: 0, suspended: false });
    state.clock.speed = 2;
    expect(host.advance(479, () => 0).daysRun).toBe(0);
    expect(host.advance(1, () => 0).daysRun).toBe(1);
    expect(host.advance(480 * 3 + 100, () => 0, { budgetMs: Infinity }).daysRun).toBe(3);
    expect(state.clock.accumMs).toBe(100);
    state.clock.speed = 5;
    expect(host.advance(0, () => 0, { maxDaysPerFrame: 4, budgetMs: Infinity }).daysRun).toBe(4);
    let t = 0;
    expect(host.advance(0, () => t++ * 10, { maxDaysPerFrame: 10, budgetMs: 6 }).daysRun).toBe(1);   // 第一天后已超预算
    expect(state.clock.age).toBe(9);
    expect(host.drainEvents().filter((e) => e.type === 'dayTick')).toHaveLength(9);
    expect(host.drainEvents()).toEqual([]);
  });
  it('阶段按 DAY_PHASES 行序执行、缺席 / 桩阶段跳过；core 的 uiRefresh（第 23 天）发事件；growthScan 按 4×4 子步回调 growthVisit', () => {
    const visited: string[] = [];
    const seen: number[] = [];
    const zones: System = { ...nullSystem('zones'), phases: { census: (ctx) => { seen.push(ctx.day); return 'done'; }, demand: (ctx) => { seen.push(ctx.day + 100); return 'done'; } },
      growthVisit(_ctx, x, y) { visited.push(`${x},${y}`); } };
    const { host, ctx } = createTestContext({ systems: [zones] });
    expect(ctx.day).toBe(-1);
    runDays(host, 25);
    expect(seen).toEqual([21, 121]);
    expect(visited).toHaveLength(16384);                                  // 16 天覆盖全图各一次
    expect(new Set(visited).size).toBe(16384);
    expect(visited.slice(0, 3)).toEqual(['0,0', '0,4', '0,8']);           // day 3：step 0 / substep 0，x 外层 y 内层
    const ev = host.drainEvents();
    expect(ev.filter((e) => e.type === 'uiRefresh')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'monthTick')).toEqual([{ type: 'monthTick', year: 1900, month: 1 }]);
    expect(DAY_PHASES[23]).toEqual(['uiRefresh']);
    const timings = host.phaseTimings();
    expect(timings.growthScan.count).toBe(16); expect(timings.census.count).toBe(1); expect(timings.powerScan.count).toBe(0);
  });
  it('挂起：modalPause++、phaseCursor 停在已完成阶段数、endOfDay 不调；modalClosed 续跑剩余阶段 + endOfDay 恰一次；期间 dispatch 记录 phaseCursor>0', () => {
    const trace: string[] = [];
    const economy: System = { ...nullSystem('economy'), phases: { graphs: (ctx) => { trace.push('graphs'); ctx.act.emit({ type: 'modal', id: 'budget', payload: null }); return 'suspend'; }, scenario: () => { trace.push('scenario'); return 'done'; } } };
    const zones: System = { ...nullSystem('zones'), phases: { census: () => { trace.push('census'); return 'done'; } }, endOfDay() { trace.push('eod'); } };
    const { host, state } = createTestContext({ systems: [economy, zones] });
    state.clock.speed = 5;
    while (state.clock.age < 21) host.advance(0, () => 0, { maxDaysPerFrame: 1, budgetMs: Infinity });
    expect(trace.filter((t) => t === 'eod')).toHaveLength(21);
    const r = host.advance(0, () => 0, { maxDaysPerFrame: 3, budgetMs: Infinity });
    expect(r).toEqual({ daysRun: 0, suspended: true });
    expect(state.clock.modalPause).toBe(1); expect(state.clock.age).toBe(21); expect(state.clock.phaseCursor).toBe(4);   // census demand demographics graphs
    expect(trace.slice(-2)).toEqual(['census', 'graphs']);
    expect(host.advance(0, () => 0)).toEqual({ daysRun: 0, suspended: true });
    expect(host.dispatch({ type: 'setSpeed', speed: 3 }).ok).toBe(true);
    expect(host.commandLog().at(-1)).toMatchObject({ age: 21, phaseCursor: 4, seq: 0 });
    host.modalOpened(); host.modalClosed();
    expect(state.clock.age).toBe(21);                                    // 还有一层挂起
    host.modalClosed();
    expect(state.clock.age).toBe(22); expect(state.clock.phaseCursor).toBe(0);
    expect(trace.slice(-1)).toEqual(['eod']);
    expect(trace.filter((t) => t === 'eod')).toHaveLength(22);
    expect(trace.filter((t) => t === 'graphs')).toHaveLength(1);
    state.clock.speed = 5;                                               // 上面的 setSpeed 命令把速度改成了 3
    host.advance(0, () => 0, { maxDaysPerFrame: 1, budgetMs: Infinity });
    expect(trace.slice(-2)).toEqual(['scenario', 'eod']);
  });
  it('dispatch：owner 为桩 → NOT_IMPLEMENTED_RESULT 同一对象、不写日志、不消费 PRNG；core 四条命令；失败命令不入日志', () => {
    const { host, state, ctx } = createTestContext();
    const prngBefore = ctx.prng.state();
    expect(host.dispatch({ type: 'placeBuilding', id: 0xdd, x: 3, y: 3 })).toBe(NOT_IMPLEMENTED_RESULT);
    expect(host.dispatch({ type: 'cheat', code: 'x' })).toBe(NOT_IMPLEMENTED_RESULT);
    expect(host.commandLog()).toEqual([]);
    expect(ctx.prng.state()).toBe(prngBefore);
    expect(host.dispatch({ type: 'setSpeed', speed: 4 }).ok).toBe(true); expect(state.clock.speed).toBe(4);
    expect(host.dispatch({ type: 'setView', x: 5, y: 6, zoom: 2, rotation: 3 }).ok).toBe(true);
    expect(state.view).toEqual({ x: 5, y: 6, zoom: 2 }); expect(state.terrain.rotation).toBe(3);
    state.clock.mode = CityMode.TerrainEdit;
    expect(host.dispatch({ type: 'terrainDone' }).ok).toBe(true); expect(state.clock.mode).toBe(CityMode.City);
    expect(host.dispatch({ type: 'terrainDone' })).toMatchObject({ ok: false, reason: 'mode' });
    expect(host.dispatch({ type: 'modalAnswer', dialog: 'budget', answer: 1 }).ok).toBe(true);     // owner economy 为桩：记 diag 并忽略
    expect(ctx.diag.some((d) => d.code === 'core.modalAnswerIgnored')).toBe(true);
    expect(host.drainEvents().some((e) => e.type === 'modeChanged')).toBe(true);
    expect(host.commandLog().map((l) => l.cmd.type)).toEqual(['setSpeed', 'setView', 'terrainDone', 'modalAnswer']);
    expect(host.commandLog().map((l) => l.seq)).toEqual([0, 1, 2, 3]);
  });
  it('modalAnswer 按 MODAL_OWNER 转发到 owner 的 onModalAnswer', () => {
    const got: unknown[] = [];
    const services: System = { ...nullSystem('services'), onModalAnswer(_c, dialog, answer) { got.push([dialog, answer]); } };
    const { host } = createTestContext({ systems: [services] });
    host.dispatch({ type: 'modalAnswer', dialog: 'militaryOffer', answer: 2 });
    host.dispatch({ type: 'modalAnswer', dialog: 'budget', answer: 9 });
    expect(got).toEqual([['militaryOffer', 2]]);
  });
  it('hash / 快照：两次独立运行 25 天哈希相同；saveSnapshot → loadSnapshot 两档哈希不变且 prng.state 不变；exportSc2 在挂起态抛错', () => {
    const a = createTestContext({ seed: 5 }), b = createTestContext({ seed: 5 });
    runDays(a.host, 25); runDays(b.host, 25);
    expect(a.host.hash('full')).toBe(b.host.hash('full'));
    expect(a.host.hash('sc2')).toBe(b.host.hash('sc2'));
    expect(a.host.hash('full')).toBe(hashOf(a.state));
    const full = a.host.hash('full'), sc2 = a.host.hash('sc2'), prng = a.ctx.prng.state();
    const bytes = a.host.saveSnapshot();
    const c = createTestContext({ seed: 99 });
    runDays(c.host, 7);
    expect(c.host.loadSnapshot(bytes)).toEqual([]);
    expect(c.host.hash('full')).toBe(full); expect(c.host.hash('sc2')).toBe(sc2); expect(c.ctx.prng.state()).toBe(prng);
    expect(c.state.clock.age).toBe(25);
    runDays(a.host, 10); runDays(c.host, 10);
    expect(c.host.hash('full')).toBe(a.host.hash('full'));
    const doc = a.host.exportSc2();
    expect(doc.cityName).toBe('Testopolis'); expect(doc.misc[0x0010 >> 2]).toBe(35);
    a.state.clock.phaseCursor = 2;
    expect(() => a.host.exportSc2()).toThrow(/phaseCursor/);
  });
  it('importSc2 ← exportSc2 往返：hash("sc2") 不变（桩下只有 core 读写 .SC2：不铺平地形；mayorName 不在 .SC2 内，标 full，往返丢失不影响 sc2 档）', () => {
    const { host, ctx } = createTestContext({ flat: false, params: { mayor: 'Reconciler' } });
    ctx.act.setXbld(1000, 0x0e); ctx.act.setXzon(2000, 0xf3); ctx.act.setXund(3000, 0x12);
    runDays(host, 3);
    const h = host.hash('sc2');
    const doc = host.exportSc2();
    expect(doc.xbld[1000]).toBe(0x0e); expect(doc.misc[0x1058 >> 2]).toBe(host.state.clock.prngState);
    const other = createTestContext({ seed: 1, flat: false, params: { mayor: 'Nobody' } });
    runDays(other.host, 9);
    other.host.importSc2(doc);
    expect(other.state.clock.age).toBe(3);
    expect(other.host.hash('sc2')).toBe(h);
    expect(other.state.counts.tile[0x0e]).toBe(1);
  });
  it('replay：相同 seed + params + 日志 → 相同 hash("full")', () => {
    const { host } = createTestContext({ seed: 3 });
    runDays(host, 30);
    host.dispatch({ type: 'setView', x: 1, y: 2, zoom: 1, rotation: 1 });
    runDays(host, 20);
    const log = host.commandLog();
    expect(log).toHaveLength(1);
    const again = replay({ systems: [createCoreSystem(), ...ALL_STUBS.map((id) => nullSystem(id))], catalogue: CATALOGUE, snapshot: snapshotCodec, stubAllowlist: ALL_STUBS },
      { ...PARAMS, seed: 3 }, log, 50);
    expect(again.state.clock.age).toBe(50);
    expect(again.state.view).toEqual({ x: 1, y: 2, zoom: 1 });
  });
});

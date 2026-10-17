// ===== sim/core/dayPhases.test.ts =====（WORKPLAN WP1 验收：阶段表不变量 + 调度器对表的使用）
import { describe, expect, it } from 'vitest';
import { DAY_PHASES, END_OF_DAY_IO, PHASE_IO, PHASE_OWNER, SYSTEM_ORDER, phaseApplies } from '../../contracts/clock';
import type { LayerName, PhaseId } from '../../contracts/clock';
import type { System, SystemId } from '../../contracts/system';
import { CATALOGUE } from '../../data';
import { snapshotCodec } from '../../io/snapshot';
import { createTestContext, nullSystem, runDays, simInternalsOf } from '../../testkit';
import { createCoreSystem } from './coreSystem';
import { createSim } from './createSim';

const ALL_PHASES = Object.keys(PHASE_OWNER) as PhaseId[];
const EOD_ENTRIES = Object.entries(END_OF_DAY_IO) as Array<[SystemId, NonNullable<(typeof END_OF_DAY_IO)[SystemId]>]>;

describe('dayPhases: 静态表不变量', () => {
  it('第 0 天阶段序 = spec:economy §2.3（settleMonth → … → beginMonth）；第 23 天只有 uiRefresh；第 24 天以 news 收尾', () => {
    expect(DAY_PHASES[0]).toEqual(['settleMonth', 'closeYear', 'techCheck', 'nationalAnnual.zones', 'nationalAnnual.economy', 'neighborsAnnual', 'approvalSurvey', 'facilityAnnual', 'utilitiesAnnual', 'budgetWindow', 'beginMonth']);
    expect(DAY_PHASES[1]).toEqual(['powerScan']); expect(DAY_PHASES[2]).toEqual(['dataMaps']);
    expect(DAY_PHASES[19]).toEqual(['trafficDecay']); expect(DAY_PHASES[20]).toEqual(['waterScan']);
    expect(DAY_PHASES[21]).toEqual(['census', 'demand', 'demographics', 'graphs']);
    expect(DAY_PHASES[22]).toEqual(['milestones', 'scenario', 'solvency']);
    expect(DAY_PHASES[23]).toEqual(['uiRefresh']);
    expect(DAY_PHASES[24]).toEqual(['weatherAndDisaster', 'cityStatus', 'news']);
  });
  it('PHASE_OWNER / PHASE_IO 键集合相等且 owner ∈ SYSTEM_ORDER；core 只拥有 growthScan 与 uiRefresh', () => {
    expect(Object.keys(PHASE_IO).sort()).toEqual([...ALL_PHASES].sort());
    for (const p of ALL_PHASES) expect(SYSTEM_ORDER).toContain(PHASE_OWNER[p]);
    expect(ALL_PHASES.filter((p) => PHASE_OWNER[p] === 'core').sort()).toEqual(['growthScan', 'uiRefresh']);
  });
  it('同日（含 END_OF_DAY_IO 作为第 25 个槽）每个 bulk 层至多一个写者系统', () => {
    for (let d = 0; d < 25; d++) {
      const owners = new Map<LayerName, Set<SystemId>>();
      const add = (layer: LayerName, sys: SystemId): void => { if (!owners.has(layer)) owners.set(layer, new Set()); owners.get(layer)!.add(sys); };
      for (const p of DAY_PHASES[d]!) for (const layer of PHASE_IO[p].bulk) add(layer, PHASE_OWNER[p]);
      for (const [sys, io] of EOD_ENTRIES) for (const layer of io.bulk) add(layer, sys);
      for (const [layer, set] of owners) expect(set.size, `day ${d} ${layer}: ${[...set].join(',')}`).toBe(1);
    }
  });
  it('END_OF_DAY_IO 的 bulk 层与同层的阶段写者是同一系统（utilities 的 XBIT.POWERED / WATERED）', () => {
    for (const [sys, io] of EOD_ENTRIES) for (const layer of io.bulk) {
      const phaseOwners = new Set(ALL_PHASES.filter((p) => PHASE_IO[p].bulk.includes(layer)).map((p) => PHASE_OWNER[p]));
      expect(phaseOwners.size).toBeLessThanOrEqual(1);
      for (const o of phaseOwners) expect(o).toBe(sys);
    }
    expect(EOD_ENTRIES.map(([id]) => id)).toEqual(['utilities', 'zones']);
    expect(SYSTEM_ORDER.indexOf('utilities')).toBeLessThan(SYSTEM_ORDER.indexOf('zones'));
  });
  it('canSuspend 的阶段集合固定（预算 / 年结 / 里程碑 / 情景 / 破产 / 报纸）', () => {
    expect(ALL_PHASES.filter((p) => PHASE_IO[p].canSuspend).sort()).toEqual(['budgetWindow', 'closeYear', 'milestones', 'news', 'scenario', 'solvency']);
  });
  it('每月 usesPrng 的阶段至少一个在 growthScan 之外；不消费 PRNG 的阶段不含 growthScan', () => {
    const prngPhases = ALL_PHASES.filter((p) => PHASE_IO[p].usesPrng);
    expect(prngPhases).toContain('growthScan'); expect(prngPhases).toContain('powerScan');
    expect(prngPhases).not.toContain('waterScan'); expect(prngPhases).not.toContain('trafficDecay');
  });
});

describe('dayPhases: 调度器按表执行', () => {
  /** 记录每个阶段在哪些 age 被执行的假系统集合（覆盖 economy / zones / events / utilities / services 五个 owner）。 */
  function recorders(trace: Map<PhaseId, number[]>): System[] {
    const rec = (id: SystemId, phases: PhaseId[]): System => {
      const base = nullSystem(id);
      const ph: NonNullable<System['phases']> = {};
      for (const p of phases) ph[p] = (ctx) => { if (!trace.has(p)) trace.set(p, []); trace.get(p)!.push(ctx.state.clock.age); return 'done'; };
      return { ...base, phases: ph };
    };
    return [
      rec('economy', ['settleMonth', 'closeYear', 'nationalAnnual.economy', 'budgetWindow', 'graphs', 'scenario', 'solvency']),
      rec('zones', ['nationalAnnual.zones', 'neighborsAnnual', 'beginMonth', 'census', 'demand']),
      rec('events', ['techCheck', 'weatherAndDisaster', 'news']),
      rec('utilities', ['utilitiesAnnual', 'powerScan', 'waterScan']),
      rec('services', ['approvalSurvey', 'facilityAnnual', 'dataMaps', 'trafficDecay', 'demographics', 'milestones', 'cityStatus']),
    ];
  }
  it('一整年：月度阶段每月一次（settleMonth 首月跳过）、年度阶段只在第 0 月、closeYear / budgetWindow 跳过第 0 年、solvency 默认不生效', () => {
    const trace = new Map<PhaseId, number[]>();
    const { host } = createTestContext({ systems: recorders(trace) });
    runDays(host, 325);                                           // 13 个月：跨过第二年第 0 月
    const months = (p: PhaseId): number[] => (trace.get(p) ?? []).map((age) => Math.floor(age / 25));
    expect(months('settleMonth')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(months('beginMonth')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const p of ['closeYear', 'budgetWindow'] as const) expect(trace.get(p)).toEqual([300]);
    for (const p of ['techCheck', 'nationalAnnual.zones', 'nationalAnnual.economy', 'neighborsAnnual', 'approvalSurvey', 'facilityAnnual', 'utilitiesAnnual'] as const) expect(trace.get(p), p).toEqual([0, 300]);
    expect(trace.get('solvency')).toBeUndefined();
    for (const p of ['powerScan', 'dataMaps', 'trafficDecay', 'waterScan', 'census', 'demand', 'demographics', 'graphs', 'milestones', 'scenario', 'weatherAndDisaster', 'cityStatus', 'news'] as const) {
      const ages = trace.get(p)!;
      expect(ages, p).toHaveLength(13);
      for (const age of ages) expect(DAY_PHASES[age % 25], `${p}@${age}`).toContain(p);
    }
    // 同日阶段按行序执行：census(21) 先于 demand(21)；settleMonth 先于 beginMonth（同为第 0 天）
    const first = (p: PhaseId): number => trace.get(p)![0]!;
    expect(first('census')).toBe(first('demand'));
    expect(phaseApplies('settleMonth', 0, false)).toBe(false);
  });
  it('impeachMonthly 时 solvency 每月第 22 天生效（createSim 注入点）', () => {
    const trace = new Map<PhaseId, number[]>();
    const sys = recorders(trace);
    const given = new Set(sys.map((s) => s.id));
    const host = createSim({
      systems: [createCoreSystem(), ...SYSTEM_ORDER.filter((id) => id !== 'core' && !given.has(id)).map((id) => nullSystem(id)), ...sys],
      catalogue: CATALOGUE, snapshot: snapshotCodec, stubAllowlist: SYSTEM_ORDER.filter((id) => id !== 'core'), impeachMonthly: true,
    });
    host.newCity({ name: 'Solvent', difficulty: 1, startYear: 1950, seed: 1, terrainSeed: 1, terrain: { coast: false, river: false, hills: 0, water: 0, trees: 0 } });
    runDays(host, 50);
    expect(trace.get('solvency')).toEqual([22, 47]);
    expect(phaseApplies('solvency', 22, true)).toBe(true);
  });
  it('非 canSuspend 的阶段返回 suspend：仍按挂起处理（phaseCursor 停住、modalPause++），并记 core.unexpectedSuspend 诊断', () => {
    const zones: System = { ...nullSystem('zones'), phases: { census: () => 'suspend' } };
    const { host, state, ctx } = createTestContext({ systems: [zones] });
    runDays(host, 21);
    const r = host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 1 });
    expect(state.clock.speed).toBe(1);                            // runDays 恢复了速度：手动推进一天
    state.clock.speed = 5;
    const r2 = host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 1 });
    expect(r.daysRun + r2.daysRun).toBe(0); expect(r2.suspended).toBe(true);
    expect(state.clock.modalPause).toBe(1); expect(state.clock.phaseCursor).toBe(1);
    expect(ctx.diag.some((d) => d.code === 'core.unexpectedSuspend' && d.at === 'census')).toBe(true);
    host.modalClosed();
    expect(state.clock.age).toBe(22);
  });
  it('stepDay（内部句柄）：忽略速度档直接跑一天；挂起中调用抛错', () => {
    const economy: System = { ...nullSystem('economy'), phases: { graphs: () => 'suspend' } };
    const { host, state } = createTestContext({ systems: [economy] });
    const internals = simInternalsOf(host);
    expect(state.clock.speed).toBe(1);
    expect(internals.stepDay()).toBe('done'); expect(state.clock.age).toBe(1);
    runDays(host, 20);
    expect(internals.stepDay()).toBe('suspended'); expect(state.clock.modalPause).toBe(1);
    expect(() => internals.stepDay()).toThrow(/modalPause/);
    host.modalClosed();
    expect(state.clock.age).toBe(22);
  });
});

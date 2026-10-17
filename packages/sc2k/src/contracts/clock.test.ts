import { describe, expect, it } from 'vitest';
import {
  DAY_PHASES, DISASTER_TICK_MS, END_OF_DAY_IO, EXPORT_ORDER, GROWTH_VISIT_ORDER, IMPORT_ORDER, MS_PER_DAY, PHASE_IO, PHASE_OWNER,
  POSTLOAD_ORDER, SYSTEM_ORDER, growthStep, growthSubstep, phaseApplies, type LayerName, type PhaseId,
} from './clock';
import type { SystemId } from './system';

/** PhaseId 全集：PHASE_OWNER 的类型是 Record<PhaseId, …>，编译器保证键集合恰为全集；运行时以它为基准。 */
const ALL_PHASES = Object.keys(PHASE_OWNER) as PhaseId[];
const ALL_SYSTEMS: readonly SystemId[] = ['core', 'terrain', 'placement', 'utilities', 'zones', 'transport', 'services', 'economy', 'events'];
// 编译期：若 PhaseId 增删而 PHASE_OWNER / PHASE_IO 未同步，这两行报错
const _ownerComplete: Record<PhaseId, SystemId> = PHASE_OWNER;
const _ioComplete: Record<PhaseId, unknown> = PHASE_IO;
void _ownerComplete; void _ioComplete;

describe('clock: DAY_PHASES / PHASE_OWNER / PHASE_IO 不变量', () => {
  it('DAY_PHASES 键恰为 0..24，每日阶段无重复', () => {
    const days = Object.keys(DAY_PHASES).map(Number).sort((a, b) => a - b);
    expect(days).toEqual([...Array(25).keys()]);
    for (const d of days) {
      const list = DAY_PHASES[d]!;
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
    }
  });
  it('DAY_PHASES 的并集 == PhaseId 全集 == PHASE_IO 键集合', () => {
    const union = new Set<PhaseId>();
    for (let d = 0; d < 25; d++) for (const p of DAY_PHASES[d]!) union.add(p);
    expect([...union].sort()).toEqual([...ALL_PHASES].sort());
    expect(Object.keys(PHASE_IO).sort()).toEqual([...ALL_PHASES].sort());
    expect(ALL_PHASES.length).toBe(27);
  });
  it('除 growthScan（第 3–18 日）外每个阶段只出现在一天', () => {
    const count = new Map<PhaseId, number>();
    for (let d = 0; d < 25; d++) for (const p of DAY_PHASES[d]!) count.set(p, (count.get(p) ?? 0) + 1);
    for (const p of ALL_PHASES) expect(count.get(p), p).toBe(p === 'growthScan' ? 16 : 1);
    for (let d = 3; d <= 18; d++) expect(DAY_PHASES[d]).toEqual(['growthScan']);
  });
  it('PHASE_OWNER 的值 ⊆ SystemId；END_OF_DAY_IO 键 ⊆ SystemId', () => {
    for (const p of ALL_PHASES) expect(ALL_SYSTEMS).toContain(PHASE_OWNER[p]);
    for (const k of Object.keys(END_OF_DAY_IO)) expect(ALL_SYSTEMS).toContain(k);
  });
  it('同日无两阶段 bulk 写同层', () => {
    for (let d = 0; d < 25; d++) {
      const seen = new Map<LayerName, PhaseId>();
      for (const p of DAY_PHASES[d]!) for (const layer of PHASE_IO[p].bulk) {
        expect(seen.has(layer), `day ${d}: ${layer} 被 ${seen.get(layer)} 与 ${p} 同日 bulk 写`).toBe(false);
        seen.set(layer, p);
      }
    }
  });
  it('每层每月至多一个 bulk 写者（按 owner 系统计；END_OF_DAY_IO 算作第 25 个槽）', () => {
    // "写者" = 拥有该阶段的系统：powerScan 与 utilities.endOfDay 同为 utilities，视为同一写者。
    const writers = new Map<LayerName, Set<SystemId>>();
    const add = (layer: LayerName, sys: SystemId): void => { if (!writers.has(layer)) writers.set(layer, new Set()); writers.get(layer)!.add(sys); };
    for (const p of ALL_PHASES) for (const layer of PHASE_IO[p].bulk) add(layer, PHASE_OWNER[p]);
    for (const [sys, io] of Object.entries(END_OF_DAY_IO) as Array<[SystemId, typeof END_OF_DAY_IO[SystemId] & object]>) for (const layer of io.bulk) add(layer, sys);
    for (const [layer, set] of writers) expect(set.size, `${layer}: ${[...set].join(',')}`).toBe(1);
  });
  it('bulk / point 写的层也在 reads 声明之外合法；usesPrng 为布尔', () => {
    for (const p of ALL_PHASES) {
      const io = PHASE_IO[p];
      expect(typeof io.usesPrng).toBe('boolean'); expect(typeof io.canSuspend).toBe('boolean');
      expect(new Set(io.bulk).size).toBe(io.bulk.length);
      expect(new Set(io.point).size).toBe(io.point.length);
      for (const l of io.bulk) expect(io.point).not.toContain(l);
    }
  });
  it('END_OF_DAY_IO：utilities 声明 usesPrng，zones 不消费 PRNG 且无 bulk 写', () => {
    expect(END_OF_DAY_IO.utilities?.usesPrng).toBe(true);
    expect(END_OF_DAY_IO.zones?.usesPrng).toBe(false);
    expect(END_OF_DAY_IO.zones?.bulk).toEqual([]);
    for (const io of Object.values(END_OF_DAY_IO)) expect(io.canSuspend).toBe(false);
  });
});

describe('clock: 顺序常量', () => {
  it('SYSTEM_ORDER 为 9 个系统的排列；core 在首位', () => {
    expect([...SYSTEM_ORDER].sort()).toEqual([...ALL_SYSTEMS].sort());
    expect(SYSTEM_ORDER[0]).toBe('core');
  });
  it('IMPORT / POSTLOAD 为全排列；EXPORT 缺 placement；GROWTH_VISIT 为子集且无重复', () => {
    expect([...IMPORT_ORDER].sort()).toEqual([...ALL_SYSTEMS].sort());
    expect([...POSTLOAD_ORDER].sort()).toEqual([...ALL_SYSTEMS].sort());
    expect([...EXPORT_ORDER, 'placement'].sort()).toEqual([...ALL_SYSTEMS].sort());
    expect(GROWTH_VISIT_ORDER).toEqual(['transport', 'zones', 'services']);
    for (const list of [IMPORT_ORDER, POSTLOAD_ORDER, EXPORT_ORDER, GROWTH_VISIT_ORDER]) expect(new Set(list).size).toBe(list.length);
    // 文档语义：导入 events 在 services 之前；postLoad utilities 在 services 之前；导出 events 最后
    expect(IMPORT_ORDER.indexOf('events')).toBeLessThan(IMPORT_ORDER.indexOf('services'));
    expect(POSTLOAD_ORDER.indexOf('utilities')).toBeLessThan(POSTLOAD_ORDER.indexOf('services'));
    expect(EXPORT_ORDER[EXPORT_ORDER.length - 1]).toBe('events');
  });
  it('MS_PER_DAY / DISASTER_TICK_MS 覆盖 5 档且单调递减', () => {
    for (const t of [MS_PER_DAY, DISASTER_TICK_MS]) {
      expect(Object.keys(t).map(Number).sort()).toEqual([1, 2, 3, 4, 5]);
      expect(t[1]).toBe(Infinity);
      for (let s = 2; s <= 5; s++) expect(t[s as 2 | 3 | 4 | 5]).toBeLessThan(t[(s - 1) as 1 | 2 | 3 | 4]);
    }
  });
});

describe('clock: growthStep / growthSubstep', () => {
  it('第 3–18 日恰好覆盖 4×4 偏移各一次', () => {
    const seen = new Set<string>();
    for (let d = 3; d <= 18; d++) {
      const sx = growthStep(d), sy = growthSubstep(d);
      expect(sx).toBeGreaterThanOrEqual(0); expect(sx).toBeLessThan(4);
      expect(sy).toBeGreaterThanOrEqual(0); expect(sy).toBeLessThan(4);
      seen.add(`${sx},${sy}`);
    }
    expect(seen.size).toBe(16);
    expect([growthStep(3), growthSubstep(3)]).toEqual([0, 0]);
    expect([growthStep(18), growthSubstep(18)]).toEqual([3, 3]);
  });
});

describe('clock: phaseApplies', () => {
  it('settleMonth 首月不生效；年度阶段只在第 0 月；closeYear / budgetWindow 跳过第 0 年首月', () => {
    expect(phaseApplies('settleMonth', 0, false)).toBe(false);
    expect(phaseApplies('settleMonth', 1, false)).toBe(true);
    expect(phaseApplies('settleMonth', 25, false)).toBe(true);
    for (const p of ['closeYear', 'budgetWindow'] as const) {
      expect(phaseApplies(p, 0, false)).toBe(false);
      expect(phaseApplies(p, 25, false)).toBe(false);
      expect(phaseApplies(p, 300, false)).toBe(true);
      expect(phaseApplies(p, 324, false)).toBe(true);
      expect(phaseApplies(p, 325, false)).toBe(false);
    }
    for (const p of ['techCheck', 'nationalAnnual.zones', 'nationalAnnual.economy', 'neighborsAnnual', 'approvalSurvey', 'facilityAnnual', 'utilitiesAnnual'] as const) {
      expect(phaseApplies(p, 0, false)).toBe(true);
      expect(phaseApplies(p, 300, false)).toBe(true);
      expect(phaseApplies(p, 25, false)).toBe(false);
      expect(phaseApplies(p, 299, false)).toBe(false);
    }
  });
  it('solvency 由 impeachMonthly 决定；其余阶段恒生效', () => {
    expect(phaseApplies('solvency', 0, false)).toBe(false);
    expect(phaseApplies('solvency', 0, true)).toBe(true);
    expect(phaseApplies('solvency', 7, true)).toBe(true);
    for (const p of ['beginMonth', 'powerScan', 'dataMaps', 'growthScan', 'trafficDecay', 'waterScan', 'census', 'demand', 'demographics', 'graphs', 'milestones', 'scenario', 'uiRefresh', 'weatherAndDisaster', 'cityStatus', 'news'] as const) {
      for (const age of [0, 1, 25, 300, 1234]) expect(phaseApplies(p, age, false), p).toBe(true);
    }
  });
});

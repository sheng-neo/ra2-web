// ===== testkit/headless.ts =====（ARCHITECTURE §10.4 / §10.5；tools/headless.ts 与 tools/hash-compare.ts 的共用驱动器）
// runHeadless(host, script, opts)：newCity(script.params) → 按脚本派发并逐天推进 years 年 → 每年末记录
//   { year, age, hash, hashSc2, pop, funds, phaseMsP95, growthDayMsP95, runTrips, invariants }。
// 只记录、不断言精确值；不变量违规放进 record.invariants 由调用方决定退出码。runTrips 通过包装 q.transport.runTrip 计数（host.q 与 ctx.q 同一对象）。
import type { PhaseId } from '../contracts/clock';
import { PHASE_OWNER } from '../contracts/clock';
import type { SimHost } from '../contracts/host';
import type { TransportQuery } from '../contracts/queries';
import type { GoldenMiniCity } from '../contracts/testkit';
import { runScript } from './replay';
import { checkInvariants } from './invariants';

export const DAYS_PER_YEAR = 300;

export interface YearRecord {
  year: number; age: number; hash: number; hashSc2: number; pop: number; funds: number;
  phaseMsP95: Record<PhaseId, number>; growthDayMsP95: number; runTrips: number; invariants: string[];
}
export interface HeadlessOptions {
  years: number;
  /** 注入给阶段计时的时钟（tools 传 performance.now；测试可省略）。 */
  now?: () => number;
  /** 每年末回调（流式输出 / 进度）。 */
  onYear?: (r: YearRecord) => void;
  /** 是否每年跑不变量检查（默认 true）。 */
  invariants?: boolean;
  /** 覆盖脚本 seed。 */
  seed?: number;
  /** newCity 之后、派发之前的钩子（测试铺平地形等）。 */
  afterNewCity?: (host: SimHost) => void;
}

/** 包装 runTrip 计数；返回读数函数。 */
export function countRunTrips(host: SimHost): () => number {
  const t = host.q.transport as TransportQuery;
  const orig = t.runTrip;
  let n = 0;
  t.runTrip = (i, zone, level) => { n++; return orig.call(t, i, zone, level); };
  return () => n;
}

export function runHeadless(host: SimHost, script: GoldenMiniCity, opts: HeadlessOptions): YearRecord[] {
  const params = opts.seed !== undefined ? { ...script.params, seed: opts.seed } : script.params;
  host.newCity(params);
  opts.afterNewCity?.(host);
  const trips = countRunTrips(host);
  const records: YearRecord[] = [];
  const years = Math.max(0, opts.years | 0);
  const startAge = host.state.clock.age;
  const onDay = (age: number): void => {
    if ((age - startAge) % DAYS_PER_YEAR !== 0) return;
    const year = (age - startAge) / DAYS_PER_YEAR;
    const timings = host.phaseTimings();
    const phaseMsP95 = {} as Record<PhaseId, number>;
    for (const id of Object.keys(PHASE_OWNER) as PhaseId[]) phaseMsP95[id] = timings[id].p95Ms;
    const s = host.state;
    const r: YearRecord = {
      year, age, hash: host.hash('full'), hashSc2: host.hash('sc2'),
      pop: s.census.normalPop + s.census.arcoPop, funds: s.economy.funds,
      phaseMsP95, growthDayMsP95: timings.growthScan.p95Ms, runTrips: trips(),
      invariants: opts.invariants === false ? [] : checkInvariants(s, host.catalogue),
    };
    records.push(r);
    opts.onYear?.(r);
    host.drainEvents();                                 // 无头不消费事件：每年清一次
  };
  runScript(host, script.commands, startAge + years * DAYS_PER_YEAR, { now: opts.now, onDay });
  return records;
}

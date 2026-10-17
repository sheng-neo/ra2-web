// ===== sim/core/createSim.ts =====
// 调度器 + SimHost（ARCHITECTURE §5、CONTRACTS §R）：WP0 最小但形状完整的实现，WP1 在此基础上扩展而不改签名。
// 不 import io/** app/** render/** ui/**：快照编解码器由 CreateSimOptions.snapshot 注入。
import type { Actions } from '../../contracts/actions';
import { ACTION_OWNER } from '../../contracts/actions';
import type { PhaseId } from '../../contracts/clock';
import {
  DAY_PHASES, DEFAULT_BUDGET_MS, DISASTER_TICK_MS, END_OF_DAY_IO, EXPORT_ORDER, IMPORT_ORDER, MAX_DAYS_PER_FRAME, MS_PER_DAY,
  PHASE_OWNER, POSTLOAD_ORDER, SYSTEM_ORDER, phaseApplies,
} from '../../contracts/clock';
import type { Command, CommandResult, LoggedCommand } from '../../contracts/commands';
import { COMMAND_OWNER, NOT_IMPLEMENTED_RESULT } from '../../contracts/commands';
import { createDirtyTracker } from '../../contracts/dirty';
import type { SimEvent } from '../../contracts/events';
import { CityMode } from '../../contracts/grid';
import type { AdvanceOptions, CreateSimFn, ReplayFn, SimHost } from '../../contracts/host';
import type { Sc2Document, Sc2ExportOptions } from '../../contracts/io';
import { MISC_ZERO_RANGES } from '../../contracts/io';
import { createPrng } from '../../contracts/prng';
import type { Queries } from '../../contracts/queries';
import { QUERY_OWNER } from '../../contracts/queries';
import type { HashScope } from '../../contracts/snapshot';
import { createCityState, dateOf } from '../../contracts/state';
import type { CityState } from '../../contracts/state';
import type { CommandHandler, CreateSimOptions, Diagnostic, NewCityParams, SimContext, System, SystemId } from '../../contracts/system';
import { bindCoreRegistry } from './coreSystem';
import { blankSc2Document, recountFromLayers, resetCityStateInPlace } from './stateOps';
import { createTileWriter } from './tileWriter';

const QUERY_KEYS = Object.keys(QUERY_OWNER) as (keyof Queries)[];
const ACTION_KEYS = Object.keys(ACTION_OWNER) as (keyof Actions)[];
/** 每帧灾害 / 物件 tick 的硬顶（预算之外的保险，避免超大 dtMs 旋死）。 */
const MAX_TICKS_PER_FRAME = 40;
/** phaseTimings 的样本环大小（p95 取最近 N 次）。 */
const TIMING_SAMPLES = 256;

const orderIndex = (id: SystemId): number => SYSTEM_ORDER.indexOf(id);
/** host → ctx 的侧通道（SimHost 契约不暴露 ctx；testkit.createTestContext 与 tools/ 用它拿 ctx）。 */
const CONTEXTS = new WeakMap<SimHost, SimContext>();
export function simContextOf(host: SimHost): SimContext {
  const ctx = CONTEXTS.get(host);
  if (!ctx) throw new Error('simContextOf: 该 host 不是 createSim 创建的');
  return ctx;
}

/** 注册校验 + 按 SYSTEM_ORDER 排序（ARCHITECTURE §5.4）。任何违规抛 Error（消息带系统 id）。 */
export function sortAndValidateSystems(input: readonly System[], stubAllowlist: readonly SystemId[]): System[] {
  const seen = new Set<SystemId>();
  for (const s of input) {
    if (orderIndex(s.id) < 0) throw new Error(`createSim: 未知系统 id "${String(s.id)}"`);
    if (seen.has(s.id)) throw new Error(`createSim: 系统 "${s.id}" 重复注册`);
    seen.add(s.id);
    if (s.stub && !stubAllowlist.includes(s.id)) throw new Error(`createSim: 系统 "${s.id}" 是桩，但不在 stubAllowlist 内`);
    if (s.privVersion !== undefined && (!Number.isInteger(s.privVersion) || s.privVersion < 1)) throw new Error(`createSim: 系统 "${s.id}" 的 privVersion 必须是 ≥ 1 的整数`);
    for (const k of Object.keys(s.phases ?? {}) as PhaseId[]) {
      if (PHASE_OWNER[k] === undefined) throw new Error(`createSim: 系统 "${s.id}" 注册了未知阶段 "${k}"`);
      if (PHASE_OWNER[k] !== s.id) throw new Error(`createSim: 阶段 "${k}" 归 ${PHASE_OWNER[k]}，系统 "${s.id}" 无权注册`);
    }
    for (const k of Object.keys(s.commands ?? {}) as Command['type'][]) {
      if (COMMAND_OWNER[k] === undefined) throw new Error(`createSim: 系统 "${s.id}" 注册了未知命令 "${k}"`);
      if (COMMAND_OWNER[k] !== s.id) throw new Error(`createSim: 命令 "${k}" 归 ${COMMAND_OWNER[k]}，系统 "${s.id}" 无权注册`);
    }
    for (const k of Object.keys(s.actions ?? {}) as (keyof Actions)[]) {
      if (ACTION_OWNER[k] === undefined) throw new Error(`createSim: 系统 "${s.id}" 注册了未知 action "${k}"`);
      if (ACTION_OWNER[k] !== s.id) throw new Error(`createSim: action "${k}" 归 ${ACTION_OWNER[k]}，系统 "${s.id}" 无权注册`);
    }
    for (const k of Object.keys(s.queries ?? {}) as (keyof Queries)[]) {
      if (QUERY_OWNER[k] === undefined) throw new Error(`createSim: 系统 "${s.id}" 注册了未知 query "${k}"`);
      if (QUERY_OWNER[k] !== s.id) throw new Error(`createSim: query "${k}" 归 ${QUERY_OWNER[k]}，系统 "${s.id}" 无权注册`);
    }
    if (typeof s.endOfDay === 'function' && END_OF_DAY_IO[s.id] === undefined) throw new Error(`createSim: 系统 "${s.id}" 实现了 endOfDay 但 END_OF_DAY_IO 未声明它`);
  }
  if (!seen.has('core')) throw new Error('createSim: 缺少 core 系统（请传入 createCoreSystem()）');
  return input.slice().sort((a, b) => orderIndex(a.id) - orderIndex(b.id));
}

/** 合并各系统的 queries；缺键抛错并指出 owner。对象按引用合并（桩可在 init 后延迟绑定内部实现）。 */
function mergeQueries(byId: ReadonlyMap<SystemId, System>): Queries {
  const q: Partial<Queries> = {};
  const missing: string[] = [];
  for (const key of QUERY_KEYS) {
    const owner = QUERY_OWNER[key];
    const v = byId.get(owner)?.queries?.[key];
    if (v === undefined) missing.push(`q.${key}（owner ${owner}${byId.has(owner) ? ' 未提供' : ' 未注册'}）`);
    else (q as Record<string, unknown>)[key] = v;
  }
  if (missing.length > 0) throw new Error(`createSim: 查询缺失：${missing.join('、')}`);
  return q as Queries;
}

/** 合并 Actions：core 的 7 个键来自 TileWriter，其余按 ACTION_OWNER 取自各系统；缺键抛错。 */
function mergeActions(core: Pick<Actions, 'setXbld' | 'setXzon' | 'setXund' | 'setXbit' | 'setTerrain' | 'layerChanged' | 'emit'>, byId: ReadonlyMap<SystemId, System>): Actions {
  const a: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const key of ACTION_KEYS) {
    const owner = ACTION_OWNER[key];
    const v: unknown = owner === 'core' ? core[key as keyof typeof core] : byId.get(owner)?.actions?.[key];
    if (typeof v !== 'function') missing.push(`act.${key}（owner ${owner}${byId.has(owner) ? ' 未提供' : ' 未注册'}）`);
    else a[key] = v;
  }
  if (missing.length > 0) throw new Error(`createSim: action 缺失：${missing.join('、')}`);
  return a as unknown as Actions;
}

/** 阶段耗时样本环（count 全量计数；p95 取最近 TIMING_SAMPLES 次）。 */
class PhaseTimer {
  count = 0;
  private readonly samples = new Float64Array(TIMING_SAMPLES);
  private n = 0; private head = 0;
  add(ms: number): void { this.count++; this.samples[this.head] = ms; this.head = (this.head + 1) % TIMING_SAMPLES; if (this.n < TIMING_SAMPLES) this.n++; }
  p95(): number {
    if (this.n === 0) return 0;
    const arr = Array.from(this.samples.subarray(0, this.n)).sort((x, y) => x - y);
    return arr[Math.min(this.n - 1, Math.floor(0.95 * (this.n - 1)))]!;
  }
}

/** core 实现；systems 任意顺序传入，内部按 SYSTEM_ORDER 排序并校验注册约束。 */
export const createSim: CreateSimFn = (opts: CreateSimOptions): SimHost => {
  const systems = sortAndValidateSystems(opts.systems, opts.stubAllowlist);
  const byId = new Map<SystemId, System>(systems.map((s) => [s.id, s]));
  const impeachMonthly = opts.impeachMonthly === true;
  const codec = opts.snapshot;
  if (!codec) throw new Error('createSim: opts.snapshot 必填（io/snapshot/index.ts 的 snapshotCodec）');

  const state: CityState = createCityState();
  const prng = createPrng(0, state.clock);           // cell = state.clock：prngState 天然入快照；newCity 时 seed(p.seed)
  const dirty = createDirtyTracker();
  const events: SimEvent[] = [];
  const diag: Diagnostic[] = [];
  const log: LoggedCommand[] = [];
  let seq = 0;
  let day = -1;                                        // ctx.day：阶段内 0..24，其余 −1
  let inPhase = false;                                 // 阶段 / 命令 / tick 处理中（禁止重入 dispatch）
  let nowFn: () => number = () => 0;                   // 由 advance 注入（sim 内禁用 performance）
  let thingsAccum = 0, disasterAccum = 0;              // 物件 / 灾害 tick 的真实时间余量（不入哈希）
  const timers = new Map<PhaseId, PhaseTimer>();

  const writer = createTileWriter(state, dirty, events, opts.catalogue);
  const q = mergeQueries(byId);
  const act = mergeActions(writer.actions, byId);
  const ctx: SimContext = {
    state, prng, tuning: opts.tuning ?? {}, catalogue: opts.catalogue,
    get day(): number { return day; },
    events, diag, q, act,
  };
  bindCoreRegistry(ctx, { systemById: (id) => byId.get(id) });

  const flush = (): void => writer.flush(ctx, systems);
  /** 以 fn 包裹一次"sim 内执行"：设置 day、禁止重入、结束后扇出 tile 变更。 */
  const inside = <T>(d: number, fn: () => T): T => {
    if (inPhase) throw new Error('core: 阶段 / 命令处理中不得重入');
    inPhase = true; day = d;
    try { const r = fn(); flush(); return r; }
    finally { inPhase = false; day = -1; }
  };

  const timing = (id: PhaseId, ms: number): void => {
    let t = timers.get(id);
    if (!t) { t = new PhaseTimer(); timers.set(id, t); }
    t.add(ms);
  };

  /** 跑完当天剩余阶段；任一阶段挂起 → 'suspended'（modalPause 已 ++，phaseCursor 停在已完成阶段数）。 */
  function advanceDay(): 'done' | 'suspended' {
    const c = state.clock;
    const d = c.age % 25;
    const phases = DAY_PHASES[d] ?? [];
    for (let k = c.phaseCursor; k < phases.length; k++) {
      const id = phases[k]!;
      c.phaseCursor = k + 1;
      if (!phaseApplies(id, c.age, impeachMonthly)) continue;
      const runner = byId.get(PHASE_OWNER[id])?.phases?.[id];
      if (!runner) continue;                           // 缺席 / 桩 / 未实现：跳过，不消费 PRNG
      const t0 = nowFn();
      const r = inside(d, () => runner(ctx, d));
      timing(id, nowFn() - t0);
      if (r === 'suspend') { c.modalPause++; return 'suspended'; }
    }
    for (const s of systems) {
      if (END_OF_DAY_IO[s.id] === undefined || typeof s.endOfDay !== 'function') continue;
      inside(d, () => s.endOfDay!(ctx));
    }
    c.phaseCursor = 0;
    c.age++;
    events.push({ type: 'dayTick', age: c.age });
    if (c.age % 25 === 0) { const dt = dateOf(c); events.push({ type: 'monthTick', year: dt.year, month: dt.month }); }
    return 'done';
  }

  /** 灾害 / 物件 tick（按 SYSTEM_ORDER；ctx.day = −1）。 */
  function runTick(disaster: boolean): void {
    inside(-1, () => {
      for (const s of systems) {
        if (disaster && typeof s.disasterTick === 'function') s.disasterTick(ctx);
        if (typeof s.thingsTick === 'function') s.thingsTick(ctx);
      }
    });
    if (disaster) state.clock.disasterTicks++;
  }

  function advance(dtMs: number, now: () => number, o?: AdvanceOptions): { daysRun: number; suspended: boolean } {
    const c = state.clock;
    if (c.modalPause > 0) return { daysRun: 0, suspended: true };
    if (c.speed === 1) return { daysRun: 0, suspended: false };
    const budgetMs = o?.budgetMs ?? DEFAULT_BUDGET_MS;
    const maxDays = Math.max(1, o?.maxDaysPerFrame ?? MAX_DAYS_PER_FRAME);
    nowFn = now;
    const t0 = now();
    const tickMs = DISASTER_TICK_MS[c.speed];
    const dt = Math.max(0, dtMs);
    if (c.mode === CityMode.Disaster) {
      disasterAccum += dt;
      let ticks = 0;
      while (disasterAccum >= tickMs && ticks < MAX_TICKS_PER_FRAME && now() - t0 < budgetMs) { disasterAccum -= tickMs; runTick(true); ticks++; }
      disasterAccum = Math.min(disasterAccum, tickMs);
      return { daysRun: 0, suspended: false };
    }
    // 城市（与地形编辑）模式：物件 tick 与日历并行推进
    thingsAccum += dt;
    let ticks = 0;
    while (thingsAccum >= tickMs && ticks < MAX_TICKS_PER_FRAME) { thingsAccum -= tickMs; runTick(false); ticks++; }
    thingsAccum = Math.min(thingsAccum, tickMs);
    const msPerDay = MS_PER_DAY[c.speed];
    let pending: number;
    if (msPerDay === 0) pending = maxDays;
    else { c.accumMs += dt; pending = Math.min(maxDays, Math.floor(c.accumMs / msPerDay)); c.accumMs -= pending * msPerDay; }
    let daysRun = 0;
    while (pending > 0) {
      const r = advanceDay(); pending--;
      if (r === 'suspended') return { daysRun, suspended: true };
      daysRun++;
      if (now() - t0 >= budgetMs) break;
    }
    if (pending > 0 && msPerDay > 0) c.accumMs = Math.min(c.accumMs + pending * msPerDay, maxDays * msPerDay);
    return { daysRun, suspended: false };
  }

  function dispatch(cmd: Command): CommandResult {
    const c = state.clock;
    const owner = COMMAND_OWNER[cmd.type];
    const sys = owner === undefined ? undefined : byId.get(owner);
    const handler = sys && !sys.stub ? (sys.commands as Record<string, unknown> | undefined)?.[cmd.type] : undefined;
    if (typeof handler !== 'function') return NOT_IMPLEMENTED_RESULT;
    const res = inside(-1, () => (handler as CommandHandler)(ctx, cmd));
    if (res.ok) log.push({ age: c.age, phaseCursor: c.phaseCursor, seq: seq++, cmd });
    return res;
  }

  function newCity(p: NewCityParams): void {
    resetCityStateInPlace(state);
    writer.reset(); dirty.clear(); events.length = 0; diag.length = 0; log.length = 0; seq = 0;
    thingsAccum = 0; disasterAccum = 0; timers.clear();
    prng.seed(p.seed);
    for (const s of systems) inside(-1, () => s.init(ctx, p));
    recountFromLayers(state, opts.catalogue);          // init 可能直接写层（地形生成）；counts 必须与 xbld 全量一致（ARCHITECTURE §3.5）
    dirty.markBulk('all');
  }

  function postLoadAll(source: 'snapshot' | 'sc2'): void {
    for (const id of POSTLOAD_ORDER) { const s = byId.get(id); if (s && typeof s.postLoad === 'function') inside(-1, () => s.postLoad!(ctx, source)); }
    dirty.markBulk('all');
  }

  const host: SimHost = {
    state, q, catalogue: opts.catalogue, dirty, systems,
    advance, dispatch,
    modalOpened() { state.clock.modalPause++; },
    modalClosed() {
      const c = state.clock;
      if (c.modalPause > 0) c.modalPause--;
      if (c.modalPause === 0 && c.phaseCursor > 0) advanceDay();   // 续跑当天剩余阶段 + endOfDay（可能再次挂起）
    },
    drainEvents() { return events.splice(0, events.length); },
    hash(scope: HashScope) { return codec.hash(state, scope); },
    commandLog() { return log; },
    newCity,
    saveSnapshot() { return codec.encode(state); },
    loadSnapshot(bytes: Uint8Array) {
      writer.reset(); dirty.clear(); events.length = 0; log.length = 0; seq = 0; thingsAccum = 0; disasterAccum = 0;
      const d = codec.decode(bytes, state);
      postLoadAll('snapshot');
      return d;
    },
    importSc2(doc: Sc2Document) {
      const d: Diagnostic[] = [];
      resetCityStateInPlace(state);
      writer.reset(); dirty.clear(); events.length = 0; log.length = 0; seq = 0; thingsAccum = 0; disasterAccum = 0;
      for (const id of IMPORT_ORDER) { const s = byId.get(id); if (s && typeof s.importFrom === 'function') inside(-1, () => s.importFrom!(ctx, doc, d)); }
      postLoadAll('sc2');
      return d;
    },
    exportSc2(o?: Sc2ExportOptions) {
      if (state.clock.phaseCursor > 0) throw new Error('exportSc2: 阶段挂起中（phaseCursor > 0）不允许导出 .SC2');
      const doc = blankSc2Document();
      for (const id of EXPORT_ORDER) { const s = byId.get(id); if (s && typeof s.exportTo === 'function') inside(-1, () => s.exportTo!(ctx, doc)); }
      if (o?.compat) for (const [lo, hi] of MISC_ZERO_RANGES) doc.misc.fill(0, lo >> 2, hi >> 2);   // 零区清零：不写 PRNG 标志 / 侧表
      return doc;
    },
    phaseTimings() {
      const out = {} as Record<PhaseId, { count: number; p95Ms: number }>;
      for (const id of Object.keys(PHASE_OWNER) as PhaseId[]) { const t = timers.get(id); out[id] = { count: t?.count ?? 0, p95Ms: t?.p95() ?? 0 }; }
      return out;
    },
  };
  CONTEXTS.set(host, ctx);
  return host;
};

/**
 * 重放（ARCHITECTURE §5.6）：新城 → 逐天推进到 untilAge；每天开始前（phaseCursor == 0）派发该 age 下 phaseCursor == 0 的日志命令；
 * 遇挂起时派发该 (age, phaseCursor) 的命令再 modalClosed()；日志里出现过的 (age, cursor) 即使本次没挂起也不影响（命令只在匹配游标时派发）。
 */
export const replay: ReplayFn = (opts, params, log, untilAge) => {
  const host = createSim(opts);
  host.newCity(params);
  const sorted = log.slice().sort((a, b) => a.age - b.age || a.phaseCursor - b.phaseCursor || a.seq - b.seq);
  let k = 0;
  const dispatchAt = (age: number, cursor: number): void => {
    while (k < sorted.length && sorted[k]!.age < age) k++;             // 过期条目（不可达的游标）直接跳过
    while (k < sorted.length && sorted[k]!.age === age && sorted[k]!.phaseCursor === cursor) { host.dispatch(sorted[k]!.cmd); k++; }
  };
  const c = host.state.clock;
  (host.state as CityState).clock.speed = 5;                            // speed 不入哈希；重放用最快档
  let guard = 0;
  while (c.age < untilAge) {
    if (c.modalPause === 0 && c.phaseCursor === 0) dispatchAt(c.age, 0);
    const r = host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 1 });
    if (r.suspended || c.modalPause > 0) {
      dispatchAt(c.age, c.phaseCursor);
      host.modalClosed();
    }
    if (++guard > untilAge * 64 + 1024) throw new Error('replay: 推进停滞（模态未能关闭？）');
  }
  return host;
};

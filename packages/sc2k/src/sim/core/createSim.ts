// ===== sim/core/createSim.ts =====
// 调度器 + SimHost（ARCHITECTURE §5、CONTRACTS §R）：注册校验、advanceDay / advance 预算切片、endOfDay 调度（挂起日延后）、
// 命令派发与日志、事件缓冲、读档 / 存档编排（saveload.ts）、重放（replay.ts）。
// 不 import io/** app/** render/** ui/**：快照编解码器由 CreateSimOptions.snapshot 注入。
import type { Actions } from '../../contracts/actions';
import { ACTION_OWNER } from '../../contracts/actions';
import type { PhaseId } from '../../contracts/clock';
import { DAY_PHASES, DEFAULT_BUDGET_MS, DISASTER_TICK_MS, END_OF_DAY_IO, MAX_DAYS_PER_FRAME, PHASE_IO, PHASE_OWNER, SYSTEM_ORDER, phaseApplies } from '../../contracts/clock';
import type { Command, CommandResult } from '../../contracts/commands';
import { COMMAND_OWNER, NOT_IMPLEMENTED_RESULT } from '../../contracts/commands';
import { createDirtyTracker } from '../../contracts/dirty';
import { CityMode, DisasterKind } from '../../contracts/grid';
import type { AdvanceOptions, CreateSimFn, ReplayFn, SimHost } from '../../contracts/host';
import type { Sc2Document, Sc2ExportOptions } from '../../contracts/io';
import { createPrng } from '../../contracts/prng';
import type { Queries } from '../../contracts/queries';
import { QUERY_OWNER } from '../../contracts/queries';
import type { HashScope } from '../../contracts/snapshot';
import { createCityState, dateOf } from '../../contracts/state';
import type { CityState } from '../../contracts/state';
import type { CommandHandler, CreateSimOptions, Diagnostic, NewCityParams, SimContext, System, SystemId } from '../../contracts/system';
import { carryBack, planDays, planTicks } from './advance';
import { createCommandLog } from './commandLog';
import { bindCoreRegistry } from './coreSystem';
import { createEventBuffer } from './eventBuffer';
import { bindHostInternals } from './internals';
import type { SimInternals } from './internals';
import { replayInto } from './replay';
import { exportCity, importCity, loadSnapshotInto, reconcileCounts, saveSnapshotOf } from './saveload';
import type { SaveLoadDeps } from './saveload';
import { recountFromLayers, resetCityStateInPlace } from './stateOps';
import { createTileWriter } from './tileWriter';
import { DEFAULT_CORE_TUNING } from './tuning';
import type { CoreTuning } from './tuning';

export { simContextOf, simInternalsOf } from './internals';

const QUERY_KEYS = Object.keys(QUERY_OWNER) as (keyof Queries)[];
const ACTION_KEYS = Object.keys(ACTION_OWNER) as (keyof Actions)[];
const orderIndex = (id: SystemId): number => SYSTEM_ORDER.indexOf(id);

/** 注册校验 + 按 SYSTEM_ORDER 排序（ARCHITECTURE §5.4）。任何违规抛 Error（消息带系统 id）。 */
export function sortAndValidateSystems(input: readonly System[], stubAllowlist: readonly SystemId[]): System[] {
  const seen = new Set<SystemId>();
  for (const s of input) {
    if (orderIndex(s.id) < 0) throw new Error(`createSim: 未知系统 id "${String(s.id)}"`);
    if (seen.has(s.id)) throw new Error(`createSim: 系统 "${s.id}" 重复注册`);
    seen.add(s.id);
    if (s.stub && !stubAllowlist.includes(s.id)) throw new Error(`createSim: 系统 "${s.id}" 是桩，但不在 stubAllowlist 内`);
    if (s.privVersion !== undefined && (!Number.isInteger(s.privVersion) || s.privVersion < 1)) throw new Error(`createSim: 系统 "${s.id}" 的 privVersion 必须是 ≥ 1 的整数`);
    if (s.id === 'core' && s.privVersion !== undefined) throw new Error('createSim: core 不得声明 priv');
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
    if (s.privVersion !== undefined && typeof s.postLoad !== 'function') throw new Error(`createSim: 系统 "${s.id}" 声明了 priv（privVersion）但未实现 postLoad`);
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

/** 阶段耗时样本环（count 全量计数；p95 取最近 N 次）。 */
class PhaseTimer {
  count = 0;
  private readonly samples: Float64Array;
  private n = 0; private head = 0;
  constructor(private readonly size: number) { this.samples = new Float64Array(Math.max(1, size)); }
  add(ms: number): void { this.count++; this.samples[this.head] = ms; this.head = (this.head + 1) % this.samples.length; if (this.n < this.samples.length) this.n++; }
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
  const tune: CoreTuning = { ...DEFAULT_CORE_TUNING, ...((opts.tuning?.core ?? {}) as Partial<CoreTuning>) };

  const state: CityState = createCityState();
  const prng = createPrng(0, state.clock);           // cell = state.clock：prngState 天然入快照；newCity 时 seed(p.seed)
  const dirty = createDirtyTracker();
  const buffer = createEventBuffer();
  const events = buffer.events;
  const diag: Diagnostic[] = [];
  const log = createCommandLog();
  let day = -1;                                        // ctx.day：阶段内 0..24，其余 −1
  let inPhase = false;                                 // 阶段 / 命令 / tick 处理中（禁止重入 dispatch）
  let nowFn: () => number = () => 0;                   // 由 advance / stepDay 注入（sim 内禁用 performance）
  const thingsAccum = { ms: 0 }, disasterAccum = { ms: 0 };   // 物件 / 灾害 tick 的真实时间余量（不入哈希）
  const timers = new Map<PhaseId, PhaseTimer>();
  /** 日末钩子的接收者（按 SYSTEM_ORDER，只取 END_OF_DAY_IO 的键且实现了 endOfDay 者）。 */
  const eodSystems = systems.filter((s) => END_OF_DAY_IO[s.id] !== undefined && typeof s.endOfDay === 'function');

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
  /** 诊断 / 事件缓冲封顶（每次"sim 内执行"结束时）。 */
  const capBuffers = (): void => {
    if (diag.length > tune.diagCap) diag.splice(0, diag.length - tune.diagCap);
    buffer.trim(tune.eventCap, diag);
  };
  /** 以 fn 包裹一次"sim 内执行"：设置 day、禁止重入、结束后扇出 tile 变更并封顶缓冲。 */
  const inside = <T>(d: number, fn: () => T): T => {
    if (inPhase) throw new Error('core: 阶段 / 命令处理中不得重入');
    inPhase = true; day = d;
    try { const r = fn(); flush(); return r; }
    finally { inPhase = false; day = -1; capBuffers(); }
  };

  const timing = (id: PhaseId, ms: number): void => {
    let t = timers.get(id);
    if (!t) { t = new PhaseTimer(tune.timingSamples); timers.set(id, t); }
    t.add(ms);
  };

  /**
   * 跑完当天剩余阶段；任一阶段挂起 → 'suspended'（modalPause 已 ++，phaseCursor 停在已完成阶段数）。
   * 当日全部阶段完成后按 SYSTEM_ORDER 调 END_OF_DAY_IO 的键的 endOfDay（挂起日延后到 modalClosed 续跑完成后；每天恰一次），再 age++。
   */
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
      if (r === 'suspend') {
        if (!PHASE_IO[id].canSuspend) diag.push({ level: 'warn', code: 'core.unexpectedSuspend', message: `阶段 ${id} 返回 suspend，但 PHASE_IO 声明 canSuspend:false`, at: id });
        c.modalPause++;
        return 'suspended';
      }
    }
    for (const s of eodSystems) inside(d, () => s.endOfDay!(ctx));
    c.phaseCursor = 0;
    c.age++;
    events.push({ type: 'dayTick', age: c.age });
    if (c.age % 25 === 0) { const dt = dateOf(c); events.push({ type: 'monthTick', year: dt.year, month: dt.month }); }
    capBuffers();
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

  /** 灾害待启动：城市模式下 disaster.pending 非空（下一次物件 tick 由状态机消费）。 */
  const disasterPending = (): boolean => state.clock.mode === CityMode.City && state.disaster.pending !== DisasterKind.None;
  /** 经函数读取模式（tick 内会被 events 改写，直接比较会被 TS 的控制流收窄误判为恒假）。 */
  const inDisaster = (): boolean => state.clock.mode === CityMode.Disaster;

  /**
   * ARCHITECTURE §5.2 伪码的逐行实现：预算切片、余量带帧、硬顶、挂起即停；灾害 / 物件 tick 计入同一预算。
   * 灾害与日历的衔接（contract-rfc WP13-6）：灾害模式只跑 tick、不推进日历，灾害结束（回到城市模式）或 tick 内弹出模态即停；
   * 城市模式下物件 tick 把模式切到灾害 / 弹出模态后本帧不再推进日历；某日掷出随机灾害（pending 新置位）后余下天数折回，
   * 下一帧不等 tick 节拍先跑一次物件 tick 启动它——于是 pending 的消费点恰在"置位日之后、下一日之前"，与 replay 的 settleTicks 约定一致。
   */
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
      const ticks = planTicks(disasterAccum, dt, tickMs, tune.maxTicksPerFrame);
      for (let k = 0; k < ticks; k++) {
        runTick(true);
        if (c.mode !== CityMode.Disaster || c.modalPause > 0) { disasterAccum.ms = 0; break; }
        if (now() - t0 >= budgetMs) { disasterAccum.ms = Math.min(disasterAccum.ms + (ticks - k - 1) * tickMs, tickMs); break; }
      }
      return { daysRun: 0, suspended: c.modalPause > 0 };
    }
    // 城市（与地形编辑）模式：物件 tick 与日历并行推进（物件按 DISASTER_TICK_MS 节奏；待启动的灾害不等节拍）
    let ticks = planTicks(thingsAccum, dt, tickMs, tune.maxTicksPerFrame);
    if (ticks === 0 && disasterPending()) ticks = 1;
    for (let k = 0; k < ticks; k++) {
      runTick(false);
      if (inDisaster() || c.modalPause > 0) { thingsAccum.ms = 0; break; }   // tick 内切到灾害模式 / 弹出模态：本帧不推进日历
    }
    if (c.modalPause > 0) return { daysRun: 0, suspended: true };
    if (inDisaster()) return { daysRun: 0, suspended: false };
    let pending = planDays(c, dt, maxDays);
    let daysRun = 0;
    while (pending > 0) {
      const wasPending = disasterPending();
      const r = advanceDay(); pending--;
      if (r === 'suspended') { carryBack(c, pending, maxDays); return { daysRun, suspended: true }; }
      daysRun++;
      if (!wasPending && disasterPending()) break;     // 本日掷出灾害：余下天数折回，下一帧先启动灾害
      if (now() - t0 >= budgetMs) break;
    }
    carryBack(c, pending, maxDays);
    return { daysRun, suspended: false };
  }

  /** owner 缺席 / 为桩 / 未实现 → NOT_IMPLEMENTED_RESULT（不写日志、不消费 PRNG、不 emit）；ok 的命令入日志（含 phaseCursor）。 */
  function dispatch(cmd: Command): CommandResult {
    const c = state.clock;
    const owner = COMMAND_OWNER[cmd.type];
    const sys = owner === undefined ? undefined : byId.get(owner);
    const handler = sys && !sys.stub ? (sys.commands as Record<string, unknown> | undefined)?.[cmd.type] : undefined;
    if (typeof handler !== 'function') return NOT_IMPLEMENTED_RESULT;
    const res = inside(-1, () => (handler as CommandHandler)(ctx, cmd));
    if (res.ok) log.push(c.age, c.phaseCursor, cmd);
    return res;
  }

  /** 丢弃运行期缓冲（newCity / 读档前）。 */
  const resetRuntime = (): void => {
    writer.reset(); dirty.clear(); buffer.clear(); log.clear();
    thingsAccum.ms = 0; disasterAccum.ms = 0;
  };

  function newCity(p: NewCityParams): void {
    resetCityStateInPlace(state);
    resetRuntime(); diag.length = 0; timers.clear();
    prng.seed(p.seed);
    for (const s of systems) inside(-1, () => s.init(ctx, p));
    recountFromLayers(state, opts.catalogue);          // init 可能直接写层（地形生成）；counts 必须与 xbld 全量一致（ARCHITECTURE §3.5）
    dirty.markBulk('all');
  }

  const deps: SaveLoadDeps = {
    state, ctx, byId, codec, catalogue: opts.catalogue, inside, resetRuntime,
    markAllDirty: () => dirty.markBulk('all'),
  };

  const host: SimHost = {
    state, q, catalogue: opts.catalogue, dirty, systems,
    advance, dispatch,
    modalOpened() { state.clock.modalPause++; },
    modalClosed() {
      const c = state.clock;
      if (c.modalPause > 0) c.modalPause--;
      if (c.modalPause === 0 && c.phaseCursor > 0) advanceDay();   // 续跑当天剩余阶段 + endOfDay（可能再次挂起）
    },
    drainEvents() { return buffer.drain(); },
    hash(scope: HashScope) { return codec.hash(state, scope); },
    commandLog() { return log.entries(); },
    newCity,
    saveSnapshot() { return saveSnapshotOf(deps); },
    loadSnapshot(bytes: Uint8Array) { return loadSnapshotInto(deps, bytes); },
    importSc2(doc: Sc2Document) { return importCity(deps, doc); },
    exportSc2(o?: Sc2ExportOptions) { return exportCity(deps, o); },
    phaseTimings() {
      const out = {} as Record<PhaseId, { count: number; p95Ms: number }>;
      for (const id of Object.keys(PHASE_OWNER) as PhaseId[]) { const t = timers.get(id); out[id] = { count: t?.count ?? 0, p95Ms: t?.p95() ?? 0 }; }
      return out;
    },
  };
  const internals: SimInternals = {
    stepDay(now?: () => number): 'done' | 'suspended' {
      if (state.clock.modalPause > 0) throw new Error('stepDay: 挂起中（modalPause > 0），请先 modalClosed()');
      if (now) nowFn = now;
      return advanceDay();
    },
    settleTicks(): boolean {
      const c = state.clock;
      if (c.modalPause > 0) return false;
      if (c.mode === CityMode.Disaster) {
        for (let k = 0; k < tune.maxTicksPerFrame; k++) { runTick(true); if (c.mode !== CityMode.Disaster || c.modalPause > 0) break; }
        return true;
      }
      if (!disasterPending()) return false;
      runTick(false);
      return c.mode !== CityMode.City || c.modalPause > 0;   // 无人消费 pending（events 为桩 / 前置不满足）→ 照常推进日历
    },
    reconcileCounts: () => reconcileCounts(state, opts.catalogue, diag, 'reconcileCounts'),
  };
  bindHostInternals(host, ctx, internals);
  return host;
};

/** 契约 ReplayFn（ARCHITECTURE §5.6）：新城 → 按日志重放到 untilAge；编解码器取自同一 opts.snapshot。驱动器见 replay.ts。 */
export const replay: ReplayFn = (opts, params, log, untilAge) => {
  const host = createSim(opts);
  host.newCity(params);
  replayInto(host, log, untilAge);
  return host;
};

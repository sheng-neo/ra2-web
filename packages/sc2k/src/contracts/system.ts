// ===== system.ts =====
// 系统接口与模拟上下文（CONTRACTS §H）。
import type { CityState } from './state';
import type { Prng } from './prng';
import type { PhaseId } from './clock';
import type { Queries } from './queries';
import type { Actions } from './actions';
import type { Command, CommandResult, ModalId } from './commands';
import type { SimEvent } from './events';
import type { CatalogueApi } from './catalogue';
import type { Sc2Document } from './io';
import type { SnapshotCodec } from './snapshot';

export type SystemId = 'core' | 'terrain' | 'placement' | 'utilities' | 'zones' | 'transport' | 'services' | 'economy' | 'events';
export interface Diagnostic { level: 'info' | 'warn' | 'error'; code: string; message: string; at?: string }
/** 只读调参输入（与 state.priv 同样按 SystemId 键，但语义完全不同：tuning 是输入、不持久化、不入哈希）。 */
export type TuningBag = Readonly<Partial<Record<SystemId, object>>>;

export interface SimContext {
  readonly state: CityState;
  readonly prng: Prng;                        // 唯一 sim 流；后备存储 = state.clock.prngState
  readonly tuning: TuningBag;
  readonly catalogue: CatalogueApi;           // 与 SimHost.catalogue 为同一对象
  readonly day: number;                       // 0..24；灾害 / 物件 tick 与命令处理中为 −1
  readonly events: SimEvent[];                // 当帧事件缓冲，app drain
  readonly diag: Diagnostic[];
  readonly q: Queries;
  readonly act: Actions;
}
/** 缓存：ctx → (id → { defaults, merged })；同一 ctx 同一 id 且 defaults 同一对象时直接复用。 */
const tuningCache = new WeakMap<SimContext, Map<SystemId, { defaults: object; merged: object }>>();
/**
 * 浅合并：ctx.tuning[id] 覆盖 defaults；结果按 id 缓存于 ctx（WeakMap，不污染 ctx 字段）。契约不认识任何模块的 Tuning 类型。
 * 返回对象被浅冻结（tuning 是只读输入）；defaults 换成另一个对象时重新合并并替换缓存。
 */
export function getTuning<T extends object>(ctx: SimContext, id: SystemId, defaults: T): T {
  let perCtx = tuningCache.get(ctx);
  if (!perCtx) { perCtx = new Map(); tuningCache.set(ctx, perCtx); }
  const hit = perCtx.get(id);
  if (hit && hit.defaults === defaults) return hit.merged as T;
  const merged = Object.freeze({ ...defaults, ...(ctx.tuning[id] ?? {}) }) as T;
  perCtx.set(id, { defaults, merged });
  return merged;
}

export type PhaseResult = 'done' | 'suspend';
export type PhaseRunner = (ctx: SimContext, day: number) => PhaseResult;
export type CommandHandler<C extends Command = Command> = (ctx: SimContext, cmd: C) => CommandResult;
export type PostLoadSource = 'snapshot' | 'sc2';

export interface NewCityParams {
  name: string; mayor?: string; difficulty: 1 | 2 | 3; startYear: 1900 | 1950 | 2000 | 2050;
  seed: number;                               // sim 流种子
  terrainSeed: number;                        // terrain 流种子（与 sim 流无关）
  terrain: { coast: boolean; river: boolean; hills: number; water: number; trees: number };   // 0..47
}

/** 每个系统实现一个；app/wire.ts 把它们交给 createSim（按 SYSTEM_ORDER 排序，与传入顺序无关）。全部方法同步、无 I/O。 */
export interface System {
  readonly id: SystemId;
  readonly stub?: true;                                            // 桩系统标记；createSim 对 allowlist 之外的桩抛错
  readonly privVersion?: number;                                   // 声明 priv 的系统必填（≥1）；与 state.priv[id].v 比较
  readonly phases?: Partial<Record<PhaseId, PhaseRunner>>;        // 必须 ⊆ PHASE_OWNER 中标为本系统者
  growthVisit?(ctx: SimContext, x: number, y: number): void;      // core 按 GROWTH_VISIT_ORDER 调用（仅 transport / zones / services）
  disasterTick?(ctx: SimContext): void;                            // 灾害模式 tick（events）
  thingsTick?(ctx: SimContext): void;                              // 常驻物件 tick（events；两种模式都调；v1 只在此消费 disaster.pending → 启动灾害）
  /**
   * 日末钩子：core 在当日全部阶段完成（phaseCursor 归零）后、age++ 之前，按 SYSTEM_ORDER 调用 END_OF_DAY_IO 中声明了的系统；当日挂起时不调用，modalClosed() 续跑完剩余阶段后再调用（每天恰一次）。
   * utilities 在此 flush requestRescan 置的脏标志（电 / 水即时重扫，消费 PRNG）；zones 在此逐日推进 lot 计时器（不消费 PRNG）。determinism.test 把它纳入重放。
   */
  endOfDay?(ctx: SimContext): void;
  /** 模态回答：core 的 modalAnswer 处理者按 MODAL_OWNER[dialog] 转发到 systems[owner].onModalAnswer?.(ctx, dialog, answer)；owner 未实现时 core 记 diag 并忽略。 */
  onModalAnswer?(ctx: SimContext, dialog: ModalId, answer: number): void;
  readonly commands?: { [K in Command['type']]?: CommandHandler<Extract<Command, { type: K }>> };   // 键集合必须恰为 COMMAND_OWNER 归本系统者：越权注册 createSim 抛错，真系统缺一则 registry.test 失败
  readonly queries?: Partial<Queries>;                             // 只能填自己的键
  readonly actions?: Partial<Actions>;                             // 只能填 ACTION_OWNER 归自己的键
  init(ctx: SimContext, p: NewCityParams): void;                   // 新城（按 SYSTEM_ORDER 调用）
  importFrom?(ctx: SimContext, doc: Sc2Document, diag: Diagnostic[]): void;   // 读 .SC2（按 IMPORT_ORDER；快照不经此）
  exportTo?(ctx: SimContext, doc: Sc2Document): void;              // 写 .SC2（按 EXPORT_ORDER）
  /** 任一读档后重建闭包缓存（按 POSTLOAD_ORDER）。source='sc2' 允许不消费 PRNG 的电 / 水重扫与从真源推断 priv；source='snapshot' 不得重扫、不得消费 PRNG、不得改真源层。 */
  postLoad?(ctx: SimContext, source: PostLoadSource): void;
  onTilesChanged?(ctx: SimContext, tiles: ReadonlyArray<number>, kind: TileChangeKind): void;   // 阶段 / 命令末批量扇出
}
export type TileChangeKind = 'terrain' | 'building' | 'zone' | 'underground' | 'bit';

/**
 * 桩系统 nullSystem(id, profile?) 的实现在 src/app/stubs/null.ts（它需要桩 Queries / Actions，而 contracts 不得依赖上层）。
 * 语义：无阶段、无命令；queries / actions 取 app/stubs 的 'realistic' 桩（测试可换乐观 / 悲观）；stub: true。
 */

export interface CreateSimOptions {
  systems: readonly System[];
  catalogue: CatalogueApi;
  /**
   * 必填：快照编解码器（io/snapshot/index.ts 的 snapshotCodec）。sim/** 禁止 import io/**（ARCHITECTURE §2.2），所以由调用方注入：app/wire.ts、testkit.createTestContext、replay 的调用方。
   * SimHost.saveSnapshot / loadSnapshot / hash(scope) 与 testkit.hashOf 都经它实现；core 自身不持有第二套编码器。
   */
  snapshot: SnapshotCodec;
  tuning?: TuningBag;
  stubAllowlist: readonly SystemId[];       // 允许为桩的系统；其它桩 → 抛错（打标 v1-playable 时为 []）
  impeachMonthly?: boolean;                 // phaseApplies('solvency')
}

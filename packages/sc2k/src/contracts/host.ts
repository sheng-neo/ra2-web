// ===== host.ts =====
// UI / app 唯一需要知道的 sim 外形（CONTRACTS §R，core 实现）。createSim / replay 的实现体在 src/sim/core/index.ts；
// 这里只给同名类型别名 CreateSimFn / ReplayFn（declare function 在运行时不存在，误以值导入会得到 undefined）。
import type { CityState } from './state';
import type { Queries } from './queries';
import type { CatalogueApi } from './catalogue';
import type { Command, CommandResult, LoggedCommand } from './commands';
import type { SimEvent } from './events';
import type { NewCityParams, Diagnostic, CreateSimOptions, System } from './system';
import type { Sc2Document, Sc2ExportOptions } from './io';
import type { HashScope } from './snapshot';
import type { DirtyTracker } from './dirty';
import type { PhaseId } from './clock';

export interface AdvanceOptions { budgetMs?: number; maxDaysPerFrame?: number }
export interface SimHost {
  readonly state: Readonly<CityState>; readonly q: Queries; readonly catalogue: CatalogueApi; readonly dirty: DirtyTracker;
  readonly systems: readonly System[];                           // 已按 SYSTEM_ORDER 排序
  /** 每帧：按速度档把真实时间折成天数，逐天 advanceDay；超过 budgetMs 或遇挂起即停，余量带到下一帧；灾害 / 物件 tick 计入同一预算。now 由 app 注入。 */
  advance(dtMs: number, now: () => number, opts?: AdvanceOptions): { daysRun: number; suspended: boolean };
  dispatch(cmd: Command): CommandResult;                          // 只在 phaseCursor==0 或挂起期间执行；同步；写 commandLog。COMMAND_OWNER[cmd.type] 缺席 / 为桩 / 未实现 → 返回 NOT_IMPLEMENTED_RESULT（不写日志、不消费 PRNG）；modalAnswer 由 core 按 MODAL_OWNER 转发
  modalOpened(): void; modalClosed(): void;                       // modalPause ±1；归零且 phaseCursor>0 时续跑当天剩余阶段
  drainEvents(): SimEvent[];
  hash(scope: HashScope): number; commandLog(): readonly LoggedCommand[];
  newCity(p: NewCityParams): void;
  loadSnapshot(bytes: Uint8Array): Diagnostic[]; saveSnapshot(): Uint8Array;          // 经 CreateSimOptions.snapshot；挂起态允许保存（编码 phaseCursor）
  importSc2(doc: Sc2Document): Diagnostic[]; exportSc2(opts?: Sc2ExportOptions): Sc2Document;   // phaseCursor>0 时 export 抛错
  phaseTimings(): Readonly<Record<PhaseId, { count: number; p95Ms: number }>>;   // headless / debug 面板
}
/** core 实现；systems 任意顺序传入，内部按 SYSTEM_ORDER 排序并校验注册约束。 */
export type CreateSimFn = (opts: CreateSimOptions) => SimHost;
/** 重放：相同 seed + params + 日志 → 相同 hash('full')；日志中 phaseCursor>0 的命令在同一游标派发后自动 modalClosed()；endOfDay 与阶段一样被重放；编解码器取自同一 opts.snapshot。 */
export type ReplayFn = (opts: CreateSimOptions, params: NewCityParams, log: readonly LoggedCommand[], untilAge: number) => SimHost;

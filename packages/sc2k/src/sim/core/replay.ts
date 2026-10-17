// ===== sim/core/replay.ts =====
// 命令日志重放（ARCHITECTURE §5.6、CONTRACTS §R ReplayFn；契约入口 replay 在 createSim.ts，本文件是可复用的驱动器 replayInto）：
//  - 每天开始前（phaseCursor == 0、未挂起）派发该 age 下 phaseCursor == 0 的日志命令，再 stepDay()；
//  - 遇挂起（modalPause > 0）：派发该 (age, phaseCursor) 的命令（通常是 modalAnswer / 预算改动）再 modalClosed()，续跑当天剩余阶段 + endOfDay；
//  - 不可达的游标（本次没在该处挂起）的条目在 age 前进后作废跳过；日志里的 setSpeed 不影响推进（stepDay 不看速度档）。
//  - 物件 / 灾害 tick 按日边界的确定性约定跑（internals.settleTicks：pending → 一次物件 tick 启动灾害；灾害模式 → 逐 tick 到灾害结束），
//    与 advance 在 runDays / 浏览器下的衔接规则一致；tick 的真实时间节奏不进日志（open-questions #28：灾害中途的命令时序仍是 v2）。
import type { LoggedCommand } from '../../contracts/commands';
import type { SimHost } from '../../contracts/host';
import { sortLog } from './commandLog';
import { simContextOf, simInternalsOf } from './internals';
import { DEFAULT_CORE_TUNING } from './tuning';

export interface ReplayHooks {
  /** 注入给 stepDay 的时钟（记录阶段耗时用；默认恒 0）。 */
  now?: () => number;
  /** 每完成一天（age 已 ++）后回调。 */
  onDay?: (age: number) => void;
  /** 每次派发日志命令后回调（结果 ok 与否都回调）。 */
  onDispatch?: (entry: LoggedCommand, ok: boolean) => void;
}

/**
 * 在已 newCity / 已读档的 host 上重放日志直到 clock.age == untilAge；到达后再派发 (untilAge, 0) 的命令（原跑在最后一天之后派发的命令也算进去）。
 * 返回实际派发的条目数。推进停滞（模态关不掉 / 日历不动）时抛错。
 */
export function replayInto(host: SimHost, log: readonly LoggedCommand[], untilAge: number, hooks: ReplayHooks = {}): number {
  const internals = simInternalsOf(host);
  const sorted = sortLog(log);
  const c = host.state.clock;
  const tune = { ...DEFAULT_CORE_TUNING, ...(simContextOf(host).tuning.core ?? {}) };
  let k = 0, dispatched = 0;
  const dispatchAt = (age: number, cursor: number): void => {
    while (k < sorted.length && sorted[k]!.age < age) k++;                                   // 过期条目（不可达的游标）直接跳过
    while (k < sorted.length && sorted[k]!.age === age && sorted[k]!.phaseCursor === cursor) {
      const entry = sorted[k]!;
      const r = host.dispatch(entry.cmd);
      dispatched++;
      hooks.onDispatch?.(entry, r.ok);
      k++;
    }
  };
  let guard = 0;
  const guardMax = Math.max(0, untilAge - c.age) * tune.replayGuardPerDay + tune.replayGuardBase;
  while (c.age < untilAge) {
    if (c.modalPause > 0) {
      dispatchAt(c.age, c.phaseCursor);
      host.modalClosed();
    } else {
      if (c.phaseCursor === 0) dispatchAt(c.age, 0);
      if (c.phaseCursor === 0 && internals.settleTicks()) { /* 启动 / 推进了灾害 tick（可能已弹出模态）：回到循环顶 */ }
      else {
        const before = c.age;
        internals.stepDay(hooks.now);
        if (c.age !== before) hooks.onDay?.(c.age);
      }
    }
    if (++guard > guardMax) throw new Error(`replay: 推进停滞（age ${c.age}/${untilAge}，mode ${c.mode}，modalPause ${c.modalPause}，phaseCursor ${c.phaseCursor}）`);
  }
  if (c.modalPause === 0 && c.phaseCursor === 0) dispatchAt(c.age, 0);
  return dispatched;
}

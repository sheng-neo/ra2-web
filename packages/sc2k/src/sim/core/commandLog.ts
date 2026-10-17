// ===== sim/core/commandLog.ts =====
// 命令日志（ARCHITECTURE §5.5 / §5.6、CONTRACTS §K LoggedCommand）：只记录 ok 的命令；phaseCursor = 派发时 clock.phaseCursor
// （0 = 两天之间；>0 = 挂起期间），seq 单调递增；重放据 (age, phaseCursor, seq) 在同一游标重新派发。
// clear() 换一个新数组而不是截断旧数组：调用方此前经 commandLog() 拿到的引用在 newCity / 读档后仍保持原内容（重放用）。
import type { Command, LoggedCommand } from '../../contracts/commands';

export interface CommandLog {
  /** 当前日志（只读视图；同一轮次内为同一引用，clear() 后换新数组）。 */
  entries(): readonly LoggedCommand[];
  readonly length: number;
  /** 追加一条（ok 的命令才调用）；返回写入的条目。 */
  push(age: number, phaseCursor: number, cmd: Command): LoggedCommand;
  /** 新一轮（newCity / 读档）：seq 归零、换新数组。 */
  clear(): void;
}

export function createCommandLog(): CommandLog {
  let list: LoggedCommand[] = [];
  let seq = 0;
  return {
    entries(): readonly LoggedCommand[] { return list; },
    get length(): number { return list.length; },
    push(age: number, phaseCursor: number, cmd: Command): LoggedCommand {
      const entry: LoggedCommand = { age, phaseCursor, seq: seq++, cmd };
      list.push(entry);
      return entry;
    },
    clear(): void { list = []; seq = 0; },
  };
}

/** 按重放顺序排序（age → phaseCursor → seq）的拷贝。 */
export function sortLog(log: readonly LoggedCommand[]): LoggedCommand[] {
  return log.slice().sort((a, b) => a.age - b.age || a.phaseCursor - b.phaseCursor || a.seq - b.seq);
}

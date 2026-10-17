// ===== sim/core/eventBuffer.ts =====
// EventBuffer（ARCHITECTURE §5.7）：阶段 / 命令 / tick 把 SimEvent push 进 ctx.events，app 每帧 drainEvents() 取走。
// ctx.events 必须始终是同一个数组引用（TileWriter.emit 与各系统都持有它），所以清空 / 封顶一律就地操作。
import type { SimEvent } from '../../contracts/events';
import type { Diagnostic } from '../../contracts/system';

export interface EventBuffer {
  /** 同一数组引用：即 SimContext.events。 */
  readonly events: SimEvent[];
  readonly length: number;
  /** 取走全部并清空（返回新数组）。 */
  drain(): SimEvent[];
  /** 就地清空（newCity / 读档）。 */
  clear(): void;
  /** 超过 cap 时丢弃最旧条目；首次溢出记一条 warn 诊断。返回本次丢弃条数。 */
  trim(cap: number, diag: Diagnostic[]): number;
}

export function createEventBuffer(): EventBuffer {
  const events: SimEvent[] = [];
  let warned = false;
  return {
    events,
    get length(): number { return events.length; },
    drain(): SimEvent[] { return events.splice(0, events.length); },
    clear(): void { events.length = 0; warned = false; },
    trim(cap: number, diag: Diagnostic[]): number {
      const over = events.length - cap;
      if (over <= 0) return 0;
      events.splice(0, over);
      if (!warned) {
        warned = true;
        diag.push({ level: 'warn', code: 'core.eventOverflow', message: `事件缓冲超过 ${cap} 条未被 drain，已丢弃最旧 ${over} 条（之后不再重复提示）` });
      }
      return over;
    },
  };
}

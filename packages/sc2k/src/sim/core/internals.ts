// ===== sim/core/internals.ts =====
// host → 内部句柄的侧通道（SimHost 契约只暴露 UI 需要的外形）：ctx（testkit.createTestContext / tools 用）与 SimInternals
// （replay / runScript / headless 用：不经速度档与真实时间直接逐天推进，并可注入 now 以记录阶段耗时）。WeakMap 不污染 host 对象。
import type { SimHost } from '../../contracts/host';
import type { SimContext } from '../../contracts/system';

export interface SimInternals {
  /**
   * 直接跑完"当天剩余阶段 + endOfDay"（忽略 speed / accumMs / 预算；不跑物件 tick）。
   * modalPause > 0 时抛错（调用方应先 dispatch 该游标的命令再 modalClosed()）。返回 'suspended' 表示本次又挂起。
   */
  stepDay(now?: () => number): 'done' | 'suspended';
  /**
   * 日边界的确定性 tick 约定（contract-rfc WP13-6 / open-questions #28；replay / runScript / headless 用，runDays 经 advance 得到同一序列）：
   *  - 城市模式且 disaster.pending 非空：跑一次物件 tick 让状态机启动灾害（无人消费时视为无事发生）；
   *  - 灾害模式：连续跑灾害 tick（每次最多 maxTicksPerFrame 个），直到回到城市模式或弹出模态。
   * 返回 true 表示本次跑了 tick 且调用方应回到循环顶（可能已挂起 / 已切模式），false 表示可以推进日历。modalPause > 0 时恒 false。
   */
  settleTicks(): boolean;
  /** 把当前 counts 与 xbld 全量对账；不一致时重算并记 diag，返回是否一致。 */
  reconcileCounts(): boolean;
}

const CONTEXTS = new WeakMap<SimHost, SimContext>();
const INTERNALS = new WeakMap<SimHost, SimInternals>();

export function bindHostInternals(host: SimHost, ctx: SimContext, internals: SimInternals): void {
  CONTEXTS.set(host, ctx);
  INTERNALS.set(host, internals);
}
export function simContextOf(host: SimHost): SimContext {
  const ctx = CONTEXTS.get(host);
  if (!ctx) throw new Error('simContextOf: 该 host 不是 createSim 创建的');
  return ctx;
}
export function simInternalsOf(host: SimHost): SimInternals {
  const i = INTERNALS.get(host);
  if (!i) throw new Error('simInternalsOf: 该 host 不是 createSim 创建的');
  return i;
}

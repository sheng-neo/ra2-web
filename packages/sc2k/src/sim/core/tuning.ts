// ===== sim/core/tuning.ts =====
// 调度内核的可调参数（WORKPLAN §2.2 的 tuning.ts 约定；ARCHITECTURE §5.2 预算切片、open-questions #21 诊断封顶）。
// 全部为"运行期上限 / 容量"类参数，不进哈希、不持久化；app 经 CreateSimOptions.tuning.core 覆盖。
export interface CoreTuning {
  /** ctx.diag 的条数封顶：超出时丢弃最旧条目（open-questions #21：长跑时 info 级诊断不再无限累积）。 */
  diagCap: number;
  /** ctx.events 未被 drain 时的条数封顶（无头长跑不 drain 也不会撑爆内存）；丢弃最旧并记一次 diag。 */
  eventCap: number;
  /** 每帧灾害 / 物件 tick 的硬顶（预算之外的保险，避免超大 dtMs 旋死）。 */
  maxTicksPerFrame: number;
  /** phaseTimings 的 p95 样本环大小（取最近 N 次）。 */
  timingSamples: number;
  /** 重放 / runScript 的停滞保护：允许的最大循环次数 = untilAge × replayGuardPerDay + replayGuardBase。 */
  replayGuardPerDay: number;
  replayGuardBase: number;
}
export const DEFAULT_CORE_TUNING: CoreTuning = {
  diagCap: 512,
  eventCap: 8192,
  maxTicksPerFrame: 40,
  timingSamples: 256,
  replayGuardPerDay: 64,
  replayGuardBase: 1024,
};

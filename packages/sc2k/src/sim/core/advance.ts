// ===== sim/core/advance.ts =====
// 预算切片的纯算术（ARCHITECTURE §5.2）：把真实时间按速度档折成待跑天数、把没跑完的天数折回余量。
// 与状态无关的部分独立成纯函数，便于 advance.test 单测；clock.accumMs 不入哈希，所以切片方式不影响天数序列与状态。
import { MS_PER_DAY } from '../../contracts/clock';
import type { ClockState } from '../../contracts/state';

/**
 * 本帧待跑天数：speed 5（MS_PER_DAY = 0）→ 直接给硬顶 maxDays（不累计余量）；
 * 其它档 → accumMs += dt，pending = min(maxDays, floor(accumMs / msPerDay))，并从 accumMs 扣除已折算的天数，剩余积压封顶 maxDays × msPerDay。
 * 暂停（Infinity）→ 0 且不累计。
 */
export function planDays(clock: ClockState, dtMs: number, maxDays: number): number {
  const msPerDay = MS_PER_DAY[clock.speed];
  if (msPerDay === 0) return maxDays;
  if (!Number.isFinite(msPerDay)) return 0;
  clock.accumMs += Math.max(0, dtMs);
  const pending = Math.min(maxDays, Math.floor(clock.accumMs / msPerDay));
  clock.accumMs -= pending * msPerDay;
  // 积压封顶一个硬顶（ARCHITECTURE §5.2 "封顶防螺旋"：后台标签页回到前台时最多再补一帧硬顶，而不是追几千天）
  clock.accumMs = Math.min(clock.accumMs, maxDays * msPerDay);
  return pending;
}

/**
 * 预算 / 挂起导致没跑完的 pending 天折回 accumMs，封顶 maxDays × msPerDay 防螺旋（下一帧最多补回一个硬顶）。
 * speed 5 不折回（它每帧本来就取硬顶）。
 */
export function carryBack(clock: ClockState, pending: number, maxDays: number): void {
  if (pending <= 0) return;
  const msPerDay = MS_PER_DAY[clock.speed];
  if (msPerDay === 0 || !Number.isFinite(msPerDay)) return;
  clock.accumMs = Math.min(clock.accumMs + pending * msPerDay, maxDays * msPerDay);
}

/** 物件 / 灾害 tick 的余量折算：返回本帧应跑的 tick 数（≤ maxTicks），并把余量封顶到一个 tick 以内。 */
export function planTicks(accum: { ms: number }, dtMs: number, tickMs: number, maxTicks: number): number {
  if (!Number.isFinite(tickMs) || tickMs <= 0) { accum.ms = 0; return 0; }
  accum.ms += Math.max(0, dtMs);
  let n = 0;
  while (accum.ms >= tickMs && n < maxTicks) { accum.ms -= tickMs; n++; }
  accum.ms = Math.min(accum.ms, tickMs);
  return n;
}

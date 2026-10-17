// ===== testkit/replay.ts =====（WORKPLAN WP1：testkit 侧的重放 / 脚本驱动辅助）
// sim/core 的 replayInto 是通用驱动器；这里给测试两种便捷入口：
//  - runScript(host, commands, untilAge)：在任意 host 上按日志派发并逐天推进（不看速度档、不跑物件 tick）。
//  - replayInContext(log, untilAge, opts)：用与 createTestContext 完全相同的夹具（平地 / 城市模式 / 桩 profile）重放一份日志，
//    用于 determinism.test 的"重放 = 原跑"（直接用 sim/core.replay 会少掉 createTestContext 的铺平地形步骤，哈希对不上）。
import type { LoggedCommand } from '../contracts/commands';
import type { SimHost } from '../contracts/host';
import type { GoldenMiniCity, TestContext, TestContextOptions } from '../contracts/testkit';
import { replayInto } from '../sim/core';
import type { ReplayHooks } from '../sim/core';
import { createTestContext } from './context';

/** 在已 newCity 的 host 上重放 / 执行脚本直到 age == untilAge；返回派发条数。 */
export function runScript(host: SimHost, commands: readonly LoggedCommand[], untilAge: number, hooks?: ReplayHooks): number {
  return replayInto(host, commands, untilAge, hooks);
}

/** createTestContext(opts) + runScript：opts.params 若未给 seed / 名字则沿用 DEFAULT_TEST_PARAMS。 */
export function replayInContext(log: readonly LoggedCommand[], untilAge: number, opts: TestContextOptions = {}): TestContext {
  const tc = createTestContext(opts);
  runScript(tc.host, log, untilAge);
  return tc;
}

/** 金城脚本跑进测试上下文：params 取脚本自带（可被 opts.params / opts.seed 覆盖），城市模式下 terrainDone 被拒绝属正常（不入日志）。 */
export function replayScript(script: GoldenMiniCity, untilAge: number, opts: TestContextOptions = {}): TestContext {
  return replayInContext(script.commands, untilAge, { ...opts, params: { ...script.params, ...opts.params } });
}

// ===== testkit/index.ts =====（CONTRACTS §U；只允许测试与 tools/ import）
// WP0：createTestContext / runDays / hashOf / 三套桩 / BUILTIN_PROCEDURAL_STUB。
// goldenMiniCity / pngOf 由 WP1 在 T+3 补齐（src/testkit/{goldenMiniCity,replay,png}.ts），此处为抛错占位以满足 TestkitEntry 对账。
import type { GoldenMiniCityFn, PngOfFn, TestkitEntry } from '../contracts/testkit';
import { createTestContext, runDays } from './context';
import { hashOf } from './hash';
import { BUILTIN_PROCEDURAL_STUB, stubActions, stubQueries } from './stubs';

export { createTestContext, runDays, flattenTerrain, DEFAULT_TEST_PARAMS, FLAT_ALT } from './context';
export { hashOf } from './hash';
export { stubQueries, stubActions, BUILTIN_PROCEDURAL_STUB, nullSystem } from './stubs';
export { simContextOf } from '../sim/core';

/** WP1 占位：迷你金城命令脚本。 */
export const goldenMiniCity: GoldenMiniCityFn = () => { throw new Error('notImplemented: goldenMiniCity 由 WP1 提供（src/testkit/goldenMiniCity.ts）'); };
/** WP1 占位：像素快照辅助。 */
export const pngOf: PngOfFn = () => { throw new Error('notImplemented: pngOf 由 WP1 提供（src/testkit/png.ts）'); };

// 与 contracts/testkit.ts 的 TestkitEntry 对账（类型层）。
({ stubQueries, stubActions, createTestContext, runDays, hashOf, goldenMiniCity, pngOf, BUILTIN_PROCEDURAL_STUB }) satisfies TestkitEntry;

// ===== testkit/index.ts =====（CONTRACTS §U；只允许测试与 tools/ import）
// WP0：createTestContext / runDays / hashOf / 三套桩 / BUILTIN_PROCEDURAL_STUB。
// WP1：goldenMiniCity（含 noPower / noRoad）、pngOf、runScript / replayInContext / replayScript、checkInvariants、runHeadless。
import type { TestkitEntry } from '../contracts/testkit';
import { createTestContext, runDays } from './context';
import { goldenMiniCity } from './goldenMiniCity';
import { hashOf } from './hash';
import { pngOf } from './png';
import { BUILTIN_PROCEDURAL_STUB, stubActions, stubQueries } from './stubs';

export { createTestContext, runDays, flattenTerrain, DEFAULT_TEST_PARAMS, FLAT_ALT } from './context';
export { hashOf } from './hash';
export { stubQueries, stubActions, BUILTIN_PROCEDURAL_STUB, nullSystem } from './stubs';
export { simContextOf, simInternalsOf } from '../sim/core';
export { goldenMiniCity, GOLDEN_IDS, GOLDEN_LAYOUT, GOLDEN_PARAMS, forEachGoldenRectTile } from './goldenMiniCity';
export type { GoldenRect } from './goldenMiniCity';
export { pngOf, bitmapHash, isMonochrome } from './png';
export { runScript, replayInContext, replayScript } from './replay';
export { checkInvariants, checkPopulation, MIN_FUNDS } from './invariants';
export type { PopulationSample } from './invariants';
export { runHeadless, countRunTrips, DAYS_PER_YEAR } from './headless';
export type { YearRecord, HeadlessOptions } from './headless';

// 与 contracts/testkit.ts 的 TestkitEntry 对账（类型层）。
({ stubQueries, stubActions, createTestContext, runDays, hashOf, goldenMiniCity, pngOf, BUILTIN_PROCEDURAL_STUB }) satisfies TestkitEntry;

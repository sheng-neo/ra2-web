// ===== sim/core/index.ts =====（CONTRACTS §V：SimCoreEntry = { createCoreSystem, createSim, replay }）
import type { SimCoreEntry } from '../../contracts/entrypoints';
import { createCoreSystem } from './coreSystem';
import { createSim, replay } from './createSim';

export { createCoreSystem } from './coreSystem';
export { createSim, replay, sortAndValidateSystems } from './createSim';
export { simContextOf, simInternalsOf } from './internals';
export type { SimInternals } from './internals';
export { replayInto } from './replay';
export type { ReplayHooks } from './replay';
export { QUERY_OWNER } from '../../contracts/queries';   // 单一真源在 contracts；此处转发以兼容旧 import
export { createTileWriter, TILE_CHANGE_KINDS, MAX_FANOUT_ROUNDS } from './tileWriter';
export type { TileWriter, CoreActions } from './tileWriter';
export { createDirtyTracker } from './dirtyTracker';
export { resetCityStateInPlace, recountFromLayers, blankSc2Document } from './stateOps';
export { createEventBuffer } from './eventBuffer';
export type { EventBuffer } from './eventBuffer';
export { createCommandLog, sortLog } from './commandLog';
export type { CommandLog } from './commandLog';
export { planDays, carryBack, planTicks } from './advance';
export { importCity, exportCity, loadSnapshotInto, saveSnapshotOf, applyCompat, reconcileCounts, postLoadAll } from './saveload';
export type { SaveLoadDeps } from './saveload';
export { DEFAULT_CORE_TUNING } from './tuning';
export type { CoreTuning } from './tuning';

// 与 contracts/entrypoints.ts 的 SimCoreEntry 对账（类型层）。
({ createCoreSystem, createSim, replay }) satisfies SimCoreEntry;

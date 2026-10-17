// ===== entrypoints.ts =====（只有类型；实现体在各目录 index.ts）
// 模块入口（CONTRACTS §V）：WP0 的转发桩、各 WP 的真实现、app/wire.ts 与 app/boot.ts 三方都只认这里的名字与签名；
// 每个 index.ts 以 `satisfies` 对账（例：`export const sc2Codec = {...} satisfies Sc2Entry['sc2Codec']`，或 `import * as m from '../render'; m satisfies RenderEntry`）。
// 依赖 DOM 的三个入口 RenderEntry / AssetsEntry / UiEntry（与 ShellOptions / ShellHandle / WindowId / Sc2kDebugHandle）在 ./shell.ts。
import type { System } from './system';
import type { CreateSimFn, ReplayFn } from './host';
import type { SpriteProvider, WorkerLike } from './render';
import type { Sc2Codec } from './io';
import type { SnapshotCodec } from './snapshot';
import type { AudioSink } from './audio';
import type { Strings } from './strings';
import type { CatalogueApi } from './catalogue';

export type SystemFactory = () => System;
/** sim/core/index.ts：createCoreSystem、createSim、replay（WP0 最小调度 → WP1）。 */
export interface SimCoreEntry { createCoreSystem: SystemFactory; createSim: CreateSimFn; replay: ReplayFn }
/** sim/<id>/index.ts ×8（WP0 为 nullSystem(id) 转发 → WP2–WP8、WP13）。 */
export interface SimEntries {
  createTerrainSystem: SystemFactory; createPlacementSystem: SystemFactory; createUtilitiesSystem: SystemFactory; createZonesSystem: SystemFactory;
  createTransportSystem: SystemFactory; createServicesSystem: SystemFactory; createEconomySystem: SystemFactory; createEventsSystem: SystemFactory;
}
/** art/index.ts（WP9；WP0 为洋红菱形 stubProvider）。 */
export interface ArtEntry { createProceduralProvider(): SpriteProvider; createProceduralProviderAsync?(worker: WorkerLike): Promise<SpriteProvider> }
/** io/sc2/index.ts（WP2；WP0 的 readSc2 / writeSc2 抛 Error('notImplemented')，newDocument() 全零）。 */
export interface Sc2Entry { sc2Codec: Sc2Codec }
/** io/snapshot/index.ts（WP0 最小实现 → WP1）。 */
export interface SnapshotEntry { snapshotCodec: SnapshotCodec }
/** audio/index.ts（WP12；v1 静默）。 */
export interface AudioEntry { createAudioSink(): AudioSink }
/** data/index.ts（WP0 生成 / 手写，冻结）。 */
export interface DataEntry { CATALOGUE: CatalogueApi; createStrings(lang: 'zh' | 'en'): Strings }

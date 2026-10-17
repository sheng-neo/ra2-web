// ===== testkit.ts =====
// 测试工具的契约面（CONTRACTS §U）：实现在 src/testkit/**，只允许测试与 tools/ import。
// 本文件只有类型：原 declare function / declare const 一律改为同名类型别名（*Fn / BuiltinProceduralStub），src/testkit/index.ts 以 `satisfies TestkitEntry` 对账。
import type { CityState } from './state';
import type { SimContext, System, NewCityParams, SystemId } from './system';
import type { Queries } from './queries';
import type { Actions } from './actions';
import type { SimHost } from './host';
import type { LoggedCommand } from './commands';
import type { CatalogueApi } from './catalogue';
import type { SceneItem, SpriteProvider, ArtScale } from './render';
import type { SnapshotCodec, HashScope } from './snapshot';

export type StubProfile = 'optimistic' | 'pessimistic' | 'realistic';
/** 乐观：hasPower/hasAccess/invented → true，runTrip → ok，landValue → 128，天气 Clear。悲观：全部 false / fail / 0。现实：科技 year ≥ base+10；hasAccess 查 24 偏移；hasPower 查 XBIT 自身或 4 邻；runTrip = hasAccess；pieceFor 简单选形。三套共同：news.currentPaper → null、stories → []；bridgeOptions → v1 集合（Causeway / Rail / Wire）；disasters.markers → 全零。 */
export type StubQueriesFn = (profile: StubProfile, state: CityState, catalogue: CatalogueApi) => Queries;
/** 非 core 的 Actions 子集（core 的 set* / layerChanged / emit 由真实 TileWriter 提供）。 */
export type StubActions = Pick<Actions, 'charge' | 'destroyStructure' | 'news' | 'addTraffic' | 'allocMicrosim' | 'freeMicrosim' | 'requestRescan' | 'markAccessDirty'>;
export type StubActionsFn = (state: CityState) => StubActions;
export interface TestContextOptions { profile?: StubProfile; seed?: number; systems?: readonly System[]; params?: Partial<NewCityParams>; tuning?: Partial<Record<SystemId, object>>; flat?: boolean /*全平地 alt=4 无水，默认 true*/; snapshot?: SnapshotCodec /*默认 io/snapshot/index.ts 的 snapshotCodec；testkit 可 import io/**（sim/** 不可）*/ }
export interface TestContext { ctx: SimContext; host: SimHost; state: CityState }
/** 空城 ctx（真实 TileWriter + DirtyTracker + 桩 Queries/Actions）；systems 给出的系统覆盖对应桩；内部 createSim({ ..., snapshot: opts.snapshot ?? snapshotCodec }) —— 与 wire.ts 同一注入点。 */
export type CreateTestContextFn = (opts?: TestContextOptions) => TestContext;
/** 无预算限制地推进；遇挂起自动 modalClosed。 */
export type RunDaysFn = (host: SimHost, days: number) => void;
/** = snapshotCodec.hash(state, scope ?? 'full')，同一注入的编解码器。 */
export type HashOfFn = (state: CityState, scope?: HashScope) => number;
export type GoldenMiniCityVariant = 'full' | 'noPower' | 'noRoad';
export interface GoldenMiniCity { params: NewCityParams; commands: readonly LoggedCommand[] }
/** 迷你金城：煤电 + 电线 + R/C/I 分区 + 道路 + 水泵管线的命令脚本；含反例段 'noPower'（移除电线后 2 个月无施工瓦片）。 */
export type GoldenMiniCityFn = (variant?: GoldenMiniCityVariant) => GoldenMiniCity;
export interface PngResult { png: Uint8Array; hash: number }
/** 像素快照辅助：编译 + CPU 合成 + PNG 字节与 FNV 哈希。 */
export type PngOfFn = (items: readonly SceneItem[], provider: SpriteProvider, scale: ArtScale, rect: { x: number; y: number; w: number; h: number }) => PngResult;
/** 洋红占位 provider（WP0），任何 key 返回同一菱形。 */
export type BuiltinProceduralStub = SpriteProvider;
/** src/testkit/index.ts 的出口全集（`import * as t from '../testkit'; t satisfies TestkitEntry`）。 */
export interface TestkitEntry {
  stubQueries: StubQueriesFn; stubActions: StubActionsFn; createTestContext: CreateTestContextFn; runDays: RunDaysFn; hashOf: HashOfFn;
  goldenMiniCity: GoldenMiniCityFn; pngOf: PngOfFn; BUILTIN_PROCEDURAL_STUB: BuiltinProceduralStub;
}

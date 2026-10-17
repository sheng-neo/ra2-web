// ===== queries.ts =====
// 跨系统只读查询（CONTRACTS §I）：实现者 = owner；缺席时由 app/stubs 的桩提供。全部纯 / 同步；只有 runTrip 允许消费 PRNG。
import type { ZoneCode, XterClass } from './grid';
import type { NetFamily, StationKind, BridgeKind } from './net';
import type { BudgetLine, OrdinanceId, PowerReport, WaterReport, TrafficReport, TaxRates, Bond, WeatherState } from './state';
import type { TechKey, ToolId } from './catalogue';
import type { Command, RejectReason, PlacementPreview } from './commands';
import type { SystemId } from './system';

export interface TerrainQuery {                                   // owner: terrain
  alt(i: number): number; slope(i: number): number;               // slope: xter & 0x0F（0x3E 瀑布 → 13；0x3X 浅水 / 0x4X 水下的低 nibble 是形状码 → 0；contract-rfc WP2-2）
  xterClass(i: number): XterClass;
  isWater(i: number): boolean; isSalt(i: number): boolean; isFlatDry(i: number): boolean;
  waterDepth(i: number): number;                                  // waterLevel − alt（无水 0）
  treeDensity(i: number): number;                                 // 0..7
  cornerHeights(i: number): [number, number, number, number];    // c00 c10 c01 c11
  distanceToWater(i: number): number;                             // Chebyshev，上限 8
  altitudeFeet(i: number): number;                                // alt*100+50
}
export interface PlantInfo { kind: string; anchor: number; ageYears: number; loadPct: number; nominalMW: number; expires: boolean }
export interface UtilityQuery {                                   // owner: utilities
  poweredSelf(i: number): boolean;                                // XBIT.POWERED(i)（断电计时用）
  hasPower(i: number): boolean;                                   // POWERED(i) || 任一 4 邻 POWERED（生长判定用）
  watered(i: number): boolean; piped(i: number): boolean;
  plantAt(i: number): PlantInfo | null;
  lastPower(): PowerReport; lastWater(): WaterReport;
}
export interface TripResult { ok: boolean; usedBus: boolean; usedRail: boolean; usedSubway: boolean; steps: number }
export interface StationInfo { kind: StationKind; id: number; anchor: number; n: 1 | 2 }
export interface TransportQuery {                                 // owner: transport
  hasAccess(x: number, y: number): boolean;                       // 24 偏移命中 ROAD_SET 或车站占地任一格
  /** 消费 PRNG、成功时经 act.addTraffic 写 XTRF；每格每月只许调用一次（zones 保证）。 */
  runTrip(i: number, zone: ZoneCode, popLevel: 0 | 1 | 2 | 3 | 4): TripResult;
  /**
   * 给出 (family, i) 在当前四邻与坡面下应写入的 XBLD/XUND 值（含交叉件）；非法（坡面不沿轴、非直角重叠）→ −1。
   * 桩默认：NET_BASE[family] + pieceIndexFor(四邻同族掩码)，不处理坡面与交叉件。
   */
  pieceFor(family: NetFamily, i: number): number;
  roadDistance(x: number, y: number): number;                     // 仅 UI：Chebyshev 距最近 ROAD_SET，>3 返回 4
  roadTileCounts(): { roadTiles: number; highwayTiles: number; bridgeTiles: number };
  connections(): { commerce: number; industry: number; total: number };
  stationAt(i: number): StationInfo | null;
  bridgeBlocksShips(i: number): boolean;
  /**
   * 桥型菜单与片段序列（spec:transport §2.6；n = 水面格数；纯函数、不消费 PRNG）。
   * options = 本族"长度表允许 ∩ 已实现"的桥型：道路长度表 n<5 仅 Causeway；5–6 +Raising；7–12 三种；>12 Causeway+Suspension；铁路 [Rail]；电线 [Wire]；高速 [HighwayLow, HighwayReinforced]。
   * v1 已实现 Causeway（0x58/0x57 交替）、Rail（0x5B/0x5A 交替）、Wire（0x5C）；Raising / Suspension / 高速两种 v2（v1 的 options 不列出、pieces 返回 null）。
   * pieces 返回沿行进方向的 XBLD 序列（长度 n；高速按 2×2 块给块序列）；placement 据此整段写入并按 n × 基价计费。桩：options 同 v1 集合，pieces 只给三者。
   */
  bridgeOptions(family: NetFamily | 'highway', n: number): readonly BridgeKind[];
  bridgePieces(kind: BridgeKind, family: NetFamily | 'highway', n: number): readonly number[] | null;
  railMask(i: number): number; subwayMask(i: number): number;     // T R B L 四位
  trafficAt(x: number, y: number): number;                        // 只读 XTRF 半格
}
export interface LotInfo { anchor: number; size: 1 | 2 | 3; level: 0 | 1 | 2 | 3 | 4; tier: 0 | 1 | 2; phase: 'construct' | 'built' | 'abandoned' }
export interface ZonesQuery {                                     // owner: zones
  lotAt(i: number): LotInfo | null;
  recreation(): { smallPark: number; bigPark: number; marina: number; zoo: number; stadium: number };
}
export interface QueryStat { key: string; value: string | number }   // key 为 strings 表键，UI 翻译
export interface MicrosimInfo { slot: number; tileId: number; stat0: number; stat1: number; stat2: number; stat3: number }
export interface ServicesQuery {                                  // owner: services
  structureCounts(): { police: number; prison: number; fire: number; hospital: number; school: number; college: number; busDepot: number };
  graphCurrent(s: 'pollution' | 'landValue' | 'crime'): number;
  cityCenter(): { x: number; y: number };
  landValue(i: number): number; pollution(i: number): number; crime(i: number): number;   // 半格值 0..255（渲染热力与 zones 用）
  microsimOf(i: number): MicrosimInfo | null;
  queryStats(i: number): ReadonlyArray<QueryStat>;
  seaportCranes(): number; airportRunwayGroups(): number; airportTiles(): number;
  trafficReport(): TrafficReport;
}
export interface BudgetRow { key: string; ytd: number; estimate: number; slider?: { value: number; min: number; max: number } }
export interface BudgetView { rows: BudgetRow[]; taxRate: TaxRates; funding: Uint8Array; autoBudget: boolean; funds: number; openingFunds: number; endOfYearFunds: number; advisors: ReadonlyArray<{ advisor: string; key: string }> }
export interface BondView { bonds: ReadonlyArray<Bond & { ratePctFloor: number; annual: number }>; count: number; avgRatePctFloor: number; sumRatePctFloor: number; nextRatePctFloor: number | null; rating: string; cityValueDollars: number; canIssue: boolean; canRepay: boolean }
export interface EconomyQuery {                                   // owner: economy
  canAfford(cost: number): boolean; funding(line: BudgetLine): number; ordinance(id: OrdinanceId): boolean; year(): number;
  budgetView(): BudgetView; bondView(): BondView;                 // 纯函数，不消费 PRNG（债券利率预览 jitter = 0）
  costOf(tool: ToolId, units: number): number;
}
export interface TechQuery { invented(key: TechKey): boolean }    // owner: events（桩：year >= TECH_BASE_YEAR[key] + 10）
export interface ThingView { slot: number; type: number; x: number; y: number; z: number; px: number; py: number; dir: number; variant: number; air: boolean }
export interface DisasterQuery {                                  // owner: events
  marker(i: number): number;                                      // TileMarker
  markers(): Readonly<Uint8Array>;                                // 16384 只读视图（渲染全量编译用；桩返回全零）
  focusPoints(): ReadonlyArray<{ x: number; y: number }>;
  thingsAt(i: number): ReadonlyArray<ThingView>; things(): ReadonlyArray<ThingView>;
  dispatchAvailable(kind: 0 | 1 | 2): number;
}
export interface NewsStoryView { type: number /*NewsType*/; value: number; power: number; monthIndex: number }
/** 一份报纸的版面数据：UI 按 strings 键 `news.<NewsType>.headline` / `.body` 渲染（WP0 预置 ≤ 20 条原创骨架），extra = 号外。 */
export interface PaperView { year: number; month: number; extra: boolean; headline: NewsStoryView | null; stories: ReadonlyArray<NewsStoryView>; weather: WeatherState }
export interface NewsQuery {                                      // owner: events（桩：currentPaper → null，stories → []）
  currentPaper(): PaperView | null;                               // 最近一次 paper 事件对应的版面；UI 打开 Newspaper 窗口 / newspaper·extraPaper 模态时读取
  stories(): ReadonlyArray<NewsStoryView>;                        // 当前事件池（按 power 降序）
}
export interface PlaceCheck { ok: boolean; reason?: RejectReason; cost: number }
export interface Availability { enabled: boolean; reason?: RejectReason }
export interface PlacementQuery {                                 // owner: placement
  canPlace(id: number, x: number, y: number): PlaceCheck;
  availability(toolId: ToolId): Availability;                     // 顺序：notImplemented → notInvented → ordinance → locked → funds
  preview(cmd: Command): PlacementPreview;                        // 纯函数，不消费 PRNG，不写状态
}
export interface Queries {
  terrain: TerrainQuery; utilities: UtilityQuery; transport: TransportQuery; zones: ZonesQuery; services: ServicesQuery;
  economy: EconomyQuery; tech: TechQuery; disasters: DisasterQuery; news: NewsQuery; placement: PlacementQuery;   // tech / disasters / news 三键同归 events
}
/** Queries 每个键的 owner（唯一真源；createSim 注册校验与 app/stubs 的 nullSystem 都从这里读）。tech / disasters / news 三键同归 events。 */
export const QUERY_OWNER: Readonly<Record<keyof Queries, SystemId>> = {
  terrain: 'terrain', utilities: 'utilities', transport: 'transport', zones: 'zones', services: 'services',
  economy: 'economy', tech: 'events', disasters: 'events', news: 'events', placement: 'placement',
};

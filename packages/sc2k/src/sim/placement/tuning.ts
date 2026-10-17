// ===== sim/placement/tuning.ts =====
// placement 的可调参数（spec:transport §2.4 / §2.6 桥价、§2.13 邻城连接费；spec:economy §3.6 / Q9 拆除口径；spec:terrain §2.11.4 桥头检查）。
// 凡 CATALOGUE（工具 / 建筑表）里有的价格一律从表读，这里只放表外的 [低] / [中] / [设计] 数值与开关。
import type { ToolId } from '../../contracts/catalogue';
import { BridgeKind } from '../../contracts/net';

export interface PlacementTuning {
  /** v1 工具白名单（app 经 tuning 注入 `V1_TOOL_IDS`）；null = 全部工具视为已实现（availability 不再给 notImplemented）。 */
  readonly v1Tools: ReadonlySet<ToolId> | null;
  /** 桥型单价（$ / 水面格；高速两种按 2×2 块计）：spec:terrain §2.11.4 表 [M]。 */
  readonly bridgeCostPerTile: Readonly<Record<BridgeKind, number>>;
  /** 邻城连接费（spec:transport §2.13 [M]）。 */
  readonly neighborConnectionCost: number;
  /** 拆除整栋：$1 × size²（spec:economy Q9 `demolishWholeStructure`）；false 时整栋仍一起拆但只收 $1。 */
  readonly demolishWholeStructure: boolean;
  /** 拆建筑（≥ 0x70）留瓦砾：平地 → 0x01..0x04，坡面 / 水面 → 空地（spec:terrain §2.11.1 [H]、spec:zones §2.2 表）。 */
  readonly rubbleOnDemolish: boolean;
  /** 车站 / 转换件的邻接要求（spec:transport §2.9.1 `requireStationAdjacency` [M]）。 */
  readonly requireAdjacency: boolean;
  /**
   * `allocMicrosim` 返回 −1 时是否以 `microsimFull` 拒绝独占微模拟建筑。真 services 满 140 座时返回 −1 是原版行为；
   * 但桩恒返回 −1，所以默认不拒绝（建筑照常放置、只是没有 XMIC 记录），集成真 services 后由 app 翻成 true。
   */
  readonly microsimFullRejects: boolean;
  /** 翻转族桥件（0x51–0x5C）"未翻转"精灵的轴向；沿另一轴铺设时置 `XBit.Flipped`（spec:ui-art §2.9.3：L–R 件的镜像就是 T–B 件）。 */
  readonly bridgeSpriteAxis: 'LR' | 'TB';
  /** 是否允许在水面下方铺地铁 / 管线（spec:transport Q11、spec:power-water §2.11 默认否）。 */
  readonly undergroundUnderWater: boolean;
}

export const DEFAULT_PLACEMENT_TUNING: PlacementTuning = {
  v1Tools: null,
  bridgeCostPerTile: {
    [BridgeKind.Causeway]: 25, [BridgeKind.Raising]: 50, [BridgeKind.Suspension]: 75, [BridgeKind.Rail]: 75,
    [BridgeKind.HighwayLow]: 100, [BridgeKind.HighwayReinforced]: 200, [BridgeKind.Wire]: 10,
  },
  neighborConnectionCost: 1000,
  demolishWholeStructure: true,
  rubbleOnDemolish: true,
  requireAdjacency: true,
  microsimFullRejects: false,
  bridgeSpriteAxis: 'TB',
  undergroundUnderWater: false,
};

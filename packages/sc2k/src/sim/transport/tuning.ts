// ===== sim/transport/tuning.ts =====（spec:transport §3.1 TransportTuning / §3.6 TrafficTuning / §5 待确认项）
// 交通系统全部可调数值：原版数值与 [L]/[M]/[设计] 建议值都在此，代码里不写魔法数。通过 getTuning(ctx, 'transport', DEFAULT_TRANSPORT_TUNING) 读取。
import { BridgeKind } from '../../contracts/net';

export interface TransportTuning {
  /** §2.9.1：车站占地边长（公交 / 火车 2×2 [H]，地铁站 1×1）；可调为 1 对照社区"1×1 车站"记忆。 */
  stationFootprint: { bus: 1 | 2; rail: 1 | 2; subway: 1 };
  /** §2.15 预算衰败总开关（关掉后 growthVisit 不掷骰、不消费 PRNG；集成期 economy 为桩时 funding 为 0 可用它兜底）。 */
  budgetDecay: boolean;
  /** §2.15：地铁段是否随 Subway 预算塌陷（帮助文本口径 true；社区指南称不影响）。 */
  subwayDecays: boolean;
  /** §2.15 Bridges 判定 `wind + rand(0..49) >= funding` 中的随机上界。 */
  bridgeDecayRoll: number;
  /** §2.6 桥长度表：开启桥 5–12、吊桥 ≥ 7（[M]）。 */
  raisingBridgeLen: { min: number; max: number };
  suspensionMinLen: number;
  /** 已实现的桥型集合（v1：堤道 / 铁路桥 / 高架电线）；bridgeOptions = 长度表允许 ∩ 本集合。 */
  implementedBridges: readonly BridgeKind[];
  /**
   * §4.7：BRIDGE_SET 连续区间含铁路桥 0x5A/0x5B 与高架电线 0x5C，原版汽车模式一视同仁。
   * carsCrossRailBridge = true 复刻"汽车沿铁路桥过河"；carsCrossWireBridge 默认 false（WORKPLAN WP6："电线桥不通行"），两者都为 true 即字面复刻。
   */
  carsCrossRailBridge: boolean;
  carsCrossWireBridge: boolean;
  // ---- 出行生成器（§2.12 / §3.6）----
  maxSteps: number;
  /** popLevel == 1 时预算 = maxSteps × num / den（原版 100 → 75）。 */
  lowDensityNumerator: number; lowDensityDenominator: number;
  stepRoad: number; stepWalk: number; stepRapid: number; stepTransfer: number; stepOnrampIn: number; stepOnrampOut: number;
  triesPerNode: number; stackLimit: number;
  /** §2.9.1 Q17：同一座车站占地内部移动的步数（0 = 评审建议值；4 = 逆向转移表字面值）。 */
  stationInteriorStep: number;
  /** §2.12.2 Q1：按起点分区码 0..15 索引的目的地掩码（bit = 目的地分区码）；下标 0 与 7..15 为 0（军事 / 机场 / 海港起点无出行）。 */
  destMask: readonly number[];
  /** §2.12.4：地铁↔铁路转换件是否允许乘客换乘（Q2）。 */
  allowSubRailTransfer: boolean;
  /** §2.12.4：步行者踩到交叉件 0x43–0x50 一律按"过桥直行"处理（原版粗分类）；false 按 ROAD 的细分规则。 */
  walkCrossoverAsBridge: boolean;
  /** §4.8：XUND 0x22 导弹井被当作地铁可通行（原版怪癖）。 */
  missileSiloIsSubway: boolean;
  /** §2.12.7 Q5：轻 / 重交通叠加精灵的显示阈值（渲染读 trafficAt 后自行比较；本模块只保存数值）。 */
  lightLevel: number; heavyLevel: number;
}

export const DEFAULT_TRANSPORT_TUNING: TransportTuning = Object.freeze({
  stationFootprint: Object.freeze({ bus: 2, rail: 2, subway: 1 } as const),
  budgetDecay: true,
  subwayDecays: true,
  bridgeDecayRoll: 50,
  raisingBridgeLen: Object.freeze({ min: 5, max: 12 }),
  suspensionMinLen: 7,
  implementedBridges: Object.freeze([BridgeKind.Causeway, BridgeKind.Rail, BridgeKind.Wire]),
  carsCrossRailBridge: true,
  carsCrossWireBridge: false,
  maxSteps: 100,
  lowDensityNumerator: 3, lowDensityDenominator: 4,
  stepRoad: 3, stepWalk: 2, stepRapid: 1, stepTransfer: 4, stepOnrampIn: 2, stepOnrampOut: 1,
  triesPerNode: 4, stackLimit: 512,
  stationInteriorStep: 0,
  // R-light / R-dense → {3,4,5,6,8,9}；C → {1,2,5,6}；I → {1,2,3,4,9}（§2.12.2 建议默认表）
  destMask: Object.freeze([0, 0x0378, 0x0378, 0x0066, 0x0066, 0x021e, 0x021e, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  allowSubRailTransfer: true,
  walkCrossoverAsBridge: true,
  missileSiloIsSubway: true,
  lightLevel: 48, heavyLevel: 160,
});

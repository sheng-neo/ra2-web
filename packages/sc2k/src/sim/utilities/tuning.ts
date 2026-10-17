// ===== sim/utilities/tuning.ts =====（spec:power-water §3.1 UtilityTuning；所有 [低] / [中] 数值与设计开关集中于此）
// 电厂每格产量 / 水设施产量语义在 defs.ts；本文件只放可调标量与邻居顺序。
import { SCAN_NEIGHBORS } from '../../contracts/grid';

export interface UtilitiesTuning {
  /** 服务格 ↔ 标称 MW 的显示换算（704/200 ≈ 3.52、8880/2500 = 3.55，取中值）[中] */
  tilesPerMW: number;
  /** 供水显示：加仑 / 服务格 [高] */
  gallonsPerTile: number;
  /** 水塔显示：加仑 / 蓄水单位 [低] */
  towerGallonsPerUnit: number;
  /** 每个水塔格蓄水单位数（整座 2×2 = 400）[高] */
  towerUnitsPerCell: number;
  /** 水塔蓄水取整半量：富余 ≥ 50 才填第一格、≥ 150 填第二格 [高] */
  towerRoundHalf: number;
  /** 每座净水厂覆盖的受水建筑格数 [中] */
  treatmentTilesPerPlant: number;
  /** 净水厂占地格数：容量 = floor(净水厂格计数 / 此值) × treatmentTilesPerPlant */
  treatmentCellsPerPlant: number;
  /** 水泵：3×3 内每格淡水 +10 [高] */
  pumpFreshBonus: number;
  /** 水泵基值：floor(湿度 / pumpRainDiv) [高] */
  pumpRainDiv: number;
  /** 水泵基值：水位 × pumpWaterLevelMul [高] */
  pumpWaterLevelMul: number;
  /** 淡化：每厂格 3×3 内每格咸水 +20 [高] */
  desalSaltBonus: number;
  /** 太阳能：每格基础产量 [中] */
  solarBase: number;
  /** 太阳能：抽样区间 = max(1, floor((100 − 湿度) / solarRangeDiv)) [中] */
  solarRangeDiv: number;
  /** 风电：阵风上限 = floor(风速 / windGustDiv) [高] */
  windGustDiv: number;
  /** 节能法令：容量 += floor(容量 / energyConservationDiv)（704 → 762）[高] */
  energyConservationDiv: number;
  /** 电厂老化提醒：年龄 > 48 起每年提醒 [高] */
  plantAgingWarnAfter: number;
  /** 电厂寿命：年龄 > 50 的年度更新时到期 [中] */
  plantLifeYears: number;
  /** 查询窗口负载显示抖动：usagePct + int(0 .. loadJitter−1) [高] */
  loadJitter: number;
  /** needPower / needWater 阈值：利用率 ≥ 98 [高] */
  needThresholdPct: number;
  /** 0 = 不复现原版 512 项环形队列的丢弃行为（默认）；512 = 对照原版存档的近似复现 */
  legacyTraceQueue: 0 | 512;
  /** 4 邻居顺序 (dx, dy)；默认 SCAN_NEIGHBORS = 索引增量 −1, −128, +1, +128（spec §2.4）。只允许重排，不允许增删。 */
  neighborOrder: ReadonlyArray<readonly [dx: number, dy: number]>;
  /** priv 中跟踪的到期型（4×4）电厂上限；16384 / 16 = 1024 座是几何上限 */
  maxTrackedPlants: number;
}

export const DEFAULT_UTILITIES_TUNING: UtilitiesTuning = Object.freeze({
  tilesPerMW: 3.55,
  gallonsPerTile: 720,
  towerGallonsPerUnit: 100,
  towerUnitsPerCell: 100,
  towerRoundHalf: 50,
  treatmentTilesPerPlant: 2000,
  treatmentCellsPerPlant: 4,
  pumpFreshBonus: 10,
  pumpRainDiv: 2,
  pumpWaterLevelMul: 5,
  desalSaltBonus: 20,
  solarBase: 5,
  solarRangeDiv: 10,
  windGustDiv: 8,
  energyConservationDiv: 12,
  plantAgingWarnAfter: 48,
  plantLifeYears: 50,
  loadJitter: 8,
  needThresholdPct: 98,
  legacyTraceQueue: 0,
  neighborOrder: SCAN_NEIGHBORS,
  maxTrackedPlants: 1024,
});

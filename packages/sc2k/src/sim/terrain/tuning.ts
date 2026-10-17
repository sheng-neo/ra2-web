// ===== sim/terrain/tuning.ts =====（spec:terrain §2.7 / §2.9 / §2.10 / §3.6；标 [M]/[L]/[设计] 的数值全部在此）
// 地形模块可调参数：工具费用、生成器映射（海平面 / 起伏 / 湖泊偏置 / 噪声 / 海岸 / 河流 / 溪流 / 树木）、合法性开关。

export interface TerrainTuning {
  /** 城市模式费用（spec:terrain §2.9；编辑模式一律免费）。 */
  costRaise: number; costLower: number; costLevel: number;   // 每个"至少一个角点高度改变"的地块
  costTrees: number;                                         // 每次点击（每个路径格）
  costWater: number;                                         // 每格
  /** 导入时 MISC 海平面缺失（为 0 且无水块可推断）的默认值（spec §2.2：新地图默认 4）。 */
  defaultSeaLevel: number;
  /** 生成器：W = clamp(seaLevelBase + floor(water / seaLevelDiv), 1, seaLevelMax)（water=5 ⇒ 4）。 */
  seaLevelBase: number; seaLevelDiv: number; seaLevelMax: number;
  /** 起伏幅度 range = hillsRangeBase + floor(hills * hillsRangeSpan / 47)（0 ⇒ 2，12 ⇒ 8，47 ⇒ 28）。 */
  hillsRangeBase: number; hillsRangeSpan: number;
  /** 湖泊目标占比（角点分位数，与 Hills 无关）：water>0 时在 [lakeFractionMin, lakeFractionMax] 间按 water/47 线性。 */
  lakeFractionMin: number; lakeFractionMax: number;
  /** 高度场 fBm：倍频数 / 基频（角点为单位）/ 增益 / 频率倍增 / 对比拉伸。 */
  fbmOctaves: number; fbmBaseFreq: number; fbmGain: number; fbmLacunarity: number; fbmStretch: number;
  /** 海岸：海带宽 shoreMin + shoreNoise × 噪声；边缘最深 W − 1 − edgeDepthExtra；第二侧概率（×1/256）。 */
  coastShoreMin: number; coastShoreNoise: number; coastEdgeDepthExtra: number; coastSecondSidePer256: number;
  /** 河流：宽 [widthMin, widthMax] 格、蜿蜒振幅 [meanderMin, meanderMax] 格、中线噪声周期（格）。 */
  riverWidthMin: number; riverWidthMax: number; riverMeanderMin: number; riverMeanderMax: number; riverNoisePeriod: number;
  /** 溪流：条数 = floor((water + streamCountAdd) / streamCountDiv)；起点海拔 ≥ W + streamStartAboveSea；最大步数；选址尝试次数。 */
  streamCountAdd: number; streamCountDiv: number; streamStartAboveSea: number; streamMaxSteps: number; streamPlaceTries: number;
  /** 溪流在等高平地连续行走的步数上限（超过即以池塘收尾）。 */
  streamPlateauMax: number;
  /** 树木：噪声基频 / 倍频数 / 噪声与随机的混合比 / 阈值放大。 */
  treeNoiseFreq: number; treeNoiseOctaves: number; treeNoiseMix: number; treeThresholdScale: number;
  /** Forest 刷子默认半径（格）。 */
  forestRadius: number;
  /** 城市模式：Level 是否连带拆除结构物（v1 为 false：有结构物即拒绝）。 */
  levelDemolishes: boolean;
  /** 城市模式：Lower / Level 触及深水格（非装饰水）时是否拒绝（spec §2.10 字面规则；默认放宽为允许，便于在岸边挖港）。 */
  cityRejectsWaterForLowerLevel: boolean;
}

export const DEFAULT_TERRAIN_TUNING: TerrainTuning = {
  costRaise: 25, costLower: 25, costLevel: 25, costTrees: 3, costWater: 100,
  defaultSeaLevel: 4,
  seaLevelBase: 2, seaLevelDiv: 2, seaLevelMax: 14,
  hillsRangeBase: 2, hillsRangeSpan: 26,
  lakeFractionMin: 0.02, lakeFractionMax: 0.35,
  fbmOctaves: 5, fbmBaseFreq: 1 / 48, fbmGain: 0.5, fbmLacunarity: 2, fbmStretch: 1.1,
  coastShoreMin: 10, coastShoreNoise: 8, coastEdgeDepthExtra: 2, coastSecondSidePer256: 64,
  riverWidthMin: 2, riverWidthMax: 4, riverMeanderMin: 8, riverMeanderMax: 20, riverNoisePeriod: 28,
  streamCountAdd: 3, streamCountDiv: 4, streamStartAboveSea: 3, streamMaxSteps: 96, streamPlaceTries: 40, streamPlateauMax: 12,
  treeNoiseFreq: 1 / 24, treeNoiseOctaves: 4, treeNoiseMix: 0.7, treeThresholdScale: 1.1,
  forestRadius: 3,
  levelDemolishes: false,
  cityRejectsWaterForLowerLevel: false,
};

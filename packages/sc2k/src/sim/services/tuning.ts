// ===== sim/services/tuning.ts =====
// ServicesTuning + 默认值（spec:services §3.1 ServicesTuning；[低]/[设计] 数值全部在此，代码里不写魔法数）。
// 经 getTuning(ctx, 'services', DEFAULT_SERVICES_TUNING) 浅合并：嵌套对象整体替换。

export interface ServicesTuning {
  // ---- 图层重算（§2.3） ----
  landValueBase: number;                  // 原版"垃圾偏移"的校准替代值 [中]
  pollutionBaseDivisor: number;           // 扩散分母基数 4
  radioactivePollution: number;           // 0x05 每格 200
  trafficPollutionDivisor: number;        // 源项 oldXTRF / 5
  landValue: {
    denseIndustryBonus: number;           // 密工业 +21
    lowDensityBonus: number;              // 住宅 POP < 阈值 时 +21
    lowDensityPopThreshold: number;       // 64
    distSpan: number;                     // dist = span − |Δhx| − |Δhy|（64）
  };
  policeStrengthBase: number;             // (5 + prisonBonus) × fund / 2
  policeStrengthPrisonBonus: number;
  strengthFundingDivisor: number;
  fireStrengthMul: number;                // fund × 5 / 2
  patternRatios: { cardinal: readonly [number, number]; diagonal: readonly [number, number]; ring2: readonly [number, number]; ring3: readonly [number, number] };
  ordinanceCoverageStep: number;          // 邻里守望 / 义务消防 每分区建筑格 +2
  ordinanceCoverageCap: number;           // 仅当 < 254 时叠加
  gamblingCrime: number;                  // 赌博合法化 每已开发半格 +16
  coverageScanSkipsBorder: boolean;       // 原版只扫 1..126
  xrogInitial: number;                    // 新城 XROG 初值 0x7F（Q13）
  xrogCenter: number;                     // 增长率零点 128
  graphDivisorShift: number;              // *Graph = total / (developedTiles >> shift + 1)
  // ---- 交通（§2.4） ----
  trafficDecayShift: number;              // 第 19 天 XTRF -= XTRF >> shift
  trafficDecayMin: number;                // 非零值至少衰减这么多（0 = 纯移位；默认 1 使 1..3 终会归零，见 open-questions）
  // ---- 微模拟（§2.6） ----
  legacyInt16Wrap: boolean;               // popCap 的 16 位截断
  arcoCountAdjThreshold: number;          // popCap 的 adj：arcoCount ≥ 141 时 arcoCount×20000 − 2,800,000
  arcoCountAdjMul: number;
  arcoCountAdjSub: number;
  // ---- 里程碑（§2.8.1） ----
  milestones: readonly number[];          // 10 项，比较 normalPop 严格大于
  militaryOfferModal: boolean;            // v1 false：进度 4 只 emit militaryOffer 事件，不挂起模态（军事基地 v2）
  // ---- 告示牌 ----
  signLimit: number;                      // 50（XTXT 0x01..0x32）
  // ---- 读档 ----
  recomputeOnLoad: boolean;               // postLoad('sc2') 后是否立即重跑 runDataMaps（默认 false）
  // ---- 状态栏诉求链（§2.10.4） ----
  status: {
    powerUsageNeed: number; waterUsageNeed: number;   // ≥ 99%
    roadPopDivisor: number;                           // normalPop/100 ≥ 车站数 + 道路格数
    minPopPolice: number; popPerPolice: number;       // 1,000 / 20,000
    minPopHospital: number; popPerHospital: number;   // 3,000 / 25,000
    minPopPorts: number; popPerPortUnit: number;      // 8,000 / 10,000
    minPopRecreation: number;                         // 10,000
  };
  // ---- 人口学 v1 简化（§2.7 全量为 v2；本档只产出 workforcePct / EQ / LE 的有界近似） ----
  workforceV1: {
    basePct: number;                 // 50
    eduBonusMaxPct: number;          // 教育项最多 +5
    eduPermillePerPct: number;       // 每千分之 2 的"月升学容量 / 人口"换 1%
    eqBase: number; eqPerBonusPct: number;             // EQ = 85 + 5 × 教育加成
    leBase: number; leMax: number; lePerHealthPermille: number;   // LE = 60 + 3 × 千分医疗容量，封顶 85
    healthPerHospital: number; schoolPerSchool: number; collegePerCollege: number;   // 25 / 15 / 50（每座满资金每月）
  };
  // ---- 年度微模拟（§2.6.2）的评分参数 ----
  score: { hospital: readonly [number, number, number]; school: readonly [number, number, number]; college: readonly [number, number, number] };   // [slope, best, zero]
}

export const DEFAULT_SERVICES_TUNING: ServicesTuning = {
  landValueBase: 32,
  pollutionBaseDivisor: 4,
  radioactivePollution: 200,
  trafficPollutionDivisor: 5,
  landValue: { denseIndustryBonus: 21, lowDensityBonus: 21, lowDensityPopThreshold: 64, distSpan: 64 },
  policeStrengthBase: 5,
  policeStrengthPrisonBonus: 1,
  strengthFundingDivisor: 2,
  fireStrengthMul: 5,
  patternRatios: { cardinal: [4, 5], diagonal: [3, 4], ring2: [2, 3], ring3: [1, 2] },
  ordinanceCoverageStep: 2,
  ordinanceCoverageCap: 254,
  gamblingCrime: 16,
  coverageScanSkipsBorder: true,
  xrogInitial: 0x7f,
  xrogCenter: 128,
  graphDivisorShift: 2,
  trafficDecayShift: 2,
  trafficDecayMin: 1,
  legacyInt16Wrap: true,
  arcoCountAdjThreshold: 141,
  arcoCountAdjMul: 20000,
  arcoCountAdjSub: 2_800_000,
  milestones: [2_000, 10_000, 30_000, 60_000, 90_000, 120_000, 500_000, 1_000_000, 5_000_000, 10_000_000],
  militaryOfferModal: false,
  signLimit: 50,
  recomputeOnLoad: false,
  status: {
    powerUsageNeed: 99, waterUsageNeed: 99, roadPopDivisor: 100,
    minPopPolice: 1_000, popPerPolice: 20_000, minPopHospital: 3_000, popPerHospital: 25_000,
    minPopPorts: 8_000, popPerPortUnit: 10_000, minPopRecreation: 10_000,
  },
  workforceV1: {
    basePct: 50, eduBonusMaxPct: 5, eduPermillePerPct: 2,
    eqBase: 85, eqPerBonusPct: 5, leBase: 60, leMax: 85, lePerHealthPermille: 3,
    healthPerHospital: 25, schoolPerSchool: 15, collegePerCollege: 50,
  },
  score: { hospital: [5, 50, 111], school: [3, 15, 52], college: [5, 50, 111] },
};

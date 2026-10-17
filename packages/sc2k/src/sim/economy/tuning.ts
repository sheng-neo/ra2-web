// ===== sim/economy/tuning.ts =====（spec:economy-budget §3.1 EconomyTuning、§3.2 常量表、§5 待确认项）
// 全部 [低] / [设计] 数值集中在此；代码里不写魔法数。原版数值进 DEFAULT_ECONOMY_TUNING，经 getTuning(ctx, 'economy', …) 浅合并覆盖。
import type { BudgetLine } from '../../contracts/state';

export type Difficulty = 1 | 2 | 3;
export type CreditRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'CC' | 'C' | 'D' | 'F';
/** 评级从好到坏（tierIndex 越大越差；最后一档 F 不可发债）。 */
export const CREDIT_RATINGS: readonly CreditRating[] = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D', 'F'];

export type ServiceUnitKey = 'police' | 'prison' | 'fire' | 'hospital' | 'school' | 'college' | 'busDepot';
export type TransitUnitKey = 'roadTile' | 'highwayTile' | 'bridgeTile' | 'railTile' | 'railDepot' | 'subwayTile' | 'subwayStation' | 'tunnelTile';

export interface BondTuning {
  face: number;                       // 面额 $10,000
  max: number;                        // 最多 50 张（MISC 0x0610 50 槽）
  perBondSpreadRaw: number;           // 每多一张 +0.25%
  jitterRaw: number;                  // 发行时 prng.int(jitterRaw)
  minRaw: number; maxRaw: number;     // 下一张利率夹值
  cheatRateRaw: number;               // 作弊码发行的债券利率 25%
  fedInitialRaw: number;              // 开局 3% + 1% × natTrend
  fedPerTrendRaw: number;
  fedSteps: readonly number[];        // 年随机游走步长
  fedStepWeights: readonly number[];  // 对应整数权重（Σ 为 prng.int 的上界）
  fedTrendAdjRaw: number;             // natTrend 2 → +，0 → −
  fedMinRaw: number; fedMaxRaw: number;
  dsrTiers: readonly number[];        // 偿债率分档（10 个上界 → 11 档）
  collateralTiers: readonly number[]; // 债务 / 城市价值分档
  /** 评级分母下限 [设计]：新城税收 / 城市价值为 0 时按此值计（否则第一张债券即 F，Hard 开局永远无法借款）。 */
  ratingTaxFloor: number; ratingValueFloor: number;
  spreadRaw: Readonly<Record<CreditRating, number>>;
  cityValueMode: 'estimate' | 'landValue';   // 'estimate' = 按 spec:services §2.10.2 公式由 counts.tile 估算；'landValue' = ⌊landValueSum / 2⌋ × 1000
}

export interface EconomyTuning {
  taxDivisor: number;                                 // 税率 × 人口 / 75
  startFunds: Readonly<Record<Difficulty, number>>;
  hardStartBondRateRaw: number;                       // Hard 开局 1 张 3% 债券
  defaultTaxRate: number;                             // 7
  defaultFunding: number;                             // 100
  maxTaxRate: number;                                 // 20
  serviceUnitCents: Readonly<Record<ServiceUnitKey, number>>;   // 年单价（分）
  transitUnitCents: Readonly<Record<TransitUnitKey, number>>;   // 年单价（分 / 单位），spec:transport §2.4
  transitCostScale: number;                           // 交通六线整体缩放（Q2）
  underfundedThreshold: number;                       // 资金率低于此且计数 > 0 → underfunded（只对交通六线）
  taxGripeRate: number; taxGripeSevereRate: number;   // 任一税率 ≥ 10 → taxGripe；≥ 15 → severe
  bonds: BondTuning;
  impeachFundsThreshold: number;                      // closeYear 时 funds < 此值 → 弹劾
  impeachYears: number;                               // 连续 N 年年末 funds < 0 → 弹劾；0 = 关闭
  /** 'yearEnd'：closeYear 判定；'monthly'：closeYear 不判定，改由第 22 天 solvency 阶段判定（该阶段只在 createSim({ impeachMonthly: true }) 时被 core 调用）。 */
  impeachCheck: 'yearEnd' | 'monthly';
  advertisingCounterMax: number;
  cheatCash: number;                                  // 加钱作弊码的金额
  cheatFirePermille: number;                          // 加钱作弊码的起火概率（千分比）
  graphValueScale: number; graphCrimeScale: number;   // XGRP Value / Crime 缩放（向上取整）
  /** 法令按年份灰显开关（Q4）：true 时 availableYear > 当前年份的法令不可启用。 */
  ordinanceYearGate: boolean;
}

export const DEFAULT_ECONOMY_TUNING: EconomyTuning = {
  taxDivisor: 75,
  startFunds: { 1: 20000, 2: 10000, 3: 10000 },
  hardStartBondRateRaw: 30000,
  defaultTaxRate: 7,
  defaultFunding: 100,
  maxTaxRate: 20,
  serviceUnitCents: { police: 10000, prison: 10000, fire: 10000, hospital: 5000, school: 2500, college: 10000, busDepot: 2500 },
  transitUnitCents: { roadTile: 10, highwayTile: 20, bridgeTile: 25, railTile: 40, railDepot: 150, subwayTile: 40, subwayStation: 80, tunnelTile: 20 },
  transitCostScale: 1,
  underfundedThreshold: 80,
  taxGripeRate: 10, taxGripeSevereRate: 15,
  bonds: {
    face: 10000, max: 50, perBondSpreadRaw: 2500, jitterRaw: 10000, minRaw: 10000, maxRaw: 250000, cheatRateRaw: 250000,
    fedInitialRaw: 30000, fedPerTrendRaw: 10000,
    fedSteps: [-5000, -2500, 0, 2500, 5000], fedStepWeights: [150, 200, 300, 200, 150], fedTrendAdjRaw: 2500,
    fedMinRaw: 10000, fedMaxRaw: 150000,
    dsrTiers: [0.02, 0.04, 0.07, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.75],
    collateralTiers: [0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 1.00],
    ratingTaxFloor: 10000, ratingValueFloor: 100000,
    spreadRaw: { AAA: 0, AA: 2500, A: 5000, BBB: 10000, BB: 15000, B: 20000, CCC: 30000, CC: 40000, C: 50000, D: 70000, F: Number.POSITIVE_INFINITY },
    cityValueMode: 'estimate',
  },
  impeachFundsThreshold: -50000,
  impeachYears: 0,
  impeachCheck: 'yearEnd',
  advertisingCounterMax: 100,
  cheatCash: 250,
  cheatFirePermille: 100,
  graphValueScale: 3200, graphCrimeScale: 3750,
  ordinanceYearGate: false,
};

/** 预算线 → strings 键后缀（budget.<key>），顺序 = BudgetLine 枚举 = MISC 0x0998.. 的块序。 */
export const BUDGET_LINE_KEYS: readonly string[] = ['police', 'fire', 'health', 'schools', 'colleges', 'roads', 'highways', 'bridges', 'rail', 'subway', 'tunnel'];
export const FIRST_TRANSIT_LINE: BudgetLine = 5 as BudgetLine;   // BudgetLine.Roads
export const INT32_MAX = 2147483647, INT32_MIN = -2147483648;
export const clampInt32 = (v: number): number => (v > INT32_MAX ? INT32_MAX : v < INT32_MIN ? INT32_MIN : Math.trunc(v));
export const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : Math.trunc(v));

// ===== sim/zones/tuning.ts =====
// 分区 / 需求 / 邻城 / 国家经济的全部可调数值（spec:zones §3.1 ZoneTuning + DemandTuning，§2.8.5 natPop，§2.10 邻城）。
// 规格中标 [低] / [中] / [设计] 的数值一律在此；代码里不得出现魔法数。经 getTuning(ctx, 'zones', DEFAULT_ZONES_TUNING) 读取。
import type { RciDemand } from '../../contracts/state';
import type { ZoneType } from '../../contracts/grid';

/** 有理数份额（避免 1/6 之类的浮点：floor(x * num / den)）。 */
export interface Ratio { num: number; den: number }
export type Difficulty = 1 | 2 | 3;
export type EdgeSide = 'S' | 'W' | 'N' | 'E';

export interface ZonesTuning {
  // ---- 生长掷骰与阶梯（spec:zones §2.5） ----
  /** 掷骰偏移：roll < pressure − growOffset 生长；roll ≥ pressure + declineOffset 衰退（§2.5.3 [低]）。 */
  growOffset: number; declineOffset: number;
  /** R/C 升到密度级 2/3/4 的地价门槛（XVAL >，§2.5.5 [高]）。 */
  densityLandValue: readonly [number, number, number];
  /** 受地价门槛约束的分区类型（默认 R、C；工业不受限 [高]）。 */
  densityGateZones: readonly ZoneType[];
  /** 贫富档：tier = min(2, XVAL >> wealthShift)（[高]）。 */
  wealthShift: number;
  /** 档次迟滞半宽（0 = 关，[设计]）。 */
  tierHysteresis: number;
  /** 连续多少次月访问地价档低于建筑档后原地降档（[设计]）。 */
  tierDowngradeMonths: number;
  /** 密区无水时的最高密度级（4 = 不限制，原版；3 = 无水最多 2x2 [设计]）。 */
  denseUnwateredMaxLevel: 1 | 2 | 3 | 4;
  /** 施工天数，按尺寸 1x1 / 2x2 / 3x3 索引（[设计]）。 */
  constructDays: readonly [number, number, number];
  /** 废弃 → 瓦砾天数（[设计]）。 */
  abandonToRubbleDays: number;
  /** 自身断电连续天数 > 此值 → 强制衰退一级（[中]）。 */
  unpoweredGraceDays: number;
  /** 出行失败的宽限月数：tripFailMonths > 此值才参与衰退掷骰（[设计]）。 */
  tripFailGraceMonths: number;
  /** 每个生长日的施工 / 衰退配额（128x128 基准，[设计]）。 */
  maxGrowsPerDay: number; maxDeclinesPerDay: number;
  /** 允许吞并同类型、更低密度级的小建筑（[设计]）。 */
  allowAbsorb: boolean;
  /**
   * 允许吞并只被新地块部分覆盖的更低密度级建筑 / 废弃建筑：整栋拆除，落在新地块外的格变瓦砾（不留半栋孤儿）[设计]。
   * 关闭时严格按 spec:zones §2.5.6（整栋落入才可吞并）——但 2x2 铺满后 3x3 永远无法形成。
   */
  absorbPartial: boolean;
  /** 人口汇总是否把断电建筑计入（原版：不计）。 */
  countUnpowered: boolean;
  /** 调试 / 测试用：非 null 时 demand 阶段直接写入该固定需求（不消费 PRNG）。 */
  fixedDemand: RciDemand | null;

  // ---- 人口 / 税基（§2.7） ----
  workforcePctFallback: number;
  arcoShare: { res: Ratio; com: Ratio; ind: Ratio };

  // ---- 需求（§2.8） ----
  emptyCityBase: RciDemand;
  ratioGain: number; smoothing: number;
  /** 税率 0..20 → 需求修正（§2.8.3）。 */
  taxMod: readonly number[];
  taxSens: Readonly<Record<Difficulty, number>>;
  /** 国家经济 trend 0/1/2 → 修正。 */
  econMod: readonly [number, number, number];
  diffIndMod: Readonly<Record<Difficulty, number>>;
  noise: number; capPenaltyMax: number;
  capBase: RciDemand;
  recreationCapR: { smallPark: number; bigPark: number; marina: number; zoo: number; stadium: number };
  roadConnC: number; airportTileC: number; airportGroupC: number; airportCapMode: 'tiles' | 'groups';
  craneI: number; railConnI: number; hwyConnI: number;
  marketC: number; marketI: number;
  /** 年份 → 商业份额（分段线性，§2.8.2）。 */
  commerceShare: ReadonlyArray<readonly [year: number, share: number]>;
  /** 市民诉求：已划区但不可达的空格数阈值（needroad，[低]）。 */
  needRoadTiles: number;
  /** 每 N 人一所学校 / 消防局 / 医院的诉求阈值（§2.8.6）。 */
  needSchoolPer: number; needFirePer: number; needHospitalPer: number; needParkMinRes: number;

  // ---- 产业（§2.9，v1 只用 ratio 初值与污染加成） ----
  /** 11 个产业 × [w1900, w1950, w2000, w2050] 权重曲线。 */
  industryWeights: ReadonlyArray<readonly [number, number, number, number]>;
  industryWeightYears: readonly [number, number, number, number];
  heavyPollutionIndustries: readonly number[];

  // ---- 国家经济与邻城（§2.8.5 / §2.10） ----
  /** 年份 → 国家人口（千人，分段线性 [高]）。 */
  natPop: ReadonlyArray<readonly [year: number, pop: number]>;
  natValueNum: number; natValueDen: number;
  neighborPopMin: number; neighborPopMax: number; neighborPopScale: number;
  neighborValueMin: number; neighborValueMax: number; neighborFameMax: number;
  neighborGrowthRandom: number; neighborGrowthPerType: number;
  /** 原创邻城名单（state.neighbors[k].index 为下标）。 */
  neighborNames: readonly string[];
  /** 邻城 edge 0..3 对应的地图边：S = y==127（左下）、W = x==0（左上）、N = y==0（右上）、E = x==127（右下）。 */
  neighborEdgeSides: readonly [EdgeSide, EdgeSide, EdgeSide, EdgeSide];
}

export const DEFAULT_ZONES_TUNING: ZonesTuning = {
  growOffset: 2000, declineOffset: 2000,
  densityLandValue: [31, 95, 191],
  densityGateZones: ['R', 'C'],
  wealthShift: 6,
  tierHysteresis: 0,
  tierDowngradeMonths: 6,
  denseUnwateredMaxLevel: 4,
  constructDays: [15, 30, 45],
  abandonToRubbleDays: 150,
  unpoweredGraceDays: 60,
  tripFailGraceMonths: 3,
  maxGrowsPerDay: 48, maxDeclinesPerDay: 48,
  allowAbsorb: true,
  absorbPartial: true,
  countUnpowered: false,
  fixedDemand: null,

  workforcePctFallback: 50,
  arcoShare: { res: { num: 1, den: 6 }, com: { num: 1, den: 12 }, ind: { num: 1, den: 12 } },

  emptyCityBase: { r: 800, c: 300, i: 500 },
  ratioGain: 1500, smoothing: 0.25,
  taxMod: [400, 300, 240, 180, 120, 80, 40, 0, -40, -100, -180, -260, -360, -460, -560, -680, -800, -940, -1100, -1300, -1500],
  taxSens: { 1: 0.75, 2: 1.0, 3: 1.25 },
  econMod: [150, 0, -150],
  diffIndMod: { 1: 50, 2: 0, 3: -50 },
  noise: 60, capPenaltyMax: 800,
  capBase: { r: 10000, c: 10000, i: 10000 },
  recreationCapR: { smallPark: 1000, bigPark: 3000, marina: 9000, zoo: 16000, stadium: 16000 },
  roadConnC: 2000, airportTileC: 500, airportGroupC: 10000, airportCapMode: 'tiles',
  craneI: 10000, railConnI: 10000, hwyConnI: 10000,
  marketC: 0.02, marketI: 0.04,
  commerceShare: [[1900, 0.30], [1925, 0.35], [1950, 0.42], [1975, 0.50], [2000, 0.58], [2025, 0.64], [2050, 0.68]],
  needRoadTiles: 20,
  needSchoolPer: 20000, needFirePer: 20000, needHospitalPer: 25000, needParkMinRes: 10000,

  industryWeights: [
    [10, 6, 3, 2], [9, 5, 2, 1], [4, 8, 6, 3], [6, 6, 5, 5], [5, 6, 6, 6], [1, 8, 7, 4],
    [0, 3, 6, 7], [1, 3, 7, 9], [1, 3, 6, 8], [0, 1, 8, 10], [1, 2, 5, 7]],
  industryWeightYears: [1900, 1950, 2000, 2050],
  heavyPollutionIndustries: [0, 2, 5],

  natPop: [[1900, 10000], [1950, 25000], [2000, 60000], [2050, 150000]],
  natValueNum: 3, natValueDen: 10,
  neighborPopMin: 5000, neighborPopMax: 60000, neighborPopScale: 10000,
  neighborValueMin: 5, neighborValueMax: 15, neighborFameMax: 100,
  neighborGrowthRandom: 0.04, neighborGrowthPerType: 0.02,
  neighborNames: [
    'Ashford Vale', 'Brightwater', 'Cinder Hollow', 'Dunmere', 'Elmsreach', 'Farrowgate', 'Glassport', 'Hollowbrook',
    'Ironleaf', 'Juniper Falls', 'Kestrel Bay', 'Larkspur', 'Mossbridge', 'Northwick', 'Oakhaven', 'Pinecrest'],
  neighborEdgeSides: ['S', 'W', 'N', 'E'],
};

/** 产业数（MISC 0x016C 三组各 11 项）。 */
export const INDUSTRY_COUNT = 11;

/** 分段线性插值（表按 x 升序；两端取端值）。 */
export function lerpTable(table: ReadonlyArray<readonly [number, number]>, x: number): number {
  const first = table[0]!, last = table[table.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let k = 1; k < table.length; k++) {
    const a = table[k - 1]!, b = table[k]!;
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return last[1];
}

export const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

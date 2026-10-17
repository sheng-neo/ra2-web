// ===== sim/events/tuning.ts =====（spec:disasters-events §3.2 DISASTER_TUNING / §2.4.3 WeatherTuning / §2.10.2 NewsTuning）
// 全部 [低]/[设计] 数值在此；代码里不写魔法数。经 getTuning(ctx, 'events', DEFAULT_EVENTS_TUNING) 浅合并（子对象整体覆盖）。

export interface FireTuning {
  spreadBase: number; minSpread: number; coverageDivisor: number; extinguishPerCoverage: number; dispatchExtinguish: number; diagonalFactor: number;
  fuel: { rubble: number; trees: number; s1: number; s2: number; s3: number; s4: number };
  fuelFactor: { trees: number; rubble: number; s1: number; s2: number; s3: number; s4: number };
}
export interface FloodTuning { growTicks: number; holdTicks: number; spread: number; maxTiles: readonly [number, number]; recedeDivisor: number }
export interface TornadoTuning { life: readonly [number, number]; jitter: number; destroyBuilding: number; destroyInfra: number; destroyTrees: number }
export interface QuakeTuning { shakeTicks: number; perMagnitude: number; magnitudeBase: number; magnitudeMin10: number; magnitudeSpan10: number; fireChance: number; undergroundChance: number; bridgeFactor: number; infraFactor: number }
export interface MonsterTuning { life: readonly [number, number]; seekChance: number; crush: number; ignite: number; rayIgnite: number }
export interface WeatherTuning {
  seasonOfMonth: readonly number[];                 // 12 → Season
  weights: ReadonlyArray<readonly number[]>;        // 4 季 × 12 天气，每行合计 100
  baseF: readonly number[];                         // 12 月基础气温 °F
  heatJitter: number;                               // ±
  trendDelta: readonly number[];                    // 12 天气的气温修正
  windBase: readonly number[]; windJitter: readonly number[];
  humidBase: readonly number[]; humidJitter: readonly number[];
}
/** 每种 NewsType 一行 [power, decay, cooldownMonths]；cooldown −1 = 一生只发一次（Founding），0 = 无冷却。 */
export type NewsRow = readonly [power: number, decay: number, cooldown: number];
export interface NewsTuning { rows: readonly NewsRow[]; maxPool: number; bodyStories: number; paperMonths: readonly number[] }

export interface EventsTuning {
  /** 下标 = difficulty 1..3（0 未用）。 */
  graceDays: readonly number[]; monthlyChance: readonly number[];
  maxDisasterTicks: number;
  weights: { fire: number; flood: number; earthquake: number; tornado: number; monster: number };
  monsterMinPop: number;
  fire: FireTuning; flood: FloodTuning; tornado: TornadoTuning; quake: QuakeTuning; monster: MonsterTuning;
  dispatch: { radius: number; maxUnits: number };
  deathsPerZoneBuilding: readonly [number, number];
  weather: WeatherTuning;
  news: NewsTuning;
}

/** 67 种事件的 power / decay / cooldown（spec §2.10.2 整表；Weather / AdviceColumn 不入池，记 0）。 */
const NEWS_ROWS: readonly NewsRow[] = [
  /* 0 Weather */ [0, 0, 0], /* 1 Junk */ [10, 10, 0], /* 2 Founding */ [100, 20, -1], /* 3 Growth */ [90, 15, 0],
  /* 4 Invention */ [80, 15, 0], /* 5 Innovation */ [80, 15, 0], /* 6 War */ [20, 10, 12], /* 7 Market */ [20, 10, 6],
  /* 8 Sports */ [25, 10, 2], /* 9 FedRateUp */ [40, 10, 12], /* 10 FedRateDown */ [40, 10, 12], /* 11 Politics */ [20, 10, 6],
  /* 12 Diplomacy */ [20, 10, 6], /* 13 Disaster */ [25, 10, 6], /* 14 Medical */ [20, 10, 6], /* 15 Upbeat */ [15, 10, 3],
  /* 16 HighCrime */ [50, 10, 12], /* 17 HighTraffic */ [45, 10, 12], /* 18 HighPollution */ [45, 10, 12], /* 19 PoorEducation */ [40, 10, 12],
  /* 20 PoorHealth */ [40, 10, 12], /* 21 PoorEmployment */ [45, 10, 12], /* 22 DisasterFire */ [95, 15, 0], /* 23 DisasterFlood */ [95, 15, 0],
  /* 24 DisasterPlaneCrash */ [95, 15, 0], /* 25 DisasterHelicopterCrash */ [90, 15, 0], /* 26 DisasterTornado */ [95, 15, 0], /* 27 DisasterEarthquake */ [100, 15, 0],
  /* 28 DisasterMonster */ [100, 15, 0], /* 29 DisasterMeltdown */ [100, 15, 0], /* 30 DisasterMicrowave */ [90, 15, 0], /* 31 DisasterVolcano */ [100, 15, 0],
  /* 32 DisasterPollution */ [95, 15, 0], /* 33 DisasterChemicalSpill */ [90, 15, 0], /* 34 DisasterHurricane */ [100, 15, 0], /* 35 DisasterRiot */ [95, 15, 0],
  /* 36 PowerPlantEol */ [70, 15, 12], /* 37 OvercrowdedPrisons */ [40, 10, 12], /* 38 AngryTeachers */ [40, 10, 12], /* 39 BridgeCollapse */ [60, 10, 0],
  /* 40 AngryBulldozer */ [35, 10, 24], /* 41 Ordinance */ [50, 10, 0], /* 42 OpinionGuest */ [40, 10, 12], /* 43 OpinionEditor */ [35, 10, 12],
  /* 44 Survey */ [45, 10, 12], /* 45 AdviceColumn */ [0, 0, 0], /* 46 DemandPower */ [55, 10, 12], /* 47 DemandTransit */ [50, 10, 12],
  /* 48 DemandPolice */ [50, 10, 12], /* 49 DemandFire */ [50, 10, 12], /* 50 DemandWater */ [55, 10, 12], /* 51 DemandHospital */ [50, 10, 12],
  /* 52 DemandSchool */ [50, 10, 12], /* 53 DemandSeaport */ [45, 10, 12], /* 54 DemandAirport */ [45, 10, 12], /* 55 DemandZoo */ [35, 10, 24],
  /* 56 DemandStadium */ [35, 10, 24], /* 57 DemandMarina */ [35, 10, 24], /* 58 DemandPark */ [35, 10, 24], /* 59 DemandIndustrialConnection */ [45, 10, 12],
  /* 60 DemandCommercialConnection */ [45, 10, 12], /* 61 LowCrime */ [30, 10, 24], /* 62 LowTraffic */ [30, 10, 24], /* 63 LowPollution */ [30, 10, 24],
  /* 64 GoodEducation */ [30, 10, 24], /* 65 GoodHealth */ [30, 10, 24], /* 66 GoodEmployment */ [30, 10, 24],
];

/** 天气枚举序（spec §2.4.2）：Cold Clear Hot Foggy Chilly Overcast Snow Rain Windy Blizzard Hurricane Tornado。 */
export const enum Trend { Cold = 0, Clear, Hot, Foggy, Chilly, Overcast, Snow, Rain, Windy, Blizzard, Hurricane, Tornado }
export const TREND_COUNT = 12;

export const DEFAULT_EVENTS_TUNING: EventsTuning = {
  graceDays: [0, 2400, 1500, 750],
  monthlyChance: [0, 1 / 96, 1 / 60, 1 / 36],
  maxDisasterTicks: 2000,
  weights: { fire: 30, flood: 12, earthquake: 8, tornado: 10, monster: 5 },
  monsterMinPop: 1000,
  fire: {
    spreadBase: 0.06, minSpread: 0.004, coverageDivisor: 320, extinguishPerCoverage: 0.08, dispatchExtinguish: 0.5, diagonalFactor: 0.5,
    fuel: { rubble: 6, trees: 8, s1: 10, s2: 12, s3: 16, s4: 20 },
    fuelFactor: { trees: 1.4, rubble: 0.6, s1: 1.0, s2: 1.1, s3: 1.2, s4: 1.2 },
  },
  flood: { growTicks: 40, holdTicks: 20, spread: 0.5, maxTiles: [48, 96], recedeDivisor: 40 },
  tornado: { life: [60, 120], jitter: 1 / 3, destroyBuilding: 0.75, destroyInfra: 0.5, destroyTrees: 0.5 },
  quake: { shakeTicks: 12, perMagnitude: 0.02, magnitudeBase: 4.5, magnitudeMin10: 50, magnitudeSpan10: 40, fireChance: 0.4, undergroundChance: 0.5, bridgeFactor: 1.5, infraFactor: 0.5 },
  monster: { life: [120, 240], seekChance: 0.6, crush: 0.5, ignite: 0.3, rayIgnite: 0.1 },
  dispatch: { radius: 1, maxUnits: 38 },
  deathsPerZoneBuilding: [0, 3],
  weather: {
    seasonOfMonth: [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0],
    weights: [
      [24, 14, 0, 8, 16, 12, 14, 4, 4, 4, 0, 0],     // 冬
      [3, 24, 3, 8, 10, 12, 1, 20, 10, 0, 1, 8],     // 春
      [0, 30, 24, 3, 0, 8, 0, 12, 6, 0, 7, 10],      // 夏
      [6, 22, 4, 12, 14, 14, 2, 14, 8, 0, 3, 1],     // 秋
    ],
    baseF: [32, 36, 46, 56, 66, 76, 84, 82, 72, 60, 46, 36],
    heatJitter: 8,
    trendDelta: [-12, 0, 12, 0, -6, 0, -10, 0, 0, -16, 2, 0],
    windBase: [10, 5, 10, 10, 10, 10, 10, 10, 25, 35, 80, 40],
    windJitter: [8, 5, 8, 8, 8, 8, 8, 8, 10, 10, 20, 15],
    humidBase: [2, 2, 2, 3, 2, 6, 8, 20, 2, 15, 40, 2],
    humidJitter: [2, 2, 2, 2, 2, 4, 4, 10, 2, 5, 15, 2],
  },
  news: { rows: NEWS_ROWS, maxPool: 32, bodyStories: 3, paperMonths: [2, 6] },
};

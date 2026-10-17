// ===== state.ts =====
// 真源 CityState（CONTRACTS §F）：与 .SC2 同编码的图层 + 有存档映射的标量 + 各系统 priv。
import { CityMode } from './grid';
import type { SystemId } from './system';

export interface TileLayers {
  alt: Uint8Array; waterLevel: Uint8Array; tunnelLevels: Uint8Array;          // ALTM 拆位（16384）
  xter: Uint8Array; xbld: Uint8Array; xzon: Uint8Array; xund: Uint8Array; xtxt: Uint8Array; xbit: Uint8Array;   // 16384
  xlab: Uint8Array; xmic: Uint8Array; xthg: Uint8Array;                        // 6400 / 1200 / 480
}
export interface DataMaps { xtrf: Uint8Array; xplt: Uint8Array; xval: Uint8Array; xcrm: Uint8Array; xplc: Uint8Array; xfir: Uint8Array; xpop: Uint8Array; xrog: Uint8Array }
export interface Counts { tile: Int32Array; zone: Int32Array; military: Int32Array }   // 256 / 8 / 16（core 增量维护）

export type Speed = 1 | 2 | 3 | 4 | 5;                                         // 1 = 暂停，2..5 = 慢 / 中 / 快 / 极速（原创档名见 strings speed.*）
export interface ClockState {
  age: number;              // MISC 0x0010，唯一真源
  foundedYear: number;      // MISC 0x000C
  speed: Speed;             // MISC 0x0FEC（不入哈希）
  mode: CityMode;           // MISC 0x0004
  modalPause: number;       // >0 不推进（不入哈希）
  phaseCursor: number;      // 当日已完成阶段数；.SC2 要求 0；快照可在挂起态保存
  accumMs: number;          // 真实时间余量（不入哈希）
  disasterTicks: number;    // 灾害模式 tick 计数（命令日志时间戳）
  prngState: number;        // sim 流状态（u32 按 i32 位模式存）；MISC 0x1058
}
export interface GameDate { year: number; month: number; day: number }
export const dateOf = (c: ClockState): GameDate => ({ year: c.foundedYear + Math.floor(c.age / 300), month: Math.floor((c.age % 300) / 25), day: c.age % 25 });
export const monthIndex = (age: number): number => Math.floor(age / 25);

export interface TaxRates { r: number; c: number; i: number }                  // 0..20
export interface Bond { rateRaw: number; issuedYear: number; issuedMonth: number }   // rateRaw = 百分比 × 10000
export const enum BudgetLine { Police = 0, Fire, Health, Schools, Colleges, Roads, Highways, Bridges, Rail, Subway, Tunnel }
export const BUDGET_LINE_COUNT = 11;
export const enum OrdinanceId { SalesTax = 0, IncomeTax, LegalizedGambling, ParkingFines, ProReading, AntiDrug, CprTraining, NeighborhoodWatch,
  EnergyConservation, NuclearFreeZone, HomelessShelter, PollutionControls, VolunteerFire, SmokingBan, FreeClinics, JuniorSports,
  TouristAdvertising, BusinessAdvertising, CityBeautification, AnnualCarnival }
export interface EconomyState {
  funds: number; difficulty: 1 | 2 | 3; taxRate: TaxRates; industryTax: Int32Array /*11*/; funding: Uint8Array /*11*/;
  ordinances: number /*20 位*/; bonds: Bond[] /*≤50*/; fedRateRaw: number; autoBudget: boolean;
  counters: { advertising: number; fame: number }; impeached: boolean; yearOpeningFunds: number;
}
/** zones 第 21 天定稿、economy 下月第 0 天消费的人口快照（含巨型住区税基份额，spec:zones §2.7）。 */
export interface CensusSnapshot {
  res: number; com: number; ind: number; arcoPop: number; normalPop: number; citySize: number;
  taxableRes: number; taxableCom: number; taxableInd: number;
  /** census 阶段从 demographics.workforcePct 拷贝的只读副本（services 缺席 / 桩 / 值为 0 时 fallback 50）。唯一 owner 是 demographics.workforcePct（services，MISC 0x0044）；本字段在 SCALAR_FIELDS 标 hash:'none'，不导出 .SC2。 */
  workforcePctUsed: number;
  workforce: number; jobs: number; unemployedN: number; unemploymentPct: number;
  tiles: { res: number; com: number; ind: number; total: number };
}
export interface RciDemand { r: number; c: number; i: number }                 // −2000..2000
export type DemandCaps = RciDemand;
/** 没有 tax 字段：11 条产业税率的唯一真源是 economy.industryTax（setIndustryTax 写；zones 的 taxF_k 与 economy 的工业税都读它；MISC 0x016C+44.. 的 11 项由 economy.exportTo 写、importFrom 读）。 */
export interface IndustryState { ratio: Int32Array; demand: Int32Array; pollutionBonus: number }   // 11 / 11 / −1..2（zones 写 MISC 0x016C 的 ratio 与 0x016C+88.. 的 demand）
export interface NeighborCity { index: number; name: string; population: number; value: number; fame: number; edge: 0 | 1 | 2 | 3; connections: { road: number; rail: number; highway: number } }
export interface NationalEconomy { population: number; value: number; tax: number; trend: 0 | 1 | 2 }
export interface DemographicsState { cohorts: Int32Array /*60 = 20 × [count, eqSum, leSum]*/; workforcePct: number; workforceEQ: number; workforceLE: number }
export interface RewardState { progression: number; grantedMask: number; militaryBase: 0 | 1 | 2 | 3 | 4 | 5; prisonBonus: 0 | 1; oldArrests: number; stadiumTeams: number; mayorApproval: number }
export interface WeatherState { heat: number; wind: number; humid: number; trend: number; season: 0 | 1 | 2 | 3 }
export interface DisasterCore { pending: number; current: number; active: boolean; pointX: number; pointY: number; noDisasters: boolean; autoGoto: boolean; windOverride: number }   // windOverride −1 = 无
export interface TechState { invented: Int32Array /*17*/; announced: Uint8Array /*17*/ }
export interface PowerReport { generation: number; consumers: number; supplied: number; usagePct: number; unpoweredBuildingTiles: number }
export interface WaterReport { supply: number; consumers: number; watered: number; usagePct: number; towerCapacity: number; towerCharged: number; treatmentCapacity: number; treatmentSufficient: boolean; unwateredBuildingTiles: number }
export interface TrafficReport { total: number; graph: number; roadTiles: number; highwayTiles: number; bridgeTiles: number }
export interface DataMapTotals { pollution: number; landValue: number; crime: number; developedTiles: number; centerX: number; centerY: number }
export interface TerrainMeta { seaLevel: number; coast: boolean; river: boolean; rotation: 0 | 1 | 2 | 3 }
export interface ViewPersist { x: number; y: number; zoom: number }            // MISC 0x1018/0x101C/0x1014（不入哈希）

/** priv 值的类型白名单：安全整数 / 字符串 / 布尔 / 整数 TypedArray / 其数组与普通对象。编码器遇到其它类型抛错。 */
export type PrivTypedArray = Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array;
export type PrivValue = number | string | boolean | PrivTypedArray | PrivValue[] | { [k: string]: PrivValue };
/** 每个系统私有持久态；v = 该系统 priv schema 版本（≥1）。只放不可由真源层重建的运行态。 */
export interface PrivState { v: number; [k: string]: PrivValue }

export interface CityState {
  readonly formatVersion: 2;
  cityName: string; mayorName: string;
  layers: TileLayers; maps: DataMaps; counts: Counts; xgrp: Int32Array /*832*/; rawMisc: Int32Array /*1200*/;
  clock: ClockState; terrain: TerrainMeta; economy: EconomyState;
  census: CensusSnapshot; demand: RciDemand; caps: DemandCaps; industry: IndustryState; neighbors: NeighborCity[] /*4*/; national: NationalEconomy;
  demographics: DemographicsState; rewards: RewardState; totals: DataMapTotals; traffic: TrafficReport;
  weather: WeatherState; disaster: DisasterCore; tech: TechState; utilities: { power: PowerReport; water: WaterReport };
  view: ViewPersist;
  priv: Partial<Record<Exclude<SystemId, 'core'>, PrivState>>;   // 进快照、进 hash('full')、不进 .SC2
}

/** 各 TypedArray 长度（与 .SC2 段长一致，spec:file-formats §2.2）。 */
export const LAYER_LENGTHS = {
  tile: 16384, xlab: 6400, xmic: 1200, xthg: 480, half: 4096, quarter: 1024,
  xgrp: 832, rawMisc: 1200, countTile: 256, countZone: 8, countMilitary: 16,
  budgetLines: 11, cohorts: 60, tech: 17 } as const;
const u8 = (n: number): Uint8Array => new Uint8Array(n);
const i32 = (n: number): Int32Array => new Int32Array(n);
const rci = (): RciDemand => ({ r: 0, c: 0, i: 0 });

/**
 * 全零 / 空表分配；neighbors 固定 4 条（index = edge = 0..3，名字空串）、bonds 空数组、formatVersion 2。
 * 非零的唯一例外：speed = 1（Paused，类型不允许 0）、disaster.windOverride = −1（"无覆盖"哨兵）。mode = TerrainEdit (0)。
 */
export function createCityState(): CityState {
  const L = LAYER_LENGTHS;
  const neighbors: NeighborCity[] = [];
  for (let k = 0; k < 4; k++) neighbors.push({ index: k, name: '', population: 0, value: 0, fame: 0, edge: k as 0 | 1 | 2 | 3, connections: { road: 0, rail: 0, highway: 0 } });
  return {
    formatVersion: 2,
    cityName: '', mayorName: '',
    layers: {
      alt: u8(L.tile), waterLevel: u8(L.tile), tunnelLevels: u8(L.tile),
      xter: u8(L.tile), xbld: u8(L.tile), xzon: u8(L.tile), xund: u8(L.tile), xtxt: u8(L.tile), xbit: u8(L.tile),
      xlab: u8(L.xlab), xmic: u8(L.xmic), xthg: u8(L.xthg) },
    maps: { xtrf: u8(L.half), xplt: u8(L.half), xval: u8(L.half), xcrm: u8(L.half), xplc: u8(L.quarter), xfir: u8(L.quarter), xpop: u8(L.quarter), xrog: u8(L.quarter) },
    counts: { tile: i32(L.countTile), zone: i32(L.countZone), military: i32(L.countMilitary) },
    xgrp: i32(L.xgrp), rawMisc: i32(L.rawMisc),
    clock: { age: 0, foundedYear: 0, speed: 1, mode: CityMode.TerrainEdit, modalPause: 0, phaseCursor: 0, accumMs: 0, disasterTicks: 0, prngState: 0 },
    terrain: { seaLevel: 0, coast: false, river: false, rotation: 0 },
    economy: {
      funds: 0, difficulty: 1, taxRate: rci(), industryTax: i32(L.budgetLines), funding: u8(L.budgetLines),
      ordinances: 0, bonds: [], fedRateRaw: 0, autoBudget: false,
      counters: { advertising: 0, fame: 0 }, impeached: false, yearOpeningFunds: 0 },
    census: {
      res: 0, com: 0, ind: 0, arcoPop: 0, normalPop: 0, citySize: 0,
      taxableRes: 0, taxableCom: 0, taxableInd: 0, workforcePctUsed: 0,
      workforce: 0, jobs: 0, unemployedN: 0, unemploymentPct: 0,
      tiles: { res: 0, com: 0, ind: 0, total: 0 } },
    demand: rci(), caps: rci(),
    industry: { ratio: i32(L.budgetLines), demand: i32(L.budgetLines), pollutionBonus: 0 },
    neighbors,
    national: { population: 0, value: 0, tax: 0, trend: 0 },
    demographics: { cohorts: i32(L.cohorts), workforcePct: 0, workforceEQ: 0, workforceLE: 0 },
    rewards: { progression: 0, grantedMask: 0, militaryBase: 0, prisonBonus: 0, oldArrests: 0, stadiumTeams: 0, mayorApproval: 0 },
    totals: { pollution: 0, landValue: 0, crime: 0, developedTiles: 0, centerX: 0, centerY: 0 },
    traffic: { total: 0, graph: 0, roadTiles: 0, highwayTiles: 0, bridgeTiles: 0 },
    weather: { heat: 0, wind: 0, humid: 0, trend: 0, season: 0 },
    disaster: { pending: 0, current: 0, active: false, pointX: 0, pointY: 0, noDisasters: false, autoGoto: false, windOverride: -1 },
    tech: { invented: i32(L.tech), announced: u8(L.tech) },
    utilities: {
      power: { generation: 0, consumers: 0, supplied: 0, usagePct: 0, unpoweredBuildingTiles: 0 },
      water: { supply: 0, consumers: 0, watered: 0, usagePct: 0, towerCapacity: 0, towerCharged: 0, treatmentCapacity: 0, treatmentSufficient: false, unwateredBuildingTiles: 0 } },
    view: { x: 0, y: 0, zoom: 0 },
    priv: {},
  };
}

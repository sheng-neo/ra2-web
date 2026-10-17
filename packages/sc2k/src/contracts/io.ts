// ===== io.ts =====（spec:file-formats §3.2 / §3.4.4）
// .SC2 文档与 MISC 访问器（CONTRACTS §N）：io/sc2 纯编解码（不认识 CityState）与各系统 importFrom / exportTo 的交汇点。
import type { Diagnostic } from './system';

export type ChunkId = 'CNAM' | 'MISC' | 'ALTM' | 'XTER' | 'XBLD' | 'XZON' | 'XUND' | 'XTXT' | 'XLAB' | 'XMIC' | 'XTHG' | 'XBIT' | 'XTRF' | 'XPLT' | 'XVAL' | 'XCRM' | 'XPLC' | 'XFIR' | 'XPOP' | 'XROG' | 'XGRP' | 'TEXT' | 'SCEN' | 'PICT' | 'TMPL';
/** 定长 chunk 的解压后字节数（TEXT / SCEN / PICT / TMPL 为变长情景扩展，不在表内）。 */
export const CHUNK_SIZES: Readonly<Record<Exclude<ChunkId, 'TEXT' | 'SCEN' | 'PICT' | 'TMPL'>, number>> = {
  CNAM: 32, MISC: 4800, ALTM: 32768, XTER: 16384, XBLD: 16384, XZON: 16384, XUND: 16384, XTXT: 16384, XLAB: 6400, XMIC: 1200, XTHG: 480, XBIT: 16384,
  XTRF: 4096, XPLT: 4096, XVAL: 4096, XCRM: 4096, XPLC: 1024, XFIR: 1024, XPOP: 1024, XROG: 1024, XGRP: 3328 };
/** 不经 RLE 压缩的 chunk。 */
export const UNCOMPRESSED: ReadonlySet<ChunkId> = new Set<ChunkId>(['CNAM', 'ALTM', 'TEXT', 'SCEN', 'PICT', 'TMPL']);
/** 写出顺序 = 全部 ChunkId（情景 chunk 仅在 scenario 存在时写）。 */
export const WRITE_ORDER: readonly ChunkId[] = ['CNAM', 'MISC', 'ALTM', 'XTER', 'XBLD', 'XZON', 'XUND', 'XTXT', 'XLAB', 'XMIC', 'XTHG', 'XBIT', 'XTRF', 'XPLT', 'XVAL', 'XCRM', 'XPLC', 'XFIR', 'XPOP', 'XROG', 'XGRP', 'TEXT', 'SCEN', 'PICT', 'TMPL'];
/** 解压后的原始 chunk 集合：导入 / 导出的中间表示，与 CityState 解耦。 */
export interface Sc2Document {
  cityName: string; misc: Int32Array /*1200*/; altm: Uint16Array /*16384*/;
  xter: Uint8Array; xbld: Uint8Array; xzon: Uint8Array; xund: Uint8Array; xtxt: Uint8Array; xbit: Uint8Array;
  xlab: Uint8Array; xmic: Uint8Array; xthg: Uint8Array;
  xtrf: Uint8Array; xplt: Uint8Array; xval: Uint8Array; xcrm: Uint8Array; xplc: Uint8Array; xfir: Uint8Array; xpop: Uint8Array; xrog: Uint8Array;
  xgrp: Int32Array /*832*/;
  scenario?: { texts: { kind: number; text: string }[]; scen: Uint8Array; pict?: Uint8Array; tmpl?: Uint8Array };
  unknownChunks: { id: string; data: Uint8Array }[];
}
export interface ReadResult<T> { value: T; diagnostics: Diagnostic[] }
export interface Sc2ExportOptions { compat?: boolean }           // compat：清零 0x1054–0x10B7 与 0x10BC–0x12BB，不写 PRNG 标志 / 侧表
/** 纯编解码（WP2 实现，不认识 CityState）。 */
export interface Sc2Codec { readSc2(buf: ArrayBuffer, fileName?: string): ReadResult<Sc2Document>; writeSc2(doc: Sc2Document): ArrayBuffer; newDocument(): Sc2Document }
/** MISC 字节偏移表（spec:file-formats §3.4.4 全表）+ 零区注册（本项目扩展，防碰撞）。偏移为相对 MISC 数据起点的字节偏移，恒 4 字节对齐。 */
export const MISC = {
  header: 0x0000, cityMode: 0x0004, rotation: 0x0008, yearFounded: 0x000c, cityAge: 0x0010, money: 0x0014, bondCount: 0x0018, difficulty: 0x001c, cityStatus: 0x0020,
  cityValue: 0x0024, landValueSum: 0x0028, crimeSum: 0x002c, trafficCount: 0x0030, pollution: 0x0034, fame: 0x0038, advertising: 0x003c, garbage: 0x0040,
  workforcePct: 0x0044, lifeExpectancy: 0x0048, educationQuotient: 0x004c, nationalPop: 0x0050, nationalValue: 0x0054, nationalTax: 0x0058, nationalTrend: 0x005c,
  heat: 0x0060, wind: 0x0064, humidity: 0x0068, weather: 0x006c, disaster: 0x0070, residentialPop: 0x0074, rewardsAvailable: 0x0078,
  cohorts: 0x007c, industryGraph: 0x016c, tileCounts: 0x01f0, zoneTileCounts: 0x05f0, bonds: 0x0610, neighbors: 0x06d8, rciDemand: 0x0718, techYears: 0x0738,
  taxRes: 0x077c, taxCom: 0x07e8, taxInd: 0x0854, ordinanceBlock: 0x08c0, bondBlock: 0x0930,
  svcPolice: 0x0998, svcFire: 0x0a04, svcHealth: 0x0a70, svcSchools: 0x0adc, svcColleges: 0x0b48, svcRoads: 0x0bb4, svcHighways: 0x0c20, svcBridges: 0x0c8c, svcRail: 0x0cf8, svcSubway: 0x0d64, svcTunnel: 0x0dd0,
  yearEnd: 0x0e3c, seaLevel: 0x0e40, terrainCoast: 0x0e44, terrainRiver: 0x0e48, militaryBase: 0x0e4c, paperList: 0x0e50, newsList: 0x0ec8,
  ordinances: 0x0fa0, unemployed: 0x0fa4, militaryCounts: 0x0fa8, subwayCount: 0x0fe8, speed: 0x0fec, autoBudget: 0x0ff0, autoGoto: 0x0ff4, sound: 0x0ff8, music: 0x0ffc,
  noDisasters: 0x1000, paperDelivery: 0x1004, extraPaper: 0x1008, paperChoice: 0x100c, zoom: 0x1014, viewX: 0x1018, viewY: 0x101c,
  arcoPop: 0x1020, connectionTiles: 0x1024, sportsTeams: 0x1028, normalPop: 0x102c, industryBonus: 0x1030, pollutionBonus: 0x1034, oldArrests: 0x1038, policeBonus: 0x103c,
  pendingDisaster: 0x1040, disasterActive: 0x1048, goDisaster: 0x104c, sewerBonus: 0x1050,
  // ---- 零区（原版样本恒为 0）：本项目扩展 ----
  prngMarker: 0x1054, prngState: 0x1058, saveFormatVersion: 0x105c, viewZoom: 0x1060, xtxtShadow: 0x10bc /* 512 B 至 0x12BB */,
} as const;
export type MiscKey = keyof typeof MISC;
/** 每个 MISC 条目占用的字节数（标量 4；数组块按 spec:file-formats §2.3.2 的区间长度）。io.test 据此断言条目两两不重叠且都落在 4800 B 内。 */
export const MISC_BYTES: Readonly<Record<MiscKey, number>> = {
  header: 4, cityMode: 4, rotation: 4, yearFounded: 4, cityAge: 4, money: 4, bondCount: 4, difficulty: 4, cityStatus: 4,
  cityValue: 4, landValueSum: 4, crimeSum: 4, trafficCount: 4, pollution: 4, fame: 4, advertising: 4, garbage: 4,
  workforcePct: 4, lifeExpectancy: 4, educationQuotient: 4, nationalPop: 4, nationalValue: 4, nationalTax: 4, nationalTrend: 4,
  heat: 4, wind: 4, humidity: 4, weather: 4, disaster: 4, residentialPop: 4, rewardsAvailable: 4,
  cohorts: 20 * 12, industryGraph: 33 * 4, tileCounts: 256 * 4, zoneTileCounts: 8 * 4, bonds: 50 * 4, neighbors: 4 * 16, rciDemand: 3 * 4, techYears: 17 * 4,
  taxRes: 27 * 4, taxCom: 27 * 4, taxInd: 27 * 4, ordinanceBlock: 28 * 4, bondBlock: 26 * 4,
  svcPolice: 27 * 4, svcFire: 27 * 4, svcHealth: 27 * 4, svcSchools: 27 * 4, svcColleges: 27 * 4, svcRoads: 27 * 4, svcHighways: 27 * 4, svcBridges: 27 * 4, svcRail: 27 * 4, svcSubway: 27 * 4, svcTunnel: 27 * 4,
  yearEnd: 4, seaLevel: 4, terrainCoast: 4, terrainRiver: 4, militaryBase: 4, paperList: 30 * 4, newsList: 54 * 4,
  ordinances: 4, unemployed: 4, militaryCounts: 16 * 4, subwayCount: 4, speed: 4, autoBudget: 4, autoGoto: 4, sound: 4, music: 4,
  noDisasters: 4, paperDelivery: 4, extraPaper: 4, paperChoice: 4, zoom: 4, viewX: 4, viewY: 4,
  arcoPop: 4, connectionTiles: 4, sportsTeams: 4, normalPop: 4, industryBonus: 4, pollutionBonus: 4, oldArrests: 4, policeBonus: 4,
  pendingDisaster: 4, disasterActive: 4, goDisaster: 4, sewerBonus: 4,
  prngMarker: 4, prngState: 4, saveFormatVersion: 4, viewZoom: 4, xtxtShadow: 512,
};
/** MISC 零区范围（compat 导出时清零）：[start, endExclusive)。 */
export const MISC_ZERO_RANGES: ReadonlyArray<readonly [number, number]> = [[0x1054, 0x10b8], [0x10bc, 0x12bc]];
export const miscGet = (m: Int32Array, off: number): number => m[off >> 2]!;
export const miscSet = (m: Int32Array, off: number, v: number): void => { m[off >> 2] = v | 0; };
export const COHORT_COUNT = 20, COHORT_STRIDE = 12;
export type CohortField = 'count' | 'eqSum' | 'leSum';
const COHORT_FIELD_SLOT: Record<CohortField, number> = { count: 0, eqSum: 1, leSum: 2 };   // 字段序是唯一允许改动处（spec:file-formats §5.14）
/** 年龄队列 k（0..19）字段 f 的 MISC 字节偏移；所有读写一律经此函数，不散写字面偏移。 */
export const cohortOffset = (k: number, f: CohortField): number => MISC.cohorts + k * COHORT_STRIDE + COHORT_FIELD_SLOT[f] * 4;

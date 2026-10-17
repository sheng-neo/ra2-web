// ===== io/sc2/misc.ts =====（spec:file-formats §2.2.2 / §2.2.8 / §2.2.9 / §2.3 / §3.4.4）
// MISC / ALTM / XLAB / XMIC 的访问器：偏移表与 miscGet / miscSet / cohortOffset 的唯一真源在 contracts/io.ts，这里 re-export 并补齐
// 结构化读写（ALTM 拆位 / 打包、XLAB 标签、年龄队列、27 槽预算块、邻城记录、科技年份、军事计数）。纯函数，不认识 CityState。
import { COHORT_COUNT, COHORT_STRIDE, MISC, MISC_BYTES, MISC_ZERO_RANGES, cohortOffset, miscGet, miscSet } from '../../contracts/io';
import type { CohortField, MiscKey } from '../../contracts/io';
import { decodeLatin1, decodeUtf8, encodeUtf8 } from './bytes';

export { COHORT_COUNT, COHORT_STRIDE, MISC, MISC_BYTES, MISC_ZERO_RANGES, cohortOffset, miscGet, miscSet };
export type { CohortField, MiscKey };

/** MISC 头字段的固定值（spec §2.3.1：恒 0x122）。 */
export const MISC_HEADER_VALUE = 0x122;

// ---------------------------------------------------------------- ALTM（u16，spec §2.2.2 / spec:terrain §2.3）
export const ALTM_ALT_MASK = 0x001f, ALTM_WATER_SHIFT = 5, ALTM_WATER_MASK = 0x03e0, ALTM_TUNNEL_SHIFT = 10, ALTM_TUNNEL_MASK = 0xfc00;
export interface AltmFields { alt: number; waterLevel: number; tunnelLevels: number }
export const altmSplit = (v: number): AltmFields => ({ alt: v & ALTM_ALT_MASK, waterLevel: (v & ALTM_WATER_MASK) >> ALTM_WATER_SHIFT, tunnelLevels: (v & ALTM_TUNNEL_MASK) >> ALTM_TUNNEL_SHIFT });
export const altmPack = (alt: number, waterLevel: number, tunnelLevels: number): number =>
  ((alt & 0x1f) | ((waterLevel & 0x1f) << ALTM_WATER_SHIFT) | ((tunnelLevels & 0x3f) << ALTM_TUNNEL_SHIFT)) & 0xffff;

// ---------------------------------------------------------------- CNAM / XLAB 字符串
export const CNAM_MAX_BYTES = 31, XLAB_RECORD = 25, XLAB_MAX_BYTES = 23, XLAB_COUNT = 256;
/** 字节 → 文本：合法 UTF-8 按 UTF-8（本项目自己写出的非 ASCII 名），否则 Latin-1（原版文件）。 */
export const bytesToText = (b: ArrayLike<number>): string => decodeUtf8(b) ?? decodeLatin1(b);
/** 文本 → 字节（UTF-8；ASCII 文本与原版一致），按 max 截断且不切断多字节序列。 */
export function textToBytes(s: string, max: number): Uint8Array {
  const full = encodeUtf8(s);
  if (full.length <= max) return full;
  let n = max;
  while (n > 0 && (full[n]! & 0xc0) === 0x80) n--;
  return full.subarray(0, n);
}
/** CNAM 数据（32 B）→ 城市名：跳过首字节（名义长度，不可信），到首个 0 为止，≤ 31 字节。 */
export function readCName(data: Uint8Array): string {
  const end = Math.min(data.length, 1 + CNAM_MAX_BYTES);
  let stop = 1;
  while (stop < end && data[stop] !== 0) stop++;
  return stop <= 1 ? '' : bytesToText(data.subarray(1, stop));
}
/** 城市名 → CNAM 32 B：[0x1F][≤31 B][0 填充]。 */
export function writeCName(name: string): Uint8Array {
  const out = new Uint8Array(32);
  const b = textToBytes(name, CNAM_MAX_BYTES);
  out[0] = 0x1f; out.set(b, 1);
  return out;
}
/** XLAB 第 k 条（0..255）：按 len 取且在首个 0 截断，≤ 23 字节。 */
export function getLabel(xlab: Uint8Array, k: number): string {
  if (k < 0 || k >= XLAB_COUNT) return '';
  const base = k * XLAB_RECORD;
  const len = Math.min(xlab[base] ?? 0, XLAB_MAX_BYTES);
  let stop = 0;
  while (stop < len && xlab[base + 1 + stop] !== 0) stop++;
  return stop === 0 ? '' : bytesToText(xlab.subarray(base + 1, base + 1 + stop));
}
/** 写 XLAB 第 k 条：[len][text][0 填充至 25]。 */
export function setLabel(xlab: Uint8Array, k: number, text: string): void {
  if (k < 0 || k >= XLAB_COUNT) return;
  const base = k * XLAB_RECORD;
  const b = textToBytes(text, XLAB_MAX_BYTES);
  xlab.fill(0, base, base + XLAB_RECORD);
  xlab[base] = b.length; xlab.set(b, base + 1);
}

// ---------------------------------------------------------------- XMIC（150 × 8 B，spec §2.2.9）
export const XMIC_RECORD = 8, XMIC_COUNT = 150;
export interface XmicRecord { tileId: number; stat0: number; stat1: number; stat2: number; stat3: number }
export function getXmic(xmic: Uint8Array, r: number): XmicRecord {
  const b = r * XMIC_RECORD;
  const u16 = (o: number): number => ((xmic[b + o] ?? 0) << 8) | (xmic[b + o + 1] ?? 0);
  return { tileId: xmic[b] ?? 0, stat0: xmic[b + 1] ?? 0, stat1: u16(2), stat2: u16(4), stat3: u16(6) };
}
export function setXmic(xmic: Uint8Array, r: number, v: XmicRecord): void {
  const b = r * XMIC_RECORD;
  if (b + XMIC_RECORD > xmic.length) return;
  xmic[b] = v.tileId & 0xff; xmic[b + 1] = v.stat0 & 0xff;
  const u16 = (o: number, x: number): void => { xmic[b + o] = (x >> 8) & 0xff; xmic[b + o + 1] = x & 0xff; };
  u16(2, v.stat1); u16(4, v.stat2); u16(6, v.stat3);
}

// ---------------------------------------------------------------- MISC 结构化访问
export interface Cohort { count: number; eqSum: number; leSum: number }
export const readCohorts = (m: Int32Array): Cohort[] => Array.from({ length: COHORT_COUNT }, (_, k) => ({
  count: miscGet(m, cohortOffset(k, 'count')), eqSum: miscGet(m, cohortOffset(k, 'eqSum')), leSum: miscGet(m, cohortOffset(k, 'leSum')) }));
export function writeCohorts(m: Int32Array, cohorts: ReadonlyArray<Cohort>): void {
  for (let k = 0; k < COHORT_COUNT; k++) {
    const c = cohorts[k] ?? { count: 0, eqSum: 0, leSum: 0 };
    miscSet(m, cohortOffset(k, 'count'), c.count); miscSet(m, cohortOffset(k, 'eqSum'), c.eqSum); miscSet(m, cohortOffset(k, 'leSum'), c.leSum);
  }
}
/** 27 槽税率 / 服务块（spec §2.3.3）：slot 0 当前量、1 当前率、3/5/…/25 月量、4/6/…/26 月率。 */
export const BUDGET_BLOCK_SLOTS = 27;
export type BudgetBlockKey = 'taxRes' | 'taxCom' | 'taxInd' | 'svcPolice' | 'svcFire' | 'svcHealth' | 'svcSchools' | 'svcColleges' | 'svcRoads' | 'svcHighways' | 'svcBridges' | 'svcRail' | 'svcSubway' | 'svcTunnel';
export const blockSlotOffset = (block: BudgetBlockKey, slot: number): number => MISC[block] + slot * 4;
export const monthCountOffset = (block: BudgetBlockKey, month: number): number => blockSlotOffset(block, 3 + month * 2);   // month 0..11
export const monthRateOffset = (block: BudgetBlockKey, month: number): number => blockSlotOffset(block, 4 + month * 2);
/** 邻城 4 × 16 B：[index, population, value, fame]。 */
export type NeighborField = 'index' | 'population' | 'value' | 'fame';
const NEIGHBOR_FIELD_SLOT: Record<NeighborField, number> = { index: 0, population: 1, value: 2, fame: 3 };
export const neighborOffset = (k: number, f: NeighborField): number => MISC.neighbors + k * 16 + NEIGHBOR_FIELD_SLOT[f] * 4;
export const techYearOffset = (slot: number): number => MISC.techYears + slot * 4;      // 0..16
export const bondOffset = (k: number): number => MISC.bonds + k * 4;                     // 0..49
export const tileCountOffset = (id: number): number => MISC.tileCounts + id * 4;         // 0..255
export const zoneTileCountOffset = (k: number): number => MISC.zoneTileCounts + k * 4;   // 0..7
export const militaryCountOffset = (k: number): number => MISC.militaryCounts + k * 4;   // 0..15
export const rciDemandOffset = (k: 0 | 1 | 2): number => MISC.rciDemand + k * 4;
export const industryGraphOffset = (k: number): number => MISC.industryGraph + k * 4;    // 0..32
/** 某偏移是否落在零区（compat 导出时清零的区间）。 */
export const inZeroRange = (off: number): boolean => MISC_ZERO_RANGES.some(([a, b]) => off >= a && off < b);

// ===== snapshot.ts =====
// 通用快照 schema 与哈希（CONTRACTS §O、ARCHITECTURE §4.1 / §4.2）：静态有序表驱动，不自动遍历。
// io/snapshot 的编解码器只按本文件的表读写 CityState；core 的 hash(scope) 与 testkit.hashOf 走同一遍历器。
import type { CityState } from './state';
import { LAYER_LENGTHS } from './state';
import type { SystemId, Diagnostic } from './system';
export const SNAPSHOT_MAGIC = 'SC2KWEBS', SNAPSHOT_VERSION = 2;
export type HashScope = 'full' | 'sc2';
/** hash 标注：'sc2' = 两档都进；'full' = 只进 'full' 档；'none' = 两档都不进（见 HASH_EXCLUDE）。 */
export type HashTag = HashScope | 'none';
/** 标注是否落入某档：inHashScope('sc2', 'sc2') 与 inHashScope('full', 'full') 为真，'none' 恒假，'full' 标注不进 'sc2' 档。 */
export const inHashScope = (tag: HashTag, scope: HashScope): boolean => tag !== 'none' && (scope === 'full' || tag === 'sc2');
export type SnapshotEntryKind = 'u8' | 'u16' | 'i32' | 'scalars' | 'strings' | 'priv';
/** 一条静态 schema 项；hash 标注决定它进入哪一档哈希（'none' = 两档都不进）。entries 的顺序即编码顺序。 */
export interface SnapshotSchemaEntry { path: string; kind: SnapshotEntryKind; len?: number; hash: HashTag }

/**
 * 路径语法（SCALAR_FIELDS.path / STRING_FIELDS / SNAPSHOT_SCHEMA.path 共用；parsePath 为唯一解析器）：
 *  - 以 '.' 分段；每段是一个属性名，可紧跟一个十进制下标 `[k]`，如 'neighbors[2].connections.road'、'economy.bonds[7].rateRaw'。
 *  - 从 CityState 根对象逐段取值（属性名 → 对象属性；下标 → 数组元素）；编解码器按此读写，不做其它推断。
 *  - 三个保留路径不是 CityState 字段：'scalars'（按 SCALAR_FIELDS 打平为 i32 序列）、'strings'（按 STRING_FIELDS 顺序写 u16 长度 + UTF-8）、'priv'（按 SYSTEM_ORDER 逐系统规范化编码）。
 *  - 虚拟标量 'economy.bondCount'：读 = economy.bonds.length；解码时据此把 bonds 截断 / 补齐为该长度（新增条目为 {0,0,0}）。
 *  - 'economy.bonds[k].*'（k = 0..BOND_SLOTS−1）：k ≥ bonds.length 时读 0；解码时只回填 k < bondCount 的条目（其余忽略）。
 *  - bool 字段（ScalarField.bool）编码为 0 / 1，解码为 v !== 0；其余标量按 i32 写入（非整数 / 超出 i32 由编码器抛错；funds 可为负）。
 *  - 'neighbors[k].*' 固定 NEIGHBOR_SLOTS = 4 条（createCityState 保证存在）。
 */
export function parsePath(path: string): ReadonlyArray<string | number> {
  const out: (string | number)[] = [];
  for (const seg of path.split('.')) {
    const m = /^([A-Za-z_$][\w$]*)(?:\[(\d+)\])?$/.exec(seg);
    if (!m) throw new Error(`snapshot: 非法路径段 "${seg}"（${path}）`);
    out.push(m[1]!);
    if (m[2] !== undefined) out.push(Number(m[2]));
  }
  return out;
}

export const BOND_SLOTS = 50, NEIGHBOR_SLOTS = 4;
/** 一条顶层标量：path 见上文语法；hash 见 HashTag；bool 表示 CityState 中为 boolean（编码 0/1）。 */
export interface ScalarField { path: string; hash: HashTag; bool?: true }
const f = (path: string, hash: HashTag = 'sc2'): ScalarField => ({ path, hash });
const b = (path: string, hash: HashTag = 'sc2'): ScalarField => ({ path, hash, bool: true });
const NEIGHBOR_LEAVES = ['index', 'population', 'value', 'fame', 'edge', 'connections.road', 'connections.rail', 'connections.highway'] as const;
const BOND_LEAVES = ['rateRaw', 'issuedYear', 'issuedMonth'] as const;
const neighborFields = (k: number): ScalarField[] => NEIGHBOR_LEAVES.map((leaf) => f(`neighbors[${k}].${leaf}`));
const bondFields = (k: number): ScalarField[] => BOND_LEAVES.map((leaf) => f(`economy.bonds[${k}].${leaf}`));
const range = (n: number): number[] => Array.from({ length: n }, (_, k) => k);

/**
 * 顶层标量的固定路径序（穷举 CityState 的全部 number / boolean 叶子；snapshot.test 用 createCityState() 遍历对账）。
 * 不在此表的定长字段（economy.industryTax / funding、industry.ratio / demand、demographics.cohorts、tech.invented / announced）作为 TypedArray 条目放在 SNAPSHOT_SCHEMA；
 * formatVersion 是文件头常量，不是标量。hash 标注：
 *  'none'：clock.speed / modalPause / accumMs、terrain.rotation（setView 写，§K）、view.*、census.workforcePctUsed（demographics.workforcePct 的只读副本）
 *  'full'：clock.phaseCursor（.SC2 要求 0）、economy.yearOpeningFunds
 *  其余 'sc2'。
 */
export const SCALAR_FIELDS: readonly ScalarField[] = [
  // clock
  f('clock.age'), f('clock.foundedYear'), f('clock.speed', 'none'), f('clock.mode'), f('clock.modalPause', 'none'), f('clock.phaseCursor', 'full'),
  f('clock.accumMs', 'none'), f('clock.disasterTicks'), f('clock.prngState'),
  // terrain
  f('terrain.seaLevel'), b('terrain.coast'), b('terrain.river'), f('terrain.rotation', 'none'),
  // economy（industryTax / funding 为 TypedArray 条目）
  f('economy.funds'), f('economy.difficulty'), f('economy.taxRate.r'), f('economy.taxRate.c'), f('economy.taxRate.i'),
  f('economy.ordinances'), f('economy.fedRateRaw'), b('economy.autoBudget'),
  f('economy.counters.advertising'), f('economy.counters.fame'), b('economy.impeached'), f('economy.yearOpeningFunds', 'full'),
  f('economy.bondCount'), ...range(BOND_SLOTS).flatMap(bondFields),
  // census
  f('census.res'), f('census.com'), f('census.ind'), f('census.arcoPop'), f('census.normalPop'), f('census.citySize'),
  f('census.taxableRes'), f('census.taxableCom'), f('census.taxableInd'), f('census.workforcePctUsed', 'none'),
  f('census.workforce'), f('census.jobs'), f('census.unemployedN'), f('census.unemploymentPct'),
  f('census.tiles.res'), f('census.tiles.com'), f('census.tiles.ind'), f('census.tiles.total'),
  // demand / caps / industry（ratio / demand 为 TypedArray 条目）
  f('demand.r'), f('demand.c'), f('demand.i'), f('caps.r'), f('caps.c'), f('caps.i'), f('industry.pollutionBonus'),
  // neighbors（名字在 STRING_FIELDS）
  ...range(NEIGHBOR_SLOTS).flatMap(neighborFields),
  // national
  f('national.population'), f('national.value'), f('national.tax'), f('national.trend'),
  // demographics（cohorts 为 TypedArray 条目）
  f('demographics.workforcePct'), f('demographics.workforceEQ'), f('demographics.workforceLE'),
  // rewards
  f('rewards.progression'), f('rewards.grantedMask'), f('rewards.militaryBase'), f('rewards.prisonBonus'), f('rewards.oldArrests'), f('rewards.stadiumTeams'), f('rewards.mayorApproval'),
  // totals
  f('totals.pollution'), f('totals.landValue'), f('totals.crime'), f('totals.developedTiles'), f('totals.centerX'), f('totals.centerY'),
  // traffic
  f('traffic.total'), f('traffic.graph'), f('traffic.roadTiles'), f('traffic.highwayTiles'), f('traffic.bridgeTiles'),
  // weather
  f('weather.heat'), f('weather.wind'), f('weather.humid'), f('weather.trend'), f('weather.season'),
  // disaster
  f('disaster.pending'), f('disaster.current'), b('disaster.active'), f('disaster.pointX'), f('disaster.pointY'), b('disaster.noDisasters'), b('disaster.autoGoto'), f('disaster.windOverride'),
  // tech（invented / announced 为 TypedArray 条目；无标量）
  // utilities
  f('utilities.power.generation'), f('utilities.power.consumers'), f('utilities.power.supplied'), f('utilities.power.usagePct'), f('utilities.power.unpoweredBuildingTiles'),
  f('utilities.water.supply'), f('utilities.water.consumers'), f('utilities.water.watered'), f('utilities.water.usagePct'), f('utilities.water.towerCapacity'),
  f('utilities.water.towerCharged'), f('utilities.water.treatmentCapacity'), b('utilities.water.treatmentSufficient'), f('utilities.water.unwateredBuildingTiles'),
  // view（不入哈希）
  f('view.x', 'none'), f('view.y', 'none'), f('view.zoom', 'none'),
];
/** 'strings' 条目的固定顺序（u16 长度 + UTF-8）；逐项哈希标注见 stringFieldHash（条目级的 hash 'sc2' 只是名义值，与 scalars 同理）。 */
export const STRING_FIELDS: readonly string[] = ['cityName', 'mayorName', ...range(NEIGHBOR_SLOTS).map((k) => `neighbors[${k}].name`)];
/** 字符串字段的哈希标注：`.SC2`（MISC / CNAM）没有市长名字段，mayorName 若标 'sc2' 会让 .SC2 往返改变 hash('sc2')，故标 'full'；其余 'sc2'。 */
export const STRING_FIELD_HASH: Readonly<Record<string, HashTag>> = { mayorName: 'full' };
export const stringFieldHash = (path: string): HashTag => STRING_FIELD_HASH[path] ?? 'sc2';

const u8 = (path: string, len: number, hash: HashTag = 'sc2'): SnapshotSchemaEntry => ({ path, kind: 'u8', len, hash });
const i32 = (path: string, len: number, hash: HashTag = 'sc2'): SnapshotSchemaEntry => ({ path, kind: 'i32', len, hash });
const L = LAYER_LENGTHS;
/**
 * 静态有序表（编码顺序）：layers.*（u8，各自长度）→ maps.* → counts.*（i32）→ xgrp（i32 832）→ rawMisc（i32 1200，hash 'none'）
 *  → 小型定长 TypedArray（economy.industryTax / funding、industry.ratio / demand、demographics.cohorts、tech.invented / announced）
 *  → scalars（按 SCALAR_FIELDS 打平，逐项 hash 以 SCALAR_FIELDS[i].hash 为准，本条目的 hash 只是名义值）→ strings（STRING_FIELDS）→ priv（hash 'full'，按 SYSTEM_ORDER 逐系统规范化编码：键名排序、TypedArray 追加为二进制块、整数 i32）。
 * TypedArray 条目的 len 必须等于 createCityState() 中对应数组的长度（snapshot.test 对账）。
 */
export const SNAPSHOT_SCHEMA: readonly SnapshotSchemaEntry[] = [
  u8('layers.alt', L.tile), u8('layers.waterLevel', L.tile), u8('layers.tunnelLevels', L.tile),
  u8('layers.xter', L.tile), u8('layers.xbld', L.tile), u8('layers.xzon', L.tile), u8('layers.xund', L.tile), u8('layers.xtxt', L.tile), u8('layers.xbit', L.tile),
  u8('layers.xlab', L.xlab), u8('layers.xmic', L.xmic), u8('layers.xthg', L.xthg),
  u8('maps.xtrf', L.half), u8('maps.xplt', L.half), u8('maps.xval', L.half), u8('maps.xcrm', L.half),
  u8('maps.xplc', L.quarter), u8('maps.xfir', L.quarter), u8('maps.xpop', L.quarter), u8('maps.xrog', L.quarter),
  i32('counts.tile', L.countTile), i32('counts.zone', L.countZone), i32('counts.military', L.countMilitary),
  i32('xgrp', L.xgrp),
  i32('rawMisc', L.rawMisc, 'none'),
  i32('economy.industryTax', L.budgetLines), u8('economy.funding', L.budgetLines),
  i32('industry.ratio', L.budgetLines), i32('industry.demand', L.budgetLines),
  i32('demographics.cohorts', L.cohorts),
  i32('tech.invented', L.tech), u8('tech.announced', L.tech),
  { path: 'scalars', kind: 'scalars', len: SCALAR_FIELDS.length, hash: 'sc2' },
  { path: 'strings', kind: 'strings', len: STRING_FIELDS.length, hash: 'sc2' },
  { path: 'priv', kind: 'priv', hash: 'full' },
];
/**
 * 显式排除表（两档都不进）= SCALAR_FIELDS ∪ SNAPSHOT_SCHEMA 中全部 hash:'none' 的路径（snapshot.test 断言两者相等）。
 * 'sc2' 档另排除 priv 与 hash:'full' 的标量（clock.phaseCursor、economy.yearOpeningFunds）——由标注推出，不在本表。
 */
export const HASH_EXCLUDE: readonly string[] = [
  'clock.speed', 'clock.modalPause', 'clock.accumMs', 'terrain.rotation', 'view.x', 'view.y', 'view.zoom', 'census.workforcePctUsed', 'rawMisc'];
/** 每个系统 priv 的字节预算（编码后）；registry.test / snapshot.test 断言。总和 ≤ PRIV_BUDGET_TOTAL_MAX。 */
export const PRIV_BUDGET_BYTES: Readonly<Record<Exclude<SystemId, 'core'>, number>> = {
  terrain: 8192, placement: 4096, utilities: 16384, transport: 65536, zones: 131072, services: 32768, economy: 16384, events: 131072 };
export const PRIV_BUDGET_TOTAL_MAX = 512 * 1024;
export interface SnapshotCodec {
  encode(s: CityState): Uint8Array;                                   // 遇非白名单类型（Map/Set/函数/非有限数/非整数/类实例）抛错
  decode(bytes: Uint8Array, into: CityState): Diagnostic[];           // 缺失条目补默认；priv.v 交给各系统 postLoad('snapshot') 处理
  hash(s: CityState, scope: HashScope): number;                       // fnv1a32 over 同一遍历器输出的、按 scope 过滤后的字节
  validatePriv(s: CityState): Diagnostic[];                           // 类型白名单 + 预算；测试与 debug 面板用
}

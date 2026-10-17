// ===== sim/zones/buildings.ts =====
// 分区建筑表（spec:zones §2.3）：从 CATALOGUE 派生的 256 项查表（类别 / 密度级 / 尺寸 / 档次 / 人口 / 权重）、
// 过渡态 ID 组（施工 / 废弃 / 瓦砾，[高]）与候选抽取 pickBuilding（含 §2.3 的 tier 回退规则 [设计]）。
import type { CatalogueApi } from '../../contracts/catalogue';
import type { ZoneType } from '../../contracts/grid';

/** 建筑瓦片对 lot 的意义：0 非分区 / 1 已建分区建筑 / 2 施工 / 3 废弃。 */
export const enum LotClass { None = 0, Built = 1, Construct = 2, Abandoned = 3 }
/** 分区类型下标（R / C / I），与 census 的 res / com / ind 顺序一致。 */
export const ZONE_TYPES: readonly ZoneType[] = ['R', 'C', 'I'];
export const zoneIdxOf = (zt: ZoneType): number => (zt === 'R' ? 0 : zt === 'C' ? 1 : 2);
export const NO_ZONE = 255;
/** 密度级 → 尺寸（下标 = level，0 占位）。 */
export const SIZE_OF_LEVEL: readonly number[] = [1, 1, 2, 2, 3];
/** 过渡态 ID：按 level 1..4 分组（spec:zones §2.3 过渡态建筑表 [高]）。 */
export const CONSTRUCTION_IDS: ReadonlyArray<readonly [number, number]> = [[0x88, 0x89], [0xa6, 0xa7], [0xa8, 0xa9], [0xc2, 0xc3]];
export const ABANDONED_IDS: ReadonlyArray<readonly [number, number]> = [[0x8a, 0x8b], [0xaa, 0xab], [0xac, 0xad], [0xc4, 0xc5]];
export const RUBBLE_IDS: readonly number[] = [0x01, 0x02, 0x03, 0x04];
export const RADIOACTIVE_ID = 0x05;
export const isTree = (b: number): boolean => b >= 0x06 && b <= 0x0c;
export const isRubble = (b: number): boolean => b >= 0x01 && b <= 0x04;

export interface Candidate { id: number; w: number }
export interface ZoneTable {
  readonly cls: Uint8Array;        // 256：LotClass
  readonly level: Uint8Array;      // 256：密度级 1..4（过渡态按 ID 组）
  readonly size: Uint8Array;       // 256：占地边长
  readonly zoneIdx: Uint8Array;    // 256：已建建筑的分区类型下标；其余 NO_ZONE
  readonly tier: Uint8Array;       // 256：已建建筑的档次
  readonly pop: Int32Array;        // 256：R 居民 / C、I 岗位
  /** 候选表：下标 = (zoneIdx * 5 + level) * 3 + tier。 */
  readonly candidates: ReadonlyArray<readonly Candidate[]>;
}

const tables = new WeakMap<CatalogueApi, ZoneTable>();

/** 从 catalogue 派生分区建筑表（按 catalogue 引用缓存）。 */
export function zoneTableFor(cat: CatalogueApi): ZoneTable {
  const hit = tables.get(cat);
  if (hit) return hit;
  const cls = new Uint8Array(256), level = new Uint8Array(256), size = new Uint8Array(256);
  const zoneIdx = new Uint8Array(256).fill(NO_ZONE), tier = new Uint8Array(256), pop = new Int32Array(256);
  const cands: Candidate[][] = [];
  for (let k = 0; k < 3 * 5 * 3; k++) cands.push([]);
  for (let id = 0; id < 256; id++) {
    const def = cat.BUILDINGS[id];
    size[id] = cat.FOOTPRINT[id] ?? 1;
    if (!def) continue;
    if (def.zone && def.transition === undefined) {
      cls[id] = LotClass.Built;
      level[id] = def.zone.level;
      const zi = zoneIdxOf(def.zone.type);
      zoneIdx[id] = zi; tier[id] = def.zone.tier;
      pop[id] = def.zone.type === 'R' ? def.residents : def.jobs;
      cands[(zi * 5 + def.zone.level) * 3 + def.zone.tier]!.push({ id, w: Math.max(1, def.zone.weight | 0) });
    }
  }
  for (let lv = 1; lv <= 4; lv++) {
    for (const id of CONSTRUCTION_IDS[lv - 1]!) { cls[id] = LotClass.Construct; level[id] = lv; }
    for (const id of ABANDONED_IDS[lv - 1]!) { cls[id] = LotClass.Abandoned; level[id] = lv; }
  }
  const table: ZoneTable = { cls, level, size, zoneIdx, tier, pop, candidates: cands };
  tables.set(cat, table);
  return table;
}

/** 候选集：先取 tier 完全匹配者；没有则取 |tier − t| 最小者，并列取较低 tier（spec:zones §2.3 [设计]）。 */
export function candidatesFor(tbl: ZoneTable, zoneIdx: number, level: number, tier: number): readonly Candidate[] {
  const base = (zoneIdx * 5 + level) * 3;
  const exact = tbl.candidates[base + tier];
  if (exact && exact.length > 0) return exact;
  for (let d = 1; d <= 2; d++) {
    const lo = tier - d, hi = tier + d;
    if (lo >= 0) { const c = tbl.candidates[base + lo]; if (c && c.length > 0) return c; }
    if (hi <= 2) { const c = tbl.candidates[base + hi]; if (c && c.length > 0) return c; }
  }
  return [];
}

/**
 * 按权重抽取建筑 ID；drawInt(n) 给出 [0, n) 的随机整数（生长阶段传 prng.int，日末回退传 hash32 % n）。
 * 该 (zone, level) 完全没有候选时返回 0（调用方视为失败）。
 */
export function pickBuilding(tbl: ZoneTable, zoneIdx: number, level: number, tier: number, drawInt: (n: number) => number): number {
  const c = candidatesFor(tbl, zoneIdx, level, tier);
  if (c.length === 0) return 0;
  let total = 0;
  for (const k of c) total += k.w;
  let r = drawInt(total);
  for (const k of c) { if (r < k.w) return k.id; r -= k.w; }
  return c[c.length - 1]!.id;
}

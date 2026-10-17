// ===== data/index.ts =====（CONTRACTS §V：DataEntry = { CATALOGUE, createStrings }；WP0 冻结，Lead 经 RFC 加法修改）
// 全仓库唯一的建筑 / 工具 / 法令 / 文案数据出口：其他模块只从这里读数，不得复制价格、尺寸或文案。
import type { BuildingCategory, BuildingDef, CatalogueApi } from '../contracts/catalogue';
import type { DataEntry } from '../contracts/entrypoints';
import type { Strings, StringTable } from '../contracts/strings';
import { FOOTPRINT } from '../contracts/footprint';
import { BUILDINGS } from './buildings.generated';
import { TOOLS, TOOL_BY_ID } from './tools';
import { TECH_BASE_YEAR } from './techBaseYears';
import { ORDINANCES } from './ordinances';
import { STRINGS_ZH } from './strings.zh';
import { STRINGS_EN } from './strings.en';

export { BUILDINGS } from './buildings.generated';
export { TOOLS, TOOL_BY_ID } from './tools';
export { TECH_BASE_YEAR, TECH_DELAY_YEARS } from './techBaseYears';
export { ORDINANCES, ORDINANCE_COUNT } from './ordinances';
export { STRINGS_ZH } from './strings.zh';
export { STRINGS_EN } from './strings.en';
export type { StringKey } from './strings.zh';

/** CATEGORY[id] = BUILDINGS[id].category（256）。 */
export const CATEGORY: readonly BuildingCategory[] = BUILDINGS.map((b) => b.category);
const BUILDING_BY_KEY: ReadonlyMap<string, BuildingDef> = new Map(BUILDINGS.map((b) => [b.key, b]));

export const CATALOGUE: CatalogueApi = {
  BUILDINGS,
  TOOLS,
  FOOTPRINT,                                     // === contracts/footprint.FOOTPRINT（同一引用；size 列由 catalogue.test 对账）
  CATEGORY,
  TECH_BASE_YEAR,
  ORDINANCES,
  toolById: (id) => TOOL_BY_ID.get(id),
  buildingByKey: (key) => BUILDING_BY_KEY.get(key),
};

/** spec:building-catalogue §3.2 的派生判定。 */
export const isZoneBuilding = (id: number): boolean => id >= 0x70 && id <= 0xc5 && BUILDINGS[id]?.zone !== undefined;
/** 出行无条件目的地：拱城 + 大穹顶（XBLD > 0xFA）。 */
export const isTerminal = (id: number): boolean => id > 0xfa;

const TABLES: Readonly<Record<'zh' | 'en', StringTable>> = { zh: STRINGS_ZH, en: STRINGS_EN };
const own = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * 文案表访问器：t() 支持 {name} 占位替换（args 缺少的占位原样保留），缺键返回键名本身（便于在 UI 上一眼看出漏译）；has() 查键是否存在。
 */
export function createStrings(lang: 'zh' | 'en'): Strings {
  const table = TABLES[lang];
  return {
    lang,
    has: (key) => own(table, key),
    t: (key, args) => {
      const s = own(table, key) ? table[key]! : key;
      if (!args) return s;
      return s.replace(/\{(\w+)\}/g, (m, name: string) => (own(args, name) ? String(args[name]) : m));
    },
  };
}

// 与 contracts/entrypoints.ts 的 DataEntry 对账（类型层）。
({ CATALOGUE, createStrings }) satisfies DataEntry;

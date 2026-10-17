// ===== catalogue.ts =====（spec:building-catalogue §3.1；没有 phase 字段——排期在 app/v1Tools.ts）
// 建筑 / 工具 / 法令数据类型（CONTRACTS §M）：数据由 src/data/** 提供（WP0 生成），本文件只有类型与 17 个科技槽位的键序。
import type { Footprint } from './footprint';
import type { OrdinanceId } from './state';
export type TechKey = 'gas' | 'nuclear' | 'solar' | 'wind' | 'microwave' | 'fusion' | 'airport' | 'highways' | 'buses' | 'subways' | 'waterTreatment' | 'desalinization' | 'arcoPioneer' | 'arcoCanopy' | 'arcoDusk' | 'arcoSkyward';
/** 17 个 MISC 槽位的键顺序（槽 16 未用，为 null）。 */
export const TECH_SLOT_KEYS: ReadonlyArray<TechKey | null> = ['gas', 'nuclear', 'solar', 'wind', 'microwave', 'fusion', 'airport', 'highways', 'buses', 'subways', 'waterTreatment', 'desalinization', 'arcoPioneer', 'arcoCanopy', 'arcoDusk', 'arcoSkyward', null];
export type BuildingCategory = 'ground' | 'rubble' | 'radioactive' | 'tree' | 'park' | 'powerLine' | 'road' | 'rail' | 'tunnel' | 'crossover' | 'highway' | 'highwayCrossover' | 'bridge' | 'onramp' | 'subRail'
  | 'zoneR' | 'zoneC' | 'zoneI' | 'construction' | 'abandoned' | 'powerPlant' | 'civic' | 'recreation' | 'reward' | 'waterFacility' | 'transitStation' | 'airportPart' | 'seaportPart' | 'militaryPart' | 'church' | 'arcology';
export type OrientMode = 'none' | 'byId' | 'flipBit' | 'byIdAndFlip';
export type BudgetLineKey = 'police' | 'fire' | 'health' | 'schools' | 'colleges' | 'roads' | 'highways' | 'bridges' | 'rail' | 'subway' | 'tunnel' | 'busFixed';
export interface RewardUnlock { rewardBit: 0 | 1 | 2 | 3 | 4; popOver: number; once: boolean }
export interface BuildingDef {
  id: number; key: string;
  name: string;                                   // strings 表键（玩家可见名经 t()），不是原版文本
  category: BuildingCategory; size: Footprint; placeable: boolean; tool?: ToolId;
  cost: number; upkeepPerYear: number; budgetLine?: BudgetLineKey; tech?: TechKey; unlock?: RewardUnlock;
  powerable: boolean; consumesPower: boolean; piped: boolean; consumesWater: boolean;
  powerOutput?: { kind: 'fixed'; tiles: number } | { kind: 'wind' } | { kind: 'solar' } | { kind: 'hydro' };
  waterOutput?: { kind: 'pump' } | { kind: 'desal' } | { kind: 'tower'; unitsPerCell: number } | { kind: 'treatment'; tilesPerPlant: number };
  pollutionPerTile: number; popWeight: number; residents: number; jobs: number;
  zone?: { type: 'R' | 'C' | 'I'; tier: 0 | 1 | 2; weight: number; level: 1 | 2 | 3 | 4 };
  transition?: 'construction' | 'abandoned';
  coverage?: { layer: 'XPLC' | 'XFIR'; strengthAt100: number };
  microsim?: { type: number; shared: boolean }; nimby: boolean; orient: OrientMode; lifetimeYears?: number;
  placement?: { terrain: 'flat' | 'waterfall' | 'slopeEntrance' | 'any'; waterCellsInFootprint?: [number, number]; needsAdjacent?: 'road' | 'rail' | 'highway+road' };
}
export type ToolId = string;                        // 'roads.road' 'zone.rDense' 'power.coal' …（spec:building-catalogue §2.11）
export type ToolGroup = 'bulldozer' | 'nature' | 'dispatch' | 'power' | 'water' | 'rewards' | 'roads' | 'rail' | 'ports' | 'residential' | 'commercial' | 'industrial' | 'education' | 'services' | 'parks' | 'signs' | 'query' | 'center';
export type PlaceMode = 'point' | 'line' | 'rect' | 'path';
export type CostUnit = 'tile' | 'segment2x2' | 'click' | 'building' | 'changedTile' | 'none';
export interface ToolDef {
  id: ToolId; group: ToolGroup; label: string /*strings 键*/; placeMode: PlaceMode; cursor: Footprint | 'variable' | 'none';
  cost: number; costUnit: CostUnit; buildingIds?: readonly number[]; zoneCode?: number; undergroundView?: boolean;
  tech?: TechKey; unlock?: RewardUnlock; requires?: 'policeStation' | 'fireStation' | 'militaryBase'; hotkey?: string; availableIn: 'city' | 'map' | 'both';
}
export type OrdinanceGroup = 'finance' | 'educationSafety' | 'environment' | 'healthSafety' | 'promotional';
export interface OrdinanceDef { id: OrdinanceId; group: OrdinanceGroup; key: string; availableYear: number; money: { base: 'R' | 'C' | 'I' | 'All'; pct: { num: number; den: number }; sign: 1 | -1 } | null; demand: Partial<Record<'r' | 'c' | 'i', number>>; forbidNuclear?: true; advertising?: true }
export interface CatalogueApi {
  readonly BUILDINGS: readonly BuildingDef[];      // 恰好 256 条，按 id 升序
  readonly TOOLS: readonly ToolDef[];
  readonly FOOTPRINT: Uint8Array;                  // === contracts/footprint.FOOTPRINT（测试对账）
  readonly CATEGORY: readonly BuildingCategory[];  // 256
  readonly TECH_BASE_YEAR: Readonly<Record<TechKey, number>>;
  readonly ORDINANCES: readonly OrdinanceDef[];    // 20，demand 列与 zones 乘数表一致（registry.test）
  toolById(id: ToolId): ToolDef | undefined; buildingByKey(key: string): BuildingDef | undefined;
}

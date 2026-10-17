// ===== sim/utilities/defs.ts =====（spec:power-water §2.3 / §2.8 / §3.2：电厂与水设施表）
// 只保留"产量语义"（每格服务格 / 风 / 太阳能公式、是否到期、微模拟类型、灾害钩子、科技键）；造价与占地一律从 CATALOGUE 读
// （ctx.catalogue.BUILDINGS[xbld].cost、contracts/footprint 的 FOOTPRINT），defs.test 对账两者一致。
import type { TechKey } from '../../contracts/catalogue';

export type PowerPlantKind = 'coal' | 'hydro' | 'oil' | 'gas' | 'nuclear' | 'wind' | 'solar' | 'microwave' | 'fusion';
/** 每格产量：固定服务格数，或按月抽样的风 / 太阳能公式（spec §2.3.2 / §2.3.3）。 */
export type PlantOutput = { kind: 'fixed'; tilesPerCell: number } | { kind: 'wind' } | { kind: 'solar' };
export interface PowerPlantDef {
  kind: PowerPlantKind;
  xbld: readonly number[];                 // 水电有两个朝向 ID
  output: PlantOutput;
  nominalMW: number;                       // 工具按钮 / 查询窗口的标称容量
  expires: boolean;                        // 50 年寿命（微模拟类型 1）；风 / 水电永不到期
  microsimType: number;                    // 1 / 20 / 21
  tech: TechKey | null;                    // 放置校验由 placement 查 q.tech.invented；本模块只携带
  nimby: boolean;
  disaster: 'meltdown' | 'microwave' | null;
}

export const POWER_PLANT_DEFS: Readonly<Record<PowerPlantKind, PowerPlantDef>> = Object.freeze({
  coal:      { kind: 'coal',      xbld: [0xcf],       output: { kind: 'fixed', tilesPerCell: 44 },  nominalMW: 200,  expires: true,  microsimType: 1,  tech: null,        nimby: true,  disaster: null },
  hydro:     { kind: 'hydro',     xbld: [0xc6, 0xc7], output: { kind: 'fixed', tilesPerCell: 40 },  nominalMW: 20,   expires: false, microsimType: 21, tech: null,        nimby: false, disaster: null },
  oil:       { kind: 'oil',       xbld: [0xca],       output: { kind: 'fixed', tilesPerCell: 48 },  nominalMW: 220,  expires: true,  microsimType: 1,  tech: null,        nimby: true,  disaster: null },
  gas:       { kind: 'gas',       xbld: [0xc9],       output: { kind: 'fixed', tilesPerCell: 11 },  nominalMW: 50,   expires: true,  microsimType: 1,  tech: 'gas',       nimby: true,  disaster: null },
  nuclear:   { kind: 'nuclear',   xbld: [0xcb],       output: { kind: 'fixed', tilesPerCell: 111 }, nominalMW: 500,  expires: true,  microsimType: 1,  tech: 'nuclear',   nimby: true,  disaster: 'meltdown' },
  wind:      { kind: 'wind',      xbld: [0xc8],       output: { kind: 'wind' },                     nominalMW: 4,    expires: false, microsimType: 20, tech: 'wind',      nimby: false, disaster: null },
  solar:     { kind: 'solar',     xbld: [0xcc],       output: { kind: 'solar' },                    nominalMW: 50,   expires: true,  microsimType: 1,  tech: 'solar',     nimby: false, disaster: null },
  microwave: { kind: 'microwave', xbld: [0xcd],       output: { kind: 'fixed', tilesPerCell: 355 }, nominalMW: 1600, expires: true,  microsimType: 1,  tech: 'microwave', nimby: false, disaster: 'microwave' },
  fusion:    { kind: 'fusion',    xbld: [0xce],       output: { kind: 'fixed', tilesPerCell: 555 }, nominalMW: 2500, expires: true,  microsimType: 1,  tech: 'fusion',    nimby: false, disaster: null },
});
export const POWER_PLANT_KINDS: readonly PowerPlantKind[] = ['coal', 'hydro', 'oil', 'gas', 'nuclear', 'wind', 'solar', 'microwave', 'fusion'];

export type WaterFacilityKind = 'pump' | 'tower' | 'treatment' | 'desalinization';
export interface WaterFacilityDef { kind: WaterFacilityKind; xbld: number; needsPower: boolean; tech: TechKey | null; nimby: boolean }
export const WATER_FACILITY_DEFS: Readonly<Record<WaterFacilityKind, WaterFacilityDef>> = Object.freeze({
  pump:           { kind: 'pump',           xbld: 0xdc, needsPower: true, tech: null,             nimby: false },
  tower:          { kind: 'tower',          xbld: 0xeb, needsPower: true, tech: null,             nimby: false },
  treatment:      { kind: 'treatment',      xbld: 0xf4, needsPower: true, tech: 'waterTreatment', nimby: true },
  desalinization: { kind: 'desalinization', xbld: 0xfa, needsPower: true, tech: 'desalinization', nimby: false },
});

/** 本模块特判的瓦片 ID。 */
export const XBLD_PUMP = 0xdc, XBLD_TOWER = 0xeb, XBLD_TREATMENT = 0xf4, XBLD_DESAL = 0xfa;
export const XBLD_STATUE = 0xdb, XBLD_BIG_PARK = 0xd5, XBLD_SMALL_PARK = 0x0d;
/** 地铁站 / 地铁-铁路转换的地下部分：与管线互斥，建筑格上也清 PIPED（spec §2.2）。 */
export const XUND_SUBWAY_STATION = 0x23;

/** 每格产量模式（256 项查表的值）。 */
export const OUT_NONE = 0, OUT_FIXED = 1, OUT_WIND = 2, OUT_SOLAR = 3;
function buildTables(): { mode: Uint8Array; cell: Int32Array; kind: (PowerPlantKind | null)[]; expires: Uint8Array } {
  const mode = new Uint8Array(256), cell = new Int32Array(256), expires = new Uint8Array(256);
  const kind: (PowerPlantKind | null)[] = new Array<PowerPlantKind | null>(256).fill(null);
  for (const k of POWER_PLANT_KINDS) {
    const d = POWER_PLANT_DEFS[k];
    for (const id of d.xbld) {
      kind[id] = k;
      expires[id] = d.expires ? 1 : 0;
      if (d.output.kind === 'fixed') { mode[id] = OUT_FIXED; cell[id] = d.output.tilesPerCell; }
      else mode[id] = d.output.kind === 'wind' ? OUT_WIND : OUT_SOLAR;
    }
  }
  return { mode, cell, kind, expires };
}
const T = buildTables();
/** PLANT_OUTPUT_MODE[xbld]：OUT_NONE / OUT_FIXED / OUT_WIND / OUT_SOLAR。 */
export const PLANT_OUTPUT_MODE: Uint8Array = T.mode;
/** PLANT_CELL_OUTPUT[xbld]：固定产量的每格服务格数（公式型为 0）。 */
export const PLANT_CELL_OUTPUT: Int32Array = T.cell;
/** PLANT_KIND_BY_XBLD[xbld]：电厂种类（非电厂 null）。 */
export const PLANT_KIND_BY_XBLD: ReadonlyArray<PowerPlantKind | null> = T.kind;
/** PLANT_EXPIRES[xbld]：1 = 到期型（进 priv 的电厂表）。 */
export const PLANT_EXPIRES: Uint8Array = T.expires;
export const isPlantTile = (xbld: number): boolean => PLANT_OUTPUT_MODE[xbld] !== OUT_NONE;
export const isWaterSourceTile = (xbld: number): boolean => xbld === XBLD_PUMP || xbld === XBLD_DESAL;

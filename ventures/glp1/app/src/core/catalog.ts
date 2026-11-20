/**
 * 药物目录（PRD v2.0 附录 A）。
 * 品牌名、剂量阶梯、最高剂量、药代参数全部【待核实】：上线前对照各地区说明书和
 * FDA 说明书 12.3 节逐条确认，确认后把 verified 改为 true。
 * 品牌名只用于让用户认出自己的药；商标归各自权利人所有，本产品与药企无关联。
 */

export type Region = 'CN' | 'TW' | 'HK' | 'US' | 'SG' | 'MY' | 'OTHER';
export type Route = 'sc' | 'oral';
export type Frequency = 'weekly' | 'daily';

export interface PkParams {
  halfLifeH: number;
  tmaxH: number;
}

export interface DrugEntry {
  id: string;
  generic: { hans: string; hant: string; en: string };
  /** 各地区常见品牌名，用户界面优先显示所在地区的名字。 */
  brands: Partial<Record<Region, string[]>>;
  route: Route;
  frequency: Frequency;
  ladderMg: number[];
  /** 超过即要求二次确认（防手滑，如 25 写成 2.5 的反面）。null 表示参数未核实，不校验。 */
  maxMg: number | null;
  /** 只给药代参数核实过的药画曲线。 */
  pk: PkParams | null;
  /** 口服司美格鲁肽：服药后需空腹的分钟数。 */
  fastingMin?: number;
  verified: boolean;
}

export const CATALOG: DrugEntry[] = [
  {
    id: 'semaglutide-wl',
    generic: { hans: '司美格鲁肽（减重）', hant: '司美格魯肽（減重）', en: 'semaglutide (weight)' },
    brands: { CN: ['诺和盈'], TW: ['週纖達'], HK: ['Wegovy'], US: ['Wegovy'], SG: ['Wegovy'], MY: ['Wegovy'] },
    route: 'sc',
    frequency: 'weekly',
    ladderMg: [0.25, 0.5, 1, 1.7, 2.4, 7.2],
    maxMg: 7.2,
    pk: { halfLifeH: 168, tmaxH: 48 },
    verified: false,
  },
  {
    id: 'semaglutide-t2d',
    generic: { hans: '司美格鲁肽（降糖）', hant: '司美格魯肽（降糖）', en: 'semaglutide (diabetes)' },
    brands: { CN: ['诺和泰'], TW: ['胰妥讚'], HK: ['Ozempic'], US: ['Ozempic'], SG: ['Ozempic'], MY: ['Ozempic'] },
    route: 'sc',
    frequency: 'weekly',
    ladderMg: [0.25, 0.5, 1, 2],
    maxMg: 2,
    pk: { halfLifeH: 168, tmaxH: 48 },
    verified: false,
  },
  {
    id: 'tirzepatide',
    generic: { hans: '替尔泊肽', hant: '替爾泊肽', en: 'tirzepatide' },
    brands: { CN: ['穆峰达'], TW: ['猛健樂'], HK: ['Mounjaro'], US: ['Zepbound', 'Mounjaro'], SG: ['Mounjaro'], MY: ['Mounjaro'] },
    route: 'sc',
    frequency: 'weekly',
    ladderMg: [2.5, 5, 7.5, 10, 12.5, 15],
    maxMg: 15,
    pk: { halfLifeH: 120, tmaxH: 24 },
    verified: false,
  },
  {
    id: 'mazdutide',
    generic: { hans: '玛仕度肽', hant: '瑪仕度肽', en: 'mazdutide' },
    brands: { CN: ['信尔美'] },
    route: 'sc',
    frequency: 'weekly',
    ladderMg: [],
    maxMg: null,
    pk: null,
    verified: false,
  },
  {
    id: 'liraglutide',
    generic: { hans: '利拉鲁肽', hant: '利拉魯肽', en: 'liraglutide' },
    brands: { CN: ['利拉鲁肽'], TW: ['善纖達'], HK: ['Saxenda'], US: ['Saxenda'], SG: ['Saxenda'], MY: ['Saxenda'] },
    route: 'sc',
    frequency: 'daily',
    ladderMg: [0.6, 1.2, 1.8, 2.4, 3],
    maxMg: 3,
    pk: null,
    verified: false,
  },
  {
    id: 'semaglutide-oral-wl',
    generic: { hans: '口服司美格鲁肽（减重）', hant: '口服司美格魯肽（減重）', en: 'oral semaglutide (weight)' },
    brands: { US: ['Wegovy 片'] },
    route: 'oral',
    frequency: 'daily',
    ladderMg: [1.5, 4, 9, 25],
    maxMg: 25,
    pk: null,
    fastingMin: 30,
    verified: false,
  },
  {
    id: 'semaglutide-oral-t2d',
    generic: { hans: '口服司美格鲁肽（降糖）', hant: '口服司美格魯肽（降糖）', en: 'oral semaglutide (diabetes)' },
    brands: { CN: ['诺和忻'], TW: ['瑞倍適'], HK: ['Rybelsus'], US: ['Rybelsus'], SG: ['Rybelsus'], MY: ['Rybelsus'] },
    route: 'oral',
    frequency: 'daily',
    ladderMg: [3, 7, 14],
    maxMg: 14,
    pk: null,
    fastingMin: 30,
    verified: false,
  },
  {
    id: 'orforglipron',
    generic: { hans: '奥格列隆（orforglipron）', hant: '奧格列隆（orforglipron）', en: 'orforglipron' },
    brands: { US: ['Foundayo'] },
    route: 'oral',
    frequency: 'daily',
    ladderMg: [],
    maxMg: null,
    pk: null,
    verified: false,
  },
  {
    id: 'custom',
    generic: { hans: '其他 / 自己填', hant: '其他 / 自己填', en: 'other' },
    brands: {},
    route: 'sc',
    frequency: 'weekly',
    ladderMg: [],
    maxMg: null,
    pk: null,
    verified: false,
  },
];

export function drugById(id: string): DrugEntry {
  return CATALOG.find((d) => d.id === id) ?? CATALOG[CATALOG.length - 1];
}

/** 用户看到的名字：所在地区的品牌名优先，再附通用名。 */
export function drugLabel(d: DrugEntry, region: Region, script: 'hans' | 'hant' = 'hans'): string {
  const brands = d.brands[region] ?? [];
  const generic = d.generic[script];
  return brands.length ? `${brands.join(' / ')}（${generic}）` : generic;
}

/** 搜索：品牌名（任一地区）、中英文通用名都能搜到。 */
export function searchCatalog(q: string): DrugEntry[] {
  const s = q.trim().toLowerCase();
  if (!s) return CATALOG;
  return CATALOG.filter((d) => {
    const names = [d.generic.hans, d.generic.hant, d.generic.en, ...Object.values(d.brands).flat()];
    return names.some((n) => n!.toLowerCase().includes(s));
  });
}

export type DoseUnit = 'mg' | 'units' | 'mL' | 'clicks';

/** 剂量超过目录最高剂量时需要二次确认。非 mg 单位不换算、不校验（审核指南 1.4.2）。 */
export function needsDoseConfirm(d: DrugEntry, amount: number, unit: DoseUnit): boolean {
  if (unit !== 'mg' || d.maxMg === null) return false;
  return amount > d.maxMg + 1e-9;
}

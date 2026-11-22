/**
 * 药物目录（PRD v2.0 附录 A）。
 * 品牌名、剂量阶梯、最高剂量、药代参数全部【待核实】：上线前对照各地区说明书和
 * FDA 说明书 12.3 节逐条确认，确认后把 verified 改为 true。
 * 品牌名只用于让用户认出自己的药；商标归各自权利人所有，本产品与药企无关联。
 *
 * Rules for drug facts (dose ladder, maximum dose, half-life, Tmax):
 * - Never write a number from memory. A number may be added or changed only after reading it
 *   on the FDA label (accessdata.fda.gov or dailymed.nlm.nih.gov); put that page's URL in
 *   `source` in the same change.
 * - No `source` means the numbers of that entry have NOT been checked against a label yet.
 * - Unknown stays empty: `ladderMg: []`, `maxMg: null`, `pk: null`. The app then only logs
 *   the medication: no dose check and no estimated medication level curve.
 * - `verified` is set to true by a human reviewer only.
 * No entry has a `source` yet, so every number below is still unverified.
 */
import type { Lang } from './i18n';
import type { Regimen } from './types';

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
  /** Active ingredient in English, shown next to a brand name: "Wegovy (semaglutide)". */
  ingredient?: string;
  /** 各地区常见品牌名，用户界面优先显示所在地区的名字。 */
  brands: Partial<Record<Region, string[]>>;
  /**
   * Chinese display text for a brand whose stored name contains an English word
   * ("Wegovy pill" is shown as "Wegovy 片" in Chinese). Keyed by the stored brand name.
   */
  brandZh?: Record<string, string>;
  route: Route;
  frequency: Frequency;
  ladderMg: number[];
  /** 超过即要求二次确认（防手滑，如 25 写成 2.5 的反面）。null 表示参数未核实，不校验。 */
  maxMg: number | null;
  /** 只给药代参数核实过的药画曲线。 */
  pk: PkParams | null;
  /** 口服司美格鲁肽：服药后需空腹的分钟数。 */
  fastingMin?: number;
  /**
   * URL of the FDA label page that ladderMg, maxMg and pk were read from. Missing means the
   * numbers have not been checked against a label.
   */
  source?: string;
  /** Set to true by a human reviewer only, after checking the entry against the label. */
  verified: boolean;
}

export const CATALOG: DrugEntry[] = [
  {
    id: 'semaglutide-wl',
    generic: { hans: '司美格鲁肽（减重）', hant: '司美格魯肽（減重）', en: 'semaglutide for weight' },
    ingredient: 'semaglutide',
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
    generic: { hans: '司美格鲁肽（降糖）', hant: '司美格魯肽（降糖）', en: 'semaglutide for diabetes' },
    ingredient: 'semaglutide',
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
    ingredient: 'tirzepatide',
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
    ingredient: 'mazdutide',
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
    ingredient: 'liraglutide',
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
    generic: { hans: '口服司美格鲁肽（减重）', hant: '口服司美格魯肽（減重）', en: 'oral semaglutide for weight' },
    ingredient: 'semaglutide',
    brands: { US: ['Wegovy pill'] },
    brandZh: { 'Wegovy pill': 'Wegovy 片' },
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
    generic: { hans: '口服司美格鲁肽（降糖）', hant: '口服司美格魯肽（降糖）', en: 'oral semaglutide for diabetes' },
    ingredient: 'semaglutide',
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
    ingredient: 'orforglipron',
    brands: { US: ['Foundayo'] },
    route: 'oral',
    frequency: 'daily',
    // Needs verification: dose strengths, maximum dose and PK have not been read from the
    // FDA label yet, so they stay empty. Do not fill them in from memory.
    ladderMg: [],
    maxMg: null,
    pk: null,
    verified: false,
  },
  {
    id: 'custom',
    generic: { hans: '其他 / 自己填', hant: '其他 / 自己填', en: 'Other / custom' },
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

/** True when the entry's numbers were read from an FDA label page (it has a `source`). */
export function hasLabelSource(d: DrugEntry): boolean {
  return !!d.source;
}

/** A brand name as shown to the user. The stored name is always the catalog's own spelling. */
export function brandLabel(d: DrugEntry, brand: string, lang: Lang): string {
  return lang === 'en' ? brand : (d.brandZh?.[brand] ?? brand);
}

function hasBrand(d: DrugEntry, brand: string): boolean {
  return Object.values(d.brands).some((list) => list?.includes(brand));
}

const HAS_CJK = /[\u3400-\u9fff]/;

/**
 * Brand names to show: the chosen brand if there is one, otherwise every brand of the region.
 * A brand that is only written in Chinese (the Mainland China and Taiwan names) is left out in
 * English, so the label falls back to the generic English name.
 */
function shownBrands(d: DrugEntry, region: Region, lang: Lang, brand?: string | null): string[] {
  const list = brand && hasBrand(d, brand) ? [brand] : (d.brands[region] ?? []);
  return list.filter((b) => lang !== 'en' || !HAS_CJK.test(b)).map((b) => brandLabel(d, b, lang));
}

/**
 * 用户看到的名字：所在地区的品牌名优先，再附通用名。
 * English: "Zepbound (tirzepatide)". Pass `brand` (Regimen.brand) to show only the brand the
 * user picked; without it every brand of the region is listed: "Zepbound / Mounjaro (tirzepatide)".
 */
export function drugLabel(d: DrugEntry, region: Region, lang: Lang, brand?: string | null): string {
  const brands = shownBrands(d, region, lang, brand);
  if (lang === 'en') return brands.length ? `${brands.join(' / ')} (${d.ingredient ?? d.generic.en})` : d.generic.en;
  const generic = d.generic[lang];
  return brands.length ? `${brands.join(' / ')}（${generic}）` : generic;
}

/** One short name for a one-line summary: the chosen brand, else the region's first brand, else the generic name. */
export function drugShortName(d: DrugEntry, region: Region, lang: Lang, brand?: string | null): string {
  return shownBrands(d, region, lang, brand)[0] ?? d.generic[lang];
}

/** Name of the medication in a saved regimen, including a custom name the user typed. */
export function regimenLabel(reg: Pick<Regimen, 'drugId' | 'brand' | 'customName'>, region: Region, lang: Lang): string {
  if (reg.drugId === 'custom' && reg.customName?.trim()) return reg.customName.trim();
  return drugLabel(drugById(reg.drugId), region, lang, reg.brand);
}

/** "Shot · weekly" / "Pill · daily": how the medication is taken, for the line under its name. */
export function drugFormText(d: DrugEntry, lang: Lang): string {
  if (lang === 'en') return `${d.route === 'oral' ? 'Pill' : 'Shot'} · ${d.frequency === 'daily' ? 'daily' : 'weekly'}`;
  return `${d.route === 'oral' ? '口服' : '注射'} · ${d.frequency === 'daily' ? '每天' : '每周'}`;
}

/** 搜索：品牌名（任一地区）、中英文通用名都能搜到。 */
export function searchCatalog(q: string): DrugEntry[] {
  const s = q.trim().toLowerCase();
  if (!s) return CATALOG;
  return CATALOG.filter((d) => {
    const names = [d.generic.hans, d.generic.hant, d.generic.en, d.ingredient ?? '', ...Object.values(d.brands).flat(), ...Object.values(d.brandZh ?? {})];
    return names.some((n) => n!.toLowerCase().includes(s));
  });
}

// ── Brand list per region ────────────────────────────────────────────────────

/** One row of the medication picker. */
export interface BrandOption {
  drugId: string;
  /** Stored brand name (save it in Regimen.brand). null for a generic row and for "Other / custom". */
  brand: string | null;
  entry: DrugEntry;
}

/**
 * Display order where it is fixed by the product. Other regions follow the catalog order.
 * The US list is exactly these brands plus "Other / custom".
 */
const BRAND_ORDER: Partial<Record<Region, string[]>> = {
  US: ['Wegovy', 'Ozempic', 'Zepbound', 'Mounjaro', 'Wegovy pill', 'Foundayo', 'Rybelsus', 'Saxenda'],
};

/**
 * The medications a user in `region` picks from, in display order. Each brand is its own row,
 * even when two brands share one catalog entry (Zepbound and Mounjaro are both 'tirzepatide').
 * "Other / custom" is always last. A region with no brand names at all ('OTHER') lists every
 * entry by its generic name instead.
 */
export function brandOptions(region: Region): BrandOption[] {
  const custom = drugById('custom');
  const entries = CATALOG.filter((d) => d.id !== 'custom');
  let rows: BrandOption[] = entries.flatMap((entry) => (entry.brands[region] ?? []).map((brand) => ({ drugId: entry.id, brand, entry })));
  const order = BRAND_ORDER[region];
  if (order) {
    rows = order.flatMap((brand) => rows.filter((r) => r.brand === brand));
  }
  if (!rows.length) rows = entries.map((entry) => ({ drugId: entry.id, brand: null, entry }));
  return [...rows, { drugId: custom.id, brand: null, entry: custom }];
}

/** Text for one picker row: "Zepbound (tirzepatide)", "Other / custom". */
export function brandOptionLabel(o: BrandOption, region: Region, lang: Lang): string {
  return drugLabel(o.entry, region, lang, o.brand);
}

// ── Regions ──────────────────────────────────────────────────────────────────

/**
 * The launch market. Used to name a medication when there is no profile to take a region from.
 * It is NOT where a new user is assumed to be: that comes from the phone's time zone (see
 * startRegion in profile.ts), because a profile's region also picks the emergency number when
 * the time zone is not known (see emergencyRegion in triage.ts).
 */
export const DEFAULT_REGION: Region = 'US';

const REGION_ZH: Record<Region, string> = {
  CN: '中国大陆',
  HK: '香港',
  TW: '台湾',
  SG: '新加坡',
  MY: '马来西亚',
  US: '美国',
  OTHER: '其他地区',
};

const REGION_EN: Record<Region, string> = {
  CN: 'Mainland China',
  HK: 'Hong Kong',
  TW: 'Taiwan',
  SG: 'Singapore',
  MY: 'Malaysia',
  US: 'United States',
  OTHER: 'Other',
};

export function regionLabel(region: Region, lang: Lang): string {
  return (lang === 'en' ? REGION_EN : REGION_ZH)[region];
}

/** Regions in picker order. English puts the United States first; Chinese keeps its old order. */
export function regionsFor(lang: Lang): Region[] {
  return lang === 'en' ? ['US', 'HK', 'TW', 'SG', 'MY', 'CN', 'OTHER'] : ['CN', 'HK', 'TW', 'SG', 'MY', 'US', 'OTHER'];
}

export type DoseUnit = 'mg' | 'units' | 'mL' | 'clicks';

export function doseUnitLabel(u: DoseUnit, lang: Lang): string {
  if (u === 'clicks') return lang === 'en' ? 'clicks' : '格';
  return u;
}

/** 剂量超过目录最高剂量时需要二次确认。非 mg 单位不换算、不校验（审核指南 1.4.2）。 */
export function needsDoseConfirm(d: DrugEntry, amount: number, unit: DoseUnit): boolean {
  if (unit !== 'mg' || d.maxMg === null) return false;
  return amount > d.maxMg + 1e-9;
}

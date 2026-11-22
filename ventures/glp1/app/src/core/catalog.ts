/**
 * 药物目录（PRD v2.0 附录 A）。
 * 品牌名只用于让用户认出自己的药；商标归各自权利人所有，本产品与药企无关联。
 *
 * Where the numbers come from (dose steps, highest dose, half-life, time to peak, wait after a pill):
 * - Every number of an entry with a US brand was read from the current US prescribing
 *   information (the FDA label on dailymed.nlm.nih.gov) on 2026-11-22. labelFacts.ts has one row
 *   per number and US brand: the label's words, the section, the label version and its page.
 *   `source` lists those label pages.
 * - The numbers are PENDING CLINICAL REVIEW: they were read from the labels by us and have not
 *   been confirmed by a reviewer. `verified` is set to true by a human reviewer only. Code never
 *   sets it.
 * - Never write a number from memory. A number may be added or changed only after reading it on
 *   the label (dailymed.nlm.nih.gov or www.accessdata.fda.gov); add or change its row in
 *   labelFacts.ts in the same change. An entry is label-backed (hasLabelSource) only when every
 *   number it carries has a row, for every US brand. The launch build shows the numbers of a
 *   label-backed entry only.
 * - Unknown stays empty: `ladderMg: []`, `maxMg: null`, `pk: null`, no `fastingMin`. The app then
 *   only logs the medication: no dose example, no dose check, no wait and no chart.
 * - One entry serves every region. The numbers are per ingredient and form, and they are read
 *   from the US label. A brand of another region (Hong Kong, Taiwan and so on) uses the same
 *   numbers. That is accepted for now; the labels of other regions have not been read.
 * - Where two US brands of one entry have different numbers on their labels, each brand has its
 *   own under `byBrand` (tirzepatide). Read numbers through brandNumbers(), with the brand of
 *   the regimen, and never straight from the entry.
 *
 * What the number fields hold:
 * - ladderMg: every dose of the label's adult schedule (section 2), from the starting dose up to
 *   the highest dose the label gives to any adult, so the last step is maxMg. A dose the label
 *   gives for one of its uses only is still a step (Wegovy 7.2 mg, Ozempic 2 mg); its row in
 *   labelFacts.ts says who it is for. The app shows only the first step, as the example in setup.
 * - maxMg: the highest dose the label gives to any adult. It only catches a typing slip.
 * - pk: weekly shots only, because the chart is designed for them. Daily medications keep
 *   `pk: null`. PK_RULE in labelFacts.ts says how one half-life and one time to peak are taken
 *   from the label's wording.
 * - fastingMin: tablets only, and only where the label states a waiting time.
 */
import type { Lang } from './i18n';
import { LABEL_FACTS, LABELS, type LabelField, type LabelValue } from './labelFacts';
import type { Regimen } from './types';

export type Region = 'CN' | 'TW' | 'HK' | 'US' | 'SG' | 'MY' | 'OTHER';
export type Route = 'sc' | 'oral';
export type Frequency = 'weekly' | 'daily';

export interface PkParams {
  halfLifeH: number;
  tmaxH: number;
}

/** The numbers of a medication that reach the screen. */
export interface DrugNumbers {
  /** Dose steps of the label's adult schedule, in mg, from the starting dose up. */
  ladderMg: number[];
  /** 超过即要求二次确认（防手滑，如 25 写成 2.5 的反面）。null: no number, no check. */
  maxMg: number | null;
  /** Half-life and time to peak for the chart. Weekly shots only. null: no chart. */
  pk: PkParams | null;
  /** 口服片剂：说明书写明的服药后等待分钟数。Absent: the label states no wait, or it has not been read. */
  fastingMin?: number;
}

export interface DrugEntry extends DrugNumbers {
  id: string;
  generic: { hans: string; hant: string; en: string };
  /**
   * Chinese generic name to show next to a brand name, where the plain generic name already
   * carries the brand ("Ozempic 片（口服司美格鲁肽（降糖））", not the brand twice).
   */
  genericBeside?: { hans: string; hant: string };
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
  /**
   * Numbers that differ between the US labels of two brands of this entry, keyed by the stored
   * brand name. A brand listed here uses these in place of the entry's own (see brandNumbers).
   */
  byBrand?: Record<string, Partial<DrugNumbers>>;
  /**
   * Pages of the US labels the numbers were read from (labelFacts.ts has the words of each
   * label). Missing: the entry has no numbers from a label.
   */
  source?: string[];
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
    // 7.2 mg is the last step and the highest dose. The label gives it only for weight reduction
    // in adults, after at least 4 weeks on 2.4 mg (its row in labelFacts.ts says so).
    ladderMg: [0.25, 0.5, 1, 1.7, 2.4, 7.2],
    maxMg: 7.2,
    pk: { halfLifeH: 168, tmaxH: 48 },
    source: [LABELS.wegovy.url],
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
    source: [LABELS.ozempic.url],
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
    // The two US labels word the half-life and the time to peak differently, so each brand has
    // its own pair (byBrand). The entry itself has none: a regimen whose brand is neither of the
    // two (see regimenBrand) gets no chart, because the app must not guess which label applies.
    pk: null,
    byBrand: {
      Zepbound: { pk: { halfLifeH: 132, tmaxH: 24 } },
      Mounjaro: { pk: { halfLifeH: 120, tmaxH: 40 } },
    },
    source: [LABELS.zepbound.url, LABELS.mounjaro.url],
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
    // Named after its use, like the semaglutide entries: the numbers are those of the Saxenda
    // label, and other liraglutide products have other doses. No Mainland China brand is listed.
    // The list there used the bare generic name as the brand, and the name of the weight product
    // there has not been confirmed. A regimen saved with that old name still resolves to this
    // entry and is shown under the generic name.
    generic: { hans: '利拉鲁肽（减重）', hant: '利拉魯肽（減重）', en: 'liraglutide for weight' },
    ingredient: 'liraglutide',
    brands: { TW: ['善纖達'], HK: ['Saxenda'], US: ['Saxenda'], SG: ['Saxenda'], MY: ['Saxenda'] },
    route: 'sc',
    frequency: 'daily',
    ladderMg: [0.6, 1.2, 1.8, 2.4, 3],
    maxMg: 3,
    pk: null,
    source: [LABELS.saxenda.url],
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
    source: [LABELS.wegovy.url],
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
    source: [LABELS.semaglutideTablets.url],
    verified: false,
  },
  {
    // The second tablet brand on the same US label as Rybelsus. Its doses are its own: the label
    // says the two "are not substitutable on a mg-to-mg basis", so it cannot share that entry.
    id: 'semaglutide-oral-t2d-ozempic',
    generic: { hans: '口服司美格鲁肽（降糖，Ozempic 片）', hant: '口服司美格魯肽（降糖，Ozempic 片）', en: 'oral semaglutide for diabetes (Ozempic tablets)' },
    genericBeside: { hans: '口服司美格鲁肽（降糖）', hant: '口服司美格魯肽（降糖）' },
    ingredient: 'semaglutide',
    brands: { US: ['Ozempic pill'] },
    brandZh: { 'Ozempic pill': 'Ozempic 片' },
    route: 'oral',
    frequency: 'daily',
    ladderMg: [1.5, 4, 9],
    maxMg: 9,
    pk: null,
    fastingMin: 30,
    source: [LABELS.semaglutideTablets.url],
    verified: false,
  },
  {
    id: 'orforglipron',
    generic: { hans: '奥格列隆（orforglipron）', hant: '奧格列隆（orforglipron）', en: 'orforglipron' },
    ingredient: 'orforglipron',
    brands: { US: ['Foundayo'] },
    route: 'oral',
    frequency: 'daily',
    // No fastingMin: the label says "with or without food".
    ladderMg: [0.8, 2.5, 5.5, 9, 14.5, 17.2],
    maxMg: 17.2,
    pk: null,
    source: [LABELS.foundayo.url],
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

/**
 * The numbers of an entry as the label of one brand gives them. A brand with numbers of its own
 * (byBrand) uses those. Any other brand, a brand of another region, and a regimen saved without
 * a brand use the entry's own numbers.
 */
export function brandNumbers(d: DrugEntry, brand?: string | null): DrugNumbers {
  const own = brand ? d.byBrand?.[brand] : undefined;
  return {
    ladderMg: own?.ladderMg ?? d.ladderMg,
    maxMg: own && 'maxMg' in own ? (own.maxMg ?? null) : d.maxMg,
    pk: own && 'pk' in own ? (own.pk ?? null) : d.pk,
    fastingMin: own && 'fastingMin' in own ? own.fastingMin : d.fastingMin,
  };
}

/**
 * The brand whose numbers a regimen uses: the saved brand, or, for a regimen saved without one,
 * the only brand the entry has in the person's region. That is the name the screens show for
 * such a regimen (drugLabel), so the numbers and the name go together. Null when the region has
 * several brands of the entry, or none.
 */
export function regimenBrand(reg: Pick<Regimen, 'drugId' | 'brand'>, region: Region): string | null {
  if (reg.brand) return reg.brand;
  const regional = drugById(reg.drugId).brands[region] ?? [];
  return regional.length === 1 ? regional[0] : null;
}

/**
 * The US brand whose label the numbers of a regimen come from. Null when the entry has no US
 * brand, or has several and the regimen names none of them.
 */
export function labelBrand(d: DrugEntry, brand?: string | null): string | null {
  const us = d.brands.US ?? [];
  if (brand && us.includes(brand)) return brand;
  return us.length === 1 ? us[0] : null;
}

/**
 * The US brands whose labels give the highest dose a regimen is checked against. The typing
 * check names them, so that the person can see whose number it is: the regimen's own brand when
 * that is a US brand, otherwise every US brand of the entry with this same highest dose on its
 * label (a brand of another region, or no brand at all). Empty when there is no such label.
 */
export function maxDoseLabelBrands(d: DrugEntry, brand?: string | null): string[] {
  const us = d.brands.US ?? [];
  const max = brandNumbers(d, brand).maxMg;
  if (max === null) return [];
  if (brand && us.includes(brand)) return [brand];
  return us.filter((b) => brandNumbers(d, b).maxMg === max);
}

/** The names of maxDoseLabelBrands as the user reads them, in one piece: "Wegovy", "Wegovy 片", "Zepbound / Mounjaro". */
export function maxDoseLabelName(d: DrugEntry, lang: Lang, brand?: string | null): string {
  return maxDoseLabelBrands(d, brand)
    .map((b) => brandLabel(d, b, lang))
    .join(' / ');
}

/**
 * Brands of an entry that have chart numbers of their own, for a regimen that has none because
 * it names no such brand (tirzepatide saved without Zepbound or Mounjaro: their two US labels
 * state the numbers differently, and the app does not pick one). Empty when the regimen has
 * chart numbers, and when no brand of the entry has any.
 */
export function chartBrands(d: DrugEntry, brand?: string | null): string[] {
  if (brandNumbers(d, brand).pk !== null) return [];
  return Object.keys(d.byBrand ?? {}).filter((b) => brandNumbers(d, b).pk !== null);
}

const sameValue = (a: LabelValue | undefined, b: LabelValue): boolean => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b);

/**
 * The numbers of an entry that have no row in labelFacts.ts, as "brand: field". Every number an
 * entry carries needs a row with the same value for every US brand of the entry. An entry with
 * no US brand has no US label, so everything it carries is listed.
 */
export function unbackedNumbers(d: DrugEntry): string[] {
  const missing: string[] = [];
  const usBrands = d.brands.US ?? [];
  const backed = (brand: string, field: LabelField, value: LabelValue): boolean => {
    const row = LABEL_FACTS.find((f) => f.entryId === d.id && f.brand === brand && f.field === field);
    return row !== undefined && row.quotes.length > 0 && sameValue(row.value, value);
  };
  const check = (who: string, n: DrugNumbers, brand: string | null) => {
    const need = (field: LabelField, value: LabelValue) => {
      if (brand === null || !backed(brand, field, value)) missing.push(`${who}: ${field}`);
    };
    if (brand !== null) need('frequency', d.frequency);
    if (n.ladderMg.length) need('ladderMg', n.ladderMg);
    if (n.maxMg !== null) need('maxMg', n.maxMg);
    if (n.pk) need('halfLifeH', n.pk.halfLifeH);
    if (n.pk) need('tmaxH', n.pk.tmaxH);
    if (n.fastingMin !== undefined) need('fastingMin', n.fastingMin);
  };
  for (const brand of usBrands) check(brand, brandNumbers(d, brand), brand);
  // Numbers kept for a brand that has no US label cannot have a row.
  for (const brand of Object.keys(d.byBrand ?? {})) if (!usBrands.includes(brand)) missing.push(`${brand}: not a US brand`);
  // The entry's own numbers are used for a regimen without a US brand name. A number there that
  // every US brand replaces with its own would come from no label at all.
  const own = brandNumbers(d);
  const replacedByAll = (field: keyof DrugNumbers) => usBrands.length > 0 && usBrands.every((b) => d.byBrand?.[b] !== undefined && field in (d.byBrand[b] ?? {}));
  check('no US brand', {
    ladderMg: usBrands.length === 0 || replacedByAll('ladderMg') ? own.ladderMg : [],
    maxMg: usBrands.length === 0 || replacedByAll('maxMg') ? own.maxMg : null,
    pk: usBrands.length === 0 || replacedByAll('pk') ? own.pk : null,
    fastingMin: usBrands.length === 0 || replacedByAll('fastingMin') ? own.fastingMin : undefined,
  }, null);
  return missing;
}

/**
 * True when the entry is label-backed: it names its US label pages (`source`), it has a US
 * brand, and every number it carries has a row in labelFacts.ts for every US brand. The launch
 * build shows the numbers of such an entry only (labelFactsShown in features.ts).
 */
export function hasLabelSource(d: DrugEntry): boolean {
  return !!d.source?.length && (d.brands.US?.length ?? 0) > 0 && unbackedNumbers(d).length === 0;
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
  return brands.length ? `${brands.join(' / ')}（${d.genericBeside?.[lang] ?? d.generic[lang]}）` : d.generic[lang];
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
  US: ['Wegovy', 'Ozempic', 'Zepbound', 'Mounjaro', 'Wegovy pill', 'Foundayo', 'Rybelsus', 'Ozempic pill', 'Saxenda'],
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

/**
 * 剂量超过目录最高剂量时需要二次确认。非 mg 单位不换算、不校验（审核指南 1.4.2）。
 * `brand` is the brand of the regimen, for an entry whose brands have their own numbers.
 */
export function needsDoseConfirm(d: DrugEntry, amount: number, unit: DoseUnit, brand?: string | null): boolean {
  const { maxMg } = brandNumbers(d, brand);
  if (unit !== 'mg' || maxMg === null) return false;
  return amount > maxMg + 1e-9;
}

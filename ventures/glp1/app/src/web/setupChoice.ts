/**
 * The rules of the setup screen that do not need React: which medication rows the English list
 * shows, which row is marked, when a brand still has to be chosen, and what redoing setup
 * starts from. Kept apart from Onboarding.tsx so they can be tested.
 */
import { brandOptions, drugById, type BrandOption, type DoseUnit, type Region } from '../core/catalog';
import type { CourseStatus, Regimen } from '../core/types';
import { fromKg, storedKg, toKg, type WeightUnit } from '../core/units';

/** A brand is kept only for a region where the medication is sold under that name. */
export function brandIn(region: Region, drugId: string | null | undefined, brand: string | null | undefined): string | null {
  if (!drugId || !brand) return null;
  return (drugById(drugId).brands[region] ?? []).includes(brand) ? brand : null;
}

/**
 * Rows of the English medication list: the brands sold in the region, one row each. A medication
 * that was chosen from another list (another region, or the Chinese list) and has no row here
 * stays in view under its generic name, just above "Other / custom".
 */
export function englishRows(region: Region, drugId: string | null): BrandOption[] {
  const rows = brandOptions(region);
  if (drugId && !rows.some((o) => o.drugId === drugId)) rows.splice(rows.length - 1, 0, { drugId, brand: null, entry: drugById(drugId) });
  return rows;
}

/**
 * True when the English list has more than one row for the chosen medication and none of them
 * is chosen yet (tirzepatide in the US: Zepbound or Mounjaro). The user picks one before going on.
 */
export function needsBrandPick(region: Region, drugId: string | null, brand: string | null): boolean {
  return drugId !== null && brand === null && englishRows(region, drugId).filter((o) => o.drugId === drugId).length > 1;
}

/**
 * Whether a row of the English list is the chosen one. A medication saved without a brand marks
 * its row only when the region has a single row for it; with two, none is marked.
 */
export function isRowPicked(o: BrandOption, region: Region, drugId: string | null, brand: string | null): boolean {
  if (o.drugId !== drugId) return false;
  return o.brand === brand || (brand === null && !needsBrandPick(region, drugId, brand));
}

export interface SetupStart {
  status: CourseStatus;
  amount: string;
  doseUnit: DoseUnit;
  freqMode: 'weekly' | 'daily' | 'interval';
  /** null: use today's weekday. */
  weekday: number | null;
  time: string;
  intervalDays: string;
  weeksOnDose: string;
}

/**
 * What the medication step starts from. First-time setup starts blank. Redoing setup starts from
 * the saved medication, so a user who only walks through it again keeps their schedule (a daily
 * pill stays daily, at its own time).
 */
export function setupStart(saved: Regimen | null | undefined): SetupStart {
  const s = saved?.schedule;
  return {
    status: saved?.status ?? 'escalating',
    amount: saved?.doseAmount ? String(saved.doseAmount) : '',
    doseUnit: saved?.doseUnit ?? 'mg',
    freqMode: s?.kind ?? 'weekly',
    weekday: s?.kind === 'weekly' ? s.weekday : null,
    time: s && s.kind !== 'interval' ? s.time : '21:00',
    intervalDays: s?.kind === 'interval' ? String(s.hours / 24) : '7',
    weeksOnDose: saved?.weeksOnDoseAtStart ? String(saved.weeksOnDoseAtStart) : '',
  };
}

// ── Redoing setup: what is kept, and what is added to the log ───────────────

/** A saved weight as the text of a setup field, in the given unit, to one decimal. Blank when nothing is saved. */
export function savedWeightText(kg: number | null | undefined, unit: WeightUnit): string {
  return kg ? String(Math.round(fromKg(kg, unit) * 10) / 10) : '';
}

/**
 * The weight a setup field stands for when setup is finished. `typed` is null while the field
 * has not been touched: the saved weight is then kept exactly as it is, so walking through
 * setup again changes nothing. A field that was emptied means no weight.
 */
export function fieldWeightKg(typed: string | null, saved: number | null | undefined, unit: WeightUnit): number | null {
  if (typed === null) return saved ?? null;
  const n = Number(typed);
  return typed.trim() !== '' && n > 0 ? storedKg(toKg(n, unit)) : null;
}

/**
 * Whether finishing setup adds the "most recent dose" as a row of the log. The question only
 * starts the log. Once the log has a dose of the medication, setup does not ask it and adds
 * nothing, so redoing setup cannot add the same dose again.
 */
export function addsStartingDose(status: CourseStatus, amount: number, loggedForMedication: boolean): boolean {
  return status !== 'not_started' && amount > 0 && !loggedForMedication;
}

/**
 * Whether finishing setup adds the weight as a weigh-in: the first time, and when setup is
 * redone with another weight. The same weight as before is not logged a second time.
 */
export function addsStartingWeight(kg: number | null, savedKg: number | null | undefined): kg is number {
  return kg !== null && kg > 0 && kg !== (savedKg ?? null);
}

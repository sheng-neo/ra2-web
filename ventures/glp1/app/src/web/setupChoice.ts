/**
 * The rules of the setup screen that do not need React: which medication rows the English list
 * shows, which row is marked, when a brand still has to be chosen, and what redoing setup
 * starts from. Kept apart from Onboarding.tsx so they can be tested.
 */
import { brandOptions, drugById, type BrandOption, type DoseUnit, type Region } from '../core/catalog';
import type { CourseStatus, Regimen } from '../core/types';

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

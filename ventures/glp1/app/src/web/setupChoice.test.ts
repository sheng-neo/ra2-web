import { describe, expect, it } from 'vitest';
import { brandOptionLabel, CATALOG, drugById, type BrandOption } from '../core/catalog';
import type { Regimen } from '../core/types';
import { addsStartingDose, addsStartingWeight, brandIn, chineseRows, englishRows, fieldWeightKg, isChineseRowPicked, isRowPicked, needsBrandPick, needsBrandPickChinese, savedWeightText, setupStart } from './setupChoice';

const marked = (region: Parameters<typeof englishRows>[0], drugId: string | null, brand: string | null) =>
  englishRows(region, drugId)
    .filter((o: BrandOption) => isRowPicked(o, region, drugId, brand))
    .map((o) => brandOptionLabel(o, region, 'en'));

describe('setup: the chosen brand follows the region', () => {
  it('keeps a brand only where the medication is sold under that name', () => {
    expect(brandIn('US', 'tirzepatide', 'Zepbound')).toBe('Zepbound');
    expect(brandIn('HK', 'tirzepatide', 'Zepbound')).toBeNull();
    expect(brandIn('CN', 'tirzepatide', 'Zepbound')).toBeNull();
    expect(brandIn('HK', 'tirzepatide', 'Mounjaro')).toBe('Mounjaro');
    expect(brandIn('US', 'semaglutide-wl', 'Zepbound')).toBeNull();
    expect(brandIn('US', null, 'Zepbound')).toBeNull();
    expect(brandIn('US', 'tirzepatide', undefined)).toBeNull();
  });

  it('English, Zepbound picked, then the region changes to Hong Kong: one row is marked and it is the name that will be saved', () => {
    const brand = brandIn('HK', 'tirzepatide', 'Zepbound');
    expect(brand).toBeNull();
    expect(marked('HK', 'tirzepatide', brand)).toEqual(['Mounjaro (tirzepatide)']);
    expect(needsBrandPick('HK', 'tirzepatide', brand)).toBe(false);
  });
});

describe('setup: the Chinese list', () => {
  const labels = (region: Parameters<typeof chineseRows>[1]) => chineseRows(CATALOG, region).map((o) => brandOptionLabel(o, region, 'hans'));

  it('is one row per catalog entry, as before, except where two brands have numbers of their own', () => {
    for (const region of ['CN', 'HK', 'TW', 'SG', 'MY', 'OTHER'] as const) {
      const rows = chineseRows(CATALOG, region);
      expect(rows.map((o) => o.drugId), region).toEqual(CATALOG.map((d) => d.id));
      expect(rows.every((o) => o.brand === null), region).toBe(true);
    }
    // In the United States tirzepatide is two rows: the chart numbers of Zepbound and Mounjaro differ.
    const us = chineseRows(CATALOG, 'US');
    expect(us.filter((o) => o.drugId === 'tirzepatide').map((o) => o.brand)).toEqual(['Zepbound', 'Mounjaro']);
    expect(us.filter((o) => o.drugId !== 'tirzepatide').every((o) => o.brand === null)).toBe(true);
    expect(us).toHaveLength(CATALOG.length + 1);
    expect(labels('US')).toContain('Zepbound（替尔泊肽）');
    expect(labels('US')).toContain('Mounjaro（替尔泊肽）');
    expect(labels('US')).not.toContain('Zepbound / Mounjaro（替尔泊肽）');
    expect(labels('CN')).toContain('穆峰达（替尔泊肽）');
  });

  it('asks for the brand where the list has a row for each, and marks only the chosen one', () => {
    expect(needsBrandPickChinese('US', 'tirzepatide', null)).toBe(true);
    expect(needsBrandPickChinese('US', 'tirzepatide', 'Mounjaro')).toBe(false);
    expect(needsBrandPickChinese('CN', 'tirzepatide', null)).toBe(false);
    expect(needsBrandPickChinese('US', 'semaglutide-wl', null)).toBe(false);
    expect(needsBrandPickChinese('US', null, null)).toBe(false);
    const marked = (drugId: string | null, brand: string | null) => chineseRows(CATALOG, 'US').filter((o) => isChineseRowPicked(o, drugId, brand)).map((o) => `${o.drugId}:${o.brand ?? ''}`);
    expect(marked('tirzepatide', null)).toEqual([]);
    expect(marked('tirzepatide', 'Zepbound')).toEqual(['tirzepatide:Zepbound']);
    expect(marked('semaglutide-wl', null)).toEqual(['semaglutide-wl:']);
    // A row without a brand is marked whatever brand is kept for the medication.
    expect(isChineseRowPicked({ drugId: 'semaglutide-wl', brand: null, entry: drugById('semaglutide-wl') }, 'semaglutide-wl', 'Wegovy')).toBe(true);
  });
});

describe('setup: which row of the English list is marked', () => {
  it('marks exactly the chosen brand', () => {
    expect(marked('US', 'tirzepatide', 'Zepbound')).toEqual(['Zepbound (tirzepatide)']);
    expect(marked('US', 'tirzepatide', 'Mounjaro')).toEqual(['Mounjaro (tirzepatide)']);
    expect(marked('US', 'semaglutide-wl', 'Wegovy')).toEqual(['Wegovy (semaglutide)']);
    expect(marked('US', null, null)).toEqual([]);
  });

  it('a medication saved without a brand marks no row when the region has two, and asks for a choice', () => {
    // Picked from the Chinese list, or saved before brands were stored.
    expect(marked('US', 'tirzepatide', null)).toEqual([]);
    expect(needsBrandPick('US', 'tirzepatide', null)).toBe(true);
    expect(needsBrandPick('US', 'tirzepatide', 'Zepbound')).toBe(false);
  });

  it('a medication saved without a brand marks its row when the region has only one', () => {
    expect(marked('US', 'semaglutide-wl', null)).toEqual(['Wegovy (semaglutide)']);
    expect(needsBrandPick('US', 'semaglutide-wl', null)).toBe(false);
    expect(marked('OTHER', 'tirzepatide', null)).toEqual(['tirzepatide']);
    expect(marked('US', 'custom', null)).toEqual(['Other / custom']);
    expect(needsBrandPick('US', null, null)).toBe(false);
  });

  it('a medication the region does not list stays in view under its generic name', () => {
    const hk = englishRows('HK', 'orforglipron').map((o) => brandOptionLabel(o, 'HK', 'en'));
    expect(hk).toEqual(['Wegovy (semaglutide)', 'Ozempic (semaglutide)', 'Mounjaro (tirzepatide)', 'Saxenda (liraglutide)', 'Rybelsus (semaglutide)', 'orforglipron', 'Other / custom']);
    expect(marked('HK', 'orforglipron', null)).toEqual(['orforglipron']);
    expect(marked('US', 'mazdutide', null)).toEqual(['mazdutide']);
    // Nothing is added when the medication has a row, or none is chosen.
    // The US list is nine brands and "Other / custom".
    expect(englishRows('US', 'tirzepatide')).toHaveLength(10);
    expect(englishRows('US', null)).toHaveLength(10);
    // The two Ozempic rows are separate medications, so each marks only itself.
    expect(marked('US', 'semaglutide-t2d', 'Ozempic')).toEqual(['Ozempic (semaglutide)']);
    expect(marked('US', 'semaglutide-oral-t2d-ozempic', 'Ozempic pill')).toEqual(['Ozempic pill (semaglutide)']);
    expect(needsBrandPick('US', 'semaglutide-oral-t2d-ozempic', null)).toBe(false);
  });
});

describe('setup: redoing it starts from the saved medication', () => {
  it('first-time setup starts blank, as before', () => {
    expect(setupStart(null)).toEqual({ status: 'escalating', amount: '', doseUnit: 'mg', freqMode: 'weekly', weekday: null, time: '21:00', intervalDays: '7', weeksOnDose: '' });
  });

  it('a daily pill stays daily, at its own time, in its own status', () => {
    const pill: Regimen = { drugId: 'semaglutide-oral-t2d', brand: 'Rybelsus', doseAmount: 7, doseUnit: 'mg', schedule: { kind: 'daily', time: '07:00' }, status: 'maintenance' };
    expect(setupStart(pill)).toEqual({ status: 'maintenance', amount: '7', doseUnit: 'mg', freqMode: 'daily', weekday: null, time: '07:00', intervalDays: '7', weeksOnDose: '' });
  });

  it('a weekly shot keeps its weekday and time; an interval keeps its length', () => {
    const shot: Regimen = { drugId: 'tirzepatide', doseAmount: 5, doseUnit: 'mg', schedule: { kind: 'weekly', weekday: 1, time: '20:30' }, status: 'paused', weeksOnDoseAtStart: 3 };
    expect(setupStart(shot)).toMatchObject({ status: 'paused', amount: '5', freqMode: 'weekly', weekday: 1, time: '20:30', weeksOnDose: '3' });
    const custom: Regimen = { drugId: 'custom', doseAmount: 10, doseUnit: 'units', schedule: { kind: 'interval', hours: 84 }, status: 'maintenance' };
    expect(setupStart(custom)).toMatchObject({ amount: '10', doseUnit: 'units', freqMode: 'interval', intervalDays: '3.5', time: '21:00' });
    const noDose: Regimen = { drugId: 'orforglipron', doseAmount: null, doseUnit: 'mg', schedule: { kind: 'daily', time: '08:00' }, status: 'escalating' };
    expect(setupStart(noDose).amount).toBe('');
  });
});

describe('setup: redoing it changes nothing unless an answer is changed', () => {
  it('a weight field starts from the saved weight, in the unit chosen, to one decimal', () => {
    expect(savedWeightText(90.72, 'lb')).toBe('200');
    expect(savedWeightText(77.11, 'lb')).toBe('170');
    expect(savedWeightText(80.25, 'kg')).toBe('80.3');
    expect(savedWeightText(80, 'jin')).toBe('160');
    expect(savedWeightText(null, 'lb')).toBe('');
    expect(savedWeightText(undefined, 'kg')).toBe('');
  });

  it('a field that was not touched keeps the saved weight exactly, whatever the unit', () => {
    for (const unit of ['kg', 'lb', 'jin'] as const) {
      expect(fieldWeightKg(null, 90.72, unit)).toBe(90.72);
      expect(fieldWeightKg(null, 77.113, unit)).toBe(77.113);
    }
    expect(fieldWeightKg(null, null, 'lb')).toBeNull();
    expect(fieldWeightKg(null, undefined, 'lb')).toBeNull();
  });

  it('a field that was edited gives the typed weight; an emptied field means no weight', () => {
    expect(fieldWeightKg('200', 80, 'lb')).toBeCloseTo(90.72, 2);
    expect(fieldWeightKg('82.5', 80, 'kg')).toBe(82.5);
    expect(fieldWeightKg('', 80, 'kg')).toBeNull();
    expect(fieldWeightKg('  ', 80, 'kg')).toBeNull();
    // Text that is not a weight is not saved as one.
    expect(fieldWeightKg('abc', 80, 'kg')).toBeNull();
    expect(fieldWeightKg('0', 80, 'kg')).toBeNull();
    expect(fieldWeightKg('-5', 80, 'kg')).toBeNull();
  });

  it('the most recent dose is added only to a log that has no dose of the medication yet', () => {
    // First setup: nothing is logged yet.
    expect(addsStartingDose('escalating', 5, false)).toBe(true);
    expect(addsStartingDose('maintenance', 5, false)).toBe(true);
    expect(addsStartingDose('stopped', 5, false)).toBe(true);
    // Not started, or no amount: there is no dose to add.
    expect(addsStartingDose('not_started', 5, false)).toBe(false);
    expect(addsStartingDose('escalating', 0, false)).toBe(false);
    expect(addsStartingDose('escalating', Number('abc'), false)).toBe(false);
    // Setup redone: the log already has a dose of this medication, so nothing is added again.
    for (const status of ['escalating', 'maintenance', 'paused', 'stopped'] as const) expect(addsStartingDose(status, 5, true), status).toBe(false);
  });

  it('the weight is logged the first time, and again only when it was changed', () => {
    expect(addsStartingWeight(90.72, undefined)).toBe(true);
    expect(addsStartingWeight(90.72, null)).toBe(true);
    // Redone without touching the field: fieldWeightKg hands back the saved weight, and nothing is logged.
    expect(addsStartingWeight(fieldWeightKg(null, 90.72, 'lb'), 90.72)).toBe(false);
    expect(addsStartingWeight(fieldWeightKg('195', 90.72, 'lb'), 90.72)).toBe(true);
    expect(addsStartingWeight(null, 90.72)).toBe(false);
    expect(addsStartingWeight(null, null)).toBe(false);
  });
});

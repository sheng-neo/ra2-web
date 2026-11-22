import { describe, expect, it } from 'vitest';
import { brandOptionLabel, type BrandOption } from '../core/catalog';
import type { Regimen } from '../core/types';
import { brandIn, englishRows, isRowPicked, needsBrandPick, setupStart } from './setupChoice';

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
    expect(englishRows('US', 'tirzepatide')).toHaveLength(9);
    expect(englishRows('US', null)).toHaveLength(9);
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

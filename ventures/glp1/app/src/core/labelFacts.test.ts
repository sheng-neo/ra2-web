import { describe, expect, it } from 'vitest';
import { brandNumbers, brandOptions, CATALOG, chartBrands, drugById, hasLabelSource, labelBrand, maxDoseLabelBrands, maxDoseLabelName, regimenBrand, regimenLabel, unbackedNumbers, type DrugEntry } from './catalog';
import { hoursFromLabel, LABEL_FACTS, LABELS, LABELS_READ_ON, labelFact, labelFactsFor, PK_RULE, PK_SECTION, type LabelFact, type LabelField } from './labelFacts';

const where = (f: LabelFact) => `${f.entryId} / ${f.brand} / ${f.field}`;
const allQuotes = (f: LabelFact) => f.quotes.map((q) => q.text).join('\n');

/** "5 mg" in a text, but not as the tail of "2.5 mg" or "15 mg". */
const hasAmount = (text: string, n: number, unit: string) => new RegExp(`(?<![\\d.])${String(n).replace('.', '\\.')} ${unit}`).test(text);

/** Whether an entry carries any number that reaches the screen, for the entry itself or for one of its brands. */
function carriesNumbers(d: DrugEntry): boolean {
  const sets = [brandNumbers(d), ...Object.keys(d.byBrand ?? {}).map((b) => brandNumbers(d, b))];
  return sets.some((n) => n.ladderMg.length > 0 || n.maxMg !== null || n.pk !== null || n.fastingMin !== undefined);
}

describe('the labels that were read', () => {
  it('each one is a page on DailyMed or the FDA site, with its set id, version and date', () => {
    expect(LABELS_READ_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const labels = Object.values(LABELS);
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      expect(new URL(l.url).protocol, l.title).toBe('https:');
      expect(['dailymed.nlm.nih.gov', 'www.accessdata.fda.gov'], l.url).toContain(new URL(l.url).hostname);
      expect(l.setid, l.title).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(l.url, l.title).toBe(`https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${l.setid}`);
      expect(l.version, l.title).toMatch(/^\d+$/);
      expect(l.effective, l.title).toMatch(/^20\d{6}$/);
      expect(l.title.trim(), l.url).not.toBe('');
    }
    expect(new Set(labels.map((l) => l.setid)).size).toBe(labels.length);
  });

  it('every label is used by a row, and every row names one of them', () => {
    const used = new Set(LABEL_FACTS.map((f) => f.label));
    for (const l of Object.values(LABELS)) expect(used.has(l), l.title).toBe(true);
    for (const f of LABEL_FACTS) expect(Object.values(LABELS), where(f)).toContain(f.label);
  });
});

describe('provenance rows', () => {
  it('each row belongs to a US brand of a catalog entry, and there is one row per number', () => {
    const seen = new Set<string>();
    for (const f of LABEL_FACTS) {
      const entry = CATALOG.find((d) => d.id === f.entryId);
      expect(entry, where(f)).toBeDefined();
      expect(entry!.brands.US ?? [], where(f)).toContain(f.brand);
      expect(seen.has(where(f)), `two rows for ${where(f)}`).toBe(false);
      seen.add(where(f));
    }
  });

  it('no quote is empty, every quote names its label section, and the address is a US label page', () => {
    for (const f of LABEL_FACTS) {
      expect(f.quotes.length, where(f)).toBeGreaterThan(0);
      for (const q of f.quotes) {
        expect(q.text.trim(), where(f)).not.toBe('');
        expect(q.text, where(f)).toBe(q.text.trim());
        expect(q.text, where(f)).not.toMatch(/\s{2,}| /);
        expect(q.section, `${where(f)}: ${q.text}`).toMatch(/^\d+(\.\d+)?(, Table \d+)?$/);
      }
      expect(f.label.url, where(f)).toMatch(/^https:\/\/(dailymed\.nlm\.nih\.gov|www\.accessdata\.fda\.gov)\//);
    }
  });

  it('the value of each row can be read in its own quotes', () => {
    for (const f of LABEL_FACTS) {
      const text = allQuotes(f);
      if (f.field === 'ladderMg') {
        expect(Array.isArray(f.value), where(f)).toBe(true);
        const steps = f.value as number[];
        expect(steps.length, where(f)).toBeGreaterThan(0);
        for (const mg of steps) expect(hasAmount(text, mg, 'mg'), `${where(f)}: ${mg} mg`).toBe(true);
        expect([...steps].sort((a, b) => a - b), where(f)).toEqual(steps);
      } else if (f.field === 'maxMg') {
        expect(typeof f.value, where(f)).toBe('number');
        expect(hasAmount(text, f.value as number, 'mg'), where(f)).toBe(true);
      } else if (f.field === 'fastingMin') {
        if (f.value === null) expect(text, where(f)).toMatch(/with or without food/);
        else expect(hasAmount(text, f.value as number, 'minutes'), where(f)).toBe(true);
      } else if (f.field === 'frequency') {
        expect(['weekly', 'daily'], where(f)).toContain(f.value);
        expect(text, where(f)).toMatch(f.value === 'weekly' ? /once weekly/ : /once daily/);
      }
    }
  });

  it('half-life and time to peak: the label figures are in the quote, and the rule gives the hours', () => {
    const pkRows = LABEL_FACTS.filter((f) => f.field === 'halfLifeH' || f.field === 'tmaxH');
    expect(pkRows.length).toBeGreaterThan(0);
    for (const f of pkRows) {
      const text = allQuotes(f);
      expect(f.stated, where(f)).toBeDefined();
      const s = f.stated!;
      expect(f.rule, where(f)).toBe(PK_RULE);
      // The rule is about one section only, so every quote of these rows is from it.
      for (const q of f.quotes) expect(q.section, where(f)).toBe(PK_SECTION);
      expect(f.value, where(f)).toBe(hoursFromLabel(s));
      expect(text, where(f)).toMatch(f.field === 'halfLifeH' ? /half-life/ : /[Mm]aximum (plasma )?concentration/);
      if (s.kind === 'range') {
        expect(text, where(f)).toMatch(new RegExp(`(?<![\\d.])${s.low}( to |-)${s.high} ${s.unit}s`));
        expect(text, where(f)).not.toMatch(/median/);
      } else {
        expect(hasAmount(text, s.value, s.unit), where(f)).toBe(true);
        expect(/median/.test(text), where(f)).toBe(s.kind === 'median');
      }
    }
  });

  it('the rule: a single value or a median is used as it is, a range by its midpoint', () => {
    expect(hoursFromLabel({ kind: 'single', value: 1, unit: 'week' })).toBe(168);
    expect(hoursFromLabel({ kind: 'single', value: 5, unit: 'day' })).toBe(120);
    expect(hoursFromLabel({ kind: 'median', value: 24, unit: 'hour' })).toBe(24);
    expect(hoursFromLabel({ kind: 'range', low: 1, high: 3, unit: 'day' })).toBe(48);
    expect(hoursFromLabel({ kind: 'range', low: 5, high: 6, unit: 'day' })).toBe(132);
    expect(hoursFromLabel({ kind: 'range', low: 8, high: 72, unit: 'hour' })).toBe(40);
    expect(PK_RULE).toMatch(/single value or a median/);
    expect(PK_RULE).toMatch(/midpoint of the range/);
  });

  it('the rule names the one section it reads, because another section can word the figure differently', () => {
    expect(PK_SECTION).toBe('12.3');
    expect(PK_RULE).toContain('Both numbers are read from section 12.3 (Pharmacokinetics) of the label, and from no other section.');
    expect(PK_RULE).not.toMatch(/The label states/);
    // Zepbound: section 12.3 gives a range, section 10 a single value. The row uses 12.3 and says so.
    const zep = labelFact('tirzepatide', 'Zepbound', 'halfLifeH')!;
    expect(zep.stated).toEqual({ kind: 'range', low: 5, high: 6, unit: 'day' });
    expect(zep.value).toBe(132);
    expect(zep.note).toContain('Section 10 (Overdosage) of this label speaks of "the half-life of tirzepatide of approximately 5 days".');
  });
});

describe('catalog numbers and their label rows', () => {
  it('an entry carries a number only when it is label-backed: no number without a row', () => {
    for (const d of CATALOG) {
      if (carriesNumbers(d)) {
        expect(d.source, d.id).toBeDefined();
        expect(unbackedNumbers(d), d.id).toEqual([]);
        expect(hasLabelSource(d), d.id).toBe(true);
      } else {
        expect(d.source, d.id).toBeUndefined();
        expect(hasLabelSource(d), d.id).toBe(false);
      }
    }
    expect(CATALOG.filter(hasLabelSource).map((d) => d.id)).toEqual(['semaglutide-wl', 'semaglutide-t2d', 'tirzepatide', 'liraglutide', 'semaglutide-oral-wl', 'semaglutide-oral-t2d', 'semaglutide-oral-t2d-ozempic', 'orforglipron']);
  });

  it('a label-backed entry has a row for every number, for every US brand', () => {
    const fields = (n: ReturnType<typeof brandNumbers>): LabelField[] => ['frequency', ...(n.ladderMg.length ? ['ladderMg' as const] : []), ...(n.maxMg !== null ? ['maxMg' as const] : []), ...(n.pk ? ['halfLifeH' as const, 'tmaxH' as const] : []), ...(n.fastingMin !== undefined ? ['fastingMin' as const] : [])];
    for (const d of CATALOG.filter(hasLabelSource)) {
      for (const brand of d.brands.US!) {
        const n = brandNumbers(d, brand);
        for (const field of fields(n)) expect(labelFact(d.id, brand, field), `${d.id} / ${brand} / ${field}`).toBeDefined();
        expect(labelFact(d.id, brand, 'frequency')!.value, brand).toBe(d.frequency);
        if (n.ladderMg.length) expect(labelFact(d.id, brand, 'ladderMg')!.value, brand).toEqual(n.ladderMg);
        if (n.maxMg !== null) expect(labelFact(d.id, brand, 'maxMg')!.value, brand).toBe(n.maxMg);
        if (n.pk) expect([labelFact(d.id, brand, 'halfLifeH')!.value, labelFact(d.id, brand, 'tmaxH')!.value], brand).toEqual([n.pk.halfLifeH, n.pk.tmaxH]);
        if (n.fastingMin !== undefined) expect(labelFact(d.id, brand, 'fastingMin')!.value, brand).toBe(n.fastingMin);
        // A tablet without a wait has a row that says why.
        if (d.route === 'oral' && n.fastingMin === undefined) expect(labelFact(d.id, brand, 'fastingMin')?.value, brand).toBeNull();
      }
      // No row is left over for a number the catalog does not carry.
      for (const f of labelFactsFor(d.id)) {
        const n = brandNumbers(d, f.brand);
        if (f.field === 'halfLifeH' || f.field === 'tmaxH') expect(n.pk, where(f)).not.toBeNull();
        if (f.field === 'fastingMin') expect(n.fastingMin ?? null, where(f)).toBe(f.value);
      }
    }
  });

  it('taking a row away, or changing a number, makes the entry not label-backed', () => {
    const wegovy = drugById('semaglutide-wl');
    expect(hasLabelSource(wegovy)).toBe(true);
    expect(unbackedNumbers({ ...wegovy, maxMg: 2.4 })).toEqual(['Wegovy: maxMg']);
    expect(unbackedNumbers({ ...wegovy, ladderMg: wegovy.ladderMg.slice(0, -1) })).toEqual(['Wegovy: ladderMg']);
    expect(unbackedNumbers({ ...wegovy, ladderMg: [...wegovy.ladderMg, 9.6] })).toEqual(['Wegovy: ladderMg']);
    expect(unbackedNumbers({ ...wegovy, pk: { halfLifeH: 160, tmaxH: 48 } })).toEqual(['Wegovy: halfLifeH']);
    expect(unbackedNumbers({ ...wegovy, fastingMin: 30 })).toEqual(['Wegovy: fastingMin']);
    expect(hasLabelSource({ ...wegovy, maxMg: 2.4 })).toBe(false);
    expect(hasLabelSource({ ...wegovy, source: undefined })).toBe(false);
    expect(hasLabelSource({ ...wegovy, source: [] })).toBe(false);
    // An entry under another id has no rows at all.
    expect(hasLabelSource({ ...wegovy, id: 'something-else' })).toBe(false);
    // An entry with no US brand has no US label to stand on.
    expect(hasLabelSource({ ...wegovy, brands: { HK: ['Wegovy'] } })).toBe(false);
    // Numbers of the entry itself that no US brand uses come from no label.
    const tirz = drugById('tirzepatide');
    expect(unbackedNumbers({ ...tirz, pk: { halfLifeH: 120, tmaxH: 24 } })).toEqual(['no US brand: halfLifeH', 'no US brand: tmaxH']);
    // Numbers kept for a brand name that is not sold in the US have no label behind them.
    expect(unbackedNumbers({ ...tirz, byBrand: { ...tirz.byBrand, 穆峰达: { pk: { halfLifeH: 120, tmaxH: 40 } } } })).toEqual(['穆峰达: not a US brand']);
  });

  it('`source` lists exactly the label pages of the rows, and nothing is marked verified by code', () => {
    for (const d of CATALOG) {
      const pages = [...new Set(labelFactsFor(d.id).map((f) => f.label.url))];
      if (d.source) {
        expect([...d.source].sort(), d.id).toEqual([...pages].sort());
        for (const url of d.source) expect(url, d.id).toMatch(/^https:\/\/(www\.accessdata\.fda\.gov|dailymed\.nlm\.nih\.gov)\//);
      } else expect(pages, d.id).toEqual([]);
      expect(d.verified, d.id).toBe(false);
    }
  });

  it('only weekly shots have chart numbers, and only tablets have a wait', () => {
    for (const d of CATALOG) {
      for (const n of [brandNumbers(d), ...Object.keys(d.byBrand ?? {}).map((b) => brandNumbers(d, b))]) {
        if (n.pk) expect([d.route, d.frequency], d.id).toEqual(['sc', 'weekly']);
        if (n.fastingMin !== undefined) expect(d.route, d.id).toBe('oral');
        // One definition of a step for every entry: the schedule runs up to the highest dose, so the last step is that dose.
        if (n.maxMg !== null && n.ladderMg.length) expect(n.ladderMg[n.ladderMg.length - 1], d.id).toBe(n.maxMg);
        expect(n.ladderMg.length > 0, d.id).toBe(n.maxMg !== null);
      }
      for (const brand of Object.keys(d.byBrand ?? {})) expect(d.brands.US ?? [], `${d.id}: ${brand}`).toContain(brand);
    }
  });
});

describe('two brands, two labels', () => {
  const tirz = drugById('tirzepatide');

  it('Zepbound and Mounjaro share the dose steps and the highest dose, and each has the chart numbers of its own label', () => {
    expect(brandNumbers(tirz, 'Zepbound')).toEqual({ ladderMg: [2.5, 5, 7.5, 10, 12.5, 15], maxMg: 15, pk: { halfLifeH: 132, tmaxH: 24 }, fastingMin: undefined });
    expect(brandNumbers(tirz, 'Mounjaro')).toEqual({ ladderMg: [2.5, 5, 7.5, 10, 12.5, 15], maxMg: 15, pk: { halfLifeH: 120, tmaxH: 40 }, fastingMin: undefined });
    expect(labelFact('tirzepatide', 'Zepbound', 'halfLifeH')!.label).toBe(LABELS.zepbound);
    expect(labelFact('tirzepatide', 'Mounjaro', 'halfLifeH')!.label).toBe(LABELS.mounjaro);
  });

  it('without one of the two brand names there are no chart numbers: the app does not pick a label', () => {
    for (const brand of [undefined, null, '穆峰达', '猛健樂']) {
      expect(brandNumbers(tirz, brand).pk, String(brand)).toBeNull();
      expect(brandNumbers(tirz, brand).maxMg, String(brand)).toBe(15);
      expect(labelBrand(tirz, brand), String(brand)).toBeNull();
    }
    expect(labelBrand(tirz, 'Zepbound')).toBe('Zepbound');
  });

  it('a regimen saved without a brand uses the only brand of its region, which is the name the screens show', () => {
    expect(regimenBrand({ drugId: 'tirzepatide', brand: 'Zepbound' }, 'US')).toBe('Zepbound');
    expect(regimenBrand({ drugId: 'tirzepatide' }, 'HK')).toBe('Mounjaro');
    expect(regimenLabel({ drugId: 'tirzepatide' }, 'HK', 'en')).toBe('Mounjaro (tirzepatide)');
    expect(brandNumbers(tirz, regimenBrand({ drugId: 'tirzepatide' }, 'HK')).pk).toEqual({ halfLifeH: 120, tmaxH: 40 });
    // Two names in the US, a name with no label of its own in Mainland China, no name in "Other": no chart numbers.
    expect(regimenBrand({ drugId: 'tirzepatide' }, 'US')).toBeNull();
    expect(regimenBrand({ drugId: 'tirzepatide', brand: null }, 'OTHER')).toBeNull();
    expect(regimenBrand({ drugId: 'tirzepatide' }, 'CN')).toBe('穆峰达');
    for (const region of ['US', 'OTHER', 'CN', 'TW'] as const) expect(brandNumbers(tirz, regimenBrand({ drugId: 'tirzepatide' }, region)).pk, region).toBeNull();
    expect(regimenBrand({ drugId: 'custom' }, 'US')).toBeNull();
  });

  it('an entry with one US brand uses that label for every brand name and for no brand', () => {
    const wegovy = drugById('semaglutide-wl');
    for (const brand of [undefined, null, 'Wegovy', '诺和盈', '週纖達']) {
      expect(brandNumbers(wegovy, brand), String(brand)).toEqual({ ladderMg: [0.25, 0.5, 1, 1.7, 2.4, 7.2], maxMg: 7.2, pk: { halfLifeH: 168, tmaxH: 48 }, fastingMin: undefined });
      expect(labelBrand(wegovy, brand), String(brand)).toBe('Wegovy');
    }
    expect(labelBrand(drugById('mazdutide'))).toBeNull();
    expect(labelBrand(drugById('custom'))).toBeNull();
  });

  it('the typing check can name the US label its highest dose is from', () => {
    expect(maxDoseLabelBrands(tirz, 'Zepbound')).toEqual(['Zepbound']);
    expect(maxDoseLabelBrands(tirz, 'Mounjaro')).toEqual(['Mounjaro']);
    // No US brand name: both labels give the same highest dose, so both are named.
    for (const brand of [undefined, null, '穆峰达', '猛健樂']) expect(maxDoseLabelBrands(tirz, brand), String(brand)).toEqual(['Zepbound', 'Mounjaro']);
    expect(maxDoseLabelName(tirz, 'en', null)).toBe('Zepbound / Mounjaro');
    const wegovy = drugById('semaglutide-wl');
    for (const brand of [undefined, null, 'Wegovy', '诺和盈']) expect(maxDoseLabelBrands(wegovy, brand), String(brand)).toEqual(['Wegovy']);
    expect(maxDoseLabelName(drugById('semaglutide-oral-wl'), 'en')).toBe('Wegovy pill');
    expect(maxDoseLabelName(drugById('semaglutide-oral-wl'), 'hans')).toBe('Wegovy 片');
    expect(maxDoseLabelName(drugById('liraglutide'), 'en', null)).toBe('Saxenda');
    // Every entry with a highest dose has a label to name; an entry without one has none.
    for (const d of CATALOG) {
      expect(maxDoseLabelBrands(d).length > 0, d.id).toBe(d.maxMg !== null);
      for (const b of maxDoseLabelBrands(d)) expect(labelFact(d.id, b, 'maxMg')!.value, `${d.id}: ${b}`).toBe(d.maxMg);
    }
    // A brand with a highest dose of its own is not named for a regimen that uses another number.
    const split: DrugEntry = { ...tirz, byBrand: { ...tirz.byBrand, Zepbound: { ...tirz.byBrand!.Zepbound, maxMg: 12.5 } } };
    expect(maxDoseLabelBrands(split, null)).toEqual(['Mounjaro']);
    expect(maxDoseLabelBrands(split, 'Zepbound')).toEqual(['Zepbound']);
  });

  it('a regimen without chart numbers knows which brands have them', () => {
    for (const brand of [undefined, null, '穆峰达', '猛健樂']) expect(chartBrands(tirz, brand), String(brand)).toEqual(['Zepbound', 'Mounjaro']);
    expect(chartBrands(tirz, 'Zepbound')).toEqual([]);
    expect(chartBrands(tirz, 'Mounjaro')).toEqual([]);
    // A medication with no chart numbers at all, or with one pair for every brand, has no such list.
    for (const id of ['semaglutide-wl', 'liraglutide', 'orforglipron', 'mazdutide', 'custom']) expect(chartBrands(drugById(id)), id).toEqual([]);
  });

  it('the two tablet brands on one label are separate entries with their own doses', () => {
    expect(brandNumbers(drugById('semaglutide-oral-t2d'), 'Rybelsus')).toEqual({ ladderMg: [3, 7, 14], maxMg: 14, pk: null, fastingMin: 30 });
    expect(brandNumbers(drugById('semaglutide-oral-t2d-ozempic'), 'Ozempic pill')).toEqual({ ladderMg: [1.5, 4, 9], maxMg: 9, pk: null, fastingMin: 30 });
    expect(labelFact('semaglutide-oral-t2d', 'Rybelsus', 'ladderMg')!.label).toBe(LABELS.semaglutideTablets);
    expect(labelFact('semaglutide-oral-t2d-ozempic', 'Ozempic pill', 'ladderMg')!.label).toBe(LABELS.semaglutideTablets);
  });
});

describe('saved profiles keep working', () => {
  /** Every entry id and brand name a profile could have been saved with before the labels were read. */
  const SAVED: [string, string[]][] = [
    ['semaglutide-wl', ['诺和盈', '週纖達', 'Wegovy']],
    ['semaglutide-t2d', ['诺和泰', '胰妥讚', 'Ozempic']],
    ['tirzepatide', ['穆峰达', '猛健樂', 'Mounjaro', 'Zepbound']],
    ['mazdutide', ['信尔美']],
    ['liraglutide', ['善纖達', 'Saxenda']],
    ['semaglutide-oral-wl', ['Wegovy pill']],
    ['semaglutide-oral-t2d', ['诺和忻', '瑞倍適', 'Rybelsus']],
    ['orforglipron', ['Foundayo']],
    ['custom', []],
  ];

  it('a saved regimen with each existing id and brand still resolves to its own entry', () => {
    for (const [id, brands] of SAVED) {
      const entry = drugById(id);
      // drugById falls back to "Other / custom" for an id it does not know.
      expect(entry.id, id).toBe(id);
      const known = Object.values(entry.brands).flat();
      for (const brand of brands) {
        expect(known, `${id}: ${brand}`).toContain(brand);
        for (const lang of ['en', 'hans', 'hant'] as const) expect(regimenLabel({ drugId: id, brand }, 'US', lang).trim(), `${id}: ${brand}`).not.toBe('');
        // The numbers of a saved regimen can be read, whatever its brand.
        expect(() => brandNumbers(entry, brand), `${id}: ${brand}`).not.toThrow();
      }
      expect(regimenLabel({ drugId: id }, 'US', 'en').trim(), id).not.toBe('');
    }
  });

  it('a regimen saved with the old Mainland China name of liraglutide (the bare generic name) still works', () => {
    // The name is no longer a brand of any entry. The regimen keeps its entry and its numbers, and is shown under the generic name.
    const saved = { drugId: 'liraglutide', brand: '利拉鲁肽' };
    expect(CATALOG.filter((d) => Object.values(d.brands).flat().includes(saved.brand))).toEqual([]);
    expect(drugById(saved.drugId).id).toBe('liraglutide');
    expect(regimenLabel(saved, 'CN', 'hans')).toBe('利拉鲁肽（减重）');
    expect(regimenLabel(saved, 'CN', 'en')).toBe('liraglutide for weight');
    expect(regimenBrand(saved, 'CN')).toBe('利拉鲁肽');
    expect(brandNumbers(drugById('liraglutide'), regimenBrand(saved, 'CN'))).toEqual({ ladderMg: [0.6, 1.2, 1.8, 2.4, 3], maxMg: 3, pk: null, fastingMin: undefined });
    expect(maxDoseLabelBrands(drugById('liraglutide'), regimenBrand(saved, 'CN'))).toEqual(['Saxenda']);
  });

  it('no stored brand name moved to another entry, and no entry was removed', () => {
    const ids = CATALOG.map((d) => d.id);
    for (const [id] of SAVED) expect(ids, id).toContain(id);
    for (const [id, brands] of SAVED) {
      for (const brand of brands) {
        const owners = CATALOG.filter((d) => Object.values(d.brands).flat().includes(brand)).map((d) => d.id);
        expect(owners, brand).toEqual([id]);
      }
    }
  });

  it('the US list has every earlier brand, and one new one next to its sibling', () => {
    const us = brandOptions('US').map((o) => o.brand);
    expect(us).toEqual(['Wegovy', 'Ozempic', 'Zepbound', 'Mounjaro', 'Wegovy pill', 'Foundayo', 'Rybelsus', 'Ozempic pill', 'Saxenda', null]);
    expect(brandOptions('US').find((o) => o.brand === 'Ozempic pill')!.drugId).toBe('semaglutide-oral-t2d-ozempic');
  });
});

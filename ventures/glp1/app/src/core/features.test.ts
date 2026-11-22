import { describe, expect, it } from 'vitest';
import { brandNumbers, brandOptions, CATALOG, drugById, hasLabelSource, type DrugEntry } from './catalog';
import { BUILD_PROFILES, FULL, LAUNCH, chartNeedsBrand, curveAvailable, doseCheckApplies, doseExample, fastingMinutes, featuresFor, labelFactsShown, languageChoices, parseBuildProfile, regionChoices, safetyQuestions, setupSteps, thirdTab, type Features } from './features';

describe('build profile', () => {
  it('is "full" when nothing is set, and reads the two names', () => {
    expect(parseBuildProfile(undefined)).toBe('full');
    expect(parseBuildProfile(null)).toBe('full');
    expect(parseBuildProfile('')).toBe('full');
    expect(parseBuildProfile('full')).toBe('full');
    expect(parseBuildProfile('launch')).toBe('launch');
  });

  it('refuses anything else, so a typo cannot quietly build the wrong app', () => {
    for (const bad of ['Launch', 'launch ', 'prod', 'true', 1, true, {}]) expect(() => parseBuildProfile(bad), String(bad)).toThrow(/VITE_BUILD_PROFILE/);
  });

  it('each profile has its own table, with the same switches', () => {
    expect(BUILD_PROFILES).toEqual(['full', 'launch']);
    expect(featuresFor('full')).toBe(FULL);
    expect(featuresFor('launch')).toBe(LAUNCH);
    expect(Object.keys(LAUNCH).sort()).toEqual(Object.keys(FULL).sort());
    for (const table of [FULL, LAUNCH]) for (const v of Object.values(table)) expect(typeof v).toBe('boolean');
  });
});

describe('switches of the full build', () => {
  it('everything the app has is on, and nothing is restricted', () => {
    const expected: Features = {
      ai: true,
      freeTextNote: true,
      triageDetailCards: true,
      copingCards: true,
      workouts: true,
      dailyAdvice: true,
      foodAndProtein: true,
      maintenanceContent: true,
      chineseChoice: true,
      allRegions: true,
      curveNeedsSource: false,
      under18EndsSetup: false,
      loggingToolNotice: false,
      hostServices: true,
      setupQuestions: false,
      proInterest: false,
      anonymousCounts: false,
      guideWarningSigns: true,
    };
    expect(FULL).toEqual(expected);
  });
});

describe('switches of the launch build', () => {
  it('has no model calls and no note box', () => {
    expect(LAUNCH.ai).toBe(false);
    expect(LAUNCH.freeTextNote).toBe(false);
  });

  it('hides what has not been reviewed', () => {
    for (const k of ['triageDetailCards', 'copingCards', 'workouts', 'dailyAdvice', 'foodAndProtein', 'maintenanceContent', 'chineseChoice', 'allRegions', 'hostServices'] as const) expect(LAUNCH[k], k).toBe(false);
  });

  it('turns on the launch rules', () => {
    for (const k of ['curveNeedsSource', 'under18EndsSetup', 'loggingToolNotice'] as const) expect(LAUNCH[k], k).toBe(true);
  });

  it('shows the warning signs of the Medication Guide, as the full build does', () => {
    expect(LAUNCH.guideWarningSigns).toBe(true);
    expect(FULL.guideWarningSigns).toBe(true);
  });

  it('asks the three setup questions, has the Pro row and may count anonymously', () => {
    for (const k of ['setupQuestions', 'proInterest', 'anonymousCounts'] as const) {
      expect(LAUNCH[k], k).toBe(true);
      expect(FULL[k], k).toBe(false);
    }
  });
});

describe('setup', () => {
  it('the launch build has no AI consent step', () => {
    expect(setupSteps(FULL)).toEqual(['hello', 'medication', 'body', 'safety', 'ai']);
    expect(setupSteps(LAUNCH)).toEqual(['hello', 'medication', 'body', 'safety', 'about']);
    expect(setupSteps(LAUNCH)).not.toContain('ai');
    // Turning the note box back on does not bring the AI step back.
    const withNoteBox: Features = { ...LAUNCH, freeTextNote: true };
    expect(setupSteps(withNoteBox)).not.toContain('ai');
  });

  it('the three optional questions come after the safety step, and only where the build asks them', () => {
    expect(setupSteps({ ai: false, setupQuestions: false })).toEqual(['hello', 'medication', 'body', 'safety']);
    expect(setupSteps({ ai: false, setupQuestions: true })).toEqual(['hello', 'medication', 'body', 'safety', 'about']);
    expect(setupSteps({ ai: true, setupQuestions: true })).toEqual(['hello', 'medication', 'body', 'safety', 'about', 'ai']);
  });

  it('the consent screen for anonymous counts is the last step, and only when the caller asks for it', () => {
    expect(setupSteps(LAUNCH, true)).toEqual(['hello', 'medication', 'body', 'safety', 'about', 'counts']);
    expect(setupSteps(LAUNCH, false)).not.toContain('counts');
    expect(setupSteps(FULL)).not.toContain('counts');
    expect(setupSteps(FULL, true)).toEqual(['hello', 'medication', 'body', 'safety', 'ai', 'counts']);
    // Every step after "safety" stays after it: checking "Under 18" there ends setup before any of them.
    for (const steps of [setupSteps(LAUNCH, true), setupSteps(FULL, true)]) {
      const safety = steps.indexOf('safety');
      for (const later of ['about', 'ai', 'counts'] as const) if (steps.includes(later)) expect(steps.indexOf(later)).toBeGreaterThan(safety);
    }
  });

  it('the kidney or liver question is only asked where there is a protein target', () => {
    expect(safetyQuestions(FULL)).toEqual(['kidneyOrLiver', 'pregnancy', 'insulinOrSU', 'eatingDisorder', 'under18']);
    expect(safetyQuestions(LAUNCH)).toEqual(['pregnancy', 'insulinOrSU', 'eatingDisorder', 'under18']);
  });
});

describe('language choices', () => {
  it('the full build offers every language', () => {
    for (const lang of ['en', 'hans', 'hant'] as const) expect(languageChoices(lang, FULL)).toEqual(['en', 'hans', 'hant']);
  });

  it('the launch build offers no Chinese to an English profile, so there is nothing to pick', () => {
    expect(languageChoices('en', LAUNCH)).toEqual(['en']);
  });

  it('a profile that is already Chinese keeps its language in the list and can move to English', () => {
    expect(languageChoices('hans', LAUNCH)).toEqual(['en', 'hans']);
    expect(languageChoices('hant', LAUNCH)).toEqual(['en', 'hant']);
  });
});

describe('estimated medication level curve', () => {
  const tirz = drugById('tirzepatide');

  it('the full build draws it for every entry and brand with PK numbers', () => {
    for (const d of CATALOG) expect(curveAvailable(d, FULL), d.id).toBe(d.pk !== null);
    expect(curveAvailable(drugById('semaglutide-wl'), FULL)).toBe(true);
    expect(curveAvailable(tirz, FULL, 'Zepbound')).toBe(true);
    expect(curveAvailable(tirz, FULL, 'Mounjaro')).toBe(true);
    // The two labels give different numbers, so without one of the two brand names there is no chart.
    expect(curveAvailable(tirz, FULL)).toBe(false);
    expect(curveAvailable(tirz, FULL, '穆峰达')).toBe(false);
  });

  it('the launch build draws it only for a label-backed entry', () => {
    expect(curveAvailable(tirz, LAUNCH, 'Zepbound')).toBe(true);
    // The same entry without its label pages is not label-backed.
    const unsourced: DrugEntry = { ...tirz, source: undefined };
    expect(hasLabelSource(unsourced)).toBe(false);
    expect(curveAvailable(unsourced, LAUNCH, 'Zepbound')).toBe(false);
    expect(curveAvailable(unsourced, FULL, 'Zepbound')).toBe(true);
    // A number that has no row in labelFacts.ts takes the label backing away, source or not.
    const changed: DrugEntry = { ...tirz, byBrand: { ...tirz.byBrand, Zepbound: { pk: { halfLifeH: 120, tmaxH: 24 } } } };
    expect(hasLabelSource(changed)).toBe(false);
    expect(curveAvailable(changed, LAUNCH, 'Zepbound')).toBe(false);
    expect(curveAvailable(changed, LAUNCH, 'Mounjaro')).toBe(false);
    // A source does not make up for missing numbers.
    expect(curveAvailable({ ...drugById('semaglutide-wl'), pk: null }, LAUNCH)).toBe(false);
  });

  it('the launch build draws it for the four weekly US brands, and for no daily medication', () => {
    const us = brandOptions('US');
    expect(us.filter((o) => curveAvailable(o.entry, LAUNCH, o.brand)).map((o) => o.brand)).toEqual(['Wegovy', 'Ozempic', 'Zepbound', 'Mounjaro']);
    expect(us.filter((o) => !curveAvailable(o.entry, LAUNCH, o.brand)).map((o) => o.brand)).toEqual(['Wegovy pill', 'Foundayo', 'Rybelsus', 'Ozempic pill', 'Saxenda', null]);
    for (const o of us) if (o.entry.frequency === 'daily') expect(curveAvailable(o.entry, FULL, o.brand), String(o.brand)).toBe(false);
  });
});

describe('a chart that only needs a brand', () => {
  const tirz = drugById('tirzepatide');

  it('tirzepatide without Zepbound or Mounjaro: the brands are named, and the US list lets the person choose', () => {
    for (const f of [FULL, LAUNCH]) {
      expect(chartNeedsBrand(tirz, f, null, 'US')).toEqual({ brands: ['Zepbound', 'Mounjaro'], canChoose: true });
      // A local name, or no name at all: the person's list does not offer the two brands.
      expect(chartNeedsBrand(tirz, f, '穆峰达', 'CN')).toEqual({ brands: ['Zepbound', 'Mounjaro'], canChoose: false });
      expect(chartNeedsBrand(tirz, f, '猛健樂', 'TW')).toEqual({ brands: ['Zepbound', 'Mounjaro'], canChoose: false });
      expect(chartNeedsBrand(tirz, f, null, 'OTHER')).toEqual({ brands: ['Zepbound', 'Mounjaro'], canChoose: false });
    }
  });

  it('is null when the chart is drawn, and for a medication that has no chart numbers at all', () => {
    for (const f of [FULL, LAUNCH]) {
      expect(chartNeedsBrand(tirz, f, 'Zepbound', 'US')).toBeNull();
      expect(chartNeedsBrand(tirz, f, 'Mounjaro', 'HK')).toBeNull();
      for (const id of ['semaglutide-wl', 'liraglutide', 'semaglutide-oral-wl', 'orforglipron', 'mazdutide', 'custom']) expect(chartNeedsBrand(drugById(id), f, null, 'US'), id).toBeNull();
    }
  });

  it('names no brand whose chart this build would not draw', () => {
    // Without its label source the launch build draws no chart for either brand, so choosing one would not help.
    const unsourced: DrugEntry = { ...tirz, source: undefined };
    expect(chartNeedsBrand(unsourced, LAUNCH, null, 'US')).toBeNull();
    expect(chartNeedsBrand(unsourced, FULL, null, 'US')).toEqual({ brands: ['Zepbound', 'Mounjaro'], canChoose: true });
  });
});

describe('other catalog numbers on screen: dose example, typing check, wait after a pill', () => {
  const unsourced = (d: DrugEntry): DrugEntry => ({ ...d, source: undefined });
  const overMax = (d: DrugEntry) => (d.maxMg ?? 0) + 1;

  it('the full build uses them for every entry that has them, as before', () => {
    for (const d of [...CATALOG, ...CATALOG.map(unsourced)]) {
      expect(labelFactsShown(d, FULL), d.id).toBe(true);
      expect(doseCheckApplies(d, overMax(d), 'mg', FULL), d.id).toBe(d.maxMg !== null);
      expect(doseCheckApplies(d, d.maxMg ?? 1, 'mg', FULL), d.id).toBe(false);
      expect(fastingMinutes(d, FULL), d.id).toBe(d.fastingMin ?? null);
      expect(doseExample(d, FULL), d.id).toBe(d.ladderMg[0] ?? null);
    }
    // Entries with these numbers exist, so the lines above test something.
    expect(CATALOG.some((d) => d.maxMg !== null)).toBe(true);
    expect(CATALOG.some((d) => d.fastingMin)).toBe(true);
    expect(CATALOG.some((d) => d.ladderMg.length > 0)).toBe(true);
  });

  it('the launch build uses none of them for an entry that is not label-backed: the medication can only be logged', () => {
    const notBacked = [...CATALOG.map(unsourced), ...CATALOG.filter((d) => !hasLabelSource(d))];
    expect(notBacked.map((d) => d.id)).toContain('mazdutide');
    for (const d of notBacked) {
      expect(labelFactsShown(d, LAUNCH), d.id).toBe(false);
      for (const amount of [overMax(d), 50, 999]) expect(doseCheckApplies(d, amount, 'mg', LAUNCH), d.id).toBe(false);
      expect(fastingMinutes(d, LAUNCH), d.id).toBeNull();
      expect(doseExample(d, LAUNCH), d.id).toBeNull();
    }
  });

  it('the launch build uses them for every label-backed entry', () => {
    const backed = CATALOG.filter(hasLabelSource);
    expect(backed.length).toBeGreaterThan(0);
    for (const d of backed) {
      expect(labelFactsShown(d, LAUNCH), d.id).toBe(true);
      expect(doseCheckApplies(d, overMax(d), 'mg', LAUNCH), d.id).toBe(d.maxMg !== null);
      expect(fastingMinutes(d, LAUNCH), d.id).toBe(d.fastingMin ?? null);
      expect(doseExample(d, LAUNCH), d.id).toBe(d.ladderMg[0] ?? null);
    }
  });

  it('what each US brand gets in the launch build', () => {
    const row = (brand: string) => {
      const o = brandOptions('US').find((x) => x.brand === brand)!;
      const n = brandNumbers(o.entry, o.brand);
      return { example: doseExample(o.entry, LAUNCH, o.brand), max: n.maxMg, checked: doseCheckApplies(o.entry, (n.maxMg ?? 0) + 0.1, 'mg', LAUNCH, o.brand), wait: fastingMinutes(o.entry, LAUNCH, o.brand) };
    };
    expect(row('Wegovy')).toEqual({ example: 0.25, max: 7.2, checked: true, wait: null });
    expect(row('Ozempic')).toEqual({ example: 0.25, max: 2, checked: true, wait: null });
    expect(row('Zepbound')).toEqual({ example: 2.5, max: 15, checked: true, wait: null });
    expect(row('Mounjaro')).toEqual({ example: 2.5, max: 15, checked: true, wait: null });
    expect(row('Wegovy pill')).toEqual({ example: 1.5, max: 25, checked: true, wait: 30 });
    expect(row('Foundayo')).toEqual({ example: 0.8, max: 17.2, checked: true, wait: null });
    expect(row('Rybelsus')).toEqual({ example: 3, max: 14, checked: true, wait: 30 });
    expect(row('Ozempic pill')).toEqual({ example: 1.5, max: 9, checked: true, wait: 30 });
    expect(row('Saxenda')).toEqual({ example: 0.6, max: 3, checked: true, wait: null });
    // The highest dose itself is never questioned: Wegovy 7.2 mg is on the label.
    expect(doseCheckApplies(drugById('semaglutide-wl'), 7.2, 'mg', LAUNCH, 'Wegovy')).toBe(false);
    expect(doseCheckApplies(drugById('semaglutide-wl'), 24, 'mg', LAUNCH, 'Wegovy')).toBe(true);
  });

  it('the typing check needs a US brand to name: its line says whose highest dose it is', () => {
    // An entry with a highest dose but no US brand has no label to name, in either build.
    const noUs: DrugEntry = { ...drugById('semaglutide-wl'), brands: { HK: ['Wegovy'] } };
    expect(doseCheckApplies(noUs, 99, 'mg', FULL, 'Wegovy')).toBe(false);
    expect(doseCheckApplies(noUs, 99, 'mg', LAUNCH, 'Wegovy')).toBe(false);
    // A brand of another region and a regimen without a brand use the US label of the entry.
    for (const brand of [null, '诺和盈', 'Wegovy']) expect(doseCheckApplies(drugById('semaglutide-wl'), 99, 'mg', LAUNCH, brand), String(brand)).toBe(true);
    for (const brand of [null, '穆峰达', 'Zepbound', 'Mounjaro']) expect(doseCheckApplies(drugById('tirzepatide'), 15.1, 'mg', LAUNCH, brand), String(brand)).toBe(true);
  });

  it('the typing check is still only for doses in mg', () => {
    const d = drugById('tirzepatide');
    expect(doseCheckApplies(d, 999, 'units', LAUNCH)).toBe(false);
    expect(doseCheckApplies(d, 999, 'mg', LAUNCH)).toBe(true);
  });
});

describe('third tab', () => {
  it('is Ask with coping cards and the question list without them', () => {
    expect(thirdTab(FULL)).toBe('ask');
    expect(thirdTab(LAUNCH)).toBe('questions');
  });
});

describe('places offered on the first setup screen', () => {
  it('the full build offers every place, in the order of the language', () => {
    expect(regionChoices('en', 'US', FULL)).toEqual(['US', 'HK', 'TW', 'SG', 'MY', 'CN', 'OTHER']);
    expect(regionChoices('hans', 'CN', FULL)[0]).toBe('CN');
  });

  it('the launch build offers the United States and Other', () => {
    expect(regionChoices('en', 'US', LAUNCH)).toEqual(['US', 'OTHER']);
    expect(regionChoices('en', 'OTHER', LAUNCH)).toEqual(['US', 'OTHER']);
  });

  it('the launch build keeps a place the profile already uses', () => {
    expect(regionChoices('en', 'HK', LAUNCH)).toEqual(['US', 'HK', 'OTHER']);
  });
});

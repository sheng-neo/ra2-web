import { describe, expect, it } from 'vitest';
import { CATALOG, drugById, type DrugEntry } from './catalog';
import { BUILD_PROFILES, FULL, LAUNCH, curveAvailable, doseCheckApplies, doseExample, fastingMinutes, featuresFor, labelFactsShown, languageChoices, parseBuildProfile, regionChoices, safetyQuestions, setupSteps, thirdTab, type Features } from './features';

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
  it('the full build draws it for every entry with PK numbers', () => {
    for (const d of CATALOG) expect(curveAvailable(d, FULL), d.id).toBe(d.pk !== null);
    expect(curveAvailable(drugById('tirzepatide'), FULL)).toBe(true);
  });

  it('the launch build draws it only for an entry that names its label source', () => {
    for (const d of CATALOG) expect(curveAvailable(d, LAUNCH), d.id).toBe(d.pk !== null && d.source !== undefined);
    const sourced: DrugEntry = { ...drugById('tirzepatide'), source: 'https://dailymed.nlm.nih.gov/example' };
    expect(curveAvailable(sourced, LAUNCH)).toBe(true);
    // A source does not make up for missing numbers.
    expect(curveAvailable({ ...sourced, pk: null }, LAUNCH)).toBe(false);
  });

  it('no entry has a source yet, so the launch build draws no curve today', () => {
    expect(CATALOG.filter((d) => curveAvailable(d, LAUNCH)).map((d) => d.id)).toEqual([]);
  });
});

describe('other catalog numbers on screen: dose example, typing check, wait after a pill', () => {
  const withSource = (d: DrugEntry): DrugEntry => ({ ...d, source: 'https://dailymed.nlm.nih.gov/example' });
  const overMax = (d: DrugEntry) => (d.maxMg ?? 0) + 1;

  it('the full build uses them for every entry that has them, as before', () => {
    for (const d of CATALOG) {
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

  it('the launch build uses none of them for an entry without a label source: the medication can only be logged', () => {
    for (const d of CATALOG) {
      expect(d.source, d.id).toBeUndefined();
      expect(labelFactsShown(d, LAUNCH), d.id).toBe(false);
      for (const amount of [overMax(d), 50, 999]) expect(doseCheckApplies(d, amount, 'mg', LAUNCH), d.id).toBe(false);
      expect(fastingMinutes(d, LAUNCH), d.id).toBeNull();
      expect(doseExample(d, LAUNCH), d.id).toBeNull();
    }
  });

  it('they come back by themselves once an entry names its label source', () => {
    for (const d of CATALOG.map(withSource)) {
      expect(labelFactsShown(d, LAUNCH), d.id).toBe(true);
      expect(doseCheckApplies(d, overMax(d), 'mg', LAUNCH), d.id).toBe(d.maxMg !== null);
      expect(fastingMinutes(d, LAUNCH), d.id).toBe(d.fastingMin ?? null);
      expect(doseExample(d, LAUNCH), d.id).toBe(d.ladderMg[0] ?? null);
    }
  });

  it('the typing check is still only for doses in mg', () => {
    const d = withSource(drugById('tirzepatide'));
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

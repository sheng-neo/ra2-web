/**
 * Build profiles and feature switches.
 *
 * The app is built in one of two profiles, chosen at build time by VITE_BUILD_PROFILE:
 * - "full" (the default): everything the app has.
 * - "launch": the first public version. Content that has not been reviewed by a clinician,
 *   and everything that calls a model, is left out.
 *
 * Each switch is one named boolean. To change what a profile contains, flip its line in FULL
 * or LAUNCH below; nothing else needs to change. The screens read the switches of the running
 * build from src/web/features.ts. The functions in this file take the switches as an argument,
 * so they can be tested for both profiles.
 */
import { brandNumbers, chartBrands, hasLabelSource, maxDoseLabelBrands, needsDoseConfirm, regionsFor, type DoseUnit, type DrugEntry, type Region } from './catalog';
import { LANGS, type Lang } from './i18n';
import type { Safety } from './types';

export type BuildProfile = 'full' | 'launch';

export const BUILD_PROFILES: readonly BuildProfile[] = ['full', 'launch'];

export interface Features {
  /**
   * Anything that calls a model: reading a note or a photo on the server, the camera button,
   * the AI step of setup and the AI setting. Off: the app has no code path to /api/parse.
   */
  ai: boolean;
  /** The free-text note box above the tabs. Off: logging is by buttons only. */
  freeTextNote: boolean;
  /**
   * A danger-symptom alert shows the card written for its rule. Off: every alert shows one
   * fixed card ("Contact your doctor right away"); only a crisis alert keeps its own card.
   * Matching is the same either way.
   */
  triageDetailCards: boolean;
  /** Coping cards: on the Ask tab and after a symptom is logged. */
  copingCards: boolean;
  /** Workouts: the routines, logging a workout, the weekly count. */
  workouts: boolean;
  /** The daily advice card at the top of Today. */
  dailyAdvice: boolean;
  /** Food and protein: logging food, the protein target and its setup questions, the quick food buttons. */
  foodAndProtein: boolean;
  /**
   * Content for the time after stopping the medication: the after-stopping notes and the
   * weight-regain bands. The status choices (including paused and stopped) do not depend on it.
   */
  maintenanceContent: boolean;
  /** The Chinese choices in the language pickers. A profile that is already Chinese works either way. */
  chineseChoice: boolean;
  /**
   * The full list of places on the first setup screen. Off: the list is "United States" and
   * "Other", because the first public version is sold in the US store only. A place the profile
   * already uses stays in the list.
   */
  allRegions: boolean;
  /**
   * On: the numbers of a catalog entry are used only when the entry is label-backed: it names
   * the US label pages they were read from (`source`) and every number has its row in
   * core/labelFacts.ts (hasLabelSource). That covers the estimated medication level curve and
   * every other place a catalog number reaches the screen: the dose example in setup, the typing
   * check against the highest dose, and the wait after a pill. An entry that is not label-backed
   * can only be logged.
   * Off: any entry with numbers.
   */
  curveNeedsSource: boolean;
  /**
   * On: checking "Under 18" ends setup. What was entered is dropped and nothing is saved.
   * Off: the older screen, which lets the user go back and uncheck it.
   */
  under18EndsSetup: boolean;
  /** The "logging tool, not a medical device" notice in setup and settings; it also replaces the older disclaimer line. */
  loggingToolNotice: boolean;
  /**
   * What the app does when it is opened as a private page inside a host that offers an account
   * store: the records are mirrored to the user's account there, and exported files are saved
   * through the host. Off: the build has no code for any of it; records stay in the browser.
   */
  hostServices: boolean;
  /**
   * The three optional questions at the end of setup: how long on the medication, what was used
   * to log before, where the person heard about the app (core/setupQuestions.ts). The answers
   * are saved in the profile.
   */
  setupQuestions: boolean;
  /**
   * The "Pro" row in settings. It opens a sheet that says Pro is not available yet, with one
   * button, "I would want this". The button unlocks nothing.
   */
  proInterest: boolean;
  /**
   * Anonymous counting (core/counts.ts): the consent screen in setup, the setting, and the few
   * counts that are sent to our own server after a yes. A build also needs the address of that
   * server (the build variable VITE_COUNT_URL). Without one it asks nothing and sends nothing.
   */
  anonymousCounts: boolean;
}

/** Everything the app has. This is the app as it was before build profiles existed. */
export const FULL: Features = {
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

/** The first public version. */
export const LAUNCH: Features = {
  ai: false,
  freeTextNote: false,
  triageDetailCards: false,
  copingCards: false,
  workouts: false,
  dailyAdvice: false,
  foodAndProtein: false,
  maintenanceContent: false,
  chineseChoice: false,
  allRegions: false,
  curveNeedsSource: true,
  under18EndsSetup: true,
  loggingToolNotice: true,
  hostServices: false,
  setupQuestions: true,
  proInterest: true,
  anonymousCounts: true,
};

/**
 * The profile named by the build variable. Nothing set means "full". A value that is not a
 * profile name is an error: a typo must not quietly build the wrong app.
 */
export function parseBuildProfile(raw: unknown): BuildProfile {
  if (raw === undefined || raw === null || raw === '') return 'full';
  if (raw === 'full' || raw === 'launch') return raw;
  throw new Error(`VITE_BUILD_PROFILE must be "full" or "launch", not ${JSON.stringify(raw)}`);
}

export function featuresFor(profile: BuildProfile): Features {
  return profile === 'launch' ? LAUNCH : FULL;
}

// ── Decisions the screens share ──────────────────────────────────────────────

export type SetupStep = 'hello' | 'medication' | 'body' | 'safety' | 'about' | 'ai' | 'counts';

/**
 * The steps of setup, in order. The AI step exists only where model calls do, and the three
 * optional questions ('about') only where the build asks them.
 *
 * `askCounts` adds the consent screen for anonymous counts as the last step. The caller passes
 * true only when this build counts at all and this phone has not answered the question yet.
 * Everything after 'safety' comes after it on purpose: checking "Under 18" there ends setup,
 * so a minor is never asked the later questions.
 */
export function setupSteps(f: Pick<Features, 'ai' | 'setupQuestions'>, askCounts = false): SetupStep[] {
  const steps: SetupStep[] = ['hello', 'medication', 'body', 'safety'];
  if (f.setupQuestions) steps.push('about');
  if (f.ai) steps.push('ai');
  if (askCounts) steps.push('counts');
  return steps;
}

/**
 * The safety questions setup asks. The kidney or liver question only changes the protein
 * target, so it is not asked where there is no protein target.
 */
export function safetyQuestions(f: Pick<Features, 'foodAndProtein'>): (keyof Safety)[] {
  const all: (keyof Safety)[] = ['kidneyOrLiver', 'pregnancy', 'insulinOrSU', 'eatingDisorder', 'under18'];
  return f.foodAndProtein ? all : all.filter((k) => k !== 'kidneyOrLiver');
}

/**
 * Languages a picker offers. Without the Chinese choices it offers English, plus the language
 * the profile already uses, so a Chinese profile still sees its own language marked and can
 * move to English. A list of one means there is nothing to pick and the picker is not shown.
 */
export function languageChoices(current: Lang, f: Pick<Features, 'chineseChoice'>): Lang[] {
  if (f.chineseChoice) return [...LANGS];
  return current === 'en' ? ['en'] : ['en', current];
}

/**
 * Places the first setup screen offers. Without the full list it offers the United States and
 * "Other", plus the place the profile already uses (the phone's time zone may have picked one),
 * so the emergency number on an alert stays right for that person.
 */
export function regionChoices(lang: Lang, current: Region, f: Pick<Features, 'allRegions'>): Region[] {
  if (f.allRegions) return regionsFor(lang);
  const short: Region[] = ['US', 'OTHER'];
  return short.includes(current) ? short : ['US', current, 'OTHER'];
}

/**
 * Whether the numbers of a medication's catalog entry may be used on screen at all: for the
 * curve, the dose example in setup, the typing check against the highest dose, and the wait
 * after a pill. Where the build needs a label source, an entry that is not label-backed shows
 * none of them; they come back by themselves once every number of the entry has its label row.
 *
 * The functions below take the brand of the regimen as well, because two brands of one entry can
 * have different numbers on their labels (catalog.ts, brandNumbers).
 */
export function labelFactsShown(drug: DrugEntry, f: Pick<Features, 'curveNeedsSource'>): boolean {
  return !f.curveNeedsSource || hasLabelSource(drug);
}

/** Whether the estimated medication level curve may be drawn for a medication. */
export function curveAvailable(drug: DrugEntry, f: Pick<Features, 'curveNeedsSource'>, brand?: string | null): boolean {
  return brandNumbers(drug, brand).pk !== null && labelFactsShown(drug, f);
}

/**
 * Whether a typed dose gets the second confirmation ("more than the highest dose in the US
 * prescribing information for ..."). The message names the highest dose of the catalog entry
 * and the US brand whose label it is from, so it is asked only where that number may be shown
 * and there is such a brand to name (maxDoseLabelBrands).
 */
export function doseCheckApplies(drug: DrugEntry, amount: number, unit: DoseUnit, f: Pick<Features, 'curveNeedsSource'>, brand?: string | null): boolean {
  return labelFactsShown(drug, f) && maxDoseLabelBrands(drug, brand).length > 0 && needsDoseConfirm(drug, amount, unit, brand);
}

/**
 * Why a medication that has chart numbers gets no chart: the numbers belong to single brands,
 * because their US labels state them differently, and the regimen names none of those brands
 * (tirzepatide without Zepbound or Mounjaro). `brands` are the brands that would get a chart in
 * this build. `canChoose` says whether the person's region lists them all, so that picking one
 * in setup brings the chart; elsewhere the person can do nothing about it. Null in every other
 * case, also for a medication that has no chart numbers at all.
 */
export function chartNeedsBrand(drug: DrugEntry, f: Pick<Features, 'curveNeedsSource'>, brand: string | null | undefined, region: Region): { brands: string[]; canChoose: boolean } | null {
  const brands = chartBrands(drug, brand).filter((b) => curveAvailable(drug, f, b));
  if (!brands.length) return null;
  const listed = drug.brands[region] ?? [];
  return { brands, canChoose: brands.every((b) => listed.includes(b)) };
}

/** Minutes to wait after a pill before eating, drinking or taking other oral medications, where the build may show the number. Null: no wait is shown. */
export function fastingMinutes(drug: DrugEntry, f: Pick<Features, 'curveNeedsSource'>, brand?: string | null): number | null {
  const wait = brandNumbers(drug, brand).fastingMin;
  return wait && labelFactsShown(drug, f) ? wait : null;
}

/** The dose shown as an example of the format in setup, where the build may show the number. Null: no example. */
export function doseExample(drug: DrugEntry, f: Pick<Features, 'curveNeedsSource'>, brand?: string | null): number | null {
  const steps = brandNumbers(drug, brand).ladderMg;
  return steps.length && labelFactsShown(drug, f) ? steps[0] : null;
}

/**
 * What the third tab is. With coping cards it is the Ask tab. Without them only the list of
 * questions for the doctor is left, and the tab is named after that list.
 */
export function thirdTab(f: Pick<Features, 'copingCards'>): 'ask' | 'questions' {
  return f.copingCards ? 'ask' : 'questions';
}

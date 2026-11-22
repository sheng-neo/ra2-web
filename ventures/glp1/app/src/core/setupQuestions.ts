/**
 * The three optional questions at the end of setup.
 *
 * Every answer is one value from a fixed list, or null when the question was skipped. There is
 * no free text. The answers are saved in the profile; a build that counts anonymously also
 * puts them in its "setup finished" count (see counts.ts), which is why a saved answer is
 * always read back through cleanSetupAnswers: only a value from these lists can leave the phone.
 */

/** How long the person has been on the medication. */
export const TIME_ON_MEDICATION = ['not_started', 'under_1_month', '1_to_3_months', '3_to_12_months', 'over_1_year'] as const;
export type TimeOnMedication = (typeof TIME_ON_MEDICATION)[number];

/** What the person used to log with before. The choices name kinds of tools, never a product. */
export const LOGGED_BEFORE = ['nothing', 'notes_or_spreadsheet', 'tracker_app', 'drug_maker_app', 'other'] as const;
export type LoggedBefore = (typeof LOGGED_BEFORE)[number];

/** Where the person heard about the app. */
export const HEARD_FROM = ['app_store_search', 'friend_or_family', 'online_community', 'web_search', 'other'] as const;
export type HeardFrom = (typeof HEARD_FROM)[number];

export interface SetupAnswers {
  timeOnMedication: TimeOnMedication | null;
  loggedBefore: LoggedBefore | null;
  heardFrom: HeardFrom | null;
}

export const NO_SETUP_ANSWERS: SetupAnswers = { timeOnMedication: null, loggedBefore: null, heardFrom: null };

function oneOf<T extends string>(list: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;
}

/**
 * Answers as they may be used: each one is a value from its list, or null. Anything else (a
 * profile saved before the questions existed, a hand-edited backup) reads as "skipped".
 */
export function cleanSetupAnswers(raw: unknown): SetupAnswers {
  const r = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    timeOnMedication: oneOf(TIME_ON_MEDICATION, r.timeOnMedication),
    loggedBefore: oneOf(LOGGED_BEFORE, r.loggedBefore),
    heardFrom: oneOf(HEARD_FROM, r.heardFrom),
  };
}

/** Whether any of the three questions was answered. */
export function hasSetupAnswer(a: SetupAnswers): boolean {
  return a.timeOnMedication !== null || a.loggedBefore !== null || a.heardFrom !== null;
}

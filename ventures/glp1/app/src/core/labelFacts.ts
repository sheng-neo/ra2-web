/**
 * Where every medication number in catalog.ts comes from.
 *
 * One row per number the app uses, for each US brand: how often the medication is taken, the
 * dose steps, the highest dose, the half-life and the time to peak used for the chart, and the
 * wait after a pill. Each row carries the words of the current US prescribing information (the
 * FDA label) that support the number, the label section, and the label version it was read from.
 *
 * Rules for this file:
 * - A row is written only after reading the text on the label itself. Nothing here comes from
 *   memory or from another website.
 * - `quotes` are copied from the label word for word. Runs of spaces and line breaks are written
 *   as one space, and " | " stands for the line between two cells of a table row. One exception:
 *   a space the label file has only around a linked cross-reference is dropped, just inside a
 *   bracket and between a closing bracket and the full stop ("( 12.3 )] ." in the file is
 *   written "(12.3)]."). No other space is added or removed. A quote is a whole sentence, a
 *   whole list item or a whole table row (a row may start at a later cell).
 * - Where the app's number is not printed in the label as such, `rule` says how it follows from
 *   the quoted words. For the half-life and the time to peak, `stated` holds what the label
 *   states and PK_RULE turns it into hours.
 * - The labels change. When a label is read again, update LABELS (version, effective date) and
 *   LABELS_READ_ON, and re-check every row that names it.
 * - A row says where a number was read. It does not say a reviewer has confirmed it: that is
 *   `verified` in catalog.ts, which only a person sets.
 *
 * catalog.ts uses this table to decide whether an entry is label-backed (hasLabelSource), and
 * scripts/build-review-packet.ts prints it for the clinical reviewer.
 */

/** The day the labels below were read. */
export const LABELS_READ_ON = '2026-11-22';

/** One US label, as published on DailyMed (National Library of Medicine). */
export interface LabelDoc {
  /** The products the label covers, as its title names them. */
  title: string;
  setid: string;
  version: string;
  /** Effective date of this version as the label file gives it, YYYYMMDD. */
  effective: string;
  /** Public page of the label. */
  url: string;
}

const dailymed = (setid: string): string => `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`;

const label = (title: string, setid: string, version: string, effective: string): LabelDoc => ({ title, setid, version, effective, url: dailymed(setid) });

export const LABELS = {
  wegovy: label('WEGOVY (semaglutide) injection, for subcutaneous use; WEGOVY (semaglutide) tablets, for oral use', 'ee06186f-2aa3-4990-a760-757579d8f77b', '19', '20260618'),
  ozempic: label('OZEMPIC (semaglutide) injection, for subcutaneous use', 'adec4fd2-6858-4c99-91d4-531f5f2a2d79', '20', '20260601'),
  semaglutideTablets: label('RYBELSUS (semaglutide) tablets, for oral use; OZEMPIC (semaglutide) tablets, for oral use', '27f15fac-7d98-4114-a2ec-92494a91da98', '14', '20260130'),
  zepbound: label('ZEPBOUND (tirzepatide) Injection, for subcutaneous use', '487cd7e7-434c-4925-99fa-aa80b1cc776b', '40', '20260828'),
  mounjaro: label('MOUNJARO (tirzepatide) Injection, for subcutaneous use', 'd2d7da5d-ad07-4228-955f-cf7e355c8cc0', '40', '20260827'),
  saxenda: label('SAXENDA (liraglutide) injection, for subcutaneous use', '3946d389-0926-4f77-a708-0acb8153b143', '22', '20260225'),
  foundayo: label('FOUNDAYO (orforglipron) tablets, for oral use', '8ac446c5-feba-474f-a103-23facb9b5c62', '10', '20260729'),
} satisfies Record<string, LabelDoc>;

/** The catalog numbers a row can stand for. */
export type LabelField = 'frequency' | 'ladderMg' | 'maxMg' | 'halfLifeH' | 'tmaxH' | 'fastingMin';

export const LABEL_FIELD_NAMES: Record<LabelField, string> = {
  frequency: 'How often',
  ladderMg: 'Dose steps (mg)',
  maxMg: 'Highest dose (mg)',
  halfLifeH: 'Half-life (hours)',
  tmaxH: 'Time to peak (hours)',
  fastingMin: 'Wait after a pill (minutes)',
};

export interface LabelQuote {
  /** The label's words, copied as they stand. */
  text: string;
  /** Label section the words are in, for example "2.2" or "2.2, Table 1". */
  section: string;
}

export type TimeUnit = 'hour' | 'day' | 'week';

/** What a label states for a half-life or a time to peak, before PK_RULE turns it into hours. */
export type StatedTime = { kind: 'single' | 'median'; value: number; unit: TimeUnit } | { kind: 'range'; low: number; high: number; unit: TimeUnit };

/** The label section the half-life and the time to peak are read from: Pharmacokinetics. */
export const PK_SECTION = '12.3';

/**
 * The rule that turns the label's wording into the one half-life and the one time to peak the
 * chart model needs (hoursFromLabel below applies it). The rule is about one section of the
 * label only. Another section may word the same figure differently (section 10 of the Zepbound
 * label does); that goes in the row's `note` and is not used.
 */
export const PK_RULE = `Both numbers are read from section ${PK_SECTION} (Pharmacokinetics) of the label, and from no other section. That section states a single value or a median: the app uses it. That section states only a range: the app uses the midpoint of the range. Days and weeks are turned into hours (1 day = 24 hours, 1 week = 168 hours).`;

const HOURS: Record<TimeUnit, number> = { hour: 1, day: 24, week: 168 };

/** PK_RULE as code: the number of hours the app uses for what the label states. */
export function hoursFromLabel(s: StatedTime): number {
  return (s.kind === 'range' ? (s.low + s.high) / 2 : s.value) * HOURS[s.unit];
}

export type LabelValue = number | number[] | 'weekly' | 'daily' | null;

export interface LabelFact {
  /** Catalog entry id. */
  entryId: string;
  /** US brand, as stored in the catalog ("Wegovy pill"). */
  brand: string;
  field: LabelField;
  /**
   * The value in the catalog. For `fastingMin`, null means the label states no wait (the tablet
   * can be taken with or without food) and the catalog has none.
   */
  value: LabelValue;
  quotes: LabelQuote[];
  label: LabelDoc;
  /** Half-life and time to peak only: the label's own figures, which PK_RULE turns into `value`. */
  stated?: StatedTime;
  /** How `value` follows from the quoted words, where the label does not print it as such. */
  rule?: string;
  /** Limits the label puts on the number, and anything else a reader of the row should know. */
  note?: string;
}

const SAME_SCHEDULE_NOTE = 'The label gives one schedule for every pen, vial and syringe of this brand.';
const TOP_STEP_RULE = 'The highest dose in the label\'s adult schedule. The label does not call it a maximum in section 2.';
const WAIT_NOTE = 'The label says "at least" 30 minutes. The wait covers food, beverages and other oral medications.';

export const LABEL_FACTS: LabelFact[] = [
  // ── Wegovy, injection ──
  {
    entryId: 'semaglutide-wl',
    brand: 'Wegovy',
    field: 'frequency',
    value: 'weekly',
    quotes: [{ text: 'Administer WEGOVY injection once weekly, on the same day each week, at any time of day, with or without meals.', section: '2.1' }],
    label: LABELS.wegovy,
  },
  {
    entryId: 'semaglutide-wl',
    brand: 'Wegovy',
    field: 'ladderMg',
    value: [0.25, 0.5, 1, 1.7, 2.4, 7.2],
    quotes: [
      { text: 'Starting Dosage | 1 through 4 | 0.25 mg', section: '2.2, Table 1' },
      { text: '5 through 8 | 0.5 mg', section: '2.2, Table 1' },
      { text: '9 through 12 | 1 mg', section: '2.2, Table 1' },
      { text: '13 through 16 | 1.7 mg', section: '2.2, Table 1' },
      { text: 'The maintenance dosage of WEGOVY for weight reduction in adults is either 1.7 mg or 2.4 mg (recommended) injected subcutaneously once weekly.', section: '2.2' },
      { text: 'For patients who tolerate the 2.4 mg dosage for at least 4 weeks and additional weight reduction is clinically indicated, the dosage may be increased to a maximum dosage of 7.2 mg subcutaneously once weekly.', section: '2.2' },
    ],
    label: LABELS.wegovy,
    rule: 'Table 1 gives the starting dose and the escalation steps for every approved use (weeks are in the middle column). The maintenance sentence adds 2.4 mg, and the sentence after it adds 7.2 mg.',
    note: `The label gives 7.2 mg only under "Weight Reduction in Adults", as a further increase after at least 4 weeks on 2.4 mg. For cardiovascular risk reduction in adults, for MASH in adults and for pediatric patients aged 12 years and older the last step is 2.4 mg. A step is any dose of the label's adult schedule, also one the label gives for one use only. ${SAME_SCHEDULE_NOTE}`,
  },
  {
    entryId: 'semaglutide-wl',
    brand: 'Wegovy',
    field: 'maxMg',
    value: 7.2,
    quotes: [{ text: 'For patients who tolerate the 2.4 mg dosage for at least 4 weeks and additional weight reduction is clinically indicated, the dosage may be increased to a maximum dosage of 7.2 mg subcutaneously once weekly.', section: '2.2' }],
    label: LABELS.wegovy,
    note: 'Stated under "Weight Reduction in Adults" only. For cardiovascular risk reduction in adults, for MASH in adults and for pediatric patients aged 12 years and older the highest dose the label gives is 2.4 mg. The app uses this number only to catch a typing slip, so it takes the highest dose the label gives to any adult.',
  },
  {
    entryId: 'semaglutide-wl',
    brand: 'Wegovy',
    field: 'halfLifeH',
    value: 168,
    quotes: [{ text: 'With an elimination half-life of approximately 1 week, semaglutide will be present in the circulation for about 5 to 7 weeks after the last injectable dose of 2.4 mg or 7.2 mg or oral dose of 25 mg.', section: '12.3' }],
    label: LABELS.wegovy,
    stated: { kind: 'single', value: 1, unit: 'week' },
    rule: PK_RULE,
  },
  {
    entryId: 'semaglutide-wl',
    brand: 'Wegovy',
    field: 'tmaxH',
    value: 48,
    quotes: [{ text: 'Maximum concentration of semaglutide is reached 1 to 3 days post dose.', section: '12.3' }],
    label: LABELS.wegovy,
    stated: { kind: 'range', low: 1, high: 3, unit: 'day' },
    rule: PK_RULE,
    note: 'From the paragraph headed "WEGOVY Injection". The tablets have their own sentence (1 hour post dose).',
  },

  // ── Ozempic, injection ──
  {
    entryId: 'semaglutide-t2d',
    brand: 'Ozempic',
    field: 'frequency',
    value: 'weekly',
    quotes: [{ text: 'Administer OZEMPIC once weekly, on the same day each week, at any time of the day, with or without meals.', section: '2.1' }],
    label: LABELS.ozempic,
  },
  {
    entryId: 'semaglutide-t2d',
    brand: 'Ozempic',
    field: 'ladderMg',
    value: [0.25, 0.5, 1, 2],
    quotes: [
      { text: 'Initiate OZEMPIC with a dosage of 0.25 mg injected subcutaneously once weekly for 4 weeks.', section: '2.2' },
      { text: 'After 4 weeks on the 0.25 mg dosage, increase the dosage to 0.5 mg once weekly.', section: '2.2' },
      { text: 'If additional glycemic control is needed after at least 4 weeks on the:', section: '2.2' },
      { text: '0.5 mg dosage, the dosage may be increased to 1 mg once weekly.', section: '2.2' },
      { text: '1 mg dosage, the dosage may be increased to 2 mg once weekly.', section: '2.2' },
    ],
    label: LABELS.ozempic,
    note: `The steps to 1 mg and 2 mg are printed under the heading for glycemic control. For adults with type 2 diabetes and chronic kidney disease the label gives a maintenance dose of 1 mg. ${SAME_SCHEDULE_NOTE}`,
  },
  {
    entryId: 'semaglutide-t2d',
    brand: 'Ozempic',
    field: 'maxMg',
    value: 2,
    quotes: [{ text: 'The maximum recommended dosage is 2 mg once weekly.', section: '2.2' }],
    label: LABELS.ozempic,
    note: 'Printed under the heading for glycemic control. Section 13.1 names the same figure, 2 mg/week, as the maximum recommended human dose.',
  },
  {
    entryId: 'semaglutide-t2d',
    brand: 'Ozempic',
    field: 'halfLifeH',
    value: 168,
    quotes: [{ text: 'With an elimination half-life of approximately 1 week, semaglutide will be present in the circulation for about 5 weeks after the last dose.', section: '12.3' }],
    label: LABELS.ozempic,
    stated: { kind: 'single', value: 1, unit: 'week' },
    rule: PK_RULE,
  },
  {
    entryId: 'semaglutide-t2d',
    brand: 'Ozempic',
    field: 'tmaxH',
    value: 48,
    quotes: [{ text: 'Maximum concentration of semaglutide is reached 1 to 3 days post dose.', section: '12.3' }],
    label: LABELS.ozempic,
    stated: { kind: 'range', low: 1, high: 3, unit: 'day' },
    rule: PK_RULE,
  },

  // ── Zepbound ──
  {
    entryId: 'tirzepatide',
    brand: 'Zepbound',
    field: 'frequency',
    value: 'weekly',
    quotes: [{ text: 'Administer ZEPBOUND once weekly at any time of day, with or without meals.', section: '2.4' }],
    label: LABELS.zepbound,
  },
  {
    entryId: 'tirzepatide',
    brand: 'Zepbound',
    field: 'ladderMg',
    value: [2.5, 5, 7.5, 10, 12.5, 15],
    quotes: [
      { text: 'The recommended starting dosage of ZEPBOUND for all indications is 2.5 mg injected subcutaneously once weekly for 4 weeks.', section: '2.1' },
      { text: 'After 4 weeks, increase the dosage to 5 mg injected subcutaneously once weekly.', section: '2.1' },
      { text: 'The dosage may be increased in 2.5 mg increments, after at least 4 weeks on the current dose [see Dosage and Administration (2.2)].', section: '2.1' },
      { text: '7.5 mg/0.5 mL', section: '3' },
      { text: '10 mg/0.5 mL', section: '3' },
      { text: '12.5 mg/0.5 mL', section: '3' },
      { text: '15 mg/0.5 mL', section: '3' },
    ],
    label: LABELS.zepbound,
    rule: 'Section 2.1 names 2.5 mg and 5 mg, then increases of 2.5 mg. 7.5, 10, 12.5 and 15 mg follow from that rule up to the maximum of 15 mg; each is a dose section 3 lists.',
    note: `The label names 5 mg, 10 mg and 15 mg as maintenance doses for weight reduction; 2.5 mg is for starting only. ${SAME_SCHEDULE_NOTE}`,
  },
  {
    entryId: 'tirzepatide',
    brand: 'Zepbound',
    field: 'maxMg',
    value: 15,
    quotes: [{ text: 'The maximum dosage of ZEPBOUND for all indications is 15 mg injected subcutaneously once weekly.', section: '2.2' }],
    label: LABELS.zepbound,
  },
  {
    entryId: 'tirzepatide',
    brand: 'Zepbound',
    field: 'halfLifeH',
    value: 132,
    quotes: [{ text: 'The elimination half-life is approximately 5-6 days in patients with overweight or obesity, and in patients with OSA and obesity.', section: '12.3' }],
    label: LABELS.zepbound,
    stated: { kind: 'range', low: 5, high: 6, unit: 'day' },
    rule: PK_RULE,
    note: 'Section 10 (Overdosage) of this label speaks of "the half-life of tirzepatide of approximately 5 days". The app reads the pharmacokinetics section, 12.3, only, and that section gives the range. With the single value of section 10 the number would be 120 hours.',
  },
  {
    entryId: 'tirzepatide',
    brand: 'Zepbound',
    field: 'tmaxH',
    value: 24,
    quotes: [{ text: 'Following subcutaneous administration, the median time (range) to maximum plasma concentration of tirzepatide is 24 hours (8 to 72 hours).', section: '12.3' }],
    label: LABELS.zepbound,
    stated: { kind: 'median', value: 24, unit: 'hour' },
    rule: PK_RULE,
  },

  // ── Mounjaro ──
  {
    entryId: 'tirzepatide',
    brand: 'Mounjaro',
    field: 'frequency',
    value: 'weekly',
    quotes: [{ text: 'Administer MOUNJARO once weekly, any time of day, with or without meals.', section: '2.2' }],
    label: LABELS.mounjaro,
  },
  {
    entryId: 'tirzepatide',
    brand: 'Mounjaro',
    field: 'ladderMg',
    value: [2.5, 5, 7.5, 10, 12.5, 15],
    quotes: [
      { text: 'The recommended starting dosage of MOUNJARO is 2.5 mg injected subcutaneously once weekly [see Dosage and Administration (2.2)].', section: '2.1' },
      { text: 'If additional glycemic control is needed, increase the dosage in 2.5 mg increments after at least 4 weeks on the current dose.', section: '2.1' },
      { text: '5 mg/0.5 mL', section: '3' },
      { text: '7.5 mg/0.5 mL', section: '3' },
      { text: '10 mg/0.5 mL', section: '3' },
      { text: '12.5 mg/0.5 mL', section: '3' },
      { text: '15 mg/0.5 mL', section: '3' },
    ],
    label: LABELS.mounjaro,
    rule: 'Section 2.1 names 2.5 mg, then increases of 2.5 mg. 5, 7.5, 10, 12.5 and 15 mg follow from that rule up to the adult maximum of 15 mg; each is a dose section 3 lists.',
    note: `Each increase is for when more glycemic control is needed. The label names no maintenance dose. ${SAME_SCHEDULE_NOTE}`,
  },
  {
    entryId: 'tirzepatide',
    brand: 'Mounjaro',
    field: 'maxMg',
    value: 15,
    quotes: [
      { text: 'The maximum dosage of MOUNJARO is:', section: '2.1' },
      { text: '15 mg injected subcutaneously once weekly in adults.', section: '2.1' },
    ],
    label: LABELS.mounjaro,
    note: 'The same list gives 10 mg once weekly as the maximum for pediatric patients. The app is for adults.',
  },
  {
    entryId: 'tirzepatide',
    brand: 'Mounjaro',
    field: 'halfLifeH',
    value: 120,
    quotes: [{ text: 'The apparent population mean clearance of tirzepatide is 0.061 L/h with an elimination half-life of approximately 5 days, enabling once-weekly dosing.', section: '12.3' }],
    label: LABELS.mounjaro,
    stated: { kind: 'single', value: 5, unit: 'day' },
    rule: PK_RULE,
  },
  {
    entryId: 'tirzepatide',
    brand: 'Mounjaro',
    field: 'tmaxH',
    value: 40,
    quotes: [{ text: 'Following subcutaneous administration, the time to maximum plasma concentration of tirzepatide ranges from 8 to 72 hours.', section: '12.3' }],
    label: LABELS.mounjaro,
    stated: { kind: 'range', low: 8, high: 72, unit: 'hour' },
    rule: PK_RULE,
    note: 'This label gives no median. The other tirzepatide label gives a median of 24 hours with the same range.',
  },

  // ── Wegovy, tablets ──
  {
    entryId: 'semaglutide-oral-wl',
    brand: 'Wegovy pill',
    field: 'frequency',
    value: 'daily',
    quotes: [{ text: 'Take one WEGOVY tablet orally once daily on an empty stomach in the morning with water (up to 4 ounces).', section: '2.1' }],
    label: LABELS.wegovy,
  },
  {
    entryId: 'semaglutide-oral-wl',
    brand: 'Wegovy pill',
    field: 'ladderMg',
    value: [1.5, 4, 9, 25],
    quotes: [
      { text: 'Starting Dosage | 1 through 30 | 1.5 mg', section: '2.3, Table 2' },
      { text: 'Dosage Escalation | 31 through 60 | 4 mg', section: '2.3, Table 2' },
      { text: '61 through 90 | 9 mg', section: '2.3, Table 2' },
      { text: 'Maintenance Dosage | 91 and onward | 25 mg', section: '2.3, Table 2' },
    ],
    label: LABELS.wegovy,
    note: 'The middle column of Table 2 counts days.',
  },
  {
    entryId: 'semaglutide-oral-wl',
    brand: 'Wegovy pill',
    field: 'maxMg',
    value: 25,
    quotes: [{ text: 'The recommended maintenance dosage of WEGOVY tablets is 25 mg orally once daily.', section: '2.3' }],
    label: LABELS.wegovy,
    rule: TOP_STEP_RULE,
  },
  {
    entryId: 'semaglutide-oral-wl',
    brand: 'Wegovy pill',
    field: 'fastingMin',
    value: 30,
    quotes: [{ text: 'After taking a WEGOVY tablet, wait at least 30 minutes before eating food, drinking beverages or taking other oral medications [see Clinical Pharmacology (12.3)].', section: '2.1' }],
    label: LABELS.wegovy,
    note: WAIT_NOTE,
  },

  // ── Foundayo ──
  {
    entryId: 'orforglipron',
    brand: 'Foundayo',
    field: 'frequency',
    value: 'daily',
    quotes: [{ text: 'Take FOUNDAYO orally once daily, with or without food.', section: '2.1' }],
    label: LABELS.foundayo,
  },
  {
    entryId: 'orforglipron',
    brand: 'Foundayo',
    field: 'ladderMg',
    value: [0.8, 2.5, 5.5, 9, 14.5, 17.2],
    quotes: [
      { text: 'The starting dosage is 0.8 mg orally once daily.', section: '2.1' },
      { text: 'After at least 30 days on the 0.8 mg dosage, increase the dosage to 2.5 mg once daily.', section: '2.1' },
      { text: 'After at least 30 days on the 2.5 mg dosage, increase the dosage to 5.5 mg once daily.', section: '2.1' },
      { text: 'The dosage may be increased to the next dosage level (9 mg, 14.5 mg, or 17.2 mg once daily) after at least 30 days on the current dosage, based on treatment response and tolerability.', section: '2.1' },
    ],
    label: LABELS.foundayo,
  },
  {
    entryId: 'orforglipron',
    brand: 'Foundayo',
    field: 'maxMg',
    value: 17.2,
    quotes: [{ text: 'The maximum dosage of FOUNDAYO is 17.2 mg once daily.', section: '2.1' }],
    label: LABELS.foundayo,
    note: 'Section 2.2 gives a lower maximum of 9 mg once daily when the tablet is used with a strong CYP3A4 inhibitor. The app does not know what other medicines a person takes.',
  },
  {
    entryId: 'orforglipron',
    brand: 'Foundayo',
    field: 'fastingMin',
    value: null,
    quotes: [{ text: 'Take FOUNDAYO orally once daily, with or without food.', section: '2.1' }],
    label: LABELS.foundayo,
    rule: 'The label states no waiting time before food, so the app shows no wait for this tablet.',
  },

  // ── Rybelsus ──
  {
    entryId: 'semaglutide-oral-t2d',
    brand: 'Rybelsus',
    field: 'frequency',
    value: 'daily',
    quotes: [{ text: 'Take one RYBELSUS or OZEMPIC tablet orally once daily on an empty stomach in the morning with water (up to 4 ounces of water).', section: '2.1' }],
    label: LABELS.semaglutideTablets,
  },
  {
    entryId: 'semaglutide-oral-t2d',
    brand: 'Rybelsus',
    field: 'ladderMg',
    value: [3, 7, 14],
    quotes: [
      { text: 'Starting Dosage (Initiation Phase) (Days 1 to 30): The recommended starting dosage is 3 mg orally once daily (this dosage is not effective for glycemic control).', section: '2.2' },
      { text: 'Days 31 to 60: Increase the dosage to 7 mg orally once daily.', section: '2.2' },
      { text: 'Additional glycemic control is needed, increase the dosage to 14 mg orally once daily.', section: '2.2' },
    ],
    label: LABELS.semaglutideTablets,
    note: 'From the part of section 2.2 headed "RYBELSUS: Recommended Dosage". Section 2.1 says the two tablet brands on this label "are not substitutable on a mg-to-mg basis".',
  },
  {
    entryId: 'semaglutide-oral-t2d',
    brand: 'Rybelsus',
    field: 'maxMg',
    value: 14,
    quotes: [{ text: 'Additional glycemic control is needed, increase the dosage to 14 mg orally once daily.', section: '2.2' }],
    label: LABELS.semaglutideTablets,
    rule: TOP_STEP_RULE,
  },
  {
    entryId: 'semaglutide-oral-t2d',
    brand: 'Rybelsus',
    field: 'fastingMin',
    value: 30,
    quotes: [{ text: 'After taking RYBELSUS or OZEMPIC tablets, wait at least 30 minutes before eating food, drinking beverages or taking other oral medications [see Clinical Pharmacology (12.3)].', section: '2.1' }],
    label: LABELS.semaglutideTablets,
    note: WAIT_NOTE,
  },

  // ── Ozempic, tablets ──
  {
    entryId: 'semaglutide-oral-t2d-ozempic',
    brand: 'Ozempic pill',
    field: 'frequency',
    value: 'daily',
    quotes: [{ text: 'Take one RYBELSUS or OZEMPIC tablet orally once daily on an empty stomach in the morning with water (up to 4 ounces of water).', section: '2.1' }],
    label: LABELS.semaglutideTablets,
  },
  {
    entryId: 'semaglutide-oral-t2d-ozempic',
    brand: 'Ozempic pill',
    field: 'ladderMg',
    value: [1.5, 4, 9],
    quotes: [
      { text: 'Starting Dosage (Initiation Phase) (Days 1 through 30): The recommended starting dosage is 1.5 mg orally once daily (this dosage is not effective for glycemic control).', section: '2.2' },
      { text: 'Days 31 to 60: Increase the dosage to 4 mg orally once daily.', section: '2.2' },
      { text: 'Additional glycemic control is needed, increase the dosage to 9 mg orally once daily.', section: '2.2' },
    ],
    label: LABELS.semaglutideTablets,
    note: 'From the part of section 2.2 headed "OZEMPIC Tablets: Recommended Dosage". Section 2.1 says the two tablet brands on this label "are not substitutable on a mg-to-mg basis".',
  },
  {
    entryId: 'semaglutide-oral-t2d-ozempic',
    brand: 'Ozempic pill',
    field: 'maxMg',
    value: 9,
    quotes: [{ text: 'Additional glycemic control is needed, increase the dosage to 9 mg orally once daily.', section: '2.2' }],
    label: LABELS.semaglutideTablets,
    rule: TOP_STEP_RULE,
  },
  {
    entryId: 'semaglutide-oral-t2d-ozempic',
    brand: 'Ozempic pill',
    field: 'fastingMin',
    value: 30,
    quotes: [{ text: 'After taking RYBELSUS or OZEMPIC tablets, wait at least 30 minutes before eating food, drinking beverages or taking other oral medications [see Clinical Pharmacology (12.3)].', section: '2.1' }],
    label: LABELS.semaglutideTablets,
    note: WAIT_NOTE,
  },

  // ── Saxenda ──
  {
    entryId: 'liraglutide',
    brand: 'Saxenda',
    field: 'frequency',
    value: 'daily',
    quotes: [{ text: 'Inject SAXENDA subcutaneously once daily at any time of day, without regard to the timing of meals.', section: '2.1' }],
    label: LABELS.saxenda,
  },
  {
    entryId: 'liraglutide',
    brand: 'Saxenda',
    field: 'ladderMg',
    value: [0.6, 1.2, 1.8, 2.4, 3],
    quotes: [
      { text: '1 | 0.6 mg', section: '2.2, Table 1' },
      { text: '2 | 1.2 mg', section: '2.2, Table 1' },
      { text: '3 | 1.8 mg', section: '2.2, Table 1' },
      { text: '4 | 2.4 mg', section: '2.2, Table 1' },
      { text: '5 and onward | 3 mg', section: '2.2, Table 1' },
    ],
    label: LABELS.saxenda,
    note: 'The first column of Table 1 is the week, the second the daily dose. These are the doses one pen can be set to; the pen has a single strength.',
  },
  {
    entryId: 'liraglutide',
    brand: 'Saxenda',
    field: 'maxMg',
    value: 3,
    quotes: [{ text: 'For adults, the recommended dosage of SAXENDA is 3 mg daily, lower dosages are for titration only.', section: '2.2' }],
    label: LABELS.saxenda,
    rule: 'The highest dose in the label\'s adult schedule. Section 8.1 names 3 mg/day as the maximum recommended human dose.',
  },
];

/** The row for one number of one US brand, if there is one. */
export function labelFact(entryId: string, brand: string, field: LabelField): LabelFact | undefined {
  return LABEL_FACTS.find((f) => f.entryId === entryId && f.brand === brand && f.field === field);
}

/** Every row of a catalog entry, for one US brand or for all of them. */
export function labelFactsFor(entryId: string, brand?: string): LabelFact[] {
  return LABEL_FACTS.filter((f) => f.entryId === entryId && (brand === undefined || f.brand === brand));
}

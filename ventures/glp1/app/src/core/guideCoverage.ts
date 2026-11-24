/**
 * How the danger-symptom rules of triage.ts stand against the FDA Medication Guides (medGuide.ts).
 *
 * Two directions:
 * - from the guides to the rules: for every item of the guides' "most important information"
 *   and serious side effects, and for every sign it names, which rule raises the card when a
 *   person describes that sign as their own, now (ITEM_COVERAGE). Where no rule does, the
 *   reason is written down, in one sentence;
 * - from the rules to the guides: which items each rule stands for (ruleBasis). A rule, or a
 *   part of a rule, that no guide item stands behind is listed in NOT_FROM_A_GUIDE with the
 *   reason it is kept. The rule for taking too much stands for one of the guides' other
 *   instructions instead (OTHER_COVERAGE, `rule`). A rule that shows a card in the first public
 *   version must have one of these; guideCoverage.test.ts fails otherwise.
 * - text that raises nothing on purpose, though a reviewer may expect a card, is listed in
 *   QUIET_ON_PURPOSE with the reason (low mood without words about self-harm).
 *
 * The rules are the English text rules and the symptom buttons at "Severe". The Chinese
 * phrase lists are not covered here.
 *
 * What is ours and what is the guides':
 * - `words` are the guides' own words, copied from medGuide.ts. A test fails when a sign of a
 *   guide is missing here, and when words here are in no guide.
 * - Everything else (which rule, the reasons, the notes) is our reading.
 *   PENDING CLINICAL REVIEW: no reviewer has confirmed this table yet;
 *   scripts/build-review-packet.ts prints it for one.
 *
 * The card of the first public version is one fixed card ("Contact your doctor right away",
 * with the emergency number). It is the same for every rule here. Where a guide only says
 * "tell your healthcare provider", the card says more than the guide. Where a guide says "Stop
 * using ..." or "get medical help right away" (pancreatitis and serious allergic reactions),
 * the card says LESS: it does not tell the person to stop the medication, and it names the
 * emergency number only "if it is an emergency". The guide's own words are one tap away, on
 * the button that stands first on the alert. The reviewer is asked about both.
 */
import { showsAlert } from './alert';
import { MED_GUIDE_LIST, guideItems, type GuideItemId, type GuideOtherKind } from './medGuide';
import { triageRuleLevels, triageSymptom, type SymptomKind, type TriageId } from './triage';

/** The mark for a rule, or a part of one, that is kept without a Medication Guide behind it. */
export const GENERAL_SIGN = 'general emergency sign, not from a Medication Guide';

export interface SignCoverage {
  /** The sign in the guides' words: every spelling the seven guides use for it. */
  words: string[];
  /** Text rules that raise the card when a person describes the sign as their own. */
  rules: TriageId[];
  /**
   * False when the sign raises the card only together with another sign (the low-blood-sugar
   * list), or not at all. `reason` then says why, in one sentence.
   */
  alone: boolean;
  /** Symptom buttons that raise the card for this sign when the person chooses "Severe". */
  buttons?: SymptomKind[];
  reason?: string;
  /** Where the rules ask for more, or less, than the guide's words. */
  note?: string;
}

export interface ItemCoverage {
  item: GuideItemId;
  signs: SignCoverage[];
  /** For an item that names no sign: why no rule raises the card for it, in one sentence. */
  reason?: string;
  /** A reminder rule that matches text about the item. It shows no card in the first public version. */
  reminder?: TriageId;
}

const ONE_SIGN_OF_LOW_SUGAR =
  'The guides list it as a sign of low blood sugar and give no instruction to call anyone for it; on its own it raises nothing, and it raises the card together with another sign of the list.';
const COMMON_SIGN_OF_LOW_SUGAR =
  'The guides list it as a sign of low blood sugar and give no instruction to call anyone for it; many people on these medications have it on an ordinary day, so it counts only next to a sign of the list that is not this common.';

export const ITEM_COVERAGE: ItemCoverage[] = [
  {
    item: 'thyroid_tumors',
    signs: [
      { words: ['a lump or swelling in your neck', 'lump or swelling in your neck'], rules: ['thyroid'], alone: true },
      { words: ['hoarseness'], rules: ['thyroid'], alone: true, note: 'Stays quiet when the person calls it slight ("a little hoarse"), unless they also say it has lasted.' },
      { words: ['trouble swallowing'], rules: ['thyroid'], alone: true, note: 'Stays quiet when it is said of a pill ("hard to swallow this big pill").' },
      { words: ['shortness of breath'], rules: ['anaphylaxis'], alone: true },
    ],
  },
  { item: 'thyroid_do_not_use', signs: [], reason: 'It names no sign and tells the patient to contact no one: it says who must not use the medication.' },
  { item: 'see_most_important', signs: [], reason: 'It only points back to the first part of the guide.' },
  {
    item: 'pancreatitis',
    signs: [
      {
        words: ['severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting', 'severe pain in your stomach area (abdomen) that will not go away, with or without vomiting'],
        rules: ['pancreatitis', 'abdominal_pain_severe'],
        alone: true,
        buttons: ['abdominal_pain'],
        note: 'Severe stomach pain raises the card whether or not the person says it lasts. Stomach pain that lasts raises it whether or not the person calls it severe.',
      },
      { words: ['pain from your abdomen to your back', 'pain from your stomach area (abdomen) to your back'], rules: ['pancreatitis'], alone: true },
    ],
  },
  {
    item: 'gallbladder',
    signs: [
      { words: ['pain in your upper stomach (abdomen)'], rules: ['gallbladder'], alone: true, buttons: ['abdominal_pain'] },
      { words: ['yellowing of skin or eyes (jaundice)', 'yellowing of your skin or eyes (jaundice)'], rules: ['gallbladder'], alone: true },
      { words: ['fever'], rules: ['gallbladder'], alone: true, note: 'Any fever the person reports as their own raises the card, also without stomach pain.' },
      { words: ['clay-colored stools'], rules: ['gallbladder'], alone: true },
    ],
  },
  {
    item: 'low_blood_sugar',
    signs: [
      { words: ['dizziness or light-headedness'], rules: ['hypoglycemia', 'dehydration'], alone: true, buttons: ['dizziness'], note: 'Alone it raises the card through the rule for "feeling dizzy" (a sign of a serious allergic reaction in the guides), unless the person calls it slight.' },
      { words: ['sweating'], rules: ['hypoglycemia'], alone: false, reason: ONE_SIGN_OF_LOW_SUGAR },
      { words: ['shakiness'], rules: ['hypoglycemia'], alone: false, reason: ONE_SIGN_OF_LOW_SUGAR },
      { words: ['feeling jittery'], rules: ['hypoglycemia'], alone: false, reason: `${ONE_SIGN_OF_LOW_SUGAR} It is counted as the same sign as shakiness.` },
      { words: ['blurred vision'], rules: ['hypoglycemia', 'vision'], alone: true, note: 'Alone it raises the card through the rule for changes in vision.' },
      { words: ['slurred speech'], rules: ['hypoglycemia', 'chest_or_faint'], alone: true, note: 'Alone it raises the card through the rule for general emergency signs: speech that is suddenly slurred is a sign of a stroke.' },
      { words: ['confusion or drowsiness'], rules: ['hypoglycemia'], alone: false, reason: ONE_SIGN_OF_LOW_SUGAR },
      { words: ['fast heartbeat'], rules: ['hypoglycemia', 'chest_or_faint'], alone: true, note: 'Alone it raises the card through the rule for a very rapid heartbeat (a sign of a serious allergic reaction in the guides).' },
      { words: ['weakness'], rules: ['hypoglycemia'], alone: false, reason: COMMON_SIGN_OF_LOW_SUGAR },
      { words: ['hunger'], rules: ['hypoglycemia'], alone: false, reason: COMMON_SIGN_OF_LOW_SUGAR },
      { words: ['headache'], rules: ['hypoglycemia'], alone: false, reason: COMMON_SIGN_OF_LOW_SUGAR },
      { words: ['anxiety', 'irritability or mood changes', 'anxiety, irritability, or mood changes'], rules: ['hypoglycemia'], alone: false, reason: COMMON_SIGN_OF_LOW_SUGAR },
    ],
  },
  {
    item: 'kidney_dehydration',
    signs: [
      {
        words: ['nausea, vomiting, or diarrhea that does not go away'],
        rules: ['dehydration'],
        alone: true,
        buttons: ['nausea', 'vomiting', 'diarrhea'],
        note: 'Vomiting or diarrhea also counts when it goes on all day or comes five times or more. Nausea counts only with words for "does not go away" or more than one day; "nauseous all day" stays quiet.',
      },
    ],
  },
  {
    item: 'severe_stomach',
    signs: [
      {
        words: ['stomach problems that are severe or will not go away'],
        rules: ['abdominal_pain_severe', 'pancreatitis', 'dehydration'],
        alone: true,
        buttons: ['abdominal_pain', 'nausea', 'vomiting', 'diarrhea'],
        note: 'The rules read "stomach problems" as stomach pain, nausea, vomiting, diarrhea, constipation, bloating, heartburn and acid reflux. The buttons for constipation and acid reflux raise nothing.',
      },
    ],
  },
  {
    item: 'allergic_reaction',
    signs: [
      { words: ['swelling of your face, lips, tongue or throat', 'swelling of your face, lips, tongue, or throat'], rules: ['anaphylaxis'], alone: true },
      { words: ['problems breathing or swallowing'], rules: ['anaphylaxis', 'thyroid'], alone: true, note: 'Breathing is read by the allergic-reaction rule, swallowing by the rule that also stands for the thyroid item.' },
      { words: ['severe rash or itching'], rules: ['anaphylaxis'], alone: true, note: 'A rash or itching raises the card when the person calls it severe, says it is all over the body or spreading, or names hives. A rash at the injection site stays quiet.' },
      { words: ['fainting or feeling dizzy'], rules: ['chest_or_faint', 'dehydration'], alone: true, buttons: ['dizziness'], note: 'Dizziness stays quiet when the person calls it slight ("a little dizzy").' },
      { words: ['very rapid heartbeat'], rules: ['chest_or_faint'], alone: true, note: 'A racing or pounding heart raises the card also without "very", unless the person calls it slight ("heart racing a bit").' },
    ],
  },
  { item: 'vision_changes', signs: [{ words: ['changes in vision'], rules: ['vision'], alone: true }] },
  {
    item: 'heart_rate',
    signs: [{ words: ['heart racing or pounding in your chest and it lasts for several minutes'], rules: ['chest_or_faint'], alone: true, note: 'The rule does not ask how long it lasts.' }],
  },
  {
    item: 'aspiration_anesthesia',
    signs: [],
    reason: 'It names no sign: it asks the patient to tell every healthcare provider about the medication before a surgery or procedure.',
    reminder: 'procedure',
  },
];

export interface OtherCoverage {
  /** A reminder rule that matches text about it. It shows no card in the first public version. */
  reminder?: TriageId;
  /** A rule that raises the card when a person says it has happened to them. */
  rule?: TriageId;
  /** Why no rule raises the card for it, in one sentence. */
  reason: string;
}

/** The other instructions of the guides (MED_GUIDE_OTHER), by kind. Only one of them names signs: the Wegovy sentence about taking too much (severe nausea, severe vomiting, severe low blood sugar). */
export const OTHER_COVERAGE: Record<GuideOtherKind, OtherCoverage> = {
  before_use_condition: { reason: 'A condition to tell the healthcare provider about before starting the medication, not a sign.' },
  pregnancy: { reminder: 'pregnancy', reason: 'Not a sign: something to tell the healthcare provider about.' },
  pregnancy_registry: { reminder: 'pregnancy', reason: 'Not a sign: an invitation to take part in a registry.' },
  breastfeeding: { reminder: 'pregnancy', reason: 'Not a sign: something to talk over with the healthcare provider.' },
  birth_control: { reminder: 'contraception', reason: 'Not a sign: something to talk over with the healthcare provider. The reminder rule applies to tirzepatide only.' },
  medicines: { reason: 'Not a sign: the patient is asked to tell the healthcare provider about other medicines.' },
  diabetes_medicines: { reason: 'Not a sign: the patient is asked to talk about low blood sugar and diabetes medicines before starting.' },
  overdose: {
    rule: 'overdose',
    reason: 'Taking too much is an event, not a sign; the rule for it raises the fixed card when a person writes that they took too much, and the screen shows the sentence word for word as a third part. The guides say to call the healthcare provider or the Poison Help line, or to go to the nearest emergency room, right away.',
  },
  missed_doses: { reason: 'Not a sign. The app gives no advice about missed doses and has no rule for them.' },
  side_effects_general: { reason: 'A general instruction about side effects, with no sign of its own.' },
};

export interface NotFromAGuide {
  rule: TriageId;
  /** Which part of the rule: all of it, or some of its phrases. */
  part: string;
  whole: boolean;
  /** Why it is kept, in one sentence. */
  reason: string;
}

/**
 * Rules, and parts of rules, with no Medication Guide item behind them. Each carries the mark
 * GENERAL_SIGN in the review packet. A rule that is not here and stands for no guide item must
 * not show a card in the first public version.
 */
export const NOT_FROM_A_GUIDE: NotFromAGuide[] = [
  {
    rule: 'crisis',
    part: 'the whole rule',
    whole: true,
    reason: 'None of the seven guides has an item about thoughts of self-harm; words about ending one\'s life are an emergency whatever the medication, and the rule shows its own card with the crisis line, not the fixed card.',
  },
  {
    rule: 'chest_or_faint',
    part: 'chest pain, pressure or tightness',
    whole: false,
    reason: 'No guide names chest pain; it is kept because chest pain can be an emergency whatever the medication.',
  },
  {
    rule: 'chest_or_faint',
    part: 'a blood pressure of 180/120 or more, a feeling of dying with words about the heart, chest or breathing, and saying one is in the emergency room now',
    whole: false,
    reason: 'No guide names these; they are kept because each can be an emergency whatever the medication.',
  },
  {
    rule: 'dehydration',
    part: 'passing very little urine, dark brown urine, and kidney pain or kidney lab results that are off',
    whole: false,
    reason: 'The guides warn of "dehydration leading to kidney problems" but name no sign about urine or the kidneys; passing very little urine, urine as dark as tea or cola, and kidney pain or kidney lab results that are off are kept as signs of those kidney problems.',
  },
  {
    rule: 'abdominal_pain_severe',
    part: 'blood in vomit or stool, and black or tarry stool',
    whole: false,
    reason: 'No guide names bleeding; it is kept because it is a stomach problem no one should wait on, whatever the medication.',
  },
  {
    rule: 'eating_too_little',
    part: 'the whole rule',
    whole: true,
    reason: 'No guide has an item about eating very little for days; the rule is a reminder of the full test build and shows no card in the first public version.',
  },
];

export interface QuietOnPurpose {
  /** What a person may write. */
  what: string;
  /** Phrases of that kind, each of which raises nothing today. */
  examples: string[];
  /** Why no rule raises the card for it, in one sentence. */
  reason: string;
}

/** Kinds of text that raise nothing on purpose, though a reviewer may expect a card. */
export const QUIET_ON_PURPOSE: QuietOnPurpose[] = [
  {
    what: 'Low mood or depression, without words about harming oneself',
    examples: ['I feel hopeless', 'depressed', 'Feeling very depressed lately, can\'t get out of bed', 'feel so down, crying all the time since starting'],
    reason: 'No item of the seven guides names low mood or depression (only "irritability or mood changes", as a sign of low blood sugar), and the self-harm rule is kept to words about ending one\'s life or harming oneself, so the app raises no card; the reviewer is asked whether it should.',
  },
];

/** Symptom buttons that raise no card at "Severe", each with the reason. */
export const BUTTONS_THAT_RAISE_NOTHING: Partial<Record<SymptomKind, string>> = {
  reflux: 'Severe acid reflux is a stomach problem "that is severe"; for that item the guides say "tell your healthcare provider", without "right away", so the button was left as it was.',
  constipation: 'Severe constipation is a stomach problem "that is severe"; for that item the guides say "tell your healthcare provider", without "right away", so the button was left as it was.',
  no_appetite: 'No item of the two parts of the guides names it.',
  fatigue: 'No item of the two parts of the guides names it.',
  hair_loss: 'No item of the two parts of the guides names it.',
  injection_site: 'No item of the two parts of the guides names it.',
  mood: 'No guide has an item about mood; "irritability or mood changes" is listed only as a sign of low blood sugar.',
  menstrual: 'No item of the two parts of the guides names it.',
};

// ── What follows from the tables ─────────────────────────────────────────────

/** The rules a symptom button raises at "Severe": for a person who takes insulin or a sulfonylurea, and for one who does not. */
export function buttonRules(kind: SymptomKind): TriageId[] {
  return [...new Set([false, true].flatMap((insulinOrSU) => triageSymptom(kind, 3, { insulinOrSU, drugId: null, region: 'US' }).map((h) => h.id)))];
}

/** The guide items a rule stands for: every item with a sign for which the rule raises the card, from typed text or from a button. */
export function ruleItems(rule: TriageId): GuideItemId[] {
  return ITEM_COVERAGE.filter((c) => c.signs.some((s) => s.rules.includes(rule) || (s.buttons ?? []).some((b) => buttonRules(b).includes(rule)))).map((c) => c.item);
}

/** The other instructions and items a reminder rule matches text about. */
export function reminderFor(rule: TriageId): (GuideItemId | GuideOtherKind)[] {
  const kinds = (Object.keys(OTHER_COVERAGE) as GuideOtherKind[]).filter((k) => OTHER_COVERAGE[k].reminder === rule);
  return [...ITEM_COVERAGE.filter((c) => c.reminder === rule).map((c) => c.item), ...kinds];
}

/** The other instructions of the guides a rule raises the card for (OTHER_COVERAGE). */
export function otherFor(rule: TriageId): GuideOtherKind[] {
  return (Object.keys(OTHER_COVERAGE) as GuideOtherKind[]).filter((k) => OTHER_COVERAGE[k].rule === rule);
}

/** Whether a rule shows a card in the first public version, at any level it can have. */
export function showsLaunchCard(rule: TriageId): boolean {
  return triageRuleLevels()[rule].some((level) => showsAlert({ id: rule, level }, false));
}

/** The guide items a symptom button stands for. */
export function buttonItems(kind: SymptomKind): GuideItemId[] {
  return ITEM_COVERAGE.filter((c) => c.signs.some((s) => (s.buttons ?? []).includes(kind))).map((c) => c.item);
}

/** The guides that have an item, by key, for the review packet ("all seven", or the ones that do). */
export function guidesWithItem(item: GuideItemId): string[] {
  return MED_GUIDE_LIST.filter((g) => guideItems(g).some((i) => i.id === item)).map((g) => g.key);
}

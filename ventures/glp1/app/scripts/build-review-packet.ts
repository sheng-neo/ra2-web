/**
 * Builds the clinical review packet: ../docs/review/clinical-review-packet.md
 *
 * Run it with `pnpm review-packet`. Options:
 *   --check         build in memory and fail if the file on disk is different (nothing is written)
 *   --docx          also write clinical-review-packet.docx next to it (needs a document converter
 *                   on this machine; see the end of main())
 *   --fingerprints  print the current fingerprints of the code this script describes in words
 *
 * The packet is for a US-licensed pharmacist or physician who is paid to find errors. It must
 * show what the app shows, so nothing clinical is typed here a second time:
 * - card texts, coping cards, advice, workouts, the medication list, the food list and the
 *   launch switches come from src/core and src/web/content, by calling the functions the app
 *   calls. The label words behind each medication number come from src/core/labelFacts.ts;
 * - screen wording that lives in src/web/i18n/en.ts is read from that file as text, by key
 *   (screenText). A key that is gone stops the build;
 * - where this script explains code in plain words (trigger patterns, formulas, cut-offs), the
 *   explanation is tied to a fingerprint of that code. When the code changes, the script stops
 *   and names what to re-read. Every example phrase is run through the real rules;
 * - a few sentences rest on screen code that cannot be called from here (screenCodeHas,
 *   TYPED_TEXT_PLACES). They are checked by a text search; when the code they rest on is gone
 *   the sentence is dropped and a note is printed, and a new place where typed text is checked
 *   stops the build;
 * - every comment in src/core and src/web/content that marks something as waiting for review
 *   must be matched by an open question in section 7;
 * - the words of the FDA Medication Guides come from src/core/medGuide.ts, and the table that
 *   ties the rules to them from src/core/guideCoverage.ts. Neither is typed here a second time.
 *
 * Nothing under src/ is changed. The English trigger patterns in src/core/triage.ts are not
 * exported, so they are read from a temporary copy of that file with one export line added.
 * If they are exported one day, loadTriageInternals() can become a plain load.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createServer } from 'vite';

import type { DrugEntry, DrugNumbers, PkParams } from '../src/core/catalog';
import type { LabelDoc, LabelFact, LabelField, StatedTime } from '../src/core/labelFacts';
import type { GuideAction, GuideItemId, GuideSection, MedGuide, MedGuideKey } from '../src/core/medGuide';
import type { MgDose } from '../src/core/pk';
import type { Advice } from '../src/core/today';
import type { SymptomKind, TriageCard, TriageContext, TriageHit, TriageId, TriageLevel } from '../src/core/triage';
import type { Safety } from '../src/core/types';

// ── Paths, options, problems ─────────────────────────────────────────────────

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(APP_DIR, '..', 'docs', 'review');
const OUT_FILE = join(OUT_DIR, 'clinical-review-packet.md');
const DOCX_FILE = join(OUT_DIR, 'clinical-review-packet.docx');
const REQUEST_FILE = join(OUT_DIR, 'reviewer-request.md');
const README_FILE = join(OUT_DIR, 'README.md');

const OPTIONS = new Set(process.argv.slice(2));
const PRINT_FINGERPRINTS = OPTIONS.has('--fingerprints');

/** Reasons the packet cannot be trusted. Any entry stops the build before a file is written. */
const problems: string[] = [];
/** Things the person running the script should know about. They do not stop the build. */
const notices: string[] = [];
/** Lines printed by --fingerprints, ready to paste into the tables below. */
const fingerprintReport: string[] = [];

// ── The app's own modules ────────────────────────────────────────────────────
// They are loaded with the module loader the app's tests run on, not with plain imports: some
// of them read build variables (import.meta.env) that exist only there. No config file is used,
// so the app's build settings cannot change what this script sees. With no build variable set
// the modules behave as in the default ("full") build. The launch switches are read from
// src/core/features.ts as data, not from the running build.

const appLoader = await createServer({
  root: APP_DIR,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});

async function load<T>(rel: string): Promise<T> {
  return (await appLoader.ssrLoadModule(`/${rel}`)) as T;
}

const { alertCards, fixedAlertCard } = await load<typeof import('../src/core/alert')>('src/core/alert.ts');
const { brandNumbers, brandOptions, CATALOG, hasLabelSource } = await load<typeof import('../src/core/catalog')>('src/core/catalog.ts');
const { curveAvailable, FULL, labelFactsShown, LAUNCH, safetyQuestions, thirdTab } = await load<typeof import('../src/core/features')>('src/core/features.ts');
const { FOODS, foodName, foodUnit } = await load<typeof import('../src/core/foods')>('src/core/foods.ts');
const { hoursFromLabel, labelFact, LABELS_READ_ON, PK_RULE } = await load<typeof import('../src/core/labelFacts')>('src/core/labelFacts.ts');
const { guideDated, guideItems, MED_GUIDE_LIST, MED_GUIDE_OTHER, MED_GUIDES_READ_ON } = await load<typeof import('../src/core/medGuide')>('src/core/medGuide.ts');
const { BUTTONS_THAT_RAISE_NOTHING, buttonItems, buttonRules, GENERAL_SIGN, guidesWithItem, ITEM_COVERAGE, NOT_FROM_A_GUIDE, OTHER_COVERAGE, reminderFor, ruleItems, showsLaunchCard } = await load<typeof import('../src/core/guideCoverage')>('src/core/guideCoverage.ts');
const { parseLocal } = await load<typeof import('../src/core/localParse')>('src/core/localParse.ts');
const { bateman, concentration, exposureIndexAt, modelFor, steadyStatePeak } = await load<typeof import('../src/core/pk')>('src/core/pk.ts');
const { bmi, proteinTarget } = await load<typeof import('../src/core/protein')>('src/core/protein.ts');
const { dueStatus, SITES, siteLabel } = await load<typeof import('../src/core/schedule')>('src/core/schedule.ts');
const { gradeLabel, SYMPTOM_ORDER, symptomLabel } = await load<typeof import('../src/core/symptoms')>('src/core/symptoms.ts');
const { crisisLine, emergencyDial, emergencyNumber, levelRank, triageCard, triageSymptom, triageText } = await load<typeof import('../src/core/triage')>('src/core/triage.ts');
const { HOUR } = await load<typeof import('../src/core/tz')>('src/core/tz.ts');
const { fromKg, ftInToCm, toKg } = await load<typeof import('../src/core/units')>('src/core/units.ts');
const { fastLoss, regainStatus, rollingAverages } = await load<typeof import('../src/core/weight')>('src/core/weight.ts');
const { adviceText } = await load<typeof import('../src/web/content/advice')>('src/web/content/advice.ts');
const { copingCards } = await load<typeof import('../src/web/content/coping')>('src/web/content/coping.ts');
const { disclaimer } = await load<typeof import('../src/web/content/labels')>('src/web/content/labels.ts');
const { ROUTINE_IDS, routineExercises, routineTitle } = await load<typeof import('../src/web/content/workouts')>('src/web/content/workouts.ts');

const hash8 = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 8);

const sourceCache = new Map<string, string>();

/** A source file of the app as text. `rel` is relative to the app folder. */
function source(rel: string): string {
  let text = sourceCache.get(rel);
  if (text === undefined) {
    text = readFileSync(join(APP_DIR, rel), 'utf8');
    sourceCache.set(rel, text);
  }
  return text;
}

/** The .ts files of one folder that are not tests, as paths relative to the app folder. */
function sourceFiles(relDir: string): string[] {
  return readdirSync(join(APP_DIR, relDir))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .sort()
    .map((f) => `${relDir}/${f}`);
}

/** Every non-test source file under a folder, sub-folders included. */
function sourceTree(relDir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(APP_DIR, relDir), { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourceTree(rel));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out.sort();
}

/**
 * Looks for a piece of screen code that a sentence of the packet rests on. The screens are not
 * imported here, so this is a plain text search. When the piece is gone the caller falls back to
 * a sentence that needs no such detail, and the person running the script is told.
 */
function screenCodeHas(rel: string, pattern: RegExp, sentenceAbout: string): RegExpExecArray | null {
  const found = existsSync(join(APP_DIR, rel)) ? pattern.exec(source(rel)) : null;
  if (!found) notices.push(`${rel} no longer has the code that the packet's sentence about ${sentenceAbout} rests on. That sentence was left out or made general; check it.`);
  return found;
}

/** True when a name from src/core is used by the screens (anything under src/web that is not content). */
function usedByScreens(name: string): boolean {
  const word = new RegExp(`\\b${name}\\b`);
  return sourceTree('src/web')
    .filter((f) => !f.startsWith('src/web/content/'))
    .some((f) => word.test(source(f)));
}

// ── Reading text out of source files ─────────────────────────────────────────

const HAS_CJK = /[\u3400-\u9fff\uff00-\uffef\u3000-\u303f]/;

/** Reads a quoted JavaScript string that starts at `at`. Template strings are not supported. */
function readString(src: string, at: number): { value: string; end: number } {
  const quote = src[at];
  if (quote !== "'" && quote !== '"') throw new Error(`expected a quoted string at offset ${at}: ${src.slice(at, at + 30)}`);
  let value = '';
  let i = at + 1;
  while (i < src.length && src[i] !== quote) {
    if (src[i] === '\\') {
      const next = src[i + 1];
      if (next === 'n') value += '\n';
      else if (next === 't') value += '\t';
      else if (next === 'u') {
        value += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16));
        i += 4;
      } else value += next;
      i += 2;
    } else {
      if (src[i] === '\n') throw new Error(`unterminated string at offset ${at}`);
      value += src[i++];
    }
  }
  return { value, end: i + 1 };
}

/** Skips spaces, commas and comments. */
function skipFiller(src: string, at: number): number {
  let i = at;
  for (;;) {
    while (i < src.length && /[\s,]/.test(src[i])) i++;
    if (src.startsWith('//', i)) i = src.indexOf('\n', i);
    else if (src.startsWith('/*', i)) i = src.indexOf('*/', i) + 2;
    else return i;
  }
}

type Literal = string | Literal[] | { [key: string]: Literal };

/**
 * Reads a data literal made of objects, arrays and quoted strings, with comments allowed.
 * This is how the example phrases are taken out of the test file without running it.
 */
function readLiteral(src: string, at: number): { value: Literal; end: number } {
  let i = skipFiller(src, at);
  if (src[i] === '[') {
    const items: Literal[] = [];
    i = skipFiller(src, i + 1);
    while (src[i] !== ']') {
      const item = readLiteral(src, i);
      items.push(item.value);
      i = skipFiller(src, item.end);
    }
    return { value: items, end: i + 1 };
  }
  if (src[i] === '{') {
    const object: { [key: string]: Literal } = {};
    i = skipFiller(src, i + 1);
    while (src[i] !== '}') {
      let key: string;
      if (src[i] === "'" || src[i] === '"') {
        const k = readString(src, i);
        key = k.value;
        i = k.end;
      } else {
        const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
        if (!m) throw new Error(`expected a key at offset ${i}: ${src.slice(i, i + 30)}`);
        key = m[0];
        i += key.length;
      }
      i = skipFiller(src, i);
      if (src[i] !== ':') throw new Error(`expected ":" after key "${key}"`);
      const item = readLiteral(src, i + 1);
      object[key] = item.value;
      i = skipFiller(src, item.end);
    }
    return { value: object, end: i + 1 };
  }
  return readString(src, i);
}

const strings = (v: Literal): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * English screen text for a message key, read from the dictionary file as text. The file is not
 * imported: it belongs to the screens, and only the wording is needed here.
 */
const SCREEN_DICTIONARY = 'src/web/i18n/en.ts';
function screenText(key: string, params: Record<string, string | number> = {}): string {
  const src = source(SCREEN_DICTIONARY);
  const at = src.indexOf(`'${key}':`);
  if (at < 0) {
    problems.push(`Screen text "${key}" was not found in ${SCREEN_DICTIONARY}. If the key was renamed, update it in scripts/build-review-packet.ts.`);
    return `[${key}]`;
  }
  const start = skipFiller(src, at + key.length + 3);
  if (src[start] !== "'" && src[start] !== '"') {
    problems.push(`Screen text "${key}" in ${SCREEN_DICTIONARY} is no longer a plain string.`);
    return `[${key}]`;
  }
  const text = readString(src, start).value.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
  // Bold tags are only for the screen. A placeholder left unfilled is shown in square brackets.
  return text.replace(/<\/?b>/g, '').replace(/\{(\w+)\}/g, '[$1]');
}

/**
 * English screen text for a message that changes with a number: the form used for any count but 1.
 * Such a message is written as { one: '...', other: '...' } in the dictionary file.
 */
function screenTextMany(key: string, params: Record<string, string | number> = {}): string {
  const src = source(SCREEN_DICTIONARY);
  const at = src.indexOf(`'${key}':`);
  const start = at < 0 ? -1 : skipFiller(src, at + key.length + 3);
  let other: Literal | undefined;
  if (start >= 0 && src[start] === '{') {
    const forms = readLiteral(src, start).value;
    if (typeof forms === 'object' && !Array.isArray(forms)) other = forms.other;
  }
  if (typeof other !== 'string') {
    problems.push(`Screen text "${key}" in ${SCREEN_DICTIONARY} is not a message with the forms "one" and "other" any more. Update scripts/build-review-packet.ts.`);
    return `[${key}]`;
  }
  const text = other.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
  return text.replace(/<\/?b>/g, '').replace(/\{(\w+)\}/g, '[$1]');
}

/** The text of one top-level declaration: from the line that starts it to the first closing brace in column 0. */
function declaration(rel: string, start: string): string | null {
  const src = source(rel);
  const at = src.indexOf(`\n${start}`);
  if (at < 0) return null;
  const end = src.indexOf('\n}', at);
  return end < 0 ? null : src.slice(at + 1, end + 2);
}

// ── Markdown helpers ─────────────────────────────────────────────────────────

/** Makes text safe inside a table cell or a paragraph. */
function md(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/([*_`<>])/g, '\\$1').replace(/\n/g, ' ');
}

/** A pipe table. `widths` are relative column widths, used by converters that lay the table out on a page. */
function table(headers: string[], rows: string[][], widths?: number[]): string[] {
  const line = (cells: string[]) => `| ${cells.map((c) => (c === '' ? ' ' : c)).join(' | ')} |`;
  const rule = headers.map((_, i) => '-'.repeat(Math.max(3, (widths?.[i] ?? 1) * 4)));
  return [line(headers), `|${rule.join('|')}|`, ...rows.map(line), ''];
}

const quoteBlock = (lines: string[]): string[] => [...lines.map((l) => (l === '' ? '>' : `> ${l}`)), ''];
/** App text or a phrase in quotation marks. Text that has straight quotes inside gets curly ones around it. */
const q = (text: string): string => (text.includes('"') ? `\u201c${md(text)}\u201d` : `"${md(text)}"`);
const list = (items: string[]): string[] => [...items.map((i) => `- ${i}`), ''];
const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const round = (n: number, digits = 0): string => {
  const s = n.toFixed(digits);
  return digits > 0 ? s.replace(/\.?0+$/, '') : s;
};
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** Item codes: "R-01", "M-17". The reviewer uses them to point at a line. */
const codeCounters = new Map<string, number>();
function code(prefix: string): string {
  const n = (codeCounters.get(prefix) ?? 0) + 1;
  codeCounters.set(prefix, n);
  return `${prefix}-${String(n).padStart(2, '0')}`;
}
const coded = (prefix: string): number => codeCounters.get(prefix) ?? 0;

// ── The danger-symptom rules as the code has them ────────────────────────────

interface InternalRule {
  id: TriageId;
  level: TriageLevel | ((c: TriageContext) => TriageLevel);
  when?: (c: TriageContext) => boolean;
}

interface TriageInternals {
  EN: Record<string, RegExp[]>;
  EN_CRISIS: RegExp;
  EN_LOW_SUGAR_SIGNS: RegExp[];
  EN_LOW_SUGAR_COMMON: RegExp[];
  RULES: InternalRule[];
  lists: Record<string, string>;
  negation: Record<string, string | RegExp>;
  /** The pieces that decide whether a match is about the person's own state now. */
  own: Record<string, string | RegExp>;
  /** The patterns whose hits show the fixed card also where each rule shows its own card. */
  FIXED_CARD: WeakSet<RegExp>;
  /** Misspellings read as the word that was meant, before any rule looks at the text. */
  EN_SPELLING: [RegExp, string][];
}

const TRIAGE_FILE = 'src/core/triage.ts';
const TRIAGE_TEST_FILE = 'src/core/triage.test.ts';
const CORPUS_TEST_FILE = 'src/core/triage.en.corpus.test.ts';

/** Word lists the trigger patterns are built from, by the name they have in triage.ts. */
const LIST_NAMES = ['EN_SEVERE', 'EN_BELLY', 'EN_HURT', 'EN_SORE', 'EN_VOMIT', 'EN_RUNS', 'EN_NAUSEA', 'EN_WONT_GO_AWAY', 'EN_MILD', 'EN_TO_BACK', 'EN_LONG_OR_OFTEN', 'EN_IS_SEVERE', 'EN_IS_BAD', 'EN_N_DAYS', 'EN_DAY_N', 'EN_DIZZY', 'EN_RUQ', 'EN_CANT_SEE', 'EN_SEE', 'EN_NOT_EAT', 'EN_DAYS'];
/** The pieces that decide whether a "no" or "not" in front of a symptom counts. */
const NEGATION_NAMES = ['EN_STILL_THERE', 'EN_NT', 'EN_NO_AFTER', 'EN_FILL_HAVE', 'EN_FILL_NO', 'EN_NOT', 'EN_NEGATED', 'EN_STILL_TRUE', 'EN_BUT_NOW', 'EN_NOT_FOR_LONG', 'EN_ASKS_ABOUT', 'EN_ONLY_AUX_NOT'];
/** The pieces that decide whether a match is about someone else, a time long past, a general question or the size of a pill. */
const OWN_NAMES = ['EN_KIN', 'EN_KIN_BARE', 'EN_SOMEONE_ELSE', 'EN_FIRST_PERSON', 'EN_REPORTS', 'EN_ME_AND', 'EN_SUBJECT_LEAD', 'EN_AND_THEN', 'EN_HAS', 'EN_VERB_FIRST', 'EN_WHO', 'EN_CLAUSE_BREAK', 'EN_IN_THE_FAMILY', 'EN_LONG_AGO', 'EN_USED_TO', 'EN_NOW', 'EN_OVER_NOW', 'EN_PRESENT', 'EN_PAST', 'EN_DET', 'EN_IT', 'EN_CAUSE', 'EN_GENERAL_QUESTION', 'EN_IS_IT', 'EN_A_SIDE_EFFECT', 'EN_OWN_MY', 'EN_OWN_WORDS', 'EN_OWN_STATE', 'EN_OWN_SAID', 'EN_I_HAVE_IT', 'EN_FEAR', 'EN_TOPIC', 'EN_NOT_YET', 'EN_IF_BEFORE', 'EN_THEN_AFTER', 'EN_HERE_NOW', 'EN_PILL', 'EN_PILL_AFTER', 'EN_PILL_BEFORE', 'EN_FOOD_TOO', 'EN_FIGURE_AFTER', 'EN_FIGURE_BEFORE', 'EN_EXERTION_AFTER'];

/**
 * The pattern tables of triage.ts. They are module-private there, so this loads a temporary
 * copy of the file with one export line added. The copy lives outside the repository and is
 * removed right away.
 */
async function loadTriageInternals(): Promise<TriageInternals> {
  const coreDir = join(APP_DIR, 'src', 'core');
  const exportLine = `\nexport const __reviewInternals = { EN, EN_CRISIS, EN_LOW_SUGAR_SIGNS, EN_LOW_SUGAR_COMMON, RULES, FIXED_CARD, EN_SPELLING, lists: { ${LIST_NAMES.join(', ')} }, negation: { ${NEGATION_NAMES.join(', ')}, GAP: gap(1) }, own: { ${OWN_NAMES.join(', ')} } };\n`;
  // Relative imports must still point at src/core from where the copy is.
  const copy = source(TRIAGE_FILE).replace(/from '\.\/([^']+)'/g, (_whole, name: string) => `from '${pathToFileURL(join(coreDir, `${name}.ts`)).href}'`) + exportLine;
  const dir = mkdtempSync(join(tmpdir(), 'review-packet-'));
  try {
    const file = join(dir, 'triage-internals.mts');
    writeFileSync(file, copy);
    const loaded = (await import(pathToFileURL(file).href)) as { __reviewInternals: TriageInternals };
    return loaded.__reviewInternals;
  } catch (e) {
    throw new Error(`Could not read the pattern tables of ${TRIAGE_FILE}. If a table was renamed there, update LIST_NAMES, NEGATION_NAMES, OWN_NAMES and the export line in scripts/build-review-packet.ts.\n${String(e)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const US_CONTEXT: TriageContext = { insulinOrSU: false, drugId: 'semaglutide-wl', region: 'US' };
/** Every combination of the two things a rule may depend on: the insulin answer and the medication. */
const CONTEXTS: TriageContext[] = [null, ...CATALOG.map((d) => d.id)].flatMap((drugId) => [false, true].map((insulinOrSU) => ({ insulinOrSU, drugId, region: 'US' as const })));

const fires = (text: string, id: string, ctx: TriageContext = US_CONTEXT): boolean => triageText(text, ctx).some((h) => h.id === id);

/** What happens when a phrase is typed, as a table cell: "Fires: `chest_or_faint` (`emergency`)" or "Stays quiet". */
function outcome(text: string, ctx: TriageContext = US_CONTEXT): string {
  const hits = triageText(text, ctx);
  return hits.length ? `Fires: ${hits.map((h) => `${ruleRef(h.id)} (\`${h.level}\`)`).join(', ')}` : 'Stays quiet';
}

/**
 * Every phrase a simple word-list pattern can match. It understands plain letters, groups with
 * "|", an optional letter or group ("?"), "\s+" (shown as one space) and "\b". Anything else
 * throws, so a list that outgrows this is never shown wrong.
 */
function expandSimple(pattern: string): string[] {
  let i = 0;
  const alternatives = (): string[] => {
    const out: string[] = [];
    let seq = [''];
    for (;;) {
      if (i >= pattern.length || pattern[i] === ')') return [...out, ...seq];
      if (pattern[i] === '|') {
        out.push(...seq);
        seq = [''];
        i++;
        continue;
      }
      let atom: string[];
      if (pattern.startsWith('(?:', i)) {
        i += 3;
        atom = alternatives();
        if (pattern[i] !== ')') throw new Error(`unbalanced group in "${pattern}"`);
        i++;
      } else if (pattern.startsWith('\\s+', i)) {
        i += 3;
        atom = [' '];
      } else if (pattern.startsWith('\\b', i)) {
        i += 2;
        atom = [''];
      } else if (/[a-z' -]/i.test(pattern[i])) {
        atom = [pattern[i]];
        i++;
      } else throw new Error(`cannot list the words of "${pattern}" (character ${i})`);
      if (pattern[i] === '?') {
        atom = ['', ...atom];
        i++;
      }
      seq = seq.flatMap((a) => atom.map((b) => a + b));
    }
  };
  const all = alternatives();
  if (i !== pattern.length) throw new Error(`unbalanced group in "${pattern}"`);
  return [...new Set(all)];
}

// ── Plain-words glosses of the trigger patterns ──────────────────────────────
// Each gloss says in plain words what one pattern in triage.ts matches. `fp` is the fingerprint
// of the patterns the glosses were written for; when the patterns change the script stops, so a
// gloss cannot go stale. Every example is checked against its own pattern and against the rule.
// Words in **bold** name a word list (WORD_LISTS below).

interface TriggerGloss {
  says: string;
  examples: string[];
}

interface RuleGloss {
  fp: string;
  triggers: TriggerGloss[];
}

const TRIGGERS: Record<string, RuleGloss> = {
  pancreatitis: {
    fp: '74ec0f0e',
    triggers: [
      { says: `A **severe word**, then (within about 20 characters) a **stomach word** joined to a **pain word**.`, examples: ['severe stomach pain', 'really bad bellyache'] },
      {
        says: `A **severe word**, then (within about 12 characters) "pain", "pains", "ache", "aches", "cramp", "cramps" or "cramping", then "in", "around", "across", "on", "at" or "near", then (within about 30 characters) a **stomach word**.`,
        examples: ['terrible pain in my upper abdomen', 'severe pain on the left side of my stomach'],
      },
      {
        says: `A **stomach word**, then (within about 30 characters) words that say the pain is very bad: a **pain word** plus "so", "really", "very", "extremely" or "super" plus "bad", "badly" or "much" ("is", "are", "was" or "got" may stand before "so"); "killing me" after "is", "are", "was", "were", "has been", "have been", "been" or "keeps"; "unbearable"; "excruciating"; "can't stand", "can't take" or "can't bear", followed by "it", "this" or "the pain"; "doubled over"; "can't stand up straight"; "worst pain".`,
        examples: ['my stomach hurts so bad', 'stomach pain is unbearable', 'belly has been killing me'],
      },
      { says: `"Doubled over", then (within about 20 characters) a **stomach word**.`, examples: ['doubled over with belly cramps'] },
      { says: `A **stomach word** and a **pain word**, then a **reaches-the-back phrase**, in the same sentence or the next one.`, examples: ['belly pain that goes through to my back', 'Bad stomach pain. It goes to my back.'] },
      { says: `A **pain word**, then "in", "around", "across" or "from" and a **stomach word**, then a **reaches-the-back phrase**, in the same sentence or the next one.`, examples: ['pain in my stomach that goes to my back', 'pain from my abdomen to my back'] },
      { says: `A **stomach word** and a **pain word**, then "but", then a **reaches-the-back phrase**. So "not severe, but it goes to my back" still triggers.`, examples: ['stomach pain, not severe, but it goes to my back'] },
      { says: `A **stomach word**, then "in so much pain" or "in too much pain".`, examples: ['my stomach is in so much pain'] },
      { says: `"So much" or "too much" plus "pain" or "cramping", then "in", "around" or "across", then a **stomach word**.`, examples: ['so much pain in my belly'] },
      { says: `"Stabbing", "sharp", "shooting" or "tearing", directly followed by a **stomach word** joined to a **pain word**.`, examples: ['sharp stomach pain'] },
      { says: `"Stabbing", "sharp", "shooting" or "tearing", then "pain", "pains", "cramp", "cramps" or "cramping", then "in", "around" or "across" and a **stomach word** ("my" or "the", and "upper" or "lower", may stand before it).`, examples: ['stabbing pain in my stomach', 'sharp cramps in my lower belly'] },
      { says: `The word "pancreatitis". Misspellings of it are read as this word first (2.3).`, examples: ['I think I have pancreatitis'] },
      { says: `A **stomach word** and a **pain word**, then (within about 20 characters) a **how-bad phrase for pain**.`, examples: ['my stomach pain is severe', 'stomach ache getting worse'] },
      { says: `A **pain word**, then "in", "around", "across", "on" or "at", then (within about 30 characters) a **stomach word**, then (within about 15 characters) a **how-bad phrase for pain**.`, examples: ['the pain in my stomach is awful'] },
      {
        says: `A pain score of 8 or more. First a **stomach word** and a **pain word**, or a **pain word**, then "in", "around", "across", "on" or "at" and a **stomach word**. Then (within about 25 characters) "8/10", "9/10" or "10/10" (also written "9 out of 10"), or "a", "an", "like a", "like an", "at a" or "at an" followed by "8", "9", "10", "eight", "nine" or "ten". The last kind does not count when "am", "pm", "min", "minutes", "hours", "days", "mg" or "%" follows the number.`,
        examples: ['stomach pain 9/10', 'the pain in my stomach is a 10 out of 10'],
      },
      {
        says: `A **stomach word**, then (within about 30 characters) a **severe word** directly followed by "pain", "pains", "ache", "aches", "cramp", "cramps" or "cramping". Or a **stomach word** joined to a **pain word**, directly followed by "severe", "unbearable", "excruciating", "terrible", "horrible", "awful" or "intense". Or "can't" plus "stand", "take", "bear", "handle" or "deal with", plus "the" or "this", plus "pain", "cramp", "cramps" or "cramping", then "in" or "around" and a **stomach word**.`,
        examples: ['stomach has been in knots with severe pain', 'abd pain severe', "can't stand the pain in my stomach"],
      },
      {
        says: `A **stomach word**, then (within about 20 characters) "hurt", "hurts", "hurting", "ache", "aches" or "aching", directly followed by "bad", "badly", "a lot", "like hell", "like crazy", "so much", "terribly" or "horribly" ("so", "really", "real", "very", "pretty", "super" or "just" may stand in between).`,
        examples: ['my stomach hurts bad', 'stomach hurts a lot', 'belly hurts like hell'],
      },
    ],
  },
  chest_or_faint: {
    fp: 'fff8c7c9',
    triggers: [
      { says: `"Chest pain" or "chest pains".`, examples: ['chest pain since this morning'] },
      {
        says: `"Pain", "ache", "pressure", "tightness", "squeezing", "heaviness", "discomfort", "heavy feeling", "tight feeling" or "squeezing feeling", then (within about 15 characters) "in", "on", "across", "around" or "at", then "chest". Words for the place may stand before "chest": "my", "the", "left", "right", "upper", "the left side of my", "the middle of my" and the like.`,
        examples: ['pressure in my chest', 'heavy feeling on my chest', 'pain on the left side of my chest'],
      },
      {
        says: `"Chest", then "hurt", "hurts", "hurting", "aches", "aching", "achy", "sore", "killing me", "pressure", "tightness" or "tight", or "feels" plus "tight", "heavy", "painful" or "sore" ("really", "so", "very" or "weird and" may stand before that word). These words may stand after "chest": "really", "still", "just", "so", "very", "super", "kind of", "kinda", "has been", "have been", "been", "is", "was", "keeps", "started", "starts", "began". Or "tight chest".`,
        examples: ['my chest hurts', 'chest has been hurting', 'my chest is killing me', 'my chest feels tight', 'tight chest'],
      },
      {
        says: `"Pass out" or "black out" in any form ("passed out", "passing out", "passes out", "blacked out", "blacks out"). It does not count when "flyers", "fliers", "candy", "papers", "samples", "invitations", "cards", "treats", "pamphlets" or "snacks" follows, also with "the", "some", "my", "our", "all the" or "a few" in between ("passed out the flyers").`,
        examples: ['I passed out after the shot', 'I keep passing out'],
      },
      {
        says: `"Fainted", "fainting" or "faints", but not "fainting goat" or "fainting couch". Or "faint" after "did", "might", "may", "could", "gonna", "to", "almost", "nearly", "will" or "would" ("going to faint"). Or "faint" after "feel", "feels", "feeling", "felt", "I'm", "I am", "I was", "I got", "I get" or "getting" ("so", "very" or "really" may stand in between), but not "faint of heart".`,
        examples: ['I fainted in the shower', 'I feel faint', 'I think I am going to faint'],
      },
      { says: `"Lost consciousness".`, examples: ['I lost consciousness for a minute'] },
      { says: `"Unconscious".`, examples: ['I was unconscious'] },
      {
        says: `"Heart", "pulse", "heartbeat" or "heart rate", then (within about 20 characters) a word for fast or hard: "racing", "race", "races", "raced"; "pounding", "pounds", "pounded"; "fluttering", "flutters", "fluttered"; "thumping", "thumps", "thumped"; "hammering", "hammers", "hammered"; "skipping beat" or "skipping beats"; "beating fast", "beating hard", "beating quick" or "beating quickly" ("so", "really", "very", "too", "super" or "way too" may stand before "fast"); "beating out of my chest"; "fast", "rapid" or "elevated" (also after "so", "really", "very", "too", "super" or "way too"); "so high", "really high", "very high", "too high", "super high" or "way too high"; "going crazy", "going nuts", "going so fast" or "going a mile a minute"; "through the roof". It does not count when a **slight word** stands right before that word, or when "a bit", "a little", "a little bit", "a tad" or "slightly" follows it.`,
        examples: ['my heart is racing', 'heart pounding in my chest', 'my pulse is really fast'],
      },
      {
        says: `"Racing", "pounding", "rapid", "fast", "fluttering" or "thumping", followed by "heart", "heartbeat", "heart rate" or "pulse" (not when "a bit", "a little", "a little bit", "a tad" or "slightly" follows). Or "high" or "elevated", followed by "heart rate" or "pulse".`,
        examples: ['very rapid heartbeat', 'racing pulse', 'high heart rate'],
      },
      { says: `"Palpitation" or "palpitations" (also after "heart"), "tachycardia", "heart flutter" or "heart flutters".`, examples: ['heart palpitations again tonight'] },
      {
        says: `Fainting in other words: "everything went black" or "everything went dark"; "blackout" or "black out" after "had", "having", "have" or "another" ("a" or "another" may stand in between: "had a blackout"); "blackout" or "black out" followed by "this", "last", "today", "yesterday", "again", "episode" or "spell"; "syncope"; "out cold" (also "knocked out cold").`,
        examples: ['everything went black', 'had a blackout this morning', 'I was out cold'],
      },
      {
        says: `Chest pain in other words: "chest ache", "chest aches" or "chest discomfort"; "heavy chest"; "heart hurts", "heart really hurts", "heart is hurting" or "heart aches", but not when "for" follows ("my heart aches for them"); "pain", then (within about 12 characters) "in", "around", "near" or "by", plus "heart" or "my heart"; "sitting", "standing", "weight", "pressing" or "pushing", then (within about 15 characters) "on my chest".`,
        examples: ['chest discomfort', 'my heart hurts', 'feels like an elephant sitting on my chest'],
      },
      {
        says: `Pain in the left arm or the jaw, together with another sign: "pain", "ache", "aching", "numb", "numbness", "tingling" or "pressure", then (within about 20 characters) "left arm" or "jaw", then (within about 30 characters) "and", "with" or "plus", then (within about 15 characters) "jaw", "left arm", "chest", a word that starts with "sweat", "nause" or "dizz", or a word that starts with "short" followed by "of breath".`,
        examples: ['pain in my left arm and jaw', 'numbness in my left arm and sweating'],
      },
      {
        says: `A heart attack or a stroke by name: "heart attack"; "stroke" after "having", "had", "have", "think it's", "another", "a" or "mini" ("a", "another" or "mini" may also stand right before "stroke": "having a mini stroke", "a mini-stroke"), but not when "of" follows ("a stroke of luck"); "stroke symptoms", "stroke symptom", "stroke signs" or "stroke sign"; "signs of stroke", "signs of a stroke", "symptoms of stroke" or "symptoms of a stroke" (also "sign", "symptom").`,
        examples: ['I think I am having a heart attack', 'I had a mini stroke'],
      },
      { says: `"Seizure", "seizures" or "seizing"; "convulsion", "convulsions", "convulsing" or "convulsed".`, examples: ['I had a seizure', 'I was convulsing'] },
      {
        says: `A collapse. "Collapsed", "collapse" or "collapsing", but not when a thing stands right before it ("vein", "veins", "tent", "chair", "table", "bed", "shelf", "roof", "ceiling", "market", "plan", "deal", "lung", "lungs", "it", "that", "which", "building", "bridge", "economy", "arch", "arches" or "stock", also with "has", "have", "had", "just", "almost", "nearly", "is" or "was" in between), and not when "vein", "veins", "lung", "lungs", "on the couch", "on the bed", "on the sofa", "in bed", "into bed", "in my bed" or "into my bed" follows. Or "woke up", "came to", "found myself", "ended up" or "was found", plus "on the floor" or "on the ground" ("lying", "laying" or "face down" may stand before "on", and one word before "floor" or "ground": "on the bathroom floor"). Or "found me on the floor" or "found me on the ground" (also with "passed out", "lying", "laying" or "unconscious" before "on", and one word before "floor" or "ground"). Or "hit the floor" or "hit the ground". Or "don't remember", "do not remember", "can't remember" or "cannot remember", followed by "falling", "how I fell", "how I got here", "how I got there" or "how I got on the floor".`,
        examples: ['I collapsed at work', 'woke up on the bathroom floor', "I don't remember falling"],
      },
      {
        says: `A drooping face: "face", "mouth", "smile" or "eyelid", then (within about 15 characters) "droop", "drooping", "droops", "drooped", "droopy", "sagging" or "lopsided". Or "drooping", "droopy", "drooped" or "droop", followed by "face", "mouth" or "eyelid". Or "facial droop" (also "facial drooping").`,
        examples: ['my face is drooping', 'my smile is lopsided'],
      },
      {
        says: `One side numb or weak: "numb", "numbness", "weak", "weakness", "paralyzed" or "paralysed", then (within about 25 characters) "one side", "left side" or "right side". Or "one side", "left side" or "right side", then (within about 25 characters) "numb", "weak", "paralyzed", "paralysed", "limp" or "went dead". Or "can't move", "can't lift", "can't raise" or "can't feel", followed by "arm", "leg", "hand", "side" or "face" ("my", and "left" or "right", may stand in between).`,
        examples: ['my left side is numb', "I can't move my right arm"],
      },
      {
        says: `Slurred speech or sudden confusion: "slurred", "slurring", "slurry" (also "slurr"); "can't talk" or "can't speak", followed by "right", "properly", "straight" or "clearly"; "can't find my words" or "can't get my words"; "don't know where I am" or "do not know where I am"; "sudden", "suddenly", "all of a sudden" or "out of nowhere", then (within about 20 characters) a word that starts with "confus" ("confused", "confusion") or "disoriented".`,
        examples: ['my speech is slurred', "I can't find my words", 'suddenly confused'],
      },
      {
        says: `"Ambulance", "911", "paramedics" or "EMS" ("a", "an" or "the" may stand before it), after "need", "needed", "need to call", "needed to call", "called", "calling", "dialed", "dialing" or "should I call".`,
        examples: ['I need an ambulance', 'should I call 911'],
      },
    ],
  },
  anaphylaxis: {
    fp: 'de3a69f5',
    triggers: [
      {
        says: `"Throat", "lip", "lips", "tongue", "face", "eyelid" or "eyelids", then (within about 20 characters) a swelling word: "swell", "swells", "swelled", "swelling", "swollen", "puffed up", "puffing up", "closing up" or "is closing". One more word and "and" may stand right before the swelling word ("tingling and swelling").`,
        examples: ['my throat is swelling', 'my face is swollen', 'my lips are tingling and swelling'],
      },
      { says: `"Throat" or "airway", then (within about 25 characters) "closing", "closed" or "closes".`, examples: ['throat closing'] },
      { says: `"Swelling" or "swollen", then (within about 25 characters) "throat", "lip", "lips", "tongue", "face", "eyelid" or "eyelids".`, examples: ['swelling of my lips and tongue'] },
      {
        says: `"Can't", "cannot", "can not", "couldn't", "could not", "can barely", "can hardly", "could barely", "barely", "hardly", "hard to", "trouble", "difficulty", "difficult to", "struggling to", "struggle to", "unable to" or "not able to", followed by a word that starts with "breath" ("breathe", "breathing"); "really" may stand in between. It does not count when "through my nose", "thru my nose" or "out of my nose" follows (also without "my").`,
        examples: ["I can't breathe", 'trouble breathing', 'I can barely breathe'],
      },
      { says: `"Short of breath" or "shortness of breath". It does not count right after "less", "not as", "not so" or "no longer" ("less short of breath than yesterday").`, examples: ['short of breath'] },
      {
        says: `"Can't", "cannot", "couldn't", "could not", "trouble", "hard to", "hard time", "difficulty" or "struggling to", followed by "catch my breath" or "catching my breath".`,
        examples: ["I can't catch my breath", 'trouble catching my breath'],
      },
      { says: `"Hives", "rash" or "welts", then (within about 20 characters) "all over", "everywhere", "whole body" or "entire body". "All over" one body part does not count ("rash all over my thigh"); "all over my body" does.`, examples: ['hives all over my body', 'rash everywhere'] },
      { says: `"All over", "whole body", "entire body" or "covered in", then (within about 20 characters) "hives", "rash" or "welts".`, examples: ['covered in hives'] },
      {
        says: `"Problem", "problems", "issue", "issues", "hard time", "tough time", "struggle", "struggles" or "struggling", followed by "breathing" ("with" and "my" may stand in between). Or "breathing" followed by "problem", "problems", "issue", "issues", "trouble", "difficulty" or "difficulties". Or "breathing" plus "is", "feels", "got", "has been" or "was", plus "hard", "harder", "difficult", "labored", "laboured", "tight", "shallow", "heavy", "rough", "bad" or "worse" ("really", "so", "very" or "getting" may stand in between).`,
        examples: ['problems breathing', 'my breathing is getting worse'],
      },
      {
        says: `"Wheeze", "wheezes", "wheezing" or "wheezy"; "gasping"; "out of breath" (not "out of breath mints", "strips" or "spray"); "breathless" or "breathlessness"; "can't get" or "can't take", plus "a breath" (also "a full breath", "a deep breath", "a good breath"), "air", "any air" or "enough air". None of these counts right after "less", "not as", "not so" or "no longer".`,
        examples: ['wheezing', "I can't get enough air"],
      },
      {
        says: `"Throat", then (within about 20 characters) "tight", "tightening", "tightness" or a word that starts with "constrict". Or "tight", "tightness" or "tightening", then (within about 12 characters) "throat".`,
        examples: ['my throat feels tight', 'tightness in my throat'],
      },
      {
        says: `"Throat", "lip", "lips", "tongue", "face", "eyelid", "eyelids" or "mouth", then (within about 15 characters) "puffy", "puffed", "puffing", "puffing up", "ballooned", "ballooning", "blown up", "blew up", "blowing up", "swole", or "getting" plus "bigger", "huge", "fat" or "puffy". Or "puffy" or "swole", followed by one of those body parts.`,
        examples: ['my face is all puffy', 'puffy lips', 'my lips are getting bigger'],
      },
      {
        says: `"Severe", "bad", "terrible", "horrible", "awful", "really bad", "nasty", "huge", "spreading", "worst", "intense", "unbearable" or "extreme", followed by "rash", "rashes", "hives", "itch", "itching", "itchiness" or "welts".`,
        examples: ['severe rash', 'severe itching'],
      },
      {
        says: `"Rash", "rashes", "hives", "itch", "itching", "itchiness", "itchy" or "welts", then (within about 40 characters) "severe", "unbearable", "spreading", "getting worse", "so bad", "really bad", "very bad", "extremely bad", "out of control", "driving me crazy" (also "nuts" or "insane"), "won't stop" or "nonstop".`,
        examples: ['my rash is spreading', 'the itching is driving me crazy'],
      },
      {
        says: `"Itch", "itching", "itchy", "itchiness" or "itches", then (within about 15 characters) "all over", "everywhere", "whole body", "entire body" or "head to toe". Or those words first, then (within about 20 characters) a word that starts with "itch". "All over" one body part does not count.`,
        examples: ['itching all over', 'my whole body is itchy'],
      },
      { says: `"Hives" or "welts". Or "broke out in", "breaking out in", "broken out in" or "break out in", followed by "rash", "a rash", "a bad rash", "bad rash" or "welts".`, examples: ['I have hives', 'I broke out in a rash'] },
      { says: `"Allergic reaction", "anaphylaxis" or "anaphylactic".`, examples: ['I think I am having an allergic reaction'] },
      {
        says: `More words for swelling: "mouth", then (within about 15 characters) "swell", "swells", "swelled", "swelling" or "swollen"; "swollen shut"; "throat", "lip", "lips", "tongue" or "face", then (within about 15 characters) "feels", "feel", "felt", "looks", "look", "is", "are", "getting" or "got", plus "huge", "fat", "thick" or "enormous" ("so", "really" or "all" may stand in between); "throat", "lip", "lips", "tongue" or "face", then (within about 15 characters) "twice the size", "twice its size" or "twice their size" (also "normal size").`,
        examples: ['my mouth is swelling', 'eyes swollen shut', 'my lips feel huge'],
      },
      {
        says: `More words for trouble breathing: "labored breathing" or "laboured breathing"; "suffocating", "suffocate" or "suffocated"; "hard", "tough" or "difficult", plus "getting air", "to get air", "time getting air" or "time to get air" ("any" or "enough" may stand before "air"); "I'm choking" or "I am choking", also after "feel like", "feels like" or "feeling like"; "winded" after "get", "getting", "got", "so" or "really".`,
        examples: ['labored breathing', 'I feel like I am choking', 'hard time getting air'],
      },
      {
        says: `"So", "really", "extremely", "insanely" or "unbearably", plus "itchy", then (within about 30 characters, in the same sentence) "can't sleep", "can't stand it", "can't take it", "can't stop scratching", "can't function", "all over" or "everywhere".`,
        examples: ["so itchy I can't sleep"],
      },
    ],
  },
  vision: {
    fp: '1d7ebf12',
    triggers: [
      { says: `"Sudden", "suddenly" or "all of a sudden", then (within about 30 characters) a **vision word**, or "went dark" or "went black".`, examples: ["suddenly I can't see clearly", 'sudden vision loss in one eye'] },
      { says: `A **vision word**, then (within about 30 characters) "sudden", "suddenly" or "all of a sudden".`, examples: ['my vision went blurry all of a sudden'] },
      { says: `"One eye", then (within about 30 characters) a **vision word**, "dark", "black" or "fuzzy".`, examples: ['one eye is blurry'] },
      { says: `"Left eye" or "right eye", then (within about 30 characters) a **cannot-see word**, "dark", "black" or "fuzzy". The word "vision" alone is not enough here.`, examples: ['my right eye is blurry'] },
      { says: `A **cannot-see word**, then (within about 25 characters) "one eye", "left eye" or "right eye".`, examples: ['blurry in my left eye'] },
      {
        says: `"Vision loss"; "loss of vision", "loss of sight" or "loss of eyesight" (also "loss of my ..."); "lost" followed by "vision", "sight" or "eyesight" ("my" or "some", and before that "part of", "some of", "most of", "half of" or "all of", may stand in between: "lost part of my vision"); "losing vision", "losing sight" or "losing eyesight" (also with "my"); "went blind", "going blind" or "gone blind". It does not count when "of my", "of the", "of what", "of why", "of how", "of it", "of that" or "of this" follows ("lost sight of my goals").`,
        examples: ['losing my sight', 'I think I am going blind'],
      },
      {
        says: `"Part", "half", "piece", "some" or "a section", plus "of", plus "vision", "sight", "visual field" or "view" ("my" or "the" may stand before), then (within about 12 characters) "missing", "gone", "dark", "black", "blocked" or "cut off".`,
        examples: ['part of my vision is missing'],
      },
      { says: `"Blind spot". Or "dark" or "black" plus "spot", "curtain", "shadow" or "area", then (within about 20 characters) "vision", "eye" or "sight".`, examples: ['a blind spot', 'a dark curtain over my vision'] },
      {
        says: `"Blurry", "blurred", "blurring", "blurriness", "fuzzy", "hazy", "cloudy", "double" or "foggy", followed by "vision", "eyesight" or "sight". Or "vision", "eyesight" or "sight", then (within about 20 characters) a word that starts with "blur", or "fuzzy", "hazy", "cloudy", "foggy", "double", "doubled", "worse", "worsening", "changed" or "changing".`,
        examples: ['my vision is blurry', 'double vision', 'my eyesight is getting worse'],
      },
      {
        says: `"Vision", "eyesight" or "sight", plus "is", "was", "seems", "feels", "got", "gets", "looks", "has been", "went", "goes", "keeps getting" or "keeps going", plus "off", "weird", "strange", "funny", "messed up", "dim", "dimmer", "dark", "darker", "spotty", "bad" or "terrible" ("a little", "a bit", "kind of", "kinda", "really", "so", "very" or "getting" may stand before that word).`,
        examples: ['my vision seems off'],
      },
      {
        says: `"Eye" or "eyes", then (within about 15 characters) a word that starts with "blur", or "fuzzy", "hazy" or "cloudy". Or "blurry", "blurred", "fuzzy", "hazy" or "cloudy", followed by "eye" or "eyes". Or "everything" plus "looks", "look", "is", "seems", "went" or "got", plus a word that starts with "blur", or "fuzzy" or "hazy" ("so", "really" or "all" may stand in between).`,
        examples: ['my eyes are blurry', 'everything looks fuzzy'],
      },
      {
        says: `"Change", "changes", "changing", "difference" or "decline", followed by "in vision", "in my vision", "in eyesight", "in my eyesight", "in sight" or "in my sight". Or "vision", "eyesight" or "sight", followed by "change", "changes", "problem", "problems", "issue", "issues" or "trouble".`,
        examples: ['changes in my vision', 'vision problems'],
      },
      {
        says: `"Seeing" plus "double", "spots", "floaters", "flashes", "flashing lights", "halos" or "two of everything" (not when "on my" or "on the" follows, as in spots on the skin); "floaters"; "flashes of light"; "trouble seeing", "difficulty seeing", "hard time seeing", "problem seeing" or "problems seeing"; "hard to see"; "can't see" plus "well", "clearly", "right", "straight", "properly" or "out of".`,
        examples: ['seeing double', 'I see floaters', "can't see well out of my left eye"],
      },
      {
        says: `More words for a change in vision: "vision", "eyesight" or "sight", plus "going in and out", "goes in and out", "went in and out" or "cutting in and out" ("keeps" may stand before); "vision comes and goes" (also "eyesight", "sight"); "things", "everything", "lines", "words", "letters" or "text", plus "look", "looks", "looked", "are", "is", "seem", "seems", "went" or "got", plus "wavy", "distorted", "warped" or "double" ("so", "all" or "really" may stand in between); "see double" or "saw double"; "flashing lights"; "can't see" at the end of a sentence, or followed by "at all", "right now" or "a thing"; "can't see anything", but not "can't see anything wrong", "anything different", "anything on", "anything in", "anything about" or "anything that"; "blurry" (also "blury") as a sentence of its own, also as "it's blurry", "its blurry", "things are blurry" or "everything is blurry" ("all", "so", "really" or "very" may stand before "blurry").`,
        examples: ['my vision keeps going in and out', 'things look wavy', "I can't see", 'its all blurry'],
      },
    ],
  },
  hypoglycemia: {
    fp: '9db5fd75',
    triggers: [
      { says: `A word that starts with "hypoglyc" ("hypoglycemia", "hypoglycemic").`, examples: ['I think this is hypoglycemia'] },
      { says: `"Low blood sugar" or "low blood glucose".`, examples: ['low blood sugar'] },
      { says: `"Blood sugar" or "blood glucose", then (within about 15 characters) "low", "dropped", "crash", "crashed", "crashing", "tanked" or "bottomed".`, examples: ['I think my blood sugar is low'] },
      { says: `"Sugar" or "glucose", then "is", "was", "got", "went" or "feels", then "low". "Very", "too", "really", "so" or "super" may stand before "low". It does not count when "normal", "carb", "fat" or "cal" follows "low".`, examples: ['my sugar is really low'] },
      { says: `"Sugar" or "glucose" (with or without "level" or "levels"), then "dropped", "dropping", "crashed", "crashing", "tanked", "plummeted" or "bottomed out" ("has", "have", "just", "is" or "was" may stand in between).`, examples: ['my glucose dropped', 'sugar crashed'] },
      {
        says: `"Low glucose" or "low sugars". Or "a", "my", "another", "having", "had" or "got", followed by "low sugar", unless a word for a food, a drink or a diet follows ("a low sugar yogurt", "a low sugar week").`,
        examples: ['having low sugars a lot', 'I had low sugar this morning'],
      },
      {
        says: `"Sugar", "sugars", "glucose", "BG", "blood sugar" or "blood sugars", plus "is", "are", "was", "were", "got", "went", "feels", "feel", "running", "runs", "ran", "reading", "keeps", "keep" or "kept" (then perhaps "running", "reading", "going", "getting", "dropping" or "trending"), plus "low". "Very", "too", "really", "so", "super", "way too" or "pretty" may stand before "low". It does not count when "normal", "carb", "fat" or "cal" follows "low". Or "hypo" after "a", "having", "had" or "another".`,
        examples: ['my sugars are running low', 'having a hypo'],
      },
      {
        says: `The short ways people with a meter write it: "low BG", "low BGs", "low BGL" or "low blood sugars"; "sugar", "sugars", "BG" or "BGs", followed by "low" (not when "normal", "carb", "fat" or "cal" follows); "went low", "going low", "dropped low" or "dropping low" (not when "on", "carb", "key" or "and slow" follows); "low sugar" at the start of a sentence, when the sentence ends there, a comma follows, or "and", "again", "today", "tonight" or "this" follows; "had a low", "having a low" or "have a low" (also "a bad low", "a scary low", "another low"), but not when "point", "moment", "day", "week", "mood", "bar", "opinion", "tolerance", "carb", "energy", "grade" or "score" follows.`,
        examples: ['low bg this morning', 'sugars low', 'went low last night', 'had a bad low'],
      },
      {
        says: `A reading under 70. "Blood sugar", "blood sugars", "blood glucose", "glucose", "BG", "BGL", "BS", "CGM", "Dexcom", "Libre", "meter", "my sugar" or "my sugars" (or "sugar" or "sugars" when "is", "was", "are", "were", "at", "dropped", "went", "got", "hit", "read", "reads" or "reading" follows), then a number from 10 to 69. These words may stand in between: "is", "was", "were", "at", "of", "read", "reads", "reading", "say", "says", "said", "showed", "shows", "dropped", "went", "down", "got", "to", "hit", "level", "levels", "alarming", "alarmed", "low", "lo", "currently", "now", "just", "only", "about", "around", "like". It does not count when a unit or a time follows the number: "%", "g", "gram", "grams", "carb", "carbs", "mg" (but "mg/dL" counts), "unit", "units", "lb", "lbs", "kg", a decimal point or a colon with a digit after it, minutes, hours, days, weeks, years, "times", "am", "pm", "point", "points". Or "blood sugar", "blood sugars", "sugar", "sugars", "glucose" or "BG", then (within about 15 characters) "in the 20s", "30s", "40s", "50s" or "60s". Or "meter", "CGM", "Dexcom", "Libre" or "reading", plus "read", "reads", "say", "says", "said", "showed", "shows", "is" or "was", plus "LO" or "low".`,
        examples: ['blood sugar 48', 'glucose was 55', 'cgm says 49', 'sugar is in the 40s', 'meter read LO'],
      },
    ],
  },
  dehydration: {
    fp: 'a7464752',
    triggers: [
      {
        says: `A word that says it keeps happening, then (within about 15 characters) a **vomiting word** or a **diarrhea word**. The words: "keep", "keeps", "kept"; "can't stop", "can't quit", "can't I stop", "cannot stop", "cannot quit", "won't stop", "won't quit"; "haven't stopped", "have not stopped", "hasn't stopped", "has not stopped" or "not stopped" (also "stop" in place of "stopped", and "been able to stop"); "still"; "constant", "constantly"; "nonstop"; "over and over"; "again and again"; "repeatedly".`,
        examples: ['I keep throwing up', 'constant diarrhea', "why can't I stop throwing up", 'still vomiting'],
      },
      { says: `A **vomiting word** or a **diarrhea word**, then (within about 25 characters) a **long-or-often phrase**.`, examples: ["I've been throwing up all day", 'threw up 6 times today', 'diarrhea nonstop since last night'] },
      {
        says: `"Can't", "cannot", "can not", "couldn't", "could not", "unable to", "not able to", "haven't been able to", "have not been able to" or "hasn't been able to", then "keep" or "hold" ("even" may stand before), then what will not stay down, then "down". What will not stay down: "anything", "any thing", "nothing", "water", "fluid", "fluids", "liquid", "liquids", "food", "meds", "medication", "pills", "dinner", "lunch", "breakfast" or "a thing"; small words may stand before it ("even", "a", "any", "my", "the", "sips of", "bit of", "drop of", "bite of", "little"), and "or" plus one more word after it ("water or food"). Or "keep down" or "hold down", followed by "anything", "any thing", or "water", "fluids", "liquids" or "food" ("any" may stand before).`,
        examples: ["can't keep water down", "I can't keep any fluids down", "can't hold anything down", "can't keep down any food"],
      },
      { says: `"Nothing stays down", "nothing will stay down" or "nothing is staying down".`, examples: ['nothing stays down'] },
      {
        says: `A **vomiting word** followed by "water", "everything I drink", "everything I eat", "whatever I drink" or "whatever I eat" (also "every thing"). "Up", and "even", "just" or "plain", may stand in between.`,
        examples: ['throwing up even water', 'vomiting everything I drink'],
      },
      {
        says: `"Even water", "even sips" or "even sips of water", or "everything", "every thing", "anything" or "whatever" plus "I eat", "I drink", "I eat or drink" or "I swallow"; then (within about 20 characters) "comes up", "come up", "came up" (also "back up" or "right up" in place of "up"), or a **vomiting word**.`,
        examples: ['everything I eat comes back up', 'even water comes right up'],
      },
      { says: `"Haven't", "have not", "hasn't", "didn't" or "did not", followed by "peed", "pee", "urinated", "urinate" or "been able to pee" ("really" may stand in between).`, examples: ["I haven't peed all day"] },
      { says: `"No", "barely any", "hardly any", "very little" or "almost no", followed by "pee" or "urine".`, examples: ['very little urine today'] },
      { says: `"Barely" or "hardly", followed by "peeing", "pee", "peed", "urinating", "urinate" or "urinated".`, examples: ['barely peeing'] },
      { says: `"Peeing" or "urinating", followed by "little", "very little" or "so little".`, examples: ['peeing very little'] },
      { says: `"Not peeing" or "not urinating", followed by "much", "a lot" or "at all".`, examples: ['not peeing much'] },
      { says: `"Peeing" or "urinating", followed by "less", "much less", "a lot less" or "way less".`, examples: ['peeing a lot less than usual'] },
      { says: `"Can't pee" or "can't urinate".`, examples: ["I can't pee"] },
      { says: `"Stand up", "stands up", "standing up", "stood up", "get up", "getting up", "got up" or "standing", then (within about 25 characters) a **dizzy phrase**.`, examples: ['when I stand up I get dizzy', 'got up and everything went black'] },
      { says: `A **dizzy phrase**, then (within about 25 characters) "when", "whenever", "every time", "each time", "if", "after" or "as soon as", then "I stand", "I stood", "I get" or "I got".`, examples: ['dizzy when I stand up', 'lightheaded every time I get up'] },
      { says: `A **nausea word**, then (within about 30 characters) a **does-not-go-away phrase**.`, examples: ["nausea that won't go away", 'nauseous for 4 days'] },
      { says: `"Constant", "constantly", "nonstop", "persistent" or "never-ending", then (within about 12 characters) a **nausea word**.`, examples: ['constantly nauseous'] },
      { says: `A **vomiting word** or a **diarrhea word**, then (within about 30 characters) a **does-not-go-away phrase**.`, examples: ['diarrhea that does not go away', "vomiting that won't go away"] },
      { says: `A **severe word**, then (within about 12 characters) a **nausea word**, a **vomiting word** or a **diarrhea word**.`, examples: ['severe nausea', 'really bad diarrhea'] },
      {
        says: `A **nausea word**, a **vomiting word** or a **diarrhea word**, then (within about 15 characters) "is", "are", "was", "got", "getting" or "been", plus "severe", "unbearable", "awful", "terrible", "horrible", "intense", "out of control", "so bad" (also "really", "very", "extremely", "super" or "real" bad) or "the worst".`,
        examples: ['the diarrhea is out of control'],
      },
      {
        says: `"Dizzy", "dizziness", "lightheaded" (also "light-headed", "light headed", "lightheadedness"), "woozy" or "vertigo". It does not count when a **slight word** stands right before it ("a little dizzy"), or when "a bit", "a little", "a little bit", "a tad" or "slightly" follows. Or "room", "everything" or "head", plus "spinning" ("is", "was", "keeps" or "started" may stand in between).`,
        examples: ['feeling dizzy', 'the room is spinning'],
      },
      {
        says: `"Dehydrated" after "so", "very", "really", "severely", "badly", "super", "extremely" or "pretty", or after "I'm", "I am", "I think I'm", "feel", "feeling", "felt", "got" or "getting". Or "severe dehydration". Or "dehydrated" alone, as a sentence of its own.`,
        examples: ["I think I'm dehydrated", 'Dehydrated.'],
      },
      {
        says: `A count of days, without "for". A **vomiting word** or a **diarrhea word**, then (within about 15 characters) a **count of days**, but not when "ago" follows. Or a **count of days**, "a week" or a **day number**, then "of" or "with" ("now" may stand before), then a **vomiting word** or a **diarrhea word** ("the", "constant" or "nonstop" may stand in between). Or a **vomiting word** or a **diarrhea word**, then (within about 20 characters, any words of the same sentence except "on") a **day number**, but not when "of", "after", "post", "since" or "on" follows it.`,
        examples: ['vomiting 3 days', 'day 3 of throwing up', 'puking again, 4th day in a row'],
      },
      {
        says: `The same for nausea. A **nausea word**, then (within about 15 characters) a **count of days**, but not when "ago" follows. Or a **count of days**, "a week" or a **day number**, then "of" or "with" ("now" may stand before), then a **nausea word** ("the", "constant" or "nonstop" may stand in between). Or a **nausea word**, then (within about 25 characters, any words of the same sentence except "on") a **day number**, but not when "of", "after", "post", "since" or "on" follows it. Or "so" or "too" plus a **nausea word**, then (within about 10 characters) "can't" plus "function", "work", "eat", "drink", "sleep", "move", "stand" or "get out of bed".`,
        examples: ['nauseous 4 days now', "so nauseous I can't function"],
      },
      { says: `A **vomiting word** or a **diarrhea word**, then (within about 30 characters, any words of the same sentence) "still going", "still happening", "still at it" or "still sick".`, examples: ['vomiting and diarrhea, still going'] },
      {
        says: `A **vomiting word**, a **diarrhea word** or a **nausea word**, then (within about 40 characters, any words of the same sentence) "can't", "cannot", "can not", "couldn't" or "unable to", plus "drink" or "eat or drink" ("even" may stand in between), plus "anything", "any thing", "water", "fluid", "fluids", "liquid" or "liquids".`,
        examples: ["throwing up and can't even drink water"],
      },
    ],
  },
  gallbladder: {
    fp: '881aff69',
    triggers: [
      { says: `A word that starts with "jaundice".`, examples: ['jaundice'] },
      { says: `"Yellow", "yellowing" or "yellowish", followed by "skin", "eye", "eyes", "eyeball" or "eyeballs" ("of", "my" or "the" may stand in between).`, examples: ['yellowing of my skin', 'yellow eyes'] },
      {
        says: `"Skin", "eye", "eyes" or "whites of my eyes" or "whites of the eyes", then one or two of these words: "is", "are", "has", "have", "look", "looks", "turned", "turning", "got", "getting", "went", "going", "gone", "seem", "seems"; then "yellow" ("a bit", "a little", "kind of", "slightly", "really" or "very" may stand before "yellow").`,
        examples: ['my eyes look yellow', 'my skin is turning yellow', 'my skin has turned yellow'],
      },
      { says: `A **pain or soreness word**, then (within about 30 characters) an **upper-right phrase**.`, examples: ['pain in my upper right abdomen', 'pain under my right ribs'] },
      { says: `An **upper-right phrase**, then (within about 30 characters) a **pain or soreness word**.`, examples: ['my upper right side hurts', 'right rib cage is sore'] },
      { says: `"Right upper pain" or "right upper abdominal pain".`, examples: ['right upper abdominal pain'] },
      {
        says: `A **pain or soreness word**, then (within about 30 characters) "upper", "top of my" or "upper part of my" (also "the" for "my") and a **stomach word** ("middle", "central", "mid", "left" or "right" may stand before it). Or "upper" and a **stomach word** first ("middle", "central", "mid", "left" or "right" may stand in between), then (within about 30 characters) a **pain or soreness word**.`,
        examples: ['pain in my upper stomach', 'upper abdominal pain after I eat'],
      },
      {
        says: `A **pain or soreness word**, then (within about 25 characters) "under", "below", "beneath" or "behind", plus "rib", "ribs", "rib cage", "breastbone" or "sternum" ("my" or "the" may stand before). Or those words first, then (within about 25 characters) a **pain or soreness word**.`,
        examples: ['sore right under my ribs'],
      },
      {
        says: `"I'm", "I am", "I look", "I looked", "I turned", "I'm looking" or "I'm turning", followed by "yellow" or "jaundiced" ("a bit", "a little", "kind of", "kinda", "really" or "so" may stand in between). Or "is my" or "are my", plus "skin", "eye", "eyes" or "face", plus "yellow" ("so", "turning", "looking", "a bit" or "kind of" may stand in between). Or "skin", "eye", "eyes" or "face", then (within about 20 characters) "yellow" or "yellowish" plus "tint", "tinge", "color", "colour", "hue" or "look"; or those words first, then (within about 20 characters) "skin", "eye", "eyes" or "face".`,
        examples: ['I look yellow', 'why are my eyes yellow', 'my skin has a yellow tint'],
      },
      {
        says: `"Fever", "fevers" or "feverish". Not "hay fever", "cabin fever", "spring fever", "scarlet fever", "gold fever", "dance fever", "disco fever", "jungle fever", "baby fever" or "Saturday night fever", and not "fever dream", "fever pitch", "fever blister", "fever tree", "fever excitement" or "fever pace". Or "running", "have", "having", "had", "got", "spiked" or "spiking", followed by "a temp" or "a temperature". Or "temp" or "temperature" with a number from 100 to 109, or from 38 to 41 (one decimal may follow: "101.2"); "is", "was", "of", "at", "hit", "reached", "up to", "went to" or "went up to" may stand in between.`,
        examples: ['I have a fever', 'my temp is 101.2'],
      },
      {
        says: `"Clay", "pale", "light", "gray", "grey", "white", "whitish", "chalky" or "putty" (with or without "colored" or "coloured", also joined with a hyphen), followed by "stool", "stools", "poop", "poops", "poo", "bowel movement", "bowel movements", "BM" or "BMs". Or one of those words for stool first, then (within about 20 characters) "clay", "pale", "light-colored", "light colored", "light in color", "gray", "grey", "white", "whitish", "chalky" or "putty". Or "pooping" or "pooped" (also "pooping out"), followed by "clay", "pale", "light", "gray", "grey", "white", "whitish" or "chalky".`,
        examples: ['clay colored stools', 'my poop is pale'],
      },
      { says: `"Gallstone" or "gallstones" (also written "gall stones"). Or "gallbladder" (also "gall bladder") followed by "attack", "pain", "problem", "problems", "issue", "issues" or "infection".`, examples: ['I think I have gallstones'] },
    ],
  },
  thyroid: {
    fp: '537296aa',
    triggers: [
      {
        says: `"Lump", "bump", "swelling", "mass", "nodule", "knot" or "growth", then (within about 15 characters) "in", "on", "at", "around", "under" or "near", plus "neck" ("my" or "the" may stand before). The front, side, left side, right side, base, back or bottom of the neck counts too ("a lump on the side of my neck").`,
        examples: ['lump in my neck', 'a swelling on the front of my neck', 'a hard lump at the base of my neck'],
      },
      { says: `"Neck" followed by "lump", "swelling", "swollen", "mass" or "nodule" ("is", "looks" or "feels" may stand in between).`, examples: ['my neck is swollen'] },
      {
        says: `"Trouble", "difficulty", "difficult", "hard time", "problem", "problems", "issue", "issues", "hard", "harder", "tough", "can't", "cannot", "can barely", "can hardly", "unable to", "struggle", "struggles" or "struggling", followed by a word that starts with "swallow" ("to" or "with" may stand in between). It does not count when it is said of a pill (section 2.3).`,
        examples: ['trouble swallowing', "it's hard to swallow"],
      },
      {
        says: `"Hoarse", "hoarseness", "raspy" or "lost my voice", then (within about 30 characters) words that say it has lasted: "for weeks" or "for months" (also with a count: "for 3 weeks", "for a few months", "for several weeks", "for a couple of weeks", "for two weeks", "for three weeks"); "for a long time", "for a while", "for a month" or "for ages"; "won't", "doesn't", "isn't" or "not", followed by "go away", "going away", "getting better" or "improving"; "still"; "all the time"; "constantly".`,
        examples: ['my voice has been hoarse for weeks', "hoarse and it won't go away"],
      },
      { says: `"For weeks", "for months", "for a long time", "still", "always" or "constantly", then (within about 25 characters) "hoarse" or "raspy".`, examples: ['still hoarse'] },
      {
        says: `"Hoarse", "hoarseness", "raspy", "croaky", "lost my voice" or "losing my voice". Or "voice" followed by "hoarse", "raspy", "croaky", "gone", "scratchy", "going", "going out", "almost gone", "different", "changed", "deeper", "weird" or "strange" ("is", "has been", "sounds", "sound", "got", "keeps getting" or "went" may stand in between). It does not count when a **slight word** stands right before it ("a little hoarse").`,
        examples: ['my voice is hoarse', 'I lost my voice', 'my voice sounds different'],
      },
      {
        says: `Trouble swallowing in other words. "Swallowing" plus "is", "feels", "got", "has been", "was" or "has gotten", plus "hard", "harder", "difficult", "tough" or "a struggle" ("really", "so", "very" or "getting" may stand in between). Or "food", "drink", "drinks", "water", "liquid" or "liquids", plus "gets", "get", "got", "keeps getting", "keep getting", "is getting", "feels", "feel", "keeps" or "keep", plus "stuck" or "sticking". Or "food" or "water", plus "sticks in my throat" or "stick in my throat". Or "hard", "harder", "tough", "difficult", "trouble", "can't", "cannot", "struggle", "struggles" or "struggling", plus "to get", "get", "getting" or "time getting", plus "food", "anything", "water", "liquid", "liquids", "meal" or "meals" ("my" may stand before), plus "down". Or "choke", "chokes", "choked" or "choking", followed by "on" and "food", "water", "drink", "drinks", "liquid", "liquids", "saliva", "spit", "everything", "anything", "meal", "meals", "dinner", "lunch", "breakfast", "bite" or "bites" ("my" or "the" may stand in between), or by "when I eat", "when I drink" or "when I swallow".`,
        examples: ['swallowing is getting harder', 'food keeps getting stuck', 'choking on my food'],
      },
      {
        says: `"Swollen", "lumpy", "enlarged" or "bulging", followed by "neck" or "thyroid". Or "lump", "bump", "mass", "nodule", "knot" or "growth", then (within about 15 characters) "in thyroid", "on thyroid", "in my thyroid" or "on my thyroid". Or "swollen glands", "swollen gland", "swollen nodes", "swollen node", "swollen lymph nodes" or "swollen lymph node", then (within about 15 characters) "neck". Or "goiter" or "goitre".`,
        examples: ['swollen glands in my neck', 'a nodule on my thyroid'],
      },
      {
        says: `"Swollen", "swelling", "puffy" or "enlarged", then (within about 25 characters) "front of", "side of" or "base of", plus "neck" ("my" or "the" may stand before "neck"). Or "neck" or "thyroid", plus "is", "feels", "looks", "seems" or "got", plus "swollen", "puffy", "enlarged", "thick", "bigger" or "lumpy" ("so", "really", "a bit", "kind of" or "a little" may stand in between). Or "lump", "bump", "mass" or "knot", then (within about 15 characters) "in my throat" (also "in my throat area"), then (within about 25 characters) a **does-not-go-away phrase** or "when I swallow".`,
        examples: ['swelling at the front of my neck', 'my neck feels swollen', "a lump in my throat that won't go away"],
      },
    ],
  },
  pregnancy: {
    fp: '1f813db3',
    triggers: [
      { says: `Any word that starts with "pregnan" ("pregnant", "pregnancy").`, examples: ['I am pregnant', 'I think I might be pregnant'] },
      { says: `"Breastfeed", "breast-feed" or "breast feed", with any ending ("breastfeeding").`, examples: ['I am breastfeeding'] },
      { says: `"Lactating".`, examples: ['I am lactating'] },
      { says: `"Nursing" followed by "my", "the", "a" or "our" and "baby", "son", "daughter", "newborn", "infant" or "little one".`, examples: ['nursing my baby'] },
      { says: `"Trying to conceive", "trying for a baby" or "trying to have a baby".`, examples: ['trying for a baby'] },
      { says: `"TTC".`, examples: ['TTC since March'] },
      { says: `"Conceive" or "conceiving".`, examples: ['hoping to conceive soon'] },
      { says: `"Expecting a baby" or "expecting twins".`, examples: ['expecting a baby in May'] },
    ],
  },
  procedure: {
    fp: '7446ef86',
    triggers: [
      { says: `"Surgery" or "surgeries".`, examples: ['I have surgery on Friday'] },
      { says: `"Operation" after "an", "my", "the", "for", "having", "have" or "need".`, examples: ['I need an operation'] },
      { says: `"Anesthesia", "anesthetic" or "anesthesiologist" (also in the British spelling).`, examples: ['going under anesthesia tomorrow'] },
      { says: `"Sedation" or "sedated".`, examples: ['I will be sedated for it'] },
      { says: `"Endoscopy", "colonoscopy" or "gastroscopy" (also in the plural).`, examples: ['colonoscopy next week', 'endoscopy scheduled for Monday'] },
    ],
  },
  contraception: {
    fp: 'b9c2c9a0',
    triggers: [
      { says: `"Birth control pill" or "birth control pills".`, examples: ["I'm on birth control pills"] },
      { says: `"Contraceptive pill" or "contraceptive pills".`, examples: ['I take a contraceptive pill'] },
      { says: `"Oral contraceptive" or "oral contraception".`, examples: ['I take an oral contraceptive'] },
      { says: `"On", "taking", "take", "started", "use" or "using", followed by "the pill".`, examples: ["I'm on the pill"] },
    ],
  },
  eating_too_little: {
    fp: 'ac8d1cf4',
    triggers: [
      { says: `A **not-eating phrase**, then (within about 25 characters) a **days phrase**.`, examples: ["haven't eaten in 3 days", 'I have barely eaten for the past four days'] },
      { says: `A **days phrase**, then (within about 30 characters) a **not-eating phrase**.`, examples: ["for the last few days I can't eat anything"] },
    ],
  },
  abdominal_pain_severe: {
    fp: 'd9bab65c',
    triggers: [
      { says: `A **stomach word** and a **pain word**, then (within about 30 characters) a **does-not-go-away phrase**.`, examples: ["stomach pain that won't go away", 'my stomach has hurt for 5 days'] },
      { says: `A **pain word**, then "in", "around" or "across" and a **stomach word**, then (within about 30 characters) a **does-not-go-away phrase**.`, examples: ['pain in my belly for 3 days'] },
      { says: `"Constant", "nonstop", "persistent", "lingering", "ongoing", "continuous", "never-ending" or "unrelenting", then (within about 12 characters) a **stomach word** joined to a **pain word**.`, examples: ['constant stomach pain'] },
      {
        says: `A **severe word**, then (within about 12 characters) "constipation", "constipated", "bloating", "bloated", "heartburn", "acid reflux", "reflux", "indigestion", "gas pain", "gas pains", or a **stomach word** plus "problem", "problems", "issue", "issues", "trouble", "troubles" or "upset".`,
        examples: ['severe constipation', 'severe stomach problems'],
      },
      {
        says: `"Constipation", "bloating", "heartburn", "acid reflux", "reflux", "indigestion", "gas pain", "gas pains", or a **stomach word** plus "problem", "problems", "issue", "issues", "trouble" or "troubles"; then (within about 20 characters) a **how-bad phrase**.`,
        examples: ['stomach problems that are severe', 'my heartburn is terrible'],
      },
      {
        says: `A **stomach word**, "digestive" or "GI", plus "problem", "problems", "issue", "issues", "trouble", "troubles" or "upset"; or "upset" plus a **stomach word**; or "constipated", "constipation", "bloated", "bloating", "heartburn", "acid reflux", "reflux" or "indigestion". Then (within about 30 characters) a **does-not-go-away phrase**.`,
        examples: ['stomach problems that will not go away', 'constipated for a week'],
      },
      {
        says: `A **vomiting word** followed by "blood" ("up", and "bright red", "a lot of", "some" or "dark", may stand in between). Or "pooping" or "pooped", followed by "blood" (the same words may stand in between). Or "blood", then (within about 15 characters) "in" or "with", plus "vomit", "puke", "throw up", "throwup", "stool", "stools", "poop", "poo", "bowel movement", "bowel movements", "BM" or "diarrhea" ("my" or "the" may stand before).`,
        examples: ['vomited blood', 'blood in my stool'],
      },
      {
        says: `"Bloody", "black", "tarry", "black tarry", "black and tarry" or "maroon", followed by "stool", "stools", "poop", "poops", "poo", "vomit", "diarrhea", "bowel movement" or "bowel movements". Or "stool", "stools", "poop", "poops", "poo", "vomit" or "puke", then (within about 15 characters) "is", "was", "are", "were", "looks", "look" or "looked", plus "black", "bloody", "tarry" or "like coffee grounds".`,
        examples: ['black tarry stool', 'my poop is black'],
      },
      {
        says: `A **stomach word**, plus "has been", "have been", "is", "was", "'s been", "s been" or "been", plus "a mess", "a wreck" or "a disaster" (also "a total ..." or "a complete ..."), "messed up", "wrecked", "off", "upset", "acting up", "bothering me", or "giving me trouble", "giving me problems", "giving me issues" or "giving me fits"; then (within about 30 characters) a **does-not-go-away phrase**.`,
        examples: ['my stomach has been a mess for 3 weeks', "stomach has been messed up and it's not getting better"],
      },
      {
        says: `No bowel movement for 4 days or more. "Haven't", "have not", "hasn't", "has not", "didn't", "not" or "no", followed by "pooped", "poop", "gone to the bathroom", "gone number 2", "gone number two", "gone poop", "bowel movement", "bowel movements", "BM" or "BMs" ("had a", "had any", "been able to" or "really" may stand in between). Then (within about 15 characters) "in" or "for", plus one of: 4 to 9 days, or any number of days with two or more digits; "four" to "ten", "several" or "many" days; "a week"; a number, "two", "three", "a few" or "several" weeks. "Over", "almost", "about", "like", "more than" or "nearly" may stand before the count.`,
        examples: ["haven't pooped in 5 days", 'no bowel movement for a week'],
      },
      {
        says: `"Can't pass gas" or "can't fart" ("even" may stand in between). Or "not" or "unable to", plus "pass gas" or "passing gas". Or a **stomach word**, then (within about 20 characters) "rock hard", "hard as a rock", "distended", "so swollen", "swollen and hard", "swollen and hurts", "swollen and painful", "swollen and tight" or "hard and swollen".`,
        examples: ["can't pass gas", 'my belly is rock hard'],
      },
      {
        says: `A **vomiting word**, then (within about 20 characters) "food", "stuff", "meal", "meals", "dinner", "lunch", "breakfast" or "what", then (within about 15 characters) "from", "I ate" or "I had", plus "yesterday", "last night", "the day before" or "days ago", or a number, "two", "three", "a few" or "several" plus "days ago".`,
        examples: ['throwing up food from yesterday', 'vomiting what I ate 2 days ago'],
      },
      { says: `"Gastroparesis"; "bowel obstruction", "bowel blockage", "intestinal obstruction" or "intestinal blockage"; "stomach paralysis"; "paralyzed stomach" or "paralysed stomach".`, examples: ['I think I have gastroparesis'] },
      {
        says: `"Extremely", "severely", "incredibly", "painfully", "unbearably" or "insanely", followed by "bloated", "constipated", "backed up" or "gassy". Or "constipation", "bloating", "heartburn", "acid reflux", "reflux", "indigestion", "gas pain" or "gas pains", followed by "so bad". Or a **severe word** followed by "cramp", "cramps" or "cramping", but not when "in" and a leg, calf, calves, foot, feet, toe, toes, hand, hands, thigh, thighs, arm or arms follows ("severe cramps in my legs").`,
        examples: ['extremely bloated', 'severe cramps'],
      },
    ],
  },
};

/** The self-harm rule is one pattern with many alternatives. It has no check for "no" or "not". */
const CRISIS_GLOSS = {
  fp: '4f7956a7',
  says: [
    `A word that contains "suicid" ("suicide", "suicidal"). Misspellings such as "sucide" or "suiside" are read as this word first (2.3).`,
    `"Kill myself", "killing myself" or "killed myself" (also "my self"). "Off myself" after "to", "gonna", "wanna", "will", "could", "should" or "might". "Unalive".`,
    `"End my life", "ending my life", "take my life", "taking my life" (also "my own life").`,
    `"Want to die", "wanted to die", "wanna die".`,
    `"Wish I was dead", "wish I were dead", "better off dead", "better off without me".`,
    `"Don't want to live", "do not want to live", "don't want to be alive", "do not want to be alive".`,
    `"No reason to live", "no point to live", "no reason in living", "no point in living". "Don't", "do not", "can't" or "cannot", plus "see the point", "see a point" or "see any point", plus "in", "of" or "to", plus "living", "life", "going on", "being here" or "being alive". "What's the point in" or "what's the point of", plus "living", "life" or "going on".`,
    `"Life isn't worth living", "life is not worth living", "life isn't worth it", "life is not worth it", "not worth living".`,
    `"Want to", "wanted to", "going to", "thinking about", "thinking of", "thoughts of", "urge to", "try to", "tried to", "trying to", "attempt to", "attempted to" or "attempting to", followed by "hurt myself", "harm myself" or "kill myself" (also "hurting", "harming", "killing"). "Self-harm", "self harm", "selfharm".`,
    `"Cutting myself", but not "cutting myself off", "cutting myself some slack", "cutting myself shaving", "cutting myself a slice" or "cutting myself a piece". "Cut myself", "hurt myself", "harm myself", "harmed myself", "burn myself", "burned myself" or "burnt myself" (also "my self"), followed by "on purpose", "deliberately" or "intentionally"; or those three words first, then "cut", "hurt", "harmed" or "burned", plus "myself".`,
    `"Pills on purpose". "Overdose", "overdosed" or "overdosing", followed by "on purpose".`,
    `"End it all", "ending it all".`,
    `"Don't want to", "do not want to", "don't wanna" or "do not wanna", plus "be here", "be around" or "be alive", followed by "anymore", "any more", a punctuation mark or the end of the text.`,
    `"Want to", "wanted to", "wanna", "going to", "gonna", "thinking about", "thinking of" or "ready to", followed by "end it", "end things", "ending it" or "ending things".`,
    `"Want to disappear forever".`,
    `"Can't go on", "cant go on" or "cannot go on", followed by a punctuation mark or the end of the text, also with "like this", "anymore", "any more", "living", "any longer" or "much longer" in between. With any other word after it it does not count, so "I can't go on like this anymore" does not.`,
  ],
  note: `None of these words needs to stand alone: they are found also inside longer words and phrases. "I want to diet" contains "want to die", "blend it all" contains "end it all", "taking my life back" contains "taking my life", and each of these raises the support card (checked).`,
  noteExamples: ['I want to diet', 'blend it all together', 'taking my life back'],
  examples: [
    'thinking about suicide',
    'I want to kill myself',
    'I want to end my life',
    'I want to die',
    'I wish I were dead',
    "I don't want to live anymore",
    'there is no reason to live',
    "I can't see the point of living",
    'life is not worth living',
    'thoughts of hurting myself',
    'I cut myself on purpose',
    'I took pills on purpose',
    'I want to end it all',
    "I don't want to be here anymore",
    'thinking of ending things',
    'I want to disappear forever',
    "I can't go on like this",
  ],
};

/** Marks, in section 2.4, a pattern whose hits show the fixed card also where each rule shows its own card. */
const FIXED_MARK = '*(Fixed card: see 2.3.)*';

/**
 * The misspellings that triage.ts reads as the word that was meant (EN_SPELLING), in plain words,
 * in the order of the code. `fp` ties the words to that list.
 */
const SPELLING_GLOSS = {
  fp: 'c2a88ff9',
  says: [
    `"passd out", "pased out" and "past out" (but not "past out of"), and "passed-out", are read as "passed out";`,
    `"fanted", "fainetd", "faintd" and "feinted" as "fainted";`,
    `"lost conscience" and "lost my conscience" as "lost consciousness"; "conciousness", "consiousness", "conciousnes", "consciousnes" and "conscousness" as "consciousness"; "unconcious" and "unconsious" as "unconscious";`,
    `"chestpain" and "chestpian" (also with "s") as "chest pain"; "chess", "cheat", "chset", "chets", "chst" or "cehst" followed by "pain", "pains", "pian", "hurt", "hurts", "tightness" or "pressure" as "chest" plus that word; "chest pian", "chest pane" and "chest paim" as "chest pain"; "chset", "chets" and "cehst" as "chest"; "pian" as "pain";`,
    `"tounge", "toungue", "tonuge", "tongu" and "tung" as "tongue"; "swolen" (and other spellings with one or more "l") as "swollen"; "sweling" (the same) as "swelling"; "throte", "throath", "thoat" and "troat" as "throat"; "breth", "brethe" and "brething" as "breath", "breathe" and "breathing";`,
    `"vomitting", "vommiting" (and other spellings with one or more "m" and "t") as "vomiting", and the same for "vomited"; "throwin" and "pukin" as "throwing" and "puking";`,
    `"diarrhea" written with letters missing, doubled or changed ("diarea", "diarhea", "dyarea", "diarrhia") as "diarrhea"; "naseous", "nasious", "nautious", "nauseas", "nauscious", "nausous", "nasueous", "nauesous" and "nauseaous" as "nauseous"; "nausia", "nasea", "nausa", "nausua" and "nausae" as "nausea";`,
    `"servere", "sevre", "sevear", "seveer", "severre" and "sevier" as "severe"; "sever" as "severe" when a word that starts with one of these follows: "pain", "stomach", "abdom", "abd", "belly", "tummy", "nause", "vomit", "diarr", "rash", "itch", "cramp", "head", "constip", "bloat", "heartburn", "chest", "dizz", "allerg", "reaction", "swell", "dehydr";`,
    `"shakey" as "shaky"; "bloodsugar" and "bloodsugars" as "blood sugar" and "blood sugars"; "vission", "visoin" and "vison" as "vision";`,
    `"sucide", "sucidal", "suiside", "suicde", "siucide" and the like ("s", then "u", "ui" or "iu", then "c" or "s", perhaps "i", then "de" or "dal") as "suicide" or "suicidal";`,
    `"horse" before "voice" or "throat", and "horse" after "voice" plus one to three of the words "is", "sound", "sounds", "got", "went", "has been", "feels", "still", "so", "really", "very", "all", "a little" and "kinda" ("voice is so horse"), as "hoarse"; "horsness", "hoarsness" and "horseness" as "hoarseness";`,
    `"hivs" as "hives"; "pancriatitis", "panreatitis", "pancreatatis", "pancreatitus" and the like as "pancreatitis"; "siezure", "seisure", "seizer" and "seziure" (also with "s") as "seizure"; "dizy" as "dizzy"; "diziness", "dizyness" and "dizzyness" as "dizziness";`,
    `"stomac", "stumach", "stomich", "stomack", "stomch" and "stomahc" as "stomach"; "abdomin" as "abdomen".`,
  ],
};

/** The sign groups of the low-blood-sugar rule: `signs` in the order of EN_LOW_SUGAR_SIGNS, `common` in the order of EN_LOW_SUGAR_COMMON. */
const SIGN_GLOSS = {
  fp: '48ed649c',
  signs: [
    { says: `Shakiness: "shaky", "shaking", "shakes", "shakiness", "tremble", "trembles", "trembling", "tremor", "tremors", "jittery", "jitters". Not "protein shakes", "milk shakes" or "meal replacement shakes".`, example: 'I feel shaky' },
    { says: `Sweating: "cold sweat", "cold sweats", "clammy", "sweaty", "sweating", "drenched in sweat".`, example: 'in a cold sweat' },
    { says: `Fast heartbeat: a word that starts with "palpitat"; "heart" or "pulse" plus "racing", "pounding", "fluttering" or "beating fast"; "racing", "pounding", "fast" or "rapid" plus "heart", "heartbeat" or "pulse".`, example: 'my heart is racing' },
    { says: `Confusion or drowsiness: a word that starts with "confus"; "disoriented"; "dazed"; "drowsy", "drowsiness"; "can't think straight".`, example: 'I feel confused' },
    { says: `Dizziness or light-headedness: "dizzy", "dizziness", "lightheaded" (also "light-headed", "light headed", "lightheadedness"), "woozy".`, example: 'so dizzy' },
    { says: `Blurred vision: "blurry" or "blurred" plus "vision", "eyesight" or "sight"; "vision", "eyesight" or "sight" plus "blurry" or "blurred" ("is", "was", "got", "went" or "gets" may stand in between); "seeing double".`, example: 'blurred vision' },
    { says: `Slurred speech: "slurred", "slurring", "slurry"; "can't talk" or "can't speak" plus "right", "properly", "straight" or "clearly".`, example: 'slurred speech' },
  ],
  commonFp: '1c3ed2e0',
  common: [
    { says: `Weakness: "weak", "weakness".`, example: 'I feel weak' },
    { says: `Headache: "headache", "headaches", "migraine", "migraines", "head hurts", "head is pounding", "head is killing me", "head aches".`, example: 'a headache' },
    { says: `Hunger: "hungry", "hunger", "starving", "ravenous", "famished".`, example: 'so hungry' },
    { says: `Anxiety, irritability or mood changes: "anxious", "anxiety", "irritable", "irritability", "mood swing", "mood swings", "mood change", "mood changes", "moody".`, example: 'irritable' },
  ],
  examples: ['shaky and in a cold sweat', 'heart racing and I feel confused', 'shaky and hungry', 'sweating and a headache'],
  /** One sign alone, and two of the common ones alone: quiet. */
  quiet: ['feeling shaky after coffee', 'so hungry today', 'hungry with a headache', 'weak and hungry before lunch'],
};

interface WordList {
  name: string;
  label: string;
  /** Written by hand for lists that are more than a plain list of words; then `fp` ties it to the code. */
  says?: string;
  fp?: string;
}

const WORD_LISTS: WordList[] = [
  { name: 'EN_SEVERE', label: 'severe word' },
  { name: 'EN_BELLY', label: 'stomach word' },
  { name: 'EN_HURT', label: 'pain word' },
  { name: 'EN_SORE', label: 'pain or soreness word' },
  { name: 'EN_VOMIT', label: 'vomiting word' },
  {
    name: 'EN_RUNS',
    label: 'diarrhea word',
    fp: '8ef4dbb8',
    says: `"diarrhea", also spelled "diarrhoea" or with letters missing or doubled ("diarrea", "diarhea", "diarreah"); "the runs"; "the squirts"; "loose", "watery" or "liquid" plus "stool", "stools", "poop", "poops", "bowel movement" or "bowel movements"; "pooping water", "pooping liquid". Other misspellings of "diarrhea" are read as the word first (2.3).`,
  },
  { name: 'EN_NAUSEA', label: 'nausea word', fp: 'f5c90133', says: `"nausea", "nauseous", "nauseated" (also misspelled "nausious", "nauseus", "nasuea"); "queasy", "queasiness"; "sick to my stomach".` },
  {
    name: 'EN_WONT_GO_AWAY',
    label: 'does-not-go-away phrase',
    fp: '13211070',
    says: `"won't", "will not", "doesn't", "does not", "don't", "do not", "didn't", "isn't", "is not", "hasn't", "has not", "haven't", "have not", "ain't", "not" or "never" (the apostrophe may be left out: "wont", "doesnt"), followed by "go away" (also "goes", "going", "gone away"), "stop" (also "stops", "stopped", "stopping"), "let up" or "letting up", "ease", "eased" or "easing" (also with "up"), "quit" or "quitting", "end", "ended" or "ending", "slow down" (also "slowed", "slowing"), "better" ("get better", "getting better", "gotten better", "any better"), or "improve", "improved" or "improving"; "been able to" or "seem to" may stand in between ("hasn't been able to stop", "doesn't seem to go away"). "Still there", "still here", "still going", "still the same". "Constant", "constantly", "nonstop", "persistent", "never-ending". "All the time". "Day and night". "Every day", "every single day". "For days" or "for weeks", with or without a count ("for 3 days", "for a few weeks", "for many days", "for a couple of weeks"). "For a week", "for over a week", "for more than a week", "for about a week", "for almost a week", "for the past week", "for the last week", "for the whole week", "for the entire week". "All week". A count of days plus "straight", "in a row", "now" or "running" ("3 days straight"). "Been 3 days" (also "been over", "almost" or "about", and "a few" or "several" days). "Since" plus a day of the week ("since Monday", "since last Friday"). "Since last week", "since last weekend". One day is not on this list: "all day" and "since yesterday" do not count here.`,
  },
  {
    name: 'EN_MILD',
    label: 'slight word',
    fp: 'cd52643c',
    says: `"a little", "a little bit", "a tiny bit", "a wee bit", "a tiny", "a wee", "tiny bit", "little bit", "wee bit", "a bit", "a tad", "a touch", "slightly", "mildly", "mild", "kind of", "kinda", "sort of", "somewhat", "less", "not too", "not very", "not that", "not so", "not really", "not as". "Just" or "only" may stand before it, and "less" or "more" after it ("a bit less", "a little more"). A pattern that names this list stays quiet when one of these stands right before the symptom. So "a little more dizzy" stays quiet too.`,
  },
  {
    name: 'EN_TO_BACK',
    label: 'reaches-the-back phrase',
    fp: '9be3bf48',
    says: `"to", "into", "through", "toward", "towards", "in", "around" or "round", followed by "back", "my back" or "the back" ("upper", "lower", "middle" or "mid" may stand before "back"), but not "back yard", "back seat", "back room", "back door", "back porch" or "back office". Or "and", "plus", "with" or "also", followed by "back" or "my back", but not "back to", "back from", "back at", "back on", "back home", "back again" or "back in". Or "back hurts", "back hurting", "back aches", "back aching" or "back pain" ("also", "too" or "is" may stand in between).`,
  },
  {
    name: 'EN_LONG_OR_OFTEN',
    label: 'long-or-often phrase',
    fp: 'f995b5db',
    says: `"all day", "all night", "all morning", "all afternoon", "all evening", "all week", "all weekend"; "every hour", "every half hour", or "every" plus a number, "few" or "couple" ("couple of") plus "minutes", "min", "mins" or "hours" ("every 20 minutes", "every few hours"); "nonstop"; "constantly"; "won't stop", "can't stop", "cannot stop"; "over and over"; "for days", with or without a count ("for 3 days", "for two days", "for a few days", "for several days", "for many days"); "24 hours", "48 hours", "72 hours"; "since yesterday", "since last night"; or a count of 5 or more "times" (5 to 9, any number with two or more digits, "five" to "ten", "several", "many", "multiple", "countless", "so many").`,
  },
  {
    name: 'EN_IS_SEVERE',
    label: 'how-bad phrase',
    fp: '571c552a',
    says: `"is", "are", "was", "were", "it's", "its", "has been", "have been", "been", "got", "gets", "getting", "gotten", "became", "feel", "feels" or "keeps getting", then "severe", "unbearable", "excruciating", "awful", "terrible", "horrible", "intense", "insane", "agonizing", "brutal", "out of control", "off the charts", "through the roof" or "the worst" (any of "so", "really", "very", "pretty", "quite", "getting", "just", "still", "extremely", "super" and "real" may stand in between: "is getting really severe"). Or one of those first words, then "so bad", "really bad", "very bad", "extremely bad", "super bad", "real bad" or "pretty bad" ("getting", "just" or "still" may stand in between: "is getting so bad").`,
  },
  {
    name: 'EN_IS_BAD',
    label: 'how-bad phrase for pain',
    fp: '0e6cafab',
    says: `a **how-bad phrase**; or one of its first words ("is", "has been", "getting" and the others), then "bad", "worse" or "worse and worse" (the same small words may stand in between: "is really bad", "keeps getting worse"); or "getting worse".`,
  },
  {
    name: 'EN_N_DAYS',
    label: 'count of days',
    fp: '35a63c20',
    says: `a number (also written "x3"), "two" to "seven", "a few", "several" or "a couple" ("a couple of"), followed by "days" or "weeks": "3 days", "a few weeks".`,
  },
  {
    name: 'EN_DAY_N',
    label: 'day number',
    fp: 'f36cd01d',
    says: `"day" plus a number or "two" to "seven" ("day 3"); or a number with "st", "nd", "rd" or "th", or "second" to "seventh", plus "day" ("4th day", "third day").`,
  },
  {
    name: 'EN_DIZZY',
    label: 'dizzy phrase',
    fp: 'f7a090ee',
    says: `"dizzy"; "lightheaded" (also "light-headed", "light headed"); "black out", "blacks out", "blacked out"; "vision" or "everything" plus "goes", "went", "going", "gets" or "got" plus "dark", "black" or "dim"; "see" or "seeing" plus "black", "stars" or "spots"; "almost" or "nearly" plus "pass out", "passed out", "faint" or "fainted".`,
  },
  {
    name: 'EN_RUQ',
    label: 'upper-right phrase',
    fp: 'f4378c91',
    says: `"upper right", "right upper" or "top right" followed by "stomach", "abdomen", "abdominal", "belly", "tummy" or "quadrant" ("side of my", "part of my" or "area of my" may stand in between); "upper right side" or "right upper side", unless it is the side of an arm, leg, thigh, back, chest, neck, head, face, shoulder, hip or knee; "right rib", "right ribs", "right rib cage", "right side ribs"; "right side" plus "under", "below", "beneath", "by" or "near" plus "my ribs"; "under", "below" or "beneath" plus "my ribs on my right".`,
  },
  { name: 'EN_CANT_SEE', label: 'cannot-see word', fp: '1cd77441', says: `a word that starts with "blurr" ("blurry", "blurred"); "can't see"; "cannot see"; "blind".` },
  { name: 'EN_SEE', label: 'vision word', fp: '8086fb6c', says: `"vision"; "sight"; or a **cannot-see word**.` },
  {
    name: 'EN_NOT_EAT',
    label: 'not-eating phrase',
    fp: '1d0a87b2',
    says: `"haven't", "have not", "hasn't", "didn't", "did not", "barely", "hardly", "can't", "cannot", "couldn't", "could not", "not" or "unable to", followed by "eat", "eaten", "ate" or "eating" ("really", "even", "been able to" or "been" may stand in between). Or "eaten", "ate" or "eating" followed by "nothing", "almost nothing" or "next to nothing".`,
  },
  { name: 'EN_DAYS', label: 'days phrase', fp: 'c9e7ba7c', says: `"days"; "for a week", "for 2 weeks", "for two weeks", "for three weeks", "for a few weeks"; "all week".` },
];

/** Fingerprint of everything that decides how "no" and "not" are read (see negationSection). */
const NEGATION_FP = '776cd880';
/** Fingerprint of everything that decides whether a match is about the person's own state now (see ownStateLines). */
const OWN_FP = 'd472ef64';

/**
 * Phrases from the test file that this packet points out, with why. The script checks that each
 * one is still in the test file and still behaves this way.
 */
const TEST_PHRASES_THAT_FIRE_ON_PURPOSE: [string, string][] = [
  ["I don't think it's chest pain", 'The person doubts it, but the rule fires anyway.'],
  ["isn't chest pain serious?", 'A question about the symptom fires the rule.'],
  ['not sure if I am pregnant', 'Being unsure counts.'],
  ['not pregnant yet', 'The pregnancy card is also meant for people who are trying.'],
  ['have not had surgery yet, it is next week', 'The procedure is still ahead.'],
  ['I do not want to die', 'The self-harm rule does not look for "no" or "not". The support card is shown.'],
  ['never had chest pain like this before', '"Never ... like this" means the pain is there now.'],
];

const TEST_PHRASES_THAT_STAY_QUIET: [string, string][] = [
  ['threw up twice', 'Vomiting triggers only when it keeps going, lasts long, or is counted 5 or more times.'],
  ['a little dizzy', 'Dizziness that the person calls slight stays quiet.'],
  ['heart racing a bit', 'A racing heart that the person calls slight stays quiet.'],
  ['feeling shaky after coffee', 'One low-blood-sugar sign alone is not enough.'],
  ['had a sugar crash after lunch', '"Sugar crash" as a figure of speech does not match the low-blood-sugar phrases.'],
  ['mild stomach ache after dinner', 'Stomach pain triggers only with a severe word, when it reaches the back, or when the person says it does not go away.'],
  ['my stomach pain is back', '"Is back" is not read as pain reaching the back.'],
  ['stomach pain, but not to my back', 'The person says it does not reach the back.'],
  ['barely ate today', 'Eating too little triggers only when it has gone on for days.'],
  ['rash at the injection site', 'A rash triggers only when the person calls it severe or spreading, when it is all over the body, or when it is hives.'],
  ['itchy rash all over my thigh', '"All over" one body part does not count.'],
  ['sore throat', 'Only swelling, closing or tightness of the throat triggers.'],
  ["can't breathe through my nose", 'A blocked nose is not read as trouble breathing.'],
];

/**
 * Extra phrases that are not in the test suite. The script only reports what the rules do with
 * each one today; whether that is right is the reviewer's call.
 */
const EXTRA_PROBES: string[] = [
  // a cause the person names themselves
  'short of breath after climbing stairs',
  'heart was pounding after cardio',
  'hoarse from cheering at the game',
  'drank too much and passed out on the couch',
  'really bad stomach cramps from my period',
  'itchy all over after the shower',
  'wheezing from my asthma',
  'poop is black from iron pills',
  // not about the person's own state now
  'watched a show about suicide prevention',
  'sedated at the dentist last month',
  'my son can\'t breathe',
  'how do I know if it is an allergic reaction',
  // signs no guide names, or names only in a list
  'nauseous all day',
  'throwing up and stomach pain',
  'threw up 4 times',
  'throwing up everything',
  'dark urine',
  "can't pass gas and my belly is swollen",
  'no bowel movement for a week',
  'a rash on my arms and chest',
  'slurred speech',
  'I feel confused',
  'my blood sugar was 60 this morning',
  'feeling hopeless',
  'feeling depressed',
  // events the guides have an instruction for, and the app has no rule for
  'I took a double dose by mistake',
  'I think I took too much',
  'I missed my shot two weeks in a row',
];


// ── Fingerprints: tying the words in this file to the code they describe ─────

function checkFingerprint(what: string, actual: string, expected: string, howToFix: string): void {
  if (PRINT_FINGERPRINTS) fingerprintReport.push(`${actual}  ${what}`);
  else if (actual !== expected) problems.push(`${what} changed (fingerprint is now ${actual}, this script was written for ${expected}). ${howToFix}`);
}

/**
 * Code that this script describes in plain words: [file, first line of the declaration,
 * fingerprint]. When one of these changes, re-read it, correct the words in the section named
 * in the message, then put the new fingerprint here.
 */
const DESCRIBED_CODE: [string, string, string, string][] = [
  ['src/core/triage.ts', 'const RANK', '807d4453', 'section 2 (levels)'],
  ['src/core/triage.ts', 'function negatedEn(', '3257e47d', 'section 2.3 (how "no" and "not" are read)'],
  ['src/core/triage.ts', 'function anyEn(', 'd365d3d2', 'section 2.3'],
  ['src/core/triage.ts', 'function notOwnNowEn(', '775c1113', 'section 2.3 (someone else, long ago, a general question, the size of a pill)'],
  ['src/core/triage.ts', 'export function triageSymptom(', '2954291a', 'sections 2.2 and 2.8 (what the symptom buttons raise)'],
  ['src/core/alert.ts', 'export function fixedAlertCard(', 'fa19d9f9', 'section 2.1 (the two wordings of the fixed card)'],
  ['src/core/medGuide.ts', 'export function guideChoice(', 'a4d5017c', 'section 2.6 (which guide a person sees)'],
  ['src/core/triage.ts', 'export function triageText(', '378eda41', 'section 2.3'],
  ['src/core/pk.ts', 'export function kaFromTmax(', 'ca06c69a', 'section 5'],
  ['src/core/pk.ts', 'export function modelFor(', '1c38897f', 'section 5'],
  ['src/core/pk.ts', 'export function bateman(', 'bcdacc1d', 'section 5'],
  ['src/core/pk.ts', 'export function concentration(', 'fa12fefe', 'section 5'],
  ['src/core/pk.ts', 'export function steadyStatePeak(', '884eea7b', 'section 5'],
  ['src/core/pk.ts', 'export function referenceDose(', 'ca701dc4', 'section 5'],
  ['src/core/pk.ts', 'export function exposureCurve(', '207398b9', 'section 5'],
  ['src/core/pk.ts', 'export function exposureIndexAt(', '899cc4de', 'section 5'],
  ['src/core/pk.ts', 'export function escalationInfo(', 'a4d9019a', 'sections 3.2 and 5'],
  ['src/core/pk.ts', 'export function daysUntilBelow(', '6a07df5d', 'section 6'],
  ['src/core/protein.ts', 'export function referenceWeightKg(', 'b36d8b74', 'section 6 (protein target)'],
  ['src/core/protein.ts', 'export function proteinTarget(', 'b5e2ca97', 'section 6 (protein target)'],
  ['src/core/protein.ts', 'export function shouldRescue(', '05ef6f05', 'section 6 (protein target)'],
  ['src/core/weight.ts', 'export function rollingAverages(', '2c659ae3', 'section 6 (weight trend)'],
  ['src/core/weight.ts', 'export function regainStatus(', 'b21ec322', 'section 6 (weight trend)'],
  ['src/core/weight.ts', 'export function fastLoss(', 'b1b678c3', 'section 6 (weight trend)'],
  ['src/core/symptoms.ts', 'export function highSymptomDays(', '05c6c75c', 'section 6 (high-symptom days)'],
  ['src/core/today.ts', 'export function todayAdvice(', 'e62e9a8c', 'section 3.2 (when each advice text shows)'],
  ['src/core/schedule.ts', 'function minGapMs(', '0a152a4a', 'section 6 (dose timing)'],
  ['src/core/schedule.ts', 'export function nextDueMs(', 'c30caaa9', 'section 6 (dose timing)'],
  ['src/core/schedule.ts', 'export function dueStatus(', '6d302e68', 'section 6 (dose timing)'],
  ['src/core/schedule.ts', 'export function suggestSite(', '8c2d1110', 'section 6 (injection sites)'],
  ['src/core/catalog.ts', 'export function needsDoseConfirm(', '2c323485', 'section 4 (typing check)'],
];

function checkDescribedCode(): void {
  for (const [file, start, expected, where] of DESCRIBED_CODE) {
    const text = declaration(file, start);
    if (text === null) {
      problems.push(`"${start}" was not found in ${file}. This script describes it in ${where}; update the description and DESCRIBED_CODE.`);
      continue;
    }
    checkFingerprint(`${file} · ${start}`, hash8(text.replace(/\s+/g, ' ')), expected, `Re-read it, correct ${where} of the packet in scripts/build-review-packet.ts, then update DESCRIBED_CODE.`);
  }
}

// ── Section 2: danger-symptom rules ──────────────────────────────────────────

/** Item code of each rule, filled when section 2 is built. Later sections point back with it. */
const ruleCode = new Map<string, string>();
const ruleRef = (id: string): string => `${ruleCode.get(id) ?? '?'} \`${id}\``;

/** The exact wording of the box is in section 6.7. */
const INSULIN_BOX = 'the insulin or sulfonylurea box at setup, see 6.7';

/** US brand names of a catalog entry, for sentences: "tirzepatide (Zepbound, Mounjaro)". */
function drugWords(drugId: string | null): string {
  if (drugId === null) return 'no medication set up';
  const entry = CATALOG.find((d) => d.id === drugId);
  const brands = brandOptions('US')
    .filter((o) => o.drugId === drugId && o.brand)
    .map((o) => o.brand);
  const name = entry?.ingredient ?? entry?.generic.en ?? drugId;
  return brands.length ? `${name} (${brands.join(', ')})` : name;
}

/**
 * Says in words which users a set of contexts stands for, among the contexts in `within`.
 * Null when it is not one of the simple cases.
 */
function describeWho(matching: TriageContext[], within: TriageContext[] = CONTEXTS): string | null {
  const has = (c: TriageContext) => matching.includes(c);
  if (within.every(has)) return 'Every user';
  const byInsulin = (flag: boolean) => within.filter((c) => c.insulinOrSU === flag);
  if (byInsulin(true).every(has) && !byInsulin(false).some(has)) return `Only users who checked ${INSULIN_BOX}`;
  if (byInsulin(false).every(has) && !byInsulin(true).some(has)) return `Only users who did not check ${INSULIN_BOX}`;
  const drugIds = [...new Set(matching.map((c) => c.drugId))];
  const wholeDrugs = drugIds.every((id) => within.filter((c) => c.drugId === id).every(has));
  if (wholeDrugs && !drugIds.includes(null)) return `Only when the medication set up in the app is ${drugIds.map(drugWords).join(' or ')}`;
  return null;
}

/**
 * The places where the screens run typed text through the rules, by the name of the function in
 * src/web that calls triageText(). Whether each place exists in a build follows from the
 * feature switches. A call from a function that is not listed here stops the build, so a new
 * place where people type cannot go unmentioned.
 */
const TYPED_TEXT_PLACES: Record<string, { where: string; inFull: () => boolean; atLaunch: () => boolean }> = {
  checkTextTriage: {
    where: 'The note box at the bottom of the main screens, where a person types what happened (a dose, a weight, how they feel).',
    inFull: () => FULL.freeTextNote,
    atLaunch: () => LAUNCH.freeTextNote,
  },
  addQuestionFromList: {
    where: 'The box at the top of the list of questions for the doctor, where a person writes down a question for their next visit. The question is saved as typed and the alert is shown over it.',
    inFull: () => thirdTab(FULL) === 'questions',
    atLaunch: () => thirdTab(LAUNCH) === 'questions',
  },
};

interface TypedTextPlace {
  where: string;
  inFull: boolean;
  atLaunch: boolean;
}

let typedTextCache: TypedTextPlace[] | null = null;

function typedTextPlaces(): TypedTextPlace[] {
  if (typedTextCache) return typedTextCache;
  const callers = new Set<string>();
  for (const file of sourceTree('src/web').filter((f) => !f.startsWith('src/web/content/'))) {
    const src = source(file);
    for (const call of src.matchAll(/\btriageText\(/g)) {
      const before = [...src.slice(0, call.index).matchAll(/\bfunction\s+(\w+)\s*\(/g)];
      callers.add(before.length ? before[before.length - 1][1] : `(top of ${file})`);
    }
  }
  for (const name of callers) {
    if (!TYPED_TEXT_PLACES[name]) problems.push(`The screens now check typed text for danger signs in "${name}" (src/web). Section 2.3 does not describe that place; add it to TYPED_TEXT_PLACES in scripts/build-review-packet.ts.`);
  }
  typedTextCache = Object.entries(TYPED_TEXT_PLACES)
    .filter(([name]) => callers.has(name))
    .map(([, place]) => ({ where: place.where, inFull: place.inFull(), atLaunch: place.atLaunch() }));
  return typedTextCache;
}

const typedAtLaunch = (): boolean => typedTextPlaces().some((p) => p.atLaunch);

interface RuleView {
  id: TriageId;
  applies: string;
  /** Each level the rule can have, with who gets it. */
  levels: { level: TriageLevel; who: string }[];
  /** True when typed text can raise it. */
  fromText: boolean;
}

function viewOfRule(rule: InternalRule): RuleView {
  const active = CONTEXTS.filter((c) => !rule.when || rule.when(c));
  const applies = describeWho(active);
  if (applies === null) problems.push(`Rule "${rule.id}": the condition for when it applies is not one this script can put in words. Extend describeWho().`);
  const byLevel = new Map<TriageLevel, TriageContext[]>();
  for (const c of active) {
    const level = typeof rule.level === 'function' ? rule.level(c) : rule.level;
    byLevel.set(level, [...(byLevel.get(level) ?? []), c]);
  }
  const levels = [...byLevel.entries()]
    .sort((a, b) => levelRank(a[0]) - levelRank(b[0]))
    .map(([level, contexts]) => {
      // Who gets this level, among the users the rule applies to at all.
      const who = byLevel.size === 1 ? '' : describeWho(contexts, active);
      if (who === null) problems.push(`Rule "${rule.id}": the condition for level "${level}" is not one this script can put in words. Extend describeWho().`);
      return { level, who: who ?? '' };
    });
  return { id: rule.id, applies: applies ?? '', levels, fromText: true };
}

interface QuickLogRow {
  kind: SymptomKind;
  grades: number[];
  who: string;
  hit: TriageHit;
}

/** What the symptom buttons can raise, found by trying every symptom, grade and user. */
function quickLogRows(): QuickLogRow[] {
  const rows: QuickLogRow[] = [];
  for (const kind of SYMPTOM_ORDER) {
    const found = new Map<string, { hit: TriageHit; grades: Set<number>; contexts: Set<TriageContext> }>();
    for (const grade of [0, 1, 2, 3]) {
      for (const c of CONTEXTS) {
        for (const hit of triageSymptom(kind, grade, c)) {
          const key = `${hit.id}/${hit.level}`;
          const entry = found.get(key) ?? { hit, grades: new Set<number>(), contexts: new Set<TriageContext>() };
          entry.grades.add(grade);
          entry.contexts.add(c);
          found.set(key, entry);
        }
      }
    }
    for (const { hit, grades, contexts } of found.values()) {
      const who = describeWho([...contexts]);
      if (who === null) problems.push(`Symptom button "${kind}": the users who get "${hit.id}" are not a group this script can put in words. Extend describeWho().`);
      rows.push({ kind, grades: [...grades].sort(), who: who ?? '', hit });
    }
  }
  return rows;
}

interface TestPhrases {
  mustTrigger: Record<string, string[]>;
  quiet: string[];
  negation: { title: string; phrases: string[] }[];
}

/** The English example phrases of the test file, read as text (the test file cannot be imported outside the test runner). */
function readTestPhrases(): TestPhrases {
  const src = source(TRIAGE_TEST_FILE);
  const literalAfter = (marker: string, open: string): Literal => {
    const at = src.indexOf(marker);
    if (at < 0) throw new Error(`"${marker}" was not found in ${TRIAGE_TEST_FILE}`);
    return readLiteral(src, src.indexOf(open, src.indexOf('=', at))).value;
  };
  const english = (xs: string[]) => xs.filter((x) => !HAS_CJK.test(x));
  const must = literalAfter('const MUST_TRIGGER', '{') as { [key: string]: Literal };
  const mustTrigger = Object.fromEntries(Object.entries(must).map(([id, v]) => [id, english(strings(v))]));
  const quiet = english(strings(literalAfter('const ENGLISH_QUIET', '[')));

  const blockStart = src.indexOf("describe('triage — English negation'");
  if (blockStart < 0) throw new Error(`The "English negation" tests were not found in ${TRIAGE_TEST_FILE}`);
  const blockEnd = src.indexOf('\ndescribe(', blockStart + 1);
  const block = src.slice(blockStart, blockEnd < 0 ? undefined : blockEnd);
  const titleStarts = [...block.matchAll(/\n {2}it\((?=['"])/g)].map((m) => m.index + m[0].length);
  const negation = titleStarts.map((at, k) => {
    const title = readString(block, at);
    const body = block.slice(title.end, titleStarts[k + 1] ?? block.length);
    const found: { at: number; text: string }[] = [];
    for (const m of body.matchAll(/for \(const p of (?=\[)/g)) {
      for (const text of strings(readLiteral(body, m.index + m[0].length).value)) found.push({ at: m.index, text });
    }
    for (const m of body.matchAll(/\btop\((?=['"])/g)) found.push({ at: m.index, text: readString(body, m.index + m[0].length).value });
    return { title: title.value, phrases: english(found.sort((a, b) => a.at - b.at).map((f) => f.text)) };
  });
  if (!quiet.length || !negation.length || !Object.keys(mustTrigger).length) throw new Error(`No example phrases could be read from ${TRIAGE_TEST_FILE}`);
  return { mustTrigger, quiet, negation };
}

interface TriageCounts {
  rules: number;
  cards: number;
  triggers: number;
  testPhrases: number;
  probes: number;
}

/** Rules that show no alert in the first public version. Filled when section 2.1 is built; section 7 asks about them. */
let silentAtLaunch: TriageId[] = [];
/** True when section 2 says that an alert from the questions box leaves no reminder; section 7 then asks about it. */
let questionAlertLeavesNothing = false;

/** What the "card in the first public version" column says for one hit. */
function launchCardLabel(card: TriageCard | null, fixed: TriageCard): string {
  if (card === null) return 'No alert (2.1)';
  return card.title === fixed.title && !LAUNCH.triageDetailCards ? 'Fixed card (2.1)' : `Its own card: ${q(card.title)}`;
}

/**
 * What stays on the main screen after an alert. The sentences rest on screen code that cannot be
 * called from here; each piece is looked for, and a piece that is gone drops its sentence.
 */
function reminderLines(buttonRows: QuickLogRow[]): string[] {
  const again = q(screenText('today.seeAlert'));
  const ack = q(screenText('triage.ack'));
  // The reminder is built from today's symptom rows that carry an alert.
  const fromRows = screenCodeHas('src/web/derive.ts', /const openRow = \[\.\.\.todaySymptoms\]\.reverse\(\)\.find\(\(s\) => s\.triageId && s\.triageLevel && !s\.ack\)/, 'the reminder that stays on the main screen after an alert');
  const staysIfPausing = screenCodeHas('src/web/derive.ts', /const pausedRow = \[\.\.\.todaySymptoms\]\.reverse\(\)\.find\(\(s\) => s\.triageId && s\.triageLevel && pausesCoaching\(/, 'which reminders stay after the alert is closed');
  const questionLogsNothing = screenCodeHas('src/web/actions.ts', /export async function addQuestionFromList\((?:(?!\n\}\n)[\s\S])*setUi\(\{ triage: \{ hits, rowId: null, wrote: true \} \}\)/, 'what an alert from the questions box leaves behind');
  if (!fromRows) return [];
  const typedNote = LAUNCH.freeTextNote ? ' or a typed note' : FULL.freeTextNote ? ' or, in the full test version, a typed note' : '';
  const lines: string[] = [];
  lines.push(`**What stays on the main screen.** An alert raised from a symptom button (2.2)${typedNote} is saved with the log entry. For the rest of that day the main screen keeps a reminder at the top, with a button ${again}.`);
  if (staysIfPausing) {
    const allButtonsPause = buttonRows.length > 0 && buttonRows.every((row) => triageCard(row.hit, 'US', 'en').pauseCoaching);
    lines.push(`After the person taps ${ack}, the reminder stays only for an alert whose rule pauses the day's tips (each card in section 2.4 says whether it does).${allButtonsPause ? ' Every alert a symptom button can raise is of that kind.' : ''}`);
  }
  const questionsBox = typedTextPlaces().find((p) => p.where === TYPED_TEXT_PLACES.addQuestionFromList.where);
  if (questionLogsNothing && questionsBox && (questionsBox.atLaunch || questionsBox.inFull)) {
    questionAlertLeavesNothing = true;
    lines.push(
      `**An alert raised from the box for questions for the doctor (2.3) leaves no reminder.** Nothing is logged there, so once the person taps ${ack} the alert is gone: the main screen shows nothing and there is no way to open it again. A question in section 7.2 asks whether that is acceptable.`,
    );
  }
  return [lines.join(' '), ''];
}

function dangerSymptomSection(internals: TriageInternals, counts: TriageCounts): string[] {
  const out: string[] = [];
  const tests = readTestPhrases();
  const dial = emergencyDial('US');
  const callButton = dial === null ? '' : screenText('triage.call', { number: dial });
  const fixed = fixedAlertCard('US', 'en');
  /** The card the first public version shows for a hit, or null when it shows no alert for it (src/core/alert.ts). */
  const launchCardFor = (hit: TriageHit): TriageCard | null => alertCards([hit], 'US', 'en', LAUNCH.triageDetailCards)[0]?.card ?? null;
  const cardLines = (card: TriageCard): string[] => quoteBlock([`**${md(card.title)}**`, '', md(card.body)]);
  const cardExtras = (card: TriageCard): string => {
    const button = card.showEmergency && callButton ? `shows a ${q(callButton)} button` : 'shows no call button';
    const pause = card.pauseCoaching ? `pauses the day's workout and food tips` : 'does not pause anything';
    return `${button} and ${pause}`;
  };

  // The word tables must still be what the glosses were written for.
  for (const [id, gloss] of Object.entries(TRIGGERS)) {
    const patterns = internals.EN[id];
    if (!patterns) {
      problems.push(`Rule "${id}" has glosses in this script but no English patterns in ${TRIAGE_FILE}.`);
      continue;
    }
    checkFingerprint(`${TRIAGE_FILE} · English patterns of rule "${id}"`, hash8(patterns.map((p) => p.source).join('\n')), gloss.fp, `Re-read EN.${id}, correct TRIGGERS.${id} in scripts/build-review-packet.ts (one gloss per pattern, same order), then update its fp.`);
    if (patterns.length !== gloss.triggers.length) problems.push(`Rule "${id}" has ${patterns.length} English patterns in ${TRIAGE_FILE} but ${gloss.triggers.length} glosses in this script.`);
  }
  for (const id of Object.keys(internals.EN)) if (!TRIGGERS[id]) problems.push(`Rule "${id}" has English patterns in ${TRIAGE_FILE} but no glosses in this script. Add TRIGGERS.${id}.`);
  checkFingerprint(`${TRIAGE_FILE} · EN_CRISIS`, hash8(internals.EN_CRISIS.source), CRISIS_GLOSS.fp, 'Re-read EN_CRISIS, correct CRISIS_GLOSS, then update its fp.');
  checkFingerprint(`${TRIAGE_FILE} · EN_LOW_SUGAR_SIGNS`, hash8(internals.EN_LOW_SUGAR_SIGNS.map((p) => p.source).join('\n')), SIGN_GLOSS.fp, 'Re-read EN_LOW_SUGAR_SIGNS, correct SIGN_GLOSS, then update its fp.');
  checkFingerprint(`${TRIAGE_FILE} · EN_LOW_SUGAR_COMMON`, hash8(internals.EN_LOW_SUGAR_COMMON.map((p) => p.source).join('\n')), SIGN_GLOSS.commonFp, 'Re-read EN_LOW_SUGAR_COMMON, correct SIGN_GLOSS.common, then update commonFp.');
  if (internals.EN_LOW_SUGAR_SIGNS.length !== SIGN_GLOSS.signs.length || internals.EN_LOW_SUGAR_COMMON.length !== SIGN_GLOSS.common.length) problems.push(`The low-blood-sugar sign lists of ${TRIAGE_FILE} have ${internals.EN_LOW_SUGAR_SIGNS.length} and ${internals.EN_LOW_SUGAR_COMMON.length} groups, SIGN_GLOSS has ${SIGN_GLOSS.signs.length} and ${SIGN_GLOSS.common.length}.`);
  checkFingerprint(
    `${TRIAGE_FILE} · the pieces that read someone else, long ago, a general question and the size of a pill`,
    hash8(OWN_NAMES.map((n) => String(internals.own[n] instanceof RegExp ? (internals.own[n] as RegExp).source : internals.own[n])).join('\n')),
    OWN_FP,
    'Re-read them, correct section 2.3 (ownStateLines), then update OWN_FP.',
  );
  checkFingerprint(
    `${TRIAGE_FILE} · the pieces that read "no" and "not"`,
    hash8([...NEGATION_NAMES, 'GAP'].map((n) => String(internals.negation[n] instanceof RegExp ? (internals.negation[n] as RegExp).source : internals.negation[n])).join('\n')),
    NEGATION_FP,
    'Re-read them, correct section 2.3 (negationLines), then update NEGATION_FP.',
  );

  const rules = internals.RULES.map(viewOfRule);
  const buttonRows = quickLogRows();
  // A rule that only the symptom buttons can raise has no entry in RULES.
  for (const row of buttonRows) {
    if (!rules.some((r) => r.id === row.hit.id)) rules.push({ id: row.hit.id, applies: 'Every user', levels: [{ level: row.hit.level, who: '' }], fromText: false });
  }
  for (const r of rules) ruleCode.set(r.id, code('R'));
  const ref = ruleRef;
  counts.rules = rules.length;

  out.push('## 2. Danger-symptom rules', '');
  out.push(
    'These rules are fixed. No AI is involved. They look at two things: which symptom button a person taps and how bad they say it is, and the words a person types. When a rule matches, the app shows an alert that covers the whole screen. The aim is to give one reminder too many, not one too few. The app does not diagnose.',
    '',
  );
  out.push(`Under every alert the app prints this line: ${q(screenText('triage.note'))} The button that closes the alert says ${q(screenText('triage.ack'))}.`, '');
  out.push(...reminderLines(buttonRows));
  // Rules whose card text is not the same at every level they can have.
  const wordsByLevel = rules.filter((r) => new Set(r.levels.map((l) => triageCard({ id: r.id, level: l.level }, 'US', 'en').body)).size > 1);
  const levelAndWords = wordsByLevel.length
    ? `It changes the words for ${wordsByLevel.length === 1 ? 'one rule only' : `${wordsByLevel.length} rules`}, ${wordsByLevel.map((r) => ref(r.id)).join(', ')}, which ${wordsByLevel.length === 1 ? 'has' : 'have'} a card for each level (section 2.4).`
    : 'It does not change the words.';
  const levelAtLaunch = LAUNCH.triageDetailCards ? '' : ' In the first public version the level also decides whether an alert is shown at all (section 2.1), and every alert other than the crisis card has the same color.';
  out.push(`Each rule has a level. The level decides which card comes first when more than one rule matches, and the color of the alert. ${levelAndWords}${levelAtLaunch} The levels, from first to last:`, '');
  const levelsInUse = [...new Set(rules.flatMap((r) => r.levels.map((l) => l.level)))].sort((a, b) => levelRank(a) - levelRank(b));
  out.push(
    ...table(
      ['Order', 'Level', 'Rules at this level'],
      levelsInUse.map((level, i) => [String(i + 1), `\`${level}\``, rules.filter((r) => r.levels.some((l) => l.level === level)).map((r) => ref(r.id)).join(', ')]),
      [1, 2, 8],
    ),
  );

  // 2.1 The launch card.
  out.push('### 2.1 The alert a US user sees in the first public version', '');
  if (LAUNCH.triageDetailCards) {
    out.push('In the first public version each rule shows its own card (section 2.4).', '');
  } else {
    out.push('Until the cards in section 2.4 are reviewed, an alert shows one fixed card. It names no cause.', '');
    out.push(...cardLines(fixed));
    out.push(`This card ${cardExtras(fixed)}.`, '');
    const wrote = fixedAlertCard('US', 'en', true);
    if (wrote.body !== fixed.body && typedTextPlaces().some((p) => p.where === TYPED_TEXT_PLACES.addQuestionFromList.where && p.atLaunch)) {
      const [was, now] = [fixed.body.split(' can be')[0], wrote.body.split(' can be')[0]];
      if (wrote.body.replace(now, was) !== fixed.body) problems.push('The two wordings of the fixed card differ in more than their first words. Re-read section 2.1.');
      out.push(`When the alert comes from a question typed into the list of questions for the doctor, nothing was logged, so the card begins ${q(now)} in place of ${q(was)}. Nothing else changes.`, '');
    }
    if (LAUNCH.guideWarningSigns && screenCodeHas('src/web/components/TriageModal.tsx', /features\.guideWarningSigns && cards\.some\(\(c\) => c\.key !== 'crisis'\)/, 'the button on an alert that opens the Medication Guide list')) {
      out.push(
        `Under the card there is one more button, ${q(screenText('guide.open'))}. It opens the list of section 2.6 for the person's own medication: always the whole list, never one item of it, because the app does not say which item a person may have. The crisis card has no such button.`,
        '',
      );
    }
    const atLaunch = rules.flatMap((r) => r.levels.map((l) => ({ rule: r, level: l.level, card: launchCardFor({ id: r.id, level: l.level }) })));
    const fixedLevels = levelsInUse.filter((level) => atLaunch.some((x) => x.level === level && x.card?.title === fixed.title));
    out.push(`The fixed card is shown for a rule at ${fixedLevels.length === 1 ? 'level' : 'one of the levels'} ${fixedLevels.map((l) => `\`${l}\``).join(', ')}.`, '');
    const own = rules.filter((r) => atLaunch.some((x) => x.rule === r && x.card !== null && x.card.title !== fixed.title));
    if (own.length) out.push(`The exception: ${own.map((r) => ref(r.id)).join(', ')} ${own.length === 1 ? 'keeps its' : 'keep their'} own card (shown in section 2.4) in the first public version too.`, '');
    const silent = atLaunch.filter((x) => x.card === null);
    if (silent.length) {
      const callOnOwnCard = silent.some((x) => triageCard({ id: x.rule.id, level: x.level }, 'US', 'en').showEmergency);
      out.push(
        `**A rule at a milder level shows no alert at all in the first public version:** ${silent.map((x) => `${ref(x.rule.id)} (\`${x.level}\`)`).join(', ')}. ${
          callOnOwnCard ? 'Their own cards are in section 2.4.' : 'Their own cards (section 2.4) are reminders with no call button.'
        } The fixed card says "right away" and offers the call button, so it is not used for them. Text that matches only these rules is saved as typed and nothing else happens. A question in section 7.2 asks whether that is right.`,
        '',
      );
    }
    silentAtLaunch = [...new Set(silent.map((x) => x.rule.id))];
  }
  counts.cards += 1;

  // 2.2 Symptom buttons.
  out.push('### 2.2 Alerts from the symptom buttons', '');
  // The symptom sheet offers grades 1 to 3; grade 0 exists in the data but has no button.
  const offered = screenCodeHas('src/web/components/Sheets.tsx', /\[1, 2, 3\]\.map\(\(g\)/, 'the choices for how bad a symptom is') ? [1, 2, 3] : [0, 1, 2, 3];
  out.push(
    `A person can tap one of these symptoms: ${SYMPTOM_ORDER.map((k) => symptomLabel(k, 'en')).join(', ')}. Then they choose how bad it is: ${offered.map((g) => gradeLabel(g, 'en')).join(', ')}. The screen explains: ${q(screenText('symptom.severeNote'))}`,
    '',
  );
  out.push(
    ...table(
      ['Code', 'Symptom tapped', 'How bad', 'Who', 'Rule and level', 'Card in the first public version'],
      buttonRows.map((row) => [
        code('B'),
        md(symptomLabel(row.kind, 'en')),
        row.grades.map((g) => gradeLabel(g, 'en')).join(', '),
        row.who,
        `${ref(row.hit.id)} (\`${row.hit.level}\`)`,
        launchCardLabel(launchCardFor(row.hit), fixed),
      ]),
      [1, 3, 2, 5, 4, 4],
    ),
  );
  out.push('Every other symptom and every other choice of how bad it is raises no alert.', '');
  const fixedButtons = buttonRows.filter((row) => row.hit.fixedCard);
  if (fixedButtons.length) {
    const named = fixedButtons.map((row) => `${q(symptomLabel(row.kind, 'en'))}${row.who === 'Every user' ? '' : ` (${row.who.charAt(0).toLowerCase()}${row.who.slice(1)})`}`);
    out.push(
      `The hits of ${named.join(' and ')} are marked to show the fixed card of section 2.1 even where each rule shows its own card (2.3): the card written for ${ruleRef('dehydration')} speaks of vomiting and diarrhea, not of nausea or dizziness. ${LAUNCH.triageDetailCards ? '' : 'In the first public version every alert shows the fixed card anyway.'}`.trim(),
      '',
    );
  }
  const fromButtons = new Set(buttonRows.map((r) => r.hit.id));
  const notFromButtons = rules.filter((r) => !fromButtons.has(r.id));
  out.push(`No button leads to these rules: ${notFromButtons.map((r) => ref(r.id)).join(', ')}. Only typed text can raise them (2.3).`, '');
  if (!typedAtLaunch()) out.push('**In the first public version nothing is typed, so this table is the only way an alert is raised.**', '');

  // 2.3 How typed notes are read.
  out.push('### 2.3 Alerts from typed text: how the rules read it', '');
  out.push('Typed text is checked in these places:', '');
  const yesNo = (on: boolean) => (on ? 'Yes' : 'No');
  out.push(...table(['Where a person types', 'In the full test version', 'In the first public version'], typedTextPlaces().map((p) => [p.where, yesNo(p.inFull), yesNo(p.atLaunch)]), [10, 3, 3]));
  out.push(
    typedAtLaunch()
      ? `**So the phrase rules below are live in the first public version.** A match there shows the alert of section 2.1${silentAtLaunch.length ? ', or nothing when the text matches only rules that show no alert there (also 2.1)' : ''}.`
      : 'In the first public version nothing is typed. The phrase rules below are here so they can be reviewed before typing is turned on.',
    '',
  );
  out.push(
    'The text is checked as a whole, before anything else is done with it. Capital letters do not matter, spaces at the start and the end are dropped, and curly apostrophes, as phones type them ("can’t"), are read as straight ones. Each rule is a list of phrase patterns. Section 2.4 gives every pattern in plain words, with examples that the script that built this packet ran through the real rules. The app also has Chinese phrase lists. They are not part of this review.',
    '',
  );
  checkFingerprint(`${TRIAGE_FILE} · EN_SPELLING`, hash8(internals.EN_SPELLING.map(([re, to]) => `${re.source} ${to}`).join('\n')), SPELLING_GLOSS.fp, 'Re-read EN_SPELLING, correct SPELLING_GLOSS, then update its fp.');
  for (const [typed, meant] of [['I past out', 'chest_or_faint'], ['my tounge is swolen', 'anaphylaxis'], ['servere stomach pian', 'pancreatitis'], ['chess pain', 'chest_or_faint']] as const) expectOutcome(typed, meant, 'Section 2.3 (spellings)');
  out.push(
    `**Misspellings.** Before any rule looks at the text, a fixed list of misspellings and voice-typing slips is read as the word that was meant. Every entry is a spelling written out in the code; nothing is guessed from how alike two words look. The list, in plain words: ${SPELLING_GLOSS.says.join(' ')} So ${q('I past out')}, ${q('my tounge is swolen')}, ${q('servere stomach pian')} and ${q('chess pain')} trigger (checked). The examples in section 2.4 are written as the patterns read them.`,
    '',
  );
  const fixedSentence = LAUNCH.triageDetailCards
    ? 'In the first public version each rule shows its own card, so this mark changes which card is shown.'
    : `In the first public version every alert shows the fixed card anyway (2.1), so the mark changes nothing there${FULL.triageDetailCards ? '; it matters in the full test version, where each rule shows its own card' : ''}.`;
  out.push(
    `**The fixed card for signs a rule's own card does not name.** Some patterns stand for signs that the card written for their rule (2.4) does not name: signs added from the Medication Guides (any fever, plain hoarseness, a racing heart, blurry vision, severe nausea and the like) and general emergency signs (a heart attack, a stroke, a seizure, a collapse). Section 2.4 marks them ${FIXED_MARK}. When a rule is raised only by such patterns, the hit is marked to show the fixed card of section 2.1 even where each rule shows its own card. ${fixedSentence}`,
    '',
  );
  out.push('Many patterns use the same word lists. A word in **bold** in section 2.4 stands for one of these lists:', '');
  out.push(
    ...table(
      ['Code', 'Name in 2.4', 'Words that count'],
      WORD_LISTS.map((wl) => {
        const pattern = internals.lists[wl.name];
        let words: string;
        if (wl.says !== undefined) {
          checkFingerprint(`${TRIAGE_FILE} · word list ${wl.name}`, hash8(pattern), wl.fp ?? '', `Re-read ${wl.name}, correct its entry in WORD_LISTS, then update its fp.`);
          words = wl.says;
        } else {
          try {
            words = expandSimple(pattern).join(', ');
          } catch (e) {
            problems.push(`Word list ${wl.name} can no longer be listed word by word (${String(e)}). Give it a hand-written "says" and an fp in WORD_LISTS.`);
            words = '';
          }
        }
        return [code('L'), `**${wl.label}**`, words];
      }),
      [1, 3, 12],
    ),
  );
  out.push(...negationLines(tests));
  out.push(...ownStateLines(rules));

  // 2.4 The rules, one by one.
  out.push('### 2.4 The rules, one by one', '');
  out.push(
    `For each rule: its level, who it applies to, the card a US user would see once the cards are turned on, and what triggers it. ${LAUNCH.triageDetailCards ? '' : 'Every card in this section is **hidden until reviewed**, unless it says otherwise.'}`.trim(),
    '',
  );
  for (const rule of rules) {
    out.push(`#### ${ruleCode.get(rule.id)} · \`${rule.id}\``, '');
    const facts: string[] = [];
    facts.push(`**Level:** ${rule.levels.map((l) => `\`${l.level}\`${l.who ? ` (${l.who.charAt(0).toLowerCase()}${l.who.slice(1)})` : ''}`).join('; ')}`);
    facts.push(`**Applies to:** ${rule.applies.charAt(0).toLowerCase()}${rule.applies.slice(1)}`);
    const sources: string[] = [];
    if (rule.fromText) sources.push(typedAtLaunch() ? 'typed text (2.3)' : 'typed text (2.3; not in the first public version, where nothing is typed)');
    if (fromButtons.has(rule.id)) sources.push('symptom buttons (2.2)');
    facts.push(`**Raised from:** ${sources.join(' and ')}`);
    out.push(...list(facts));

    for (const { level, who } of rule.levels) {
      const hit: TriageHit = { id: rule.id, level };
      const card = triageCard(hit, 'US', 'en');
      const atLaunch = launchCardFor(hit);
      const keptAtLaunch = LAUNCH.triageDetailCards || atLaunch?.title === card.title;
      const reachableAtLaunch = fromButtons.has(rule.id) || (rule.fromText && typedAtLaunch());
      const hiddenStatus = atLaunch === null ? '**hidden until reviewed** (in the first public version this rule shows no alert, see 2.1)' : '**hidden until reviewed**';
      const status = !keptAtLaunch ? hiddenStatus : reachableAtLaunch ? 'shown in the first public version' : 'kept in the first public version, where nothing can raise it yet';
      const label = rule.levels.length > 1 ? `Card at level \`${level}\`${who ? ` (${who.charAt(0).toLowerCase()}${who.slice(1)})` : ''}` : 'Card';
      out.push(`${label}, ${status}:`, '');
      out.push(...cardLines(card));
      out.push(`This card ${cardExtras(card)}.`, '');
      textsWithNumbers.push([ruleCode.get(rule.id) ?? '', card.body]);
      counts.cards += 1;
    }

    const gloss = TRIGGERS[rule.id];
    const patterns = internals.EN[rule.id] ?? [];
    const ctx: TriageContext = rule.id === 'contraception' ? { ...US_CONTEXT, drugId: 'tirzepatide' } : US_CONTEXT;
    const checkExample = (example: string, pattern: RegExp | null, where: string) => {
      if (pattern && !new RegExp(pattern.source, 'i').test(example)) problems.push(`${where}: the example "${example}" does not match the pattern it is listed under.`);
      if (!fires(example, rule.id, ctx)) problems.push(`${where}: the example "${example}" does not trigger rule "${rule.id}".`);
    };
    if (rule.id === 'crisis') {
      for (const example of CRISIS_GLOSS.examples) checkExample(example, internals.EN_CRISIS, 'CRISIS_GLOSS');
      out.push('What triggers it in typed text. This rule does not look for "no" or "not": "I do not want to die" still shows the card.', '');
      out.push(...table(['Code', 'What the person typed'], CRISIS_GLOSS.says.map((says, i) => [`${ruleCode.get(rule.id)}.${i + 1}`, says]), [1, 12]));
      out.push(`Examples that trigger (checked): ${CRISIS_GLOSS.examples.map(q).join(', ')}.`, '');
      for (const example of CRISIS_GLOSS.noteExamples) checkExample(example, internals.EN_CRISIS, 'CRISIS_GLOSS.noteExamples');
      out.push(CRISIS_GLOSS.note, '');
      counts.triggers += CRISIS_GLOSS.says.length;
    } else if (gloss) {
      out.push('What triggers it in typed text:', '');
      out.push(
        ...table(
          ['Code', 'What the person typed', 'Examples that trigger (checked)'],
          gloss.triggers.map((t, i) => {
            for (const example of t.examples) checkExample(example, patterns[i] ?? null, `TRIGGERS.${rule.id}[${i}]`);
            const fixedMark = patterns[i] !== undefined && internals.FIXED_CARD.has(patterns[i]) ? ` ${FIXED_MARK}` : '';
            return [`${ruleCode.get(rule.id)}.${i + 1}`, `${t.says}${fixedMark}`, t.examples.map(q).join('; ')];
          }),
          [1, 9, 5],
        ),
      );
      counts.triggers += gloss.triggers.length;
      if (rule.id === 'hypoglycemia') {
        SIGN_GLOSS.signs.forEach((sign, i) => {
          if (!new RegExp(internals.EN_LOW_SUGAR_SIGNS[i]?.source ?? '$^', 'i').test(sign.example)) problems.push(`SIGN_GLOSS.signs[${i}]: the example "${sign.example}" does not match its sign pattern.`);
        });
        SIGN_GLOSS.common.forEach((sign, i) => {
          if (!new RegExp(internals.EN_LOW_SUGAR_COMMON[i]?.source ?? '$^', 'i').test(sign.example)) problems.push(`SIGN_GLOSS.common[${i}]: the example "${sign.example}" does not match its sign pattern.`);
        });
        for (const example of SIGN_GLOSS.examples) checkExample(example, null, 'SIGN_GLOSS');
        for (const phrase of SIGN_GLOSS.quiet) expectOutcome(phrase, null, 'SIGN_GLOSS.quiet');
        out.push(
          'It also triggers on the signs of low blood sugar that the Medication Guides list (section 2.6), when the text has **two or more** of them. One sign alone is not enough. The signs are in two tables. Two signs of the first table trigger. A sign of the second table counts only next to a sign of the first. The card of this rule names shaking, cold sweats and a racing heart: when two of the first four signs (S1 to S4) are found, the rule shows its own card; when the alert rests only on other signs, it shows the fixed card (see 2.3).',
          '',
        );
        out.push(...table(['Code', 'Sign'], SIGN_GLOSS.signs.map((s, i) => [`${ruleCode.get(rule.id)}.S${i + 1}`, s.says]), [1, 12]));
        out.push('Signs that count only next to a sign of the table above, because many people on these medications have two of them on an ordinary day:', '');
        out.push(...table(['Code', 'Sign'], SIGN_GLOSS.common.map((s, i) => [`${ruleCode.get(rule.id)}.C${i + 1}`, s.says]), [1, 12]));
        out.push(`Examples that trigger (checked): ${SIGN_GLOSS.examples.map(q).join(', ')}. Examples that stay quiet (checked): ${SIGN_GLOSS.quiet.map(q).join(', ')}.`, '');
        counts.triggers += SIGN_GLOSS.signs.length + SIGN_GLOSS.common.length;
      }
      if (rule.id === 'pregnancy') out.push('A "not" in front does not stop this rule when "yet" follows, or "but" or "though" with "trying", "hoping" or "planning". The card is also meant for people who are trying to get pregnant.', '');
      if (rule.id === 'procedure') out.push('A "not" in front does not stop this rule when "yet" follows: the procedure is still ahead.', '');
    } else if (!rule.fromText) {
      out.push('No typed phrase triggers this rule. It is raised only from the symptom buttons (2.2).', '');
    } else {
      problems.push(`Rule "${rule.id}" is in RULES of ${TRIAGE_FILE} but has no English patterns and no glosses. Describe it in dangerSymptomSection().`);
    }

    const required = tests.mustTrigger[rule.id] ?? [];
    for (const phrase of required) if (!fires(phrase, rule.id, ctx)) problems.push(`The test phrase "${phrase}" no longer triggers rule "${rule.id}".`);
    if (required.length) out.push(`Phrases the test suite requires to trigger this rule: ${required.map(q).join('; ')}.`, '');
    counts.testPhrases += required.length;
  }
  for (const id of Object.keys(tests.mustTrigger)) if (!rules.some((r) => r.id === id)) problems.push(`The test file lists phrases for a rule "${id}" that this script did not find.`);

  out.push(...triggeringLines(tests, counts));
  return out;
}

/** Adds a problem when a phrase does not do what this script says about it. `id` null means it must stay quiet. */
function expectOutcome(phrase: string, id: string | null, where: string): void {
  const hits = triageText(phrase, US_CONTEXT);
  if (id === null ? hits.length > 0 : !hits.some((h) => h.id === id)) problems.push(`${where}: "${phrase}" no longer ${id === null ? 'stays quiet' : `triggers "${id}"`} (now: ${outcome(phrase)}).`);
}

function negationLines(tests: TestPhrases): string[] {
  const out: string[] = [];
  for (const phrase of ['no chest pain', "I don't have any chest pain", 'never had chest pain', 'no fever or chest pain', 'zero chest pain', 'ruled out gallstones', "can't say I have any chest pain", 'my lips arent swollen']) expectOutcome(phrase, null, 'Section 2.3');
  for (const phrase of ['chest pain: no', 'fever - none', 'chest pain free today', 'gallstones were ruled out']) expectOutcome(phrase, null, 'Section 2.3');
  for (const phrase of ['not feeling well, chest pain', "isn't chest pain serious?", "I've never had chest pain like this", 'I never get chest pain, but today I do', "wasn't unconscious long", 'chest pain - no relief']) expectOutcome(phrase, 'chest_or_faint', 'Section 2.3');
  expectOutcome('I do not want to die', 'crisis', 'Section 2.3');
  out.push('How the rules read "no" and "not":', '');
  out.push(
    ...list([
      `A rule stays quiet when the words right before the symptom deny it: "no chest pain", "I don't have any chest pain", "never had chest pain", "no fever or chest pain", "zero chest pain", "ruled out gallstones", "can't say I have any chest pain". The words that deny: "no", "none", "neither", "nor", "zero", "0", "ruled out", "rule out", "negative for", "free of", "free from"; "not", "never", "without", "cannot", "denies", "denied", "deny", and any word that ends in "n't" (also typed without the apostrophe: "dont", "doesnt", "didnt", "havent", "hasnt", "hadnt", "isnt", "wasnt", "arent"); "can't say", "cannot say" or "wouldn't say" (also "can't say that I", "I'm" or "it's"). "No", "without", "denies" or "denied" may also stand one to three words before an "or" or "nor" that comes right before the symptom ("no fever or chest pain").`,
      `A "no" written after the symptom, as on a checklist, denies it too: "chest pain: no", "fever - none", "chest pain free today", "gallstones were ruled out". That is ":", "=", "?", "-" or a dash, then "no", "none", "nope", "n/a", "negative", "0" or "zero", but not "no more", "no longer", "no better", "no relief", "no change", "no improvement", "no break" or "no let up" ("chest pain - no relief" fires). Or "free" right after the symptom, after a space or a hyphen. Or "was", "were", "is", "has been" or "got", plus "ruled out".`,
      `Only small filler words may stand between a "no" in front and the symptom, such as "any", "more", "have", "having" or "feeling". With anything else in between, the rule fires: "not feeling well, chest pain". The part before the symptom is read back only to the last comma, full stop, colon, semicolon, question mark, exclamation mark or bracket.`,
      `A denial does not count, and the rule fires, when the rest of the sentence says the symptom is there now. The markers are "like this", "this bad", "so bad", "this low", "before", "until", and turns such as "but today I do". "Wasn't unconscious long" also fires: it happened, only not for long.`,
      `A question that opens with "isn't", "aren't" or "doesn't" is not a denial: "isn't chest pain serious?" fires. The same goes for any other "...n't" alone before the symptom when a question mark follows in the same sentence.`,
      `Between the key words of one pattern a few other words may stand. How many characters is fixed for each pattern. They may not cross the end of a sentence. They may not cross "no", "not", "never", "without" or a word ending in "n't" (also typed without the apostrophe, such as "arent", "dont", "wont": "my lips arent swollen" stays quiet), unless that word says the symptom goes on ("won't go away", "doesn't stop", "haven't been able to stop", "not getting better", "not slowing down").`,
      `The self-harm rule never looks for "no" or "not".`,
    ]),
  );
  out.push('What the test suite checks about this, and what the rules do with each phrase today:', '');
  const rows: string[][] = [];
  for (const group of tests.negation) {
    const byOutcome = new Map<string, string[]>();
    for (const phrase of group.phrases) byOutcome.set(outcome(phrase), [...(byOutcome.get(outcome(phrase)) ?? []), phrase]);
    [...byOutcome.entries()].forEach(([result, phrases], i) => rows.push([i === 0 ? md(sentenceCase(group.title)) : '', phrases.map(q).join('; '), result]));
  }
  out.push(...table(['What the test checks', 'Phrases', 'What the rules do today'], rows, [5, 9, 4]));
  return out;
}

/**
 * The other reasons a match does not count: someone else, long ago, a general question, the
 * size of a pill, a symptom called slight. Every phrase named here is run through the rules.
 */
function ownStateLines(rules: RuleView[]): string[] {
  const out: string[] = [];
  const quiet = (phrases: string[]) => {
    for (const p of phrases) expectOutcome(p, null, 'Section 2.3 (own state)');
    return phrases.map(q).join(', ');
  };
  const firing = (phrases: string[]) => {
    for (const p of phrases) if (alertCards(triageText(p, US_CONTEXT), 'US', 'en', LAUNCH.triageDetailCards).length === 0) problems.push(`Section 2.3 (own state): "${p}" no longer raises an alert in the first public version.`);
    return phrases.map(q).join(', ');
  };
  const reminders = rules.filter((r) => !showsLaunchCard(r.id)).map((r) => ruleRef(r.id));
  out.push('A rule is raised when the text describes the person\'s own state, now or recently. Besides a denial, a match does not count only in the cases below. When in doubt, the rule is raised. The self-harm rule makes none of these checks.', '');
  const notForReminders = reminders.length ? ` These three checks are not made for ${reminders.join(', ')}: a question, a worry or a plan is what those reminders are for.` : '';
  out.push(
    ...list([
      `**Someone else.** The words before the symptom, in the same part of the sentence (back to the last comma, colon or bracket), name another person who is the one the sentence is about: "my dad", "my sister's", "my late mother", "mom", "hubby", "she", "he", "they", "a friend of mine", "a guy", "the baby", "people", "patients", "someone". The person counts as the one the sentence is about when "he", "she" or "they" names them, when "his", "her" or "their" stands right before the symptom, when nothing or only an opening word stands before the person ("so", "yesterday", "update"), when a word that starts a new statement stands before them ("I think", "because", "when", "said", "one of"), or when "who" follows them. Stays quiet: ${quiet(['my dad had chest pain last year', 'my sister is pregnant', 'she passed out at the gym', 'mom has chest pain', "hubby's lips are swollen", 'some people get hives from it', 'a guy on the news who was vomiting blood', 'pancreatitis runs in my family'])}. It counts again when "I", "me", "my" or "we" stands between that person and the symptom or is part of the symptom, when the writer stands with them ("me and my husband"), when a word for saying, noticing, finding, worrying or taking stands between them and the symptom ("said", "noticed", "found", "worried", "took", "called" and the like), when more than about 60 characters stand between them and the symptom, when the next sentence says "I have it" or "me too", or when the person is only part of the writer's own story (after a verb or a preposition: "walking my dog", "with my sister"): ${firing(['my dad had chest pain and now I have chest pain', 'me and my husband have been throwing up all day', 'my wife noticed my eyes look yellow', 'they said my blood sugar was low', 'husband found me on the floor', 'was walking my dog and passed out'])}. After "and then" or "and now" a symptom named as a thing, with no "has" or "had" tied to the person, starts a new statement and counts: ${firing(['my husband cooked dinner and then severe stomach pain'])}. "Anyone else" is read as the writer too: ${firing(['has anyone else had chest pain on this'])}.`,
      `**Long ago.** The sentence names a time long past: "last year", "last summer" (also winter, spring, autumn, Christmas), "last fall" (but not "my last fall" or "a bad last fall"), "years ago", "a few years back", "decades ago", "a long time ago", "ages ago", "in 2019" (any year before last year), "in college", "in high school", "back in the day", "as a kid", "when I was younger", "when I was 12", "growing up", "used to", "a history of". Stays quiet: ${quiet(['I fainted once as a kid', 'i had pancreatitis in 2019', 'i used to get palpitations', 'a history of gallstones'])}. Days, weeks and months ago still count: ${firing(['I passed out last week', 'two weeks ago I started having trouble swallowing'])}. The time must stand in the same part of the sentence as the symptom, or alone right before it ("last year, I had chest pain"); a symptom in another part of the sentence counts: ${firing(['I had my gallbladder out last year and I have severe stomach pain'])}. A sentence that opens with the time and goes on in the past, with no verb in the present, is a story of long ago and stays quiet: ${quiet(["back in 2020 I had covid and couldn't breathe"])}. It counts again when the sentence has a word for now ("now", "today", "tonight", "again", "still", "currently", "lately", "recently", "yesterday", "since", "this morning", "this week", "last night", "earlier", "is back", "came back", "same pain"): ${firing(['had chest pain last year and again today'])}. "Fine now", "better now", "healed now" and the like say it is over and do not count as a word for now: ${quiet(['had gallstones years ago, fine now'])}.`,
      `**A general question.** The words lead straight up to the symptom as a question about it in general: "what are the signs of ...", "symptoms of ..." at the start, "the risk of ...", "what causes ...", "what is ...", "what does ... feel like", "can it cause ...", "I wonder if it causes ...", "can you get ...", "how do I know ...", "the difference between ...", "how common is ...", "what should I do if I get ...", "I read that ...", "googled ...", "people say it causes ...", "how to prevent ...", "is ... a side effect", "is ... common". Stays quiet: ${quiet(['What are the signs of low blood sugar?', 'can ozempic cause chest pain', 'is fainting a side effect', 'what should i do if i get low blood sugar'])}. It counts again when the sentence says the person has it ("my", except "my medication", "my shot", "my doctor", "my wife" and the like; "I have", "I'm", "I feel", "this pain", "now", "today", "again", "still"), or the next sentence does ("I have it", "mine is", "me too"): ${firing(['what are the signs of low blood sugar? I feel shaky and sweaty', 'can ozempic cause the chest pain I have now', 'does this cause chest pain? i have it now'])}. Other questions are not on the list and count: ${firing(["isn't chest pain serious?", 'Is severe stomach pain going to my back normal?', 'what should I do about this chest pain'])}. A statement is not a question and counts: ${firing(['the shot did cause severe stomach pain', 'showing symptoms of low blood sugar'])}.`,
      `**A warning, a thing to watch for, a question for the doctor, a fear.** The words before the symptom say someone warned about it, or the person will watch for it, ask about it or is afraid of it: "the leaflet says ...", "the label lists ...", "the nurse said to call if ...", "told me to watch for ...", "warned me about ...", "boxed warning", "the doctor mentioned ...", "watch out for ...", "keep an eye out for ...", "be aware of ...", "ask my doctor about ...", "ask if ...", "talk to my doctor about ...", "worried about ...", "afraid of ...", "scared I'll ...", "nervous that it might ...", "afraid to get ...", "my fear is ...". Stays quiet: ${quiet(['the leaflet says to call if you have severe stomach pain', 'my doctor told me to watch for vision changes', 'pharmacist warned me about pancreatitis', 'ask my doctor about chest pain', 'worried about getting pancreatitis', 'afraid I might faint'])}. It counts again when the words from there up to the symptom say the person has it ("my", "this", "I have", "now" and the other words of the paragraph above), or the words after it do (the same, without "my"), when "but" stands between, or when the next sentence says "I have it": ${firing(['ask about my chest pain', 'worried about this rash spreading'])}. "I'll", "I might" and "if I ..." speak of what may come and do not count as saying the person has it.`,
      `**Something that has not happened.** The sentence speaks of what might come: "what if ...", "what would I do if ...", "what happens if ...", "what to do if ...", "how would I know ...", a plan ("I'll call the doctor if ...", "going to stop if ..."), "in case of ...", "just in case", "I don't want to end up with ...", or "if I ..." or "if my ..." right before the symptom with an instruction after it ("if I pass out call my wife"). Stays quiet: ${quiet(['what if my throat swells up', 'in case of an allergic reaction', "I'll call the doctor if my vision changes", 'if I pass out call my wife'])}. "My" and "I" belong to such sentences and do not count; only words for the present do ("now", "today", "again", "still", "already", "anymore", "I'm having", "this chest pain", "my ... is"), or "but" in between, or a next sentence that says "I have it": ${firing(['what if this chest pain is my heart'])}.${notForReminders}`,
      `**The size of a pill.** Trouble swallowing does not count when it is said of a pill, tablet, capsule, vitamin, supplement, "meds", medication or medicine: the pill follows "swallow" (up to four small words may stand between: "this big pill"), or stands before it with "is", "are", "was", "were", "seems", "feels", "looks", "gets" or "got". Stays quiet: ${quiet(['hard to swallow this big pill', 'these pills are hard to swallow'])}. Still counts, also when food or drink is named too: ${firing(['trouble swallowing food', 'since starting my medication I have trouble swallowing', 'hard to swallow pills and food'])}.`,
      `**A figure of speech.** The words after the symptom name joy or a shock that is not a symptom ("with excitement", "with joy", "from laughing", "when I saw the price", "when I got the bill", "at the price", "I'm so excited", "in these jeans"), or the words before it do ("laughing so hard", "crying so hard", "that movie had my ..."). Stays quiet: ${quiet(['heart racing with excitement', 'almost fainted when I saw the price', "can't breathe in these jeans", "laughing so hard I couldn't breathe", 'that movie had my heart pounding'])}.`,
      `**Out of breath, or a pounding heart, from hard exercise.** A sign about breathing or the heart (a word with "breath", "wheez", "gasp", "winded", "heart" or "pulse", and no "pain", "hurt" or "ache") does not count when a run, a jog, a workout, the gym, cardio, a sprint, HIIT, a spin class, the treadmill, a Peloton, a hike, leg day, lifting, CrossFit, Zumba or burpees follows it as the cause ("after", "from", "during", "while" or "on"). Climbing stairs and walking are not on the list. Stays quiet: ${quiet(['out of breath after my run', 'heart pounding after my workout'])}. Counts: ${firing(['short of breath after climbing stairs', 'chest pain after my run'])}.`,
      `**Slight.** Three signs stay quiet when the person calls them slight (the **slight word** list): dizziness, a racing heart and hoarseness. Being short of breath or out of breath stays quiet after "less", "not as", "not so" or "no longer". Stays quiet: ${quiet(['a little dizzy', 'heart racing a bit', 'a little hoarse', 'less short of breath than yesterday'])}. Counts: ${firing(['dizzy', 'my heart is racing', 'my voice is hoarse'])}.`,
    ]),
  );
  return out;
}

/** The phrase lists of the corpus test, read as text. */
function readCorpus(): { positive: Record<string, string[]>; negative: Record<string, string[]> } {
  const src = source(CORPUS_TEST_FILE);
  const literalAfter = (marker: string): { [key: string]: Literal } => {
    const at = src.indexOf(marker);
    if (at < 0) throw new Error(`"${marker}" was not found in ${CORPUS_TEST_FILE}`);
    return readLiteral(src, src.indexOf('{', src.indexOf(' = ', at))).value as { [key: string]: Literal };
  };
  const families = { ...literalAfter('const GUIDE_FAMILIES'), ...literalAfter('const OTHER_FAMILIES') };
  const positive = Object.fromEntries(Object.entries(families).map(([family, v]) => [family, strings((v as { phrases: Literal }).phrases)]));
  const negative = Object.fromEntries(Object.entries(literalAfter('const NEGATIVE')).map(([why, v]) => [why, strings(v)]));
  if (!Object.keys(positive).length || !Object.keys(negative).length) throw new Error(`No phrases could be read from ${CORPUS_TEST_FILE}`);
  return { positive, negative };
}

function triggeringLines(tests: TestPhrases, counts: TriageCounts): string[] {
  const out: string[] = [];
  const testSource = source(TRIAGE_TEST_FILE);
  const inTests = (phrase: string) => testSource.includes(phrase) || testSource.includes(phrase.replace(/'/g, "\\'"));
  out.push('### 2.5 Known over- and under-triggering', '');
  out.push('The rules are tuned to fire too often rather than too seldom. The lists below show where that line sits today. Please mark every phrase that you think is on the wrong side.', '');

  out.push('**From the test suite: fires on purpose, although the person may be fine**', '');
  out.push(
    ...table(
      ['Code', 'Phrase', 'What the rules do today', 'Why'],
      TEST_PHRASES_THAT_FIRE_ON_PURPOSE.map(([phrase, why]) => {
        if (!inTests(phrase)) problems.push(`"${phrase}" is listed in TEST_PHRASES_THAT_FIRE_ON_PURPOSE but is no longer in ${TRIAGE_TEST_FILE}.`);
        if (!triageText(phrase, US_CONTEXT).length) problems.push(`"${phrase}" is listed as firing on purpose but stays quiet now.`);
        return [code('O'), q(phrase), outcome(phrase), why];
      }),
      [1, 5, 4, 6],
    ),
  );

  out.push('**From the test suite: stays quiet on purpose**', '');
  out.push(
    ...table(
      ['Code', 'Phrase', 'Why it stays quiet'],
      TEST_PHRASES_THAT_STAY_QUIET.map(([phrase, why]) => {
        if (!inTests(phrase)) problems.push(`"${phrase}" is listed in TEST_PHRASES_THAT_STAY_QUIET but is no longer in ${TRIAGE_TEST_FILE}.`);
        expectOutcome(phrase, null, 'TEST_PHRASES_THAT_STAY_QUIET');
        return [code('U'), q(phrase), why];
      }),
      [1, 5, 10],
    ),
  );
  for (const phrase of tests.quiet) expectOutcome(phrase, null, `${TRIAGE_TEST_FILE} (ENGLISH_QUIET)`);
  out.push(`All ${tests.quiet.length} English phrases the test suite requires to stay quiet: ${tests.quiet.map(q).join('; ')}.`, '');
  counts.testPhrases += tests.quiet.length + tests.negation.reduce((n, g) => n + g.phrases.length, 0);

  // The corpus: where the line sits, family by family.
  const corpus = readCorpus();
  const leadOf = (family: string): string => (family in ITEM_NAMES ? `Guide item (2.6): ${md(ITEM_NAMES[family as GuideItemId].toLowerCase())}` : family === 'crisis' ? 'Not from a guide: self-harm' : 'Chest pain (not from a guide) and passing out');
  out.push('**From the test suite: the corpus**', '');
  out.push(
    `A second test file holds phrases as people type them on a phone: lower case, no punctuation, misspellings, slang. Each phrase in the first table must raise the alert of section 2.1. Each phrase in the second table must raise nothing. The script that built this packet ran every one of them.`,
    '',
  );
  out.push(
    ...table(
      ['Code', 'What the phrases are about', 'Phrases that must raise the alert'],
      Object.entries(corpus.positive).map(([family, phrases]) => {
        for (const p of phrases) if (alertCards(triageText(p, { ...US_CONTEXT, drugId: 'tirzepatide' }), 'US', 'en', LAUNCH.triageDetailCards).length === 0) problems.push(`${CORPUS_TEST_FILE}: "${p}" raises no alert.`);
        return [code('Y'), leadOf(family), phrases.map(q).join('; ')];
      }),
      [1, 4, 12],
    ),
  );
  out.push(
    ...table(
      ['Code', 'Why it must raise nothing', 'Phrases'],
      Object.entries(corpus.negative).map(([why, phrases]) => {
        for (const p of phrases) expectOutcome(p, null, CORPUS_TEST_FILE);
        return [code('Z'), sentenceCase(why), phrases.map(q).join('; ')];
      }),
      [1, 4, 12],
    ),
  );
  counts.testPhrases += Object.values(corpus.positive).flat().length + Object.values(corpus.negative).flat().length;

  out.push('**Not in the test suite: extra phrases tried while building this packet**', '');
  out.push('Nobody has decided yet what these should do. The table shows what the rules do with each one today.', '');
  const firing = EXTRA_PROBES.filter((p) => triageText(p, US_CONTEXT).length > 0);
  const silent = EXTRA_PROBES.filter((p) => triageText(p, US_CONTEXT).length === 0);
  out.push(
    ...table(
      ['Code', 'Phrase', 'What the rules do today'],
      [...firing, ...silent].map((phrase) => {
        return [code('X'), q(phrase), outcome(phrase)];
      }),
      [1, 6, 6],
    ),
  );
  counts.probes = EXTRA_PROBES.length;
  return out;
}

// ── Sections 2.6 to 2.8: the Medication Guides and how the rules stand against them ──

/** What every row about the guides' words says about its own state. */
const COPIED_FROM_GUIDE = `Copied from the FDA Medication Guide on ${MED_GUIDES_READ_ON}; not yet confirmed by a reviewer`;

/** Short names for the items of the guides, for the tables of 2.7 and 2.8. The guides' own words are in 2.6. */
const ITEM_NAMES: Record<GuideItemId, string> = {
  thyroid_tumors: 'Thyroid tumors',
  thyroid_do_not_use: 'The "Do not use" statement about thyroid cancer',
  see_most_important: 'The pointer back to the first part of the guide',
  pancreatitis: 'Inflammation of the pancreas (pancreatitis)',
  gallbladder: 'Gallbladder problems',
  low_blood_sugar: 'Low blood sugar',
  kidney_dehydration: 'Dehydration leading to kidney problems',
  severe_stomach: 'Severe stomach problems',
  allergic_reaction: 'Serious allergic reactions',
  vision_changes: 'Changes in vision',
  heart_rate: 'Increased heart rate',
  aspiration_anesthesia: 'Food or liquid getting into the lungs during surgery or other procedures',
};

const ACTION_WORDS: Record<GuideAction, string> = {
  emergency: 'get medical help, or go to an emergency room, "right away"',
  right_away: 'tell or call the healthcare provider "right away"',
  tell: 'tell, call or talk to the healthcare provider (no "right away")',
  none: 'no instruction to contact anyone',
};

/** The brand names of a guide, as the app lists them. */
const brandsOf = (g: MedGuide): string => Object.keys(g.brands).join(', ');
const guideByKey = (key: string): MedGuide => {
  const g = MED_GUIDE_LIST.find((x) => x.key === key);
  if (!g) throw new Error(`no Medication Guide with the key "${key}"`);
  return g;
};
/** "all seven guides", or the brands of the guides named. */
function guidesWords(keys: string[]): string {
  return keys.length === MED_GUIDE_LIST.length ? `all ${MED_GUIDE_LIST.length} guides` : keys.map((k) => brandsOf(guideByKey(k))).join('; ');
}

interface GuideCounts {
  guides: number;
  items: number;
  signs: number;
}

/** Item code of each guide item as section 2.6 prints it, by guide key and item id. Section 2.7 points back with it. */
const guideItemCode = new Map<string, string>();

function guideSections(counts: GuideCounts): string[] {
  const out: string[] = [];
  const ref = ruleRef;

  // 2.6 The lists, word for word.
  out.push('### 2.6 The warning signs shown in the app: the words of the Medication Guides', '');
  out.push(
    `The app has one screen named ${q(screenText('guide.title'))}. A person opens it from the ${q(screenText('tab.me'))} tab, or with the button on an alert (2.1). It shows three parts of the FDA Medication Guide of the person's own medication: the "most important information", the serious side effects, and the sentence about taking too much under the heading it has in the guide. Only a profile whose region is the United States sees a guide: for every other region the screen shows the line that no guide is on file (below), also for a brand sold there under the same name. The sentence about taking too much is quoted for every guide at the end of section 2.7. The text is the guide's own, in the guide's order, with its sub-bullets as bullets. The app adds no word to the list, sets nothing in bold and marks no item as more urgent than another.`,
    '',
  );
  out.push(`**Status of everything quoted in this section:** ${COPIED_FROM_GUIDE}. A script took the words from the label files published on DailyMed, and a second script checked every one of them against those files. No person outside our team has compared them with the guides.`, '');
  out.push('Above the list the screen says where it is from. These words are ours:', '');
  const example = MED_GUIDE_LIST[0];
  const exampleBrand = Object.keys(example.brands)[0];
  out.push(
    ...table(
      ['Code', 'Where', 'Screen text'],
      [
        [code('T'), 'First line, for every guide', q(screenText('guide.source', { brand: '[brand]', dated: '[revised or issued, and the date of the guide]' }))],
        [code('T'), `The same line for ${exampleBrand}`, q(screenText('guide.source', { brand: exampleBrand, dated: guideDated(example, 'en') }))],
        [code('T'), 'Second line, followed by the page address as a link', q(screenText('guide.parts'))],
        [code('T'), 'No guide to show: any region other than the United States, no medication set up, "Other / custom", a medication with no US brand', q(screenText('guide.none'))],
        [code('T'), 'Tirzepatide in the United States, when the person has not said whether it is Zepbound or Mounjaro', q(screenText('guide.chooseBrand', { brands: 'Zepbound and Mounjaro', button: screenText('me.med.change') }))],
      ],
      [1, 6, 10],
    ),
  );
  out.push(
    `The copy keeps the label file's punctuation, capital letters and spacing, also where a space is missing or one too many. Runs of spaces are written as one, and bold type is dropped. Sub-bullets are in the order the label file stores them; the printed guides set them in columns.`,
    '',
  );
  for (const g of MED_GUIDE_LIST) {
    out.push(`#### ${code('G')} · Medication Guide for ${brandsOf(g)}`, '');
    out.push(
      ...list([
        `**Title:** ${q(g.title)}`,
        `**Date line of the guide:** ${q(g.revised)}, after ${q(g.approval)}`,
        `**Label on DailyMed:** set id ${g.setid}, version ${g.version}, effective ${isoDay(g.effective)}. ${g.url}`,
        `**Status:** ${COPIED_FROM_GUIDE}`,
      ]),
    );
    const part = (section: GuideSection): string[] => {
      const lines = [`**${md(section.question)}**`, '', md(section.intro), ''];
      for (const item of section.items) {
        const itemCode = code('I');
        guideItemCode.set(`${g.key}/${item.id}`, itemCode);
        lines.push(`- \`${itemCode}\` ${md(item.text)}`);
        for (const b of item.bullets) lines.push(`  - ${md(b)}`);
        if (item.after !== undefined) lines.push('', `  ${md(item.after)}`);
        counts.items += 1;
      }
      return [...lines, ''];
    };
    out.push(...part(g.mostImportant), ...part(g.seriousSideEffects));
    counts.guides += 1;
  }

  // 2.7 From the guides to the rules.
  out.push('### 2.7 From the guides to the rules: which rule stands for each item', '');
  out.push(
    `This table is our reading, not the guides'. For each item of section 2.6 it gives what the guides tell the patient to do, each sign the item names (in the guides' words), and the rule that raises the alert when a person describes that sign as their own. Where no rule does, the last column says why. The script that built this packet typed each sign into the rules, with "your" changed to "my", and checked the outcome.`,
    '',
  );
  const actionsOf = (item: GuideItemId): string => {
    const byAction = new Map<GuideAction, string[]>();
    for (const g of MED_GUIDE_LIST) {
      const found = guideItems(g).find((i) => i.id === item);
      if (found) byAction.set(found.action, [...(byAction.get(found.action) ?? []), g.key]);
    }
    return [...byAction.entries()].map(([action, keys]) => (byAction.size === 1 ? `${sentenceCase(ACTION_WORDS[action])} (${guidesWords(keys)})` : `${sentenceCase(ACTION_WORDS[action])}: ${keys.map((k) => brandsOf(guideByKey(k))).join('; ')}`)).join('. ');
  };
  const stopOf = (item: GuideItemId): string => (MED_GUIDE_LIST.some((g) => guideItems(g).some((i) => i.id === item && i.stopUsing)) ? ' The instruction begins "Stop using" or "Stop taking".' : '');
  const rows: string[][] = [];
  for (const row of ITEM_COVERAGE) {
    const codes = MED_GUIDE_LIST.map((g) => guideItemCode.get(`${g.key}/${row.item}`)).filter((c): c is string => c !== undefined);
    const itemCell = `${md(ITEM_NAMES[row.item])} (${codes.join(', ')})`;
    const actionCell = `${actionsOf(row.item)}.${stopOf(row.item)}`;
    if (row.signs.length === 0) {
      rows.push([code('K'), itemCell, actionCell, 'Names no sign', row.reminder ? `No alert. The reminder rule ${ref(row.reminder)} matches such text; it shows no alert in the first public version (2.1)` : 'No rule', md(row.reason ?? '')]);
      continue;
    }
    row.signs.forEach((sign, i) => {
      const typed = sign.words.map((w) => w.replace(/\byour\b/g, 'my'));
      for (const t of typed) {
        const fired = triageText(t, { ...US_CONTEXT, drugId: 'tirzepatide' }).map((h) => h.id);
        if (sign.alone && !fired.some((id) => sign.rules.includes(id))) problems.push(`Section 2.7: "${t}" does not raise ${sign.rules.join(' or ')} (it raises ${fired.join(', ') || 'nothing'}).`);
      }
      const buttons = (sign.buttons ?? []).map((b) => `the "${symptomLabel(b, 'en')}" button at "${gradeLabel(3, 'en')}"`);
      const ruleCell = sign.alone
        ? `${sign.rules.map(ref).join(', ')}${buttons.length ? `; ${buttons.join(', ')}` : ''}`
        : `Alone: nothing. With another sign of the list: ${sign.rules.map(ref).join(', ')}`;
      rows.push([code('K'), i === 0 ? itemCell : '', i === 0 ? actionCell : '', sign.words.map((w) => q(w)).join(' / '), ruleCell, md([sign.reason, sign.note].filter(Boolean).join(' '))]);
      counts.signs += 1;
    });
  }
  out.push(...table(['Code', 'Item of the guides (codes in 2.6)', 'What the guides tell the patient to do', 'Sign, in the guides\' words', 'What raises the alert', 'Reason or note'], rows, [1, 5, 5, 5, 5, 7]));

  out.push('**The other instructions of the guides.** Outside the two parts, the guides tell the patient in a few more places to tell, call or talk to someone. Only one of these names signs: the Wegovy sentence about taking too much (severe nausea, severe vomiting, severe low blood sugar). The app shows the sentence about taking too much on the screen (2.6); it shows none of the others, and raises no alert for any of them:', '');
  const kinds = Object.keys(OTHER_COVERAGE) as (keyof typeof OTHER_COVERAGE)[];
  out.push(
    ...table(
      ['Code', 'Kind of instruction', 'In the guides for', 'Example, word for word', 'What the app does'],
      kinds.map((kind) => {
        const keys = MED_GUIDE_LIST.filter((g) => MED_GUIDE_OTHER[g.key as MedGuideKey].some((o) => o.kind === kind)).map((g) => g.key);
        const first = guideByKey(keys[0]);
        const example = MED_GUIDE_OTHER[first.key as MedGuideKey].find((o) => o.kind === kind)!;
        const actions = [...new Set(MED_GUIDE_LIST.flatMap((g) => MED_GUIDE_OTHER[g.key as MedGuideKey].filter((o) => o.kind === kind).map((o) => o.action)))];
        const does = OTHER_COVERAGE[kind];
        return [
          code('K'),
          `${sentenceCase(kind.replace(/_/g, ' '))} (${actions.map((a) => ACTION_WORDS[a]).join('; ')})`,
          guidesWords(keys),
          `${brandsOf(first)}: ${example.under ? `under ${q(example.under)}: ` : ''}${q(example.text)}`,
          `${does.reminder ? `No alert. The reminder rule ${ref(does.reminder)} matches such text; it shows no alert in the first public version. ` : 'No rule. '}${md(does.reason)}`,
        ];
      }),
      [1, 4, 3, 9, 6],
    ),
  );
  const overdose = MED_GUIDE_LIST.map((g) => ({ g, o: MED_GUIDE_OTHER[g.key as MedGuideKey].find((x) => x.kind === 'overdose') })).filter((x) => x.o);
  if (overdose.length) {
    out.push('The one instruction among them that names an emergency room is the sentence about taking too much. In every guide, word for word:', '');
    out.push(...table(['Code', 'Guide', 'The guide\'s words', 'Status'], overdose.map(({ g, o }) => [code('K'), brandsOf(g), q(o!.text), COPIED_FROM_GUIDE]), [1, 3, 10, 4]));
  }

  // 2.8 From the rules to the guides.
  out.push('### 2.8 From the rules to the guides: the basis of each rule', '');
  out.push(
    `Every rule that shows an alert in the first public version must stand for an item of the guides, or carry the mark "${GENERAL_SIGN}" with the reason it is kept. A rule with neither would be taken out of the first public version. Today none is. An item is named here by a short name of ours; where it is not in every guide, the guides that have it follow in brackets.`,
    '',
  );
  const itemWords = (item: GuideItemId) => `${md(ITEM_NAMES[item])}${guidesWithItem(item).length === MED_GUIDE_LIST.length ? '' : ` (${guidesWords(guidesWithItem(item))})`}`;
  out.push(
    ...table(
      ['Rule', 'Alert in the first public version', 'Guide items it stands for', 'Parts with no guide behind them'],
      [...ruleCode.keys()].map((id) => {
        const rule = id as TriageId;
        const items = ruleItems(rule);
        const reminders = reminderFor(rule);
        const without = NOT_FROM_A_GUIDE.filter((n) => n.rule === rule);
        if (showsLaunchCard(rule) && items.length === 0 && !without.some((n) => n.whole)) problems.push(`Rule "${rule}" shows an alert in the first public version but has no guide item and no mark. See src/core/guideCoverage.ts.`);
        const itemsCell = items.length
          ? items.map(itemWords).join('; ')
          : reminders.length
            ? `None as an alert. As a reminder it matches text about: ${reminders.map((r) => r.replace(/_/g, ' ')).join(', ')} (2.7)`
            : 'None';
        return [
          ref(rule),
          showsLaunchCard(rule) ? (rule === 'crisis' ? 'Its own card' : 'The fixed card') : 'None',
          itemsCell,
          without.length ? without.map((n) => `**${showsLaunchCard(rule) ? sentenceCase(GENERAL_SIGN) : 'Not from a Medication Guide'}**: ${md(n.part)}. ${md(n.reason)}`).join(' ') : '',
        ];
      }),
      [3, 3, 8, 8],
    ),
  );
  out.push(`**The symptom buttons at "${gradeLabel(3, 'en')}"** (2.2), checked against the guides one by one:`, '');
  out.push(
    ...table(
      ['Code', 'Button', 'Rule it raises', 'Guide items it stands for, or why it raises nothing'],
      SYMPTOM_ORDER.map((kind) => {
        const items = buttonItems(kind);
        const rules = buttonRules(kind);
        const why = BUTTONS_THAT_RAISE_NOTHING[kind];
        if ((items.length === 0) !== (rules.length === 0) || (items.length === 0 && !why)) problems.push(`Symptom button "${kind}" is not accounted for in src/core/guideCoverage.ts.`);
        return [code('K'), md(symptomLabel(kind, 'en')), rules.length ? rules.map(ref).join(', ') : 'None', items.length ? items.map(itemWords).join('; ') : md(why ?? '')];
      }),
      [1, 3, 4, 10],
    ),
  );
  const fixedFromButtons = SYMPTOM_ORDER.filter((kind) => CONTEXTS.some((c) => triageSymptom(kind, 3, c).some((h) => h.fixedCard)));
  if (fixedFromButtons.length) {
    const named = fixedFromButtons.map((kind) => {
      const hits = CONTEXTS.flatMap((c) => triageSymptom(kind, 3, c));
      const fixedRules = [...new Set(hits.filter((h) => h.fixedCard).map((h) => h.id))];
      return hits.every((h) => h.fixedCard) ? q(symptomLabel(kind, 'en')) : `${q(symptomLabel(kind, 'en'))} (only where it raises ${fixedRules.map(ruleRef).join(', ')})`;
    });
    out.push(`The alerts of ${named.join(' and ')} are marked to show the fixed card (2.2): the card written for ${ruleRef('dehydration')} does not name nausea or dizziness.`, '');
  }
  return out;
}

// ── Section 3: texts hidden until reviewed ───────────────────────────────────

const HIDDEN = '**Hidden until reviewed**';
const launchStatus = (shownAtLaunch: boolean): string => (shownAtLaunch ? 'Shown in the first public version' : HIDDEN);

/** Numbers passed into advice texts so they can be found again and shown as placeholders. */
const SENTINEL = { minimum: 9871, escalationDay: 9872, dayAfterShot: 9873, dayOff: 9875 };

function withPlaceholders(text: string): string {
  return text
    .replaceAll(String(SENTINEL.minimum), '[minimum]')
    .replaceAll(String(SENTINEL.escalationDay), '[N]')
    .replaceAll(String(SENTINEL.dayAfterShot), '[N]')
    .replaceAll(String(SENTINEL.dayOff), '[N]');
}

interface AdviceCase {
  when: string;
  advice: Advice;
  oral: boolean;
  withMinimum: boolean;
}

/** One case for every text adviceText() can return. "When" is described from todayAdvice() in src/core/today.ts. */
function adviceCases(): AdviceCase[] {
  const doseDay = 'The status is "Increasing dose" or "Maintenance dose", and the next dose is due today or its time has come';
  const overdue = 'The status is "Increasing dose" or "Maintenance dose", and the dose time passed more than 12 hours ago with nothing logged';
  const increase = 'Within 14 days after the first dose at a higher amount than before (the first dose ever logged also counts)';
  const highDay = `Today is one of the person's own high-symptom days (section 6.4)`;
  const normalTrain = 'None of the cases above; fewer than 2 workouts logged this week (the week starts on Monday) and none today or yesterday';
  const normal = 'None of the cases above';
  const hit: TriageHit = { id: 'dehydration', level: 'urgent' };
  return [
    { when: `An alert was raised today and has not been closed yet, or an alert that pauses the day's tips was raised today`, advice: { kind: 'triage', hit }, oral: false, withMinimum: true },
    { when: `${overdue}. Shot`, advice: { kind: 'dose_day', dueMs: 0, status: 'overdue' }, oral: false, withMinimum: true },
    { when: `${overdue}. Pill`, advice: { kind: 'dose_day', dueMs: 0, status: 'overdue' }, oral: true, withMinimum: true },
    { when: `${doseDay}. Shot, the person has a protein minimum`, advice: { kind: 'dose_day', dueMs: 0, status: 'due' }, oral: false, withMinimum: true },
    { when: `${doseDay}. Shot, no protein minimum`, advice: { kind: 'dose_day', dueMs: 0, status: 'due' }, oral: false, withMinimum: false },
    { when: `${doseDay}. Pill`, advice: { kind: 'dose_day', dueMs: 0, status: 'due' }, oral: true, withMinimum: true },
    { when: `${increase}. With a protein minimum`, advice: { kind: 'escalation', dayOfEscalation: SENTINEL.escalationDay, currentMg: 1 }, oral: false, withMinimum: true },
    { when: `${increase}. No protein minimum`, advice: { kind: 'escalation', dayOfEscalation: SENTINEL.escalationDay, currentMg: 1 }, oral: false, withMinimum: false },
    { when: `${highDay}. With a protein minimum`, advice: { kind: 'high_symptom', offset: SENTINEL.dayAfterShot }, oral: false, withMinimum: true },
    { when: `${highDay}. No protein minimum`, advice: { kind: 'high_symptom', offset: SENTINEL.dayAfterShot }, oral: false, withMinimum: false },
    { when: 'On each of the last 3 days food was logged and the protein total was under the minimum', advice: { kind: 'protein_low', days: 3, floorG: SENTINEL.minimum }, oral: false, withMinimum: true },
    { when: 'The status is "Stopped" and the stop date is known', advice: { kind: 'stopped', daysSince: SENTINEL.dayOff - 1 }, oral: false, withMinimum: true },
    { when: 'The status is "Stopped" and the stop date is not known', advice: { kind: 'stopped', daysSince: null }, oral: false, withMinimum: true },
    { when: `${normalTrain}. With a protein minimum`, advice: { kind: 'normal', train: true, offset: null }, oral: false, withMinimum: true },
    { when: `${normalTrain}. No protein minimum`, advice: { kind: 'normal', train: true, offset: null }, oral: false, withMinimum: false },
    { when: `${normal}. With a protein minimum`, advice: { kind: 'normal', train: false, offset: null }, oral: false, withMinimum: true },
    { when: `${normal}. No protein minimum`, advice: { kind: 'normal', train: false, offset: null }, oral: false, withMinimum: false },
  ];
}

interface HiddenCounts {
  copingCards: number;
  copingLines: number;
  adviceTexts: number;
  routines: number;
  exercises: number;
}

/** Texts whose numbers are collected again in section 6, as [where, text]. */
const textsWithNumbers: [string, string][] = [];

function hiddenTextsSection(counts: HiddenCounts): string[] {
  const out: string[] = [];
  out.push('## 3. Texts that are hidden until reviewed', '');
  const allHidden = !LAUNCH.copingCards && !LAUNCH.dailyAdvice && !LAUNCH.workouts;
  out.push(
    allHidden
      ? 'Nothing in this section is shown in the first public version. Each part is switched off until it has been reviewed and corrected. The texts are printed exactly as the code has them.'
      : 'The texts are printed exactly as the code has them. Each part says whether it is shown in the first public version.',
    '',
  );

  // 3.1 Coping cards.
  const cards = copingCards('en');
  out.push('### 3.1 Coping cards', '');
  out.push(`Status: ${launchStatus(LAUNCH.copingCards)}.`, '');
  const sourceLine = (card: (typeof cards)[number]) => screenText('coping.sources', { sources: card.sources.join(screenText('coping.sourceSeparator')) });
  const sameSources = cards.every((c) => sourceLine(c) === sourceLine(cards[0]));
  out.push('A coping card is offered after a person logs a symptom that did not raise an alert. Each card has three lists.', '');
  if (sameSources && cards.length) out.push(`Under every card the app prints this line: ${q(sourceLine(cards[0]))}`, '');
  cards.forEach((card, n) => {
    const cardCode = `C-${n + 1}`;
    out.push(`#### ${cardCode} · ${md(card.title)}`, '');
    out.push(`Status: ${launchStatus(LAUNCH.copingCards)}. Offered after: ${card.forSymptoms.map((k) => symptomLabel(k, 'en')).join(', ')}.`, '');
    const rows: string[][] = [];
    const add = (heading: string, lines: string[]) =>
      lines.forEach((line) => {
        const lineCode = `${cardCode}.${rows.length + 1}`;
        rows.push([lineCode, md(heading), md(line)]);
        textsWithNumbers.push([lineCode, line]);
      });
    add(screenText('coping.try'), card.tryFirst);
    add(screenText('coping.avoid'), card.avoid);
    add(screenText('coping.seeDoctor'), card.seeDoctor);
    out.push(...table(['Code', 'List on the card', 'Line'], rows, [1, 3, 10]));
    if (!sameSources) out.push(`Line under this card: ${q(sourceLine(card))}`, '');
    counts.copingLines += rows.length;
  });
  counts.copingCards = cards.length;

  // 3.2 Daily advice.
  out.push('### 3.2 Daily advice', '');
  out.push(`Status: ${launchStatus(LAUNCH.dailyAdvice)}.`, '');
  out.push(
    'One advice card sits at the top of the main screen. The app goes down the list below and shows the first case that fits. In the texts, [minimum] stands for the protein minimum of that person in grams (section 6.1) and [N] for a day count.',
    '',
  );
  const adviceRows = adviceCases().map((c) => {
    const text = adviceText(c.advice, c.withMinimum ? { kind: 'manual', floorG: SENTINEL.minimum } : { kind: 'off' }, { oral: c.oral, lang: 'en' });
    const adviceCode = code('A');
    const body = withPlaceholders(text.body);
    textsWithNumbers.push([adviceCode, body]);
    return [adviceCode, `${c.when}.`, md(withPlaceholders(text.title)), md(body)];
  });
  out.push(...table(['Code', 'When it shows', 'Title', 'Text'], adviceRows, [1, 5, 3, 8]));
  counts.adviceTexts = adviceRows.length;

  // 3.3 Workouts.
  out.push('### 3.3 Workouts', '');
  out.push(`Status: ${launchStatus(LAUNCH.workouts)}.`, '');
  out.push(
    `A person picks one of ${plural(ROUTINE_IDS.length, 'routine')} and one of two versions: ${q(screenText('workout.standardLong'))} or ${q(screenText('workout.lightLong'))}. The app only records that the workout was done. Under every routine it says: ${q(screenText('workout.note'))}`,
    '',
  );
  textsWithNumbers.push(['3.3', screenText('workout.note')]);
  if (screenCodeHas('src/web/screens/Trends.tsx', /features\.workouts && <WorkoutWeek/, 'the weekly workout count')) {
    const weekCount = screenTextMany('trends.workouts.body', { count: '[N]' });
    out.push(`The trends screen counts the workouts of the last 7 days and says: ${q(weekCount)}`, '');
    textsWithNumbers.push(['3.3', weekCount]);
  }
  ROUTINE_IDS.forEach((routine, n) => {
    const routineCode = `W-${n + 1}`;
    out.push(`#### ${routineCode} · ${md(routineTitle(routine, 'en'))}`, '');
    const exercises = routineExercises(routine, 'en');
    out.push(
      ...table(
        ['Code', 'Exercise', 'How to do it', 'Standard', 'Light'],
        exercises.map((e, i) => [`${routineCode}.${i + 1}`, md(e.name), md(e.how), md(e.standard), md(e.light)]),
        [1, 3, 8, 3, 3],
      ),
    );
    counts.exercises += exercises.length;
  });
  counts.routines = ROUTINE_IDS.length;
  return out;
}

// ── Section 4: US medication list ────────────────────────────────────────────

const NOT_CHECKED = 'From code, not yet checked against the FDA label';
const BLANK_IN_APP = 'Not in the app. Left blank until it is read from the FDA label';
/** Status of a number that has its row in src/core/labelFacts.ts. The day is the day the labels were read. */
const READ_FROM_LABEL = `Read from the FDA label on ${LABELS_READ_ON}; not yet confirmed by a reviewer`;
const NO_CHART_NUMBER = 'Not in the app. The chart is for weekly shots only, so no number is kept for a medication taken every day';

const hoursWords = (h: number): string => (h % 24 === 0 ? `${h} hours (${plural(h / 24, 'day')})` : h % 12 === 0 ? `${h} hours (${h / 24} days)` : `${h} hours`);
/** "20260618" as "2026-06-18". */
const isoDay = (yyyymmdd: string): string => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

interface MedicationCounts {
  brands: number;
  entries: number;
  rows: number;
  numbers: number;
  /** Numbers that have their label words in the table. */
  fromLabel: number;
  labels: number;
}

/** One US brand: a row of the picker, with the numbers of its own label. "Other / custom" is left out. */
interface UsBrand {
  brand: string;
  entry: DrugEntry;
  numbers: DrugNumbers;
}

/** The US brand list, in the order the app shows it. */
function usBrands(): UsBrand[] {
  return brandOptions('US').flatMap((o) => (o.brand === null ? [] : [{ brand: o.brand, entry: o.entry, numbers: brandNumbers(o.entry, o.brand) }]));
}

/** The label a brand's rows were read from, where it has rows. */
function labelOf(b: UsBrand): LabelDoc | null {
  return (['frequency', 'ladderMg', 'maxMg', 'halfLifeH', 'tmaxH', 'fastingMin'] as LabelField[]).map((f) => labelFact(b.entry.id, b.brand, f)?.label).find((l) => l !== undefined) ?? null;
}

/** What a label states for a half-life or a time to peak, in words: "a range, 1 to 3 days". */
function statedWords(s: StatedTime): string {
  if (s.kind === 'range') return `a range, ${s.low} to ${s.high} ${s.unit}s`;
  return `${s.kind === 'median' ? 'a median' : 'a single value'}, ${plural(s.value, s.unit)}`;
}

/** The cell that says where a number comes from: the status, the label's words with their sections, how the number follows, and the page. */
function provenanceCell(fact: LabelFact | undefined, matches: boolean, fallback: string): string {
  if (!fact || !matches) return fallback;
  const words = fact.quotes.map((quote) => `${q(quote.text)} (section ${quote.section})`).join('; ');
  const parts = [`${READ_FROM_LABEL}.`, `Label words: ${words}.`];
  if (fact.stated) parts.push(`The label states ${statedWords(fact.stated)}; the app uses ${hoursWords(hoursFromLabel(fact.stated))}.`);
  else if (fact.rule) parts.push(`How the number follows: ${md(fact.rule)}`);
  if (fact.note) parts.push(`Note: ${md(fact.note)}`);
  parts.push(`Label page: ${fact.label.url}`);
  return parts.join(' ');
}

const sameSteps = (a: unknown, b: number[]): boolean => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

function medicationSection(counts: MedicationCounts): string[] {
  const out: string[] = [];
  const brands = usBrands();
  const hasCustom = brandOptions('US').some((o) => o.entry.id === 'custom');
  const anyVerified = brands.some((b) => b.entry.verified);
  const labels = [...new Set(brands.map(labelOf).filter((l): l is LabelDoc => l !== null))];
  counts.brands = brands.length;
  counts.entries = new Set(brands.map((b) => b.entry.id)).size;
  counts.labels = labels.length;

  out.push('## 4. US medication list', '');
  out.push(
    `At setup a US user picks one of ${plural(counts.brands, 'brand')}${hasCustom ? ', or "Other / custom"' : ''}: ${brands.map((b) => b.brand).join(', ')}. Brand names are used only so that people can find their own medication. Trademarks belong to their owners. The app is not connected to any drug maker.`,
    '',
  );
  const pills = brands.filter((b) => / pill$/.test(b.brand));
  if (pills.length) {
    out.push(
      `${pills.map((b) => `"${b.brand}"`).join(' and ')} ${pills.length === 1 ? 'is the name the app gives' : 'are the names the app gives'} to the tablets sold under a brand name that is also a shot. They are separate rows, with the doses of the tablets.`,
      '',
    );
  }
  out.push('How the app uses each number:', '');
  // The countdown on the main screen has its own wording, which says less than the line on the sheet.
  const countdown = screenCodeHas('src/web/screens/Today.tsx', /d\.fastingUntil && <div className="due">\{t\('today\.fasting'/, 'the countdown after a pill on the main screen') ? screenTextMany('today.fasting', { count: '[minutes]' }) : null;
  out.push(
    ...list([
      `**Dose steps.** Every dose of the adult schedule in section 2 of the label, from the starting dose up to the highest dose the label gives to any adult. A dose the label gives for one of its uses only is still a step, and the note in its row says who it is for. ${
        screenCodeHas('src/web/screens/Onboarding.tsx', /example !== null \? t\('onb\.dose\.example', \{ dose: example \}\)/, 'how the dose steps are used')
          ? `Only the first step is used: at setup it is the grey example in the box where a person types the dose they were prescribed (${q(screenText('onb.dose.example', { dose: '[first step]' }))}).`
          : 'Used only as an example in the box where a person types the dose they were prescribed.'
      } The app never suggests a step and never says when to move up.`,
      `**Highest dose.** The highest dose the label gives to any adult. A typing check, nothing more. When a person types a dose in mg above this number, at setup or when logging a dose, the app asks once: ${q(screenText('dose.overMax.form', { amount: '[amount]', unit: 'mg', max: '[highest dose]', name: '[US brand]' }))} Then it lets them go on. The line names the US brand whose label the number is from; for a person whose medication has another brand name, or none, that is the US brand of the same medication. Doses in other units are not checked and never converted.`,
      `**Half-life and time to peak.** Used only for the chart in section 5, and kept only for weekly shots. The chart needs one number for each. Our rule: ${PK_RULE}`,
      `**Wait after a pill.** Kept only where the label states a waiting time. On the sheet where a pill is logged the app shows: ${q(screenText('dose.fasting', { minutes: '[minutes]' }))} ${
        countdown ? `After the pill is logged, the main screen counts those minutes down: ${q(countdown)}. Both lines follow the label's sentence about the wait. The app says nothing about water. A pill logged with a time that is still to come starts no countdown.` : 'After the pill is logged, the main screen counts those minutes down.'
      }`,
    ]),
  );
  const backed = brands.filter((b) => hasLabelSource(b.entry));
  const factsAtLaunch = brands.filter((b) => labelFactsShown(b.entry, LAUNCH)).map((b) => b.brand);
  out.push(
    backed.length
      ? `**Where the numbers come from.** We read the numbers of ${backed.length === brands.length ? 'every brand below' : backed.map((b) => b.brand).join(', ')} on the current US prescribing information (the FDA label, as published on DailyMed) on ${LABELS_READ_ON}. For each number the table gives the label's own words, the label section and the label page. Words are copied as they stand; " \\| " marks the line between two cells of a table row. ${anyVerified ? '' : 'Nobody outside our team has confirmed these numbers: that is what we ask of you here.'}`
      : `No number has been read from a label yet. **Every number below is from the code and has not been checked against the FDA label.**${anyVerified ? '' : ' No entry has been marked as checked by a person.'}`,
    '',
  );
  if (LAUNCH.curveNeedsSource) {
    out.push(
      `**In the first public version a number is used only when it was read from the label.** That holds for the chart and for the three other uses above: the dose example, the typing check and the wait after a pill. The app checks this by itself: a medication whose numbers do not all have their label words in the table below shows none of them and can only be logged. ${
        factsAtLaunch.length === brands.length ? 'Today every brand below passes that check.' : factsAtLaunch.length ? `Today that check is passed by ${factsAtLaunch.join(', ')} only.` : 'Today no brand passes that check.'
      } The full test version uses every number below as it stands.`,
      '',
    );
  }
  if (labels.length) {
    out.push('The label versions that were read:', '');
    out.push(...table(['Label', 'Version', 'Effective date', 'DailyMed set id', 'Page'], labels.map((l) => [md(l.title), l.version, isoDay(l.effective), l.setid, l.url]), [6, 1, 2, 5, 8]));
  }
  out.push(
    'Please write the correct value and the label section (for example "2.2" or "12.3") in the two blank columns. Leave a cell empty when the value in the app is right, and write "OK" in the label column. Where the app has no value, please give one from the label, or tell us that the label gives none.',
    '',
  );

  for (const b of brands) {
    const { brand, entry, numbers: n } = b;
    const label = labelOf(b);
    out.push(`#### ${brand} (${entry.ingredient ?? entry.generic.en})`, '');
    const sharing = brands.filter((x) => x.entry.id === entry.id && x.brand !== brand).map((x) => x.brand);
    if (sharing.length) out.push(`${brand} and ${sharing.join(' and ')} are one medication in the app. Each has the numbers of its own label, and where the two labels differ the numbers differ.`, '');
    if (label) out.push(`Label read: ${md(label.title)}, version ${label.version}, effective ${isoDay(label.effective)}.`, '');
    const rows: string[][] = [];
    const row = (what: string, value: string, status: string, numbers = 0, fromLabel = false) => {
      rows.push([code('M'), what, value, status, '', '']);
      counts.numbers += numbers;
      if (fromLabel) counts.fromLabel += numbers;
    };
    /** A number with its label row. The row counts only when it holds the same value as the app. */
    const numberRow = (what: string, value: string, field: LabelField, present: boolean, matches: (f: LabelFact) => boolean, numbers: number, blank = BLANK_IN_APP) => {
      const fact = labelFact(entry.id, brand, field);
      const ok = fact !== undefined && matches(fact);
      row(what, value, present ? provenanceCell(fact, ok, NOT_CHECKED) : ok ? provenanceCell(fact, true, blank) : blank, present ? numbers : 0, present && ok);
    };
    row('Brand name', brand, NOT_CHECKED);
    row('Generic name', entry.ingredient ?? entry.generic.en, NOT_CHECKED);
    row('How it is taken', entry.route === 'oral' ? 'Pill, by mouth' : 'Shot, under the skin', NOT_CHECKED);
    numberRow('How often', entry.frequency === 'daily' ? 'Once a day' : 'Once a week', 'frequency', true, (f) => f.value === entry.frequency, 0);
    numberRow('Dose steps (mg)', n.ladderMg.join(', '), 'ladderMg', n.ladderMg.length > 0, (f) => sameSteps(f.value, n.ladderMg), n.ladderMg.length);
    numberRow('Highest dose for the typing check (mg)', n.maxMg === null ? '' : String(n.maxMg), 'maxMg', n.maxMg !== null, (f) => f.value === n.maxMg, 1);
    const noPk = entry.frequency === 'daily' ? NO_CHART_NUMBER : BLANK_IN_APP;
    numberRow('Half-life used for the chart', n.pk ? hoursWords(n.pk.halfLifeH) : '', 'halfLifeH', n.pk !== null, (f) => f.value === n.pk?.halfLifeH, 1, noPk);
    numberRow('Time to peak used for the chart', n.pk ? hoursWords(n.pk.tmaxH) : '', 'tmaxH', n.pk !== null, (f) => f.value === n.pk?.tmaxH, 1, noPk);
    if (entry.route === 'oral') {
      // A tablet without a wait still has a row when the label was read: the words that say no wait is needed.
      numberRow('Wait after the pill (minutes)', n.fastingMin ? String(n.fastingMin) : '', 'fastingMin', n.fastingMin !== undefined, (f) => f.value === (n.fastingMin ?? null), 1, 'Not in the app. No wait is shown for this medication');
    }
    out.push(...table(['Code', 'What', 'In the app', 'Where it comes from', 'Your correction', 'Label section'], rows, [1, 4, 3, 12, 3, 2]));
    counts.rows += rows.length;
    const drawn = (on: boolean) => (on ? 'drawn' : 'not drawn');
    const why = !n.pk ? ' (the app has no half-life and time to peak for it)' : !curveAvailable(entry, LAUNCH, brand) ? ' (its numbers do not all have their label words)' : '';
    out.push(`Chart of the estimated medication level: ${drawn(curveAvailable(entry, LAUNCH, brand))} in the first public version${why}; ${drawn(curveAvailable(entry, FULL, brand))} in the full test version.`, '');
    const otherUses = [n.ladderMg.length ? 'the dose example' : '', n.maxMg !== null ? 'the typing check' : '', n.fastingMin ? 'the wait after a pill' : ''].filter(Boolean);
    if (otherUses.length) out.push(`${sentenceCase(otherUses.join(', '))}: ${labelFactsShown(entry, LAUNCH) ? 'used' : 'not used'} in the first public version${labelFactsShown(entry, LAUNCH) ? '' : ' (its numbers do not all have their label words)'}; used in the full test version.`, '');
  }
  // A regimen can be saved without a brand name; where two brands of one medication have different chart numbers the app then has none.
  const split = [...new Set(brands.filter((b) => b.entry.byBrand && brandNumbers(b.entry).pk === null && b.numbers.pk !== null).map((b) => b.entry))];
  for (const entry of split) {
    const names = brands.filter((b) => b.entry.id === entry.id).map((b) => b.brand);
    out.push(
      `**${sentenceCase(entry.ingredient ?? entry.generic.en)} without a brand name.** A person whose saved medication is ${entry.ingredient ?? entry.generic.en} with neither of the names ${names.join(' and ')} (for example a profile from another country) gets the dose example and the typing check, which are the same on both labels, but no chart: the app does not choose between the two labels. In place of the chart the app says why (section 5.4). A person in the United States is told where to choose the brand; the chart is then drawn.`,
      '',
    );
  }
  if (hasCustom) out.push('**Other / custom.** The person types the name of the medication. The app has no numbers for it, so there is no typing check and no chart.', '');
  return out;
}

// ── Section 5: the estimated medication level ────────────────────────────────

interface PkFacts {
  ke: number;
  ka: number;
  singlePeakH: number;
  steadyPeakH: number;
  troughIndex: number;
  firstDoseIndex: number;
  dosesTo90: number | null;
  daysUnder: Record<number, number | null>;
}

/** What the model in src/core/pk.ts does with one pair of numbers, found by running it. */
function pkFacts(pk: PkParams, intervalH: number): PkFacts {
  const m = modelFor(pk);
  let singlePeakH = 0;
  let singlePeak = 0;
  for (let h = 0; h <= pk.tmaxH * 6; h += 0.1) {
    const c = bateman(h, m);
    if (c > singlePeak) [singlePeak, singlePeakH] = [c, h];
  }
  const doses: MgDose[] = Array.from({ length: 20 }, (_, i) => ({ atMs: i * intervalH * HOUR, mg: 1 }));
  const lastDoseMs = 19 * intervalH * HOUR;
  const peak = steadyStatePeak(1, intervalH, m);
  const index = (afterLastDoseH: number) => (100 * concentration(lastDoseMs + afterLastDoseH * HOUR, doses, m)) / peak;
  let steadyPeakH = 0;
  for (let h = 0; h <= intervalH; h += 0.5) if (index(h) > index(steadyPeakH)) steadyPeakH = h;
  let dosesTo90: number | null = null;
  for (let n = 1; n <= 20 && dosesTo90 === null; n++) {
    const first = doses.slice(0, n);
    let best = 0;
    for (let h = 0; h <= intervalH; h += 0.5) best = Math.max(best, concentration((n - 1) * intervalH * HOUR + h * HOUR, first, m));
    if ((100 * best) / peak >= 90) dosesTo90 = n;
  }
  const daysUnder: Record<number, number | null> = {};
  for (const threshold of [50, 25, 5]) {
    daysUnder[threshold] = null;
    for (let h = Math.ceil(steadyPeakH); h < 24 * 365; h++) {
      if (index(h) < threshold) {
        daysUnder[threshold] = h / 24;
        break;
      }
    }
  }
  return { ke: m.ke, ka: m.ka, singlePeakH, steadyPeakH, troughIndex: index(intervalH), firstDoseIndex: (100 * singlePeak) / peak, dosesTo90, daysUnder };
}

interface CurveCounts {
  wordings: number;
  assumptions: number;
}

function curveSection(counts: CurveCounts): string[] {
  const out: string[] = [];
  const meds = usBrands().filter((b) => b.numbers.pk !== null);
  // Brands with the same numbers and the same schedule are one column.
  const columns: { names: string[]; pk: PkParams; intervalH: number; facts: PkFacts }[] = [];
  for (const { entry, brand, numbers } of meds) {
    const pk = numbers.pk as PkParams;
    const intervalH = entry.frequency === 'daily' ? 24 : 168;
    const same = columns.find((c) => c.pk.halfLifeH === pk.halfLifeH && c.pk.tmaxH === pk.tmaxH && c.intervalH === intervalH);
    if (same) same.names.push(brand);
    else columns.push({ names: [brand], pk, intervalH, facts: pkFacts(pk, intervalH) });
  }
  for (const c of columns) {
    if (Math.abs(c.facts.singlePeakH - c.pk.tmaxH) > 0.3) problems.push(`Section 5 says a single dose peaks at the time to peak, but for ${c.names.join(', ')} the model peaks at ${c.facts.singlePeakH.toFixed(1)} h, not ${c.pk.tmaxH} h.`);
  }
  const launchCurves = usBrands().filter((b) => curveAvailable(b.entry, LAUNCH, b.brand)).map((b) => b.brand);
  const noNumbers = usBrands().filter((b) => b.numbers.pk === null).map((b) => b.brand);

  out.push('## 5. The estimated medication level: method and wording', '');
  out.push(
    'The chart shows a rough picture of how much medication is in the body over time, worked out from the doses the person logged and from two numbers of the label (section 4). The same two numbers are used for every person on a medication. It is an estimate, not a measurement. It has no unit, and the app says it cannot be used to adjust a dose.',
    '',
  );
  out.push(
    `In the first public version the chart is drawn ${LAUNCH.curveNeedsSource ? 'only for a medication whose numbers in section 4 were all read from the FDA label' : 'for every medication that has a half-life and a time to peak in section 4'}. Today that is: ${launchCurves.length ? launchCurves.join(', ') : 'no medication'}. Medications with a half-life and a time to peak in the code: ${meds.map((b) => b.brand).join(', ') || 'none'}. Medications without them, which never get a chart: ${noNumbers.join(', ') || 'none'}. The chart is designed for weekly shots; medications taken every day have no numbers for it on purpose.`,
    '',
  );

  out.push('### 5.1 The model, as the code has it', '');
  out.push('One compartment, with first-order absorption and first-order elimination (the Bateman function). For one dose, t hours after it was taken:', '');
  out.push('```', 'B(t) = ka / (ka - ke) x ( e^(-ke x t) - e^(-ka x t) )        B(t) = 0 before the dose', '```', '');
  out.push(
    ...list([
      '**ke** = ln 2 / half-life. The half-life and the time to peak are the single numbers of section 4, taken from the label by the rule given there.',
      '**ka** is not read from a label. It is solved so that B(t) is highest exactly at the time to peak: ln(ka / ke) / (ka - ke) = time to peak.',
      '**All logged doses are added up:** Level(t) = sum of (dose in mg x B(t - time of that dose)).',
      '**The number on screen** is 100 x Level(t) / Peak, rounded to a whole number. Peak is the highest Level in one dosing interval after 20 doses of the *most recently logged dose*, taken exactly on the schedule the person set. So 100 means "the highest point after long-term use of the dose you logged last".',
      '**The chart** covers the last 14 days (solid line) and the next 7 days (dashed line), one point every 3 hours. The dashed part assumes the person takes the same dose at each planned time from now on. A planned time that has passed without a logged dose is not counted: an overdue dose is left out until the person logs it, and the dashed part goes on from the next planned time on the same rhythm. So the dashed line starts where the solid line ends. When the status is not "Increasing dose" or "Maintenance dose", the dashed part has no future doses and only falls.',
      'No factor turns a dose into a concentration (no absorbed fraction, volume or clearance). The result is a relative number only.',
    ]),
  );

  out.push('### 5.2 What the model does with the numbers in section 4', '');
  out.push('The first two rows are the numbers of section 4. Every other value was worked out by running the code and is not from a label. They are here so you can judge whether the picture is believable.', '');
  const cell = (f: (c: (typeof columns)[number]) => string): string[] => columns.map(f);
  const daysCell = (d: number | null) => (d === null ? 'more than a year' : `${round(d, 1)} days`);
  out.push(
    ...table(
      ['', ...columns.map((c) => c.names.join(', '))],
      [
        ['Half-life in the app', ...cell((c) => hoursWords(c.pk.halfLifeH))],
        ['Time to peak in the app', ...cell((c) => hoursWords(c.pk.tmaxH))],
        ['Schedule used here', ...cell((c) => (c.intervalH === 168 ? 'One dose a week' : 'One dose a day'))],
        ['ke (per hour)', ...cell((c) => c.facts.ke.toFixed(5))],
        ['ka (per hour), solved from the time to peak', ...cell((c) => c.facts.ka.toFixed(5))],
        ['Absorption half-life that follows from ka', ...cell((c) => `${round(Math.LN2 / c.facts.ka, 1)} hours`)],
        ['Check: one dose alone peaks after', ...cell((c) => `${round(c.facts.singlePeakH, 1)} hours`)],
        ['After long-term use, the peak comes this long after a dose', ...cell((c) => `${round(c.facts.steadyPeakH, 1)} hours`)],
        ['Number shown right before the next dose, after long-term use (the peak is 100)', ...cell((c) => round(c.facts.troughIndex))],
        ['Highest number after the very first dose', ...cell((c) => round(c.facts.firstDoseIndex))],
        ['Doses at the same amount until the peak reaches 90 or more', ...cell((c) => (c.facts.dosesTo90 === null ? 'more than 20' : String(c.facts.dosesTo90)))],
        ['After the last dose: time until the number is under 50', ...cell((c) => daysCell(c.facts.daysUnder[50]))],
        ['After the last dose: time until the number is under 25', ...cell((c) => daysCell(c.facts.daysUnder[25]))],
        ['After the last dose: time until the number is under 5', ...cell((c) => daysCell(c.facts.daysUnder[5]))],
      ],
      [8, ...columns.map(() => 4)],
    ),
  );

  if (columns.length) {
    const c = columns[0];
    const amounts = [1, 1, 1, 1, 2, 2, 2, 2];
    const doses: MgDose[] = amounts.map((mg, i) => ({ atMs: i * c.intervalH * HOUR, mg }));
    const rows = doses.map((dose, i) => {
      const logged = doses.slice(0, i + 1);
      const before = i === 0 ? null : exposureIndexAt(dose.atMs - HOUR, doses.slice(0, i), c.pk, c.intervalH);
      let best = 0;
      for (let h = 0; h < c.intervalH; h++) best = Math.max(best, exposureIndexAt(dose.atMs + h * HOUR, logged, c.pk, c.intervalH) ?? 0);
      return [`Dose ${i + 1}`, dose.mg === 1 ? 'A' : '2 x A', before === null ? 'no chart yet' : round(before), round(best)];
    });
    out.push(
      `**Example: what happens when the dose goes up.** A made-up log with the numbers of ${c.names.join(' and ')}: four doses of the same amount A on schedule, then four doses of twice that amount. This shows how the number behaves. It is not a dosing suggestion.`,
      '',
    );
    out.push(...table(['Dose logged', 'Amount', 'Number shown one hour before this dose', 'Highest number in the interval after this dose'], rows, [3, 2, 5, 5]));
    out.push(
      'When a higher dose is logged, 100 is redefined as the long-term peak of the new dose. The number shown can therefore drop right after an increase, although there is more medication in the body than the week before.',
      '',
    );
  }

  out.push('### 5.3 Assumptions and limits', '');
  const history = screenCodeHas('src/web/derive.ts', /Math\.min\(Math\.floor\(weeksOnDose\) - 1, (\d+)\)/, 'how many earlier doses the chart assumes');
  const sameNumbers = columns.filter((c) => c.names.length > 1 && new Set(meds.filter((b) => c.names.includes(b.brand)).map((b) => b.entry.id)).size > 1);
  // Brands of one medication that are drawn with different numbers, because their labels differ.
  const splitBrands = [...new Set(meds.map((b) => b.entry.id))].map((id) => meds.filter((b) => b.entry.id === id)).filter((group) => new Set(group.map((b) => `${b.numbers.pk?.halfLifeH}/${b.numbers.pk?.tmaxH}`)).size > 1);
  const assumptions = [
    'Everyone on a medication is treated as the same person, with the two numbers of section 4. Body weight, kidney function, age, injection site and other medications change nothing.',
    'One compartment only. Absorption and elimination are both first-order.',
    'The half-life is one number and the time to peak is one number, both read from section 12.3 of the label only. Where that section gives only a range, the app uses its midpoint (section 4); a midpoint is not an average and is not a figure the label prints. The absorption rate is solved from the time to peak and is not checked against anything else.',
    'Doses add up in a straight line: twice the dose gives twice the level.',
    'There is no absorbed fraction, volume or clearance in the model, so there is no concentration. Only a relative number is shown.',
    'The scale changes with the dose: 100 is always the long-term peak of the dose logged last (see the example in 5.2). Numbers from before and after a dose change cannot be compared.',
    'The long-term peak is worked out for 20 doses taken exactly on the schedule the person set, sampled every half hour.',
    'Only doses logged in mg are used. Doses logged in units, mL or clicks are left out and never converted.',
    `When a person says at setup that they have been on their current dose for several weeks, the chart assumes earlier doses of the same amount on schedule${history ? ` (one for each of those weeks, ${history[1]} at most)` : ''}. They are used only for the chart and are not saved as records.`,
    'A dose that was taken but not logged is missing from the chart. A dose logged at the wrong time is used as logged.',
    'A planned dose that is overdue is not in the dashed part (5.1). The dashed line then shows what happens if that dose is not taken and the next planned one is. The app gives no advice about a missed dose.',
    `Medications without a half-life and time to peak in the app get no chart: ${noNumbers.join(', ') || 'none'}.`,
    ...sameNumbers.map((c) => `${c.names.join(' and ')} are separate entries in the app but use the same half-life and time to peak.`),
    ...splitBrands.map((group) => `${group.map((b) => b.brand).join(' and ')} contain the same ingredient but are drawn with different numbers, because their labels word the half-life and the time to peak differently (section 4). The same doses give a different line for each brand.`),
    'The chart is not used by any other rule. The danger-symptom rules, the dose-increase period and the reminders do not read it.',
  ];
  out.push(...table(['Code', 'Assumption or limit'], assumptions.map((a) => [code('P'), a]), [1, 14]));
  counts.assumptions = assumptions.length;

  out.push('### 5.4 Exact wording on screen', '');
  // The method text names the person's own medication and its two numbers. It is shown here for the first medication with a chart.
  const example = meds[0];
  const method = screenText('trends.method.body', { name: example?.brand ?? '?', halfLife: example?.numbers.pk?.halfLifeH ?? '?', peak: example?.numbers.pk?.tmaxH ?? '?' });
  if (/\[\w+\]/.test(method)) problems.push(`The method text ("trends.method.body") has a placeholder this script does not fill: ${method.match(/\[\w+\]/g)?.join(', ') ?? ''}. Update curveSection().`);
  if (!example) problems.push('Section 5.4 shows the method text for a medication with a chart, but no US brand has a half-life and a time to peak. Update curveSection().');
  for (const piece of ['pharmacokinetics section of the US prescribing information', 'Where that section gives one value or a median', 'middle of the range', 'They are not measured in you', 'not a lab measurement', 'cannot be used to adjust your dose']) {
    if (!method.includes(piece)) problems.push(`The method text ("trends.method.body") no longer says "${piece}". Section 5.4 of the packet describes it as saying so; re-read the text and update curveSection().`);
  }
  // The large chart's place shows the same no-chart line as the main screen; the sentence below rests on that.
  const noChartOnTrends =
    screenCodeHas('src/web/screens/Trends.tsx', /<p className="muted">\{noChartText\(d, t\.lang\)\}<\/p>/, 'where the no-chart line is shown on the trends screen') &&
    screenCodeHas('src/web/content/labels.ts', /translate\(lang, features\.curveNeedsSource \? 'curve\.unavailable' : 'today\.noCurve'\)/, 'which no-chart line each version shows');
  // A medication whose chart numbers belong to single brands, saved without one of them, has its own two lines.
  const needsBrandLines = screenCodeHas('src/web/content/labels.ts', /d\.chartNeedsBrand\.canChoose \? translate\(lang, 'curve\.chooseBrand', \{ brands, button: translate\(lang, 'me\.med\.change'\) \}\) : translate\(lang, 'curve\.twoLabels', \{ brands \}\)/, 'the line shown when the chart only needs a brand');
  const splitNames = splitBrands[0]?.map((b) => b.brand).join(' and ') ?? '[brands]';
  const wordings: [string, string][] = [
    ['Title of the chart', screenText('curve.title')],
    ['Under the small chart on the main screen', screenText('today.curve.note')],
    ['Under the large chart', screenText('trends.curve.note')],
    [`Link under the large chart (${q(screenText('trends.method.link'))}) opens this text. It is shown here as a person on ${example?.brand ?? '?'} sees it; the name and the two numbers are those of the person's own medication (section 4)`, method],
    ...(LAUNCH.curveNeedsSource ? [['In place of the chart in the first public version, when the medication has no chart (a medication taken every day, a medication that is not on the list, or one whose numbers were not all read from the label)', screenText('curve.unavailable')] as [string, string]] : []),
    ...(needsBrandLines && splitBrands.length
      ? ([
          [`In place of the chart, in both versions, when the saved medication is ${splitBrands[0][0].entry.ingredient ?? ''} with neither of the names ${splitNames} and the person is in the United States, where the list offers both`, screenText('curve.chooseBrand', { brands: splitNames, button: screenText('me.med.change') })],
          [`The same, for a person whose list does not offer the two names (another country, or "Other")`, screenText('curve.twoLabels', { brands: splitNames })],
        ] as [string, string][])
      : []),
    [`${noChartOnTrends ? 'On the main screen and in place of the large chart' : 'On the main screen'} when the medication has no chart${LAUNCH.curveNeedsSource ? ' (full test version)' : ''}`, screenText('today.noCurve')],
    ['In place of the large chart when the medication has a chart but no dose has been logged in mg yet', screenText('trends.curve.empty')],
    ['On the sheet where a dose is logged', screenText('dose.unitNote')],
    ...(LAUNCH.loggingToolNotice ? [['Line at the bottom of the main screens in the first public version', screenText('notice.loggingTool')] as [string, string]] : []),
    [`Line at the bottom of the main screens${LAUNCH.loggingToolNotice ? ' in the full test version' : ''}`, disclaimer('en')],
  ];
  out.push('Next to the title the app shows one whole number with no unit, for example 78. It is the latest point of the solid line.', '');
  out.push(...table(['Code', 'Where', 'Exact wording'], wordings.map(([where, text]) => [code('S'), where, md(text)]), [1, 5, 10]));
  counts.wordings = wordings.length;
  return out;
}

// ── Section 6: other numbers that need a clinical eye ────────────────────────

/** Stops the build when words this script repeats from a code comment are no longer in that file. */
function requireText(rel: string, pieces: string[], where: string): void {
  const missing = pieces.filter((p) => !source(rel).includes(p));
  if (missing.length) problems.push(`${rel} no longer contains ${missing.map((m) => `"${m}"`).join(', ')}. ${where} of the packet repeats it; update scripts/build-review-packet.ts.`);
}

function expectThat(ok: boolean, what: string): void {
  if (!ok) problems.push(`The packet says: ${what}. The code no longer does that. Correct the sentence in scripts/build-review-packet.ts.`);
}

interface NumberCounts {
  numbers: number;
  foods: number;
  textNumbers: number;
}

/**
 * The note under the weight chart names how far one weigh-in can swing. The numbers are written
 * into the screen code, one per weight unit, so they are read from there.
 */
function swingRows(row: (what: string, inCode: string, onScreen?: string) => string[]): string[][] {
  const found = screenCodeHas('src/web/screens/Trends.tsx', /return u === 'kg' \? '([^']+)' : u === 'lb' \? '([^']+)' : '[^']+';/, 'how far a single weigh-in can swing');
  if (!found) {
    problems.push('The note under the weight chart (weight.note) names a swing for one weigh-in, but its numbers were not found in src/web/screens/Trends.tsx. Update swingRows() in scripts/build-review-packet.ts.');
    return [];
  }
  const [, kg, lb] = found;
  return [
    row(
      'How far one weigh-in can swing (shown in the first public version)',
      `The note under the weight chart names a swing of ${lb} for a person who uses pounds and ${kg} for a person who uses kilograms. The two numbers are written into the screen; nothing is worked out from them.`,
      md(screenText('weight.note', { unit: 'lb', swing: lb })),
    ),
  ];
}

/** The note shown in settings under the status "Stopped". */
function stoppedNoteRows(row: (what: string, inCode: string, onScreen?: string) => string[]): string[][] {
  if (!screenCodeHas('src/web/screens/Me.tsx', /features\.maintenanceContent && reg\.status === 'stopped' && <p className="fine">\{t\('me\.med\.stoppedNote'/, 'the note under the status "Stopped"')) return [];
  return [row(`Note under the status "Stopped" (${launchStatus(LAUNCH.maintenanceContent)})`, 'Shown in settings after the person sets the status to "Stopped".', md(screenText('me.med.stoppedNote', { escalating: screenText('onb.status.escalating') })))];
}

function otherNumbersSection(counts: NumberCounts): string[] {
  const out: string[] = [];
  const row = (what: string, inCode: string, onScreen = ''): string[] => [code('N'), what, inCode, onScreen];
  const numberTable = (rows: string[][]) => table(['Code', 'What', 'What the code does', 'What the person sees'], rows, [1, 3, 7, 6]);
  const unused = (name: string) => (usedByScreens(name) ? '' : 'Not used by any screen yet');

  out.push('## 6. Other numbers that need a clinical eye', '');
  out.push('Everything else in the app that encodes a clinical judgement. The cut-offs were chosen by the people who built the app. None of them has been reviewed.', '');

  // 6.1 Protein target.
  out.push('### 6.1 Protein target', '');
  out.push(`Status: ${launchStatus(LAUNCH.foodAndProtein)}.`, '');
  const auto = (ft: number, inches: number, lb: number) => proteinTarget({ heightCm: ftInToCm(ft, inches), weightKg: toKg(lb, 'lb'), kidneyOrLiver: false, mode: 'auto' });
  const example = auto(5, 4, 200);
  expectThat(proteinTarget({ heightCm: 170, weightKg: 80, kidneyOrLiver: true, mode: 'auto' }).kind === 'ask_doctor', 'with kidney or liver disease checked there is no automatic protein target');
  expectThat(example.kind === 'auto' && auto(5, 0, 100).kind === 'auto' && (auto(5, 0, 100) as { floorG: number }).floorG === 60, 'the protein minimum is never under 60 g');
  requireText('src/core/protein.ts', ['Almandoz', '2024', 'Obesity', '60–75', '0.8–1.5', 'AACE 2025', '1.2–1.5'], 'Section 6.1');
  out.push('The app works out a daily protein target from height and weight. It shows a progress bar toward the minimum, and the daily advice (3.2) uses the minimum.', '');
  out.push(
    ...numberTable([
      row('Which weight the formula uses', 'BMI under 28: the current weight. BMI 28 or more: an adjusted weight = ideal weight + 0.4 x (current weight - ideal weight), where ideal weight = 22 x (height in meters) squared.', md(screenText('me.protein.formula', { ref: '[weight]', floor: '[minimum]', low: '[low]', high: '[high]' }))),
      row('Minimum for the day', '1.0 g per kg of that weight, and never under 60 g.', md(`${screenText('protein.gap', { gap: '[grams]' })} / ${screenText('protein.reached')}`)),
      row('Ideal range', '1.2 to 1.5 g per kg of that weight.', md(screenText('protein.ideal', { low: '[low]', high: '[high]' }).trim())),
      row('Upper line', '2.0 g per kg of that weight.', unused('capG')),
      row('Kidney or liver disease checked at setup', 'No automatic target. The person can type their own.', md(screenText('protein.askDoctor', { grams: '[grams]' }))),
      row('Evening reminder', 'Meant to fire when the person is 25 g or more under the minimum and has logged no food for 3 hours.', unused('shouldRescue')),
    ]),
  );
  out.push('The code comment names two sources for these numbers. We have not checked them: Almandoz and others 2024 (Obesity), more than 60–75 g a day and 0.8–1.5 g per kg; AACE 2025, 1.2–1.5 g per kg.', '');
  out.push('What the formula gives for a few people (worked out by running the code):', '');
  const exampleRows: string[][] = [];
  for (const [ft, inches] of [
    [5, 4],
    [5, 10],
  ]) {
    for (const lb of [150, 200, 250, 300]) {
      const t = auto(ft, inches, lb);
      if (t.kind !== 'auto') continue;
      const heightCm = ftInToCm(ft, inches);
      exampleRows.push([`${ft} ft ${inches} in`, `${lb} lb`, round(bmi(heightCm, toKg(lb, 'lb')), 1), `${round(fromKg(t.refWeightKg, 'lb'))} lb (${round(t.refWeightKg, 1)} kg)`, `${t.floorG} g`, `${t.idealLowG}–${t.idealHighG} g`, `${t.capG} g`]);
    }
  }
  out.push(...table(['Height', 'Weight', 'BMI', 'Weight the formula uses', 'Minimum', 'Ideal range', 'Upper line'], exampleRows, [3, 2, 2, 5, 2, 3, 2]));

  // 6.2 Food list.
  out.push('### 6.2 Protein values of the quick-log foods', '');
  out.push(`Status: ${launchStatus(LAUNCH.foodAndProtein)}.`, '');
  out.push('Tapping a food logs one portion with this much protein. The range is what the app shows next to the number. The list was written for Chinese meals and the values are rough.', '');
  out.push(...table(['Code', 'Food', 'One portion', 'Protein (g)', 'Range (g)', 'Your correction'], FOODS.map((f) => [code('F'), md(foodName(f, 'en')), `1 ${md(foodUnit(f, 'en'))}`, String(f.proteinG), `± ${f.spreadG}`, '']), [1, 7, 2, 2, 2, 4]));
  counts.foods = FOODS.length;

  // 6.3 Weight trend.
  out.push('### 6.3 Weight trend', '');
  const day = (n: number) => `2026-01-${String(n).padStart(2, '0')}`;
  const band = (pct: number) => regainStatus([{ day: day(1), avgKg: 100 }, { day: day(2), avgKg: 100 + pct }])?.band;
  expectThat(band(2.9) === 'green' && band(3) === 'yellow' && band(5) === 'yellow' && band(5.1) === 'orange', 'the regain lines are at 3% and 5%');
  const drops = (pct: number) => fastLoss([{ day: day(1), avgKg: 100 }, { day: day(8), avgKg: 100 * (1 - pct / 100) }, { day: day(15), avgKg: 100 * (1 - pct / 100) ** 2 }]);
  expectThat(drops(1.6) && !drops(1.4), 'the fast-drop line is 1.5% a week for two weeks');
  const weighIns = (n: number) => rollingAverages(Array.from({ length: n }, (_, i) => ({ atMs: Date.UTC(2026, 0, 5 + i, 15), kg: 90 })), 'America/New_York');
  expectThat(weighIns(2).length === 0 && weighIns(3).length === 1, 'a 7-day average needs 3 weigh-ins');
  const stoppedOnly = screenCodeHas('src/web/derive.ts', /regain: reg\?\.status === 'stopped'/, 'when the regain lines are shown') !== null;
  const onAdviceCard = screenCodeHas('src/web/screens/Today.tsx', /function AdviceCard\((?:(?!\n\}\n)[\s\S])*today\.fastLoss/, 'where the fast-drop warning is shown') !== null;
  out.push(
    ...numberTable([
      row('7-day average', 'The average of all weigh-ins in the 7 days that end on a day. It needs at least 3 weigh-ins in those 7 days. All later lines use this average, not single weigh-ins.', md(screenText('weight.empty'))),
      row('Lowest point', 'The lowest 7-day average so far.'),
      row(`Regain under 3% above the lowest point (${launchStatus(LAUNCH.maintenanceContent)})`, stoppedOnly ? 'Shown after the person sets the status to "Stopped".' : 'Compared with the lowest point.', md(screenText('weight.regain.green', { pct: '[percent]' }))),
      row(`Regain of 3% to 5% (${launchStatus(LAUNCH.maintenanceContent)})`, 'Same.', md(screenText('weight.regain.yellow', { pct: '[percent]' }))),
      row(`Regain above 5% (${launchStatus(LAUNCH.maintenanceContent)})`, 'Same.', md(screenText('weight.regain.orange', { pct: '[percent]' }))),
      row(
        `Fast drop${onAdviceCard ? ` (${launchStatus(LAUNCH.dailyAdvice)})` : ''}`,
        `The 7-day average fell by more than 1.5% in each of the last two weeks. The app compares today with the averages about 7 and 14 days ago (2 days either way).${onAdviceCard ? ' The warning is printed on the daily advice card (section 3.2).' : ''}`,
        md(screenText('today.fastLoss')),
      ),
      row('Weigh-in tip', 'Shown on the sheet where a weight is logged.', md(screenText('weight.tip'))),
      ...swingRows(row),
      ...stoppedNoteRows(row),
    ]),
  );

  // 6.4 High-symptom days.
  out.push(`### 6.4 The person's own high-symptom days`, '');
  out.push(
    ...numberTable([
      row('How much data is needed', '3 full cycles. A cycle is the 7 days from one dose day to the next.', md(screenText('symptomDays.needMore', { count: '[N]' }))),
      row('What counts as a high-symptom day', 'For each day after the dose (day 0 to day 6) the app takes the worst symptom grade logged that day (0 to 3) and averages it over the cycles. A day is "high" when its average is at least 1.5 times the average of all days, and a symptom was logged on that day in at least 2 cycles.', md(LAUNCH.dailyAdvice ? screenText('symptomDays.found') : `${screenText('symptomDays.foundPlain')} / With daily advice turned on: ${screenText('symptomDays.found')}`)),
      row('What it is used for', 'The daily advice for such a day (section 3.2) and a small chart of symptoms by day after the dose.'),
    ]),
  );

  // 6.5 Dose timing.
  out.push('### 6.5 Dose timing', '');
  expectThat(dueStatus(0, 12 * HOUR) === 'due' && dueStatus(0, 12 * HOUR + 1) === 'overdue', 'a dose counts as possibly forgotten 12 hours after its time');
  out.push('The app never says what to do about a late or missed dose. It only asks whether a dose was forgotten and points to the instructions that came with the medication or to the doctor (section 3.2).', '');
  out.push(
    ...numberTable([
      row('When a dose counts as "possibly forgotten"', 'More than 12 hours after its planned time with nothing logged. Up to 12 hours it counts as due.'),
      row('Next dose after a logged dose', 'The next planned day and time that is at least 72 hours after the logged dose (weekly schedule) or at least 12 hours after it (daily schedule). After a late weekly dose the app therefore shows the next dose on the usual weekday, as long as that is 72 hours or more away.'),
      row('Dose-increase period', '14 days, counted from the first dose at a higher amount than the dose before. The first dose ever logged also starts one.', md(screenText('today.status.escalation'))),
    ]),
  );

  // 6.6 Injection sites.
  out.push('### 6.6 Injection sites', '');
  out.push(
    ...numberTable([
      row('Sites a person can choose', SITES.map((s) => siteLabel(s, 'en')).join(', ')),
      row('Suggested next site', `The site after the one used last, in this fixed order, then back to the start: ${SITES.map((s) => siteLabel(s, 'en')).join(' → ')}.`, md(screenText('dose.siteSuggested', { site: '[site]' }))),
    ]),
  );

  // 6.7 Setup safety questions.
  out.push('### 6.7 Safety questions at setup', '');
  const goalNotSaved = screenCodeHas('src/web/screens/Onboarding.tsx', /const goalKg = safety\.pregnancy \|\| safety\.eatingDisorder \? null :/, 'the goal weight of a person with a history of an eating disorder') !== null;
  const effects: Record<keyof Safety, string> = {
    kidneyOrLiver: `No automatic protein target (section 6.1). The setup screen says: ${q(screenText('onb.safety.kidneyWarn'))}`,
    pregnancy: `The setup screen says: ${q(screenText('onb.safety.pregnancyWarn'))}`,
    insulinOrSU: `Changes the low-blood-sugar rule ${ruleRef('hypoglycemia')}: see its levels and cards in section 2.4, and the symptom buttons in 2.2.`,
    eatingDisorder: `No rule in the core logic uses this answer yet.${goalNotSaved ? ' The setup screen does not save a goal weight.' : ''}`,
    under18: LAUNCH.under18EndsSetup
      ? `Setup ends and nothing is saved. The screen says: ${q(screenText('onb.under18.stopBody'))} When setup is being done again by a person who already has records, the screen offers a button to delete all data and says: ${q(screenText('onb.under18.stopBodySaved'))}`
      : `Setup does not go on until the box is unchecked. The screen says: ${q(screenText('onb.under18.body'))}`,
  };
  const askedAtLaunch = safetyQuestions(LAUNCH);
  out.push(
    ...table(
      ['Code', 'Box the person can check', 'Asked in the first public version', 'What checking it changes'],
      safetyQuestions(FULL).map((key) => {
        if (!(key in effects)) problems.push(`Setup asks a safety question "${key}" that section 6.7 does not describe. Add it to otherNumbersSection().`);
        return [code('N'), md(screenText(`onb.safety.${key}`)), askedAtLaunch.includes(key) ? 'Yes' : 'No', effects[key] ?? ''];
      }),
      [1, 5, 2, 9],
    ),
  );

  // 6.8 Numbers inside texts.
  out.push('### 6.8 Numbers inside the texts of sections 2 and 3', '');
  out.push('Every sentence in the cards, coping cards and advice texts that carries a number, collected in one place so none is missed. The code in the first column points to the text it comes from.', '');
  const seen = new Set<string>();
  const sentenceRows: string[][] = [];
  for (const [where, text] of textsWithNumbers) {
    for (const sentence of text.split(/(?<=[.?])\s+/)) {
      // Placeholders, the name "GLP-1", the emergency number and the crisis line are not numbers to review here.
      const numbers = (sentence.replace(/\[[^\]]*\]|GLP-1/g, '').match(/\d+/g) ?? []).filter((n) => n !== emergencyDial('US') && n !== crisisLine('US', 'en'));
      if (!numbers.length || seen.has(sentence.toLowerCase())) continue;
      seen.add(sentence.toLowerCase());
      sentenceRows.push([where, md(sentence)]);
    }
  }
  out.push(...table(['From', 'Sentence'], sentenceRows, [2, 14]));
  counts.textNumbers = sentenceRows.length;

  // 6.9 Smaller items.
  out.push('### 6.9 Smaller items', '');
  const typed = (text: string) => parseLocal(text, 'kg', 'en').events.some((e) => e.type === 'weight');
  expectThat(!typed('weight 29 kg') && typed('weight 30 kg') && typed('weight 300 kg') && !typed('weight 301 kg'), 'a typed weight is accepted from 30 to 300 kg');
  out.push(
    ...numberTable([
      row('Emergency number and crisis line for a US user', `${emergencyNumber('US', 'en')} and ${crisisLine('US', 'en')}. The cards in section 2 use them. The code marks both as still to be verified.`),
      row('Weight typed in a note', `Accepted only from 30 to 300 kg (${round(fromKg(30, 'lb'))} to ${round(fromKg(300, 'lb'))} lb). Anything else is not read as a weight.`, LAUNCH.freeTextNote ? '' : 'Not reachable in the first public version (no note box)'),
      row('Time until the chart number falls under 5', 'A helper works out how many days after the last dose the number in section 5 falls under 5.', unused('daysUntilBelow')),
    ]),
  );
  counts.numbers = coded('N');
  return out;
}

// ── Section 7: open questions ────────────────────────────────────────────────

/** How a comment in the code says "this still needs review". The first part matches a note in Chinese square brackets. */
const REVIEW_MARKER = /【[^】]*】|PENDING(?: CLINICAL)? REVIEW|Needs verification|Not verified yet|not been checked against a label/;

interface ReviewComment {
  file: string;
  line: number;
  /** "file#fingerprint of the line". This is how a question below names the comment it comes from. */
  key: string;
}

/** Every comment in src/core and src/web/content that marks something as waiting for review. */
function reviewComments(): ReviewComment[] {
  const found: ReviewComment[] = [];
  for (const file of [...sourceFiles('src/core'), ...sourceFiles('src/web/content')]) {
    source(file)
      .split('\n')
      .forEach((text, i) => {
        if (REVIEW_MARKER.test(text)) found.push({ file, line: i + 1, key: `${file}#${hash8(text.trim())}` });
      });
  }
  return found;
}

interface OpenQuestion {
  /** Keys of the comments this question is drawn from (see ReviewComment.key). */
  from: string[];
  ask: string;
}

/**
 * One question for every review comment in the code. A comment that no question names stops the
 * build, and so does a question whose comment is gone. Run with --fingerprints to list the keys.
 */
const QUESTIONS_FROM_COMMENTS: OpenQuestion[] = [
  {
    from: ['src/core/catalog.ts#f131c62e'],
    ask: `The dose steps, the highest dose, the half-life, the time to peak and the wait after a pill in section 4 were read from the current US labels by us on ${LABELS_READ_ON}. Nobody outside our team has confirmed them. Please check each row against the label words quoted next to it and against the label itself, and give the label section. The brand names, the generic names and how each medication is taken have not been checked against a label.`,
  },
  {
    from: ['src/core/triage.ts#919582a7', 'src/core/triage.ts#0347ea12', 'src/core/triage.ts#f1f55955'],
    ask: 'The trigger phrases, the level of each rule and the English card texts in section 2 have never been reviewed. Which danger signs are missing? Which rules sit at the wrong level? Which card text could harm or mislead a person?',
  },
  {
    from: ['src/core/triage.ts#bd0e65d1'],
    ask: 'The emergency number on the cards is marked as still to be verified. For a US user it is 911. On which cards is "call 911" the wrong instruction, and what should those cards say?',
  },
  {
    from: ['src/core/triage.ts#ce911aea', 'src/core/triage.ts#c042329b'],
    ask: 'The crisis line on the self-harm card is marked as still to be verified. For a US user the card says "crisis line 988". Is that the right line, and the right way to name it?',
  },
  {
    from: ['src/core/medGuide.ts#50e49c83'],
    ask: `Section 2.6 holds the warning signs of each Medication Guide as the app shows them. A script copied them from the label files on ${MED_GUIDES_READ_ON} and a second script checked the copy; no reviewer has compared them with the guides. Please check each list against the current guide. Is any item missing, changed or out of order? Is any guide out of date?`,
  },
  {
    from: ['src/core/guideCoverage.ts#95b1fe40'],
    ask: 'The tables in sections 2.7 and 2.8 are our reading of the guides: how we read each instruction ("right away" or not), which rule stands for which sign, and the reason where no rule does. Which rows are wrong?',
  },
  {
    from: ['src/web/content/coping.ts#e0c53e8a', 'src/web/content/coping.ts#0200cb1b'],
    ask: 'The coping cards in section 3.1 must be reviewed before they are shown. Is any line wrong or unsafe? Is anything missing under "See a doctor if"? Are the two sources named under each card the right ones to name?',
  },
  {
    from: ['src/web/content/advice.ts#2c1be0d6', 'src/web/content/advice.ts#27b3425c', 'src/web/content/advice.ts#2de926fc'],
    ask: 'The daily advice texts in section 3.2 wait for review. Is any text wrong or unsafe for a person on these medications? Is any text shown in the wrong situation?',
  },
  {
    from: ['src/web/content/workouts.ts#2d16e08a', 'src/web/content/workouts.ts#eca22557'],
    ask: 'The workouts in section 3.3 need review of the exercises and the amounts by a qualified professional. Are you the right person for that part? If not, please say so and leave it out of your quote.',
  },
  {
    from: ['src/web/content/labels.ts#4688384c'],
    ask: 'The general notice at the bottom of the main screens (last row of section 5.4) waits for review. Does it say what it should?',
  },
  {
    from: ['src/core/protein.ts#a2ad3650'],
    ask: 'The protein formula and its cut-offs in section 6.1 wait for a dietitian or doctor to confirm them. Are the 60 g floor, the 1.0, 1.2 to 1.5 and 2.0 g per kg lines, the BMI line of 28 and the adjusted weight right for adults on these medications? Who else should get no automatic target?',
  },
  {
    from: ['src/core/foods.ts#1e336384'],
    ask: 'The protein values in section 6.2 are rough and were meant to be checked against the China Food Composition Table. For a US user, which rows are wrong, and which reference should we use instead?',
  },
  {
    from: ['src/core/weight.ts#9d980b40'],
    ask: 'The weight cut-offs in section 6.3 are product choices, not taken from a guideline: regain of 3% and 5% above the lowest point, and a drop of more than 1.5% a week for two weeks. Are they reasonable? Is the text at each line right?',
  },
];

function openQuestionsSection(internals: TriageInternals): string[] {
  const out: string[] = [];
  const comments = reviewComments();
  if (PRINT_FINGERPRINTS) for (const c of comments) fingerprintReport.push(`${c.key}  (line ${c.line}) review comment`);
  const named = new Set(QUESTIONS_FROM_COMMENTS.flatMap((x) => x.from));
  if (!PRINT_FINGERPRINTS) {
    for (const c of comments) {
      if (!named.has(c.key)) problems.push(`${c.file} line ${c.line} marks something as waiting for review, but no question in section 7 is drawn from it. Add its key "${c.key}" to a question in QUESTIONS_FROM_COMMENTS (or write a new one).`);
    }
    for (const key of named) {
      if (!comments.some((c) => c.key === key)) problems.push(`A question in section 7 is drawn from the review comment "${key}", which is no longer in the code (changed or removed). Update QUESTIONS_FROM_COMMENTS.`);
    }
  }

  out.push('## 7. Open questions', '');
  out.push('### 7.1 Questions drawn from the code', '');
  out.push('The people who wrote the code left notes where something waits for review. Each note is one of the questions below.', '');
  const whereOf = (keys: string[]): string => {
    const lines = comments.filter((c) => keys.includes(c.key));
    const files = [...new Set(lines.map((c) => c.file))];
    return files.map((f) => `\`${f}\` line ${lines.filter((c) => c.file === f).map((c) => c.line).join(', ')}`).join('; ');
  };
  out.push(...table(['Code', 'Question', 'Note in the code'], QUESTIONS_FROM_COMMENTS.map((x) => [code('Q'), x.ask, whereOf(x.from)]), [1, 11, 4]));

  // Questions that came up while this packet was put together. Each one states only what the code does.
  const extra: string[] = [];
  const rules = internals.RULES.map((r) => r.id);
  const buttonRules = new Set(quickLogRows().map((r) => r.hit.id));
  if (!LAUNCH.freeTextNote) {
    const noButton = rules.filter((id) => !buttonRules.has(id)).map((id) => ruleRef(id)).join(', ');
    extra.push(
      typedAtLaunch()
        ? `In the first public version a person can report a danger sign in two ways only: with a symptom button (section 2.2), or by typing it where the app checks typed text (section 2.3). No button leads to ${noButton}. Which danger signs need their own button before launch?`
        : `In the first public version an alert can be raised only from the symptom buttons (section 2.2). No button leads to ${noButton}. Which danger signs need their own button before launch?`,
    );
  }
  if (silentAtLaunch.length) {
    extra.push(
      `In the first public version ${silentAtLaunch.map((id) => ruleRef(id)).join(', ')} show no alert (section 2.1): their own cards are hidden until reviewed, and the fixed card with its call button does not fit a reminder. A person who types text that matches only these rules sees nothing. Is that acceptable for the first public version? If one of them needs to show something at launch, which one, and what should it say?`,
    );
  }
  if (questionAlertLeavesNothing) {
    const onlyTyped = rules.filter((id) => !buttonRules.has(id) && !silentAtLaunch.includes(id)).map((id) => ruleRef(id)).join(', ');
    extra.push(
      `An alert raised from the box for questions for the doctor leaves no reminder on the main screen once it is closed (section 2), while an alert from a symptom button stays at the top for the rest of the day. ${LAUNCH.freeTextNote ? '' : `In the first public version that box is the only way to raise ${onlyTyped}. `}Is it acceptable that these alerts are shown once and then gone?`,
    );
  }
  // Judgements made when the rules were set against the Medication Guides. Each states only what the code does.
  const onlyTell = [...new Set(ITEM_COVERAGE.filter((c) => c.signs.some((sg) => sg.alone) && MED_GUIDE_LIST.some((g) => guideItems(g).some((i) => i.id === c.item && i.action === 'tell'))).map((c) => c.item))];
  const stopItems = [...new Set(MED_GUIDE_LIST.flatMap((g) => guideItems(g).filter((i) => i.stopUsing).map((i) => i.id)))];
  if (!LAUNCH.triageDetailCards) {
    extra.push(
      `The first public version shows one fixed card for every sign: "${fixedAlertCard('US', 'en').title}", with the call button (2.1). For these items the guides say only "tell your healthcare provider", for some medications or for all (2.7), so the card says more than the guide: ${onlyTell.map((i) => ITEM_NAMES[i].toLowerCase()).join('; ')}. Is one card for all of them acceptable? And is "contact your doctor right away" strong enough where the guides say "get medical help right away" (serious allergic reactions)?`,
    );
    if (stopItems.length) extra.push(`For ${stopItems.map((i) => ITEM_NAMES[i].toLowerCase()).join(' and for ')} the guides' instruction begins "Stop using" or "Stop taking". The fixed card does not say that: the app gives no advice about doses. The button under the card opens the guide's own words (2.6). Is that enough?`);
  }
  extra.push(
    'The app shows three parts of each Medication Guide: the most important information, the serious side effects, and the sentence about taking too much (2.6). Is that the right selection? Should it also show the list of the most common side effects, so that a person does not take the short list for the whole guide?',
  );
  const marks = NOT_FROM_A_GUIDE.filter((n) => showsLaunchCard(n.rule));
  if (marks.length) extra.push(`These rules, or parts of rules, raise an alert although no Medication Guide names the sign (2.8): ${marks.map((n) => `${ruleRef(n.rule)}: ${md(n.part)}`).join('; ')}. Is each of them right to keep? Is a sign of this kind missing?`);
  extra.push(
    `For low blood sugar the guides list signs but, for most medications, give no instruction to call anyone. The rule ${ruleRef('hypoglycemia')} fires on the words "low blood sugar" and on two signs together; hunger, headache, weakness and anxiety or mood changes count only next to another sign (2.4). Is two the right number? Should any single sign raise the alert on its own, for example slurred speech or confusion? Should a blood sugar reading raise it, and below what number ("my blood sugar was 60" stays quiet today)?`,
  );
  extra.push(
    'Where a guide names a sign without saying how bad it must be, the rules fire on the plain word: any fever, any hoarseness, any dizziness, a racing heart, any change in vision (2.4). Dizziness, a racing heart and hoarseness stay quiet only when the person calls them slight. Is that too wide, or right for a reminder that is meant to come once too often?',
  );
  extra.push(
    'For nausea, vomiting and diarrhea the guides say "that does not go away". The rules read that as: vomiting or diarrhea that keeps on, lasts all day, or comes five times or more; nausea only with words for more than one day ("nauseous all day" stays quiet, "nauseous for 4 days" fires). Are these lines in the right place?',
  );
  extra.push(
    `Two symptom buttons were added to the ones that raise an alert at "${gradeLabel(3, 'en')}" (2.2, 2.8): nausea, because the guides name it with vomiting and diarrhea, and dizziness for every person, because "fainting or feeling dizzy" is a sign of a serious allergic reaction in every guide and no other button leads there. Severe nausea is common on these medications. Is an alert for it right? The buttons for constipation and acid reflux raise nothing, while the typed words "severe constipation" do. Which way should both go?`,
  );
  extra.push(
    'A match does not count when the text is about someone else, about a time long past, or a general question (2.3). So "my son can\'t breathe" and "what are the signs of low blood sugar?" raise nothing. Is that acceptable? The lists in section 2.5 show where the line sits.',
  );
  extra.push(
    'The guides tell the patient to call the healthcare provider or the Poison Help line, or to go to an emergency room, right away after taking too much, and to call after missing doses for some time (2.7). The app has no rule for either, and typed words such as "I took a double dose" raise nothing. Should they raise the alert? The fixed card does not name the Poison Help line.',
  );
  const tablets = MED_GUIDE_LIST.find((g) => guideItems(g).some((i) => /andOZEMPIC/.test(i.text)));
  if (tablets) extra.push(`The label file of the guide for ${brandsOf(tablets)} has a space missing in one sentence the app shows ("RYBELSUS andOZEMPIC tablets"), and the app shows it as the file has it. Should the app keep it so, or is there a cleaner official text to copy from?`);
  const breath = triageText('short of breath', US_CONTEXT)[0];
  if (breath) {
    extra.push(
      `Several cards name a possible cause (pancreas, gallbladder, allergic reaction, blood sugar). Is it right to name a cause at all? Is it the right cause for every phrase that triggers the rule? One example: "short of breath" alone shows the card ${q(triageCard(breath, 'US', 'en').title)}.`,
    );
  }
  const pregnancyCard = triageCard({ id: 'pregnancy', level: 'contact' }, 'US', 'en').body;
  if (/semaglutide label/.test(pregnancyCard)) extra.push(`The pregnancy card ${ruleRef('pregnancy')} quotes the semaglutide label to every user, whatever medication they take. What should it say to a person on one of the other medications in section 4?`);
  const contraception = internals.RULES.find((r) => r.id === 'contraception');
  if (contraception) {
    const forDrugs = [...new Set(CONTEXTS.filter((c) => !contraception.when || contraception.when(c)).map((c) => c.drugId))];
    extra.push(`The birth control reminder ${ruleRef('contraception')} is shown only when the medication is ${forDrugs.map(drugWords).join(' or ')}. Is that right? Does any other medication in section 4 need a reminder of this kind?`);
  }
  extra.push('The number on the chart can drop right after a dose increase, because 100 is tied to the dose logged last (example in section 5.2). Could that mislead a person? Would a fixed scale be safer?');
  extra.push('After a late weekly dose the app shows the next dose on the usual weekday when that is at least 72 hours away (section 6.5). The app gives no advice about missed doses, but it does show this date. Is 72 hours a safe line for every weekly medication in section 4?');
  const orals = usBrands().filter((b) => b.entry.route === 'oral');
  if (orals.length) {
    const withWait = orals.filter((b) => b.numbers.fastingMin).map((b) => b.brand);
    const withoutWait = orals.filter((b) => !b.numbers.fastingMin).map((b) => b.brand);
    // What the labels say about the wait, where the rows of section 4 quote it.
    const waitWords = orals.map((b) => labelFact(b.entry.id, b.brand, 'fastingMin')).filter((f): f is LabelFact => f !== undefined && f.value !== null);
    const waterWords = orals.map((b) => labelFact(b.entry.id, b.brand, 'frequency')).some((f) => f?.quotes.some((x) => x.text.includes('up to 4 ounces')));
    const labelSays =
      waitWords.length && waitWords.every((f) => f.quotes.some((x) => x.text.includes('wait at least') && x.text.includes('drinking beverages or taking other oral medications')))
        ? ` The labels say to wait "at least" that long before eating food, drinking beverages or taking other oral medications, and the app's two lines now say the same${waterWords ? '. The labels also say to take the tablet with water, "up to 4 ounces"; the app says nothing about water' : ''}.`
        : '';
    extra.push(
      `The app shows a wait after a pill for ${withWait.join(', ') || 'no medication'}${withoutWait.length ? `, and none for ${withoutWait.join(' and ')}` : ''} (section 4).${labelSays} Is the wording right for each of them? Should the app also say how to take the tablet (empty stomach, in the morning, how much water)?`,
    );
  }
  // Decisions we took when reading the labels. Each is stated from the rows of section 4.
  const allBrands = usBrands();
  // The highest dose of a brand is also its last step. Where the label gives that dose to some patients only, the row says so in its note.
  const limited = allBrands.flatMap((b) => {
    const max = b.numbers.maxMg;
    const note = labelFact(b.entry.id, b.brand, 'maxMg')?.note;
    return max !== null && note && sameSteps(labelFact(b.entry.id, b.brand, 'ladderMg')?.value, b.numbers.ladderMg) && b.numbers.ladderMg[b.numbers.ladderMg.length - 1] === max ? [`${b.brand}, ${max} mg: ${md(note)}`] : [];
  });
  if (limited.length) {
    extra.push(
      `For every brand the app takes the highest dose the label gives to any adult. It is the limit of the typing check and the last dose step. For these brands the label gives that dose to some patients only, or gives a lower one to others. ${limited.join(' ')} Is that the right way to treat these doses, for the typing check and for the list of steps?`,
    );
  }
  const midpoints = allBrands.flatMap((b) =>
    (['halfLifeH', 'tmaxH'] as const).flatMap((field) => {
      const fact = labelFact(b.entry.id, b.brand, field);
      return fact?.stated?.kind === 'range' ? [`${b.brand}, ${field === 'halfLifeH' ? 'half-life' : 'time to peak'}: the label gives ${fact.stated.low} to ${fact.stated.high} ${fact.stated.unit}s and the app uses ${hoursWords(hoursFromLabel(fact.stated))}`] : [];
    }),
  );
  if (midpoints.length) extra.push(`Where a label gives only a range for the half-life or the time to peak, the chart uses the midpoint of the range (section 4). That is the case for: ${midpoints.join('; ')}. Is the midpoint a fair single number for a rough chart of this kind? Would you take another value from the label?`);
  for (const entryId of [...new Set(allBrands.filter((b) => b.entry.byBrand).map((b) => b.entry.id))]) {
    const group = allBrands.filter((b) => b.entry.id === entryId && b.numbers.pk !== null);
    if (new Set(group.map((b) => `${b.numbers.pk?.halfLifeH}/${b.numbers.pk?.tmaxH}`)).size < 2) continue;
    const notes = group.flatMap((b) => {
      const note = labelFact(entryId, b.brand, 'halfLifeH')?.note;
      return note ? [`${b.brand}: ${note}`] : [];
    });
    extra.push(
      `${group.map((b) => b.brand).join(' and ')} contain the same ingredient, but the chart uses different numbers for each, because their labels word them differently: ${group.map((b) => `${b.brand} half-life ${hoursWords(b.numbers.pk?.halfLifeH ?? 0)}, time to peak ${hoursWords(b.numbers.pk?.tmaxH ?? 0)}`).join('; ')}. ${notes.map(md).join(' ')} Should the two brands be drawn differently? If not, which numbers should both use?`.replace(/ {2,}/g, ' '),
    );
  }
  const pillNames = allBrands.filter((b) => / pill$/.test(b.brand)).map((b) => b.brand);
  if (pillNames.length) extra.push(`The app lists the tablets of a brand that is also a shot under its own name: ${pillNames.map((n) => `"${n}"`).join(', ')}. Could a person pick the wrong row, and so see the dose example and the highest dose of the other form? Is "pill" the right word for these tablets?`);
  // Brands whose label gives a top dose without calling it a maximum (the row of section 4 says so in its rule).
  const topStepOnly = allBrands.filter((b) => labelFact(b.entry.id, b.brand, 'maxMg')?.rule !== undefined).map((b) => b.brand);
  extra.push(
    `The typing check calls its limit "the highest dose in the US prescribing information for" the brand (section 4). Is the highest dose on the label the right limit for this check, and is that a fair name for it?${
      topStepOnly.length ? ` For ${topStepOnly.join(', ')} the label does not call that dose a maximum in section 2; the app uses the highest dose of the label's schedule.` : ''
    } A person whose medication has another brand name, or none, is shown the name of the US brand of the same medication. Is that clear enough?`,
  );
  extra.push('A person can check "A history of an eating disorder" at setup (section 6.7). Almost nothing changes when they do. What should the app do differently for them, for example with the goal weight, the weight chart or the fast-drop line?');

  out.push('### 7.2 Questions that came up while this packet was put together', '');
  out.push(...table(['Code', 'Question'], extra.map((ask) => [code('Q'), ask]), [1, 15]));
  out.push('### 7.3 Anything else', '');
  out.push('Please add anything you saw that no question covers. A short note with the item code is enough.', '');
  return out;
}

// ── Section 1 and the front matter ───────────────────────────────────────────

function introSection(): string[] {
  const out: string[] = [];
  out.push('## 1. What this is and what we ask of you', '');
  out.push('### What the app is', '');
  out.push(
    '[APP NAME] is a phone app for adults in the United States who take a GLP-1 medication that their own doctor prescribed, as a weekly shot or a daily pill. People use it to log each dose, their weight and how they feel, and to get a reminder. It draws a chart called "Estimated medication level" from the doses they logged. It is made by [COMPANY LEGAL NAME], a small independent company with no tie to any drug maker. It is not a medical device.',
    '',
  );
  out.push('### What the app does not do', '');
  out.push(
    ...list([
      '**No dosing advice.** It never says how much to take, when to change a dose, or what to do about a missed dose. It answers no questions about doses.',
      '**No diagnosis.** When a person logs a danger sign, it shows a short card that tells them to contact their doctor or call 911.',
      '**No warning text of its own.** The list of warning signs it shows is the text of the FDA Medication Guide of the person\'s medication, word for word (section 2.6).',
      '**No unit conversion, no selling of medication, no service for people under 18.**',
    ]),
  );
  out.push('### What we ask you to do', '');
  out.push('We are paying you to find errors. We are not asking you to approve the app. Please look for:', '');
  out.push(
    ...list([
      'facts that are wrong or out of date against the current FDA labels and Medication Guides;',
      'danger signs that are missing, or that are handled too weakly or too strongly;',
      'wording that could lead a person to do something unsafe, or to read the app as medical advice;',
      'numbers and cut-offs that you would not defend.',
    ]),
  );
  out.push('If time is short, please start with sections 4, 2 and 5. They cover what a US user sees in the first public version.', '');
  out.push('### How to mark up this document', '');
  out.push(
    ...list([
      'Every item has a code in its first column (R-02, M-17, Q-05). Use the code when you comment.',
      'Mark an item **OK**, **Change**, **Remove** or **Cannot say**. For "Change", write the words or the number you would use. For a fact from a label, add the label section and the revision date of the label.',
      'Say how serious each finding is: **must fix before launch**, **should fix**, or **suggestion**.',
      'Sections 4 and 6.2 have blank columns for your corrections. Anywhere else, comment in the margin or send a list by code.',
      'You do not need to polish our wording. Tell us what is wrong and we will rewrite it.',
    ]),
  );
  out.push('### No endorsement, and your name is not used', '');
  out.push(
    'Your review is private advice to [COMPANY LEGAL NAME]. We will not use your name, your title, your employer or the fact that you looked at the app, in the app, in a store listing, on a website or anywhere else. The app will not say or suggest that a clinician checked or approved it. What the app shows stays our decision and our responsibility.',
    '',
  );
  return out;
}

/**
 * Words per printed page, measured once by printing this packet on letter-size paper: in a
 * compact layout (11-point text, 9.5-point tables) and as a plain Word file with default styles.
 * Most of the packet is tables, so both are well under the usual figure for prose.
 */
const WORDS_PER_PAGE = { compact: 380, word: 235 };

const wordCount = (lines: string[]): number =>
  lines
    .join(' ')
    .replace(/[|>#*`]|-{3,}/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

// ── Putting the packet together ──────────────────────────────────────────────

/** Things that must never appear in the packet. Each one means a bug in this script or in the text it read. */
const FORBIDDEN_IN_PACKET: [RegExp, string][] = [
  [/undefined|\bNaN\b|\[object Object\]|\bnull\b/, 'a value that was not filled in ("undefined", "null" or "NaN")'],
  [/\{\w+\}/, 'a placeholder in curly brackets that was not filled in'],
  [HAS_CJK, 'Chinese characters or full-width punctuation'],
  [/!/, 'an exclamation mark'],
  [/blood\s+levels?/i, 'the words "blood level" (the app says "estimated medication level")'],
];

async function main(): Promise<void> {
  const internals = await loadTriageInternals();
  checkDescribedCode();

  const triage: TriageCounts = { rules: 0, cards: 0, triggers: 0, testPhrases: 0, probes: 0 };
  const hidden: HiddenCounts = { copingCards: 0, copingLines: 0, adviceTexts: 0, routines: 0, exercises: 0 };
  const meds: MedicationCounts = { brands: 0, entries: 0, rows: 0, numbers: 0, fromLabel: 0, labels: 0 };
  const curve: CurveCounts = { wordings: 0, assumptions: 0 };
  const numbers: NumberCounts = { numbers: 0, foods: 0, textNumbers: 0 };

  // Sections are built in reading order, because the item codes count up as they go.
  const intro = introSection();
  const guides: GuideCounts = { guides: 0, items: 0, signs: 0 };
  const section2 = [...dangerSymptomSection(internals, triage), ...guideSections(guides)];
  const section3 = hiddenTextsSection(hidden);
  const section4 = medicationSection(meds);
  const section5 = curveSection(curve);
  const section6 = otherNumbersSection(numbers);
  const section7 = openQuestionsSection(internals);
  const body = [...intro, ...section2, ...section3, ...section4, ...section5, ...section6, ...section7];

  if (PRINT_FINGERPRINTS) {
    console.log(fingerprintReport.join('\n'));
    return;
  }

  const questions = coded('Q');
  const items = triage.rules + triage.triggers + coded('B') + coded('L') + coded('O') + coded('U') + coded('X') + coded('Y') + coded('Z') + coded('T') + coded('I') + coded('K') + hidden.copingLines + coded('A') + hidden.exercises + coded('M') + coded('P') + coded('S') + coded('N') + coded('F') + questions;
  const launchCurveBrands = usBrands().filter((b) => curveAvailable(b.entry, LAUNCH, b.brand)).map((b) => b.brand);
  const contents = table(
    ['Section', 'What it holds', 'Size', 'In the first public version'],
    [
      ['1', 'What this is and what we ask of you', '1 page', ''],
      [
        '2',
        'Danger-symptom rules',
        `${plural(triage.rules, 'rule')}, ${plural(triage.cards, 'card text')}, ${plural(triage.triggers, 'trigger pattern')}, ${plural(triage.testPhrases + triage.probes, 'example phrase')}; ${plural(guides.guides, 'Medication Guide list')} with ${plural(guides.items, 'item')}, and ${plural(guides.signs, 'sign')} set against the rules`,
        `${LAUNCH.triageDetailCards ? 'Each rule shows its own card' : silentAtLaunch.length ? `Alerts show one fixed card; ${plural(silentAtLaunch.length, 'rule')} of a mild level ${silentAtLaunch.length === 1 ? 'shows' : 'show'} nothing (2.1)` : 'Alerts show one fixed card (2.1)'}. They come from the symptom buttons (2.2)${typedAtLaunch() ? ' and from typed text (2.3)' : ' only'}${LAUNCH.guideWarningSigns ? '. The Medication Guide lists (2.6) are shown' : ''}`,
      ],
      ['3', 'Coping cards, daily advice, workouts', `${plural(hidden.copingCards, 'coping card')} (${plural(hidden.copingLines, 'line')}), ${plural(hidden.adviceTexts, 'daily advice text')}, ${plural(hidden.routines, 'workout')} (${plural(hidden.exercises, 'exercise')})`, !LAUNCH.copingCards && !LAUNCH.dailyAdvice && !LAUNCH.workouts ? 'Hidden until reviewed' : 'See each part'],
      [
        '4',
        'US medication list',
        `${plural(meds.brands, 'brand')}, ${plural(meds.rows, 'row')}, ${plural(meds.numbers, 'number')} to check (${meds.fromLabel === meds.numbers ? 'all' : meds.fromLabel} with their label words, from ${plural(meds.labels, 'label')})`,
        usBrands().every((b) => labelFactsShown(b.entry, LAUNCH))
          ? 'The names are shown. The dose example, the typing check and the wait after a pill are used: every number was read from the label'
          : usBrands().some((b) => labelFactsShown(b.entry, LAUNCH))
            ? 'The names are shown. The dose example, the typing check and the wait after a pill are used only for a medication whose numbers were all read from the label'
            : 'The names are shown. No number is used yet: no medication has numbers read from the label, so there is no dose example, no typing check and no wait after a pill',
      ],
      ['5', 'Estimated medication level: method and wording', `${plural(curve.assumptions, 'assumption')}, ${plural(curve.wordings, 'screen text')}`, launchCurveBrands.length ? `Chart shown for ${launchCurveBrands.join(', ')}` : 'No chart yet: no medication has numbers read from the label'],
      ['6', 'Other numbers that need a clinical eye', `${plural(numbers.numbers, 'cut-off or rule', 'cut-offs and rules')}, ${plural(numbers.foods, 'food value')}, ${plural(numbers.textNumbers, 'sentence')} with numbers`, `${LAUNCH.foodAndProtein ? '' : 'Protein target and food values are hidden until reviewed. '}Dose timing, injection sites and the setup questions are live`],
      ['7', 'Open questions', plural(questions, 'question'), ''],
    ],
    [1, 5, 7, 6],
  );
  const words = Math.round((wordCount(body) + wordCount(contents) + 120) / 100) * 100;
  const pages = Math.ceil(words / WORDS_PER_PAGE.compact);
  const pagesAsWord = Math.ceil(words / WORDS_PER_PAGE.word);
  const version = hash8(body.join('\n'));
  const packet = [
    '<!-- Built by app/scripts/build-review-packet.ts (pnpm review-packet). Do not edit by hand: change the code or the script and build again. -->',
    '',
    '# [APP NAME]: clinical review packet',
    '',
    'From [COMPANY LEGAL NAME] · Contact: [CONTACT EMAIL] · Sent on [EFFECTIVE DATE]',
    '',
    `Packet version \`${version}\`. This file is built by a script from the code of the app, so the texts and numbers in it are the ones the app uses. Text in "quotation marks" is exact app text, or a phrase a person might type. Words in [square brackets] are filled in by the app or by us.`,
    '',
    `About ${words.toLocaleString('en-US')} words with ${items} coded items: about ${pages} pages in a compact print layout, about ${pagesAsWord} pages as a plain Word file.`,
    '',
    ...contents,
    ...body,
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  const packetLines = packet.split('\n');
  for (const [pattern, what] of FORBIDDEN_IN_PACKET) {
    // The first line is the note for whoever opens the file as source; it is not part of the text.
    const hit = packetLines.findIndex((line, i) => i > 0 && pattern.test(line));
    if (hit >= 0) problems.push(`The packet would contain ${what} (line ${hit + 1}: ${packetLines[hit].slice(0, 160)}).`);
  }
  const launchCard = fixedAlertCard('US', 'en');
  if (
    launchCard.title !== 'Contact your doctor right away' ||
    launchCard.body !== 'What you logged can be a sign of a serious problem. Contact your doctor right away. If it is an emergency, call 911.' ||
    fixedAlertCard('US', 'en', true).body !== 'What you wrote can be a sign of a serious problem. Contact your doctor right away. If it is an emergency, call 911.'
  ) {
    problems.push('The fixed launch card in src/core/alert.ts no longer has the wording set by the launch plan. If the plan changed, update this check in scripts/build-review-packet.ts.');
  }

  if (problems.length) {
    console.error(`The review packet was NOT written. ${plural(problems.length, 'problem')}:\n`);
    for (const p of problems) console.error(`- ${p}\n`);
    process.exitCode = 1;
    return;
  }

  if (OPTIONS.has('--check')) {
    const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : '';
    if (current !== `${packet}\n`) {
      console.error(`${OUT_FILE} is out of date. Run "pnpm review-packet".`);
      process.exitCode = 1;
    } else console.log('The review packet is up to date.');
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, `${packet}\n`);
  console.log(`Wrote ${OUT_FILE}`);
  if (OPTIONS.has('--docx')) {
    try {
      execFileSync('pandoc', ['--from', 'gfm', '--to', 'docx', '--output', DOCX_FILE, OUT_FILE], { env: { ...process.env, SOURCE_DATE_EPOCH: '0' } });
      console.log(`Wrote ${DOCX_FILE}`);
    } catch (e) {
      console.error(`Could not write the Word file. Is pandoc installed? ${String(e)}`);
      process.exitCode = 1;
    }
  }

  // The numbers the request email quotes. They are printed here so the email can be kept in step.
  const size = [
    `about ${words.toLocaleString('en-US')} words`,
    `about ${pages} pages`,
    `about ${pagesAsWord} pages`,
    `${triage.rules} danger-symptom rules`,
    `${triage.cards} card texts`,
    `${guides.guides} Medication Guide lists`,
    `${guides.items} guide items`,
    `${triage.triggers} trigger patterns`,
    `${hidden.copingCards} coping cards`,
    `${hidden.adviceTexts} daily advice texts`,
    `${hidden.exercises} exercises`,
    `${meds.brands} brands`,
    `${meds.numbers} numbers`,
    `${questions} open questions`,
    `${items} coded items`,
  ];
  console.log(`\nPacket version ${version}\nSize: ${size.join(', ')}.`);
  console.log(`Pages are estimates: about ${pages} in a compact print layout, about ${pagesAsWord} as a plain Word file.`);
  if (existsSync(REQUEST_FILE)) {
    const request = readFileSync(REQUEST_FILE, 'utf8');
    const stale = size.filter((phrase) => !request.includes(phrase));
    if (stale.length) notices.push(`reviewer-request.md does not quote the current size (${stale.join(', ')}). Update the numbers in that email by hand.`);
  }
  if (existsSync(README_FILE)) {
    // The owner's guide quotes the same sizes in its own words, so only the figures are looked for.
    const readme = readFileSync(README_FILE, 'utf8');
    const figures = [words.toLocaleString('en-US'), items, pages, pagesAsWord, triage.rules, hidden.adviceTexts, hidden.exercises, meds.brands, questions, guides.items].map(String);
    const missing = figures.filter((n) => !new RegExp(`(?<![\\d,])${n}(?![\\d,])`).test(readme));
    if (missing.length) notices.push(`README.md in docs/review does not quote these current sizes of the packet: ${missing.join(', ')}. Update it by hand.`);
  }
  for (const n of notices) console.log(`\nNote: ${n}`);
}

try {
  await main();
} finally {
  await appLoader.close();
}

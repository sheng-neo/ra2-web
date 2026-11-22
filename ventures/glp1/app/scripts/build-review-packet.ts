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
 *   calls;
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
 *   must be matched by an open question in section 7.
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

import type { DrugEntry, PkParams } from '../src/core/catalog';
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

const { alertCards, fixedAlertCard, showsAlert } = await load<typeof import('../src/core/alert')>('src/core/alert.ts');
const { brandOptions, CATALOG, hasLabelSource } = await load<typeof import('../src/core/catalog')>('src/core/catalog.ts');
const { curveAvailable, FULL, labelFactsShown, LAUNCH, safetyQuestions, thirdTab } = await load<typeof import('../src/core/features')>('src/core/features.ts');
const { FOODS, foodName, foodUnit } = await load<typeof import('../src/core/foods')>('src/core/foods.ts');
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
  RULES: InternalRule[];
  lists: Record<string, string>;
  negation: Record<string, string | RegExp>;
}

const TRIAGE_FILE = 'src/core/triage.ts';
const TRIAGE_TEST_FILE = 'src/core/triage.test.ts';

/** Word lists the trigger patterns are built from, by the name they have in triage.ts. */
const LIST_NAMES = ['EN_SEVERE', 'EN_BELLY', 'EN_HURT', 'EN_SORE', 'EN_VOMIT', 'EN_RUNS', 'EN_TO_BACK', 'EN_LONG_OR_OFTEN', 'EN_DIZZY', 'EN_RUQ', 'EN_CANT_SEE', 'EN_SEE', 'EN_NOT_EAT', 'EN_DAYS'];
/** The pieces that decide whether a "no" or "not" in front of a symptom counts. */
const NEGATION_NAMES = ['EN_STILL_THERE', 'EN_FILL_HAVE', 'EN_FILL_NO', 'EN_NOT', 'EN_NEGATED', 'EN_STILL_TRUE', 'EN_BUT_NOW', 'EN_NOT_FOR_LONG', 'EN_ASKS_ABOUT', 'EN_ONLY_AUX_NOT'];

/**
 * The pattern tables of triage.ts. They are module-private there, so this loads a temporary
 * copy of the file with one export line added. The copy lives outside the repository and is
 * removed right away.
 */
async function loadTriageInternals(): Promise<TriageInternals> {
  const coreDir = join(APP_DIR, 'src', 'core');
  const exportLine = `\nexport const __reviewInternals = { EN, EN_CRISIS, EN_LOW_SUGAR_SIGNS, RULES, lists: { ${LIST_NAMES.join(', ')} }, negation: { ${NEGATION_NAMES.join(', ')}, GAP: gap(1) } };\n`;
  // Relative imports must still point at src/core from where the copy is.
  const copy = source(TRIAGE_FILE).replace(/from '\.\/([^']+)'/g, (_whole, name: string) => `from '${pathToFileURL(join(coreDir, `${name}.ts`)).href}'`) + exportLine;
  const dir = mkdtempSync(join(tmpdir(), 'review-packet-'));
  try {
    const file = join(dir, 'triage-internals.mts');
    writeFileSync(file, copy);
    const loaded = (await import(pathToFileURL(file).href)) as { __reviewInternals: TriageInternals };
    return loaded.__reviewInternals;
  } catch (e) {
    throw new Error(`Could not read the pattern tables of ${TRIAGE_FILE}. If a table was renamed there, update LIST_NAMES, NEGATION_NAMES and the export line in scripts/build-review-packet.ts.\n${String(e)}`);
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
    fp: 'e448b41b',
    triggers: [
      { says: `A **severe word**, then (within about 20 characters) a **stomach word** joined to a **pain word**.`, examples: ['severe stomach pain', 'really bad bellyache'] },
      { says: `A **severe word**, then "pain", "ache", "cramp" or "cramping", then "in", "around" or "across", then a **stomach word**.`, examples: ['terrible pain in my upper abdomen'] },
      {
        says: `A **stomach word**, then (within about 30 characters) words that say the pain is very bad: a **pain word** plus "so", "really", "very", "extremely" or "super" plus "bad", "badly" or "much"; "is killing me"; "unbearable"; "excruciating"; "can't stand it", "can't take it" or "can't bear it"; "doubled over"; "can't stand up straight"; "worst pain".`,
        examples: ['my stomach hurts so bad', 'my belly is killing me', 'stomach cramps, doubled over'],
      },
      { says: `"Doubled over", then a **stomach word**.`, examples: ['doubled over with belly cramps'] },
      { says: `A **stomach word** and a **pain word**, then a **reaches-the-back phrase**, in the same sentence or the next one.`, examples: ['belly pain that goes through to my back', 'Bad stomach pain. It goes to my back.'] },
      { says: `A **pain word**, then "in", "around" or "across" and a **stomach word**, then a **reaches-the-back phrase**.`, examples: ['pain in my stomach that goes to my back'] },
      { says: `A **stomach word** and a **pain word**, then "but", then a **reaches-the-back phrase**. So "not severe, but it goes to my back" still triggers.`, examples: ['stomach pain, not severe, but it goes to my back'] },
      { says: `A **stomach word**, then "in so much pain" or "in too much pain".`, examples: ['my stomach is in so much pain'] },
      { says: `"So much" or "too much" plus "pain" or "cramping", then "in", "around" or "across", then a **stomach word**.`, examples: ['so much pain in my belly'] },
      { says: `"Stabbing", "sharp", "shooting" or "tearing", directly followed by a **stomach word** joined to a **pain word**.`, examples: ['sharp stomach pain'] },
      { says: `"Stabbing", "sharp", "shooting" or "tearing", then "pain", "cramp" or "cramping", then "in", "around" or "across" and a **stomach word** ("upper" or "lower" may stand before it).`, examples: ['stabbing pain in my stomach', 'sharp cramps in my lower belly'] },
    ],
  },
  chest_or_faint: {
    fp: 'eb612ae8',
    triggers: [
      { says: `"Chest pain" or "chest pains".`, examples: ['chest pain since this morning'] },
      { says: `"Pain", "ache", "pressure", "tightness", "squeezing", "heaviness" or "heavy feeling", then "in", "on" or "across" "my chest" or "the chest".`, examples: ['pressure in my chest', 'heavy feeling on my chest'] },
      { says: `"Chest" followed by "hurts", "is hurting", "pressure", "tightness", "is tight", "feels tight" or "feels heavy".`, examples: ['my chest hurts', 'my chest feels tight'] },
      { says: `"Passed out" or "blacked out".`, examples: ['I passed out after the shot'] },
      { says: `"Fainted" or "fainting".`, examples: ['I fainted in the shower'] },
      { says: `"Lost consciousness".`, examples: ['I lost consciousness for a minute'] },
      { says: `"Unconscious".`, examples: ['I was unconscious'] },
    ],
  },
  anaphylaxis: {
    fp: '288f6bcd',
    triggers: [
      {
        says: `"Throat", "lip", "lips", "tongue", "face", "eyelid" or "eyelids", then (within about 15 characters) a swelling word: "swell", "swells", "swelled", "swelling", "swollen", "puffed up", "puffing up", "closing up" or "is closing".`,
        examples: ['my throat is swelling', 'my face is swollen', 'my lips are tingling and swelling'],
      },
      { says: `"Throat" or "airway", then "closing", "closed" or "closes".`, examples: ['throat closing'] },
      { says: `"Swelling" or "swollen", then "throat", "lip", "lips", "tongue", "face", "eyelid" or "eyelids".`, examples: ['swelling of my lips and tongue'] },
      {
        says: `"Can't", "cannot", "couldn't", "hard to", "trouble", "difficulty", "difficult to", "struggling to" or "unable to", followed by "breathe" or "breathing". It does not count when "through my nose" follows.`,
        examples: ["I can't breathe", 'trouble breathing'],
      },
      { says: `"Short of breath" or "shortness of breath".`, examples: ['short of breath'] },
      { says: `"Can't catch my breath".`, examples: ["I can't catch my breath"] },
      { says: `"Hives", "rash" or "welts", then "all over", "everywhere", "whole body" or "entire body". "All over" one body part does not count ("rash all over my thigh").`, examples: ['hives all over my body', 'rash everywhere'] },
      { says: `"All over", "whole body", "entire body" or "covered in", then "hives", "rash" or "welts".`, examples: ['covered in hives'] },
    ],
  },
  vision: {
    fp: '74e89044',
    triggers: [
      { says: `"Sudden", "suddenly" or "all of a sudden", then (within about 30 characters) a **vision word**, or "went dark" or "went black".`, examples: ["suddenly I can't see clearly", 'sudden vision loss in one eye'] },
      { says: `A **vision word**, then "sudden", "suddenly" or "all of a sudden".`, examples: ['my vision went blurry all of a sudden'] },
      { says: `"One eye", then a **vision word**, "dark", "black" or "fuzzy".`, examples: ['one eye is blurry'] },
      { says: `"Left eye" or "right eye", then a **cannot-see word**, "dark", "black" or "fuzzy". The word "vision" alone is not enough here.`, examples: ['my right eye is blurry'] },
      { says: `A **cannot-see word**, then "one eye", "left eye" or "right eye".`, examples: ['blurry in my left eye'] },
      {
        says: `"Vision loss", "loss of vision", "loss of sight", "lost my vision", "lost some vision", "lost my sight", "losing my vision", "losing my sight", "went blind", "going blind" or "gone blind".`,
        examples: ['losing my sight', 'I think I am going blind'],
      },
      {
        says: `"Part", "half", "piece", "some" or "a section" of "my vision", "my sight", "my visual field" or "my view", then "missing", "gone", "dark", "black", "blocked" or "cut off".`,
        examples: ['part of my vision is missing'],
      },
      { says: `"Blind spot". Or "dark" or "black" plus "spot", "curtain", "shadow" or "area", then "vision", "eye" or "sight".`, examples: ['a blind spot', 'a dark curtain over my vision'] },
    ],
  },
  hypoglycemia: {
    fp: '2c627043',
    triggers: [
      { says: `A word that starts with "hypoglyc" ("hypoglycemia", "hypoglycemic").`, examples: ['I think this is hypoglycemia'] },
      { says: `"Low blood sugar" or "low blood glucose".`, examples: ['low blood sugar'] },
      { says: `"Blood sugar" or "blood glucose", then (within about 15 characters) "low", "dropped", "crash", "crashed", "crashing", "tanked" or "bottomed".`, examples: ['I think my blood sugar is low'] },
      { says: `"Sugar" or "glucose", then "is", "was", "got", "went" or "feels", then "low". "Very", "too", "really", "so" or "super" may stand before "low".`, examples: ['my sugar is really low'] },
      { says: `"Sugar" or "glucose" (with or without "level" or "levels"), then "dropped", "dropping", "crashed", "crashing", "tanked", "plummeted" or "bottomed out".`, examples: ['my glucose dropped', 'sugar crashed'] },
    ],
  },
  dehydration: {
    fp: '0781eec9',
    triggers: [
      {
        says: `A word that says it keeps happening ("keep", "keeps", "kept", "can't stop", "cannot stop", "won't stop", "constant", "constantly", "nonstop", "over and over", "again and again", "repeatedly"), then a **vomiting word** or a **diarrhea word**.`,
        examples: ['I keep throwing up', 'constant diarrhea'],
      },
      { says: `A **vomiting word** or a **diarrhea word**, then a **long-or-often phrase**.`, examples: ["I've been throwing up all day", 'threw up 6 times today', 'diarrhea nonstop since last night'] },
      {
        says: `"Can't", "cannot", "couldn't", "unable to", "not able to" or "haven't been able to", then "keep", then "anything", "any food", "any water", "any fluids", "any liquids", "water", "even water", "fluids", "liquids", "food" or "a thing", then "down".`,
        examples: ["can't keep water down", "I can't keep any fluids down"],
      },
      { says: `"Nothing stays down", "nothing will stay down" or "nothing is staying down".`, examples: ['nothing stays down'] },
      { says: `A **vomiting word** followed by "water", "everything I drink", "everything I eat", "whatever I drink" or "whatever I eat". "Even", "just" or "plain" may stand in between.`, examples: ['throwing up even water', 'vomiting everything I drink'] },
      {
        says: `"Even water", "even sips", or "everything", "anything" or "whatever" plus "I eat", "I drink" or "I swallow"; then "comes up", "comes back up", "comes right up", "came up" or a **vomiting word**.`,
        examples: ['everything I eat comes back up', 'even water comes right up'],
      },
      { says: `"Haven't", "have not", "hasn't", "didn't" or "did not", followed by "peed", "pee", "urinated", "urinate" or "been able to pee".`, examples: ["I haven't peed all day"] },
      { says: `"No", "barely any", "hardly any", "very little" or "almost no", followed by "pee" or "urine".`, examples: ['very little urine today'] },
      { says: `"Barely" or "hardly", followed by "peeing", "pee", "peed", "urinating", "urinate" or "urinated".`, examples: ['barely peeing'] },
      { says: `"Peeing" or "urinating", followed by "little", "very little" or "so little".`, examples: ['peeing very little'] },
      { says: `"Not peeing" or "not urinating", followed by "much", "a lot" or "at all".`, examples: ['not peeing much'] },
      { says: `"Peeing" or "urinating", followed by "less", "much less", "a lot less" or "way less".`, examples: ['peeing a lot less than usual'] },
      { says: `"Can't pee" or "can't urinate".`, examples: ["I can't pee"] },
      { says: `"Stand up", "stands up", "standing up", "stood up", "get up", "getting up", "got up" or "standing", then a **dizzy phrase**.`, examples: ['when I stand up I get dizzy', 'got up and everything went black'] },
      { says: `A **dizzy phrase**, then "when", "whenever", "every time", "each time", "if", "after" or "as soon as", then "I stand", "I stood", "I get" or "I got".`, examples: ['dizzy when I stand up', 'lightheaded every time I get up'] },
    ],
  },
  gallbladder: {
    fp: '3a2e6029',
    triggers: [
      { says: `A word that starts with "jaundice".`, examples: ['jaundice'] },
      { says: `"Yellow", "yellowing" or "yellowish", followed by "skin", "eye", "eyes", "eyeball" or "eyeballs" ("of", "my" or "the" may stand in between).`, examples: ['yellowing of my skin', 'yellow eyes'] },
      { says: `"Skin", "eye", "eyes" or "whites of my eyes", then "is", "are", "looks", "turned", "turning", "got", "getting", "went", "going", "gone" or "seems", then "yellow".`, examples: ['my eyes look yellow', 'my skin is turning yellow'] },
      { says: `A **pain or soreness word**, then (within about 30 characters) an **upper-right phrase**.`, examples: ['pain in my upper right abdomen', 'pain under my right ribs'] },
      { says: `An **upper-right phrase**, then a **pain or soreness word**.`, examples: ['my upper right side hurts', 'right rib cage is sore'] },
      { says: `"Right upper pain" or "right upper abdominal pain".`, examples: ['right upper abdominal pain'] },
    ],
  },
  thyroid: {
    fp: 'cd70f861',
    triggers: [
      { says: `"Lump", "bump", "swelling", "mass", "nodule", "knot" or "growth", then "in", "on", "at" or "around" "my neck" or "the front of my neck".`, examples: ['lump in my neck', 'a swelling on the front of my neck'] },
      { says: `"Neck" followed by "lump", "swelling", "swollen", "mass" or "nodule" ("is", "looks" or "feels" may stand in between).`, examples: ['my neck is swollen'] },
      { says: `"Trouble", "difficulty", "difficult", "hard time", "problem", "problems", "hard", "can't", "cannot" or "unable to", followed by a word that starts with "swallow".`, examples: ['trouble swallowing', "it's hard to swallow"] },
      {
        says: `"Hoarse", "hoarseness", "raspy" or "lost my voice", then words that say it has lasted: "for weeks", "for months", "for a long time", "for a while", "for a month", "for ages", "won't go away", "not getting better", "not improving", "still", "all the time" or "constantly".`,
        examples: ['my voice has been hoarse for weeks', "hoarse and it won't go away"],
      },
      { says: `"For weeks", "for months", "for a long time", "still", "always" or "constantly", then "hoarse" or "raspy".`, examples: ['still hoarse'] },
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
    fp: '6d3877f5',
    triggers: [
      { says: `A **not-eating phrase**, then (within about 25 characters) a **days phrase**.`, examples: ["haven't eaten in 3 days", 'I have barely eaten for the past four days'] },
      { says: `A **days phrase**, then (within about 30 characters) a **not-eating phrase**.`, examples: ["for the last few days I can't eat anything"] },
    ],
  },
};

/** The self-harm rule is one pattern with many alternatives. It has no check for "no" or "not". */
const CRISIS_GLOSS = {
  fp: '7e19b174',
  says: [
    `A word that contains "suicid" ("suicide", "suicidal").`,
    `"Kill myself", "killing myself".`,
    `"End my life", "ending my life", "take my life", "taking my own life".`,
    `"Want to die", "wanted to die", "wanna die".`,
    `"Wish I was dead", "wish I were dead", "better off dead".`,
    `"Don't want to live", "do not want to be alive".`,
    `"No reason to live", "no point in living".`,
    `"Life isn't worth living", "life is not worth living", "not worth living".`,
    `"Want to", "going to", "thinking about", "thinking of", "thoughts of" or "urge to", followed by "hurt myself" or "harm myself" (also "hurting", "harming"). "Self-harm".`,
    `"End it all".`,
    `"Don't want to be here anymore" (also "around" or "alive" in place of "here").`,
    `"Want to", "wanna", "going to", "gonna", "thinking about", "thinking of" or "ready to", followed by "end it" or "end things".`,
    `"Can't go on" at the end of a sentence, or followed by "like this", "anymore", "living", "any longer" or "much longer".`,
  ],
  examples: [
    'thinking about suicide',
    'I want to kill myself',
    'I want to end my life',
    'I want to die',
    'I wish I were dead',
    "I don't want to live anymore",
    'there is no reason to live',
    'life is not worth living',
    'thoughts of hurting myself',
    'I want to end it all',
    "I don't want to be here anymore",
    'thinking of ending things',
    "I can't go on like this",
  ],
};

/** The four sign groups of the low-blood-sugar rule, in the order of EN_LOW_SUGAR_SIGNS. */
const SIGN_GLOSS = {
  fp: '1ae6f93b',
  signs: [
    { says: `Shaking: "shaky", "shaking", "shakes", "tremble", "trembles", "trembling", "tremor", "tremors", "jittery".`, example: 'I feel shaky' },
    { says: `Sweating: "cold sweat", "cold sweats", "clammy", "sweaty", "sweating".`, example: 'in a cold sweat' },
    { says: `Racing heart: a word that starts with "palpitat"; "heart" or "pulse" plus "racing", "pounding", "fluttering" or "beating fast"; "racing heart", "pounding heart".`, example: 'my heart is racing' },
    { says: `Confusion: a word that starts with "confus"; "disoriented"; "dazed".`, example: 'I feel confused' },
  ],
  examples: ['shaky and in a cold sweat', 'heart racing and I feel confused'],
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
  { name: 'EN_RUNS', label: 'diarrhea word' },
  {
    name: 'EN_TO_BACK',
    label: 'reaches-the-back phrase',
    fp: '9be3bf48',
    says: `"to", "into", "through", "toward", "towards", "in", "around" or "round", followed by "back", "my back" or "the back" ("upper", "lower", "middle" or "mid" may stand before "back"), but not "back yard", "back seat", "back room", "back door", "back porch" or "back office". Or "and", "plus", "with" or "also", followed by "back" or "my back", but not "back to", "back from", "back at", "back on", "back home", "back again" or "back in". Or "back hurts", "back hurting", "back aches", "back aching" or "back pain" ("also", "too" or "is" may stand in between).`,
  },
  {
    name: 'EN_LONG_OR_OFTEN',
    label: 'long-or-often phrase',
    fp: '0614e006',
    says: `"all day", "all night", "all morning", "all afternoon", "all evening", "all week"; "nonstop"; "constantly"; "won't stop", "can't stop"; "over and over"; "for days", with or without a count ("for 3 days", "for two days", "for a few days", "for several days", "for many days"); "24 hours", "48 hours", "72 hours"; "since yesterday", "since last night"; or a count of 5 or more "times" (5 to 9, any number with two or more digits, "five" to "ten", "several", "many", "multiple", "countless", "so many").`,
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
const NEGATION_FP = '7127c5e7';

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
  ['a little dizzy', 'Dizziness triggers only together with standing up.'],
  ['heart racing a bit', 'One low-blood-sugar sign alone is not enough. Two sign groups are needed.'],
  ['feeling shaky after coffee', 'One low-blood-sugar sign alone is not enough.'],
  ['had a sugar crash after lunch', '"Sugar crash" as a figure of speech does not match the low-blood-sugar phrases.'],
  ['mild stomach ache after dinner', 'Stomach pain triggers only with a severe word or when it reaches the back.'],
  ['my stomach pain is back', '"Is back" is not read as pain reaching the back.'],
  ['stomach pain, but not to my back', 'The person says it does not reach the back.'],
  ['barely ate today', 'Eating too little triggers only when it has gone on for days.'],
  ['rash at the injection site', 'A rash triggers only when it is all over the body.'],
  ['itchy rash all over my thigh', '"All over" one body part does not count.'],
  ['sore throat', 'Only swelling or closing of the throat triggers.'],
  ["can't breathe through my nose", 'A blocked nose is not read as trouble breathing.'],
];

/**
 * Extra phrases that are not in the test suite. The script only reports what the rules do with
 * each one today; whether that is right is the reviewer's call.
 */
const EXTRA_PROBES: string[] = [
  'my sister is pregnant',
  'my mom is having surgery next week',
  'my dad had chest pain last year',
  'I fainted once as a kid',
  'hard to swallow this big pill',
  'short of breath after climbing stairs',
  'really bad stomach cramps from my period',
  'watched a show about suicide prevention',
  'sedated at the dentist last month',
  'I feel faint',
  'I keep passing out',
  'my vision is blurry',
  'double vision',
  "stomach pain that won't go away",
  'constant stomach pain',
  'throwing up and stomach pain',
  'fever and stomach pain',
  'threw up 4 times',
  'throwing up everything',
  'vomited blood',
  'black tarry stool',
  'clay colored stools',
  'dark urine',
  "can't pass gas and my belly is swollen",
  'no bowel movement for a week',
  'my throat feels tight',
  'itching all over',
  'wheezing',
  'very fast heartbeat',
  'dizzy and confused',
  'my blood sugar was 60 this morning',
  'feeling hopeless',
  'feeling depressed',
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
  ['src/core/triage.ts', 'function negatedEn(', '8464d29b', 'section 2.3 (how "no" and "not" are read)'],
  ['src/core/triage.ts', 'function anyEn(', 'b4d1f1a3', 'section 2.3'],
  ['src/core/triage.ts', 'export function triageText(', 'f9b32e83', 'section 2.3'],
  ['src/core/pk.ts', 'export function kaFromTmax(', 'ca06c69a', 'section 5'],
  ['src/core/pk.ts', 'export function modelFor(', '1c38897f', 'section 5'],
  ['src/core/pk.ts', 'export function bateman(', 'bcdacc1d', 'section 5'],
  ['src/core/pk.ts', 'export function concentration(', 'fa12fefe', 'section 5'],
  ['src/core/pk.ts', 'export function steadyStatePeak(', '884eea7b', 'section 5'],
  ['src/core/pk.ts', 'export function referenceDose(', 'ca701dc4', 'section 5'],
  ['src/core/pk.ts', 'export function exposureCurve(', '502d8aee', 'section 5'],
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
  ['src/core/catalog.ts', 'export function needsDoseConfirm(', '506c35e3', 'section 4 (typing check)'],
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
  const questionLogsNothing = screenCodeHas('src/web/actions.ts', /export async function addQuestionFromList\((?:(?!\n\}\n)[\s\S])*setUi\(\{ triage: \{ hits, rowId: null \} \}\)/, 'what an alert from the questions box leaves behind');
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
    'The text is checked as a whole, before anything else is done with it. Capital letters do not matter. Each rule is a list of phrase patterns. Section 2.4 gives every pattern in plain words, with examples that the script that built this packet ran through the real rules. The app also has Chinese phrase lists. They are not part of this review.',
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
      counts.triggers += CRISIS_GLOSS.says.length;
    } else if (gloss) {
      out.push('What triggers it in typed text:', '');
      out.push(
        ...table(
          ['Code', 'What the person typed', 'Examples that trigger (checked)'],
          gloss.triggers.map((t, i) => {
            for (const example of t.examples) checkExample(example, patterns[i] ?? null, `TRIGGERS.${rule.id}[${i}]`);
            return [`${ruleCode.get(rule.id)}.${i + 1}`, t.says, t.examples.map(q).join('; ')];
          }),
          [1, 9, 5],
        ),
      );
      counts.triggers += gloss.triggers.length;
      if (rule.id === 'hypoglycemia') {
        SIGN_GLOSS.signs.forEach((sign, i) => {
          if (!new RegExp(internals.EN_LOW_SUGAR_SIGNS[i]?.source ?? '$^', 'i').test(sign.example)) problems.push(`SIGN_GLOSS.signs[${i}]: the example "${sign.example}" does not match its sign pattern.`);
        });
        for (const example of SIGN_GLOSS.examples) checkExample(example, null, 'SIGN_GLOSS');
        out.push('It also triggers when the text has signs from **two or more** of these four groups. One group alone is not enough.', '');
        out.push(...table(['Code', 'Sign group'], SIGN_GLOSS.signs.map((s, i) => [`${ruleCode.get(rule.id)}.S${i + 1}`, s.says]), [1, 12]));
        out.push(`Examples that trigger (checked): ${SIGN_GLOSS.examples.map(q).join(', ')}.`, '');
        counts.triggers += SIGN_GLOSS.signs.length;
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
  for (const phrase of ['no chest pain', "I don't have any chest pain", 'never had chest pain', 'no fever or chest pain']) expectOutcome(phrase, null, 'Section 2.3');
  for (const phrase of ['not feeling well, chest pain', "isn't chest pain serious?", "I've never had chest pain like this", 'I never get chest pain, but today I do', "wasn't unconscious long"]) expectOutcome(phrase, 'chest_or_faint', 'Section 2.3');
  expectOutcome('I do not want to die', 'crisis', 'Section 2.3');
  out.push('How the rules read "no" and "not":', '');
  out.push(
    ...list([
      `A rule stays quiet when the words right before the symptom deny it: "no chest pain", "I don't have any chest pain", "never had chest pain", "no fever or chest pain".`,
      `Only small filler words may stand between the "no" and the symptom, such as "any", "more", "have", "having" or "feeling". With anything else in between, the rule fires: "not feeling well, chest pain".`,
      `A denial does not count, and the rule fires, when the rest of the sentence says the symptom is there now. The markers are "like this", "this bad", "so bad", "before", "until", and turns such as "but today I do". "Wasn't unconscious long" also fires: it happened, only not for long.`,
      `A question that opens with "isn't", "aren't" or "doesn't" is not a denial: "isn't chest pain serious?" fires.`,
      `Between the key words of one pattern a few other words may stand. How many characters is fixed for each pattern. They may not cross the end of a sentence. They may not cross "no", "not", "never", "without" or a word ending in "n't", unless that word says the symptom goes on ("won't go away", "doesn't stop", "not getting better").`,
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

const hoursWords = (h: number): string => (h % 24 === 0 ? `${h} hours (${plural(h / 24, 'day')})` : `${h} hours`);

interface MedicationCounts {
  brands: number;
  entries: number;
  rows: number;
  numbers: number;
}

/** The US brand list grouped by catalog entry, in the order the app shows it. "Other / custom" is left out. */
function usMedications(): { entry: DrugEntry; brands: string[] }[] {
  const groups: { entry: DrugEntry; brands: string[] }[] = [];
  for (const option of brandOptions('US')) {
    if (option.brand === null) continue;
    const group = groups.find((g) => g.entry.id === option.entry.id);
    if (group) group.brands.push(option.brand);
    else groups.push({ entry: option.entry, brands: [option.brand] });
  }
  return groups;
}

function medicationSection(counts: MedicationCounts): string[] {
  const out: string[] = [];
  const groups = usMedications();
  const hasCustom = brandOptions('US').some((o) => o.entry.id === 'custom');
  const anySource = groups.some((g) => hasLabelSource(g.entry));
  const anyVerified = groups.some((g) => g.entry.verified);
  counts.brands = groups.reduce((n, g) => n + g.brands.length, 0);
  counts.entries = groups.length;

  out.push('## 4. US medication list', '');
  out.push(
    `At setup a US user picks one of ${plural(counts.brands, 'brand')}${hasCustom ? ', or "Other / custom"' : ''}: ${groups.flatMap((g) => g.brands).join(', ')}. Brand names are used only so that people can find their own medication. Trademarks belong to their owners. The app is not connected to any drug maker.`,
    '',
  );
  out.push('How the app uses each number:', '');
  // The countdown on the main screen has its own wording, which says less than the line on the sheet.
  const countdown = screenCodeHas('src/web/screens/Today.tsx', /d\.fastingUntil && <div className="due">\{t\('today\.fasting'/, 'the countdown after a pill on the main screen') ? screenTextMany('today.fasting', { count: '[minutes]' }) : null;
  out.push(
    ...list([
      `**Dose steps.** ${
        screenCodeHas('src/web/screens/Onboarding.tsx', /example !== null \? t\('onb\.dose\.example', \{ dose: example \}\)/, 'how the dose steps are used')
          ? `Only the first step is used: at setup it is the grey example in the box where a person types the dose they were prescribed (${q(screenText('onb.dose.example', { dose: '[first step]' }))}).`
          : 'Used only as an example in the box where a person types the dose they were prescribed.'
      } The app never suggests a step and never says when to move up.`,
      `**Highest dose.** A typing check, nothing more. When a person logs a dose in mg above this number, the app asks once: ${q(screenText('dose.overMax.form', { amount: '[amount]', unit: 'mg', max: '[highest dose]' }))} Then it lets them log it. Doses logged in other units are not checked and never converted.`,
      '**Half-life and time to peak.** Used only for the chart in section 5.',
      `**Wait after a pill.** On the sheet where a pill is logged the app shows: ${q(screenText('dose.fasting', { minutes: '[minutes]' }))} ${
        countdown ? `After the pill is logged, the main screen counts those minutes down with other words: ${q(countdown)}. The countdown speaks of eating only; the sheet also says not to drink.` : 'After the pill is logged, the main screen counts those minutes down.'
      }`,
    ]),
  );
  // In a build where catalog numbers need a label source, none of the three uses above happens for an entry without one.
  const factsAtLaunch = groups.filter((g) => labelFactsShown(g.entry, LAUNCH)).flatMap((g) => g.brands);
  if (factsAtLaunch.length < counts.brands) {
    out.push(
      `**In the first public version a number is used only when its entry names the FDA label page it was read from.** That holds for the chart and for the three uses above: the dose example, the typing check and the wait after a pill. ${
        factsAtLaunch.length ? `Today that is the case for ${factsAtLaunch.join(', ')} only.` : 'No entry does today, so the first public version shows no dose example, asks no typing check, and shows no wait after a pill. Every medication can only be logged.'
      } Each use comes back by itself when the entry gets its label page. The full test version uses every number below as it stands.`,
      '',
    );
  }
  out.push(
    anySource
      ? 'Where an entry names the FDA label page its numbers were read from, the table says so. Every other number is from the code and has not been checked against the label.'
      : `No entry names a label page yet. **Every number below is from the code and has not been checked against the FDA label.** The rule in the code is that a number may be added or changed only together with the address of the FDA label page it was read from.${anyVerified ? '' : ' No entry has been marked as checked by a person.'}`,
    '',
  );
  out.push(
    'Please write the correct value and the label section (for example "2.2" or "12.3") in the two blank columns. Leave a cell empty when the value in the app is right, and write "OK" in the label column. Where the app has no value, please give one from the label.',
    '',
  );

  for (const { entry, brands } of groups) {
    out.push(`#### ${brands.join(' and ')} (${entry.ingredient ?? entry.generic.en})`, '');
    if (brands.length > 1) out.push(`${brands.join(' and ')} share one entry in the app, so they have the same numbers. Please tell us if they should differ.`, '');
    const numberStatus = hasLabelSource(entry) ? `Read from the label page ${entry.source ?? ''}` : NOT_CHECKED;
    const rows: string[][] = [];
    const row = (what: string, value: string, status: string, numbers = 0) => {
      rows.push([code('M'), what, value, status, '', '']);
      counts.numbers += numbers;
    };
    row(brands.length > 1 ? 'Brand names' : 'Brand name', brands.join(', '), NOT_CHECKED);
    row('Generic name', entry.ingredient ?? entry.generic.en, NOT_CHECKED);
    row('How it is taken', entry.route === 'oral' ? 'Pill, by mouth' : 'Shot, under the skin', NOT_CHECKED);
    row('How often', entry.frequency === 'daily' ? 'Once a day' : 'Once a week', NOT_CHECKED);
    row('Dose steps (mg)', entry.ladderMg.join(', '), entry.ladderMg.length ? numberStatus : BLANK_IN_APP, entry.ladderMg.length);
    row('Highest dose for the typing check (mg)', entry.maxMg === null ? '' : String(entry.maxMg), entry.maxMg === null ? BLANK_IN_APP : numberStatus, entry.maxMg === null ? 0 : 1);
    row('Half-life used for the chart', entry.pk ? hoursWords(entry.pk.halfLifeH) : '', entry.pk ? numberStatus : BLANK_IN_APP, entry.pk ? 1 : 0);
    row('Time to peak used for the chart', entry.pk ? hoursWords(entry.pk.tmaxH) : '', entry.pk ? numberStatus : BLANK_IN_APP, entry.pk ? 1 : 0);
    if (entry.route === 'oral') {
      row('Wait after the pill before eating or drinking (minutes)', entry.fastingMin ? String(entry.fastingMin) : '', entry.fastingMin ? numberStatus : 'Not in the app. No wait is shown for this medication', entry.fastingMin ? 1 : 0);
    }
    out.push(...table(['Code', 'What', 'In the app', 'Where it comes from', 'Your correction', 'Label section'], rows, [1, 5, 4, 5, 4, 3]));
    counts.rows += rows.length;
    const drawn = (on: boolean) => (on ? 'drawn' : 'not drawn');
    const why = !entry.pk ? ' (the app has no half-life and time to peak for it)' : !curveAvailable(entry, LAUNCH) ? ' (its numbers have no label source yet)' : '';
    out.push(`Chart of the estimated medication level: ${drawn(curveAvailable(entry, LAUNCH))} in the first public version${why}; ${drawn(curveAvailable(entry, FULL))} in the full test version.`, '');
    const otherUses = [entry.ladderMg.length ? 'the dose example' : '', entry.maxMg !== null ? 'the typing check' : '', entry.fastingMin ? 'the wait after a pill' : ''].filter(Boolean);
    if (otherUses.length) out.push(`${sentenceCase(otherUses.join(', '))}: ${labelFactsShown(entry, LAUNCH) ? 'used' : 'not used'} in the first public version${labelFactsShown(entry, LAUNCH) ? '' : ' (no label source yet)'}; used in the full test version.`, '');
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
  const meds = usMedications().filter((g) => g.entry.pk !== null);
  // Entries with the same numbers and the same schedule are one column.
  const columns: { names: string[]; pk: PkParams; intervalH: number; facts: PkFacts }[] = [];
  for (const { entry, brands } of meds) {
    const pk = entry.pk as PkParams;
    const intervalH = entry.frequency === 'daily' ? 24 : 168;
    const same = columns.find((c) => c.pk.halfLifeH === pk.halfLifeH && c.pk.tmaxH === pk.tmaxH && c.intervalH === intervalH);
    if (same) same.names.push(...brands);
    else columns.push({ names: [...brands], pk, intervalH, facts: pkFacts(pk, intervalH) });
  }
  for (const c of columns) {
    if (Math.abs(c.facts.singlePeakH - c.pk.tmaxH) > 0.3) problems.push(`Section 5 says a single dose peaks at the time to peak, but for ${c.names.join(', ')} the model peaks at ${c.facts.singlePeakH.toFixed(1)} h, not ${c.pk.tmaxH} h.`);
  }
  const launchCurves = usMedications().filter((g) => curveAvailable(g.entry, LAUNCH)).flatMap((g) => g.brands);
  const noNumbers = usMedications().filter((g) => g.entry.pk === null).flatMap((g) => g.brands);

  out.push('## 5. The estimated medication level: method and wording', '');
  out.push(
    'The chart shows a rough picture of how much medication is in the body over time, worked out from the doses the person logged. It is a population-average estimate. It is not a measurement, it has no unit, and the app says it cannot be used to adjust a dose.',
    '',
  );
  out.push(
    `In the first public version the chart is drawn ${LAUNCH.curveNeedsSource ? 'only for a medication whose numbers in section 4 name the FDA label page they were read from' : 'for every medication that has a half-life and a time to peak in section 4'}. Today that is: ${launchCurves.length ? launchCurves.join(', ') : 'no medication'}. Medications with numbers in the code: ${meds.flatMap((g) => g.brands).join(', ') || 'none'}. Medications without numbers, which never get a chart: ${noNumbers.join(', ') || 'none'}.`,
    '',
  );

  out.push('### 5.1 The model, as the code has it', '');
  out.push('One compartment, with first-order absorption and first-order elimination (the Bateman function). For one dose, t hours after it was taken:', '');
  out.push('```', 'B(t) = ka / (ka - ke) x ( e^(-ke x t) - e^(-ka x t) )        B(t) = 0 before the dose', '```', '');
  out.push(
    ...list([
      '**ke** = ln 2 / half-life.',
      '**ka** is not read from a label. It is solved so that B(t) is highest exactly at the time to peak: ln(ka / ke) / (ka - ke) = time to peak.',
      '**All logged doses are added up:** Level(t) = sum of (dose in mg x B(t - time of that dose)).',
      '**The number on screen** is 100 x Level(t) / Peak, rounded to a whole number. Peak is the highest Level in one dosing interval after 20 doses of the *most recently logged dose*, taken exactly on the schedule the person set. So 100 means "the highest point after long-term use of the dose you logged last".',
      '**The chart** covers the last 14 days (solid line) and the next 7 days (dashed line), one point every 3 hours. The dashed part assumes the person keeps taking the same dose on schedule. When the status is not "Increasing dose" or "Maintenance dose", the dashed part has no future doses and only falls.',
      'No factor turns a dose into a concentration (no absorbed fraction, volume or clearance). The result is a relative number only.',
    ]),
  );

  out.push('### 5.2 What the model does with the numbers in section 4', '');
  out.push('These values were worked out by running the code. They are not from a label. They are here so you can judge whether the picture is believable.', '');
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
  const sameNumbers = columns.filter((c) => c.names.length > 1 && new Set(meds.filter((g) => g.brands.some((b) => c.names.includes(b))).map((g) => g.entry.id)).size > 1);
  const assumptions = [
    'Everyone is treated as the same average person. Body weight, kidney function, age, injection site and other medications change nothing.',
    'One compartment only. Absorption and elimination are both first-order.',
    'The time to peak is one number. The absorption rate is solved from it and is not checked against anything else.',
    'Doses add up in a straight line: twice the dose gives twice the level.',
    'There is no absorbed fraction, volume or clearance in the model, so there is no concentration. Only a relative number is shown.',
    'The scale changes with the dose: 100 is always the long-term peak of the dose logged last (see the example in 5.2). Numbers from before and after a dose change cannot be compared.',
    'The long-term peak is worked out for 20 doses taken exactly on the schedule the person set, sampled every half hour.',
    'Only doses logged in mg are used. Doses logged in units, mL or clicks are left out and never converted.',
    `When a person says at setup that they have been on their current dose for several weeks, the chart assumes earlier doses of the same amount on schedule${history ? ` (one for each of those weeks, ${history[1]} at most)` : ''}. They are used only for the chart and are not saved as records.`,
    'A dose that was taken but not logged is missing from the chart. A dose logged at the wrong time is used as logged.',
    `Medications without a half-life and time to peak in the app get no chart: ${noNumbers.join(', ') || 'none'}.`,
    ...sameNumbers.map((c) => `${c.names.join(' and ')} are separate entries in the app but use the same half-life and time to peak.`),
    'The chart is not used by any other rule. The danger-symptom rules, the dose-increase period and the reminders do not read it.',
  ];
  out.push(...table(['Code', 'Assumption or limit'], assumptions.map((a) => [code('P'), a]), [1, 14]));
  counts.assumptions = assumptions.length;

  out.push('### 5.4 Exact wording on screen', '');
  const sema = CATALOG.find((d) => d.id === 'semaglutide-wl')?.pk;
  const tirz = CATALOG.find((d) => d.id === 'tirzepatide')?.pk;
  const method = screenText('trends.method.body', { semaHalfLife: sema?.halfLifeH ?? '?', semaPeak: sema?.tmaxH ?? '?', tirzHalfLife: tirz?.halfLifeH ?? '?', tirzPeak: tirz?.tmaxH ?? '?' });
  if (/\[\w+\]/.test(method)) problems.push(`The method text ("trends.method.body") has a placeholder this script does not fill: ${method.match(/\[\w+\]/g)?.join(', ') ?? ''}. Update curveSection().`);
  const wordings: [string, string][] = [
    ['Title of the chart', screenText('curve.title')],
    ['Under the small chart on the main screen', screenText('today.curve.note')],
    ['Under the large chart', screenText('trends.curve.note')],
    [`Link under the large chart (${q(screenText('trends.method.link'))}) opens this text`, method],
    ...(LAUNCH.curveNeedsSource ? [['In place of the chart in the first public version, when the numbers of the medication have no label source', screenText('curve.unavailable')] as [string, string]] : []),
    [`On the main screen when the medication has no chart${LAUNCH.curveNeedsSource ? ' (full test version)' : ''}`, screenText('today.noCurve')],
    ['In place of the large chart when there is nothing to draw', screenText('trends.curve.empty')],
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
    from: ['src/core/catalog.ts#a5a5bec8', 'src/core/catalog.ts#c15c246f'],
    ask: 'Every brand name, dose step, highest dose, half-life and time to peak in section 4 is unchecked. Please check each row against the current FDA label and give the label section. The code comment points to label section 12.3 for the half-life and the time to peak.',
  },
  {
    from: ['src/core/catalog.ts#e0f30e29'],
    ask: 'Foundayo (orforglipron) has no dose steps, no highest dose and no numbers for the chart in the app, because nobody has read them from the label yet. Please give them with their label sections, or tell us where the label gives none.',
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
  extra.push(`Please compare the rules in section 2 with the "call your healthcare provider right away" items in the current Medication Guides of the medications in section 4. Which items on the guides have no rule here?`);
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
  const orals = usMedications().filter((g) => g.entry.route === 'oral');
  if (orals.length) {
    const withWait = orals.filter((g) => g.entry.fastingMin).flatMap((g) => g.brands);
    const withoutWait = orals.filter((g) => !g.entry.fastingMin).flatMap((g) => g.brands);
    extra.push(
      `The app shows a wait before eating or drinking after a pill for ${withWait.join(' and ') || 'no medication'}${withoutWait.length ? `, and none for ${withoutWait.join(' and ')}` : ''} (section 4). Is the wording of that line right for each of them, including what it says about water? The countdown on the main screen says only to wait before eating, while the sheet says not to eat or drink. Should the two say the same?`,
    );
  }
  extra.push(`The typing check calls its limit "the usual highest dose" (section 4). Is the highest dose on the label the right limit for this check, and is that the right name for it?`);
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
  const meds: MedicationCounts = { brands: 0, entries: 0, rows: 0, numbers: 0 };
  const curve: CurveCounts = { wordings: 0, assumptions: 0 };
  const numbers: NumberCounts = { numbers: 0, foods: 0, textNumbers: 0 };

  // Sections are built in reading order, because the item codes count up as they go.
  const intro = introSection();
  const section2 = dangerSymptomSection(internals, triage);
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
  const items = triage.rules + triage.triggers + coded('B') + coded('L') + coded('O') + coded('U') + coded('X') + hidden.copingLines + coded('A') + hidden.exercises + coded('M') + coded('P') + coded('S') + coded('N') + coded('F') + questions;
  const launchCurveBrands = usMedications().filter((g) => curveAvailable(g.entry, LAUNCH)).flatMap((g) => g.brands);
  const contents = table(
    ['Section', 'What it holds', 'Size', 'In the first public version'],
    [
      ['1', 'What this is and what we ask of you', '1 page', ''],
      [
        '2',
        'Danger-symptom rules',
        `${plural(triage.rules, 'rule')}, ${plural(triage.cards, 'card text')}, ${plural(triage.triggers, 'trigger pattern')}, ${plural(triage.testPhrases + triage.probes, 'example phrase')}`,
        `${LAUNCH.triageDetailCards ? 'Each rule shows its own card' : silentAtLaunch.length ? `Alerts show one fixed card; ${plural(silentAtLaunch.length, 'rule')} of a mild level ${silentAtLaunch.length === 1 ? 'shows' : 'show'} nothing (2.1)` : 'Alerts show one fixed card (2.1)'}. They come from the symptom buttons (2.2)${typedAtLaunch() ? ' and from typed text (2.3)' : ' only'}`,
      ],
      ['3', 'Coping cards, daily advice, workouts', `${plural(hidden.copingCards, 'coping card')} (${plural(hidden.copingLines, 'line')}), ${plural(hidden.adviceTexts, 'daily advice text')}, ${plural(hidden.routines, 'workout')} (${plural(hidden.exercises, 'exercise')})`, !LAUNCH.copingCards && !LAUNCH.dailyAdvice && !LAUNCH.workouts ? 'Hidden until reviewed' : 'See each part'],
      [
        '4',
        'US medication list',
        `${plural(meds.brands, 'brand')}, ${plural(meds.rows, 'row')}, ${plural(meds.numbers, 'number')} to check`,
        usMedications().some((g) => labelFactsShown(g.entry, LAUNCH))
          ? 'The names are shown. The dose example, the typing check and the wait after a pill are used only for a medication with label-checked numbers'
          : 'The names are shown. No number is used yet: no medication has label-checked numbers, so there is no dose example, no typing check and no wait after a pill',
      ],
      ['5', 'Estimated medication level: method and wording', `${plural(curve.assumptions, 'assumption')}, ${plural(curve.wordings, 'screen text')}`, launchCurveBrands.length ? `Chart shown for ${launchCurveBrands.join(', ')}` : 'No chart yet: no medication has label-checked numbers'],
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
  if (launchCard.title !== 'Contact your doctor right away' || launchCard.body !== 'What you logged can be a sign of a serious problem. Contact your doctor right away. If it is an emergency, call 911.') {
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
    const figures = [words.toLocaleString('en-US'), items, pages, pagesAsWord, triage.rules, hidden.adviceTexts, hidden.exercises, meds.brands, questions].map(String);
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

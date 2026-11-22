/**
 * 危险症状分诊（PRD v2.0 附录 B）。固定规则，不经过 AI，可测试。
 * 原则：宁可多提醒，不可漏掉。文案统一为"可能需要尽快看医生"，不做诊断。
 * 【上线前必须由医生或药师审核】关键词、级别和卡片文案。
 */
import type { Region } from './catalog';
import type { Lang } from './i18n';

export type TriageLevel = 'emergency' | 'act_now' | 'urgent' | 'contact' | 'remind' | 'care' | 'crisis';

export type TriageId =
  | 'crisis'
  | 'pancreatitis'
  | 'chest_or_faint'
  | 'anaphylaxis'
  | 'vision'
  | 'hypoglycemia'
  | 'dehydration'
  | 'gallbladder'
  | 'thyroid'
  | 'pregnancy'
  | 'procedure'
  | 'contraception'
  | 'eating_too_little'
  | 'abdominal_pain_severe';

export interface TriageContext {
  /** 在用胰岛素或磺脲类降糖药。 */
  insulinOrSU: boolean;
  drugId: string | null;
  region: Region;
}

export interface TriageHit {
  id: TriageId;
  level: TriageLevel;
}

const RANK: Record<TriageLevel, number> = {
  crisis: 0,
  emergency: 1,
  act_now: 2,
  urgent: 3,
  contact: 4,
  care: 5,
  remind: 6,
};

export function levelRank(l: TriageLevel): number {
  return RANK[l];
}

const NEG = /[不没沒无無未别別]/;

/** 匹配位置前 3 个字里有否定词（"没有剧痛"），视为否定。 */
function matchesPositive(text: string, re: RegExp): boolean {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 3), m.index);
    if (!NEG.test(before)) return true;
    if (m[0].length === 0) g.lastIndex++;
  }
  return false;
}

const any = (text: string, res: RegExp[]) => res.some((r) => matchesPositive(text, r));

const ABDOMEN = '(上腹|胃|肚子|腹部|腹|心窝|心窩|肚脐|肚臍)';
const SEVERE = '(剧痛|劇痛|绞痛|絞痛|疼得(厉|厲)害|痛得(厉|厲)害|疼死|痛死|受不了|直不起腰|疼得要命|痛得要命|撕裂)';

// ── English matching ─────────────────────────────────────────────────────────
// Same rules as the Chinese patterns above, written for how people type in English.
// The principle is the same: better one reminder too many than one missed.
// PENDING CLINICAL REVIEW: these phrase lists and the English card text further down have not
// been reviewed by a clinician yet.

/** Builds a case-insensitive pattern from a raw template, so the pieces below can be reused. */
const en = (strings: TemplateStringsArray, ...parts: string[]) => new RegExp(String.raw(strings, ...parts), 'i');

/** What follows a negation that says the symptom is still there: "won't go away", "doesn't stop", "not easing". */
const EN_STILL_THERE = String.raw`\s+(?:go(?:ing|ne)?\s+away|stop(?:s|ped|ping)?|eas(?:e|es|ed|ing)|let(?:ting)?\s+up|quit(?:ting)?|subsid(?:e|es|ed|ing)|get(?:ting)?\s+(?:any\s+)?better|improv(?:e|es|ed|ing))\b`;

/**
 * Up to n filler characters between two key words. It never crosses the end of a sentence and
 * never runs over a negation ("constantly nauseous, no vomiting" must not read as "constantly
 * vomiting"). The one negation it does cross is the kind that means the symptom goes on:
 * "stomach pain that won't go away and goes to my back".
 */
const gap = (n: number) => String.raw`(?:(?!\b(?:no|not|never|without)\b(?!${EN_STILL_THERE})|n't(?!${EN_STILL_THERE}))[^.;:!?\n]){0,${String(n)}}?`;

/**
 * Small words that may stand between a negation and what it negates: "don't have any",
 * "not feeling", "no more". The lists are short on purpose. "no, I'm having chest pain" and
 * "I don't think it's chest pain" are not on them, so those still trigger.
 */
const EN_FILL_HAVE = String.raw`(?:(?:have|having|had|has|got|get|getting|been|feel|feeling|felt|experiencing|experienced|any|a|an|the|my|more|really|actually|currently|new|sign|signs|kind|sort|of|in|with) )*`;
const EN_FILL_NO = String.raw`(?:(?:more|new|real|any|longer|sign|signs|kind|sort|history|of|have|having|had|get|getting|feel|feeling) )*`;
const EN_NOT = String.raw`(?:not|never|without|cannot|denies|denied|deny|[a-z]+n't|dont|doesnt|didnt|havent|hasnt|hadnt|isnt|wasnt|arent)`;
const EN_NEGATED = new RegExp(
  // "I don't have any chest pain", "never had chest pain", "not pregnant"
  String.raw`(?:^|[^a-z'])${EN_NOT} ${EN_FILL_HAVE}$` +
    // "no chest pain", "no longer have chest pain"
    String.raw`|(?:^|[^a-z'])(?:no|none|neither|nor) ${EN_FILL_NO}$` +
    // "no fever or chest pain"
    String.raw`|(?:^|[^a-z'])(?:no|without|denies|denied) (?:[a-z'-]+ ){1,3}(?:or|nor) ${EN_FILL_NO}$`,
  'i',
);

/**
 * Words after a negated symptom that turn it back into a complaint the person has now:
 * "never had chest pain like this", "I've never had chest pain this bad", "never fainted before",
 * "no chest pain until tonight", "never had blood sugar this low". Looked for from the match to
 * the end of its sentence.
 */
const EN_STILL_TRUE = new RegExp(
  String.raw`\blike\s+(?:this|that|these)\b` +
    String.raw`|\b(?:this|that|so)\s+(?:bad|badly|severe|strong|intense|painful|much|long|often|low)\b` +
    String.raw`|\b(?:before|until|till|til)\b`,
  'i',
);
/** "I never get chest pain, but today I do", "... but I do now", "Now I do." May be the next sentence. */
const EN_BUT_NOW =
  /\b(?:but|now|today|tonight|this\s+time)\b[^.;!?\n]{0,30}?\b(?:i|it)\s+(?:just\s+|really\s+|sure\s+|now\s+)?(?:do|did|does|have|am|is)(?:\s+(?:it|one|them|some))?(?:\s+(?:now|today|tonight|this\s+time|right\s+now|this\s+(?:morning|afternoon|evening|week)))?\s*(?:$|[.,;!?\n])/i;

/** "wasn't unconscious long", "didn't black out for long": it happened, only not for long. */
const EN_NOT_FOR_LONG = /^\s+(?:for\s+)?(?:very\s+|too\s+|that\s+)?long\b/i;
/** A question that opens with "isn't", "aren't" or "doesn't" asks about the symptom; it does not deny it. */
const EN_ASKS_ABOUT = /^(?:isn'?t|aren'?t|doesn'?t) $/i;
const EN_ONLY_AUX_NOT = /^[a-z]+n'?t $/i;

/**
 * True when the words right before the match negate it. Deliberately narrow: only a negation
 * followed by small filler words counts, so "not feeling well, chest pain" still triggers.
 * And a negation does not count when the rest says the symptom is there now (EN_STILL_TRUE,
 * EN_BUT_NOW, EN_NOT_FOR_LONG) or when it is a question ("isn't chest pain serious?").
 * `alsoTrue` adds markers for one rule.
 */
function negatedEn(text: string, index: number, end: number, alsoTrue?: RegExp): boolean {
  const clause = (text.slice(0, index).split(/[.,;:!?()\n]/).pop() ?? '').replace(/\s+/g, ' ').replace(/^ /, '');
  if (!EN_NEGATED.test(clause)) return false;
  const rest = text.slice(end);
  if (EN_ASKS_ABOUT.test(clause) || (EN_ONLY_AUX_NOT.test(clause) && /^[^.;!?\n]*\?/.test(rest))) return false;
  const sentence = text.slice(index).split(/[.;!?\n]/)[0];
  if (EN_STILL_TRUE.test(sentence) || alsoTrue?.test(sentence) || EN_NOT_FOR_LONG.test(rest)) return false;
  return !EN_BUT_NOW.test(rest.slice(0, 80));
}

function anyEn(text: string, res: RegExp[], alsoTrue?: RegExp): boolean {
  for (const re of res) {
    const g = new RegExp(re.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      if (!negatedEn(text, m.index, m.index + m[0].length, alsoTrue)) return true;
      if (m[0].length === 0) g.lastIndex++;
    }
  }
  return false;
}

const EN_BELLY = String.raw`(?:stomach|abdomen|abdominal|belly|tummy|gut)`;
const EN_SEVERE = String.raw`(?:severe|unbearable|excruciating|terrible|horrible|awful|intense|extreme|really bad|very bad|so bad|worst)`;
const EN_HURT = String.raw`(?:pains?|aches?|aching|hurts?|hurting|cramps?|cramping)`;
const EN_TO_BACK = String.raw`(?:\b(?:to|into|through|toward|towards|in|around|round)\s+(?:my\s+|the\s+)?(?:upper\s+|lower\s+|middle\s+|mid\s+)?back\b(?!\s+(?:yard|seat|room|door|porch|office)\b)|\b(?:and|plus|with|also)\s+(?:now\s+|then\s+|also\s+)?(?:in\s+|to\s+)?(?:my\s+)?(?:upper\s+|lower\s+|middle\s+|mid\s+)?back\b(?!\s+(?:to|from|at|on|home|again|in)\b)|\bback\s+(?:also\s+|too\s+|is\s+)?(?:hurts?|hurting|aches?|aching|pain)\b)`;
/** Lets a pattern run on into the next sentence: "Bad stomach pain. It goes to my back." */
const EN_NEXT_SENTENCE = String.raw`(?:[.;:!?\n]+\s*${gap(40)})?`;
const EN_VOMIT = String.raw`(?:vomit(?:s|ed|ing)?|throw(?:s|ing)?\s+up|threw\s+up|thrown\s+up|puk(?:e|es|ed|ing))`;
const EN_RUNS = String.raw`(?:diarrh(?:o)?ea|the\s+runs|(?:loose|watery)\s+stools?)`;
const EN_LONG_OR_OFTEN = String.raw`(?:\ball\s+(?:day|night|morning|afternoon|evening|week)\b|\bnon-?stop\b|\bconstantly\b|\b(?:won'?t|can'?t|cannot)\s+stop\b|\bover\s+and\s+over\b|\bfor\s+(?:(?:\d+|two|three|four|five|six|seven|a\s+few|several|many)\s+)?days\b|\b(?:24|48|72)\s+hours\b|\bsince\s+(?:yesterday|last\s+night)\b|\b(?:[5-9]|\d{2,}|five|six|seven|eight|nine|ten|several|many|multiple|countless|so\s+many)\s+times\b)`;
const EN_DIZZY = String.raw`(?:\bdizzy\b|\blight-?\s?headed\b|\bblack(?:s|ed)?\s+out\b|\b(?:vision|everything)\s+(?:goes|went|going|gets|got)\s+(?:dark|black|dim)\b|\bsee(?:ing)?\s+(?:black|stars|spots)\b|\b(?:almost|nearly)\s+(?:pass(?:ed)?\s+out|faint(?:ed)?)\b)`;
const EN_RUQ = String.raw`(?:(?:upper\s+right|right\s+upper|top\s+right)\s+(?:(?:side|part|area)\s+of\s+(?:my\s+|the\s+)?)?(?:stomach|abdomen|abdominal|belly|tummy|quadrant)\b|(?:upper\s+right|right\s+upper)\s+side\b(?!\s+of\s+(?:my\s+|the\s+)?(?:arm|leg|thigh|back|chest|neck|head|face|shoulder|hip|knee))|right\s+(?:side\s+)?rib(?:s|\s*cage)?\b|right\s+side\s+(?:just\s+)?(?:under|below|beneath|by|near)\s+(?:my\s+|the\s+)?rib(?:s|\s*cage)?\b|(?:under|below|beneath)\s+(?:my\s+|the\s+)?rib(?:s|\s*cage)?\s+on\s+(?:my\s+|the\s+)?right\b)`;
const EN_ALL_OVER = String.raw`all\s+over\b(?!\s+(?:my|the|one|both|this|that)\s+(?!(?:whole\s+|entire\s+)?body\b))`;
const EN_SORE = String.raw`(?:pains?|aches?|aching|hurts?|hurting|sore|tender(?:ness)?|cramps?|cramping)`;
const EN_CANT_SEE = String.raw`(?:\bblurr\w*|\bcan'?t\s+see\b|\bcannot\s+see\b|\bblind\b)`;
const EN_SEE = String.raw`(?:\bvision\b|\bsight\b|${EN_CANT_SEE})`;
const EN_NOT_EAT = String.raw`(?:\b(?:haven'?t|have\s+not|hasn'?t|didn'?t|did\s+not|barely|hardly|can'?t|cannot|couldn'?t|could\s+not|not|unable\s+to)\s+(?:really\s+|even\s+|been\s+able\s+to\s+|been\s+)?(?:eat|eaten|ate|eating)\b|\b(?:eaten|ate|eating)\s+(?:almost\s+|next\s+to\s+)?nothing\b)`;
const EN_DAYS = String.raw`(?:\bdays\b|\bfor\s+(?:a|\d+|two|three|a\s+few)\s+weeks?\b|\ball\s+week\b)`;

/** No negation check here on purpose: "I don't want to die" still gets the support card. */
const EN_CRISIS =
  /(suicid|kill(?:ing)?\s+myself|end(?:ing)?\s+my\s+(?:own\s+)?life|tak(?:e|ing)\s+my\s+(?:own\s+)?life|want(?:ed)?\s+to\s+die|wanna\s+die|wish\s+i\s+(?:was|were)\s+dead|better\s+off\s+dead|(?:don'?t|do\s+not)\s+want\s+to\s+(?:live|be\s+alive)|no\s+(?:reason|point)\s+(?:to\s+live|in\s+living)|life\s+is(?:n'?t|\s+not)\s+worth\s+living|not\s+worth\s+living|(?:want(?:ed)?\s+to|going\s+to|thinking\s+(?:about|of)|thoughts\s+of|urge\s+to)\s+(?:hurt|harm)(?:ing)?\s+myself|self[-\s]?harm|end\s+it\s+all|(?:don'?t|do\s+not)\s+want\s+to\s+be\s+(?:here|around|alive)\s+any\s?more|(?:want(?:ed)?\s+to|wanna|going\s+to|gonna|thinking\s+(?:about|of)|ready\s+to)\s+end(?:ing)?\s+(?:it|things)\b|can(?:'?t|not)\s+go\s+on(?:\s+(?:like\s+this|any\s?more|living|any\s+longer|much\s+longer))?\s*(?:$|[.,;!?\n]))/i;

/** Low blood sugar signs, in the same order as the Chinese sign list: shaking, sweating, racing heart, confusion. */
const EN_LOW_SUGAR_SIGNS: RegExp[] = [
  en`\b(?:shaky|shaking|shakes|trembl(?:e|es|ing)|tremors?|jittery)\b`,
  en`\bcold\s+sweats?\b|\bclammy\b|\bsweaty\b|\bsweating\b`,
  en`\bpalpitat|\b(?:heart|pulse)\s+(?:is\s+|was\s+)?(?:racing|pounding|fluttering|beating\s+(?:so\s+|really\s+|very\s+)?fast)|\b(?:racing|pounding)\s+heart\b`,
  en`\bconfus|\bdisoriented\b|\bdazed\b`,
];

const EN = {
  pancreatitis: [
    // severe + stomach pain: "severe stomach pain", "really bad bellyache"
    en`\b${EN_SEVERE}\b${gap(20)}\b${EN_BELLY}\s*-?\s*${EN_HURT}`,
    // "terrible pain in my upper abdomen"
    en`\b${EN_SEVERE}\b${gap(12)}\b(?:pains?|aches?|cramps?|cramping)\b${gap(20)}\b(?:in|around|across)\b${gap(15)}\b${EN_BELLY}\b`,
    // "my stomach hurts so bad", "stomach pain is unbearable", "belly is killing me"
    en`\b${EN_BELLY}\b${gap(30)}(?:${EN_HURT}\s+(?:is\s+|are\s+|was\s+|got\s+)?(?:so|really|very|extremely|super)\s+(?:bad|badly|much)\b|\b(?:is|are)\s+killing\s+me\b|\bunbearable\b|\bexcruciating\b|\bcan'?t\s+(?:stand|take|bear)\s+(?:it|this|the\s+pain)\b|\bdoubled\s+over\b|\bcan'?t\s+stand\s+up\s+straight\b|\bworst\s+pain\b)`,
    en`\bdoubled\s+over\b${gap(20)}\b${EN_BELLY}\b`,
    // stomach pain that reaches the back
    en`\b${EN_BELLY}\b${gap(30)}${EN_HURT}${gap(40)}${EN_NEXT_SENTENCE}${EN_TO_BACK}`,
    en`\b${EN_HURT}${gap(20)}\b(?:in|around|across)\b${gap(15)}\b${EN_BELLY}\b${gap(40)}${EN_NEXT_SENTENCE}${EN_TO_BACK}`,
    // "stomach pain, not severe, but it goes to my back": what comes after "but" is what counts
    en`\b${EN_BELLY}\b${gap(30)}${EN_HURT}[^.;:!?\n]{0,40}?\bbut\b${gap(25)}${EN_TO_BACK}`,
    // "my stomach is in so much pain", "so much pain in my belly"
    en`\b${EN_BELLY}\b${gap(30)}\bin\s+(?:so|too)\s+much\s+pain\b`,
    en`\b(?:so|too)\s+much\s+(?:pain|cramping)\b${gap(20)}\b(?:in|around|across)\b${gap(15)}\b${EN_BELLY}\b`,
    // "stabbing pain in my stomach", "sharp stomach pain"
    en`\b(?:stabbing|sharp|shooting|tearing)\s+${EN_BELLY}\s*-?\s*${EN_HURT}`,
    en`\b(?:stabbing|sharp|shooting|tearing)\s+(?:pains?|cramps?|cramping)\s+(?:in|around|across)\s+(?:my\s+|the\s+)?(?:upper\s+|lower\s+)?${EN_BELLY}\b`,
  ],
  chest_or_faint: [
    en`\bchest\s+pains?\b`,
    en`\b(?:pain|ache|pressure|tightness|squeezing|heaviness|heavy\s+feeling)\b${gap(10)}\b(?:in|on|across)\s+(?:my\s+|the\s+)?chest\b`,
    en`\bchest\s+(?:really\s+|still\s+|just\s+|kind\s+of\s+|kinda\s+)?(?:hurts?|is\s+hurting|pressure|tightness|is\s+(?:really\s+|so\s+|very\s+)?tight|feels\s+(?:really\s+|so\s+|very\s+)?(?:tight|heavy))\b`,
    en`\b(?:passed|blacked|did\s+pass|did\s+black)\s+out\b`,
    en`\bfaint(?:ed|ing)\b|\bdid\s+faint\b`,
    en`\blost\s+consciousness\b`,
    en`\bunconscious\b`,
  ],
  anaphylaxis: [
    // One more word may stand before the swelling: "my lips are tingling and swelling".
    en`\b(?:throat|lips?|tongue|face|eyelids?)\b${gap(15)}(?:\b[a-z]+\s+and\s+)?\b(?:swell(?:s|ed|ing)?|swollen|puff(?:ed|ing)\s+up|closing\s+up|is\s+closing)\b`,
    en`\b(?:throat|airway)\b${gap(15)}\bclos(?:ing|ed|es)\b`,
    en`\b(?:swelling|swollen)\b${gap(15)}\b(?:throat|lips?|tongue|face|eyelids?)\b`,
    en`\b(?:can'?t|cannot|can\s+not|couldn'?t|hard\s+to|trouble|difficulty|difficult\s+to|struggling\s+to|unable\s+to)\s+(?:really\s+)?breath\w*\b(?!\s+(?:through|thru|out\s+of)\s+(?:my\s+)?nose)`,
    en`\bshort(?:ness)?\s+of\s+breath\b`,
    en`\bcan'?t\s+catch\s+my\s+breath\b`,
    // a rash over the whole body, not on one body part ("rash all over my thigh" stays quiet)
    en`\b(?:hives|rash|welts)\b${gap(20)}\b(?:${EN_ALL_OVER}|everywhere|whole\s+body|entire\s+body)\b`,
    en`\b(?:${EN_ALL_OVER}|whole\s+body|entire\s+body|covered\s+in)\b${gap(20)}\b(?:hives|rash|welts)\b`,
  ],
  vision: [
    en`\b(?:sudden(?:ly)?|all\s+of\s+a\s+sudden)\b${gap(30)}(?:${EN_SEE}|\bwent\s+(?:dark|black)\b)`,
    en`${EN_SEE}${gap(30)}\b(?:sudden(?:ly)?|all\s+of\s+a\s+sudden)\b`,
    en`\bone\s+eye\b${gap(30)}(?:${EN_SEE}|\bdark\b|\bblack\b|\bfuzzy\b)`,
    // "my right eye is blurry". The word "vision" alone is not enough here ("left eye is itchy, vision ok").
    en`\b(?:left|right)\s+eye\b${gap(30)}(?:${EN_CANT_SEE}|\bdark\b|\bblack\b|\bfuzzy\b)`,
    en`${EN_CANT_SEE}${gap(25)}\b(?:one|left|right)\s+eye\b`,
    en`\b(?:vision\s+loss|loss\s+of\s+(?:my\s+)?(?:vision|sight)|lost\s+(?:my\s+|some\s+)?(?:vision|sight)|losing\s+(?:my\s+)?(?:vision|sight)|(?:went|going|gone)\s+blind)\b`,
    // part of the visual field is missing
    en`\b(?:part|half|piece|some|a\s+section)\s+of\s+(?:my\s+|the\s+)?(?:vision|sight|visual\s+field|view)\b${gap(12)}\b(?:missing|gone|dark|black|blocked|cut\s+off)\b`,
    en`\bblind\s+spot\b|\b(?:dark|black)\s+(?:spot|curtain|shadow|area)\b${gap(12)}\b(?:vision|eye|sight)\b`,
  ],
  hypoglycemia: [
    en`\bhypoglyc`,
    en`\blow\s+blood\s+(?:sugar|glucose)\b`,
    en`\bblood\s+(?:sugar|glucose)\b${gap(15)}\b(?:low|dropped|crash(?:ed|ing)?|tanked|bottomed)\b`,
    en`\b(?:sugar|glucose)\s+(?:is|was|got|went|feels)\s+(?:very\s+|too\s+|really\s+|so\s+|super\s+)?low\b`,
    en`\b(?:sugar|glucose)\s+(?:levels?\s+)?(?:has\s+|have\s+|just\s+|is\s+|was\s+)?(?:dropped|dropping|crash(?:ed|ing)|tanked|plummeted|bottomed\s+out)\b`,
  ],
  dehydration: [
    // keeps happening
    en`\b(?:keep|keeps|kept|can'?t\s+stop|cannot\s+stop|won'?t\s+stop|constant(?:ly)?|non-?stop|over\s+and\s+over|again\s+and\s+again|repeatedly)\b${gap(15)}\b(?:${EN_VOMIT}|${EN_RUNS})`,
    // lasts long or happens many times: "throwing up all day", "threw up 6 times"
    en`\b(?:${EN_VOMIT}|${EN_RUNS})\b${gap(25)}${EN_LONG_OR_OFTEN}`,
    // cannot keep fluids down
    en`\b(?:can'?t|cannot|can\s+not|couldn'?t|unable\s+to|not\s+able\s+to|(?:haven'?t|have\s+not|hasn'?t)\s+been\s+able\s+to)\s+(?:even\s+)?keep\s+(?:any\s?thing|any\s+(?:food|water|fluids?|liquids?)|water|fluids?|liquids?|food|a\s+thing|even\s+water)(?:\s+or\s+\w+)?\s+down\b`,
    en`\bnothing\s+(?:stays|will\s+stay|is\s+staying)\s+down\b`,
    en`\b${EN_VOMIT}\s+(?:up\s+)?(?:even\s+|just\s+|plain\s+)?(?:water|every\s?thing\s+i\s+(?:drink|eat)|whatever\s+i\s+(?:drink|eat))\b`,
    en`\b(?:even\s+(?:water|sips(?:\s+of\s+water)?)|(?:every\s?thing|anything|whatever)\s+i\s+(?:eat|drink|eat\s+or\s+drink|swallow))\b${gap(20)}\b(?:comes?\s+(?:back\s+|right\s+)?up|came\s+(?:back\s+|right\s+)?up|${EN_VOMIT})`,
    // very little urine
    en`\b(?:haven'?t|have\s+not|hasn'?t|didn'?t|did\s+not)\s+(?:really\s+)?(?:peed|pee|urinated|urinate|been\s+able\s+to\s+pee)\b`,
    en`\b(?:no|barely\s+any|hardly\s+any|very\s+little|almost\s+no)\s+(?:pee|urine)\b`,
    en`\b(?:barely|hardly)\s+(?:peeing|pee|peed|urinating|urinate|urinated)\b`,
    en`\b(?:peeing|urinating)\s+(?:very\s+|so\s+)?little\b`,
    en`\bnot\s+(?:peeing|urinating)\s+(?:much|a\s+lot|at\s+all)\b`,
    en`\b(?:peeing|urinating)\s+(?:much\s+|a\s+lot\s+|way\s+)?less\b`,
    en`\bcan'?t\s+(?:pee|urinate)\b`,
    // dizzy or vision going dark on standing up
    en`\b(?:stand(?:s|ing)?\s+up|stood\s+up|get(?:ting)?\s+up|got\s+up|standing)\b${gap(25)}${EN_DIZZY}`,
    en`${EN_DIZZY}${gap(25)}\b(?:when|whenever|every\s+time|each\s+time|if|after|as\s+soon\s+as)\s+i\s+(?:stand|stood|get|got)\b`,
  ],
  gallbladder: [
    en`\bjaundice`,
    en`\byellow(?:ing|ish)?\s+(?:of\s+)?(?:my\s+|the\s+)?(?:skin|eyes?|eyeballs?)\b`,
    en`\b(?:skin|eyes?|whites\s+of\s+(?:my|the)\s+eyes)\s+(?:(?:is|are|has|have|looks?|turned|turning|got|getting|went|going|gone|seems?)\s+){1,2}(?:a\s+bit\s+|a\s+little\s+|kind\s+of\s+|slightly\s+|really\s+|very\s+)?yellow`,
    en`\b${EN_SORE}\b${gap(30)}\b${EN_RUQ}`,
    en`\b${EN_RUQ}${gap(30)}\b${EN_SORE}\b`,
    en`\bright\s+upper\s+(?:abdominal\s+)?pain\b`,
  ],
  thyroid: [
    en`\b(?:lump|bump|swelling|mass|nodule|knot|growth)\b${gap(15)}\b(?:in|on|at|around)\s+(?:my\s+|the\s+)?(?:front\s+of\s+(?:my\s+)?)?neck\b`,
    en`\bneck\s+(?:is\s+|looks\s+|feels\s+)?(?:lump|swelling|swollen|mass|nodule)\b`,
    en`\b(?:trouble|difficulty|difficult|hard\s+time|problems?|hard|can'?t|cannot|unable\s+to)\s+(?:to\s+|with\s+)?swallow`,
    // hoarseness that does not go away
    en`\b(?:hoarse(?:ness)?|raspy|lost\s+my\s+voice)\b${gap(30)}(?:\bfor\s+(?:\d+\s+|a\s+few\s+|several\s+|a\s+couple\s+of\s+|two\s+|three\s+)?(?:weeks|months)\b|\bfor\s+(?:a\s+long\s+time|a\s+while|a\s+month|ages)\b|\b(?:won'?t|doesn'?t|isn'?t|not)\s+(?:go(?:ing)?\s+away|getting\s+better|improving)\b|\bstill\b|\ball\s+the\s+time\b|\bconstantly\b)`,
    en`\b(?:for\s+(?:weeks|months|a\s+long\s+time)|still|always|constantly)\b${gap(25)}\b(?:hoarse|raspy)\b`,
  ],
  pregnancy: [
    en`\bpregnan`,
    en`\bbreast-?\s?feed`,
    en`\blactating\b`,
    en`\bnursing\s+(?:my|the|a|our)\s+(?:baby|son|daughter|newborn|infant|little\s+one)\b`,
    en`\btrying\s+(?:to\s+conceive|for\s+a\s+baby|to\s+have\s+a\s+baby)\b`,
    en`\bttc\b`,
    en`\bconceiv(?:e|ing)\b`,
    en`\bexpecting\s+(?:a\s+baby|twins)\b`,
  ],
  procedure: [
    en`\bsurger(?:y|ies)\b`,
    en`\b(?:an|my|the|for|having|have|need)\s+operation\b`,
    en`\ban(?:a)?esthe(?:sia|tic|siologist)\b`,
    en`\bsedat(?:ion|ed)\b`,
    en`\b(?:endoscop|colonoscop|gastroscop)(?:y|ies)\b`,
  ],
  contraception: [en`\bbirth\s+control\s+pills?\b`, en`\bcontraceptive\s+pills?\b`, en`\boral\s+contracept`, en`\b(?:on|taking|take|started|use|using)\s+the\s+pill\b`],
  eating_too_little: [en`${EN_NOT_EAT}${gap(25)}${EN_DAYS}`, en`${EN_DAYS}${gap(30)}${EN_NOT_EAT}`],
} satisfies Partial<Record<TriageId, RegExp[]>>;

const RULES: { id: TriageId; level: TriageLevel | ((c: TriageContext) => TriageLevel); when?: (c: TriageContext) => boolean; test: (t: string, c: TriageContext) => boolean }[] = [
  {
    id: 'crisis',
    level: 'crisis',
    test: (t) =>
      /(想死|不想活|自杀|自殺|轻生|輕生|结束生命|結束生命|活着没意思|活著沒意思|活着没有意义|活著沒有意義)/.test(t) || EN_CRISIS.test(t),
  },
  {
    id: 'pancreatitis',
    level: 'emergency',
    test: (t) =>
      any(t, [new RegExp(`${ABDOMEN}.{0,6}${SEVERE}`)]) ||
      (new RegExp(ABDOMEN).test(t) && any(t, [/(疼|痛).{0,6}(到|连|連|窜|竄|放射).{0,3}(后背|後背|背)/, /(后背|後背).{0,4}(也|一起|跟着|跟著)?.{0,2}(疼|痛)/])) ||
      anyEn(t, EN.pancreatitis),
  },
  {
    id: 'chest_or_faint',
    level: 'emergency',
    test: (t) =>
      any(t, [/(胸痛|胸口(剧痛|劇痛|疼得|痛得|压着疼|壓著痛|像压|像壓))/, /(晕倒|暈倒|昏过去|昏過去|失去意识|失去意識|昏迷)/]) || anyEn(t, EN.chest_or_faint),
  },
  {
    id: 'anaphylaxis',
    level: 'emergency',
    test: (t) =>
      any(t, [
        /(嘴唇|喉咙|喉嚨|舌头|舌頭|脸|臉|眼皮).{0,4}(肿|腫)/,
        /(喘不上气|喘不上氣|喘不过气|喘不過氣|呼吸困难|呼吸困難|透不过气|透不過氣|上不来气|上不來氣)/,
        /全身.{0,4}(起疹|疹子|风团|風團|荨麻疹|蕁麻疹)/,
      ]) || anyEn(t, EN.anaphylaxis),
  },
  {
    id: 'vision',
    level: 'emergency',
    test: (t) =>
      any(t, [
        /(突然|忽然).{0,6}(看不清|看不见|看不見|模糊|失明|黑了)/,
        /(一只眼|一隻眼|单眼|單眼|左眼|右眼).{0,6}(看不清|看不见|看不見|模糊|失明|发黑|發黑|黑了)/,
        /(视野|視野).{0,4}(缺|黑|少了|挡住|擋住)/,
      ]) || anyEn(t, EN.vision),
  },
  {
    id: 'hypoglycemia',
    level: (c) => (c.insulinOrSU ? 'act_now' : 'urgent'),
    test: (t) => {
      if (/(低血糖|血糖(很|太|特别|特別)?低)/.test(t) || anyEn(t, EN.hypoglycemia)) return true;
      const signs = [/手抖|发抖|發抖/, /冷汗/, /心慌|心悸/, /发懵|發懵|意识模糊|意識模糊|糊涂|糊塗/];
      return signs.filter((r, i) => r.test(t) || anyEn(t, [EN_LOW_SUGAR_SIGNS[i]])).length >= 2;
    },
  },
  {
    id: 'dehydration',
    level: 'urgent',
    test: (t) =>
      any(t, [
        /(一直|不停|不断|不斷|反复|反覆|止不住).{0,3}(吐|拉|呕|嘔|腹泻|腹瀉)/,
        /(吐|拉肚子|拉|腹泻|腹瀉)了?.{0,3}(一整天|整天|一天一夜|好几次|好幾次|[五六七八九十]+次|十几次|十幾次|(\d{2}|[5-9])次)/,
        /(喝水|喝什么|喝什麼|喝点|喝點|吃什么|吃什麼).{0,3}(也|都|就).{0,2}吐/,
        /(一天|整天|一整天|24\s*小[时時]).{0,6}(没|沒).{0,3}(尿|小便)/,
        /(尿很少|尿少|没怎么尿|沒怎麼尿|尿不出)/,
        /(站起来|站起來|起身).{0,6}(眼前发黑|眼前發黑|发晕|發暈|头晕|頭暈)/,
      ]) || anyEn(t, EN.dehydration),
  },
  {
    id: 'gallbladder',
    level: 'urgent',
    test: (t) =>
      any(t, [/(右上腹|右肋|右边肋骨|右邊肋骨).{0,8}(疼|痛)/, /(眼白|皮肤|皮膚).{0,4}(发黄|發黃|变黄|變黃|黄了|黃了)/, /(黄疸|黃疸)/]) || anyEn(t, EN.gallbladder),
  },
  {
    id: 'thyroid',
    level: 'urgent',
    test: (t) =>
      any(t, [/(脖子|颈部|頸部).{0,6}(肿块|腫塊|硬块|硬塊|鼓包|肿了|腫了)/, /(吞咽困难|吞嚥困難|咽不下去|吞不下去)/, /(声音嘶哑|聲音嘶啞|嗓子哑|嗓子啞).{0,8}(一直|好久|几周|幾週|几个星期|幾個星期)/]) ||
      anyEn(t, EN.thyroid),
  },
  {
    id: 'pregnancy',
    level: 'contact',
    // "not pregnant yet", "not pregnant but trying": the card is also for people trying to get pregnant.
    test: (t) => any(t, [/(怀孕|懷孕|备孕|備孕|验孕|驗孕|两道杠|兩道槓|哺乳期|喂奶|餵奶)/]) || anyEn(t, EN.pregnancy, /\byet\b|\b(?:but|though)\s+(?:still\s+)?(?:i'?m\s+|i\s+am\s+|we'?re\s+|we\s+are\s+)?(?:still\s+)?(?:trying|hoping|planning)\b/i),
  },
  {
    id: 'procedure',
    level: 'remind',
    // "have not had surgery yet, it is next week": the procedure is still ahead.
    test: (t) => any(t, [/(手术|手術|全麻|麻醉|胃镜|胃鏡|肠镜|腸鏡|内镜|內鏡)/]) || anyEn(t, EN.procedure, /\byet\b/i),
  },
  {
    id: 'contraception',
    level: 'remind',
    when: (c) => c.drugId === 'tirzepatide',
    test: (t) => any(t, [/(避孕药|避孕藥|口服避孕|短效避孕)/]) || anyEn(t, EN.contraception),
  },
  {
    id: 'eating_too_little',
    level: 'care',
    test: (t) =>
      any(t, [/(好几天|好幾天|几天|幾天|连续|連續|整整).{0,6}(几乎|幾乎|都)?.{0,3}(吃不下|没吃|沒吃|没怎么吃|沒怎麼吃|吃不进|吃不進)/]) || anyEn(t, EN.eating_too_little),
  },
];

export function triageText(text: string, ctx: TriageContext): TriageHit[] {
  // Phones type curly apostrophes ("can’t"); the English patterns expect straight ones.
  const t = text.trim().replace(/[\u2018\u2019\u02BC\uFF07]/g, "'");
  if (!t) return [];
  const hits: TriageHit[] = [];
  for (const r of RULES) {
    if (r.when && !r.when(ctx)) continue;
    if (r.test(t, ctx)) hits.push({ id: r.id, level: typeof r.level === 'function' ? r.level(ctx) : r.level });
  }
  return hits.sort((a, b) => RANK[a.level] - RANK[b.level]);
}

export type SymptomKind =
  | 'nausea'
  | 'vomiting'
  | 'reflux'
  | 'constipation'
  | 'diarrhea'
  | 'no_appetite'
  | 'fatigue'
  | 'dizziness'
  | 'abdominal_pain'
  | 'hair_loss'
  | 'injection_site'
  | 'mood'
  | 'menstrual';

/** 快捷记录的症状打分（0–3）触发的分诊。 */
export function triageSymptom(kind: SymptomKind, grade: number, ctx: TriageContext): TriageHit[] {
  if (grade < 3) return [];
  if (kind === 'vomiting' || kind === 'diarrhea') return [{ id: 'dehydration', level: 'urgent' }];
  if (kind === 'abdominal_pain') return [{ id: 'abdominal_pain_severe', level: 'urgent' }];
  if (kind === 'dizziness' && ctx.insulinOrSU) return [{ id: 'hypoglycemia', level: 'act_now' }];
  return [];
}

/**
 * 急救电话按"人现在在哪"决定，而不是按引导时选的地区（在美国的香港用户要打 911）。
 * 由手机时区推断；推断不出来时用用户选的地区。
 */
export function regionFromTz(tz: string): Region | null {
  if (tz === 'Asia/Shanghai' || tz === 'Asia/Chongqing' || tz === 'Asia/Urumqi' || tz === 'Asia/Harbin') return 'CN';
  if (tz === 'Asia/Taipei') return 'TW';
  if (tz === 'Asia/Hong_Kong' || tz === 'Asia/Macau') return 'HK';
  if (tz === 'Asia/Singapore') return 'SG';
  if (tz === 'Asia/Kuala_Lumpur' || tz === 'Asia/Kuching') return 'MY';
  if (tz.startsWith('America/') || tz.startsWith('US/') || tz === 'Pacific/Honolulu') return 'US';
  return null;
}

export function emergencyRegion(tz: string, chosen: Region): Region {
  return regionFromTz(tz) ?? chosen;
}

/** 急救电话（【待核实】）。 */
export const EMERGENCY_NUMBER: Record<Region, string> = {
  CN: '120',
  HK: '999',
  TW: '119',
  US: '911',
  SG: '995',
  MY: '999',
  OTHER: '当地急救电话',
};

/** The emergency number as text for a sentence. For 'OTHER' there is no number, only a phrase. */
export function emergencyNumber(region: Region, lang: Lang): string {
  return region === 'OTHER' && lang === 'en' ? 'your local emergency number' : EMERGENCY_NUMBER[region];
}

/** The number to put in a "call" link, or null when the region has no single number. */
export function emergencyDial(region: Region): string | null {
  const n = EMERGENCY_NUMBER[region];
  return /^\d+$/.test(n) ? n : null;
}

/** 心理危机热线（【待核实】，上线前逐条拨测）。 */
export const CRISIS_LINE: Record<Region, string> = {
  CN: '12356（全国心理援助热线）',
  HK: '2389 2222（撒玛利亚防止自杀会）',
  TW: '1925（安心专线）',
  US: '988',
  SG: '1767（Samaritans of Singapore）',
  MY: '15999（Talian Kasih）',
  OTHER: '当地心理援助热线',
};

/** English names for the same lines. Not verified yet either: call each one before launch. */
const CRISIS_LINE_EN: Record<Region, string> = {
  CN: '12356 (national mental health support hotline)',
  HK: '2389 2222 (The Samaritan Befrienders Hong Kong)',
  TW: '1925 (suicide prevention hotline)',
  US: '988',
  SG: '1767 (Samaritans of Singapore)',
  MY: '15999 (Talian Kasih)',
  OTHER: 'your local crisis line',
};

export function crisisLine(region: Region, lang: Lang): string {
  return (lang === 'en' ? CRISIS_LINE_EN : CRISIS_LINE)[region];
}

export interface TriageCard {
  title: string;
  body: string;
  /** 卡片上是否显示急救电话。 */
  showEmergency: boolean;
  /** 触发后是否暂停当天的训练和饮食提醒。 */
  pauseCoaching: boolean;
}

type CardFlags = Pick<TriageCard, 'showEmergency' | 'pauseCoaching'>;

/** What each card does besides its text. The same in every language. */
function cardFlags(hit: TriageHit): CardFlags {
  switch (hit.id) {
    case 'crisis':
    case 'pancreatitis':
    case 'abdominal_pain_severe':
    case 'chest_or_faint':
    case 'anaphylaxis':
    case 'vision':
    case 'dehydration':
      return { showEmergency: true, pauseCoaching: true };
    case 'hypoglycemia':
      return { showEmergency: hit.level === 'act_now', pauseCoaching: true };
    case 'gallbladder':
      return { showEmergency: false, pauseCoaching: true };
    case 'thyroid':
    case 'pregnancy':
    case 'procedure':
    case 'contraception':
    case 'eating_too_little':
      return { showEmergency: false, pauseCoaching: false };
  }
}

/** Whether this hit pauses the day's workout and food reminders. Does not depend on language. */
export function pausesCoaching(hit: TriageHit): boolean {
  return cardFlags(hit).pauseCoaching;
}

type CardText = Pick<TriageCard, 'title' | 'body'>;

/** Chinese card text. Do not edit without clinical review; 'hant' uses this text too. */
function cardTextZh(hit: TriageHit, region: Region): CardText {
  const em = EMERGENCY_NUMBER[region];
  switch (hit.id) {
    case 'crisis':
      return { title: '你不是一个人', body: `如果你有伤害自己的想法，请现在就联系能帮你的人：心理援助热线 ${CRISIS_LINE[region]}。有立即的危险，请拨打 ${em}。` };
    case 'pancreatitis':
      return { title: '这种腹痛需要马上看医生', body: `上腹剧烈疼痛、疼到后背（可能伴呕吐）可能和胰腺有关。请马上去急诊，必要时拨打 ${em}。今天的训练和饮食提醒先暂停。` };
    case 'abdominal_pain_severe':
      return { title: '剧烈或持续的腹痛，请尽快看医生', body: `如果疼到后背、伴呕吐，或越来越重，请马上去急诊（${em}）。今天的训练先暂停。` };
    case 'chest_or_faint':
      return { title: '请立即就医', body: `胸痛或晕倒需要马上处理，请拨打 ${em}。` };
    case 'anaphylaxis':
      return { title: '可能是严重过敏', body: `嘴唇或喉咙肿、喘不上气、全身起疹子，请立即拨打 ${em}。` };
    case 'vision':
      return { title: '视力突然变化，请马上就医', body: `一只眼突然看不清或视野缺了一块，请马上去眼科或急诊（${em}），并告诉医生你在用 GLP-1 类药物。` };
    case 'hypoglycemia':
      return hit.level === 'act_now'
        ? { title: '可能是低血糖，先处理', body: `先吃 15 克糖（比如半杯果汁或 3–4 块方糖），15 分钟后不缓解或更糟，请就医（${em}），并联系你的医生。` }
        : { title: '这些症状建议问问医生', body: '手抖、出冷汗、心慌同时出现，可能和血糖有关。如果反复出现，请尽快看医生。' };
    case 'dehydration':
      return { title: '小心脱水', body: `一直吐或拉、喝水也吐、尿很少、站起来眼前发黑，有脱水和伤肾的风险，请尽快就医。先别勉强喝蛋白饮料，能喝就小口喝水或补液盐。` };
    case 'gallbladder':
      return { title: '请尽快看医生', body: '右上腹疼、发烧、眼白或皮肤发黄，可能和胆囊有关。' };
    case 'thyroid':
      return { title: '请尽快看医生', body: '脖子摸到肿块、吞咽困难或声音嘶哑一直不好，请告诉医生你在用这类药。' };
    case 'pregnancy':
      return { title: '请联系开药的医生', body: '怀孕、备孕或哺乳期间用药需要医生评估（司美格鲁肽说明书要求计划怀孕前至少停药 2 个月）。减重目标已暂停。' };
    case 'procedure':
      return { title: '提前告诉医生', body: '要做手术、全麻、胃镜或肠镜，请提前告诉医生和麻醉医生你在用 GLP-1 类药物。' };
    case 'contraception':
      return { title: '说明书里的一条提醒', body: '替尔泊肽说明书建议：开始用药和每次加量后的 4 周内，口服避孕药之外加用其他避孕方式。' };
    case 'eating_too_little':
      return { title: '吃得太少了，照顾好自己', body: '连续多天几乎吃不下东西，建议和医生或营养师聊聊。减重目标先放一放，先保证喝水和一点蛋白。' };
  }
}

/**
 * English card text: a sentence-by-sentence translation of the Chinese cards above, with the
 * same meaning and the same strength.
 * PENDING CLINICAL REVIEW: this English text has not been reviewed by a clinician yet. Do not
 * add, soften or strengthen a medical statement here without that review.
 */
function cardTextEn(hit: TriageHit, region: Region): CardText {
  const em = emergencyNumber(region, 'en');
  // Where the Chinese card puts the number in brackets after an instruction. A region without
  // one number gets a short instruction there, so the brackets never hold a bare phrase.
  const emAside = emergencyDial(region) === null ? `(call ${em})` : `(${em})`;
  // Same for the crisis line: "crisis line 988", but "your local crisis line" on its own.
  const line = region === 'OTHER' ? crisisLine(region, 'en') : `crisis line ${crisisLine(region, 'en')}`;
  switch (hit.id) {
    case 'crisis':
      return {
        title: 'You are not alone',
        body: `If you are thinking about hurting yourself, please reach out now to someone who can help: ${line}. If you are in immediate danger, call ${em}.`,
      };
    case 'pancreatitis':
      return {
        title: 'This kind of stomach pain needs a doctor right away',
        body: `Severe pain in your upper stomach area, or pain that spreads to your back (possibly with vomiting), may be related to your pancreas. Go to the emergency room right away, and call ${em} if you need to. Today's workout and food tips are paused.`,
      };
    case 'abdominal_pain_severe':
      return {
        title: 'Severe or lasting stomach pain: see a doctor as soon as possible',
        body: `If the pain spreads to your back, comes with vomiting, or keeps getting worse, go to the emergency room right away ${emAside}. Today's workout is paused.`,
      };
    case 'chest_or_faint':
      return { title: 'Get medical help right away', body: `Chest pain or fainting needs care right away. Call ${em}.` };
    case 'anaphylaxis':
      return {
        title: 'This may be a serious allergic reaction',
        body: `If your lips or throat are swelling, you cannot catch your breath, or you have a rash all over your body, call ${em} right away.`,
      };
    case 'vision':
      return {
        title: 'Sudden change in vision: get medical help right away',
        body: `If you suddenly cannot see clearly with one eye, or part of your vision is missing, go to an eye doctor or the emergency room right away ${emAside}, and tell the doctor you take a GLP-1 medication.`,
      };
    case 'hypoglycemia':
      return hit.level === 'act_now'
        ? {
            title: 'This may be low blood sugar. Treat it first',
            body: `First eat 15 grams of sugar (for example, half a cup of juice or 3 to 4 sugar cubes). If you do not feel better after 15 minutes, or you feel worse, get medical help ${emAside} and contact your doctor.`,
          }
        : {
            title: 'It is a good idea to ask your doctor about these symptoms',
            body: 'Shaking, cold sweats and a racing heart at the same time may be related to your blood sugar. If this keeps happening, see a doctor as soon as possible.',
          };
    case 'dehydration':
      return {
        title: 'Watch out for dehydration',
        body: 'Vomiting or diarrhea that does not stop, throwing up even water, passing very little urine, or your vision going dark when you stand up can mean a risk of dehydration and kidney harm. Get medical help as soon as possible. Do not force yourself to drink protein drinks for now. If you can drink, take small sips of water or an oral rehydration drink.',
      };
    case 'gallbladder':
      return {
        title: 'See a doctor as soon as possible',
        body: 'Pain in the upper right part of your stomach area, fever, or yellowing of your skin or the whites of your eyes may be related to your gallbladder.',
      };
    case 'thyroid':
      return {
        title: 'See a doctor as soon as possible',
        body: 'If you feel a lump in your neck, have trouble swallowing, or have a hoarse voice that does not go away, tell your doctor you take this type of medication.',
      };
    case 'pregnancy':
      return {
        title: 'Contact the doctor who prescribed your medication',
        // The label named here is the semaglutide label, whatever medication the user takes, so the sentence says so.
        body: 'If you are pregnant, trying to get pregnant, or breastfeeding, your doctor needs to review your use of this medication (the semaglutide label says to stop semaglutide at least 2 months before a planned pregnancy). Your goal weight has been paused.',
      };
    case 'procedure':
      return {
        title: 'Tell your doctor ahead of time',
        body: 'If you are going to have surgery, general anesthesia, an upper endoscopy or a colonoscopy, tell your doctor and the doctor giving you anesthesia ahead of time that you take a GLP-1 medication.',
      };
    case 'contraception':
      return {
        title: 'A reminder from the label',
        body: 'The tirzepatide label advises: for 4 weeks after you start the medication and after each dose increase, use another form of birth control in addition to birth control pills.',
      };
    case 'eating_too_little':
      return {
        title: 'You are eating too little. Take care of yourself',
        body: 'If you have barely been able to eat for several days in a row, it is a good idea to talk with your doctor or a dietitian. Set your goal weight aside for now. First make sure you drink water and get a little protein.',
      };
  }
}

/**
 * The card for a hit. `region` is where the person is now (see emergencyRegion), because it
 * decides which emergency number the card shows.
 */
export function triageCard(hit: TriageHit, region: Region, lang: Lang): TriageCard {
  const text = lang === 'en' ? cardTextEn(hit, region) : cardTextZh(hit, region);
  return { ...text, ...cardFlags(hit) };
}

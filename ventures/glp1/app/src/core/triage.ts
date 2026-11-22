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
  /**
   * Set when the hit was raised only by a sign the card written for its rule does not name (a
   * sign added from the Medication Guides, a general emergency sign, or a symptom button added
   * with them). Such a hit shows the fixed card also where detail cards are on (alert.ts).
   */
  fixedCard?: true;
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
// Written for how people type in English on a phone. The principle is the same as for the
// Chinese patterns above: better one reminder too many than one missed.
//
// What the English rules look for comes from the FDA Medication Guides (medGuide.ts): the signs
// their "most important information" and serious side effects name. guideCoverage.ts says which
// rule stands for which item, and which rules have no guide behind them.
//
// A rule is raised when the text describes the person's own state, now or recently. A match
// does not count only when the text clearly is not that:
// - it is denied ("no chest pain", "chest pain: no"): negatedEn;
// - it is about someone else, about a time long past, or it describes no symptom the person has
//   (a general question, a fear, a plan, a warning someone gave, a note to ask the doctor about
//   a topic): notOwnNowEn;
// - the person calls it slight, for the few signs where that matters (the `skip` group);
// - "hard to swallow" is said of a pill, or the words are a figure of speech ("breathless with
//   excitement").
// When in doubt, the rule is raised.
// PENDING CLINICAL REVIEW: these phrase lists and the English card text further down have not
// been reviewed by a clinician yet.

/** Builds a case-insensitive pattern from a raw template, so the pieces below can be reused. */
const en = (strings: TemplateStringsArray, ...parts: string[]) => new RegExp(String.raw(strings, ...parts), 'i');

/**
 * Patterns for signs the card written for their rule does not name: signs added from the
 * Medication Guides (any fever, plain hoarseness, a racing heart, blurry vision) and general
 * emergency signs (a stroke, a seizure). A hit raised only by such a pattern carries
 * `fixedCard`, and shows the fixed card also where detail cards are on (alert.ts). Where detail
 * cards are off, every hit shows the fixed card anyway.
 */
const FIXED_CARD = new WeakSet<RegExp>();
const fx = (re: RegExp): RegExp => {
  FIXED_CARD.add(re);
  return re;
};

/**
 * Spellings people really type for the key words, each read as the word that was meant:
 * misspellings ("tounge", "vomitting", "servere") and voice-typing slips ("past out",
 * "chess pain"). Every entry is a written-out spelling. Nothing is guessed from how close two
 * words look, so an ordinary word is never turned into a symptom. English only: no entry can
 * match Chinese text.
 */
const EN_SPELLING: [RegExp, string][] = [
  [/\b(?:passd|pased|past)\s+out\b(?!\s+of\b)/gi, 'passed out'],
  [/\bpassed-out\b/gi, 'passed out'],
  [/\b(?:fanted|fainetd|faintd|feinted)\b/gi, 'fainted'],
  [/\blost\s+(?:my\s+)?conscience\b/gi, 'lost consciousness'],
  [/\b(?:conciousness|consiousness|conciousnes|consciousnes|conscousness)\b/gi, 'consciousness'],
  [/\buncon(?:c|s)ious\b/gi, 'unconscious'],
  [/\bchest(?:pain|pian)(s?)\b/gi, 'chest pain$1'],
  [/\b(?:chess|cheat|chset|chets|chst|cehst)\s+(pains?|pian|hurts?|tightness|pressure)\b/gi, 'chest $1'],
  [/\bchest\s+(?:pian|pane|paim)(s?)\b/gi, 'chest pain$1'],
  [/\b(?:chset|chets|cehst)\b/gi, 'chest'],
  [/\bpian\b/gi, 'pain'],
  [/\b(?:tounge|toungue|tonuge|tongu|tung)\b/gi, 'tongue'],
  [/\bswol+en\b/gi, 'swollen'],
  [/\bswel+ing\b/gi, 'swelling'],
  [/\b(?:throte|throath|thoat|troat)\b/gi, 'throat'],
  [/\bbreth(e|ing)?\b/gi, 'breath$1'],
  [/\bvom+it+ing\b/gi, 'vomiting'],
  [/\bvom+it+ed\b/gi, 'vomited'],
  [/\bthrowin\b'?/gi, 'throwing'],
  [/\bpukin\b'?/gi, 'puking'],
  [/\bd[iy]a+h?r+h*o?[ei]+a+h?\b/gi, 'diarrhea'],
  [/\b(?:naseous|nasious|nautious|nauseas|nauscious|nausous|nasueous|nauesous|nauseaous)\b/gi, 'nauseous'],
  [/\b(?:nausia|nasea|nausa|nausua|nausae)\b/gi, 'nausea'],
  [/\b(?:servere|sevre|sevear|seveer|severre|sevier)\b/gi, 'severe'],
  [/\bsever(?=\s+(?:pain|stomach|abdom|abd\b|belly|tummy|nause|vomit|diarr|rash|itch|cramp|head|constip|bloat|heartburn|chest|dizz|allerg|reaction|swell|dehydr))/gi, 'severe'],
  [/\bshakey\b/gi, 'shaky'],
  [/\bbloodsugar(s?)\b/gi, 'blood sugar$1'],
  [/\b(?:vission|visoin|vison)\b/gi, 'vision'],
  [/\bs(?:ui|u|iu)[cs]i?d(e|al)\b/gi, 'suicid$1'],
  [/\bhorse(?=\s+(?:voice|throat)\b)/gi, 'hoarse'],
  [/(\bvoice\s+(?:(?:is|sounds?|got|went|has\s+been|feels|still|so|really|very|all|a\s+little|kinda)\s+){1,3})horse\b/gi, '$1hoarse'],
  [/\b(?:horsness|hoarsness|horseness)\b/gi, 'hoarseness'],
  [/\bhivs\b/gi, 'hives'],
  [/\bpanc?r[ei]at[ia]t[iue]s\b/gi, 'pancreatitis'],
  [/\b(?:siezure|seisure|seizer|seziure)(s?)\b/gi, 'seizure$1'],
  [/\bdizy\b/gi, 'dizzy'],
  [/\bdizz?[iy]ness\b/gi, 'dizziness'],
  [/\b(?:stomac|stumach|stomich|stomack|stomch|stomahc)\b/gi, 'stomach'],
  [/\babdomin\b/gi, 'abdomen'],
];

/** The text with those spellings read as the words that were meant. */
function readSpelling(text: string): string {
  let t = text;
  for (const [re, to] of EN_SPELLING) t = t.replace(re, to);
  return t;
}

/**
 * What follows a negation that says the symptom is still there: "won't go away", "doesn't
 * stop", "not easing", "haven't been able to stop".
 */
const EN_STILL_THERE = String.raw`\s+(?:been\s+able\s+to\s+)?(?:go(?:ing|ne)?\s+away|stop(?:s|ped|ping)?|eas(?:e|es|ed|ing)|let(?:ting)?\s+up|quit(?:ting)?|subsid(?:e|es|ed|ing)|slow(?:s|ed|ing)?\s+down|get(?:ting)?\s+(?:any\s+)?better|improv(?:e|es|ed|ing))\b`;
/** "isn't", "doesn't" and the like, typed without the apostrophe. */
const EN_NT = String.raw`(?:isnt|arent|wasnt|werent|doesnt|dont|didnt|hasnt|havent|hadnt|wont|cant|couldnt|wouldnt|shouldnt|aint)`;

/**
 * Up to n filler characters between two key words. It never crosses the end of a sentence and
 * never runs over a negation ("constantly nauseous, no vomiting" must not read as "constantly
 * vomiting"; "my lips arent swollen" must not read as swollen lips). The one negation it does
 * cross is the kind that means the symptom goes on: "stomach pain that won't go away and goes
 * to my back".
 */
const gap = (n: number) => String.raw`(?:(?!\b(?:no|not|never|without|${EN_NT})\b(?!${EN_STILL_THERE})|n't(?!${EN_STILL_THERE}))[^.;:!?\n]){0,${String(n)}}?`;

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
    // "no chest pain", "no longer have chest pain", "zero chest pain", "ruled out gallstones"
    String.raw`|(?:^|[^a-z'\d.])(?:no|none|neither|nor|zero|0|ruled out|rule out|negative for|free of|free from) ${EN_FILL_NO}$` +
    // "can't say I have any chest pain"
    String.raw`|(?:^|[^a-z'])(?:can'?t|cannot|wouldn'?t) say (?:that )?(?:i |i'?m |it'?s )?${EN_FILL_HAVE}$` +
    // "no fever or chest pain"
    String.raw`|(?:^|[^a-z'])(?:no|without|denies|denied) (?:[a-z'-]+ ){1,3}(?:or|nor) ${EN_FILL_NO}$`,
  'i',
);
/** A "no" written after the symptom, as on a checklist: "chest pain: no", "fever - none", "chest pain free", "was ruled out". Not "chest pain - no relief". */
const EN_NO_AFTER = /^\s*(?:[:=?-]|\u2013|\u2014)\s*(?:no|none|nope|n\/a|negative|0|zero)\b(?!\s+(?:more|longer|better|relief|change|improvement|break|let\s?up)\b)|^[-\s]free\b|^\s+(?:was|were|is|has\s+been|got)\s+ruled\s+out\b/i;

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
 * True when the words right before the match negate it, or a "no" follows it as on a checklist.
 * Deliberately narrow: only a negation followed by small filler words counts, so "not feeling
 * well, chest pain" still triggers. And a negation does not count when the rest says the
 * symptom is there now (EN_STILL_TRUE, EN_BUT_NOW, EN_NOT_FOR_LONG) or when it is a question
 * ("isn't chest pain serious?"). `alsoTrue` adds markers for one rule.
 */
function negatedEn(text: string, index: number, end: number, alsoTrue?: RegExp): boolean {
  const rest = text.slice(end);
  if (EN_NO_AFTER.test(rest)) return true;
  const clause = (text.slice(0, index).split(/[.,;:!?()\n]/).pop() ?? '').replace(/\s+/g, ' ').replace(/^ /, '');
  if (!EN_NEGATED.test(clause)) return false;
  if (EN_ASKS_ABOUT.test(clause) || (EN_ONLY_AUX_NOT.test(clause) && /^[^.;!?\n]*\?/.test(rest))) return false;
  const sentence = text.slice(index).split(/[.;!?\n]/)[0];
  if (EN_STILL_TRUE.test(sentence) || alsoTrue?.test(sentence) || EN_NOT_FOR_LONG.test(rest)) return false;
  return !EN_BUT_NOW.test(rest.slice(0, 80));
}

/** Close family, friends and pets: the people a note is most often about when it is not about the writer. */
const EN_KIN = String.raw`(?:dad|daddy|father|mom|mommy|mum|mother|husband|hubby|wife|spouse|partner|boyfriend|girlfriend|bf|gf|fiance|fiancee|son|daughter|kid|kids|kiddo|child|children|baby|toddler|brother|sister|sibling|aunt|auntie|uncle|cousin|niece|nephew|grandma|grandmother|granny|nana|grandpa|grandfather|granddad|grandson|granddaughter|friend|buddy|bestie|roommate|coworker|co-worker|colleague|boss|neighbor|neighbour|dog|cat|puppy|patient|client|student|classmate|teammate|customer|mother-in-law|father-in-law|parents?|family)`;
/** Family words people write without "my": "mom has chest pain", "hubby's lips are swollen". */
const EN_KIN_BARE = String.raw`(?:dad|daddy|father|mom|mommy|mum|mama|mother|husband|hubby|wife|wifey|sister|sis|brother|daughter|kiddo|grandma|granny|nana|grandpa|granddad|boyfriend|girlfriend|bf|gf|fiance|fiancee|neighbou?r|coworker|roommate|boss|cousin|aunt|auntie|uncle|niece|nephew)`;
/**
 * Someone who is not the writer: "my dad", "my sister's", "mom", "she", "her", "a friend of
 * mine", "a guy", "people". The named group says which kind was found.
 */
const EN_SOMEONE_ELSE = new RegExp(
  String.raw`\b(?<pronoun>he|she)(?:'s|'d)?(?![a-z'])` +
    String.raw`|\b(?:my|our|his|her|their)\s+(?:(?:late|older|younger|elder|little|big|best|old|ex|step|twin|other)[-\s]?){0,2}${EN_KIN}(?:'s|s'|s)?(?![a-z])` +
    String.raw`|\bthey(?:'re|'ve|'d)?(?![a-z'])` +
    String.raw`|\b${EN_KIN_BARE}(?:'s|s)?(?![a-z'])` +
    String.raw`|\b(?<theirs>his|her|their)(?![a-z'])` +
    String.raw`|\b(?:a|this|that|some|one)\s+(?:friend|coworker|co-worker|colleague|neighbor|neighbour|relative|family\s+member|guy|man|woman|lady|girl|boy|person|stranger)(?:\s+of\s+(?:mine|ours))?(?![a-z])` +
    String.raw`|\bthe\s+(?:dog|cat|puppy|kitten|baby|kids?|toddler|wife|husband|hubby|missus)(?:'s|s)?(?![a-z])` +
    String.raw`|\b(?:(?:some|most|many|other)\s+)?(?:people|patients|users|folks)(?![a-z])` +
    String.raw`|\b(?:any|some|every)(?:one|body)(?![a-z])(?!\s+else)`,
  'gi',
);
/** The writer, in the words after someone else was named: "my dad and I both ...", "she says my ...". */
const EN_FIRST_PERSON = /(?:^|[^a-z'])(?:i|i'm|i've|i'd|i'll|im|ive|me|my|mine|myself|we|us)(?![a-z])/i;
/** Verbs after which the symptom is usually the writer's again: "my wife noticed ...", "they found ...". */
const EN_REPORTS = /\b(?:sa(?:id|ys?)|told|tells?|thinks?|thought|notic(?:e|es|ed)|saw|sees?|ask(?:s|ed)?|mention(?:s|ed)?|worr(?:y|ies|ied)|concerned|scared|afraid|diagnosed|found|finds?|checked|tested|measured|suspect(?:s|ed)?|believes?|warn(?:s|ed)?|wants?|wanted|sent|rushed|took|drove|called|gave|made)\b/i;

/** "me and my husband", "I and my kids": the writer is one of them. Looked for right before the other person. */
const EN_ME_AND = /(?:^|[^a-z'])(?:i|me|myself|both\s+of\s+us|we|us)\s+(?:and|&|plus|or)\s+$/i;
/**
 * The words in front of a person when that person is the one the sentence is about: nothing, or
 * only an opening word ("so yesterday my dad ..."), or a word that starts a new statement about
 * them ("I think my son ...", "because my mom ...", "one of my kids ..."). After a verb or a
 * preposition the person is only part of the writer's own story ("was walking my dog and passed
 * out", "had lunch with my sister then the pain started"), and the symptom is the writer's.
 */
const EN_SUBJECT_LEAD = new RegExp(
  String.raw`^\s*(?:(?:and|but|so|then|also|well|ok|okay|yeah|oh|omg|ugh|lol|sadly|apparently|yesterday|today|tonight|last\s+night|this\s+(?:morning|afternoon|evening|week)|earlier|now|just|fyi|update|plus|maybe|both)[,\s]+)*$` +
    String.raw`|\b(?:that|because|cause|cuz|since|when|while|if|after|said|says|say|heard|told\s+me|think|thinks|thought|guess|know|hope|about|(?:one|both|all|each|some|none|two|most)\s+of)\s+$`,
  'i',
);
/** A part of the sentence ends right before the symptom: "... and then", "... and now". */
const EN_AND_THEN = /\s(?:and|then|so|but|now)\s+(?:then\s+|now\s+|also\s+)?$/i;
/** "has a fever and chest pain": the person has both. */
const EN_HAS = /\b(?:has|have|had|having|got|gets|with|complain\w*\s+of|suffers?\s+from|reports?)\b/i;
/** A match that opens with a verb goes on about the same person: "my dad fell and passed out". */
const EN_VERB_FIRST = /^(?:can'?t|cannot|couldn'?t|could|was|were|is|are|has|had|have|kept|keeps?|threw|throw(?:s|ing)?|passed|pass(?:es|ing)?|fainted|got|gets?|vomit\w*|puk\w*|lost|went|collapsed|won'?t|hasn'?t|hadn'?t|didn'?t|doesn'?t|still|feels?|felt|blacked|broke)\b/i;
/** "a guy on the news who was vomiting blood": the words after the person say the symptom is theirs. */
const EN_WHO = /\b(?:who|whose|who's|whos)\b/i;
/** Where one part of a sentence ends and the next begins. */
const EN_CLAUSE_BREAK = /,|\s+(?:and|but|so|then)\s+/i;

/** "pancreatitis runs in my family": the family, named after the symptom. */
const EN_IN_THE_FAMILY = /^\s+(?:runs?|ran)\s+in\s+(?:my|the|our)\s+family\b/i;

/**
 * A time long past: "last year", "years ago", "in 2019", "as a kid". Months and weeks are not.
 * The groups mark what does not count after all: `mine` ("my last fall" is a fall, not a
 * season), `year` (this year and last year by number are not long ago: see longAgo).
 */
const EN_LONG_AGO = new RegExp(
  String.raw`\blast\s+(?:year|summer|winter|spring|autumn|christmas)\b|(?:\b(?<mine>my|a|the|that|another|one|bad|nasty)\s+)?\blast\s+fall\b` +
    String.raw`|\b(?:\d+|a|one|two|three|four|five|six|ten|few|couple(?:\s+of)?|several|many|some)\s+(?:years?|yrs?|decades?)\s+(?:ago|back)\b|\byears\s+ago\b` +
    String.raw`|\b(?:a\s+)?long\s+time\s+ago\b|\bages\s+ago\b|\b(?:back\s+)?in\s+(?<year>(?:19|20)\d\d)\b` +
    String.raw`|\b(?:back\s+)?in\s+(?:college|high\s+school)\b|\bback\s+in\s+(?:school|the\s+day)\b|\bas\s+a\s+(?:kid|child|teen|teenager|baby|toddler)\b` +
    String.raw`|\bwhen\s+i\s+was\s+(?:(?:a|in)\s+)?(?:kid|child|young|younger|little|teen|teenager|college|high\s+school|school|\d{1,2}\b(?!\s*(?:min|mins|minutes?|hours?|hrs?|miles?|mi\b|days?|weeks?|months?|lbs?|pounds?|kg|mg|units?|steps|reps|%|percent)))|\bgrowing\s+up\b`,
  'gi',
);
/** Not a time, but the same thing said another way: "I used to get migraines", "a history of gallstones". */
const EN_USED_TO = /\bused\s+to\s+(?:get|have|be)\b|\bhistory\s+of\b/i;
/** Words that put it in the present after all: "... last year and again today". */
const EN_NOW = /\b(?:now|today|tonight|again|still|currently|lately|recently|yesterday|since|this\s+(?:morning|afternoon|evening|week|time)|last\s+night|earlier|is\s+back|are\s+back|came\s+back|come\s+back|same\s+(?:thing|pain|feeling))\b/i;
/** "healed now", "fine now": the word "now" here says it is over. Taken out before EN_NOW is looked for. */
const EN_OVER_NOW = /\b(?:all\s+)?(?:healed|fine|better|gone|ok|okay|good|resolved|well|recovered|normal|clear|cleared\s+up)\s+now\b|\bnow\s+(?:i'?m\s+|it'?s\s+)?(?:all\s+)?(?:healed|fine|better|ok|okay|good|gone)\b/gi;
/** A verb in the present: "my stomach hurts", "I have", "can't". Used to tell a story of long ago from what is here now. */
const EN_PRESENT = /\b(?:i'?m|i\s+am|i\s+have|i'?ve|is|are|am|can'?t|cannot|won'?t|doesn'?t|don'?t|hurts|keeps?|feels?|has|have|getting|having|feeling)\b/i;
/** A verb in the past: "had", "couldn't", "vomited". */
const EN_PAST = /\b(?:had|was|were|couldn'?t|could\s+not|did|didn'?t|got|went|felt|vomited|puked|threw|fainted|passed|blacked|lost|ended|turned|broke|kept|landed|spent)\b/i;

/** The long-ago times in a piece of text that count, each with where it stands. */
function longAgoTimes(s: string): { words: string; index: number }[] {
  const found: { words: string; index: number }[] = [];
  for (const m of s.matchAll(new RegExp(EN_LONG_AGO.source, 'gi'))) {
    if (m.groups?.mine !== undefined) continue;
    // "in 2026", typed in 2026 or early 2027, is not long ago.
    if (m.groups?.year !== undefined && Number(m.groups.year) >= new Date().getFullYear() - 1) continue;
    found.push({ words: m[0], index: m.index });
  }
  return found;
}
const longAgo = (s: string): boolean => longAgoTimes(s).length > 0 || EN_USED_TO.test(s);

/** Small words that may stand between a question and the symptom it asks about: "the signs of a ...". */
const EN_DET = String.raw`(?:(?:a|an|the|any|some|early|common|possible|typical|first|main|usual|mild|severe|serious)\s+)*`;
/** What may stand before the subject of "can ... cause": "the shot", "my medication", "Ozempic". */
const EN_IT = String.raw`(?:(?:it|they|this|that|these|those|the|my|a)\s+)?(?:[a-z0-9-]+\s+){0,2}?`;
const EN_CAUSE = String.raw`(?:really\s+|actually\s+|ever\s+|also\s+)?(?:causes?|leads?\s+to|triggers?|gives?\s+(?:you|me|people|someone)|results?\s+in|brings?\s+on|makes?\s+(?:you|people|someone))`;
/**
 * The start of a general question, up to the symptom: the person asks what a problem is, what
 * its signs are, whether the medication can cause it, or what to do if it ever comes. Each
 * alternative must reach the symptom, so "what is causing my chest pain" is not one of them.
 * A statement is not a question: "the shot did cause severe stomach pain" and "showing signs
 * of low blood sugar" are not on this list.
 */
const EN_GENERAL_QUESTION = new RegExp(
  '(?:' +
    // "what are the signs of ...", "tell me the symptoms of ...": a question word first, then the signs
    String.raw`\b(?:what|which|how|tell\s+me|list|explain|know|learn|are\s+there|is\s+there|any)\b[^.;!?\n]*?\b(?:signs?|symptoms?|warning\s+signs?|side\s+effects?)\s+(?:and\s+symptoms\s+)?(?:of|for)\s+${EN_DET}(?:having\s+|getting\s+|developing\s+)?` +
    // "symptoms of an allergic reaction to semaglutide?": the same, as a bare heading at the start
    String.raw`|^\s*(?:the\s+)?(?:early\s+|warning\s+|common\s+|first\s+|main\s+)?(?:signs?|symptoms?)\s+(?:and\s+symptoms\s+)?of\s+${EN_DET}` +
    // "the risk of ...", "chances of getting ...", "what causes ..."
    String.raw`|\b(?:risks?|chances?|odds|likelihood|causes?|definition|meaning)\s+(?:of|for)\s+${EN_DET}(?:having\s+|getting\s+|developing\s+)?|\bwhat\s+causes\s+${EN_DET}` +
    // "what is ...", "what's considered ..."
    String.raw`|\bwhat(?:'?s|\s+is|\s+are|\s+was|\s+counts\s+as|\s+qualifies\s+as)\s+(?:considered\s+|called\s+|meant\s+by\s+)?${EN_DET}` +
    // "what blood sugar is too low": the question word right before the symptom
    String.raw`|\b(?:what|which)\s+(?:kind\s+of\s+|type\s+of\s+|level\s+of\s+)?(?:blood\s+)?` +
    // "what does ... feel like"
    String.raw`|\b(?:what|how)\s+(?:does|do|would|will|did)\s+${EN_DET}` +
    // "can Ozempic cause ...", "will the shot give me ...": the helping verb first, as in a question
    String.raw`|(?:^\s*(?:(?:so|and|but|also|ok|okay|hey|hi|hello|doc|doctor|question|quick\s+question)[,:]?\s+)*|[,:]\s*)(?:can|could|does|do|did|will|would|might|may)\s+${EN_IT}${EN_CAUSE}\s+${EN_DET}` +
    // "I wonder if it can cause ...", "is it true that it causes ..."
    String.raw`|\b(?:if|whether|true\s+that)\s+${EN_IT}(?:(?:can|could|does|will|would|might|may)\s+)?${EN_CAUSE}\s+${EN_DET}` +
    // "can you get ... from this", "do people get ..."
    String.raw`|\b(?:can|could|do|does|will|would|might)\s+(?:you|people|i|we|someone|anyone)\s+(?:really\s+|actually\s+|ever\s+|still\s+)?(?:get|develop)\s+${EN_DET}` +
    // "how do I know if ...", "how can you tell ...", "how do I prevent ..."
    String.raw`|\bhow\s+(?:do|would|will|can|should)\s+(?:i|you|we|one)\s+(?:know|tell|recognize|recognise|spot|prevent|avoid)\b[^.;!?\n]*?` +
    // "how to tell stomach flu from ...", "the difference between heartburn and ..."
    String.raw`|\b(?:how\s+to\s+tell|difference\s+between|tell\s+the\s+difference|distinguish|versus|vs\.?)\b[^.;!?\n]*?` +
    // "how common is ...", "how likely is ..."
    String.raw`|\bhow\s+(?:common|likely|rare|often)\s+(?:is|are|does|do|can|will)\b[^.;!?\n]*?` +
    // "what should I do if I get ...", "who do I call if I ever get ..."
    String.raw`|\b(?:if|in\s+case)\s+(?:i|you|someone)\s+(?:ever\s+)?(?:get|gets|develop|develops|start\s+(?:getting|having|to\s+get|to\s+have)|end\s+up\s+with|were\s+to\s+(?:get|have))\s+${EN_DET}` +
    // "I read that ...", "I heard about ...", "reading about ...", "googled ..."
    String.raw`|\bi\s+(?:read|heard|saw|was\s+told|keep\s+(?:reading|hearing|seeing))\s+(?:that|about|somewhere|online|(?:some\s+)?people|an?\s+(?:article|post|video|story))\b[^.;!?\n]*?` +
    String.raw`|\b(?:reading|read\s+up|googl(?:e|ed|ing)|research(?:ed|ing)?|look(?:ed|ing)\s+(?:up|into)|learn(?:ed|ing)\s+about)\b[^.;!?\n]*?` +
    String.raw`|\b(?:read|saw|watched|heard)\s+(?:an?\s+|this\s+|that\s+|some\s+)?(?:article|post|video|story|study|thread|news|tiktok|podcast|documentary)\b[^.;!?\n]*?` +
    // "people on reddit say it causes ...", "someone told me it can cause ..."
    String.raw`|\b(?:sa(?:y|ys|id)|told\s+(?:me|us)|claims?|heard|read|saw)\s+(?:that\s+)?${EN_IT}(?:(?:can|could|does|will|would|might|may)\s+)?${EN_CAUSE}\s+${EN_DET}` +
    // "how to prevent ..."
    String.raw`|\b(?:prevent|preventing|avoid|avoiding)\s+${EN_DET}` +
    String.raw`)$`,
  'i',
);
/** "is chest pain a side effect?", "is dizziness common?": the question word stands before the symptom, the rest after it. */
const EN_IS_IT = new RegExp(String.raw`\b(?:is|are|was|were)\s+${EN_DET}$`, 'i');
const EN_A_SIDE_EFFECT = /^[a-z]*\s*(?:(?:a|an|one\s+of\s+the)\s+)?(?:(?:common|known|possible|normal|rare|listed|expected|typical)\s+)*(?:side\s+effects?|symptoms?|signs?|risks?)\b|^[a-z]*\s+(?:(?:very|that|really|pretty|fairly|so)\s+)?(?:common|rare|expected|typical|usual|listed|known)\b/i;
/**
 * Words that say the person has it themselves, so a question is not a general one after all:
 * "what are the signs of low blood sugar, I'm shaking", "can it cause the chest pain I have now".
 * "My medication" and "this shot" say nothing about a symptom and do not count.
 */
const EN_OWN_MY = String.raw`my(?!\s+(?:medication|medicine|meds?|shot|injection|pill|pen|dose|doctor|dr|pharmacist|nurse|appointment|prescription|insurance|next|biggest|worst|main|only|fear|wife|husband|cousin|mom|dad|sister|brother|friend|kids?|son|daughter|insulin|metformin|glipizide|glimepiride|glyburide|ozempic|wegovy|zepbound|mounjaro|rybelsus|saxenda|foundayo)\b)`;
const EN_OWN_WORDS = String.raw`mine|i'?m|i\s+am|i\s+have|i'?ve|i\s+had|i\s+got|i\s+feel|i\s+felt|i\s+keep|i\s+kept|i\s+just|i\s+was|i\s+woke|i\s+can'?t|i\s+cannot|i\s+think\s+i|i\s+might\s+(?:have|be)|(?:this|these)\s+(?!medication|medicine|meds?\b|drugs?\b|shots?\b|injections?\b|pills?\b|stuff|app\b|causes?\b|leads?\b|gives?\b|makes?\b|triggers?\b|results?\b|brings?\b|is\b|are\b|was\b|happens?\b|means?\b|normal\b)[a-z]+|right\s+now|today|tonight|since|now|currently|lately|again|still|else|yesterday|last\s+night`;
const EN_OWN_STATE = new RegExp(String.raw`\b(?:${EN_OWN_MY}|${EN_OWN_WORDS})\b`, 'i');
/** The same without "my": for the words after the symptom, where "my" may belong to anything ("passing out during my flight"). */
const EN_OWN_SAID = new RegExp(String.raw`\b(?:${EN_OWN_WORDS})\b`, 'i');

/** After a general question, a sentence that says the person has it: "Does this cause chest pain? I have it now." */
const EN_I_HAVE_IT = /\b(?:mine\s+(?:is|are|does|did|has|feels)\b|i\s+(?:have|had|get|got|feel)\s+(?:it|that|this|them|one|some)\b|i\s+think\s+i\s+(?:do|have|am)\b|i\s+do(?:\s+(?:get|have)\b|\s*(?:$|[.,;!?\n]))|having\s+(?:it|that|one|them)\b|(?:it|that)\s+(?:is|'s)\s+happening\b|me\s+too\b)/i;

/**
 * Text that names a symptom the person does not have: a warning someone gave, a thing to watch
 * for, a note to ask the doctor about a topic, or a fear of something that has not happened.
 * Each of these ends where the topic begins; the symptom is looked for in the rest of the
 * sentence. The match still counts when that rest says the person has it (EN_OWN_STATE):
 * "ask about my chest pain", "worried about this rash", "afraid my throat is closing".
 */
const EN_FEAR = String.raw`(?:afraid|scared|terrified|worried|worry(?:ing)?|nervous|anxious|paranoid|concerned|freaked\s+out|fear(?:ful|s)?|dread(?:ing)?)`;
const EN_TOPIC = new RegExp(
  // "the leaflet says to call if you have ...", "label says stop using if ..."
  String.raw`\b(?:leaflet|label|guide|box|insert|pamphlet|handout|paperwork|packet|package|instructions?|website|warning|booklet|printout)\s+(?:says?|said|lists?|listed|mentions?|mentioned|warns?|warned|states?|reads?|talks?\s+about)\b` +
    // "nurse said call if ...", "doctor told me to watch for ..."
    String.raw`|\b(?:sa(?:id|ys)|told\s+(?:me|us)|tells\s+me|advised(?:\s+me)?|instructed\s+me|reminded\s+me)\s+(?:(?:to|i\s+should|that\s+i\s+should|i\s+need\s+to|i\s+have\s+to|just)\s+)*(?:call|stop|go|come\s+in|report|watch|look|monitor|let\s+(?:her|him|them)\s+know|tell\s+(?:her|him|them)|seek|get\s+help|be\s+(?:careful|aware)|keep\s+an\s+eye)\b` +
    // "pharmacist warned me about ...", "pharmacist mentioned ... as a risk", "boxed warning ..."
    String.raw`|\bwarn(?:s|ed|ing)?\s+(?:me\s+|us\s+)?(?:about|of|that)\b|\b(?:box(?:ed)?|black\s+box)\s+warning\b` +
    String.raw`|\b(?:dr|doc|doctor|nurse|pharmacist|provider|pcp|endo|np|pa)\.?\s+(?:[a-z]+\s+)?(?:mention(?:s|ed)|talked\s+about|brought\s+up|discussed|explained|went\s+over)\b` +
    // "I'll watch for ...", "keeping an eye out for ..."
    String.raw`|\b(?:watch(?:ing)?\s+(?:out\s+)?for|look(?:ing)?\s+out\s+for|keep(?:ing)?\s+an\s+eye\s+out\s+for|on\s+the\s+lookout\s+for|monitor(?:ing)?\s+for|be\s+aware\s+of|careful\s+(?:of|about))\b` +
    // "ask dr about ...", "ask if ... is a side effect", "talk to my doctor about ..."
    String.raw`|\bask(?:ing|ed)?\s+(?:(?:the|my|your|a)\s+)?(?:(?:dr|doc|doctor|nurse|pharmacist|provider|pcp|endo|np|pa|him|her|them)\.?\s+)?(?:about|if|whether|what|why|how|when)\b` +
    String.raw`|\b(?:talk|speak|chat|check)\s+(?:to|with)\s+(?:(?:the|my)\s+)?(?:dr|doc|doctor|nurse|pharmacist|provider|pcp)\.?\s+about\b` +
    // "worried about ...", "afraid of ...", "scared I'll ...", "my biggest fear is ..."
    String.raw`|\b${EN_FEAR}\s+(?:(?:of|about|over)\b|that\s+(?:i'?ll|i\s+will|i\s+might|i\s+may|i\s+could|it\s+(?:will|might|could|may))\b|(?:i'?ll|ill|i\s+will|i\s+might|i\s+may|i\s+could|i'?m\s+(?:going\s+to|gonna)|it\s+(?:will|might|could|may)|it'?ll)\b|to\s+(?:get|have|end\s+up)\b)` +
    String.raw`|\bfear\s+(?:is|was)\b`,
  'gi',
);
/**
 * Text about something that has not happened: "what if my throat swells up", "in case of an
 * allergic reaction", "I'll call the doctor if my vision changes". "My" and "I" belong to such
 * a sentence, so they do not make it the person's own state; only words for the present do
 * (EN_HERE_NOW): "what if this chest pain is my heart", "what if I'm having a reaction".
 */
const EN_NOT_YET = new RegExp(
  String.raw`\bwhat\s+if\b|\bwhat\s+(?:would|should|do|will|can|could)\s+(?:i|we|you)\s+do\s+if\b|\bwhat\s+happens\s+if\b|\bwhat\s+to\s+do\s+if\b` +
    String.raw`|\bhow\s+would\s+(?:i|you|we|one)\s+(?:even\s+)?(?:know|tell)\b` +
    // a plan: "will call the doctor if ...", "I would call 911 if ..."
    String.raw`|\b(?:i'?ll|ill|i\s+will|i\s+would|i'?d|we'?ll|will|gonna|going\s+to|plan(?:ning)?\s+to)\s+(?:[a-z]+\s+){0,2}?(?:call|go|stop|tell|ask|message|text|email|report|let|head|contact|see|use|take|grab)\b[^.;!?\n]*?\bif\b` +
    String.raw`|\bin\s+case\s+(?:of|i|my|it)\b|\bjust\s+in\s+case\b` +
    // "I don't want to end up with ..."
    String.raw`|\b(?:don'?t|do\s+not|never)\s+(?:want|wanna)\s+(?:to\s+)?(?:end\s+up\s+with|get|develop|risk|deal\s+with)\b`,
  'gi',
);
/** "if I pass out call my wife", "if my throat swells I'll go to the ER": the "if" before the symptom, the instruction after it. */
const EN_IF_BEFORE = /\bif\s+(?:i|my)\b(?:\s+[a-z']+){0,3}\s*$/i;
const EN_THEN_AFTER = /^[a-z]*(?:\s+up|\s+out)?\s*,?\s*(?:then\s+)?(?:please\s+)?(?:call|tell|take\s+me|give\s+me|get\s+(?:me|my|help)|use\s+(?:my|the)|i'?ll|ill|i\s+will|i\s+would|i'?d)\b/i;
/** Words for the present, in a sentence about something that has not happened. */
const EN_HERE_NOW = /\b(?:right\s+now|now|today|tonight|currently|again|still|since|already|any\s?more|yesterday|last\s+night|this\s+(?:morning|afternoon|evening)|i'?m\s+(?:having|getting|feeling|experiencing)|i\s+am\s+(?:having|getting|feeling)|(?:this|these)\s+(?!medication|medicine|meds?\b|drugs?\b|shots?\b|injections?\b|pills?\b|stuff|app\b|is\b|are\b|was\b|happens?\b|means?\b)[a-z]+|my\s+(?:[a-z]+\s+){1,3}(?:is|are|was|means|could\s+be|might\s+be|may\s+be|doesn'?t|does\s+not|won'?t|isn'?t|keeps?|continues)\b)/i;

const EN_PILL = String.raw`(?:pills?|tablets?|capsules?|vitamins?|supplements?|meds|medication|medicine)`;
/** "hard to swallow this big pill", "these tablets are hard to swallow": about the size of a pill, not about swallowing. */
const EN_PILL_AFTER = new RegExp(String.raw`^[a-z]*\s+(?:(?:this|that|these|those|the|my|a|an|such|any|big|huge|large|giant|whole|bigger|larger|new|daily|morning|chalky|dry)\s+){0,4}${EN_PILL}\b`, 'i');
const EN_PILL_BEFORE = new RegExp(String.raw`\b${EN_PILL}\s+(?:is|are|was|were|seems?|feels?|looks?|gets?|got)\b[^.;!?\n]{0,30}$`, 'i');
/** "hard to swallow pills and food": food or drink is named too, so it is about swallowing after all. */
const EN_FOOD_TOO = /\b(?:and|or|even|plus|also)\s+(?:even\s+|also\s+|now\s+)?(?:my\s+)?(?:food|water|liquids?|drinks?|anything|everything|saliva|spit)\b|\b(?:food|water|liquids?|drinks?)\s+(?:and|or|too|as\s+well)\b|\bso\s+does\s+(?:food|water)\b/i;

/**
 * Words after a match that make it a figure of speech: "heart racing with excitement",
 * "breathless with joy", "almost fainted when I saw the price".
 */
const EN_FIGURE_AFTER =
  /^[a-z]*\s+(?:with|from|in|of)\s+(?:all\s+the\s+|pure\s+|sheer\s+)?(?:excitement|joy|laughter|laughing|happiness|anticipation|delight|pride|relief)\b|^[a-z]*\s+(?:when|after)\s+i\s+(?:saw|heard|read|opened|looked\s+at|got)\s+(?:the|my|that|how\s+much)\s+(?:[a-z]+\s+)?(?:price|bill|cost|total|receipt|invoice|copay|co-pay|charge|weight|scale|number)\b|^[a-z]*\s+(?:at|over|from)\s+(?:the|that|this)\s+(?:price|bill|cost)\b|^[a-z]*\s+(?:i'?m|i\s+am)\s+so\s+excited\b|^[a-z]*\s+in\s+(?:these|this|my)\s+(?:jeans|pants|dress|bra|shirt|shapewear|corset)\b/i;
/** The same, said before the symptom: "laughing so hard I couldn't breathe", "that movie had my heart pounding". */
const EN_FIGURE_BEFORE = /\b(?:laugh(?:ed|ing)|cried|crying)\s+so\s+hard\b[^.;!?\n]{0,15}$|\b(?:movie|show|game|book|ride|roller\s?coaster|trailer|episode)\s+(?:had|has|got|made)\s+my\s+$/i;
/**
 * Hard exercise named as the cause, for the two signs it brings on in anyone: being out of
 * breath and a pounding heart ("out of breath after my run"). Climbing stairs and walking are
 * not on the list.
 */
const EN_EXERTION_AFTER = /^[a-z]*\s+(?:after|from|during|while|on)\s+(?:(?:my|the|a|that|this|some|an?\s+hour\s+of)\s+)?(?:(?:long|hard|morning|evening|quick|tough|intense)\s+)?(?:run|running|jog|jogging|workout|working\s+out|gym|cardio|sprint\w*|hiit|spin\s+class|treadmill|peloton|hike|hiking|leg\s+day|lifting|crossfit|zumba|burpees)\b/i;

/**
 * True when a match is clearly not about the person's own state now: it is about someone else,
 * about a time long past, about a symptom the person does not have (a general question, a
 * warning, a fear, a plan), or about the size of a pill. Deliberately narrow, like negatedEn:
 * anything that is not one of these counts as the person's own.
 */
function notOwnNowEn(text: string, index: number, end: number, questionsCount: boolean): boolean {
  const sentenceStart = Math.max(text.lastIndexOf('.', index - 1), text.lastIndexOf(';', index - 1), text.lastIndexOf('!', index - 1), text.lastIndexOf('?', index - 1), text.lastIndexOf('\n', index - 1)) + 1;
  const before = text.slice(sentenceStart, index);
  const after = text.slice(end).split(/[.;!?\n]/)[0];
  const sentence = before + text.slice(index, end) + after;

  // What the person says right after the sentence: "... I have it now", "mine is".
  const said = text.slice(end + after.length, end + after.length + 80);

  // Someone else. Only within the clause, only when that person is the one the clause is about,
  // and only when nothing after the person points back at the writer.
  // A symptom that names the writer in its own words is the writer's ("husband found me on the floor").
  const clause = EN_FIRST_PERSON.test(text.slice(index, end)) ? '' : (before.split(/[,:()]/).pop() ?? '');
  for (const other of clause.matchAll(new RegExp(EN_SOMEONE_ELSE.source, 'gi'))) {
    const lead = clause.slice(0, other.index);
    const since = clause.slice(other.index + other[0].length);
    // "he" and "she" are always the one the clause is about, and so is "her" right before the
    // symptom ("her throat is closing"). Anyone else must stand where that one stands.
    const about = other.groups?.pronoun !== undefined || (other.groups?.theirs !== undefined && since.trim() === '') || EN_SUBJECT_LEAD.test(lead) || EN_WHO.test(since);
    // "me and my husband both ..." is about the writer too.
    const withMe = EN_ME_AND.test(lead);
    // "my husband cooked dinner and then severe stomach pain": after "and" a symptom named as a
    // thing, with no "has" or "had" before it to tie it to the person, starts a new statement.
    const newStatement = EN_AND_THEN.test(since) && !EN_HAS.test(since) && !EN_VERB_FIRST.test(text.slice(index, end));
    if (about && !withMe && !newStatement && since.length <= 60 && !EN_FIRST_PERSON.test(since) && !EN_REPORTS.test(since) && !EN_I_HAVE_IT.test(said)) return true;
  }

  if (EN_IN_THE_FAMILY.test(after)) return true;

  // Long ago, unless the sentence also says it is here now. The time must stand in the same part
  // of the sentence as the symptom ("had chest pain last year"), or alone right before it
  // ("last year, I had chest pain"): "I had gallstones last year and my stomach hurts" counts.
  // A sentence that opens with the time and goes on in the past, with no verb in the present,
  // is a story of long ago ("back in 2020 I had covid and couldn't breathe").
  const nowSaid = EN_NOW.test(sentence.replace(EN_OVER_NOW, ' '));
  if (!nowSaid) {
    const parts = before.split(EN_CLAUSE_BREAK);
    const ownPart = (parts.pop() ?? '') + text.slice(index, end) + after.split(EN_CLAUSE_BREAK)[0];
    const lead = parts.pop() ?? '';
    const leadTimes = longAgoTimes(lead);
    const leadIsOnlyTheTime = leadTimes.length > 0 && leadTimes.reduce((s, time) => s.replace(time.words, ' '), lead).trim().split(/\s+/).filter(Boolean).length <= 1;
    // The time stands at the very start of the sentence, after one word at most ("so last year ...").
    const opensLongAgo = longAgoTimes(before).some((time) => before.slice(0, time.index).trim().split(/\s+/).filter(Boolean).length <= 1);
    if (longAgo(ownPart) || leadIsOnlyTheTime || (opensLongAgo && EN_PAST.test(ownPart) && !EN_PRESENT.test(ownPart))) return true;
  }

  if (!questionsCount) {
    // A general question, unless the rest of the sentence says the person has it.
    const question = EN_GENERAL_QUESTION.exec(before) ?? (EN_A_SIDE_EFFECT.test(after) ? EN_IS_IT.exec(before) : null);
    if (question && !EN_OWN_STATE.test(sentence) && !EN_I_HAVE_IT.test(said)) return true;

    // A warning, a thing to watch for, a note to ask about a topic, a fear: unless the words after it say the person has it.
    // A frame may end inside the match ("afraid I might faint": the symptom pattern starts at "might").
    const upTo = before + text.slice(index, end);
    let topicEnd = -1;
    for (const m of upTo.matchAll(new RegExp(EN_TOPIC.source, 'gi'))) if (m.index < before.length) topicEnd = Math.min(m.index + m[0].length, before.length);
    if (topicEnd >= 0) {
      // "I'll", "I might" and "if I can't ..." speak of what may come, not of what is.
      const stated = (words: string) => words.replace(/\b(?:i'?ll|ill|i\s+will|i\s+might|i\s+may|i\s+could|i'?m\s+(?:going\s+to|gonna))\b|\bif\s+i(?:'?m|\s+am|\s+have|\s+had|\s+got|\s+get|\s+feel|\s+felt|\s+can'?t|\s+cannot|\s+keep|\s+just|\s+was)\b/gi, ' ');
      // "My" counts up to the end of the symptom ("worried about my chest pain", "about the lump in my neck"), not after it ("passing out during my flight").
      const own = EN_OWN_STATE.test(stated(before.slice(topicEnd) + text.slice(index, end))) || EN_OWN_SAID.test(stated(after));
      if (!/\sbut\s/i.test(before.slice(topicEnd)) && !own && !EN_I_HAVE_IT.test(said)) return true;
    }

    // Something that has not happened: unless the sentence has words for the present.
    let notYet = false;
    for (const m of upTo.matchAll(new RegExp(EN_NOT_YET.source, 'gi'))) if (m.index < before.length) notYet = !/\sbut\s/i.test(before.slice(m.index + m[0].length));
    if (!notYet) notYet = EN_IF_BEFORE.test(before) && EN_THEN_AFTER.test(text.slice(end));
    if (notYet && !EN_HERE_NOW.test(sentence) && !EN_I_HAVE_IT.test(said)) return true;
  }

  // The size of a pill.
  if (/swallow/i.test(text.slice(index, end)) && (EN_PILL_AFTER.test(text.slice(end)) || EN_PILL_BEFORE.test(before)) && !EN_FOOD_TOO.test(sentence)) return true;
  // A figure of speech.
  if (EN_FIGURE_AFTER.test(text.slice(end)) || EN_FIGURE_BEFORE.test(before)) return true;
  // Out of breath, or a pounding heart, from hard exercise.
  return /breath|wheez|gasp|winded|heart|pulse/i.test(text.slice(index, end)) && !/pain|hurt|ache/i.test(text.slice(index, end)) && EN_EXERTION_AFTER.test(text.slice(end));
}

/**
 * Whether one of the patterns matches and the match counts, and which card fits it: 'card' when
 * a pattern the rule's own card was written for matched, 'fixed' when only patterns marked with
 * `fx` did. A match does not count when its `skip` group matched (the pattern itself read a
 * word such as "a little" or "hay" in front), when it is negated, or when it is clearly not
 * about the person's own state now.
 *
 * `reminder` is for the rules that are reminders, not danger signs (pregnancy, a procedure
 * ahead, birth control pills, eating very little). A general question counts for them: "can I
 * get pregnant while taking this?" is what the reminder is for.
 */
function anyEn(text: string, res: RegExp[], alsoTrue?: RegExp, reminder = false): false | 'card' | 'fixed' {
  let found: false | 'fixed' = false;
  for (const re of res) {
    const fixed = FIXED_CARD.has(re);
    if (fixed && found) continue;
    const g = new RegExp(re.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      const end = m.index + m[0].length;
      if (m.groups?.skip === undefined && !negatedEn(text, m.index, end, alsoTrue) && !notOwnNowEn(text, m.index, end, reminder)) {
        if (!fixed) return 'card';
        found = 'fixed';
        break;
      }
      if (m[0].length === 0) g.lastIndex++;
    }
  }
  return found;
}

const EN_BELLY = String.raw`(?:stomache?|abdomen|abdominal|belly|tummy|gut|abd|epigastric)`;
const EN_SEVERE = String.raw`(?:severe|severely|unbearable|excruciating|terrible|horrible|awful|intense|extreme|agonizing|horrendous|brutal|really bad|very bad|so bad|super bad|real bad|extremely bad|worst)`;
const EN_HURT = String.raw`(?:pains?|aches?|aching|hurts?|hurting|cramps?|cramping)`;
const EN_TO_BACK = String.raw`(?:\b(?:to|into|through|toward|towards|in|around|round)\s+(?:my\s+|the\s+)?(?:upper\s+|lower\s+|middle\s+|mid\s+)?back\b(?!\s+(?:yard|seat|room|door|porch|office)\b)|\b(?:and|plus|with|also)\s+(?:now\s+|then\s+|also\s+)?(?:in\s+|to\s+)?(?:my\s+)?(?:upper\s+|lower\s+|middle\s+|mid\s+)?back\b(?!\s+(?:to|from|at|on|home|again|in)\b)|\bback\s+(?:also\s+|too\s+|is\s+)?(?:hurts?|hurting|aches?|aching|pain)\b)`;
/** Lets a pattern run on into the next sentence: "Bad stomach pain. It goes to my back." */
const EN_NEXT_SENTENCE = String.raw`(?:[.;:!?\n]+\s*${gap(40)})?`;
const EN_VOMIT = String.raw`(?:vomit(?:s|ed|ing)?|throw(?:s|ing)?\s+up|threw\s+up|thrown\s+up|puk(?:e|es|ed|ing)|barf(?:s|ed|ing)?|hurl(?:s|ed|ing)|retch(?:es|ed|ing)?|dry\s+heav(?:e|es|ed|ing))`;
/** "diarrhea" with the misspellings people type ("diarrea", "diarhea", "diarreah"), and the everyday words for it. */
const EN_RUNS = String.raw`(?:diar+h?o?e+a+h?|the\s+runs|the\s+squirts|(?:loose|watery|liquid)\s+(?:stools?|poops?|bowel\s+movements?)|pooping\s+(?:water|liquid))`;
const EN_NAUSEA = String.raw`(?:naus(?:ea|eous|eated|ious|eus)|nasuea|queas(?:y|iness)|sick\s+to\s+my\s+stomach)`;
/** A count of days or weeks: "3 days", "two weeks", "a few days". */
const EN_N_DAYS = String.raw`(?:(?:(?:x\s?)?\d+|two|three|four|five|six|seven|a\s+few|several|a\s+couple(?:\s+of)?)\s+(?:days|weeks))`;
/** "day 3", "4th day", "third day". */
const EN_DAY_N = String.raw`(?:day\s+(?:\d+|two|three|four|five|six|seven)\b|(?:\d+(?:st|nd|rd|th)|second|third|fourth|fifth|sixth|seventh)\s+day\b)`;
/**
 * "Does not go away", in the ways people type it. The guides' words are "that will not go away"
 * and "that does not go away". One day ("all day") is not on this list.
 */
const EN_WONT_GO_AWAY = String.raw`(?:\b(?:won'?t|will\s+not|doesn'?t|does\s+not|don'?t|do\s+not|didn'?t|isn'?t|is\s+not|hasn'?t|has\s+not|haven'?t|have\s+not|ain'?t|not|never)\s+(?:been\s+able\s+to\s+|seem\s+to\s+)?(?:go(?:ing|ne|es)?\s+away|stop(?:s|ped|ping)?|let(?:ting)?\s+up|eas(?:e|ed|ing)(?:\s+up)?|quit(?:ting)?|end(?:ed|ing)?|slow(?:ed|ing)?\s+down|(?:get(?:ting)?\s+|gotten\s+)?(?:any\s+)?better|improv(?:e|ed|ing))\b|\bstill\s+(?:there|here|going|the\s+same)\b|\b(?:constant(?:ly)?|non-?stop|persistent|never-?ending)\b|\ball\s+the\s+time\b|\bday\s+and\s+night\b|\bevery\s+(?:single\s+)?day\b|\bfor\s+(?:(?:\d+|two|three|four|five|six|seven|a\s+few|several|many|a\s+couple(?:\s+of)?)\s+)?(?:days|weeks)\b|\bfor\s+(?:a|over\s+a|more\s+than\s+a|about\s+a|almost\s+a|the\s+(?:past|last|whole|entire))\s+week\b|\ball\s+week\b|\b(?:\d+|two|three|four|five|six|seven)\s+days\s+(?:straight|in\s+a\s+row|now|running)\b|\bbeen\s+(?:over\s+|almost\s+|about\s+)?(?:\d+|two|three|four|five|six|seven|a\s+few|several)\s+days\b|\bsince\s+(?:last\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day\b|\bsince\s+last\s+week(?:end)?\b)`;
/** Words that call a symptom slight. A pattern reads them into its `skip` group, and the match then does not count. */
const EN_MILD = String.raw`(?:(?:just\s+|only\s+)?(?:a\s+(?:little|tiny|wee)(?:\s+bit)?|(?:tiny|little|wee)\s+bit|a\s+bit|a\s+tad|a\s+touch|slightly|mildly|mild|kind\s+of|kinda|sort\s+of|somewhat|less|not\s+(?:too|very|that|so|really|as))(?:\s+(?:less|more))?)`;
/** The same, said after the symptom: "heart racing a bit". */
const EN_MILD_AFTER = String.raw`(?!\s+(?:a\s+(?:little\s+)?bit|a\s+little|a\s+tad|slightly)\b)`;
/** "less out of breath than before", "not as short of breath": better, not worse. */
const EN_LESS = String.raw`(?:less|not\s+as|not\s+so|no\s+longer)`;
const EN_LONG_OR_OFTEN = String.raw`(?:\ball\s+(?:day|night|morning|afternoon|evening|week|weekend)\b|\bevery\s+(?:hour|half\s+hour|(?:\d+|few|couple(?:\s+of)?)\s+(?:minutes|mins?|hours))\b|\bnon-?stop\b|\bconstantly\b|\b(?:won'?t|can'?t|cannot)\s+stop\b|\bover\s+and\s+over\b|\bfor\s+(?:(?:\d+|two|three|four|five|six|seven|a\s+few|several|many)\s+)?days\b|\b(?:24|48|72)\s+hours\b|\bsince\s+(?:yesterday|last\s+night)\b|\b(?:[5-9]|\d{2,}|five|six|seven|eight|nine|ten|several|many|multiple|countless|so\s+many)\s+times\b)`;
const EN_DIZZY = String.raw`(?:\bdizzy\b|\blight-?\s?headed\b|\bblack(?:s|ed)?\s+out\b|\b(?:vision|everything)\s+(?:goes|went|going|gets|got)\s+(?:dark|black|dim)\b|\bsee(?:ing)?\s+(?:black|stars|spots)\b|\b(?:almost|nearly)\s+(?:pass(?:ed)?\s+out|faint(?:ed)?)\b)`;
const EN_RUQ = String.raw`(?:(?:upper\s+right|right\s+upper|top\s+right)\s+(?:(?:side|part|area)\s+of\s+(?:my\s+|the\s+)?)?(?:stomach|abdomen|abdominal|belly|tummy|quadrant)\b|(?:upper\s+right|right\s+upper)\s+side\b(?!\s+of\s+(?:my\s+|the\s+)?(?:arm|leg|thigh|back|chest|neck|head|face|shoulder|hip|knee))|right\s+(?:side\s+)?rib(?:s|\s*cage)?\b|right\s+side\s+(?:just\s+)?(?:under|below|beneath|by|near)\s+(?:my\s+|the\s+)?rib(?:s|\s*cage)?\b|(?:under|below|beneath)\s+(?:my\s+|the\s+)?rib(?:s|\s*cage)?\s+on\s+(?:my\s+|the\s+)?right\b)`;
const EN_ALL_OVER = String.raw`all\s+over\b(?!\s+(?:my|the|one|both|this|that)\s+(?!(?:whole\s+|entire\s+)?body\b))`;
const EN_SORE = String.raw`(?:pains?|aches?|aching|hurts?|hurting|sore|tender(?:ness)?|cramps?|cramping)`;
const EN_CANT_SEE = String.raw`(?:\bblurr\w*|\bcan'?t\s+see\b|\bcannot\s+see\b|\bblind\b)`;
const EN_SEE = String.raw`(?:\bvision\b|\bsight\b|${EN_CANT_SEE})`;
const EN_NOT_EAT = String.raw`(?:\b(?:haven'?t|have\s+not|hasn'?t|didn'?t|did\s+not|barely|hardly|can'?t|cannot|couldn'?t|could\s+not|not|unable\s+to)\s+(?:really\s+|even\s+|been\s+able\s+to\s+|been\s+)?(?:eat|eaten|ate|eating)\b|\b(?:eaten|ate|eating)\s+(?:almost\s+|next\s+to\s+)?nothing\b)`;
const EN_DAYS = String.raw`(?:\bdays\b|\bfor\s+(?:a|\d+|two|three|a\s+few)\s+weeks?\b|\ball\s+week\b)`;
/** How bad, said after the thing: "is severe", "has been awful", "got really bad", "its getting worse". */
const EN_AUX = String.raw`(?:is|are|was|were|it'?s|has\s+been|have\s+been|been|got|gets|getting|gotten|became|feels?|keeps\s+getting)`;
const EN_VERY = String.raw`(?:(?:so|really|very|pretty|quite|getting|just|still|extremely|super|real)\s+)*`;
const EN_IS_SEVERE = String.raw`(?:${EN_AUX}\s+${EN_VERY}(?:severe|unbearable|excruciating|awful|terrible|horrible|intense|insane|agonizing|brutal|out\s+of\s+control|off\s+the\s+charts|through\s+the\s+roof|the\s+worst)\b|${EN_AUX}\s+(?:(?:getting|just|still)\s+)*(?:so|really|very|extremely|super|real|pretty)\s+bad\b)`;
/** The same for pain, where plain "bad" and "worse" count too: "my stomach pain is bad", "getting worse and worse". */
const EN_IS_BAD = String.raw`(?:${EN_IS_SEVERE}|${EN_AUX}\s+${EN_VERY}(?:bad|worse(?:\s+and\s+worse)?)\b|\bgetting\s+worse\b)`;
/** A place in the belly, or on the chest: "the middle of my", "the left side of my". */
const EN_PART_OF = String.raw`(?:the\s+)?(?:(?:left|right|middle|center|centre|upper|lower|whole)\s+)?(?:(?:side|part)\s+)?(?:of\s+)?(?:my\s+|the\s+)?`;

/** No negation check here on purpose: "I don't want to die" still gets the support card. */
const EN_CRISIS = new RegExp(
  '(' +
    String.raw`suicid|kill(?:ing|ed)?\s+my\s?self|(?:to|gonna|wanna|will|could|should|might)\s+off\s+my\s?self|unalive` +
    String.raw`|end(?:ing)?\s+my\s+(?:own\s+)?life|tak(?:e|ing)\s+my\s+(?:own\s+)?life` +
    String.raw`|want(?:ed)?\s+to\s+die|wanna\s+die|wish\s+i\s+(?:was|were)\s+dead|better\s+off\s+(?:dead|without\s+me)` +
    String.raw`|(?:don'?t|do\s+not)\s+want\s+to\s+(?:live|be\s+alive)` +
    String.raw`|no\s+(?:reason|point)\s+(?:to\s+live|in\s+living)|(?:don'?t|do\s+not|can'?t|cannot)\s+see\s+(?:the|a|any)\s+point\s+(?:in|of|to)\s+(?:living|life|going\s+on|being\s+(?:here|alive))|what'?s\s+the\s+point\s+(?:in|of)\s+(?:living|life|going\s+on)` +
    String.raw`|life\s+is(?:n'?t|\s+not)\s+worth\s+(?:living|it)|not\s+worth\s+living` +
    String.raw`|(?:want(?:ed)?\s+to|going\s+to|thinking\s+(?:about|of)|thoughts\s+of|urge\s+to|tr(?:y|ied|ying)\s+to|attempt(?:ed|ing)?\s+to)\s+(?:hurt|harm|kill)(?:ing)?\s+my\s?self|self[-\s]?harm` +
    String.raw`|cutting\s+my\s?self\b(?!\s+(?:off|some\s+slack|shaving|a\s+(?:slice|piece)))|(?:cut|hurt|harm(?:ed)?|burn(?:ed|t)?)\s+my\s?self\s+(?:on\s+purpose|deliberately|intentionally)|(?:on\s+purpose|deliberately|intentionally)\s+(?:cut|hurt|harmed|burned)\s+my\s?self` +
    String.raw`|pills\s+on\s+purpose|overdos(?:e|ed|ing)\s+on\s+purpose` +
    String.raw`|end(?:ing)?\s+it\s+all` +
    String.raw`|(?:don'?t|do\s+not)\s+(?:want\s+to|wanna)\s+be\s+(?:here|around|alive)\s*(?:any\s?more\b|$|[.,;!?\n])` +
    String.raw`|(?:want(?:ed)?\s+to|wanna|going\s+to|gonna|thinking\s+(?:about|of)|ready\s+to)\s+end(?:ing)?\s+(?:it|things)\b` +
    String.raw`|want\s+to\s+disappear\s+forever` +
    String.raw`|can(?:'?t|not)\s+go\s+on(?:\s+(?:like\s+this|any\s?more|living|any\s+longer|much\s+longer))?\s*(?:$|[.,;!?\n])` +
    ')',
  'i',
);

/**
 * Signs of low blood sugar, in the words of the Medication Guides ("Signs and symptoms of low
 * blood sugar may include:"). The first four groups are the Chinese sign list, in its order:
 * shaking, sweating, racing heart, confusion. The next three are other signs the guides list.
 */
const EN_LOW_SUGAR_SIGNS: RegExp[] = [
  // "shakiness", "feeling jittery". Not a protein shake.
  en`(?:\b(?<skip>protein|milk|meal\s+replacement)\s+)?\b(?:shaky|shaking|shakes|shakiness|trembl(?:e|es|ing)|tremors?|jittery|jitters)\b`,
  // "sweating"
  en`\bcold\s+sweats?\b|\bclammy\b|\bsweaty\b|\bsweating\b|\bdrenched\s+in\s+sweat\b`,
  // "fast heartbeat"
  en`\bpalpitat|\b(?:heart|pulse)\s+(?:is\s+|was\s+)?(?:racing|pounding|fluttering|beating\s+(?:so\s+|really\s+|very\s+)?fast)|\b(?:racing|pounding|fast|rapid)\s+(?:heart|heartbeat|pulse)\b`,
  // "confusion or drowsiness"
  en`\bconfus|\bdisoriented\b|\bdazed\b|\bdrows(?:y|iness)\b|\bcan'?t\s+think\s+straight\b`,
  // "dizziness or light-headedness"
  en`\b(?:dizzy|dizziness|light-?\s?headed(?:ness)?|woozy)\b`,
  // "blurred vision"
  en`\bblurr?(?:y|ed)\s+(?:vision|eyesight|sight)\b|\b(?:vision|eyesight|sight)\s+(?:is\s+|was\s+|got\s+|went\s+|gets\s+)?(?:a\s+(?:little|bit)\s+)?blurr?(?:y|ed)\b|\bseeing\s+double\b`,
  // "slurred speech"
  en`\bslurr(?:ed|ing|y)?\b|\bcan'?t\s+(?:talk|speak)\s+(?:right|properly|straight|clearly)\b`,
];
/**
 * The rest of the guides' list: "weakness", "headache", "hunger", "anxiety, irritability, or mood
 * changes". Many people on these medications have two of these on an ordinary day, so they
 * count only next to one of the signs above ("shaky and hungry"), never by themselves
 * ("hungry with a headache").
 */
const EN_LOW_SUGAR_COMMON: RegExp[] = [
  en`\bweak(?:ness)?\b`,
  en`\bheadaches?\b|\bmigraines?\b|\bhead\s+(?:hurts|is\s+pounding|is\s+killing\s+me|aches)\b`,
  en`\b(?:hungry|hunger|starving|ravenous|famished)\b`,
  en`\banxi(?:ous|ety)\b|\birritab(?:le|ility)\b|\bmood\s+(?:swings?|changes?)\b|\bmoody\b`,
];

const EN = {
  pancreatitis: [
    // severe + stomach pain: "severe stomach pain", "really bad bellyache"
    en`\b${EN_SEVERE}\b${gap(20)}\b${EN_BELLY}\s*-?\s*${EN_HURT}`,
    // "terrible pain in my upper abdomen", "severe pain on the left side of my stomach"
    en`\b${EN_SEVERE}\b${gap(12)}\b(?:pains?|aches?|cramps?|cramping)\b${gap(20)}\b(?:in|around|across|on|at|near)\b${gap(30)}\b${EN_BELLY}\b`,
    // "my stomach hurts so bad", "stomach pain is unbearable", "belly has been killing me"
    en`\b${EN_BELLY}\b${gap(30)}(?:${EN_HURT}\s+(?:is\s+|are\s+|was\s+|got\s+)?(?:so|really|very|extremely|super)\s+(?:bad|badly|much)\b|\b(?:is|are|was|were|has\s+been|have\s+been|been|keeps)\s+killing\s+me\b|\bunbearable\b|\bexcruciating\b|\bcan'?t\s+(?:stand|take|bear)\s+(?:it|this|the\s+pain)\b|\bdoubled\s+over\b|\bcan'?t\s+stand\s+up\s+straight\b|\bworst\s+pain\b)`,
    en`\bdoubled\s+over\b${gap(20)}\b${EN_BELLY}\b`,
    // stomach pain that reaches the back
    en`\b${EN_BELLY}\b${gap(30)}${EN_HURT}${gap(40)}${EN_NEXT_SENTENCE}${EN_TO_BACK}`,
    en`\b${EN_HURT}${gap(20)}\b(?:in|around|across|from)\b${gap(15)}\b${EN_BELLY}\b${gap(40)}${EN_NEXT_SENTENCE}${EN_TO_BACK}`,
    // "stomach pain, not severe, but it goes to my back": what comes after "but" is what counts
    en`\b${EN_BELLY}\b${gap(30)}${EN_HURT}[^.;:!?\n]{0,40}?\bbut\b${gap(25)}${EN_TO_BACK}`,
    // "my stomach is in so much pain", "so much pain in my belly"
    en`\b${EN_BELLY}\b${gap(30)}\bin\s+(?:so|too)\s+much\s+pain\b`,
    en`\b(?:so|too)\s+much\s+(?:pain|cramping)\b${gap(20)}\b(?:in|around|across)\b${gap(15)}\b${EN_BELLY}\b`,
    // "stabbing pain in my stomach", "sharp stomach pain"
    en`\b(?:stabbing|sharp|shooting|tearing)\s+${EN_BELLY}\s*-?\s*${EN_HURT}`,
    en`\b(?:stabbing|sharp|shooting|tearing)\s+(?:pains?|cramps?|cramping)\s+(?:in|around|across)\s+(?:my\s+|the\s+)?(?:upper\s+|lower\s+)?${EN_BELLY}\b`,
    // the illness by name: "I think I have pancreatitis"
    en`\bpancreatitis\b`,
    // how bad, said after the pain: "my stomach pain is severe", "the pain in my stomach is awful"
    en`\b${EN_BELLY}\b${gap(30)}${EN_HURT}${gap(20)}\b${EN_IS_BAD}`,
    en`\b${EN_HURT}${gap(20)}\b(?:in|around|across|on|at)\b${gap(30)}\b${EN_BELLY}\b${gap(15)}\b${EN_IS_BAD}`,
    // a pain score of 8 or more: "stomach pain 9/10", "the pain in my stomach is a 10 out of 10"
    en`\b(?:${EN_BELLY}\b${gap(30)}${EN_HURT}|${EN_HURT}${gap(20)}\b(?:in|around|across|on|at)\b${gap(30)}\b${EN_BELLY}\b)${gap(25)}\b(?:(?:[89]|10)\s*(?:\/|out\s+of)\s*10\b|(?:a|an|like\s+a|like\s+an|at\s+a|at\s+an)\s+(?:[89]|10|eight|nine|ten)\b(?!\s*(?:am|pm|min|minutes|hours|days|mg|%)))`,
    // "stomach has been in knots with severe pain", "abd pain severe", "can't stand the pain in my stomach"
    en`\b${EN_BELLY}\b${gap(30)}\b${EN_SEVERE}\s+(?:pains?|aches?|cramps?|cramping)\b|\b${EN_BELLY}\s*-?\s*${EN_HURT}\s+(?:severe|unbearable|excruciating|terrible|horrible|awful|intense)\b|\bcan'?t\s+(?:stand|take|bear|handle|deal\s+with)\s+(?:the|this)\s+(?:pain|cramps?|cramping)\b${gap(15)}\b(?:in|around)\b${gap(15)}\b${EN_BELLY}\b`,
    // "my stomach hurts bad", "stomach hurts a lot", "belly hurts like hell"
    en`\b${EN_BELLY}\b${gap(20)}\b(?:hurts?|hurting|aches?|aching)\s+(?:(?:so|really|real|very|pretty|super|just)\s+)*(?:bad|badly|a\s+lot|like\s+(?:hell|crazy)|so\s+much|terribly|horribly)\b`,
  ],
  chest_or_faint: [
    en`\bchest\s+pains?\b`,
    // "pressure in my chest", "pain on the left side of my chest"
    en`\b(?:pain|ache|pressure|tightness|squeezing|heaviness|(?:heavy|tight|squeezing)\s+feeling|discomfort)\b${gap(15)}\b(?:in|on|across|around|at)\s+${EN_PART_OF}(?:left\s+|right\s+|upper\s+)?chest\b`,
    // "my chest hurts", "chest has been hurting", "my chest is killing me", "chest feels tight"
    en`\bchest\s+(?:(?:really|still|just|so|very|super|kind\s+of|kinda|has\s+been|have\s+been|been|is|was|keeps|started|starts|began)\s+)*(?:hurts?|hurting|ach(?:es|ing|y)|sore|killing\s+me|pressure|tightness|tight|feels\s+(?:(?:really|so|very|weird\s+and)\s+)*(?:tight|heavy|painful|sore))\b|\btight\s+chest\b`,
    // "passed out", "keep passing out", "about to pass out"; not "passed out flyers"
    en`\b(?:pass(?:ed|ing|es)?|black(?:ed|ing|s)?)\s+out\b(?!\s+(?:(?:the|some|my|our|all\s+the|a\s+few)\s+)?(?:flyers|fliers|candy|papers|samples|invitations|cards|treats|pamphlets|snacks)\b)`,
    // "fainted", "I feel faint", "going to faint"; not "a faint smell", "faint of heart", "fainting goat"
    en`\bfaint(?:ed|ing|s)\b(?!\s+(?:goats?|couch(?:es)?)\b)|\b(?:did|might|may|could|gonna|to|almost|nearly|will|would)\s+faint\b|\b(?:feel(?:s|ing)?|felt|i'?m|i\s+am|i\s+was|i\s+got|i\s+get|getting)\s+(?:so\s+|very\s+|really\s+)?faint\b(?!\s+of\s+heart\b)`,
    en`\blost\s+consciousness\b`,
    en`\bunconscious\b`,
    // "very rapid heartbeat", "heart racing or pounding": the heart or pulse, then a word for fast or hard
    fx(en`\b(?:heart|pulse|heartbeat|heart\s*rate)\b${gap(20)}(?:\b(?<skip>${EN_MILD})\s+)?\b(?:rac(?:ing|es|ed|e)|pound(?:ing|s|ed)|flutter(?:ing|s|ed)|thump(?:ing|s|ed)|hammer(?:ing|s|ed)|skipping\s+beats?|beating\s+(?:so\s+|really\s+|very\s+|too\s+|super\s+|way\s+too\s+)?(?:fast|hard|quick(?:ly)?)|beating\s+out\s+of\s+my\s+chest|(?:so\s+|really\s+|very\s+|too\s+|super\s+|way\s+too\s+)?(?:fast|rapid|elevated)|(?:so\s+|really\s+|very\s+|too\s+|super\s+|way\s+too\s+)high|going\s+(?:crazy|nuts|so\s+fast|a\s+mile\s+a\s+minute)|through\s+the\s+roof)\b${EN_MILD_AFTER}`),
    fx(en`\b(?:racing|pounding|rapid|fast|fluttering|thumping)\s+(?:heart|heartbeat|heart\s*rate|pulse)\b${EN_MILD_AFTER}|\b(?:high|elevated)\s+(?:heart\s*rate|pulse)\b`),
    fx(en`\b(?:heart\s+)?palpitations?\b|\btachycardia\b|\bheart\s+flutters?\b`),
    // fainting, in other words
    en`\beverything\s+went\s+(?:black|dark)\b|\b(?:had|having|have|another)\s+(?:a\s+|another\s+)?black\s?out\b|\bblack\s?out\s+(?:this|last|today|yesterday|again|episode|spell)\b|\bsyncope\b|\b(?:knocked\s+)?out\s+cold\b`,
    // chest pain, in other words
    en`\bchest\s+(?:ache|aches|discomfort)\b|\bheavy\s+chest\b|\bheart\s+(?:really\s+)?(?:hurts|is\s+hurting|aches)\b(?!\s+for\b)|\bpain\b${gap(12)}\b(?:in|around|near|by)\s+(?:my\s+)?heart\b|\b(?:sitting|standing|weight|pressing|pushing)\b${gap(15)}\bon\s+my\s+chest\b`,
    // pain in the left arm or jaw, together with another sign
    fx(en`\b(?:pain|ache|aching|numb(?:ness)?|tingling|pressure)\b${gap(20)}\b(?:left\s+arm|jaw)\b${gap(30)}\b(?:and|with|plus)\b${gap(15)}\b(?:jaw|left\s+arm|sweat\w*|short\w*\s+of\s+breath|nause\w*|dizz\w*|chest)\b`),
    // the emergency by name: a heart attack, a stroke
    fx(en`\bheart\s+attack\b|\b(?:having|had|have|think\s+it'?s|another|a|mini)\s+(?:a\s+|another\s+)?(?:mini[-\s]?)?stroke\b(?!\s+of\b)|\bstroke\s+(?:symptoms?|signs?)\b|\b(?:signs?|symptoms?)\s+of\s+(?:a\s+)?stroke\b`),
    // a seizure
    fx(en`\bseizures?\b|\bseizing\b|\bconvuls(?:ion|ions|ing|ed)\b`),
    // a collapse: "I collapsed", "woke up on the bathroom floor", "don't remember falling"
    fx(en`(?:\b(?<skip>veins?|tent|chair|table|bed|shelf|roof|ceiling|market|plan|deal|lungs?|it|that|which|building|bridge|economy|arch(?:es)?|stock)\s+(?:has\s+|have\s+|had\s+|just\s+|almost\s+|nearly\s+|is\s+|was\s+)?)?\bcollaps(?:ed?|ing)\b(?!\s+(?:veins?|lungs?|on\s+the\s+(?:couch|bed|sofa)|in(?:to)?\s+(?:my\s+)?bed)\b)|\b(?:woke\s+up|came\s+to|found\s+myself|ended\s+up|was\s+found)\s+(?:lying\s+|laying\s+|face\s*down\s+)?on\s+the\s+(?:[a-z]+\s+)?(?:floor|ground)\b|\bfound\s+me\s+(?:passed\s+out\s+|lying\s+|laying\s+|unconscious\s+)?on\s+the\s+(?:[a-z]+\s+)?(?:floor|ground)\b|\bhit\s+the\s+(?:floor|ground)\b|\b(?:don'?t|do\s+not|can'?t|cannot)\s+remember\s+(?:falling|how\s+i\s+(?:fell|got\s+(?:here|there|on\s+the\s+floor)))\b`),
    // signs of a stroke: a drooping face, one side numb or weak, an arm that will not move
    fx(en`\b(?:face|mouth|smile|eyelid)\b${gap(15)}\b(?:droop(?:ing|s|ed|y)?|sagging|lopsided)\b|\bdroop(?:ing|y|ed)?\s+(?:face|mouth|eyelid)\b|\bfacial\s+droop`),
    fx(en`\b(?:numb(?:ness)?|weak(?:ness)?|paraly[sz]ed)\b${gap(25)}\b(?:one|left|right)\s+side\b|\b(?:one|left|right)\s+side\b${gap(25)}\b(?:numb|weak|paraly[sz]ed|limp|went\s+dead)\b|\bcan'?t\s+(?:move|lift|raise|feel)\s+(?:my\s+)?(?:left\s+|right\s+)?(?:arm|leg|hand|side|face)\b`),
    // slurred speech, or sudden confusion
    fx(en`\bslurr(?:ed|ing|y)?\b|\bcan'?t\s+(?:talk|speak)\s+(?:right|properly|straight|clearly)\b|\bcan'?t\s+(?:find|get)\s+my\s+words\b|\b(?:don'?t|do\s+not)\s+know\s+where\s+i\s+am\b|\b(?:sudden(?:ly)?|all\s+of\s+a\s+sudden|out\s+of\s+nowhere)\b${gap(20)}\b(?:confus\w+|disoriented)\b`),
    // "I need an ambulance", "calling 911"
    fx(en`\b(?:need(?:ed)?\s+(?:to\s+call\s+)?|call(?:ed|ing)\s+|dial(?:ed|ing)\s+|should\s+i\s+call\s+)(?:an?\s+|the\s+)?(?:ambulance|911|paramedics|ems)\b`),
  ],
  anaphylaxis: [
    // One more word may stand before the swelling: "my lips are tingling and swelling".
    en`\b(?:throat|lips?|tongue|face|eyelids?)\b${gap(20)}(?:\b[a-z]+\s+and\s+)?\b(?:swell(?:s|ed|ing)?|swollen|puff(?:ed|ing)\s+up|closing\s+up|is\s+closing)\b`,
    en`\b(?:throat|airway)\b${gap(25)}\bclos(?:ing|ed|es)\b`,
    en`\b(?:swelling|swollen)\b${gap(25)}\b(?:throat|lips?|tongue|face|eyelids?)\b`,
    en`\b(?:can'?t|cannot|can\s+not|couldn'?t|could\s+not|can\s+barely|can\s+hardly|could\s+barely|barely|hardly|hard\s+to|trouble|difficulty|difficult\s+to|struggling\s+to|struggle\s+to|unable\s+to|not\s+able\s+to)\s+(?:really\s+)?breath\w*\b(?!\s+(?:through|thru|out\s+of)\s+(?:my\s+)?nose)`,
    en`(?:\b(?<skip>${EN_LESS})\s+)?\bshort(?:ness)?\s+of\s+breath\b`,
    en`\b(?:can'?t|cannot|couldn'?t|could\s+not|trouble|hard\s+to|hard\s+time|difficulty|struggling\s+to)\s+catch(?:ing)?\s+my\s+breath\b`,
    // a rash over the whole body, not on one body part ("rash all over my thigh" stays quiet)
    en`\b(?:hives|rash|welts)\b${gap(20)}\b(?:${EN_ALL_OVER}|everywhere|whole\s+body|entire\s+body)\b`,
    en`\b(?:${EN_ALL_OVER}|whole\s+body|entire\s+body|covered\s+in)\b${gap(20)}\b(?:hives|rash|welts)\b`,
    // "problems breathing", in other words
    en`\b(?:problems?|issues?|hard\s+time|tough\s+time|struggl(?:e|es|ing))\s+(?:with\s+)?(?:my\s+)?breathing\b|\bbreathing\s+(?:problems?|issues?|trouble|difficult(?:y|ies))\b|\bbreathing\s+(?:is|feels|got|has\s+been|was)\s+(?:really\s+|so\s+|very\s+|getting\s+)?(?:hard|harder|difficult|labou?red|tight|shallow|heavy|rough|bad|worse)\b`,
    en`(?:\b(?<skip>${EN_LESS})\s+)?(?:\bwheez(?:e|es|ing|y)\b|\bgasping\b|\bout\s+of\s+breath\b(?!\s+(?:mints?|strips?|spray)\b)|\bbreathless(?:ness)?\b|\bcan'?t\s+(?:get|take)\s+(?:a\s+(?:full\s+|deep\s+|good\s+)?breath|(?:any\s+|enough\s+)?air)\b)`,
    // a tight throat
    en`\bthroat\b${gap(20)}\b(?:tight|tightening|tightness|constrict\w*)\b|\btight(?:ness|ening)?\b${gap(12)}\bthroat\b`,
    // other words for swelling of the face, lips, tongue or throat
    en`\b(?:throat|lips?|tongue|face|eyelids?|mouth)\b${gap(15)}\b(?:puffy|puffed|puffing(?:\s+up)?|ballooned|ballooning|blown\s+up|blew\s+up|blowing\s+up|swole|getting\s+(?:bigger|huge|fat|puffy))\b|\b(?:puffy|swole)\s+(?:throat|lips?|tongue|face|eyelids?|mouth)\b`,
    // "severe rash or itching". The card of this rule names a rash all over the body, so these show the fixed card.
    fx(en`\b(?:severe|bad|terrible|horrible|awful|really\s+bad|nasty|huge|spreading|worst|intense|unbearable|extreme)\s+(?:rash(?:es)?|hives|itch(?:ing|iness)?|welts)\b`),
    fx(en`\b(?:rash(?:es)?|hives|itch(?:ing|iness|y)?|welts)\b${gap(40)}\b(?:severe|unbearable|spreading|getting\s+worse|(?:so|really|very|extremely)\s+bad|out\s+of\s+control|driving\s+me\s+(?:crazy|nuts|insane)|won'?t\s+stop|non-?stop)\b`),
    fx(en`\bitch(?:ing|y|iness|es)?\b${gap(15)}\b(?:${EN_ALL_OVER}|everywhere|whole\s+body|entire\s+body|head\s+to\s+toe)\b|\b(?:${EN_ALL_OVER}|everywhere|whole\s+body|entire\s+body|head\s+to\s+toe)\b${gap(20)}\bitch`),
    fx(en`\bhives\b|\bwelts\b|\b(?:broke|breaking|broken|break)\s+out\s+in\s+(?:a\s+)?(?:bad\s+)?(?:rash|welts)\b`),
    // the reaction by name
    en`\ballergic\s+reaction\b|\banaphyla(?:xis|ctic)\b`,
    // more words for swelling: "my mouth is swelling", "eyes swollen shut", "my lips feel huge"
    en`\bmouth\b${gap(15)}\b(?:swell(?:s|ed|ing)?|swollen)\b|\bswollen\s+shut\b|\b(?:throat|lips?|tongue|face)\b${gap(15)}\b(?:feels?|felt|looks?|is|are|getting|got)\s+(?:so\s+|really\s+|all\s+)?(?:huge|fat|thick|enormous)\b|\b(?:throat|lips?|tongue|face)\b${gap(15)}\btwice\s+(?:the|its|their)\s+(?:normal\s+)?size\b`,
    // more words for trouble breathing
    en`\blabou?red\s+breathing\b|\bsuffocat(?:ing|e|ed)\b|\b(?:hard|tough|difficult)\s+(?:time\s+)?(?:getting|to\s+get)\s+(?:any\s+|enough\s+)?air\b|\b(?:i'?m|i\s+am|feel(?:s|ing)?\s+like\s+(?:i'?m|i\s+am))\s+choking\b|\b(?:get(?:ting)?|got|so|really)\s+winded\b`,
    // itching so bad the person cannot sleep, or all over
    fx(en`\b(?:so|really|extremely|insanely|unbearably)\s+itchy\b[^.;!?\n]{0,30}?\b(?:can'?t\s+(?:sleep|stand\s+it|take\s+it|stop\s+scratching|function)|all\s+over|everywhere)\b`),
  ],
  vision: [
    en`\b(?:sudden(?:ly)?|all\s+of\s+a\s+sudden)\b${gap(30)}(?:${EN_SEE}|\bwent\s+(?:dark|black)\b)`,
    en`${EN_SEE}${gap(30)}\b(?:sudden(?:ly)?|all\s+of\s+a\s+sudden)\b`,
    en`\bone\s+eye\b${gap(30)}(?:${EN_SEE}|\bdark\b|\bblack\b|\bfuzzy\b)`,
    // "my right eye is blurry". The word "vision" alone is not enough here ("left eye is itchy, vision ok").
    en`\b(?:left|right)\s+eye\b${gap(30)}(?:${EN_CANT_SEE}|\bdark\b|\bblack\b|\bfuzzy\b)`,
    en`${EN_CANT_SEE}${gap(25)}\b(?:one|left|right)\s+eye\b`,
    en`\b(?:vision\s+loss|loss\s+of\s+(?:my\s+)?(?:vision|sight|eyesight)|lost\s+(?:(?:part|some|most|half|all)\s+of\s+)?(?:my\s+|some\s+)?(?:vision|sight|eyesight)|losing\s+(?:my\s+)?(?:vision|sight|eyesight)|(?:went|going|gone)\s+blind)\b(?!\s+of\s+(?:my|the|what|why|how|it|that|this)\b)`,
    // part of the visual field is missing
    en`\b(?:part|half|piece|some|a\s+section)\s+of\s+(?:my\s+|the\s+)?(?:vision|sight|visual\s+field|view)\b${gap(12)}\b(?:missing|gone|dark|black|blocked|cut\s+off)\b`,
    en`\bblind\s+spot\b|\b(?:dark|black)\s+(?:spot|curtain|shadow|area)\b${gap(20)}\b(?:vision|eye|sight)\b`,
    // "changes in vision": blurry, double, worse, different
    fx(en`\b(?:blurr?(?:y|ed|ing|iness)|fuzzy|hazy|cloudy|double|foggy)\s+(?:vision|eyesight|sight)\b|\b(?:vision|eyesight|sight)\b${gap(20)}\b(?:blurr?\w*|fuzzy|hazy|cloudy|foggy|doubled?|worse|worsening|changed|changing)\b`),
    fx(en`\b(?:vision|eyesight|sight)\s+(?:is|was|seems|feels|got|gets|looks|has\s+been|went|goes|keeps\s+(?:getting|going))\s+(?:a\s+(?:little|bit)\s+|kind\s+of\s+|kinda\s+|really\s+|so\s+|very\s+|getting\s+)?(?:off|weird|strange|funny|messed\s+up|dim(?:mer)?|dark(?:er)?|spotty|bad|terrible)\b`),
    fx(en`\beyes?\b${gap(15)}\b(?:blurr?\w*|fuzzy|hazy|cloudy)\b|\b(?:blurr?(?:y|ed)|fuzzy|hazy|cloudy)\s+eyes?\b|\beverything\s+(?:looks?|is|seems|went|got)\s+(?:so\s+|really\s+|all\s+)?(?:blurr?\w*|fuzzy|hazy)\b`),
    fx(en`\b(?:changes?|changing|difference|decline)\s+in\s+(?:my\s+)?(?:vision|eyesight|sight)\b|\b(?:vision|eyesight|sight)\s+(?:changes?|problems?|issues?|trouble)\b`),
    fx(en`\bseeing\s+(?:double|spots|floaters|flashes|flashing\s+lights|halos|two\s+of\s+everything)\b(?!\s+on\s+(?:my|the)\b)|\bfloaters\b|\bflashes\s+of\s+light\b|\b(?:trouble|difficulty|hard\s+time|problems?)\s+seeing\b|\bhard\s+to\s+see\b|\bcan'?t\s+see\s+(?:well|clearly|right|straight|properly|out\s+of)\b`),
    // more words for a change in vision: "keeps going in and out", "things look wavy", "I see double", "its all blurry"
    fx(en`\b(?:vision|eyesight|sight)\s+(?:keeps\s+)?(?:going|goes|went|cutting)\s+in\s+and\s+out\b|\b(?:vision|eyesight|sight)\s+comes\s+and\s+goes\b|\b(?:things|everything|lines|words|letters|text)\s+(?:look|looks|looked|are|is|seem|seems|went|got)\s+(?:so\s+|all\s+|really\s+)?(?:wavy|distorted|warped|double)\b|\b(?:see|saw)\s+double\b|\bflashing\s+lights\b|\bcan'?t\s+see\s*(?:$|[.,;!?\n]|anything\b(?!\s+(?:wrong|different|on|in|about|that)\b)|at\s+all\b|right\s+now\b|a\s+thing\b)|(?:^|[.;!?\n]\s*)(?:it'?s\s+|its\s+|things\s+are\s+|everything\s+is\s+)?(?:all\s+|so\s+|really\s+|very\s+)?blurr?y\s*(?:$|[.,;!?\n])`),
  ],
  hypoglycemia: [
    en`\bhypoglyc`,
    en`\blow\s+blood\s+(?:sugar|glucose)\b`,
    en`\bblood\s+(?:sugar|glucose)\b${gap(15)}\b(?:low|dropped|crash(?:ed|ing)?|tanked|bottomed)\b`,
    en`\b(?:sugar|glucose)\s+(?:is|was|got|went|feels)\s+(?:very\s+|too\s+|really\s+|so\s+|super\s+)?low\b(?![-\s]+(?:normal|carb|fat|cal))`,
    en`\b(?:sugar|glucose)\s+(?:levels?\s+)?(?:has\s+|have\s+|just\s+|is\s+|was\s+)?(?:dropped|dropping|crash(?:ed|ing)|tanked|plummeted|bottomed\s+out)\b`,
    // "low sugar", "my sugars are running low", "having a hypo"; not "low sugar yogurt"
    en`\blow\s+(?:glucose|sugars)\b|\b(?:a|my|another|having|had|got)\s+low\s+sugar\b(?!\s+(?:diet|week|day|month|plan|snacks?|foods?|yogurt|cereal|options?|recipes?|drinks?|bars?|meals?|treats?|desserts?|fruits?|version|kind|stuff|ice\s+cream|jam|granola|ketchup|sauce|protein|bread|wine|cookies?|candy|gum|soda|juice|oatmeal|shakes?|smoothies?)\b)`,
    en`\b(?:sugars?|glucose|bg|blood\s+sugars?)\s+(?:is|are|was|were|got|went|feels?|running|runs|ran|reading|keeps?|kept)(?:\s+(?:running|reading|going|getting|dropping|trending))?\s+(?:very\s+|too\s+|really\s+|so\s+|super\s+|way\s+too\s+|pretty\s+)?low\b(?![-\s]+(?:normal|carb|fat|cal))|\b(?:a|having|had|another)\s+hypo\b`,
    // the short ways people with a meter write it: "low bg", "sugars low", "went low last night", "had a bad low"
    en`\blow\s+(?:bg|bgs|bgl|blood\s+sugars)\b|\b(?:sugars?|bg|bgs)\s+low\b(?![-\s]+(?:normal|carb|fat|cal))|\b(?:went|going|dropped|dropping)\s+low\b(?!\s+(?:on|carb|key|and\s+slow)\b)|(?:^|[.;!?\n]\s*)low\s+sugar\s*(?:$|[,.;!?\n]|(?:and|again|today|tonight|this)\b)|\b(?:had|having|have)\s+a\s+(?:bad\s+|scary\s+|another\s+)?low\b(?!\s+(?:point|moment|day|week|mood|bar|opinion|tolerance|carb|energy|grade|score)\b)`,
    // a reading under 70: "blood sugar 48", "glucose was 55", "cgm says 49", "sugar is in the 40s", "meter read LO"
    fx(en`\b(?:blood\s+sugars?|blood\s+glucose|glucose|bg|bgl|bs|cgm|dexcom|libre|meter|my\s+sugars?|sugars?(?=\s+(?:is|was|are|were|at|dropped|went|got|hit|reads?|reading)\b))\b(?:\s+(?:is|was|were|at|of|reads?|reading|says?|said|showed|shows|dropped|went|down|got|to|hit|level|levels|alarming|alarmed|low|lo|currently|now|just|only|about|around|like))*\s+[1-6]\d\b(?!\s*(?:%|g\b|grams?|carbs?|mg\b(?!\/)|units?|lbs?|kg|\.\d|:\d|minutes?|mins?|hours?|hrs?|days?|weeks?|years?|times?|am\b|pm\b|points?))|\b(?:blood\s+sugars?|sugars?|glucose|bg)\b${gap(15)}\bin\s+the\s+[2-6]0'?s\b|\b(?:meter|cgm|dexcom|libre|reading)\s+(?:reads?|says?|said|showed|shows|is|was)\s+(?:lo|low)\b`),
  ],
  dehydration: [
    // keeps happening: "keep throwing up", "have not stopped throwing up", "still vomiting"
    en`\b(?:keep|keeps|kept|can'?t\s+(?:i\s+)?(?:stop|quit)|cannot\s+(?:stop|quit)|won'?t\s+(?:stop|quit)|(?:haven'?t|have\s+not|hasn'?t|has\s+not|not)\s+(?:been\s+able\s+to\s+)?stop(?:ped)?|still|constant(?:ly)?|non-?stop|over\s+and\s+over|again\s+and\s+again|repeatedly)\b${gap(15)}\b(?:${EN_VOMIT}|${EN_RUNS})`,
    // lasts long or happens many times: "throwing up all day", "threw up 6 times"
    en`\b(?:${EN_VOMIT}|${EN_RUNS})\b${gap(25)}${EN_LONG_OR_OFTEN}`,
    // cannot keep fluids down
    en`\b(?:can'?t|cannot|can\s+not|couldn'?t|could\s+not|unable\s+to|not\s+able\s+to|(?:haven'?t|have\s+not|hasn'?t)\s+been\s+able\s+to)\s+(?:even\s+)?(?:keep|hold)\s+(?:(?:(?:even|a|any|my|the|sips?\s+of|bit\s+of|drop\s+of|bite\s+of|little)\s+)*(?:any\s?thing|nothing|water|fluids?|liquids?|food|meds|medication|pills|dinner|lunch|breakfast|thing)(?:\s+or\s+\w+)?\s+down|down\s+(?:any\s?thing|(?:any\s+)?(?:water|fluids?|liquids?|food)))\b`,
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
    // "nausea, vomiting, or diarrhea that does not go away"
    fx(en`\b${EN_NAUSEA}\b${gap(30)}${EN_WONT_GO_AWAY}`),
    fx(en`\b(?:constant(?:ly)?|non-?stop|persistent|never-?ending)\b${gap(12)}\b${EN_NAUSEA}\b`),
    en`\b(?:${EN_VOMIT}|${EN_RUNS})\b${gap(30)}${EN_WONT_GO_AWAY}`,
    // the same three, called severe
    fx(en`\b${EN_SEVERE}\b${gap(12)}\b(?:${EN_NAUSEA}|${EN_VOMIT}|${EN_RUNS})\b`),
    fx(en`\b(?:${EN_NAUSEA}|${EN_VOMIT}|${EN_RUNS})\b${gap(15)}\b(?:is|are|was|got|getting|been)\s+(?:severe|unbearable|awful|terrible|horrible|intense|out\s+of\s+control|(?:so|really|very|extremely|super|real)\s+bad|the\s+worst)\b`),
    // "feeling dizzy", unless the person calls it slight
    fx(en`(?:\b(?<skip>${EN_MILD})\s+)?\b(?:dizzy|dizziness|light-?\s?headed(?:ness)?|woozy|vertigo)\b${EN_MILD_AFTER}|\b(?:room|everything|head)\s+(?:is\s+|was\s+|keeps\s+|started\s+)?spinning\b`),
    // "I'm so dehydrated", or the one word as a note
    en`\b(?:so|very|really|severely|badly|super|extremely|pretty)\s+dehydrated\b|\b(?:i'?m|i\s+am|i\s+think\s+i'?m|feel(?:ing)?|felt|got|getting)\s+dehydrated\b|\bsevere\s+dehydration\b|(?:^|[.;!?\n]\s*)dehydrated\s*(?:$|[.,;!?\n])`,
    // a count of days, without "for": "vomiting 3 days", "day 3 of throwing up", "puking again, 4th day in a row"
    en`\b(?:${EN_VOMIT}|${EN_RUNS})\b${gap(15)}\b${EN_N_DAYS}\b(?!\s+ago\b)|\b(?:${EN_N_DAYS}|a\s+week|${EN_DAY_N})\s+(?:(?:now\s+)?(?:of|with)\s+)(?:the\s+|constant\s+|non-?stop\s+)?(?:${EN_VOMIT}|${EN_RUNS})|\b(?:${EN_VOMIT}|${EN_RUNS})\b(?:(?!\bon\b)[^.;!?\n]){0,20}?\b${EN_DAY_N}(?!\s+(?:of|after|post|since|on)\b)`,
    fx(en`\b${EN_NAUSEA}\b${gap(15)}\b${EN_N_DAYS}\b(?!\s+ago\b)|\b(?:${EN_N_DAYS}|a\s+week|${EN_DAY_N})\s+(?:(?:now\s+)?(?:of|with)\s+)(?:the\s+|constant\s+|non-?stop\s+)?${EN_NAUSEA}|\b${EN_NAUSEA}\b(?:(?!\bon\b)[^.;!?\n]){0,25}?\b${EN_DAY_N}(?!\s+(?:of|after|post|since|on)\b)|\b(?:so|too)\s+${EN_NAUSEA}\b${gap(10)}\bcan'?t\s+(?:function|work|eat|drink|sleep|move|stand|get\s+out\s+of\s+bed)\b`),
    // "vomiting and diarrhea, still going"
    en`\b(?:${EN_VOMIT}|${EN_RUNS})\b[^.;!?\n]{0,30}?\bstill\s+(?:going|happening|at\s+it|sick)\b`,
    // cannot drink, said with vomiting, diarrhea or nausea
    en`\b(?:${EN_VOMIT}|${EN_RUNS}|${EN_NAUSEA})\b[^.;!?\n]{0,40}?\b(?:can'?t|cannot|can\s+not|couldn'?t|unable\s+to)\s+(?:even\s+)?(?:drink|eat\s+or\s+drink)\s+(?:any\s?thing|water|fluids?|liquids?)\b`,
  ],
  gallbladder: [
    en`\bjaundice`,
    en`\byellow(?:ing|ish)?\s+(?:of\s+)?(?:my\s+|the\s+)?(?:skin|eyes?|eyeballs?)\b`,
    en`\b(?:skin|eyes?|whites\s+of\s+(?:my|the)\s+eyes)\s+(?:(?:is|are|has|have|looks?|turned|turning|got|getting|went|going|gone|seems?)\s+){1,2}(?:a\s+bit\s+|a\s+little\s+|kind\s+of\s+|slightly\s+|really\s+|very\s+)?yellow`,
    en`\b${EN_SORE}\b${gap(30)}\b${EN_RUQ}`,
    en`\b${EN_RUQ}${gap(30)}\b${EN_SORE}\b`,
    en`\bright\s+upper\s+(?:abdominal\s+)?pain\b`,
    // "pain in your upper stomach (abdomen)", on either side
    fx(en`\b${EN_SORE}\b${gap(30)}\b(?:upper|top\s+of\s+(?:my\s+|the\s+)?|upper\s+part\s+of\s+(?:my\s+|the\s+)?)\s*(?:middle\s+|central\s+|mid\s+|left\s+|right\s+)?${EN_BELLY}\b|\bupper\s+(?:middle\s+|central\s+|mid\s+|left\s+|right\s+)?${EN_BELLY}\b${gap(30)}\b${EN_SORE}\b`),
    fx(en`\b${EN_SORE}\b${gap(25)}\b(?:under|below|beneath|behind)\s+(?:my\s+|the\s+)?(?:ribs?|rib\s*cage|breastbone|sternum)\b|\b(?:under|below|beneath|behind)\s+(?:my\s+|the\s+)?(?:ribs?|rib\s*cage|breastbone|sternum)\b${gap(25)}\b${EN_SORE}\b`),
    // "I look yellow", "why are my eyes yellow"
    en`\b(?:i'?m|i\s+am|i\s+look|i\s+looked|i\s+turned|i'?m\s+(?:looking|turning))\s+(?:a\s+bit\s+|a\s+little\s+|kind\s+of\s+|kinda\s+|really\s+|so\s+)?(?:yellow|jaundiced)\b|\b(?:is|are)\s+my\s+(?:skin|eyes?|face)\s+(?:so\s+|turning\s+|looking\s+|a\s+bit\s+|kind\s+of\s+)?yellow|\b(?:skin|eyes?|face)\b${gap(20)}\byellow(?:ish)?\s+(?:tint|tinge|colou?r|hue|look)\b|\byellow(?:ish)?\s+(?:tint|tinge|colou?r|hue|look)\b${gap(20)}\b(?:skin|eyes?|face)\b`,
    // "fever"; not hay fever
    fx(en`(?:\b(?<skip>hay|cabin|spring|scarlet|gold|dance|disco|jungle|baby|saturday\s+night)\s+)?\bfever(?:ish|s)?\b(?!\s+(?:dream|pitch|blister|tree|excitement|pace)\b)|\b(?:running|have|having|had|got|spiked|spiking)\s+a\s+(?:temp|temperature)\b|\btemp(?:erature)?\s+(?:(?:is|was|of|at|hit|reached|up\s+to|went\s+(?:up\s+)?to)\s+)?(?:10[0-9](?:\.\d)?|(?:38|39|40|41)(?:\.\d)?)(?![\d.])`),
    // "clay-colored stools"
    fx(en`\b(?:clay|pale|light|gr[ae]y|white|whitish|chalky|putty)[-\s]*(?:colou?red\s+)?(?:stools?|poops?|poo|bowel\s+movements?|bms?)\b|\b(?:stools?|poops?|poo|bowel\s+movements?|bms?)\b${gap(20)}\b(?:clay|pale|light[-\s]colou?red|light\s+in\s+colou?r|gr[ae]y|white|whitish|chalky|putty)\b|\b(?:pooping|pooped)\s+(?:out\s+)?(?:clay|pale|light|gr[ae]y|white|whitish|chalky)\b`),
    // the illness by name
    en`\bgall\s*stones?\b|\bgall\s*bladder\s+(?:attack|pain|problems?|issues?|infection)\b`,
  ],
  thyroid: [
    // "a lump in my neck", "a lump on the side of my neck", "a hard lump at the base of my neck"
    en`\b(?:lump|bump|swelling|mass|nodule|knot|growth)\b${gap(15)}\b(?:in|on|at|around|under|near)\s+(?:my\s+|the\s+)?(?:(?:front|side|left\s+side|right\s+side|base|back|bottom)\s+of\s+(?:my\s+|the\s+)?)?neck\b`,
    en`\bneck\s+(?:is\s+|looks\s+|feels\s+)?(?:lump|swelling|swollen|mass|nodule)\b`,
    en`\b(?:trouble|difficulty|difficult|hard\s+time|problems?|issues?|hard|harder|tough|can'?t|cannot|can\s+barely|can\s+hardly|unable\s+to|struggl(?:e|es|ing))\s+(?:to\s+|with\s+)?swallow`,
    // hoarseness that does not go away
    en`\b(?:hoarse(?:ness)?|raspy|lost\s+my\s+voice)\b${gap(30)}(?:\bfor\s+(?:\d+\s+|a\s+few\s+|several\s+|a\s+couple\s+of\s+|two\s+|three\s+)?(?:weeks|months)\b|\bfor\s+(?:a\s+long\s+time|a\s+while|a\s+month|ages)\b|\b(?:won'?t|doesn'?t|isn'?t|not)\s+(?:go(?:ing)?\s+away|getting\s+better|improving)\b|\bstill\b|\ball\s+the\s+time\b|\bconstantly\b)`,
    en`\b(?:for\s+(?:weeks|months|a\s+long\s+time)|still|always|constantly)\b${gap(25)}\b(?:hoarse|raspy)\b`,
    // "hoarseness", unless the person calls it slight
    fx(en`(?:\b(?<skip>${EN_MILD})\s+)?\b(?:hoarse(?:ness)?|raspy|croaky|los(?:t|ing)\s+my\s+voice|voice\s+(?:is\s+|has\s+been\s+|sounds?\s+|got\s+|keeps\s+getting\s+|went\s+)?(?:hoarse|raspy|croaky|gone|scratchy|going(?:\s+out)?|almost\s+gone|different|changed|deeper|weird|strange))\b`),
    // "trouble swallowing", in other words
    en`\bswallowing\s+(?:is|feels|got|has\s+been|was|has\s+gotten)\s+(?:really\s+|so\s+|very\s+|getting\s+)?(?:hard|harder|difficult|tough|a\s+struggle)\b|\b(?:food|drinks?|water|liquids?)\s+(?:gets?|keeps?\s+getting|got|is\s+getting|feels?|keeps?)\s+(?:stuck|sticking)\b|\b(?:food|water)\s+sticks?\s+in\s+my\s+throat\b|\b(?:hard|harder|tough|difficult|trouble|can'?t|cannot|struggl(?:e|es|ing))\s+(?:to\s+|time\s+)?get(?:ting)?\s+(?:my\s+)?(?:food|anything|water|liquids?|meals?)\s+down\b|\bchok(?:e|es|ed|ing)\s+(?:on\s+(?:my\s+|the\s+)?(?:food|water|drinks?|liquids?|saliva|spit|everything|anything|meals?|dinner|lunch|breakfast|bites?)|when\s+i\s+(?:eat|drink|swallow))\b`,
    // "a lump or swelling in your neck", in other words
    en`\b(?:swollen|lumpy|enlarged|bulging)\s+(?:neck|thyroid)\b|\b(?:lump|bump|mass|nodule|knot|growth)\b${gap(15)}\b(?:in|on)\s+(?:my\s+)?thyroid\b|\bswollen\s+(?:lymph\s+)?(?:nodes?|glands?)\b${gap(15)}\bneck\b|\bgoit(?:er|re)\b`,
    en`\b(?:swollen|swelling|puffy|enlarged)\b${gap(25)}\b(?:front|side|base)\s+of\s+(?:my\s+|the\s+)?neck\b|\b(?:neck|thyroid)\s+(?:is|feels|looks|seems|got)\s+(?:so\s+|really\s+|a\s+bit\s+|kind\s+of\s+|a\s+little\s+)?(?:swollen|puffy|enlarged|thick|bigger|lumpy)\b|\b(?:lump|bump|mass|knot)\b${gap(15)}\bin\s+my\s+throat(?:\s+area)?\b${gap(25)}(?:${EN_WONT_GO_AWAY}|\bwhen\s+i\s+swallow\b)`,
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
  // "Stomach problems that are severe or will not go away", where no rule above already stands for them.
  abdominal_pain_severe: [
    // stomach pain that does not go away
    en`\b${EN_BELLY}\b${gap(30)}${EN_HURT}${gap(30)}${EN_WONT_GO_AWAY}`,
    en`\b${EN_HURT}${gap(20)}\b(?:in|around|across)\b${gap(15)}\b${EN_BELLY}\b${gap(30)}${EN_WONT_GO_AWAY}`,
    en`\b(?:constant|non-?stop|persistent|lingering|ongoing|continuous|never-?ending|unrelenting)\b${gap(12)}\b${EN_BELLY}\s*-?\s*${EN_HURT}`,
    // other stomach problems, called severe
    fx(en`\b${EN_SEVERE}\b${gap(12)}\b(?:constipation|constipated|bloating|bloated|heartburn|acid\s+reflux|reflux|indigestion|gas\s+pains?|${EN_BELLY}\s+(?:problems?|issues?|troubles?|upset))\b`),
    fx(en`\b(?:constipation|bloating|heartburn|acid\s+reflux|reflux|indigestion|gas\s+pains?|${EN_BELLY}\s+(?:problems?|issues?|troubles?))\b${gap(20)}\b${EN_IS_SEVERE}`),
    // other stomach problems that do not go away
    fx(en`\b(?:(?:${EN_BELLY}|digestive|gi)\s+(?:problems?|issues?|troubles?|upset)|upset\s+${EN_BELLY}|constipat(?:ed|ion)|bloat(?:ed|ing)|heartburn|acid\s+reflux|reflux|indigestion)\b${gap(30)}${EN_WONT_GO_AWAY}`),
    // blood in vomit or stool
    fx(en`\b${EN_VOMIT}\s+(?:up\s+)?(?:bright\s+red\s+|a\s+lot\s+of\s+|some\s+|dark\s+)?blood\b|\b(?:pooping|pooped)\s+(?:bright\s+red\s+|a\s+lot\s+of\s+|some\s+|dark\s+)?blood\b|\bblood\b${gap(15)}\b(?:in|with)\s+(?:my\s+|the\s+)?(?:vomit|puke|throw\s*up|stools?|poop|poo|bowel\s+movements?|bm|diarrhea)\b`),
    fx(en`\b(?:bloody|black|tarry|black\s+tarry|black\s+and\s+tarry|maroon)\s+(?:stools?|poops?|poo|vomit|diarrhea|bowel\s+movements?)\b|\b(?:stools?|poops?|poo|vomit|puke)\b${gap(15)}\b(?:is|was|are|were|looks?|looked)\s+(?:black|bloody|tarry|like\s+coffee\s+grounds)\b`),
    // "my stomach has been a mess for 3 weeks", "stomach has been messed up and it's not getting better"
    fx(en`\b${EN_BELLY}\s+(?:has\s+been|have\s+been|is|was|'?s\s+been|been)\s+(?:a\s+(?:total\s+|complete\s+)?(?:mess|wreck|disaster)|messed\s+up|wrecked|off|upset|acting\s+up|bothering\s+me|giving\s+me\s+(?:trouble|problems|issues|fits))\b${gap(30)}${EN_WONT_GO_AWAY}`),
    // no bowel movement for 4 days or more
    fx(en`\b(?:haven'?t|have\s+not|hasn'?t|has\s+not|didn'?t|not|no)\s+(?:had\s+a\s+|had\s+any\s+|been\s+able\s+to\s+|really\s+)?(?:pooped|poop|gone\s+(?:to\s+the\s+bathroom|number\s+(?:2|two)|poop)|bowel\s+movements?|bms?)\b${gap(15)}\b(?:in|for)\s+(?:over\s+|almost\s+|about\s+|like\s+|more\s+than\s+|nearly\s+)?(?:(?:[4-9]|\d{2,}|four|five|six|seven|eight|nine|ten|several|many)\s+days|a\s+week|(?:\d+|two|three|a\s+few|several)\s+weeks)\b`),
    // cannot pass gas; a hard, swollen belly
    fx(en`\bcan'?t\s+(?:even\s+)?(?:pass\s+gas|fart)\b|\b(?:not|unable\s+to)\s+pass(?:ing)?\s+gas\b|\b${EN_BELLY}\b${gap(20)}\b(?:rock\s+hard|hard\s+as\s+a\s+rock|distended|so\s+swollen|swollen\s+and\s+(?:hard|hurts|painful|tight)|hard\s+and\s+swollen)\b`),
    // throwing up food eaten a day or more ago
    fx(en`\b${EN_VOMIT}\b${gap(20)}\b(?:food|stuff|meals?|dinner|lunch|breakfast|what)\b${gap(15)}\b(?:from|i\s+ate|i\s+had)\s+(?:yesterday|last\s+night|the\s+day\s+before|(?:\d+|two|three|a\s+few|several)\s+days\s+ago|days\s+ago)\b`),
    // the problem by name
    fx(en`\bgastroparesis\b|\b(?:bowel|intestinal)\s+(?:obstruction|blockage)\b|\bstomach\s+paralysis\b|\bparaly[sz]ed\s+stomach\b`),
    // "extremely bloated", "severe cramps"
    fx(en`\b(?:extremely|severely|incredibly|painfully|unbearably|insanely)\s+(?:bloated|constipated|backed\s+up|gassy)\b|\b(?:constipation|bloating|heartburn|acid\s+reflux|reflux|indigestion|gas\s+pains?)\s+so\s+bad\b|\b${EN_SEVERE}\s+(?:cramps?|cramping)\b(?!\s+in\s+(?:my\s+)?(?:legs?|calf|calves|foot|feet|toes?|hands?|thighs?|arms?)\b)`),
  ],
} satisfies Partial<Record<TriageId, RegExp[]>>;

/**
 * `test` says whether the rule is raised, and by what: 'fixed' when only signs marked with `fx`
 * were found (the hit then carries `fixedCard`), anything else true when the rule's own card fits.
 */
const RULES: { id: TriageId; level: TriageLevel | ((c: TriageContext) => TriageLevel); when?: (c: TriageContext) => boolean; test: (t: string, c: TriageContext) => boolean | 'card' | 'fixed' }[] = [
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
      if (/(低血糖|血糖(很|太|特别|特別)?低)/.test(t)) return true;
      const named = anyEn(t, EN.hypoglycemia);
      if (named === 'card') return true;
      const signs = [/手抖|发抖|發抖/, /冷汗/, /心慌|心悸/, /发懵|發懵|意识模糊|意識模糊|糊涂|糊塗/];
      // Two signs raise the rule. The English list has more sign groups than the Chinese one; the
      // first four are the same signs. A common sign counts only next to one that is not.
      const found = EN_LOW_SUGAR_SIGNS.map((r, i) => signs[i]?.test(t) === true || anyEn(t, [r]) !== false);
      // The card of this rule names shaking, cold sweats and a racing heart: it fits two of the first four signs.
      if (found.slice(0, signs.length).filter(Boolean).length >= 2) return true;
      const count = found.filter(Boolean).length;
      return named === 'fixed' || count >= 2 || (count === 1 && EN_LOW_SUGAR_COMMON.some((r) => anyEn(t, [r]) !== false)) ? 'fixed' : false;
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
    test: (t) => any(t, [/(怀孕|懷孕|备孕|備孕|验孕|驗孕|两道杠|兩道槓|哺乳期|喂奶|餵奶)/]) || anyEn(t, EN.pregnancy, /\byet\b|\b(?:but|though)\s+(?:still\s+)?(?:i'?m\s+|i\s+am\s+|we'?re\s+|we\s+are\s+)?(?:still\s+)?(?:trying|hoping|planning)\b/i, true),
  },
  {
    id: 'procedure',
    level: 'remind',
    // "have not had surgery yet, it is next week": the procedure is still ahead.
    test: (t) => any(t, [/(手术|手術|全麻|麻醉|胃镜|胃鏡|肠镜|腸鏡|内镜|內鏡)/]) || anyEn(t, EN.procedure, /\byet\b/i, true),
  },
  {
    id: 'contraception',
    level: 'remind',
    when: (c) => c.drugId === 'tirzepatide',
    test: (t) => any(t, [/(避孕药|避孕藥|口服避孕|短效避孕)/]) || anyEn(t, EN.contraception, undefined, true),
  },
  {
    id: 'eating_too_little',
    level: 'care',
    test: (t) =>
      any(t, [/(好几天|好幾天|几天|幾天|连续|連續|整整).{0,6}(几乎|幾乎|都)?.{0,3}(吃不下|没吃|沒吃|没怎么吃|沒怎麼吃|吃不进|吃不進)/]) || anyEn(t, EN.eating_too_little, undefined, true),
  },
  {
    // English only. The symptom buttons raise it too (triageSymptom).
    id: 'abdominal_pain_severe',
    level: 'urgent',
    test: (t) => anyEn(t, EN.abdominal_pain_severe),
  },
];

export function triageText(text: string, ctx: TriageContext): TriageHit[] {
  // Phones type curly apostrophes ("can’t"); the English patterns expect straight ones. Common
  // misspellings of the English key words are read as the word that was meant.
  const t = readSpelling(text.trim().replace(/[\u2018\u2019\u02BC\uFF07]/g, "'"));
  if (!t) return [];
  const hits: TriageHit[] = [];
  for (const r of RULES) {
    if (r.when && !r.when(ctx)) continue;
    const raised = r.test(t, ctx);
    if (!raised) continue;
    const level = typeof r.level === 'function' ? r.level(ctx) : r.level;
    hits.push(raised === 'fixed' ? { id: r.id, level, fixedCard: true } : { id: r.id, level });
  }
  return hits.sort((a, b) => RANK[a.level] - RANK[b.level]);
}

/**
 * Every rule, with each level it can have for some person (the low-blood-sugar rule has two).
 * guideCoverage.ts uses it to check that no rule is left without a basis.
 */
export function triageRuleLevels(): Record<TriageId, TriageLevel[]> {
  const out = {} as Record<TriageId, TriageLevel[]>;
  for (const r of RULES) {
    const levels = typeof r.level === 'function' ? [true, false].map((insulinOrSU) => (r.level as (c: TriageContext) => TriageLevel)({ insulinOrSU, drugId: null, region: 'US' })) : [r.level];
    out[r.id] = [...new Set(levels)];
  }
  return out;
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

/**
 * 快捷记录的症状打分（0–3）触发的分诊。
 *
 * Checked against the Medication Guides (guideCoverage.ts says which item each button stands
 * for). A tap on "Severe" says how bad a symptom is, not how long it has lasted. Two buttons
 * were added with the guides:
 * - nausea: the guides name "stomach problems that are severe" and, together with vomiting and
 *   diarrhea, "nausea, vomiting, or diarrhea that does not go away";
 * - dizziness, for every person: "fainting or feeling dizzy" is a sign of a serious allergic
 *   reaction in every guide, and no other button leads to that item. A person who takes insulin
 *   or a sulfonylurea still gets the low-blood-sugar hit, as before.
 * The two added hits carry `fixedCard`: the card written for the dehydration rule speaks of
 * vomiting and diarrhea, not of nausea or dizziness.
 */
export function triageSymptom(kind: SymptomKind, grade: number, ctx: TriageContext): TriageHit[] {
  if (grade < 3) return [];
  if (kind === 'nausea') return [{ id: 'dehydration', level: 'urgent', fixedCard: true }];
  if (kind === 'vomiting' || kind === 'diarrhea') return [{ id: 'dehydration', level: 'urgent' }];
  if (kind === 'abdominal_pain') return [{ id: 'abdominal_pain_severe', level: 'urgent' }];
  if (kind === 'dizziness') return [ctx.insulinOrSU ? { id: 'hypoglycemia', level: 'act_now' } : { id: 'dehydration', level: 'urgent', fixedCard: true }];
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

/** A hit as it is kept with a log entry, and the hit read back from such an entry. */
export function storedHit(hit: TriageHit | null): { triageId: TriageId | null; triageLevel: TriageLevel | null; triageFixed?: true } {
  return { triageId: hit?.id ?? null, triageLevel: hit?.level ?? null, ...(hit?.fixedCard ? { triageFixed: true as const } : {}) };
}
export function hitOf(row: { triageId?: TriageId | null; triageLevel?: TriageLevel | null; triageFixed?: boolean }): TriageHit | null {
  if (!row.triageId || !row.triageLevel) return null;
  return row.triageFixed ? { id: row.triageId, level: row.triageLevel, fixedCard: true } : { id: row.triageId, level: row.triageLevel };
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

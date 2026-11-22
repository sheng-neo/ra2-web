/**
 * 本地解析：先处理最常见、最明确的说法（体重、打针、速查表里的食物），
 * 剩下认不出来的再交给 AI。好处是快、离线可用、不把数据发出去、不花钱。
 *
 * English: only the two simplest cases are read here, a weight ("182.4 lb", "weighed 182.4")
 * and a dose ("took 5 mg", "shot 2.5mg left thigh"). Everything else falls through.
 */
import { parseFoodsLocal, type LocalFoodHit } from './foods';
import type { Lang } from './i18n';
import type { Site } from './schedule';
import { storedKg, toKg, type WeightUnit } from './units';

export type LocalEvent =
  | { type: 'weight'; kg: number; raw: string }
  | { type: 'dose'; amount: number; unit: 'mg' | 'units' | 'mL'; site: Site | null; raw: string }
  | { type: 'food'; items: LocalFoodHit[] };

const SITE_WORDS: [RegExp, Site][] = [
  [/(左(边|邊)?(肚子|腹))/, 'abd_l'],
  [/(右(边|邊)?(肚子|腹))/, 'abd_r'],
  [/(左(边|邊)?(大腿|腿))/, 'thigh_l'],
  [/(右(边|邊)?(大腿|腿))/, 'thigh_r'],
  [/(左(边|邊)?(上臂|胳膊|手臂|臂))/, 'arm_l'],
  [/(右(边|邊)?(上臂|胳膊|手臂|臂))/, 'arm_r'],
];

const EN_SIDE_OF = String.raw`\s+(?:side\s+of\s+(?:my\s+|the\s+)?)?`;
const SITE_WORDS_EN: [RegExp, Site][] = [
  [new RegExp(String.raw`\bleft${EN_SIDE_OF}(?:stomach|abdomen|belly|tummy)\b`, 'i'), 'abd_l'],
  [new RegExp(String.raw`\bright${EN_SIDE_OF}(?:stomach|abdomen|belly|tummy)\b`, 'i'), 'abd_r'],
  [/\bleft\s+(?:thigh|leg)\b/i, 'thigh_l'],
  [/\bright\s+(?:thigh|leg)\b/i, 'thigh_r'],
  [/\bleft\s+(?:upper\s+)?arm\b/i, 'arm_l'],
  [/\bright\s+(?:upper\s+)?arm\b/i, 'arm_r'],
];

/**
 * English dose: a past-tense word, then a number WITH a unit ("took 5 mg", "shot 2.5mg").
 * A bare number is not enough in English: "took 5" could be anything.
 */
const DOSE_EN = /\b(?:took|taken|injected|did|had|gave\s+myself|shot|jabbed)\b[^.\d]{0,20}?(\d+(?:\.\d+)?)\s*(mg|milligrams?|units?|ml|milliliters?)\b/i;

/** English weight with a keyword: "weighed 182.4", "weight 182.4 lb", "weighed in at 182". */
const WEIGHT_EN_KEYWORD =
  /\b(?:weigh(?:ed|s|ing)?(?:\s+in)?|weight|scale\s+(?:says|said|reads?|showed))(?:\s+(?:is|was|at|of|today|this\s+morning))*\s*:?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(kgs?|kilos?|kilograms?|lbs?|pounds?)?(?![\d.]|\s*(?:mg|ml|units?)\b)/i;
/** English weight with a spelled-out unit: "182.4 pounds". ("182.4 lb" is already read by the pattern shared with Chinese.) */
const WEIGHT_EN_UNIT = /(\d{2,3}(?:\.\d{1,2})?)\s*(kgs|kilos?|kilograms?|pounds?)\b/i;

const HAS_CJK = /[\u3400-\u9fff]/;

export function parseLocal(text: string, defaultWeightUnit: WeightUnit, lang: Lang): { events: LocalEvent[]; rest: string } {
  // Phones type curly apostrophes; the English filler words expect straight ones.
  const input = text.trim().replace(/[\u2018\u2019]/g, "'");
  const withEnglishDose = parse(input, defaultWeightUnit, lang, true);
  // An English dose is only kept when the whole message was understood. "took 500 mg of
  // something else" must not become a prefilled dose of the user's medication.
  if (withEnglishDose.usedEnglishDose && withEnglishDose.rest !== '') return strip(parse(input, defaultWeightUnit, lang, false));
  return strip(withEnglishDose);
}

type Parsed = { events: LocalEvent[]; rest: string; usedEnglishDose: boolean };
const strip = (p: Parsed) => ({ events: p.events, rest: p.rest });

function parse(input: string, defaultWeightUnit: WeightUnit, lang: Lang, allowEnglishDose: boolean): Parsed {
  let rest = input;
  const events: LocalEvent[] = [];
  let usedEnglishDose = false;

  // 打针："刚打了 7.5" "打了2.5mg 左腹" "今天打针 0.5"
  const dose = /(打了|打针|打針|注射了?|打完)\s*(\d+(?:\.\d+)?)\s*(mg|毫克|单位|單位|units?|u|ml|毫升)?/i.exec(rest);
  if (dose) {
    const unitRaw = (dose[3] ?? 'mg').toLowerCase();
    const unit = /^(单位|單位|units?|u)$/.test(unitRaw) ? 'units' : /^(ml|毫升)$/.test(unitRaw) ? 'mL' : 'mg';
    let site: Site | null = null;
    for (const [re, s] of SITE_WORDS) {
      const m = re.exec(rest);
      if (m) {
        site = s;
        rest = rest.replace(m[0], ' ');
        break;
      }
    }
    events.push({ type: 'dose', amount: Number(dose[2]), unit, site, raw: dose[0] });
    rest = rest.replace(dose[0], ' ');
  } else if (allowEnglishDose) {
    const en = DOSE_EN.exec(rest);
    if (en) {
      const unitRaw = en[2].toLowerCase();
      const unit = unitRaw.startsWith('unit') ? 'units' : /^(ml|milliliters?)$/.test(unitRaw) ? 'mL' : 'mg';
      rest = rest.replace(en[0], ' ');
      let site: Site | null = null;
      for (const [re, s] of SITE_WORDS_EN) {
        const m = re.exec(rest);
        if (m) {
          site = s;
          rest = rest.replace(m[0], ' ');
          break;
        }
      }
      events.push({ type: 'dose', amount: Number(en[1]), unit, site, raw: en[0] });
      usedEnglishDose = true;
    }
  }

  // 体重："体重 81.6" "今早 81.6" "163斤" "180 lb"
  // Order: Chinese keyword, English keyword ("weighed 182.4 lb" must take the word "weighed"
  // with it), then a bare number with a unit.
  // Up to two decimals are read, so "182.75" is never cut short and its tail left behind.
  const zhKeyword = /(体重|體重|称重|稱重|早上|今早|今天早上)\s*(?:是)?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(公斤|kg|斤|磅|lbs?)?/i.exec(rest);
  const enKeyword = zhKeyword ? null : WEIGHT_EN_KEYWORD.exec(rest);
  // The bare number must start at a number boundary: "182.75 lb" is not "75 lb".
  const bare = zhKeyword || enKeyword ? null : /(?:^|[^\d.])((\d{2,3}(?:\.\d{1,2})?)\s*(公斤|kg|斤|磅|lbs?)(?![a-z]))/i.exec(rest);
  const w = zhKeyword ? { raw: zhKeyword[0], num: zhKeyword[2], unit: zhKeyword[3] as string | undefined } : bare ? { raw: bare[1], num: bare[2], unit: bare[3] as string | undefined } : null;
  if (w) {
    const unitRaw = w.unit?.toLowerCase();
    const unit: WeightUnit = !unitRaw ? defaultWeightUnit : unitRaw === '斤' ? 'jin' : /磅|lb/.test(unitRaw) ? 'lb' : 'kg';
    const kg = toKg(Number(w.num), unit);
    if (kg >= 30 && kg <= 300) {
      events.push({ type: 'weight', kg: storedKg(kg), raw: w.raw });
      rest = rest.replace(w.raw, ' ');
    }
  } else {
    const en = enKeyword ?? WEIGHT_EN_UNIT.exec(rest);
    if (en) {
      const unitRaw = en[2]?.toLowerCase();
      const unit: WeightUnit = !unitRaw ? defaultWeightUnit : /^(lb|pound)/.test(unitRaw) ? 'lb' : 'kg';
      const kg = toKg(Number(en[1]), unit);
      if (kg >= 30 && kg <= 300) {
        events.push({ type: 'weight', kg: storedKg(kg), raw: en[0] });
        rest = rest.replace(en[0], ' ');
      }
    }
  }

  // 食物：只有整段都认得出来才在本地记。认出一半（"皮蛋瘦肉粥"）说明是复合菜，整段交给 AI。
  const foods = parseFoodsLocal(rest, lang);
  if (foods.hits.length && stripFiller(foods.rest) === '') {
    events.push({ type: 'food', items: foods.hits });
    rest = '';
  }
  // What is left goes to the AI. Chinese text is sent with filler words removed, as before.
  // English keeps its small words ("coffee with milk"), which carry more of the meaning.
  const leftover = stripFiller(rest);
  return { events, rest: leftover === '' || HAS_CJK.test(rest) ? leftover : rest.replace(/\s+/g, ' ').replace(/^[\s,;.]+|[\s,;]+$/g, ''), usedEnglishDose };
}

const FILLER = /(打完针|打完針|打针|打針|打完|早饭|早飯|早餐|午饭|午飯|午餐|晚饭|晚飯|晚餐|加餐|宵夜|夜宵|吃了|喝了|刚刚|剛剛|刚|剛|今天|今早|早上|中午|晚上|还有|還有|然后|然後|还|還|和|跟|加|了|的|嗯)/g;

/** English words that carry no record: only used to decide whether anything is left over. */
const FILLER_EN =
  /\b(?:this\s+(?:morning|afternoon|evening)|last\s+night|i'm|i've|it's|i|im|ive|my|me|the|a|an|and|then|also|plus|in|on|at|to|of|into|for|with|just|now|today|tonight|yesterday|was|is|it|shot|injection|dose|side|stomach|abdomen|belly|thigh|arm|done|ok|okay|ate|had|breakfast|lunch|dinner|snack|down|up)\b/gi;

export function stripFiller(s: string): string {
  let out = s.replace(FILLER, ' ');
  // English filler words are only removed from text without Chinese characters, so Chinese
  // input is handled exactly as before.
  if (!HAS_CJK.test(s)) out = out.replace(FILLER_EN, ' ');
  return out.replace(/[，,。.、;；!！?？\s]+/g, ' ').trim();
}

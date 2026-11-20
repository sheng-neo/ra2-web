/**
 * 本地解析：先处理最常见、最明确的说法（体重、打针、速查表里的食物），
 * 剩下认不出来的再交给 AI。好处是快、离线可用、不把数据发出去、不花钱。
 */
import { parseFoodsLocal, type LocalFoodHit } from './foods';
import type { Site } from './schedule';
import { toKg, type WeightUnit } from './units';

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

export function parseLocal(text: string, defaultWeightUnit: WeightUnit): { events: LocalEvent[]; rest: string } {
  let rest = text.trim();
  const events: LocalEvent[] = [];

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
  }

  // 体重："体重 81.6" "今早 81.6" "163斤" "180 lb"
  const w =
    /(体重|體重|称重|稱重|早上|今早|今天早上)\s*(?:是)?\s*(\d{2,3}(?:\.\d)?)\s*(公斤|kg|斤|磅|lbs?)?/i.exec(rest) ??
    /(\d{2,3}(?:\.\d)?)\s*(公斤|kg|斤|磅|lbs?)(?![a-z])/i.exec(rest);
  if (w) {
    const hasKeyword = w.length === 4;
    const num = Number(hasKeyword ? w[2] : w[1]);
    const unitRaw = (hasKeyword ? w[3] : w[2])?.toLowerCase();
    const unit: WeightUnit = !unitRaw ? defaultWeightUnit : unitRaw === '斤' ? 'jin' : /磅|lb/.test(unitRaw) ? 'lb' : 'kg';
    const kg = toKg(num, unit);
    if (kg >= 30 && kg <= 300) {
      events.push({ type: 'weight', kg: Math.round(kg * 10) / 10, raw: w[0] });
      rest = rest.replace(w[0], ' ');
    }
  }

  // 食物：只有整段都认得出来才在本地记。认出一半（"皮蛋瘦肉粥"）说明是复合菜，整段交给 AI。
  const foods = parseFoodsLocal(rest);
  if (foods.hits.length && stripFiller(foods.rest) === '') {
    events.push({ type: 'food', items: foods.hits });
    rest = '';
  }
  return { events, rest: stripFiller(rest) };
}

const FILLER = /(打完针|打完針|打针|打針|打完|早饭|早飯|早餐|午饭|午飯|午餐|晚饭|晚飯|晚餐|加餐|宵夜|夜宵|吃了|喝了|刚刚|剛剛|刚|剛|今天|今早|早上|中午|晚上|还有|還有|然后|然後|还|還|和|跟|加|了|的|嗯)/g;

export function stripFiller(s: string): string {
  return s.replace(FILLER, ' ').replace(/[，,。.、;；!！?？\s]+/g, ' ').trim();
}

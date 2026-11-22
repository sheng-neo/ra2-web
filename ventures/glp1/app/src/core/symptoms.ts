/**
 * 个人高症状日（PRD v2.0 第 5.3 节）：记满 3 个用药周期后，
 * 按"打针后第几天"（0–6）分组，某一天平均症状分 ≥ 个人整体平均的 1.5 倍、
 * 且至少出现过 2 次，就标为高症状日。
 */
import type { Lang } from './i18n';
import type { SymptomKind } from './triage';
import { dayDiff, dayKey } from './tz';

export interface SymptomPoint {
  atMs: number;
  grade: number; // 0–3
}

export interface HighDayResult {
  enoughData: boolean;
  cycles: number;
  /** 打针后第几天（0 = 打针当天）。 */
  highDays: number[];
  meanByOffset: number[];
}

export function highSymptomDays(doseTimes: number[], symptoms: SymptomPoint[], nowMs: number, tz: string, dayStartHour = 4, period = 7): HighDayResult {
  const doseDays = [...new Set(doseTimes.map((t) => dayKey(t, tz, dayStartHour)))].sort();
  const today = dayKey(nowMs, tz, dayStartHour);
  // 完整周期：从某次用药日到下一次用药日之前；最后一个周期需要已经过完。
  const cycles: string[][] = [];
  for (let i = 0; i < doseDays.length; i++) {
    const start = doseDays[i];
    const end = doseDays[i + 1];
    const len = end ? Math.min(dayDiff(start, end), period) : dayDiff(start, today) >= period ? period : 0;
    if (len < period) continue;
    const days: string[] = [];
    for (let k = 0; k < period; k++) days.push(shift(start, k));
    cycles.push(days);
  }
  const meanByOffset = new Array(period).fill(0);
  if (cycles.length < 3) return { enoughData: false, cycles: cycles.length, highDays: [], meanByOffset };

  const maxByDay = new Map<string, number>();
  for (const s of symptoms) {
    const k = dayKey(s.atMs, tz, dayStartHour);
    maxByDay.set(k, Math.max(maxByDay.get(k) ?? 0, s.grade));
  }
  const counts = new Array(period).fill(0);
  let total = 0;
  for (const days of cycles) {
    days.forEach((d, k) => {
      const g = maxByDay.get(d) ?? 0;
      meanByOffset[k] += g / cycles.length;
      if (g >= 1) counts[k]++;
      total += g;
    });
  }
  const overall = total / (cycles.length * period);
  const highDays = overall > 0 ? meanByOffset.map((m, k) => (m >= 1.5 * overall && counts[k] >= 2 ? k : -1)).filter((k) => k >= 0) : [];
  return { enoughData: true, cycles: cycles.length, highDays, meanByOffset };
}

function shift(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// ── Text ─────────────────────────────────────────────────────────────────────

/** Symptoms in the order the quick-log grid shows them. */
export const SYMPTOM_ORDER: SymptomKind[] = [
  'nausea',
  'vomiting',
  'reflux',
  'constipation',
  'diarrhea',
  'abdominal_pain',
  'no_appetite',
  'fatigue',
  'dizziness',
  'hair_loss',
  'injection_site',
  'mood',
  'menstrual',
];

const SYMPTOM_ZH: Record<SymptomKind, string> = {
  nausea: '恶心',
  vomiting: '呕吐',
  reflux: '反酸打嗝',
  constipation: '便秘',
  diarrhea: '腹泻',
  abdominal_pain: '肚子疼',
  no_appetite: '没胃口',
  fatigue: '疲劳',
  dizziness: '头晕',
  hair_loss: '脱发',
  injection_site: '注射部位红肿',
  mood: '情绪低落',
  menstrual: '月经变化',
};

const SYMPTOM_EN: Record<SymptomKind, string> = {
  nausea: 'Nausea',
  vomiting: 'Vomiting',
  reflux: 'Heartburn or burping',
  constipation: 'Constipation',
  diarrhea: 'Diarrhea',
  abdominal_pain: 'Stomach pain',
  no_appetite: 'No appetite',
  fatigue: 'Tiredness',
  dizziness: 'Dizziness',
  hair_loss: 'Hair loss',
  injection_site: 'Redness or swelling where you inject',
  mood: 'Low mood',
  menstrual: 'Period changes',
};

/** Label for a symptom kind. Anything unknown (including 'other') gets a general label. */
export function symptomLabel(kind: string, lang: Lang): string {
  const table: Record<string, string> = lang === 'en' ? SYMPTOM_EN : SYMPTOM_ZH;
  return table[kind] ?? (lang === 'en' ? 'Not feeling well' : '不舒服');
}

const GRADE_ZH = ['没有', '轻', '中', '重'];
const GRADE_EN = ['None', 'Mild', 'Moderate', 'Severe'];

/** Label for a symptom grade, 0 to 3. */
export function gradeLabel(grade: number, lang: Lang): string {
  return (lang === 'en' ? GRADE_EN : GRADE_ZH)[grade] ?? '';
}

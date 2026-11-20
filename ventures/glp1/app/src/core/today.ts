/**
 * "今天这样过"（PRD v2.0 第 2.2 节）：固定规则按顺序匹配，命中第一条就用。
 * 文案在界面层，事先写好并经过审核，不由 AI 临场发挥。
 */
import type { EscalationInfo } from './pk';
import type { HighDayResult } from './symptoms';
import type { TriageHit } from './triage';
import type { CourseStatus } from './types';
import { dayDiff, dayKey, shiftDayKey } from './tz';
import type { DueStatus } from './schedule';

export type Advice =
  | { kind: 'triage'; hit: TriageHit }
  | { kind: 'dose_day'; dueMs: number; status: DueStatus }
  | { kind: 'escalation'; dayOfEscalation: number; currentMg: number }
  | { kind: 'high_symptom'; offset: number }
  | { kind: 'protein_low'; days: number; floorG: number }
  | { kind: 'stopped'; daysSince: number | null }
  | { kind: 'normal'; train: boolean; offset: number | null };

export interface TodayInput {
  nowMs: number;
  tz: string;
  dayStartHour: number;
  status: CourseStatus | null;
  nextDueMs: number | null;
  dueStatus: DueStatus | null;
  lastDoseMs: number | null;
  escalation: EscalationInfo | null;
  highDays: HighDayResult | null;
  proteinFloorG: number | null;
  /** 只包含有饮食记录的日子：dayKey → 当天蛋白克数。 */
  proteinByDay: Record<string, number>;
  openTriage: TriageHit | null;
  workoutDays: string[];
  stoppedAt: number | null;
}

const ACTIVE: CourseStatus[] = ['escalating', 'maintenance'];

export function todayAdvice(i: TodayInput): Advice {
  const today = dayKey(i.nowMs, i.tz, i.dayStartHour);
  const active = i.status !== null && ACTIVE.includes(i.status);
  const offset = i.lastDoseMs !== null ? dayDiff(dayKey(i.lastDoseMs, i.tz, i.dayStartHour), today) : null;

  if (i.openTriage) return { kind: 'triage', hit: i.openTriage };

  if (active && i.nextDueMs !== null && i.dueStatus) {
    const dueToday = dayKey(i.nextDueMs, i.tz, i.dayStartHour) === today;
    if (dueToday || i.dueStatus !== 'upcoming') return { kind: 'dose_day', dueMs: i.nextDueMs, status: i.dueStatus };
  }

  if (active && i.escalation?.escalationActive) {
    const d = dayDiff(dayKey(i.escalation.sinceMs, i.tz, i.dayStartHour), today);
    return { kind: 'escalation', dayOfEscalation: d + 1, currentMg: i.escalation.currentMg };
  }

  if (active && offset !== null && i.highDays?.enoughData && i.highDays.highDays.includes(offset % 7)) {
    return { kind: 'high_symptom', offset };
  }

  if (i.proteinFloorG !== null) {
    let streak = 0;
    for (let k = 1; k <= 3; k++) {
      const v = i.proteinByDay[shiftDayKey(today, -k)];
      if (v === undefined || v >= i.proteinFloorG) break;
      streak++;
    }
    if (streak === 3) return { kind: 'protein_low', days: 3, floorG: i.proteinFloorG };
  }

  if (i.status === 'stopped') {
    const since = i.stoppedAt !== null ? dayDiff(dayKey(i.stoppedAt, i.tz, i.dayStartHour), today) : null;
    return { kind: 'stopped', daysSince: since };
  }

  // 训练：每周 2–3 次。本周（周一起）不到 2 次、今天和昨天都没练，就建议今天练。
  const weekStart = startOfWeek(today);
  const thisWeek = i.workoutDays.filter((d) => d >= weekStart && d <= today);
  const yesterday = shiftDayKey(today, -1);
  const train = thisWeek.length < 2 && !i.workoutDays.includes(today) && !i.workoutDays.includes(yesterday);
  return { kind: 'normal', train, offset };
}

function startOfWeek(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = 周日
  return shiftDayKey(key, -((wd + 6) % 7));
}

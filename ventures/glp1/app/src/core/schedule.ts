/**
 * 用药排期：下一次什么时候、有没有漏记、建议打哪个部位。
 * 间隔一律按绝对时间计算；"每周一 21:00"这类固定时刻按用户时区解释。
 */
import { addDays, DAY, HOUR, parseHHMM, zonedParts, zonedToUtc } from './tz';

export type Schedule =
  | { kind: 'weekly'; weekday: number; time: string } // weekday 0 = 周日
  | { kind: 'daily'; time: string }
  | { kind: 'interval'; hours: number; time?: string };

export function intervalHours(s: Schedule): number {
  if (s.kind === 'weekly') return 168;
  if (s.kind === 'daily') return 24;
  return s.hours;
}

/** 固定时刻排期里，两次之间至少隔多久才算"下一次"（防止提前几分钟打完又被算作当天这一次）。 */
function minGapMs(s: Schedule): number {
  if (s.kind === 'weekly') return 72 * HOUR;
  if (s.kind === 'daily') return 12 * HOUR;
  return 0;
}

/** 从 fromMs 起（含），第一个满足条件的本地时刻。 */
function firstSlotAtOrAfter(fromMs: number, tz: string, time: string, weekday: number | null): number {
  const { hour, minute } = parseHHMM(time);
  const p = zonedParts(fromMs, tz);
  for (let i = 0; i <= 8; i++) {
    const d = addDays(p.year, p.month, p.day, i);
    const t = zonedToUtc(d.year, d.month, d.day, hour, minute, tz);
    if (t < fromMs) continue;
    if (weekday !== null && zonedParts(t, tz).weekday !== weekday) continue;
    return t;
  }
  throw new Error('no slot found');
}

export function nextDueMs(s: Schedule, lastDoseMs: number | null, nowMs: number, tz: string): number {
  if (s.kind === 'interval') {
    if (lastDoseMs !== null) return lastDoseMs + s.hours * HOUR;
    return s.time ? firstSlotAtOrAfter(nowMs, tz, s.time, null) : nowMs;
  }
  const from = lastDoseMs !== null ? lastDoseMs + minGapMs(s) : nowMs;
  return firstSlotAtOrAfter(from, tz, s.time, s.kind === 'weekly' ? s.weekday : null);
}

export type DueStatus = 'upcoming' | 'due' | 'overdue';

/** 到点后 12 小时内算"该用了"，超过 12 小时算"可能忘了记"。 */
export function dueStatus(dueMs: number, nowMs: number): DueStatus {
  if (nowMs < dueMs) return 'upcoming';
  if (nowMs - dueMs <= 12 * HOUR) return 'due';
  return 'overdue';
}

export function countdown(dueMs: number, nowMs: number): { days: number; hours: number; minutes: number; past: boolean } {
  const diff = dueMs - nowMs;
  const abs = Math.abs(diff);
  return {
    days: Math.floor(abs / DAY),
    hours: Math.floor((abs % DAY) / HOUR),
    minutes: Math.floor((abs % HOUR) / 60000),
    past: diff < 0,
  };
}

export const SITES = ['abd_l', 'abd_r', 'thigh_l', 'thigh_r', 'arm_l', 'arm_r'] as const;
export type Site = (typeof SITES)[number];

/** 按顺序轮换：上一次用了哪个部位，就建议下一个。 */
export function suggestSite(recentSites: (Site | null | undefined)[]): Site {
  const last = [...recentSites].reverse().find((s): s is Site => !!s);
  if (!last) return SITES[0];
  return SITES[(SITES.indexOf(last) + 1) % SITES.length];
}

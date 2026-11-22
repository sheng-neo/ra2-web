/**
 * Weekly summary: three numbers about the last seven days, and nothing else.
 *
 * - doses logged, next to the number the person's own schedule has called for so far;
 * - the change in weight, when there are two or more weigh-ins;
 * - the number of days with a symptom logged.
 *
 * It only counts what was logged. It gives no advice and makes no judgement.
 *
 * The seven days are today and the six days before it, in the person's time zone and with
 * their own start of day. For someone who has only just started, the days before their first
 * day with the app are left out, so a daily schedule does not read "1 of 7" on day one.
 *
 * "Scheduled" means scheduled so far. A dose that is due later today is not counted yet, so a
 * person who has logged every dose never reads as one short. How it is counted:
 * - a weekly or daily schedule has fixed times. Each of them on these days counts once it has
 *   come, or as soon as a dose is logged on its day (a dose taken a little early is not "1 of 0");
 * - an "every N days" schedule has no fixed times: the next dose is due N days after the last
 *   one, as on the Today screen. So the count follows the log. Each logged dose stands for the
 *   scheduled dose it was taken for, a gap of two or more intervals between doses adds the
 *   scheduled doses that were passed over, and after the last dose one more is added each time
 *   another interval has run out. A second dose inside the same interval adds nothing.
 */
import { intervalHours, type Schedule } from './schedule';
import { addDays, dayDiff, dayKey, dayStartMs, HOUR, parseHHMM, shiftDayKey, zonedToUtc } from './tz';

export const SUMMARY_DAYS = 7;

export interface WeeklyInput {
  nowMs: number;
  tz: string;
  dayStartHour: number;
  /** The person's schedule, or null when no medication is set up. */
  schedule: Schedule | null;
  /** Whether doses are being scheduled at the moment (status "increasing dose" or "maintenance dose"). */
  active: boolean;
  /**
   * When the person started with the app: the end of setup, or their earliest logged dose if
   * that is earlier. Null when unknown; the full seven days are then used.
   */
  sinceMs: number | null;
  /** When each logged dose of the current medication was taken. */
  doseTimes: number[];
  weights: { atMs: number; kg: number }[];
  /** When each logged symptom happened. */
  symptomTimes: number[];
}

export interface WeeklySummary {
  /** First and last day of the summary (day keys, YYYY-MM-DD), both included. */
  fromDay: string;
  toDay: string;
  /** Number of days covered: 7, or fewer for someone who has just started. */
  days: number;
  dosesLogged: number;
  /** Doses the schedule has called for on these days so far. Null when nothing is being scheduled. */
  dosesScheduled: number | null;
  weighIns: number;
  /** The first and the last weigh-in of these days. Null unless there are two or more. */
  firstWeightKg: number | null;
  lastWeightKg: number | null;
  /** Days with at least one symptom logged. */
  symptomDays: number;
}

/** Weekday (0 = Sunday) of a day key. */
function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** A schedule with fixed times: the same weekday each week, or every day. */
export type FixedSchedule = Exclude<Schedule, { kind: 'interval' }>;

/**
 * The days, out of `days` consecutive days ending on `toDay`, on which a fixed-time schedule
 * calls for a dose. A time before the start of day belongs to the day before, like everything
 * else in the app.
 */
function scheduledDays(s: FixedSchedule, toDay: string, days: number, dayStartHour: number): string[] {
  const all = Array.from({ length: days }, (_, i) => shiftDayKey(toDay, -i));
  if (s.kind === 'daily') return all;
  const shift = parseHHMM(s.time).hour < dayStartHour ? 1 : 0;
  const weekday = (((s.weekday - shift) % 7) + 7) % 7;
  return all.filter((day) => weekdayOf(day) === weekday);
}

/**
 * Doses a fixed-time schedule calls for on `days` consecutive days ending on `toDay`, whether
 * their time has come or not: the schedule's weekday once a week, or one a day.
 */
export function scheduledDoses(s: FixedSchedule, toDay: string, days: number, dayStartHour: number): number {
  return scheduledDays(s, toDay, days, dayStartHour).length;
}

/** The moment a fixed-time schedule calls for its dose on a day (a day key). */
function scheduledAt(s: FixedSchedule, day: string, tz: string, dayStartHour: number): number {
  const { hour, minute } = parseHHMM(s.time);
  const [y, m, d] = day.split('-').map(Number);
  // A time before the start of day is on the next calendar date.
  const date = hour < dayStartHour ? addDays(y, m, d, 1) : { year: y, month: m, day: d };
  return zonedToUtc(date.year, date.month, date.day, hour, minute, tz);
}

/** What scheduledSoFar looks at. `doseTimes` are all logged doses of the medication, in any order. */
export interface ScheduledInput {
  schedule: Schedule;
  fromDay: string;
  toDay: string;
  nowMs: number;
  tz: string;
  dayStartHour: number;
  doseTimes: number[];
}

/** The doses the schedule has called for from `fromDay` to now. See the top of this file for the rules. */
export function scheduledSoFar(input: ScheduledInput): number {
  const { schedule: s, fromDay, toDay, nowMs, tz, dayStartHour } = input;
  const key = (ms: number) => dayKey(ms, tz, dayStartHour);
  const doses = [...input.doseTimes].sort((a, b) => a - b);

  if (s.kind !== 'interval') {
    const loggedOn = new Set(doses.map(key));
    return scheduledDays(s, toDay, dayDiff(fromDay, toDay) + 1, dayStartHour).filter((day) => scheduledAt(s, day, tz, dayStartHour) <= nowMs || loggedOn.has(day)).length;
  }

  const gap = intervalHours(s) * HOUR;
  if (!(gap > 0)) return 0;
  const fromMs = dayStartMs(fromDay, tz, dayStartHour);
  /** Scheduled doses at `after + gap`, `after + 2 gap`, ... that fall on these days, before `before` and not after now. */
  const passedOver = (after: number, before: number) => {
    const first = Math.max(1, Math.ceil((fromMs - after) / gap));
    const end = Math.min(before, nowMs + 1);
    let n = 0;
    for (let t = after + first * gap; t < end; t += gap) n++;
    return n;
  };
  let n = 0;
  let last: number | null = null;
  for (const at of doses) {
    const day = key(at);
    if (day > toDay) break;
    if (day >= fromDay) {
      // Which scheduled dose after the one before this is: 0 means a second dose inside the same interval.
      const steps = last === null ? 1 : Math.round((at - last) / gap);
      if (steps >= 1) n += 1;
      // A longer gap: the scheduled doses in between were passed over. The last of the `steps` is this dose itself.
      if (last !== null && steps > 1) n += passedOver(last, last + (steps - 0.5) * gap);
    }
    last = at;
  }
  // Since the last dose, one more comes due each time another interval has run out.
  if (last !== null) n += passedOver(last, Infinity);
  return n;
}

export function weeklySummary(input: WeeklyInput): WeeklySummary {
  const { tz, dayStartHour } = input;
  const key = (ms: number) => dayKey(ms, tz, dayStartHour);
  const toDay = key(input.nowMs);
  let fromDay = shiftDayKey(toDay, -(SUMMARY_DAYS - 1));
  if (input.sinceMs !== null) {
    const since = key(input.sinceMs);
    // A start in the future (a wrong clock) is treated as today.
    if (since > fromDay) fromDay = since > toDay ? toDay : since;
  }
  const days = dayDiff(fromDay, toDay) + 1;
  const inRange = (ms: number) => {
    const k = key(ms);
    return k >= fromDay && k <= toDay;
  };

  const weights = input.weights.filter((w) => inRange(w.atMs)).sort((a, b) => a.atMs - b.atMs);
  const two = weights.length >= 2;
  return {
    fromDay,
    toDay,
    days,
    dosesLogged: input.doseTimes.filter(inRange).length,
    dosesScheduled: input.schedule && input.active ? scheduledSoFar({ schedule: input.schedule, fromDay, toDay, nowMs: input.nowMs, tz, dayStartHour, doseTimes: input.doseTimes }) : null,
    weighIns: weights.length,
    firstWeightKg: two ? weights[0].kg : null,
    lastWeightKg: two ? weights[weights.length - 1].kg : null,
    symptomDays: new Set(input.symptomTimes.filter(inRange).map(key)).size,
  };
}

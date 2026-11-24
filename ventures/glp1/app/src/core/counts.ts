/**
 * Anonymous counting: what is counted, and the few messages that may be sent about it.
 *
 * Everything here is worked out on the phone, from records that stay on the phone. A message
 * says that something happened ("activated"), never what was logged. The complete list of
 * messages is the type CountEvent below; nothing else is ever sent.
 *
 * Definitions. "Logged" always means the moment a dose was entered in the app (its createdAt),
 * not the time the person says they took it: a dose from last week that is filled in today is
 * logged today. Days are calendar days on the local clock, with the person's own start of day,
 * so a weekly shot taken a little earlier or later on its usual day still falls in the right
 * week. The time zone and start of day are the ones the phone had at the first look for this
 * install id; they are kept with the progress and used from then on. So travel, a new time zone
 * or a new start of day cannot move a dose into another day or week once counting has begun,
 * and cannot make an event go out twice or not at all. The time zone itself is never sent.
 *
 * - New dose: a dose entered with the app after setup was finished, and taken on the day setup
 *   was finished or later. The last dose that setup asks about (source 'import') is not one.
 *   Neither is a row that came with a restored backup (it was entered before this setup), nor
 *   an older dose that is filled in afterwards with a dose time before the setup day.
 * - Activated: a new dose was logged on the day setup was finished or on one of the 8 days
 *   after it. Day 1 after activation is the day that dose was logged.
 * - Logged this week: at least one new dose logged in that week after activation. Week 1 is
 *   days 1 to 7, week 2 is days 8 to 14, and so on.
 * - Week-2 active: a new dose logged on days 8 to 14 after activation.
 * - Four-week streak met, looking at days 1 to 28 after activation:
 *     - daily schedule: in at least 3 of the 4 weeks, a dose was logged on at least 4 days;
 *     - any other schedule: the 28 days are split into the schedule's own intervals (weekly:
 *       the four weeks). Each interval stands for one scheduled dose, and it is covered when a
 *       dose was logged in it. The streak is met when three quarters of the scheduled doses are
 *       covered (weekly: 3 of 4). Several doses in one interval cover one scheduled dose, so
 *       the streak cannot be met before the last interval it needs has begun. A schedule that
 *       calls for fewer than two doses in 28 days has no streak.
 *   The streak is decided inside the 28 days and by the schedule that was in force then: the
 *   strictest schedule seen while the 28 days ran. Once they are over it is never looked at
 *   again, so a later change of schedule cannot produce a streak that was not earned.
 *   One exception: when counting starts after the 28 days are over (sharing was turned on
 *   later), no schedule was seen while they ran. The streak is then judged once, at that first
 *   look, by the schedule saved at that moment, so a person who is counted as activated is also
 *   counted for the streak.
 *
 * A message carries the day number since setup (0 = the day setup was finished) instead of a
 * date. It never carries a medication name, a dose, a weight, a symptom, any text the person
 * wrote, a time zone, a locale or a timestamp.
 */
import { intervalHours, type Schedule } from './schedule';
import { cleanSetupAnswers, HEARD_FROM, LOGGED_BEFORE, TIME_ON_MEDICATION, type HeardFrom, type LoggedBefore, type TimeOnMedication } from './setupQuestions';
import { dayDiff, dayKey } from './tz';
import type { CourseStatus, Source } from './types';

/** A new dose counts for activation up to this many days after the day setup was finished. */
export const ACTIVATION_DAYS = 8;
/** The streak looks at this many days, starting with the day of activation. */
export const STREAK_DAYS = 28;
/** A daily schedule: a week counts when a dose was logged on at least this many of its days... */
export const DAILY_DAYS_PER_WEEK = 4;
/** ...and the streak is met when at least this many of the 4 weeks count. */
export const DAILY_WEEKS_NEEDED = 3;
/**
 * After a long time without opening the app, "no dose this week" is reported for the most
 * recent weeks only. Older weeks are left out; a missing week reads as "no" anyway.
 */
export const MAX_WEEKS_BACK = 8;
/** The largest day number a message may carry. */
export const MAX_DAY = 9999;
/** The largest week number a message may carry. */
export const MAX_WEEK = 1500;

export type MedicationForm = 'injection' | 'pill';

/**
 * The address counts are sent to, from the build variable VITE_COUNT_URL. Nothing set means
 * null: the build does not count. It must be an https address (http is accepted for localhost
 * only, for testing) or a path on the app's own site such as "/api/count". Anything else is an
 * error, so a typo cannot quietly send counts somewhere unexpected or nowhere.
 */
export function parseCountUrl(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'string') {
    const url = raw.trim().replace(/\/+$/, '');
    const https = /^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/;
    const localHttp = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[^\s?#]*)?$/;
    const samesitePath = /^\/[^\s/?#][^\s?#]*$/;
    if (https.test(url) || localHttp.test(url) || samesitePath.test(url)) return url;
  }
  throw new Error(`VITE_COUNT_URL must be an https address or a path on the same site, not ${JSON.stringify(raw)}`);
}

/** Every message that can be sent. Each one is sent at most once, except where noted. */
export type CountEvent =
  /** Setup was finished. Carries the three optional answers (null = skipped) and whether the medication is an injection or a pill (null = none chosen). */
  | { event: 'setup_finished'; day: number; timeOnMedication: TimeOnMedication | null; loggedBefore: LoggedBefore | null; heardFrom: HeardFrom | null; form: MedicationForm | null }
  | { event: 'activated'; day: number }
  /** Once for each week after activation: whether a dose was logged in it. */
  | { event: 'logged_week'; day: number; week: number; logged: boolean }
  | { event: 'week2_active'; day: number }
  | { event: 'four_week_streak'; day: number }
  /** The medication was marked paused or stopped. Sent again if that happens again later. */
  | { event: 'paused_or_stopped'; day: number }
  /** The person tapped "I would want this" about Pro. */
  | { event: 'wants_pro'; day: number };

export type CountEventName = CountEvent['event'];

export const COUNT_EVENT_NAMES: readonly CountEventName[] = ['setup_finished', 'activated', 'logged_week', 'week2_active', 'four_week_streak', 'paused_or_stopped', 'wants_pro'];

/** A message as it is sent: the event, plus the two fields every message carries. */
export type CountMessage = CountEvent & {
  /** A random id made on the phone when the person said yes. It is thrown away when they turn counting off. */
  installId: string;
  appVersion: string;
};

// ── The exact shape of a message ─────────────────────────────────────────────

/** The fields every message has. */
const COMMON_FIELDS = ['installId', 'appVersion', 'event', 'day'] as const;
/** The fields an event has besides those. A message with any other field is not a message. */
const EVENT_FIELDS: Record<CountEventName, readonly string[]> = {
  setup_finished: ['timeOnMedication', 'loggedBefore', 'heardFrom', 'form'],
  activated: [],
  logged_week: ['week', 'logged'],
  week2_active: [],
  four_week_streak: [],
  paused_or_stopped: [],
  wants_pro: [],
};
const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const APP_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/** An install id is a random UUID as crypto.randomUUID() writes it, and nothing else. */
export function isInstallId(v: unknown): v is string {
  return typeof v === 'string' && INSTALL_ID.test(v);
}

const isWhole = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const listedOrNull = (list: readonly string[], v: unknown) => v === null || (typeof v === 'string' && list.includes(v));

/**
 * Reads a message strictly. It returns the message, rebuilt from its known fields, or null if
 * the input is anything else: a field too many or too few, a value outside its list or range,
 * a wrong type. The phone checks every message with this before it is queued, and the server
 * checks it again before it is stored, so the two cannot drift apart.
 */
export function parseCountMessage(raw: unknown): CountMessage | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.event !== 'string' || !Object.prototype.hasOwnProperty.call(EVENT_FIELDS, r.event)) return null;
  const event = r.event as CountEventName;
  const allowed: readonly string[] = [...COMMON_FIELDS, ...EVENT_FIELDS[event]];
  const keys = Object.keys(r);
  if (keys.length !== allowed.length || !allowed.every((k) => Object.prototype.hasOwnProperty.call(r, k))) return null;
  if (!isInstallId(r.installId) || typeof r.appVersion !== 'string' || !APP_VERSION.test(r.appVersion) || !isWhole(r.day, 0, MAX_DAY)) return null;
  const common = { installId: r.installId, appVersion: r.appVersion, day: r.day };
  if (event === 'setup_finished') {
    if (!listedOrNull(TIME_ON_MEDICATION, r.timeOnMedication) || !listedOrNull(LOGGED_BEFORE, r.loggedBefore) || !listedOrNull(HEARD_FROM, r.heardFrom) || !listedOrNull(['injection', 'pill'], r.form)) return null;
    return { ...common, event, timeOnMedication: r.timeOnMedication as TimeOnMedication | null, loggedBefore: r.loggedBefore as LoggedBefore | null, heardFrom: r.heardFrom as HeardFrom | null, form: r.form as MedicationForm | null };
  }
  if (event === 'logged_week') {
    if (!isWhole(r.week, 1, MAX_WEEK) || typeof r.logged !== 'boolean') return null;
    return { ...common, event, week: r.week, logged: r.logged };
  }
  return { ...common, event };
}

/** A dose row, as far as counting looks at it: when it was entered, when it was taken, and how. */
export interface LoggedDose {
  createdAt: number;
  /** When the person says the dose was taken. */
  occurredAt: number;
  source: Source;
}

/** The phone's time zone and the person's start of day. Used on the phone only. */
export interface DayClock {
  tz: string;
  dayStartHour: number;
}

/** Whole calendar days from the day of `fromMs` to the day of `toMs`. */
export function daysBetween(fromMs: number, toMs: number, clock: DayClock): number {
  return dayDiff(dayKey(fromMs, clock.tz, clock.dayStartHour), dayKey(toMs, clock.tz, clock.dayStartHour));
}

/**
 * When each new dose was logged, earliest first. A new dose was entered after setup and taken on
 * the setup day or later; an older dose filled in afterwards is not one.
 */
export function newDoseTimes(doses: LoggedDose[], setupDoneAt: number, clock: DayClock): number[] {
  return doses
    .filter((d) => d.source !== 'import' && d.createdAt >= setupDoneAt && daysBetween(setupDoneAt, d.occurredAt, clock) >= 0)
    .map((d) => d.createdAt)
    .sort((a, b) => a - b);
}

/**
 * When the person was activated: the moment their first new dose was logged, if that was on
 * the day setup was finished or one of the 8 days after it. Otherwise null.
 */
export function activatedAt(doses: LoggedDose[], setupDoneAt: number, clock: DayClock): number | null {
  const first = newDoseTimes(doses, setupDoneAt, clock)[0];
  if (first === undefined) return null;
  return daysBetween(setupDoneAt, first, clock) <= ACTIVATION_DAYS ? first : null;
}

/** The week after activation a day falls in. `day` is 1 for the day of activation. */
export function weekOfDay(day: number): number {
  return Math.floor((day - 1) / 7) + 1;
}

/**
 * Days after activation on which a new dose was logged, each day once, in order.
 * Day 1 is the day of activation.
 */
export function loggedDays(times: number[], activated: number, clock: DayClock): number[] {
  const days = new Set<number>();
  for (const t of times) {
    const day = daysBetween(activated, t, clock) + 1;
    if (day >= 1) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

/** Whether a schedule is "daily" for the streak rule: a dose every day, however it was set up. */
export function isDailySchedule(s: Schedule): boolean {
  return intervalHours(s) <= 24;
}

/** The doses a schedule calls for in the 28 days, counting the one on day 1 (weekly: 4). */
export function streakDosesCalled(s: Schedule): number {
  return Math.ceil((STREAK_DAYS * 24) / intervalHours(s));
}

/**
 * How many scheduled doses must be covered for the streak, for a schedule that is not daily:
 * three quarters of the doses it calls for in 28 days, rounded up (weekly: 3 of 4). Null for a
 * schedule that calls for fewer than two doses in 28 days: one dose is not a streak.
 */
export function streakDosesNeeded(s: Schedule): number | null {
  const called = streakDosesCalled(s);
  return called < 2 ? null : Math.ceil((called * 3) / 4);
}

/**
 * Which of the schedule's own intervals a day after activation falls in. Interval 1 starts on
 * day 1 and each interval is as long as the schedule's gap between doses (weekly: days 1 to 7
 * are interval 1, days 8 to 14 interval 2).
 */
export function scheduledDoseOfDay(day: number, s: Schedule): number {
  return Math.floor(((day - 1) * 24) / intervalHours(s)) + 1;
}

/**
 * The day (1 to 28 after activation) on which the four-week streak was met, or null if it has
 * not been met. `days` is the output of loggedDays.
 */
export function streakMetOnDay(days: number[], s: Schedule): number | null {
  const inWindow = days.filter((d) => d >= 1 && d <= STREAK_DAYS).sort((a, b) => a - b);
  if (!isDailySchedule(s)) {
    const needed = streakDosesNeeded(s);
    if (needed === null) return null;
    // A scheduled dose is covered when a dose was logged in its interval. Extra doses in the
    // same interval cover nothing more, so the count cannot run ahead of the schedule.
    const covered = new Set<number>();
    for (const day of inWindow) {
      covered.add(scheduledDoseOfDay(day, s));
      if (covered.size >= needed) return day;
    }
    return null;
  }
  // For each of the 4 weeks: the day it reached its 4th day with a dose, if it did.
  const reached: number[] = [];
  for (let week = 1; week <= STREAK_DAYS / 7; week++) {
    const inWeek = inWindow.filter((d) => weekOfDay(d) === week);
    if (inWeek.length >= DAILY_DAYS_PER_WEEK) reached.push(inWeek[DAILY_DAYS_PER_WEEK - 1]);
  }
  return reached.length >= DAILY_WEEKS_NEEDED ? reached[DAILY_WEEKS_NEEDED - 1] : null;
}

/** What has already been put in the queue for this install id. Kept on the phone. */
export interface CountProgress {
  setupSent: boolean;
  /** Set when "activated" is queued. The weeks are counted from this moment from then on. */
  activatedAt: number | null;
  /** Weeks 1 to this number have had their "logged this week" message. */
  weeksSent: number;
  week2Sent: boolean;
  streakSent: boolean;
  /**
   * The gap between doses, in hours, of the strictest schedule seen while the 28 days of the
   * streak ran. The streak is judged by it, not by whatever schedule is saved later.
   */
  streakHours: number | null;
  /** True once the 28 days of the streak are over. The streak is not looked at again. */
  streakOver: boolean;
  /** True while the present paused or stopped status has been reported. */
  pausedSent: boolean;
  proSent: boolean;
  /** The clock at the last check after activation, to notice a clock that ran ahead and was put right. */
  lastSeenMs: number | null;
  /** The time zone and start of day at the first look. Every day is counted on this clock from then on. */
  clock: DayClock | null;
}

export const NO_PROGRESS: CountProgress = {
  setupSent: false,
  activatedAt: null,
  weeksSent: 0,
  week2Sent: false,
  streakSent: false,
  streakHours: null,
  streakOver: false,
  pausedSent: false,
  proSent: false,
  lastSeenMs: null,
  clock: null,
};

/** Everything the phone looks at to decide which messages are due. None of it is sent as it is. */
export interface CountFacts extends DayClock {
  nowMs: number;
  /** When setup was first finished on this phone. */
  setupDoneAt: number;
  /** The saved answers to the three setup questions, as stored. They are cleaned before use. */
  answers: unknown;
  form: MedicationForm | null;
  schedule: Schedule | null;
  status: CourseStatus | null;
  /** The dose rows that are not deleted. */
  doses: LoggedDose[];
  /** When "I would want this" was tapped while counting was on, or null. */
  wantsProAt: number | null;
}

const clampDay = (n: number) => Math.min(MAX_DAY, Math.max(0, n));

/**
 * The messages that are due now and have not been queued yet, with the progress to save once
 * they are queued. Calling it again with that progress and the same facts returns nothing.
 */
export function dueCounts(f: CountFacts, done: CountProgress): { events: CountEvent[]; progress: CountProgress } {
  const events: CountEvent[] = [];
  // Progress saved by an earlier version may lack the newer fields.
  const p: CountProgress = { ...NO_PROGRESS, ...done };
  // The clock is fixed at the first look, so a later change of time zone or start of day moves nothing.
  if (p.clock === null) p.clock = { tz: f.tz, dayStartHour: f.dayStartHour };
  const clock: DayClock = p.clock;
  /** Day number since setup: 0 on the day setup was finished. */
  const dayOf = (ms: number) => clampDay(daysBetween(f.setupDoneAt, ms, clock));

  if (!p.setupSent) {
    events.push({ event: 'setup_finished', day: 0, ...cleanSetupAnswers(f.answers), form: f.form });
    p.setupSent = true;
  }

  const times = newDoseTimes(f.doses, f.setupDoneAt, clock);
  /** Whether activation was already known before this look. */
  const seenBefore = p.activatedAt !== null;
  if (p.activatedAt === null) {
    const at = activatedAt(f.doses, f.setupDoneAt, clock);
    if (at !== null) {
      events.push({ event: 'activated', day: dayOf(at) });
      p.activatedAt = at;
    }
  }

  if (p.activatedAt !== null) {
    const activated = p.activatedAt;
    /** The first new dose logged on days `from` to `to` after activation. */
    const firstIn = (from: number, to: number) =>
      times.find((t) => {
        const day = daysBetween(activated, t, clock) + 1;
        return day >= from && day <= to;
      });
    const today = daysBetween(activated, f.nowMs, clock) + 1;
    const thisWeek = weekOfDay(today);

    // A clock that ran ahead and was put right again: while it was ahead, weeks that had not
    // happened yet were reported (as "no"). Those weeks are reported again as they really come.
    // The server keeps both rows; the later row for a week is the true one.
    if (p.lastSeenMs !== null && f.nowMs < p.lastSeenMs && thisWeek < weekOfDay(daysBetween(activated, p.lastSeenMs, clock) + 1)) {
      p.weeksSent = Math.max(0, Math.min(p.weeksSent, thisWeek - 1));
      p.streakOver = false;
    }
    p.lastSeenMs = f.nowMs;

    let week = p.weeksSent + 1;
    if (thisWeek - week > MAX_WEEKS_BACK) week = thisWeek - MAX_WEEKS_BACK;
    for (; week <= thisWeek; week++) {
      const lastDay = week * 7;
      const first = firstIn(lastDay - 6, lastDay);
      if (first !== undefined) events.push({ event: 'logged_week', day: dayOf(first), week, logged: true });
      // A week without a dose is reported once it is over. This week can still get one.
      else if (week < thisWeek) events.push({ event: 'logged_week', day: clampDay(dayOf(activated) + lastDay - 1), week, logged: false });
      else break;
      p.weeksSent = week;
    }

    if (!p.week2Sent) {
      const first = firstIn(8, 14);
      if (first !== undefined) {
        events.push({ event: 'week2_active', day: dayOf(first) });
        p.week2Sent = true;
      }
    }

    if (!p.streakSent && !p.streakOver) {
      const running = today >= 1 && today <= STREAK_DAYS;
      // While the 28 days run, remember the strictest schedule seen. The streak is judged by it.
      if (running && f.schedule) p.streakHours = Math.min(p.streakHours ?? Infinity, intervalHours(f.schedule));
      // Counting starts only now, after the 28 days: the schedule saved now is the only one known.
      if (!seenBefore && today > STREAK_DAYS && f.schedule) p.streakHours = intervalHours(f.schedule);
      // Without a schedule seen inside the 28 days the streak is not decided at all.
      if (p.streakHours !== null) {
        const met = streakMetOnDay(loggedDays(times, activated, clock), { kind: 'interval', hours: p.streakHours });
        if (met !== null) {
          events.push({ event: 'four_week_streak', day: clampDay(dayOf(activated) + met - 1) });
          p.streakSent = true;
        }
      }
      // The 28 days are over: this was the last look.
      if (today > STREAK_DAYS) p.streakOver = true;
    }
  }

  const off = f.status === 'paused' || f.status === 'stopped';
  if (off && !p.pausedSent) {
    events.push({ event: 'paused_or_stopped', day: dayOf(f.nowMs) });
    p.pausedSent = true;
  } else if (!off) {
    // Marking it paused or stopped again later is a new event.
    p.pausedSent = false;
  }

  if (f.wantsProAt !== null && !p.proSent) {
    events.push({ event: 'wants_pro', day: dayOf(f.wantsProAt) });
    p.proSent = true;
  }

  return { events, progress: p };
}

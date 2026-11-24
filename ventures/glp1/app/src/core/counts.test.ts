import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_DAYS,
  activatedAt,
  COUNT_EVENT_NAMES,
  dueCounts,
  isDailySchedule,
  isInstallId,
  loggedDays,
  MAX_WEEKS_BACK,
  newDoseTimes,
  NO_PROGRESS,
  parseCountMessage,
  parseCountUrl,
  scheduledDoseOfDay,
  streakDosesCalled,
  streakDosesNeeded,
  streakMetOnDay,
  weekOfDay,
  type CountEvent,
  type CountFacts,
  type CountProgress,
  type DayClock,
  type LoggedDose,
} from './counts';
import type { Schedule } from './schedule';
import { addDays, zonedToUtc } from './tz';

const NY = 'America/New_York';
const clock: DayClock = { tz: NY, dayStartHour: 4 };

/**
 * A moment `day` calendar days after the day setup was finished (Monday, March 2, 2026), at the
 * given local time. US clocks change on March 8, so the days around it are not 24 hours long.
 */
function on(day: number, hour = 12, minute = 0): number {
  const d = addDays(2026, 3, 2, day);
  return zonedToUtc(d.year, d.month, d.day, hour, minute, NY);
}
const SETUP = on(0, 10);
/** A dose entered at `at`, with the same moment as its dose time. */
const logged = (at: number): LoggedDose => ({ createdAt: at, occurredAt: at, source: 'manual' });
/** A dose entered at `at` with another dose time: filled in after the fact. */
const filledIn = (at: number, takenAt: number): LoggedDose => ({ createdAt: at, occurredAt: takenAt, source: 'manual' });
const WEEKLY: Schedule = { kind: 'weekly', weekday: 1, time: '21:00' };
const DAILY: Schedule = { kind: 'daily', time: '08:00' };
const every = (days: number): Schedule => ({ kind: 'interval', hours: days * 24 });

function facts(over: Partial<CountFacts> = {}): CountFacts {
  return { nowMs: on(0, 11), ...clock, setupDoneAt: SETUP, answers: undefined, form: 'injection', schedule: WEEKLY, status: 'escalating', doses: [], wantsProAt: null, ...over };
}
const names = (events: CountEvent[]) => events.map((e) => e.event);
/** Runs dueCounts at several moments in a row, carrying the progress along, as the app does. */
function run(steps: Partial<CountFacts>[], start: CountProgress = NO_PROGRESS): { events: CountEvent[]; progress: CountProgress } {
  let progress = start;
  const events: CountEvent[] = [];
  for (const step of steps) {
    const out = dueCounts(facts(step), progress);
    events.push(...out.events);
    progress = out.progress;
  }
  return { events, progress };
}

describe('new doses', () => {
  it('are doses entered with the app after setup: not the one setup asks about, and not restored rows', () => {
    const doses: LoggedDose[] = [
      { createdAt: SETUP + 5, occurredAt: on(-2), source: 'import' }, // the last dose, entered during setup
      { createdAt: SETUP - 86_400_000, occurredAt: SETUP - 86_400_000, source: 'manual' }, // came with a restored backup
      { createdAt: on(3), occurredAt: on(3), source: 'quick' },
      { createdAt: on(1), occurredAt: on(1), source: 'manual' },
      { createdAt: SETUP, occurredAt: SETUP, source: 'text' },
    ];
    expect(newDoseTimes(doses, SETUP, clock)).toEqual([SETUP, on(1), on(3)]);
  });

  it('an older dose filled in after setup is not a new dose: its dose time is before the setup day', () => {
    // Entered on the setup day and the day after, but taken three weeks and one day before setup.
    expect(newDoseTimes([filledIn(on(0, 15), on(-21)), filledIn(on(1, 9), on(-1, 20))], SETUP, clock)).toEqual([]);
    // Taken earlier on the setup day itself, before setup was finished: that day counts.
    expect(newDoseTimes([filledIn(on(0, 15), on(0, 8))], SETUP, clock)).toEqual([on(0, 15)]);
    // The person's day starts at 4:00, so 3:59 that morning still belongs to the day before.
    expect(newDoseTimes([filledIn(on(0, 15), on(0, 3, 59))], SETUP, clock)).toEqual([]);
    expect(newDoseTimes([filledIn(on(0, 15), on(0, 4, 0))], SETUP, clock)).toEqual([on(0, 15)]);
    // A dose from the days after setup that is entered late is a new dose, counted when it was entered.
    expect(newDoseTimes([filledIn(on(9, 10), on(7, 21))], SETUP, clock)).toEqual([on(9, 10)]);
  });

  it('filling in old doses sends nothing: no "activated", no "logged this week", no week 2, no streak', () => {
    const old = [filledIn(on(0, 15), on(-20)), filledIn(on(8, 9), on(-13)), filledIn(on(15, 9), on(-6)), filledIn(on(22, 9), on(-1))];
    const out = run([{ nowMs: on(0, 16), doses: old.slice(0, 1) }, { nowMs: on(8, 10), doses: old.slice(0, 2) }, { nowMs: on(23), doses: old }]);
    expect(names(out.events)).toEqual(['setup_finished']);
    expect(out.progress.activatedAt).toBeNull();
    // With a real first dose the filled-in ones still count for nothing: only week 1 has a dose.
    const real = logged(on(1, 21));
    const mixed = run([{ nowMs: on(1, 22), doses: [real] }, { nowMs: on(23), doses: [real, ...old] }]);
    expect(mixed.events.filter((e) => e.event === 'logged_week')).toEqual([
      { event: 'logged_week', day: 1, week: 1, logged: true },
      { event: 'logged_week', day: 14, week: 2, logged: false },
      { event: 'logged_week', day: 21, week: 3, logged: false },
    ]);
    expect(names(mixed.events)).not.toContain('week2_active');
    expect(names(mixed.events)).not.toContain('four_week_streak');
  });
});

describe('activated', () => {
  it('needs a new dose: the dose back-filled during setup does not count', () => {
    expect(activatedAt([], SETUP, clock)).toBeNull();
    expect(activatedAt([{ createdAt: SETUP + 1000, occurredAt: on(-2), source: 'import' }], SETUP, clock)).toBeNull();
    expect(activatedAt([{ createdAt: SETUP + 1000, occurredAt: on(-2), source: 'import' }, logged(on(2))], SETUP, clock)).toBe(on(2));
  });

  it('counts a dose logged on the day of setup, from the same moment on', () => {
    expect(activatedAt([logged(SETUP)], SETUP, clock)).toBe(SETUP);
    expect(activatedAt([logged(SETUP - 1)], SETUP, clock)).toBeNull();
  });

  it('counts up to the end of the 8th day after setup, and not a minute longer', () => {
    expect(ACTIVATION_DAYS).toBe(8);
    expect(activatedAt([logged(on(8, 0, 0))], SETUP, clock)).toBe(on(8, 0, 0));
    expect(activatedAt([logged(on(8, 23, 59))], SETUP, clock)).toBe(on(8, 23, 59));
    // The person's day starts at 4:00, so 3:59 the next morning is still day 8.
    expect(activatedAt([logged(on(9, 3, 59))], SETUP, clock)).toBe(on(9, 3, 59));
    expect(activatedAt([logged(on(9, 4, 0))], SETUP, clock)).toBeNull();
    // With a day that starts at midnight, day 8 ends at midnight.
    expect(activatedAt([logged(on(8, 23, 59))], SETUP, { tz: NY, dayStartHour: 0 })).toBe(on(8, 23, 59));
    expect(activatedAt([logged(on(9, 0, 0))], SETUP, { tz: NY, dayStartHour: 0 })).toBeNull();
  });

  it('is decided by the first new dose: a late first dose is not made good by later ones', () => {
    expect(activatedAt([logged(on(9, 12)), logged(on(10)), logged(on(16))], SETUP, clock)).toBeNull();
    const out = run([{ nowMs: on(30), doses: [logged(on(9, 12)), logged(on(16)), logged(on(23))] }]);
    expect(names(out.events)).toEqual(['setup_finished']);
  });

  it('is reported once, with the day number since setup instead of a date', () => {
    const out = run([{ nowMs: on(3, 13), doses: [logged(on(3))] }, { nowMs: on(3, 14), doses: [logged(on(3))] }]);
    expect(out.events.filter((e) => e.event === 'activated')).toEqual([{ event: 'activated', day: 3 }]);
    expect(out.progress.activatedAt).toBe(on(3));
  });
});

describe('weeks after activation', () => {
  it('day 1 is the day of activation; week 1 is days 1 to 7, week 2 is days 8 to 14', () => {
    expect([1, 7, 8, 14, 15, 28, 29].map(weekOfDay)).toEqual([1, 1, 2, 2, 3, 4, 5]);
    // Activated on day 3 after setup, in the evening. The clock change on March 8 does not move a day.
    const activated = on(3, 21);
    expect(loggedDays([activated, on(3, 23), on(4, 3), on(4, 4), on(10, 9), on(2)], activated, clock)).toEqual([1, 2, 8]);
  });
});

describe('logged this week', () => {
  const activated = on(1, 21);
  const first = logged(activated);

  it('week 1 is reported with the activating dose', () => {
    const out = run([{ nowMs: on(1, 22), doses: [first] }]);
    expect(out.events).toEqual([
      { event: 'setup_finished', day: 0, timeOnMedication: null, loggedBefore: null, heardFrom: null, form: 'injection' },
      { event: 'activated', day: 1 },
      { event: 'logged_week', day: 1, week: 1, logged: true },
    ]);
  });

  it('a week with a dose is reported as soon as the dose is logged, and only once', () => {
    // Week 2 is days 8 to 14 after activation: days 8 to 14 since setup here, because activation was on day 1 since setup.
    const second = logged(on(9, 20));
    const out = run([{ nowMs: on(1, 22), doses: [first] }, { nowMs: on(9, 19), doses: [first] }, { nowMs: on(9, 21), doses: [first, second] }, { nowMs: on(12), doses: [first, second, logged(on(11))] }]);
    expect(out.events.filter((e) => e.event === 'logged_week')).toEqual([
      { event: 'logged_week', day: 1, week: 1, logged: true },
      { event: 'logged_week', day: 9, week: 2, logged: true },
    ]);
  });

  it('a week without a dose is reported as "no" once it is over, not before', () => {
    // Week 2 ends with day 14 after activation, which is day 14 since setup.
    const lastDayOfWeek2 = run([{ nowMs: on(1, 22), doses: [first] }, { nowMs: on(14, 23), doses: [first] }]);
    expect(lastDayOfWeek2.events.filter((e) => e.event === 'logged_week')).toHaveLength(1);
    const dayAfter = run([{ nowMs: on(1, 22), doses: [first] }, { nowMs: on(15, 4), doses: [first] }]);
    expect(dayAfter.events.filter((e) => e.event === 'logged_week')).toEqual([
      { event: 'logged_week', day: 1, week: 1, logged: true },
      { event: 'logged_week', day: 14, week: 2, logged: false },
    ]);
  });

  it('the week is decided by the day the dose was logged: day 7 is still week 1', () => {
    const out = run([{ nowMs: on(40), doses: [first, logged(on(7, 12)), logged(on(22, 12))] }]);
    // Days since setup 7 and 22 are days 7 and 22 after activation: weeks 1 and 4.
    expect(out.events.filter((e) => e.event === 'logged_week').map((e) => (e.event === 'logged_week' ? [e.week, e.logged] : null))).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [4, true],
      [5, false],
    ]);
  });

  it('after a long time away, only the most recent weeks are reported', () => {
    const out = run([{ nowMs: on(1, 22), doses: [first] }, { nowMs: on(1 + 7 * 30), doses: [first] }]);
    const weeks = out.events.flatMap((e) => (e.event === 'logged_week' ? [e.week] : []));
    // Today is in week 31. Week 1 was reported at the time; weeks 23 to 30 are reported now, and week 31 is not over.
    expect(weeks).toEqual([1, ...Array.from({ length: MAX_WEEKS_BACK }, (_, i) => 31 - MAX_WEEKS_BACK + i)]);
    expect(out.progress.weeksSent).toBe(30);
  });

  it('nothing is reported for weeks before activation, or without activation', () => {
    const out = run([{ nowMs: on(60), doses: [] }]);
    expect(names(out.events)).toEqual(['setup_finished']);
  });
});

describe('week-2 active', () => {
  const first = logged(on(0, 12));
  const week2 = (extra: number[]) => names(run([{ nowMs: on(40), doses: [first, ...extra.map(logged)] }]).events).includes('week2_active');

  it('is a dose logged on days 8 to 14 after activation', () => {
    // Activation is on the day of setup, so day N after activation is day N - 1 since setup.
    expect(week2([on(6, 23)])).toBe(false); // day 7
    expect(week2([on(7, 4)])).toBe(true); // day 8, first minute
    expect(week2([on(7, 3, 59)])).toBe(false); // still day 7: the day starts at 4:00
    expect(week2([on(13, 23)])).toBe(true); // day 14
    expect(week2([on(14, 3, 59)])).toBe(true); // day 14, last minute
    expect(week2([on(14, 4)])).toBe(false); // day 15
    expect(week2([])).toBe(false);
  });

  it('is reported once, on the day of the first such dose', () => {
    const out = run([{ nowMs: on(9), doses: [first, logged(on(8))] }, { nowMs: on(12), doses: [first, logged(on(8)), logged(on(11))] }]);
    expect(out.events.filter((e) => e.event === 'week2_active')).toEqual([{ event: 'week2_active', day: 8 }]);
  });
});

describe('four-week streak', () => {
  it('a weekly schedule calls for 4 doses in 28 days, one in each week, and 3 of them must be covered', () => {
    expect(streakDosesCalled(WEEKLY)).toBe(4);
    expect(streakDosesNeeded(WEEKLY)).toBe(3);
    expect([1, 7, 8, 14, 15, 21, 22, 28].map((d) => scheduledDoseOfDay(d, WEEKLY))).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(streakMetOnDay([1, 8], WEEKLY)).toBeNull();
    expect(streakMetOnDay([1, 8, 15], WEEKLY)).toBe(15);
    expect(streakMetOnDay([1, 8, 28], WEEKLY)).toBe(28);
    // Day 29 is outside the 28 days.
    expect(streakMetOnDay([1, 8, 29], WEEKLY)).toBeNull();
  });

  it('counts scheduled doses that were covered, not days with an entry: several doses in one week cover one', () => {
    // Three entries on the first three days are one week of a weekly schedule, not a streak.
    expect(streakMetOnDay([1, 2, 3], WEEKLY)).toBeNull();
    expect(streakMetOnDay([1, 2, 3, 4, 5, 6, 7], WEEKLY)).toBeNull();
    // Two shots a week for two weeks cover two scheduled doses.
    expect(streakMetOnDay([1, 4, 8], WEEKLY)).toBeNull();
    expect(streakMetOnDay([1, 4, 8, 11], WEEKLY)).toBeNull();
    // Days 22 and 28 are both in week 4: with day 1 that is two weeks covered, not three.
    expect(streakMetOnDay([1, 22, 28, 29], WEEKLY)).toBeNull();
    expect(streakMetOnDay([1, 15, 22, 28], WEEKLY)).toBe(22);
    // It can never be met before the third week has begun.
    for (const days of [[1, 2, 14], [1, 8, 9, 10, 14], [3, 5, 7, 9, 11, 13]]) expect(streakMetOnDay(days, WEEKLY), days.join()).toBeNull();
    // The order the days are given in does not matter.
    expect(streakMetOnDay([15, 1, 8], WEEKLY)).toBe(15);
  });

  it('other schedules need three quarters of the doses they call for, rounded up, each in its own interval', () => {
    expect([2, 3, 7, 10, 14].map((d) => streakDosesCalled(every(d)))).toEqual([14, 10, 4, 3, 2]);
    expect([2, 3, 7, 10, 14].map((d) => streakDosesNeeded(every(d)))).toEqual([11, 8, 3, 3, 2]);
    const everyThree = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28];
    expect(streakMetOnDay(everyThree, every(3))).toBe(22);
    expect(streakMetOnDay(everyThree.slice(0, 7), every(3))).toBeNull();
    // Every 14 days: both halves of the 28 days need a dose. Two entries in the first half are not enough.
    expect(streakMetOnDay([1, 2], every(14))).toBeNull();
    expect(streakMetOnDay([1, 14], every(14))).toBeNull();
    expect(streakMetOnDay([1, 15], every(14))).toBe(15);
    // Every 10 days: days 1 to 10, 11 to 20 and 21 to 28, and all three are needed.
    expect(streakMetOnDay([1, 11], every(10))).toBeNull();
    expect(streakMetOnDay([1, 11, 20], every(10))).toBeNull();
    expect(streakMetOnDay([1, 11, 21], every(10))).toBe(21);
    // Every 3.5 days (twice a week): 8 doses, 6 needed.
    expect(streakDosesNeeded({ kind: 'interval', hours: 84 })).toBe(6);
  });

  it('a schedule that calls for fewer than two doses in 28 days has no streak: one dose is not a streak', () => {
    for (const days of [28, 30, 60]) {
      expect(streakDosesNeeded(every(days)), String(days)).toBeNull();
      expect(streakMetOnDay([1], every(days)), String(days)).toBeNull();
      expect(streakMetOnDay(Array.from({ length: 28 }, (_, i) => i + 1), every(days)), String(days)).toBeNull();
    }
    // The activating dose alone sends no streak.
    const out = run([{ nowMs: on(0, 13), doses: [logged(on(0, 12))], schedule: every(30) }, { nowMs: on(40), doses: [logged(on(0, 12))], schedule: every(30) }]);
    expect(names(out.events)).not.toContain('four_week_streak');
  });

  it('a daily schedule needs a dose logged on at least 4 days in at least 3 of the 4 weeks', () => {
    expect(isDailySchedule(DAILY)).toBe(true);
    expect(isDailySchedule(every(1))).toBe(true);
    expect(isDailySchedule(every(2))).toBe(false);
    expect(isDailySchedule(WEEKLY)).toBe(false);
    const week = (n: number, days: number[]) => days.map((d) => (n - 1) * 7 + d);
    // 4 days in weeks 1, 2 and 4: met on the 4th day of the third such week.
    expect(streakMetOnDay([...week(1, [1, 2, 3, 4]), ...week(2, [1, 3, 5, 7]), ...week(3, [1, 2, 3]), ...week(4, [2, 3, 4, 6])], DAILY)).toBe(27);
    // 3 days are not enough for a week.
    expect(streakMetOnDay([...week(1, [1, 2, 3, 4]), ...week(2, [1, 3, 5, 7]), ...week(3, [1, 2, 3]), ...week(4, [2, 3, 4])], DAILY)).toBeNull();
    // Two good weeks are not enough, however many days they have.
    expect(streakMetOnDay([...week(1, [1, 2, 3, 4, 5, 6, 7]), ...week(2, [1, 2, 3, 4, 5, 6, 7]), ...week(3, [1, 2, 3])], DAILY)).toBeNull();
    // Every day: met on the 4th day of week 3.
    expect(streakMetOnDay(Array.from({ length: 28 }, (_, i) => i + 1), DAILY)).toBe(18);
    // "Every 1 day" is the same rule.
    expect(streakMetOnDay(Array.from({ length: 28 }, (_, i) => i + 1), every(1))).toBe(18);
    // A weekly logger does not meet the daily rule.
    expect(streakMetOnDay([1, 8, 15, 22], DAILY)).toBeNull();
  });

  it('two doses logged on one day count as one day', () => {
    const first = logged(on(0, 12));
    const twice = run([{ nowMs: on(27), doses: [first, logged(on(0, 13)), logged(on(7, 12))] }]);
    expect(names(twice.events)).not.toContain('four_week_streak');
    const three = run([{ nowMs: on(27), doses: [first, logged(on(7, 12)), logged(on(14, 12))] }]);
    expect(three.events.filter((e) => e.event === 'four_week_streak')).toEqual([{ event: 'four_week_streak', day: 14 }]);
  });

  it('is reported when it is met and never again; a dose after day 28 does not count', () => {
    const first = logged(on(2, 12));
    const doses = [first, logged(on(9, 12))];
    // Day 29 after activation is day 30 since setup.
    const late = run([{ nowMs: on(40), doses: [...doses, logged(on(30, 12))] }]);
    expect(names(late.events)).not.toContain('four_week_streak');
    // Day 28 after activation is day 29 since setup.
    const inTime = run([{ nowMs: on(29, 13), doses: [...doses, logged(on(29, 12))] }, { nowMs: on(50), doses: [...doses, logged(on(29, 12)), logged(on(45))] }]);
    expect(inTime.events.filter((e) => e.event === 'four_week_streak')).toEqual([{ event: 'four_week_streak', day: 29 }]);
  });

  it('three entries in the first week of a weekly schedule do not send a streak', () => {
    const doses = [logged(on(0, 12)), logged(on(1, 12)), logged(on(2, 12))];
    const out = run([{ nowMs: on(0, 13), doses: doses.slice(0, 1) }, { nowMs: on(1, 13), doses: doses.slice(0, 2) }, { nowMs: on(2, 13), doses }]);
    expect(names(out.events)).toEqual(['setup_finished', 'activated', 'logged_week']);
    // Two more weeks with a dose do.
    const later = [...doses, logged(on(7, 12)), logged(on(14, 12))];
    const full = run([{ nowMs: on(2, 13), doses }, { nowMs: on(7, 13), doses: later.slice(0, 4) }, { nowMs: on(14, 13), doses: later }]);
    expect(full.events.filter((e) => e.event === 'four_week_streak')).toEqual([{ event: 'four_week_streak', day: 14 }]);
  });

  it('is judged by the schedule that was in force: a change to an easier schedule earns nothing', () => {
    // A daily schedule with doses on the first three days, then the schedule is changed to weekly.
    const doses = [logged(on(0, 12)), logged(on(1, 12)), logged(on(2, 12))];
    const daily = run([{ nowMs: on(2, 13), doses, schedule: DAILY }, { nowMs: on(3, 9), doses, schedule: WEEKLY }, { nowMs: on(20), doses, schedule: WEEKLY }]);
    expect(names(daily.events)).not.toContain('four_week_streak');
    expect(daily.progress.streakHours).toBe(24);
    // The strictest schedule seen is kept, whichever came first.
    const loose = run([{ nowMs: on(0, 13), doses: doses.slice(0, 1), schedule: every(14) }, { nowMs: on(1, 13), doses: doses.slice(0, 2), schedule: WEEKLY }, { nowMs: on(2, 13), doses, schedule: every(14) }]);
    expect(loose.progress.streakHours).toBe(168);
  });

  it('is decided inside the 28 days only: once they are over it is never looked at again', () => {
    // Weekly, with a dose in only 2 of the 4 weeks. On day 40 the schedule is changed to every 14 days.
    const doses = [logged(on(0, 12)), logged(on(7, 12))];
    const out = run([
      { nowMs: on(0, 13), doses: doses.slice(0, 1) },
      { nowMs: on(7, 13), doses },
      { nowMs: on(30), doses },
      { nowMs: on(40), doses, schedule: every(14) },
      { nowMs: on(41), doses: [...doses, logged(on(41, 9))], schedule: every(14) },
    ]);
    expect(names(out.events)).not.toContain('four_week_streak');
    expect(out.progress.streakOver).toBe(true);
    expect(out.progress.streakSent).toBe(false);
    // The schedule kept is the one seen during the 28 days.
    expect(out.progress.streakHours).toBe(168);
  });

  it('a streak earned inside the 28 days is still reported if the phone only looks afterwards', () => {
    // The app was closed right after each later dose was entered; the next look is on day 60.
    const doses = [logged(on(0, 12)), logged(on(7, 12)), logged(on(14, 12))];
    const out = run([{ nowMs: on(0, 13), doses: doses.slice(0, 1) }, { nowMs: on(60), doses }, { nowMs: on(61), doses }]);
    expect(out.events.filter((e) => e.event === 'four_week_streak')).toEqual([{ event: 'four_week_streak', day: 14 }]);
    expect(out.progress.streakOver).toBe(true);
  });

  it('when counting starts after the 28 days (sharing turned on late), it is judged once by the schedule saved then', () => {
    // Counting starts on day 40. The person is reported as activated, so the streak is reported too.
    const doses = [logged(on(0, 12)), logged(on(7, 12)), logged(on(14, 12)), logged(on(21, 12))];
    const out = run([{ nowMs: on(40), doses }, { nowMs: on(41), doses }]);
    expect(names(out.events)).toContain('activated');
    expect(out.events.filter((e) => e.event === 'four_week_streak')).toEqual([{ event: 'four_week_streak', day: 14 }]);
    expect(out.progress.streakOver).toBe(true);
    // Not met by the schedule saved then: not reported, and never looked at again.
    const two = doses.slice(0, 2);
    const notMet = run([{ nowMs: on(40), doses: two }, { nowMs: on(41), doses: two, schedule: every(14) }]);
    expect(names(notMet.events)).toContain('activated');
    expect(names(notMet.events)).not.toContain('four_week_streak');
    expect(notMet.progress.streakOver).toBe(true);
    // Without a schedule at that moment it is not decided.
    expect(names(run([{ nowMs: on(40), doses, schedule: null }, { nowMs: on(41), doses }]).events)).not.toContain('four_week_streak');
  });

  it('a schedule that is set only after the 28 days does not decide it when counting ran all along', () => {
    const doses = [logged(on(0, 12)), logged(on(7, 12)), logged(on(14, 12))];
    const out = run([{ nowMs: on(0, 13), doses: doses.slice(0, 1), schedule: null }, { nowMs: on(30), doses, schedule: null }, { nowMs: on(31), doses, schedule: WEEKLY }]);
    expect(names(out.events)).not.toContain('four_week_streak');
  });

  it('uses the person\'s own schedule; without one it is not decided', () => {
    const doses = [logged(on(0, 12)), logged(on(7, 12)), logged(on(14, 12))];
    expect(names(run([{ nowMs: on(20), doses, schedule: WEEKLY }]).events)).toContain('four_week_streak');
    expect(names(run([{ nowMs: on(20), doses, schedule: DAILY }]).events)).not.toContain('four_week_streak');
    expect(names(run([{ nowMs: on(20), doses, schedule: null }]).events)).not.toContain('four_week_streak');
  });
});

describe('the day of an event, in every US time zone and on the days the clocks change', () => {
  const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];
  /** A local time in `tz`, `day` days after the given date. */
  const local = (tz: string, y: number, m: number, d: number, day: number, hour: number, minute = 0) => {
    const x = addDays(y, m, d, day);
    return zonedToUtc(x.year, x.month, x.day, hour, minute, tz);
  };
  /** Runs looks in `tz`, from a setup at 10:00 on the given date. */
  const runIn = (tz: string, setupDoneAt: number, steps: Partial<CountFacts>[]) => run(steps.map((s) => ({ tz, setupDoneAt, ...s })));
  // US clocks go forward on March 8, 2026 and back on November 1, 2026. Both are Sundays.
  const STARTS: [string, number, number, number][] = [
    ['spring', 2026, 3, 2],
    ['fall', 2026, 10, 26],
  ];

  it('a weekly shot at 9 PM gives the same events in every zone, across a clock change', () => {
    for (const tz of ZONES) {
      for (const [name, y, m, d] of STARTS) {
        const setup = local(tz, y, m, d, 0, 10);
        const doses = [1, 8, 15, 22].map((day) => logged(local(tz, y, m, d, day, 21)));
        const steps = Array.from({ length: 30 }, (_, i) => ({ nowMs: local(tz, y, m, d, i + 1, 22), doses: doses.filter((x) => x.createdAt <= local(tz, y, m, d, i + 1, 22)) }));
        const out = runIn(tz, setup, steps);
        expect(out.events.filter((e) => e.event !== 'setup_finished'), `${tz} ${name}`).toEqual([
          { event: 'activated', day: 1 },
          { event: 'logged_week', day: 1, week: 1, logged: true },
          { event: 'logged_week', day: 8, week: 2, logged: true },
          { event: 'week2_active', day: 8 },
          { event: 'logged_week', day: 15, week: 3, logged: true },
          { event: 'four_week_streak', day: 15 },
          { event: 'logged_week', day: 22, week: 4, logged: true },
        ]);
      }
    }
  });

  it('near midnight and at the start of day, the local clock decides the day, also on the days the clocks change', () => {
    // Activated on a Sunday at noon, so day 8 is the Sunday the clocks change.
    const cases: [number, number, number][] = [
      [2026, 3, 1],
      [2026, 10, 25],
    ];
    for (const tz of ZONES) {
      for (const [y, m, d] of cases) {
        const setup = local(tz, y, m, d, 0, 10);
        const first = logged(local(tz, y, m, d, 0, 12));
        const weekOf = (at: number) => {
          const out = runIn(tz, setup, [{ nowMs: local(tz, y, m, d, 0, 13), doses: [first] }, { nowMs: local(tz, y, m, d, 8, 12), doses: [first, logged(at)] }]);
          return out.events.flatMap((e) => (e.event === 'logged_week' && e.logged ? [e.week] : []));
        };
        const label = `${tz} ${y}-${m}-${d}`;
        // The last minute of day 7, just after midnight, and 3:59 the next morning are still day 7 (week 1).
        expect(weekOf(local(tz, y, m, d, 6, 23, 59)), label).toEqual([1]);
        expect(weekOf(local(tz, y, m, d, 7, 0, 1)), label).toEqual([1]);
        expect(weekOf(local(tz, y, m, d, 7, 3, 59)), label).toEqual([1]);
        // From 4:00 on the day the clocks change it is day 8 (week 2), not an hour earlier or later.
        expect(weekOf(local(tz, y, m, d, 7, 4, 0)), label).toEqual([1, 2]);
        expect(weekOf(local(tz, y, m, d, 7, 4, 30)), label).toEqual([1, 2]);
      }
    }
  });

  it('travel, a new time zone or a new start of day moves nothing once counting has begun', () => {
    const NYC = 'America/New_York';
    const setup = local(NYC, 2026, 3, 2, 0, 10);
    // Each dose is early in the morning in New York, which is before 4:00 in Los Angeles and Honolulu:
    // read on their clocks, each would fall a day earlier, and the day-8 dose would move into week 1.
    const doses = [1, 8, 15, 22].map((day) => logged(local(NYC, 2026, 3, 2, day, 5, 30)));
    const looks = Array.from({ length: 30 }, (_, i) => local(NYC, 2026, 3, 2, i + 1, 6));
    const home = run(looks.map((nowMs) => ({ nowMs, tz: NYC, setupDoneAt: setup, doses: doses.filter((x) => x.createdAt <= nowMs) })));
    const away = ['America/Los_Angeles', 'Pacific/Honolulu', 'America/Chicago', NYC];
    const travelling = run(
      looks.map((nowMs, i) => ({ nowMs, tz: i === 0 ? NYC : away[i % away.length], dayStartHour: i > 10 ? 0 : 4, setupDoneAt: setup, doses: doses.filter((x) => x.createdAt <= nowMs) })),
    );
    expect(travelling.events).toEqual(home.events);
    expect(names(home.events)).toContain('week2_active');
    // Every week is reported once, in order, with none left out.
    expect(home.events.flatMap((e) => (e.event === 'logged_week' ? [e.week] : []))).toEqual([1, 2, 3, 4]);
    expect(travelling.progress.clock).toEqual({ tz: NYC, dayStartHour: 4 });
  });
});

describe('logged means entered', () => {
  it('a dose filled in today with last week\'s dose time counts for this week, not for last week', () => {
    const first = logged(on(1, 21));
    // Nothing is entered in week 2 (days 8 to 14). On day 16 the person fills in a dose taken on day 10.
    const late = filledIn(on(16, 9), on(10, 21));
    const out = run([{ nowMs: on(1, 22), doses: [first] }, { nowMs: on(16, 10), doses: [first, late] }]);
    expect(out.events.filter((e) => e.event === 'logged_week')).toEqual([
      { event: 'logged_week', day: 1, week: 1, logged: true },
      { event: 'logged_week', day: 14, week: 2, logged: false },
      { event: 'logged_week', day: 16, week: 3, logged: true },
    ]);
    expect(names(out.events)).not.toContain('week2_active');
  });

  it('filling in a whole month on one day covers one week of the streak, not four', () => {
    const first = logged(on(1, 21));
    const backfill = [8, 15, 22].map((day) => filledIn(on(27, 9), on(day, 21)));
    const out = run([{ nowMs: on(1, 22), doses: [first] }, { nowMs: on(27, 10), doses: [first, ...backfill] }, { nowMs: on(40), doses: [first, ...backfill] }]);
    expect(names(out.events)).not.toContain('four_week_streak');
  });
});

describe('a clock that ran ahead and was put right', () => {
  const first = logged(on(1, 21));

  it('weeks reported while the clock was ahead are reported again as they really come', () => {
    const second = logged(on(8, 21));
    const third = logged(on(15, 21));
    const out = run([
      { nowMs: on(1, 22), doses: [first] },
      // One look with the clock a year ahead: weeks that have not happened are reported as "no".
      { nowMs: on(1 + 364), doses: [first] },
      // Back at the real time.
      { nowMs: on(8, 22), doses: [first, second] },
      { nowMs: on(15, 22), doses: [first, second, third] },
    ]);
    const weeks = out.events.flatMap((e) => (e.event === 'logged_week' ? [[e.week, e.logged]] : []));
    // Week 1, the false weeks 45 to 52, then the real weeks 2 and 3.
    expect(weeks.slice(0, 1)).toEqual([[1, true]]);
    expect(weeks.slice(1, 9).every(([week, yes]) => (week as number) >= 45 && yes === false)).toBe(true);
    expect(weeks.slice(9)).toEqual([
      [2, true],
      [3, true],
    ]);
    expect(out.progress.weeksSent).toBe(3);
    // The streak was closed while the clock was ahead; it is open again and is met in week 3.
    expect(out.events.filter((e) => e.event === 'four_week_streak')).toEqual([{ event: 'four_week_streak', day: 15 }]);
  });

  it('a clock set back inside the same week changes nothing', () => {
    const out = run([{ nowMs: on(1, 22), doses: [first] }, { nowMs: on(3, 12), doses: [first] }, { nowMs: on(2, 12), doses: [first] }, { nowMs: on(3, 13), doses: [first] }]);
    expect(out.events.filter((e) => e.event === 'logged_week')).toEqual([{ event: 'logged_week', day: 1, week: 1, logged: true }]);
  });

  it('progress saved before these fields existed is read with their defaults', () => {
    const old = { setupSent: true, activatedAt: on(1, 21), weeksSent: 1, week2Sent: false, streakSent: false, pausedSent: false, proSent: false } as CountProgress;
    const out = dueCounts(facts({ nowMs: on(2), doses: [first] }), old);
    expect(out.events).toEqual([]);
    expect(out.progress).toMatchObject({ streakHours: 168, streakOver: false, lastSeenMs: on(2) });
  });
});

describe('paused or stopped, and "I would want this"', () => {
  it('marking the medication paused or stopped is reported once each time it happens', () => {
    const out = run([
      { nowMs: on(1), status: 'escalating' },
      { nowMs: on(5), status: 'paused' },
      { nowMs: on(6), status: 'paused' },
      { nowMs: on(7), status: 'stopped' },
      { nowMs: on(20), status: 'maintenance' },
      { nowMs: on(33), status: 'stopped' },
    ]);
    expect(out.events.filter((e) => e.event === 'paused_or_stopped')).toEqual([
      { event: 'paused_or_stopped', day: 5 },
      { event: 'paused_or_stopped', day: 33 },
    ]);
  });

  it('a person who finishes setup as "stopped" is reported as stopped', () => {
    expect(names(run([{ status: 'stopped' }]).events)).toEqual(['setup_finished', 'paused_or_stopped']);
    expect(names(run([{ status: 'not_started' }]).events)).toEqual(['setup_finished']);
    expect(names(run([{ status: null, schedule: null, form: null }]).events)).toEqual(['setup_finished']);
  });

  it('the Pro tap is reported once, and only if there was one', () => {
    const out = run([{ nowMs: on(4) }, { nowMs: on(5), wantsProAt: on(4, 20) }, { nowMs: on(6), wantsProAt: on(4, 20) }]);
    expect(out.events.filter((e) => e.event === 'wants_pro')).toEqual([{ event: 'wants_pro', day: 4 }]);
  });
});

describe('setup finished', () => {
  it('carries the three answers and whether the medication is an injection or a pill', () => {
    const out = run([{ answers: { timeOnMedication: '1_to_3_months', loggedBefore: 'drug_maker_app', heardFrom: 'friend_or_family' }, form: 'pill' }]);
    expect(out.events).toEqual([{ event: 'setup_finished', day: 0, timeOnMedication: '1_to_3_months', loggedBefore: 'drug_maker_app', heardFrom: 'friend_or_family', form: 'pill' }]);
  });

  it('never passes on anything that is not one of the listed answers', () => {
    const out = run([{ answers: { timeOnMedication: 'since my birthday', loggedBefore: 42, heardFrom: 'web_search', note: 'free text' }, form: null }]);
    expect(out.events).toEqual([{ event: 'setup_finished', day: 0, timeOnMedication: null, loggedBefore: null, heardFrom: 'web_search', form: null }]);
  });
});

describe('due counts as a whole', () => {
  const weeklyUser = [logged(on(1, 21)), logged(on(8, 21)), logged(on(15, 20)), logged(on(22, 22))];

  it('asking again with the saved progress and the same facts gives nothing', () => {
    const step = { nowMs: on(23), doses: weeklyUser, status: 'paused' as const, wantsProAt: on(3) };
    const first = dueCounts(facts(step), NO_PROGRESS);
    expect(names(first.events)).toEqual(['setup_finished', 'activated', 'logged_week', 'logged_week', 'logged_week', 'logged_week', 'week2_active', 'four_week_streak', 'paused_or_stopped', 'wants_pro']);
    const again = dueCounts(facts(step), first.progress);
    expect(again.events).toEqual([]);
    expect(again.progress).toEqual(first.progress);
  });

  it('deleting the activating dose later does not move the weeks', () => {
    const a = dueCounts(facts({ nowMs: on(2), doses: weeklyUser.slice(0, 1) }), NO_PROGRESS);
    // The first dose is gone; the next one was logged on day 8 since setup.
    const b = dueCounts(facts({ nowMs: on(9), doses: weeklyUser.slice(1, 2) }), a.progress);
    expect(b.events).toEqual([
      { event: 'logged_week', day: 8, week: 2, logged: true },
      { event: 'week2_active', day: 8 },
    ]);
  });

  it('a message has only the listed fields: an event name, a day number, and for two events a few fixed values', () => {
    const all = run([
      { nowMs: on(1, 22), doses: weeklyUser.slice(0, 1), answers: { timeOnMedication: 'over_1_year', loggedBefore: 'nothing', heardFrom: 'other' } },
      { nowMs: on(60), doses: weeklyUser, status: 'stopped', wantsProAt: on(30) },
    ]).events;
    expect(new Set(names(all))).toEqual(new Set(COUNT_EVENT_NAMES));
    const allowed: Record<string, string[]> = { setup_finished: ['day', 'event', 'form', 'heardFrom', 'loggedBefore', 'timeOnMedication'], logged_week: ['day', 'event', 'logged', 'week'] };
    for (const e of all) {
      expect(Object.keys(e).sort(), e.event).toEqual(allowed[e.event] ?? ['day', 'event']);
      expect(Number.isInteger(e.day) && e.day >= 0 && e.day < 100, e.event).toBe(true);
      // Nothing that looks like a time: every number in a message is small.
      for (const v of Object.values(e)) if (typeof v === 'number') expect(v).toBeLessThan(10_000);
    }
  });
});

describe('the exact shape of a message', () => {
  const id = '3f2b8c1e-7a4d-4e9b-a1c6-0d5e8f7a9b2c';
  const common = { installId: id, appVersion: '0.0.1', day: 3 };
  const valid: Record<string, unknown>[] = [
    { ...common, event: 'setup_finished', day: 0, timeOnMedication: 'under_1_month', loggedBefore: null, heardFrom: 'app_store_search', form: 'injection' },
    { ...common, event: 'setup_finished', day: 0, timeOnMedication: null, loggedBefore: null, heardFrom: null, form: null },
    { ...common, event: 'activated' },
    { ...common, event: 'logged_week', week: 2, logged: false },
    { ...common, event: 'week2_active' },
    { ...common, event: 'four_week_streak' },
    { ...common, event: 'paused_or_stopped' },
    { ...common, event: 'wants_pro' },
  ];

  it('accepts every kind of message and returns it unchanged', () => {
    for (const m of valid) expect(parseCountMessage(m), JSON.stringify(m)).toEqual(m);
    expect(valid.map((m) => m.event).filter((v, i, a) => a.indexOf(v) === i)).toEqual(COUNT_EVENT_NAMES);
  });

  it('refuses a message with any field it does not know', () => {
    for (const m of valid) {
      for (const extra of [{ medication: 'x' }, { dose: 2.5 }, { weightKg: 80 }, { symptom: 'nausea' }, { note: 'hello' }, { tz: 'America/New_York' }, { locale: 'en-US' }, { at: 1_700_000_000_000 }, { date: '2026-03-02' }, { week: 2 }, { form: 'pill' }, { __proto__: null, x: 1 }]) {
        const withExtra = { ...m, ...extra };
        if (Object.keys(withExtra).length === Object.keys(m).length) continue; // the field belongs to this event
        expect(parseCountMessage(withExtra), `${String(m.event)} + ${Object.keys(extra).join()}`).toBeNull();
      }
    }
  });

  it('refuses a message with a field missing', () => {
    for (const m of valid) for (const k of Object.keys(m)) {
      const less = { ...m };
      delete less[k];
      expect(parseCountMessage(less), `${String(m.event)} without ${k}`).toBeNull();
    }
  });

  it('refuses values outside their list, range or type', () => {
    const bad: Record<string, unknown>[] = [
      { ...common, event: 'opened_app' },
      { ...common, event: 'toString' },
      { ...common, event: 'activated', day: -1 },
      { ...common, event: 'activated', day: 1.5 },
      { ...common, event: 'activated', day: 10_000 },
      { ...common, event: 'activated', day: '3' },
      { ...common, event: 'activated', day: 1_763_000_000_000 },
      { ...common, event: 'activated', installId: 'not an id at all' },
      { ...common, event: 'activated', installId: id.toUpperCase() },
      { ...common, event: 'activated', installId: `${id}0` },
      { ...common, event: 'activated', appVersion: '1.0' },
      { ...common, event: 'activated', appVersion: '1.0.0-beta+build' },
      { ...common, event: 'activated', appVersion: 1 },
      { ...common, event: 'logged_week', week: 0, logged: true },
      { ...common, event: 'logged_week', week: 2, logged: 'yes' },
      { ...common, event: 'logged_week', week: 2.5, logged: true },
      { ...common, event: 'setup_finished', timeOnMedication: 'two years', loggedBefore: null, heardFrom: null, form: null },
      { ...common, event: 'setup_finished', timeOnMedication: null, loggedBefore: 'a named product', heardFrom: null, form: null },
      { ...common, event: 'setup_finished', timeOnMedication: null, loggedBefore: null, heardFrom: 'my doctor told me', form: null },
      { ...common, event: 'setup_finished', timeOnMedication: null, loggedBefore: null, heardFrom: null, form: 'semaglutide' },
      { ...common, event: 'setup_finished', timeOnMedication: undefined, loggedBefore: null, heardFrom: null, form: null },
    ];
    for (const m of bad) expect(parseCountMessage(m), JSON.stringify(m)).toBeNull();
    for (const notAnObject of [null, undefined, 'activated', 3, true, [], [valid[2]]]) expect(parseCountMessage(notAnObject)).toBeNull();
  });

  it('an install id is a random UUID in lower case, and nothing else', () => {
    expect(isInstallId(id)).toBe(true);
    expect(isInstallId(crypto.randomUUID())).toBe(true);
    for (const v of ['', 'me', id.slice(1), `${id} `, `../${id}`, 12, null]) expect(isInstallId(v)).toBe(false);
  });
});

describe('the address counts are sent to', () => {
  it('nothing set means the build does not count', () => {
    for (const v of [undefined, null, '']) expect(parseCountUrl(v)).toBeNull();
  });

  it('is an https address, a path on the same site, or http on localhost for testing', () => {
    expect(parseCountUrl('https://counts.example.com/api/count')).toBe('https://counts.example.com/api/count');
    expect(parseCountUrl('https://counts.example.com/api/count/')).toBe('https://counts.example.com/api/count');
    expect(parseCountUrl('/api/count')).toBe('/api/count');
    expect(parseCountUrl('http://localhost:5222/api/count')).toBe('http://localhost:5222/api/count');
    expect(parseCountUrl('http://127.0.0.1:8787/api/count')).toBe('http://127.0.0.1:8787/api/count');
  });

  it('anything else stops the build, so a typo cannot send counts somewhere unexpected', () => {
    for (const bad of ['http://counts.example.com/api/count', '//counts.example.com/api/count', 'counts.example.com', 'ftp://x/y', 'https://x/y?key=1', 'https://x/y#z', '/', '  ', 'true', 1, true, {}]) {
      expect(() => parseCountUrl(bad), String(bad)).toThrow(/VITE_COUNT_URL/);
    }
  });
});

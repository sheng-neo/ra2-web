import { describe, expect, it } from 'vitest';
import type { Schedule } from './schedule';
import { addDays, fmtDayKey, zonedToUtc } from './tz';
import { fmtWeightChange } from './units';
import { scheduledDoses, weeklySummary, type WeeklyInput } from './weekly';

const NY = 'America/New_York';
/** A local time `day` days from Friday, November 20, 2026 (negative = earlier). */
function at(day: number, hour = 12, minute = 0): number {
  const d = addDays(2026, 11, 20, day);
  return zonedToUtc(d.year, d.month, d.day, hour, minute, NY);
}
const NOW = at(0, 12);
const MONDAY_9PM: Schedule = { kind: 'weekly', weekday: 1, time: '21:00' };
const DAILY: Schedule = { kind: 'daily', time: '08:00' };

function input(over: Partial<WeeklyInput> = {}): WeeklyInput {
  return { nowMs: NOW, tz: NY, dayStartHour: 4, schedule: MONDAY_9PM, active: true, sinceMs: null, doseTimes: [], weights: [], symptomTimes: [], ...over };
}

describe('weekly summary: the seven days', () => {
  it('are today and the six days before it', () => {
    const s = weeklySummary(input());
    expect([s.fromDay, s.toDay, s.days]).toEqual(['2026-11-14', '2026-11-20', 7]);
  });

  it('follow the person\'s start of day: before 4:00 it is still yesterday', () => {
    const s = weeklySummary(input({ nowMs: at(0, 3, 59) }));
    expect([s.fromDay, s.toDay]).toEqual(['2026-11-13', '2026-11-19']);
  });

  it('start with the person\'s first day in the app when that is less than a week ago', () => {
    const s = weeklySummary(input({ sinceMs: at(-2, 15) }));
    expect([s.fromDay, s.toDay, s.days]).toEqual(['2026-11-18', '2026-11-20', 3]);
    expect(weeklySummary(input({ sinceMs: at(0, 9) })).days).toBe(1);
    // An older start changes nothing, and a start in the future (a wrong clock) counts as today.
    expect(weeklySummary(input({ sinceMs: at(-30) })).days).toBe(7);
    expect(weeklySummary(input({ sinceMs: at(3) })).days).toBe(1);
  });
});

describe('weekly summary: doses', () => {
  it('counts the doses logged on those days, to the minute at both ends', () => {
    const s = weeklySummary(input({ doseTimes: [at(-7, 23), at(-6, 3, 59), at(-6, 4, 0), at(-3, 21), at(0, 11), at(1, 3, 59), at(1, 4, 0)] }));
    // The first two are before the seven days, the last one is tomorrow.
    expect(s.dosesLogged).toBe(4);
  });

  it('a weekly schedule calls for one dose in any seven days', () => {
    for (let weekday = 0; weekday < 7; weekday++) expect(scheduledDoses({ kind: 'weekly', weekday, time: '09:00' }, '2026-11-20', 7, 4)).toBe(1);
    expect(weeklySummary(input()).dosesScheduled).toBe(1);
  });

  it('in fewer days it calls for a dose only if its weekday is among them', () => {
    // November 20, 2026 is a Friday. The three days up to it are Wednesday, Thursday and Friday.
    expect(scheduledDoses({ kind: 'weekly', weekday: 3, time: '09:00' }, '2026-11-20', 3, 4)).toBe(1);
    expect(scheduledDoses({ kind: 'weekly', weekday: 1, time: '09:00' }, '2026-11-20', 3, 4)).toBe(0);
    expect(weeklySummary(input({ sinceMs: at(-2) })).dosesScheduled).toBe(0);
  });

  it('a weekly time before the start of day belongs to the day before', () => {
    // "Saturday 1:00" is part of Friday for a person whose day starts at 4:00.
    expect(scheduledDoses({ kind: 'weekly', weekday: 6, time: '01:00' }, '2026-11-20', 1, 4)).toBe(1);
    expect(scheduledDoses({ kind: 'weekly', weekday: 6, time: '01:00' }, '2026-11-20', 1, 0)).toBe(0);
    expect(scheduledDoses({ kind: 'weekly', weekday: 0, time: '02:30' }, '2026-11-21', 1, 4)).toBe(1);
  });

  it('a daily schedule calls for one a day, for the days counted', () => {
    expect(weeklySummary(input({ schedule: DAILY })).dosesScheduled).toBe(7);
    expect(weeklySummary(input({ schedule: DAILY, sinceMs: at(-1) })).dosesScheduled).toBe(2);
    expect(weeklySummary(input({ schedule: DAILY, sinceMs: at(0, 9) })).dosesScheduled).toBe(1);
  });

  it('"every N days" follows the log: a person exactly on schedule sees as many scheduled as logged', () => {
    const every = (days: number): Schedule => ({ kind: 'interval', hours: days * 24 });
    const onSchedule = (days: number, back: number[]) => weeklySummary(input({ schedule: every(days), doseTimes: back.map((b) => at(-b, 9)) }));
    const pair = (s: { dosesLogged: number; dosesScheduled: number | null }) => [s.dosesLogged, s.dosesScheduled];
    // Every 2 days, doses 6, 4, 2 and 0 days ago. Whole intervals that fit in 7 days would say 3.
    expect(pair(onSchedule(2, [6, 4, 2, 0]))).toEqual([4, 4]);
    expect(pair(onSchedule(3, [6, 3, 0]))).toEqual([3, 3]);
    expect(pair(onSchedule(5, [5, 0]))).toEqual([2, 2]);
    // Every 10 days with a dose today, and the one before it 10 days ago (outside the seven days).
    expect(pair(onSchedule(10, [10, 0]))).toEqual([1, 1]);
    // The same before today's dose is logged, at 12:00 with the dose due at 9:00: it has come due.
    expect(pair(onSchedule(10, [10]))).toEqual([0, 1]);
    // And the day before it is due, nothing is scheduled yet.
    expect(pair(weeklySummary(input({ schedule: every(10), doseTimes: [at(-9, 9)] })))).toEqual([0, 0]);
  });

  it('"every N days": doses that were passed over count as scheduled, and a second dose in the same interval adds nothing', () => {
    const every2: Schedule = { kind: 'interval', hours: 48 };
    const pair = (doseTimes: number[], over: Partial<WeeklyInput> = {}) => {
      const s = weeklySummary(input({ schedule: every2, doseTimes, ...over }));
      return [s.dosesLogged, s.dosesScheduled];
    };
    // Doses 6 days ago and 2 days ago: the one 4 days ago was passed over. Today's is due at 9:00 and it is 12:00.
    expect(pair([at(-6, 9), at(-2, 9)])).toEqual([2, 4]);
    // Earlier the same morning today's dose has not come due.
    expect(pair([at(-6, 9), at(-2, 9)], { nowMs: at(0, 8) })).toEqual([2, 3]);
    // A dose a few hours late or early is still the scheduled dose, not an extra one.
    expect(pair([at(-6, 9), at(-4, 15), at(-2, 7), at(0, 10)])).toEqual([4, 4]);
    // Two doses on one day: the second covers nothing new.
    expect(pair([at(-6, 9), at(-6, 20), at(-4, 20), at(-2, 20)])).toEqual([4, 3]);
    // Nothing logged in the seven days, last dose 20 days ago: the doses that came due in these days.
    expect(pair([at(-20, 9)])).toEqual([0, 4]);
    // No dose known at all: there is nothing to count from.
    expect(pair([])).toEqual([0, 0]);
    // A new person: the seven days start with their first dose.
    expect(pair([at(-2, 9)], { sinceMs: at(-2, 9) })).toEqual([1, 2]);
  });

  it('a dose that is due later today is not counted as scheduled yet', () => {
    const tenPm: Schedule = { kind: 'daily', time: '22:00' };
    const earlier = [1, 2, 3, 4, 5, 6].map((d) => at(-d, 22));
    // 20:00, the six earlier doses logged: 6 of 6, not 6 of 7.
    const evening = weeklySummary(input({ schedule: tenPm, nowMs: at(0, 20), doseTimes: earlier }));
    expect([evening.dosesLogged, evening.dosesScheduled]).toEqual([6, 6]);
    // Once it is due it counts, logged or not.
    const late = weeklySummary(input({ schedule: tenPm, nowMs: at(0, 22, 1), doseTimes: earlier }));
    expect([late.dosesLogged, late.dosesScheduled]).toEqual([6, 7]);
    // Taken two hours early: it counts as soon as it is logged, so the line never reads "7 of 6".
    const early = weeklySummary(input({ schedule: tenPm, nowMs: at(0, 20, 30), doseTimes: [...earlier, at(0, 20)] }));
    expect([early.dosesLogged, early.dosesScheduled]).toEqual([7, 7]);
  });

  it('the same for a weekly dose, also when its time is after midnight', () => {
    // November 20, 2026 is a Friday. A Friday 21:00 shot, seen at noon.
    const friday: Schedule = { kind: 'weekly', weekday: 5, time: '21:00' };
    expect(weeklySummary(input({ schedule: friday })).dosesScheduled).toBe(0);
    expect(weeklySummary(input({ schedule: friday, nowMs: at(0, 21) })).dosesScheduled).toBe(1);
    expect(weeklySummary(input({ schedule: friday, doseTimes: [at(0, 11)] })).dosesScheduled).toBe(1);
    // "Saturday 2:00" belongs to Friday for a person whose day starts at 4:00. On Friday at 20:00 it is six hours away.
    const saturday2am: Schedule = { kind: 'weekly', weekday: 6, time: '02:00' };
    expect(scheduledDoses(saturday2am, '2026-11-20', 7, 4)).toBe(1);
    expect(weeklySummary(input({ schedule: saturday2am, nowMs: at(0, 20), sinceMs: at(-3) })).dosesScheduled).toBe(0);
    expect(weeklySummary(input({ schedule: saturday2am, nowMs: at(1, 2), sinceMs: at(-3) })).dosesScheduled).toBe(1);
    // Last week's dose of that schedule (Saturday the 14th, 2:00) belongs to Friday the 13th, before the seven days.
    expect(weeklySummary(input({ schedule: saturday2am, nowMs: at(0, 20) })).dosesScheduled).toBe(0);
  });

  it('nothing is scheduled without a medication, or while it is not started, paused or stopped', () => {
    expect(weeklySummary(input({ schedule: null })).dosesScheduled).toBeNull();
    expect(weeklySummary(input({ active: false })).dosesScheduled).toBeNull();
    // The doses that were logged are still counted.
    expect(weeklySummary(input({ active: false, doseTimes: [at(-1)] })).dosesLogged).toBe(1);
  });
});

describe('weekly summary: weight change', () => {
  it('needs two weigh-ins in the seven days', () => {
    const none = weeklySummary(input());
    expect([none.weighIns, none.firstWeightKg, none.lastWeightKg]).toEqual([0, null, null]);
    const one = weeklySummary(input({ weights: [{ atMs: at(-1), kg: 80 }] }));
    expect([one.weighIns, one.firstWeightKg, one.lastWeightKg]).toEqual([1, null, null]);
    // A weigh-in from before the seven days does not make it two.
    const old = weeklySummary(input({ weights: [{ atMs: at(-8), kg: 82 }, { atMs: at(-1), kg: 80 }] }));
    expect([old.weighIns, old.firstWeightKg]).toEqual([1, null]);
  });

  it('is the last weigh-in minus the first, by time, whatever order they are stored in', () => {
    const s = weeklySummary(input({ weights: [{ atMs: at(-1), kg: 80.2 }, { atMs: at(-5), kg: 81 }, { atMs: at(-3), kg: 79 }, { atMs: at(0, 8), kg: 80.5 }] }));
    expect([s.weighIns, s.firstWeightKg, s.lastWeightKg]).toEqual([4, 81, 80.5]);
  });

  it('is written with its sign, from the two weights as the log shows them', () => {
    expect(fmtWeightChange(81, 80.5, 'kg', 'en')).toBe('−0.5 kg');
    expect(fmtWeightChange(80, 80.4, 'kg', 'en')).toBe('+0.4 kg');
    expect(fmtWeightChange(80, 80, 'lb', 'en')).toBe('0.0 lb');
    // 90.72 kg shows as 200.0 lb and 90.04 kg as 198.5 lb in the log.
    expect(fmtWeightChange(90.72, 90.04, 'lb', 'en')).toBe('−1.5 lb');
    expect(fmtWeightChange(80, 79.4, 'jin', 'hans')).toBe('−1.2 斤');
    // A change too small to show reads as no change, without a sign.
    expect(fmtWeightChange(80, 80.01, 'kg', 'en')).toBe('0.0 kg');
  });
});

describe('weekly summary: symptoms', () => {
  it('counts days, not entries', () => {
    const s = weeklySummary(input({ symptomTimes: [at(-2, 9), at(-2, 20), at(-1, 2), at(0, 10), at(-9)] }));
    // 2:00 the next night still belongs to the same day, and nine days ago is outside.
    expect(s.symptomDays).toBe(2);
    expect(weeklySummary(input()).symptomDays).toBe(0);
  });
});

describe('day keys as text', () => {
  it('reads like the other dates in the app', () => {
    expect(fmtDayKey('2026-11-20', 'en')).toBe('Fri, Nov 20');
    expect(fmtDayKey('2026-11-14', 'en')).toBe('Sat, Nov 14');
    expect(fmtDayKey('2026-11-20', 'hans')).toBe('11月20日 周五');
    expect(fmtDayKey('2026-03-01', 'hant')).toBe('3月1日 周日');
  });
});

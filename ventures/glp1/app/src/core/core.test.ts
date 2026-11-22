import { describe, expect, it } from 'vitest';
import { CATALOG, drugById, drugLabel, needsDoseConfirm, searchCatalog } from './catalog';
import { daysUntilBelow, escalationInfo, exposureCurve, exposureIndexAt, kaFromTmax, modelFor, steadyStatePeak, type MgDose } from './pk';
import { dueStatus, nextDueMs, suggestSite } from './schedule';
import { dayKey, dayStartMs, HOUR, DAY, zonedParts, zonedToUtc } from './tz';
import { proteinTarget, referenceWeightKg, shouldRescue } from './protein';
import { fastLoss, regainStatus, rollingAverages } from './weight';
import { highSymptomDays } from './symptoms';
import { parseLocal } from './localParse';
import { reminderIcs } from './ics';
import { todayAdvice, type TodayInput } from './today';
import { fromKg, toKg, fmtWeight } from './units';

const SH = 'Asia/Shanghai';
const NY = 'America/New_York';

describe('tz', () => {
  it('round-trips wall time across zones, including US DST', () => {
    const t = zonedToUtc(2026, 3, 9, 21, 0, NY); // DST started 2026-03-08
    expect(zonedParts(t, NY)).toMatchObject({ year: 2026, month: 3, day: 9, hour: 21, minute: 0 });
    expect(new Date(t).toISOString()).toBe('2026-03-10T01:00:00.000Z');
    const s = zonedToUtc(2026, 11, 20, 8, 30, SH);
    expect(new Date(s).toISOString()).toBe('2026-11-20T00:30:00.000Z');
  });

  it('counts 1am snacks as the previous day when the day starts at 4am', () => {
    const t = zonedToUtc(2026, 11, 21, 1, 0, SH);
    expect(dayKey(t, SH, 4)).toBe('2026-11-20');
    expect(dayKey(t, SH, 0)).toBe('2026-11-21');
    expect(dayStartMs('2026-11-20', SH, 4)).toBe(zonedToUtc(2026, 11, 20, 4, 0, SH));
  });
});

describe('catalog', () => {
  it('shows the regional brand name and finds drugs by any name', () => {
    expect(drugLabel(drugById('tirzepatide'), 'CN', 'hans')).toBe('穆峰达（替尔泊肽）');
    expect(drugLabel(drugById('semaglutide-wl'), 'TW', 'hans')).toBe('週纖達（司美格鲁肽（减重））');
    expect(searchCatalog('zepbound').map((d) => d.id)).toEqual(['tirzepatide']);
    expect(searchCatalog('诺和').map((d) => d.id)).toEqual(['semaglutide-wl', 'semaglutide-t2d', 'semaglutide-oral-t2d']);
  });

  it('asks to confirm doses above the max, but never converts or checks non-mg units', () => {
    const t = drugById('tirzepatide');
    expect(needsDoseConfirm(t, 15, 'mg')).toBe(false);
    expect(needsDoseConfirm(t, 75, 'mg')).toBe(true);
    expect(needsDoseConfirm(t, 75, 'units')).toBe(false);
    expect(needsDoseConfirm(drugById('mazdutide'), 99, 'mg')).toBe(false);
  });

  it('only draws curves for drugs with PK parameters', () => {
    expect(CATALOG.filter((d) => d.pk).map((d) => d.id)).toEqual(['semaglutide-wl', 'semaglutide-t2d', 'tirzepatide']);
  });
});

describe('pk', () => {
  const sema = { halfLifeH: 168, tmaxH: 48 };
  const tirz = { halfLifeH: 120, tmaxH: 24 };

  it('derives absorption rates that put single-dose peaks at Tmax', () => {
    const m = modelFor(sema);
    expect(m.ke).toBeCloseTo(0.004126, 5);
    expect(kaFromTmax(m.ke, 48)).toBeCloseTo(0.0598, 3);
    expect(modelFor(tirz).ka).toBeCloseTo(0.138, 2);
  });

  it('peaks a day or two after the shot at steady state, not at the moment of injection', () => {
    const doses: MgDose[] = Array.from({ length: 30 }, (_, i) => ({ atMs: i * 168 * HOUR, mg: 2.4 }));
    const last = 29 * 168 * HOUR;
    let best = { h: 0, v: 0 };
    for (let h = 0; h <= 168; h++) {
      const v = exposureIndexAt(last + h * HOUR, doses, sema, 168)!;
      if (v > best.v) best = { h, v };
    }
    expect(best.h).toBeGreaterThanOrEqual(30);
    expect(best.h).toBeLessThanOrEqual(42);
    expect(best.v).toBeCloseTo(100, 0);
    const trough = exposureIndexAt(last + 168 * HOUR, doses, sema, 168)!;
    expect(trough).toBeGreaterThan(55);
    expect(trough).toBeLessThan(70);
  });

  it('a first dose reaches roughly half of the steady-state peak', () => {
    const v = Math.max(...Array.from({ length: 168 }, (_, h) => exposureIndexAt(h * HOUR, [{ atMs: 0, mg: 0.25 }], sema, 168)!));
    expect(v).toBeGreaterThan(40);
    expect(v).toBeLessThan(55);
  });

  it('steady-state peak scales linearly with dose', () => {
    const m = modelFor(tirz);
    expect(steadyStatePeak(5, 168, m) / steadyStatePeak(2.5, 168, m)).toBeCloseTo(2, 6);
  });

  it('projects future doses on schedule and stops projecting when stopped', () => {
    const now = 10 * 168 * HOUR;
    const doses: MgDose[] = Array.from({ length: 10 }, (_, i) => ({ atMs: i * 168 * HOUR, mg: 5 }));
    const on = exposureCurve({ doses, params: tirz, intervalH: 168, nowMs: now, nextDueMs: now });
    const off = exposureCurve({ doses, params: tirz, intervalH: 168, nowMs: now, nextDueMs: null });
    expect(on.length).toBe(off.length);
    expect(on[on.length - 1].index).toBeGreaterThan(off[off.length - 1].index * 2);
    expect(on.filter((p) => p.projected).length).toBeGreaterThan(0);
  });

  it('detects the escalation window after a dose increase', () => {
    const d = (day: number, mg: number) => ({ atMs: day * DAY, mg });
    const doses = [d(0, 2.5), d(7, 2.5), d(14, 2.5), d(21, 2.5), d(28, 5)];
    const e = escalationInfo(doses, 30 * DAY)!;
    expect(e).toMatchObject({ currentMg: 5, previousMg: 2.5, escalationActive: true });
    expect(escalationInfo(doses, 43 * DAY)!.escalationActive).toBe(false);
    expect(escalationInfo([...doses, d(35, 2.5)], 36 * DAY)!.escalationActive).toBe(false); // 减量不算加量周
  });

  it('decays below 5% within about a month after stopping', () => {
    const doses: MgDose[] = Array.from({ length: 30 }, (_, i) => ({ atMs: i * 168 * HOUR, mg: 2.4 }));
    const s = daysUntilBelow(doses, sema, 168)!;
    expect(s).toBeGreaterThan(28);
    expect(s).toBeLessThan(36);
    const t = daysUntilBelow(doses.map((x) => ({ ...x, mg: 10 })), tirz, 168)!;
    expect(t).toBeGreaterThan(19);
    expect(t).toBeLessThan(27);
  });
});

describe('schedule', () => {
  const weeklyMon = { kind: 'weekly' as const, weekday: 1, time: '21:00' };

  it('next weekly dose lands on the scheduled weekday even if the last shot was late', () => {
    const last = zonedToUtc(2026, 11, 17, 10, 0, SH); // 周二上午补打
    const next = nextDueMs(weeklyMon, last, last, SH);
    expect(zonedParts(next, SH)).toMatchObject({ month: 11, day: 23, hour: 21, weekday: 1 });
  });

  it('a shot taken a few minutes early does not count as the next one', () => {
    const last = zonedToUtc(2026, 11, 16, 20, 50, SH); // 周一 20:50
    expect(zonedParts(nextDueMs(weeklyMon, last, last, SH), SH)).toMatchObject({ day: 23, hour: 21 });
  });

  it('interval and daily schedules', () => {
    const last = zonedToUtc(2026, 11, 16, 9, 0, SH);
    expect(nextDueMs({ kind: 'interval', hours: 84 }, last, last, SH) - last).toBe(84 * HOUR);
    const daily = nextDueMs({ kind: 'daily', time: '07:30' }, last, last, SH);
    expect(zonedParts(daily, SH)).toMatchObject({ day: 17, hour: 7, minute: 30 });
  });

  it('flags a missed log 12 hours after due', () => {
    expect(dueStatus(1000, 999)).toBe('upcoming');
    expect(dueStatus(0, 11 * HOUR)).toBe('due');
    expect(dueStatus(0, 13 * HOUR)).toBe('overdue');
  });

  it('rotates injection sites', () => {
    expect(suggestSite([])).toBe('abd_l');
    expect(suggestSite(['abd_l', 'abd_r'])).toBe('thigh_l');
    expect(suggestSite(['arm_r'])).toBe('abd_l');
  });
});

describe('protein', () => {
  it('uses adjusted weight at BMI >= 28 (PRD example: 160 cm, 78 kg)', () => {
    expect(referenceWeightKg(160, 78)).toBeCloseTo(65.0, 0);
    expect(proteinTarget({ heightCm: 160, weightKg: 78, kidneyOrLiver: false, mode: 'auto' })).toEqual({
      kind: 'auto',
      refWeightKg: 65,
      floorG: 65,
      idealLowG: 78,
      idealHighG: 97,
      capG: 130,
    });
  });

  it('never goes below 60 g and defers to a doctor for kidney or liver disease', () => {
    const t = proteinTarget({ heightCm: 155, weightKg: 50, kidneyOrLiver: false, mode: 'auto' });
    expect(t.kind === 'auto' && t.floorG).toBe(60);
    expect(proteinTarget({ heightCm: 160, weightKg: 78, kidneyOrLiver: true, mode: 'auto' })).toEqual({ kind: 'ask_doctor' });
    expect(proteinTarget({ heightCm: 160, weightKg: 78, kidneyOrLiver: true, mode: 'manual', manualG: 50 })).toEqual({ kind: 'manual', floorG: 50 });
  });

  it('evening rescue needs a 25 g gap and 3 hours since the last meal', () => {
    expect(shouldRescue(30, 65, null, 0)).toBe(true);
    expect(shouldRescue(45, 65, null, 0)).toBe(false);
    expect(shouldRescue(30, 65, 0, 2 * HOUR)).toBe(false);
  });
});

describe('units', () => {
  it('converts jin and pounds', () => {
    expect(toKg(163, 'jin')).toBe(81.5);
    expect(fromKg(toKg(180, 'lb'), 'lb')).toBeCloseTo(180, 9);
  });
});

describe('weight', () => {
  const at = (day: number) => zonedToUtc(2026, 10, day, 8, 0, SH);

  it('needs 3 weigh-ins in a 7-day window and finds regain against the lowest average', () => {
    const logs = [
      { atMs: at(1), kg: 80 },
      { atMs: at(3), kg: 79 },
      { atMs: at(5), kg: 78 },
      { atMs: at(20), kg: 81 },
      { atMs: at(22), kg: 82 },
      { atMs: at(24), kg: 82.5 },
    ];
    const avgs = rollingAverages(logs, SH);
    expect(avgs.map((a) => a.day)).toEqual(['2026-10-05', '2026-10-24']);
    const r = regainStatus(avgs)!;
    expect(r.nadirKg).toBeCloseTo(79, 6);
    expect(r.regainPct).toBeCloseTo(3.586, 2);
    expect(r.band).toBe('yellow');
  });

  it('flags two consecutive weeks of >1.5% loss', () => {
    const logs = [];
    for (let d = 1; d <= 22; d++) logs.push({ atMs: at(d), kg: 90 - d * 0.25 });
    expect(fastLoss(rollingAverages(logs, SH))).toBe(true);
    const slow = Array.from({ length: 22 }, (_, i) => ({ atMs: at(i + 1), kg: 90 - (i + 1) * 0.05 }));
    expect(fastLoss(rollingAverages(slow, SH))).toBe(false);
  });
});

describe('symptoms', () => {
  it('needs 3 full cycles, then finds the personal high-symptom days', () => {
    const doseAt = (w: number) => zonedToUtc(2026, 9, 7 + 7 * w, 21, 0, SH);
    const sym = (w: number, d: number, g: number) => ({ atMs: zonedToUtc(2026, 9, 7 + 7 * w + d, 12, 0, SH), grade: g });
    const doses = [0, 1, 2, 3].map(doseAt);
    const symptoms = [sym(0, 1, 2), sym(1, 1, 3), sym(2, 1, 2), sym(0, 2, 2), sym(1, 2, 2), sym(2, 5, 1)];
    const r = highSymptomDays(doses, symptoms, zonedToUtc(2026, 10, 2, 12, 0, SH), SH);
    expect(r.enoughData).toBe(true);
    expect(r.cycles).toBe(3);
    expect(r.highDays).toEqual([1, 2]);
    const early = highSymptomDays(doses.slice(0, 2), symptoms, zonedToUtc(2026, 9, 20, 12, 0, SH), SH);
    expect(early.enoughData).toBe(false);
  });
});

describe('local parser', () => {
  it('reads a dose with site', () => {
    const r = parseLocal('刚打了 7.5，右大腿', 'kg', 'hans');
    expect(r.events).toEqual([{ type: 'dose', amount: 7.5, unit: 'mg', site: 'thigh_r', raw: '打了 7.5' }]);
    expect(r.rest).toBe('');
  });

  it('reads weight in kg, jin and lb', () => {
    expect(parseLocal('今早 81.6', 'kg', 'hans').events[0]).toMatchObject({ type: 'weight', kg: 81.6 });
    expect(parseLocal('163斤', 'kg', 'hans').events[0]).toMatchObject({ type: 'weight', kg: 81.5 });
    // Stored to 0.01 kg, so the pounds that were typed read back as typed (180 lb is 81.65 kg).
    expect(parseLocal('体重 180', 'lb', 'hans').events[0]).toMatchObject({ type: 'weight', kg: 81.65 });
  });

  it('reads a weight with two decimals whole, never its tail', () => {
    expect(parseLocal('182.75 lb', 'kg', 'en')).toEqual({ events: [{ type: 'weight', kg: 82.89, raw: '182.75 lb' }], rest: '' });
    expect(parseLocal('282.75 lbs', 'kg', 'en')).toEqual({ events: [{ type: 'weight', kg: 128.25, raw: '282.75 lbs' }], rest: '' });
    expect(parseLocal('82.75 kg', 'lb', 'en')).toEqual({ events: [{ type: 'weight', kg: 82.75, raw: '82.75 kg' }], rest: '' });
    expect(parseLocal('81.65公斤', 'jin', 'hans')).toEqual({ events: [{ type: 'weight', kg: 81.65, raw: '81.65公斤' }], rest: '' });
    expect(parseLocal('体重 81.65 公斤', 'jin', 'hans')).toEqual({ events: [{ type: 'weight', kg: 81.65, raw: '体重 81.65 公斤' }], rest: '' });
    expect(parseLocal('今天 163.5斤', 'kg', 'hans').events[0]).toMatchObject({ type: 'weight', kg: 81.75 });
    // Three decimals, or a longer number, is not a weight this parser should guess at.
    expect(parseLocal('81.655 kg', 'kg', 'en').events).toEqual([]);
    expect(parseLocal('1182.5 lb', 'kg', 'en').events).toEqual([]);
  });

  it('a weight typed with one decimal reads back as typed, in every unit', () => {
    const cases: [string, 'lb' | 'kg' | 'jin', (n: string) => string][] = [
      ['lb', 'lb', (n) => `${n} lb`],
      ['lb', 'lb', (n) => `weighed ${n}`],
      ['kg', 'kg', (n) => `${n} kg`],
      ['jin', 'jin', (n) => `${n}斤`],
      ['jin', 'jin', (n) => `体重 ${n}`],
    ];
    for (const [, unit, say] of cases) {
      for (let tenths = 700; tenths <= 4000; tenths += 7) {
        const typed = (tenths / 10).toFixed(1);
        const e = parseLocal(say(typed), unit, 'en').events[0];
        if (!e) continue; // outside 30–300 kg
        expect(e.type === 'weight' && fmtWeight(e.kg, unit, 'en'), say(typed)).toBe(`${typed} ${unit}`);
      }
    }
    expect(parseLocal('182.4 lb', 'lb', 'en').events[0]).toMatchObject({ kg: 82.74 });
    expect(parseLocal('weighed 199.9 lbs', 'lb', 'en').events[0]).toMatchObject({ kg: 90.67 });
    expect(parseLocal('150.5 lbs', 'lb', 'en').events[0]).toMatchObject({ kg: 68.27 });
  });

  it('logs simple foods locally and leaves composite dishes for AI', () => {
    const r = parseLocal('早饭俩鸡蛋一杯豆浆', 'kg', 'hans');
    expect(r.events).toHaveLength(1);
    const food = r.events[0];
    expect(food.type === 'food' && food.items.reduce((s, i) => s + i.proteinG, 0)).toBe(19);
    expect(r.rest).toBe('');
    const dish = parseLocal('皮蛋瘦肉粥一碗', 'kg', 'hans');
    expect(dish.events).toEqual([]);
    expect(dish.rest).toContain('皮蛋瘦肉粥');
  });

  it('reads English measure words the same way as the Chinese ones', () => {
    const foods = (text: string) => {
      const r = parseLocal(text, 'lb', 'en');
      const e = r.events[0];
      return { labels: e?.type === 'food' ? e.items.map((i) => i.label) : [], rest: r.rest, count: r.events.length };
    };
    expect(foods('2 eggs and a glass of milk')).toEqual({ labels: ['Egg × 2', 'Milk × 1'], rest: '', count: 1 });
    expect(foods('a cup of greek yogurt')).toEqual({ labels: ['Greek yogurt × 1'], rest: '', count: 1 });
    expect(foods('one scoop of protein powder')).toEqual({ labels: ['Protein powder × 1'], rest: '', count: 1 });
    expect(foods('two cups of milk')).toEqual({ labels: ['Milk × 2'], rest: '', count: 1 });
    expect(foods('3 bowls of congee')).toEqual({ labels: ['Plain rice porridge (congee) × 3'], rest: '', count: 1 });
    // A dish the table does not know still goes to the AI whole.
    expect(foods('a bowl of chicken noodle soup')).toMatchObject({ labels: [], count: 0 });
  });

  it('splits one message into several records', () => {
    const r = parseLocal('打完针了 打了2.5 体重 82.3 早饭俩鸡蛋', 'kg', 'hans');
    expect(r.events.map((e) => e.type).sort()).toEqual(['dose', 'food', 'weight']);
  });
});

describe('ics', () => {
  it('creates a weekly floating-time reminder without the drug name', () => {
    const s = reminderIcs({ kind: 'weekly', weekday: 1, time: '21:00' }, { year: 2026, month: 11, day: 23, hour: 21, minute: 0 }, 'u1', 'hans');
    expect(s).toContain('DTSTART:20261123T210000\r\n');
    expect(s).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(s).toContain('SUMMARY:该记一针了');
    expect(s).not.toMatch(/mg|替尔泊肽|司美/);
  });
});

describe('today advice', () => {
  const now = zonedToUtc(2026, 11, 20, 12, 0, SH); // 周五
  const base: TodayInput = {
    nowMs: now,
    tz: SH,
    dayStartHour: 4,
    status: 'maintenance',
    nextDueMs: zonedToUtc(2026, 11, 23, 21, 0, SH),
    dueStatus: 'upcoming',
    lastDoseMs: zonedToUtc(2026, 11, 16, 21, 0, SH),
    escalation: null,
    highDays: null,
    proteinFloorG: 65,
    proteinByDay: {},
    openTriage: null,
    workoutDays: [],
    stoppedAt: null,
  };

  it('puts an open danger-symptom card above everything', () => {
    expect(todayAdvice({ ...base, openTriage: { id: 'pancreatitis', level: 'emergency' }, dueStatus: 'overdue' }).kind).toBe('triage');
  });

  it('dose day, then escalation week, then personal high-symptom day', () => {
    expect(todayAdvice({ ...base, nextDueMs: zonedToUtc(2026, 11, 20, 21, 0, SH) }).kind).toBe('dose_day');
    expect(todayAdvice({ ...base, dueStatus: 'overdue' }).kind).toBe('dose_day');
    const esc = { currentMg: 5, previousMg: 2.5, sinceMs: base.lastDoseMs!, weeksOnDose: 0.5, escalationActive: true };
    expect(todayAdvice({ ...base, escalation: esc })).toEqual({ kind: 'escalation', dayOfEscalation: 5, currentMg: 5 });
    const high = { enoughData: true, cycles: 3, highDays: [4], meanByOffset: [] };
    expect(todayAdvice({ ...base, highDays: high })).toEqual({ kind: 'high_symptom', offset: 4 });
  });

  it('protein advice after three logged days under the floor; unlogged days do not count', () => {
    const low = { '2026-11-19': 40, '2026-11-18': 50, '2026-11-17': 30 };
    expect(todayAdvice({ ...base, proteinByDay: low }).kind).toBe('protein_low');
    expect(todayAdvice({ ...base, proteinByDay: { '2026-11-19': 40, '2026-11-17': 30 } }).kind).toBe('normal');
  });

  it('suggests training until two sessions this week, never two days in a row', () => {
    expect(todayAdvice(base)).toMatchObject({ kind: 'normal', train: true, offset: 4 });
    expect(todayAdvice({ ...base, workoutDays: ['2026-11-19'] })).toMatchObject({ train: false });
    expect(todayAdvice({ ...base, workoutDays: ['2026-11-16', '2026-11-18'] })).toMatchObject({ train: false });
  });

  it('stopped users get the maintenance card', () => {
    expect(todayAdvice({ ...base, status: 'stopped', stoppedAt: zonedToUtc(2026, 11, 10, 12, 0, SH) })).toEqual({ kind: 'stopped', daysSince: 10 });
  });
});

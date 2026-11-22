import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../core/tz';
import type { DoseEvent, Profile } from '../core/types';
import { derive, withVirtualHistory, type Records } from './derive';

const SH = 'Asia/Shanghai';
const profile: Profile = {
  id: 'me',
  script: 'hans',
  region: 'CN',
  weightUnit: 'jin',
  heightCm: 160,
  startWeightKg: 78,
  goalWeightKg: 65,
  birthYear: null,
  dayStartHour: 4,
  tz: SH,
  safety: { kidneyOrLiver: false, pregnancy: false, insulinOrSU: false, eatingDisorder: false, under18: false },
  proteinMode: 'auto',
  proteinManualG: null,
  aiConsent: true,
  regimen: { drugId: 'tirzepatide', doseAmount: 5, doseUnit: 'mg', schedule: { kind: 'weekly', weekday: 1, time: '21:00' }, status: 'escalating', weeksOnDoseAtStart: 3 },
  onboardedAt: 1,
  largeText: false,
};
const dose = (at: number, amount: number, source: DoseEvent['source'] = 'manual'): DoseEvent => ({ id: String(at), createdAt: at, updatedAt: at, deletedAt: null, occurredAt: at, tz: SH, source, drugId: 'tirzepatide', amount, unit: 'mg', site: null });
const empty: Records = { doses: [], foods: [], weights: [], symptoms: [], workouts: [] };

describe('derive', () => {
  it('a dose logged a moment after the clock tick is "today", never day -1', () => {
    const now = zonedToUtc(2026, 11, 20, 12, 0, SH);
    const d = derive(profile, { ...empty, doses: [dose(now + 5000, 7.5)] }, now, SH);
    expect(d.daysSinceDose).toBe(0);
  });

  it('onboarding "weeks on this dose" fills virtual history so it is not flagged as an escalation week', () => {
    const now = zonedToUtc(2026, 11, 20, 12, 0, SH);
    const imported = dose(zonedToUtc(2026, 11, 16, 21, 0, SH), 5, 'import');
    const d = derive(profile, { ...empty, doses: [imported] }, now, SH);
    expect(d.escalation?.escalationActive).toBe(false);
    expect(d.advice.kind).not.toBe('escalation');
    const fresh = derive({ ...profile, regimen: { ...profile.regimen!, weeksOnDoseAtStart: null } }, { ...empty, doses: [imported] }, now, SH);
    expect(fresh.escalation?.escalationActive).toBe(true);
  });

  it('virtual history is only added before an onboarding import', () => {
    expect(withVirtualHistory([{ atMs: 1000, mg: 5 }], 168, 3, false)).toHaveLength(1);
    expect(withVirtualHistory([{ atMs: 1000, mg: 5 }], 168, 3, true)).toHaveLength(3);
  });

  it('keeps coaching paused for the day after a pausing triage is acknowledged', () => {
    const now = zonedToUtc(2026, 11, 20, 12, 0, SH);
    const sym = { id: 's', createdAt: now, updatedAt: now, deletedAt: null, occurredAt: now - 60000, tz: SH, source: 'text' as const, kind: 'other' as const, grade: 3, triageId: 'dehydration' as const, triageLevel: 'urgent' as const, ack: true };
    const d = derive(profile, { ...empty, symptoms: [sym] }, now, SH);
    expect(d.openTriage).toBeNull();
    expect(d.advice.kind).toBe('triage');
    const procedure = { ...sym, triageId: 'procedure' as const, triageLevel: 'remind' as const };
    expect(derive(profile, { ...empty, symptoms: [procedure] }, now, SH).advice.kind).not.toBe('triage');
  });

  it('a pill logged with a time that is still to come starts no countdown; one taken a moment ago does', () => {
    const now = zonedToUtc(2026, 11, 20, 12, 0, SH);
    const oral: Profile = { ...profile, regimen: { drugId: 'semaglutide-oral-t2d', doseAmount: 7, doseUnit: 'mg', schedule: { kind: 'daily', time: '08:00' }, status: 'maintenance' } };
    const pill = (at: number): DoseEvent => ({ ...dose(at, 7), drugId: 'semaglutide-oral-t2d' });
    // Logged for 5 pm at noon: the old rule counted 330 minutes down.
    expect(derive(oral, { ...empty, doses: [pill(now + 5 * 3_600_000)] }, now, SH).fastingUntil).toBeNull();
    expect(derive(oral, { ...empty, doses: [pill(now + 60_000)] }, now, SH).fastingUntil).toBeNull();
    expect(derive(oral, { ...empty, doses: [pill(now)] }, now, SH).fastingUntil).toBe(now + 30 * 60_000);
    expect(derive(oral, { ...empty, doses: [pill(now - 29 * 60_000)] }, now, SH).fastingUntil).toBe(now + 60_000);
    expect(derive(oral, { ...empty, doses: [pill(now - 30 * 60_000)] }, now, SH).fastingUntil).toBeNull();
  });

  it('says when a chart is missing only because the medication names no brand', () => {
    const now = zonedToUtc(2026, 11, 20, 12, 0, SH);
    const doses = [dose(now - 8 * 86_400_000, 5), dose(now - 86_400_000, 5)];
    // Mainland China: the local name has no chart numbers of its own, and the list there does not offer the two US brands.
    const cn = derive(profile, { ...empty, doses }, now, SH);
    expect(cn.curve).toEqual([]);
    expect(cn.curveAvailable).toBe(false);
    expect(cn.chartNeedsBrand).toEqual({ brands: ['Zepbound', 'Mounjaro'], canChoose: false });
    // The United States: the person can choose one of the two.
    expect(derive({ ...profile, region: 'US' }, { ...empty, doses }, now, SH).chartNeedsBrand).toEqual({ brands: ['Zepbound', 'Mounjaro'], canChoose: true });
    // With a brand the chart is drawn and nothing is asked.
    const zep = derive({ ...profile, region: 'US', regimen: { ...profile.regimen!, brand: 'Zepbound' } }, { ...empty, doses }, now, SH);
    expect(zep.curve.length).toBeGreaterThan(0);
    expect(zep.chartNeedsBrand).toBeNull();
    // A medication with no chart numbers at all is not a brand question.
    const sax = derive({ ...profile, regimen: { ...profile.regimen!, drugId: 'liraglutide' } }, empty, now, SH);
    expect(sax.curveAvailable).toBe(false);
    expect(sax.chartNeedsBrand).toBeNull();
  });

  it('after a missed week the forecast does not jump: the overdue dose is not counted', () => {
    const now = zonedToUtc(2026, 11, 22, 12, 0, SH);
    const zep: Profile = { ...profile, region: 'US', regimen: { ...profile.regimen!, brand: 'Zepbound', weeksOnDoseAtStart: null } };
    // Doses 35, 28, 21 and 14 days ago, nothing since.
    const doses = [35, 28, 21, 14].map((days) => dose(now - days * 86_400_000, 5));
    const d = derive(zep, { ...empty, doses }, now, SH);
    expect(d.nextDue).not.toBeNull();
    expect(d.nextDue!).toBeLessThan(now);
    const lastSolid = d.curve.filter((p) => !p.projected).pop()!;
    const firstDashed = d.curve.find((p) => p.projected)!;
    expect(Math.abs(firstDashed.index - lastSolid.index)).toBeLessThan(2);
  });
});

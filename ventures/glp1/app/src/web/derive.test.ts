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
});

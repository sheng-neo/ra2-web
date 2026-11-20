/**
 * 把本地记录和核心规则拼起来，算出"今天"页需要的一切。纯函数，便于测试。
 */
import { drugById, type DrugEntry } from '../core/catalog';
import { escalationInfo, exposureCurve, type CurvePoint, type EscalationInfo, type MgDose } from '../core/pk';
import { proteinTarget, type ProteinTarget } from '../core/protein';
import { dueStatus, intervalHours, nextDueMs, suggestSite, type DueStatus, type Site } from '../core/schedule';
import { highSymptomDays, type HighDayResult } from '../core/symptoms';
import { todayAdvice, type Advice } from '../core/today';
import type { TriageHit } from '../core/triage';
import { dayKey } from '../core/tz';
import type { DoseEvent, FoodLog, Profile, WeightLog, WorkoutLog } from '../core/types';
import { fastLoss, regainStatus, rollingAverages, type DailyAvg, type RegainStatus } from '../core/weight';
import type { SymptomRow } from './db';

export interface Records {
  doses: DoseEvent[];
  foods: FoodLog[];
  weights: WeightLog[];
  symptoms: SymptomRow[];
  workouts: WorkoutLog[];
}

export interface Derived {
  tz: string;
  today: string;
  drug: DrugEntry | null;
  lastDose: DoseEvent | null;
  nextDue: number | null;
  dueStatus: DueStatus | null;
  daysSinceDose: number | null;
  escalation: EscalationInfo | null;
  highDays: HighDayResult | null;
  latestWeightKg: number | null;
  protein: ProteinTarget;
  proteinToday: number;
  proteinByDay: Record<string, number>;
  todayFoods: FoodLog[];
  todaySymptoms: SymptomRow[];
  todayItems: TodayItem[];
  openTriage: { hit: TriageHit; rowId: string } | null;
  advice: Advice;
  curve: CurvePoint[];
  curveNow: number | null;
  nextSite: Site;
  weightAvgs: DailyAvg[];
  regain: RegainStatus | null;
  fastLoss: boolean;
  workoutDays: string[];
  fastingUntil: number | null;
}

export type TodayItem =
  | { kind: 'dose'; row: DoseEvent }
  | { kind: 'food'; row: FoodLog }
  | { kind: 'weight'; row: WeightLog }
  | { kind: 'symptom'; row: SymptomRow }
  | { kind: 'workout'; row: WorkoutLog };

const live = <T extends { deletedAt: number | null }>(xs: T[]) => xs.filter((x) => x.deletedAt === null);
const byTime = <T extends { occurredAt: number }>(xs: T[]) => [...xs].sort((a, b) => a.occurredAt - b.occurredAt);

export function derive(profile: Profile, rec: Records, nowMs: number, tz: string): Derived {
  const ds = profile.dayStartHour;
  const today = dayKey(nowMs, tz, ds);
  const reg = profile.regimen;
  const drug = reg ? drugById(reg.drugId) : null;

  const doses = byTime(live(rec.doses)).filter((d) => !reg || d.drugId === reg.drugId);
  const foods = byTime(live(rec.foods));
  const weights = byTime(live(rec.weights));
  const symptoms = byTime(live(rec.symptoms));
  const workouts = byTime(live(rec.workouts));

  const lastDose = doses.length ? doses[doses.length - 1] : null;
  const active = reg?.status === 'escalating' || reg?.status === 'maintenance';
  const nextDue = reg && active ? nextDueMs(reg.schedule, lastDose?.occurredAt ?? null, nowMs, tz) : null;
  const status = nextDue !== null ? dueStatus(nextDue, nowMs) : null;
  const mgDoses: MgDose[] = withVirtualHistory(
    doses.filter((d) => d.unit === 'mg').map((d) => ({ atMs: d.occurredAt, mg: d.amount })),
    reg ? intervalHours(reg.schedule) : 168,
    reg?.weeksOnDoseAtStart ?? null,
    doses[0]?.source === 'import',
  );
  const escalation = escalationInfo(mgDoses, nowMs);
  const highDays = drug?.frequency === 'weekly' ? highSymptomDays(doses.map((d) => d.occurredAt), symptoms.filter((s) => s.kind !== 'other').map((s) => ({ atMs: s.occurredAt, grade: s.grade })), nowMs, tz, ds) : null;

  const latestWeightKg = weights.length ? weights[weights.length - 1].kg : profile.startWeightKg;
  const protein = proteinTarget({
    heightCm: profile.heightCm ?? 0,
    weightKg: latestWeightKg ?? 0,
    kidneyOrLiver: profile.safety.kidneyOrLiver,
    mode: profile.proteinMode,
    manualG: profile.proteinManualG,
  });
  const proteinByDay: Record<string, number> = {};
  for (const f of foods) {
    const k = dayKey(f.occurredAt, tz, ds);
    proteinByDay[k] = (proteinByDay[k] ?? 0) + f.proteinG;
  }
  const inToday = (t: number) => dayKey(t, tz, ds) === today;
  const todayFoods = foods.filter((f) => inToday(f.occurredAt));
  const todaySymptoms = symptoms.filter((s) => inToday(s.occurredAt));
  const openRow = [...todaySymptoms].reverse().find((s) => s.triageId && s.triageLevel && !s.ack) ?? null;
  const openTriage = openRow ? { hit: { id: openRow.triageId!, level: openRow.triageLevel! }, rowId: openRow.id } : null;
  const workoutDays = [...new Set(workouts.map((w) => dayKey(w.occurredAt, tz, ds)))];
  const floor = protein.kind === 'auto' || protein.kind === 'manual' ? protein.floorG : null;

  const advice = todayAdvice({
    nowMs,
    tz,
    dayStartHour: ds,
    status: reg?.status ?? null,
    nextDueMs: nextDue,
    dueStatus: status,
    lastDoseMs: lastDose?.occurredAt ?? null,
    escalation,
    highDays,
    proteinFloorG: floor,
    proteinByDay: Object.fromEntries(Object.entries(proteinByDay).filter(([k]) => k !== today)),
    openTriage: openTriage?.hit ?? null,
    workoutDays,
    stoppedAt: reg?.stoppedAt ?? null,
  });

  let curve: CurvePoint[] = [];
  let curveNow: number | null = null;
  if (drug?.pk && reg && mgDoses.length) {
    curve = exposureCurve({ doses: mgDoses, params: drug.pk, intervalH: intervalHours(reg.schedule), nowMs, nextDueMs: active ? nextDue : null });
    const past = curve.filter((p) => !p.projected);
    curveNow = past.length ? Math.round(past[past.length - 1].index) : null;
  }

  const weightAvgs = rollingAverages(weights.map((w) => ({ atMs: w.occurredAt, kg: w.kg })), tz, ds);
  const fastingMin = drug?.fastingMin;
  const fastingUntil = fastingMin && lastDose && nowMs - lastDose.occurredAt < fastingMin * 60000 ? lastDose.occurredAt + fastingMin * 60000 : null;

  const todayItems: TodayItem[] = [
    ...doses.filter((d) => inToday(d.occurredAt)).map((row) => ({ kind: 'dose' as const, row })),
    ...todayFoods.map((row) => ({ kind: 'food' as const, row })),
    ...weights.filter((w) => inToday(w.occurredAt)).map((row) => ({ kind: 'weight' as const, row })),
    ...todaySymptoms.map((row) => ({ kind: 'symptom' as const, row })),
    ...workouts.filter((w) => inToday(w.occurredAt)).map((row) => ({ kind: 'workout' as const, row })),
  ].sort((a, b) => b.row.occurredAt - a.row.occurredAt);

  return {
    tz,
    today,
    drug,
    lastDose,
    nextDue,
    dueStatus: status,
    daysSinceDose: lastDose ? Math.floor((nowMs - lastDose.occurredAt) / 86_400_000) : null,
    escalation,
    highDays,
    latestWeightKg,
    protein,
    proteinToday: Math.round(proteinByDay[today] ?? 0),
    proteinByDay,
    todayFoods,
    todaySymptoms,
    todayItems,
    openTriage,
    advice,
    curve,
    curveNow,
    nextSite: suggestSite(doses.slice(-3).map((d) => d.site)),
    weightAvgs,
    regain: reg?.status === 'stopped' ? regainStatus(weightAvgs) : null,
    fastLoss: fastLoss(weightAvgs),
    workoutDays,
    fastingUntil,
  };
}

/**
 * 引导时用户说"这个剂量已经用了 N 周"：在第一条（引导导入的）记录之前补 N−1 个同剂量的虚拟点，
 * 只用于曲线和加量周判断，不写进记录。
 */
export function withVirtualHistory(doses: MgDose[], intervalH: number, weeksOnDose: number | null, firstIsImport: boolean): MgDose[] {
  if (!doses.length || !firstIsImport || !weeksOnDose || weeksOnDose < 2) return doses;
  const first = doses[0];
  const n = Math.min(Math.floor(weeksOnDose) - 1, 8);
  const virtual: MgDose[] = [];
  for (let i = n; i >= 1; i--) virtual.push({ atMs: first.atMs - i * intervalH * 3_600_000, mg: first.mg });
  return [...virtual, ...doses];
}

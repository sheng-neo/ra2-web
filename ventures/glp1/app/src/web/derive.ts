/**
 * 把本地记录和核心规则拼起来，算出"今天"页需要的一切。纯函数，便于测试。
 */
import { brandNumbers, drugById, regimenBrand, type DrugEntry } from '../core/catalog';
import { chartNeedsBrand, curveAvailable, fastingMinutes } from '../core/features';
import { escalationInfo, exposureCurve, type CurvePoint, type EscalationInfo, type MgDose } from '../core/pk';
import { proteinTarget, type ProteinTarget } from '../core/protein';
import { dueStatus, intervalHours, nextDueMs, suggestSite, type DueStatus, type Site } from '../core/schedule';
import { highSymptomDays, type HighDayResult } from '../core/symptoms';
import { todayAdvice, type Advice } from '../core/today';
import { hitOf, pausesCoaching, type TriageHit } from '../core/triage';
import { dayDiff, dayKey } from '../core/tz';
import type { DoseEvent, FoodLog, Profile, WeightLog, WorkoutLog } from '../core/types';
import { weeklySummary, type WeeklySummary } from '../core/weekly';
import { fastLoss, regainStatus, rollingAverages, type DailyAvg, type RegainStatus } from '../core/weight';
import type { SymptomRow } from './db';
import { features } from './features';

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
  /** Whether this build draws the estimated medication level curve for the medication at all (core/features.ts). */
  curveAvailable: boolean;
  /**
   * Set when there is no chart only because the regimen names none of the brands that have chart
   * numbers of their own (core/features.ts, chartNeedsBrand). The screens then say so, and where
   * the person can choose a brand they say where.
   */
  chartNeedsBrand: { brands: string[]; canChoose: boolean } | null;
  curve: CurvePoint[];
  curveNow: number | null;
  nextSite: Site;
  weightAvgs: DailyAvg[];
  regain: RegainStatus | null;
  fastLoss: boolean;
  workoutDays: string[];
  fastingUntil: number | null;
  /** The last seven days in numbers (core/weekly.ts). */
  weekly: WeeklySummary;
}

export type TodayItem =
  | { kind: 'dose'; row: DoseEvent }
  | { kind: 'food'; row: FoodLog }
  | { kind: 'weight'; row: WeightLog }
  | { kind: 'symptom'; row: SymptomRow }
  | { kind: 'workout'; row: WorkoutLog };

const live = <T extends { deletedAt: number | null }>(xs: T[]) => xs.filter((x) => x.deletedAt === null);
const byTime = <T extends { occurredAt: number }>(xs: T[]) => [...xs].sort((a, b) => a.occurredAt - b.occurredAt);

/**
 * `curveNeedsSource` is the switch of the build that decides whether catalog numbers need a
 * label source: the curve and the wait after a pill (core/features.ts). It is a parameter so
 * both settings can be tested. Its default reads the one switch, not the whole `features` object.
 */
export function derive(profile: Profile, rec: Records, nowMs: number, tz: string, curveNeedsSource: boolean = features.curveNeedsSource): Derived {
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
  const openHit = openRow ? hitOf(openRow) : null;
  const openTriage = openRow && openHit ? { hit: openHit, rowId: openRow.id } : null;
  // 需要暂停的分诊（如脱水、剧烈腹痛）：点了"我知道了"之后，当天的训练和饮食建议仍然暂停，提醒保持置顶。
  const pausedRow = [...todaySymptoms].reverse().find((s) => s.triageId && s.triageLevel && pausesCoaching({ id: s.triageId, level: s.triageLevel })) ?? null;
  const pausedTriage = pausedRow ? hitOf(pausedRow) : null;
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
    openTriage: openTriage?.hit ?? pausedTriage,
    workoutDays,
    stoppedAt: reg?.stoppedAt ?? null,
  });

  let curve: CurvePoint[] = [];
  let curveNow: number | null = null;
  // The half-life and the time to peak are those of the brand's own label (catalog.ts, brandNumbers).
  const brand = reg ? regimenBrand(reg, profile.region) : null;
  const pk = drug ? brandNumbers(drug, brand).pk : null;
  const canDraw = drug !== null && curveAvailable(drug, { curveNeedsSource }, brand);
  const needsBrand = drug !== null && !canDraw ? chartNeedsBrand(drug, { curveNeedsSource }, brand, profile.region) : null;
  if (pk && canDraw && reg && mgDoses.length) {
    curve = exposureCurve({ doses: mgDoses, params: pk, intervalH: intervalHours(reg.schedule), nowMs, nextDueMs: active ? nextDue : null });
    const past = curve.filter((p) => !p.projected);
    curveNow = past.length ? Math.round(past[past.length - 1].index) : null;
  }

  const weightAvgs = rollingAverages(weights.map((w) => ({ atMs: w.occurredAt, kg: w.kg })), tz, ds);
  // The wait after a pill is a catalog number: it is counted down only where the build may show it.
  const fastingMin = drug ? fastingMinutes(drug, { curveNeedsSource }, brand) : null;
  // A pill logged with a time that is still to come starts no countdown: the wait runs from the
  // time the pill is taken, and counting from a later time would show more than the label's wait.
  const sincePill = lastDose ? nowMs - lastDose.occurredAt : null;
  const fastingUntil = fastingMin && lastDose && sincePill !== null && sincePill >= 0 && sincePill < fastingMin * 60000 ? lastDose.occurredAt + fastingMin * 60000 : null;

  // The summary starts with the person's first day in the app: the end of setup, or their first logged dose if that is earlier.
  const firstDoseAt = doses.length ? doses[0].occurredAt : null;
  const sinceMs = profile.onboardedAt === null ? firstDoseAt : firstDoseAt === null ? profile.onboardedAt : Math.min(profile.onboardedAt, firstDoseAt);
  const weekly = weeklySummary({
    nowMs,
    tz,
    dayStartHour: ds,
    schedule: reg?.schedule ?? null,
    active: !!active,
    sinceMs,
    doseTimes: doses.map((d) => d.occurredAt),
    weights: weights.map((w) => ({ atMs: w.occurredAt, kg: w.kg })),
    symptomTimes: symptoms.map((s) => s.occurredAt),
  });

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
    daysSinceDose: lastDose ? Math.max(0, dayDiff(dayKey(lastDose.occurredAt, tz, ds), today)) : null,
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
    curveAvailable: canDraw,
    chartNeedsBrand: needsBrand,
    curve,
    curveNow,
    nextSite: suggestSite(doses.slice(-3).map((d) => d.site)),
    weightAvgs,
    regain: reg?.status === 'stopped' ? regainStatus(weightAvgs) : null,
    fastLoss: fastLoss(weightAvgs),
    workoutDays,
    fastingUntil,
    weekly,
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

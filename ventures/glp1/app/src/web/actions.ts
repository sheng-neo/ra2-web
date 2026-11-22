/**
 * 所有写操作。写本地库，记录后给出"撤销"。
 */
import { drugById, type DoseUnit } from '../core/catalog';
import type { Site } from '../core/schedule';
import { triageSymptom, triageText, type SymptomKind, type TriageContext, type TriageHit } from '../core/triage';
import type { FoodLog, Profile, Source } from '../core/types';
import { storedKg } from '../core/units';
import { base, db, requestPersist, restore, softDelete, type RecordTable } from './db';
import { msg, type MsgRef } from './i18n/translate';
import { setUi, toast } from './store';

function undoable(table: RecordTable, id: string, text: MsgRef): void {
  toast(text, () => {
    void softDelete(table, id).then(() => toast(msg('toast.undone')));
  });
  void requestPersist();
}

export function triageCtx(p: Profile): TriageContext {
  return { insulinOrSU: p.safety.insulinOrSU, drugId: p.regimen?.drugId ?? null, region: p.region };
}

export async function addDose(p: Profile, d: { drugId: string; amount: number; unit: DoseUnit; site: Site | null; occurredAt: number; source: Source; note?: string }): Promise<void> {
  const row = { ...base(d.source, d.occurredAt), drugId: d.drugId, amount: d.amount, unit: d.unit, site: d.site, note: d.note };
  await db.doses.add(row);
  const drug = drugById(d.drugId);
  undoable('doses', row.id, msg(drug.route === 'oral' ? 'toast.dose.pill' : 'toast.dose.shot', { amount: d.amount, unit: d.unit }));
  // 记第一针时，"还没开始"自动切到"加量中"
  if (p.regimen && p.regimen.status === 'not_started') {
    await db.profile.update('me', { regimen: { ...p.regimen, status: 'escalating' } });
  }
}

// Every weight saved from the screens goes through storedKg (core/units.ts).
export { storedKg };

export async function addWeight(kg: number, source: Source, occurredAt = Date.now()): Promise<void> {
  const row = { ...base(source, occurredAt), kg: storedKg(kg) };
  await db.weights.add(row);
  undoable('weights', row.id, msg('toast.weight'));
}

export async function addFood(f: Omit<FoodLog, keyof ReturnType<typeof base>>, source: Source, occurredAt = Date.now()): Promise<void> {
  const row: FoodLog = { ...base(source, occurredAt), ...f };
  await db.foods.add(row);
  undoable('foods', row.id, msg('toast.food', { food: f.text, grams: Math.round(f.proteinG) }));
}

export async function addWorkout(routine: 'bodyweight' | 'band' | 'dumbbell', variant: 'standard' | 'light'): Promise<void> {
  const row = { ...base('quick'), routine, variant };
  await db.workouts.add(row);
  undoable('workouts', row.id, msg('toast.workout'));
}

export async function addQuestion(text: string): Promise<void> {
  const row = { ...base('text'), text, asked: false };
  await db.questions.add(row);
  toast(msg('toast.questionSaved'));
}

/** 快捷记录症状。重度时走分诊。 */
export async function addSymptom(p: Profile, kind: SymptomKind, grade: number): Promise<TriageHit[]> {
  const hits = triageSymptom(kind, grade, triageCtx(p));
  const top = hits[0] ?? null;
  const row = { ...base('quick'), kind, grade, triageId: top?.id ?? null, triageLevel: top?.level ?? null };
  await db.symptoms.add(row);
  if (top) setUi({ triage: { hits, rowId: row.id } });
  else {
    toast(msg('toast.logged'), () => void softDelete('symptoms', row.id));
    setUi({ coping: kind });
  }
  void requestPersist();
  return hits;
}

/** 自由文字里的危险信号：先于一切解析运行。命中就记一条症状并弹出分诊卡。 */
export async function checkTextTriage(p: Profile, text: string): Promise<boolean> {
  const hits = triageText(text, triageCtx(p));
  if (!hits.length) return false;
  const row = { ...base('text'), kind: 'other' as const, grade: 3, note: text, triageId: hits[0].id, triageLevel: hits[0].level };
  await db.symptoms.add(row);
  setUi({ triage: { hits, rowId: row.id } });
  if (hits.some((h) => h.id === 'pregnancy') && p.goalWeightKg) {
    await db.profile.update('me', { goalWeightKg: null });
  }
  return true;
}

export async function ackTriage(rowId: string | null): Promise<void> {
  if (rowId) await db.symptoms.update(rowId, { ack: true, updatedAt: Date.now() });
  setUi({ triage: null });
}

export async function deleteRecord(table: RecordTable, id: string): Promise<void> {
  await softDelete(table, id);
  toast(msg('toast.deleted'), () => void restore(table, id));
}

export async function updateProfile(patch: Partial<Profile>): Promise<void> {
  await db.profile.update('me', patch);
}

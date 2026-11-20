/**
 * 所有写操作。写本地库，记录后给出"撤销"。
 */
import { drugById, type DoseUnit } from '../core/catalog';
import type { Site } from '../core/schedule';
import { triageSymptom, triageText, type SymptomKind, type TriageContext, type TriageHit } from '../core/triage';
import type { FoodLog, Profile, Source } from '../core/types';
import { base, db, requestPersist, restore, softDelete, type RecordTable } from './db';
import { setUi, toast } from './store';

function undoable(table: RecordTable, id: string, text: string): void {
  toast(text, () => {
    void softDelete(table, id).then(() => toast('已撤销'));
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
  undoable('doses', row.id, `已记下：${drug.route === 'oral' ? '吃药' : '打针'} ${d.amount} ${d.unit}`);
  // 记第一针时，"还没开始"自动切到"加量中"
  if (p.regimen && p.regimen.status === 'not_started') {
    await db.profile.update('me', { regimen: { ...p.regimen, status: 'escalating' } });
  }
}

export async function addWeight(kg: number, source: Source, occurredAt = Date.now()): Promise<void> {
  const row = { ...base(source, occurredAt), kg: Math.round(kg * 10) / 10 };
  await db.weights.add(row);
  undoable('weights', row.id, `已记下体重`);
}

export async function addFood(f: Omit<FoodLog, keyof ReturnType<typeof base>>, source: Source, occurredAt = Date.now()): Promise<void> {
  const row: FoodLog = { ...base(source, occurredAt), ...f };
  await db.foods.add(row);
  undoable('foods', row.id, `已记下：${f.text} 约 ${Math.round(f.proteinG)} 克蛋白`);
}

export async function addWorkout(routine: 'bodyweight' | 'band' | 'dumbbell', variant: 'standard' | 'light'): Promise<void> {
  const row = { ...base('quick'), routine, variant };
  await db.workouts.add(row);
  undoable('workouts', row.id, '练完了，很棒');
}

export async function addQuestion(text: string): Promise<void> {
  const row = { ...base('text'), text, asked: false };
  await db.questions.add(row);
  toast('已存进"想问医生的问题"');
}

/** 快捷记录症状。重度时走分诊。 */
export async function addSymptom(p: Profile, kind: SymptomKind, grade: number): Promise<TriageHit[]> {
  const hits = triageSymptom(kind, grade, triageCtx(p));
  const top = hits[0] ?? null;
  const row = { ...base('quick'), kind, grade, triageId: top?.id ?? null, triageLevel: top?.level ?? null };
  await db.symptoms.add(row);
  if (top) setUi({ triage: { hits, rowId: row.id } });
  else {
    toast('已记下', () => void softDelete('symptoms', row.id));
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
  toast('已删除', () => void restore(table, id));
}

export async function updateProfile(patch: Partial<Profile>): Promise<void> {
  await db.profile.update('me', patch);
}

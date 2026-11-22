/**
 * 导出和导入。邮箱同步上线前，这是防丢数据的办法：一键导出，换手机再导入。
 */
import { alertTitle, showsAlert } from '../core/alert';
import { DEFAULT_REGION, doseUnitLabel, drugById, drugLabel, regimenLabel, type DoseUnit } from '../core/catalog';
import type { Lang } from '../core/i18n';
import { siteLabel, type Site } from '../core/schedule';
import { symptomLabel } from '../core/symptoms';
import type { TriageId, TriageLevel } from '../core/triage';
import type { Profile } from '../core/types';
import { zonedParts } from '../core/tz';
import { fromKg, unitLabel, type WeightUnit } from '../core/units';
import { db, RECORD_TABLES, type RecordTable } from './db';
import { saveViaClaude } from './cloud';
import { features } from './features';
import { ROUTINE_IDS, routineTitle, type Routine } from './content/workouts';
import { translator } from './i18n/translate';

export interface Backup {
  app: 'glp1-companion';
  version: 1;
  exportedAt: number;
  profile: Profile | null;
  tables: Record<RecordTable, unknown[]>;
}

export async function buildBackup(): Promise<Backup> {
  const tables = {} as Record<RecordTable, unknown[]>;
  for (const t of RECORD_TABLES) tables[t] = (await db.table(t).toArray()).filter((r: { deletedAt: number | null }) => r.deletedAt === null);
  return { app: 'glp1-companion', version: 1, exportedAt: Date.now(), profile: (await db.profile.get('me')) ?? null, tables };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * All records as a spreadsheet, in the given language.
 * Chinese output is unchanged: generic drug names, weights in kilograms, and the stored codes
 * for workouts and alerts. English names the medication, the workout and the alert the way the
 * screens do, and writes weights in the profile's unit.
 */
export async function buildCsv(lang: Lang): Promise<string> {
  const b = await buildBackup();
  const t = translator(lang);
  const english = lang === 'en';
  const profile = b.profile;
  const rows: string[][] = [[t('csv.date'), t('csv.time'), t('csv.tz'), t('csv.type'), t('csv.item'), t('csv.value'), t('csv.unit'), t('csv.note')]];
  const when = (ms: number, tz: string) => {
    const p = zonedParts(ms, tz);
    const pad = (n: number) => String(n).padStart(2, '0');
    return [`${p.year}-${pad(p.month)}-${pad(p.day)}`, `${pad(p.hour)}:${pad(p.minute)}`];
  };
  type R = { occurredAt: number; tz: string } & Record<string, unknown>;
  const push = (r: R, type: string, label: string, value: unknown, unit: string, note = '') => rows.push([...when(r.occurredAt, r.tz), r.tz, type, label, String(value ?? ''), unit, note]);
  const drugName = (drugId: string) => {
    const entry = drugById(drugId);
    if (!english) return entry.generic[lang];
    const reg = profile?.regimen;
    return reg && reg.drugId === drugId ? regimenLabel(reg, profile.region, lang) : drugLabel(entry, profile?.region ?? DEFAULT_REGION, lang);
  };
  const weightUnit: WeightUnit = english ? (profile?.weightUnit ?? 'kg') : 'kg';
  const weightValue = (kg: number) => (english ? Math.round(fromKg(kg, weightUnit) * 10) / 10 : kg);
  for (const r of b.tables.doses as R[]) push(r, t('csv.type.dose'), drugName(String(r.drugId)), r.amount, english ? doseUnitLabel(r.unit as DoseUnit, lang) : String(r.unit), r.site ? siteLabel(r.site as Site, lang) : '');
  for (const r of b.tables.foods as R[]) push(r, t('csv.type.food'), String(r.text), r.proteinG, t('csv.gramsProtein'), r.lowG !== undefined ? t('csv.range', { low: String(r.lowG), high: String(r.highG) }) : '');
  for (const r of b.tables.weights as R[]) push(r, t('csv.type.weight'), t('csv.type.weight'), weightValue(Number(r.kg)), english ? unitLabel(weightUnit, lang) : 'kg');
  // English writes the title of the alert card that was shown, not its internal code.
  const alertNote = (r: R) => {
    if (!r.triageId) return '';
    if (!english) return t('csv.alert', { alert: String(r.triageId) });
    // The card this build shows for the alert: the card of its rule, or the fixed card (core/alert.ts).
    const hit = { id: r.triageId as TriageId, level: (r.triageLevel ?? 'urgent') as TriageLevel };
    // A hit that shows no card in this build (the row came in with a restored backup) gets no note.
    if (!showsAlert(hit, features.triageDetailCards)) return '';
    return t('csv.alert', { alert: alertTitle(hit, profile?.region ?? DEFAULT_REGION, lang, features.triageDetailCards) ?? String(r.triageId) });
  };
  const routineName = (r: R) => (english && ROUTINE_IDS.includes(r.routine as Routine) ? routineTitle(r.routine as Routine, lang) : String(r.routine));
  const variantName = (r: R) => (english && (r.variant === 'light' || r.variant === 'standard') ? t(r.variant === 'light' ? 'workout.light' : 'workout.standard') : r.variant);
  for (const r of b.tables.symptoms as R[]) push(r, t('csv.type.symptom'), r.kind === 'other' ? String(r.note ?? '') : symptomLabel(String(r.kind), lang), r.grade, t('csv.grade'), alertNote(r));
  for (const r of b.tables.workouts as R[]) push(r, t('csv.type.workout'), routineName(r), variantName(r), '');
  for (const r of b.tables.questions as R[]) push(r, t('csv.type.question'), String(r.text), r.asked ? t('csv.asked') : t('csv.notAsked'), '');
  const byTime = (a: string[], b2: string[]) => (a[0] + a[1] < b2[0] + b2[1] ? -1 : 1);
  if (english) {
    const [header, ...data] = rows;
    rows.splice(0, rows.length, header, ...data.sort(byTime));
  } else {
    // The Chinese file has always sorted the header row together with the records, which leaves
    // it on the last line. That is kept as it was; whether to move it is a separate decision.
    rows.sort(byTime);
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

export async function download(name: string, content: string, type: string): Promise<void> {
  if (features.hostServices && (await saveViaClaude(name, content, type).catch(() => false))) return;
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Why a backup file was refused. The screen turns the code into text in the user's language. */
export class BackupError extends Error {
  constructor(public readonly code: 'not_ours' | 'bad_format') {
    super(code);
  }
}

export async function importBackup(json: string): Promise<number> {
  let b: Backup;
  try {
    b = JSON.parse(json) as Backup;
  } catch {
    // Not JSON at all. The parser's own message is not something to show a user.
    throw new BackupError('bad_format');
  }
  if (b === null || typeof b !== 'object' || b.app !== 'glp1-companion' || b.version !== 1) throw new BackupError('not_ours');
  if (b.tables === null || typeof b.tables !== 'object') throw new BackupError('bad_format');
  let n = 0;
  await db.transaction('rw', [db.profile, ...RECORD_TABLES.map((t) => db.table(t))], async () => {
    if (b.profile) await db.profile.put(b.profile);
    for (const t of RECORD_TABLES) {
      const rows = (b.tables[t] ?? []) as { id: string }[];
      if (!Array.isArray(rows) || rows.some((r) => r === null || typeof r !== 'object' || typeof r.id !== 'string')) throw new BackupError('bad_format');
      await db.table(t).bulkPut(rows);
      n += rows.length;
    }
  });
  return n;
}

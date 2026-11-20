/**
 * 导出和导入。邮箱同步上线前，这是防丢数据的办法：一键导出，换手机再导入。
 */
import { drugById } from '../core/catalog';
import type { Profile } from '../core/types';
import { zonedParts } from '../core/tz';
import { db, RECORD_TABLES, type RecordTable } from './db';
import { SITE_LABEL, symptomLabel } from './content/labels';

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

export async function buildCsv(): Promise<string> {
  const b = await buildBackup();
  const rows: string[][] = [['日期', '时间', '时区', '类型', '内容', '数值', '单位', '备注']];
  const when = (ms: number, tz: string) => {
    const p = zonedParts(ms, tz);
    const pad = (n: number) => String(n).padStart(2, '0');
    return [`${p.year}-${pad(p.month)}-${pad(p.day)}`, `${pad(p.hour)}:${pad(p.minute)}`];
  };
  type R = { occurredAt: number; tz: string } & Record<string, unknown>;
  const push = (r: R, type: string, label: string, value: unknown, unit: string, note = '') => rows.push([...when(r.occurredAt, r.tz), r.tz, type, label, String(value ?? ''), unit, note]);
  for (const r of b.tables.doses as R[]) push(r, '用药', drugById(String(r.drugId)).generic.hans, r.amount, String(r.unit), r.site ? SITE_LABEL[r.site as keyof typeof SITE_LABEL] : '');
  for (const r of b.tables.foods as R[]) push(r, '饮食', String(r.text), r.proteinG, '克蛋白', r.lowG !== undefined ? `范围 ${r.lowG}–${r.highG}` : '');
  for (const r of b.tables.weights as R[]) push(r, '体重', '体重', r.kg, 'kg');
  for (const r of b.tables.symptoms as R[]) push(r, '症状', r.kind === 'other' ? String(r.note ?? '') : symptomLabel(String(r.kind)), r.grade, '0–3 级', r.triageId ? `分诊：${r.triageId}` : '');
  for (const r of b.tables.workouts as R[]) push(r, '训练', String(r.routine), r.variant, '');
  for (const r of b.tables.questions as R[]) push(r, '想问医生', String(r.text), r.asked ? '已问' : '未问', '');
  rows.sort((a, b2) => (a[0] + a[1] < b2[0] + b2[1] ? -1 : 1));
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

export function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importBackup(json: string): Promise<number> {
  const b = JSON.parse(json) as Backup;
  if (b.app !== 'glp1-companion' || b.version !== 1) throw new Error('不是这个 App 导出的备份文件');
  let n = 0;
  await db.transaction('rw', [db.profile, ...RECORD_TABLES.map((t) => db.table(t))], async () => {
    if (b.profile) await db.profile.put(b.profile);
    for (const t of RECORD_TABLES) {
      const rows = (b.tables[t] ?? []) as { id: string }[];
      if (rows.some((r) => typeof r.id !== 'string')) throw new Error('备份文件格式不对');
      await db.table(t).bulkPut(rows);
      n += rows.length;
    }
  });
  return n;
}

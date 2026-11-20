/**
 * 本地数据库（IndexedDB）。所有记录先写本地，断网可用。
 * 删除一律软删除（deletedAt），方便撤销和以后同步。
 */
import Dexie, { type Table } from 'dexie';
import type { BaseRecord, DoctorQuestion, DoseEvent, FoodLog, Profile, Source, SymptomLog, WeightLog, WorkoutLog } from '../core/types';

export type SymptomRow = SymptomLog & { ack?: boolean };

export class AppDB extends Dexie {
  profile!: Table<Profile, string>;
  doses!: Table<DoseEvent, string>;
  foods!: Table<FoodLog, string>;
  weights!: Table<WeightLog, string>;
  symptoms!: Table<SymptomRow, string>;
  workouts!: Table<WorkoutLog, string>;
  questions!: Table<DoctorQuestion, string>;

  constructor(name = 'glp1-companion') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      doses: 'id, occurredAt',
      foods: 'id, occurredAt',
      weights: 'id, occurredAt',
      symptoms: 'id, occurredAt',
      workouts: 'id, occurredAt',
      questions: 'id, occurredAt',
    });
  }
}

export const db = new AppDB();

export const RECORD_TABLES = ['doses', 'foods', 'weights', 'symptoms', 'workouts', 'questions'] as const;
export type RecordTable = (typeof RECORD_TABLES)[number];

export function deviceTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function base(source: Source, occurredAt = Date.now()): BaseRecord {
  const now = Date.now();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null, occurredAt, tz: deviceTz(), source };
}

export async function softDelete(table: RecordTable, id: string): Promise<void> {
  await db.table(table).update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
}

export async function restore(table: RecordTable, id: string): Promise<void> {
  await db.table(table).update(id, { deletedAt: null, updatedAt: Date.now() });
}

/** 写入第一条记录后，申请"持久存储"，降低浏览器清理本地数据的概率。 */
export async function requestPersist(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* 不支持就算了 */
  }
}

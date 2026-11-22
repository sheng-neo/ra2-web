import type { DoseUnit, Region } from './catalog';
import type { Lang } from './i18n';
import type { Schedule, Site } from './schedule';
import type { SymptomKind, TriageId, TriageLevel } from './triage';
import type { WeightUnit } from './units';

export type Source = 'quick' | 'text' | 'label' | 'photo' | 'manual' | 'import';
export type CourseStatus = 'not_started' | 'escalating' | 'maintenance' | 'paused' | 'stopped';

export interface BaseRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** 发生时间，UTC 毫秒。 */
  occurredAt: number;
  /** 记录时所在时区。 */
  tz: string;
  source: Source;
}

export interface DoseEvent extends BaseRecord {
  drugId: string;
  amount: number;
  unit: DoseUnit;
  site: Site | null;
  note?: string;
}

export interface FoodLog extends BaseRecord {
  text: string;
  proteinG: number;
  lowG?: number;
  highG?: number;
  kcal?: number | null;
  foodId?: string;
}

export interface WeightLog extends BaseRecord {
  kg: number;
}

export interface SymptomLog extends BaseRecord {
  kind: SymptomKind | 'other';
  grade: number;
  note?: string;
  triageId?: TriageId | null;
  triageLevel?: TriageLevel | null;
}

export interface WorkoutLog extends BaseRecord {
  routine: 'bodyweight' | 'band' | 'dumbbell';
  variant: 'standard' | 'light';
}

export interface DoctorQuestion extends BaseRecord {
  text: string;
  asked: boolean;
}

export interface Safety {
  kidneyOrLiver: boolean;
  pregnancy: boolean;
  insulinOrSU: boolean;
  eatingDisorder: boolean;
  under18: boolean;
}

export interface Regimen {
  drugId: string;
  /**
   * Brand the user picked (a canonical name from the catalog, for example "Zepbound").
   * Several brands can share one catalog entry; this keeps them apart on screen.
   * Missing on older profiles: the label then lists every brand of the region.
   */
  brand?: string | null;
  customName?: string;
  doseAmount: number | null;
  doseUnit: DoseUnit;
  schedule: Schedule;
  status: CourseStatus;
  /** 引导时填的"当前剂量用了几周"，用于判断是否已达稳态。 */
  weeksOnDoseAtStart?: number | null;
  stoppedAt?: number | null;
}

export interface Profile {
  id: 'me';
  /**
   * Interface language. Optional: profiles saved before this field existed have none and stay
   * Chinese. Always read it through profileLang() in i18n.ts, never directly.
   */
  lang?: Lang;
  /** Older field, kept for backward compatibility. New profiles set it with scriptFor(lang). */
  script: 'hans' | 'hant';
  region: Region;
  weightUnit: WeightUnit;
  heightCm: number | null;
  startWeightKg: number | null;
  goalWeightKg: number | null;
  birthYear: number | null;
  dayStartHour: number;
  tz: string;
  safety: Safety;
  proteinMode: 'auto' | 'manual' | 'off';
  proteinManualG: number | null;
  /** null = 还没问过；false = 拒绝使用 AI。 */
  aiConsent: boolean | null;
  regimen: Regimen | null;
  onboardedAt: number | null;
  /** 用户自己最常记的食物（按次数排序后取前 3），用于快捷按钮。 */
  largeText: boolean;
}

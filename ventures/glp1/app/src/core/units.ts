import type { Region } from './catalog';
import type { Lang } from './i18n';

export type WeightUnit = 'kg' | 'jin' | 'lb';

const LB = 0.45359237;

export function toKg(v: number, u: WeightUnit): number {
  if (u === 'jin') return v / 2;
  if (u === 'lb') return v * LB;
  return v;
}

export function fromKg(kg: number, u: WeightUnit): number {
  if (u === 'jin') return kg * 2;
  if (u === 'lb') return kg / LB;
  return kg;
}

/**
 * A weight as it is stored: kilograms with two decimals. One decimal is not enough for pounds:
 * 182.4 lb would be stored as 82.7 kg and read back as 182.3 lb.
 */
export function storedKg(kg: number): number {
  return Math.round(kg * 100) / 100;
}

export function fmtWeight(kg: number, u: WeightUnit, lang: Lang): string {
  return `${(Math.round(fromKg(kg, u) * 10) / 10).toFixed(1)} ${unitLabel(u, lang)}`;
}

/**
 * The difference between two weights, with its sign: "−1.2 lb", "+0.4 lb", "0.0 lb".
 * Each weight is rounded the way fmtWeight shows it before the two are subtracted, so the
 * difference always agrees with the two numbers the person can see in their log.
 */
export function fmtWeightChange(firstKg: number, lastKg: number, u: WeightUnit, lang: Lang): string {
  const shown = (kg: number) => Math.round(fromKg(kg, u) * 10);
  const tenths = shown(lastKg) - shown(firstKg);
  const sign = tenths > 0 ? '+' : tenths < 0 ? '−' : '';
  return `${sign}${(Math.abs(tenths) / 10).toFixed(1)} ${unitLabel(u, lang)}`;
}

export function unitLabel(u: WeightUnit, lang: Lang): string {
  if (lang === 'en') return u;
  return u === 'kg' ? '公斤' : u === 'jin' ? '斤' : '磅';
}

/**
 * Weight units to offer in a picker, in display order.
 * 'jin' is a Chinese unit and is offered only in Chinese. A profile that already uses it keeps
 * working in any language (unitLabel returns "jin" in English).
 */
export function weightUnitsFor(lang: Lang): WeightUnit[] {
  return lang === 'en' ? ['lb', 'kg'] : ['kg', 'jin', 'lb'];
}

/** Starting weight unit for a new profile. */
export function defaultWeightUnit(lang: Lang, region: Region): WeightUnit {
  if (region === 'US') return 'lb';
  if (region === 'CN' && lang !== 'en') return 'jin';
  return 'kg';
}

// ── Height ───────────────────────────────────────────────────────────────────
// Height is always stored in centimetres (Profile.heightCm). Feet and inches are only for
// input and display.

export type HeightUnit = 'cm' | 'ft_in';

const CM_PER_IN = 2.54;

export interface FeetInches {
  ft: number;
  inches: number;
}

/** Centimetres to feet and whole inches, rounded to the nearest inch (so never "5 ft 12 in"). */
export function cmToFtIn(cm: number): FeetInches {
  const total = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(total / 12), inches: total % 12 };
}

/** Feet and inches to centimetres, rounded to 0.1 cm. Inches may be a fraction or more than 11. */
export function ftInToCm(ft: number, inches = 0): number {
  return Math.round((ft * 12 + inches) * CM_PER_IN * 10) / 10;
}

/** English with pounds uses feet and inches. Chinese keeps centimetres, as before. */
export function heightUnitFor(lang: Lang, weightUnit: WeightUnit): HeightUnit {
  return lang === 'en' && weightUnit === 'lb' ? 'ft_in' : 'cm';
}

export function heightUnitLabel(u: HeightUnit, lang: Lang): string {
  if (lang === 'en') return u === 'cm' ? 'cm' : 'ft, in';
  return u === 'cm' ? '厘米' : '英尺、英寸';
}

export function fmtHeight(cm: number, u: HeightUnit, lang: Lang): string {
  if (u === 'cm') return `${Math.round(cm)} ${lang === 'en' ? 'cm' : '厘米'}`;
  const { ft, inches } = cmToFtIn(cm);
  return lang === 'en' ? `${ft} ft ${inches} in` : `${ft} 英尺 ${inches} 英寸`;
}

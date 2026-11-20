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

export function fmtWeight(kg: number, u: WeightUnit): string {
  return `${(Math.round(fromKg(kg, u) * 10) / 10).toFixed(1)} ${unitLabel(u)}`;
}

export function unitLabel(u: WeightUnit): string {
  return u === 'kg' ? '公斤' : u === 'jin' ? '斤' : '磅';
}

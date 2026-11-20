/**
 * 蛋白目标（PRD v2.0 第 3.2 节）。综合几份专家建议：
 * - Almandoz 等 2024（Obesity）：>60–75 g/天，0.8–1.5 g/kg；
 * - AACE 2025：1.2–1.5 g/kg；
 * 计算基准用"参考体重"，BMI ≥ 28 时改用调整体重。
 * 【待营养师或医生确认】阈值和公式上线前需要审核。
 */

export interface ProteinInput {
  heightCm: number;
  weightKg: number;
  /** 有肾病或肝病：不自动设目标。 */
  kidneyOrLiver: boolean;
  mode: 'auto' | 'manual' | 'off';
  manualG?: number | null;
}

export type ProteinTarget =
  | { kind: 'auto'; floorG: number; idealLowG: number; idealHighG: number; capG: number; refWeightKg: number }
  | { kind: 'manual'; floorG: number }
  | { kind: 'ask_doctor' }
  | { kind: 'off' };

export function bmi(heightCm: number, weightKg: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function referenceWeightKg(heightCm: number, weightKg: number): number {
  const m = heightCm / 100;
  if (bmi(heightCm, weightKg) < 28) return weightKg;
  const ibw = 22 * m * m;
  return ibw + 0.4 * (weightKg - ibw);
}

export function proteinTarget(inp: ProteinInput): ProteinTarget {
  if (inp.mode === 'off') return { kind: 'off' };
  if (inp.mode === 'manual' && inp.manualG && inp.manualG > 0) return { kind: 'manual', floorG: Math.round(inp.manualG) };
  if (inp.kidneyOrLiver) return { kind: 'ask_doctor' };
  if (!(inp.heightCm > 0) || !(inp.weightKg > 0)) return { kind: 'off' };
  const ref = referenceWeightKg(inp.heightCm, inp.weightKg);
  return {
    kind: 'auto',
    refWeightKg: Math.round(ref * 10) / 10,
    floorG: Math.round(Math.max(60, 1.0 * ref)),
    idealLowG: Math.round(1.2 * ref),
    idealHighG: Math.round(1.5 * ref),
    capG: Math.round(2.0 * ref),
  };
}

/** 晚间补救提醒：距上一餐 ≥ 3 小时、缺口 ≥ 25 g 才发。 */
export function shouldRescue(totalG: number, floorG: number, lastMealMs: number | null, nowMs: number): boolean {
  const gap = floorG - totalG;
  if (gap < 25) return false;
  if (lastMealMs !== null && nowMs - lastMealMs < 3 * 3_600_000) return false;
  return true;
}

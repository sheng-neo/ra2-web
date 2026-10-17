// ===== data/techBaseYears.ts =====（spec:disasters-events §2.9 科技发明时间线；spec:file-formats MISC 0x0738–0x0778）
// 基准年：实际发明年 = 基准年 + rng % 20；低于开局年则开局即有（写 0）。
// 机场取 1927：spec:building-catalogue §4.1 裁定"取所有者规格（services）值进 TECH_BASE_YEAR"（disasters 表为 1930 [低]，两者皆低置信）。
import type { TechKey } from '../contracts/catalogue';

export const TECH_BASE_YEAR: Readonly<Record<TechKey, number>> = {
  gas: 1950,
  nuclear: 1955,
  solar: 1990,
  wind: 1980,
  microwave: 2020,
  fusion: 2050,
  airport: 1927,
  highways: 1930,
  buses: 1920,
  subways: 1910,
  waterTreatment: 1935,
  desalinization: 1990,
  arcoPioneer: 2000,
  arcoCanopy: 2050,
  arcoDusk: 2100,
  arcoSkyward: 2150,
};

/** 发明年份随机延迟上限（不含）：invented = base + rng.int(TECH_DELAY_YEARS)。 */
export const TECH_DELAY_YEARS = 20;

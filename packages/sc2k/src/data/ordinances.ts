// ===== data/ordinances.ts =====（spec:economy-budget §2.5 / §3.2 逐条转录；需求乘数的 owner 是 spec:zones §2.8.4，catalogue.test 对账）
// 20 条法令：位序 = OrdinanceId（MISC 0x0FA0 低 20 位）；money.pct 为该类月税收的百分比（可为分数：1/6% = monthlyTax × 1 / 600）；
// availableYear 0 = 始终可用（原版年代灰显未证实，字段留作开关）。key 为 strings 键后缀：ordinance.<key>。
import { OrdinanceId } from '../contracts/state';
import type { OrdinanceDef } from '../contracts/catalogue';

export const ORDINANCES: readonly OrdinanceDef[] = [
  { id: OrdinanceId.SalesTax, group: 'finance', key: 'salesTax', availableYear: 0, money: { base: 'C', pct: { num: 1, den: 1 }, sign: 1 }, demand: { c: 0.99 } },
  { id: OrdinanceId.IncomeTax, group: 'finance', key: 'incomeTax', availableYear: 0, money: { base: 'R', pct: { num: 1, den: 1 }, sign: 1 }, demand: { r: 0.99 } },
  { id: OrdinanceId.LegalizedGambling, group: 'finance', key: 'gambling', availableYear: 0, money: { base: 'C', pct: { num: 2, den: 1 }, sign: 1 }, demand: {} },
  { id: OrdinanceId.ParkingFines, group: 'finance', key: 'parkingFines', availableYear: 0, money: { base: 'R', pct: { num: 1, den: 2 }, sign: 1 }, demand: {} },
  { id: OrdinanceId.ProReading, group: 'educationSafety', key: 'proReading', availableYear: 0, money: { base: 'R', pct: { num: 1, den: 6 }, sign: -1 }, demand: {} },
  { id: OrdinanceId.AntiDrug, group: 'educationSafety', key: 'antiDrug', availableYear: 0, money: { base: 'R', pct: { num: 1, den: 5 }, sign: -1 }, demand: {} },
  { id: OrdinanceId.CprTraining, group: 'educationSafety', key: 'cprTraining', availableYear: 0, money: { base: 'R', pct: { num: 1, den: 6 }, sign: -1 }, demand: {} },
  { id: OrdinanceId.NeighborhoodWatch, group: 'educationSafety', key: 'nbhdWatch', availableYear: 0, money: { base: 'R', pct: { num: 1, den: 3 }, sign: -1 }, demand: {} },
  { id: OrdinanceId.EnergyConservation, group: 'environment', key: 'energyCons', availableYear: 0, money: { base: 'All', pct: { num: 1, den: 2 }, sign: -1 }, demand: {} },
  { id: OrdinanceId.NuclearFreeZone, group: 'environment', key: 'nuclearFree', availableYear: 0, money: null, demand: {}, forbidNuclear: true },
  { id: OrdinanceId.HomelessShelter, group: 'environment', key: 'homelessShelter', availableYear: 0, money: { base: 'R', pct: { num: 1, den: 2 }, sign: -1 }, demand: { c: 1.01 } },
  { id: OrdinanceId.PollutionControls, group: 'environment', key: 'pollutionCtrl', availableYear: 0, money: { base: 'I', pct: { num: 1, den: 1 }, sign: -1 }, demand: { i: 0.99 } },
  { id: OrdinanceId.VolunteerFire, group: 'healthSafety', key: 'volunteerFire', availableYear: 0, money: { base: 'R', pct: { num: 1, den: 3 }, sign: -1 }, demand: {} },
  { id: OrdinanceId.SmokingBan, group: 'healthSafety', key: 'smokingBan', availableYear: 0, money: { base: 'R', pct: { num: 1, den: 6 }, sign: -1 }, demand: {} },
  { id: OrdinanceId.FreeClinics, group: 'healthSafety', key: 'freeClinics', availableYear: 0, money: { base: 'R', pct: { num: 1, den: 2 }, sign: -1 }, demand: {} },
  { id: OrdinanceId.JuniorSports, group: 'healthSafety', key: 'juniorSports', availableYear: 0, money: { base: 'R', pct: { num: 1, den: 4 }, sign: -1 }, demand: {} },
  { id: OrdinanceId.TouristAdvertising, group: 'promotional', key: 'touristAd', availableYear: 0, money: { base: 'C', pct: { num: 1, den: 1 }, sign: -1 }, demand: { c: 1.01 }, advertising: true },
  { id: OrdinanceId.BusinessAdvertising, group: 'promotional', key: 'businessAd', availableYear: 0, money: { base: 'I', pct: { num: 1, den: 1 }, sign: -1 }, demand: { i: 1.01 }, advertising: true },
  { id: OrdinanceId.CityBeautification, group: 'promotional', key: 'beautification', availableYear: 0, money: { base: 'R', pct: { num: 1, den: 4 }, sign: -1 }, demand: { r: 1.01 } },
  { id: OrdinanceId.AnnualCarnival, group: 'promotional', key: 'carnival', availableYear: 0, money: { base: 'C', pct: { num: 1, den: 3 }, sign: -1 }, demand: { c: 1.01 } },
];

export const ORDINANCE_COUNT = 20;

// ===== sim/services/phases.ts =====
// 服务系统的阶段体（PHASE_OWNER 归 services 者）：demographics（第 21 天，v1 简化）、milestones（第 22 天）、cityStatus（第 24 天诉求链）、
// facilityAnnual（1 月第 0 天年度微模拟更新）。dataMaps / trafficDecay 的本体在 dataMaps.ts / traffic.ts。
// 规格：spec:services §2.6.2 / §2.7 / §2.8.1 / §2.10.4。
import { NewsType } from '../../contracts/events';
import { TILES } from '../../contracts/grid';
import { BudgetLine } from '../../contracts/state';
import type { PhaseResult, SimContext } from '../../contracts/system';
import { microsimTypeOf, popCap, recStat, recStat0, recTileId, setStat, setStat0 } from './microsim';
import { airportRunwayGroups, seaportCranes, structureCounts } from './queries';
import { ARCO_REWARD_BIT, MICROSIM_RECORDS, MILESTONE_ARCO_LEVEL, MILESTONE_MILITARY_LEVEL, MILESTONE_REWARD_BIT, MicrosimType, Xbld } from './tables';
import type { ServicesTuning } from './tuning';
import { idiv } from './runtime';

// ---------- demographics（v1 简化：有界近似；§2.7 的年龄队列全量为 v2） ----------
export function runDemographics(ctx: SimContext, t: ServicesTuning): void {
  const d = ctx.state.demographics;
  const pop = ctx.state.census.normalPop;
  if (pop <= 0) { d.cohorts.fill(0); d.workforcePct = 0; d.workforceEQ = 0; d.workforceLE = 0; return; }
  const w = t.workforceV1;
  const sc = structureCounts(ctx.state);
  const fund = (line: BudgetLine): number => ctx.q.economy.funding(line);
  const schoolCap = idiv(sc.school * fund(BudgetLine.Schools) * w.schoolPerSchool, 100);
  const collegeCap = idiv(sc.college * fund(BudgetLine.Colleges) * w.collegePerCollege, 100);
  const healthCap = idiv(sc.hospital * fund(BudgetLine.Health) * w.healthPerHospital, 100);
  const eduPermille = idiv((schoolCap + collegeCap) * 1000, pop + 1);
  const eduBonus = Math.min(w.eduBonusMaxPct, idiv(eduPermille, Math.max(1, w.eduPermillePerPct)));
  const healthPermille = idiv(healthCap * 1000, pop + 1);
  d.workforcePct = w.basePct + eduBonus;
  d.workforceEQ = w.eqBase + eduBonus * w.eqPerBonusPct;
  d.workforceLE = Math.min(w.leMax, w.leBase + healthPermille * w.lePerHealthPermille);
}

// ---------- milestones（第 22 天） ----------
const ARCO_TECHS = ['arcoPioneer', 'arcoCanopy', 'arcoDusk', 'arcoSkyward'] as const;
const anyArcoInvented = (ctx: SimContext): boolean => ARCO_TECHS.some((k) => ctx.q.tech.invented(k));

export function runMilestones(ctx: SimContext, t: ServicesTuning): PhaseResult {
  const r = ctx.state.rewards;
  const pop = ctx.state.census.normalPop;        // 不含巨型住区人口
  let result: PhaseResult = 'done';
  const grant = (bit: number): void => {
    r.grantedMask |= 1 << bit;
    ctx.act.emit({ type: 'reward', bit });
    ctx.act.emit({ type: 'toolbar', reason: 'reward' });
  };
  if (r.progression < t.milestones.length && pop > t.milestones[r.progression]!) {   // 严格大于、每月至多一级
    const old = r.progression;
    r.progression = old + 1;
    const p = r.progression;
    ctx.act.emit({ type: 'milestone', progression: p });
    ctx.act.news(NewsType.Growth, old);
    const bit = MILESTONE_REWARD_BIT[p];
    if (bit !== undefined && p !== MILESTONE_ARCO_LEVEL) grant(bit);
    if (p === MILESTONE_MILITARY_LEVEL) {
      if (t.militaryOfferModal) { ctx.act.emit({ type: 'modal', id: 'militaryOffer', payload: null }); result = 'suspend'; }
      else ctx.act.emit({ type: 'militaryOffer' });                 // v1：只通知，不挂起（军事基地 v2）
    }
  }
  // 巨型住区位：进度 ≥ 6 且至少一种已发明时置位（每月重评，科技晚于人口到来也能解锁）
  if (r.progression >= MILESTONE_ARCO_LEVEL && ((r.grantedMask >>> ARCO_REWARD_BIT) & 1) === 0 && anyArcoInvented(ctx)) grant(ARCO_REWARD_BIT);
  return result;
}

// ---------- cityStatus（第 24 天诉求链） ----------
export interface Demand { complaint: string; news: NewsType }
const D = {
  power: { complaint: 'complaint.power', news: NewsType.DemandPower }, road: { complaint: 'complaint.road', news: NewsType.DemandTransit },
  police: { complaint: 'complaint.police', news: NewsType.DemandPolice }, fire: { complaint: 'complaint.fire', news: NewsType.DemandFire },
  water: { complaint: 'complaint.water', news: NewsType.DemandWater }, hospital: { complaint: 'complaint.hospital', news: NewsType.DemandHospital },
  school: { complaint: 'complaint.school', news: NewsType.DemandSchool }, seaport: { complaint: 'complaint.seaport', news: NewsType.DemandSeaport },
  connection: { complaint: 'complaint.connection', news: NewsType.DemandIndustrialConnection }, airport: { complaint: 'complaint.airport', news: NewsType.DemandAirport },
  park: { complaint: 'complaint.park', news: NewsType.DemandPark }, zoo: { complaint: 'complaint.zoo', news: NewsType.DemandZoo },
  stadium: { complaint: 'complaint.stadium', news: NewsType.DemandStadium }, marina: { complaint: 'complaint.marina', news: NewsType.DemandMarina },
} as const satisfies Record<string, Demand>;
const RECREATION: readonly Demand[] = [D.park, D.zoo, D.stadium, D.marina];

function hasAnyWater(ctx: SimContext): boolean {
  for (let i = 0; i < TILES; i++) if (ctx.q.terrain.isWater(i)) return true;
  return false;
}

/** 第一条未满足诉求（顺序即优先级，spec:services §2.10.4）；空城不诉求。 */
export function firstUnmetDemand(ctx: SimContext, t: ServicesTuning): Demand | null {
  const s = ctx.state, st = t.status, pop = s.census.normalPop, tile = s.counts.tile;
  if (ctx.q.utilities.lastPower().usagePct >= st.powerUsageNeed) return D.power;
  if (pop <= 0) return null;
  const sc = structureCounts(s);
  const stations = tile[Xbld.SubwayStation]! + idiv(tile[Xbld.RailDepot]!, 4);
  if (idiv(pop, st.roadPopDivisor) >= stations + ctx.q.transport.roadTileCounts().roadTiles) return D.road;
  if (pop < st.minPopPolice) return null;
  const u = idiv(pop, st.popPerPolice);
  if (u >= sc.police + sc.prison) return D.police;
  if (u >= sc.fire) return D.fire;
  if (ctx.q.utilities.lastWater().usagePct >= st.waterUsageNeed) return D.water;
  if (pop < st.minPopHospital) return null;
  if (idiv(pop, st.popPerHospital) >= sc.hospital) return D.hospital;
  if (u >= sc.school) return D.school;
  if (pop < st.minPopPorts) return null;
  const conn = ctx.q.transport.connections();
  if (seaportCranes(s) + conn.industry < idiv(s.census.ind, st.popPerPortUnit)) return hasAnyWater(ctx) ? D.seaport : D.connection;
  if (airportRunwayGroups(s) + conn.commerce < idiv(s.census.com, st.popPerPortUnit)) return D.airport;
  if (pop >= st.minPopRecreation && s.caps.r > 0 && s.census.res >= s.caps.r) return ctx.prng.pick(RECREATION);
  return null;
}

export function runCityStatus(ctx: SimContext, t: ServicesTuning): void {
  const d = firstUnmetDemand(ctx, t);
  ctx.act.emit({ type: 'complaint', key: d ? d.complaint : null });
  if (!d) return;
  ctx.act.emit({ type: 'citizenDemand', key: d.complaint });
  ctx.act.news(d.news, 0);
}

// ---------- facilityAnnual（每年 1 月；按记录序遍历，随机调用顺序 = 记录顺序） ----------
/** score(num, den, slope, best, zero)：ratio < best → 12；< zero → (zero − 1 − ratio) / slope；否则 0。 */
export function score(num: number, den: number, params: readonly [number, number, number]): number {
  const [slope, best, zero] = params;
  const ratio = idiv(num, Math.max(1, den));
  if (ratio < best) return 12;
  if (ratio < zero) return idiv(zero - 1 - ratio, slope);
  return 0;
}

export function runFacilityAnnual(ctx: SimContext, t: ServicesTuning): void {
  const s = ctx.state, xmic = s.layers.xmic, tile = s.counts.tile;
  const pop = s.census.normalPop;
  const fund = (line: BudgetLine): number => ctx.q.economy.funding(line);
  const rnd = (mask: number): number => ctx.prng.next15() & mask;
  const sc = structureCounts(s);
  const stadiums = idiv(tile[Xbld.Stadium]!, 16);
  const cohorts = s.demographics.cohorts;
  const cohortCount = (k: number): number => cohorts[k * 3]!;
  // v1 年龄队列为空时的学龄近似：5–14 岁 ≈ 12% 人口、15–19 岁 ≈ 7%
  const schoolAge = cohortCount(1) + cohortCount(2) || idiv(pop * 12, 100);
  const collegeAge = cohortCount(3) || idiv(pop * 7, 100);
  let arrestsSum = 0, prisonPctSum = 0, fundEdu = false, fundPrison = false;
  for (let r = 1; r < MICROSIM_RECORDS; r++) {
    const id = recTileId(xmic, r);
    if (id === 0) continue;
    const s0 = recStat0(xmic, r), s1 = recStat(xmic, r, 1), s2 = recStat(xmic, r, 2), s3 = recStat(xmic, r, 3);
    switch (microsimTypeOf(ctx, id)) {
      case MicrosimType.Police: {
        const f = fund(BudgetLine.Police);
        const reports = idiv(s.totals.crime, Math.max(1, sc.police));
        const arrests = rnd(0x0f) + idiv(reports, Math.max(1, 5 - s.rewards.prisonBonus));
        setStat0(xmic, r, f); setStat(xmic, r, 1, popCap(ctx, t, 2 * f, 90)); setStat(xmic, r, 2, reports); setStat(xmic, r, 3, arrests);
        arrestsSum += arrests;
        break;
      }
      case MicrosimType.Fire: {
        const f = fund(BudgetLine.Fire);
        const crew = popCap(ctx, t, idiv(f, 2), 70);
        setStat0(xmic, r, f); setStat(xmic, r, 1, crew); setStat(xmic, r, 2, (crew >> 4) + 1); setStat(xmic, r, 3, ctx.prng.int(20) + 2);
        break;
      }
      case MicrosimType.Hospital: {
        const f = fund(BudgetLine.Health);
        let patients = idiv(pop, Math.max(1, sc.hospital * 25)) + rnd(0x0f);
        if (patients > 1000) patients = 1000 + rnd(0x7f);
        const p1 = popCap(ctx, t, patients, 30);
        const doctors = popCap(ctx, t, Math.max(0, f + rnd(7) + 2 * s0 - 24), 120);
        setStat(xmic, r, 3, idiv(f, 2)); setStat(xmic, r, 1, p1); setStat(xmic, r, 2, doctors); setStat0(xmic, r, score(10 * p1, doctors, t.score.hospital));
        break;
      }
      case MicrosimType.School: {
        const f = fund(BudgetLine.Schools);
        const f3 = idiv(f, 4);
        if (f3 < 20) fundEdu = true;
        let students = idiv(schoolAge, Math.max(1, sc.school)) + rnd(0x0f);
        if (students > 1500) students = 1500 + rnd(0xff);
        const p1 = popCap(ctx, t, students, 20);
        const teachers = popCap(ctx, t, Math.max(0, rnd(7) + idiv(6 * f, 10) + s0 - 12), 100);
        const grade = score(p1, teachers, t.score.school);
        if (grade < 4) fundEdu = true;
        setStat(xmic, r, 3, f3); setStat(xmic, r, 1, p1); setStat(xmic, r, 2, teachers); setStat0(xmic, r, grade);
        break;
      }
      case MicrosimType.College: {
        const f = fund(BudgetLine.Colleges);
        let students = idiv(collegeAge, Math.max(1, sc.college)) + rnd(0x1f);
        if (students > 5000) students = 5000 + rnd(0x1ff);
        const p1 = popCap(ctx, t, students, 30);
        const teachers = popCap(ctx, t, Math.max(0, rnd(0x0f) + 2 * f + 4 * s0 - 48), 100);
        setStat(xmic, r, 3, f); setStat(xmic, r, 1, p1); setStat(xmic, r, 2, teachers); setStat0(xmic, r, score(4 * p1, teachers, t.score.college));
        break;
      }
      case MicrosimType.Prison: {
        const fp = fund(BudgetLine.Police);
        let inmates = s1 - idiv(s1, 4) + idiv(s.rewards.oldArrests, Math.max(1, sc.prison));
        if (inmates > 10000) inmates = 10000 + rnd(0x3ff);
        const pct = idiv(inmates, 100);
        if (pct > 105) fundPrison = true;
        const escapes = pct < 91 ? 0 : ctx.prng.int(pct - 90 + idiv(100 - fp, 10));
        setStat(xmic, r, 1, popCap(ctx, t, inmates, 20)); setStat(xmic, r, 2, popCap(ctx, t, 3 * fp, 120)); setStat(xmic, r, 3, pct); setStat0(xmic, r, escapes);
        prisonPctSum += pct;
        break;
      }
      case MicrosimType.Stadium: {
        let att = idiv(pop + s.census.arcoPop, Math.max(1, stadiums));
        if (att > 25000) att = 25000 - rnd(0xff);
        setStat(xmic, r, 1, popCap(ctx, t, att, 5) + rnd(0xff)); setStat0(xmic, r, rnd(0x1f) + 9);
        break;
      }
      case MicrosimType.Zoo: setStat0(xmic, r, ctx.prng.int(100)); setStat(xmic, r, 1, ctx.prng.int(100)); setStat(xmic, r, 2, ctx.prng.int(100)); setStat(xmic, r, 3, ctx.prng.int(100)); break;
      case MicrosimType.Statue: setStat(xmic, r, 2, ctx.prng.int(42)); break;
      case MicrosimType.CityHall: setStat(xmic, r, 1, popCap(ctx, t, 200, 900)); break;
      case MicrosimType.MayorHouse: setStat(xmic, r, 2, s.rewards.mayorApproval); if (s3 > 0) { setStat(xmic, r, 3, s3 - 1); setStat0(xmic, r, s0 + 1); } break;
      case MicrosimType.Museum: {
        const n = tile[Xbld.Museum]!, f = fund(BudgetLine.Colleges);
        setStat(xmic, r, 1, popCap(ctx, t, 4 * n * f, 20)); setStat(xmic, r, 2, idiv(f, 10) * n);
        break;
      }
      case MicrosimType.Library: {
        const n = tile[Xbld.Library]!, f = fund(BudgetLine.Schools);
        const books = s2 + (f - 50) * n;
        setStat(xmic, r, 1, popCap(ctx, t, 4 * n * f, 18));
        if (books >= 1 && books <= 31999) setStat(xmic, r, 2, books);
        setStat0(xmic, r, Math.min(12, idiv(300 * n * f, Math.max(1, pop))));
        break;
      }
      case MicrosimType.Parks: {
        const area = tile[Xbld.SmallPark]! + tile[Xbld.BigPark]!;
        setStat(xmic, r, 1, Math.min(412 * s2, 65000, idiv(pop, 6))); setStat(xmic, r, 2, area); setStat(xmic, r, 3, popCap(ctx, t, idiv(area, 9), 120));
        break;
      }
      case MicrosimType.Marina: setStat(xmic, r, 1, popCap(ctx, t, ctx.prng.int(20) + 8 * tile[Xbld.Marina]!, 150)); break;
      case MicrosimType.GreatDome: {
        const v1 = idiv(pop, 8) + rnd(0x3ff);
        setStat0(xmic, r, rnd(0xff)); setStat(xmic, r, 1, v1); setStat(xmic, r, 2, rnd(0x7f) + idiv(v1, 8)); setStat(xmic, r, 3, rnd(0x3f) + idiv(v1, 16));
        break;
      }
      case MicrosimType.WaterTreatment: case MicrosimType.Desalination:
        setStat0(xmic, r, ctx.q.utilities.lastWater().usagePct + rnd(7)); setStat(xmic, r, 1, ctx.prng.int(100)); setStat(xmic, r, 2, Math.min(rnd(0x1f) + 135, idiv(pop, 50)));
        break;
      default: break;   // 巨型住区入住 / 升空 v2；电厂 / 车站归电水 / 交通
    }
  }
  s.rewards.oldArrests = Math.min(65535, arrestsSum);
  s.rewards.prisonBonus = sc.prison >= 1 && idiv(prisonPctSum, sc.prison) <= 79 ? 1 : 0;
  if (fundEdu) { ctx.act.emit({ type: 'fundEducation' }); ctx.act.news(NewsType.AngryTeachers, fund(BudgetLine.Schools)); }
  if (fundPrison) { ctx.act.emit({ type: 'fundPrison' }); ctx.act.news(NewsType.OvercrowdedPrisons, 0); }
  ctx.act.layerChanged('xmic');
}

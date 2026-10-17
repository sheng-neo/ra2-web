// ===== sim/services/save.ts =====
// .SC2 往返与读档重建（spec:services §3.6）：importFrom 读 MISC 标量（里程碑 / 奖励位 / 军事基地 / 球队 / 逮捕 / 监狱加成 / 三项总量 /
// 劳动力三项 / 年龄队列）；exportTo 写回同一组 + MISC 0x0030；postLoad 重建闭包缓存，source='sc2' 时重算城市中心与交通报告
// （不读写 MISC 0x1018/0x101C），source='snapshot' 时一律沿用快照值（不得改真源）。图层本身（XMIC / XLAB / XTXT / 八张图）由 core 拷贝。
import { COHORT_COUNT, MISC, cohortOffset, miscGet, miscSet } from '../../contracts/io';
import type { Sc2Document } from '../../contracts/io';
import type { Diagnostic, PostLoadSource, SimContext } from '../../contracts/system';
import { computeCityCenter, runDataMaps } from './dataMaps';
import { rebuildTrafficReport } from './traffic';
import type { ServicesTuning } from './tuning';
import type { ServicesRuntime } from './runtime';

const COHORT_FIELDS = ['count', 'eqSum', 'leSum'] as const;

export function importServices(ctx: SimContext, doc: Sc2Document, diag: Diagnostic[]): void {
  const s = ctx.state, m = doc.misc;
  const r = s.rewards;
  r.progression = Math.max(0, miscGet(m, MISC.cityStatus) | 0);
  r.grantedMask = miscGet(m, MISC.rewardsAvailable) & 0x1f;
  const mb = miscGet(m, MISC.militaryBase) | 0;
  r.militaryBase = (mb >= 0 && mb <= 5 ? mb : 0) as 0 | 1 | 2 | 3 | 4 | 5;
  r.stadiumTeams = miscGet(m, MISC.sportsTeams) | 0;
  r.oldArrests = Math.max(0, miscGet(m, MISC.oldArrests) | 0);
  r.prisonBonus = miscGet(m, MISC.policeBonus) !== 0 ? 1 : 0;
  s.totals.landValue = Math.max(0, miscGet(m, MISC.landValueSum) | 0);
  s.totals.crime = Math.max(0, miscGet(m, MISC.crimeSum) | 0);
  s.totals.pollution = Math.max(0, miscGet(m, MISC.pollution) | 0);
  const d = s.demographics;
  d.workforcePct = miscGet(m, MISC.workforcePct) | 0;
  d.workforceLE = miscGet(m, MISC.lifeExpectancy) | 0;
  d.workforceEQ = miscGet(m, MISC.educationQuotient) | 0;
  for (let k = 0; k < COHORT_COUNT; k++) for (let f = 0; f < 3; f++) d.cohorts[k * 3 + f] = miscGet(m, cohortOffset(k, COHORT_FIELDS[f]!)) | 0;
  if (mb < 0 || mb > 5) diag.push({ level: 'info', code: 'services.militaryBaseClamped', message: `MISC 0x0E4C 军事基地类型 ${mb} 越界，按 0 处理` });
}

export function exportServices(ctx: SimContext, doc: Sc2Document): void {
  const s = ctx.state, m = doc.misc, r = s.rewards, d = s.demographics;
  miscSet(m, MISC.cityStatus, r.progression); miscSet(m, MISC.rewardsAvailable, r.grantedMask); miscSet(m, MISC.militaryBase, r.militaryBase);
  miscSet(m, MISC.sportsTeams, r.stadiumTeams); miscSet(m, MISC.oldArrests, r.oldArrests); miscSet(m, MISC.policeBonus, r.prisonBonus);
  miscSet(m, MISC.landValueSum, s.totals.landValue); miscSet(m, MISC.crimeSum, s.totals.crime); miscSet(m, MISC.pollution, s.totals.pollution);
  miscSet(m, MISC.trafficCount, s.traffic.total);
  miscSet(m, MISC.workforcePct, d.workforcePct); miscSet(m, MISC.lifeExpectancy, d.workforceLE); miscSet(m, MISC.educationQuotient, d.workforceEQ);
  for (let k = 0; k < COHORT_COUNT; k++) for (let f = 0; f < 3; f++) miscSet(m, cohortOffset(k, COHORT_FIELDS[f]!), d.cohorts[k * 3 + f]!);
}

/** 任一读档后：重建闭包缓存；.SC2 路径另重算城市中心与交通报告（可选 recomputeOnLoad 重跑图层）。 */
export function postLoadServices(ctx: SimContext, rt: ServicesRuntime, t: ServicesTuning, source: PostLoadSource): void {
  rt.ctx = ctx;
  rt.pending = [];
  rt.airportTilesCache = -1;
  const s = ctx.state;
  if (source === 'sc2') {
    const c = computeCityCenter(s.layers.xbld);
    rt.centerHx = c.hx; rt.centerHy = c.hy;
    s.totals.centerX = c.hx * 2; s.totals.centerY = c.hy * 2;
    rebuildTrafficReport(s);
    if (t.recomputeOnLoad) runDataMaps(ctx, rt, t);
  } else {
    rt.centerHx = s.totals.centerX >> 1; rt.centerHy = s.totals.centerY >> 1;
  }
}

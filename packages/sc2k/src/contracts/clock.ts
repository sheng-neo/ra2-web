// ===== clock.ts =====（spec:economy §2.3 / §3.2；nationalAnnual 拆为 zones / economy 两个 PhaseId）
// 日程、owner、I/O 声明、固定顺序（CONTRACTS §G）：全仓库唯一的阶段表真源。
import type { Speed } from './state';
import type { SystemId } from './system';

export type PhaseId =
  | 'settleMonth' | 'closeYear' | 'techCheck' | 'nationalAnnual.zones' | 'nationalAnnual.economy' | 'neighborsAnnual'
  | 'approvalSurvey' | 'facilityAnnual' | 'utilitiesAnnual' | 'budgetWindow' | 'beginMonth'
  | 'powerScan' | 'dataMaps' | 'growthScan' | 'trafficDecay' | 'waterScan'
  | 'census' | 'demand' | 'demographics' | 'graphs' | 'milestones' | 'scenario' | 'solvency' | 'uiRefresh'
  | 'weatherAndDisaster' | 'cityStatus' | 'news';

export const DAY_PHASES: Readonly<Record<number, readonly PhaseId[]>> = {
  0: ['settleMonth', 'closeYear', 'techCheck', 'nationalAnnual.zones', 'nationalAnnual.economy', 'neighborsAnnual', 'approvalSurvey',
      'facilityAnnual', 'utilitiesAnnual', 'budgetWindow', 'beginMonth'],
  1: ['powerScan'], 2: ['dataMaps'],
  3: ['growthScan'], 4: ['growthScan'], 5: ['growthScan'], 6: ['growthScan'], 7: ['growthScan'], 8: ['growthScan'], 9: ['growthScan'], 10: ['growthScan'],
  11: ['growthScan'], 12: ['growthScan'], 13: ['growthScan'], 14: ['growthScan'], 15: ['growthScan'], 16: ['growthScan'], 17: ['growthScan'], 18: ['growthScan'],
  19: ['trafficDecay'], 20: ['waterScan'], 21: ['census', 'demand', 'demographics', 'graphs'],
  22: ['milestones', 'scenario', 'solvency'], 23: ['uiRefresh'], 24: ['weatherAndDisaster', 'cityStatus', 'news'] };

export const PHASE_OWNER: Readonly<Record<PhaseId, SystemId>> = {
  settleMonth: 'economy', closeYear: 'economy', techCheck: 'events', 'nationalAnnual.zones': 'zones', 'nationalAnnual.economy': 'economy',
  neighborsAnnual: 'zones', approvalSurvey: 'services', facilityAnnual: 'services', utilitiesAnnual: 'utilities', budgetWindow: 'economy', beginMonth: 'zones',
  powerScan: 'utilities', dataMaps: 'services', growthScan: 'core', trafficDecay: 'services', waterScan: 'utilities',
  census: 'zones', demand: 'zones', demographics: 'services', graphs: 'economy', milestones: 'services', scenario: 'economy', solvency: 'economy', uiRefresh: 'core',
  weatherAndDisaster: 'events', cityStatus: 'services', news: 'events' };

export type LayerName = 'XBLD' | 'XZON' | 'XUND' | 'XBIT.POWERED' | 'XBIT.WATERED' | 'XTRF' | 'XPLT' | 'XVAL' | 'XCRM' | 'XPLC' | 'XFIR' | 'XPOP' | 'XROG' | 'XMIC';
export interface PhaseIo { reads: readonly LayerName[]; bulk: readonly LayerName[]; point: readonly LayerName[]; usesPrng: boolean; canSuspend: boolean }
/** 静态 I/O 声明；dayPhases.test 断言：同日无两阶段 bulk 写同层、每层每月至多一个 bulk 写者、键集合 == PhaseId 全集。 */
export const PHASE_IO: Readonly<Record<PhaseId, PhaseIo>> = {
  settleMonth: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  closeYear: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  techCheck: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  'nationalAnnual.zones': { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  'nationalAnnual.economy': { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  neighborsAnnual: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  approvalSurvey: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  facilityAnnual: { reads: ['XMIC', 'XBLD'], bulk: ['XMIC'], point: ['XBLD'], usesPrng: true, canSuspend: false },
  utilitiesAnnual: { reads: ['XBLD'], bulk: [], point: ['XBLD', 'XMIC'], usesPrng: true, canSuspend: false },   // XMIC：电厂年龄 / 负载写进已链接记录（+1 / +4..5），与 exportTo 一致（INT-A）
  budgetWindow: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  beginMonth: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  powerScan: { reads: ['XBLD', 'XUND', 'XBIT.POWERED'], bulk: ['XBIT.POWERED'], point: [], usesPrng: true, canSuspend: false },
  dataMaps: { reads: ['XBLD', 'XZON', 'XBIT.POWERED', 'XTRF', 'XPLT', 'XCRM', 'XPOP', 'XROG'], bulk: ['XPLT', 'XVAL', 'XPLC', 'XFIR', 'XPOP', 'XROG', 'XCRM'], point: [], usesPrng: false, canSuspend: false },
  growthScan: { reads: ['XBLD', 'XZON', 'XUND', 'XBIT.POWERED', 'XBIT.WATERED', 'XVAL', 'XCRM', 'XPLT'], bulk: [], point: ['XBLD', 'XZON', 'XTRF', 'XMIC'], usesPrng: true, canSuspend: false },
  trafficDecay: { reads: ['XTRF'], bulk: ['XTRF'], point: [], usesPrng: false, canSuspend: false },
  waterScan: { reads: ['XUND', 'XBIT.POWERED', 'XBIT.WATERED'], bulk: ['XBIT.WATERED'], point: [], usesPrng: false, canSuspend: false },
  census: { reads: ['XBLD', 'XZON', 'XMIC'], bulk: [], point: [], usesPrng: false, canSuspend: false },
  demand: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  demographics: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  graphs: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  milestones: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  scenario: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  solvency: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  uiRefresh: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  weatherAndDisaster: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  cityStatus: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  news: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: true } };   // newspaper / extraPaper 模态可挂起

/**
 * System.endOfDay 的静态 I/O 声明：只有在此声明的系统才会被 core 在日末调用（按 SYSTEM_ORDER）。dayPhases.test 断言键 ⊆ SystemId、每层每月至多一个 bulk 写者的约束把本表算作"第 25 个槽"。
 *  utilities：flush requestRescan 置的脏标志 → 即时电 / 水重扫（消费 PRNG：风 / 太阳能抽样），layerChanged('xbit')；无脏标志时必须零 PRNG 消费。
 *  zones：逐日推进 lot 计时器（phaseDays / unpoweredDays）并执行到期转换；不消费 PRNG——到期转换需要的随机选择在 growthVisit 阶段预掷（startConstruction 时即 pickBuilding 存 pendingId），瓦砾 / 废弃精灵用 hash32(age, anchor) 派生。
 */
export const END_OF_DAY_IO: Readonly<Partial<Record<SystemId, PhaseIo>>> = {
  utilities: { reads: ['XBLD', 'XUND', 'XBIT.POWERED', 'XBIT.WATERED'], bulk: ['XBIT.POWERED', 'XBIT.WATERED'], point: [], usesPrng: true, canSuspend: false },
  zones: { reads: ['XBLD', 'XZON', 'XBIT.POWERED'], bulk: [], point: ['XBLD', 'XZON'], usesPrng: false, canSuspend: false } };

export const growthStep = (day: number): number => Math.floor((day - 3) / 4);   // 0..3 → x 偏移
export const growthSubstep = (day: number): number => (day + 1) % 4;            // 0..3 → y 偏移
/** 速度 → 每天毫秒；5 = 尽可能快（受 advance 预算与 maxDaysPerFrame 约束）。 */
export const MS_PER_DAY: Readonly<Record<Speed, number>> = { 1: Infinity, 2: 480, 3: 160, 4: 40, 5: 0 };
/** 灾害 tick 与常驻物件 tick 的节奏（spec:disasters §3.2）。 */
export const DISASTER_TICK_MS: Readonly<Record<Speed, number>> = { 1: Infinity, 2: 200, 3: 100, 4: 50, 5: 25 };
export const DEFAULT_BUDGET_MS = 6, MAX_DAYS_PER_FRAME = 10;

/** createSim 注册顺序（与传入顺序无关）；也是 priv 编码顺序。 */
export const SYSTEM_ORDER: readonly SystemId[] = ['core', 'terrain', 'placement', 'utilities', 'transport', 'zones', 'services', 'economy', 'events'];
/** 生长扫描每格回调顺序（spec:economy §2.3.3）。 */
export const GROWTH_VISIT_ORDER: readonly SystemId[] = ['transport', 'zones', 'services'];
/** .SC2 导入：importFrom 调用顺序（spec:file-formats §3.4.2 第 2–9b 步；events 在 services 之前剥离 XTXT 标记）。 */
export const IMPORT_ORDER: readonly SystemId[] = ['terrain', 'core', 'zones', 'events', 'transport', 'services', 'utilities', 'economy', 'placement'];
/** 任一读档路径后 postLoad 的调用顺序（utilities 的重扫先于 services 的 cityCenter / trafficReport）。 */
export const POSTLOAD_ORDER: readonly SystemId[] = ['utilities', 'services', 'transport', 'zones', 'events', 'economy', 'placement', 'terrain', 'core'];
/** .SC2 导出：exportTo 调用顺序（events 最后合成 XTXT 与写 XTHG）。 */
export const EXPORT_ORDER: readonly SystemId[] = ['core', 'terrain', 'zones', 'transport', 'services', 'utilities', 'economy', 'events'];

/** 阶段是否在当日生效（core 调用；不生效直接跳过、不消费 PRNG）。 */
export function phaseApplies(id: PhaseId, age: number, impeachMonthly: boolean): boolean {
  const m = Math.floor((age % 300) / 25);
  switch (id) {
    case 'settleMonth': return age > 0;
    case 'closeYear': case 'budgetWindow': return m === 0 && age > 0;
    case 'techCheck': case 'nationalAnnual.zones': case 'nationalAnnual.economy': case 'neighborsAnnual':
    case 'approvalSurvey': case 'facilityAnnual': case 'utilitiesAnnual': return m === 0;
    case 'solvency': return impeachMonthly;
    default: return true;
  }
}

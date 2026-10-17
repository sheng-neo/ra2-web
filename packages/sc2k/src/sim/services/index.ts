// ===== sim/services/index.ts =====（CONTRACTS §V SimEntries.createServicesSystem；WP7）
// 服务系统：八张图层（dataMaps / trafficDecay）、交通 owner（addTraffic）、微模拟分配（allocMicrosim / freeMicrosim）、
// 里程碑（milestones）、诉求链（cityStatus）、人口学 v1（demographics）、年度微模拟（facilityAnnual）、
// sign / rename 命令、Queries.services、.SC2 往返与读档重建。无 priv：全部可由真源层重建或直接存于 CityState。
// 规格：docs/spec/services-models.md；v2 项（approvalSurvey、军事基地、巨型住区入住 / 升空、海港 / 机场生长、NIMBY）见 WORKPLAN WP7。
import type { SimEntries } from '../../contracts/entrypoints';
import type { Sc2Document } from '../../contracts/io';
import type { Diagnostic, NewCityParams, PostLoadSource, SimContext, System, TileChangeKind } from '../../contracts/system';
import { getTuning } from '../../contracts/system';
import { handleRename, handleSign } from './commands';
import { computeCityCenter, runDataMaps } from './dataMaps';
import { allocMicrosim, freeMicrosim, onBuildingTilesChanged, updateArcoCondition } from './microsim';
import { runCityStatus, runDemographics, runFacilityAnnual, runMilestones } from './phases';
import { createServicesQueries } from './queries';
import { createRuntime } from './runtime';
import { exportServices, importServices, postLoadServices } from './save';
import { addTraffic, decayTraffic, rebuildTrafficReport } from './traffic';
import { DEFAULT_SERVICES_TUNING } from './tuning';
import type { ServicesTuning } from './tuning';

export { DEFAULT_SERVICES_TUNING } from './tuning';
export type { ServicesTuning } from './tuning';

export const createServicesSystem = ((): System => {
  const rt = createRuntime();
  const tuningOf = (ctx: SimContext): ServicesTuning => getTuning(ctx, 'services', DEFAULT_SERVICES_TUNING);
  const bind = (ctx: SimContext): void => { rt.ctx = ctx; };

  const sys: System = {
    id: 'services',
    phases: {
      dataMaps(ctx) { runDataMaps(ctx, rt, tuningOf(ctx)); return 'done'; },
      trafficDecay(ctx) { decayTraffic(ctx, tuningOf(ctx)); return 'done'; },
      demographics(ctx) { runDemographics(ctx, tuningOf(ctx)); return 'done'; },
      facilityAnnual(ctx) { runFacilityAnnual(ctx, tuningOf(ctx)); return 'done'; },
      milestones(ctx) { return runMilestones(ctx, tuningOf(ctx)); },
      cityStatus(ctx) { runCityStatus(ctx, tuningOf(ctx)); return 'done'; },
    },
    commands: {
      sign: (ctx, cmd) => handleSign(ctx, tuningOf(ctx), cmd),
      rename: (ctx, cmd) => handleRename(ctx, cmd),
    },
    queries: { services: createServicesQueries(rt, tuningOf) },
    actions: {
      addTraffic: (tile, weight) => { if (rt.ctx) addTraffic(rt.ctx.state, tile, weight); },
      allocMicrosim: (tileId) => (rt.ctx ? allocMicrosim(rt.ctx, rt, tuningOf(rt.ctx), tileId) : -1),
      freeMicrosim: (slot) => { if (rt.ctx) freeMicrosim(rt.ctx, rt, slot); },
    },
    /** 生长扫描：巨型住区 TR 角位格 → 月度状况（spec:services §2.8.3）；海港 / 机场 / 军事区生长 v2。 */
    growthVisit(ctx, x, y) { updateArcoCondition(ctx, x, y); },
    /** militaryOffer：v1 无选址，接受与拒绝都记"已提案"（MISC 0x0E4C = 1，不再提案）；rewardOffer 无状态。 */
    onModalAnswer(ctx, dialog, answer) {
      if (dialog !== 'militaryOffer') return;
      ctx.state.rewards.militaryBase = 1;
      if (answer !== 0) ctx.diag.push({ level: 'info', code: 'services.militaryBaseDeferred', message: '军事基地选址为 v2 内容，本次接受按"无合适位置"处理' });
    },
    init(ctx: SimContext, _p: NewCityParams): void {
      bind(ctx);
      rt.pending = []; rt.airportTilesCache = -1;
      const t = tuningOf(ctx), s = ctx.state;
      s.maps.xrog.fill(t.xrogInitial);
      const c = computeCityCenter(s.layers.xbld);
      rt.centerHx = c.hx; rt.centerHy = c.hy;
      s.totals.centerX = c.hx * 2; s.totals.centerY = c.hy * 2;
      rebuildTrafficReport(s);
      ctx.act.layerChanged('maps');
    },
    importFrom(ctx: SimContext, doc: Sc2Document, diag: Diagnostic[]): void { bind(ctx); importServices(ctx, doc, diag); },
    exportTo(ctx: SimContext, doc: Sc2Document): void { exportServices(ctx, doc); },
    postLoad(ctx: SimContext, source: PostLoadSource): void { postLoadServices(ctx, rt, tuningOf(ctx), source); },
    onTilesChanged(ctx: SimContext, tiles: ReadonlyArray<number>, kind: TileChangeKind): void {
      if (kind === 'building') onBuildingTilesChanged(ctx, rt, tiles);
      else if (kind === 'zone') rt.airportTilesCache = -1;
    },
  };
  return sys;
}) satisfies SimEntries['createServicesSystem'];

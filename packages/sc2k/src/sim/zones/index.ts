// ===== sim/zones/index.ts =====（CONTRACTS §V：SimEntries.createZonesSystem；WP5）
// 分区生长状态机 + 人口普查 + RCI 需求 + 邻城 / 国家经济。阶段 / 回调见 phases.ts、growth.ts、timers.ts；
// priv（列式计时器）见 priv.ts；.SC2 往返见 save.ts。zones 不拥有任何命令（COMMAND_OWNER），只经阶段与 Actions 写状态。
import type { SimEntries } from '../../contracts/entrypoints';
import type { Sc2Document } from '../../contracts/io';
import type { Queries } from '../../contracts/queries';
import type { Diagnostic, NewCityParams, PostLoadSource, SimContext, System, TileChangeKind } from '../../contracts/system';
import { getTuning } from '../../contracts/system';
import { zoneTableFor } from './buildings';
import { tallyCensus } from './census';
import { growthVisit } from './growth';
import { industrialPollutionBonus, industryRatioTarget } from './industry';
import { createRuntime, lotAtAnchor } from './lots';
import type { ZonesCtx } from './lots';
import { initNational, initNeighbors, recountConnections } from './neighbors';
import { makePhases } from './phases';
import { ZONES_PRIV_VERSION, clearLotColumns, createZonesPriv, ensureZonesPriv } from './priv';
import { makeZonesQuery } from './queries';
import type { QueryBinding } from './queries';
import { exportZones, importZones } from './save';
import { dailyTimers } from './timers';
import { DEFAULT_ZONES_TUNING, INDUSTRY_COUNT } from './tuning';

export { DEFAULT_ZONES_TUNING } from './tuning';
export type { ZonesTuning } from './tuning';
export { ZONES_PRIV_VERSION, REQUEST_KEYS } from './priv';
export type { ZonesPriv } from './priv';
export { ZONES_MISC_EXT, ZONES_MISC_EXT_INTS } from './save';

function build(): System {
  let bound: { ctx: SimContext; Z: ZonesCtx; importedExt: boolean } | null = null;
  /** 绑定包：按 ctx 缓存；state.priv.zones 被读档 / 新城替换时重新拿取。 */
  const getZ = (ctx: SimContext): ZonesCtx => {
    if (!bound || bound.ctx !== ctx) {
      bound = { ctx, Z: { T: getTuning(ctx, 'zones', DEFAULT_ZONES_TUNING), tbl: zoneTableFor(ctx.catalogue), priv: ensureZonesPriv(ctx.state), rt: createRuntime() }, importedExt: false };
    } else if (ctx.state.priv.zones !== bound.Z.priv) {
      bound.Z.priv = ensureZonesPriv(ctx.state);
    }
    return bound.Z;
  };
  const binding = (): QueryBinding | null => (bound ? { state: bound.ctx.state, cat: bound.ctx.catalogue, Z: getZ(bound.ctx) } : null);
  const queries: Partial<Queries> = { zones: makeZonesQuery(binding) };

  return {
    id: 'zones',
    privVersion: ZONES_PRIV_VERSION,
    phases: makePhases(getZ),
    queries,
    growthVisit(ctx, x, y) { growthVisit(ctx, getZ(ctx), x, y); },
    /** 日末：逐日推进 lot 计时器（不消费 PRNG）。 */
    endOfDay(ctx) { dailyTimers(ctx, getZ(ctx)); },
    /** 新城：priv 清零、邻城 / 国家经济初始化（消费 PRNG）、产业比例初值、需求取空城基值。 */
    init(ctx: SimContext, p: NewCityParams): void {
      const s = ctx.state;
      s.priv.zones = createZonesPriv();
      const Z = getZ(ctx);
      Z.rt.quotaAge = -1;
      initNational(ctx, Z, p.startYear, p.difficulty);
      initNeighbors(ctx, Z, p.startYear);
      const ratio = industryRatioTarget(Z.T, p.startYear);
      for (let k = 0; k < INDUSTRY_COUNT; k++) { s.industry.ratio[k] = ratio[k]!; s.industry.demand[k] = 0; }
      s.industry.pollutionBonus = industrialPollutionBonus(Z.T, s.industry.ratio);
      s.demand.r = Z.T.emptyCityBase.r; s.demand.c = Z.T.emptyCityBase.c; s.demand.i = Z.T.emptyCityBase.i;
      s.caps.r = Z.T.capBase.r; s.caps.c = Z.T.capBase.c; s.caps.i = Z.T.capBase.i;
      s.census.workforcePctUsed = Z.T.workforcePctFallback;
    },
    importFrom(ctx: SimContext, doc: Sc2Document, diag: Diagnostic[]): void {
      const Z = getZ(ctx);
      const hasExt = importZones(ctx, Z, doc, diag);
      if (bound) bound.importedExt = hasExt;
    },
    exportTo(ctx: SimContext, doc: Sc2Document): void { getZ(ctx); exportZones(ctx, doc); },
    /**
     * 读档后：snapshot → 校验 priv（版本 / 形状不符则重建）；sc2 → priv 由 XBLD 推断（计时器归 0、pendingId 空 → 完工时按地价 hash 抽取），
     * 没有扩展块的原版存档再从真源层重算 census 与邻城连接（不消费 PRNG）。
     */
    postLoad(ctx: SimContext, source: PostLoadSource): void {
      if (source === 'sc2') ctx.state.priv.zones = createZonesPriv();
      else ensureZonesPriv(ctx.state, ctx.diag);
      const Z = getZ(ctx);
      Z.rt.quotaAge = -1; Z.rt.growsToday = 0; Z.rt.declinesToday = 0;
      if (source === 'sc2') {
        // workforcePctUsed 不进 .SC2（hash:'none'）：按 services 刚导入的 demographics 重新派生
        const s = ctx.state;
        s.census.workforcePctUsed = Math.min(100, Math.max(1, Math.floor(s.demographics.workforcePct) || Z.T.workforcePctFallback));
        if (bound && !bound.importedExt) { tallyCensus(ctx, Z); recountConnections(s, Z.T); }
      }
    },
    /** 其他系统改了建筑层（推土 / 灾害 / 放置）：不再是锚点的格清掉 lot 列，避免孤儿计时器。 */
    onTilesChanged(ctx: SimContext, tiles: ReadonlyArray<number>, kind: TileChangeKind): void {
      if (kind !== 'building') return;
      const Z = getZ(ctx), L = ctx.state.layers;
      for (const i of tiles) if (lotAtAnchor(L, Z.tbl, Z.priv, i) === null) clearLotColumns(Z.priv, i);
    },
  };
}

export const createZonesSystem = ((): System => build()) satisfies SimEntries['createZonesSystem'];

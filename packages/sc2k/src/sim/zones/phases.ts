// ===== sim/zones/phases.ts =====
// zones 拥有的阶段（PHASE_OWNER）：beginMonth（第 0 天：重算邻城连接、月计数归零，不消费 PRNG）、census / demand（第 21 天）、
// nationalAnnual.zones / neighborsAnnual（1 月第 0 天，消费 PRNG）。
import type { PhaseId } from '../../contracts/clock';
import type { PhaseRunner, SimContext } from '../../contracts/system';
import { tallyCensus } from './census';
import { computeDemand } from './demand';
import type { ZonesCtx } from './lots';
import { nationalAnnual, neighborsAnnual, recountConnections } from './neighbors';

export function makePhases(getZ: (ctx: SimContext) => ZonesCtx): Partial<Record<PhaseId, PhaseRunner>> {
  return {
    beginMonth(ctx) {
      const Z = getZ(ctx);
      recountConnections(ctx.state, Z.T);
      Z.rt.monthGrows = 0; Z.rt.monthDeclines = 0; Z.rt.monthVisits = 0;
      return 'done';
    },
    census(ctx) { tallyCensus(ctx, getZ(ctx)); return 'done'; },
    demand(ctx) { computeDemand(ctx, getZ(ctx)); return 'done'; },
    'nationalAnnual.zones'(ctx) { nationalAnnual(ctx, getZ(ctx)); return 'done'; },
    neighborsAnnual(ctx) { neighborsAnnual(ctx, getZ(ctx)); return 'done'; },
  };
}

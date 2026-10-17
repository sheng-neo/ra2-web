// ===== sim/placement/queries.ts =====
// PlacementQuery（CONTRACTS §I）：canPlace / availability / preview。全部纯读、不消费 PRNG、不写状态；绑定 ctx 之前（新城之前）保守作答。
import type { ToolId } from '../../contracts/catalogue';
import type { Command, PlacementPreview, RejectReason } from '../../contracts/commands';
import { CityMode, TILES } from '../../contracts/grid';
import type { Availability, PlaceCheck, PlacementQuery } from '../../contracts/queries';
import { OrdinanceId } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { getTuning } from '../../contracts/system';
import { checkPlacement } from './check';
import type { TileVerdict } from './check';
import { planBulldoze, planDezone, planZoneRect } from './demolish';
import { planNetwork } from './network';
import { connectionPieceAt } from './commands';
import { DEFAULT_PLACEMENT_TUNING } from './tuning';

const NUCLEAR_TOOL: ToolId = 'power.nuclear';
const EMPTY_TILES: readonly TileVerdict[] = Object.freeze([]) as readonly TileVerdict[];
const unbound = (reason: RejectReason): PlacementPreview => ({ ok: false, cost: 0, tiles: EMPTY_TILES, reason });

/**
 * 工具可用性，顺序固定：notImplemented（不在 v1 白名单 / 未知工具）→ mode → notInvented → ordinance → locked → alreadyBuilt → funds。
 * dispatch.* 的"需要警局 / 消防局 / 军事基地"不在此判定（由 events 的 dispatch 命令以 noTarget 拒绝），否则乐观桩下 54 项无法全部 enabled。
 */
export function availabilityOf(ctx: SimContext, toolId: ToolId): Availability {
  const tuning = getTuning(ctx, 'placement', DEFAULT_PLACEMENT_TUNING);
  const def = ctx.catalogue.toolById(toolId);
  if (!def || (tuning.v1Tools !== null && !tuning.v1Tools.has(toolId))) return { enabled: false, reason: 'notImplemented' };
  const mode = ctx.state.clock.mode;
  if ((def.availableIn === 'city' && mode !== CityMode.City) || (def.availableIn === 'map' && mode !== CityMode.TerrainEdit)) return { enabled: false, reason: 'mode' };
  if (def.tech && !ctx.q.tech.invented(def.tech)) return { enabled: false, reason: 'notInvented' };
  if (toolId === NUCLEAR_TOOL && ctx.q.economy.ordinance(OrdinanceId.NuclearFreeZone)) return { enabled: false, reason: 'ordinance' };
  if (def.unlock && ((ctx.state.rewards.grantedMask >>> def.unlock.rewardBit) & 1) === 0) return { enabled: false, reason: 'locked' };
  if (def.unlock?.once && def.buildingIds?.some((id) => ctx.state.counts.tile[id]! > 0)) return { enabled: false, reason: 'alreadyBuilt' };
  if (def.costUnit !== 'none' && def.cost > 0 && !ctx.q.economy.canAfford(def.cost)) return { enabled: false, reason: 'funds' };
  return { enabled: true };
}

export function previewOf(ctx: SimContext, cmd: Command): PlacementPreview {
  const tuning = getTuning(ctx, 'placement', DEFAULT_PLACEMENT_TUNING);
  switch (cmd.type) {
    case 'placeBuilding': {
      const v = checkPlacement(ctx, tuning, cmd.id, cmd.x, cmd.y);
      const out: PlacementPreview = { ok: v.ok, cost: v.cost, tiles: v.tiles, footprint: { x0: cmd.x, y0: cmd.y, size: v.size } };
      if (v.reason) out.reason = v.reason;
      return out;
    }
    case 'zoneRect': {
      const p = planZoneRect(ctx, cmd, { checkFunds: true });
      return p.reason ? { ok: p.ok, cost: p.cost, tiles: p.tiles, reason: p.reason } : { ok: p.ok, cost: p.cost, tiles: p.tiles };
    }
    case 'dezone': {
      const p = planDezone(ctx, cmd.tiles);
      const funds = p.ok && p.cost > 0 && !ctx.q.economy.canAfford(p.cost);
      const reason = funds ? 'funds' : p.reason;
      return reason ? { ok: p.ok && !funds, cost: p.cost, tiles: p.tiles, reason } : { ok: p.ok, cost: p.cost, tiles: p.tiles };
    }
    case 'bulldoze': {
      const p = planBulldoze(ctx, tuning, cmd.tiles);
      const funds = p.ok && p.cost > 0 && !ctx.q.economy.canAfford(p.cost);
      const reason = funds ? 'funds' : p.reason;
      return reason ? { ok: p.ok && !funds, cost: p.cost, tiles: p.tiles, reason } : { ok: p.ok, cost: p.cost, tiles: p.tiles };
    }
    case 'network': {
      const p = planNetwork(ctx, tuning, cmd, { checkFunds: true });
      const tiles: TileVerdict[] = p.ops.map((o) => (o.op === 'skip' ? { i: o.i, ok: false, reason: o.reason } : { i: o.i, ok: true }));
      if (!p.ok && p.reason) {
        // 整段拒绝：未逐格标注的格一律按整段原因标红
        for (const t of tiles) if (t.ok) { t.ok = false; t.reason = p.reason; }
        return { ok: false, cost: p.cost, tiles, reason: p.reason };
      }
      return { ok: p.ok, cost: p.cost, tiles };
    }
    case 'neighborConnection': {
      const piece = connectionPieceAt(ctx, cmd.at);
      const cost = cmd.accept ? tuning.neighborConnectionCost : 0;
      if (!piece) return { ok: false, cost: 0, tiles: cmd.at >= 0 && cmd.at < TILES ? [{ i: cmd.at, ok: false, reason: 'noTarget' }] : EMPTY_TILES, reason: 'noTarget' };
      const funds = cmd.accept && cost > 0 && !ctx.q.economy.canAfford(cost);
      return funds ? { ok: false, cost, tiles: [{ i: cmd.at, ok: false, reason: 'funds' }], reason: 'funds' } : { ok: true, cost, tiles: [{ i: cmd.at, ok: true }] };
    }
    case 'tunnel':
      return { ok: false, cost: 0, tiles: [{ i: cmd.at, ok: false, reason: 'notImplemented' }], reason: 'notImplemented' };
    default:
      return { ok: true, cost: 0, tiles: EMPTY_TILES };
  }
}

/** 查询对象：getCtx 在 init / postLoad 之后返回当前 ctx；之前（app 在"新城"之前渲染工具栏）以 'mode' 保守作答，不抛错。 */
export function makePlacementQuery(getCtx: () => SimContext | null): PlacementQuery {
  return {
    canPlace(id, x, y): PlaceCheck {
      const ctx = getCtx();
      if (!ctx) return { ok: false, reason: 'mode', cost: 0 };
      const v = checkPlacement(ctx, getTuning(ctx, 'placement', DEFAULT_PLACEMENT_TUNING), id, x, y);
      return v.ok ? { ok: true, cost: v.cost } : { ok: false, reason: v.reason ?? 'noTarget', cost: v.cost };
    },
    availability(toolId): Availability {
      const ctx = getCtx();
      return ctx ? availabilityOf(ctx, toolId) : { enabled: false, reason: 'mode' };
    },
    preview(cmd): PlacementPreview {
      const ctx = getCtx();
      return ctx ? previewOf(ctx, cmd) : unbound('mode');
    },
  };
}
